# Task 5b review (41163c7..8bbfde0, branch p4-t5b)

**Verdict: Approved.** Minor follow-ups only. None of them blocks the merge.

### Spec Compliance
- ✅ **T6 M2:** `tree.ts:97` now clears `sel` when the node is gone **or** `refused(sel)`. `refused` is a ref whose `refId` is not `inScope`. `store.setScope` emits (`store.ts:77-79`), so the Tree re-renders and the clear runs on a scope change. It is the same path as Review Focus 3's "gone" case: the graph is rebuilt with nothing expanded, then `scene.select(null)`. The camera is not touched and no fit or NaN risk is added.
- ✅ **T6 M3:** the arrow handler (`tree.ts:217-219`) steps past refused ids in the same direction. ↓ onto a refused first child continues with "next" among the siblings. ↑ is never refused, because parents are ops, branches or techniques. It ends when `move` returns null at a sibling end (all siblings out of scope means no move). It is also capped at `g.nodes.size` steps. Each step moves the sibling index strictly, so the loop always ends.
- ✅ **T7 M10:** the Galaxy inspector rows are filtered by `s.inScope(r.id)` (`galaxy.ts:113`). `select()` refuses an out-of-scope id, puts the current selection back on the scene, and calls neither `related` nor `drawEdges` (`galaxy.ts:124`). `select(null)` still clears.
- ✅ **View state, not saved or undoable:** the diff changes no persistence or undo code. The scope is read live through `data.get().inScope`.
- ✅ **Keyboard reachability:** the Tree arrows now reach every in-scope ref instead of stopping at a dim one. The Galaxy arrows and Enter already use `nearest()`, which filters by `inScope`.
- ✅ **Links / R13 "Always shown":** not affected. Neither view shows user links. Galaxy edges and inspector rows are correlation scores (`graphEdges` and `related`), so filtering them by scope is what R13 wants: scored items are filtered, links are always shown.
- ✅ **Tests, one per bullet, as the brief asks:** all three fail on the base. M2: the dim ref stays a graph node, so `lastSel` would be the ref. M3: → stops on b. M10: b is listed, and the scene select would be "b". I ran them: `tree.test.ts` + `galaxy.test.ts` 48/48 pass, and `tsc --noEmit` is clean.
- ⚠️ Cannot verify from the diff: the full-suite 526/526 and the production build. I ran only the two focused files and tsc.

### Strengths
- Small and surgical: 4 files, +58/−6. A shared `refused(id)` helper takes out the duplicated check in `select()`.
- The M3 test covers all three directions, including the ↓-onto-refused-first-child case (with a different scope on version 2).
- Galaxy's `select()` guard is defence in depth. The scene never picks dim nodes (`frame.ts:77`), so hover and click on an out-of-scope node can't fire anyway. `drawEdges` also guards `inScope(focus)`. Edge drawing on hover of an out-of-scope node is not possible.

### Issues
#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)
1. **Galaxy keeps an out-of-scope selection after a scope change.** `refresh()` clears only a deleted selection (`galaxy.ts:159`: `!s.refs.has(selected)`). After "Show only this board" drops the selected ref, the inspector still shows its title and "Open in Reference view". It shows no neighbours and no edges. This is the Galaxy version of T6 M2, but the M10 text does not ask for it. Suggested follow-up: `|| !s.inScope(selected)` on that line, plus a test.
2. **Radial (out of scope, noted as asked).** It has both Tree gaps that this task closes. `radial.ts:170` clears `sel` only when it is not placed, not when it is out of scope. `radial.ts:235-236` arrows stop on a refused ref and don't step past it. Log both with item 1 as a Plan 4 follow-up, so all three graph views behave the same.
3. When the selected ref leaves the scope, the Tree drops to no selection. It does not fall back to the ref's technique. This matches the existing "gone" behaviour and the brief's wording ("deselected"), so it needs no change. Revisit only if QA finds losing your place jarring.

### Assessment
**Task quality:** Approved
**Reasoning:** All three R17 items are built exactly as the brief describes, with tests that fail on the base and pass now, and tsc is clean. The arrow loop always ends, and the scope-clear reuses Plan 3's polite "gone" path. The remaining gaps are in Galaxy's scope-change clear and in Radial, and both are outside this task's wording.
