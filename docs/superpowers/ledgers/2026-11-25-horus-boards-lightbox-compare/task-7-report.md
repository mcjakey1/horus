# Task 7 report: the Compare view

**Status:** DONE. One commit on `plan4-boards`, `e1b239a` (`feat(ui): compare two references by shared and unique techniques`), on top of the prefix fix `09a99f6`. Nothing is pushed or merged. `lightbox/view.ts` is unchanged by this task.

## What changed

- **`compare/sides.ts`:** `sides(a, b, sharedTechniques, tax)`.
  - `shared` comes from `scorePair` (`sharedTechniques`).
  - `onlyA` and `onlyB` are the techniques on one side and not the other.
  - `partialA` and `partialB` are the operation ids of partial tags.
  - Every list is de-duplicated (regions collapse) and sorted in `tax.techniques` order.
- **`compare/view.ts`, `mountCompare(root, api, store, a, b, { showReference, onClose? })`:**
  - **A modal dialog:** `role="dialog"`, `aria-modal="true"`, `tabIndex = -1`, focused on open, with a Tab trap. A document `focusin` handler pulls focus back, unless the lightbox, an alertdialog or a notice has it. Focus returns to the opener on close.
  - **Layout:**
    - A on the left and B on the right, each `thumb1024` letterboxed on a 420 px N5 tile through `tileBox`. The plate positions go through the CSSOM.
    - The middle column holds "Shared", then "Same operation × domain", which lists `sharedBranches` with no shared technique on them.
    - Each side holds "Only here", then "Operation only".
  - **Ink:**
    - Every row is `<span class="text">{opLabel plain}</span> › {technique}`, and its `--t` is `opInk(...).text`, through the CSSOM.
    - Hovering a technique outlines its region (`.cmp-out`, dotted, with `--c` set to `opInk(...).base`) on whichever image carries it as a region tag.
  - **Score:** it comes from `api.scorePair` only and reads "0.42 · related by technique", or "not related by technique" at 0.
  - **Links:** a link between A and B (either direction) shows above everything as "Linked by you: “why”". It never feeds the score.
  - **Keys:**
    - `v` toggles `is-value` on both tiles.
    - `x` swaps the sides.
    - `l` or `L` opens the lightbox on the side under the pointer, through `openLightboxWithPicker`. Compare ignores keys while the lightbox is open.
    - Esc calls `onClose(A)` when given, else `showReference(A)`.
  - **Link button:** "Link these two" (or "Edit link") docks `mountLinkEditor` in `.cmp-dock`, outside the part that re-renders.
  - **Store events:** a store event re-renders; a reset, or the deletion of A or B, closes Compare.
  - **No score:** if `scorePair` rejects, the lists still show, without the Shared fill.
- **`makeOpenCompare(root, api, store, { showReference })`:** the one opener. A new call closes the open Compare first, so there is only ever one.
- **`lightbox/dock.ts`, `openLightboxWithPicker(api, store, refId, { beforePicker?, onClose? })`:** lifted from the Reference view's `openLb` (R23).
  - It docks the picker in `.lightbox .lb-side`, owns that picker, and never nulls a newer one.
  - It closes the picker when the lightbox closes.
  - `beforePicker` runs first, which closes the Reference view's margin picker.
- **`reference/view.ts`:**
  - The opts gain `openCompare`.
  - A Shift-click on any `[data-go]` row, tile or thumbnail (Ranked, callouts, Links tab) calls `openCompare(focus, that)` instead of navigating. Shift+Enter arrives as a shifted click.
  - The document keydown returns while `.compare[aria-modal="true"]` is open, next to the `lightbox` check.
  - `openLb` calls the helper with `beforePicker: closePicker`.
