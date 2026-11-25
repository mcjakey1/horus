# Task 9 report: the Inbox view, intake, the duplicate prompt and the Library menu

**Status:** DONE. Branch `p2-t9-inbox`, in the worktree `.worktrees/p2-t9-inbox`, based on `63da5f5` (the UI integration branch: Tasks 7, 8 and 11).

## Commits

| Commit | Message |
|---|---|
| `9fb9595` | `fix(ui): Task 9 carry-ins: filtered Ranked refresh, Filter-by focus, modifier and view-gated keys, reset clears trail and stale notice, warning shown once, picker focus return and onClose, plate drop target` |
| `87df95a` | `feat(ui): Inbox triage, drag/paste/folder intake, duplicate merge and library switching` (the brief's message) |
| `1027900` | `fix(ui): Tag-like-this presets persist in the Inbox dock until tagged; dock teardown; reset clears the Inbox item (AGY #2)` |

All three carry `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. AGY #2 reviewed `9fb9595` and `87df95a`. `1027900` holds its fixes and was not re-validated, because the rule is one AGY run per task.

## Files

- **New:**
  - `app/src/inbox/view.ts` and `view.test.ts`;
  - `app/src/intake.ts` and `intake.test.ts`;
  - `app/src/grid/windowed.ts` and `windowed.test.ts`;
  - `app/src/library-menu.ts` and `library-menu.test.ts`;
  - `app/src/views.ts` and `views.test.ts`.
- **Changed:**
  - `app/index.html`: the Library button at the left of the top bar, `data-view-tab` on the Reference tab, the Inbox tab enabled, and `<section id="inbox">`.
  - `app/src/firstrun.ts` (`boot`), `api.ts`, `importer.ts`, `reference/view.ts`, `styles.css`, `tagging/picker.ts`.
  - The tests in `reference/view.test.ts`, `tagging/picker.test.ts` and `firstrun.test.ts`.
- **Outside the brief's Files list:**
  - `app/src/main.ts` (one line: it passes `getCurrentWebview()` into `boot`);
  - `tagging/picker.ts` and its test (the controller's ruled carry-in);
  - `views.test.ts`.
- No Rust was written. `package-lock.json` is unchanged.

## TDD

**RED:**
- **Carry-ins** (`npx vitest run src/reference/view.test.ts`): 7 failed and 33 passed, before the QA warning test was added. These failed:
  - `filtered_ranked_refreshes_for_a_change_outside_the_focus`
  - `filter_by_this_moves_focus_to_the_ranked_tab`
  - `modifier_combos_are_left_to_the_browser`
  - `view_keys_sleep_while_another_view_shows`
  - `library_switch_clears_the_back_trail`
  - `plate_is_a_drop_target_for_the_focus`
  - `reset_without_warning_clears_the_warning_notice`
- **The picker carry-in:** `close_returns_focus_to_the_opener_and_calls_onClose` failed (1 failed, 38 passed). Its guard test passed before the fix too.
- **The feature** (`npx vitest run`):
  - the 5 new suites failed with "Failed to resolve import";
  - 4 updated tests failed: the import test (now B4), the second half of `open_warning_is_shown_in_notice`, `import_warnings_are_listed`, and the boot smoke check in `firstrun`.
- **The AGY fixes:** both new Inbox tests failed first (`dock.close` and `dock.remember` didn't exist yet).

**GREEN:**
- `npm test` gives `Test Files  15 passed (15)` and `Tests  148 passed (148)`. The base was 98.
- `npm run build` passes, with tsc clean.

**The brief's named tests:**
- **Inbox:**
  - 3 untagged references plus 1 partial give 3 tiles, and the badge reads 3.
  - `windowed_grid_bounds_dom`: 2,000 items in 800×600 make 200 or fewer `<img>`. `scrollTo(1500)` renders tile 1500 and not tile 0, and no tile has `style=`.
  - Tagging tile 1 keeps 3 tiles, with tile 1 marked "tagged". Then → gives 2.
  - → on the last item stays put. The empty copy is exact.
  - With the picker docked: → on a card moves to the next item, ↓ moves to the next card, and → in the search field leaves the event alone (the caret moves).
- **Intake:**
  - A drop of 2 paths gives one `importPaths` call, and the change is applied.
  - `drop_position_scaled`: (400, 300) at `devicePixelRatio` 2 hit-tests (200, 150).
  - A plate drop calls `openPicker({refId, preset: presetFrom(r1)})`.
  - A PNG paste with `text/html` sends `importBytes(name, bytes, {sourceUrl})`.
  - A `text/plain`-only paste imports nothing and shows the exact copy.
  - "Add images…" gives 2 paths → 1 call, and `[]` → none.
  - `dupRows`: merge with `["sourceUrl"]`, show with no metadata, and both fields filled, with one `setField` for both.
  - `typed_text_is_text`, in both the intake and the Inbox tests.
- **Library menu:** open → `openLibrary("D:/B")` → reset, after which `store.root` is `"D:/B"`. A cancel calls nothing. A refusal shows its message and doesn't reset. "New library…" with the box unticked → `createLibrary("D:/C", false)`.
- **Views:** `select("inbox")` sets `body[data-view="inbox"]` and moves `aria-current`.

**Extra tests:**
- Selecting an item docks the picker with `{refId, inbox: true}`.
- Modified arrows, and arrows on a radio, aren't Inbox moves.
- An undo removing the item closes its picker.
- The grid keeps a focused tile's node when its window moves, and `update` re-renders.
- `over` and `leave` events aren't drops.
- A uri-list URL counts as a source; `javascript:` doesn't.
- A text paste into a text field stays a text paste.
- "Add folder…".
- The note field sends one `setField` for every new id.
- The status-bar route gets the note field too.
- Show calls `deps.show`. Merge fills only the empty fields, and the row goes back to Show.
- After a library switch, the old notice's buttons do nothing.
- A failed import says so.
- The menu opens, and Esc closes it.
- A remembered preset survives refocusing until the item is tagged.
- A reset clears the current item, and `dock.close()` tears the picker down.
- A boot smoke check: the Inbox, the views and the menu are mounted.

## The rulings and carry-ins

1. **Task 5's API (assumed shapes, added to `api.ts`):**
   - **Types:** `ImportMeta {note?, sourceUrl?}`, `FieldPatch {note?: string|null; sourceUrl?: string|null}` (absent keeps the value, `null` clears it), `ImportResult {report, change}`, and `Skip | {kind: "insideLibrary"}`.
   - `importPaths(paths, meta?) → ImportResult` calls `invoke("import_paths", {paths, note, sourceUrl})`, with `null` for absent values.
   - `importBytes(name, bytes, meta?) → ImportResult` calls `invoke("import_bytes", bytes, {headers: {"x-meta": encodeURIComponent(JSON.stringify({name, ...meta}))}})`.
   - `setField(refIds, patch) → Change` calls `invoke("set_field", {refIds, patch})`.
   - `pickFolder`, `pickImages`, `openLibrary`, `createLibrary` and `getTaxonomy` are Plan 1's, unchanged.
   - Errors are plain strings.
2. **The importer (B4):**
   - `mountImport` keeps its signature and the status-bar route, but `ImportHooks.onLibrary` is now `onChange`. The view passes `onChange: c => store.apply(c)`, and nothing reopens the library, so undo survives.
   - After a status-bar import it fires a `horus:imported` DOM event, so intake adds the note field and the duplicate rows. Each button still has exactly one owner.
   - `noticeIn(root)` is a `say` with no listeners, which `boot` uses for the other routes.
   - The summary now reads "Added N to the Inbox". I rewrote the 3 old "Added 1 reference" assertions and the old reopen test, without deleting any.
3. **Carry-ins (`9fb9595`), each with a test:**
   - **Task 11 (stale filter):** `touchesFocus` also refreshes for a changed reference that is in `S.ranked` or carries a filtered technique. This is gated on a non-empty filter, so the existing `unrelated_change_does_not_refresh` still passes.
   - **Task 11 (focus):** "Filter by this" moves focus to the Ranked tab.
   - **Task 7 (warning notice):** a reset without a warning hides the old notice. A reset with one shows it.
   - **Task 7 (modifier keys):** the view's document `keydown` ignores Ctrl and ⌘ combos, and Alt combos except Alt+←, which is Plan 1's Back shortcut and is kept on purpose. It also does nothing while `body[data-view]` isn't `reference`, so `t`, `v`, digits and Backspace never act on the hidden view.
   - **Task 7 (library switch):** a reset empties the view's Back trail. The Store already clears `canUndo` and `canRedo`, which the test asserts, and Rust clears its history (Task 5). Imports no longer go through a reset.
   - **Task 8 (picker close):**
     - `PickerOpts.onClose` is new and optional, so it's safe for Task 10.
     - It fires once, on every close path.
     - On close, focus returns to the opener, but only if focus was inside the picker and the opener is still connected.
     - The view's `onClose` never nulls a newer picker handle.
   - **Plan 1 QA:** `lib.warning` now shows only in `#import-notice`. `#data-source` shows just the folder, with the root in its tooltip.
   - **`data-ref-drop="<focus id>"`** is on `#plate` from `paintFocus`, outside the `plateSrc` guard, and is removed in the empty state.
4. **Operations are data:** the Inbox reuses the picker. No new code assumes a number of operations or seed ids, except the seed fixture in tests.
5. **No new inline `style=`:**
   - The grid's tiles carry no style attribute.
   - The positions are custom properties (`--wg-h`, `--wg-top`, `--wg-cols`, `--wg-tile`, `--wg-gap`), set through the CSSOM on the grid's own wrapper divs. The tiles flow in a CSS grid.
   - No HTML string has a `style=`.
6. **Task 10 separation:** the `view.ts` edits are the carry-ins plus one line for `data-ref-drop`. The picker only gained `onClose` and the focus return.

## Behaviour decisions (please check)

- **`IntakeDeps.show?(id)`** is a new optional field. A duplicate row's Show needs it to switch to the Reference view and open the reference.
- **`boot(root, api, win?)`:** `win` is optional, because jsdom has no Tauri window. `main.ts` passes `getCurrentWebview()`.
- **"Tag like this" on a drop:**
  - `wireIntake` calls `openPicker({refId, preset})` for each new reference.
  - `boot` routes that through `dockPicker.remember(refId, preset)`, then switches to the Inbox and focuses that item.
  - The preset stays with its reference, however often the item is reopened, until the reference is tagged or removed. That is the AGY fix.
  - With several new references, the Inbox lands on the last one. The others keep their presets until the artist reaches them.
  - A drop that doesn't land on a plate opens no picker.
- **The note field:**
  - It is shown after an intake that added something.
  - Saving it sends one `setField(newIds, {note})`, which is one undo step.
  - The note then counts as intake metadata, so a duplicate row can offer Merge for it.
- **Merge** sends only the fields the existing reference lacks, as one `setField([id], patch)` per reference. Afterwards that row goes back to Show.
- **A multi-image paste** sends one `importBytes` per image, each applied as it returns, with one combined notice. That makes one undo step per image, because each is its own Rust command.
- **A paste with no image:**
  - Inside a text field, it stays a normal paste, with no notice.
  - Anywhere else, it shows the Review Focus 5 copy.
- **The source URL:**
  - It comes from the first `<img src>` that is http(s) in `text/html`, parsed with `DOMParser` (which loads nothing), or from the first http(s) line of `text/uri-list`.
  - Anything else is ignored. It is stored as text and never fetched.
- **Switching to the Inbox** focuses its first item and docks the picker. Within the Inbox, ← and → move, but not in text fields, not on the domain radios or selects, not with a modifier, and not when the picker already handled the event. → on a card works because the picker leaves sideways arrows alone with `inbox: true`.
- **The view toggle** sets `body[data-view]`. CSS hides `.record` and `.work` in the Inbox view and changes the body's grid rows. There is no JS view state beyond `mountViews`.
- **The Library menu:**
  - It is a popover under the button, with "Open library…", "New library…", and an inline confirm with the demo box unticked.
  - Esc or an outside press closes it.
  - On an error, the notice shows the message and the store isn't reset.
- **Not built:** a highlight for drag hover (enter and over). Add it when artists ask for drop feedback.

## AGY #2 (run once, read-only, `--mode plan`, on `9fb9595` and `87df95a`)

Verbatim line 1: **`PASS WITH FIXES`**

Its findings, all fixed in `1027900`, with tests:
1. **Important:** a drop onto a plate lost its preset. `views.select("inbox")` focused item 0 first and used up the preset, so the second focus mounted a picker with nothing ticked. Multi-image drops lost earlier presets the same way. The presets now live in `dockPicker` and last until their reference is tagged or removed.
2. **Minor:** `boot().destroy()` didn't close the docked Inbox picker. `dockPicker` now has `close()`, which `boot` calls.
3. **Minor:** `S.cur` survived a reset. A reset now clears it, because a demo hash can repeat across libraries.

AGY reported as verified clean: B4, the `api.ts` shapes and keys, the `horus:imported` bridge, Review Focus 3 and 5, keyboard routing, escaping, no inline `style=`, data-driven operations, the carry-ins and the named tests.

Weekly usage was 10% when the work finished.

## Fix round 1 (the Opus review of `1027900`: 2 Important findings and 2 carry-in test gaps)

**Commit:** `917bf38`, `fix(ui): Tag-like-this drop lands on the new Inbox item by id; queued intake never drops a paste or drop; carry-in tests for ranked refresh and undo flags`, with the Co-Authored-By line.

**I1: a "Tag like this" drop landed on the wrong Inbox item.**
- `mountInbox` now also returns `focusId(id)`. It looks the item up in its own `S.list`, which includes a retained tagged item. If the id isn't there, it falls back to the first item.
- In `boot`, intake's `openPicker` remembers the preset and sets `landOn = refId`. Then:
  - if the Inbox is already showing, it calls `inbox.focusId(refId)`;
  - otherwise it calls `views.select("inbox")`, whose callback focuses `landOn`, not item 0, when one is set.
- So nothing re-selects the tagged item first, and the `store.inbox()` index mismatch is gone.

**I2: a paste or drop made during an import was dropped.**
- `run()` now chains each intake onto a serial promise (`queue = queue.then(() => runNow(...))`), so every paste or drop imports, in arrival order. `runNow` never rejects, so one failure doesn't stop the queue.
- The `busy` flag is removed.

**Covering tests:**
- **`firstrun.test.ts`:** `a Tag-like-this drop lands on the new Inbox item with its preset, past a retained tagged item (fix round 1, I1)`. This is boot-level, with the seed taxonomy:
  1. Switch to the Inbox, landing on `s`, and tag `s`, so it stays and is marked tagged.
  2. Go back to Reference, whose plate is `data-ref-drop="r1"`, and drop onto it.
  3. Expect the Inbox view, `is-cur` on `n1`, the docked picker for `n1`, and Chiaroscuro ticked.
- **`intake.test.ts`:**
  - `two pastes back to back both import, in order, the second after the first (fix round 1, I2)`: while the first `importBytes` is pending, only "one.png" has been called. After it resolves, "one.png" and then "two.png" are called, and both references are in the store.
  - `a drop during a running import is queued too`.
- **Carry-in (a), in `view.test.ts`:** `filtered_ranked_refreshes_when_a_ranked_reference_loses_its_tag (Task 11 carry-in)`. With the filter on `rhythm`, U joins `S.ranked`. Then U loses `rhythm`; it shares nothing with the focus and isn't related, and the Ranked list drops it.
- **Carry-in (e), in `view.test.ts`:** `library_switch_clears_the_back_trail (Task 7 carry-in)` now applies `canUndo: true` and `canRedo: true` first and asserts both are true. After `store.reset`, it asserts both are false.

**RED** (`npx vitest run firstrun intake view.test`, before the fix):
```
x two pastes back to back both import, in order, the second after the first (fix round 1, I2)
x a drop during a running import is queued too
x a Tag-like-this drop lands on the new Inbox item with its preset, past a retained tagged item (fix round 1, I1)
AssertionError: expected 's' to be 'n1' // Object.is equality
AssertionError: expected [ 'one.png' ] to deeply equal [ 'one.png', 'two.png' ]
AssertionError: expected [ [ [ 'C:/in/a.jpg' ] ] ] to deeply equal [ [ [ 'C:/in/a.jpg' ] ], ...(1) ]
Tests  3 failed | 74 passed (77)
```

**The carry-in tests** cover code that already existed, so they passed against it. To prove they bite, I ran a mutation check, then restored both files (`git diff` was clean afterwards):
- I removed the `S.ranked.includes(r.id)` clause from `touchesFocus`.
- I removed `canUndo: false, canRedo: false` from the store's `load`.

```
x filtered_ranked_refreshes_when_a_ranked_reference_loses_its_tag (Task 11 carry-in)
x library_switch_clears_the_back_trail (Task 7 carry-in)
Tests  2 failed | 40 passed (42)
```

**GREEN:**
- `npm test`: `Test Files  15 passed (15)`, `Tests  152 passed (152)`.
- `npx tsc --noEmit` is clean, and `npm run build` reports `built`.

AGY was skipped, as the controller asked. The minor findings were left alone, as ruled. Weekly usage is 10%.
