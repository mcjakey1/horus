//! Plan 6 Task 4: the native menu, on all three systems. File > "Open library folder" reveals the
//! open library in the file manager here, in Rust (it complements the in-app Library menu, C3).
//! The Help items reach the UI as `menu://action` with their id: "play-intro", "about",
//! "verify". On macOS, About sits in the app menu, which also keeps Quit (Cmd+Q) and an Edit
//! menu for the text fields; Edit has no Undo or Redo, which stay the app's own keys.

use tauri::menu::{Menu, MenuBuilder, MenuEvent, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

pub const OPEN_FOLDER: &str = "open-library-folder";
/// The ids the UI handles (`MenuId` in api.ts).
pub const TO_UI: [&str; 3] = ["play-intro", "about", "verify"];

pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let item = |id: &str, text: &str| MenuItemBuilder::with_id(id, text).build(app);
    let about = item("about", "About Horus")?;
    let file = SubmenuBuilder::new(app, "File")
        .item(&item(OPEN_FOLDER, "Open library folder")?)
        .build()?;
    let help = SubmenuBuilder::new(app, "Help").item(&item("play-intro", "Play intro")?);
    #[cfg(not(target_os = "macos"))]
    let help = help.item(&about);
    let help = help.item(&item("verify", "Verify image files…")?).build()?;
    #[cfg(target_os = "macos")]
    {
        let horus = SubmenuBuilder::new(app, "Horus")
            .item(&about)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        let edit = SubmenuBuilder::new(app, "Edit")
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?;
        let window = SubmenuBuilder::new(app, "Window").minimize().build()?;
        MenuBuilder::new(app)
            .items(&[&horus, &file, &edit, &window, &help])
            .build()
    }
    #[cfg(not(target_os = "macos"))]
    MenuBuilder::new(app).items(&[&file, &help]).build()
}

pub fn on_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().as_ref();
    if id == OPEN_FOLDER {
        if let Some(root) = crate::commands::open_root(app)
            && let Err(e) = tauri_plugin_opener::reveal_item_in_dir(&root)
        {
            eprintln!("Couldn't show {} in the file manager: {e}", root.display());
        }
    } else if TO_UI.contains(&id) {
        let _ = app.emit("menu://action", id);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::test::{mock_builder, mock_context, noop_assets};

    // ponytail: not on macOS, where AppKit builds menus on the main thread only and cargo test
    // runs tests on worker threads (muda panics there). The macOS menu is a Task 8 manual row.
    #[cfg(not(target_os = "macos"))]
    #[test]
    fn menu_has_every_item() {
        let app = mock_builder().build(mock_context(noop_assets())).unwrap();
        let menu = build(app.handle()).unwrap();
        let mut ids = vec![];
        for top in menu.items().unwrap() {
            for i in top.as_submenu().unwrap().items().unwrap() {
                ids.push(i.id().as_ref().to_string());
            }
        }
        for want in [OPEN_FOLDER, "play-intro", "about", "verify"] {
            assert!(ids.iter().any(|x| x == want), "{want} missing from {ids:?}");
        }
    }
}
