# Plan 6 QA: Task 8, the cross-platform QA pass (as Mara)

**Verdict: PASS WITH FIXES (Windows 11, this machine, release build).** There is no verdict for macOS, Linux, Windows 10 or a clean Windows VM. Those rows are NOT CHECKED here.

- **Build:** a release build (`npm run tauri build`, CARGO_BUILD_JOBS=1, shared target) of `plan6-release` at **aa57871**, merged into `p6-qa-report`. Every check ran on that `horus.exe`. This also closes Plan 5's gap "a release build was never QA'd".
- **Harness:** `mara-plan6.js`, which has the phases `main`, `offline` and `d4`. The Plan 4 and Plan 5 baselines were run too, patched only to skip the intro. Each run used a temp library, its own WebView2 folder and CDP port 9337. `%APPDATA%\art.horus.app` was removed after every run. The model stays installed (`.ok` verified after the offline phase restored it).
- **Results:**

  | Phase | Pass | Fail | Notes |
  |---|---|---|---|
  | Plan 6 main | 39 | 3 | 6 |
  | Plan 6 offline | 3 | 0 | |
  | Plan 6 d4 | 1 | 0 | |
  | Plan 5 main | 51 | 1 | 1 |
  | Plan 4 | 48 | 2 | 1 |

  Every baseline fail is harness drift; see below. CSP violations: 0. Console errors: 0.
