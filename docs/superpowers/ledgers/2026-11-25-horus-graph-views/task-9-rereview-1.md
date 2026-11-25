# Task 9 re-review 1: fix round de4545e..5e0d301

Scope: the fix diff `review-de4545e..5e0d301.diff` (commit `5e0d301`, commands.rs and api.ts), checked against the worktree source for context. This review is read-only. I did not re-run the suites, so the report's results (`cargo test` 207 passed, clippy, fmt, tsc, `npm test` 286 passed, and the RED-by-mutation run) are unverified.

## Verdicts

### I1 (Important): ADDRESSED
- **The move no longer refuses on stale tags.** In `rekey_branch`, each tag on `from` is re-keyed first. If the re-keyed form fails `edit::validate_tag` on the scratch taxonomy, the tag becomes a partial tag under `to_op` (`technique_id` and `branch_id` cleared). If that still fails, the region is dropped too. Because `to_op` is always a known operation (`BadMoveTarget` guards it), the only remaining failure is the region check, so the partial form always validates and `p.replace` cannot refuse.
- **Same undo step.** The change is a `ReplaceTag` in the same `Plan` batch. `ReplaceTag` replaces at `position(|t| t == &before)` (edit.rs:359-368), so its inverse puts `before` back at the same index.
- **Count reported.** `Change.made_partial: usize` (serialised as `madePartial`, always sent) comes through `commit_counted`. It is set before `hooks::after_change`. `delete_operation(…, Operation)` and `delete_domain(…, Domain)` use it. Every other path, including undo and redo through `step` → `settle` → `change()`, reports 0.
- **Mirrored in api.ts.** `madePartial?: number`, documented.
- **Tests.** `rekey_turns_stale_tags_partial` covers both moves, the count (and its JSON key), region kept for `s1`, the live tag `t1` still re-pointed, and undo to a value-equal snapshot.
- **The verdict covers the `rekey_branch` path.**
  - The ruling's wording is "the move never refuses over stale tags". One stale-tag family still refuses `delete_operation(…, Operation)`: tags whose branch no longer exists (O3).
  - That family is pre-existing, not introduced by the diff. It is not in I1 as written, which names `rekey_branch` and `move_tags`.
  - The new test has no missing-branch case.
  - The doc comments say "technique or branch was already missing", which over-claims a little.
- **`commands.rs:1042` (`move_tags`)** is unchanged. That is consistent with the review's own option (a), which targets `rekey_branch`: a `TagMove::Technique` target always yields a valid tag, and the `Partial` form fails only on an unknown operation or a bad region.

### RF4 (controller ruling): ADDRESSED
- **`delete_to_partial`:**
  - takes `before` before the delete;
  - after a delete with `TagMove::Partial`, one `undo` gives a value-equal `snapshot` (library data and taxonomy, arrays in order);
  - `!c.can_undo` proves it was a single step.

  This restores the technique, its link and both tags in their original positions.
- **`unlink_with_move_undo_restores`:**
  - unlinks (chiaroscuro, `sequence.feature`), with `t5` moved to size-hierarchy;
  - asserts the link is gone and the tag moved;
  - then checks that one `undo` gives a value-equal snapshot in one step.

## Checks

- **Only already-invalid tags become partial: holds.**
  - The test is on the re-keyed form, but a tag that was valid on `from` stays valid on `to`.
    - Its technique was linked on `from`, and `rekey_branch` copies every missing link of `from` onto `to` before it re-points any tag.
    - `to.operation_id == to_op`, and the tag takes `to_op`.
    - The region is unchanged.
  - So a valid tag never takes the partial path.
  - I checked this against `Taxonomy::branches_for` (taxonomy.rs:642): it matches on the operation and on a `(branch, technique)` link. I also checked the link-copy loop at the head of `rekey_branch`.
  - The converse is not exact; see O1.
- **Region kept: holds, with one edge case.** The partial form keeps the region. It drops the region only when the region itself fails the bounds check, and only hand-edited data can produce that. See N1 for what that edge does to the technique.
- **Count exact: holds.**
  - `made_partial` is incremented once per tag, inside the loop over tags on `from`.
  - A tag has one `branch_id`, so it is on one `from` and is visited once.
  - In `delete_operation`, the later loop over partial tags filters on `operation_id == id`, while the converted tags already carry `to_op`. So they are not touched again, and they are not counted twice.
  - A failed build returns `Err` and the count is discarded.
