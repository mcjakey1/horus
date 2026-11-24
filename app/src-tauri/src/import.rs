use crate::library::{image_path_in, thumb_path_in};
use crate::model::Reference;
use image::codecs::jpeg::JpegEncoder;
use image::{DynamicImage, GenericImageView, ImageDecoder, ImageError, ImageReader, imageops};
use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use walkdir::WalkDir;

pub const MAX_BYTES: u64 = 500 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq)]
pub enum Skip {
    Unsupported(String),
    Unreadable(String),
    TooLarge(u64),
}

#[derive(Debug, Default)]
pub struct ImportReport {
    pub added: Vec<String>,
    pub duplicates: Vec<(PathBuf, String)>,
    pub skipped: Vec<(PathBuf, Skip)>,
    pub warnings: Vec<(PathBuf, String)>,
}

#[derive(Debug)]
pub struct ImportOutcome {
    pub references: Vec<Reference>,
    pub report: ImportReport,
}

const THUMB_SIZES: [u32; 2] = [256, 1024];

/// Imports files and folders (recursively) into `root`. Never touches `LibraryData`: the
/// caller appends `references` under its lock afterwards, so intake never blocks the UI.
pub fn import_paths(
    root: &Path,
    known_hashes: &HashMap<String, String>,
    paths: &[PathBuf],
) -> ImportOutcome {
    let mut out = ImportOutcome {
        references: vec![],
        report: ImportReport::default(),
    };
    let mut batch: HashMap<String, String> = HashMap::new();
    for path in paths {
        for entry in WalkDir::new(path).follow_links(true).sort_by_file_name() {
            match entry {
                Ok(e) if e.file_type().is_file() => {
                    import_one(root, known_hashes, &mut batch, e.path(), &mut out)
                }
                Ok(_) => {}
                Err(e) => {
                    let p = e.path().unwrap_or(path).to_path_buf();
                    out.report
                        .skipped
                        .push((p, Skip::Unreadable(e.to_string())));
                }
            }
        }
    }
    out
}

fn import_one(
    root: &Path,
    known: &HashMap<String, String>,
    batch: &mut HashMap<String, String>,
    src: &Path,
    out: &mut ImportOutcome,
) {
    let report = &mut out.report;
    let skip = |report: &mut ImportReport, why| report.skipped.push((src.to_path_buf(), why));
    // Size check comes before any read, so a huge file costs nothing.
    let len = match fs::metadata(src) {
        Ok(m) => m.len(),
        Err(e) => return skip(report, Skip::Unreadable(e.to_string())),
    };
    if len > MAX_BYTES {
        return skip(report, Skip::TooLarge(len));
    }
    if len == 0 {
        return skip(report, Skip::Unreadable("empty file".into()));
    }
    let hash = match hash_file(src) {
        Ok(h) => h,
        Err(e) => return skip(report, Skip::Unreadable(e.to_string())),
    };
    if let Some(id) = known.get(&hash).or_else(|| batch.get(&hash)) {
        report.duplicates.push((src.to_path_buf(), id.clone()));
        return;
    }
    match store(root, src, &hash, &mut report.warnings) {
        Ok(r) => {
            batch.insert(hash, r.id.clone());
            report.added.push(r.id.clone());
            out.references.push(r);
        }
        Err(why) => skip(report, why),
    }
}

fn hash_file(src: &Path) -> io::Result<String> {
    let mut hasher = blake3::Hasher::new();
    hasher.update_reader(fs::File::open(src)?)?;
    Ok(hasher.finalize().to_hex().to_string())
}

