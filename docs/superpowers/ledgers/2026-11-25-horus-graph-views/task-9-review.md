# Task 9 review: taxonomy edits (Rust)

Range: dafa418..de4545e (worktree `.worktrees/plan3-graph`). This review is read-only. I did not re-run the suites, so the report's results for `cargo test` (205 passed), clippy, fmt, `npm test` and `npm run build` are ⚠️ unverified.

## Part 1: Spec, ✅ (with accepted deviations)

**Present and matching the brief:**
- **The 15 `Edit` variants** (edit.rs).
  - `Insert*` carries `Sealed`. `Sealed(())` is constructed only in edit.rs. A grep of the non-test part of commands.rs finds no `Sealed`.
  - `Add*` and `LinkTechnique` validate, then delegate to `Insert*` at `len`.
  - `Remove*` and `UnlinkTechnique` check `list[index] == item`, and check `InUse` only when `check` is set.
  - `Update*` keeps the id and swaps `before` and `after`.
  - This satisfies B5.
- **`touches_taxonomy`** lists all 15 variants. **`is_noop`** has the three `Update*` arms (R14).
- **The R13 check in `commit`:**
  - it runs after the `TaxonomyReadOnly` check;
  - it diffs the `validate()` errors before and after;
  - on a new error it calls `apply_inverse`, records nothing and returns the new errors joined with "; ".
  - Problems the library opened with are tolerated (`commit_tolerates_existing_problems`).
- **`commit` order:** `build`, then the read-only check, then apply (R17).
- **The 11 commands** use the brief's names and parameters. Each goes through `commit`, and each builds one `Edit` or one `Batch`, so each is one undo step.
- **`lib.rs`** registers all 11.
- **The types:**
  - the patches, with `color` going through `double_option`;
  - `TagMove`, `OpMove` and `DomainMove`, tagged by `kind`, with `rename_all_fields`;
  - the constants `MAX_OPS = 9`, `EXTRA_INKS` and `DOMAIN_ICONS`. I checked the six seed icons against `resources/taxonomy.json`, and they match verbatim.
- **The `Plan` builder and batch order:**
  - It builds on a scratch clone. Additions and `ReplaceTag`s apply as they are pushed.
  - Removals are emitted by collection (links, techniques, branches, domains, operations), in descending order, with indices read from the live scratch state.
  - `delete_operation` follows the brief for both `Operation` and `Delete`. So does `delete_domain`, for both `Domain` and `Delete`.
  - `delete_technique` and `unlink_technique` follow the brief: ReplaceTags, then `UnlinkTechnique` or one `RemoveTechnique` (C15).
- **Validation:**
  - name and label uniqueness go through `name_key`, excluding the item's own id (B6 and R15);
  - `EmptyName`, `LastLink`, `LastOperation`, `TooManyOperations`, `UnknownInk` and `UnknownIcon`;
  - a move target must differ from the deleted item and must be a linked pair.
- **Other files:**
  - `name_key` is now `pub(crate)`;
  - `free_id` is extracted from `custom_technique` and reused there, so the slug rule has one home;
  - the `saver.rs` comment is reworded (R16);
  - the `Change.created` doc is reworded (C23).
- **B3:** the Api members, 11 `tauriApi` wrappers, 11 contract rows with camelCase keys (`techniqueId`, `branchId`, `moveTo`, `operationId`, `domainId`, `plainLabel`), and 11 `vi.fn()` in each of the two fakes.
- **Tests:** every test the brief names exists. `read_only_taxonomy_refuses_edits` is folded into `damaged_taxonomy_opens`, as the brief asks.

**Deviations I accept (not ❌):**
- **`rekey_branch(&mut Plan, …) -> Result<(), String>`** replaces the brief's `-> Vec<Edit>`.
  - When the helper is called in a loop, a `Vec<Edit>` per call would interleave each call's removals with the next call's additions. That breaks the brief's own batch-order rule.
  - The scratch-clone builder is what the brief asks for anyway.
  - For one call, the step order is the brief's steps 1-5.
- **`multi_branch_batch_indices` uses (3, 9), not (3, 7).** The brief's count is wrong for the seed. The test derives its expectations from the seed and asserts the counts, so it would catch a seed change.
- **`unlink_many_descending` drives `Plan` directly.** No command unlinks two branches at once. It still proves the descending emission and the restored order.

