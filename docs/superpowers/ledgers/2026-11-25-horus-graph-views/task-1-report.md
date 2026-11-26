# Task 1 report: Galaxy edges through an inverted index (Rust)

Status: DONE
Branch: plan3-graph (worktree .worktrees/plan3-graph)
Commits:
- `fa7768d feat(core): Galaxy edges via inverted technique index`
- `5b36256 test(core): permute bruteforce ids so the R4 tie-break is pinned`

## What I implemented

- `correlate.rs`:
  - `pub struct Edge { a, b, score }` (Serialize, camelCase, `a < b`).
  - `Index::graph_edges(&self, data, k) -> Vec<Edge>`:
    - it builds every reference's weighted vector and norm once (R3);
    - it builds `postings: technique id -> reference indices` once;
    - each reference's candidates are the union of the postings of its own techniques, without itself;
    - the cosine uses exactly `score`'s maths (dot over `va` in BTreeMap order, `/ (na * nb)`, zero-norm guard);
    - each reference keeps its top `k` with score >= MIN_SCORE, ranked `(score desc, other id asc)` (R4);
    - the union is deduplicated by `(min, max)` in a BTreeMap, so the output is sorted by `(a, b)`.
  - The doc comment states the R4 ranking and the c5 branch-only trade-off.
  - `score` and `related` are untouched.
- `commands.rs`: `#[tauri::command(async)] graph_edges(k: u32)` (R2):
  - under `lock(&st.open)` it takes `visible(&o.lib).into_owned()`, then releases the lock;
  - outside the lock it runs `Index::build(&clone).graph_edges(&clone, k as usize)`;
  - it uses no gate and no settings lock;
  - because it reads `visible`, hidden references never appear (R1).
  - The test env's `generate_handler!` gains `graph_edges`, for the IPC roundtrip test.
- `lib.rs`: the command is registered after `commands::related`.
- `api.ts`: `Edge` type; `graphEdges(k)` in `Api` and in `tauriApi` (`invoke("graph_edges", { k })`).
- B3:
  - a `["graphEdges", "graph_edges", ["k"], ...]` row in `api.contract.test.ts`;
  - `graphEdges: vi.fn(),` as one added line after `related` in `firstrun.test.ts` and in `reference/view.test.ts`.

## Tests

Rust, in `correlate::tests`:
- `graph_edges_match_bruteforce`:
  - setup: an xorshift64 library of 200 references over 30 techniques and 6 branches, with about 10% partial tags;
  - the brute-force top-8 uses `Index::score` over pairs that share a technique, ranked `(score desc, id asc)`;
  - it compares the `(a, b)` sets and checks scores within 1e-12.
- `graph_edges_no_self_no_dupes`.
- `graph_edges_respects_k_and_min`:
  - setup: a hub plus 20 leaves; leaf i has i unique fillers, so leaves 12-19 fall below MIN_SCORE;
  - it asserts the hub's own top 8 are all present, and that it has more than 8 candidates;
  - hub edges equal the hub's above-MIN leaves (12); this is the union from the leaves' side;
  - every score is >= MIN_SCORE, and there are no leaf-leaf edges.
- `graph_edges_empty_and_partial`.
- `graph_edges_skip_branch_only`: it also asserts that the branch-only pair would pass MIN_SCORE (about 0.069), so the test has teeth.

Rust, in `commands::tests`:
- `graph_edges_command_roundtrip`: a real IPC call with `{ "k": 8 }` on a created, empty library returns `[]`.
- `graph_edges_skip_hidden`:
  - setup: two imported good references plus a bad-hash reference, all tagged Chiaroscuro;
  - it asserts exactly 1 edge, and that no edge names "bad".
  - Mutation check: with `visible` bypassed (raw `lib.data.clone()`) it FAILS with 3 edges, including `bad`. Code restored.

Results:
- `cargo test`: 171 passed, 0 failed (plus 1 integration test passed).
- `cargo clippy --all-targets -- -D warnings`: clean.
- `cargo fmt --check`: clean (I ran `cargo fmt` on my 3 files first).
- `npm test` (vitest): 24 files, 250 tests passed.
- `npx tsc --noEmit`: exit 0.
- `npm run build`: built.

