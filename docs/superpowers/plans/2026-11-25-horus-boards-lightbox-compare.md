# Horus Boards, Lightbox, Compare and Links (Plan 4 of 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Amended 2026-11-26** from the pre-flight scan (`.superpowers/sdd/2026-11-25-horus-boards-lightbox-compare/preflight-scan.md`) and the controller's rulings B1–B4. The scan item for each change is in brackets, such as [B2] or [R7]. The amendment report, with one row per scan item, sits next to the scan.

**Goal:** An artist can narrow a library into named Boards, show only one board, and export it to a folder. They can study a reference at full resolution with zoom, the value toggle and region overlays. They can compare two references side by side, and draw their own links with a "why" note. Every change can be undone.

**Architecture:**
- **Rust core:**
  - Task 0 first moves Plan 3's taxonomy-edit commands out of `commands.rs` into `commands/taxonomy_edit.rs`, with no change in behaviour (Plan 3 final-review ruling M9) [B1].
  - Links and boards become new `edit::Edit` variants, so they reuse Plan 2's validation, inverse and `History`.
  - A new `export` module copies a board's originals to a folder without overwriting anything.
  - Three thin commands are added:
    - `score_pair`, which reuses `correlate::Index::score`;
    - `lightbox_source`, which serves the original, or a PNG preview for formats the WebView can't show;
    - `export_board`.
- **TypeScript UI:**
  - Plan 2's `Store` gains boards and a board scope. It already holds `links` (`store.ts:14`).
  - The Boards view and Compare are new DOM modules. The Links tab already exists read-only (`reference/view.ts:318-329`) and gains editing.
  - The Plan 2 lightbox gains zoom, pan and hover overlays in place.
  - The graph views (Tree, Galaxy, Radial) belong to Plan 3. This plan feeds `store.inScope(id)` into Plan 3's `storeSource` [R8] and closes the three board-scope items Plan 3 deferred to Plan 4 [R17].

**Tech Stack:** the same stack as Plans 1–3, with no new crates or npm packages, with one recorded exception: `tauri-plugin-opener` comes back for "Open folder" (Task 5). Its capability is scoped to `opener:allow-reveal-item-in-dir` only. Plan 1 Task 10 removed it; Plan 6 T1 expects this permission [B3]. The export folder picker is the existing `api.pickFolder` (`tauri-plugin-dialog`) [R18].

**Spec:** `SPEC.md` (draft 5), mainly:
- §2: Brief and Study ("filter the view to that board");
- §4: "Links drawn by the artist. Always shown, and listed first. They are not mixed into the score.";
- §5: the Compare, Boards and Lightbox rows, and the note on region tags;
- §9: originals are decoded only in the lightbox, and are never moved or modified; edits are saved safely;
- §11: the anti-goal that the app becomes a mood board.

**Builds on** (all merged to `main` at `a7fb0f0`) [C3]:
- **Plan 1** (`docs/superpowers/plans/2026-11-24-horus-foundation.md`, as amended):
  - `model::{Link, Board, LibraryData}`, with `Link { id, from_ref, to_ref, why }` and `Board { id, name, reference_ids }`;
  - `Library::image_path`;
  - `correlate::Index::score(&self, a, b) -> Scored`;
  - the `LibraryView` and `ReferenceView` types (the real Rust name is `ReferenceView`, `commands.rs:78`) [C1];
  - `tileBox` (`reference/tile.ts:14`), and the Reference view's Links tab and `v` value toggle.
- **Plan 2** (`docs/superpowers/plans/2026-11-25-horus-tagging-inbox.md`):
  - `edit::{Edit, apply, Applied, Touched, EditError, new_id}`;
  - `History`;
  - the debounced saver (`saver.rs`: `Debounce`, `flush`);
  - the state struct `Open { lib, tax, index, history, debounce }`, the mutating-command recipe, `change()`, `settle()`, `is_noop()` and `Change`;
  - `Store` and `wireUndoKeys`;
  - `normRect` and `MIN_REGION` (`lightbox/regions.ts:5-18`) [C7]; `openLightbox(api, store, refId, deps: { openPicker(opts); onClose?() })` (`lightbox/view.ts:21-26`) [R23]; `api.imagePath`;
  - `matchesFilter`;
  - `mountWindowedGrid` (`grid/windowed.ts:5`) [C4]; `noticeIn` (`importer.ts:78`); `api.pickFolder` (`api.ts:157`).
- **Plan 3** (`docs/superpowers/plans/2026-11-25-horus-graph-views.md`):
  - the view shell `mountViews` (`views.ts:12`) and `ViewHandle` (`views.ts:6`), wired in `firstrun.ts` `boot()` (`firstrun.ts:25-102`; `main.ts` is only the 10-line entry point) [R15, R22];
  - `storeSource` (`data.ts:27-46`), whose `Snapshot.inScope` this plan fills [R8];
  - the Galaxy's `openCompare?(a, b)` dep (`galaxy.ts:29`), passed in `boot()` (`firstrun.ts:63`);
  - `opInk` and `opLabel` (`app/src/ops.ts`).

## Global Constraints

- **Links drawn by the artist** are always shown and listed first, and are never part of any score: the Ranked list, Compare or Plan 3's Galaxy (SPEC §4). "Always shown" also wins over a technique filter and over board scope [R13].
- Every link has a non-empty "why" note (SPEC §1, §3 `Link.why`).
- **Undo covers everything** (SPEC §6.8). Creating, editing or deleting a link, and creating, renaming, re-membering or deleting a board, each goes through `edit::apply` and is one undo step. Exporting writes outside the library, so it is not undoable.
- **Every undoable edit is saved.** A link or board edit marks the library dirty, so the debounced save and the close flush write it (SPEC §9) [B2].
- **Export** copies originals from `images/` into the chosen folder as plain image files, for PureRef, Photoshop and Figma. It never moves or modifies an original, never overwrites a file, and never writes `.pur` (SPEC §11).
- The always-on-top board window is v1.1, so it is out of scope (SPEC §11).
- **The lightbox** shows full resolution, with zoom, the value toggle and region overlays. Originals are decoded only there (SPEC §9).
- **Compare** opens on Shift-click of a second reference. Shared techniques sit in the middle, and the techniques unique to each reference sit on its side. Images are large, with the value toggle (SPEC §5).
- **Region thumbnails** use Plan 1's letterboxed plate with the region outlined. This is ruling a1, a recorded spec delta from SPEC §5's "cropped".
- The scope "Show only this board" is view state. It is not saved and not undoable.
- **In-page drags use pointer events, never the HTML5 drag-and-drop API.** `dragDropEnabled` stays at its default of `true`, because Plan 2's file intake needs native drops, and on Windows that setting stops WebView2 from firing `dragstart`, `dragover` and `drop` (`CROSS-PLAN-AUDIT.md` #2). This covers the link handle (Task 4) and board tile reordering (Task 5).
- **Operation colour and labels come from Plan 3's `opInk` and Plan 2's `opLabel`** (`app/src/ops.ts`; Plan 3 cross-plan impact item 5). Operations are editable data (1 to 9 of them), so no fixed four-ink map and no `var(--diff)`-style token appears in this plan's code. An unknown operation draws in the neutral ink.
- **One link per unordered pair** (Decision 2). A→B and B→A are the same pair; a second reason goes into the existing note.
- **Export also writes `credits.txt`** (Decision 1), as plain UTF-8 without a BOM. It prints what the library holds: the demo set's metadata, or `—`. Editing title, creator, year and credit stays out of v1 (`CROSS-PLAN-AUDIT.md` #23 closed) [R27].
- **No new inline `style=` attributes** (carried rule). Positions and sizes go through the CSSOM (`el.style.setProperty`), as `grid/windowed.ts` and the lightbox do. New tiles use `tileBox` with `style.setProperty`, not `tileHTML`, which emits `style=` [R26].
- **CSS:** each UI task appends its rules to `app/src/styles.css` in a section headed by the task. It never edits another task's section [R25].
- **New `EditError` variants display as wire codes,** not prose, and the UI maps each code to copy (Task 1) [R2].
- UI tokens, type and copy follow `prototype/styles.css`, `DESIGN.md` and the Plan 1 Task 8 port. No new colours.

