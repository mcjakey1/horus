# Plan 6 Task 4, Step 3: the design pass (proposal, pending the user's approval)

**Status: implemented on p6-t4 (commits e70bbbc and 24847d7), PENDING THE USER'S APPROVAL.** A Claude + impeccable stand-in proposed it while the user had delegated design calls. Every visual value is in `app/src/styles.css` (plus the intro's markup in `app/src/intro/intro.ts`), so any part reverts cheaply.

## Open for the user

1. **The intro concept and its copy.** "The first specimen": the wordmark over an empty Grey Card N5, four region boxes lighting in the seed operation inks, keyed by their plain labels. New copy: the line "Your references, and why they connect." and the caption "A starting set. Rename them or add your own." (§1).
2. **The D17 lever.** Light Group Green's base moves from `#1E8E5A` to `#1E915C` (ΔE2000 1.05), so its numeral reaches 4.53:1. The alternative leaves the base and darkens the numeral to `--group-on: #121212` (4.525:1) (§2).
3. **Library on the right.** The Library button moves from before the wordmark to the right-hand cluster, beside search, Theme and Settings (§3).
4. **The `.insp-plain` swap.** An operation's plain label moves from above its name to below it in the inspector (§3).
5. **Motion not yet seen.** Only the reduced-motion still frame was rendered (headless Edge, the WebView2 engine). The animation, and the macOS (WebKit) and Linux (WebKitGTK) webviews, are unseen until Task 8.

**One deviation in the implementation:** the intro's region boxes use 2px borders, not the 1.5px in §1, because 1.5px rendered half grey in Edge. The measuring scripts and screenshots this proposal cites (`t4/inks.py`, `t4/brute.py`, `t4/shot-*.png`) stayed in the reviewer's scratch folder and are not in the repo.

---

Reviewer: impeccable (showcase register for §1, normal register for §2 and §3). Read-only on the repo.
Line numbers are from p6-t4's `app/src/styles.css`, as read on 2026-11-28.

---

## 1. The intro card: "The first specimen"

The intro shows the bench before any art is on it. The wordmark is set like a catalogue heading. Below it sits an empty Grey Card N5, because the artist's own references are the art and none are loaded yet. Four region boxes rest on the card in card-ink. One by one, each box lights in the operation it names, and that operation's plain label appears under the card. The intro then holds on the finished frame: a fully tagged specimen with its key, which is also what the reduced-motion still frame shows. In under four seconds it teaches the product's one gesture (a region, an operation ink, a name) using nothing outside DESIGN.md.

- **Inks name operations.** Each lit box carries its numbered badge, and the row beneath names every ink in its `-text` colour. No other chroma appears.
- **The Line Says the State Rule.** The boxes show the three tag states: solid, dashed, and dotted 2px.
- **No fixed count.** The key is captioned "A starting set." and never claims a count.
- **Excluded:** no eye, no Iris marks, no "Taxonomy of Visuals".
- **Contrast:** checked with `t4/inks.py`.
  - No type sits on the N5 card. Ink on N5 is 4.04:1, so the card holds no text.
  - Light theme, on the shell: ink 16.30, ink-2 6.84, and the seed `-text` inks 5.88 to 6.91.
  - Dark theme, on the shell: ink-2 8.79, and the seed `-text` inks 7.53 to 9.69.
  - The badge numerals are the existing `-on` pairs, with D17 applied.

**Timeline** (one curve, `var(--ease)`):

| Time | Event |
|---|---|
| 0 s | The wordmark rises 4 px. |
| 0.25 s | The line rises. |
| 0.45 s | The card fades in from a scale of 0.985 (the specimen-swap move). |
| 0.8 s to 1.1 s | The boxes appear at rest, with their badges. |
| 1.5 s, 1.9 s, 2.3 s, 2.7 s | Each box lights, and its label rises in step. |
| 3.2 s | The caption rises. |
| 5.3 s to 5.9 s | The contents fade to the bare shell. |
| 6.0 s | `intro.ts` removes the card. |

The fade runs on the inner frame, not on `.intro`, so the empty app shell underneath never shows through. A skip still cuts at once.

