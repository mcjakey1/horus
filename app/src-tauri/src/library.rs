use crate::model::{LibraryData, Reference};
use std::fs;
use std::io::{self, Write};
use std::path::{Path, PathBuf};

const DATA: &str = "library.json";
const BACKUP: &str = "library.bak.json";
const TMP: &str = "library.json.tmp";
/// Where `create` puts the library when the chosen folder already holds other files.
pub const SUBFOLDER: &str = "Horus Library";
/// The `library.json` format this build writes; `open` refuses anything newer.
const VERSION: u32 = 1;

#[derive(Debug, thiserror::Error)]
pub enum LibraryError {
    #[error("library I/O error: {0}")]
    Io(#[from] std::io::Error),
    #[error("library.json is corrupt (recovered from backup: {recovered_from_backup})")]
    Corrupt { recovered_from_backup: bool },
    #[error("folder is not a Horus library")]
    NotALibrary,
    #[error("folder already holds a Horus library")]
    AlreadyALibrary,
    #[error("the Horus Library subfolder is not empty and is not a Horus library")]
    SubfolderNotEmpty,
    #[error("library.json was saved by a newer version of Horus")]
    NewerVersion,
    /// A `Reference.file` or hash that is not one Horus wrote (a hand-edited library.json).
    #[error("not a valid image file name: {0}")]
    InvalidFile(String),
}

pub struct Library {
    pub root: PathBuf,
    pub data: LibraryData,
    /// True when `open` found library.json corrupt and loaded library.bak.json instead.
    /// The caller surfaces this as a warning; the next `save` rewrites library.json.
    pub recovered_from_backup: bool,
}

impl Library {
    /// `chosen` is the folder the user picked. The library goes there if it is missing or
    /// empty, otherwise into `<chosen>/Horus Library`, so the user's own files never share the
    /// library root (import refuses everything under the root).
    /// `Library::root` is where it actually went.
    pub fn create(chosen: &Path, seed_taxonomy: &Path) -> Result<Library, LibraryError> {
        // Never lose work: pick and check the root before touching anything.
        let root = &new_root(chosen)?;
        for sub in ["images", "thumbs/256", "thumbs/1024"] {
            fs::create_dir_all(root.join(sub))?;
        }
        // create_new: never overwrite a taxonomy.json, even one that appeared since the check.
        let mut seed = fs::File::open(seed_taxonomy)?;
        let mut tax = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(root.join("taxonomy.json"))?;
        io::copy(&mut seed, &mut tax)?;
        let lib = Library {
            root: root.to_path_buf(),
            data: LibraryData {
                version: VERSION,
                references: vec![],
                links: vec![],
                boards: vec![],
            },
            recovered_from_backup: false,
        };
        lib.save()?;
        Ok(lib)
    }

    pub fn open(root: &Path) -> Result<Library, LibraryError> {
        let path = root.join(DATA);
        let backup = root.join(BACKUP);
        if !path.is_file() && !backup.is_file() {
            return Err(LibraryError::NotALibrary);
        }
        // A missing library.json (quarantined, or a non-atomic replace on FAT32/exFAT) falls
        // back to the backup exactly like a corrupt one.
        let primary = if path.is_file() {
            check(&fs::read(&path)?)?
        } else {
            None
        };
        let (data, recovered_from_backup) = match primary {
            Some(data) => (data, false),
            None => match fs::read(&backup)
                .ok()
                .map(|b| check(&b))
                .transpose()?
                .flatten()
            {
                Some(data) => (data, true),
                None => {
                    return Err(LibraryError::Corrupt {
                        recovered_from_backup: false,
                    });
                }
            },
        };
        Ok(Library {
            root: root.to_path_buf(),
            data,
            recovered_from_backup,
        })
    }

    /// Write library.json.tmp, roll the current library.json into library.bak.json (through
    /// library.bak.json.tmp), then atomically rename the tmp over library.json.
    pub fn save(&self) -> Result<(), LibraryError> {
        let json = serde_json::to_vec_pretty(&self.data).map_err(std::io::Error::other)?;
        let tmp_path = self.root.join(TMP);
        // A crash mid-save can leave a stale tmp file; clear it so the fixed name is free.
        let _ = fs::remove_file(&tmp_path);
        // Fixed name (no random suffix) so a leftover or blocked tmp is visible and testable.
        let mut tmp = tempfile::Builder::new()
            .prefix(TMP)
            .rand_bytes(0)
            .tempfile_in(&self.root)?;
        tmp.write_all(&json)?;
        tmp.as_file().sync_all()?;
        let data = self.root.join(DATA);
        // Rotate only a library.json that parses, so a corrupt file never replaces a good backup.
        match fs::read(&data) {
            Ok(current) if serde_json::from_slice::<LibraryData>(&current).is_ok() => {
                write_atomic(&self.root.join(BACKUP), &current)?;
            }
            Ok(_) => {}
            Err(e) if e.kind() == io::ErrorKind::NotFound => {}
            // Locked (a sync client) rather than damaged: keep the old backup, still save.
            Err(e) => eprintln!(
                "Horus: library.json could not be read, so library.bak.json was not updated: {e}"
            ),
        }
        tmp.persist(&data).map_err(|e| e.error)?;
        Ok(())
    }

