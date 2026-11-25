# Pre-flight conflict scan: Plan 2 (Tagging, Inbox, Undo)

- **Plan:** `docs/superpowers/plans/2026-11-25-horus-tagging-inbox.md`, cited as `P:<line>`.
- **Code:** main `25be96d` (Plan 1 plus the final-fix commit `982f8a6`). Paths are relative to `app/src-tauri/src/` (Rust) or `app/src/` (TS) unless given in full.
- **Spec:** `SPEC.md`, draft 5.
- **Severity:**
  - **BLOCK:** an implementer would build the wrong thing, fail to compile, or break a Plan 1 test the plan says must still pass.
  - **REWORK:** rework risk.
  - **COS:** cosmetic.
- **Counts:** 8 BLOCK, 27 REWORK, 22 COS. Every finding has an ID (B, R or C) and is listed once, in section 6. Sections 1–5 refer to those IDs.

---

## 1. Task pairs that share a file or an interface

| Pair | Shared | What one produces vs what the other consumes | Finding |
|---|---|---|---|
| T1 → T2 | `edit::{apply, Edit, Touched, EditError}` | T2's `undo`/`redo` returns `Option<Touched>` from `apply`. Signatures agree (P:117, P:167). | OK. T2 has no `lib.rs` edit (R1). |
| T1 → T3 | `Edit::AddTechnique { technique, links }`, `new_id` | T3 `custom_technique` returns `Edit::AddTechnique` (P:206-207) with the shape T1 defines (P:110). `taxonomy.rs` ↔ `edit.rs` is a mutual `use`, which Rust allows. | OK |
| T1 → T5 | `Edit`, `Field`, `validate_tag`, `Touched.taxonomy` | T5 must refuse a taxonomy edit **before** applying it (P:343). T1 gives no way to ask an `Edit` whether it touches the taxonomy; `Touched` exists only after `apply`. `set_field` sends `"sourceUrl"`, but `Field` derives no `Deserialize`/camelCase (P:102, P:124). | R6, C16 |
| T2 → T5 | `History`, cleared on open and create | P:177 matches T5 `open_clears_history` (P:391). | OK |
| T3 → T4 | `Taxonomy::save` | `flush` calls it (P:263). It agrees. | OK |
| T3 → T5 | `load_with_fallback`, `TaxSource`, `CustomError::NameTaken` → `"NameTaken:<id>"` | It agrees (P:204, P:320). `load_with_fallback` has no newer-version check, though `library.rs:183-195` has one for `library.json` and the seed carries `version` (top-level key). A writable Backup or File could overwrite a newer `taxonomy.json`. | R7 |
| T4 → T5 | `Debounce`, `flush`, the saver thread, guarded `thumb_path_in` → `ReferenceView::new` | T4 says `touch` "notifies" a `Condvar` (P:265), but `Debounce::touch(&mut self, …)` (P:258) owns none. The `Condvar` must pair with `AppState.open` (`commands.rs:18`). After `restore`, `due()` is true at once, so the thread spins (P:266, P:281). `mock_builder` tests never run `setup` (`commands.rs:342-360`), so `debounced_save_lands` (P:388) has no saver thread. | R3 |
| T4 ↔ T5 | both modify `import.rs` | T4 adds `Result` returns to `image_path_in`/`thumb_path_in`. These are used at `import.rs:141`, `:249`, `:299` (the `Thumbs` drop guard from 982f8a6) and in about 15 test sites. T5 adds sniffing and `Skip::InsideLibrary` (`import.rs:73`). Neither task lists `import.rs` in **Files** (P:246-248, P:295-299). | B2, R4 |
| T4 → T10 | `Library::image_path` → `Result` → the `image_path` command → the lightbox | The scope still allows `images/` (`commands.rs:126-130`). | OK |
| T5 → T7 | `Change`, `LibraryView.taxonomyReadOnly`, TS types | T7's `Store.taxonomyReadOnly` (P:506) needs `LibraryView.taxonomyReadOnly`. T5's interface never adds it to `LibraryView` (`commands.rs:52-61`, `api.ts:37-44`); only Amendment 3 does (P:856). The T5 test asserts it (P:398). | R5 |
| T5 → T7/T9 | `importPaths` → `ImportResult`, and `importer.ts` | T5 says only "read `.report`" (P:405). `importer.ts:67-69` then still calls `api.openLibrary(lib)` after every status-bar import. In Plan 2 that flushes and **clears history** (P:338, P:391). | B4 |
| T5 → T8 | `addTags`, `addTechnique`, `updateTag`, `removeTag` | The shapes agree (P:316-320 vs P:593, P:643). | OK |
| T5 → T9 | `importPaths(paths, meta)`, `importBytes`, `setField`, `ImportReport.duplicates` | `importBytes` stages files in `<root>/.incoming/` (P:365), which Plan 1 import refuses (B1). Merge "one undo step per reference" (P:703) is impossible when both fields fill, because `set_field` takes one field (P:319). | B1, R16 |
| T5 ↔ T9 | both modify `importer.ts` | T5 switches `reason()` to `kind` (P:359, `importer.ts:19`). T9 extends it as the intake toast (P:662). This is consistent if T5 lands first. | OK |
| T6 → T7 | `search.rs`, `match-cases.json` | T7's `matchesQuery` comment (P:524: "either contains the other", no whole-word rule) contradicts T6 (P:443-447) and the shared case `eyesore`→`face-schema`: **false** (P:549). | R9 |
| T6 ↔ T7 | both modify `search.rs` | T7 adds `shared_match_cases` to T6's test module. The `include_str!("../../src/tagging/match-cases.json")` path resolves correctly from `app/src-tauri/src/`. | OK |
| T7 → T8, T9, T10, T11 | `Store` | `Store` (P:506-508) has no `root` and no `warning`. Plan 1 needs both: the status line (`view.ts` `apply`, test "shows the library folder name"), the importer's `libraryRoot()` hook (`view.ts:409-410`), and the 982f8a6 warning notice (`view.ts:447`). | B7 |
| T7 ↔ T11 | both modify `reference/view.ts` | T7 keeps "the filter" as view state (P:531). T11 replaces it (P:776). This is sequenced and fine. | OK |
| T8 → T9 | `mountPicker`, `PickerOpts.inbox` | The rule for ← and → while docked agrees (P:624 vs P:694, P:711). | OK |
| T8 → T10 | `mountPicker` with a region | T10's test spies on "the picker factory" (P:764), but `openLightbox(api, store, refId)` (P:748) has no factory parameter. | R19 |
| T8, T9, T10 → Plan 1 `view.ts` | the document `keydown` (`view.ts:373-395`) | Plan 1 handles `/`, `v`, Escape, Backspace and 1–9 for any target that is not an `input`, and exempts only `input` (`view.ts:374`). T8 routes printable keys and Esc (P:623, P:627). T10 binds `v` and Esc (P:753, P:755). Both fire twice. T8, T9 and T10 each need `view.ts` edits that their **Files** lists omit. | R13, R14 |
| T9 → T5 | the Library menu → `open_library` and `create_library` | Switching makes the scope note at `commands.rs:123-125` reachable: the old library stays in the asset scope. The `AlreadyALibrary` copy (`commands.rs:72`) names the first-run button, "Open an existing library", which the menu calls "Open library…". | R24, C21 |

