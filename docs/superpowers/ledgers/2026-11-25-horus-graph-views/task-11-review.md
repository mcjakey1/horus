# Task 11 review (Steps 1-2), 41d96ce..b250d5f

### Spec Compliance
- ✅ Spec compliant for Steps 1-2 and the head-heavy carry-in.
  - Budget test `graph_edges_2500_under_budget`: `#[ignore]`, a pure `correlate` test, inline xorshift `Rng` (C21), 2,500 references with 1-4 Zipf links each, asserts `graph_edges(&d, 8)` < 1.5 s (correlate.rs:593-597; helpers `perf_lib` :543-572, `under_budget` :574-591). The brief's command `cargo test --release -- --ignored graph_edges_2500` matches both new tests.
  - Head-heavy carry-in: `t0` is put on about 85% of references, and the test asserts at least 2,000 of 2,500 carry it, so the benchmark cannot pass on degenerate data (correlate.rs:599-614). It is under budget, so leaving `graph_edges` unchanged follows the ruling.
  - The Rust synthetic data matches the script's shape: 55 links, 48 techniques, 18 branches, 1/rank weights and 1-4 distinct links. The script's top technique sits on 46% of references; the Rust Zipf head gets about the same, so the test is a fair stand-in.
  - `perf` feature: `[features] perf = []`, off by default (Cargo.toml:34-36). Under `#[cfg(feature = "perf")]`, `HORUS_DEMO_DIR` shadows `demo` before both `allow_directory(demo.join("images"))` and `AppState::new` (lib.rs:31-37). Without the feature, nothing reads the variable.
  - Script: the CLI, the 600x800 numbered colour fields, the `p0001` ids, `demo.rs`'s manifest shape, 1-4 distinct triples drawn Zipf over the seed's `branchTechniques` (display names), and reading the bundled seed file (make_perf_library.py:20-36, :52-72). The assertions on unique technique names and the `{op}.{domain}` branch ids match how `to_tag` resolves names.
  - Overlay: built only when `import.meta.env.DEV || import.meta.env.VITE_PERF`. It shows ticker fps and `tex.size()` and is removed in `destroy()` (scene.ts:346, :556, :572-602). It stays in `scene.ts`, so no new file imports Pixi (R6).
- ⚠️ Cannot verify from diff:
  - The release timings (Zipf about 0.5 s; head-heavy 1.07-1.20 s serial and 1.37 s in parallel, a single sample).
  - Clippy clean with and without `--features perf`.
  - The plain `dist` having no `perf-overlay`.
  - The throwaway `demo::seed` run on 2,500 entries with 0 warnings.
  - All of these are taken from the report.
  - The README "Performance check" section and its measured numbers belong to the deferred Step 3 (controller ruling). Not a finding.

### Strengths
- Small and surgical: 201 lines added, nothing removed, and `graph_edges` unchanged, as the brief expects.
- The head-heavy test checks its own input (at least 2,000 on the head technique) before it checks the clock. It also times `Index::build` separately and asserts a non-empty result, so an empty result cannot pass for a fast one.
- The script checks the two taxonomy assumptions that `to_tag` depends on instead of trusting them, and it numbers each image so that hash dedupe cannot drop any.
- `b250d5f` keys the stats by `data-view-host`. This matches the real hosts (index.html:64-66). It also handles views that stay mounted while hidden, and the teardown deletes an entry only if it still owns it (scene.ts:600).
- The `cfg` shadowing in lib.rs is one line. It cannot leak into a default build.
- Focused check, done: the IPC `graph_edges` is `#[tauri::command(async)]` and scores a clone outside the lock (commands.rs:558-570). So the 0.5-1.2 s cost runs off the main thread, and Step 3's "UI responsive" target is not at risk from this cost. The command also builds the Index, which is about 1 ms, so timing only `idx.graph_edges` measures what users wait for.

### Issues
#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)
1. **The head-heavy wall-clock margin is thin** (correlate.rs:587-590, asserted from :604 and :612). It took 1.37 s under parallel test threads, against 1.5 s. The test is `#[ignore]`, so CI is unaffected, but under load it can fail spuriously. Options:
   - Record it as headroom.
   - Apply the ruled fix (score j > i once, plus a visited-stamp array) before Step 3.
   - Note `--test-threads=1` in the doc comment at :574.

   The controller decides.
2. **A debug-profile run fails.** "Release only" is only a comment (correlate.rs:574). `cargo test -- --ignored` without `--release` will fail the budget for reasons unrelated to the code. Something like `assert!(!cfg!(debug_assertions), "run with --release")` at the top of `under_budget` would make the failure state its real cause.
3. **The overlay is styled by `el.style.cssText`, set before insertion** (scene.ts:575, before the append at :576), with hard-coded `#000a` and `#fff` rather than theme tokens.
   - This is CSSOM, not markup, so the CSP is not affected.
   - It is not literally "after insertion" as the constraint words it.
   - The reason given (T10 owns `styles.css`) is sound for a dev-only element.
   - Move it to a `.perf-overlay` rule in `styles.css` once T10 merges, or leave it as is.
4. **An empty `HORUS_DEMO_DIR=""` gives `PathBuf::from("")`** (lib.rs:33), so the scope becomes a relative `images` folder. Perf-only. `.filter(|s| !s.is_empty())` closes it.
5. **`VITE_PERF=0` still enables the overlay** (scene.ts:346), because the check is string truthiness. This matches "is set" in the brief, so a note at most.
6. **The script's Pillow requirement is not documented** (make_perf_library.py:18, :49). `ImageFont.load_default(size=160)` needs Pillow 10.1 or later, and under `python -I` Pillow must be in the interpreter's own site-packages, not the user site. Add one docstring line.
7. **The commit subject differs from the plan's Step 4 message** (`test(perf): 2,500-reference synthetic library and graph speed check`). Align it when Step 3/4 lands, for example in the squash or merge commit.

### Assessment
**Task quality:** Approved
**Reasoning:** Steps 1-2 and the head-heavy carry-in are delivered as the brief describes, the changes are minimal and correctly gated, and the tests check their own input as well as the clock. The remaining items are polish, plus a thin timing margin that the controller should rule on before Step 3.
