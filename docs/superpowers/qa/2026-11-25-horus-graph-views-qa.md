# Plan 3 QA: graph views (Tree, Galaxy, Radial) and taxonomy editing

- **Tester:** session design-second-brain-6a, as Mara Okafor (QA-PERSONA.md).
- **Build:** `plan3-graph` at `c138f2b` (T1–T11 plus the final-review fix wave). The release `horus.exe` was built in `.worktrees/p3-qa` and run as the portable exe.
- **Window:** 1280×800 at DPR 1, with temp libraries only.
- **2,500-reference checks:** -59's perf exe, built from the same commit with `--features perf` and `VITE_PERF=1`, plus my own synthetic set (`scripts/make_perf_library.py --n 2500 --seed 7`, through `HORUS_DEMO_DIR`).
- **Date:** 2026-11-26.

## Verdict

**PASS: 0 critical, 0 important, 2 minor, 6 judgment calls (J4–J8 and the J2 note).**

- Every Plan 3 behaviour that jsdom can't prove works on the real app:
  - taxonomy editing;
  - Review Focus 4: one Ctrl+Z restores technique, links and tags, byte-equal;
  - ae N3;
  - every scene item on the fix wave's QA-focus list.
- All six pre-QA findings (P3-1 to P3-6) are fixed. J1 is fixed for the nodes.
- The two minors are below. Neither loses data.

## How it was tested

- **Reading the release build.** The release build has no test hooks, so `mara-plan3.js` reads the Pixi scene through Pixi's own devtools hook, `globalThis.__PIXI_APP_INIT__`, read-only. From it the harness reads:
  - the camera scale and position;
  - every taxonomy label's real box, using the real Source Serif 4 widths;
  - each label's visibility and row offset;
  - the selection ring's screen box.
- **Library files.** After each edit, the harness reads `library.json` and `taxonomy.json` from disk. Undo is checked by comparing byte-for-byte with the state before.

| Run | Harness | Result |
|---|---|---|
| Unit tests | `npx vitest run` at c138f2b | 38 files, **461/461** |
| Plan 2 regression | `mara-plan2.js` | **51/51** |
| Pre-QA harness (Tasks 1–9), re-run | `mara-plan3-preqa.js` | **40 pass, 6 notes**, plus 1 expected fail (the RF5 thumbnail 404 the test causes on purpose) |
| Phase 2 main | `mara-plan3.js` | **88 pass, 2 fail (both are F1 and F2 below), 2 notes** |
| Phase 2 follow-ups | `EXTRA=1 mara-plan3.js` | **18 pass, 1 fail (F1, reproduced)** |
| 2,500 references | `BIG=1 mara-plan3.js` + perf exe | **9 pass, 1 note** |
| Boot hang check | 32 cold launches | first run appeared 32/32 |

Two expectations in the pre-QA harness were out of date after the fix wave, and I updated them:
- it now clears the selection after the Enter test;
- the Radial's first selection now uses Enter. With nothing selected, arrows pan by design.

The pre-QA harness's screenshot-based reduced-motion check also failed once. The camera probe, run in the same state with a reference selected, shows the fit is instant, so that failure was the screenshot method, not the app.

## Findings

### F1 (Minor): Ctrl+Z inside a move dialog undoes text in another field, and the dialog then ignores Esc

1. Search the top bar (`#q`), for example "rim", then clear it.
2. In the Tree, open "Delete technique…" on a technique in use. The dialog takes focus in its empty search box.
3. Press Ctrl+Z.

**Expected:** nothing happens. Behind the dialog, Ctrl+Z should do nothing, and the library undo does correctly stand down.

**Actual:**
- WebView2's native text undo runs instead. Its undo stack covers the whole page, so it puts "rim" back into the top-bar search and moves focus there, out of the `aria-modal` dialog.
- Esc then no longer closes the dialog, because its key handler sits on the dialog.
- The dialog stays open until Cancel is clicked. Nothing is saved.

**Reproduced:** 3 of 3 times when the dialog's own search box had no edit history: twice in `mara-plan3.js` and once in the EXTRA run. In the EXTRA run, a dialog whose search had been typed in kept focus inside (2 of 2).

**Why it matters:** Mara undoes by reflex. She ends up with a dialog that won't close by keyboard and a search box she didn't touch. This is close to T10 concern 11, "dialogs don't trap Tab". A fix probably belongs with that Plan 6 focus-trap work: the dialog would swallow Ctrl+Z or Ctrl+Y, or keep focus inside.

