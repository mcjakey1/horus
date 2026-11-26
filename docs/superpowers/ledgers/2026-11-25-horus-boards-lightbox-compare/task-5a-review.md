# Task 5a review: Boards (41163c7..74a5d3d, branch p4-t5a)

**Verdict: Needs fixes.** One Critical and three Important issues. The Critical one: the Reference view never re-renders when a board changes, so Review Focus 5 fails there. The status line and the Boards view are correct.

Reviewer -60, 2026-11-26. Review was read-only. I ran one focused check, `npx vitest run src/boards`: 30 of 30 passed. Everything else comes from reading the code.

### Spec Compliance
- ✅ **B3 opener:**
  - `capabilities/default.json` adds only `opener:allow-reveal-item-in-dir`.
  - `capability_grants_opener_reveal_only` pins it, and it would fail on the base, which has no opener permission.
  - The crate and npm versions match (2.7.3 / 2.7.3).
  - `api.revealFolder` is the only caller of `revealItemInDir`. It is called with `S.lastDest`, which is the `pickFolder` result after a successful export. No path the user types ever reaches it.
  - `NON_IPC_KEYS` and both typed fakes gained it.
- ✅ **Export:**
  - It calls `pickFolder("Export board to folder")`, then `exportBoard`. A cancelled pick calls nothing.
  - N is `written.length`. The toast adds "· M skipped", with a `<details>` list of mapped reasons, and "credits.txt was not written" when `credits` is null.
  - The library folder: the UI doesn't block it in advance. Rust refuses it (`export.rs:43`, `OUTSIDE`), and the UI shows that exact sentence. Any other refusal gets the generic line, so no raw OS text appears.
  - The skip-reason prefixes match T2's strings: `export.rs:60` and `:69`. `image_path_in`'s `InvalidFile` is caught by "invalid". Everything else gets the fallback.
- ✅ **Board wire codes:** `BoardNameTaken:<id>` uses the existing board's name, `EmptyName` and `UnknownBoard:` are mapped, and anything else gets the generic line.
- ✅ **Undo:**
  - Create, rename, re-member, reorder and delete each make exactly one `api.*Board*` call, so one `edit::apply` and one undo step.
  - Alt+←/→ makes one call per move.
  - `setScope` is local view state: not saved, and not undoable.
- ✅ **Pointer events only, no HTML5 DnD:**
  - The listeners sit on `root` with the AbortController signal. `hide`/`destroy` remove the ghost.
  - There is a 4 px threshold, `elementFromPoint` on `pointerup` gives the drop tile, and `pointercancel` aborts.
- ✅ **Windowed grid:** `mountWindowedGrid`, `loading="lazy"`, `decoding="async"`, at most 200 `<img>` at 2,000 members.
- ✅ **Styles:** no new `style=` markup; the ghost uses `style.setProperty`, like `.link-leader`. One CSS section, "Plan 4 Task 5: boards", includes the `body[data-view="boards"]` host rule.
- ✅ **Status line:**
  - It reads "Board: Harbour · 10 references · Show all".
  - On `scopeCleared` it reads "Board removed — showing all references", and keeps that until the next scope change or reset.
  - It is unwired in `boot().destroy`.
- ✅ **Boards view after a delete:** it re-renders on `scopeCleared` and selects the next board.
- ✅ **"Linked by you" under scope:** every link stays, and each out-of-board row is marked "Not on this board" [R13].
- ✅ **Search:** the `referenceTitle` hook returns `undefined` out of scope.
- ✅ **Unknown ref ids:** skipped in the grid, the list counts and the status count.
- ✅ **R17 scope:** `views/tree.ts` and `views/galaxy.ts` are untouched, as the split ruled.
- ❌ **Review Focus 5 in the Reference view.** Deleting the scoped board, or undoing its creation, clears `store.scope`, but the Reference view keeps filtering Ranked to the dead board and keeps showing the "Not on this board" chip. Ticking the focus onto the scoped board with `b` also leaves the chip stale. See Critical 1.
- ❌ **Keyboard reachability.**
  - Rename and "Show only this board" destroy the focused button and don't put focus anywhere. The rename field is `.select()`ed but never `.focus()`ed.
  - See Important 2.
- ⚠️ **Deviation that needs a ruling.** The brief has an inspector "Boards" section. It is replaced by a "Boards…" plate button that opens the menu, so the Reference view never shows a reference's memberships at rest. This is implementer choice 2. It meets the "opened from" wording, but not "add the Boards section to the inspector".
- ⚠️ **Cannot verify from the diff:**
  - `revealItemInDir` on a folder opens the parent with the folder selected. Does that read right as "Open folder"? (T8)
  - `setPointerCapture`, the ghost and drag-while-scrolling in WebView2.
  - The layout at 1280×800, and the hover-only tile tools on touch.
- ⚠️ **"Tests can fail" (argued from the code, not run).**
  - The boards tests import modules that don't exist at the base, so they fail there.
  - The four Reference-view tests check `inScope` filtering, the `.off-board` chip and the `b` key. None of those exist at the base, so each fails there.
  - The capability test fails on the base's permissions.
  - None of these tests covers a scope cleared by a Change, as opposed to by `setScope`. That gap is why Critical 1 got through.

### Strengths
- The capability is truly narrow and a Rust test pins it. The reveal path can't be steered from the UI.
- Export copy is careful: an exact-match pass-through for the one artist-facing refusal, mapped skip reasons with a fallback, the credits note, and everything escaped.
- `boardErrorCopy` is shared by the menu and the view, and falls back to the typed name when the conflicting board's id is gone.
- Lifecycle is clean: one AbortController, the subscription released, the ghost removed on `hide`/`destroy`, and the menu closes when the focus changes and when any other margin panel opens.
- The tests are behavioural and well aimed. The no-`[style]` assertion on the grid is a nice guard.

