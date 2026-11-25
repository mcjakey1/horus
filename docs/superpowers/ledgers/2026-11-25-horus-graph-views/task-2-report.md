# Task 2 report: the view shell and the data source

**Status:** DONE. Commit `30d2d44` on `p3-t2` (parent `378f713`), with the message `feat(ui): view shell in views.ts and store-backed data source`.

## What was implemented

### `app/src/data.ts` (new)

- **Types, as in the brief:** `Snapshot`, `SourceEvent` and `DataSource`.
- **`storeSource(store)`:**
  - It subscribes to the Store once and bumps `version` on every store event. On each event it rebuilds one cached `Snapshot`.
  - `get()` returns that snapshot.
  - `subscribe(fn)` wraps `store.subscribe` and calls `fn(snapshot, { reset: e.reset === true })`. It returns the Store's unsubscribe function.
  - The source's own subscription is added first, so subscribers always see the bumped snapshot.
- **Snapshot fields:** `refs`, `links` and `tax` are the Store's live objects, not copies. Snapshots are read-only by convention. `taxonomyReadOnly` mirrors `store.taxonomyReadOnly`, and `inScope` is `() => true`.

### `app/src/views.ts` (the Plan 2 toggle, grown in place, ruling B2)

- **Types:** `ViewId` now has all six ids, plus the new `ViewHandle` interface.
- **`mountViews(root, { showReference })`** returns `register`, `select`, `current`, `openReference` and `destroy`.
  - **`register(id, factory)`** stores the factory and removes `disabled` and `title` from that id's tab.
  - **`select(id)`:**
    1. If the id changes, it calls the current view's `hide`.
    2. It marks the tab: `body.dataset.view`, `.is-on` and `aria-current="page"`, as in Plan 2.
    3. It runs the factory on the first select only.
    4. It calls `show()` every time, a re-select included.
  - **The click delegate** ignores `[data-view-tab]` buttons that are `disabled`.
  - **`openReference(id)`** calls `select("reference")`, then `deps.showReference(id)`.
  - **`destroy()`** aborts the click listener and destroys the mounted handles.

### `app/src/reference/view.ts` (the R5 search hook only)

- `mountReference(root, api, store, opts = {})`. The search hooks now call `opts.onNavigate?.()` first, then `applyFilter(id)` or `show(id)`.

### `app/src/firstrun.ts` `boot()`, steps 1–6

1. `const shell = mountViews(root, { showReference: (id) => view.show(id) })` is built before the Reference view.
2. `mountReference(root, api, store, { onNavigate: () => shell.select("reference") })`.
3. `register("reference", …)` with no-op `show`, `hide` and `destroy`.
4. `register("inbox", …)`, whose `show` is `landOn ? inbox.focusId(landOn) : inbox.focus(0)`.
5. **Intake:**
   - Intake's `show` is `shell.openReference`.
   - `openPicker` sets `landOn`, calls `shell.select("inbox")`, then clears `landOn`.
   - This replaces the old `current() === "inbox"` branch. `show` runs on a re-select too, so it lands on the same item.
6. `const source = storeSource(store)` is built and returned from `boot()` next to `store`, ready for Tasks 6–8. `destroy` also calls `shell.destroy()`.

### `app/index.html`

- The Tree, Galaxy and Radial tabs gain `data-view-tab="tree"`, `"galaxy"` and `"radial"`. They stay `disabled` with `title="Not built yet"`.
- **Beyond the brief:** Boards also gains `data-view-tab="boards"`, still disabled. `disabled_tab_ignored` needs it to find the tab, and Plan 4's `register("boards", …)` needs it to enable the tab.
- Three empty hosts follow `#inbox`: `<section class="graph-host" data-view-host="tree|galaxy|radial"></section>`.

### `app/src/styles.css` (the old `:285-287` rules, generalised)

- `body[data-view]:not([data-view="reference"])` gets the `52px 1fr 36px` rows and hides `.record` and `.work`.
  - The `[data-view]` presence test keeps the Reference layout behind the first-run dialog, before `mountViews` sets the attribute.
- `.inbox` still shows only for `inbox`.
- `.graph-host` is `display: none; position: relative; min-height: 0`. It becomes `display: grid` only under its own `body[data-view="<id>"]`.

