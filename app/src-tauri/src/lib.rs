pub mod commands;
pub mod correlate;
pub mod demo;
pub mod edit;
pub mod export;
pub mod history;
pub mod hooks;
pub mod import;
pub mod integrity;
pub mod library;
pub mod model;
pub mod saver;
pub mod search;
pub mod settings;
pub mod similar;
pub mod taxonomy;

use commands::CloseDecision;
use tauri::path::BaseDirectory;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

/// The bundled ONNX Runtime library (Plan 5, B1), as fetched by `npm run fetch:ort`.
fn ort_library_name() -> String {
    format!(
        "{}onnxruntime{}",
        std::env::consts::DLL_PREFIX,
        std::env::consts::DLL_SUFFIX
    )
}

/// Absolute path of the bundled ORT library, for `ort::init_from` (Task 0 load rules: never a
/// bare name). Find similar loads it only when the feature is on.
pub fn ort_library(app: &tauri::AppHandle) -> tauri::Result<std::path::PathBuf> {
    app.path().resolve(
        format!("ort/{}", ort_library_name()),
        BaseDirectory::Resource,
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Plan 6 Task 2: first, so a second launch only focuses this window and exits; the
        // startup sweep relies on one copy per library.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.unminimize();
                let _ = w.show();
                let _ = w.set_focus();
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        // Plan 4 Task 5: "Open folder" after an export; the capability grants reveal-item-in-dir only.
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let cache_dir = app.path().app_cache_dir()?;
            let seed = app
                .path()
                .resolve("resources/taxonomy.json", BaseDirectory::Resource)?;
            let demo = app
                .path()
                .resolve("resources/demo", BaseDirectory::Resource)?;
            // Task 11's speed check: a perf build seeds from a synthetic demo folder instead.
            #[cfg(feature = "perf")]
            let demo = std::env::var_os("HORUS_DEMO_DIR")
                .filter(|s| !s.is_empty())
                .map_or(demo, std::path::PathBuf::from);
            // The picker's demo-set examples (SPEC §6.2). The asset protocol only reads.
            app.asset_protocol_scope()
                .allow_directory(demo.join("images"), false)?;
            app.manage(commands::AppState::new(config_dir, cache_dir, seed, demo));
            commands::allow_lightbox_cache(app.handle())?;
            commands::start_saver(app.handle());
            // Plan 5 Find similar (B4): the model's home, the bundled ORT, the index trigger,
            // and the start-up resume (on its own thread, only when the settings say "on").
            app.manage(commands::similar::SimilarEnv::new(
                &app.path().app_local_data_dir()?,
                ort_library(app.handle())?,
            ));
            let handle = app.handle().clone();
            hooks::register(app.handle(), move |c| {
                commands::similar::on_change(&handle, c)
            });
            commands::similar::resume_on_start(app.handle());
            Ok(())
        })
        // B5: flush before the main window closes; if that fails, keep it open and ask.
        // I1, R2: while an import runs or the UI's intake queue has work, keep it open and say
        // so; the import's end (or the queue's drain) closes it.
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event
                && window.label() == "main"
            {
                match commands::close_decision(&window.state::<commands::AppState>()) {
                    CloseDecision::Close => {}
                    CloseDecision::Prevent(message) => {
                        api.prevent_close();
                        let _ =
                            window.emit("save-failed", serde_json::json!({ "message": message }));
                    }
                    CloseDecision::Wait => {
                        api.prevent_close();
                        let _ = window.emit("close-waiting", ());
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_library,
            commands::open_library,
            commands::recover_orphans,
            commands::get_taxonomy,
            commands::related,
            commands::graph_edges,
            commands::import_paths,
            commands::cancel_import,
            commands::import_bytes,
            commands::search,
            commands::get_settings,
            commands::set_settings,
            commands::system_ram_gb,
            commands::similar::similar_status,
            commands::similar::similar_enable,
            commands::similar::similar_disable,
            commands::similar::similar_remove_model,
            commands::similar::similar_pause,
            commands::similar::similar_by_ref,
            commands::similar::similar_by_text,
            commands::similar::similar_by_file,
            commands::add_tags,
            commands::update_tag,
            commands::remove_tag,
            commands::set_field,
            commands::add_technique,
            commands::taxonomy_edit::update_technique,
            commands::taxonomy_edit::delete_technique,
            commands::taxonomy_edit::link_technique,
            commands::taxonomy_edit::unlink_technique,
            commands::taxonomy_edit::add_branch,
            commands::taxonomy_edit::add_domain,
            commands::taxonomy_edit::update_domain,
            commands::taxonomy_edit::delete_domain,
            commands::taxonomy_edit::add_operation,
            commands::taxonomy_edit::update_operation,
            commands::taxonomy_edit::delete_operation,
            commands::add_link,
            commands::update_link,
            commands::remove_link,
            commands::create_board,
            commands::rename_board,
            commands::set_board_members,
            commands::delete_board,
            commands::export_board,
            commands::score_pair,
            commands::lightbox_source,
            commands::undo,
            commands::redo,
            commands::image_path,
            commands::demo_examples,
            commands::intake_busy,
            commands::retry_save,
            commands::exit_without_saving,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // A best-effort backstop for programmatic exits: no window is left to ask in.
            if let RunEvent::ExitRequested { .. } = event
                && let Some(st) = app.try_state::<commands::AppState>()
            {
                match commands::close_decision(&st) {
                    CloseDecision::Close => {}
                    CloseDecision::Prevent(e) => {
                        eprintln!("Horus: the last changes could not be saved on exit: {e}")
                    }
                    CloseDecision::Wait => eprintln!("Horus: an import was still running on exit."),
                }
            }
        });
}

