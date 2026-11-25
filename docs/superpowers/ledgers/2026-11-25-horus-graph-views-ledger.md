# SDD ledger — plan: D:/Design Second Brain/taxonomy-of-visuals/.worktrees/plan3-graph/docs/superpowers/plans/2026-11-25-horus-graph-views.md

Spec: SPEC.md draft 5 plus decisions recorded on main. Worktree: .worktrees/plan3-graph, branch plan3-graph, from main d7c52f5 (Plan 2 merged + QA PASS, pushed). User go: "go and continue until 40% usage" (2026-11-25).

Carried rules:
- Every implementer and reviewer runs on model=opus.
- AGY Validator #2 (conversation bb3386cd-1d6e-4a8a-a063-cc068ad041c0) validates each task after its Opus review. QA = peer ae + AGY #3 (9639ac0d) at plan end.
- Weekly usage cap now 40% (raised from 30%), soft stop; warn at 35%. At setup: 20%.
- Peers 8f, fb, ed, 77 available for independent tasks, each in its own worktree.
- No new inline style= attributes (Plan 6 CSP).
- On done: merge to main, update README.md, push main (standing approval).
- Plan 2 rulings and interfaces: docs/superpowers/ledgers/2026-11-25-horus-tagging-inbox-ledger.md.

## Progress
Pre-flight scan (opus): dispatched; output -> preflight-scan.md in this folder.
Pre-flight scan (opus): 7 BLOCK, 20 REWORK, 24 COS (preflight-scan.md). Plan NOT dispatchable as written, except T3 (unchanged).
Ruling B1: take scan ruling — T2 builds only data.ts storeSource(store); ops.ts/opInk and Reference-view Store wiring already exist (Plan 2); drop staticSource and the 3 duplicate tests — cost: none.
Ruling B2: views.ts grows into the shell in place; boot() in firstrun.ts is the wiring point; fix every Files list (T2,T6,T7,T8,T10) — cost: none.
Ruling B3: T1 and T9 list firstrun.test.ts and reference/view.test.ts fakes plus api.contract.test.ts rows — cost: none.
Ruling B4: T4 imports "pixi.js/unsafe-eval" before creating the renderer (CSP has no unsafe-eval; keep it that way) — cost: none.
Ruling B5: T9 removals invert through sealed position-restoring Insert* + apply_inverse (Plan 2 ruling, edit.rs:60-89); add Insert* variants for operations/domains/links as needed — cost: none.
Ruling B6: T9 rename_collision uses case/spacing-only match (Plan 2 ruling B6); fix the test input — cost: none.
Ruling B7: test asserts >=4.5 for the 5 extra inks and every -text/panel pair; seed -on values pinned as they stand with a comment; light group-on 4.37:1 recorded as a DESIGN delta and carried to Plan 6 for a design decision (not changed now, visible seed-ink change) — cost: one seed pair under AA until Plan 6.
Ruling: extra-ink hex values chosen by the plan amender to satisfy inks_contrast_and_distinct (AA, ΔE2000 >= 15 vs all others, both themes), recorded in DESIGN.md by T10; AGY checks them — cost: retune if the user dislikes them.
Ruling: REWORK items take the scan's suggested ruling unless it contradicts SPEC; the amender records any rejection with a reason. COS applied where cheap. Stale paths (.worktrees/horus-foundation, Plan 1 sdd ledger) repointed to docs/superpowers/ledgers/.
Plan amendment delegated to peer fb, then AGY check, then controller commits into plan3-graph before T1/T2 dispatch. T3 dispatched now in parallel (unchanged by scan).
Task 3: dispatched (base d7c52f5, opus) in .worktrees/p3-t3 (branch p3-t3; separate so fb's uncommitted plan edits in plan3-graph stay out of its commits).
Task 3: implementer DONE_WITH_CONCERNS (dc415a4, 176e677; vitest 248/248, tsc clean). Ruling: carry to T4 — TexCache gains clear()/destroy and exposes urls for context-restore rebuild, and a load that resolves after teardown/eviction is destroyed not inserted — cost: T4 touches texcache.ts. Ruling: >TEX_CAP visible = thrash is by design (cap is SPEC §10); T11 measures it — cost: none. Ruling: fit beyond MIN_SCALE clamps (cannot contain) acceptable — cost: none. Review dispatched (opus).
Task 3: review Needs fixes (spec ❌ 1, Important 1, 5 minors).
Ruling: MIN_SCORE stays out of constants.ts — the plan's constants list doesn't name it (the controller added it to the reviewer prompt by mistake); it is applied in Rust graph_edges (T1) and TS never filters by score — cost: a TS mirror if a later task filters client-side.
Task 3: minor (deferred): fit can return NaN for non-finite bounds despite its comment; grid vs scan query order differ (draw order vs hit); `pending` name also holds "failed"; test oracle reuses overlaps, no test for re-insert / get refreshing LRU. Carry to T4: eviction may unload a texture still on screen; in-flight loads unbounded.
Task 3: fix round 1/5 dispatched (resume implementer). Open: I1 texcache loader resolving null/undefined reloads every frame and later unload(undefined) (Review Focus 5).
Task 3: fix round 1/5 (1 addressed, 0 open; commits 176e677..bd484cb).
Task 3: minor (deferred): unload assertion in the null-loader test is vacuous (second URL also resolves undefined).
Task 3: complete (commits d7c52f5..bd484cb, review clean) on branch p3-t3, pending merge into plan3-graph. AGY #2 check dispatched.
Task 3: AGY #2 "PASS WITH NOTES" — notes = known deferred minors; carry to T4: skip fit on 0 nodes (Infinity bounds), query() order is not draw order, keep visible thumbs <= TEX_CAP so eviction never destroys an on-screen texture.
Plan amended by fb (7 BLOCK, 20 REWORK, 24 COS applied, 0 rejected; amendment-report.md). Controller fix: MAX_OPS already shipped in T3 constants.ts (dc415a4), struck from T6 Files. AGY #2 plan check dispatched.
AGY #2 plan check: "PASS WITH NOTES" (B1-B7, R1-R20 verified; inks recomputed; schedule overlaps called out). Ruling: T4 Files gains app/src/graph/texcache.ts (carried in dispatch) — cost: none. Plan committed 378f713; p3-t3 merged into plan3-graph.
Wave 1: Task 1 dispatched (base 378f713, opus) in plan3-graph. Task 2 delegated to peer 8f in .worktrees/p3-t2 (base 378f713). Hand-merge the Api fakes (firstrun.test.ts, reference/view.test.ts) when T2 merges.
Task 2: peer 8f DONE (30d2d44 on p3-t2; vitest 259/259, tsc + build clean; AGY PASS w/ 2 notes). Rulings: Boards tab gets data-view-tab (disabled) — accept, Plan 4 needs it; Snapshot holds live Store refs, views compare `version` not identity — carry to T5/T6/T7; storeSource never unsubscribes — accept (one source per Store); first-run keeps Reference layout behind dialog — accept. Review dispatched (opus).
Task 2: review clean (spec ✅, quality Approved, 5 minors). ⚠️ firstrun Inbox tests not re-run by reviewer — covered by implementer's 259/259 full-suite run; resolved.
Task 2: minor (deferred): data.ts Snapshot doc should state refs/links are live Store objects (key caches on version); views.test.ts:83 comment mismatch; open_reference_switches_view doesn't assert select before showReference; firstrun.ts:56 no-op named `still`; ./data import order.
Task 2: complete (commits 378f713..30d2d44, review clean) on p3-t2. Merge into plan3-graph after Task 1 commits (T1 implementer is live in that worktree).
Wave 2 (early): Task 4 delegated to fb in .worktrees/p3-t4 (base 378f713; carries B4, texcache clear/destroy/urls/late-load, AGY T3 notes, owns package.json). Task 5 delegated to 8f in .worktrees/p3-t5 (base 30d2d44 = T2+T3). Task 9 waits for Task 1 (same Rust worktree).
Task 5: peer 8f DONE (438940c, 7da8547 on p3-t5; vitest 273/273; AGY FAIL then fixed in 7da8547). Carry to T8: dedupe radial ring-3 points by refId. Concerns 2 (ring 3 includes refs whose tag went via another op's branch) and 3 (suggested tags count as normal) left to the reviewer. Review dispatched (opus).
Ruling: suggested tags count as normal in v1 (SPEC §1/§3: suggested flag is v2) — cost: none.
Task 5: review Needs fixes (spec ❌ 1, Important 1, 5 minors).
Ruling (interface): ref TaxNode gains additive `vias: {branchId, ...}[]` (every tag of this ref on this technique, one per branch); `via` kept as is; Radial ring 3 filters by this op's branches — SPEC §5 "one operation at a time" — cost: T6/T8 see one extra field.
Task 5: minor (deferred): M1/M2 two tree-test assertions can't fail; M3 no 9-op test; M4 via.branchId falls back to "" for branchless tag; M5 no test for a branch with zero techniques. Carry to T8: a ref with only a partial tag counts toward its op but never appears on ring 3 (per brief); dedupe ring-3 points by refId.
Task 5: fix round 1/5 dispatched (peer 8f). Open: I1 radial ring 3 not limited to the operation.
Task 5: fix round 1/5 (1 addressed, 0 open; commits 7da8547..890e79a).
Task 5: minor (deferred): layout-radial.ts:1-2 header still says ring 3 holds every ref tagged with those techniques; two tags on the same branch merge into the first via.
Task 5: complete (commits 30d2d44..890e79a, review clean) on p3-t5 (based on p3-t2). AGY #2 check on final dispatched.
Task 5: AGY #2 "PASS WITH NOTES" (notes = deferred minors). Carry to T8: read region outline state from the n.vias entry on the active op (not n.via); ring-3 count != op.count (partial tags).
Task 1: implementer DONE (fa7768d, 5b36256; cargo 171, vitest 250, clippy/fmt/tsc/build clean). Concern: worst case O(N^2) when one technique is on most refs. Review dispatched (opus).
Tasks 2+5 merged into plan3-graph (6ae01c1); merged tree: tsc clean, vitest 275/275, build OK. p3-t2/p3-t5 worktrees removed.
Task 1: review clean (spec ✅, Approved; I1 plan-level, 3 minors).
Task 1: Ruling: I1 worst case O(Σdf²) (one technique on most refs gives N² candidates) — plan gap vs c5; no T1 change. Carry to T11: benchmark a head-heavy fixture (one technique on >=80% of 2,500 refs); if over budget, score each pair once (j>i) first, then an AGY-ruled cap on high-df postings — cost: possible T11 rework in correlate.rs.
Task 1: minor (deferred): graph_edges doc comment hides the O(Σdf²) ceiling; each pair scored twice; vi.fn() fakes return undefined.
Task 1: complete (commits 378f713..5b36256, review clean). AGY #2 check dispatched.
Task 9: dispatched (base 6ae01c1, opus) in plan3-graph.
Task 1: AGY #2 "PASS WITH NOTES" (agrees with T11 carry; adds: if over 1.5 s budget, score j>i once and swap BTreeSet for a visited-stamp array — exact top-k kept).
Task 4: peer fb DONE (df51424, 056f092 on p3-t4; vitest 269/269, tsc+build clean; ~165 fps pan, 600 live tex peak at 2,000 thumbs; B4 proven under exact CSP in headless Chromium). Rulings: preference ["webgl"] array form accepted (string form falls back to WebGPU/canvas, C14) — cost: none. Carry to T6/T7/T8: scene owns Enter/0/+/-/arrows when nothing is selected; views listen for `activate`, never bind Enter. Carry to T6: verify release-build Pixi chunk split once createScene is imported. main.ts dev harness, styles.css block and pixi-unsafe-eval.d.ts outside Files — reviewer judges. Review dispatched (opus).
Task 4: review Needs fixes (spec ❌ 1, Important 2, 11 minors; see task-4-review.md). No harness JS in release (static DEV guard); .scene-demo-* CSS ships (minor).
Task 4: minor (deferred): 11 in task-4-review.md — incl. setCamera doesn't clamp scale; resolveColor silently greys unknown tokens; app leaks if init throws; harness CSS ships in release; no unit test for cancel-keeps-on-screen-textures rule; evict/urls unused (carry-in asked for them).
Task 4: fix round 1/5 dispatched (peer fb). Open: I1 webglcontextlost shows no fallback text (Review Focus 1: lost -> show text, restored -> remove + rebuild); I2 drawEdges re-strokes every edge on every frame (Galaxy ~16k edges) — redraw only on edge/node/scale/theme change.
Task 4: fix round 1/5 (2 addressed, 0 open; commits 056f092..5cca872).
Task 4: minor (deferred): destroy() while context lost leaves the fallback paragraph in the host (unwire should remove it).
Task 4: complete (commits 378f713..5cca872, review clean) on p3-t4. AGY #2 check dispatched. Merge into plan3-graph after T9 commits (plan3-graph node_modules lacks pixi; T9 live there).
Wave 3: Task 6 delegated to 8f in .worktrees/p3-t6 (base 2fecf79 = plan3-graph 6ae01c1 + p3-t4). Task 7 delegated to fb in .worktrees/p3-t7 (same base). Hand-merge boot() lines + styles.css blocks.
Task 4: AGY #2 "PASS WITH NOTES" (B4, fallback, culling/TEX_CAP, edge gate, theme, reduced motion, bundle, deps verified).
Task 6: peer 8f DONE (0e36b91, 672ef22 on p3-t6; vitest 322/322; Pixi own lazy chunk verified; AGY FAIL (double assetUrl) fixed in 672ef22). Carry to T8: pass InspectorOpts.assetUrl. Concerns (label overlap unchecked on screen, operation nodes off-path use --line-2, no aria-live, no tauri dev check) to reviewer. Review dispatched (opus).
