# Task 7 review: the Galaxy view (2fecf79..f3e6dee)

Reviewer scope: the diff, plus one focused check per named risk (scene.ts object and pick paths, TexCache, the Rust score floor, Tauri asset.rs CORS, the release `dist`, the p3-t6 `navigate.ts` signature). The review was read-only, and the suite was not re-run.

## Part 1: Spec. Verdict ❌

The brief's own items are met. One Global Constraint is not met, because the brief and the constraint conflict.

### Met
- ✅ Layout in a Web Worker. The worker URL is `new URL(..., import.meta.url)` and not `?worker&inline`. `dist/assets/force.worker-*.js` exists.
- ✅ Link strength = score, and distance = 40 + 160 × (1 − score). Charge is −30, with `forceCenter`, `.randomSource(lcg(seed))` and `.stop()` before the ticks.
- ✅ `forceRadial(R_OUT)`, strength 0.08, applied to deg-0 nodes only. R_OUT is measured after a 60-tick warm-up.
- ✅ Worker batches: a tick every 10 ticks. It stops at alpha < 0.01 or after 600 ticks.
- ✅ Reduced motion: only the `end` positions are drawn (C13).
- ✅ Edge width is `EDGE_W0 + EDGE_W1 × score` (0.75 / 2.25), in neutral `var(--ink-2)`. Edges are drawn only for the selected reference, else the hovered one.
- ✅ K_EDGES = 8 per reference (`topK`). The ≥ 0.05 floor is applied in Rust (`correlate.rs:12`, `:180`, `:425`).
- ✅ `graphEdges` is called once per data version and cached on `version`. Nothing calls it per frame.
- ✅ Shift-click with another reference selected calls `openCompare(selected, clicked)`, and the selection stays.
- ✅ Board scope: out-of-scope references are `dim`, and none of their edges are drawn.
- ✅ The inspector: the serif title, "Open in Reference view", and the ranked `api.related` rows. Each row shows "shares *names*" (ids mapped to names) and the score in mono.
- ✅ Review Focus 2: the outer ring, both copy strings verbatim, and `positions()` maps a non-finite value to 0.
- ✅ Review Focus 3: a data change warm-starts from `prev` and keeps the camera and the selection. A deleted selection clears. `{reset:true}` cold-starts, clears the selection and fits.
- ✅ Esc clears the selection, and the handler skips text fields. Enter goes through the scene's `activate`, which matches the Global Constraint "Views listen for `activate`".
- ✅ CSP: no `style=` attribute in the templates, and the worker chunk is same-origin.
- ✅ All 13 tests the brief names are present.
- ✅ `boot()` registration.
- ✅ The `.gx` CSS block.
- ✅ Flag 4: `window.__galaxy` sits behind `import.meta.env.DEV`. `grep __galaxy app/dist/assets/*` finds nothing, while `dist` does contain the Galaxy (the "Galaxy of references" string is in `index-*.js`).

### Missing
- ❌ **The keyboard route (flag 1).** These Global Constraints apply here: "every action in a canvas view is also reachable from the keyboard and the inspector" and "The arrows move the selection when a node is selected". The Galaxy does not meet them:
  - With a selection, the arrows do nothing. `scene.ts:462` leaves them to the view, and `galaxy.ts:241` handles only Esc.
  - There is no keyboard way to make a first selection. With nothing selected, the inspector is empty, so it offers no route either.
  - Shift-click Compare has no keyboard or inspector equivalent.

  This is a brief/constraint conflict, not an implementer deviation: the brief's Keys section lists only Esc and Enter. See finding I2.

### Extra (accepted or harmless)
- `scene.ts` / `frame.ts` (`crossOrigin`, `sameLook`) are outside the Files list. The controller accepted both; they are checked under flag 5 below.
- The visibility deferral (`show`/`hide`, `pending`) is Extra. It is justified as "carry-in 6", which I have not seen ⚠️. It is cheap, and it is covered by tests.
- A new node starts at the mean of its placed neighbours plus a ≤ 10-unit deterministic offset. This is a sensible addition.