#[cfg(test)]
mod tests {
    /// Imports catch a decoder panic per file; `panic = "abort"` would kill the app instead.
    #[test]
    fn release_profile_unwinds() {
        let cargo = include_str!("../Cargo.toml");
        assert!(
            !cargo
                .lines()
                .any(|l| l.replace(' ', "") == "panic=\"abort\"")
        );
    }

    /// B3: the opener plugin is back for "Open folder" only; no open-url or open-path grant.
    #[test]
    fn capability_grants_opener_reveal_only() {
        let cap: serde_json::Value =
            serde_json::from_str(include_str!("../capabilities/default.json")).unwrap();
        let perms: Vec<&str> = cap["permissions"]
            .as_array()
            .unwrap()
            .iter()
            .filter_map(|p| p.as_str())
            .collect();
        let opener: Vec<&str> = perms
            .iter()
            .copied()
            .filter(|p| p.starts_with("opener:"))
            .collect();
        assert_eq!(opener, ["opener:allow-reveal-item-in-dir"]);
    }

    #[test]
    fn csp_is_strict_except_styles() {
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        let csp = conf["app"]["security"]["csp"]
            .as_str()
            .expect("csp is a string");
        let directive = |name: &str| {
            csp.split(';')
                .map(str::trim)
                .find(|d| d.split_whitespace().next() == Some(name))
                .unwrap_or_else(|| panic!("no {name}"))
                .to_string()
        };
        assert!(!csp.contains("unsafe-eval"));
        assert!(!directive("script-src").contains("unsafe-inline"));
        assert_eq!(directive("default-src"), "default-src 'self'");
    }

    /// The resolver's file name is the one `fetch-ort.mjs` writes for this OS, and it is bundled.
    #[test]
    fn ort_library_matches_fetch_script() {
        let script = include_str!("../../scripts/fetch-ort.mjs");
        assert!(script.contains(&format!("native/{}\"", super::ort_library_name())));
        let conf: serde_json::Value =
            serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
        assert_eq!(conf["bundle"]["resources"]["ort/*"], "ort/");
    }
}
