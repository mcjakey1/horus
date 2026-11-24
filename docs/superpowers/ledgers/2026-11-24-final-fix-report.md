# Final fix wave report (FIX_BASE f0b90c4)

**Status:** DONE. **Commits:** `982f8a6` fix(final-review): safe library create, visible warnings, panic-safe import. The report and `final-fix-1.png` are not committed, because `.superpowers/` is gitignored.

## 1. Create in a non-empty folder (Important #1)
- **Where:** `Library::create` (library.rs), via a new `new_root(chosen)`. Chosen because it is pure filesystem logic with one caller, it is where the old "already a library" check lived, and the library tests cover it without a Tauri app. `create_library` already used `lib.root` for everything after creation (install, seed, lastLibrary), so the command only gained a doc line.
- **Rules:** a missing or empty folder becomes the library. A folder holding `library.json` or `library.bak.json` gives `AlreadyALibrary`. Any other non-empty folder routes to `<folder>/Horus Library`. That subfolder: library gives `AlreadyALibrary`, missing or empty is used, non-empty gives the new `SubfolderNotEmpty`. Nothing is written before these checks.
- **Messages:** `AlreadyALibrary` is now "That folder already contains a Horus library. Use Open an existing library instead." `SubfolderNotEmpty` is "That folder has other files in it, so Horus would put the library in its "Horus Library" subfolder, but that subfolder already holds other files. Choose an empty folder."
- **taxonomy.json:** copied with `OpenOptions::create_new`, so it is never overwritten, even in a race after the emptiness check.
- **Asset scope:** `install` allows `<root>/images` and `<root>/thumbs` (recursive) instead of `<root>`. The UI builds image URLs only from `thumb256`/`thumb1024` (view.ts `img()`), and both paths are built in Rust under `<root>/thumbs`. Nothing else goes through `assetUrl`.
- **UI:** first run resolves with the `LibraryView` Rust returns, and the view's `S.root` (used by the import reopen) comes from `lib.root`. Rust writes `lastLibrary` from `lib.root`, and the UI never sends `lastLibrary`. The first-run Vitest now locks this in: the returned root differs from the picked folder, the status shows "Library: Horus Library", and `setSettings` is never called with `lastLibrary`.
- **Tests:**
  - library.rs: `create_in_nonempty_folder_uses_subfolder`, `create_never_overwrites_taxonomy_json`, and an extra `create_uses_empty_subfolder_and_refuses_nonempty_one`.
  - commands.rs: `create_refuses_existing_library_with_open_hint` (direct, and via the subfolder), `scope_allows_only_images_and_thumbs`, `import_from_parent_of_subfolder_library_works`.
  - The scope test asserts on files that exist: thumbs and image allowed; `library.json`, `library.bak.json`, `taxonomy.json`, the user's `mine.jpg` and `Photos/small.jpg` refused. Tauri's `is_allowed` canonicalises, so a missing file would be refused trivially.
  - The import test imports sibling `Photos/` (added 1), then the picked parent (its own `mine.jpg` added, `Photos` duplicate, library subfolder not walked, nothing skipped), and checks `lastLibrary` is the subfolder.
  - `errors_are_readable` was updated to the new message.

## 2. Warnings visible (Important #2)
- `mountImport` now returns its `say(html)`. importer.ts exports `warningHTML(w)`, which escapes the text.
- `view.ts load()` shows a non-empty `LibraryView.warning` in `#import-notice` (`role=status`, existing Dismiss button). This covers boot's `openLibrary(lastLibrary)` and the library handed over by first run (create or open).
- After an import, the reopen's warning is rendered together with the summary (`summaryHTML(report) + warningHTML(fresh.warning)`), so the summary no longer hides it.
- `summaryHTML` lists `ImportReport.warnings` as "<file> imported with a warning: <reason>", escaped.
- **Vitest:** `open_warning_is_shown_in_notice` (escaped markup, Dismiss hides it, it reappears next to the summary after an import), a first-run variant of it, and `import_warnings_are_listed`.

