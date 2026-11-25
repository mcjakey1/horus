# Task 7 report: the Galaxy view

**Status:** DONE, with concerns (listed at the end).

**Branch:** `p3-t7` (worktree `.worktrees/p3-t7`), on `2fecf79` (plan3-graph `6ae01c1` + p3-t4). Two commits:
- `c3f294f`: feat(ui): Galaxy view with worker force layout and hover edges
- `f3e6dee`: fix(ui): Galaxy defers work while hidden, refetches neighbours, keeps the camera. These fixes came from a self-review pass.

Every file was added by name. `.impeccable/hook.cache.json` and `AGY-NOTE.md` were not touched.

## What was built

**`app/src/graph/force.ts`** is pure, and runs in Node and in the worker.
- **`lcg(seed)`** and **`initialPosition(id, seed)`**: an FNV-1a hash of the id, seeded, into a disc of radius 300.
- **`createForce(input)`** returns a stepper: `step(n)` reports done when alpha < 0.01 or after 600 ticks, plus `positions()`, `alpha()` and `ticks()`. **`runForce(input, ticks)`** wraps it.
- **The simulation, with the brief's values verbatim:**
  - `forceLink`, with strength = score and distance = 40 + 160 × (1 − score);
  - `forceManyBody(-30)` and `forceCenter(0, 0)`;
  - `.randomSource(lcg(seed))`, then `.stop()` at once, then `.tick(n)`.
- **The outer ring.** `forceRadial(R_OUT)` has strength 0.08, applied only to references with no edges. `R_OUT` is 1.25 × the connected cluster's radius, measured after a 60-tick warm-up on a cold start, or at once on a warm start. When nothing is tagged, all references sit on one even ring. Edges to unknown ids and self-edges are dropped, and positions are never NaN.
- **Warm start:**
  - A node in `prev` starts there.
  - A new node starts at the mean of its placed neighbours, plus a small deterministic offset.
  - Otherwise it starts at `initialPosition`.
  - The simulation then starts at **alpha 0.1**. That value is mine; see the concerns.

**`app/src/graph/force.worker.ts`**:
- It runs `createForce` in 10-tick batches, posting each `tick` with a transferable `Float32Array`, then `end`.
- It yields with `setTimeout(0)` between batches, so a `stop` or a newer `start` abandons the run.
- Its scope is typed with a local cast (R7); there is no `WebWorker` lib.

**`app/src/views/galaxy.ts`**, `mountGalaxy(host, data, deps)`. It builds a canvas host (`data-label="Galaxy of references"`) and a 340 px inspector (`aria-live="polite"`).

- **The worker.** `new Worker(new URL("../graph/force.worker.ts", import.meta.url), { type: "module" })`. The build emits `assets/force.worker-*.js`, a 15 kB same-origin chunk. `?worker&inline` is never used.
- **Graph edges.** `api.graphEdges(K_EDGES)` is called **once per Snapshot version** (carry-ins 4 and 6). Hover and selection reuse the per-reference top-K map, ranked by (score desc, other id asc).
- **Nodes.** Each reference is a `NODE`-sized ref node with its full image and no region outline. Its aspect comes from width and height, or 3/4. An out-of-scope reference gets `dim: true`.
- **Edges (carry-in 1).** Only the selected reference's edges are drawn, or else the hovered one's. They are neutral `var(--ink-2)`, with width `EDGE_W0 + EDGE_W1 × score`. No edge is drawn to or from an out-of-scope reference. Otherwise, `setEdges([])`.
- **Scene events:**
  - `select` with `mods.shift`, while another reference is selected, calls `openCompare(selected, clicked)` and keeps the selection.
  - `activate` calls `openReference`. The scene owns Enter and double-click, so carry-in 5 overrides the brief's "Enter opens"; the Galaxy binds only Esc, which clears the selection, and skips text fields.
- **The inspector:**
  - The title (serif) and "Open in Reference view".
  - Below them, the ranked neighbours from `api.related(id)`. Each row has the neighbour's title (serif), "shares *A*, *B*" with technique **names** mapped from the ids in `sharedTechniques`, and the score as `0.00` in mono.
  - Clicking a row selects that reference and returns focus to the canvas.
  - "No references yet." shows when the library has none, and "Tag references to see them cluster." when there are references but no edges.
- **Review Focus 3:**
  - A store change warm-starts with `prev` and keeps the camera and the selection, and the neighbours are refetched. A deleted selected reference clears the selection.
  - `{ reset: true }` cold-starts with no `prev`, clears the selection, and fits once the layout has settled.
