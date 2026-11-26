# Task 11 report: Steps 1-2 (implementer -59)

**Status:** Steps 1-2 DONE. Step 3 (manual check on the release build, README numbers) is waiting for the controller's go after T10 merges.
**Branch:** p3-t11, base 41d96ce. **Commits:** a919d28 (Steps 1-2), b250d5f (overlay stats keyed per view). Nothing pushed or merged; plan3-graph and main not touched. horus.exe not launched.

## Files

| File | Change |
|---|---|
| `app/src-tauri/src/correlate.rs` | Adds `perf_lib(head)`, `under_budget()`, and the `#[ignore]` tests `graph_edges_2500_under_budget` and `graph_edges_2500_head_heavy_under_budget`. `graph_edges` is unchanged. |
| `app/src-tauri/Cargo.toml` | `[features] perf = []`, off by default. |
| `app/src-tauri/src/lib.rs` | Under `#[cfg(feature = "perf")]`, `HORUS_DEMO_DIR` shadows `demo`, before both `allow_directory(demo.join("images"))` and `AppState::new`. |
| `app/src/graph/scene.ts` | `perfOverlay()` is built only when `import.meta.env.DEV \|\| import.meta.env.VITE_PERF`. It shows fps, the minimum fps since reset, `tex.size()` and the maximum since reset. It exposes `globalThis.__horusPerf` (`fps`, `minFps`, `tex`, `maxTex`, `reset()`) for CDP. Clicking the overlay resets it. `destroy()` removes it. It uses inline styles only, so `styles.css` (owned by T10) is untouched. |
| `scripts/make_perf_library.py` | New. `python -I scripts/make_perf_library.py OUT_DIR --n 2500 --seed 7`. |

## Step 1: the test, and the synthetic data in it

`perf_lib` builds 2,500 references (`p0000`..`p2499`) over 55 (technique, branch) links: `t{i%48}`, `b{i%18}`. This matches the seed's 55 `branchTechniques`, 48 techniques and 18 branches. Each reference gets 1-4 distinct links, drawn Zipf (weight 1/rank) with the inline xorshift64 `Rng` that the tests already use (C21).

In the head-heavy case, link 0 (`t0`) is also put on each reference with 85% probability, capped at 4 links per reference. The test asserts that `t0` is on at least 2,000 of the 2,500 references, so the benchmark cannot pass on degenerate data.

Only `graph_edges(&d, 8)` is timed against 1.5 s, and the edge list must be non-empty. `Index::build` is timed and printed separately.

TDD note: the brief expects this test to PASS on Task 1's implementation (it guards the budget rather than driving new code). It passed first time, so there is no red run.

## Step 2: timings (release: lto, codegen-units=1; `cargo test --release --lib -- --ignored graph_edges_2500 --nocapture`)

| Run | Zipf `graph_edges` | Head-heavy `graph_edges` | `Index::build` | Edges (Zipf / head) |
|---|---|---|---|---|
| 1 (both tests in parallel, first build) | 715 ms | 1,372 ms | ~1 ms | 15,385 / 15,235 |
| 2 (`--test-threads=1`) | 525 ms | 1,201 ms | 0.8 ms | same |
| 3 (`--test-threads=1`) | 491 ms | 1,074 ms | 0.6 ms | same |
| 4 (`--test-threads=1`) | 496 ms | 1,080 ms | 1.0 ms | same |

No rustc or cargo was running for runs 2-4 (checked with tasklist). I tried 3 more runs with the brief's exact command (default parallel threads), on the committed code after `cargo fmt`. Claude Code killed that background run for low system memory before it printed anything, and per its notice I did not restart it. **So the parallel head-heavy figure (1,372 ms) is a single sample**, taken on the first build. Runs 2-4 were made before `cargo fmt` reflowed two test lines; only the formatting changed, not the logic. The T10 peer may have had other load on the machine; I did not check that.

**Carry-in 1 verdict:** head-heavy is under the 1.5 s budget, so per the AGY #2 ruling ("if it exceeds 1.5 s, fix") I did not refactor `graph_edges`. The margin is thin: about 20-28% serial, and about 9% when the two tests run in parallel. See Concerns.

## Step 2: the script

