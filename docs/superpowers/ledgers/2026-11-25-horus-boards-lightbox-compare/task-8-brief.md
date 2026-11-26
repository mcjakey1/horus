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
