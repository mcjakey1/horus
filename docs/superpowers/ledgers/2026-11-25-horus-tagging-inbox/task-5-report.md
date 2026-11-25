# Task 5 report: tagging, undo, intake and close commands

**Status:** DONE_WITH_CONCERNS (the concerns are minor; see the last section).
**Commits** on plan2-tagging (parent `cee8fc7`):
- `20a6bed` `feat(app): tag, field, technique, undo/redo, intake and close commands`;
- `c4fcaad` `test(app): pin removed-wins and hidden references in Change; poll saves without reading library.json`;
- `72d7677` `fix(core): a rolled-back or empty import leaves nothing pending; run import hooks outside the gate` (AGY's fixes).

**Tests:** cargo 154 passed plus 1 doctest (baseline 125 plus 1; 29 new). The full lib suite was also run 45 times, 3 binaries at once, with no failure.

## AGY review (#3, conversation `9639ac0d-afd6-4032-905f-456e5be2c893`, `--mode plan`)

**First run: verdict `PASS WITH FIXES`.** Both findings were valid:
1. **"Phantom dirty flag after rolled-back import traps close/switch".**
   - `run_import` always set the library dirty. After a failed save and rollback, the flag stayed set on an otherwise clean library, so close or switch would ask about unsaved changes that don't exist.
   - A duplicate-only import also rewrote `library.json` and rotated the backup for nothing.
2. **"`hooks::after_change` called while holding `import_gate`".**

**Fix, `72d7677`:**
- An import that added nothing skips the save and the step.
- After a failed save, `run_import` rolls back and calls `clear_library()`, unless a library edit was already pending. The new `Debounce::library_dirty()` tells it which.
- The gate is dropped before the hook.
- Regression tests: `failed_import_leaves_nothing_to_save` and `duplicate_only_import_does_not_rewrite`. Both were RED, then GREEN.

**Follow-up in the same conversation: verdict `PASS`.** Quote: "Both findings cleanly fixed in `72d7677`, no regressions".

**Plan 1 behaviour change:** a duplicate-only import no longer saves `library.json`. Plan 1 saved on every import. No test depended on that. Vitest 126/126 (baseline 98; 28 new). `npm run build` passes. `clippy --all-targets -D warnings` and `cargo fmt --check` are clean.

## What was built

### Rust (`app/src-tauri/src/`)

**`commands.rs`**
- `AppState`:
  - gains `saver: Condvar` and `skip_close_flush: AtomicBool`;
  - `open` is now `Mutex<Option<Open>>`, where `Open { lib, tax, index, history, debounce, tax_source }`.
- `ReferenceView::new(root, r) -> Result<_, LibraryError>`.
- `LibraryView.taxonomy_read_only`.
- New types: `Change`, `ImportResult`, `NewTag`, `NewTechnique`, `TagFor`, and `FieldPatch` (which uses the `double_option` helper).
- `CloseDecision { Close, Prevent(String) }`.
- **One recipe, `commit(app, build)`.** `build` makes the `Edit` from `&Open` under the lock. Then `commit`:
  1. runs the single `TaxonomyReadOnly` check (ruling 9);
  2. calls `edit::apply`;
  3. records history, unless the inverse is a no-op (ruling 6);
  4. calls `settle`, which reindexes, calls `debounce.touch` and builds the `Change`;
  5. calls `notify_one`;
  6. calls `hooks::after_change` after the lock is released.
- **One `Change` builder, `change()`:** removed wins over changed (ruling 5), and hidden references never appear (ruling 8). The recipe, undo/redo and imports all share it.
- **Commands:** `add_tags`, `update_tag`, `remove_tag`, `set_field`, `add_technique` (`"NameTaken:<id>"`), `undo`, `redo`, `image_path`, `demo_examples`, `import_paths(paths, note, source_url)`, `import_bytes` (raw body plus the `x-meta` header), `retry_save`, `exit_without_saving`.
- **`undo` / `redo` with nothing to step** return `Ok` with an empty `Change`, not an error.
- **The saver thread, `start_saver(&AppHandle)`:**
  - it holds `open`, re-reads `deadline()` on every wake, and uses `wait` when the deadline is `None` (it never spins);
  - it flushes, then emits `save-status`, `{ok:true}` or `{ok:false, message}`, after dropping the lock.
- **Opening and creating:**
  - `open_library` holds the state lock from the flush to the swap. So reopening the same library reads what the flush wrote, and no edit can land in between.
  - `create_library` flushes before anything is created on disk. `install` flushes again at the swap.
  - On a failed flush, both return `"Couldn't save the current library: <reason>"` and the old library stays open.
  - `lastLibrary` is written after the state lock is released (lock order).
  - `open_library` falls back to `path/Horus Library`, only on `NotALibrary`.
  - `install` uses `load_with_fallback`, with the exact Backup and SeedReadOnly warnings.
- **Copy:** `AlreadyALibrary` now reads "That folder already contains a Horus library. Open it instead." The 3 test strings are updated.
- **Pasted images:**
  - `paste(app, staging, bytes, meta)` stages the bytes in a `tempdir_in(staging)` outside the library. The command passes `std::env::temp_dir()`.
  - `paste_name` keeps the last path component and replaces the forbidden characters with `_`. An empty result, or one that is only dots or spaces (such as `..`), becomes `pasted.png`.
  - `percent_decode` returns `Err` for a malformed escape and for invalid UTF-8.
- **Closing:** `close_decision` is a pure function. `retry_save` destroys the `main` window from Rust on success.

**`hooks.rs`** (new)
- A per-app registry, held in managed state rather than a process-wide static, so parallel test apps never see each other's calls.
- `register(app, Fn(&Change))` and `after_change(app, &change)`.

**`lib.rs`**
- Registers all the commands.
- `setup` adds `demo/images` to the asset scope (not recursive) and calls `start_saver`.
- `on_window_event` handles `CloseRequested` on `main`. On `Prevent`, it calls `prevent_close` and emits `save-failed {message}`. On `Close`, the close goes ahead with no prevention, which is equivalent to prevent-then-destroy.
- `.build().run()` handles `RunEvent::ExitRequested`: it runs a best-effort `close_decision` and logs any failure with `eprintln!`.

**`saver.rs`**
- `flush` now saves `taxonomy.json` before `library.json` (ruling 3).
- If the taxonomy save fails, it restores `(library, true)` and does **not** save the library.
- If the library save fails, it restores `(true, false)`.
- Both error paths are worded through `library_error`, which is now `pub(crate)` (ruling 4).

**`import.rs`**
- `sniff` reads up to 64 bytes and calls `guess_format`. Only Jpeg, Png, WebP, Tiff and Gif pass; anything else is `Skip::Unsupported` before any copy.
- `Skip::InsideLibrary` serialises as `{"kind":"insideLibrary"}`.

**`demo.rs`**
- `read_manifest` is shared by `seed` and `examples`.
- `examples(tax, demo_dir) -> Vec<DemoExample>`:
  - resolves names through `to_tag`;
  - gives one entry per (technique, image);
  - skips unknown names and missing files;
  - builds paths from components, so they use native separators.

**`library.rs`:** `SUBFOLDER` is now `pub`.

**`history.rs`**
- Guard test `undo_restores_tag_with_removed_technique` (ruling 7).
- The stale ponytail note in `record` is replaced: the commands skip no-ops.

### TypeScript (`app/src/`)

**`api.ts`**
- Types: `FieldPatch`, `IntakeMeta`, `ImportResult`, `SaveStatus`, and `Skip | {kind:"insideLibrary"}`.
- Wrappers:
  - `importPaths(paths, meta?)` always sends `note` and `sourceUrl`, as `null` when absent;
  - `importBytes(name, bytes, meta?)` sends the raw body plus the `x-meta` header;
  - `setField`, `imagePath`, `retrySave`, `exitWithoutSaving`;
  - `onSaveStatus` and `onSaveFailed`, through `listen`.

**`importer.ts`** (B4)
- `ImportHooks.onLibrary` is replaced by `onChange(c)`. There is no reopen.
- The notice shows `summaryHTML(result.report)`, which already includes the import's warnings.
- `reason()` switches on `kind`.

**`reference/view.ts`:** passes `onChange: (c) => store.apply(c)`. The Store already exists from Task 7, so the interim merge is just `store.apply`.

**`save-dialog.ts`** (new)
- `mountSaveDialog(root, api)` shows an `alertdialog` with focus on "Try again" and the reason escaped through `esc`.
- A `retrySave` rejection shows the new reason in the same dialog.
- The rest of the window is inert while it is shown.
- It reuses the first-run sheet's classes, so it adds no new CSS and no inline `style=`.

**`firstrun.ts`:** `boot()` mounts the dialog once, and its `destroy` unmounts it.

## TDD evidence
- **saver:** RED, 2 failed: `flush_failure_restores_dirty` (the wording and the `(true,false)` flags) and the new `taxonomy_saves_before_library`. GREEN after the `flush` change.
- **import:** RED, a compile error (no `Skip::InsideLibrary`). GREEN after `sniff` and the variant.
- **commands:** RED, 104 compile errors (none of the commands or types existed). GREEN after the implementation.
  - One failure in my own test (`invalid_tag_is_err_and_no_history`): `with_small` records the import as an undo step, so `undo` removed the reference before the next call. I reordered the test; it still asserts that neither the invalid call nor the empty `add_tags` recorded a step.
- **history guard:** passed at once. It pins existing behaviour (History already uses `apply_inverse`), which is its purpose.
- **vitest:** `save-dialog` was RED (no module). `importer.test` was RED against the HEAD `importer.ts` (2 failures). I ran it by temporarily restoring the HEAD file, because I had edited `importer.ts` first.
  - `api.contract` passed on its first run, because I had added the wrappers before writing the test. It is not a demonstrated RED.

**New Rust tests**
- The brief's list: `add_tags_then_undo_redo`, `update_tag_confirms_suggestion`, `invalid_tag_is_err_and_no_history`, `custom_technique_then_undo_restores_taxonomy`, `set_field_patch_is_one_step`, `import_with_note_and_undo`, `duplicate_only_import_records_no_step`, `import_bytes_roundtrip`, `import_bytes_name_is_contained`, `import_bytes_unicode_name`, `percent_decode_cases`, `after_change_hook_fires` (9 calls), `debounced_save_lands`, `close_flushes_pending`, `close_save_failure_prevents`, `open_clears_history`, `open_falls_back_to_horus_library_subfolder`, `damaged_taxonomy_opens`, `demo_examples_resolve`, `switch_flushes_pending`.
  - `import_twice_is_serialised_and_deduped` is extended: one `import_paths` thread plus one `import_bytes` sent **over IPC** through `get_ipc_response`, with a raw body and the `x-meta` header.
- `failed_background_flush_does_not_spin` (ruling 1): it counts `save-status` events over about 1 s after a blocked save and expects exactly 1 `{ok:false}`, then `deadline() == None`.
- Added in `c4fcaad`:
  - `removed_wins_in_change` (ruling 5);
  - `bad_hash_is_hidden_not_fatal`, extended to cover ruling 8 after an edit and reindex: `related` still excludes the hidden reference, and `set_field` on it returns no references.
- In `saver.rs`: `taxonomy_saves_before_library`. In `history.rs`: `undo_restores_tag_with_removed_technique`.
- In `import.rs`: `inside_library_variant`, `sniff_skips_without_copy` (`fake.psd` plus a minimal BMP), and `sniff_accepts_an_image_shorter_than_the_sniff` (a 1×1 GIF under 64 bytes).

**Vitest:** `api.contract.test.ts` has 20 rows, undo and redo included, plus a completeness check, a check that `importPaths` sends `null` for absent metadata, and the `importBytes` header. `importer.test.ts` and `save-dialog.test.ts` are new.

## Files changed
- **Rust:** `commands.rs`, `demo.rs`, `history.rs`, `import.rs`, `lib.rs`, `library.rs`, `saver.rs`, and the new `hooks.rs`.
- **TypeScript:** `api.ts`, `firstrun.ts`, `firstrun.test.ts`, `importer.ts`, `reference/view.ts`, `reference/view.test.ts`, and the new `api.contract.test.ts`, `importer.test.ts`, `save-dialog.ts` and `save-dialog.test.ts`.
- Not committed: `.impeccable/hook.cache.json` and `.superpowers/`.

## TS shape changes and the Task 9 alignment
No existing TS shape was renamed. Added:
- `importPaths(paths, meta?: IntakeMeta): Promise<ImportResult>`. It sends flat `paths`, `note` and `sourceUrl`, with `null` when absent.
- `importBytes(name, bytes: ArrayBuffer | Uint8Array, meta?: IntakeMeta)`. It sends the raw body and `x-meta: encodeURIComponent(JSON.stringify({ name, ...meta }))`.
- `setField(refIds, patch: FieldPatch): Promise<Change>`. `FieldPatch = { note?: string|null; sourceUrl?: string|null }`: absent keeps, `null` clears, and `""` clears after trimming.
- `Skip` gains `{ kind: "insideLibrary" }`. Errors reject as plain strings.
- `imagePath(refId): Promise<string>`, `retrySave(): Promise<void>`, `exitWithoutSaving(): Promise<void>`.
- `onSaveStatus(cb: (s: {ok, message?}) => void)` and `onSaveFailed(cb: (message: string) => void)`. Both return `Promise<() => void>`.

**These match the coordinator's Task 9 shapes. I found no divergence.** One note: `meta` is optional on `importBytes` too, where the brief writes `importBytes(name, bytes, meta)`. A required-`meta` caller still type-checks.

## Deviations from the brief's text, with reasons
1. **The flush order breaks two `saver` test assertions.** "Keep its tests passing" could not hold literally here:
   - `flush_failure_restores_dirty` now expects `take() == (true, false)`. `taxonomy.json` was saved first, and re-marking it dirty would re-save it and rotate the only pre-edit backup away.
   - Its `contains("library.json")` check is now a `library_error`-wording check (ruling 4).
2. **Imports save through `saver::flush`, not a bare `lib.save()` plus `clear_library()`.** The brief's bare save would write pending tags to `library.json` while a pending custom technique is still unsaved, which breaks ruling 3. So the import calls `debounce.touch(lib)` and then `flush` (taxonomy first, then library). The effect is the same: library dirtiness is cleared on success. On failure the references are rolled back through `apply_inverse` and Plan 1's error text is returned.
3. **`CloseRequested` calls `prevent_close` only on `Prevent`.** On `Close` the window just closes, which is equivalent to the brief's prevent-then-destroy.
4. **The `"Every reopen shows it again"` assertion in the view `notices` test is replaced.** There is no reopen any more (B4), so the test now asserts that `openLibrary` is not called. The summary shows only `report`, including the report's warnings.
5. **`paste_name` also maps dot-only or space-only names to `pasted.png`.** Without that, `..` would survive the brief's character rule.

## Error wording the artist sees (ruling 4)
These are the real strings, printed from the tests with a directory blocking `library.json.tmp`:
- **Close dialog reason:** `Could not read or write the library: Access is denied. (os error 5) at path "C:\Users\...\lib\library.json.tmp"`. The dialog shows it as "Couldn't save your last changes: <that>." The `at path …` suffix comes from tempfile's error context. It names the tmp file once, and "library I/O error" does not appear.
- **Switch refusal:** `Couldn't save the current library: Could not read or write the library: Access is denied. (os error 5) at path "…\library.json.tmp"`.

## Save-failure dialog vs. the lightbox (coordinator note)
`save-dialog.ts` uses `role="alertdialog"` and the `.firstrun` overlay class, which is `position: fixed; z-index: 50`. So it sits above the lightbox (40) and the notices (45), and the lightbox's focus guards exempt it. No change was needed.

## Flake found and fixed (`c4fcaad`)
Under parallel load, `damaged_taxonomy_opens` failed once in 3 runs: "the tag was never saved".
- **Cause:** the test polled by reading `library.json` every 20 ms. On Windows, an open read handle makes the save's rename over `library.json` fail. The failed flush then holds, by design, until the next edit.
- **Fix:** the tests now poll the in-memory `debounce.deadline()` and read the file only after it is `None`.
- **Product consequence:** a sync client or antivirus holding `library.json` open at the moment of a debounced save makes that save fail. The UI gets `save-status {ok:false}`, and the save retries on the next edit or on close, and close asks if it still fails. This is the designed behaviour, but a transient lock costs a retry only when the artist next edits. **Follow-up option:** retry once after a short delay.

## Concerns (minor)
- **Not run with a real window.** These paths were never exercised in a real window: `CloseRequested` → the dialog → `retry_save`'s destroy; `x-meta` over real WebView IPC (only mock IPC was tested); and the demo-images asset scope. They belong to Task 12's end-to-end check.
- **The demo seed saves outside the state lock.** `create_library` writes the not-yet-installed library through `Library::create` and its seed `lib.save()`. That root is new and not shared, so the fixed tmp names can't collide.
- **Saver threads in tests.** Each test app's saver thread stays parked on its Condvar until the test binary exits. That is harmless, but there is one thread per test `env()`.
- **`app.exit(0)` is never called in tests.** `exit_without_saving` is covered only by setting its flag. The test count, 151, confirms that nothing exited the binary early.
- **Windows reserved file names in pastes are not handled.** A pasted name such as `CON.png` is not special-cased (a ponytail choice). The temp-dir staging limits the damage to a failed import.
- **`set_field` and no-op edits still touch the debounce.** A redundant save of identical data can happen (it rotates `library.bak.json` once more). This keeps the recipe in one path.
