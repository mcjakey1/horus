---
name: Horus
description: A local reference workbench where each image is examined like a painting on the conservator's bench.
colors:
  shell: "#F3F3F2"
  panel: "#FAFAF9"
  hairline: "#D9D9D7"
  hairline-strong: "#C4C4C2"
  ink: "#161616"
  ink-secondary: "#545452"
  ink-tertiary: "#6E6E6C"
  shell-dark: "#151515"
  panel-dark: "#1B1B1B"
  hairline-dark: "#2E2E2E"
  hairline-strong-dark: "#3A3A3A"
  ink-dark: "#ECECEB"
  ink-secondary-dark: "#B4B4B2"
  ink-tertiary-dark: "#9A9A98"
  grey-card-n5: "#777776"
  card-ink: "#F4F4F3"
  differentiate-amber: "#B87F00"
  differentiate-amber-text: "#7D5600"
  differentiate-amber-on: "#161616"
  group-green: "#1E915C"
  group-green-text: "#156B43"
  group-green-on: "#161616"
  sequence-blue: "#2563D0"
  sequence-blue-text: "#1D4FA8"
  sequence-blue-on: "#FFFFFF"
  infer-vermilion: "#D2462A"
  infer-vermilion-text: "#A8341C"
  infer-vermilion-on: "#FFFFFF"
  differentiate-amber-dark: "#E0A42A"
  differentiate-amber-text-dark: "#E8B54A"
  group-green-dark: "#3DB07A"
  group-green-text-dark: "#5CC592"
  sequence-blue-dark: "#5B8DEB"
  sequence-blue-text-dark: "#8AAEF2"
  infer-vermilion-dark: "#EC6A4E"
  infer-vermilion-text-dark: "#F28A72"
  operation-on-dark: "#161616"
  extra-teal: "#089B9B"
  extra-teal-text: "#066B6B"
  extra-teal-on: "#161616"
  extra-olive: "#6A7A1A"
  extra-olive-text: "#455011"
  extra-olive-on: "#FFFFFF"
  extra-rose: "#BC4E7B"
  extra-rose-text: "#9B3B63"
  extra-rose-on: "#FFFFFF"
  extra-indigo: "#8C84DB"
  extra-indigo-text: "#675DD0"
  extra-indigo-on: "#161616"
  extra-umber: "#815637"
  extra-umber-text: "#5D3E28"
  extra-umber-on: "#FFFFFF"
  extra-teal-dark: "#0ABDBD"
  extra-teal-text-dark: "#0BDADA"
  extra-olive-dark: "#9AA951"
  extra-olive-text-dark: "#A7B464"
  extra-rose-dark: "#ED7EAC"
  extra-rose-text-dark: "#F098BD"
  extra-indigo-dark: "#B7A4EF"
  extra-indigo-text-dark: "#CBBEF4"
  extra-umber-dark: "#A67E59"
  extra-umber-text-dark: "#B08E6D"
typography:
  wordmark:
    fontFamily: "Source Serif 4, Iowan Old Style, Georgia, serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "-0.01em"
  record:
    fontFamily: "Source Serif 4, Iowan Old Style, Georgia, serif"
    fontSize: "21px"
    fontWeight: 500
    lineHeight: 1.2
  title:
    fontFamily: "Source Serif 4, Iowan Old Style, Georgia, serif"
    fontSize: "17px"
    fontWeight: 500
    lineHeight: 1.25
  item:
    fontFamily: "Source Serif 4, Iowan Old Style, Georgia, serif"
    fontSize: "15px"
    fontWeight: 500
    lineHeight: 1.25
  note:
    fontFamily: "Source Serif 4, Iowan Old Style, Georgia, serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI Variable Text, Segoe UI, Helvetica Neue, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "system-ui, -apple-system, Segoe UI Variable Text, Segoe UI, Helvetica Neue, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  readout:
    fontFamily: "Red Hat Mono, ui-monospace, Cascadia Mono, monospace"
    fontSize: "16px"
    fontWeight: 500
    fontFeature: "tnum"
  score:
    fontFamily: "Red Hat Mono, ui-monospace, Cascadia Mono, monospace"
    fontSize: "12px"
    fontWeight: 500
    fontFeature: "tnum"
  label:
    fontFamily: "Red Hat Mono, ui-monospace, Cascadia Mono, monospace"
    fontSize: "11px"
    fontWeight: 500
    letterSpacing: "0.03em"
