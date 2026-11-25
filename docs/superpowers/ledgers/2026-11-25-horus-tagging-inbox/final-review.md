# Plan 2 final whole-branch review (c2e0285..02f4415)

Reviewer: Opus, read-only. Branch `plan2-tagging`, head `02f4415`.

**What I read:**
- At head, in full: `commands.rs` 1–956 (the non-test part), `lib.rs`, `hooks.rs`, `saver.rs`, `history.rs` 1–110, `edit.rs` 1–520, the `library.rs` and `import.rs` diffs, and the `taxonomy.rs` save, load, fallback, custom-technique and slug code.
- The TS files: `api.ts`, `store.ts`, `intake.ts`, `importer.ts`, `firstrun.ts`, `library-menu.ts`, `save-dialog.ts`, `keys.ts`, `views.ts`, `ops.ts`, `esc.ts`, `inbox/view.ts`, `lightbox/view.ts` and `reference/filter.ts`. Also most of `tagging/picker.ts` and `reference/view.ts` (60–440 and 470–675), `tagging/model.ts` 18–45 and `api.contract.test.ts`.
- Docs: the ledger, the plan's Global Constraints, Review Focus, Task 5, Decisions and Pre-flight rulings, SPEC §2, §3, §5, §5a, §6, §9 and §11, the README e2e notes, and the e2e harness's disk assertions.

**What I only spot-checked:** the tests (Rust test names, plus a sample of the vitest files), `styles.css`, `grid/windowed.ts`, `demo.rs` and `search.rs` beyond `normalise`/`search`. I did not read the 555 KB package line by line.

**Head past the last e2e run:** `67fa199..02f4415` is docs and harness only (`app/README.md`, `qa/plan2-e2e.js`).

---

## Strengths

**One recipe for every mutating command.** `commit` (`commands.rs:483-505`) does the work in this order:
- builds the edit under the lock;
- runs the single `TaxonomyReadOnly` check;
- applies it validated, and records only non-no-op inverses;
- settles: reindexes, touches the debounce and builds the `Change`;
- then notifies the saver and runs the hooks with no lock held.

`step` (undo and redo) reuses `settle`. Imports follow their own documented save-at-once path.

**`edit.rs` keeps edits consistent and undo safe.**
- An edit is either applied whole or not applied at all: a batch unwinds itself on error.
- The `Insert*` variants are sealed (`Sealed`, with a compile_fail doctest).
- Undo and redo both go through `apply_inverse`, so a stale tag can never make undo stick.

**The lock order holds everywhere I traced: gate, then settings, then state.**
- `create_library` (358, 360, 384, then `remember`), `open_library` (395–408) and `run_import` (714, 716, 734) take them in that order.
- The saver thread and `close_decision` take the state lock only.
- Nothing takes the settings lock and then the state lock.
- The saver re-reads the deadline under the lock before each wait, so no wake-up is lost.

**The saves are defensive.**
- `flush` saves the taxonomy first and puts back whatever it did not write. `Debounce.failed` stops the retry loop from spinning.
- Every save writes a fixed-name tmp file, then syncs it, then renames it (`write_atomic`).
- Each file's backup is rotated only from a current file that parses.
- An unreadable `taxonomy.json` refuses to open rather than silently loading a stale backup.
- A failed import save rolls back the edit in memory and restores the dirty flags as they were (`commands.rs:749-760`).

**The path guards are in the right place.**
- `image_path_in` and `thumb_path_in` accept only a 64-hex hash and a short lowercase extension.
- A reference that fails the guard is hidden everywhere through `visible()`, but stays in `lib.data`, so saves keep it.
- The asset scope covers only `images/` and `thumbs/`, plus the demo images.
- `paste_name` keeps only the last path component and replaces the reserved characters. Staging happens in an OS temp dir outside the library.

**The UI never re-reads the library.**
- The store applies each `Change`, and the views subscribe to it.
- The views decide what to redraw for themselves: `touchesFocus` in the Reference view, `derive` in the Inbox, and the picker's tick filtering.
- I found no unescaped user string. Every interpolation goes through `esc`, and the Inbox tiles use `textContent`.
- The diff adds no inline `style=` attribute; the only `style=` hit in it is a test that asserts none exists.
- No seed id appears outside fixtures, apart from the allowed `SEED_INK` in `ops.ts`. I grepped every Rust file up to its `#[cfg(test)]` line. The one hit, `taxonomy.rs:215-232`, is Plan 1's `validate_seed` table and is unchanged in this branch.
- The save-failure dialog stacks above the lightbox. It reuses `.firstrun`, at z-index 50 (`styles.css:217`), and the lightbox is at 40 (`:332`).

**The tests check what matters.** I read these bodies:
- `switch_flushes_pending`, `debounced_save_lands` and `failed_background_flush_does_not_spin`. The last asserts exactly one `save-status` in 1 s, and a `None` deadline afterwards.
- `removed_wins_in_change`, and `open_waits_for_inflight_import`, a real threaded race that holds the import mid-run.
- `history.rs:206`, which undoes a stale `ReplaceTag` after its technique has been removed. That is exactly ledger line 59's carry.
- The two queued-intake tests (`intake.test.ts:155`, `:171`), which hold the first import on an unresolved promise.
- The `wireSaveStatus` tests (`save-dialog.test.ts:84`, `:99`), which check escaping, clearing on the next good save, and leaving other notices alone.

None of them is vacuous. The weak spots are the ones the ledger already lists: the lightbox's late-load and error-path assertions.

