**Verdict: Needs fixes (one small Important item: Esc does not abort a link drag.)**

# Task 4 review: links you draw yourself (cc44550..e77bf98)

Reviewer, 2026-11-26. Read-only review of the diff and the `p4-t4` checkout. Focused runs: `src/links/editor.test.ts` 13/13 and `src/reference/view.test.ts` 66/66 both pass.

### Spec Compliance
- ✅ **`linkedFirst`** (`links/editor.ts:211-223`) is pure. It keeps the links' order (newest first, from `store.linksFor`), takes each score from `related` or leaves it `undefined`, and removes the linked ids from `rest`. No score is changed, and a test checks that `related` is unmutated.
- ✅ **Ranked:** the old `"your link"` rows and the private `linksOf` that read `store.links` are gone. The "Linked by you" `.group-head` comes before the scored rows, and each linked row shows its why and its score, or "not related by technique". A linked reference that scores appears once; the test checks the ids are `["c","b"]`.
- ✅ **"Always shown" under a technique filter [R13]:** the linked group renders regardless of the filter. Only `scoredRows` filters, and the linked ids are removed from it.
- ✅ **Unknown ids are skipped:** `linksOf` drops a link whose other end is missing from `store.refs`, so the `!` in `renderRanked`/`renderLinks` is safe. No `visible()` filtering, per the carry-in.
- ✅ **Links tab:** it lists `store.linksFor(focus)` with the other reference's tile, title and why, plus Edit and Delete. The badge shows the count, and "+ Link to…" opens the editor.
- ✅ **Editor:**
  - The combobox filters in TypeScript by title and note, and excludes the focus and the references already linked. It works with ↑ ↓ Enter, and ignores Enter during IME composition.
  - The textarea is labelled "Why are these connected?", and Save stays disabled until it holds non-whitespace and a target is chosen.
- ✅ **Review Focus 4, the typed text survives every refusal:** the catch block never touches `why.value`.
  - `DuplicateLink:<id>` switches to `updateLink` on that id and shows the exact copy.
  - `SelfLink` and `EmptyWhy` map to the brief's copy, and anything else gets "That change didn't save. Try again.". No raw text is ever shown.
  - Self-links can't be started from the UI: the combobox excludes the focus, and a drop on the focus is ignored.
  - An empty why can't be sent: Save is disabled.
- ✅ **Pointer events only:** `pointerdown` with `setPointerCapture?.`, `pointermove` drawing the `.link-leader`, then `pointerup` with `elementFromPoint(...).closest("[data-ref-id]")`. There is no `draggable` and no `dragstart` listener, and the spy test has a positive control. All handle listeners use `{ signal }`, and abort removes the handle, the leader and the editor.
- ✅ **Drop targets:** Ranked rows, Links rows and callout thumbnails carry `data-ref-id` next to `data-go`.
- ✅ **Handle placement and the `k` key:** the handle is appended to `#lab` [R14], and `k` opens "+ Link to…".
- ✅ **Refresh [R7]:** `touchesFocus` returns true on `c.scope`; `c.links` was already there. The scope test fails without the change, because an empty `references` reaches the technique check and returns false.
- ✅ **Undo keys do nothing inside the editor:** `wireUndoKeys` bails on `isTextEntry`, which covers the textarea and input. The view's own keys skip `.link-editor`.
- ✅ **No new inline `style=`:** the leader uses `style.setProperty`, and the new rows use the existing `img()`, which renders no style.
- ✅ **CSS:** one appended section headed "Plan 4 Task 4". Every token it uses (`--mono`, `--sans`, `--shell`, `--line-2`, `--ink-3`) is defined at `styles.css:2-24`.
- ✅ **The changed `rows()` helper** still proves what it proved. Before T4, no link row rendered under a filter. The only linked fixture reference is C, which has no tags and can't match a filter, so `.row:not(.linked)` selects exactly the old set.
- ❌ **"Esc … aborts":** see Important 1. Only `pointercancel` truly aborts. Esc removes the leader, but releasing the button then opens the combobox editor.
- ⚠️ **Cannot verify from the diff:**
  - that creating, editing or deleting a link is one undo step (backend, Task 3);
  - pointer capture and click ordering, the leader's look, and text selection during a drag in real WebView2;
  - "always shown" under board scope (Task 5 adds scope filtering; only the refresh hook is in place);
  - `dragDropEnabled`, which no config file in the diff touches, so it is presumably still the default.

