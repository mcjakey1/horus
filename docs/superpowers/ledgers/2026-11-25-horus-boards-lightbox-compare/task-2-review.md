**Verdict: Approved.** No Critical or Important issues. Five Minor items, three of which are notes for T5 or Plan 6.

# Task 2 review: the `export` module

Reviewed: 503f0d0..2660e3e (p4-t2, commits 1023898 and 2660e3e). Checkout HEAD matches the package. I did not run the tests. The pass counts below come from the report. Line numbers refer to `export.rs` at 2660e3e.

### Spec Compliance
- ✅ Signatures match the brief: `export_board(root, &Board, &[Reference], &Path) -> Result<ExportReport, String>`, `safe_name(stem, ext, &HashSet<String>)` and `credits_text(&Board, &[(String, &Reference)])`. It takes no `&Library` [R4].
- ✅ `ExportReport` is `Serialize` with camelCase. `skipped` is `Vec<(String, String)>`, which serialises as `[[id, reason]]`, and a test pins the JSON [C14]. `credits` is kept apart from `written` [R21].
- ✅ Files are named `<NN> - <title>.<ext>`. NN is padded to the board's digit count, and a missing member keeps its slot, so positions stay the board's. `ext` comes from `Reference.file`, and only after `image_path_in` has checked it (`library.rs:185`: 2-5 of `[a-z0-9]`). So `ext` can never be empty and can't contain a separator or `..`.
- ✅ `taken` is seeded once from `read_dir(dest)`, lowercased, and grows with each name written. Credits are named after the images, so they see every image name.
- ✅ The `safe_name` rules run in the brief's order: replace bad characters, cut to 120 chars on a char boundary, trim trailing `.`/space, fall back to `untitled`, prefix `_` to a reserved name, then add ` (n)`.
- ✅ Each write goes through `NamedTempFile::new_in(dest)`, then `sync_all`, then `persist_noclobber`. On failure the temp file is dropped, including the `PersistError.file` dropped inside `map_err`, which deletes it. The item goes into `skipped` and the export carries on. `write_failure_leaves_nothing` and `write_never_clobbers` assert this on the real filesystem (not rerun).
- ✅ Originals are only opened with `File::open` (read-only) and copied with `io::copy`. Nothing is decoded. `exports_in_board_order` checks that each original is byte-identical before and after (SPEC §9).
- ✅ credits.txt is UTF-8 with no BOM and `\n` line endings. It has the exact header and block format, `—` for missing fields, `\r`/`\n` flattened in every field, and one final `\n`. With no written image it is `Horus board: <name>\n` and is still written [R3, C13]. It prints only stored fields, and `note` is never printed [R27].
- ✅ The dest check canonicalises both sides, then uses component-wise `Path::starts_with`, so `C:\Lib` is not taken as a prefix of `C:\Library2`. A missing dest or a file gives the brief's one message.
- ✅ `lib.rs` changes by one line, `pub mod export;`. No new crate: `tempfile = "3"` (3.27.0) was already in `[dependencies]`.
- ✅ All 11 tests the brief names are present and assert concrete values. There are 10 more, 21 in all; the report says "12 + 9" and leaves `report_serialises_camel_case_with_tuple_arrays` off its list of extras. Each can fail: exact names, byte equality, the exact directory listing (no leftover temp file), and exact error strings.
- ⚠️ Cannot verify from diff: that `cargo test` gives 228 passed and 2 ignored, and that clippy `-D warnings` and fmt are clean. These come from the report, and I did not rerun them.
- ⚠️ Cannot verify from diff: Unix behaviour (0600 mode, NFD names on macOS, the 255-byte name limit). The case-difference test only checks real behaviour on a case-insensitive filesystem; on Linux it passes because the path doesn't exist, and the test comment says so.