    pub fn image_path(&self, r: &Reference) -> Result<PathBuf, LibraryError> {
        image_path_in(&self.root, &r.file)
    }

    /// `size` is 256 or 1024.
    pub fn thumb_path(&self, hash: &str, size: u32) -> Result<PathBuf, LibraryError> {
        thumb_path_in(&self.root, hash, size)
    }
}

/// Writes `<path>.tmp`, syncs it, then renames it over `path`. The tmp name is fixed, so a
/// leftover from a crash is replaced instead of piling up next to the library's files.
// ponytail: no sweep of random `.tmp*` names in the root. With fixed names none are created
// (Task 3's NamedTempFile names never shipped); Plan 6's `sweep_tmp` owns crash leftovers.
pub(crate) fn write_atomic(path: &Path, bytes: &[u8]) -> io::Result<()> {
    let dir = path.parent().unwrap_or_else(|| Path::new("."));
    let name = format!(
        "{}.tmp",
        path.file_name().unwrap_or_default().to_string_lossy()
    );
    let _ = fs::remove_file(dir.join(&name));
    let mut tmp = tempfile::Builder::new()
        .prefix(&name)
        .rand_bytes(0)
        .tempfile_in(dir)?;
    tmp.write_all(bytes)?;
    tmp.as_file().sync_all()?;
    tmp.persist(path).map_err(|e| e.error)?;
    Ok(())
}

/// Where imports put image files. Unguarded: it names the directory, not a reference's file.
pub fn images_dir(root: &Path) -> PathBuf {
    root.join("images")
}

/// 64 lowercase hex characters: a BLAKE3 hash as Horus writes it.
fn is_hash(s: &str) -> bool {
    s.len() == 64
        && s.bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// `file` is the bare `Reference.file` name: `<hash>.<ext>`, the ext 2-5 of `[a-z0-9]`.
/// Anything else (`..`, a separator, a drive) is refused, so library.json can't point outside.
pub fn image_path_in(root: &Path, file: &str) -> Result<PathBuf, LibraryError> {
    let ok = file.split_once('.').is_some_and(|(hash, ext)| {
        is_hash(hash)
            && (2..=5).contains(&ext.len())
            && ext
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
    });
    if !ok {
        return Err(LibraryError::InvalidFile(file.into()));
    }
    Ok(images_dir(root).join(file))
}

/// `size` is 256 or 1024.
pub fn thumb_path_in(root: &Path, hash: &str, size: u32) -> Result<PathBuf, LibraryError> {
    if !is_hash(hash) || !matches!(size, 256 | 1024) {
        return Err(LibraryError::InvalidFile(format!("{hash} ({size})")));
    }
    Ok(root
        .join("thumbs")
        .join(size.to_string())
        .join(format!("{hash}.jpg")))
}

fn is_library(dir: &Path) -> bool {
    dir.join(DATA).exists() || dir.join(BACKUP).exists()
}

/// A missing folder counts as empty: `create` makes it.
fn is_empty(dir: &Path) -> io::Result<bool> {
    match fs::read_dir(dir) {
        Ok(mut entries) => Ok(entries.next().is_none()),
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(true),
        Err(e) => Err(e),
    }
}

fn new_root(chosen: &Path) -> Result<PathBuf, LibraryError> {
    if is_library(chosen) {
        return Err(LibraryError::AlreadyALibrary);
    }
    if is_empty(chosen)? {
        return Ok(chosen.to_path_buf());
    }
    let sub = chosen.join(SUBFOLDER);
    if is_library(&sub) {
        return Err(LibraryError::AlreadyALibrary);
    }
    if is_empty(&sub)? {
        Ok(sub)
    } else {
        Err(LibraryError::SubfolderNotEmpty)
    }
}

/// Parses one library file: `Ok(None)` if it is not valid library JSON, an error if it is
/// from a newer Horus (checked first, so a newer shape never falls back to the backup).
fn check(bytes: &[u8]) -> Result<Option<LibraryData>, LibraryError> {
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(bytes) else {
        return Ok(None);
    };
    if value
        .get("version")
        .and_then(serde_json::Value::as_u64)
        .is_some_and(|v| v > u64::from(VERSION))
    {
        return Err(LibraryError::NewerVersion);
    }
    Ok(serde_json::from_value(value).ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Board;
    use std::fs;

    fn seed() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("../../taxonomy/taxonomy.json")
    }

    fn new_lib() -> (tempfile::TempDir, Library) {
        let dir = tempfile::tempdir().unwrap();
        let lib = Library::create(dir.path(), &seed()).unwrap();
        (dir, lib)
    }

    fn add_board(lib: &mut Library, id: &str) {
        lib.data.boards.push(Board {
            id: id.into(),
            name: format!("Board {id}"),
            reference_ids: vec![],
        });
    }

    #[test]
    fn create_makes_layout() {
        let (dir, _lib) = new_lib();
        let r = dir.path();
        assert!(r.join("library.json").is_file());
        assert!(r.join("taxonomy.json").is_file());
        assert_eq!(
            fs::read(r.join("taxonomy.json")).unwrap(),
            fs::read(seed()).unwrap()
        );
        assert!(r.join("images").is_dir());
        assert!(r.join("thumbs/256").is_dir());
        assert!(r.join("thumbs/1024").is_dir());
    }

    #[test]
    fn save_roundtrip() {
        let (dir, mut lib) = new_lib();
        add_board(&mut lib, "b1");
        lib.save().unwrap();
        let opened = Library::open(dir.path()).unwrap();
        opened.save().unwrap();
        let again = Library::open(dir.path()).unwrap();
        assert_eq!(again.data, lib.data);
        assert_eq!(again.data, opened.data);
    }

    #[test]
    fn save_is_atomic() {
        let (dir, mut lib) = new_lib();
        let before = fs::read(dir.path().join("library.json")).unwrap();
        add_board(&mut lib, "b1");
        lib.save().unwrap();
        assert!(!dir.path().join("library.json.tmp").exists());
        assert_eq!(
            fs::read(dir.path().join("library.bak.json")).unwrap(),
            before
        );
        assert_ne!(fs::read(dir.path().join("library.json")).unwrap(), before);
    }

    #[test]
    fn save_failure_keeps_last_good() {
        let (dir, mut lib) = new_lib();
        let before = fs::read(dir.path().join("library.json")).unwrap();
        fs::create_dir(dir.path().join("library.json.tmp")).unwrap();
        add_board(&mut lib, "b1");
        assert!(matches!(lib.save(), Err(LibraryError::Io(_))));
        assert_eq!(fs::read(dir.path().join("library.json")).unwrap(), before);
    }

    #[test]
    fn corrupt_json_recovers_from_backup() {
        let (dir, mut lib) = new_lib();
        add_board(&mut lib, "b1");
        lib.save().unwrap(); // backup now holds the empty library
        add_board(&mut lib, "b2");
        lib.save().unwrap(); // backup now holds the library with b1
        let backup: LibraryData =
            serde_json::from_slice(&fs::read(dir.path().join("library.bak.json")).unwrap())
                .unwrap();
        fs::write(dir.path().join("library.json"), "{").unwrap();
        let opened = Library::open(dir.path()).unwrap();
        assert!(opened.recovered_from_backup);
        assert_eq!(opened.data, backup);
        assert_eq!(opened.data.boards.len(), 1);
    }

    #[test]
    fn create_refuses_existing_library() {
        let (dir, mut lib) = new_lib();
        lib.data.references.push(Reference {
            id: "r1".into(),
            title: "Kept".into(),
            creator: None,
            year: None,
            source_url: None,
            credit: None,
            note: None,
            file: "r1.jpg".into(),
            hash: "abc".into(),
            width: 10,
            height: 10,
            added_at: "2026-11-25T00:00:00Z".into(),
            tags: vec![],
        });
        lib.save().unwrap();
        let before = fs::read(dir.path().join("library.json")).unwrap();
        assert!(matches!(
            Library::create(dir.path(), &seed()),
            Err(LibraryError::AlreadyALibrary)
        ));
        assert_eq!(fs::read(dir.path().join("library.json")).unwrap(), before);
        let opened = Library::open(dir.path()).unwrap();
        assert_eq!(opened.data.references, lib.data.references);
    }

    #[test]
    fn save_after_recovery_keeps_good_backup() {
        let (dir, mut lib) = new_lib();
        add_board(&mut lib, "b1");
        lib.save().unwrap();
        add_board(&mut lib, "b2");
        lib.save().unwrap(); // backup now holds the library with b1
        fs::write(dir.path().join("library.json"), "{").unwrap();
        let opened = Library::open(dir.path()).unwrap();
        assert!(opened.recovered_from_backup);
        let good = opened.data.clone();
        opened.save().unwrap();
        let backup: LibraryData =
            serde_json::from_slice(&fs::read(dir.path().join("library.bak.json")).unwrap())
                .unwrap();
        assert_eq!(backup, good);
    }

    #[test]
    fn missing_json_recovers_from_backup() {
        let (dir, mut lib) = new_lib();
        add_board(&mut lib, "b1");
        lib.save().unwrap();
        add_board(&mut lib, "b2");
        lib.save().unwrap(); // backup now holds the library with b1
        let backup: LibraryData =
            serde_json::from_slice(&fs::read(dir.path().join("library.bak.json")).unwrap())
                .unwrap();
        fs::remove_file(dir.path().join("library.json")).unwrap();
        let opened = Library::open(dir.path()).unwrap();
        assert!(opened.recovered_from_backup);
        assert_eq!(opened.data, backup);

        let empty = tempfile::tempdir().unwrap();
        assert!(matches!(
            Library::open(empty.path()),
            Err(LibraryError::NotALibrary)
        ));
    }

    #[test]
    fn create_refuses_backup_only_folder() {
        let (dir, mut lib) = new_lib();
        add_board(&mut lib, "b1");
        lib.save().unwrap(); // library.bak.json now exists
        fs::remove_file(dir.path().join("library.json")).unwrap();
        let before = fs::read(dir.path().join("library.bak.json")).unwrap();
        assert!(matches!(
            Library::create(dir.path(), &seed()),
            Err(LibraryError::AlreadyALibrary)
        ));
        assert_eq!(
            fs::read(dir.path().join("library.bak.json")).unwrap(),
            before
        );
        assert!(!dir.path().join("library.json").exists());
    }

    #[test]
    fn create_in_nonempty_folder_uses_subfolder() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("holiday.jpg"), b"mine").unwrap();
        let lib = Library::create(dir.path(), &seed()).unwrap();
        assert!(
            lib.root.ends_with("Horus Library"),
            "{}",
            lib.root.display()
        );
        assert_eq!(lib.root, dir.path().join("Horus Library"));
        assert!(lib.root.join("library.json").is_file());
        assert_eq!(fs::read(dir.path().join("holiday.jpg")).unwrap(), b"mine");
        let mut top: Vec<_> = fs::read_dir(dir.path())
            .unwrap()
            .map(|e| e.unwrap().file_name())
            .collect();
        top.sort();
        assert_eq!(top, ["Horus Library", "holiday.jpg"]);
    }

