# Plan 4 QA: boards, export, links, lightbox and Compare

- **Tester:** session design-second-brain-6a, as Mara Okafor (QA-PERSONA.md).
- **Build:** `plan4-boards` at `836d276` (T0–T8, the final review and its fix wave). The release `horus.exe` was built in `.worktrees/p4-qa` (`npm ci`, `npx tauri build --no-bundle`) and run as the portable exe.
- **Window:** 1280×800 at DPR 1, light theme, temp libraries only, CDP port 9334.
- **Date:** 2026-11-27.

## Verdict

**PASS: 0 critical, 0 important, 2 minor, 3 judgment calls.**

- Every item on the fix wave's QA-focus list (1–8) works on the real app, and so does Task 8's Important F1, the scope leak. Item 9, the pre-existing question, is answered: **yes, Esc in the lightbox picker's "Add technique" form closes the whole lightbox.** That is F1 below.
- The four things Task 8 didn't check are now checked: search under scope, Tab onto a region while zoomed, and the credits file's bytes all pass. The hover label was seen only for an operation-only region (J3). Opening `credits.txt` in Notepad was not done (see "Not covered").
- Review Focus 3 to 6 pass live. Review Focus 1 and 2 pass for what an artist meets: two exports into the same folder, and same-title references. The forbidden-character, reserved-name and unwritable-folder cases were not driven live (see "Not covered").
- Undo covers each edit an artist makes here, one step each, and a link edit and a board rename survive a quit about 0.4 s after the save.
- Plan 2 and Plan 3 regressions: see the run table.
- Neither minor loses saved data.

## How it was tested

- **Harness:** `mara-plan4.js`, new, built from `mara-plan3.js`'s launch helpers and the step bodies of -59's `plan4-e2e.js`. It drives the real exe over WebView2 CDP with real mouse and keyboard input (wheel, Space-drag, pointer drags, Alt+arrows, Shift-click), and checks `library.json` and the export folder on disk.
- **Files dropped in:** a 1600×1200 LZW TIFF and a 20,400×600 PNG (Review Focus 3), plus two small PNGs used to raise an import notice while Compare is open. They are made with Pillow and dropped through the `tauri://drag-drop` event, as in Plan 3.
- **Export:** into a scratch folder outside the library, twice.
- **Window resizes:** through `user32 MoveWindow` on the app window (to 984 and 1050 CSS px).

| Run | Harness | Result |
|---|---|---|
| Plan 4 main, final (pass 4) | `mara-plan4.js` | **50 pass, 3 fail, 1 note**. The fails are F1, F2 and J3 (a harness expectation; see below). |
| Plan 4 passes 1–3 | `mara-plan4.js` while I fixed the harness | Pass 1: the first-run pick missed 4/4 (see H1). Passes 2 and 3: harness selector issues only; F1 seen in both. |
| Plan 2 regression | `mara-plan2.js` | **51/51** |
| Plan 3 regression | `mara-plan3.js` (main mode) | **88 pass, 2 fail, 2 notes.** The fails are Plan 3's own F1 (Ctrl+Z in the move dialog, then a dead Esc) and F2 (the import toast covering the inspector), both logged for Plan 6. This matches Plan 3 QA (88/2). Attempts: 1. stopped by Claude Code's low-memory guard after 21/21 passed; 2. the first-run pick missed 10/10 (H1); 3. 87/3; 4. 88/2. Run 3's extra fail was the harness reading `library.json` before the debounced save landed. I changed the check to wait for both files, and it then read the partial tags as `[1,1,1,1]`. |
| Unit tests | not re-run here | -59's Task 8 report: 585/585 at 6e07004; the fix wave's re-review ran its 7 touched files (179/179) |

## Findings

### F1 (Minor, pre-existing; fix-wave item 9): Esc in the lightbox picker's "Add technique" form closes the whole lightbox