**Extra:**
- **The strings `EmptyName`, `BadMoveTarget` and `unknown <kind>: <id>`.** They are reasonable gaps the brief left, and the first two are documented in `api.ts`. See M2 for the leaked `EditError` text.
- **`Partial` keeps `suggested`.** The brief is silent. Keeping it is the conservative choice.
- **Two extra tests:** `move_target_must_be_another_linked_pair`, and `delete_technique_ipc_keys`, a real IPC round trip.

**Missing:** none.

## Part 2: Quality, Needs fixes (1 Important, 7 Minor)

**What I checked:**
- **Undo and redo round trips.**
  - `apply_inverse` is unchecked: `ReplaceTag` skips `validate_tag`, and `Remove*` skip `InUse`.
  - Value-equal snapshot tests cover every kind after an undo: update, add operation, add domain, add branch and link, delete with a technique move, deletes of operations and domains (both moves), and add domain with an operation. Partial tags are covered through `delete_domain`'s `Delete`.
  - Redo is exercised on one batch only (M5).
- **Batch atomicity.**
  - `Plan` applies every part to the scratch with `check`, so a part that would fail fails in `build`, before the live state is touched.
  - The live `Batch` apply is deterministic on an equal state, and the existing `Batch` arm rolls back on any error.
  - When R13 reverts, it uses the inverse of an edit just applied.
- **Position restoration.** Indices are taken from the scratch at each step, and the reversed inverse re-inserts ascending. `multi_branch_batch_indices` and `unlink_many_descending` assert the restored order of `branches`, `branchTechniques` and `techniques`.
- **`validate()` after commit.** It is correct, and its mutation evidence is M1. The before/after diff is by string, which is fine because the error texts name ids only.
- **Read-only refusal.** It is the single check, before apply. Three commands are tested, and `taxonomy.json` stays byte-identical.
- **No-op handling.** `noop_rename_records_nothing` covers it, with M2 evidence.
- **Lock order.** Unchanged: only the state lock, through `commit`.
- **Saves.** They go through the unchanged saver path.
- **`Change`.** `change()` dedups reference ids with a `HashSet`, so the several `ReplaceTag`s on one reference (r3) return that reference once.
- **Duplicate tags.** A merge can leave one reference with two tags on the same (technique, branch). Nothing in Plan 2 forbids that either (`check_new_tags` checks ids only), so it is not a finding.
- **The tests are real.**
  - They open a three-reference library from disk and compare `serde_json::Value` snapshots.
  - The command tests were written after the code (concern 4). Mutations M1-M5 show they have teeth. I accept that process deviation.

### The caller's concerns
1. **File size (edit.rs 1559 lines, commands.rs 4042).** This is Minor, and not for this task. Splitting the taxonomy commands, `Plan` and its helpers into their own module is a sensible move during the whole-branch review (M7).
2. **`rekey_branch` takes `&mut Plan`.** Accepted: it is needed for the batch-order rule (see Part 1).
3. **The seed has 3 branches and 9 links.** Accepted: the brief's count was wrong, and the test asserts the seed's real count.
4. **Tests written after the code.** Accepted, with the mutation evidence. This is not a code defect.
5. **The new error strings.** `EmptyName` and `BadMoveTarget` are fine. `unknown <kind>: <id>` covers ids the UI never sends. The real gap is the raw `EditError` text that reaches the UI (M2).
6. **A stale tag can block a move.** This is **Important I1**. The three questions have three different answers:
   - **Can undo get stuck? No.** `apply_inverse` runs with `check = false`, so `ReplaceTag` skips `validate_tag` and the `Remove*` variants skip `InUse`. A refused build records nothing.
   - **Can the artist be left unable to delete? No,** for dangling ids that ordinary use produces:
     - `OpMove::Delete` removes tags through the unchecked `RemoveTags`;
     - `DomainMove::Delete` and `TagMove::Partial` fail only when the tag's own operation is unknown;
     - a `TagMove::Technique` target always yields a valid tag.
     - Only a hand-edited tag that is inconsistent twice over (its operation is unknown and its branch is under another operation) could block both choices.
   - **Can the artist be left unable to move? Yes.** R16 says ordinary use produces dangling tags. For example, a delete-with-move is followed by a failed `library.json` save or by "Quit without saving". From then on, one tag whose technique is not linked on its own branch makes `rekey_branch`'s `ReplaceTag` fail. That refuses the whole `OpMove::Operation` or `DomainMove::Domain`.

### Findings