- **Fit and centring:**
  - The first layout, and the first after a library switch, calls `fitAll()` once **both** the layout and the scene are ready. The worker can settle (about 0.3 s) before Pixi has loaded.
  - While a cold layout streams in, the camera centres on its origin. This happens only before that first fit; a warm restart never moves the camera.
- **Visibility.** `show()` and `hide()` track whether the Galaxy is on screen.
  - While hidden, a change is only remembered (a reset is kept), and is refreshed on `show()`. So an Inbox tag doesn't pay for `graph_edges` and a layout no one sees.
  - There is no fit or centring while hidden, when the view measures 1×1.
- **Reduced motion.** Under `prefers-reduced-motion: reduce`, only the final layout is drawn, not each tick (C13).
- **`refresh()`** posts `stop` before awaiting `graph_edges`, so a superseded run cannot stream stale positions or spend the first fit.
- A DEV-only `window.__galaxy` hook (positions, settled, camera, selected, scene) is for the manual check. A grep confirmed it is absent from the release `dist`.

**`app/src/firstrun.ts` `boot()`** gets one registration line, `shell.register("galaxy", () => mountGalaxy(<[data-view-host="galaxy"]>, source, { api, openReference: shell.openReference }))`, plus its import.

**`app/src/styles.css`** gets its own `.gx*` block at the end: a canvas plus a 340 px inspector.

**Changes to Task 4 files, found while testing for real:**
- **`graph/scene.ts`:**
  - **`img.crossOrigin = "anonymous"`** on thumbnail loads. With real library thumbnails from `http://asset.localhost`, a different origin, WebGL threw "Failed to execute 'texImage2D' … The image element contains cross-origin data". Tauri's asset protocol answers with `Access-Control-Allow-Origin: <window origin>` (`tauri-2.12.7/src/protocol/asset.rs:24`, `:43`), so CORS mode makes the images safe for WebGL. Task 4's harness used same-origin `data:` URLs, which is why it missed this.
  - **`setNodes` keeps a node's display objects when only its position changed** (`frame.ts` `sameLook`). The layout streams every 10 ticks.
- **`graph/frame.ts`:** `sameLook(a, b)`.

## Tests

- **`graph/force.test.ts`** (Node) has 8 tests:
  - the brief's 5: `two_cliques_separate`, `deterministic`, `zero_degree_on_outer_ring`, `warm_start_moves_less` (which also checks that a new node starts near its placed neighbour) and `no_nan` (3 nodes, 0 nodes, 1 node);
  - `edges_to_unknown_ids_are_ignored`, `initial_position_is_deterministic_and_finite` and `stepper_stops_by_alpha_or_600_ticks`.
- **`views/galaxy.test.ts`** (jsdom, fake Scene, fake Worker, fake DataSource) has 20 tests:
  - the brief's 8: `edges_only_on_hover`, `select_pins_edges` (with Esc), `shift_click_opens_compare`, `out_of_scope_no_edges`, `inspector_names_shared_techniques`, `data_change_warm_starts`, `reset_cold_starts` and `empty_library_copy`;
  - also `graph_edges_once_per_version`, `activate_opens_reference`, `deleted_selection_clears`, `untagged_library_note`, `destroy_terminates_worker`, `fits_when_the_scene_arrives_after_the_layout` (no later camera move), `warm_restart_never_moves_the_camera`, `hidden_galaxy_defers_refresh_until_shown`, `hidden_galaxy_keeps_a_deferred_reset`, `no_fit_while_hidden`, `kept_selection_refetches_neighbours_on_change` and `superseded_layout_cannot_spend_the_fit`.
- **`graph/frame.test.ts`** gains `same_look_ignores_position_only`.
- The worker module itself is never imported by a jsdom test; its pure logic is tested through `force.ts`.
- **Totals:** `npm test` runs 31 files and passes **328 of 328**. `npx tsc --noEmit` is clean. `npm run build` is clean; its only warning is the size note for Pixi's lazily loaded 682 kB chunk.

## TDD evidence

- **RED:**
  - `npx vitest run src/graph/force src/views/galaxy` failed on "Cannot find module './force'" and "Failed to resolve import "./galaxy"".
  - After `force.ts` existed, `warm_start_moves_less` failed: "expected 41.38 to be less than 22.44", with warm alpha 0.3.
  - In the later rounds, these failed before their fixes:
    - `fits_when_the_scene_arrives_after_the_layout` ("expected +0 to be 1");
    - `same_look_ignores_position_only` ("sameLook is not a function");
    - `hidden_galaxy_defers_refresh_until_shown`, `no_fit_while_hidden`, `kept_selection_refetches_neighbours_on_change` and `superseded_layout_cannot_spend_the_fit` (4 failed);
    - the extended `fits_when_the_scene_arrives_after_the_layout`, which caught the late centring.
