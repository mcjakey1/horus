# SDD ledger — plan: D:/Design Second Brain/taxonomy-of-visuals/.worktrees/horus-foundation/docs/superpowers/plans/2026-11-24-horus-foundation.md

Spec: SPEC.md (draft 5, approved 2026-11-24). Worktree: .worktrees/horus-foundation, on branch horus-foundation, created from main 127d595.

Environment found at setup:
- Rust is not installed.
- MSVC Build Tools 2026 are present.
- Pillow 12.3 is present.
- Node is v24.
- demo/manifest.json does not exist yet. The 8f session is building it; only demo/images exists so far.

## Pre-flight scan

| Rows | Produces / consumes | Finding | Ruling |
|---|---|---|---|
| T1 (self) | Step 2 says "git init" | The controller already initialised the repo, with the plan's .gitignore at the root plus .superpowers/ and .worktrees/. | Skip T1 step 2. The implementer only checks that the .gitignore entries cover app/. |
| T1 (self) | Step 1 installs Rust | MSVC is already installed. | Install only rustup through winget. If UAC elevation blocks it, report BLOCKED. |
| T2 → T4 | Reference fields file, hash, width, height, added_at; Library::thumb_path | Consistent. | None. |
| T2 → T5 | Tag operation_id, technique_id?, branch_id? | Consistent with taxonomy ids such as "differentiate", "chiaroscuro" and "differentiate.feature". | None. |
| T3 → T6, T7 | Taxonomy camelCase fields | Consistent with taxonomy/taxonomy.json v1. | None. |
| T5 (self) | Test one_vs_six_is_about_0_408 says "every technique's df is equal" | With only A and B in the library, df(t1)=2 while the other techniques have df 1, so the result would not be 1/√6. | **Ruling:** the test adds references C2–C6, each tagged with one of t2–t6, so df=2 for all of t1–t6 and N=7. Expected value: 0.408±0.001. Cost if wrong: one test value. |
| T7 ↔ T9 | create_library | T7's interface comment mentions seed_demo; T9 adds the parameter. | T7 implements create_library(path) only. T9 adds seed_demo: bool. |
| T7 → T8 | Command names and Scored/Hit JSON | Consistent; camelCase over IPC. | None. |
| T8 (self) | Says woff2 fonts | prototype/assets/fonts has OFL TTFs, already licensed. | **Ruling:** reuse the TTFs and LICENSES.txt. Cost if wrong: a slightly larger bundle. |
| T9 (self) | Needs demo/manifest.json | Not delivered yet. | **Ruling:** the test uses a fixture manifest in tests/fixtures, with the same schema as the 8f brief. Copy the resources only once demo/manifest.json exists. If it is still missing at T9, record that as parked. |
| T10 (self) | Step 2: "disable network adapter" | The agent cannot safely toggle the user's network. | **Ruling:** verify offline readiness statically instead: no http(s) URLs in the built frontend or tauri.conf CSP, and fonts are local. Record that the manual network-off check is left to the user. |

## AGY ruling

The user asked earlier that AGY validate the work against the written spec, in every session. **Ruling:** after each task review passes, run AGY (`agy -p --mode plan`, read-only) in the background on that task's review package against the brief and SPEC.md.
- Confirmed findings from AGY open a fix round on that task, or go to the final review if the task is already closed.
- AGY does not gate starting the next task, because its runs take 2–50 minutes.
- AGY's verdict per task is recorded here.

Cost if wrong: late fixes.