- **What Mara does:** at 470 % she drags a region, presses `1` for "Stand out", types "qa harbour glint", which has no match, and presses Enter. The "Add technique" form opens with the caret in Name. She changes her mind and presses Esc.
- **Expected:** the picker's own rule (`tagging/picker.ts:339`). The first Esc closes the form and puts focus back in the search box. The lightbox and the drawn region stay.
- **Seen, in all 3 passes:** the lightbox closes. The drawn region, the typed name and the 470 % zoom are gone, and she has to reopen it, zoom in and draw again. Focus was in the Name input just before the Esc.
- **Likely cause** (from reading the code, not confirmed by a fix):
  - The picker's Esc runs `closeForm()`, which empties the form slot (`slot.innerHTML = ""`), so the focused input leaves the DOM.
  - The same keydown then bubbles to the lightbox's handler (`lightbox/view.ts:223–232`). There `t.closest(".picker")` on the detached target returns `null`. So the key counts as the lightbox's own Esc, and with no draft in progress it calls `close()`.
  - A fix could stop propagation in the picker's Esc branch, or test `e.composedPath()` instead of `closest`.
- **Evidence:** `results-p4.json` "Item 9" in all three logs: `form opened true; focus before Esc input; after Esc {"lightbox":false,…}`.

### F2 (Minor): a first-column board tile's "Open" button is clipped by the grid

- **What Mara does:** in the Boards view she hovers over the first tile of a row, or focuses it, to open that reference.
- **Seen:** the tile's tool bar ("Open", "Remove from board") is wider than the 160 px tile. It is pinned `right: 4px`, so it runs out of the tile's left side. In the first column it is clipped by the grid: only "en" of "Open" shows (`btnLeft 217` vs grid left `240`). In the other columns it covers the neighbouring tile's right edge.
- **Impact:** for a first-column tile, "Open" is a tiny target, and Playwright's click on its centre times out. Every first-column tile is affected (6 of 8 tiles at 1280 px are not). No data risk. "Remove from board" is fully visible.
- **Evidence:** `shots/error-scope.png` (pass 3) and `shots/tile-tools.png` (pass 4); `.bd-tools` in `styles.css:533`.

### Judgment calls, for the controller

- **J1. The status line after undoing a scoped board's delete.** Delete "Harbour light" while showing only it: the status reads "Board removed — showing all references", which is right. Press Ctrl+Z: the board comes back with the scope off, but the status still reads "Board removed — showing all references" until the scope changes again. That is the documented `boards/status.ts` rule ("stays until the scope changes again"), but after the undo the line is no longer true. Suggestion: clear it on any `boards` change that brings the board back.
- **J2. Export copy, "Show in folder".** The button opens Explorer on the parent folder with the export folder selected. The label now says "Show in folder" (fix-wave item 8), which describes that exactly. No change needed. Noted because -59 asked about it.
- **J3. The hover label for a partial region tag.** Tagging with `1` then Enter, with no technique highlighted, makes an operation-only region tag. Its hover label reads "Stand out", with no " › Technique". That fits a partial tag, but it means the full "Stand out › Rim light" form (Task 6) was not seen on hover live. Tab onto the same region labels and highlights it (`is-hot`, label visible), so the label mechanism itself works. The harness expectation was wrong for a partial tag. I'm counting this as a coverage gap, not a bug.

### H1 (open, not counted): the first-run "Create a new library…" pick sometimes never registers

- **Count:** 3 of my 10 launches, the same rate as -59's 3 of 7. When it misses, every retry in that launch misses too:
  - 4/4 in Plan 4 pass 1;
  - 10/10 in Plan 3 regression attempt 2;
  - 4/4 in the first screenshot launch.
  - The other 7 launches picked on the first click.
- **It is not only -59's page reload:** pass 1 reloaded after attaching the dialog route (`plan4-e2e.js:46`), but the other two misses had no reload.
- **What I can't tell:** whether the app or the harness is at fault. Every launch answers the folder dialog through a CDP route (`page.route` on the dialog IPC), because a real native dialog can't be driven here.
  - One explanation is that the route sometimes isn't active yet when the first request goes out. A real native folder dialog would then open, possibly behind the window, and hold every later click.
  - I added a window listing for the app's process on a miss, but the launch that carried it picked first time, so this is not confirmed.
- **Suggestion:** a 2-minute hand check. Delete `%APPDATA%\art.horus.app`, launch `horus.exe` 5 times, and click "Create a new library…" each time. If the native dialog always appears, H1 is a harness artifact.

## Fix-wave QA focus (`fix-wave-rereview.md`)

