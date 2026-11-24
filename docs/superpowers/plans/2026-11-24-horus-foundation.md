# Horus Foundation (Plan 1 of 6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Tauri v2 desktop app that creates or opens a library folder, imports images safely, scores correlations, searches by idea, and shows the Reference view from the prototype wired to real data.

**Architecture:**
- **Rust core** (`src-tauri/src/`), split into focused modules:
  - `library`: the folder, `library.json`, atomic save and backup.
  - `taxonomy`: loads and validates the taxonomy.
  - `import`: hashing, copying, thumbnails and ICC conversion.
  - `correlate`: IDF and cosine scoring.
  - `search`: idea search.
- **Thin Tauri commands** expose the core to the UI.
- **TypeScript frontend** (`src/`): ports `prototype/` into ES modules and swaps its `sample.js` and `fetch` data for an `api.ts` adapter over `invoke()`. Images load through Tauri's asset protocol, scoped to the library folder.

**Tech Stack:** Tauri 2, Rust stable (2021 edition), TypeScript and Vite (the `vanilla-ts` template), Vitest.

**Rust crates:**
- `serde` and `serde_json`;
- `thiserror`;
- `blake3`;
- `image` 0.25 (`jpeg`, `png`, `webp`, `tiff`, `gif`);
- `qcms`, for ICC conversion in pure Rust;
- `walkdir`;
- `tempfile`, as a dev dependency.

**Spec:** `SPEC.md` (draft 5, approved 24 Nov 2026), with `PRODUCT.md` and `prototype/` as the UI reference, and `.impeccable/surfaces/prototype-index-html.md` as the direction contract.

**The series.** Each plan ships working software:

1. **Foundation** (this plan).
2. Tagging, Inbox and undo/redo.
3. Graph views: Tree, Galaxy and Radial, in PixiJS.
4. Boards, Lightbox, Compare and links.
5. Search option B (Find similar, using CLIP) and the Settings and first-run model step.
6. Intro card, taxonomy editor and packaging for all three operating systems.

## Global Constraints

- Tauri v2, with a Rust core and a TypeScript UI. No Node runtime ships in the app. It works fully offline.
- A library is one folder containing exactly:
  - `library.json`;
  - `library.bak.json`;
  - `taxonomy.json`;
  - `images/<blake3-hex>.<ext>`;
  - `thumbs/256/<blake3-hex>.jpg`;
  - `thumbs/1024/<blake3-hex>.jpg`.
- Every save is atomic: write `<file>.tmp`, then rename it over the original. The previous good `library.json` is copied to `library.bak.json` before each save.
- Imported images are copied into the library. Originals are never moved or modified.
- Correlation:
  - Cosine similarity over technique entries weighted `ln(1 + N/df)`, plus branch entries weighted `BRANCH_W = 0.3`.
  - Operation-only (partial) tags have weight 0.
  - A technique tagged on several regions counts once.
  - Related results need a score of at least `MIN_SCORE = 0.05`.
- The seed taxonomy is `taxonomy/taxonomy.json`. Every new library gets a copy.
- `reference/`, `REFERENCE-ANALYSIS.md` and `.impeccable/mocks/` contain third-party material. They go in `.gitignore` and never enter the repository or a build.
- The UI tokens, type, layout and copy come from `prototype/styles.css` and `prototype/index.html`:
  - Source Serif 4 and Red Hat Mono, self-hosted in `src/fonts/`;
  - the system UI stack for UI text;
  - the operation inks and the N5 grey card.
- The UI uses each operation's plain-English label from the taxonomy. The seed's labels are "Stand out", "Hold together", "Lead the eye" and "Make them think". Operations are editable from Plan 3 on, so no code may assume exactly four.

## Review Focus

