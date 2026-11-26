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

