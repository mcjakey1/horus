//! The SigLIP encoder on ONNX Runtime: preprocessing, tokenizer, sessions.
//!
//! Load rules (Task 0): `ort_lib` is an absolute path to the bundled library; no `ort` call is made
//! before `ort::init_from` has succeeded (an earlier call loads `onnxruntime.dll` by bare name and
//! panics, or loads Windows' own 1.17.1); `LoadDynamicError` maps to a `String`; one environment
//! per process.

use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use ort::environment::Environment;
use ort::session::Session;
use tokenizers::Tokenizer;

use super::model::ModelSpec;

pub trait Embedder: Send {
    fn image(&mut self, rgb: &image::RgbImage) -> Result<Vec<f32>, String>;
    fn text(&mut self, q: &str) -> Result<Vec<f32>, String>;
    fn dim(&self) -> usize;
}

#[derive(Debug)]
pub enum LoadError {
    /// The ORT library or its environment.
    Lib(String),
    /// The .onnx files, the tokenizer or the layout.
    Model(String),
}

pub struct SiglipEncoder {
    vision: Session,
    vision_in: String,
    vision_out: String,
    /// Loaded on the first `text()` call: only typed queries need it (R18).
    text: Option<(Session, String, String)>,
    text_path: PathBuf,
    intra_threads: usize,
    tokenizer: Tokenizer,
    spec: &'static ModelSpec,
}

/// Side length of the square model input.
const SIDE: u32 = 224;

/// Kept alive for the whole process: ort holds only a `Weak`, and `build()` may run only once.
static ENV: OnceLock<Environment> = OnceLock::new();
/// Serializes the first init so `build()` runs at most once.
static ENV_INIT: Mutex<()> = Mutex::new(());

/// The process-wide environment, created once with telemetry off (R2).
fn environment(ort_lib: &Path) -> Result<&'static Environment, LoadError> {
    if let Some(env) = ENV.get() {
        return Ok(env);
    }
    let _init = ENV_INIT.lock().unwrap_or_else(|p| p.into_inner());
    if let Some(env) = ENV.get() {
        return Ok(env);
    }
    if !ort_lib.is_absolute() {
        return Err(LoadError::Lib(format!("not an absolute path: {}", ort_lib.display())));
    }
    // `LoadDynamicError` becomes a String here: no `ort` call before init_from succeeded.
    let builder = ort::init_from(ort_lib).map_err(|e| LoadError::Lib(e.to_string()))?;
    let env = builder.with_telemetry(false).build().map_err(|e| LoadError::Lib(e.to_string()))?;
    Ok(ENV.get_or_init(|| env))
}

fn model_err(e: impl std::fmt::Display) -> LoadError {
    LoadError::Model(e.to_string())
}

fn layout(what: &str) -> LoadError {
    LoadError::Model(format!("Model layout not recognised: {what}"))
}

/// The model file whose path contains `part` (the table in `model.rs`).
fn model_file(dir: &Path, spec: &ModelSpec, part: &str) -> Result<PathBuf, LoadError> {
    spec.files
        .iter()
        .find(|f| f.path.contains(part))
        .map(|f| dir.join(f.path))
        .ok_or_else(|| layout(&format!("no {part} file in the model table")))
}

fn open_session(env: &Environment, path: &Path, intra_threads: usize) -> Result<Session, LoadError> {
    Session::builder(env)
        .map_err(model_err)?
        .with_intra_threads(intra_threads)
        .map_err(model_err)?
        .commit_from_file(path)
        .map_err(model_err)
}

/// Dims of a tensor outlet, or a layout error.
fn dims<'a>(o: &'a ort::value::Outlet, what: &str) -> Result<&'a [i64], LoadError> {
    o.dtype()
        .tensor_shape()
        .map(|s| &s[..])
        .ok_or_else(|| layout(&format!("{what} `{}` is not a tensor", o.name())))
}

/// A dim matches when it is `want` or dynamic (negative).
fn dim_ok(d: i64, want: i64) -> bool {
    d == want || d < 0
}

/// The single input's name, after checking its shape is `[batch, rest...]`.
fn input_name(s: &Session, rest: &[i64]) -> Result<String, LoadError> {
    let [input] = s.inputs() else {
        return Err(layout(&format!("{} inputs, expected 1", s.inputs().len())));
    };
    let d = dims(input, "input")?;
    if d.len() != rest.len() + 1 || !d[1..].iter().zip(rest).all(|(&a, &b)| dim_ok(a, b)) {
        return Err(layout(&format!("input `{}` has shape {d:?}", input.name())));
    }
    Ok(input.name().to_string())
}

