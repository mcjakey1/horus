# Plan 5 QA: Find similar (as Mara Okafor)

QA session: `design-second-brain-b5`. Controller: `design-second-brain-02`. Persona and method: `QA-PERSONA.md`.
Cross-check: AGY #3 (`9639ac0d-afd6-4032-905f-456e5be2c893`), through `agent-logs/agy-run.sh`.

**Verdict: FAIL.** There is 1 Important finding (F1) and 1 Minor (F2). The rest of the plan works for Mara on the real app, including the download drill that Task 8 left unchecked.

**F1 (Important):** if Mara drags an image onto the drop zone while the search field is empty, Horus imports the image into her library instead of searching with it. Dropping onto the same zone while the dropdown is open works.

## Target

| | |
|---|---|
| Branch | `plan5-similar` |
| Main pass | `fa42df5` (debug exe SHA-256 `76fa8570…baa0`) |
| Re-check | `bac92d1` (final-review fixes; debug exe SHA-256 `cef59122…4281`). Re-checked (a) first-run save (both "Turn on now" quit-before-Begin and the full `notnow` phase) and (b) the disk line; ran the Plan 4 regression and all unit tests. |
| Build | `npx tauri build --debug --no-bundle`, `CARGO_BUILD_JOBS=1`, shared `CARGO_TARGET_DIR` (`.worktrees/p5-t1/app/src-tauri/target`, which held no release build). A release LTO build at JOBS=1 would not fit the 10-minute foreground limit, and the low-memory reaper kills background shells. Task 8 measured that ORT dominates, so debug and release behave about the same here. The exe plus `ort/`, `resources/` and `licenses/` was copied to a scratch folder and driven from there. |
| Machine | Windows 11, 16 GB RAM, AVX2, DPR 1, window 1280×800 |
| Model | Pinned files in `%LOCALAPPDATA%\art.horus.app\models\siglip-b16-224-q8`, kept (R17). Moved aside only for the download and damaged-model phases, then restored and checked (`.ok` plus the three pinned sizes). |

## Tests and builds

| Check | Result |
|---|---|
| `npm ci`, `npm run fetch:ort` (twice) | OK. The second run says "already in place and verified". |
| `npx tsc --noEmit` | clean (fa42df5 and bac92d1) |
| `npx vitest run` | **48 files, 656 pass** (fa42df5 and bac92d1) |
| `cargo test` (bac92d1) | **320 pass, 4 ignored**; doc and integration targets 0 + 1 pass |
| `mara-plan5.js` (new; this report) | On fa42df5: main 49 pass, 3 fail (F1; F2 twice); restart 4/0; notnow 9/0; download 10 pass, 3 fail; damaged 5/0. On bac92d1: recheck 4/0; notnow 9/0; dark 1/0. Of the 3 download fails, 2 were harness races (status read before the phase changed), and the `damaged` phase re-ran both, settled, and passed. The third was a too-strict text check: the notice also ends in "Dismiss". I fixed that check but did not re-run it; the logged text is correct. |
| Plan 4 regression: `mara-plan4.js` on bac92d1 | **50 pass, 3 fail, 1 note**, the same as the Plan 4 QA's final pass. The three fails are Plan 4's F1, F2 and J3, all deferred to Plan 6. No regression. |

Harness: `docs/superpowers/qa/mara-plan5.js <work dir> <exe> <main|restart|notnow|download|damaged|recheck|dark>`, CDP port 9335 (not 9336), with its own WebView2 folder and temp libraries. It refuses to run if `%APPDATA%\art.horus.app` exists, and deletes it afterwards.

## Findings

### F1 (Important): a drop on the zone during a drag imports the image instead of searching

**Mara:** she drags a photo from Explorer to find look-alikes. While she drags, the "Drop an image to find similar" zone appears beside the empty search field, and she lets go on it. Nothing is searched. The photo is imported into her library instead ("Added 1 to the Inbox", or "already in your library" for a duplicate). The plan says a dropped image "is decoded once in memory and never copied into the library".

