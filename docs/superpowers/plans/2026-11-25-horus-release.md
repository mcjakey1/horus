# Horus Intro, Packaging and Release (Plan 6 of 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Horus 1.0 ships on GitHub Releases as an **unsigned beta**, with installers for Windows, macOS and Linux and instructions for getting past the operating-system warnings. It has a skippable intro card in its own identity, release-grade hardening (a strict CSP, a startup integrity check and a single-instance guard), and an explicit set of legal and IP gates that must all be signed off before a public release.

**Architecture:**
- **Mostly configuration and checks, not features:**
  - `app/scripts/release-check.mjs` is one Node script with no dependencies. It fails the build whenever a hardening rule or a release gate is not met.
  - Rust gains an `integrity` module that runs at library open, plus `tauri-plugin-single-instance`.
  - The intro card is one DOM module, and its look comes from a separate design pass.
  - A GitHub Actions matrix builds the three platforms with `tauri-apps/tauri-action` and publishes to GitHub Releases. Signing and notarisation are **deferred**: Task 7 is optional, and plugs in later through secrets once the user has the accounts.
- **Taxonomy editing is not here.** It moved to Plan 3.
- **Amended 27 Nov 2026** per `docs/superpowers/plans/plan6-preflight-rulings.md` (from `plan6-preflight-scan.md`: 4 BLOCK, 13 REWORK, 9 COS, 24 deferred items). Plan 6 code starts after Plan 5 merges to main; `plan6-release` is then rebased or re-created on the new main. Plan 5 finding IDs are written `P5-…`.

**Tech Stack:**
- Plans 1–5's stack, plus `tauri-plugin-single-instance` 2 (a Rust-only plugin) and the Tauri v2 bundler: NSIS and MSI (WiX), DMG and `.app`, AppImage and `.deb`.
- Build-time tools only, never shipped: `cargo-about` for Rust licence notices, and `license-checker-rseidelsohn` through `npx` for npm notices.

**Spec:**
- `SPEC.md` (draft 5): §5 (Intro card), §7 (IP and the legal check), §8 (visual identity), §9, §10 (three systems, local, no server) and §11 (non-goals and anti-goals, especially "The animation slows down work").
- `PRODUCT.md`: Brand Commitments (the trademark search is pending) and Evidence on Hand (third-party material never ships).
- `DESIGN.md`: The Conservation Study.
- `demo/README.md`: the rights rule and the remaining assumption about the four WPA posters with no recorded artist.

**Carried from the Plan 1 ledger** (`docs/superpowers/ledgers/2026-11-24-horus-foundation-ledger.md`). This plan owns enforcing these, whichever plan landed the change:
- From the Task 1 minors, routed to Plan 1 Task 10: the CSP is null, and `withGlobalTauri` must be off (Task 1 here).
- `tauri-plugin-opener`: prune it or use it (Task 1).
- From the AGY #2 Task 1 carry: Cargo `description` and `authors` (Task 1).
- From the Task 8 carry: the full OFL 1.1 texts and copyright lines with the fonts (Task 1).
- From the AGY #2 Task 3 carry: `cfg(test)`-gate `NAMES_41`, `OBSERVED` and `validate_seed` (Task 2).
- From the Task 4 deferred minors: crash orphans, meaning `*.tmp` files in `images/` and `thumbs/`, and images that were persisted but never saved. These become the startup sweep and the integrity check (Task 2).
- From the Task 8 deferred minor: there is no XSS regression test (Task 3).
- Plan 1 Task 10 ships a **temporary** `style-src 'self' 'unsafe-inline'`. Task 1 here removes `'unsafe-inline'`, once the inline styles are converted, and `checkCsp` fails while it remains.
- Where Plan 1 Task 10 already made a change, this plan's check only verifies it.
- **Owned rows of `CROSS-PLAN-AUDIT.md`**, applied here:
  - #3 (Task 1: Pixi texture loading under the CSP; resolved by Plan 3's `HTMLImageElement` route, so `connect-src` drops `asset:`, R1);
  - #4 (Task 1: release-check scans the app sources);
  - #12 (Task 2: the order of steps in `open_library`);
  - #13 (Task 4: `intro_seen` in the settings patch);
  - #14 (Tasks 1 and 3: Plan 5's UI included);
  - #17 (Tasks 3 and 8: accessibility);
  - #21 (Global Constraints: the folder layout);
  - #22 (Global Constraints and Task 5: the size budget);
  - #24 (Task 2: test fixtures);
  - #27 (Task 2: a spec delta);
  - #5, as a consumer (Task 2: the shared import helpers).

## Global Constraints

- **Offline and local.** No server, accounts or telemetry. The app makes no network call, except Plan 5's optional, user-started model download, which runs in Rust (SPEC §5a, §10, §11).
- **Its own identity** (SPEC §8, PRODUCT.md):
  - Shipped strings, artwork and the intro never use "Iris", "A Taxonomy of Visuals" or "Modern Art Direction", the reel's yellow-green title lockup, the floating breadcrumb card or the red `01 OPERATION` numbering.
  - **Recommended:** the app icon and intro avoid an eye motif. Iris is eye-themed, and AGY flagged that Horus is eye-adjacent (SPEC header).
- **Third-party material never ships:** `reference/`, `REFERENCE-ANALYSIS.md`, `.impeccable/mocks/`, `.impeccable/review/` and `.impeccable/questions/` (PRODUCT.md, Plan 1 Global Constraints).
- **The library folder layout is Plan 1's, plus `taxonomy.bak.json` (Plan 2) and `embeddings.bin` (Plan 5).** Plan 2 stages pasted images in an OS temp dir outside the library, so there is no `.incoming/`.
  - The integrity work only reads it, removes `*.tmp` files, and adds references through `edit::apply`.
  - It ignores `embeddings.bin`.
  - It never deletes or rewrites `taxonomy.bak.json`. That file is only validated (Task 2).
- **The intro** plays once on first launch, can be replayed from a menu, and any key or click skips it (SPEC §5). It is never longer than 6 seconds, and it shows as a still frame under `prefers-reduced-motion: reduce` (DESIGN.md Motion, SPEC §11 anti-goal).
- **The three platforms:**
  - Windows 10 1809+ and 11 (x64). Find similar's ONNX Runtime needs the Visual C++ runtime, which ships app-local (B4, Task 5); the app itself links it statically;
  - macOS 11+ on **Apple Silicon only** (`aarch64-apple-darwin`; no Intel and no universal build, Plan 5 P5-B2, user ruling "Do the silicon version only", R7). **Find similar needs macOS 14 or later**, because the pinned ORT 1.31.1 dylib is built for macOS 14.0; on macOS 11–13 it is shown as unavailable and ORT is never loaded (B1, Task 5);
  - Linux x86_64 on glibc 2.35+, which means building on Ubuntu 22.04, with WebKitGTK 4.1. (The ORT `.so` needs glibc 2.28 at most.)
- **No inline style attributes in HTML strings.** UI code sets styles through classes, the CSSOM, or `data-css` with `applyCss` (Task 1), so the CSP can keep `style-src 'self'`. The source scans skip `*.test.ts`, which never ship (R13).
- **One version number** in `app/package.json`, `app/src-tauri/Cargo.toml` and `app/src-tauri/tauri.conf.json`.
- **Size budget:** this is set from measurements, not guessed, **per platform** (R9).
  - Each artefact's budget is its measured Task 5/6 build size plus 10% headroom. The inputs: Plan 1 Task 10's installers (under 20 MB with the demo set), and Plan 5 Task 0's ONNX Runtime sizes (uncompressed: `onnxruntime.dll` 17,253,728 B, `libonnxruntime.dylib` 44,830,288 B, `libonnxruntime.so` 29,345,384 B), plus the four VC++ DLLs on Windows.
  - Task 5 records `budgetBytes` per artefact in `app/release-check.json`, and `checkBundle` enforces it.
  - Until the measurements exist there is no ceiling; 60 MB is not assumed for the DMG.

## Review Focus

1. **Two copies of the app start on the same library**, for example when the icon is double-clicked twice or Horus is opened from a file manager while it is already running. The second copy only focuses the first. The startup sweep can never delete a `.tmp` file that another running copy is writing. Tested in Task 2.
2. **A crash between copying an image into `images/` and saving `library.json`.** On the next start:
   - the orphan image is offered back as "Recovered N images to the Inbox";
   - stale `.tmp` files are removed;
   - no file that a reference points to is ever deleted.

   Tested in Task 2.
3. **Untrusted text is shown in the UI.** File-name titles such as `<img src=x onerror=alert(1)>.jpg`, notes, link "why" notes, custom technique names and manifest credits all render as text and never as HTML. Tested in Task 3.
4. **The intro on first launch:** the machine is slow, reduced motion is on, or the user presses a key while it loads. Skipping works on the first input. The intro never blocks the first-run setup, never replays after it has been seen or skipped, and "Play intro" replays it on demand. Tested in Task 4.
5. **Installing on a machine without the platform's web runtime**, for example Windows 10 LTSC without WebView2, or a minimal Linux without WebKitGTK 4.1. The installer installs the runtime or states plainly what is missing; it never fails silently. Tested in Tasks 5 and 8.
6. **Find similar on a machine that can't run it:** Windows without the Visual C++ redistributable (the app-local DLLs must cover it), macOS 11–13 (unavailable, with its fixed line, and ORT never loaded), or a CPU without AVX2. The rest of the app works. Tested in Tasks 5 and 8.