- It reads the bundled seed `app/src-tauri/resources/taxonomy.json` (byte-identical to `taxonomy/taxonomy.json`) and builds (operation, domain, technique) display-name triples from `branchTechniques` → `branches` → names. It asserts that technique names are unique and that every branch id equals `{operationId}.{domainId}`, because `to_tag` matches names by first hit and rebuilds the branch id that way.
- For each entry it draws 1-4 distinct links, Zipf over the links in file order, with `random.Random(seed)`.
- Each image is a 600×800 JPEG (quality 80) with a seeded colour field and the white number `NNNN` drawn on it with Pillow's default font. The number keeps every file's hash distinct, because import dedupes by hash.
- Output:
  - `manifest.json` entries look like `{id: "p0001", file: "images/p0001.jpg", title: "Perf 0001", suggestedTechniques: [{operation, domain, technique}]}`.
  - At `--n 2500 --seed 7`: 10 s, 41 MB, 6,238 tags, all 48 techniques used.
  - Top techniques: Complementary pairing 1,158, Semantic contrast 736, Contextual metaphor 464, Chiaroscuro 325, Genre quotation 316.
- Throwaway check (not committed, now deleted): an integration test ran `demo::seed` on the script's output.
  - n = 20: 20 references, 49 tags, 0 warnings.
  - n = 2,500: 2,500 references, 6,238 tags, 0 warnings, every tag `suggested: true` with a technique.
  - The 2,500 seed took 118 s in the dev profile (opt-level 1). Expect a release build to be faster, but "Start with the demo set" on 2,500 images will not be instant in Step 3.

## Verification

- `cargo fmt --check`: clean (after `cargo fmt` reflowed two of my test lines).
- `cargo clippy --all-targets -- -D warnings`: clean.
- `cargo clippy --all-targets --features perf -- -D warnings`: clean.
- In a build without the feature, the `HORUS_DEMO_DIR` read is `#[cfg]`'d out, so it is not compiled at all.
- `cargo test`: 207 passed, 2 ignored (the new budget tests), and 1 doctest passed.
- Release ignored run: 2 passed (timings above).
- `npx tsc --noEmit`: clean.
- vitest: 35 files, 386/386 passed.
- `npm run build`: OK.
  - `grep perf-overlay dist/assets/*.js` matches 0 files in a plain build.
  - With `VITE_PERF=1 vite build` it matches 1 file.

## AGY self-check (new conversation ce665bef-96f1-461f-97e2-f0c958166325, `--mode plan`)

Verdict quoted verbatim: **"Verdict: PASS WITH NOTES"**. "All 4 checks pass against commit `a919d28`".

Notes (non-blocking), verbatim:
- "`globalThis.__horusPerf` not cleared in teardown; stale `stats` stays on `globalThis` after `destroy()` until next scene overwrites it."
- "`HORUS_DEMO_DIR=\"\"` (set but empty) resolves to `PathBuf::from(\"\")` instead of falling back to bundled `demo`".

I left both as they are, because they are perf-only and do not affect the measurement. Each is a one-line fix if the reviewer wants it.

## Concerns

1. **The head-heavy margin is thin:** 1.07-1.20 s serial, and 1.37 s under parallel load, against a 1.5 s budget. A slower machine, or a library with more tags per reference, could cross it. The ruled fix (score j > i once, plus a visited-stamp array) would roughly halve the pair work. Controller's call whether to apply it now or record it as headroom.
2. **The Zipf case alone is already about 0.5 s on the dev machine.** The Galaxy fetches `api.graphEdges(K_EDGES)` whenever the snapshot version changes (`galaxy.ts:167-168`), and so on its first layout. That half-second therefore sits inside the 3 s first-layout budget (Step 3). It also comes back after each library change.
3. **Fixed in b250d5f.** Views stay mounted while hidden (`views.ts:40-45`), so a single `__horusPerf` global read whichever scene mounted last. The stats are now keyed by `data-view-host` (for example `__horusPerf.galaxy`, `__horusPerf.tree`, `__horusPerf.radial`), and each entry is deleted on teardown. That also covers AGY note 1. After the fix: tsc clean, vitest 386/386, build OK, and the overlay is still absent from the plain build.
4. **Seeding 2,500 images** takes about 2 minutes in debug, and is still a while in release. Step 3's "first layout within 3 s" should be timed from opening the Galaxy, not from "Start with the demo set".

## Step 3 (later): carry-ins to record

- About 110 empty `PIXI.Text` joint nodes in the Tree.
- Galaxy cold settle of 898 ms on the demo with forceCollide.
- Texture thrash when more than `TEX_CAP` thumbnails are visible.
- README numbers will be measured on the real `tauri build --features perf` with `VITE_PERF=1`, or written as "not measured".
- Use CDP 9335 and my own WebView2 user-data folder.
- Before each app run, check tasklist for horus.exe, message -6a, and wait for its OK.

---

# Step 3 and Step 4 (after the go; T10 merged at d701993)

