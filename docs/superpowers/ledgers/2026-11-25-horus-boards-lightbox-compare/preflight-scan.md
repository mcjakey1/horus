# Pre-flight conflict scan: Plan 4 (Boards, Lightbox, Compare, links)

- **Plan:** `docs/superpowers/plans/2026-11-25-horus-boards-lightbox-compare.md`, 8 tasks.
- **Checked against:** main `a7fb0f0`, on worktree `plan4-boards`. The gitdir is on `E:`; the `D:` path reaches the same checkout.
- **Method:** read-only. No test suites were run. Each finding was checked by grep or read against the code.
- **Binding authority:** SPEC.md (draft 5), then DESIGN.md, then the Plan 3 rulings recorded in its final review and ledger.

**Classes:**
- **BLOCK:** the task as written cannot compile, cannot pass its own step, or loses data.
- **REWORK:** the plan text must change. A suggested ruling is given.
- **COS:** cosmetic.

**Counts:** 4 BLOCK, 27 REWORK, 31 COS.

**Rule used where BLOCK and REWORK overlap:** a step that contradicts itself (B4), or a defect that loses data or breaks a recorded ruling (B1–B3), is a BLOCK. A file or line missing from a Files list, or a test that needs a setup the plan forgot (R5, R9), is a REWORK, because adding it changes nothing else in the task.

**"T0"** below is the Plan 3 M9 split. Plan 3 ruled that it comes first in Plan 4, but this plan has no such task (B1).

---

## 0. BLOCK summary

| ID | Task | Finding | Suggested ruling |
|---|---|---|---|
| B1 | plan (T0) | **The Plan 3 final-review ruling M9 is not in the plan.** The ruling (`final-review.md:234-236`, `:390`; ledger `:167`) says to split `commands.rs` (4,153 lines) as Plan 4's **first step**: its taxonomy-edit commands, `Plan`, `rekey_branch`, `drop_branches` and `move_tags` (`commands.rs:834-1480`) move into `commands/taxonomy_edit.rs`. T1 and T3 would otherwise land new code on the file first. Three more items were deferred "with the split": the `Plan` name collision, taxonomy items reported as `UnknownTag`, and redo tested on only one batch (`final-review.md:308-311`). | Add **Task 0**, a pure move with no behaviour change. Its tests move with it. `lib.rs` `generate_handler!` names the commands by their new path, `commands::taxonomy_edit::<cmd>`; don't rely on a glob re-export, because Tauri's `__cmd__` macros must resolve. Rename `Plan` (for example to `TaxPlan`). Map taxonomy-item errors off `UnknownTag`, or record that as deferred again. Gate: `cargo test`, then `clippy -D warnings`, then the same test count before and after. |
| B2 | T1 | **Link and board edits are never saved.** `settle()` marks the library dirty only when `touched.ref_ids` or `removed_ref_ids` is non-empty (`commands.rs:608-611`). `Debounce::deadline()` needs a dirty flag (`saver.rs:35-49`), so an edit that touches only `links` or `boards` sets no deadline. `saver::flush` writes `library.json` only when `dirty_library` is set (`saver.rs:92`, `:100`), so neither the debounced save nor the close flush writes it. The edit is lost on a normal quit, unless a later reference edit happens to set the flag (SPEC §9). T1 limits its `commands.rs` scope to "only the `Change` struct and the code that builds it", which excludes `settle`. | Extend T1's `commands.rs` scope to cover `change()`, `settle()` and `is_noop()`. Set `library = … \|\| touched.links \|\| touched.boards`. Add the test `link_edit_marks_library_dirty`: after `add_link`, `debounce` is due, and `library.json` holds the link after `flush`. |
| B3 | T5 | **"Open folder" needs `tauri-plugin-opener`, which Plan 1 removed.** Plan 1 Task 10 took it out of `Cargo.toml`, `package.json`, the `lib.rs` `.plugin(...)` call and `capabilities/default.json` (`2026-11-24-task-10-report.md:15`). Today's capability file has only `core:default` and `dialog:allow-open`. Global Constraints say "no new crates or npm packages", and Plan 6 T1 expects `opener:allow-reveal-item-in-dir` "because Plan 4's 'Open folder' uses it" (`release.md:139`). T5 cannot meet both. | **Recommended:** add `tauri-plugin-opener` back as a recorded exception to "no new crates". Grant only `opener:allow-reveal-item-in-dir`. Add `Cargo.toml`, `package.json`, `lib.rs` and `capabilities/default.json` to T5's Files. **Alternative:** drop "Open folder", since SPEC §5's Boards row doesn't require it, and tell Plan 6 to remove that permission line. |
| B4 | T6 | **Step 2 cannot pass as written.** It says "Plan 2's lightbox tests must still pass". T3 says `lightbox_source` "replaces Plan 2's `image_path` call in the lightbox", and T6 consumes `api.lightboxSource`. But `lightbox/view.test.ts:286-325` (`full_image_from_imagePath_with_thumb_fallback`) asserts `api.imagePath` calls and the rejection path. | T6 owns the swap: "Rewrite `full_image_from_imagePath_with_thumb_fallback` to `lightboxSource`, keeping its three cases: full original, rejected (thumb stays) and late reply after close. Every other Plan 2 lightbox test stays unchanged." Add `lightbox/view.test.ts` to T6's Test files. |

