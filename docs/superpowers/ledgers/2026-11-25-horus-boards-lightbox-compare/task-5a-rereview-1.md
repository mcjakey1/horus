### Finding Verdicts
- **C1: the Reference view ignored board Changes under a scope** — ADDRESSED. `app/src/reference/view.ts:760` returns true on `c.scopeCleared || (c.boards && store.scope !== null)`. That covers a delete or undo of the scoped board, because the store emits `scopeCleared` (`store.ts:71-73`). It also covers a b-tick onto the scoped board, and a b-tick onto a different board while scoped (refresh, then `paintFocus`, which reruns `offBoard.hidden = store.inScope(...)` and the Ranked cut). The tests go through `store.apply` (`reference/view.test.ts:1050`, `:1060`). Both would fail on the old code: an empty `references`/`removed` made `touchesFocus` false.
- **I1: tile `<img>` native drag** — ADDRESSED. `boards/view.ts:58` has `draggable="false"`, and `styles.css:552` has `.bd-tile img { -webkit-user-drag: none; }` (the same pattern as `styles.css:353`). Test: `boards/view.test.ts:230`.
- **I2: keyboard focus lost** — ADDRESSED. `renderHead` reads the active `data-act` inside `.bd-head`, or a pending `S.focusAct`, and puts focus back after the rewrite (`boards/view.ts:80-81`, `:102`). Rename calls `focus()` then `select()` (`:95-97`). Esc (`:210`) and a successful save (`:167`) set `focusAct = "rename"`. Tests: `boards/view.test.ts:235`, `:244`.
- **I3: delete confirm not bound to its board** — ADDRESSED. The prompt carries `data-board` (`boards/view.ts:195`). `delete-yes` acts only when that matches `board()` (`:199`). `render()` clears the message when the selection changes (`:104`). Test: `boards/view.test.ts:258`. It covers both the cleared prompt and a stale re-inserted confirm, and asserts `deleteBoard` was not called.
- **S1: show the focus's boards in the Reference view** — ADDRESSED. A line at the top of the margin shows "Boards: Harbour · Ships", or "On no board" when the focus is on none (`reference/view.ts:698-703`). "Boards…" still opens the editor. The line updates on:
  - **A focus change:** `paintFocus` calls it at `:137`.
  - **A board Change, including an undo:** under a scope the refresh path repaints it. With no scope, `:786` calls `renderBoardsLine` directly.

  It is hidden when the view is empty (`:169`) and removed on destroy (`:712`). Names go in through `textContent` (`:702`), so a board name cannot inject markup. Test: `reference/view.test.ts:1067`.

Other checks:
- **No new inline `style=`:** the diff adds none.
- **The new tests can fail:** each of the 7 asserts something the old code lacked. These are a `draggable` attribute, `activeElement`, a missing prompt, an uncalled `deleteBoard`, chip visibility and the `.ref-boards` text.
- **Test gap (Minor):** no test checks the membership line after a focus change. The code path (`paintFocus`) is shared and correct.

### New Breakage in the Fix Diff
None at Critical or Important level.
- **Minor, `boards/view.ts:95-97`:** while `S.renaming` is true, every `renderHead` (for example after a drag reorder's `store.apply`) now calls `input.focus()` and takes focus back to the rename field. Before the fix it only called `select()`. Renaming has no blur exit, so this can happen after the user has clicked away. It is an edge case and not a blocker.
- **Pre-existing, not from this diff:** `npx vitest run src/reference` reports 118/118 passed but exits 1. The cause is 2 unhandled rejections at `lightbox/view.ts:347` (`s.full` on `undefined`) from the lightbox mocks in the reference tests. The fix touches neither file. The report's "564/564" omits that the run fails on unhandled errors. Fix this in its own task.

### Verdict
**Fix round:** All findings addressed, no new Critical/Important breakage.
