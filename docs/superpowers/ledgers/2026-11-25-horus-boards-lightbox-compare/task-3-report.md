# Task 3 report: commands, the lightbox source and store support

**Status:** DONE. One commit, `cc44550` (`feat(app): link, board, export, pair-score and lightbox-source commands`), on `plan4-boards`, on top of `98e1333`. Nothing is pushed or merged.

## Rust

### `import.rs`: shared helpers (audit #5)

- **New helpers:**
  - `Decoded { rgba, width, height, format, warnings }`.
  - `decode_srgb_from<R: BufRead + Seek>` runs the steps of the old `store`, in the same order: sniff, ICC, EXIF orientation, `into_rgba8`, then `to_srgb`. It keeps alpha.
  - `decode_srgb(path)` checks `MAX_BYTES` from the file's metadata before it opens the file.
  - `on_white` is now `pub`.
  - `write_thumbs(root, hash, rgb)` writes both sizes. It has its own `Thumbs` guard, so a failure removes both.
  - `fit` is now `pub(crate)`, for the lightbox downscale.
- **`store`:**
  - It calls `decode_srgb_from` on its temp file, then `write_thumbs`.
  - It keeps hash-on-write and the `sync_all`-then-`persist` order.
  - It keeps its `Thumbs` guard around `write_thumbs`, `sync_all` and `persist`.
  - It writes the warnings into the report with the source path, in the same order as before.
- **Panic hook [R11]:** the test-only hook is now in `write_thumbs`, between the two sizes. It is keyed on the hash through a `#[cfg(test)]` `thread_local` called `PANIC_HASH`. A `thread_local` means a parallel test can never trip it. The `PANIC_STEM` test changed only in how it arms the hook: it sets `PANIC_HASH` to the hash it already computes, and clears it after.
- **One behaviour difference:** if the ICC or EXIF read gave a warning and then the decode itself failed, the old `store` reported the warning and the skip. Now only the skip is reported, because `Decoded.warnings` exists only on success. A file that imports, or that fails before or without a warning, reports exactly as before.

### `commands.rs`

- **Link and board commands:**
  - `add_link`, `update_link`, `remove_link`, `create_board`, `rename_board`, `set_board_members` and `delete_board`.
  - All go through `commit`, so each is one undo step, and their errors are Task 1's wire codes.
  - An unknown id gives `UnknownLink:<id>` or `UnknownBoard:<id>`, through the `EditError` `Display`.
  - `add_link` and `create_board` set `Change.created`, with ids from `new_id("link")` and `new_id("board")`.
- **Carry-in (e):** every `Replace*` the commands build copies the id and the pair from the stored item and changes only `why`, `name` or `reference_ids`. So the `InvalidTag` that an identity-changing `Replace*` gives can't happen through any command.
- **`export_board`** uses `#[tauri::command(async)]`.
  - Under the lock, it clones the board and only its visible members. A hidden member therefore appears as "It is no longer in the library." in `skipped`.
  - It calls `export::export_board` off the lock, with `absolute(dest)`.
  - Carry-in (f): refusals and skipped reasons pass through unchanged, OS text included.
- **`score_pair`** reads through `visible()` and calls `Index::score`, with no `MIN_SCORE` cut. A hidden or unknown id gives `unknown reference: <id>`. That is the existing `UnknownReference` display, the same text `image_path` gives.
- **`lightbox_source`** uses `#[tauri::command(async)]`. It looks up the reference through `visible()`, so a hand-edited hash can't name a file in the cache, and it resolves the path with `lib.image_path(r)`.
  - **Full original:** if the extension is jpg, jpeg, png, webp or gif, and the longest stored side is at most `LIGHTBOX_MAX_SIDE` (8192), it returns `{ path: original, full: true, width, height }`.
  - **Preview:** otherwise it runs `import::decode_srgb`, then a Lanczos3 `resize` if the image is larger than 8192. It writes a PNG through a temp file in `<cache_dir>/lightbox/` and renames it to `<hash>.png`, then returns `full: false` with the PNG's size. A cache hit reuses the file.
  - **Errors** are strings. A decode `Skip` is shown in its Debug form, for example `Unsupported("…")`. Task 6 falls back to `thumb1024` on any `Err`.
- **Cache dir [R9]:** `AppState::new(config_dir, cache_dir, seed_taxonomy, demo_dir)`. `lib.rs` passes `app_cache_dir()`, and `env()` passes `<tempdir>/cache`. `pub fn allow_lightbox_cache(app)` calls `allow_directory(<cache_dir>/lightbox, true)`, from `setup` and from `env()`.
- **`LibraryView`** gains `boards`.
- **`lib.rs`** registers the 10 commands.

## TypeScript

- **`api.ts`:**
  - New types `Board`, `ExportReport` (`credits: string | null`, `skipped: [string, string][]`) and `LightboxSource`.
  - `LibraryView` gains `boards: Board[]`.
  - Carry-in (b): `Change` gains `links?: Link[] | null` and `boards?: Board[] | null`.
  - 10 new `Api` members and wrappers, with the camelCase keys from the brief.
