//! Debounced saves (SPEC §6.8, Plan 2 decision B3). Tag and technique edits mark the library
//! or the taxonomy dirty; the saver thread (`commands::start_saver`) writes them after a quiet
//! spell.
//! Imports save at once and call `clear_library`.

use crate::commands::library_error;
use crate::library::{Library, LibraryError};
use crate::taxonomy::Taxonomy;
use std::time::{Duration, Instant};

pub const SAVE_DEBOUNCE_MS: u64 = 500;

/// What is waiting to be saved, and since when. Pure: the caller passes the clock.
pub struct Debounce {
    delay: Duration,
    last_touch: Option<Instant>,
    dirty_library: bool,
    dirty_taxonomy: bool,
    /// The last flush failed: wait for the next edit instead of retrying in a loop.
    failed: bool,
}

impl Debounce {
    pub fn new(delay: Duration) -> Debounce {
        Debounce {
            delay,
            last_touch: None,
            dirty_library: false,
            dirty_taxonomy: false,
            failed: false,
        }
    }

    /// An edit happened. Also clears `failed`, so a new edit retries a failed save.
    pub fn touch(&mut self, now: Instant, library: bool, taxonomy: bool) {
        self.last_touch = Some(now);
        self.dirty_library |= library;
        self.dirty_taxonomy |= taxonomy;
        self.failed = false;
    }

    pub fn due(&self, now: Instant) -> bool {
        self.deadline().is_some_and(|d| now >= d)
    }

    /// When `due` turns true, for the saver thread's `Condvar` timeout. `None` when idle.
    pub fn deadline(&self) -> Option<Instant> {
        let waiting = (self.dirty_library || self.dirty_taxonomy) && !self.failed;
        self.last_touch.filter(|_| waiting).map(|t| t + self.delay)
    }

    /// Returns and clears the dirty flags, as `(library, taxonomy)`.
    pub fn take(&mut self) -> (bool, bool) {
        let flags = (self.dirty_library, self.dirty_taxonomy);
        self.dirty_library = false;
        self.dirty_taxonomy = false;
        flags
    }

    /// Re-marks what a failed save did not write, and holds until the next `touch`.
    pub fn restore(&mut self, library: bool, taxonomy: bool) {
        self.dirty_library |= library;
        self.dirty_taxonomy |= taxonomy;
        self.failed = true;
    }

    /// Whether a library edit is waiting, so an import can put the flag back after a rollback.
    pub fn library_dirty(&self) -> bool {
        self.dirty_library
    }

    /// An import just saved library.json, which also wrote any pending tag edits.
    pub fn clear_library(&mut self) {
        self.dirty_library = false;
    }
}

