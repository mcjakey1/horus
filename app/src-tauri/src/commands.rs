//! Tauri commands: the IPC surface `src/api.ts` calls. Every command returns
//! `Result<T, String>` with a message the UI can show as-is. All JSON is camelCase.

use crate::correlate::{Index, Scored};
use crate::demo::{self, DemoExample};
use crate::edit::{self, Edit, EditError, Field, Touched, new_id};
use crate::history::History;
use crate::hooks;
use crate::import::{self, ImportReport};
use crate::library::{Library, LibraryError, SUBFOLDER, thumb_path_in};
use crate::model::{LibraryData, Link, Reference, Region, Tag};
use crate::saver::{self, Debounce, SAVE_DEBOUNCE_MS};
use crate::search::{self, Hit};
use crate::settings::{self, Settings, SettingsPatch};
use crate::taxonomy::{CustomError, TaxSource, Taxonomy};
use serde::{Deserialize, Deserializer, Serialize};
use std::borrow::Cow;
use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Condvar, Mutex, MutexGuard, PoisonError, TryLockError};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// The open library and everything that lives and dies with it.
struct Open {
    lib: Library,
    tax: Taxonomy,
    index: Index,
    history: History,
    debounce: Debounce,
    tax_source: TaxSource,
}

pub struct AppState {
    open: Mutex<Option<Open>>,
    /// Wakes the saver thread (`start_saver`) after an edit. Paired with `open`.
    saver: Condvar,
    /// The window may close without a flush: set by "Try again" once it saved, and by
    /// "Quit without saving".
    skip_close_flush: AtomicBool,
    /// A close came while an import ran: the import's end closes the window (I1).
    close_owed: AtomicBool,
    /// The UI's intake queue has work Rust has not seen yet: a close waits for it to drain (R2).
    intake_busy: AtomicBool,
    /// Imports queue here for their whole run: thumbnail temp names are fixed per hash.
    import_gate: Mutex<()>,
    /// Serialises the settings read-merge-write.
    settings: Mutex<()>,
    config_dir: PathBuf,
    seed_taxonomy: PathBuf,
    /// The bundled demo set: `manifest.json` and `images/`.
    demo_dir: PathBuf,
}

impl AppState {
    pub fn new(config_dir: PathBuf, seed_taxonomy: PathBuf, demo_dir: PathBuf) -> AppState {
        AppState {
            open: Mutex::new(None),
            saver: Condvar::new(),
            skip_close_flush: AtomicBool::new(false),
            close_owed: AtomicBool::new(false),
            intake_busy: AtomicBool::new(false),
            import_gate: Mutex::new(()),
            settings: Mutex::new(()),
            config_dir,
            seed_taxonomy,
            demo_dir,
        }
    }
}

/// A reference plus its thumbnail paths, built here so the UI never joins paths itself.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceView {
    #[serde(flatten)]
    reference: Reference,
    thumb256: PathBuf,
    thumb1024: PathBuf,
}

impl ReferenceView {
    /// `Err` for a hash Horus did not write: that reference is hidden (see `visible`).
    pub fn new(root: &Path, r: Reference) -> Result<ReferenceView, LibraryError> {
        Ok(ReferenceView {
            thumb256: thumb_path_in(root, &r.hash, 256)?,
            thumb1024: thumb_path_in(root, &r.hash, 1024)?,
            reference: r,
        })
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LibraryView {
    root: PathBuf,
    references: Vec<ReferenceView>,
    links: Vec<Link>,
    warning: Option<String>,
    /// Demo-seed problems (unknown names, skipped images); also joined into `warning`.
    seed_warnings: Vec<String>,
    /// The taxonomy is the bundled seed, shown because the library's files are damaged.
    taxonomy_read_only: bool,
}

/// What a mutating command changed, so the UI never re-reads the whole library.
#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Change {
    pub references: Vec<ReferenceView>,
    pub removed: Vec<String>,
    /// Only when the taxonomy changed.
    pub taxonomy: Option<Taxonomy>,
    /// The new technique's id, from `add_technique`.
    pub created: Option<String>,
    pub can_undo: bool,
    pub can_redo: bool,
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImportResult {
    pub report: ImportReport,
    pub change: Change,
}

/// A tag as the UI sends it; Rust gives it an id and `suggested: false`.
#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NewTag {
    pub operation_id: String,
    pub technique_id: Option<String>,
    pub branch_id: Option<String>,
    pub region: Option<Region>,
}

impl NewTag {
    fn into_tag(self, id: String) -> Tag {
        Tag {
            id,
            operation_id: self.operation_id,
            technique_id: self.technique_id,
            branch_id: self.branch_id,
            region: self.region,
            suggested: false,
        }
    }
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct NewTechnique {
    pub name: String,
    pub description: String,
    pub operation_id: String,
    pub domain_id: String,
}

/// Tag this reference with the new technique, in the same undo step.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct TagFor {
    pub ref_id: String,
    pub region: Option<Region>,
}

/// Absent keeps the field, `null` clears it. Values are trimmed, and `""` clears too.
#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct FieldPatch {
    #[serde(default, deserialize_with = "double_option")]
    pub note: Option<Option<String>>,
    #[serde(default, deserialize_with = "double_option")]
    pub source_url: Option<Option<String>>,
}

/// A present key, `null` included, is `Some`; `default` makes an absent key `None`.
fn double_option<'de, D: Deserializer<'de>>(d: D) -> Result<Option<Option<String>>, D::Error> {
    Option::deserialize(d).map(Some)
}

/// What the window does with a close request (B5).
#[derive(Debug, PartialEq)]
pub enum CloseDecision {
    Close,
    /// The flush failed with this reason: keep the window open and ask.
    Prevent(String),
    /// An import is running, or the UI's intake queue has work: keep the window open; the
    /// import's end (or the queue's drain) closes it.
    Wait,
}

const NO_LIBRARY: &str = "No library is open.";
const TAX_BACKUP: &str = "taxonomy.json could not be read, so Horus opened its backup \
     (taxonomy.bak.json). Your most recent technique changes may be missing.";
const TAX_READ_ONLY: &str = "The library's technique list (taxonomy.json) is damaged and has \
     no usable backup. Horus is showing the starting technique list; your file has been left \
     untouched.";

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

/// The import gate, held by an import, a create or an open. Dropping it releases the gate,
/// then takes a close that came meanwhile (I1).
struct Gate<'a, R: Runtime> {
    app: &'a AppHandle<R>,
    guard: Option<MutexGuard<'a, ()>>,
}

fn hold_gate<R: Runtime>(app: &AppHandle<R>) -> Gate<'_, R> {
    let guard = Some(lock(&app.state::<AppState>().inner().import_gate));
    Gate { app, guard }
}

impl<R: Runtime> Drop for Gate<'_, R> {
    fn drop(&mut self) {
        self.guard.take();
        take_owed_close(self.app);
    }
}

/// Takes a close owed meanwhile, unless the UI's intake queue still has work (R2): its drain
/// takes it instead. `close()` re-raises CloseRequested, so the normal flush (and the B5 dialog
/// if it fails) applies. Callers clear their own busy state first and hold no lock.
fn take_owed_close<R: Runtime>(app: &AppHandle<R>) {
    let st = app.state::<AppState>();
    if !st.intake_busy.load(Ordering::SeqCst)
        && st.close_owed.swap(false, Ordering::SeqCst)
        && let Some(w) = app.get_webview_window("main")
    {
        let _ = w.close();
    }
}

pub(crate) fn library_error(e: LibraryError) -> String {
    match e {
        LibraryError::AlreadyALibrary => {
            "That folder already contains a Horus library. Open it instead.".into()
        }
        LibraryError::NotALibrary => "That folder is not a Horus library.".into(),
        LibraryError::SubfolderNotEmpty => concat!(
            "That folder has other files in it, so Horus would put the library in its ",
            "\"Horus Library\" subfolder, but that subfolder already holds other files. ",
            "Choose an empty folder."
        )
        .into(),
        LibraryError::NewerVersion => "This library was saved by a newer version of Horus.".into(),
        LibraryError::Corrupt { .. } => {
            "The library file is damaged and its backup could not be read either.".into()
        }
        LibraryError::Io(e) => format!("Could not read or write the library: {e}"),
        LibraryError::InvalidFile(_) => "That image file name is not valid.".into(),
    }
}

/// Absolute without `canonicalize`, so paths stay free of the Windows `\?\` prefix.
fn absolute(path: &str) -> Result<PathBuf, String> {
    std::path::absolute(path).map_err(|e| format!("That folder path is not usable: {e}"))
}

fn update_settings(st: &AppState, patch: SettingsPatch) -> Result<(), String> {
    let _guard = lock(&st.settings);
    let mut s = settings::load(&st.config_dir);
    s.merge(patch);
    settings::save(&st.config_dir, &s).map_err(|e| format!("Could not save settings: {e}"))
}

/// Rule: a reference whose hash fails the path guard (a hand-edited library.json) is hidden
/// from the window: no `ReferenceView`, no `related` score, no search hit or technique count.
/// It stays in `lib.data` so saves keep it. Every index build and search reads this view.
fn visible(lib: &Library) -> Cow<'_, LibraryData> {
    let shown = |r: &Reference| thumb_path_in(&lib.root, &r.hash, 256).is_ok();
    if lib.data.references.iter().all(shown) {
        return Cow::Borrowed(&lib.data); // the usual case: nothing hidden, nothing copied
    }
    let mut data = lib.data.clone();
    data.references.retain(shown);
    Cow::Owned(data)
}

/// Saves what is pending. Callers hold the state lock: every save of the open library runs
/// under it, because the tmp names are fixed.
fn flush_open(o: &mut Open) -> Result<(), String> {
    let writable = o.tax_source != TaxSource::SeedReadOnly;
    saver::flush(&mut o.lib, &o.tax, writable, &mut o.debounce)
}

/// Before another library replaces the open one. On `Err` the open one stays.
fn flush_for_switch(open: &mut Option<Open>) -> Result<(), String> {
    match open.as_mut() {
        Some(o) => flush_open(o).map_err(|e| format!("Couldn't save the current library: {e}")),
        None => Ok(()),
    }
}

