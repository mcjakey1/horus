# Horus Boards, Lightbox, Compare and Links (Plan 4 of 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An artist can narrow a library into named Boards, show only one board, and export it to a folder. They can study a reference at full resolution with zoom, the value toggle and region overlays. They can compare two references side by side, and draw their own links with a "why" note. Every change can be undone.

**Architecture:**
- **Rust core:**
  - Links and boards become new `edit::Edit` variants, so they reuse Plan 2's validation, inverse and `History`.
  - A new `export` module copies a board's originals to a folder without overwriting anything.
  - Three thin commands are added:
    - `score_pair`, which reuses `correlate::Index::score`;
    - `lightbox_source`, which serves the original, or a PNG preview for formats the WebView can't show;
    - `export_board`.
- **TypeScript UI:**
  - Plan 2's `Store` gains links, boards and a board scope.
  - The Links tab, the Boards view and Compare are new DOM modules.
  - The Plan 2 lightbox gains zoom, pan and hover overlays in place.
  - The graph views (Tree, Galaxy, Radial) belong to Plan 3. This plan only exposes `store.inScope(id)` for them to read.

**Tech Stack:** the same stack as Plans 1 and 2, with no new crates or npm packages. `tauri-plugin-dialog`, from Plan 1 Task 9, provides the export folder picker.

**Spec:** `SPEC.md` (draft 5), mainly:
- §2: Brief and Study;
- §4: "Links drawn by the artist. Always shown, and listed first. They are not mixed into the score.";
- §5: the Compare, Boards and Lightbox rows, and the note on region tags;
- §9: originals are decoded only in the lightbox, and are never moved or modified;
- §11: the anti-goal that the app becomes a mood board.

**Builds on:**
- **Plan 1** (`.worktrees/horus-foundation/docs/superpowers/plans/2026-11-24-horus-foundation.md`, as amended):
  - `model::{Link, Board, LibraryData}`, with `Link { id, from_ref, to_ref, why }` and `Board { id, name, reference_ids }`;
  - `Library::image_path`;
  - `correlate::Index::score(&self, a, b) -> Scored`;
  - the `LibraryView` and `ReferenceView` types from Task 7 (Plan 2 calls the latter `RefView`; the real Rust name is `ReferenceView`, `commands.rs:41`);
  - `tileBox` from Task 8, and the Reference view's Links tab and `v` value toggle.
- **Plan 2** (`docs/superpowers/plans/2026-11-25-horus-tagging-inbox.md`, which is under review; this plan only consumes it):
  - `edit::{Edit, apply, Applied, Touched, EditError, new_id}` (Task 1);
  - `History` (Task 2);
  - the debounced saver (Task 4);
  - the state struct `Open { lib, tax, index, history, debounce }`, the mutating-command recipe and `Change` (Task 5);
  - `Store` and `wireUndoKeys` (Task 7);
  - `normRect`, `MIN_REGION`, `openLightbox(api, store, refId)` and `api.imagePath` (Task 10);
  - `matchesFilter` (Task 11).

## Global Constraints

- **Links drawn by the artist** are always shown and listed first, and are never part of any score: the Related list, Compare or Plan 3's Galaxy (SPEC §4).
- Every link has a non-empty "why" note (SPEC §1, §3 `Link.why`).
- **Undo covers everything** (SPEC §6.8). Creating, editing or deleting a link, and creating, renaming, re-membering or deleting a board, each goes through `edit::apply` and is one undo step. Exporting writes outside the library, so it is not undoable.
- **Export** copies originals from `images/` into the chosen folder as plain image files, for PureRef, Photoshop and Figma. It never moves or modifies an original, never overwrites a file, and never writes `.pur` (SPEC §11).
- The always-on-top board window is v1.1, so it is out of scope (SPEC §11).
- **The lightbox** shows full resolution, with zoom, the value toggle and region overlays. Originals are decoded only there (SPEC §9).
- **Compare** opens on Shift-click of a second reference. Shared techniques sit in the middle, and the techniques unique to each reference sit on its side. Images are large, with the value toggle (SPEC §5).
- **Region thumbnails** use Plan 1's letterboxed plate with the region outlined. This is ruling a1, a recorded spec delta from SPEC §5's "cropped".
- The scope "Show only this board" is view state. It is not saved and not undoable.
- **In-page drags use pointer events, never the HTML5 drag-and-drop API.** `dragDropEnabled` stays at its default of `true`, because Plan 2's file intake needs native drops, and on Windows that setting stops WebView2 from firing `dragstart`, `dragover` and `drop` (`CROSS-PLAN-AUDIT.md` #2). This covers the link handle (Task 4) and board tile reordering (Task 5).
- **Operation colour and labels come from Plan 3's `opInk` and Plan 2's `opLabel`** (`app/src/ops.ts`; Plan 3 cross-plan impact item 5). Operations are editable data (1 to 9 of them), so no fixed four-ink map and no `var(--diff)`-style token appears in this plan's code. An unknown operation draws in the neutral ink.
- **One link per unordered pair** (Decision 2). A→B and B→A are the same pair; a second reason goes into the existing note.
- **Export also writes `credits.txt`** (Decision 1), as plain UTF-8 without a BOM.
- UI tokens, type and copy follow `prototype/styles.css`, `DESIGN.md` and the Plan 1 Task 8 port. No new colours.

