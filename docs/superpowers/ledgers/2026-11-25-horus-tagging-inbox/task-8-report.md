# Task 8 report: the technique picker

**Status:** DONE. Branch `p2-t8-picker`, in the worktree `.worktrees/p2-t8-picker`, based on `57560bc` (Task 7).

## Commits

| Commit | Message |
|---|---|
| `3a02b60` | `feat(ui): plain-language technique picker with inferred domain, synonyms, examples and custom techniques` |
| `8d89efc` | `fix(ui): picker tick box ticks its own card; ticks drop when their technique leaves the taxonomy (AGY #2)` |
| `c219c2a` | `fix(ui): picker repaints a tick box that needs a domain; a late result after close skips onDone; chip names in serif` |

Both commits carry `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Files

- **New:** `app/src/tagging/picker.ts` and `app/src/tagging/picker.test.ts`.
- **Changed:**
  - `app/src/api.ts`: Task 5's types and wrappers.
  - `app/src/keys.ts` and `keys.test.ts`: the two deferred items from Task 7.
  - `app/src/reference/view.ts` and `view.test.ts`: the picker hooks only.
  - `app/src/styles.css`: the picker block.
  - `app/src/firstrun.test.ts`: its fake `Api` gains the 5 new methods. tsc requires this, because the tests are inside `include: ["src"]`.
- The `package-lock.json` file is unchanged, and so is `.impeccable/`. Nothing from `reference/` or `REFERENCE-ANALYSIS.md` was touched.

## TDD

**RED** (`npx vitest run picker view keys`, before any implementation):
- `picker.test.ts` failed to resolve `./picker`.
- These tests failed:
  - `keys.test.ts`: `tick_box_does_not_block_undo` and `ime_composition_is_left_alone`.
  - `view.test.ts`: `t_opens_the_picker_for_the_focused_reference`, `tag_button_on_the_plate_opens_the_picker` and `digits_do_not_pin_while_the_picker_is_open`.
- Result: 5 failed and 29 passed, plus the picker file failing to import.

**GREEN:**
- `npm test`: 9 files, **83 passed**. The baseline was 46.
- `npm run build` (tsc and vite): passes.

Each fix commit followed the same cycle: 2 new tests failed first, then passed.
- In `8d89efc`, the first failure read "expected [ 'chiaroscuro' ] to deeply equal [ 'pop-out' ]".
- In `c219c2a`, the failures were the tick box on a card that needs a domain, and `onDone` firing after close.

**The brief's named tests, all present and passing:**
- the seed buttons, with `2` selecting Group;
- `dynamic_operations` (1, 5 and 9 operations; `6` does nothing);
- `renamed_operation_label` (no remount, and the search text survives);
- `deleted_operation_clears_choice`;
- `custom_domain_listed`;
- `filter_then_enter`;
- `digits_type_in_search`;
- `ask_domain` (Enter waits, then applies the picked branch);
- `partial_tag`;
- `preset`;
- `custom_technique`, in 4 cases: Halo glow, the `NameTaken` copy with "use it", the `TaxonomyReadOnly` copy, and the disabled card while read-only;
- `region` (preset, partial and `addTechnique`'s `tag`);
- `chips` (✓, ×, and Delete on a focused chip);
- `demo_examples_shown` (2 thumbnails labelled "demo", and 1 fetch across 2 pickers);
- the 2 `view.test.ts` cases (`t` mounts the picker; `1` doesn't pin while it is open).

**Extra tests:**
- the "Tag…" button;
- the picker closes when the focus moves;
- a printable key outside a text field starts a search;
- Enter with no operation sends nothing;
- Space ticks and unticks;
- ← and → are left alone when the picker is docked in the Inbox;
- Esc clears the search, then closes;
- Ctrl and IME keys pass through;
- a library example comes first, without the "demo" label;
- user text is escaped;
- `close` unsubscribes;
- chips follow the store;
- clicking a tick box ticks its own card;
- ticks are pruned when a technique leaves the taxonomy;
- a tick box on a card that needs a domain shows its radios and stays unticked;
- a late result after close doesn't call `onDone`.

## The controller's rulings

1. **Task 5's API (assumed shapes):**
   - `addTags(refId, tags)` → `add_tags {refId, tags}`
   - `updateTag(refId, tagId, tag)` → `update_tag {refId, tagId, tag}`
   - `removeTag(refId, tagId)` → `remove_tag {refId, tagId}`
   - `addTechnique(t, tag?)` → `add_technique {t, tag}`, with `tag` sent as `null` when absent (Rust `Option<TagFor>`)
   - `demoExamples()` → `demo_examples`

   All of them return `Promise<Change>`, except `demoExamples`, which returns `Promise<DemoExample[]>`.
   - New types: `NewTechnique {name, description, operationId, domainId}` and `TagFor {refId, region?}`.
   - `Change`, `NewTag`, `DemoExample`, `undo` and `redo` are reused from Task 7.
   - **Assumption:** errors arrive as plain strings (`String(err)`), as `"NameTaken:<id>"` and `"TaxonomyReadOnly"`.
   - **Assumption:** the brief writes `addTags([...])`, but the actual call is `addTags(refId, [...])`.
   - The contract test (`api.contract.test.ts`) still belongs to Task 5.
2. **Task 7's model is reused, not re-implemented:**
   - `techniquesFor`, `domainChoice`, `matchesQuery`, `examplesFor`, `opInk` and `opLabel`.
   - The picker doesn't need `presetFrom`. Task 9 will use it to build the `preset` opt.
3. **The keys:**
   - `keys.ts` exports `isTextEntry(el)`. It returns true for `textarea` and `[contenteditable]`, and for an `input` whose `.type` is text, search, url, email or number. An absent type reads as `"text"`.
   - The undo keys skip only those, so Ctrl+Z works on a tick box or radio.
   - `if (e.isComposing) return;` is in the undo keys, the picker's handler and the view's document handler (one line, next to the `t` hook).
   - Tests: `tick_box_does_not_block_undo` and `ime_composition_is_left_alone`.
4. **Operations as data:**
   - Buttons come from `store.tax.operations` in order.
   - `opLabel().plain` (serif) and `.name` (mono) are the labels.
   - The swatch is `opInk().base` through `el.style.setProperty("--c", …)`.
   - Keys `1`–`9` map to positions. An out-of-range digit is swallowed, so it isn't typed into the search.
   - Tested with 1, 5, 9 and the seed's 4.
5. **No inline `style=`:** grep finds none in `picker.ts` or in the `view.ts` additions.
6. **SPEC §6.2:**
   - Demo thumbnails come from `api.demoExamples()`, cached per `Api` in a `WeakMap`.
   - A rejection is treated as `[]`.
   - The cache entry is dropped on a library reset, but only while a picker is mounted: the drop happens in the picker's store subscription.
   - Images go through `assetUrl(path)`, with a mono "demo" label.
7. **`view.ts` is limited to the picker hooks:**
   - the `mountPicker` import;
   - one line in `show()` that closes a picker belonging to another reference;
   - the `t` key branch and the `pickerOpen()` guard on digits;
   - one self-contained block before `// ---------- the Store ----------`. It holds `openPicker` and `closePicker`, the "Tag…" button injected into `#lab` (because `index.html` isn't in Files), and its abort cleanup.

   `renderCallouts` is untouched, so it shouldn't collide with Task 11.

