# Plan 4 final-review fix wave: report

**Branch:** `plan4-boards`. **Commits:** `59344ce`, `38c986f`, `0962a00`, `25717b3`, `f756f1d` and `836d276`, on top of `6e07004`. -59's `dbd6659` (README and harness) sits between them; I did not touch it. Nothing is pushed or merged. I committed only my own files, never `app/README.md`, `.impeccable/` or `docs/superpowers/qa/`.

## Per item

| # | Item | Status | Commit | Proving test (red first unless noted) |
|---|---|---|---|---|
| 1 | **C1** Board scope filters Ranked with no technique filter | done | `59344ce` | `reference/view.test.ts` "C1: with no technique filter, Ranked keeps only members and counts them": a related to b (0.8) and d (0.5), scope [a, b]; b is shown, d is not, "1 related". It failed on the old code. Also "under a technique filter, a linked match appears once", which already passed (it closes T4's untested dedupe). |
| 2 | **I1** `board_edit_survives_flush` | done | `38c986f`, fmt `0962a00` | The new Rust test passes, and fails with `\|\| touched.boards` removed from `settle` (checked, then restored). |
| 3 | **I2** Board menu keeps focus | done | `25717b3` | `menu.test.ts` "a tick keeps focus on that box, and Create focuses the new board's box (I2)". It failed on the old code. |
| 4 | **I3** Compare focus and keys | done | `f756f1d` (+ `836d276` for F4) | `compare/view.test.ts`, three tests. **(1)** "a store event leaves focus in the docked link editor (I3a)": the textarea stays focused, and `x` typed there does not swap. Red. **(2)** "keys aimed at <body> reach Compare: Esc closes, Ctrl+Z undoes once (I3b)", using the real `wireUndoKeys`. Red. **(3)** "after saving a link from the docked editor, Esc still closes Compare": not red on the old code; with F4 it now also checks focus, and that part is red without the F4 fix. |
| 5 | **I4** Compare `aria-label` | done | `f756f1d` | "is named after both references, in side order (I4)": "Compare Plate a and Plate b", flipped after `x`. Red. |
| 6 | **I5** Compare plates in % | done | `f756f1d` | "plates and outlines are placed in % of the tile (I5)": every box value ends in `%`. Red. CSS: `.cmp-tile { width: min(420px, 100%); height: auto; aspect-ratio: 1 }`. |
| 7 | **M0a** Hidden board members keep their slot | done | `25717b3` | `boards/view.test.ts` "reorder and Remove keep a hidden member in its slot": `["a","ghost","b","c"]`-style; Alt+→ gives `[r2, ghost, r1, r3]` and Remove r2 gives `[r1, ghost, r3]`. Red. |
| 8 | **M0b** `thumbnail` instead of Lanczos3 | **skipped** | — | Controller ruling: keep Lanczos3. |
| 9 | **M1** `k`/`b` through `letterOf` | done | `59344ce` | "k and b work in any case and on a non-Latin layout (M1)": `{key:"K"}` and `{key:"и", code:"KeyB"}`. Red. |
| 10 | **M2** Lightbox AZERTY `0`/`1` | done | `f756f1d` | `lightbox/view.test.ts` "AZERTY's & and à set 100% and fit": `{key:"&", code:"Digit1"}` gives 100%, and `{key:"à", code:"Digit0"}` refits. Red. |
| 11 | **M3** `UnknownLink` copy | done | `f756f1d` | `links/editor.test.ts`, wire-code copy: "That link is gone. It may have been undone." Red. |
| 12 | **M4** Esc after a lost drag capture | done | `59344ce` | "Esc unpins again after a drag that lost its capture (final review M4)": pin, pointerdown, Esc (the pin stays), `lostpointercapture`, Esc (unpinned). Red. |
| 13 | **M5** Board menu follows the store | done | `25717b3` | "a boards Change while open updates the ticks (M5)": it also checks that closing unsubscribes. Red. |
| 14 | **M7** Compare value view starts from `body.value` | done | `f756f1d` | "the value view starts as the artist was looking (M7)". Red. |
| 15 | **M8** Lightbox hover label clears on `pointerleave` | done | `f756f1d` | "the hover label goes when the pointer leaves the stage (M8)". Red. |
| 16 | **M9** Membership line after a focus change | done (test only) | `59344ce` | "the membership line follows the focus (M9)": Harbour, then Ships after `show("b")`. It passed on the old code, as expected for a test-only item. |
| — | **Ruling:** "Open folder" relabelled "Show in folder" | done | `25717b3` | `boards/view.test.ts` "Show in folder reveals the folder" asserts the label. Red on the old label. |
| — | **T8 F1** Ranked shows non-members under scope | done (= C1) | `59344ce` | The C1 test has 2 related references and no technique filter. |
| — | **T8 F2** Tagging at 416% reset the zoom to 100% | done | `836d276` | `reference/view.test.ts` "tagging a region drawn while zoomed in keeps the zoom (Task 8 F2)". Reproduced in jsdom (458% then 100%), and it passes now. **Cause:** the picker's digit `1` also reached the lightbox's "1 = 100%" key. **Fix:** the `0`/`1` zoom keys stand down while a picker is docked in `.lb-side`. |
| — | **T8 F3** Focus dropped after an Alt+→ reorder | done | `836d276` | `grid/windowed.test.ts` "a forced repaint that replaces the focused tile focuses its replacement": red on the old `windowed.ts`. Also `boards/view.test.ts` "after Alt+→ the moved tile keeps focus", which passes on the old code in jsdom (no ResizeObserver repaint there). **Fix:** `paint()` remembers the focused index and focuses its replacement when it rebuilt that tile. My reading of the real-app cause is a forced repaint after the explicit refocus. The grid test proves the general fix; I did not reproduce the real-app sequence here. |
| — | **T8 F4** Focus fell to `<body>` after "Link these two" saved | done | `836d276` | The I3 save test now presses the button as a user does (focus, then click) and asserts that focus returns to the new `.cmp-link-btn`. It fails without the fix. **Fix:** a `MutationObserver` on `.cmp-dock`: when the editor leaves and focus is outside Compare, it focuses the Link button (or the dialog). The I3 forwarder also keeps Esc working from `<body>`. |

## Gate

| Check | Result |
|---|---|
| `npx vitest run` | **exit 0**, **0 errors**, 604 passed, 45 files |
| `tsc --noEmit` | clean |
| `npm run build` | exit 0 |
| `cargo test` (`CARGO_BUILD_JOBS=2`) | 262 passed (+1), 2 ignored; plus 0 and 1. Run after the last Rust change, `38c986f` and `0962a00`; later commits are TS only. |
| `cargo clippy --all-targets -- -D warnings` | clean |
| `cargo fmt --check` | clean. `38c986f` was committed before fmt; `0962a00` fixes it. |

## Notes

- **A test-isolation catch (I3b):** test files that clear `document.body` without closing Compare leaked live capture forwarders. The forwarder is now also gated on `el.isConnected`, so a detached Compare never swallows keys.
- **Not verified in the real app:** F2 and F3. F2 is reproduced and fixed in jsdom; F3 is fixed at the grid level. Both are worth one QA recheck at 416% and on a resized window.
- **Deferred, as triaged:** M6, M10, M11, M12 and M13 are not in the wave.
