# Task 6 report: the full lightbox

**Status:** DONE. One commit, `6bb00fa` (`feat(ui): full lightbox with zoom, pan, hover region overlays and preview fallback`), on `p4-t6`, on top of `d70e050`. Nothing is pushed or merged. I did not touch `reference/view.ts` (Task 4).

## What changed

### `lightbox/zoom.ts` (new)

This is pure maths, kept apart from `graph/camera.ts` (audit #20).
- `View`, `MAX_ZOOM = 8` and `fitView`, which letterboxes and centres the image.
- `zoomAt` keeps the image point under `pt` still. It clamps the scale to `[min, MAX_ZOOM]`, and `min` wins if the two cross.
- `panBy`, along each axis:
  - an image side larger than the viewport keeps the viewport covered, so no gap opens at that edge;
  - a smaller side stays centred.
  - So the image can never leave the viewport. `panBy(v, 0, 0, …)` is the clamp after a resize.
- `plateOf` gives the image's box in stage px.
- `hitRegion` picks the smallest region under the point.

### `lightbox/view.ts`

`openLightbox`, its `deps` and the `.lb-side` slot are unchanged.

- **Geometry:**
  - One `View` paints the plate (left, top, width and height, through the CSSOM) and drives the pointer maths.
  - While `fitted`, the view refits to the stage on every read and on resize.
  - A region drag maps through `plateOf` plus the stage's client offset, then `normRect` (C21).
- **Zoom:**
  - The wheel zooms at the cursor, and so does a trackpad pinch, which arrives as a ctrl+wheel.
  - `+` or `=` and `-` zoom at the centre by 1.25 and 0.8. `0` fits, and `1` sets the scale to 1, one image pixel per CSS pixel.
  - The zoom floor is `min(fit, 100%)`, so a small image can still reach 100%.
  - The zoom and the `v` and `o` keys work from any non-text target in the lightbox. The picker still owns its own keys.
- **Pan:**
  - Space+drag (Space held on the stage; the cursor shows a grab hand) or middle-drag.
  - A plain left drag still draws a region.
- **Arrows (R19):**
  - With a draft, the arrows edit the draft.
  - With no draft and the view zoomed in past fit, they pan by 10% of the stage.
  - At fit, they start the centred draft, as in Plan 2.
  - Enter starts a draft at any zoom.
- **Region overlays:**
  - Each region tag is a `.lb-box` in `opInk(...).base`, passed as `--c`. Carry-in (c): it is dotted, because it is a region, following "The Line Says the State". An unknown operation gets the neutral `var(--ink-2)`.
  - Each box is focusable (`tabindex=0`, `role="img"`, `aria-label`).
  - Hover, through `hitRegion` so the smallest region wins, or Tab focus raises the box and shows `<span class="text">{plain label}</span> › {technique}`. The `.text` part takes `opInk(...).text`, passed as `--t`.
  - `o` toggles the overlays (`.lb-boxes[hidden]`).
- **Source (B4):**
  - `api.lightboxSource` replaces `imagePath`. The thumbnail shows at once, and the source is preloaded and swapped in on load.
  - Carry-in (b): a `full: false` reply, a refusal, or a preload `error` keeps what is shown and shows the corner note "Showing a preview — this format can't be shown at full size here." So a missing original also falls back to `thumb1024` with the note.
- **Toolbar:** it shows the zoom percentage (`.lb-zoom`) and the source size (`.lb-size`, for example "300 × 400"), and the hint lists the new keys.

### `styles.css`

- A "Plan 4 Task 6" section is appended at the end: the pan cursor, overlay hover and focus, the label, the note, and the toolbar readouts.
- There is no new inline `style=`: every position goes through the CSSOM. The existing test that asserts no `[style]` outside `.lb-box` and `.lb-plate` still passes.

## Tests

- **`zoom.test.ts` (5):**
  - `fitView({4000,3000},{800,800})` gives `{0.2, 0, 100}`.
  - `zoomAt` keeps its fixed point and clamps at `MAX_ZOOM` and at `min`.
  - `panBy` stops at the edges in both directions, and a smaller side stays centred.
  - `plateOf`.
  - `hitRegion`: the small region inside the big one, the big one alone, and none.
- **`regions.test.ts` (+2):** under zoom, a drag from (200, 250) to (520, 490) at `{1.6, -200, -150}` gives `{0.25, 1/3, 0.2, 0.2}` within 1e-9. At fit `{0.8, 0, 100}`, a drag from (200, 300) to (360, 420) gives the same region.
- **`view.test.ts`:**
  - **Rewritten (B4):** `full_image_from_imagePath_with_thumb_fallback` is now `full_image_from_lightboxSource_with_thumb_fallback`. It keeps all of its cases:
    - full original: swap on load, no note;
    - preload `error`: the thumbnail stays, and now the note too (carry-in b);
    - a load after close changes nothing;
    - a rejection: the thumbnail and the note;
    - a late reply after close.
    - One `await tick()` was added after the mid-test reopen. Without it, that lightbox took the next `mockRejectedValueOnce`. This was always so; it only showed once the test checked the note.
  - **The `beforeEach` fake** now has `lightboxSource` instead of `imagePath`. No other Plan 2 test changed.
  - **New:**
    - `preview_note_for_a_preview_source`
    - `o_toggles_the_overlays`
    - `toolbar_shows_zoom_and_source_size_and_1_is_100_percent` (fit is 150%; `1` makes the plate 300 px and shows 100%; `0` refits)
    - `arrow_pans_when_zoomed_in_and_drafts_at_fit` (`+` gives top -75 px; ArrowUp pans to -15 px with no draft; at fit ArrowUp drafts)
    - `wheel_zooms_at_the_cursor` (the image point under the cursor stays put, within rounding)
    - `overlay_ink_from_taxonomy` (an added operation with `color: "teal"` is drawn in `var(--x-teal)`; an unknown one in `var(--ink-2)`; a renamed `plainLabel` shows in the hover label "Throb › Rim light"; the box is a Tab stop)
- **Red first:** `zoom.ts` was missing, so its 2 test files failed. With `view.ts` unchanged, 7 view tests failed. All pass now.
- **Plan 2 lightbox tests:** all unchanged and passing, including the keyboard draft at fit, the Tab wrap and the focus tests.

## Checks

| Check | Result |
|---|---|
| `tsc --noEmit` | clean |
| vitest | **492** passed, 39 files (479 + 13) |
| `npm run build` | exit 0 |

## Notes

- **Not unit-tested:**
  - Space+drag and middle-drag pan. They are wired, and `panBy` is tested, but there is no jsdom test.
  - Pinch is the wheel path with ctrl, so the wheel test covers its maths.
- **Merge:** `styles.css` gains its section at the end of the file. Task 4 appends its own section there too, so expect a trivial text conflict on merge. I did not edit Task 4's file.
- **No QA yet:** the "100%" readout assumes `devicePixelRatio`-independent CSS pixels, as the brief says. Feel at real zoom levels, and the label position near the image's top edge, are for QA.

## Fix round 1 (review I1–I3)

**Commit:** `c8e1d5c` on `p4-t6`.

### I1: a focused region box could scroll the plate

- **Scrolling:** `.lb-stage { overflow: clip; }` is added in the Task 6 CSS section. A clip box is not a scroll container, so focus can't scroll the plate behind the View's back.
- **Reveal:** on `focusin` of a `.lb-box`, `reveal(region)` checks whether the box is wholly on screen. If it is not, it pans the View (through `panBy`, so it stays clamped) to centre the box. At fit every box is already visible, so nothing moves and the view stays fitted.
- **Keys:** the stage's keys (Space-pan, Enter and the arrows) now also act when the event target is a `.lb-box`.
- **Not reproduced in a real Chromium:** jsdom has no layout and doesn't scroll on focus, so `overflow: clip` is untested here. The reveal and the keys are tested.

### I2: Space could stick

- `releaseSpace` runs on a document-level `keyup` of Space (capture phase), which replaces the `keyup` on `el`, and on `window` `blur`. Both use `signal`.

### I3: coordinate tests that could not fail

- **Stage offset:** `stubStage` now puts the stage at client (40, 30). The `at()` helper adds the offset, so every Plan 2 pointer test now exercises it too.
- **New `drag_after_zoom_saves_the_literal_region`:** press `+` (scale 1.875; plate 562.5×750 at stage (118.75, -75)), then drag the image rectangle x 0.2–0.6, y 0.3–0.5 in client px. The test asserts `openPicker`'s region is `{0.2, 0.3, 0.4, 0.2}` within 1e-9.
- **Wheel:** `wheel_zooms_at_the_cursor` now fires off-centre, at stage (300, 150). The test asserts the image point under it, (125/450, 0.25), stays put.
- **Size readout:** the fake `lightboxSource` now returns 1200×1600, so the toolbar test shows the readout is the original's size (300 × 400) and not the source's.
- **Hover:** `overlay_ink_from_taxonomy` now hovers at (0.2, 0.28), near the region's lower edge, where a dropped client offset (30 px) would miss.

### New I1 and I2 tests

- `a_focused_region_box_is_revealed_and_keeps_the_stage_keys`: zoom to about 458%, then pan to the bottom-right edge, so the region is off-screen (its centre at x < 0). Focus the box: its centre is then inside 800×600, and Enter from the box starts a draft.
- `space_is_released_by_a_window_blur_or_a_keyup_elsewhere`: Space down, then a window `blur` clears `is-pan`, and a plain drag draws a region again. Space down, then a `keyup` on `<body>` clears it too.

### Proof the tests can fail

- Against the old `view.ts`, the two I1 and I2 tests fail.
- With the client offset dropped from `plateClient`, `hover` and the wheel point, all one at a time, these fail:
  - `drag_opens_picker_with_region`
  - `committed_box_stays_what_the_picker_saves`
  - `wheel_zooms_at_the_cursor`
  - `drag_after_zoom_saves_the_literal_region`
  - `overlay_ink_from_taxonomy`
- I restored every change and checked it.

### Checks

| Check | Result |
|---|---|
| `tsc` | clean |
| vitest | **495** passed (492 + 3), 39 files |
| `npm run build` | exit 0 |

The minor findings are deferred, as instructed.
