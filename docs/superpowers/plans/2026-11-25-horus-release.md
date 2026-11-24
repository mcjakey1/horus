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
  - #3 (Task 1: Pixi texture loading under the CSP);
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
- **The library folder layout is Plan 1's, plus `.incoming/` and `taxonomy.bak.json` (Plan 2) and `embeddings.bin` (Plan 5).**
  - The integrity work only reads it, removes `*.tmp` files (including those in `.incoming/`), and adds references through `edit::apply`.
  - It ignores `embeddings.bin`.
  - It never deletes or rewrites `taxonomy.bak.json`. That file is only validated (Task 2).
- **The intro** plays once on first launch, can be replayed from a menu, and any key or click skips it (SPEC §5). It is never longer than 6 seconds, and it shows as a still frame under `prefers-reduced-motion: reduce` (DESIGN.md Motion, SPEC §11 anti-goal).
- **The three platforms:**
  - Windows 10 1809+ and 11 (x64);
  - macOS 11+ (universal: arm64 and x86_64);
  - Linux x86_64 on glibc 2.35+, which means building on Ubuntu 22.04, with WebKitGTK 4.1.
- **No inline style attributes in HTML strings.** UI code sets styles through classes, the CSSOM, or `data-css` with `applyCss` (Task 1), so the CSP can keep `style-src 'self'`.
- **One version number** in `app/package.json`, `app/src-tauri/Cargo.toml` and `app/src-tauri/tauri.conf.json`.
- **Size budget:** this is set from measurements, not guessed.
  - The budget is Plan 1 Task 10's measured installer size, plus the ONNX Runtime size that Plan 5 Task 2 Step 3 records, plus the demo set, plus 10% headroom.
  - Task 5 records the number and `checkBundle` enforces it.
  - Until both measurements exist, the provisional ceiling is 60 MB.

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

---

### Task 1: The release-check script and configuration hardening

**Files:**
- Create:
  - `app/src/css.ts` (`applyCss`) and `app/src/css.test.ts`;
  - `app/scripts/release-check.mjs`;
  - `app/scripts/release-check.test.mjs` (Vitest);
  - `app/scripts/fixtures/`, with small fake `tauri.conf.json`, `Cargo.toml` and `dist/` trees.
- Modify:
  - `app/src-tauri/tauri.conf.json`;
  - `app/src-tauri/capabilities/default.json`;
  - `app/src-tauri/Cargo.toml`;
  - `app/package.json`, adding the `"release-check": "node scripts/release-check.mjs"` script;
  - `app/src/fonts/`: the full `OFL.txt` for each family, with its copyright line.

