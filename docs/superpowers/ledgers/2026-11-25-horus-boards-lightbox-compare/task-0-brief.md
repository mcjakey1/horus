### Task 0: Move the taxonomy-edit commands into their own module [B1]

Plan 3's final review (ruling M9, `docs/superpowers/ledgers/2026-11-25-horus-graph-views/final-review.md:233-238`, `:390`) put this first in Plan 4, before more commands land on `commands.rs` (4,153 lines).

**Files:**
- Create: `app/src-tauri/src/commands/taxonomy_edit.rs`.
- Modify:
  - `app/src-tauri/src/commands.rs` (it stays the parent module file, with `pub mod taxonomy_edit;`);
  - `app/src-tauri/src/lib.rs` (the `generate_handler!` list).

**What moves:** the section "Plan 3 Task 9: taxonomy edits" (`commands.rs:834-1480`):
- `Plan` and its `impl`;
- `descending`, `rekey_branch`, `drop_branches`, `needs_move`, `move_tags`, `unique_name`, `unknown`, `check_ink` and `check_icon`;
- the commands `update_technique`, `update_domain`, `add_domain`, `delete_domain`, `add_operation`, `update_operation`, `delete_operation`, `link_technique`, `unlink_technique`, `delete_technique` and `add_branch`.

Their tests move into a `#[cfg(test)] mod tests` in the new file, reusing `commands::tests::env()` (make it `pub(crate)` if needed). Plan 2's `add_technique` (`:797`) stays where it is. Shared helpers the moved code calls (`commit` and any others it uses from the parent) stay in `commands.rs`, at `pub(super)` visibility.

**Rules:**
- **No behaviour change.** Every wire string, error text and command name stays the same. Existing tests may only change their `use` paths.
- `lib.rs` names each moved command by its new path, `commands::taxonomy_edit::<cmd>`. Don't rely on a glob re-export, because Tauri's `__cmd__` macros must resolve.
- **Carried from Plan 3's deferred list** (`final-review.md:308-311`):
  - Rename `Plan` to `TaxPlan` (the "Plan N" name collision). This is internal only.
  - Add one test, `redo_reapplies_a_second_batch_shape`. The only taxonomy redo test today redoes a `delete_technique` that moves tags (`delete_moves_tags_and_undo_restores`). The new one undoes and redoes a `delete_operation` that moves tags. The `data` and `tax` after redo equal those after the first apply. This is the one test T0 adds; the pass count is the baseline plus one.
  - Taxonomy items reported as `EditError::UnknownTag` (`edit.rs:476`, `:499`, `:725`, `:734`, `:748`): **deferred again**, to Plan 6's copy pass. Mapping them to new variants changes error text, which breaks this task's no-behaviour-change rule. `sayError` already shows generic copy, so no raw text reaches the artist.

- [ ] **Step 1: Record the baseline.** Run `cargo test` in `app/src-tauri`, and note the pass count.
- [ ] **Step 2: Move, rename `Plan`, update `lib.rs`.** Then run `cargo test`, `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check`. The pass count equals the baseline.
- [ ] **Step 3: Add `redo_reapplies_a_second_batch_shape`.** Run `cargo test commands::`. The count is now the baseline plus one.
- [ ] **Step 4: Commit.** Commit message: `refactor(core): move taxonomy-edit commands into commands/taxonomy_edit.rs`.

---