---

### Task 1: The release-check script and configuration hardening

**Files:**
- Create:
  - `app/src/css.ts` (`applyCss`) and `app/src/css.test.ts`;
  - `app/scripts/release-check.mjs`;
  - `app/scripts/release-check.test.mjs` (Vitest);
  - `app/scripts/fixtures/`, with small fake `tauri.conf.json`, `Cargo.toml` and `dist/` trees;
  - `app/release-check.json`, holding `{ "textures": "img-element" }` (R1); Task 5 adds `budgetBytes`.
- Modify:
  - `app/src-tauri/tauri.conf.json`;
  - `app/src-tauri/capabilities/default.json`;
  - `app/src-tauri/Cargo.toml`;
  - `app/package.json`, adding the `"release-check": "node scripts/release-check.mjs"` script;
  - nothing in `app/src/fonts/`: Plan 1 already ships `OFL-RedHatMono.txt` and `OFL-SourceSerif4.txt` (each with the licence line and its copyright line), bundled to `licenses/`. Step 3 only verifies them (R3).

**Interfaces:**
- Produces:
  ```js
  // each returns string[] of problems; [] means pass
  export function checkCsp(conf)                 // tauri.conf.json object
  export function checkGlobals(conf)             // app.withGlobalTauri === false, set explicitly (an absent key fails, C6)
  export function checkCapabilities(caps)        // only the ALLOWED_PERMISSIONS below
  export function checkCargoMeta(cargoToml)      // description != "A Tauri App"; authors == ["Jake Manahan"] (no email)
  export function checkVersions(pkg, cargoToml, conf)
  export function checkFonts(fontDir)            // families read from fonts.css @font-face font-family; each needs OFL-<Family>.txt (spaces removed)
                                                 // containing "SIL OPEN FONT LICENSE Version 1.1" and a "Copyright" line (R3)
  export function checkNoThirdParty(paths)       // dist/ and bundle resources contain none of the excluded paths
  export function checkNoForeignMarks(files)     // no /\bIris\b|Taxonomy of Visuals|Modern Art Direction/i in shipped text
  export function checkNoRemoteUrls(files)       // app sources only: app/src/**/*.{ts,js,css,html} + app/index.html, minus *.test.ts; no http(s)://
                                                 // allowed: SVG xmlns, http://asset.localhost, http://ipc.localhost (R13)
  export function checkNoInlineStyle(files)      // app sources only (same set, minus *.test.ts); no `style="` or `style=${` in TS/JS template strings or HTML; CSS files exempt
  // Both scan our own sources, never dist/ (vendor chunks such as PixiJS carry documentation URLs) and never
  // src-tauri/resources/demo/ (manifest.json legitimately holds ~100 https source URLs). The CSP enforces both at runtime.
  export function checkGates(markdown, final)    // final: every "- [ ]" in RELEASE-GATES.md is a failure (G1–G8)
  export function checkNotices(noticesMd)        // names google/siglip-base-patch16-224 and "Apache License, Version 2.0", and holds either the upstream
                                                 // NOTICE text or a dated "NOTICE: none" line with its evidence (gate G8, Task 9; R5)
  // CLI: node scripts/release-check.mjs [--final]  → prints problems, exit 1 if any
  ```
- The CSP is exactly this string (`checkCsp` compares it exactly, C5), with no `'unsafe-eval'` and no `'unsafe-inline'`:
  ```
  default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self';
  img-src 'self' asset: http://asset.localhost data: blob:; connect-src ipc: http://ipc.localhost;
  worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
  ```
  - `worker-src 'self'` is for Plan 3's Galaxy layout, which runs `d3-force` in a same-origin module Worker (`views/galaxy.ts`). No `blob:` is needed (R1).
  - `connect-src` has no `asset:`: Plan 3 already loads textures from an `HTMLImageElement` (`img.crossOrigin = "anonymous"`, then `PIXI.Texture.from(img)`, `graph/scene.ts`), which `img-src` governs (audit #3's alternative route, R1). `app/release-check.json` records `"textures": "img-element"`.
  - Step 4 still checks that the canvas views show thumbnails, not dots.
  - Setting styles through the CSSOM (`el.style.cssText = …` and `el.style.setProperty(…)`) is fine under `style-src 'self'`. A `style="…"` attribute inside HTML that goes through `innerHTML` is **blocked**.
  - Plan 1 Task 8 currently emits such attributes, in `view.ts` (region boxes, badges, callout inks), `tile.ts` (plate and outline boxes), `leaders.ts` (`--hot`) and `search.ts` (swatches).
  - **The fix:** templates emit `data-css="…"` instead of `style="…"`. A helper, `applyCss(root: ParentNode): void` in `app/src/css.ts`, runs after each `innerHTML` assignment and copies each `data-css` value to `el.style.cssText`, then removes the attribute.
  - The same rule applies to every UI module in Plans 2–5. `checkNoInlineStyle` (below) enforces it.
  - If Plan 3's PixiJS fails under this CSP, fix it with Pixi's no-eval path (the `pixi.js/unsafe-eval` shim module, which avoids `eval`). Never relax the CSP.
- `ALLOWED_PERMISSIONS`:
  - `core:default`;
  - `dialog:allow-open`;
  - `opener:allow-reveal-item-in-dir`, kept because Plan 4's "Open folder" uses it;
  - `opener:allow-open-path`, scoped to `$RESOURCE/THIRD_PARTY_NOTICES.md` only (the mapped resource target from Task 5, R2), because About and Plan 5's "About the model" (P5-R13) open the notices file in the default viewer. Task 4 adds the grant (R10).

  Single-instance focuses the window from Rust, so it needs no capability.

  Anything else needs a line in this list together with the reason for it.

- [ ] **Step 1: Write the failing tests.** Each function gets one failing fixture and one passing fixture:
  - A CSP containing `'unsafe-eval'` fails, and so do a null CSP, the Plan 1 Task 10 interim `style-src 'self' 'unsafe-inline'`, and any string that differs from the exact one above (for example a missing `form-action 'none'`).
  - With `app/release-check.json` `"textures": "img-element"`, a CSP whose `connect-src` holds `asset:` fails (the tighter policy is required). Tauri v2 rejects unknown keys in `tauri.conf.json`, so the flag never goes there.
  - `withGlobalTauri: true` fails, and so does an absent `withGlobalTauri` (C6).
  - `opener:default` fails, and `opener:allow-reveal-item-in-dir` passes.
  - `authors = ["you"]` fails, `authors = ["Jake Manahan"]` passes, and an author string containing `<…@…>` fails, because no email was given.
  - `1.0.0` against `0.1.0` fails the version check.
  - A flat font directory whose `fonts.css` names a family with no `OFL-<Family>.txt` fails; the real layout (`OFL-RedHatMono.txt`, `OFL-SourceSerif4.txt`) passes (R3).
  - A `dist/` containing `reference/frame-036s.jpg` fails.
  - The source scans ignore `dist/assets/pixi-*.js` (a fixture with a vendor `https://` string passes) and `resources/demo/manifest.json`.
  - A JS file containing the string "A Taxonomy of Visuals" fails.
  - `fetch("https://x")` fails, but `xmlns="http://www.w3.org/2000/svg"`, comments naming `http://asset.localhost` and `http://ipc.localhost`, and a `*.test.ts` fixture holding `https://ex.org/a.png` pass (R13).
  - `checkGates` with one `- [ ]` passes when not final and fails when final.
  - `checkNotices` fails on notices without the SigLIP Apache-2.0 entry, and passes on a fixture that names `google/siglip-base-patch16-224`, `Apache License, Version 2.0` and a dated `NOTICE: none` line (as Plan 5's `app/notices/manual.md` has), and on one that holds an upstream NOTICE text (gate G8, R5).
  - A JS file containing `` `<span style="left:${x}px">` `` fails `checkNoInlineStyle`, `` `<span data-css="left:${x}px">` `` passes, and a `*.test.ts` file with `style="…"` is skipped (R13).
  - `applyCss` (in `app/src/css.test.ts`): after `applyCss(root)`, the element's `style.left` is `"12px"`, its CSS variable `--c` resolves, and `data-css` is gone.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- release-check`. It should FAIL, then PASS.

- [ ] **Step 3: Harden the real tree until it passes:**
  - convert the inline `style="…"` templates in Plan 1 Task 8's `view.ts`, `tile.ts`, `leaders.ts` and `search.ts`, and in any landed Plan 2–5 module (including Plan 5's `similar-ui.ts` and `settings/`), to `data-css` plus `applyCss`;
  - set the CSP, which removes Plan 1 Task 10's temporary `'unsafe-inline'`;
  - set `withGlobalTauri: false` explicitly in `tauri.conf.json` (C6);
  - trim the capabilities;
  - set Cargo `description = "A local reference workbench for artists"` and `authors = ["Jake Manahan"]`, with no email (Decision 3);
  - verify the OFL texts (they are already there, R3).

  Then run `npm run build && npm run release-check`. Expected: exit 0, with only gate items listed, as warnings, because the run is not final.