**The IPC contract is pinned.** `api.contract.test.ts` checks every command's name and argument keys, has a completeness check over `tauriApi`, and decodes the `x-meta` header. The error strings match on both sides (`NameTaken:<id>`, `TaxonomyReadOnly`).

**The end-to-end check asserts against the files on disk,** not only the DOM: `library.json`, and `taxonomy.json` for item 6. It found two real bugs (items 3 and 4), and both were fixed and re-run.

---

## Issues

### Critical (Must Fix)

None.

### Important (Should Fix)

**I1. Closing the window while an import is running loses that import.**
- **Where:** `commands.rs:921-929` and `lib.rs:39-48` and `:76-80`.
- **What is wrong:** `close_decision` takes only the state lock. `run_import` holds `import_gate` for the whole copy and thumbnail phase, and takes the state lock only to snapshot the hashes and to commit (`commands.rs:714-765`). So the close flushes whatever has committed, the window is destroyed, and the process exits. That kills the `spawn_blocking` import thread mid-run.
- **The result:**
  - The copied images and thumbnails are left as orphans in `images/` and `thumbs/`.
  - No reference is saved.
  - The artist is not told.
- **Why it matters:**
  - SPEC §2's hoard workflow is "drop a folder, keep going". At the e2e's 4.6 s per 20 images, a 200-image folder takes about 45 s.
  - A paste is about half a second of work that the artist believes is done.
  - SPEC §11 says "It never loses work". The originals survive, so a re-drop recovers a folder import. A paste may not be recoverable.
- **How I found it:** I traced this through the code. I did not reproduce it.
- **Fix (two lines):**
  - In `close_decision`, take `let _gate = lock(&st.import_gate);` before the state lock. That keeps the lock order and waits for the running import to commit, and that import's own save then writes it.
  - Add a test that reuses `open_waits_for_inflight_import`'s pattern (`commands.rs:1454`): a small image plus a large one, waiting for the first thumbnail. Then call `close_decision` mid-import and assert that `library.json` holds both references.
- **Caveat:** this blocks the main thread until the import finishes. That is acceptable when the window is closing, but a long import could make Windows show "Not responding". A friendlier follow-up is `try_lock`, then `Prevent("An import is still running…")`.
- **What this fix does not cover:** an intake step still queued in JS (`intake.ts:69-73`) has not reached Rust yet, and it dies with the webview.

**I2 (promoted from ledger line 47). Undo and redo don't work on non-Latin keyboard layouts.**
- **Where:** `keys.ts:20`.
- **What is wrong:** it matches `e.key.toLowerCase()` against `z` and `y`. On a Cyrillic, Greek, Hebrew or Arabic layout, Ctrl+Z gives `e.key` as the layout's own letter (for example `я`), so nothing fires.
- **Why it matters:** there is no undo button. `index.html` has none, and the only caller of `api.undo` and `api.redo` is `keys.ts:27`. So for those artists, Plan 2 has no undo unless they switch to a Latin layout first, and nothing tells them to. SPEC §6.8 says undo and redo cover everything, and §9 lists undo under "Never lose data". Ctrl+Z works in every other app they use.
- **Fix (one line):** use `e.key` when it is a Latin letter, and otherwise fall back to `e.code`:

  ```ts
  const k = /^[a-z]$/i.test(e.key) ? e.key.toLowerCase() : e.code.replace(/^Key/, "").toLowerCase();
  ```

  - AZERTY keeps working through `e.key`.
  - Add a test with `{ key: "я", code: "KeyZ", ctrlKey: true }`.

**I3 (promoted from ledger line 111). A paste or drop queued during an import lands in the wrong library after a switch.**
- **Where:** `intake.ts:69-73` and `library-menu.ts:44-50`.
- **What is wrong:** the queued step reads Rust's open root only when its turn comes. Meanwhile `open_library` waits on the gate behind the running import, then switches. So the queued paste imports into library B.
- **The effect:**
  - It also brings library A's note and source URL, and for a drop, A's "Tag like this" preset.
  - The notice in B says "Added 1 to the Inbox". The image is simply missing from A, the library the artist pasted into.
  - Plan 2 has no delete or move. Undo in B is the only way out, and only if the artist notices.
  - Nothing is corrupted, because Rust and the store agree on B.
- **Why it matters:** the work is misfiled, and from the artist's side the paste is lost (§11). The trigger is realistic: a long folder import while the artist changes libraries.
- **Fix:** have `wireIntake` return an `idle(): Promise<void>` that resolves when `queue` settles, and have `switchTo` `await idle()` before calling `open()`. That drains intake into A first, which matches Rust's own rule that an open waits for an in-flight import. Add a test: queue a paste behind a pending import, start a switch, and assert that the paste was imported before `openLibrary` was called.

### Minor (Nice to Have)

**M1. The flush-order comment holds only for additions.**
- **Where:** `saver.rs:78-81`.
- **What is wrong:** the comment says saving the taxonomy first means a failed `library.json` save can "never leave tags naming a technique the file lacks". That is true for an added technique. It is not true for a removal: undoing an `add_technique` that also tagged a reference writes a `taxonomy.json` without the technique, while the old `library.json` still has the tag. Then "Quit without saving", or a crash, leaves a dangling tag on disk.
- **Why it doesn't matter yet:** the tag shows as an unknown technique and keeps its ids, so this is harmless today. Plan 3's technique deletes will lean on this invariant.
- **Fix:** reword the comment now. Plan 3 should either order the writes by direction or accept dangling tags explicitly.

