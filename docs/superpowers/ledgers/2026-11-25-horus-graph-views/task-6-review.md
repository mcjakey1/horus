# Task 6 review: Tree view and inspector (2fecf79..672ef22)

Read-only review of the diff. Outside it I made one focused check per named risk: `scene.ts` (key ownership, `select`, label picking, theme recolour), `frame.ts` (pick grid), `styles.css` (existing `.record`, `.count`, `.thumb`, `--op-text` and `.graph-host` hooks), `index.html` (tree host), DESIGN.md (the Chroma rule) and SPEC §5. I did not re-run the suite.

## Part 1: Spec verdict ❌ (one item; everything else matches)

### Missing
- None that block. Step 3 (the `tauri dev` manual check) was not run, which the report says openly. ⚠️ Not verifiable here: the four bands on screen, technique-label overlap at the 64-unit spacing, and path colouring in the live app.

### Extra
- **New UI strings not quoted in the brief** (binding constraint: "New strings are only those quoted in the brief, verbatim"). See Important I2.
- `InspectorOpts.assetUrl?` (concern 1). It is additive and optional, and needed because the fixed signature carries no `Api`. Accepted. Task 8's brief must pass it, because leaving it out fails silently: the tiles render with no image.
- `move(g, null, …)` landing on the first operation. In the Tree it can't be reached, because the scene consumes the arrows and calls `preventDefault` while nothing is selected (`scene.ts:458-464`). It is harmless, and Task 8 may use it.

### Misunderstood
- None. Concern 3 (off-path operations in `--line-2`) follows the brief literally ("everything else stays hairline `--line-2`"). DESIGN.md:208 says only that chroma *means* an operation, and the plan's wording ("appear only on…") permits operation inks without requiring them. That makes it compliant. Whether the operation nodes should always carry their ink at rest is a design call for the controller, not a defect. See Minor M1, which covers the reverse tension on branch and technique nodes.

### Verified as matching
- **Layout:** the bands come from `layoutTree`, with domains drawn per operation as branch nodes. The inspector is the 340 px grid column (`styles.css:368`), with the breadcrumb docked in it as the 2×2 `.record.insp-crumb` reusing `.cell`, `.k` and `.v`. Empty cells get the existing `.v:empty::before` tertiary dash.
- **The inspector body for each selection kind,** as the brief lists it. The tiles use `tileBox` with the letterbox and the region outlined (ruling a1). Geometry and `--c` are set through the CSSOM, and the markup has no `style=` (tested by spying on the setter).
- **Expansion:** one technique at a time. "Show all references" uses `aria-pressed`, and its setting is held in a module-level session flag.
- **Board scope:** out-of-scope references get `dim: true`, and selecting one is refused.
- **Keys:** `canvasKeys` checks `isTextEntry`, modifiers and `defaultPrevented`, which fits cleanly with the scene's own key ownership (`scene.ts:450-465`). Enter belongs to the scene, and the Tree acts on `activate`.
- **Path colouring and edges:** the edges are hairlines, width 1, never curved, and all axis-aligned. Inked segments sort last.
- **Data change:** it keeps the camera and the selection, and clears the selection when its id is gone. A reset clears the selection and calls `fitAll()`. A hidden Tree marks itself stale and rebuilds on `show()`.
- **Operation count:** nothing hard-codes four operations in the source; only the seed-based tests use 4. The colours are `var(--…)` strings that the scene resolves through a cache it clears on a theme change, so they recolour live. Every operation ink goes through `opInk`.
- **Wiring:** `firstrun.ts` registers the view as the brief says, and the host exists (`index.html:64`).

## Part 2: Quality verdict: Needs fixes

### Critical
None.

### Important

**I1. The inspector re-render drops keyboard focus.** `app/src/views/inspector.ts:104` (`el.innerHTML = …`), called on every selection from `tree.ts` `render()`.
- **Problem:** activating any inspector button (`data-sel` op, branch or technique, "Used under") calls `select`, which calls `render`, which replaces the whole aside. The focused button is destroyed and focus falls to `<body>`, so a keyboard user has to Tab from the top of the page after every step.
- **Why it matters:** the inspector is the guaranteed non-canvas route ("Canvas is never the only route"; Review Focus 1, the WebGL fallback), so the route it guarantees is keyboard-hostile. The same focus loss happens on any store change while focus is inside the aside.
- **Fix:** in `renderInspector`, note whether `el` contained `document.activeElement` before the write. If it did, focus `.insp-title` afterwards, giving it `tabindex="-1"` in the markup. This also gives screen readers an announcement on the new selection, which goes most of the way on concern 4 without an `aria-live` region. Add a test: click `[data-sel="br:differentiate.feature"]` in the fallback test and assert that `document.activeElement` is inside `.insp`.

**I2. New UI copy that the brief does not quote.**
- **The strings:**
  - `inspector.ts:72` "Operations";
  - `inspector.ts:78` "`${n} references`", which also reads "1 references";
  - `inspector.ts:96` "References";
  - `inspector.ts:97` "No reference has this technique yet.";
  - `tree.ts:52` `aria-label="Inspector"`;
  - `styles.css:372` `content: " · on"`. This is CSS-generated text that some screen readers announce on top of `aria-pressed`.