- **`firstrun.ts` `boot()`:**
  - One `openCompare = makeOpenCompare(root, api, store, { showReference: (id) => { shell.select("reference"); view.show(id); } })`, built before `shell` and `view`. Its closures read them only when called.
  - The Reference view gets `(a, b) => openCompare(a, b)`, with no `onClose`.
  - `mountGalaxy` gets `openCompare: (a, b) => openCompare(a, b, { onClose: () => shell.select("galaxy") })`.
- **`styles.css`:** a "Plan 4 Task 7" section. Compare sits at z-index 35, under the lightbox (40) and notices (45). There is no inline `style=` in any new markup.

## Tests

- **`compare/sides.test.ts` (3):**
  - The split: shared, onlyA, onlyB, partialA and partialB.
  - Two regions of one technique count once.
  - Taxonomy order: t3, t1, t2.
- **`compare/view.test.ts` (6):**
  - `open_compare_from_galaxy`: `scorePair("a","b")` is called, there are 3 columns, and a second call still leaves one Compare.
  - `compare_ink_from_taxonomy`: under a `color: "rose"` operation, the Shared row's `--t` is `var(--x-rose-text)` and its text is "Beat › Tech t2". Hover outlines A's region with `--c` set to `var(--x-rose)`; B's whole-image tag shows no outline. The score text is checked too.
  - `x` swaps the titles, and `v` sets `is-value` on both tiles.
  - Esc calls `showReference("a")` with no `onClose`, and the call's `onClose("a")` when one is given.
  - The role and `aria-modal`; Tab and Shift+Tab stay inside.
  - A link B→A shows "Linked by you: “Same harbour light”" before Shared, and a 0 score reads "not related by technique".
- **`reference/view.test.ts` (+2):**
  - `shift_click_opens_compare_on_the_focus_and_that_reference`: `scorePair("a","b")` is called, there are 3 columns, and there is no navigation.
  - `with_compare_open_v_and_esc_reach_compare_only`: the Reference view's `#value` is unchanged, both for a `v` on Compare and for a `v` on `<body>`. Compare's tile toggles. Esc closes Compare and calls `showReference("a")`.
  - The docking case is the existing `region_drag_docks_the_picker_inside_the_lightbox`. It is unchanged and passes through the helper: the margin picker closes first, and the picker docks in `.lb-side`.
- **`firstrun.test.ts` (+1):** "one openCompare…". `vi.mock` stands in for `./compare/view`, recording calls, and for `./views/galaxy`, capturing its deps.
  - The Galaxy's `openCompare("r1","s")` passes an `onClose`, and calling it selects the Galaxy.
  - The Reference view's Shift-click on a `[data-go]` row passes exactly `["r1", "s"]`, with no `onClose`.
- **Red first:** before the code, the 3 new modules failed to resolve and the firstrun wiring test failed (`openCompare is not a function`). All pass now.

## Checks

| Check | Result |
|---|---|
| `npx vitest run` | **exit 0**, **0 errors**, 583 passed (571 + 12), 45 files |
| `tsc --noEmit` | clean |
| `npm run build` | exit 0 |

## Notes

- **Deferred (C26):** the Tree and the Radial have no Compare entry.
- **Shift+Enter:** it relies on the browser sending a shifted `click` for Enter on a button. Chromium and WebView2 do. jsdom can't show this, so the tests use a Shift-click.
- **Not unit-tested:** the `L` key in Compare. It calls the same helper the Reference view's lightbox test covers.
- **Score on a rejection:** when `scorePair` rejects (for a hidden reference), the score line stays empty rather than saying "not related".

## Fix round 1 (review I1–I3)

**Commit:** `956fc28` on `plan4-boards`.

### I1: Shared and the score went stale

- **Re-score on change:** a store event with references, removals or a taxonomy change re-renders, then calls `scorePair(A, B)` again through `rescore()`.
- **Latest reply wins:** a request counter (`req`) makes the latest reply win. A superseded reply, or one after close, is ignored.
- **Local Shared:** while a reply is out (`pending`), and after a refusal (`scored = null`), Shared is the **local** technique intersection, so nothing vanishes from both sides. The score text stays `scorePair`'s: it keeps the last value until the new reply lands, and is empty after a refusal.
- **Swaps:** a swap does not re-score, because the score is symmetric.

