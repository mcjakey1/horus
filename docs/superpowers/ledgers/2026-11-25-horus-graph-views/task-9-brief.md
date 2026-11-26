### Task 9: Taxonomy edits (Rust)

**Files:**
- Modify:
  - `app/src-tauri/src/edit.rs` (Plan 2): the new variants, `touches_taxonomy`;
  - `app/src-tauri/src/taxonomy.rs`: `name_key` becomes `pub(crate)` (R15);
  - `app/src-tauri/src/commands.rs`: the commands, the `validate()` step in `commit` (R13), `is_noop` (R14), the `Change.created` doc (C23);
  - `app/src-tauri/src/saver.rs`: reword the `flush` comment at `saver.rs:78-81` (R16);
  - `app/src-tauri/src/lib.rs`: register the commands;
  - `app/src/api.ts`;
  - `app/src/api.contract.test.ts`: one row per new command (B3);
  - `app/src/firstrun.test.ts` and `app/src/reference/view.test.ts`: a `vi.fn()` per new `Api` member in each typed fake (B3).

**Interfaces:**
- Consumes Plan 2's `Edit`, `apply`, `apply_inverse`, `Applied`, `Touched`, `Sealed`, `EditError::InUse`, `validate_tag`, `History`, `Taxonomy::save`, `validate()`, `custom_technique`'s slug rule, `double_option` (`commands.rs:179`), and the `commit(app, build)` recipe (`commands.rs:524-547`).
- **Extends `Edit` (ruling B5; Plan 2 Task 1 ruling).** Each collection follows `AddTechnique`/`RemoveTechnique`/`InsertTechnique`: the appending `Add*` (or `LinkTechnique`) validates and is applied as an insert at the end; its inverse is the matching `Remove*` (or `UnlinkTechnique`) at that index; the inverse of a `Remove*` is a **sealed** `Insert*` that restores the item at its original position and checks positions only (as `InsertTechnique` does, `edit.rs:369-392`). Commands build only the `Add*`, `Remove*`, `Update*`, `LinkTechnique` and `UnlinkTechnique` variants. History keeps undoing and redoing through `apply_inverse`.
  ```rust
  UpdateTechnique { before: Technique, after: Technique },     // same id; rename / define / synonyms; inverse swaps
  UpdateDomain    { before: Domain,    after: Domain },        // same id; name / description / icon; inverse swaps
  UpdateOperation { before: Operation, after: Operation },     // same id; name / plain_label / description / color; inverse swaps
  AddOperation    { op: Operation },                           // inverse: RemoveOperation at the appended index
  RemoveOperation { index: usize, op: Operation },             // InUse while any branch or tag uses it; inverse: InsertOperation
  InsertOperation { index: usize, op: Operation, sealed: Sealed },
  AddDomain       { domain: Domain },                          // inverse: RemoveDomain
  RemoveDomain    { index: usize, domain: Domain },            // InUse while any branch uses it; inverse: InsertDomain
  InsertDomain    { index: usize, domain: Domain, sealed: Sealed },
  LinkTechnique   { link: BranchTechnique },                   // inverse: UnlinkTechnique at the appended index
  UnlinkTechnique { index: usize, link: BranchTechnique },     // inverse: InsertLink
  InsertLink      { index: usize, link: BranchTechnique, sealed: Sealed },
  AddBranch       { branch: Branch },                          // inverse: RemoveBranch
  RemoveBranch    { index: usize, branch: Branch },            // InUse if any link or tag uses it; inverse: InsertBranch
  InsertBranch    { index: usize, branch: Branch, sealed: Sealed },
  ```
- **`touches_taxonomy` (R14)** lists every new variant, `Insert*` included, so the single `TaxonomyReadOnly` check in `commit` covers them all. **`is_noop` (R14)** gains `Update* { before, after } => before == after`, so a no-op rename records no undo step.
- **`commit` gains one post-apply check (R13),** with a carve-out for libraries that already open with `validate()` problems (shown only as warnings; test `open_reports_taxonomy_problems_without_failing`, `commands.rs:1263`). When `edit.touches_taxonomy()`:
  1. before `apply`, record `before = o.tax.validate()` errors (an empty list on `Ok`);
  2. after `apply`, compute the errors that are **new** (in the result, not in `before`);
  3. on any, `edit::apply_inverse(&mut o.lib.data, &mut o.tax, applied.inverse)`, record nothing, and return the new errors joined with "; ".

  This applies to every taxonomy edit, today's `add_technique` included. `validate_seed` stays seed-only. `validate()` (`taxonomy.rs:372`) checks only duplicate ids, branch pairs and links, unresolved ids, and techniques with no link, and it runs once on the final state of a `Batch`. An operation with no branches, a domain with no branch and a branch with no techniques all pass, so `add_operation`, `add_domain(…, None)` and `add_branch` are not refused.
