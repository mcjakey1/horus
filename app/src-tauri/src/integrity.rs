//! Plan 6 Task 2: what a library open checks on disk. The startup `.tmp` sweep, the existence
//! report (orphans, missing originals and thumbnails, a damaged taxonomy backup), the
//! thumbnail rebuild, orphan recovery and the on-demand hash check.
//!
//! The sweep runs under the import gate (and, in `open_library`, the state lock): every library
//! writer is excluded by one of the two, and Plan 5's indexer file is skipped by name.

use crate::import::{decode_srgb, iso_utc, on_white, write_thumbs};
use crate::library::{Library, image_path_in, images_dir, thumb_path_in};
use crate::model::Reference;
use crate::taxonomy::Taxonomy;
use serde::Serialize;
use std::collections::HashSet;
use std::fs;
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

/// Plan 5's indexer writes this while it runs; `write_atomic` clears its own leftover.
const INDEXER_TMP: &str = "embeddings.bin.tmp";

#[derive(Serialize, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct IntegrityReport {
    /// Removed.
    pub swept_tmp: Vec<PathBuf>,
    /// Reference ids whose `images/<file>` is gone. Never deleted from library.json.
    pub missing_originals: Vec<String>,
    /// Reference ids with an original but a missing thumbnail: rebuilt after the open (B3).
    pub missing_thumbs: Vec<String>,
    /// `images/<hash>.<ext>` files no reference points to.
    pub orphans: Vec<PathBuf>,
    /// `taxonomy.bak.json` is there but does not load or validate. Reported, never deleted.
    pub taxonomy_backup_invalid: bool,
}

impl IntegrityReport {
    /// Anything the artist should hear about, or the rebuild should do.
    pub fn found_anything(&self) -> bool {
        !self.swept_tmp.is_empty()
            || !self.missing_originals.is_empty()
            || !self.missing_thumbs.is_empty()
            || !self.orphans.is_empty()
            || self.taxonomy_backup_invalid
    }
}

fn is_tmp(name: &str) -> bool {
    name != INDEXER_TMP && (name.ends_with(".tmp") || name.starts_with(".tmp"))
}

/// Removes crash leftovers in the root, `images/`, `thumbs/256/` and `thumbs/1024/` (not
/// recursive, files only): names ending ".tmp" or starting ".tmp", except `embeddings.bin.tmp`.
pub fn sweep_tmp(root: &Path) -> Vec<PathBuf> {
    let mut swept = vec![];
    for dir in [
        root.to_path_buf(),
        images_dir(root),
        root.join("thumbs/256"),
        root.join("thumbs/1024"),
    ] {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for e in entries.flatten() {
            let is_file = e.file_type().is_ok_and(|t| t.is_file());
            if is_file && is_tmp(&e.file_name().to_string_lossy()) {
                let path = e.path();
                match fs::remove_file(&path) {
                    Ok(()) => swept.push(path),
                    Err(err) => eprintln!("Couldn't remove {}: {err}", path.display()),
                }
            }
        }
    }
    swept
}

/// True when both thumbnails of `hash` exist (the rebuild skips those).
pub fn has_thumbs(root: &Path, hash: &str) -> bool {
    [256, 1024]
        .iter()
        .all(|&s| thumb_path_in(root, hash, s).is_ok_and(|p| p.is_file()))
}

/// Existence checks only: no hashing, no decoding (the taxonomy backup is parsed and validated).
/// `swept_tmp` is left empty: the caller fills it from `sweep_tmp`.
pub fn check(lib: &Library) -> IntegrityReport {
    let root = &lib.root;
    let mut r = IntegrityReport::default();
    let mut known = HashSet::new();
    for reference in &lib.data.references {
        known.insert(reference.file.as_str());
        // A name Horus did not write is hidden from the window already (commands::visible).
        let Ok(original) = image_path_in(root, &reference.file) else {
            continue;
        };
        if !original.is_file() {
            r.missing_originals.push(reference.id.clone());
        } else if thumb_path_in(root, &reference.hash, 256).is_ok()
            && !has_thumbs(root, &reference.hash)
        {
            r.missing_thumbs.push(reference.id.clone());
        }
    }
    let hashes: HashSet<&str> = lib
        .data
        .references
        .iter()
        .map(|x| x.hash.as_str())
        .collect();
    if let Ok(entries) = fs::read_dir(images_dir(root)) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            let ours = image_path_in(root, &name).is_ok() && e.path().is_file();
            let hash = name.split('.').next().unwrap_or_default();
            if ours && !known.contains(name.as_str()) && !hashes.contains(hash) {
                r.orphans.push(e.path());
            }
        }
    }
    r.orphans.sort();
    let bak = root.join("taxonomy.bak.json");
    if bak.exists() {
        r.taxonomy_backup_invalid = Taxonomy::load(&bak).map_or(true, |t| t.validate().is_err());
    }
    r
}

