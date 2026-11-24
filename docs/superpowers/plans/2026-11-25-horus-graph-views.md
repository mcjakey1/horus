# Horus Graph Views (Plan 3 of 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three canvas views over the library: the Taxonomy Tree (with taxonomy editing in its inspector), the Galaxy and the Radial view. All three are drawn with PixiJS. They pan and zoom smoothly at 2,000+ references, and choosing a reference in any of them opens it in the Reference view.

**Architecture:**
- **Rust core:** one new scoring function. `correlate::Index::graph_edges` finds each reference's strongest neighbours through an inverted technique→references index. It never scores all N² pairs (AGY #2 ruling **c5**).
- **Taxonomy editing (Tasks 9–10)** adds invertible edits on top of Plan 2's `edit` and `history` modules.
- **TypeScript UI (`app/src/graph/`):**
  - pure, tested modules for the camera, culling, level of detail, the texture cache and the layouts;
  - one thin PixiJS `Scene` that draws whatever those modules decide;
  - HTML inspectors beside the canvas;
  - the Galaxy force layout (`d3-force`), running in a Web Worker;
  - the Tree and Radial views: fixed band and polar maths over one shared taxonomy graph model.
- **View switching:** a small `shell` module mounts and unmounts the views behind the top-bar tabs.

**Tech Stack:**
- Plan 1's stack: Tauri 2, Rust (edition 2024), TypeScript, Vite, and Vitest with jsdom.
- New npm packages: `pixi.js@^8` and `d3-force@^3` (with `@types/d3-force`). No others.
- No new crates.

**Spec:** `SPEC.md` (draft 5, approved 24 Nov 2026): §1 (editing in v1), §4 (scores drive the Galaxy), §5 (Tree, Galaxy, Radial), §9 (speed) and §10 (PixiJS, d3-force in a worker, culling).
- Visual system: `DESIGN.md`.
- Direction contract: `.impeccable/surfaces/prototype-index-html.md`.
- Builds on Plan 1, `.worktrees/horus-foundation/docs/superpowers/plans/2026-11-24-horus-foundation.md`, as amended, and its ledger `.superpowers/sdd/2026-11-24-horus-foundation/progress.md`.
- Builds on Plan 2, `docs/superpowers/plans/2026-11-25-horus-tagging-inbox.md`, **for Tasks 9 and 10 only** (see "Dependencies").

**Dependencies:**
- **Tasks 1–8 and 11 use only Plan 1 interfaces:**
  - `LibraryView`, `Reference` with `thumb256`, `Taxonomy`, `Scored` and `Api`, all from Plan 1 Tasks 7–8;
  - `tileBox` and `mountReference` from Plan 1 Task 8;
  - `correlate::Index` from Plan 1 Task 5.
- **⚑ Tasks 9–10 need Plan 2.** Undoable taxonomy edits need Plan 2's:
  - Task 1, `edit::{Edit, apply, Applied, Touched}`;
  - Task 2, `History`;
  - Task 3, `Taxonomy::save` and `find_by_name`;
  - Task 5, the `Change` type and its command pattern;
  - Task 7, the `Store`.

  SPEC §6.8 says undo covers everything, so there is no honest way around this. If Plan 2 has not merged when Task 8 is done, Tasks 9–10 wait; Task 11 can run first.
- **⚑ Shell overlap with Plan 2 Task 9.** That task enables the Inbox tab in `main.ts`. Task 2 here owns view switching for every tab. If Plan 2 Task 9 has already landed, Task 2 moves the Inbox's mount call behind `shell.register("inbox", …)`. If it hasn't, Plan 2 Task 9 registers there instead.

**Ownership of taxonomy editing (SPEC §1, §5).** The Plan 1 roadmap put the "taxonomy editor" in Plan 6. SPEC §5 puts editing in the Tree view's inspector, so **Plan 3 now owns taxonomy editing**, in Tasks 9–10. Following the user's decisions, that covers techniques, **operations** (add, rename, plain label, description, ink, delete with move-to) and **domain types** (add, rename, icon, delete with move-to). Plan 6 keeps the intro card and packaging. This plan also closes the Plan 1 Task 3 deferred minor ("validate() negative tests thin — add table-driven mutations before Plan 6 editing") in Task 9. Plan 2 Task 3 already closed the other two Task 3 minors (missing keys versus `null`; `source`/`rationale` defaults).

