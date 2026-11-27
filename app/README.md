# Horus

Tauri v2 desktop app (Rust core, TypeScript UI).

- `npm install`
- `npm run fetch:ort` once (fetches and verifies ONNX Runtime for Find similar into `src-tauri/ort/`; re-running does nothing when the files are in place)
- `npm run tauri dev`
- `npm test` (Vitest), `cargo test` in `src-tauri`

## Find similar: ONNX Runtime (Plan 5)

The optional Find similar feature runs Google SigLIP on Microsoft ONNX Runtime 1.31.1. ORT is loaded at run time with `ort::init_from(<absolute path>)` only when the feature is on (`ort` features `load-dynamic` + `api-31`), so the app has no load-time ORT import.

**Getting it.** `npm run fetch:ort` (`scripts/fetch-ort.mjs`) downloads the NuGet package `Microsoft.ML.OnnxRuntime` 1.31.1, checks its SHA-256, extracts this OS's library plus `ThirdPartyNotices.txt` and `LICENSE`, checks each one and writes them to `src-tauri/ort/` (gitignored). `bundle.resources` ships that folder as `ort/`. The binaries are never committed. The pins live in the script only; the test `ort_pins_match_plan` ties them to the plan.

| File | Bytes | SHA-256 |
|---|---|---|
| `microsoft.ml.onnxruntime.1.31.1.nupkg` | 159,626,394 | `6871ccbc97f3d5bdb4095a1dcec33aa78d56f6ed8de5980ef5fa1d9f2e7c679a` |
| `onnxruntime.dll` (Windows x64) | 17,253,728 | `cb2fa518b18356617f6f9f460c012501da2819ec7e5c1d80bd8f5de20492db0c` |
| `libonnxruntime.dylib` (macOS arm64) | 44,830,288 | `2685dc296147c47b0dbd8e0615547b12fc0c445d158d1f374cbd0705d9626fdc` |
| `libonnxruntime.so` (Linux x64) | 29,345,384 | `a96f132e5eb5ca04e23a7d2fc1078fb95aa591e8d71d0f237702ece3a1e0f4ea` |

**Installer growth:** about 16.5 MiB on Windows x64, 42.8 MiB on macOS arm64 and 28 MiB on Linux x64 (the library), plus about 337 KiB of notices. The model itself (213 MB) is never in the installer; it is downloaded on "Turn on".

**Checks (Task 2 Step 3, 2026-11-27, Windows 11, debug build):**
- `dumpbin /dependents horus.exe` lists only Windows system DLLs and the CRT. There is no `onnxruntime`, `DirectML`, `D3D12` or `DXCORE` import and no delay-load section.
- `horus.exe` starts and closes normally with ORT never called. The running process has no `onnxruntime`, `DirectML`, `D3D12` or `DXCORE` module loaded.
- **Real model (`real_model_semantics`, pinned files hand-downloaded and SHA-256-checked, debug test build, ORT 1.31.1 CPU):** passes. "a photo of a cat" scores 0.0956 against `cat.jpg` and 0.0327 against `dog.jpg` (cosine).
  - Working set with the vision session loaded: about **184 MB**. With both sessions loaded: about **304 MB**, peak seen **317 MB** (sampled every 200 ms with `Get-Process`, so the true peak can be slightly higher).
  - Seconds per image at `intra_threads = 2`: **0.22–0.24 s** (mean of 10 encodes of a 330×220 JPEG, preprocessing included; two runs).

## Find similar: verification numbers (Plan 5 Task 8)

