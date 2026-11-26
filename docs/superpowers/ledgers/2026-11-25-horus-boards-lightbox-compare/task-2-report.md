# Task 2 report: the `export` module

Implementer -59, 2026-11-26. Branch `p4-t2` from `503f0d0`.

**Commits:**
- `1023898` feat(core): export a board to a folder without overwriting
- `2660e3e` test(core): export write-failure, all-skipped and unchanged-original cases

**Files:**
- `app/src-tauri/src/export.rs` (new).
- `app/src-tauri/src/lib.rs`: one line, `pub mod export;`, placed after `pub mod edit;`. No other `lib.rs` change; it is for you to hand-merge with Task 0.

## What it does

`export_board(root, board, refs, dest)` copies each member's original into `dest` as `<NN> - <title>.<ext>`, in board order.
- **Copying:** bytes only. It reads the original through `File::open` and `io::copy` into a `NamedTempFile::new_in(dest)`, then calls `sync_all` and `persist_noclobber`.
- **Originals:** never opened for writing (SPEC §9). A test compares their bytes before and after.
- **Numbering:** `NN` is the board position, zero-padded to the board's digit count. A missing member keeps its slot, so the numbers stay the board's.
- **Existing files:** `taken` is seeded once from `fs::read_dir(dest)` (lowercased) and grows with each name written. Nothing is ever overwritten.
- **Credits:** after the images, `credits.txt` (or `credits (2).txt` …) goes through the same no-clobber route. Its name goes into `credits`, not `written` [R21].

**Folder check:**
- `dest` and `root` are both canonicalised before the `starts_with` check, so case, `..` and the Windows `\\?\` prefix compare equal.
- A missing `dest`, a file in place of a folder, and a `dest` inside the library all return `Err("Choose a folder outside the library.")`. This follows the brief's "Otherwise" literally; see deviation 1.

**`safe_name`:** the brief's six rules, in order.
1. `< > : " / \ | ? *` and control characters become `_`.
2. The stem is cut to 120 chars.
3. Trailing dots and spaces are trimmed.
4. An empty stem becomes `untitled`.
5. A reserved stem gets a `_` prefix. Reserved means `CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9` or `LPT1`–`LPT9`, in any case.
6. ` (n)` is added while the name is taken.

**`credits_text`:**
- A header, then one block per written image. Header and blocks are separated by one blank line, and the text ends in exactly one `\n`.
- With no written image, the text is exactly `Horus board: <name>\n`.
- `\r` and `\n` become spaces in every value, including the board name and the file name.
- A missing field prints `—`, and so does a blank one (whitespace only); see deviation 4.
- The `note` field is never printed.
- It prints only what the library holds (R27).

**`ExportReport`:** `Serialize` with camelCase. `skipped` serialises as `[[id, reason], …]` [C14]; a test pins the JSON.

## Tests

- **Red first:** 17 tests, of which 15 failed against the stub.
  - The 2 that passed were `report_serialises_camel_case_with_tuple_arrays`, which tests only the struct shape, and `missing_dest_refused`, which then asserted only `is_err()`, and the stub returned `Err`.
  - The follow-up commit pins that test to the exact message.
- **Green:** 21 tests in `export::`. These are the brief's 12, plus 9 more:
  - `member_without_reference_skipped`;
  - `missing_dest_refused` (a missing folder, and a file);
  - `credits_flatten_cr_too`;
  - `credits_written_for_empty_export`;
  - `padding_follows_board_size` (`01 - …` on a 10-member board);
  - `write_failure_leaves_nothing`, where a failing write leaves no temp file;
  - `write_never_clobbers`, where a taken name is refused and the old bytes are unchanged, with no leftover file;
  - `blank_field_prints_dash`;
  - `all_skipped_board_writes_header_only`.
- **Checks:**
  - `cargo test` gives 228 passed and 2 ignored, plus 1 doctest. The baseline was 207, so this is 207 + 21.
  - `cargo clippy --all-targets -- -D warnings` is clean, and so is `cargo fmt --check`.
  - No TypeScript was touched.
- **Build:** I built in the existing `p3-t11` target dir with `CARGO_BUILD_JOBS=2`, because free memory was about 1.1 GB while Task 0 was building.

## Deviations and choices (for your ruling)

1. **One refusal message for a missing `dest` as well as one inside the library.** I took the brief's "Otherwise" literally. The wording fits "inside" better than "missing". If you'd rather have a separate missing-folder message, it is a one-line change (`export.rs:41`).
2. **A failed credits write gives `credits: None` and drops the reason.** The images stand. Nothing in `ExportReport` carries the reason. T5's toast could say "credits.txt was not written" when `credits` is `None`.
3. **Raw OS error text reaches the `skipped` reasons and some top-level errors.** Examples are "The original is missing or unreadable: <os error>" and "Could not save <name>: <os error>". T5 shows these reasons in its expandable list, so the copy may want mapping there.
4. **A blank field (whitespace only) prints `—`, like a missing one.** This goes slightly beyond the brief's "missing", and is tested.
5. **A `persist_noclobber` race** (a file appearing in `dest` after `read_dir`) skips that item with a reason. It does not retry with the next suffix.

## Not verified

- **Unix permissions:** `NamedTempFile` creates files with mode `0600` on Unix, and `persist` keeps the mode. Exported files on macOS and Linux would then be owner-only. Readable by the user, so PureRef works, but unusual for exported files. This is not tested on Windows. **Log it for Plan 6's cross-platform pass**; the fix is `#[cfg(unix)]` `set_permissions(0o644)` after the persist.