1. **Saving fails part-way** (a disk-full error, or a network or removable drive vanishing). `library.json` must stay the last good version, the error must be shown, and no data may be lost. This is tested in Task 2.
2. **Unsupported or huge files are dropped in**, such as PSD, HEIC, a 0-byte file or a 300 MB TIFF. Each is skipped with a stated reason, the rest of the batch still imports, and no partial file is left in `images/`. This is tested in Task 4.
3. **The same image comes from two folders, or the same batch, twice.** The result is one reference, and the import report lists the duplicate. This is tested in Task 4.
4. **A library has no tagged references, or a reference has only partial tags.** `related()` returns an empty list and never NaN or a division by zero. This is tested in Task 5.
5. **Paths contain spaces or non-ASCII characters**, for example `D:\Design Second Brain\Références`. Create, open, import and asset URLs all work. This is tested in Tasks 2, 4 and 8.

---

### Task 1: Toolchain, repository and Tauri scaffold

**Files:**
- Create: `app/` (the Tauri project root), `.gitignore` and `app/README.md`.

**Interfaces:**
- Produces:
  - the `app/src-tauri` crate `horus`, with the library target `horus_lib`;
  - `npm run tauri dev`;
  - `cargo test` (run in `app/src-tauri`);
  - `npm test` (Vitest).

- [ ] **Step 1: Install the toolchain**

  Windows is the primary development box.
  - Install rustup with `winget install Rustlang.Rustup` (stable, MSVC).
  - Install the Visual Studio Build Tools with the "Desktop development with C++" workload.
  - Windows 11 already includes WebView2.

  Verify: `cargo --version` and `rustc --version` both print versions of 1.80 or later.

- [ ] **Step 2: Initialise git in `taxonomy-of-visuals/`**

  Write `.gitignore` with these entries:
  - `reference/`
  - `REFERENCE-ANALYSIS.md`
  - `.impeccable/mocks/`
  - `.impeccable/review/`
  - `.impeccable/questions/`
  - `app/node_modules/`
  - `app/src-tauri/target/`
  - `app/dist/`

  Verify: `git status --ignored` lists `reference/` and `REFERENCE-ANALYSIS.md` as ignored.

- [ ] **Step 3: Scaffold the app**

  Run `npm create tauri-app@latest app -- --template vanilla-ts --manager npm --identifier art.horus.app`. Set the product name to `Horus` in `tauri.conf.json`. Add `vitest` as a dev dependency, and set the `"test": "vitest run"` script.

- [ ] **Step 4: Verify it runs**

  Run `cd app && npm install && npm run tauri dev`.
  Expected: a window titled Horus opens, and `cargo test` passes with 0 tests.

- [ ] **Step 5: Commit**

  Commit message: `chore: scaffold Horus Tauri v2 app and gitignore third-party reference material`.

---

### Task 2: The `library` module (folder, model, atomic save)

**Files:**
- Create: `app/src-tauri/src/library.rs` and `app/src-tauri/src/model.rs`.
- Test: `#[cfg(test)]` blocks in each file.

**Interfaces:**
- Produces, in `model.rs`. These types follow SPEC §3. Every one derives `Serialize, Deserialize, Clone, Debug, PartialEq`, uses camelCase for JSON, and treats `Option` fields as skip-if-none.
  ```rust
  pub struct Region { pub x: f32, pub y: f32, pub w: f32, pub h: f32 }          // 0..1
  pub struct Tag { pub id: String, pub operation_id: String,
                   pub technique_id: Option<String>, pub branch_id: Option<String>,
                   pub region: Option<Region>, pub suggested: bool }
  pub struct Reference { pub id: String, pub title: String, pub creator: Option<String>,
                   pub year: Option<String>, pub source_url: Option<String>, pub credit: Option<String>,
                   pub note: Option<String>, pub file: String, pub hash: String,
                   pub width: u32, pub height: u32, pub added_at: String, pub tags: Vec<Tag> }
  pub struct Link { pub id: String, pub from_ref: String, pub to_ref: String, pub why: String }
  pub struct Board { pub id: String, pub name: String, pub reference_ids: Vec<String> }
  pub struct LibraryData { pub version: u32, pub references: Vec<Reference>,
                   pub links: Vec<Link>, pub boards: Vec<Board> }
  ```
  - The type is `Tag`, with tags embedded in each `Reference`. Embedding replaces the spec's separate `Tag.referenceId`.
  - Inbox status is derived, never stored: a reference with no tags is in the Inbox.