---

## 2. Self-consistency of each task

| Task | Verdict | Findings |
|---|---|---|
| T1 edit | Mostly consistent | **C6:** the fixture fix ("both None", P:96) makes `json_is_camel_case_and_skips_none` (`model.rs:83-98`) stop covering `branchId`. **C7:** `new_id` (P:120) joins nanos and the counter with no separator, so "never repeats" is not guaranteed. **R6.** **C16.** |
| T2 history | Consistent | **R1:** creates `history.rs` with no `lib.rs` `pub mod history;` (P:156). Step 2's `cargo test history::` could "pass" with 0 tests. |
| T3 taxonomy | **Contradiction** | **B6:** `custom_id_suffix` (P:236) contradicts `find_by_name` (P:205). **C8:** `save_roundtrip_is_value_equal` (P:227) duplicates the existing `roundtrip_preserves_fields` (`taxonomy.rs:497-521`). **C9:** the serde rule (P:223) is a no-op, because `color` and `citation` are the only `Option`s and both keep `null`. **C2:** the stale comment "release builds use panic = abort" (P:213). |
| T4 saver | Gaps | **R1:** no `lib.rs` `pub mod saver;`. **R3.** **R25:** `cargo test saver:: library::` (P:287) passes two positional filters, which cargo rejects; use `cargo test -- saver:: library::`. **C15:** "logged warning" (P:269), but there is no logging crate (use `eprintln!`); the regexes (P:272-273) must be hand-matched (no `regex` crate). **D3:** `import_still_writes` (P:285) is not a test. |
| T5 commands | Gaps | **R4:** the **Files** list (P:295-299) omits `import.rs`, `library.rs` (`SUBFOLDER` becomes `pub`, P:349), `importer.ts`, the created `importer.test.ts` (P:400), the created `api.contract.test.ts` (P:407) and the new `hooks` module (P:312, no file named). **R26:** Step 2 runs only `cargo test commands::` (P:403), but T5's tests include `import::` cases (P:399-400) and two Vitest files. **R7.** **C10:** `imports_are_serial` (P:386) duplicates Plan 1's `import_twice_is_serialised_and_deduped` (`commands.rs:657-670`); the read-counting hook in `sniff_skips_without_copy` (P:399) is a test seam in production code. **R27:** `import_paths` of all-duplicates records an empty `AddReferences` undo step. |
| T6 search | Consistent | The rules agree with the seed. I checked with a script: "lead the eye" and "make it stand out" have 0 text matches, "empty space" → `isolation-in-void` + `figure-ground-reversal`, and "backlit" → `rim-light` + `silhouette`. **D1**, **D2** (section 4). |
| T7 store/model/keys | Gaps | **B7.** **R9.** **R10:** `opInk` maps `EXTRA_INKS` (P:56, P:515), but Plan 2 never gives its values if it creates `ops.ts` first. They are `["teal","olive","rose","indigo","umber"]` (`2026-11-25-horus-graph-views.md:702`). **R2:** `mountReference` drops `ready` (P:519), but `view.test.ts:84` awaits `view.ready` in `beforeEach`. **C4:** "Plan 1's hard-coded `OPS` map" (P:533) is actually `OP_KEY` (`view.ts:9`). **C11:** the `esc` source-scan test (P:566) is a lint written as a test. |
| T8 picker | **Contradiction** | **R12:** "Enter with nothing highlighted applies a partial tag" (P:625), but the test "type `moody`, Enter → chiaroscuro" (P:636) needs the lone visible card auto-highlighted. No rule says so. **R13:** keys `1`–`9` choose the operation "while focus is inside the picker" (P:622), so digits cannot be typed into the search field. **R14:** the **Files** list (P:588-590) omits `view.ts`, although P:621 suspends its 1–9 pinning. **R23:** no route opens the picker on an already-tagged reference for a whole-image tag (only the Inbox, a drop or a lightbox region). |
| T9 Inbox/intake/menu | **Contradiction** | **R15:** `IntakeDeps.toast(msg: string)` (P:676) cannot hold the note field (P:700) or the Show/Merge buttons (P:701-703). **R16.** **R17:** "enable the Inbox tab" (P:660) gives no view-switching mechanism; Plan 1 has none (`index.html` tabs are disabled) and the shell is Plan 3's `shell.ts`. **R18:** "→ on the last item shows Inbox is empty" (P:84, P:710) is wrong copy while untagged items remain. **R14:** `data-ref-drop` on `#plate` (P:697) needs `view.ts`, which is not in **Files**. **C12:** the test at P:720 says the x-meta name `<b>t</b>.png` "becomes the tile's title", but Rust's `file_name()` (P:364) would give `b>.png` → `b_`. In jsdom only the fake decides. **C13:** `dupRows` (P:727) is listed under "Library menu" but lives in `intake.ts`. **C17:** the Tauri drop position is in physical pixels; divide by `devicePixelRatio` before `elementFromPoint`. **C22:** `npm test -- inbox intake` (P:729) skips `library-menu.test.ts`; `styles.css` is not listed. |
| T10 lightbox | **Contradiction** | **R19:** the test needs a picker factory that the signature lacks. **R14:** the "Open lightbox" / `L` key (P:756) needs `view.ts`, which is not in **Files** (P:738-739). **R20:** `tileBox` (P:742, `reference/tile.ts:6`) fits a **square** tile only, so it cannot letterbox into a non-square lightbox viewport. **C22:** `styles.css` is not listed. |
| T11 filter | Consistent | **C20:** Plan 1 `show()` clears the filter on every navigation (`view.ts:79`). Whether the AND/OR chips survive navigation is unspecified. |
| T12 e2e | Minor | **C14:** Step 3 commits "end-to-end check notes in `app/README.md`", but no step writes them. |

