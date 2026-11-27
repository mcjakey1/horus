//! The pinned model artifact table.

use std::path::{Path, PathBuf};

pub struct ModelFile {
    pub path: &'static str,
    pub size: u64,
    pub sha256: &'static str,
}

pub struct ModelSpec {
    pub id: &'static str,
    pub base: &'static str,
    pub repo: &'static str,
    pub revision: &'static str,
    pub files: &'static [ModelFile],
    pub dim: usize,
    pub text_len: usize,
    pub pad_id: i64,
    pub lowercase: bool,
    pub sim_min_image: f32,
    pub sim_min_text: f32,
}

/// Google SigLIP base, patch 16, 224 px, int8 ONNX export (`Xenova/siglip-base-patch16-224`).
/// Sizes and SHA-256 from the Hugging Face LFS metadata at the pinned revision.
pub const SIGLIP_B16_Q8: ModelSpec = ModelSpec {
    id: "siglip-b16-224-q8",
    base: "https://huggingface.co",
    repo: "Xenova/siglip-base-patch16-224",
    revision: "4649052661e53c7000355844105f8a1792088239",
    files: &[
        ModelFile {
            path: "onnx/vision_model_quantized.onnx",
            size: 99_499_129,
            sha256: "ef14a954f3d57e1806666432bd9785004c1dc27100aa260eee0cb0f10a5de058",
        },
        ModelFile {
            path: "onnx/text_model_quantized.onnx",
            size: 111_475_220,
            sha256: "ad0329b1f35acc66d8953ff2559ce358da8eb0a7011794cf951523d63a4dbce2",
        },
        ModelFile {
            path: "tokenizer.json",
            size: 2_398_744,
            sha256: "4a17c975210be5ab4c36b47d8dae4eefb866dbfb1e676e394aad85dc30a3ae08",
        },
    ],
    dim: 768,
    text_len: 64,
    pad_id: 1,
    lowercase: true,
    // Provisional; Task 8 calibrates both on the demo set.
    sim_min_image: 0.5,
    sim_min_text: 0.03,
};

/// Written last, after every file passed its SHA-256 check.
pub(crate) const OK_MARKER: &str = ".ok";

impl ModelSpec {
    /// `{base}/{repo}/resolve/{revision}/{path}`
    pub fn url(&self, f: &ModelFile) -> String {
        format!(
            "{}/{}/resolve/{}/{}",
            self.base, self.repo, self.revision, f.path
        )
    }

    pub fn total_bytes(&self) -> u64 {
        self.files.iter().map(|f| f.size).sum()
    }
}

/// `app_local_data/models/<id>`: once per user, shared across libraries.
pub fn model_dir(app_local_data: &Path, spec: &ModelSpec) -> PathBuf {
    app_local_data.join("models").join(spec.id)
}

/// The `.ok` marker is present and every file is in place with its pinned size.
pub fn is_installed(dir: &Path, spec: &ModelSpec) -> bool {
    dir.join(OK_MARKER).is_file()
        && spec.files.iter().all(|f| {
            std::fs::metadata(dir.join(f.path)).is_ok_and(|m| m.is_file() && m.len() == f.size)
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_is_pinned() {
        let s = &SIGLIP_B16_Q8;
        assert_eq!(s.base, "https://huggingface.co");
        assert_eq!(s.id, "siglip-b16-224-q8");
        assert_eq!(
            (s.dim, s.text_len, s.pad_id, s.lowercase),
            (768, 64, 1, true)
        );
        for f in s.files {
            let url = s.url(f);
            assert!(url.starts_with("https://huggingface.co/"), "{url}");
            assert!(
                url.contains("/resolve/4649052661e53c7000355844105f8a1792088239/"),
                "{url}"
            );
            assert!(url.ends_with(f.path), "{url}");
            assert_eq!(f.sha256.len(), 64, "{}", f.path);
            assert!(
                f.sha256
                    .bytes()
                    .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b)),
                "{}",
                f.path
            );
        }
        assert_eq!(s.total_bytes(), 213_373_093);
        assert!((150_000_000..=350_000_000).contains(&s.total_bytes()));
    }

    #[test]
    fn model_dir_is_per_model_under_models() {
        let d = model_dir(Path::new("/x"), &SIGLIP_B16_Q8);
        assert_eq!(d, Path::new("/x").join("models").join("siglip-b16-224-q8"));
    }
}