    #[test]
    fn create_uses_empty_subfolder_and_refuses_nonempty_one() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("holiday.jpg"), b"mine").unwrap();
        let sub = dir.path().join("Horus Library");
        fs::create_dir(&sub).unwrap();
        assert_eq!(Library::create(dir.path(), &seed()).unwrap().root, sub);

        let other = tempfile::tempdir().unwrap();
        fs::write(other.path().join("holiday.jpg"), b"mine").unwrap();
        let sub = other.path().join("Horus Library");
        fs::create_dir(&sub).unwrap();
        fs::write(sub.join("notes.txt"), b"keep").unwrap();
        assert!(matches!(
            Library::create(other.path(), &seed()),
            Err(LibraryError::SubfolderNotEmpty)
        ));
        assert_eq!(fs::read_dir(&sub).unwrap().count(), 1);
        assert_eq!(fs::read(sub.join("notes.txt")).unwrap(), b"keep");
    }

    #[test]
    fn create_never_overwrites_taxonomy_json() {
        let dir = tempfile::tempdir().unwrap();
        fs::write(dir.path().join("taxonomy.json"), b"my own taxonomy").unwrap();
        let lib = Library::create(dir.path(), &seed()).unwrap();
        assert_eq!(
            fs::read(dir.path().join("taxonomy.json")).unwrap(),
            b"my own taxonomy"
        );
        assert_eq!(
            fs::read(lib.root.join("taxonomy.json")).unwrap(),
            fs::read(seed()).unwrap()
        );
    }

    #[test]
    fn unicode_path() {
        let dir = tempfile::tempdir().unwrap();
        let root = dir.path().join("Références Été");
        let mut lib = Library::create(&root, &seed()).unwrap();
        add_board(&mut lib, "é");
        lib.save().unwrap();
        let opened = Library::open(&root).unwrap();
        assert!(!opened.recovered_from_backup);
        assert_eq!(opened.data, lib.data);
    }

    #[test]
    fn backup_written_via_tmp() {
        let (dir, mut lib) = new_lib();
        let previous = fs::read(dir.path().join("library.json")).unwrap();
        // a leftover from a crash mid-rotation is replaced, never left behind
        fs::write(dir.path().join("library.bak.json.tmp"), "junk").unwrap();
        add_board(&mut lib, "b1");
        lib.save().unwrap();
        assert!(!dir.path().join("library.bak.json.tmp").exists());
        assert_eq!(
            fs::read(dir.path().join("library.bak.json")).unwrap(),
            previous
        );
    }
}
