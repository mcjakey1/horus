# Plan 4 amendment report

- **Amender:** -59, 2026-11-26.
- **Edited file:** `docs/superpowers/plans/2026-11-25-horus-boards-lightbox-compare.md` (not committed; the controller commits after the AGY check).
- **Inputs:** `preflight-scan.md` (4 BLOCK, 27 REWORK, 31 COS) and the controller's rulings B1–B4, as recorded in `progress.md` and the assignment message.
- **Method:**
  - The plan text tags each change with its scan ID, such as [R7].
  - **Read against main `a7fb0f0`:** `change`, `settle`, `is_noop` and `commit` (`commands.rs:574-660`), the sealed `Insert*` variants (`edit.rs:100-150`), the picker docking in `openLb` (`reference/view.ts:568-600`), `renderStatus` and the footer, `data.ts` `storeSource`, the `store.ts` events, `openLightbox`'s signature, `boot()`'s wiring, the existing taxonomy redo test, and the calls made from the moved section.
  - **Names and lines confirmed by grep only:** `merge` (`edit.rs:801`), `visible` (`:363`), `image_path_in` (`library.rs:185`), `ViewHandle`, `pickFolder`, `noticeIn`, `mountWindowedGrid`, `referenceTitle`, `tileBox`/`tileHTML`, and `NON_IPC_KEYS`.
  - No tests were run, because only the plan changed.

**Totals:** 62 items.
- **Applied:** 61, of which 4 are BLOCK, 27 are REWORK and 30 are COS. Within B1, one sub-item (`UnknownTag`) is narrowed: it is deferred again.
- **Rejected:** 0.
- **Recorded as deferred rather than fixed:** 1, C26 (no Tree or Radial Compare entry).
- **Additions not in the scan:** 4 (see the end).

## BLOCK

| ID | Status | Where in the plan |
|---|---|---|
| B1 | Applied. One sub-item is narrowed. | **New Task 0:** a pure move of `commands.rs:834-1480` into `commands/taxonomy_edit.rs`, with `lib.rs` naming the new paths.<br>• `Plan` is renamed to `TaxPlan`, and the redo test now covers a second batch shape.<br>• **Narrowed:** remapping `UnknownTag` for taxonomy items is deferred again, to Plan 6's copy pass. It would change error text, which breaks the controller's "no behaviour change" for T0. The scan allowed recording it as deferred.<br>• Gate: the baseline test count, then baseline + 1 after the new test. |
| B2 | Applied | **T1 Files:** `change()`, `settle()`, `is_noop()`, and `saver.rs` read only.<br>• `settle` ORs `touched.links` and `touched.boards`.<br>• New tests: `link_edit_marks_library_dirty`, `link_edit_survives_flush` and `noop_replace_link_is_noop`. No link command exists until T3, so they call the private `commit(e.handle(), \|_\| Ok((Edit::AddLink { link }, None)))` directly.<br>• New Global Constraint ("every undoable edit is saved"), Review Focus 6, and T8 step 8 (quit and relaunch). |
| B3 | Applied | **The opener plugin** returns as a recorded exception: Tech Stack, Global Constraints and the "Recorded exceptions" section.<br>• T5 Files gain `Cargo.toml`, `package.json`, `lib.rs` and `capabilities/default.json`, with only `opener:allow-reveal-item-in-dir`.<br>• "Open folder" goes through a new `api.revealFolder(path)` seam, so it is testable as R18 asks. It joins `NON_IPC_KEYS` beside `pickFolder` and the two typed fakes, and gets a T5 test.<br>• T5's gate adds clippy. |
| B4 | Applied | T6 owns the `imagePath`→`lightboxSource` swap. It rewrites `full_image_from_imagePath_with_thumb_fallback` (`view.test.ts:286-325`), keeping its three cases, and every other Plan 2 lightbox test stays unchanged. `lightbox/view.test.ts` is added to T6's tests. |

## REWORK

