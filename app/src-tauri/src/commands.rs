//! Tauri commands: the IPC surface `src/api.ts` calls. Every command returns
//! `Result<T, String>` with a message the UI can show as-is. All JSON is camelCase.

use crate::correlate::{Index, Scored};
use crate::demo;
use crate::import::{self, ImportReport};
use crate::library::{Library, LibraryError, thumb_path_in};
use crate::model::{Link, Reference};
use crate::search::{self, Hit};
use crate::settings::{self, Settings, SettingsPatch};
use crate::taxonomy::Taxonomy;
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Mutex, MutexGuard, PoisonError};
use tauri::{AppHandle, Manager, Runtime};

pub struct AppState {
    open: Mutex<Option<(Library, Taxonomy, Index)>>,
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

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct LibraryView {
    root: PathBuf,
    references: Vec<ReferenceView>,
    links: Vec<Link>,
    warning: Option<String>,
    /// Demo-seed problems (unknown names, skipped images); also joined into `warning`.
    seed_warnings: Vec<String>,
}

const NO_LIBRARY: &str = "No library is open.";

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(PoisonError::into_inner)
}

fn library_error(e: LibraryError) -> String {
    match e {
        LibraryError::AlreadyALibrary => "That folder already contains a Horus library.".into(),
        LibraryError::NotALibrary => "That folder is not a Horus library.".into(),
        LibraryError::Corrupt { .. } => {
            "The library file is damaged and its backup could not be read either.".into()
        }
        LibraryError::Io(e) => format!("Could not read or write the library: {e}"),
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

/// Shared tail of create and open: load and check the taxonomy, index, allow the library
/// in the asset scope, remember it as the last library, and make it the open one.
fn install<R: Runtime>(
    app: &AppHandle<R>,
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
    let tax = Taxonomy::load(&lib.root.join("taxonomy.json"))
        .map_err(|e| format!("Could not read the library's taxonomy: {e}"))?;
    if let Err(errs) = tax.validate() {
        warnings.push(format!("The taxonomy has problems: {}.", errs.join("; ")));
    }
    // ponytail: a previously opened library stays in the scope until restart; forbid it on
    // switch if that ever matters.
    app.asset_protocol_scope()
        .allow_directory(&lib.root, true)
        .map_err(|e| format!("Could not give the window access to the library: {e}"))?;
    let last = SettingsPatch {
        last_library: Some(lib.root.to_string_lossy().into_owned()),
        ..SettingsPatch::default()
    };
    if let Err(e) = update_settings(&st, last) {
        warnings.push(e);
    }
    let view = LibraryView {
        root: lib.root.clone(),
        references: lib
            .data
            .references
            .iter()
            .map(|r| ReferenceView {
                reference: r.clone(),
                thumb256: thumb_path_in(&lib.root, &r.hash, 256),
                thumb1024: thumb_path_in(&lib.root, &r.hash, 1024),
            })
            .collect(),
        links: lib.data.links.clone(),
        warning: (!warnings.is_empty()).then(|| warnings.join(" ")),
        seed_warnings,
    };
    let index = Index::build(&lib.data);
    *lock(&st.open) = Some((lib, tax, index));
    Ok(view)
}

// Create and open hold the import gate from the disk read to the state swap, so they wait
// for an in-flight import to save (else its references would be swapped away) and no import
// starts mid-open. Lock order everywhere: import gate, then settings, then state.
// `async` keeps that wait off the main thread.
// The demo seed runs on the new, not yet installed library: no state lock is held while it
// copies files, and `install` swaps it in under the lock, as `run_import` commits.
// IPC args: `{ path, seedDemo }` (Tauri camelCases `seed_demo`).
#[tauri::command(async)]
pub fn create_library<R: Runtime>(
    app: AppHandle<R>,
    path: String,
    seed_demo: bool,
) -> Result<LibraryView, String> {
    let root = absolute(&path)?;
    let st = app.state::<AppState>();
    let _gate = lock(&st.import_gate);
    let mut lib = Library::create(&root, &st.seed_taxonomy).map_err(library_error)?;
    let mut seed_warnings = vec![];
    if seed_demo {
        // From here the library exists, so a seed problem is a warning, never an error.
        match Taxonomy::load(&lib.root.join("taxonomy.json")) {
            Ok(tax) => {
                let (refs, warnings) = demo::seed(&lib.root, &tax, &st.demo_dir);
                seed_warnings = warnings;
                lib.data.references.extend(refs);
                if let Err(e) = lib.save() {
                    seed_warnings.push(format!("The demo set was not saved: {}", library_error(e)));
                }
            }
            Err(e) => seed_warnings.push(format!("The demo set was not added: {e}")),
        }
    }
    install(&app, lib, seed_warnings)
}

#[tauri::command(async)]
pub fn open_library<R: Runtime>(app: AppHandle<R>, path: String) -> Result<LibraryView, String> {
    let root = absolute(&path)?;
    let st = app.state::<AppState>();
    let _gate = lock(&st.import_gate);
    let lib = Library::open(&root).map_err(library_error)?;
    install(&app, lib, vec![])
}

#[tauri::command]
pub fn get_taxonomy<R: Runtime>(app: AppHandle<R>) -> Result<Taxonomy, String> {
    let st = app.state::<AppState>();
    let open = lock(&st.open);
    let (_, tax, _) = open.as_ref().ok_or(NO_LIBRARY)?;
    Ok(tax.clone())
}

#[tauri::command]
pub fn related<R: Runtime>(app: AppHandle<R>, id: String) -> Result<Vec<Scored>, String> {
    let st = app.state::<AppState>();
    let open = lock(&st.open);
    let (lib, _, index) = open.as_ref().ok_or(NO_LIBRARY)?;
    Ok(index.related(&lib.data, &id))
}

/// Runs off the main thread. The state lock is held only to read the known hashes and,
/// afterwards, to append, rebuild the index and save; never while files are copied.
#[tauri::command]
pub async fn import_paths<R: Runtime>(
    app: AppHandle<R>,
    paths: Vec<String>,
) -> Result<ImportReport, String> {
    tauri::async_runtime::spawn_blocking(move || run_import(&app.state::<AppState>(), paths))
        .await
        .map_err(|e| format!("The import stopped unexpectedly: {e}"))?
}

fn run_import(st: &AppState, paths: Vec<String>) -> Result<ImportReport, String> {
    // Taken before the hash snapshot, so a queued import sees the previous one's results.
    let _gate = lock(&st.import_gate);
    let (root, known) = {
        let open = lock(&st.open);
        let (lib, _, _) = open.as_ref().ok_or(NO_LIBRARY)?;
        let known = lib
            .data
            .references
            .iter()
            .map(|r| (r.hash.clone(), r.id.clone()))
            .collect();
        (lib.root.clone(), known)
    };
    let paths: Vec<PathBuf> = paths.into_iter().map(PathBuf::from).collect();
    let out = import::import_paths(&root, &known, &paths);
    let mut open = lock(&st.open);
    let Some((lib, _, index)) = open.as_mut().filter(|(lib, _, _)| lib.root == root) else {
        return Err(
            "Another library was opened during the import, so nothing was added to it.".into(),
        );
    };
    lib.data.references.extend(out.references);
    *index = Index::build(&lib.data);
    lib.save().map_err(library_error)?;
    Ok(out.report)
}

#[tauri::command]
pub fn search<R: Runtime>(app: AppHandle<R>, q: String) -> Result<Vec<Hit>, String> {
    let st = app.state::<AppState>();
    let open = lock(&st.open);
    let (lib, tax, _) = open.as_ref().ok_or(NO_LIBRARY)?;
    Ok(search::search(tax, &lib.data, &q))
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{FindSimilar, Theme};
    use std::fs;
    use std::path::Path;
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
            import_with(self.handle(), name)
        }
        fn settings(&self) -> Settings {
            get_settings(self.handle()).unwrap()
        }
    }

    fn import_with(h: AppHandle<MockRuntime>, name: &str) -> Result<ImportReport, String> {
        let p = fixture(name).to_string_lossy().into_owned();
        tauri::async_runtime::block_on(import_paths(h, vec![p]))
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
            .invoke_handler(tauri::generate_handler![create_library])
            .manage(AppState::new(
                dir.path().join("config"),
                res.join("taxonomy.json"),
                res.join("demo"),
            ))
            .build(mock_context(noop_assets()))
            .unwrap();
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
            "That folder already contains a Horus library."
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

    #[test]
    fn import_twice_is_serialised_and_deduped() {
        let e = created();
        let (a, b) = std::thread::scope(|s| {
            let (h1, h2) = (e.handle(), e.handle());
            let a = s.spawn(move || import_with(h1, "small.jpg"));
            let b = s.spawn(move || import_with(h2, "small.jpg"));
            (a.join().unwrap().unwrap(), b.join().unwrap().unwrap())
        });
        assert_eq!(a.added.len() + b.added.len(), 1);
        assert_eq!(a.duplicates.len() + b.duplicates.len(), 1);
        let view = open_library(e.handle(), e.lib.clone()).unwrap();
        assert_eq!(view.references.len(), 1);
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
            let import =
                s.spawn(move || tauri::async_runtime::block_on(import_paths(h, vec![p])).unwrap());
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
        assert_eq!(open.as_ref().unwrap().0.data.references.len(), 2);
    }
}