---

## 3. Each task against the real code at HEAD 25be96d

| Task | Plan says | Code at HEAD | Finding |
|---|---|---|---|
| T1 | `model.rs` fixture has `technique_id: None`, `branch_id: Some` | True: `model.rs:84-91`. `Tag`, `Reference` and `LibraryData` derive `Clone, Debug, PartialEq`. The seed has `pop-out` only under `differentiate.feature`, and `group.semantic` is absent, so the test cases hold. | OK (C6) |
| T2 | `History` over `LibraryData` + `Taxonomy` | The types exist. `lib.rs:1-9` lists the modules explicitly. | R1 |
| T3 | Add `save`, `load_with_fallback`, `find_by_name`, `custom_technique` to `Taxonomy` | Only `load`, `validate`, `validate_seed` and `branches_for` exist (`taxonomy.rs:171-456`). The `Option` fields are just `Operation.color` (`:27`) and `Technique.citation` (`:63`). `BranchTechnique.source` and `rationale` are plain `String` (`:75-76`). The seed has `"version"` at the top level and no taxonomy version check anywhere. | B6, R7, C2 (`Cargo.toml` now says "No panic = "abort"", and `lib.rs:46-55` tests it) |
| T4 | The deferred minor is at `library.rs:94`; `image_path`/`thumb_path` are at `library.rs:108-127`; "import builds its paths from the hash it computed, so its paths always pass the guard" (P:285) | The rotation is now at `library.rs:120-123`, and the four path fns at `library.rs:128-148`. **`import.rs:141`** calls `copy_and_hash(src, &image_path_in(root, ""))`, using an **empty** file name to get the `images/` dir. The guard would reject it, so every import fails. `import.rs:249` uses `thumb_path_in` inside an `io::Result` closure, and `import.rs:299` uses it inside `Drop` (the 982f8a6 `Thumbs` guard), where `?` is impossible. `Library::save(&self)` (`library.rs:107`): resetting `recovered_from_backup` needs `&mut self`, but `Library::create` holds an immutable `lib` (`:55`, `:65`), as do the tests (`:245-246`, `:330-333`). The new `LibraryError::InvalidFile` breaks the exhaustive `match` in `library_error` (`commands.rs:69-88`). | **B2**, R8, R11, C1 |
| T5 | `ReferenceView` is at `commands.rs:41`; `install` fails on taxonomy at `commands.rs:108`; `Skip::Unsupported("inside the library")` is at `import.rs:72`; `importer.ts:19`; the IPC table is "checked against Plan 1 HEAD f0b90c4" | `ReferenceView` is at `commands.rs:45`; the taxonomy load at `:118-119`; `Skip` at `import.rs:73`. `importer.ts:19` is correct. The 9 commands and their keys are unchanged at 25be96d (`lib.rs:29-39`, `api.ts:115-132`), so the table is still right; only the hash is stale. **Import staging:** `import_paths` refuses any path under the library root (`import.rs:61-76`, the `inside()` check). **Import save:** `run_import` saves at once and rolls back memory on failure (`commands.rs:262-269`, from 982f8a6). It is tested by `import_save_failure_rolls_back_memory` (`:624-655`) and depended on by `open_refuses_newer_version` (`:608-622`, which imports, tampers, then opens). **Exit:** the `ExitRequested` timing is verified in the dependency source. `tauri-runtime-wry-2.12.5/src/lib.rs` (about `:4259-4273`) sends `RunEvent::ExitRequested { code: None }` from `WindowEvent::Destroyed` once the last window is gone. `prevent_exit` (`tauri-2.12.7/src/app.rs:90`) keeps the process alive with no window. `AppState.open` is a tuple (`commands.rs:18`), so Plan 1 tests that use `.0` (`:638`, `:719`) and that call `import_paths(h, vec![p])` → `ImportReport` (`:332`, `:597`, `:601`, `:706`) need updating. `import.rs:683-686` asserts `Skip::Unsupported(_)` for a file inside the library. `create_library(pics, false)` → `pics/Horus Library` and `Library::open` → `NotALibrary` on the parent (`library.rs:72-74`) both hold, so the subfolder fallback (P:347-350) is sound. | **B1, B3, B5**, R4, R5, C1 |
| T6 | Keep 5 existing tests; signatures unchanged | 5 tests at `search.rs:215-278`. `MAX_TECHNIQUES = 8` (`:25`). Chiaroscuro is under `differentiate.feature` and `sequence.feature`, so the `operation_id_rungs` premise holds. | OK |
| T7 | "`main.ts` loads `openLibrary` … `getTaxonomy`, calls `createStore`, then mounts the view" (P:536); modify `main.ts` (P:492) | `main.ts` is 6 lines: `void boot(document.body, tauriApi)`. Loading, first run and `mountReference(root, api, lib)` live in **`firstrun.ts:13-29`**, which is not in **Files**, and neither is `firstrun.test.ts`. `mountReference(root, api, initial?)` returns `{show, ready, destroy}` (`view.ts:22-26`). The view also owns the theme (`getSettings`, `view.ts:433`), the find-similar status, the folder name and the 982f8a6 warning notice (`view.ts:447`). Its tests are `view.test.ts:177-210`. P:530 strips "settings" from the view and gives these no new home. `esc` is duplicated 4×, as P:488 says (`firstrun.ts:10`, `importer.ts:10`, `search.ts:13`, `reference/view.ts:14`); none escapes `'`. `--ink-2` and `--panel` exist in `styles.css`. | **B7**, R2, R10, C4 |
| T8 | Picker docked; Reference view pinning suspended | Plan 1 `view.ts:373-395` (see section 1). Plan 1 uses inline `style=` in its markup, which the CSP allows (`style-src 'unsafe-inline'`, `tauri.conf.json:23`). The carried rule in `progress.md` forbids **new** inline `style=`. | R13, R14, R21 |
| T9 | Enable the Inbox tab; "Plan 1's status-bar import buttons keep working"; Library menu | `index.html` tabs are disabled stubs with no shell. The status-bar buttons are in `importer.ts:51-87` (`mountImport`), not in `main.ts` (P:405). `#import-notice` with `say(html)` is the existing toast surface (`importer.ts`, `mountImport` returns `say`). | R15, R17, C5 |
| T10 | `tileBox` "to fit the plate"; `assetUrl(await imagePath(id))` | `tileBox(aspect, tile, region?)` is square-only (`tile.ts:6-9`). `images/` is in the scope (`commands.rs:126-130`). | R20 |
| T11 | Replace the single-technique `filter` | `S.filter: string \| null` (`view.ts` `S`; `renderRanked` uses `S.refs.filter(... === S.filter)`). It matches. | OK |
| T12 | `app/README.md` | Exists. | OK |

