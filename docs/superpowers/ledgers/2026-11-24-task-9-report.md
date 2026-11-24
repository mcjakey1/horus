# Task 9 report: first run, demo seed, library picker

**Status:** DONE. **Commits:** `a7d9940` feat(app): first-run library setup with demo seed and Find similar choice; plus `f2282a1`, which adds the status-bar `nowrap` fix. Its message also mentions the report and screenshots, but `.superpowers/` is git-ignored, so they are on disk only. `97179bc`, between the two, was committed by another session.

## What was built
- **`create_library(path, seed_demo)`** (IPC `{ path, seedDemo }`). With the gate held, it runs `Library::create`, then `demo::seed`, then `lib.save()`, then `install`. The seed runs on the new library before it is installed, so no state lock is held while files copy. `install` swaps the library in under the lock. After `create` succeeds, seeding never returns `Err`; every problem becomes a seed warning.
- **`src-tauri/src/demo.rs`** calls `import_paths` once per manifest record, with a growing `known` map, so the reference that comes back belongs to that record (matched by source path).
  - It overwrites title, creator, year, credit and sourceUrl, and the note when present.
  - Names resolve by exact match on technique, operation and domain names. The branch is `<op>.<domain>` and must exist. The region passes through. A partial tag gets the operation only. Tag ids are `<refId>-<n>`.
  - An unresolved name, a missing image or an unreadable manifest goes into `seedWarnings`. These are joined into `LibraryView.warning`, and the tag is left out.
- **Bundled demo:** `resources/demo/{manifest.json, images/}` is listed in `bundle.resources`. In dev, `target/debug/resources/demo/images` held 50 files. The JPEGs are not git-ignored.
- **`system_ram_gb`** uses `sysinfo` 0.40 (`default-features = false`, `system` only). I chose it because the app targets Windows, macOS and Linux, and a raw Windows call would need cfg stubs on the other two. It returns bytes rounded to whole GB, or `None`.
- **`tauri-plugin-dialog`**, with `dialog:allow-open` in the capabilities. `Api` gains `pickFolder`, `pickImages` and `systemRamGb`, so the views never import the plugin.
- **`firstrun.ts`:**
  - `boot()` opens `lastLibrary`. If there is none, or the open fails (with a readable message), it shows the first-run overlay.
  - The overlay's other elements are `inert`.
  - Step 1 is Create… or Open…, using the folder picker.
  - Step 2 is the demo checkbox, on by default and disabled for Open.
  - Step 3 is the Find similar question with the exact §5a copy and the detected RAM. Its buttons have `aria-pressed`, and neither starts pressed. Each click records only `{findSimilar}`.
  - "Begin" is enabled once a folder is chosen and step 3 is answered. It shows a busy state while it runs.
  - Step 3 is hidden when `findSimilar` was already answered, which happens when first run reappears after a moved library.
- **`importer.ts`:** "Import images…" (multiple files, image filter) and "Import folder…" in the status bar. The flow is `importPaths`, then `openLibrary(root)`, then refresh the view. A notice gives "Added N · N already in the library · N skipped", plus each skipped file with a readable reason.
- **`view.ts`:**
  - It takes an optional initial `LibraryView`. One `apply(lib)` seam serves the startup open, the first-run result and the post-import refresh.
  - The existing inline styles are untouched. I added no new `style="…"`.
- **`Cargo.toml`** sets `[profile.dev] opt-level = 1`. The debug demo seed took about 40 s; generic `image` code is compiled into this crate, so optimising only the dependencies did not help. It now takes 5–8 s.

## TDD evidence
**Rust RED** (`seed` stubbed to return nothing): 56 passed, 2 failed.
```
---- demo::tests::unknown_manifest_name_is_reported ---- assertion `left == right` failed  left: 0  right: 2
---- commands::tests::seed_demo_imports_manifest_tags ---- assertion `left == right` failed  left: 0  right: 50
```
**Rust GREEN:** 58 passed. The new tests:
- `seed_demo_imports_manifest_tags`: the real 50 records, every tag resolved, unique ids, saved to disk;
- `create_with_seed_demo_arg_name_is_camel`: a real IPC call through `get_ipc_response`. `seed_demo` is rejected with an error naming `seedDemo`, and `seedDemo` succeeds;
- `bundled_demo_matches_repo`: the manifest text and the image file list;
- `unknown_manifest_name_is_reported`: a fixture with a bad technique, a bad operation, a missing image, a partial tag and a region;
- `system_ram_is_reported`.

The IPC and drift tests passed on their first run. They guard wiring that was written in the same step.

**Vitest RED** (Import wiring and the Not-now `setSettings` call disabled): 2 failed, 11 passed.
```
× shows the three steps when there is no lastLibrary, and Not now records off — expected setSettings called with { findSimilar: 'off' }
× Import images calls importPaths, then reopens the library and summarises — expected importPaths called with [...]
```
**Vitest GREEN:** 13 passed. That adds 3 tests, including the readable message when `lastLibrary` fails to open.

