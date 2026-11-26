# Task 0 report: move the taxonomy-edit commands into their own module

**Status:** DONE. Branch `plan4-boards`, base `503f0d0`. Nothing is pushed or merged.

## Commits

| Commit | What |
|---|---|
| `985c3ac` | `refactor(core): move taxonomy-edit commands into commands/taxonomy_edit.rs`. A pure move. |
| `2894023` | Rename `Plan` to `TaxPlan` (internal only). |
| `529043d` | Add the test `redo_reapplies_a_second_batch_shape`. |

The move has its own commit, so its diff reads as a move. The rename and the test come after it.

## What moved

- **Code:** the whole section "Plan 3 Task 9: taxonomy edits" (`commands.rs:834-1480`):
  - `Plan` and its `impl`;
  - the helpers `descending`, `rekey_branch`, `drop_branches`, `needs_move`, `move_tags`, `unique_name`, `unknown`, `check_ink` and `check_icon`;
  - the 11 commands.
- **Tests:** the test section with the same name (`commands.rs:3192` to the end). Its 31 tests now run as `commands::taxonomy_edit::tests::*`.
- **Stayed in `commands.rs`:**
  - Plan 2's `add_technique`;
  - the patch and move types (`TechniquePatch`, `DomainPatch`, `OperationPatch`, `TagMove`, `OpMove`, `DomainMove`);
  - the constants `MAX_OPS`, `EXTRA_INKS`, `DOMAIN_ICONS` and `PLAIN_ICON`.

  The brief's list did not name these types and constants, and Plan 2 code and tests use them too.

### Line check

I compared the old `commands.rs` with the new `commands.rs` plus `taxonomy_edit.rs`, line by line (multiset of non-blank lines). The only differences are these:
- The new module's header lines: a `//!` doc line, `use super::*;`, `#[cfg(test)] mod tests {`, and the tests' imports `use super::*;`, `use crate::commands::tests::*;` and `use std::fs;`.
- The section-divider comments, which I removed. The module doc line replaces them.
- `pub(super)` on the shared test helpers: `Env`, its `app` and `lib` fields, `handle`, `created`, `st`, `saved` and `halo`.
- In the `env()` test harness, `delete_technique` became `taxonomy_edit::delete_technique`.
- The Plan 2 test `damaged_taxonomy_opens` imports `add_operation`, `delete_domain` and `update_technique` from `super::taxonomy_edit`. This is a `use`-path change only.
- In `extra_inks_match_ts`, the `include_str!` path gained one `../`, because the file is one folder deeper. The test is unchanged.

## Deviations from the brief

- **Parent helpers keep their visibility.** The brief asked for `pub(super)` on `commit` and the other helpers the moved code uses. The child module reads its parent's private items through `use super::*`, so `commit`, `Open`, `lock` and the rest stay private. That gives a smaller diff and narrower visibility. Only the test helpers needed `pub(super)`.
- **`lib.rs`** names each of the 11 commands as `commands::taxonomy_edit::<cmd>`, with no glob re-export. Tauri's IPC name comes from the function name, so the wire names are unchanged.

## The new test

`redo_reapplies_a_second_batch_shape`:
1. On `lib3()`, run `delete_operation("group", Operation → differentiate)`. This moves the branches and the tags t4, t6, t7 and t9.
2. Take a snapshot of the data and the taxonomy (`applied`), and assert it differs from the snapshot before the edit.
3. Undo, and assert the state equals the snapshot before the edit.
4. Redo, and assert `Change.taxonomy` is present and the data and taxonomy equal `applied`.

## Checks

| Check | Result |
|---|---|
| Baseline `cargo test` before the work | 207 passed, 2 ignored; plus 0 and 1 |
| `cargo test` after the move | 207 passed, 2 ignored; plus 0 and 1 (equals the baseline) |
| `cargo test` after the new test | **208** passed, 2 ignored; plus 0 and 1 (baseline plus one) |
| `cargo test commands::` | 85 passed |
| `cargo clippy --all-targets -- -D warnings` | clean |
| `cargo fmt --check` | clean |
| `tsc --noEmit` | clean |
| vitest | 461/461, 38 files |
| `api.contract.test.ts`, untouched | 37/37 |
| `npm run build` | exit 0, with Vite's usual warning about a chunk over 500 kB |

## Not done (per the rulings)

- The `EditError::UnknownTag` remap for taxonomy items is deferred to Plan 6, because it would change error text.

## Sizes

- `commands.rs`: 4,153 lines before, 2,547 after.
- `commands/taxonomy_edit.rs`: 1,635 lines.
