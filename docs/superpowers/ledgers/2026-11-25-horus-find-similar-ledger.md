# SDD ledger — plan: docs/superpowers/plans/2026-11-25-horus-find-similar.md
Spec: SPEC.md (draft 5) §5a, §11. Worktree .worktrees/plan5-similar, branch plan5-similar from main 8646b91.
Cap: 46% weekly (user 2026-11-27), warn 44%. Start usage 36%.
Team: controller -55; -59 preflight scan + amender, then implementer; -4d implementer; -6a QA (Mara + AGY #3) at end. Reviews = controller-dispatched subagents; AGY #2 per task.

## Preflight
Preflight: dispatched to -59 (preflight-scan.md, then amend plan per rulings).
PAUSE (user 2026-11-27): "take a pause after you are done with the current tasks. do not start new tasks yet". In flight: -59 preflight scan only; let it finish, then stop. Not started: rulings/amendment, Task 1. Resume = rule on preflight-scan.md, amend, dispatch T1.
Preflight: scan DONE by -59 (4 BLOCK, 18 REWORK, 9 COS) in preflight-scan.md. No rulings yet (paused). B2 (Intel Mac: ort has no x86_64-apple-darwin prebuilt) may need user call. All peers idle.
RESUME (user 2026-11-27): "continue your work"; cap raised to 55% (warn 53%). Usage 37%. Controller now -02; peers -bb, -4a, -b5 (fresh sessions; old -55/-59/-4d/-6a gone). New: opencode GLM 5.3 (`opencode.cmd run -m nyolab/glm-5.3`) for design decisions.
Preflight: rulings written in preflight-rulings.md (all 31 ruled; R18 fp32 fixture dropped; R3 = ureq 3). AGY #4 + GLM 5.3 design review in flight.
Preflight: AGY #4 PASS WITH FIXES (B4 stop-after-open + join outside lock + setup resumes .part; R2 OnceLock<Environment>; R7 AtomicU64; C8 pick; pair items) applied. GLM 5.3: R12/R13/R15/C6/C7 AGREE; R11 checksum copy + catch-all, R16 "Searching…", B2 surface, R12 one-time notice applied. Open user calls: B2 fallback (only if no universal2/x86_64 mac build), R18 drop fp32 parity.
Team now: -bb amender (then implementer), -4a Task 0 spike (t0-spike.md), -b5 QA (standby). Dispatched 2026-11-27 at 37%.
USER (2026-11-27): B2 = "Do the silicon version only" (arm64-only macOS; Plan 6 mac target aarch64). R18 drop confirmed ("Go ahead do it"). Rulings updated; -bb and -4a told.
B4 refined with -bb: option (a) take+bump under state, join after state drops; start hook after switch Ok or Err for the open library.
T0 spike DONE (-4a, AGY #4 PASS): ORT 1.31.1 api-31 from NuGet; R1 required; load rules; VC++ runtime deferred to Plan 6. Rulings appended to preflight-rulings.md.
Preflight: plan AMENDED by -bb on plan5-similar: eb515ea (all rulings, B4 per -02 option a), 01b2616 (Task 0 spike results recorded as done + AGY fixes), 97c2f51 (AGY re-review fixes: AVX2 guard x86_64-only, RF3 CPU copy), 4e13a81 (start-hook test reworded). AGY plan review PASS WITH FIXES x2, all fixes applied. Not pushed. Usage 37%.
Amendment DONE by -bb: eb515ea, 01b2616, head 97c2f51 (plan only; AGY review 1 + 2 PASS WITH FIXES, applied). T1 dispatched to -4a (worktree p5-t1 from 97c2f51) at 37%. Plan: T2 (-4a) and T3 (-bb) in parallel after T1.
Plan: 4e13a81 by -bb after 97c2f51 (T5 test failed_switch_restarts_old_indexer -> start_hook_restarts_after_switch; T1-T4 unaffected).
Plan 4e13a81 (-bb): T5 test -> start_hook_restarts_after_switch. Rulings for T2: ORT via app/scripts/fetch-ort.mjs from NuGet into gitignored app/src-tauri/ort (no binaries committed; Plan 6 CI calls it); load_rejects_garbage split into load_rejects_missing_lib + ignored load_rejects_garbage_model (HORUS_ORT_LIB).
Plan: 7edec32 by -bb (T2 rulings: fetch-ort.mjs + fetch:ort, ORT never committed, pins in script + ort_pins_match_plan; LoadError Lib/Model; load_rejects_missing_lib + ignored load_rejects_garbage_model; Plan 6 CI deferral).
AGY #4 on plan 97c2f51..7edec32: PASS WITH FIXES (tar abs path; ort/.gitkeep; open_library Err test; include-ignored note). Sent to -bb.
Plan: 141247e by -bb (AGY #4 fixes on 97c2f51..7edec32: absolute tar path, ort/.gitkeep + resource glob, failed_open_keeps_old_indexer, ENV note on load_rejects_missing_lib).
Plan 141247e (-bb): AGY #4 fixes 1-4 applied. Plan head for T2+ = 141247e. Waiting on T1 (-4a).
USER 2026-11-27: "you can also continue until plan 6" = after Plan 5 done, run Plan 6 too (cap 55% still binds).
T1 (-4a): full cargo test killed by low RAM (Claude Code guard); 11/11 similar:: green. Go given with CARGO_BUILD_JOBS=1 sequential. Accepted: ureq rustls no gzip; extra download::agent() (UA, 30 s timeouts); 4 extra tests; Cargo.lock. Kimi K3 app design review in flight.
T1 DONE by -4a: p5-t1 57a9054 (52971c1 + AGY fix); lib 274 pass/2 ign, clippy clean, no aws-lc/cmake; AGY #2 PASS WITH FIXES then PASS. Added download::agent(), OK_MARKER. Controller task review (subagent) in flight. T3 -> -bb (p5-t3), T2 -> -4a (p5-t2), both from p5-t1 + merge plan5-similar. One-cargo-build-at-a-time rule (RAM). Usage 37%.
T1 task review (controller subagent): APPROVE; Range kept across 302 (no change); 1 minor: https_only(true) -> sent to -4a, then merge p5-t1 into plan5-similar.
RAM: -bb cold T3 build killed by low-memory guard. Rule now: all Plan 5 cargo use shared CARGO_TARGET_DIR=.worktrees/p5-t1/app/src-tauri/target + JOBS=1 (cargo file lock serializes). -bb go.
T1 MERGED into plan5-similar (a013fd7) from p5-t1 85d4fa8. T1 DONE.
Kimi K3 app design review run KILLED by Claude Code low-memory guard (session idle); session export shows prompt never reached the model. Not restarted: waits for user OK.
T3 DONE by -bb: p5-t3 26aa141 (lib 283 pass, clippy clean, AGY #2 PASS). Task review subagent in flight. rustfmt T1 files on plan5-similar (3f8508a).
T3 task review: APPROVE WITH FIXES (get/len for T5; deterministic ties; blake3 hex; T4 note: save under lock). Sent to -bb.
T2 DONE by -4a: p5-t2 4910e54 (lib 281 pass/4 ign; clippy clean; fetch:ort verified + no-op; dumpbin debug clean; AGY #2 PASS). real_model_semantics NOT run (no model) -> -4a downloading model to %LOCALAPPDATA%\horus-dev\siglip and running ignored tests. Task review subagent in flight.
T3 MERGED into plan5-similar (ffe1db4) from p5-t3 7cc78f5 (review fixes, 284 pass). T3 DONE. -bb on T4 (p5-t4).
T2 task review: APPROVE WITH FIXES (gate: real-model run + RSS/s-per-image; dim_ok for symbolic output dim; T8 note: canonicalize_text punctuation). Sent to -4a. T2 merge waits on the real-model run.
T2 gate PASSED (-4a b4093af): real model ok, RSS vision ~184 MB / both ~317 MB, 0.22-0.24 s/img; T8 note: dog 0.0327 > sim_min_text 0.03 for cat text -> calibrate up. T2 MERGED (4112a06) + rustfmt 38f8dc7. T5 -> -4a (p5-t5 from plan5-similar; merge p5-t4 when done).
T4 in by -bb: p5-t4 83180b5 (9b06ac0 + merge 38f8dc7); lib 300 pass, clippy/fmt clean; dirty-only save, encode under lock. AGY #2 + task review subagent in flight. -4a told to merge p5-t4 into p5-t5; T5 must save after prune>0.
T4 task review: APPROVE WITH FIXES (8-batch save test; catch_unwind; stop() doc; test deadlines) -> -bb. T5 constraints -> -4a: single writer of embeddings.bin, poison-tolerant locks, no stop() from on.
T4 MERGED (2148c9a) from p5-t4 544f5f7 (302 pass; AGY #2 PASS x2; review fixes in). T4 DONE.
T6 -> -bb (p5-t6 from 2148c9a); -4a asked to commit api.ts wrappers early. Kimi K3 design review before AGY for T6/T7.
Kimi T6 review killed by low-memory guard (2nd kill); not restarted, needs user OK. Fallback: Claude subagent + impeccable skill reviews T6.
T6 design review (Claude subagent + impeccable; Kimi killed): Q1 plan order Download first; Q2 status bar -> T7 (plan c991092); Q3 ok + 'Downloading the model'; Q4 gear ok; F1-F7 to -bb.
T5 DONE by -4a: p5-t5 3a2400e (318 pass; AGY #2 PASS WITH FIXES -> PASS). Deviations: SimilarEnv seam; similar_start mutex (lock order gate,similar_start,settings,state,similar); UnknownReference:<id>; failed not retried till reopen; reaper thread; *_inner split; settings.rs unchanged. Task review subagent in flight. T7 -> -4a (p5-t7 from p5-t5 + plan5-similar c991092).
T5 task review: APPROVE WITH FIXES (important: .part two writers on disable->enable/remove; start hook generation snapshot order + create_inner detach under open lock; minor: settings raw error leak, failed retry on reopen, no gen bump on disable, UnknownReference wire list). Sent to -4a; T7 paused until fixed.
T6 DONE by -bb: p5-t6 a0363af (design fixes Q1/Q3/F1-F7 + AGY #2 PASS WITH FIXES, fixed; 632 vitest). Merge after T5 fixes. -bb -> Plan 6 preflight scan (read-only, .worktrees/plan6-release from main). Usage 39%.
T5 fixes 5e38a6a (-4a; AGY #2 PASS; similar_download mutex + test proven red without lock; SimilarEnv.agent seam; fix 2 untested - window too narrow). T5 MERGED 436826b, T6 MERGED 1366c63 into plan5-similar. fmt clean. Full merged-branch test run after T7.
T7 COMMITTED by -4a: p5-t7 7b77808 (vitest 647 pass; 8 deviations declared). Design+code review: Claude subagent + impeccable (Kimi paused pending user). AGY after.
Plan 6 amended by -bb: plan6-release 8edcd48 (AGY PASS WITH FIXES, applied). Sweep ruling (c): skip embeddings.bin.tmp. Plan 6 code waits for Plan 5 merge.
Plan 6 sweep ruling applied: plan6-release 59c125b.
T7 review (Claude subagent + impeccable): CHANGES REQUIRED, 12 findings (3 important code: first show lost, drop seq race, active reset; P1: drop focus, tab pending; P2 drop zone style/narrow, English hint, subline, live region; minor). Deviation 7 and 8 approved with tweaks. Sent to -4a.
T7 DONE by -4a: p5-t7 64791a8 (12 fixes + 2 AGY rounds, AGY PASS; vitest 656). T7 MERGED bb1c38f. T8 -> -bb (p5-t8; full merged check first; machine-limit adaptations). Usage check next.
T8 Step 0 GREEN on merged tree bb1c38f (cargo 319/4 ign, clippy, fmt, tsc, vitest 656 exit 0, build). -bb holds app dirs; model kept after T8 for QA; -b5 told to hold.
T8: -bb background build reaped (low mem); orphan tree ran then ended without updating exe. Stop-Process denied in -bb session (not worked around). Retry once in foreground; else in-app steps -> QA window.
T8 DONE by -bb: p5-t8 652e668 (AGY #2 PASS WITH FIXES, typo fixed). 50 demo in ~18 s; resume ok; 2,500 at 3.39 img/s (~12.3 min), horus 363 MB peak; text 78-110 ms ready / 313-359 ms while indexing; cut-offs image 0.55, text 0.05; off state ok; release NSIS 24.39 MiB, MSI 28.09 MiB, no .onnx. Wi-Fi mid-transfer NOT CHECKED. T8 MERGED fa42df5.
Rulings: (a) text >300 ms only while indexing (waits <=1 image on shared encoder lock; "Searching…" line covers it) ACCEPTED as known limit; split vision/text locks -> Plan 6 perf row. (b) after a network error find_similar stays off, no auto-retry on launch: KEEP (Review Focus 2; no surprise network on start).
Final whole-branch review (subagent): READY TO MERGE, 10 minor -> -4a on p5-fix (rulings: #3 fix comments only; #6 amend plan, retry ok; #7 save findSimilar at Begin). QA (-b5) running on fa42df5.
p5-fix 794ecbc (-4a; 320 pass, vitest 656; AGY #2 PASS) MERGED bac92d1. QA must re-check first-run (save at Begin) on new head.
QA (-b5) PASS WITH FIXES (AGY #3 PASS WITH FIXES): F1 important drop-zone hit-test after is-drag cleared -> imports; F2 Settings focus leak (fix now, new dialog). Report p5-qa-report 0d67a55. Fixes -> -4a on p5-fix2. Notes N1 (Plan 6 copy), N2/N3/N5 cosmetic, H2 unexplained once -> Plan 6 notes.
USER: rerun Kimi app design review after the current build (p5-fix2) finishes; run in foreground to avoid reaper.
QA fixes p5-fix2 95177dc (-4a; AGY #2 PASS WITH FIXES -> trap fix applied; vitest 659) MERGED 8efd665. -b5 re-verify next. Kimi Plans 1-4 review running (main checkout; don't merge to main until it ends).
Plan 5 QA FINAL PASS on 8efd665 (-b5; AGY #3 PASS). Report merged. Ledger copied to docs/superpowers/ledgers/. Next: README, merge main (after Kimi run ends), push.
