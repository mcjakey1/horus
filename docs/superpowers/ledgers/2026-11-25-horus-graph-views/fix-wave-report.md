# Plan 3 final-review fix wave: report

- **Implementer:** design-second-brain-4d (the single fix implementer).
- **Branch:** `p3-fix` in `.worktrees/p3-fix`.
  - Base: `4fa3547` (plan3-graph with T1–T11).
  - Head: `8ffd4f7`, 12 commits.
- **Source:** `final-review.md`, "The fix-wave list", items 1–13, plus the Important and Minor sections.
- **Date:** 2026-11-26.
- **Status:** DONE. All 13 items are done. Nothing is partial or skipped.

## Verification

| Check | Result |
|---|---|
| `npx vitest run` | 38 files, **461/461** pass. The base was 441, so 20 tests were added. |
| `npx tsc --noEmit` and `npm run build` (`tsc && vite build`) | Clean ("built in 1.71s"). The build prints Vite's "Some chunks are larger than 500 kB" warning. I did not compare it with a base build. |
| `cargo test` (on `3870d25`, the only commit that touches Rust) | `test result: ok. 207 passed; 0 failed; 2 ignored`, then `ok. 0 passed` (doc-tests) and `ok. 1 passed`. |
| `cargo clippy --all-targets -- -D warnings` | "Finished dev profile", no warnings. |
| Rust change | One `///` doc comment in `correlate.rs` (item 13). |
| `git diff 4fa3547..HEAD -- app/src` | No new `style="` and no new `pixi.js` import. |

**Mutation checks.** These tests were run against broken or base code, and each failed:
- **Base sweep.** With `frame.ts`, `layout-tree.ts`, `layout-radial.ts`, `tree.ts`, `radial.ts` and `styles.css` checked out at `4fa3547`, all 18 new or changed tests in `frame.test`, `layout-tree.test`, `layout-radial.test`, `tree.test` and `radial.test` failed. That covers items 1, 2, 3, 5, 7 and 10.
- **Single mutations:**
  - `labels_never_overlap`: rows set to 0, then the operation band dropped from `labelRows`.
  - The Radial chord tests: the old 64-unit arc.
  - The collide test: the old `NODE/2 + 4` radius.
  - The M3 test: the fix removed.
  - The orphan-technique test: the `path.op` guard removed.
- **Base versions of single files:**
  - `galaxy.ts` for the M4 and M5 tests.
  - `inspector.ts` for both M6 tests.
  - The delete-clear and run-id guards removed for both M7 Galaxy tests.
- **Not mutation-checked:**
  - `reveal_pans_only_when_outside`: it fails on base only because `reveal` doesn't exist.
  - The sole-link assert: it now fails when the button is missing, which `?? true` used to hide. I didn't remove `disabled` from the markup to check it.

The code was restored after every check, and a `git diff` of the touched files confirmed it.

## Per-item table

