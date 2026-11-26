### Task 6: The full lightbox (zoom, pan, region overlays, full resolution)

**Files:**
- Create: `app/src/lightbox/zoom.ts`. This is deliberately separate from Plan 3's `graph/camera.ts`, which has different clamps and conventions (audit #20). Its fit function is named `fitView`, so it can't clash with the local `const fit` at `lightbox/view.ts:56` [C20].
- Modify:
  - `app/src/lightbox/view.ts` (Plan 2 Task 10). Extend it in place; keep `openLightbox` and its `deps`, and keep the `.lb-side` slot, which the Reference view docks the picker into (`reference/view.ts:580-581`) [C22];
  - `app/src/styles.css` (append a "Plan 4 Task 6" section) [R25].
- Test:
  - `app/src/lightbox/zoom.test.ts`;
  - new cases in `app/src/lightbox/regions.test.ts`;
  - `app/src/lightbox/view.test.ts`: new cases, plus the one rewrite below [B4, C19].

**Interfaces:**
- Consumes `openLightbox(api, store, refId, deps)` (`lightbox/view.ts:21-26`), `normRect` and `MIN_REGION` (`lightbox/regions.ts`) [C7], the picker hand-off (Plan 2 Task 10), and `api.lightboxSource` (Task 3).
- **The source swap** [B4, C9]: the lightbox calls `api.lightboxSource(refId)` where it called `api.imagePath(refId)` (`lightbox/view.ts:230-237`). On `Err`, it keeps `thumb1024` and shows the preview note (Review Focus 3, R10).
- Produces:
  ```ts
  export type View = { scale: number; tx: number; ty: number };       // image px -> stage px: x' = x*scale + tx
  export const MAX_ZOOM = 8;                                          // 800 %
  export function fitView(img: { w: number; h: number }, vp: { w: number; h: number }): View;   // letterboxed, centred
  export function zoomAt(v: View, factor: number, pt: { x: number; y: number }, min: number): View;  // keeps image point under pt fixed; clamps scale to [min, MAX_ZOOM]
  export function panBy(v: View, dx: number, dy: number, img: { w: number; h: number }, vp: { w: number; h: number }): View;  // never pans the image fully off-screen
  export function plateOf(v: View, img: { w: number; h: number }): Box;   // in stage px
  export function hitRegion(regions: { tagId: string; region: Region }[], pt: { x: number; y: number }, plate: Box): string | null;  // smallest region under pt
  ```
  - `plateOf` returns stage px, but `normRect` takes client px. The caller adds the stage's client offset (`getBoundingClientRect()`) before `normRect` [C21].
- Controls:
  - **Zoom:** the mouse wheel and trackpad pinch zoom at the cursor. `+` and `-` zoom at the centre, `0` fits the image, and `1` shows 100%, where one image pixel is one CSS pixel.
  - **Pan:** Space+drag or middle-drag.
  - **Arrow keys** [R19]: an arrow key edits the region draft whenever one exists. With no draft, it pans by 10% of the viewport while zoomed in past fit. At fit, it starts the centred draft, as in Plan 2 (`lightbox/view.ts:163-172`). Enter still starts a draft at any zoom. Plan 2's key tests, which run at fit, stay unchanged.
  - **A plain drag still draws a region,** as in Plan 2.
- **Region overlays:** every region tag is outlined. Hovering over one, or Tab focusing it, highlights it with its label, "Stand out › Rim light". The smallest region under the pointer wins. `o` toggles the overlays.
  - The outline stroke is `opInk(store.tax, tag.operationId).base`. This part already holds on main (`lightbox/view.ts:85`) [C29].
  - The label is `opLabel(...).plain`, then ` › `, then the technique name, with the operation part in `.text`.
  - An unknown operation draws in the neutral ink, never amber.
- `v` toggles the value view, as before.
- When `full` is false, or `lightboxSource` failed, the corner shows "Showing a preview — this format can't be shown at full size here." (Review Focus 3).
- The toolbar shows the zoom percentage and the source size, such as "4000 × 3000".
- The lightbox opens with `l`/`L` or the `.lb-open` button (`reference/view.ts:508`, `:596`), as in Plan 2, and from Compare (Task 7) [C8].
- Zoom and pan positions go through the CSSOM, with no new inline `style=` [R26].

- [ ] **Step 1: Write the failing tests**
  - `fitView({w: 4000, h: 3000}, {w: 800, h: 800})` gives `{scale: 0.2, tx: 0, ty: 100}`.
  - `zoomAt(fitV, 2, {x: 400, y: 400}, 0.2)`: the image point under (400, 400) maps back to (400, 400). The scale clamps at `MAX_ZOOM` and never drops below `min`.
  - `panBy` can't move `tx` so far that the image leaves the viewport.
  - **Region under zoom, with literal numbers** [R20]: take a 1000×750 image in an 800×800 stage, with the stage at client (0, 0).
    - Zoomed in at `{scale: 1.6, tx: -200, ty: -150}`, a drag from (200, 250) to (520, 490) gives exactly `{x: 0.25, y: 1/3, w: 0.2, h: 0.2}`, within 1e-9.
    - At fit, `{scale: 0.8, tx: 0, ty: 100}`, the same image rectangle is the drag from (200, 300) to (360, 420), and it gives the same literal region.
  - `hitRegion`: with a large region containing a small one, a point inside both returns the small one's `tagId`.
  - `view`:
    - With `lightboxSource` returning `full: false`, the preview copy is visible.
    - With `lightboxSource` rejecting, `thumb1024` stays and the preview copy is visible.
    - `o` hides the overlays.
    - `1` sets the scale to 1.
    - An arrow key with no draft while zoomed in pans and starts no draft; the same key at fit starts the centred draft.
    - `overlay_ink_from_taxonomy`: a region tag under an added operation with `color: "teal"` is stroked `var(--x-teal)`, and one under an id missing from the taxonomy is stroked `var(--ink-2)` (both already green). The new part: a renamed `plainLabel` shows in the hover label [C29].
  - **Rewrite** `full_image_from_imagePath_with_thumb_fallback` (`lightbox/view.test.ts:286-325`) for `lightboxSource`, keeping its three cases: the full original, a rejection (the thumbnail stays), and a late reply after close. Every other Plan 2 lightbox test stays unchanged [B4].

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- lightbox`. It should FAIL, then PASS. All Plan 2 lightbox tests other than the rewritten one pass unchanged.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): full lightbox with zoom, pan, hover region overlays and preview fallback`.

---

