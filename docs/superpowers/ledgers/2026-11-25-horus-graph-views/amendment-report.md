# Plan 3 amendment report (pre-flight scan → plan)

- **Plan:** `.worktrees/plan3-graph/docs/superpowers/plans/2026-11-25-horus-graph-views.md` (uncommitted; the controller commits after the AGY check). No other file was edited.
- **Inputs:** `preflight-scan.md` (7 BLOCK, 20 REWORK, 24 COS), the controller rulings in `progress.md` "## Progress", SPEC.md, and the Plan 2 ledger.
- **Task 3 text is byte-identical to `HEAD`**, checked by diffing the `### Task 3` … `### Task 4` span against `git show HEAD:`.
- **Totals:** BLOCK 7/7 applied. REWORK 20/20 applied, 0 rejected. COS 24/24 applied (one, C4, landed in Task 6 rather than Task 3 because Task 3 is frozen).
- **Diff:** about 390 insertions and 250 deletions, all in the plan file.

## BLOCK (binding rulings B1–B7)

| ID | Result | Where | Notes |
|---|---|---|---|
| B1 | Applied | Task 2 rewritten; Task 10 Files | T2 no longer creates `ops.ts` or `shell.ts` or edits `search.ts` or the view's data path. `data.ts` holds only `storeSource(store)`, built in T2. `staticSource` and the 3 duplicate tests are dropped. `store_source_bumps_on_change` moved from T10 to T2 as `store_source_versions`. T10 lost its `data.ts` and `main.ts` work. |
| B2 | Applied | Architecture, Global Constraints, Tasks 2, 6, 7, 8, 10 | `views.ts` grows into the shell in place, with `register` and lazy mounting. `show()` runs on every select, so the Inbox's landing becomes its `show`. Hosts are `data-view-host` sections. Every "Modify `main.ts`" became a `firstrun.ts` `boot()` line, and the Files lists were fixed. |
| B3 | Applied | Global Constraints; Task 1 and Task 9 Files and steps | Both tasks list `api.contract.test.ts` and the two typed `Api` fakes. Each new wrapper gets a contract row and a `vi.fn()` in each fake. Both tasks run `npm run build` too. |
| B4 | Applied | Global Constraints; Task 4 | `createScene` imports `pixi.js` and then `pixi.js/unsafe-eval` dynamically. The plan says to never add `unsafe-eval` to the CSP, and the Plan 6 re-check is in Cross-plan impact row 15. |
| B5 | Applied | Task 9 | The append-validating `Add*`/`LinkTechnique` inverts to `Remove*`/`UnlinkTechnique`, which inverts to a sealed `InsertOperation`, `InsertDomain`, `InsertLink` or `InsertBranch`, following `InsertTechnique`. `Update*` inverts by swapping. Commands build only the non-sealed variants. |
| B6 | Applied | Task 9 `rename_collision` | The input `"POP-OUT "` gives `NameTaken:pop-out`, and `"Pop out"` is accepted. The case- and spacing-only rule is kept. |
| B7 | Applied | Task 10 `inks_contrast_and_distinct`; DESIGN delta; Cross-plan impact row 13 | ≥ 4.5 is asserted for the 5 extra `-on` pairs and for all 9 `-text`/panel pairs. The seed `-on` values are pinned as they stand, with a comment. The light group-on 4.37:1 is recorded as a DESIGN delta and carried to Plan 6. |

## REWORK