**Repro** (`mara-plan5.js main`, block "drop"; fa42df5, and the code is unchanged at bac92d1):
1. Find similar is ready, the search field is empty and the dropdown is closed.
2. A drag enters the window (`tauri://drag-enter`, then `drag-over`). `.search` gets `is-drag`, and the zone shows at (622, 84).
3. Drop at the zone's centre (`tauri://drag-drop`, position × DPR).
4. Result: `similar_by_file` ×0, `import_paths` ×1.

The same drop with the dropdown open (type "boat" first) works: `similar_by_file` ×1, `import_paths` ×0, and 4 Lautrec rows.

**Narrow windows make it worse (code reading, not run):** at `max-width: 760px` the zone shows *only* during a drag (`styles.css:629-631` hides it when the list is open). So there F1 leaves no working drop path at all.

**Cause (code reading):** `app/src/similar-ui.ts:168` removes `is-drag` *before* the hit test at `:171`. `styles.css:624` shows `.sim-drop` only under `.search.is-drag` or an open listbox, so the zone is already `display: none` when `elementFromPoint` runs, and the hit test misses. `intake.ts:113` runs the same hit test, which also missed in this run (it imported). The jsdom tests mock `elementFromPoint`, so they can't see the CSS.

**Fix direction (controller's call):** hit-test before clearing `is-drag`, in both listeners. For example, clear the class on the next frame, or have both read one hit decided while the zone is still shown. Then add a test that applies the real `display` rule.

**Evidence limit:** the drag events were the Tauri webview events, emitted through `plugin:event|emit` (the same path the Plan 2 and Plan 4 harnesses use for drops). A native OS drag from Explorer was not run. The cause is in the code order, not in the harness.

### F2 (Minor): Settings focus can leave the dialog, and then Esc doesn't close it and view keys reach the views behind it

**Repro** (`main`, blocks "settings" and "focus-leak"):
1. Open Settings, then press Tab. Focus goes close → switch → Remove model → **`body`** → close …
2. With focus on `body`, Esc does nothing: the keydown listener sits on the sheet (`app/src/settings/panel.ts:50`).
3. Backspace goes through to the Reference view under the open modal: "Jane Avril" → "Divan Japonais". Only Backspace (navigation) was tried. Shortcuts that change data (Ctrl+Z, Delete) were not probed behind the dialog.

The plan asks for "focus trapped, Esc closes". The rest of the shell is `inert`, but nothing wraps focus. This is the same class as Plan 3 F1 and Plan 4 F1 (focus or Esc in modal layers), which are deferred to Plan 6. Mara can recover with the mouse, and the Backspace case loses nothing. Minor, unless a data-changing shortcut also passes through, which was not checked.

## What Mara gets (all PASS on the real app)

**First run** (fa42df5; re-checked on bac92d1):
- The SPEC §5a question is verbatim.
- The line reads "Download: 213 MB · This computer: 16 GB of RAM".
- Neither choice is pre-selected or focused on load.
- "Turn on now" makes no `similar_enable` call before Begin.
- **bac92d1 (a):** "Turn on now", then quit before Begin, saves nothing (no `settings.json`) and calls nothing (IPC: `intake_busy`, `get_settings`, `system_ram_gb`, `similar_status`). The next launch asks again. Begin then saves `on` and reaches ready.

**Turn on now with the model installed (fa42df5, main):**
- **15.7 s** from Begin to ready (27 s from launch), with no download phase. The status bar showed: off → loading → ready → indexing 0…50 of 50 → ready (see N5).
- `findSimilar: "on"` is saved, and the status bar reads "Find similar: ready".

**Settings:**
- A click on the status bar opens Settings at Find similar, with focus on the switch. The gear also opens it.
- Esc returns focus to the opener. This needs a real click; a JS `click()` doesn't focus the button, which was harness pass 1.
- The section shows: "Ready · 50 references indexed", "Disk space used: 214 MB", the credit as text with no link, and the SPEC sentence without the question.
- Remove model: the confirmation copy is verbatim; Esc cancels only the confirmation; Cancel makes no call.

**Looks similar tab:**
- ArrowRight from Ranked reaches the inserted fourth tab.
- The note reads "Looks alike — not about technique.". Rows are in rank order with no score, and the query reference never appears.
- **Divan Japonais: 4 Lautrec posters in the top 6** (Jane Avril, Zodiaque, Moulin Rouge La Goulue, At the Moulin Rouge, Laziness, Ambassadeurs).
- The Ranked pane's HTML is identical before and after. A row opens its reference.

**Search dropdown:**
- Three fast keys give `search` ×3 and `similar_by_text` ×1 (the 150 ms debounce), with "Searching…" showing meanwhile.
- The group comes after the technique options, is labelled "Looks similar" with "Works best in English.", has at most 4 rows and shows no score.
- "a poster with bold flat colour" gives 4 WPA posters; "a ship at sea" gives The Great Wave, Sète.
- "a photo of a cat" gives "Nothing in this library looks like that yet.", so the 0.05 cut-off holds.
- A field cleared before the answer shows no late group.
- ArrowDown into the group, then Enter, opens the row.

**Drop target (apart from F1):**
- The zone sits beside the open listbox, not inside `#q-results`.
- A drop with the list open searches without importing; the group has no English hint.
- A non-image gives "Horus couldn't read that image."
- A sparse 520 MiB file gives "That image is too large to search with."
- A drop elsewhere still imports (Plan 2 routing).

**Board scope (R15):**
- With "Lautrec pitch" (3 members) scoped, the tab lists only members (2 rows, 0 outside). Clearing the scope gives 2 → 6 rows.
- The dropdown group showed no non-members, but the query returned no member rows either. So group filtering is shown only by absence; the tab check is the strong one.

**Live indexing (171 references after importing 120):**
- Indexing starts by itself.
- A new reference shows "This reference isn't indexed yet.", then gets rows after ready.
- Pause stops at most 1 image after the click. The line, status bar and Resume button all say paused, and focus stays on Pause/Resume. Resume continues.
- **Galaxy pan while indexing (Task 8 NOT CHECKED):** rAF gaps p50 17.7 ms, p95 18.5 ms, max 18.9 ms. At ready: p95 18.2 ms. No stutter at this scale.

**Off:**
- The switch, turned off with the Looks similar tab selected, removes the tab, pane, group and drop zone from the DOM, and Callouts becomes selected.
- The files are kept (the disk line stays), and `findSimilar: "off"` is saved.
- Typing calls only `search`. A drag shows no zone, and the drop imports as usual.
- Turning it on again reaches ready in 0.8 s.
- First run "Not now" (fa42df5 and bac92d1): nothing in the DOM, and **ORT is not among `horus.exe`'s loaded modules**. A keyboard-only Space on the Settings switch turns it on (ready 50/50, no download), after which ORT is loaded.

**Restart:**
- Ready in 0.3 s, with no download. `embeddings.bin` is not rewritten (530,832 B).
- After truncating it to 177,944 B, the app rebuilds it (171/171 in 50.8 s, same size), with no crash.

**Download (model moved aside; app routed through a local CONNECT proxy via `HTTPS_PROXY`):**
- **No network at first run:** the notice reads "Couldn't reach the download. Check your connection and try again." with Open Settings. `findSimilar` is saved `off`, and the status bar says "needs attention". Open Settings shows the same copy plus Try again.
- **Cut mid-transfer (Task 8 NOT CHECKED, simulated):**
  - The proxy killed its sockets after 60.1 MB, with the vision file's `.part` at 59,887,867 B.
  - While downloading, the line read "Downloading the model · N MB of 213 MB" with a progress bar, and the status bar read "downloading N%".
  - After the cut: the network copy and Try again.
  - Try again resumed at 59,972,380 B (not 0) and relayed only 153.7 MB more. It verified, indexed and reached ready in 27 s.
  - The model passed `.ok` plus the pinned sizes.
  - Proxy log: only `huggingface.co:443` and `us.aws.cdn.hf.co:443`.
- **Remove model** (settled): phase `off`, `diskBytes` 0, no disk line. The model folder and `embeddings.bin` are gone, `findSimilar` is off, and the surfaces are gone.
- **Wrong bytes:** a garbage `tokenizer.json.part` 1 byte short gives "The download didn't finish correctly. Try again.". The `.part` is deleted, and `findSimilar` is off.
- **Damaged model** (same size, `.ok` present): "Find similar couldn't start on this computer.", `findSimilar` off, and option A search still works.

**Board/library switch (bac92d1 (b)):** the disk line follows the open library. With A open it shows 213,528,341 B. A new empty library B shows 213,373,093 B: A's `embeddings.bin` (155,248 B) is no longer counted, and "Remove model" is still shown. Back to A: 213,528,341 B.

**Light and dark:** I saw the tab, dropdown, Settings, the Remove confirmation and the drag zone in both themes (dark via the app's ◐ toggle; `emulateMedia` doesn't switch it). Everything is readable.

**Errors are artist copy:** every error string seen matched the R11 table or the UI copy exactly. No raw text appeared in `SimilarStatus.error` or the UI.

## Notes (not findings)

- **N1:** `firstrun.ts` (Begin with "Not now") still shows `Could not save that choice: ${String(err)}` on a settings-write failure. bac92d1 moved this line, but it dates from Plan 1. It is the same class as Plan 2's N1 (raw OS text), which Plan 6's copy pass owns.
- **N2:** during Remove model, the first `off` status still carries the old `diskBytes` (213,528,341). It settles to 0 within about 1 s; the UI shows no disk line afterwards.
- **N3:** the tab label "Looks similar" wraps onto two lines in the margin tab row at 1280 px (cosmetic).
- **N4 (ruled):** the plan says "Downloading model · …", but the app says "Downloading the model · …". The status bar adds "downloading N%" and "loading". Both come from the T6 design review (progress.md: Q2, Q3).
- **N5:** after loading, the status bar shows "Find similar: ready" for a moment, before "indexing 0 of 50". This happened in the main and notnow phases, on both builds. Mara sees "ready" flash and then change to indexing (cosmetic).
- **H2 (unexplained, did not reproduce):** in the first download attempt, Try again with the proxy up failed at once with 0 MB relayed. The harness then crashed on a proxy-port clash (fixed) before it could log the proxy. The model was restored by hand and checked. The next run relayed normally, and the cause was not found.
- **H1 (known harness issue):** the CDP dialog route missed the first-run pick 4/4 in one launch of the dark phase; a relaunch picked first time.
- **Harness races (fixed):** in pass 1, `download` read status before the phase changed. Re-run as `damaged`, all five checks pass. The harness now also restores the model on process exit.

## Not covered

- A native OS drag from Explorer (Tauri drag events were emitted instead; see F1).
- A physical Wi-Fi drop: simulated with a proxy cut; no system network setting was touched.
- Quit mid-download, then resume on start: Task 8 covered it; not re-run.
- Laptop sleep.
- A CPU without AVX2, and a missing VC++ runtime: covered by the unit tests only.
- 2,500-reference indexing speed and `similar_by_text` latency: Task 8's numbers stand. I indexed 171 references.
- Installer contents: Task 8.
- Plan 3 harness regression: not re-run. The Galaxy pan was measured above.
- A full audit that the download is the app's only network access: not sniffed. The proxy saw only Hugging Face hosts during the download.
- macOS and Linux.

## AGY #3

(pending)