- **`store.ts`:**
  - `StoreEvent` gains `scope?: true` and `scopeCleared?: true`.
  - The store gains `boards`, `scope`, `setScope` (emits `{ references: [], removed: [], created: null, canUndo, canRedo, scope: true }`), `inScope` and `linksFor` (both directions, newest first).
  - Carry-in (a): `apply` replaces `links` and `boards` when the `Change` carries them. If the scoped board is gone, it sets `scope = null` and emits `{ ...change, scopeCleared: true }`.
  - `reset` and the first load set `scope = null`.
- **`data.ts`:** `inScope: (id) => store.inScope(id)`, and the `everything` constant is gone.
- **Carry-in (c):** `lightbox/view.ts:211` and `reference/view.ts` `touchesFocus` now also fire on `c.links`.
- **Carry-in (d):** no UI reads links or boards yet. `inScope` returns false for an id that is not on the scoped board, and `linksFor` only filters, so an unknown id is never shown. The views that draw links (Tasks 6 and later) must skip ids that are not in `store.refs`.
- **Fakes [R6]:**
  - `boards: []` added to every `LibraryView` literal that `tsc` flagged: 17 literals in 9 test files (`data`, `firstrun`, `inbox/view`, `intake`, `library-menu`, `lightbox/view`, `reference/view`, `store`, `tagging/picker`).
  - The brief's list also named `graph/fixtures.test-util.ts`, `views/galaxy.test.ts` and `views/inspector-edit.test.ts`. Their literals are `Snapshot`s, not `LibraryView`s, so they need no `boards`.
  - The 10 new methods are added as `vi.fn()` to the two fully typed `Api` fakes, in `firstrun.test.ts` and `reference/view.test.ts`.
- **`api.contract.test.ts`:** 10 rows, with the brief's keys. The "covers every IPC wrapper" test passes.

## Tests

- **Rust, 11 new:**
  - `import::tests`: `write_thumbs_matches_import` (byte-identical), `decode_srgb_too_large_unread` (sparse, non-image file) and `decode_keeps_alpha`.
  - `commands::tests`: `add_link_reverse_pair_refused`, `link_crud_and_undo`, `board_crud_and_undo` and `score_pair_matches_related`. The last checks a related pair within 1e-9, an untagged pair returning 0 although `related` leaves it out, and a hidden bad-hash reference being refused.
  - `commands::tests` also: `export_board_command` (2 written, `credits: Some`), `lightbox_source_full_for_jpeg`, `lightbox_source_preview_for_tiff` (a 64×48 TIFF imported in the test; PNG in the cache, no temp file, the same result on a second call, mtime unchanged) and `lightbox_cache_in_asset_scope`. The last also checks that the cache root outside `lightbox/` is not allowed.
- **TypeScript:**
  - `store.test.ts`: 6 new tests for `inScope`, `setScope`, links and boards replaced or kept, `scopeCleared`, `reset` and `linksFor`.
  - `data.test.ts`: `store_inscope_signature` replaces the old "always true" lines.
  - 10 contract rows.
  - `reference/view.test.ts`: `link_only_change_refreshes`.
  - `lightbox/view.test.ts`: `store_change_rerenders_and_removal_closes` gains a link-only step.
- **Red first:**
  - Store and data: with the new tests in and before `store.ts` and `data.ts` changed, 7 tests failed. All passed after the change.
  - Carry-in (c): I took out `|| c.links` and both tests failed, then I put it back.
  - The Rust tests were written together with the code, and I did not run them against the old code.

## Checks

| Check | Result |
|---|---|
| `cargo test` | **259** passed (248 + 11), 2 ignored; plus 0 and 1 |
| `cargo clippy --all-targets -- -D warnings` | clean |
| `cargo fmt --check` | clean |
| `tsc --noEmit` | clean |
| vitest | **479** passed, 38 files (461 + 10 contract rows + 6 store + 1 data + 1 reference) |
| `npm run build` | exit 0 |

## Notes for later tasks

- Task 6 swaps `imagePath` for `lightboxSource` in `lightbox/view.ts`. It should fall back to `thumb1024` on any `Err`.
- The lightbox cache is never pruned. One PNG is written per non-web or oversized original, and a deleted reference leaves its PNG behind. Plan 6's integrity pass could sweep it.
- Every `Change` from Rust now carries `links` and `boards`, as `null` when not touched. `store.apply` treats `null` and absent the same way.

## Fix round 1 (review I1), tests only

**Commit:** `d70e050` (`test(core): lightbox preview for an over-8192 px original is downscaled and loadable`).

**New test:** `commands::tests::lightbox_source_downscales_oversized_png`.
1. It asserts that `<cache_dir>/lightbox/` does not exist yet. The scope grant from `env()` comes before the folder, as on a first run.
2. It imports a 9000×2 PNG, then calls `lightbox_source`.
3. It asserts:
   - `full: false`;
   - `(width, height) == (8192, 2)`, which covers `fit` and the size read back;
   - the PNG is under `<cache_dir>/lightbox/`, and `image_dimensions` on it gives 8192×2, which covers the Lanczos3 `resize`;
   - `asset_protocol_scope().is_allowed(&png)` is **true** on that real file.

**Grant:** `is_allowed` is true for a preview whose folder was made after the grant, so the grant needs no change. No code changed in this round.

**Checks:**
- `cargo test`: 260 passed (259 + 1), 2 ignored.
- `clippy --all-targets -D warnings` and `fmt --check` are clean.
