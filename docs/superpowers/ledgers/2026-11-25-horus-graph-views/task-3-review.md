# Task 3 review: Canvas core (pure modules)

Range: d7c52f5..176e677 (commits dc415a4, 176e677). Reviewed from the diff file; no suite re-run.

## Spec verdict: ❌ (one item, a one-line fix)

| Item | Status |
|---|---|
| Five files created under `app/src/graph/`, a test file beside camera, spatial, lod and texcache | ✅ |
| Signatures: `Rect`, `Camera`, `zoomAt`, `pan`, `fit` (pad 40), `viewRect` (margin 0.1), `SpatialGrid`, `Lod`, `lodFor`, `TexCache<T>` | ✅ match the brief exactly |
| The named tests are present: `zoom_keeps_point_fixed`, `scale_clamped`, `fit_contains_bounds`, `query_matches_bruteforce` (2,000 rects, 50 queries), `hit_topmost`, `lod_threshold`, `lru_evicts_and_unloads`, `failed_is_sticky`, `loading_dedupes` | ✅ |
| Scale clamp `[0.05, 4]` | ✅ `camera.ts:7`, and the test asserts the constant values |
| 10% culling margin | ✅ `viewRect` default `margin = 0.1` |
| `DOT_PX` LOD rule (dot when `< 10` px) | ✅ `lod.ts:7` |
| LRU with unload; failure remembered; nothing throws (Review Focus 5) | ✅ for a rejecting or throwing loader. See Important 1 for a loader that resolves empty. |
| No pixi.js import; jsdom-testable | ✅ |
| Constants: `K_EDGES`(8, plan:69), `DOT_PX`, `TEX_CAP`, `MIN_SCALE`, `MAX_SCALE`, `EDGE_W0`, `EDGE_W1`, `BAND_GAP`, `NODE`, `MAX_OPS` | ✅ |
| Constants: `MIN_SCORE = 0.05` | ❌ **Missing.** The binding constraint lists it. The implementer left it out on purpose (`constants.ts:2`: "live in Rust"). |
| Commit message `feat(graph): camera, culling grid, LOD and texture cache` | ✅ (dc415a4), plus a test-only follow-up |
| Extra | Small tests for `pan`, `viewRect` margin, `clear` and a sync-throwing loader. These are fine, and none is scope creep. |

## Quality verdict: Needs fixes (one Important)

## Findings

### Important 1: a loader that resolves `undefined`/`null` is retried every frame (Review Focus 5)
- `app/src/graph/texcache.ts:16` and `:26-34`.
- **Problem.** The fulfil handler stores whatever the loader resolves.
  - If that value is `undefined`, `live.get(url)` returns `undefined`. `get` then treats the URL as never seen, and since `pending` was already deleted, it calls `load` again on every `get`, which means every frame.
  - `live.size` also counts the empty entry, and eviction later calls `unload(undefined)`. A renderer `unload` such as `t.destroy()` would throw at that point.
  - `Promise<T>` with `T = Texture` does not stop this in practice, because Task 4's loader will probably wrap a `Promise<any>` API. I have not checked whether PixiJS `Assets.load` resolves null when no parser matches a URL ⚠️.
- **Fix.** At the start of the fulfil handler, add `if (tex == null) { this.pending.set(url, "failed"); return; }`, and add a test with `load = vi.fn(async () => undefined)` that asserts `"failed"` and `toHaveBeenCalledOnce()`.

### Important 2 (spec): `MIN_SCORE` is missing from `constants.ts`
- `app/src/graph/constants.ts:2`.
- **Problem.** The global constraint says "Also MAX_OPS = 9 and MIN_SCORE = 0.05". Rust applies the cut (`correlate.rs:12`), and no TS code reads it today. So the omission can be defended, but it is still a deviation from a binding constraint, made without the controller's sign-off.
- **Fix.** Either add `export const MIN_SCORE = 0.05; // mirrors correlate.rs, which applies it`, or have the controller strike it from the constraint. Don't leave it to the implementer's judgment.

