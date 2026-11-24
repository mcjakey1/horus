---
version: 1
slug: "prototype-index-html"
primary_target: "prototype/index.html"
related_targets: []
---

# Surface: Reference view and app shell (prototype)

**Mode:** Operate.

**Audience:** working artists, at a calibrated monitor in the studio, by day and late at night.

**Job:** open a reference and see what it connects to, and why. The "why" means which technique it shares with other references.

**Scope:**
- The shell: top bar, view tabs, search, record header and status bar.
- The Reference view: the specimen card with numbered region callouts, and the margin column with Callouts, Ranked and Links.
- Re-centring on a related reference.
- The value toggle.
- Light and dark themes.
- Other views appear as tabs only.

**Constraints:**
- Brief-pinned and kept from Iris: curved edges, a colour per operation, serif plus mono, and the growing breadcrumb.
- It must not read as an Iris screenshot, must not look like generic SaaS, the chrome must not crowd the images, and the ground must not tint the art.

**Chosen direction:** Conservation Study.

**Memorable moment:** hover a numbered callout. Its region box lights up on the specimen, a curved leader line draws out to the related references, and the record header fills in that path.

**Unresolved:**
- The real images come from demo/, which is in progress in another session.
- The taxonomy comes from taxonomy/, also in progress.
- The prototype ships with a labelled synthetic fallback until both land.

## Direction contract

THESIS: Every reference is examined the way a conservator examines a painting. It sits on a neutral grey card, and numbered callouts mark where each technique lives. This refuses the category default: a masonry grid with a tag sidebar.

OWN-WORLD:
- A true-neutral shell: #F3F3F2 in light, #151515 in dark.
- The specimen always sits on a constant N5 grey card (#777776) in both themes, so the art is judged against the same ground.
- Operation inks, remapped away from Iris's colours: Differentiate amber #B87F00, Group green #1E8E5A, Sequence blue #2563D0, Infer vermilion #D2462A.
- Source Serif 4 for records, titles and technique names, and Red Hat Mono for ids, scores, states and measurements. Both are self-hosted.
- The UI uses the system UI stack. Inter was dropped because the detector flagged it as overused, and a native face suits a desktop app.
- Hairline rules, no rounded corners on data, and region boxes whose line encodes the tag state: solid is a full tag, dashed a partial tag, dotted a region tag.

STORY: The artist sees one reference, examined. Each callout names a technique and points to the other references that use it. Hovering explains the link, clicking re-centres on another reference, and the trail is kept.

FIRST VIEWPORT:
- Top bar, 52 px: the Horus wordmark, view tabs, and search by idea.
- The record header row, 64 px: the four-level breadcrumb (01 Operation → 04 Reference).
- The left two-thirds: the grey specimen card with the reference at its largest fit and numbered callouts on its regions.
- The right column, 340 px: the margin, with the callouts, each with related thumbnails and scores, plus Ranked and Links tabs.
- At rest, the record header shows the path you arrived on. No leader lines cross the art until a callout is hovered or pinned.
- The card carries an instrument readout: credit · Grey card N5 · Value view on/off.
- The status bar: the library count, the value toggle, and Find similar shown as off.
- The primary action is clicking a related thumbnail.

FORM: Conservation Study, my pick and #1 on my ordered list. seed:c4eba9454026a73e

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
