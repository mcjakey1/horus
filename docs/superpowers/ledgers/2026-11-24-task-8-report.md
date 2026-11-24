# Task 8 report: the Reference view, ported from the prototype

**Status:** DONE_WITH_CONCERNS (see Concerns)
**Branch:** `t8-frontend`, in the worktree `.worktrees/t8-frontend`, on top of 3fcaa8c.

**Commits:**
- `7953e4d` feat(ui): Reference view wired to the Rust core
- `0f43910` fix(ui): drop stale search results, keep Back trail clean, scope listeners (AGY fixes)

## What was done

### `app/src/api.ts`

- Typed wrappers for the eight Task 7 commands, each a plain `invoke`. All types are camelCase.
- The types: `Reference` (it carries `thumb256` and `thumb1024`), `Tag`, `Link`, `LibraryView`, `Taxonomy`, `Scored`, `ImportReport`, `Settings`.
- `Hit` is the tagged union from Task 6, discriminated on `kind`.
- **An `Api` interface for testing.** The fake in `view.test.ts` implements it.
  - The interface includes `assetUrl(path)`, which is `convertFileSrc` in `tauriApi`. Image URLs are never built by joining strings.
  - `convertFileSrc` needs the Tauri runtime, which jsdom doesn't have; that's why `assetUrl` is part of `Api`.

### `app/src/reference/tile.ts`

- `tileBox(aspect, tile, region?)` returns `{ plate, outline? }`, as the brief specifies.
- `tileHTML` uses the reviewed letterbox design: the whole plate on the N5 tile, with the region outlined.

### `app/src/reference/view.ts`

`mountReference(root, api)` returns `{ show, ready, destroy }`.

- **Ported 1:1 from `prototype/app.js`:**
  - the behaviour of `show` and all `render*` functions;
  - the arrival-path breadcrumb;
  - hover, pin and focus states;
  - the Callouts, Ranked and Links tabs, including the filter mode;
  - the links you draw, listed first and kept out of scoring;
  - the readout and Value view;
  - the light and dark themes;
  - the 180 ms leaving transition;
  - keyboard: `/`, `1`–`9`, `v`, Esc, Backspace and Alt+←, plus arrow keys on the tabs;
  - ARIA: tabs, the `aria-pressed` pin buttons and the combobox.
- **What changed from the prototype:**
  - Correlation comes from `api.related(id)`. Tags carry only ids, so the view looks up operation, domain and technique names, plain labels and definitions in `get_taxonomy`.
  - The tag state (full, partial or region) is derived: region if the tag has a region, full if it has a technique id, otherwise partial.
  - The theme is saved through `get_settings`/`set_settings` instead of `localStorage`. A `"system"` setting follows `prefers-color-scheme`.
  - The status bar shows "Find similar: on/off" from the settings.
  - **On load:** the view calls `getSettings`, then `openLibrary(lastLibrary)` and `getTaxonomy`. It then shows the first reference with 3 or more tags, as the prototype does. With no library it shows "No library open yet."
- **`destroy()`:** every listener is registered through an `AbortController`, and `destroy()` aborts it. This was an AGY fix.

### `app/src/reference/leaders.ts`

`drawLeaders` and `highlight`, ported from `drawLeaders` and `hot`. Leaders are drawn always but shown only on hover or pin; the CSS controls this, as in the prototype.

### `app/src/search.ts`

- The combobox. It calls `api.search(q)` and switches on `kind`:
  - a technique hit applies the filter, as in the prototype's `applyFilter`;
  - a reference hit navigates to that reference.
- Labels come from the taxonomy.
- A response that arrives after the query has changed is dropped (a sequence number, bumped on every close).

### Other files

- **`app/src/styles.css`:** copied verbatim from `prototype/styles.css`.
- **`app/src/fonts/`:** the 7 OFL TTF files, `LICENSES.txt` and `fonts.css`, per the ruling: TTF, not woff2.
- **`app/index.html`:** the prototype's markup, titled "Horus", with an `id="find-similar"` added to the status bar.
- **`app/src/main.ts`:** mounts the view with `tauriApi`.
- **Removed:**
  - the scaffold's greet demo and its `src/assets/*.svg`;
  - the "Tauri App" title. `tauri.conf.json` already said "Horus".