### I2: closing Compare navigated

- Closing never navigates now. `exit()` closes Compare, which gives focus back to the opener, then calls the caller's `onClose` if there is one.
- `makeOpenCompare(root, api, store)` drops its `showReference` dep.
- In `boot()`, the Reference view's call passes no `onClose`, so the view underneath keeps its filter, pins and focus. The Galaxy's call keeps `onClose: () => shell.select("galaxy")`.
- A comment on `swap()` records that the Reference view's focus deliberately does not follow an `x` swap.

### I3: the Tab trap test could not fail

The test now asserts exact targets:
- Shift+Tab on the first control moves focus to `.cmp-close`;
- Tab on `.cmp-close` moves focus back to the first control;
- both events are `defaultPrevented`.

### Tests

- **New `compare/view.test.ts` "a tag change asks for the score again and the latest reply wins (review I1)":**
  1. A gains t3.
  2. The local Shared is [t2, t3] at once, and B's Only here is empty.
  3. A second change gives a third reply, 0.9 with [t2, t3]. After it, the score reads "0.90 · related by technique".
  4. The superseded second reply then lands with 0.1 and is ignored.
- **Rewritten "Esc closes and returns focus to the opener; a call's onClose runs after":** it replaces the `showReference` case.
- **New `reference/view.test.ts` "compare_from_a_filtered_ranked_row_closes_back_to_it":** it uses the real `mountReference` and `makeOpenCompare`.
  1. Filter by Silhouette, focus Ranked row b, and Shift-click it.
  2. Press Esc.
  3. Compare is gone, the chip is still there, `#ref-id` is still a, and focus is on the row.
- **Updated:** `with_compare_open_v_and_esc_reach_compare_only` now checks that there is no navigation, not a `showReference` call.

### Proof the tests can fail

- Against the round-0 `compare/view.ts`, every Compare test fails, because the signature changed. That is not a specific proof, so I ran two targeted mutations on the fixed file:
  - no re-score on a store event;
  - Shared from `scored` only, with no local intersection.
- Each makes the I1 test fail. I restored the file and confirmed it passes again.

### Checks

| Check | Result |
|---|---|
| `npx vitest run` | **exit 0**, **0 errors**, 585 passed (583 + 2), 45 files |
| `tsc` | clean |
| `npm run build` | exit 0 |

The minor findings are deferred, as instructed.

## Fix round 2 (re-review I2: Esc cleared the pin)

**Commit:** `6e07004` on `plan4-boards`.

**Cause:** `exit()` removed `.compare` while the Esc was still being delivered. The event then bubbled to the Reference view's document keydown, whose `.compare[aria-modal]` check no longer matched. Its Esc branch ran and cleared `S.pinned`.

**Fix:**
- **`compare/view.ts`:** the Esc branch now calls `e.stopPropagation()`, next to `preventDefault()`, before `exit()`.
- **`reference/view.ts`:** the document keydown now returns when `e.defaultPrevented`, next to the `isComposing` check. A key that a modal above has already handled never acts behind it.

**Test:** `compare_from_a_filtered_ranked_row_closes_back_to_it` now pins the first callout before filtering and Shift-clicking. It asserts the pin's `aria-pressed` is still `"true"` after Compare's Esc.
- **Red first:** without the fix it failed on exactly that line, view.test.ts:619 (`"false"`).
- **Each fix alone:** either one is enough for the test. Both are in, as the ruling asked.

**Checks:**

| Check | Result |
|---|---|
| `npx vitest run` | **exit 0**, **0 errors**, 585 passed, 45 files |
| `tsc` | clean |
| `npm run build` | exit 0 |
