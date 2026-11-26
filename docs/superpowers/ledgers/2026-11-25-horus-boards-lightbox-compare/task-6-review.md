# Task 6 review: the full lightbox (d70e050..6bb00fa, p4-t6)

**Verdict: Needs fixes.** It is close: the spec is met almost everywhere. Three things need fixing, and each fix is small:
- a likely bug in the named risk area (region coordinates under zoom);
- a stuck-Space edge case;
- two tests on the coordinate risk that cannot fail.

Focused run: `npx vitest run src/lightbox` gave 3 files, 39/39 passing.

### Spec Compliance
- ✅ `zoom.ts` is new and separate from `graph/camera.ts`. It has `View`, `MAX_ZOOM = 8`, `fitView`, `zoomAt` (clamped to `[min, MAX_ZOOM]`), `panBy`, `plateOf` (stage px) and `hitRegion` (the smallest region wins), all with the signatures the brief gives.
- ✅ C21: `plateClient()` adds the stage's `getBoundingClientRect()` offset to `plateOf(cur())` before `normRect`. Hover uses stage px (`clientX - r.left`) against `plateOf`, which is consistent.
- ✅ The source swap (B4): `api.lightboxSource` replaces `imagePath`. The thumbnail shows at once, and the source is preloaded and swapped in on `load`. Three cases keep the thumbnail and show the exact note "Showing a preview — this format can't be shown at full size here.": `full: false`, a refusal, and a preload `error` (carry-in b). The pane is never blank. A late reply or a load after close is ignored through `closed`.
- ✅ B4 rewrite: `full_image_from_lightboxSource_with_thumb_fallback` keeps the full original, the preload error, the load after close, the rejection and the late reply after close. It now also checks the note. The only other Plan 2 test change is the `beforeEach` fake (`imagePath` → `lightboxSource`), which the swap requires.
- ✅ Zoom: the wheel and pinch (ctrl+wheel) zoom at the cursor, with `passive: false` and `preventDefault`. `+`/`=` and `-` zoom at the centre. `0` fits. `1` gives scale 1. The floor is `min(fit, 1)`.
- ✅ Pan: Space+drag or middle-drag, through pointer events with capture. A plain left drag still draws a region.
- ✅ R19 arrows: a draft takes the arrows. With no draft and the view zoomed past fit, they pan by 10% of the stage. At fit they start the centred draft. Enter drafts at any zoom.
- ✅ Overlays: the stroke is `opInk(...).base` and an unknown operation gets neutral `var(--ink-2)`. The label is `<span class="text">plain</span> › technique`, with the `.text` part in `opInk(...).text`. A renamed `plainLabel` re-renders on `c.taxonomy`. `o` toggles `.lb-boxes[hidden]`. The boxes take Tab focus (`tabindex=0`, `role="img"`, `aria-label`), and the trap skips them while they are hidden.
- ✅ The Line Says the State: region overlays stay `2px dotted` (`3px dotted` when hot or focused). Full and partial tags have no region and are not drawn in the lightbox, so they do not conflict.
- ✅ `v` still toggles the value view: the `is-value` grayscale on the img is unchanged and works on the swapped-in source.
- ✅ The toolbar shows `.lb-zoom` ("150%") and `.lb-size` ("300 × 400").
- ✅ Keys: Ctrl/⌘/Alt combos return early, so Ctrl+Z reaches `wireUndoKeys`. Esc is unchanged. Reference's document handler returns while `lightbox` is set, so `0` and `1` never reach the 1–9 callout pins. The picker still owns its keys, digits included (`t.closest(".picker")`).
- ✅ No new inline `style=`. Everything goes through `style.setProperty` or `style.left`, and the existing "no [style] outside .lb-box/.lb-plate" test passes. The CSS is appended under a "Plan 4 Task 6" heading.
- ✅ Leaks: every new listener uses `signal`, the document listeners included. The ResizeObserver and MutationObserver are disconnected in `close()`. No window listeners are added.
- ✅ Reduced motion: no transitions or tweens are added. Zoom and pan are instant.
- ⚠️ Cannot verify from the diff: whether a focus change scrolls `.lb-stage` in WebView2 (see Important 1). This is standard Chromium behaviour, but no test here can show it. Feel at real zoom, and the label clipping at the image's top edge, are left for QA (the implementer says so too).

### Strengths
- `zoom.ts` is small, pure and well tested. `panBy(v, 0, 0, …)` doubles as the resize clamp, which is neat.
- One `View` drives both the painting and the pointer maths, so the plate and the region maths can't drift apart, except through the scroll problem below.
- The preview fallback covers all three failure paths with one `sayPreview`, and the comments say why.
- The rewritten B4 test keeps every Plan 2 sub-case. The added `await tick()` is explained.
- The R20 literal-number tests match the brief exactly. They would fail if `plateOf` or the mapping were wrong.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
1. **Tab-focusing an off-screen region box while zoomed scrolls `.lb-stage`, so region drawing and hover go wrong.** (`view.ts:116` sets `b.tabIndex = 0`; `styles.css:351` sets `.lb-stage { overflow: hidden }`.)
   - `overflow: hidden` still makes a scroll container. In Chromium, Tab focus or `focus()` scrolls it to reveal the focused element.
   - When the view is zoomed in, a box to the right of or below the visible area moves the plate by `scrollLeft`/`scrollTop`. `getBoundingClientRect()` of the stage does not change, and the `View` does not know about the scroll.
   - After that, `plateClient()` is off by the scroll amount. A dragged region would save at the wrong image coordinates, hover would hit the wrong box, and panning would never undo the scroll.
   - **Not reproduced.** jsdom can't show it, and this is reasoned from standard Chromium focus-scroll behaviour. It still sits in the named risk area, and the fix is cheap whether or not it reproduces.
   - Plan 2 never had a focusable child that could sit off-screen, so this is new with this task.
   - **Fix:**
     - Minimal: `.lb-stage { overflow: clip; }` in the Task 6 section. WebView2 supports it, and a `clip` box is not a scroll container.
     - Alternative: reset `stage.scrollLeft = stage.scrollTop = 0` on `scroll`.
     - Better still: on `focusin` of a `.lb-box`, pan the `View` so the box is visible. Otherwise a Tab-focused box can be fully off-screen with its label invisible.
   - Related: Space-pan, Enter and the arrows are gated on `t === stage`, so they stop working once Tab lands on a `.lb-box`. Only the zoom, `v` and `o` keys still act.
