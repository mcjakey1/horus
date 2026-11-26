# Task 1 review: Galaxy edges through an inverted index

Range: 378f713..5b36256 (fa7768d, 5b36256). Read-only review; suites not re-run.

## Part 1: Spec — ✅

Every item in the brief is present:
- `Edge { a, b, score }` (Serialize, camelCase, `a < b`), `Index::graph_edges(&self, &LibraryData, k)`.
- Postings `technique → indices` are built once. Candidates are the union of the reference's own technique postings. Vectors and norms are built once (R3). The cosine matches `Index::score` (same BTreeMap key order, same zero-norm guard). `score` and `related` are unchanged.
- Each reference keeps its top k with `score ≥ MIN_SCORE`, ranked `(score desc, other id asc)` (R4). The union is deduplicated by `(min, max)`. The doc comment states R4 and the c5 branch-only trade-off.
- `#[tauri::command(async)] graph_edges(k: u32)` (R2): the state lock is held only for `visible(..).into_owned()`, and `Index::build` and the scoring run outside it. No gate and no settings lock, so the lock order holds.
- R1: it scores `visible`. The IDF agrees with `related`, because `o.index` is also built from `visible(&o.lib)` (commands.rs:357, :512).
- Registered in lib.rs. `api.ts` has the `Edge` type and `graphEdges` in `Api` and `tauriApi` (`{ k }`). The contract row and both B3 fakes are there.
- All 5 correlate tests and both command tests are present. The roundtrip test goes through real IPC with `{ "k": 8 }`, so the camelCase key is checked.
- No caching: each call rebuilds the index from the current visible data.

Missing: none. Extra: none (the test `env()` handler list gains `graph_edges`, which the roundtrip test needs). Misunderstood: none.

⚠️ c5 says the Galaxy "never scores all N² pairs". The algorithm the brief prescribes does not guarantee this: when one technique is on most references, its posting list makes almost every pair a candidate. The implementer built what the brief asks for, so this is a plan-level gap, not a task miss. See I1.

## Part 2: Quality — Approved

Correctness checks:
- **Symmetric edges:** yes. score(i,j) is bit-identical to score(j,i). The shared keys are summed in the same BTreeMap order, and `*` commutes, so a pair that both sides insert gets the same value written twice.
- **Dedupe and no self-edges:** yes. Pairs are keyed `(min, max)` in a BTreeMap, and self is excluded by id.
- **Deterministic tie-break:** yes. The HashMap postings feed a BTreeSet, the sort is `(score desc, id asc)`, and the output is in BTreeMap order. The permuted ids in 5b36256 make the brute-force test catch a missing `then_with` (mutation M1).
- **k and MIN_SCORE:** yes. `take(k)` is applied after the MIN_SCORE filter. k = 0 gives `[]`. The brute-force test catches a missing `take(k)` (M2).
- **Untagged and partial references:** they have a zero vector and no postings, so they never become candidates, and the zero-norm guard prevents NaN.
- **Deleted or hidden references:** `visible` is scored and the command tests cover it. The implementer reports a mutation test (bypassing `visible` gives 3 edges).
- **Empty library:** returns `[]` (tested).

Test realism: good. The brute-force test uses an independent path (`Index::score`) on 200 xorshift references with about 10% partial tags. The branch-only test checks that the skipped pair would pass MIN_SCORE, so it has teeth. The star test honestly notes that it cannot catch a missing `take(k)`, which the brute-force test covers.

YAGNI and naming: nothing speculative was added. The names are clear (`postings`, `cands`, `top`, `me`).

## Findings

### Important

**I1 — the worst case is O(Σ df²), which is N² when one technique dominates (correlate.rs:158-183, plan-level).**
- **Problem:** cost per reference is the sum of its techniques' posting lengths. If one technique is tagged on most of N = 2,500 references (a Zipf head, or a demo-heavy library), that is about 6.25M ordered pairs: 6.25M BTreeSet inserts plus 6.25M BTreeMap dot products. Each unordered pair is also scored twice, once from each side. My estimate (not measured) is roughly 1 s in release and several seconds in a debug build. Because the command is async and outside the lock, the UI does not freeze, but the Galaxy waits for the result. This breaks the letter of c5 ("never scores all N² pairs"), and SPEC §9 is unproven for this shape of data.
- **Fix:** no code change in Task 1. Escalate to the controller so that Task 11's 2,000+ benchmark includes a head-heavy fixture (one technique on at least 80% of 2,500 references) with a time budget. If it goes over budget, the options are to score each unordered pair once (j > i, feeding both sides' top-k, for 2×), or to make an explicit, AGY-ruled cap on high-df postings, which changes exact top-k.

### Minor

**M1 — the doc comment hides the ceiling (correlate.rs:130-136).** "Scanning them would bring back O(N²)" suggests the inverted index avoids O(N²). It avoids it only for disjoint pairs. Fix: add one line, for example `// ponytail: worst case O(Σ df²), N² when one technique is on most references; Task 11 measures`.

**M2 — each unordered candidate pair is scored twice (correlate.rs:156-186).** This is a 2× constant, harmless at the current sizes. Fix: leave it unless Task 11 shows it matters (see I1).

**M3 — the B3 fakes `graphEdges: vi.fn()` return `undefined`, not a Promise (firstrun.test.ts:27, reference/view.test.ts:74).** This matches the brief exactly and nothing calls it yet. Fix: none now. When a test exercises the Galaxy, use `vi.fn(async () => [])`.