**Text shown, verbatim:**
- `Horus`
- `Your references, and why they connect.`
- `Stand out` · `Hold together` · `Lead the eye` · `Make them think`
- `A starting set. Rename them or add your own.`
- The badge numerals `1` to `4` sit inside the `aria-hidden` card.

### `intro.ts`: the markup change (line 20, and optionally line 18)

```ts
  el.setAttribute("aria-label", "Horus. Your references, and why they connect."); // optional: role="img" hides the inner text
  el.innerHTML = `<div class="intro-frame">
    <p class="intro-mark">Horus</p>
    <p class="intro-line">Your references, and why they connect.</p>
    <div class="intro-card" aria-hidden="true">
      <span class="intro-box" data-op="diff"><span class="intro-num">1</span></span>
      <span class="intro-box" data-op="group"><span class="intro-num">2</span></span>
      <span class="intro-box" data-op="seq"><span class="intro-num">3</span></span>
      <span class="intro-box" data-op="infer"><span class="intro-num">4</span></span>
    </div>
    <ul class="intro-ops">
      <li data-op="diff">Stand out</li><li data-op="group">Hold together</li><li data-op="seq">Lead the eye</li><li data-op="infer">Make them think</li>
    </ul>
    <p class="intro-note">A starting set. Rename them or add your own.</p>
  </div>`;
```

The markup has no `style=` attributes, because the CSP is `style-src 'self'`. Every ink, position and delay is keyed off `data-op` in CSS. The mechanics are unchanged.

### `styles.css`: replace lines 634–640 (the intro block, from its comment through `@keyframes intro-in`)

```css
/* Plan 6 Task 4: the intro card, "The first specimen" (DESIGN.md "Intro card"). z 55: above
   Settings (45) and first run (50). The resting styles ARE the final frame and every entrance
   keyframe is from-only, so .is-still (reduced motion) is that frame with nothing animating.
   The tail fades the contents (never .intro, so the bare app shell never shows through) by
   5.9 s, before intro.ts removes the card at INTRO_MAX_MS (6000 ms): keep the two in step. */
.intro { position: fixed; inset: 0; z-index: 55; display: grid; place-items: center; padding: 40px 20px; overflow: hidden; background: var(--shell); color: var(--ink); }
.intro-frame { display: grid; justify-items: center; text-align: center; animation: intro-out .6s var(--ease) 5.3s forwards; }
.intro-mark { margin: 0; font: 600 64px/1 var(--serif); letter-spacing: -.015em; animation: intro-up .7s var(--ease) both; }
.intro-line { margin: 14px 0 0; font: italic 400 17px/1.4 var(--serif); color: var(--ink-2); animation: intro-up .7s var(--ease) .25s both; }
.intro-card { position: relative; margin-top: 36px; width: min(400px, 76vw, calc(40vh * 4 / 3)); aspect-ratio: 4 / 3; background: var(--card); animation: intro-card .5s var(--ease) .45s both; }
/* a region box, lit in its operation's ink with the Hot ring; its badge as .num */
.intro-box { position: absolute; border: 1.5px solid var(--c); box-shadow: 0 0 0 1px rgb(0 0 0 / .35);
  animation: intro-fade .4s var(--ease) calc(.8s + var(--i) * .1s) both, intro-hot .45s var(--ease) calc(1.5s + var(--i) * .4s) both; }
.intro-num { position: absolute; top: -13px; left: -13px; width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; font: 500 13px var(--mono); color: var(--on); background: var(--c); box-shadow: 0 0 0 2px var(--card); }
.intro-ops { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px 22px; margin: 28px 0 0; padding: 0; list-style: none; }
.intro-ops li { display: flex; align-items: center; gap: 8px; font: 500 15px/1.25 var(--serif); color: var(--t); animation: intro-up .45s var(--ease) calc(1.5s + var(--i) * .4s) both; }
.intro-ops li::before { content: ""; flex: none; width: 10px; height: 10px; border-radius: 50%; background: var(--c); }
.intro-note { margin: 12px 0 0; font-size: 12px; color: var(--ink-2); animation: intro-up .5s var(--ease) 3.2s both; }
/* each operation's inks and its place in the sequence */
.intro [data-op="diff"]  { --c: var(--diff);  --t: var(--diff-text);  --on: var(--diff-on);  --i: 0; }
.intro [data-op="group"] { --c: var(--group); --t: var(--group-text); --on: var(--group-on); --i: 1; }
.intro [data-op="seq"]   { --c: var(--seq);   --t: var(--seq-text);   --on: var(--seq-on);   --i: 2; }
.intro [data-op="infer"] { --c: var(--infer); --t: var(--infer-text); --on: var(--infer-on); --i: 3; }
/* four regions of an imagined specimen; the stroke says the state: solid full, dashed partial, dotted region */
.intro-box[data-op="diff"]  { left: 10%; top: 14%; width: 34%; height: 40%; }
.intro-box[data-op="group"] { left: 54%; top: 10%; width: 36%; height: 30%; border-style: dashed; }
.intro-box[data-op="seq"]   { left: 48%; top: 52%; width: 42%; height: 36%; border-style: dotted; border-width: 2px; }
.intro-box[data-op="infer"] { left: 14%; top: 64%; width: 24%; height: 24%; }
/* the still frame: no animation or transition anywhere inside (reduced motion, intro.ts) */
.intro.is-still *, .intro.is-still *::before, .intro.is-still *::after { animation: none; transition: none; }
@media (prefers-reduced-motion: reduce) { .intro *, .intro *::before, .intro *::after { animation: none !important; } }
@media (max-width: 760px) { .intro-mark { font-size: 48px; } .intro-card { margin-top: 28px; } }
@keyframes intro-up { from { opacity: 0; transform: translateY(4px); } }
@keyframes intro-card { from { opacity: 0; transform: scale(.985); } }
@keyframes intro-fade { from { opacity: 0; } }
@keyframes intro-hot { from { border-color: color-mix(in srgb, var(--card-ink) 70%, transparent); box-shadow: none; } }
@keyframes intro-out { to { opacity: 0; } }
```