- **Added:**
  - `vite-env.d.ts`, so `tsc` accepts imports of CSS and `?raw` files;
  - jsdom as a dev dependency.
  - jsdom 31.0.1, vite 8.3.8 and vitest 5.1.1 work together without any conflict.
- **`.gitignore`:**
  - The `reference/` line was unanchored, so it also ignored `app/src/reference/`. I changed it to `/reference/`.
  - The root folder of third-party frames is still ignored; I checked this with `git check-ignore`.

## RED / GREEN

Commands ran from `app/`.

**RED.** I first ran the tests against stubs for `tile.ts` and `view.ts`; `index.html` was still the scaffold.

```
$ npm test
 Test Files  2 failed (2)
      Tests  7 failed (7)
```

**GREEN** after the port:

```
$ npm test
 Test Files  2 passed (2)
      Tests  7 passed (7)
$ npm run build        # tsc && vite build
✓ built in 9.04s
```

**AGY fixes, RED then GREEN.** I added three tests, plus an assertion in the Back test, before changing the code.

```
$ npm test   → Tests  6 failed | 3 passed (9)
      (view.destroy is not a function; Back not disabled after returning; stale search reopened)
$ npm test   → Tests  9 passed (9)
$ npm run build → ✓ built
```

**Final tests:**

- `tile.test.ts`: 3 tests, using the brief's exact values for portrait, region and landscape.
- `view.test.ts`: 6 tests, with a fake api holding 3 references:
  - 2 callouts render, and the partial one says "technique not chosen yet";
  - the Links badge shows 1;
  - clicking a thumbnail calls `api.related("b")`, Back returns to A, and Back is then disabled;
  - `v` toggles Value view once;
  - a stale search response is ignored.

## Files changed

```
 .gitignore                     |   2 +-
 app/index.html                 | rewritten (prototype markup)
 app/package.json, package-lock | jsdom devDependency
 app/src/api.ts                 | new
 app/src/assets/*.svg           | deleted (scaffold)
 app/src/fonts/*                | new (7 TTF + LICENSES.txt + fonts.css)
 app/src/main.ts                | rewritten
 app/src/reference/{tile,leaders,view}.ts, {tile,view}.test.ts | new
 app/src/search.ts, app/src/vite-env.d.ts | new
 app/src/styles.css             | replaced with prototype/styles.css
```

## AGY

I asked AGY Validator #2 once, in conversation `bb3386cd`, to review `7953e4d`. It worked read-only.

**Verdict: `PASS WITH FIXES`.** All three fixes are applied in `0f43910`:

1. A search response could come back after the query was cleared or a result chosen, and reopen the dropdown. `close()` now bumps the sequence number.
2. Showing the reference already in focus added a step to the Back history. It no longer does.
3. The `document` and `root` listeners were never removed. They are now scoped to an `AbortController`, which `destroy()` aborts.

AGY checked the rest and found it clean: API parity, the rulings, prototype parity and ARIA, escaping before `innerHTML` (XSS), and the `.gitignore` change.

## Concerns

1. **The manual check needs UI that isn't in this task.** `create_library` and `import_paths` are wrapped in `api.ts`, but nothing in the UI calls them. There is no "create library" or "import" control or drop target, and neither the brief's file list nor the prototype has one. When no library has been opened, the view only says "No library open yet." The brief's Step 3 (create a library, import 3 images) needs either a small intake UI or a dev hook. That should be decided when Task 7 is integrated.
2. **`open_library` with `lastLibrary`.** The view reopens `settings.lastLibrary`. Presumably the Rust side records `lastLibrary` when a library is created or opened; Task 7 should confirm this.
3. **The Task 7 contract I assumed:**
   - `set_settings` takes `{ s }`, matching the plan's `set_settings(s: Settings)`.
   - `related` takes `{ id }`.
   - `import_paths` takes `{ paths }`.
   - `ImportReport` may include `warnings`.
   - If Task 7 names any of these arguments differently, change `tauriApi` in `api.ts`.
4. **The greet command is still in Rust.** `greet` remains in `lib.rs`; Task 7 owns that file.
5. **`.impeccable/hook.cache.json` changed but is not committed.** A design hook modified it during this session.