### Minor 1: `fit` says "Never NaN", but non-finite bounds give NaN
- `app/src/graph/camera.ts:20-30`.
- **Problem.**
  - An empty node set reduced with `min`/`max` gives `x = Infinity`, `w = -Infinity`. The scale then clamps to `MIN_SCALE`, but `x = Infinity + -Infinity/2` is NaN.
  - Likewise, `zoomAt(c, sx, sy, NaN)` passes NaN through `clampScale`, because `Math.max(MIN, NaN)` is NaN.
- **Fix.** Either guard with `if (![bounds.x, bounds.y, bounds.w, bounds.h].every(Number.isFinite)) return { x: 0, y: 0, scale: 1 };`, or reduce the comment to "never NaN for finite bounds" and let Task 4 skip `fit` when there are no nodes.

### Minor 2: the two query paths return results in different orders
- `app/src/graph/spatial.ts:39` versus `:44`.
- **Problem.** The scan path returns ids in insertion order, and the grid path returns them in bucket order. If Task 4 draws in `query` order, the z-order on screen will not match `hit`'s "topmost by insertion" except when zoomed far out.
- **Fix.** Return `[...out].sort((a, b) => seq(a) - seq(b))`, or add a JSDoc line saying "unordered; sort by insertion before drawing". The implementer flagged this; it needs a decision, not a note.

### Minor 3: misleading name `pending`
- `app/src/graph/texcache.ts:7`.
- **Problem.** The map also holds the terminal state `"failed"`.
- **Fix.** Rename it `status` (or `state`).

### Minor 4: test gaps
- `app/src/graph/spatial.test.ts:6`.
  - **Problem.** The brute-force oracle copies the implementation's `overlaps` predicate, so the strict-edge rule is never pinned independently. A rect touching the query edge is excluded, while `hit` is inclusive.
  - **Fix.** Add one touching-edge case and one re-insert case (`insert("a")` twice, then `hit` and `query`, to show stale buckets never match and don't duplicate).
- `app/src/graph/texcache.test.ts`.
  - **Problem.** Nothing shows that `get` on a live URL also refreshes its LRU position.
  - **Fix.** Add one assertion.

### Minor 5: eviction can unload a texture that is still on screen; in-flight loads are unbounded
- `app/src/graph/texcache.ts:28-32`.
- **Problem.**
  - Eviction runs asynchronously on each resolve. If more than `cap` thumbs are visible, it unloads textures that visible sprites still hold, so a destroyed texture gets drawn. The implementer's concern 3 is the churn side of the same issue.
  - Separately, `"loading"` entries are not capped, so a jump to thumb LOD over thousands of nodes starts thousands of decodes at once.
- **Fix.** Neither is a Task 3 contract change. Carry both into Task 4's brief: the visible thumb set must stay under `TEX_CAP`, and Task 4 should consider a load queue.

## Checked and fine
- `zoomAt` keeps the point fixed under clamping too. The random scales (0.1–2.1) × factors (0.5–2) reach both bounds.
- `fit` handles a zero-size view or one smaller than `2*pad` through `Math.max(1, …)`, and zero-size bounds (`w = 0` gives `Infinity`, which clamps to `MAX_SCALE`).
- Grid with NaN or infinite query rects: NaN spans skip the loops, and an infinite span takes the scan path. Neither hangs.
- The scan-path threshold is justified. At `MIN_SCALE` a 1920 px view covers roughly 200k cells of 64.
- LRU: deleting from a Map while iterating it is well defined in JS. Eviction stops at `size == cap`. `touch` on an unknown or loading URL does nothing.
- The sync throw is caught by the executor (`new Promise(resolve => resolve(load(url)))`), and `get` never throws.
- YAGNI: nothing speculative. Naming is clear apart from Minor 3.
