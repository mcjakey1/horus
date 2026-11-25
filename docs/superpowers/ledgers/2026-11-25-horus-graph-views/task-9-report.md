# Task 9 report: taxonomy edits (Rust)

Status: DONE_WITH_CONCERNS (the concern is file growth; everything else works)
Branch: plan3-graph (worktree .worktrees/plan3-graph)
Commit: `de4545e feat(core): undoable taxonomy, operation and domain edits with moves`

## What I implemented

### `edit.rs`
- I added 15 `Edit` variants, as the brief lists them:
  - `UpdateTechnique`, `UpdateDomain` and `UpdateOperation`;
  - `AddOperation`, `RemoveOperation` and `InsertOperation`;
  - `AddDomain`, `RemoveDomain` and `InsertDomain`;
  - `LinkTechnique`, `UnlinkTechnique` and `InsertLink`;
  - `AddBranch`, `RemoveBranch` and `InsertBranch`.
- B5 is respected:
  - The `Insert*` variants carry `Sealed`. They check positions only.
  - `Add*` and `LinkTechnique` validate the edit, then delegate to `Insert*` at `len`.
  - `Remove*` and `UnlinkTechnique` check that `list[index] == item`. They raise `InUse` only under `check`:
    - an operation is in use while a branch or a tag names it;
    - a domain is in use while a branch names it;
    - a link is in use while a tag uses its (technique, branch) pair;
    - a branch is in use while a link or a tag names it.
  - The inverse of each `Remove*` is its `Insert*` at the original index.
  - `Update*` finds the item by value, as `ReplaceTag` does. It keeps the id, swaps `before` and `after`, and sets `touched.taxonomy`.
- Edit-level validation errors:
  - an id that is already taken returns `DuplicateId`;
  - a duplicate link, or a duplicate branch id or (operation, domain) pair, also returns `DuplicateId`;
  - a link to an unknown technique or branch, or a branch with an unknown operation or domain, returns `InvalidTag`. This follows the existing `AddTechnique` convention.
- Three small helpers do the work: `insert`, `found` and `update`.
- `touches_taxonomy` names every new variant explicitly, `Insert*` included.
- `edit.rs` holds 5 new tests (listed under Tests).

### `taxonomy.rs`
- `name_key` is now `pub(crate)` (R15).
- I added `pub(crate) fn free_id(name, taken)`. It is the slug rule plus `-2`, `-3` and so on. It was extracted from `custom_technique`, which now calls it, and all new ids use it.

### `commands.rs`
- **Types:** `TechniquePatch`, `DomainPatch` and `OperationPatch` (C7):
  - `color` uses `double_option`.
  - `TagMove`, `OpMove` and `DomainMove` are tagged by `kind`, with `rename_all_fields = "camelCase"`. They derive both Serialize and Deserialize.
- **Constants:**
  - `MAX_OPS = 9`.
  - `EXTRA_INKS`.
  - `DOMAIN_ICONS`: the six seed icon strings verbatim, then "a plain square" and "a dot inside a ring".
  - The private `PLAIN_ICON`.
- **`commit`:**
  - R13 runs after the `TaxonomyReadOnly` check, for taxonomy edits only.
  - It records the `validate()` errors before `apply` and diffs them after.
  - If the edit adds errors, it calls `apply_inverse`, records nothing and returns the new errors joined with "; ".
  - `is_noop` gains the three `Update*` arms (R14).
- **The `Change.created` doc** now reads "the new item's id (technique, operation or domain)" (C23).
- **The 11 commands:**
  - `update_technique`, `delete_technique`, `link_technique` and `unlink_technique`;
  - `add_branch`;
  - `add_domain`, `update_domain` and `delete_domain`;
  - `add_operation`, `update_operation` and `delete_operation`.
  - Each goes through `commit` and is one undo step.
- **`Plan`, the multi-part builder.** It works on a scratch clone of `lib.data` and `tax`.
  - Additions and `ReplaceTag`/`RemoveTags` go through `edit::apply` on the scratch as they are pushed.
  - Removals are queued. `finish()` emits them grouped as links, then techniques, branches, domains and operations, each in descending index order, read from the scratch at that step.
  - Tag scans cover all references, hidden ones included.
- **`rekey_branch(p: &mut Plan, from, to_op, to_domain)`:**
  - It finds the target by `(operation_id, domain_id)`, and only when none exists mints `<to_op>.<to_domain>` (C16).
  - It links what the target lacks, copying `source`, `rationale` and `extra`.
  - It re-points the tags (`branch_id = to`, `operation_id = to_op`).
  - It queues `from`'s links and `from` itself for removal.
