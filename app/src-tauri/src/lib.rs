pub mod commands;
pub mod correlate;
pub mod import;
pub mod library;
pub mod model;
pub mod search;
pub mod settings;
pub mod taxonomy;

use tauri::Manager;
use tauri::path::BaseDirectory;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let config_dir = app.path().app_config_dir()?;
            let seed = app
                .path()
                .resolve("resources/taxonomy.json", BaseDirectory::Resource)?;
            app.manage(commands::AppState::new(config_dir, seed));
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
