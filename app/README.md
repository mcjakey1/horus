# Horus

Tauri v2 desktop app (Rust core, TypeScript UI).

- `npm install`
- `npm run tauri dev`
- `npm test` (Vitest), `cargo test` in `src-tauri`

## Release build (Windows)

- `npm run tauri build`
- Installers: `src-tauri/target/release/bundle/msi/Horus_0.1.0_x64_en-US.msi` and `src-tauri/target/release/bundle/nsis/Horus_0.1.0_x64-setup.exe`
- Run without installing: `src-tauri/target/release/horus.exe` (it finds `resources/` next to the exe)
- macOS and Linux builds belong to Plan 6.

## Notes

- **CSP:** `app.security.csp` in `tauri.conf.json` is strict, except that `style-src` still allows `'unsafe-inline'`. The Reference view sets inline `style=` attributes (box positions, `--c` colours). Plan 6 Task 1 converts them and removes `'unsafe-inline'`.
- **Offline:** fonts are bundled locally and a static scan of `dist` finds no remote URLs. The manual test with the network adapter off (install, first run with the demo set) is still to be done by the user. The installers use Tauri's default WebView2 mode, which downloads the WebView2 runtime at install time only if it is missing (Windows 11 ships it).
- **CSP in dev:** on Windows, `tauri dev` serves the page straight from Vite, so the CSP is only enforced in the release build.
- **Fonts:** licences ship in the app's `licenses/` folder (`OFL-SourceSerif4.txt`, `OFL-RedHatMono.txt`).
