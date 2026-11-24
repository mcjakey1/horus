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

## Plan 2 end-to-end check

Run on 2026-11-25 at `5552f2d` (branch `p2-t12-e2e`), with the harness `docs/superpowers/qa/plan2-e2e.js`. It drives the release `horus.exe` over WebView2 CDP.
- The library was a fresh one at `D:\Design Second Brain\Références test 2\`, with the demo set off.
- The images were 20 demo-set images copied to a scratch folder outside the library.
- The timings are app latency with scripted keys, not human speed.

**Step 1:**
- `cargo test`: 154 passed, plus 1 doctest.
- `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check`: clean.
- `npm test`: 218 of 218 passed.
- `git grep -nE "(function|const) esc\b" app/src`: one hit, in `app/src/esc.ts:4`.

| # | Item | Result | Measured |
|---|---|---|---|
| 1 | Drop a folder of 20: "Added 20 to the Inbox", badge 20; Ctrl+Z, Ctrl+Shift+Z | PASS | Import 4.6 s; undo 35 ms; redo 23 ms |
| 2 | Drop it again: 20 "Already in your library" rows, no new references | PASS | 20 rows; still 20 references |
| 3 | Keyboard-only tagging of 5 Inbox items (`1`, type, Enter, →), each under 10 s | PASS on re-run (was PARTIAL) | Re-run: 121, 86, 58, 68, 61 ms per tag; → alone moved on 4 of 4 times |
| 4 | Drop a new image on a reference's plate: picker opens with its techniques ticked | PASS on re-run (was FAIL) | Re-run: the picker opened in the Inbox on the new reference, with Chiaroscuro (the source's technique) ticked |
| 5 | A box dragged in the lightbox and tagged shows as an outline on the Reference view tile | PASS | `.treg` outline on X's thumb in Y's Chiaroscuro callout |
| 6 | "Halo glow" from the picker in `taxonomy.json` with `"custom": true` within 1 s; one Ctrl+Z removes both it and its tag within 1 s | PASS | Added 585 ms; removed 573 ms (the 500 ms debounce plus the write) |
| 7 | A browser paste with `<img>` HTML fills `sourceUrl` | PASS | `sourceUrl` in `library.json` is the `<img src>` |
| 8 | Tag, then close within 0.5 s; the tag is there on relaunch | PASS | Close 33 ms after Enter; the tag was not on disk before the close and was after it; window gone 99 ms later |
| 9 | Library → Open library… switches; Ctrl+Z then has nothing to undo | PASS | Switch 45 ms; `undo` returns an empty Change with `canUndo: false`; both `library.json` files unchanged |

No console errors, and no external network requests (item 7's URL was never fetched).

**Item 3 (fixed in `67fa199`, see the re-run below):** → does nothing while focus is in the picker's search field.
- **Repro:**
  1. In the Inbox, press `1`.
  2. Type `chiaro`, then press Enter. The item is tagged, and focus stays in `.pk-search`.
  3. Press →. Nothing happens, because the field takes it as a caret move.
- **The cause:**
  - The picker leaves → alone when `opts.inbox` is set (`tagging/picker.ts`).
  - The Inbox's handler then returns early on any text field (`inbox/view.ts`, the `isTextEntry` check).
- **The keyboard path that works:** Enter, then Tab (onto a technique card), then →.

**Item 4 (fixed in `67fa199`, see the re-run below):** "Tag like this" never fires on the Reference view's plate.
- **The cause:**
  - `.boxes` (`#boxes`) is `position: absolute; inset: 0` over `#plate`, and is its sibling, not its child.
  - The drop hit-test (`intake.ts`, `elementFromPoint`, then `closest("[data-ref-drop]")`) lands on `div.box.is-whole` inside it, and finds no `[data-ref-drop]`.
  - The harness's hit-test at the plate centre returned `div.box.is-whole; closest [data-ref-drop]: none`.
- **The result:** the image imports ("Added 1 to the Inbox"), but no picker opens and the view stays on Reference.
- **Possible fixes:** put `data-ref-drop` on `#specimen`, or give `.boxes` `pointer-events: none` if its boxes need no pointer.

**Deviations** (there was no human, so the OS gestures were driven one layer down):
- The release build (`npm run tauri build -- --no-bundle`, run as `target\release\horus.exe`) was used instead of `npm run tauri dev`.
- **Drops** are the `tauri://drag-drop` event that Tauri gives the webview, emitted through `plugin:event|emit` with real paths and the plate centre in physical pixels. They are not an Explorer drag.
- **The paste** is a synthetic `paste` event whose `DataTransfer` carries a JPEG `File` and `text/html` `<img src="https://images.example.invalid/…">`. It is not a browser clipboard.
- **Folder pickers** (first run, Library → New, Library → Open) are answered by fulfilling `plugin:dialog|open` over CDP.
- **Item 3:**
  - Switching to the Inbox was a click on its tab; the tagging itself was keys only.
  - In the first run, after the → failure, the harness used Tab, then →, to reach the other items. The re-run needed no Tab.
- **Item 8:** the close is the real window close, through `CloseMainWindow`, sent from a PowerShell already holding the process, so its start-up time isn't counted.
- **Item 9:** library B was made first with Library → New library…. The harness then switched back to A and tagged there, so A had an undo step. It then opened B with Open library… and pressed Ctrl+Z.
- The test libraries and `%APPDATA%\art.horus.app` were deleted afterwards.

**Re-run of items 3 and 4** (2026-11-25, at `67fa199`): a fresh release build, the same harness, and a fresh library, deleted afterwards.
- **The fixes:**
  - `data-ref-drop` is now on `#specimen`.
  - After an Inbox apply, focus moves to the operations row.
- **Item 3: PASS.**
  - The 5 items were tagged with keys only: `1`, type, Enter, then →.
  - → alone moved to the next item 4 of 4 times.
  - Each tag took 121, 86, 58, 68 and 61 ms.
- **Item 4: PASS.**
  - The plate centre still hit-tests to `div.box.is-whole`, but `closest("[data-ref-drop]")` now finds `#specimen`.
  - The drop opened the picker in the Inbox on the new reference, with Chiaroscuro (the source's only technique) ticked.
- **The other items:** 1, 2 and 5–9 passed again, with no console errors and no external requests.
  - Item 6 took 565 ms to add and 601 ms to undo.
  - In item 8, the close came 33 ms after Enter.
- **The harness change:** `focusId` now reads `[data-ref-drop]` instead of `#plate`.