### Strengths
- `linkedFirst` is small, pure and well tested. That includes the order, the unmutated scores and an unrelated link with no score.
- The DuplicateLink flow is correct and pleasant. "Current note: …" lets the artist merge the two reasons, which is a sensible addition beyond the brief.
- Docking the editor in `.margin`, outside `#pane-links`, means a re-render can't wipe a half-typed note. It shares the picker's one-panel rule.
- Focus handling is careful: the editor returns focus to its opener, and the Links tab refocuses "+ Link to…" after the re-render a Delete causes.
- Click-after-drag suppression and a drop on the focus are both handled and tested. The spy test with a positive control is a good pattern.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
1. **Esc doesn't abort a drag: releasing afterwards opens the editor** (`reference/view.ts`, the document keydown at ~:850 and the handle's `pointerup`/`click`).
   - **The sequence:**
     1. `pointerdown` and `pointermove` start a drag.
     2. Esc calls `endDrag()`, which sets `drag = null`.
     3. On `pointerup`, the handler returns at `if (!drag)` before it sets `justDragged`.
     4. The browser's following `click` on the captured handle reaches `openLinkEditor()`, and the combobox editor opens.
   - The brief says "Esc or `pointercancel` aborts". The `justDragged` guard assumes the click comes after a drag's `pointerup`, and the Esc path bypasses it.
   - **Fix:** set `justDragged = true` in the Esc branch, or keep a `cancelled` flag in `drag` that `pointerup` checks.
   - **Test to add:** pointerdown, move, Esc keydown, pointerup, then `handle.click()`; expect no `.link-editor`.
   - This is a traced finding; I did not run it as a test, since the checkout is read-only.

#### Minor (Nice to Have)
1. **Dedupe under a filter is untested.** The `filtering ? list.filter(!linkedIds)` branch has no test, because the "appears once" test is unfiltered and C never matches a filter. Add a case where the linked reference also carries the filtered technique.
2. **Count and empty state:** "N related" uses `list.length`, which includes the references already shown under "Linked by you". If every related reference is linked, the pane shows the heading, no scored rows and no empty note, while saying "1 related". `scoredRows.length` would match what is shown.
3. **Duplicate mode, one Save replaces the first note with the typed text.** This follows the brief, which says to keep the typed text, and the "Current note" line mitigates it. But Decision 2's "a second reason goes into the existing note" depends on the artist merging by hand. The controller may want the label to say "Save note (replaces the current note)", or prefill the merge; undo covers it either way.
4. **Combobox shows titles only.** I read "lists the references by title and note" as "filters by"; the brief's next sentence is about filtering. A note match such as "raking" showing "Gulls" is unexplained, and duplicate titles look identical. Showing a note snippet in a `<small>` would fix both. The list has no "no matches" line either.
5. **Delete has no busy guard.** A double-click sends a second `removeLink`, and its rejection puts a spurious "That change didn't save" in the re-rendered pane. No confirmation is fine, since a delete is undoable.
6. **`k` is lowercase only**, where `l`/`L` takes both. Caps Lock breaks it.
7. **A half-typed note is discarded without warning** when `t` opens the picker, or a click on a row changes the focus. This is consistent with the picker; mention it to QA.
8. **`openLb` closes the picker but not the link editor**, which stays docked behind the modal. It is harmless, because the lightbox traps focus, but it is inconsistent.
9. **`linkedFirst` doesn't dedupe two links for the same pair.** This only matters if stored data violates Decision 2, which the backend enforces.
10. **On the implementer's open concerns:**
    - Placement: one docked panel in `.margin` is right.
    - Delete with no confirmation is acceptable, since it is undoable.
    - The WebView2 pointer items are correctly deferred to T8 step 6. Add "Esc mid-drag, then release" to that hand check.

### Assessment
**Task quality:** Needs fixes

**Reasoning:** The task meets nearly every requirement: `linkedFirst` is correct, the linked group is always shown, wire codes map to copy, typed text is kept, the drag uses pointer events only, and the refresh hooks are wired. However, Esc mid-drag doesn't abort as the brief requires: releasing the button opens the editor. That is a one-line fix plus one test.
