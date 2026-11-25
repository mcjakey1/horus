# Task 6 report: the Tree view and its inspector (read-only)

**Status:** DONE, but the manual check (Step 3) was not run. Two commits on `p3-t6` (parent `2fecf79`):
- `0e36b91` `feat(ui): taxonomy Tree view with docked inspector and breadcrumb`;
- `672ef22` `fix(ui): pass raw thumbnail paths to the scene; the Tree binds no digit keys`, from AGY's findings.

## What was implemented

### `app/src/graph/navigate.ts` (R12, for Task 8 to import)

- **`move(g, sel, dir)`:**
  - **Siblings** follow taxonomy order: operations among operations; a branch under its operation; a technique under its first parent branch; a reference in its technique's column. It returns `null` past either end.
  - **`parent`:** a branch goes to its operation, a technique to its first parent (`br:`), and a reference to its technique.
  - **`child`:** the first child, or `null`.
  - **With nothing selected,** any move except `parent` lands on the first operation.
- **`canvasKeys(e, h)`:**
  - The arrows call `move`, Enter calls `activate`, Esc calls `clear`, and digits go through `digitOf` when `h.digit` is given.
  - It returns `false` without calling anything when the event is `defaultPrevented`, `isComposing`, has a modifier, or targets a text field (`isTextEntry`, C19).
  - The `defaultPrevented` test is how this fits with Task 4. The scene calls `preventDefault` on whatever it handles: Enter with a selection, 0, +/- and the arrows with no selection. So the shared handler never acts on those keys a second time.

### `app/src/views/inspector.ts`: `renderInspector(el, s, sel, opts)`

- **Types:** `Selection` and `InspectorOpts` as in the brief, plus one additive optional field, `assetUrl?(path): string` (see concern 1).
  - `Selection.id` is the graph node id (`op:…`, `br:…`, `tech:…`, `ref:<tech>:<ref>`).
  - `selectionOf(id)` converts a node id to a `Selection`.
- **The breadcrumb** is `.record.insp-crumb`: four `.cell`s keyed "01 Operation" to "04 Reference", reusing `.k` and `.v` (C24).
  - A cell beyond the selection's depth has an empty `.v`, and the existing `.v:empty::before` rule draws the tertiary em dash.
  - A technique's operation and domain come from its first parent, matching ↑. A reference's come from its `via`.
  - The operation cell's ink is `--op-text` from `opInk(…).text`, set through the CSSOM.
- **The body, by selection:**
  - **Nothing selected,** or an id that has gone: the operation list as buttons (name · plain label, with count). This is what keeps the WebGL fallback usable.
  - **Operation:** its plain label, name, description and count, plus its branches as buttons.
  - **Branch:** the domain name and description, plus its techniques as buttons with counts.
  - **Technique:**
    - its name (serif), definition and synonyms;
    - a "Used under" list of parent-branch buttons;
    - a grid of 64 px `.thumb` tiles.
  - **The tiles** use the existing `.thumb .t .tplate .treg` classes.
    - The markup is inserted with no `style=`.
    - Then `tileBox(aspect, 64, via.region)` sets `left`, `top`, `width` and `height` on `.tplate` and `.treg` through `el.style`, and `--c` (the operation ink) through `style.setProperty` (ruling a1, R11).
    - A whole-image tag is letterboxed with no outline box.
    - Clicking a tile calls `opts.openReference(refId)`.
  - **Reference:** title, creator and year, plus "Open in Reference view".
- **Mechanics:** one `innerHTML` write per render. Clicks are delegated through `el.onclick`, which each render replaces, so listeners never pile up.

### `app/src/views/tree.ts`: `mountTree(host, data, deps)`

- **Layout:** `host` gets the `.tree` class: a canvas column (with the "Show all references" bar on top) plus a 340 px `aside.insp`.
- **Scene:** `mountCanvasOrFallback(stage, () => (deps.makeScene ?? createScene)(stage))`.
  - Once it resolves, the Tree subscribes to `select` and `activate`, renders, and calls `fitAll()` once.
  - `activate` on a reference calls `openReference`; on any other node it does nothing.