rounded:
  data: "0px"
  field: "2px"
  marker: "50%"
spacing:
  gutter: "20px"
  gutter-compact: "16px"
  inset: "12px"
  thumb-gap: "8px"
components:
  top-bar:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    height: "52px"
    padding: "0 20px"
  view-tab:
    textColor: "{colors.ink-secondary}"
    typography: "{typography.body}"
    padding: "0 12px"
  view-tab-active:
    textColor: "{colors.ink}"
  search-field:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "32px"
    padding: "0 12px"
  record-cell:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    typography: "{typography.record}"
    padding: "10px 20px"
  specimen-card:
    backgroundColor: "{colors.grey-card-n5}"
    rounded: "{rounded.data}"
  callout-card:
    backgroundColor: "{colors.shell}"
    textColor: "{colors.ink}"
    rounded: "{rounded.data}"
    padding: "{spacing.inset}"
  callout-badge-differentiate:
    backgroundColor: "{colors.differentiate-amber}"
    textColor: "{colors.differentiate-amber-on}"
    rounded: "{rounded.marker}"
    size: "26px"
  callout-badge-group:
    backgroundColor: "{colors.group-green}"
    textColor: "{colors.group-green-on}"
    rounded: "{rounded.marker}"
    size: "26px"
  callout-badge-sequence:
    backgroundColor: "{colors.sequence-blue}"
    textColor: "{colors.sequence-blue-on}"
    rounded: "{rounded.marker}"
    size: "26px"
  callout-badge-infer:
    backgroundColor: "{colors.infer-vermilion}"
    textColor: "{colors.infer-vermilion-on}"
    rounded: "{rounded.marker}"
    size: "26px"
  related-thumbnail:
    backgroundColor: "{colors.grey-card-n5}"
    rounded: "{rounded.data}"
    size: "64px"
  status-bar:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    height: "36px"
    padding: "0 20px"
---

# Design System: Horus

## Overview

**Creative North Star: "The Conservation Study"**

Every reference is examined the way a conservator examines a painting. The image sits on a constant mid-grey card, numbered callouts mark where each technique lives, and a record header above it reads like a catalogue entry: operation, domain, technique, reference. The chrome around the card is a true-neutral desk (no warm or cool cast) built from hairline rules and flat panels, so nothing in the interface tints the art.

The system is dense but quiet. Colour belongs only to the four operations, and it appears only where an operation is named: a callout's number, its region box when hot, its leader line, and the operation's name in the path. Everything else is ink on paper. A serif carries the things a conservator would write by hand (titles, records, technique names), a mono carries the things an instrument would print (ids, scores, states, the card readout), and the platform's own UI face handles controls.

Motion explains rather than decorates. At rest no line crosses the art. Hovering or pinning a callout lights its region box, draws a curved leader out to the related references, and fills the record header with that path.

**Key Characteristics:**
- True-neutral shell in both themes. The specimen always sits on the same N5 grey card.
- Four operation inks, used only to name an operation.
- Serif for records, mono for instrument readings, system UI for controls.
- Square data containers, circular markers and curved connectors.
- Region boxes encode tag state in their line style.
- The record header keeps the path you arrived on.

## Colors

A colourless desk around a fixed grey card, with four operation inks as the only chroma.

### Primary
- **Differentiate Amber** (differentiate-amber; dark: differentiate-amber-dark): the "Stand out" operation. Fills its callout badges, strokes its hot region boxes and leader lines, and outlines the related thumbnail on hover. Use `differentiate-amber-text` when the operation name is set as text on the panel.
- **Group Green** (group-green / group-green-dark): the "Hold together" operation, in the same roles.
- **Sequence Blue** (sequence-blue / sequence-blue-dark): the "Lead the eye" operation, in the same roles. Sequence Blue also serves as the focus ring (in dark mode the ring uses sequence-blue-text-dark), the text-selection tint (28% mix) and the flash on a newly ranked row (12% mix).
- **Infer Vermilion** (infer-vermilion / infer-vermilion-dark): the "Make them think" operation, in the same roles.

