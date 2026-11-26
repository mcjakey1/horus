# Task 5a report: Boards (the view, membership, scope, status, export, opener)

Implementer -59, 2026-11-26. Branch `p4-t5a` from `41163c7`. Per the split ruling, the three graph-scope items [R17] are T5b's (-4d); `views/tree.ts` and `views/galaxy.ts` are untouched.

**Commit:** `74a5d3d` feat(ui): boards with membership, show-only scope, reorder and export.

## Files

- **New:**
  - `app/src/boards/view.ts`, `menu.ts` and `status.ts`;
  - tests: `view.test.ts`, `menu.test.ts` and `status.test.ts`;
  - `boards.test-util.ts`, the shared fixtures.
- **Changed:**
  - `app/index.html`: the `data-view-host="boards"` section, and `#board-scope` (`role="status"`, hidden) in the footer.
  - `app/src/firstrun.ts`: `shell.register("boards", …)` and `mountScopeStatus` in `boot()`; it is unwired in `destroy`.
  - `app/src/reference/view.ts`: the scope filters, the "Not on this board" chip and note, and the `b` key with a "Boards…" button.
  - `app/src/styles.css`: one appended section, "Plan 4 Task 5: boards", which includes `body[data-view="boards"] > [data-view-host="boards"]`.
  - `app/src/api.ts`: `revealFolder`.
  - `app/src/api.contract.test.ts`: `NON_IPC_KEYS` gains `revealFolder`.
  - The typed fakes in `firstrun.test.ts` and `reference/view.test.ts`.
- **Opener (B3):**
  - `package.json` and its lock gain `@tauri-apps/plugin-opener ^2.7.3`.
  - `Cargo.toml` gains `tauri-plugin-opener = "2"`. `Cargo.lock` grows by 457 lines, the plugin's own dependency tree.
  - `lib.rs` adds `.plugin(tauri_plugin_opener::init())`.
  - `capabilities/default.json` adds only `opener:allow-reveal-item-in-dir`.
  - A new Rust test, `capability_grants_opener_reveal_only`, pins it: the only `opener:` permission is that one.

## Behaviour, against the carry-ins

- **(a) B3:**
  - `api.revealFolder(path)` wraps the plugin's `revealItemInDir(path)`, and the view always passes the export `dest`.
  - **For T8:** `revealItemInDir` on a folder opens its *parent* with the folder selected; it doesn't open inside it. Check by hand that this reads right as "Open folder".
- **(b) Export copy:**
  - The toast says "Exported N to <folder>", where N is `written.length` (images only).
  - When something was skipped, it adds "· M skipped" with an expandable "Why some were skipped" list of `<title>: <reason>`.
  - Skip reasons are mapped, never raw:
    - "it is no longer in the library.";
    - "the original file is missing.";
    - "it couldn't be copied to that folder."
  - `credits: null` adds " · credits.txt was not written".
  - A refusal of exactly "Choose a folder outside the library." is shown as is; any other export error shows "Horus couldn't write to that folder. Choose another."
- **(c) Board wire codes** go through `boardErrorCopy`:
  - `BoardNameTaken:<id>` gives "A board called <name> already exists.", with the existing board's name, or the typed one if the id is gone;
  - `EmptyName` gives "Give the board a name.";
  - `UnknownBoard:` gives "That board is gone. It may have been undone.";
  - anything else gives "That change didn't save. Try again."
- **(d) Unknown ids:** the board grid, the list counts and the status count skip member ids that aren't in `store.refs`. "Remove from board" also drops unknown ids from the list it sends.
- **(e) Pointer-only reorder:**
  - `pointerdown` on a tile (not on its buttons) arms the drag, and `setPointerCapture?.` captures the pointer.
  - After a 4 px threshold, a `.bd-ghost` follows the pointer through CSSOM vars.
  - `pointerup` takes `elementFromPoint(...).closest(".bd-tile")` as the insertion index, and makes one `setBoardMembers` call with `moveItem`'s result. `pointercancel` aborts.
  - Alt+← and Alt+→ on a focused tile do the same, and focus follows the moved tile once the Change lands.
- **(f) CSS:** no new inline `style=`. The grid is `mountWindowedGrid`, so only `.wg-*` wrappers carry CSSOM vars, and a test pins "no `[style]`" elsewhere in the grid. Tiles letterbox with `object-fit: contain` on the N5 card, as the Inbox does, at their true aspect ratio.
- **(g) Review Focus 5:**
  - Deleting the scoped board clears the scope through the store's `scopeCleared`, and `#board-scope` then reads "Board removed — showing all references". It keeps that until the scope changes again.
  - A focused non-member stays focused, with a "Not on this board" chip on the plate (`#lab .off-board`).
- **Scope in the Reference view:**
  - Ranked's scored rows and the filter list keep only `inScope` ids, and the "N related" note counts them.
  - "Linked by you" keeps every link, each out-of-board row marked "Not on this board" [R13].
  - Search reference hits go through `referenceTitle`, which returns `undefined` out of scope.