## Review Focus

1. **Exporting into a folder that already holds files with the same names**, or exporting titles with characters Windows forbids (`: ? * " < > |`), reserved names (`CON`, `NUL`), trailing dots, or two references with the same title. No file is ever overwritten, every name is valid on Windows, macOS and Linux, and collisions get a ` (2)` suffix. Tested in Task 2.
2. **An original is missing from `images/`, or the destination becomes unwritable part-way.** That item is skipped with a stated reason, the rest of the export continues, and no partial `.tmp` file is left behind. Tested in Task 2.
3. **The lightbox opens a TIFF, or an image of 20,000 px or more**, which the WebView can't decode or would struggle with. A PNG preview is shown with the note "Showing a preview — this format can't be shown at full size here.", never a blank pane. Tested in Tasks 3 and 6.
4. **Linking a reference to itself, adding a second link for the same pair, or saving an empty "why".** Each is refused with a message, and the editor keeps the text that was typed. Tested in Tasks 1 and 4.
5. **"Show only this board" is on, and the board is deleted, or the focused reference isn't on it.** Deleting the board clears the scope, and the status line says so. A focused reference outside the board stays focused and is marked "Not on this board". Tested in Task 5.

---

### Task 1: Link and board edits

**Files:**
- Modify:
  - `app/src-tauri/src/edit.rs` (Plan 2 Task 1);
  - `app/src-tauri/src/commands.rs`: only the `Change` struct and the code that builds it.

**Interfaces:**
- Consumes `edit::{Edit, apply, Applied, Touched, EditError, new_id}` (Plan 2 Task 1).
- Produces these new `Edit` variants:
  ```rust
  AddLink { link: Link },
  RemoveLink { index: usize, link: Link },
  ReplaceLink { before: Link, after: Link },            // same id; only `why` may differ
  AddBoard { board: Board },
  RemoveBoard { index: usize, board: Board },
  ReplaceBoard { before: Board, after: Board },         // same id; rename and/or new reference_ids order
  ```
- It also adds these `EditError` variants: `SelfLink`, `DuplicateLink(String /* existing id */)`, `EmptyWhy`, `EmptyName`, `BoardNameTaken(String)`, `UnknownLink(String)` and `UnknownBoard(String)`.
- `Touched` gains `links: bool` and `boards: bool`.
- `Change` (Plan 2 Task 5) gains `links: Option<Vec<Link>>` and `boards: Option<Vec<Board>>`, each the full list and set only when touched. Both lists stay small, so the full list is cheaper to reason about than a delta.
- Validation rules:
  - A link needs `from_ref != to_ref`, and both references must exist.
  - `why.trim()` must not be empty; it is stored trimmed.
  - Only one link may exist per unordered pair. A second gives `DuplicateLink`, so the artist edits the existing link instead.
  - A board name is trimmed, non-empty and unique without regard to case.
  - A board's `reference_ids` must exist and be unique; order is kept.
- A new guard on `RemoveReferences`: it fails with `InUse` while a link or a board touches one of the references. Linear history makes this unreachable, but the guard keeps a bug from leaving dangling links.

- [ ] **Step 1: Write the failing tests** in `edit::tests`:
  - `link_add_inverse_restores` and `board_add_inverse_restores`: applying the edit and then its inverse gives `data` equal to the snapshot, with `touched.links` (or `boards`) set.
  - `self_link_refused`, `empty_why_refused` (a `why` of `"   "`) and `link_unknown_ref_refused`.
  - `duplicate_pair_refused_either_direction` (Decision 2): with A→B present, both A→B and B→A return `DuplicateLink(<id of A→B>)`. After `RemoveLink` of A→B, B→A is accepted. A `Batch` that adds A→B and B→A together fails, and rolls back to no links.
  - `replace_link_changes_why_only`: changing `to_ref` in `after` returns `Err`.
  - `board_name_unique_case_insensitive`: with "Harbour" present, " harbour " returns `BoardNameTaken`.
  - `board_members_must_exist_and_be_unique`.
  - `unknown_board_refused`: `ReplaceBoard` or `RemoveBoard` for a missing id returns `UnknownBoard(id)`.
  - `board_reorder_is_one_edit`: a `ReplaceBoard` that reverses `[a, b, c]` and then its inverse gives back `[a, b, c]`.
  - `remove_refs_in_use_guarded`: a reference that is on a board can't be removed by `RemoveReferences`.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test edit::`. It should FAIL, then PASS, and Plan 2's edit tests must still pass.

- [ ] **Step 3: Commit.** Commit message: `feat(core): invertible link and board edits`.

---

### Task 2: The `export` module (a board to a folder)

**Files:**
- Create: `app/src-tauri/src/export.rs`.

**Interfaces:**
- Consumes `Library::image_path` (Plan 2 Task 4, which returns a `Result`) and `model::{Board, Reference}`.
- Produces:
  ```rust
  pub struct ExportReport { pub written: Vec<String /* file name */>, pub skipped: Vec<(String /* ref id */, String /* reason */)> }
  pub fn export_board(lib: &Library, board: &Board, dest: &Path) -> Result<ExportReport, String>;
  pub fn safe_name(stem: &str, ext: &str, taken: &HashSet<String>) -> String;   // pure; `taken` holds lowercased full names
  pub fn credits_text(board: &Board, entries: &[(String /* written file name */, &Reference)]) -> String;   // pure; exact format below
  ```
