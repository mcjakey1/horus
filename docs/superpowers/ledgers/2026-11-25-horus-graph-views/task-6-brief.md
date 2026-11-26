### Task 6: The Tree view and its inspector (read-only)

**Files:**
- Create:
  - `app/src/views/tree.ts`;
  - `app/src/views/inspector.ts`;
  - `app/src/graph/navigate.ts`: selection movement and the shared canvas key handler, for Task 8 to import (R12).
- Modify:
  - `app/src/firstrun.ts` `boot()`: `shell.register("tree", () => mountTree(host, source, { api, openReference: shell.openReference }))`, with `host` the `[data-view-host="tree"]` section (ruling B2);
  - `app/src/styles.css`: inspector styles, from DESIGN.md's margin column, callout card and record header, in their own block.
- Test:
  - `app/src/views/inspector.test.ts`;
  - `app/src/views/tree.test.ts`, using a fake `Scene` (mirroring `on(…, (id, mods))` and `dim`, R9);
  - `app/src/graph/navigate.test.ts`.

**Interfaces:**
- Consumes `createScene` (`scene.ts`) and `mountCanvasOrFallback`, `Scene` and `SceneNode` (`frame.ts`, Task 4), `buildTaxGraph` and `layoutTree` (Task 5), `DataSource` and `ViewHandle` (Task 2), `tileBox` (Plan 1 Task 8), and `digitOf` and `isTextEntry` (`keys.ts:10`, `:26`).
- Produces:
  ```ts
  export function mountTree(host: HTMLElement, data: DataSource, deps: { api: Api; openReference(id: string): void;
    makeScene?: (el: HTMLElement) => Promise<Scene> }): ViewHandle;
  export type Selection = { kind: "op" | "branch" | "tech" | "ref"; id: string } | null;
  export type InspectorOpts = { editable: boolean; openReference(id: string): void; select(sel: Selection): void };   // R10
  export function renderInspector(el: HTMLElement, s: Snapshot, sel: Selection, opts: InspectorOpts): void;
  // graph/navigate.ts (R12)
  export function move(g: TaxGraph, sel: string | null, dir: "prev" | "next" | "parent" | "child"): string | null;
  export function canvasKeys(e: KeyboardEvent, h: { move(dir: "prev" | "next" | "parent" | "child"): void;
    activate(): void; clear(): void; digit?(n: number): void }): boolean;   // true = handled; ignores isTextEntry targets; digits via digitOf
  ```
- **Layout:** a canvas on the left; the inspector on the right, 340 px wide, with the DESIGN.md margin styles.
- **The inspector:**
  - **The breadcrumb, at the top:** four cells keyed "01 Operation", "02 Domain", "03 Technique" and "04 Reference". `.record` is a 5-column grid (`styles.css:65`), so the inspector adds an `.insp-crumb` 2×2 variant that reuses `.cell`, `.k` and `.v` (C24). The cells fill to the depth of the selection, and empty cells show a tertiary-ink em dash.
  - **Below it**, depending on the selection:
    - **Operation:** its plain label, name, description and count.
    - **Branch:** the domain name and description, plus its techniques as a list of buttons with counts.
    - **Technique:**
      - its name (serif), definition and synonyms;
      - a "Used under" list of parent branches;
      - a grid of the 64 px tiles of its references, built with `tileBox`, letterboxed with the region outlined (ruling a1). **They are not built with `tileHTML`,** which writes `style=` markup (`tile.ts:32-36`; R11). The inspector inserts the elements, then sets `left`, `top`, `width` and `height` through `el.style`. `tileHTML` stays for Plan 1's view until Plan 6 converts it.
      - Clicking a tile calls `opts.openReference`.
    - **Reference:** its title, plus an "Open in Reference view" button.
