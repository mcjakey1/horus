# Horus Tagging, Inbox and Undo (Plan 2 of 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An artist can hoard images into the Inbox by drag, paste or folder drop, then tag them fast by keyboard. Tagging uses the plain-English operations, the visual technique picker, an inferred domain, synonym search, "Tag like this", region boxes and inline custom techniques. Every change can be undone, and nothing is lost on exit.

**Architecture:**
- **Rust core (`app/src-tauri/src/`):**
  - All mutations go through `edit::apply`, which validates the change, applies it and returns its inverse.
  - `history` keeps the inverses as an undo/redo stack.
  - `saver` writes tag and field edits to `library.json`, and taxonomy edits to `taxonomy.json`, on a 500 ms debounce, and flushes them when the window closes. **Imports are not debounced:** they save at once and roll back on failure, as Plan 1 does.
  - The commands address tags by `(ref_id, tag_id)` and return a `Change` delta, so the UI never re-reads the whole library.
- **TypeScript UI (`app/src/`):**
  - A small `store` applies each `Change` to the data it holds.
  - Pure functions in `tagging/model.ts` decide what the picker shows.
  - The picker, Inbox, intake and the minimal lightbox are DOM modules, tested with jsdom and a fake `Api`, the same way as Plan 1 Task 8.

**Tech Stack:**
- Plan 1's stack: Tauri 2, Rust (edition 2024), TypeScript and Vite, and Vitest with jsdom.
- One new crate, `unicode-normalization` (Task 6), for NFC.
- No `regex` and no logging crate. Pattern checks are hand-written, and warnings use `eprintln!`.
- No new npm packages. The plan uses only features of `@tauri-apps/api` that are already installed: `webviewWindow.onDragDropEvent`, `core.invoke` with a raw body, `mocks.mockIPC` and `event.listen`.

**Spec:** `SPEC.md` (draft 5): §2 (intake), §3, §5 (Inbox), §5a (AND/OR), §6 (all of it) and §9.
- It builds on Plan 1, `docs/superpowers/plans/2026-11-24-horus-foundation.md` as amended, and its ledger, `docs/superpowers/ledgers/2026-11-24-horus-foundation-ledger.md`.
- **Code baseline:** main at `25be96d`, which includes Plan 1's final-fix commit `982f8a6`. Every `file:line` below refers to that commit.
- Rust paths are relative to `app/src-tauri/src/`, and TypeScript paths to `app/src/`, unless given in full.

**Carried from the Plan 1 ledger (owned here):**
- AGY #2 **c1**: IPC addresses tags by `(ref_id, tag_id)` (Task 5).
- **c2**: debounced saves, with a flush on close (Tasks 4 and 5).
- **a2**: the duplicate-merge prompt (Task 9).
- **a3**: AND/OR across techniques in the Ranked filter (Task 11).
- **a4**: drag-drop, paste and sourceUrl at intake (Task 9).
- **Task 2 deferred minors** (Task 4, except the fixture, which Task 1 fixes):
  - the backup is rewritten in place;
  - backup rotation is gated on a parse;
  - `recovered_from_backup` stays true after a save;
  - `image_path` joins an untrusted `file`;
  - the `model.rs` fixture has `technique_id: None` with `branch_id: Some`.
- **Task 3 serde carry:** `BranchTechnique.source` and `rationale` defaults (Task 3).
- **Task 6 search minors** (Task 6).
- **Plan 1 Task 9:** the duplicated `esc` (Task 7).
- **The final review's Important #4 and #5,** and the open-hint dead end, at ledger line 160 (Task 5).

## Global Constraints