---

## 1. Pairs of tasks that share a file or an interface

| # | Tasks | Produces → consumes | Finding | Class |
|---|---|---|---|---|
| P1 | T0 ↔ T1, T3 | `commands.rs` (all three), plus the `lib.rs` handler list (T0, T3) | The split is missing (B1). T1 and T3 must start from the post-split file. Line numbers in their briefs must come from after T0. | BLOCK (B1) |
| P2 | T1 → T3 | New `Edit` variants and `EditError` → `commit()` (`commands.rs:658` uses `e.to_string()`) → UI strings | **Wire strings are not defined.** T3 asserts `Err("DuplicateLink:<id>")`, and T4 and T5 match on `DuplicateLink:` and `BoardNameTaken`. Today's `EditError` Display is prose (`"unknown reference: {0}"`, `edit.rs:199-210`), and `NameTaken:<id>` is built in `commands.rs:808`, not by `EditError`. See R2. | REWORK (R2) |
| P3 | T1 → T3 | `Touched.links` and `Touched.boards` → `change()`, `settle()`, `merge()` | The save flag is missing (B2). `edit.rs:801` `merge()` folds only the id vectors and must OR the new bools (R1). The test literal `Touched { … }` at `commands.rs:2780` needs the new fields or `..Default::default()` (C15). | BLOCK (B2) and REWORK (R1) |
| P4 | T2 → T3 | `export::export_board(lib: &Library, …)` → the `export_board` command, which "reads under the lock, copies off it" | `Library` is not `Clone` (`library.rs:33`). Holding `&Library` means holding the state lock for the whole copy. See R4. | REWORK (R4) |
| P5 | T2 ↔ T3 | `lib.rs` | T2 needs `pub mod export;` (`lib.rs:1-13`), but `lib.rs` is not in T2's Files. T3 adds handlers to the same file. This is a trivial merge. See R5. | REWORK (R5) |
| P6 | T2 → T3 → TS | `ExportReport { skipped: Vec<(String, String)> }` → `api.ts` `ExportReport` | Tuples serialise as 2-element arrays. T3's TS type must be `skipped: [string, string][]`, as `ImportReport.skipped` already is (`api.ts:117-122`). T2 doesn't state `#[derive(Serialize)]` or camelCase. | COS (C14) |
| P7 | T3 → T4 | `store.linksFor`, `addLink`, `updateLink`, `removeLink`, `Change.links` → Links tab and Related | **Duplication:** the Reference view already has a private `linksOf` (`reference/view.ts:312-316`) that does what `linksFor` does (R12). **Stale view:** `touchesFocus` returns `false` for a change with no references, no `removed`, no taxonomy and no reset (`reference/view.ts:611-628`). A links-only `Change` would not refresh the Links tab or the Ranked list (R7). | REWORK (R7, R12) |
| P8 | T3 → T5 | `setScope`, `inScope`, `scopeCleared` → status line, Reference view filtering, graph views | **No event shape is given.** Every subscriber reads `c.references` and `c.removed` (for example `lightbox/view.ts:208-211` and `reference/view.ts:611-648`). The `StoreEvent` type (`store.ts:5`) has no `scope` field. `reset()` (`store.ts:56-59`) says nothing about scope, so a library switch would keep a stale board id. See R7. | REWORK (R7) |
| P9 | T3/T5 → Plan 3 `data.ts` | `store.inScope` → `Snapshot.inScope` | `storeSource` hard-codes `inScope: everything` (`data.ts:24`, `:35`). The plan says Plan 3 "fills it from this `store.inScope`", which is false, and no Plan 4 task lists `data.ts`. Plan 3 row 9 gives "the `storeSource` line" to P4 T5. See R8. | REWORK (R8) |
| P10 | T3 → T6 | `api.lightboxSource` and `LightboxSource` → `lightbox/view.ts` | T3 says it replaces the lightbox's `imagePath` call, but `lightbox/view.ts` is in T6's Files only (C9). T3 also gives no fallback for when `lightbox_source` returns `Err` (R10). | REWORK (R10), COS (C9) |
| P11 | T3 → T7 | `score_pair` → Compare | It must read `visible()` (`commands.rs:363-371`), as `related` does at `:555`. Otherwise a hidden reference gets a score. | COS (C11) |
| P12 | T4 ↔ T5 | `reference/view.ts` and its test (both); the Linked-by-you group vs the scope filter | **No interaction rule.** SPEC §4 says links are "always shown". T5 filters Related, Ranked and search to `inScope`, and T4 says "Linked by you holds every linked reference". The current code also hides links while a filter is on (`reference/view.ts:286-287`). See R13. | REWORK (R13) |
| P13 | T4 → T7 | `mountLinkEditor` → "Link these two"; `linkedFirst`, link `why` at the top of Compare | The interfaces agree. Both tasks change `reference/view.ts` (T7 adds Shift-click and Shift+Enter), so they must run one after the other. | ok |
| P14 | T5 ↔ T7 | `firstrun.ts` `boot()` (both); `reference/view.ts` (both) | Both tasks say `main.ts`, but `main.ts` is a 10-line entry point (`main.ts:1-10`). The shell, the Galaxy deps and the status wiring are in `boot()` (`firstrun.ts:25-102`). `firstrun.ts` is in neither task's Files. See R15 and R22. | REWORK (R15, R22) |
| P15 | T6 → T7 | `openLightbox` → Compare's `L` | **The signature is stale.** The real one is `openLightbox(api, store, refId, deps: { openPicker(opts); onClose?() })` (`lightbox/view.ts:21-26`). Compare must supply `openPicker`, and the docking logic now lives privately in the Reference view (`reference/view.ts:572-595`). Copying it into Compare would duplicate it verbatim. See R23. | REWORK (R23) |
| P16 | T4, T5, T6, T7 ↔ `styles.css` | New CSS for the link handle, the board menu and view, zoom chrome and overlays, and Compare | `styles.css` is in no task's Files. Boards also needs a `body[data-view="boards"] > [data-view-host="boards"]` rule (`styles.css:300-304`). These are append-only edits, so they merge easily. See R25. | REWORK (R25) |
| P17 | T5 ↔ Plan 3 views | Board scope → Tree, Galaxy, Radial | The plan says it "doesn't touch them". The three scope items Plan 3 deferred to Plan 4 are **still open in the code** (R17):<br>• **T6 M2:** `tree.ts:97-98` clears `sel` only when the node is gone, not when it falls out of scope.<br>• **T6 M3:** the arrow keys in `tree.ts:209-211` (`if (next) select(next)`) stop at a dim reference.<br>• **T7 M10:** Galaxy inspector rows list out-of-scope neighbours (`galaxy.ts:113`), and `select()` has no `inScope` guard (`galaxy.ts:122`, `:296-298`).<br><br>Already closed in the code: the `select` refusals at `tree.ts:193` and `radial.ts:219`, `dim` in `galaxy.ts:73`, `radial.ts:191` and `tree.ts:125`, and Galaxy edges (`galaxy.ts:85-92`). T8 M4 is not about scope. | REWORK (R17) |
| P18 | T5 ↔ `views.ts` and `index.html` | `shell.register("boards", …)` | `register()` already removes `disabled` (`views.ts:54-59`), so "Modify `index.html` to enable the Boards tab" is a no-op. What is actually missing: a `<section class="graph-host" data-view-host="boards">` (see `index.html:63-66`), its CSS rule, a `ViewHandle` return (`mountBoards` returns only `{ destroy }`), and an `openReference` dep for "Open". See R15. | REWORK (R15) |
| P20 | T2 → T5 | `ExportReport.written` (which also holds `credits.txt`) → the toast "Exported N to <folder>" | N is not defined. If N is `written.length`, ten images report as eleven. See R21. | REWORK (R21) |
| P19 | T8 ↔ all | The manual run | It depends on every BLOCK and REWORK above. | n/a |