### F2 (Minor): the import toast covers the inspector's bottom controls at 1280×800, and stays up after the import is undone

- After an import, the "Added 1 to the Inbox · Save note · Dismiss" toast sits over the inspector's lower right. With a technique selected, "Delete technique…" is underneath it: `elementFromPoint` at the button's centre returns `#import-notice`.
- Undo the import with Ctrl+Z: the count goes back to 50, but the toast still says "Added 1 to the Inbox".
- **Workaround:** Dismiss.
- **Context:** T10 ruling 2 already routes taxonomy toasts through the same box (`#import-notice`). Placing it so it doesn't cover the inspector, or clearing it when its import is undone, would fix both problems.
- **Screenshot:** `a05b-toast-covers-inspector`.

### Judgment calls, for the controller

- **J4: Galaxy at 2,500 references, tiles still overlap.** This was measured after the layout worker's `end` message (7.6 s).
  - 1,255 pairs overlap, touching 1,278 of 2,500 tiles.
  - The overlap is shallow: the median depth is 5.8 world units of the 48-unit tile, p90 16 and max 42.3.
  - At fit these are dots, so the overlap shows only when zoomed into the big cluster.
  - I have no pre-fix baseline: the old build wasn't kept.
  - On the 50-reference demo the overlap is fixed: 0 pairs (min centre distance 70.7), against 30 before.
- **J2 note (deferred to Plan 6, as expected):** no operation shows names in the Radial at fit on the demo.
  - The fit scales are: Differentiate 0.398, Infer 0.434, Group 0.589 and Sequence 0.593, against a threshold of 0.615.
  - The fix-wave review predicted that only Differentiate and Infer would hide their names (it put Group and Sequence at about 0.63). In fact all four hide them.
  - The Tree at fit (0.25) also shows no names. Two to three `+` presses bring them back.
- **J5:** at the threshold, names first appear at about 8 px on screen (13 world px × 0.615). That is legible only up close (`a12-radial-diff-zoom`). It is a matter for the Plan 6 label-floor work.
- **J6:** at fit, the 1-world-unit outline of off-path squares draws at about 0.25 px. They therefore look paler than their `--ink-3` contrast of 4.6:1 suggests. This is close to J2.
- **J7:** the inspector crumb clips long names with "…" ("Complementar…", "Rim light from …"). The full name is in the title right below it.
- **J8:** a technique whose name sits on stagger row 2 or 3 has it crossed by its own down-connector once the technique is expanded.
  - The selected path's inked vertical runs from the node to its reference block, straight through "Rim light". See the README shot `tree-view.png`.
  - The label oracle checks label against label, not label against connector.
  - A gap in the line behind the label, or routing the line beside it, would fix it.

### Boot hang (-59's 1-in-4): not reproduced

- 32 cold launches, each with a fresh `%APPDATA%`:
  - release exe: 6 plain (CDP observe-only), 6 with the harness's `page.route`, and 12 more with one reused WebView2 profile;
  - perf exe: 8 plain.
- First run appeared every time, in 0.5–3.2 s.
- I can't make it happen plain. My route is set after the page exists, while -59's was set during boot.

## Re-test queue

| Item | Result |
|---|---|
| **ae N3:** the domain-ask radios | **Fixed.** "Also use under…" links Chiaroscuro under Differentiate · Social by keyboard. The picker (op 1, "chiaro") then shows 2 radios. Choosing Social saves `branchId: differentiate.social`. Undo reverts it. |
| **RF4:** delete a technique in use | **Pass.** See the RF4 section. |
| **P3-1:** Tree labels overlap | **Fixed.** 70 labels, 0 overlaps at real widths, on 3 rows per band (offsets 18/36/54 and 14/32/50), at most 24 characters plus "…". The two long typed names clip to 25 characters, still with 0 overlaps. |
| **P3-2:** no selection from the canvas | **Fixed.** Enter with nothing selected selects the first operation in the Tree and the centre in the Radial. The crumb updates. A second Enter belongs to the scene. |
| **P3-3:** Radial label collisions | **Fixed.** 0 overlaps when zoomed past the threshold, for all four operations (25, 23, 13 and 16 names). |
| **P3-4:** fast +/- presses | **Fixed.** Six `+` at a 0 ms gap give 0.250 to 0.953 = 1.25⁶. Six fast → pans give exactly 360 px. A wheel mid-tween keeps the wheel result; a drag mid-tween keeps the drag. |
| **P3-5:** Galaxy tiles overlap | **Fixed on the demo** (0 pairs). See J4 for 2,500 references. |
| **P3-6:** camera follows the selection | **Fixed in all three views.** Each view walked past the edge with the selection ring on screen after every step: Tree 14/14 (2 pans), Radial 10/10 (8 pans), Galaxy 10/10 (7 pans). An inspector pick off screen is brought on screen (706 px). A click never pans (0.0 px). A store change with the same selection never pans (0.0 px). With reduced motion it jumps. |
| **J1:** off-path contrast | **Fixed for nodes:** `--ink-3` is 4.6:1 in light and 6.48:1 in dark. Connectors stay `--line-2` (1.57:1 and 1.61:1) by the I7 ruling. See also J6. |
| **J2 and J3** | Deferred to Plan 6, as expected. See the J2 note. |