---

## 4. Plan mandates a reviewer would call defects

| ID | Task | Defect | Smallest ruling |
|---|---|---|---|
| D1 | T6 `operation_label_needs_whole_words` (P:457) | "Assert there is no … hit whose name, synonyms and description fail the technique rules": the test re-implements the matcher it tests. | Assert the fixed expected id sets: `"out"` → only techniques matched by text (`pop-out`, …), `"lead the eye"` → exactly Sequence's ids. |
| D2 | T6 `min_query_length` (P:460) | `"ab"` "returns a value without panicking" asserts almost nothing. | Assert `"ab"` reaches the matcher, for example a technique whose name holds "ab", or a reference titled "ab…". |
| D3 | T4 `import_still_writes` (P:285) | Not a test; it restates "existing tests pass". | Drop it from the list, or make it "importing `small.jpg` gives a `file` that passes `image_path_in`". |
| D4 | T5 `sniff_skips_without_copy` (P:399) | It requires a read-counting test hook inside `import_one`, a production seam that exists only for a test. "No file created in `images/` or its temp dir" already proves no copy. | Drop the hook clause (**C10**). |
| D5 | T5 `imports_are_serial` (P:386) | Duplicates `import_twice_is_serialised_and_deduped` (`commands.rs:657-670`) and needs another test hook. | Extend the existing test to one `import_bytes` + one `import_paths` (**C10**). |
| D6 | T3 `save_roundtrip_is_value_equal` (P:227) | Duplicates `roundtrip_preserves_fields` (`taxonomy.rs:497-521`). | Route the existing test through `save`/`load`, and add only the "no key absent from the seed" assertion (**C8**). |
| D7 | T1 `new_id` (P:120) | `base36(nanos) + base36(counter)` with no separator is ambiguous, so it can repeat. | `prefix-<nanos36>-<counter36>` (**C7**). |
| D8 | T5 `import_paths` of only duplicates | Records an empty `AddReferences` undo step: Ctrl+Z "does nothing" (**R27**). | Record history only when `added` is non-empty. |