- [ ] **Step 4: Run the app under the CSP.** Run `npm run tauri dev` and check each of these:
  - The Reference, Inbox, Tree, Galaxy, Radial, Boards, Compare, lightbox and Settings views all render.
  - **The Galaxy and Tree show thumbnail textures, not only dots** (audit #3).
  - The DevTools console shows no CSP violation while each view is used.

- [ ] **Step 5: Commit.** Commit message: `chore(release): strict CSP, minimal capabilities, metadata, font licences and release-check`.

---

### Task 2: Library integrity, the startup sweep and single-instance

**Files:**
- Create: `app/src-tauri/src/integrity.rs`.
- Modify:
  - `app/src-tauri/src/lib.rs`, to register `tauri_plugin_single_instance::init` as the **first** plugin (before dialog and opener) and focus the main window. Plan 5's `setup` code (its `SimilarEnv` manage and the Find similar background start) stays as it is;
  - `app/src-tauri/src/commands.rs`, so `create_library` and `open_library` run the sweep and the check in Plan 5's order (below);
  - `app/src-tauri/src/taxonomy.rs`, to put `NAMES_41`, `OBSERVED` and `validate_seed` behind `#[cfg(test)]`;
  - `app/src-tauri/Cargo.toml`, adding `tauri-plugin-single-instance = "2"`;
  - `app/src/api.ts`: `LibraryView.integrity?`, the `IntegrityReport` type, and `onThumbsRebuilt(cb)` (it listens to `library://thumbs-rebuilt`), which goes into `NON_IPC_KEYS` in `api.contract.test.ts`;
  - the integrity notice and the tile re-render: `app/src/firstrun.ts` (`boot()` wiring) and `app/src/reference/view.ts`, with their tests.

**Interfaces:**
- Consumes:
  - `Library` (Plan 1 Task 2, as hardened in Plan 2 Task 4);
  - the shared public helpers `import::decode_srgb`, `import::on_white` and `import::write_thumbs` (audit #5, on main since Plan 4);
  - `edit::Edit::AddReferences` and the mutating-command recipe (Plan 2 Tasks 1 and 5);
  - Plan 5's indexer hooks in `create_library` and `open_library`, and `similar::start_hook` (P5-B4).
- Produces:
  ```rust
  pub struct IntegrityReport {
      pub swept_tmp: Vec<PathBuf>,            // removed
      pub missing_originals: Vec<String>,     // reference ids whose images/<file> is gone (never deleted from library.json)
      pub missing_thumbs: Vec<String>,        // reference ids whose thumbs are missing; rebuilt off-lock after the open (B3)
      pub orphans: Vec<PathBuf>,              // images/<hash>.<ext> that no reference points to
      pub taxonomy_backup_invalid: bool,      // taxonomy.bak.json present but Taxonomy::load or validate() fails; reported, never deleted
  }
  pub fn sweep_tmp(root: &Path) -> Vec<PathBuf>;                 // root, images/, thumbs/256/, thumbs/1024/: names ending ".tmp" or starting ".tmp"
  pub fn check(lib: &Library) -> IntegrityReport;               // existence checks only: no hashing, no decoding;
                                                                // if taxonomy.bak.json exists, loads it and runs validate() (Plan 2 Task 3 rotation)
  pub fn rebuild_thumbs(root: &Path, refs: &[(String, String, String)]) -> Vec<String>;   // (id, hash, file): decode the original
                                                                // (decode_srgb, on_white, write_thumbs); returns the ids rebuilt
  pub fn verify_hashes(lib: &Library, cancel: &AtomicBool) -> Vec<String>;   // on demand from the menu; ids whose BLAKE3 ≠ hash
  ```
- `LibraryView` (Plan 1 Task 7) gains `integrity: Option<IntegrityReport>`, which is set when anything was found.
  - In TypeScript it is the optional `integrity?: IntegrityReport | null`.
  - Update every existing fake `LibraryView` in the tests to include it, or leave it absent (audit #24).
- **Spec delta, to record in the release notes:** `rebuild_thumbs` rebuilds a missing thumbnail by decoding the original. This is a maintenance exception to SPEC §9's "Originals are decoded only in the lightbox", not a browsing path (audit #27).
- **The rebuild runs off-lock (B3).** After `remember()`, with no lock held, a background thread runs `rebuild_thumbs` for `missing_thumbs`, then emits `library://thumbs-rebuilt` with the ids, and the UI re-renders those tiles. It never runs under the state lock.
- The UI shows one quiet notice for the report:
  - "Recovered N images to the Inbox" offers "Add them", which adds the orphans as references through one `Edit::AddReferences`, so the step can be undone. The image files are already in place, and their hashes come from the file names. Each one's title is "Recovered image <first 8 hex digits of its hash>", editable later like any title (C2). This is the Plan 1 QA M4 item (D14).
  - "M references are missing their image file" offers "Show them", which filters the Ranked list to those references. A missing original is never deleted from `library.json`.
- Single-instance: a second launch passes its arguments to the first copy, which focuses its window and then exits. That is why the sweep can assume it is the only writer.
- **Taxonomy validation on open uses `taxonomy.validate()`, never `validate_seed()`** (Plan 3 cross-plan impact item 7). An edited taxonomy fails `validate_seed` by design, and `validate_seed` is `#[cfg(test)]`-only after this task anyway. Test: `edited_taxonomy_opens`, where a library whose taxonomy has an added operation, a renamed label and a new domain opens with no integrity warning.
- **Order inside `open_library` and `create_library` (B3).** Plan 6 adopts Plan 5's order (P5-B4, landed with its tests) and adds the sweep and the check to it (audit #12). Lock order stays import gate, then settings, then state, then `similar`.
  - **`create_library`:**
    1. Flush the previous library (Plan 2 Task 5). On failure, refuse the switch, before anything is created on disk.
    2. `Library::create`, then the demo seed (no lock held).
    3. Run `sweep_tmp` and `check` on the new root (no lock held).
    4. Under the state guard: Plan 5's `similar::detach_indexer` (takes the old indexer and bumps the generation), then `install()`: the asset scope, the `LibraryView` (with Plan 4's `boards` and this task's `integrity`), the new `Open` state with a fresh history.
    5. Once the guard drops, join the old indexer (`Indexer::stop`).
    6. `remember()`.
    7. Plan 5's start hook (on `Ok` and `Err`, for whichever library is open); then, on `Ok` only and when `missing_thumbs` is non-empty, this task's `rebuild_thumbs` in the background.
  - **`open_library`:**
    1. Under the state guard (held from the flush to the swap, on purpose): flush, then `Library::open`.
    2. Still under it: `sweep_tmp` and `check` on the new root (existence checks only, so the lock is held briefly).
    3. `similar::detach_indexer` (takes the indexer and bumps the generation, Plan 5), then `install()`.
    4. Once the state guard drops, join the old indexer; then `remember()`.
    5. In the `open_library` wrapper: for `Ok` and `Err` alike, join an indexer a failed install left detached, then Plan 5's start hook. Then, on `Ok` only and when `missing_thumbs` is non-empty, `rebuild_thumbs` in the background.

    This is the order as Plan 5 Task 5 lands it (`p5-t5`: `create_library`, `open_library` and `open_inner`); if Task 5's review moves a step, Plan 6 follows the merged code.
  - **One rule for `Ok` and `Err` (Plan 5):** once the switch has returned, the start hook runs for whichever library is open. A refused or failed switch leaves the old library open and indexed.
  - **The asset scope stays per folder (R4):** `install()` allows `images/` and `thumbs/` only, never the root (the window never needs `library.json`, `embeddings.bin` or the backups). Plan 4's lightbox cache directory is allowed once, in `setup`.

  The sweep and the check run before anything can write to the new root, so the sweep can never delete a live `.tmp`. Tests:
  - `open_pipeline_order`: a fake hook records the order of the steps in both commands.
  - A `.tmp` planted by a fake saver or indexer hook after `install()` survives.
  - Plan 5's `failed_open_keeps_old_indexer`, `start_hook_restarts_after_switch` and `switch_library_stops_indexer` stay green.
  - `rebuild_is_off_lock`: while `rebuild_thumbs` runs (slow fake decode), an edit command completes.

- [ ] **Step 1: Write the failing tests**
  - `sweep_removes_only_tmp`: plant `images/.tmpAb12`, `images/x.jpg.tmp`, `thumbs/256/.tmpZ` and `library.json.tmp`. All four are removed. `images/<hash>.jpg`, `library.bak.json` and `taxonomy.bak.json` stay.
  - `check_validates_taxonomy_backup`:
    - A valid `taxonomy.bak.json` gives `taxonomy_backup_invalid == false`.
    - Writing `{` into it gives `true`, and the file is still there, byte-identical, after `check` and `sweep_tmp`.
    - With no backup present, it gives `false`.
  - `check_finds_orphan_and_missing`: with an extra hash-named file in `images/` and one reference's original deleted, `orphans` and `missing_originals` each hold one entry. `library.json` is unchanged.
  - `check_lists_missing_thumb`: delete `thumbs/256/<hash>.jpg`. `check` puts the reference id in `missing_thumbs` without decoding; after `rebuild_thumbs` the file exists again and the id is returned.
  - `recover_orphans_is_one_undo_step`: through commands, "Add them" adds 2 references titled "Recovered image <8 hex>", and one `undo` removes both while the files stay.
  - `verify_hashes_flags_corruption`: flip one byte of an original, and its id is returned. Setting `cancel` stops the run early without panicking.
  - `seed_helpers_are_test_only`: with `NAMES_41`, `OBSERVED` and `validate_seed` behind `#[cfg(test)]`, `cargo build --release` still compiles, which proves no shipped code uses them, and `cargo test taxonomy::` still runs `validate_seed`.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test integrity:: commands::`. It should FAIL, then PASS. Plan 5's `commands::similar` tests must stay green.

- [ ] **Step 3: Check single-instance by hand.** Run the built app and launch it a second time. Expected: one window, which comes to the front, and no second process remains (Task Manager or `ps`).

- [ ] **Step 4: Commit.** Commit message: `feat(core): startup tmp sweep, integrity check with orphan recovery, single instance`.

---

### Task 3: Untrusted text renders as text (an XSS regression suite)

**Files:**
- Create: `app/src/security.test.ts` (jsdom).
- Modify: only the modules where the test fails. The rule is to use `textContent` or the existing `esc()` helper, never `innerHTML` with data in it.

**Interfaces:**
- Consumes the mount functions of every view that shows user or manifest text:
  - `mountReference` (Plan 1);
  - `mountPicker` and `mountInbox` (Plan 2);
  - `mountLinkEditor`, `mountBoards` and `mountCompare` (Plan 4);
  - Plan 3's inspector, `renderInspector(el, snapshot, sel, opts)` in `views/inspector.ts` (C1);
  - `mountSettings` (Plan 5 Task 6) and `wireSimilar` (Plan 5 Task 7), the latter with a fake `ready` status and a fake `similarByRef` that returns the fixture reference (audit #14);
  - the About dialog (Task 4 here).
- Fixture: one reference whose `title` is `<img src=x onerror="window.__xss=1">.jpg`, `note` is `<script>window.__xss=2</script>`, `credit` is `<b>bold</b>`, and link `why` is `"><svg onload=window.__xss=3>`. It also has a custom technique named `<i>Halo</i>`.

- [ ] **Step 1: Write the test.** Mount each view with the fixture through a fake `Api`, and run its main interactions: open, hover, search for "img", open the picker and open Compare. Assert all of the following:
  - `window.__xss` is `undefined`;
  - the document has no `img[src="x"]`, `script`, `svg[onload]` or `i` element that came from the data;
  - each string appears in `textContent` exactly as written;
  - **accessibility smoke** (audit #17): every `button`, `a[href]`, `input`, `select`, `textarea` and `[role=tab|switch|option]` in each mounted view has a non-empty accessible name, from its text, `aria-label` or `aria-labelledby`.

- [ ] **Step 2: Run it.** Fix every failure at its source, and run it again. Run `npm test -- security`. Expected: PASS.

- [ ] **Step 3: Commit.** Commit message: `test(security): untrusted titles, notes, links and technique names render as text`.

---

### Task 3b: Deferred fixes (Plans 1–5)

The items deferred to Plan 6 that no other task owns (R11). Each is small; group them by file into one or two commits. Each gets a test where one is cheap, otherwise a recorded manual check.

**Files:** the owning modules named per item; `app/src/styles.css` for the CSS items.

- [ ] **Step 1: Focus and Esc**
  - **D1 (Plan 4 QA F1):** in the lightbox, Esc in the technique picker closes the whole lightbox and loses an unsaved drawn region and the zoom. The picker's Esc branch calls `stopPropagation`. Test: Esc in the picker inside the lightbox closes only the picker.
  - **D8 (Plan 3 QA F1):** Ctrl+Z with an empty search in the move-tags dialog runs WebView2's native undo, refills `#q` and moves focus out of the `aria-modal` dialog (Esc then dead). The dialog makes the rest of the window `inert` while open, as first run and Settings do. Test: focus stays in the dialog and Esc closes it.
- [ ] **Step 2: The notice and copy pass** (one pass, with Task 5's notices copy)
  - **D3 (Plan 4 QA J1):** the Boards status text goes stale after undo of a scoped board delete. It re-renders on the undo's change.
  - **D9 (Plan 3 QA F2, Plan 2 N2):** `#import-notice` covers the inspector's "Delete technique…" at 1280×800, and still says "Added 1 to the Inbox" after undo. Move or shrink it clear of the inspector controls, and clear or update it when an undo reverses what it reports.
  - **D6 (Plan 4 ledger):** remap the raw-ish `UnknownTag` edit error to artist copy.
  - **D13 (Plan 2 QA N1):** the save-failure message shows raw OS text ("Access is denied. (os error 5)"). It gets a plain hint, for example "Check that the library folder is not read-only", and the raw text goes to stderr only.
  - **D15 (Plan 1 QA M3):** the import notice shows "Importing N of M" and a Cancel text button. The same surface serves Task 4's "Verify image files…" (C3).
- [ ] **Step 3: CSS and small behaviour**
  - **D2 (Plan 4 QA F2):** Boards `.bd-tools` is clipped on a first-column tile (`styles.css:533`).
  - **D12 (Plan 3 T10 M1–M3):** the inline field freezes when `run()` returns false (busy never reset); only op and domain `InUse` refusals get the O3 sentence; the last-link test can no longer pass vacuously.
  - **D18 (Plan 4 ledger):** exports are `0600` on macOS and Linux (NamedTempFile); set `0o644` under `cfg(unix)`.
  - **D19 (Plan 4 fix wave):** a hand-edited board naming an absent id fails reorder and remove with generic copy (`set_board_members` drops absent ids); grid refocus by index uses `preventScroll`.
- [ ] **Step 4: Plan 1 carries (C8).** Check each against main and close what Plan 3 already did: thin `validate()` negative tests (add table-driven mutations), missing vs `null` optional keys, and a serde default for `BranchTechnique` `source`/`rationale`.
- [ ] **Step 5: Run and commit.** Run `npm test`, `npm run build`, `cargo test` and `cargo clippy --all-targets -- -D warnings`. Commit message: `fix: deferred fixes from Plans 1-5 (focus, notices, copy, export permissions)`.

Routed elsewhere: D4, D5, D7, D10 and D16 to Task 8 rows; D11 to a Task 8 judgment row; D14 to Task 2; D17 to Task 4's design pass; D20–D24 to R7, R8/R9, B4, R10 and B3.

---

### Task 4: The intro card, the app menu and About

**Files:**
- Create:
  - `app/src/intro/intro.ts`;
  - `app/src/intro/intro.test.ts`;
  - `app/src/about.ts`;
  - `app/src/about.test.ts`.
- Modify:
  - `app/src-tauri/src/settings.rs`: add `intro_seen: bool` to `Settings`, with a default of `false`. **Also** add `intro_seen: Option<bool>` to `SettingsPatch` and one branch to `merge()`, because the real `set_settings` takes a patch (audit #13);
  - `app/src/api.ts`: add `introSeen: boolean` to `Settings`. `setSettings` takes `Partial<Settings>`, the Plan 1 Task 9 integration per the ledger ruling; make that change here if it has not landed;
  - `app/src-tauri/src/lib.rs`: build the native menu inside `setup`, after Plan 5's `SimilarEnv` manage and before the Find similar background start. Also rename and adjust the test `capability_grants_opener_reveal_only`, so it allows exactly reveal plus the one scoped `open-path` (R10);
  - `app/src-tauri/capabilities/default.json`: add `opener:allow-open-path` scoped to `$RESOURCE/THIRD_PARTY_NOTICES.md` (R10);
  - `app/src/firstrun.ts`: `boot()` plays the intro (R12). Plan 5 Task 6 already changed this file (`enableInBackground`, `mountSettings`, `FIND_SIMILAR_COPY` re-exported from `settings/find-similar.ts`);
  - `app/src/settings/find-similar.ts`: Plan 5's credit line gains the "About the model" link, which opens the notices (P5-R13);
  - `app/src/styles.css`, `DESIGN.md` and `app/src/inks.test.ts` (Step 3, D17);
  - `app/src/settings/find-similar.test.ts`: the "About the model" link opens the notices through `openPath`.

**Interfaces:**
- Consumes `get_settings` and `set_settings`, which take the partial patch from the Plan 1 Task 8 carry ruling, and `firstrun.ts`.
- Produces:
  ```ts
  export const INTRO_MAX_MS = 6000;
  export function playIntro(root: HTMLElement, opts: { reducedMotion: boolean }): Promise<"done" | "skipped">;
  export function shouldPlayIntro(s: Settings): boolean;      // !s.introSeen
  export function mountAbout(root: HTMLElement, info: AboutInfo): { close(): void };
  export type AboutInfo = { version: string; fonts: { family: string; licence: string }[]; noticesPath: string;   // absolute path of the bundled THIRD_PARTY_NOTICES.md
                            demoCredits: { title: string; credit: string; rights: string }[] };
  ```
- **The menu** uses `tauri::menu`, and is native on all three systems:
  - **Help:** "Play intro", "About Horus" and "Verify image files…", which runs `verify_hashes` from Task 2 with progress and cancel.
  - **File:** "Open library folder", which reveals the open library's folder in the file manager through the opener's reveal permission. It complements the in-app Library menu (Open, New) rather than repeating it (C3).
  - **"Verify image files…"** shows its progress and a Cancel text button in the import notice, the same surface as Task 3b's import progress (D15, C3).
  - On macOS, the standard app menu holds About.
- **Behaviour:**
  - The intro plays on first launch, from `boot()`: `boot()` awaits `playIntro` when `shouldPlayIntro(settings)`, **before** the `lastLibrary` branch and before `firstRun()`, so it plays once for everyone, including users who already have a library (R12). It sits above Settings (z 45) and first run (z 50).
  - The first `keydown`, `pointerdown` or `wheel` resolves it as `"skipped"`, within one frame.
  - It resolves as `"done"` by `INTRO_MAX_MS` at the latest.
  - When it resolves either way, `set_settings({ introSeen: true })` is called.
  - Under reduced motion it shows a still frame, which stays until any input.
  - "Play intro" replays it and leaves `introSeen` as it is.
- **The look is a showcase surface:**
  - It uses the DESIGN.md system: the Conservation Study, the Source Serif 4 wordmark, the Grey Card N5 specimen and the operation inks, used only to name operations.
  - **Its copy never claims there are always four operations** (Plan 3 cross-plan impact item 8). Operations are editable, so the seed's four are described as "a starting set".
  - The visual and motion concept is **not specified here**. It comes from a design pass run with the `impeccable` skill, in its showcase register, with the user (SPEC §8 "done with you").
  - This task builds the mechanics, with a placeholder frame: the "Horus" wordmark centred on the shell.
- **About** shows:
  - the version;
  - "Works offline. No account, no telemetry. Find similar downloads an image model from huggingface.co only if you turn it on." (G7 names the host);
  - the font licences;
  - a "Third-party notices" link, which opens the bundled `THIRD_PARTY_NOTICES.md` through `opener` (`openPath`), the same target as Plan 5's "About the model" link (P5-R13);
  - the demo set credits, taken from the manifest's `credit` and `rights` fields.

- [ ] **Step 1: Write the failing tests**
  - `shouldPlayIntro` gives false once `introSeen` is set.
  - Rust `patch_without_intro_keeps_it`: a merge with a patch that has no `introSeen` leaves `intro_seen == true` unchanged, and a patch with `introSeen: true` sets it.
  - With fake timers:
    - `playIntro` resolves `"done"` at `INTRO_MAX_MS`;
    - a `keydown` at 100 ms resolves `"skipped"` immediately;
    - a `pointerdown` does the same.
  - With `reducedMotion: true`, no CSS animation or transition is set on the intro elements. It stays open until a key, and resolves `"skipped"`.
  - The intro DOM's text has no "Taxonomy of Visuals" or "Iris" (SPEC §8).
  - `no_fixed_operation_count`: neither the intro's nor About's text matches `/\b(four|4) operations\b/i`.
  - `boot()`: after the intro resolves, the first-run step 1 is shown, and `setSettings` was called with `{ introSeen: true }`. A second boot with `introSeen` set never shows the intro. A boot **with** a `lastLibrary` and no `introSeen` plays the intro once, then opens the library (R12).
  - `capability_grants_reveal_and_notices_only` (renamed, Rust): the capability grants reveal and exactly one scoped `open-path` (R10).
  - About lists every font family that `checkFonts` finds, and one demo credit per manifest record.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- intro about firstrun find-similar` and `cargo test settings:: tests::capability`. They should FAIL, then PASS.

- [ ] **Step 3: The design pass (with the user).** Run the `impeccable` skill on the intro surface in its showcase register. Write the result into `intro.ts` and `styles.css`, keeping the Step 1 tests green. Record the approved concept as a short "Intro card" section in `DESIGN.md`.
  - **D17 in the same pass:** light Group Green's `-on` measures 4.37:1, under AA's 4.5:1. The design reviewer picks the smallest seed-ink change that reaches 4.5:1, `DESIGN.md` records it, and `inks.test.ts` asserts it.

- [ ] **Step 4: Commit.** Commit message: `feat(ui): skippable intro card, native menu and About with licences and credits`.

---

### Task 5: The app icon and bundle configuration for each platform

**Files:**
- Create:
  - `app/src-tauri/icons/source/app-icon.svg` and `app-icon-1024.png`, from the design pass;
  - `app/src/glyphs/glyphs.ts`, `app/src/glyphs/*.svg` and `app/src/glyphs/glyphs.test.ts`: the in-app glyph set (see below);
  - `app/THIRD_PARTY_NOTICES.md`, **generated**. This is the same file name and location as Plan 5's, so there is one notices file;
  - `app/src-tauri/tauri.macos.conf.json` and `app/src-tauri/tauri.windows.conf.json`, the per-platform overrides (B2, B4).
- Modify:
  - `app/notices/manual.md` (created by Plan 5 Task 1, R5): it already holds SigLIP (the full Apache-2.0 text and a dated "NOTICE: none" line), ONNX Runtime 1.31.1 (its `LICENSE` and `ThirdPartyNotices.txt`) and `tokenizers`. This task adds the Visual C++ redistributable licence line for the app-local DLLs (B4);
  - `app/src-tauri/tauri.conf.json`, the `bundle` section;
  - `app/scripts/release-check.mjs`, adding `checkBundle(conf)`;
  - `app/scripts/fetch-ort.mjs` (Plan 5): on Windows it also copies the four VC++ DLLs (B4);
  - Find similar's platform guards and loading (B1, B2, B4), in Plan 5's code: `app/src-tauri/src/commands/similar.rs` (beside the AVX2 guard), `app/src-tauri/src/similar/encoder.rs` (before `ort::init_from`), `app/src-tauri/src/similar/copy.rs`, `app/src-tauri/src/lib.rs` (`ort_library`: resolve the dylib from `Contents/Frameworks` on macOS), `app/src/api.ts`, `app/src/settings/find-similar.ts` and `app/src/firstrun.ts`.

**Interfaces:**
- **The in-app glyph set (Plan 3 cross-plan impact item 6).** Plans 2 and 3 show each technique, domain and operation `icon` as its description text "until Plan 6 draws the glyphs". This task draws them.
  - **Files:** `app/src/glyphs/glyphs.ts` and `app/src/glyphs/*.svg`. Each is a single-weight 24 px line SVG that uses `currentColor`, so it takes the operation ink or the ink of the surrounding text.
  - **The key is the exact `icon` description string:**
    - every icon string in the bundled `taxonomy.json`: the 48 techniques, the 6 domains and the 4 operations;
    - Plan 3's `DOMAIN_ICONS`, including the two generic entries **"a plain square"** and **"a dot inside a ring"**;
    - the default for new operations, **"a plain square"**.
  - **The fallback:** `glyphFor(icon: string): string` returns the SVG for a known description. It returns "a plain square" for an unknown or empty one, so custom techniques (whose `icon` is `""`) still draw.
  - **The look:** the glyphs are drawn in the same `impeccable` design pass as the app icon. They are not Iris's glyphs (REFERENCE-ANALYSIS §2.1, §2.2 and §4 record those to avoid).
  - **`checkGlyphs(taxonomyJson, domainIcons)`** is added to `release-check`. It fails if any icon string in the bundled taxonomy or in `DOMAIN_ICONS` has no SVG.
  - **Tests:**
    - `glyph_fallback`: `glyphFor("")` and `glyphFor("no such icon")` both return the plain-square SVG.
    - `checkGlyphs`: it fails a fixture taxonomy with one undrawn icon, and passes the real set.
- The icon:
  - Run `npm run tauri icon src-tauri/icons/source/app-icon-1024.png`. It generates `32x32.png`, `128x128.png`, `128x128@2x.png`, `icon.icns`, `icon.ico` and the Windows Store logos into `src-tauri/icons/`.
  - It is designed in the same `impeccable` pass as the intro, legible at 16 px, with no eye motif (recommended) and no Iris marks.
- `bundle` (the existing `resources` **map** stays, R2; Plan 5 added `ort/*`):
  ```json
  {
    "active": true, "targets": ["nsis", "msi", "dmg", "app", "appimage", "deb"],
    "publisher": "Jake Manahan", "copyright": "© 2026 Jake Manahan", "category": "GraphicsAndDesign",
    "shortDescription": "A local reference workbench for artists",
    "resources": {
      "resources/taxonomy.json": "resources/taxonomy.json",
      "resources/demo/manifest.json": "resources/demo/manifest.json",
      "resources/demo/images/*": "resources/demo/images/",
      "../src/fonts/OFL-*.txt": "licenses/",
      "ort/*": "ort/",
      "../THIRD_PARTY_NOTICES.md": "THIRD_PARTY_NOTICES.md"
    },
    "windows": { "webviewInstallMode": { "type": "embedBootstrapper" },
                 "nsis": { "installMode": "currentUser" }, "digestAlgorithm": "sha256" },
    "macOS": { "minimumSystemVersion": "11.0", "signingIdentity": "-" },
    "linux": { "deb": { "depends": ["libwebkit2gtk-4.1-0", "libgtk-3-0"] }, "appimage": { "bundleMediaFramework": false } }
  }
  ```
  - A `..` source mapped to an explicit target keeps the notices at `$RESOURCE/THIRD_PARTY_NOTICES.md`, which Task 4's scoped `open-path` names (R2, R10).
  - **macOS (`tauri.macos.conf.json`, B2):** the dylib ships as a framework by default: `"frameworks": ["ort/libonnxruntime.dylib"]` (it lands in `Contents/Frameworks`, which Tauri signs), and `"ort/*": null` drops it from the resources. Plan 5's `lib.rs` resolves the dylib from `Contents/Frameworks` on macOS. `Resources` would be used only if a separate Developer ID signing and notarisation spike (Task 7) proves that a dylib there signs and notarises; Task 6's ad-hoc spike checks the framework placement only.
  - **Windows (`tauri.windows.conf.json`, B4):** the four VC++ DLLs sit in `src-tauri/ort/` beside `onnxruntime.dll` (so dev runs and the pre-load find them), and the bundle maps them to the resource root, which on Windows is beside `horus.exe` (always searched): `"ort/*": null`, then `"ort/onnxruntime.dll": "ort/onnxruntime.dll"`, `"ort/ThirdPartyNotices.txt": "ort/ThirdPartyNotices.txt"`, `"ort/LICENSE": "ort/LICENSE"`, and `"ort/msvcp140.dll": "msvcp140.dll"` and the same for `msvcp140_1.dll`, `vcruntime140.dll` and `vcruntime140_1.dll`, so nothing ships twice.
  - Step 2 checks that Tauri merges these per-platform files as described (a `null` key removes, a new key adds).
  - **Why NSIS with `currentUser`:** artists usually install without admin rights. MSI stays for managed studio machines.
  - **Why `embedBootstrapper`:** it installs WebView2 when it is missing, and costs about 1.8 MB (Review Focus 5).
  - The hardened runtime is enabled by default when Tauri signs with a Developer ID, so no key is set for it.
  - **Why `signingIdentity: "-"` (ad-hoc):** with no Developer ID, an ad-hoc signature lets the arm64 build launch on Apple Silicon. Without one, macOS reports the app as "damaged" instead of offering "Open Anyway". Task 7 replaces it with the Developer ID once it exists.
  - No contact field (an email or URL) is set anywhere, because none was given (Decision 3).
- `checkBundle` checks:
  - the targets list;
  - that every `resources` source in the map resolves;
  - that no resource path matches the third-party exclusions;
  - that the icon files exist;
  - **that ONNX Runtime is really there (R8):** this OS's file (`onnxruntime.dll`, `libonnxruntime.dylib` or `libonnxruntime.so`) is in `src-tauri/ort/` with the size pinned in `fetch-ort.mjs` (the one source of the pins). Plan 5's `.gitkeep` keeps the `ort/*` glob resolving on a fresh clone, so without this check a build that skipped `npm run fetch:ort` would silently ship no ORT;
  - on Windows, that the four VC++ DLLs are in `src-tauri/ort/` with a PE file version of at least 14.x. They have no SHA-256 pin, because the build machines' copies change (B4);
  - that each artefact is within its measured size budget (Global Constraints, R9), read from `budgetBytes` (per artefact) in `app/release-check.json`, which this task writes from the measurements. The same file holds `textures` (Task 1).
- **Find similar on each platform (B1, B4).** These change Plan 5's code, so they sit here with the platform config:
  - **The macOS 14 guard (B1).** Beside Plan 5's AVX2 guard, at start-up and before any load: on macOS, read `sysinfo::System::os_version()`, parse the major version as a `u32` (so 26 and later work), and if it is below 14, Find similar is unavailable. If `os_version()` returns `None`, the guard fails open. ORT is never `dlopen`ed when the guard fails.
  - **`SimilarStatus.unsupported: Option<String>`** (Rust; in `api.ts` the optional `unsupported?: string | null`, so the existing test fakes stay valid) is set at start-up when either guard fails (AVX2, or macOS below 14), so Settings and first run can render it before any enable. Its copy is fixed, from `similar/copy.rs`: "Find similar needs macOS 14 or later." (and Plan 5's processor line for AVX2).
  - **Settings:** one muted line in place of the switch, with no "Try again". **First run:** the same line instead of the choice, and `find_similar` is recorded as `"off"`.
  - **Windows pre-load (B4).** `ort::init_from` calls `LoadLibraryExW(..., 0)`, which doesn't search `ort/` for dependencies. So before `init_from`, Plan 5's loader pre-loads `onnxruntime.dll` with `LoadLibraryExW(path, NULL, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS)` and keeps the `HMODULE` alive. That way dev runs (all DLLs in `ort/`) work too.
  - **Sourcing the VC++ DLLs (B4):** `fetch-ort.mjs` on Windows copies `msvcp140.dll`, `msvcp140_1.dll`, `vcruntime140.dll` and `vcruntime140_1.dll` from the build machine's Visual Studio `VC\Redist\MSVC\<ver>\x64\Microsoft.VC14*.CRT\` (found through `vswhere`) into `src-tauri/ort/`. Microsoft's Visual C++ redistributable terms allow app-local copies; `notices/manual.md` records the licence line.
  - **Tests:** `macos_guard_by_version` with an injected version: 13 is unsupported, 14 and 26 are supported, `None` is supported. `unsupported_is_set_before_enable`: the status carries the line, and enabling never loads the encoder. TS: Settings shows the muted line and no switch; first run shows the line instead of the choice and records `"off"`.
- `app/THIRD_PARTY_NOTICES.md` is generated from three parts, in this order:
  1. `app/notices/manual.md`;
  2. `cargo about generate about.hbs` (with `app/src-tauri/about.toml` accepting MIT, Apache-2.0, BSD-2/3-Clause, ISC, Zlib, Unicode-3.0 and MPL-2.0);
  3. `npx --yes license-checker-rseidelsohn --production --plainVertical`.

  Both tools run at build time only. An unaccepted licence fails the build. Plan 5 already writes its hand-written section to `notices/manual.md` under the same file name (R5).

- [ ] **Step 1: Write the failing tests.** `checkBundle` should fail on each of these fixtures: a missing icon, a resource source matching nothing, a `resources` entry under `reference/`, an `ort/` with only `.gitkeep`, an ORT file of the wrong size, and (Windows) a missing or pre-14 VC++ DLL. It should pass the real config. Plus the B1 and B4 tests above.

- [ ] **Step 2: Implement, generate the icons and notices, then run.** Run `npm run fetch:ort && npm test -- release-check find-similar firstrun && cargo test similar:: && npm run tauri build`. Expected on Windows:
  - both `.exe` (NSIS) and `.msi` are produced;
  - each is within the budget measured and recorded here in `app/release-check.json`;
  - the NSIS installer installs without an admin prompt;
  - the four VC++ DLLs sit beside `horus.exe` after install, and Find similar loads on a clean Windows VM or Sandbox without the redistributable (the B4 spike: if it doesn't, fall back to loading with `LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR` from `ort/` only, and record the outcome).

- [ ] **Step 3: Commit.** Commit message: `chore(release): app icon, per-platform bundle config and third-party notices`.

---

### Task 6: The CI release workflow (three platforms, unsigned)

**Files:**
- Create: `.github/workflows/release.yml`.

**Interfaces:**
- Triggers: `workflow_dispatch`, and pushes of tags matching `v*`.
- The matrix:
  - `windows-latest`;
  - `macos-latest` (an arm64 runner), with `--target aarch64-apple-darwin` only (R7);
  - `ubuntu-22.04`, with `sudo apt-get install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`, per the Tauri v2 Linux prerequisites.
- Each job runs these steps in order:
  1. Check out the code. Set up Node 24 and stable Rust, then restore the cargo and npm caches.
  2. Run `npm ci`, then `npm run fetch:ort` (Plan 5; it caches the nupkg by its SHA-256, and on Windows also copies the VC++ DLLs), then `cargo test`, `npm test` and `npm run build`. CI never runs `--ignored` or `--include-ignored` (Plan 5 rule) (R8).
  3. Run `npm run release-check`. On tag pushes, run `npm run release-check -- --final`, so a tag can't publish while a gate is open.
  4. Run `tauri-apps/tauri-action@v0` with:
     - `projectPath: app`;
     - `tagName: ${{ github.ref_name }}`;
     - `releaseName: "Horus ${{ github.ref_name }} (unsigned beta)"`;
     - `releaseBody: ${{ steps.notes.outputs.body }}`. An earlier step, `id: notes`, writes `docs/release/INSTALL-UNSIGNED.md` (Task 10) to `$GITHUB_OUTPUT` as a multi-line value (`body<<EOF` … `EOF`). `releaseBody` takes literal text, not a path;
     - `releaseDraft: true`;
     - `prerelease: true`.
  5. Compute `SHA256SUMS` over every artefact and upload it to the same draft release.
  6. **macOS only, the signing spike (B2):** after the build, run `codesign --verify --deep --strict` on `Horus.app` and `codesign -dv` on the bundled ORT dylib. Either failing fails the job. The quarantined launch with Find similar on is a Task 8 manual row.
- **Hosting (Decision 4):** GitHub Releases, built by GitHub Actions on all three systems.
- **Unsigned (Decision 2):** no signing secrets are set, so the artefacts are unsigned. Each release is a draft **prerelease** labelled "unsigned beta" until Task 7 is done.

- [ ] **Step 1: Run it.** Run the workflow by hand with `workflow_dispatch` on a branch. Expected: all three jobs pass, the macOS `codesign` checks pass, and the artefacts include `.exe`, `.msi`, the `aarch64` `.dmg` and `.app.tar.gz`, `.AppImage` and `.deb`.

- [ ] **Step 2: Test the gate.** Push a test tag `v0.0.0-gatecheck` while `RELEASE-GATES.md` has open items. Expected: every job fails at `release-check --final`. Then delete the tag.

- [ ] **Step 3: Commit.** Commit message: `ci: three-platform release build with release-check gate`.

---

### Task 7 (OPTIONAL, DEFERRED): Code signing and notarisation (needs the user's certificates)

> **Deferred by Decision 2.** 1.0 ships as an unsigned beta. Skip this task for 1.0, and do it when the user has the Windows signing and Apple Developer accounts. Nothing else in this plan depends on it.

**Files:**
- Modify:
  - `.github/workflows/release.yml`, to add the secrets as env;
  - `app/src-tauri/tauri.conf.json` (`bundle.windows.signCommand` or the certificate fields);
  - `app/README.md`, under "Signing".

**Interfaces.** Each item below is marked **USER**, because it needs an account or a certificate that only the user can obtain:

- **USER — Windows.** Pick one of these:
  - **(a) Azure Trusted Signing**, recommended because it costs the least and gives SmartScreen reputation sooner. It needs an Azure subscription and identity validation. In CI, `bundle.windows.signCommand` runs `trusted-signing-cli -e <endpoint> -a <account> -c <profile> %1`, with the secrets `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` and `AZURE_TENANT_ID`.
  - **(b) An OV or EV code-signing certificate** from a CA. It uses `certificateThumbprint`, `timestampUrl: "http://timestamp.digicert.com"` and the secrets `WINDOWS_CERTIFICATE` (base64 `.pfx`) and `WINDOWS_CERTIFICATE_PASSWORD`. An EV certificate needs a hardware token and doesn't fit hosted CI easily.
- **USER — macOS.** It needs Apple Developer Program membership.
  - The secrets are:
    - `APPLE_CERTIFICATE`, the base64 `.p12` of the "Developer ID Application" certificate;
    - `APPLE_CERTIFICATE_PASSWORD` and `APPLE_SIGNING_IDENTITY`;
    - for notarisation, either `APPLE_API_KEY` and `APPLE_API_ISSUER` (recommended) or `APPLE_ID`, `APPLE_PASSWORD` (an app-specific password) and `APPLE_TEAM_ID`.
  - Tauri creates its own temporary keychain from the certificate, so there is no keychain password secret.
  - **The API key needs a file:** a CI step before `tauri-action` decodes the secret `APPLE_API_KEY_P8` (base64 `.p8`) to `$RUNNER_TEMP/AuthKey.p8`, and sets `APPLE_API_KEY_PATH` to that path.
  - `tauri-action` signs, notarises and staples the app when these are present.
- **USER (optional) — Linux.** There's no platform signing. Publish SHA-256 checksums next to the artefacts, which CI computes, and optionally a GPG detached signature with `GPG_PRIVATE_KEY`.
- **Without the certificates,** a release is a labelled "unsigned beta". Gate G6 (Task 9) accepts that, provided its unsigned-beta criteria are met.

- [ ] **Step 1: Add the steps behind `if: env.<SECRET> != ''`,** so CI keeps working unsigned.

- [ ] **Step 2: Verify, once the user's secrets are in place:**
  - **Windows:** `signtool verify /pa /v Horus_1.0.0_x64-setup.exe` succeeds.
  - **macOS:** `spctl -a -vv -t install Horus.app` says "Notarized Developer ID", and `xcrun stapler validate Horus.dmg` succeeds.
  - **Linux:** `sha256sum -c SHA256SUMS` passes.

- [ ] **Step 3: Commit.** Commit message: `ci: Windows signing and macOS notarisation via repository secrets`.

---

### Task 8: The cross-platform QA pass

**Files:**
- Create: `docs/release/qa-matrix.md`, which records the results; it is not code.

**Interfaces:** each of the three CI artefacts from Task 6 or Task 7 is installed on a clean machine or VM for its platform: Windows 11, Windows 10 22H2, macOS 14 and 15 on Apple Silicon (plus macOS 13 on Apple Silicon if available, for the B1 guard), and Ubuntu 22.04 and 24.04. There is no Intel Mac row (R7).

- [ ] **Step 1: Run the matrix.** For each platform, record pass or fail and a note for each of these checks:
  1. Installs, without admin on Windows. On Windows 10, temporarily remove WebView2 in a VM; the bootstrapper must install it (Review Focus 5).
  1a. **The unsigned-beta install path works exactly as `docs/release/INSTALL-UNSIGNED.md` says:**
      - **Windows:** SmartScreen shows "Windows protected your PC", then More info, then Run anyway.
      - **macOS 14:** Control-click the app, then Open.
      - **macOS 15+:** the first launch is blocked; System Settings, then Privacy & Security, then "Open Anyway". On Apple Silicon, the app must never report itself as "damaged", which the ad-hoc signature prevents.
      - **Linux:** the AppImage runs after `chmod +x`, and the `.deb` installs with `sudo apt install ./…`.
      - On every platform, the `SHA256SUMS` check passes.
  2. The intro plays once, skips on the first key, and replays from Help.
  3. First run creates a library at a path with non-ASCII characters and spaces. On macOS, use a folder named in NFD, such as `Références` made in Finder.
  4. The demo set opens, and the thumbnails show through the asset protocol.
  5. Folder drag-drop into the Inbox works, and so does pasting an image from a browser (Plan 2).
  6. The Tree, Galaxy and Radial views draw at 60 fps with the demo set, and remain usable with 2,000 references, using the Plan 3 stress fixture. Linux WebKitGTK uses WebGL.
  7. The lightbox opens a TIFF preview (Plan 4).
  8. A board export to a folder opens in the system file manager through "Open folder".
  9. Offline: with networking disabled in the VM, everything above works except the Find similar download (Plan 5), which reports that it is offline.
  9a. **Find similar where it can't or may not run (B1, B2, B4):**
      - Windows without the Visual C++ redistributable (a clean VM or Sandbox): turning Find similar on downloads, loads and indexes;
      - macOS 13 (if available): Settings and first run show "Find similar needs macOS 14 or later." and no switch;
      - macOS 14 and 15: a quarantined download, opened through Gatekeeper, turns Find similar on and indexes (the B2 manual half).
  10. A second launch focuses the existing window (Task 2).
  11. After killing the process while an import runs, the next start shows "Recovered N images" or a clean report, and `library.json` opens (Task 2).
  12. Uninstalling leaves the user's library folder untouched. Record what the uninstaller does with app data, including Plan 5's 213 MB model folder under `app_local_data_dir()/models/` (NSIS offers a "delete app data" checkbox), and say it in `INSTALL-UNSIGNED.md` (C7).
  13. **Accessibility (WCAG 2.2 AA, PRODUCT.md; audit #17):**
      - a keyboard-only pass through first run, tagging an Inbox item, the Tree, Compare and Settings;
      - the axe-core DevTools scan on each view, with no serious or critical issues;
      - focus is always visible;
      - the full "Op > Technique" hover label is live (D4).
  14. **Deferred checks:**
      - **D5:** the QA harness relaunches the app on a first-run pick miss;
      - **D7:** measure the lightbox's Lanczos3 peak at 20000×6000 (about 780 MB recorded); decide whether to resample differently;
      - **D10:** Galaxy at 2,500 references: record the overlapping pairs after settle (1,255 recorded) and decide;
      - **D16:** on macOS, Cmd+Q while a save is failing still shows the save-failure dialog (`ExitRequested`);
      - **D11 (judgment row):** graph label cosmetics (names at about 8 px, faint outlines at fit, crumb ellipsis, Tree down-connector, the Radial fit hiding names, the label floor, `clipLabel`'s space before "…"). Fix only what the design review calls P1.
- [ ] **Step 2: Fix and record.** Fix every failure in the owning plan's code, re-run that row, and record it. A platform passes only when every row passes.
- [ ] **Step 3: Commit.** Commit message: `docs(release): cross-platform QA matrix results`.

---

### Task 9: The release gates (legal, IP, rights and identity)

These are checkable sign-offs, not code. A gate closes only with **evidence and a named owner**. `release-check --final` (Task 1) fails while any box is unticked.

**Files:**
- Create: `RELEASE-GATES.md` at the repository root.

**Interfaces.** Each gate in `RELEASE-GATES.md` has: a checkbox, an owner, its pass criteria, an evidence link (a file in `docs/release/evidence/` or a URL), and a date.

- **G1. Trademark clearance for "Horus"** (PRODUCT.md, SPEC header). The owner is the USER, with counsel.
  - **Pass criteria:** a knockout and full search in Nice classes 9 and 42 at USPTO, EUIPO and WIPO Madrid, plus any country the user will sell in, shows no confusingly similar mark for software. Or counsel advises proceeding.
  - **Order: run this first.** A rename changes the identifier (`art.horus.app`), the wordmark, the icon, the intro, the certificate subject names and the installer names.
- **G2. Legal review of the shipped taxonomy against Iris** (SPEC §7). The owner is counsel.
  - **Inputs:** `taxonomy/taxonomy.json` and its README, plus, for counsel only and never shipped, `REFERENCE-ANALYSIS.md` and what Iris publishes.
  - **Pass criteria:** written advice that the selection and arrangement, with our own definitions, links and 7 custom techniques, may ship as is, or a list of changes. Any change is applied and re-reviewed before the gate closes.
- **G3. Item-by-item rights for the demo set** (`demo/README.md`). The owner is the USER, or counsel.
  - **Pass criteria:**
    - Each of the 50 records was re-checked at its source within 30 days of release, with `rightsCheckedAt` updated.
    - The AIC CC0 statement and the credit format are honoured in About (Task 4).
    - **The four WPA posters whose `creator` reads "Unidentified artist (…)"** each have an explicit keep-or-remove decision recorded. If any is removed, the manifest and its technique examples are updated and `demo/check_manifest.py` passes.
    - The 2026-11-25 additions (Velonis, *Free Art Classes*) are confirmed.
- **G4. No third-party material, and no foreign marks, in the build.** This gate is automated: `release-check` `checkNoThirdParty` and `checkNoForeignMarks` pass on every final artefact's unpacked resources. The owner is the release engineer.
- **G5. Licences.** The OFL texts ship with the fonts, `THIRD_PARTY_NOTICES.md` is complete with no unaccepted licence and includes Plan 5's model entries, and About links both. This is automated, and owned by the release engineer.
- **G6. Signed builds, or a properly labelled unsigned beta.** The owner is the release engineer. **For 1.0, the unsigned-beta route applies (Decision 2).** The gate closes on either route:
  - **Signed:** Task 7 is done. Windows passes `signtool verify`, and macOS is notarised and stapled.
  - **Unsigned beta:** every one of these holds:
    - the GitHub release is a **prerelease** and its name ends "(unsigned beta)";
    - its body is `docs/release/INSTALL-UNSIGNED.md`;
    - `app/README.md` has the same "Installing the unsigned beta" section;
    - `SHA256SUMS` is attached;
    - QA row 1a passes on all three systems.

  `RELEASE-GATES.md` records which route was taken and why.
- **G7. The privacy statement is accurate.** About's text matches behaviour: `checkNoRemoteUrls` passes, and QA row 9 passes. The Plan 5 model host (`huggingface.co`) is named in About. Owned by the release engineer.
- **G8. Licence of the Find similar model export** (Plan 5, Decision 1). The owner is the USER, or counsel.
  - **The issue:** the weights `google/siglip-base-patch16-224` are Apache-2.0, but the ONNX export that Plan 5 downloads, `Xenova/siglip-base-patch16-224` at commit `4649052661e53c7000355844105f8a1792088239`, carries no licence tag.
  - **Pass criteria:** one of the two routes below, recorded with its evidence.
    - **(a) Confirmed:** written confirmation (from the repo owner, or a licence file added at a pinned commit) that the export is redistributable under Apache-2.0. If the commit changes, Plan 5's `SIGLIP_B16_Q8` revision and its SHA-256 values are updated, and Plan 5's download tests pass.
    - **(b) Self-converted:** the model is converted from `google/siglip-base-patch16-224` with Hugging Face Optimum (int8, the same inputs and outputs as Plan 5's encoder expects) and hosted on a Horus-owned location. Plan 5's `SIGLIP_B16_Q8` then gets the new files, sizes, SHA-256 values and `base` host; Plan 5's ignored `real_model_semantics` test passes against the new files; Plan 5 Task 8 Step 3b re-calibrates the cut-offs; and the About privacy line names the new host (G7). (Plan 5 dropped the fp32 parity test, P5-R18.)
  - **On either route:** `app/notices/manual.md` carries SigLIP's Apache-2.0 entry with either the upstream NOTICE text or a dated "NOTICE: none" line and its evidence (Plan 5 recorded none on 2026-11-27), and so does the generated `THIRD_PARTY_NOTICES.md` (G5, R5).
  - **The automated part, in `release-check`:**
    - `checkGates` treats G8 like every other gate;
    - `checkNotices(noticesMd)` fails unless the notices name `google/siglip-base-patch16-224` and `Apache License, Version 2.0`, and hold either an upstream NOTICE text or a dated `NOTICE: none` line (Task 1, R5).
- [ ] **Step 1: Write `RELEASE-GATES.md`** with G1–G8 as unticked boxes, each with all the fields above. Run `npm run release-check -- --final`. Expected: it fails and lists 8 open gates.
- [ ] **Step 2: Commit.** Commit message: `docs(release): explicit legal, IP, rights and signing gates`.

---

### Task 10: Cut Horus 1.0

- [ ] **Step 1: Bump the version to `1.0.0`** in the three files. `checkVersions` must pass. Write the release notes in `CHANGELOG.md`, describing what v1 does and what is v1.1 or later: the always-on-top board window, the opt-in update check, option C search and signed builds.
- [ ] **Step 1a: Write `docs/release/INSTALL-UNSIGNED.md`, and copy it into `app/README.md` as "Installing the unsigned beta".** It says plainly that the builds are not code-signed yet, that this is why the operating system warns, and how to verify the download. It then gives one numbered section per system:
  - **Verify first:**
    - Windows: `Get-FileHash .\Horus_1.0.0_x64-setup.exe -Algorithm SHA256`, compared with `SHA256SUMS`;
    - macOS and Linux: `shasum -a 256 -c SHA256SUMS` or `sha256sum -c SHA256SUMS`.
  - **Windows:** "Windows protected your PC" → More info → Run anyway. The warning fades as the download gains reputation.
  - **macOS 14 and earlier:** Control-click Horus in Applications, choose Open, then confirm.
  - **macOS 15 and later:** open it once and close the warning. Then go to System Settings → Privacy & Security, scroll to Horus, click "Open Anyway" and confirm with your password.
  - **Linux:** `chmod +x Horus_1.0.0_amd64.AppImage`, or `sudo apt install ./horus_1.0.0_amd64.deb`.
  - **macOS** downloads are for Apple Silicon only (`Horus_1.0.0_aarch64.dmg`); Find similar needs macOS 14 or later (R7, B1).
  - What uninstalling leaves behind: the library folder always, and the Find similar model folder unless app data is deleted (C7).
  - A closing line that signed builds will follow, and that nothing in the app needs the internet.
- [ ] **Step 2: Close every gate in `RELEASE-GATES.md`, with evidence.** Run `npm run release-check -- --final`. Expected: exit 0.
- [ ] **Step 3: Tag and build.** Push the tag `v1.0.0`. CI builds the unsigned artefacts, uploads `SHA256SUMS`, and creates a draft prerelease named "Horus v1.0.0 (unsigned beta)". Check the artefacts and the checksums against Task 8 one more time.
- [ ] **Step 4: Publish (USER).** The user publishes the draft prerelease on GitHub Releases. Publishing is an outward-facing step, so it is never automated.
- [ ] **Step 5: Commit.** Commit message: `chore(release): Horus 1.0.0`.

---

## Auto-update: out of v1.0 (decided)

**Decided: auto-update is out of 1.0** (Decision 1). The reasons:

- **The offline promise.** SPEC §10 and §11 say the app is local, with no server, and an update check is a network call the app would otherwise never make.
- **It needs infrastructure.** `tauri-plugin-updater` needs an update-signing key pair that must never be lost, plus hosting for `latest.json`.
- **Downloading a new installer is fine.** For a 1.0 that artists install deliberately, that is acceptable.

**How to revisit it in v1.1:**

- Use `tauri-plugin-updater`, with the endpoint pointed at the GitHub release's `latest.json`.
- Make it **opt-in**: a "Check for updates" menu item, with no background check. Name it in the About privacy line.
- Keep the updater's private key as a CI secret, backed up offline.

## Decisions (answered by the user, 2026-11-25)

1. **Auto-update:** out of 1.0. 1.1 adds an opt-in "Check for updates" menu item, with no background check (see "Auto-update" above).
2. **Signing:** ship 1.0 as an **unsigned beta**.
   - Task 7 (signing and notarisation) is optional and deferred.
   - Gate G6 accepts the unsigned-beta route.
   - The release notes and `app/README.md` explain the SmartScreen and Gatekeeper warnings and how to get past them (Task 10 Step 1a).
   - macOS builds are ad-hoc signed (`signingIdentity: "-"`), so Apple Silicon offers "Open Anyway" rather than reporting the app as damaged.
3. **Publisher, copyright and authors:** "Jake Manahan", exactly as given, for `bundle.publisher`, `bundle.copyright` ("© 2026 Jake Manahan") and Cargo `authors`. No email or contact field is set anywhere, because none was given.
4. **Hosting:** GitHub Releases, built by GitHub Actions on Windows, macOS and Linux (Task 6). Each release is a draft prerelease until the user publishes it.

**Preflight rulings (controller, 2026-11-27, delegated by the user and reversible by them):** see `plan6-preflight-rulings.md`. The platform calls: macOS stays 11+ for the app with Find similar on macOS 14+ (B1); the ORT dylib ships as a macOS framework (B2); the VC++ runtime ships app-local (B4); macOS is Apple Silicon only (R7, the user's own ruling in Plan 5).

**Open with the user:** R27, metadata editing (title, creator, year, credit) in v1. Not ruled; it stays out of v1 unless the user says otherwise.

## Carried from Plan 2 (user decision, 2026-11-25)

These now have owners: import progress and Cancel is Task 3b Step 2 (D15), the macOS close dialog is a Task 8 row (D16), and the save-failure copy is Task 3b Step 2 (D13).

- **Import progress and Cancel.** Plan 1 QA (M3) found that a long import shows only "Importing…". Add an "N of M" count and a Cancel button to the import notice. The user chose to do this in a later plan rather than in Plan 2.
- **macOS close dialog.** The Plan 2 final review (M2) found that Cmd+Q may bypass the save-failure dialog (`lib.rs`, `ExitRequested`). Check it on the macOS build.
- **Save-failure copy.** Plan 2 QA (N1) found that the save-failure message shows raw OS text, for example "Access is denied. (os error 5)". Add a plain hint, for example "Check that the library folder is not read-only", in the copy pass.
