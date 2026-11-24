# QA persona — "Mara Okafor"

QA session: `design-second-brain-ae`. Controller: `design-second-brain-73`.
Cross-checked by AGY #3 (`9639ac0d-afd6-4032-905f-456e5be2c893`); persona review round 1 = PASS WITH FIXES, fixes applied.

## Who

Freelance concept artist and illustrator, 9 years in. Games key art, book covers, some ad storyboards.
Runs Photoshop + Blender + PureRef on a Windows studio PC, two monitors, switches light/dark with time of day.
Library: ~3,000 refs (film stills, photo studies, old master crops, screenshots, some Display P3 phone shots),
dumped in nested folders, half untagged, many duplicates.

## Day-to-day jobs Horus must serve

1. **Hoard.** Mid-task, throw refs in without blocking: drag-drop 20 screenshots, paste from clipboard,
   drop a nested folder, file picker. Duplicates detected/merged, not doubled. Inbox catches them.
2. **Tag later.** Friday evening, clear the Inbox fast and keyboard-first: partial tags (operation only),
   synonym search in her words ("moody" finds Chiaroscuro), inline custom technique, "Tag like this",
   region crop on the part that matters, undo/redo.
3. **Explore correlations.** "This ref works — what else does the same trick, and why?" Reference view
   Related list with plain-words reasons, Idea search AND/OR, Galaxy/Tree/Radial views, her own drawn Links
   with a "why" note (ranked first), rename/edit taxonomy nodes in Tree view.
4. **Find similar (optional).** Off by default, hidden when off. When on, labelled "Looks similar", kept
   separate from "Related", never claims a technique reason.
5. **Brief.** Build a Board for a client pitch, export to a folder, drop into PureRef / email.
6. **Study.** Lightbox + Compare two refs side by side, flip to value view to check the read.
7. **First run.** Demo library, intro card skip/replay, Find similar opt-in step. Works fully offline.

## What makes Mara quit

- Lost work (tags, boards, links) after crash/restart.
- Import that freezes the UI or mangles colour (ICC).
- Jargon labels she has to decode. Connections with no "why".
- Slow or janky at 2,000+ refs.
- Mouse-only flows for repetitive tagging. Unreadable contrast in either theme.

## QA method per plan

1. Pin target: branch + commit SHA, recorded in the report.
2. Read plan + SPEC; list acceptance criteria as testable checks. Judge only what the plan claims to ship.
3. Run plan's own tests/build; record exact counts/output.
4. Drive the **real Tauri binary** (WebView2 CDP, as Plan 1 Task 9 e2e) whenever IPC, filesystem, CSP,
   native drop or window close is in scope. `vite dev` with a fake API only for pure-UI checks, and say so.
5. Always use a **disposable temp library folder**. Never mutate `demo/` or repo fixtures.
6. Walk Mara's jobs that the plan touches, in **light and dark**, plus a keyboard-only / focus pass.
7. Non-functional & failure-mode step, scoped per plan: synthetic 2,000+ ref library (DOM cap, smoothness),
   restart + corrupt-JSON backup recovery, Display P3 ICC test image, offline / zero network calls / CSP.
8. Verdict: `PASS` / `PASS WITH FIXES` / `FAIL`, with `file:line` + repro steps.
9. Send report to AGY #3 read-only; quote AGY verdict verbatim in the report.
10. Report to controller. Report file: `docs/superpowers/qa/<plan>-qa.md`.
11. **Re-verify loop:** after fixes, re-test fixed items on the new SHA; AGY #3 sign-off before closing as `PASS`.

## Rules

- Read-only on build code. Fixes go back to the controller.
- Never copy `reference/`, `REFERENCE-ANALYSIS.md` or `.impeccable/mocks/` (third-party) into reports.
- Don't install the unsigned MSI/NSIS system-wide without the user's OK; use the portable exe.
- Check weekly usage before each AGY run; finish current task and stop at 30%.
