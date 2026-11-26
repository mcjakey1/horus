### Task 11: The speed check at 2,000+ references

**Files (R19):**
- Create: `scripts/make_perf_library.py`, which writes a demo-format folder.
- Modify:
  - `app/src-tauri/src/lib.rs`: behind the cargo feature `perf`, read `HORUS_DEMO_DIR` to override the `demo` path (`lib.rs:28-34`) used both for `AppState::new` and for the asset-scope `allow_directory(demo.join("images"))`;
  - `app/src-tauri/Cargo.toml`: `[features] perf = []` (off by default);
  - `app/src-tauri/src/correlate.rs`: the budget test;
  - `app/src/graph/scene.ts`: a small overlay showing the Pixi ticker's fps and `TexCache.size()`, built only when `import.meta.env.DEV` or `import.meta.env.VITE_PERF` is set;
  - `app/README.md`, adding a "Performance check" section with the commands and the numbers measured.
- Not created: `devseed.rs` and `dev_seed_tags`. `AppState.open` and `Open` are private to `commands.rs`, and Plan 1's `demo::seed(root, tax, demo_dir)` (`demo.rs:38-79`) already imports a manifest folder and turns its `suggestedTechniques` into tags.

**Interfaces:**
- Consumes `demo::seed` (Plan 1 Task 9), first run's "Start with the demo set", and Task 1.
- The script, `python -I scripts/make_perf_library.py OUT_DIR --n 2500 --seed 7`, writes `OUT_DIR/images/*.jpg` and `OUT_DIR/manifest.json`.
  - The images are 2,500 plain 600×800 colour fields with numbers on them. They are synthetic, so there are no rights questions.
  - `manifest.json` is an array in `demo.rs`'s format (`demo.rs:12-33`): `{ "id": "p0001", "file": "images/p0001.jpg", "title": "Perf 0001", "suggestedTechniques": [{ "operation": "Differentiate", "domain": "Feature", "technique": "Chiaroscuro" }] }`.
  - Each entry has 1–4 techniques, drawn with a Zipf distribution so that some techniques are common. Each one uses the display **names** of a seed (operation, domain, technique) triple that exists as a branch link, because `to_tag` resolves names and rejects a missing branch (`demo.rs:123-160`). The script reads the triples from the bundled seed taxonomy file.
  - The tags arrive `suggested: true`; `correlate` scores them like any other tag.
- **Profiles.** The Rust budget test runs in release. The manual check also runs a release build (`tauri build`), not `tauri dev`, so both measure the same profile.

