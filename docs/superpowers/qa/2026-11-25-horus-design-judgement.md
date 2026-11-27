# Horus design judgement: the whole app, Plans 1–6 (impeccable critique)

⚠️ DEGRADED: single-context design review (A ran in the judge's own context to keep within the weekly-usage cap; B, the detector, ran as an isolated sub-agent). B's result arrived while A was still in progress. Its one finding (`.fr-error`, first run) touches no surface A had judged, so there was no anchoring in practice.

- **Judge:** session -0c, for controller -02, 2026-11-28.
- **Rules followed:** read-only on code; no app run, no build. The only file written in the repo is this one.
- **Inputs:**
  - Code: `plan6-release` at `0c91aee`, re-checked at `1d6f848`. The QA a11y fixes touch only `picker.ts` and `about.ts`; no line cited below moved.
  - Screenshots: `D:\Design Second Brain\qa-shots\plan6\` (the 71 QA shots).
  - Design context: PRODUCT.md, DESIGN.md, SPEC.md and `plan6-design-proposal.md`.
  - Earlier reports: `plan6-design-review-plans1-4.md` and the Plan 6 QA report.
- **Glyphs:** rendered as a contact sheet from `glyphs.json`, in headless Edge, from a static scratch HTML file (not the app).
- **Icon:** `icons/icon.png` and `32x32.png` viewed directly.

## 1. Verdict

**Does Horus serve an artist's daily reference work?** Yes, for the core loop. The Reference view is the strongest screen in the app, and it is specific to this product:
- The poster sits on the constant N5 card, with numbered callouts in operation inks.
- The record header reads like a catalogue entry (Differentiate · Feature · Silhouette · *Divan Japonais*), and the ranked list states the reason for each match ("shares Silhouette 0.31").
- Search, the "Looks similar" split, Details, Settings and Compare all carry the Conservation Study world consistently. In dark, I opened only reference, about and galaxy-760; those hold up.
- First run is calm and honest: it shows the real download size and the machine's RAM, and it does not push the model.

**Is it coherent with DESIGN.md across all six plans?** Mostly. The rules that matter most hold everywhere I looked:
- The Constant Card Rule.
- The Operation-Only Chroma Rule.
- The Hand and Instrument Rule.
- Hairlines, not shadows.

The Plan 1–4 drift list was fixed in Task 3b and Task 4. I spot-checked part of it: no reused uppercase keys, measurements in mono, and the Library button on the right. I did not check `.plate` or the Galaxy edge curves.

**Where it falls short:**
- **The Tree at fit (F3).** The view that should teach the system reads as a smudged strip.
- **The graph views at 760 px and below.** They are the one layout that still doesn't stack (new, P1).
- **Empty and idle states** that leave an artist without a next step: the Galaxy inspector, Boards, and the Lightbox side column.

**Overall: fit for release on Windows after the two P1s are fixed.** The P2s are a polish pass, not blockers.

**Heuristic scores (Nielsen, 0–4):**

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Indexing state, counts and the board line are all clear; the Galaxy idle inspector is blank. |
| 2 | Match with the real world | 3 | Plain operation labels are a strength. "Grey card N5" in the readout is insider language, but deliberate. |
| 3 | User control and freedom | 3 | Undo, Back, and Esc everywhere. |
| 4 | Consistency and standards | 2 | Graph views don't stack at 760 while every other view does. Two copies of the model size. Operation names set in mono in the picker. |
| 5 | Error prevention | 3 | Safe delete and the empty-title guard. Apply is live in the picker with nothing chosen. |
| 6 | Recognition rather than recall | 2 | Compare (Shift-click), boards (`b`) and links (`k`) depend on keys the empty states don't surface. |
| 7 | Flexibility and efficiency | 3 | The app is keyboard-first throughout. |
| 8 | Aesthetic and minimalist design | 3 | Disciplined. The action chips sit on the card, and the Tree at fit is noise. |
| 9 | Error recovery | 3 | Errors are written as artist copy (Plan 5 R11). |
| 10 | Help and documentation | 2 | The "Keys" disclosure and the intro exist. There is no in-context hint for Compare or boards. |
| **Total** | | **27/40** | **Acceptable**, at the top edge of the band. The two P1s and items 3–6 below are what move it into Good. |

**Design specificity:** high. This UI could not be swapped onto an unrelated product, because of:
- the numbered region callouts;
- the line-style tag states;
- the catalogue record header;
- the serif/mono split.

The new intro ("The first specimen") teaches the product's single gesture with nothing outside DESIGN.md, and that is the best moment of the Plan 6 work.

## 2. Findings (ranked; 15)

There are no P0s. Every P1 must land **before the build**. P2s marked **[pre-build, cheap]** are CSS or one-line changes that are safe to fold in. The rest can wait for v0.1.1. The 4 low items (13–15, and the copy in 12) are P2-low; -02 asked for P0/P1/P2 only, so there is no P3 tier.

| # | Sev | When |
|---|---|---|
| 1 | P1 | **before build** |
| 2 | P1 | **before build** |
| 8, 9, 11, 14 | P2 | before build if cheap (CSS or one line each) |
| 3, 4, 5, 6, 7, 10 | P2 | can wait |
| 12 | P2 | needs the user's OK on SPEC copy; can wait |
| 13, 15 | P2-low | can wait |

### P1: fix before the build

**1. At ≤760 px, the top bar overflows into the graph views, and the views don't stack.**
- **Where:** `tree-light-760.png` ("Show all references" printed over the Radial and Inbox tabs), `galaxy-dark-760.png` (inspector over the "Boards" tab), `radial-light-760.png`. The graph is cut at the 410 px canvas edge in all three.
- **Cause (two rules):**
  1. **Shell rows:** `styles.css:313`, `body[data-view]:not([data-view="reference"]) { grid-template-rows: 52px 1fr 36px; }`. At ≤760, `.top` wraps to two rows (`:200-201`: the tabs take `order:3; width:100%`), but this selector outranks the 760 block's `body { grid-template-rows: auto … }` (`:199`). So the non-Reference views keep a 52 px first row, the wrapped tab row spills into row 2, and the view paints over it. This hits every non-Reference view; Inbox and Boards hide it because their content starts lower.
  2. **No stacking for the graph hosts:** `.graph-host.tree` (`:395`), `.graph-host.radial` (`:458`) and `.gx` (`:468`) keep `minmax(0,1fr) 340px` at every width. The Inbox (`:356-360`) and the Lightbox (`:379-384`) have 760 overrides; these three don't.
- **Exact fix:** add this to the end of the `@media (max-width: 760px)` block that starts at `styles.css:198`, or as a new block after `:470`:
  ```css
  @media (max-width: 760px) {
    body[data-view]:not([data-view="reference"]) { grid-template-rows: auto minmax(0, 1fr) auto; height: 100%; }
    .graph-host.tree, .graph-host.radial, .gx { grid-template-columns: minmax(0, 1fr); grid-template-rows: minmax(0, 1fr) auto; }
    .graph-host .insp, .gx-insp { max-height: 40vh; border-left: 0; border-top: 1px solid var(--line); }
  }
  ```
  Keep `height: 100%` so the canvas row gets real height rather than content height. The Reference view keeps its own scrolling 760 layout (`:199`).
- **Check after:** re-shoot tree, galaxy, radial, inbox and boards at 760 in both themes. The tabs must sit on their own row above the view; the canvas must be full width with the inspector under it; the page must not scroll. Also check that `fitAll` re-runs on the narrower canvas: in `tree-light-760` the fit was computed for a wider stage.

**2. F3: the Tree at fit is unreadable.** The exact fix (3 parts, about 10 lines) is in §3.
- **Where:** `tree-light-1280.png`.
- **Problem:**
  - At fit, the whole taxonomy is a 750 × 120 px strip in a 940 × 700 px canvas.
  - The operation, domain and technique labels touch, and hierarchy lines strike through the domain names.
  - The view meant to "learn the system" (SPEC §5) shows it as noise on arrival.

### P2: polish pass

**3. The Galaxy opens with a blank inspector, and untagged references dominate.** Can wait.
- **Where:** `galaxy-light-1280.png`.
- **Problem:**
  - With no selection, the 340 px column is empty.
  - The 121 untagged references form a big outer ring around the 50 tagged ones. That ring is the most visible shape on screen, and it means nothing.
  - An artist who hoards first (the main intake workflow) sees mostly this ring.
- **Fix:**
  - Add an idle inspector at `views/galaxy.ts:114`, which today renders `""` when nothing is selected. Make it `<div class="insp-body"><p class="gx-note">Select a reference to see its strongest neighbours.</p></div>`, with the counts tagged · untagged and the keys (arrows, Enter, Shift-click to compare).
  - Draw untagged nodes at about 60% size and 50% alpha in `views/galaxy.ts`, so the correlated core leads.

**4. The Boards empty state is a footnote.**
- **Where:** `boards-light-1280.png`; `boards/view.ts:71`.
- **Problem:** two lines of 13 px text at top-left of a 220 px column, beside a blank canvas. Boards are the Brief workflow, so this screen should start one.
- **Fix:** centre a short empty state in the main area: the serif line "Boards are working sets for one piece", a **New board** button, and "or press b on any reference". Keep the left column for the list.

**5. Compare buries its own answer.**
- **Where:** `compare-light-1280.png`; `styles.css:595` and `compare/view.ts:93-103`.
- **Problem:**
  - The score "0.40 · related by technique" is the smallest text on the screen: 12 px secondary mono in the corner.
  - "Shared" floats as a narrow column at top-centre, holding one row.
  - The path drops the domain ("Make them think › Genre quotation"), against Principle 4.
  - The **Lightbox** links sit above each card, slightly offset from its edge.
- **Fix:**
  - Set the score as Readout (mono 16 px, ink) at the head of the Shared column, with "related by technique" as a caption.
  - Show the full op › domain › technique path in Shared.
  - Align the Lightbox links to the card's left edge.

**6. The Lightbox wastes its side column and frames the art in blue.** Can wait.
- **Where:** `lightbox-light-1280.png`; `styles.css:363` (the grid `1fr 340px`) and `.lb-side`.
- **Problem:**
  - When no tag dock is open, the 340 px side column is empty, so 27% of a "study the pixels" view is blank panel.
  - On open, `lightbox/view.ts:173` calls `stage.focus()`. Because the lightbox was opened with `l` (a key), the global `:focus-visible` ring (`styles.css:44`) frames the painting for the whole session, before the user has done anything.
  - This shot was keyboard-opened (harness), so a mouse-opened lightbox may not show the ring.
- **Fix:**
  - Collapse the side column to 0 while the dock is empty, for example `.lightbox:not(:has(.lb-side > *))`, or a class set by the dock.
  - At `:173` (and `:165`), use `stage.focus({ preventScroll: true, focusVisible: false })`. Chromium/WebView2 supports `focusVisible`; WebKit ignores it harmlessly. The compliant 2 px ring still appears the moment the user Tabs or uses a key that moves focus.
  - Do not weaken the ring itself: it is the WCAG 2.2 indicator.

**7. The action chips sit on the specimen card.** Can wait. This reverses the earlier review's F1, which put the row on the card (`plan6-design-review-plans1-4.md:13`) to fix a collision. A move off the card must keep that fix: one row, nothing painting over the readout.
- **Where:** `reference-light-1280.png` / `-dark`; `styles.css:123`.
- **Problem:** five panel chips (Tag…, Link…, Boards…, Open lightbox, Details…) sit inside the N5 card, above the art. The card is the judging ground (Constant Card Rule, "the image leads"), and this is the busiest chrome on the best screen.
- **Fix:** move `.lab-actions` out of the card into a hairline toolbar row between the record header and the card, or onto the right end of the record header. Keep the keys.

**8. Long titles balloon in ranked rows.** [pre-build, cheap]
- **Where:** `reference-light-1280.png`, where "Plum Garden at Kameido…" wraps to 6 lines.
- **Problem:** one long Library of Congress title pushes the list down by half a screen. Imported titles from real collections will be long.
- **Fix:** clamp the row title to 2 lines (`display:-webkit-box; -webkit-line-clamp:2; overflow:hidden`) and put the full title in `title`. The same applies to the search-result rows.

**9. The "Drop an image to find similar" zone reads as a stray tooltip.** [pre-build, cheap]
- **Where:** `search-dropdown-light-1280.png`; `styles.css:655`.
- **Problem:** with the list open, the zone is a shadowed box hanging left of the list. It covers the "03 Technique" key, and nothing marks it as a drop target.
- **Fix:**
  - Use a 1 px dashed `--line-2` border (the drop-target convention) and drop the Menu-lift shadow: it is not a menu.
  - Align its top with the list's top edge (`top: 0` relative to the list) so it reads as part of the same control.

**10. Glyphs: uneven optical size.** (See §2a.)
- **Where:** `app/src/glyphs/glyphs.json`.
- **Problem:** about 8 of the 60 glyphs read as specks at 24 px:
  - "a row of four circles with an empty dotted gap…"
  - "a row of identical squares with one turned on its corner"
  - "a circle with an arrow pointing to an identically sized sphere-like shape"
  - "a dot, a plus sign, a dot, an equals sign…"
  - "two tight clusters of dots…"
  - "a tight cluster of dots with one dot far off…"
  - "a small fish shape sitting on a bookshelf…"
  - "a small arrow followed by the numbers 1, 2, 3", whose drawn digits are about 4 px tall.
- **Fix:**
  - Redraw these eight to fill a 20 × 20 live area, at least 12 px tall: two rows instead of one long row, and larger dots.
  - Replace the tiny "123" with three drawn ascending marks.
- **Stroke weights are fine:** every root is 1.5. The eight inner overrides (four at 1.2, two at 1.1, two at 1.8) are deliberate detail, so leave them.

**11. The Inbox picker sets operation names in mono, and Apply is live with nothing chosen.** [pre-build, cheap: the CSS line. The Apply `disabled` state touches `picker.ts`, which f6673a9 just changed, so re-run `picker.test.ts`.]
- **Where:** `inbox-light-1280.png`; `styles.css:276` and `tagging/picker.ts:56`.
- **Problem:**
  - "Differentiate" is a name, so by the Hand and Instrument Rule it can't be mono.
  - Apply sits enabled under "Choose an operation, or press 1–4."
- **Fix:**
  - `.pk-op .mono` becomes caption: system UI 12 px, ink-2, no letter-spacing.
  - Disable `.pk-apply` until an operation or technique is chosen.

**12. The model size appears twice, and the two values disagree.**
- **Where:** `firstrun-light-1280.png`, `settings-light-1280.png`; `settings/find-similar.ts:9`.
- **Problem:** the copy says "a 150–350 MB image model", and the line under it says "Download: 213 MB" (Settings: "Disk space used: 214 MB").
- **Fix:** change the sentence to "It downloads a 213 MB image model…". This is SPEC §5a's verbatim question, so **the user must OK the wording change.**

### P2-low: can wait

**13. Taxonomy nodes in the Tree and Radial are squares.**
- **Where:** `tree-light-1280.png`, `radial-light-1280.png`; the operation node is a filled ink square.
- **Problem:** DESIGN.md reserves circles for markers and squares for data containers. The reference thumbnails are rightly square; the taxonomy nodes are markers.
- **Fix:** draw operation, domain and technique nodes as circles, with the operation in its ink and the rest hairline. Alternatively, record the square as a deliberate graph exception in DESIGN.md.

**14. Detector: the side stripe on `.fr-error`.** [pre-build, cheap: one CSS line]
- **Where:** `styles.css:247` (the only detector finding; see §5).
- **Problem:** `border-left: 3px solid var(--ink)` is a one-sided accent stripe. DESIGN.md separates surfaces with 1 px hairlines.
- **Fix:** 1 px `--line-2` on all four sides, with the message led by a bold first sentence.

**15. App icon: keep it, with one caution.** (See §2a.) No change required. The caution is the risk that the four dots read as Google's palette.

### 2a. The new app icon and glyphs

**Icon** (`icons/icon.png`, user-supplied):
- **Coherent.** It is a dark tile, with a white crop-mark frame (a region box) holding the four seed inks in a 2 × 2 grid. It is the intro's specimen reduced to a mark, and it survives at 32 px (`32x32.png`).
- **Risk:** four flat dots in yellow, green, blue and red on a 2 × 2 grid read close to Google's four-colour palette. The intro's boxes, not dots, are the product's own gesture.
- **Recommendation:** keep the icon. If the user ever revises it, make the dots small region boxes, or let one quadrant be "lit" and three at rest.
- **Not checked:** the 16 px taskbar size.

**Glyphs** (60, `glyphs.json`):
- The set is consistent in kind: 24 px line art, currentColor, round caps, and a 1.5 root stroke on all 60. Most glyphs read well: chiaroscuro's half-lit circle, corner brackets, the eye, the column, the speech bubble.
- The weak point is optical size (finding 10). Line glyphs that fill the box sit beside one-row glyphs only 4 px tall, so the picker grid looks uneven and those few read as noise.
- The keys being prose descriptions is fine: they double as the tooltip.

## 3. Ruling on F3 (Tree labels at fit)

**Ruling: P1.** F3 is not cosmetic.

The Tree is the "learn the system" view, and Principle 4 says the path is always readable. On arrival, operation names sit on domain names ("Group" on "Grouping", "Sequence" on "Space"), and hierarchy lines strike through domain labels. The first look at the taxonomy is noise. Zooming in recovers it, but the first impression is what teaches.

**Root cause** (code plus the 1280 shot):
- Fit is bound by width: the techniques are spread over `LABEL_W` = 184 world units each, so the whole tree is about 750 px wide and only about 130 px tall.
- The Tree's bands sit at `y = BAND_GAP`, `2 × BAND_GAP` and `3 × BAND_GAP` (`graph/layout-tree.ts:64, :79, :89, :94`), with the shared `BAND_GAP = 160` (`graph/constants.ts:10`). At this fit, the operation, domain and technique node rows measure about 32 screen px apart (y ≈ 398, 430, 462).
- Labels are drawn at a constant 12 px (`LABEL_PX`, `graph/frame.ts:60`), start 4 px under their node, and stagger over 3 rows 16 px apart (`LABEL_ROW_PX`, `constants.ts:21`; `scene.ts:334`). A label block is therefore up to 4 + 2×16 + 12 = 48 px deep, which is more than the 32 px band step. Lower-row labels of one band land on the next band's node row and its connectors.
- About 75% of the canvas height sits empty.

**Exact fix, three parts:**
1. **Root fix (layout-tree.ts):** add `export const TREE_BAND = 2 * BAND_GAP;` in `constants.ts`. Use it in place of `BAND_GAP` at `layout-tree.ts:64, :79, :89, :94` and `views/tree.ts:158` (the reference-block offset must move with the bands). At today's fit, this gives about 64 px per band, more than the 48 px label block. The tree grows to about 260 px, still width-bound, so the scale is unchanged. Leave `layout-radial.ts` on `BAND_GAP`. Update any `layout-tree` test that pins `y` values to `TREE_BAND`.
2. **Label halo (`graph/scene.ts:253`):** add `stroke: { color: resolveColor("var(--shell)"), width: 4, join: "round" }` to the `PIXI.Text` style, so hierarchy lines pass behind names, never through them. It must re-resolve on a theme switch, as `fill` does.
3. **Near-touch margin (`scene.ts:339`):** grow the overlap box by 4 px: `x: … - 2`, `w: … + 4`, `h: LABEL_PX * 1.25 + 4`. Labels that merely touch then hide by rank, as full overlaps already do.

Re-shoot `tree-*-1280` and `tree-*-760` after the fix. That should show no label touching another and no line through a label, with every operation name and most domain names visible.

## 4. What I couldn't check

- **Motion:** the intro animation (I saw one mid-sequence frame and the end state), hover leaders, the record-value stagger, and reduced-motion behaviour. Screenshots only.
- **Live interaction:** hover and pin states on callouts, the Galaxy selection inspector, drag-to-link, the tag picker with an operation chosen, the board tiles with members, the Tree inspector's icon picker (glyphs judged from the contact sheet only), and focus order.
- **Views not seen:** I opened 21 of the 71 shots:
  - Light 1280: reference, tree, inbox, galaxy, radial, compare, lightbox, boards, intro, search-dropdown, details and settings.
  - First run.
  - Dark 1280: reference and about.
  - 760: reference, compare, radial, tree, inbox, and galaxy (dark).
- **Not opened:** `reference-similar` (any), about in light, the whole 1100 set, and most dark and 760 variants (budget). The 1100 step-down is unseen. QA's axe pass covers contrast.
- **Callouts tab:** the signature callout card (DESIGN "Callout card") is in none of the shots I opened; every reference shot has Ranked or Looks similar selected.
- **Badge "3" on Divan Japonais:** it floats at the plate's top-right with no box. It is probably the whole-image tag ("no outline until hot"), but DESIGN.md puts a badge at a box's top-left corner. Not verified without a hover.
- **Platforms and scale:** macOS and Linux rendering (WebKit fonts, Pixi text halo), and a 2,000-reference Galaxy.
- **Live overlay:** the browser overlay of the detector, because the app wasn't run, by rule.
- **Not persisted:** the impeccable critique snapshot (`.impeccable/critique/`), because this pass is read-only outside this file.

## 5. Detector (Assessment B, isolated sub-agent)

- `impeccable detect --json app/index.html`: exit 0, clean.
- `impeccable detect --json app/src`: exit 2, 1 finding. `side-tab` at `styles.css:247` (`.fr-error`), real, low. It is finding 14.

Agreement with the review: the detector finds almost nothing, which matches the review's read that the CSS is disciplined. It cannot see layout (finding 1), canvas text (F3) or empty states (3, 4). Those come from the screenshots.

## 6. Questions for the user (via -02)

1. **Scope:** fix only the two P1s before release (760 graph stacking, F3), or also items 3–9 (empty states, Compare, Lightbox, chips on the card)?
2. **Copy:** may the SPEC §5a sentence change to "a 213 MB image model" (finding 12)?
3. **Icon:** keep the four-dot icon as is, or revisit later toward region boxes (§2a)?

**Answered (via -02):** you ruled that all 15 findings get fixed before the build. The icon stays, and the "213 MB" copy is approved.

## 7. Final look (40af415, before the build)

I made one short pass on `qa-shots\plan6-final\`.
- **Opened:** tree (light and dark 1280, light 760), galaxy (1280, 760), radial 760, reference (1280, 760), compare, lightbox, boards (1280, 760), search-dropdown, picker and settings.
- **Spot-checked in code:** `styles.css:253` (`.fr-error`), `:693` (`.sim-drop`) and `settings/find-similar.ts:9`.

**Verdict: BUILD OK.** No must-fix items.

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Graph views at ≤760 | **Resolved** | Tree, galaxy and radial at 760: the tabs sit on their own row, the canvas is full width with the inspector under it, and nothing overlaps. |
| 2 | F3, Tree at fit | **Resolved** (see residue below) | tree-light/dark-1280: bands about twice as deep, haloed labels, circle markers, no line through a name. |
| 3 | Galaxy idle and untagged ring | **Resolved** | Idle inspector shows the hint, "50 tagged · 121 untagged" and the keys. Untagged nodes are dimmed (dots at 760), and the tagged core leads. |
| 4 | Boards empty state | **Resolved** | Centred "Boards are working sets for one piece.", a name field, New board, and "or press b". |
| 5 | Compare | **Resolved** | 0.40 as the readout heads the Shared column; full op › domain › technique paths. |
| 6 | Lightbox | **Resolved** | The stage is full width and carries no blue ring on open. |
| 7 | Chips on the card | **Resolved** | They are in a hairline toolbar above the card, the card is clean, and the readout is unobstructed (the earlier F1 is kept). |
| 8 | Ranked titles | **Resolved** | 2-line clamp with an ellipsis. A "Shift-click one to compare" hint was added. |
| 9 | Drop zone | **Resolved** | No menu shadow; top aligned with the list. |
| 10 | Glyphs | **Resolved** | c3bef3b; the picker shows Chiaroscuro and Pop-out at set weight. |
| 11 | Picker | **Resolved** | Operation names are in the UI caption face, not mono. |
| 12 | 213 MB copy | **Resolved** | Settings: "It downloads a 213 MB image model…". |
| 13 | Square nodes | **Resolved** | Tree operation markers are now ink circles. |
| 14 | `.fr-error` stripe | **Resolved in code** | `styles.css:253`; hairlines all round. Not in any shot. |
| 15 | Icon | Kept (user ruling) | |

**The drop-zone border (-bb kept it solid): I agree.** DESIGN.md's Line Says the State Rule gives dashed to partial tags. A dashed drop zone next to the specimen would read as a partial tag. The solid hairline without the shadow is enough. My dashed suggestion is withdrawn.

**-b5's note (Tree ticks behind the lower domain labels): not a blocker.**
- At fit, the third stagger row of domain labels ("Feature", "Social", "Space", "Cultural", about y 477 in tree-light-1280) sits in the band where the technique connectors drop. The ticks stop at the labels' shell halo, so nothing strikes through, but the row reads busy.
- **Cause:** the domain labels' 3-row stagger (up to 48 px) reaches the technique connector bar, which sits mid-band.
- **Fix after the build (P2-low):** cap the domain band at 2 stagger rows, or move the technique connector bar to about 8 px above the technique nodes in the Tree's edge drawing.

**New, all P2-low, after the build:**
- **Compare:** the Shared path wraps mid-name in the narrow middle column ("Genre / quotation"). Fix: `white-space: nowrap` on the technique name, or a wider middle column.
- **Narrow fit:** at 760 the Tree and Radial fit to a canvas about 245 px tall, so they show only 4–8 names. That is expected at this size; zoom recovers it. Optional: a taller canvas row (`minmax(50vh, 1fr)`).
- **Boards at 760:** the 220 px list column does not stack. It still fits, so this is cosmetic.
- **Drop zone:** it still covers the "03 Technique" key of the record header while the list is open. It is transient (only while the list is open), so acceptable.

## 8. Quick look 2 (4459883, before the build)

One short pass.
- **Shots:** `qa-shots\plan6-design3\` (taken at 442ef77): tree light 1280 and 760, compare, boards 760, radial 760, and search-dropdown. Also -4a's `picker-domainrow-light-1280.png`.
- **Code checked at 4459883:** `styles.css:63` and `:284`, and `tagging/picker.ts:85` and `:199`.

**Verdict: 3 small items to fix before the build** (you asked for everything). Everything else is BUILD OK.

**§7's five items: resolved.**
- **Tree bar:** at 1280, the technique bar now runs just above the technique nodes, and the domain labels sit clear of it.
- **Compare:** the Shared path breaks only between segments ("Make them think › Cultural ›" / "Genre quotation").
- **760 graphs:** the canvas is now about 3/5 of the height.
- **Boards at 760:** the list stacks above the empty state.
- **Drop zone:** it now hangs under the list, at the list's width, and no longer covers the record header.

**-4a's picker domain row: good.** The legend "Domain for Complementary pairing" is a block caption, the radios sit on their own row, and the hairline above matches the chips. It reads as one step after choosing a card.

**Fix before the build:**
1. **The Tree at 760: domain labels sit on the technique bar.**
   - **Where:** `tree-light-760.png`. At this scale the band step is about 48 px. The third-row domain labels ("Space", "Feature", "Feature", "Social", "Space", "Cultural", around y 369) land on the technique bar, and "Sequence" has connector lines running into it. The halo keeps the text legible, but it reads as clutter. At 1280 it is fine.
   - **Fix (small, in `graph/scene.ts` where the overlap boxes are built, about `:339`):** treat each technique bar as an obstacle. Push a box `{ y: barY*cam.scale, h: 2, x/w: bar span }` with rank 0 into `names`, so a label that would cross it hides by rank. Alternatively, when the on-screen band step is under 3 × `LABEL_ROW_PX` + `LABEL_PX` (60 px), stagger domain labels over 2 rows instead of 3.
2. **The picker search's clear "×" is native blue.**
   - **Where:** `picker-domainrow-light-1280.png` (the × in the field). Only `.search input` restyles the cancel glyph (`styles.css:63`), but `.pk-search` and `.tx-search` are also `type="search"` (`picker.ts:53`, `move-tags.ts:93`). The default glyph is blue, which is chroma that names no operation (the Operation-Only Chroma Rule).
   - **Fix:** extend the selector at `:63` to `.search input::-webkit-search-cancel-button, .pk-search::-webkit-search-cancel-button, .tx-search::-webkit-search-cancel-button`.
3. **"+ New technique" is offered for a name that already exists.**
   - **Where:** the same shot. Typing "complementary pairing" lists the existing Complementary pairing card and also offers to create it again. That is an error-prevention gap: it invites a duplicate technique.
   - **Fix:** `picker.ts:85` becomes `const showNew = () => !!S.op && S.q.trim() !== "" && !visible().some((t) => t.name.trim().toLowerCase() === S.q.trim().toLowerCase());`, plus one test in `picker.test.ts`.

**Noted, no change needed:**
- **Radial at 760:** labels sit close to spokes and reference dots, but the halo keeps every name readable. That is expected at this size.
- **Ranked sublines:** a subline wraps to 2 lines when a pair shares two techniques ("shares Crop at the edge, Occlusion"). Fine.

## 9. Quick look 3 (579cf07, before the build)

One short pass.
- **Shots:** `qa-shots\plan6-tree760b\` (tree light 760, light 760 after a late font load, light 1280, dark 760) and `plan6-tree760\`.
- **Code checked:** the diff from 4459883 to 579cf07 in `styles.css`, `tagging/picker.ts`, `graph/scene.ts` and `graph/frame.ts`.

**Verdict: 1 small must-fix item**; the rest is BUILD OK.

**Quick look 2's three items: resolved.**
1. **Tree at 760:** no label sits on a connector bar any more, in light or dark. The bars are name obstacles (`scene.ts:371`, `barBoxes`).
2. **The clear "×":** `.pk-search` and `.tx-search` now share the main search's ink-2 masked cross (`styles.css:63`).
3. **"+ New technique":** it is hidden on an exact name match. `picker.ts` uses the backend's `name_key` rule (case and spacing). A name that exists only under another operation still offers New, and its NameTaken answer offers "use it", which is the right call.

**-bb's font fix: confirmed.** `tree-light-760` and `tree-late-light-760` are identical. Every name is set in Source Serif 4 at full ink, with no cut final glyphs and no lighter fallback face.

**Must-fix before the build:**
1. **"Sequence", an operation name, is hidden in the Tree at fit at 760** (`tree-light-760`, `tree-dark-760`; Differentiate, Group and Infer show). At 1280 it shows, but one row lower than its peers (y 414 against 382).
   - **Cause:** `labelRows` staggers every band over 3 rows (`graph/layout-tree.ts:42`, `k % 3`), operations included. Sequence gets row 2, which at 760 crosses the operation-to-domain bar, so the new bar obstacle hides it. An operation name is the top of the path (Principle 4), and the band holds at most 9 widely spaced operations, so it never needs a stagger.
   - **Fix:** `layout-tree.ts:42` becomes `band.forEach((id, k) => rows.set(id, kind === "op" ? 0 : k % 3));`. Update any `layout-tree` test that pins operation rows. Then all four operation names sit on one line at every width.

**Noted, no change needed:** at 760, some domain and technique names hide by rank at fit. That is expected at this size, and zoom recovers them.