## Behaviour decisions (please check)

- **Enter precedence:** the ticked set, then the highlighted card, then (with the "+ New technique" card highlighted) the form, then a partial tag for the chosen operation. With no operation chosen, nothing happens. An empty `addTags` is never sent.
- **Highlighting:**
  - While the search text isn't empty and no arrow or click has been used, the first visible card is highlighted.
  - Clicking a card only highlights it.
  - The footer's "Apply" button runs the same logic as Enter, for mouse users.
- **The domain chip:**
  - The highlighted card shows a muted domain chip, or radios when `domainChoice` returns `ask`.
  - While the radios await a pick, Enter and Space say "Choose a domain first." and send nothing.
- **Without an operation,** no cards show. The grid reads "Choose an operation, or press 1–N." Searching across all operations was not built (SPEC §6.1 narrows by operation).
- **"use it" after `NameTaken`:**
  - It tags the existing technique when its branch in the chosen operation is unambiguous.
  - If two branches qualify, it puts the technique's name in the search so its card asks for the domain.
  - If the technique isn't in this operation, it uses the technique's first branch in any operation.
- **The custom-technique form:**
  - It holds the name (prefilled from the search), a one-line description, and a domain select listing the operation's branch domains.
  - A `busy` flag stops a double submit or a double Enter.
  - Esc closes the form first.