/// `(id, hash, file)`: decodes the original and writes both thumbnails. Returns the ids rebuilt.
pub fn rebuild_thumbs(root: &Path, refs: &[(String, String, String)]) -> Vec<String> {
    let mut done = vec![];
    for (id, hash, file) in refs {
        let rebuilt = image_path_in(root, file)
            .map_err(|e| e.to_string())
            .and_then(|p| decode_srgb(&p).map_err(|e| format!("{e:?}")))
            .and_then(|d| {
                #[cfg(test)]
                tests::slow(root);
                write_thumbs(root, hash, &on_white(&d.rgba)).map_err(|e| e.to_string())
            });
        match rebuilt {
            Ok(()) => done.push(id.clone()),
            Err(e) => eprintln!("Couldn't rebuild the thumbnails of {id}: {e}"),
        }
    }
    done
}

/// An orphan as a new Inbox reference: its hash from the file name, its size from a decode,
/// and its thumbnails written if they are missing. `None` if it doesn't decode.
pub fn recovered_reference(root: &Path, orphan: &Path) -> Option<Reference> {
    let file = orphan.file_name()?.to_string_lossy().into_owned();
    image_path_in(root, &file).ok()?;
    let hash = file.split('.').next()?.to_string();
    let decoded = match decode_srgb(orphan) {
        Ok(d) => d,
        Err(e) => {
            eprintln!("Couldn't recover {}: {e:?}", orphan.display());
            return None;
        }
    };
    if !has_thumbs(root, &hash)
        && let Err(e) = write_thumbs(root, &hash, &on_white(&decoded.rgba))
    {
        eprintln!("Couldn't write the thumbnails of {}: {e}", orphan.display());
        return None;
    }
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    Some(Reference {
        id: hash.clone(),
        title: format!("Recovered image {}", &hash[..8]),
        creator: None,
        year: None,
        source_url: None,
        credit: None,
        note: None,
        file,
        hash,
        width: decoded.width,
        height: decoded.height,
        added_at: iso_utc(secs),
        tags: vec![],
    })
}

fn blake3_of(path: &Path, cancel: &AtomicBool) -> io::Result<Option<String>> {
    let mut f = fs::File::open(path)?;
    let mut h = blake3::Hasher::new();
    let mut buf = vec![0; 1 << 16];
    loop {
        if cancel.load(Ordering::SeqCst) {
            return Ok(None);
        }
        match f.read(&mut buf) {
            Ok(0) => return Ok(Some(h.finalize().to_hex().to_string())),
            Ok(n) => {
                h.update(&buf[..n]);
            }
            Err(e) if e.kind() == io::ErrorKind::Interrupted => {}
            Err(e) => return Err(e),
        }
    }
}

/// On demand (Task 4's menu): ids whose original's BLAKE3 is not its hash. A missing or
/// unreadable original is `check`'s business, not listed here. `cancel` stops it early.
pub fn verify_hashes(lib: &Library, cancel: &AtomicBool) -> Vec<String> {
    let mut bad = vec![];
    for r in &lib.data.references {
        let Ok(path) = image_path_in(&lib.root, &r.file) else {
            continue;
        };
        match blake3_of(&path, cancel) {
            Ok(Some(h)) if h != r.hash => bad.push(r.id.clone()),
            Ok(None) => break,
            _ => {}
        }
    }
    bad
}

