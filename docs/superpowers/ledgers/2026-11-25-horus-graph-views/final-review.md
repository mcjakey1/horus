# Plan 3 (Graph Views): final whole-branch review

- **Range:** `d7c52f5..4fa3547` (plan3-graph), read-only.
- **Reviewer:** final review before QA and merge.
- **Date:** 2026-11-26.
- **Inputs:**
  - `final-review.diff`, the code-only package;
  - the plan (header, Global Constraints, Review Focus, Decisions, and the Task 5, 8, 9 and 10 text where needed);
  - `final-review-inputs.md`;
  - `preqa.md`;
  - `task-10-*` and `task-11-*` in this folder;
  - `task-4…8-review.md` in `docs/superpowers/ledgers/2026-11-25-horus-graph-views/`. They are not in this folder, but the T4–T8 minors were triaged from the originals.

## Passes done

1. **Rust.**
   - `commands.rs`: the Plan 3 section (`graph_edges`, `commit_counted` with the R13 check, `Plan`, `rekey_branch`, `drop_branches`, `move_tags` and the 11 taxonomy commands).
   - `correlate.rs` `graph_edges`.
   - `edit.rs`: the new variants and the `insert` / `found` / `update` helpers.
   - `lib.rs`, the `perf` gate, `saver.rs`, and `taxonomy.rs` (`validate` is structural only).
   - Tests read: the Review Focus 4 undo tests (`delete_moves_tags_and_undo_restores`, `delete_to_partial`, `unlink_with_move_undo_restores`, `rekey_turns_stale_tags_partial`), the read-only R17 test, and the brute-force graph test.
2. **IPC and wiring.** `api.ts`, `api.contract.test.ts`, the two `Api` fakes, `data.ts`, `views.ts`, `firstrun.ts` `boot()`, `main.ts`, and `reference/view.ts` (R5).
3. **The `graph/` modules.** `camera`, `constants`, `frame`, `scene`, `force`, `layout-tree`, `layout-radial` and `navigate`. I skimmed `texcache`, `spatial`, `lod` and `taxgraph`; their behaviour was confirmed by the T3 and T5 reviews and by pre-QA RF5.
4. **Views.** `tree.ts`, `radial.ts`, `galaxy.ts`, `inspector.ts` (in full) and `move-tags.ts`. I spot-read the tests: `galaxy.test` (the deleted-selection and superseded-run tests) and `inspector-edit.test:210`.
5. **Styles and docs.** The `styles.css` diff, the DESIGN.md extra inks, and the README Performance check.

**Not read line by line:**
- `technique-form.ts`, `scene-demo.ts`, `force.worker.ts`;
- most of the `tree`, `radial` and `inspector-edit` test bodies;
- `plan3-perf.js` and `make_perf_library.py`;
- the Rust test bodies beyond those named above.

## Strengths

- **Rust core is solid and well guarded.**
  - `graph_edges` is a correct inverted index with per-vector norms built once. It ranks `(score desc, id asc)` deterministically, and a seeded brute-force oracle with permuted ids pins it.
  - The command clones `visible()` under the lock and scores outside it, on an async command (R1, R2).
  - Every taxonomy edit goes through one `commit`. That gives one read-only check and one undo step, and adds the R13 "no new `validate()` problems" guard with rollback through the inverse. `validate()` messages are keyed by id with no counts, so the string diff is sound.
  - The `Plan` builder emits removals per collection in descending order, so the reversed inverse re-inserts in ascending order. Undo tests compare whole-state snapshots, not single fields.
- **The I1 ruling is implemented cleanly.** During a re-key, dangling tags become partial inside the same undo step, `madePartial` reaches the UI, and the UI explains it.
- **Pixi isolation holds (R6, B4).**
  - Only `scene.ts` imports `pixi.js`, as a type import plus a dynamic `import()`.
  - `pixi.js/unsafe-eval` is imported before init, and `preference: ["webgl"]` is used.
  - No test imports Pixi. Every view takes `makeScene` and `makeWorker`.
- **Review Focus 1, 2, 3 and 5 pass in the real release exe** (pre-QA):
  - the WebGL fallback and context restore;
  - the empty and untagged libraries;
  - warm start, selection kept across a change, deleted selection cleared, library-switch refit;
  - a missing thumbnail is requested once.
- **The other Global Constraints hold:**
  - no new inline `style=` (grep is clean in `views/` and `graph/`; all geometry and ink go through the CSSOM);
  - opInk everywhere, and the Galaxy edges are neutral `--ink-2`;
  - culling with a 10% margin, `TEX_CAP` enforced in `planFrame` so eviction never hits an on-screen texture, `DOT_PX`, and the camera clamp;
  - IPC camelCase keys, contract rows for all 12 new commands, and both `Api` fakes complete.
- **Copy matches the plan where the plan quotes it.**
  - The move dialogs match Task 10's quoted copy: "N references use …", "Move them to…", "Keep them as partial tags (operation only)", "Move and delete" / "Move and unlink", "Delete them and their tags", "Delete; tags become partial" and the counts line.
  - So do "That name is taken by <Name>.", Plan 2's read-only sentence, and the "Up to 9 operations" title.
  - The other `FIXED` refusal sentences (EmptyName, BadMoveTarget, NeedsMove, LastLink and so on) are implementer-written. The plan quotes none of them, and the T9 ruling accepted them pending review. They go to the Plan 6 copy pass.
  - `sayError` never shows raw text: unknown strings become "That change didn't save. Try again."