**Interfaces:**
- Produces:
  ```js
  // each returns string[] of problems; [] means pass
  export function checkCsp(conf)                 // tauri.conf.json object
  export function checkGlobals(conf)             // app.withGlobalTauri === false
  export function checkCapabilities(caps)        // only the ALLOWED_PERMISSIONS below
  export function checkCargoMeta(cargoToml)      // description != "A Tauri App"; authors == ["Jake Manahan"] (no email)
  export function checkVersions(pkg, cargoToml, conf)
  export function checkFonts(fontDir)            // every .ttf/.woff2 family has OFL.txt containing "SIL OPEN FONT LICENSE Version 1.1" and a "Copyright" line
  export function checkNoThirdParty(paths)       // dist/ and bundle resources contain none of the excluded paths
  export function checkNoForeignMarks(files)     // no /\bIris\b|Taxonomy of Visuals|Modern Art Direction/i in shipped text
  export function checkNoRemoteUrls(files)       // app sources only: app/src/**/*.{ts,js,css,html} + app/index.html; no http(s):// (SVG xmlns allowed)
  export function checkNoInlineStyle(files)      // app sources only (same set); no `style="` or `style=${` in TS/JS template strings or HTML; CSS files exempt
  // Both scan our own sources, never dist/ (vendor chunks such as PixiJS carry documentation URLs) and never
  // src-tauri/resources/demo/ (manifest.json legitimately holds ~100 https source URLs). The CSP enforces both at runtime.
  export function checkGates(markdown, final)    // final: every "- [ ]" in RELEASE-GATES.md is a failure (G1–G8)
  export function checkNotices(noticesMd)        // SigLIP Apache-2.0 NOTICE present (gate G8, Task 9)
  // CLI: node scripts/release-check.mjs [--final]  → prints problems, exit 1 if any
  ```
- The CSP is exactly this, with no `'unsafe-eval'` and no `'unsafe-inline'`:
  ```
  default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self';
  img-src 'self' asset: http://asset.localhost data: blob:; connect-src ipc: http://ipc.localhost asset: http://asset.localhost;
  worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'
  ```
  - `worker-src` is there for Plan 3's Galaxy layout, which runs `d3-force` in a Web Worker, and for Pixi's worker-based texture loader.
  - `connect-src` includes `asset:` and `http://asset.localhost`, because PixiJS v8 loads textures with `fetch()`, which `connect-src` governs, not `img-src` (audit #3). These are local protocols, so the app is still offline.
    - The alternative, if a reviewer prefers the tighter policy: Plan 3 loads textures from an `HTMLImageElement` (`Texture.from(img)`, with `preferWorkers: false`), and `connect-src` drops `asset:`.
    - Either way, Step 4 checks that the canvas views show thumbnails, not dots.
  - Setting styles through the CSSOM (`el.style.cssText = …` and `el.style.setProperty(…)`) is fine under `style-src 'self'`. A `style="…"` attribute inside HTML that goes through `innerHTML` is **blocked**.
  - Plan 1 Task 8 currently emits such attributes, in `view.ts` (region boxes, badges, callout inks), `tile.ts` (plate and outline boxes), `leaders.ts` (`--hot`) and `search.ts` (swatches).
  - **The fix:** templates emit `data-css="…"` instead of `style="…"`. A helper, `applyCss(root: ParentNode): void` in `app/src/css.ts`, runs after each `innerHTML` assignment and copies each `data-css` value to `el.style.cssText`, then removes the attribute.
  - The same rule applies to every UI module in Plans 2–5. `checkNoInlineStyle` (below) enforces it.
  - If Plan 3's PixiJS fails under this CSP, fix it with Pixi's no-eval path (the `pixi.js/unsafe-eval` shim module, which avoids `eval`). Never relax the CSP.
- `ALLOWED_PERMISSIONS`:
  - `core:default`;
  - `dialog:allow-open`;
  - `opener:allow-reveal-item-in-dir`, kept because Plan 4's "Open folder" uses it;
  - `opener:allow-open-path`, scoped to `$RESOURCE/THIRD_PARTY_NOTICES.md` only, because About and Plan 5's "About the model" open the notices file in the default viewer.

  Single-instance focuses the window from Rust, so it needs no capability.

  Anything else needs a line in this list together with the reason for it.

- [ ] **Step 1: Write the failing tests.** Each function gets one failing fixture and one passing fixture:
  - A CSP containing `'unsafe-eval'` fails, and so do a null CSP and the Plan 1 Task 10 interim `style-src 'self' 'unsafe-inline'`.
  - A CSP whose `connect-src` lacks `asset:` fails, unless `app/release-check.json` sets `"textures": "img-element"`, which records that the alternative route is in use. Tauri v2 rejects unknown keys in `tauri.conf.json`, so the flag never goes there.
  - `withGlobalTauri: true` fails.
  - `opener:default` fails, and `opener:allow-reveal-item-in-dir` passes.
  - `authors = ["you"]` fails, `authors = ["Jake Manahan"]` passes, and an author string containing `<…@…>` fails, because no email was given.
  - `1.0.0` against `0.1.0` fails the version check.
  - A font directory with a `.ttf` but no `OFL.txt` fails.
  - A `dist/` containing `reference/frame-036s.jpg` fails.
  - The source scans ignore `dist/assets/pixi-*.js` (a fixture with a vendor `https://` string passes) and `resources/demo/manifest.json`.
  - A JS file containing the string "A Taxonomy of Visuals" fails.
  - `fetch("https://x")` fails, but `xmlns="http://www.w3.org/2000/svg"` passes.
  - `checkGates` with one `- [ ]` passes when not final and fails when final.
  - `checkNotices` fails on notices without the SigLIP Apache-2.0 NOTICE, and passes on a fixture that names `google/siglip-base-patch16-224`, `Apache License, Version 2.0` and has a `NOTICE` section (gate G8).
  - A JS file containing `` `<span style="left:${x}px">` `` fails `checkNoInlineStyle`, and `` `<span data-css="left:${x}px">` `` passes.
  - `applyCss` (in `app/src/css.test.ts`): after `applyCss(root)`, the element's `style.left` is `"12px"`, its CSS variable `--c` resolves, and `data-css` is gone.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- release-check`. It should FAIL, then PASS.

