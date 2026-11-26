# Task 5b report: the graph views and the board scope [R17]

**Status:** DONE. One commit on `p4-t5b`, on top of `41163c7`. Nothing is pushed or merged. I edited only `views/tree.ts`, `views/galaxy.ts` and their tests.

## Changes

The line numbers drifted after the fix wave, so here are the real spots.

### `tree.ts`

- **The `refused(id)` helper** is new: true for a reference node whose `refId` is not `inScope`.
  - `select()` now uses it. Behaviour is unchanged: a gone or out-of-scope id is refused, and `scene.select(sel)` restores the old selection.
- **T6 M2:** `render()` clears `sel` when the node is gone **or** `refused(sel)`. It then rebuilds the graph with nothing expanded, exactly as for a gone node, so the breadcrumb empties.
- **T6 M3:**
  - In `canvasKeys`, `move` steps past refused ids in the same direction: prev and next keep going.
  - A refused first child (`child`) walks on through `next` to its siblings.
  - `parent` can never land on a reference.
  - The loop is bounded by the node count.

### `galaxy.ts`

- **T7 M10:**
  - `renderInsp` filters the neighbour rows by `s.inScope(r.id)`.
  - `select(id)` refuses an out-of-scope id: it keeps `selected` and re-asserts it on the scene. It makes no `related` call and draws no edges.
  - The inspector row click and the scene's `select` both go through `select()`.

## Tests (one per item, as the brief asks)

| Test | Proves |
|---|---|
| `tree.test.ts` "a selected reference that falls out of scope is deselected (T6 M2)" | With `ref:chiaroscuro:a` selected, a snapshot whose `inScope` excludes `a` clears the selection and the breadcrumb's reference cell |
| `tree.test.ts` "arrow keys step over an out-of-scope reference…" (T6 M3) | With refs a, b and d under Chiaroscuro and b out of scope: from a, ArrowRight goes to d and ArrowLeft back to a. With a out of scope, ArrowDown from the technique goes to b |
| `galaxy.test.ts` "the inspector lists no out-of-scope neighbour, and select of one does nothing (T7 M10)" | With `related` returning b (out of scope) and c, only c is listed. A scene `select` of b keeps a: the last `scene.select` is a, the title is Plate a, and no extra `related` call is made |

**Red first:** all 3 tests failed against the old code (`[b, c]` listed; the selection kept; the arrow stopped on a). They pass now.

## Checks

| Check | Result |
|---|---|
| `tsc` | clean |
| vitest | **526** passed (523 + 3), 40 files |
| `npm run build` | exit 0 |

## Follow-up: the Galaxy and the Radial (controller's ruling)

**Commit:** `4cbaf85` on `p4-t5b`. Only `galaxy.ts`, `radial.ts` and their tests changed.

**Changes:**
- **Galaxy:** `refresh()` now clears a selection that is deleted **or** `!s.inScope(selected)`, through `select(null)`. The title, the neighbour rows and the edges therefore go after a scope change.
- **Radial, selection:** a new `refused(id)` helper checks for a reference node whose `refId` is not `inScope`, in `layout().g`. `render()` clears `sel` when the node is gone or refused.
- **Radial, arrows:** the arrows step past refused ids in the same direction, with the same rule as the Tree: `child` walks on through `next`. The loop is bounded by the ring's node count.
- **Radial, `select()`:** unchanged. It already refused out-of-scope references.

**Tests:** 3 new. All 3 failed on the old code (red first) and pass now.

| Test | Proves |
|---|---|
| `galaxy.test.ts` "a selection that falls out of the board scope clears…" | With a selected, a snapshot whose `inScope` excludes a removes the title, and the last `scene.select` is `null` |
| `radial.test.ts` "a selected reference that falls out of scope is deselected" | With `ref:forced-perspective:i2` selected, a scope without i2 clears the selection |
| `radial.test.ts` "arrow keys step over an out-of-scope reference to the next in-scope one" | With i2, i3 and i4 under Forced perspective and i3 out of scope: from i2, ArrowRight goes to i4 and ArrowLeft back to i2 |

**Checks:**

| Check | Result |
|---|---|
| `tsc` | clean |
| vitest | **529** passed (526 + 3) |
| `npm run build` | exit 0 |