- **The shell (B2) is a small, clean lazy-mount registry.**
  - `boot()` wires every view.
  - Search from any view switches to the Reference view first (R5, tested).
- **The T11 measurements are honest.** The README discloses its own gaps ("zoom-in not measured", "Radial: 0 textures"), and that disclosure is what let this review find I2.

## Issues

### Critical (Must Fix)

None. No data loss, security hole or crash path was found.
- The CSP is unchanged.
- The `perf` asset-scope override is compiled only with `--features perf`.
- Undo restores positions exactly.

### Important (Should Fix)

**I1: Canvas labels are unreadable in the Tree and Radial (P3-1, P3-3, J2: one cause)**
- **Where:**
  - `graph/layout-tree.ts:9` (`GAP = NODE + 16 = 64`);
  - `graph/layout-radial.ts:9` (`TECH_ARC = 64`);
  - `graph/scene.ts:250-253`, where the label is a 13-world-unit `PIXI.Text` inside `body`;
  - `graph/frame.ts:94` (`lodFor` applies to op, branch and technique nodes too);
  - `scene.ts:320-323`, where `body` is hidden under the dot LOD.
- **What's wrong:**
  - Labels scale with the world, so neighbours that overlap at one zoom overlap at every zoom. 40 of the 48 seed names are wider than 64.
  - Branch (domain) labels have the same problem: a one-technique branch slot is 64 wide.
  - Because labels live in `body`, they disappear entirely below scale 0.5 (techniques) or 0.36 (operations). The fitted Tree (scale ≈ 0.28) is therefore dots only (J2).
  - Simply widening `GAP` would push the fit scale lower and make J2 worse.
- **Why it matters:** the Tree is the view for learning and (since T10) editing the system, and a reasonable artist cannot read it.
- **The fix (one coherent change):**
  1. **No dot LOD for taxonomy nodes.** In `frame.ts` `planFrame`, give `op`, `branch` and `tech` nodes `"thumb"` at every scale. The Global Constraint's dot rule says "A *reference* node smaller than `DOT_PX`".
  2. **Labels hide when tiny.** Labels stay at 13 world units but hide below 8 screen px. Add a pure `labelShown(scale)` (`13 * scale >= 8`) in `frame.ts`. `scene.ts` keeps a handle to the taxonomy node's `Text` (`o.label`) and sets `visible` on each `update()`.
  3. **Stagger the Tree's labels.** Branch and technique labels are staggered over 3 rows by rank within their band. Add a pure helper in `layout-tree.ts` that returns `labelRow` (0, 1 or 2) per id from x order within each band. `SceneNode` (op/branch/tech) gains an optional `labelDy` in world units (`row * 18`), and `scene.ts make()` adds it to the label y.
  4. **Truncate canvas labels** to 24 characters plus "…". The full name stays in the inspector and crumb. With truncation, 3 × 64 = 192 ≥ 24 × 7 + 8, so the stagger holds for names the artist types.
  5. **Radial ring spacing is sized by chord, to fit the labels.** In `layout-radial.ts`, add `LABEL_W = 184`: a truncated label of 25 characters × 7 = 175, plus padding.
     - Neighbours on a ring of radius r need an angular gap of `θ(r) = 2·asin(LABEL_W / 2r)`.
     - Ring 1 radius: `max(BAND_GAP, LABEL_W / (2·sin(π/n)))` for its n evenly spaced branches.
     - Ring 2 radius: the smallest `r ≥ r1 + BAND_GAP` with `n·θ(r) ≤ TAU`. Place the techniques with `onRing(…, r2, r2·θ(r2))`, because `onRing` takes an arc length.
     - Ring 3 starts at `r2 + BAND_GAP` (see I2).
  6. **Move the constants.** Put `GAP`, `ROW`, `LABEL_W`, `REF_ARC` and the 18-unit label row into `constants.ts`, the one home for the graph views' tuning constants.
- **Side effect to record:**
  - Taxonomy squares stay drawn at far zoom, so the README's "Far zoom shows only dots (Galaxy, Tree)" row holds only for references in the Tree. Mark that row "re-check at QA". No plan delta is needed: the Global Constraint already says "a *reference* node".
  - The existing `frame.test` far-zoom assert (`frame.test.ts:50`) uses reference nodes only, so it stays valid.
- **J2 is fixed only in part:**
  - At the fitted scale (about 0.28), `labelShown` still hides every label. The fitted Tree then shows squares (with operation ink if I7 is taken) but no names.
  - A screen-size floor for the operation labels (semantic zoom) is DEFERRED to the Plan 6 design pass. Until then, the artist zooms or uses the inspector's Operations list to read names.