- File naming:
  - Each file is called `<NN> - <title>.<ext>`.
    - `NN` is the 1-based position on the board, zero-padded to the board's digit count, so `01`…`12`. This keeps PureRef and file browsers in board order.
    - `ext` is taken from `Reference.file`.
  - `export_board` passes `safe_name` the stem `format!("{nn} - {title}")`. It seeds `taken` with the lowercased names already in `dest`, read once with `fs::read_dir`, and adds each name it writes.
  - `safe_name` applies these rules, in this order:
    1. Replace `< > : " / \ | ? *` and control characters with `_`.
    2. Cut the stem to 120 characters on a char boundary.
    3. Trim trailing dots and spaces. This comes after the cut, so a cut can't expose a trailing dot.
    4. If the stem is now empty (for example `"..."`), use `"untitled"`.
    5. Prefix `_` to a reserved Windows stem (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`), regardless of case.
    6. Add ` (2)`, ` (3)` and so on while `<stem>.<ext>`, lowercased, is in `taken`.
- Each file is written through `tempfile::NamedTempFile::new_in(dest)`, which never collides with an existing file, then `persist_noclobber` to its name. On a failure, the temp file is dropped, which deletes it, the reference goes into `skipped` with the reason, and the export carries on.
- **`credits.txt` (Decision 1).** After the images, `export_board` writes `credits.txt` into `dest`.
  - It uses the same no-overwrite route as the images: `safe_name("credits", "txt", taken)`, so an existing file gives `credits (2).txt`.
  - It is UTF-8 with **no BOM**, with `\n` line endings.
  - It holds one block per **written** image, in board order. Skipped images are left out.
  - Its name goes into `ExportReport.written`.
  - The exact format, where a missing field prints `—` (U+2014):
    ```
    Horus board: <board name>

    <written file name>
    Title: <title>
    Creator: <creator or —>
    Year: <year or —>
    Credit: <credit or —>
    Source: <source_url or —>

    <next block…>
    ```
  - Each block is followed by one blank line, and the file ends with a single `\n`.
  - Inside a field value, `\r` and `\n` become a space, so every field stays on one line.
  - The text is built by the pure `credits_text`, and `export_board` writes it. Exporting copies bytes and decodes nothing, so this task needs no `import.rs` helper.
- `dest` must exist, and `fs::canonicalize(dest)` must not start with `fs::canonicalize(lib.root)`. Canonicalising handles case differences, `..` and the Windows `\\?\` prefix. Otherwise the function returns `Err("Choose a folder outside the library.")`.

- [ ] **Step 1: Write the failing tests** using a temp library with 3 imported fixtures and one board:
  - `exports_in_board_order`: the files are `1 - …`, `2 - …` and `3 - …` in board order, and each is byte-identical to its original in `images/`.
  - `never_overwrites`: a `dest` that already holds `1 - Harbour.jpg` gets the new file as `1 - Harbour (2).jpg`, and the old file is unchanged.
  - `safe_name_cases`:
    - `safe_name("a:b?c", "jpg", ∅)` gives `"a_b_c.jpg"`;
    - `"CON"` gives `"_CON.jpg"`;
    - `"trailing. "` gives `"trailing.jpg"`;
    - a 300-character title gives a stem of 120 characters;
    - a title whose 120th character falls just before a run of `"."` ends without a trailing dot;
    - `"..."` gives `"untitled.jpg"`;
    - `"Étude"` is kept as is.
  - `duplicate_titles_get_suffix`: two references titled "Study" export as `1 - Study.jpg` and `2 - Study.jpg`, because their position numbers differ. `safe_name("Study", "jpg", {"study.jpg"})` gives `"Study (2).jpg"`.
  - `missing_original_skipped`: delete one file from `images/`. That reference goes into `skipped` with a reason, the other two are written, and no `.tmp` remains.
  - `dest_inside_library_refused`: both `lib.root/images` and the same path written with different case and a `..` segment are refused.
  - `unicode_dest`: exporting to `tempdir()/Références/` works.
  - `credits_text_exact`: for a board named "Harbour" with two references, where one has `creator: None` and `year: Some("1938")` and the other's credit contains `"line1\nline2"`, the output equals a literal expected string, byte for byte. That includes the `—` for missing fields, the credit flattened to `"line1 line2"`, one blank line after each block and a single final `\n`.
  - `credits_file_written`: after an export, `credits.txt` exists in `dest`. Its first three bytes are not `EF BB BF`, it decodes as UTF-8, its blocks follow board order, and a skipped (missing-original) reference has no block. `ExportReport.written` includes `"credits.txt"`.
  - `credits_never_overwrites`: with an existing `credits.txt` in `dest`, the new file is `credits (2).txt`, and the old file is unchanged.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test export::`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(core): export a board to a folder without overwriting`.

---

### Task 3: Commands, the lightbox source and store support

**Files:**
- Modify:
  - `app/src-tauri/src/import.rs`, to expose the shared decode and thumbnail helpers (`CROSS-PLAN-AUDIT.md` #5);
  - `app/src-tauri/src/commands.rs`;
  - `app/src-tauri/src/lib.rs`, to register the new commands;
  - `app/src/api.ts`;
  - `app/src/store.ts` (Plan 2 Task 7).
- Test:
  - `commands::tests`;
  - `app/src/store.test.ts`.

**Interfaces:**
- Consumes Tasks 1 and 2, Plan 2 Task 5's mutating-command recipe, and Plan 1 `correlate::Index::score`.
- **Shared import helpers, refactored out of Plan 1's private `import::store`** (audit #5).
  - The real `store` (`import.rs:168`) already does all of these steps, in this order:
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
  - **The lightbox keeps alpha:** `lightbox_source` encodes `Decoded.rgba` as a PNG, and does not call `on_white`.
  - Plan 5's `similar_by_file` and Plan 6's integrity thumbnail rebuild call `on_white(&decode_srgb(path)?.rgba)`.
- Produces these commands, each returning `Result<_, String>`, with camelCase JSON:
  ```
  add_link(from_ref: String, to_ref: String, why: String) -> Change    // Change.created = link id; Err "DuplicateLink:<id>"
  update_link(link_id: String, why: String) -> Change
  remove_link(link_id: String) -> Change
  create_board(name: String, reference_ids: Vec<String>) -> Change      // Change.created = board id
  rename_board(board_id: String, name: String) -> Change
  set_board_members(board_id: String, reference_ids: Vec<String>) -> Change   // add, remove and reorder are all one call
  delete_board(board_id: String) -> Change
  export_board(board_id: String, dest: String) -> ExportReport          // runs on spawn_blocking, reads under the lock, copies off it
  score_pair(a: String, b: String) -> Scored                            // Index::score, no MIN_SCORE cut
  lightbox_source(ref_id: String) -> LightboxSource
  ```
  ```rust
  pub struct LightboxSource { pub path: String, pub full: bool, pub width: u32, pub height: u32 }
  pub const LIGHTBOX_MAX_SIDE: u32 = 8192;
  ```
- `lightbox_source` behaves like this:
  - If the original's extension is `jpg`, `jpeg`, `png`, `webp` or `gif`, and its longest side is no more than `LIGHTBOX_MAX_SIDE`, it returns the original path with `full: true`.
  - Otherwise it decodes the original once into `app_cache_dir()/lightbox/<hash>.png`. That is outside the library, so the Plan 1 folder layout is unchanged.
    - The decode is `import::decode_srgb`: orientation, ICC→sRGB with a warning fallback, and alpha kept. If the result is larger than `LIGHTBOX_MAX_SIDE`, it is downscaled with `imageops::resize` (Lanczos3).
    - The PNG is written through a `.tmp` file and then renamed, so a crash never leaves a half-written cache file.
    - The preview's longest side is at most `LIGHTBOX_MAX_SIDE`, and the result has `full: false`.
  - The `lightbox` cache directory is added to the asset scope in `setup` with `app.asset_protocol_scope().allow_directory(cache_dir, true)`, next to the library root that Plan 1 Task 7 allows. Without it, the WebView can't load previews.
  - On a cache hit, it reuses the PNG.
  - It replaces Plan 2's `image_path` call in the lightbox. Plan 2's `image_path` command stays.
- Plan 1's `LibraryView` gains `boards: Vec<Board>`.
- `Store` (Plan 2 Task 7) gains:
  ```ts
  links: Link[]; boards: Board[]; scope: string | null;          // scope = board id
  setScope(boardId: string | null): void;                       // notifies subscribers
  inScope(refId: string): boolean;                              // true when scope is null; Plan 3 views read this
  linksFor(refId: string): Link[];                              // links touching refId, newest first
  ```
  `apply(change)` replaces `links` or `boards` when present. If the scoped board is no longer in `boards`, it sets `scope = null` and notifies with the flag `scopeCleared: true`, which the status line reads (Review Focus 5).

- [ ] **Step 1: Write the failing tests**
  - Rust, in `import::tests`, for the refactor:
    - `refactor_keeps_import_behaviour`: every existing `import::` test still passes, unchanged.
    - `write_thumbs_matches_import`: decoding `small.jpg` with `decode_srgb`, then `write_thumbs(tmp, hash, &on_white(&d.rgba))`, gives thumbnails byte-identical to those `import_paths` writes for the same file.
    - `decode_srgb_too_large_unread`: a sparse file larger than `MAX_BYTES` returns `Skip::TooLarge` without being read.
    - `decode_keeps_alpha`: a PNG with a transparent pixel keeps `a == 0` in `Decoded.rgba`.
  - Rust, using `mock_builder`:
    - `add_link_reverse_pair_refused` (Decision 2): `add_link(A, B, "x")` followed by `add_link(B, A, "y")` returns `Err("DuplicateLink:<id of A→B>")`, and `links` still holds one link.
    - `link_crud_and_undo`: run `add_link`, then `update_link`, then `remove_link`. Three `undo` calls give back the original `links`, and each `Change` carries `links: Some`.
    - `board_crud_and_undo`, covering create, reorder through `set_board_members`, rename and delete. Each undo restores the previous board exactly.
    - `score_pair_matches_related`: for a pair that `related` returns, `score_pair` gives the same `score` within 1e-9. A pair below `MIN_SCORE` still returns its score.
    - `lightbox_source_full_for_jpeg`: `small.jpg` gives `full: true` and the original path.
    - `lightbox_source_preview_for_tiff`: a 64×48 TIFF fixture gives `full: false`, the PNG exists under the cache dir, and no `.tmp` remains. A second call returns the same path without re-decoding; compare the mtime.
    - `lightbox_cache_in_asset_scope`: after setup, the asset scope allows a path under `app_cache_dir()/lightbox/`.
  - Store:
    - `inScope` is true for every reference when `scope` is null, and only for members when it is set.
    - Applying a `Change` whose `boards` lacks the scoped board sets `scope` to null and notifies with `scopeCleared`.
    - `linksFor` returns the links in both directions.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test commands::` and `npm test -- store`. Both should FAIL, then PASS.

- [ ] **Step 3: Extend `api.ts`.** Add `Board`, `ExportReport` and `LightboxSource`, plus one wrapper per command. Add `boards: Board[]` to `LibraryView`, and update every existing fake `LibraryView` in the tests to include `boards: []`: Plan 1's `view.test.ts`, Plan 2's `store.test.ts` and the picker, Inbox and intake tests, and Plan 3's `data.test.ts` if it has landed.

- [ ] **Step 4: Commit.** Commit message: `feat(app): link, board, export, pair-score and lightbox-source commands`.

---

### Task 4: Links you draw yourself (the Links tab, the editor, linked-first Related)

**Files:**
- Create: `app/src/links/editor.ts`.
- Modify: `app/src/reference/view.ts` (Plan 1 Task 8).
- Test:
  - `app/src/links/editor.test.ts`;
  - new cases in `app/src/reference/view.test.ts`.

**Interfaces:**
- Consumes `store.linksFor`, `api.addLink`, `api.updateLink` and `api.removeLink` (Task 3).
- It needs a store-fed Reference view (audit #28): `mountReference(root, api, store)` re-renders on `store.subscribe`, which Plan 2 Task 7 delivers. If that hasn't landed, do that refactor first, as this task's Step 0.
- Produces:
  ```ts
  export function mountLinkEditor(root: HTMLElement, api: Api, store: Store,
    opts: { fromRef: string; toRef?: string; linkId?: string }): { close(): void };
  export function linkedFirst(related: Scored[], links: Link[], focus: string): { linked: { link: Link; other: string; score?: number }[]; rest: Scored[] };
  ```
- **The Links tab** lists `linksFor(focus)`. Each row shows the other reference's tile, title and `why`, with Edit and Delete controls. The badge shows the count. "+ Link to…" opens the editor.
- **The editor:**
  - When `toRef` is empty, a combobox lists the references by title and note. It is filtered in TypeScript, excludes the focused reference and the references already linked to it, and works with ↑ ↓ Enter.
  - A "Why are these connected?" textarea is required, and Save stays disabled until it has non-whitespace text.
  - A `DuplicateLink:<id>` error switches the editor to that link, with "These two are already linked — edit the note instead.", and keeps the typed text in the textarea (Review Focus 4).
- **Drawing a link:** a small link handle on the central plate can be dragged onto any element with `[data-ref-id]` in the view. Dropping it opens the editor with `toRef` set. Keyboard equivalent: `k` opens "+ Link to…".
  - The drag uses **pointer events**: `pointerdown` on the handle, `setPointerCapture`, then `pointermove` draws a leader line to the pointer.
  - On `pointerup`, `document.elementFromPoint(x, y)?.closest("[data-ref-id]")` picks the target.
  - Esc or `pointercancel` aborts. HTML5 `draggable` is never used (Global Constraints, audit #2).
- **The Related list (SPEC §4):** a "Linked by you" group comes first. It holds every linked reference, with its `why` and its score shown small, or "not related by technique" when there is none. Then come the scored references, with the linked ones removed, so no reference appears twice. Links never change a score.

- [ ] **Step 1: Write the failing tests**
  - `linkedFirst`:
    - With related `[B 0.6, C 0.4]` and a link A–C, the result is `linked: [C with score 0.4]` and `rest: [B]`.
    - A link to D, which is not in related, gives `linked` containing D with `score` undefined.
  - Editor:
    - Save is disabled for `"   "`.
    - Saving calls `addLink(A, B, "same raking light")`.
    - A fake reply of `DuplicateLink:L1` shows the exact copy, switches to edit mode for L1, and keeps "same raking light" in the textarea.
    - The combobox omits A and any reference already linked to A.
  - `view.test.ts`:
    - The Related pane renders the "Linked by you" heading before the first scored row.
    - Deleting a link row calls `removeLink(L1)`.
    - `link_handle_pointer_drag`:
      - Dispatch `pointerdown` on the handle, `pointermove`, then `pointerup` over a `[data-ref-id="B"]` tile, with `elementFromPoint` stubbed. The editor opens with `toRef: "B"`.
      - The same sequence ending over empty space opens nothing.
      - No `dragstart` listener is registered anywhere in the view.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- links view`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): draw, edit and delete links with a why note, listed first`.

---

### Task 5: Boards (the view, membership, scope and export)

**Files:**
- Create: `app/src/boards/view.ts` and `app/src/boards/menu.ts`.
- Modify:
  - `app/index.html`, to enable the Boards tab, which Plan 3's shell keeps disabled until now;
  - `app/src/reference/view.ts`, to add the "Boards" section to the inspector and apply the scope;
  - `app/src/main.ts`, for the status line.
- Test: `app/src/boards/view.test.ts` and `app/src/boards/menu.test.ts`.

**Interfaces:**
- Consumes Task 3's board commands and `exportBoard`, `store.scope`, `setScope` and `inScope`, and `open({ directory: true })` from `@tauri-apps/plugin-dialog`.
- Registration: the Boards view is registered with Plan 3's shell (Task 2: `mountShell(...).register("boards", () => ViewHandle)`, where `"boards"` is already a `ViewId`). If Plan 3 hasn't landed, wire the tab in `main.ts` the way Plan 2 Task 9 wires the Inbox, and move it behind `shell.register` when Plan 3 lands.
- Produces:
  ```ts
  export function mountBoards(root: HTMLElement, api: Api, store: Store): { destroy(): void };
  export function mountBoardMenu(anchor: HTMLElement, api: Api, store: Store, refId: string): { close(): void };
  export function moveItem(ids: string[], from: number, to: number): string[];   // pure reorder
  ```
- **The board menu**, opened with `b` in the Reference view or from the inspector's "Boards" section:
  - lists the boards with a checkbox each; ticking or unticking calls `setBoardMembers` with the reference appended or removed;
  - ends with "New board…", which creates a board containing this reference.
- **The Boards view:**
  - shows a list of boards with their counts, and the selected board's grid of `thumb256` tiles at their true aspect ratio;
  - offers Rename, which edits inline, and Delete, which asks for confirmation and can be undone;
  - lets tiles be reordered by drag, or by Alt+← and Alt+→ on a focused tile. Each move makes one `setBoardMembers` call with `moveItem`'s result.
    - The drag uses **pointer events**, like the link handle in Task 4: a ghost tile follows the pointer, the insertion index comes from the tile under it, and the move is committed on `pointerup`. HTML5 DnD is never used (audit #2).
  - renders the grid with `loading="lazy"` and `decoding="async"` images at a fixed tile size, through Plan 2 Task 9's windowed grid helper where it exists (audit #16);
  - offers "Remove from board", and "Open", which goes to the Reference view.
- **"Show only this board":**
  - `setScope(boardId)`. The status line reads "Board: <name> · N references · Show all".
  - The Reference view's Related, Ranked and search reference results keep only references for which `inScope` is true.
  - A focused reference outside the board shows the chip "Not on this board" (Review Focus 5).
  - **Plan 3's graph views consume it, and this plan doesn't touch them** (Plan 3 cross-plan impact item 9).
    - Plan 3's `Snapshot` already has `inScope(refId: string): boolean` (Plan 3 Task 2), and Plan 3 Task 10's `storeSource(store)` fills it from **this** `store.inScope`. The names and the signature must stay exactly `store.inScope(refId: string): boolean`.
    - Plan 3 draws out-of-scope reference nodes at dot LOD, and they can't be selected.
    - One test here pins the contract: `store_inscope_signature`, where `storeSource(store).get().inScope` agrees with `store.inScope` for a member and a non-member, once Plan 3 Task 10 exists.
- **"Export board to folder…"** opens the folder picker and calls `exportBoard`. A toast then reads "Exported N to <folder>". If anything was skipped, it adds "· M skipped" with an expandable list of the reasons. "Open folder" uses the opener plugin, which keeps Plan 1's carry-forward: "tauri-plugin-opener prune-or-use".

- [ ] **Step 1: Write the failing tests**
  - `moveItem(["a","b","c"], 0, 2)` gives `["b","c","a"]`, and out-of-range indices return the input unchanged.
  - Menu:
    - Ticking "Harbour" for `r3` calls `setBoardMembers(harbourId, [...members, "r3"])`.
    - "New board…" with the name "Ships" calls `createBoard("Ships", ["r3"])`.
    - A `BoardNameTaken` error shows "A board called Ships already exists." and keeps the menu open.
  - Boards view:
    - Alt+→ on tile 1 calls `setBoardMembers` with tiles 1 and 2 swapped.
    - `tile_pointer_reorder`: `pointerdown` on tile 1, `pointermove`, then `pointerup` over tile 3 calls `setBoardMembers` once with `moveItem(ids, 0, 2)`. A `pointercancel` calls nothing.
    - With 2,000 board members, the grid creates at most 200 `<img>` elements.
    - "Show only this board" sets `store.scope`.
    - Delete, after confirmation, calls `deleteBoard`. When the deleted board was the scope, the status line then reads "Board removed — showing all references".
  - Export:
    - A fake dialog returning `"D:/out"` calls `exportBoard(id, "D:/out")`.
    - A cancelled dialog calls nothing.
    - A report with 1 skipped shows "· 1 skipped".

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- boards`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): boards with membership, show-only scope, reorder and export`.

---

### Task 6: The full lightbox (zoom, pan, region overlays, full resolution)

**Files:**
- Create: `app/src/lightbox/zoom.ts`. This is deliberately separate from Plan 3's `graph/camera.ts`, which has different clamps and conventions; the names `fit` and `zoomAt` are local to this module (audit #20).
- Modify: `app/src/lightbox/view.ts` (Plan 2 Task 10). Extend it in place; keep `openLightbox` and `normRect`.
- Test:
  - `app/src/lightbox/zoom.test.ts`;
  - new cases in `app/src/lightbox/regions.test.ts`.

**Interfaces:**
- Consumes `openLightbox(api, store, refId)`, `normRect`, `MIN_REGION` and the picker hand-off (Plan 2 Task 10), plus `api.lightboxSource` (Task 3).
- Produces:
  ```ts
  export type View = { scale: number; tx: number; ty: number };       // image px -> viewport px: x' = x*scale + tx
  export const MAX_ZOOM = 8;                                          // 800 %
  export function fit(img: { w: number; h: number }, vp: { w: number; h: number }): View;   // letterboxed, centred
  export function zoomAt(v: View, factor: number, pt: { x: number; y: number }, min: number): View;  // keeps image point under pt fixed; clamps scale to [min, MAX_ZOOM]
  export function panBy(v: View, dx: number, dy: number, img: { w: number; h: number }, vp: { w: number; h: number }): View;  // never pans the image fully off-screen
  export function plateOf(v: View, img: { w: number; h: number }): Box;   // what normRect receives, so regions stay correct when zoomed
  export function hitRegion(regions: { tagId: string; region: Region }[], pt: { x: number; y: number }, plate: Box): string | null;  // smallest region under pt
  ```
- Controls:
  - **Zoom:** the mouse wheel and trackpad pinch zoom at the cursor. `+` and `-` zoom at the centre, `0` fits the image, and `1` shows 100%, where one image pixel is one CSS pixel.
  - **Pan:** Space+drag or middle-drag. The arrow keys pan by 10% of the viewport when zoomed in.
  - **A plain drag still draws a region,** as in Plan 2.
- **Region overlays:** every region tag is outlined. Hovering over one, or Tab focusing it, highlights it with its label, "Stand out › Rim light". The smallest region under the pointer wins. `o` toggles the overlays.
  - The outline stroke is `opInk(store.tax, tag.operationId).base`.
  - The label is `opLabel(...).plain`, then ` › `, then the technique name, with the operation part in `.text`.
  - An unknown operation draws in the neutral ink, never amber.
- `v` toggles the value view, as before.
- When `full` is false, the corner shows "Showing a preview — this format can't be shown at full size here." (Review Focus 3).
- The toolbar shows the zoom percentage and the source size, such as "4000 × 3000".
- The lightbox opens with `L` or Enter on the plate, as in Plan 2, and from Compare (Task 7).

- [ ] **Step 1: Write the failing tests**
  - `fit({w: 4000, h: 3000}, {w: 800, h: 800})` gives `{scale: 0.2, tx: 0, ty: 100}`.
  - `zoomAt(fitView, 2, {x: 400, y: 400}, 0.2)`: the image point under (400, 400) maps back to (400, 400). The scale clamps at `MAX_ZOOM` and never drops below `min`.
  - `panBy` can't move `tx` so far that the image leaves the viewport.
  - Region under zoom: at scale 0.4, a drag from viewport (100, 100) to (180, 160) gives the same `Region` that `normRect` returns for `plateOf(view, img)`. The region is identical whatever the zoom.
  - `hitRegion`: with a large region containing a small one, a point inside both returns the small one's `tagId`.
  - `view`:
    - With `lightboxSource` returning `full: false`, the preview copy is visible.
    - `o` hides the overlays.
    - `1` sets the scale to 1.
    - `overlay_ink_from_taxonomy`: a region tag under an added operation with `color: "teal"` is stroked `var(--x-teal)`. One under an id missing from the taxonomy is stroked `var(--ink-2)`. A renamed `plainLabel` shows in the hover label.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- lightbox`. It should FAIL, then PASS, and Plan 2's lightbox tests must still pass.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): full lightbox with zoom, pan, hover region overlays and preview fallback`.

---

### Task 7: The Compare view

**Files:**
- Create: `app/src/compare/view.ts` and `app/src/compare/sides.ts`.
- Modify: `app/src/reference/view.ts`, to add Shift-click and Shift+Enter, and the Compare entry.
- Test: `app/src/compare/sides.test.ts` and `app/src/compare/view.test.ts`.

**Interfaces:**
- Consumes `api.scorePair` (Task 3), `tileBox` (Plan 1 Task 8), `mountLinkEditor` (Task 4) and `openLightbox` (Task 6).
- Produces:
  ```ts
  export type Sides = { shared: string[]; onlyA: string[]; onlyB: string[]; partialA: string[]; partialB: string[] };   // technique ids; partial = operation ids
  export function sides(a: Reference, b: Reference, sharedTechniques: string[], tax: Taxonomy): Sides;   // regions collapse; order = tax.techniques order
  export function mountCompare(root: HTMLElement, api: Api, store: Store, a: string, b: string): { swap(): void; close(): void };
  export function makeOpenCompare(root: HTMLElement, api: Api, store: Store, opts?: { onClose?(a: string): void }): (a: string, b: string) => void;
  // main.ts: const openCompare = makeOpenCompare(...); passed to Plan 3's mountGalaxy deps as `openCompare` —
  // exactly Plan 3 Task 7's `openCompare?(a: string, b: string): void` (Plan 3 cross-plan impact item 10)
  ```
- **Opening it:** Shift-click a second reference in Related, Ranked, a callout thumbnail or the Links tab, or press Shift+Enter on a focused row. Compare opens on the focused reference (A) and that one (B).
- **Layout:**
  - A sits on the left and B on the right, both large. They use `thumb1024`, letterboxed on the N5 tile.
  - The middle column, "Shared", lists `scored.sharedTechniques`.
  - Under it, "Same operation × domain" lists `scored.sharedBranches` that have no shared technique.
  - Each side lists its own unique techniques under "Only here", and then its partial tags under "Operation only".
  - Hovering a technique outlines its region on whichever image carries it, if it is a region tag (ruling a1). The outline and the technique's operation path use `opInk` and `opLabel` (Global Constraints).
  - **Entry from the graph views:** `makeOpenCompare` returns the function Plan 3's Galaxy calls on Shift-click. Calling it closes any open Compare first, so there is only ever one, and then mounts a new one.
    - **Esc** calls `opts.onClose(a)` when it is given. `main.ts` passes one that returns to the calling view, such as the Galaxy.
    - Without `onClose`, Esc calls the Reference view's `show(A)`, as in the layout rules below.
  - The score shows small, with the wording "related by technique", or "not related by technique" when the score is 0.
  - If A and B are linked, their link's `why` shows at the top, marked "Linked by you". Links never change the score.
- **Keys:** `v` toggles the value view on both images, `x` swaps the sides, and `L` opens the lightbox on the side under the pointer. Esc returns to the Reference view on A. "Link these two" opens the link editor.
- When Compare is open, the scope is ignored: comparing is always explicit.

- [ ] **Step 1: Write the failing tests**
  - `sides`:
    - With A having t1, t2 and partial `infer`, B having t2 and t3, and shared `[t2]`, the result is `shared: [t2]`, `onlyA: [t1]`, `onlyB: [t3]`, `partialA: ["infer"]` and `partialB: []`.
    - Two region tags of t1 on A count once.
    - With a taxonomy order of t3, t1, t2, `onlyA` and `onlyB` follow that order, not the tag order.
  - View:
    - Shift-click on a Related tile calls `scorePair(A, B)` and renders three columns.
    - `open_compare_from_galaxy`: `makeOpenCompare(root, api, store)("a", "b")` calls `scorePair("a", "b")` and mounts one Compare. A second call replaces it, so there is still only one.
    - `compare_ink_from_taxonomy`: a shared technique under an operation with `color: "rose"` renders its path in `var(--x-rose-text)`.
    - `x` swaps the titles.
    - `v` toggles the value class on both plates.
    - Esc calls the Reference view's `show(A)`.
    - With a link A–B in the store, its `why` renders above "Shared".
    - The score text for a 0 score is "not related by technique".

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- compare`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): compare two references by shared and unique techniques`.

---

### Task 8: The end-to-end check (Brief and Study)

- [ ] **Step 1: Run the full suites.** Run `cargo test`, `cargo clippy --all-targets -- -D warnings` and `npm test`. Expected: all pass, with no warnings.

- [ ] **Step 2: Manual run.** Run `npm run tauri dev` on the demo library. Expected results:
  1. Press `b` on 10 references and add them to the new board "Harbour".
  2. In Boards, reorder two tiles with Alt+→, then press Ctrl+Z. The order goes back.
  3. Turn on "Show only this board". The Related list and search show only board members, and the status line reads "Board: Harbour · 10 references · Show all".
  4. Export the board to `D:\Design Second Brain\Export test\`. There are 10 files named `01 - …` to `10 - …`, plus `credits.txt` with 10 blocks in the same order. It opens cleanly in Notepad and TextEdit, with no stray characters at the start. Export again: 10 more files with ` (2)` names, and nothing overwritten. Drag the folder into PureRef; the images appear in board order.
  5. Open the lightbox on a demo poster:
     - zoom to 400% at the cursor, then pan with Space+drag;
     - hover a region outline, and its label appears;
     - draw a new region at 400% zoom and tag it. The new outline sits exactly where it was drawn, both when fitted and at 100%.
  6. Shift-click a related reference. Compare shows the shared techniques in the middle. Press "Link these two", type a "why" and save. The Reference view's Related list now starts with "Linked by you".
  7. Ctrl+Z three times removes the link, the region tag and the board change, one per press.
- [ ] **Step 3: Commit.** Commit message: `test: Plan 4 end-to-end check notes in app/README.md`.

---

## Decisions (answered by the user, 2026-11-25)

1. **Export writes `credits.txt`.**
   - It lists each exported image's title, creator, year, credit and source URL, one block per image, in board order.
   - It is plain text, UTF-8 and BOM-free, and never overwrites an existing file.
   - The format and tests are in Task 2, and Task 8 checks it by hand.
2. **One link per pair.** A second reason means editing the note. The pair is **unordered**: A→B and B→A count as the same pair.
   - `edit::apply` enforces it with `DuplicateLink` (Task 1: `duplicate_pair_refused_either_direction`, including in a batch).
   - The command layer enforces it too (Task 3: `add_link_reverse_pair_refused`).
   - The editor switches to the existing link (Task 4).