- **Board menu:**
  - It opens with `b`, or with a new "Boards…" button at the bottom left of the plate. The tag, lightbox and link buttons take the other corners.
  - It docks at the top of `.margin`, one panel at a time with the picker and the link editor.
  - Each checkbox gives one `setBoardMembers` call: append on tick, remove on untick. "New board…" reveals a name field, and Enter or Create calls `createBoard(name, [ref])`.
  - Errors keep the menu open. Esc and Close close it.
- **Boards view:**
  - The board list shows counts; the first board is selected by default, or the next one after a delete.
  - The actions are "Show only this board" (`aria-pressed`, and a second press clears it), Rename (inline; Enter saves, Esc cancels, errors keep the field), "Export board to folder…" and Delete.
  - Delete uses an inline confirm ("Delete <name>? You can undo this."), not `window.confirm`. It is one undo step.
  - Each tile offers Open (`deps.openReference`) and "Remove from board", shown on hover or focus.

## Tests

- **Vitest:** 557 of 557 in 43 files. The baseline at `41163c7` was 523, so this adds 34.
  - `boards/view.test.ts`: 20 tests;
  - `boards/menu.test.ts`: 6;
  - `boards/status.test.ts`: 4;
  - `reference/view.test.ts`: 4 new tests, covering the scope, search, the chip, and `b` with "Boards…".
- **Rust:** `cargo test` gives 261 passed, 2 ignored and 1 doctest; it adds the one capability test. `clippy --all-targets -D warnings` is clean, and so is `fmt --check`.
- **Build:** `tsc --noEmit` is clean, and `npm run build` is OK.
- **Order of work (stated plainly):** I wrote the Boards test files before their modules, but ran them only after implementing. So beyond "module not found", I didn't watch each one fail first. The four Reference-view scope tests were written after the code. All of them exercise behaviour that didn't exist at the base commit.

## Not verified (for T8 and QA)

- **The real WebView2:** `setPointerCapture`, the ghost, and drag-reordering a windowed grid while it scrolls. The tests use `MouseEvent`s typed as pointer events.
- **`revealItemInDir` behaviour** on Windows, macOS and Linux (see carry-in a above).
- **The Boards layout** at 1280×800, and the hover-only tile tools on touch.

## Choices (for your ruling)

1. Delete uses an **inline confirm** in the view, not `window.confirm`, which may not show in the Tauri WebView.
2. The "Boards section" of the Reference view is a **"Boards…" button** on the plate that opens the menu. There is no persistent membership list in the margin.
3. **Skip-reason mapping** keys on T2's English prefixes. If T2's wording changes, the fallback is "it couldn't be copied to that folder."
4. The **"Board removed" note** stays in the footer until the next scope change; it has no timer.
5. The **opener crate's dependency tree** adds 457 lines to `Cargo.lock`.

## Fix round 1/5

**Commit:** `09a790f` fix(ui): boards fix round 1. The 7 new tests were run red first: all 7 failed, then passed after the fix.

- **C1: board Changes now reach the Reference view.** `touchesFocus` also returns true on `c.scopeCleared` and on `c.boards` while a scope is set.
  - Deleting the scoped board, or undoing its creation, now restores Ranked and hides the chip. So does adding the focus to the scoped board.
  - Tests: two cases that go through `store.apply`, not `setScope`.
- **I1: tile images can't start a native drag.** Each tile image has `draggable="false"`, and CSS adds `-webkit-user-drag: none`, following `lightbox/view.ts:50` and `styles.css:353`. Test: the attribute is `false`.
- **I2: keyboard focus survives header re-renders.** `renderHead` restores focus to the control with the same `data-act`, or to a pending one.
  - Rename calls `focus()` before `select()`.
  - Esc, and a successful save, return focus to Rename.
  - Tests: "Show only this board" pressed from the keyboard keeps focus, and so does Rename through Esc and through a save.
- **I3: the delete prompt is bound to its board.**
  - The confirm button carries `data-board`, and `delete-yes` only acts when that matches the selected board.
  - `render()` clears the message whenever the selection changes.
  - Test: the prompt is shown, an undo removes Harbour, and the selection moves to Ships. The prompt is gone, and clicking the stale Harbour confirm deletes nothing.
- **S1: the margin shows which boards the focus is on.**
  - A line at the top of `.margin` reads "Boards: Harbour · Ships", or "Boards: On no board".
  - It updates on any board Change without refetching. "Boards…" and `b` stay the editor.
  - Test: "On no board", then two board names, leaving out a board the focus isn't on.
- **CSS:** three lines are appended inside the Task 5 section (at the end of the file): `.bd-tile img` and `.ref-boards`.

**Checks:** `tsc --noEmit` clean, `npm test` 564 of 564 in 43 files, `npm run build` OK. No Rust changes in this round.

**Minors:** deferred, as instructed. None were touched.