---

## 5. Plan 2 vs SPEC.md

| ID | SPEC | Plan 2 | Severity / ruling |
|---|---|---|---|
| S1 | §3 lists the library folder: `library.json`, `images/`, `thumbs/…`, `taxonomy.json`, `library.bak.json`, `embeddings.bin` | Adds `taxonomy.bak.json` (P:66, P:855) and `.incoming/` (P:366). | `.incoming/` is moot under the **B1** ruling (stage in OS temp). Keep `taxonomy.bak.json`, but amend SPEC §3 on main (one bullet) so Plan 6's integrity check has an authority. **COS (C18).** |
| S2 | §6.8 "Undo and redo cover everything"; Decision 2, "Undoing an import removes the references" | The status-bar import reopens the library, which clears history (B4). | **B4** |
| S3 | §9 "Never lose data"; §11 "It never loses work" | Imports become debounced (P:360 + recipe step 5). Copied images sit in `images/` with no reference on disk for up to 500 ms, and the 982f8a6 rollback guarantee is lost. | **B3** |
| S4 | §9 "the app offers to merge the two" | Merge is offered only when the intake carries a note or sourceUrl the existing reference lacks (P:703). | Consistent with user Decision 1 (P:826). OK |
| S5 | §6.2 "examples from the artist's own library, **or from the demo set**" | `examplesFor` uses only `store.refs` (P:525, P:608). With the demo set off, cards have no examples. | **COS (C19).** Accept, because demo references are in the library when seeded. Note it as a spec delta. |
| S6 | §6.1 "from 1 to about 9" | Hard `MAX_OPS = 9`. | Consistent. OK |
| S7 | §9 / §5a C: nothing is fetched from the web | The paste toast never downloads (P:698). | Consistent. OK |

---

## 6. Findings and suggested rulings

### BLOCK (8)

