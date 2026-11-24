# QA — Plan 1 Foundation (as "Mara Okafor")

- **QA session:** `design-second-brain-ae`, 2026-11-25. Persona + method: `QA-PERSONA.md`.
- **Target:** `main` @ `4fcc78d` (Plan 1 code = merge `2ed7512`). Release `app/src-tauri/target/release/horus.exe` (portable; installers not installed).
- **How:** real exe, WebView2 over CDP (Playwright `connectOverCDP`), native folder/file dialogs answered via `page.route` on `ipc.localhost/plugin%3Adialog%7Copen` (same recipe as T9/T10). Every other IPC went to Rust. Disposable library in scratchpad under a non-ASCII path `…\qa\fx\Références Été\`. `%APPDATA%\art.horus.app` did not exist beforehand.
- **Scope judged:** only what Plan 1 ships: first run, the Reference view, idea search, import (files + folder), value/theme, persistence. No tagging UI (Plan 2), and no Tree/Galaxy/Radial/Boards (Plans 3–4).

## Verdict: PASS (with 5 minor notes, none blocking)

## Automated suites

- `cargo test` (app/src-tauri): **69 passed, 0 failed**.
- `npm test` (Vitest): **17 passed** (3 files).

## Mara's walkthrough: 40 / 42 checks pass. The 2 failures were harness errors; both were re-checked by hand and the app is correct.

| Job | Check | Result |
|---|---|---|
| First run | 3 steps; Begin disabled until library + Find-similar answered; neither FS button pre-selected; focus moves into dialog; demo on by default; RAM shown ("16 GB") | PASS |
| First run | Non-ASCII library path shown and used; demo library created in ~10 s; opens on tagged ref (Divan Japonais, Differentiate › Feature › Silhouette); "50 references" | PASS |
| First run | `settings.json` = `findSimilar:"off"`, `lastLibrary` with `Références Été`, `theme` saved | PASS |
| Explore | Callouts show plain-words definitions + scored thumbs; Ranked = "10 related · strongest first" with "shares <technique>" reasons; click-through navigates; Back + Backspace return | PASS |
| Explore | `/` focuses search; "moody" → Chiaroscuro; "stand out" → Differentiate techniques; Enter on a hit filters Ranked ("Using Silhouette · 7 references") | PASS (harness misread as fail; screenshot `04b` confirms) |
| Study | `v` toggles value view (greyscale plate + thumbs); `1` pins callout 1; light ↔ dark toggle; theme persists across restart | PASS |
| Hoard | Mixed batch (3 already-in-library demo copies, 1 dup, `fake.psd`, `empty.jpg`, `p3_red.png`, `bad_icc.png`): "Added 2 references · 4 files were already in the library · 2 files skipped", with per-file reasons; bad ICC "imported with a warning: ICC profile could not be parsed; colours left unconverted" | PASS |
| Hoard | No `.tmp`/psd left in `images/`; originals untouched; Inbox count rises | PASS (count 52 is correct; my expected range was wrong) |
| Scale | 2,000 JPEGs, nested folder import, recursive → "2052 references", "Added 2000 references" in **83 s**. Main-thread max stall **14 ms**; typing in search during import 13 ms | PASS |
| Scale | DOM 253 nodes at 2,052 refs; idea search 16 ms; title search finds `ref_0001`; untagged ref says "Not tagged yet. This reference is in the Inbox." | PASS |
| Crash-safety | Graceful close + relaunch → reopens last library, 2052 → 2052, nothing lost | PASS |
| Crash-safety | `library.json` overwritten with `{` → app opens `library.bak.json`, notice: "library.json could not be read, so Horus opened its backup (library.bak.json). Your most recent changes may be missing." | PASS (see M4) |
| Offline | Zero requests to non-localhost hosts across all three launches | PASS |
| Console | No console errors / page errors in any launch | PASS |

Screenshots: scratchpad `qa/shots/` (01-firstrun … 09-corrupt-recovery). These are not committed.

## Minor notes (Mara's eye, non-blocking)

- **M1 — the whole-image callout marker looks disconnected at rest.** On a portrait plate, the "3" badge for the full-image tag (Genre quotation) sits in the grey card margin to the right of the image (`02-reference-demo.png`). Mara reads it as pointing at nothing until she hovers it. *Corrected after AGY #3:* this is by design, not a bounds bug. `.box.is-whole { inset: -10px }` and `.num { right: -40px }` (`styles.css:95,101`) match the prototype 1:1, and the outline stays transparent until hover (`styles.css:191`). It is a UX polish note only.
- **M2 — technique filter list is unsorted.** Search → Enter → "Using Silhouette": rows come in library order (0.23, 0.25, 0.31, 0.21) with "this" first. `view.ts:190-192` maps `S.refs` order. This is a faithful port of `prototype/app.js:168`, so it is not a regression. Suggest sorting by score desc after "this".
- **M3 — long import has no progress.** 2,000 small JPEGs took 83 s, with only "Importing…" shown: no count, no cancel. The UI stayed fully responsive, so the "never blocks" goal holds. Mara's real library is 3,000 multi-MB photos and will take longer. Suggest an "N of M" count in Plan 2 intake.
- **M4 — backup recovery loses the whole last save, and its images go silent.** After the corrupt-JSON test, the library fell back from 2052 to 52 refs, because the 2,000-ref import was the last save. 2,052 files are still in `images/`, but nothing tells Mara that 2,000 of them are orphaned. This is the plan's one-generation backup by design. **Plan 6 Task 2 already owns orphan recovery** ("Recovered N images to the Inbox"), so QA will re-test this there. `library.json` stays `{` until the next save; the save-after-recovery path keeps the good backup (`library.rs` test `save_after_recovery_keeps_good_backup`).
- **M5 — recovery warning is shown twice.** The same text appears in the notice and, truncated, in the status bar after "Library: Références Été" (`09-corrupt-recovery.png`). Cosmetic.

## Not covered / limits

- The P3 → sRGB conversion was confirmed by the Rust test `icc_converted_to_srgb`, not by eye; `p3_red.png` imported cleanly.
- I did not run the installers (unsigned, user OK needed); the portable exe was used. I did not repeat the offline-with-adapter-disabled test; the zero-external-request check stands in for it.
- Keyboard-only: `/`, arrows, Enter, Esc, Backspace, `1`, `v` and Tab focus into first run were exercised. I did not do a full WCAG contrast audit.
- Window sizes: default 1280×800 only.

## AGY #3 cross-check

Conversation `9639ac0d`, 2026-11-25. **Verdict, verbatim: `PASS`.**

AGY's points:
1. The overall PASS holds against the Goal, the Global Constraints and Review Focus 1–5.
2. M2–M5 are verified exactly as written. AGY corrected the cause of M1, and the correction is applied above.
3. Side note on M2: filtered refs below `MIN_SCORE` show `0.00` (`byScore.get(r.id) ?? blank(r.id)`), whereas the prototype called `score()` directly. Minor.
4. No coverage gap changes the verdict. Paths not exercised live, which Rust tests and T9/T10 cover:
   - RF1, a mid-save I/O failure;
   - RF2, a file larger than `MAX_BYTES`;
   - the "Open existing…" first-run flow;
   - creating a library in a non-empty folder, which makes a `Horus Library` subfolder;
   - the CSP probes;
   - the `thumbs/256`, `thumbs/1024` and `taxonomy.json` layout check. Only `images/` was checked.

   Add these to the QA re-run when Plan 2 regresses this area.
5. "Good to close Plan 1 QA."

**Plan 1 QA: CLOSED — PASS.**