- **`drop_branches`.** It is the "Delete" path for operations and domains. A link whose technique is linked elsewhere is unlinked. A technique linked only on the dropped branches gets a `RemoveTechnique`, which takes its links with it (C15).
- **`move_tags`.**
  - With `TagMove::Technique`, the tag takes the target's technique, branch and the branch's operation, with `suggested: false`.
  - With `Partial`, the tag drops its technique and branch, and keeps its operation, region and `suggested`.
  - It validates the target: it must be a linked pair, and not the one being removed. Otherwise it returns `BadMoveTarget`.
- **Check order:**
  - `LastOperation` is checked before `NeedsMove`.
  - `LastLink` is checked before `NeedsMove`.
  - `build` runs before the read-only check, as R17 says.

### Other files
- `saver.rs`: I reworded the `flush` comment for R16. It now says the dangling ids are accepted, kept (SPEC §9), degraded in the UI, and reported by Plan 6.
- `lib.rs`: all 11 commands are registered.
- `api.ts`:
  - the `TechniquePatch`, `DomainPatch` and `OperationPatch` types;
  - `TagMove`, `OpMove` and `DomainMove` (tagged by `kind`);
  - 11 `Api` members and 11 `tauriApi` wrappers. Optional arguments are sent as `?? null`.
- `api.contract.test.ts`: 11 rows. The keys are `id`, `patch`, `moveTo`, `techniqueId`, `branchId`, `operationId`, `domainId`, `plainLabel`, `name`, `description`, `icon` and `color`.
- `firstrun.test.ts` and `reference/view.test.ts`: 11 `vi.fn()` each (B3).

## Error strings for Task 10
The brief lists `NeedsMove`, `LastLink`, `LastOperation`, `TooManyOperations`, `UnknownInk`, `UnknownIcon`, `NameTaken:<id>`, `LabelTaken:<id>` and `TaxonomyReadOnly`.

I chose these extra strings, because the brief does not name them:
- `EmptyName`: a name or plain label that is empty after collapsing whitespace.
- `BadMoveTarget` is returned when the move target:
  - is the item being deleted;
  - is an unknown operation or domain;
  - is an unlinked pair;
  - is the technique or pair being removed.
- `unknown <kind>: <id>` covers an unknown technique, domain, operation or link id.
- Edit-level errors keep their `EditError` text, for example `duplicate id: group.semantic` for an `add_branch` on a pair that already exists.

## Tests and results
- `cargo test`: 205 passed, 0 failed, plus 1 doctest passed. The baseline was 171.
- `cargo clippy --all-targets -- -D warnings`: clean.
- `cargo fmt --check`: clean.
- `npm test` (vitest): 28 files, 286 tests passed. The contract file runs 36 tests: 33 rows (22 old, 11 new) and 3 other tests.
- `npx tsc --noEmit`: exit 0.
- `npm run build`: built.

New Rust tests:
- **In `edit.rs`:**
  - `update_technique_inverse_restores`;
  - `remove_branch_in_use`;
  - `taxonomy_edits_round_trip`: add, undo and redo for an operation, a domain, a branch and a link, plus `DuplicateId`, `InUse`, and an unused middle operation restored in place;
  - `touches_taxonomy_covers_new_variants`;
  - `validate_rejects_mutations`: a table of 5 cases.
- **In `commands.rs`:**
  - every test the brief names: `rename_collision`, `rename_to_own_name_case`, `noop_rename_records_nothing`, `delete_moves_tags_and_undo_restores` (with redo), `delete_to_partial`, `unlink_last_link_refused`, `unlink_unused_pair_needs_no_move`, `move_repoints_operation`, `unlink_many_descending`, `delete_unused_needs_no_move`, `tag_move_json_camel`, `op_move_json_camel`, `add_branch_then_link`, `commit_reverts_new_validate_errors`, `commit_tolerates_existing_problems`, `add_operation_defaults_ink`, `rename_operation_label`, `reink_seed_operation`, `delete_operation_moves_branches`, `delete_operation_delete`, `last_operation_refused`, `delete_domain_moves_or_partials`, `add_domain_then_branch`, `add_domain_with_op_is_one_step`, `multi_branch_batch_indices`, `dangling_tag_ids_open_and_render` and `extra_inks_match_ts`;
  - `damaged_taxonomy_opens`, extended for R17. `update_technique`, `add_operation` and `delete_domain(social, Delete)` each return `TaxonomyReadOnly`, undo reports `can_undo: false`, and `taxonomy.json` is still the bytes `{`;
  - two extras: `move_target_must_be_another_linked_pair`, and `delete_technique_ipc_keys`, a real IPC call with `moveTo: {kind: "partial"}`.
- **Fixture:** `lib3()` is the seed taxonomy plus three references, written to `library.json` (with well-formed fake hashes) and opened through `open_library`. Its tags are listed in the doc comment of `lib3_with`. "Value-equal" assertions compare `serde_json::Value` snapshots of the data and the taxonomy.

