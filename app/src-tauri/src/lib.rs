pub mod commands;
pub mod correlate;
pub mod demo;
pub mod edit;
pub mod history;
pub mod import;
pub mod library;
pub mod model;
pub mod saver;
pub mod search;
pub mod settings;
pub mod taxonomy;

use tauri::Manager;
use tauri::path::BaseDirectory;

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
            app.manage(commands::AppState::new(config_dir, seed, demo));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::create_library,
            commands::open_library,
            commands::get_taxonomy,
            commands::related,
            commands::import_paths,
            commands::search,
            commands::get_settings,
            commands::set_settings,
            commands::system_ram_gb,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
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