- **Adds these commands.** Each goes through `commit`, returns Plan 2's `Change`, and is one undo step:
  ```
  update_technique(id, patch: TechniquePatch) -> Change
  update_domain(id, patch: DomainPatch) -> Change
  add_domain(name, description, icon: Option<String>, operation_id: Option<String>) -> Change
      // Change.created = new id; with operation_id: one Batch([AddDomain, AddBranch]) = one undo step
  delete_domain(id, move_to: Option<DomainMove>) -> Change          // Err("NeedsMove") if any branch uses it and None
  add_operation(name, plain_label, description, color: Option<String>) -> Change   // Change.created = new id
  update_operation(id, patch: OperationPatch) -> Change
  delete_operation(id, move_to: Option<OpMove>) -> Change           // Err("NeedsMove") if in use and None
  link_technique(technique_id, branch_id) -> Change                  // drag to link (S3: "re-link" read as "link again")
  unlink_technique(technique_id, branch_id, move_to: Option<TagMove>) -> Change   // R20: Err("NeedsMove") if tags use the pair and None
  delete_technique(id, move_to: Option<TagMove>) -> Change          // Err("NeedsMove") if in use and None
  add_branch(operation_id, domain_id) -> Change                      // "+" on the domain band
  ```
  ```rust
  // C7: the patches, Rust side. Absent key = keep.
  #[derive(Deserialize, Default)] #[serde(rename_all = "camelCase")]
  pub struct TechniquePatch { name: Option<String>, description: Option<String>, synonyms: Option<Vec<String>> }
  #[derive(Deserialize, Default)] #[serde(rename_all = "camelCase")]
  pub struct DomainPatch { name: Option<String>, description: Option<String>, icon: Option<String> }
  #[derive(Deserialize, Default)] #[serde(rename_all = "camelCase")]
  pub struct OperationPatch { name: Option<String>, plain_label: Option<String>, description: Option<String>,
    #[serde(default, deserialize_with = "double_option")] color: Option<Option<String>> }
      // color: key absent = keep; null = reset to None (seed default ink or neutral); "rose" = set

  #[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
  pub enum TagMove { Technique { technique_id: String, branch_id: String }, Partial }
  #[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
  pub enum OpMove { Operation { operation_id: String }, Delete }
  #[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
  pub enum DomainMove { Domain { domain_id: String }, Delete }
  pub const MAX_OPS: usize = 9;
  pub const EXTRA_INKS: [&str; 5] = ["teal", "olive", "rose", "indigo", "umber"];   // values in Task 10 / DESIGN.md
  pub const DOMAIN_ICONS: [&str; 8];   // C8: the six seed domains[].icon strings verbatim, then "a plain square", "a dot inside a ring"
  ```
- **Icons (C8).** New operations and new domains get `icon: "a plain square"` (`Operation.icon` is required, so `add_operation` sets it).
- **`api.ts` mirrors these** as `TagMove`, `OpMove` and `DomainMove` (tagged by `kind`), the three patch types, and a wrapper for every command above. Each gets an `api.contract.test.ts` row with its camelCase keys (`techniqueId`, `branchId`, `moveTo`, `operationId`, `domainId`, `plainLabel`) and a `vi.fn()` in both typed fakes.
- **`Change.created` (C23):** reword its doc (`commands.rs:116-117`) to "the new item's id (technique, operation or domain)".
- **Error names (C22).** `NeedsMove`, `LastLink`, `LastOperation`, `TooManyOperations`, `UnknownInk`, `UnknownIcon`, `NameTaken:<id>` and `LabelTaken:<id>` are plain strings returned by the `build` closure. They are not `EditError` variants. `EditError::InUse` and `DuplicateId` stay at the `edit::apply` level.
- **One re-key helper** backs every operation or domain move:

  `fn rekey_branch(data, tax, from: &str, to_op: &str, to_domain: &str) -> Vec<Edit>`

  - **The target is found by `(operation_id, domain_id)` (C16),** as `custom_technique` does (`taxonomy.rs:326-330`). Only when no branch has that pair is a new one minted, with id `<to_op>.<to_domain>`.
  - It builds these edits, in order:
    1. `AddBranch(to)` if the target branch is missing;
    2. `LinkTechnique` for each of `from`'s links that `to` lacks;
    3. a `ReplaceTag` for every tag on `from`, with `branch_id = to` and `operation_id = to_op`;
    4. `UnlinkTechnique` for `from`'s links, in descending index order;
    5. `RemoveBranch(from)`.