## Progress
Task 1: dispatched (base 127d595, implementer=sonnet)
Ruling: user asked (mid-Task-1) for Opus 5.5 subagents — all implementers and reviewers from here use model=opus. Task 1 implementer (sonnet) left running: it is mid-install (rustup) and restarting would collide with the install; its review runs on opus.
Ruling: main commit 3f9967b fixes .num weight 600->500 (unhosted weight) and adds DESIGN.md — cherry-pick into horus-foundation before Task 8 dispatch, since Task 8 copies prototype/styles.css.
Task 1: implementer DONE_WITH_CONCERNS (1d99ed5). Ruling: empty vitest suite exit 1 accepted until Task 8 adds tests — cost: none. Ruling: scaffold defaults (edition 2024, vite 8, TS 6) accepted over plan "2021 edition" — newer stable, cost: none expected. Window launch unverified — covered by Task 8 manual check.
Ruling: user broadcast AGY Validator #2 (conversation bb3386cd-1d6e-4a8a-a063-cc068ad041c0). Per-task AGY validation (see AGY ruling) runs in that conversation from Task 1 on. Pre-flight rulings sent to it at Task 1 review time.
Task 1: complete (commits 127d595..1d99ed5, review clean; minors: scaffold branding/demo code -> Task 8 replaces; csp null + withGlobalTauri -> Task 10 must set strict CSP)
AGY #2 Task 1 validation: queued behind preflight run (same conversation, sequential).
Task 2: dispatched (base 1d99ed5, implementer=opus)
AGY #2 pre-flight verdict: PASS WITH FIXES. All six pre-flight rulings judged sound except the AGY cadence. Rulings on its findings:
- **a1. Region thumbnails.** SPEC §5 says "cropped", but the design finish review moved to a letterboxed plate with an outline, because crops weren't recognisable. **Ruling:** keep the letterboxed tile. Record it as a spec delta in the final report for the user. Cost if wrong: a small UI change.
- **a2. Duplicate merge flow (SPEC §9).** **Ruling:** Plan 1 only detects and reports duplicates. The merge UI is assigned to Plan 2 (Inbox). Roadmap note added.
- **a3. Idea search AND/OR (SPEC §5a).** **Ruling:** combining several techniques is a UI filter, assigned to Plan 2.
- **a4. Intake never blocks.** **Ruling:** the plan is amended. T4 `import_paths` is now lock-free and returns an `ImportOutcome`, and T7 runs it on spawn_blocking. Drag-drop, paste and sourceUrl are assigned to Plan 2.
- **a5. color and examples dropped.** **Ruling:** T3 is amended with a `#[serde(flatten)] extra` field and a round-trip test.
- **a6.** N = tagged references. Kept; this matches the prototype.
- **b. AGY cadence.** **Ruling:** T4 and T5 dispatch waits for AGY #2's verdict on T2. T8 dispatch waits for AGY #2's verdict on T7. Other tasks run asynchronously.
- **c1 and c2.** IPC by (ref_id, tag_id), and debounced saves. Plan 2 notes.
- **c3. Paths built by concatenation.** **Ruling:** T7 and T8 are amended. Rust provides absolute thumb paths.
- **c4. qcms and ICC v4.** **Ruling:** T4 is amended. On a profile error it falls back with a warning, and a test covers that.
- **c5. Galaxy scoring.** Use an inverted technique-to-references map. Plan 3 note.
- **AGY #2 Review 1** was about the taxonomy session's check_manifest.py. Forwarded to design-second-brain-fb.