| ID | Status | Note |
|---|---|---|
| R1 | Applied | `InsertRefLink` and `InsertBoard` are sealed inverses, with `sealed: Sealed` as on the existing `Insert*` variants; `merge()` ORs the new flags; `is_noop` covers `ReplaceLink` and `ReplaceBoard`; none of them touches the taxonomy. Positional-inverse tests were added. |
| R2 | Applied | A wire-code table in T1 and a `wire_codes` test. T4 and T5 map the codes to copy. A Global Constraint was added. |
| R3 | Applied | Blank-line separators, exactly one final `\n`, and the empty-board text. `credits_text_empty_board` test. |
| R4 | Applied | `export_board(root, board, refs, dest)`. The command clones under the lock, as `#[tauri::command(async)]`. |
| R5 | Applied | `lib.rs` (`pub mod export;`) is in T2's Files. |
| R6 | Applied | T3 Step 3 lists all 12 `LibraryView` fake files, the two typed `Api` fakes and the 10 contract rows with their keys. Gate: `npm run build` and the full `npm test`. I added `boards: []` to the fakes rather than making the field optional, because the plan already said so. |
| R7 | Applied | The `StoreEvent` shape, the `setScope` event, `scopeCleared` and `reset()` clearing the scope are in T3. T4 makes `touchesFocus` read `links` and `scope`. |
| R8 | Applied | T3 changes `data.ts:35`. `data.test.ts` becomes `store_inscope_signature`. |
| R9 | Applied | `AppState::new` takes `cache_dir`; `allow_lightbox_cache(app)` is called from `setup` and `env()`; tests use a tempdir. |
| R10 | Applied | `lightbox_source` is async. On `Err`, the lightbox keeps `thumb1024` with the note (Review Focus 3; T3 and T6, with a test in T6). |
| R11 | Applied | A hash-keyed test panic hook in `write_thumbs`; the `Thumbs` guard stays around write, `sync_all` and persist. |
| R12 | Applied | "The Related list" is renamed to Ranked (`#pane-ranked`). `linkedFirst` replaces the existing link rows and `linksOf`, and a de-duplication test was added. |
| R13 | Applied | SPEC §4 wins: "Linked by you" stays under a filter and under scope, with "Not on this board". Global Constraint, T4 and T5, with tests. |
| R14 | Applied | `data-ref-id` goes on the Ranked and Links rows and on callout thumbnails; the handle goes on `#lab`. |
| R15 | Applied | T5 Files: `firstrun.ts`, the `index.html` host, `styles.css`. `mountBoards(…, { openReference })` returns `ViewHandle`. "Enable the tab" is dropped. |
| R16 | Applied | I chose **`boards/status.ts`** (`mountScopeStatus`), wired in `boot()` to a new footer `#board-scope`, with its own test file. This keeps `reference/view.ts`, which T4, T5 and T7 all touch, from growing again. |
| R17 | Applied (the "add to T5" option) | T6 M2, T6 M3 and T7 M10 go into T5, with `tree.ts`, `galaxy.ts` and their tests in its Files, and one test each. SPEC §2 "filter the view to that board" supports doing it now rather than deferring. |
| R18 | Applied | `api.pickFolder("Export board to folder")`. The tests use the `Api` fake. |
| R19 | Applied | Arrow keys: they edit the draft if one exists; otherwise they pan when zoomed past fit, and start the centred draft at fit. Enter is unchanged. A test was added. |
| R20 | Applied, with different numbers | A literal region test zoomed in (`{scale: 1.6, tx: -200, ty: -150}`) and at fit (`{0.8, 0, 100}`), both giving `{0.25, 1/3, 0.2, 0.2}`. I computed the numbers myself. The scan's scale 0.4 is below fit (0.8) for this image, which the zoom clamp forbids, so I used a zoomed-in scale instead. |
| R21 | Applied (the "Better" option) | `ExportReport.credits: Option<String>`, and `written` lists images only. The toast's N is `written.length`, with a test. |
| R22 | Applied | `boot()` builds one `openCompare` (one Compare at a time for every caller). It passes it to `mountReference`, whose opts gain `openCompare`, and wraps it for `mountGalaxy`. The wrapper adds a per-call `onClose` that returns to the Galaxy, so the Galaxy's dep keeps Plan 3's exact signature. `firstrun.ts` is in T7's Files, with a wiring test. |
| R23 | Applied | `openLightboxWithPicker(api, store, refId, { beforePicker?, onClose? })` goes into a **new `lightbox/dock.ts`**, not `lightbox/view.ts`, so T7 doesn't edit T6's file. It owns the docked picker; the Reference view passes `beforePicker: closePicker`. The T7 brief must read `reference/view.ts:570-600` first. A test checks that the Reference view still docks. |
| R24 | Applied | Compare is a modal (`role="dialog"`, `aria-modal`, focus trap). The Reference view's keydown returns while `.compare[aria-modal="true"]` is in the DOM, the same kind of check `openLb` uses for `.lightbox`. `deps.showReference` is wired in `boot()`. Tests were added. |
| R25 | Applied | `styles.css` is in the Files of T4, T5, T6 and T7, as append-only sections; also a Global Constraint. |
| R26 | Applied | Global Constraint "No new inline `style=` attributes"; T4, T5, T6 and T7 each restate it. New tiles use `tileBox` with `setProperty`, not `tileHTML`. |
| R27 | Applied (the second option) | `credits.txt` prints what the library holds, and metadata editing stays out of v1, which closes audit #23. **This is a scope decision. I flagged it in the plan for the user to confirm,** because the scan's first option (a "Details" inspector) is the user's call. |