- **Undo value-equal and positional: holds.**
  - The inverse is unchecked (`apply_inverse`), and it is the reversed batch of in-place `ReplaceTag`s.
  - The `snapshot` comparison is on ordered JSON arrays.
  - The test also spot-checks `s1` back on "ghost".
- **`made_partial` versus the existing Change consumers: no breakage.**
  - Rust: every `Change` literal goes through `change()` (`made_partial: 0`) or the struct-update in `commit_counted`, and the compiler enforces that. `Change` is `Serialize` only, so nothing deserialises it.
  - `store.ts` `apply` reads `references`, `removed`, `taxonomy`, `canUndo` and `canRedo`, and passes the rest through `emit`.
  - The `reset` event literal (store.ts:58) omits `madePartial`. That compiles because the field is optional.
  - `api.contract.test.ts` asserts IPC argument keys, not `Change` shape.
  - The typed fakes build `Change` literals without the field, and they still compile for the same reason.

## New findings (introduced by the fix diff)

**Critical:** none. **Important:** none.

**N1 (Minor). A tag whose only defect is its region loses its technique.**
- **Where:** `commands.rs`, in `rekey_branch`'s fallback (`if edit::validate_tag(&p.tax, &after).is_err() { … }`).
- **Problem:**
  - Take a hand-edited tag with a valid technique and branch, but a region outside the image.
  - It fails the first check, so it is counted in `made_partial`, and its technique and branch are cleared.
  - It then fails again on the region, and the region is dropped too.
  - The fallback first clears the technique, which was correct, and only then drops the region, which was the actual defect. Before the fix, the same move was refused, so this behaviour is new.
- **Mitigations:**
  - Undo restores the tag exactly.
  - Only hand-edited data can have an out-of-bounds region, because `validate_tag` guards every insert.
- **Fix (optional):** try `region = None` with the technique and branch kept before falling back to a partial tag. Alternatively, accept it and document it at the fallback.

## Observations (not findings)

- **O1. An invalid tag can become valid instead of partial.** Take a stale tag whose technique is not linked on `from` but is linked on `to`. It re-keys to a valid tag with its technique kept, and it is not counted. That is arguably better than the ruling's literal "already-invalid tags become partial", but it means `made_partial` counts tags that are still invalid after the re-key, not tags that were invalid before it. The struct doc ("could not re-point") describes this correctly.
- **O2. Neighbouring paths that can still refuse (not touched by the fix).** In `delete_operation(…, Operation)`, the loop over partial tags, and `move_tags` with `TagMove::Partial`, still refuse on a tag with an out-of-bounds region. The same holds for a tag with an unknown operation. Only hand-edited data can produce these.
- **O3. Tags whose branch is missing still refuse an operation move. This is pre-existing and R16-reachable.**
  - **How it happens:** an earlier move removes branch `group.X`. `taxonomy.json` saves, but `library.json` does not, so tags keep `operation_id: group` and `branch_id: group.X`, with a technique.
  - **What `delete_operation("group", Operation{…})` does with such a tag:**
    - `rekey_branch` never visits it, because no `from` has that id.
    - The partial-tag loop skips it, because `technique_id` is `Some`.
    - The checked `RemoveOperation` in `Plan::finish` then fails with `InUse("group")` (edit.rs:572-577).
  - **Result:** the move is refused with a raw "in use" error.
  - **Other paths:**
    - `delete_domain`'s `Domain` move does not refuse here: the tag sits on no branch of the domain, and stays dangling.
    - A tag whose `branch_id` sits under another operation behaves the same way, and only hand-edited data produces that.
  - **Fix, if one is wanted:** in the `Operation` arm, make any remaining tag with `operation_id == id` that fails `validate_tag` a partial tag under the target, and count it.
- **O4. `madePartial` is optional in api.ts although Rust always sends it.** The report says this keeps the typed fakes compiling. Task 10 should read it as `c.madePartial ?? 0`.
- **O4b. Redo reports a count of 0.** Redo makes the same tags partial again, but `step` reports `made_partial` 0. If Task 10 shows a "N tags kept as partial" message, it should show it on the command only, not on redo.
- **O5. The deferred Minors.** M2-M7 remain deferred as ruled. M1 is covered by the RF4 tests.