| # | Item | Result |
|---|---|---|
| 1 | F3: Alt+→ keeps focus on the moved tile; a second Alt+→ moves it again; resize with a tile focused | **Pass.** Focus stays on the moved tile (`i` 0→1→2), Alt+← too, three Ctrl+Z restore the order. Resizing to 984 px and back keeps focus on the same tile, with `scrollTop` unchanged. |
| 2 | F2: draw at ~416 %, `1`, pick, save: zoom stays; `0` and `1` work after | **Pass.** 470 % at the draw, after the picker and after the tag. `0` → 45 %, `1` → 100 %. Region error 0.0000 at 470 % and at fit. |
| 3a | F4: Link these two, why, save: focus on Edit link; Esc closes Compare, the pin is kept | **Pass.** Focus `cmp-link-btn` "Edit link"; "Linked by you: “same raking light”"; the score is unchanged (0.34); the pin is `true` → `true`. |
| 3b | I3: after a notice's Dismiss in Compare, Esc, `x`, `v` and Ctrl+Z each act once | **Pass.** Focus was on `<body>` after Dismiss. `x` swapped once (titles reversed) and `v` flipped once (both tiles `is-value`). Ctrl+Z undid the link only, and the import before it stayed (54 → 54 refs). Esc closed Compare once (item 4). |
| 3c | A background import doesn't move the caret in the link editor's why | **Pass.** The caret stayed at 7,7 with focus in the textarea and the text intact. |
| 4 | Lightbox over Compare (`L`), focus on `<body>`: Esc closes the lightbox only, a second Esc closes Compare; Ctrl+Z one step | **Pass.** `L` opened the side under the pointer (B). Ctrl+Z undid the link only, with the lightbox still open. The first Esc closed only the lightbox and the second closed Compare. |
| 5 | C1: under scope with no filter, Ranked lists members only and "N related" matches; "Linked by you" keeps off-board links marked | **Pass.** This replays Task 8's F1 sequence: scope on in Boards, then "Open" on a member. 0 rows outside the board; the note "2 related" equals 1 scored row plus 1 linked member; the off-board link is shown with "Not on this board". |
| 6 | I5: Compare at ~900–1150 CSS px: plates and outlines scale in their column | **Pass at 1050 px.** Both plates sit inside their tiles. Side A's right edge (371) is left of Shared (395), and side B's left edge (679) is right of Shared's right edge (655). Hovered region outlines are inside their tiles. |
| 7 | I2 / M5: Space-tick keeps focus; Enter-create focuses the new box; Ctrl+Z with the menu open updates the ticks | **Pass.** All three. Ctrl+Z / Ctrl+Y of a board creation remove and restore its row, and Ctrl+Z of an untick re-ticks the box. |
| 8 | "Show in folder": label and reveal | **Pass.** The label is "Show in folder", and a new Explorer window opened on the export's parent folder (see J2). |
| 9 | Pre-existing: Esc in the lightbox picker's Add technique form | **Confirmed: it closes the whole lightbox.** F1. |

## Task 8 gaps (`task-8-report.md`)

| Gap | Result |
|---|---|
| Search under scope | **Pass.** A non-member's exact title gives 0 hits; a member's title finds it. |
| Hover label | **Partial.** Hover marks the region `is-hot` and shows its label, which is visible. The tag was operation-only, so the label is "Stand out" (J3). |
| Tab onto a region while zoomed (T6) | **Pass.** At 422 % Tab focuses the region (`lb-box is-hot`, label visible), and the lightbox pans so the region is in view. The plate moved 64, −958 px to show it. |
| credits.txt opens cleanly in Notepad | **Bytes checked, Notepad not opened.** The file is valid UTF-8 with no BOM and LF line ends, with 8 blocks (Title, Creator, Year, Credit, Source) in board order. A second export writes `credits (2).txt`. I did not open Notepad: on Windows 11 it restores the user's other tabs, and I didn't want to touch them. |

## Plan 4 as Mara, beyond the lists

- **Boards through `b`:**
  - "New board…", then a name and Enter, creates a board that holds this reference, with focus on its box.
  - Space ticks the box for the next 7 references.
  - The inspector line reads "Boards: Harbour".
- **The Boards view:**
  - **Drag reorder** with a real mouse shows a ghost and lands the tile on the target; Ctrl+Z undoes it.
  - **Rename:** Esc cancels, Enter saves, and focus goes back to "Rename". Ctrl+Z / Ctrl+Y undo and redo it.
  - **"Show only this board"** turns into "Showing only this board". The status reads "Board: Harbour light · 8 references · Show all".
  - **Delete** asks "Delete Harbour light? You can undo this." and Ctrl+Z brings the board back.