The block needs no new tokens. It reverts as one block plus the one `innerHTML` change.

**Optional test** for `intro.test.ts`. The current reduced-motion test reads only the inline style, so it cannot catch a CSS regression. Read `styles.css` with `readFileSync`, as `inks.test.ts` does, and assert that it contains `.intro.is-still *, .intro.is-still *::before, .intro.is-still *::after { animation: none; transition: none; }`.

### DESIGN.md changes

1. In Hierarchy, change the Wordmark line to: "**Wordmark** (Source Serif 4 600, 22px, line-height 1, -0.01em): the Horus name in the top bar, and at 64px (48px at 760px and below, -0.015em) on the intro card."
2. Add a new section after Motion, under Components:

   > ### Intro card
   > "The first specimen". It plays on first launch and from Help > Play intro, at z 55, on the shell. The wordmark (64px) and an italic serif line ("Your references, and why they connect.") sit above an empty Grey Card N5 (4:3, up to 400px). Four region boxes rest on the card in card-ink, one in each tag-state stroke. Each lights in turn in its seed operation's ink with its numbered badge, and the operation's plain label appears under the card in its `-text` ink beside a 10px swatch, captioned "A starting set. Rename them or add your own." There is no text on the card. The whole sequence uses `var(--ease)`: entrances by 3.7s, the contents fade to the shell from 5.3s to 5.9s, and `INTRO_MAX_MS` (6000) removes it. Any key, pointer press or wheel skips it. The resting CSS is the final frame, so under reduced motion it is a still frame with no animation, held until input. It never shows an operation count, an eye, or Iris's name or marks.

---

## 2. D17: light Group Green's numeral

**Decision: lift the base, not the numeral.** `--group` goes from `#1E8E5A` to `#1E915C`. The red channel is unchanged; green rises by 3 and blue by 2.

| Measure | Before | After |
|---|---|---|
| `--group-on` (`#161616`) on `--group` | 4.37:1 (4.3707) | **4.53:1** (4.5326) |
| ΔE2000 of the base change | n/a | 1.05, at the threshold of visibility |
| Group's nearest light base (Teal) | 18.49 | 18.34 |
| Olive / Group | 18.87 | 19.20 |
| Theme minimum | 18.26 (Sequence Blue / Indigo) | 18.26 (unchanged) |

