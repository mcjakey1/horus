# Task 2 review: view shell and data source (378f713..30d2d44)

## Part 1: Spec compliance: ✅

| Item | Status |
|---|---|
| `data.ts`: `Snapshot`, `SourceEvent`, `DataSource` and `storeSource(store)` match the brief's signatures. `version` bumps on every store event. `reset` maps from `e.reset === true`. `inScope` is `() => true`. | ✅ |
| `views.ts` grows in place (B2). `ViewId` has all six ids. `ViewHandle`, `register`, `select`, `current`, `openReference` and `destroy` match the brief. | ✅ |
| Plan 2 markup and behaviour are kept: `[data-view-tab]`, `body.dataset.view`, `.is-on` and `aria-current="page"`. | ✅ |
| Lazy mount: the factory runs on the first `select` only. After that the view is only hidden and shown. | ✅ |
| `show()` runs on every `select`, a re-select included. `hide()` runs only when the id changes. | ✅ |
| `register` removes `disabled` and `title`. The click delegate ignores a disabled tab. Boards stays disabled. | ✅ |
| `openReference` calls `select("reference")`, then `deps.showReference(id)`. | ✅ |
| `mountReference(..., opts.onNavigate)`: it runs before `applyFilter` and before `show`. The default `{}` keeps the other callers working (only `firstrun.ts:45` and the tests call it). | ✅ |
| `boot()` steps 1–6: the shell, `onNavigate`, the no-op reference handle, the inbox `show` landing, intake `show: shell.openReference` with `openPicker` → `select("inbox")`, and one `storeSource`. | ✅ |
| `index.html`: Tree, Galaxy and Radial get `data-view-tab`, still disabled with `title="Not built yet"`. The three `graph-host` sections are added. | ✅ |
| `styles.css`: non-reference views use `52px 1fr 36px` and hide `.record`/`.work`. `.inbox` shows only for inbox. Each host shows only for its own id. | ✅ |
| All the required tests are present: `select_mounts_lazily_and_hides_others`, `show_runs_on_every_select`, `tabs_reflect_selection`, `register_enables_tab`, `disabled_tab_ignored`, `open_reference_switches_view`, `store_source_versions`, `store_source_reset_event`, `store_source_fields` and `search_hit_navigates_first`. | ✅ |
| The Inbox `openPicker` behaviour is kept. The old `current()==="inbox"` branch did `focusId(refId)`. The new re-select runs `show` with `landOn` set, so it does the same. | ✅ |
| No new strings, and no inline `style=`. | ✅ |
| `firstrun.test.ts` Inbox tests (`:124`, `:165`) stay green. This review did not re-run them. The report claims 259/259. | ⚠️ |

**Extras, all justified:**
- **`data-view-tab="boards"`:** without it, Plan 4's `register("boards")` could not find the tab.
- **`source` returned from `boot()`:** `tsconfig` has `noUnusedLocals: true`, so an unused `const source` would fail the build.
- **The added `destroy` test:** `destroy()` is in the brief's interface.

**Missing / Misunderstood:** none.

## Part 2: Quality: Approved

Correctness checks:
- **Lazy mount and lifecycle:** correct. `hide` runs before the new view's `mark` and its factory. The re-select path skips `hide`.
- **Destroy:** the shell's click listener now goes through an AbortController. Plan 2's listener was never removed.
- **Disabled tabs:** guarded. The report's mutation check shows `disabled_tab_ignored` fails when the guard is removed.
- **Keyboard:** the tabs are native buttons. They join the tab order once `register` removes `disabled`.
- **Store subscription:** `storeSource` registers before any subscriber of its own. Store listeners live in a `Set`, which runs them in insertion order, so each subscriber sees the bumped snapshot. `store.reset` replaces `refs` and `tax`, and `snap()` re-reads them at each event, so a reset delivers the new data.
- **Plan 2 code:** `reference/view.ts:491` reads `body.dataset.view`, and `mark()` still sets it, so its keyboard guard still works.

### Findings

**Minor 1: the `Snapshot` doc does not say that its fields are live** (`app/src/data.ts:6-7`).
- **Problem:** `refs` and `links` are the Store's own objects, and `store.apply` mutates `refs` in place. So `snap.refs` keeps the same identity across edits, while the snapshot object itself is new at each event. Review Focus 3 views in Tasks 6–8 will meet this:
  - a view that memoises its layout on `snap.refs` identity goes stale after an edit;
  - a view that diffs the previous snapshot against the current one finds no difference, because both point to the same Map.
- **A second trap:** a store subscriber registered before `storeSource` sees a stale `get().version`.
- **Fix:** add one line to the `Snapshot` doc: "refs/links are the Store's live objects; key caches on `version`, and subscribe through the source, not the store."

**Minor 2: the test comment does not describe the test** (`app/src/views.test.ts:83`).
- **Problem:** the comment says "also dispatch on a child", but the next line dispatches on the tab itself.
- **Fix:** change the comment to "dispatch a bubbling click directly, since jsdom's `.click()` on a disabled button does nothing".

**Minor 3: `open_reference_switches_view` does not check the order** (`app/src/views.test.ts:90-100`).
- **Problem:** the brief requires `select("reference")` *then* `showReference`. The test checks only the end state, so swapping the two calls would still pass.
- **Fix:** use `const showReference = vi.fn(() => expect(views.current()).toBe("reference"))`.

**Minor 4: the no-op has an unclear name** (`app/src/firstrun.ts:56`).
- **Problem:** `const still = () => {}` does not read as a no-op.
- **Fix:** rename it to `noop`.

**Minor 5: an import is out of order** (`app/src/firstrun.ts:13`).
- **Problem:** `import { storeSource } from "./data"` sits between `./save-dialog` and `./store`. The other imports in the block are alphabetical.
- **Fix:** move it up, after `./api`.

**Note, not a finding:** a programmatic `select()` of an unregistered id still sets `body.dataset.view` and leaves the middle row blank. Nothing calls it that way today, and the report states it. Leave it.
