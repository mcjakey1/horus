# SDD ledger — plan: D:/Design Second Brain/taxonomy-of-visuals/.worktrees/plan4-boards/docs/superpowers/plans/2026-11-25-horus-boards-lightbox-compare.md

Spec: SPEC.md (draft 5) + DESIGN.md. Worktree .worktrees/plan4-boards, branch plan4-boards from main a7fb0f0 (Plan 3 merged, QA PASS, pushed). User go 2026-11-26: "go and make the usage limit until 31-32% only". Usage at start 31% — budget allows the pre-flight scan only; stop at 32%.
Carried rules: implementers/reviewers on opus; AGY #2 (bb3386cd) validates each task; QA = QA peer + AGY #3 at plan end; no new inline style=; on done merge to main + README + push.
Carried from Plan 3 ledger: cross-plan rows 5 (Compare/Lightbox region outlines via opInk), 9 (store.inScope + storeSource line), 10 (openCompare dep from Galaxy via boot()); final-review ruling: commands.rs taxonomy commands move to their own module as Plan 4 step 1.

## Progress
Pre-flight scan (opus): dispatched; output -> preflight-scan.md in this folder.
User (2026-11-26): 'go and make the usage limit until 40% only' — cap now 40% (warn 35%). Full Plan 4 execution authorized.
Pre-flight scan (opus): 4 BLOCK, 27 REWORK, 31 COS (preflight-scan.md). No task dispatchable unchanged.
Ruling B1: add Task 0 — pure move of the commands.rs taxonomy commands into their own module (Plan 3 final-review ruling), carrying the items Plan 3 deferred to the split; T0 runs alone first — cost: one extra task.
Ruling B2: T1 makes link/board edits mark the library dirty (settle/saver path) so they save; T1 Files grow to the settle/dirty code + a save-on-quit test — an unsaved edit is data loss (SPEC safe saves) — cost: T1 touches commands.rs/saver.rs.
Ruling B3: re-add tauri-plugin-opener as a recorded exception to "no new crates", capability scoped to reveal-item-in-dir only (Plan 6 expects it; SPEC export "Open folder") — cost: one crate, a narrow capability; AGY checks the capability scope.
Ruling B4: T6 rewrites lightbox/view.test.ts:286 full_image_from_imagePath_with_thumb_fallback for lightboxSource — cost: none.
Ruling: REWORK items take the scan's suggested ruling unless it contradicts SPEC (amender records any rejection with a reason); COS applied where cheap; schedule W0 T0 | W1 T1∥T2 | W2 T3 | W3 T4∥T6 | W4 T5 | W5 T7 | W6 T8 — cost: none.
Plan amendment delegated to peer -59, then AGY #2 plan check, then controller commits into plan4-boards before T0.
Plan amended by -59 (62 items: 61 applied, 0 rejected, 1 deferred C26 no Compare from Tree/Radial; amendment-report.md). Options: R16 boards/status.ts + footer #board-scope; R17 graph-scope items into T5; R21 ExportReport.credits; R27 no metadata editing in v1.
Ruling (R27): metadata editing (title/creator/year/credit) stays out of v1 — SPEC doesn't require it (audit #23) — flagged to the user as a scope call; cost: a Details inspector task later if the user wants it.
Ruling: split T5 at dispatch into T5a (boards view, membership, status, export/opener) and T5b (graph scope in tree.ts/galaxy.ts) — T5 too heavy for one review — cost: one extra review cycle.
Ruling: T0 may add the one redo test (behaviour unchanged; gate = baseline then baseline+1) — cost: none.
Ruling: UnknownTag remap deferred again to Plan 6 (would change error text in a pure move) — cost: raw-ish edit errors persist till Plan 6.
AGY #2 plan check dispatched.
AGY #2 plan check: "PASS WITH NOTES" (BLOCKs resolved, opener capability opener:allow-reveal-item-in-dir only, waves conflict-free; notes: keep T6 preload-error + load-after-close sub-cases; pick revealItemInDir(dest) consistently in T5/T8). Plan committed 503f0d0.
Task 0: delegated to peer -4d in plan4-boards (BASE 503f0d0).
Ruling: T2 (export module) starts now in .worktrees/p4-t2 (base 503f0d0) in parallel with T0 — only shared file is lib.rs mod lines, hand-merged — cost: a trivial merge. Task 2: delegated to peer -59.
Task 0: peer -4d DONE (985c3ac move, 2894023 Plan->TaxPlan, 529043d redo test; cargo 207->208, clippy/fmt/tsc clean, vitest 461/461, contract 37/37 untouched, build OK; commands.rs 4,153->2,547, taxonomy_edit.rs 1,635). Deviation: parent helpers keep visibility (child reads via use super::*). Review dispatched (opus).
Task 2: peer -59 DONE_WITH_CONCERNS (1023898, 2660e3e on p4-t2; 21 export tests, cargo 228+2+1, clippy/fmt clean; lib.rs one mod line). Concerns: one message for missing dest / file / folder-inside-library; failed credits write -> credits: None without reason; raw OS error text in skipped reasons (T5 shows them); blank metadata prints —.
Ruling: raw OS text may live in ExportReport data, but T5 must show mapped artist copy (no raw error text, Plan 3 policy) — carry to T5 — cost: T5 maps reasons.
Task 2: minor (deferred, Plan 6 cross-platform): NamedTempFile gives 0600 on Unix; exports owner-only on mac/Linux; fix cfg(unix) set_permissions(0o644).
Task 2: review dispatched (opus).
Task 0: review clean (Approved, 0 issues; verified byte-identical move). Task 0: complete (commits 503f0d0..529043d, review clean). AGY #2 check dispatched. Task 1: delegated to peer -4d in plan4-boards (BASE 529043d).
Task 0: AGY #2 "PASS".
Task 2: review clean (Approved, 5 minors; task-2-review.md). Never-overwrite relies on OS no-replace rename; dest check canonicalized.
Task 2: minor (deferred): one refusal message for missing/unreadable/inside-library dest (consider "That folder can't be found."); failed credits write loses reason (carry to T5: say "credits.txt was not written" when credits is None); raw OS text in skipped reasons (carry to T5 mapping); Plan 6: 0600 on Unix, 120 chars vs 255-byte names, hard-link fallback on FAT/exFAT under Linux, no junction/symlink test.
Task 2: complete (commits 503f0d0..2660e3e, review clean) on p4-t2; merge into plan4-boards after T1 commits (T1 live there). AGY #2 check dispatched.
Task 2: AGY #2 "PASS".
Task 1: peer -4d DONE (490d720; 19 new tests, cargo 227+2+1, clippy/fmt clean; mutation checks on settle flag + is_noop). Choices: id/pair change in Replace* -> InvalidTag (matches ReplaceTag); Replace trims/validates only in check mode. Carry to T3: api.ts Change lacks links/boards (sent as null when untouched); lists not filtered by visible() — UI skips unknown ref ids. Review dispatched (opus).
Task 2 merged into plan4-boards (98e1333) after T1 490d720: cargo 248+2 ignored+1 doctest, clippy clean.
Task 1: review clean (Approved, 4 minors; B2 save path traced end to end). Task 1: complete (commits 529043d..490d720, review clean).
Task 1: minor (deferred): check_board uses trim+lowercase, not taxonomy::name_key (inner whitespace); InvalidTag wording for identity-changing Replace* (T3 keeps it from UI); C31 test lacks a ref on both a link and a board.
Carry to T3: store.apply must read c.links/c.boards; TS Change gains links?/boards? as optional+nullable; re-render checks (lightbox/view.ts:211, reference/view.ts:613) must fire on link-only changes; UI skips unknown ref ids (lists not filtered by visible()).
Task 1: AGY #2 "PASS". Task 3: delegated to peer -4d in plan4-boards (BASE 98e1333).
Task 3: peer -4d DONE_WITH_CONCERNS (cc44550; cargo 259+2+1, clippy/fmt, tsc, vitest 479/479, build). Concerns: import report drops a warning when decode then fails; lightbox cache never pruned; Rust tests not red-first (TS were). Review dispatched (opus).
Task 3: review Approved with 1 Important (test gap: no test of the >8192 px downscale path, nor asset_protocol_scope().is_allowed on a real preview PNG created after the grant), 8 minors (task-3-review.md).
Task 3: minor (deferred): bad/zero-length cached PNG never rebuilt (delete + re-decode on header error; sync_all before rename); concurrent first opens both decode; Lanczos3 f32 peak ~780 MB at 20000x6000 (comment the ceiling; imageops::thumbnail fallback); ICC/EXIF warning lost when decode then fails (accepted); cache never pruned (Plan 6 integrity); write_thumbs_matches_import compares shared code; inScope O(members) per call.
Carry to T6: full:true path doesn't check the original exists — treat img.onerror like Err and fall back to thumb1024.
Task 3: fix round 1/5 dispatched (peer -4d). Open: I1 downscale + real-PNG scope test.
Ruling: T4 starts now on cc44550 in .worktrees/p4-t4 (peer -59) — T3's fix round adds tests only — cost: none.
Task 3: fix round 1 implementer DONE (d70e050, test only; cargo 260; is_allowed true on real preview made after grant — no grant bug). Scoped re-review dispatched (opus). Task 6: delegated to peer -4d in .worktrees/p4-t6 (BASE d70e050).
Task 3: fix round 1/5 (1 addressed, 0 open; commits cc44550..d70e050). Task 3: complete (commits 98e1333..d70e050, review clean). AGY #2 check dispatched.
Task 3: AGY #2 "PASS".
Task 6: peer -4d DONE (6bb00fa on p4-t6; vitest 492/492, tsc, build). Space/middle-drag pan untested (panBy tested). Review dispatched (opus).
Task 4: peer -59 DONE_WITH_CONCERNS (77f7c72, e77bf98 on p4-t4; 27 new tests, vitest 506/506, tsc, build). Concerns: pointer capture/click suppression/leader line unverified in WebView2 (T8 hand check); editor docks in .margin; delete unconfirmed (undoable); combobox titles only, cap 50; 'N related' counts linked refs. Review dispatched (opus).
Task 6: review Needs fixes (Important 3, 8 minors; task-6-review.md).
Task 6: minor (deferred): source dims never read (100% ≠ 1:1 for preview/thumb fallback); `fitted` resets only via 0; wheel mid-drag remaps start corner; 0/1 keys e.key only (AZERTY; use code Digit fallback); .is-hot no z-index; is-hot not cleared on pointerleave; Enter while zoomed drafts off-screen; 0x0 dims.
Task 6: fix round 1/5 dispatched (peer -4d). Open: I1 focusable .lb-box can scroll overflow:hidden stage → regions saved at wrong coords (overflow: clip / reset scroll / pan to reveal; Space/Enter/arrows dead while a box has focus); I2 Space flag sticks (clear on window blur + document keyup); I3 coordinate tests can't fail (stage at 0,0; wheel at centre; same source size).
Task 4: review Needs fixes (Important 1, 9 minors; task-4-review.md).
Task 4: minor (deferred): dedupe under a filter untested; "N related" counts linked refs (all-linked case shows no empty note); duplicate-mode Save replaces the note (manual merge); combobox titles only, no "no matches" line; Delete no busy guard (double-click spurious error); `k` lowercase only; half-typed note lost on t/focus change; openLb leaves link editor open; linkedFirst no pair dedupe. T8 hand check: add "Esc mid-drag, then release".
Task 4: fix round 1/5 dispatched (peer -59). Open: I1 Esc mid-drag doesn't abort — the release's click opens the editor.
Task 6: fix round 1 implementer DONE (c8e1d5c; vitest 495/495, tsc, build; overflow: clip + reveal-pan on focus; Space released on doc keyup/blur; tests with stage offset 40,30). Scoped re-review dispatched (opus).
Task 4: fix round 1 implementer DONE (d1d48f9; vitest 507/507, tsc, build). Scoped re-review dispatched (opus).
Task 6: fix round 1/5 (3 addressed, 0 open; commits 6bb00fa..c8e1d5c).
Task 6: minor (deferred): window blur releases Space but doesn't dropDrag (lost pointerup without lostpointercapture leaves panFrom/from); Tab onto an off-screen box mid-drag pans under the drag.
Task 6: complete (commits d70e050..c8e1d5c, review clean) on p4-t6. AGY #2 check dispatched.
Task 6: AGY #2 "PASS".
Task 6 merged into plan4-boards: tsc, vitest 495/495, build OK.
Task 4: fix round 1/5 (1 addressed, 0 open; commits e77bf98..d1d48f9).
Task 4: minor (deferred): a cancelled drag that never gets pointerup/pointercancel keeps `drag`, so Esc stops unpinning until the next handle pointerdown (add lostpointercapture → endDrag, or guard !drag.cancelled).
Task 4: complete (commits cc44550..d1d48f9, review clean) on p4-t4. AGY #2 check dispatched.
Task 4: AGY #2 "PASS".
Task 4 merged into plan4-boards (41163c7; styles.css append conflict resolved by union): tsc, vitest 523/523, build OK.
Ruling: T5 split — T5a (boards view, membership, scope, status, export, opener; peer -59, p4-t5a) ∥ T5b (R17 graph scope tree.ts/galaxy.ts; peer -4d, p4-t5b), both BASE 41163c7 — disjoint files — cost: two reviews. Usage 33%.
Task 5b: peer -4d DONE (8bbfde0 on p4-t5b; 3 new tests red-first, vitest 526/526, tsc, build). Review dispatched (opus).
Task 5b: review clean (Approved; 3 minors; task-5b-review.md).
Ruling: extend T5b with the same-class gaps the reviewer found — Galaxy refresh clears a selection that falls out of scope; Radial clears an out-of-scope selection and its arrows step past out-of-scope refs — SPEC §2 "filter the view to that board" applies to all three graph views, and -4d is idle until T5a lands — cost: one small follow-up + scoped re-review.
Task 5b follow-up dispatched (peer -4d, p4-t5b).
Task 5b follow-up: -4d DONE (4cbaf85; 3 tests red-first, vitest 529/529, tsc, build). Scoped re-review dispatched (opus).
Task 5b follow-up: re-review clean (2 addressed; minors: no test for refused-first-child walk or all-refused ring).
Task 5b: complete (commits 41163c7..4cbaf85, review clean) on p4-t5b. AGY #2 check dispatched.
Task 5b: AGY #2 "PASS".
Task 5b merged into plan4-boards (f5701dc).
Task 5a: peer -59 DONE_WITH_CONCERNS (74a5d3d on p4-t5a; vitest 557/557, tsc, build, cargo 261 incl. capability test, clippy/fmt). Concerns: tests not observed red per-test; pointer capture/ghost/scrolled reorder unverified in WebView2; revealItemInDir opens parent with folder selected (T8 check wording 'Open folder'); inline delete confirm; Boards… plate button; opener adds 457 Cargo.lock lines. Review dispatched (opus).
Task 5a: review Needs fixes (Critical 1, Important 3, 5 minors; task-5a-review.md).
Ruling (spec deviation): brief's inspector "Boards" section became a "Boards…" plate button, so the Reference view never shows which boards a ref is on — restore a visible membership line/section in the inspector (keep the button as the editor) — brief requires it and an artist needs to see membership — cost: small UI addition.
Task 5a: minor (deferred): reorder/remove send only UI-visible members, dropping hidden members (undoable); board menu doesn't subscribe (stale checkboxes after undo); menu counts include unknown ids; toast "Open folder" dead after Boards view unmounts; confirm buttons inside role=status.
Task 5a: fix round 1/5 dispatched (peer -59). Open: C1 Reference view ignores c.boards/c.scopeCleared; I1 tile <img> native drag cancels reorder; I2 keyboard focus lost (Show only, Rename no focus, Esc/Save); I3 delete confirm not bound to its board; S1 membership visible in inspector.
Task 5a: fix round 1 implementer DONE (09a790f; 7 tests red-first, vitest 564/564, tsc, build). Scoped re-review dispatched (opus).
Task 5a: fix round 1/5 (5 addressed, 0 open; commits 74a5d3d..09a790f).
Task 5a: minor (deferred): renaming state refocuses the rename input on every renderHead (no blur exit); no test of membership line after focus change.
FINDING (controller): full vitest on plan4-boards exits 1 — 529 pass but 2 unhandled rejections at lightbox/view.ts:347 (s.full on undefined) from reference/view.test lightbox mocks lacking lightboxSource; earlier controller merge checks read only the Tests line, not the exit code. Ruling: fix before T7 (peer -4d, T6 owner) on plan4-boards after T5a merge; from now on merge checks assert exit 0 — cost: one small fix.
Task 5a: complete (commits 41163c7..09a790f, review clean) on p4-t5a. AGY #2 check dispatched.
Task 5a: AGY #2 "PASS WITH NOTES".
Task 5a merged into plan4-boards (189ff3a): tsc OK, vitest 570 pass but exit 1 (same 2 unhandled rejections), build OK, cargo 261+2+1, clippy clean. Unhandled-rejection fix dispatched (peer -4d) on plan4-boards before T7.
Prefix fix: -4d DONE (09a99f6; root cause typed fakes' lightboxSource resolved undefined, throw inside .then success handler; fakes fixed, view.ts treats invalid reply as refusal, chain ends in .catch; vitest exit 0, 0 Errors, 571; tsc, build). Scoped review dispatched (opus). Task 7: -4d started on plan4-boards.
Prefix fix: review ADDRESSED, no new breakage (task-7-prefix-review.md). Minor (deferred): .catch(sayPreview) logs nothing, so a real code bug in the source chain looks like a refusal in production.
Task 7: peer -4d DONE (e1b239a; vitest exit 0, 0 Errors, 583/583, tsc, build). Notes: C26 Tree/Radial entry deferred; Shift+Enter relies on Chromium shifted click; L in Compare untested. Review dispatched (opus).
Task 7: review Needs fixes (Important 3, 11 minors; task-7-review.md).
Ruling (I2, plan gap — brief lines 34/51 wire Esc to showReference(A), which resets filter/pins and drops focus): closing a Compare opened from the Reference view does NOT navigate; it just closes and returns focus to the opener (Reference view already shows the focus underneath). Galaxy path keeps onClose -> shell.select("galaxy") — cost: after an x swap the Reference focus doesn't follow the new A.
Ruling (I1 + minor 3, same code): Shared/Only lists must be right at all times — re-run scorePair on references/removed/taxonomy changes with latest-wins counter, and show the local technique intersection as Shared while scored is null or after a rejection (score text stays scorePair-only) — cost: none.
Task 7: minor (deferred): plates overflow side column 900-1150 px; store event refocuses dialog while typing in docked editor; only first region outlined; unknown op empty label; sides comparator NaN; value view starts off; L/beforePicker untested, test uses callout not Ranked tile; boot destroy doesn't close Compare; dialog has no accessible name; keys bound on el only (focus to body kills Esc/v/x).
Task 7: fix round 1/5 dispatched (peer -4d). Open: I1 stale Shared/score (+ fallback), I2 Reference-path Esc resets view (ruling: no navigation), I3 Tab-trap test vacuous.
Task 7: fix round 1 implementer DONE (956fc28; vitest exit 0, 0 Errors, 585; tsc, build; mutation checks on I1). Scoped re-review dispatched (opus).
Task 7: fix round 1/5 (2 addressed, 1 open — I2 Esc bubbles to Reference view's document keydown after .compare is removed, clearing the pin; commits e1b239a..956fc28).
Task 7: minor (deferred): pending re-score shows previous branches/score; onClose-after-focus test doesn't assert order; third-reply Shared equals local overlap (can't tell apart).
Task 7: fix round 2/5 dispatched (peer -4d). Open: I2 pin cleared by bubbled Esc.
Task 7: fix round 2 implementer DONE (6e07004; stopPropagation + defaultPrevented guard; pin test red-first; vitest exit 0, 585). Scoped re-review dispatched (opus).
Task 7: fix round 2/5 (1 addressed, 0 open; commits 956fc28..6e07004). defaultPrevented guard checked against every earlier preventDefault — no key lost. Minor: Esc in Library menu no longer clears the Reference pin (consistent with board menu/link editor).
Task 7: complete (commits 09a99f6..6e07004, review clean). AGY #2 check dispatched.
Task 7: AGY #2 "PASS". Task 8: delegated to peer -59 on plan4-boards (BASE 6e07004).
Ruling: final whole-branch review starts now on a7fb0f0..6e07004 in parallel with T8 (T8 changes only README notes; its findings join the fix wave) — cost: T8 README not in the reviewed range. Final review dispatched (opus).
Task 8: -59 paused (cargo test killed by low-memory guard). Ruling: skip cargo test/clippy in T8 — no app/src-tauri change since 189ff3a where controller verified cargo 261+2+1 + clippy clean; proceed to release build — cost: none. If the build dies, Step 2 manual checks move to QA.
Usage 35% (warn line). Task 8 run A: steps 1-4, 5, 7, T7 hand checks PASS; Open folder opens parent (revealItemInDir); steps 6/8 + T4 handle check blocked by harness click timeout after Compare link save (re-running); possible finding: lightbox zoom changes after drawing a region at 416% (re-measuring).
Final review: With fixes (Critical 1, Important 5, Minor 16; final-review.md). C1 board scope doesn't filter Ranked without a technique filter.
Ruling: fix wave = must-fix 1-6 + fix-if-cheap 7, 9-16; skip 8 (thumbnail resample, unmeasured, softer preview) — cost: 780 MB peak stays a documented ceiling (Plan 6 perf).
Ruling ("Open folder"): revealItemInDir shows the export folder selected in its parent, so the button label becomes "Show in folder" (accurate for what it does) — cost: one copy change vs the brief.
Ruling: any T8 bug findings join this same single fix wave before its re-review — cost: none.
Fix wave dispatched (peer -4d, plan4-boards).
Task 8: peer -59 DONE_WITH_CONCERNS (dbd6659: README "Plan 4 end-to-end check" + plan3-style harness plan4-e2e.js; vitest exit 0 585, build, fmt; cargo by controller). Release build over CDP: steps 1,2,4-9 PASS; step 3 FAIL (F1 = final-review C1, scope not filtering Ranked). Not checked: search under scope, Notepad/TextEdit/PureRef, hover label, T6 Tab check. Hand checks T4/T5a/T7 OK.
Findings to fix wave: F4 Important — after Compare "Link these two" saves, focus drops to body and Esc no longer closes Compare; F3 Minor — Alt+→ in Boards drops focus to body; F2 Minor — tagging a region drawn at 416% resets lightbox zoom to 100% (region exact). H1 harness first-run pick 3/7 (not app-confirmed).
Task 8: complete (dbd6659). Uncommitted edits on plan4-boards are -4d's fix wave in progress.
Fix wave: -4d DONE (59344ce..836d276 on top of dbd6659; must-fix 1-6, cheap 7,9-16, Show in folder, T8 F1-F4; 8 skipped; vitest exit 0 604, tsc, build, cargo 262+2+1, clippy, fmt). Scoped re-review dispatched (opus).
Fix wave: re-review clean (all items ADDRESSED; no new Critical/Important; QA focus list in fix-wave-rereview.md).
Fix wave: minor (deferred, Plan 6): hand-edited board naming an absent id now fails reorder/remove with generic copy (set_board_members could drop absent ids); grid refocus by index without preventScroll; 0/1 lightbox zoom disabled while a picker is docked (root fix: defaultPrevented check); pre-existing: Esc in docked picker's new-technique form likely closes the whole lightbox (QA to confirm).
AGY #2 fix-wave check dispatched.
Fix wave: AGY #2 "PASS". QA Phase dispatched to -6a on plan4-boards 836d276 (.worktrees/p4-qa detached).
README prep delegated to -4d on .worktrees/p4-readme (836d276); 2 screenshots requested from QA.
README prep: -4d DONE (241fa32 on p4-readme, README.md only +29/-2); screenshots pending from QA.

## QA (2026-11-27)
QA: PASS by -6a on 836d276 (0 critical, 0 important, 2 minor, 3 judgment calls; AGY #3 PASS). Report branch p4-qa-report 887aa71..cdfae47. mara-plan4 50/3 (F1,F2,J3-harness), mara-plan2 51/51, mara-plan3 88/2 (Plan 3 F1/F2, already Plan 6).
QA F1/F2/J1/J3/H1: Ruling: defer all to Plan 6 (F1 picker Esc closes lightbox - stopPropagation in picker Esc branch; F2 .bd-tools clipped on first-column tile, styles.css:533; J1 status text stale after undo of scoped board delete; J3 verify full Op > Technique hover label live; H1 harness relaunch on pick miss) — all Minor, pre-existing or cosmetic, none loses saved data; fixing now would cost a fix round past the 40% cap — if wrong: F1 loses an unsaved drawn region + zoom on Esc until Plan 6.
