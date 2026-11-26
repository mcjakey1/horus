# Task 8 review: the Radial view (e8125ec..6b29b5d)

Scope: the diff, plus one focused check per named risk in `graph/navigate.ts`, `graph/layout-radial.ts`, `graph/taxgraph.ts`, `graph/scene.ts` (the key handler), `views/inspector.ts`, `views/tree.ts`, `keys.ts` (`digitOf`), `ops.ts` and `index.html`. I did not re-run the suite; findings from code reading are marked as such.

## Part 1: Spec — ✅

| Item | Status | Evidence |
|---|---|---|
| `mountRadial(host, data, { api, openReference, makeScene?, initialOp? }): ViewHandle` | ✅ | `radial.ts:51-55` |
| `firstrun.ts` registers `"radial"` on `[data-view-host="radial"]` (B2) | ✅ | `firstrun.ts:70-71`; the host exists in `index.html:66` |
| Imports `buildTaxGraph`, `layoutRadial`, `renderInspector`, `move`, `canvasKeys`; nothing copied, inspector unedited (R10, R12, carry-in 6) | ✅ | imports `radial.ts:5-17`; `inspector.ts` not in the diff |
| Switch: one button per operation, taxonomy order, plain label, 10 px `opInk` swatch, no hard-coded four | ✅ | `syncOps`; `.radial-op .sw` |
| Wraps to a second row past five | ✅ | `.radial-ops { grid-template-columns: repeat(5, …) }` |
| Keys 1-9 through `canvasKeys`' `digit` / `digitOf` (AZERTY, M3); above count or MAX_OPS do nothing | ✅ | `radial.ts:225-228`; `digitOf` only yields 1-9, so `ops[k-1]` is never `ops[-1]` |
| Default is the busiest operation; remembered for the session | ✅ | `busiest`, `opSession` |
| Ring 3 deduped by `refId` (carry-in 2) | ✅ | `rep` / `first` in `layout()`; all nodes of a reference share one point in `layoutRadial` anyway |
| Outline from `n.vias` on the active operation (carry-in 3), letterboxed with the region outlined, not a crop (a1) | ✅ | `vias.filter(here)`, region wins; `layoutRadial` only places refs with a via here, so `vs[0]` is never undefined |
| Ring-3 count is not `op.count` (carry-in 4) | ✅ | no ring-3 count is shown; test covers a partial tag |
| Cache on `version` (carry-in 5) | ✅ | key `${version}:${op}`; scope (`dim`) is read live in `render`, not cached — correct |
| `InspectorOpts.assetUrl` passed (carry-in 1) | ✅ | `radial.ts:154-159` |
| Technique→reference connectors only for the hovered/selected technique, in the operation's ink | ✅ | `edges()`; hover only calls `setEdges` |
| Scene owns Enter/0/+/-/arrows with nothing selected; view listens for `activate`; a reference opens in the Reference view | ✅ | `activate: () => {}`; `sc.on("activate")` → `openReference(refId)` |
| Line Says the State; no dashed secondary edges; no round technique-icon rows (anti-goal) | ✅ | `state: v.state` (`full`/`region`); every edge `width: 1` solid; the only circles are the requested operation swatches |
| Operation-Only Chroma; theme recolours live | ✅ | inks are `var(--…)` strings from `opInk` only; swatch via `style.setProperty("--c")` |
| Technique labels in `-text` ink; serif names / mono counts; reduced motion | ⚠️ | owned by the scene (Task 4); Radial passes the same `color`/`label` shape as the accepted Tree, so parity holds, but I did not verify the scene's label ink or fonts |
| The six named tests | ✅ | all present with the brief's names; 8 more beyond them |
| Manual `tauri dev` check | ⚠️ | not done (report concern 3); ring-2 label overlap is unverified on screen |