/// Decodes in memory first, so an unreadable file leaves nothing behind; then writes the
/// thumbnails and the byte-identical original, each through `.tmp` + rename.
fn store(
    root: &Path,
    src: &Path,
    hash: &str,
    warnings: &mut Vec<(PathBuf, String)>,
) -> Result<Reference, Skip> {
    let unreadable = |e: io::Error| Skip::Unreadable(e.to_string());
    let reader = ImageReader::open(src)
        .map_err(unreadable)?
        .with_guessed_format()
        .map_err(unreadable)?;
    let format = reader
        .format()
        .ok_or_else(|| Skip::Unsupported("unrecognised file type".into()))?;
    let mut decoder = reader.into_decoder().map_err(decode_skip)?;
    let icc = decoder.icc_profile().unwrap_or_else(|e| {
        warnings.push((
            src.to_path_buf(),
            format!("could not read ICC profile: {e}"),
        ));
        None
    });
    let img = DynamicImage::from_decoder(decoder).map_err(decode_skip)?;
    let (width, height) = img.dimensions();
    let mut rgba = img.into_rgba8();
    if let Some(icc) = icc
        && let Err(why) = to_srgb(&icc, &mut rgba)
    {
        warnings.push((src.to_path_buf(), why));
    }
    // ponytail: alpha is dropped, not composited; transparent areas show their stored RGB.
    let rgb = DynamicImage::ImageRgba8(rgba).into_rgb8();

    let file = format!("{hash}.{}", format.extensions_str()[0]);
    let image_dst = image_path_in(root, &file);
    let written = THUMB_SIZES
        .iter()
        .try_for_each(|&size| {
            let (tw, th) = fit(width, height, size);
            let small;
            let thumb = if (tw, th) == (width, height) {
                &rgb
            } else {
                small = imageops::thumbnail(&rgb, tw, th);
                &small
            };
            write_atomic(&thumb_path_in(root, hash, size), |tmp| {
                let w = io::BufWriter::new(fs::File::create(tmp)?);
                JpegEncoder::new_with_quality(w, 90)
                    .encode_image(thumb)
                    .map_err(io::Error::other)
            })
        })
        .and_then(|()| write_atomic(&image_dst, |tmp| fs::copy(src, tmp).map(drop)));
    if let Err(e) = written {
        for size in THUMB_SIZES {
            let _ = fs::remove_file(thumb_path_in(root, hash, size));
        }
        let _ = fs::remove_file(&image_dst);
        return Err(Skip::Unreadable(format!(
            "could not write to the library: {e}"
        )));
    }

    let since_epoch = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    Ok(Reference {
        id: hash.to_string(),
        title: src
            .file_stem()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default(),
        creator: None,
        year: None,
        source_url: None,
        credit: None,
        note: None,
        file,
        hash: hash.to_string(),
        width,
        height,
        added_at: iso_utc(since_epoch.as_secs()),
        tags: vec![],
    })
}

fn decode_skip(e: ImageError) -> Skip {
    match e {
        ImageError::Unsupported(_) => Skip::Unsupported(e.to_string()),
        _ => Skip::Unreadable(e.to_string()),
    }
}

/// Converts RGBA8 in place to sRGB. On any failure the pixels are left untouched.
fn to_srgb(icc: &[u8], rgba: &mut [u8]) -> Result<(), String> {
    // qcms debug-asserts on non-RGB profiles given RGBA data, so only hand it RGB ones.
    if icc.get(16..20) != Some(b"RGB ") {
        return Err("ICC profile is not an RGB profile; colours left unconverted".into());
    }
    let src = qcms::Profile::new_from_slice(icc, false)
        .ok_or("ICC profile could not be parsed; colours left unconverted")?;
    let mut srgb = qcms::Profile::new_sRGB();
    srgb.precache_output_transform();
    let t = qcms::Transform::new(&src, &srgb, qcms::DataType::RGBA8, qcms::Intent::Perceptual)
        .ok_or("ICC profile could not be converted to sRGB; colours left unconverted")?;
    t.apply(rgba);
    Ok(())
}

/// Longest side at most `size`; never upscales.
fn fit(w: u32, h: u32, size: u32) -> (u32, u32) {
    let long = w.max(h);
    if long <= size {
        return (w, h);
    }
    let scale = |v: u32| {
        ((u64::from(v) * u64::from(size) + u64::from(long) / 2) / u64::from(long)).max(1) as u32
    };
    (scale(w), scale(h))
}