/// The output ending in `preferred` (else `pooler_output`), checked to be `[batch, dim]`.
fn output_name(s: &Session, preferred: &str, dim: usize) -> Result<String, LoadError> {
    let out = s
        .outputs()
        .iter()
        .find(|o| o.name().ends_with(preferred))
        .or_else(|| s.outputs().iter().find(|o| o.name().ends_with("pooler_output")))
        .ok_or_else(|| layout(&format!("no `{preferred}` or `pooler_output` output")))?;
    let d = dims(out, "output")?;
    if d.len() != 2 || d[1] != dim as i64 {
        return Err(layout(&format!("output `{}` has shape {d:?}", out.name())));
    }
    Ok(out.name().to_string())
}

impl SiglipEncoder {
    pub fn load(ort_lib: &Path, dir: &Path, spec: &'static ModelSpec, intra_threads: usize) -> Result<Self, LoadError> {
        let env = environment(ort_lib)?;
        let vision = open_session(env, &model_file(dir, spec, "vision_model")?, intra_threads)?;
        let side = i64::from(SIDE);
        let vision_in = input_name(&vision, &[3, side, side])?;
        let vision_out = output_name(&vision, "image_embeds", spec.dim)?;
        let tokenizer = Tokenizer::from_file(model_file(dir, spec, "tokenizer.json")?).map_err(model_err)?;
        Ok(Self {
            vision,
            vision_in,
            vision_out,
            text: None,
            text_path: model_file(dir, spec, "text_model")?,
            intra_threads,
            tokenizer,
            spec,
        })
    }
}

/// Runs a one-input session and returns its L2-normalised `[1, dim]` output.
fn embed(s: &mut Session, input: &str, output: &str, value: ort::value::DynValue, dim: usize) -> Result<Vec<f32>, String> {
    let outputs = s.run(ort::inputs![input => value]).map_err(|e| e.to_string())?;
    let (_, data) = outputs[output].try_extract_tensor::<f32>().map_err(|e| e.to_string())?;
    if data.len() != dim {
        return Err(format!("output has {} values, expected {dim}", data.len()));
    }
    let mut v = data.to_vec();
    l2(&mut v);
    Ok(v)
}

impl Embedder for SiglipEncoder {
    fn image(&mut self, rgb: &image::RgbImage) -> Result<Vec<f32>, String> {
        let side = SIDE as usize;
        let x = ort::value::Tensor::from_array(([1usize, 3, side, side], preprocess(rgb))).map_err(|e| e.to_string())?;
        embed(&mut self.vision, &self.vision_in, &self.vision_out, x.into_dyn(), self.spec.dim)
    }

    fn text(&mut self, q: &str) -> Result<Vec<f32>, String> {
        if self.text.is_none() {
            // ENV is set: `load` succeeded before this could be called.
            let env = ENV.get().ok_or("ONNX Runtime is not initialised")?;
            let s = open_session(env, &self.text_path, self.intra_threads).map_err(|e| format!("{e:?}"))?;
            let input = input_name(&s, &[self.spec.text_len as i64]).map_err(|e| format!("{e:?}"))?;
            let output = output_name(&s, "text_embeds", self.spec.dim).map_err(|e| format!("{e:?}"))?;
            self.text = Some((s, input, output));
        }
        let ids = tokenize(&self.tokenizer, self.spec, q);
        let x = ort::value::Tensor::from_array(([1usize, ids.len()], ids)).map_err(|e| e.to_string())?;
        let dim = self.spec.dim;
        let (s, input, output) = self.text.as_mut().expect("loaded above");
        embed(s, input, output, x.into_dyn(), dim)
    }

    fn dim(&self) -> usize {
        self.spec.dim
    }
}

/// 1×3×224×224, NCHW: squash-resize to 224×224 (bicubic, no crop), x/255, (x−0.5)/0.5 (C5).
pub fn preprocess(img: &image::RgbImage) -> Vec<f32> {
    // ponytail: CatmullRom is the a = -0.5 cubic, the same kernel as PIL's BICUBIC (`resample: 3`).
    let small = image::imageops::resize(img, SIDE, SIDE, image::imageops::FilterType::CatmullRom);
    let plane = (SIDE * SIDE) as usize;
    let mut out = vec![0f32; 3 * plane];
    for (i, px) in small.pixels().enumerate() {
        for c in 0..3 {
            out[c * plane + i] = (f32::from(px[c]) / 255.0 - 0.5) / 0.5;
        }
    }
    out
}