- [ ] **Step 1: Write the failing test**

  Rust `graph_edges_2500_under_budget` in `correlate.rs` `tests`, marked `#[ignore]` and run explicitly. It is a pure `correlate` test: it builds a synthetic `LibraryData` of 2,500 references with the same Zipf tags in memory (inline PRNG, C21), and asserts that `graph_edges(&d, 8)` finishes in under 1.5 s in a release build.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test --release -- --ignored graph_edges_2500`. It should PASS on Task 1's implementation (R3 built per-reference vectors once). If it fails, the fix belongs in `graph_edges`, not in the test. Then write the script and the `perf` feature, and check that `cargo build` without the feature compiles no `HORUS_DEMO_DIR` read (`cargo clippy --all-targets -- -D warnings` with and without `--features perf`).

- [ ] **Step 3: Manual check**

  1. Run `python -I scripts/make_perf_library.py OUT_DIR --n 2500 --seed 7`.
  2. Build with `VITE_PERF=1 npm run tauri build -- --features perf`, and start the built app with `HORUS_DEMO_DIR=OUT_DIR`.
  3. On first run, create a new library with "Start with the demo set".

  Expected on the development machine:
  - The Galaxy shows its first layout within 3 s, with the UI responsive throughout.
  - Panning and zooming hold at least 55 fps (Pixi ticker), both fitted and zoomed in.
  - Live textures never exceed 600 (the `scene.ts` overlay, hence `VITE_PERF=1`).
  - At far zoom everything is dots.
  - The Tree with the most-used technique expanded, the Tree with **"Show all references"** on (decision 3), and the Radial for the busiest operation all pan at at least 55 fps.

  Record the measured numbers in `app/README.md`. Delete the test library afterwards.

- [ ] **Step 4: Commit**

  Commit message: `test(perf): 2,500-reference synthetic library and graph speed check`.

---

## Parallel schedule (pre-flight scan §7)

Each track is its own worktree, with its own `npm install`.

**Dependencies:** T5 needs T3 (`constants.ts`) and T2 (`Snapshot`). T4 needs T3. T6 needs T2, T4 and T5. T7 needs T1, T2 and T4 (`package.json`). T8 needs T6. T9 needs nothing in Plan 3. T10 needs T6 and T9. T11 needs T1 and T7 (and T6 and T8 for the manual check).

| Wave | Track A, Rust (one worktree: T1 and T9 share `commands.rs`, `lib.rs`, `api.ts`, the contract test and the fakes) | Track B, UI |
|---|---|---|
| 1 | **T1** | **T2** ∥ **T3** (T3 only adds `graph/*`; it is already in flight). T1 and T2 both touch `firstrun.test.ts` and `reference/view.test.ts`: T1 adds one `graphEdges: vi.fn()` line to each fake, and T2 edits elsewhere in those files. Hand-merge, or land T1 first. |
| 2 | **T9**, on top of T1 | **T4** (needs T3; owns `package.json` and the lock file) ∥ **T5** (needs T2 and T3 merged; new `graph/*` files only) |
| 3 | — | **T6** ∥ **T7** (T7 needs T1 merged). They share only a one-line registration each in `firstrun.ts` `boot()` and separate `styles.css` blocks, so merge by hand. |
| 4 | — | **T8** (needs T6) ∥ **T10** (needs T6 and T9). They share only one line each in `firstrun.ts` `boot()`; merge by hand. T8 edits `views/radial.ts` and only imports `views/inspector.ts`; T10 edits `inspector.ts`, `tree.ts`, `styles.css` and `DESIGN.md`. T10 keeps `renderInspector`'s signature, because T8 calls it. |
| 5 | **T11**, last (Rust `lib.rs` and `Cargo.toml`, plus the script; the manual check needs everything) | |

## Self-review

**1. Spec coverage**

- **§5 Tree:**
  - the bands, the docked inspector and the breadcrumb: Tasks 5 and 6;
  - editing (rename, define, synonyms, delete with the "where should tags move" prompt, drag to link (S3), "+" on bands): Tasks 9 and 10.
- **§5 Galaxy:**
  - a force layout from the scores: Tasks 1 and 7;
  - edges only on hover or selection: Task 7.
- **§5 Radial:** a thin layout mode over the same graph (Tasks 5 and 8).
- **§5 shared requirements:**
  - pan and zoom: Tasks 3 and 4;
  - light and dark: Task 4;
  - region thumbnails: Tasks 6 and 8, using ruling a1.
- **§4:** the score drives the Galaxy clustering and edge thickness (Tasks 1 and 7), and the constants live in one file (Task 3).
- **§9 and §10:**
  - only what is on screen is drawn: Tasks 3 and 4;
  - 256 px textures or dots: Tasks 3 and 4;
  - 2,000+ references: Task 11;
  - d3-force in a worker: Task 7;
  - the fixed band and radial maths: Task 5.
- **§11 anti-goal (not an Iris clone):** Global Constraints, Tasks 5 and 6.
- **Gap, recorded rather than built:** SPEC §5's "Intro card" and "Compare" belong to Plans 6 and 4.

**2. Step scan.** Each test step names its tests and their assertions. Each code step names its file and signatures. The bodies are left to the implementer, except the force parameters and layout rules, which the tests alone don't pin.

**3. Type consistency:**
- `Edge` is the same in Rust and TypeScript (Task 1 → 7).
- `Snapshot`, `SourceEvent` and `DataSource` (Task 2, over Plan 2's `Store`) are used by Tasks 5, 6, 7, 8 and 10.
- `SceneNode` (with `dim`), `Scene` (with `Mods`) and `mountCanvasOrFallback` live in `frame.ts`; `createScene` in `scene.ts` (Task 4). Used by Tasks 6, 7 and 8.
- `InspectorOpts` (Task 6) is passed unchanged by Task 8, and Task 10 adds only optional members.
- `TagMove`, `OpMove`, `DomainMove` and the three patches are the same in Rust and TypeScript (Task 9 → 10).
- `ViewHandle` (Task 2, `views.ts`) is returned by `mountTree`, `mountGalaxy` and `mountRadial`.

**4. Review Focus.** Every item has a named test in its owning task:
- item 1: Tasks 4 and 6;
- item 2: Tasks 5 and 7;
- item 3: Tasks 2, 6 and 7;
- item 4: Tasks 9 and 10;
- item 5: Task 3.

**5. Proportion.** There are 11 tasks: signatures, test names and assertions, with no bodies. The user's decisions grew Tasks 9 and 10, operation and domain CRUD in particular. They were not split, because each still ends at one reviewable deliverable: the Rust edits, then the UI.

## Decisions (answered by the user, 2026-11-25)

1. **Operations are fully editable.** The artist can add, rename, re-label, re-ink and delete operations (Tasks 9–10).
   - Deleting an operation that is in use asks where its branches and tags go: move them to another operation, or delete them. Each delete is one undo step.
   - New operations take an ink from a five-ink extra set (Task 10, DESIGN.md), and every view degrades to neutral for an operation with no known ink (`opInk`, Plan 2's `ops.ts`).
   - There are 1 to 9 operations.
2. **New domain types are allowed.** The artist can add, rename and delete them, and choose an icon (`DOMAIN_ICONS`, default "a plain square"). Deleting a domain asks whether to move it to another domain or delete it, in which case its tags become partial. Placing a domain under an operation creates the branch (`add_branch`).
3. **The Tree's references band** shows the selected technique's references by default, with a "Show all references" toggle (Task 6). Culling and far-zoom dots keep it smooth, and Task 11 measures it.

**Four-operation assumptions checked in the code (25 Nov 2026):**

| Place | Assumption | Status |
|---|---|---|
| `taxonomy.rs` `OP_NAMES`, `OP_LABELS`, `OBSERVED` | exactly the four seed operations | Seed-only: used by `validate_seed`. `validate()` (line 179) doesn't use them. Safe, provided nothing runs `validate_seed` on an edited taxonomy. |
| `search.rs:52` | operations matched by name or `plain_label` | Reads the taxonomy, so renamed and new operations work. Safe; covered by `rename_operation_label`. |
| `correlate.rs` `BRANCH_W = 0.3` | per branch, not per operation | Safe. |
| `demo.rs` (Plan 1 Task 9) | maps manifest operation names through the taxonomy | It runs only at creation, on the seed. Safe. |
| `app/src/reference/view.ts` `OP_KEY` | four ids, each mapped to a CSS token, with an unknown id falling back to amber | **Done by Plan 2:** `OP_KEY` is gone; the view uses `opInk` (`view.ts:48-50`), and an unknown operation is neutral. |
| `app/src/styles.css` tokens (`:root`, lines 1-24) | exactly four inks | Extended in Task 10 (`--x-*`). |
| Plan 2 Task 8 picker | four buttons, keys `1`–`4`, exact copy | **Done by Plan 2:** dynamic for 1–9 operations, with `digitOf` (`picker.ts:98`, `:352-355`). |
| Plan 2 Global Constraints | "Operation buttons read exactly …" | **Copy rule changes.** See the cross-plan impact list. |

## Cross-plan impact

| # | Change needed | Owner |
|---|---|---|
| 1 | **The tagging picker renders operations dynamically.** It shows one button per taxonomy operation (1–9, in taxonomy order), with keys `1`–`9`, labels from `plainLabel`, and swatches from `opInk`. Update Plan 2's Global Constraints copy line ("Operation buttons read exactly …") to say "the seed labels by default, editable by the artist". Change the Plan 2 Task 8 test of 4 exact labels to the seed case, and add a 5-operation case. | **Done** (Plan 2: `picker.ts:98`, `:352`) |
| 2 | **Plan 1's Global Constraints copy line** ("The UI uses plain-English operation labels: …") becomes "the seed's labels, editable by the artist (Plan 3)". **SPEC §6.1** ("Four buttons") and **§7** get the same note. | Controller (P1 doc and SPEC) |
| 3 | **Reference view inks:** `OP_KEY` is replaced by `opInk`, and an unknown operation is neutral, not amber. The Reference view reads the shared `Store` (audit row 28). | **Done** (Plan 2: `ops.ts`, `view.ts:48-50`, `mountReference(root, api, store)`) |
| 4 | **DESIGN.md "Extra operation inks"** (Teal, Olive, Rose, Indigo, Umber, light and dark, `-text` and `-on`, AA-checked; values in Task 10), plus a note that the Operation-Only Chroma Rule covers them. | P3 T10 (this plan); values chosen by the amender, AGY-checked |
| 5 | **Plan 4 Compare and Lightbox** colour region outlines and labels by operation. They must use `opInk`, not per-id tokens. | P4 T6, T7 |
| 6 | **Plan 6 icons:** the glyph set must include drawings for `DOMAIN_ICONS`' two generic entries ("a plain square", "a dot inside a ring"). New operations need a default icon, "a plain square". | P6 (icons task) |
| 7 | **Plan 6 integrity check and import:** confirm that `validate()`, not `validate_seed()`, runs on every opened library, because an edited taxonomy fails `validate_seed` by design. | P6 T2 |
| 8 | **Plan 6 intro card and About:** they describe the four seed operations as the starting set. Their copy must not claim that there are always four. | P6 (intro) |
| 9 | **Plan 4 board scope** now has a consumer: `Snapshot.inScope` (Task 2) is `() => true` until Plan 4 adds `store.inScope`, which `storeSource` then reads (audit row 10). | P4 T5 (adds `store.inScope` and the `storeSource` line) |
| 10 | **Plan 4 Compare entry from the graph views:** `firstrun.ts` `boot()` passes `openCompare: (a, b) => mountCompare(…)` to the Galaxy (audit row 25). | P4 T7 (export and the `boot()` line), P3 T7 (the optional dep) |
| 11 | **Shortcuts table:** Radial is now `1`–`9`, and the Tree gains no new keys. Update the audit's shortcut list. | Controller (CROSS-PLAN-AUDIT.md) |
| 12 | **Dangling tag ids after a taxonomy removal (R16):** a failed `library.json` save after a delete or re-key can leave tags naming a missing technique or branch. Plan 3 accepts this (the UI degrades, the ids are kept); Plan 6's integrity check reports dangling tag ids. | P6 T2 |
| 13 | **Light Group Green `-on` is 4.37:1 (ruling B7):** under AA, recorded as a DESIGN delta, not changed in Plan 3 (a visible seed-ink change). A design decision is needed. | P6 (design), controller |
| 14 | **Spec deltas to record:** SPEC §10's "coloured dots" are neutral `--ink-2` dots (C3, DESIGN Operation-Only Chroma); SPEC §5's "drag … to re-link" is read as "drag to add a link" (S3, Task 10). | Controller (SPEC) |
| 15 | **`pixi.js/unsafe-eval` under the strict CSP (B4):** Plan 6 Task 1 Step 4 re-checks that the canvas renders with no `unsafe-eval` in the CSP. | P6 T1 |