- The ΔE floor of 15 holds.
- Every `-text` on the panel is unchanged, and every seed `-text` still passes; `group-text` stays 6.25.
- The dark theme is untouched.
- Every `-on`, seed and extra, is now ≥ 4.5 in both themes. In the light theme the lowest is Infer Vermilion at 4.52 and the green is 4.53. In the dark theme the lowest is Umber at 4.95.

**Why this lever, and why this value:**
- Lifting the base keeps the system rule that `-on` is either ink `#161616` or white, so the pinned `-on` arrays stay as they are.
- I ran a brute force over ±6 per channel, saved as `t4/brute.py`. The absolute smallest passing change is `#24905D`, at ΔE 0.87, but it clears AA by only 0.0003. `#1E915C` is the smallest change with real margin, and it keeps the red channel.
- **The alternative is to darken the numeral instead.** `--group-on: #121212` measures 4.525:1, a ΔE of 1.08 on the numeral. It leaves the base and all ΔE values alone, but it adds a one-off near-black outside `--ink`. See "Open for the user".

**`app/src/styles.css` line 6** becomes:
```css
  --diff: #B87F00; --group: #1E915C; --seq: #2563D0; --infer: #D2462A;
```

**DESIGN.md:**
- **Line 24** (frontmatter): `  group-green: "#1E915C"`
- **Teal row** (light): `| light | teal | \`#089B9B\` | \`#066B6B\` | \`#161616\` | 5.32 | 6.05 | 18.3 (group) |`
- **Olive row** (light): `| light | olive | \`#6A7A1A\` | \`#455011\` | \`#FFFFFF\` | 4.76 | 8.35 | 19.2 (group) |`
- **Line 240:** unchanged, because the smallest light pair is still Sequence Blue / Indigo at 18.3.
- **Line 242:** replace the B7 paragraph with:

  > **Group Green's numeral (D17, closing ruling B7).** Light Group Green moved from `#1E8E5A` to `#1E915C`: the red channel is unchanged, it is ΔE2000 1.05 from the old value, and it is the smallest base change with margin that lifts its near-black numeral (`#161616`) to AA, now 4.53:1 (was 4.37). Every seed `-on` now passes AA (light 5.23 amber, 4.53 green, 5.56 blue, 4.52 vermilion; dark 8.20, 6.63, 5.56, 5.81). Every seed `-text` is unchanged at 6.25 to 9.14 on the panel. `app/src/inks.test.ts` asserts every `-on`, seed and extra, at 4.5:1 or more.

**`app/src/inks.test.ts`:**
- **Line 78:** `EXTRA` becomes `[...SEED, ...EXTRA]`:
  ```ts
      for (const k of [...SEED, ...EXTRA]) expect(contrast(v[`${k}-on`], v[k]), `${theme} ${k}-on`).toBeGreaterThanOrEqual(4.5);
  ```
- **Lines 87–93** become the test below. Don't use `toBeCloseTo(4.53, 2)`: the measured 4.5326 only just sits inside that tolerance.
  ```ts
    it("light Group Green clears AA for its numeral (D17, closing ruling B7)", () => {
      // D17: the base moved #1E8E5A -> #1E915C (ΔE2000 1.05), so #161616 on it is 4.53:1 (was 4.37).
      expect(THEMES.light.group).toBe("#1E915C");
      expect(SEED.map((k) => THEMES.light[`${k}-on`])).toEqual(["#161616", "#161616", "#FFFFFF", "#FFFFFF"]);
      expect(SEED.map((k) => THEMES.dark[`${k}-on`])).toEqual(["#161616", "#161616", "#161616", "#161616"]);
      expect(contrast(THEMES.light["group-on"], THEMES.light.group)).toBeGreaterThanOrEqual(4.5);
    });
  ```

**Other copies of the old value:**
- `.impeccable/design.json` lines 309–365 and 675 hold `#1E8E5A`. It is a derived sidecar: update it by hand, or rerun impeccable `document`.
- `prototype/styles.css:6` and `.impeccable/surfaces/prototype-index-html.md:44` belong to the frozen prototype. Leave them.