## Review Focus

1. **Exporting into a folder that already holds files with the same names**, or exporting titles with characters Windows forbids (`: ? * " < > |`), reserved names (`CON`, `NUL`), trailing dots, or two references with the same title. No file is ever overwritten, every name is valid on Windows, macOS and Linux, and collisions get a ` (2)` suffix. Tested in Task 2.
2. **An original is missing from `images/`, or the destination becomes unwritable part-way.** That item is skipped with a stated reason, the rest of the export continues, and no partial temp file is left behind. Tested in Task 2.
3. **The lightbox opens a TIFF, or an image of 20,000 px or more**, which the WebView can't decode or would struggle with. A PNG preview is shown with the note "Showing a preview — this format can't be shown at full size here.", never a blank pane. If the preview itself fails, the lightbox keeps `thumb1024` with the same note. Tested in Tasks 3 and 6.
4. **Linking a reference to itself, adding a second link for the same pair, or saving an empty "why".** Each is refused with a message, and the editor keeps the text that was typed. Tested in Tasks 1 and 4.
5. **"Show only this board" is on, and the board is deleted, or the focused reference isn't on it.** Deleting the board clears the scope, and the status line says so. A focused reference outside the board stays focused and is marked "Not on this board". Tested in Task 5.
6. **A link or board edit followed by a quit.** The edit is on disk after the close flush. Tested in Task 1 [B2].

## Schedule

The shared files decide the order [scan §7]:
- `commands.rs`: T0, T1, T3;
- `lib.rs`: T0, T2, T3, T5;
- `reference/view.ts` and its test: T4, T5, T7;
- `firstrun.ts`: T5, T7;
- `lightbox/*`: T6 edits `view.ts`; T7 creates `dock.ts`, after T6 (R23);
- `styles.css`: T4, T5, T6, T7, append-only.

| Wave | Tasks | Why |
|---|---|---|
| W0 | **T0** alone | A pure move on `commands.rs`, before more commands land (Plan 3 M9). |
| W1 | **T1 ∥ T2** | T1: `edit.rs` and the top of `commands.rs`. T2: new `export.rs` and one `lib.rs` line. No other shared file. |
| W2 | **T3** | It needs T1 and T2. |
| W3 | **T4 ∥ T6** | T4: `links/*`, `reference/view.ts`. T6: `lightbox/*`. They share only `styles.css`, append-only. |
| W4 | **T5** | After T4, because both change `reference/view.ts`. |
| W5 | **T7** | It needs T4's editor and T6's lightbox, and edits `reference/view.ts` and `firstrun.ts` after T5. |
| W6 | **T8** | The end-to-end check. |

Line numbers in this plan are from `main` at `a7fb0f0`. Line numbers inside `commands.rs` move after T0, so T1 and T3 briefs take them from the post-T0 file [P1].

---

### Task 0: Move the taxonomy-edit commands into their own module [B1]

Plan 3's final review (ruling M9, `docs/superpowers/ledgers/2026-11-25-horus-graph-views/final-review.md:233-238`, `:390`) put this first in Plan 4, before more commands land on `commands.rs` (4,153 lines).

**Files:**
- Create: `app/src-tauri/src/commands/taxonomy_edit.rs`.
- Modify:
  - `app/src-tauri/src/commands.rs` (it stays the parent module file, with `pub mod taxonomy_edit;`);
  - `app/src-tauri/src/lib.rs` (the `generate_handler!` list).

**What moves:** the section "Plan 3 Task 9: taxonomy edits" (`commands.rs:834-1480`):
- `Plan` and its `impl`;
- `descending`, `rekey_branch`, `drop_branches`, `needs_move`, `move_tags`, `unique_name`, `unknown`, `check_ink` and `check_icon`;
- the commands `update_technique`, `update_domain`, `add_domain`, `delete_domain`, `add_operation`, `update_operation`, `delete_operation`, `link_technique`, `unlink_technique`, `delete_technique` and `add_branch`.

Their tests move into a `#[cfg(test)] mod tests` in the new file, reusing `commands::tests::env()` (make it `pub(crate)` if needed). Plan 2's `add_technique` (`:797`) stays where it is. Shared helpers the moved code calls (`commit` and any others it uses from the parent) stay in `commands.rs`, at `pub(super)` visibility.

**Rules:**
- **No behaviour change.** Every wire string, error text and command name stays the same. Existing tests may only change their `use` paths.
- `lib.rs` names each moved command by its new path, `commands::taxonomy_edit::<cmd>`. Don't rely on a glob re-export, because Tauri's `__cmd__` macros must resolve.
- **Carried from Plan 3's deferred list** (`final-review.md:308-311`):
  - Rename `Plan` to `TaxPlan` (the "Plan N" name collision). This is internal only.
  - Add one test, `redo_reapplies_a_second_batch_shape`. The only taxonomy redo test today redoes a `delete_technique` that moves tags (`delete_moves_tags_and_undo_restores`). The new one undoes and redoes a `delete_operation` that moves tags. The `data` and `tax` after redo equal those after the first apply. This is the one test T0 adds; the pass count is the baseline plus one.
  - Taxonomy items reported as `EditError::UnknownTag` (`edit.rs:476`, `:499`, `:725`, `:734`, `:748`): **deferred again**, to Plan 6's copy pass. Mapping them to new variants changes error text, which breaks this task's no-behaviour-change rule. `sayError` already shows generic copy, so no raw text reaches the artist.