- **Tests that prove it:**
  - `frame.test`: a `tech` node of size 20 at scale 0.1 plans `"thumb"`, while a `ref` at the same scale plans `"dot"`; `labelShown(0.5) === false` and `labelShown(1) === true`.
  - `layout-tree.test`, `labels_never_overlap`: on the seed taxonomy, using estimated label boxes (width `7 × min(len, 25)`, height 18, at `y + size/2 + 4 + row·18`), no two technique boxes and no two branch boxes intersect.
  - `layout-radial.test`, `ring_labels_never_overlap`: the same box oracle at each node's position, for every seed operation. No two ring-1 boxes and no two ring-2 boxes intersect.
  - `tree.test`: `setNodes` carries `labelDy` and truncated labels.
  - QA re-shoots preqa `e01` and `r02b`.

**I2: The Radial's ring 3 is a single ring that grows linearly, so the Radial is unusable at the plan's scale (T11 "30 px wheel")**
- **Where:** `graph/layout-radial.ts:76` (`r3 = max(3·BAND_GAP, n·REF_ARC/TAU)`).
- **What's wrong:**
  - With 2,190 references, r3 ≈ 19,500 world units. `fitAll` needs scale 0.018, which clamps to 0.05.
  - So the fitted wheel is about 32 px, ring 3 is entirely off-screen, and "0 fits" cannot contain the view.
  - This is why T11's Radial row shows 0 textures: references on the Radial were never measured at 2,500. The plan's Goal ("pan and zoom smoothly at 2,000+ references") and its Task 11 row ("the Radial for the busiest operation … pan at ≥ 55 fps") are therefore unverified.
  - This is a **plan defect** (Task 8, line 464: "radius 3·BAND_GAP, growing so the arc spacing stays at least NODE + 8").
- **The fix:** pack ring 3 into concentric rows.
  1. Row j has radius `r3₀ + j·REF_ARC`, where `r3₀ = r2 + BAND_GAP`, and capacity `floor(TAU·r_j / REF_ARC)`.
  2. Take the fewest rows whose capacities sum to at least n.
  3. Sort the references by their wanted (mean) angle.
  4. Deal each reference, in angle order, to the row with the lowest fill ratio `count/cap` (ties go to the inner row).
  5. Place each row with `onRing(itsAngles, r_j, REF_ARC)`.
  6. Update the file header (T5 minor: "every ref tagged with those techniques" is stale) and record the plan delta for line 464.
- **Result at 2,190:** about 19 rows, an outer radius of about 1,600, and a fit scale of about 0.2.
- **Tests:**
  - `layout-radial.test`, `ring3_packs_rows`: an operation with 2,000 references in a synthetic library. Every reference point has radius ≤ 2,200, and every pair of distinct reference points is at least `0.95 × REF_ARC` apart (O(n²) is fine at n = 2,000).
  - Update `radial_rings` to "on one of ring 3's rows".
  - QA re-measures the Radial at 2,500 with ring 3 on screen, and the README row is marked "to re-measure".

**I3: In the Tree and Radial, Enter cannot start a selection from the canvas (P3-2, a Global Constraint)**
- **Where:** `views/tree.ts:191` and `views/radial.ts:231` (`activate: () => {}`).
- **What's wrong:**
  - With nothing selected, the scene does not handle Enter, so `canvasKeys` calls the view's `activate`, which is a no-op.
  - The constraint is that every canvas action is reachable from the keyboard. The Galaxy's identical gap was ruled in T7 (the constraint wins), so the views are inconsistent.
- **The fix:**
  - Tree: `activate: () => { if (!sel) select(move(g, null, "child")); }` (the first operation).
  - Radial: `activate: () => { if (!sel) select(\`op:${op}\`); }`.
  - The arrows keep panning while nothing is selected, as the Global Constraint says.
- **Tests:** in `tree.test` and `radial.test`, with nothing selected, an Enter keydown on the stage gives a fake-scene `select` of `op:<first>` (or `op:<current>`), and the inspector crumb names that operation.

**I4: The Tree and Radial inspector's breadcrumb collapses under its title (T11 note "title overlaps the sticky breadcrumb")**
- **Where:**
  - `styles.css:386`: `.insp` is a column flexbox with `overflow: auto`.
  - `styles.css:387`: `.insp-crumb` sets `min-height: 0`.
- **What's wrong:**
  - When the body is taller than the aside (a technique with many references, or the editing controls at 1280×800), flexbox shrinks the crumb, because it is a flex item with `flex-shrink: 1` and no minimum. Its grid content then overflows under the title.
  - This is a root-cause reading of the CSS, not yet confirmed in the app. Nothing is sticky; it only looks sticky.
- **The fix:** `.insp > * { flex: none; }`. The aside still scrolls as a whole.
- **Proof:** jsdom has no layout, so QA re-shoots T11's "Complementary pairing" inspector at 1280×800.

**I5: The Tree's reference band is one unbounded column (T11 "one tall column")**
- **Where:** `graph/layout-tree.ts:63-66` (`y = 3·BAND_GAP + k·ROW`).
- **What's wrong:**
  - In the default mode (one technique expanded, decision 3), a busy technique with 1,158 references is about 65,000 units tall.
  - "0 fits" clamps at 0.05 and cannot contain it. The fitted Tree becomes a thin line.
  - It is the same defect class as I2, at the same scale.