## TDD evidence
- **RED, edit level.** Command: `cargo test --lib edit::`. The new variants were present, but `run` had a stub arm that returned `Err`, and `touches_taxonomy` returned `false` for them.
  ```
  test edit::tests::remove_branch_in_use ... FAILED
  test edit::tests::taxonomy_edits_round_trip ... FAILED
  test edit::tests::touches_taxonomy_covers_new_variants ... FAILED
  test edit::tests::update_technique_inverse_restores ... FAILED
  test result: FAILED. 15 passed; 4 failed; ... 157 filtered out
  ```
  `validate_rejects_mutations` passed at once, because it characterises the existing `validate()`.
- **GREEN, edit level.** After the implementation: `test result: ok. 19 passed; 0 failed`.
- **Command level.** I wrote the command implementations before their tests, so I have no RED run of the command tests against stubs. I proved the tests have teeth by mutation instead. The script restored the file after each mutation, and `cmp` confirmed it (RESTORED). Command: `cargo test --lib commands::tests::`.
  - **M1:** R13 revert disabled (`checked = false`). `commit_reverts_new_validate_errors` FAILED (81 passed, 1 failed).
  - **M2:** the `is_noop` arm for `UpdateTechnique` removed. `noop_rename_records_nothing` FAILED.
  - **M3:** removals emitted in ascending order. 7 tests FAILED:
    - `unlink_many_descending`, `multi_branch_batch_indices`, `delete_operation_moves_branches`, `delete_operation_delete`, `delete_domain_moves_or_partials` and `last_operation_refused`;
    - `damaged_taxonomy_opens`, because `build` fails before the read-only check, which is the R17 order.
  - **M4:** a moved tag keeps its own operation. `move_repoints_operation` FAILED.
  - **M5:** `rekey_branch` re-links even when the target already holds the link. `delete_operation_moves_branches` FAILED.
- **GREEN, full run.** `cargo test`: 205 passed.

## Files changed
- app/src-tauri/src/edit.rs
- app/src-tauri/src/commands.rs
- app/src-tauri/src/taxonomy.rs
- app/src-tauri/src/saver.rs
- app/src-tauri/src/lib.rs
- app/src/api.ts
- app/src/api.contract.test.ts
- app/src/firstrun.test.ts
- app/src/reference/view.test.ts

`.impeccable/hook.cache.json` is modified in the worktree. I did not change it and did not commit it.

## Self-review
- **B5.** No command builds an `Insert*`, and `Sealed(())` is still constructible only in `edit.rs`. Undo and redo go through `History` and `apply_inverse`.
- **Review Focus 4.** Every delete or move is one `Batch`, and therefore one undo step. Undo restores everything value-equal. These tests assert it: `delete_moves_tags_and_undo_restores`, `move_repoints_operation`, `delete_operation_*`, `delete_domain_moves_or_partials` and `multi_branch_batch_indices`.
- **Batch order.** Additions and tag changes come first. Then come the removals by collection, in descending index order, computed on a scratch clone. The inverse reverses and re-inserts in ascending order.
- **Lock order.** It is unchanged. The new commands take only the state lock, through `commit`.
- **Saves.** These go through the existing debounce and `flush`, and so through `Taxonomy::save` with `taxonomy.bak.json`.
- **Cost.** `Plan` clones `LibraryData` and `Taxonomy` once per multi-part command, under the state lock. That is O(library), and fine for 2,500 references.

## Concerns
1. **File growth (the reason for DONE_WITH_CONCERNS).** I did not split any file.
   - `edit.rs` grew from 1029 to 1559 lines. The code is at lines 1-814; the rest is tests.
   - `commands.rs` grew from 2406 to 4042 lines. About 735 lines are new non-test code: the test module moved from line 1067 to line 1803. The rest are tests.
   - Splitting the taxonomy commands into their own module (`taxonomy_cmds.rs`, say) is a candidate.
2. **`rekey_branch` signature.** It differs from the brief's `fn rekey_branch(data, tax, from, to_op, to_domain) -> Vec<Edit>`. It is `rekey_branch(&mut Plan, …) -> Result<(), String>`.
   - A per-call `Vec<Edit>` cannot meet the batch-order rule when it is called in a loop, because its removals would interleave with the next call's additions.
   - For a single call, the order is exactly the brief's steps 1-5.