---

## 2. Each task against itself

| Task | Is the text consistent? | Class |
|---|---|---|
| T0 | It does not exist (B1). | BLOCK |
| T1 | The Files scope rules out `settle` and `is_noop` (B2).<br><br>**Inverse pattern.** In `edit.rs`, each `Remove*` is undone by a **sealed `Insert*`** variant that restores the position (`edit.rs:106-147`); an `Add*` appends and can't do that. So `RemoveLink { index, … }` and `RemoveBoard { index, … }` need positional inverses. The natural name, **`InsertLink`, is already taken** by `BranchTechnique` (`edit.rs:138`). `is_noop` (`commands.rs:616-628`) also needs `ReplaceLink before==after` and `ReplaceBoard before==after`. See R1.<br><br>The wire strings are not defined (R2). The tests and the code otherwise agree. `remove_refs_in_use_guarded` can reach its guard only through `apply` (`check: true`), because undo runs `check: false` (`edit.rs:284`); that is acceptable (C31). | BLOCK (B2), REWORK (R1, R2) |
| T2 | `credits.txt` contradicts itself: "Each block is followed by one blank line, and the file ends with a single `\n`." If the last block is followed by a blank line, the file ends in `\n\n` (R3).<br><br>`lib.rs` is not in Files (R5). `&Library` conflicts with copying off the lock (R4).<br><br>The output for a board with no written image, or one where every image is skipped, is not specified. "No `.tmp` remains" doesn't match `NamedTempFile::new_in`, whose temp names are `.tmpXXXXXX` with no `.tmp` suffix (C13). The naming tests (`1 - …` for a 3-item board, `01 - …` for 10) agree with the NN rule. | REWORK (R3, R4, R5), COS (C13) |
| T3 | **Step 3's list of fakes to update is stale.** `LibraryView` fakes with `taxonomyReadOnly:` exist in 12 files:<br>• `data.test.ts`, `firstrun.test.ts`, `graph/fixtures.test-util.ts`;<br>• `inbox/view.test.ts`, `intake.test.ts`, `library-menu.test.ts`;<br>• `lightbox/view.test.ts`, `reference/view.test.ts`, `store.test.ts`;<br>• `tagging/picker.test.ts`, `views/galaxy.test.ts`, `views/inspector-edit.test.ts`.<br><br>Two `Api` fakes are fully typed (`firstrun.test.ts:19`, `reference/view.test.ts:68`). Ten new methods break `tsc`, and `tsconfig.json` includes `src`, tests and all. `api.contract.test.ts:80` ("covers every IPC wrapper") fails without the new rows (audit #1). See R6.<br><br>**The asset-scope test can't reach its target.** `lightbox_cache_in_asset_scope` tests `lib.rs` `setup`, but `commands::tests::env()` builds its own mock app (`commands.rs:1877-1897`) and never runs it. `app_cache_dir()` in tests would also write to the real user cache. See R9.<br><br>`lightbox_source` would decode a large TIFF on the command thread, under the state lock (R10).<br><br>**The import refactor conflicts with "existing tests unchanged".** The test-only `PANIC_STEM` injection reads `src` inside the thumbnail loop (`import.rs:263-266`), and `write_thumbs(root, hash, rgb)` has no `src`. The `Thumbs` drop guard (`import.rs:247-280`) must still cover `sync_all` and `persist`. See R11.<br><br>`refactor_keeps_import_behaviour` is listed as a test but asserts nothing new (C28). There is no TIFF fixture (`tests/fixtures`: `bad_icc.png`, `empty.jpg`, `fake.psd`, `p3_red.png`, `rotated.jpg`, `small.jpg`) (C10). | REWORK (R6, R7, R9, R10, R11), COS (C9, C10, C11, C12, C28) |
| T4 | **Step 0 is obsolete.** `mountReference(root, api, store, opts)` has landed (`reference/view.ts:24`) (C5).<br><br>**"Related list" and "Related pane" are really the Ranked tab** (`#pane-ranked`, `index.html:54`, `:58`). It already renders link rows first (`"your link"`, `reference/view.ts:285-291`) without de-duplication, so a linked and scored reference appears twice. See R12.<br><br>**Drop targets don't exist.** No non-test code carries `[data-ref-id]`; rows use `data-go`. See R14.<br><br>The file for `linkedFirst` is not named (C16). The test "No `dragstart` listener is registered anywhere" needs an `addEventListener` spy to mean anything (C30). | REWORK (R12, R13, R14), COS (C5, C6, C16, C30) |
| T5 | B3 (the opener plugin).<br><br>**Registration and status line (R15, R16):** the shell is `mountViews` in `boot()`; the boards host and its CSS are missing; `mountBoards` returns no `ViewHandle`; "Open" has no route; and the status line belongs to the Reference view's `renderStatus` (`reference/view.ts:185`) and the footer (`index.html:68-79`), not `main.ts`.<br><br>**Test owner (C18):** `store_inscope_signature` appears under Interfaces but not in the Step 1 tests, and `data.test.ts` (`:63-64`, inScope always true) is in no Files list.<br><br>**Untestable as written (R18):** the "fake dialog" test needs the picker behind `Api`. `api.pickFolder` already exists (`api.ts:157`, `:225`).<br><br>The Plan 3 scope items are still open (R17).<br><br>**Can reuse existing code (C17):** search filtering can use the existing `referenceTitle` hook (`search.ts:47` drops `undefined`), and toasts can use `noticeIn` (`importer.ts:78`). | BLOCK (B3), REWORK (R15, R16, R17, R18), COS (C4, C17, C18) |
| T6 | B4 (the Plan 2 test contradiction).<br><br>**Arrow keys:** "The arrow keys pan by 10 % when zoomed in" collides with Plan 2's keyboard region draft. Today an arrow with no draft starts one from `CENTRED` (`lightbox/view.ts:163-172`; tests at `view.test.ts:98`, `:210-222`). See R19.<br><br>**A test that can't fail:** "Region under zoom: the same `Region` that `normRect` returns for `plateOf(view, img)`" compares the code with itself (R20).<br><br>**Files:** the `view` tests have no file (C19).<br><br>**Stale references:** `normRect` and `MIN_REGION` live in `lightbox/regions.ts:5-18`, not `view.ts` (C7). "Enter on the plate" doesn't exist; only `l`/`L` and `.lb-open` do (C8).<br><br>**Name and unit clashes:** `zoom.ts`'s `fit` clashes with the local `const fit` at `lightbox/view.ts:56` (C20). `plateOf` gives viewport px, but `normRect` takes client px (C21).<br><br>**Test already passes:** `overlay_ink_from_taxonomy`'s stroke half is already met (`lightbox/view.ts:85`) (C29). | BLOCK (B4), REWORK (R19, R20), COS (C7, C8, C19, C20, C21, C22, C29) |
| T7 | **`main.ts` should be `firstrun.ts`**, and Files must list it (R22).<br><br>**Shared code:** the `openLightbox` deps and the shared docking helper (R23).<br><br>**No route back to the Reference view:** "Esc calls the Reference view's `show(A)`", but `makeOpenCompare(root, api, store, opts)` has no route to `view.show`.<br><br>**Keys leak:** Compare's modality isn't specified. The Reference view's document keydown (`reference/view.ts:487-518`) guards only the lightbox and picker, so its `v`, Esc, `l`, `t` and digit keys would also fire under Compare; so would the Galaxy's. See R24.<br><br>**Test location:** the "Shift-click on a Related tile" test sits in `compare/view.test.ts`, but the behaviour is in `reference/view.ts` (C23). | REWORK (R22, R23, R24), COS (C23) |
| T8 | **Stale path:** Step 2 exports to `D:\Design Second Brain\Export test\`, but the D: HDD is failing and the checkout is on E: (C24).<br><br>**Imprecise wording:** "Ctrl+Z three times removes … the board change". Step 1 makes 10 undo steps (1 create and 9 member edits), so the third Ctrl+Z undoes only the last membership add (C25).<br><br>**No scale check:** there is no "at scale, what's on screen" check for the Boards grid (Plan 3 recommendation, `final-review.md:389`) (C27).<br><br>The commit target `app/README.md` exists, and Plan 2's E2E notes are already in it. | COS (C24, C25, C27) |

---

## 3. Stale references and Plan 3 hand-offs

| # | The plan says | Main has | Class |
|---|---|---|---|
| C1 | `ReferenceView` at `commands.rs:41` | `commands.rs:78` | COS |
| C2 | the real `store` at `import.rs:168` | `import.rs:208` (`:168` is inside `sniff`) | COS |
| C3 | Plan 2 "is under review; this plan only consumes it" | Plan 2 is merged | COS |
| R15 (part) | Plan 3's shell is "Task 2: `mountShell(...).register`" | `mountViews` (`views.ts:12`), wired in `firstrun.ts:47` | REWORK |
| R16 / R22 (part) | `main.ts` hosts the status line and `makeOpenCompare` | `main.ts` is the entry point only; `boot()` is at `firstrun.ts:25` | REWORK |
| R8 | "Plan 3 Task 10's `storeSource(store)` fills it from this `store.inScope`" | Plan 3 **Task 2** `data.ts:27-46`, `inScope: everything` at `:35` | REWORK |
| R15 (part) | "Modify `index.html` to enable the Boards tab" | the tab exists (`index.html:19`); `register()` enables it; no host section | REWORK |
| C4 | "Plan 2 Task 9's windowed grid helper where it exists" | `mountWindowedGrid`, `grid/windowed.ts:5`; its header already says "Plan 4 reuses this" | COS |
| C5 | T4 Step 0 "if that hasn't landed" | landed (`reference/view.ts:24`, four arguments) | COS |
| C6 | "The Links tab lists `linksFor(focus)`" | the tab already exists, read-only (`reference/view.ts:318-329`; `index.html:55`, `:59`) | COS |
| R12 (part) | "the Related list / pane" | the Ranked tab, `#pane-ranked`; it already lists links first | REWORK |
| R23 (part) | `openLightbox(api, store, refId)` | it takes a fourth argument, `deps` (`lightbox/view.ts:21-26`) | REWORK |
| C7 | `normRect` and `MIN_REGION` in the lightbox view | `lightbox/regions.ts` | COS |
| C8 | "opens with `L` or Enter on the plate, as in Plan 2" | only `l`/`L` and the `.lb-open` button (`reference/view.ts:508`, `:596`) | COS |
| C22 | "the Plan 2 lightbox gains zoom, pan and hover overlays in place" | the Reference view docks the picker into `.lightbox .lb-side`, with the comment "Plan 4's lightbox chrome owns this slot" (`reference/view.ts:580-581`). T6 must keep `.lb-side` or update that selector. | COS |
| B3 | "`Open folder` uses the opener plugin" | removed in Plan 1 Task 10 | BLOCK |
| R18 | `open({ directory: true })` from the plugin directly | `api.pickFolder(title)` exists | REWORK |
| R6 | the `LibraryView` fakes are view, store, picker, Inbox, intake and data tests | 12 files, plus 2 fully typed `Api` fakes, plus the contract-test rows | REWORK |
| C24 | T8 `D:\…\Export test\`, and `plan-path` / `progress.md` cite `D:` | the checkout is on E: (the D: HDD is failing) | COS |
| Plan 3 row 5 | operation inks via `opInk` and `opLabel` | accounted for (Global Constraints, T6, T7) | ok |
| Plan 3 row 9 | P4 T5 adds `store.inScope` **and the `storeSource` line** | the plan adds `inScope` in T3, and no task edits `data.ts` | REWORK (R8) |
| Plan 3 row 10 | P4 T7 makes the export and the `boot()` line | the plan says `main.ts` (`firstrun.ts:63` is where `mountGalaxy` gets its deps; `galaxy.ts:29` already declares `openCompare?`) | REWORK (R22) |
| Plan 3 M9 ruling | the split comes first in Plan 4 | missing | BLOCK (B1) |
| Plan 3 deferred items for "Plan 4, board scope" (T6 M2/M3, T7 M10) | "this plan doesn't touch" the graph views | still open in the code (P17) | REWORK (R17) |
| Plan 3 recommendation | measure what is on screen at scale in the Plan 4–6 speed checks | no Boards-grid scale check in T8 | COS (C27) |
| Audit #1 | each later plan adds its own IPC contract rows | not in T3 | REWORK (R6) |
| Audit #23 | title, creator, year and credit editing: "the user or P4" | still unassigned (`edit.rs:11`). T2's `credits.txt` prints Creator, Year and Credit, which no UI can set: imports set none, and `IntakeMeta` has only note and sourceUrl. Outside the demo set, those fields print `—`. | REWORK (R27) |
| Audit #25 | Shift-click Compare from the graph views | only the Galaxy has the dep; the Tree and Radial don't | COS (C26) |
| Carried rule (`progress.md`) | "no new inline `style=`" | not in the plan's Global Constraints. `tileHTML` emits `style=` (`reference/tile.ts:32-35`), and T4, T5 and T7 reuse tiles. | REWORK (R26) |

---

## 4. What a code-review rubric would flag as a defect

| # | Where | Defect | Class |
|---|---|---|---|
| C28 | T3 `refactor_keeps_import_behaviour` | A requirement listed as a test; it asserts nothing new. | COS |
| R20 | T6 "region under zoom" | It compares `normRect(plateOf(...))` with itself, so it can't fail. | REWORK |
| C29 | T6 `overlay_ink_from_taxonomy` | The stroke half already passes on main (`lightbox/view.ts:85`), so it is not red before the change. Only the hover-label half is new. | COS |
| C30 | T4 "no `dragstart` listener anywhere" | Without a spy on `EventTarget.prototype.addEventListener`, it asserts nothing. | COS |
| R12 | T4 | Verbatim duplication: `store.linksFor` next to the view's `linksOf` (`reference/view.ts:312`). | REWORK |
| R23 | T7 | Verbatim duplication: copying the picker-docking closure (`reference/view.ts:577-594`) into Compare. | REWORK |
| C20 | T6 | Two `fit` names in one module, after importing `zoom.ts`. | COS |
| R26 | T4, T5, T7 | Reusing `tileHTML` breaks the carried "no new inline `style=`" rule. | REWORK |

---

## 5. REWORK rulings (the spec is binding)

| ID | Task | Suggested ruling |
|---|---|---|
| R1 | T1 | Add sealed inverses `InsertRefLink { index, link, sealed }` and `InsertBoard { index, board, sealed }`, beside the existing `Insert*` variants. Don't reuse `InsertLink`, which belongs to `BranchTechnique`. `merge()` ORs `links` and `boards`. `is_noop` covers `ReplaceLink` and `ReplaceBoard` when `before == after`. Neither variant `touches_taxonomy`. |
| R2 | T1 | Fix the `EditError` Display strings as wire codes:<br>• `SelfLink` → `"SelfLink"`;<br>• `DuplicateLink(id)` → `"DuplicateLink:{id}"`;<br>• `EmptyWhy` → `"EmptyWhy"`;<br>• `EmptyName` → `"EmptyName"`;<br>• `BoardNameTaken(id of the existing board)` → `"BoardNameTaken:{id}"`, matching `NameTaken:<id>`;<br>• `UnknownLink(id)` → `"UnknownLink:{id}"`;<br>• `UnknownBoard(id)` → `"UnknownBoard:{id}"`.<br>The UI maps each code to copy (T4, T5). |
| R3 | T2 | Blocks are separated by one blank line, and the file ends with exactly one `\n` after the last `Source:` line. With no written image, the file is `Horus board: <name>\n`. |
| R4 | T2 | Make the signature `export_board(root: &Path, board: &Board, refs: &[Reference], dest: &Path)`, resolving paths with `image_path_in`. The command clones the board and its member references under the lock, then copies off it as `#[tauri::command(async)]`, as `graph_edges` does (`commands.rs:562-570`). |
| R5 | T2 | Add `app/src-tauri/src/lib.rs` (`pub mod export;`) to T2's Files. |
| R6 | T3 | Step 3 also:<br>• adds the 10 methods to the typed `Api` fakes in `firstrun.test.ts` and `reference/view.test.ts`;<br>• adds `boards: []` to all 12 `LibraryView` fake files (or makes `boards` optional in TS, as `seedWarnings` is);<br>• adds one `api.contract.test.ts` row per new command, with keys `fromRef/toRef/why`, `linkId/why`, `linkId`, `name/referenceIds`, `boardId/name`, `boardId/referenceIds`, `boardId`, `boardId/dest`, `a/b` and `refId`.<br>Gate: `npm run build` (tsc) and the full `npm test`. |
| R7 | T3 | **Change events:** `StoreEvent = Change & { reset?: true; scope?: true; scopeCleared?: true }`. `setScope` emits `{ references: [], removed: [], canUndo, canRedo, scope: true }`. `apply` copies `links` and `boards` when present. `reset()` sets `scope = null`.<br><br>**Reference view refresh:** T4 makes `touchesFocus` return true when `c.links` or `c.scope` is set. |
| R8 | T3 | Change `data.ts:35` to `inScope: (id) => store.inScope(id)`. Rewrite `data.test.ts:63-64` so it checks both the null scope and a member scope. That makes T5's `store_inscope_signature` the same test. |
| R9 | T3 | `AppState::new` takes a `cache_dir: PathBuf`, as it does `config_dir`. `lib.rs` passes `app_cache_dir()`, and `env()` passes a tempdir. One `pub fn allow_lightbox_cache(app)` is called from `setup` and from `env()`, so the scope test runs on the mock app. |
| R10 | T3 | `lightbox_source` is `#[tauri::command(async)]`: it resolves the path under the lock and decodes off it. If it returns `Err`, the lightbox keeps `thumb1024` and shows the preview note, so the pane is never blank (Review Focus 3). |
| R11 | T3 | `write_thumbs` keeps the test-only panic hook between the two sizes, keyed on `hash` (for example a `#[cfg(test)]` static set by the test). `store` keeps its `Thumbs` guard around `write_thumbs`, `sync_all` and `persist`. The `PANIC_STEM` test may change only in how it arms the hook. |
| R12 | T4 | The "Related list" is `#pane-ranked`. Replace both the existing link rows and `linksOf` with `linkedFirst(S.related, store.linksFor(focus), focus)`, so no reference appears twice. The Links tab rows gain Edit and Delete. |
| R13 | T4, T5 | SPEC §4 "always shown" wins over the filter and the scope. The "Linked by you" group stays under a technique filter, and under board scope it also stays, each out-of-board row carrying "Not on this board". Scored rows, Ranked and search reference hits filter to `inScope`. |
| R14 | T4 | Tiles that can receive a link drop (Ranked and Links rows, callout thumbnails) gain `data-ref-id`, next to the existing `data-go`. The handle is appended to `#lab`, like `.tag-open` (`reference/view.ts:562`), because `#plate` re-renders. |
| R15 | T5 | **Files:** `firstrun.ts` (`shell.register("boards", …)` in `boot()`), `index.html` (`<section class="graph-host" data-view-host="boards">`) and `styles.css` (the display rule).<br><br>**Signature:** `mountBoards(root, api, store, { openReference })`, returning `ViewHandle`.<br><br>**Text:** drop "enable the tab". |
| R16 | T5 | The scope status lives in the footer (`index.html:68-79`). Either the Reference view's `renderStatus` writes it, or a small `boards/status.ts` that subscribes to the store does, wired in `boot()`. Name the one T5 uses, and put the "Board removed — showing all references" test there. |
| R17 | T5 | Add to T5, because SPEC §2 says "filter the view to that board":<br>• `tree.ts:97` also clears `sel` for an out-of-scope reference;<br>• the Tree `move` steps past refused ids in the same direction;<br>• Galaxy inspector rows show only `inScope` neighbours, and its `select` refuses out-of-scope ids.<br>Add one test each.<br><br>Otherwise, record all three as deferred to Plan 6 with the user's agreement. |
| R18 | T5 | Pick the export folder with `api.pickFolder("Export board to folder")`. The fake dialog is then the `Api` fake. |
| R19 | T6 | An arrow key edits the draft whenever one exists. With no draft, it pans while zoomed in past fit; at fit, it starts the centred draft, as in Plan 2. Enter still starts a draft at any zoom. The Plan 2 key tests (which run at fit) stay unchanged. |
| R20 | T6 | Use a literal expectation. Take a 1000×750 image in an 800×800 viewport at scale 0.4 with known `tx` and `ty`, drag from (100, 100) to (180, 160), and assert the exact `{x, y, w, h}`. Then assert that the same drag at fit, scaled, gives the same region. |
| R21 | T2, T5 | N in "Exported N to <folder>" counts images only: `written.length - 1` when `credits.txt` was written. Better: `ExportReport` gains `credits: Option<String>` (the credits file name), and `written` lists images only. Test it in T5: a report with 10 images and credits reads "Exported 10 to …". |
| R22 | T7 | `makeOpenCompare` is built in `firstrun.ts` `boot()` and passed to `mountGalaxy` as `openCompare` (`firstrun.ts:63`). Add `firstrun.ts` to Files. |
| R23 | T7 | Lift the lightbox picker docking out of `reference/view.ts:572-595` into one exported helper (for example `openLightboxWithPicker(api, store, refId, onClose)`). Both the Reference view and Compare call it. |
| R24 | T7 | Compare is a modal dialog, like the lightbox: `role="dialog"`, `aria-modal`, its own keydown, and a focus trap. The Reference view keydown also returns while Compare is open, beside `if (lightbox) return;`. `makeOpenCompare`'s deps gain `showReference(id)`, which `boot()` wires to `view.show`. |
| R25 | T4, T5, T6, T7 | Add `app/src/styles.css` to each task's Files, append-only, in a section headed by the task. |
| R26 | Global | Add the carried rule "No new inline `style=`; positions go through the CSSOM", as `windowed.ts` and the lightbox do. New tiles use `tileBox` with `style.setProperty`, not `tileHTML`. |
| R27 | T2 / audit #23 | Either the user decides on metadata editing (a P4 "Details" inspector), or the plan records "`credits.txt` prints what the library holds (demo metadata, or `—`); metadata editing stays out of v1 (audit #23 closed)". |

