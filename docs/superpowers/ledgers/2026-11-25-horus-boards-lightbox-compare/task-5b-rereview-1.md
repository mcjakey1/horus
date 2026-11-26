# Task 5b Re-review 1 (follow-up 8bbfde0..4cbaf85)

### Item Verdicts
- **Galaxy refresh() clears an out-of-scope selection, not only a deleted one** — ADDRESSED. `app/src/views/galaxy.ts:159` now reads `selected && (!s.refs.has(selected) || !s.inScope(selected))` and calls `select(null)`. `select()` (galaxy.ts:123-131) only does `scene.select`, `renderInsp` and `drawEdges`. It never touches `setCamera` or `fitAll`, so the camera stays where it was (Plan 3 RF3 holds). Test at `galaxy.test.ts:226-238`: without the fix `a` stays in `s.refs`, so `.gx-title` stays "Plate a" and the test fails.
- **Radial clears an out-of-scope selection; arrows step past out-of-scope refs in the same direction with a bounded loop** — ADDRESSED. 
  - Clearing: `radial.ts:170` adds `|| refused(sel)` after the rep remap. `render()` runs with `fitOnShow`, which is true only on reset or first show (radial.ts:262-269), so the clear does not refit the camera.
  - `refused()` (radial.ts:215-218) returns true only for `kind === "ref"`, so the centre (`op:`), branch and technique nodes are never refused.
  - Arrows (radial.ts:241-246): when `dir` is `child` the walk continues with `next`, otherwise it keeps the same direction. The loop stops when `next` is null, when `next` is not refused, or when the counter set to `ring.nodes.size` reaches 0. `move()` for prev/next (`graph/navigate.ts:29-32`) steps one index along a finite sibling list and returns null past the end.
  - All refs out of scope: the walk runs off the list, `next` becomes null, and the selection stays where it was. No hang.
  - Parent from a ref gives a tech, which is never refused, so the loop exits at once.
  - Tests at `radial.test.ts:202-220`: without the fix, test 1 keeps `i2` selected. In test 2, ArrowRight lands on refused `i3`, and `select` falls back to `scene.select(i2)`, so `lastSel` is `i2` instead of `i4`. Both tests fail without the fix.

Focused run: `vitest run src/views/galaxy.test.ts src/views/radial.test.ts` gave 2 files and 50/50 tests passing. `git diff --stat 8bbfde0..4cbaf85` matches the review diff (4 files, +48/-3).

### New Breakage in the Diff
None.

Two gaps, neither blocking (Minor):
- No test covers the "refused first child walks on through next" path (ArrowDown from a tech whose first ref is out of scope).
- No test covers the all-refused case. Both follow from the code as read.

### Verdict
**Fix round:** All items addressed, no new Critical/Important breakage.