- **Export:** "Exported 8 to <folder>" with "Show in folder".
  - Files are named `1 - Divan Japonais.jpg` … in board order. The two "See America" posters are separate files, numbered 2 and 3.
  - Each copy is byte-identical to its original in the library.
  - A second export adds ` (2)` to all 9 files, including `credits (2).txt`, and leaves the first 9 byte-identical.
- **Links:**
  - Dragging the Link… handle onto a Ranked row shows a leader line, then opens the editor "to Zodiaque ("La Plume")".
  - Save is disabled while "why" is empty. A forced save of spaces is refused with "Say why these are connected." and the spaces stay.
  - `k` opens the combobox, which never offers the reference itself or one it is already linked to. Arrow Down + Enter picks a reference.
  - "Linked by you" is the first group in Ranked, and it shows from the other end too.
  - Edit and Delete in the Links tab are one undo step each.
- **Lightbox:**
  - Wheel zoom to 470 %, and Space-drag pans.
  - The TIFF shows a 1600×1200 PNG preview with the exact note "Showing a preview — this format can't be shown at full size here."
  - The 20,400×600 PNG shows an 8192-wide preview with the same note. Neither is blank.
  - Esc closes it.
- **Compare:**
  - Shift-click on a Ranked row opens a modal with Shared in the middle and "Only here" on each side.
  - Shared holds "Make them think › Crop at the edge", and the score is "0.34 · related by technique".
- **Review Focus 6:**
  - The board renamed to "Harbour quit" and the link note edited to "edited just before quitting" were both saved.
  - The window was closed 394 ms after Save.
  - After a relaunch, both are on disk and in the UI. The scope is not restored, which is right, because it is view state.
- **Console errors:** none. **First-run pick misses:** 0 in passes 2–4; see H1 for the other launches.

## Not covered here

- **Review Focus 1, the hard names.** Titles with `: ? * " < > |`, `CON` or `NUL`, or a trailing dot. The demo set has none, and Plan 4 adds no title editing. These are covered by Task 2's unit tests only. Two references with the same title were checked live (the two "See America" posters).
- **Review Focus 2:** an original missing from `images/`, and an export folder that becomes unwritable part-way. Both are unit-tested (Task 2) and not driven live.
- **A 2,000-member board on the 2,500 set.** -59's Task 8 Run B covered it on 6e07004 (windowed grid, drag while scrolled). I did not re-run it at 836d276, to save the weekly budget.
- **Opening `credits.txt` in Notepad, TextEdit or PureRef** (see Task 8 gaps).
- **Board creation as its own undo step,** outside the menu's Ctrl+Z / Ctrl+Y check.
- **Light theme only** for the Plan 4 views; dark theme not driven (AGY note).
- **Dragging the Link… handle onto an already-linked row.** The combobox exclusion of linked references was tested; the drag path to a linked row was not (AGY note).
- **The lightbox `o` overlay toggle** (AGY note).
- **Compare from the Galaxy.** It is the only other entry point, and it was not driven. Compare from the Tree and the Radial is deferred (C26).

## AGY #3 cross-check (conversation 9639ac0d, `--mode plan`, read-only)

Verdict: **PASS**. Asked to check each PASS claim against the logs, the F1/F2 severities and the F1 cause reading, the "Not covered" list, and the overall verdict. Its answer, verbatim:

