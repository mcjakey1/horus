# Task 7 re-review 2 (fix round 956fc28..6e07004)

### Finding Verdicts
- **I2: Esc from a Compare opened in the Reference view cleared the artist's pin**: ADDRESSED.
  - `app/src/compare/view.ts:185-190`: Compare's Esc now runs `e.preventDefault(); e.stopPropagation();` before `exit()`. The listener sits on the Compare root (`el`), so it runs during bubbling before the Reference view's `document` listener. `stopPropagation` alone keeps the key from reaching it.
  - `app/src/reference/view.ts:528`: `if (e.isComposing || e.defaultPrevented) return;` is a second guard. It is redundant for this path, and harmless.
  - `app/src/reference/view.test.ts:604-606,620`: the test pins a callout, checks `aria-pressed="true"`, dispatches Esc on `.compare`, then checks that `aria-pressed` is still `"true"`. The check is real: `syncPins` (view.ts:399-402) sets the attribute in place, and nothing in this flow re-renders the callouts (`applyFilter` only re-ranks, and closing navigates nowhere). Without the fix, the Reference view's Esc branch would set the live `pin` to `"false"`, so the "red first" claim holds.
  - `npx vitest run src/reference src/compare src/lightbox`: 8 files, 140 tests, all passed, exit 0. I did not re-run the full 585-test suite.

### New Breakage in the Fix Diff
None at Critical or Important.

KEY CHECK: I looked for any handler that calls preventDefault on a key before the Reference view's `document` keydown sees it, at a time when that handler would otherwise still act on the key (`data-view=reference`, no lightbox, no Compare, target not excluded by view.ts:536):
- `keys.ts:39-50` (wireUndoKeys, `document` bubble): only prevents Ctrl/⌘+Z/Y. The Reference handler already returns on Ctrl/⌘ (view.ts:531). No change.
- `lightbox/view.ts:301-307` (capture re-dispatch): it already calls `stopPropagation()` on the original event. The re-sent event targets `stage`, which is inside `.lightbox`, so the `if (lightbox)` and `.lightbox` exclusions already apply. No change.
- `lightbox/view.ts:221-258` (Esc, Space, Enter, arrows): the target is in `.lightbox`, which is already excluded. No change.
- `tagging/picker.ts:334-377` (digits, Esc, Delete, arrows): the target is in `.picker`, already excluded. The picker's line 412 is a `submit` event, not a key. No change.
- `links/editor.ts:105,183` and `boards/menu.ts:81`: the targets are `.link-editor` / `.board-menu` / input, already excluded, and these handlers also call stopPropagation on Esc. No change.
- `search.ts:75`: the target is an input, already excluded. No change.
- `compare/view.ts:176` (Tab trap): Compare is open, so view.ts:534 already returns. No change.
- `intake.ts:134,147`: paste and submit events, not keydown. No change.
- `boards/view.ts:204`, `inbox/view.ts:137`, `views/{tree,radial,galaxy,inspector,move-tags,technique-form}.ts`, `graph/scene.ts:506`: these belong to other views, so the `data-view` gate (view.ts:532) already returns. No change.
- `/`, `v`, `t`, `l`/`L`, `k`, `b`, Backspace, Alt+←, digits 1-9: none of the handlers above prevents these keys on a target the Reference view acts on. None of them has stopped working.

- **Minor (behavior change, not breakage)**: `library-menu.ts:88-93` calls preventDefault on Esc inside the Library menu (`menu` listener, which bubbles before `document`). Before the fix, that same Esc also cleared the Reference pin. Now the pin is kept. This matches the board menu and the link editor, which already stop their Esc, and it is arguably correct. No test covers it in either direction.

### Verdict
**Fix round:** All findings addressed, no new Critical/Important breakage.
