# Task 5 report: the `correlate` module

**Status:** DONE
**Branch:** `t5-correlate`, in the worktree `.worktrees/t5-correlate`, based on 9eea1e9.
**Commit:** `bb5b666`, `feat(core): cosine correlation with smoothed IDF`.

## What was done

- **New file: `app/src-tauri/src/correlate.rs`.** It holds the items the brief specifies, with the brief's signatures:
  - `BRANCH_W = 0.3`
  - `MIN_SCORE = 0.05`
  - `Scored { id, score, shared_techniques, shared_branches }`. It derives Serialize with camelCase, to match `model.rs`.
  - `Index::{build, score, related}`
- **`app/src-tauri/src/lib.rs`:** one line added, `pub mod correlate;`. Nothing else changed.

### Algorithm

The algorithm matches `prototype/app.js` (`computeIdf`, `vec`, `score`, `related`) and SPEC §4:

- **N:** the number of references that have at least one technique tag.
- **idf:** `ln(1 + N/df)`, raw and unscaled. `df` counts each reference once, because each reference's techniques go into a set before counting.
- **Vector:** each technique tag adds an entry for its technique, weighted by its idf, and an entry for its `branch_id`, weighted by `BRANCH_W`.
  - Partial tags (operation only) add nothing.
  - A repeated technique or branch, such as several region tags, collapses to one entry, because the vector is a map.
- **Score:** cosine similarity.
  - If either vector is zero, the score is `0.0`. It is never NaN.
  - `shared_*` lists the keys both vectors contain, in sorted order, so the output is deterministic.
- **`related`:**
  - excludes the reference itself;
  - keeps only scores `>= MIN_SCORE`;
  - sorts in descending order with `total_cmp`, which is stable on ties;
  - returns `[]` for an unknown id.

### Tests

These are the seven test names from the brief, used verbatim, plus one extra:

- `one_vs_six_is_about_0_408` follows the controller's ruling. Five extra references, C2 to C6, each have one of t2 to t6. That makes `df = 2` for t1 to t6, with `N = 7`, so the expected score is 1/√6 ≈ 0.408.
- `rare_beats_common`: `t_common` is on 9 of 10 references and `t_rare` is on 2. Each reference also has its own unique filler technique.
- The extra test, `related_excludes_self_sorts_desc_and_filters`, checks that `related` excludes the reference itself, sorts in descending order and drops zero scores.

## RED / GREEN

All commands ran from `app/src-tauri`, with `PATH` including `%USERPROFILE%\.cargo\bin`.

**RED.** I first ran against a stub with the final signatures; its `score` returned NaN and its `related` returned `[]`.

```
$ cargo test correlate::
failures:
    correlate::tests::identical_sets_score_one
    correlate::tests::one_vs_six_is_about_0_408
    correlate::tests::partial_tags_count_zero
    correlate::tests::rare_beats_common
    correlate::tests::regions_collapse
    correlate::tests::related_excludes_self_sorts_desc_and_filters
    correlate::tests::same_branch_different_technique_is_partial
test result: FAILED. 1 passed; 7 failed; 0 ignored; 0 measured; 17 filtered out
```

`empty_library_related_is_empty` passed against the stub, because the stub returns `[]`. That test cannot fail first unless the stub returns something non-empty.

**GREEN.**

```
$ cargo fmt
$ cargo test correlate::
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 17 filtered out
$ cargo clippy --all-targets -- -D warnings
    Finished `dev` profile [unoptimized + debuginfo] target(s) in 3m 39s   (no warnings)
$ cargo test
test result: ok. 25 passed; 0 failed   (lib)
```

## Files changed

```
 app/src-tauri/src/correlate.rs | 318 +++++++++++
 app/src-tauri/src/lib.rs       |   1 +
```

## AGY

I asked AGY Validator #2 once, in conversation `bb3386cd-1d6e-4a8a-a063-cc068ad041c0`, to review the commit against the brief, SPEC §4, `prototype/app.js` and the controller's rulings. It worked read-only.

**Verdict: `PASS`.**

AGY raised two non-blocking test nits. I did not apply either:

1. The filter test drops only a score of `0.0`; it has no case with a non-zero score below `MIN_SCORE`. It also does not assert that `related(&d, "missing")` is empty. The unknown-id path is in the code but untested.
2. If an `Index` built from an older library is used, a technique missing from it gets weight 0. If that technique is shared, it would still appear in `shared_techniques`. This is harmless if the index is rebuilt after each change.

## Concerns

- **N differs from the prototype on purpose.** `prototype/app.js:52` counts references with *any* tag, partial tags included. The brief and the controller's ruling count only references that have at least one technique tag. The Rust code follows the brief. If the two must give identical scores, change the prototype's `computeIdf` to match.
- **A technique tag without a `branch_id`** adds only its technique entry. The model says this shouldn't happen; the prototype treats a missing domain the same way.
- **Nothing in the app calls `Index` yet.** Whatever calls it, presumably Task 7, must rebuild it whenever the library changes (see AGY nit 2).