### Issues

#### Critical (Must Fix)
1. **The Reference view ignores board Changes, so the scope it shows goes stale.** (`app/src/reference/view.ts:747`, `touchesFocus`)
   - **Cause:** `touchesFocus` re-renders on `c.reset || c.taxonomy || c.links || c.scope || c.removed.length`, never on `c.boards` or `c.scopeCleared`. A board Change from Rust carries no `links`, because `settle` only adds them when `touched.links` (`commands.rs:611`). The shell's `show` for "reference" is a no-op (`firstrun.ts`: `still`), so going back to the tab doesn't repaint either.
   - **Cases:**
     - (a) Scope Harbour, then delete Harbour in Boards, then go back to Reference. Ranked is still cut to Harbour's old members, and the chip still says "Not on this board". Meanwhile the footer says "Board removed — showing all references". This is exactly the Review Focus 5 case.
     - (b) Ctrl+Z undoes the creation of the scoped board while you are in the Reference view: the same result.
     - (c) Scoped, you tick the focused reference onto the scoped board with `b`. The chip stays, and Ranked/Linked aren't re-evaluated.
   - **Fix:** in `touchesFocus`, add `c.scopeCleared || (c.boards && store.scope !== null)`.
   - **Tests to add:**
     - Scope via `setScope`, then `store.apply({ ...none, boards: [] })`: the chip is hidden and Ranked is unfiltered.
     - Scope on `["b"]` with focus `a`, then apply boards `["a","b"]`: the chip is hidden.

#### Important (Should Fix)
1. **Tile drag can turn into a native image drag.** (`app/src/boards/view.ts:58`, `:215-220`)
   - **Cause:** the tile's `<img>` fills the tile, has no `draggable="false"` and no `-webkit-user-drag: none`, and `pointerdown` doesn't `preventDefault()`. In Chromium/WebView2, a mouse drag that starts on an image starts the browser's own drag. That fires `pointercancel`, so the reorder is silently dropped, and text can get selected.
   - **Precedent:** the codebase already guards this elsewhere: `lightbox/view.ts:167` ("no native image drag"), `styles.css:353` `-webkit-user-drag: none`, and `views/inspector.ts:284` `draggable = false`.
   - **Why the tests miss it:** they dispatch synthetic `MouseEvent`s, so this can't show in jsdom.
   - **Fix:** add `draggable="false"` on the tile img, plus `-webkit-user-drag: none; user-select: none` on `.bd-tile`, and/or `e.preventDefault()` in `pointerdown`. If you use `preventDefault()`, keep focus with `el.focus()`.
2. **Keyboard focus is lost on header actions.** (`view.ts:74-90`, `:177-181`, `:193-198`)
   - **Cause:** `renderHead()` rewrites `.bd-head` innerHTML.
   - **What breaks:**
     - Pressing "Show only this board" with the keyboard destroys the focused button, so focus falls to `<body>`.
     - "Rename" swaps in the input but only calls `.select()`, which doesn't focus it (MDN: "select() will not necessarily focus the input"). A keyboard user, or a mouse user, has to click into the field before typing or pressing Enter does anything.
     - Esc, or saving a rename, also drops focus.
   - **Fix:** `input.focus(); input.select()` when renaming. After `renderHead`, put focus back on the `[data-act=…]` button that was focused.
   - **Why the tests miss it:** they dispatch keydown on the input directly.
3. **The delete confirm isn't bound to its board.** (`view.ts:182-188`)
   - **Cause:** "Delete <name>?" is just text in `.bd-msg`. `delete-yes` deletes whatever `board()` is at click time, and `render()` never clears the prompt.
   - **Trace:** "Delete Harbour?" is showing, and an undo (Ctrl+Z) or another Change removes Harbour. `render()` selects Ships, the prompt still reads "Delete Harbour?", and clicking Delete deletes **Ships**. It can be undone, but it is the wrong board.
   - **Fix:** put `data-board="${id}"` on `delete-yes` and delete that id, or clear the prompt in `render()` when `S.board` changes. Also move focus to the confirm button.

#### Minor (Nice to Have)
1. **Reorder and "Remove from board" drop hidden members.** Both send only the members in `store.refs` (`view.ts:117`, `:176`). A board can name a reference Rust hides from the UI (`visible()`, `commands.rs:378`), and either action silently drops that id from the board. It can be undone and is rare, but it is a membership change the artist didn't ask for. Doing the move on the full `referenceIds`, by id, avoids it.
2. **The board menu doesn't subscribe to the store** (`menu.ts`). An undo while it is open leaves the checkboxes stale. Ticking a board that was deleted meanwhile does nothing, silently, and the box stays ticked.
3. **Counts differ between the two views.** The menu counts `b.referenceIds.length`, unknown ids included, while the Boards view and the status line count known members only.
4. **The "Open folder" listener can outlive the toast's usefulness.** It lives on `document`, scoped by the view's signal. After the Boards view is destroyed, for example on a shell teardown, a toast still showing has an "Open folder" button that does nothing.
5. **The delete confirm buttons sit inside `.bd-msg role="status"`.** A live region holding interactive controls reads awkwardly to screen readers.

### Assessment
**Task quality:** Needs fixes

**Reasoning:** The opener scoping, the export copy, undo granularity, pointer-only reorder and the status line are all solid. But the Reference view doesn't react to board Changes, which breaks the Review Focus 5 scenario the task names. The drag, focus and delete-confirm issues are small, contained fixes.