- Produces, in `library.rs`:
  ```rust
  pub enum LibraryError { Io(std::io::Error), Corrupt { recovered_from_backup: bool }, NotALibrary }
  pub struct Library { pub root: PathBuf, pub data: LibraryData }
  impl Library {
      pub fn create(root: &Path, seed_taxonomy: &Path) -> Result<Library, LibraryError>;
      pub fn open(root: &Path) -> Result<Library, LibraryError>;
      pub fn save(&self) -> Result<(), LibraryError>;
      pub fn image_path(&self, r: &Reference) -> PathBuf;
      pub fn thumb_path(&self, hash: &str, size: u32) -> PathBuf;   // size ∈ {256, 1024}
  }
  ```

- [ ] **Step 1: Write the failing tests**
  - `create_makes_layout`: after `create`, the folder contains `library.json`, `taxonomy.json`, `images/`, `thumbs/256/` and `thumbs/1024/`.
  - `save_roundtrip`: open, then save, then open returns equal data.
  - `save_is_atomic`: after `save`, no `library.json.tmp` remains, and `library.bak.json` equals the previous contents.
  - `save_failure_keeps_last_good`: make the `.tmp` path a directory so the write fails. `save` returns `Err(Io)`, and `library.json` is byte-identical to before.
  - `corrupt_json_recovers_from_backup`: write `{` into `library.json`. `open` returns the backup's data and reports `recovered_from_backup: true`. The caller surfaces this as a warning.
  - `unicode_path`: create and open work under `tempdir()/Références Été/`.

- [ ] **Step 2: Run the tests to check they fail**

  Run `cargo test library::`. Expected: compile errors or FAIL.

- [ ] **Step 3: Implement `model.rs` and `library.rs`**

  Use `tempfile::NamedTempFile::new_in(root)` followed by `persist` for the atomic rename. Copy the backup with `fs::copy` before persisting.

- [ ] **Step 4: Run the tests to check they pass**

  Run `cargo test library::`. Expected: all 6 PASS.

- [ ] **Step 5: Commit**

  Commit message: `feat(core): library folder model with atomic save and backup recovery`.

---

### Task 3: The `taxonomy` module

**Files:**
- Create: `app/src-tauri/src/taxonomy.rs`.
- Copy: `taxonomy/taxonomy.json` to `app/src-tauri/resources/taxonomy.json`. Bundle it through `tauri.conf.json` `bundle.resources`.

**Interfaces:**
- Produces:
  ```rust
  pub struct Taxonomy { pub operations: Vec<Operation>, pub domains: Vec<Domain>,
      pub branches: Vec<Branch>, pub techniques: Vec<Technique>, pub branch_techniques: Vec<BranchTechnique> }
  // field names exactly as in taxonomy/taxonomy.json (camelCase): Operation{id,name,plainLabel,color,icon,description},
  // Technique{id,name,icon,description,synonyms,citation,examples,custom}, Branch{id,operationId,domainId},
  // BranchTechnique{branchId,techniqueId,source,rationale}
  // Every struct also carries `#[serde(flatten)] extra: serde_json::Map<String, Value>`, so unknown fields survive a load/save round-trip (Plan 6 saves the taxonomy).
  impl Taxonomy {
      pub fn load(path: &Path) -> Result<Taxonomy, String>;
      pub fn validate(&self) -> Result<(), Vec<String>>;          // same rules as taxonomy/check_taxonomy.py
      pub fn branches_for(&self, operation_id: &str, technique_id: &str) -> Vec<&Branch>;
  }
  ```

- [ ] **Step 1: Write the failing tests**
  - `seed_validates`: load the bundled seed. `validate()` is `Ok`, there are 48 techniques, 18 branches and 55 branch–technique links, and the observed path `differentiate.feature` → `complementary-pairing` is present.
  - `validate_catches_dangling`: a technique link to a branch id that doesn't exist returns an `Err` naming that id.
  - `roundtrip_preserves_fields`: load the seed, serialise it, and parse it again. The result equals the original as `serde_json::Value`, including `color`, `examples` and any unknown key.
  - `branches_for_dag`: `branches_for("differentiate", "chiaroscuro")` returns at least one branch. A technique that sits under two branches of the same operation returns both, so the tag picker must ask (SPEC §6.3).

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test taxonomy::`. It should FAIL, then PASS after the implementation.