## 3. Panic during import (Important #3)
- `panic = "abort"` removed from `[profile.release]`, with a comment in its place. `release_profile_unwinds` (lib.rs) asserts it stays gone, because `cargo test` always unwinds and would pass either way. No `.cargo/config.toml` sets it elsewhere.
- `guarded_import_one` wraps each per-file `import_one` in `catch_unwind(AssertUnwindSafe(..))`. A panic becomes `Skip::Unreadable("the image decoder failed on this file")`, any warnings pushed for that file are trimmed, and the batch continues.
- **Cleanup:** the temp copy (`NamedTempFile`) drops during unwind. A new `Thumbs` drop guard in `store` removes both thumbnail sizes and their `.jpg.tmp` files unless the store succeeds. It replaces the old error-path loop, so the error path and the panic path share one cleanup.
- **Test hook:** `#[cfg(test)]` only. A source whose stem is `panic_in_decoder` panics in `store` after the 256 thumbnail is written. The hook is keyed by file name, not a global flag, so parallel tests are unaffected.
- **Test:** `decoder_panic_is_skipped_and_batch_continues`. The skip reason is exact, the next file still imports, no thumbnail or `.tmp` remains for the panicked hash, and `images/` holds only the good file.

## 4. Small items
- **(a)** `firstrun.test.ts` now uses `"C:\\Références"` and `"D:\\moved"`, plus `"C:\\Références\\Horus Library"` as the returned root.
- **(b)** `firstRun` focuses "Create a new library…" after mounting, since the rest of the window is inert. A Vitest assertion checks `document.activeElement`.
- **(c)** `Library::open` peeks at `version` through `serde_json::Value` before the typed parse. Anything above `VERSION = 1` gives `NewerVersion`, with the message "This library was saved by a newer version of Horus." The check runs before the backup fallback, and the backup gets the same check.
  - **Test:** `open_refuses_newer_version` (commands.rs). A good v1 backup is present and the v2 file uses a shape v1 cannot parse, which proves there is no silent fallback to stale data. Before the fix it opened the backup.
- **(d)** Rollback on a failed save.
  - **Import:** `run_import` truncates the references to their pre-import length and returns the error. The index is rebuilt only after a successful save, so on failure it still matches the rolled-back data.
  - **Seed:** `create_library` now returns the error. The uninstalled `lib`, with its unsaved demo references, drops, which is the in-memory rollback. This reverses the old "a seed problem is only a warning" rule for this one case, and the comment says so. The message reads "The library was created at <root>, but the demo set could not be saved. Open the library to use it without the demo set. …" A retry of Create then gets the "Use Open an existing library instead" hint.
  - **Test:** `import_save_failure_rolls_back_memory`. A directory squats on `library.json.tmp`, the import errors, memory holds no references, and search has no reference hits. With the blocker removed, the same file imports once. The seed rollback has no test, because a save can't be blocked mid-create without a hook.
- **(e)** correlate.rs: "N = references with at least one technique tag (SPEC §4, decided 2026-11-25)." beside `let mut n`. Comment only.

## RED / GREEN evidence
- **Rust RED** (tests plus new error variants, no behaviour): `58 passed; 11 failed`.
  - Failing: `create_refuses_existing_library_with_open_hint`, `errors_are_readable`, `import_from_parent_of_subfolder_library_works`, `import_save_failure_rolls_back_memory`, `scope_allows_only_images_and_thumbs`, `open_refuses_newer_version` (Ok from the backup), `decoder_panic_is_skipped_and_batch_continues` (panic propagated), `create_in_nonempty_folder_uses_subfolder`, `create_never_overwrites_taxonomy_json`, `create_uses_empty_subfolder_and_refuses_nonempty_one`, `release_profile_unwinds`.
- **Rust GREEN:** `69 passed; 0 failed`. `cargo clippy --all-targets -- -D warnings` is clean, and `cargo fmt --check` is clean.
- **Vitest RED:** `4 failed | 13 passed`: first-run focus, both `open_warning_is_shown_in_notice` tests, `import_warnings_are_listed`.
- **Vitest GREEN:** `17 passed`. `npm run build` passes.

