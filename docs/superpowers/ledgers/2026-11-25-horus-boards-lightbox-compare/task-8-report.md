# Task 8 report: the end-to-end check (Brief and Study)

Implementer -59, 2026-11-26.
- **Target:** `plan4-boards` at `6e07004`.
- **Commit:** `dbd6659` test: Plan 4 end-to-end check notes in app/README.md. It contains `app/README.md` and the new harness `docs/superpowers/qa/plan4-e2e.js` only; no app code.
- **Evidence:** `task-8-evidence/` (git-ignored). It holds:
  - run logs `runA*` and `runB*`;
  - `e2e-main.json` and `e2e-scale.json`;
  - screenshots in `shots-main/` and `shots-scale/`, including the per-step error shots from the earlier attempts;
  - the Step 1 logs.

## Step 1

| Check | Result |
|---|---|
| `npx vitest run` | **Exit code 0**; 45 files, 585 of 585; no "Errors" line, so 0 errors |
| `npm run build` | Exit 0. One warning: Vite's existing chunk-size warning |
| `cargo fmt --check` | Exit 0 |
| `cargo test`, `cargo clippy --all-targets -D warnings` | Not re-run, per your ruling, after my first `cargo test` was stopped by the low-memory guard. Verified by the controller at `189ff3a` (261 passed, 2 ignored, 1 doctest; clippy clean). Rust is unchanged through `6e07004`: `git diff 189ff3a 6e07004 -- app/src-tauri` is empty. |

## Step 2: how it was run

- **Build:** the release perf build (`p3-t11` target dir, `CARGO_BUILD_JOBS=2`, 5 min 56 s), driven over WebView2 CDP on port 9335 with its own profile.
  - This beats `tauri dev` because it is the shipped build, with the real CSP and the real opener capability.
- **Dialogs:** the harness answers the dialog IPC with the library or export folder.
- **Runs:**
  - **Run A:** the bundled demo set, 50 references. It launches twice, for step 8.
  - **Run B:** the 2,500-reference synthetic library.
- **Coordination:** -6a gave its OK and held its runs throughout.
- **Cleanup:**
  - `%APPDATA%\art.horus.app` is absent;
  - the temp libraries and the perf library are deleted;
  - the `Export test` folder is emptied;
  - no horus.exe is running.
- **Attempts:** Run A took four, Run B three.
  - Two launches lost the first-run pick.
  - Two attempts were harness fixes: a selector, per-step diagnostics, and closing Compare with its button so later steps could run (see F4).
  - Every result below comes from the final Run A and the final Run B.

The results table is in `app/README.md`, "Plan 4 end-to-end check". In short:
- **Pass:** steps 1, 2, 4, 5, 6, 7, 8 and 9.
- **Fail:** step 3 (F1).
- **Not checked:**
  - the search filter under scope;
  - Notepad, TextEdit and PureRef;
  - the hover label and the T6 Tab check (the poster used had no region tag beforehand).

## Hand checks

| Item | Result |
|---|---|
| T4: leader line during the drag | Shown |
| T4: pointer capture and drop on a `[data-ref-id]` row | The editor opened "to Breaker Boys" |
| T4: Esc mid-drag, then release | The leader is removed; no editor opens |
| T4: plain click | Opens the combobox |
| T5a: drag-reorder while scrolled (2,000 tiles, at tile 1002) | The ghost showed, the tile landed at index 1004, and `scrollTop` held at 28,056. No native image drag. |
| T5a: "Open folder" | `revealItemInDir` opened Explorer on the **parent** folder ("Design Second Brain"), with the export folder selected inside it. Whether that reads right as "Open folder" is a copy call for QA; "Show in folder" would describe it exactly. |
| T6: Tab onto a region while zoomed | **Not checked** (no pre-existing region on the poster used) |
| T7: Shift+Enter on a focused Ranked row | Opens Compare |
| T7: Esc from Compare keeps the pin and the filter | Pin `true` → `true`; filter chips 1 → 1 |

## Findings (bugs; no app code changed)

| ID | Severity | Finding | Evidence |
|---|---|---|---|
| F1 | **Important** (cause not found; needs a QA repro) | Under "Show only this board", Ranked showed 3 scored references that aren't on the board: "At the Moulin Rouge", "Breaker Boys" and "The Child's Bath". There were 5 scored rows; the Boards view's 10 tiles were the member list, and they matched the 10 picked. `renderRanked` filters `list` by `store.inScope` (`reference/view.ts:286`), and the jsdom tests pass, so I couldn't find the cause by reading. The sequence was: scope turned on in the Boards view, switch to Reference, show a member. It was seen in two runs (A3 and the final A). | `e2e-main.json` step3; `shots-main/s3-scope.png` |
| F4 | **Important** | After "Link these two" saves in Compare, focus is on `<body>` and Esc no longer closes Compare: two presses left it open. Close still works. A keyboard user is stuck until they Tab to Close. | `runA.txt` "step6 saved" `active: ""` and "after Esc" `compare: 1`; `shots-main/s6-after-esc.png` |
| F3 | Minor | After Alt+→ on a Boards tile, keyboard focus is on `<body>`. T5a was meant to move focus to the moved tile (`S.focusAfter`). A second Alt+→ then does nothing until the tile is refocused. | `e2e-main.json` step2 `focusAfterMove: "BODY"` |
| F2 | Minor | Tagging a region drawn at 416 % resets the lightbox zoom to 100 %. The zoom was 416 % at the draw and 416 % after the picker opened, but 100 % after the tag. The region itself is exact as a fraction of the image (error 0.0000 at 416 %, at fit and at 100 %), but the artist loses their place. | `e2e-main.json` step5 `zoomAtDraw`, `zoomAfterPicker`, `zoomAfterTag` |
| H1 | Harness note | The first-run "Create a new library…" pick didn't register on 3 of 7 launches, and no dialog IPC was sent, even with `page.reload()` after the route was attached. A retry worked each time. Not confirmed as an app bug. | `runA1`, `runA2/runA.txt`, `runB1.txt`, `runB-fail1.txt` |

## Other notes

- **Uncommitted edits seen in `plan4-boards`:** after my commit, `git status` showed uncommitted edits to:
  - `app/src/compare/view.ts` and `view.test.ts`;
  - `app/src/lightbox/view.ts` and `view.test.ts`;
  - `app/src/links/editor.ts` and `editor.test.ts`;
  - `app/src/styles.css`;
  - `.impeccable/hook.cache.json`.
- **They are not mine, and my results predate them:** the files are timestamped 23:50–23:51, after my Step 1 tests (23:24) and the release build (23:33). So my results are for `6e07004` as committed. I didn't touch them; my commit staged only the README and the harness.
- **Usage:** 35% of the weekly cap at the end; I flagged the warning line earlier.