- **After a successful `addTags` or `addTechnique`:** `store.apply(change)` runs, the picker resets, and `onDone()` fires. On the Reference view, `onDone` closes the picker. Chip actions (✓ and ×) apply their `Change` but don't call `onDone`.
- **The picker closes itself** when its reference leaves the store. The view also closes it on `destroy` and when the focus moves to another reference.
- **Docking:**
  - The picker appends to `.margin`.
  - CSS `:has()` hides the margin's tabs and panes, and the leaders, while it is open, so no JS state is needed.
  - Pinning digits are suspended through view state (`picker.el.isConnected`), not a DOM query. So Task 7's `typing_in_picker_search_does_not_pin` still passes.
- **Ticks are data (`NewTag[]`).** A preset can span operations. When a preset is given, its first operation is chosen.
- **The `icon` field** shows as caption text in tertiary ink, until Plan 6 draws the icons. The seed's icons are descriptive phrases.

## AGY #2 (run once, read-only, `--mode plan`)

Verbatim line 1: **`PASS WITH FIXES`**

Its findings, both fixed in `8d89efc` with tests:
1. **Important:** clicking an unhighlighted card's checkbox toggled the previously highlighted card. `toggleTick(id?)` now takes the clicked card's id.
2. **Minor:** `S.ticks` pruned only deleted operations on a taxonomy change. It now also drops a tick whose (branch, technique) pair is gone.

AGY reported as verified clean: the wrapper keys, `isTextEntry` and `isComposing`, keyboard routing, escaping, no inline `style=`, the 1–9 operations, demo caching and the `view.ts` scope.

**Scope:** AGY's verdict covers `3a02b60` only. `8d89efc` and `c219c2a` were not re-validated, because the rule is one AGY run per task.

**`c219c2a`** fixes three things the self-check found after AGY:
- **The stuck tick box.** Clicking the tick box of an unhighlighted card that needs a domain pick left the box checked, with no ticks recorded and no radios shown. The card now repaints.
- **The late `onDone`.** A late `addTags` result after close called `onDone`. On the view, `onDone` is `closePicker`, so it could close a newer picker opened on another reference. The `Change` is still applied.
- **Chip labels in serif.** They now follow DESIGN.md's Hand and Instrument rule, which sets technique names in serif.

Weekly usage was 9% when the work finished.

## Fix round 1 (the Opus review of `c219c2a`: two Important keyboard bugs)

**Commit:** `4c34c97`, `fix(ui): picker highlights a Tab-focused card so Enter tags it; Space on a domain radio picks it`, with the Co-Authored-By line.

**I1: a Tab-focused card wasn't highlighted.** Enter on it sent a partial tag, Space did nothing, and the first ↓ re-highlighted the same card.
- A `focusin` handler on `.pk-card` now sets `S.nav = true` and `S.hi` to that card's index.
- It repaints only when that card wasn't already the visible highlight.
- **Why only then:** focusing a domain radio inside an auto-highlighted card used to repaint the grid. That detached the focused radio, which the I2 test exposed. Skipping the repaint also ends `keep()`'s refocus without a loop.

**I2: Space on a domain radio was taken over by tick.** The Space branch now returns early for `input[type="radio"]`, as the arrow branch already did.