## Fix-wave QA focus

| Focus item | Result |
|---|---|
| Label threshold, no flicker | Checked on every frame (944 frames) while wheeling and pressing `+`/`-` between scale 0.25 and 1.19: 2 threshold crossings, 2 visibility flips, 0 frames on the wrong side. |
| 24-character clip; 3 rows | Pass (see P3-1). |
| Camera reveal once per new id, never on click | Pass (see P3-6). |
| +/- compounding | Pass (see P3-4). |
| Enter starts a selection (Tree, Radial) | Pass. |
| Inspector crumb at 1280×800 | **Pass.** The crumb is 120 px high against a natural 119. The aside scrolls as a whole: with 1,158 references, `scrollHeight` is 21,442 against 712, and the crumb scrolls away with it, never squeezed. |
| Radial: delete the active operation | **Pass.** Op 9 is active, then Ctrl+Z: the Radial switches to Stand out and refits (scale 0.370, the same as fit). A remount keeps a live operation. |
| Operations taken to 9 | **Pass.** 5 added through "+ New operation…", taking inks Teal, Olive, Rose, Indigo and Umber. The button is then disabled with the title "Up to 9 operations". The Tree shows 9 operation nodes side by side, labels on 3 rows, 0 overlaps. Radial key 9 reaches "Repeat to bind". |
| Tree at 2,500, Complementary pairing expanded | **Pass.** The block of 1,158 references fits on screen (1,904×1,848 world units at 0.207). Show all still draws columns. |
| Radial at 2,500 | **Pass.** Ring 3's 2,190 references are all on screen at fit (outer radius 1,615, scale 0.180). |
| Galaxy at 2,500 | See J4. Frame rate and settle time are -59's re-measure. |

## T10 taxonomy editing on the real app

- **Rename inline (Enter)** saves in about 540 ms.
  - Focus then goes to the canvas, not a text field (C19).
  - The Tree label changes.
  - The Reference view's callouts show "Rim glow" (Step 3.1).
- **A taken name** shows "That name is taken by Silhouette."
- **Blur saves a name.** Esc cancels.
- **Synonyms:** "+ synonym" adds one and × removes it; each change saves.
- **Edit a definition, then click a swatch:** both apply.
- **Ink row:** shows the current ink, then the seed ink back, then the free extra inks, each named. "Seed ink back" returns `color: null`. Undo ×3 restores everything.
- **Typed text survives a store event (an import landing):**
  - an open "+ Technique…" form keeps its text and focus, and still submits under the fixed branch;
  - an open name field keeps its text and doesn't save it.
- **Dragging a thumbnail does not freeze the inspector.** The thumbnails are `draggable=false`. The next edit saves and its chip appears.
- **Drag to link on the canvas:**
  - Silhouette dropped on Differentiate · Social links it.
  - Over an already-linked branch, the cursor is `not-allowed`.
  - Over a valid target, it is outlined.
  - The cursor resets after the drop. Undo reverts the link.
- **Unlink:**
  - a pair no tag uses unlinks directly, with no dialog (R20);
  - on a technique's only link, the × is disabled, with the title "A technique needs at least one place".
- **Domains:**
  - "+ Domain…" lists only unused domain types.
  - "New domain type…" adds the domain and its branch, and one undo removes both.
  - "Delete domain…" offers "Move to <domain>" for each other domain, plus "Delete; tags become partial: 15 tags on 11 references, 6 techniques left with no other place". Nothing is pre-selected. Undo restores the domain and its tags.
- **Operations:**
  - "Delete operation…" offers "Move its branches and tags to <label>" for each other operation, plus "Delete them and their tags: 36 tags on 25 references, 14 techniques left with no other place".
  - Move re-keys every tag. Undo restores.