**M2. Cmd+Q on macOS loses failed edits without a dialog.**
- **Where:** `lib.rs:76-80`.
- **What is wrong:** the `ExitRequested` backstop only logs. Its premise, that no window is left to show a dialog in, is false for Cmd+Q on macOS, where the window still exists.
- **The effect:** with a failing disk, Cmd+Q drops every unsaved edit without asking. The background notice will have warned the artist.
- **Fix:** when the main window still exists, call `api.prevent_exit()` and emit `save-failed`.
- **Scope:** SPEC §10 says cross-platform, but the e2e ran on Windows only. I have not verified this on macOS: it rests on Tauri's documented Cmd+Q behaviour.

**M3. The number keys don't pick operations on AZERTY.**
- **Where:** `picker.ts:352` and `reference/view.ts:507`.
- **What is wrong:** the unshifted digit row gives `&é"'(…`, so `/^[1-9]$/` never matches.
- **Workarounds:** the numpad, Shift, or the buttons.
- **Fix:** the same `e.code` fallback as I2 (`Digit1`–`Digit9`).

**M4. A failed undo or redo is silent.**
- **Where:** `keys.ts:27`.
- **What is wrong:** "Nothing to undo" is already an `Ok` with an empty `Change`, so the catch only ever swallows real errors.
- **Fix:** show the error in the notice.

**M5. The Inbox's list rebuild is quadratic while a tagged item is held.**
- **Where:** `inbox/view.ts:96`.
- **What is wrong:** while a tagged item is kept on screen, every store event re-derives the list with `slice().filter(ids.includes)`.
- **The cost:** about 4M comparisons per event at 2,000 untagged items. That is noticeable but survivable.
- **Fix:** use a `Set` for `ids`.

**M6. An intake failure part-way through hides what was already added.**
- **Where:** `intake.ts:79-94`.
- **What is wrong:** when a multi-file paste fails on file k, the notice shows only "did not finish". Files 1 to k−1 were added and are in the Inbox, but the notice doesn't say so.
- **Fix:** show the summary of `all` along with the error.

**M7. Two comments still say "Task 5 not landed".**
- **Where:** `lightbox/view.ts:237` and `lightbox/view.test.ts:314`.
- **What is wrong:** Task 5 has landed. The test branch now covers a refusal that `image_path` gives only for an unknown or hidden reference.
- **Fix:** update both comments.

---

## Deferred-minor triage

The brief says 17 lines, but grep finds 21 ledger lines that carry a "minor (deferred)" entry. I sorted all 21 into three buckets:
- **Resolved at head:** checked in the code.
- **Promote:** must be fixed before merge.
- **Can wait.**

**Promote (must fix before merge):**
- **Line 47, Ctrl+Z on non-Latin layouts.** It is the only undo route, so these artists have none (SPEC §6.8, §9). The fix is one line. This is I2.
- **Line 111, the intake queue across a library switch.** The work is misfiled into another library with no move or delete; from the artist's side the paste is lost (§11). The fix is to drain the queue before switching. This is I3.

**Resolved at head:** I read the code or the test body for each row, except the `taxonomy.rs` test rows, which I checked by test name only.

| Line | Item | Where it was fixed |
|---|---|---|
| 47 | The IME guard | `keys.ts:18` |
| 47 | Tick boxes and radios count as non-text | `keys.ts` `TEXT_TYPES` |
| 47 | A stale warning on reset | `reference/view.ts:630-633` |
| 47 | Ctrl+V toggling the Value view | `reference/view.ts:488` |
| 59 | The `apply_inverse` guard test | `history.rs:206`, `undo_restores_tag_with_removed_technique` |
| 63 | The rotation gate | `taxonomy.rs:1002` |
| 63 | The orphan-link id | `taxonomy.rs:1021` |
| 63 | A failed write keeps the old file | `taxonomy.rs:1040` |
| 63 | `save` refuses an unreadable current file | `taxonomy.rs:989` |
| 77 | Focus goes back to the opener, and `onClose` exists | `picker.ts` `close()` |
| 81 | The taxonomy is flushed first | `saver.rs:78` |
| 81 | The "I/O error" jargon | `saver.rs` test asserts it is absent |
| 102 | The detached picker | `reference/view.ts:586-590` |
| 102 | A stuck drag | `lostpointercapture` |
| 102 | Enter double-committing | `commit` sets `from = null` |
| 102 | The focus guard exempts dialogs raised over the lightbox | `OVER` |
| 102 | The notice sits above the lightbox | `.notice` z-index 45 |
| 108 | Focus after Enter-apply | `picker.ts:195-197`, `67fa199` |
| 118 | Ctrl+Z behind the save dialog | `keys.ts:24` |

**Can wait, with a ruling on each:**
- **Line 31 (Task 6):** all of it. The one-character CJK limit affects only the top-bar search; the picker's filter has no minimum (`model.ts:27-29`).
- **Line 37 (Task 1):** all of it. The no-op `AddTags` is already handled by `is_noop`.
- **Line 41:** the public `Insert*` fields. Only internal code passes an inverse along.
- **Line 47, the rest:** all of these can wait:
  - overlapping undo calls, which Rust serialises;
  - the callout pin kept by index;
  - the missing boot-destroy test;
  - the inline-style assertion in a test;
  - the parity test's dependence on `MAX_TECHNIQUES`;
  - `localeCompare` on ISO dates;
  - the doc wording;
  - `ask: []` for an unbranched technique;
  - `boot` rejecting on a `getTaxonomy` failure.
- **Line 52:** all of it (cosmetic).
- **Line 59:** `Vec::remove(0)` is negligible at 200 entries.
- **Line 63, the rest:** all of these can wait:
  - the `.tmpXXXXXX` sweep, which Plan 6 owns;
  - the version re-check, since no outside edits happen while the app runs (SPEC §10);
  - rotating before serialising;
  - the key order;
  - the `""` defaults;
  - the dead `"."` fallback.