Each ink comes in three forms: the base ink for fills and strokes, a `-text` variant darkened (light theme) or lightened (dark theme) for legible type on the panel, and an `-on` colour for the numeral inside a filled badge. In the light theme, amber and green take near-black numerals while blue and vermilion take white. In dark, every badge takes near-black (operation-on-dark).

### Extra operation inks
Operations are data: an artist can add up to nine. The four seed operations keep the inks above; an added operation takes one of five extra inks, the first free one unless the artist picks another. The Operation-Only Chroma Rule is unchanged: these inks only ever name an operation.

- **Teal** (hue 180°), **Olive** (70°), **Rose** (335°), **Indigo** (246° light, 255° dark; kept clear of Iris's purple, about 285°) and **Umber** (25°, darker and less saturated than Vermilion).
- Tokens: `--x-<name>` (base), `--x-<name>-text` and `--x-<name>-on`, in both themes. Every dark `-on` is near-black, as for the dark seed inks.

| Theme | Ink | base | `-text` | `-on` | `-on` / base | `-text` / panel | Min ΔE2000 (nearest) |
|---|---|---|---|---|---|---|---|
| light | teal | `#089B9B` | `#066B6B` | `#161616` | 5.32 | 6.05 | 18.3 (group) |
| light | olive | `#6A7A1A` | `#455011` | `#FFFFFF` | 4.76 | 8.35 | 19.2 (group) |
| light | rose | `#BC4E7B` | `#9B3B63` | `#FFFFFF` | 4.65 | 6.28 | 24.2 (infer) |
| light | indigo | `#8C84DB` | `#675DD0` | `#161616` | 5.55 | 4.96 | 18.3 (seq) |
| light | umber | `#815637` | `#5D3E28` | `#FFFFFF` | 6.33 | 9.20 | 18.8 (infer) |
| dark | teal | `#0ABDBD` | `#0BDADA` | `#161616` | 7.78 | 9.89 | 18.1 (group) |
| dark | olive | `#9AA951` | `#A7B464` | `#161616` | 7.04 | 7.67 | 18.5 (group) |
| dark | rose | `#ED7EAC` | `#F098BD` | `#161616` | 7.05 | 8.15 | 21.8 (indigo) |
| dark | indigo | `#B7A4EF` | `#CBBEF4` | `#161616` | 8.25 | 10.02 | 18.5 (seq) |
| dark | umber | `#A67E59` | `#B08E6D` | `#161616` | 4.95 | 5.69 | 18.8 (infer) |

Contrast is WCAG 2 against light panel `#FAFAF9` and dark panel `#1B1B1B`; ΔE2000 is against the other eight bases of the same theme, seed inks included. The floor is 15; the smallest pair is 18.3 in light (Sequence Blue / Indigo) and 18.1 in dark (Group Green / Teal). `app/src/inks.test.ts` checks every value from `styles.css`.

**Group Green's numeral (D17, closing ruling B7).** Light Group Green moved from `#1E8E5A` to `#1E915C`: the red channel is unchanged, it is ΔE2000 1.05 from the old value, and it is the smallest base change with margin that lifts its near-black numeral (`#161616`) to AA, now 4.53:1 (was 4.37). Every seed `-on` now passes AA (light 5.23 amber, 4.53 green, 5.56 blue, 4.52 vermilion; dark 8.20, 6.63, 5.56, 5.81). Every seed `-text` is unchanged at 6.25 to 9.14 on the panel. `app/src/inks.test.ts` asserts every `-on`, seed and extra, at 4.5:1 or more.

### Neutral
- **Bench Shell** (shell / shell-dark): the application ground, plus the fill of callout cards, link cards and the search field.
- **Panel** (panel / panel-dark): the top bar, record header, margin column, status bar and the card readout chip.
- **Hairline** (hairline / hairline-dark): every structural rule, including cell dividers, the margin edge, row separators and card borders.
- **Strong Hairline** (hairline-strong / hairline-strong-dark): field borders, the dropdown border, thumbnail insets, status-bar separators and scrollbars.
- **Ink, Secondary Ink, Tertiary Ink** (ink, ink-secondary, ink-tertiary, plus dark variants): primary text, then metadata and inactive tabs, then placeholders, disabled tabs and empty-value dashes.
- **Grey Card N5** (grey-card-n5): the specimen ground and the thumbnail ground. It is identical in both themes.
- **Card Ink** (card-ink): the near-white used to draw on the grey card. Region boxes at rest (70% mix), dimmed boxes when another callout is hot (22% mix), and resting leader strokes.

### Named Rules
**The Constant Card Rule.** The specimen and every thumbnail sit on Grey Card N5 in both light and dark. Theme switching changes the desk, never the ground the art is judged against.

**The Operation-Only Chroma Rule.** Chromatic colour in the chrome means an operation. Never use an operation ink for decoration, status or emphasis that is not about that operation. Sequence Blue's role as the focus and selection colour is the single sanctioned exception.

## Typography

**Record Font:** Source Serif 4 (with Iowan Old Style, Georgia, serif), self-hosted at 400, 500 and 600, roman and italic.
**Instrument Font:** Red Hat Mono (with ui-monospace, Cascadia Mono, monospace), self-hosted at 400 and 500, always with tabular numerals.
**Interface Font:** system UI stack (system-ui, -apple-system, Segoe UI Variable Text, Segoe UI, Helvetica Neue, sans-serif).

**Character:** a catalogue entry typed up by a careful hand, with readings stamped beside it by a machine. The native UI face keeps the controls from competing with either.

### Hierarchy
- **Wordmark** (Source Serif 4 600, 22px, line-height 1, -0.01em): the Horus name in the top bar, and at 64px (48px at 760px and below, -0.015em) on the intro card.
- **Record** (Source Serif 4 500, 21px, line-height 1.2): operation, technique and reference values in the record header. The reference title is set in italic. The domain value is set in the interface face at 18px. Values drop to 18px/16px/14px at 1100px and below.
- **Title** (Source Serif 4 500, 17px, line-height 1.25): the technique name on a callout card.
- **Item** (Source Serif 4 500, 15px, line-height 1.25): reference titles in ranked rows, links and search results.
- **Note** (Source Serif 4 italic 400, 15px, line-height 1.5): the artist's "why" note on a drawn link.
- **Body** (system UI 400/500, 14px, line-height 1.45): tabs, controls, descriptions. Tabs and buttons use weight 500.
- **Caption** (system UI 400, 12-13px): operation paths, sublines, pane notes and the status bar (13px).
- **Readout** (Red Hat Mono 500, 16px): the reference id and other mono values in the record header.
- **Score** (Red Hat Mono 500, 12-14px, tabular): correlation scores, counts and the library count.
- **Label** (Red Hat Mono 500, 11px, 0.03em, lowercase): tag states ("full tag", "partial", "region") and the "pinned" marker.

The record header's field keys ("01 Operation" through "04 Reference") are the one uppercase mono setting (500, 11px, 0.06em). They are numbered keys on a data row, not headings or section labels. Do not reuse them elsewhere.

### Named Rules
**The Hand and Instrument Rule.** Serif for anything a person names (techniques, references, records, notes). Mono for anything that is measured or identified (ids, scores, counts, states, the card readout). The UI face for controls only. Never set a score in serif or a technique name in mono.

## Layout

The desktop shell is a four-row grid: the top bar (52px), the record header (68px minimum), the work area (fills the rest) and the status bar (36px). The work area splits into a fluid specimen column and a fixed 340px margin column. The specimen card is inset 20px from the shell. The specimen keeps its own aspect ratio at its largest fit, inside 60px of side clearance and 48px top and bottom.

The record header is five columns: three equal cells for operation, domain and technique, a wider cell (1.6fr) for the reference, and the Back button. The cells are separated by hairlines.

The spacing rhythm is 20px gutters, 12px internal padding for cards and gaps between them, 8px between thumbnails, and 16px for pane padding.

**Responsive behaviour:**
- **1100px and below:** the margin narrows to 300px, cell padding drops to 14px and record values step down a size.
- **760px and below:** everything stacks into one column.
  - The tabs wrap to their own scrolling row.
  - The record header becomes a 2×2 grid, with Back as a full-width row below it.
  - The specimen card becomes a flowing block, the specimen sized to 58vh by its aspect ratio, and the readout drops below the art.
  - The margin follows underneath.
  - Leader lines are hidden.

## Elevation & Depth

Hairline rules and flat tonal panels do almost all the work. Shadow is reserved for things that are physically lifted: the plate off the card, and a menu off the bar.

### Shadow Vocabulary
- **Plate lift** (`box-shadow: 0 1px 2px rgb(0 0 0 / .25), 0 14px 34px rgb(0 0 0 / .22)`): the specimen plate resting on the grey card. Only the specimen has it.
- **Menu lift** (`box-shadow: 0 12px 28px rgb(0 0 0 / .14)`): the search results dropdown.
- **Badge halo** (`box-shadow: 0 0 0 2px` Grey Card N5): separates a numbered badge from the art beneath it.
- **Hot ring** (`box-shadow: 0 0 0 1px rgb(0 0 0 / .35)`; `.45` on thumbnail regions): a dark 1px edge that keeps an operation-coloured outline legible over any image.
- **Tab indicator** (`box-shadow: inset 0 -2px 0` ink): the active view tab and margin tab.

### Named Rules
**The Lifted-Only-If-Physical Rule.** Panels, cards and rows are flat and separated by hairlines. A shadow means an object is sitting on top of another surface (a plate, a menu). It never expresses importance.

## Shapes

Data containers are square: the specimen card, callout cards, thumbnails, rows, record cells and panels all have 0 radius. The only softened corner is the 2px search field. Circles are reserved for markers: numbered callout badges (26px) and operation swatches in search results (10px). Curves belong to connectors, the cubic leader lines that run from a badge to its callout card. The link-drag leader is the exception: a straight 2px dashed ink line that tracks the pointer while you drag a link, because it is a gesture in progress, not a connection. Tree and Radial draw straight hierarchy lines; curves are for connectors between related references (leaders, Galaxy edges).

Region boxes are 1.5px outlines whose line style encodes tag state: **solid** for a full tag, **dashed** for a partial tag, and **dotted** (2px) for a region tag. A tag on the whole image draws no outline until it is hot, and then outlines the plate 10px outside its edge.

### Named Rules
**The Line Says the State Rule.** Tag completeness is read from the stroke, not from colour or a badge: solid is full, dashed is partial, dotted is region. Keep this mapping wherever tags are drawn.

## Components

### Navigation (top bar and view tabs)
Quiet and native.
- **Style:** the panel fill with a hairline bottom rule. Tabs are full-height text buttons with 12px side padding, set in body 500 and secondary ink.
- **Active:** ink colour plus a 2px inset ink underline. **Disabled:** tertiary ink. Counts sit beside the label in score mono.
- **Mobile:** the tabs move to their own 40px horizontally scrolling row.
- **Order:** the wordmark leads the bar, then the view tabs. Library (an app-level menu) sits with the search field, Theme and Settings on the right.

### Search field
- **Style:** 32px tall, a strong-hairline border, a 2px radius, the shell fill and 12px side padding. The placeholder is in tertiary ink. The native clear glyph is replaced by a masked SVG cross in secondary ink.
- **Results:** a panel-filled list with a strong-hairline border and Menu lift. Each row shows an operation swatch, the title in Item serif, a caption subline and a mono count. The selected or hovered row takes the shell fill.
- **Focus:** the global 2px Sequence Blue outline at 2px offset.

### Record header (the growing breadcrumb)
The signature of the path.
- **Structure:** four hairline-divided cells, each a field key above a value. The operation value is coloured with its operation's `-text` ink.
- **Behaviour:** at rest it shows the path you arrived on. Hovering or pinning a callout swaps in that callout's path. Each value fades up 4px, staggered 90ms per cell.
- **Empty values:** shown as a tertiary-ink em dash.
- **Back:** a chevron SVG plus "Back to [title]". It is disabled at 45% opacity when the trail is empty.

### Specimen card
- **Ground:** Grey Card N5, square, inset 20px from the shell. The plate carries Plate lift.
- **Callouts:** numbered 26px circular badges in operation ink, with a 2px card-coloured halo, set at the top-left corner of each region box.
- **Readout:** a panel-filled chip at the bottom-left, set in mono 12px secondary ink. It reads credit, then "Grey card N5", then the Value view state, separated by middots.
- **Hover/pin:** the hot box takes its operation ink and the Hot ring, and the other boxes dim to 22% card ink. On desktop a curved leader draws out to the callout card (stroke-dash, 0.55s, 1.75px).
- **Value view:** turns the plate and every thumbnail to grayscale.

### Callout card
- **Style:** a square card with the shell fill, a hairline border and 12px padding, in a 26px badge column plus a content column. The tag state label (mono) sits beside the technique title. Below them come the operation path (caption, with the operation name in its `-text` ink at weight 600), the definition and the related thumbnails.
- **Hot:** the border takes the operation ink. The title is a pin toggle: it underlines on hover and appends "· pinned" when pressed.

### Related thumbnail
The primary action.
- **Style:** a 64px square on Grey Card N5 with a strong-hairline inset ring. The related region is outlined in its operation ink with a dark Hot ring. The score sits beneath in mono 12px.
- **Hover/focus:** a 2px outline in the operation ink, offset 1px.

### Ranked and link rows
- **Style:** a 52px thumbnail, then the title (Item serif) and subline (caption), then a mono score at 14px. Rows are separated by hairlines.
- **Hover:** underlines the title. A newly arrived row flashes a 12% Sequence Blue fill that fades over 0.6s.
- **Links:** sit in a shell-filled, hairline-bordered card with the "why" note set in italic serif.

### Status bar
A panel strip with a hairline top rule, 13px caption text and 16px strong-hairline separators. It holds the mono library count, the Value view checkbox (accent in ink) and the Find similar state.

### Motion
One easing curve throughout: `cubic-bezier(.16, 1, .3, 1)`, an expo-out.
- Hover colour changes take 0.2s.
- Record values change over 0.25s.
- A specimen swap fades and scales to 0.985 over 0.35s.
- Leader lines draw in 0.55s.
- Under `prefers-reduced-motion: reduce`, every transition and animation runs at 0s.

### Intro card
"The first specimen". It plays on first launch and from Help > Play intro, at z 55, on the shell. The wordmark (64px) and an italic serif line ("Your references, and why they connect.") sit above an empty Grey Card N5 (4:3, up to 400px). Four region boxes rest on the card in card-ink, one in each tag-state stroke. Each lights in turn in its seed operation's ink with its numbered badge, and the operation's plain label appears under the card in its `-text` ink beside a 10px swatch, captioned "A starting set. Rename them or add your own." There is no text on the card. The whole sequence uses `var(--ease)`: entrances by 3.7s, the contents fade to the shell from 5.3s to 5.9s, and `INTRO_MAX_MS` (6000) removes it. Any key, pointer press or wheel skips it. The resting CSS is the final frame, so under reduced motion it is a still frame with no animation, held until input. It never shows an operation count, an eye, or Iris's name or marks.

## Do's and Don'ts

### Do:
- **Do** keep the specimen and thumbnails on Grey Card N5 in both themes.
- **Do** colour only what names an operation, using the base ink for fills and strokes, `-text` for type on the panel, and `-on` for numerals in badges.
- **Do** encode tag state in the region box stroke: solid for full, dashed for partial, dotted for region.
- **Do** keep the art clear at rest. Draw leader lines only on hover or pin.
- **Do** keep the arrival path in the record header at rest, and keep the Back trail.
- **Do** set names in Source Serif 4 and measurements in Red Hat Mono with tabular numerals.
- **Do** separate surfaces with hairlines (1px) before reaching for a shadow.
- **Do** honour `prefers-reduced-motion` by dropping every transition and animation to 0s.

### Don't:
- **Don't** tint the shell or panels warm or cool. The neutrals stay true grey so the ground never colours the art.
- **Don't** round data containers. Radius belongs to markers (circles) and the 2px field only.
- **Don't** use an operation ink as a generic accent, status colour or brand colour.
- **Don't** shadow flat panels, cards or rows to signal importance.
- **Don't** reuse the uppercase numbered record keys as headings or section labels elsewhere.
- **Don't** treat the synthetic placeholder plates as brand imagery. The images are always the user's references.