---

## 3. The DESIGN.md drift list

**Re-casing:** none is needed. Every affected string is already in sentence case in its source, so removing `text-transform` shows it as written:
- `views/inspector.ts`: :175 "Icon", :190 "References", :197 and :204 "Used under", and :149 and :160 `op.plainLabel` (the seed values are "Stand out" and so on, `taxonomy.json:7–31`).
- `views/move-tags.ts:85` "Move them to…".
- `reference/view.ts:321` "Linked by you" and :758 "Boards:".
- `compare/view.ts`: :86 "Only here", :87 "Operation only", :102 "Shared" and :103 "Same operation × domain".

The tests compare `textContent`, which never sees `text-transform`, so none of them change.

### Uppercase record keys reused as labels: FIX (12px sentence-case caption, ink-2)
DESIGN.md: the uppercase mono keys are "not headings or section labels. Do not reuse them elsewhere"; captions are "system UI 400, 12-13px".

```css
.insp-h { margin: 6px 0 0; font: 400 12px/1.4 var(--sans); color: var(--ink-2); }            /* :399 */
.tx-h { margin: 0; font: 400 12px/1.4 var(--sans); color: var(--ink-2); }                     /* :432 */
.group-head { margin: 12px 0 2px; font: 400 12px/1.4 var(--sans); color: var(--ink-2); }      /* :505 */
.cmp-h { margin: 16px 0 6px; font: 400 12px/1.4 var(--sans); color: var(--ink-2); }           /* :573 */
.ref-boards .k { font: 400 12px/1.4 var(--sans); letter-spacing: normal; text-transform: none; color: var(--ink-2); } /* :554; must undo all of .k :79 */
```

The `.ref-boards .k` override is the CSS-only fix. The cleaner alternative drops the reused class at `reference/view.ts:758` (for example, `<span class="ref-boards-k">`) and renames the selector to match.

`.insp-plain` (:395) is an eyebrow above the operation title, and eyebrows are an impeccable ban. Fix it as a subline under the title:
```css
.insp-plain { margin: -6px 0 0; font-size: 12px; color: var(--ink-2); } /* :395; under .insp-title, the 10px flex gap less 6 */
```
plus a TS swap at `views/inspector.ts:149` and `:160`, so that `<p class="insp-plain">…</p>` comes **after** `<h2 class="insp-title">…</h2>`. The error placement at :353 and :569 matches by class, not by position, so it is unaffected. Check `inspector.test.ts` for any test that depends on the order.

### Measurements in the UI font: FIX (Red Hat Mono, tabular)
This is DESIGN.md's Hand and Instrument Rule: "Mono for anything that is measured."
```css
.cmp-score { margin: 0 auto 0 0; color: var(--ink-2); font: 500 12px var(--mono); font-variant-numeric: tabular-nums; }            /* :564 */
.lb-zoom, .lb-size { color: var(--ink-2); font: 500 12px var(--mono); font-variant-numeric: tabular-nums; white-space: nowrap; }  /* :482 */
```
The whole `.cmp-score` line, "0.42 · related by technique", goes mono, as the `.lab-meta` card readout already sets mixed words in mono. The alternative wraps only the number in `<span class="mono">` at `compare/view.ts:95`. That keeps the `textContent` the same, but it is a TS change.

### Link-drag leader (:489): KEEP
It is a straight dashed rubber band that follows the pointer during a drag. It is a drag affordance, not a connector between two placed things. A curve would also be a TS change at `reference/view.ts:704–717`, not CSS. Keep the `.link-leader` class either way, because `reference/view.test.ts:1120–1168` queries it.

Add this sentence to Shapes, after "Curves belong to connectors…": "The link-drag leader is the exception: a straight 2px dashed ink line that tracks the pointer while you drag a link, because it is a gesture in progress, not a connection."