## Tests

- **`views.test.ts`** (7 tests):
  - `tabs_reflect_selection`: the existing test, ported to `register`, now also checks `.is-on`.
  - `select_mounts_lazily_and_hides_others`;
  - `show_runs_on_every_select`;
  - `register_enables_tab`;
  - `disabled_tab_ignored`;
  - `open_reference_switches_view`;
  - one extra, `destroy tears down mounted views and stops listening`.
  - Each shell listens on `document.body`, so an `afterEach` destroys it. Without that, an earlier test's listener still answered clicks.
- **`data.test.ts`** (3 tests, on a real `createStore`): `store_source_versions`, `store_source_reset_event` and `store_source_fields`.
- **`reference/view.test.ts`:** `search_hit_navigates_first (Plan 3 R5)`.
  - The spy records the state at the moment it runs. For the reference hit, `related("b")` has not been called yet. For the technique hit, the Ranked tab is not yet selected.
  - Both are true afterwards.
- **`firstrun.test.ts`** is not edited. Its two Inbox tests (the `boot wiring (Task 9)` block) pass against the new shell.

### TDD evidence

- **RED,** with `npx vitest run src/views.test.ts src/data.test.ts src/reference/view.test.ts`. The output is saved in `scratchpad/p3t2-red.txt`.
  - `views.test.ts`: 7 failed (`views.register is not a function`, and `Cannot read properties of null (reading 'disabled')` before the tabs had ids).
  - `data.test.ts`: `Cannot find module './data'`.
  - `search_hit_navigates_first`: `expected "vi.fn()" to be called 1 times, but got 0 times`.
- **GREEN:** `npm test` gives "Test Files 25 passed (25), Tests 259 passed (259)". `npx tsc --noEmit` is clean, and `npm run build` ends with "✓ built".
- **Mutation check:** with the `!t.disabled` guard removed, `disabled_tab_ignored` fails (1 failed, 6 passed). Restored afterwards.

## Files

- **Created:**
  - `app/src/data.ts`;
  - `app/src/data.test.ts`.
- **Modified:**
  - `app/src/views.ts` and `app/src/views.test.ts`;
  - `app/src/firstrun.ts`;
  - `app/src/reference/view.ts` and `app/src/reference/view.test.ts` (one new test, in the middle of the file; the `fakeApi` is untouched);
  - `app/src/styles.css`;
  - `app/index.html`.
- **Not touched:** `firstrun.test.ts` (left free for Task 1's Api fake member), `ops.ts`, `main.ts` and `search.ts`.
- **No new inline `style=`.** The diff adds none.

## Self-review

- **The interfaces match the brief exactly.** The `mountReference` return type is unchanged: `{ show, ready, destroy }`.
- **`select` and unregistered ids:** a programmatic `select` of an unregistered id still marks `body.dataset.view`. Only the click path is guarded, through `disabled`. Nothing calls `select` with an unregistered id today.
- **`destroy` order:** `boot().destroy` calls `shell.destroy()` (no-op handles for reference and inbox) and still calls `inbox.destroy()` and `view.destroy()` directly, as before.

## AGY #2

**Verdict: PASS.**
- Quote: "Exact match to brief across data.ts … views.ts … and reference/view.ts".
- Quote: "Inbox/intake flow preserved: `openPicker` sets `landOn` and calls `shell.select("inbox")`, which triggers `show()` even on re-select without calling `hide()`."
- **Non-blocking notes:**
  - a programmatic `select()` of an unregistered id, covered above;
  - `storeSource` keeps its Store subscription for the Store's lifetime, which AGY calls "acceptable, same lifetime as `boot()`".

## Concerns

1. **Boards `data-view-tab`:** the brief listed only Tree, Galaxy and Radial. I added it for Boards too (it stays disabled), so the test and Plan 4's `register` can find the tab.
2. **Live objects, not copies:** a `Snapshot` holds the Store's `refs` Map and `links` array. A snapshot a view keeps after a change sees the mutated Map, so views must compare `version` and not object identity. Copying on each event would cost O(n) per edit; I did not do it.
3. **`storeSource` never unsubscribes from the Store.** It is built once per `boot()`, with the same lifetime as the Store. `ponytail:` it's fine while there is one source per Store.
