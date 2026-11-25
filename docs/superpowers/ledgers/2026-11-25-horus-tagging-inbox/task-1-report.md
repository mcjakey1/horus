# Task 1 report: the `edit` module

**Status:** DONE_WITH_CONCERNS
**Commits** (on `plan2-tagging`, parent `c2e0285`):
- `a5bf8fa` feat(core): validated, invertible edits for tags, fields, references and techniques
- `69eb925` test(core): edit round trips for fields, tag replace, references and mid-list techniques (also skips the InUse scan while a batch unwinds)

## Concern 1 (rule on this before Task 2): three extra `Edit` variants

The brief's enum cannot express the inverse of a remove. `AddTags`, `AddReferences` and `AddTechnique` append. But `remove_inverse_restores_positions` needs a re-insert in the middle of the list, and `RemoveTechnique` has an `index`. Composing the listed variants does not work either. Re-appending the tail would need the bystander techniques removed, which trips `InUse`. `RemoveTechnique` also has no link positions.

I kept every listed name and signature verbatim and added three re-insert variants that mirror the removes:

```rust
InsertTags { ref_id: String, tags: Vec<(usize, Tag)> },               // final positions, ascending
InsertReferences { refs: Vec<(usize, Reference)> },
InsertTechnique { index: usize, technique: Technique, links: Vec<(usize, BranchTechnique)> },
```

- The inverses pair up as `Add*` -> `Remove*` (with computed positions), `Remove*` -> `Insert*`, `Insert*` -> `Remove*`, and `ReplaceTag` and `SetField` -> themselves with the values swapped.
- Internally each `Add*` validates and then hands off to its `Insert*`.
- `Insert*` restores a state that already existed, so it checks positions only. It never re-validates tags, so undoing the removal of a tag the taxonomy no longer allows still works.
- `touches_taxonomy()` includes `InsertTechnique`.
- These variants are public but meant for inverses only, because they skip validation. Commands should build the `Add*` and `Remove*` forms. This is part of what the controller is ruling on.

## Concern 2: `EditError` has no technique variant

I did not add one. Instead:
- A repeated technique id is `DuplicateId`.
- A bad `AddTechnique` link (empty link list, link to another technique, unknown branch, or the same branch twice) is `InvalidTag("technique <id>: ...")`.
- On `RemoveTechnique`, a missing or mismatched technique, or links that differ from the real ones, is `UnknownTag("technique <id>...")`.

## Other notes and choices

- **The inverse is built from real state, not from the payload.**
  - `SetField` ignores `before`. Its inverse restores the value that was really there.
  - `RemoveTags`, `RemoveReferences` and `RemoveTechnique` require each `(i, item)` to be at `i` right now, with `i` strictly ascending. Otherwise they return `Err`. They never panic on an index.
  - `RemoveTechnique` requires `links` to equal the technique's current links in `branch_techniques` order. The inverse records their real positions.
- **Batch.**
  - The parts run in order. On a failure, the inverses collected so far are applied in reverse.
  - The unwind runs with `check: false` (a private `run` fn). That flag skips `validate_tag` on `ReplaceTag` and the `InUse` scan on `RemoveTechnique` (the inverse of an added technique). Those were the two inverse paths that could otherwise fail on a stale or orphan tag.
  - The unwind `expect`s success. Under linear history a real inverse always applies.
  - `Touched` merges across parts and lists each id once. Nested batches recurse.
  - A reference that is both changed and removed in one batch appears in both `ref_ids` and `removed_ref_ids`. Task 5 should let `removed_ref_ids` win.
- **`validate_tag`.**
  - The operation must exist in `tax.operations`, as data. No constants are used.
  - The technique and branch must be set together, and `branches_for(op, tech)` must contain the branch.
  - Regions are checked as positive conditions, so NaN fails. There is a 1e-6 tolerance on `x+w` and `y+h` for f32 rounding, marked with a `ponytail:` comment.
- **`ReplaceTag`** requires `before` to exactly equal a current tag and `after.id == before.id` (`InvalidTag` otherwise).
- **`AddReferences`** rejects a reference id that already exists or repeats (`DuplicateId`), and validates each reference's tags.
- **`RemoveReferences`** does not touch `links` or `boards` that point at the reference. Plan 2 has no edits that create those, so I left that for the plan that does.
- **`new_id`** has the format `<prefix>-<base36 nanos>-<base36 AtomicU64>`. The base36 conversion is hand-written. No new dependency.
- **`EditError`** also derives `thiserror::Error`, so it has a readable `Display` for Task 5's commands. `thiserror` is already a dependency.
- **R16** (the pre-flight ruling for `set_field` with a `FieldPatch`) is for the command layer. Task 1's `SetField` follows the brief: one `Field` per edit. Task 5 can put two in a `Batch` for one undo step.
- **B6** (`find_by_name`) is not in Task 1.

## TDD evidence

- **Baseline** before any change: `cargo test`, 69 passed.
- **RED:** I wrote `edit.rs` with only the test module, plus `pub mod edit;` and the `model.rs` fixture change. `cargo test edit::` failed to compile with 40 errors: E0425 for `apply` ×12, `validate_tag` ×5 and `new_id` ×1, and E0433 for `Edit` ×15, `EditError` ×6 and `Field` ×1.
- **GREEN:** `cargo test edit::` gave 11 passed:
  - add_then_inverse_restores
  - remove_inverse_restores_positions
  - technique_tag_needs_matching_branch
  - partial_tag_is_valid
  - region_bounds
  - unknown_ref_is_error_and_data_unchanged
  - batch_failure_rolls_back
  - batch_inverse_reverses
  - remove_technique_in_use_fails
  - duplicate_tag_id_rejected
  - new_id_unique