- **Tags (SPEC §3):** a partial tag carries `operationId` only. A technique tag always sets `techniqueId` and `branchId` together. The branch must contain the technique, and its `operationId` must equal the tag's.
- **The Inbox** is derived, never stored: a reference with zero tags is in it (SPEC §3).
- **Intake** never asks the artist to classify an image. An optional short note is offered and never required (SPEC §2).
- **"Undo and redo cover everything"** (SPEC §6.8): every change to `library.json` or `taxonomy.json` made through the UI is one undoable step, and that includes imports.
- **Operations and domains are data, not constants** (the user's Plan 3 decision: operations can be renamed, added and deleted, and new domain types are allowed).
  - The picker shows one button per `taxonomy.operations` entry, in taxonomy order. Each button shows its `plainLabel` (serif) and `name` (mono). With the seed, the labels are "Stand out", "Hold together", "Lead the eye" and "Make them think" (SPEC §6.1, §7).
  - There are 1 to 9 operations (Plan 3's `MAX_OPS = 9`). Keys `1`–`9` map to the shown order.
  - No Plan 2 code, test assertion or CSS may assume 4 operations or the 6 seed domains. Seed ids may appear only in seed-fixture tests.
  - **Colour comes from Plan 3's `opInk`** (`ops.ts`, Plan 3 Task 2):
    - an `EXTRA_INKS` colour maps to `var(--x-<color>…)`;
    - otherwise a seed id maps to its DESIGN.md ink;
    - otherwise the neutral ink is used.

    **Labels come from `opLabel`**, which this plan adds to the same file.
- **IPC naming:** JS `invoke` argument keys are the camelCase form of the Rust parameter names, which is Tauri v2's default (`ref_id` → `refId`). `api.contract.test.ts` (Task 5) pins every command's name and keys.
- **Domain:** it is inferred, and shown as a muted chip. The picker asks for it only when `branches_for(operation, technique)` returns more than one branch (SPEC §6.3).
- **Custom techniques** are saved with `custom: true` (SPEC §3).
- **Regions** are `{x, y, w, h}` in 0..1 of the original image (SPEC §3).
- **Offline:** a `sourceUrl` is stored as text and never fetched (SPEC §9).
- **Saves stay atomic,** as in Plan 1: write `.tmp`, `sync_all`, rename.
  - `library.bak.json` is rotated before each `library.json` save.
  - `taxonomy.bak.json` is rotated before each `taxonomy.json` save (SPEC §3, as amended on main).
  - Originals are never modified.
  - Pasted images are staged in an **OS temp directory outside the library** (`tempfile::tempdir()`), never inside it. So this plan's only change to the folder layout is `taxonomy.bak.json`.
- **The keyboard flow (SPEC §6.8):**
  - number keys pick the operation;
  - typing searches;
  - Enter applies;
  - the arrow keys move to the next or previous Inbox item;
  - Ctrl+Z (⌘Z) undoes, and Ctrl+Shift+Z or Ctrl+Y (⌘⇧Z) redoes.
  - **Plan 1's document `keydown` handler** (`reference/view.ts:373-395`) returns early for targets inside `.picker`, `.lightbox`, `textarea` and `[contenteditable]`, and for any `input`, so the keys never fire twice.
- **No new inline `style=` in HTML strings** (Plan 1 ledger carry). New code sets positions and inks through classes or the CSSOM (`el.style.setProperty`). Plan 1's existing inline styles stay until Plan 6 Task 1.
- **UI tokens, type and copy** follow `prototype/styles.css`, `DESIGN.md` and the Plan 1 Task 8 port. No new colours.

## Review Focus

1. **Ctrl+Z while typing in a text field,** such as the search box, the note or the new-technique name. This must undo the text, as the browser does natively, and never undo a library change. Tested in Task 7.
2. **The window is closed, or another library is opened, within the debounce window, or that final save fails.**
   - Pending edits are flushed first.
   - If the flush on close fails, the window stays open and asks: "Couldn't save your last changes: <reason>.", with the choices "Try again" and "Quit without saving".
   - If a flush on switch fails, the switch is refused and the error is shown.

   Tested in Tasks 4 and 5.
3. **The last Inbox item gets tagged, or an item gains its first tag mid-flow.** The item stays on screen until the artist moves on. → on the last item stays put; it never wraps or throws. "Inbox is empty…" appears only when the derived list is empty. Tested in Task 9.
4. **A new custom technique has the same name as an existing one, differing only in case or spacing.** No duplicate is created; the picker offers the existing one. Tested in Tasks 3 and 8.
5. **The paste holds no image:** only a URL, text or HTML. Nothing is imported and nothing is downloaded. The notice says "Paste the image itself — Horus doesn't download from the web." Tested in Task 9.

---

### Task 1: The `edit` module (validated edits that return their inverse)

**Files:**
- Create: `edit.rs`.
- Modify:
  - `lib.rs` (`pub mod edit;`);
  - `model.rs`: make the test fixture at `model.rs:84-91` set **both** `technique_id` and `branch_id` to `Some`, and add `techniqueId` to the expected JSON at `model.rs:83-98`. This keeps the camelCase coverage of `branchId`.

**Interfaces:**
- Consumes `LibraryData`, `Reference` and `Tag` (`model.rs`), and `Taxonomy`, `Technique`, `BranchTechnique` and `Taxonomy::branches_for` (`taxonomy.rs`).
- Produces:
  ```rust
  #[derive(Clone, Debug, PartialEq, Deserialize)] #[serde(rename_all = "camelCase")]
  pub enum Field { Note, SourceUrl }      // "note" | "sourceUrl"; no title/creator/year/credit editing in Plan 2 (CROSS-PLAN-AUDIT #23, open)
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
  impl Edit { pub fn touches_taxonomy(&self) -> bool; }   // AddTechnique/RemoveTechnique, recursive over Batch
  pub struct Touched { pub ref_ids: Vec<String>, pub removed_ref_ids: Vec<String>, pub taxonomy: bool }
  pub struct Applied { pub inverse: Edit, pub touched: Touched }
  pub enum EditError { UnknownReference(String), UnknownTag(String), InvalidTag(String), InUse(String), DuplicateId(String) }
  pub fn apply(data: &mut LibraryData, tax: &mut Taxonomy, e: Edit) -> Result<Applied, EditError>;
  pub fn validate_tag(tax: &Taxonomy, t: &Tag) -> Result<(), EditError>;
  pub fn new_id(prefix: &str) -> String;   // "<prefix>-<base36 unix nanos>-<base36 process-wide AtomicU64>"
  ```
  - `apply` is atomic. If any part of a `Batch` fails, the parts already applied are reverted before the `Err` returns.
  - The inverse of a `Batch` is a `Batch` of the inverses in reverse order.
  - `RemoveTechnique` fails with `InUse` while any tag still references the technique.
  - All of these types derive `Clone, Debug, PartialEq`.

- [ ] **Step 1: Write the failing tests.** Each builds a 2-reference `LibraryData` and loads the bundled seed through `env!("CARGO_MANIFEST_DIR")`.
  - `add_then_inverse_restores`: `AddTags` and then its inverse leave `data` equal to a snapshot, and `touched.ref_ids == [ref_id]`.
  - `remove_inverse_restores_positions`: remove index 1 of 3, then apply the inverse. The original order is back.
  - `technique_tag_needs_matching_branch`: `validate_tag` returns `InvalidTag` in four cases:
    - a technique without a branch;
    - a branch without a technique;
    - branch `sequence.feature` with `pop-out`, which sits only under `differentiate.feature`;
    - `operation_id: "group"` with branch `differentiate.feature`.
  - `partial_tag_is_valid`: `{operation_id: "infer"}` returns `Ok`.
  - `region_bounds`: `w = 0`, `x + w > 1` and `y < 0` each return `InvalidTag`, and `{0, 0, 1, 1}` returns `Ok`.
  - `unknown_ref_is_error_and_data_unchanged`.
  - `batch_failure_rolls_back`: a valid `AddTags` followed by an `AddTags` on an unknown reference returns `Err`, and `data` equals the snapshot.
  - `batch_inverse_reverses`: `Batch([AddTechnique, AddTags using it])` and then its inverse restore both `data` and `tax`. `touches_taxonomy()` is true for that batch, and false for a lone `AddTags`.
  - `remove_technique_in_use_fails`.
  - `duplicate_tag_id_rejected`: an `AddTags` whose id is already on the reference returns `DuplicateId`.
  - `new_id_unique`: 10,000 calls give 10,000 distinct ids, each matching `<prefix>-<base36>-<base36>`.

- [ ] **Step 2: Run the tests to check they fail.** Run `cargo test edit::`. Expected: compile errors.

- [ ] **Step 3: Implement `edit.rs`.** `apply` validates first and then mutates. `Batch` keeps the inverses of the parts it has applied, so it can unwind them. Tags are validated against `tax` as it is at that point in the batch.

- [ ] **Step 4: Run the tests to check they pass.** Run `cargo test edit::`. Expected: 11 PASS. Then run `cargo test`: all Plan 1 tests pass.

- [ ] **Step 5: Commit.** Commit message: `feat(core): validated, invertible edits for tags, fields, references and techniques`.

---

### Task 2: The `history` module (undo and redo)

**Files:**
- Create: `history.rs`.
- Modify: `lib.rs` (`pub mod history;`).

**Interfaces:**
- Consumes `edit::{apply, Edit, Touched, EditError}` (Task 1).
- Produces:
  ```rust
  pub const HISTORY_CAP: usize = 200;
  pub struct History { /* undo: Vec<Edit>, redo: Vec<Edit> — each holds the edit to apply next */ }
  impl History {
      pub fn new() -> History;
      pub fn record(&mut self, inverse: Edit);   // clears redo; drops the oldest past HISTORY_CAP
      pub fn undo(&mut self, data: &mut LibraryData, tax: &mut Taxonomy) -> Result<Option<Touched>, EditError>;
      pub fn redo(&mut self, data: &mut LibraryData, tax: &mut Taxonomy) -> Result<Option<Touched>, EditError>;
      pub fn can_undo(&self) -> bool;
      pub fn can_redo(&self) -> bool;
      pub fn clear(&mut self);
  }
  ```
  - `undo` pops, applies the edit, and pushes the returned inverse onto the redo stack. `redo` mirrors it.
  - With an empty stack, both return `Ok(None)`.
  - On `Err`, the popped entry goes back where it was.
  - History lives only in memory. It is cleared on open and create (Decision 2).

- [ ] **Step 1: Write the failing tests**
  - `undo_redo_roundtrip`: two `AddTags`, then two `undo`s, give the start state. Two `redo`s then give the state after both adds.
  - `new_edit_clears_redo`: after an `undo` and then a `record`, `can_redo()` is false.
  - `cap_drops_oldest`: after 201 records, exactly 200 `undo`s succeed, and the 201st returns `Ok(None)`.
  - `empty_is_none`: `undo` on a new `History` returns `Ok(None)` and leaves `data` unchanged.
  - `failed_undo_keeps_entry`: remove the reference that the top entry targets. `undo` returns `Err`, and `can_undo()` is still true.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test history::`. It should FAIL, then PASS (5 tests).

- [ ] **Step 3: Commit.** Commit message: `feat(core): bounded undo/redo history over invertible edits`.

---

### Task 3: Saving the taxonomy, its backup, and custom techniques

**Files:**
- Modify: `taxonomy.rs` (today it has only `load`, `validate`, `validate_seed` and `branches_for`, at `taxonomy.rs:171-456`).

**Interfaces:**
- Consumes `Taxonomy`, and `edit::Edit::AddTechnique` and `edit::new_id` (Task 1).
- Produces:
  ```rust
  impl Taxonomy {
      pub fn save(&self, path: &Path) -> std::io::Result<()>;
      // first rotates <dir>/taxonomy.bak.json (write .tmp, then rename) from the current file, only if that file parses;
      // then NamedTempFile::new_in(parent), write, sync_all, persist
      pub fn load_with_fallback(root: &Path, seed: &Path) -> Result<(Taxonomy, TaxSource), String>;
      pub fn find_by_name(&self, name: &str) -> Option<&Technique>;   // ignores case and collapses whitespace only (Review Focus 4)
      pub fn custom_technique(&self, name: &str, description: &str, operation_id: &str, domain_id: &str)
          -> Result<Edit, CustomError>;   // builds Edit::AddTechnique; does not apply it
  }
  pub enum CustomError { NameTaken(String /* existing id */), EmptyName, NoSuchBranch }
  pub enum TaxSource { File, Backup, SeedReadOnly }
  ```
- **`load_with_fallback`:**
  - It tries `taxonomy.json`, then `taxonomy.bak.json` (`Backup`), then the bundled seed (`SeedReadOnly`).
  - It returns `Err` only when all three fail, which means a broken install. `install` then refuses the open with that message. Nothing panics, and imports catch panics per file (Plan 1 `982f8a6`).
  - **Newer-version check** (mirroring `library.rs:183-195`): a `taxonomy.json` or `taxonomy.bak.json` whose top-level `version` is greater than 1 is not used. `load_with_fallback` returns `Err("This library was saved by a newer version of Horus.")` rather than falling back, so a newer file is never overwritten (SPEC §9).
- **`custom_technique`** builds the technique like this:
  - `id` is the slugified name, with `-2`, `-3` and so on appended when taken;
  - `icon` is `""`, `synonyms` and `examples` are `[]`, `citation` is `None`, and `custom` is `true`;
  - it adds one link: `BranchTechnique { branch_id: "<op>.<domain>", technique_id, source: "drafted", rationale: "Added by the artist in the tag picker." }`. The branch must exist; Plan 2 never creates branches.
- **Serde:** at `25be96d`, the only `Option` fields are `Operation.color` (`taxonomy.rs:27`) and `Technique.citation` (`:63`). The seed writes both as an explicit `null`, so they keep serialising `null`, and no `skip_serializing_if` is added. `BranchTechnique.source` and `rationale` (`:75-76`) get `#[serde(default)]`.

- [ ] **Step 1: Write the failing tests**
  - **Extend** the existing `roundtrip_preserves_fields` (`taxonomy.rs:497-521`) to go through `save` and `load` in a temp dir. Add the assertion that no key absent from the seed file appears in the saved file.
  - `custom_technique_is_custom_and_linked`: `custom_technique("Halo glow", "A soft ring of light around the subject.", "differentiate", "feature")` gives an `AddTechnique` with `custom == true`, `id == "halo-glow"` and one link to `differentiate.feature`. After `edit::apply`, `validate()` is `Ok`.
  - `custom_name_collision`: `"  chiaroscuro "` and `"CHIAROSCURO"` both give `NameTaken("chiaroscuro")`.
  - `custom_unknown_branch`: `("x", "", "group", "semantic")` gives `NoSuchBranch`.
  - `custom_id_suffix`: with `halo-glow` present, `"HALO  Glow"` gives `NameTaken("halo-glow")`, because only case and spacing differ. `"Halo-Glow!"` is a different name that slugifies to the same id, so it gives `id == "halo-glow-2"`.
  - `taxonomy_backup_rotates`: after two `save`s, `taxonomy.bak.json` equals the first version, and no `.tmp` remains. A `save` over an unparseable `taxonomy.json` leaves the existing backup untouched.
  - `damaged_taxonomy_falls_back`:
    - With `{` written into `taxonomy.json`, the result is the backup, as `Backup`.
    - With both files corrupt, it is the seed, as `SeedReadOnly`.
    - With all three unreadable, it is `Err`, and nothing panics.
  - `newer_taxonomy_refused`: `"version": 2` in `taxonomy.json` gives `Err` with the newer-version message, and the file is unchanged.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test taxonomy::`. It should FAIL, then PASS, and the Plan 1 taxonomy tests still pass.

- [ ] **Step 3: Commit.** Commit message: `feat(core): atomic taxonomy save with backup, fallback and inline custom techniques`.

---

### Task 4: The debounced `saver`, path guards and backup hardening

**Files:**
- Create: `saver.rs`.
- Modify:
  - `lib.rs` (`pub mod saver;`);
  - `library.rs`;
  - `import.rs`: callers of the guarded path functions;
  - `commands.rs`: the `library_error` arm only.

**Interfaces:**
- Consumes `Library::save` (`library.rs:107`) and `Taxonomy::save` (Task 3).
- Produces:
  ```rust
  pub const SAVE_DEBOUNCE_MS: u64 = 500;
  pub struct Debounce { delay: Duration, last_touch: Option<Instant>, dirty_library: bool, dirty_taxonomy: bool, failed: bool }
  impl Debounce {
      pub fn new(delay: Duration) -> Debounce;
      pub fn touch(&mut self, now: Instant, library: bool, taxonomy: bool);   // also clears `failed`
      pub fn due(&self, now: Instant) -> bool;                                 // dirty && !failed && now - last_touch >= delay
      pub fn deadline(&self) -> Option<Instant>;                               // when due() turns true, for the Condvar timeout
      pub fn take(&mut self) -> (bool, bool);                                  // returns and clears the dirty flags
      pub fn restore(&mut self, library: bool, taxonomy: bool);                // re-mark after a failed save; sets `failed`
      pub fn clear_library(&mut self);                                         // an import just saved library.json
  }
  pub fn flush(lib: &mut Library, tax: &Taxonomy, tax_writable: bool, d: &mut Debounce) -> Result<(), String>;
  // saves what is dirty; never writes taxonomy.json when !tax_writable; on library success sets lib.recovered_from_backup = false
  ```
- **The saver thread** (driven by Task 5):
  - `AppState` gains `saver: Condvar`, paired with the existing `open` mutex (`commands.rs:18`). It is started by `pub fn start_saver<R: Runtime>(app: &AppHandle<R>)`, which both `setup` and the test `env()` (`commands.rs:342-360`) call.
  - The thread waits on the `Condvar` with `deadline()` as its timeout. On wake-up, if `due()`, it calls `flush` on whatever library is open.
  - After a failed flush, `failed` holds the thread until the next `touch`, so it never spins. It emits `save-status` `{ ok: false, message }` and leaves the dirty flags set.
  - The mutating-command recipe calls `notify_one` after `touch`.
- **`library.rs` changes:**
  - The backup at `library.rs:120-123` is written to `library.bak.json.tmp` and then renamed.
  - When `library.json` can't be **read** (for example, it is locked), rather than can't be parsed, the rotation is skipped with an `eprintln!` warning.
  - **The path guards live in the free functions:**
    - `pub fn image_path_in(root, file) -> Result<PathBuf, LibraryError>` returns the new `LibraryError::InvalidFile(String)` unless `file` is 64 lowercase hex characters, a `.`, and a 2–5-character lowercase `[a-z0-9]` extension. The check is hand-written.
    - `pub fn thumb_path_in(root, hash, size) -> Result<PathBuf, LibraryError>` returns the same unless `hash` is 64 lowercase hex characters and `size` is 256 or 1024.
    - `Library::image_path` and `thumb_path` return the same `Result` (today they are at `library.rs:128-148`, unguarded).
  - **New and unguarded:** `pub fn images_dir(root: &Path) -> PathBuf`, which is `root.join("images")`. Import needs the directory, not a reference's file.
- **`import.rs` callers:**
  - `:141` calls `copy_and_hash(src, &image_path_in(root, ""))` to get the `images/` directory. It now uses `images_dir(root)`.
  - `:249` is inside an `io::Result` closure, so it maps `LibraryError` to `io::Error::other`.
  - `:299` is the `Thumbs` drop guard from `982f8a6`, where `?` is impossible. It uses `if let Ok(p) = thumb_path_in(…)`.
  - The roughly 15 test sites that call the path functions add `.unwrap()`.
- **`commands.rs`:** `library_error` (`:69-88`) gains the arm `InvalidFile(_) => "That image file name is not valid."`.

- [ ] **Step 1: Write the failing tests**
  - `debounce_waits_for_quiet`: touches at t0 and t0+300ms. `due(t0+600)` is false and `due(t0+800)` is true.
  - `debounce_not_due_when_clean`: after `take`, `due` is false.
  - `failed_flush_waits_for_touch`: after `restore`, `due(far future)` is false until the next `touch`.
  - `flush_saves_only_dirty`: with only the taxonomy dirty, `library.json` keeps its bytes and mtime, and `taxonomy.json` holds the new technique.
  - `flush_respects_read_only`: with `tax_writable == false` and the taxonomy dirty, `taxonomy.json` is byte-identical after `flush`.
  - `flush_failure_restores_dirty`: make `library.json.tmp` a directory. `flush` returns `Err`, and the dirty flags remain.
  - `backup_written_via_tmp`: after `save`, there is no `library.bak.json.tmp`, and the backup equals the previous contents.
  - `recovered_flag_clears_after_flush`.
  - `path_guards`:
    - `image_path_in(root, "../../evil.jpg")`, `thumb_path_in(root, "../x", 256)` and `thumb_path_in(root, <valid hash>, 512)` return `Err`;
    - `images_dir(root)` is `root/images`;
    - importing `small.jpg` gives a `Reference.file` that `image_path_in` accepts.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test -- saver:: library:: import::`. It should FAIL, then PASS, and every Plan 1 library and import test still passes.

- [ ] **Step 3: Commit.** Commit message: `feat(core): debounced saves, guarded reference paths, hardened backup rotation`.

---

### Task 5: Tagging, undo, intake and close commands

**Files:**
- Create:
  - `hooks.rs` (with `pub mod hooks;` in `lib.rs`);
  - `app/src/api.contract.test.ts`;
  - `app/src/importer.test.ts`.
- Modify:
  - `commands.rs`;
  - `lib.rs`: register the commands, call `start_saver` in `setup`, and handle `WindowEvent::CloseRequested` and `RunEvent::ExitRequested`;
  - `import.rs`: sniffing, and `Skip::InsideLibrary`;
  - `library.rs`: `SUBFOLDER` becomes `pub`;
  - `demo.rs`: add `pub fn examples(tax: &Taxonomy, demo_dir: &Path) -> Vec<DemoExample>`, reusing the private `Record` (`demo.rs:13`) and the name resolution behind `to_tag` (`demo.rs:84`);
  - `app/src/api.ts`;
  - `app/src/importer.ts`;
  - `app/src/reference/view.ts`: an interim `onChange` (below), which Task 7 replaces with `store.apply`;
  - `app/src/reference/view.test.ts`: the fakes at `:65`, `:136-150` and `:193` return an `ImportResult`, and assert no `openLibrary` call after an import;
  - `app/src/firstrun.ts`: `boot()` mounts the save-failure dialog;
  - `app/src/firstrun.test.ts`: its fake `importPaths` (`:18`) returns an `ImportResult`.
- Create also: `app/src/save-dialog.ts` and `app/src/save-dialog.test.ts`.

**Interfaces:**
- Consumes Tasks 1–4. From Plan 1 it consumes `AppState`, `LibraryView` (`commands.rs:52-61`), `ReferenceView` (`:45`), `install`, `run_import` (`:262-269`) and `correlate::Index::build`.
  - `ReferenceView`'s fields are private, so add `ReferenceView::new(root: &Path, r: Reference) -> Result<ReferenceView, LibraryError>`. TypeScript keeps calling it `Reference`.
- **The state:**
  - `AppState` keeps `import_gate`, `settings`, `config_dir`, `seed_taxonomy` and `demo_dir` (`commands.rs:17-28`), and gains `saver: Condvar` (Task 4) and `skip_close_flush: AtomicBool`.
  - `open` changes from a tuple to `Mutex<Option<Open>>`, where `Open { lib, tax, index, history: History, debounce: Debounce, tax_source: TaxSource }`.
  - The lock order stays: import gate, then settings, then state.
- **`LibraryView`** gains `taxonomy_read_only: bool` (`taxonomyReadOnly` in TS), which is true when `tax_source == SeedReadOnly`.
- **Every mutating command except imports** follows one recipe:
  1. Build an `Edit`.
  2. **Refuse it with `Err("TaxonomyReadOnly")` if `edit.touches_taxonomy()` and `tax_source == SeedReadOnly`.** This is the single check, and it covers Plan 3's edits too.
  3. Call `edit::apply`.
  4. Call `history.record(inverse)`.
  5. Rebuild `index` if tags or references changed.
  6. Call `debounce.touch`, then `saver.notify_one()`.
  7. Call `hooks::after_change(&app, &change)`. This is a no-op registry in Plan 2; Plan 5 registers its index trigger there (audit #11).
  8. Return the `Change`.
- **Imports** (`import_paths`, `import_bytes`) **save at once, as Plan 1's `run_import` does** (SPEC §9; this keeps Plan 1's tests at `commands.rs:608-622` and `:624-655` passing).
  1. Run the import off the lock, under `import_gate`.
  2. Apply `Edit::AddReferences`, carrying `note` and `source_url`, under the lock.
  3. Call `lib.save()`.
  4. **On `Err`:** apply the inverse, record no history, and return Plan 1's error.
  5. **On `Ok`:** record history only if `added` is non-empty, so an import of only duplicates leaves no empty undo step. Rebuild the index, call `debounce.clear_library()` (the save also wrote any pending tag edits), run `after_change`, and return `ImportResult`.
- **Commands** (all return `Result<_, String>`, with camelCase JSON):
  ```
  add_tags(ref_id: String, tags: Vec<NewTag>) -> Change          // one undo step for the list ("Tag like this")
  update_tag(ref_id: String, tag_id: String, tag: NewTag) -> Change   // ReplaceTag; sets suggested:false (editing confirms)
  remove_tag(ref_id: String, tag_id: String) -> Change
  set_field(ref_ids: Vec<String>, patch: FieldPatch) -> Change    // one Batch = one undo step for every id and field
  add_technique(t: NewTechnique, tag: Option<TagFor>) -> Change  // with a tag: Batch([AddTechnique, AddTags]); Change.created = new id; Err "NameTaken:<id>"
  undo() -> Change
  redo() -> Change
  image_path(ref_id: String) -> String                           // absolute, for the lightbox
  demo_examples() -> Vec<DemoExample>                            // SPEC §6.2 demo-set examples (Task 8)
  import_paths(paths: Vec<String>, note: Option<String>, source_url: Option<String>) -> ImportResult
  import_bytes(<raw body>) -> ImportResult                       // header x-meta: percent-encoded JSON {name, note?, sourceUrl?}
  retry_save() -> ()                                             // flush; on Ok, Rust sets skip_close_flush and destroys the main window
  exit_without_saving() -> ()                                    // sets skip_close_flush, then app.exit(0)
  ```
  ```rust
  pub struct NewTag { pub operation_id: String, pub technique_id: Option<String>, pub branch_id: Option<String>, pub region: Option<Region> }
  pub struct NewTechnique { pub name: String, pub description: String, pub operation_id: String, pub domain_id: String }
  pub struct TagFor { pub ref_id: String, pub region: Option<Region> }
  pub struct FieldPatch { pub note: Option<Option<String>>, pub source_url: Option<Option<String>> }   // absent = keep, null = clear; values trimmed, "" -> None
  pub struct DemoExample { pub technique_id: String, pub title: String, pub path: String }   // absolute path to a bundled demo image
  pub struct Change { pub references: Vec<ReferenceView>, pub removed: Vec<String>, pub taxonomy: Option<Taxonomy>,
                      pub created: Option<String>, pub can_undo: bool, pub can_redo: bool }
  pub struct ImportResult { pub report: ImportReport, pub change: Change }
  ```
  - `FieldPatch` deserialises its double `Option`s with a small `double_option` helper: `#[serde(default, deserialize_with = …)]`.
  - Rust assigns each tag `id: new_id("t")` and `suggested: false`.
- **Opening and creating:**
  - `open_library` and `create_library` first `flush` the open library. On `Err`, they return `Err("Couldn't save the current library: <reason>")` and keep it open. Then they clear the history.
  - **A damaged taxonomy never blocks opening.** `install` (`commands.rs:118-119` loads the taxonomy today) calls `load_with_fallback` instead:
    - **`Backup`:** the warning is "taxonomy.json could not be read, so Horus opened its backup (taxonomy.bak.json). Your most recent technique changes may be missing."
    - **`SeedReadOnly`:** the warning is "The library's technique list (taxonomy.json) is damaged and has no usable backup. Horus is showing the starting technique list; your file has been left untouched." Tagging still works. A tag whose technique is missing from the seed shows as an unknown technique and keeps its ids.
  - **Opening the parent folder:** `open_library(path)` tries `path` first. Only on `NotALibrary`, and only if `path/Horus Library` (`library.rs:9` `SUBFOLDER`, now `pub`) holds a library, does it open that subfolder as `view.root`. This covers first run's "Open an existing library" and the Library menu.
  - **Switching** needs no new command. `install` writes the new root to `lastLibrary` on every open and create, so no `{ lastLibrary: null }` clear path is needed.
  - **The asset scope on switch:** the previous library stays readable until restart (the ponytail note at `commands.rs:123-125`). This is accepted; see the pre-flight rulings.
  - **Copy:** the `AlreadyALibrary` message (`commands.rs:72`) names first run's button, but the menu calls it "Open library…". It ends with "Open it instead." in both places, and the 3 test strings at `commands.rs:525` and `:556` are updated to match.
- **Import changes in `import.rs`:**
  - **Sniff before copy:** `import_one` reads the first 64 bytes of the source and calls `image::guess_format` before `copy_and_hash`. It accepts only `Jpeg | Png | WebP | Tiff | Gif`, the decoders enabled in `Cargo.toml`. Anything else (PSD, video, BMP, AVIF and so on) is skipped as `Skip::Unsupported`, with nothing copied.
  - **`Skip::InsideLibrary`** replaces `Skip::Unsupported("inside the library")` (`import.rs:73`, and the test at `:683-686`). It serialises as `{"kind":"insideLibrary"}`.
- **`import_bytes`:**
  - **Metadata:** HTTP headers carry only ASCII, so the metadata travels as one header, `x-meta`, holding `encodeURIComponent(JSON.stringify({ name, note, sourceUrl }))`. Rust decodes it with `percent_decode(&str) -> Result<String, String>` in `commands.rs`, then `serde_json`. A malformed value is an `Err`, never a panic.
  - **Name:** only the last path component of `name` is kept. `< > : " / \ | ? *` and control characters become `_`, and an empty result becomes `pasted.png`.
  - **Staging** (SPEC §3; the B1 ruling): the body is written into a fresh `tempfile::tempdir()` **outside the library**, under that name, so the reference title is the name's stem. It is imported, and the temp dir is dropped. Plan 1's import refuses anything inside the library root (`import.rs:61-76`), which is why staging can't happen in the library.
- **`demo_examples`:**
  - It reads `demo_dir/manifest.json`, through Plan 1's `demo.rs` `Record` parsing, and resolves technique names to ids against the open library's taxonomy, as `demo::seed` does.
  - It returns one entry per (technique, image).
  - `setup` adds `demo_dir/images` to the asset scope, read-only.
- **Closing the window** (B5; Review Focus 2):
  - On the main window's `WindowEvent::CloseRequested`, unless `skip_close_flush` is set:
    1. call `api.prevent_close()`;
    2. run `flush`;
    3. on `Ok`, `window.destroy()`;
    4. on `Err`, emit `save-failed { message }`, and the window stays open with the dialog.
  - **The dialog:** "Couldn't save your last changes: <reason>." It has two buttons:
    - **"Try again"** calls `retry_save`. On `Ok`, **Rust** sets `skip_close_flush` and calls `app.get_webview_window("main")…destroy()`. The UI never calls `destroy()` itself, so no `core:window:allow-destroy` capability is needed; `capabilities/default.json` keeps `core:default` and `dialog:allow-open`.
    - **"Quit without saving"** calls `exit_without_saving`, which sets `skip_close_flush` and calls `app.exit(0)`.
  - **`RunEvent::ExitRequested`** stays as a best-effort backstop for programmatic exits: it flushes unless `skip_close_flush` is set, and logs any failure with `eprintln!`. There is no window left to show a dialog in, so it never calls `prevent_exit`.
  - The decision is a pure function, `close_decision(&AppState) -> CloseDecision { Close, Prevent(String) }`, so it can be tested without a window.
  - **The dialog's UI lives in `save-dialog.ts`:**
    - `mountSaveDialog(root: HTMLElement, api: Api): () => void` subscribes to `api.onSaveFailed`.
    - It shows a modal (`role="alertdialog"`, with focus on "Try again") with the exact copy, and the error message escaped through `esc` (Task 7; until then, a local escape).
    - Its two buttons call `api.retrySave()` and `api.exitWithoutSaving()`.
    - A `retrySave` rejection shows the new reason in the same dialog.
    - `boot()` mounts it once.

- [ ] **Step 1: Write the failing tests** (`tauri::test::mock_builder()`, as in Plan 1; the test `env()` calls `start_saver`):
  - `add_tags_then_undo_redo`: with `small.jpg` imported, `add_tags` gives `can_undo` and 1 tag. `undo` gives 0 tags and `can_redo`, and `redo` restores the tag with the same id.
  - `update_tag_confirms_suggestion`: `suggested: true` becomes `false`.
  - `invalid_tag_is_err_and_no_history`: branch `group.grouping` with `pop-out` is `Err`, and `undo()` then has `can_undo: false`.
  - `custom_technique_then_undo_restores_taxonomy`: `add_technique` with `tag: Some` returns `taxonomy`, `created: "halo-glow"` and the tagged reference. **One** `undo` removes both.
  - `set_field_patch_is_one_step`: `set_field([a, b], { note: "harbour", sourceUrl: "https://x" })` sets both fields on both references, and one `undo` clears all four.
  - `import_with_note_and_undo`: `import_paths([small.jpg], "rim light ref", "https://example.org/a")` stores both fields. `library.json` on disk holds the reference **immediately**, with no debounce. `undo` lists the id in `removed`, and the image file remains.
  - `duplicate_only_import_records_no_step`: importing `small.jpg` twice leaves the second import with `can_undo` reflecting only the first.
  - `import_bytes_roundtrip`: the bytes of `small.jpg`, with `x-meta` naming `pasted.jpg`, give one reference titled `"pasted"`. No file is left in the staging temp dir, and nothing new is under the library root except `images/` and `thumbs/` entries.
  - `import_bytes_name_is_contained`: names `"../../evil.jpg"` and `"C:\\x\\evil.jpg"` give the title `"evil"`, and nothing is written outside the staging dir, the library's `images/` or its `thumbs/`.
  - `import_bytes_unicode_name`: `{"name":"Étude.png"}`, percent-encoded, gives the title `"Étude"`. `x-meta = "%ZZ"` returns `Err` without panicking.
  - `percent_decode_cases`: `"%C3%89tude"` gives `"Étude"`, `"a%20b"` gives `"a b"`, and `"%E"` is an `Err`.
  - **Extend** Plan 1's `import_twice_is_serialised_and_deduped` (`commands.rs:657-670`) to one `import_bytes` plus one `import_paths` of the same image. The result is one reference and one duplicate.
  - `after_change_hook_fires`: a hook registered on `hooks::after_change` sees one call per mutating command and per import, including `undo` and `redo`.
  - `debounced_save_lands`: after `add_tags`, `library.json` lacks the tag at once. Within a 2 s polling loop, it has it.
  - `close_flushes_pending`: after `add_tags`, `close_decision` gives `Close`, and `library.json` holds the tag.
  - `close_save_failure_prevents`: with `library.json.tmp` made a directory, `close_decision` gives `Prevent(reason)`, and `retry_save` returns `Err(reason)`. After `exit_without_saving`'s flag is set, `close_decision` gives `Close` without flushing.
  - `open_clears_history`.
  - `open_falls_back_to_horus_library_subfolder`:
    - `create_library(pics, false)` on a non-empty `pics` gives `pics/Horus Library`, and then `open_library(pics)` succeeds with `view.root` equal to that subfolder.
    - A `pics` with no subfolder still gives "That folder is not a Horus library."
    - A `pics` that is itself a library opens itself.
  - `damaged_taxonomy_opens`:
    - `{` in `taxonomy.json` with a good backup opens with the backup warning.
    - With both files damaged, it opens with the read-only warning and `taxonomyReadOnly: true`. `add_technique` and a fake taxonomy-touching `Edit` sent through the recipe both return `Err("TaxonomyReadOnly")`. After a tag edit and 1 s, `taxonomy.json` is byte-identical.
  - `sniff_skips_without_copy`: `fake.psd` and a minimal BMP give `Skip::Unsupported`, and no new file appears in `images/` or its temp files.
  - `inside_library_variant`: importing `<root>/images` gives `Skip::InsideLibrary`, serialised as `{"kind":"insideLibrary"}`.
  - `demo_examples_resolve`: on a library made with the seed taxonomy, `demo::examples` (and the `demo_examples` command) returns entries whose `technique_id` all exist in it, and whose `path` is a file under `demo_dir/images`. A manifest name missing from the taxonomy is skipped, not panicked on.
  - `switch_flushes_pending`: `add_tags` on A, then `open_library(B)` right away, leaves the tag in A's `library.json`. With A's `.tmp` made a directory, `open_library(B)` returns `Err` and A stays open.
  - **Plan 1 test updates that this task makes:**
    - the tuple accesses `.0` (`commands.rs:638`, `:719`) become `.lib`;
    - `import_paths(h, vec![p])` gains the two new arguments and reads `.report` (`:332`, `:597`, `:601`, `:706`);
    - `import.rs:683-686` asserts `Skip::InsideLibrary`.
  - **Vitest, `app/src/save-dialog.test.ts`** (new):
    - Emitting a fake `save-failed` with `<b>disk full</b>` shows "Couldn't save your last changes:", with the reason as text, not markup.
    - "Try again" calls `retrySave` once, and a rejection shows the new reason.
    - "Quit without saving" calls `exitWithoutSaving`.
    - Focus starts on "Try again".
  - **Vitest, `app/src/importer.test.ts`** (new):
    - a report with `{ kind: "insideLibrary" }` renders "already inside the library folder", and `"unsupported"` renders "not a supported image type";
    - after `mountImport`'s import, the hook receives `result.change`, and `api.openLibrary` is **not** called (B4).

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test` (the whole crate) and `npm test -- importer api.contract firstrun save-dialog view`. They should FAIL, then PASS. `npm run build` (tsc) must pass after this task.

- [ ] **Step 3: Extend `api.ts`.**
  - **Types:** add `NewTag`, `NewTechnique`, `TagFor`, `FieldPatch`, `DemoExample`, `Change` and `ImportResult`, and `taxonomyReadOnly: boolean` on `LibraryView` (`api.ts:37-44`). Add `| { kind: "insideLibrary" }` to `Skip`.
  - **Wrappers:** add one per command. `importPaths(paths, meta?: { note?; sourceUrl? }): Promise<ImportResult>` keeps `meta` optional.
  - **`importBytes(name, bytes, meta)`** calls `invoke("import_bytes", bytes, { headers: { "x-meta": encodeURIComponent(JSON.stringify({ name, ...meta })) } })`.
  - **Events:** add `onSaveStatus(cb)` and `onSaveFailed(cb)`, using `listen`.
  - **`importer.ts`** (B4): `mountImport`'s `run` (`importer.ts:51-87`) stops calling `api.openLibrary` after an import (`:67-70`).
  - `ImportHooks.onLibrary` is replaced by `onChange(c: Change): void`. The notice shows `summaryHTML(result.report)`, followed by the import's warnings.
  - The import therefore stays undoable (SPEC §6.8, Decision 2).
  - `reason()` (`:19`) switches on `kind`.
  - **The interim view wiring, until Task 7:** `reference/view.ts:409-417` passes `onChange`, which merges `c.references` into the view's `S.refs` and `S.byId` and deletes `c.removed`, then re-renders the status line and the Ranked list. Task 7 replaces this with `store.apply`.

- [ ] **Step 3a: Write the IPC contract test, `app/src/api.contract.test.ts`.**
  - It uses `mockIPC` and `clearMocks` from `@tauri-apps/api/mocks`, and holds one row per command, with the name and the sorted argument keys:
    - **Plan 1, at `25be96d`** (`lib.rs:29-39`, `api.ts:115-132`): `create_library` [`path`, `seedDemo`], `open_library` [`path`], `get_taxonomy` [], `related` [`id`], `search` [`q`], `get_settings` [], `set_settings` [`s`], `system_ram_gb` [].
    - **This plan:** `add_tags` [`refId`, `tags`], `update_tag` [`refId`, `tag`, `tagId`], `remove_tag` [`refId`, `tagId`], `set_field` [`patch`, `refIds`], `add_technique` [`t`, `tag`], `undo` [], `redo` [], `image_path` [`refId`], `demo_examples` [], `import_paths` [`note`, `paths`, `sourceUrl`], `retry_save` [], `exit_without_saving` [].
  - For each row, it calls the `tauriApi` wrapper and asserts the command name and `Object.keys(args).sort()`.
  - **Completeness:** every `Object.keys(tauriApi)` entry not in `NON_IPC_KEYS` must have a row.
    - `NON_IPC_KEYS` is `assetUrl`, the event listeners (`onSaveStatus`, `onSaveFailed`, and later ones), `importBytes`, `pickFolder` and `pickImages`.
    - The two pickers go through `@tauri-apps/plugin-dialog`'s own `plugin:dialog|open`, whose argument shape belongs to the plugin. Their cancel behaviour is tested where they are used.
  - **`importBytes`:** use `vi.mock("@tauri-apps/api/core")`, because ESM exports can't be spied on. Assert the `ArrayBuffer` payload, and an `x-meta` header that decodes back to `{ name, note, sourceUrl }`.
  - Later plans add their rows in their own api steps.

- [ ] **Step 4: Commit.** Commit message: `feat(app): tag, field, technique, undo/redo, intake and close commands`.

---

### Task 6: Search tuning for per-keystroke use (Plan 1 Task 6 review minors)

**Files:**
- Modify:
  - `search.rs`;
  - `app/src-tauri/Cargo.toml`, adding `unicode-normalization = "0.1"`.

**Interfaces:**
- Consumes `search::{search, Hit}` (`search.rs`; `MAX_TECHNIQUES = 8` at `:25`). The signatures are unchanged.
- Produces:
  ```rust
  pub const MIN_QUERY_CHARS: usize = 2;               // after normalise(); shorter -> []
  pub fn normalise(s: &str) -> String;                // NFC, lowercase, non-alphanumeric -> ' ', spaces collapsed, trimmed
  fn has_phrase(hay: &str, phrase: &str) -> bool;     // whole-word phrase match on normalised strings
  ```
- The matching rules, with both sides normalised:
  - **Technique name or synonym:** the field contains `q` as a substring, or `q` contains the field as a whole-word phrase. So "chiaroscuro lighting" finds Chiaroscuro, but "eyesore" doesn't match the synonym "eyes".
  - **Description:** every query word longer than 3 characters appears as a whole word.
  - **Operation:** `has_phrase(q, name) || has_phrase(q, plain_label)`, iterating `tax.operations`. It is data-driven, so renamed and added operations work at once.
  - **Reference:** its normalised title or note contains `q`, or the `why` of a link that touches it does.
- `matchesQuery` (Task 7) mirrors the technique rules, and `match-cases.json` keeps the two in agreement.

- [ ] **Step 1: Write the failing tests.** Keep the 5 existing tests (`search.rs:215-278`) and add:
  - `operation_label_needs_whole_words`, with fixed expected id sets:
    - `"lead the eye"` returns exactly Sequence's technique ids;
    - `"make it stand out"` returns exactly Differentiate's;
    - `"out"` returns only the techniques that match it by text (`pop-out` among them), and no Differentiate technique that matches only through the operation.
  - `min_query_length`: `"a"` gives `[]`. `"ab"` reaches the matcher: a reference titled `"Abbey"` is returned.
  - `custom_operation_label`:
    - A fixture operation `{ id: "provoke", plainLabel: "Make it sting" }`, with one branch and one technique, is found by `"make it sting"` with `operation_id == "provoke"`.
    - Renaming Differentiate's `plainLabel` to `"Pop"` makes `"stand out"` expand nothing, and `"pop"` expand Differentiate.
  - `punctuation_stripped`: `"moody!"` and `"Moody,"` find Chiaroscuro, and `"pop out"` finds Pop-out.
  - `query_contains_name`: `"chiaroscuro lighting"` finds Chiaroscuro.
  - `description_words_over_3`: `"the empty space"` finds Isolation in void, and `"vast space"` does not.
  - `nfc_both_sides`: a reference titled `"E\u{301}tude"` is found by `"Étude"` and by `"étude"`.
  - `note_and_title_match`: one reference is found through its note, and another through its title.
  - `reference_cap_is_4`: 6 references titled "harbour…" give exactly 4 `Hit::Reference`, in library order.
  - `operation_id_rungs`, using Chiaroscuro, which sits under `differentiate.feature` and `sequence.feature`:
    1. a query on the Sequence label gives `"sequence"`;
    2. with Chiaroscuro tagged twice under Sequence and once under Differentiate, a synonym query gives `"sequence"`;
    3. on an untagged library, it gives `"differentiate"`.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test search::`. It should FAIL, then PASS, including the 5 existing tests.

- [ ] **Step 3: Commit.** Commit message: `fix(core): word-boundary, NFC and punctuation-aware idea search`.

---

### Task 7: The UI store, the pure tagging model, the undo keys, and the Reference view on the store

**Files:**
- Create:
  - `app/src/store.ts`;
  - `app/src/ops.ts`;
  - `app/src/esc.ts`;
  - `app/src/tagging/model.ts`;
  - `app/src/tagging/match-cases.json`;
  - `app/src/keys.ts`.
- Modify:
  - `app/src/firstrun.ts`: `boot()` builds the Store (B7);
  - `app/src/firstrun.test.ts`;
  - `app/src/reference/view.ts`;
  - `app/src/reference/view.test.ts`;
  - `app/src/importer.ts` and `app/src/search.ts`: they import `esc` from `esc.ts` and delete their local copies.
- Test:
  - `app/src/store.test.ts`;
  - `app/src/ops.test.ts`;
  - `app/src/esc.test.ts`;
  - `app/src/tagging/model.test.ts`;
  - `app/src/keys.test.ts`;
  - the Rust `search::tests::shared_match_cases`, which reads `include_str!("../../src/tagging/match-cases.json")`.

**Interfaces:**
- Consumes the `api.ts` types (Task 5).
- Produces:
  ```ts
  // store.ts
  export type Store = { root: string; warning?: string | null; refs: Map<string, Reference>; tax: Taxonomy; links: Link[];
    canUndo: boolean; canRedo: boolean; taxonomyReadOnly: boolean;
    apply(c: Change): void; reset(view: LibraryView, tax: Taxonomy): void;   // reset: library switch; notifies { reset: true }
    subscribe(fn: (c: Change & { reset?: boolean }) => void): () => void; inbox(): Reference[] };
  export function createStore(view: LibraryView, tax: Taxonomy): Store;   // root, warning and taxonomyReadOnly come from the view
  // links come from LibraryView; Plan 2 never changes them (Plan 4 adds Change.links)
  // ops.ts — owned by Plan 3 Task 2; the same interface whichever plan lands first creates the file
  export type Ink = { base: string; text: string; on: string };
  export const SEED_INK: Record<string, "diff" | "group" | "seq" | "infer">;   // differentiate, group, sequence, infer
  export const EXTRA_INKS: readonly ["teal", "olive", "rose", "indigo", "umber"];   // Plan 3 (graph-views plan, line 702)
  export function opInk(tax: Taxonomy, opId: string): Ink;
  // color ∈ EXTRA_INKS -> var(--x-<c>), var(--x-<c>-text), var(--x-<c>-on); else seed id -> var(--k…); else
  // neutral { base: "var(--ink-2)", text: "var(--ink)", on: "var(--panel)" }
  export function opLabel(tax: Taxonomy, opId: string): { plain: string; name: string };   // unknown id -> { plain: opId, name: opId }
  // esc.ts
  export function esc(s?: unknown): string;   // escapes & < > " and '
  // reference/view.ts
  export function mountReference(root: HTMLElement, api: Api, store: Store): { show(id: string): void; ready: Promise<void>; destroy(): void };
  // ready is resolved at mount (no data to load); kept so view.test.ts:84 still awaits it
  // tagging/model.ts
  export function techniquesFor(tax: Taxonomy, opId: string): Technique[];
  export function domainChoice(tax: Taxonomy, opId: string, techId: string): { branchId: string } | { ask: Branch[] };
  export function matchesQuery(t: Technique, q: string): boolean;
  // name or synonym: the field contains q, or q contains the field as a whole-word phrase;
  // description: every q word over 3 chars appears as a whole word; NFC + lowercase + punctuation to space; blank -> true
  export function examplesFor(refs: Iterable<Reference>, techId: string, n?: number, demo?: DemoExample[]): Example[];
  // n = 2; library first (confirmed before suggested, newest first), then demo examples to fill up to n (SPEC §6.2)
  export type Example = { kind: "library"; ref: Reference } | { kind: "demo"; demo: DemoExample };
  export function presetFrom(source: Reference): NewTag[];
  // keys.ts
  export function wireUndoKeys(doc: Document, api: Api, store: Store): () => void;
  ```
- **`boot()` builds the Store (B7).** `firstrun.ts` `boot()` (`firstrun.ts:13-29`):
  1. opens the last library, or runs first run;
  2. calls `api.getTaxonomy()`;
  3. calls `createStore(lib, tax)`;
  4. mounts `mountReference(root, api, store)`.
- **The view reads from the Store** (audit #28):
  - It no longer opens a library, and keeps no private copy of the references, links or taxonomy.
  - It keeps its view state (the focus, trail, pin, hot callout, filter and paint timer) and its non-library settings: the theme and the Find similar status, still from `getSettings` (`view.ts:433`).
  - It reads `store.refs`, `store.tax` and `store.links`.
  - **Its status line and the importer's `libraryRoot()`** (`view.ts:409-410`) read `store.root`.
  - **It shows `store.warning`** through `mountImport`'s `say` notice, on mount and after every `reset`, which keeps `982f8a6`'s notice and its tests (`view.test.ts:177-210`) passing.
  - It replaces `OP_KEY` (`view.ts:9`) with `opInk` and `opLabel`.
  - It re-renders on any `Change` touching the focused reference, its related references or the taxonomy.
  - **If the focused reference is removed,** the view moves to the previous reference in the trail, then the first reference, then the empty state "No references yet."
- **The Plan 1 view `keydown`** returns early inside `.picker`, `.lightbox`, `textarea`, `[contenteditable]` and any `input` (Global Constraints).

- [ ] **Step 1: Write `match-cases.json`,** checked against the seed:
  - `moody` → `chiaroscuro`: true;
  - `spotlight` → `chiaroscuro`: true;
  - `a very moody scene` → `chiaroscuro`: true;
  - `empty space` → `isolation-in-void`: true;
  - `moody` → `rim-light`: false;
  - `backlit` → `rim-light`: true;
  - `chiaroscuro lighting` → `chiaroscuro`: true;
  - `moody!` → `chiaroscuro`: true;
  - `pop out` → `pop-out`: true;
  - `eyesore` → `face-schema`: false.

- [ ] **Step 2: Write the failing tests**
  - **Store:**
    - `apply` merges changed references, deletes `removed`, swaps the taxonomy, and updates `canUndo` and `canRedo`.
    - `inbox()` excludes a reference whose only tag is partial.
    - `reset` replaces `root`, `warning` and the data, and notifies `{ reset: true }`.
  - **`ops`:**
    - If Plan 3 created `ops.ts` first, reuse its tests and add only the `opLabel` cases. Otherwise create it with:
      - `opInk(seed, "group")` gives `{ base: "var(--group)", text: "var(--group-text)", on: "var(--group-on)" }`;
      - `color: "teal"` gives `var(--x-teal…)`;
      - an unknown id or colour gives the neutral triple.
    - `opLabel` reads the data.
  - **`esc`:** `esc('<img src=x onerror="a">&\'')` gives `&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;`.
  - **The Reference view on the Store,** with a fake `Api` and a real `Store`:
    - `store_change_rerenders_focus`: a `Change` adding a tag to the focused reference raises the callout count, with no `show()` call.
    - `taxonomy_rename_rerenders`: renaming Chiaroscuro through `Change.taxonomy` updates the callout title.
    - `removed_focus_falls_back`.
    - `reset_switches_library`: the status line shows the new folder name.
    - `no_private_fetch`: `mountReference` never calls `api.openLibrary`.
    - `warning_shown_from_store`: replaces the `982f8a6` cases' `initial` with a Store carrying `warning`. The notice shows it, and after `reset` with a new warning, the notice shows that one.
    - `unknown_op_is_neutral`: a tag under an operation id missing from `store.tax` draws in `var(--ink-2)`, never amber.
    - `typing_in_picker_search_does_not_pin`: a `keydown` of `"2"` whose target is inside a `.picker` input doesn't pin callout 2.
  - **`firstrun.test.ts`:** `boot()` builds a Store whose `root` equals the opened library's root, and mounts the view with it.
  - **Model:**
    - `techniquesFor(seed, "group")` contains `color-blocking` and not `pop-out`.
    - `domainChoice(seed, "differentiate", "chiaroscuro")` gives `{ branchId: "differentiate.feature" }`, and the two-branch fixture gives `{ ask: [both] }`.
    - The `match-cases.json` cases pass through `matchesQuery`.
    - `examplesFor` returns at most 2, with a confirmed tag ranked above a suggested one. With no library example and 3 demo examples, it returns 2 `{ kind: "demo" }`. With 1 library example and demo examples, it returns the library one first, then 1 demo.
    - `presetFrom` skips partial tags, drops regions, and collapses duplicates.
  - **Keys:**
    - Ctrl+Z on `body` calls `api.undo` once, and Ctrl+Shift+Z and Ctrl+Y call `api.redo`.
    - Ctrl+Z inside an `input`, a `textarea` or a `[contenteditable]` calls neither (Review Focus 1).
    - Each result goes to `store.apply`.

- [ ] **Step 3: Run, then implement, then run again.** Run `npm test` and `cargo test search::`. They should FAIL, then PASS.

- [ ] **Step 4: Commit.** Commit message: `feat(ui): change store, Reference view on the store, tagging model and undo keys`.

---

### Task 8: The technique picker (SPEC §6.1–6.4, 6.7, 6.8)

**Files:**
- Create: `app/src/tagging/picker.ts` and `app/src/tagging/picker.test.ts` (jsdom, a fake `Api` and a real `Store`).
- Modify:
  - `app/src/styles.css`: the picker block, using existing tokens only;
  - `app/src/reference/view.ts`: the "Tag…" entry, and suspending pinning while the picker is open;
  - `app/src/reference/view.test.ts`.

**Interfaces:**
- Consumes Task 7, plus `api.addTags`, `addTechnique`, `updateTag`, `removeTag`, `demoExamples` and `assetUrl`.
- Produces:
  ```ts
  export type PickerOpts = { refId: string; region?: Region; preset?: NewTag[]; inbox?: boolean; onDone?: () => void };
  export function mountPicker(root: HTMLElement, api: Api, store: Store, opts: PickerOpts): { close(): void; el: HTMLElement };
  ```
- **Opening it:**
  - **On any reference:** "Tag…" on the Reference view's plate, or the `t` key, docks the picker in the margin for the focused reference, with no region. So an already-tagged reference can gain a whole-image tag.
  - The Inbox (Task 9), a drop (Task 9) and the lightbox (Task 10) open it too.
- **Layout:**
  - **One operation button per `store.tax.operations` entry,** in taxonomy order. Each shows `opLabel(…).plain` in serif, `.name` in mono, and an `opInk(…).base` swatch, set through a class or the CSSOM. The row wraps. It re-renders when `store.tax` changes, and clears the choice if the chosen operation was deleted.
  - **After an operation is chosen,** technique cards appear. Each shows:
    - its name;
    - its `icon` as glyph text, until Plan 6 draws the icons;
    - its one-line description;
    - up to 2 example thumbnails from `examplesFor(store.refs.values(), id, 2, demo)`. `demo` is fetched once with `api.demoExamples()` when the picker first opens, then cached. Demo thumbnails come from `assetUrl(path)` and carry a small "demo" label (SPEC §6.2).
  - **A search field** filters the cards with `matchesQuery`.
  - **Choosing a card** shows a muted domain chip. When `domainChoice` returns `ask`, the chip becomes a radio group, and Enter waits for a pick.
  - **"+ New technique"** is the last card while the search text isn't empty. It opens an inline form with a name, a one-line description, and a domain select listing that operation's branch domains.
    - Submitting calls `addTechnique(t, { refId, region })` once.
    - `NameTaken:<id>` shows "Already exists: <Name> — use it".
    - `TaxonomyReadOnly` shows "The technique list is read-only because taxonomy.json is damaged." While `store.taxonomyReadOnly` is true, "+ New technique" is disabled.
  - **The reference's current tags** appear as chips, for example "Stand out › Chiaroscuro". Each has × (or Delete when the chip is focused), which calls `removeTag`. A suggested tag also has ✓, which calls `updateTag` with the same values.
  - **With a `preset`** ("Tag like this"), those techniques start ticked. Enter applies all the ticked ones in one `addTags` call.
- **Keyboard,** while focus is inside the picker. The view's pinning is suspended (Task 7's early return):
  - **`1`–`9`** choose the operation in that position, but only while focus is **not** in a text field, so digits type into the search box.
  - **A printable key,** outside a text field, focuses the search field and types it.
  - **↑ and ↓** move between cards. ← and → do too, except when the picker is docked in the Inbox, where they belong to the Inbox.
  - **While the search text isn't empty,** the first visible card is highlighted automatically.
  - **Enter** applies the highlighted card. With nothing highlighted (empty search, no arrow use), it applies a partial tag with only the operation.
  - **Space** ticks or unticks a card.
  - **Esc** clears the search, then closes the picker.
  - **Tab** moves between the row, the search field, the grid and the chip.

- [ ] **Step 1: Write the failing tests**
  - With the seed, the buttons read "Stand out", "Hold together", "Lead the eye" and "Make them think", in that order, and `2` selects Group.
  - `dynamic_operations`: a 5-operation fixture gives 5 buttons, `5` selects the fifth and `6` does nothing. With 9 operations, `9` works. With 1, a single button renders.
  - `renamed_operation_label`: a `Change` renaming `group` to "Bundle" updates the button, with no remount.
  - `deleted_operation_clears_choice`.
  - `custom_domain_listed`: a branch to a new domain `"texture"` appears in the form's select.
  - `filter_then_enter`: `1`, then typing `moody`, leaves one card, Chiaroscuro, highlighted. Enter calls `addTags([{operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.feature"}])`.
  - `digits_type_in_search`: with focus in the search field, typing `2` adds `"2"` to the query and doesn't change the operation.
  - `ask_domain`: the two-branch fixture shows two radios, and Enter waits for a pick.
  - `partial_tag`: `3`, then Enter with no card highlighted, calls `addTags([{operationId: "sequence"}])`.
  - `preset`: 2 techniques start ticked, and Enter sends both in one call.
  - `custom_technique`:
    - "Halo glow" calls `addTechnique` once with `tag: { refId }`, and `addTags` never;
    - `NameTaken:chiaroscuro` shows the exact copy, and "use it" calls `addTags` with Chiaroscuro;
    - with `store.taxonomyReadOnly`, the card is disabled.
  - `region`: the opts `region` is on every `NewTag` sent.
  - `chips`: ✓ calls `updateTag(refId, tagId, sameValues)`, and × calls `removeTag(refId, tagId)`.
  - `demo_examples_shown`: for a technique with no library example, and `demoExamples` resolving 2 entries for it, the card shows 2 thumbnails labelled "demo". `demoExamples` is called once across two pickers.
  - **`view.test.ts`:** `t` on the Reference view mounts the picker for the focused reference. `1` while the picker is open doesn't pin.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- picker view`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): plain-language technique picker with inferred domain, synonyms, examples and custom techniques`.

---

### Task 9: The Inbox view, intake, the duplicate prompt and the Library menu

**Files:**
- Create:
  - `app/src/inbox/view.ts` and `app/src/inbox/view.test.ts`;
  - `app/src/intake.ts` and `app/src/intake.test.ts`;
  - `app/src/grid/windowed.ts` and `app/src/grid/windowed.test.ts`: the windowed grid, which Plan 4 reuses;
  - `app/src/library-menu.ts` and `app/src/library-menu.test.ts`;
  - `app/src/views.ts`: the minimal view toggle (below).
- Modify:
  - `app/index.html`: enable the Inbox tab, and add a "Library" menu button at the left of the top bar;
  - `app/src/firstrun.ts` (`boot()`): wire intake, the view toggle and the Library menu;
  - `app/src/reference/view.ts` and `view.test.ts`: `data-ref-drop` on `#plate`;
  - `app/src/importer.ts`: the notice gains the note field and the duplicate rows;
  - `app/src/styles.css`.

**Interfaces:**
- Consumes `mountPicker` (Task 8), `Store` (Task 7), and `api.importPaths`, `importBytes`, `setField`, `pickFolder`, `pickImages`, `openLibrary`, `createLibrary` and `getTaxonomy`.
- Produces:
  ```ts
  export function mountInbox(root: HTMLElement, api: Api, store: Store, deps: { openPicker(o: PickerOpts): void }): { focus(i: number): void; destroy(): void };
  export function mountWindowedGrid<T>(root: HTMLElement, opts: { items: T[]; tile: number; gap: number;
    render(item: T, i: number): HTMLElement; overscanRows?: number /* default 2 */ }):
    { update(items: T[]): void; scrollTo(i: number): void; destroy(): void };   // positions via CSSOM, never style= in HTML
  export type IntakeDeps = { api: Api; store: Store; openPicker(opts: PickerOpts): void; notice(html: string): void };
  // notice = mountImport's say(); intake attaches delegated click/submit handlers to its content; every data value goes through esc()
  export function wireIntake(win: { onDragDropEvent: Function }, doc: Document, deps: IntakeDeps): () => void;
  export function dupRows(report: ImportReport, store: Store, meta: { note?: string; sourceUrl?: string }): DupRow[];
  export type DupRow = { existingId: string; title: string; action: "show" | "merge"; fills: ("note" | "sourceUrl")[] };
  export function mountLibraryMenu(button: HTMLElement, api: Api, store: Store, notice: (html: string) => void): { destroy(): void };
  // views.ts — the minimal view toggle until Plan 3's shell.ts absorbs it
  export type ViewId = "reference" | "inbox";   // Plan 3's ViewId names
  export function mountViews(root: HTMLElement, views: Partial<Record<ViewId, () => void>>): { select(id: ViewId): void; current(): ViewId };
  // sets body[data-view], aria-current on the tab
  ```
- **The view toggle:** Plan 1's tabs are disabled stubs with no shell. `mountViews` switches `body[data-view]` between `"reference"` and `"inbox"`, using Plan 3's `ViewId` names, so Plan 3 Task 2's `shell.ts` can absorb it.
- **Switching libraries,** from the "Library" menu:
  - **"Open library…":** `api.pickFolder("Open a Horus library")`, then `openLibrary(path)`. Picking the parent folder also works (Task 5).
  - **"New library…":** `pickFolder("Choose a folder for the new library")`, then a confirm with the checkbox "Start with the demo set", unticked, then `createLibrary(path, seedDemo)`.
  - **On success:** `store.reset(view, await api.getTaxonomy())`, and the view shows `view.warning` (Task 7).
  - **On `Err`:** the notice shows the message, and the current library stays open.
  - A cancelled picker (`null`) does nothing.
- **The Inbox:**
  - It is a grid of `store.inbox()`, drawn with `mountWindowedGrid`. Each tile is a `thumb256` letterboxed on a fixed-size tile, with `loading="lazy"` and `decoding="async"`. The tab badge shows the live count.
  - Selecting an item docks the picker (`inbox: true`).
  - **Once an item is tagged,** it stays, marked "tagged", until the artist moves to another item (Review Focus 3).
  - **← and →** move between items, unless focus is in a text input. → on the **last** item stays put; nothing wraps.
  - **When the derived list is empty,** the Inbox shows "Inbox is empty. Drop, paste or open a folder to add references."
- **Intake:**
  - **Drag and drop:** `onDragDropEvent` `drop` with `paths` calls `importPaths`, then `store.apply(result.change)`.
    - The drop position is in physical pixels, so it is divided by `devicePixelRatio` before `document.elementFromPoint`.
    - A drop on `[data-ref-drop="<id>"]` (the Reference view's `#plate`) then opens the picker for each new reference with `preset: presetFrom(store.refs.get(id))` (SPEC §6.5).
  - **Paste:** `image/*` clipboard items each call `importBytes`.
    - The source URL comes from the clipboard's `text/html` `<img src="http…">`, or from an http(s) URL in `text/uri-list`.
    - A paste with no image item shows "Paste the image itself — Horus doesn't download from the web." (Review Focus 5).
  - **The file pickers:** "Add images…" in the Inbox header calls `api.pickImages()` (`[]` when cancelled). "Add folder…" calls `api.pickFolder("Add a folder of images")` (`null` when cancelled). Plan 1's status-bar buttons keep working, and every route applies `result.change` to the store.
  - **The note field:** after any intake, the notice shows "Added N to the Inbox" and a one-line note field. Submitting calls `setField(newIds, { note: text })` once, which is one undo step for the batch.
  - **Duplicates (SPEC §9, Decision 1):** each `report.duplicates` entry gives one `DupRow`, "Already in your library: <title>".
    - **Show** opens that reference.
    - **Merge** appears only when the intake carried a note or a `sourceUrl` that the existing reference lacks. It calls `setField([existingId], { …only the empty fields })`, one undo step per reference.

- [ ] **Step 1: Write the failing tests**
  - **Inbox:**
    - 3 untagged references and 1 partially tagged one give 3 tiles, and the badge shows 3.
    - `windowed_grid_bounds_dom` (`grid/windowed.test.ts`): 2,000 items in an 800×600 container (`clientWidth` and `clientHeight` stubbed) create at most 200 `<img>` elements. `scrollTo(1500)` renders tile 1500 and not tile 0. No tile has a `style=` attribute in its serialised HTML.
    - Tagging tile 1 keeps 3 tiles, with tile 1 marked tagged. → then gives 2 tiles.
    - On the last item, → leaves the focus where it is and doesn't throw. With the derived list empty, the empty copy shows.
    - With the picker docked and focus on a card, → moves to the next item and ↓ to the next card. In the search field, → moves the caret.
  - **Intake:**
    - A drop of 2 paths calls `importPaths` once, and applies the returned `change`.
    - `drop_position_scaled`: with `devicePixelRatio = 2`, a drop at physical (400, 300) hit-tests CSS (200, 150).
    - A drop on `[data-ref-drop="r1"]` calls `openPicker` with `preset: presetFrom(r1)` for the new id.
    - A PNG paste with `text/html` `<img src="https://ex.org/a.png">` calls `importBytes` with that `sourceUrl`.
    - A `text/plain`-only paste calls nothing and shows the exact copy.
    - "Add images…": a fake `pickImages` returning 2 paths gives one `importPaths` call, and `[]` gives none.
    - `dupRows`: an existing reference with no `sourceUrl`, plus intake metadata with one, gives `merge` with `fills: ["sourceUrl"]`. With no metadata, it gives `show`. Both fields missing gives `fills: ["note", "sourceUrl"]`, and Merge sends one `setField` with both.
    - `typed_text_is_text`:
      - A note typed as `<img src=x onerror="window.__xss=1">` and saved through a fake `setField` renders as text in the tile tooltip and in the notice.
      - A fake import returning a reference titled `<b>t</b>` renders that title as text.
      - `window.__xss` stays undefined, and no `img[src="x"]` or `b` element comes from the data.
  - **The Library menu:**
    - A fake picker returning `"D:/B"` calls `openLibrary("D:/B")` and then `store.reset`, after which `store.root` is `"D:/B"`.
    - A cancelled picker calls nothing.
    - A rejection shows its message, and `reset` isn't called.
    - "New library…", with the box unticked, calls `createLibrary("D:/C", false)`.
  - **The views:** `select("inbox")` sets `body[data-view="inbox"]` and moves `aria-current`.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- inbox intake library-menu windowed views`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): Inbox triage, drag/paste/folder intake, duplicate merge and library switching`.

---

### Task 10: Region tagging in a minimal lightbox (SPEC §6.6)

**Files:**
- Create:
  - `app/src/lightbox/regions.ts` and `app/src/lightbox/view.ts`;
  - `app/src/lightbox/regions.test.ts` and `app/src/lightbox/view.test.ts`.
- Modify:
  - `app/src/reference/tile.ts`: add `fitBox`;
  - `app/src/reference/view.ts`: "Open lightbox" and the `L` key;
  - `app/src/styles.css`.

**Interfaces:**
- Consumes `api.imagePath` (Task 5), `mountPicker` with a `region` (Task 8), and `tileBox` (`reference/tile.ts:6`, square tiles only).
- Produces:
  ```ts
  export function fitBox(aspect: number, w: number, h: number): Box;   // in tile.ts; letterboxes into any w×h; tileBox(aspect, s, r) calls fitBox(aspect, s, s)
  export type Pt = { x: number; y: number };   // client px
  export const MIN_REGION = 0.01;
  export function normRect(a: Pt, b: Pt, plate: Box): Region | null;   // clamps into the plate, normalises to 0..1, null if w or h < MIN_REGION
  export function openLightbox(api: Api, store: Store, refId: string, deps: { openPicker(opts: PickerOpts): void }): { close(): void };
  ```
- **This is the minimal lightbox only;** Plan 4 replaces its chrome.
  - The full-resolution image comes from `assetUrl(await imagePath(id))`, letterboxed with `fitBox` into the viewport.
  - Existing region tags are outlined through the CSSOM.
  - `v` toggles the value view.
  - Dragging a box calls `deps.openPicker({ refId, region })`.
  - Esc closes the lightbox.
- It opens from "Open lightbox" on the plate, or with the `L` key.

- [ ] **Step 1: Write the failing tests**
  - **`fitBox`:** `fitBox(4/3, 800, 400)` gives `{left: 133.33…, top: 0, width: 533.33…, height: 400}`. `tileBox`'s existing tests still pass.
  - **`normRect`:**
    - On plate `{100, 50, 400, 300}`, a drag from (200, 125) to (300, 200) gives `{.25, .25, .25, .25}`.
    - A reversed drag gives the same region.
    - A drag that starts in the margin and ends past the plate is clamped into 0..1.
    - A 2 px drag gives `null`.
  - **The view:**
    - A pointer down, move and up calls `deps.openPicker` with that region.
    - Esc removes the lightbox.
    - `v` toggles the value class without also toggling the Reference view's checkbox.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- lightbox tile`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): drag a box in a minimal lightbox to tag a region`.

---

### Task 11: Combining techniques with AND/OR in the Ranked filter (SPEC §5a)

**Files:**
- Create: `app/src/reference/filter.ts` and `app/src/reference/filter.test.ts`.
- Modify:
  - `app/src/reference/view.ts`: it replaces `S.filter: string | null`;
  - `app/src/reference/view.test.ts`.

**Interfaces:**
- Produces:
  ```ts
  export type Filter = { techniques: string[]; mode: "and" | "or" };
  export function matchesFilter(ref: Reference, f: Filter): boolean;   // empty -> true; partial tags never match
  export function toggle(f: Filter, techId: string): Filter;
  ```
- **The UI:**
  - Choosing a technique from search or from a callout adds it to the filter.
  - The Ranked pane shows the filter as removable chips, with a switch between "All of" (and) and "Any of" (or, the default).
  - The list ranks matching references by their `related` score.
  - The empty-state copy is "No reference has all of these yet." or "No reference has any of these yet."
- The filter is view state. It is not undoable and not saved, and it resets on navigation, as Plan 1's `show()` does (`view.ts:79`).

- [ ] **Step 1: Write the failing tests**
  - For A = {t1}, B = {t1, t2} and C = {t2}:
    - `and {t1, t2}` gives B;
    - `or {t1, t2}` gives A, B and C;
    - `{}` gives all three.
  - A reference with only a partial tag matches nothing, unless the filter is empty.
  - `toggle` removes an id that is already present.
  - `view.test.ts`:
    - two chips with "All of" leave the single matching reference;
    - `show()` of another reference clears the chips.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- filter view`. It should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): AND/OR technique filter in the Ranked pane`.

---

### Task 12: The end-to-end check (Hoard, then Tag later)

- [ ] **Step 1: Run the full suites.** Run `cargo test`, `cargo clippy --all-targets -- -D warnings` and `npm test`. Expected: all PASS, with no warnings.

  Also run `git grep -nE "(function|const) esc\b" app/src`. Expected: one hit, in `esc.ts`.

- [ ] **Step 2: Manual run.** Run `npm run tauri dev` on a fresh library at `D:\Design Second Brain\Références test 2\`, with the demo set off. Expected:
  1. Dropping a folder of 20 images gives "Added 20 to the Inbox", and the badge shows 20. Ctrl+Z removes all 20, and Ctrl+Shift+Z brings them back.
  2. Dropping it again gives 20 "Already in your library" rows and no new references.
  3. By keyboard only, tag 5 Inbox items (`1` or `2`, type, Enter, →), each in under 10 s.
  4. Dropping a new image onto a reference's plate opens the picker with that reference's techniques ticked.
  5. A box dragged in the lightbox and tagged appears as an outline on the Reference view tile.
  6. "Halo glow" added from the picker appears in `taxonomy.json` with `"custom": true` within 1 s. One Ctrl+Z removes both it and its tag, and `taxonomy.json` drops it within 1 s.
  7. An image pasted from a browser fills `sourceUrl` when the browser supplied `<img>` HTML.
  8. Tag something, then close the window within 0.5 s. On relaunch, the tag is there.
  9. Library → Open library… on another library switches to it. Ctrl+Z then has nothing to undo.

- [ ] **Step 3: Write the notes.** Record the results of Step 2, with any deviations, in `app/README.md` under "Plan 2 end-to-end check".

- [ ] **Step 4: Commit.** Commit message: `test: Plan 2 end-to-end check notes in app/README.md`.

---

## Decisions (answered by the user, 2026-11-25)

1. **Duplicate merge:** fill empty fields only. The app keeps the existing reference and copies across any note or source URL from the new drop into fields that are still empty. Existing values are never overwritten, and there are never two references for one image.
2. **Undo scope:**
   - Undo keeps the last 200 steps, in memory only, and clears them when you switch libraries or restart.
   - Undoing an import removes the references but keeps their image files in the library folder.
3. **From the Plan 3 decisions:** operations can be renamed, added and deleted, and new domain types are allowed.
   - Plan 2 therefore treats operations and domains as data.
   - `opInk` is the single place where operation inks are resolved.

## Pre-flight rulings (2026-11-25, against main `25be96d`)

These come from `PLAN2-PREFLIGHT-SCAN.md`. The blocking rulings B1–B8 are binding, and all are applied above:
- **B1:** paste staging moves to an OS temp dir outside the library.
- **B2:** the unguarded `images_dir`, and `import.rs` in Task 4's Files.
- **B3:** imports save at once and roll back; only edits are debounced.
- **B4:** `importer.ts` applies `result.change` instead of reopening the library.
- **B5:** the flush runs on `CloseRequested`, with a skip flag.
- **B6:** `find_by_name` ignores case and spacing only.
- **B7:** `boot()` builds the Store, and the Store carries `root` and `warning`.
- **B8:** Files lists are complete.

**Rework items R1–R27:** 26 are applied as the scan suggested. Three needed a choice:
- **R16 (merge with two fields): the controller's choice is `set_field` with a `FieldPatch`.** Both fields fill in one call, so a merge is one undo step per reference, as Decision 1 implies.
- **R23 (tagging an already-tagged reference): applied.** "Tag…" and the `t` key on the Reference view (Task 8). SPEC §6 tagging applies to every reference, not only to Inbox items.
- **R24 (the asset scope after a switch): rejected.** The scan suggested forbidding the previous library's directories. In Tauri's asset scope, a forbidden pattern takes precedence over an allowed one. Switching back to that library later in the same session would then leave its images blocked until restart, which is a visible bug.
  - The remaining exposure is that the WebView can still read images from a library the artist opened earlier in this session.
  - That is the artist's own data, and it is local only.
  - The ponytail note at `commands.rs:123-125` stands. Plan 6 may revisit it, using a per-switch scope rebuild if Tauri gains one.

**Cosmetic items C1–C22:** 21 are applied. **C18** (SPEC §3 lists `taxonomy.bak.json`) is the controller's own change on main.
- **C11:** the `esc` source scan moved from a unit test to the Task 12 grep.
- **C19:** handled as a feature rather than a spec delta. The picker shows demo-set examples through `demo_examples` (Tasks 5, 7 and 8), as SPEC §6.2 asks.

**AGY #2's pre-flight check fixes** (also applied):
- `retry_save` closes the window from Rust, so no new capability is needed;
- Task 5 now owns the interim `view.ts` and `view.test.ts` changes its `importer.ts` change forces;
- `demo.rs` is in Task 5's Files;
- the save-failure dialog has an owner, `save-dialog.ts`, with a test.

**Totals:**

| | Count |
|---|---|
| Applied | 55 (8 B, 26 R, 21 C) |
| Rejected | 1 (R24) |
| Controller's own change | 1 (C18) |

## Cross-plan notes

- **Plan 6:** `.incoming/` no longer exists (B1). Plan 6's layout list, and its `sweep_tmp` paths, should drop it. `taxonomy.bak.json` stays.
- **Plan 3:**
  - Task 9's taxonomy edits get `Err("TaxonomyReadOnly")` from the shared recipe, through `Edit::touches_taxonomy`.
  - `views.ts` (Task 9) uses Plan 3's `ViewId` names, for `shell.ts` to absorb.
  - `ops.ts` matches Plan 3 Task 2's interface, including `EXTRA_INKS`.
- **Plan 4** reuses `grid/windowed.ts`, `fitBox` and `openLightbox`'s `deps.openPicker`.