- **Line 66 (Task 11):** all of it: the ARIA and target-size items and the weak tests.
- **Line 77 (Task 8):** the rest. Each is visible to the artist and undoable:
  - "use it" tagging under another operation;
  - ticks from another operation that are not shown;
  - Space on the Apply button;
  - the hint for more than 9 operations.
- **Line 81, the rest:** the Windows guard test rows and the untested branches.
- **Lines 88, 89, 94:** all of them. A link to a hidden reference is already dropped in the UI (`reference/view.ts:310-314`).
- **Lines 102 and 105, the rest:**
  - the live region;
  - the stubbed geometry in tests;
  - the weak late-load assertions;
  - F5 being prevented inside the modal;
  - EXIF orientation of originals in WebView2, which is a QA item.
- **Line 108, the rest:** all of these can wait:
  - the Inbox restarting at item 0;
  - the retained item never being released;
  - the dead top-bar search in the Inbox;
  - `scrollTo` padding;
  - the tile size defined twice;
  - the listeners not torn down, since `boot` lives for the whole app;
  - a note double-submit giving two undo steps;
  - the `role=menu` arrow keys;
  - the `getTaxonomy` rejection after a successful open. That case is practically unreachable, because `get_taxonomy` fails only with no library open.
- **Line 111, the rest:** the `setTimeout(260)` test.
- **Line 115:** all of it.
- **Line 118, the rest:**
  - **The wording stutter:** readable as it is.
  - **Windows reserved names:** the paste fails loudly and nothing is lost.
  - **The size cap after staging:** a memory spike only.
  - **No-op saves rotating the backup:** the backup is still a good copy.
  - **The `retry_save` flag:** it sticks only if `destroy()` itself fails, while the UI is inert.
  - **The undo, re-import, redo race:** rare.
  - **Hooks re-entrancy:** Plan 5 owns it.
- **Line 124:** both items.
  - **Later notices hiding the save failure:** the saver retries on the next edit and shows the failure again, and the close dialog is the backstop.
  - **A half-typed intake note being wiped:** at most 200 characters of an optional note.
- **Line 128:** all of it.

Everything not promoted above can wait until after merge.

---

## Declined to judge

Each line is a behaviour I considered and set aside, with the reason.

- **Edits lost to a crash, power loss or OS shutdown within the 500 ms debounce:** the plan accepts the debounce (B3), and the close flush covers normal exits.
- **Two Horus instances on one library:** this is the single-instance ceiling noted at `write_atomic`, and SPEC §10 rules out outside edits while the app runs.
- **The previous library staying in the asset scope after a switch:** the plan's R24 ruling rejects removing it.
- **Import progress ("N of M") and cancel:** QA M3, outside Plan 2's scope by the ledger's own note.
- **EXIF orientation of originals in the lightbox:** a runtime WebView2 behaviour that can't be checked from the code; it is a QA item.
- **A Backup-mode taxonomy save overwriting the damaged `taxonomy.json`:** this matches Plan 1's `library.json` behaviour, and the warning says recent technique changes may be missing.
- **The note and source URL not shown in the Reference inspector:** the Plan 2 tasks store them and show the note only in the Inbox tooltip. The inspector is not in Plan 2's Files lists.
- **Drag-drop hit-testing on macOS and Linux (`devicePixelRatio` division):** the e2e ran on Windows only, and I can't verify the other platforms statically.
- **The asset scope widened during a `create_library` switch that is then refused:** this is reachable only when an edit lands between `create_library`'s first flush and `install` (`commands.rs:360` and `:384`). The data is the artist's own and local, in the same class as R24.

**AGY:** the project rule (`agy-validation-required.md`) is left to the controller. This review was not run through AGY.

---

## Recommendations

1. **Fix I1, I2 and I3 in one small round.**
   - Each fix is under 10 lines and comes with one test.
   - I1: take the gate in `close_decision`.
   - I2: the `e.code` fallback.
   - I3: `idle()` in intake, awaited by `switchTo`.
   - Re-run `cargo test`, `vitest`, clippy and fmt. Then re-run e2e item 8, plus a close during a folder drop if the harness can do it.
2. **Fold M3 into the I2 change,** because it is the same `e.code` helper.
3. **Hand M1's removal-ordering note to the Plan 3 brief,** together with the ledger's line 118 hooks re-entrancy note for Plan 5.
4. **Give Plan 6's `sweep_tmp` the orphaned images** that I1, before its fix, and the rolled-back imports leave behind.

---

## Assessment

**Ready to merge?** With fixes.

**Reasoning:**
- **Scope of the delivery check:** I checked Task 5 against the plan's own text. For the other tasks, I took delivery from the ledger, the tests named at head and the 9/9 real-app e2e. I did not tick off the plan's steps for those tasks one by one.
- The Rust core is careful about atomic saves, the lock order and undo safety. The data-safety paths named in SPEC §9 and §11 are tested, and the real-app e2e verifies them against disk.
- I found no Critical issue.
- Three Important issues remain where a reasonable artist loses or misplaces work:
  - closing during an import;
  - no undo at all on non-Latin layouts;
  - a queued paste landing in another library.
- Each is a few lines to fix, with a test. After they land, a scoped re-review of those diffs is enough. A new whole-branch pass is not needed.

---

## Final fix wave

Fixer: Opus. Base `02f4415`. Commits `41b3815` (fix(core), I1 in Rust), `e1c89ac` (fix(ui), the I1 notice, I2+M3, I3, M4 and M7) and `f2df12a` (fix(core), every gate holder takes the owed close; the M4 guard yields only to a showing notice). M1, M2, M5 and M6 were left alone, as ruled.

