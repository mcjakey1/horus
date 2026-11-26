# Task 0 review (503f0d0..529043d)

**Verdict: Approved.** A verified pure move. The rename touches only private code, and the new test can fail.

### Spec Compliance
- ✅ **It is a move (985c3ac).** I checked this by text, not by reading.
  - Old `commands.rs:835-1480` is byte-identical to new `taxonomy_edit.rs:4-650`. The only extra is one leading blank line.
  - Old test section `commands.rs:3193-4152` is identical to `taxonomy_edit.rs:656-end`, after one indent level is stripped. The one exception is the `include_str!` line.
  - I also compared the multiset of non-blank lines: old `commands.rs` against new `commands.rs` plus `taxonomy_edit.rs`. The only differences are the ones the implementer listed: the module doc line, `use` lines, the `mod tests {` wrapper, `pub(super)` on test helpers, `taxonomy_edit::delete_technique` in the harness, and the removed divider comments.
- ✅ **Command names and parameters.** All 11 `#[tauri::command]` fns have byte-identical signatures and bodies, so the IPC names and camelCase argument keys are unchanged.
- ✅ **`lib.rs`.** It names all 11 as `commands::taxonomy_edit::<cmd>`, with no glob re-export. No other file uses the old `commands::<moved item>` paths (`git grep` is clean).
- ✅ **Error strings.** No error string changed, because the moved code is identical.
- ✅ **Visibility.** None was widened in non-test code. The only additions are `pub mod taxonomy_edit;`, which `lib.rs` needs to reach the path, and `pub(super)` inside `#[cfg(test)] mod tests`: `Env`, `app`, `lib`, `handle`, `created`, `st`, `saved` and `halo`. That is narrower than the `pub(crate)` the brief allowed.
  - The deviation (parent helpers kept private) is correct. A child module sees its parent's private items through `use super::*`, so `pub(super)` would only widen them.
- ✅ **`include_str!`.** `../../src/ops.ts` from `src/commands.rs` and `../../../src/ops.ts` from `src/commands/taxonomy_edit.rs` both resolve to `app/src/ops.ts`.
- ✅ **TaxPlan rename (2894023).** It changes 12 lines in `taxonomy_edit.rs` only. `TaxPlan` is a private struct and does not appear in any command signature or serialized type. No `Plan` identifier is left in the Rust source.
- ✅ **New test (529043d).** It undoes and then redoes `delete_operation("group" → differentiate)`. `lib3` has tags t4, t6, t7 and t9 on `group`, so the edit moves tags.
  - `snapshot` covers both `lib.data` and `tax`. The test asserts `applied != before`, so a redo that does nothing, or one that restores only data or only the taxonomy, fails the final `assert_eq!`. The test can fail.
  - I ran it alone (`cargo test --lib redo_reapplies_a_second_batch_shape`): 1 passed, 209 filtered. 210 lib tests is consistent with 208 passed plus 2 ignored.
- ✅ **Commit message.** The move commit's message is exactly the one the brief prescribes.
- ✅ **UnknownTag remap.** It is deferred to Plan 6, as ruled. It is not touched.
- ⚠️ **Cannot verify from the diff:** the full-suite counts (207 → 208), clippy, fmt, tsc, vitest 461/461, `api.contract` 37/37 and the build. These are taken from the report; I did not re-run the full suites, as instructed.

### Strengths
- The move, the rename and the test are in separate commits, so the move commit reads as a move.
- The visibility choice is minimal and correct.
- The constants and the patch/move types stay with the Plan 2 code that also uses them, which is the right place for them.

### Issues
#### Critical (Must Fix)
None.
#### Important (Should Fix)
None.
#### Minor (Nice to Have)
None.

### Assessment
**Task quality:** Approved
**Reasoning:** Text comparison shows the moved code and tests are identical apart from the documented path and visibility edits. The IPC surface and error text are unchanged, and the one added test checks a real redo of a tag-moving `delete_operation`.