| ID | Result | Where | Notes |
|---|---|---|---|
| R1 | Applied | Task 1 Step 3 | The command scores `visible(&o.lib)`. New test: `graph_edges_skip_hidden`. |
| R2 | Applied | Task 1 Step 3 | `#[tauri::command(async)]`. The visible data is cloned under the lock, and the `Index` is built and scored outside it. |
| R3 | Applied | Task 1 | Each reference's vector and norm are built once, with the same maths as `Index::score`. `score` and `related` are unchanged, and the brute-force test guards that they agree. |
| R4 | Applied | Task 1 | Ranking is `(score desc, other id asc)` in both the implementation and the brute force, stated in the doc comment. |
| R5 | Applied | Task 2 | `mountReference(…, opts?: { onNavigate })`, and `boot()` passes `shell.select("reference")`. New test: `search_hit_navigates_first`. |
| R6 | Applied | Global Constraints; Task 4 | There is a Pixi-free `graph/frame.ts`. `scene.ts` loads Pixi with a dynamic import, and no unit test imports `pixi.js`. Task 3 needed no change. |
| R7 | Applied | Task 7 | The worker is created with `new Worker(new URL(…, import.meta.url), { type: "module" })`; `?worker&inline` is never used. It has a local scope cast, and `WebWorker` is not added to the global lib. `runForce` calls `.stop()`, then `.tick(n)`, with `.randomSource(lcg(seed))`. |
| R8 | Applied | Task 4 | `resolveColor(css)` lives in `scene.ts`, caches per theme, and is reset by the `data-theme` observer. Views keep passing `opInk` strings. |
| R9 | Applied | Tasks 4, 6, 7 | `SceneNode.dim` gives a dot at every scale and is never picked. Events are `(id, mods: { shift })`. The fakes mirror both. |
| R10 | Applied | Task 6 | `InspectorOpts { editable, openReference, select }`, which Task 8 passes too. |
| R11 | Applied | Task 6 | Inspector tiles are built from `tileBox` and positioned through `el.style` after insertion; `tileHTML` is not used. New test: `no_inline_style_markup`. |
| R12 | Applied | Tasks 6, 8 | `graph/navigate.ts` holds `move` and `canvasKeys`. Digits go through `digitOf`, and text fields are ignored. Task 8 imports it, and an AZERTY case was added to `key_3_selects_sequence`. Task 7 does **not** import it, because T6 and T7 share wave 3; the Galaxy has its own small Esc/Enter handler with the `isTextEntry` guard. |
| R13 | Applied | Task 9 | One post-apply `validate()` check runs in `commit` for taxonomy edits. It rejects only new errors (revert through `apply_inverse`, record nothing). Two tests cover a bad batch and a library with a pre-existing problem. Checked against `taxonomy.rs:372-453`: `validate()` flags only duplicates, unresolved ids and unlinked techniques, so an empty operation, domain or branch passes, and `add_operation`, `add_domain` and `add_branch` are not refused. The plan says so. |
| R14 | Applied | Task 9 | Every new variant, the `Insert*` ones included, is in `touches_taxonomy`. `is_noop` gains `Update* before == after`. Tests: `touches_taxonomy_covers_new_variants` and `noop_rename_records_nothing`. |
| R15 | Applied | Task 9 | `name_key` becomes `pub(crate)`. Uniqueness checks for technique, operation, plain label and domain names exclude the edited id. New test: `rename_to_own_name_case`. |
| R16 | Applied | Task 9; Cross-plan impact row 12 | Dangling ids are accepted explicitly, the `saver.rs:78-81` comment is reworded, and `saver.rs` is in Files. New test: `dangling_tag_ids_open_and_render`. Reporting them goes to Plan 6's integrity check. This does not conflict with SPEC §9, because the ids are kept. |
| R17 | Applied | Task 9 | The test extends `damaged_taxonomy_opens` and calls `delete_domain(id, Some(DomainMove::Delete))` with valid arguments. The plan notes that `build` runs before the read-only check. |
| R18 | Applied | Task 9 Step 2 | `cargo test` runs everything, then clippy and fmt. |
| R19 | Applied | Task 11 rewritten | `devseed.rs` and `dev_seed_tags` are dropped. The script writes a demo-format `manifest.json` with seed display names. A `perf` cargo feature lets `HORUS_DEMO_DIR` override the demo dir, and the asset scope too. The manual run uses a release `tauri build`, so both checks measure the same profile. The budget test stays a pure `correlate` test, and the meaningless "FAIL before devseed" line is struck. |
| R20 | Applied | Tasks 9, 10 | `unlink_technique(…, move_to: Option<TagMove>)` returns `NeedsMove` only when the pair is in use. The "×" on an unused pair skips the dialog. The S3 "re-link" reading ("add a link") is recorded in Task 10 and in Cross-plan impact row 14. |

No REWORK ruling contradicted SPEC, so none was rejected.

## COS

