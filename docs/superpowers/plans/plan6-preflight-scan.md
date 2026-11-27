# Plan 6 (Release): preflight conflict scan

Scanner -bb, 2026-11-27, for controller -02.
- **Worktree:** `.worktrees/plan6-release`, branch `plan6-release` at `8646b91` (main with Plan 4).
- **Read-only:** no code edits, no commits, no builds. Two small read-only byte parsers were run on binaries already on disk (see "Method").

**Sources:**
- the plan, `docs/superpowers/plans/2026-11-25-horus-release.md`;
- `SPEC.md` (§5, §7–§11), `DESIGN.md`, `CROSS-PLAN-AUDIT.md` (owned rows 3, 4, 5, 12, 13, 14, 17, 21, 22, 24, 27);
- the code on main `8646b91`;
- what Plan 5 changes: `plan5-similar` head `c991092` (T1–T4 merged, plan amended), `p5-t5` `3a2400e` (T5, in review) and `p5-t6` `a0363af` (T6, accepted). Plan 5's own finding IDs are written `P5-B2`, `P5-R13` and so on, so they don't collide with this scan's;
- Plan 5's `preflight-rulings.md` and `t0-spike.md`, and `app/README.md` on `plan5-similar`;
- the Plan 1–4 ledgers in `docs/superpowers/ledgers/`, for every item deferred to Plan 6, plus the controller's deferral list.

**Method:** the same as -59's Plan 5 scan.
- One row per pair of tasks that share a file or an interface, including the code Plans 1–5 leave on main.
- One self-consistency row per task.
- **CONFIRMED** means checked against code, a binary, or plan text. **PLAUSIBLE** means inferred; the first build or spike that hits it must check it.
- Binaries read, not run:
  - the ORT 1.31.1 osx-arm64 `libonnxruntime.dylib` and linux-x64 `libonnxruntime.so` that -4a's Task 0 spike extracted (Mach-O `LC_BUILD_VERSION`; ELF `GLIBC_*` version strings);
  - the **debug** `horus.exe` in the shared `p5-t1` target dir (PE import table). A release build was not read.

## Counts

| Class | Count |
|---|---|
| BLOCK | 4 |
| REWORK | 13 |
| COS | 9 |
| **Total** | **26** |

Plus 24 deferred items folded in (table "Deferred to Plan 6"), 18 of them with no task yet (R11), and one open user call (R27).

**BLOCK one-liners:**
- **B1:** the pinned ORT 1.31.1 macOS arm64 dylib is built for **macOS 14.0** (`minos 14.0.0`). Plan 6 promises macOS 11+ (`minimumSystemVersion "11.0"`, QA on macOS 12), so the floor and Find similar disagree.
- **B2:** Plan 5 ships the ORT dylib as a bundle **resource** (`Contents/Resources/ort/`). Mach-O code outside `Contents/Frameworks` or `Contents/MacOS` can break the ad-hoc `codesign` of the `.app`, or get it reported as damaged. Not checked on a Mac.
- **B3:** Task 2's `open_library` / `create_library` pipeline contradicts Plan 5's landed B4 hooks and their tests:
  - Plan 6 stops the indexer before the flush;
  - Plan 5 stops it only after the new library's open or create succeeds, and restarts it on `Err`;
  - Plan 6's integrity `check` (which decodes originals to rebuild thumbnails) would run under the state lock in `open_library`.
- **B4:** the VC++ runtime "ships with the installer" can't be done as planned. `onnxruntime.dll` needs `MSVCP140`, `MSVCP140_1` and `VCRUNTIME140_1`, and the NSIS installer is `currentUser` (no admin), but `vc_redist` needs admin. `horus.exe` itself links the VC runtime statically, so only Find similar is affected.

## Findings

### BLOCK

