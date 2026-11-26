# Task 6 re-review 1 (fix 6bb00fa..c8e1d5c)

### Finding Verdicts
- **I1: a focusable .lb-box could scroll the overflow:hidden stage; stage keys dead while a box had focus** — ADDRESSED.
  - `app/src/styles.css:471` sets `.lb-stage { overflow: clip; }`. It comes after `styles.css:351` (`overflow: hidden`) and has the same specificity, so it wins. In Chromium/WebView2 (supported since v90), a `clip` box is not a scroll container. Focus, `scrollIntoView` and script cannot scroll it, and `scrollTop` stays 0. So `rect()` and `plateOf` are again the whole truth about where the plate is. The clipped overflow also does not add to any ancestor's scrollable overflow. Losing the BFC does not matter: the stage is a grid item, which is still an independent formatting context, and its children are absolutely positioned (`.lb-plate`, `.lb-note` at `:480`).
  - The reveal pan is consistent with View/plateOf. `view.ts:88-94` computes the region in stage px from `plateOf(cur(), imgSize)`, the same space that `hover` and `layout` use. It returns early when the region is wholly inside `0..s.width × 0..s.height`. At fit this is always true, so `setView` is never called and `fitted` stays true. Otherwise it pans by the centre delta through `panBy`, which clamps as every other pan does.
  - Keys now pass the target guard: `view.ts:245` reads `t !== stage && !t.matches(".lb-box")`.
  - Tests: `view.test.ts` `a_focused_region_box_is_revealed_and_keeps_the_stage_keys`. jsdom cannot exercise `clip` itself, and the report says so.
- **I2: Space could stick** — ADDRESSED. `view.ts:273-278`: `releaseSpace` runs on a capture-phase `document` keyup of `" "` and on `window` `blur`, both with `signal` (removed on close). Test: `space_is_released_by_a_window_blur_or_a_keyup_elsewhere`.
- **I3: the coordinate tests could not fail** — ADDRESSED.
  - The stage stub is at (40, 30), and `at()` adds the offset (`view.test.ts:36-43`).
  - `drag_after_zoom_saves_the_literal_region` asserts `{0.2, 0.3, 0.4, 0.2}` within 1e-9. The geometry checks out: at scale 1.875 about the centre, the plate is 562.5×750 at (118.75, -75).
  - The wheel test is off-centre, at stage (300, 150), and expects 125/450 and 0.25.
  - The fake source is 1200×1600, distinct from the reference.
  - The hover test is moved to y 0.28, so a dropped 30 px offset misses.
  - `npx vitest run src/lightbox`: 42/42 pass.

### New Breakage in the Fix Diff
None.

Checked:
- **Space released mid-drag:** `panFrom` is independent of `space`. Releasing Space mid-pan lets that pan run to `pointerup`, `pointercancel` or `lostpointercapture` (`view.ts:184, 192-199`). The next drag draws. No pan is left in progress.
- **Hover and click:** neither triggers the reveal. `.lb-box` has `pointer-events: none` (`styles.css:355`), and `pointerdown` focuses the stage (`view.ts:165, 173`). Only Tab, the trap's `.focus()`, or script focus reaches a box, which is the intended scope. `focusin` from other elements (the picker, the stage) finds no `.lb-box`, so the lookup gets `id === undefined` and does nothing.
- **Key conflicts with a box focused:**
  - Enter starts or commits the stage's centred keyboard draft. It does not act on the focused tag. Plan 2 gave a focused box no Enter behaviour, so nothing is overridden.
  - Arrows pan when zoomed and move the draft at fit, the same as on the stage.
  - `v`, `o`, `+ - 0 1` already worked on any non-text target.
  - The capture-phase keyup also fires for a Space typed in the picker's input. That is harmless, because the picker's keydown never sets `space`.

### Out-of-Scope Observations
- (Minor, pre-existing) `window` `blur` releases Space but does not call `dropDrag`. If a `pointerup` is ever lost without a `lostpointercapture`, `panFrom` or `from` would persist, and hover moves would pan or draw. Adding `dropDrag` to the blur handler would close this.
- (Minor) Mid-drag, a Tab onto an off-screen box can now pan the View under a drag in progress. The arrows can already move the draft mid-drag, so this is the same class of behaviour. It is not worth gating.

### Verdict
**Fix round:** All findings addressed, no new Critical/Important breakage.