| ID | Result | Where |
|---|---|---|
| C1 | Applied | Spec block: Plan 1 plan and ledger repointed to `docs/superpowers/plans/` and `docs/superpowers/ledgers/2026-11-24-horus-foundation-ledger.md`; the Plan 2 ledger is cited; `prototype/styles.css` became `app/src/styles.css` |
| C2 | Applied | The Dependencies section was rewritten; the four-operation table rows and Cross-plan impact rows 1 and 3 are marked Done, with file references |
| C3 | Applied | Global Constraints (neutral dots) and Cross-plan impact row 14 (spec delta) |
| C4 | Applied, with one deviation | `MAX_OPS = 9` is in the constants list. **Task 6 adds it to `constants.ts`**, because Task 3's text is frozen and Tasks 8 and 10 (wave 4) both need it. `MIN_SCORE` and `BRANCH_W` are noted as Rust's. |
| C5 | Applied | Task 9 `rename_operation_label` asserts that `chiaroscuro` is a hit |
| C6 | Applied | Task 9: `<op>.<id>` onto `(<op>, target)` |
| C7 | Applied | Task 9: Rust `TechniquePatch`, `DomainPatch` and `OperationPatch`, with `double_option` for `color` |
| C8 | Applied | Task 9: `"a plain square"` for new operations and domains; `DOMAIN_ICONS` is the six seed strings verbatim plus two |
| C9 | Applied | Task 9: a partial tag keeps its `region` |
| C10 | Applied | The "false if absent" clause is gone from the Task 2 interface |
| C11 | Applied | Global Constraints: the test environment |
| C12 | Applied | Task 9: `extra_inks_match_ts` |
| C13 | Applied | Global Constraints, Task 4 (`setCamera`) and Task 7 (only the `end` positions are drawn) |
| C14 | Applied | Task 4: WebGL only; only a missing or failed WebGL context maps to `WebGLUnavailable`. New test: `fallback_rethrows_other_errors` |
| C15 | Applied | Task 9: a delete is the `ReplaceTag`s plus one `RemoveTechnique { links: all }`. `delete_operation` and `delete_domain` use the same pattern |
| C16 | Applied | Task 9: the `rekey_branch` target is found by `(operation_id, domain_id)` |
| C17 | Applied | Task 10: `addTechnique({…})`, with one argument |
| C18 | Applied | Task 7: `api.related(id)` for `sharedTechniques`. New test: `inspector_names_shared_techniques` |
| C19 | Applied | Tasks 4, 6 and 10: canvas keys ignore `isTextEntry`, and focus leaves the field after Enter saves. New test: `enter_save_leaves_field` |
| C20 | Applied | Review Focus 3, `SourceEvent.reset` (Task 2), Tasks 6 and 7 (`reset_clears_and_fits`, `reset_cold_starts`) |
| C21 | Applied | Tasks 1 and 11: an inline PRNG |
| C22 | Applied | Task 9: the error names are plain strings; `remove_branch_in_use` is asserted at the `edit::apply` level |
| C23 | Applied | Task 9: the `Change.created` doc is reworded |
| C24 | Applied | Task 6: an `.insp-crumb` 2×2 variant |

## Other changes

- **Stale paths:** all `.worktrees/horus-foundation/...` and Plan 1 `.superpowers/sdd` ledger references were repointed to `docs/superpowers/`.
- **Parallel schedule:** a new section, "Parallel schedule (pre-flight scan §7)", has the scan's 5 waves and its dependency list. Wave 4 says T8 and T10 share one `boot()` line each. Every "Consumes … (Task N)" line was checked: each N sits in an earlier wave.
- **Additions beyond the scan.** These are small, and each follows from a ruling:
  - `register` enables a tab, so the Tree, Galaxy and Radial tabs stay disabled until their task registers them. This avoids an empty view between T2 and T6, and is covered by `register_enables_tab`.
  - `InspectorOpts` gains only the optional `api` and `apply` in T10, so T8's call stays valid.
  - T10 hands each edit's `Change` to `store.apply`, through a one-line `boot()` change.
  - New tests: `show_runs_on_every_select`, `branch_tech_button_selects`, the `navigate.ts` tests, and `plan_frame_dim_is_dot`.
  - Cross-plan impact rows 12–15.
  - Task 11's fps and `TexCache.size()` overlay is owned by `graph/scene.ts`, gated on `DEV` or `VITE_PERF`, because the manual run is now a release build.
  - The `inks.test.ts` step gives Sharma's three Lab input pairs inline.