- [ ] **Step 3: Commit**

  Commit message: `feat(core): taxonomy loader and validator`.

---

### Task 4: The `import` module (hash, copy, dedupe, thumbnails, ICC)

**Files:**
- Create:
  - `app/src-tauri/src/import.rs`;
  - `app/src-tauri/tests/fixtures/`:
    - `small.jpg`, 64×48;
    - `p3_red.png`, a pure P3 red with an embedded Display P3 profile, generated once by `scripts/make_icc_fixture.py` using Pillow `ImageCms` and committed;
    - `fake.psd`, the text `8BPS` followed by junk;
    - `empty.jpg`, 0 bytes.

**Interfaces:**
- Consumes: `Library`, `Reference` and `Library::thumb_path` from Task 2.
- Produces:
  ```rust
  pub enum Skip { Unsupported(String), Unreadable(String), TooLarge(u64) }
  pub struct ImportReport { pub added: Vec<String>, pub duplicates: Vec<(PathBuf, String)>, pub skipped: Vec<(PathBuf, Skip)> }
  pub const MAX_BYTES: u64 = 500 * 1024 * 1024;
  pub struct ImportOutcome { pub references: Vec<Reference>, pub report: ImportReport }
  pub fn import_paths(root: &Path, known_hashes: &HashMap<String, String>, paths: &[PathBuf]) -> ImportOutcome;
  // files or folders (recursive via walkdir)
  ```
  - `known_hashes` maps a hash to an existing reference id.
  - `duplicates` holds pairs of the source path and the id of the existing reference, or of the earlier file in the same batch.
  - `import_paths` copies files and writes thumbnails under `root`, but never touches `LibraryData`. The caller holds no lock while it runs. Afterwards the caller appends `references` to the library under the lock and saves. This keeps intake from blocking the UI (SPEC §9).
  - ICC: if a profile can't be parsed or transformed, which `qcms` does to many ICC v4 profiles, the thumbnail is made without conversion. The import still succeeds, and the reason goes into `report.warnings: Vec<(PathBuf, String)>`.

