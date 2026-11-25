# Task 3 report: Canvas core (pure modules)

Status: DONE_WITH_CONCERNS (minor, for Task 4)
Worktree: `.worktrees/p3-t3`, branch `p3-t3`
Commits:
- `dc415a4` feat(graph): camera, culling grid, LOD and texture cache
- `176e677` test(graph): touch alone decides LRU eviction in lru_evicts_and_unloads

## What was implemented

All under `app/src/graph/`. None of it imports pixi.js, and there are no new dependencies.

- `constants.ts`: `K_EDGES = 8`, `DOT_PX = 10`, `TEX_CAP = 600`, `MIN_SCALE = 0.05`, `MAX_SCALE = 4`, `EDGE_W0 = 0.75`, `EDGE_W1 = 2.25`, `BAND_GAP = 160`, `NODE = 48`, `MAX_OPS = 9`. The values come from the plan's Global Constraints (P:56-98) and preflight **C4**, which added `MAX_OPS`; the brief does not list them. A comment notes that `MIN_SCORE` and `BRANCH_W` belong to Rust (`correlate.rs`).
- `camera.ts`: the `Rect` and `Camera` types, plus four functions.
  - `zoomAt` keeps the world point under the cursor fixed and clamps the scale to `[MIN_SCALE, MAX_SCALE]`.
  - `pan` moves the world with the drag.
  - `fit` centres the bounds with `pad = 40`. It guards against NaN: if the bounds are empty or the view is smaller than `2*pad`, the scale clamps instead of becoming NaN.
  - `viewRect` grows the view by `margin` (default 0.1) of its size on each side.
- `spatial.ts`: `SpatialGrid`, a uniform-grid index.
  - Each id stores its rect and an insertion sequence number, so `hit` returns the topmost match in O(bucket).
  - When a query spans more cells than there are rects (zoomed far out at `MIN_SCALE`), `query` scans the rects directly.
  - Re-inserting an id moves it to the top. Its old buckets go stale, but every lookup re-tests the current rect, so a stale entry never matches.
- `lod.ts`: `lodFor(worldSize, scale)` returns `"dot"` when `worldSize*scale < DOT_PX`, and `"thumb"` otherwise.
- `texcache.ts`: `TexCache<T>`, an LRU cache built on Map insertion order. `load` and `unload` are injected.
  - `get` returns the texture and touches it, or returns `"loading"` or `"failed"`. It calls the loader at most once per URL.
  - A failed load stays failed. A loader that throws synchronously also becomes `"failed"`, and `get` never throws (Review Focus 5).
  - When a load resolves and `live.size > cap`, the least recently used textures are unloaded until `live.size == cap`.
  - `size()` counts live textures only.

## Tests

Each module has a test file beside it: `camera.test.ts`, `spatial.test.ts`, `lod.test.ts` and `texcache.test.ts`. All the named tests from the brief are there:

| Module | Tests |
|---|---|
| Camera | `zoom_keeps_point_fixed` (200 seeded random cases, `toBeCloseTo(..., 9)`), `scale_clamped`, `fit_contains_bounds` (including empty bounds) |
| Spatial | `query_matches_bruteforce` (2,000 rects, 50 queries; every 10th query covers the whole world, so both the grid path and the scan path are tested), `hit_topmost` |
| LOD | `lod_threshold` |
| Texture cache | `lru_evicts_and_unloads`, `failed_is_sticky`, `loading_dedupes` |

Extra small tests: `pan`, the `viewRect` margin, `clear`, and a loader that throws synchronously.

A mutation check after the follow-up commit: with `touch` turned into a no-op, `lru_evicts_and_unloads` fails. Without `touch`, the test fails.

## TDD evidence

RED: `npx vitest run src/graph/` with the tests written and no modules. The failure is a module-resolution failure, not an assertion failure:
```
 FAIL  src/graph/texcache.test.ts [ src/graph/texcache.test.ts ]
Error: Cannot find module './texcache' imported from .../app/src/graph/texcache.test.ts
 Test Files  4 failed (4)
      Tests  no tests
```
GREEN: the same command after implementation:
```
 Test Files  4 passed (4)
      Tests  13 passed (13)
```
Full suite: `npm test` gives `Test Files 24 passed (24) / Tests 248 passed (248)`. `npx tsc --noEmit` is clean. The output has no warnings and no stderr.

## Files changed

The commits touch only these files:
- `app/src/graph/constants.ts`
- `app/src/graph/camera.ts` and `camera.test.ts`
- `app/src/graph/spatial.ts` and `spatial.test.ts`
- `app/src/graph/lod.ts` and `lod.test.ts`
- `app/src/graph/texcache.ts` and `texcache.test.ts`

## Self-review

- The signatures match the brief exactly. `Rect` lives in `camera.ts`; later tasks give no other home for it.
- The plan's Task 4 says `setNodes` "rebuilds the grid", which means `clear()` and then inserts. Stale buckets from re-inserting an id therefore never accumulate in practice. No test covers re-insert.
- The order of `query()` results differs between the grid path and the scan path. Task 4's `plan_frame_culls_and_lods` compares `visible` as a set, so this is fine, as long as nothing draws in `query` order.
- Review finding fixed: `lru_evicts_and_unloads` used to call `get("a")` before `touch("a")`, so it passed even if `touch` did nothing. Commit `176e677` fixed it.

## Concerns (for Task 4, not fixed here)

1. Plan P:393 says: "On `webglcontextrestored`, recreate textures from the cache's URLs." The brief's `TexCache` interface does not expose its URLs and has no `clear()` or `destroy()`. Task 4 will need a small addition, or it can drop the cache and build a new one.
2. A load that resolves after the scene is torn down still goes into the cache, and nothing ever unloads it. A teardown method would fix this. It is not in the interface (YAGNI for now).
3. If more than `cap` thumbnails are visible at once, each `get` of an evicted URL reloads it and evicts another one, so the cache churns. Task 4 should keep the visible set under `TEX_CAP`, or the LOD should prevent this.
4. `fit` cannot contain the bounds once the scale clamps at `MIN_SCALE`, because they are too large. The test covers only bounds that fit.

## Fix round 1

**Finding:** `texcache.ts` treated a loader that resolves `undefined` or `null` as a success. The texture never became live, so `get` started the load again on every call (every frame) and could later run `unload(undefined)`. This broke Review Focus 5.

**Change (commit `bd484cb` fix(graph): a texture loader that resolves nothing counts as failed):**
- `texcache.ts`: the fulfil handler now starts with `if (tex == null) { this.pending.set(url, "failed"); return; }`.
- `texcache.test.ts`: a new test, "a loader that resolves nothing counts as failed". It uses cap 1 and a loader that resolves `undefined`. It checks three things: `get` gives `"failed"`, the loader is called once, and `unload` is never called after a second URL loads.

`MIN_SCORE` was not changed, following the controller's ruling.

**RED:** I ran `npx vitest run src/graph/texcache.test.ts` before the fix:
```
     × a loader that resolves nothing counts as failed
AssertionError: expected 'loading' to be 'failed' // Object.is equality
      Tests  1 failed | 4 passed (5)
```
**GREEN:** I ran `npx vitest run src/graph/texcache.test.ts`, then `npx tsc --noEmit`:
```
 Test Files  1 passed (1)
      Tests  5 passed (5)
TSC_OK
```
`.impeccable/hook.cache.json` shows as modified in the worktree. I did not change it, and it was not committed.
