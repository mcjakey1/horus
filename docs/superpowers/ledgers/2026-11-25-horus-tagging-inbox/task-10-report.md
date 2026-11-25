# Task 10 report: region tagging in a minimal lightbox (SPEC §6.6)

**Status:** DONE (AGY PASS WITH FIXES; both fixes applied)
**Branch / worktree:** `p2-t10-lightbox` at `.worktrees/p2-t10-lightbox`, on `63da5f5`

**Commits:**
- `7a6da27` feat(ui): drag a box in a minimal lightbox to tag a region (the brief's message)
- `3075d67` fix(ui): lightbox keeps the committed box as a read-only marker of what the picker saves
- `27035eb` fix(ui): lightbox clears the marker when the picker leaves unsaved; Esc mid-drag cancels the drag

## What changed

### `reference/tile.ts`: `fitBox(aspect, w, h)`
- It letterboxes the plate into any w×h box, sizing from the side that binds.
- `tileBox` now calls `fitBox(aspect, s, s)` and gives bit-identical results. The 3 existing `tileBox` tests pass unchanged.

### `lightbox/regions.ts`: `Pt`, `MIN_REGION = 0.01` and `normRect(a, b, plate)`
- It clamps the drag into the plate and normalises it to 0..1. A reversed drag gives the same region.
- It returns `null` when w or h is below `MIN_REGION`, for NaN points, and for a zero-size plate (which would otherwise clamp to the whole image).

### `lightbox/view.ts`: `openLightbox(api, store, refId, deps)` → `{ close }`
- **The modal:** a `div.lightbox` with `role="dialog"`, `aria-modal="true"` and `aria-label`.
  - Tab wraps inside it. The focusable controls are found at keydown time, because the picker adds and removes them.
  - A `focusin` guard and a `MutationObserver` put focus back on the stage when focus leaves. That covers the picker removing itself, after tagging or after its own Esc.
  - Every close path returns focus to the opener: Esc, the Close button, removal or reset in the store, and the view being destroyed.
- **The image:**
  - `thumb1024` shows at once, then the original from `assetUrl(await imagePath(id))`.
  - A refusal keeps the thumbnail. An answer that arrives after close is ignored.
  - The plate is letterboxed with `fitBox` and positioned through the CSSOM. The same `fit()` drives both the painting and the pointer maths, and reads the stage rect at event time.
- **Existing region tags:** `.lb-box`, a 2 px dotted outline in the operation's ink from `opInk`. The boxes are built with `createElement`, so there is no markup at all. They re-render when this reference changes.
- **`v`** toggles `.is-value` (greyscale) on the lightbox only. It starts from `body.value`, as the artist was looking. The Reference view's `#value` checkbox is never touched.
- **Drawing by drag:**
  - On pointer up with a valid region, `deps.openPicker({ refId, region })` is called.
  - A `<img draggable="false">` and `preventDefault` on pointer down stop the native image drag. `setPointerCapture` is called only if it exists, and `pointercancel` clears the drag.
- **Drawing by keyboard** (ruling 4):
  - Enter on the stage draws a centred 25% box. The arrows move it by 2%, Shift+arrows resize it, and Enter confirms it through the same `openPicker`.
  - The draft is clamped to stay inside 0..1 and no smaller than `MIN_REGION`.
- **The committed box** (fix `3075d67`) becomes a read-only `.lb-pending` marker of the region the docked picker will save.
  - Arrows, Esc or a new or abandoned drag start a fresh draft and never change the marker.
  - The marker clears when this reference's tag arrives in the store, or when the picker leaves without saving (`27035eb`).
- **Esc, in order of precedence:**
  1. Inside the picker, the picker owns Esc and closes itself.
  2. Otherwise, a drag or draft in progress is cancelled (`27035eb`).
  3. Otherwise, the lightbox closes.
  - Ctrl/⌘ combinations pass through to the undo keys.

### `reference/view.ts`: the lightbox hook only
- An "Open lightbox" button on the plate (`#lab .lb-open`, at top-left), and the `l`/`L` key in the existing keydown handler.
- Opening the lightbox closes any margin picker, which would sit behind the modal.
- `deps.openPicker` mounts the real `mountPicker` with the `region` into `.lightbox .lb-side`, with `onDone: closePicker`.
- `destroy` closes the lightbox.

### `api.ts`
- `imagePath(refId): Promise<string>`, which invokes `image_path` with `{ refId }`, per the plan's Task 5 contract. No Rust was written (ruling 1).

### `styles.css`
- Lightbox layout, matching the shell grid:
  - the stage on Grey Card N5, with Plate lift;
  - a 340 px panel side for the picker;
  - a 36 px bar.
- It stacks into one column at 760 px and below.
- Existing tokens only. There are no new inline `style=` attributes in the markup.

## Tests
- **RED:**
  - `fitBox` was not a function;
  - the `regions` and `view` modules were missing;
  - 3 new Reference-view tests failed;
  - the existing `tileBox` tests passed.
- Each of the two fix commits had RED tests first:
  - `committed_box_stays_what_the_picker_saves`;
  - `picker_cancel_clears_the_marker` and `esc_mid_drag_cancels_the_drag_only`.
- **GREEN:** `npm test` passes 125 of 125 tests in 12 files (98 at baseline). `npm run build` (`tsc && vite build`) passes.
- **`tile.test.ts`:** `fitBox` with the brief's 4/3 in 800×400 case, a pillarbox case and an exact fit.
- **`regions.test.ts`** (6 tests):
  - the brief's .25 case;
  - a reversed drag;
  - a drag from the margin past the plate, clamped;
  - a 2 px drag giving `null`;
  - a sliver on one side only;
  - NaN and a zero-size plate.
- **`lightbox/view.test.ts`** (16 tests):
  - dialog semantics;
  - a drag gives `openPicker` the region;
  - tiny and cancelled drags;
  - the keyboard path;
  - Esc closes and focus returns;
  - the Close button;
  - the Tab wrap;
  - `v`;
  - picker keys stay in the picker;
  - focus comes back into the lightbox when the picker leaves;
  - outlines through the CSSOM;
  - the `imagePath` swap, refusal and late answer;
  - store re-render and removal;
  - the marker tests.
- **`reference/view.test.ts`** (3 tests):
  - `L` opens the lightbox, and `v` stays inside it (`#value` untouched);
  - the "Open lightbox" button, with focus returning to it;
  - a drag docks the real picker inside the lightbox, after closing the margin picker. `1` then Enter calls `addTags("a", [{ operationId, region }])`. Focus stays in the lightbox afterwards, so `v` doesn't reach the Reference view.

## Deviations
1. **`api.ts`:** the `imagePath` wrapper, allowed by ruling 1. Until Task 5 lands, the lightbox shows `thumb1024` (the refusal is caught).
2. **Typed fakes:** `imagePath` was added to `firstrun.test.ts` and `reference/view.test.ts`, which are not in the Files list. `tsc` typechecks the tests.
3. **Picker slot:** found by class (`.lightbox .lb-side`, with a ponytail comment). Plan 4's chrome owns the slot.
4. **Initial value state:** the lightbox starts from `body.value`.
5. **Outline ink:** region outlines use the operation's ink at rest. The minimal lightbox has no hover or hot state.
6. **Test pollution:** `body.value` leaks between the existing Reference-view tests, from the `v` test. My view tests assert relative to it rather than changing the shared setup.

## Needs reconciling at merge (ruling 2)
- **Picker `onClose`:** closing the lightbox while a picker is docked removes the picker's DOM, but `view.ts` still holds that picker, and it stays subscribed to the store until the next `closePicker` (the next `t`, `L`, or `show` of another reference). Task 9's picker `onClose` would fix this.
- **`picker.ts`:** not edited. The lightbox does its own focus return to the opener.

## Not verified (jsdom limits; for QA in the real WebView)
- the grid layout and the position of `.lb-open`;
- pointer capture and native image-drag suppression;
- focus restore when the picker is removed;
- greyscale rendering;
- the `ResizeObserver` relayout.

## AGY #2 (read-only, `--mode plan`, run once on `7a6da27`..`3075d67`)
Verdict, verbatim (line 1): **PASS WITH FIXES**

The findings, both fixed in `27035eb` with tests:
1. **Important:** "stale `.lb-pending` box stays on screen after cancelling the picker with Esc". Fixed: the `MutationObserver` clears the marker when a picker node is removed and none remains.
2. **Minor:** "Esc mid-pointer-drag closes the lightbox instead of cancelling the drag". Fixed: Esc cancels a drag or draft first.

AGY verified everything else as clean: `fitBox` and `tileBox`, `normRect`, the `imagePath` fallback, the isolation of `v`, the focus trap and every return path, the keyboard path, the scope of `view.ts`, no inline `style=` in markup, and `opInk`.

## Usage
The weekly figure was 10% at the end.

## Fix round 1 (Opus review of `27035eb`: Needs fixes)
**Commit:** `a0e5d28` fix(ui): lightbox keeps keys and focus in the modal, keeps the marker until the picker leaves, swaps the original only once it decodes

- **I1, modality (ruling 5):**
  - `el.tabIndex = -1`, so a click on blank lightbox space focuses the dialog root, never `<body>`. The Tab trap still excludes it.
  - A capture-phase `document` keydown guard (on `signal`) handles keys aimed outside the lightbox:
    - it stops them, prevents their default and refocuses the stage;
    - it re-sends every key except Tab from the stage, so Esc, `v` and Ctrl+Z still act as the lightbox's own keys;
    - for Tab, it only prevents the default, so focus can't walk into the page behind.
  - Tests:
    - `focus_on_body_keeps_keys_in_the_modal` (lightbox):
      - checks `tabIndex`;
      - after a blur to body, `v` toggles the lightbox and no listener behind sees a key aimed at body;
      - Tab is prevented;
      - Esc closes.
    - `lightbox_keys_never_reach_the_view_from_body` (Reference view, real view): after each blur to body, `v` leaves `#value` alone, `t` opens no margin picker, and Esc closes.
- **I2, pending marker:**
  - Removed `showPending(null)` from the store subscriber. The marker now clears only when the picker leaves: after a successful save through `onDone` → `closePicker` → the MutationObserver, or after its Esc.
  - `committed_box_stays_what_the_picker_saves` now applies a change to this reference (a chip removal or undo) and expects the marker to stay where it was.
- **I3, decode fallback:**
  - The original is preloaded with `new Image()`, and the plate's `src` is swapped only on `load`.
  - On `error` (for example a TIFF original), `thumb1024` stays.
  - A load after close is ignored.
  - The test spies the `src` setter on `HTMLImageElement.prototype` to reach the preloader. It covers: the thumbnail at once; no swap before load; the swap on load; an error keeping the thumbnail; a load after close; a refusal; and a late answer.
- **Minor 4:** `commit` clears `from`, so Enter during a drag commits once and the drag's pointer up does nothing. Test: `enter_mid_drag_commits_once`.
- **Minor 3:** `lostpointercapture` ends a drag like `pointercancel` does. Both share `dropDrag`, which acts only while a drag is in progress, so it never drops a keyboard draft. Test: `lost_pointer_capture_ends_the_drag`.

**Tests:**
- RED: 6 new or changed tests failed first.
- GREEN: `npm test` passes 129 of 129 tests in 12 files.
- `npm run build` passes. `tsc` flagged `Array.prototype.at` under ES2020, so I used an index instead.

AGY was skipped, as instructed. The other minors stay logged, and the detached-picker leak goes to Task 9's `onClose` at merge.