- [ ] **Step 1: Record the baseline.** Run `cargo test` in `app/src-tauri`, and note the pass count.
- [ ] **Step 2: Move, rename `Plan`, update `lib.rs`.** Then run `cargo test`, `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check`. The pass count equals the baseline.
- [ ] **Step 3: Add `redo_reapplies_a_second_batch_shape`.** Run `cargo test commands::`. The count is now the baseline plus one.
- [ ] **Step 4: Commit.** Commit message: `refactor(core): move taxonomy-edit commands into commands/taxonomy_edit.rs`.

---

### Task 1: Link and board edits

**Files:**
- Modify:
  - `app/src-tauri/src/edit.rs` (Plan 2 Task 1);
  - `app/src-tauri/src/commands.rs`: the `Change` struct, `change()`, `settle()` and `is_noop()`, plus the `Touched { … }` literal in `commands::tests` (`:2780` before T0) [B2, C15];
  - `app/src-tauri/src/saver.rs`: read only, to confirm that `dirty_library` drives the deadline and the flush (`saver.rs:35-49`, `:92`, `:100`). No change is expected.

**Interfaces:**
- Consumes `edit::{Edit, apply, Applied, Touched, EditError, new_id}` (Plan 2 Task 1).
- Produces these new `Edit` variants:
  ```rust
  AddLink { link: Link },
  RemoveLink { index: usize, link: Link },
  ReplaceLink { before: Link, after: Link },            // same id; only `why` may differ
  InsertRefLink { index: usize, link: Link, sealed: Sealed },   // RemoveLink's inverse: restores the position
  AddBoard { board: Board },
  RemoveBoard { index: usize, board: Board },
  ReplaceBoard { before: Board, after: Board },         // same id; rename and/or new reference_ids order
  InsertBoard { index: usize, board: Board, sealed: Sealed },   // RemoveBoard's inverse
  ```
  - The inverses follow the existing sealed `Insert*` pattern (`edit.rs:106-147`). The name `InsertLink` is already taken by `BranchTechnique` (`edit.rs:138`), so the reference-link inverse is `InsertRefLink` [R1].
  - None of the new variants `touches_taxonomy`.
- It also adds these `EditError` variants. Their `Display` is a wire code [R2]:

  | Variant | Display |
  |---|---|
  | `SelfLink` | `SelfLink` |
  | `DuplicateLink(String /* existing id */)` | `DuplicateLink:{id}` |
  | `EmptyWhy` | `EmptyWhy` |
  | `EmptyName` | `EmptyName` |
  | `BoardNameTaken(String /* existing board's id */)` | `BoardNameTaken:{id}` (matches `NameTaken:<id>`) |
  | `UnknownLink(String)` | `UnknownLink:{id}` |
  | `UnknownBoard(String)` | `UnknownBoard:{id}` |

- `Touched` gains `links: bool` and `boards: bool`. `merge()` (`edit.rs:801`) ORs them [R1].
- `Change` (Plan 2 Task 5) gains `links: Option<Vec<Link>>` and `boards: Option<Vec<Board>>`, each the full list and set only when touched. Both lists stay small, so the full list is cheaper to reason about than a delta.
- **Saving** [B2]:
  - `settle()` (`commands.rs:608-611`) sets the library dirty when `touched.ref_ids` or `removed_ref_ids` is non-empty, **or `touched.links` or `touched.boards` is set**. Without this, the debounce sets no deadline and `flush` skips `library.json`.
  - `is_noop()` (`commands.rs:616-628`) also treats `ReplaceLink` and `ReplaceBoard` with `before == after` as no-ops [R1].
- Validation rules:
  - A link needs `from_ref != to_ref`, and both references must exist.
  - `why.trim()` must not be empty; it is stored trimmed.
  - Only one link may exist per unordered pair. A second gives `DuplicateLink`, so the artist edits the existing link instead.
  - A board name is trimmed, non-empty and unique without regard to case.
  - A board's `reference_ids` must exist and be unique; order is kept.
- A new guard on `RemoveReferences`: it fails with `InUse` while a link or a board touches one of the references. Linear history makes this unreachable, and so does undo, which runs `check: false` (`edit.rs:284`). The guard only keeps a bug in `apply` from leaving dangling links [C31].

- [ ] **Step 1: Write the failing tests** in `edit::tests`:
  - `link_add_inverse_restores` and `board_add_inverse_restores`: applying the edit and then its inverse gives `data` equal to the snapshot, with `touched.links` (or `boards`) set.
  - `remove_link_inverse_restores_position` and `remove_board_inverse_restores_position`: removing the middle of three, then the inverse, gives back the original order.
  - `self_link_refused`, `empty_why_refused` (a `why` of `"   "`) and `link_unknown_ref_refused`.
  - `duplicate_pair_refused_either_direction` (Decision 2): with A→B present, both A→B and B→A return `DuplicateLink(<id of A→B>)`. After `RemoveLink` of A→B, B→A is accepted. A `Batch` that adds A→B and B→A together fails, and rolls back to no links.
  - `replace_link_changes_why_only`: changing `to_ref` in `after` returns `Err`.
  - `board_name_unique_case_insensitive`: with "Harbour" present, " harbour " returns `BoardNameTaken(<Harbour's id>)`.
  - `board_members_must_exist_and_be_unique`.
  - `unknown_board_refused`: `ReplaceBoard` or `RemoveBoard` for a missing id returns `UnknownBoard(id)`.
  - `board_reorder_is_one_edit`: a `ReplaceBoard` that reverses `[a, b, c]` and then its inverse gives back `[a, b, c]`.
  - `remove_refs_in_use_guarded`: through `apply` with `check: true`, a reference that is on a board can't be removed by `RemoveReferences`.
  - `wire_codes`: the `Display` of each new variant equals the table above.
  - `merge_ors_links_and_boards`.