- **GREEN:** force 8/8, then galaxy and graph 22/22, 62/62, 81/81 and 82/82, then the full suite at 328/328.

## Manual check (Step 3)

**Set-up.** `npm run tauri dev` in this worktree, driven over WebView2 CDP. First run created a library with the demo set (50 references). The dialog was fulfilled over CDP, as in the Plan 2 harness.

| Check | Result |
|---|---|
| Clusters settle | **258 ms** from the tab click to the worker's `end`, well within 2 s |
| UI thread during the first open | p95 frame 24–30 ms, worst 36 ms. That window includes Pixi's first load and the decoding of 50 thumbnails, so it does not isolate tick cost |
| UI thread during a warm restart (Pixi already loaded) | p95 **6.1 ms**, worst 6.3 ms, settled in 181–186 ms. The UI never froze |
| Hover | shows the neutral edges of the hovered reference (screenshot) |
| Select | the inspector lists neighbours, such as "The Two Disciples at the Tomb, shares *Gaze cue*, 0.62" |
| Tag round trip | select, go to Reference, tag with `t` and the picker, return. The selection is kept and the camera unchanged (no camera calls, and the same 2 s later). The inspector is kept, and the layout warm-restarted (mean move 13 world units, then 0 for a tag that changed no edges) |
| Before fixes `f3e6dee` | a scene arriving after the layout left the camera unfitted (top-left). After a warm restart the camera re-centred (x and y moved, scale kept). Both are now covered by tests |

**The worker under the real CSP (carry-in 7):**
- **Set-up:** the built `dist` was served with the exact `tauri.conf.json` CSP as a header, in headless Chromium. From the page, `new Worker("/assets/force.worker-*.js", { type: "module" })` was sent a `start`.
- **Production CSP:** a `tick` came back with 3 ids, all finite, and there were no `securitypolicyviolation` events.
- **Control (`… ; worker-src 'none'`):** the worker failed to load, with a `worker-src` violation, so the probe can fail.
- `tauri dev` also ran the worker module.

**Clean-up:**
- The dev processes were stopped.
- `%APPDATA%\art.horus.app` was deleted after each run; it did not exist before my runs.
- The test library `D:\Design Second Brain\Références test 2` was deleted.
- In the first run my path string lost its backslashes, so the library was created at a drive-relative path inside the worktree, `app/src-tauri/Design Second BrainRéférences test 2/`. It was deleted, never committed, and `git status` is clean.

## Files

- **Created:** `app/src/graph/force.ts`, `force.test.ts`, `force.worker.ts`, `app/src/views/galaxy.ts`, `galaxy.test.ts`.
- **Modified:** `app/src/firstrun.ts` (one registration line and the import), `app/src/styles.css` (the `.gx` block), and `app/src/graph/scene.ts`, `frame.ts` and `frame.test.ts`, which are Task 4 files.

## Concerns

1. **`scene.ts`, `frame.ts` and `frame.test.ts` are outside the brief's Files list.**
   - **The crossOrigin fix is a real Task 4 bug.** Task 6 (Tree) and Task 8 (Radial) also draw real thumbnails, and hit the same WebGL error until this lands.
   - **The `sameLook` reuse is a speed change** for streamed layouts.
   - The controller hand-merges; these hunks are self-contained.