- **Screenshot set for -0c:** `D:\Design Second Brain\qa-shots\plan6\`, 71 files.
  - 70 are named `<view>-<theme>-<width>.png`.
  - Themes and widths: light and dark at 1280 and 760, plus light at 1100.
  - Views: reference, reference-similar, search-dropdown, inbox, tree, galaxy, radial, boards, lightbox, compare, details, settings, about, and intro (replayed from Help).
  - One extra file: `firstrun-light-1280.png`, the first-run sheet.

## Given (recorded as decided by the controller, -02)

- **Row 5a:** the user tested the native Explorer drag at 100% scaling. The zone searches, and a drop elsewhere imports. **PASS.** Scaling at 125–150% is **NOT CHECKED**.
- The user approved the T4 design.
- There is no Mac, Linux or clean Windows machine here. Those rows are **NOT CHECKED** unless the CI run gives evidence. The run is 46059699838; the earlier run 46057233814 was cancelled. *(Slot: the CI results go here when -02 forwards them.)*

## Findings

### F1 (Minor, a11y, row 13): the technique picker's empty grid fails axe (critical)

**Where:** the Inbox, on the picker card. axe-core 4.10.2 (WCAG 2.0/2.1/2.2 A and AA) reports **critical `aria-required-children`** on `.pk-grid`.

**Cause:** `tagging/picker.ts:46` (with the empty state at :54 and :144–147) renders `<div class="pk-grid" role="listbox" aria-label="Techniques">`. It stays empty until the user chooses an operation, and a `listbox` with no `option` children is invalid.

**Fix:** either set the role only while the grid holds options, or give the empty state an option-free role. A screen reader currently announces an empty "Techniques" list.

### F2 (Minor, a11y, row 13): About's demo-credits list can't be scrolled with the keyboard (serious)

**What axe reports:** **serious `scrollable-region-focusable`** on `.ab-credits`.

**Cause:**
- `styles.css:709` sets `max-height: 40vh; overflow: auto` on the list built at `about.ts:55`.
- The 50 credit lines hold no focusable element, so a keyboard user can't reach the lower credits.

**Fix:** `tabindex="0"` on the list, plus an accessible name, such as `aria-labelledby` pointing at the "Demo set" heading.

### F3 (Judgment, D11, -02's Tree row): Tree labels crowd at fit

**Screenshots:** `qa-shots\plan6\tree-light-1280.png` and `tree-dark-1280.png`; the 760 px files show the same problem.

**What crowds:** at the fit zoom with the demo taxonomy, the labels nearly touch, though no two labels fully overlap.
- Operation labels sit tight on the domain label below them: "Group" on "Grouping", "Sequence" on "Space".
- The orthogonal connector lines run through the domain labels ("Grouping", "Semantic", "Social", "Space"), which reads like strike-through.

-4a's glyph screenshots show the same thing. The overlap hiding from Task 3b F5 removes full overlaps only, not near-touches or lines through text. (Corrected after AGY's cross-check: my first draft listed text-on-text pairs that the 1280 screenshot doesn't show.)

This is a design call for -0c and the controller under D11 ("Fix only what the design review calls P1"). I record it as a Tree row and not as a functional failure: names stay readable after zooming in, and the inspector lists every operation.

## The matrix (Windows 11, this machine)

| Row | Result | Evidence |
|---|---|---|
| 1 Installs without admin | NOT CHECKED (not run; this is not a clean machine) | The NSIS config is `installMode: currentUser`, so it needs no admin. `webviewInstallMode: embedBootstrapper`. Read, not run. |
| 1a Unsigned-beta path (SmartScreen, SHA256SUMS) | NOT CHECKED | A local build carries no Mark of the Web, so SmartScreen never shows. |
| 2 Intro plays once, skips on the first key, replays from Help | **PASS** | It shows about 50 ms after attach. Enter skips it, and the skip never reaches the "Create" button under it (0 dialog calls). `introSeen: true` is saved, and the intro is absent on the next launch. Help > Play intro replays it: the UI half via `menu://action`, and **through the real native menu** with OS keys F10, Right, Down, Enter. A click skips it, and `introSeen` stays. |
| 3 Library path with spaces and non-ASCII | **PASS** | `…\p6qa\Mara's Références 日本 main` holds `library.json` (50 refs), `taxonomy.json` and `thumbs/256`. The NFD folder is a macOS case, NOT CHECKED. |
| 4 Demo set + asset-protocol thumbnails | **PASS** | 50 references. Every on-screen thumbnail loads (8 of 8). The off-screen ones are `loading="lazy"`: the first main check counted 19 of 25 because it included those, which is harness drift. About shows 50 demo credits, 2 fonts and Version 0.1.0, and "Third-party notices" opens the file (`plugin:opener|open_path`). |
| 5 Folder drop, paste from a browser | **PASS** (synthetic) | A 120-image folder drop added 120, through a synthetic `tauri://drag-drop`. A clipboard bitmap (`Clipboard.SetImage`) pasted with Ctrl+V added 1. A copy from a real browser, with HTML and source URL, is NOT CHECKED. |
| 5a Native drag onto Find similar | PASS at 100% (given) | 125–150% is NOT CHECKED. |
| 6 60 fps; 2,000 references | Partial | Galaxy pan at Ready with 50 refs, release build: p50 6.1 ms, p95 6.2 ms, max 7.0 ms per frame (Plan 5 baseline). Galaxy, Tree and Radial draw at 171 refs (shots). **2,000 refs: NOT CHECKED.** Linux WebKitGTK: NOT CHECKED. |
| 7 Lightbox TIFF preview | **PASS** | Plan 4 RF3: "Harbour scan.tif" is never blank and shows its preview note. |
| 8 Board export, "Show in folder" | **PASS** | Plan 4 Item 8: the label is "Show in folder" and it opens Explorer on the export. |
| 9 Offline | **PASS** (simulated) | `HTTPS_PROXY` points at a closed port, and the model was moved aside. First run with the demo set completes (50 refs). Find similar goes to `error` with "Couldn't reach the download. Check your connection and try again." in Settings, and the bar says "needs attention". The VM network-off case is NOT CHECKED. |
| 9a No VC++ / macOS 13 / Gatekeeper | NOT CHECKED | It needs a clean VM or a Mac. |
| 10 Second launch focuses the existing window | **PASS** | The second `horus.exe` exits with code 0, the process count is unchanged, and the foreground window is the first one's. |
| 11 Kill during an import | **PASS** | The app was killed with `taskkill /F` at "Importing 31 of 120". On the next start, `library.json` opens, the count is unchanged (51) and no `.tmp` is left. The notice offers the orphans back: "36 image files aren't in the library. Add them to the Inbox". Limits: `.tmp` was checked only in `thumbs/256`, and "Add them to the Inbox" was not clicked. |
| 12 Uninstall | NOT CHECKED (not run here) | Read from the generated `installer.nsi`: the uninstaller's "Delete the application data" checkbox, when ticked, runs `RmDir /r` on `$APPDATA\art.horus.app` and `$LOCALAPPDATA\art.horus.app`. That second folder holds the 213 MB model under `models\` and the WebView2 data. Unticked, both stay. The user's library folder is never touched, because it lives where the user chose. The install dir is `$LOCALAPPDATA\Horus`. `INSTALL-UNSIGNED.md` should say this (C7). |
| 13 Accessibility | **FAIL** (F1, F2) | **Keyboard-only first run passes**: Enter on Create, Space on Turn on now and Enter on Begin. Tab stops: Open, the demo checkbox, Turn on now, Not now and Begin; the checkbox and Not now were passed, not toggled. The Settings trap (`holdModal`) holds for Tab and Shift+Tab ×9, and Esc from `<body>` closes it with focus back on the gear. The Details trap holds for Tab ×8. axe has no serious or critical issues on reference, reference-similar, search-dropdown, tree, galaxy, radial, boards, lightbox, compare, details or settings. The **two fails are inbox (F1) and about (F2)**. Focus was visible in every keyboard step checked (screenshots). Keyboard tagging in the Inbox: NOT CHECKED. |
| 13a Design-review NOT CHECKED items | Shots delivered | The dark theme on every view, and 1100 and 760 px layouts, are in the set. Judging them, and the `impeccable` detector run, belong to -0c. |
| 14 D4 hover label | **PASS** | Lightbox, Divan Japonais: hover shows "Stand out › Silhouette" and "Make them think › Crop at the edge", visible and not clipped. |
| 14 D5 harness relaunch on a pick miss | **PASS** | `mara-plan6.js` relaunches on a fresh config after 2 misses. On the first run of the day it missed 4 of 4 in one launch, the known dying dialog route. Later runs missed 0. |
| 14 D7 Lanczos3 peak at 20000×6000 | NOT CHECKED | Not run: memory-guard risk, and the weekly-usage budget. |
| 14 D10 Galaxy overlap at 2,500 | NOT CHECKED | |
| 14 D16 macOS Cmd+Q save failure | NOT CHECKED | No Mac. |
| 14 D8 real Ctrl+Z in the move dialog | **PASS** | `#q` was typed in and cleared first, which is the old repro. Then Tree > Delete technique… on a technique in use, and a real Ctrl+Z in the empty search: `#q` stays empty, focus stays in `.tx-search` inside the `aria-modal`, and Esc closes the dialog. |
| 14 D11 graph label cosmetics | Judgment | See F3. |
| 3b encoder lock split: text search under 300 ms at 2,500 while indexing | NOT CHECKED | The 2,500-reference fixture was not built (budget). |

