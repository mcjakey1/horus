# Task 8 report: the Radial view

**Status:** DONE. Two commits on `p3-t8` (parent `e8125ec`):
- `a96eee4` `feat(ui): Radial view as a layout mode over the taxonomy graph`;
- `6b29b5d` `fix(ui): radial selection follows its drawn node; ↑ stays on the operation`, from AGY's two minor notes.

## What was implemented

### `app/src/views/radial.ts`: `mountRadial(host, data, deps)`

- **Signature:** as in the brief: `deps = { api, openReference, makeScene?, initialOp? }`, returning a `ViewHandle`.
- **Layout:** the host gets `.radial`: the operation switch, the canvas stage, and the Tree's `aside.insp` (340 px).

**The operation switch**
- One `button.radial-op` per taxonomy operation, in taxonomy order, with no fixed count.
  - Each shows `aria-pressed`, a 10 px `.sw` swatch and the plain label.
  - The swatch ink is `opInk(tax, id).base`, set through `style.setProperty("--c", …)`. The markup has no `style=`.
- **Rebuilding:** the buttons are rebuilt only when the operations' ids, labels or colours change, so a click doesn't destroy the focused button. Otherwise only `aria-pressed` moves.
- **Wrapping:** the CSS grid has `repeat(5, …)`, so a sixth operation starts a second row.

**Keys**
- `1`–`9` switch the operation while the canvas has focus, through `canvasKeys`' `digit` handler, which uses `digitOf`, so AZERTY's `"`/Digit3 counts.
- A digit above `min(operations, MAX_OPS)` does nothing.
- The arrows go through `move`.
  - ↑ from a technique goes to its first parent on this operation, not its first parent overall.
  - With nothing selected, a move lands on the centre operation.
  - ←/→ on the centre switches the operation.
- Esc clears the selection.
- Enter is left to the scene (carry-in 6). `activate` on a reference calls `openReference`.

**Default and memory**
- `initialOp`, if valid, otherwise the operation chosen earlier in the session (a module-level variable), otherwise the busiest operation.
- The busiest operation is the one with the highest graph `op` count; ties go to taxonomy order.
- Switching clears the selection and hover, then relays out and calls `fitAll()`.
- If the chosen operation disappears from the taxonomy, the view falls back to the busiest.

**Graph and cache**
- `buildTaxGraph(s, "all")` then `layoutRadial(g, op)`.
- The result is cached on `${version}:${op}` (carry-in 7), so a hover or selection never relays out.

**Ring 3**
- **One point per reference (carry-in 2):** the first placed node for each `refId` is the one drawn, and every other placed node for that reference maps to it (`rep`).
- **Outline (carry-in 3):** read from that reference's `vias` on this operation's branches, collected over all its nodes here.
  - A `region` via wins, otherwise the first.
  - The outline is `{ region: v.region ?? whole image, state: v.state, color: the operation's ink }` (ruling a1).
- **Scope:** `dim: true` when out of scope, and such a node can't be selected.
- **Thumbnails:** `url` is the raw `thumb256`, because the scene runs `assetUrl` itself.
- **Count (carry-in 4):** ring 3 holds only placed reference nodes, so partial tags (counted in `op.count`) have none.

**Edges**
- Hairlines (width 1) from the operation to each branch, and from each branch to its techniques.
- **Inked edges:** those on the selected path, which is the operation, the technique's parent branches on this operation, the technique and the reference. They use `opInk(tax, op).base`, sorted last.
- **Technique to reference:** drawn only for the hovered technique, otherwise the selected technique, otherwise the selected reference's techniques here. These are inked and point at the drawn node.
- **Hover** changes only call `setEdges`.

**Inspector (carry-in 1)**
- `renderInspector(insp, s, selectionOf(sel), { editable: false, openReference, select, assetUrl: (p) => api.assetUrl(p) })`, imported, not copied.
- Choosing an operation in it switches the operation.