- **The fix:**
  - In `layoutTree`, when exactly one technique has children, lay its references out as a block centred under it: `cols = ceil(sqrt(n))`, `x = tx + (k % cols − (cols − 1)/2)·ROW`, `y = 3·BAND_GAP + floor(k / cols)·ROW`.
  - With "Show all references", keep one column per technique (there is no room between slots). That case is DEFERRED to Plan 6 (see the triage).
  - In `tree.ts:150-152`, replace the per-reference segments with one segment from the technique to a joint `j:rf:<tech>` above the block. Then add one inked segment from the joint to the selected reference only, so there is no fan of 1,000 diagonals.
  - **Plan delta:** this changes the Task 5 and Task 6 reference-column geometry. Update any existing `layout-tree` and `tree` test that asserts a one-column `x`, and record the change beside Task 8's ring-3 delta.
- **Tests:**
  - `layout-tree.test`, `single_expanded_refs_form_a_block`: 1,158 references under one technique give a height of at most `ceil(sqrt(1158))·ROW`, and no two reference nodes are closer than `ROW`.
  - `tree.test`: with a technique expanded, `setEdges` holds exactly one `tech → j:rf:<tech>` segment, and no `j:rf → ref` segment except to the selected reference.

**I6: The camera never follows a keyboard selection (P3-6)**
- **Where:** `graph/scene.ts:573-576` (`select`).
- **What's wrong:** arrow-walking the Tree, Radial or Galaxy can move the selection off-screen, and nothing brings it back. Choosing a node from the inspector has the same problem.
- **The fix:**
  - Add a pure `reveal(cam, view, rect, margin = 0.05): Camera` in `camera.ts`. It returns `cam` unchanged when `rect` lies inside the view inset by the margin; otherwise it returns a camera centred on the rect at the same scale.
  - In `scene.ts` `select(id)`, when `id` differs from the current `selected` and the node exists, call `setCamera(reveal(tween?.to ?? cam, view(), nodeRect(n)), true)`.
  - Re-rendering the same selection never pans. That keeps Review Focus 3 ("the view updates without resetting the camera"), and a pointer click never pans, because the scene sets `selected` before emitting.
- **Tests:** `camera.test`, `reveal_pans_only_when_outside`: inside gives the same object, and outside gives a camera whose view centre is the rect centre at the same scale. QA walks with ↓ / → past the edge.

**I7: At rest the Tree and Radial are near-invisible grey (J1)**
- **Where:** `views/tree.ts:21,112` and `views/radial.ts:23,191`.
- **What's wrong:**
  - Off-path operation squares, branch and technique outlines, and connectors all use `--line-2`. That is 1.57:1 against the canvas background in light and 1.61:1 in dark, under WCAG 1.4.11's 3:1 for graphics needed to read the view.
  - The plan's own Operation-Only Chroma list allows ink on operation nodes, so the all-grey look is a choice, not a constraint.
- **The fix:**
  - Operation squares are always filled with `opInk(tax, opId).base`.
  - Off-path branch and technique outlines use `var(--ink-3)` (4.6:1 in light, 6.5:1 in dark).
  - Connectors stay `--line-2`. They are DESIGN's structural rule, and the band position carries the hierarchy.
  - The controller may decline this. If so, record J1 as a DESIGN delta for Plan 6.
- **Test:** in `tree.test` and `radial.test`, at rest, op nodes carry their opInk base and an off-path tech node's colour is `var(--ink-3)`.

### Minor (Nice to Have)

- **M1: fast `+`/`-` presses don't compound (P3-4).**
  - Where: `scene.ts:479-480` and the arrow-pan at `:487`.
  - Fix: compute from `tween?.to ?? cam`.
  - Proof: QA's P3-4 timing table (six presses at a 0 ms gap give 0.262). No unit test: `scene.ts` is Pixi (R6).
- **M2: Galaxy tiles overlap (P3-5, and T11 at 2,500).**
  - Where: `force.ts:85`. The radius is `NODE/2 + 4 = 28`, but square 48-unit cards need `NODE·√½ ≈ 34`.
  - Fix: `forceCollide(NODE * Math.SQRT1_2 + 2).iterations(2)`, with the radius in `constants.ts`.
  - Test: `force.test` on a 50-reference demo-sized input checks that the minimum centre distance is ≥ 0.95 × 2r after settling.
  - The README settle numbers then go stale: mark them "before the radius change; re-measure at QA". The fix wave must not invent numbers.
- **M3: the Radial's active operation deleted (T8 M3).**
  - Where: `radial.ts:160`. The fallback doesn't refit, and `opSession` keeps the dead id.
  - Fix: `if (!exists(op)) { op = opSession = busiest(s); hovered = null; fit = true; }`.
  - Test: `radial.test`, delete the active operation in a change and assert that `fitAll` was called.
- **M4: a failed Galaxy edge fetch is cached (T7 M3).**
  - Where: `galaxy.ts:168-171`. It is cached as "no edges", so "Tag references to see them cluster." appears on what is really an error.
  - Fix: on catch, don't advance `edgesVersion` or set `edgesFetched`, and keep the previous `byRef`.
  - Test: `graphEdges` rejects, then no note shows, and the next change calls `graphEdges` again.