/// Shared tail of create and open, under the state lock: load the taxonomy (falling back to
/// its backup, then to the read-only seed), index, allow the library's image folders in the
/// asset scope, flush the library it replaces, and make it the open one with a fresh history.
fn install<R: Runtime>(
    app: &AppHandle<R>,
    open: &mut Option<Open>,
    lib: Library,
    seed_warnings: Vec<String>,
) -> Result<LibraryView, String> {
    let st = app.state::<AppState>();
    let mut warnings = seed_warnings.clone();
    if lib.recovered_from_backup {
        warnings.push(
            "library.json could not be read, so Horus opened its backup (library.bak.json). \
             Your most recent changes may be missing."
                .to_string(),
        );
    }
    // A damaged taxonomy never blocks opening.
    let (tax, tax_source) = Taxonomy::load_with_fallback(&lib.root, &st.seed_taxonomy)?;
    match tax_source {
        TaxSource::File => {}
        TaxSource::Backup => warnings.push(TAX_BACKUP.into()),
        TaxSource::SeedReadOnly => warnings.push(TAX_READ_ONLY.into()),
    }
    if let Err(errs) = tax.validate() {
        warnings.push(format!("The taxonomy has problems: {}.", errs.join("; ")));
    }
    // Only the image folders: the window never needs library.json, taxonomy.json or anything
    // else in or beside the root. ponytail: a previously opened library stays in the scope
    // until restart; forbid it on switch if that ever matters.
    for dir in ["images", "thumbs"] {
        app.asset_protocol_scope()
            .allow_directory(lib.root.join(dir), true)
            .map_err(|e| format!("Could not give the window access to the library: {e}"))?;
    }
    let references: Vec<ReferenceView> = lib
        .data
        .references
        .iter()
        .filter_map(|r| ReferenceView::new(&lib.root, r.clone()).ok())
        .collect();
    let hidden = lib.data.references.len() - references.len();
    if hidden > 0 {
        warnings.push(format!(
            "{hidden} references in library.json have an image name Horus did not write, so they are hidden."
        ));
    }
    let view = LibraryView {
        root: lib.root.clone(),
        references,
        links: lib.data.links.clone(),
        warning: (!warnings.is_empty()).then(|| warnings.join(" ")),
        seed_warnings,
        taxonomy_read_only: tax_source == TaxSource::SeedReadOnly,
    };
    // Again here: an edit can land after the caller's first flush (edits skip the gate).
    flush_for_switch(open)?;
    *open = Some(Open {
        index: Index::build(&visible(&lib)),
        lib,
        tax,
        history: History::new(),
        debounce: Debounce::new(Duration::from_millis(SAVE_DEBOUNCE_MS)),
        tax_source,
    });
    Ok(view)
}

/// After the state lock is released (lock order: gate, settings, state): writes the new root
/// to lastLibrary on every open and create.
fn remember(st: &AppState, view: &mut LibraryView) {
    let last = SettingsPatch {
        last_library: Some(view.root.to_string_lossy().into_owned()),
        ..SettingsPatch::default()
    };
    if let Err(e) = update_settings(st, last) {
        view.warning = Some(match view.warning.take() {
            Some(w) => format!("{w} {e}"),
            None => e,
        });
    }
}

// Create and open hold the import gate from the disk read to the state swap, so they wait
// for an in-flight import to save (else its references would be swapped away) and no import
// starts mid-open. Lock order everywhere: import gate, then settings, then state.
// `async` keeps that wait off the main thread.
// The demo seed runs on the new, not yet installed library: no state lock is held while it
// copies files, and `install` swaps it in under the lock, as `run_import` commits.
// `path` is the picked folder; the library may land in its "Horus Library" subfolder, and
// `LibraryView.root` (also saved as lastLibrary) is where it went.
// IPC args: `{ path, seedDemo }` (Tauri camelCases `seed_demo`).
#[tauri::command(async)]
pub fn create_library<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    seed_demo: bool,
) -> Result<LibraryView, String> {
    let root = absolute(&path)?;
    let st = app.state::<AppState>();
    let _gate = hold_gate(&app);
    // Before anything is created on disk, so a refused switch leaves no new library behind.
    flush_for_switch(&mut lock(&st.open))?;
    let mut lib = Library::create(&root, &st.seed_taxonomy).map_err(library_error)?;
    let mut seed_warnings = vec![];
    if seed_demo {
        // From here the library exists, so a seed problem is a warning, except a failed
        // save: then the error is returned and `lib`, never installed, drops with its unsaved
        // demo references (the in-memory rollback). The empty library stays on disk.
        match Taxonomy::load(&lib.root.join("taxonomy.json")) {
            Ok(tax) => {
                let (refs, warnings) = demo::seed(&lib.root, &tax, &st.demo_dir);
                seed_warnings = warnings;
                lib.data.references.extend(refs);
                if let Err(e) = lib.save() {
                    return Err(format!(
                        "The library was created at {}, but the demo set could not be saved. \
                         Open the library to use it without the demo set. {}",
                        lib.root.display(),
                        library_error(e)
                    ));
                }
            }
            Err(e) => seed_warnings.push(format!("The demo set was not added: {e}")),
        }
    }
    let mut view = install(&app, &mut lock(&st.open), lib, seed_warnings)?;
    remember(&st, &mut view);
    Ok(view)
}

/// `path` may also be the folder that holds a "Horus Library" subfolder (first run's "Open an
/// existing library" and the Library menu pick either).
#[tauri::command(async)]
pub fn open_library<R: Runtime>(app: AppHandle<R>, path: String) -> Result<LibraryView, String> {
    let root = absolute(&path)?;
    let st = app.state::<AppState>();
    let _gate = hold_gate(&app);
    let mut view = {
        // The state lock is held from the flush to the swap: reopening the same library must
        // read what the flush wrote, and no edit may land in between.
        let mut open = lock(&st.open);
        flush_for_switch(&mut open)?;
        let lib = match Library::open(&root) {
            Err(LibraryError::NotALibrary) => Library::open(&root.join(SUBFOLDER)),
            other => other,
        }
        .map_err(library_error)?;
        install(&app, &mut open, lib, vec![])?
    };
    remember(&st, &mut view);
    Ok(view)
}

#[tauri::command]
pub fn get_taxonomy<R: Runtime>(app: AppHandle<R>) -> Result<Taxonomy, String> {
    let st = app.state::<AppState>();
    let open = lock(&st.open);
    Ok(open.as_ref().ok_or(NO_LIBRARY)?.tax.clone())
}

#[tauri::command]
pub fn related<R: Runtime>(app: AppHandle<R>, id: String) -> Result<Vec<Scored>, String> {
    let st = app.state::<AppState>();
    let open = lock(&st.open);
    let o = open.as_ref().ok_or(NO_LIBRARY)?;
    Ok(o.index.related(&visible(&o.lib), &id))
}

/// The delta for `touched`, read after the edit. An id both changed and removed counts as
/// removed, and a hidden reference (see `visible`) is never sent.
fn change(o: &Open, touched: &Touched, created: Option<String>) -> Change {
    let removed = touched.removed_ref_ids.clone();
    let wanted: HashSet<&String> = touched
        .ref_ids
        .iter()
        .filter(|id| !removed.contains(id))
        .collect();
    let references = o
        .lib
        .data
        .references
        .iter()
        .filter(|r| wanted.contains(&r.id))
        .filter_map(|r| ReferenceView::new(&o.lib.root, r.clone()).ok())
        .collect();
    Change {
        references,
        removed,
        taxonomy: touched.taxonomy.then(|| o.tax.clone()),
        created,
        can_undo: o.history.can_undo(),
        can_redo: o.history.can_redo(),
    }
}

/// Rebuilds the index when tags or references changed (a note too; cheap enough).
fn reindex(o: &mut Open, touched: &Touched) {
    if !touched.ref_ids.is_empty() || !touched.removed_ref_ids.is_empty() {
        o.index = Index::build(&visible(&o.lib));
    }
}

/// After an edit, undo or redo: reindex, mark what to save, and build the `Change`.
fn settle(o: &mut Open, touched: &Touched, created: Option<String>) -> Change {
    reindex(o, touched);
    let library = !touched.ref_ids.is_empty() || !touched.removed_ref_ids.is_empty();
    o.debounce.touch(Instant::now(), library, touched.taxonomy);
    change(o, touched, created)
}

/// An inverse that changes nothing: its edit is not an undo step (ruling 6).
fn is_noop(e: &Edit) -> bool {
    match e {
        Edit::RemoveTags { removed, .. } => removed.is_empty(),
        Edit::RemoveReferences { removed } => removed.is_empty(),
        Edit::ReplaceTag { before, after, .. } => before == after,
        Edit::SetField { before, after, .. } => before == after,
        Edit::Batch(parts) => parts.iter().all(is_noop),
        _ => false,
    }
}

/// The one recipe for every mutating command except imports. `build` makes the edit (and the
/// `created` id) from the open library, under the lock.
fn commit<R: Runtime>(
    app: &AppHandle<R>,
    build: impl FnOnce(&Open) -> Result<(Edit, Option<String>), String>,
) -> Result<Change, String> {
    let st = app.state::<AppState>();
    let change = {
        let mut open = lock(&st.open);
        let o = open.as_mut().ok_or(NO_LIBRARY)?;
        let (edit, created) = build(o)?;
        // The single read-only check; it covers Plan 3's taxonomy edits too.
        if edit.touches_taxonomy() && o.tax_source == TaxSource::SeedReadOnly {
            return Err("TaxonomyReadOnly".into());
        }
        let applied = edit::apply(&mut o.lib.data, &mut o.tax, edit).map_err(|e| e.to_string())?;
        if !is_noop(&applied.inverse) {
            o.history.record(applied.inverse);
        }
        settle(o, &applied.touched, created)
    };
    st.saver.notify_one();
    hooks::after_change(app, &change);
    Ok(change)
}

/// Undo or redo. Nothing to step is not an error: the `Change` is empty.
fn step<R: Runtime>(app: &AppHandle<R>, redo: bool) -> Result<Change, String> {
    let st = app.state::<AppState>();
    let change = {
        let mut open = lock(&st.open);
        let o = open.as_mut().ok_or(NO_LIBRARY)?;
        let (data, tax) = (&mut o.lib.data, &mut o.tax);
        let touched = if redo {
            o.history.redo(data, tax)
        } else {
            o.history.undo(data, tax)
        };
        match touched.map_err(|e| e.to_string())? {
            Some(t) => settle(o, &t, None),
            None => return Ok(change(o, &Touched::default(), None)),
        }
    };
    st.saver.notify_one();
    hooks::after_change(app, &change);
    Ok(change)
}

fn find_tag<'a>(o: &'a Open, ref_id: &str, tag_id: &str) -> Result<(usize, &'a Tag), String> {
    let r = o.lib.data.references.iter().find(|r| r.id == ref_id);
    let r = r.ok_or_else(|| EditError::UnknownReference(ref_id.into()).to_string())?;
    let t = r.tags.iter().enumerate().find(|(_, t)| t.id == tag_id);
    t.ok_or_else(|| EditError::UnknownTag(tag_id.into()).to_string())
}

/// Trimmed; empty is `None`.
fn clean(v: Option<&str>) -> Option<String> {
    v.map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_owned)
}

/// One undo step for the whole list ("Tag like this").
#[tauri::command]
pub fn add_tags<R: Runtime>(
    app: AppHandle<R>,
    ref_id: String,
    tags: Vec<NewTag>,
) -> Result<Change, String> {
    commit(&app, |_| {
        let tags = tags.into_iter().map(|t| t.into_tag(new_id("t"))).collect();
        Ok((Edit::AddTags { ref_id, tags }, None))
    })
}

/// Replaces the tag, keeping its id. Editing confirms it, so `suggested` becomes false.
#[tauri::command]
pub fn update_tag<R: Runtime>(
    app: AppHandle<R>,
    ref_id: String,
    tag_id: String,
    tag: NewTag,
) -> Result<Change, String> {
    commit(&app, |o| {
        let before = find_tag(o, &ref_id, &tag_id)?.1.clone();
        let after = tag.into_tag(tag_id);
        Ok((
            Edit::ReplaceTag {
                ref_id,
                before,
                after,
            },
            None,
        ))
    })
}

