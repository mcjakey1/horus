# Horus Tagging, Inbox and Undo (Plan 2 of 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An artist can hoard images into the Inbox by drag, paste or folder drop, then tag them fast by keyboard. Tagging uses the plain-English operations, the visual technique picker, an inferred domain, synonym search, "Tag like this", region boxes and inline custom techniques. Every change can be undone, and nothing is lost on exit.

**Architecture:**
- **Rust core (`app/src-tauri/src/`):**
  - All mutations go through `edit::apply`, which validates the change, applies it and returns its inverse.
  - `history` keeps the inverses as an undo/redo stack.
  - `saver` writes `library.json` and `taxonomy.json` on a debounce and flushes both on exit.
  - The commands address tags by `(ref_id, tag_id)` and return a `Change` delta, so the UI never re-reads the whole library.
- **TypeScript UI (`app/src/`):**
  - A small `store` applies each `Change` to the data it holds.
  - Pure functions in `tagging/model.ts` decide what the picker shows.
  - The picker, Inbox, intake and the minimal lightbox are DOM modules, tested with jsdom and a fake `Api`, the same way as Plan 1 Task 8.

**Tech Stack:**
- Plan 1's stack: Tauri 2, Rust (edition 2024 per the Task 1 ruling), TypeScript and Vite, and Vitest with jsdom.
- One new crate, `unicode-normalization` (Task 6), for NFC.
- No new npm packages, except `@tauri-apps/api` features already installed: `webviewWindow.onDragDropEvent` and `core.invoke`, which takes a raw body.

**Spec:** `SPEC.md` (draft 5, approved 24 Nov 2026), §2 (intake), §3, §5 (Inbox), §5a (AND/OR), §6 (all of it) and §9. It builds on Plan 1: `.worktrees/horus-foundation/docs/superpowers/plans/2026-11-24-horus-foundation.md`, as amended, and its ledger `.superpowers/sdd/2026-11-24-horus-foundation/progress.md`.

**Carried from the Plan 1 ledger (owned here):**
- AGY #2 **c1**: IPC addresses tags by `(ref_id, tag_id)`. Done in Task 5.
- **c2**: debounced saves with a flush on exit (Task 4).
- **a2**: the duplicate-merge prompt (Task 9).
- **a3**: AND/OR across techniques in the Ranked filter (Task 11).
- **a4**: drag-drop, paste and sourceUrl at intake (Task 9).
- Task 2 deferred minors, now urgent because saves become frequent:
  - the backup is rewritten in place instead of through `bak.tmp` and a rename;
  - backup rotation is gated on a parse;
  - `recovered_from_backup` stays true after a save;
  - `image_path` joins an untrusted `file` (now exposed by `image_path`);
  - the `model.rs` fixture has `technique_id: None` with `branch_id: Some`.

  All of these are handled in Task 4, except the fixture, which Task 1 fixes.
- Task 3 deferred minors, now due because Plan 2 is the first plan to **save** the taxonomy:
  - a missing optional key must not round-trip as `null`;
  - `BranchTechnique.source` and `rationale` must be filled for in-app links.

  Both are handled in Task 3.

## Global Constraints

