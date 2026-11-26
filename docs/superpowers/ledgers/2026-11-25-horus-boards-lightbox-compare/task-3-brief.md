### Task 3: Commands, the lightbox source and store support

**Files:**
- Modify:
  - `app/src-tauri/src/import.rs`, to expose the shared decode and thumbnail helpers (`CROSS-PLAN-AUDIT.md` #5);
  - `app/src-tauri/src/commands.rs` (the post-T0 file), including `AppState::new` [R9];
  - `app/src-tauri/src/lib.rs`, to register the new commands and pass the cache dir;
  - `app/src/api.ts`;
  - `app/src/store.ts` (Plan 2 Task 7);
  - `app/src/data.ts` (`storeSource`'s `inScope` line) [R8];
  - the test fakes listed in Step 3 [R6].
- Test:
  - `import::tests` and `commands::tests`;
  - `app/src/store.test.ts`, `app/src/data.test.ts` and `app/src/api.contract.test.ts`.

**Interfaces:**
- Consumes Tasks 1 and 2, Plan 2 Task 5's mutating-command recipe, and Plan 1 `correlate::Index::score`.
- **Shared import helpers, refactored out of Plan 1's private `import::store`** (audit #5).
  - The real `store` (`import.rs:208`) [C2] already does all of these steps, in this order:
    1. sniff the format with `with_guessed_format`;
    2. read the ICC profile, with a warning on error;
    3. read the EXIF orientation, with a warning on error, and `apply_orientation`;
    4. `into_rgba8`;
    5. `to_srgb`, with a warning on failure;
    6. `on_white`, for JPEG thumbnails;
    7. `fit`, `imageops::thumbnail` and `write_thumb` for each size.
  - Expose it without changing its behaviour:
    ```rust
    pub struct Decoded { pub rgba: RgbaImage, pub width: u32, pub height: u32, pub format: image::ImageFormat, pub warnings: Vec<String> }   // format: store() names images/<hash>.<ext> from it
    pub fn decode_srgb_from<R: BufRead + Seek>(r: R) -> Result<Decoded, Skip>;   // steps 1–5; keeps alpha
    pub fn decode_srgb(path: &Path) -> Result<Decoded, Skip>;                    // MAX_BYTES guard (Skip::TooLarge, no read), then decode_srgb_from
    pub fn on_white(rgba: &RgbaImage) -> RgbImage;                               // now pub; unchanged
    pub fn write_thumbs(root: &Path, hash: &str, rgb: &RgbImage) -> io::Result<()>;   // step 7 for every THUMB_SIZES entry; removes both on failure
    ```
  - `store` calls `decode_srgb_from` on its temp file and then `write_thumbs`, keeping hash-on-write and the `sync_all`-then-persist order.
  - **The panic hook and the drop guard stay** [R11]. The test-only `PANIC_STEM` injection (`import.rs:263-266`) reads `src`, which `write_thumbs` doesn't have. `write_thumbs` keeps a test-only panic hook between the two sizes, keyed on `hash` (for example a `#[cfg(test)]` static the test sets). `store` keeps its `Thumbs` drop guard (`import.rs:247-280`) around `write_thumbs`, `sync_all` and `persist`. The `PANIC_STEM` test may change only in how it arms the hook.
  - **The lightbox keeps alpha:** `lightbox_source` encodes `Decoded.rgba` as a PNG, and does not call `on_white`.
  - Plan 5's `similar_by_file` and Plan 6's integrity thumbnail rebuild call `on_white(&decode_srgb(path)?.rgba)`.
- Produces these commands, each returning `Result<_, String>`, with camelCase JSON. Errors from `edit::apply` reach the UI as the wire codes from Task 1, through `commit()` (`e.to_string()`) [R2]:
  ```
  add_link(from_ref: String, to_ref: String, why: String) -> Change    // Change.created = link id; Err "DuplicateLink:<id>"
  update_link(link_id: String, why: String) -> Change
  remove_link(link_id: String) -> Change
  create_board(name: String, reference_ids: Vec<String>) -> Change      // Change.created = board id; Err "BoardNameTaken:<id>"
  rename_board(board_id: String, name: String) -> Change
  set_board_members(board_id: String, reference_ids: Vec<String>) -> Change   // add, remove and reorder are all one call
  delete_board(board_id: String) -> Change
  export_board(board_id: String, dest: String) -> ExportReport          // #[tauri::command(async)]; clones under the lock, copies off it
  score_pair(a: String, b: String) -> Scored                            // Index::score, no MIN_SCORE cut; both ids must be visible()
  lightbox_source(ref_id: String) -> LightboxSource                     // #[tauri::command(async)]; resolves under the lock, decodes off it
  ```
  - `export_board` and `lightbox_source` use the `#[tauri::command(async)]` idiom, as `graph_edges` does (`commands.rs:562-570` before T0), not a hand-written `spawn_blocking` [C12, R4, R10].
  - `score_pair` reads through `visible()` (`commands.rs:363-371`), as `related` does at `:555`, so a hidden reference gets no score [C11, P11].
  ```rust
  pub struct LightboxSource { pub path: String, pub full: bool, pub width: u32, pub height: u32 }
  pub const LIGHTBOX_MAX_SIDE: u32 = 8192;
  ```
- `lightbox_source` behaves like this:
  - If the original's extension is `jpg`, `jpeg`, `png`, `webp` or `gif`, and its longest side is no more than `LIGHTBOX_MAX_SIDE`, it returns the original path with `full: true`.
  - Otherwise it decodes the original once into `<cache_dir>/lightbox/<hash>.png`. That is outside the library, so the Plan 1 folder layout is unchanged.
    - The decode is `import::decode_srgb`: orientation, ICC→sRGB with a warning fallback, and alpha kept. If the result is larger than `LIGHTBOX_MAX_SIDE`, it is downscaled with `imageops::resize` (Lanczos3).
    - The PNG is written through a temp file and then renamed, so a crash never leaves a half-written cache file.
    - The preview's longest side is at most `LIGHTBOX_MAX_SIDE`, and the result has `full: false`.
  - On a cache hit, it reuses the PNG.
  - If it returns `Err`, the lightbox (Task 6) keeps `thumb1024` and shows the preview note, so the pane is never blank (Review Focus 3) [R10].
  - **The cache dir is injected** [R9]. `AppState::new` takes a `cache_dir: PathBuf`, as it takes `config_dir`. `lib.rs` passes `app_cache_dir()`, and `commands::tests::env()` passes a tempdir, so no test writes to the real user cache. One `pub fn allow_lightbox_cache(app)` adds `<cache_dir>/lightbox` to the asset scope with `allow_directory(…, true)`. It is called from `setup` and from `env()`, so the scope test runs on the mock app.
  - Task 6 swaps the lightbox's `imagePath` call for `lightboxSource`, because `lightbox/view.ts` is Task 6's file. Plan 2's `image_path` command stays [C9].
- Plan 1's `LibraryView` gains `boards: Vec<Board>`.
- `Store` (Plan 2 Task 7) already has `links: Link[]` (`store.ts:14`). It gains:
  ```ts
  boards: Board[]; scope: string | null;                        // scope = board id
  setScope(boardId: string | null): void;                       // notifies subscribers
  inScope(refId: string): boolean;                              // true when scope is null; Plan 3 views read this
  linksFor(refId: string): Link[];                              // links touching refId, newest first
  ```
- **Store events** [R7]:
  - `StoreEvent = Change & { reset?: true; scope?: true; scopeCleared?: true }`.
  - `setScope` emits `{ references: [], removed: [], created: null, canUndo, canRedo, scope: true }`.
  - `apply(change)` replaces `links` or `boards` when present. If the scoped board is no longer in `boards`, it sets `scope = null` and emits the change with `scopeCleared: true`, which the status line reads (Review Focus 5).
  - `reset()` (`store.ts:56-59`) sets `scope = null`, so switching libraries never keeps a stale board id.
- **`storeSource`** [R8]: `data.ts:35` becomes `inScope: (id) => store.inScope(id)`, so Plan 3's graph views see the scope. The `everything` constant goes if nothing else uses it.

- [ ] **Step 1: Write the failing tests**
  - Rust, in `import::tests`, for the refactor. Every existing `import::` test still passes; only the `PANIC_STEM` test may change how it arms the hook [C28, R11].
    - `write_thumbs_matches_import`: decoding `small.jpg` with `decode_srgb`, then `write_thumbs(tmp, hash, &on_white(&d.rgba))`, gives thumbnails byte-identical to those `import_paths` writes for the same file.
    - `decode_srgb_too_large_unread`: a sparse file larger than `MAX_BYTES` returns `Skip::TooLarge` without being read.
    - `decode_keeps_alpha`: a PNG with a transparent pixel keeps `a == 0` in `Decoded.rgba`.
  - Rust, using `mock_builder`:
    - `add_link_reverse_pair_refused` (Decision 2): `add_link(A, B, "x")` followed by `add_link(B, A, "y")` returns `Err("DuplicateLink:<id of A→B>")`, and `links` still holds one link.
    - `link_crud_and_undo`: run `add_link`, then `update_link`, then `remove_link`. Three `undo` calls give back the original `links`, and each `Change` carries `links: Some`.
    - `board_crud_and_undo`, covering create, reorder through `set_board_members`, rename and delete. Each undo restores the previous board exactly.
    - `score_pair_matches_related`: for a pair that `related` returns, `score_pair` gives the same `score` within 1e-9. A pair below `MIN_SCORE` still returns its score. A hidden reference is refused.
    - `export_board_command`: exports a 2-member board to a tempdir and returns a report with 2 `written` and `credits: Some`.
    - `lightbox_source_full_for_jpeg`: `small.jpg` gives `full: true` and the original path.
    - `lightbox_source_preview_for_tiff`: a 64×48 TIFF, generated in the test with `image`'s TIFF encoder (the `tiff` feature is on; there is no TIFF fixture) [C10], gives `full: false`. The PNG exists under the tempdir cache, and no temp file remains. A second call returns the same path without re-decoding; compare the mtime.
    - `lightbox_cache_in_asset_scope`: after `env()`, the mock app's asset scope allows a path under `<cache_dir>/lightbox/` [R9].
  - Store:
    - `inScope` is true for every reference when `scope` is null, and only for members when it is set.
    - `setScope` notifies with `scope: true`.
    - Applying a `Change` whose `boards` lacks the scoped board sets `scope` to null and notifies with `scopeCleared: true`.
    - `reset()` clears `scope`.
    - `linksFor` returns the links in both directions.
  - `data.test.ts`: rewrite `:63-64` (inScope always true) as `store_inscope_signature`. `storeSource(store).get().inScope` agrees with `store.inScope` for the null scope, and for a member and a non-member of a set scope [R8, C18].

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test import::`, `cargo test commands::`, `npm test -- store` and `npm test -- data`. All should FAIL, then PASS.

- [ ] **Step 3: Extend `api.ts` and every fake** [R6]:
  - Add `Board`, `ExportReport` (`skipped: [string, string][]`, `credits: string | null`) [C14] and `LightboxSource`, plus one wrapper per command. Add `boards: Board[]` to `LibraryView`.
  - Add `boards: []` to the `LibraryView` fakes in all 12 files that have them:
    - `data.test.ts`, `firstrun.test.ts`, `graph/fixtures.test-util.ts`;
    - `inbox/view.test.ts`, `intake.test.ts`, `library-menu.test.ts`;
    - `lightbox/view.test.ts`, `reference/view.test.ts`, `store.test.ts`;
    - `tagging/picker.test.ts`, `views/galaxy.test.ts`, `views/inspector-edit.test.ts`.
  - Add the 10 new methods to the two fully typed `Api` fakes, `firstrun.test.ts:19` and `reference/view.test.ts:68`. `tsconfig.json` includes the tests, so `tsc` fails otherwise.
  - Add one `api.contract.test.ts` row per new command (audit #1; the test at `:80` checks that every IPC wrapper is covered), with these argument keys:
    - `add_link`: `fromRef`, `toRef`, `why`;
    - `update_link`: `linkId`, `why`;
    - `remove_link`: `linkId`;
    - `create_board`: `name`, `referenceIds`;
    - `rename_board`: `boardId`, `name`;
    - `set_board_members`: `boardId`, `referenceIds`;
    - `delete_board`: `boardId`;
    - `export_board`: `boardId`, `dest`;
    - `score_pair`: `a`, `b`;
    - `lightbox_source`: `refId`.
  - Gate: `npm run build` (which runs `tsc`) and the full `npm test`.

- [ ] **Step 4: Commit.** Commit message: `feat(app): link, board, export, pair-score and lightbox-source commands`.

---