### Strengths
- **Never overwriting rests on the OS, not on `taken`.** `persist_noclobber` uses `MoveFileExW` without `REPLACE_EXISTING` on Windows, and `RENAME_NOREPLACE` or link/unlink on Unix. So any gap in `taken` can only cause a skip, never an overwrite. I checked this in the vendored `tempfile-3.27.0/src/file/imp/{windows,unix}.rs`. That covers a file created after `read_dir`, and names that `to_lowercase` and NTFS fold differently (for example Turkish `İ`, or NFC vs NFD on APFS).
- **The dest check is sound on Windows.** Per the std docs, `fs::canonicalize` there uses `GetFinalPathNameByHandle`, which resolves case, `..`, 8.3 short names, symlinks, junctions, SUBST drives and relative paths, and returns `\\?\` long-path form. Because the canonical dest is used for every later write, long paths work too.
- **Reserved names can't be reached through `export_board`.** Every stem starts with `NN - `, so it can never be `CON` or similar. The rule only matters for direct `safe_name` callers, and it is tested there.
- **The code is small and direct.** One `write_new` helper serves both the images and the credits file. There is no abstraction beyond that.

### Issues
#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)
1. **One message covers missing, unreadable and inside-the-library dests** (`export.rs:38-41`; implementer concern 1). This follows the brief literally. But if the folder was removed after it was picked, or a USB drive was unplugged, "Choose a folder outside the library." points the user the wrong way. `.ok()` also drops a permission-denied reason. I suggest a separate "That folder can't be found." for the canonicalize / `is_dir` failure. That is a one-line change and a small brief deviation; the controller rules on it. It is not a blocker, because the T3/T5 folder picker returns an existing folder.
2. **A failed credits write gives `credits: None` and drops the reason** (`export.rs:86`; concern 2). This is the one error whose text is discarded entirely, against "errors surfaced, not swallowed". The brief's interface allows it (`Option` means "when written"), and the images stand. The trade-off: carrying the reason needs an interface change, for example `credits_error: Option<String>`, and that is the controller's call. At minimum, T5 should say "credits.txt was not written" when `credits` is `None`.
3. **Raw OS error text reaches the `skipped` reasons** (concern 3). Example: "…unreadable: The system cannot find the file specified. (os error 2)". The prefix is user-facing and the OS detail is accurate. T5 should decide whether to show the detail, for example in its expandable list. No change is needed here.
4. **Whitespace-only fields print `—`** (concern 4). This is a sensible reading of "missing", it is tested, and it stays within R27, because nothing is invented. Accept it.
5. **Unix and cross-platform items, for Plan 6** (concern 5, plus two more):
   - (a) `NamedTempFile` creates files with mode 0600, and `persist` keeps it. Exports to a shared or synced folder would then be owner-only. Fix it with `#[cfg(unix)]` `set_permissions(0o644)` before the persist, or with `tempfile::Builder::permissions`.
   - (b) `MAX_STEM` counts chars, not bytes. On ext4, 120 CJK characters (about 360 bytes) go over the 255-byte name limit, so the item is skipped with an `ENAMETOOLONG` reason. That is safe but surprising. The brief specified chars, and Windows (255 UTF-16 units) is fine.
   - (c) On Unix, `persist_noclobber` falls back to `hard_link` + `unlink` when `RENAME_NOREPLACE` returns `EINVAL`. On a filesystem with no hard links, such as a FAT/exFAT USB stick on Linux, every item could then be skipped. That is safe but worth a check in Plan 6. Windows uses `MoveFileExW`, which is fine on FAT.
   - (d) There is no junction or symlink test. The code handles them through `canonicalize`, so this is only a missing test.

### Assessment
**Task quality:** Approved
**Reasoning:** The implementation matches the brief point for point. Its safety properties are sound and backed by real-filesystem tests: never overwriting rests on the OS no-clobber rename, the dest check canonicalises both sides, temp files are cleaned up, and originals are read-only. The open items are UX copy for T5 and Unix polish for Plan 6, not defects in this task.