## TDD evidence

RED 1. Command: `cargo test correlate::`, against a stub `graph_edges` that returned `vec![]`:
```
test correlate::tests::graph_edges_no_self_no_dupes ... FAILED
test correlate::tests::graph_edges_respects_k_and_min ... FAILED
test correlate::tests::graph_edges_match_bruteforce ... FAILED
  left: {}   (right: the non-empty brute-force set)
test result: FAILED. 10 passed; 3 failed; ... 156 filtered out
```
The empty/partial and branch-only tests pass against the stub; that is expected, because their correct answer is `[]`.

GREEN 1. Command: `cargo test correlate::`, after implementing:
- the first run failed `respects_k_and_min` (`l00 missing`);
- the cause was a test bug: "hub" < "l00", so the hub sits in `a`, not `b`; I fixed the test's matcher to accept either side;
- then: `test result: ok. 13 passed; 0 failed`.

RED 2. Command: `cargo test graph_edges`, with the command tests written before the command:
```
error: cannot find macro `__cmd__graph_edges` in this scope
error[E0425]: cannot find function `graph_edges` in this scope
error: could not compile `horus` (lib test) due to 3 previous errors
```

GREEN 2. Command: `cargo test graph_edges`:
```
test commands::tests::graph_edges_command_roundtrip ... ok
test commands::tests::graph_edges_skip_hidden ... ok
test result: ok. 7 passed; 0 failed
```

## Files changed

- app/src-tauri/src/correlate.rs (+233)
- app/src-tauri/src/commands.rs (+72 / -1: the command, 2 tests and the test env handler list)
- app/src-tauri/src/lib.rs (+1)
- app/src/api.ts (+5)
- app/src/api.contract.test.ts (+1)
- app/src/firstrun.test.ts (+1)
- app/src/reference/view.test.ts (+1)

I did not commit `.impeccable/hook.cache.json` or `AGY-NOTE.md`. I staged files by explicit path; I did not use `git add -A`.

## Self-review

- Score agreement:
  - the vector, norm summation order and dot order are the same as `score`, so the scores are bit-identical (the brute-force test passes at 1e-12);
  - (i, j) and (j, i) give the same score, because the BTreeMap iteration order over shared keys is the same and `*` commutes. So it does not matter which side's top-k inserts the pair.
- Self is excluded by id (`refs[j].id != me`), as in `related`.
- The output is sorted by `(a, b)`, so it is deterministic.
- `k = 0` returns `[]`.
- The state lock is held only for the `visible` clone. Lock order: the state lock only, so there are no gate or settings interactions.

## Follow-up (5b36256), after an advisor review

The tie-break and `k` are now pinned:
- `random_lib` ids are permuted (`r{(i*37)%200:03}`), so id order is no longer index order, and the stable sort alone cannot satisfy the R4 tie-break.
- Mutation M1: removing `.then_with(|| x.1.cmp(y.1))` from `graph_edges`. Result: `graph_edges_match_bruteforce` FAILS. Code restored.
- Mutation M2: removing `.take(k)`. Result: `graph_edges_match_bruteforce` FAILS. Code restored.
- `k` is pinned only by the brute-force test. The star test cannot see a missing `take(k)`, because each leaf's only candidate is the hub, so the union restores every above-MIN hub edge anyway.
- The `api.ts` doc for `graphEdges` now says "neighbours among those sharing a technique" (c5).

Re-run after the follow-up:
- `cargo fmt --check`: OK.
- clippy `-D warnings`: clean.
- `cargo test correlate::`: 13 passed.
- `npx tsc --noEmit`: OK.
- `api.contract.test.ts`: 25 passed.

Merge note: Task 2's brief never mentions commands.rs, so the test env's `generate_handler!` change should not conflict.

## Concerns

1. Worst case is still O(N²):
   - if one technique is tagged on most references, its posting list makes nearly every pair a candidate;
   - the inverted index removes only the disjoint pairs;
   - this is inherent to the specified algorithm (exact top-k); a Zipf head technique at 2,500 references is roughly 6M dot products, which should still be fast;
   - no measurement was asked for and none was taken.