| # | Item | Status | Commit | Proving test(s) |
|---|---|---|---|---|
| 1 | Labels (I1: P3-1, P3-3, J2 in part) | Done | `54136e6` | `frame.test` "taxonomy nodes never become dots; references still do" and "labels hide below 8 screen px and are cut at 24 characters"; `layout-tree.test` `labels_never_overlap`; `layout-radial.test` `ring_labels_never_overlap` and the chord assert in "technique ring keeps its arc spacing…"; `tree.test` "labels are cut at 24 characters and staggered over 3 rows". QA re-shoots `e01` and `r02b`. |
| 2 | Radial ring 3 packed into rows (I2) | Done | `5c955e9` | `layout-radial.test` `ring3_packs_rows` (2,000 references: radius ≤ 2,200, every point on a row, pairwise ≥ 0.95·REF_ARC). `radial_rings` and `radial_ring3_only_this_operation` updated to "on one of ring 3's rows". |
| 3 | Enter starts a selection (I3) | Done | `35438a5` | `tree.test` "Enter with nothing selected selects the first operation"; `radial.test` "Enter with nothing selected selects the centre". Both also check the crumb. |
| 4 | Inspector crumb (I4) | Done | `35438a5` | `.insp > * { flex: none; }` in `styles.css`. No unit test, because jsdom has no layout. QA re-shoots T11's inspector at 1280×800. |
| 5 | Tree single-expanded block (I5) | Done | `b4392ca` | `layout-tree.test` `single_expanded_refs_form_a_block` (1,158 refs); `tree.test` "an expanded technique hangs its references from one joint…". |
| 6 | Camera follows the selection (I6) | Done | `a5fc1cc` | `camera.test` `reveal_pans_only_when_outside`. The `scene.ts` wiring is proven by QA only (R6). |
| 7 | At-rest contrast (I7, J1; accepted by the controller) | Done | `1099736` | `tree.test` "at rest, operation squares take their ink and other outlines --ink-3"; `radial.test` "at rest, the centre takes its ink…". `selected_path_coloured` updated. |
| 8 | Keys compound (M1, P3-4) | Done | `a5fc1cc` | No unit test (`scene.ts` is Pixi, R6). QA re-runs the P3-4 timing table. |
| 9 | Collide radius (M2, P3-5) | Done | `22c21f2` | `force.test` "a demo-sized library settles with no two cards overlapping" (50 refs, closest pair ≥ 0.95 × 2r). The README settle figures are marked as measured before the change. |
| 10 | Radial: active operation deleted (M3) | Done | `d3ad5ff` | `radial.test` "deleting the active operation moves to the busiest, refits and remembers it". |
| 11 | Galaxy: failed fetch not cached; refill refits (M4, M5) | Done | `23c4b19` | `galaxy.test` "a failed graph_edges is not cached as no edges" and "an emptied library fits again when it refills". |
| 12 | Inspector queue keys (M6) | Done | `52a96c2` | `inspector-edit.test` "a rename of another technique queued behind a pending one is not dropped" (the review's A/B test) and "an identical save already queued is dropped, and the field stays usable". |
| 1+ | Operation labels staggered too; orphan technique outline (from my self-check) | Done | `8ffd4f7` | `labels_never_overlap`, which now also covers the op band, with four new operations side by side; `tree.test` "a selected technique with no branch keeps its at-rest outline". |
| 13 | Vacuous tests and docs (M7, M8, T2 doc) | Done | `3870d25` | `galaxy.test` `deleted_selection_clears` and `superseded_layout_cannot_spend_the_fit` (both now fail when their guard is removed); `inspector-edit.test` sole-link button must exist and be disabled. Docs: the `correlate.rs` O(Σdf²) line, the `api.ts` `Scored = {` revert, the README PowerShell `VITE_PERF` line, and the `data.ts` Snapshot "live" comment. |

## What changed, per item

### 1. Labels
- **`frame.ts`:**
  - `planFrame` gives `op`, `branch` and `tech` nodes `"thumb"` at every scale. Only references become dots.
  - `labelShown(scale)` is `LABEL_FONT * scale >= LABEL_MIN_PX`, that is 13·s ≥ 8.
  - `clipLabel` cuts a label to 24 characters plus "…".
  - `SceneNode` (op/branch/tech) gains an optional `labelDy`.
- **`scene.ts`:**
  - `make()` keeps the taxonomy name's `Text` in `o.label` and adds `labelDy` to its y.
  - `update()` sets `o.label.visible = labelShown(cam.scale)` after the label-node `continue`.
  - The only other use of `o.label` is the label kind, which never reaches that line.
- **`layout-tree.ts`:** `labelRows(g, p)` gives rank % 3 by x within each band: operation, branch and technique.
  - The operation band was added in `8ffd4f7`. The review named branch and technique only, but an operation with no branches, or with one branch of one technique, is one `GAP` (64) wide. So new operations side by side clashed; QA's "take the count to 9" builds exactly that.
- **`tree.ts`:** every taxonomy node carries `labelDy = row · LABEL_ROW`. All labels go through `clipLabel`.
- **`layout-radial.ts`:**
  - `chordR(n) = n < 2 ? 0 : LABEL_W / (2·sin(π/n))`. The `n < 2` guard matters: a one-branch operation, which "+ New operation…" makes, would otherwise get a radius of about 7e17.
  - `r1 = max(BAND_GAP, chordR(branches))`.
  - `r2 = max(r1 + BAND_GAP, chordR(techs))`. This is the closed form of "the smallest r ≥ r1 + BAND_GAP with n·θ(r) ≤ TAU".
  - Techniques are placed with `onRing(…, r2, r2·θ(r2))`.
  - `TECH_ARC` is deleted.
  - A test covers the one-branch, one-technique case: radius 160 / 320.
- **`constants.ts`:** gains `GAP`, `ROW`, `REF_ARC`, `LABEL_CHARS`, `LABEL_W`, `LABEL_ROW`, `LABEL_FONT` and `LABEL_MIN_PX`. The Tree and Radial tests import them instead of keeping local copies.
- **`fixtures.test-util.ts`:** gains the review's box oracle (`labelBox`, `clashes`, `nameOf`).
  - Both overlap tests run on the seed.
  - Both also run on a synthetic taxonomy with 34-character names that the artist might type, so clipping and the 3-row stagger are exercised, not only the short seed names.
- **README:** the far-zoom row's Tree half is marked "re-check at QA".
- **J2 is fixed only in part, as ruled.** At the fitted Tree scale (about 0.28), `labelShown` hides all names. The squares and their operation ink now show. The label floor (semantic zoom) is Plan 6.

### 2. Radial ring 3
- Rows sit at `r3 + j·REF_ARC`, with `r3 = r2 + BAND_GAP` and capacity `floor(TAU·r_j / REF_ARC)`. The layout uses the fewest rows that hold every reference.
- References are dealt in wanted-angle order to the row with the lowest `count/cap`; ties go to the inner row. Each row is then placed with `onRing(…, r_j, REF_ARC)`.
- A row never exceeds its capacity. The least-full row is under 1 while references remain, so `onRing`'s gap is `REF_ARC / r`.
- The file header is rewritten, which also clears the stale T5 header minor.
- **Estimated from the seed taxonomy at 2,190 references** (computed, not measured in the app):
  - Differentiate: 17 rows, outer radius about 1,615.
  - Infer: about 1,613.
  - Group and Sequence: about 1,544.
- The README Radial row is marked "Re-measure at QA (ring 3 now on screen)".

### 3–4. Enter and the crumb
- **Tree:** `activate: () => { if (!sel) select(move(g, null, "child")); }`.
- **Radial:** `activate: () => { if (!sel) select(\`op:${op}\`); }`.
- With a selection, Enter is still the scene's.
- **CSS:** `.insp > * { flex: none; }`, straight after `.insp`. No `.insp` child relied on `flex: 1` or on shrinking.

### 5. Tree reference block
- `blockTech(g)` returns the one technique that has children, or null.
- When there is one, its references form a `ceil(√n)`-column block centred under it, at `x = tx + (k % cols − (cols−1)/2)·ROW` and `y = 3·BAND_GAP + floor(k/cols)·ROW`.
- Show all (several techniques with children) keeps one column per technique and its per-reference segments, which is deferred to Plan 6. The `tree.test` case checks that this still happens.
- **Connectors:**
  - One segment runs `tech → j:rf:<tech>` (a joint at `3·BAND_GAP − NODE`, below the label rows).
  - The selected reference alone gets an inked elbow, `j:rf → j:rs:<ref> → ref`.
- **Deviation:** the review says "one inked segment from the joint to the selected reference". I drew it as two orthogonal segments through a second joint. That keeps the Global Constraint anti-goal ("hairline orthogonal connectors"), and `selected_path_coloured`'s every-segment-horizontal-or-vertical assert still passes. The review's test reads "no `j:rf → ref` segment except to the selected reference", so `tree.test` asserts "no segment ends at a reference except `j:rs:<selected> → <selected>`".
- No existing test asserted a one-column `x` in single-expanded mode. The Show-all column tests (`show_all_columns`, `tree_bands_ordered`) build with `"all"` over several techniques and are unchanged.

### 6, 8. Camera
- **`camera.ts`:** `reveal(c, view, rect, margin = 0.05)` returns `c` itself when the rect is inside the view inset by 5%. Otherwise it returns a camera centred on the rect at the same scale.
- **`scene.ts` `select(id)`:** when the id differs from `selected` and the node exists, it computes `reveal(tween?.to ?? cam, …)` and calls `setCamera(c, true)` only if `c !== base`, so no needless tween starts.
- A re-render of the same selection never pans, and a pointer click never pans, because `selected` is set before the emit.
- **`onKey`:** `+`, `-` and the arrow pans compute from `base = tween?.to ?? cam`.
- No unit test reaches `scene.ts`, so QA walks past the view edge in all three views and re-runs P3-4.

### 7. At-rest contrast
- Operation squares (Tree) and the centre (Radial) always take `opInk(tax, opId).base`.
- Off-path branch and technique outlines use `OFF = var(--ink-3)`. `resolveColor` reads it, and it is defined in both themes (`styles.css:3`, `:24`).
- Connectors stay `HAIR = var(--line-2)`, so the "ink draws last" sort is unchanged.
- **Tree, `8ffd4f7`:** a selected technique with no parent branch has no path operation. It used to take `ink = HAIR` (fainter than at rest), and now keeps `--ink-3`.

### 9. Collide radius
- `COLLIDE_R = NODE·√½ + 2` (about 35.9) in `constants.ts`, used as `forceCollide(COLLIDE_R).iterations(2)`.
- The new test uses 50 references: five 8-cliques at scores 0.9, 0.7, 0.5, 0.3 and 0.15, chained at 0.1, plus 10 untagged. After 600 ticks it gets the closest pair at ≥ 0.95 × 2r. It fails with the old radius.
- The README settle cells are marked as measured before the radius change, to be re-measured at QA. No numbers were invented.

### 10–12
- **10:** `if (!exists(op)) { op = opSession = busiest(s); hovered = null; fit = true; }`. The test deletes the remembered `sequence` and checks the refit. It then undoes and remounts, and checks that the session holds `infer`, not the deleted id.
- **11:** a rejected `graphEdges` resolves to `null`. Then `edgesVersion`, `edgesFetched`, `byRef` and `allEdges` are left alone, and the layout still starts with the previous edges. The empty-library branch re-arms `fitOnEnd = true; centredOnce = false`.
  - The M4 test re-sends the **same version** after the failure, so it fails if the failure was cached.
- **12:** `run(name, …)` keys on `${target?.kind}:${target?.id}:${name}`. The name and definition callers add the value (`field:${field}:${v}`, `description:${v}`). The ink, icon, `syn-del`, link, unlink, branch, `del` and form keys are unchanged, so they get the target prefix only.
  - In `inline` `commit`, a `false` result without `fieldErr` (a dropped duplicate, or the read-only path) resets `busy` and `data-saving`.
  - The A/B test commits B with Enter before A resolves, so A's `leave()` cannot blur a field that is still being edited. The stale-closure behaviour (T10 M-c) stays deferred.

### 13
- **`galaxy.test` `deleted_selection_clears`:** re-adds `a` in a second change, then asserts no `.gx-title`, a last fake `select` of `null`, and no edges.
- **`galaxy.test` superseded:** the new library is `["a", "b", "x"]`, sharing `a` and `b` with the old one.
- **`inspector-edit.test`:** the sole-link `×` must exist (`not.toBeNull()`) and be disabled. The UI does render it, disabled, with the title "A technique needs at least one place". No fixture change was needed.
- **Docs:**
  - `correlate.rs`: the cost is O(Σ df²), and the measured Zipf and head-heavy figures are taken from the README budget-test lines.
  - `api.ts:107`: `Scored = {` restored.
  - README: `$env:VITE_PERF=1; npm run tauri build -- --features perf --no-bundle`.
  - `data.ts`: Snapshot `refs` and `links` are documented as live (they are `store.refs` and `store.links`).

## Plan deltas to record in the ledger

These are recorded only here. I did not edit the plan or the ledger; that is for the controller.

1. **Task 8 (plan line 464: "radius 3·BAND_GAP, growing so the arc spacing stays at least NODE + 8"):**
   - Ring 3 is now a band of concentric rows starting at `r2 + BAND_GAP`, REF_ARC apart.
   - Rings 1 and 2 are sized by the chord a `LABEL_W = 184` label needs, so they are no longer fixed at `BAND_GAP` and `2·BAND_GAP`.
2. **Tasks 5 and 6 (one reference column per expanded technique):**
   - With one technique expanded (the default), its references form a square block hung from one joint, and only the selected reference is connected.
   - Show all keeps columns and is deferred to Plan 6.
   - The band spacing now carries a label rule: 3-row stagger, 24-character clip, `GAP · 3 ≥ LABEL_W`.
3. **Task 4 / Global Constraint dot rule, no wording change needed:** taxonomy squares never become dots; the constraint already says "a *reference* node".
4. **T6 M1 (accepted):** on-path branch and technique nodes keep their operation ink. The wording delta was ruled by the final review.

## For QA (no code)
- Re-shoot preqa `e01`, `r02b`, `t01`, `t02` and `t03`, and T11's inspector at 1280×800 (item 4).
- Re-check the Tree far-zoom row: only references become dots.
- Re-measure the Radial at 2,500 with ring 3 on screen (Differentiate is estimated at about 1,615 out).
- Re-measure the Galaxy settle at 2,500 with the new collide radius.
- Re-run P3-4 (fast `+`/`-`).
- Walk the selection past the view edge in all three views (item 6). This includes choosing a node from the inspector.
- Take the operation count to 9 and check Radial keys 1–9 (carried over from the review).

## Concerns
- **QA is the only proof for the `scene.ts` changes** (items 1, 6 and 8: the label `visible` toggle, `labelDy`, `reveal` in `select`, and compounding keys). That follows R6, and `tsc` is the only automated gate.
- **Labels at the fitted Tree are still hidden** (J2 floor deferred to Plan 6, as ruled). Squares and operation ink do show.
- **The selected reference's connector is an orthogonal elbow**, two segments through a second joint, rather than the review's single segment (see item 5).
- **Label widths use the review's estimate** of 7 world units a character. I did not measure the real Source Serif 4 13 px glyph widths. The 184-unit chord and the 192-unit row gap leave 9–17 units of slack over a 175-unit clipped label. A run of very wide capitals could exceed that; QA's screenshots are the check.
- **The plan deltas are not written into the plan or the ledger.** They are only in the section above.
- **No AGY self-check was run** in this wave. It was optional, so the AGY review is the controller's.
- **The unrelated `.impeccable/hook.cache.json`** in other worktrees was left alone, as before.