- **Selecting a technique** expands it on the canvas: the graph is rebuilt with that `tech:` id in `expanded`. Only one technique is expanded at a time.
- **"Show all references" (decision 3):**
  - A toggle button above the canvas (`aria-pressed`), off by default and remembered for the session.
  - When it is on, the graph is built with `expanded = "all"`.
  - Culling and far-zoom dots keep it smooth; Task 11 measures it.
- **Board scope (audit row 10):** reference nodes with `inScope(id) === false` get `dim: true` (Task 4), so they are drawn in the dot LOD at every zoom and can't be selected.
- **Keyboard on the canvas,** through `navigate.ts` `canvasKeys` (R12), which returns early when the target is a text field (`isTextEntry`; C19):
  - ← and → move to the previous or next sibling;
  - ↑ moves to the parent (the first parent, for a technique);
  - ↓ moves to the first child;
  - Enter on a reference opens it;
  - Esc clears the selection.
- **The selected path is coloured.** The operation node, branch, technique and their connectors take the operation's ink; everything else stays hairline `--line-2`.
- **A data change** rebuilds the graph and the layout. The camera is kept, and so is the selection if its id still exists; otherwise the selection is cleared (Review Focus 3).
- **A library switch** (a `SourceEvent` with `reset: true`) clears the selection and calls `fitAll()` (C20).

- [ ] **Step 1: Write the failing tests**
  - Inspector, using the seed taxonomy and 3 references:
    - `breadcrumb_fills_to_depth`: a technique selection fills cells 01–03, and cell 04 is the em dash.
    - `tech_tiles_use_letterbox`: a reference tagged on a region shows a `.treg` whose `el.style.left`, `top`, `width` and `height`, read after mounting and not from the markup (Cross-plan audit row 26), equal `tileBox(aspect, 64, region).outline` in px.
    - `ref_open_button`: clicking "Open in Reference view" calls `opts.openReference` with that id.
    - `branch_tech_button_selects`: clicking a technique button in a branch selection calls `opts.select({ kind: "tech", id })`.
    - `no_inline_style_markup`: the inspector's `innerHTML` contains no `style=`.
  - Navigate:
    - `move_siblings_parent_child`: on the seed graph, `move` follows taxonomy order for prev and next, the first parent for `parent`, and the first child for `child`, and returns `null` past either end.
    - `canvas_keys_ignore_text_fields`: a keydown whose target is an `input` returns `false` and calls nothing.
  - Tree, with a fake `Scene` that records the `setNodes`, `setEdges` and `select` calls:
    - `selecting_tech_expands_its_refs`: after `select("tech:chiaroscuro")`, the nodes include both `ref:chiaroscuro:*` ids.
    - `show_all_toggle`: pressing "Show all references" gives a `setNodes` call that contains a `ref:` node for every (technique, reference) tag pair. Pressing it again returns to the selected technique only.
    - `out_of_scope_refs_are_dots`: with `inScope` false for one reference, its node reaches `setNodes` with `dim: true`.
    - `arrow_up_goes_to_parent`: from `tech:X`, ↑ selects `br:<first parent>`.
    - `data_change_keeps_selection_or_clears`: a store change keeps the selection while it exists, and clears it once the reference is removed. The camera is not reset.
    - `reset_clears_and_fits`: a `{ reset: true }` event clears the selection and calls `fitAll()`.
    - `fallback_has_inspector`: when `makeScene` rejects with `WebGLUnavailable`, the inspector still renders the operation list as buttons, so the Tree stays usable without a canvas (Review Focus 1).

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- views/ graph/navigate`. It should FAIL, then PASS. Then run `npm test` and `npm run build`.

- [ ] **Step 3: Manual check**

  Run `npm run tauri dev` on the demo library. Expected:
  - The Tree tab is enabled, and the Reference header and work area are hidden while it shows.
  - The four bands are visible.
  - Clicking *Chiaroscuro* lists its demo references as letterboxed tiles.
  - The path colours.
  - Enter on a reference opens the Reference view.

- [ ] **Step 4: Commit**

  Commit message: `feat(ui): taxonomy Tree view with docked inspector and breadcrumb`.

---