| ID | Task | Plan | Code | Problem | Smallest ruling (authority) |
|---|---|---|---|---|---|
| **B1** | T5 | P:365-366, P:382-383 | `import.rs:61-76` | `import_bytes` writes to `<root>/.incoming/<name>` and then imports it. Plan 1 `import_paths` skips everything under the root, so **every paste** comes back `Skip::InsideLibrary` and adds nothing. | Stage the bytes in a `tempfile::tempdir()` **outside** the root, keeping the sanitised name so the title stem is unchanged. That drops `.incoming/` from the layout (SPEC §3, S1). The containment tests (P:383) then assert nothing is written outside that temp dir. |
| **B2** | T4 | P:272-275, P:285 | `import.rs:141`, `:249`, `:299` | The guard rejects `image_path_in(root, "")`, which `import.rs:141` uses to get the `images/` dir, so every import fails. The `Drop` guard and the `io::Result` closure cannot use `?`. The plan claims the import paths "always pass the guard". | Add `pub fn images_dir(root) -> PathBuf` (unguarded, no file name) for `:141`. At `:249` map `LibraryError` to `io::Error`; at `:299` use `if let Ok(..)`. List `import.rs` in T4 **Files** (SPEC §9: import must keep working). |
| **B3** | T5 | P:306-313, P:360 | `commands.rs:262-269`; tests `:608-622`, `:624-655` | Routing imports through the debounce breaks two Plan 1 tests (from 982f8a6) that the plan says must still pass. The import no longer errors when the save fails, and the flush-on-open overwrites the tampered newer-version file. | Imports flush synchronously: `apply(AddReferences)`, then `flush`. On `Err`, apply the inverse, record no history and return the Plan 1 error. All other edits stay debounced. Authority: SPEC §9 "Never lose data", §11. |
| **B4** | T5/T7 | P:405, P:699 | `importer.ts:67-70`; `view.test.ts:136-150` | The status-bar import calls `openLibrary` after every import. In Plan 2 that flushes and clears the undo history, so the import cannot be undone. | `importer.ts` calls `store.apply(result.change)` and drops the reopen. The import's warnings stay in `summaryHTML`. Rewrite `view.test.ts:136-150` to assert there is no `openLibrary` call. Authority: SPEC §6.8, Decision 2. |
| **B5** | T5 | P:298, P:367-370, P:390 | `tauri-runtime-wry-2.12.5/src/lib.rs` about `:4259-4273`; `tauri-2.12.7/src/app.rs:90` | **The dialog never shows.** `ExitRequested { code: None }` fires only after the last window is **destroyed**, so the "Couldn't save…" dialog has no window to render in, and `prevent_exit` leaves a windowless process. **Quitting loops.** `exit_without_saving` → `app.exit` → `ExitRequested { code: Some }` → the flush fails again → prevent. | Handle `WindowEvent::CloseRequested` on `main`: flush, and on `Err` call `api.prevent_close()` and emit `save-failed`. Keep `ExitRequested` as a backstop for programmatic exits. `exit_without_saving` sets an `AppState` flag that skips the flush, then calls `exit`. Test the close handler fn (SPEC §9; Review Focus 2). |
| **B6** | T3 | P:205, P:236, P:85 | — | `custom_id_suffix` cannot pass under any `find_by_name`. "Halo-Glow!" must be `NameTaken`, yet "Halo  glow." must not be. Case and whitespace folding misses the first. Punctuation folding (Task 6 `normalise`) also catches the second. | Keep `find_by_name` = case-insensitive and whitespace-collapsed, which is what Review Focus 4 says: "case or spacing". Test: `"HALO  Glow"` → `NameTaken("halo-glow")`, and `"Halo-Glow!"` → `id == "halo-glow-2"`. |
| **B7** | T7 | P:492, P:506-508, P:519, P:530, P:536 | `main.ts:1-6`; `firstrun.ts:13-29`; `view.ts:22-26`, `:409-410`, `:433`, `:447`; `view.test.ts:84`, `:177-210` | The plan builds the `Store` in `main.ts` and strips settings from the view. Plan 1 loads in `boot()` (`firstrun.ts`, not in **Files**). The `Store` lacks `root` (status line, `libraryRoot()` hook) and `warning` (the 982f8a6 notice). An implementer would either regress the warning notice and its tests, or change the `Store` interface that Tasks 8–11 consume. | `boot()` builds the Store, mounts the view with it, and shows `view.warning` through `mountImport`'s `say`. Add `root: string` and `warning?: string` to `Store` (set by `createStore`/`reset`). The view keeps `getSettings` for theme and find-similar, which are not library data. Add `firstrun.ts` and `firstrun.test.ts` to **Files**. Authority: SPEC §9; 982f8a6 Important #2. |
| **B8** | T5 | P:295-299 vs P:312, P:349, P:352-359, P:400, P:407 | `import.rs`, `library.rs:9`, `importer.ts:19` | **Files** omits five files the task must change or create, plus the `hooks` module, which has no file name at all. With a file-scoped brief, the implementer would either stop or skip sniffing, `InsideLibrary` and the contract test. *(R4 holds the detail.)* | Add `import.rs`, `library.rs`, `importer.ts`, `importer.test.ts` (create), `api.contract.test.ts` (create) and `hooks.rs` (create, `pub mod hooks;`) to T5 **Files**. |

### REWORK (27)