- **`delete_operation(id, Operation { target })`** builds one `Batch`:
  - `rekey_branch` for each of its branches onto `(target, same domain)`;
  - a `ReplaceTag` that moves each of its partial tags to `target`;
  - `RemoveOperation`.
- **`delete_operation(id, Delete)`** builds one `Batch`:
  - `RemoveTags` for every tag whose `operation_id` is `id`, including partial tags;
  - `UnlinkTechnique` for the links on its branches whose technique has a link elsewhere;
  - `RemoveTechnique` for each technique whose only links are under this operation (it removes those links itself, C15);
  - `RemoveBranch` for its branches;
  - `RemoveOperation`.

  The confirmation dialog states every count first.
- **`delete_domain(id, Domain { target })`** re-keys each `<op>.<id>` branch onto `(<op>, target)` (C6), then runs `RemoveDomain`.
- **`delete_domain(id, Delete)`:**
  - the tags on its branches become partial, keeping their operation and region (C9);
  - links on its branches whose technique has a link elsewhere are unlinked; techniques whose only links are on its branches are removed with `RemoveTechnique`; its branches are removed;
  - then `RemoveDomain` runs.
- **Batch order for every multi-item delete or move** (`rekey_branch` called in a loop, `delete_operation`, `delete_domain`, `delete_technique`, `unlink_technique`):
  - All additions and `ReplaceTag`s come first.
  - Then every removal is emitted in **descending index order, grouped by collection**: `UnlinkTechnique` (over `branch_techniques`), then `RemoveTechnique`, `RemoveBranch`, `RemoveDomain` and `RemoveOperation`.
  - The builder computes those indices against the taxonomy as it stands at each step. It does so by building the `Batch` against a scratch clone, so each recorded index matches the live state at its step. The reversed inverse (sealed `Insert*`) then re-inserts in ascending order.
  - Test: `multi_branch_batch_indices`.
- **New ids** come from the slugified name, with `-2`, `-3` and so on when taken (the same rule as Plan 2 `custom_technique`).
- **`add_operation`'s default `color`** is the first entry in `EXTRA_INKS` that no operation uses, or `None` (neutral) when all five are taken.
- **`delete_technique` and `unlink_technique`** each build one `Batch`, in this order:
  1. a `ReplaceTag` for every affected tag:
     - with `TagMove::Technique`, the tag takes the target `technique_id` and `branch_id`, **and the target branch's `operation_id`**, with `suggested: false`. One target can then serve a technique used under several operations; undo restores each tag's full `before`, original operation included;
     - with `Partial`, the tag keeps its own operation and its `region` (the area still "stands out"; `validate_tag` allows a partial tag with a region, `edit.rs:144-145`), and drops `technique_id` and `branch_id` (C9);
  2. for an **unlink**, the one `UnlinkTechnique`;
  3. for a **delete**, one `RemoveTechnique { links: all its current links }`, which removes and checks the links itself (`edit.rs:410-433`; C15). `UnlinkTechnique` is used only by unlink and re-key.

  A tag counts as affected when it uses the technique (for a delete) or the pair (technique, branch) (for an unlink). With no affected tag, `move_to` may be `None` (R20). Undo restores all of it (Review Focus 4).
