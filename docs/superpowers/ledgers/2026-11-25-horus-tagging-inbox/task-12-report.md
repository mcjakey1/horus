# Task 12 report: the end-to-end check (Hoard, then Tag later)

**Status:** DONE, with two items to fix (3 and 4). As instructed, no product code was changed.

**Branch and commit:** `p2-t12-e2e` (worktree `.worktrees/p2-t12-e2e`), based on `5552f2d`. One commit:
- `1746845`: test: Plan 2 end-to-end check notes in app/README.md. It contains the notes in `app/README.md` and the harness, `docs/superpowers/qa/plan2-e2e.js`.

The stray `.impeccable/hook.cache.json` change in that worktree was left uncommitted.

## Step 1

- `cargo test`: 154 passed, plus 1 doctest.
- `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check`: clean.
- `npm test`: 218 of 218 passed.
- The `esc` grep: one hit, `app/src/esc.ts:4`.

## Step 2

The run drove the release `horus.exe` over WebView2 CDP (port 9333), on a fresh `D:\Design Second Brain\Références test 2\` with the demo set off.

| # | Result | Measured |
|---|---|---|
| 1 | PASS | Import of 20: 4.6 s; Ctrl+Z 35 ms; Ctrl+Shift+Z 23 ms |
| 2 | PASS | 20 "Already in your library" rows; still 20 references |
| 3 | **PARTIAL** | Tagging 62–83 ms each. → after Enter does not advance |
| 4 | **FAIL** | The image imports, but no picker opens |
| 5 | PASS | `.treg` outline on X's thumb in Y's callout |
| 6 | PASS | `taxonomy.json` gained Halo glow (`custom: true`) in 585 ms; one Ctrl+Z dropped it and its tag in 573 ms |
| 7 | PASS | `sourceUrl` set from the `<img src>`, in `library.json` |
| 8 | PASS | Close 33 ms after Enter. The tag was not on disk before the close and was on disk after it, so the close flush saved it. It was there on relaunch |
| 9 | PASS | Switch 45 ms; `undo` returns an empty Change with `canUndo: false`; neither library file changed |

There were no console errors and no external requests.

**Item 3: the repro.**
1. In the Inbox, press `1`.
2. Type `chiaro`, then press Enter. Focus stays in `.pk-search`.
3. Press →. Nothing happens.

`picker.ts` leaves sideways arrows alone when `opts.inbox` is set, and the `inbox/view.ts` keydown returns early on `isTextEntry`. The workaround is Enter, then Tab, then →.

**Item 4: the repro.**
1. Show a tagged reference.
2. Drop a new image on the plate.

The result is "Added 1 to the Inbox", with no picker and no switch to the Inbox. `#boxes` (`.boxes { position: absolute; inset: 0 }`) covers its sibling `#plate`. The `elementFromPoint` call in `intake.ts` therefore hits `div.box.is-whole`, and `closest("[data-ref-drop]")` returns null.

AGY suggests moving `data-ref-drop` onto `#specimen`, since `.box` needs pointer events for hover.

**Deviations:**
- The release exe was used instead of `tauri dev`.
- Drops were `tauri://drag-drop` events emitted through `plugin:event|emit`.
- The paste was a synthetic `ClipboardEvent` with a JPEG `File` and `<img>` HTML.
- Folder dialogs were fulfilled over CDP.
- In item 3, the Inbox tab was clicked, and Tab then → was used after the failure.
- In item 8, the real `CloseMainWindow` was sent from a PowerShell already started.
- In item 9, library B was made first with New library….
- The test libraries and `%APPDATA%\art.horus.app` were deleted afterwards.

## AGY #2 (conversation bb3386cd, read-only)

**Verdict:** "PASS". AGY found that:
- the harness has no vacuous checks;
- item 8 "genuinely proves the `CloseRequested` flush rather than the 500 ms debounce";
- both failures are real, with exact root causes;
- the deviations are honestly disclosed, and nothing is overstated.

Its one non-blocking note is the preferred item 4 fix: `data-ref-drop` on `#specimen`, not `pointer-events: none`.