- And in `commands::tests` [B2]. There is no link command until Task 3, so these tests call the private recipe directly, `commit(e.handle(), |_| Ok((Edit::AddLink { link }, None)))`:
  - `link_edit_marks_library_dirty`: after the edit, `debounce` has a deadline.
  - `link_edit_survives_flush`: after the edit, `saver::flush` (the close path) leaves the link in `library.json` when it is re-read.
  - `noop_replace_link_is_noop`: a `ReplaceLink` with `before == after` makes no history step.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test edit::` and `cargo test commands::`. They should FAIL, then PASS, and every Plan 2 and Plan 3 test must still pass.

- [ ] **Step 3: Commit.** Commit message: `feat(core): invertible link and board edits that save`.

---

### Task 2: The `export` module (a board to a folder)

**Files:**
- Create: `app/src-tauri/src/export.rs`.
- Modify: `app/src-tauri/src/lib.rs` (`pub mod export;` only) [R5].

**Interfaces:**
- Consumes `library::image_path_in(root, file)` (`library.rs:185`) and `model::{Board, Reference}`.
- Produces:
  ```rust
  #[derive(Serialize)] #[serde(rename_all = "camelCase")]
  pub struct ExportReport {
      pub written: Vec<String /* image file names only */>,
      pub credits: Option<String /* the credits file's name, when written */>,   // [R21]
      pub skipped: Vec<(String /* ref id */, String /* reason */)>,               // serialises as [string, string][] [C14]
  }
  pub fn export_board(root: &Path, board: &Board, refs: &[Reference], dest: &Path) -> Result<ExportReport, String>;   // [R4]
  pub fn safe_name(stem: &str, ext: &str, taken: &HashSet<String>) -> String;   // pure; `taken` holds lowercased full names
  pub fn credits_text(board: &Board, entries: &[(String /* written file name */, &Reference)]) -> String;   // pure; exact format below
  ```
  - `export_board` takes no `&Library`. `Library` is not `Clone` (`library.rs:33`), and holding it would hold the state lock for the whole copy. The command (Task 3) clones the board and its member references under the lock, then calls this off it [R4].
  - `refs` holds the board's members in board order. A member id with no reference goes into `skipped`.
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
  - Its name goes into `ExportReport.credits`, not `written` [R21].
  - It prints what the library holds. Imports set no creator, year or credit, so outside the demo set those fields print `—` [R27].
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
  - The header and the blocks are separated by one blank line each. The file ends with exactly one `\n`, after the last `Source:` line [R3].
  - With no written image (an empty board, or every image skipped), the file is exactly `Horus board: <name>\n`, and it is still written [R3, C13].
  - Inside a field value, `\r` and `\n` become a space, so every field stays on one line.
  - The text is built by the pure `credits_text`, and `export_board` writes it. Exporting copies bytes and decodes nothing, so this task needs no `import.rs` helper.
- `dest` must exist, and `fs::canonicalize(dest)` must not start with `fs::canonicalize(root)`. Canonicalising handles case differences, `..` and the Windows `\\?\` prefix. Otherwise the function returns `Err("Choose a folder outside the library.")`.

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
  - `missing_original_skipped`: delete one file from `images/`. That reference goes into `skipped` with a reason, the other two are written, and `dest` then holds exactly the two images and `credits.txt`, with no other file (no leftover temp file of any name) [C13].
  - `dest_inside_library_refused`: both `root/images` and the same path written with different case and a `..` segment are refused.
  - `unicode_dest`: exporting to `tempdir()/Références/` works.
  - `credits_text_exact`: for a board named "Harbour" with two references, where one has `creator: None` and `year: Some("1938")` and the other's credit contains `"line1\nline2"`, the output equals a literal expected string, byte for byte. That includes the `—` for missing fields, the credit flattened to `"line1 line2"`, one blank line between blocks and exactly one final `\n`.
  - `credits_text_empty_board`: a board with no written image gives exactly `"Horus board: <name>\n"`.
  - `credits_file_written`: after an export, `credits.txt` exists in `dest`. Its first three bytes are not `EF BB BF`, it decodes as UTF-8, its blocks follow board order, and a skipped (missing-original) reference has no block. `ExportReport.credits` is `Some("credits.txt")`, and `written` holds only the image names.
  - `credits_never_overwrites`: with an existing `credits.txt` in `dest`, the new file is `credits (2).txt`, and the old file is unchanged.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test export::`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(core): export a board to a folder without overwriting`.

---

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

### Task 4: Links you draw yourself (the Links tab, the editor, linked-first Ranked)

**Files:**
- Create: `app/src/links/editor.ts`, which also holds `linkedFirst` [C16].
- Modify:
  - `app/src/reference/view.ts` (Plan 1 Task 8);
  - `app/src/styles.css` (append a "Plan 4 Task 4" section) [R25].
- Test:
  - `app/src/links/editor.test.ts`;
  - new cases in `app/src/reference/view.test.ts`.

**Interfaces:**
- Consumes `store.linksFor`, `api.addLink`, `api.updateLink` and `api.removeLink` (Task 3).
- The store-fed Reference view `mountReference(root, api, store, opts)` has landed (`reference/view.ts:24`) [C5].
- Produces:
  ```ts
  export function mountLinkEditor(root: HTMLElement, api: Api, store: Store,
    opts: { fromRef: string; toRef?: string; linkId?: string }): { close(): void };
  export function linkedFirst(related: Scored[], links: Link[], focus: string): { linked: { link: Link; other: string; score?: number }[]; rest: Scored[] };
  ```
- **Refresh** [R7]: `touchesFocus` (`reference/view.ts:611-628`) also returns true when the event carries `links` or `scope`. Otherwise a links-only `Change` refreshes neither the Links tab nor Ranked.
- **The Links tab** already lists links read-only (`reference/view.ts:318-329`; `index.html:55`, `:59`) [C6]. It now lists `store.linksFor(focus)`. Each row shows the other reference's tile, title and `why`, and gains Edit and Delete controls. The badge shows the count. "+ Link to…" opens the editor.
- **The editor:**
  - When `toRef` is empty, a combobox lists the references by title and note. It is filtered in TypeScript, excludes the focused reference and the references already linked to it, and works with ↑ ↓ Enter.
  - A "Why are these connected?" textarea is required, and Save stays disabled until it has non-whitespace text.
  - A `DuplicateLink:<id>` error switches the editor to that link, with "These two are already linked — edit the note instead.", and keeps the typed text in the textarea (Review Focus 4).
  - The other codes map to copy: `SelfLink` gives "A reference can't link to itself.", and `EmptyWhy` gives "Say why these are connected." Any other error gives "That change didn't save. Try again."
- **Drawing a link:** a small link handle can be dragged onto any element with `[data-ref-id]` in the view. Dropping it opens the editor with `toRef` set. Keyboard equivalent: `k` opens "+ Link to…".
  - The handle is appended to `#lab`, like `.tag-open` (`reference/view.ts:562`), because `#plate` re-renders [R14].
  - **Drop targets:** the tiles that can receive a link (the Ranked and Links rows, and callout thumbnails) gain `data-ref-id`, next to their existing `data-go`. No non-test code carries `[data-ref-id]` today [R14].
  - The drag uses **pointer events**: `pointerdown` on the handle, `setPointerCapture`, then `pointermove` draws a leader line to the pointer.
  - On `pointerup`, `document.elementFromPoint(x, y)?.closest("[data-ref-id]")` picks the target.
  - Esc or `pointercancel` aborts. HTML5 `draggable` is never used (Global Constraints, audit #2).
- **The Ranked list (SPEC §4)** is `#pane-ranked` (`index.html:54`, `:58`), which the old text called "the Related list". It already renders link rows first (`"your link"`, `reference/view.ts:285-291`) through a private `linksOf` (`:312-316`), without de-duplication [R12].
  - Replace both the existing link rows and `linksOf` with `linkedFirst(S.related, store.linksFor(focus), focus)`.
  - A "Linked by you" group comes first. It holds every linked reference, with its `why` and its score shown small, or "not related by technique" when there is none. Then come the scored references, with the linked ones removed, so no reference appears twice. Links never change a score.
  - **"Always shown"** [R13]: the "Linked by you" group stays while a technique filter is on (today `reference/view.ts:286-287` hides links under a filter), and under board scope (Task 5). Only the scored rows filter.
- New tiles follow the "no new inline `style=`" rule: `tileBox` plus `style.setProperty` [R26].

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
    - The Ranked pane renders the "Linked by you" heading before the first scored row, and a linked reference that also scores appears once.
    - With a technique filter on, the "Linked by you" rows are still there.
    - A links-only `Change` re-renders the Links tab.
    - Deleting a link row calls `removeLink(L1)`.
    - `link_handle_pointer_drag`:
      - Dispatch `pointerdown` on the handle, `pointermove`, then `pointerup` over a `[data-ref-id="B"]` tile, with `elementFromPoint` stubbed. The editor opens with `toRef: "B"`.
      - The same sequence ending over empty space opens nothing.
      - With a spy on `EventTarget.prototype.addEventListener` installed before mount, no `dragstart` listener is registered [C30].

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- links` and `npm test -- reference`. They should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): draw, edit and delete links with a why note, listed first`.

---

### Task 5: Boards (the view, membership, scope and export)

**Files:**
- Create: `app/src/boards/view.ts`, `app/src/boards/menu.ts` and `app/src/boards/status.ts` [R16].
- Modify:
  - `app/index.html`: add `<section class="graph-host" data-view-host="boards">` beside the other hosts (`index.html:63-66`), and a `<span id="board-scope">` in the footer (`index.html:68-79`). The Boards tab already exists (`index.html:19`), and `register()` enables it (`views.ts:54-59`) [R15];
  - `app/src/firstrun.ts`: `shell.register("boards", …)` and the status wiring in `boot()` [R15, R16];
  - `app/src/reference/view.ts`, to add the "Boards" section to the inspector and apply the scope;
  - `app/src/views/tree.ts` and `app/src/views/galaxy.ts`, for the scope items Plan 3 deferred [R17];
  - `app/src/styles.css`: append a "Plan 4 Task 5" section, including `body[data-view="boards"] > [data-view-host="boards"]` (see `styles.css:300-304`) [R15, R25];
  - **opener** [B3]: `app/src-tauri/Cargo.toml` (`tauri-plugin-opener`), `app/package.json` (`@tauri-apps/plugin-opener`), `app/src-tauri/src/lib.rs` (`.plugin(tauri_plugin_opener::init())`) and `app/src-tauri/capabilities/default.json` (add only `opener:allow-reveal-item-in-dir`);
  - `app/src/api.ts` (`revealFolder`), `app/src/api.contract.test.ts` (`NON_IPC_KEYS`), and the typed `Api` fakes in `firstrun.test.ts` and `reference/view.test.ts`.
- Test: `app/src/boards/view.test.ts`, `app/src/boards/menu.test.ts`, `app/src/boards/status.test.ts`, and new cases in `app/src/reference/view.test.ts`, `app/src/views/tree.test.ts` and `app/src/views/galaxy.test.ts`.

**Interfaces:**
- Consumes Task 3's board commands and `exportBoard`, `store.scope`, `setScope` and `inScope`, `api.pickFolder` [R18], `mountWindowedGrid` [C4] and `noticeIn` [C17].
- Registration: in `boot()`, `shell.register("boards", () => mountBoards(host, api, store, { openReference: shell.openReference }))`, where `"boards"` is already a `ViewId` [R15].
- Produces:
  ```ts
  export function mountBoards(root: HTMLElement, api: Api, store: Store, deps: { openReference(id: string): void }): ViewHandle;   // [R15]
  export function mountBoardMenu(anchor: HTMLElement, api: Api, store: Store, refId: string): { close(): void };
  export function moveItem(ids: string[], from: number, to: number): string[];   // pure reorder
  export function mountScopeStatus(el: HTMLElement, store: Store): () => void;   // boards/status.ts [R16]
  ```
- **The board menu**, opened with `b` in the Reference view or from the inspector's "Boards" section:
  - lists the boards with a checkbox each; ticking or unticking calls `setBoardMembers` with the reference appended or removed;
  - ends with "New board…", which creates a board containing this reference.
  - `BoardNameTaken:<id>` maps to "A board called <name> already exists.", and `EmptyName` to "Give the board a name." [R2].
- **The Boards view:**
  - shows a list of boards with their counts, and the selected board's grid of `thumb256` tiles at their true aspect ratio;
  - offers Rename, which edits inline, and Delete, which asks for confirmation and can be undone;
  - lets tiles be reordered by drag, or by Alt+← and Alt+→ on a focused tile. Each move makes one `setBoardMembers` call with `moveItem`'s result.
    - The drag uses **pointer events**, like the link handle in Task 4: a ghost tile follows the pointer, the insertion index comes from the tile under it, and the move is committed on `pointerup`. HTML5 DnD is never used (audit #2).
  - renders the grid with `loading="lazy"` and `decoding="async"` images at a fixed tile size, through `mountWindowedGrid` (`grid/windowed.ts:5`, whose header already says "Plan 4 reuses this") (audit #16) [C4];
  - offers "Remove from board", and "Open", which calls `deps.openReference(id)`.
- **"Show only this board":**
  - `setScope(boardId)`. `mountScopeStatus`, wired in `boot()` to `#board-scope`, reads "Board: <name> · N references · Show all". On `scopeCleared` it reads "Board removed — showing all references" [R16].
  - The Reference view's scored Ranked rows and search reference results keep only references for which `inScope` is true. Search filters through the existing `referenceTitle` hook, returning `undefined` for an out-of-scope id (`search.ts:47` drops it) [C17].
  - The "Linked by you" group stays, and each out-of-board row in it carries "Not on this board" (SPEC §4 "always shown") [R13].
  - A focused reference outside the board shows the chip "Not on this board" (Review Focus 5).
  - **Plan 3's graph views** see the scope through `storeSource` (Task 3, R8). Plan 3 already refuses `select` of a dim reference in the Tree and Radial (`tree.ts:193`, `radial.ts:219`) and dims out-of-scope nodes and edges. The three items Plan 3 deferred to "Plan 4, board scope" are closed here, because SPEC §2 says "filter the view to that board" [R17]:
    - **T6 M2:** `tree.ts:97-98` also clears `sel` when the selected reference falls out of scope, not only when it is gone.
    - **T6 M3:** the Tree's arrow keys (`tree.ts:209-211`) step past refused (out-of-scope) ids in the same direction, instead of stopping.
    - **T7 M10:** the Galaxy inspector rows list only `inScope` neighbours (`galaxy.ts:113`), and `select()` refuses out-of-scope ids (`galaxy.ts:122`, `:296-298`).
- **"Export board to folder…"** calls `api.pickFolder("Export board to folder")` [R18], then `exportBoard`. A toast through `noticeIn` [C17] then reads "Exported N to <folder>", where N is `report.written.length`, which counts images only [R21]. If anything was skipped, it adds "· M skipped" with an expandable list of the reasons. "Open folder" calls a new `api.revealFolder(path)`, which wraps the opener plugin's `revealItemInDir` [B3]. Like `pickFolder`, it is a plugin call, so it goes into `NON_IPC_KEYS` in `api.contract.test.ts:15`, and the two typed `Api` fakes (`firstrun.test.ts`, `reference/view.test.ts`) gain it.
- New tiles follow the "no new inline `style=`" rule [R26].

- [ ] **Step 1: Write the failing tests**
  - `moveItem(["a","b","c"], 0, 2)` gives `["b","c","a"]`, and out-of-range indices return the input unchanged.
  - Menu:
    - Ticking "Harbour" for `r3` calls `setBoardMembers(harbourId, [...members, "r3"])`.
    - "New board…" with the name "Ships" calls `createBoard("Ships", ["r3"])`.
    - A `BoardNameTaken:<id>` error shows "A board called Ships already exists." and keeps the menu open.
  - Boards view:
    - `mountBoards` returns a `ViewHandle`, with `show`, `hide` and `destroy`.
    - Alt+→ on tile 1 calls `setBoardMembers` with tiles 1 and 2 swapped.
    - `tile_pointer_reorder`: `pointerdown` on tile 1, `pointermove`, then `pointerup` over tile 3 calls `setBoardMembers` once with `moveItem(ids, 0, 2)`. A `pointercancel` calls nothing.
    - With 2,000 board members, the grid creates at most 200 `<img>` elements.
    - "Show only this board" sets `store.scope`.
    - "Open" calls `deps.openReference(id)`.
  - Status (`boards/status.test.ts`):
    - With a scope set, it reads "Board: Harbour · 10 references · Show all".
    - Delete, after confirmation, calls `deleteBoard`. When the deleted board was the scope, the status then reads "Board removed — showing all references".
  - Reference view, under scope:
    - Ranked and search hits hold only members.
    - A linked non-member stays in "Linked by you" with "Not on this board".
    - A focused non-member shows the "Not on this board" chip.
  - Graph views [R17], one test each:
    - Tree: a selected reference that falls out of scope is deselected.
    - Tree: an arrow key steps over an out-of-scope reference to the next in-scope one.
    - Galaxy: the inspector lists no out-of-scope neighbour, and `select` of an out-of-scope id does nothing.
  - Export:
    - An `Api` fake whose `pickFolder` returns `"D:/out"` makes the view call `exportBoard(id, "D:/out")` [R18].
    - A `pickFolder` that returns `null` (cancelled) calls nothing.
    - A report with 10 images and `credits: "credits.txt"` reads "Exported 10 to …" [R21].
    - A report with 1 skipped shows "· 1 skipped".
    - "Open folder" calls `api.revealFolder("D:/out")`.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- boards`, `npm test -- reference`, `npm test -- views`, then the full `npm test`, `npm run build` and `cargo clippy --all-targets -- -D warnings` (because of the opener plugin). All should FAIL first where new, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): boards with membership, show-only scope, reorder and export`.

---

### Task 6: The full lightbox (zoom, pan, region overlays, full resolution)

**Files:**
- Create: `app/src/lightbox/zoom.ts`. This is deliberately separate from Plan 3's `graph/camera.ts`, which has different clamps and conventions (audit #20). Its fit function is named `fitView`, so it can't clash with the local `const fit` at `lightbox/view.ts:56` [C20].
- Modify:
  - `app/src/lightbox/view.ts` (Plan 2 Task 10). Extend it in place; keep `openLightbox` and its `deps`, and keep the `.lb-side` slot, which the Reference view docks the picker into (`reference/view.ts:580-581`) [C22];
  - `app/src/styles.css` (append a "Plan 4 Task 6" section) [R25].
- Test:
  - `app/src/lightbox/zoom.test.ts`;
  - new cases in `app/src/lightbox/regions.test.ts`;
  - `app/src/lightbox/view.test.ts`: new cases, plus the one rewrite below [B4, C19].

**Interfaces:**
- Consumes `openLightbox(api, store, refId, deps)` (`lightbox/view.ts:21-26`), `normRect` and `MIN_REGION` (`lightbox/regions.ts`) [C7], the picker hand-off (Plan 2 Task 10), and `api.lightboxSource` (Task 3).
- **The source swap** [B4, C9]: the lightbox calls `api.lightboxSource(refId)` where it called `api.imagePath(refId)` (`lightbox/view.ts:230-237`). On `Err`, it keeps `thumb1024` and shows the preview note (Review Focus 3, R10).
- Produces:
  ```ts
  export type View = { scale: number; tx: number; ty: number };       // image px -> stage px: x' = x*scale + tx
  export const MAX_ZOOM = 8;                                          // 800 %
  export function fitView(img: { w: number; h: number }, vp: { w: number; h: number }): View;   // letterboxed, centred
  export function zoomAt(v: View, factor: number, pt: { x: number; y: number }, min: number): View;  // keeps image point under pt fixed; clamps scale to [min, MAX_ZOOM]
  export function panBy(v: View, dx: number, dy: number, img: { w: number; h: number }, vp: { w: number; h: number }): View;  // never pans the image fully off-screen
  export function plateOf(v: View, img: { w: number; h: number }): Box;   // in stage px
  export function hitRegion(regions: { tagId: string; region: Region }[], pt: { x: number; y: number }, plate: Box): string | null;  // smallest region under pt
  ```
  - `plateOf` returns stage px, but `normRect` takes client px. The caller adds the stage's client offset (`getBoundingClientRect()`) before `normRect` [C21].
- Controls:
  - **Zoom:** the mouse wheel and trackpad pinch zoom at the cursor. `+` and `-` zoom at the centre, `0` fits the image, and `1` shows 100%, where one image pixel is one CSS pixel.
  - **Pan:** Space+drag or middle-drag.
  - **Arrow keys** [R19]: an arrow key edits the region draft whenever one exists. With no draft, it pans by 10% of the viewport while zoomed in past fit. At fit, it starts the centred draft, as in Plan 2 (`lightbox/view.ts:163-172`). Enter still starts a draft at any zoom. Plan 2's key tests, which run at fit, stay unchanged.
  - **A plain drag still draws a region,** as in Plan 2.
- **Region overlays:** every region tag is outlined. Hovering over one, or Tab focusing it, highlights it with its label, "Stand out › Rim light". The smallest region under the pointer wins. `o` toggles the overlays.
  - The outline stroke is `opInk(store.tax, tag.operationId).base`. This part already holds on main (`lightbox/view.ts:85`) [C29].
  - The label is `opLabel(...).plain`, then ` › `, then the technique name, with the operation part in `.text`.
  - An unknown operation draws in the neutral ink, never amber.
- `v` toggles the value view, as before.
- When `full` is false, or `lightboxSource` failed, the corner shows "Showing a preview — this format can't be shown at full size here." (Review Focus 3).
- The toolbar shows the zoom percentage and the source size, such as "4000 × 3000".
- The lightbox opens with `l`/`L` or the `.lb-open` button (`reference/view.ts:508`, `:596`), as in Plan 2, and from Compare (Task 7) [C8].
- Zoom and pan positions go through the CSSOM, with no new inline `style=` [R26].

- [ ] **Step 1: Write the failing tests**
  - `fitView({w: 4000, h: 3000}, {w: 800, h: 800})` gives `{scale: 0.2, tx: 0, ty: 100}`.
  - `zoomAt(fitV, 2, {x: 400, y: 400}, 0.2)`: the image point under (400, 400) maps back to (400, 400). The scale clamps at `MAX_ZOOM` and never drops below `min`.
  - `panBy` can't move `tx` so far that the image leaves the viewport.
  - **Region under zoom, with literal numbers** [R20]: take a 1000×750 image in an 800×800 stage, with the stage at client (0, 0).
    - Zoomed in at `{scale: 1.6, tx: -200, ty: -150}`, a drag from (200, 250) to (520, 490) gives exactly `{x: 0.25, y: 1/3, w: 0.2, h: 0.2}`, within 1e-9.
    - At fit, `{scale: 0.8, tx: 0, ty: 100}`, the same image rectangle is the drag from (200, 300) to (360, 420), and it gives the same literal region.
  - `hitRegion`: with a large region containing a small one, a point inside both returns the small one's `tagId`.
  - `view`:
    - With `lightboxSource` returning `full: false`, the preview copy is visible.
    - With `lightboxSource` rejecting, `thumb1024` stays and the preview copy is visible.
    - `o` hides the overlays.
    - `1` sets the scale to 1.
    - An arrow key with no draft while zoomed in pans and starts no draft; the same key at fit starts the centred draft.
    - `overlay_ink_from_taxonomy`: a region tag under an added operation with `color: "teal"` is stroked `var(--x-teal)`, and one under an id missing from the taxonomy is stroked `var(--ink-2)` (both already green). The new part: a renamed `plainLabel` shows in the hover label [C29].
  - **Rewrite** `full_image_from_imagePath_with_thumb_fallback` (`lightbox/view.test.ts:286-325`) for `lightboxSource`, keeping its three cases: the full original, a rejection (the thumbnail stays), and a late reply after close. Every other Plan 2 lightbox test stays unchanged [B4].

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- lightbox`. It should FAIL, then PASS. All Plan 2 lightbox tests other than the rewritten one pass unchanged.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): full lightbox with zoom, pan, hover region overlays and preview fallback`.

---

### Task 7: The Compare view

**Files:**
- Create: `app/src/compare/view.ts` and `app/src/compare/sides.ts`.
- Modify:
  - `app/src/reference/view.ts`, for Shift-click and Shift+Enter, the `openCompare` opt, the keydown guard and the switch to the docking helper [R23, R24];
  - create `app/src/lightbox/dock.ts`, the lifted docking helper; `lightbox/view.ts` itself is unchanged [R23];
  - `app/src/firstrun.ts`, where `boot()` builds `makeOpenCompare` and passes it to `mountGalaxy` (`firstrun.ts:63`) [R22];
  - `app/src/styles.css` (append a "Plan 4 Task 7" section) [R25].
- Test: `app/src/compare/sides.test.ts`, `app/src/compare/view.test.ts`, and new cases in `app/src/reference/view.test.ts` [C23] and `app/src/firstrun.test.ts` (the wiring).

**Interfaces:**
- Consumes `api.scorePair` (Task 3), `tileBox` (Plan 1 Task 8), `mountLinkEditor` (Task 4) and `openLightbox` (Task 6).
- **One docking helper** [R23]: read `reference/view.ts:570-600` first. Lift the picker-docking closure out of `openLb` into a new `app/src/lightbox/dock.ts`:
  ```ts
  export function openLightboxWithPicker(api: Api, store: Store, refId: string,
    deps: { beforePicker?(): void; onClose?(): void }): { close(): void };
  ```
  - It calls `openLightbox` with an `openPicker` that mounts the picker into `.lightbox .lb-side`, and keeps that picker itself, never nulling a newer one.
  - It closes that picker when the lightbox closes.
  - The Reference view passes `beforePicker: closePicker`, so its margin picker closes first. Its own `picker` variable no longer tracks the docked one.
  - Both the Reference view and Compare call it; nothing copies the closure.
- Produces:
  ```ts
  export type Sides = { shared: string[]; onlyA: string[]; onlyB: string[]; partialA: string[]; partialB: string[] };   // technique ids; partial = operation ids
  export function sides(a: Reference, b: Reference, sharedTechniques: string[], tax: Taxonomy): Sides;   // regions collapse; order = tax.techniques order
  export function mountCompare(root: HTMLElement, api: Api, store: Store, a: string, b: string,
    deps: { showReference(id: string): void; onClose?(a: string): void }): { swap(): void; close(): void };
  export function makeOpenCompare(root: HTMLElement, api: Api, store: Store,
    deps: { showReference(id: string): void }): (a: string, b: string, opts?: { onClose?(a: string): void }) => void;
  ```
- **Wiring in `firstrun.ts` `boot()`** [R22, R24]. There is exactly one `openCompare`, so "only ever one Compare" holds for every caller:
  ```ts
  const openCompare = makeOpenCompare(root, api, store, { showReference: (id) => { shell.select("reference"); view.show(id); } });
  // mountReference gains `openCompare` in its opts (today { onNavigate }); Shift-click and Shift+Enter call it with no onClose.
  // mountGalaxy's dep stays exactly Plan 3's `openCompare?(a: string, b: string): void` (galaxy.ts:29; item 10):
  //   openCompare: (a, b) => openCompare(a, b, { onClose: () => shell.select("galaxy") })
  ```
  `view` must exist before `openCompare` is first called. `boot()` either builds `openCompare` before `mountReference` with a closure over `view`, or passes the Reference view a thin forwarder.
- **Opening it:** Shift-click a second reference in Ranked, a callout thumbnail or the Links tab, or press Shift+Enter on a focused row (which arrives as a click with `shiftKey` on the row). Compare opens on the focused reference (A) and that one (B) [C23].
  - The Galaxy's Shift-click calls `openCompare`. The Tree and Radial have no Compare entry in this plan; that half of audit #25 is recorded as deferred [C26].
- **Modality** [R24]: Compare is a modal dialog, like the lightbox: `role="dialog"`, `aria-modal="true"`, its own keydown and a focus trap. The Reference view's document keydown (`reference/view.ts:487-518`) also returns while Compare is open: beside `if (lightbox) return;`, it checks `document.querySelector('.compare[aria-modal="true"]')`, the same kind of DOM check `openLb` uses for `.lightbox`. So its `v`, Esc, `l`, `t` and digit keys don't fire under Compare. The Galaxy's keys are behind the modal too.
- **Layout:**
  - A sits on the left and B on the right, both large. They use `thumb1024`, letterboxed on the N5 tile.
  - The middle column, "Shared", lists `scored.sharedTechniques`.
  - Under it, "Same operation × domain" lists `scored.sharedBranches` that have no shared technique.
  - Each side lists its own unique techniques under "Only here", and then its partial tags under "Operation only".
  - Hovering a technique outlines its region on whichever image carries it, if it is a region tag (ruling a1). The outline and the technique's operation path use `opInk` and `opLabel` (Global Constraints).
  - **Entry from the graph views:** `makeOpenCompare` returns the function Plan 3's Galaxy calls on Shift-click. Calling it closes any open Compare first, so there is only ever one, and then mounts a new one.
    - **Esc** calls the per-call `opts.onClose(a)` when it is given; the Galaxy's returns to the Galaxy.
    - Without it, Esc calls `deps.showReference(a)`, which `boot()` wires to the Reference view [R24].
  - The score shows small, with the wording "related by technique", or "not related by technique" when the score is 0.
  - If A and B are linked, their link's `why` shows at the top, marked "Linked by you". Links never change the score.
- **Keys:** `v` toggles the value view on both images, `x` swaps the sides, and `L` opens the lightbox on the side under the pointer, through `openLightboxWithPicker`. Esc returns as above. "Link these two" opens the link editor.
- When Compare is open, the scope is ignored: comparing is always explicit.
- Plates and outlines go through `tileBox` and the CSSOM, with no new inline `style=` [R26].

- [ ] **Step 1: Write the failing tests**
  - `sides`:
    - With A having t1, t2 and partial `infer`, B having t2 and t3, and shared `[t2]`, the result is `shared: [t2]`, `onlyA: [t1]`, `onlyB: [t3]`, `partialA: ["infer"]` and `partialB: []`.
    - Two region tags of t1 on A count once.
    - With a taxonomy order of t3, t1, t2, `onlyA` and `onlyB` follow that order, not the tag order.
  - `reference/view.test.ts` [C23]:
    - Shift-click on a Ranked tile calls `openCompare` with (A, B), which calls `scorePair(A, B)` and renders three columns.
    - With Compare open, `v` and Esc reach Compare only; the Reference view's handlers don't fire.
    - The Reference view's lightbox still docks the picker after the helper is lifted, and the margin picker closes first.
  - `compare/view.test.ts`:
    - `open_compare_from_galaxy`: `makeOpenCompare(root, api, store, deps)("a", "b")` calls `scorePair("a", "b")` and mounts one Compare. A second call replaces it, so there is still only one.
    - `firstrun.test.ts`: the Galaxy's `openCompare` wrapper passes an `onClose` that selects the Galaxy, and the Reference view's Shift-click passes none.
    - `compare_ink_from_taxonomy`: a shared technique under an operation with `color: "rose"` renders its path in `var(--x-rose-text)`.
    - `x` swaps the titles.
    - `v` toggles the value class on both plates.
    - Esc calls `deps.showReference(A)` when the call had no `onClose`, and the call's `onClose(A)` when it had one.
    - The dialog has `role="dialog"` and `aria-modal="true"`, and Tab stays inside it.
    - With a link A–B in the store, its `why` renders above "Shared".
    - The score text for a 0 score is "not related by technique".

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- compare`, `npm test -- reference`, `npm test -- lightbox` and `npm test -- firstrun`, then `npm run build`. They should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): compare two references by shared and unique techniques`.

---

### Task 8: The end-to-end check (Brief and Study)

- [ ] **Step 1: Run the full suites.** Run `cargo test`, `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm test` and `npm run build`. Expected: all pass, with no warnings.

- [ ] **Step 2: Manual run.** Run `npm run tauri dev` on the demo library. Expected results:
  1. Press `b` on 10 references and add them to the new board "Harbour".
  2. In Boards, reorder two tiles with Alt+→, then press Ctrl+Z. The order goes back.
  3. Turn on "Show only this board". Ranked and search show only board members, and the status line reads "Board: Harbour · 10 references · Show all".
  4. Export the board to an empty folder outside the library, such as `E:\D drive files\Design Second Brain\Export test\` (the project's real drive; `D:` is a `subst` of it) [C24]. There are 10 files named `01 - …` to `10 - …`, plus `credits.txt` with 10 blocks in the same order. The toast reads "Exported 10 to …". The file opens cleanly in Notepad and TextEdit, with no stray characters at the start. Export again: 10 more files with ` (2)` names, a `credits (2).txt`, and nothing overwritten. Drag the folder into PureRef; the images appear in board order. "Open folder" shows the folder in the file manager.
  5. Open the lightbox on a demo poster:
     - zoom to 400% at the cursor, then pan with Space+drag;
     - hover a region outline, and its label appears;
     - draw a new region at 400% zoom and tag it. The new outline sits exactly where it was drawn, both when fitted and at 100%.
  6. Shift-click a related reference. Compare shows the shared techniques in the middle. Press "Link these two", type a "why" and save. The Reference view's Ranked list now starts with "Linked by you".
  7. Undo, one Ctrl+Z per step, in reverse order: the first removes the link, the second removes the region tag, and the third undoes the last board change (the Alt+→ reorder from step 2 was already undone, so it is the last membership add from step 1) [C25].
  8. Edit a link's note, quit within 0.5 s (before the debounced save), relaunch, and the new note is there [B2].
  9. **At scale** [C27]: on the 2,500-reference perf library (`scripts/make_perf_library.py`, see `app/README.md` "Performance check"), make a board of 2,000 references with one `create_board` call over CDP (`window.__TAURI_INTERNALS__.invoke("create_board", { name, referenceIds })`, the way `docs/superpowers/qa/plan3-perf.js` drives the release perf build), and open it in Boards. Count the `<img>` elements in the grid (at most 200), and note what is on screen while scrolling. If the perf build can't be run, write "not measured".
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

## Recorded exceptions and deferrals (amendment, 2026-11-26)

- **`tauri-plugin-opener`** comes back in Task 5, as the one exception to "no new crates or npm packages", with only `opener:allow-reveal-item-in-dir` granted [B3].
- **Metadata editing** (title, creator, year, credit) stays out of v1; `credits.txt` prints what the library holds. Audit #23 is closed on that basis [R27]. *This is a scope call for the user to confirm.*
- **`EditError::UnknownTag` for taxonomy items** is deferred again, to Plan 6's copy pass, because remapping it changes error text and Task 0 is a pure move [B1].
- **Compare from the Tree and Radial** (audit #25, second half) is deferred; only the Galaxy has the entry [C26].