### The implementer's flags
1. **No keyboard first pick.** Confirmed. It falls short of the Global Constraints (see Missing above, and I2).
2. **Tiles overlap inside clusters.** Confirmed by the arithmetic: a 0.8 link is 72 units against a 48-unit tile, and a 10-clique packs tighter. This follows from the brief's values, not from an implementation error. A `forceCollide(≈0.6 × NODE)` would fix it, but it changes the spec's simulation, so the plan owner should rule on it. There is a related point: the "nothing tagged" ring (`force.ts:97`, r = 0.8·√n·NODE) spaces tiles at about 240/√n units, so they overlap once n > 25.
3. **Warm alpha 0.1.** Acceptable: the brief is silent, and the test passes with margin. However, the test covers only the easy case, a brand-new node placed at its neighbour. The everyday case is not tested: tagging a ring reference gives it its first edge. See finding M6 ⚠️.
4. **The dev hook.** It is absent from release ✅.
5. **The Task 4 changes. No regression found.**
   - **Culling:** the grids are rebuilt on every `setNodes`. `update()` still hides the members of `shown` that are not in the plan and clears their textures. Not resetting `shown` is safe, because dropped ids hit the `!o` guard.
   - **TEX_CAP:** unchanged. Kept but hidden sprites still get `Texture.EMPTY`, and the eviction argument at `scene.ts:330` still holds.
   - **The late-load guard:** it lives in `TexCache` (per URL), not on the node objects, so object reuse cannot affect it.
   - **The edge gate:** `nodesVersion++` is kept, so moved endpoints redraw.
   - **`root.position.set(x, y)`:** this matches `make()`, which also places the root at the node centre.
   - **`crossOrigin = "anonymous"`:** verified against `tauri-2.12.7/src/protocol/asset.rs`. It sends `Access-Control-Allow-Origin: <window origin>` on success (`:43`) and on error (`:24`). `data:` URLs (the harness) are unaffected.

   Two points I could not settle (⚠️): see M8 for the draw-order and pick-order point, and M9 for `asset://` on macOS and Linux.

## Part 2: Quality. Verdict: Needs fixes

### Important

**I1. Stale worker messages are applied after a `stop` or a new `start` (`app/src/views/galaxy.ts:183`, with `:146` and `:288`).**
- `worker.onmessage` has no run identity. `refresh` posts `stop` at `:146`, but a `tick` or an `end` that the worker posted before it read the `stop` is still delivered and applied. The worker posts `tick` then `end` in the same batch (`force.worker.ts:28-29`), so the window is one batch.
- **Effects:**
  - A late `end` after a reset sets `settled = true` and calls `fitIfSettled()`. That spends `fitOnEnd` on an empty or old layout, so the new library's layout never fits. This breaks C20, "reset… calls fitAll()".
  - A late `tick` refills `positions` after `positions = {}`. A reset whose library shares ids with the old one (for example, content-derived ids) would then post `start` with `prev`, which is a warm start where the spec says cold.
  - A stale `end` during a warm change sets `settled` early.
- **The window is narrow:** it needs an old run still streaming, about 0.2–0.3 s after any change.
- **The test does not cover it:** `superseded_layout_cannot_spend_the_fit` (`galaxy.test.ts:321`) only asserts that `stop` was posted. It never delivers a late message, so its name claims more than it checks.
- **Fix:**
  - Add a `run: number` to `start`, and echo it on `tick` and `end`. Keep `let runId` in the view, and ignore any message whose `m.run !== runId`.
  - Extend the test: after a reset, deliver an old-run `end` and assert `fit` is unchanged; then finish the new run and assert `fit` is +1.
  - The change to `ToWorker`/`FromWorker` is one field.

**I2. The keyboard route required by the Global Constraints is missing (`app/src/views/galaxy.ts:241`).** See Part 1.
- **Fix, either:**
  - (a) Now: in the Galaxy keydown handler, with a selection, map the arrows to the nearest in-scope placed reference in that direction (a 90° cone, ordered by distance). That is about 15 lines and one test. The p3-t6 `canvasKeys(e, { move(dir), activate, clear })` is generic, so it can host this once merged; its `move()` in `navigate.ts` is `TaxGraph`-based and not reusable here.
  - (b) A tracked controller follow-up at merge.
- Either way, the first pick still needs a ruling. One option is that Enter with nothing selected selects the reference nearest the view centre: the scene does not consume that key (`scene.ts:461` falls through to `return`), so it bubbles to the host. But this conflicts with the wording "the scene owns Enter… while nothing is selected", so the plan owner should decide.

