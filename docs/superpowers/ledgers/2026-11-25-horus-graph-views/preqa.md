# Pre-QA — Plan 3 Graph Views, Tasks 1–9 (as "Mara Okafor")

- **QA session:** `design-second-brain-6a` (takes over the QA role from the old "ae" session), 2026-11-26. Controller: `design-second-brain-55`. Persona and method: `QA-PERSONA.md`.
- **Target:** detached `41d96ce` (plan3-graph, Tasks 1–9 merged), worktree `.worktrees/p3-qa`. The tree was clean.
- **Build:** `npm ci`, then `npx tauri build --no-bundle`. This produced the portable `app/src-tauri/target/release/horus.exe` (13:17, 8 min 27 s). No installer was built.
- **Unit tests:** `npx vitest run` gave **386 / 386** passing in 35 files, the same as the ledger.
- **How the app was driven:**
  - The real release exe, over WebView2 CDP on port 9334.
  - `WEBVIEW2_USER_DATA_FOLDER` pointed at a scratchpad folder.
  - Every library was disposable, in scratchpad: `fx\Mara graph é`, `fx\Empty start`, `fx\Mara inbox ü`.
  - `%APPDATA%\art.horus.app` did not exist before the runs and does not exist after them.
  - No horus.exe was running alongside (checked with tasklist before each run).
- **Fixtures:** regenerated, because the old ones were lost in the drive move: 2,000 synthetic JPEGs in nested folders, `fake.psd`, `empty.jpg` and 7 small PNGs.
- **Release builds have no Galaxy hook.** To get layout positions, the harness wraps `window.Worker` in the page and records each run's tick and end messages. The expected answers for Enter and the arrow keys are computed independently from those positions.
- **Screenshots** are in `C:/Users/JAKE/AppData/Local/Temp/claude/53c841e027131a00/566b706e-cef6-47d6-9f6d-dfc8e6c206df/scratchpad/qa/shots3/` (scratchpad; they may be cleared). The follow-up measurements are in its `fu/` subfolder.
- **Scripts:**
  - `mara-plan3-preqa.js` (new): 47 lines, made up of 37 PASS, 4 FAIL and 6 NOTE. The FAILs are P3-2 (Tree), P3-2 (Radial), P3-5, and the expected 404 under RF5;
  - `mara-plan2.js` (regression, unchanged);
  - a short follow-up script for the zoomed Tree screenshots, in the session scratchpad.

## Verdict for the final review's fix wave: 1 important, 5 minor, 3 judgment calls

Review Focus 1, 2, 3 and 5 hold in the real app. Galaxy keyboard (T7) works exactly as ruled. The Plan 2 regression is clean. The problems are readability and the keyboard on the Tree and Radial views.

## Findings

### P3-1 — Important — Tree technique labels overlap at every zoom (T6 "label overlap at 64-unit spacing")
- **Steps:**
  1. Open the demo library and go to Tree.
  2. Select an operation, then a domain, then Chiaroscuro.
  3. Press `+` six times, waiting 350 ms between presses, so the labels are readable.
- **Expected:** each technique name is readable.
- **Actual:** neighbouring labels print over each other: "Symmetry" / "Proximity clustering", "Good continuation" / "Size hierarchy", "Face schema" / "Temporal synthesis", "Body vector" / "Closure", "Leading lines" / "Repoussoir" / "Semantic contrast". Screenshot: `shots3/e01-tree-zoom-spaced.png`.
- **Measured:**
  - 40 of the 48 seed technique names are wider than the 64-unit gap at 13 px Source Serif 4. The median is 100 px; the widest are "Caricatural exaggeration" at 153 and "Complementary pairing" at 149.
  - The labels scale with the world, so zooming never separates them.
- **Mara:** she cannot read the Tree, which is the view meant for learning the system and, from T10, for editing it.
- **Reproduce:** `mara-plan3-preqa.js` now spaces its `+` presses 350 ms apart, so its `t02b` should reproduce this. The spacing was added after the last full run, and the harness has not been re-run since (only syntax-checked). `e01` came from the follow-up script in the session scratchpad.
- **Where:**
  - `app/src/graph/layout-tree.ts:9` (`GAP = NODE + 16`) against the fixed 13 px world-unit label in `app/src/graph/scene.ts` `make()`.
  - Fix options: widen the technique gap to fit the label, wrap or stagger the labels, or truncate them with the full name in the inspector.

### P3-2 — Minor (the controller rates it) — Tree and Radial: the canvas can't start a selection; the keyboard route goes through the inspector
- **Steps:**
  1. Open Tree and Tab to the canvas (7 presses).
  2. Press Enter, ↓ and →.
  3. Do the same in Radial: Tab to the canvas (8 presses), then ↓.
- **Expected:** this is a question rather than a known requirement.
  - The Global Constraints say the arrows pan when nothing is selected, and a keyboard route through the inspector does exist.
  - The Galaxy ruling (T7 I2) covered a view that had no route at all.
  - So the controller rates this; it is not clearly a constraint breach.
