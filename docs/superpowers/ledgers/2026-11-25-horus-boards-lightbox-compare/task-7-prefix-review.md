# Task 7 prefix review (commit 09a99f6)

### Verdict: ADDRESSED

Read-only review against the commit (`git show 09a99f6:<file>`). I did not run tests in the worktree, as asked. The claim of vitest exit 0, 0 Errors and 571 passed comes from the report and was not re-run.

### Evidence (file:line)

- **Root cause, the fakes:** `app/src/reference/view.test.ts:115` and `app/src/firstrun.test.ts:71` now resolve `{ path, full: true, width: 1, height: 1 }`. The two derived fakes, `firstrun.test.ts:155` and `:196`, spread `fakeApi(...)`, so they get the fixed mock too.
- **Grep, no other undefined-resolving fake:** `git grep lightboxSource 09a99f6` finds only the three typed fakes (`lightbox/view.test.ts:58`, `reference/view.test.ts:115`, `firstrun.test.ts:71`), all valid, plus `api.contract.test.ts:70`, which is a contract call and not a fake. The partial fakes (`as unknown as Api`) leave out `lightboxSource` entirely. If one of them ever opened the lightbox, calling `undefined` would throw inside `.then` at `view.ts:344`. That throw is caught by `.catch` at `:356`, so the note shows and nothing escapes.
- **Missing or invalid reply = refusal:** `app/src/lightbox/view.ts:348` (`!s || typeof s.path !== "string" || !s.path` leads to `sayPreview()`). `:349` hides the note only when `s.full === true`, so a reply with a valid path but a missing `full` still shows the note.
- **.catch can't hide a blank pane:** the thumbnail `src` is set at `:341` before the chain starts. `.catch(sayPreview)` at `:356` sets `note.hidden = false` (`:342`), and `note` is the `PREVIEW_NOTE` paragraph (`:26`, `:51`). Any error in the chain (a refusal, an `assetUrl` throw, a malformed reply) therefore leaves the thumbnail in place and shows the note. `sayPreview` itself cannot throw. The note is the only signal: nothing is logged to the console. That is acceptable under Focus 3, but a real code bug in the chain would look the same as a refusal.
- **Late replies after close are still ignored:** `:346` (`if (closed) return`) runs before the guard, and `sayPreview` (`:342`), the load handler (`:352`) and the error path all check `!closed`. The existing late-reply case (`view.test.ts:326-333`) is unchanged.
- **The new test can fail** (`view.test.ts:350-360`):
  - Against the old code, `undefined` threw in the success handler and the note stayed hidden, so the assertion at `:358` fails. This matches the report's red run.
  - If the new guard is removed, the `undefined` and `null` cases would still pass, because `.catch` now covers them. The `{ path: "", full: true }` case would fail, because the note would be set hidden and jsdom fires no load or error event.
  - If `.catch` goes back to a sibling handler, `undefined` fails again.
  - So the test catches both halves of the fix.

### New Breakage

None.