#[tauri::command]
pub fn remove_tag<R: Runtime>(
    app: AppHandle<R>,
    ref_id: String,
    tag_id: String,
) -> Result<Change, String> {
    commit(&app, |o| {
        let (i, t) = find_tag(o, &ref_id, &tag_id)?;
        let removed = vec![(i, t.clone())];
        Ok((Edit::RemoveTags { ref_id, removed }, None))
    })
}

/// One undo step for every id and field.
#[tauri::command]
pub fn set_field<R: Runtime>(
    app: AppHandle<R>,
    ref_ids: Vec<String>,
    patch: FieldPatch,
) -> Result<Change, String> {
    commit(&app, |_| {
        let mut parts = vec![];
        for ref_id in &ref_ids {
            for (field, value) in [
                (Field::Note, &patch.note),
                (Field::SourceUrl, &patch.source_url),
            ] {
                if let Some(v) = value {
                    parts.push(Edit::SetField {
                        ref_id: ref_id.clone(),
                        field,
                        before: None, // `apply` reads the real one
                        after: clean(v.as_deref()),
                    });
                }
            }
        }
        Ok((Edit::Batch(parts), None))
    })
}

/// With `tag`, the technique and the tag are one undo step. `Change.created` is the new id.
/// A name already in use (ignoring case and spacing) is `Err("NameTaken:<id>")`.
#[tauri::command]
pub fn add_technique<R: Runtime>(
    app: AppHandle<R>,
    t: NewTechnique,
    tag: Option<TagFor>,
) -> Result<Change, String> {
    commit(&app, |o| {
        let add = o
            .tax
            .custom_technique(&t.name, &t.description, &t.operation_id, &t.domain_id)
            .map_err(|e| match e {
                CustomError::NameTaken(id) => format!("NameTaken:{id}"),
                e => e.to_string(),
            })?;
        let Edit::AddTechnique { technique, links } = &add else {
            unreachable!("custom_technique builds an AddTechnique");
        };
        let (id, branch_id) = (technique.id.clone(), links[0].branch_id.clone());
        let edit = match tag {
            None => add,
            Some(TagFor { ref_id, region }) => {
                let tag = Tag {
                    id: new_id("t"),
                    operation_id: t.operation_id,
                    technique_id: Some(id.clone()),
                    branch_id: Some(branch_id),
                    region,
                    suggested: false,
                };
                let tags = vec![tag];
                Edit::Batch(vec![add, Edit::AddTags { ref_id, tags }])
            }
        };
        Ok((edit, Some(id)))
    })
}

#[tauri::command]
pub fn undo<R: Runtime>(app: AppHandle<R>) -> Result<Change, String> {
    step(&app, false)
}

#[tauri::command]
pub fn redo<R: Runtime>(app: AppHandle<R>) -> Result<Change, String> {
    step(&app, true)
}

/// Absolute, for the lightbox.
#[tauri::command]
pub fn image_path<R: Runtime>(app: AppHandle<R>, ref_id: String) -> Result<String, String> {
    let st = app.state::<AppState>();
    let open = lock(&st.open);
    let o = open.as_ref().ok_or(NO_LIBRARY)?;
    let r = o.lib.data.references.iter().find(|r| r.id == ref_id);
    let r = r.ok_or_else(|| EditError::UnknownReference(ref_id).to_string())?;
    let path = o.lib.image_path(r).map_err(library_error)?;
    Ok(path.to_string_lossy().into_owned())
}

/// SPEC §6.2: the demo-set images that use each technique, resolved against this library.
#[tauri::command]
pub fn demo_examples<R: Runtime>(app: AppHandle<R>) -> Result<Vec<DemoExample>, String> {
    let st = app.state::<AppState>();
    let open = lock(&st.open);
    let o = open.as_ref().ok_or(NO_LIBRARY)?;
    Ok(demo::examples(&o.tax, &st.demo_dir))
}

/// Runs off the main thread. The state lock is held only to read the known hashes and,
/// afterwards, to append, save and reindex; never while files are copied.
#[tauri::command]
pub async fn import_paths<R: Runtime>(
    app: AppHandle<R>,
    paths: Vec<String>,
    note: Option<String>,
    source_url: Option<String>,
) -> Result<ImportResult, String> {
    let paths = paths.into_iter().map(PathBuf::from).collect();
    tauri::async_runtime::spawn_blocking(move || run_import(&app, paths, note, source_url))
        .await
        .map_err(|e| format!("The import stopped unexpectedly: {e}"))?
}

/// Saves at once and rolls back on failure (B3); an import that added something is one undo
/// step, and one that added nothing is none.
fn run_import<R: Runtime>(
    app: &AppHandle<R>,
    paths: Vec<PathBuf>,
    note: Option<String>,
    source_url: Option<String>,
) -> Result<ImportResult, String> {
    let st = app.state::<AppState>();
    // Taken before the hash snapshot, so a queued import sees the previous one's results.
    // Every exit releases it and takes a close owed meanwhile (I1).
    let gate = hold_gate(app);
    let (root, known) = {
        let open = lock(&st.open);
        let lib = &open.as_ref().ok_or(NO_LIBRARY)?.lib;
        let known = lib
            .data
            .references
            .iter()
            .map(|r| (r.hash.clone(), r.id.clone()))
            .collect();
        (lib.root.clone(), known)
    };
    let out = import::import_paths(&root, &known, &paths);
    let (note, source_url) = (clean(note.as_deref()), clean(source_url.as_deref()));
    let refs = out.references.into_iter().map(|mut r| {
        r.note = note.clone();
        r.source_url = source_url.clone();
        r
    });
    let change = {
        let mut open = lock(&st.open);
        let Some(o) = open.as_mut().filter(|o| o.lib.root == root) else {
            return Err(
                "Another library was opened during the import, so nothing was added to it.".into(),
            );
        };
        let add = Edit::AddReferences {
            refs: refs.collect(),
        };
        let applied = edit::apply(&mut o.lib.data, &mut o.tax, add).map_err(|e| e.to_string())?;
        // Nothing added (duplicates or skips only): nothing to save and no undo step.
        if !out.report.added.is_empty() {
            // Through `flush`, not a bare `lib.save()`: a pending custom technique is written
            // to taxonomy.json before library.json holds tags that use it. The save also
            // writes any pending tag edits.
            let pending = o.debounce.library_dirty();
            o.debounce.touch(Instant::now(), true, false);
            if let Err(e) = flush_open(o) {
                // Memory must match disk: take back what was not saved. The index is rebuilt
                // only after a good save, so it still describes the rolled-back references.
                edit::apply_inverse(&mut o.lib.data, &mut o.tax, applied.inverse)
                    .expect("the inverse of an edit just applied applies");
                if !pending {
                    o.debounce.clear_library(); // the rollback left nothing to save
                }
                // A close that waited for this import would now flush nothing and close,
                // losing the import unseen: drop it, so the artist sees why (R1).
                st.close_owed.store(false, Ordering::SeqCst);
                return Err(e);
            }
            o.history.record(applied.inverse);
        }
        reindex(o, &applied.touched);
        change(o, &applied.touched, None)
    };
    drop(gate); // hooks run with no lock held, as in `commit`
    hooks::after_change(app, &change);
    Ok(ImportResult {
        report: out.report,
        change,
    })
}

/// A pasted image: the raw body is the image, and the `x-meta` header holds
/// `encodeURIComponent(JSON.stringify({ name, note?, sourceUrl? }))` (headers are ASCII only).
#[tauri::command]
pub async fn import_bytes<R: Runtime>(
    app: AppHandle<R>,
    request: tauri::ipc::Request<'_>,
) -> Result<ImportResult, String> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("The pasted image did not arrive as image data.".into());
    };
    let meta = request.headers().get("x-meta").map(|v| v.to_str());
    let meta = meta.and_then(Result::ok).unwrap_or_default().to_owned();
    let bytes = bytes.clone();
    let app2 = app.clone();
    tauri::async_runtime::spawn_blocking(move || paste(&app, &std::env::temp_dir(), &bytes, &meta))
        .await
        .map_err(|e| {
            drop_owed_close(&app2);
            format!("The import stopped unexpectedly: {e}")
        })?
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PasteMeta {
    name: String,
    note: Option<String>,
    source_url: Option<String>,
}

/// Stages the bytes in a fresh temp dir under `staging`, outside the library (B1: the import
/// refuses anything inside it), under the pasted name so the title is its stem, imports them,
/// and drops the dir.
fn paste<R: Runtime>(
    app: &AppHandle<R>,
    staging: &Path,
    bytes: &[u8],
    meta: &str,
) -> Result<ImportResult, String> {
    let out = (|| {
        let unreadable = |e: String| format!("The pasted image's details could not be read: {e}");
        let meta = percent_decode(meta).map_err(unreadable)?;
        let meta: PasteMeta = serde_json::from_str(&meta).map_err(|e| unreadable(e.to_string()))?;
        let staged = |e: std::io::Error| format!("The pasted image could not be staged: {e}");
        let dir = tempfile::tempdir_in(staging).map_err(staged)?;
        let path = dir.path().join(paste_name(&meta.name));
        std::fs::write(&path, bytes).map_err(staged)?;
        run_import(app, vec![path], meta.note, meta.source_url)
    })();
    let lost = match &out {
        Err(_) => true,
        Ok(r) => r
            .report
            .skipped
            .iter()
            .any(|(_, s)| matches!(s, import::Skip::WriteFailed(_))),
    };
    if lost {
        drop_owed_close(app);
    }
    out
}

/// A paste's bytes exist nowhere else: when it fails, a close owed meanwhile is dropped, so the
/// window stays open on the failure (R1, round 2). The intake is busy during a paste, so no gate
/// has taken the close yet.
fn drop_owed_close<R: Runtime>(app: &AppHandle<R>) {
    app.state::<AppState>()
        .close_owed
        .store(false, Ordering::SeqCst);
}

/// The last path component, with `< > : " / \ | ? *` and control characters as `_`. Nothing
/// left (or only dots, as in `..`) is `pasted.png`.
fn paste_name(name: &str) -> String {
    let last = name.rsplit(['/', '\\']).next().unwrap_or_default();
    let safe: String = last
        .chars()
        .map(|c| {
            if c.is_control() || "<>:\"/\\|?*".contains(c) {
                '_'
            } else {
                c
            }
        })
        .collect();
    if safe.chars().all(|c| c == '.' || c.is_whitespace()) {
        "pasted.png".into()
    } else {
        safe
    }
}

/// `%XX` escapes to bytes, then UTF-8. A malformed escape or invalid UTF-8 is an `Err`.
fn percent_decode(s: &str) -> Result<String, String> {
    let hex = |b: Option<u8>| b.and_then(|b| char::from(b).to_digit(16));
    let mut out = Vec::with_capacity(s.len());
    let mut bytes = s.bytes();
    while let Some(b) = bytes.next() {
        if b != b'%' {
            out.push(b);
            continue;
        }
        match (hex(bytes.next()), hex(bytes.next())) {
            (Some(hi), Some(lo)) => out.push((hi * 16 + lo) as u8),
            _ => return Err("a % is not followed by two hex digits".into()),
        }
    }
    String::from_utf8(out).map_err(|_| "it is not UTF-8 text".into())
}

#[tauri::command]
pub fn search<R: Runtime>(app: AppHandle<R>, q: String) -> Result<Vec<Hit>, String> {
    let st = app.state::<AppState>();
    let open = lock(&st.open);
    let o = open.as_ref().ok_or(NO_LIBRARY)?;
    Ok(search::search(&o.tax, &visible(&o.lib), &q))
}

