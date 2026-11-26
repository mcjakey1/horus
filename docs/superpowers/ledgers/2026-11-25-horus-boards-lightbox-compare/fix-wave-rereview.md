### Item Verdicts
- **Item 1: C1, board scope filters Ranked with no technique filter.** ADDRESSED. `reference/view.ts:302`: `scoredRows = list.filter((x) => !linkedIds.has(x.id))`, and `list` is scoped at :286.
  - **R13 holds under scope.** "Linked by you" (`mine`, :303-312) still comes from the unscoped `linksOf(ref)`. It is always concatenated (:328), and an off-board link gets "Not on this board" (:309).
  - **The count is right.** "N related" is `list.length` (:296), which counts in-scope related only. It still counts in-scope *linked* refs; that is the pre-existing T4 DEFER, not a regression.
  - **Same logic as before, plus the scope.** `rest` was `related` minus the linked refs (`links/editor.ts:20`), so the new expression only adds the scope.
  - **Test.** "C1: …" checks that `d` shows before the scope and is gone under scope `[a,b]`, and that the note reads "1 related". It is red against the old `rest`. "Under a technique filter, a linked match appears once" closes T4's dedupe gap.
- **Item 2: I1, `board_edit_survives_flush`.** ADDRESSED. `commands.rs:2681-2694`: `create_board`, then `close_decision == Close`, then `saved()["boards"]` holds 1 board with the right id and name. I ran it: `cargo test --lib board_edit_survives_flush`, 1 passed. That it fails without `|| touched.boards` is the implementer's check; re-running that needs a source edit, so I didn't.
- **Item 3: I2, the board menu keeps focus.** ADDRESSED. `boards/menu.ts:27-41`: `render(focusId?)` notes the focused `input[data-board]` before the `innerHTML` rewrite and refocuses it. It doesn't take focus when focus is elsewhere in the menu (the name field). Create calls `render(c.created)` (:75), and the error path re-renders and refocuses too (:63). The test is red on the old code.
- **Item 4: I3, Compare focus and keys.** ADDRESSED.
  - **(a) The editor keeps focus.** `compare/view.ts:90`: `inside = body.contains(document.activeElement)`. The dock sits outside `.cmp-body` (:50), so a store event no longer steals focus from the docked editor.
  - **(b) The forwarder.** :222-229 is a capture listener on `document`, gated on `closed || !el.isConnected || lightbox || isComposing || el.contains(t) || .lightbox/alertdialog/.notice`. It stops and prevents the original and re-dispatches it on `el`.
  - **Once only, and no loop.** `wireUndoKeys` is a bubble listener on `document` (`keys.ts:50`): the stopped original never reaches it, and the re-dispatch does, once. On the re-dispatch, `el.contains(t)` makes the forwarder return.
  - **Lightbox over Compare.**
    - `lightbox` is set synchronously in `openLb` (:155) and cleared by `onClose`, which `lightbox/view.ts:339` always calls.
    - While it is set, Compare's forwarder stands down. The lightbox's own forwarder (`lightbox/view.ts:305-311`) handles `<body>` keys.
    - That forwarder re-dispatches on `.lb-stage`, which Compare's forwarder skips (the target is in `.lightbox`).
    - So each key is handled once, with no loop.
  - **The synthetic event.** It reaches the Reference view's document handler only to be ignored: it checks `defaultPrevented` and the `.compare[aria-modal]` guard (`reference/view.ts:529,535`).
  - **Tests.** The I3b test uses the real `wireUndoKeys` and asserts one `undo` call; its Esc half is red on the old code. The I3a test is red on the old code.
- **Item 5: I4, Compare `aria-label`.** ADDRESSED. `compare/view.ts:91` sets it in `render()`, so it follows `swap()`. The test checks both orders.
- **Item 6: I5, Compare plates in %.** ADDRESSED.
  - `compare/view.ts:20-21`: `place` writes `b/TILE*100%`, for the plate (:108) and the outline (:122). It goes through the CSSOM, with no inline `style=`.
  - `styles.css:567` (T7 section): `.cmp-tile { width: min(420px, 100%); height: auto; aspect-ratio: 1 }`. The children are absolute, so the aspect ratio sets the height.
  - The test asserts the `%` unit on all four properties of both boxes.
- **Item 7: M0a, hidden board members keep their slot.** ADDRESSED for the stated scope (bad-hash hidden refs).
  - **Reorder.** `boards/view.ts:129-136` permutes the visible ids only and writes them back at the visible positions, so a hidden id keeps its absolute index. `focusAfter` (`to`) is a visible index, which matches `data-i`.
  - **Remove.** `:193` drops only the removed id.
  - **One undo step.** Each is still one `setBoardMembers` call.
  - **The backend accepts hidden ids.** `commit` applies to the full `o.lib.data` (`commands.rs:682`), where `check_board`'s `ref_index` (`edit.rs:1002-1003`) finds hidden refs.
  - **Test.** `["r1","ghost","r2","r3"]` gives `["r2","ghost","r1","r3"]`, then `["r1","ghost","r3"]`; red on the old code.
  - A side effect for ids absent from the library is listed under New Breakage.
