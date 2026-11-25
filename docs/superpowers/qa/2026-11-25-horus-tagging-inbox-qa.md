# QA — Plan 2 Tagging, Inbox and Undo (as "Mara Okafor")

- **QA session:** `design-second-brain-ae`, 2026-11-25. Persona + method: `QA-PERSONA.md`.
- **Target:** `main` @ `8406471` (code merge `0b7ebb4`). Release `app/src-tauri/target/release/horus.exe`, built 10:50 from that head. Portable only.
- **How:** the real exe over WebView2 CDP (port 9334). Native gestures are driven one layer down, as in `plan2-e2e.js`:
  - a drop is the `tauri://drag-drop` event;
  - a paste is a synthetic `ClipboardEvent` carrying a `DataTransfer`;
  - dialogs are answered with `page.route`.

  Libraries are disposable, in scratchpad and outside the repo: `…\fx\Mara Bibliothèque\` and `…\fx\Mara inbox ü\Horus Library\`. `%APPDATA%\art.horus.app` was absent before the run and absent after it.
- **Scripts:** `mara-plan2.js` (the walkthrough, 48 checks) and `mara-plan2-race.js` (the probe for F1).
- **Scope:** what Plan 2 claims to ship. Not judged here:
  - import progress and Cancel (moved to Plan 6);
  - macOS close (Plan 6);
  - Tree, Galaxy, Radial and Boards (Plans 3 and 4).
- **Overlap:** `plan2-e2e.js` (by fb, 9/9) already covers the Task 12 checklist, so this run aims at what it leaves out: Review Focus 1–5, save failure, Merge, chips, AND/OR, a 2,000-item Inbox, and re-tests of the Plan 1 notes.

## Verdict: PASS WITH FIXES

One important fix (F1) and one minor fix (F2). Everything else Mara needs for "hoard, then tag later" works, including the failure paths.

## Walkthrough: 46 / 48 checks pass

The two "FAIL" lines from the run, explained:
- "Try again saves and closes": the save path **passed**. The edit the app applied was on disk after Try again. My check expected `rim-light`, but the app had applied Chiaroscuro, which is finding **F1**.
- "RF3: empty Inbox copy": a real issue, finding **F2**.

| Area | What Mara did | Result |
|---|---|---|
| Plan 1 carry | Library layout: `library.json`, `taxonomy.json`, `images/`, `thumbs/256/` and `thumbs/1024/`, with ≥50 thumbs each | PASS |
| **M2 re-test** | Filter by a callout's technique: Ranked is now score-desc: 0.31, 0.27, 0.25, 0.25, 0.23, 0.21 | **PASS (fixed)** |
| AND/OR | Two filter chips. "Any of" 10, "All of" 1, one technique alone 7. Chip × drops one | PASS |
| RF1 | Ctrl+Z in the top search box undoes the typing. In the note field it stays in the field. `library.json` is byte-identical and the count is unchanged | PASS |
| Hoard | Dropped a folder of 12 new images plus `fake.psd`, `empty.jpg` and one copy already in the library. Got "Added 12 to the Inbox · 1 file was already in the library · 2 files skipped", reasons per file, "Already in your library: Marchand abat-jours — Show", and an optional note field. Badge 12 | PASS |
| Note | The batch note was saved on all 12 in one call (530 ms). An XSS-shaped note rendered as text (`window.__xss` undefined). One Ctrl+Z removes it from all 12, and Ctrl+Shift+Z restores it | PASS |
| Duplicates | Show opens the existing reference. Pasting the bytes of an existing image with `<img src=…>` HTML gives "Already in your library … Show Merge". Merge fills only the empty `sourceUrl`, and no new reference is made | PASS |
| RF5 | A `text/plain` URL paste, and a `text/uri-list` + `<img>` HTML paste with no image, each give exactly "Paste the image itself — Horus doesn't download from the web." Nothing is added and there are no requests | PASS |
| Tag later | 12 Inbox items tagged by keyboard only (`1`–`4`, type, Enter, →). App time per item 46–86 ms. "moody" gives Chiaroscuro. Operation + Enter with an empty search gives a partial tag `{operationId: "sequence"}` | PASS |
| RF3 | The last item stays on screen once tagged, and → on it stays put | PASS |
| RF3 | The "Inbox is empty…" copy after the whole Inbox is tagged | **FAIL → F2** |
| RF4 | Added "Halo glow" (`custom: true`, on disk in 533 ms). "  halo   GLOW " then gives "Already exists: Halo glow — use it", and there is still exactly one Halo glow | PASS |
| Chips | `t` on a demo reference with suggested tags. ✓ confirms (`suggested: false`), × removes, Ctrl+Z restores | PASS |
| Study | `L` opens the lightbox. `v` there leaves the Reference view's value checkbox alone. Esc closes | PASS |
| **Save failure** | I set `library.json` read-only, then tagged. The notice reads "Couldn't save your last changes: … Access is denied. (os error 5). Horus will try again with your next change, and before it closes." On close the window **stays open**, with "Your changes are not saved", Try again and Quit without saving. I cleared read-only and pressed Try again: it saved and exited 0, and the edit is on disk | PASS |
| Restart | Relaunch reopens the library with 62 references, nothing lost | PASS |
| Library menu | "New library…": the demo box is unticked by default. In a non-empty folder it creates `<folder>\Horus Library`. Ctrl+Z after the switch does nothing. "Open library…" on the parent folder opens its `Horus Library` (**Plan 1 carries closed**) | PASS |
| Scale | 2,000 JPEGs dropped as a nested folder: "Added 2000 to the Inbox" in 51 s (Plan 1: 83 s). The Inbox grid is windowed: 30 `<img>` at the top and 30 scrolled to the bottom. 5 keyboard tags took 76–110 ms each | PASS |
| **M5 re-test** | With `library.json` corrupted, the recovery warning shows once, in the notice only and no longer in the status bar | **PASS (fixed)** |
| Offline / console | No external requests and no console or page errors across 3 launches (plus the probe's) | PASS |

Screenshots are in scratchpad `qa/shots2/` and are not committed.

## Findings

### F1 — Important: typing a technique's exact name can tag a different technique

**Repro:** on any reference, press `t`, then `1` (Stand out), type `rim light`, and press Enter.
- **Expected:** a Rim light tag.
- **Actual:** a Chiaroscuro tag, 8 of 8 times, at typing delays of 0, 20 and 60 ms (`mara-plan2-race.js`). It is not a race. The highlighted card before Enter is `chiaroscuro`, with the query `"rim light"`.

**Cause:**
- `matchesQuery` (`app/src/tagging/model.ts`) also matches description words longer than 3 characters. "rim light" reduces to `light`, and Chiaroscuro's description reads "Strong light against deep shadow…".
- `visible()` (`app/src/tagging/picker.ts:75`) keeps taxonomy order with no ranking, and the picker auto-highlights the first visible card. Chiaroscuro comes before Rim light, so it wins.

**Why it matters to Mara:** the designed flow is "type the name, Enter". She gets a silently wrong tag, and it feeds every Related score. Custom techniques she adds later make such collisions more likely.

**Size in the seed:** I replicated `matchesQuery` in Python over every operation's techniques.
- Exact name typed, wrong card first: 1 of 48 (Rim light).
- Synonym typed, wrong card first: 17 of 324. Most are shared meanings, for example "backlit" for Silhouette and for Rim light.

**Suggested fix:** rank `visible()` by match tier, keeping taxonomy order within a tier:
1. exact name;
2. name contains the query;
3. synonym;
4. description words.

Add a test: with `differentiate`, the query `"rim light"` puts `rim-light` first. Check whether Rust `search.rs`, the top-bar search, wants the same tiering. There, the sort by count could also push a name hit below a description hit.

### F2 — Minor: a finished Inbox never says it is empty

**Repro:** tag every Inbox item, then switch to Reference and back to Inbox.
- **Actual:** the badge reads 0, but the grid still shows the last tile marked "tagged", with the picker docked (`05-inbox-empty.png`).
- **Expected:** "Inbox is empty. Drop, paste or open a folder to add references." Review Focus 3 says the copy shows "when the derived list is empty", and here the derived list is empty.

**Cause:** `derive()` (`app/src/inbox/view.ts:91-100`) re-inserts `S.cur` while it is tagged. `S.cur` is released only by `select()` of another item, by an undo that removes it, or by a library reset. On the last item there is no other item to select, so the copy can't appear until the next intake or a restart.

**Suggested fix:** release a tagged `S.cur` when the Inbox view is re-entered, keeping RF3's "stays until the artist moves on" inside one visit. Add a test: tag the last item, re-enter the view, and the empty copy shows.

### Notes (no fix needed for Plan 2)

- **N1:** the save-failure copy passes the raw OS text ("Access is denied. (os error 5)"). Suggest a plain hint such as "Check the library folder isn't read-only or offline" (Plan 6 copy pass).
- **N2:** the notice box overlaps the bottom-right Inbox tiles and the docked picker until it is dismissed (`12-inbox-dark.png`). Cosmetic.
- **N3:** the domain-choice radios (SPEC §6.3 "ask") can't be reached in the app with the seed. No seed technique sits under two branches of one operation (Chiaroscuro's two branches are under different operations). Only the unit test `ask_domain` covers it. Re-check in Plan 3, when the taxonomy becomes editable.
- **N4:** keyboard-only tagging was fast, and a focus ring is visible on the op buttons and tiles in light and dark. I didn't run a full WCAG contrast audit.

## Plan 1 note status

| Note | Status |
|---|---|
| M2 | Fixed and verified here |
| M5 | Fixed and verified here |
| Plan 1 carries | Layout, New-in-non-empty and Open-via-parent are verified here |
| M3 | With the user / Plan 6 |
| M4 | Plan 6 Task 2 |
| M1 | Polish |

## AGY #3 cross-check

AGY #3 reviewed this report in conversation `9639ac0d` on 2026-11-25.

**AGY's verdict on this report, verbatim: `PASS`.** AGY also judged that the report's own verdict, PASS WITH FIXES, is right for Plan 2.

AGY's findings:
1. **Plan 2 verdict.** PASS WITH FIXES is justified. F1 breaks the Goal's "tag them fast by keyboard" with silent wrong tags.
2. **F1 is verified exactly, and Important is the right severity.**
   - `model.ts:27-38` reduces "rim light" to `["light"]`.
   - `picker.ts:75,78` keeps taxonomy order and auto-highlights index 0.
   - The tiered fix is sound.
   - **AGY added a point:** apply the same tiering in Rust `search.rs:134`, sorting by `(tier, Reverse(count))`. Today the sort is by count alone, so a high-count description match outranks an exact-name match. It can also push that match, or a 0-count custom technique, past `MAX_TECHNIQUES = 8` (`search.rs:152`).
3. **F2 is verified as a real gap, not intended, and Minor is the right severity.**
   - Re-entering the Inbox calls `inbox.focus(0)` (`firstrun.ts:51`), which keeps the tagged `S.cur`.
   - **AGY added a point:** when the fix releases `S.cur` on re-entry to an empty Inbox, it should also close the docked picker, so a stale picker isn't left beside the empty copy.
4. **No coverage gap changes the verdict.** These paths were not exercised by this script; `plan2-e2e.js` or the unit tests cover them:
   - the "Tag like this" plate drop;
   - the lightbox region drag;
   - "Quit without saving";
   - refusing a library switch when its save fails;
   - a damaged `taxonomy.json` (read-only fallback).

**Plan 2 QA: PASS WITH FIXES.** Fixes needed: F1, in both the picker and `search.rs`, and F2. QA re-verifies them on the fix SHA, then closes as PASS after AGY sign-off.

## Re-verify on the fix (main @ `8a6dad5`, fix `2c842a4`)

- **Target:** release `horus.exe`, rebuilt at 11:15, after the fix commit at 11:06. The controller reports Vitest 235/235 and cargo 164 + 1 doctest.
- **Harness note:** the first re-run aborted at first-run setup (Begin stayed disabled). A probe (`scratchpad probe2.js`) showed that the dialog stub answers correctly on the new build, so it was a one-off harness timing flake. The clean re-run below is the result of record.
- **`mara-plan2.js`, full regression on the new build: 48 / 48 PASS.** Both earlier "FAIL" lines now pass:
  - "RF3: empty Inbox copy": after tagging all 12 and switching Reference → Inbox, the Inbox shows "Inbox is empty. Drop, paste or open a folder to add references.", and the badge reads 0 (**F2 fixed**). RF3's in-visit behaviour still holds: the last item stays on screen once tagged, and → on it stays put.
  - "Try again saves and closes": the `1` → "rim light" → Enter tag is now `rim-light` and is on disk after Try again (**F1 fixed in the picker**).
  - Everything else is unchanged and passes: RF1, RF4, RF5, Merge, chips, AND/OR, the M2 and M5 re-tests, the Plan 1 carries, the 2,000-item Inbox (50 s import, 30 `<img>`, 77–129 ms per tag), zero external requests and no console errors.
- **`mara-plan2-race.js`:** 8 / 8 runs, at typing delays of 0, 20 and 60 ms. Each time, `highlightedBeforeEnter` was `rim-light` and the applied tag was `rim-light`. The top-bar idea search for "rim light" now lists `rim-light`, `chiaroscuro`, `silhouette`, with the exact name first (**F1 fixed in `search.rs`**).
- **Not re-tested live:** a 0-count custom technique surviving `MAX_TECHNIQUES` in the top-bar search. Per the commit, the Rust tests and `match-cases.json` cover it.

**AGY #3 sign-off** (conversation `9639ac0d`, 2026-11-25). **Verdict, verbatim: `PASS`.**
1. The TS `matchTier`/`rankByQuery` tiers 0–3 match `search.rs` exactly. `search.rs` adds tier 4 (operation-only).
2. Within a tier, the order is the same in both: TS keeps taxonomy order, and Rust sorts by `Reverse(count)` and then taxonomy order.
3. An exact name ranks first and survives `MAX_TECHNIQUES` (`exact_name_outranks_count_and_survives_cap`, shared `match-cases.json`).
4. The F2 `enter()` runs only on re-entry (`focus`/`focusId`), so RF3 still holds within one visit. An empty Inbox shows `EMPTY_COPY`, and `closePicker()` calls `dock?.hide()`.
5. AGY found the live evidence sufficient and no regressions in `2c842a4`: "Signed off — Plan 2 QA closed as `PASS`."

**Plan 2 QA: CLOSED — PASS.**
