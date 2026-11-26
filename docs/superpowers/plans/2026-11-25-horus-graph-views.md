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
- **View switching:** Plan 2's `views.ts` grows into the shell, in place. It lazily mounts the views behind the top-bar tabs, and `firstrun.ts` `boot()` registers them (ruling B2).

**Tech Stack:**
- Plan 1's stack: Tauri 2, Rust (edition 2024), TypeScript, Vite, and Vitest with jsdom.
- New npm packages: `pixi.js@^8` and `d3-force@^3` (with `@types/d3-force`). No others.
- No new crates.

**Spec:** `SPEC.md` (draft 5, approved 24 Nov 2026): §1 (editing in v1), §4 (scores drive the Galaxy), §5 (Tree, Galaxy, Radial), §9 (speed) and §10 (PixiJS, d3-force in a worker, culling).
- Visual system: `DESIGN.md`.
- Direction contract: `.impeccable/surfaces/prototype-index-html.md`.
- Builds on Plan 1, `docs/superpowers/plans/2026-11-24-horus-foundation.md`, as amended, and its ledger `docs/superpowers/ledgers/2026-11-24-horus-foundation-ledger.md`.
- Builds on Plan 2, `docs/superpowers/plans/2026-11-25-horus-tagging-inbox.md`, and its ledger `docs/superpowers/ledgers/2026-11-25-horus-tagging-inbox-ledger.md`, which holds the Plan 2 interface rulings cited below.
- Pre-flight scan and rulings: `.superpowers/sdd/2026-11-25-horus-graph-views/preflight-scan.md` and `progress.md` (main checkout). Finding IDs (B1–B7, R1–R20, C1–C24) in this plan refer to that scan.

**Dependencies (Plans 1 and 2 are merged, main `d7c52f5`):**
- **Plan 1:** `LibraryView`, `Reference` with `thumb256`, `Taxonomy`, `Scored` and `Api` (Tasks 7–8); `tileBox` (Task 8); `correlate::Index` (Task 5).
- **Plan 2, already built and used by every task here:**
  - `edit::{Edit, apply, apply_inverse, Applied, Touched}`, with the sealed position-restoring `Insert*` inverses and `touches_taxonomy` (`edit.rs:20-101`, `:194`);
  - `History` (`history.rs`);
  - `Taxonomy::save`, `load_with_fallback`, `find_by_name` and `custom_technique` (`taxonomy.rs`);
  - the `Change` type and the shared `commit(app, build)` recipe (`commands.rs:524-547`), and `visible(&o.lib)` (`commands.rs:273-283`), which hides references whose image is missing or damaged;
  - the `Store` (`store.ts`), `ops.ts` (`opInk`, `opLabel`, `SEED_INK`, `EXTRA_INKS`), the view toggle `views.ts`, and start-up wiring in `firstrun.ts` `boot()` (`main.ts` is 7 lines and is not edited by this plan);
  - `mountReference(root, api, store: Store)` (`reference/view.ts:24-28`), already reading the Store;
  - the dynamic tagging picker (1–9 operations, `digitOf`, `picker.ts:98`, `:352-355`).
- **Plan 2 already did** the pieces this plan once planned for itself: `ops.ts`, `opInk` in the Reference view, search and picker, and the Reference view reading a shared data source (ruling B1). Task 2 builds only on them.

**Ownership of taxonomy editing (SPEC §1, §5).** The Plan 1 roadmap put the "taxonomy editor" in Plan 6. SPEC §5 puts editing in the Tree view's inspector, so **Plan 3 now owns taxonomy editing**, in Tasks 9–10. Following the user's decisions, that covers techniques, **operations** (add, rename, plain label, description, ink, delete with move-to) and **domain types** (add, rename, icon, delete with move-to). Plan 6 keeps the intro card and packaging. This plan also closes the Plan 1 Task 3 deferred minor ("validate() negative tests thin — add table-driven mutations before Plan 6 editing") in Task 9. Plan 2 Task 3 already closed the other two Task 3 minors (missing keys versus `null`; `source`/`rationale` defaults).