- **Expansion:** one technique at a time — the selected technique, or the one the selected reference sits under.
  - "Show all references" (`aria-pressed`) builds the graph with `"all"`. The setting is a module-level flag, so it lasts for the session (decision 3).
- **Scene nodes:**
  - **Operations, branches and techniques** are 28, 20 and 20 units, labelled with the operation name, the domain name or the technique name.
  - **Colour:** `opInk(tax, op).base` when the node is on the selected path, otherwise `var(--line-2)`.
  - **References:**
    - `size: NODE`;
    - `url` is the raw `thumb256` path, because the scene runs `assetUrl` itself;
    - `aspect` is width over height;
    - `dim: true` when out of scope;
    - `outline: { region: via.region ?? whole image, color: opInk of the via's operation, state: via.state }`, so the scene draws the line state (solid for full, dotted for region).
- **Edges:** hairlines, width 1, never curved.
  - **Between bands,** each parent–child link is three axis-aligned segments: down to the gap between the bands, across, then down. The two joints are empty `label` nodes, which the scene never picks, with ids `j:dn:<parent>` and `j:up:<child>`.
  - **Reference columns** are a straight vertical segment from the technique.
  - Duplicate segments are merged. Inked segments (both ends on the path) sort last, so they draw on top.
- **Keyboard:** on the stage, through `canvasKeys`: the arrows call `move`, and Esc clears.
  - `activate` is a no-op, because the scene owns Enter and emits `activate` (carry-in 1).
  - No digit keys are bound (AGY note, Cross-plan row 11).
- **Selection rules:**
  - A selection that isn't a node on the canvas, or an out-of-scope reference, is refused, and the scene is told to keep the old selection (audit row 10).
  - **A data change** rebuilds the graph and layout. The camera is kept, and so is the selection while its id exists; otherwise it is cleared (Review Focus 3).
  - **A reset** clears the selection and calls `fitAll()` (C20).
- **While hidden,** the Tree skips rebuilds. It marks itself stale and rebuilds on `show()`, fitting then if a reset arrived in between.
- **Caching:** nothing is cached across events. The graph is rebuilt from the live Snapshot each time (carry-in 2).

### `app/src/firstrun.ts` and `app/src/styles.css`

- **`firstrun.ts`:** one import, plus one self-contained hunk after the Inbox registration:
  ```ts
  shell.register("tree", () =>
    mountTree(root.querySelector<HTMLElement>('[data-view-host="tree"]')!, source, { api, openReference: shell.openReference }));
  ```
- **`styles.css`:** a new block at the end of the file, "Plan 3 Task 6". It covers:
  - `.graph-host.tree` (canvas plus the 340 px column), `.tree-main`, `.tree-bar`, `.tree-stage`;
  - `.insp`, using the margin column's panel, line and padding;
  - `.insp-crumb`, the 2×2 `.record` variant;
  - the callout-card styling for `.insp-sel` (shell fill, line border, serif 15) and the type styles.

## Tests

- **`graph/navigate.test.ts`** (4 tests): `move_siblings_parent_child`; moving into references and back; `canvas_keys_ignore_text_fields`; and the key map, including AZERTY's `&`/Digit1, a modifier, an already-handled event and a missing `digit`.
- **`views/inspector.test.ts`** (6 tests):
  - `breadcrumb_fills_to_depth` (technique, reference and operation depths);
  - `tech_tiles_use_letterbox`: `.treg` and `.tplate` `el.style` values equal `tileBox(3/4, 64, region)` in px; `--c` is `var(--diff)`; there's no `.treg` for a whole-image tag; the `img src` goes through `assetUrl`; clicking opens;
  - `ref_open_button`;
  - `branch_tech_button_selects` (with a count of 2);
  - operation, technique ("Used under" in parent order) and the empty selection;
  - `no_inline_style_markup`: a spy on `el`'s `innerHTML` setter shows that no written HTML contains `style=` for any selection kind. After mounting, only `.tplate`, `.treg` and `.insp-crumb` carry a `style`, and those are CSSOM-set.