**I1 (Important). Dangling tags refuse a move, and the error is opaque.**
- **Where:** `app/src-tauri/src/commands.rs:953-958` (`rekey_branch` re-points every tag on `from`) and `commands.rs:1042` (`move_tags`). The error comes up through `Plan::push` at about `commands.rs:853`.
- **Problem:**
  - Take a tag that R16 explicitly accepts on disk: its technique was removed, or it is no longer linked on its branch. That tag fails `validate_tag` on its re-keyed form.
  - So "Move N tags to…" for an operation or domain is refused whole.
  - The message is `invalid tag: <tagId>: the branch does not hold the technique under this operation`. It names neither the reference nor a C22 error, so Task 10 can only show raw text. The one choice that works is the destructive "Delete".
  - This is the Plan 2 failure mode of the artist being unable to move, reintroduced by data that R16 says is normal.
- **Fix (pick one):**
  - (a) In `rekey_branch`, find the tags that already fail `validate_tag` before the move. Re-point them as partial tags, keeping their operation (switched to `to_op`) and region, so they still free the branch. Undo restores each tag's `before`.
  - (b) Refuse with a named error, `StaleTags:<refId>,…`, raised before any push, so Task 10 can offer "Open these references".
  - (a) keeps the move usable; (b) is the smaller change. Either way, add a test: a library with one dangling tag on `group.feature`, where `delete_operation("group", Operation{differentiate})` either succeeds and undoes to a value-equal snapshot, or returns the named error with the state unchanged.

**M1 (Minor). The Review Focus 4 undo coverage has gaps.**
- **Where:** `commands.rs:3355` (`delete_to_partial`) and `commands.rs:3383` (`unlink_unused_pair_needs_no_move`, the unlink-with-move part).
- **Problem:** Neither asserts that `undo()` restores the snapshot. Partial plus undo is covered only indirectly, through `delete_domain`'s `Delete`. Unlink-with-move plus undo is not covered at all.
- **Fix:** Add `undo` and `assert_eq!(snapshot(&e), before)` to each.

**M2 (Minor). Raw `EditError` text reaches the UI, and C22 is not followed.**
- **Where:** `commands.rs:1356` (`link_technique`), `commands.rs:1433` (`add_branch`), and `add_domain(…, Some(op))`.
- **Problem:** An existing pair, an existing link or an unknown id returns `duplicate id: group.semantic` or `invalid tag: …: unknown technique or branch`, not a named string.
- **Fix:** Check in `build` and return named strings: `BranchExists`, `AlreadyLinked`, and `unknown <kind>` for ids. Alternatively, list these strings in `api.ts` as the behaviour Task 10 must expect.

**M3 (Minor). Taxonomy items are reported as `UnknownTag`.**
- **Where:** `app/src-tauri/src/edit.rs:718` (`insert`), `edit.rs:732` (`found`), and `update`.
- **Problem:** A wrong index or value for an operation, domain, branch or link reads "unknown tag: pulse". This follows the existing `RemoveTechnique` convention, but it misleads anyone reading a log.
- **Fix:** Leave it for now. Add a note at the helpers, or add one `UnknownItem` variant when edit.rs is next touched.

**M4 (Minor). An unrelated line was reformatted.**
- **Where:** `app/src/api.ts:102`.
- **Problem:** `export type Scored ={` lost its space. The line is not part of the task.
- **Fix:** Restore `Scored = {`.

**M5 (Minor). Redo is exercised once.**
- **Where:** only `delete_moves_tags_and_undo_restores` calls `redo`.
- **Problem:** Redo is generic (`apply_inverse` of the inverse), so the risk is low. Still, the multi-collection batches are never redone.
- **Fix:** In `multi_branch_batch_indices` (`commands.rs:3977`), add `redo` and assert that the post-delete taxonomy matches again.

**M6 (Minor). The name `Plan` is confusing.**
- **Where:** `commands.rs:827` (`struct Plan`).
- **Problem:** "Plan" collides with the project's "Plan 2" and "Plan 3" vocabulary, which appears in the comments around it ("Plan 3 Task 9"). For example, "Plan::finish" can be misread.
- **Fix:** Rename it to `TaxBatch` or `Scratch`.

**M7 (Minor). The files have grown (concern 1).**
- **Where:** `commands.rs` now holds about 735 lines of new non-test code for taxonomy commands.
- **Problem:** The file is getting hard to navigate. It is not wrong.
- **Fix:** Defer a split into `taxonomy_cmds.rs` (holding `Plan`, `rekey_branch`, `drop_branches`, `move_tags` and the 11 commands) to the whole-branch review, or to the start of Task 10.

**YAGNI:** clean. `free_id` removes duplication, and the helpers (`insert`, `found`, `update`, `needs_move`, `unique_name`) each have several callers. `Serialize` on the move enums is used only by tests, which is negligible.