- [ ] **Step 3: Harden the real tree until it passes:**
  - convert the inline `style="…"` templates in Plan 1 Task 8's `view.ts`, `tile.ts`, `leaders.ts` and `search.ts`, and in any landed Plan 2–5 module (including Plan 5's `similar-ui.ts` and `settings/`), to `data-css` plus `applyCss`;
  - set the CSP, which removes Plan 1 Task 10's temporary `'unsafe-inline'`;
  - set `withGlobalTauri: false`;
  - trim the capabilities;
  - set Cargo `description = "A local reference workbench for artists"` and `authors = ["Jake Manahan"]`, with no email (Decision 3);
  - add the OFL texts.

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
  - `app/src-tauri/src/lib.rs`, to register `tauri_plugin_single_instance::init` first and focus the main window;
  - `app/src-tauri/src/commands.rs`, so `open_library` runs the check;
  - `app/src-tauri/src/taxonomy.rs`, to put `NAMES_41`, `OBSERVED` and `validate_seed` behind `#[cfg(test)]`.

**Interfaces:**
- Consumes:
  - `Library` (Plan 1 Task 2, as hardened in Plan 2 Task 4);
  - `import::import_paths` and `ImportOutcome` (Plan 1 Task 4);
  - the shared public helpers `import::decode_srgb` and `import::write_thumbs` (audit #5, added by Plan 4 Task 3; if Plan 4 has not landed, add them to `import.rs` here, so `import.rs` joins this task's Files);
  - `edit::Edit::AddReferences` and the mutating-command recipe (Plan 2 Tasks 1 and 5).
- Produces:
  ```rust
  pub struct IntegrityReport {
      pub swept_tmp: Vec<PathBuf>,            // removed
      pub missing_originals: Vec<String>,     // reference ids whose images/<file> is gone (never deleted from library.json)
      pub rebuilt_thumbs: Vec<String>,        // reference ids whose thumbs were missing and were regenerated
      pub orphans: Vec<PathBuf>,              // images/<hash>.<ext> that no reference points to
      pub taxonomy_backup_invalid: bool,      // taxonomy.bak.json present but Taxonomy::load or validate() fails; reported, never deleted
  }
  pub fn sweep_tmp(root: &Path) -> Vec<PathBuf>;                 // root, images/, thumbs/256/, thumbs/1024/, .incoming/: names ending ".tmp" or starting ".tmp"
  pub fn check(lib: &Library) -> IntegrityReport;               // existence checks only, no hashing; rebuilds missing thumbs from the original;
                                                                // if taxonomy.bak.json exists, loads it and runs validate() (Plan 2 Task 3 rotation)
  pub fn verify_hashes(lib: &Library, cancel: &AtomicBool) -> Vec<String>;   // on demand from the menu; ids whose BLAKE3 ≠ hash
  ```
- `LibraryView` (Plan 1 Task 7) gains `integrity: Option<IntegrityReport>`, which is set when anything was found.
  - In TypeScript it is the optional `integrity?: IntegrityReport | null`.
  - Update every existing fake `LibraryView` in the tests to include it, or leave it absent (audit #24).
- **Spec delta, to record in the release notes:** `check` rebuilds a missing thumbnail by decoding the original. This is a maintenance exception to SPEC §9's "Originals are decoded only in the lightbox", not a browsing path (audit #27).
- The UI shows one quiet notice for the report:
  - "Recovered N images to the Inbox" offers "Add them", which adds the orphans as references through one `Edit::AddReferences`, so the step can be undone. The image files are already in place, and their hashes come from the file names.
  - "M references are missing their image file" offers "Show them", which filters the Ranked list to those references. A missing original is never deleted from `library.json`.
- Single-instance: a second launch passes its arguments to the first copy, which focuses its window and then exits. That is why the sweep can assume it is the only writer.
- **Taxonomy validation on open uses `taxonomy.validate()`, never `validate_seed()`** (Plan 3 cross-plan impact item 7). An edited taxonomy fails `validate_seed` by design, and `validate_seed` is `#[cfg(test)]`-only after this task anyway. Test: `edited_taxonomy_opens`, where a library whose taxonomy has an added operation, a renamed label and a new domain opens with no integrity warning.
- **Order inside `open_library` and `create_library`.** This is the single, release-owned pipeline that Plans 2, 4 and 5 plug into (audit #12):
  1. Stop the previous library's indexer (Plan 5 `Indexer::stop`).
  2. Flush the previous library (Plan 2 Task 5). On failure, refuse the switch.
  3. Run `sweep_tmp` on the new root.
  4. Run `check`.
  5. Call `asset_protocol_scope().allow_directory(root, true)` (Plan 1 Task 7). Plan 4's lightbox cache directory is allowed once, in `setup`.
  6. Build the `LibraryView`, including Plan 4's `boards` and this task's `integrity`.
  7. Install the new `Open` state, clearing the history (Plan 2).
  8. Start the new library's indexer (Plan 5), if Find similar is on.

  Steps 3–4 run before anything can write to the new root, so the sweep can never delete a live `.tmp`. Two tests check this:
  - `open_pipeline_order`: a fake hook records the order of the steps.
  - A `.tmp` planted by a fake saver or indexer hook after step 7 survives.

- [ ] **Step 1: Write the failing tests**
  - `sweep_removes_only_tmp`: plant `images/.tmpAb12`, `images/x.jpg.tmp`, `thumbs/256/.tmpZ` and `library.json.tmp`. All four are removed. `images/<hash>.jpg`, `library.bak.json` and `taxonomy.bak.json` stay.
  - `check_validates_taxonomy_backup`:
    - A valid `taxonomy.bak.json` gives `taxonomy_backup_invalid == false`.
    - Writing `{` into it gives `true`, and the file is still there, byte-identical, after `check` and `sweep_tmp`.
    - With no backup present, it gives `false`.
  - `check_finds_orphan_and_missing`: with an extra hash-named file in `images/` and one reference's original deleted, `orphans` and `missing_originals` each hold one entry. `library.json` is unchanged.
  - `check_rebuilds_missing_thumb`: delete `thumbs/256/<hash>.jpg`. After `check` it exists again, and the reference id is in `rebuilt_thumbs`.
  - `recover_orphans_is_one_undo_step`: through commands, "Add them" adds 2 references, and one `undo` removes both while the files stay.
  - `verify_hashes_flags_corruption`: flip one byte of an original, and its id is returned. Setting `cancel` stops the run early without panicking.
  - `seed_helpers_are_test_only`: with `NAMES_41`, `OBSERVED` and `validate_seed` behind `#[cfg(test)]`, `cargo build --release` still compiles, which proves no shipped code uses them, and `cargo test taxonomy::` still runs `validate_seed`.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test integrity:: commands::`. It should FAIL, then PASS.

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
  - the inspector mount function that each Plan 3 graph view exports;
  - `mountSettings` and `wireSimilar` (Plan 5), the latter with a fake `ready` status and a fake `similarByRef` that returns the fixture reference (audit #14);
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
  - `app/src-tauri/src/lib.rs`: build the native menu;
  - `app/src/firstrun.ts` (Plan 1 Task 9): play the intro before step 1.

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
  - **File:** "Open library folder", which uses the opener's reveal permission.
  - On macOS, the standard app menu holds About.
- **Behaviour:**
  - The intro plays on first launch, before the first-run steps.
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
  - "Works offline. No account, no telemetry. Find similar downloads an image model only if you turn it on.";
  - the font licences;
  - a "Third-party notices" link, which opens the bundled `THIRD_PARTY_NOTICES.md` through `opener` (`openPath`);
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
  - First run: after the intro resolves, the first-run step 1 is shown, and `setSettings` was called with `{ introSeen: true }`. A second first-run with `introSeen` set never shows the intro.
  - About lists every font family that `checkFonts` finds, and one demo credit per manifest record.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- intro about`. It should FAIL, then PASS.

- [ ] **Step 3: The design pass (with the user).** Run the `impeccable` skill on the intro surface in its showcase register. Write the result into `intro.ts` and `styles.css`, keeping the Step 1 tests green. Record the approved concept as a short "Intro card" section in `DESIGN.md`.

- [ ] **Step 4: Commit.** Commit message: `feat(ui): skippable intro card, native menu and About with licences and credits`.

---

### Task 5: The app icon and bundle configuration for each platform

**Files:**
- Create:
  - `app/src-tauri/icons/source/app-icon.svg` and `app-icon-1024.png`, from the design pass;
  - `app/src/glyphs/glyphs.ts`, `app/src/glyphs/*.svg` and `app/src/glyphs/glyphs.test.ts`: the in-app glyph set (see below);
  - `app/notices/manual.md`: Plan 5's hand-written entries, which Plan 5 writes there directly: the SigLIP model (`google/siglip-base-patch16-224`, Apache-2.0) **with the Apache-2.0 NOTICE text**, ONNX Runtime (MIT) and `tokenizers` (Apache-2.0);
  - `app/THIRD_PARTY_NOTICES.md`, **generated**. This is the same file name and location as Plan 5's, so there is one notices file.
- Modify:
  - `app/src-tauri/tauri.conf.json`, the `bundle` section;
  - `app/scripts/release-check.mjs`, adding `checkBundle(conf)`.

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
- `bundle`:
  ```json
  {
    "active": true, "targets": ["nsis", "msi", "dmg", "app", "appimage", "deb"],
    "publisher": "Jake Manahan", "copyright": "© 2026 Jake Manahan", "category": "GraphicsAndDesign",
    "shortDescription": "A local reference workbench for artists",
    "resources": ["resources/taxonomy.json", "resources/demo/**/*", "../THIRD_PARTY_NOTICES.md"],
    "windows": { "webviewInstallMode": { "type": "embedBootstrapper" },
                 "nsis": { "installMode": "currentUser" }, "digestAlgorithm": "sha256" },
    "macOS": { "minimumSystemVersion": "11.0", "signingIdentity": "-" },
    "linux": { "deb": { "depends": ["libwebkit2gtk-4.1-0", "libgtk-3-0"] }, "appimage": { "bundleMediaFramework": false } }
  }
  ```
  - **Why NSIS with `currentUser`:** artists usually install without admin rights. MSI stays for managed studio machines.
  - **Why `embedBootstrapper`:** it installs WebView2 when it is missing, and costs about 1.8 MB (Review Focus 5).
  - The hardened runtime is enabled by default when Tauri signs with a Developer ID, so no key is set for it.
  - **Why `signingIdentity: "-"` (ad-hoc):** with no Developer ID, an ad-hoc signature lets the arm64 build launch on Apple Silicon. Without one, macOS reports the app as "damaged" instead of offering "Open Anyway". Task 7 replaces it with the Developer ID once it exists.
  - No contact field (an email or URL) is set anywhere, because none was given (Decision 3).
- `checkBundle` checks:
  - the targets list;
  - that every `resources` glob resolves;
  - that no resource path matches the third-party exclusions;
  - that the icon files exist;
  - that each installer is within the measured size budget (Global Constraints), read from `budgetBytes` in `app/release-check.json`, which this task writes from the measurements. The same file holds `textures` (Task 1).
- `app/THIRD_PARTY_NOTICES.md` is generated from three parts, in this order:
  1. `app/notices/manual.md`;
  2. `cargo about generate about.hbs` (with `app/src-tauri/about.toml` accepting MIT, Apache-2.0, BSD-2/3-Clause, ISC, Zlib, Unicode-3.0 and MPL-2.0);
  3. `npx --yes license-checker-rseidelsohn --production --plainVertical`.

  Both tools run at build time only. An unaccepted licence fails the build. **Tell the Plan 5 owner:** Plan 5 keeps the file name, and its hand-written section now lives in `notices/manual.md`.

- [ ] **Step 1: Write the failing test.** `checkBundle` should fail on each of these fixtures: a missing icon, a resource glob matching nothing, and a `resources` entry under `reference/`. It should pass the real config.

- [ ] **Step 2: Implement, generate the icons and notices, then run.** Run `npm test -- release-check && npm run tauri build`. Expected on Windows:
  - both `.exe` (NSIS) and `.msi` are produced;
  - each is within the measured budget, recorded in `app/release-check.json` (provisionally 60 MB or less);
  - the NSIS installer installs without an admin prompt.

- [ ] **Step 3: Commit.** Commit message: `chore(release): app icon, per-platform bundle config and third-party notices`.

---

### Task 6: The CI release workflow (three platforms, unsigned)

**Files:**
- Create: `.github/workflows/release.yml`.

**Interfaces:**
- Triggers: `workflow_dispatch`, and pushes of tags matching `v*`.
- The matrix:
  - `windows-latest`;
  - `macos-latest`, with `--target universal-apple-darwin` and both rust targets added;
  - `ubuntu-22.04`, with `sudo apt-get install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`, per the Tauri v2 Linux prerequisites.
- Each job runs these steps in order:
  1. Check out the code. Set up Node 24 and stable Rust, then restore the cargo and npm caches.
  2. Run `npm ci`, `cargo test`, `npm test` and `npm run build`.
  3. Run `npm run release-check`. On tag pushes, run `npm run release-check -- --final`, so a tag can't publish while a gate is open.
  4. Run `tauri-apps/tauri-action@v0` with:
     - `projectPath: app`;
     - `tagName: ${{ github.ref_name }}`;
     - `releaseName: "Horus ${{ github.ref_name }} (unsigned beta)"`;
     - `releaseBody: ${{ steps.notes.outputs.body }}`. An earlier step, `id: notes`, writes `docs/release/INSTALL-UNSIGNED.md` (Task 10) to `$GITHUB_OUTPUT` as a multi-line value (`body<<EOF` … `EOF`). `releaseBody` takes literal text, not a path;
     - `releaseDraft: true`;
     - `prerelease: true`.
  5. Compute `SHA256SUMS` over every artefact and upload it to the same draft release.
- **Hosting (Decision 4):** GitHub Releases, built by GitHub Actions on all three systems.
- **Unsigned (Decision 2):** no signing secrets are set, so the artefacts are unsigned. Each release is a draft **prerelease** labelled "unsigned beta" until Task 7 is done.

- [ ] **Step 1: Run it.** Run the workflow by hand with `workflow_dispatch` on a branch. Expected: all three jobs pass, and the artefacts include `.exe`, `.msi`, `.dmg`, `.app.tar.gz`, `.AppImage` and `.deb`.

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

**Interfaces:** each of the three CI artefacts from Task 6 or Task 7 is installed on a clean machine or VM for its platform: Windows 11, Windows 10 22H2, macOS 14 on arm64, macOS 12 on x86_64 if available, and Ubuntu 22.04 and 24.04.

- [ ] **Step 1: Run the matrix.** For each platform, record pass or fail and a note for each of these 14 checks:
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
  10. A second launch focuses the existing window (Task 2).
  11. After killing the process while an import runs, the next start shows "Recovered N images" or a clean report, and `library.json` opens (Task 2).
  12. Uninstalling leaves the user's library folder untouched.
  13. **Accessibility (WCAG 2.2 AA, PRODUCT.md; audit #17):**
      - a keyboard-only pass through first run, tagging an Inbox item, the Tree, Compare and Settings;
      - the axe-core DevTools scan on each view, with no serious or critical issues;
      - focus is always visible.
- [ ] **Step 2: Fix and record.** Fix every failure in the owning plan's code, re-run that row, and record it. A platform passes only when all 14 rows pass.
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
- **G8. Licence of the Find similar model export** (Plan 5, Decision 1). The owner is the USER, or counsel.
  - **The issue:** the weights `google/siglip-base-patch16-224` are Apache-2.0, but the ONNX export that Plan 5 downloads, `Xenova/siglip-base-patch16-224` at commit `4649052661e53c7000355844105f8a1792088239`, carries no licence tag.
  - **Pass criteria:** one of the two routes below, recorded with its evidence.
    - **(a) Confirmed:** written confirmation (from the repo owner, or a licence file added at a pinned commit) that the export is redistributable under Apache-2.0. If the commit changes, Plan 5's `SIGLIP_B16_Q8` revision and its SHA-256 values are updated, and Plan 5's download tests pass.
    - **(b) Self-converted:** the model is converted from `google/siglip-base-patch16-224` with Hugging Face Optimum (int8, the same inputs and outputs as Plan 5's encoder expects) and hosted on a Horus-owned location. Plan 5's model table then gets the new files, sizes, SHA-256 values and host. Plan 5's parity test `quantized_close_to_reference` passes against the new files, and the About privacy line names the new host (G7).
  - **On either route:** `app/notices/manual.md` contains the Apache-2.0 NOTICE for SigLIP, and so does the generated `THIRD_PARTY_NOTICES.md` (G5).
  - **The automated part, in `release-check`:**
    - `checkGates` treats G8 like every other gate;
    - `checkNotices(noticesMd)` fails unless the notices name `google/siglip-base-patch16-224`, `Apache License, Version 2.0` and a `NOTICE` section. Add this function to Task 1's interface list, with one failing and one passing fixture.
- **G7. The privacy statement is accurate.** About's text matches behaviour: `checkNoRemoteUrls` passes, and QA row 9 passes. The Plan 5 model host is named in About. Owned by the release engineer.

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