**Data changes**
- A change keeps the selection while it is placed.
  - The selection is first mapped through `rep`, so it follows the drawn node when a new tag changes which node that is.
  - The camera is kept.
- A reset clears the selection and fits.
- While hidden, the view rebuilds on `show()` (as the Tree does).

**Fallback**
- Without WebGL, the fallback paragraph appears, and the switch and the inspector still work.

### `app/src/firstrun.ts` and `app/src/styles.css`

- **`firstrun.ts`:** one import, plus one self-contained `shell.register("radial", …)` hunk on `[data-view-host="radial"]`, right after the Tree's.
- **`styles.css`:** a new block at the end, "Plan 3 Task 8", covering:
  - `.graph-host.radial` (canvas plus the 340 px column) and `.radial-main`;
  - `.radial-ops`, a panel-ground segmented row that wraps at 5;
  - `.radial-op` with its `[aria-pressed="true"]` underline in ink;
  - `.radial-op .sw` (a 10 px circle, `background: var(--c)`), `.radial-stage`.

## Tests (`app/src/views/radial.test.ts`, 14 tests, with a fake `Scene` and `vi.resetModules()` per test so the session memory starts fresh)

- `default_op_is_busiest`: two references under `infer`, one under `group`, so the first render is `infer`, fitted once.
- `switch_operation_relayouts`: "Lead the eye" calls `setNodes`. The result has only `op:sequence`, only `br:sequence.*` branches, and exactly the `sequence` techniques. It fits again.
- `key_3_selects_sequence`: `3`, and `key: '"', code: "Digit3"` (AZERTY). `8` does nothing.
- `renders_dynamic_ops`: a fifth operation, "Unsettle" (`color: "rose"`), gives 5 buttons. `5` selects it, its swatch `--c` is `var(--x-rose)` and the first is `var(--diff)`. `6` does nothing.
- `out_of_scope_refs_are_dots`: `dim: true`, and not selectable.
- `radial_shares_inspector`: the inspector `innerHTML` equals `renderInspector`'s output for the same selection and opts, and the tile `img src` goes through `assetUrl`.
- Ring 3: one node for a reference with two techniques. The outline is `full` on Differentiate and `region` on Sequence, in that operation's ink (carry-ins 2 and 3).
- Technique-to-reference connectors appear only for the hovered or selected technique, and everything else is hairline.
- Ring-3 count is not the operation count: a partial tag adds no node (carry-in 4).
- `activate` opens; Enter is left to the scene; ↓ reaches the reference; Esc clears.
- The operation is remembered across a remount, and a reset clears and fits.
- A data change keeps the selection while it is on the ring, then clears it, with no `setCamera`.
- ↑ from a shared technique stays on this operation. The selection follows a moved drawn node. This test was added in the fix commit.
- The fallback keeps the switch and the inspector.

### TDD evidence

- **RED:** `npx vitest run src/views/radial` gave "Test Files 1 failed (1)", with `Failed to resolve import "./radial"`. The output is saved in `scratchpad/p3t8-red.txt`.
- **First GREEN run:** the fallback test failed because `vi.resetModules()` gave the test and `radial.ts` different `WebGLUnavailable` classes. The test now imports it from the same fresh module set. Then all 13 passed.
- **Fix commit:**
  - RED: "expected 'tech:chiaroscuro' to be 'br:sequence.feature'".
  - RED, after the `rep` fix was removed: "expected 'ref:size-hierarchy:q' to be 'ref:chiaroscuro:q'".
  - GREEN: 14/14.
- **Mutation checks:**
  - removing the ring-3 dedupe fails 8 tests;
  - using `n.via` instead of the per-operation `vias` fails the ring-3 outline test.
  - Both were restored.
- **Final:**
  - `npm test` gives "Test Files 33 passed (33), Tests 338 passed (338)".
  - `npx tsc --noEmit` is clean.
  - `npm run build` ends with "✓ built". Its only warning is the existing one that the lazy Pixi chunk is larger than 500 kB (`lib-*.js`, 682 kB).