**Baseline before any change:** cargo 154 + 1 doctest ok; clippy `-D warnings` clean; fmt clean; vitest 220/220; `npm run build` clean.

### I1. A close during an import

**What changed:**
- `CloseDecision::Wait` is a new variant (`commands.rs`), and `AppState.close_owed` is a new `AtomicBool`.
- `close_decision`:
  1. sets `close_owed`;
  2. calls `import_gate.try_lock()`. `WouldBlock` returns `Wait` and never blocks the UI thread. A poisoned gate counts as acquired.
  3. clears `close_owed` once it holds the gate;
  4. flushes with the gate held. The lock order stays gate, then state.

  The flag is set before the try, so an import that ends in between still sees it, and no close is lost.
- `hold_gate(app)` returns a `Gate` guard, and it is used by `run_import`, `create_library` and `open_library`. All three hold the gate, and create and open are `#[tauri::command(async)]`, so they run off the main thread. On drop, on every exit path, the guard:
  1. releases the gate;
  2. runs `close_owed.swap(false)` with no lock held;
  3. calls `get_webview_window("main").close()`.

  At `41b3815`, only `run_import` took the owed close. A close during an open or a create would have stayed owed until the next import; `f2df12a` fixes that. The `close()` call raises `CloseRequested` again, so the normal flush applies, and the B5 save-failure dialog still appears if the flush fails.
- `lib.rs` `on_window_event` handles `Wait` with `prevent_close()` and emits `close-waiting`. A second close while it waits returns `Wait` again; the close stays owed and nothing is lost.
- `retry_save` and the `ExitRequested` backstop now use exhaustive `match`es:
  - `retry_save` returns `Ok` on `Wait`, so the import's end closes the window;
  - the backstop only logs.
- **UI:** `Api.onCloseWaiting` listens for `close-waiting`. `wireSaveStatus` shows `<p data-close-waiting>Finishing the import before closing.</p>` in the notice. A good save does not clear that notice.

**Tests:**
- `close_waits_while_the_import_gate_is_held` (Rust): with the gate held, two calls both return `Wait` and the flag is set. With the gate released, the call returns `Close` and the flag is cleared.
- `close_mid_import_waits_then_closes` (Rust, in the threaded style of `open_waits_for_inflight_import`):
  - mid-import, two calls both return `Wait`;
  - after the join, the owed close was taken, `library.json` holds both references, and the next decision is `Close`.
- `releasing_the_gate_takes_the_owed_close` (Rust, `f2df12a`): with `hold_gate` held, the decision is `Wait`; dropping the guard consumes the owed close. RED with a guard that only released the gate (`panicked at src\commands.rs:2010`), then GREEN.
- `save-dialog.test.ts`: "a close during an import says it is finishing first, and a good save keeps that".
- **Flakiness:** `close_mid_import_waits_then_closes` passed 30 times out of 30 run alone (twice, before and after `f2df12a`), and the full suite passed 3 times out of 3.

**Not unit-tested:** the `window.close()` hop itself. The mock runtime handles `CloseWindow` only inside `run()`, so the test asserts the seam instead: the flag is consumed and the next decision is `Close`.

**RED, then GREEN:**
- First RED was a compile failure: no variant `Wait`, and no field `close_owed`.
- With the variant and field added but no logic, both tests failed:
  ```
  test commands::tests::close_waits_while_the_import_gate_is_held ... FAILED
  test commands::tests::close_mid_import_waits_then_closes ... FAILED
  test result: FAILED. 2 passed; 2 failed
  ```
- GREEN: `cargo test close_` reported `4 passed`. The UI test failed RED with `TypeError: waiting is not a function`, then passed GREEN.

### I2 and M3. Keys on non-Latin and AZERTY layouts

**What changed** (in `keys.ts`):
- `letterOf(e)` returns `e.key` when that is an ASCII letter, and otherwise falls back to `e.code` when it is `KeyA`–`KeyZ`. So QWERTZ, where the physical Z key types `y`, and AZERTY, where KeyW types `z`, keep their own letters, and Cyrillic `я` on KeyZ is read as `z`.
- `digitOf(e)` returns `e.key` when that is `1`–`9`. Otherwise it falls back to `Digit1`–`Digit9`, but only when Shift is not held.
- Both helpers are used in:
  - `wireUndoKeys`, for undo and redo;
  - `picker.ts`, where the operation key is still ignored inside a text entry;
  - `reference/view.ts`, for pinning. The existing `input`, `textarea`, `contenteditable`, `.picker` and `.lightbox` early return still runs first.

**Tests:**
- `keys.test.ts`:
  - `non_latin_layouts`: `я`+KeyZ with Ctrl undoes, Shift+`Я` and `н`+KeyY redo, and `ч`+KeyX does nothing;
  - `latin_layouts_keep_their_letters`;
  - `non_latin_text_fields_keep_their_own_undo`.
- `picker.test.ts` `azerty_digits`: `&`+Digit1 picks the first operation, and `é`+Digit2 picks the second. The test is data-driven: it reads `ops(el)[i].dataset.op`.
- `reference/view.test.ts` `azerty_digit_pins`: `é`+Digit2 pins callout 2.

**RED, then GREEN:** `non_latin_layouts`, `azerty_digits` and `azerty_digit_pins` failed first (`expected false to be true`, `expected undefined to be 'differentiate'`, `expected ['false','false'] to deeply equal ['false','true']`), then passed. The two layout-guard tests passed before the fix and after it, so they are regression guards.