- **Item 9: M1, `k`/`b` go through `letterOf`.** ADDRESSED. `reference/view.ts:552-553`. The test is red on the old code.
- **Item 10: M2, the lightbox's AZERTY `0`/`1`.** ADDRESSED. `lightbox/view.ts:242`: `e.key === "0" || (!shift && Digit0)`. `:246`: `digitOf(e) === 1`. The test is red on the old code.
- **Item 11: M3, `UnknownLink` copy.** ADDRESSED. `links/editor.ts:29`, with its test.
- **Item 12: M4, Esc after a lost drag capture.** ADDRESSED.
  - `reference/view.ts:679` ends the drag on `lostpointercapture`. `endDrag` takes no arguments and is idempotent (:637-640). So after a normal `pointerup` it is a no-op, and the `justDragged` click swallow still works. A lost capture never "drops": it only ends the drag.
  - The Esc guard is `drag && !drag.cancelled` (:530).
  - The test is red on the old code.
- **Item 13: M5, the board menu follows the store.** ADDRESSED. `menu.ts:98` subscribes and re-renders on `boards`/`reset`. `close()` calls `unsubscribe()` (:103), behind the `open` guard. The Reference view always closes the menu through `close()` (`reference/view.ts:92,169,601,624,695,716`). The test's after-close assertion can't detect a leak; I verified the unsubscribe by reading.
- **Item 14: M7, the value view starts from `body.value`.** ADDRESSED. `compare/view.ts:39`, with its test.
- **Item 15: M8, the hover label clears on `pointerleave`.** ADDRESSED. `lightbox/view.ts:201`. `hover()` is stateless (:139-145), so the label returns on re-entry. The keyboard label uses `:focus-visible` (`styles.css:476-479`) and is unaffected.
- **Item 16: M9, the membership line after a focus change.** ADDRESSED, test only as specified: `reference/view.test.ts` "the membership line follows the focus (M9)".
- **Ruling: the "Show in folder" label.** ADDRESSED. `boards/view.ts:158`; the test asserts the label.
- **T8 F1 (= C1).** ADDRESSED; see Item 1.
- **T8 F2: tagging a region at 416% reset the zoom to 100%.** ADDRESSED for the reported symptom. `lightbox/view.ts:241-246`: `0`/`1` don't zoom while `.lb-side .picker` exists.
  - **Mechanism, by reading.** The picker's digit handler re-renders `opsEl` (`picker.ts:96-107`), which detaches the focused `.pk-op`. The event still bubbles to the lightbox `el`, and `t.closest(".picker")` (view.ts:227) on the detached node is null.
  - **Without a picker** (`picking` false), `0`/`1` and AZERTY still zoom; the lightbox tests are green.
  - **Picker digit tagging still works.** The F2 test asserts `addTags` and that the zoom is unchanged.
  - This is a symptom-level fix (see Pre-existing below).
- **T8 F3: Alt+→ in Boards dropped focus to `<body>`.** ADDRESSED at the grid level; unverified in the real app.
  - `grid/windowed.ts:42,56`: a repaint that rebuilds the focused tile focuses the tile at the same index. The grid test is red on the old code.
  - The Boards Alt+→ test isn't red in jsdom, as the implementer reported.
  - The real-app cause (a forced repaint after `focusAfter`) is a hypothesis, so QA must check it.
- **T8 F4: focus fell to `<body>` after "Link these two" saved, and Esc no longer closed Compare.** ADDRESSED.
  - **The fix.** `compare/view.ts:169-173` adds a `MutationObserver` on `.cmp-dock` (childList). When the dock empties and focus is outside `el`, it focuses `.cmp-link-btn` (or `el`).
  - **When it stands down.**
    - While an editor is docked: a close-then-reopen arrives as one callback with `firstElementChild` set.
    - After `closed`.
  - **No leak.** It is disconnected in `close()` (:247) before `editor?.close()`, and any pending records are dropped.
  - **Esc.** The I3 forwarder is a second safety net for it.
  - **Test.** It presses the button as a user does and asserts focus on the new `.cmp-link-btn`. It is red without the observer.