| ID | Task | Finding | Ruling |
|---|---|---|---|
| R1 | T2, T4 | `history.rs` and `saver.rs` are created with no `lib.rs` `pub mod` (P:156, P:246-248). `cargo test history::` then runs 0 tests. | Add `lib.rs` to both **Files** lists. |
| R2 | T7 | `mountReference` loses `ready` (P:519), which `view.test.ts:84` awaits. | Keep returning `ready` (resolved) or update the test setup explicitly. |
| R3 | T4/T5 | Saver thread gaps: there is no `Condvar` in `Debounce` (P:258, P:265); after `restore`, `due()` is true, so the thread spins (P:266, P:281); mock tests have no saver thread (P:388). | `AppState` gains `saver: Condvar` paired with `open`, and the recipe calls `notify_one` after `touch`. After a failed flush, wait for the next touch. Expose `start_saver(&AppHandle)`, called by `setup` and by the test `env()`. |
| R4 | T5 | Missing **Files** entries (see B8). Plan 1 Rust tests also need edits: `.0` (`commands.rs:638`, `:719`), `ImportReport` → `.report` (`:332`, `:597`, `:601`, `:706`), and `Skip::Unsupported` → `InsideLibrary` (`import.rs:683-686`). | State these updates in T5 Step 2. |
| R5 | T5 | `LibraryView.taxonomyReadOnly` is asserted (P:398) but not in T5's interface (`commands.rs:52-61`, `api.ts:37-44`). | Add `taxonomy_read_only: bool` (camelCase) to the Rust and TS `LibraryView` in T5 **Interfaces**. |
| R6 | T1/T5 | The `TaxonomyReadOnly` pre-check needs `Edit::touches_taxonomy(&self) -> bool` (recursive over `Batch`), which T1 does not produce. | Add it to T1's interface and test it in `batch_inverse_reverses`. |
| R7 | T3/T5 | `load_with_fallback` has no newer-version check, while `taxonomy.json` carries `version` and `library.rs:183-195` refuses newer files. A Backup or File source could overwrite a newer taxonomy. | Mirror `check()`: when `version > 1`, refuse the open with "This library was saved by a newer version of Horus." (SPEC §9). |
| R8 | T4 | Resetting `recovered_from_backup` needs `save(&mut self)`. That breaks `library.rs:55/65` and the tests at `:246` and `:333`. | Make `save` take `&mut self` and add `mut` at those sites, or reset the flag in `flush`. |
| R9 | T7 | The `matchesQuery` comment (P:524) contradicts T6 and match-case `eyesore` (P:549). | Replace the comment with T6's rules (P:443-448). |
| R10 | T7 | `EXTRA_INKS` values are not given for when Plan 2 creates `ops.ts`. | Cite `2026-11-25-horus-graph-views.md:702`: teal, olive, rose, indigo, umber. |
| R11 | T4 | The new `LibraryError::InvalidFile` breaks the exhaustive `library_error` (`commands.rs:69-88`). | Add an arm: "That image file name is not valid." |
| R12 | T8 | Enter after filtering to one card (P:625 vs P:636). | When the search text is non-empty, highlight the first visible card. |
| R13 | T8/T10 | Key conflicts: digits typed into the search field (P:622), and Plan 1's document handler (`view.ts:373-395`) also fires `v`, `/`, Backspace and Esc inside the picker and lightbox. | `1`–`9` select an operation only when focus is not in a text field. The view's handler returns early for targets inside `.picker`, `.lightbox`, `textarea` and `[contenteditable]`. |
| R14 | T8, T9, T10 | `view.ts` edits are not in **Files**: pinning suspension (P:621), `data-ref-drop` on `#plate` (P:697), and "Open lightbox" / `L` (P:756). | Add `reference/view.ts` (and `view.test.ts`) to each task's **Files**. |
| R15 | T9 | `toast(msg: string)` (P:676) cannot host the note field or the Show/Merge buttons. | `IntakeDeps.notice(html: string)` = `mountImport`'s `say`, with delegated click and submit handlers. Escape all data (the `typed_text_is_text` test). |
| R16 | T9 | Merge as "one undo step per reference" is impossible with a single-field `set_field` when both fields fill. | Accept one step per field, or have `set_field` take `fields: {note?, sourceUrl?}`. Controller decides. |
| R17 | T9 | There is no view switching for the Inbox tab; Plan 3 owns `shell.ts`. | A minimal two-view toggle (`body[data-view]`) in `main.ts`/`boot`, matching Plan 3's `ViewId` names, so Plan 3 can absorb it. |
| R18 | T9 | "→ on the last item shows Inbox is empty" while untagged items remain (P:84, P:710). | → on the last item stays put (no wrap). "Inbox is empty…" appears only when the derived list is empty. |
| R19 | T10 | `openLightbox` has no picker factory parameter, but the test needs one (P:748 vs P:764). | `openLightbox(api, store, refId, deps: { openPicker(opts: PickerOpts): void })`, mirroring `IntakeDeps`. |
| R20 | T10 | `tileBox` is square-only (`tile.ts:6`). | Add `fitBox(aspect, w, h): Box` beside it in `tile.ts` and have `tileBox` call it. |
| R21 | T8, T9, T10 | `progress.md` forbids new inline `style=`, but the picker swatches, windowed-grid tile positions and region outlines would naturally use them. The plan is silent. | Set positions and inks through CSSOM (`el.style.setProperty`) or classes, never through `style=` in `innerHTML`. |
| R22 | T9 | Opening a library calls `store.reset`, but the importer's `libraryRoot()` and the view's focus need the new root. | Covered by B7 (`Store.root`). Listed only so the T9 test asserts it. |
| R23 | T8 | No route opens the picker on an already-tagged reference for a whole-image tag. | Controller decides: add "Tag…" to the Reference view (`t` key) opening `mountPicker({ refId })`, or defer to Plan 4. |
| R24 | T9 | The Library menu makes the old library stay in the asset scope (`commands.rs:123-125` "ponytail" note) reachable. | `install` forbids the previous root's `images/` and `thumbs/` on switch, or the note is accepted explicitly. |
| R25 | T4 | `cargo test saver:: library::` is invalid. | `cargo test -- saver:: library::`. |
| R26 | T5 | Step 2's command does not run T5's `import::` or Vitest tests. | `cargo test` (whole) plus `npm test -- importer api.contract`. |
| R27 | T5 | An all-duplicates import records an empty undo step. | Record history only when `added` is non-empty (D8). |