- **Operation name and plain label** ("Gather · Bind them") appear in the Radial's buttons and inspector, and in the tagging picker.
- **Domain icon picker:** shows the 8 icon descriptions as text, saves the choice and marks it pressed.
- **Read-only taxonomy** (`taxonomy.json` and `taxonomy.bak.json` both damaged):
  - the note reads "The technique list is read-only because taxonomy.json is damaged.";
  - there are no editing controls;
  - dragging a technique pans (162 px);
  - the file is untouched.
  - With only `taxonomy.json` damaged, the first EXTRA run saw editing stay on, because the backup loaded, as Plan 2 intends. The committed harness damages both files and does not assert that single-file case; Plan 2's Rust tests cover it.
- **Galaxy edges:** they re-fetch after a taxonomy edit without a reload (`graph_edges` 1 to 2), which is Step 3.4. Undo from the Galaxy restores everything.
- **Clean run:** no console errors, no requests outside localhost, and no raw error text in the UI.

## Review Focus 4

- **Delete Rim light** (4 references):
  - The dialog title is "4 references use Rim glow".
  - "Move them to…" lists 55 pairs with a working search, and the technique's own pairs are excluded.
  - "Keep them as partial tags (operation only)" is offered.
  - Nothing is pre-selected, and "Move and delete" stays disabled until a choice is made.
- **Move to Silhouette:** all 4 tags move and the technique goes. **One Ctrl+Z:** `library.json` tags and `taxonomy.json` are byte-equal to before.
- **Keep as partial tags:** 4 operation-only tags remain. One Ctrl+Z restores both files byte-equal. Redo is one step.
- **Unlink in use** (Silhouette under Differentiate · Feature, 7 references):
  - The title is "7 references use Silhouette under Differentiate · Feature" and the button reads "Move and unlink".
  - The technique's other pair is offered; the unlinked pair is not.
  - Moving re-points all 7 tags. One Ctrl+Z restores the link and every tag in place.
- **Esc and Cancel** change nothing, and focus returns to the opener.
- **Ctrl+Z behind the dialog** changes nothing in the library, but see F1.
- The partial delete shows no "now partial" notice. That is correct: the artist chose partial tags. The notice is for tags left pointing at something deleted.

## Not covered here

- **Frame rate and settle times:** -59 re-measures these on the same build.
- **Tree block at rest:** the single joint stub and the selected reference's inked elbow were seen in screenshots but not measured.
- **Keyboard walk through the Tree block, and Tab trapping in dialogs:** both are Plan 6 accessibility items.
- **Dark theme of the 5 extra inks:** unit-tested (`inks.test.ts`), not checked by eye.

- **Unit tests only, not clicked on the real app:**
  - delete an unused technique (`confirmDelete`);
  - an operation's "Delete them and their tags";
  - a domain's "Move to <domain>";
  - the `TaxonomyReadOnly` race toast.

## AGY #3 cross-check (conversation 9639ac0d, `--mode plan`, read-only)

Verdict, verbatim: **"PASS"**

Its summary, verbatim: "Yes. `PASS` (0 critical, 0 important, 2 minor) is justified against Plan 3 Global Constraints, Review Focus 1–5, and Task 10. All pre-QA findings (P3-1 to P3-6), `ae N3`, RF4, and fix-wave items are proven on the real release binary at `c138f2b`."

- **F1 and F2:** AGY says both are "verified exact, severity right".
- **F1 cause, verbatim:**
  - "`keys.ts:44-45` returns early without `preventDefault()` when `isTextEntry(e.target)` is true, so WebView2's page-wide native undo runs when `.tx-search` is empty";
  - `move-tags.ts` "does not mark the background shell `inert` (unlike `save-dialog.ts`) and binds `Escape` on `d` instead of `document`".
- **Harness softness it noted, none of which changes the verdict:**
  - the Esc and Cancel focus-return is logged but not asserted;
  - the reduced-motion check in the EXTRA run doesn't take a reading before the key press, but run 5's check at line 300 does;
  - "Show all still draws columns" is screenshot-only;
  - the second-Enter check only shows the selection is kept.
- **One over-claim**, about the single-file backup: corrected above.

## Screenshots

These are in the QA scratch folder, which is not committed:
- `shots-p2/` (`a01` to `a14`);
- `shots-extra/` (`x02` to `x05`);
- `shots-big/` (`b00` to `b05`).
- `readme-shots/` for the root README (tree-view, tree-edit, galaxy-view, radial-view): saved in the plan3-graph sdd folder at -55's request.