## COS

| ID | Status | Note |
|---|---|---|
| C1 | Applied | `commands.rs:78`. |
| C2 | Applied | `import.rs:208`. |
| C3 | Applied | Plans 1–3 are now marked as merged at `a7fb0f0`. |
| C4 | Applied | `mountWindowedGrid` is named. |
| C5 | Applied | T4 Step 0 is removed. |
| C6 | Applied | The Links tab exists read-only and gains Edit and Delete. |
| C7 | Applied | `normRect` and `MIN_REGION` are in `lightbox/regions.ts`. |
| C8 | Applied | The lightbox opens with `l`/`L` or `.lb-open`; "Enter on the plate" is removed. |
| C9 | Applied | The `imagePath` swap is assigned to T6. |
| C10 | Applied | The TIFF is generated in the test. |
| C11 | Applied | `score_pair` reads `visible()`, with a test. |
| C12 | Applied | `#[tauri::command(async)]`, not `spawn_blocking`. |
| C13 | Applied | The empty and all-skipped output is specified. The "no `.tmp`" check becomes "`dest` holds exactly the expected files". |
| C14 | Applied | Serde camelCase; the TS type `[string, string][]`. |
| C15 | Applied | The `Touched` literal in `commands::tests` is in T1's Files. |
| C16 | Applied | `linkedFirst` lives in `links/editor.ts`. |
| C17 | Applied | `referenceTitle` for search, `noticeIn` for the toast. |
| C18 | Applied | `store_inscope_signature` moved to T3 (`data.test.ts`). |
| C19 | Applied | `lightbox/view.test.ts` is in T6's tests. |
| C20 | Applied | `fit` is renamed to `fitView` in `zoom.ts`. |
| C21 | Applied | `plateOf` returns stage px, and the caller adds the client offset. |
| C22 | Applied | Keep `.lb-side`. |
| C23 | Applied | The Shift-click test moved to `reference/view.test.ts`; Shift+Enter arrives as a click with `shiftKey`. |
| C24 | Applied | The T8 export path is on `E:\D drive files\…`. Note: `D:` is now a `subst` of that folder (the HDD move is done), so `D:` paths also work. |
| C25 | Applied | The T8 Ctrl+Z wording names exactly what each press undoes. |
| C26 | Recorded, not fixed | The Tree and Radial get no Compare entry; this is deferred in "Recorded exceptions and deferrals". Adding it means editing two more Plan 3 views for a side entry, which isn't cheap. |
| C27 | Applied | T8 step 9: a 2,000-member board on the perf library, or "not measured". |
| C28 | Applied | `refactor_keeps_import_behaviour` is removed as a test and kept as a requirement. |
| C29 | Applied | The plan states that the stroke half already passes; only the hover label is new. |
| C30 | Applied | The `dragstart` test uses an `addEventListener` spy. |
| C31 | Applied | The plan notes that the guard is reachable only through `apply` with `check: true`. |