#[tauri::command]
pub fn get_settings<R: Runtime>(app: AppHandle<R>) -> Result<Settings, String> {
    let st = app.state::<AppState>();
    let _guard = lock(&st.settings);
    Ok(settings::load(&st.config_dir))
}

/// `s` is a patch: absent or null fields keep their stored value.
#[tauri::command]
pub fn set_settings<R: Runtime>(app: AppHandle<R>, s: SettingsPatch) -> Result<(), String> {
    update_settings(&app.state::<AppState>(), s)
}

/// Total physical memory in whole GB, for the first-run Find similar step. `None` if unknown.
#[tauri::command]
pub fn system_ram_gb() -> Option<u64> {
    let mut sys = sysinfo::System::new().ok()?;
    sys.refresh_memory();
    let bytes = sys.total_memory();
    (bytes > 0).then(|| (bytes + (1 << 29)) >> 30)
}

/// The background saver: flushes the open library once its debounce is due. It waits on the
/// `saver` Condvar, with the deadline as the timeout, and with none when idle or after a
/// failed flush (held until the next edit), so it never spins. Emits `save-status`.
pub fn start_saver<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    std::thread::spawn(move || {
        let st = app.state::<AppState>();
        let mut open = lock(&st.open);
        loop {
            let now = Instant::now();
            open = match open.as_ref().and_then(|o| o.debounce.deadline()) {
                None => st.saver.wait(open).unwrap_or_else(PoisonError::into_inner),
                // A newer edit moves the deadline, so it is re-read after every wake.
                Some(due) if due > now => {
                    let woke = st.saver.wait_timeout(open, due - now);
                    woke.unwrap_or_else(PoisonError::into_inner).0
                }
                Some(_) => {
                    let saved = open.as_mut().map_or(Ok(()), flush_open);
                    drop(open); // never emit under the state lock
                    let status = match saved {
                        Ok(()) => serde_json::json!({ "ok": true }),
                        Err(message) => serde_json::json!({ "ok": false, "message": message }),
                    };
                    let _ = app.emit("save-status", status);
                    lock(&st.open)
                }
            };
        }
    });
}

/// B5, as a pure decision: flush unless the artist chose to quit without saving. While an
/// import runs it waits instead (I1): the close is owed, and the import's end takes it. Never
/// blocks, so the UI thread is not held for the import's length.
pub fn close_decision(st: &AppState) -> CloseDecision {
    if st.skip_close_flush.load(Ordering::SeqCst) {
        return CloseDecision::Close;
    }
    // Owed before the try: an import that ends in between still sees it (no lost wake-up).
    st.close_owed.store(true, Ordering::SeqCst);
    if st.intake_busy.load(Ordering::SeqCst) {
        return CloseDecision::Wait; // a paste queued in the UI has not reached Rust yet (R2)
    }
    let _gate = match st.import_gate.try_lock() {
        Err(TryLockError::WouldBlock) => return CloseDecision::Wait,
        Err(TryLockError::Poisoned(p)) => p.into_inner(),
        Ok(g) => g,
    };
    st.close_owed.store(false, Ordering::SeqCst);
    match lock(&st.open).as_mut().map(flush_open) {
        Some(Err(reason)) => CloseDecision::Prevent(reason),
        _ => CloseDecision::Close,
    }
}

/// The UI's intake queue went busy (`true`) or drained (`false`). A close owed while it was
/// busy is taken once it drains (R2).
#[tauri::command]
pub fn intake_busy<R: Runtime>(app: AppHandle<R>, busy: bool) {
    app.state::<AppState>()
        .intake_busy
        .store(busy, Ordering::SeqCst);
    take_owed_close(&app);
}