- **Validation:**
  - **Names (R15; ruling B6).** `name_key` (`taxonomy.rs:117`) becomes `pub(crate)`. Every uniqueness check compares `name_key` values, which ignore case and collapse spacing only, and **excludes the id being edited**, so renaming "Chiaroscuro" to "chiaroscuro" is allowed. It covers technique names, operation names and plain labels, and domain names. Names must be non-empty. Errors: `"NameTaken:<id>"`, `"LabelTaken:<id>"`.
  - A technique must keep at least one link. Unlinking the last link returns `Err("LastLink")`; delete the technique instead.
  - A `TagMove::Technique` target must be a linked (technique, branch) pair other than the one being removed; each re-pointed tag passes `edit::validate_tag`.
  - `RemoveBranch` is used by `rekey_branch` and the deletes. There is no separate "delete branch" command: a branch disappears when its operation or domain does, or is emptied by a move.
  - **Operations:**
    - at least one must remain (`Err("LastOperation")`);
    - at most `MAX_OPS` (`Err("TooManyOperations")`);
    - `color` must be `None` or one of `EXTRA_INKS` (`Err("UnknownInk")`). A seed operation may keep `None`, because `opInk` maps it by id.
  - **Domains:** `icon` must be one of `DOMAIN_ICONS` (`Err("UnknownIcon")`).
  - **A move target** must differ from the item being deleted.
  - **Read-only taxonomy.** When `load_with_fallback` returned `TaxSource::SeedReadOnly`, `commit`'s single check refuses any edit whose `touches_taxonomy()` is true, with `Err("TaxonomyReadOnly")`. Every Task 9 command goes through `commit`, so it adds **no check of its own**. Note that `commit` runs `build` first (`commands.rs:531-536`), so a command whose `build` fails (`NeedsMove`, say) returns that error first (R17).
- **Removals and the save order (R16; Plan 2 final review M1).** `saver::flush` writes `taxonomy.json` first, which is safe only for additions. After a delete or re-key, a failed `library.json` save (or "Quit without saving") leaves tags on disk naming a removed technique or branch, and no write order is safe for a mixed batch. **Plan 3 accepts dangling ids explicitly:** the UI already degrades (`techName` falls back to the id, `view.ts:53`; `opInk` is neutral), and SPEC §9's "nothing is lost" holds, because the ids are kept. Reword the `saver.rs:78-81` comment to say so. Reporting dangling tag ids goes to Plan 6's integrity check (Cross-plan impact row 12).
- **Plan 1 Task 3 deferred minor:** add the table-driven `validate()` mutation tests here, because this is the first plan to change taxonomy structure.