**Carried from the Plan 1 ledger (owned here):**
- AGY #2 **c5**: score the Galaxy through an inverted index (Task 1).
- Plan 1 Task 5 minor: "callers must rebuild index". `graph_edges` builds its own `Index` from the visible references on every call (Task 1, R2), and no view caches scores across a data change (Task 2's `DataSource`).
- Ruling **a1**: region thumbnails are the letterboxed tile with the region outlined, not a crop. This holds wherever the graph views draw a reference because of a region-tagged technique (Tasks 6 and 8).

## Global Constraints

- **Canvas:** PixiJS v8 initialised with `preference: "webgl"`. HTML panels beside the canvas follow DESIGN.md. The canvas is a view, never the only route: every action in a canvas view is also reachable from the keyboard and the inspector.
- **`pixi.js/unsafe-eval` is required (ruling B4).** The CSP has `script-src 'self'` with no `unsafe-eval` (`tauri.conf.json:23`), guarded by `lib.rs` `csp_is_strict_except_styles`. Pixi 8 throws at renderer init without its `unsafe-eval` module, so `createScene` imports `pixi.js/unsafe-eval` (a side-effect import) before it creates the renderer. **Never add `unsafe-eval` to the CSP.** Plan 6 Task 1 Step 4 re-checks this.
- **Pixi stays out of unit tests and the start-up bundle (R6).** Only `graph/scene.ts` imports `pixi.js`, and only through a dynamic `import()` inside `createScene`. Everything else a view or test needs from Task 4 lives in the Pixi-free `graph/frame.ts`. No unit test imports `pixi.js`.
- **No new inline `style=` attributes** (Plan 2 ledger; Plan 6 CSP). Position through `el.style.*` after insertion (CSSOM), as Pixi itself does for the canvas.
- **Test environment (C11):** there is no global vitest config. DOM tests start with `// @vitest-environment jsdom`. The pure `graph/` tests run in Node. jsdom has no `Worker` and no WebGL, so views take `makeScene` and `makeWorker` fakes.
- **`prefers-reduced-motion` (C13):** `Scene.setCamera(c, animate)` and the Galaxy's per-tick streaming check `matchMedia("(prefers-reduced-motion: reduce)").matches`. When it is true, the camera jumps and only the final layout is drawn.
- **Wiring:** every view is registered in `firstrun.ts` `boot()`, never in `main.ts` (ruling B2).
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
  - **Every operation ink resolves through `opInk(tax, opId)` (Plan 2's `app/src/ops.ts`, already built):**
    - an operation whose `color` is one of `EXTRA_INKS` uses that extra ink (values in Task 10), so `color` takes precedence over the seed mapping;
    - otherwise the four seed operations use DESIGN.md's tokens;
    - an operation with no known ink falls back to neutral (`--ink-2` base, `--ink` text, `--panel` on).

    No view keys CSS variables by operation id directly. `opInk` returns `var(--…)` strings; the canvas turns them into numbers through `scene.ts` `resolveColor` (R8).
  - **Far-zoom dots are neutral `--ink-2` (C3).** SPEC §10 says "coloured dots"; DESIGN.md's Operation-Only Chroma outranks that wording detail. Recorded as a spec delta for the controller.
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
  - Tasks 1 and 9 add their commands as rows to `src/api.contract.test.ts` (`mockIPC`), with their camelCase keys. "Covers every IPC wrapper" (`api.contract.test.ts:67-71`) fails for any new `tauriApi` key without a row.
  - **Every new `Api` member also gets a `vi.fn()` in the two full-literal fakes typed `Api`,** `src/firstrun.test.ts:19-56` and `src/reference/view.test.ts:68-100`, or `tsc` (`npm run build`) fails, because `tsconfig.json` includes `src` (ruling B3). Tasks 1 and 9 run `npm run build` as well as `npm test`.
- **Constants live in one file, `app/src/graph/constants.ts`** (SPEC §4: "weights live in a constants file"): `K_EDGES`, `DOT_PX`, `TEX_CAP`, `MIN_SCALE`, `MAX_SCALE`, `EDGE_W0 = 0.75`, `EDGE_W1 = 2.25`, `BAND_GAP = 160`, `NODE = 48`, and `MAX_OPS = 9` (C4; T8 and T10 need it in TS). Task 3 created the file with all ten, `MAX_OPS` included (commit dc415a4, from C4). The scoring constants `MIN_SCORE` and `BRANCH_W` are Rust's and stay in `correlate.rs:11-12`; Rust owns the score.
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
   - A library switch (`store.reset`, an event with `reset: true`) is not a data change: it clears the selection and calls `fitAll()` (C20).

   Tested in Tasks 2, 6 and 7.
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
  - `app/src/api.ts`;
  - `app/src/api.contract.test.ts`: a `graphEdges` row (B3);
  - `app/src/firstrun.test.ts` and `app/src/reference/view.test.ts`: `graphEdges: vi.fn()` in each typed `Api` fake (B3).

**Interfaces:**
- Consumes `correlate::Index` and `Scored` (Plan 1 Task 5); `AppState { open: Mutex<Option<Open>> }`, `lock()` and `visible(&o.lib)` (`commands.rs:26-54`, `:201`, `:273-283`).
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
  - **Build each reference's weighted vector and its norm once (R3),** then compute the cosine from those, with exactly `Index::score`'s maths. `Index::score` rebuilds both vectors on every call (`correlate.rs:78-79`), which at 2,500 Zipf-tagged references reaches millions of pair rebuilds. `score` and `related` are not changed; `graph_edges_match_bruteforce` against `Index::score` guards that the two agree.
  - Keep the top `k` with `score ≥ MIN_SCORE`, **ranked by `(score desc, other id asc)` (R4)**, so ties at the k boundary are deterministic. The brute force ranks the same way. State this in the doc comment.
  - The edge set is the **union** of every reference's top-k, deduplicated by `(min(a, b), max(a, b))`.
  - Pairs that share only a branch are not candidates. This is the c5 trade-off: such pairs score low and would bring back O(N²). Record it in a doc comment.

- [ ] **Step 1: Write the failing tests**, in `correlate.rs` `tests`:
  - `graph_edges_match_bruteforce`: a seeded random library of 200 references over 30 techniques, built with an inline xorshift or LCG in the test module (C21; there is no `rand` crate and none may be added). `graph_edges(&d, 8)` equals a brute-force top-8 (scored with `Index::score`, ranked `(score desc, id asc)`) over all pairs that share at least one technique, compared as sets of `(a, b)` with scores within 1e-12.
  - `graph_edges_no_self_no_dupes`: no edge has `a == b`, and each pair appears once with `a < b`.
  - `graph_edges_respects_k_and_min`: in a star where one hub shares a distinct rare technique with each of 20 leaves, the hub keeps its own top 8. The union can still contain more of the hub's edges, from the leaves' side. Every score is at least `MIN_SCORE`.
  - `graph_edges_empty_and_partial`: an empty library, and one where every tag is partial, both return `[]`.
  - `graph_edges_skip_branch_only`: two references that share only a branch produce no edge.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test correlate::`. It should FAIL, then PASS. Then run `cargo clippy --all-targets -- -D warnings`.

- [ ] **Step 3: Add the command and wrapper**

  - **`#[tauri::command(async)] graph_edges(k: u32)` (R2).** A sync command runs on the main thread, and scoring under the lock would block the saver and every other command. Under `lock(&st.open)`, clone `visible(&o.lib)` (cheap at 2,500), then release the lock. Outside it, `Index::build` the clone (`Index` is not `Clone`; the build is O(tags)) and call `graph_edges(&clone, k as usize)`.
  - **Hidden references never appear (R1).** Because the command scores `visible(&o.lib)`, it never emits an edge to a hidden id (Plan 2 ruling, ledger: hidden references never appear in related results, search hits or counts).
  - In `api.ts`, add the `Edge` type and `graphEdges` to `Api` and `tauriApi`. Add the `api.contract.test.ts` row (`graph_edges`, `{ k }`) and the two `vi.fn()` fakes (B3).

  Add these Rust tests in `commands.rs`, using `tauri::test::mock_builder()` like the existing command tests:
  - `graph_edges_command_roundtrip`: on a created library with no imports, the command returns `Ok([])`.
  - `graph_edges_skip_hidden`: beside `bad_hash_is_hidden_not_fatal`, a library where two references share a technique and one is hidden returns no edge naming the hidden id.

  Run `cargo test`, clippy with `-D warnings`, `npm test` and `npm run build`. All PASS.

- [ ] **Step 4: Commit**

  Commit message: `feat(core): Galaxy edges via inverted technique index`.

---

### Task 2: The view shell and the data source

Plan 2 already built `ops.ts` (`opInk`, `opLabel`, `SEED_INK`, `EXTRA_INKS`, tested in `ops.test.ts`), switched the Reference view, search and picker to `opInk`, and made the Reference view read the shared `Store` (ruling B1). This task does not touch those. It grows `views.ts` into the shell (ruling B2) and adds the graph views' read-only data seam over the Store.

**Files:**
- Create:
  - `app/src/data.ts`;
  - `app/src/data.test.ts`.
- Modify:
  - `app/src/views.ts`: grow it into the shell, in place;
  - `app/src/views.test.ts`;
  - `app/src/firstrun.ts` (`boot()`): build the shell and register `"reference"` and `"inbox"`;
  - `app/src/firstrun.test.ts`: the two Inbox tests (`:124`, `:165`) keep passing against the new shell;
  - `app/index.html`: give the Tree, Galaxy and Radial tabs `data-view-tab="tree"` (and so on), still `disabled` with `title="Not built yet"`; add empty hosts `<section class="graph-host" data-view-host="tree"></section>`, and the same for `galaxy` and `radial`;
  - `app/src/styles.css`: generalise the Plan 2 view rules (`styles.css:285-287`);
  - `app/src/reference/view.ts` and `app/src/reference/view.test.ts`: the search hook (R5) only.
- Not created, because Plan 2 built them: `shell.ts`, `ops.ts`, `ops.test.ts`. Not edited: `main.ts`, `search.ts`. Dropped: `staticSource`, and the tests `op_ink_seed_extra_neutral`, `reference_view_unknown_op_is_neutral` and `reference_view_refreshes_from_source`, which exist as `ops.test.ts:14`, `view.test.ts:305` and `view.test.ts:206`.

**Interfaces:**
- Consumes the `Store` (`store.ts:7-24`: `refs`, `links`, `tax`, `taxonomyReadOnly`, `subscribe`, and `reset`, which emits `{ reset: true }`), `mountReference(root, api, store)` and `boot()`.
- Produces:
  ```ts
  // data.ts — the one seam between the graph views and the library data (read-only; edits go through api + store.apply)
  export type Snapshot = { refs: Map<string, Reference>; links: Link[]; tax: Taxonomy; version: number;
    taxonomyReadOnly: boolean;            // store.taxonomyReadOnly (seed fallback after a damaged taxonomy.json)
    inScope(refId: string): boolean };    // () => true until Plan 4 adds store.inScope (board scope, audit row 10)
  export type SourceEvent = { reset: boolean };   // reset = a library switch (store.reset), not a data change (C20)
  export interface DataSource { get(): Snapshot; subscribe(fn: (s: Snapshot, e: SourceEvent) => void): () => void }
  export function storeSource(store: Store): DataSource;   // version bumps on every store event
  // views.ts — grown in place from Plan 2's toggle
  export type ViewId = "reference" | "inbox" | "tree" | "galaxy" | "radial" | "boards";
  export interface ViewHandle { show(): void; hide(): void; destroy(): void }
  export function mountViews(root: HTMLElement, deps: { showReference(id: string): void }): {
    register(id: ViewId, factory: () => ViewHandle): void;   // enables that id's tab
    select(id: ViewId): void;
    current(): ViewId;
    openReference(id: string): void;   // select("reference"), then deps.showReference(id)
    destroy(): void;
  };
  // reference/view.ts
  export function mountReference(root: HTMLElement, api: Api, store: Store, opts?: { onNavigate?(): void }): { show; ready; destroy };
  ```
- **The shell keeps Plan 2's markup and behaviour:** `[data-view-tab]` tabs, `body.dataset.view`, `.is-on` and `aria-current="page"` on the active tab.
- **Lazy mounting.** A view's factory runs on its first `select`; after that it is only hidden and shown. Canvas views keep their camera between visits.
- **`show()` runs on every `select`,** including a re-select of the current view. The Inbox depends on this: its landing on an item (`firstrun.ts:51`) becomes its `show`.
- **Tabs.** `register(id, …)` removes `disabled` and `title` from that id's tab, so a tab is clickable only once its view exists. Boards stays disabled until Plan 4. Clicking a disabled tab changes nothing.
- **Layout (`styles.css`).** `.record` and `.work` show only when `body[data-view="reference"]`. Every other view uses Plan 2's Inbox row template (`52px 1fr 36px`); graph views dock the breadcrumb in their inspector (SPEC §5). `.inbox` shows only for `inbox`, and each `[data-view-host="<id>"]` shows only for its id.
- **Opening a reference.** `openReference(id)` selects `"reference"` and calls `deps.showReference(id)`. `boot()` passes it to every view as `deps.openReference`, and intake's `show` uses it too.
- **Search from any view (R5).** The top-bar search is live in every view, but its hits call the Reference view's `show(id)` or `applyFilter` (`view.ts:524-529`). `mountReference` takes `opts.onNavigate`, which runs before either, and `boot()` passes `() => shell.select("reference")`.

- [ ] **Step 1: Write the failing tests**
  - In `views.test.ts`:
    - `select_mounts_lazily_and_hides_others`: register two fake factories. `select("tree")` calls only the Tree factory, once. Selecting `"tree"` again creates nothing new. Selecting `"galaxy"` calls the Tree's `hide`.
    - `show_runs_on_every_select`: selecting `"inbox"` twice calls its `show` twice.
    - `tabs_reflect_selection` (the existing test at `views.test.ts:7`, kept): clicking a tab sets `body.dataset.view` and moves `aria-current` to it.
    - `register_enables_tab`: the Tree tab is `disabled` until `register("tree", …)`, then enabled with no `title`.
    - `disabled_tab_ignored`: clicking Boards changes nothing.
    - `open_reference_switches_view`: `openReference("b")` leaves `current() === "reference"` and calls `showReference("b")`.
  - In `data.test.ts`, on a real `createStore` (moved here from Task 10's `store_source_bumps_on_change`):
    - `store_source_versions`: `store.apply(change)` bumps `get().version` and calls each subscriber once with `{ reset: false }`; an unsubscribed callback is not called.
    - `store_source_reset_event`: `store.reset(view, tax)` notifies with `{ reset: true }` and the new data.
    - `store_source_fields`: `refs`, `links`, `tax` and `taxonomyReadOnly` mirror the Store, and `inScope(id)` is `true`.
  - In `reference/view.test.ts`:
    - `search_hit_navigates_first`: with `opts.onNavigate` a spy, choosing a reference hit and a technique hit each call `onNavigate` before the view changes.
  - The existing `firstrun.test.ts` Inbox tests (`:124`, `:165`) and the rest of `views.test.ts` stay green.

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- views data firstrun reference/view`. It should FAIL, then PASS. Then run `npm test` and `npm run build`.

- [ ] **Step 3: Wire `boot()`**

  In `firstrun.ts` `boot()`:
  1. Build `const shell = mountViews(root, { showReference: (id) => view.show(id) })`.
  2. Pass `{ onNavigate: () => shell.select("reference") }` to `mountReference`.
  3. `register("reference", …)` with a handle whose `show`/`hide` do nothing (the Reference view is always mounted; CSS shows it).
  4. `register("inbox", …)` whose `show` is today's landing: `landOn ? inbox.focusId(landOn) : inbox.focus(0)`.
  5. Intake's `show` becomes `shell.openReference`, and its `openPicker` keeps using `select("inbox")`.
  6. Build one `const source = storeSource(store)`, ready for Tasks 6–8 to pass to their views.

- [ ] **Step 4: Commit**

  Commit message: `feat(ui): view shell in views.ts and store-backed data source`.

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
- Create:
  - `app/src/graph/frame.ts`: the Pixi-free half (R6): `planFrame`, `classifyDrag`, `mountCanvasOrFallback`, `WebGLUnavailable`, and the `SceneNode`, `SceneEdge`, `FramePlan` and `Scene` types;
  - `app/src/graph/scene.ts`: `createScene` and `resolveColor`, the only module that loads `pixi.js`.
- Modify: `app/package.json` and `app/package-lock.json` (commit both), adding `pixi.js@^8` here, and `d3-force@^3` with `@types/d3-force` for Task 7.
- Test: `app/src/graph/frame.test.ts`, covering the fallback, the frame plan and the drag classifier only. It never imports `scene.ts` or `pixi.js`. WebGL itself is checked by hand in Step 4.

**Interfaces:**
- Consumes Task 3.
- Produces:
  ```ts
  // frame.ts (no pixi.js import)
  export type SceneNode =
    | { id: string; kind: "ref"; x: number; y: number; size: number; url: string; aspect: number;
        dim?: boolean;   // R9: out of scope (Plan 4 board scope): always "dot", never picked
        outline?: { region: Region; color: string; state: "full" | "partial" | "region" } }
    | { id: string; kind: "label"; x: number; y: number; text: string; font: "serif" | "mono"; color: string }
    | { id: string; kind: "op" | "branch" | "tech"; x: number; y: number; size: number; color: string; label: string };
  export type SceneEdge = { from: string; to: string; width: number; color: string; curve?: boolean };
  export type FramePlan = { visible: string[]; lod: Map<string, Lod> };
  export function planFrame(grid: SpatialGrid, nodes: Map<string, SceneNode>, cam: Camera, view: { w: number; h: number }): FramePlan;
  export function classifyDrag(startHit: string | null, draggable: (id: string) => boolean): "drag" | "pan";
  export type Mods = { shift: boolean };
  export interface Scene {
    setNodes(nodes: SceneNode[]): void;       // rebuilds the grid; keeps the camera
    setEdges(edges: SceneEdge[]): void;       // the caller decides which edges are visible
    camera(): Camera; setCamera(c: Camera, animate?: boolean): void; fitAll(): void;
    on(ev: "hover" | "select" | "activate", fn: (id: string | null, mods: Mods) => void): void;   // R9; activate = double-click or Enter
    setDraggable(pred: (id: string) => boolean): void;   // default: nothing is draggable
    onDrop(fn: (dragged: string, target: string | null) => void): void;   // target = node under the pointer on release
    select(id: string | null): void;          // also from the keyboard
    destroy(): void;
  }
  export class WebGLUnavailable extends Error {}
  export function mountCanvasOrFallback(host: HTMLElement, make: () => Promise<Scene>): Promise<Scene | null>;
  // scene.ts
  export function createScene(host: HTMLElement, api: Pick<Api, "assetUrl">): Promise<Scene>;   // rejects with WebGLUnavailable
  export function resolveColor(css: string): number;   // R8: "var(--x)" or "#rrggbb" -> 0xRRGGBB
  ```
- **Loading Pixi (B4, R6).** `createScene` does `const PIXI = await import("pixi.js"); await import("pixi.js/unsafe-eval");` before it creates the renderer. Views import `createScene` only as their default `makeScene`; their tests pass a fake.
- **WebGL only (C14).** `createScene` requires a WebGL renderer, so it never falls back to WebGPU. It maps a missing or failed WebGL context to `WebGLUnavailable`. It does **not** map other init errors (such as Pixi's unsafe-eval error, B4) to it, so a CSP mistake surfaces as an error rather than as the fallback message on every machine.
- **Drawing a reference node:** an N5 tile (`--card`) of `size` world units, with the `thumb256` texture letterboxed through Plan 1's `tileBox(aspect, size, outline?.region)`. When the tile has an outline, it is stroked in the operation colour, using the state's line style (Review Focus: The Line Says the State). In `"dot"` LOD, the node is a 3 px dot in `--ink-2` (C3).
- **Out of scope (R9).** `planFrame` returns `"dot"` for a ref node with `dim: true` at any scale, and picking skips it.
- **Textures (Cross-plan audit row 3):**
  - Thumbnails load through an `HTMLImageElement` (`img.src = api.assetUrl(thumb256)`, then `Texture.from(img)`). Pixi's `Assets` loader is not used, so its `preferWorkers` default does not apply.
  - Loading is then governed by the CSP's `img-src`, not `connect-src` or `worker-src`.
  - Plan 6 Task 1 Step 4 verifies this under the strict CSP.
- **Picking:** hover and select use `SpatialGrid.hit`, not Pixi's per-sprite events, so 2,000 sprites cost no listeners. Every event passes `mods.shift` from the pointer or key event (R9).
- **Dragging:** a pointer drag that starts on a node accepted by `setDraggable` moves a ghost of that node and fires `onDrop` on release; any other drag pans (`classifyDrag`). Task 10 uses this to link techniques.
- **Colours (R8).** WebGL cannot read CSS variables, so views keep passing `opInk(...)` strings (`var(--seq)`) and `scene.ts` resolves them. `resolveColor` reads `getComputedStyle(document.documentElement)` for `var(--x)` (and parses plain hex), caches per theme, and the cache is cleared and the scene redrawn when a `MutationObserver` sees `data-theme` change on `<html>`. Unit tests check the strings, never the numbers.
- **Reduced motion (C13).** `setCamera(c, true)` tweens only when `prefers-reduced-motion: reduce` does not match; otherwise it jumps.
- **Keyboard:** the canvas is focusable (`tabindex="0"`, `role="application"`, with an `aria-label` per view). The inspector's `aria-live="polite"` region announces the selection. Every canvas key handler returns early on `isTextEntry(e.target)` (`keys.ts:10`; C19).
- **`webglcontextlost`:** stop the ticker. On `webglcontextrestored`, recreate textures from the cache's URLs.

- [ ] **Step 1: Write the failing tests**, in `frame.test.ts` (Node, plus `// @vitest-environment jsdom` for the fallback test's `host`):
  - `plan_frame_culls_and_lods`: 2,000 nodes on a 50×40 grid, with a camera showing about a tenth of them. `visible` equals the brute-force set inside `viewRect(…, 0.1)`, and every visible ref node at scale 0.1 is `"dot"`.
  - `plan_frame_dim_is_dot`: a ref node with `dim: true` is `"dot"` at scale 4.
  - `drag_vs_pan`: with the predicate `id => id.startsWith("tech:")`, `classifyDrag` returns `"drag"` for a technique node and `"pan"` for empty space (`null`) or a branch node.
  - `fallback_message_when_no_webgl`: `mountCanvasOrFallback(host, () => Promise.reject(new WebGLUnavailable()))` resolves `null`, and `host` contains exactly the text "This view needs WebGL, which isn't available here. The Reference view still works." (Review Focus 1).
  - `fallback_rethrows_other_errors`: a `make` that rejects with a plain `Error` makes `mountCanvasOrFallback` reject, and `host` shows no fallback text.

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- graph/frame`. It should FAIL, then PASS. Run `npm test` and `npm run build` too; the build must succeed with `pixi.js` split into its own chunk.

- [ ] **Step 3: Add a dev harness**

  The harness is `?scene-demo` on the dev URL, and only `import.meta.env.DEV` builds it. It renders 2,000 synthetic ref nodes on a grid.

- [ ] **Step 4: Manual check**

  Run `npm run tauri dev` and open the harness. `tauri dev` enforces the same CSP, because no `devCsp` is set. Expected:
  - The scene renders (no "This view needs WebGL…" and no unsafe-eval error in the console).
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
- Consumes `Snapshot` (Task 2) and the constants (Task 3). **It starts only once Tasks 2 and 3 are merged** (schedule wave 2). Tests build a `Snapshot` literal directly; they need no Store.
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

### Task 7: The Galaxy view

**Files:**
- Create:
  - `app/src/graph/force.ts`: the pure simulation setup, testable in Node;
  - `app/src/graph/force.worker.ts`;
  - `app/src/views/galaxy.ts`.
- Modify:
  - `app/src/firstrun.ts` `boot()`: `shell.register("galaxy", …)` on the `[data-view-host="galaxy"]` host (ruling B2);
  - `app/src/styles.css`: the Galaxy inspector, in its own block.
- Test:
  - `app/src/graph/force.test.ts` (Node);
  - `app/src/views/galaxy.test.ts`, using a fake `Scene` and a fake worker.

**Interfaces:**
- Consumes `api.graphEdges` (Task 1), `api.related` (Plan 1; `Scored.sharedTechniques`), `Scene` and `Mods` (Task 4), and `DataSource` (Task 2). It does not use Task 6's `navigate.ts`, because Tasks 6 and 7 run in the same wave. `d3-force` comes from Task 4's `package.json`; this task's worktree runs its own `npm install`.
- Produces:
  ```ts
  export type ForceIn = { ids: string[]; edges: Edge[]; seed: number; prev?: Record<string, { x: number; y: number }> };
  export function runForce(input: ForceIn, ticks: number): Record<string, { x: number; y: number }>;   // synchronous; the worker calls it in batches
  export function initialPosition(id: string, seed: number): { x: number; y: number };   // deterministic from a hash of id
  // worker protocol
  type ToWorker = { type: "start"; input: ForceIn } | { type: "stop" };
  type FromWorker = { type: "tick"; ids: string[]; xy: Float32Array /* transferable, 2 per id */; alpha: number } | { type: "end" };
  export function mountGalaxy(host: HTMLElement, data: DataSource, deps: { api: Api; openReference(id: string): void;
    openCompare?(a: string, b: string): void;   // Plan 4 mountCompare, wired in boot() when present
    makeScene?: (el: HTMLElement) => Promise<Scene>; makeWorker?: () => Worker }): ViewHandle;
  ```
- **The worker (R7):**
  - The default `makeWorker` is `() => new Worker(new URL("../graph/force.worker.ts", import.meta.url), { type: "module" })`, written in `views/galaxy.ts`. Vite resolves the URL relative to the importing file and emits a same-origin chunk, which passes `default-src 'self'`. **Never `?worker&inline`:** it makes a `blob:` URL, which the CSP blocks.
  - `force.worker.ts` types its scope with a local cast (`self as unknown as { postMessage(m: FromWorker, t: Transferable[]): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null }`). Do not add `WebWorker` to the global `tsconfig` `lib`, because it conflicts with `DOM`.
  - `runForce` builds `forceSimulation(…)` with `.randomSource(lcg(seed))`, calls `.stop()` at once (d3-force otherwise starts its own timer), then `.tick(n)`. This is what makes `deterministic` pass.
- **The simulation:**
  - `forceLink(edges)`, with `strength = score` and `distance = 40 + 160 × (1 − score)`;
  - `forceManyBody`, with strength −30;
  - `forceCenter`;
  - `forceRadial(R_OUT)`, strength 0.08, applied **only** to references with no edges, so untagged references form an outer ring. `R_OUT` is 1.25 times the radius of the connected cluster, measured after warm-up.
- **Warm start:** nodes that are in `prev` start at those positions. A new node starts at the mean of its neighbours that have a `prev` position, or at `initialPosition` if none do.
- **The worker** posts a `tick` message every 10 ticks. It stops when alpha drops below 0.01, or after 600 ticks. Under `prefers-reduced-motion: reduce`, the view draws only the `end` positions, not each `tick` (C13).
- **Nodes:** each reference is a `NODE`-sized ref node, drawn with the full image (no region outline).
- **Edges:**
  - **Hover:** the hovered reference's top `K_EDGES` edges, neutral `--ink-2`, with width `EDGE_W0 + EDGE_W1 × score`.
  - **Select:** the selected reference keeps its edges until Esc.
  - **Shift-click (Cross-plan audit row 25, SPEC §5 Compare):** Shift-clicking a reference node while another is selected calls `openCompare(selected, clicked)`. The scene's `select` event carries `mods.shift` (R9).
  - **Board scope (audit row 10):** references out of scope are `dim` nodes (dots, never picked), and none of their edges are drawn.
  - Otherwise no edges are drawn.
- **The inspector, on selection:** the title; the ranked neighbours, each with "shares *technique*, …" in serif names and the score in mono; and "Open in Reference view". `Edge` carries only a score, so on selection the view calls `api.related(id)` and takes the names from `Scored.sharedTechniques` (C18).
- **Data changes and library switches** follow Review Focus 3: a store change warm-starts the layout and keeps the camera and selection (or clears a deleted one); a `{ reset: true }` event clears the selection, cold-starts and calls `fitAll()` (C20).
- **Keys:** the Galaxy's own small canvas handler: Esc clears the selection, Enter opens the selected reference, and it returns early on `isTextEntry(e.target)` (`keys.ts:10`; C19).
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
    - `shift_click_opens_compare`: with `a` selected, the fake scene's `select("b", { shift: true })` calls `openCompare("a", "b")`. Without a selection, it only selects `b`.
    - `out_of_scope_no_edges`: hovering a reference whose neighbour is out of scope draws no edge to that neighbour.
    - `inspector_names_shared_techniques`: selecting `a` calls `api.related("a")`, and each neighbour row shows its `sharedTechniques` names.
    - `data_change_warm_starts`: a store change posts `start` with `prev` holding every previously placed id.
    - `reset_cold_starts`: a `{ reset: true }` event posts `start` with no `prev` and clears the selection.
    - `empty_library_copy`: zero references render "No references yet."

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- graph/force views/galaxy`. It should FAIL, then PASS. Then run `npm test` and `npm run build`; the build output contains a separate worker chunk.

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
- Modify:
  - `app/src/firstrun.ts` `boot()`: `shell.register("radial", …)` on the `[data-view-host="radial"]` host (ruling B2).
- Test: `app/src/views/radial.test.ts`, using a fake `Scene`.

**Interfaces:**
- Consumes `buildTaxGraph` and `layoutRadial` (Task 5), and from Task 6 `renderInspector` (with the same `InspectorOpts`, R10) and `graph/navigate.ts` (`move`, `canvasKeys`), imported, not copied (R12). It only imports `views/inspector.ts`; it does not edit it, so it runs beside Task 10.
- Produces:
  ```ts
  export function mountRadial(host: HTMLElement, data: DataSource, deps: { api: Api; openReference(id: string): void;
    makeScene?: …; initialOp?: string }): ViewHandle;
  ```
- **The operation switch:** a segmented control above the canvas, with one button per taxonomy operation (1–9, in taxonomy order).
  - Each button shows the operation's plain label and an `opInk` swatch of 10 px.
  - Keys `1`–`9` switch while the canvas has focus, read with `digitOf` (`keys.ts:26`, so AZERTY's shifted digits work; Plan 2 ruling M3) through `canvasKeys`' `digit` handler. Digits above the operation count, or above `MAX_OPS` (Task 3's constants), do nothing. The control wraps to a second row past five operations.
- **Defaults and memory:** the default is the operation with the most tagged references. The choice is remembered for the session.
- **Reference nodes** sit on ring 3. Each is drawn with its region outline when it is on the ring because of a region-tagged technique (ruling a1).
- **The connector from a technique to its references** is drawn only for the hovered or selected technique, using the operation's ink, as on the Tree's selected path. This applies the "edges only on hover" rule to the outer ring.

- [ ] **Step 1: Write the failing tests**
  - `switch_operation_relayouts`: clicking "Lead the eye" calls `setNodes`, and the result contains only `sequence` branches and techniques.
  - `default_op_is_busiest`: with two references under `infer` and one under `group`, the first render is `infer`.
  - `key_3_selects_sequence`: pressing `3` on a focused canvas selects "Lead the eye". A keydown with `key: '"'` and `code: "Digit3"` (AZERTY) does the same.
  - `renders_dynamic_ops`: with a fifth operation added ("Unsettle", `color: "rose"`), 5 buttons render, `5` selects it, and its swatch is `var(--x-rose)` (a string check; the token itself arrives in Task 10).
  - `out_of_scope_refs_are_dots`: as in Task 6.
  - `radial_shares_inspector`: selecting a technique renders the same inspector markup as the Tree does for that selection. The comparison uses `renderInspector`'s output.

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- views/radial`. It should FAIL, then PASS.

- [ ] **Step 3: Commit**

  Commit message: `feat(ui): Radial view as a layout mode over the taxonomy graph`.

---

### Task 9: Taxonomy edits (Rust)

**Files:**
- Modify:
  - `app/src-tauri/src/edit.rs` (Plan 2): the new variants, `touches_taxonomy`;
  - `app/src-tauri/src/taxonomy.rs`: `name_key` becomes `pub(crate)` (R15);
  - `app/src-tauri/src/commands.rs`: the commands, the `validate()` step in `commit` (R13), `is_noop` (R14), the `Change.created` doc (C23);
  - `app/src-tauri/src/saver.rs`: reword the `flush` comment at `saver.rs:78-81` (R16);
  - `app/src-tauri/src/lib.rs`: register the commands;
  - `app/src/api.ts`;
  - `app/src/api.contract.test.ts`: one row per new command (B3);
  - `app/src/firstrun.test.ts` and `app/src/reference/view.test.ts`: a `vi.fn()` per new `Api` member in each typed fake (B3).

**Interfaces:**
- Consumes Plan 2's `Edit`, `apply`, `apply_inverse`, `Applied`, `Touched`, `Sealed`, `EditError::InUse`, `validate_tag`, `History`, `Taxonomy::save`, `validate()`, `custom_technique`'s slug rule, `double_option` (`commands.rs:179`), and the `commit(app, build)` recipe (`commands.rs:524-547`).
- **Extends `Edit` (ruling B5; Plan 2 Task 1 ruling).** Each collection follows `AddTechnique`/`RemoveTechnique`/`InsertTechnique`: the appending `Add*` (or `LinkTechnique`) validates and is applied as an insert at the end; its inverse is the matching `Remove*` (or `UnlinkTechnique`) at that index; the inverse of a `Remove*` is a **sealed** `Insert*` that restores the item at its original position and checks positions only (as `InsertTechnique` does, `edit.rs:369-392`). Commands build only the `Add*`, `Remove*`, `Update*`, `LinkTechnique` and `UnlinkTechnique` variants. History keeps undoing and redoing through `apply_inverse`.
  ```rust
  UpdateTechnique { before: Technique, after: Technique },     // same id; rename / define / synonyms; inverse swaps
  UpdateDomain    { before: Domain,    after: Domain },        // same id; name / description / icon; inverse swaps
  UpdateOperation { before: Operation, after: Operation },     // same id; name / plain_label / description / color; inverse swaps
  AddOperation    { op: Operation },                           // inverse: RemoveOperation at the appended index
  RemoveOperation { index: usize, op: Operation },             // InUse while any branch or tag uses it; inverse: InsertOperation
  InsertOperation { index: usize, op: Operation, sealed: Sealed },
  AddDomain       { domain: Domain },                          // inverse: RemoveDomain
  RemoveDomain    { index: usize, domain: Domain },            // InUse while any branch uses it; inverse: InsertDomain
  InsertDomain    { index: usize, domain: Domain, sealed: Sealed },
  LinkTechnique   { link: BranchTechnique },                   // inverse: UnlinkTechnique at the appended index
  UnlinkTechnique { index: usize, link: BranchTechnique },     // inverse: InsertLink
  InsertLink      { index: usize, link: BranchTechnique, sealed: Sealed },
  AddBranch       { branch: Branch },                          // inverse: RemoveBranch
  RemoveBranch    { index: usize, branch: Branch },            // InUse if any link or tag uses it; inverse: InsertBranch
  InsertBranch    { index: usize, branch: Branch, sealed: Sealed },
  ```
- **`touches_taxonomy` (R14)** lists every new variant, `Insert*` included, so the single `TaxonomyReadOnly` check in `commit` covers them all. **`is_noop` (R14)** gains `Update* { before, after } => before == after`, so a no-op rename records no undo step.
- **`commit` gains one post-apply check (R13),** with a carve-out for libraries that already open with `validate()` problems (shown only as warnings; test `open_reports_taxonomy_problems_without_failing`, `commands.rs:1263`). When `edit.touches_taxonomy()`:
  1. before `apply`, record `before = o.tax.validate()` errors (an empty list on `Ok`);
  2. after `apply`, compute the errors that are **new** (in the result, not in `before`);
  3. on any, `edit::apply_inverse(&mut o.lib.data, &mut o.tax, applied.inverse)`, record nothing, and return the new errors joined with "; ".

  This applies to every taxonomy edit, today's `add_technique` included. `validate_seed` stays seed-only. `validate()` (`taxonomy.rs:372`) checks only duplicate ids, branch pairs and links, unresolved ids, and techniques with no link, and it runs once on the final state of a `Batch`. An operation with no branches, a domain with no branch and a branch with no techniques all pass, so `add_operation`, `add_domain(…, None)` and `add_branch` are not refused.
- **Adds these commands.** Each goes through `commit`, returns Plan 2's `Change`, and is one undo step:
  ```
  update_technique(id, patch: TechniquePatch) -> Change
  update_domain(id, patch: DomainPatch) -> Change
  add_domain(name, description, icon: Option<String>, operation_id: Option<String>) -> Change
      // Change.created = new id; with operation_id: one Batch([AddDomain, AddBranch]) = one undo step
  delete_domain(id, move_to: Option<DomainMove>) -> Change          // Err("NeedsMove") if any branch uses it and None
  add_operation(name, plain_label, description, color: Option<String>) -> Change   // Change.created = new id
  update_operation(id, patch: OperationPatch) -> Change
  delete_operation(id, move_to: Option<OpMove>) -> Change           // Err("NeedsMove") if in use and None
  link_technique(technique_id, branch_id) -> Change                  // drag to link (S3: "re-link" read as "link again")
  unlink_technique(technique_id, branch_id, move_to: Option<TagMove>) -> Change   // R20: Err("NeedsMove") if tags use the pair and None
  delete_technique(id, move_to: Option<TagMove>) -> Change          // Err("NeedsMove") if in use and None
  add_branch(operation_id, domain_id) -> Change                      // "+" on the domain band
  ```
  ```rust
  // C7: the patches, Rust side. Absent key = keep.
  #[derive(Deserialize, Default)] #[serde(rename_all = "camelCase")]
  pub struct TechniquePatch { name: Option<String>, description: Option<String>, synonyms: Option<Vec<String>> }
  #[derive(Deserialize, Default)] #[serde(rename_all = "camelCase")]
  pub struct DomainPatch { name: Option<String>, description: Option<String>, icon: Option<String> }
  #[derive(Deserialize, Default)] #[serde(rename_all = "camelCase")]
  pub struct OperationPatch { name: Option<String>, plain_label: Option<String>, description: Option<String>,
    #[serde(default, deserialize_with = "double_option")] color: Option<Option<String>> }
      // color: key absent = keep; null = reset to None (seed default ink or neutral); "rose" = set

  #[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
  pub enum TagMove { Technique { technique_id: String, branch_id: String }, Partial }
  #[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
  pub enum OpMove { Operation { operation_id: String }, Delete }
  #[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
  pub enum DomainMove { Domain { domain_id: String }, Delete }
  pub const MAX_OPS: usize = 9;
  pub const EXTRA_INKS: [&str; 5] = ["teal", "olive", "rose", "indigo", "umber"];   // values in Task 10 / DESIGN.md
  pub const DOMAIN_ICONS: [&str; 8];   // C8: the six seed domains[].icon strings verbatim, then "a plain square", "a dot inside a ring"
  ```
- **Icons (C8).** New operations and new domains get `icon: "a plain square"` (`Operation.icon` is required, so `add_operation` sets it).
- **`api.ts` mirrors these** as `TagMove`, `OpMove` and `DomainMove` (tagged by `kind`), the three patch types, and a wrapper for every command above. Each gets an `api.contract.test.ts` row with its camelCase keys (`techniqueId`, `branchId`, `moveTo`, `operationId`, `domainId`, `plainLabel`) and a `vi.fn()` in both typed fakes.
- **`Change.created` (C23):** reword its doc (`commands.rs:116-117`) to "the new item's id (technique, operation or domain)".
- **Error names (C22).** `NeedsMove`, `LastLink`, `LastOperation`, `TooManyOperations`, `UnknownInk`, `UnknownIcon`, `NameTaken:<id>` and `LabelTaken:<id>` are plain strings returned by the `build` closure. They are not `EditError` variants. `EditError::InUse` and `DuplicateId` stay at the `edit::apply` level.
- **One re-key helper** backs every operation or domain move:

  `fn rekey_branch(data, tax, from: &str, to_op: &str, to_domain: &str) -> Vec<Edit>`

  - **The target is found by `(operation_id, domain_id)` (C16),** as `custom_technique` does (`taxonomy.rs:326-330`). Only when no branch has that pair is a new one minted, with id `<to_op>.<to_domain>`.
  - It builds these edits, in order:
    1. `AddBranch(to)` if the target branch is missing;
    2. `LinkTechnique` for each of `from`'s links that `to` lacks;
    3. a `ReplaceTag` for every tag on `from`, with `branch_id = to` and `operation_id = to_op`;
    4. `UnlinkTechnique` for `from`'s links, in descending index order;
    5. `RemoveBranch(from)`.
- **`delete_operation(id, Operation { target })`** builds one `Batch`:
  - `rekey_branch` for each of its branches onto `(target, same domain)`;
  - a `ReplaceTag` that moves each of its partial tags to `target`;
  - `RemoveOperation`.
- **`delete_operation(id, Delete)`** builds one `Batch`:
  - `RemoveTags` for every tag whose `operation_id` is `id`, including partial tags;
  - `UnlinkTechnique` for the links on its branches whose technique has a link elsewhere;
  - `RemoveTechnique` for each technique whose only links are under this operation (it removes those links itself, C15);
  - `RemoveBranch` for its branches;
  - `RemoveOperation`.

  The confirmation dialog states every count first.
- **`delete_domain(id, Domain { target })`** re-keys each `<op>.<id>` branch onto `(<op>, target)` (C6), then runs `RemoveDomain`.
- **`delete_domain(id, Delete)`:**
  - the tags on its branches become partial, keeping their operation and region (C9);
  - links on its branches whose technique has a link elsewhere are unlinked; techniques whose only links are on its branches are removed with `RemoveTechnique`; its branches are removed;
  - then `RemoveDomain` runs.
- **Batch order for every multi-item delete or move** (`rekey_branch` called in a loop, `delete_operation`, `delete_domain`, `delete_technique`, `unlink_technique`):
  - All additions and `ReplaceTag`s come first.
  - Then every removal is emitted in **descending index order, grouped by collection**: `UnlinkTechnique` (over `branch_techniques`), then `RemoveTechnique`, `RemoveBranch`, `RemoveDomain` and `RemoveOperation`.
  - The builder computes those indices against the taxonomy as it stands at each step. It does so by building the `Batch` against a scratch clone, so each recorded index matches the live state at its step. The reversed inverse (sealed `Insert*`) then re-inserts in ascending order.
  - Test: `multi_branch_batch_indices`.
- **New ids** come from the slugified name, with `-2`, `-3` and so on when taken (the same rule as Plan 2 `custom_technique`).
- **`add_operation`'s default `color`** is the first entry in `EXTRA_INKS` that no operation uses, or `None` (neutral) when all five are taken.
- **`delete_technique` and `unlink_technique`** each build one `Batch`, in this order:
  1. a `ReplaceTag` for every affected tag:
     - with `TagMove::Technique`, the tag takes the target `technique_id` and `branch_id`, **and the target branch's `operation_id`**, with `suggested: false`. One target can then serve a technique used under several operations; undo restores each tag's full `before`, original operation included;
     - with `Partial`, the tag keeps its own operation and its `region` (the area still "stands out"; `validate_tag` allows a partial tag with a region, `edit.rs:144-145`), and drops `technique_id` and `branch_id` (C9);
  2. for an **unlink**, the one `UnlinkTechnique`;
  3. for a **delete**, one `RemoveTechnique { links: all its current links }`, which removes and checks the links itself (`edit.rs:410-433`; C15). `UnlinkTechnique` is used only by unlink and re-key.

  A tag counts as affected when it uses the technique (for a delete) or the pair (technique, branch) (for an unlink). With no affected tag, `move_to` may be `None` (R20). Undo restores all of it (Review Focus 4).
- **Validation:**
  - **Names (R15; ruling B6).** `name_key` (`taxonomy.rs:117`) becomes `pub(crate)`. Every uniqueness check compares `name_key` values, which ignore case and collapse spacing only, and **excludes the id being edited**, so renaming "Chiaroscuro" to "chiaroscuro" is allowed. It covers technique names, operation names and plain labels, and domain names. Names must be non-empty. Errors: `"NameTaken:<id>"`, `"LabelTaken:<id>"`.
  - A technique must keep at least one link. Unlinking the last link returns `Err("LastLink")`; delete the technique instead.
  - A `TagMove::Technique` target must be a linked (technique, branch) pair other than the one being removed; each re-pointed tag passes `edit::validate_tag`.
  - `RemoveBranch` is used by `rekey_branch` and the deletes. There is no separate "delete branch" command: a branch disappears when its operation or domain does, or is emptied by a move.
  - **Operations:**
    - at least one must remain (`Err("LastOperation")`);
    - at most `MAX_OPS` (`Err("TooManyOperations")`);
    - `color` must be `None` or one of `EXTRA_INKS` (`Err("UnknownInk")`). A seed operation may keep `None`, because `opInk` maps it by id.
  - **Domains:** `icon` must be one of `DOMAIN_ICONS` (`Err("UnknownIcon")`).
  - **A move target** must differ from the item being deleted.
  - **Read-only taxonomy.** When `load_with_fallback` returned `TaxSource::SeedReadOnly`, `commit`'s single check refuses any edit whose `touches_taxonomy()` is true, with `Err("TaxonomyReadOnly")`. Every Task 9 command goes through `commit`, so it adds **no check of its own**. Note that `commit` runs `build` first (`commands.rs:531-536`), so a command whose `build` fails (`NeedsMove`, say) returns that error first (R17).
- **Removals and the save order (R16; Plan 2 final review M1).** `saver::flush` writes `taxonomy.json` first, which is safe only for additions. After a delete or re-key, a failed `library.json` save (or "Quit without saving") leaves tags on disk naming a removed technique or branch, and no write order is safe for a mixed batch. **Plan 3 accepts dangling ids explicitly:** the UI already degrades (`techName` falls back to the id, `view.ts:53`; `opInk` is neutral), and SPEC §9's "nothing is lost" holds, because the ids are kept. Reword the `saver.rs:78-81` comment to say so. Reporting dangling tag ids goes to Plan 6's integrity check (Cross-plan impact row 12).
- **Plan 1 Task 3 deferred minor:** add the table-driven `validate()` mutation tests here, because this is the first plan to change taxonomy structure.

- [ ] **Step 1: Write the failing tests**, in `edit.rs` and `commands.rs`, on the seed taxonomy plus a 3-reference library:
  - `update_technique_inverse_restores`: renaming *Chiaroscuro* to "Light and shadow" and then applying the inverse restores the name; the id never changes.
  - `rename_collision` (ruling B6): renaming a technique to `"POP-OUT "` returns `NameTaken:pop-out`. Renaming it to `"Pop out"` is accepted, because names match on case and spacing only.
  - `rename_to_own_name_case`: renaming *Chiaroscuro* to "chiaroscuro" succeeds (R15).
  - `noop_rename_records_nothing`: `update_technique` with the current name returns a `Change` and leaves `can_undo` as it was (R14).
  - `delete_moves_tags_and_undo_restores`: with two references tagged *Rim light* (one with a region), `delete_technique("rim-light", Technique { silhouette, differentiate.feature })` re-points both tags, keeping their regions. Then `undo()` restores the technique, all its links and both tags at their original indices.
  - `delete_to_partial`: `TagMove::Partial` leaves the tags with `operation_id` and any `region` only.
  - `unlink_last_link_refused`: returns `Err("LastLink")`, and the history is unchanged.
  - `unlink_unused_pair_needs_no_move`: `unlink_technique(t, b, None)` on a pair no tag uses succeeds; on a used pair it returns `Err("NeedsMove")` (R20).
  - `move_repoints_operation`: deleting a technique used under `differentiate` and `sequence`, moving its tags to (`leading-lines`, `sequence.space`), leaves every moved tag with `operation_id: "sequence"`. `undo()` restores each original `operation_id`.
  - `unlink_many_descending`: unlinking a technique from two branches in one batch removes exactly those two links, and the inverse restores the original `branchTechniques` order.
  - `delete_unused_needs_no_move`: `delete_technique(id, None)` on an unused custom technique succeeds; on a used one it returns `Err("NeedsMove")` and changes nothing.
  - `tag_move_json_camel`: `TagMove::Technique` serialises as `{"kind":"technique","techniqueId":…,"branchId":…}`.
  - `add_branch_then_link`: `add_branch("group", "semantic")` followed by `link_technique("semantic-compounding", "group.semantic")` validates. Two `undo` calls restore the seed exactly, value-equal through `serde_json::Value`.
  - `remove_branch_in_use`: `edit::apply` of a `RemoveBranch` whose branch a link uses returns `EditError::InUse` (C22).
  - `validate_rejects_mutations`: a table of single mutations to the seed, each rejected with a named error:
    - a dangling `techniqueId` in `branchTechniques`;
    - a branch with an unknown `operationId`;
    - a duplicate technique id;
    - a technique with no link;
    - a duplicate link.
  - `commit_reverts_new_validate_errors` (R13): a hand-built bad batch passed to `commit`, as `damaged_taxonomy_opens` does (`commands.rs:2225`), returns the new `validate()` errors and leaves the taxonomy and the history unchanged.
  - `commit_tolerates_existing_problems` (R13): on a library that opens with a duplicate operation id (as in `open_reports_taxonomy_problems_without_failing`), `update_technique` still succeeds.
  - `touches_taxonomy_covers_new_variants` (R14): every new variant, `Insert*` included, returns `true`.
  - `add_operation_defaults_ink`: the first `add_operation` gets `color: "teal"` and `icon: "a plain square"`, and the second gets `"olive"`. `undo` removes it. A tenth operation returns `TooManyOperations`.
  - `rename_operation_label` (C5): `update_operation("differentiate", { plainLabel: "Pop" })` changes the label. A duplicate label returns `LabelTaken`. `search(tax, data, "pop")` now matches `chiaroscuro`, a Differentiate technique without "pop" in its name, which shows that search reads labels from the taxonomy.
  - `delete_operation_moves_branches`: deleting `group` with `Operation { "differentiate" }` re-keys every `group.*` branch onto the `differentiate` branch with the same domain, merging into existing branches without duplicate links. All `group` tags, partial ones included, now carry `differentiate`. One `undo` restores the taxonomy and data, value-equal.
  - `delete_operation_delete`: `OpMove::Delete` removes the operation's tags and branches, plus techniques that no longer have any link. `undo` restores everything.
  - `last_operation_refused`: deleting the only remaining operation returns `LastOperation`.
  - `delete_domain_moves_or_partials`: deleting `social` with `Domain { "semantic" }` re-keys `*.social` to `*.semantic`. With `Delete`, its tags become partial and keep their operation and region. Each case is one undo step.
  - `add_domain_then_branch`: `add_domain("Rhythm", "…", None, None)` gets `icon: "a plain square"`. Then `add_branch("sequence", "rhythm")` and a `link_technique` both validate.
  - `add_domain_with_op_is_one_step`: `add_domain("Rhythm", "…", None, Some("sequence"))` creates the domain and `sequence.rhythm`. One `undo` removes both.
  - `multi_branch_batch_indices`: deleting an operation with 3 branches and 7 links, some of them adjacent in `branchTechniques`, removes exactly those items. The inverse restores `branches`, `branchTechniques` and `techniques` in their original order, value-equal.
  - `reink_seed_operation`: `update_operation("differentiate", { color: Some("rose") })` stores `"rose"`, and `{ color: None }` (explicit) clears it. Omitting `color` leaves it unchanged.
  - `read_only_taxonomy_refuses_edits` (R17): extend the existing `damaged_taxonomy_opens` (`commands.rs:2225`) rather than building a second damaged library. With valid arguments, each of `update_technique`, `add_operation` and `delete_domain(id, Some(DomainMove::Delete))` returns `Err("TaxonomyReadOnly")`. `undo()` reports `can_undo: false`, and `taxonomy.json` is byte-identical afterwards.
  - `dangling_tag_ids_open_and_render` (R16): a library whose `library.json` has tags naming a technique and a branch missing from `taxonomy.json` opens without error through `open_library`, and the returned `LibraryView` keeps those tags unchanged.
  - `op_move_json_camel`: `OpMove::Operation` serialises as `{"kind":"operation","operationId":…}`.
  - `extra_inks_match_ts` (C12): a test reads `include_str!("../../src/ops.ts")` and asserts the five `EXTRA_INKS` names appear in order.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test` (all; cargo takes one name filter only, R18). It should FAIL, then PASS. Then run `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm test` and `npm run build`.

- [ ] **Step 3: Commit**

  Commit message: `feat(core): undoable taxonomy, operation and domain edits with moves`.

---

### Task 10: Taxonomy editing in the Tree inspector  ⚑ needs Task 6 and Task 9

**Files:**
- Modify:
  - `app/src/views/inspector.ts`;
  - `app/src/views/tree.ts`;
  - `app/src/firstrun.ts` `boot()`: pass `api` and `store.apply` to the Tree (one line);
  - `DESIGN.md`: add "Extra operation inks" (the table below) and the light Group Green `-on` delta (ruling B7);
  - `app/src/styles.css`: add the `--x-*` ink tokens for both themes.
- Create:
  - `app/src/views/move-tags.ts`, the move dialogs;
  - `app/src/views/technique-form.ts`, Plan 3's own small "new technique" form (Cross-plan audit row 6; the picker exports only `mountPicker`, `picker.ts:31`).
- Test:
  - `app/src/views/inspector-edit.test.ts`;
  - `app/src/views/move-tags.test.ts`;
  - `app/src/inks.test.ts`.
- Not here any more (ruling B1): `data.ts` and `storeSource`, built in Task 2, and the `main.ts` edit (ruling B2). `boot()` already hands every view `storeSource(store)`, so every applied `Change` refreshes the Tree, Galaxy and Radial views.

**Interfaces:**
- Consumes the Task 9 commands through `api`; `Store`, `Change` and `store.apply` (Plan 2); `storeSource` and `Snapshot` (Task 2); and `renderInspector` and `InspectorOpts` (Task 6).
- **`renderInspector`'s signature is kept,** because Task 8 calls it. `InspectorOpts` gains only optional members, `api?: Api` and `apply?(c: Change): void`, which the editing controls require; with `editable: false` they are never read. Every successful edit command's `Change` goes to `apply` (`store.apply`).
- Produces:
  ```ts
  export function openMoveBranches(host: HTMLElement, ctx: { s: Snapshot; kind: "op" | "domain"; id: string }):
    Promise<OpMove | DomainMove | null>;
  export function mountTechniqueForm(host: HTMLElement, api: Api, branchId: string): void;   // calls api.addTechnique({ name, description, operationId, domainId }) — C17: no second argument; the wrapper sends tag: null
  export function openMoveTags(host: HTMLElement, ctx: { s: Snapshot; techId: string; branchId?: string /* unlink */ }):
    Promise<TagMove | null>;   // null = cancelled
  ```
- **Read-only taxonomy (Plan 2's fallback):**
  - When `snapshot.taxonomyReadOnly` is true, the Tree renders the inspector with `editable: false`. Inline editing, the ink and icon pickers, every "Delete…" button, the "+" on the bands and drag to link are all absent or disabled, and dragging a technique pans instead.
  - A note at the top of the inspector reads "The technique list is read-only because taxonomy.json is damaged." (Plan 2's copy). With `role="status"`, it is announced once.
  - Any edit command that still returns `Err("TaxonomyReadOnly")` (a race with a reload) shows the same sentence as a toast, and the UI state is left unchanged.
- **With `editable: true`, the inspector offers:**
  - **Name:** click to edit inline. Enter saves through `updateTechnique` or `updateDomain`; Esc cancels. A `NameTaken:<id>` error shows "That name is taken by <Name>." beside the field. After Enter saves, focus leaves the field (back to the canvas), so the next Ctrl+Z is a library undo, not the field's text undo (C19; `wireUndoKeys` skips text fields, `keys.ts:44`).
  - **Definition:** a textarea that saves on blur.
  - **Synonyms:** chips. "+ synonym" adds one, × removes one, and each change saves.
  - **"Used under":** each parent has an "×". When any tag uses that pair, it unlinks through the move-tags dialog; when none does, it calls `unlinkTechnique(t, b, null)` directly (R20).
  - **"Delete technique…":** a confirmation. Anything in use goes through the move-tags dialog first.
  - **Operations (decision 1):**
    - the name, plain label and description are editable inline;
    - **ink:** a swatch row of the operation's current ink plus the free `EXTRA_INKS`, each with its name as an `aria-label`;
    - "Delete operation…" opens `openMoveBranches`. Its options are "Move its branches and tags to <operation>", which re-keys them, and "Delete them and their tags". The second states the counts: "N tags on M references, K techniques left with no other place".
  - **Domains (decision 2):** name, description and an icon picker over `DOMAIN_ICONS`, which shows each description as text until Plan 6 draws the glyphs. "Delete domain…" opens `openMoveBranches` with "Move to <domain>" or "Delete; tags become partial".
- **Drag to link (S3, folded into R20):** SPEC §5's "drag a technique onto a domain to re-link it" is read as "link it again": the drag **adds** a link, and removal is the "×" on "Used under". A move is two undo steps; a move-on-drag would need a new command, which nobody asked for. Recorded as a spec reading for the controller. Dragging a technique node onto a branch node calls `linkTechnique`. While dragging, a valid target outlines in its operation ink, and an invalid target (already linked) shows `not-allowed`. Keyboard alternative: "Also use under…" in the inspector opens a branch list.
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
  - DESIGN.md gains a named set of five inks: Teal (HSL hue 180°), Olive (70°), Rose (335°), Indigo (246° light, 255° dark; kept clear of Iris's purple, about 285°) and Umber (25°, darker and less saturated than Vermilion).
  - Each has a light and a dark base, a `-text` and an `-on` variant, written as `--x-<name>`, `--x-<name>-text` and `--x-<name>-on`.
  - The Operation-Only Chroma Rule is unchanged: these inks only ever name an operation.
  - **The values (chosen by the plan amender; AGY-checked; retune if the user dislikes them).** They were computed with a script (WCAG 2 relative-luminance contrast; CIEDE2000 on sRGB → CIELAB D65, checked against Sharma's published test pairs). Light `--panel` is `#FAFAF9` and dark `--panel` is `#1B1B1B`. "Min ΔE" is against the other 8 bases of the same theme, seed inks included:

    | Theme | Ink | `--x-<name>` | `-text` | `-on` | `-on` / base | `-text` / panel | Min ΔE2000 (nearest) |
    |---|---|---|---|---|---|---|---|
    | light | teal | `#089B9B` | `#066B6B` | `#161616` | 5.32 | 6.05 | 18.5 (group) |
    | light | olive | `#6A7A1A` | `#455011` | `#FFFFFF` | 4.76 | 8.35 | 18.9 (group) |
    | light | rose | `#BC4E7B` | `#9B3B63` | `#FFFFFF` | 4.65 | 6.28 | 24.2 (infer) |
    | light | indigo | `#8C84DB` | `#675DD0` | `#161616` | 5.55 | 4.96 | 18.3 (seq) |
    | light | umber | `#815637` | `#5D3E28` | `#FFFFFF` | 6.33 | 9.20 | 18.8 (infer) |
    | dark | teal | `#0ABDBD` | `#0BDADA` | `#161616` | 7.78 | 9.89 | 18.1 (group) |
    | dark | olive | `#9AA951` | `#A7B464` | `#161616` | 7.04 | 7.67 | 18.5 (group) |
    | dark | rose | `#ED7EAC` | `#F098BD` | `#161616` | 7.05 | 8.15 | 21.8 (indigo) |
    | dark | indigo | `#B7A4EF` | `#CBBEF4` | `#161616` | 8.25 | 10.02 | 18.5 (seq) |
    | dark | umber | `#A67E59` | `#B08E6D` | `#161616` | 4.95 | 5.69 | 18.8 (infer) |

    Teal, Indigo (light) and Olive, Rose, Umber (light) take `-on` `#161616` and `#FFFFFF` respectively, whichever reaches AA on that base; every dark `-on` is `#161616`, as for the dark seed inks. The smallest pairwise ΔE2000 over all 9 bases is 18.3 in light (Sequence Blue / Indigo) and 18.1 in dark (Group Green / Teal); the floor is 15.
  - **The seed inks (ruling B7).** Measured: light `-on`/base 5.23 (diff), **4.37 (group)**, 5.56 (seq), 4.52 (infer); dark 8.20, 6.63, 5.56, 5.81; `-text`/panel 6.25–9.14 in both themes. Light Group Green `-on` (`#161616` on `#1E8E5A`, 4.37:1) is under AA. It is **not changed now**, because that is a visible change to a seed ink: DESIGN.md records it as a delta, carried to Plan 6 for a design decision.

- [ ] **Step 1: Write the failing tests**
  - `rename_inline_calls_api`: editing the name and pressing Enter calls `updateTechnique(id, { name })` once. Esc calls nothing.
  - `name_taken_message`: when the fake api rejects with `"NameTaken:pop-out"`, the inspector shows "That name is taken by Pop-out."
  - `delete_in_use_opens_dialog`: deleting a technique used by 2 references opens the dialog with "2 references use Rim light". Choosing "Keep them as partial tags" calls `deleteTechnique(id, { kind: "partial" })`. An unused technique calls `deleteTechnique(id, null)`.
  - `delete_unused_skips_dialog`: an unused custom technique deletes after the confirmation only.
  - `move_targets_exclude_self`: the dialog lists every linked pair except those of the technique being deleted. For an unlink, only the unlinked pair is excluded.
  - `no_default_choice`: the confirm button stays disabled until an option is chosen.
  - `edit_applies_change`: a successful `updateTechnique` passes its `Change` to `opts.apply` once.
  - `unlink_unused_pair_skips_dialog`: "×" on a pair no tag uses calls `unlinkTechnique(t, b, null)` and opens no dialog.
  - `enter_save_leaves_field`: after Enter saves a name, `document.activeElement` is not a text field.
  - `drop_on_branch_links`: dispatching the drag sequence from `tech:X` to `br:group.semantic` on the fake scene calls `linkTechnique("X", "group.semantic")`.
  - `new_operation_flow`: "New operation…" with name "Unsettle" and label "Make it uneasy" calls `addOperation("Unsettle", "Make it uneasy", "", null)`. The button is disabled when 9 operations exist.
  - `ink_picker_lists_free_inks`: with Teal taken, the picker offers Olive, Rose, Indigo and Umber, plus the current ink. Choosing Rose calls `updateOperation(id, { color: "rose" })`.
  - `delete_operation_dialog`: in-use deletion shows both options with counts. Neither is pre-selected, and choosing "Move… to Stand out" calls `deleteOperation(id, { kind: "operation", operationId: "differentiate" })`.
  - `read_only_disables_editing`: with `taxonomyReadOnly: true`:
    - the inspector shows the read-only note;
    - it has no enabled `input`, `textarea`, "Delete…" or "+" controls;
    - `setDraggable` is never true for `tech:` nodes;
    - when the source flips to `false`, the controls return.
  - `read_only_error_toast`: when the fake api rejects `updateTechnique` with `"TaxonomyReadOnly"`, the toast shows "The technique list is read-only because taxonomy.json is damaged.", and the inline field reverts to the stored name.
  - `technique_form_calls_add`: the form calls `api.addTechnique({ name, description, operationId, domainId })` (one argument, C17) with the fixed branch's operation and domain.
  - `inks_contrast_and_distinct`, in `inks.test.ts` (Node), reads `styles.css` with `fs` and parses the `:root` and `:root[data-theme="dark"]` blocks. In both themes (ruling B7):
    - for the 5 extra inks, `-on` against the base is at least 4.5:1;
    - for all 9 inks, `-text` against `--panel` is at least 4.5:1;
    - the 4 seed `-on` values are pinned as they stand (`#161616` or `#FFFFFF`, exactly as in `styles.css` today), with a comment naming the light Group Green 4.37:1 DESIGN delta carried to Plan 6;
    - every pair of the 9 bases differs by at least ΔE2000 15;
    - the CIEDE2000 helper itself passes Sharma's test pairs, given as Lab inputs: (50, 2.6772, −79.7751) vs (50, 0, −82.7485) → 2.0425; (50, 2.5, 0) vs (73, 25, −18) → 27.1492; (60.2574, −34.0099, 36.2677) vs (60.4626, −34.1751, 39.4387) → 1.2644, each within 1e-4, so the ΔE check cannot pass vacuously.

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- views/ inks`. It should FAIL, then PASS. Then run `npm test` and `npm run build`.

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

**Files (R19):**
- Create: `scripts/make_perf_library.py`, which writes a demo-format folder.
- Modify:
  - `app/src-tauri/src/lib.rs`: behind the cargo feature `perf`, read `HORUS_DEMO_DIR` to override the `demo` path (`lib.rs:28-34`) used both for `AppState::new` and for the asset-scope `allow_directory(demo.join("images"))`;
  - `app/src-tauri/Cargo.toml`: `[features] perf = []` (off by default);
  - `app/src-tauri/src/correlate.rs`: the budget test;
  - `app/src/graph/scene.ts`: a small overlay showing the Pixi ticker's fps and `TexCache.size()`, built only when `import.meta.env.DEV` or `import.meta.env.VITE_PERF` is set;
  - `app/README.md`, adding a "Performance check" section with the commands and the numbers measured.
- Not created: `devseed.rs` and `dev_seed_tags`. `AppState.open` and `Open` are private to `commands.rs`, and Plan 1's `demo::seed(root, tax, demo_dir)` (`demo.rs:38-79`) already imports a manifest folder and turns its `suggestedTechniques` into tags.

**Interfaces:**
- Consumes `demo::seed` (Plan 1 Task 9), first run's "Start with the demo set", and Task 1.
- The script, `python -I scripts/make_perf_library.py OUT_DIR --n 2500 --seed 7`, writes `OUT_DIR/images/*.jpg` and `OUT_DIR/manifest.json`.
  - The images are 2,500 plain 600×800 colour fields with numbers on them. They are synthetic, so there are no rights questions.
  - `manifest.json` is an array in `demo.rs`'s format (`demo.rs:12-33`): `{ "id": "p0001", "file": "images/p0001.jpg", "title": "Perf 0001", "suggestedTechniques": [{ "operation": "Differentiate", "domain": "Feature", "technique": "Chiaroscuro" }] }`.
  - Each entry has 1–4 techniques, drawn with a Zipf distribution so that some techniques are common. Each one uses the display **names** of a seed (operation, domain, technique) triple that exists as a branch link, because `to_tag` resolves names and rejects a missing branch (`demo.rs:123-160`). The script reads the triples from the bundled seed taxonomy file.
  - The tags arrive `suggested: true`; `correlate` scores them like any other tag.
- **Profiles.** The Rust budget test runs in release. The manual check also runs a release build (`tauri build`), not `tauri dev`, so both measure the same profile.

- [ ] **Step 1: Write the failing test**

  Rust `graph_edges_2500_under_budget` in `correlate.rs` `tests`, marked `#[ignore]` and run explicitly. It is a pure `correlate` test: it builds a synthetic `LibraryData` of 2,500 references with the same Zipf tags in memory (inline PRNG, C21), and asserts that `graph_edges(&d, 8)` finishes in under 1.5 s in a release build.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test --release -- --ignored graph_edges_2500`. It should PASS on Task 1's implementation (R3 built per-reference vectors once). If it fails, the fix belongs in `graph_edges`, not in the test. Then write the script and the `perf` feature, and check that `cargo build` without the feature compiles no `HORUS_DEMO_DIR` read (`cargo clippy --all-targets -- -D warnings` with and without `--features perf`).

- [ ] **Step 3: Manual check**

  1. Run `python -I scripts/make_perf_library.py OUT_DIR --n 2500 --seed 7`.
  2. Build with `VITE_PERF=1 npm run tauri build -- --features perf`, and start the built app with `HORUS_DEMO_DIR=OUT_DIR`.
  3. On first run, create a new library with "Start with the demo set".

  Expected on the development machine:
  - The Galaxy shows its first layout within 3 s, with the UI responsive throughout.
  - Panning and zooming hold at least 55 fps (Pixi ticker), both fitted and zoomed in.
  - Live textures never exceed 600 (the `scene.ts` overlay, hence `VITE_PERF=1`).
  - At far zoom everything is dots.
  - The Tree with the most-used technique expanded, the Tree with **"Show all references"** on (decision 3), and the Radial for the busiest operation all pan at at least 55 fps.

  Record the measured numbers in `app/README.md`. Delete the test library afterwards.

- [ ] **Step 4: Commit**

  Commit message: `test(perf): 2,500-reference synthetic library and graph speed check`.

---

## Parallel schedule (pre-flight scan §7)

Each track is its own worktree, with its own `npm install`.

**Dependencies:** T5 needs T3 (`constants.ts`) and T2 (`Snapshot`). T4 needs T3. T6 needs T2, T4 and T5. T7 needs T1, T2 and T4 (`package.json`). T8 needs T6. T9 needs nothing in Plan 3. T10 needs T6 and T9. T11 needs T1 and T7 (and T6 and T8 for the manual check).

| Wave | Track A, Rust (one worktree: T1 and T9 share `commands.rs`, `lib.rs`, `api.ts`, the contract test and the fakes) | Track B, UI |
|---|---|---|
| 1 | **T1** | **T2** ∥ **T3** (T3 only adds `graph/*`; it is already in flight). T1 and T2 both touch `firstrun.test.ts` and `reference/view.test.ts`: T1 adds one `graphEdges: vi.fn()` line to each fake, and T2 edits elsewhere in those files. Hand-merge, or land T1 first. |
| 2 | **T9**, on top of T1 | **T4** (needs T3; owns `package.json` and the lock file) ∥ **T5** (needs T2 and T3 merged; new `graph/*` files only) |
| 3 | — | **T6** ∥ **T7** (T7 needs T1 merged). They share only a one-line registration each in `firstrun.ts` `boot()` and separate `styles.css` blocks, so merge by hand. |
| 4 | — | **T8** (needs T6) ∥ **T10** (needs T6 and T9). They share only one line each in `firstrun.ts` `boot()`; merge by hand. T8 edits `views/radial.ts` and only imports `views/inspector.ts`; T10 edits `inspector.ts`, `tree.ts`, `styles.css` and `DESIGN.md`. T10 keeps `renderInspector`'s signature, because T8 calls it. |
| 5 | **T11**, last (Rust `lib.rs` and `Cargo.toml`, plus the script; the manual check needs everything) | |

## Self-review

**1. Spec coverage**

- **§5 Tree:**
  - the bands, the docked inspector and the breadcrumb: Tasks 5 and 6;
  - editing (rename, define, synonyms, delete with the "where should tags move" prompt, drag to link (S3), "+" on bands): Tasks 9 and 10.
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
- `Snapshot`, `SourceEvent` and `DataSource` (Task 2, over Plan 2's `Store`) are used by Tasks 5, 6, 7, 8 and 10.
- `SceneNode` (with `dim`), `Scene` (with `Mods`) and `mountCanvasOrFallback` live in `frame.ts`; `createScene` in `scene.ts` (Task 4). Used by Tasks 6, 7 and 8.
- `InspectorOpts` (Task 6) is passed unchanged by Task 8, and Task 10 adds only optional members.
- `TagMove`, `OpMove`, `DomainMove` and the three patches are the same in Rust and TypeScript (Task 9 → 10).
- `ViewHandle` (Task 2, `views.ts`) is returned by `mountTree`, `mountGalaxy` and `mountRadial`.

**4. Review Focus.** Every item has a named test in its owning task:
- item 1: Tasks 4 and 6;
- item 2: Tasks 5 and 7;
- item 3: Tasks 2, 6 and 7;
- item 4: Tasks 9 and 10;
- item 5: Task 3.

**5. Proportion.** There are 11 tasks: signatures, test names and assertions, with no bodies. The user's decisions grew Tasks 9 and 10, operation and domain CRUD in particular. They were not split, because each still ends at one reviewable deliverable: the Rust edits, then the UI.

## Decisions (answered by the user, 2026-11-25)

1. **Operations are fully editable.** The artist can add, rename, re-label, re-ink and delete operations (Tasks 9–10).
   - Deleting an operation that is in use asks where its branches and tags go: move them to another operation, or delete them. Each delete is one undo step.
   - New operations take an ink from a five-ink extra set (Task 10, DESIGN.md), and every view degrades to neutral for an operation with no known ink (`opInk`, Plan 2's `ops.ts`).
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
| `app/src/reference/view.ts` `OP_KEY` | four ids, each mapped to a CSS token, with an unknown id falling back to amber | **Done by Plan 2:** `OP_KEY` is gone; the view uses `opInk` (`view.ts:48-50`), and an unknown operation is neutral. |
| `app/src/styles.css` tokens (`:root`, lines 1-24) | exactly four inks | Extended in Task 10 (`--x-*`). |
| Plan 2 Task 8 picker | four buttons, keys `1`–`4`, exact copy | **Done by Plan 2:** dynamic for 1–9 operations, with `digitOf` (`picker.ts:98`, `:352-355`). |
| Plan 2 Global Constraints | "Operation buttons read exactly …" | **Copy rule changes.** See the cross-plan impact list. |

## Cross-plan impact

| # | Change needed | Owner |
|---|---|---|
| 1 | **The tagging picker renders operations dynamically.** It shows one button per taxonomy operation (1–9, in taxonomy order), with keys `1`–`9`, labels from `plainLabel`, and swatches from `opInk`. Update Plan 2's Global Constraints copy line ("Operation buttons read exactly …") to say "the seed labels by default, editable by the artist". Change the Plan 2 Task 8 test of 4 exact labels to the seed case, and add a 5-operation case. | **Done** (Plan 2: `picker.ts:98`, `:352`) |
| 2 | **Plan 1's Global Constraints copy line** ("The UI uses plain-English operation labels: …") becomes "the seed's labels, editable by the artist (Plan 3)". **SPEC §6.1** ("Four buttons") and **§7** get the same note. | Controller (P1 doc and SPEC) |
| 3 | **Reference view inks:** `OP_KEY` is replaced by `opInk`, and an unknown operation is neutral, not amber. The Reference view reads the shared `Store` (audit row 28). | **Done** (Plan 2: `ops.ts`, `view.ts:48-50`, `mountReference(root, api, store)`) |
| 4 | **DESIGN.md "Extra operation inks"** (Teal, Olive, Rose, Indigo, Umber, light and dark, `-text` and `-on`, AA-checked; values in Task 10), plus a note that the Operation-Only Chroma Rule covers them. | P3 T10 (this plan); values chosen by the amender, AGY-checked |
| 5 | **Plan 4 Compare and Lightbox** colour region outlines and labels by operation. They must use `opInk`, not per-id tokens. | P4 T6, T7 |
| 6 | **Plan 6 icons:** the glyph set must include drawings for `DOMAIN_ICONS`' two generic entries ("a plain square", "a dot inside a ring"). New operations need a default icon, "a plain square". | P6 (icons task) |
| 7 | **Plan 6 integrity check and import:** confirm that `validate()`, not `validate_seed()`, runs on every opened library, because an edited taxonomy fails `validate_seed` by design. | P6 T2 |
| 8 | **Plan 6 intro card and About:** they describe the four seed operations as the starting set. Their copy must not claim that there are always four. | P6 (intro) |
| 9 | **Plan 4 board scope** now has a consumer: `Snapshot.inScope` (Task 2) is `() => true` until Plan 4 adds `store.inScope`, which `storeSource` then reads (audit row 10). | P4 T5 (adds `store.inScope` and the `storeSource` line) |
| 10 | **Plan 4 Compare entry from the graph views:** `firstrun.ts` `boot()` passes `openCompare: (a, b) => mountCompare(…)` to the Galaxy (audit row 25). | P4 T7 (export and the `boot()` line), P3 T7 (the optional dep) |
| 11 | **Shortcuts table:** Radial is now `1`–`9`, and the Tree gains no new keys. Update the audit's shortcut list. | Controller (CROSS-PLAN-AUDIT.md) |
| 12 | **Dangling tag ids after a taxonomy removal (R16):** a failed `library.json` save after a delete or re-key can leave tags naming a missing technique or branch. Plan 3 accepts this (the UI degrades, the ids are kept); Plan 6's integrity check reports dangling tag ids. | P6 T2 |
| 13 | **Light Group Green `-on` is 4.37:1 (ruling B7):** under AA, recorded as a DESIGN delta, not changed in Plan 3 (a visible seed-ink change). A design decision is needed. | P6 (design), controller |
| 14 | **Spec deltas to record:** SPEC §10's "coloured dots" are neutral `--ink-2` dots (C3, DESIGN Operation-Only Chroma); SPEC §5's "drag … to re-link" is read as "drag to add a link" (S3, Task 10). | Controller (SPEC) |
| 15 | **`pixi.js/unsafe-eval` under the strict CSP (B4):** Plan 6 Task 1 Step 4 re-checks that the canvas renders with no `unsafe-eval` in the CSP. | P6 T1 |