### I3. A paste queued before a library switch

**What changed:**
- `wireIntake` now returns `Intake`: the same callable unwire, plus `idle()`. `idle()` loops `await queue` until the queue stops growing; `runNow` never rejects.
- `mountLibraryMenu` takes `idle` as an optional fifth parameter. `switchTo` awaits it after `busy = true` and before `open()`, so it covers both open and create.
- `firstrun.ts` passes `unIntake.idle`.

**Test:** `library-menu.test.ts`, "a paste queued behind an import lands in the old library before a switch". It wires the real `wireIntake` and `mountLibraryMenu` together:
- the first paste's import is held pending and a second paste is queued behind it;
- Open library… is clicked, and `openLibrary` is not called;
- the first import is released, and the order is `["paste p1 done", "paste p2", "open"]`.

**RED, then GREEN:** it failed first with `expected "vi.fn()" to not be called at all, but actually been called 1 times`, then passed.

### M4. A refused undo or redo

**What changed:**
- `wireUndoKeys` takes the existing `noticeIn` helper as `notice`. `boot` now builds `notice` before it calls `wireUndoKeys`.
- A rejection shows `<p>Couldn't undo: <escaped reason>.</p>`, or the same with "redo".
- It skips when `#import-notice:not([hidden]) [data-save-failed]` is present, so a save-failed notice that is showing is never overwritten. One that was dismissed may be replaced (`f2df12a`). The existing "clear only our own notice" behaviour is unchanged.
- The false `ponytail:` comment is replaced.
- "Nothing to undo" is an empty `Ok` Change, so it shows no notice. Undo errors are plain strings such as "No library is open."; no `TaxonomyReadOnly` code can come from `step`.

**Tests:** the old "a refused undo… does not throw" test is replaced by:
- "a refused undo changes nothing and says why in plain words (M4)". It covers both verbs and checks the escaping.
- "a refused undo leaves a save-failed notice showing (M4)". After the notice is dismissed, the refusal shows. With `e1c89ac`'s `keys.ts`, the dismissed case failed RED (`1 failed | 10 passed`); with `f2df12a` it passes.

**RED, then GREEN:**
- The first test failed with `expected [] to deeply equal [ …(2) ]`, then passed.
- The guard test passed before the fix, because no notice was called then. So I checked it by mutation: with the guard line commented out, it fails (`1 failed | 10 passed`). I then restored the guard.

### M7. Stale comments

**What changed:** `lightbox/view.ts:237` now reads "imagePath refused (an unknown or hidden reference)". In `lightbox/view.test.ts:314`, the rejection is now `"Unknown reference"` with a matching comment. Line 181's "(Task 5)" is accurate, so I kept it.

### Final gates, run at `f2df12a`

| Command | Result |
|---|---|
| `cargo.exe test` in `app/src-tauri`, 3 runs | `157 passed; 0 failed` each time, plus `1 passed` doctest |
| `cargo.exe clippy --all-targets -- -D warnings` | `Finished`, no warnings |
| `cargo.exe fmt --check` | clean |
| `npx vitest run` in `app/` | `Test Files 20 passed (20)`, `Tests 228 passed (228)` |
| `npm run build` | `✓ built`, with `tsc` clean |

`npm run build` first failed `tsc` on one Api fake in `reference/view.test.ts` that lacked `onCloseWaiting`. After I added it, the build is clean.

The diff adds no inline `style=`. The new copy is plain words. Operations stay data-driven. The lock order stays gate, then settings, then state: `close_decision` takes the gate (by `try_lock`), then state.

### Concerns

- **AZERTY side effect of the digit fallback, as ruled:** outside a text field, unshifted `&é"'(` now pick operations in the picker and pin callouts in the view, instead of starting a picker search. Inside text fields nothing changed.
- **A deliberate narrowing:** the `Digit` fallback is skipped when Shift is held. So QWERTY Shift+1 (`!`) and German Shift+7 (`/`) keep their symbol meaning. AZERTY with Shift already gives the digit in `e.key`.
- **What I1 does not cover:**
  - An intake step still queued in JS when the window closes has not reached Rust. Only an import already holding the gate is waited for.
  - A multi-image paste is one Rust import per image. A close mid-paste keeps the image being imported and drops the rest.
  - The close notice stays up until the window closes.
- **Not re-run:** the real-app e2e, including item 8 and a close during a folder drop. AGY was not run; that is left to the controller.

## Residual fixes (R1, R2)

Fixer: Opus. Base `618c272`. Commits:
- `c8c5f50`: fix(core), R2 in Rust.
- `92fb453`: fix(core), R1.
- `c1964cd`: fix(ui), R2 in the UI.

R2's Rust half went first because it gives the R1 test its seam (see R1, Tests).

**Baseline before any change:** cargo `157 passed` plus `1 passed` doctest; clippy `-D warnings` clean; fmt clean; vitest `Tests 228 passed (228)`; `npm run build` `✓ built`.

### R2. A paste queued in the UI is lost on close

**What changed (Rust, `c8c5f50`):**
- New field `AppState.intake_busy: AtomicBool`, and a new command `intake_busy(busy: bool)`. The command is registered in `lib.rs` `generate_handler!`. No capability change: `build.rs` declares no app manifest, and `default.json` lists no app commands, the same as the other commands.
- A new helper, `take_owed_close(app)`: if `!intake_busy` and `close_owed.swap(false)`, it calls `main.close()`. Both releasers use it, and each runs it with no lock held:
  - `Gate::drop`, after it releases the gate. It no longer takes the close while the intake is busy.
  - `intake_busy`, after it stores the flag. So `false` with a close owed takes the close.
