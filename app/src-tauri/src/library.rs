use crate::model::{LibraryData, Reference};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

const DATA: &str = "library.json";
const BACKUP: &str = "library.bak.json";
const TMP: &str = "library.json.tmp";

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
}

pub struct Library {
    pub root: PathBuf,
    pub data: LibraryData,
    /// True when `open` found library.json corrupt and loaded library.bak.json instead.
    /// The caller surfaces this as a warning; the next `save` rewrites library.json.
    pub recovered_from_backup: bool,
}

impl Library {
    pub fn create(root: &Path, seed_taxonomy: &Path) -> Result<Library, LibraryError> {
        // Never lose work: refuse before touching anything.
        if root.join(DATA).exists() {
            return Err(LibraryError::AlreadyALibrary);
        }
        for sub in ["images", "thumbs/256", "thumbs/1024"] {
            fs::create_dir_all(root.join(sub))?;
        }
        fs::copy(seed_taxonomy, root.join("taxonomy.json"))?;
        let lib = Library {
            root: root.to_path_buf(),
            data: LibraryData {
                version: 1,
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
        if !path.is_file() {
            return Err(LibraryError::NotALibrary);
        }
        let (data, recovered_from_backup) = match serde_json::from_slice(&fs::read(&path)?) {
            Ok(data) => (data, false),
            Err(_) => match parse(&root.join(BACKUP)) {
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

    /// Write library.json.tmp, roll the current library.json into library.bak.json,
    /// then atomically rename the tmp over library.json.
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
        if parse(&data).is_some() {
            fs::copy(&data, self.root.join(BACKUP))?;
        }
        tmp.persist(&data).map_err(|e| e.error)?;
        Ok(())
    }

    pub fn image_path(&self, r: &Reference) -> PathBuf {
        self.root.join("images").join(&r.file)
    }

    /// `size` is 256 or 1024.
    pub fn thumb_path(&self, hash: &str, size: u32) -> PathBuf {
        self.root
            .join("thumbs")
            .join(size.to_string())
            .join(format!("{hash}.jpg"))
    }
}

fn parse(p: &Path) -> Option<LibraryData> {
    serde_json::from_slice(&fs::read(p).ok()?).ok()
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
}