- [ ] **Step 1: Write the failing tests**
  - `imports_and_thumbs`: after importing `small.jpg`, there is one reference with `width == 64` and `height == 48`. `images/<hash>.jpg` exists. `thumbs/256/<hash>.jpg` exists, and its longest side is at most 256; images smaller than the thumbnail size are never upscaled.
  - `dedupes_same_bytes`: importing `[small.jpg, copy_of_small.jpg]` gives one in `added` and one in `duplicates`.
  - `skips_with_reasons`:
    - `fake.psd` gives `Unsupported` or `Unreadable`.
    - `empty.jpg` gives `Unreadable`.
    - Neither leaves a file in `images/`.
    - A valid file in the same batch is still added.
  - `too_large_is_skipped_without_reading`: use a sparse file with `set_len(MAX_BYTES + 1)`. It gives `TooLarge`.
  - `icc_converted_to_srgb`: the 256 thumbnail of `p3_red.png` has a centre pixel whose red channel is within 3 of 255, with G and B both above 0, because P3 red is clipped and converted into sRGB. Without the conversion it would read as `(255, 0, 0)`. The original in `images/` stays byte-identical to the source.
  - `bad_icc_falls_back`: an image whose embedded profile is corrupt bytes still imports, and its warning is recorded in `report.warnings`.
  - `folder_import_recurses_unicode`: importing a folder `Été/sub/` that contains `small.jpg` gives one reference.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test import::`. It should FAIL, then PASS after the implementation.
  - Hash with `blake3::Hasher::update_reader`.
  - Write `images/` through `.tmp` and then rename, so a failure never leaves a partial file.
  - Generate the thumbnails with `image::imageops::thumbnail`.
  - When `decoder.icc_profile()` returns a profile, run the decoded RGBA through `qcms::Transform` to sRGB before resizing.

- [ ] **Step 3: Commit**

  Commit message: `feat(core): safe import with BLAKE3 dedupe, thumbnails and ICC→sRGB`.

---

### Task 5: The `correlate` module (SPEC §4)

**Files:**
- Create: `app/src-tauri/src/correlate.rs`.

**Interfaces:**
- Consumes: `LibraryData`, `Reference` and `Tag`.
- Produces:
  ```rust
  pub const BRANCH_W: f64 = 0.3;
  pub const MIN_SCORE: f64 = 0.05;
  pub struct Scored { pub id: String, pub score: f64, pub shared_techniques: Vec<String>, pub shared_branches: Vec<String> }
  pub struct Index { /* idf by technique id */ }
  impl Index {
      pub fn build(data: &LibraryData) -> Index;                       // N = references with ≥1 technique tag
      pub fn score(&self, a: &Reference, b: &Reference) -> Scored;
      pub fn related(&self, data: &LibraryData, id: &str) -> Vec<Scored>; // ≥ MIN_SCORE, desc, excludes self
  }
  ```

- [ ] **Step 1: Write the failing tests.** Each test builds its own small `LibraryData`.
  - `identical_sets_score_one`: the score is within 1e-9 of 1.0.
  - `one_vs_six_is_about_0_408`:
    - A has technique `t1` under branch `b1`.
    - B has techniques `t1` to `t6` under branches `b1` to `b6`.
    - Every technique's df is equal.
    - The score is within 0.001 of 0.408, which is 1/√6.
  - `same_branch_different_technique_is_partial`: the score is greater than 0 and less than 0.5, `shared_branches` holds that branch, and `shared_techniques` is empty.
  - `partial_tags_count_zero`: when both references have only operation-only tags, the score is 0, not NaN.
  - `regions_collapse`: three region tags of `t1` score the same as a single `t1` tag.
  - `empty_library_related_is_empty`: when no reference has tags, `related` returns `[]`.
  - `rare_beats_common`: in a library where `t_common` is on 9 of 10 references and `t_rare` on 2, a pair sharing only `t_rare` outscores a pair sharing only `t_common`.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test correlate::`. It should FAIL, then PASS after the implementation. The algorithm matches `prototype/app.js` `vec()`/`score()`, using raw `ln(1 + N/df)`.

- [ ] **Step 3: Commit**

  Commit message: `feat(core): cosine correlation with smoothed IDF`.

---

### Task 6: The `search` module (option A, idea search)

**Files:**
- Create: `app/src-tauri/src/search.rs`.

**Interfaces:**
- Consumes: `Taxonomy` and `LibraryData`.
- Produces:
  ```rust
  pub enum Hit { Technique { id: String, operation_id: String, count: usize }, Reference { id: String } }
  pub fn search(tax: &Taxonomy, data: &LibraryData, q: &str) -> Vec<Hit>;   // ≤ 8 technique hits then ≤ 4 reference hits
  ```

  How matching works:
  - Matching is case-insensitive.
  - A technique matches its name, any synonym, or all words longer than 3 characters in its description.
  - An operation's name or plain label matches all of that operation's techniques.
  - A reference matches its title, its note, or the "why" note on any link that touches it.
  - Techniques are sorted by how many references are tagged with them.

- [ ] **Step 1: Write the failing tests**
  - `moody_finds_chiaroscuro`: the seed taxonomy has "moody" as a synonym of chiaroscuro.
  - `plain_label_expands_operation`: `"stand out"` returns only techniques under `differentiate`.
  - `link_note_finds_reference`: searching for a word that only appears in a link's `why` returns `Hit::Reference`.
  - `blank_query_is_empty`: `"   "` returns `[]`.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test search::`. It should FAIL, then PASS after the implementation.

- [ ] **Step 3: Commit**

  Commit message: `feat(core): idea search over techniques, synonyms and the artist's own words`.