- **`views/tree.test.ts`** (13 tests, with a fake `Scene` recording `setNodes`, `setEdges`, `select` and `fitAll`, and replaying `select` and `activate`):
  - mounting collapsed, with one fit;
  - `selecting_tech_expands_its_refs` (one at a time, raw url);
  - `show_all_toggle`;
  - `out_of_scope_refs_are_dots` (`dim`, and not selectable);
  - the ruling a1 outline (region and whole image);
  - `selected_path_coloured`: inks, hairline width 1, no curves, every segment axis-aligned, inked segments last;
  - `arrow_up_goes_to_parent`, plus →, Esc and an unbound digit;
  - Enter left to the scene, while `activate` opens;
  - `data_change_keeps_selection_or_clears` (no `fitAll` or `setCamera`);
  - `reset_clears_and_fits`;
  - a hidden Tree rebuilding on show;
  - the inspector driving the canvas;
  - `fallback_has_inspector` (WebGL missing: the operations are `BUTTON`s, and op → branch → technique → tile opens).

### TDD evidence

- **RED:** `npx vitest run src/views/ src/graph/navigate` gave "Test Files 3 failed (3)", with `Failed to resolve import "./navigate"`, `"./inspector"` and `"./tree"`. The output is saved in `scratchpad/p3t6-red.txt`.
- **During GREEN:** `data_change_keeps_selection_or_clears` first failed. The test selected a reference node before its technique was expanded, which the Tree rightly refuses. The test now expands the technique first, and `selected_path_coloured` asserts the refusal.
- **GREEN:** `npm test` gives "Test Files 32 passed (32), Tests 322 passed (322)". `npx tsc --noEmit` is clean, and `npm run build` ends with "✓ built".

### Carry-in 4: Pixi chunk

- The release build keeps Pixi out of the start-up bundle. `dist/assets/lib-C43e04OT.js` (682.31 kB, 190.62 kB gzip) is Pixi, and `index-CY7etlwx.js` (107.94 kB) loads it only through `import("./lib-….js")` inside `createScene`.
- Pixi's renderer pieces (`WebGLRenderer-…`, `browserAll-…` and others) are their own small lazy chunks too.

## AGY #2

**First verdict: FAIL, fixed in `672ef22`.**
- **Blocking finding,** quoted: "`tree.ts:97` sets `url: deps.api.assetUrl(ref.thumb256)` on `SceneNode`, but `createScene` in `scene.ts:165` already runs `img.src = api.assetUrl(url)`. … every Tree reference thumbnail fails to load".
  - Confirmed at `scene.ts:165`. The Tree now passes the raw path, and the test asserts `url: "c"`.
- **Minor notes:**
  - Digit keys bound on the Tree (not requested; row 11): removed. The test now checks that a digit selects nothing.
  - The `editable` comment named the wrong plan: corrected.
  - No `aria-live` on the inspector: not done, see concern 4.
- Quote: "Everything else checks out".

## Concerns

1. **`InspectorOpts.assetUrl?` is additive.** `renderInspector`'s fixed signature has no `Api`, but tile thumbnails need `api.assetUrl` ("never concatenate"). Without it a tile shows the letterbox and outline but no image. Task 8 should pass `assetUrl: (p) => api.assetUrl(p)`.
2. **Orthogonal connectors through joint nodes.** The T4 scene draws only straight segments, so each elbow is two invisible, unpickable `label` nodes with empty text. That's about two per link (around 110 on the seed), each an empty `PIXI.Text`.
   - If T4 adds polyline edges, the joints can go.
   - A technique's label may overlap a neighbour's at the 64-unit spacing. I have not checked this on screen.
3. **Off-path colour.** I followed the brief literally: when nothing on their path is selected, operation nodes too are `var(--line-2)`. With no selection the whole tree is neutral, and operations take their ink only on the selected path. If operations should always show their ink, it's a one-line change in `colorOf`.
4. **No manual check, and no `aria-live`.**
   - `npm run tauri dev` is a GUI session I can't drive from here, so Step 3 is not done.
   - The inspector has no `aria-live` region. Announcing the whole re-rendered aside would be noisy; a focused `aria-live` line for the breadcrumb could be added in polish.