### Plan 6 features checked beyond the matrix

- **Task 3c, Details:** all **PASS**.
  - Opens with focus on Title.
  - Enter saves both the title and the year (`c. 1892–93`, with typographic quotes and «»), on screen and in `library.json`.
  - One Ctrl+Z restores both fields.
  - An empty title is refused with "A title can't be empty.", and the dialog stays open.
  - Esc cancels, and focus returns to "Details…".
- **Task 1, CSP:**
  - 0 `securitypolicyviolation` events and 0 CSP console lines over every run.
  - Swatches, callout badges, region boxes and op colours all render (shots).
  - 46 `[style]` attributes exist in the DOM, set through the CSSOM, which the CSP allows. Info only.
- **N3:** "Looks similar" sits on one line at 1280; the tab heights are equal and the screenshot confirms it.
- **Find similar on the release build:**
  - Ready at 50/50, and ORT loads.
  - The Plan 5 main baseline is 51/1.
  - Galaxy pan p95 is 6.2 ms.
- **Plan 4 deferrals now fixed:**
  - Plan 4 F1: Esc in the lightbox picker's Add technique form closes only the form (Item 9 PASS).
  - Plan 4 F2: the first-column Boards tile's Open button is no longer clipped (PASS).
- **Glyphs (aa57871):** the lightbox picker cards show each technique's glyph, for example Chiaroscuro and Pop-out. The Tree inspector's domain icon choices were not checked here; -4a's screenshots cover them.

### Installer sizes (row: budgets, R9)

| Artefact | Bytes | Measured + 10% (the proposed `budgetBytes`) |
|---|---|---|
| NSIS `Horus_0.1.0_x64-setup.exe` | 27,619,376 | 30,381,314 |
| MSI `Horus_0.1.0_x64_en-US.msi` | 31,784,960 | 34,963,456 |

These include the WebView2 bootstrapper, ORT and the VC++ DLLs. QA does not write `app/release-check.json`, because it is build code.

### Harness drift (not product failures)

- **Plan 5 main, the Settings credit check:** Plan 6 added an "About the model" button after the credit. The credit text is unchanged, and there is still no link.
- **Plan 4, the Boards scope check:**
  - Plan 6 made the label constant ("Show only this board"), with the state carried by `aria-pressed`.
  - The old check looked for "Showing only".
  - The status line is correct: "Board: Harbour light · 8 references · Show all".
- **Plan 4, the lightbox block:**
  - Plan 4 F1 is now fixed, so focus stays in the picker search after Esc, and the harness's `1` keypress then types into it.
  - After patching it to blur first, `1` picks Stand out, but Enter on the stage no longer makes an op-only tag.
  - The draw-and-tag at about 416% is Plan 4 behaviour and was verified there; D4 was re-checked directly (phase `d4`).

### NOT CHECKED (summary)

- Every macOS, Linux, Windows 10 and clean-VM row: 1, 1a, 3 NFD, 9a, 12 run, D16.
- 5a at 125–150%.
- 2,000 and 2,500 references: row 6, D10, and the 300 ms text search while indexing.
- D7.
- The real network-off case.
- Keyboard tagging in the Inbox.
- The `impeccable` detector (-0c).

## AGY #3 cross-check (conversation 9639ac0d, through `agy-run.sh`)

**Verdict, verbatim:**

> "PASS WITH FIXES"
>
> "The report's own verdict (`PASS WITH FIXES`, scoped to Windows 11 release build) is right; tighten F3's pair descriptions, two line numbers, and Row 11's `.tmp` phrasing"

**AGY's points and what changed:**

- **F1 and F2:** "real, `Minor` rating is fair". AGY corrected the line numbers (picker.ts:54 and 144–147, about.ts:55, styles.css:709), and I applied them.
- **The three baseline fails:** "all confirmed harness drift, not regressions".
- **F3:** "partly overstated". It saw no text-on-text collisions in the 1280 shot, only labels packed tight and "domain labels crossing the orthogonal connector lines". I checked the screenshot again, agreed, and rewrote F3.
- **Rows weaker than claimed:** Row 11 (the `.tmp` scope, and the recovery not clicked), Row 5 (a synthetic drop and a plain bitmap paste), Row 13 (checkbox and Not now not toggled). The limits are now written into those rows.
- **On the verdict:** "`PASS WITH FIXES` scoped to Windows 11 release build is right."