## Release smoke (CDP)
**Result: PASS.**

**Build:** `npm run tauri build` exited 0. Sizes after dropping `panic = "abort"`:

| Artefact | Size | Before (Task 10) |
|---|---|---|
| `horus.exe` | 11,134,976 B (10.62 MiB) | 6.12 MiB |
| MSI | 19,963,904 B (19.04 MiB) | 18.03 MiB |
| NSIS | 18,711,505 B (17.84 MiB) | 17.22 MiB |

Unwinding adds about 4.5 MiB to the exe. It is still under the 20 MB target, and both installers are still under 20 MB even with the 15 MB demo set.

**Recipe:** the same as Task 9/10. The release `horus.exe` ran with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`, Playwright `connectOverCDP`, and the dialog IPC (`http://ipc.localhost/plugin%3Adialog%7Copen`) answered with `page.route`. `%APPDATA%\art.horus.app` did not exist beforehand.

**Fixture:** a non-empty picked folder, `%TEMP%\Horus smoke Pictures`, holding `mine.jpg` and `Photos/{rotated.jpg, bad_icc.png}`.

**Results:**
- On open, first run focused "Create a new library…".
- Create with the demo set on and Find similar set to "Not now": 50 references.
- The status shows "Library: Horus Library", and its tooltip is `…\Horus smoke Pictures\Horus Library`.
- On disk, the picked folder holds `["Horus Library", "Photos", "mine.jpg"]`, and `mine.jpg` is unchanged at 1041 B. `settings.json` `lastLibrary` is the subfolder.
- Images load under the narrowed scope: the plate (`…\Horus Library\thumbs\1024\…jpg`) has `naturalWidth` 770, and all 8 callout thumbs loaded.
- **Scope probe**, using `<img>` because `img-src` allows `asset:` while CSP `connect-src` blocks `fetch`. A relaunch reopened the subfolder library (52 references).

  | File | Result |
  |---|---|
  | file in `images/` | loaded (907 px) |
  | file in `thumbs/` | loaded (145 px) |
  | a copy of that same thumbnail placed in the library root | refused |
  | `mine.jpg` in the picked parent | refused |

  My first probe used `fetch`, and the CSP refused all four for that reason, so that run is not scope evidence. I dropped it.
- Importing the sibling `Photos` folder took the count to 52. The notice read: "Added 2 references / bad_icc.png imported with a warning: ICC profile could not be parsed; colours left unconverted". This shows item 2 in the real app.
- **Screenshot:** `final-fix-1.png`, taken right after the import. The plate is dimmed because it was mid-repaint, from the reopen's `is-leaving` transition.
- **Console:** no errors during the real flow. The only console errors came from my own `fetch` probe being refused by the CSP.

**Cleanup:**
- The app was closed with `CloseMainWindow`, and no `horus` process remains.
- `%APPDATA%\art.horus.app` and `%TEMP%\Horus smoke Pictures` were deleted.
- `%LOCALAPPDATA%\art.horus.app\EBWebView` existed before Task 9, so I left it.

## Concerns
- **Open-hint gap:**
  - When Create picks a folder whose "Horus Library" subfolder is already a library, it says "Use Open an existing library instead."
  - Open on that same picked folder answers "That folder is not a Horus library.", because `Library::open` checks only the folder itself.
  - Small fix if wanted: `open` falls back to `<folder>/Horus Library`. Not done, since it is outside the brief; for the controller to rule.
- Re-verified on HEAD `982f8a6`: Rust 69 passed, clippy and fmt clean, Vitest 17 passed.
- The seed save failure now returns an error instead of a warning, per the brief. It has no automated test.
- The release exe grew by about 4.5 MiB because of unwinding.
- `.impeccable/hook.cache.json` is still dirty from a hook. It is not mine and is not committed.