/// Lowercased (when the spec says so), then padded or truncated to `spec.text_len` with `spec.pad_id`.
pub fn tokenize(tok: &Tokenizer, spec: &ModelSpec, q: &str) -> Vec<i64> {
    let q = if spec.lowercase { q.to_lowercase() } else { q.to_string() };
    // Encoded without special tokens, then `</s>` added by hand, so truncation keeps it last.
    // ponytail: SigLIP's `</s>` and pad are the same id (1); a model where they differ needs an eos_id.
    let mut ids: Vec<i64> = tok
        .encode(q.as_str(), false)
        .map(|e| e.get_ids().iter().map(|&id| i64::from(id)).collect())
        .unwrap_or_default();
    ids.truncate(spec.text_len - 1);
    ids.resize(spec.text_len, spec.pad_id);
    ids
}

/// In place; an all-zero vector stays zero.
pub fn l2(v: &mut [f32]) {
    let n = v.iter().map(|x| x * x).sum::<f32>().sqrt();
    if n > 0.0 {
        v.iter_mut().for_each(|x| *x /= n);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::similar::model::SIGLIP_B16_Q8;
    use std::str::FromStr;

    const FIX: &str = concat!(env!("CARGO_MANIFEST_DIR"), "/tests/fixtures/similar");

    /// A tiny word-level stand-in for SigLIP's tokenizer: no lowercasing, `</s>` = 1, like the real one.
    fn tiny_tokenizer() -> Tokenizer {
        Tokenizer::from_str(
            r#"{"version":"1.0","truncation":null,"padding":null,"added_tokens":[],
                "normalizer":null,"pre_tokenizer":{"type":"Whitespace"},"post_processor":null,"decoder":null,
                "model":{"type":"WordLevel","vocab":{"</s>":1,"<unk>":2,"a":3,"cat":4,"word":5},"unk_token":"<unk>"}}"#,
        )
        .unwrap()
    }

    #[test]
    fn preprocess_shape_and_squash() {
        let img = image::open(format!("{FIX}/red_blue_300x200.png")).unwrap().to_rgb8();
        assert_eq!(img.dimensions(), (300, 200));
        let x = preprocess(&img);
        assert_eq!(x.len(), 3 * 224 * 224);
        let at = |c: usize, y: usize, px: usize| x[c * 224 * 224 + y * 224 + px];
        for y in [0, 112, 223] {
            assert!((at(0, y, 0) - 1.0).abs() < 1e-3, "red at x 0: {}", at(0, y, 0));
            assert!((at(0, y, 223) + 1.0).abs() < 1e-3, "no red at x 223: {}", at(0, y, 223));
            assert!((at(2, y, 0) + 1.0).abs() < 1e-3);
            assert!((at(2, y, 223) - 1.0).abs() < 1e-3);
        }
    }

    #[test]
    fn tokenize_lowercases_pads_truncates() {
        let tok = tiny_tokenizer();
        let s = &SIGLIP_B16_Q8;
        let a = tokenize(&tok, s, "A Cat");
        assert_eq!(a, tokenize(&tok, s, "a cat"));
        assert_eq!(a.len(), 64);
        assert_eq!(&a[..3], &[3, 4, 1]);
        assert!(a[2..].iter().all(|&id| id == 1));
        let long = vec!["word"; 200].join(" ");
        let b = tokenize(&tok, s, &long);
        assert_eq!(b.len(), 64);
        assert_eq!(*b.last().unwrap(), 1);
        assert!(b[..63].iter().all(|&id| id == 5));
    }

    #[test]
    fn l2_unit() {
        let mut v = vec![3.0, 4.0, 0.0, -12.0];
        l2(&mut v);
        let n: f32 = v.iter().map(|x| x * x).sum::<f32>().sqrt();
        assert!((n - 1.0).abs() < 1e-6, "{n}");
        let mut z = vec![0.0f32; 8];
        l2(&mut z);
        assert!(z.iter().all(|x| *x == 0.0));
    }

    #[test]
    fn load_rejects_missing_lib() {
        // Relies on ENV still being empty: never run with `--include-ignored` (see the plan).
        let dir = tempfile::tempdir().unwrap();
        let missing = dir.path().join("nope").join("onnxruntime.dll");
        let r = SiglipEncoder::load(&missing, dir.path(), &SIGLIP_B16_Q8, 2);
        assert!(matches!(r, Err(LoadError::Lib(_))), "{:?}", r.err());
        // A bare name would let Windows pick System32's own ORT: refused before loading anything.
        let r = SiglipEncoder::load(Path::new("onnxruntime.dll"), dir.path(), &SIGLIP_B16_Q8, 2);
        assert!(matches!(r, Err(LoadError::Lib(_))), "{:?}", r.err());
    }

    #[test]
    fn ort_pins_match_plan() {
        let script = include_str!("../../../scripts/fetch-ort.mjs");
        // Task 0's pin table: the nupkg and the three binaries.
        for (size, sha) in [
            ("159626394", "6871ccbc97f3d5bdb4095a1dcec33aa78d56f6ed8de5980ef5fa1d9f2e7c679a"),
            ("17253728", "cb2fa518b18356617f6f9f460c012501da2819ec7e5c1d80bd8f5de20492db0c"),
            ("44830288", "2685dc296147c47b0dbd8e0615547b12fc0c445d158d1f374cbd0705d9626fdc"),
            ("29345384", "a96f132e5eb5ca04e23a7d2fc1078fb95aa591e8d71d0f237702ece3a1e0f4ea"),
        ] {
            assert!(script.contains(&format!("size: {size}")), "size {size}");
            assert!(script.contains(sha), "sha {sha}");
        }
        assert!(script.contains(r#"const VERSION = "1.31.1";"#));
    }

    #[test]
    fn telemetry_off_source_check() {
        let src = include_str!("encoder.rs");
        let code = src.split("#[cfg(test)]").next().unwrap();
        assert!(code.contains(".with_telemetry(false)"));
        assert!(code.contains("static ENV: OnceLock<Environment>"));
        assert!(!code.contains("ort::Error::new"), "an ort::Error before init_from loads ORT by bare name");
        assert!(!code.contains("Error::wrap"));
    }

    fn env_path(var: &str) -> Option<PathBuf> {
        std::env::var_os(var).filter(|v| !v.is_empty()).map(PathBuf::from)
    }

    #[test]
    #[ignore = "needs HORUS_ORT_LIB (npm run fetch:ort) and a hand-downloaded HORUS_SIGLIP_DIR"]
    fn real_model_semantics() {
        let lib = env_path("HORUS_ORT_LIB").expect("HORUS_ORT_LIB");
        let dir = env_path("HORUS_SIGLIP_DIR").expect("HORUS_SIGLIP_DIR");
        let mut enc = SiglipEncoder::load(&lib, &dir, &SIGLIP_B16_Q8, 2).unwrap();
        let cat = enc.image(&image::open(format!("{FIX}/cat.jpg")).unwrap().to_rgb8()).unwrap();
        let dog = enc.image(&image::open(format!("{FIX}/dog.jpg")).unwrap().to_rgb8()).unwrap();
        let t = enc.text("a photo of a cat").unwrap();
        assert_eq!((cat.len(), t.len()), (768, 768));
        let dot = |a: &[f32], b: &[f32]| a.iter().zip(b).map(|(x, y)| x * y).sum::<f32>();
        eprintln!("cat {} dog {}", dot(&t, &cat), dot(&t, &dog));
        assert!(dot(&t, &cat) > dot(&t, &dog));
    }

    #[test]
    #[ignore = "needs HORUS_ORT_LIB (npm run fetch:ort)"]
    fn load_rejects_garbage_model() {
        let lib = env_path("HORUS_ORT_LIB").expect("HORUS_ORT_LIB");
        let dir = tempfile::tempdir().unwrap();
        for f in SIGLIP_B16_Q8.files {
            let p = dir.path().join(f.path);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            let junk: Vec<u8> = (0..4096u32).map(|i| (i.wrapping_mul(2_654_435_761) >> 13) as u8).collect();
            std::fs::write(p, junk).unwrap();
        }
        let r = SiglipEncoder::load(&lib, dir.path(), &SIGLIP_B16_Q8, 2);
        assert!(matches!(r, Err(LoadError::Model(_))), "{:?}", r.err());
    }
}