### Galaxy edges: CURVE them
- The drawing code already exists: `SceneEdge.curve` (`graph/frame.ts:20`) and `drawEdges` in `graph/scene.ts:263–277`, which draws a quadratic bow of 0.2 times the span.
- The change is one flag at `views/galaxy.ts:93`: add `curve: true` to the pushed edge.
- `galaxy.test.ts` compares only `from` and `to`, so it still passes.
- Leave Tree and Radial straight. They are hierarchy lines, not connectors; `tree.test.ts:150` asserts `curve` is falsy, and `radial.test.ts:184` compares whole edge objects.
- Add to Shapes: "Tree and Radial draw straight hierarchy lines; curves are for connectors between related references (leaders, Galaxy edges)."

### `.plate` fallback `#ddd` (:99): FIX
This follows the Constant Card Rule. The `#ddd` value is not a token and it flashes in dark mode. On N5, an unloaded plate reads as the card under its Plate lift.
```css
.plate { position: absolute; inset: 0; box-shadow: 0 1px 2px rgb(0 0 0 / .25), 0 14px 34px rgb(0 0 0 / .22); background: var(--card); }
```

### `.bd-title` (:532), 12px: FIX to Item
A reference title is a name, so DESIGN.md's Item style applies: serif, 500, 15px. At 12px the serif is also below comfortable legibility. The strip grows from about 17px to about 25px of the 160px tile.
```css
.bd-title { position: absolute; left: 0; right: 0; bottom: 0; padding: 3px 6px; background: var(--panel); font: 500 15px/1.25 var(--serif); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
```

### The Library button before the wordmark (`index.html:11`): FIX
The wordmark goes first. Library moves to the right-hand cluster, next to Theme and Settings. Placed straight after the wordmark, it would read as a seventh view tab. The menu is inserted with `button.after(menu)` (`library-menu.ts:28`), so a positioned wrapper lets it anchor to the button.

`index.html`: delete line 11. After the closing `</div>` of `.search` (line 25), insert:
```html
  <div class="lib"><button class="lib-btn" id="library-menu">Library</button></div>
```
`styles.css` lines 307 and 309 become the following. The `-10px` left offset is dropped, because the button no longer starts the bar. The menu right-aligns under the button, 4px below its 32px height.
```css
.lib { position: relative; }
.lib-btn { height: 32px; padding: 0 10px; color: var(--ink-2); font-weight: 500; }
.lib-menu { position: absolute; top: 36px; right: 0; z-index: 25; min-width: 240px; padding: 6px 0; background: var(--panel); border: 1px solid var(--line-2); box-shadow: 0 12px 28px rgb(0 0 0 / .14); }
```
- `firstrun.test.ts:156` (`#library-menu + .lib-menu`) still holds.
- `library-menu.test.ts` builds its own header, so it is unaffected.
- Add to DESIGN.md Navigation: "The wordmark leads the bar, then the view tabs. Library (an app-level menu) sits with the search field, Theme and Settings on the right."

---

## Open for the user

1. **The concept.** Do you approve "The first specimen"? An empty N5 card, four boxes lighting in the seed inks, and the seed labels as the key.
   - On replay ("Play intro"), the seed names show even if you have renamed your operations. "A starting set." covers this.
   - Alternative: drop the key row and show only the boxes, with no operation text.
2. **The line "Your references, and why they connect."** It is new product copy: approve it, or supply your own. The caption "A starting set. Rename them or add your own." also needs a yes.
3. **The D17 lever.** The base moves to `#1E915C` (recommended). The alternative is the numeral `--group-on: #121212`, at 4.525:1.
4. **Library on the right**, next to Theme and Settings, rather than straight after the wordmark.
5. **Keeping the link-drag leader straight**, and curving only the Galaxy edges.
6. **The `.insp-plain` swap.** The plain label moves under the operation name, which is a TS order change.
7. **Rendered only in part.** I rendered the still frame in headless Edge (Chromium, the WebView2 engine) at 1280×800, in both themes. The screenshots are `t4/shot-light.png`, `t4/shot-dark.png` and `t4/crop.png` (2×). The boxes, the stroke states, the badge halos and the key all read as intended.
   - Not seen: the motion itself, WebKit (macOS) and WebKitGTK (Linux, where `calc()` in `animation-delay` should be checked).
   - By arithmetic, the content fits a 600px-tall window: about 535px including padding.
