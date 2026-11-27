# Design review of Plans 1–4 (input to Plan 6 Task 3b and Task 4)

Claude + impeccable stand-in for Kimi K3 (Kimi's OpenCode Go quota ran out), 2026-11-28. Read-only, one context, no app run, no detector. Lines at 8646b91 (styles.css same on main; reference/view.ts +13 on main).

## Controller dispositions

- **Task 3b (fix now):** F1, F2, F3, F4, F5 (P1); F6, F7, F8, F9, F10, F11, F12 (P2, all small).
- **Task 4 design pass:** the DESIGN.md drift list below; D17 green contrast already there.
- NOT CHECKED items go to T8 QA rows (dark theme, 1100/760 px layouts, keyboard flows, Inbox/picker/lightbox render).

## Findings

- F1 P1: `.lab-meta` (styles.css:113-116) shares its anchor with `.boards-open` (:546); `.link-handle` (:486) covers its right end, so Boards… paints over the readout. Fix: one `.lab-actions` row (`position:absolute; top:14px; left:16px; display:flex; gap:6px`) for Tag…, Link…, Boards…, Lightbox (reference/view.ts:610, 632, 702, 734).
- F2 P1: `readout()` (reference/view.ts:230) repeats creator and year inside the credit, so the ellipsis cuts "Grey card N5 · Value view on". Fix: drop creator/year when the credit contains them; only the credit span shrinks (`flex:0 1 auto; min-width:0; text-overflow:ellipsis`), full text in `title`.
- F3 P1: Compare's value view, swap and lightbox are keyboard-only (v, x, L; compare/view.ts:202-206). Fix: "Value view" (aria-pressed), "Swap", "Lightbox" text buttons in `.cmp-top` (:93-97).
- F4 P1: Galaxy inspector (galaxy.ts:114) has no breadcrumb (Principle 4). Fix: export `crumbHTML` (inspector.ts:64) and show it from the selection's first tag path.
- F5 P1: graph labels are 13 world units, hidden only below 8 px (graph/constants.ts:22-23; scene.ts:251, 326); Radial at fit draws ~9 px. Fix: counter-scale label text to 12 px on screen (`scale = 1/cam.scale`); hide by overlap, not size.
- F6 P2: Radial centred on an operation shows "—" in all four crumb cells (inspector.ts:120-125). Fix: fall back to the centred operation.
- F7 P2: Compare shows "Only here" / "Same operation × domain" over empty lists (compare/view.ts:86, 102). Fix: show only when non-empty (as :87); clamp `.cmp-title` (styles.css:566) to 2 lines.
- F8 P2: Tree `fitAll` (tree.ts:239) fits nodes not labels. Fix: widen bounds by LABEL_W/2.
- F9 P2: "Import images…/folder…" (index.html:72-73) vs "Add images…/folder…" (inbox/view.ts:53). Fix: "Add" in both.
- F10 P2: lightbox hint ~140 chars, ellipsised (lightbox/view.ts:54; styles.css:362). Fix: "Drag to tag a region · v value · Esc closes" plus a "Keys" disclosure.
- F11 P2: Boards scope button label changes with state and the status bar repeats it; Delete sits next to Export (boards/view.ts:89-92). Fix: fixed label plus "· on" suffix like `.tree-all` (styles.css:383); Delete after a `.sep`.
- F12 P2: hit targets under WCAG 2.2 24 px: `.insp-x` ~20 px (:417), `.chip-x` and `.pk-chip button` 22 px (:172, :293). Fix: min 24×24.

## DESIGN.md drift (Task 4 design pass)

- The record-key uppercase style reused as section labels: `.insp-plain` :395, `.insp-h` :399, `.tx-h` :432, `.group-head` :505, `.cmp-h` :573, `.ref-boards .k` :554 (also reuses `.k`, reference/view.ts:705). Fix: 12 px sentence-case caption in ink-2.
- Measurements in the UI font, not mono: `.cmp-score` :564, `.lb-zoom`/`.lb-size` :482.
- Straight connectors where DESIGN.md calls for curves: the link-drag leader (:489) and Galaxy edges.
- `.plate` fallback `#ddd` (:99) is not a token and flashes in dark mode. Use `var(--card)`.
- Board tile titles 12 px (:532); DESIGN.md Item size is 15 px.
- The Library button precedes the wordmark in the top bar (index.html:11).

## NOT CHECKED

Older screenshots (pre Plan 2 T8/9) for reference/value/import/first-run, so F1's render is unseen; Inbox, picker, lightbox render; dark theme; 1100/760 px layouts; detector; keyboard flows in the running app.