/// The save-failure dialog's "Try again". On a good flush Rust closes the window itself, so
/// the UI needs no window-destroy permission.
#[tauri::command]
pub fn retry_save<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    let st = app.state::<AppState>();
    match close_decision(&st) {
        CloseDecision::Prevent(reason) => return Err(reason),
        CloseDecision::Wait => return Ok(()), // the running import's end closes the window
        CloseDecision::Close => {}
    }
    st.skip_close_flush.store(true, Ordering::SeqCst);
    if let Some(w) = app.get_webview_window("main") {
        w.destroy().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// The save-failure dialog's "Quit without saving".
#[tauri::command]
pub fn exit_without_saving<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
    app.state::<AppState>()
        .skip_close_flush
        .store(true, Ordering::SeqCst);
    app.exit(0);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{FindSimilar, Theme};
    use std::fs;
    use std::path::Path;
    use std::sync::Arc;
    use std::sync::atomic::AtomicUsize;
    use std::time::Duration;
    use tauri::Listener;
    use tauri::test::{MockRuntime, mock_builder, mock_context, noop_assets};

    struct Env {
        _dir: tempfile::TempDir,
        app: tauri::App<MockRuntime>,
        lib: String,
    }

    impl Env {
        fn handle(&self) -> AppHandle<MockRuntime> {
            self.app.handle().clone()
        }
        fn import(&self, name: &str) -> Result<ImportReport, String> {
            import_with(self.handle(), name).map(|r| r.report)
        }
        fn settings(&self) -> Settings {
            get_settings(self.handle()).unwrap()
        }
    }

    fn import_with(h: AppHandle<MockRuntime>, name: &str) -> Result<ImportResult, String> {
        let p = fixture(name).to_string_lossy().into_owned();
        tauri::async_runtime::block_on(import_paths(h, vec![p], None, None))
    }

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures")
            .join(name)
    }

    /// A mock app whose config dir is a tempdir, so tests never touch the real settings.
    fn env() -> Env {
        let dir = tempfile::tempdir().unwrap();
        let res = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources");
        let app = mock_builder()
            .invoke_handler(tauri::generate_handler![create_library, import_bytes])
            .manage(AppState::new(
                dir.path().join("config"),
                res.join("taxonomy.json"),
                res.join("demo"),
            ))
            .build(mock_context(noop_assets()))
            .unwrap();
        start_saver(app.handle());
        let lib = dir.path().join("lib").to_string_lossy().into_owned();
        Env {
            _dir: dir,
            app,
            lib,
        }
    }

    fn created() -> Env {
        let e = env();
        create_library(e.handle(), e.lib.clone(), false).unwrap();
        e
    }

    #[test]
    fn seed_demo_imports_manifest_tags() {
        let e = env();
        let started = std::time::Instant::now();
        let view = create_library(e.handle(), e.lib.clone(), true).unwrap();
        eprintln!("seeded in {:?}", started.elapsed());
        let manifest: serde_json::Value = serde_json::from_slice(
            &fs::read(Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/demo/manifest.json"))
                .unwrap(),
        )
        .unwrap();
        let records = manifest.as_array().unwrap();
        assert_eq!(view.seed_warnings, Vec::<String>::new());
        assert_eq!(view.warning, None);
        assert_eq!(view.references.len(), records.len());
        let tax = get_taxonomy(e.handle()).unwrap();
        let mut ids = std::collections::HashSet::new();
        for (rec, r) in records.iter().zip(&view.references) {
            let r = &r.reference;
            assert_eq!(r.title, rec["title"].as_str().unwrap());
            assert_eq!(r.creator.as_deref(), rec["creator"].as_str());
            assert_eq!(r.source_url.as_deref(), rec["sourceUrl"].as_str());
            let sugg = rec["suggestedTechniques"].as_array().unwrap();
            assert_eq!(r.tags.len(), sugg.len(), "{}", r.title);
            for (s, t) in sugg.iter().zip(&r.tags) {
                assert!(t.suggested);
                assert!(ids.insert(t.id.clone()), "duplicate tag id {}", t.id);
                let tech = tax
                    .techniques
                    .iter()
                    .find(|x| Some(&x.id) == t.technique_id.as_ref());
                assert_eq!(tech.unwrap().name, s["technique"].as_str().unwrap());
                let branch = t.branch_id.as_deref().unwrap();
                assert!(tax.branches.iter().any(|b| b.id == branch), "{branch}");
                assert_eq!(t.region.is_some(), s.get("region").is_some());
            }
        }
        // Saved, not just returned.
        let again = open_library(e.handle(), e.lib.clone()).unwrap();
        assert_eq!(again.references.len(), records.len());
        assert_eq!(
            again.references[0].reference.tags,
            view.references[0].reference.tags
        );
    }

    #[test]
    fn create_with_seed_demo_arg_name_is_camel() {
        let e = env();
        let webview = tauri::WebviewWindowBuilder::new(&e.app, "main", Default::default())
            .build()
            .unwrap();
        let call = |args: serde_json::Value| {
            tauri::test::get_ipc_response(
                &webview,
                tauri::webview::InvokeRequest {
                    cmd: "create_library".into(),
                    callback: tauri::ipc::CallbackFn(0),
                    error: tauri::ipc::CallbackFn(1),
                    url: "http://tauri.localhost".parse().unwrap(),
                    body: args.into(),
                    headers: Default::default(),
                    invoke_key: tauri::test::INVOKE_KEY.to_string(),
                },
            )
        };
        let snake = call(serde_json::json!({"path": e.lib, "seed_demo": false}));
        let err = snake.unwrap_err().to_string();
        assert!(err.contains("seedDemo"), "{err}");
        let ok = call(serde_json::json!({"path": e.lib, "seedDemo": false}));
        let view: serde_json::Value = ok.unwrap().deserialize().unwrap();
        assert_eq!(view["seedWarnings"], serde_json::json!([]));
    }

    #[test]
    fn system_ram_is_reported() {
        let gb = system_ram_gb().expect("RAM detected");
        assert!((1..=4096).contains(&gb), "{gb}");
    }

    #[test]
    fn create_then_related_roundtrip() {
        let e = created();
        let first = e.import("small.jpg").unwrap();
        assert_eq!(first.added.len(), 1);
        let second = e.import("small.jpg").unwrap();
        assert!(second.added.is_empty());
        assert_eq!(second.duplicates.len(), 1);
        assert_eq!(related(e.handle(), first.added[0].clone()), Ok(vec![]));
        assert!(get_taxonomy(e.handle()).unwrap().operations.len() > 1);
        assert!(search(e.handle(), "small".into()).is_ok());
    }

    #[test]
    fn settings_default_find_similar_unset() {
        let s = env().settings();
        assert_eq!(s.find_similar, FindSimilar::Unset);
        assert_eq!(s.theme, Theme::System);
        assert_eq!(s.last_library, None);
        let json = serde_json::to_value(&s).unwrap();
        assert_eq!(
            json,
            serde_json::json!({"lastLibrary": null, "theme": "system", "findSimilar": "unset"})
        );
    }

    #[test]
    fn set_settings_patch_keeps_last_library() {
        let e = created();
        let lib = e.settings().last_library.expect("create sets lastLibrary");
        assert!(Path::new(&lib).is_absolute());

        let patch = serde_json::from_value(serde_json::json!({"theme": "dark"})).unwrap();
        set_settings(e.handle(), patch).unwrap();
        let s = e.settings();
        assert_eq!(
            (s.theme, s.last_library.as_deref()),
            (Theme::Dark, Some(&*lib))
        );

        // api.ts sends a whole Settings; `lastLibrary: null` means "leave it".
        let full = serde_json::json!({"lastLibrary": null, "theme": "light", "findSimilar": "on"});
        set_settings(e.handle(), serde_json::from_value(full).unwrap()).unwrap();
        let s = e.settings();
        assert_eq!(s.last_library.as_deref(), Some(&*lib));
        assert_eq!((s.theme, s.find_similar), (Theme::Light, FindSimilar::On));
    }

    #[test]
    fn open_recovered_library_returns_warning() {
        let e = created();
        e.import("small.jpg").unwrap(); // second save: library.bak.json now exists
        let ok = open_library(e.handle(), e.lib.clone()).unwrap();
        assert_eq!(ok.warning, None);

        fs::write(Path::new(&e.lib).join("library.json"), "{").unwrap();
        let view = open_library(e.handle(), e.lib.clone()).unwrap();
        assert!(view.warning.unwrap().contains("backup"));
    }

    #[test]
    fn open_reports_taxonomy_problems_without_failing() {
        let e = created();
        let path = Path::new(&e.lib).join("taxonomy.json");
        let mut tax: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        let first = tax["operations"][0].clone();
        tax["operations"].as_array_mut().unwrap().push(first);
        fs::write(&path, serde_json::to_vec(&tax).unwrap()).unwrap();
        let view = open_library(e.handle(), e.lib.clone()).unwrap();
        assert!(view.warning.unwrap().contains("duplicate operation id"));
    }

    #[test]
    fn errors_are_readable() {
        let e = created();
        assert_eq!(
            create_library(e.handle(), e.lib.clone(), false).unwrap_err(),
            "That folder already contains a Horus library. Open it instead."
        );
        let empty = Path::new(&e.lib)
            .join("images")
            .to_string_lossy()
            .into_owned();
        assert_eq!(
            open_library(e.handle(), empty).unwrap_err(),
            "That folder is not a Horus library."
        );
        let fresh = env();
        assert_eq!(
            fresh.import("small.jpg").unwrap_err(),
            "No library is open."
        );
    }

    /// A picked folder that already holds the user's own files: `<tmp>/Pictures/mine.jpg` and
    /// `<tmp>/Pictures/Photos/small.jpg`.
    fn pictures(e: &Env) -> PathBuf {
        let pics = Path::new(&e.lib).with_file_name("Pictures");
        fs::create_dir_all(pics.join("Photos")).unwrap();
        fs::copy(fixture("small.jpg"), pics.join("mine.jpg")).unwrap();
        fs::copy(fixture("rotated.jpg"), pics.join("Photos/small.jpg")).unwrap();
        pics
    }

    #[test]
    fn create_refuses_existing_library_with_open_hint() {
        let e = created();
        let hint = "That folder already contains a Horus library. Open it instead.";
        assert_eq!(
            create_library(e.handle(), e.lib.clone(), false).unwrap_err(),
            hint
        );
        // The same answer when the library sits in the "Horus Library" subfolder.
        let pics = pictures(&e).to_string_lossy().into_owned();
        create_library(e.handle(), pics.clone(), false).unwrap();
        assert_eq!(create_library(e.handle(), pics, false).unwrap_err(), hint);
    }

    #[test]
    fn scope_allows_only_images_and_thumbs() {
        let e = env();
        let pics = pictures(&e);
        let view = create_library(e.handle(), pics.to_string_lossy().into_owned(), false).unwrap();
        e.import("small.jpg").unwrap();
        let view = open_library(e.handle(), view.root.to_string_lossy().into_owned()).unwrap();
        let r = &view.references[0];
        let scope = e.app.asset_protocol_scope();
        assert!(scope.is_allowed(&r.thumb256) && scope.is_allowed(&r.thumb1024));
        assert!(scope.is_allowed(view.root.join("images").join(&r.reference.file)));
        for denied in [
            view.root.join("library.json"),
            view.root.join("library.bak.json"),
            view.root.join("taxonomy.json"),
            pics.join("mine.jpg"),
            pics.join("Photos/small.jpg"),
        ] {
            assert!(denied.is_file(), "{}", denied.display());
            assert!(!scope.is_allowed(&denied), "{}", denied.display());
        }
    }

    #[test]
    fn import_from_parent_of_subfolder_library_works() {
        let e = env();
        let pics = pictures(&e);
        let view = create_library(e.handle(), pics.to_string_lossy().into_owned(), false).unwrap();
        assert_eq!(view.root, pics.join("Horus Library"));
        let sibling = pics.join("Photos").to_string_lossy().into_owned();
        let r = tauri::async_runtime::block_on(import_paths(e.handle(), vec![sibling], None, None))
            .unwrap()
            .report;
        assert_eq!(r.added.len(), 1, "{:?}", r.skipped);
        // The picked folder itself: its own image is added, the library inside is not walked.
        let parent = pics.to_string_lossy().into_owned();
        let r = tauri::async_runtime::block_on(import_paths(e.handle(), vec![parent], None, None))
            .unwrap()
            .report;
        assert_eq!((r.added.len(), r.duplicates.len()), (1, 1));
        assert!(r.skipped.is_empty(), "{:?}", r.skipped);
        let settings_root = e.settings().last_library.unwrap();
        assert_eq!(Path::new(&settings_root), view.root);
    }

    #[test]
    fn open_refuses_newer_version() {
        let e = created();
        e.import("small.jpg").unwrap(); // a good v1 library.bak.json now exists
        let path = Path::new(&e.lib).join("library.json");
        let mut data: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        data["version"] = 2.into();
        data["references"] = "a shape this version cannot read".into();
        fs::write(&path, serde_json::to_vec(&data).unwrap()).unwrap();
        assert_eq!(
            open_library(e.handle(), e.lib.clone()).unwrap_err(),
            "This library was saved by a newer version of Horus."
        );
    }

    #[test]
    fn import_save_failure_rolls_back_memory() {
        let e = created();
        // A folder squatting on the fixed temp name makes `save` fail.
        let blocker = Path::new(&e.lib).join("library.json.tmp");
        fs::create_dir(&blocker).unwrap();
        let err = e.import("small.jpg").unwrap_err();
        assert!(
            err.starts_with("Could not read or write the library"),
            "{err}"
        );
        {
            let st = e.app.state::<AppState>();
            let open = lock(&st.open);
            assert!(open.as_ref().unwrap().lib.data.references.is_empty());
        }
        let hits = search(e.handle(), "small".into()).unwrap();
        assert!(
            !hits.iter().any(|h| matches!(h, Hit::Reference { .. })),
            "{hits:?}"
        );
        // Once the disk is writable again the same file imports cleanly, once.
        fs::remove_dir(&blocker).unwrap();
        assert_eq!(e.import("small.jpg").unwrap().added.len(), 1);
        assert_eq!(
            open_library(e.handle(), e.lib.clone())
                .unwrap()
                .references
                .len(),
            1
        );
    }

    /// `import_bytes` over the wire, as `api.ts` sends it: a raw body plus the `x-meta` header.
    fn paste_ipc(
        webview: &tauri::WebviewWindow<MockRuntime>,
        bytes: Vec<u8>,
        meta: &str,
    ) -> Result<ImportReport, String> {
        let mut headers = tauri::http::HeaderMap::new();
        headers.insert("x-meta", meta.parse().unwrap());
        let res = tauri::test::get_ipc_response(
            webview,
            tauri::webview::InvokeRequest {
                cmd: "import_bytes".into(),
                callback: tauri::ipc::CallbackFn(0),
                error: tauri::ipc::CallbackFn(1),
                url: "http://tauri.localhost".parse().unwrap(),
                body: tauri::ipc::InvokeBody::Raw(bytes),
                headers,
                invoke_key: tauri::test::INVOKE_KEY.to_string(),
            },
        );
        let v: serde_json::Value = res.map_err(|e| e.to_string())?.deserialize().unwrap();
        assert!(v["change"]["canUndo"].is_boolean(), "{v}"); // camelCase on the wire
        Ok(ImportReport {
            added: serde_json::from_value(v["report"]["added"].clone()).unwrap(),
            duplicates: serde_json::from_value(v["report"]["duplicates"].clone()).unwrap(),
            ..ImportReport::default()
        })
    }

    #[test]
    fn import_twice_is_serialised_and_deduped() {
        let e = created();
        let webview = tauri::WebviewWindowBuilder::new(&e.app, "paste", Default::default())
            .build()
            .unwrap();
        let bytes = fs::read(fixture("small.jpg")).unwrap();
        let (a, b) = std::thread::scope(|s| {
            let h = e.handle();
            let a = s.spawn(move || import_with(h, "small.jpg"));
            let b = s.spawn(|| paste_ipc(&webview, bytes, "%7B%22name%22%3A%22pasted.jpg%22%7D"));
            (
                a.join().unwrap().unwrap().report,
                b.join().unwrap().unwrap(),
            )
        });
        assert_eq!(a.added.len() + b.added.len(), 1);
        assert_eq!(a.duplicates.len() + b.duplicates.len(), 1);
        let view = open_library(e.handle(), e.lib.clone()).unwrap();
        assert_eq!(view.references.len(), 1);
    }

    #[test]
    fn bad_hash_is_hidden_not_fatal() {
        let e = created();
        e.import("small.jpg").unwrap();
        // A hand-edited library.json: one more reference whose hash would point outside thumbs/.
        let path = Path::new(&e.lib).join("library.json");
        let mut json: serde_json::Value =
            serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        // Both share Chiaroscuro, so the hidden one would score as related and count in search.
        let tag = serde_json::json!([{ "id": "t1", "operationId": "differentiate",
            "techniqueId": "chiaroscuro", "branchId": "differentiate.feature", "suggested": false }]);
        json["references"][0]["tags"] = tag.clone();
        let good = json["references"][0]["id"].as_str().unwrap().to_string();
        let mut bad = json["references"][0].clone();
        bad["id"] = "bad".into();
        bad["hash"] = "../../evil".into();
        bad["title"] = "Evil plate".into();
        bad["tags"] = tag;
        json["references"].as_array_mut().unwrap().push(bad);
        fs::write(&path, serde_json::to_vec(&json).unwrap()).unwrap();

        let view = open_library(e.handle(), e.lib.clone()).unwrap();
        assert_eq!(view.references.len(), 1);
        assert_ne!(view.references[0].reference.id, "bad");
        let warning = view.warning.unwrap();
        assert!(
            warning.contains(
                "1 references in library.json have an image name Horus did not write, so they are hidden."
            ),
            "{warning}"
        );
        // Hidden everywhere the window can reach: related, search hits and technique counts.
        let rel = related(e.handle(), good.clone()).unwrap();
        assert!(rel.iter().all(|x| x.id != "bad"), "{rel:?}");
        let hits = search(e.handle(), "chiaroscuro".into()).unwrap();
        assert!(
            hits.contains(&Hit::Technique {
                id: "chiaroscuro".into(),
                operation_id: "differentiate".into(),
                count: 1,
            }),
            "{hits:?}"
        );
        let hits = search(e.handle(), "evil plate".into()).unwrap();
        assert!(
            !hits.contains(&Hit::Reference { id: "bad".into() }),
            "{hits:?}"
        );
        // Hidden, not dropped: the next save (an import) keeps the entry.
        e.import("p3_red.png").unwrap();
        // Still hidden after an edit's reindex (ruling 8), and never sent in a Change.
        let rel = related(e.handle(), good.clone()).unwrap();
        assert!(rel.iter().all(|x| x.id != "bad"), "{rel:?}");
        let patch = serde_json::from_value(serde_json::json!({"note": "n"})).unwrap();
        let c = set_field(e.handle(), vec!["bad".into()], patch).unwrap();
        assert!(c.references.is_empty(), "{c:?}");
        let saved: serde_json::Value = serde_json::from_slice(&fs::read(&path).unwrap()).unwrap();
        let refs = saved["references"].as_array().unwrap();
        assert_eq!(refs.len(), 3);
        assert!(
            refs.iter()
                .any(|r| r["id"] == "bad" && r["hash"] == "../../evil")
        );
    }

    #[test]
    fn thumb_paths_are_absolute_and_exist() {
        let e = created();
        e.import("small.jpg").unwrap();
        let view = open_library(e.handle(), e.lib.clone()).unwrap();
        let r = &view.references[0];
        for thumb in [&r.thumb256, &r.thumb1024] {
            assert!(
                thumb.is_absolute() && thumb.is_file(),
                "{}",
                thumb.display()
            );
            assert!(e.app.asset_protocol_scope().is_allowed(thumb));
        }
        let json = serde_json::to_value(&view).unwrap();
        let r = &json["references"][0];
        assert!(r["thumb256"].is_string() && r["addedAt"].is_string());
        assert!(json["root"].is_string());
    }

    #[test]
    fn open_waits_for_inflight_import() {
        let e = created();
        // small.jpg first (its thumbnail is the "import has started" signal), then a big
        // image that keeps the import busy long after that.
        let src = tempfile::tempdir().unwrap();
        fs::copy(fixture("small.jpg"), src.path().join("a_small.jpg")).unwrap();
        image::RgbImage::from_fn(1500, 1500, |x, y| image::Rgb([x as u8, y as u8, 7]))
            .save(src.path().join("b_big.png"))
            .unwrap();
        let thumbs = Path::new(&e.lib).join("thumbs/256");
        let view = std::thread::scope(|s| {
            let (h, p) = (e.handle(), src.path().to_string_lossy().into_owned());
            let import = s.spawn(move || {
                tauri::async_runtime::block_on(import_paths(h, vec![p], None, None))
                    .unwrap()
                    .report
            });
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
            while fs::read_dir(&thumbs).unwrap().next().is_none() {
                assert!(std::time::Instant::now() < deadline, "import never started");
                std::thread::yield_now();
            }
            let view = open_library(e.handle(), e.lib.clone()).unwrap();
            assert_eq!(import.join().unwrap().added.len(), 2);
            view
        });
        assert_eq!(view.references.len(), 2, "open read the library mid-import");
        let st = e.app.state::<AppState>();
        let open = lock(&st.open);
        assert_eq!(open.as_ref().unwrap().lib.data.references.len(), 2);
    }

    // ---------- Plan 2 Task 5: tagging, undo, intake and close ----------

    /// A technique tag on the seed taxonomy (seed ids are allowed in seed-fixture tests).
    fn chiaroscuro() -> NewTag {
        NewTag {
            operation_id: "differentiate".into(),
            technique_id: Some("chiaroscuro".into()),
            branch_id: Some("differentiate.feature".into()),
            region: None,
        }
    }

    fn st(e: &Env) -> tauri::State<'_, AppState> {
        e.app.state::<AppState>()
    }

    /// A created library with `small.jpg` imported; returns its id.
    fn with_small() -> (Env, String) {
        let e = created();
        let id = e.import("small.jpg").unwrap().added[0].clone();
        (e, id)
    }

    fn tags_of<'a>(c: &'a Change, id: &str) -> &'a [Tag] {
        let r = c.references.iter().find(|r| r.reference.id == id).unwrap();
        &r.reference.tags
    }

    fn saved(e: &Env) -> serde_json::Value {
        serde_json::from_slice(&fs::read(Path::new(&e.lib).join("library.json")).unwrap()).unwrap()
    }

    fn saved_tag_count(e: &Env) -> usize {
        saved(e)["references"][0]["tags"]
            .as_array()
            .map_or(0, Vec::len)
    }

    /// Waits for the saver to take the pending save, without touching library.json meanwhile:
    /// on Windows an open read handle makes the save's rename fail.
    fn wait_saved(e: &Env) {
        let state = st(e);
        poll("the debounced save never ran", || {
            lock(&state.open)
                .as_ref()
                .unwrap()
                .debounce
                .deadline()
                .is_none()
        });
    }

    fn poll(what: &str, mut ok: impl FnMut() -> bool) {
        let deadline = Instant::now() + Duration::from_secs(2);
        while !ok() {
            assert!(Instant::now() < deadline, "{what}");
            std::thread::sleep(Duration::from_millis(20));
        }
    }

    #[test]
    fn add_tags_then_undo_redo() {
        let (e, id) = with_small();
        let c = add_tags(e.handle(), id.clone(), vec![chiaroscuro()]).unwrap();
        assert!(c.can_undo && !c.can_redo);
        let tag = tags_of(&c, &id)[0].clone();
        assert!(tag.id.starts_with("t-") && !tag.suggested);
        let c = undo(e.handle()).unwrap();
        assert!(tags_of(&c, &id).is_empty());
        assert!(c.can_redo);
        let c = redo(e.handle()).unwrap();
        assert_eq!(tags_of(&c, &id), [tag]);
    }

    #[test]
    fn update_tag_confirms_suggestion() {
        let (e, id) = with_small();
        let c = add_tags(e.handle(), id.clone(), vec![chiaroscuro()]).unwrap();
        let tag_id = tags_of(&c, &id)[0].id.clone();
        lock(&st(&e).open).as_mut().unwrap().lib.data.references[0].tags[0].suggested = true;
        let c = update_tag(e.handle(), id.clone(), tag_id.clone(), chiaroscuro()).unwrap();
        let t = &tags_of(&c, &id)[0];
        assert_eq!((t.id.as_str(), t.suggested), (tag_id.as_str(), false));
    }

    #[test]
    fn invalid_tag_is_err_and_no_history() {
        let (e, id) = with_small();
        let bad = NewTag {
            operation_id: "group".into(),
            technique_id: Some("pop-out".into()),
            branch_id: Some("group.grouping".into()),
            region: None,
        };
        assert!(add_tags(e.handle(), id.clone(), vec![bad]).is_err());
        // An empty list is not an undo step either (ruling 6).
        add_tags(e.handle(), id, vec![]).unwrap();
        // The one step left is the import's: neither call above recorded one.
        assert!(!undo(e.handle()).unwrap().can_undo);
    }

    fn halo() -> NewTechnique {
        NewTechnique {
            name: "Halo glow".into(),
            description: "A soft light around the subject.".into(),
            operation_id: "differentiate".into(),
            domain_id: "feature".into(),
        }
    }

    #[test]
    fn custom_technique_then_undo_restores_taxonomy() {
        let (e, id) = with_small();
        let tag = TagFor {
            ref_id: id.clone(),
            region: None,
        };
        let c = add_technique(e.handle(), halo(), Some(tag)).unwrap();
        assert_eq!(c.created.as_deref(), Some("halo-glow"));
        let tax = c.taxonomy.as_ref().expect("the taxonomy changed");
        assert!(
            tax.techniques
                .iter()
                .any(|t| t.id == "halo-glow" && t.custom)
        );
        assert_eq!(
            tags_of(&c, &id)[0].technique_id.as_deref(),
            Some("halo-glow")
        );
        // The same name again, spaced and cased differently, is refused with the existing id.
        let again = NewTechnique {
            name: "  halo   GLOW ".into(),
            ..halo()
        };
        assert_eq!(
            add_technique(e.handle(), again, None).unwrap_err(),
            "NameTaken:halo-glow"
        );
        // One undo removes both the tag and the technique.
        let c = undo(e.handle()).unwrap();
        assert!(tags_of(&c, &id).is_empty());
        let tax = c.taxonomy.unwrap();
        assert!(!tax.techniques.iter().any(|t| t.id == "halo-glow"));
        assert!(c.can_undo, "the import is still undoable");
        assert!(c.can_redo);
    }

    #[test]
    fn set_field_patch_is_one_step() {
        let (e, a) = with_small();
        let b = e.import("p3_red.png").unwrap().added[0].clone();
        let patch: FieldPatch = serde_json::from_value(
            serde_json::json!({"note": " harbour ", "sourceUrl": "https://x"}),
        )
        .unwrap();
        let c = set_field(e.handle(), vec![a.clone(), b.clone()], patch).unwrap();
        assert_eq!(c.references.len(), 2);
        for r in &c.references {
            assert_eq!(r.reference.note.as_deref(), Some("harbour"));
            assert_eq!(r.reference.source_url.as_deref(), Some("https://x"));
        }
        let c = undo(e.handle()).unwrap();
        assert_eq!(c.references.len(), 2);
        for r in &c.references {
            assert_eq!((&r.reference.note, &r.reference.source_url), (&None, &None));
        }
        // Absent keeps, null clears ("" is trimmed to a clear when applied).
        let keep: FieldPatch = serde_json::from_value(serde_json::json!({})).unwrap();
        assert!(keep.note.is_none() && keep.source_url.is_none());
        let clear: FieldPatch =
            serde_json::from_value(serde_json::json!({"note": null, "sourceUrl": ""})).unwrap();
        assert_eq!(clear.note, Some(None));
        assert_eq!(clear.source_url, Some(Some(String::new())));
        let c = set_field(e.handle(), vec![a], clear).unwrap();
        let r = &c.references[0].reference;
        assert_eq!((&r.note, &r.source_url), (&None, &None));
    }

    #[test]
    fn import_with_note_and_undo() {
        let e = created();
        let p = fixture("small.jpg").to_string_lossy().into_owned();
        let r = tauri::async_runtime::block_on(import_paths(
            e.handle(),
            vec![p],
            Some("rim light ref".into()),
            Some("https://example.org/a".into()),
        ))
        .unwrap();
        let id = r.report.added[0].clone();
        let made = &r.change.references[0].reference;
        assert_eq!(made.note.as_deref(), Some("rim light ref"));
        assert_eq!(made.source_url.as_deref(), Some("https://example.org/a"));
        assert!(r.change.can_undo);
        // On disk at once: imports are not debounced (B3).
        let disk = &saved(&e)["references"][0];
        assert_eq!(disk["note"], "rim light ref");
        assert_eq!(disk["sourceUrl"], "https://example.org/a");
        let c = undo(e.handle()).unwrap();
        assert_eq!(c.removed, [id]);
        assert!(c.references.is_empty());
        let image = Path::new(&e.lib).join("images").join(&made.file);
        assert!(image.is_file(), "undo keeps the image file (Decision 2)");
    }

    /// AGY #3: a rolled-back import leaves nothing pending, so close does not ask.
    #[test]
    fn failed_import_leaves_nothing_to_save() {
        let e = created();
        fs::create_dir(Path::new(&e.lib).join("library.json.tmp")).unwrap();
        assert!(e.import("small.jpg").is_err());
        assert_eq!(close_decision(&st(&e)), CloseDecision::Close);
    }

    #[test]
    fn duplicate_only_import_does_not_rewrite() {
        let e = created();
        e.import("small.jpg").unwrap();
        let path = Path::new(&e.lib).join("library.json");
        let mtime = fs::metadata(&path).unwrap().modified().unwrap();
        std::thread::sleep(Duration::from_millis(20));
        assert_eq!(e.import("small.jpg").unwrap().duplicates.len(), 1);
        assert_eq!(fs::metadata(&path).unwrap().modified().unwrap(), mtime);
    }

    #[test]
    fn duplicate_only_import_records_no_step() {
        let e = created();
        assert!(
            import_with(e.handle(), "small.jpg")
                .unwrap()
                .change
                .can_undo
        );
        let second = import_with(e.handle(), "small.jpg").unwrap();
        assert_eq!(second.report.duplicates.len(), 1);
        assert!(second.change.can_undo); // the first import's step
        assert!(
            !undo(e.handle()).unwrap().can_undo,
            "the second import added no step"
        );
    }

    /// Everything under `root` except `images/` and `thumbs/`, as relative paths.
    fn outside_media(root: &Path) -> Vec<PathBuf> {
        walkdir::WalkDir::new(root)
            .into_iter()
            .map(|e| e.unwrap().path().strip_prefix(root).unwrap().to_path_buf())
            .filter(|p| !p.starts_with("images") && !p.starts_with("thumbs"))
            .collect()
    }

    /// `encodeURIComponent(JSON.stringify(json))`, close enough for these names.
    fn meta(json: serde_json::Value) -> String {
        json.to_string()
            .bytes()
            .map(|b| match b {
                b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' => {
                    char::from(b).to_string()
                }
                _ => format!("%{b:02X}"),
            })
            .collect()
    }

    #[test]
    fn import_bytes_roundtrip() {
        let e = created();
        let staging = tempfile::tempdir().unwrap();
        let root = Path::new(&e.lib);
        let before = outside_media(root);
        let bytes = fs::read(fixture("small.jpg")).unwrap();
        let header = meta(serde_json::json!({"name": "pasted.jpg", "note": "from the web"}));
        let r = paste(&e.handle(), staging.path(), &bytes, &header).unwrap();
        assert_eq!(r.report.added.len(), 1);
        let made = &r.change.references[0].reference;
        assert_eq!(made.title, "pasted");
        assert_eq!(made.note.as_deref(), Some("from the web"));
        assert!(r.change.can_undo);
        let left = fs::read_dir(staging.path()).unwrap().count();
        assert_eq!(left, 0, "the staging dir is gone");
        // library.json was rewritten and its backup rotated; nothing else appeared.
        let mut after = outside_media(root);
        after.retain(|p| !before.contains(p) && p != Path::new("library.bak.json"));
        assert!(after.is_empty(), "{after:?}");
    }

    #[test]
    fn import_bytes_name_is_contained() {
        let e = created();
        let jpg = fs::read(fixture("small.jpg")).unwrap();
        let png = fs::read(fixture("p3_red.png")).unwrap();
        let outer = tempfile::tempdir().unwrap();
        let staging = outer.path().join("staging");
        fs::create_dir(&staging).unwrap();
        for (name, bytes) in [("../../evil.jpg", &jpg), ("C:\\x\\evil.jpg", &png)] {
            let header = meta(serde_json::json!({ "name": name }));
            let r = paste(&e.handle(), &staging, bytes, &header).unwrap();
            assert_eq!(r.change.references[0].reference.title, "evil", "{name}");
        }
        let around = fs::read_dir(outer.path()).unwrap().count();
        assert_eq!(around, 1, "only the staging dir: nothing escaped it");
        assert_eq!(fs::read_dir(&staging).unwrap().count(), 0);
        assert_eq!(paste_name(".."), "pasted.png");
        assert_eq!(paste_name(""), "pasted.png");
        assert_eq!(paste_name("a<b>:c|d?*\u{7}.png"), "a_b__c_d___.png");
    }

    #[test]
    fn import_bytes_unicode_name() {
        let e = created();
        let staging = tempfile::tempdir().unwrap();
        let bytes = fs::read(fixture("small.jpg")).unwrap();
        let header = "%7B%22name%22%3A%22%C3%89tude.png%22%7D"; // {"name":"Étude.png"}
        let r = paste(&e.handle(), staging.path(), &bytes, header).unwrap();
        assert_eq!(r.change.references[0].reference.title, "Étude");
        assert!(paste(&e.handle(), staging.path(), &bytes, "%ZZ").is_err());
        assert!(paste(&e.handle(), staging.path(), &bytes, "not%20json").is_err());
    }

    #[test]
    fn percent_decode_cases() {
        assert_eq!(percent_decode("%C3%89tude").as_deref(), Ok("Étude"));
        assert_eq!(percent_decode("a%20b").as_deref(), Ok("a b"));
        assert!(percent_decode("%E").is_err());
        assert!(percent_decode("%ZZ").is_err());
        assert!(percent_decode("%FF").is_err(), "not UTF-8");
    }

    #[test]
    fn after_change_hook_fires() {
        let (e, id) = with_small(); // before the hook: not counted
        let calls = Arc::new(AtomicUsize::new(0));
        let seen = calls.clone();
        hooks::register(&e.handle(), move |_| {
            seen.fetch_add(1, Ordering::SeqCst);
        });
        let c = add_tags(e.handle(), id.clone(), vec![chiaroscuro()]).unwrap();
        let tag_id = tags_of(&c, &id)[0].id.clone();
        update_tag(e.handle(), id.clone(), tag_id.clone(), chiaroscuro()).unwrap();
        remove_tag(e.handle(), id.clone(), tag_id).unwrap();
        let patch = serde_json::from_value(serde_json::json!({"note": "n"})).unwrap();
        set_field(e.handle(), vec![id], patch).unwrap();
        add_technique(e.handle(), halo(), None).unwrap();
        undo(e.handle()).unwrap();
        redo(e.handle()).unwrap();
        e.import("p3_red.png").unwrap();
        let staging = tempfile::tempdir().unwrap();
        let bytes = fs::read(fixture("rotated.jpg")).unwrap();
        let header = meta(serde_json::json!({"name": "r.jpg"}));
        paste(&e.handle(), staging.path(), &bytes, &header).unwrap();
        assert_eq!(calls.load(Ordering::SeqCst), 9);
    }

    /// Ruling 5: an id both changed and removed is sent as removed only.
    #[test]
    fn removed_wins_in_change() {
        let (e, id) = with_small();
        let state = st(&e);
        let open = lock(&state.open);
        let touched = Touched {
            ref_ids: vec![id.clone()],
            removed_ref_ids: vec![id.clone()],
            taxonomy: false,
        };
        let c = change(open.as_ref().unwrap(), &touched, None);
        assert!(c.references.is_empty());
        assert_eq!(c.removed, [id]);
    }

    #[test]
    fn debounced_save_lands() {
        let (e, id) = with_small();
        add_tags(e.handle(), id, vec![chiaroscuro()]).unwrap();
        assert_eq!(saved_tag_count(&e), 0, "not saved at once");
        wait_saved(&e);
        assert_eq!(saved_tag_count(&e), 1);
    }

    /// Ruling 1: after a failed flush the saver waits for the next edit; it never spins.
    #[test]
    fn failed_background_flush_does_not_spin() {
        let (e, id) = with_small();
        let statuses = Arc::new(Mutex::new(vec![]));
        let seen = statuses.clone();
        e.app.listen_any("save-status", move |ev| {
            let v: serde_json::Value = serde_json::from_str(ev.payload()).unwrap();
            lock(&seen).push(v);
        });
        fs::create_dir(Path::new(&e.lib).join("library.json.tmp")).unwrap();
        add_tags(e.handle(), id, vec![chiaroscuro()]).unwrap();
        poll("the saver never tried", || !lock(&statuses).is_empty());
        std::thread::sleep(Duration::from_millis(1000));
        let got = lock(&statuses).clone();
        assert_eq!(
            got.len(),
            1,
            "one try, then wait for the next edit: {got:?}"
        );
        assert_eq!(got[0]["ok"], false);
        let message = got[0]["message"].as_str().unwrap();
        assert!(
            message.starts_with("Could not read or write the library"),
            "{message}"
        );
        let state = st(&e);
        let open = lock(&state.open);
        assert_eq!(open.as_ref().unwrap().debounce.deadline(), None);
    }

    #[test]
    fn close_flushes_pending() {
        let (e, id) = with_small();
        add_tags(e.handle(), id, vec![chiaroscuro()]).unwrap();
        assert_eq!(close_decision(&st(&e)), CloseDecision::Close);
        assert_eq!(saved_tag_count(&e), 1);
    }

    #[test]
    fn close_save_failure_prevents() {
        let (e, id) = with_small();
        let blocker = Path::new(&e.lib).join("library.json.tmp");
        fs::create_dir(&blocker).unwrap();
        add_tags(e.handle(), id, vec![chiaroscuro()]).unwrap();
        let CloseDecision::Prevent(reason) = close_decision(&st(&e)) else {
            panic!("the close went ahead with unsaved changes");
        };
        assert!(
            reason.starts_with("Could not read or write the library"),
            "{reason}"
        );
        eprintln!("close reason: {reason}");
        assert_eq!(retry_save(e.handle()), Err(reason));
        // "Quit without saving" sets this flag; its app.exit(0) is not run in a test.
        st(&e).skip_close_flush.store(true, Ordering::SeqCst);
        fs::remove_dir(&blocker).unwrap();
        assert_eq!(close_decision(&st(&e)), CloseDecision::Close);
        assert_eq!(saved_tag_count(&e), 0, "closed without flushing");
    }

    /// I1: a close during an import waits (and owes a close); with the gate free it flushes.
    #[test]
    fn close_waits_while_the_import_gate_is_held() {
        let e = created();
        let state = st(&e);
        {
            let _gate = lock(&state.import_gate);
            assert_eq!(close_decision(&state), CloseDecision::Wait);
            assert_eq!(
                close_decision(&state),
                CloseDecision::Wait,
                "a second close"
            );
            assert!(state.close_owed.load(Ordering::SeqCst));
        }
        assert_eq!(close_decision(&state), CloseDecision::Close);
        assert!(!state.close_owed.load(Ordering::SeqCst));
    }

    /// I1: create and open hold the gate too, off the main thread; releasing it takes the
    /// owed close, so a close during a switch is not left for the next import.
    #[test]
    fn releasing_the_gate_takes_the_owed_close() {
        let e = created();
        let state = st(&e);
        let h = e.handle();
        let gate = hold_gate(&h);
        assert_eq!(close_decision(&state), CloseDecision::Wait);
        drop(gate);
        assert!(!state.close_owed.load(Ordering::SeqCst));
    }

    /// I1: a close mid-import never loses it; once the import has saved, the owed close is
    /// taken (its `window.close()` re-runs the normal flush, which is not unit-tested here).
    #[test]
    fn close_mid_import_waits_then_closes() {
        let e = created();
        let src = tempfile::tempdir().unwrap();
        fs::copy(fixture("small.jpg"), src.path().join("a_small.jpg")).unwrap();
        image::RgbImage::from_fn(1500, 1500, |x, y| image::Rgb([x as u8, y as u8, 7]))
            .save(src.path().join("b_big.png"))
            .unwrap();
        let thumbs = Path::new(&e.lib).join("thumbs/256");
        let state = st(&e);
        std::thread::scope(|s| {
            let (h, p) = (e.handle(), src.path().to_string_lossy().into_owned());
            let import = s.spawn(move || {
                tauri::async_runtime::block_on(import_paths(h, vec![p], None, None)).unwrap()
            });
            let deadline = std::time::Instant::now() + std::time::Duration::from_secs(60);
            while fs::read_dir(&thumbs).unwrap().next().is_none() {
                assert!(std::time::Instant::now() < deadline, "import never started");
                std::thread::yield_now();
            }
            assert_eq!(close_decision(&state), CloseDecision::Wait);
            assert_eq!(
                close_decision(&state),
                CloseDecision::Wait,
                "a second close"
            );
            assert_eq!(import.join().unwrap().report.added.len(), 2);
        });
        assert!(
            !state.close_owed.load(Ordering::SeqCst),
            "the import's end took the owed close"
        );
        assert_eq!(saved(&e)["references"].as_array().unwrap().len(), 2);
        assert_eq!(close_decision(&state), CloseDecision::Close);
    }

    /// R2: a paste still queued in the UI has not reached Rust; the close waits for the queue.
    #[test]
    fn close_waits_while_the_intake_is_busy() {
        let e = created();
        let state = st(&e);
        intake_busy(e.handle(), true);
        assert_eq!(
            close_decision(&state),
            CloseDecision::Wait,
            "the gate is free"
        );
        assert!(state.close_owed.load(Ordering::SeqCst));
    }

    /// R2: the queue draining takes the owed close.
    #[test]
    fn draining_the_intake_takes_the_owed_close() {
        let e = created();
        let state = st(&e);
        intake_busy(e.handle(), true);
        assert_eq!(close_decision(&state), CloseDecision::Wait);
        intake_busy(e.handle(), false);
        assert!(!state.close_owed.load(Ordering::SeqCst));
        assert_eq!(close_decision(&state), CloseDecision::Close);
    }

    /// R2: an import ending mid-queue leaves the close to the queue's end.
    #[test]
    fn the_gate_leaves_the_close_to_a_busy_intake() {
        let e = created();
        let state = st(&e);
        intake_busy(e.handle(), true);
        let h = e.handle();
        let gate = hold_gate(&h);
        assert_eq!(close_decision(&state), CloseDecision::Wait);
        drop(gate);
        assert!(state.close_owed.load(Ordering::SeqCst), "still owed");
        intake_busy(e.handle(), false);
        assert!(!state.close_owed.load(Ordering::SeqCst));
    }

    /// R1: a waited import whose save fails drops the owed close, so the window stays open
    /// and shows the failure; the next close is a fresh decision.
    #[test]
    fn a_failed_import_drops_the_owed_close() {
        let e = created();
        let state = st(&e);
        intake_busy(e.handle(), true); // a UI import runs inside the intake queue
        assert_eq!(close_decision(&state), CloseDecision::Wait);
        let blocker = Path::new(&e.lib).join("library.json.tmp");
        fs::create_dir(&blocker).unwrap();
        assert!(e.import("small.jpg").is_err());
        assert!(
            !state.close_owed.load(Ordering::SeqCst),
            "the failure dropped the close"
        );
        intake_busy(e.handle(), false);
        fs::remove_dir(&blocker).unwrap();
        assert_eq!(close_decision(&state), CloseDecision::Close);
    }

    /// Round 2: a paste whose copy fails exists nowhere else, so a close owed meanwhile is
    /// dropped and the skip row shows.
    #[test]
    fn a_paste_that_could_not_be_written_drops_the_owed_close() {
        let e = created();
        let state = st(&e);
        intake_busy(e.handle(), true);
        assert_eq!(close_decision(&state), CloseDecision::Wait);
        let bytes = fs::read(fixture("small.jpg")).unwrap();
        let hash = blake3::hash(&bytes).to_hex().to_string();
        // A folder squatting on the destination makes the copy fail.
        fs::create_dir_all(
            crate::library::image_path_in(Path::new(&e.lib), &format!("{hash}.jpg")).unwrap(),
        )
        .unwrap();
        let staging = tempfile::tempdir().unwrap();
        let meta = "%7B%22name%22%3A%22pasted.jpg%22%7D";
        let out = paste(&e.handle(), staging.path(), &bytes, meta).unwrap();
        assert!(matches!(
            out.report.skipped.as_slice(),
            [(_, import::Skip::WriteFailed(_))]
        ));
        assert!(!state.close_owed.load(Ordering::SeqCst));
    }

    /// Round 2: a paste that fails before it reaches the gate drops the owed close too.
    #[test]
    fn a_paste_that_could_not_be_staged_drops_the_owed_close() {
        let e = created();
        let state = st(&e);
        intake_busy(e.handle(), true);
        assert_eq!(close_decision(&state), CloseDecision::Wait);
        let gone = tempfile::tempdir().unwrap().path().join("gone");
        let meta = "%7B%22name%22%3A%22pasted.jpg%22%7D";
        assert!(paste(&e.handle(), &gone, b"x", meta).is_err());
        assert!(!state.close_owed.load(Ordering::SeqCst));
    }

    #[test]
    fn open_clears_history() {
        let (e, id) = with_small();
        assert!(
            add_tags(e.handle(), id, vec![chiaroscuro()])
                .unwrap()
                .can_undo
        );
        let view = open_library(e.handle(), e.lib.clone()).unwrap();
        let tags = &view.references[0].reference.tags;
        assert_eq!(tags.len(), 1, "flushed before reopening");
        let c = undo(e.handle()).unwrap();
        assert!(!c.can_undo && c.references.is_empty());
    }

    #[test]
    fn open_falls_back_to_horus_library_subfolder() {
        let e = env();
        let pics = pictures(&e);
        let made = create_library(e.handle(), pics.to_string_lossy().into_owned(), false).unwrap();
        assert_eq!(made.root, pics.join(SUBFOLDER));
        let view = open_library(e.handle(), pics.to_string_lossy().into_owned()).unwrap();
        assert_eq!(view.root, pics.join(SUBFOLDER));
        let photos = pics.join("Photos").to_string_lossy().into_owned();
        assert_eq!(
            open_library(e.handle(), photos).unwrap_err(),
            "That folder is not a Horus library."
        );
        let direct = open_library(e.handle(), made.root.to_string_lossy().into_owned()).unwrap();
        assert_eq!(direct.root, made.root);
    }

    #[test]
    fn damaged_taxonomy_opens() {
        let (e, id) = with_small();
        let root = Path::new(&e.lib);
        let tax_path = root.join("taxonomy.json");
        fs::copy(&tax_path, root.join("taxonomy.bak.json")).unwrap();
        fs::write(&tax_path, "{").unwrap();
        let view = open_library(e.handle(), e.lib.clone()).unwrap();
        assert!(!view.taxonomy_read_only);
        let warning = view.warning.unwrap();
        assert!(warning.contains(TAX_BACKUP), "{warning}");

        fs::write(root.join("taxonomy.bak.json"), "{").unwrap();
        let view = open_library(e.handle(), e.lib.clone()).unwrap();
        assert!(view.taxonomy_read_only);
        let json = serde_json::to_value(&view).unwrap();
        assert_eq!(json["taxonomyReadOnly"], true);
        let warning = view.warning.unwrap();
        assert!(warning.contains(TAX_READ_ONLY), "{warning}");
        assert_eq!(
            add_technique(e.handle(), halo(), None).unwrap_err(),
            "TaxonomyReadOnly"
        );
        // Any edit that touches the taxonomy, nested in a batch too, meets the same check.
        let fake = get_taxonomy(e.handle())
            .unwrap()
            .custom_technique("Fake", "", "differentiate", "feature")
            .unwrap();
        let untagged = Edit::AddTags {
            ref_id: id.clone(),
            tags: vec![],
        };
        let sent = commit(&e.handle(), |_| {
            Ok((Edit::Batch(vec![untagged, fake]), None))
        });
        assert_eq!(sent.unwrap_err(), "TaxonomyReadOnly");
        // Tagging still works, and taxonomy.json is never written. A flush saves the taxonomy
        // before the library, so once the tag is on disk any taxonomy write would be too.
        add_tags(e.handle(), id, vec![chiaroscuro()]).unwrap();
        wait_saved(&e);
        assert_eq!(saved_tag_count(&e), 1);
        assert_eq!(fs::read(&tax_path).unwrap(), b"{");
    }

    #[test]
    fn demo_examples_resolve() {
        let e = created();
        let tax = get_taxonomy(e.handle()).unwrap();
        let images = Path::new(env!("CARGO_MANIFEST_DIR")).join("resources/demo/images");
        let all = demo_examples(e.handle()).unwrap();
        assert!(!all.is_empty());
        for x in &all {
            assert!(
                tax.techniques.iter().any(|t| t.id == x.technique_id),
                "{x:?}"
            );
            let p = Path::new(&x.path);
            assert!(
                p.is_absolute() && p.is_file() && p.starts_with(&images),
                "{x:?}"
            );
        }
        // A name the taxonomy lacks is skipped, not panicked on; a repeat is listed once.
        let demo = tempfile::tempdir().unwrap();
        fs::create_dir(demo.path().join("images")).unwrap();
        fs::copy(fixture("small.jpg"), demo.path().join("images/a.jpg")).unwrap();
        let silhouette = serde_json::json!({"technique": "Silhouette", "operation": "Differentiate", "domain": "Feature"});
        let manifest = serde_json::json!([{"id": "a", "file": "images/a.jpg", "title": "Plate A",
        "suggestedTechniques": [
            {"technique": "Not a technique", "operation": "Differentiate", "domain": "Feature"},
            silhouette, silhouette
        ]}]);
        fs::write(demo.path().join("manifest.json"), manifest.to_string()).unwrap();
        let got = demo::examples(&tax, demo.path());
        assert_eq!(got.len(), 1, "{got:?}");
        assert_eq!(
            (got[0].technique_id.as_str(), got[0].title.as_str()),
            ("silhouette", "Plate A")
        );
    }

    #[test]
    fn switch_flushes_pending() {
        let e = env();
        let b = Path::new(&e.lib).with_file_name("B");
        let b = b.to_string_lossy().into_owned();
        create_library(e.handle(), b.clone(), false).unwrap();
        create_library(e.handle(), e.lib.clone(), false).unwrap();
        let id = e.import("small.jpg").unwrap().added[0].clone();
        add_tags(e.handle(), id.clone(), vec![chiaroscuro()]).unwrap();
        open_library(e.handle(), b.clone()).unwrap();
        assert_eq!(
            saved_tag_count(&e),
            1,
            "A's pending tag was saved before the switch"
        );

        open_library(e.handle(), e.lib.clone()).unwrap();
        fs::create_dir(Path::new(&e.lib).join("library.json.tmp")).unwrap();
        add_tags(e.handle(), id, vec![chiaroscuro()]).unwrap();
        let err = open_library(e.handle(), b).unwrap_err();
        eprintln!("switch refusal: {err}");
        assert!(
            err.starts_with("Couldn't save the current library: "),
            "{err}"
        );
        let state = st(&e);
        let open = lock(&state.open);
        assert_eq!(
            open.as_ref().unwrap().lib.root,
            Path::new(&e.lib),
            "A stays open"
        );
    }
}