---

### Task 7: Tauri commands, app state and the asset scope

**Files:**
- Modify: `app/src-tauri/src/lib.rs` and `app/src-tauri/tauri.conf.json`.
- Create:
  - `app/src-tauri/src/commands.rs`;
  - `app/src-tauri/src/settings.rs`;
  - `app/src-tauri/capabilities/default.json`.

**Interfaces:**
- Consumes: Tasks 2 to 6.
- Produces the commands. Every one returns `Result<T, String>` and is registered in `invoke_handler`. All JSON is camelCase.
  ```
  create_library(path: String) -> LibraryView          // copies bundled taxonomy, seeds demo set if `seed_demo`
  open_library(path: String) -> LibraryView             // LibraryView { root, references, links, warning: Option<String> }
  get_taxonomy() -> Taxonomy
  related(id: String) -> Vec<Scored>
  import_paths(paths: Vec<String>) -> ImportReport      // then saves; returns report
  search(q: String) -> Vec<Hit>
  get_settings() -> Settings  /  set_settings(s: Settings) -> ()
  ```
  - `Settings` is `{ last_library: Option<String>, theme: "system"|"light"|"dark", find_similar: "unset"|"on"|"off" }`. It is stored at `app_config_dir()/settings.json` with an atomic write. The default for `find_similar` is `"unset"`, which marks that the first-run question has not been answered (Plan 5).
- State: `Mutex<Option<(Library, Taxonomy, correlate::Index)>>`. The index is rebuilt after every import.
  - `import_paths` runs as an async command on `tauri::async_runtime::spawn_blocking`. It reads `root` and the known hashes under the lock, releases the lock, imports, then takes the lock again only to append, save and rebuild the index.
  - Each reference in `LibraryView` carries `thumb256` and `thumb1024`: absolute paths built in Rust with `Path::join`. The UI never builds paths by string concatenation, because Windows separators and characters such as `%` and `#` would break.
- Asset protocol: enable `assetProtocol` and add the opened library root to its scope at runtime with `app.asset_protocol_scope().allow_directory(root, true)`.