### New Breakage in the Fix Diff
No Critical or Important. Minor:
- **Minor: `boards/view.ts:135,193` (with `edit.rs:1002-1003`).** The UI can't tell a hidden (bad-hash) id from one that is **absent from the library altogether**: neither is in `store.refs`. Now both are sent back.
  - **What fails.** `check_board` refuses an absent id with `UnknownReference`, and nothing strips dangling board ids at load. So on a board whose hand-edited `library.json` names a missing id, reorder and Remove now fail with the generic copy.
  - **What changed.** The old code silently dropped such ids. The menu tick (`menu.ts:59`) already had this behaviour before the wave. It is as rare as M0a itself (a hand-edit only).
  - **Possible fix, if wanted.** `set_board_members` could drop ids absent from `lib.data`.
- **Minor: `grid/windowed.ts:42,56`.** Focus is handed over by **index**, not by item identity, and `focus()` is called without `preventScroll`.
  - **After a reorder or removal.** Focus first lands on whichever item now holds that index. The final focus is still right: Boards overrides it with `focusAfter` (`boards/view.ts:108-110`) and Inbox by id (`inbox/view.ts:113-115`). A removed tile now hands focus to its neighbour, where it used to fall to `<body>`.
  - **On a resize repaint.** It can scroll the grid back to a focused tile sitting in the overscan rows. `focus({ preventScroll: true })` would avoid that.
- **Minor: `lightbox/view.ts:241-246`.** The stand-down also disables `0` (fit) and `1` while a picker is docked, even with focus on the stage.
  - The picker never uses `0` (`digitOf` is 1-9), so standing `0` down isn't needed, and the hint still says "+ − 0 1 zooms".
  - Root fix: `if (e.defaultPrevented) return;` in the lightbox `el` keydown (the picker prevents its digits, arrows, Enter and Esc), or a `composedPath()` check for `.picker`. Either would make the stand-down unnecessary.

**Pre-existing, not introduced (same root cause as F2; found by reading, not reproduced): Esc in the docked picker's new-technique form likely closes the whole lightbox.**
- `picker.ts:341-343` calls `closeForm()`, which runs `slot.innerHTML = ""` (:296) and detaches the focused input.
- At `lightbox/view.ts:227`, `t.closest(".picker")` is then null.
- `commit()` (:151-155) leaves no `from` or `draft`, so :228-230 calls `close()`.
- The `defaultPrevented` guard above would fix both. It is out of this wave's scope; for the controller to triage.

### QA focus
1. **F3.** In Boards, press Alt+→ / Alt+← on a tile. Focus should stay on the moved tile, and a second Alt+→ should move it again. Then resize the window with a tile focused: focus should stay on a tile and the grid shouldn't jump.
2. **F2.** In the lightbox at about 416%, drag a region, press `1`, pick a technique, and save. The zoom should stay. After the picker closes, `0` and `1` should zoom again.
3. **F4 / I3.**
   - In Compare, click "Link these two", type a why and save. Focus should land on "Edit link", and Esc should close Compare without clearing the Reference view's pin.
   - Dismiss a notice while Compare is open. Then Esc, `x`, `v` and Ctrl+Z should each act once: Ctrl+Z is one undo step, not two.
   - With the link editor's textarea focused, a background change (an import) shouldn't move the caret.
4. **Lightbox over Compare** (`L`). With focus on `<body>`, Esc should close the lightbox only, and a second Esc should close Compare. Ctrl+Z should be one step.
5. **C1.** On a board with "Show only this board" and no technique filter, Ranked should list members only, and "N related" should match. "Linked by you" should still show off-board links marked "Not on this board".
6. **I5.** Open Compare at about 900-1150 CSS px. Plates and region outlines should scale inside their column, with no overlap into Shared.
7. **I2 / M5.** In the board menu:
   - Space-tick a box: focus should stay on it.
   - Create a board with Enter: the new board's box should have focus.
   - With the menu open, Ctrl+Z an earlier board edit: the ticks should update.
8. **"Show in folder".** Check the label and that it reveals the export folder.
9. **Pre-existing.** Press Esc in the lightbox picker's "Add technique" form. Confirm whether it closes the whole lightbox.

### Verdict
**Fix wave:** All items addressed, no new Critical/Important breakage.

---
**Method notes:**
- **Read:** `fix-wave-report.md`, the final-review fix-wave list, `fix-wave.diff`, and these files at HEAD: `reference/view.ts`, `compare/view.ts`, `boards/{menu,view}.ts`, `grid/windowed.ts`, `lightbox/view.ts`, `links/editor.ts`, `keys.ts`, `tagging/picker.ts`, and the board paths in `commands.rs` and `edit.rs`.
- **Ran:** `npx vitest run` on the 7 touched test files: 7 files, 179 passed, exit 0. Also the single cargo test above.
- **Not done:** I mutated no source, so "red first" was checked by reading each test against the old code, not by running it.