## Extra-ink table (Task 10, for DESIGN.md and `styles.css`)

**Method.**
- Contrast is WCAG 2 relative luminance.
- ΔE is CIEDE2000 on sRGB → CIELAB (D65). The implementation matches Sharma's published test pairs 1, 17 and 25 exactly (2.0425, 27.1492, 1.2644).
- The panel is `#FAFAF9` (light) and `#1B1B1B` (dark).
- **Hues:** the candidates are HSL hues within ±10° of the plan's targets: Teal 180, Olive 70, Rose 335, Indigo 245 and Umber 25.
- **Search target:** lightness and chroma close to the seed inks. That is L\* 50, C\* 50 in light and L\* 66, C\* 48 in dark. Umber is darker and less saturated (L\* 40, C\* 30 in light; L\* 56, C\* 30 in dark).
- **Floors:** ≥ 4.6 for contrast, and ΔE ≥ 18, against every other base in the same theme with the 4 seed inks included. Both floors leave a margin over the test's 4.5 and 15.

| Theme | Ink | Base | `-text` | `-on` | `-on`/base | `-text`/panel | Min ΔE2000 vs the other 8 (nearest) |
|---|---|---|---|---|---|---|---|
| light | teal | `#089B9B` | `#066B6B` | `#161616` | 5.32 | 6.05 | 18.5 (group) |
| light | olive | `#6A7A1A` | `#455011` | `#FFFFFF` | 4.76 | 8.35 | 18.9 (group) |
| light | rose | `#BC4E7B` | `#9B3B63` | `#FFFFFF` | 4.65 | 6.28 | 24.2 (infer) |
| light | indigo | `#8C84DB` | `#675DD0` | `#161616` | 5.55 | 4.96 | 18.3 (seq) |
| light | umber | `#815637` | `#5D3E28` | `#FFFFFF` | 6.33 | 9.20 | 18.8 (infer) |
| dark | teal | `#0ABDBD` | `#0BDADA` | `#161616` | 7.78 | 9.89 | 18.1 (group) |
| dark | olive | `#9AA951` | `#A7B464` | `#161616` | 7.04 | 7.67 | 18.5 (group) |
| dark | rose | `#ED7EAC` | `#F098BD` | `#161616` | 7.05 | 8.15 | 21.8 (indigo) |
| dark | indigo | `#B7A4EF` | `#CBBEF4` | `#161616` | 8.25 | 10.02 | 18.5 (seq) |
| dark | umber | `#A67E59` | `#B08E6D` | `#161616` | 4.95 | 5.69 | 18.8 (infer) |

**Results.**
- The smallest pairwise ΔE2000 over all 9 bases is 18.3 in light (seq/indigo) and 18.1 in dark (group/teal).
- The HSL hues as chosen are teal 180, olive 70, rose 335, umber 25, and indigo 246 in light and 255 in dark. All are well clear of Iris's purple at about 285.

**The seed inks, for B7:**

| Measure | diff | group | seq | infer |
|---|---|---|---|---|
| Light `-on`/base | 5.23 | **4.37** | 5.56 | 4.52 |
| Dark `-on`/base | 8.20 | 6.63 | 5.56 | 5.81 |

`-text`/panel is 6.25–9.14 in both themes. The light group-on pair is the only one under AA, as the scan found.

**Script:** the scratchpad files `inks.py` and `inks2.py`. They are not in the repo, and Task 10's `inks.test.ts` re-derives these checks. One caveat on the scratchpad path, which is below: the scratchpad may be cleared.
`C:\Users\JAKE\AppData\Local\Temp\claude\53c841e027131a00\b1fe6ac6-42c1-409d-9bd7-b34c72ad87d2\scratchpad\inks2.py`

## For the AGY check and the controller

1. **The ink values are a design choice.** The light indigo `#8C84DB` and the dark indigo `#B7A4EF` read as soft violet-blue, and the light olive `#6A7A1A` is fairly dark. Retune them if the user dislikes them. Any retune must keep every pairwise ΔE2000 at 15 or above.
2. **Spec readings to record:**
   - C3: the far-zoom dots are neutral.
   - S3: "re-link" means "add a link".
3. **C4 placement:** `MAX_OPS` is added in Task 6, not Task 3.