- A partial tag carries `operationId` only. A technique tag always sets `techniqueId` and `branchId` together. The branch must contain the technique, and its `operationId` must equal the tag's (SPEC §3).
- The Inbox is derived, never stored: a reference with zero tags is in the Inbox (SPEC §3).
- Intake never asks the artist to classify an image. An optional short note is offered and never required (SPEC §2).
- "Undo and redo cover everything" (SPEC §6.8): every change to `library.json` or `taxonomy.json` made through the UI is one undoable step.
- **Operations and domains are data, not constants.** This follows the user's Plan 3 decision: operations can be renamed, added and deleted, and new domain types are allowed.
  - The picker shows one button per `taxonomy.operations` entry, in taxonomy order. Each button shows its `plainLabel` (serif) and its `name` (mono). With the seed, these are "Stand out", "Hold together", "Lead the eye" and "Make them think", beside the reel names (SPEC §6.1, §7).
  - There are 1 to 9 operations (Plan 3's `MAX_OPS = 9`). Number keys `1`–`9` map to the shown order, so every operation has a key.
  - No Plan 2 code, test assertion or CSS may assume exactly 4 operations or the 6 seed domains. Seed ids may appear only in seed-fixture tests.
  - **Operation colour comes from Plan 3's `opInk`** (Plan 3 Task 2, `app/src/ops.ts`):
    - an `operation.color` from `EXTRA_INKS` maps to `var(--x-<color>…)`;
    - otherwise a seed id maps to its DESIGN.md ink;
    - otherwise the neutral ink is used.

    **Labels come from `opLabel`,** which this plan adds to the same file.
- **IPC naming** (`CROSS-PLAN-AUDIT.md` #1): JS `invoke` argument keys are the camelCase form of the Rust parameter names, which is Tauri v2's default (`ref_id` → `refId`, `tag_id` → `tagId`, `ref_ids` → `refIds`). The `api.contract.test.ts` suite (Task 5) pins every command's name and keys against `tauriApi`, so a wrong key fails a test instead of failing only in the running app.
- The domain is inferred and shown as a muted chip. The app asks for the domain only when `branches_for(operation, technique)` returns more than one branch (SPEC §6.3).
- A custom technique is saved with `custom: true` (SPEC §3).
- Regions are `{x, y, w, h}` in 0..1 of the original image (SPEC §3).
- The app works offline. A `sourceUrl` is stored as text and never fetched (SPEC §9, §5a C is later).
- Saves stay atomic, as in Plan 1: write `.tmp`, call `sync_all`, then rename. `library.bak.json` is rotated before each `library.json` save, and **`taxonomy.bak.json` is rotated before each `taxonomy.json` save** (Plan 1 final review). One added file in the folder layout is worth it: a damaged `taxonomy.json` must never lock the artist out of a library whose references are intact. Originals are never modified.
- The keyboard flow (SPEC §6.8):
  - number keys pick the operation;
  - typing searches;
  - Enter applies;
  - the arrow keys move to the next or previous Inbox item;
  - Ctrl+Z (⌘Z) undoes, and Ctrl+Shift+Z, Ctrl+Y (⌘⇧Z) redo.
- UI tokens, type and copy follow `prototype/styles.css`, `DESIGN.md` and the Plan 1 Task 8 port. No new colours.

## Review Focus

1. **Ctrl+Z while typing in a text field**, such as the search box, the note or the new-technique name. This must undo the text, as the browser does natively, and never undo a library change. Tested in Task 7.
2. **The app is closed, or another library is opened, within the debounce window, or that final save fails.**
   - The pending changes are flushed first.
   - If a flush on exit fails, the app stays open and asks: "Couldn't save your last changes: <reason>.", with the choices "Try again" and "Quit without saving".
   - If a flush on a library switch fails, the switch is refused and the error is shown.

   Tested in Tasks 4 and 5.
3. **The last Inbox item gets tagged, or an item gains its first tag mid-flow.** The item stays on screen until the artist moves on. → on the last item shows "Inbox is empty" and never wraps or throws. Tested in Task 9.
4. **A new custom technique has the same name as an existing one**, differing only in case or spacing. No duplicate is created. The picker offers the existing technique instead. Tested in Tasks 3 and 8.
5. **The paste holds no image**: only a URL, text or HTML that points to an image online. Nothing is imported and nothing is downloaded. A toast says "Paste the image itself — Horus doesn't download from the web." Tested in Task 9.

---

### Task 1: The `edit` module (validated edits that return their inverse)

**Files:**
- Create: `app/src-tauri/src/edit.rs`.
- Modify:
  - `app/src-tauri/src/lib.rs` (`pub mod edit;`);
  - `app/src-tauri/src/model.rs`: fix the test fixture so `technique_id` and `branch_id` are both `None`, per the Task 2 deferred minor.

**Interfaces:**
- Consumes `LibraryData`, `Reference` and `Tag` (Plan 1 Task 2), plus `Taxonomy`, `Technique`, `BranchTechnique` and `Taxonomy::branches_for` (Plan 1 Task 3).
- Produces:
  ```rust
  pub enum Field { Note, SourceUrl }          // no title/creator/year/credit editing in Plan 2; whether any plan adds it is open (CROSS-PLAN-AUDIT.md #23)
  pub enum Edit {
      AddTags { ref_id: String, tags: Vec<Tag> },                       // appended in order
      RemoveTags { ref_id: String, removed: Vec<(usize, Tag)> },        // original positions, ascending
      ReplaceTag { ref_id: String, before: Tag, after: Tag },           // same id
      SetField { ref_id: String, field: Field, before: Option<String>, after: Option<String> },
      AddReferences { refs: Vec<Reference> },
      RemoveReferences { removed: Vec<(usize, Reference)> },
      AddTechnique { technique: Technique, links: Vec<BranchTechnique> },
      RemoveTechnique { index: usize, technique: Technique, links: Vec<BranchTechnique> },
      Batch(Vec<Edit>),
  }
  pub struct Touched { pub ref_ids: Vec<String>, pub removed_ref_ids: Vec<String>, pub taxonomy: bool }
  pub struct Applied { pub inverse: Edit, pub touched: Touched }
  pub enum EditError { UnknownReference(String), UnknownTag(String), InvalidTag(String), InUse(String), DuplicateId(String) }
  pub fn apply(data: &mut LibraryData, tax: &mut Taxonomy, e: Edit) -> Result<Applied, EditError>;
  pub fn validate_tag(tax: &Taxonomy, t: &Tag) -> Result<(), EditError>;
  pub fn new_id(prefix: &str) -> String;   // prefix + "-" + base36(unix nanos) + base36(process-wide AtomicU64); never repeats in-process
  ```
  - `apply` is atomic. If any part of a `Batch` fails, the parts already applied are reverted before the `Err` returns, so the data stays exactly as it was.
  - The inverse of a `Batch` is a `Batch` of the inverses in reverse order.
  - `RemoveTechnique` fails with `InUse` while any tag still references the technique.
  - All of these derive `Clone, Debug, PartialEq`.

- [ ] **Step 1: Write the failing tests.** Each test builds a 2-reference `LibraryData` and loads the bundled seed taxonomy through `env!("CARGO_MANIFEST_DIR")`.
  - `add_then_inverse_restores`: applying `AddTags` and then its `inverse` leaves `data` equal to a clone taken before, and `touched.ref_ids == [ref_id]`.
  - `remove_inverse_restores_positions`: removing the tag at index 1 of 3 and then applying the inverse gives the original order.
  - `technique_tag_needs_matching_branch`: `validate_tag` returns `InvalidTag` in four cases:
    - a technique without a branch;
    - a branch without a technique;
    - branch `sequence.feature` with technique `pop-out`, which sits only under `differentiate.feature`;
    - `operation_id: "group"` with branch `differentiate.feature`.
  - `partial_tag_is_valid`: `{operation_id: "infer", technique_id: None, branch_id: None}` returns `Ok`.
  - `region_bounds`: `w = 0`, `x + w > 1` and a negative `y` each return `InvalidTag`, and `{x: 0, y: 0, w: 1, h: 1}` returns `Ok`.
  - `unknown_ref_is_error_and_data_unchanged`.
  - `batch_failure_rolls_back`: a `Batch` of a valid `AddTags` followed by `AddTags` on an unknown ref returns `Err`, and `data` equals the snapshot.
  - `batch_inverse_reverses`: applying `Batch([AddTechnique, AddTags using it])` and then its inverse restores both `data` and `tax`.
  - `remove_technique_in_use_fails`.
  - `duplicate_tag_id_rejected`: `AddTags` with an id already on that reference returns `DuplicateId`.
  - `new_id_unique`: 10,000 calls give 10,000 distinct strings, all starting with the prefix.

- [ ] **Step 2: Run the tests to check they fail.** Run `cargo test edit::`. Expected: compile errors.

- [ ] **Step 3: Implement `edit.rs`.** `apply` matches on the variant, validates first and then mutates. `Batch` applies its parts in order and keeps a list of their inverses, to unwind them on error. Tags are validated against `tax` as it is at that point in the batch, so a technique added earlier in the same batch is valid.

- [ ] **Step 4: Run the tests to check they pass.** Run `cargo test edit::`. Expected: 11 PASS. Run `cargo test` as well. Expected: all Plan 1 tests still pass.

- [ ] **Step 5: Commit.** Commit message: `feat(core): validated, invertible edits for tags, fields, references and techniques`.

---

### Task 2: The `history` module (undo and redo)

**Files:**
- Create: `app/src-tauri/src/history.rs`.

**Interfaces:**
- Consumes `edit::{apply, Edit, Applied, Touched, EditError}` (Task 1).
- Produces:
  ```rust
  pub const HISTORY_CAP: usize = 200;
  pub struct History { /* undo: Vec<Edit>, redo: Vec<Edit> — each holds the edit to apply next */ }
  impl History {
      pub fn new() -> History;
      pub fn record(&mut self, inverse: Edit);                    // clears redo; drops the oldest past HISTORY_CAP
      pub fn undo(&mut self, data: &mut LibraryData, tax: &mut Taxonomy) -> Result<Option<Touched>, EditError>;
      pub fn redo(&mut self, data: &mut LibraryData, tax: &mut Taxonomy) -> Result<Option<Touched>, EditError>;
      pub fn can_undo(&self) -> bool;
      pub fn can_redo(&self) -> bool;
      pub fn clear(&mut self);
  }
  ```
  - `undo` pops from the undo stack, applies the edit, and pushes the returned inverse onto the redo stack. `redo` does the mirror image.
  - With an empty stack, both return `Ok(None)`.
  - On `Err`, the popped entry goes back where it was, so the history is unchanged.
  - History lives only in memory. It is cleared on `open_library` and `create_library`, and is not kept across restarts.

- [ ] **Step 1: Write the failing tests**
  - `undo_redo_roundtrip`: after two `AddTags` and two `undo` calls, `data` equals the start. Then two `redo` calls give `data` equal to the state after both adds.
  - `new_edit_clears_redo`: after an undo followed by `record`, `can_redo()` is false.
  - `cap_drops_oldest`: after 201 records, `undo` succeeds exactly 200 times, and the 201st call returns `Ok(None)`.
  - `empty_is_none`: `undo` on a new `History` returns `Ok(None)` and leaves `data` unchanged.
  - `failed_undo_keeps_entry`: corrupt `data` by removing the reference the top entry targets. `undo` returns `Err`, and `can_undo()` is still true.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test history::`. It should FAIL, then PASS (5 tests).

- [ ] **Step 3: Commit.** Commit message: `feat(core): bounded undo/redo history over invertible edits`.

---

### Task 3: Saving the taxonomy, and custom techniques

**Files:**
- Modify: `app/src-tauri/src/taxonomy.rs`.

**Interfaces:**
- Consumes `Taxonomy` (Plan 1 Task 3), and `edit::Edit::AddTechnique` and `edit::new_id` (Task 1).
- Produces:
  ```rust
  impl Taxonomy {
      pub fn save(&self, path: &Path) -> std::io::Result<()>;   // atomic: NamedTempFile::new_in(parent), write, sync_all, persist;
                                                                // first rotates <dir>/taxonomy.bak.json (via .tmp + rename) from the current file, only if it parses
      pub fn load_with_fallback(root: &Path, seed: &Path) -> Result<(Taxonomy, TaxSource), String>;
      pub fn find_by_name(&self, name: &str) -> Option<&Technique>;   // case-insensitive, whitespace-collapsed
      pub fn custom_technique(&self, name: &str, description: &str, operation_id: &str, domain_id: &str)
          -> Result<Edit, CustomError>;                         // builds Edit::AddTechnique, does not apply it
  }
  pub enum CustomError { NameTaken(String /* existing id */), EmptyName, NoSuchBranch }
  pub enum TaxSource { File, Backup, SeedReadOnly }
  // load_with_fallback: taxonomy.json; if it can't be read or parsed -> taxonomy.bak.json (Backup);
  // if that fails too -> the bundled seed (SeedReadOnly). Err only when all three fail (a broken install):
  // install() then refuses the open with that message; nothing panics (release builds use panic = "abort").
  ```
  - `custom_technique` builds the technique like this:
    - `id` is the slugified name, with `-2`, `-3` and so on appended when taken;
    - `icon` is `""`;
    - `synonyms` is `[]`;
    - `citation` is `None`;
    - `examples` is `[]`;
    - `custom` is `true`.
  - It adds one link: `BranchTechnique { branch_id: "<op>.<domain>", technique_id, source: "drafted", rationale: "Added by the artist in the tag picker." }`. The branch must already exist; Plan 2 never creates branches.
  - Serde for `Option` fields becomes `#[serde(default, skip_serializing_if = "Option::is_none")]` only where the seed omits the key. `color` and `citation`, which the seed writes as explicit `null`, must still write `null`. Settle this with the round-trip test below, not by guessing.
  - `BranchTechnique.source` and `rationale` get `#[serde(default)]` (AGY #2 Task 3 carry).

- [ ] **Step 1: Write the failing tests**
  - `save_roundtrip_is_value_equal`: load the seed, save it to a temp dir and reload it. The two parse to equal `serde_json::Value`. No key that is absent from the seed file appears in the saved file.
  - `custom_technique_is_custom_and_linked`: `custom_technique("Halo glow", "A soft ring of light around the subject.", "differentiate", "feature")` gives an `Edit::AddTechnique` whose technique has `custom == true` and `id == "halo-glow"`, with one link to `differentiate.feature`. After `edit::apply`, `validate()` is `Ok`.
  - `custom_name_collision`: `"  chiaroscuro "` and `"CHIAROSCURO"` both return `NameTaken("chiaroscuro")`.
  - `custom_unknown_branch`: `("x", "", "group", "semantic")` returns `NoSuchBranch`, because Group → Semantic was dropped from the seed.
  - `taxonomy_backup_rotates`: after two `save`s, `taxonomy.bak.json` equals the first saved version, and no `.tmp` remains. A `save` over an unparseable `taxonomy.json` leaves the existing `taxonomy.bak.json` untouched.
  - `damaged_taxonomy_falls_back`:
    - Write `{` into `taxonomy.json`. `load_with_fallback` returns the backup's taxonomy with `TaxSource::Backup`.
    - Corrupt both files. It returns the seed with `TaxSource::SeedReadOnly`.
    - With all three unreadable (the seed path missing too), it returns `Err`, and nothing panics.
  - `custom_id_suffix`: if `halo-glow` exists, a second "Halo-Glow!" is a `NameTaken`. But a name that slugifies to the same id without collapsing to the same name, such as "Halo  glow." against "Halo glow", gets `id == "halo-glow-2"`.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test taxonomy::`. It should FAIL, then PASS, and the Plan 1 taxonomy tests must still pass.

- [ ] **Step 3: Commit.** Commit message: `feat(core): atomic taxonomy save and inline custom techniques`.

---

### Task 4: The debounced `saver` and backup hardening

**Files:**
- Create: `app/src-tauri/src/saver.rs`.
- Modify: `app/src-tauri/src/library.rs`.

**Interfaces:**
- Consumes `Library::save` (Plan 1 Task 2) and `Taxonomy::save` (Task 3).
- Produces:
  ```rust
  pub const SAVE_DEBOUNCE_MS: u64 = 500;
  pub struct Debounce { delay: Duration, last_touch: Option<Instant>, dirty_library: bool, dirty_taxonomy: bool }
  impl Debounce {
      pub fn new(delay: Duration) -> Debounce;
      pub fn touch(&mut self, now: Instant, library: bool, taxonomy: bool);
      pub fn due(&self, now: Instant) -> bool;                   // dirty && now - last_touch >= delay
      pub fn take(&mut self) -> (bool, bool);                    // returns and clears the dirty flags
      pub fn restore(&mut self, library: bool, taxonomy: bool);  // re-mark after a failed save
  }
  pub fn flush(lib: &mut Library, tax: &Taxonomy, d: &mut Debounce) -> Result<(), String>;  // saves what is dirty now
  ```
  - Task 5 drives the timer with **one app-wide saver thread**, started in `setup`. It waits on a `Condvar` that `touch` notifies, with a timeout until `due`. When the deadline passes, it takes the state lock and calls `flush` on whatever library is open at that moment. Saves are therefore serialised through the existing `Mutex`, which covers the Task 2 minor about the fixed tmp name, and switching libraries never leaves a stray thread. The thread stops when the app exits.
  - On failure, `flush` restores the dirty flags and returns the error. The thread emits `save-status` `{ ok: false, message }`, and the next touch tries again.
  - Changes in `library.rs`:
    - The backup is written to `library.bak.json.tmp` and then renamed (the deferred minor at `library.rs:94`).
    - When `library.json` can't be read (locked) rather than can't be parsed, the rotation is skipped with a logged warning instead of failing silently.
    - `recovered_from_backup` is reset to `false` after a successful `save`.
    - **The guard lives in the free functions, which every caller goes through** (audit #9):
      - `pub fn image_path_in(root: &Path, file: &str) -> Result<PathBuf, LibraryError>` returns the new variant `LibraryError::InvalidFile(String)` unless `file` matches `^[0-9a-f]{64}\.[a-z0-9]{2,5}$`.
      - `pub fn thumb_path_in(root: &Path, hash: &str, size: u32) -> Result<PathBuf, LibraryError>` does the same unless `hash` matches `^[0-9a-f]{64}$` and `size` is 256 or 1024.
      - `Library::image_path` and `Library::thumb_path` call them and return the same `Result`. Today all four are public and unguarded (`library.rs:108-127`).
    - Update the Plan 1 callers (Task 7's thumb paths and the `import` tests) and any test fixture whose `file` is not a hash name, such as `"r1.jpg"`, to use a 64-hex name.

- [ ] **Step 1: Write the failing tests**
  - `debounce_waits_for_quiet`: touch at t0, then at t0+300ms. `due(t0+600ms)` is false and `due(t0+800ms)` is true, because the window counts from the last touch.
  - `debounce_not_due_when_clean`: `due` is false after `take`.
  - `flush_saves_only_dirty`: with only the taxonomy dirty, `library.json`'s mtime and bytes are unchanged and `taxonomy.json` holds the new technique.
  - `flush_failure_restores_dirty`: make `library.json.tmp` a directory, as in Plan 1's test. `flush` returns `Err`, and `due` is still true once the delay has passed.
  - `backup_written_via_tmp`: after `save`, there is no `library.bak.json.tmp`, and `library.bak.json` equals the previous contents.
  - `recovered_flag_clears_after_save`.
  - `image_path_rejects_traversal`: `file = "../../evil.jpg"` returns `Err` from both `Library::image_path` and `image_path_in`. `thumb_path_in(root, "../x", 256)` and `thumb_path_in(root, <valid hash>, 512)` return `Err`.
  - `import_still_writes`: after the change, every existing `import::` test passes. `import` builds its paths from the hash it computed, so its paths always pass the guard.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test saver:: library::`. It should FAIL, then PASS, and all Plan 1 library tests must still pass.

- [ ] **Step 3: Commit.** Commit message: `feat(core): debounced saves with dirty tracking; harden backup rotation`.

---

### Task 5: Tagging, undo and intake commands

**Files:**
- Modify:
  - `app/src-tauri/src/commands.rs`;
  - `app/src-tauri/src/lib.rs`: register the new commands, start the one app-wide saver thread in `setup` (Task 4), and handle `RunEvent::ExitRequested`;
  - `app/src/api.ts`: add types and wrappers.

**Interfaces:**
- Consumes Tasks 1–4, and from Plan 1 Task 7: the state, `LibraryView`, `ReferenceView` (`commands.rs:41`), `import_paths` and `correlate::Index::build`.
  - `ReferenceView` is the real Rust name (audit #18). Its fields are private, so add `ReferenceView::new(lib: &Library, r: Reference) -> Result<ReferenceView, LibraryError>`. In TypeScript it stays `Reference`, as in Plan 1's `api.ts`.
- **The state** (audit #8): `AppState` keeps its existing `import_gate`, `settings`, `config_dir`, `seed_taxonomy` and `demo_dir` fields (`demo_dir` is the bundled demo set from Plan 1 Task 9). Plan 1's lock order stays: import gate, then settings, then state. Only `open` changes, to `Mutex<Option<Open>>`, where `Open { lib: Library, tax: Taxonomy, index: Index, history: History, debounce: Debounce }`.
  - **Both** import commands, `import_paths` and `import_bytes`, hold `import_gate` for their whole run. Imports therefore stay one at a time, as the Plan 1 ledger requires, because the temporary thumbnail names are fixed per hash.
- Every mutating command follows the same steps:
  1. build an `Edit`;
  2. call `edit::apply`;
  3. call `history.record(inverse)`;
  4. rebuild `index` if tags or references changed;
  5. call `debounce.touch`;
  6. call `hooks::after_change(&app, &change)`. It is a no-op in Plan 2. Plan 5 registers its index trigger there (audit #11), so every route that adds references triggers indexing: import, paste, redo and recovery;
  7. return the `Change`.
- Produces these commands. All of them return `Result<_, String>`, and all JSON is camelCase:
  ```
  add_tags(ref_id: String, tags: Vec<NewTag>) -> Change          // one undo step for the whole list ("Tag like this")
  update_tag(ref_id: String, tag_id: String, tag: NewTag) -> Change   // ReplaceTag; always sets suggested:false (editing confirms a suggestion)
  remove_tag(ref_id: String, tag_id: String) -> Change
  set_field(ref_ids: Vec<String>, field: "note"|"sourceUrl", value: Option<String>) -> Change  // one Batch = one undo step for all ids; trims; "" -> None
  add_technique(t: NewTechnique, tag: Option<TagFor>) -> Change  // with a tag: Batch([AddTechnique, AddTags]) = one undo step; Change.created = new id; Err "NameTaken:<id>"
  undo() -> Change
  redo() -> Change
  image_path(ref_id: String) -> String                           // absolute, for the lightbox
  import_paths(paths: Vec<String>, note: Option<String>, source_url: Option<String>) -> ImportResult
  import_bytes(<raw body>) -> ImportResult                       // header x-meta: percent-encoded JSON {name, note?, sourceUrl?}
  retry_save() -> ()                                             // flush again after a failed exit save
  exit_without_saving() -> ()
  ```
  ```rust
  pub struct NewTag { pub operation_id: String, pub technique_id: Option<String>, pub branch_id: Option<String>, pub region: Option<Region> }
  pub struct NewTechnique { pub name: String, pub description: String, pub operation_id: String, pub domain_id: String }
  pub struct TagFor { pub ref_id: String, pub region: Option<Region> }   // the tag gets operation, technique and branch from the new technique
  pub struct Change { pub references: Vec<ReferenceView>, pub removed: Vec<String>, pub taxonomy: Option<Taxonomy>,
                      pub created: Option<String>, pub can_undo: bool, pub can_redo: bool }
  pub struct ImportResult { pub report: ImportReport, pub change: Change }
  ```
  - Rust assigns each tag `id: new_id("t")` and `suggested: false`.
  - `open_library` and `create_library` first call `flush` on the library that is open. On `Err`, they return `Err("Couldn't save the current library: <reason>")` and leave it open.
  - **A damaged taxonomy never blocks opening** (Plan 1 final review, item 3). Plan 1's `install` fails the whole open on an unparseable `taxonomy.json` (`commands.rs:108`). It now calls `Taxonomy::load_with_fallback` instead.
    - **`Backup`:** the `LibraryView.warning` says "taxonomy.json could not be read, so Horus opened its backup (taxonomy.bak.json). Your most recent technique changes may be missing."
    - **`SeedReadOnly`:** the warning says "The library's technique list (taxonomy.json) is damaged and has no usable backup. Horus is showing the starting technique list; your file has been left untouched."
      - The taxonomy is then **read-only**, and the saver never writes `taxonomy.json`, so the damaged file and any custom techniques in it stay recoverable.
      - **It is enforced once, in the shared mutating-command recipe:** step 2 refuses with `Err("TaxonomyReadOnly")` any `Edit` that would set `Touched.taxonomy` while `tax_source == SeedReadOnly`. This covers `add_technique` here and every Plan 3 Task 9 taxonomy edit, with no per-command checks.
      - Plan 3's UI shows the error as a toast: "The technique list is read-only because taxonomy.json is damaged."
      - Tagging still works. A tag whose technique is missing from the seed is shown as an unknown technique and keeps its ids.
    - `Open` gains `tax_source: TaxSource`.
  - **Opening the parent folder** (Plan 1 final fix wave): Plan 1's `create` puts a library in `<folder>/Horus Library` when the picked folder isn't empty (`library.rs`, `SUBFOLDER`).
    - `open_library(path)` therefore first tries `path`.
    - Only if that fails with `LibraryError::NotALibrary`, and `path/Horus Library` holds a library, does it open that instead, with the subfolder as `view.root`. `SUBFOLDER` becomes `pub`.
    - This covers both the first-run "Open an existing library" and the Library menu.
  - **Switching libraries** needs no new command (item 2). Plan 1's `install` already writes the new root to `lastLibrary` (`commands.rs` `install`) on every open and create. So switching updates it, and **no `{ lastLibrary: null }` clear path is needed**. If the last library fails to open at start-up, Plan 1's first-run screen already handles it.
  - **Import sniffing** (Plan 1 final review minor):
    - `import::import_one` reads the first 64 bytes of the source and checks them with `image::guess_format` before `copy_and_hash`.
    - It accepts only `matches!(fmt, ImageFormat::Jpeg | ImageFormat::Png | ImageFormat::WebP | ImageFormat::Tiff | ImageFormat::Gif)`, the decoders enabled in `Cargo.toml`. `guess_format` also recognises BMP, ICO, TGA, AVIF and QOI, which would otherwise still be copied before failing to decode.
    - An unsupported type (PSD, video, PDF) is skipped as `Skip::Unsupported` without copying the file.
    - Today the file is copied fully and only then rejected.
  - **`Skip::InsideLibrary`** (Plan 1 final review minor):
    - It replaces `Skip::Unsupported("inside the library")` (`import.rs:72`).
    - Plan 1's `src/importer.ts:19` switches on the variant's `kind` instead of matching the `"inside the library"` string.
  - `import_paths` and `import_bytes` do not block, as in Plan 1. The import runs off the lock. The new references then get `note` and `source_url`, and are appended as a single `Edit::AddReferences`, so undo removes them from the library. The image files stay in `images/`, and re-importing them dedupes back to the same hash.
  - **`import_bytes`** (audit #7):
    - **Metadata header:** an HTTP header carries only ASCII, so the metadata travels as one header, `x-meta`, holding `encodeURIComponent(JSON.stringify({ name, note, sourceUrl }))`.
    - Rust decodes it with a small `percent_decode(&str) -> Result<String, String>` helper in `commands.rs`, then `serde_json`. A malformed value is an `Err`, not a panic.
    - **Name:** only the last path component is kept (`Path::new(&name).file_name()`). The characters `< > : " / \ | ? *` and control characters become `_`, and an empty result becomes `pasted.png`.
    - **Write:** the body is written to `<root>/.incoming/<that name>` through a `.tmp` file, then imported (the reference title is that name's stem), then deleted.
    - `.incoming/` is created on demand and emptied on open. Together with `taxonomy.bak.json` (Task 3), it is one of this plan's two additions to the folder layout.
  - `ExitRequested`:
    1. Call `flush`.
    2. On `Err`, call `api.prevent_exit()` and emit `save-failed { message }`.
    3. The UI's dialog, "Couldn't save your last changes: <reason>.", offers "Try again", which calls `retry_save` and then exits on `Ok`, and "Quit without saving", which calls `exit_without_saving`.

- [ ] **Step 1: Write the failing tests** using `tauri::test::mock_builder()`, as in Plan 1 Task 7:
  - `add_tags_then_undo_redo`: on a library with `small.jpg` imported:
    - `add_tags` of a technique tag returns `can_undo: true` and the reference with 1 tag.
    - `undo` returns that reference with 0 tags and `can_redo: true`.
    - `redo` gives the tag back with the same id.
  - `update_tag_confirms_suggestion`: a tag with `suggested: true` comes back with `suggested: false` after `update_tag`.
  - `invalid_tag_is_err_and_no_history`: `add_tags` with branch `group.grouping` and technique `pop-out` returns `Err`, and `undo()` then returns `can_undo: false`.
  - `custom_technique_then_undo_restores_taxonomy`: `add_technique` with `tag: Some` returns `taxonomy: Some`, `created: Some("halo-glow")` and the reference with the new tag. **One** `undo` removes both the tag and the technique.
  - `set_field_many_is_one_step`: `set_field([a, b, c], "note", Some("harbour"))` sets all three notes, and one `undo` clears all three.
  - `import_with_note_and_undo`: `import_paths([small.jpg], Some("rim light ref"), Some("https://example.org/a"))` stores both fields. `undo` puts the id in `removed`, and the image file still exists.
  - `import_bytes_roundtrip`: the raw bytes of `small.jpg`, with `x-meta` naming `pasted.jpg`, give one reference, and `.incoming/` is empty afterwards.
  - `import_bytes_name_is_contained`: a `name` of `"../../evil.jpg"` or `"C:\\x\\evil.jpg"` writes nothing outside `.incoming/`, and the reference title is `"evil"`.
  - `import_bytes_unicode_name`: `x-meta` carrying `{"name":"Étude.png"}`, percent-encoded, gives the title `"Étude"`. A malformed `x-meta` (`"%ZZ"`) returns `Err` without panicking.
  - `percent_decode_cases`: `"%C3%89tude"` gives `"Étude"`, `"a%20b"` gives `"a b"`, and `"%E"` is an `Err`.
  - `imports_are_serial`: an `import_bytes` started while a slow `import_paths` holds `import_gate` waits for it. A test hook records that the two never overlap.
  - `after_change_hook_fires`: a test hook registered on `hooks::after_change` sees one call per mutating command, including undo and redo, each with the returned `Change`.
  - `debounced_save_lands`: after `add_tags`, `library.json` on disk does not hold the tag immediately. After 700 ms it does. Use a polling loop with a 2 s timeout, not a bare sleep.
  - `exit_flushes_pending`: after `add_tags` and an immediate call to the exit handler's flush function, `library.json` holds the tag.
  - `exit_save_failure_keeps_app_open`: when `library.json.tmp` is a directory, the exit handler returns "prevent exit", and `retry_save` returns `Err` with the reason (Review Focus 2).
  - `open_clears_history`: after `add_tags`, then `open_library` on the same path, `undo()` returns `can_undo: false`.
  - `open_falls_back_to_horus_library_subfolder`:
    - `create_library(pics, false)` on a non-empty `pics` puts the library in `pics/Horus Library` (Plan 1). Then `open_library(pics)` succeeds, with `view.root == pics.join("Horus Library")`.
    - A `pics` with no subfolder still returns the "not a Horus library" error.
    - A `pics` that is itself a library opens `pics`, not the subfolder.
  - `damaged_taxonomy_opens`:
    - With `taxonomy.json` set to `{` and a good `taxonomy.bak.json`, `open_library` succeeds with the backup warning.
    - With both files damaged, it succeeds with the read-only warning and `taxonomyReadOnly: true`. `add_technique` then returns `Err("TaxonomyReadOnly")`, and so does a fake taxonomy-touching `Edit` sent through the shared recipe. After a tag edit and 1 s, `taxonomy.json` is still byte-identical.
  - `sniff_skips_without_copy`: `fake.psd`, and a minimal valid BMP that `guess_format` recognises, both give `Skip::Unsupported`, and no file is created in `images/` or its temp directory. A source opened by a test hook that counts reads past byte 64 is read no further.
  - `inside_library_variant`: importing `<root>/images` gives `Skip::InsideLibrary`, which serialises as `{"kind":"insideLibrary"}`. Plan 1 has no `importer.test.ts`, so **create** `app/src/importer.test.ts` with this case: a report carrying `Skip { kind: "insideLibrary" }` renders "already inside the library folder", and `"unsupported"` renders "not a supported image type".
  - `switch_flushes_pending`: `add_tags` on library A, then an immediate `open_library(B)`. A's `library.json` holds the tag. With A's `library.json.tmp` made a directory, `open_library(B)` returns `Err` and A stays open.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test commands::`. It should FAIL, then PASS.

- [ ] **Step 3: Extend `api.ts`.** Add `NewTag`, `NewTechnique`, `TagFor`, `Change` and `ImportResult`, and one wrapper per new command. `importPaths(paths: string[], meta?: { note?: string; sourceUrl?: string }): Promise<ImportResult>` keeps `meta` optional. Update every Plan 1 caller and fake of `importPaths` (Task 8's `view.test.ts` fake `Api`, and any import button in `main.ts`) to read `.report` from the new result. `importBytes(name: string, bytes: ArrayBuffer, meta: { note?: string; sourceUrl?: string })` calls `invoke("import_bytes", bytes, { headers: { "x-meta": encodeURIComponent(JSON.stringify({ name, ...meta })) } })`. Also add `onSaveStatus(cb)` and `onSaveFailed(cb)`, using `listen`. Add `| { kind: "insideLibrary" }` to the TS `Skip` union in `api.ts` (Task 5's new variant), so `importer.ts` type-checks when it switches on `kind`.

- [ ] **Step 3a: Add the IPC contract test, `app/src/api.contract.test.ts`** (audit #1).
  - It uses `mockIPC((cmd, args) => …)` and `clearMocks` from `@tauri-apps/api/mocks`.
  - It holds one table row per command, giving the command name and its sorted argument keys:
    - **Plan 1, checked against the real Plan 1 HEAD `f0b90c4`** (`app/src/api.ts`, `src-tauri/src/commands.rs`): `create_library` [`path`, `seedDemo`], `open_library` [`path`], `get_taxonomy` [], `related` [`id`], `search` [`q`], `get_settings` [], `set_settings` [`s`] (a `Partial<Settings>` patch), `system_ram_gb` [] (`systemRamGb` in `api.ts`).
    - **This plan:** `add_tags` [`refId`, `tags`], `update_tag` [`refId`, `tag`, `tagId`], `remove_tag` [`refId`, `tagId`], `set_field` [`field`, `refIds`, `value`], `add_technique` [`t`, `tag`], `undo` [], `redo` [], `image_path` [`refId`], `import_paths` [`note`, `paths`, `sourceUrl`], `retry_save` [], `exit_without_saving` [].
  - For each row, it calls the matching `tauriApi` wrapper with sample values, and asserts the command name and `Object.keys(args).sort()`.
  - **`import_bytes`:** the test spies on `invoke` from `@tauri-apps/api/core` and asserts the raw `ArrayBuffer` payload, plus an `x-meta` header that decodes back to `{ name, note, sourceUrl }`.
  - **Later plans** (3, 4, 5 and 6) add their own rows in their own api steps. A wrapper with no row fails the test: the test enumerates `Object.keys(tauriApi)` and requires a row for every key not in `NON_IPC_KEYS`.
  - `NON_IPC_KEYS` holds the members that make no plain, own-command `invoke` call:
    - `assetUrl` (`convertFileSrc`);
    - the event listeners (`onSaveStatus`, `onSaveFailed`, and later ones such as Plan 5's `onSimilarStatus`);
    - `importBytes`, which the raw-body test covers separately;
    - **`pickFolder` and `pickImages`**. These go through `@tauri-apps/plugin-dialog`'s `open()`, which invokes the plugin's own `plugin:dialog|open` command. Its argument shape belongs to the plugin, not to Horus, so pinning it would test the plugin's internals.

    **Decision: pickers go in `NON_IPC_KEYS`, not rows.** Their behaviour when cancelled (`pickFolder` gives `null`, `pickImages` gives `[]`) is tested where they are used: in the switching menu and the Inbox's "Add images…" (Task 9), and in the new `importer.test.ts` (Task 5).

- [ ] **Step 4: Commit.** Commit message: `feat(app): tag, field, technique, undo/redo and intake commands with debounced saving`.

---

### Task 6: Search tuning for per-keystroke use (Plan 1 Task 6 review minors)

**Files:**
- Modify:
  - `app/src-tauri/src/search.rs`;
  - `app/src-tauri/Cargo.toml`, adding `unicode-normalization = "0.1"`. This is the one new crate, because NFC normalisation is not in std.

**Interfaces:**
- Consumes `search::{search, Hit}` (Plan 1 Task 6). The signatures are unchanged.
- Produces:
  ```rust
  pub const MIN_QUERY_CHARS: usize = 2;                 // after normalise(); shorter -> []
  pub fn normalise(s: &str) -> String;                  // NFC, lowercase, every non-alphanumeric char -> ' ', spaces collapsed, trimmed
  fn has_phrase(hay: &str, phrase: &str) -> bool;       // whole-word phrase match on normalised strings
  ```
- Matching rules after this task. Both sides go through `normalise`.
  - **Technique name or synonym:**
    - the field contains `q` as a substring, so it still works while typing; or
    - `q` contains the field as a whole-word phrase (`has_phrase(q, field)`).

    So "chiaroscuro lighting" finds Chiaroscuro. A short synonym such as "eyes" no longer matches a query like "eyesore".
  - **Description:** every query word longer than 3 characters appears in the description as a whole word.
  - **Operation name or plain label:** matches only when the whole name or the whole plain label appears in `q` as a whole-word phrase: `has_phrase(q, name) || has_phrase(q, label)`. So "stand out", "make it stand out" and "differentiate" expand Differentiate, while "out", "eye", "a", "make" and a half-typed "stand o" expand nothing.
    - **This is data-driven.** It iterates `tax.operations` and reads each operation's `name` and `plain_label`. No label is hardcoded, so renamed and added operations work at once.

  - **Reference:** its normalised title or note contains `q`, or the `why` of a link touching it does. This is unchanged apart from normalisation.
- `matchesQuery` in `tagging/model.ts` (Task 7) mirrors the technique rules, using `String.prototype.normalize("NFC")` and the same `normalise` steps. Task 7's shared `match-cases.json` keeps the two in agreement. The picker filters cards in TypeScript on every keystroke; the Rust `search` serves the global search box.

- [ ] **Step 1: Write the failing tests** in `search::tests`. Keep the 5 existing tests and add:
  - `operation_label_needs_whole_words`:
    - `"out"`, `"eye"` and `"make"` each return no hit whose only reason is the operation. Assert there is no Differentiate, Sequence or Infer technique hit whose name, synonyms and description fail the technique rules for that query.
    - `"lead the eye"` returns only Sequence techniques.
    - `"make it stand out"` returns only Differentiate techniques.
  - `min_query_length`: `"a"` returns `[]`, and `"ab"` returns a value without panicking.
  - `custom_operation_label`: on a fixture taxonomy with an added operation `{ id: "provoke", name: "Provoke", plainLabel: "Make it sting" }` with one branch and one technique, `"make it sting"` returns that technique with `operation_id == "provoke"`. Renaming Differentiate's `plainLabel` to `"Pop"` makes `"stand out"` expand nothing, and `"pop"` expand Differentiate.
  - `punctuation_stripped`: `"moody!"` and `"Moody,"` find Chiaroscuro, and `"pop out"` finds Pop-out.
  - `query_contains_name`: `"chiaroscuro lighting"` finds Chiaroscuro.
  - `description_words_over_3`: `"the empty space"` finds Isolation in void, because "the" is ignored and both remaining words are in its description. `"vast space"` does not find it.
  - `nfc_both_sides`: a reference titled `"E\u{301}tude"` (NFD) is found by `"Étude"` (NFC) and by `"étude"`.
  - `note_and_title_match`: one reference is found through its note only, and another through its title only.
  - `reference_cap_is_4`: 6 references whose titles contain "harbour" give exactly 4 `Hit::Reference`, in library order.
  - `operation_id_rungs`, covering the Plan 1 ruling's three rungs for a technique under two operations, using Chiaroscuro (Differentiate and Sequence):
    1. A query that matches the Sequence label gives `operation_id == "sequence"`.
    2. A synonym query with Chiaroscuro tagged twice under Sequence and once under Differentiate gives `"sequence"`.
    3. The same query on an untagged library gives `"differentiate"`, its first branch in taxonomy order.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test search::`. The new tests should FAIL, then all PASS, including the 5 tests from Plan 1.

- [ ] **Step 3: Commit.** Commit message: `fix(core): word-boundary, NFC and punctuation-aware idea search`.

---

### Task 7: The UI store, the pure tagging model and the undo keys

**Files:**
- Create:
  - `app/src/store.ts`;
  - `app/src/ops.ts`;
  - `app/src/tagging/model.ts`;
  - `app/src/tagging/match-cases.json`;
  - `app/src/keys.ts`;
  - `app/src/esc.ts`, the single HTML-escaping helper (Plan 1 final review minor). `esc()` is currently duplicated in `firstrun.ts`, `importer.ts`, `reference/view.ts` and `search.ts`. Each of them now imports `esc` from `esc.ts`, and the local copies are deleted.
- Modify (audit #28):
  - `app/src/reference/view.ts`: the view reads from the `Store` instead of its private `S`;
  - `app/src/reference/view.test.ts`;
  - `app/src/main.ts`: it loads the library and builds the `Store`.
- Test:
  - `app/src/store.test.ts`;
  - `app/src/ops.test.ts`;
  - `app/src/tagging/model.test.ts`;
  - `app/src/keys.test.ts`;
  - `app/src/esc.test.ts`;
  - a Rust test `search::tests::shared_match_cases` in `app/src-tauri/src/search.rs`, which reads the same JSON through `include_str!("../../src/tagging/match-cases.json")`.

**Interfaces:**
- Consumes the `api.ts` types (Task 5 and Plan 1 Task 8).
- Produces:
  ```ts
  // store.ts
  export type Store = { refs: Map<string, Reference>; tax: Taxonomy; links: Link[]; canUndo: boolean; canRedo: boolean; taxonomyReadOnly: boolean;
    apply(c: Change): void; reset(view: LibraryView, tax: Taxonomy): void;   // reset: library switch; notifies with { reset: true }
    subscribe(fn: (c: Change & { reset?: boolean }) => void): () => void; inbox(): Reference[] };
  export function createStore(view: LibraryView, tax: Taxonomy): Store;
  // links: from LibraryView; Plan 2 never changes them (Plan 4 adds Change.links)
  // ops.ts — owned by Plan 3 Task 2; same interface whichever plan lands first creates the file
  export type Ink = { base: string; text: string; on: string };   // CSS values, e.g. "var(--seq)"
  export const SEED_INK: Record<string, "diff" | "group" | "seq" | "infer">;
  export function opInk(tax: Taxonomy, opId: string): Ink;
  // op.color ∈ EXTRA_INKS -> var(--x-<color>), var(--x-<color>-text), var(--x-<color>-on);
  // else seed id -> var(--k), var(--k-text), var(--k-on); else neutral { base: "var(--ink-2)", text: "var(--ink)", on: "var(--panel)" }
  export function opLabel(tax: Taxonomy, opId: string): { plain: string; name: string };   // added by this plan; unknown id -> { plain: opId, name: opId }
  // reference/view.ts (changed signature)
  export function mountReference(root: HTMLElement, api: Api, store: Store): { show(id: string): void; destroy(): void };
  // inbox(): refs with tags.length === 0, newest addedAt first, ties by title
  // tagging/model.ts
  export function techniquesFor(tax: Taxonomy, opId: string): Technique[];          // taxonomy order, unique
  export function domainChoice(tax: Taxonomy, opId: string, techId: string): { branchId: string } | { ask: Branch[] };
  export function matchesQuery(t: Technique, q: string): boolean;                   // name / synonym (either contains the other) / all description words > 3 chars; case-insensitive; blank -> true
  export function examplesFor(refs: Iterable<Reference>, techId: string, n?: number): Reference[];  // n = 2; confirmed before suggested, newest first
  export function presetFrom(source: Reference): NewTag[];   // technique tags only, regions dropped, deduped by (op, branch, tech)
  // keys.ts
  export function wireUndoKeys(doc: Document, api: Api, store: Store): () => void;
  ```
- **The Reference view reads from the Store** (audit #28). `mountReference` no longer loads data itself, and no longer keeps a private copy of the references, links, taxonomy or settings.
  - It keeps only view state: the focus, the trail, the pin, the hot callout, the filter and the paint timer.
  - It reads `store.refs`, `store.tax` and `store.links`.
  - It replaces Plan 1's hard-coded `OPS` map with `opLabel` and `opInk`.
  - It subscribes to the store, and re-renders on any `Change` that touches the focused reference, its related references or the taxonomy.
  - If the focused reference is removed (for example, by undoing an import), the view goes to the previous reference in the trail, else to the first reference, else to the empty state "No references yet."
  - `main.ts` loads `openLibrary` (or the first-run result from Plan 1 Task 9) and `getTaxonomy`, calls `createStore`, then mounts the view. Opening another library calls `store.reset`.
- `match-cases.json` is `[{ "q": string, "technique": string, "match": boolean }]`. It is the single source that keeps `matchesQuery` and the Rust `search` agreeing. The Rust test asserts that each `match: true` technique appears in `search(seed, empty, q)` and that each `match: false` technique does not.

- [ ] **Step 1: Write `match-cases.json`** with at least these cases, checked against the seed:
  - `moody` matches `chiaroscuro`: true.
  - `spotlight` matches `chiaroscuro`: true.
  - `a very moody scene` matches `chiaroscuro`: true, because the query contains the synonym.
  - `empty space` matches `isolation-in-void`: true, through its description words.
  - `moody` matches `rim-light`: false.
  - `backlit` matches `rim-light`: true.
  - `chiaroscuro lighting` matches `chiaroscuro`: true, because the query contains the name (Task 6).
  - `moody!` matches `chiaroscuro`: true, with punctuation stripped.
  - `pop out` matches `pop-out`: true, with the hyphen normalised.
  - `eyesore` matches `face-schema`: false, because a synonym must appear in the query as a whole word.

- [ ] **Step 2: Write the failing tests**
  - Store: `apply` merges the changed references, deletes `removed`, swaps in `taxonomy` when present, and updates `canUndo` and `canRedo`. `inbox()` excludes a reference with only a partial tag, because any tag at all takes a reference out of the Inbox.
  - `ops`: if Plan 3 Task 2 has already created `ops.ts`, reuse its tests and add only the `opLabel` cases. Otherwise create it with Plan 3's tests:
    - `opInk(seed, "group")` gives `{ base: "var(--group)", text: "var(--group-text)", on: "var(--group-on)" }`;
    - an operation with `color: "teal"` gives `var(--x-teal)`, `var(--x-teal-text)` and `var(--x-teal-on)`;
    - an unknown id, or an unknown `color`, gives the neutral triple and doesn't throw.
    - `opLabel` reads `plainLabel` and `name` from the data, so a renamed operation shows its new label.
  - Reference view, on the store (audit #28), using a fake `Api` and a real `Store`:
    - `store_change_rerenders_focus`: `store.apply` with a `Change` that adds a tag to the focused reference raises the callout count, without any `show()` call.
    - `taxonomy_rename_rerenders`: a `Change` whose `taxonomy` renames Chiaroscuro updates the callout title.
    - `removed_focus_falls_back`: a `Change` whose `removed` holds the focused id moves to the previous reference in the trail.
    - `reset_switches_library`: `store.reset` re-renders from the new data.
    - `no_private_fetch`: `mountReference` never calls `api.openLibrary` or `api.getTaxonomy`.
  - `esc`:
    - `esc('<img src=x onerror="a">&\'')` gives `&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;`.
    - A source check asserts that no file under `app/src` other than `esc.ts` defines a function or const named `esc`.
  - `unknown_op_is_neutral_in_reference_view`: a callout for a tag whose `operationId` is missing from `store.tax` gets `opInk`'s neutral triple (`var(--ink-2)`), never Differentiate's amber (Plan 1 final review minor; Plan 3 cross-plan impact item 3).
  - `techniquesFor(seed, "group")` contains `color-blocking` and not `pop-out`.
  - `domainChoice(seed, "differentiate", "chiaroscuro")` gives `{ branchId: "differentiate.feature" }`. A fixture taxonomy where `t` sits under `differentiate.feature` and `differentiate.space` gives `{ ask: [both] }`.
  - The cases from `match-cases.json` are checked against `matchesQuery`, which takes the technique from the seed.
  - `examplesFor` returns at most 2, with a confirmed tag ranked above a suggested one.
  - `presetFrom` skips partial tags, drops regions, and collapses two region tags of one technique into one `NewTag`.
  - `keys`:
    - Ctrl+Z on `document.body` calls `api.undo` once, and Ctrl+Shift+Z and Ctrl+Y call `api.redo`.
    - **Ctrl+Z inside an `<input>`, a `<textarea>` or a `[contenteditable]` calls neither** (Review Focus 1).
    - Each result is passed to `store.apply`.

- [ ] **Step 3: Run, then implement, then run again.** Run `npm test` and `cargo test search::`. Both should FAIL, then PASS.

- [ ] **Step 4: Commit.** Commit message: `feat(ui): change store, pure tagging model and undo/redo keys`.

---

### Task 8: The technique picker (SPEC §6.1–6.4, 6.7, 6.8)

**Files:**
- Create:
  - `app/src/tagging/picker.ts`;
  - the picker block in `app/src/styles.css`, using the existing tokens only.
- Test: `app/src/tagging/picker.test.ts` (jsdom, a fake `Api` and a real `Store`).

**Interfaces:**
- Consumes Task 7 and `api.addTags`, `api.addTechnique`, `api.updateTag`, `api.removeTag` and `api.assetUrl`.
- Produces:
  ```ts
  export type PickerOpts = { refId: string; region?: Region; preset?: NewTag[]; inbox?: boolean; onDone?: () => void };
  export function mountPicker(root: HTMLElement, api: Api, store: Store, opts: PickerOpts): { close(): void; el: HTMLElement };
  ```
- Layout and behaviour:
  - **One operation button per `store.tax.operations` entry**, in taxonomy order (Global Constraints; Plan 3 cross-plan impact item 1). Each shows `opLabel(...).plain` in the serif face and `.name` in mono, with the swatch from `opInk(...).base`. The copy is the seed's labels by default, editable by the artist.
    - Number keys `1`–`9` map to the buttons in order. There are at most 9 (`MAX_OPS`), so every button has a key.
    - The row wraps, and never assumes four buttons.
    - When `store.tax` changes while the picker is open (a rename, an addition or a deletion), the row re-renders. If the chosen operation was deleted, the choice clears and the card grid empties.
  - **After an operation is chosen**, a grid of technique cards appears. Each card shows:
    - its name;
    - `icon` as the glyph text, until Plan 6 draws the icons;
    - its one-line description;
    - up to 2 thumbnails from `examplesFor`, or none.
  - **A search field** filters the cards with `matchesQuery`.
  - **When a card is chosen**, a muted domain chip appears with the domain name. When `domainChoice` returns `ask`, the chip becomes a small radio group and Enter waits for a pick.
  - **"+ New technique"** is the last card, and appears whenever the search text is not empty. It opens an inline form, filled in from the search text:
    - a name;
    - a one-line description;
    - a domain select, listing the domains of that operation's branches.

    Submitting it calls `addTechnique(t, { refId, region })` once, which creates the technique and the tag as one undo step. A `NameTaken:<id>` error turns the form into "Already exists: <Name> — use it" (Review Focus 4).
  - **The reference's current tags** are listed above the operations row as chips ("Stand out › Chiaroscuro").
    - Each chip has a remove control (×, or Delete when the chip is focused), which calls `removeTag`.
    - A suggested tag, such as a demo seed tag, shows "suggested" with a confirm control (✓), which calls `updateTag` with the same values and so sets `suggested: false`.
  - **When `preset` is given** ("Tag like this"), those techniques start ticked. Enter applies all the ticked techniques in one `addTags` call.
- Keyboard map, active only while focus is inside the picker. The Reference view's `1`–`9` callout pinning is suspended while the picker is open:
  - `1`–`9`: choose the operation in that position (only as many keys as there are operations).
  - Any printable key: focuses the search field and types.
  - ↑ and ↓ move between cards. ← and → also move between cards, **except when the picker is docked in the Inbox**: there, ← and → always belong to the Inbox (Task 9), and cards move only with ↑ and ↓.
  - **Enter:** applies the highlighted card. With nothing highlighted, it applies a partial tag carrying only the operation.
  - Space: ticks or unticks the highlighted card.
  - Esc: clears the search first, then closes the picker.
  - Tab: moves between the operations row, the search field, the grid and the domain chip.

- [ ] **Step 1: Write the failing tests**
  - With the seed, the buttons render with the labels "Stand out", "Hold together", "Lead the eye" and "Make them think", in that order. Pressing `2` selects Group.
  - `dynamic_operations`: on a fixture taxonomy with 5 operations, 5 buttons render, pressing `5` selects the fifth, and `6` does nothing. With 9 operations (`MAX_OPS`), `9` selects the ninth. With 1 operation, a single button renders and the row never assumes four.
  - `renamed_operation_label`: applying a `Change` whose taxonomy renames `group`'s `plainLabel` to "Bundle" updates that button's text, with no remount.
  - `deleted_operation_clears_choice`: with Group chosen, a `Change` whose taxonomy no longer has `group` clears the choice and the card grid, and doesn't throw.
  - `custom_domain_listed`: in a fixture where `differentiate` has a branch to a new domain `"texture"`, the "+ New technique" domain select lists it.
  - After `1`, typing `moody` leaves exactly one visible card, Chiaroscuro. Enter calls `addTags` with `[{operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.feature"}]`.
  - With the fixture taxonomy where `t` has two Differentiate branches, choosing `t` shows two radio options, and Enter does not call `addTags` until one is picked.
  - Pressing `3` and then Enter with no card highlighted calls `addTags` with `[{operationId: "sequence"}]`: a partial tag.
  - `preset` with 2 techniques pre-ticks 2 cards, and Enter sends both in **one** `addTags` call.
  - Submitting "Halo glow" calls `addTechnique` once with `tag: { refId }`, and calls `addTags` not at all.
  - When the fake `addTechnique` rejects with `"NameTaken:chiaroscuro"`, the form shows "Already exists: Chiaroscuro — use it". Clicking it calls `addTags` with `chiaroscuro`, and `addTechnique` is called only once.
  - A `region` passed in opts appears on every `NewTag` sent.
  - For a reference with one suggested tag, ✓ calls `updateTag(refId, tagId, sameValues)`, and × calls `removeTag(refId, tagId)`.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- picker`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): plain-language technique picker with inferred domain, synonyms and custom techniques`.

---

### Task 9: The Inbox view, intake and the duplicate prompt

**Files:**
- Create:
  - `app/src/inbox/view.ts`;
  - `app/src/intake.ts`;
  - `app/src/grid/windowed.ts`: the windowed tile grid, which Plan 4's Boards view reuses (audit #16).
- Create also: `app/src/library-menu.ts` and `app/src/library-menu.test.ts`.
- Modify:
  - `app/index.html`: enable the Inbox tab, and add a "Library" menu button at the left of the top bar;
  - `app/src/main.ts`: wire intake, the views and the library menu;
  - `app/src/importer.ts` (Plan 1): the intake toast extends it rather than duplicating it. It switches on `Skip.kind` (Task 5).
- Test:
  - `app/src/inbox/view.test.ts`;
  - `app/src/intake.test.ts`.

**Interfaces:**
- Consumes `mountPicker` (Task 8, with an `inbox: true` option for the docked arrow rule), `Store` (Task 7), and `api.importPaths`, `api.importBytes` and `api.setField` (Task 5).
- Produces:
  ```ts
  export function mountInbox(root: HTMLElement, api: Api, store: Store): { focus(i: number): void; destroy(): void };
  // grid/windowed.ts — renders only the rows in view (± overscan), with fixed-size tiles
  export function mountWindowedGrid<T>(root: HTMLElement, opts: { items: T[]; tile: number; gap: number;
    render(item: T, i: number): HTMLElement; overscanRows?: number /* default 2 */ }):
    { update(items: T[]): void; scrollTo(i: number): void; destroy(): void };
  export type IntakeDeps = { api: Api; store: Store; openPicker(opts: PickerOpts): void; toast(msg: string): void };
  export function wireIntake(win: { onDragDropEvent: Function }, doc: Document, deps: IntakeDeps): () => void;
  export function dupRows(report: ImportReport, store: Store, meta: { note?: string; sourceUrl?: string }): DupRow[];
  export type DupRow = { existingId: string; title: string; action: "show" | "merge"; fills: ("note" | "sourceUrl")[] };
  // library-menu.ts — switching libraries after first run (Plan 1 final review, item 2)
  export function mountLibraryMenu(button: HTMLElement, api: Api, store: Store, toast: (m: string) => void): { destroy(): void };
  ```
- **Switching libraries.** The "Library" menu offers:
  - **"Open library…":** `api.pickFolder("Open a Horus library")`, then `api.openLibrary(path)`. Picking the parent folder works too, because `open_library` falls back to its `Horus Library` subfolder (Task 5).
  - **"New library…":** `api.pickFolder("Choose a folder for the new library")`, then a one-line confirm with the checkbox "Start with the demo set". It is off here, unlike first run, because this library is a second one. Then `api.createLibrary(path, seedDemo)`.
  - On success, either action calls `store.reset(view, await api.getTaxonomy())` and shows `view.warning` as a toast if it is present.
  - On `Err`, the toast shows the message, for example "Couldn't save the current library: …" from Task 5's flush-on-switch, and the current library stays open.
  - A cancelled folder picker (`pickFolder` gives `null`) does nothing.
  - Plan 6's native File menu later calls the same two functions.
- **Inbox:**
  - It is a grid of `store.inbox()` thumbnails (`thumb256`, at their true aspect ratio, letterboxed on a fixed-size tile), rendered through `mountWindowedGrid`. Its images use `loading="lazy"` and `decoding="async"`, so a hoard of 2,000 items stays smooth (SPEC §9). `focus(i)` calls `scrollTo(i)`. The tab badge shows the live count.
  - Selecting an item docks the picker beside it.
  - Once an item gets its first tag, it **stays in the grid, marked "tagged"**, until the artist moves to another item. Only then is it dropped from the derived list (Review Focus 3).
  - ← and → move to the previous or next item, wherever focus is, except inside a text input. After Enter applies a tag, focus stays in the picker, so the next → moves on.
  - An empty Inbox shows "Inbox is empty. Drop, paste or open a folder to add references."
- **Intake:**
  - **Drag and drop:** `onDragDropEvent` `drop` with `paths` (files or folders) calls `importPaths`. If the drop position falls on an element with `[data-ref-drop="<id>"]`, which is the Reference view's central plate, the picker then opens for each new reference with `preset: presetFrom(store.refs.get(id))` (SPEC §6.5).
  - **Paste:** a `paste` event with `image/*` clipboard items calls `importBytes` once for each item. When the clipboard's `text/html` contains `<img src="http…">`, or `text/uri-list` has an http(s) URL, it becomes the `sourceUrl`. When the paste has no image item, a toast says "Paste the image itself — Horus doesn't download from the web." (Review Focus 5).
  - **File picker (SPEC §9):** an "Add images…" button in the Inbox header calls Plan 1's `api.pickImages()`, which returns `[]` when cancelled, and passes the chosen paths to `importPaths`. "Add folder…" calls `api.pickFolder("Add a folder of images")`. Plan 1's status-bar import buttons keep working, and both routes share `importer.ts`'s report display.
  - **The note field:** after any intake, a toast shows "Added N to the Inbox", with an optional one-line note field. Submitting it calls `setField(newIds, "note", text)` once, as one undo step for the whole batch.
  - **Duplicates (SPEC §9):** `report.duplicates` produces one `DupRow` per existing reference, listed in the same toast as "Already in your library: <title>":
    - **Show** opens it in the Reference view.
    - **Merge** appears only when the intake carried a note or `sourceUrl` that the existing reference lacks. It fills only those empty fields, as one undo step per reference. Existing values are never overwritten.

- [ ] **Step 1: Write the failing tests**
  - Inbox:
    - 3 untagged and 1 partially tagged reference render as 3 tiles, and the badge shows 3.
    - `windowed_grid_bounds_dom`: 2,000 items in an 800×600 container, with `clientWidth` and `clientHeight` stubbed, create at most 200 `<img>` elements. `scrollTo(1500)` renders tile 1500 and leaves tile 0 unrendered.
    - Applying a tag to tile 1 through the fake api keeps 3 tiles, with tile 1 marked tagged. Pressing → gives 2 tiles.
    - Pressing → on the last item shows "Inbox is empty…", and calling `focus` out of range does not throw.
    - With the picker docked and focus on a technique card, → moves to the next Inbox item and ↓ moves to the next card. With focus in the picker's search field, → moves the text caret only.
  - Intake:
    - A drop of 2 paths calls `importPaths` once with both.
    - "Add images…" with a fake dialog that returns 2 paths calls `importPaths` once with both, and a cancelled dialog (`null`) calls nothing.
    - A drop over `[data-ref-drop="r1"]` calls `openPicker` with `preset` equal to `presetFrom(r1)` for the returned new id.
    - A paste with a PNG blob and `text/html` `<img src="https://ex.org/a.png">` calls `importBytes` with `sourceUrl: "https://ex.org/a.png"`.
    - A paste with only `text/plain` "https://ex.org/a.png" calls nothing and toasts the exact copy.
    - `typed_text_is_text` (Plan 1 final review minor: XSS):
      - A note typed into the intake note field as `<img src=x onerror="window.__xss=1">` and saved through a fake `setField` renders as text in the Inbox tile's tooltip and in the toast.
      - The same holds for a pasted file whose `x-meta` name is `<b>t</b>.png`, which becomes the tile's title.
      - `window.__xss` stays undefined, and no `img[src="x"]` or `b` element comes from the data.
  - Library menu:
    - "Open library…" with a fake picker returning `"D:/B"` calls `openLibrary("D:/B")` and then `store.reset`.
    - A cancelled picker calls nothing.
    - An `openLibrary` rejection toasts its message, and `store.reset` is not called.
    - "New library…" with the demo box left unticked calls `createLibrary("D:/C", false)`.
    - `dupRows`: an existing reference without `sourceUrl` plus intake metadata with `sourceUrl` gives `action: "merge"` and `fills: ["sourceUrl"]`. With no intake metadata, it gives `action: "show"`.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- inbox intake`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): Inbox triage, drag/paste/folder intake with notes and duplicate merge`.

---

### Task 10: Region tagging in a minimal lightbox (SPEC §6.6)

**Files:**
- Create: `app/src/lightbox/regions.ts` and `app/src/lightbox/view.ts`.
- Test: `app/src/lightbox/regions.test.ts`.

**Interfaces:**
- Consumes `api.imagePath` (Task 5), `mountPicker` with `region` (Task 8), and `tileBox` (Plan 1 Task 8), to fit the plate.
- Produces:
  ```ts
  export type Pt = { x: number; y: number };   // client px
  export const MIN_REGION = 0.01;              // fraction of the image side
  export function normRect(a: Pt, b: Pt, plate: Box): Region | null;   // clamps into plate, normalises to 0..1, null if w or h < MIN_REGION
  export function openLightbox(api: Api, store: Store, refId: string): { close(): void };
  ```
- This is the minimal lightbox only, and Plan 4 replaces its chrome:
  - full-resolution image from `assetUrl(await imagePath(id))`, letterboxed;
  - the existing region tags drawn as outlines;
  - `v` toggles the value (grayscale) view, using the same filter as the Reference view;
  - dragging a box opens the picker with that region;
  - Esc closes the lightbox.
- It opens from the Reference view: "Open lightbox" in the plate's context, or the `L` key.

- [ ] **Step 1: Write the failing tests**
  - `normRect`:
    - On plate `{left: 100, top: 50, width: 400, height: 300}`, a drag from (200, 125) to (300, 200) gives `{x: .25, y: .25, w: .25, h: .25}`.
    - A reversed drag gives the same region.
    - A drag that starts on the letterbox margin and ends past the plate is clamped to within 0..1.
    - A 2-pixel drag returns `null`.
  - `view`: a pointer down, move and up sequence calls the picker factory with that `region`. Pressing Esc removes the lightbox element.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- lightbox`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): drag a box in a minimal lightbox to tag a region`.

---

### Task 11: Combining techniques with AND/OR in the Ranked filter (SPEC §5a)

**Files:**
- Create: `app/src/reference/filter.ts`.
- Modify: `app/src/reference/view.ts` (Plan 1 Task 8), replacing the single-technique `filter`.
- Test: `app/src/reference/filter.test.ts`, plus one case in `view.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export type Filter = { techniques: string[]; mode: "and" | "or" };
  export function matchesFilter(ref: Reference, f: Filter): boolean;   // empty techniques -> true; partial tags never match
  export function toggle(f: Filter, techId: string): Filter;         // add/remove, order kept
  ```
- UI:
  - Choosing a technique from search or a callout adds it to the filter. The Ranked pane shows the techniques as removable chips, with a two-way switch, "All of" (and) or "Any of" (or). "Any of" is the default, which matches today's behaviour with a single technique.
  - The list holds the references that match the filter, ranked by `related` score against the focused reference, as the prototype does now.
  - The empty-state copy reads "No reference has all of these yet." for and, and "No reference has any of these yet." for or.
- The filter is view state only. It is not undoable and not saved, because it changes no data.

- [ ] **Step 1: Write the failing tests**
  - For reference A with `t1`, B with `t1` and `t2`, and C with `t2`:
    - `{t1, t2}` with and gives B only;
    - with or, it gives A, B and C;
    - `{}` gives all three.
  - A reference whose only tag is a partial tag matches nothing, unless the filter is empty.
  - `toggle` removes an id that is already present.
  - `view.test.ts`: adding two chips and flipping the switch to "All of" re-renders the Ranked list to the single matching reference.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- filter`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): AND/OR technique filter in the Ranked pane`.

---

### Task 12: The end-to-end check (Hoard, then Tag later)

- [ ] **Step 1: Run the full suites.** Run `cargo test`, `cargo clippy --all-targets -- -D warnings` and `npm test`. Expected: all PASS, with no warnings.

- [ ] **Step 2: Manual run.** Run `npm run tauri dev` on a fresh library at `D:\Design Second Brain\Références test 2\`, with the demo set off. Expected results:
  1. Dropping a folder of 20 images gives "Added 20 to the Inbox", and the badge shows 20.
  2. Dropping the same folder again lists 20 "Already in your library" rows, and adds no new references.
  3. With the keyboard only, tag 5 items in the Inbox: `1` or `2`, type, Enter, then →. Each one takes under 10 seconds.
  4. In the Reference view, drop a new image onto a reference's plate. The picker opens with that reference's techniques ticked.
  5. In the lightbox, drag a box and tag it. The region's outline appears on the Reference view tile.
  6. Add the custom technique "Halo glow" from the picker. `taxonomy.json` on disk shows it with `"custom": true` within 1 second. Then **one** Ctrl+Z removes both the tag and the technique, because they were one step, and 1 second later `taxonomy.json` no longer has it.
  7. Paste an image from a browser. `sourceUrl` is filled when the browser supplied the `<img>` HTML.
  8. Tag something and quit within 0.5 s. On relaunch, the tag is there.
- [ ] **Step 3: Commit.** Commit message: `test: Plan 2 end-to-end check notes in app/README.md`.

---

## Decisions (answered by the user, 2026-11-25)

1. **Duplicate merge:** fill empty fields only. The app keeps the one existing reference and copies across any note or source URL from the new drop into fields that are still empty. Existing values are never overwritten, and there are never two references for one image.
2. **Undo scope:** as described. Undo keeps the last 200 steps in memory, and clears them when you switch libraries or restart. Undoing an import removes the references but keeps their image files in the library folder.
3. **From the Plan 3 decisions (2026-11-25):** operations can be renamed, added and deleted, and new domain types are allowed.
   - Plan 2 therefore treats operations and domains as data: a dynamic picker row with keys `1`–`9`, data-driven search labels, and `opLabel` and `opInk` with a neutral fallback ink.
   - The op ink rules for new operations may be refined by Plan 3's cross-plan list. `opInk` is the single place to change.

## Amendments (2026-11-25, from CROSS-PLAN-AUDIT.md)

These audit rows are owned by Plan 2 and applied above:
- **#1:** the IPC camelCase convention and `api.contract.test.ts` (Global Constraints, Task 5).
- **#7:** the `import_bytes` name is contained, and the metadata travels percent-encoded in `x-meta`.
- **#8:** `import_gate` is kept, and both imports are serial.
- **#9:** the guard is in `image_path_in` and `thumb_path_in` (Task 4).
- **#11:** the `after_change` hook in the command recipe.
- **#16:** the windowed grid (Task 9).
- **#18:** the `ReferenceView` name and its constructor.
- **#23:** the `Field` comment is neutral.
- **#28:** the Reference view is fed by the `Store` (Task 7). Plan 3's cross-plan impact item 3 says that if Plan 2 Task 7 lands first, it makes the data part against the `Store`. That is what Task 7 does. `opInk` replaces the view's `OP_KEY`, so an unknown operation is neutral, not amber.
- **Plan 3 cross-plan impact item 1:** the dynamic operation picker, with 1 to 9 operations and keys `1`–`9` (Task 8, Global Constraints).

**From the Plan 1 final review (2026-11-25):**
1. **The IPC table against Plan 1 HEAD `f0b90c4`:**
   - `create_library` [`path`, `seedDemo`];
   - `system_ram_gb` [];
   - the pickers go in `NON_IPC_KEYS`, which is the choice made;
   - `AppState.demo_dir` is kept.
2. **Library switching:** the "Library" menu (Task 9). No `lastLibrary` clear path is needed, because `install` rewrites it on every open and create.
3. **The taxonomy fallback: chosen, `taxonomy.bak.json` rotation**, with a read-only seed only as the last resort (Tasks 3 and 5).
   - Falling back silently to the seed would lose custom techniques on the next save, so the seed is never written.
   - This adds `taxonomy.bak.json` to the folder layout. **Tell the Plan 6 owner:** Plan 6's layout constraint and its integrity check must list it, and the sweep leaves it alone.
   - **Tell the Plan 3 owner:** Plan 3 Task 9's taxonomy edits get `Err("TaxonomyReadOnly")` from the shared recipe when `tax_source == SeedReadOnly`, so Plan 3 needs no check of its own. Its Task 10 inspector shows that error, and may disable its edit controls when the store's taxonomy is flagged read-only. Add `taxonomyReadOnly: boolean` to `LibraryView` and the `Store` for that.
4. **Minors:**
   - sniff before copy, and `Skip::InsideLibrary` (Task 5);
   - unknown operation inks are neutral, through `opInk`, and `esc.ts` deduplicates `esc()` (Task 7);
   - XSS tests cover typed notes and titles (Task 9).