| ID | Finding | Evidence | Conf. | Suggested ruling |
|---|---|---|---|---|
| B1 | **The macOS floor vs the ORT dylib.**<br>• `libonnxruntime.dylib` (osx-arm64, ORT 1.31.1 NuGet) has `LC_BUILD_VERSION` platform macOS, **minos 14.0.0**, sdk 26.2.<br>• Plan 6 sets `minimumSystemVersion "11.0"` (T5), promises "macOS 11+" (Global Constraints) and QA-tests macOS 12 (T8).<br>• Under `load-dynamic`, what `dlopen` does on macOS 11–13 is **not checked**: it may refuse (a caught `Err`, so Find similar shows "couldn't start"), or it may load and fail at symbol binding (an abort, which is uncatchable, the same class as Plan 5's AVX2 ruling P5-R1). | dylib header (read here); Plan 6 L62, T5 `bundle.macOS`, T8 matrix; Plan 5 `preflight-rulings.md` P5-B2 ("No ORT source build") | minos: CONFIRMED. Effect on 11–13: PLAUSIBLE | A user call. Either:<br>(a) **raise the macOS floor to 14.0** (`minimumSystemVersion "14.0"`, QA on macOS 14 and 15 arm64); or<br>(b) **keep 11.0** and add a Plan 5-style pre-load guard: on macOS below 14, phase `Error` with a copy line such as "Find similar needs macOS 14 or later.", and `find_similar` set to `"off"`. Plan 5 code would gain one guard and one copy row. |
| B2 | **The ORT dylib as a bundle resource on macOS.**<br>• Plan 5 adds `"ort/*": "ort/"` to `bundle.resources`, so the dylib lands in `Horus.app/Contents/Resources/ort/`.<br>• Apple's code-signing rules expect nested Mach-O code in `Contents/Frameworks` (or `MacOS`). Code in `Resources` can fail `codesign` ("code object is not signed at all", "in subcomponent") or leave a seal that Gatekeeper rejects. With `signingIdentity "-"` (ad-hoc), the result is **not checked**.<br>• The same applies to Task 7's later Developer ID signing and notarisation. | `plan5-similar` `tauri.conf.json` resources; Plan 6 T5 `macOS.signingIdentity "-"`, Decision 2 | PLAUSIBLE | **Spike on the `macos-latest` runner before T5:** build the `.app` with the dylib as a resource, then run `codesign --verify --deep --strict` and launch it from a quarantined download.<br>If it fails, move the dylib to `bundle.macOS.frameworks` (it then lands in `Contents/Frameworks`) and have Plan 5's `lib.rs` resolve it there on macOS. |
| B3 | **The open pipeline vs Plan 5's P5-B4 hooks (code and tests on `p5-t5`, in review).**<br>• Plan 6 T2 orders: 1 stop the indexer, 2 flush, 3 `sweep_tmp`, 4 `check`, 5 scope, 6 view, 7 install, 8 start.<br>• Plan 5's actual order (controller option (a), with tests):<br>  – `create_library`: flush, then `Library::create`, then the demo seed, then stop (no lock held), then install, then remember, then start.<br>  – `open_library`: under the state guard, flush, then `Library::open`, then take the indexer and bump the generation, then install; the join happens after the guard drops; then remember, then start.<br>  – One start-hook rule covers both `Ok` and `Err`: an indexer starts for whichever library is open.<br>• Plan 6's step 1 before step 2 would stop the indexer on a switch that is then refused. That breaks `failed_open_keeps_old_indexer` and `start_hook_restarts_after_switch`.<br>• `open_library` holds the state lock from the flush to the install (`commands.rs:539-557`, on purpose). Steps 3–4 inside it would run `check`, which rebuilds missing thumbnails **by decoding originals**, under the state lock, which blocks every edit for as long as that takes. | `commands.rs:498-557` (main); `p5-t5` `3a2400e`: `similar::start_hook` at `commands.rs:522, 580`, tests `failed_open_keeps_old_indexer` and `start_hook_restarts_after_switch` in `commands/similar.rs:1266, 1281`; Plan 5 P5-B4 ruling; Plan 6 T2 "Order inside `open_library`" | CONFIRMED (on `p5-t5`, in review; ruled either way) | **Plan 6 T2 adopts Plan 5's order and adds to it:**<br>• `sweep_tmp` and the existence part of `check` run after `Library::open` or `create` and before `install`.<br>• The thumbnail rebuild (the decode) runs after `remember()`, with no lock held, as a background step like the indexer start.<br>• `open_pipeline_order` asserts that order.<br>• Plan 5's hook tests stay green. |
| B4 | **The VC++ runtime for ORT.**<br>• `onnxruntime.dll` 1.31.1 imports `MSVCP140`, `MSVCP140_1`, `VCRUNTIME140` and `VCRUNTIME140_1` (t0-spike §4).<br>• `horus.exe` does **not**: its import table has `api-ms-win-crt-*` (UCRT, part of Windows 10) and no `VCRUNTIME140*`, so Tauri links the VC runtime statically. The app starts on a machine without the redist; only Find similar fails ("couldn't start", caught).<br>• The deferral says "the VC++ runtime ships with the installer". Plan 6 has no step for it, and the NSIS installer is `installMode: currentUser` with no admin prompt (T5, Step 2 expects "installs without an admin prompt"). `vc_redist.x64.exe` needs elevation, so an NSIS hook can't run it.<br>• App-local copies of the four DLLs beside `onnxruntime.dll` in `ort/` only help if ORT's dependencies are searched in that folder. That depends on how `ort::init_from` calls `LoadLibraryExW` (its flags), which is **not checked**. | t0-spike.md §4 and §6d; debug `horus.exe` PE imports (read here); Plan 6 T5 `nsis.installMode`; Plan 5 rulings ("Shipping the runtime ... deferred to Plan 6") | horus.exe (debug): CONFIRMED. That `vc_redist` needs admin, the app-local licence terms, and the DLL search: from recall, **not checked** | **App-local deployment** (if Microsoft's redist terms allow these files app-locally, which the implementer confirms):<br>• `fetch-ort.mjs` or the CI job copies `msvcp140.dll`, `msvcp140_1.dll`, `vcruntime140.dll` and `vcruntime140_1.dll` (pinned version and SHA-256) into `ort/`.<br>• Plan 5's loader adds the `ort/` folder to the DLL search path before `init_from` (`AddDllDirectory` / `SetDllDirectoryW`), unless a check shows `init_from` already loads with `LOAD_WITH_ALTERED_SEARCH_PATH`.<br>• QA row: enable Find similar on a clean Windows VM with no redist.<br>• The licence for the redist files goes into `notices/manual.md`.<br>• Alternatively, the MSI (admin) path alone could chain `vc_redist`. |

### REWORK

| ID | Finding | Evidence | Conf. | Suggested ruling |
|---|---|---|---|---|
| R1 | **The CSP's texture route is already decided.**<br>• Plan 3 loads Galaxy and Tree textures from an `HTMLImageElement` (`img.crossOrigin = "anonymous"`, then `PIXI.Texture.from(img)`), so `img-src` governs them, not `connect-src`. That is audit #3's alternative, not its default.<br>• The force layout's worker is a same-origin module chunk (`new Worker(new URL(...), { type: "module" })`), so it needs `worker-src 'self'`; `blob:` is not needed.<br>• T1's exact CSP still lists `connect-src ... asset: http://asset.localhost` and `worker-src 'self' blob:`. | `graph/scene.ts:176-189`; `views/galaxy.ts:16-18`; Plan 6 T1 CSP block, audit #3 | CONFIRMED | Use the tighter CSP: `connect-src ipc: http://ipc.localhost`, `worker-src 'self'`. Write `app/release-check.json` `{ "textures": "img-element" }` in T1. Also add `form-action 'none'` (see C5). T1 Step 4 still checks for thumbnails, not dots. |
| R2 | **`bundle.resources` is a map, not the array T5 shows.**<br>• Main maps `taxonomy.json`, `demo/manifest.json`, `demo/images/*` and `../src/fonts/OFL-*.txt` to `licenses/`.<br>• Plan 5 adds `"ort/*": "ort/"`.<br>• T5's array (`resources/demo/**/*`, `../THIRD_PARTY_NOTICES.md`) would drop the ORT library and the OFL texts.<br>• A `..` source in array form lands as `_up_/THIRD_PARTY_NOTICES.md`, which then doesn't match T1's scoped `$RESOURCE/THIRD_PARTY_NOTICES.md`. | `tauri.conf.json` (main and `plan5-similar`); Plan 6 T5 `bundle` block, T1 ALLOWED_PERMISSIONS | CONFIRMED (the config). `_up_`: PLAUSIBLE (per the Tauri docs, not run) | T5 edits the existing map. It adds `"../THIRD_PARTY_NOTICES.md": "THIRD_PARTY_NOTICES.md"` and keeps the four existing entries and Plan 5's `ort/*`. `checkBundle` reads the map form, and the `open-path` scope names the mapped target. |
| R3 | **The font layout `checkFonts` assumes doesn't exist.**<br>• `app/src/fonts/` is flat: seven hash-named `.ttf` files, `fonts.css`, `LICENSES.txt`, `OFL-RedHatMono.txt` and `OFL-SourceSerif4.txt`. Each OFL file contains "SIL OPEN FONT LICENSE Version 1.1" and its copyright line.<br>• T1 wants "every family has `OFL.txt`" and Step 3 "add the OFL texts". Plan 1 already did that, and bundles them to `licenses/`. | `ls app/src/fonts`; `grep -c` on both OFL files; `tauri.conf.json` resources | CONFIRMED | `checkFonts` reads the families from `fonts.css` (`@font-face` `font-family`), then requires `OFL-<Family>.txt` with the licence line and a `Copyright` line. Step 3 verifies the texts and doesn't add them. Its fixtures follow the real layout. |
| R4 | **The asset scope must not widen to the library root.** T2 step 5 calls `allow_directory(root, true)`. Main allows only `images/` and `thumbs/` (`install`: "the window never needs `library.json`, `taxonomy.json` or anything else in or beside the root"). Widening it would expose `library.json`, `embeddings.bin` and the backups to the webview. | `commands.rs` `install` (asset scope loop); Plan 6 T2 pipeline step 5 | CONFIRMED | Step 5 keeps the per-folder scope. T1's security notes say so. |
| R5 | **The notices: the file exists, and the NOTICE check can't pass as written.**<br>• Plan 5 T1 already created `app/notices/manual.md`, with SigLIP (the full Apache-2.0 text), ORT 1.31.1 (`LICENSE` and `ThirdPartyNotices.txt`) and `tokenizers`. T5's Files say "Create".<br>• `checkNotices` and G8 require "a `NOTICE` section". `manual.md:13` records "NOTICE: none": re-checked 2026-11-27, big_vision has no NOTICE (GitHub API 404), and neither Hugging Face repo has one. Apache-2.0 §4(d) only applies when the work ships a NOTICE. | `plan5-similar:app/notices/manual.md`; Plan 6 T5 Files, T1 `checkNotices`, G8 | CONFIRMED | T5 "modifies" `manual.md` (it adds nothing unless a gate needs to). `checkNotices` passes when the notices name `google/siglip-base-patch16-224` and `Apache License, Version 2.0`, and **either** hold an upstream NOTICE text **or** a dated `NOTICE: none` line with its evidence. G8's wording follows. |
| R6 | **G8 route (b) names a test Plan 5 dropped.** "Plan 5's parity test `quantized_close_to_reference` passes against the new files." P5-R18 (user confirmed) removed the fp32 parity fixture. | Plan 6 G8 (b); Plan 5 P5-R18, plan Decision 5 | CONFIRMED | Route (b) instead: `real_model_semantics` passes on the new files, Task 8 Step 3b re-calibrates the cut-offs, and `SIGLIP_B16_Q8` gets the new files, sizes, SHA-256 values and `base` host. |
| R7 | **macOS is arm64 only** (Plan 5 P5-B2, user ruling: "Do the silicon version only"). Still universal in Plan 6:<br>• Global Constraints L62 ("universal: arm64 and x86_64");<br>• T6 matrix (`--target universal-apple-darwin` "and both rust targets added");<br>• T8 QA ("macOS 12 on x86_64 if available");<br>• T10 installer names. | Plan 6 L62, T6, T8, T10; Plan 5 rulings P5-B2 | CONFIRMED | `aarch64-apple-darwin` only: `macos-latest` (an arm64 runner) with `--target aarch64-apple-darwin`; drop the x86_64 QA row; name the artefacts accordingly. The floor follows B1. |
| R8 | **CI must fetch ORT, and the bundle check must notice when it didn't.**<br>• Plan 5's `ort/` is gitignored except `.gitkeep`, which exists so `generate_context!`'s glob check passes on a fresh clone.<br>• So a build with no `npm run fetch:ort` succeeds and silently ships no ORT, and Find similar then fails on every install.<br>• T6's steps have no fetch, and `checkBundle` only checks that globs resolve. | Plan 5 T2 Files (`.gitkeep`, `fetch-ort.mjs`); `plan5-similar` `package.json` `fetch:ort`; Plan 6 T5 `checkBundle`, T6 steps | CONFIRMED (the gap) | T6 step 2 runs `npm run fetch:ort` after `npm ci`, and caches the nupkg by its SHA-256. `checkBundle` asserts this OS's ORT file (`onnxruntime.dll`, `libonnxruntime.dylib` or `libonnxruntime.so`) is in `ort/` with its pinned size, and on Windows the four VC DLLs too (B4). The pins come from `fetch-ort.mjs`, so there is one source. |
| R9 | **The size budget has its measurements now, and 60 MB may not fit macOS.**<br>• Global Constraints says the ORT size comes from "Plan 5 Task 2 Step 3". It is Task 0, recorded in `app/README.md`: the Windows DLL is 17,253,728 B, the macOS dylib 44,830,288 B, the Linux `.so` 29,345,384 B, uncompressed.<br>• Plan 1 T10 measured both Windows installers under 20 MB with the demo (16 MB of demo files).<br>• One 60 MB provisional ceiling for every platform is not checked against a DMG that carries a 44.8 MB dylib. | `plan5-similar:app/README.md` L18-21; ledger `2026-11-24-task-10-report.md:45`; `du` of `resources/demo` | Sizes: CONFIRMED. Installer sizes with ORT: **not measured** | `budgetBytes` per platform (or per artefact) in `app/release-check.json`, each set from a measured T5/T6 build plus 10%. The Global Constraints line names Task 0 as the source. |
| R10 | **The `open-path` grant collides with an existing test.**<br>• `lib.rs` `capability_grants_opener_reveal_only` (on `plan5-similar`) forbids any opener permission except reveal.<br>• T1's `ALLOWED_PERMISSIONS` and T4's About (the "Third-party notices" link, plus Plan 5 P5-R13's deferred "About the model" link) add a scoped `opener:allow-open-path`.<br>• T4's Files don't list `lib.rs` tests, or the capability file's scope syntax. | `plan5-similar:app/src-tauri/src/lib.rs:167`; Plan 6 T1, T4; Plan 5 P5-R13 | CONFIRMED | T4 Files: `capabilities/default.json` gets the scoped grant (the mapped target from R2), and `lib.rs` renames and adjusts the test, so it allows exactly reveal plus that one path. T4 also adds the "About the model" link from Plan 5 P5-R13 to the About dialog. |
| R11 | **Most deferred items have no owning task.** 24 items were deferred to Plan 6 by Plans 1–5 (table below). Six are homed: D14 in T2, and D20–D24 through this scan's B and R rows. The other **18** have no task step. D13, D15 and D16 are listed under "Carried from Plan 2", but no task does them, and T8 Step 2 only fixes QA failures. | ledgers (Plan 1–4), the controller's list, Plan 6 "Carried from Plan 2" | CONFIRMED | A new **Task 3b "Deferred fixes"**, between T3 and T4: one checkbox per item in the table, each with its test or check, grouped by file so they can be done in one or two commits. The UI copy items go through one copy pass (with R5's notice copy). |
| R12 | **The intro must live in `boot()`, not `firstRun()`.**<br>• T4: "`firstrun.ts`: play the intro before step 1". `firstRun()` runs only when there is no `lastLibrary`.<br>• The intro is keyed on `introSeen` (SPEC: "plays once on first launch"), and every 0.x user who already has a library has `introSeen` absent, so `false`.<br>• Plan 5 T6 changed `firstrun.ts`: `FIND_SIMILAR_COPY` moved to `settings/find-similar.ts` (re-exported), `enableInBackground` runs after Begin, and `mountSettings` is wired in `boot()`. | `firstrun.ts` (`p5-t6` `a0363af`); Plan 6 T4 Files and Behaviour; SPEC §5 L161 | CONFIRMED | `boot()` awaits `playIntro` when `shouldPlayIntro(settings)`, before the `lastLibrary` branch and before `firstRun()`, so it plays once for everyone. T4's first-run test becomes a `boot()` test. T4 also states that the intro sits above Settings (z 45) and first run (z 50). |
| R13 | **Both source scans fail the real tree as specified.** T1 scans `app/src/**/*.{ts,js,css,html}` + `index.html`, which includes the tests.<br>• `checkNoRemoteUrls`: our comment `graph/scene.ts:181` (`// http://asset.localhost is another origin…`), plus test fixtures with `https://ex.org/…` in `api.contract.test.ts` (2) and `intake.test.ts` (12).<br>• `checkNoInlineStyle`: `grid/windowed.test.ts` (1) and `views/inspector.test.ts` (1), beyond the 8 shipped occurrences.<br>The same holds on `p5-t6`. | `git grep` over `app/src` + `index.html`, main and `p5-t6` | CONFIRMED | Exclude `*.test.ts` from both scans (tests never ship), and allow the Tauri local origins (`http://asset.localhost`, `http://ipc.localhost`) as the plan allows SVG `xmlns`, or reword the comment. Add a passing fixture for each. |

### COS

| ID | Finding | Evidence | Suggested ruling |
|---|---|---|---|
| C1 | T3's mount list doesn't match the code:<br>• Plan 3's inspector is `renderInspector(el, snapshot, sel, opts)` in `views/inspector.ts`, not a mount that "each graph view exports";<br>• `wireSimilar` is Plan 5 T7 (not landed yet);<br>• `mountSettings` exists (`p5-t6`). | `views/inspector.ts:108`; `p5-t6` `settings/panel.ts` | Name `renderInspector` and the Plan 5 entry points as they land. T3 runs after Plan 5 merges. |
| C2 | Orphan recovery: an orphan is a hash-named file with no source name, so `Reference.title` has no value to use. T2 doesn't say what title "Add them" gives. | `edit::Edit::AddReferences` (`edit.rs:43`); import sets the title from the source file name | One plan copy line, for example "Recovered image" plus its short id, editable later. |
| C3 | T4's native File menu "Open library folder" duplicates neither of the existing in-app entry points exactly. Plan 2's `#library-menu` has Open and New; Plan 4's "Open folder" reveals an export. "Verify image files…" needs a progress and cancel surface that T4 doesn't describe. | `index.html` `#library-menu`; `library-menu.ts`; Plan 6 T4 menu | Say the native item reveals the open library's folder (reveal permission). Name the Verify surface: reuse the import notice, or a small dialog with Cancel. |
| C4 | The gates are listed G1–G6, G8, G7. | Plan 6 T9 | Reorder to G1–G8. |
| C5 | The Plan 1 ledger carry: the CSP test checks only `default`, `script` and `eval`. It should assert the exact tokens. `form-action` is still unset in T1's CSP. | ledger `2026-11-24-horus-foundation-ledger.md:143` | `checkCsp` compares the exact string. Add `form-action 'none'`. |
| C6 | `withGlobalTauri` is absent from `tauri.conf.json`, and Tauri's default is `false`. T1's `checkGlobals` says `=== false`, so the absent case would fail. | `tauri.conf.json` (main) | Either set it explicitly to `false` in Step 3, or treat absent as `false`. Pick one and test it. |
| C7 | The model folder outlives an uninstall. Plan 5 stores 213 MB in `app_local_data_dir()/models/` (`%LOCALAPPDATA%\art.horus.app`). QA row 12 checks only the library. | Plan 5 P5-R17; Plan 6 T8 row 12 | Add to row 12 what the uninstaller does with app data (NSIS offers a "delete app data" checkbox), and say it in `INSTALL-UNSIGNED.md`. |
| C8 | Old Plan 1 carries that the ledger routes "before Plan 6": thin `validate()` negative tests; missing vs `null` optional keys; `BranchTechnique` `source`/`rationale` need a serde default for in-app links. Plan 3 shipped taxonomy editing since, so some may be done. | ledger `2026-11-24-horus-foundation-ledger.md:84-86, 90` | Check each against main in Task 3b. Close what is done, keep the rest as items. |
| C9 | T2's Interfaces list `import::import_paths` and `ImportOutcome` as consumed, but the plan never uses them: recovery goes through `Edit::AddReferences`. | `import.rs:44, 53`; Plan 6 T2 | Drop them from Consumes. |

## Deferred to Plan 6 (folded in; R11 gives them a task)

| # | Item | Source | Suggested home |
|---|---|---|---|
| D1 | Lightbox: Esc in the technique picker closes the whole lightbox, which loses an unsaved drawn region and the zoom. Fix: `stopPropagation` in the picker's Esc branch. | Plan 4 QA F1 | 3b (focus/Esc) |
| D2 | Boards: `.bd-tools` clipped on a first-column tile (`styles.css:533`). | Plan 4 QA F2 | 3b (CSS) |
| D3 | Boards: the status text goes stale after undo of a scoped board delete. | Plan 4 QA J1 | 3b (notice pass) |
| D4 | Verify that the full "Op > Technique" hover label is live (a check, not a known defect). | Plan 4 QA J3 | T8 a11y row |
| D5 | The QA harness should relaunch on a first-run pick miss. | Plan 4 QA H1 | T8 harness note |
| D6 | `UnknownTag` error remap (raw-ish edit errors). | Plan 4 ledger L21 | 3b (copy pass) |
| D7 | Lightbox Lanczos3 f32 peak about 780 MB at 20000×6000 (thumbnail resample unmeasured). | Plan 4 ledger L45, L114 | T8 perf row: measure, then decide |
| D8 | Ctrl+Z with an empty search in the move-tags dialog runs WebView2's native undo, refills `#q`, and moves focus out of the `aria-modal` dialog (Esc then dead). | Plan 3 QA F1 | 3b (focus trap: make the shell `inert` like first run and Settings) |
| D9 | `#import-notice` covers the inspector's "Delete technique…" at 1280×800, and still says "Added 1 to the Inbox" after undo. | Plan 3 QA F2 (+ Plan 2 N2) | 3b (notice pass) |
| D10 | Galaxy at 2,500: 1,255 shallow overlapping pairs after settle (demo: 0). | Plan 3 QA J4 | T8 perf row (judgment) |
| D11 | Label cosmetics: names at about 8 px, faint 0.25 px outlines at fit, crumb ellipsis, Tree down-connector (J5–J8); Radial fit hides all names (J2); label floor; `clipLabel` space before "…". | Plan 3 QA J2, J5–J8; ledger L167, L174 | 3b (one graph-labels item) |
| D12 | Inline field freezes when `run()` returns false (busy never reset); every `InUse` refusal gets the O3 sentence; the last-link test can pass vacuously. | Plan 3 T10 M1–M3 | 3b |
| D13 | Save-failure message shows raw OS text ("Access is denied. (os error 5)"); add a plain hint. | Plan 2 QA N1 (Plan 6 "Carried") | 3b (copy pass) |
| D14 | "Recovered N images to the Inbox" (orphan recovery). | Plan 1 QA M4 | T2 (already there) |
| D15 | Import progress "N of M" and Cancel. | Plan 1 QA M3, user decision | 3b (already "Carried from Plan 2") |
| D16 | macOS Cmd+Q may bypass the save-failure dialog (`ExitRequested`). | Plan 2 final review M2 | T8 macOS row |
| D17 | Light Group Green `-on` measures 4.37:1 (under AA 4.5). A seed-ink change, so a design decision. | Plan 3 ruling B7, DESIGN.md | T4's impeccable design pass (user call) |
| D18 | Exports are `0600` on macOS and Linux (NamedTempFile); set `0o644` under `cfg(unix)`. | Plan 4 ledger L29 | 3b |
| D19 | A hand-edited board naming an absent id fails reorder and remove with generic copy; grid refocus by index without `preventScroll`. | Plan 4 fix wave L123 | 3b |
| D20 | Plan 5: the macOS target becomes `aarch64-apple-darwin` only. | Plan 5 P5-B2 (user) | R7 |
| D21 | Plan 5: CI runs `npm run fetch:ort`; the ORT size goes into the installer budget. | Plan 5 T2 ruling | R8, R9 |
| D22 | Plan 5: the VC++ runtime ships with the installer. | Plan 5 Task 0 ruling | B4 |
| D23 | Plan 5: the "About the model" link and the scoped `open-path` grant for `THIRD_PARTY_NOTICES`. | Plan 5 P5-R13 | R10 |
| D24 | Plan 5: Plan 6 T2 folds in Plan 5's `install()` hooks; `checkNoInlineStyle` covers the two existing `search.ts` rows. | Plan 5 P5-B4, P5-C6 | B3; T1 Step 3 (already lists `search.ts`) |

**Open user call, listed and not ruled:** **R27, metadata editing in v1** (title, creator, year and credit). Plan 4 ruled it out of v1 because SPEC doesn't require it (audit #23), and flagged it to the user as a scope call. If the user wants it, it is a "Details" inspector task, and Plan 6 T3's XSS fixture already covers the fields.

## Pair rows (tasks sharing a file or an interface)

| Pair | Produces → consumes | Found |
|---|---|---|
| T1 ↔ Plan 1–4 code | `checkNoInlineStyle` → the inline `style=` templates | 8 occurrences in 4 files, the ones T1 names (`leaders.ts` 1, `tile.ts` 2, `view.ts` 3, `search.ts` 2), the same on `plan5-similar`, `p5-t5` and `p5-t6`. Plan 5's new UI adds none (P5-C6). Test files add 2 more (R13). |
| T1 ↔ Plan 3 code | the CSP → Pixi textures and the force worker | R1: the img-element route and a same-origin worker are already in place. |
| T1 ↔ T4 | `ALLOWED_PERMISSIONS` `open-path` → About | R10 (the existing lib.rs test) and R2 (the resource target path). |
| T1 ↔ T5 | `release-check.mjs`, `release-check.json` → `checkBundle`, `budgetBytes`, `textures` | R1 (`textures`), R8, R9. |
| T1 ↔ T9/T10 | `checkGates`, `checkNotices` → G1–G8, `--final` | R5 (the NOTICE criterion), C4. |
| T2 ↔ Plan 2/4/5 code | the open pipeline ↔ the flush, `boards`, the indexer hooks | **B3**. Plan 4's lightbox cache scope is set once in `setup` (`lib.rs:44`), which matches. R4 (scope). |
| T2 ↔ Plan 1/2 code | `sweep_tmp` ↔ the tmp names written | Consistent: imports write `.tmp*.tmp` in `images/` (`import.rs:186-188`); `write_atomic` writes `<name>.tmp` (library, taxonomy and Plan 5's `embeddings.bin.tmp`). The sweep runs before any writer of the new root starts (B3 order). |
| T2 ↔ Plan 4 code | `check` ↔ `decode_srgb`, `write_thumbs`, `on_white` | All three are public on main (`import.rs:314, 326, 379`). Audit #5 is resolved. |
| T2 ↔ Plan 1 taxonomy | `cfg(test)` gate ↔ `NAMES_41`, `OBSERVED`, `validate_seed` | Consistent: they are used only inside `taxonomy.rs` (`validate_seed` and its tests). |
| T3 ↔ Plan 2–5 UI | the XSS + a11y suite → the mounts | C1. Plan 5's Settings panel has accessible names on every control (T6 design review). |
| T4 ↔ Plan 5 T6 | `firstrun.ts`, `boot()` | R12. |
| T2, T4 ↔ Plan 5 T5 | `lib.rs` builder and `setup` | `p5-t5` adds a background model load to `setup` (P5-B4 start-up) after the dialog and opener plugins (`lib.rs:42-45`). Plan 6 T2 registers `tauri_plugin_single_instance` **first**, and T4 builds the native menu in the same builder. No conflict, but three plans now edit that builder: T2 and T4 should state their insertion points relative to Plan 5's `setup` code. |
| T4 ↔ `settings.rs` / `api.ts` | `intro_seen` in `Settings` + `SettingsPatch` + `merge()`; `setSettings(Partial<Settings>)` | `SettingsPatch` and `merge()` exist (`settings.rs:38-46`), and `setSettings` already takes `Partial<Settings>`. Audit #13 is resolved; T4 only adds the field. |
| T5 ↔ Plan 5 T1/T2 | `notices/manual.md`, `THIRD_PARTY_NOTICES.md`, `ort/*` | R2, R5, B2, B4. |
| T5 ↔ Plan 3 | `checkGlyphs` ↔ the taxonomy icons and `DOMAIN_ICONS` | Bundled taxonomy: 48 techniques, 6 domains and 4 operations, each with a non-empty, unique `icon`. `DOMAIN_ICONS` has 8 entries in `views/inspector.ts:34`, including "a plain square" and "a dot inside a ring". The plan says it "mirrors `commands.rs`". Consistent. |
| T6 ↔ Plan 5 | CI → `fetch:ort`, `ort_pins_match_plan` | R8. `cargo test` in CI needs no ORT: the model tests are `#[ignore]`, and CI never runs `--include-ignored` (Plan 5 rule). |
| T6 ↔ T1 | `release-check --final` on tags | Consistent. |
| T8 ↔ B1/B2/B4 | the QA matrix ↔ the platform floors | It needs rows for Find similar on macOS at the floor and on a Windows VM with no VC++ redist. Drop macOS x86_64 (R7). |
| T9 ↔ Plan 5 | G8 ↔ `SIGLIP_B16_Q8`, the parity test | R6. |

## Self-consistency rows (one per task)

| Task | Own text agrees with itself? |
|---|---|
| T1 | Mostly. R1 (the CSP), R3 (fonts), R13 (URL scan), C5, C6. Its Step 3 conversion list is right. |
| T2 | **No: B3** (the order, and the decode under the lock). Also R4 and C9. |
| T3 | Yes, apart from C1 (names). |
| T4 | **No: R12** (where the intro hooks in). Also R10 and C3. |
| T5 | **No: R2** (the resources form). Also R5, R9, B1 and B2. |
| T6 | **No: R7** (universal) and R8 (no ORT fetch). |
| T7 | Yes, deferred. B2 also affects its notarisation. |
| T8 | Partly: R7 and the new rows from B1 and B4. |
| T9 | Partly: R5, R6, C4. |
| T10 | Yes. The artefact names follow R7. |

## Checked and consistent

1. **`horus.exe` needs no VC++ redist.** The debug build's PE imports are Windows system DLLs plus `api-ms-win-crt-*` (UCRT, part of Windows 10), with no `VCRUNTIME140*`. Tauri links the VC runtime statically. Review Focus 5 is unaffected; B4 is Find similar only.
2. **Linux floor.** `libonnxruntime.so` 1.31.1 needs at most `GLIBC_2.28` and `GLIBCXX_3.4.22`. Ubuntu 22.04 (glibc 2.35) is fine.
3. **Audit #5 (shared import helpers)** and **#13 (the settings patch)** are resolved on main (see the pair rows).
4. **No foreign marks** ("Iris", "Taxonomy of Visuals", "Modern Art Direction") in `app/src`, `index.html`, `src-tauri/src` or the bundled `taxonomy.json`.
5. **Inline styles in shipped code** are only the 8 that T1 names, on main and on every Plan 5 branch (2 more sit in test files, R13).
6. **Recovery as one undo step** is possible as written: `Edit::AddReferences { refs }` exists (`edit.rs:43, 454`).
7. **Plan 5's network rule holds under T1's CSP.** The model download is Rust-side (`ureq`). `similar://status` uses the IPC event channel, so no CSP change is needed for Plan 5.

**Not checked:**
- what `dlopen` does with a minos-14 dylib on macOS 11–13 (B1);
- an ad-hoc-signed `.app` with a dylib in `Resources` (B2);
- `ort::init_from`'s `LoadLibraryExW` flags (B4);
- installer sizes with ORT included (R9);
- whether Windows 10 1809 runs ORT 1.31.1 (the QA matrix tests 22H2 only);
- whether `vc_redist.x64.exe` needs admin, and Microsoft's terms for app-local VC++ DLLs (B4: from recall);
- a release `horus.exe` (only the debug build's imports were read).