#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use crate::import;
    use std::collections::HashMap;
    use std::sync::Mutex;
    use std::time::Duration;

    /// Roots whose rebuild sleeps before it writes (a slow fake decode for the command tests).
    pub(crate) static SLOW: Mutex<Vec<(PathBuf, Duration)>> = Mutex::new(vec![]);

    pub(crate) fn slow(root: &Path) {
        let d = SLOW
            .lock()
            .unwrap()
            .iter()
            .find(|(r, _)| r == root)
            .map(|x| x.1);
        if let Some(d) = d {
            std::thread::sleep(d);
        }
    }

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name)
    }

    fn seed() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/taxonomy.json")
    }

    /// A saved library holding the given fixtures.
    fn library(names: &[&str]) -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let mut lib = Library::create(&dir.path().join("lib"), &seed()).unwrap();
        let paths: Vec<PathBuf> = names.iter().map(|n| fixture(n)).collect();
        let out = import::import_paths(&lib.root, &HashMap::new(), &paths);
        lib.data.references.extend(out.references);
        lib.save().unwrap();
        (dir, lib)
    }

    #[test]
    fn sweep_removes_only_tmp() {
        let (_d, lib) = library(&["small.jpg"]);
        let root = &lib.root;
        let r = &lib.data.references[0];
        let planted = [
            images_dir(root).join(".tmpAb12"),
            images_dir(root).join("x.jpg.tmp"),
            root.join("thumbs/256/.tmpZ"),
            root.join("library.json.tmp"),
        ];
        for p in &planted {
            fs::write(p, b"x").unwrap();
        }
        fs::write(root.join("library.bak.json"), b"{}").unwrap();
        fs::copy(seed(), root.join("taxonomy.bak.json")).unwrap();
        let mut swept = sweep_tmp(root);
        swept.sort();
        let mut want = planted.to_vec();
        want.sort();
        assert_eq!(swept, want);
        assert!(planted.iter().all(|p| !p.exists()));
        assert!(image_path_in(root, &r.file).unwrap().exists());
        assert!(root.join("library.bak.json").exists());
        assert!(root.join("taxonomy.bak.json").exists());
        assert!(root.join("library.json").exists());
    }

    #[test]
    fn sweep_skips_embeddings_tmp() {
        let (_d, lib) = library(&[]);
        let tmp = lib.root.join(INDEXER_TMP);
        fs::write(&tmp, b"x").unwrap();
        assert!(sweep_tmp(&lib.root).is_empty());
        assert!(tmp.exists());
    }

    #[test]
    fn check_validates_taxonomy_backup() {
        let (_d, lib) = library(&[]);
        assert!(!check(&lib).taxonomy_backup_invalid, "no backup");
        let bak = lib.root.join("taxonomy.bak.json");
        fs::copy(seed(), &bak).unwrap();
        assert!(!check(&lib).taxonomy_backup_invalid, "a valid backup");
        fs::write(&bak, b"{").unwrap();
        assert!(check(&lib).taxonomy_backup_invalid);
        sweep_tmp(&lib.root);
        assert_eq!(fs::read(&bak).unwrap(), b"{", "never deleted or changed");
    }

    #[test]
    fn check_finds_orphan_and_missing() {
        let (_d, lib) = library(&["small.jpg", "p3_red.png"]);
        let before = fs::read(lib.root.join("library.json")).unwrap();
        let gone = &lib.data.references[1];
        fs::remove_file(image_path_in(&lib.root, &gone.file).unwrap()).unwrap();
        let orphan = images_dir(&lib.root).join(format!("{}.png", "ab".repeat(32)));
        fs::copy(fixture("p3_red.png"), &orphan).unwrap();
        fs::write(images_dir(&lib.root).join("notes.txt"), b"not ours").unwrap();
        let r = check(&lib);
        assert_eq!(r.missing_originals, vec![gone.id.clone()]);
        assert_eq!(r.orphans, vec![orphan]);
        assert!(r.missing_thumbs.is_empty(), "{r:?}");
        assert_eq!(fs::read(lib.root.join("library.json")).unwrap(), before);
    }

    #[test]
    fn check_lists_missing_thumb() {
        let (_d, lib) = library(&["small.jpg"]);
        let r = &lib.data.references[0];
        let thumb = thumb_path_in(&lib.root, &r.hash, 256).unwrap();
        fs::remove_file(&thumb).unwrap();
        let report = check(&lib);
        assert_eq!(report.missing_thumbs, vec![r.id.clone()]);
        assert!(report.found_anything());
        let item = (r.id.clone(), r.hash.clone(), r.file.clone());
        assert_eq!(rebuild_thumbs(&lib.root, &[item]), vec![r.id.clone()]);
        assert!(thumb.exists());
        assert!(check(&lib).missing_thumbs.is_empty());
    }

    #[test]
    fn clean_library_reports_nothing() {
        let (_d, lib) = library(&["small.jpg"]);
        assert!(!check(&lib).found_anything());
    }

    #[test]
    fn recovered_reference_from_orphan() {
        let (_d, lib) = library(&[]);
        let hash = "cd".repeat(32);
        let orphan = images_dir(&lib.root).join(format!("{hash}.jpg"));
        fs::copy(fixture("small.jpg"), &orphan).unwrap();
        let r = recovered_reference(&lib.root, &orphan).unwrap();
        assert_eq!(r.title, "Recovered image cdcdcdcd");
        assert_eq!(
            (r.id.as_str(), r.hash.as_str()),
            (hash.as_str(), hash.as_str())
        );
        assert!(r.width > 0 && r.height > 0);
        assert!(has_thumbs(&lib.root, &hash), "its thumbnails are written");
        let junk = images_dir(&lib.root).join(format!("{}.png", "ef".repeat(32)));
        fs::write(&junk, b"not an image").unwrap();
        assert!(recovered_reference(&lib.root, &junk).is_none());
    }

    #[test]
    fn verify_hashes_flags_corruption() {
        let (_d, lib) = library(&["small.jpg", "p3_red.png"]);
        let no = AtomicBool::new(false);
        assert!(verify_hashes(&lib, &no).is_empty());
        let bad = &lib.data.references[0];
        let path = image_path_in(&lib.root, &bad.file).unwrap();
        let mut bytes = fs::read(&path).unwrap();
        let mid = bytes.len() / 2;
        bytes[mid] ^= 0xff;
        fs::write(&path, bytes).unwrap();
        assert_eq!(verify_hashes(&lib, &no), vec![bad.id.clone()]);
        let stop = AtomicBool::new(true);
        assert!(
            verify_hashes(&lib, &stop).is_empty(),
            "cancelled before the first file"
        );
    }
}