---

## 6. COS list (one line each)

| ID | Item |
|---|---|
| C9 | T3 says it replaces the lightbox's `imagePath` call; T6 owns that file. |
| C10 | Generate the 64×48 TIFF in the test with `image`'s TIFF encoder (the `tiff` feature is on). |
| C11 | `score_pair` reads `visible()`. |
| C12 | Use the `#[tauri::command(async)]` idiom rather than "spawn_blocking". |
| C13 | T2: the empty and all-skipped board output, and the `.tmp` naming check. |
| C14 | T3: the TS type `ExportReport.skipped: [string, string][]`. |
| C15 | Update the `Touched` literal at `commands.rs:2780`. |
| C16 | Name the file for `linkedFirst` (`links/editor.ts`). |
| C17 | T5 reuses `referenceTitle` for search and `noticeIn` for the toast. |
| C18 | `store_inscope_signature`: add it to the Step 1 tests, with `data.test.ts`. |
| C19 | Add `lightbox/view.test.ts` to T6's tests. |
| C20 | Name clash on `fit`. |
| C21 | `plateOf` returns viewport (stage) px; add the stage offset before `normRect`. |
| C22 | Keep `.lb-side`. |
| C23 | T7: the Shift-click test belongs with the Reference view. Shift+Enter arrives as a click with `shiftKey` on the row. |
| C24 | Paths on D:. |
| C25 | The Ctrl+Z count wording in T8. |
| C26 | No Tree or Radial Compare entry. |
| C27 | A Boards-grid scale check in T8. |
| C28 | `refactor_keeps_import_behaviour` is not a test. |
| C29 | `overlay_ink_from_taxonomy` is half green before the change. |
| C30 | The `dragstart` test needs a spy. |
| C31 | The `RemoveReferences` guard is reachable only with `check: true`. |
| C1–C8 | The stale line and name references in §3. |

