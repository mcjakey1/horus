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