### COS (22)

| ID | Finding | Ruling |
|---|---|---|
| C1 | Stale line numbers: `library.rs:94` → `:120-123`; `library.rs:108-127` → `:128-148`; `commands.rs:41` → `:45`; `commands.rs:108` → `:118-119`; `import.rs:72` → `:73`; "HEAD `f0b90c4`" → `25be96d` (the IPC rows are still correct). | Update the citations. |
| C2 | P:213 "release builds use panic = abort" is stale: 982f8a6 removed it (`Cargo.toml` comment, `lib.rs:46-55`). | Reword to "nothing panics; imports catch panics per file". |
| C3 | The header paths (P:23) point to `.worktrees/horus-foundation/…` and `.superpowers/sdd/2026-11-24-horus-foundation/progress.md`. In this worktree they are `docs/superpowers/plans/2026-11-24-horus-foundation.md` and `docs/superpowers/ledgers/2026-11-24-horus-foundation-ledger.md`. | Update. |
| C4 | `OPS` map (P:533) is `OP_KEY` (`view.ts:9`). | Rename in the text. |
| C5 | "any import button in `main.ts`" (P:405): the buttons are in `importer.ts:51-87`, and the `firstrun.test.ts:18` fake also returns an `ImportReport`. | Name the right files. |
| C6 | The fixture fix "both None" loses the `branchId` camelCase coverage (`model.rs:83-98`). | Set both `Some` and add `techniqueId` to the expected JSON. |
| C7 | `new_id` has no separator (D7). | Add one. |
| C8 | `save_roundtrip_is_value_equal` duplicates `roundtrip_preserves_fields` (D6). | Merge them. |
| C9 | The serde `Option` rule (P:223) changes nothing at HEAD. | Say so, and keep only the `#[serde(default)]` on `source` and `rationale`. |
| C10 | The `imports_are_serial` and sniff read-counting hooks (D4, D5). | Drop the hooks. |
| C11 | The `esc` source-scan test is a lint written as a test. | Accept, or replace it with a `grep` in Task 12. |
| C12 | The `<b>t</b>.png` title claim is wrong for real Rust (`file_name()`). | The fake returns a reference titled `<b>t</b>` directly. |
| C13 | `dupRows` test is listed under "Library menu". | Move it under Intake. |
| C14 | T12 Step 3 commits notes that no step writes. | Add a "write the notes" step. |
| C15 | "logged warning" with no logging crate; regex notation with no `regex` crate. | `eprintln!`, hand-matched checks, no new crates. |
| C16 | `Field` needs `Deserialize` with camelCase for `"sourceUrl"`. | Add the derive. |
| C17 | The Tauri drop position is in physical pixels. | Divide by `devicePixelRatio` before `elementFromPoint`. |
| C18 | SPEC §3 layout does not list `taxonomy.bak.json` (S1). | Add one bullet to SPEC §3 on main. |
| C19 | SPEC §6.2 demo-set example fallback (S5). | Record it as a spec delta. |
| C20 | Whether the AND/OR filter persists across `show()` (`view.ts:79`) is unspecified. | Keep Plan 1's behaviour: it resets on navigation. |
| C21 | The `AlreadyALibrary` copy says "Use Open an existing library instead." (`commands.rs:72`), but the menu item is "Open library…". | Reword to "Open it instead." and update the 3 test strings (`:525`, `:556`). |
| C22 | Neither T9 nor T10 lists `styles.css`. T9's `npm test -- inbox intake` skips `library-menu`. The T5 contract test's `invoke` spy (P:413) may need `vi.mock("@tauri-apps/api/core")`, since ESM exports cannot be spied on. *Unverified: there is no `node_modules` in this worktree.* | Add `styles.css` to both **Files** lists; run `npm test -- inbox intake library-menu`; use `vi.mock` for the spy. |

### Ledger check

- Plan 2's ownership list (P:25-43) matches the Plan 1 ledger: AGY a2, a3, a4, c1 and c2; the Task 2 minors; Task 3's serde carry; Task 6's search minors; the Task 9 `esc` duplication; and the final review's Important #4 and #5. It also includes the open-hint dead end that ledger line 160 assigns to Plan 2 (P:347-350). Only `2026-11-24-horus-foundation-ledger.md` mentions Plan 2.
- The minors on ledger lines 159-160 have no owner. They are: `is_library` uses `exists()`; a misleading `SubfolderNotEmpty` on retry; a file named "Horus Library"; no ancestor check; orphan files after a failed save; hidden files counting as content; seed save failure untested. Plan 2 correctly does not claim them.