- **Follow-up (`69eb925`):** I added assertions inside two of the existing tests, so the count is still 11. They exercise paths that had never run successfully:
  - `remove_inverse_restores_positions` now also covers:
    - `RemoveReferences` of index 0 of 2, with undo, redo and undo again;
    - `RemoveTechnique` of a seed technique that is not last and whose links are not at the tail, with undo, redo (checking the redo equals the original edit) and undo again. This is the `InsertTechnique` mid-list path behind Concern 1.
  - `batch_failure_rolls_back` now runs `SetField` and `ReplaceTag` forward (checking their effect), undoes them, and then shows they unwind when a later part fails.
  - All passed first time. No bug was found.
- **Full suite:** `cargo test` gave 80 passed (69 + 11), 0 failed, after both commits.
- **Lint:** `cargo clippy --all-targets -- -D warnings` was clean, and `cargo fmt` made no further changes.

The tests go a little past the brief:
- `region_bounds` also rejects NaN.
- `duplicate_tag_id_rejected` also covers a duplicate inside the incoming list.
- `unknown_ref_is_error_and_data_unchanged` covers both `AddTags` and `SetField`.
- `batch_inverse_reverses` also checks that `tax.validate()` passes after the add.

## Files changed

- `app/src-tauri/src/edit.rs` (new): the module and its 11 tests.
- `app/src-tauri/src/lib.rs`: `pub mod edit;`.
- `app/src-tauri/src/model.rs`: the fixture sets both `technique_id` and `branch_id`, and the expected JSON includes `techniqueId`.

`.impeccable/hook.cache.json` was not committed (only explicit paths were staged).

## Fix round 1 (review of 69eb925, rulings I1 and I2)

**Commit:** `6ff4877` fix(core): undo restores stale states, Insert edits are sealed, orphan links block AddTechnique

### I1: undo could get stuck, and `Insert*` was not sealed

- I added `pub(crate) fn apply_inverse(data, tax, edit) -> Result<Applied, EditError>`. It runs with `check: false`, and Task 2's `History` should call it for both undo and redo.
  - Until Task 2 calls it, it carries `#[allow(dead_code)]` with a `ponytail:` note.
- `pub struct Sealed(());` has a private field. `InsertTags`, `InsertReferences` and `InsertTechnique` each carry `sealed: Sealed`, so code outside `edit.rs` can pass these edits along but cannot build one.
- A `compile_fail` doctest on `Sealed` checks that the type cannot be built from outside the crate.

### I2: the batch unwind could panic on an orphan link

`AddTechnique` now also returns `DuplicateId` when any `branch_techniques` entry already has `technique_id == id`.

### Tests that cover the fixes

These are new. The 11 brief tests are unchanged.

- **`undo_replace_of_stale_tag`.**
  - `r2.t2` names a technique the taxonomy lacks.
  - `ReplaceTag` changes it to a valid tag.
  - Applying the inverse through the checked `apply` returns `InvalidTag`.
  - Applying it through `apply_inverse` restores the snapshot, and redoing through `apply_inverse` works.
  - `Batch([ReplaceTag, failing])` returns `Err` with data unchanged. This covers the `ReplaceTag` gate in the unwind.
- **`undo_add_technique_with_orphan_tags`.**
  - An orphan tag already names `my-trick`.
  - `AddTechnique my-trick` succeeds.
  - Applying its inverse through the checked `apply` returns `InUse`.
  - Applying it through `apply_inverse` restores data and tax.
  - `Batch([AddTechnique, failing])` returns `Err` with data and tax unchanged. This covers the `InUse` gate in the unwind.
- **`orphan_link_blocks_add_technique`.**
  - The taxonomy holds a link to `my-trick` but has no such technique.
  - Both the plain `AddTechnique` and `Batch([AddTechnique, failing])` return `DuplicateId("my-trick")`.
  - Neither panics, and data and tax are unchanged.
- **Doctest** `edit::Sealed (line 85) - compile fail`: passes.

### TDD evidence and commands

1. **RED 1**, with the tests only: `cargo test edit::` failed with `error[E0425]: cannot find function apply_inverse` ×3.
2. **RED 2**, with `apply_inverse` added and no I2 fix: `cargo test edit::` gave `13 passed; 1 failed`. `orphan_link_blocks_add_technique` panicked at its first assert, because the plain `AddTechnique` returned `Ok`.
3. **GREEN**, with the I2 fix and `Sealed`: `cargo test edit::` gave `14 passed; 0 failed`.
4. **Gate coverage**, with each gate removed in turn and the file then restored:
   - Without the `InUse` gate, `undo_add_technique_with_orphan_tags` fails (13 passed, 1 failed).
   - Without the `ReplaceTag` gate, `undo_replace_of_stale_tag` fails (13 passed, 1 failed).
5. **Full suite:** `cargo test` gave 83 passed (69 + 14) for the unit tests, and the doctests gave 1 passed (the `compile_fail` seal check).
6. **Lint:** `cargo clippy --all-targets -- -D warnings` was clean, and `cargo fmt --check` was clean.

### Left out, as ruled

The deferred minor findings were not touched: "removed wins", the `Display` text, and empty `AddTags`.