/// Saves what is dirty: taxonomy.json first, so after an addition a failed library.json save
/// can only leave an unused technique behind. After a removal (a delete or a re-key, R16) no
/// order is safe: a failed library.json save, or "Quit without saving", can leave tags on disk
/// naming a technique or branch taxonomy.json no longer has. Plan 3 accepts these dangling ids:
/// they are kept (SPEC §9), the UI shows the id and a neutral ink, and Plan 6's integrity check
/// reports them. Never writes
/// taxonomy.json when `!tax_writable` (the read-only seed fallback). On `Err` the unsaved parts
/// stay dirty, and `d` waits for the next edit. Errors are worded as `library_error` words them.
pub fn flush(
    lib: &mut Library,
    tax: &Taxonomy,
    tax_writable: bool,
    d: &mut Debounce,
) -> Result<(), String> {
    let (library, taxonomy) = d.take();
    if taxonomy
        && tax_writable
        && let Err(e) = tax.save(&lib.root.join("taxonomy.json"))
    {
        d.restore(library, true);
        return Err(library_error(LibraryError::Io(e)));
    }
    if library {
        if let Err(e) = lib.save() {
            d.restore(true, false);
            return Err(library_error(e));
        }
        // library.json is good again, so the "opened from the backup" warning no longer applies.
        lib.recovered_from_backup = false;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::library::Library;
    use crate::taxonomy::Taxonomy;
    use std::fs;
    use std::path::{Path, PathBuf};

    const MS: Duration = Duration::from_millis(1);

    fn seed() -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/taxonomy.json")
    }

    fn open() -> (tempfile::TempDir, Library, Taxonomy) {
        let dir = tempfile::tempdir().unwrap();
        let lib = Library::create(dir.path(), &seed()).unwrap();
        let tax = Taxonomy::load(&dir.path().join("taxonomy.json")).unwrap();
        (dir, lib, tax)
    }

    /// A taxonomy with one more (orphan-free) technique, so its JSON differs from the file.
    fn changed(tax: &Taxonomy) -> Taxonomy {
        let mut t = tax.clone();
        let mut extra = t.techniques[0].clone();
        extra.id = "halo-glow".into();
        extra.name = "Halo glow".into();
        t.techniques.push(extra);
        t
    }

    #[test]
    fn debounce_waits_for_quiet() {
        let t0 = Instant::now();
        let mut d = Debounce::new(Duration::from_millis(SAVE_DEBOUNCE_MS));
        d.touch(t0, true, false);
        d.touch(t0 + 300 * MS, true, false);
        assert!(!d.due(t0 + 600 * MS));
        assert!(d.due(t0 + 800 * MS));
        assert_eq!(d.deadline(), Some(t0 + 800 * MS));
    }

    #[test]
    fn debounce_not_due_when_clean() {
        let t0 = Instant::now();
        let mut d = Debounce::new(500 * MS);
        assert!(!d.due(t0 + 10_000 * MS));
        assert_eq!(d.deadline(), None);
        d.touch(t0, false, true);
        assert_eq!(d.take(), (false, true));
        assert!(!d.due(t0 + 10_000 * MS));
        assert_eq!(d.deadline(), None);
    }

    #[test]
    fn failed_flush_waits_for_touch() {
        let t0 = Instant::now();
        let mut d = Debounce::new(500 * MS);
        d.touch(t0, true, false);
        let (l, t) = d.take();
        d.restore(l, t);
        assert!(!d.due(t0 + 1_000_000 * MS), "a failed save must not spin");
        assert_eq!(d.deadline(), None);
        d.touch(t0 + 2_000 * MS, false, false);
        assert!(d.due(t0 + 2_500 * MS));
        assert_eq!(d.take(), (true, false));
    }

    #[test]
    fn clear_library_keeps_the_taxonomy_dirty() {
        let mut d = Debounce::new(500 * MS);
        d.touch(Instant::now(), true, true);
        d.clear_library();
        assert_eq!(d.take(), (false, true));
    }

    #[test]
    fn flush_saves_only_dirty() {
        let (dir, mut lib, tax) = open();
        let lib_path = dir.path().join("library.json");
        let before = fs::read(&lib_path).unwrap();
        let mtime = fs::metadata(&lib_path).unwrap().modified().unwrap();
        let mut d = Debounce::new(500 * MS);
        d.touch(Instant::now(), false, true);
        flush(&mut lib, &changed(&tax), true, &mut d).unwrap();
        assert_eq!(fs::read(&lib_path).unwrap(), before);
        assert_eq!(fs::metadata(&lib_path).unwrap().modified().unwrap(), mtime);
        let saved = Taxonomy::load(&dir.path().join("taxonomy.json")).unwrap();
        assert!(saved.techniques.iter().any(|t| t.id == "halo-glow"));
        assert_eq!(d.take(), (false, false));
    }

    #[test]
    fn flush_respects_read_only() {
        let (dir, mut lib, tax) = open();
        let tax_path = dir.path().join("taxonomy.json");
        let before = fs::read(&tax_path).unwrap();
        let mut d = Debounce::new(500 * MS);
        d.touch(Instant::now(), true, true);
        flush(&mut lib, &changed(&tax), false, &mut d).unwrap();
        assert_eq!(fs::read(&tax_path).unwrap(), before);
        assert!(!dir.path().join("taxonomy.bak.json").exists());
    }

    #[test]
    fn flush_failure_restores_dirty() {
        let (dir, mut lib, tax) = open();
        fs::create_dir(dir.path().join("library.json.tmp")).unwrap();
        let t0 = Instant::now();
        let mut d = Debounce::new(500 * MS);
        d.touch(t0, true, true);
        let err = flush(&mut lib, &changed(&tax), true, &mut d).unwrap_err();
        // Plain words, as `library_error` words them (Task 5 ruling 4).
        assert!(
            err.starts_with("Could not read or write the library") && !err.contains("I/O error"),
            "{err}"
        );
        assert!(!d.due(t0 + 10_000 * MS)); // held until the next touch
        // taxonomy.json was saved first (ruling 3), so only the library stays dirty.
        assert_eq!(d.take(), (true, false));
    }

    #[test]
    fn taxonomy_saves_before_library() {
        let (dir, mut lib, tax) = open();
        let lib_path = dir.path().join("library.json");
        let before = fs::read(&lib_path).unwrap();
        fs::create_dir(dir.path().join("taxonomy.json.tmp")).unwrap();
        let mut d = Debounce::new(500 * MS);
        d.touch(Instant::now(), true, true);
        let err = flush(&mut lib, &changed(&tax), true, &mut d).unwrap_err();
        assert!(
            err.starts_with("Could not read or write the library"),
            "{err}"
        );
        // No tags on disk that point at a technique taxonomy.json lacks.
        assert_eq!(fs::read(&lib_path).unwrap(), before);
        assert_eq!(d.take(), (true, true));
    }

    #[test]
    fn recovered_flag_clears_after_flush() {
        let (_dir, mut lib, tax) = open();
        lib.recovered_from_backup = true;
        let mut d = Debounce::new(500 * MS);
        d.touch(Instant::now(), false, true);
        flush(&mut lib, &tax, true, &mut d).unwrap();
        assert!(
            lib.recovered_from_backup,
            "only a library.json save clears it"
        );
        d.touch(Instant::now(), true, false);
        flush(&mut lib, &tax, true, &mut d).unwrap();
        assert!(!lib.recovered_from_backup);
    }
}