**Commits on p3-t11:** 4ae7de2 (merge of plan3-graph d701993; no conflicts, scene.ts unioned cleanly), a428343 (`test(perf): 2,500-reference synthetic library and graph speed check`, the plan's Step 4 message), and 44b6269 (README wording and run counts). Not pushed, not merged.

## Review minors (task-11-review.md)

- **#1:** the `under_budget` doc gives the command with `--test-threads=1` and the parallel figure.
- **#2:** `under_budget` panics with "run with --release" outside release. I used `if cfg!(debug_assertions) { panic!(..) }` because clippy's `assertions_on_constants` rejects `assert!(!cfg!(..))`, and a `const { }` assert would break `cargo test` in debug. Checked: `cargo test -- --ignored graph_edges_2500` in debug fails both tests with "run with --release".
- **#3:** the overlay styles are now a `.perf-overlay` rule at the end of `styles.css`, using `--ink` and `--panel`, so the overlay inverts with the theme. `scene.ts` no longer sets `style.cssText`.
- **#4:** an empty `HORUS_DEMO_DIR` is now ignored (`lib.rs`, `.filter(|s| !s.is_empty())`).
- **#6:** the script's docstring says it needs Pillow 10.1 or later in the interpreter's own site-packages.
- **#7:** a428343 uses the plan's Step 4 message.

## Verification after the merge and the minors

- tsc: clean.
- vitest: 38 files, 441/441.
- `npm run build`: OK. The plain dist has no `perf-overlay`; the `VITE_PERF=1` dist has it.
- `cargo fmt --check`: clean.
- clippy `-D warnings`, with and without `--features perf`: clean.
- `cargo test`: 207 passed, 2 ignored, plus 1 doctest.
- I did not re-run the release budget test after the minors. Only the doc comment and the debug guard changed, and the guard is `false` in release. I skipped the run because two background builds were killed for low system memory.

## Step 3: manual check on the real release build

- **Build:** `VITE_PERF=1 npm run tauri build -- --features perf --no-bundle` (5 m 50 s). The exe is from 14:26 and was built from the tree that a428343 commits.
- **Harness:** the script that ran drove the exe over WebView2 CDP on port 9335, with a WebView2 user-data folder in my scratchpad. It is saved as `task-11-evidence/perf-as-run.js`. The committed `docs/superpowers/qa/plan3-perf.js` is a tidied copy of it: the same steps and the same notches, minus a dead thumbs-count branch. The copy was syntax-checked, not re-run. The commit body of a428343 calls it "the harness used", which is true only of the original.
- **App runs:** QA (-6a) gave a standing OK for my runs. Before each run I checked that no horus.exe was running and that `%APPDATA%\art.horus.app` was absent. The harness deletes that folder afterwards.
- **Cleanup:** all done. The test libraries, the 2,500 set and the WebView2 data are deleted, and `%APPDATA%\art.horus.app` is absent, as it was before.
- **Runs:** three, each with a fresh 2,500-reference library made by "Start with the demo set".
  - Run 1 is valid for the first layout and the fitted pans only. Its zoomed pans landed on empty canvas.
  - Run 2: the first layout and fitted pans are valid, and so are the notch-6 pan, Tree show all zoomed and Radial zoomed. I checked those screenshots. Its zoomed Galaxy pan was off content.
  - Run 3 is the full set. The pan now returns to its press point. I opened every zoomed screenshot from run 3.
  - The README marks each row with how many valid runs it rests on. Single-run rows: Galaxy zoomed in (118) and Tree technique zoomed (130). Zoom-in fps was not measured.
  - Evidence (screenshots, the JSON results and the raw output of each run) is in `task-11-evidence/` next to this report: `run1-output.txt`, `run2/` and `run3/`.

The numbers are in `app/README.md` "Performance check". In short:

| Check | Target | Measured |
|---|---|---|
| Galaxy first layout, from the tab click to the layout worker's first position message | ≤ 3 s | 960 / 966 / 967 ms (settled 5.04–5.10 s) |
| UI during that layout | responsive | 1–3 long tasks, longest 162–187 ms; worst frame gap 161–186 ms |
| Galaxy pan: fitted / past the cap / zoomed in | ≥ 55 fps | min 116–130 / 76–90 / 118 (one run) |
| Zooming out, from a zoomed pan through 30 notches to far zoom (zoom-in not measured) | ≥ 55 fps | min Galaxy 98–105, Tree 87–89 |
| Peak live textures | ≤ 600 | 600 (Galaxy), 154 (Tree), 0 (Radial) |
| Far zoom | all dots | all dots (Galaxy, Tree), judged from screenshots |
| Tree, Complementary pairing (1,158 refs): fitted / zoomed | ≥ 55 fps | min 130–131 / 130 (one run) |
| Tree with "Show all references": fitted / zoomed | ≥ 55 fps | min 129–130 / 125–130 |
| Radial, Differentiate (2,190 refs): fitted / zoomed | ≥ 55 fps | min 130–131 / 130–131 |
| "Start with the demo set" on 2,500 images | — | 86–110 s |

**Caveats on the numbers:**
- **fps:** at rest the ticker reported about 130 fps, while WMI reports the GPU's current refresh as 60 Hz. The figures are Pixi ticker frames, not frames on screen. I did not investigate the mismatch.
- **Radial:** no reference thumbnails are drawn for an operation-level Radial (0 textures). The Radial check therefore measured the taxonomy wheel only.
- **Far zoom:** "everything is dots" is judged from screenshots. Live textures stay at 600 after zooming out, because the cache keeps them while sprites draw dots, so the texture count cannot show it.

## Carry-ins (also in the README)

- **~110 empty `PIXI.Text` joints in the Tree:** not measured; the release build has no scene-graph hook.
- **Galaxy cold settle:**
  - 898 ms on the 50-image demo.
  - At 2,500: first positions in about 0.96 s, settled in about 5.1 s.
  - The 5.1 s settle is past the brief's 3 s, but the brief's target is the first layout, which takes about 1 s.
- **More than `TEX_CAP` visible:** the cap holds (600 thumbnails, the rest dots). Panning there was the slowest case, at a minimum of 76 fps, with no frame gap over 32 ms. No thrash below 55 fps.

## Concerns, and things I noticed for QA or the final review

1. **The tool that kills background shells under memory pressure stopped my second perf build.** The orphaned cargo kept running, then exited without writing a new exe.
   - I had added a "thumbs drawn" count to the overlay for that build. Because the build never landed, I reverted the count, so the committed overlay is exactly what was measured.
   - The harness zooms by fixed notches instead, and I checked thumbnails against the screenshots.
2. **The Galaxy's dense cluster overlaps at 2,500 references.** Zoomed in, many 48-unit tiles overlap: the collide force does not separate the head cluster before the layout ends. Task 7's no-overlap check covered the 50-image demo only.
3. **One-column Tree band.** With a technique expanded, its 1,158 references draw as a single column, so the fitted Tree is a thin line of dots and the taxonomy bands are off-screen. This is fast, but probably not useful to look at. Design question.
4. **Tree inspector (T10):** in the screenshots, the technique title ("Complementary pairing") overlaps the sticky breadcrumb row at the top of the inspector, at 1280×800, after selecting through op, branch and technique. Worth a look for QA.
5. **The inspector shows a "REFERENCES 1158" thumbnail grid** for the selected technique. I did not check whether it renders all 1,158 as DOM images or windows them; the harness timed only canvas pans. Worth a check in the final review.
6. **The head-heavy margin is unchanged** (ruling: no fix). The release budget test was not re-run after the minors.

---

# Fix round 1 (task-11-review-2.md, I1)

**Commit:** 8ebfbf4 on p3-t11, docs only. Not pushed.

- **README:** the "lowest 500 ms fps window 38–41" figure now has its own row: "Lowest 500 ms fps window, from the tab click to the fitted view (Pixi start-up, the layout, the fit)". It is marked Runs = 2, because only runs 2 (41.1) and 3 (38.3) logged it. The "UI responsive" row keeps the long-task and frame-gap figures, which come from all 3 runs.
- **plan3-perf.js:** the log line is back, right after the fit: `log("Galaxy fitted (min fps since the tab click)", await perf(page, "galaxy"))`. It is at the same spot as the "Galaxy fitted thumbs" line in the as-run script, so the README sentence about reading the numbers from `window.__horusPerf.<view>` holds for this figure again. `node --check`: OK. Not re-run.
- **Ruling recorded:** the first-layout verdict now reads "Pass: 'first layout' means the first streamed positions (controller ruling, 2026-11-26)". The 5.04–5.10 s settle stays next to it.
- No code changed, so I did not re-run tests. Minors 1-9 are deferred; zoom-in fps stays "not measured".

## Re-measure after fix wave

Implementer -59, 2026-11-26. Branch `p3-remeasure` (from `c138f2b`), commit `c35c814` (docs + harness only; no app code).

**Build:**
- The first build, in a fresh target dir, was stopped by Claude Code's low-memory guard: rustc exited with 0xc0000142.
- Per -55's ruling, I rebuilt after QA's build finished, with `CARGO_TARGET_DIR` set to the `p3-t11` target and `CARGO_BUILD_JOBS=2`. It took 4 min 39 s.
- Exe: `.worktrees\p3-t11\app\src-tauri\target\release\horus.exe`. I passed its path to -6a for QA's visual checks.

**Runs:**
- Four runs, serialized with -6a, each with its OK. CDP 9335, my own WebView2 folder, and a fresh library each time.
- Run 2 never left the static `index.html` shell: no first-run screen, no library, and the harness timed out after 30 s. boot() never reached firstRun(), so the `get_settings` IPC probably never resolved.
  - Guess, not confirmed: the harness's `page.route` on ipc.localhost is set up while the page boots.
  - 1 of 4 launches failed this way. I told -6a to watch for it.
- The numbers come from runs 1, 3 and 4.
- Harness tweaks after run 1:
  - Run 1 zoomed the Radial at the wheel's centre (no references), so its zoomed Radial pan is excluded. The zoom point is now `RZ = [470, 170]`, on ring 3.
  - Added a Tree far zoom on the expanded technique.
  - `HORUS_EXE` override.

**Results** (min fps; the target is ≥ 55):

1. **Radial, Differentiate (2,190 references):**
   - Pan fitted: 128–131 (3 runs).
   - Zoomed on ring 3: 129–131 (2 runs: 3, 4).
   - Peak textures: 0 at fit (references drawn as dots), 600 zoomed.
   - The screenshots show ring 3's rows around the wheel at fit, and thumbnails when zoomed.
2. **Galaxy:**
   - First positions: 1,169–1,241 ms. Settle: 6.75–7.04 s, 20 position messages.
   - Long tasks: 2 per run, the longest 176–194 ms. Worst frame gap: 176–199 ms.
   - Pan fitted: 127–130. Notch 6 (past the cap): 62–75. Zoomed: 125–130. All 3 runs.
3. **Tree, Complementary pairing expanded (block):**
   - Pan fitted: 130–131. Zoomed: 124–130. Both 3 runs.
   - Far zoom: references all dots, taxonomy squares drawn (2 runs).

**README changes:**
- I replaced the whole manual-check table, not only the marked rows. All of its numbers now come from one build, `c138f2b`; a half-updated table would have kept the `p3-t11` header and run notes over the new rows.
- Several unmarked rows changed too:
  - UI responsive: the 0.2 s threshold now holds by 1 ms.
  - Past-the-cap pan: min 62, down from 76, with one 54 ms long task and an 84 ms gap in run 4.
  - Peak textures: Tree 600, Radial 600 zoomed.
  - Zooming: Tree "Show all references" 76–98.
- I added a note that "tex" counts the cache, not what is on screen.
- The Galaxy cold settle carry-in keeps the old `p3-t11` numbers next to the new ones, with no cause attributed.

**"Seen, not measured" bullets:**
- Galaxy: zoomed in at notch 6 and notch 13, tiles in the dense cluster still touch and partly overlap with the new radius. I did not compare this against the `task-11-evidence` shots, so the README does not say whether there is more or less overlap than before.
- Tree: the block layout fixes the expanded-technique case only. With "Show all references" on, each technique's references are still one thin column (`t1-tree-all`). The far zoom there looks the same as the fitted view, so "all dots" is not judged for Show all.

**Concerns:**
1. **Galaxy timing:** first positions went from 0.96 to 1.17–1.24 s, and the settle from about 5.1 to 6.75–7.04 s. The machine was under different memory load between the builds, so I don't attribute this to the radius. First positions still pass under the controller ruling.
2. **Past-the-cap pan margin:** now 7 fps over 55, with a min of 62. Run 4 had a 54 ms long task.
3. **UI-responsive margin:** the worst frame gap of 199 ms is 1 ms under the 0.2 s line.
4. **Galaxy overlap:** dense-cluster overlap persists.
5. **Show all:** with "Show all references" on, the Tree still draws columns.
6. **Run 2 launch hang:** cause unconfirmed, see above.

**Evidence:** `remeasure-evidence\`, next to `task-11-evidence\`.
- `run1` through `run4`: output, `perf-results.json` and screenshots. Run 2 has only `error.png`.
- `sheet.png` and `sheet2.png`: contact sheets of the measured shots for runs 1, 3 and 4.

**Cleanup:**
- `%APPDATA%\art.horus.app` is absent; the harness deletes it at the end of each run.
- Each run's `perf-lib` and WebView2 folder were deleted.
- The synthetic `perf2500` was deleted after -6a said it had generated its own. The perf exe in the `p3-t11` target stays for QA.