> PASS
>
> ### 1. Claims vs logs
> Every PASS claim in [2026-11-25-horus-boards-lightbox-compare-qa.md](file:///D:/Design%20Second%20Brain/taxonomy-of-visuals/.worktrees/p4-qa/docs/superpowers/qa/2026-11-25-horus-boards-lightbox-compare-qa.md) matches `run4.log` (50 pass, 3 fail, 1 note), `run2.log` / `run3.log`, `p4-reg2.log` (51/51), and `p4-reg3b.log` / `p4-reg3c.log` (87/3 -> 88/2 after the one-line wait fix in `887aa71` for [mara-plan3.js:471](file:///D:/Design%20Second%20Brain/taxonomy-of-visuals/.worktrees/p4-qa/docs/superpowers/qa/mara-plan3.js#L471)). No over-claims; J3 (partial hover label) and Notepad are called out honestly. *(Tiny typo at [report:71](file:///D:/Design%20Second%20Brain/taxonomy-of-visuals/.worktrees/p4-qa/docs/superpowers/qa/2026-11-25-horus-boards-lightbox-compare-qa.md#L71): `%APPDATA% rt.horus.app` missing `\a`.)*
>
> ### 2. F1 & F2 severities and F1 cause reading
> - **F1 (Minor, pre-existing) — cause reading exact, severity fair:**
>   - [tagging/picker.ts:294-297,339-346](file:///D:/Design%20Second%20Brain/taxonomy-of-visuals/.worktrees/p4-qa/app/src/tagging/picker.ts#L339-L346): `Escape` calls `closeForm()` (`slot.innerHTML = ""`), detaching the focused input, and never calls `stopPropagation()`.
>   - [lightbox/view.ts:226-233](file:///D:/Design%20Second%20Brain/taxonomy-of-visuals/.worktrees/p4-qa/app/src/lightbox/view.ts#L226-L233): `t.closest(".picker")` returns `null` on the detached target; with `!from && !draft` (cleared by `commit()`), `:230` calls `close()`.
>   - Either `stopPropagation()` in picker's Esc branch or `defaultPrevented` / `composedPath()` in lightbox fixes it. `Minor` is fair (pre-existing, narrow flow, no saved data lost).
> - **F2 (Minor) — verified in [styles.css:528-534](file:///D:/Design%20Second%20Brain/taxonomy-of-visuals/.worktrees/p4-qa/app/src/styles.css#L528-L534), severity fair:**
>   - `.bd-tile` is `160px`; `.bd-tools` (`right: 4px`) with `"Open"` + `"Remove from board"` overflows left (`btnLeft 217` vs `gridLeft 240`) and clips in `.bd-grid { overflow: auto }`. `Minor` is fair (no data loss, column 1 only, other paths work).
>
> ### 3. Scope & "Not covered" check
> - "Not covered" accurately lists RF1 hard names, RF2 missing/unwritable export, 2,000-member board re-run, Notepad/PureRef, board-create undo outside menu, and Compare from Galaxy.
> - Three minor items not listed in "Not covered" (none verdict-changing, all unit-tested): dark theme check (`mara-plan4.js` ran light only), dragging the Link handle onto an already-linked Ranked row (combobox exclusion was tested), and lightbox `o` overlay toggle.
> - Note: [2026-11-25-horus-boards-lightbox-compare.md:63-70](file:///D:/Design%20Second%20Brain/taxonomy-of-visuals/docs/superpowers/plans/2026-11-25-horus-boards-lightbox-compare.md#L63-L70) has Review Focus 1–5; "RF6" in the report/prompt is the quick-quit flush check (good extra coverage, just not numbered RF6 in the plan).
>
> ### 4. Overall verdict justified?
> Yes. `PASS` (0 critical, 0 important, 2 minor) is justified: fix-wave items 1–8 and Task 8's F1–F4 are proven on the real release exe at `836d276`, item 9 answered F1, Plan 2 and Plan 3 regressions are clean, and both findings are fair Minors with no data loss.

**Changes made after AGY:**
- I fixed the `%APPDATA%\art.horus.app` typo in H1.
- I added AGY's three not-driven items (dark theme, the Link handle dragged onto an already-linked row, and `o`) to "Not covered".
- **Review Focus 6:** AGY read the plan in the main checkout, which lists Review Focus 1–5. The plan at `836d276`, the build under test, has Review Focus 6 ("A link or board edit followed by a quit"), so the report keeps RF6.

## Screenshots

In the work directory (`scratchpad/qa4/shots/`, not committed):
- `boards-view.png`
- `compare-view.png` and `compare-1050.png`
- `scope-nonmember.png`
- `lightbox-hover.png`
- `rf3-harbour.png` and `rf3-long.png`
- `tile-tools.png`, and the `error-*.png` files from passes 1–3
- `credits.txt`, copied from the first export

README shots for -55: `boards-view.png` and `compare-view.png` in `plan4-boards/.superpowers/sdd/2026-11-25-horus-boards-lightbox-compare/readme-shots/`.