clippy `--all-targets -D warnings` is clean, `cargo fmt --check` is clean, and `npm run build` passes.

## End-to-end (real app, `npm run tauri dev`, WebView2 over CDP with Playwright)
- **Native dialogs:** `__TAURI_INTERNALS__.invoke` is non-writable and non-configurable, so I couldn't shim it. Instead, Playwright `page.route` answered the IPC custom-protocol request `http://ipc.localhost/plugin%3Adialog%7Copen` with the chosen path(s). Every other IPC call went to Rust unchanged. I added no product hooks.
- **The first attempt** opened a real native folder dialog. I closed it with `WM_CLOSE`.
- **Config dir:** I used the real `%APPDATA%\art.horus.app`, which did not exist beforehand. It was written during the run (`settings.json` recorded `"findSimilar": "off"` and the `lastLibrary` path) and deleted afterwards.
- **First run** in `%TEMP%\Références test`, with the demo checked and "Not now" chosen:
  - the overlay closed and the status bar read **"50 references"**;
  - the Reference view opened on *Divan Japonais* with 3 callouts;
  - the plate loaded through `http://asset.localhost/…R%C3%A9f%C3%A9rences%20test…/thumbs/1024/…jpg` with `naturalWidth` 770, and all 8 related thumbnails loaded;
  - the status bar read "Find similar: off";
  - there were no console errors.
- **Import of 3 images** (`small.jpg`, `p3_red.png`, `rotated.jpg`) gave "Added 3 references" and **53 references**. Importing the same 3 again gave "3 files were already in the library", and the count stayed at 53. `library.json` on disk had 53 references and 128 tags.
- **Moved library:** I renamed the folder and relaunched. First run showed "Horus could not open your last library at …Références test. That folder is not a Horus library. If you moved it, open it from its new place." It showed 2 steps, because Find similar was already answered.
- **Shutdown:** I quit with `WM_CLOSE` on the main window both times, and the dev process exited with code 0. Port 1420 was free afterwards, and the temp library was deleted.

Screenshots in `.superpowers/sdd/2026-11-24-horus-foundation/`:
- `t9-1-firstrun.png`
- `t9-2-choices.png`
- `t9-3-reference.png`
- `t9-4-imported.png`
- `t9-5-moved.png`

## Concerns / notes
- At the default 800×600 window, the status bar is crowded and the "Library: …" source text wraps. I added `nowrap` to the import buttons. The window size belongs to a later layout pass.
- The record header on the reference screenshot shows the path of the callout under the mouse. That is existing hover behaviour.
- A failed `lib.save()` after seeding becomes a warning, and the references stay in memory until the next save.
- `.impeccable/hook.cache.json` was modified by a hook, not by me. It is not committed.

## Layout fixes (coordinator follow-up)
The commit is `fix(ui): window size, short ref id, status path and readout fit`.

1. **Window size.** `tauri.conf.json` now opens at 1280×800, with `minWidth` 960 and `minHeight` 640. The first-run screenshot from the new run was 1280×800.
2. **Reference id.** `#ref-id` shows the first 8 hex characters, and its `title` holds the full 64-character id. Data attributes and logic still use the full id.
3. **Status-bar library path.** The status bar shows `Library: <folder name>`, and the full path (plus any warning) goes in `title`.
   - `.status .source` has `min-width: 0` and `overflow: hidden`, with `text-overflow: ellipsis`.
   - Every other status item is `flex: none; white-space: nowrap`.
4. **Lab readout.**
   - `.lab-meta` is one line with an ellipsis and `max-width: calc(100% - 32px)`.
   - It sits within the 48px below the specimen, so it is never over the plate.
   - The ≤760px rule still places it below the art; `max-width: none` there.
   - I added no new inline `style=`; the diff has 0 of them.

**Tests:** Vitest has 14 passing, including a new test for the folder name and tooltip and the ref id title. Rust has 58 passing. clippy and fmt are clean, and `npm run build` passes.

**E2E** used the same method: CDP with Playwright and the dialog IPC routed. The window was resized with Win32 `SetWindowPos` to an exact client size, at a DPI scale of 1.
- I ran first run with the demo and "Not now": 50 references and no console errors.
- Importing 3 images gave 53; importing them again reported all 3 as already in the library.
- Measured at each size:

| Size | viewport | refId | ref id clear of Back | readout clear of plate | readout one line | status height | status overlaps | horizontal scroll |
|---|---|---|---|---|---|---|---|---|
| 960×640 | 960x640 | `ec32e9c7` (title 64 chars) | true | true | true | 36 | false | false |
| 1280×800 | 1280x800 | `ec32e9c7` | true | true | true | 36 | false | false |

Screenshots: `t9-6-960.png` and `t9-7-1280.png`.

**Cleanup:** I quit with `WM_CLOSE` and the dev process exited 0. I deleted `%APPDATA%\art.horus.app` and the temp library afterwards. Port 1420 is free.