- **Actual:**
  - With nothing selected, the arrows pan, because the scene handles them and calls `preventDefault`. Enter does nothing (the Tree's `activate: () => {}`). The crumb stays empty.
  - The route that works goes through the inspector.
    - Tree: Tab once from the canvas into the Operations list, then Enter. The focus moves to the inspector `h2.insp-title`, where the arrows do nothing, so it takes one Shift+Tab back to the canvas. ↓ then walks operation → domain → technique, which works.
    - Radial: Tab once to the Operations list, then Enter selects Differentiate. Checked in the follow-up script.
  - **Friction:** 3 extra keys and a focus jump before the arrows work.
  - **Dead code:** the null-selection branch of `navigate.ts` `move()` (land on the first operation) can never be reached.
- **Where:**
  - `app/src/graph/scene.ts` `onKey` (arrows pan while `selected === null`);
  - `app/src/views/tree.ts` (`activate: () => {}`);
  - `app/src/graph/navigate.ts` `move()` already returns the first operation for a null selection, but it is never reached.
- **Possible fix:** Enter with nothing selected picks the first operation (Tree) or the centre (Radial), mirroring the Galaxy.

### P3-3 — Minor — Radial labels collide on the same ring
- **Steps:** open Radial, press `2` (Hold together), then zoom in.
- **Actual:** "Color blocking" and "Limited palette" overlap ("Color blockLimited palette"). Screenshot: `shots3/r02b-radial-zoom.png`. It is the same cause as P3-1: two techniques under one domain sit close together on the ring.

### P3-4 — Minor — fast `+` / `-` presses don't add up
- **Steps:** with the Tree or Radial canvas focused, press `+` six times quickly, as a held key would.
- **Measured** on the Galaxy with six `-` presses: the width of the content box, against the expected 0.8⁶ = 0.262.

  | Gap between presses | Width ratio | Effective steps |
  |---|---|---|
  | 0 ms | 0.793 | 1 |
  | 30 ms (≈ Windows key repeat) | 0.504 | 3 of 6 |
  | 150 ms | 0.282 | almost all |
  | 350 ms | 0.262 | all 6 |

- **Effect for Mara:** holding `+` or `-` zooms at about half the expected rate. Tapping is fine.
- **Cause:** `setCamera(zoomAt(cam, …), true)` computes each new target from the camera part-way through the tween, not from the previous target (`scene.ts` `onKey`).

### P3-5 — Minor — Galaxy square tiles can overlap at the corners (T7 tile overlap)
- **Measured:** on the demo layout, the minimum centre distance is 54.8 and **30 pairs** of 48-unit square tiles overlap. The collide radius 28 (NODE/2 + 4) is a circle; two squares placed diagonally need about 34 (48·√2/2) to clear.
- **Visible?** Only slightly: card corners touch or cover each other in `g01` and `g04`. The thumbnails stay legible. Raising the radius is a one-number change, and T11 measures the settle cost.

### P3-6 — Minor — the selection can leave the screen; the camera never follows it
- After a keyboard zoom, the selected Tree path (Differentiate → Feature → Chiaroscuro) was off-screen (`e01`).
- Seen: a keyboard zoom about the centre pushed the selection off-screen. `+` and `-` zoom about the view centre, not the selection.
- From the code, not run: `render()` calls `scene.select()` but never pans to the selection. So walking with ↓ / → past the edge of the view probably moves the selection out of sight without the artist noticing.
- The code path is shared with the Radial.

### Judgment calls for the controller (not defects)

- **J1 — off-path inks at rest (T6 / T8 ruling).**
  - Off-path operation squares, branch and technique outlines, and the hairlines are `--line-2`.
  - That is **1.57:1** against the canvas background in light. The canvas is transparent, and the computed background behind all three views is `body` `rgb(243,243,242)` = `--shell` (`#c4c4c2` on `#f3f3f2`) and **1.61:1** in dark (`#3a3a3a` on `#151515`). WCAG 1.4.11 asks 3:1 for graphics needed to understand the view.
  - At rest the Tree and Radial are entirely grey; operation colour appears only along a selected path and on the Radial tab dots.
  - Screenshots: light `t02` and `r02b`, dark `t03`. Labels are `--ink` and read fine.
  - It complies with Operation-Only Chroma. Whether the op squares at rest need more contrast is a design decision.
- **J2 — the Tree at fit is dots only.** With the whole taxonomy fitted, everything is below `DOT_PX`, so there are no labels and no operation squares (`t01`). Mara has to zoom before she sees anything named. A first-show fit to the operation and domain bands, rather than to all techniques, would read better.
- **J3 — a missing thumbnail is a bare 3 px dot among 48 px cards** (`g09`). This is per spec, and nothing throws. Without the N5 card it is easy to miss that a reference is there at all.

## Ledger "to QA" items

| Item | Result |
|---|---|
| T6 real-app check of Tree (the release exe, not `tauri dev`) | Works: bands, inspector, crumb, Show all references, live theme recolour, reduced motion |
| T6 label overlap at 64-unit spacing | **P3-1** |
| T6 off-path operations in `--line-2` | **J1** |
| T8 scene labels: ink, fonts, reduced motion match the Tree | Same scene code. Source Serif 4 400/500/600 and Red Hat Mono 400/500 are loaded (`document.fonts.check` true) and match the inspector. Reduced motion: zoom in, press `0`, then screenshot the canvas at once (65–95 ms) and again 450 ms later. With `no-preference` the two frames differ (Radial 12.7%, Tree 1.8% of pixels), so the check can fail. With `reduce` they are identical, on **both Radial and Tree**. Labels collide: **P3-3** |
| T7 Galaxy keyboard | **PASS.** Tab reaches the canvas in 5 presses. Enter picks the reference nearest the view centre (matches the independent computation). →, ↓, ← and ↑ each land on the expected ±45° cone target. Enter on the selection opens it in the Reference view |
| T7 tile overlap | **P3-5** (corners only) |

## Review Focus

| RF | What Mara did | Result |
|---|---|---|
| 1 | Relaunched with `--disable-3d-apis --disable-webgl` (`getContext('webgl')` was null) | Tree, Galaxy and Radial each show exactly "This view needs WebGL, which isn't available here. The Reference view still works." The Tree inspector still lists Operations, and the Reference view works. **PASS** |
| 1 | `WEBGL_lose_context` `loseContext()`, then `restoreContext()`, on the Galaxy | The sentence shows while lost and is removed on restore. After the restore, `g06` shows the scene fully redrawn: thumbnails, the selection ring, edges and the same camera. **PASS** |
| 2 | New library with no demo | Galaxy says "No references yet." The Tree lists 4 operations, each at count 0, and the library switch cleared the selection. **PASS** |
| 2 | Dropped 3 untagged PNGs | Galaxy says "Tag references to see them cluster."; the 3 are placed on a ring with no NaN; Enter still picks one. **PASS** |
| 3 | Galaxy zoomed in with a selection, then 3 images dropped while it was open | Selection kept, zoom kept (`g03` → `g04`), 53 placed. Warm start: placed references moved a median 7.4 and at most 39.5 world units. **PASS** |
| 3 | 3 Inbox tags while the Galaxy was hidden, then back | Selection kept, all placed, no NaN. **PASS** |
| 3 | Ctrl+Z (a tag undo) on the Galaxy canvas, and on the Tree | Selection kept in both. **PASS** |
| 3 | Tree and Radial zoomed in with a selection, then Ctrl+Z (Tree) and Ctrl+Shift+Z (Radial) (follow-up script) | The canvas frame before and after is pixel-identical, so the camera did not move. The Tree crumb is unchanged. **PASS** |
| 3 | Deleted selection: in the untagged-only library (3 dropped PNGs), Enter picks one, then Ctrl+Z undoes the import, which empties the library (imports are undoable) | The selection clears, the inspector says "No references yet.", and nothing throws. **PASS** |
| 3 | Library switch | The selection clears (Galaxy and Tree). The refit was not checked on its own. **PASS** |
| 5 | Deleted one `thumbs/256` file and emptied another, then opened the Galaxy and zoomed out and in | Both draw as dots (`g09`). Each URL was requested **once** (`{"gone":1,"bad":1}`), with no retry per frame and no page errors. The single console line is the browser's own "Failed to load resource: 404", which is expected. **PASS** |

## Regression — `mara-plan2.js`: 51 / 51 PASS

- **First attempt aborted before any check ran.** "Begin" never enabled after "Create a new library…". The same stall happened once in `mara-plan3-preqa.js`.
  - It is not a dead button: the first-run click listener is bound in the same task that renders the buttons (`firstrun.ts:150-172`).
  - Likely cause, not proven: the harness's `page.route` for the dialog also matches the CORS preflight, which would use up the queued folder path. The real call then gets `null`, and `pickFolder` returns early.
  - Retrying the click (`mara-plan3-preqa.js`) always works. Treated as a harness issue; the cause is not fully established.
- **Re-run:** all 51 checks PASS. Among them:
  - M2 sort order;
  - AND/OR;
  - RF1–RF5 of Plan 2;
  - the hoard drop;
  - 12 Inbox items tagged by keyboard in 45–117 ms each, and 5 at 2,000 references in 82–145 ms;
  - save failure and Try again;
  - Plan 1 carries;
  - 2,000 imported in 59.9 s, with a windowed DOM (30 images);
  - M5 (the warning shown once);
  - zero external requests.

## Not covered here

- T10 / T11 scope: taxonomy editing, the head-heavy benchmark, and the 2,000-reference graph views. These belong to Phase 2.
- `tauri dev` itself: the release exe stands in for it, under the production CSP and with the chunk split.
- macOS / Linux WebKitGTK: no machine for them.
- Display P3 thumbnails in the canvas views.
- Shift-click Compare: Plan 4.
- Drag in the Tree: editing is T10.

## AGY

Not run for the pre-QA pass (the controller asked for a summary). The AGY #3 cross-check comes with the Phase 2 verdict.