2. **Enter goes through the scene's `activate`.** Carry-in 5 overrides the brief's line that "Enter opens the selected reference" in the Galaxy's own handler.
3. **Warm-start alpha 0.1 is my value.** At 0.3, `warm_start_moves_less` measured warm movement at 41 units, against a limit of 22 (25% of the cold start's movement). At 0.1 it passes, with the margin to spare; at 0.05 and 0.03 it passes too.
4. **Tiles overlap inside clusters.** The link distance starts at 40 against a 48-unit tile; these are the brief's values. A collide force would fix it, but none is specified.
5. **The keyboard gap.**
   - There is no keyboard way to select a first reference in the Galaxy.
   - With a selection, the arrows do nothing: the scene leaves them to the view, and the Galaxy has no `navigate.ts` (wave rule).

   This falls short of Global Constraints ("every action … reachable from the keyboard"), but the brief doesn't ask for it, so it is not built. It is a candidate for the final review.
6. **The first-open frame figure** (p95 24–30 ms) includes Pixi's first load. Clean tick cost is the warm figure. The 2,000-reference speed is Task 11's.
7. **The DEV-only `window.__galaxy` hook** is kept for later manual checks, and is absent from release.
8. **The build warns that a chunk exceeds 500 kB.** It is Pixi's lazily loaded `lib` chunk, so nothing changes at start-up.
9. **Inspector without a selection.** It is empty unless a note applies. I added no new copy, because the brief fixes the strings.

## Fix round 1 (review `task-7-review.md`: I1, I2 and I3)

**Commit:** `76d2e4f`, fix(ui): Galaxy drops stale worker runs, keyboard navigation, collide force. Only I1–I3 were fixed; the 11 minors stay deferred.

**I1: stale worker messages.**
- **The change.** `ToWorker` `start` and both `FromWorker` messages carry a `run` number (`force.ts`), which the worker echoes (`force.worker.ts`, `runId`). In the view, `refresh()` bumps `run` as it posts `stop`, and `start` takes the next id. `worker.onmessage` drops any message whose `run` doesn't match. So a batch the worker posted before it read `stop` can't refill `positions`, set `settled`, or spend a reset's fit.
- **The test.** `superseded_layout_cannot_spend_the_fit` now delivers a late `tick` and `end` from the old run after a reset, and checks four things:
  - no fit was spent;
  - the new run's id differs;
  - the new `start` has no `prev`, so the reset stays a cold start;
  - the new run's `end` fits once.

**I2: the keyboard route (Global Constraints, controller ruling).**
- **The change, in the Galaxy's host keydown handler** (`isTextEntry` fields are still skipped):
  - **Enter with nothing selected** picks the in-scope, placed reference nearest the view centre (`camera + canvas size / 2`). The scene consumes Enter only when it has a selection (`scene.ts:461`); without one, the key bubbles to the host, which is where this handler runs.
  - **Enter with a selection** still opens it, through the scene's `activate`.
  - **The arrows with a selection** move to the nearest in-scope, placed reference inside an **open** ±45° cone along the arrow: along > 0 and |across| < along. Ties go to the lower id. An empty cone means no move.
  - **The arrows with nothing selected** are left to the scene, which pans.
- **Tests** (5, on fixed positions a(0,0), b(100,0), c(100,100), d(0,−80), e(−300,10)):
  - `enter_with_nothing_selected_picks_the_reference_nearest_the_centre`
  - `first_pick_skips_out_of_scope_references`
  - `arrows_move_to_the_nearest_reference_in_that_direction`: right, down, left, right and up, including cone-edge cases, because c sits exactly on the 45° edges.
  - `an_empty_cone_does_not_move`
  - `arrows_without_a_selection_are_left_to_the_scene`
- **In the real app:**
  - With the canvas focused, Enter selected a reference.
  - ArrowRight, ArrowDown, ArrowLeft and ArrowUp each moved the selection, and the last returned to the start.
  - The inspector followed.
  - A second Enter opened the Reference view.
- **One limit:** a key-moved selection that leaves the screen does not pan the camera. Not asked for; noted.

**I3: forceCollide (controller ruling).**
- **The change.** `forceCollide(NODE / 2 + 4)` was added to the simulation in `force.ts`.
- **Tests.** The new `tiles_in_a_cluster_do_not_overlap` checks that a 10-clique at 0.8 keeps every pair of centres more than 0.9 × NODE apart. `warm_start_moves_less` still passes, as do the other force tests.
- **On the demo library (50 references, `tauri dev`, WebView2):**
  - The closest pair of tile centres is **54.8 world units**, against a 48-unit tile, so no tiles overlap. Before the change, the screenshot showed stacking.
  - **The cold settle takes 898 ms,** from the tab click to the worker's `end`. That includes Pixi's first load and `graph_edges`. Before collide it was 258 ms. It is within the 2 s budget.

**Commands and output:**
- **RED:** `npx vitest run src/graph/force src/views/galaxy` gave `Tests 6 failed | 28 passed (34)`. The failures were `tiles_in_a_cluster_do_not_overlap`, `superseded_layout_cannot_spend_the_fit`, `enter_with_nothing_selected_…`, `first_pick_skips_out_of_scope_references`, `arrows_move_to_…` and `an_empty_cone_does_not_move`.
- **GREEN:** the same command gave `Tests 34 passed (34)`.
- `npm test`: `Test Files 31 passed (31)`, `Tests 334 passed (334)`.
- `npx tsc --noEmit`: clean.
- `npm run build`: `✓ built`. The worker chunk is `force.worker-*.js` at 16.4 kB, and the only warning is the known Pixi chunk-size note.

**Clean-up:** the dev processes were stopped. The test library `D:\Design Second Brain\Références test 2` and `%APPDATA%\art.horus.app` were deleted; neither existed before this run.
