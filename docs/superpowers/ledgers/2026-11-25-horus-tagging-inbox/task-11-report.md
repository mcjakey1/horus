# Task 11 report: AND/OR technique filter in the Ranked pane

**Status:** DONE
**Branch / worktree:** `p2-t11-filter` at `.worktrees/p2-t11-filter`
**Commit:** `26e2931` feat(ui): AND/OR technique filter in the Ranked pane (on 57560bc)

## What changed
- **`app/src/reference/filter.ts`** (new): `Filter`, `matchesFilter` and `toggle`, exactly as the brief specifies.
  - An empty filter matches everything, in both modes. The explicit check is needed because `[].some()` is false.
  - Partial tags never match.
  - `toggle` does not mutate its input.
- **`app/src/reference/view.ts`:**
  - **The filter state:** `S.filter` is now a `Filter`.
    - Every former `null` site has been replaced: the state init, `show()`, `renderEmpty()`, the clear handler, and the `head` and `mine` conditionals.
    - `show()` resets both the techniques and the mode (back to "or").
  - **Ranked pane:**
    - It shows "Any of" (the default) and "All of" as `aria-pressed` buttons in a `role="group"`.
    - Each filtered technique is a chip, with a "×" remove button labelled "Remove <name> from the filter". Clear is kept.
    - Matches are sorted by their `related` score, descending. A reference with no score gets 0, and the focus shows "this".
    - Empty-state copy is verbatim from the brief.
  - **`rerank(filter, focusOn)`:**
    - It re-renders only the Ranked pane: no store Change, no undo, no new IPC.
    - It restores keyboard focus after the `innerHTML` swap: to the mode button, to the chip that slides into the removed one's place, or to the Ranked tab.
  - **`applyFilter`** (from search or a callout) only adds a technique. Choosing a technique that is already present keeps it rather than toggling it off.
  - **Chip ink:** `opInk` through the CSSOM (`setProperty("--c")`).
    - `techOp` resolves the operation by search's rule (`search.rs:111-124`): the operation the library tags the technique under most, else its first operation in branch order. With no branch, the neutral ink is used.
    - It is data-driven, for 1 to 9 operations.
- **`app/src/reference/view.test.ts`:**
  - A second technique (Rhythm, under a sequence branch) is appended to the fixture. Existing counts are unchanged.
  - 4 new tests:
    - `filter_two_chips_all_of_leaves_single_match` also asserts:
      - ranking by score;
      - that a repeat choice is kept;
      - focus after the mode switch;
      - an unchanged `api.related` call count;
      - that the marked callout survives;
      - no undo.
    - `filter_show_clears_chips` also asserts that the mode resets.
    - `filter_chip_ink_and_remove` covers the ink, the CSSOM-only style, the aria-label and focus after removal.
    - `filter_from_search_and_empty_copy` covers both empty-state copies.
- **`app/src/reference/filter.test.ts`** (new): 5 tests covering A, B and C with and, or and the empty filter, partial-only references, and `toggle`.

## Deviations
1. **`app/src/styles.css`**, which is not in the Files list: 12 lines of chip, switch and callout-button rules.
   - They use existing tokens only, with square chips. The operation swatch is a 10px circle, as in search results.
   - Technique names are set in serif (the Hand and Instrument Rule). The old head's `<b class="mono">` for the technique name was dropped.
2. **A "Filter by this" button** (`data-filter`) was added to full-tag callouts in `renderCallouts`. The brief says "choosing a technique … from a callout adds it", and no such control existed (the callout title is the pin toggle).
   - **Merge risk:** this overlaps Task 8 in `renderCallouts`. The controller was told before implementation.
3. **The focus row** ("this") has score 0, so it ranks with the unscored matches, below every scored one.

## Verification
- **RED:** `filter.test.ts` failed because the module was missing, and the 4 new view tests failed. The 24 existing tests passed.
- **GREEN:** `npm test -- filter view` passed 33 of 33.
- **Full suite:** `npm test` passed 55 of 55 tests in 9 files.
- **Build:** `npm run build` (`tsc && vite build`) passed.
- `touchesFocus` and `S.plateSrc` are untouched. The existing refresh, plate and reset tests still pass.
- `.impeccable/hook.cache.json` was modified by the design hook and **not** committed.

## AGY #2 (read-only, `--mode plan`)
Verdict, verbatim (line 1): **PASS**

> PASS
>
> No problems found.

The full response also confirmed:
- the interface is correct;
- every `S.filter` site is replaced;
- focus is restored;
- the empty-state copy is verbatim;
- the filter is view state only;
- `touchesFocus` and `plateSrc` are untouched;
- there is no new inline `style=` and no 4-operation assumption;
- the tests cover the brief.

It called both deviations "clean and necessary".

## Usage
The weekly figure was 9% at the build step.
