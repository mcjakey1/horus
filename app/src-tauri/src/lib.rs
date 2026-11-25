pub mod commands;
pub mod correlate;
pub mod demo;
pub mod edit;
pub mod history;
pub mod hooks;
pub mod import;
pub mod library;
pub mod model;
pub mod saver;
pub mod search;
pub mod settings;
pub mod taxonomy;

use commands::CloseDecision;
use tauri::path::BaseDirectory;
use tauri::{Emitter, Manager, RunEvent, WindowEvent};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let seed = app
                .path()
                .resolve("resources/taxonomy.json", BaseDirectory::Resource)?;
            let demo = app
                .path()
                .resolve("resources/demo", BaseDirectory::Resource)?;
            // The picker's demo-set examples (SPEC §6.2). The asset protocol only reads.
            app.asset_protocol_scope()
                .allow_directory(demo.join("images"), false)?;
            app.manage(commands::AppState::new(config_dir, seed, demo));
            commands::start_saver(app.handle());
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
            commands::get_taxonomy,
            commands::related,
            commands::import_paths,
            commands::import_bytes,
            commands::search,
            commands::get_settings,
            commands::set_settings,
            commands::system_ram_gb,
            commands::add_tags,
            commands::update_tag,
            commands::remove_tag,
            commands::set_field,
            commands::add_technique,
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
}
