### Task 1: Galaxy edges through an inverted index (Rust)

**Files:**
- Modify:
  - `app/src-tauri/src/correlate.rs`;
  - `app/src-tauri/src/commands.rs`, adding `graph_edges`;
  - `app/src-tauri/src/lib.rs`, registering the command;
  - `app/src/api.ts`;
  - `app/src/api.contract.test.ts`: a `graphEdges` row (B3);
  - `app/src/firstrun.test.ts` and `app/src/reference/view.test.ts`: `graphEdges: vi.fn()` in each typed `Api` fake (B3).

**Interfaces:**
- Consumes `correlate::Index` and `Scored` (Plan 1 Task 5); `AppState { open: Mutex<Option<Open>> }`, `lock()` and `visible(&o.lib)` (`commands.rs:26-54`, `:201`, `:273-283`).
- Produces:
  ```rust
  #[derive(Serialize, Clone, Debug, PartialEq)] #[serde(rename_all = "camelCase")]
  pub struct Edge { pub a: String, pub b: String, pub score: f64 }        // a < b (string order), unique pair
  impl Index { pub fn graph_edges(&self, data: &LibraryData, k: usize) -> Vec<Edge>; }
  // command: graph_edges(k: u32) -> Vec<Edge>
  ```
  ```ts
  export type Edge = { a: string; b: string; score: number };
  // Api gains: graphEdges(k: number): Promise<Edge[]>   // invoke("graph_edges", { k })
  ```
- How `graph_edges` works:
  - Build `postings: technique id → reference indices` once.
  - For each reference, its candidates are the union of the postings of its own techniques.
  - **Build each reference's weighted vector and its norm once (R3),** then compute the cosine from those, with exactly `Index::score`'s maths. `Index::score` rebuilds both vectors on every call (`correlate.rs:78-79`), which at 2,500 Zipf-tagged references reaches millions of pair rebuilds. `score` and `related` are not changed; `graph_edges_match_bruteforce` against `Index::score` guards that the two agree.
  - Keep the top `k` with `score ≥ MIN_SCORE`, **ranked by `(score desc, other id asc)` (R4)**, so ties at the k boundary are deterministic. The brute force ranks the same way. State this in the doc comment.
  - The edge set is the **union** of every reference's top-k, deduplicated by `(min(a, b), max(a, b))`.
  - Pairs that share only a branch are not candidates. This is the c5 trade-off: such pairs score low and would bring back O(N²). Record it in a doc comment.

- [ ] **Step 1: Write the failing tests**, in `correlate.rs` `tests`:
  - `graph_edges_match_bruteforce`: a seeded random library of 200 references over 30 techniques, built with an inline xorshift or LCG in the test module (C21; there is no `rand` crate and none may be added). `graph_edges(&d, 8)` equals a brute-force top-8 (scored with `Index::score`, ranked `(score desc, id asc)`) over all pairs that share at least one technique, compared as sets of `(a, b)` with scores within 1e-12.
  - `graph_edges_no_self_no_dupes`: no edge has `a == b`, and each pair appears once with `a < b`.
  - `graph_edges_respects_k_and_min`: in a star where one hub shares a distinct rare technique with each of 20 leaves, the hub keeps its own top 8. The union can still contain more of the hub's edges, from the leaves' side. Every score is at least `MIN_SCORE`.
  - `graph_edges_empty_and_partial`: an empty library, and one where every tag is partial, both return `[]`.
  - `graph_edges_skip_branch_only`: two references that share only a branch produce no edge.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test correlate::`. It should FAIL, then PASS. Then run `cargo clippy --all-targets -- -D warnings`.

- [ ] **Step 3: Add the command and wrapper**

  - **`#[tauri::command(async)] graph_edges(k: u32)` (R2).** A sync command runs on the main thread, and scoring under the lock would block the saver and every other command. Under `lock(&st.open)`, clone `visible(&o.lib)` (cheap at 2,500), then release the lock. Outside it, `Index::build` the clone (`Index` is not `Clone`; the build is O(tags)) and call `graph_edges(&clone, k as usize)`.
  - **Hidden references never appear (R1).** Because the command scores `visible(&o.lib)`, it never emits an edge to a hidden id (Plan 2 ruling, ledger: hidden references never appear in related results, search hits or counts).
  - In `api.ts`, add the `Edge` type and `graphEdges` to `Api` and `tauriApi`. Add the `api.contract.test.ts` row (`graph_edges`, `{ k }`) and the two `vi.fn()` fakes (B3).

  Add these Rust tests in `commands.rs`, using `tauri::test::mock_builder()` like the existing command tests:
  - `graph_edges_command_roundtrip`: on a created library with no imports, the command returns `Ok([])`.
  - `graph_edges_skip_hidden`: beside `bad_hash_is_hidden_not_fatal`, a library where two references share a technique and one is hidden returns no edge naming the hidden id.

  Run `cargo test`, clippy with `-D warnings`, `npm test` and `npm run build`. All PASS.

- [ ] **Step 4: Commit**

  Commit message: `feat(core): Galaxy edges via inverted technique index`.

---

