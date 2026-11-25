# Task 2 report: the `history` module (undo and redo)

**Status:** DONE
**Commit:** `c931d5d feat(core): bounded undo/redo history over invertible edits` (on plan2-tagging, after b51ff9f)

## Files
- Created: `app/src-tauri/src/history.rs`
- Modified: `app/src-tauri/src/lib.rs` (`pub mod history;`)
- Modified: `app/src-tauri/src/edit.rs` (removed the `#[allow(dead_code)]` and the `ponytail:` line above `apply_inverse`; no other change)

## Interface (as in the brief)
`HISTORY_CAP = 200`; `History { undo: Vec<Edit>, redo: Vec<Edit> }` with `new`, `record`, `undo`, `redo`, `can_undo`, `can_redo`, `clear`. `History` also derives `Default` and `Debug`, because clippy's `new_without_default` lint requires `Default`.

## Behaviour
- **One private helper.** Both directions go through `step(from, to, data, tax)`. It peeks at `from.last().cloned()` and calls `edit::apply_inverse`. Only on `Ok` does it pop the entry and push the returned inverse onto `to`, then return `Ok(Some(touched))`. On `Err` the entry never leaves its stack.
- **Undo and redo both use `apply_inverse`,** following Task 1's review decision. Non-test code never calls the checked `apply`; History does not apply new edits itself. Commands call `apply`, then `record(applied.inverse)`.
- **`record`** clears redo, pushes the inverse, and drops the front entry once the stack is past `HISTORY_CAP`. Undo and redo only move entries between the two stacks, so the redo stack can never grow past the cap either.
- **`Touched`** is passed through unchanged, including the overlap where a reference appears in both `ref_ids` and `removed_ref_ids`. Task 5 resolves that.
- An empty stack returns `Ok(None)`.

## Deferred note: no-op edits
The brief's `record(inverse)` says nothing about no-ops. As instructed, a no-op such as an empty `AddTags` is recorded as a normal step. A `ponytail:` comment on `record` says so and names two places the skip could go later: History or the commands.

## TDD
- **RED:** the bodies were stubbed with `todo!()`, and `cargo test --lib history::` gave `0 passed; 5 failed` (all five panicked at `todo!()`).
- **GREEN:** `cargo test --lib history::` gave `5 passed; 0 failed`.

Tests (names verbatim from the brief):
- `undo_redo_roundtrip`: two adds, two undos give the start state, two redos give the state after both adds. It also checks `touched.ref_ids == ["r1"]` and the `can_*` flags.
- `new_edit_clears_redo`
- `cap_drops_oldest`: 201 records, exactly 200 undos succeed, and the next one returns `Ok(None)`. It also asserts that the surviving tag is `t0`, which shows the oldest entry was dropped and not the newest.
- `empty_is_none`: covers both `undo` and `redo`, and checks that `data` is unchanged.
- `failed_undo_keeps_entry`: `r1` is removed directly from `data`. `undo` returns `Err(UnknownReference("r1"))`, `can_undo()` is still true, `can_redo()` is false, and `data` is unchanged.

The fixture takes its operation id from `tax.operations[0]` and does not hard-code a seed id. It uses a small local `reference` helper, because the helpers in `edit.rs` are private and widening their visibility would have meant touching reviewed code.

## Checks
- **Clippy:** `cargo clippy --all-targets -- -D warnings` is clean.
- **Format:** `cargo fmt --check` is clean.
- **Full suite:** `cargo test` gives 98 unit tests plus 1 doctest = **99 passed**, 0 failed.

## Concerns and notes
- **Baseline count:** the baseline was **94** (93 + 1 doctest), not the 84 the dispatch said. HEAD b51ff9f already includes the Task 6 search merge, which probably accounts for the difference. The suite was green before and after this change: 94 + 5 = 99.
- **Test gap:** none of the five tests can tell `apply` from `apply_inverse`. That stale-state path is covered by Task 1's tests in `edit.rs` (`undo_replace_of_stale_tag`, `undo_add_technique_with_orphan_tags`). I did not add a sixth test, because the brief asks for exactly five.
- **Cost of the cap:** `record` drops the oldest entry with `Vec::remove(0)`, which is O(n) at n = 200 and negligible. Switch to a `VecDeque` only if the cap grows a great deal.
- **Not committed:** `.superpowers/` is untracked, so this report was not committed. `.impeccable/hook.cache.json` was not touched.