**Covering tests** (`app/src/tagging/picker.test.ts`):
- `tab_focused_card_is_what_enter_applies (fix round 1, I1)`: `1`, then focus the first card, as Tab does. It must be highlighted and hold focus, and Enter must send `addTags("r", [{operationId: "differentiate", techniqueId: <that card>, branchId: "differentiate.feature"}])`.
- `tab_focused_card_space_ticks_and_down_moves_on (fix round 1, I1)`: Space ticks the focused card, and ↓ moves to card 2 and focuses it.
- `space_on_a_domain_radio_is_left_to_the_radio (fix round 1, I2)`: Space on the first radio of an `ask` card isn't `defaultPrevented`, shows no message and ticks nothing. After the radio is checked (by `radio.click()`, the browser's Space action), Enter sends Chiaroscuro with `differentiate.feature`.

**RED** (`npx vitest run picker`, before the fix):
```
× tab_focused_card_is_what_enter_applies (fix round 1, I1)
× tab_focused_card_space_ticks_and_down_moves_on (fix round 1, I1)
× space_on_a_domain_radio_is_left_to_the_radio (fix round 1, I2)
AssertionError: expected undefined to be 'chiaroscuro' // Object.is equality
TypeError: Cannot read properties of null (reading 'classList')
AssertionError: expected true to be false // Object.is equality
Tests  3 failed | 31 passed (34)
```
After the first fix attempt, which repainted on every `focusin`, one test still failed: `space_on_a_domain_radio…`, with `expected [] to deeply equal [ [ 'r', [ { …(3) } ] ] ]`. That was the detached radio. The repaint-only-if-not-shown change fixed it.

**GREEN:**
- `npm test`: `Test Files  9 passed (9)`, `Tests  86 passed (86)`.
- `npm run build`: `✓ built in 2.60s`. tsc is clean.

AGY was skipped, as the controller asked: the controller runs a scoped re-review. Weekly usage is 9%.

## Fix round 2 (the re-review of `4c34c97`: I3, `focusin` repainted on mouse focus)

**Commit:** `e8e38d1`, `fix(ui): picker focusin repaints only for keyboard focus, so a first click ticks or opens the form`, with the Co-Authored-By line.

**I3.** A mousedown on a card that isn't highlighted (its body, its tick box, or "+ New technique") focuses it, which fires `focusin`. `focusin` used to repaint the grid then, detaching the mousedown target. Browsers then drop the click, so the first click only highlighted the card.

**The fix** (`picker.ts`):
- A `pointer` flag is set by `pointerdown` on `el`.
- It is cleared by the next `focusin` (one press, one focus), by `click` and by `keydown`.
- On pointer focus, `focusin` does only the bookkeeping (`S.nav`, `S.hi`), and the click handler repaints, as before.
- Keyboard focus (Tab) is unchanged: it repaints when the card wasn't already the visible highlight.

**Covering tests** (`app/src/tagging/picker.test.ts`):
- `pointer_focus_on_a_tick_box_does_not_repaint_before_the_click (fix round 2, I3)`: `pointerdown`, then `focus()` on card 2's tick box. The box must still be `isConnected`. After `click()`, card 2 is the only one ticked.
- `pointer_focus_on_new_technique_does_not_repaint_before_the_click (fix round 2, I3)`: the same on an unhighlighted "+ New technique" card. It stays connected, and `click()` opens `.pk-form`.
- `keyboard_focus_after_a_pointer_press_still_highlights (fix round 2, I3)`: a `pointerdown` that never becomes a click, then a keydown, then card focus. The card is highlighted. This one is a guard and passed before the fix too.
- The round 1 tests still pass, so Tab behaviour is unchanged.

**RED** (`npx vitest run picker`):
```
× pointer_focus_on_a_tick_box_does_not_repaint_before_the_click (fix round 2, I3)
× pointer_focus_on_new_technique_does_not_repaint_before_the_click (fix round 2, I3)
AssertionError: expected false to be true // Object.is equality
AssertionError: expected false to be true // Object.is equality
Tests  2 failed | 35 passed (37)
```

**GREEN:**
- `npm test`: `Test Files  9 passed (9)`, `Tests  89 passed (89)`.
- `npm run build`: tsc is clean, and vite reports `✓ built`.

AGY was skipped, as the controller asked. Weekly usage is 9%.