- **M5: the Galaxy doesn't fit when an emptied library refills (T7 M11).**
  - Where: `galaxy.ts:158-166`.
  - Fix: re-arm `fitOnEnd = true; centredOnce = false;` in the empty branch.
  - Test: empty, refill, finish, then `fitAll` is called.
- **M6: queued inspector edits can be silently dropped (T10 M-a and M1).**
  - Where: the `run()` keys at `inspector.ts:297-301` carry no target or value. A second, different edit with the same key while one is in flight (for example, renaming technique B while A's rename or a slow delete is queued) is dropped, and the inline field stays frozen (`busy` and `data-saving` are never reset: `:380-387`).
  - Fix:
    - `run()` prefixes every key with `${target?.kind}:${target?.id}:`.
    - Callers whose key lacks the value add it: `field:${field}:${v}` and `description:${v}`. The ink, icon, `syn-del`, `link` and `unlink` keys already carry theirs.
    - So only identical commands dedupe. The change-plus-blur pair on the same definition still shares one key.
    - In `inline` `commit`, when `run` resolves `false` without calling `fieldErr`, reset `busy` and remove `data-saving`.
  - Test: `inspector-edit.test`.
    1. Make A's `updateTechnique` an unresolved, controllable promise.
    2. Rename A, select B and rename B.
    3. Resolve A. The queue is serial, so B's call only starts after A's.
    4. Flush, then assert both calls were made, with their own ids and names.
- **M7: three tests that cannot fail.**
  - `galaxy.test.ts:208` `deleted_selection_clears` (T7 M1): after deleting, re-add `a` in a second change and assert `.gx-title` is absent and the last fake `select` is `null`.
  - `galaxy.test.ts:326` (T7 N1): use shared ids between the old and new library so the "late tick did not warm-start" assert can fail.
  - `inspector-edit.test.ts:210` (T10 M3): drop `?? true` and assert that the button exists and is disabled.
- **M8: docs and nits.**
  - `correlate.rs` `graph_edges` doc: add the O(Σdf²) worst case and the T11 head-heavy measurement (T1 minor).
  - `api.ts:102`: revert the stray reformat `Scored ={` (T9 minor).
  - README: add the PowerShell form `$env:VITE_PERF=1; npm run tauri build -- --features perf --no-bundle` (T11 minor).
- **M9: file growth (ruling requested).**
  - `commands.rs` production code is about 1,835 lines (the Plan 3 taxonomy section is about 650 of them), `edit.rs` production is about 815, and `inspector.ts` is 559 (`renderInspector` is about 445 lines with its closures).
  - Ruling: **no split in this fix wave.** Pure moves just before QA add merge risk and no behaviour.
  - Split `commands.rs`'s taxonomy-edit commands and `Plan`/`rekey_branch` into `commands/taxonomy_edit.rs` as the first step of Plan 4, before more commands land.
  - Extract `wireInspectorEdit` from `inspector.ts` in the Plan 6 a11y pass, or whenever it is next touched.
  - `edit.rs` can stay as it is.

## Triage of deferred minors and pre-QA items

| Item | Verdict | Reason |
|---|---|---|
| **P3-1** Tree technique labels overlap | **MUST-FIX** (I1) | Unreadable Tree; already ruled must-fix |
| **P3-2** Tree/Radial Enter can't start a selection | **MUST-FIX** (I3) | Global Constraint; consistency with the T7 ruling; 2 lines |
| **P3-3** Radial ring labels collide | **MUST-FIX** (I1.5) | Same cause as P3-1 |
| **P3-4** `+`/`-` don't compound | FIX-IF-CHEAP (M1) | One expression |
| **P3-5** Galaxy collide radius | FIX-IF-CHEAP (M2) | One number; settle re-measured at QA |
| **P3-6** Camera doesn't follow the selection | FIX-IF-CHEAP (I6) | Shared fix in `scene.select` plus a pure `reveal`; strongly recommended |
| **J1** Off-path `--line-2` at 1.57:1 | FIX-IF-CHEAP (I7) | Operation ink at rest is allowed; the controller may decline and route it to Plan 6 |
| **J2** Tree at fit is dots only | **MUST-FIX in part** (I1.1–I1.2); the label floor is DEFERRED to Plan 6 (semantic zoom) | Squares and operation ink show at fit; names still need a zoom or the inspector |
| **J3** Missing thumbnail is a bare 3 px dot | DEFER (Plan 6 design pass) | RF5 text says "falls back to a dot". Suggest keeping the N5 card without a sprite (Constant Card Rule); needs a plan delta |
| T11: inspector title overlaps the breadcrumb | **MUST-FIX** (I4) | One CSS rule |
| T11: Tree references band is one tall column | **MUST-FIX** (I5) for one expanded technique; DEFER "Show all" to Plan 6 | The default mode can't be fitted at 2,500 |
| T11: Radial fitted wheel about 30 px | **MUST-FIX** (I2) | Ring 3 unbounded; the Radial is unverified at 2,500 |
| T11: run counts under-claim; run 1 has no screenshots; a428343 body; responsiveness threshold self-chosen; zoomed-in row cap-bound; peak-tex per window | DEFER (none; README stays as disclosed) | Documentation honesty is already adequate |
| T11: `VITE_PERF=1` POSIX syntax on Windows | FIX-IF-CHEAP (M8) | One README line |
| T11 ruling: head-heavy budget margin about 9% | DEFER (Plan 6 perf, or when the ignored test flakes) | Ruled; j>i scoring is ready if needed |
| T11 ruling: "first layout" means first positions (settle 5.1 s) | DEFER (controller and user) | Declined to judge (see below) |
| T1: doc comment hides the O(Σdf²) worst case | FIX-IF-CHEAP (M8) | One doc line |
| T1: each pair scored twice | DEFER (Plan 6 perf) | Within budget |
| T1: `vi.fn()` fakes return undefined | DEFER (none) | The fakes are never called on those paths |
| T2: Snapshot doc should say refs and links are live | FIX-IF-CHEAP (one comment, optional) | Views key on `version`; documents the trap |
| T2: views.test comment mismatch, `still` no-op naming, `./data` import order, `open_reference` order assert | DEFER (none) | Cosmetic |
| T3: fit NaN on non-finite bounds | DEFER (none) | `fitAll` guards empty; positions are finite-clamped |
| T3: grid vs scan order; `pending` name; oracle reuses overlaps; no re-insert/LRU-refresh test; vacuous unload assert | DEFER (Plan 6 test hygiene) | Behaviour confirmed by RF5 in the real app |
| T4 M1: `resolveColor` greys unknown tokens | DEFER (Plan 6) | `opInk` only emits known tokens; `inks.test` covers them |
| T4 M2: `setCamera` doesn't clamp | DEFER (none) | Every producer (`zoomAt`, `fit`, `pan`, `reveal`) keeps the clamp |
| T4 M3: key presses undershoot | = P3-4 (FIX-IF-CHEAP) | |
| T4 M4: `app` leaks if init throws | DEFER (Plan 6) | Rare path, after which the view shows the fallback |
| T4 M5: `setNodes` teardown | Closed | `sameLook` reuse landed in T7 |
| T4 M6: dev-harness CSS ships | DEFER (Plan 6) | Two dead rules |
| T4 M7: Pixi EventSystem walks the stage; M8: idle rendering | DEFER (Plan 6 perf/battery) | Measured fps is fine; `eventMode = "none"` is a one-liner later |
| T4 M9: no key clears the selection | Closed | Esc clears in all three views |
| T4 M10: `urls()`/`evict()` unused | DEFER (none) | Carry-in asked for them |
| T4 M11: cancel-rule guarantee has no unit test | DEFER (Plan 6 test hygiene) | Peak 600 textures held at 2,500 (T11) |
| T4: `destroy()` while lost leaves the fallback paragraph | Closed | Every view's `destroy` does `host.replaceChildren()` |
| T5 M1/M2: tautological tree-test asserts | DEFER (Plan 6 test hygiene) | I1 and I5 add real geometry tests to the same file |
| T5 M3: no 9-operation test | DEFER (QA): QA adds operations up to 9 and checks Radial keys 1–9 and the wrapped switch | Covered by the T10 UI and QA |
| T5 M4: `via.branchId ""` for a branchless tag | DEFER (Plan 6 integrity check) | Only dangling data produces it |
| T5 M5: no zero-technique branch test | DEFER (Plan 6 test hygiene) | Layout guards `max(1, …)` |
| T5: `layout-radial` header stale | FIX (within I2) | Rewritten by I2 |
| T5: two tags on one branch merge into the first `via` | DEFER (none) | Cosmetic for outline state |
| T6 M1: on-path branch/technique nodes take operation ink | **Accept** (record a plan wording delta) | DESIGN.md: ink "about that operation"; the path is that operation's |
| T6 M2/M3, T8 M4, T7 M10: out-of-scope selection and dim refs | DEFER (Plan 4, board scope) | `inScope` is `() => true` until Plan 4 |
| T6 M4: Domain crumb cell not serif | DEFER (Plan 6 copy/type pass) | May mirror Plan 1 |
| T6 M5: tile buttons named by `title` only | DEFER (Plan 6 a11y) | `title` does give an accessible name |
| T6 M6: no Tree-level empty-library test | DEFER (Plan 6 test hygiene) | RF2 passed in the real app |
| T6 M7: about 110 empty `PIXI.Text` joints | DEFER (Plan 6 perf) | Tree pans at 130 fps at 2,500 |
| T6 N1: empty-state heading class; focus jumps after Show-all; title focus ring | DEFER (Plan 6 a11y) | |
| T7 M1: `deleted_selection_clears` can't fail | FIX-IF-CHEAP (M7) | Test only |
| T7 M2: no `worker.onerror` | DEFER (Plan 6) | Worker loading verified under the CSP; add a sentence later |
| T7 M3: failed fetch cached as "no edges" | FIX-IF-CHEAP (M4) | Wrong message to the artist |
| T7 M4/M5/M7: duplicate stop, `allEdges` placement, warm alpha magic number | DEFER (none) | Cosmetic |
| T7 M6: outer ring drift on warm starts | DEFER (Plan 6, measure first) | Unmeasured |
| T7 M8: draw vs pick order with overlap | DEFER (none) | Reduced by M2 |
| T7 M9: CORS image loads on macOS/Linux | DEFER (cross-platform pass, Plan 6) | No machine |
| T7 M11: no fit after the library empties and refills | FIX-IF-CHEAP (M5) | Two lines |
| T7 N1: superseded test uses non-overlapping ids | FIX-IF-CHEAP (M7) | Test only |
| T7 N2: reduced-motion keypress mid-layout selects an undrawn ref | DEFER (none) | Transient |
| T8 M1: Radial dead `sel === null` branch | DEFER (none) | Harmless; fakes reach it |
| T8 M2: hover replaces, not unions, the connectors | DEFER (Plan 6) | |
| T8 M3: deleted active op doesn't refit | FIX-IF-CHEAP (M3) | |
| T8 M5: the Radial crumb can name `parents[0]`'s operation, not the centre | DEFER (Plan 6): `InspectorOpts.opId` hint | Confusing but correct data |
| T8 M6/M7/M8: casts, weak assert, naming | DEFER (none) | |
| T8: ←/→ walk the other technique's list on a ref with two techniques | DEFER (Plan 6) | |
| T9: `link_technique`/`add_branch` leak raw `EditError` | DEFER (Plan 6 copy) | `sayError` already shows "That change didn't save. Try again."; no raw text reaches the artist |
| T9: taxonomy items reported as `UnknownTag` | DEFER (with the M9 split) | |
| T9: `api.ts:102` reformat | FIX-IF-CHEAP (M8) | |
| T9: redo tested on one batch only; `Plan` name collision | DEFER (Plan 4 split) | |
| T9: module split | DEFER (Plan 4 first step; ruling M9) | |
| T9 O3: op move refuses (InUse) when a tag's branch is gone | DEFER (Plan 6 integrity check) | `sayError` gives the O3 sentence |
| T9 N1: out-of-image region dropped on a partial re-key | DEFER (none) | Undo restores |
| T10 M1 + M-a: field freezes; edit with the same key dropped | FIX-IF-CHEAP (M6) | Silent loss of an artist's edit |
| T10 M-b: rejected tail skips the next command | Closed (verified) | `p` never rejects (both arms handled) |
| T10 M-c: stale render closures in queued commands | DEFER (Plan 6, with the inspector split) | |
| T10 M2: every InUse refusal gets the O3 sentence | DEFER (Plan 6 copy) | |
| T10 M3: last-link test vacuous | FIX-IF-CHEAP (M7) | |
| T10 M4: dialogs have no Tab trap; backdrop drops focus | DEFER (Plan 6 a11y) | |
| T10 M5: `DOMAIN_ICONS` duplicated TS/Rust | DEFER (Plan 6 icons) | |
| T10 M6: "Up to 9" hard-coded; blank/duplicate synonym cancelled silently | DEFER (Plan 6 copy) | Matches the plan's quoted copy |
| T10 M7: new-domain form doesn't ask for an icon | Accept | The icon picker is one click away in the inspector |
| T10 M8: Esc doesn't close slot forms | DEFER (Plan 6 a11y) | Cancel button exists |
| T10 M9: `renderInspector` size | DEFER (ruling M9) | |
| T10 M-d: focus after an ink pick; M-e / m1: Alt+Tab saves a half-typed name or definition | DEFER (Plan 6 a11y; QA note) | Undoable |
| T10 m2 and the rewriting-guard reliance on sync blur | DEFER (none) | Benign in Chromium/WebView2 |
| B7: light Group Green `-on` at 4.37:1 | DEFER (Plan 6, ruled) | |

## The fix-wave list

The single fix subagent does all of these, in order. Items 1–5 are must-fix. Items 6–13 are fix-if-cheap, all small. Run `npm test`, `npm run build`, `cargo test` and `cargo clippy --all-targets -- -D warnings` at the end.

1. **Labels (I1, covering P3-1, P3-3 and J2).**
   - No dot LOD for op, branch and tech nodes (`frame.ts` `planFrame`).
   - A pure `labelShown(scale)`, with `scene.ts` toggling the taxonomy label's `visible`.
   - Tree branch and technique labels staggered over 3 rows (`labelRow` helper in `layout-tree.ts`, optional `labelDy` on `SceneNode`, applied in `scene.ts make()`).
   - Canvas labels truncated to 24 characters plus "…" in `tree.ts` and `radial.ts`.
   - Radial ring 1 and ring 2 radii sized by chord for `LABEL_W = 184`.
   - Layout constants moved into `constants.ts`.
   - The README's Tree far-zoom row marked "re-check at QA".
   - Tests: `frame.test` (LOD and `labelShown`), `layout-tree.test` `labels_never_overlap`, `layout-radial.test` `ring_labels_never_overlap` (the box oracle), and `tree.test` (`labelDy`, truncation).
2. **Radial ring 3 packed into concentric rows (I2).** Rewrite the `layout-radial.ts` header and record the plan delta (Task 8, line 464). Test: `layout-radial.test` `ring3_packs_rows` (2,000 refs, radius ≤ 2,200, pairwise ≥ 0.95·REF_ARC), with `radial_rings` updated. Mark the README Radial row "re-measure at QA (ring 3 now on screen)".
3. **Enter starts a selection in the Tree and Radial (I3).** Change `tree.ts:191` and `radial.ts:231`. Tests: an Enter test in each of `tree.test` and `radial.test`.
4. **Inspector crumb (I4).** Add `.insp > * { flex: none; }` to `styles.css`. Proof: QA screenshot.
5. **Tree single-expanded reference block (I5).** Change `layout-tree.ts`, and in `tree.ts` use a joint connector plus an inked segment to the selected reference only. Update the existing one-column asserts, and record the Task 5/6 plan delta. Tests: `layout-tree.test` `single_expanded_refs_form_a_block`, and a `tree.test` edges assert (`tech → joint` once; `joint → ref` only to the selected reference).
6. **The camera follows the selection (I6).** Add `reveal()` in `camera.ts` and use it in `scene.ts` `select()` on a change of id only. Test: `camera.test` `reveal_pans_only_when_outside`.
7. **At-rest contrast (I7; the controller may decline).** Operation squares always take their opInk base, and off-path branch and technique outlines use `var(--ink-3)`, in both `tree.ts` and `radial.ts`. Test: `tree.test` and `radial.test` at-rest colours.
8. **Keys compound (M1).** In `scene.ts`, compute `+`/`-`/arrow targets from `tween?.to ?? cam`.
9. **Collide radius (M2).** `NODE·√½ + 2` with `iterations(2)`, the constant in `constants.ts`, and a `force.test` minimum-distance check. Mark the README settle row "before the radius change; re-measure".
10. **Radial deleted active operation (M3).** Refit and update `opSession`. Test in `radial.test`.
11. **Galaxy (M4, M5).** A failed `graphEdges` is not cached and shows no "Tag references…" note; an emptied library re-arms the fit. Two tests in `galaxy.test`.
12. **Inspector queue (M6).** `run()` prefixes the target, callers' keys carry the value, and a dropped duplicate unfreezes the field. Test in `inspector-edit.test`: resolve A, then assert B was called.
13. **Vacuous tests and docs (M7, M8).**
    - Fix `galaxy.test:208`, `galaxy.test:326` and `inspector-edit.test:210`.
    - Add the `graph_edges` O(Σdf²) doc line.
    - Revert the `api.ts:102` reformat.
    - Add the README PowerShell `VITE_PERF` line.
    - Optionally, add the T2 Snapshot "live refs" doc comment.

**For QA afterwards (no code):**
- Re-shoot preqa `e01`, `r02b`, `t01`, `t02` and `t03`, and T11's inspector screenshot.
- Re-run the P3-4 timing table.
- Walk the selection past the view edge in all three views.
- Re-measure the Galaxy settle at 2,500, and the Radial with ring 3 on screen.
- Take the operation count to 9 and check Radial keys 1–9.

## Declined to judge

- **SPEC §10 "coloured dots" versus neutral `--ink-2` dots.** Ruled as C3, and a spec delta for the controller.
- **"First layout within 3 s" meaning first streamed positions (0.96 s) rather than settled (5.1 s).** Controller ruling, with the user to confirm.
- **The aesthetics of the five extra ink hex values.** User taste; AA and ΔE were checked by `inks.test` and AGY.
- **Light Group Green `-on` at 4.37:1.** Ruling B7, Plan 6's decision.
- **Board scope, `inScope`, dim references and Shift-click Compare.** Plan 4.
- **Domain and operation icon glyphs.** Plan 6 icons.
- **The dangling-id integrity check after a failed save or "Quit without saving".** Accepted in `saver.rs` docs; Plan 6.
- **CORS image loading and WebGL on macOS and Linux WebKitGTK.** No machine; cross-platform pass.
- **The absolute performance numbers.** Not re-run, per instructions. I judged only what they did and did not exercise (I2).
- **The correctness of the `plan3-perf.js` and `make_perf_library.py` harnesses.** Tooling outside the shipped app; not re-run.
- **The plan document's own edits** (`docs/superpowers/plans/…`). Read for requirements only, not reviewed as code.
- **Dialog focus trapping and Esc on slot forms.** A Plan 6 a11y pass, already scheduled there.
- **SPEC §5 "drag … to re-link" read as "drag to add a link" (S3).** A recorded spec delta.

## Recommendations

- **Record three plan defects in the ledger, so Plans 4–6 inherit the lesson:**
  - **Task 8:** ring 3 was specified as a single growing ring.
  - **Tasks 5 and 6:** the band spacing had no rule tied to label width, and the reference column is unbounded (I5).
  - **Review Focus 4's "Move N tags to…"** is superseded by Task 10's "Move them to…".
- **Measure the content, not only the frame rate.** Add "at scale, what is on screen at fit?" to the Plan 4–6 speed checks. T11's 130 fps on the Radial was measured on an empty screen.
- **Do the `commands.rs` split first in Plan 4** (ruling M9).

## Assessment

**Ready to merge?** With fixes.

**Reasoning:**
- The core is sound and undo-safe, and Review Focus 1, 2, 3 and 5 pass in the release exe.
- The Tree and Radial, though, are not usable as views at the plan's own scale and labelling: overlapping or absent labels, an unbounded Radial ring 3 and Tree reference column, and no keyboard way to start a selection.
- Fix-wave items 1–5 close these, and QA re-verifies them on the release build.