Run 2026-11-27 on the development machine (Windows 11, 16 GB RAM, AVX2), with a **debug build** (`npx tauri build --debug --no-bundle --features perf`, dev profile at opt-level 1; ONNX Runtime itself is Microsoft's release DLL). The app was driven over WebView2 CDP, with temp libraries in a scratch folder and no proxy except where stated. Numbers from a release build may be better.

**Step 1: clean first run with the real download** (`%APPDATA%\art.horus.app` absent, no `models/` folder):
- First run shows "Download: 213 MB · This computer: 16 GB of RAM". "Turn on now", then Begin with the demo set (50 references, 7.2 s).
- The download is the real one from Hugging Face. It reached 213,373,093 bytes. Verifying passed (the phase moved on to indexing and Ready; it is too quick to catch in 2 s samples).
- Indexing the 50 demo references: about **18 s** (46 of them in 16.6 s), well inside the 120 s allowance.
- "Looks similar" appears on the Reference view: the tab and the drop zone are in the DOM, and the status bar reads "Find similar: ready".
- `lautrec-divan-japonais` lists, from the top: Jane Avril 0.669, *Zodiaque* ("La Plume") 0.585, Moulin Rouge, La Goulue 0.573, At the Moulin Rouge 0.563, Laziness 0.560, Ambassadeurs: Aristide Bruant 0.557. So four other Lautrec posters are in the top six.

**Step 2: interruption drill:**
- **Network error at the start, not mid-transfer.** The app was launched with `HTTPS_PROXY` pointing at a closed local port (the `ureq` agent honours proxy environment variables), so no system network setting was touched. First run's "Turn on now" then gave phase `error` with "Couldn't reach the download. Check your connection and try again." It shows in the status notice with "Open Settings", and in Settings with "Try again". A Wi-Fi drop in the middle of a transfer was **not checked**.
- **Quit mid-download, then restart.** Quit at about 128 MB, which left `vision_model_quantized.onnx` complete and `text_model_quantized.onnx.part` at 53,468,788 bytes. On the next start the download resumed by itself: the first status read 153,181,812 bytes, not 0. It finished, verified and indexed; it took 22 s from restart to Ready.
- Observed: after the network error, `findSimilar` is saved as `"off"`, so the next app start does not retry by itself; the artist turns it on again (Settings "Try again"). After a quit mid-download it stays `"on"` and resumes.

**Step 3: 2,500 references** (`scripts/make_perf_library.py OUT --n 2500 --seed 7`, `HORUS_DEMO_DIR`, a fresh first run with "Turn on now"):
- Seeding the 2,500 references (first run's Begin): 114 s.
- Indexing: **3.39 images per second (0.295 s per image)**, so **about 12.3 minutes for 2,500** (739 s, an 18 s pause excluded). That is inside the 30-minute limit.
- **Peak RAM:** `horus.exe` peak working set **363 MB** (both sessions loaded); the WebView2 processes up to **433 MB** together. Sampled every 2 s. The "8 GB of RAM or more" guidance holds with plenty of margin.
- **Responsiveness while indexing:** `requestAnimationFrame` gaps on the Reference view over 5 s: p50 17.9 ms, p95 18.1 ms, max 18.8 ms (no visible stutter). The Galaxy pan was not measured separately.
- **Pause:** `similar_pause(true)` at 173 indexed; it stopped at 174 (within one image, so well within one batch), and stayed there for 14 s. Resume continued.
- **`similar_by_text` latency** (10 queries, IPC request to response):
  - the first call loads the text session lazily: 363 ms at Ready on the demo set, 875 ms while indexing;
  - while indexing: 313–359 ms, just over the 300 ms target, because a query waits for the image being encoded;
  - at Ready: **78–110 ms**.

**Step 3b: calibrating the cut-offs** (the demo set, 50 references):
- **Image to image:** all 1,225 pairs, read straight from `embeddings.bin` (the app's own results are already cut at the old 0.5): min 0.282, p10 0.398, median 0.505, p90 0.619, max 0.798. Top-10 lists for ten references (Divan Japonais, Breaker Boys, Melencolia I, Stacks of Wheat, Jane Avril, Paris Street; Rainy Day, See America, The Giant Wheel, Sunlight):
  - clearly related hits sit at 0.56–0.78: the Lautrec posters, the etchings (Melencolia I, The Sleep of Reason, The Giant Wheel, The Three Crosses at 0.63–0.75), and the photographs (Sunlight, The Manger, Julia Jackson at 0.74–0.78);
  - the unrelated tails of the same lists sit at 0.53–0.54 (Divan Japonais then gets A Sunday on La Grande Jatte and Night Procession of Goblins at 0.540).
  - 0.5 kept half of all pairs. **`sim_min_image` = 0.55.**
- **Text to image:** 10 plain-English queries through `similar_by_text` (cut at the old 0.03):
  - correct top hits: "a ship at sea" gives The Great Wave, Sète (0.056); "a crowd of people" gives Breaker Boys (0.055); "a black and white drawing" gives The Giant Wheel (0.084); "a poster with bold flat colour" gives the WPA posters (0.060–0.076);
  - clearly unrelated top hits: "a photo of a cat" gives Three Persons Viewing the Gladiator (0.034); "flowers in a vase" gives The Giant Wheel (0.049). The demo set has no cat and no flowers. (Task 2's fixture test also saw a dog at 0.033 for the cat query.)
  - **`sim_min_text` = 0.05**, which drops both of those and keeps every correct top hit above. ASCII punctuation stripping was not needed.
- Both values are in `SIGLIP_B16_Q8` (`src/similar/model.rs`). `mode_cutoffs` derives its fake cosines from them, and it passes.

**Step 4: the off state and the installer:**
- Turning the Settings switch off removes the "Looks similar" tab, the drop zone and the search group from the DOM (not hidden), and the status bar reads "Find similar: off". Settings saves `findSimilar: "off"`, and the status shows `diskBytes` still 221 MB (disable keeps the files).
- **Release installers** (`npx tauri build`, `CARGO_BUILD_JOBS=1`, LTO): `Horus_0.1.0_x64-setup.exe` (NSIS) **24.39 MiB**, `Horus_0.1.0_x64_en-US.msi` **28.09 MiB**.
  - Neither contains an `.onnx` file: the MSI's file table names `onnxruntime.dll` and no `.onnx`, and the bundled `ort/` holds only `onnxruntime.dll`, `LICENSE` and `ThirdPartyNotices.txt`.
  - Plan 1 Task 10 measured both installers under 20 MB with the demo set. With ONNX Runtime (a 17.25 MB DLL, uncompressed), they are within "Plan 1's budget plus the ONNX Runtime library". Plan 6 sets the per-platform budgets from these numbers.
- **Release build retake** (the 50 demo references, a fresh first run): indexing about **3.7 images per second (0.27 s per image)**, 50 references in about 14 s; `similar_by_text` at Ready 68–95 ms after a first call of 803 ms (the lazy text session). ONNX Runtime dominates, so the debug numbers above are close to release.

**Ignored tests** (CI never runs them; run them on their own, never with `--include-ignored`):
- `HORUS_ORT_LIB=<abs path to src-tauri/ort/onnxruntime.dll> cargo test similar::encoder -- --ignored`
- `real_model_semantics` also needs `HORUS_SIGLIP_DIR`, a folder holding the three model files (see `src/similar/model.rs`).

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
- Perf build: `VITE_PERF=1 npm run tauri build -- --features perf --no-bundle`. In PowerShell: `$env:VITE_PERF=1; npm run tauri build -- --features perf --no-bundle`.
  - To skip a full LTO rebuild, point `CARGO_TARGET_DIR` at an earlier perf build's `target` folder. Add `CARGO_BUILD_JOBS=2` if memory is short.
- Run: start `src-tauri/target/release/horus.exe` with `HORUS_DEMO_DIR=OUT_DIR`. On first run, create a new library with "Start with the demo set".
  - The `perf` feature is what lets `HORUS_DEMO_DIR` replace the bundled demo set.
  - The overlay (bottom left of each graph view) shows the Pixi ticker's fps, the minimum since reset, and live textures. Click it to reset.
- Harness: `node docs/superpowers/qa/plan3-perf.js WORK_DIR`, with the library at `WORK_DIR/perf2500`. It drives the build over WebView2 CDP.
  - Set `HORUS_EXE` to run an exe from another `CARGO_TARGET_DIR`.
  - It reads the same numbers from `window.__horusPerf.<view>`.
  - It records long tasks and the worst gap between animation frames.

**Budget test** (`graph_edges(&d, 8)` on 2,500 references, budget 1.5 s), run 2026-11-26:
- Zipf: 491–525 ms.
- Head-heavy (one technique on at least 80% of references): 1,074–1,201 ms. Running both tests in parallel gave 1,372 ms (one sample).

**Manual check,** re-measured 2026-11-26 on the release perf build of `c138f2b` (`plan3-graph` after the final-review fix wave), with the harness as committed.
- **Runs:**
  - Four runs, each on a fresh library. Run 2 did not start: the window stayed on the static page, with no first-run screen and no library, and the harness timed out after 30 s. The cause was not found.
  - The numbers come from runs 1, 3 and 4. The "runs" column counts only runs whose screenshots show the measured content on screen.
  - Run 1 zoomed the Radial at the wheel's centre, which has no references, so its zoomed Radial pan is left out. Runs 3 and 4 zoom on ring 3. The Tree technique far zoom was added after run 1.
- **Machine:** Ryzen 5 3600, RTX 2060, 16 GB RAM. Memory was tight that day: an earlier build of this re-measure was stopped for low memory.
- **Window:** 1280×800 at DPR 1, so the canvas was 940×712.
- **Frame rate:** at rest the ticker reported about 130 fps. WMI reported the display's current refresh rate as 60 Hz. So the fps figures are frames the Pixi ticker ran, not frames on screen.
- **Data:**
  - 2,500 references and 6,238 tags.
  - Busiest technique: Complementary pairing, on 1,158 references.
  - Busiest operation: Differentiate, on 2,190 references.
- **"tex"** is the size of the view's texture cache (live textures), not the number of thumbnails on screen. A fitted view can show only dots and still hold 600 textures from an earlier zoom.

| Check | Target | Measured | Runs | Verdict |
|---|---|---|---|---|
| "Start with the demo set" on 2,500 images | — | 89–109 s | 3 | — |
| Galaxy first layout (from the tab click to the layout worker's first position message) | ≤ 3 s | 1,169–1,241 ms (settled 6.75–7.04 s, 20 position messages) | 3 | Pass: "first layout" means the first streamed positions (controller ruling, 2026-11-26). The settle takes longer than 3 s. |
| UI responsive during that layout | responsive | 2 long tasks per run, longest 176–194 ms; worst frame gap 176–199 ms | 3 | Pass, by 1 ms: no main-thread stall reached 0.2 s |
| Lowest 500 ms fps window, from the tab click to the fitted view (Pixi start-up, the layout, the fit) | — | 31–45 | 3 | — |
| Galaxy pan, fitted | ≥ 55 fps | min 127–130 | 3 | Pass |
| Galaxy pan where more than 600 references would be thumbnails (600 thumbnails, the rest dots) | ≥ 55 fps | min 62–75; worst frame gap 23–84 ms. Run 4 had one 54 ms long task. | 3 | Pass, with a margin of 7 fps |
| Galaxy pan, zoomed in (thumbnails) | ≥ 55 fps | min 125–130 | 3 | Pass |
| Zooming | ≥ 55 fps | Zoom-in fps: not measured. Lowest fps across a zoomed pan, a fit and 30 notches out to far zoom: Galaxy 97–111; Tree with Complementary pairing expanded 101–105; Tree with "Show all references" on 76–98 | 3 / 2 / 3 | Pass for zooming out; zoom-in not measured |
| Peak live textures (any view, any run) | ≤ 600 | 600 (Galaxy); 600 (Tree); 600 (Radial, zoomed on ring 3; 0 at fit) | 3 | Pass |
| Far zoom shows only dots | all dots | Galaxy: all dots. Tree with Complementary pairing expanded: references all dots, taxonomy squares still drawn. Judged from screenshots. Tree with "Show all references" on: not judged, because the far zoom looks the same as the fitted view (thin columns). | 3 / 2 / — | Pass for the Galaxy and the expanded technique |
| Tree, Complementary pairing expanded (a block of rows): pan fitted / zoomed | ≥ 55 fps | min 130–131 / 124–130 | 3 / 3 | Pass |
| Tree, "Show all references" on: pan fitted / zoomed | ≥ 55 fps | min 127–131 / 126–131 | 3 / 3 | Pass |
| Radial, Differentiate (ring 3 in rows, references drawn): pan fitted / zoomed on ring 3 | ≥ 55 fps | min 128–131 / 129–131 | 3 / 2 | Pass. At fit the 2,190 references draw as dots (0 textures); zoomed on ring 3 they draw as thumbnails. |

**Carry-ins:**
- **The ~110 empty `PIXI.Text` joint nodes in the Tree:** not measured. The release build exposes no scene-graph hook.
- **Galaxy cold settle** (collide radius `NODE·√½ + 2` with 2 iterations, from the final-review fix wave):
  - At 2,500 references: first positions in 1.17–1.24 s, settled in 6.75–7.04 s.
  - Before the fix wave (radius `NODE/2 + 4`, `p3-t11` build): 0.96 s and 5.04–5.10 s. The two builds were measured under different memory load, so the difference is not attributed to the radius alone.
  - 898 ms on the 50-image demo (Task 7, before the fix wave); not re-measured.
  - The 2,500 settle was not measured with forceCollide removed.
- **More than `TEX_CAP` thumbnails visible:**
  - The cap holds: 600 thumbnails, the rest dots, and live textures never above 600.
  - Panning there was the slowest case measured, at a minimum of 62 fps. The worst frame gap was 84 ms, in run 4.

**Seen, not measured:**
- In the Galaxy's densest cluster, zoomed in (notch 6 and notch 13), tiles still touch and partly overlap with the new collide radius.
- With one technique expanded, the Tree now lays its 1,158 references out as a block of rows. With "Show all references" on, the Tree still draws each technique's references as one thin column.

The test libraries were deleted afterwards, and so was `%APPDATA%\art.horus.app`, which was absent before each run.

## Plan 4 end-to-end check

**Run:** 2026-11-26, on `plan4-boards` at `6e07004` (Plan 4 Tasks 0–7).
- **Build:** the release perf build (`VITE_PERF=1 npm run tauri build -- --features perf --no-bundle`), driven over WebView2 CDP by `docs/superpowers/qa/plan4-e2e.js`.
- **Why not `tauri dev`:** the brief named `tauri dev`. The release build is what ships, with the real CSP and the real opener capability.
- **How the harness answers the dialogs:** it serves the library and export folders through the dialog IPC.
- **Libraries:** temp libraries only. The export folder was `E:\D drive files\Design Second Brain\Export test\`, emptied afterwards.
- **Window:** 1280×800 at DPR 1.

**Step 1, the suites:**
- `npx vitest run`: exit code 0, 45 files, 585 of 585, and no "Errors" line.
- `npm run build`: exit 0. The only warning is Vite's existing chunk-size warning.
- `cargo fmt --check`: exit 0.
- `cargo test` (261 passed, 2 ignored, 1 doctest) and `cargo clippy --all-targets -D warnings`: verified by the controller at `189ff3a`. The Rust code is unchanged through `6e07004` (`git diff 189ff3a 6e07004 -- app/src-tauri` is empty).

**Step 2, the manual run.** The demo library has 50 references and seeded in 9 s.

| # | Check | Result | Measured |
|---|---|---|---|
| 1 | `b` on 10 references, a new board "Harbour" | PASS | 10 members; the margin reads "Boards: Harbour" |
| 2 | Alt+→ in Boards, then Ctrl+Z | PASS (see F3) | Tiles 1 and 2 swapped; Ctrl+Z restored the order |
| 3 | "Show only this board" | **FAIL (F1)** | Status reads "Board: Harbour · 10 references · Show all". But Ranked showed 3 scored rows that aren't on the board (5 scored rows). Search: not checked (the harness had no non-member title to search for). |
| 4 | Export, twice; `credits.txt`; Open folder | PASS | 10 files `01 - …` to `10 - …`; `credits.txt` has 10 blocks in board order, no BOM and no CR. The toast read "Exported 10 to …". The second export gave 11 ` (2)` names, including `credits (2).txt`, and left the first files byte-identical. "Open folder" opened Explorer on the parent folder ("Design Second Brain"). Notepad, TextEdit, PureRef: not checked. |
| 5 | Lightbox: zoom, pan, hover, draw at 400 % | PASS (see F2) | Zoom 416 % at the cursor; Space+drag panned (−120, −80). The new region matches the drag exactly as a fraction of the image at 416 %, at fit (57 %) and at 100 % (error 0.0000). Hover label: not checked (the reference had no region tags before). |
| 6 | Shift-click, Compare, "Link these two" | PASS (see F4) | Shared: "Stand out › Simultaneous contrast". After the save, Compare shows "Linked by you: “same raking light”", and Ranked starts with "Linked by you". |
| 7 | Three Ctrl+Z | PASS | The first removed the link; the second, the region tag (callouts 4 → 3); the third, the last board add (10 → 9 references) |
| 8 | Edit a link's note, quit within 0.5 s, relaunch | PASS | Quit requested 374 ms after Save; the note was in `library.json` and in the Links tab after relaunch |
| 9 | At scale: a 2,000-member board, 2,500-reference library | PASS | 36 `<img>` at the top and 48 scrolled to the middle (cap 200). The visible rows of tiles were drawn while scrolling. |

**Hand checks** (things jsdom couldn't show), with a real mouse and keyboard over CDP:
- **T4, the link handle:**
  - The leader line shows during the drag.
  - A drop on a Ranked row opens the editor "to Breaker Boys".
  - Esc mid-drag, then release, opens nothing.
  - A plain click opens the combobox.
- **T5a:**
  - Drag-reorder while scrolled to tile 1002 of 2,000: the ghost showed, the tile landed at 1004, and the scroll position held. No native image drag.
  - "Open folder" (`revealItemInDir`) opens the parent with the folder selected; whether that reads right as "Open folder" is for QA.
- **T6, Tab onto a region while zoomed:** not checked; the reference used had no region tag before the draw.
- **T7, Compare:**
  - Shift+Enter on a focused Ranked row opens Compare.
  - Esc from Compare keeps the pinned callout and the filter chip.

**Findings** (details in the Task 8 report):
- **F1 (Important, cause not found):** under "Show only this board", Ranked showed 3 scored references that aren't on the board. The jsdom tests and the code both filter them.
- **F2 (Minor):** tagging a region drawn at 416 % resets the lightbox zoom to 100 %.
- **F3 (Minor):** after Alt+→ in Boards, keyboard focus fell to `<body>` instead of following the tile.
- **F4 (Important):** after "Link these two" saves, Esc no longer closes Compare; focus is on `<body>`. Close works.
- **The harness's first-run "Create" pick didn't register on 3 of 7 launches,** with no dialog IPC sent; a retry worked each time. This is not confirmed as an app bug.

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