- `close_decision` now goes in this order:
  1. set `close_owed`;
  2. return `Wait` if `intake_busy` is set, leaving the close owed;
  3. `try_lock` the gate, as before.

  Each releaser clears its own condition before it reads `close_owed`. `close_decision` sets `close_owed` before it reads either condition. So with `SeqCst`, no wake-up is lost.
- If `intake_busy(false)` takes the close while a create or open holds the gate, the re-entered `close_decision` owes the close again, and the gate's drop takes it.
- The lock order is unchanged: gate, then settings, then state. The new paths take no lock.
- `lib.rs` emits `close-waiting` for this `Wait` as well, so the UI shows the same notice: "Finishing the import before closing.".

**What changed (UI, `c1964cd`):**
- New `Api.intakeBusy(busy)`, which invokes `intake_busy` with `{ busy }`.
- In `wireIntake` `run()`, a `pending` counter tracks intakes:
  - Going from 0 to 1 calls `intakeBusy(true)` synchronously, before the `queue.then`, so it goes out before the import's IPC.
  - Each job's `.finally` decrements the counter. Reaching 0 calls `intakeBusy(false)`. `finally` runs on every path, and `runNow` never rejects.
  - Both calls end in `.catch(() => {})`.
  - An intake with no steps is not counted.
- The accepted ceiling is a `ponytail:` comment at the 0→1 call: a close that lands before that IPC can still win.
- The fakes in `intake.test.ts`, `library-menu.test.ts`, `firstrun.test.ts` and `reference/view.test.ts` gained `intakeBusy`. Without it, `run()` throws a TypeError and `tsc` fails.

**Tests:**
- Rust:
  - `close_waits_while_the_intake_is_busy`: with the flag set and the gate free, the decision is `Wait` and the close is owed.
  - `draining_the_intake_takes_the_owed_close`: `Wait`, then `intake_busy(false)` consumes the owed close, and the next decision is `Close`.
  - `the_gate_leaves_the_close_to_a_busy_intake`: with the flag set, the decision is `Wait` while `hold_gate` is held. Dropping the gate leaves the close owed. Clearing the flag then takes it.
- TS:
  - `intake.test.ts`, "the queue tells Rust it is busy once, and idle once it drains, with no toggle between back-to-back pastes (R2)":
    - right after the first paste, the calls are `[[true]]`, before its import resolves;
    - after the second paste is queued, they are still `[[true]]`;
    - after both imports, they are `[[true], [false]]`.
  - `intake.test.ts`, "a failed import still drains the queue's busy flag (R2)": the calls are `[[true], [false]]`.
  - `api.contract.test.ts`: a new row, `["intakeBusy", "intake_busy", ["busy"], …]`.

**RED, then GREEN:**
- Rust RED: the field and a command that only stored the flag, with no logic.
  ```
  test commands::tests::close_waits_while_the_intake_is_busy ... FAILED
  test commands::tests::the_gate_leaves_the_close_to_a_busy_intake ... FAILED
  test commands::tests::draining_the_intake_takes_the_owed_close ... FAILED
  test result: FAILED. 0 passed; 3 failed; ... 157 filtered out
  ```
- Commands: `cargo.exe test intake` in `app/src-tauri` for RED and GREEN.
- Rust GREEN: `cargo test intake` reported `3 passed; 0 failed`. The full suite reported `160 passed`.
- TS commands: `npx vitest run src/intake.test.ts src/api.contract.test.ts` for RED and GREEN, then `npx vitest run` for the full suite.
- TS RED:
  ```
  × intakeBusy sends intake_busy with its keys            (TypeError: a.intakeBusy is not a function)
  × the queue tells Rust it is busy once, ... (R2)        (expected [] to deeply equal [ [ true ] ])
  × a failed import still drains the queue's busy flag (R2) (expected [] to deeply equal [ [ true ], [ false ] ])
  Tests  3 failed | 45 passed (48)
  ```
- TS GREEN: `Tests 48 passed (48)`. The full suite first failed on fakes with no `intakeBusy` (`firstrun.test.ts` and `library-menu.test.ts` at runtime, and `tsc` TS2741 in `firstrun.test.ts` and `reference/view.test.ts`). With the fakes updated, it reported `Tests 231 passed (231)`.

### R1. A waited import whose save fails closed the window silently

**What changed (`92fb453`):** `run_import`'s flush-failure branch now calls `st.close_owed.store(false, Ordering::SeqCst)` after the rollback and before `return Err(e)`.
- It is unconditional, not inside `if !pending`. With edits pending, the re-entered close could still flush well and close, and the import would be lost unseen.
- The window stays open. The UI's `failed("The import did not finish")` notice replaces the `data-close-waiting` line, because `noticeIn` overwrites the body. The artist's next close is a fresh decision.

**Test:** `a_failed_import_drops_the_owed_close`.
1. Set `intake_busy(true)`, the real state during any UI import.
2. `close_decision` returns `Wait`.
3. With the `library.json.tmp` blocker in place, `e.import("small.jpg")` returns `Err`.
4. `close_owed` is false.
5. Call `intake_busy(false)` and remove the blocker. `close_decision` returns `Close`.

The mock runtime cannot observe `close()` outside `run()`, and `Gate::drop` used to clear the flag whenever it took the close. So with the intake not busy, the test would pass before the fix as well. The busy intake is the seam: `Gate::drop` leaves the flag alone, so before the fix it stays true.

