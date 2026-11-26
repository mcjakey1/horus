# Task 6 re-review 1: fix round 672ef22..e8125ec

This is a scoped, read-only re-review. I read the fix diff once. Outside it, I checked `styles.css:382-387` (the `.insp-title` and `.insp-h` rules), the beforeEach in `inspector.test.ts`, and which code queries `.insp-h`/`.insp-title`. I did not re-run the suite. The report's figures are RED 2 failed / 6 passed, GREEN 324/324, and `tsc` clean.

## Verdicts

### I1, focus lost on re-render: ADDRESSED
- **The fix:** `inspector.ts` records `hadFocus = el.contains(document.activeElement)` before its single `innerHTML` write. After the write, it calls `.insp-title?.focus()`. This matches the required fix exactly.
- **Coverage:** every branch of the body now emits `h2.insp-title tabindex="-1"`: none, op, branch, tech and ref. The `null` branch used to have no `.insp-title`. It now has one, which closes the gap that would have left focus on `<body>` when going back to no selection.
- **Focus outside the aside:** left alone. The canvas keeps its focus on store-driven re-renders.
- **Test:** `focus_survives_rerender` covers three cases. Inside → title, with `tabindex="-1"` asserted. Back to null → the "Operations" title. Focus outside → unchanged. It is real: the report gives the RED message (`<body>` vs `h2.insp-title`). The outside button it appends is cleared by `document.body.innerHTML = ""` in beforeEach, so nothing leaks between tests.

### I2, reference count: ADDRESSED
- **The fix:** `inspector.ts:78` reads `` `${node.count} ${node.count === 1 ? "reference" : "references"}` ``. The other strings are unchanged, as the controller ruled.
- **Test:** `reference_count_plural` checks 1, 2 and 0 references. "0 references" is the correct English plural. The report gives the RED message ("1 references").
- **Other counts:** the technique heading uses `count(node.count)` (a number span), and the list buttons show bare numbers, so no other singular case exists.

## New breakage from the fix diff

### Critical
None.

### Important
None.

### Minor
- **N1, `inspector.ts:72`: the empty-selection "Operations" heading changed style.**
  - **What changed:** it was `h2.insp-h`, an 11px mono uppercase label in `--ink-2` (`styles.css:387`). It is now `h2.insp-title`, a 21px serif title (`styles.css:382`). The copy is the same, but the type changed.
  - **Why it matters:** "Operations" is a section label, not a name, so a serif title goes against "Serif for names". It is also a visual change the brief did not ask for.
  - **No consumers:** no other code or test queries `.insp-h` for this heading.
  - **Fix, if the controller wants the old look:** keep `class="insp-h"` and add `tabindex="-1"`. Then focus `.insp-title, .insp-h` (the first match is the h2), or give the heading both classes and add a CSS override. Otherwise, the controller accepts the new look.

## Observations (not defects in this diff)
- **O1, focus ring on the title:** the global `:focus-visible` outline (`styles.css:33`) can draw around `h2.insp-title`. It does so after keyboard activation, which is Chromium's heuristic for programmatic focus, and not after a mouse click. That is reasonable feedback for a keyboard user. Add `.insp-title:focus { outline: none }` only if design objects.
- **O2, every re-render moves focus to the title:** any re-render while focus is inside the aside moves focus to the title. That includes a store change and the "Show all references" toggle. On the toggle, the user loses their place on the button. This is what the required fix specifies. Keeping focus on a matching `data-sel` or `aria-pressed` control would be a later refinement, not needed now.
- **O3, the test bypasses the Tree's click path:** the test calls `focus()` and then `renderInspector` directly. It does not click through the Tree's `select` → `render` path, as the review suggested. The logic lives entirely in `renderInspector`, so the coverage is equivalent.
- **O4, WKWebView (macOS Tauri):** a mouse click there does not focus a `<button>`, so `hadFocus` is false and focus stays where it was. This is not a regression. The keyboard route, which the finding is about, works.
- **O5, scrolling:** focusing the title can scroll the aside to its top. The title is the first thing in the body, so this is expected.