**Carried from the Plan 1 ledger (owned here):**
- AGY #2 **c5**: score the Galaxy through an inverted index (Task 1).
- Plan 1 Task 5 minor: "callers must rebuild index". Every new command reads the index the state already rebuilds after each import or edit. No view caches scores across a data change (Task 2's `DataSource`).
- Ruling **a1**: region thumbnails are the letterboxed tile with the region outlined, not a crop. This holds wherever the graph views draw a reference because of a region-tagged technique (Tasks 6 and 8).

## Global Constraints

- **Canvas:** PixiJS v8 initialised with `preference: "webgl"`. HTML panels beside the canvas follow DESIGN.md. The canvas is a view, never the only route: every action in a canvas view is also reachable from the keyboard and the inspector.
- **Pan and zoom on every canvas view:**
  - wheel zooms about the cursor;
  - drag pans;
  - `+` / `-` zoom, `0` fits, and the arrow keys pan (or move the selection, when a node is selected).
  - Scale is clamped to `[0.05, 4]`.
- **Speed (SPEC §9, §10):**
  - Only nodes inside the viewport, plus a 10% margin, are drawn.
  - A reference node smaller than `DOT_PX = 10` screen pixels draws as a dot; otherwise it draws its 256 px texture on an N5 tile.
  - At most `TEX_CAP = 600` thumbnail textures are alive at once (least recently used are evicted).
  - Originals are never decoded in these views. They use `thumb256` only, through `api.assetUrl`.
- **Galaxy (SPEC §4, §5):**
  - Layout is a `d3-force` simulation in a Web Worker, never on the UI thread.
  - Link strength comes from the correlation score.
  - Edge thickness is `0.75 + 2.25 × score` px.
  - Edges are drawn **only** for the hovered or selected reference.
  - Each reference keeps at most `K_EDGES = 8` strongest neighbours with `score ≥ MIN_SCORE` (0.05).
- **Tree (SPEC §5):** top-down bands, in order:
  1. operation;
  2. domain, drawn per operation as a branch node;
  3. technique;
  4. references.

  The inspector is docked on the right, at the DESIGN.md margin width of 340 px, with the breadcrumb path docked in it.
- **Radial (SPEC §5):** a layout mode over the same taxonomy graph model as the Tree, for one operation at a time. It is not a second system.
- **Visual rules (DESIGN.md):**
  - **The Constant Card Rule:** every reference tile sits on Grey Card N5 in both themes.
  - **Operation-Only Chroma:** operation inks appear only on operation nodes, on the edges of the selected path, and on technique labels set in `-text` ink. Reference-to-reference edges in the Galaxy are neutral `--ink-2`.
  - **Every operation ink resolves through `opInk(tax, opId)` (Task 2):**
    - the four seed operations use DESIGN.md's tokens;
    - any other operation uses its `color` from the extra ink set (Task 10);
    - an operation with no known ink falls back to neutral (`--ink-2` base, `--ink` text, `--panel` on).

    No view keys CSS variables by operation id directly.
  - **The Line Says the State:** where a tag is drawn (an outline on a tile), solid means full, dashed partial and dotted region.
  - Serif for names; mono for counts and scores.
  - Theme changes recolour the canvas live.
  - `prefers-reduced-motion` turns every tween off.
- **Anti-goal (SPEC §11, direction contract):** no view may read as an Iris screenshot. Specifically:
  - no rows of round technique icons;
  - no dashed "secondary" edge grammar;
  - the Tree is our top-down band layout, with hairline orthogonal connectors.
- **IPC keys (Cross-plan audit row 1):**
  - JS `invoke` keys are the camelCase form of the Rust parameter names, which is Tauri's default: `techniqueId`, `branchId`, `moveTo`, `operationId`, `domainId`, `plainLabel`.
  - Tasks 1 and 9 add their commands as rows to `src/api.contract.test.ts` (`mockIPC`).
- **Constants live in one file, `app/src/graph/constants.ts`** (SPEC §4: "weights live in a constants file"): `K_EDGES`, `DOT_PX`, `TEX_CAP`, `MIN_SCALE`, `MAX_SCALE`, `EDGE_W0 = 0.75`, `EDGE_W1 = 2.25`, `BAND_GAP = 160`, `NODE = 48`.
- **Copy:**
  - **Operation labels come from the taxonomy.** The seed's plain-English set ("Stand out", "Hold together", "Lead the eye", "Make them think") is the default, and the artist can edit it (decision 1). No view hard-codes the four labels or assumes there are exactly four operations. There are between 1 and 9 (`MAX_OPS = 9`, so number keys 1–9 can reach each).
  - New strings are those quoted in the tasks, verbatim.

## Review Focus

1. **The WebView has no WebGL, or loses its context.** This happens on some Linux WebKitGTK builds, over remote desktop, or after a GPU driver reset. The canvas view shows "This view needs WebGL, which isn't available here. The Reference view still works." and the other views keep working. After `webglcontextlost`, the scene rebuilds on `webglcontextrestored`. Tested in Task 4.
2. **The library has no references, or none with a technique tag.**
   - The Galaxy shows untagged references on an outer ring, with the note "Tag references to see them cluster.", or "No references yet." when there are none.
   - The Tree shows the taxonomy with 0 counts.
   - No position is ever NaN.

   Tested in Tasks 5 and 7.
3. **Library data changes while a graph view is open** (an import, a tag edit, an undo).
   - The view updates without resetting the camera or the selection.
   - The Galaxy warm-starts, so references already placed move by less than they would from a cold layout.
   - A selected reference that was deleted clears the selection instead of crashing.

   Tested in Tasks 2 and 7.
4. **A technique still in use is deleted, or a branch is unlinked while tags use it.**
   - The artist is asked where the tags go: "Move N tags to…" a technique, or "Keep them as partial tags".
   - The whole change is one undo step.
   - Undo restores the technique, its links and every tag in its original position.

   Tested in Tasks 9 and 10.
5. **A thumbnail file is missing or fails to decode.** The node falls back to a dot, the failure is remembered so it isn't retried every frame, and nothing throws. Tested in Task 3.

---

### Task 1: Galaxy edges through an inverted index (Rust)

**Files:**
- Modify:
  - `app/src-tauri/src/correlate.rs`;
  - `app/src-tauri/src/commands.rs`, adding `graph_edges`;
  - `app/src-tauri/src/lib.rs`, registering the command;
  - `app/src/api.ts`.

**Interfaces:**
- Consumes `correlate::Index` and `Scored` (Plan 1 Task 5), and the app state and `Mutex` from Plan 1 Task 7.
- Produces:
  ```rust
  #[derive(Serialize, Clone, Debug, PartialEq)] #[serde(rename_all = "camelCase")]
  pub struct Edge { pub a: String, pub b: String, pub score: f64 }        // a < b (string order), unique pair
  impl Index { pub fn graph_edges(&self, data: &LibraryData, k: usize) -> Vec<Edge>; }
  // command: graph_edges(k: u32) -> Vec<Edge>
  ```
  ```ts
  export type Edge = { a: string; b: string; score: number };
  // Api gains: graphEdges(k: number): Promise<Edge[]>   // invoke("graph_edges", { k })
  ```
- How `graph_edges` works:
  - Build `postings: technique id → reference indices` once.
  - For each reference, its candidates are the union of the postings of its own techniques.
  - Score each candidate with the existing cosine, `Index::score`, and keep the top `k` with `score ≥ MIN_SCORE`.
  - The edge set is the **union** of every reference's top-k, deduplicated by `(min(a, b), max(a, b))`.
  - Pairs that share only a branch are not candidates. This is the c5 trade-off: such pairs score low and would bring back O(N²). Record it in a doc comment.

- [ ] **Step 1: Write the failing tests**, in `correlate.rs` `tests`:
  - `graph_edges_match_bruteforce`: a seeded random library of 200 references over 30 techniques. `graph_edges(&d, 8)` equals a brute-force top-8 over all pairs that share at least one technique, compared as sets of `(a, b)` with scores within 1e-12.
  - `graph_edges_no_self_no_dupes`: no edge has `a == b`, and each pair appears once with `a < b`.
  - `graph_edges_respects_k_and_min`: in a star where one hub shares a distinct rare technique with each of 20 leaves, the hub keeps its own top 8. The union can still contain more of the hub's edges, from the leaves' side. Every score is at least `MIN_SCORE`.
  - `graph_edges_empty_and_partial`: an empty library, and one where every tag is partial, both return `[]`.
  - `graph_edges_skip_branch_only`: two references that share only a branch produce no edge.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test correlate::`. It should FAIL, then PASS. Then run `cargo clippy --all-targets -- -D warnings`.

- [ ] **Step 3: Add the command and wrapper**

  The command reads the state's current `Index` and `LibraryData` under the lock, calls `graph_edges(k as usize)` and returns the result. In `api.ts`, add the `Edge` type and `graphEdges` to `Api` and `tauriApi`.

  Add the Rust test `graph_edges_command_roundtrip`, using `tauri::test::mock_builder()`, like Plan 1 Task 7: on a created library with no imports, the command returns `Ok([])`.

- [ ] **Step 4: Commit**

  Commit message: `feat(core): Galaxy edges via inverted technique index`.

---

### Task 2: View switching and the data source

**Files:**
- Create:
  - `app/src/shell.ts`;
  - `app/src/data.ts`;
  - `app/src/ops.ts`.
- Modify:
  - `app/index.html`: enable the Tree, Galaxy and Radial tabs, with `data-view` attributes;
  - `app/src/main.ts`;
  - `app/src/styles.css`: add `body[data-view]` rules;
  - `app/src/reference/view.ts` (Plan 1 Task 8): replace `OP_KEY` with `opInk`, and read data from a `DataSource` (Cross-plan audit row 28);
  - `app/src/search.ts` (Plan 1 Task 8): take swatch colours from `opInk`.
- Test:
  - `app/src/shell.test.ts`;
  - `app/src/data.test.ts`;
  - `app/src/ops.test.ts`;
  - `app/src/reference/view.test.ts` (extended).

**Interfaces:**
- Consumes `mountReference` (Plan 1 Task 8), and `LibraryView` and `Taxonomy`. `staticSource` builds `refs` from `view.references` and keeps `links`, so the Reference view can read it too. `inScope` is always true until Plan 4's `storeSource` supplies board scope (Cross-plan audit row 10).
- **The Reference view (audit row 28):**
  - Library loading moves out of `mountReference` and into `main.ts`.
  - Its signature becomes `mountReference(root, api, data: DataSource)`, still returning `{ show, ready, destroy }`.
  - It re-renders the focused reference whenever `data` notifies.
  - If Plan 2 Task 7 lands first, it makes this change against its `Store`, and Task 10 here only wraps it.
- Produces:
  ```ts
  // data.ts — the one seam between the views and where library data comes from
  export type Snapshot = { refs: Map<string, Reference>; links: Link[]; tax: Taxonomy; version: number;
    inScope(refId: string): boolean };   // maps 1:1 onto Plan 2's Store; inScope = Plan 4 board scope (always true here)
  export interface DataSource { get(): Snapshot; subscribe(fn: (s: Snapshot) => void): () => void }
  export function staticSource(view: LibraryView, tax: Taxonomy): DataSource & { replace(view: LibraryView, tax: Taxonomy): void };
  // Plan 2 adapter (added in Task 10): storeSource(store: Store): DataSource
  // ops.ts — the only place operation inks are resolved
  export type Ink = { base: string; text: string; on: string };   // CSS values, e.g. "var(--seq)"
  export const SEED_INK: Record<string, "diff" | "group" | "seq" | "infer">;   // differentiate→diff, group→group, sequence→seq, infer→infer
  export function opInk(tax: Taxonomy, opId: string): Ink;
  // op.color ∈ EXTRA_INKS → var(--x-<color>…); else (color null) seed id → var(--k), var(--k-text), var(--k-on); else neutral
  // shell.ts
  export type ViewId = "reference" | "tree" | "galaxy" | "radial" | "inbox" | "boards";
  export interface ViewHandle { show(): void; hide(): void; destroy(): void }
  export function mountShell(root: HTMLElement, deps: { openReference(id: string): void }): {
    register(id: ViewId, factory: () => ViewHandle): void;
    select(id: ViewId): void;
    current(): ViewId;
  };
  ```
- **Lazy mounting.** A view is created on its first `select` and then only hidden and shown. Canvas views keep their camera between visits.
- **Shell layout.** `body[data-view="reference"]` keeps Plan 1's grid. Any other value hides the record header row, because graph views dock the breadcrumb in their inspector (SPEC §5).
- **Opening a reference.** `openReference(id)` selects `"reference"` and calls the Reference view's `show(id)`.
- **Tabs.** The tabs keep Plan 1's markup and use `aria-current="page"` on the active one. A disabled tab (Boards, until Plan 4) is never selectable.

- [ ] **Step 1: Write the failing tests**
  - `select_mounts_lazily_and_hides_others`: register two fake factories. `select("tree")` calls only the Tree factory, once. Selecting `"tree"` again creates nothing new. Selecting `"galaxy"` hides the Tree.
  - `tabs_reflect_selection`: clicking the Galaxy tab sets `body.dataset.view === "galaxy"` and moves `aria-current` to it.
  - `open_reference_switches_view`: a view calling `deps.openReference("b")` leaves `current() === "reference"`, and the Reference view's `show` is called with `"b"`.
  - `disabled_tab_ignored`: clicking Boards changes nothing.
  - `static_source_notifies_and_versions`: `replace()` bumps `version` and calls each subscriber once. An unsubscribed callback is not called.
  - `op_ink_seed_extra_neutral`:
    - `opInk(seed, "sequence")` is `{ base: "var(--seq)", text: "var(--seq-text)", on: "var(--seq-on)" }`;
    - an added operation with `color: "teal"` resolves to `var(--x-teal)`, `var(--x-teal-text)` and `var(--x-teal-on)`;
  - a **seed** operation re-inked with `color: "rose"` resolves to `var(--x-rose)`, because `color` takes precedence over the seed mapping;
    - an operation id missing from the taxonomy, or one whose `color` is unknown, resolves to the neutral triple, and nothing throws.
  - `reference_view_unknown_op_is_neutral`: a reference with a tag under an operation that has no ink renders its callout with `--c: var(--ink-2)`, not amber.
  - `reference_view_refreshes_from_source`: after `source.replace(...)` adds a tag to the focused reference, the callout count goes up without `show()` (audit row 28).

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- shell data ops reference/view`. It should FAIL, then PASS.

- [ ] **Step 3: Wire `main.ts`**

  Mount the shell.
  1. Load settings, the library and the taxonomy in `main.ts`.
  2. Build a `staticSource` from them, and `replace` it after each import.
  3. Register `"reference"` around `mountReference(root, api, source)`.
  4. Register `"inbox"` here if Plan 2 Task 9 has landed (see "Dependencies").

- [ ] **Step 4: Commit**

  Commit message: `feat(ui): view switcher and shared data source`.

---

### Task 3: Canvas core (pure modules)

**Files:**
- Create:
  - `app/src/graph/constants.ts`;
  - `app/src/graph/camera.ts`;
  - `app/src/graph/spatial.ts`;
  - `app/src/graph/lod.ts`;
  - `app/src/graph/texcache.ts`.
- Test: a `*.test.ts` beside each of `camera`, `spatial`, `lod` and `texcache`.

**Interfaces:**
- Produces:
  ```ts
  export type Rect = { x: number; y: number; w: number; h: number };
  // camera.ts — world→screen: sx = (wx - x) * scale, sy = (wy - y) * scale
  export type Camera = { x: number; y: number; scale: number };
  export function zoomAt(c: Camera, sx: number, sy: number, factor: number): Camera;   // keeps the world point under (sx,sy) fixed; clamps scale
  export function pan(c: Camera, dsx: number, dsy: number): Camera;
  export function fit(bounds: Rect, view: { w: number; h: number }, pad?: number): Camera;   // pad default 40 px
  export function viewRect(c: Camera, view: { w: number; h: number }, margin?: number): Rect;  // margin default 0.1
  // spatial.ts
  export class SpatialGrid { constructor(cell: number); insert(id: string, r: Rect): void; clear(): void;
    query(r: Rect): string[]; hit(x: number, y: number): string | null }   // hit = topmost by insertion order
  // lod.ts
  export type Lod = "dot" | "thumb";
  export function lodFor(worldSize: number, scale: number): Lod;          // "dot" when worldSize*scale < DOT_PX
  // texcache.ts
  export class TexCache<T> { constructor(cap: number, load: (url: string) => Promise<T>, unload: (t: T) => void);
    get(url: string): T | "loading" | "failed"; touch(url: string): void; size(): number }
  ```

- [ ] **Step 1: Write the failing tests**
  - Camera:
    - `zoom_keeps_point_fixed`: for a random camera and point, the world point under `(sx, sy)` is the same within 1e-9 after `zoomAt`.
    - `scale_clamped`: zooming far in or out stays within `[0.05, 4]`.
    - `fit_contains_bounds`: `viewRect(fit(b, v), v, 0)` contains `b`.
  - Spatial:
    - `query_matches_bruteforce`: 2,000 random rectangles and 50 random queries return the same id sets as a brute-force intersection test.
    - `hit_topmost`: overlapping rectangles return the last inserted.
  - LOD:
    - `lod_threshold`: `lodFor(48, 0.2)` is `"dot"` (9.6 px) and `lodFor(48, 0.25)` is `"thumb"` (12 px).
  - Texture cache:
    - `lru_evicts_and_unloads`: with cap 2, a third `get` unloads the least recently touched texture.
    - `failed_is_sticky`: a rejecting loader gives `"failed"`, and a second `get` doesn't call the loader again (Review Focus 5).
    - `loading_dedupes`: two `get` calls before the promise settles call the loader once.

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- graph/`. It should FAIL, then PASS.

- [ ] **Step 3: Commit**

  Commit message: `feat(graph): camera, culling grid, LOD and texture cache`.

---

### Task 4: The PixiJS scene

**Files:**
- Create: `app/src/graph/scene.ts`.
- Modify: `app/package.json`, adding `pixi.js@^8` here, and `d3-force@^3` with `@types/d3-force` for Task 7.
- Test: `app/src/graph/scene.test.ts`, covering the fallback and the frame plan only. WebGL itself is checked by hand in Step 4.

**Interfaces:**
- Consumes Task 3.
- Produces:
  ```ts
  export type SceneNode =
    | { id: string; kind: "ref"; x: number; y: number; size: number; url: string; aspect: number; outline?: { region: Region; color: string; state: "full" | "partial" | "region" } }
    | { id: string; kind: "label"; x: number; y: number; text: string; font: "serif" | "mono"; color: string }
    | { id: string; kind: "op" | "branch" | "tech"; x: number; y: number; size: number; color: string; label: string };
  export type SceneEdge = { from: string; to: string; width: number; color: string; curve?: boolean };
  export type FramePlan = { visible: string[]; lod: Map<string, Lod> };
  export function planFrame(grid: SpatialGrid, nodes: Map<string, SceneNode>, cam: Camera, view: { w: number; h: number }): FramePlan;
  export interface Scene {
    setNodes(nodes: SceneNode[]): void;       // rebuilds the grid; keeps the camera
    setEdges(edges: SceneEdge[]): void;       // the caller decides which edges are visible
    camera(): Camera; setCamera(c: Camera, animate?: boolean): void; fitAll(): void;
    on(ev: "hover" | "select" | "activate", fn: (id: string | null) => void): void;   // activate = double-click or Enter
    setDraggable(pred: (id: string) => boolean): void;   // default: nothing is draggable
    onDrop(fn: (dragged: string, target: string | null) => void): void;   // target = node under the pointer on release
    select(id: string | null): void;          // also from the keyboard
    destroy(): void;
  }
  export function createScene(host: HTMLElement, api: Pick<Api, "assetUrl">): Promise<Scene>;   // rejects with WebGLUnavailable
  export class WebGLUnavailable extends Error {}
  export function mountCanvasOrFallback(host: HTMLElement, make: () => Promise<Scene>): Promise<Scene | null>;
  ```
- **Drawing a reference node:** an N5 tile (`--card`) of `size` world units, with the `thumb256` texture letterboxed through Plan 1's `tileBox(aspect, size, outline?.region)`. When the tile has an outline, it is stroked in the operation colour, using the state's line style (Review Focus: The Line Says the State). In `"dot"` LOD, the node is a 3 px dot in `--ink-2`.
- **Textures (Cross-plan audit row 3):**
  - Thumbnails load through an `HTMLImageElement` (`img.src = api.assetUrl(thumb256)`, then `Texture.from(img)`), with Pixi's `preferWorkers: false`.
  - Loading is then governed by the CSP's `img-src`, not `connect-src` or `worker-src`.
  - Plan 6 Task 1 Step 4 verifies this under the strict CSP.
- **Picking:** hover and select use `SpatialGrid.hit`, not Pixi's per-sprite events, so 2,000 sprites cost no listeners.
- **Dragging:** a pointer drag that starts on a node accepted by `setDraggable` moves a ghost of that node and fires `onDrop` on release; any other drag pans. Task 10 uses this to re-link techniques.
- **Theme:** colours are read from CSS custom properties when the scene is created, and again when a `MutationObserver` sees `data-theme` change on `<html>`.
- **Keyboard:** the canvas is focusable (`tabindex="0"`, `role="application"`, with an `aria-label` per view). The inspector's `aria-live="polite"` region announces the selection.
- **`webglcontextlost`:** stop the ticker. On `webglcontextrestored`, recreate textures from the cache's URLs.

- [ ] **Step 1: Write the failing tests**
  - `plan_frame_culls_and_lods`: 2,000 nodes on a 50×40 grid, with a camera showing about a tenth of them. `visible` equals the brute-force set inside `viewRect(…, 0.1)`, and every visible ref node at scale 0.1 is `"dot"`.
  - `drag_vs_pan`: with `setDraggable(id => id.startsWith("tech:"))`, the pure pointer-gesture classifier `classifyDrag(startHit, predicate)` returns `"drag"` for a technique node and `"pan"` for empty space or a branch node.
  - `fallback_message_when_no_webgl`: `mountCanvasOrFallback(host, () => Promise.reject(new WebGLUnavailable()))` resolves `null`, and `host` contains exactly the text "This view needs WebGL, which isn't available here. The Reference view still works." (Review Focus 1).

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- graph/scene`. It should FAIL, then PASS. Run `npm run build` too.

- [ ] **Step 3: Add a dev harness**

  The harness is `?scene-demo` on the dev URL, and only `import.meta.env.DEV` builds it. It renders 2,000 synthetic ref nodes on a grid.

- [ ] **Step 4: Manual check**

  Run `npm run tauri dev` and open the harness. Expected:
  - Wheel zoom stays anchored under the cursor.
  - Drag pans.
  - `0` fits.
  - Pixi's ticker reports at least 55 fps while panning on the development machine.
  - At far zoom the tiles become dots.
  - Switching the theme recolours the canvas without a reload.

- [ ] **Step 5: Commit**

  Commit message: `feat(graph): PixiJS scene with culling, LOD, picking and WebGL fallback`.

---

### Task 5: The taxonomy graph model, and the Tree and Radial layouts

**Files:**
- Create:
  - `app/src/graph/taxgraph.ts`;
  - `app/src/graph/layout-tree.ts`;
  - `app/src/graph/layout-radial.ts`.
- Test: a `*.test.ts` beside each.

**Interfaces:**
- Consumes `Snapshot` (Task 2) and the constants (Task 3).
- Produces:
  ```ts
  export type TaxNode =
    | { id: string; kind: "op"; opId: string; count: number }
    | { id: string; kind: "branch"; branchId: string; opId: string; domainId: string; count: number }
    | { id: string; kind: "tech"; techId: string; parents: string[] /* branch ids, taxonomy order */; count: number }
    | { id: string; kind: "ref"; refId: string; via: { techId: string; branchId: string; region?: Region; state: "full" | "region" } };
  export type TaxGraph = { nodes: Map<string, TaxNode>; children: Map<string, string[]> };   // op→branches, branch→techs, tech→refs
  export function buildTaxGraph(s: Snapshot, expanded?: Set<string> | "all" /* tech node ids whose refs are included */): TaxGraph;
  export type Placed = Map<string, { x: number; y: number }>;
  export function layoutTree(g: TaxGraph): Placed;
  export function layoutRadial(g: TaxGraph, opId: string): Placed;
  ```
- **Node ids:** `op:<id>`, `br:<branchId>`, `tech:<techId>` and `ref:<techId>:<refId>`. A reference appears once under each expanded technique it is tagged with.
- **Counts:** the number of distinct references tagged with the technique, under that branch, or under that operation. Partial tags count toward their operation only.
- **Tree layout:**
  - **Rows:** y is `0`, `BAND_GAP`, `2·BAND_GAP` and `3·BAND_GAP` for operations, branches, techniques and references.
  - **Branches** are grouped under their operation, in taxonomy order.
  - **A technique with several parents** is placed **once**, at the mean x of its parent branches (barycentre), and then pushed apart left to right to a minimum spacing of `NODE + 16`.
  - **References** of an expanded technique sit in a column under it, sharing its x, at y = `3·BAND_GAP + k·(NODE + 8)`. A column keeps "Show all" (decision 3) from making the band thousands of tiles wide; culling (Task 4) handles tall columns.
  - **Operations:** however many the taxonomy has, 1 to 9, in taxonomy order.
  - Edges are orthogonal hairlines from each parent. This is how a DAG is drawn without duplicating nodes.
- **Radial layout:**
  - **Centre:** the operation, at (0, 0).
  - **Ring 1** (radius `BAND_GAP`): its branches, spaced evenly.
  - **Ring 2** (radius `2·BAND_GAP`): its techniques, each at the circular mean angle of its parent branches inside this operation, then spread to a minimum arc spacing.
  - **Ring 3** (radius `3·BAND_GAP`, growing so the arc spacing stays at least `NODE + 8`): every reference tagged under this operation. Each sits at the circular mean angle of its techniques here.
  - Radial always expands all of its techniques, so culling (Task 4) carries the load.

- [ ] **Step 1: Write the failing tests**
  - `tax_graph_counts`: with the bundled seed taxonomy and 3 references (one partial under `infer`, two tagged `chiaroscuro`), `tech:chiaroscuro.count === 2`, `op:infer.count === 1`, and no node is created for a partial tag.
  - `tree_bands_ordered`: every node's y equals its band's value.
  - `tree_technique_once_between_parents`: in the seed, a technique with two parent branches has exactly one node. Its x lies within the parents' x range, or was pushed less than `NODE + 16` beyond it.
  - `tree_no_overlap`: within each band, neighbouring x values differ by at least `NODE + 16`.
  - `radial_rings`: every branch, technique and reference node lies on its ring within 1e-6 (or on the grown ring 3). All references tagged under the operation are present.
  - `radial_single_tech_ref_angle`: a reference with one technique under the operation shares that technique's angle.
  - `show_all_columns`: with `expanded = "all"` on 3 techniques and 5 references, every reference node's x equals its technique's x, and the y values in each column are strictly increasing in steps of `NODE + 8`.
  - `dynamic_operation_count`: a taxonomy with 5 operations gives 5 `op:` nodes on band 0, with no overlap. With 1 operation, the layout still has finite coordinates.
  - `empty_library_no_nan`: with zero references, every placed coordinate is finite (Review Focus 2).

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- graph/taxgraph graph/layout`. It should FAIL, then PASS.

- [ ] **Step 3: Commit**

  Commit message: `feat(graph): taxonomy graph model with tree and radial layouts`.

---

### Task 6: The Tree view and its inspector (read-only)

**Files:**
- Create:
  - `app/src/views/tree.ts`;
  - `app/src/views/inspector.ts`.
- Modify:
  - `app/src/main.ts`: register `"tree"`;
  - `app/src/styles.css`: inspector styles, from DESIGN.md's margin column, callout card and record header.
- Test:
  - `app/src/views/inspector.test.ts`;
  - `app/src/views/tree.test.ts`, using a fake `Scene`.

**Interfaces:**
- Consumes `createScene` and `mountCanvasOrFallback` (Task 4), `buildTaxGraph` and `layoutTree` (Task 5), `DataSource` (Task 2), and `tileBox` (Plan 1 Task 8).
- Produces:
  ```ts
  export function mountTree(host: HTMLElement, data: DataSource, deps: { api: Api; openReference(id: string): void;
    makeScene?: (el: HTMLElement) => Promise<Scene> }): ViewHandle;
  export type Selection = { kind: "op" | "branch" | "tech" | "ref"; id: string } | null;
  export function renderInspector(el: HTMLElement, s: Snapshot, sel: Selection, opts: { editable: boolean }): void;
  ```
- **Layout:** a canvas on the left; the inspector on the right, 340 px wide, with the DESIGN.md margin styles.
- **The inspector:**
  - **The breadcrumb, at the top:** four cells keyed "01 Operation", "02 Domain", "03 Technique" and "04 Reference", reusing the record-header cell styles at the inspector's width. They fill to the depth of the selection, and empty cells show a tertiary-ink em dash.
  - **Below it**, depending on the selection:
    - **Operation:** its plain label, name, description and count.
    - **Branch:** the domain name and description, plus its techniques as a list of buttons with counts.
    - **Technique:**
      - its name (serif), definition and synonyms;
      - a "Used under" list of parent branches;
      - a grid of the 64 px tiles of its references, built with `tileBox`, letterboxed with the region outlined (ruling a1).
      - Clicking a tile opens that reference.
    - **Reference:** its title, plus an "Open in Reference view" button.
- **Selecting a technique** expands it on the canvas: the graph is rebuilt with that `tech:` id in `expanded`. Only one technique is expanded at a time.
- **"Show all references" (decision 3):**
  - A toggle button above the canvas (`aria-pressed`), off by default and remembered for the session.
  - When it is on, the graph is built with `expanded = "all"`.
  - Culling and far-zoom dots keep it smooth; Task 11 measures it.
- **Board scope (audit row 10):** reference nodes with `inScope(id) === false` are drawn in the dot LOD at every zoom and can't be selected.
- **Keyboard on the canvas:**
  - ← and → move to the previous or next sibling;
  - ↑ moves to the parent (the first parent, for a technique);
  - ↓ moves to the first child;
  - Enter on a reference opens it;
  - Esc clears the selection.
- **The selected path is coloured.** The operation node, branch, technique and their connectors take the operation's ink; everything else stays hairline `--line-2`.
- **A data change** rebuilds the graph and the layout. The camera is kept, and so is the selection if its id still exists; otherwise the selection is cleared (Review Focus 3).

- [ ] **Step 1: Write the failing tests**
  - Inspector, using the seed taxonomy and 3 references:
    - `breadcrumb_fills_to_depth`: a technique selection fills cells 01–03, and cell 04 is the em dash.
    - `tech_tiles_use_letterbox`: a reference tagged on a region shows a `.treg` whose `el.style.left`, `top`, `width` and `height`, read after mounting and not from the markup (Cross-plan audit row 26), equal `tileBox(aspect, 64, region).outline` in px.
    - `ref_open_button`: clicking "Open in Reference view" calls `openReference` with that id.
  - Tree, with a fake `Scene` that records the `setNodes`, `setEdges` and `select` calls:
    - `selecting_tech_expands_its_refs`: after `select("tech:chiaroscuro")`, the nodes include both `ref:chiaroscuro:*` ids.
    - `show_all_toggle`: pressing "Show all references" gives a `setNodes` call that contains a `ref:` node for every (technique, reference) tag pair. Pressing it again returns to the selected technique only.
    - `out_of_scope_refs_are_dots`: with `inScope` false for one reference, its node is planned as `"dot"` at scale 1, and clicking it selects nothing.
    - `arrow_up_goes_to_parent`: from `tech:X`, ↑ selects `br:<first parent>`.
    - `data_change_keeps_selection_or_clears`: replacing the snapshot keeps the selection while it exists, and clears it once the reference is removed.
    - `fallback_has_inspector`: when `makeScene` rejects with `WebGLUnavailable`, the inspector still renders the operation list as buttons, so the Tree stays usable without a canvas (Review Focus 1).

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- views/`. It should FAIL, then PASS.

- [ ] **Step 3: Manual check**

  Run `npm run tauri dev` on the demo library. Expected:
  - The four bands are visible.
  - Clicking *Chiaroscuro* lists its demo references as letterboxed tiles.
  - The path colours.
  - Enter on a reference opens the Reference view.

- [ ] **Step 4: Commit**

  Commit message: `feat(ui): taxonomy Tree view with docked inspector and breadcrumb`.

---

### Task 7: The Galaxy view

**Files:**
- Create:
  - `app/src/graph/force.ts`: the pure simulation setup, testable in Node;
  - `app/src/graph/force.worker.ts`;
  - `app/src/views/galaxy.ts`.
- Modify: `app/src/main.ts`, to register `"galaxy"`.
- Test:
  - `app/src/graph/force.test.ts`;
  - `app/src/views/galaxy.test.ts`, using a fake `Scene` and a fake worker.

**Interfaces:**
- Consumes `api.graphEdges` (Task 1), `Scene` (Task 4) and `DataSource` (Task 2).
- Produces:
  ```ts
  export type ForceIn = { ids: string[]; edges: Edge[]; seed: number; prev?: Record<string, { x: number; y: number }> };
  export function runForce(input: ForceIn, ticks: number): Record<string, { x: number; y: number }>;   // synchronous; the worker calls it in batches
  export function initialPosition(id: string, seed: number): { x: number; y: number };   // deterministic from a hash of id
  // worker protocol
  type ToWorker = { type: "start"; input: ForceIn } | { type: "stop" };
  type FromWorker = { type: "tick"; ids: string[]; xy: Float32Array /* transferable, 2 per id */; alpha: number } | { type: "end" };
  export function mountGalaxy(host: HTMLElement, data: DataSource, deps: { api: Api; openReference(id: string): void;
    openCompare?(a: string, b: string): void;   // Plan 4 mountCompare, wired in main.ts when present
    makeScene?: …; makeWorker?: () => Worker }): ViewHandle;
  ```
- **The simulation:**
  - `forceLink(edges)`, with `strength = score` and `distance = 40 + 160 × (1 − score)`;
  - `forceManyBody`, with strength −30;
  - `forceCenter`;
  - `forceRadial(R_OUT)`, strength 0.08, applied **only** to references with no edges, so untagged references form an outer ring. `R_OUT` is 1.25 times the radius of the connected cluster, measured after warm-up.
- **Warm start:** nodes that are in `prev` start at those positions. A new node starts at the mean of its neighbours that have a `prev` position, or at `initialPosition` if none do.
- **The worker** posts a `tick` message every 10 ticks. It stops when alpha drops below 0.01, or after 600 ticks.
- **Nodes:** each reference is a `NODE`-sized ref node, drawn with the full image (no region outline).
- **Edges:**
  - **Hover:** the hovered reference's top `K_EDGES` edges, neutral `--ink-2`, with width `EDGE_W0 + EDGE_W1 × score`.
  - **Select:** the selected reference keeps its edges until Esc.
  - **Shift-click (Cross-plan audit row 25, SPEC §5 Compare):** Shift-clicking a reference node while another is selected calls `openCompare(selected, clicked)`.
  - **Board scope (audit row 10):** references out of scope are dots, and none of their edges are drawn.
  - Otherwise no edges are drawn.
- **The inspector, on selection:** the title; the ranked neighbours, each with "shares *technique*, …" in serif names and the score in mono; and "Open in Reference view".
- **Empty states:**
  - "No references yet." when the library has none.
  - "Tag references to see them cluster." as an inspector note when no reference has edges (Review Focus 2).

- [ ] **Step 1: Write the failing tests**
  - Force:
    - `two_cliques_separate`: two 10-node cliques with internal score 0.8 and one bridge at 0.06. After `runForce(…, 300)`, the mean distance between cliques is more than twice the mean distance within a clique.
    - `deterministic`: the same input and seed give identical output.
    - `zero_degree_on_outer_ring`: five isolated nodes all end farther from the centroid than every connected node.
    - `warm_start_moves_less`: add one node to a settled 50-node layout. The old nodes' mean displacement after `runForce(prev, 100)` is less than 25% of their displacement from a cold start.
    - `no_nan`: with 0 edges and 3 nodes, every coordinate is finite.
  - Galaxy:
    - `edges_only_on_hover`: after the layout, `setEdges` was last called with `[]`. A hover on `a` calls it with exactly `a`'s edges, each with `width === 0.75 + 2.25 * score`. A hover on `null` calls it with `[]` again.
    - `select_pins_edges`: after `select("a")`, a hover on `b` and then on `null` leaves `a`'s edges drawn.
    - `shift_click_opens_compare`: with `a` selected, a Shift-click on `b` calls `openCompare("a", "b")`. Without a selection, it only selects `b`.
    - `out_of_scope_no_edges`: hovering a reference whose neighbour is out of scope draws no edge to that neighbour.
    - `data_change_warm_starts`: replacing the snapshot posts `start` with `prev` holding every previously placed id.
    - `empty_library_copy`: zero references render "No references yet."

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- graph/force views/galaxy`. It should FAIL, then PASS.

- [ ] **Step 3: Manual check**

  Run `npm run tauri dev` on the demo library. Expected:
  - The clusters settle within about 2 s.
  - Hovering shows edges.
  - The UI never freezes while the layout runs, so the worker is doing the work.

- [ ] **Step 4: Commit**

  Commit message: `feat(ui): Galaxy view with worker force layout and hover edges`.

---

### Task 8: The Radial view

**Files:**
- Create: `app/src/views/radial.ts`.
- Modify: `app/src/main.ts`, to register `"radial"`.
- Test: `app/src/views/radial.test.ts`, using a fake `Scene`.

**Interfaces:**
- Consumes `buildTaxGraph` and `layoutRadial` (Task 5), and the Tree's `renderInspector` and selection handling (Task 6), reused, not copied.
- Produces:
  ```ts
  export function mountRadial(host: HTMLElement, data: DataSource, deps: { api: Api; openReference(id: string): void;
    makeScene?: …; initialOp?: string }): ViewHandle;
  ```
- **The operation switch:** a segmented control above the canvas, with one button per taxonomy operation (1–9, in taxonomy order).
  - Each button shows the operation's plain label and an `opInk` swatch of 10 px.
  - Keys `1`–`9` switch while the canvas has focus. The control wraps to a second row past five operations.
- **Defaults and memory:** the default is the operation with the most tagged references. The choice is remembered for the session.
- **Reference nodes** sit on ring 3. Each is drawn with its region outline when it is on the ring because of a region-tagged technique (ruling a1).
- **The connector from a technique to its references** is drawn only for the hovered or selected technique, using the operation's ink, as on the Tree's selected path. This applies the "edges only on hover" rule to the outer ring.

- [ ] **Step 1: Write the failing tests**
  - `switch_operation_relayouts`: clicking "Lead the eye" calls `setNodes`, and the result contains only `sequence` branches and techniques.
  - `default_op_is_busiest`: with two references under `infer` and one under `group`, the first render is `infer`.
  - `key_3_selects_sequence`: pressing `3` on a focused canvas selects "Lead the eye".
  - `renders_dynamic_ops`: with a fifth operation added ("Unsettle", `color: "rose"`), 5 buttons render, `5` selects it, and its swatch is `var(--x-rose)`.
  - `out_of_scope_refs_are_dots`: as in Task 6.
  - `radial_shares_inspector`: selecting a technique renders the same inspector markup as the Tree does for that selection. The comparison uses `renderInspector`'s output.

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- views/radial`. It should FAIL, then PASS.

- [ ] **Step 3: Commit**

  Commit message: `feat(ui): Radial view as a layout mode over the taxonomy graph`.

---

### Task 9: Taxonomy edits (Rust)  ⚑ needs Plan 2 Tasks 1–3 and 5

**Files:**
- Modify:
  - `app/src-tauri/src/edit.rs` (Plan 2);
  - `app/src-tauri/src/taxonomy.rs`;
  - `app/src-tauri/src/commands.rs`;
  - `app/src-tauri/src/lib.rs`;
  - `app/src/api.ts`.

**Interfaces:**
- Consumes Plan 2's `Edit`, `apply`, `Applied`, `Touched`, `EditError::InUse`, `History`, `Taxonomy::save` and `find_by_name`, and its `Change` command pattern.
- **Extends `Edit`** with variants that invert to each other:
  ```rust
  UpdateTechnique { before: Technique, after: Technique },     // same id; rename / define / synonyms
  UpdateDomain    { before: Domain,    after: Domain },        // same id; name / description / icon
  UpdateOperation { before: Operation, after: Operation },     // same id; name / plain_label / description / color
  AddOperation    { op: Operation },                           // inverse: RemoveOperation at the appended index
  RemoveOperation { index: usize, op: Operation },             // InUse while any branch or tag uses it
  AddDomain       { domain: Domain },                          // inverse: RemoveDomain
  RemoveDomain    { index: usize, domain: Domain },            // InUse while any branch uses it
  LinkTechnique   { link: BranchTechnique },                   // inverse: UnlinkTechnique at the appended index
  UnlinkTechnique { index: usize, link: BranchTechnique },
  AddBranch       { branch: Branch },                          // inverse: RemoveBranch
  RemoveBranch    { index: usize, branch: Branch },            // InUse if any link or tag uses it
  ```
- **Adds these commands.** Each returns Plan 2's `Change`, and each is one undo step:
  ```
  update_technique(id, patch: { name?: String, description?: String, synonyms?: Vec<String> }) -> Change
  update_domain(id, patch: { name?: String, description?: String, icon?: String }) -> Change
  add_domain(name, description, icon: Option<String>, operation_id: Option<String>) -> Change
      // Change.created = new id; with operation_id: one Batch([AddDomain, AddBranch]) = one undo step
  delete_domain(id, move_to: Option<DomainMove>) -> Change          // Err("NeedsMove") if any branch uses it and None
  add_operation(name, plain_label, description, color: Option<String>) -> Change   // Change.created = new id
  update_operation(id, patch: { name?: String, plainLabel?: String, description?: String, color?: Option<String> }) -> Change
      // patch.color: key absent = keep; null = reset to None (seed default ink or neutral); "rose" = set. Rust: Option<Option<String>> with #[serde(default, deserialize_with = double_option)]
  delete_operation(id, move_to: Option<OpMove>) -> Change           // Err("NeedsMove") if in use and None
  link_technique(technique_id, branch_id) -> Change                  // drag-to-re-link
  unlink_technique(technique_id, branch_id, move_to: TagMove) -> Change
  delete_technique(id, move_to: Option<TagMove>) -> Change          // Err("NeedsMove") if in use and None
  add_branch(operation_id, domain_id) -> Change                      // "+" on the domain band
  ```
  ```rust
  #[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
  pub enum TagMove { Technique { technique_id: String, branch_id: String }, Partial }
  #[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
  pub enum OpMove { Operation { operation_id: String }, Delete }
  #[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
  pub enum DomainMove { Domain { domain_id: String }, Delete }
  pub const MAX_OPS: usize = 9;
  pub const EXTRA_INKS: [&str; 5] = ["teal", "olive", "rose", "indigo", "umber"];   // values in DESIGN.md (Task 10)
  pub const DOMAIN_ICONS: [&str; 8];   // the six seed domain icon descriptions + "a plain square" + "a dot inside a ring"; default "a plain square"
  ```
- **`api.ts` mirrors these** as `TagMove`, `OpMove` and `DomainMove` (tagged by `kind`), with wrappers for every command above, and adds them as rows in `src/api.contract.test.ts`.
- **One re-key helper** backs every operation or domain move:

  `fn rekey_branch(data, tax, from: &str, to_op: &str, to_domain: &str) -> Vec<Edit>`

  It builds these edits, in order:
  1. `AddBranch(to)` if the target branch is missing;
  2. `LinkTechnique` for each of `from`'s links that `to` lacks;
  3. a `ReplaceTag` for every tag on `from`, with `branch_id = to` and `operation_id = to_op`;
  4. `UnlinkTechnique` for `from`'s links, in descending index order;
  5. `RemoveBranch(from)`.

  The resulting branch id is `<to_op>.<to_domain>`.
- **`delete_operation(id, Operation { target })`** builds one `Batch`:
  - `rekey_branch` for each of its branches onto `(target, same domain)`;
  - a `ReplaceTag` that moves each of its partial tags to `target`;
  - `RemoveOperation`.
- **`delete_operation(id, Delete)`** builds one `Batch`:
  - `RemoveTags` for every tag whose `operation_id` is `id`, including partial tags;
  - unlink and remove its branches;
  - `RemoveTechnique` for each technique left with no link;
  - `RemoveOperation`.

  The confirmation dialog states every count first.
- **`delete_domain(id, Domain { target })`** re-keys each `op.id` branch onto `op.target`, then runs `RemoveDomain`.
- **`delete_domain(id, Delete)`:**
  - the tags on its branches become partial, keeping their operation;
  - links and branches are removed;
  - techniques left with no link are removed;
  - then `RemoveDomain` runs.
- **Batch order for every multi-item delete or move** (`rekey_branch` called in a loop, `delete_operation`, `delete_domain`):
  - All additions and `ReplaceTag`s come first.
  - Then every removal is emitted in **descending index order, grouped by collection**: `UnlinkTechnique` (over `branch_techniques`), then `RemoveBranch`, `RemoveTechnique`, `RemoveDomain` and `RemoveOperation`.
  - The builder computes those indices against the taxonomy as it stands after the additions. It does so by building the `Batch` against a scratch clone, so each recorded index matches the live state at its step. The reversed inverse then re-inserts in ascending order.
  - Test: `multi_branch_batch_indices`.
- **New ids** come from the slugified name, with `-2`, `-3` and so on when taken (the same rule as Plan 2 `custom_technique`).
- **`add_operation`'s default `color`** is the first entry in `EXTRA_INKS` that no operation uses, or `None` (neutral) when all five are taken.
- **`delete_technique` and `unlink_technique`** each build one `Batch`, in this order:
  1. a `ReplaceTag` for every affected tag:
     - with `TagMove::Technique`, the tag takes the target `technique_id` and `branch_id`, **and the target branch's `operation_id`**, with `suggested: false`. One target can then serve a technique used under several operations; undo restores each tag's full `before`, original operation included;
     - with `Partial`, the tag is reduced to `{operation_id}` and keeps its own operation;
  2. the `UnlinkTechnique`s, in **descending** index order, so each removal leaves the remaining indices valid and the reversed inverse re-inserts in ascending order;
  3. for a delete, `RemoveTechnique`.

  A tag counts as affected when it uses the technique (for a delete) or the pair (technique, branch) (for an unlink). Undo restores all of it (Review Focus 4).
- **Validation:**
  - A name must be non-empty and unique case-insensitively, through `find_by_name`. The error is `"NameTaken:<id>"`.
  - A technique must keep at least one link. Unlinking the last link returns `Err("LastLink")`; delete the technique instead.
  - A `TagMove::Technique` target must be a linked (technique, branch) pair other than the one being removed; each re-pointed tag passes `edit::validate_tag`.
  - `RemoveBranch` is used by `rekey_branch` and the deletes. There is no separate "delete branch" command: a branch disappears when its operation or domain does, or is emptied by a move.
  - **Operations:**
    - at least one must remain (`Err("LastOperation")`);
    - at most `MAX_OPS` (`Err("TooManyOperations")`);
    - names and plain labels must be non-empty and unique, case-insensitively (`NameTaken:<id>`, `LabelTaken:<id>`);
    - `color` must be `None` or one of `EXTRA_INKS` (`Err("UnknownInk")`). A seed operation may keep `None`, because `opInk` maps it by id.
  - **Domains:** names must be unique, and `icon` must be one of `DOMAIN_ICONS` or a seed value (`Err("UnknownIcon")`).
  - **A move target** must differ from the item being deleted.
  - **`validate_seed` stays seed-only.** Every edited taxonomy is checked with `validate()` (Plan 1 Task 3 split). Each command calls `validate()` after `apply` and before `record`; on failure it reverts with the inverse and returns the error.
- **Plan 1 Task 3 deferred minor:** add the table-driven `validate()` mutation tests here, because this is the first plan to change taxonomy structure.

- [ ] **Step 1: Write the failing tests**, in `edit.rs` and `commands.rs`, on the seed taxonomy plus a 3-reference library:
  - `update_technique_inverse_restores`: renaming *Chiaroscuro* to "Light and shadow" and then applying the inverse restores the name; the id never changes.
  - `rename_collision`: renaming to "pop out " returns `NameTaken:pop-out`.
  - `delete_moves_tags_and_undo_restores`: with two references tagged *Rim light* (one with a region), `delete_technique("rim-light", Technique { silhouette, differentiate.feature })` re-points both tags, keeping their regions. Then `undo()` restores the technique, all its links and both tags at their original indices.
  - `delete_to_partial`: `TagMove::Partial` leaves the tags with `operation_id` only.
  - `unlink_last_link_refused`: returns `Err("LastLink")`, and the history is unchanged.
  - `move_repoints_operation`: deleting a technique used under `differentiate` and `sequence`, moving its tags to (`leading-lines`, `sequence.space`), leaves every moved tag with `operation_id: "sequence"`. `undo()` restores each original `operation_id`.
  - `unlink_many_descending`: unlinking a technique from two branches in one batch removes exactly those two links, and the inverse restores the original `branchTechniques` order.
  - `delete_unused_needs_no_move`: `delete_technique(id, None)` on an unused custom technique succeeds; on a used one it returns `Err("NeedsMove")` and changes nothing.
  - `tag_move_json_camel`: `TagMove::Technique` serialises as `{"kind":"technique","techniqueId":…,"branchId":…}`.
  - `add_branch_then_link`: `add_branch("group", "semantic")` followed by `link_technique("semantic-compounding", "group.semantic")` validates. Two `undo` calls restore the seed exactly, value-equal through `serde_json::Value`.
  - `remove_branch_in_use`: returns `InUse`.
  - `validate_rejects_mutations`: a table of single mutations to the seed, each rejected with a named error:
    - a dangling `techniqueId` in `branchTechniques`;
    - a branch with an unknown `operationId`;
    - a duplicate technique id;
    - a technique with no link;
    - a duplicate link.
  - `add_operation_defaults_ink`: the first `add_operation` gets `color: "teal"`, and the second gets `"olive"`. `undo` removes it. A tenth operation returns `TooManyOperations`.
  - `rename_operation_label`: `update_operation("differentiate", { plainLabel: "Pop" })` changes the label. A duplicate label returns `LabelTaken`. `search(tax, data, "pop")` now matches Differentiate techniques, which shows that search reads labels from the taxonomy.
  - `delete_operation_moves_branches`: deleting `group` with `Operation { "differentiate" }` re-keys every `group.*` branch to `differentiate.*`, merging into existing branches without duplicate links. All `group` tags, partial ones included, now carry `differentiate`. One `undo` restores the taxonomy and data, value-equal.
  - `delete_operation_delete`: `OpMove::Delete` removes the operation's tags and branches, plus techniques that no longer have any link. `undo` restores everything.
  - `last_operation_refused`: deleting the only remaining operation returns `LastOperation`.
  - `delete_domain_moves_or_partials`: deleting `social` with `Domain { "semantic" }` re-keys `*.social` to `*.semantic`. With `Delete`, its tags become partial and keep their operation. Each case is one undo step.
  - `add_domain_then_branch`: `add_domain("Rhythm", "…", None, None)` gets `icon: "a plain square"`. Then `add_branch("sequence", "rhythm")` and a `link_technique` both validate.
  - `add_domain_with_op_is_one_step`: `add_domain("Rhythm", "…", None, Some("sequence"))` creates the domain and `sequence.rhythm`. One `undo` removes both.
  - `multi_branch_batch_indices`: deleting an operation with 3 branches and 7 links, some of them adjacent in `branchTechniques`, removes exactly those items. The inverse restores `branches`, `branchTechniques` and `techniques` in their original order, value-equal.
  - `reink_seed_operation`: `update_operation("differentiate", { color: Some("rose") })` stores `"rose"`, and `{ color: None }` (explicit) clears it. Omitting `color` leaves it unchanged.
  - `op_move_json_camel`: `OpMove::Operation` serialises as `{"kind":"operation","operationId":…}`.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test edit:: taxonomy:: commands::`. It should FAIL, then PASS. Then run clippy with `-D warnings`.

- [ ] **Step 3: Commit**

  Commit message: `feat(core): undoable taxonomy, operation and domain edits with moves`.

---

### Task 10: Taxonomy editing in the Tree inspector  ⚑ needs Plan 2 Task 7 and Task 9 here

**Files:**
- Modify:
  - `app/src/views/inspector.ts`;
  - `app/src/views/tree.ts`;
  - `app/src/data.ts`: add `storeSource(store)`;
  - `app/src/main.ts`: switch the graph views to `storeSource` so every `Change` refreshes them;
  - `DESIGN.md`: add "Extra operation inks";
  - `app/src/styles.css`: add the `--x-*` ink tokens for both themes.
- Create:
  - `app/src/views/move-tags.ts`, the move dialogs;
  - `app/src/views/technique-form.ts`, Plan 3's own small "new technique" form (Cross-plan audit row 6).
- Test:
  - `app/src/views/inspector-edit.test.ts`;
  - `app/src/views/move-tags.test.ts`;
  - `app/src/inks.test.ts`;
  - `app/src/data.test.ts` (extended).

**Interfaces:**
- Consumes the Task 9 commands through `api`; `Store`, `Change` and `store.subscribe` from Plan 2 Task 7; and `renderInspector` (Task 6).
- Produces:
  ```ts
  export function storeSource(store: Store): DataSource;   // version bumps on every applied Change; inScope from Plan 4's store.inScope when present
  export function openMoveBranches(host: HTMLElement, ctx: { s: Snapshot; kind: "op" | "domain"; id: string }):
    Promise<OpMove | DomainMove | null>;
  export function mountTechniqueForm(host: HTMLElement, api: Api, branchId: string): void;   // calls api.addTechnique({ name, description, operationId, domainId }, null)
  export function openMoveTags(host: HTMLElement, ctx: { s: Snapshot; techId: string; branchId?: string /* unlink */ }):
    Promise<TagMove | null>;   // null = cancelled
  ```
- **With `editable: true`, the inspector offers:**
  - **Name:** click to edit inline. Enter saves through `updateTechnique` or `updateDomain`; Esc cancels. A `NameTaken:<id>` error shows "That name is taken by <Name>." beside the field.
  - **Definition:** a textarea that saves on blur.
  - **Synonyms:** chips. "+ synonym" adds one, × removes one, and each change saves.
  - **"Used under":** each parent has an "×", which unlinks through the move-tags dialog when any tag uses that pair.
  - **"Delete technique…":** a confirmation. Anything in use goes through the move-tags dialog first.
  - **Operations (decision 1):**
    - the name, plain label and description are editable inline;
    - **ink:** a swatch row of the operation's current ink plus the free `EXTRA_INKS`, each with its name as an `aria-label`;
    - "Delete operation…" opens `openMoveBranches`. Its options are "Move its branches and tags to <operation>", which re-keys them, and "Delete them and their tags". The second states the counts: "N tags on M references, K techniques left with no other place".
  - **Domains (decision 2):** name, description and an icon picker over `DOMAIN_ICONS`, which shows each description as text until Plan 6 draws the glyphs. "Delete domain…" opens `openMoveBranches` with "Move to <domain>" or "Delete; tags become partial".
- **Drag to re-link:** dragging a technique node onto a branch node calls `linkTechnique`. While dragging, a valid target outlines in its operation ink, and an invalid target (already linked) shows `not-allowed`. Keyboard alternative: "Also use under…" in the inspector opens a branch list.
- **"+" on the bands:**
  - On the technique band of a branch, it opens `mountTechniqueForm` with that branch fixed (audit row 6: Plan 2's form lives inside `mountPicker` and isn't exported).
  - On the domain band of an operation, it lists the domain types not yet used under that operation, plus "New domain type…", which calls `addDomain(name, description, icon, operationId)`: one call, one undo step.
  - **On the operation band:** "New operation…" asks for a name, plain label and description, then calls `addOperation`. It is disabled at `MAX_OPS`, with the title "Up to 9 operations".
- **The move-tags dialog:**
  - The title reads "N references use <Technique>". For an unlink it reads "N references use <Technique> under <Op · Domain>".
  - Option 1, "Move them to…", lists every linked (technique, branch) pair as "Technique — Op · Domain", except the technique being deleted (or the pair being unlinked), with a search. A moved tag takes the chosen branch's operation (Task 9).
  - Option 2 is "Keep them as partial tags (operation only)".
  - The buttons are "Move and delete" (or "Move and unlink") and "Cancel".
  - Neither option is pre-selected.
- **Undo:** after any edit, Ctrl+Z (Plan 2's undo keys) reverts it, and the Tree, Galaxy and Radial views refresh through `storeSource`.
- **Extra operation inks (decision 1):**
  - DESIGN.md gains a named set of five inks: Teal (hue ≈ 180°), Olive (≈ 70°), Rose (≈ 335°), Indigo (≈ 245°, kept clear of Iris's purple, about 285°) and Umber (≈ 25°, darker and less saturated than Vermilion).
  - Each has a light and a dark base, a `-text` and an `-on` variant, written as `--x-<name>`, `--x-<name>-text` and `--x-<name>-on`.
  - The Operation-Only Chroma Rule is unchanged: these inks only ever name an operation.

- [ ] **Step 1: Write the failing tests**
  - `rename_inline_calls_api`: editing the name and pressing Enter calls `updateTechnique(id, { name })` once. Esc calls nothing.
  - `name_taken_message`: when the fake api rejects with `"NameTaken:pop-out"`, the inspector shows "That name is taken by Pop-out."
  - `delete_in_use_opens_dialog`: deleting a technique used by 2 references opens the dialog with "2 references use Rim light". Choosing "Keep them as partial tags" calls `deleteTechnique(id, { kind: "partial" })`. An unused technique calls `deleteTechnique(id, null)`.
  - `delete_unused_skips_dialog`: an unused custom technique deletes after the confirmation only.
  - `move_targets_exclude_self`: the dialog lists every linked pair except those of the technique being deleted. For an unlink, only the unlinked pair is excluded.
  - `no_default_choice`: the confirm button stays disabled until an option is chosen.
  - `store_source_bumps_on_change`: applying a `Change` to a fake store notifies the subscribers with a higher `version`.
  - `drop_on_branch_links`: dispatching the drag sequence from `tech:X` to `br:group.semantic` on the fake scene calls `linkTechnique("X", "group.semantic")`.
  - `new_operation_flow`: "New operation…" with name "Unsettle" and label "Make it uneasy" calls `addOperation("Unsettle", "Make it uneasy", "", null)`. The button is disabled when 9 operations exist.
  - `ink_picker_lists_free_inks`: with Teal taken, the picker offers Olive, Rose, Indigo and Umber, plus the current ink. Choosing Rose calls `updateOperation(id, { color: "rose" })`.
  - `delete_operation_dialog`: in-use deletion shows both options with counts. Neither is pre-selected, and choosing "Move… to Stand out" calls `deleteOperation(id, { kind: "operation", operationId: "differentiate" })`.
  - `technique_form_calls_add`: the form calls `api.addTechnique({ name, description, operationId, domainId }, null)` with the fixed branch's operation and domain.
  - `inks_contrast_and_distinct`, in `inks.test.ts`, parses `styles.css`. For all 9 inks (4 seed and 5 extra), in both themes:
    - `-text` against `--panel` is at least 4.5:1;
    - `-on` against the base is at least 4.5:1;
    - every pair of bases differs by at least ΔE2000 15.

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- views/ data inks`. It should FAIL, then PASS.

- [ ] **Step 3: Manual check**

  On the demo library:
  1. Rename *Rim light*. The Reference view's callouts show the new name.
  2. Delete it, moving its tags to *Silhouette*.
  3. Ctrl+Z. The technique, its links and its tags are all back.
  4. The Galaxy's edges update without a reload.

- [ ] **Step 4: Commit**

  Commit message: `feat(ui): taxonomy editing in the Tree inspector with tag moves`.

---

### Task 11: The speed check at 2,000+ references

**Files:**
- Create:
  - `scripts/make_perf_library.py`, which generates synthetic JPEGs plus a tag manifest;
  - `app/src-tauri/src/devseed.rs`, built only in debug, with the command `dev_seed_tags(manifest_path)`.
- Modify:
  - `app/README.md`, adding a "Performance check" section with the commands and the numbers measured.

**Interfaces:**
- Consumes Plan 1 import, `import_paths`, and Task 1.
- The script, `python -I scripts/make_perf_library.py OUT_DIR --n 2500 --seed 7`, writes `OUT_DIR/img/*.jpg` and `OUT_DIR/tags.json`.
  - The images are 2,500 plain 600×800 colour fields with numbers on them. They are synthetic, so there are no rights questions.
  - `tags.json` maps each file to 1–4 seed techniques, with a Zipf distribution so that some techniques are common.
- `dev_seed_tags` applies `tags.json` after the images are imported. It is compiled only under `#[cfg(debug_assertions)]` and never registered in release.

- [ ] **Step 1: Write the failing test**

  Rust `graph_edges_2500_under_budget`, marked `#[ignore]` and run explicitly: on a synthetic `LibraryData` of 2,500 references with the same Zipf tags, `graph_edges(&d, 8)` finishes in under 1.5 s in a release build (`cargo test --release -- --ignored graph_edges_2500`).

- [ ] **Step 2: Run, then implement, then run again**

  It should FAIL before `devseed` and the generator exist, then PASS.

- [ ] **Step 3: Manual check**

  Run `npm run tauri dev`, create a library, import `OUT_DIR/img` with the Import button, then call `dev_seed_tags`. Expected on the development machine:
  - The Galaxy shows its first layout within 3 s, with the UI responsive throughout.
  - Panning and zooming hold at least 55 fps (Pixi ticker), both fitted and zoomed in.
  - Live textures never exceed 600 (a dev overlay shows `TexCache.size()`).
  - At far zoom everything is dots.
  - The Tree with the most-used technique expanded, the Tree with **"Show all references"** on (decision 3), and the Radial for the busiest operation all pan at at least 55 fps.

  Record the measured numbers in `app/README.md`.

- [ ] **Step 4: Commit**

  Commit message: `test(perf): 2,500-reference synthetic library and graph speed check`.

---

## Self-review

**1. Spec coverage**

- **§5 Tree:**
  - the bands, the docked inspector and the breadcrumb: Tasks 5 and 6;
  - editing (rename, define, synonyms, delete with the "where should tags move" prompt, drag to re-link, "+" on bands): Tasks 9 and 10.
- **§5 Galaxy:**
  - a force layout from the scores: Tasks 1 and 7;
  - edges only on hover or selection: Task 7.
- **§5 Radial:** a thin layout mode over the same graph (Tasks 5 and 8).
- **§5 shared requirements:**
  - pan and zoom: Tasks 3 and 4;
  - light and dark: Task 4;
  - region thumbnails: Tasks 6 and 8, using ruling a1.
- **§4:** the score drives the Galaxy clustering and edge thickness (Tasks 1 and 7), and the constants live in one file (Task 3).
- **§9 and §10:**
  - only what is on screen is drawn: Tasks 3 and 4;
  - 256 px textures or dots: Tasks 3 and 4;
  - 2,000+ references: Task 11;
  - d3-force in a worker: Task 7;
  - the fixed band and radial maths: Task 5.
- **§11 anti-goal (not an Iris clone):** Global Constraints, Tasks 5 and 6.
- **Gap, recorded rather than built:** SPEC §5's "Intro card" and "Compare" belong to Plans 6 and 4.

**2. Step scan.** Each test step names its tests and their assertions. Each code step names its file and signatures. The bodies are left to the implementer, except the force parameters and layout rules, which the tests alone don't pin.

**3. Type consistency:**
- `Edge` is the same in Rust and TypeScript (Task 1 → 7).
- `Snapshot` and `DataSource` are used by Tasks 6, 7, 8 and 10.
- `SceneNode` and `Scene` are used by Tasks 6, 7 and 8.
- `TagMove` is the same in Rust and TypeScript (Task 9 → 10).
- `ViewHandle` is returned by `mountTree`, `mountGalaxy` and `mountRadial`.

**4. Review Focus.** Every item has a named test in its owning task:
- item 1: Tasks 4 and 6;
- item 2: Tasks 5 and 7;
- item 3: Tasks 6 and 7;
- item 4: Tasks 9 and 10;
- item 5: Task 3.

**5. Proportion.** There are 11 tasks: signatures, test names and assertions, with no bodies. The user's decisions grew Tasks 9 and 10, operation and domain CRUD in particular. They were not split, because each still ends at one reviewable deliverable: the Rust edits, then the UI.

## Decisions (answered by the user, 2026-11-25)

1. **Operations are fully editable.** The artist can add, rename, re-label, re-ink and delete operations (Tasks 9–10).
   - Deleting an operation that is in use asks where its branches and tags go: move them to another operation, or delete them. Each delete is one undo step.
   - New operations take an ink from a five-ink extra set (Task 10, DESIGN.md), and every view degrades to neutral for an operation with no known ink (`opInk`, Task 2).
   - There are 1 to 9 operations.
2. **New domain types are allowed.** The artist can add, rename and delete them, and choose an icon (`DOMAIN_ICONS`, default "a plain square"). Deleting a domain asks whether to move it to another domain or delete it, in which case its tags become partial. Placing a domain under an operation creates the branch (`add_branch`).
3. **The Tree's references band** shows the selected technique's references by default, with a "Show all references" toggle (Task 6). Culling and far-zoom dots keep it smooth, and Task 11 measures it.

**Four-operation assumptions checked in the code (25 Nov 2026):**

| Place | Assumption | Status |
|---|---|---|
| `taxonomy.rs` `OP_NAMES`, `OP_LABELS`, `OBSERVED` | exactly the four seed operations | Seed-only: used by `validate_seed`. `validate()` (line 179) doesn't use them. Safe, provided nothing runs `validate_seed` on an edited taxonomy. |
| `search.rs:52` | operations matched by name or `plain_label` | Reads the taxonomy, so renamed and new operations work. Safe; covered by `rename_operation_label`. |
| `correlate.rs` `BRANCH_W = 0.3` | per branch, not per operation | Safe. |
| `demo.rs` (Plan 1 Task 9) | maps manifest operation names through the taxonomy | It runs only at creation, on the seed. Safe. |
| `app/src/reference/view.ts` `OP_KEY` | four ids, each mapped to a CSS token, with **an unknown id falling back to amber** | **Unsafe.** Fixed in Task 2 with `opInk`. |
| `prototype/styles.css` tokens | exactly four inks | Extended in Task 10 (`--x-*`). |
| Plan 2 Task 8 picker | four buttons, keys `1`–`4`, exact copy | **Unsafe.** See the cross-plan impact list. |
| Plan 2 Global Constraints | "Operation buttons read exactly …" | **Copy rule changes.** See the cross-plan impact list. |

## Cross-plan impact

| # | Change needed | Owner |
|---|---|---|
| 1 | **The tagging picker renders operations dynamically.** It shows one button per taxonomy operation (1–9, in taxonomy order), with keys `1`–`9`, labels from `plainLabel`, and swatches from `opInk`. Update Plan 2's Global Constraints copy line ("Operation buttons read exactly …") to say "the seed labels by default, editable by the artist". Change the Plan 2 Task 8 test of 4 exact labels to the seed case, and add a 5-operation case. | P2 T8 (fb) |
| 2 | **Plan 1's Global Constraints copy line** ("The UI uses plain-English operation labels: …") becomes "the seed's labels, editable by the artist (Plan 3)". **SPEC §6.1** ("Four buttons") and **§7** get the same note. | Controller (P1 doc and SPEC) |
| 3 | **Reference view inks:** `OP_KEY` is replaced by `opInk`, and an unknown operation is neutral, not amber. The Reference view also reads a `DataSource` (audit row 28). | P3 T2 (this plan); if P2 T7 lands first, it makes the data part against `Store` |
| 4 | **DESIGN.md "Extra operation inks"** (Teal, Olive, Rose, Indigo, Umber, light and dark, `-text` and `-on`, AA-checked), plus a note that the Operation-Only Chroma Rule covers them. | P3 T10 (this plan); design sign-off by the controller |
| 5 | **Plan 4 Compare and Lightbox** colour region outlines and labels by operation. They must use `opInk`, not per-id tokens. | P4 T6, T7 |
| 6 | **Plan 6 icons:** the glyph set must include drawings for `DOMAIN_ICONS`' two generic entries ("a plain square", "a dot inside a ring"). New operations need a default icon, "a plain square". | P6 (icons task) |
| 7 | **Plan 6 integrity check and import:** confirm that `validate()`, not `validate_seed()`, runs on every opened library, because an edited taxonomy fails `validate_seed` by design. | P6 T2 |
| 8 | **Plan 6 intro card and About:** they describe the four seed operations as the starting set. Their copy must not claim that there are always four. | P6 (intro) |
| 9 | **Plan 4 board scope** now has a consumer: `Snapshot.inScope` (Task 2) is fed by `storeSource` from `store.inScope` (audit row 10). | P4 T5 (already exposes it); P3 T10 wires it |
| 10 | **Plan 4 Compare entry from the graph views:** `main.ts` passes `openCompare: (a, b) => mountCompare(…)` to the Galaxy (audit row 25). | P4 T7 (export), P3 T7 (call) |
| 11 | **Shortcuts table:** Radial is now `1`–`9`, and the Tree gains no new keys. Update the audit's shortcut list. | Controller (CROSS-PLAN-AUDIT.md) |