- [ ] **Step 1: Write the failing tests**

  Use `tauri::test::mock_builder()`. Test `create_then_related_roundtrip` covers create, then import of `small.jpg` twice, then `related`, and expects an `Ok` empty list without a panic. Test `settings_default_find_similar_unset`.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test commands::`. It should FAIL, then PASS after the implementation.

- [ ] **Step 3: Commit**

  Commit message: `feat(app): Tauri commands, settings and runtime asset scope`.

---

### Task 8: The Reference view, ported from the prototype

**Files:**
- Create:
  - `app/src/api.ts`: typed `invoke` wrappers, one per command in Task 7.
  - `app/src/reference/view.ts`: rendering, from `prototype/app.js` `show`/`render*`.
  - `app/src/reference/leaders.ts`: from `drawLeaders`/`hot`.
  - `app/src/reference/tile.ts`: from `tileHTML`. The whole plate is letterboxed on the N5 tile, with the matching region outlined.
  - `app/src/search.ts`: the combobox UI.
  - `app/src/styles.css`: copied from `prototype/styles.css`.
  - `app/src/fonts/`: self-hosted `.woff2` files for Source Serif 4 and Red Hat Mono, both SIL OFL, with their licence files.
- Modify: `app/index.html`, using the `prototype/index.html` markup.
- Test:
  - `app/src/reference/tile.test.ts`;
  - `app/src/reference/view.test.ts`, using jsdom and a fake `api`.

**Interfaces:**
- Consumes the commands in Task 7.
- `convertFileSrc(ref.thumb1024)` supplies image URLs, from the absolute path Task 7 provides. Never concatenate path strings.
- Produces:
  - `tileBox(aspect: number, tile: number, region?: Region): { plate: Box; outline?: Box }`, where `Box = { left: number; top: number; width: number; height: number }`, in pixels;
  - `mountReference(root: HTMLElement, api: Api): { show(id: string): void }`.

- [ ] **Step 1: Write the failing tests**
  - `tileBox(3/4, 64)` returns the plate `{left: 8, top: 0, width: 48, height: 64}` with no outline. `tileBox(3/4, 64, {x: .5, y: .5, w: .5, h: .25})` returns the outline `{left: 32, top: 32, width: 24, height: 16}`. A landscape aspect of 4/3 letterboxes the plate vertically, at `top: 8`.
  - `view.test.ts`, run with a fake api of 3 references, where reference A has 2 tags and one of them is partial:
    - it renders 2 callouts;
    - the partial callout says "technique not chosen yet";
    - the Links tab badge shows the link count;
    - clicking a related thumbnail calls `api.related` with the new id;
    - Back returns to A.

- [ ] **Step 2: Run, then port, then run again**

  Run `npm test`. It should FAIL, then PASS after the port.
  - Port the behaviour 1:1, including the keyboard shortcuts `/`, `1`–`9`, `v`, Esc and Backspace, the ARIA fixes AGY validated, light and dark themes, and the value toggle.
  - Replace `sample.js` and `fetch` with `api`.

- [ ] **Step 3: Manual check**

  Run `npm run tauri dev`. Create a library at `D:\Design Second Brain\Références test\` and import 3 images. Expected:
  - The images display, which shows the asset scope works with a non-ASCII path.
  - The status bar shows "3 references".
  - The Inbox count is 3.

- [ ] **Step 4: Commit**

  Commit message: `feat(ui): Reference view wired to the Rust core`.

---

### Task 9: First run, the demo seed and the library picker

**Files:**
- Create:
  - `app/src/firstrun.ts`;
  - `app/src-tauri/resources/demo/`: copied from `demo/` once the `8f` session delivers `manifest.json` and `images/`.
- Modify: `commands.rs`, adding `create_library(path, seed_demo: bool)`.

**Interfaces:**
- Consumes `create_library`, `open_library`, `get_settings` and `set_settings`.
- With no `last_library`, the first-run screen shows three steps:
  1. "Create a new library" or "Open an existing library", using the folder picker from `tauri-plugin-dialog`.
  2. "Start with the demo set (about 50 public-domain works)", a checkbox that is on by default.
  3. The Find similar question, with the exact copy from SPEC §5a: buttons "Turn on now" and "Not now", neither pre-selected, and the detected RAM shown. In this plan, both choices only record `find_similar`; the download comes in Plan 5.

- [ ] **Step 1: Write the failing test**

  Rust `seed_demo_imports_manifest_tags`: `create_library(tmp, seed_demo=true)` imports every manifest image. Each one's `suggestedTechniques` become tags with `suggested: true`, and their names are resolved to taxonomy ids. A technique name missing from the taxonomy is reported, not dropped silently.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test seed_demo`. It should FAIL, then PASS after the implementation.

- [ ] **Step 3: Manual check of first run**

  Delete `settings.json`, then run `npm run tauri dev`. Expected:
  - The three steps appear.
  - Choosing the demo set opens the Reference view on a tagged reference.
  - `settings.json` records `find_similar` as `"off"` after you choose "Not now".

- [ ] **Step 4: Commit**

  Commit message: `feat(app): first-run library setup with demo seed and Find similar choice`.

---

### Task 10: Build check

- [ ] **Step 1: Build**

  Run `cd app && npm run tauri build`. Expected: an MSI or NSIS installer under `app/src-tauri/target/release/bundle/`, smaller than 20 MB without the demo set.

- [ ] **Step 2: Check the installer contents**

  Install it and confirm:
  - first run works offline: disable the network adapter and repeat Task 9, Step 3;
  - the bundle contains no `reference/` frames, by checking the bundled resources.

- [ ] **Step 3: Commit**

  Commit message: `chore: verify release build`. Note in `app/README.md` that macOS and Linux builds belong to Plan 6.
