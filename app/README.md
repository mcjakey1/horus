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

## Performance check

Plan 3 Task 11: the graph views at 2,500 references.

**Commands:**
- Budget test (release, one test at a time): `cargo test --release -- --ignored graph_edges_2500 --nocapture --test-threads=1` in `src-tauri`.
- Synthetic library: `python -I scripts/make_perf_library.py OUT_DIR --n 2500 --seed 7` (needs Pillow 10.1 or later).
  - 2,500 numbered 600×800 colour fields.
  - Each one gets 1–4 seed techniques, drawn Zipf.
- Perf build: `VITE_PERF=1 npm run tauri build -- --features perf --no-bundle`.
- Run: start `src-tauri/target/release/horus.exe` with `HORUS_DEMO_DIR=OUT_DIR`. On first run, create a new library with "Start with the demo set".
  - The `perf` feature is what lets `HORUS_DEMO_DIR` replace the bundled demo set.
  - The overlay (bottom left of each graph view) shows the Pixi ticker's fps, the minimum since reset, and live textures. Click it to reset.
- Harness: `docs/superpowers/qa/plan3-perf.js` drives the build over WebView2 CDP. It is a tidied copy of the script that produced these numbers: the same steps and the same zoom notches. The copy was syntax-checked but not re-run.
  - It reads the same numbers from `window.__horusPerf.<view>`.
  - It records long tasks and the worst gap between animation frames.

**Budget test** (`graph_edges(&d, 8)` on 2,500 references, budget 1.5 s), run 2026-11-26:
- Zipf: 491–525 ms.
- Head-heavy (one technique on at least 80% of references): 1,074–1,201 ms. Running both tests in parallel gave 1,372 ms (one sample).

**Manual check,** run 2026-11-26 on the release perf build of `p3-t11` (Plan 3 Tasks 1–10 merged, plus Task 11).
- **Runs:** three, each on a fresh library. The "runs" column counts only the runs whose screenshots show the measured content on screen. Run 1's zoomed pans landed on empty canvas, and so did run 2's zoomed Galaxy pan; those are left out.
- **Machine:** Ryzen 5 3600, RTX 2060, 16 GB RAM.
- **Window:** 1280×800 at DPR 1, so the canvas was 940×712.
- **Frame rate:** at rest the ticker reported about 130 fps. WMI reported the display's current refresh rate as 60 Hz. So the fps figures are frames the Pixi ticker ran, not frames on screen.
- **Data:**
  - 2,500 references and 6,238 tags.
  - Busiest technique: Complementary pairing, on 1,158 references.
  - Busiest operation: Differentiate, on 2,190 references.

| Check | Target | Measured | Runs | Verdict |
|---|---|---|---|---|
| "Start with the demo set" on 2,500 images | — | 86–110 s | 3 | — |
| Galaxy first layout (from the tab click to the layout worker's first position message) | ≤ 3 s | 960–967 ms (settled 5.04–5.10 s) | 3 | Pass, if "first layout" means the first positions. The settle is over 3 s. |
| UI responsive during that layout | responsive | 1–3 long tasks, longest 162–187 ms; worst frame gap 161–186 ms; lowest 500 ms fps window 38–41 | 3 | Pass: no main-thread stall reached 0.2 s |
| Galaxy pan, fitted | ≥ 55 fps | min 116–130 | 3 | Pass |
| Galaxy pan where more than 600 references would be thumbnails (600 thumbnails, the rest dots) | ≥ 55 fps | min 76–90; worst frame gap 22–32 ms | 2 | Pass |
| Galaxy pan, zoomed in (thumbnails) | ≥ 55 fps | min 118 | 1 | Pass |
| Zooming | ≥ 55 fps | Zoom-in fps: not measured. Lowest fps across a zoomed pan, a fit and 30 notches out to far zoom: Galaxy 98–105, Tree 87–89 | 2 | Pass for zooming out; zoom-in not measured |
| Peak live textures (any view, any run) | ≤ 600 | 600 (Galaxy); 154 (Tree); 0 (Radial) | 3 | Pass |
| Far zoom shows only dots (Galaxy, Tree) | all dots | all dots, judged from screenshots | 2 (Galaxy) / 1 (Tree) | Pass |
| Tree, Complementary pairing expanded: pan fitted / zoomed | ≥ 55 fps | min 130–131 / 130 | 3 / 1 | Pass |
| Tree, "Show all references" on: pan fitted / zoomed | ≥ 55 fps | min 129–130 / 125–130 | 3 / 2 | Pass |
| Radial, Differentiate: pan fitted / zoomed | ≥ 55 fps | min 130–131 / 130–131 | 3 / 2 | Pass. Only the taxonomy wheel is drawn here: no references, 0 textures. |

**Carry-ins:**
- **The ~110 empty `PIXI.Text` joint nodes in the Tree:** not measured. The release build exposes no scene-graph hook.
- **Galaxy cold settle:**
  - 898 ms on the 50-image demo (Task 7).
  - At 2,500 references: first positions in about 0.96 s, settled in 5.04–5.10 s.
  - The 2,500 settle was not measured with forceCollide removed.
- **More than `TEX_CAP` thumbnails visible:**
  - The cap holds: 600 thumbnails, the rest dots, and live textures never above 600.
  - Panning there was the slowest case measured, at a minimum of 76 fps, but showed no stall below 55 fps.

**Seen, not measured:**
- In the Galaxy's densest cluster, zoomed in, many 48-unit tiles overlap. The layout does not separate them fully at 2,500 references.
- With one technique expanded, the Tree draws its 1,158 references as one column, so the fitted Tree is a thin line of dots.

The test libraries were deleted afterwards, and so was `%APPDATA%\art.horus.app`, which was absent before the runs.

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

**Re-run after the final fix wave** (2026-11-25, at `f2df12a`, which `p2-t12-e2e` fast-forwarded to): a fresh release build and fresh libraries, deleted afterwards.
- **Check 1, the full harness (`plan2-e2e.js`), items 1–9: all PASS.** No console errors, and no external requests.
  - Item 1: the import took 5.1 s, undo 36 ms and redo 24 ms.
  - Item 3: the tags took 89, 86, 60, 85 and 62 ms, and → alone advanced 4 of 4 times.
  - Item 6: Halo glow was added in 574 ms and undone in 568 ms.
  - Item 8: the close was asked 32 ms after Enter, and the window was gone 130 ms later.
  - Item 9: the switch took 46 ms.
- **Check 2, a close during an import (`plan2-e2e-close.js`): PASS.**
  - The harness started `import_paths` on the folder of 20 through IPC, and sent the real `CloseMainWindow` 100 ms later. At that point, 0 references were on disk.
  - "Finishing the import before closing." showed 31 ms after the close.
  - The window closed by itself 4.8 s after `CloseMainWindow`, with 20 references on disk.
  - On relaunch there were 20 references, in both the app and `library.json`.
- **Check 3, Ctrl+Z on a Cyrillic layout: PASS.**
  - The harness tagged a reference, then dispatched a synthetic `keydown` (`key: "я"`, `code: "KeyZ"`, Ctrl) on the page. The handler took it (`defaultPrevented`), and the tag was gone from `library.json` 589 ms later, which includes the save debounce.
  - This is a deviation: it was a synthetic key event, not a real layout switch.