## AGY #2

**Verdict: PASS.**
- Quote: "Ring-3 nodes are deduplicated to one `SceneNode` per `refId` (`rep`); outlines read `n.vias.filter((v) => here.has(v.branchId))` preferring `"region"` over `"full"` in the active operation's ink".
- **Minor notes, both fixed in `6b29b5d`:**
  1. "if a data change adds an earlier technique tag to a selected ref so its `rep` alias shifts, `l.placed.has(sel)` stays true while `sel` is no longer the drawn representative". The selection is now normalised through `rep`.
  2. "`move(…, "parent")` on a multi-parent technique viewed under a non-first operation … returns its first global parent … which `select` refuses". ↑ now picks the first parent on this operation.

## Concerns

1. **Off-path nodes, centre included, are `var(--line-2)`,** matching the Tree as accepted. The centre operation takes its ink only once something on its path is selected. The swatch in the switch carries the ink at all times.
2. **Radial edges are straight hairlines, not orthogonal elbows.** Orthogonal connectors are the Tree's grammar; the brief only asks for the operation's ink "as on the Tree's selected path".
3. **No manual `tauri dev` check** (a GUI session). Label overlap on ring 2 has not been checked on screen.
4. **Known Task 4 thumbnail bug (not fixed here, as instructed):** `scene.ts` loads thumbnails without `img.crossOrigin = "anonymous"`. On real `asset.localhost` thumbnails, WebGL throws "contains cross-origin data", so a manual run of Radial (or Tree) would show broken ring-3 thumbnails until the fix in p3-t7 is merged. `scene.ts` is untouched in p3-t8.

## Fix round 1 (commit `3ba1f39`)

### I1: the arrow keys used `move()` over the whole graph

- **The fix:** `layout()` now also builds `ring: TaxGraph`, the graph cut down to this operation's ring, and it is cached with the rest on `version:op`. The ring graph contains:
  - only the placed nodes (this operation, its branches and techniques, and the drawn node for each reference);
  - each technique copied with `parents` filtered to this operation's branches;
  - `children` limited to placed nodes, with each reference mapped to its drawn node and deduplicated.
- The arrows now call `move(layout().ring, sel, dir)`, and the ↑ special case from `6b29b5d` is removed.
- **Side effect:** ←/→ on the centre no longer switch the operation, because the centre has no sibling on its ring. The switch buttons and the 1–9 keys still do (the report above said otherwise).
- **Test:** `arrows walk this operation's ring on a shared technique (fix round 1, I1)`, run on Sequence on the shared technique `chiaroscuro` (whose first parent overall is `differentiate.feature`):
  - → goes to `size-hierarchy`, then ← comes back, and ← again does nothing;
  - ↓ goes to `ref:chiaroscuro:r`;
  - ↑ goes back up to the technique, then `br:sequence.feature`, then `op:sequence`;
  - → on the centre does nothing, and the operation stays Sequence.

### I2: a "Used under" branch from another operation did nothing

- **The fix:** `select()` now treats a branch node of another operation the way it treats an operation node. It calls `switchOp(n.opId, n.id)`, which switches, relays out and fits, then selects that branch.
- **Test:** `a Used-under branch from another operation switches to it (fix round 1, I2)`. On Sequence with `chiaroscuro` selected, clicking `br:differentiate.feature` switches to "Stand out", selects the branch, and the breadcrumb reads Differentiate.

### Runs

- **RED:** `npx vitest run src/views/radial` gave "Tests 2 failed | 14 passed (16)":
  - "expected 'tech:chiaroscuro' to be 'tech:size-hierarchy'";
  - "expected 'Lead the eye' to be 'Stand out'".
- **GREEN:**
  - `npx vitest run src/views/radial.test.ts` gives "Test Files 1 passed (1), Tests 16 passed (16)".
  - `npx tsc --noEmit` is clean.
  - The full `npm test` gives "Test Files 33 passed (33), Tests 340 passed (340)".