---

## 7. Suggested parallel schedule

The shared files decide the order:
- `commands.rs`: T0, T1, T3;
- `lib.rs`: T0, T2, T3, and T5 if opener comes back;
- `reference/view.ts` and its test: T4, T5, T7;
- `firstrun.ts`: T5, T7;
- `styles.css`: T4, T5, T6, T7 (append-only);
- `lightbox/view.ts`: T6, and T7 if R23 lifts the docking helper (then T7 also edits it).

| Wave | Tasks | Why |
|---|---|---|
| W0 | **T0** alone | A pure move on `commands.rs` (Plan 3 M9: first, before more commands land). |
| W1 | **T1 ‖ T2** | T1 changes `edit.rs` and the top of `commands.rs` (`Change`, `change`, `settle`, `is_noop`). T2 creates `export.rs` and adds one `lib.rs` line. They share no other file. |
| W2 | **T3** | It needs T1 and T2. It touches Rust (`import.rs`, `commands.rs`, `lib.rs`) and TS (`api.ts`, `store.ts`, `data.ts`, the fakes, the contract test). |
| W3 | **T4 ‖ T6** | T4: `links/*`, `reference/view.ts`. T6: `lightbox/*`. They overlap only in `styles.css`, which is append-only. |
| W4 | **T5** (T6 may still be running) | After T4, because both change `reference/view.ts`. T5 vs T6 overlap only in `styles.css`. |
| W5 | **T7** | It needs T4's editor and T6's lightbox. It touches `reference/view.ts` and `firstrun.ts` after T5, and `lightbox/view.ts` after T6 (R23). |
| W6 | **T8** | The end-to-end check. |

**Dispatchable unchanged:** none. T8 needs only COS edits, but it runs last.