The plan was amended for T3, T4, T7 and T8; see the next commit.
Note: Task 2 review package base = 47fd1f1 (controller plan commit landed after Task 2 dispatch; excludes plan-only diff).
AGY #2 Task 1 verdict: PASS (carry-forwards: Cargo description/authors -> Plan 6; tauri-plugin-opener prune-or-use -> Task 10).
Update: demo/manifest.json now delivered in main checkout (50 refs, 126 tags; fb check_manifest.py exit 0, AGY #2 PASS). Ruling: T9 uses the real manifest (copy main demo/ into worktree resources at T9 dispatch) and keeps the fixture test; check_manifest.py becomes a T9 pre-check.
Task 2: implementer DONE_WITH_CONCERNS (c4fd05b). Ruling: accept Library.recovered_from_backup field (spec-silent interface gap; Task 7 reads it) — cost: none. Ruling: create() over existing library = data loss vs SPEC §9 -> resumed implementer to add AlreadyALibrary + test before review.
Task 2: minor (deferred): the backup fs::copy rewrites library.bak.json in place and is not synced. Use bak.tmp then rename (library.rs:94).
Task 2: minor (deferred): a backup read error maps to Corrupt{false} instead of Io, and the serde error is dropped (library.rs:66-67).
Task 2: minor (deferred): create guards only on library.json. It overwrites a user-edited taxonomy.json and accepts a non-empty folder; Path::exists hides permission errors (library.rs:33-38).
Task 2: minor (deferred): a model.rs test fixture has technique_id None with branch_id Some, which SPEC §3 forbids (model.rs:88-92).
Task 2: minor (deferred): tests are missing for Corrupt{false} and NotALibrary, and for camelCase on the multi-word fields of Reference, Link and Board.
Task 2: minor (deferred): recovered_from_backup stays true after a save; thumb_path doesn't enforce 256 or 1024; image_path joins an untrusted r.file (traversal).
Task 2: minor (deferred): the fixed tmp name means concurrent saves would interfere, so Task 7 must serialise saves through its Mutex (library.rs:82-86).
Task 2: fix round 1/5 dispatched. Open: Important #1, where a save after a recovery overwrites the good backup with the corrupt file (library.rs:93-96).
Task 2: fix round 1/5 (1 addressed, 0 open; commits 302f4df..4c52d31)
Task 2: minor (deferred): parse-gated rotation silently skips the backup when library.json is transiently unreadable (locked); extra parse per save — revisit with Plan 2 debounced saves.
Task 2: complete (commits 47fd1f1..4c52d31, review clean after 1 fix round)
AGY #2 Task 2 validation: started (gates T4/T5 dispatch).
Task 3: dispatched (base 4c52d31, implementer=opus)
Ruling (demo set, main checkout): drop wpa-sioux-city-public-school-art per demo README rule 4 (when in doubt, leave it out — possibly pupil-made, not federal work); Pattern break moves to hine-sadie-pfeifer; 8f to replace or ship 49. T9 dispatch must use the demo commit made after this swap.
AGY #2 Task 2 verdict: PASS WITH FIXES — model gate for T4/T5 SAFE. Important: open() with missing library.json ignores a valid library.bak.json (library.rs:55-58); create() should also refuse a backup-only folder. Ruling: confirmed real (SPEC §9) -> Task 2 fix round 2/5 queued after Task 3 completes (no parallel implementers in the worktree). Contract carried to T4/T9 dispatch: Reference.file is the bare "<blake3>.<ext>" (image_path joins images/); demo manifest "file" values must be mapped, not copied verbatim.
Demo set final on main at 92393d7 (50 refs, 128 tags, checker exit 0, files<->manifest match, Velonis 540 exact). Swap not AGY-reviewed (8f budget spent) — include in final review AGY pass. T9 uses 92393d7.
Task 3: implementer DONE_WITH_CONCERNS (3a26494). Ruling: validate() forbidding same-operation multi-branch contradicts SPEC §6.3 (picker asks) — split into structural validate() + validate_seed(); Task 7 uses validate(). Ruling: add bundled_seed_matches_repo drift test (CRLF-normalised). Resumed implementer before review.
Task 3: review dispatched (opus, 4c52d31..5bc16d2).
Task 2: fix round 2/5 dispatched (AGY #2 finding: missing library.json strands backup; create over backup-only folder). FIX_BASE=5bc16d2.
Task 3: minor (deferred): validate() negative tests thin (only dangling branchId) — add table-driven mutations before Plan 6 editing.
Task 3: minor (deferred): missing optional key (color/citation) round-trips as null — distinguish missing vs null before Plan 6 save.
Task 3: minor (deferred): BranchTechnique source/rationale required Strings — in-app link creation (Plan 6) must fill both.
Task 3: minor (deferred): lookup maps built twice in validate/validate_seed.
Task 3: complete (commits 4c52d31..5bc16d2, review clean)
Task 2: fix round 2/5 implemented (9eea1e9); scoped re-review dispatched (opus).
AGY #2 Task 3 verdict: PASS (carry: serde default on BranchTechnique source/rationale before Plan 6; cfg(test)-gate NAMES_41/OBSERVED/validate_seed in final cleanup).
Task 2: fix round 2/5 (1 addressed, 0 open; commits 5bc16d2..9eea1e9). minor (deferred): recovered_from_backup doc comment stale (now also covers missing json); no direct test of save right after missing-json recovery.
Task 2: complete again after AGY round (review clean).
Task 4: dispatched (base 9eea1e9, implementer=opus)
Ruling: user offered peer sessions. T5 -> design-second-brain-8f in worktree .worktrees/t5-correlate (branch t5-correlate from 9eea1e9); T6 -> design-second-brain-fb in .worktrees/t6-search (branch t6-search from 9eea1e9). Independent of T4 (consume model/taxonomy only). Controller cherry-picks into horus-foundation after each peer report, then dispatches the Opus task review as usual. Expected trivial conflicts: lib.rs mod lines, Cargo.toml deps.
Task 5: delegated to 8f. Task 6: delegated to fb.
Ruling: user gave free rein over the 2 peer sessions. Queue — on 8f finishing T5: T8 frontend port (UI against the plan Task 7 command interfaces with fake api + Vitest), in its own worktree; integration with real commands after T7 + AGY T7 verdict (narrows the earlier "T8 waits for AGY T7" gate to the integration step). On fb finishing T6: draft Plan 2 (Tagging, Inbox, undo/redo, duplicate merge, AND/OR technique filter, drag-drop/paste/sourceUrl, debounced saves) via writing-plans, saved under docs/superpowers/plans/, for user review. Controller keeps T7 (depends on T4-T6 merged), T9, T10.
Ruling: user cap — stop all dispatch (subagents, peer handoffs, AGY) at 30% weekly usage; check ~/.claude/statusline-last.json before each dispatch. At set time: 3% weekly (resets 2026-12-01 20:00).
Task 5: peer 8f DONE (bb5b666 on t5-correlate; AGY #2 PASS). Review on branch (9eea1e9..bb5b666); merge into horus-foundation after T4 commits. Peer note: N counts refs with >=1 technique tag (brief) vs prototype any tag — prototype alignment deferred (minor).
Task 8: delegated to 8f in .worktrees/t8-frontend (branch t8-frontend from 9eea1e9), fake-api build; integration after T7.
Task 5: review clean (approved). minor (deferred): no MIN_SCORE edge test / unknown-id related test; no per-ref df test; stale-index zero-weight technique still listed in shared (callers must rebuild index); score rebuilds vec per candidate.
Task 5: complete on branch t5-correlate (bb5b666), pending merge into horus-foundation after T4 commit.
Task 6: peer fb DONE (bc4ad12, b398b7d on t6-search; AGY #2 PASS WITH FIXES, fix applied). Ruling: accept Hit JSON tagged enum {"kind":"technique",id,operationId,count}|{"kind":"reference",id} as the IPC contract (plan was silent) — forwarded to 8f for T8. Ruling: accept untagged techniques with count 0 (searchable empty library) — prototype differs; product-wise better for first run. Review dispatched (opus, 9eea1e9..b398b7d).
Next for fb: draft Plan 2.
Task 6: review clean (approved). minor (deferred): short queries expand whole operations via substring (out/eye/a) — word-boundary or min length for search-as-you-type (Plan 2); names match one-way; two-way synonym match over-matches short synonyms; no NFC/NFD normalisation; punctuation kept in query words; test gaps (ruling-3 rungs, ref cap 4, >3-char rule, note/title match, non-ASCII).
Task 6: complete on branch t6-search (b398b7d), pending merge after T4.
Task 8: peer 8f DONE_WITH_CONCERNS (7953e4d, 0f43910 on t8-frontend; AGY #2 PASS WITH FIXES, 3 fixes applied). Rulings: T7 invoke arg names MUST be {path},{id},{paths},{q},{s} (as api.ts assumes); T9 persists settings.lastLibrary on create/open; T9 adds a minimal "Import images…" file-picker button (SPEC §9 file picker; drag-drop stays Plan 2) — used for integration. Accept .gitignore anchor /reference/ (unanchored pattern hid app/src/reference) — port to main too. Review base 3fcaa8c (excludes cherry-picked DESIGN commit).
Task 4: implementer DONE_WITH_CONCERNS (903f66d). Ruling: accept P3(255,70,70) fixture (stronger than brief), hand-built v2 profile, non-RGB warn, path helpers. Fix before review: EXIF orientation, sync_all before rename, alpha->white composite for JPEG thumbs, hash-on-write, Skip::WriteFailed. Resumed implementer.
Task 8: review dispatched (opus, 3fcaa8c..0f43910).
Task 8: review clean (approved). Carried (not deferred): (a) theme toggle writes whole settings -> can null lastLibrary => Ruling: T7 set_settings takes a partial patch (merge server-side) and T9 integration switches the toggle to patch; (b) OFL 1.1 full licence texts + copyright lines must ship with fonts => T10 build check owns it. minor (deferred): destroy() during pending load still paints; focus/DOM out of sync during slow nav; system theme is a snapshot (no matchMedia listener); no XSS regression test (add title fixture with onerror); "1 references" plural; Value checkbox focus swallows shortcuts. Integration: tauri.conf assetProtocol enable+scope needed in T7.
Task 8: complete on branch t8-frontend (0f43910), pending merge.
Task 4: implementer DONE (903f66d, de43b15). Ruling: accept untestable gaps (hash-on-write no true RED; sync_all unobservable; dup costs one temp copy; no dir fsync on Windows). Review dispatched (opus, 9eea1e9..de43b15).
Plan 2 draft (fb) sent to user in Plannotator pn-3a1681 with 2 question blocks. fb -> drafting Plan 4.
Task 4: fix round 1/5 dispatched (Important: recursive walk does not exclude library root -> self-import of thumbs). Carried to T7: run import_paths serially (one import at a time) — thumb tmp names fixed; concurrent runs could clobber. minor (deferred): crash orphans (*.tmp in images/thumbs, persisted-but-unsaved images) -> startup sweep/integrity task; memory peak ~2x decoded (OK serial); ImageError::Limits reported as Unreadable not TooLarge; copy not capped at MAX_BYTES if file grows; tests for spaced path, uppercase/missing ext, thumbs empty on skip; release panic=abort (no reachable panic found).
Task 4: fix round 1/5 (1 addressed, 0 open; commits de43b15..927f3c2). minor (deferred): file symlink into library not pruned with follow_links; "inside the library" reuses Skip::Unsupported (UI wording); no sibling-prefix test.
Task 4: complete (commits 9eea1e9..927f3c2, review clean after 1 fix round).
Merged t5-correlate (d91d7f6), t6-search (d7021f4), t8-frontend (6a3e11d) into horus-foundation. Verified: cargo test 44 passed; npm test 9/9; npm run build OK.
Task 7: dispatched (base 6a3e11d, implementer=opus).
AGY #2 Task 4 verdict: PASS (carry to T7: derive Serialize camelCase on Skip/ImportReport — sent to T7 implementer).
Ruling (from Plan 6 draft): strict CSP blocks Plan 1 T8 inline style attributes. Plan 1 T10 sets CSP with style-src 'self' 'unsafe-inline' (scripts stay self-only) as a temporary step; Plan 6 Task 1 converts inline styles and removes unsafe-inline. Plans 2-4 UI should avoid new inline style attributes.
Cross-plan audit committed on main (f08b10f): 5 blocking, 13 rework, 10 cosmetic. Ruling: Plan 1 unaffected (single-word IPC args; file-picker import, no HTML5 DnD). Fixes applied to Plans 3-6 after user answers in Plannotator; #28 (Reference view store seam) and #1 (IPC contract test) owned by Plan 2.
Task 7: implementer DONE_WITH_CONCERNS (b535308). Ruling: accept build.rs + windows manifest (tauri::test crash 0xc0000139); accept import_paths ids-only (T9 re-opens); accept prior roots in asset scope until restart; accept unparseable taxonomy => readable open error. Fix before review: open_library/create_library hold import gate (race could drop an import); api.ts setSettings Partial + theme toggle sends {theme} only. Resumed implementer.
Task 7: fix commit 3e2ed7c (open/create hold import gate, async commands; Partial settings + theme-only toggle). Review dispatched (opus, 6a3e11d..3e2ed7c).
Task 7: review clean (approved). minor (deferred): import save failure leaves refs in memory + orphan images (save-first/truncate); dead "another library opened" branch; open/create block a tokio worker (wrap in spawn_blocking); create_library allows scope on any non-library folder incl. home (note for T10); unreadable settings.json silently reset to defaults on next write (no corrupt-settings test); lastLibrary cannot be cleared; non-UTF-8 paths fail serialise after save.
Task 7: complete (commits 6a3e11d..3e2ed7c, review clean)
AGY #2 Task 7 validation: started (gates T9 integration dispatch).
AGY #2 Task 7 verdict: PASS (minors match review: save-failure truncate, spawn_blocking for open/create). T9 gate open.
Merged main into horus-foundation (demo final 50 refs/128 tags, checker exit 0).
Task 9: dispatched (base 07ccc6d, implementer=opus).
Plan 6 user decisions (pn-bd2927): auto-update out of 1.0; unsigned beta; publisher/copyright/authors "Jake Manahan"; GitHub Releases + Actions. fb applying decisions + P6-owned audit fixes; controller commits after.
Plan 5 user decisions (pn-c08445): SigLIP v1 base (Xenova@4649052, 213 MB, Apache-2.0); HF pinned+hashed, no mirror; English hint yes. 8f applying + P6 notices change + P5-owned audit rows; controller commits after.
Plan 4 user decisions (pn-aab5e0): export writes credits.txt; one link per pair. Queued to fb (after Plan 6) + P4-owned audit rows (#2 pointer events, #5 public decode/thumbs helpers).
Plan 3 user decisions (pn-55601d) — differ from recommendations: operations FULLY editable (rename/add/delete); NEW domain types allowed; Tree refs band = selected technique + "show all" toggle. Queued to 8f (after Plan 5) with ripple analysis: dynamic op buttons in Plan 2 picker, extra ink set in DESIGN.md + graceful unknown-op ink in Plan 1 Reference view, op/domain delete with move-to, validate vs validate_seed. Cross-plan impact list to come; controller routes (Plan 2 edits -> fb).
Plans 4 and 6 committed on main (82630ae; AGY PASS WITH FIXES, fixes applied; Plan 6 G8 SigLIP licence gate). fb -> amending Plan 2 (P2 audit rows #1 IPC contract test, #28 Store seam; dynamic operation buttons per Plan 3 user decision). 8f -> Plan 3 decisions + cross-plan impact list.
Plan 3 committed on main (83c8a67; AGY PASS WITH FIXES). Cross-plan impact routing: #1,#5-#10 -> fb (Plan 2 T8 picker; Plan 4 opInk/storeSource/openCompare; Plan 6 glyphs, validate() on open, copy). #2 controller: SPEC §6.1/§7 updated on main; Plan 1 global constraint updated on horus-foundation (97179bc, plan-only commit landed during T9 — T9 review base stays 07ccc6d, diff includes this 1-line plan change). #3 P3 T2 opInk. #4 DESIGN.md extra inks -> controller design sign-off at P3 T10. #11 audit shortcut note: Radial 1-9 (cosmetic).
Task 9: implementer DONE (a7d9940, f2282a1); e2e PASS in real app (CDP): 50 refs, asset images over non-ASCII path, import +3 / dup x3, moved-library first-run, settings findSimilar off. Ruling: accept dialog IPC stub in e2e only, dev opt-level=1, sysinfo crate, FS step hidden once answered. Controller-observed layout defects at 800x600 (window too small; 64-hex ref id overflows into Back; status library path overlaps; readout overlaps specimen) -> resumed implementer before review.
Plans 2, 4, 6 amended + committed on main (AGY PASS). All six plans now committed and cross-consistent per audit + Plan 3 impact list. Peers idle.
Task 9: layout fixes e4ac1b3 (1280x800 default, min 960x640; short ref id; status folder name; readout fit); e2e re-run 960/1280 PASS. Review dispatched (opus, 07ccc6d..e4ac1b3; includes controller plan commit 97179bc).
Task 9: review clean (approved). minor (deferred): demo seed skip reason dropped from warning; drift test compares names not hashes (use blake3); interrupted seed leaves orphan demo images and folder cannot be re-seeded; esc() duplicated x3; firstrun tests have unescaped backslashes (C:\R...); first-run dialog does not move focus in; .lab-meta declared twice; seed warnings only in truncated status span. Carry to T10: installer includes 15 MB demo — size target is binary/installer minus demo.
Task 9: complete (commits 07ccc6d..e4ac1b3, review clean)
Task 10: dispatched (base e4ac1b3, implementer=opus). AGY #2 Task 9 started (async).
AGY #2 Task 9 verdict: PASS. Also verified demo swap (Sioux City out, Velonis in, exact 540) — closes the earlier "swap not AGY-reviewed" note. minor (deferred): post-seed save failure leaves unsaved demo refs in memory; demo to_tag checks branch exists but not branch_techniques membership.
Task 10: implementer DONE (f0b90c4): exe 6.12 MiB, MSI 18.03 MiB, NSIS 17.22 MiB (with 15 MB demo); bundle clean; CSP enforced in release exe (0 violations, inline script/remote img/eval refused); CSP not enforced in tauri dev (Vite) on Windows — noted; opener removed; OFL texts shipped via bundle.resources map. Review dispatched (opus).
Task 10: review clean (approved). minor (deferred): CSP test checks only default/script/eval — assert exact tokens for img/connect/font/script (Plan 6 T1); object-src none, base-uri, form-action, frame-ancestors unset (Plan 6); Red Hat RFN wording in shipped OFL.txt vs LICENSE.
Task 10: complete (commits e4ac1b3..f0b90c4, review clean)
ALL 10 TASKS COMPLETE. Final whole-branch review dispatched (opus) + AGY #2 final pass (async). merge-base f08b10f0dabd09f243c765ce9716e7e2b888dd33.
AGY #2 FINAL whole-branch verdict: PASS (no deferred minor blocks merge; optional quick cleanups listed).
FINAL REVIEW (opus): Ready to merge — Yes after fixes. No Critical.
Ruling: Important #1 (create in non-empty folder breaks import, over-grants scope, can overwrite taxonomy.json; no plan owns it) -> fix wave: non-empty chosen folder => create "<folder>/Horus Library" (refuse with "open it instead" if that is already a library/non-empty); narrow asset scope to <root>/images and <root>/thumbs — cost if wrong: a subfolder the user did not expect.
Ruling: Important #2 (warnings invisible) -> fix wave: show LibraryView.warning in #import-notice on mount/open; render ImportReport.warnings in summary.
Ruling: Important #3 (panic=abort defeats per-file import guarantee) -> fix wave: drop panic=abort, catch_unwind around import_one => Skip::Unreadable.
Ruling: fix wave also takes cheap extras: firstrun.test backslashes; first-run focus-in; AlreadyALibrary message suggests "Open it instead"; refuse library.json version > 1 on open; roll back in-memory refs if import save fails (AGY optional); constants comment for N definition.
Ruling: a6 N definition = references with >=1 technique tag (code + prototype aligned later); SPEC §4 updated on main — cost: tiny ranking difference vs spec wording.
Ruling: Important #4 (Plan 2 IPC contract table stale vs HEAD) and #5 (no Open/New library UI after first run) -> plan amendments: fb amends Plan 2 (contract rows incl. seedDemo/systemRamGb/dialog pickers in NON_IPC_KEYS; "Open library…/New library…" UI; taxonomy.json backup or seed fallback per T7 ruling) before Plan 2 dispatch.
Ruling: all other deferred minors triaged "later (Plan N)" per final review; spec deltas a1 (letterbox tiles) and a6 (N) reported to user.
Final fix wave dispatched (opus, FIX_BASE f0b90c4).
User request (2026-11-25): after build completes, produce Windows installers (MSI + NSIS exe) from final reviewed code and hand over paths. Unsigned beta per Plan 6 decision. macOS/Linux via Plan 6 CI.
User request (2026-11-25): before Plan 2 — run /readme skill to write README.md, create PRIVATE GitHub repo (default name "horus"), push main with Plan 1 merged. Verify no third-party material in history first; check gh auth.
Plan 2 amended + committed (c055ddc): Library menu (Open/New), taxonomy.bak.json rotation + read-only seed fallback (Err TaxonomyReadOnly), IPC rows, intake minors. Ripple: Plan 3 T9/T10 handle TaxonomyReadOnly + taxonomyReadOnly in LibraryView/Store (8f); Plan 6 layout/integrity/sweep list taxonomy.bak.json (fb).
Final fix wave DONE (982f8a6): Rust 69, Vitest 17, release smoke PASS. Ruling: parked — open-hint gap (Create says "open instead" for <folder>/Horus Library but Open on <folder> says not a library) -> Plan 2 Library menu: Open also tries <folder>/Horus Library — cost: rare confusing message until Plan 2. Ruling: accept exe 10.62 MiB (unwind) — installers MSI 19.04 / NSIS 17.84 MiB with demo, under 20 MB. minor (deferred): seed save failure now Err without a test. Scoped re-review dispatched.
Final fix wave re-review: ALL ADDRESSED, no new Critical/Important. minor (deferred): is_library uses exists() (try_exists); half-finished subfolder create => misleading SubfolderNotEmpty on retry; file named "Horus Library" => raw OS error; no ancestor check (create inside existing library); orphan files after failed save (inert, overwritten on retry); hidden files (desktop.ini) count as content; panic guard test only matches double quotes. Open-hint dead end -> Plan 2 (committed 56c0f2d).
PLAN 1 COMPLETE — final review clean after fix wave.