## Pair findings (P1–P20)

Each P row in the scan points to a B, R or C item above. All of them are covered by those rows: P1→B1, P2→R2, P3→B2/R1/C15, P4→R4, P5→R5, P6→C14, P7→R7/R12, P8→R7, P9→R8, P10→R10/C9, P11→C11, P12→R13, P13 (ok), P14→R15/R22, P15→R23, P16→R25, P17→R17, P18→R15, P19 (n/a), P20→R21.

## Controller items

| Item | Status |
|---|---|
| Global Constraint "No new inline `style=` attributes" | Applied |
| `styles.css` listed where tasks need it | Applied (T4, T5, T6, T7) |
| `main.ts` → `firstrun.ts` `boot()` | Applied (T5, T7, Builds on) |
| `Api` fakes, contract rows, `LibraryView` fakes | Applied (T3 Step 3) |
| Schedule W0 T0, W1 T1∥T2, W2 T3, W3 T4∥T6, W4 T5, W5 T7, W6 T8 | Applied (new "Schedule" section) |

## Additions not in the scan (found while amending)

1. `Store` already has `links` (`store.ts:14`), so T3 says that `Store` "gains boards and scope", not links.
2. The wire codes for `SelfLink`, `EmptyWhy` and `EmptyName` now have UI copy in T4 and T5. Unknown codes fall back to "That change didn't save. Try again.", Plan 3's `sayError` sentence.
3. T5's gate adds `npm run build` and `cargo clippy`, because of the opener plugin and its capability.
4. T8 Step 1 adds `cargo fmt --check` and `npm run build`.

## Fixes after a self-review (before handing in)

- T1's command tests call `commit` directly, because no link command exists until T3.
- `sealed: Sealed`, not `bool`.
- T7's wiring is made consistent: one `openCompare`, a per-call `onClose`, the Reference view's opt, and the keydown check. The first draft sent a Galaxy user's Esc to the Reference view.
- "Open folder" gets an `Api` seam and a test.
- R20's numbers are zoomed in.
- T8 steps 8 and 9 now say how to run them: quit within 0.5 s; a `create_board` over CDP on the perf build.
- I checked the plan's removed lines with `git diff`: each is a replacement, and nothing was lost. Only the plan file is modified (`git status`).

## Concerns

1. **R27 is a scope decision.** It closes audit #23 (no metadata editing in v1). It is flagged in the plan for the user to confirm.
2. **R17 makes T5 larger.** T5 now also changes `tree.ts` and `galaxy.ts`, which are Plan 3 files. It is the heaviest UI task and might be worth splitting at dispatch (for example T5a for boards and status, and T5b for the graph-view scope items).
3. **The B1 narrowing (`UnknownTag`) deviates from the scan's preferred option.** It follows the controller's "no behaviour change" rule instead.
4. **T0 adds one test** (`redo_reapplies_a_second_batch_shape`, the deferred "redo tested on one batch only"). That goes against "tests unchanged" and the scan's same-count gate, so T0's gate is the baseline count, then the baseline plus one. If the controller wants T0 to be a strict pure move, this test moves to T1.
5. **The new `index.html` footer span `#board-scope`** is a small markup addition that the scan didn't name. R16 needed a place for the status.