**RED, then GREEN:**
- Command: `cargo.exe test a_failed_import` in `app/src-tauri`.
- RED: `test commands::tests::a_failed_import_drops_the_owed_close ... FAILED`, with `panicked at src\commands.rs:2115:9: the failure dropped the close`.
- GREEN: `1 passed`.

### Final gates, run at `c1964cd`

| Command | Result |
|---|---|
| `cargo.exe test` in `app/src-tauri`, 2 runs | `161 passed; 0 failed` each time, plus `1 passed` doctest |
| `cargo.exe clippy --all-targets -- -D warnings` | `Finished`, no warnings |
| `cargo.exe fmt --check` | clean |
| `npx vitest run` in `app/` | `Test Files 20 passed (20)`, `Tests 231 passed (231)` |
| `npm run build` | `✓ built`, with `tsc` clean |

### Concerns

- **A stuck busy flag blocks every close.** If `intakeBusy(false)` never arrives, for example after a webview reload mid-queue or a failed IPC, every close returns `Wait` and the window cannot close. Rust has no timeout or reset for the flag. It does heal on the next intake: a reloaded page starts at `pending = 0`, so its next intake sends `true` and then `false`.
- **Other `Err` exits of `run_import` still take an owed close.** These are `NO_LIBRARY`, "Another library was opened…", and an `edit::apply` error. The gate excludes an open while the close waits. The `AddReferences` arm of `edit::apply` can return `DuplicateId` or a tag-check error, and neither was traced to a reachable case. They were left alone, as ruled.
- **A narrow race remains in R1.** A close that lands between the R1 `store(false)` and the gate's release owes the close again. The window then closes after the failure.
- **The status-bar import buttons bypass the intake queue.** `importer.ts` `mountImport` calls `importPaths` directly. It never sets the flag, but it holds the Rust gate, and its buttons are disabled meanwhile. So I1 covers it, and nothing is queued in JS.
- **The waiting notice can be replaced before the close.** A good mid-queue import's summary replaces "Finishing the import before closing." while the close is still waiting for the rest of the queue. This behaviour predates these fixes.
- **The R1 notice can be overwritten.** If two intakes are queued while a close waits and the first fails its save, the second's "Importing…" and summary overwrite "The import did not finish". The window then stays open, and the reason is not shown.
- **Not re-run:** the real-app e2e. The `window.close()` hop from the sync `intake_busy` command, on the main thread, is not unit-tested. I checked the source: tauri-runtime-wry 2.12.5's window `close()` always posts `WindowMessage::Close` through the event-loop proxy (`lib.rs:2123`, "close cannot use `Context::send_user_message`"), so calling it from the main thread inside a command is safe. AGY was not run.

## Residual round 2

Base `c1964cd`. Commits:
- `177c2cf`: fix(core), a failed paste keeps the window open.
- `4ba39d0`: fix(ui), boot clears a stuck intake flag.

### 1. A stuck `intake_busy` after a reload

**What changed:** the first statement of `boot()` in `firstrun.ts` is now `void api.intakeBusy(false).catch(() => {});`. It runs before `getSettings`, `openLibrary` and `firstRun`, and it also takes any close owed before the reload.

**Test:** `firstrun.test.ts`, "boot first clears a busy intake left by a reload, before anything can wait (round 2)". It checks that `intakeBusy` is called with `false`, and that its `invocationCallOrder` is before `getSettings`'s. Both calls run in the same tick, so "not called yet" cannot be the check.

**Commands and output:** `npx vitest run src/firstrun.test.ts`.
- RED, with `firstrun.ts` stashed: `× boot first clears a busy intake…`, then `AssertionError: expected "vi.fn()" to be called with arguments: [ false ]`, then `Tests 1 failed | 3 passed (4)`.
- GREEN: `Tests 4 passed (4)`.

### 2. A paste that fails silently while a close is owed

**What changed:**
- `paste()` runs its body in a closure and then checks the result. When the result is `Err`, or the report has any `Skip::WriteFailed`, it calls the new `drop_owed_close(app)`, which runs `close_owed.store(false, SeqCst)`.
- That covers every error before `hold_gate` (the meta decode, `tempdir_in`, `fs::write`) as well as `run_import`'s own errors.
- In `import_bytes`, the `spawn_blocking` join error also calls `drop_owed_close`.
- Folder drops (`import_paths`) are unchanged: their originals stay on disk.

**Tests:** both set `intake_busy(true)` and owe a close (`close_decision` returns `Wait`), then call `paste()` directly.
- `a_paste_that_could_not_be_written_drops_the_owed_close`: a folder squats on `images/<hash>.jpg`. The result is `Ok` with a single `WriteFailed` skip, and `close_owed` is false.
- `a_paste_that_could_not_be_staged_drops_the_owed_close`: the staging dir does not exist, so `tempdir_in` fails. The result is `Err`, and `close_owed` is false.

**Commands and output:** `cargo.exe test a_paste_that` in `app/src-tauri`.
- RED: both `FAILED`, at `src\commands.rs:2149:9` and `:2162:9`, the `close_owed` asserts. The `WriteFailed` match passed.
- GREEN: `2 passed; 0 failed`.

**Not tested:** the join-error arm, a one-line call.

### Final gates, run at `4ba39d0`

| Command | Result |
|---|---|
| `cargo.exe test` in `app/src-tauri` | `163 passed; 0 failed`, plus `1 passed` doctest |
| `cargo.exe clippy --all-targets -- -D warnings` | `Finished`, no warnings |
| `cargo.exe fmt --check` | clean |
| `npx vitest run` in `app/` | `Test Files 20 passed (20)`, `Tests 232 passed (232)` |
| `npm run build` | `✓ built`, with `tsc` clean |
