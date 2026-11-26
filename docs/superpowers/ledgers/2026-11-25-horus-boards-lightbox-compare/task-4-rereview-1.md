# Task 4 re-review 1 (fix e77bf98..d1d48f9)

### Finding Verdicts
- **Esc mid-drag of the link handle doesn't abort; the release click opens the editor** — ADDRESSED. `view.ts:518` Esc now calls `cancelDrag()` (`view.ts:626-630`: removes the leader, sets `cancelled`, keeps `drag`). `view.ts:643` a cancelled drag ignores pointermove. `view.ts:651-656` on pointerup, `cancelled` sets `justDragged` (cleared by `setTimeout 0`, `view.ts:655`), then returns before `elementFromPoint`. So a drop on a target after Esc creates no link and opens no editor. `view.ts:661-663` the click right after is swallowed. Test `view.test.ts:951-968` mocks `elementFromPoint` to row `b`, then runs pointerdown, move, Esc, move, pointerup and click. It checks for no `.link-leader` and no `.link-editor`, then checks that the next plain click opens the editor. That covers both "no drop link" and "justDragged resets". `npx vitest run src/reference/view.test.ts`: 67/67 pass.

Requested checks:
- **pointercancel:** `view.ts:660` → `endDrag()` sets `drag = null`. `justDragged` is untouched and stays false. No click follows a pointercancel. Later clicks and drags work.
- **justDragged reset:** it is reset by `setTimeout 0` even if no click lands on the handle (a release elsewhere under capture sends the click to an ancestor). The test proves a later plain click is not swallowed.
- **A cancelled drag with no pointerup ever:** the next pointerdown replaces `drag` (`view.ts:640`). The old leader is already removed, so nothing leaks. See the Minor below.
- **Esc closing something else:** the drag branch returns before the unpin branch (`view.ts:532`). The other Esc handlers (link editor `editor.ts:183`, picker `picker.ts:334`, lightbox `lightbox/view.ts:145`) are scoped to their elements. Focus is on the handle during a drag, so they don't fire. This was the same before the fix.

### New Breakage in the Fix Diff
- Minor: `view.ts:518`. If a cancelled drag never gets its pointerup or pointercancel (capture lost without either event; there is no `lostpointercapture` or `blur` handler, which is a gap that predates this fix), `drag` stays non-null. Every later Esc then hits `cancelDrag()`, which does nothing, and returns. Esc stops unpinning callouts until the next pointerdown on the handle. Before the fix, `endDrag()` cleared `drag` on the first Esc. With pointer capture this is unlikely, because a capture target always gets pointerup or pointercancel. Two one-line fixes would close it: `if (drag && !drag.cancelled && e.key === "Escape")`, or `handle.addEventListener("lostpointercapture", endDrag, { signal })`. `lostpointercapture` fires after pointerup, and `endDrag` is safe to call twice.

No Critical/Important breakage.

### Verdict
**Fix round:** All findings addressed, no new Critical/Important breakage.