- **Problem:** the plan binds new strings to those quoted in the brief, verbatim.
- **Fix:** drop the strings that aren't needed:
  - show the count with the existing mono `.count` span alone;
  - drop the `::after` and let `aria-pressed` plus the existing `[aria-pressed="true"]` underline carry the state, as `.filter-mode .text-btn` already does at `styles.css:157`.
  - For the headings, the empty-state line and the landmark label, get a controller ruling with the exact wording. The pattern "N references" already exists at `reference/view.ts:187`, so reusing it may be acceptable, but the controller has to say so.

### Minor

- **M1, `tree.ts:88-89,105` (Chroma tension, the reverse of concern 3).**
  - **Problem:** on-path branch and technique nodes are stroked in `opInk(...).base`. The plan's Chroma constraint lists only operation nodes, path edges and technique labels in `-text` ink. The brief explicitly says the branch and technique take the ink, and DESIGN.md:208 permits it (the colour is about that operation), so this follows the brief. The controller should confirm the brief over the plan's wording.
  - **Note:** the scene draws every node label in `var(--ink)` (`scene.ts:229`), so technique labels never get `-text` ink. That is allowed by "only".
- **M2, `tree.ts:75`.**
  - **Problem:** a data change keeps a selected reference that has since gone out of scope, which leaves the selection on a dim node that can't be selected.
  - **Fix:** clear when `!g.nodes.has(sel)` **or** the selected node is a reference with `!s.inScope(refId)`. Add one line to `out_of_scope_refs_are_dots`.
- **M3, `tree.ts` key `move` handler with `navigate.ts:186-195`.**
  - **Problem:** an arrow that lands on an out-of-scope reference is refused, so the arrows can't reach any reference beyond a dim one (↓ from a technique whose first reference is dim does nothing). The inspector tiles still open those references, so no action is lost.
  - **Fix:** in the Tree's `move` callback, step past refused ids in the same direction until one is accepted or `null`.
- **M4, `inspector.ts:31`.**
  - **Problem:** the "02 Domain" `.v` is the only one of the four cells without `serif`. That goes against "Serif for names". ⚠️ It may mirror Plan 1's record header on purpose.
  - **Fix:** use `serif` for all four cells, or add a comment citing the source.
- **M5, `inspector.ts:91`.**
  - **Problem:** the tile buttons get their accessible name only from `title`, with the image `alt=""`. Without `assetUrl` the button has no content at all.
  - **Fix:** add `aria-label="${esc(ref.title)}"`. ⚠️ Out-of-scope references also show as live tiles here; check whether audit row 10 wants them dimmed in the inspector too.
- **M6, tests: Review Focus 2 has no Tree-level test.**
  - **Problem:** there is no mount with `snap(seed, [])`, or with untagged references only, that asserts every `setNodes` x and y is finite (the joints included) and that the operation buttons show `0`.
  - **Fix:** add one small test.
- **M7, concern 2 (joint nodes).**
  - **Problem:** the elbows are about 110 empty, unpickable `label` nodes, each an empty `PIXI.Text`. This works and is confirmed unpickable (`frame.ts:64`). It is acceptable until T4 offers polyline edges; carry it to Task 11's perf measure.
  - ⚠️ Technique-label overlap at the 64-unit spacing can't be verified without the manual check.

### Checklist
- **Lifecycle:** OK.
  - `AbortController` on the listeners, `unsubscribe`, `scene.destroy`, and a late-resolving scene destroyed when `dead`.
  - `insp.onclick` is replaced on each render, so listeners never pile up.
  - `host` is restored on destroy.
- **Keyboard and focus:** I1.
  - The canvas is focusable (`scene.ts:121`), and the key ownership with the scene is correct.
  - With nothing selected, the arrows pan and keyboard selection starts from the inspector. That is by design.
- **Inspector a11y:** it is an `aside` landmark, the controls are real `<button>`s, the toggle uses `aria-pressed`, and the headings are `h2`/`h3`. Gaps are I1 and M5. There is no `aria-live` (concern 4), and I1's fix covers most of it.
- **Selection across data changes:** OK and tested, with M2 as the edge case.
- **Tests are real:**
  - the fake `Scene` mirrors `on(…, (id, mods))`, and `dim` is asserted;
  - the geometry is read from `el.style` after mounting;
  - the `innerHTML` setter spy is a genuine CSP check;
  - the RED evidence was recorded.
- **YAGNI:** fine. `assetUrl?` is justified, and `selectionOf` is used. The inspector builds its own `TaxGraph` on each render, a second build beside the Tree's, but the fixed signature forces this. It is cheap, because only one technique is expanded.
- **Naming:** clear (`pathOf`, `expandedFor`, `HAIR`, `WHOLE`, `j:dn:`/`j:up:`).