2. **Space can stick on.** `space` is cleared only by a `keyup` on `el` (`view.ts:262-266`).
   - Suppose the artist holds Space and alt-tabs away, or Space is released while focus is in a notice or dialog over the lightbox. Those are outside `el`, and the document capture handler re-sends only `keydown`.
   - Then `space` stays true and every later plain left drag pans instead of drawing a region, which breaks Plan 2's core gesture until Space is pressed again.
   - **Fix:** clear it on `window` `blur` (with `signal`), and on `keyup` at the document level.
3. **Tests on the named coordinate risk that can't fail.**
   - `stubStage()` puts the stage at client (0, 0), so the C21 offset in `plateClient()` and in `hover()` could be dropped without any test failing.
   - No view-level test draws a region after zooming. The R20 tests exercise only `normRect` and `plateOf`, not `cur()`, `plateClient` or the wiring.
   - **Fix:** add one `view.test.ts` case. Put the stage at a non-zero client offset, press `+` (or `1`), drag, and assert the committed `openPicker` region with literal numbers. It is cheap, and it fails if the offset or the zoomed `View` is mis-wired.
   - `wheel_zooms_at_the_cursor` fires at (400, 300). That is the centre of the 800×600 stub and so the default `pt` in `zoomBy`, which means a handler that ignored the cursor would still pass. Use an off-centre point.
   - The fake `lightboxSource` returns 300×400, the same size as the reference. So `toolbar_shows_zoom_and_source_size…` can't tell whether the toolbar shows the reference's size or the source's (see Minor: source dimensions).

#### Minor (Nice to Have)
- **Source dimensions are never read.**
  - `imgSize` and `.lb-size` use `ref.width`/`ref.height`. `s.width`/`s.height` from `lightboxSource` are ignored.
  - That is defensible: the brief's "source size, such as 4000 × 3000" and "one image pixel is one CSS pixel" can be read as the original.
  - But for a preview (downscaled to 8192 px) or the thumb1024 fallback, `1` and "100%" are not one *shown* pixel per CSS pixel. The size readout is also not the size of what is on screen.
  - Region maths is unaffected, because regions are normalised.
  - Either confirm the original-size reading with the controller, or show the source's size, or both (for example "20000 × 15000 · preview 8192 × 6144").
- **`fitted` returns to true only through `0`.**
  - A Space-drag or middle-drag at fit (a no-op pan), or zooming back down to a floor equal to fit, leaves `fitted` false.
  - After that, the plate stops refitting when the stage resizes, and the `scale > fitScale()` test that picks arrow-pan over draft can flip after a resize.
  - Re-derive `fitted` when the view equals fit.
- **A wheel during a region drag:** `from` is kept in client px, so a wheel zoom mid-drag maps the start corner to a different image point. Ignore the wheel while `from` is set, or store `from` in image space.
- **Keyboard layouts:** `0` and `1` match `e.key` only. On AZERTY, unshifted they are `à` and `&`. Plan 3's `scene.ts:482` and `keys.ts` `digitOf` (M3) also accept `e.code` `Digit0`/`Digit1`. Match that for consistency.
- **The hot label is not raised:** `.is-hot` and `:focus-visible` have no `z-index`. A later sibling box can paint its border over the label. The report says the box is "raised", but nothing raises it. Add `z-index: 1`.
- **Stale highlight:** `is-hot` is not cleared on `pointerleave`, so the last highlighted box stays labelled when the pointer leaves the stage.
- **Enter while zoomed:** pressing Enter while zoomed and panned starts `CENTRED` in image space, which may be off-screen. The brief allows this, but a draft centred on the visible area would be kinder.
- **No dimensions:** when `ref.width` or `ref.height` is 0, `imgSize` falls back to 3×4. `1` then gives a 3×4 px plate, and the toolbar shows "0 × 0". This is an edge case: hide `.lb-size` and disable `1` in that case.
- **The `0` key and drafts:** `0` sets `fitted = true` without touching a draft. That is fine, because drafts are in image space. This is just noted.

### Assessment
**Task quality:** Needs fixes
**Reasoning:** The spec, the carry-ins and Plan 2's behaviour are met, and the pure maths is sound and tested. Three things need fixing, each small:
- The new focusable overlays can likely scroll the `overflow: hidden` stage while zoomed, which would misplace drawn regions.
- Space can stick after a window blur.
- Two tests on the coordinate risk can't fail: the cursor-zoom test and the client-offset path.