- [ ] **Step 1: Write the failing tests**, in `edit.rs` and `commands.rs`, on the seed taxonomy plus a 3-reference library:
  - `update_technique_inverse_restores`: renaming *Chiaroscuro* to "Light and shadow" and then applying the inverse restores the name; the id never changes.
  - `rename_collision` (ruling B6): renaming a technique to `"POP-OUT "` returns `NameTaken:pop-out`. Renaming it to `"Pop out"` is accepted, because names match on case and spacing only.
  - `rename_to_own_name_case`: renaming *Chiaroscuro* to "chiaroscuro" succeeds (R15).
  - `noop_rename_records_nothing`: `update_technique` with the current name returns a `Change` and leaves `can_undo` as it was (R14).
  - `delete_moves_tags_and_undo_restores`: with two references tagged *Rim light* (one with a region), `delete_technique("rim-light", Technique { silhouette, differentiate.feature })` re-points both tags, keeping their regions. Then `undo()` restores the technique, all its links and both tags at their original indices.
  - `delete_to_partial`: `TagMove::Partial` leaves the tags with `operation_id` and any `region` only.
  - `unlink_last_link_refused`: returns `Err("LastLink")`, and the history is unchanged.
  - `unlink_unused_pair_needs_no_move`: `unlink_technique(t, b, None)` on a pair no tag uses succeeds; on a used pair it returns `Err("NeedsMove")` (R20).
  - `move_repoints_operation`: deleting a technique used under `differentiate` and `sequence`, moving its tags to (`leading-lines`, `sequence.space`), leaves every moved tag with `operation_id: "sequence"`. `undo()` restores each original `operation_id`.
  - `unlink_many_descending`: unlinking a technique from two branches in one batch removes exactly those two links, and the inverse restores the original `branchTechniques` order.
  - `delete_unused_needs_no_move`: `delete_technique(id, None)` on an unused custom technique succeeds; on a used one it returns `Err("NeedsMove")` and changes nothing.
  - `tag_move_json_camel`: `TagMove::Technique` serialises as `{"kind":"technique","techniqueId":…,"branchId":…}`.
  - `add_branch_then_link`: `add_branch("group", "semantic")` followed by `link_technique("semantic-compounding", "group.semantic")` validates. Two `undo` calls restore the seed exactly, value-equal through `serde_json::Value`.
  - `remove_branch_in_use`: `edit::apply` of a `RemoveBranch` whose branch a link uses returns `EditError::InUse` (C22).
  - `validate_rejects_mutations`: a table of single mutations to the seed, each rejected with a named error:
    - a dangling `techniqueId` in `branchTechniques`;
    - a branch with an unknown `operationId`;
    - a duplicate technique id;
    - a technique with no link;
    - a duplicate link.
  - `commit_reverts_new_validate_errors` (R13): a hand-built bad batch passed to `commit`, as `damaged_taxonomy_opens` does (`commands.rs:2225`), returns the new `validate()` errors and leaves the taxonomy and the history unchanged.
  - `commit_tolerates_existing_problems` (R13): on a library that opens with a duplicate operation id (as in `open_reports_taxonomy_problems_without_failing`), `update_technique` still succeeds.
  - `touches_taxonomy_covers_new_variants` (R14): every new variant, `Insert*` included, returns `true`.
  - `add_operation_defaults_ink`: the first `add_operation` gets `color: "teal"` and `icon: "a plain square"`, and the second gets `"olive"`. `undo` removes it. A tenth operation returns `TooManyOperations`.
  - `rename_operation_label` (C5): `update_operation("differentiate", { plainLabel: "Pop" })` changes the label. A duplicate label returns `LabelTaken`. `search(tax, data, "pop")` now matches `chiaroscuro`, a Differentiate technique without "pop" in its name, which shows that search reads labels from the taxonomy.
  - `delete_operation_moves_branches`: deleting `group` with `Operation { "differentiate" }` re-keys every `group.*` branch onto the `differentiate` branch with the same domain, merging into existing branches without duplicate links. All `group` tags, partial ones included, now carry `differentiate`. One `undo` restores the taxonomy and data, value-equal.
  - `delete_operation_delete`: `OpMove::Delete` removes the operation's tags and branches, plus techniques that no longer have any link. `undo` restores everything.
  - `last_operation_refused`: deleting the only remaining operation returns `LastOperation`.
  - `delete_domain_moves_or_partials`: deleting `social` with `Domain { "semantic" }` re-keys `*.social` to `*.semantic`. With `Delete`, its tags become partial and keep their operation and region. Each case is one undo step.
  - `add_domain_then_branch`: `add_domain("Rhythm", "…", None, None)` gets `icon: "a plain square"`. Then `add_branch("sequence", "rhythm")` and a `link_technique` both validate.
  - `add_domain_with_op_is_one_step`: `add_domain("Rhythm", "…", None, Some("sequence"))` creates the domain and `sequence.rhythm`. One `undo` removes both.
  - `multi_branch_batch_indices`: deleting an operation with 3 branches and 7 links, some of them adjacent in `branchTechniques`, removes exactly those items. The inverse restores `branches`, `branchTechniques` and `techniques` in their original order, value-equal.
  - `reink_seed_operation`: `update_operation("differentiate", { color: Some("rose") })` stores `"rose"`, and `{ color: None }` (explicit) clears it. Omitting `color` leaves it unchanged.
  - `read_only_taxonomy_refuses_edits` (R17): extend the existing `damaged_taxonomy_opens` (`commands.rs:2225`) rather than building a second damaged library. With valid arguments, each of `update_technique`, `add_operation` and `delete_domain(id, Some(DomainMove::Delete))` returns `Err("TaxonomyReadOnly")`. `undo()` reports `can_undo: false`, and `taxonomy.json` is byte-identical afterwards.
  - `dangling_tag_ids_open_and_render` (R16): a library whose `library.json` has tags naming a technique and a branch missing from `taxonomy.json` opens without error through `open_library`, and the returned `LibraryView` keeps those tags unchanged.
  - `op_move_json_camel`: `OpMove::Operation` serialises as `{"kind":"operation","operationId":…}`.
  - `extra_inks_match_ts` (C12): a test reads `include_str!("../../src/ops.ts")` and asserts the five `EXTRA_INKS` names appear in order.

- [ ] **Step 2: Run, then implement, then run again**

  Run `cargo test` (all; cargo takes one name filter only, R18). It should FAIL, then PASS. Then run `cargo clippy --all-targets -- -D warnings`, `cargo fmt --check`, `npm test` and `npm run build`.

- [ ] **Step 3: Commit**

  Commit message: `feat(core): undoable taxonomy, operation and domain edits with moves`.

---