/// Writes `dst` through `dst.tmp` + rename, so a failure never leaves a partial file.
fn write_atomic(dst: &Path, write: impl FnOnce(&Path) -> io::Result<()>) -> io::Result<()> {
    if let Some(dir) = dst.parent() {
        fs::create_dir_all(dir)?;
    }
    let mut tmp = dst.as_os_str().to_owned();
    tmp.push(".tmp");
    let tmp = PathBuf::from(tmp);
    let result = write(&tmp).and_then(|()| fs::rename(&tmp, dst));
    if result.is_err() {
        let _ = fs::remove_file(&tmp);
    }
    result
}

/// `YYYY-MM-DDTHH:MM:SSZ` from Unix seconds (Howard Hinnant's civil-from-days).
fn iso_utc(secs: u64) -> String {
    let (days, rem) = ((secs / 86_400) as i64, secs % 86_400);
    let z = days + 719_468;
    let era = z / 146_097;
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        rem / 3600,
        rem / 60 % 60,
        rem % 60
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name)
    }

    fn import(root: &Path, paths: &[PathBuf]) -> ImportOutcome {
        import_paths(root, &HashMap::new(), paths)
    }

    #[test]
    fn imports_and_thumbs() {
        let dir = tempfile::tempdir().unwrap();
        let out = import(dir.path(), &[fixture("small.jpg")]);
        assert_eq!(out.references.len(), 1);
        let r = &out.references[0];
        assert_eq!((r.width, r.height), (64, 48));
        assert_eq!(r.id, r.hash);
        assert_eq!(r.file, format!("{}.jpg", r.hash));
        assert_eq!(r.title, "small");
        assert!(r.tags.is_empty());
        assert!(r.added_at.ends_with('Z') && r.added_at.len() == 20);
        assert_eq!(out.report.added, vec![r.id.clone()]);
        assert_eq!(
            fs::read(image_path_in(dir.path(), &r.file)).unwrap(),
            fs::read(fixture("small.jpg")).unwrap()
        );
        for size in [256, 1024] {
            let thumb = image::open(thumb_path_in(dir.path(), &r.hash, size)).unwrap();
            // never upscaled
            assert_eq!((thumb.width(), thumb.height()), (64, 48));
        }
    }

    #[test]
    fn thumbs_downscale_keeping_aspect() {
        let dir = tempfile::tempdir().unwrap();
        let src = dir.path().join("wide.png");
        image::RgbImage::new(1000, 500).save(&src).unwrap();
        let out = import(dir.path(), &[src]);
        let hash = &out.references[0].hash;
        let t = image::open(thumb_path_in(dir.path(), hash, 256)).unwrap();
        assert_eq!((t.width(), t.height()), (256, 128));
        let t = image::open(thumb_path_in(dir.path(), hash, 1024)).unwrap();
        assert_eq!((t.width(), t.height()), (1000, 500));
    }

    #[test]
    fn dedupes_same_bytes() {
        let dir = tempfile::tempdir().unwrap();
        let copy = dir.path().join("copy_of_small.jpg");
        fs::copy(fixture("small.jpg"), &copy).unwrap();
        let out = import(dir.path(), &[fixture("small.jpg"), copy.clone()]);
        assert_eq!(out.references.len(), 1);
        let id = out.references[0].id.clone();
        assert_eq!(out.report.added, vec![id.clone()]);
        assert_eq!(out.report.duplicates, vec![(copy, id.clone())]);

        let known = HashMap::from([(id, "existing".to_string())]);
        let again = import_paths(dir.path(), &known, &[fixture("small.jpg")]);
        assert!(again.references.is_empty());
        assert_eq!(
            again.report.duplicates,
            vec![(fixture("small.jpg"), "existing".to_string())]
        );
    }

    #[test]
    fn skips_with_reasons() {
        let dir = tempfile::tempdir().unwrap();
        let out = import(
            dir.path(),
            &[
                fixture("fake.psd"),
                fixture("empty.jpg"),
                fixture("small.jpg"),
            ],
        );
        assert_eq!(out.report.added.len(), 1);
        assert_eq!(out.report.skipped.len(), 2);
        let (p, why) = &out.report.skipped[0];
        assert_eq!(p, &fixture("fake.psd"));
        assert!(matches!(why, Skip::Unsupported(_) | Skip::Unreadable(_)));
        let (p, why) = &out.report.skipped[1];
        assert_eq!(p, &fixture("empty.jpg"));
        assert!(matches!(why, Skip::Unreadable(_)));
        let files: Vec<_> = fs::read_dir(dir.path().join("images")).unwrap().collect();
        assert_eq!(files.len(), 1);
    }

    #[test]
    fn too_large_is_skipped_without_reading() {
        let dir = tempfile::tempdir().unwrap();
        let big = dir.path().join("big.jpg");
        fs::File::create(&big)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        let out = import(dir.path(), std::slice::from_ref(&big));
        assert_eq!(
            out.report.skipped,
            vec![(big, Skip::TooLarge(MAX_BYTES + 1))]
        );
        assert!(out.references.is_empty());
    }

    #[test]
    fn icc_converted_to_srgb() {
        let dir = tempfile::tempdir().unwrap();
        let out = import(dir.path(), &[fixture("p3_red.png")]);
        assert!(out.report.warnings.is_empty(), "{:?}", out.report.warnings);
        let r = &out.references[0];
        let thumb = image::open(thumb_path_in(dir.path(), &r.hash, 256))
            .unwrap()
            .to_rgb8();
        let [red, g, b] = thumb.get_pixel(32, 32).0;
        assert!(red >= 252 && g > 0 && b > 0, "{:?}", (red, g, b));
        // The fixture is P3 (255, 70, 70); LittleCMS converts it to sRGB (255, 41, 58).
        // Unconverted it would read (255, 70, 70). The tolerance covers JPEG rounding.
        assert!(
            g.abs_diff(41) <= 4 && b.abs_diff(58) <= 4,
            "{:?}",
            (red, g, b)
        );
        assert_eq!(
            fs::read(image_path_in(dir.path(), &r.file)).unwrap(),
            fs::read(fixture("p3_red.png")).unwrap()
        );
    }

    #[test]
    fn bad_icc_falls_back() {
        let dir = tempfile::tempdir().unwrap();
        let out = import(dir.path(), &[fixture("bad_icc.png")]);
        assert_eq!(out.references.len(), 1);
        assert_eq!(out.report.warnings.len(), 1);
        assert_eq!(out.report.warnings[0].0, fixture("bad_icc.png"));
        // Rejected by qcms itself, not by the RGB-header guard.
        assert!(out.report.warnings[0].1.contains("could not be parsed"));
        let r = &out.references[0];
        assert!(thumb_path_in(dir.path(), &r.hash, 256).is_file());
    }

    #[test]
    fn folder_import_recurses_unicode() {
        let dir = tempfile::tempdir().unwrap();
        let sub = dir.path().join("Été").join("sub");
        fs::create_dir_all(&sub).unwrap();
        fs::copy(fixture("small.jpg"), sub.join("small.jpg")).unwrap();
        let lib = dir.path().join("lib");
        let out = import(&lib, &[dir.path().join("Été")]);
        assert_eq!(out.references.len(), 1);
        assert!(out.report.skipped.is_empty());
    }

    #[test]
    fn iso_utc_formats() {
        assert_eq!(iso_utc(0), "1970-01-01T00:00:00Z");
        assert_eq!(iso_utc(951_825_600), "2000-02-29T12:00:00Z");
        assert_eq!(iso_utc(1_796_000_523), "2026-11-30T01:02:03Z");
    }
}