### Minor
- **M1, a test that cannot fail (`app/src/views/galaxy.test.ts:203`).** `deleted_selection_clears` passes with the clearing line (`galaxy.ts:154`) deleted. The edges are `[]` anyway (there is no position for `a`), and `.gx-neighbours` is null anyway (the `related` mock returns `[]`). Fix: also assert `last(t.sc.calls.select)` is `null`, or re-add `a` and assert that its edges are not drawn.
- **M2, no worker error handling (`app/src/views/galaxy.ts:56`).** There is no `worker.onerror` or `onmessageerror`. A worker that fails to load or throws leaves an empty canvas with no message. Fix: on `error`, show the fallback note in the inspector (and log). Never fall back to running the layout on the UI thread.
- **M3, a failed fetch is cached (`app/src/views/galaxy.ts:165`).** `graphEdges(...).catch(() => [])` caches the failure for that version (`edgesVersion` is set) and shows "Tag references to see them cluster." when the real cause is an error. Fix: on catch, don't advance `edgesVersion`, so the next refresh retries, and don't set `edgesFetched`.
- **M4, a duplicate `stop` (`app/src/views/galaxy.ts:156`).** It repeats the one at `:146`. Delete it.
- **M5, state declared out of place (`app/src/views/galaxy.ts:181`).** `let allEdges` is declared after `refresh`, which uses it. It works only because of statement order. Move it up with the other state, next to `byRef`.
- **M6, the ring can drift outward on a warm start ⚠️ (`app/src/graph/force.ts:91`).** This is from reading; I did not measure it. On a warm start, a ring reference that just gained its first edge has `deg > 0`, so its ring position is counted in `linked`. R_OUT then comes out near 1.25 × 1.25 × the cluster radius for that run, and the untagged ring moves outward. Repeating the tagging can ratchet it further. Fix: measure the cluster radius with a robust statistic (for example, the 90th-percentile distance). Add a test: tag one ring node of a settled layout, and assert that the other ring nodes move less than X.
- **M7, a magic number (`app/src/graph/force.ts:84`).** The warm alpha `0.1` should be a named `WARM_ALPHA`, next to `ALPHA_END`, with the measured reason in one line.
- **M8, draw order and pick order ⚠️ (`app/src/graph/scene.ts:518`).** With objects now reused across `setNodes`, a node object made later (for example, after a `dim` change, or one that first scrolls into view) is appended on top of `nodeLayer`. The pick grid, however, uses the `setNodes` order. With overlapping tiles (flag 2), the visual top and the picked tile can differ. Panning already caused this before the change, so this widens an existing gap rather than introducing one. Fix, if it matters: `o.root.zIndex = order.get(id)` with `sortableChildren`.
- **M9, the CORS change on other platforms ⚠️ (`app/src/graph/scene.ts:165`).** It is verified for Windows (`http://asset.localhost`). On macOS and Linux the asset protocol is a custom `asset://` scheme. That CORS-mode `<img>` loads work there is unverified. Check it during the cross-platform pass.
- **M10, out-of-scope selection from the inspector (`app/src/views/galaxy.ts:113`).** Inspector rows can select an out-of-scope (dim) neighbour, which the canvas never allows; edges then vanish. Fix: filter the rows with `s.inScope(r.id)`, or render them as non-buttons.
- **M11, no fit after the library empties and refills (`app/src/views/galaxy.ts:155`).** In the empty-library branch, `fitOnEnd` and `centredOnce` are not re-armed. When references return without a reset, the new cold layout never fits. Fix: set `fitOnEnd = true; centredOnce = false;` in that branch.

### Notes on the other checks
- **Worker lifecycle:**
  - `destroy()` posts `stop`, then `terminate()`, aborts the listeners, and destroys the scene ✅.
  - The worker abandons superseded runs through its `run` counter ✅.
  - The UI side is unguarded (I1), and there is no error path (M2).
- **Warm start:** this is correct for placed and new nodes. The ring drift is M6 ⚠️.
- **Determinism:** the seeded LCG, the FNV hash and a fixed node order. Float32 positions round-trip deterministically ✅.
- **NaN guards:** the output is clamped, and there are tests for 0, 1 and 3 nodes. `Math.max(NODE, ...)` keeps r > 0 ✅.
- **Selection survival:**
  - It is kept across warm changes, and the neighbours are refetched and guarded by version ✅.
  - It clears on delete and on reset ✅. The delete test is weak (M1).
- **Tests:**
  - The force tests are real, and so are most of the view tests.
  - The weak ones are `superseded_layout_cannot_spend_the_fit` (I1) and `deleted_selection_clears` (M1).
  - `force.worker.ts` itself has no test. Its logic is thin, so that is acceptable.
- **YAGNI:** fine. The `createForce` stepper is used by both the worker and the tests, and the dev hook follows the existing `__horusTex` precedent.
- **Naming:** clear and consistent with the codebase (`centre`, `fitIfSettled`, `gen`/`mine`, `.gx-*`). Only the magic number in M7.