**Missing:** none.
**Extra:** `styles.css` block (not in the brief's file list, but needed and self-contained; acceptable). ←/→ on the centre switching operations (falls out of `move()`; harmless).
**Misunderstood:** none. The report's "With nothing selected, a move lands on the centre operation" is effectively unreachable in the app, because the scene pans and calls `preventDefault` on arrows while nothing is selected (`scene.ts:459-464`), so `canvasKeys` returns early (see M1).

## Part 2: Quality — Needs fixes

### Important

**I1. Keyboard moves run over the whole graph, not this operation's ring, so ←/→ and ↓ go dead (or jump) on shared techniques.** `app/src/views/radial.ts:219-221`
- The 6b29b5d fix patched only ↑. `move(l.g, sel, dir)` still uses the full `"all"` graph:
  - **←/→ on a technique** walks the siblings under `parents[0]`, its first parent overall (`navigate.ts:12-17, 30-31`). For `chiaroscuro` viewed under Sequence, that is `differentiate.feature`'s children. The next sibling is either not on this ring (so `select` refuses it, and the key does nothing) or a different technique that happens to be shared.
  - **↓ on a technique** returns `g.children.get(tech)[0]`. In `"all"` mode, that is any reference tagged with the technique, including one whose only via is on another operation's branch. `layoutRadial` does not place that reference, so `select` refuses it and ↓ is dead. A real library will hit this as soon as a shared technique is tagged under its other operation first.
  - **←/→ on a reference** walks every ref child of `via.techId`, placed or not, drawn or not. An unplaced sibling is refused. A non-drawn one is remapped through `rep`, so the selection jumps to another technique's column.
- This is the same bug class as AGY's note 2, left half-fixed. It breaks the "every action by keyboard" route for shared techniques.
- I found this from the code; it is not reproduced. The tests cover only ↑ and a simple ↓.
- **Fix:** in `layout()`, build a navigation view of the graph restricted to this ring and pass it to `move()`. Then delete the ↑ special case.
  - children: filtered to `placed`, with refs mapped through `rep` and deduped;
  - each technique's `parents`: filtered to `here`;
  - op nodes kept, so ←/→ on the centre still switches.
- Add one test each for ↓ and → from a shared technique whose first graph child or first parent is on another operation.

**I2. Inspector buttons for another operation's branch are dead clicks.** `app/src/views/radial.ts:196-203`
- For a technique, the shared inspector's "Used under" lists every parent branch (`inspector.ts:95`), including branches of other operations.
- `select()` only switches operation for an `op` node. For a `branch` (or a technique) on another operation, it hits the refusal path. The click silently does nothing: in the fallback there is no canvas at all, and with a canvas, `scene.select(sel)` just restores the selection.
- In the Tree, the same button works, so the shared inspector has a control that is dead only in Radial.
- **Fix:** in `select()`, when `n.kind === "branch" && n.opId !== op`, return `switchOp(n.opId, n.id)`. A technique not on this ring can switch to its first parent's operation in the same way. Add a test that clicks a "Used under" branch of the other operation.

### Minor

- **M1** `radial.ts:220`: the `sel === null` branch duplicates `move()`'s own null case (with `op:${op}` instead of the first operation). It is unreachable in the app, because the scene pans arrows and calls `preventDefault` when nothing is selected (`scene.ts:459-464`). Only the fake scene in tests reaches it. **Fix:** drop it, or keep it with a comment saying it serves the fallback/tests only. Folding it into I1's navigation graph also works.
- **M2** `radial.ts:127`: a hover replaces the selection's connectors rather than adding to them. While the pointer is over another technique, the selected technique's or reference's ring-3 connectors vanish. **Fix:** `active = new Set([hovered, ...selected techs])`.
- **M3** `radial.ts:149`: when the active operation disappears in a data change, `op` falls back to the busiest operation, but there is no `fitAll()`, `hovered` is not cleared, and `opSession` still names the removed id. **Fix:** route it through `switchOp(busiest(s))`, guarding against recursion, so the fallback behaves like a switch.
- **M4** `radial.ts:152` (selection across data changes): a selected reference node that is no longer placed is cleared even when the same `refId` is still on the ring under another technique (the user removed one of two tags). **Fix:** before clearing, map the selection by `refId` to the new drawn node.
- **M5** (shared inspector, `inspector.ts:59-61`, not this diff): for a shared technique or reference, the breadcrumb's operation (and `--op-text`) comes from `parents[0]` / `via` (the first branch overall). So in Radial it can name a different operation from the one at the centre, for example `chiaroscuro` under Sequence showing Differentiate. Carry-in 6 keeps the signature, so this cannot be fixed here. **Fix:** record it for Task 10, for example an optional `opId` hint in `Selection`/`InspectorOpts`.
- **M6** `radial.ts:45`: `as { count: number }` is an unchecked cast; a missing op node would throw on `.count`. It cannot happen today (every operation gets a node), so this is cosmetic. **Fix:** narrow with `n?.kind === "op"`, or leave it.
- **M7** `radial.test.ts:148`: `expect(fake.lastSel()).not.toBe(dimId)` is weak; it also passes if `select` was never called. **Fix:** assert that `lastSel()` equals the prior selection (`null`) and that the inspector is unchanged.
- **M8** naming, `radial.ts:65, 71`: `exists` is generic for "is a current operation id" (rename it `isOp`). A closure-wide `L` next to the parameter `l` reads poorly (rename it `cached`).

### Checked and fine
- **Lifecycle** mirrors the Tree:
  - `render()` before the scene resolves, `render(true)` once it does;
  - `dead` guards a late scene;
  - `destroy` aborts listeners, unsubscribes, destroys the scene and clears the host;
  - hidden data changes set `stale`, and `show()` replays them, fitting after a reset.
- **Switching** clears the selection and hover, refits, and updates the session memory. Choosing an operation from the inspector switches and keeps that operation selected. The switch buttons are rebuilt only when ids, labels or colours change, so focus survives a click.
- **Focus:** the canvas has `tabIndex = 0` (`scene.ts:121`), and its keydown bubbles to `.radial-stage`. Digits are not consumed by the scene. The inspector keeps focus when it rewrites itself (`inspector.ts:105-107`).
- **Tests are real:** a fake `Scene`, real graph, layout and inspector, and `vi.resetModules()` to isolate the session memory. The report records RED runs and mutation checks (removing the dedupe, using `via` instead of `vias`). `radial_shares_inspector` is close to tautological, but it is what the brief asked for.
- **YAGNI:** no speculative config. `opsSig` and the `version` cache each earn their place.