3. **`multi_branch_batch_indices`.** The brief says "3 branches and 7 links". The seed's `group` has 3 branches and 9 links: eight adjacent ones at 18-25, and one at 51. The test uses `group` and asserts (3, 9), so its expectations are computed from the seed.
4. **Stale tags can block a move.** A tag whose technique is not actually linked to its own branch is a hand-edited or dangling tag. During a re-key, `validate_tag` refuses it, and the whole move fails with that error. I left this as is. Plan 6's integrity check is where such tags get reported.
5. **`Partial` keeps `suggested` unchanged.** The brief sets `suggested: false` only for `TagMove::Technique`.
6. **TDD order at the command level.** I wrote the command tests after the implementation, so there is no stub RED run for them. Mutations M1-M5 show the tests have teeth.
7. **Unlisted behaviours Task 10 will meet:**
   - stored names and plain labels are whitespace-collapsed;
   - descriptions are trimmed, and synonyms are trimmed with empty ones dropped;
   - a `moveTo` on an unused item is ignored, and is not validated;
   - an explicit `color` that another operation already uses is accepted;
   - `add_branch`, `link_technique` and `add_domain(…, op)` with an unknown id return an `invalid tag: …` string from `EditError`.
8. **New-link metadata.** `link_technique` uses `source: "drafted"` and `rationale: "Linked by the artist in the tree."`. A re-key copies the source link's `source` and `rationale`.

---

## Fix round 1 (review task-9-review.md; controller ruling: I1 option (a), plus two undo tests)

Commit: `5e0d301 fix(core): a re-key turns dangling tags partial instead of refusing the move`

### Changes
- **I1. `rekey_branch` (commands.rs).**
  - Each tag on `from` is re-keyed as before.
  - If the re-keyed tag fails `edit::validate_tag` on the scratch taxonomy, it becomes a partial tag under `to_op` instead, keeping its region. Such a tag names a removed technique, or a technique not linked on its branch (the dangling ids of R16).
  - If even the partial form fails, the region is dropped as well. Only an out-of-bounds region does that.
  - Each stale tag counts once in `Plan.made_partial`.
  - It is a `ReplaceTag` in the same `Batch`, so undo restores the tag's exact `before`, in position.
  - The move never refuses because of stale tags.
- **The count is reported in a new field, `Change.made_partial: usize`** (camelCase `madePartial`, always serialised).
  - It is documented on the struct.
  - It is 0 for every command except `delete_operation(…, Operation)` and `delete_domain(…, Domain)`.
  - Undo and redo report 0.
- **Plumbing.**
  - `commit` is now a thin wrapper over `commit_counted`, whose `build` also returns the count. `delete_domain` and `delete_operation` use `commit_counted`.
  - The count is set on the `Change` before `hooks::after_change` runs, so the hooks see it too.
  - No other command changed.
- **`api.ts`:** `Change.madePartial?: number`, documented. I made it optional so the existing typed fakes, which build `Change` literals, still compile.
- **New tests:**
  - `rekey_turns_stale_tags_partial`. The library has one live tag (`t1`) and two dangling ones on `group.feature`: `s1`, whose technique "ghost" is missing, with a region; and `s2`, whose leading-lines is not linked there.
    - `delete_operation("group", Operation{differentiate})` succeeds with `made_partial == 2`, and the JSON carries `madePartial: 2`.
    - `s1` becomes a partial tag under differentiate and keeps its region. `s2` becomes partial under differentiate.
    - `t1` moves to `differentiate.feature`.
    - `undo` gives a value-equal snapshot, so the stale tags are back exactly and in position. Undo reports `made_partial` 0.
    - Then `delete_domain("feature", Domain{grouping})` takes the same path, with count 2. `undo` again gives a value-equal snapshot.
  - `delete_to_partial` (extended, Review Focus 4). After the delete with `TagMove::Partial`, one `undo` restores the technique, its link and both tags in position: the snapshot is value-equal, and `can_undo` is false, so it was one step.
  - `unlink_with_move_undo_restores` (new, Review Focus 4). The unlink of (chiaroscuro, `sequence.feature`) moves `t5` to (size-hierarchy, `sequence.feature`). One `undo` restores the link at its index and the tag in position (value-equal snapshot, one step).

### Commands and output
- **RED by mutation.** I disabled the partial fallback (`if false`) and ran `cargo test --lib rekey_turns`:
  ```
  test commands::tests::rekey_turns_stale_tags_partial ... FAILED
  called `Result::unwrap()` on an `Err` value: "invalid tag: s1: the branch does not hold the technique under this operation"
  test result: FAILED. 0 passed; 1 failed; ... 206 filtered out
  ```
  The file was restored, and `cmp` confirmed it (RESTORED).
- **GREEN.**
  - `cargo test`: `test result: ok. 207 passed; 0 failed` (205 + 2 new), plus 1 doctest.
  - `cargo clippy --all-targets -- -D warnings`: clean.
  - `cargo fmt --check`: FMT_OK.
  - `npx tsc --noEmit`: TSC_OK.
  - `npm test`: 28 files, 286 tests passed.

### Still deferred
The 7 minors (M1 is addressed by the two undo tests above), as ruled.
