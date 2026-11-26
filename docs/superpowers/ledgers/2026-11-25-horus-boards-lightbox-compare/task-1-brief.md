### Task 1: Link and board edits

**Files:**
- Modify:
  - `app/src-tauri/src/edit.rs` (Plan 2 Task 1);
  - `app/src-tauri/src/commands.rs`: the `Change` struct, `change()`, `settle()` and `is_noop()`, plus the `Touched { … }` literal in `commands::tests` (`:2780` before T0) [B2, C15];
  - `app/src-tauri/src/saver.rs`: read only, to confirm that `dirty_library` drives the deadline and the flush (`saver.rs:35-49`, `:92`, `:100`). No change is expected.

**Interfaces:**
- Consumes `edit::{Edit, apply, Applied, Touched, EditError, new_id}` (Plan 2 Task 1).
- Produces these new `Edit` variants:
  ```rust
  AddLink { link: Link },
  RemoveLink { index: usize, link: Link },
  ReplaceLink { before: Link, after: Link },            // same id; only `why` may differ
  InsertRefLink { index: usize, link: Link, sealed: Sealed },   // RemoveLink's inverse: restores the position
  AddBoard { board: Board },
  RemoveBoard { index: usize, board: Board },
  ReplaceBoard { before: Board, after: Board },         // same id; rename and/or new reference_ids order
  InsertBoard { index: usize, board: Board, sealed: Sealed },   // RemoveBoard's inverse
  ```
  - The inverses follow the existing sealed `Insert*` pattern (`edit.rs:106-147`). The name `InsertLink` is already taken by `BranchTechnique` (`edit.rs:138`), so the reference-link inverse is `InsertRefLink` [R1].
  - None of the new variants `touches_taxonomy`.
- It also adds these `EditError` variants. Their `Display` is a wire code [R2]:

  | Variant | Display |
  |---|---|
  | `SelfLink` | `SelfLink` |
  | `DuplicateLink(String /* existing id */)` | `DuplicateLink:{id}` |
  | `EmptyWhy` | `EmptyWhy` |
  | `EmptyName` | `EmptyName` |
  | `BoardNameTaken(String /* existing board's id */)` | `BoardNameTaken:{id}` (matches `NameTaken:<id>`) |
  | `UnknownLink(String)` | `UnknownLink:{id}` |
  | `UnknownBoard(String)` | `UnknownBoard:{id}` |

- `Touched` gains `links: bool` and `boards: bool`. `merge()` (`edit.rs:801`) ORs them [R1].
- `Change` (Plan 2 Task 5) gains `links: Option<Vec<Link>>` and `boards: Option<Vec<Board>>`, each the full list and set only when touched. Both lists stay small, so the full list is cheaper to reason about than a delta.
- **Saving** [B2]:
  - `settle()` (`commands.rs:608-611`) sets the library dirty when `touched.ref_ids` or `removed_ref_ids` is non-empty, **or `touched.links` or `touched.boards` is set**. Without this, the debounce sets no deadline and `flush` skips `library.json`.
  - `is_noop()` (`commands.rs:616-628`) also treats `ReplaceLink` and `ReplaceBoard` with `before == after` as no-ops [R1].
- Validation rules:
  - A link needs `from_ref != to_ref`, and both references must exist.
  - `why.trim()` must not be empty; it is stored trimmed.
  - Only one link may exist per unordered pair. A second gives `DuplicateLink`, so the artist edits the existing link instead.
  - A board name is trimmed, non-empty and unique without regard to case.
  - A board's `reference_ids` must exist and be unique; order is kept.
- A new guard on `RemoveReferences`: it fails with `InUse` while a link or a board touches one of the references. Linear history makes this unreachable, and so does undo, which runs `check: false` (`edit.rs:284`). The guard only keeps a bug in `apply` from leaving dangling links [C31].

- [ ] **Step 1: Write the failing tests** in `edit::tests`:
  - `link_add_inverse_restores` and `board_add_inverse_restores`: applying the edit and then its inverse gives `data` equal to the snapshot, with `touched.links` (or `boards`) set.
  - `remove_link_inverse_restores_position` and `remove_board_inverse_restores_position`: removing the middle of three, then the inverse, gives back the original order.
  - `self_link_refused`, `empty_why_refused` (a `why` of `"   "`) and `link_unknown_ref_refused`.
  - `duplicate_pair_refused_either_direction` (Decision 2): with A→B present, both A→B and B→A return `DuplicateLink(<id of A→B>)`. After `RemoveLink` of A→B, B→A is accepted. A `Batch` that adds A→B and B→A together fails, and rolls back to no links.
  - `replace_link_changes_why_only`: changing `to_ref` in `after` returns `Err`.
  - `board_name_unique_case_insensitive`: with "Harbour" present, " harbour " returns `BoardNameTaken(<Harbour's id>)`.
  - `board_members_must_exist_and_be_unique`.
  - `unknown_board_refused`: `ReplaceBoard` or `RemoveBoard` for a missing id returns `UnknownBoard(id)`.
  - `board_reorder_is_one_edit`: a `ReplaceBoard` that reverses `[a, b, c]` and then its inverse gives back `[a, b, c]`.
  - `remove_refs_in_use_guarded`: through `apply` with `check: true`, a reference that is on a board can't be removed by `RemoveReferences`.
  - `wire_codes`: the `Display` of each new variant equals the table above.
  - `merge_ors_links_and_boards`.
- And in `commands::tests` [B2]. There is no link command until Task 3, so these tests call the private recipe directly, `commit(e.handle(), |_| Ok((Edit::AddLink { link }, None)))`:
  - `link_edit_marks_library_dirty`: after the edit, `debounce` has a deadline.
  - `link_edit_survives_flush`: after the edit, `saver::flush` (the close path) leaves the link in `library.json` when it is re-read.
  - `noop_replace_link_is_noop`: a `ReplaceLink` with `before == after` makes no history step.

- [ ] **Step 2: Run, then implement, then run again.** Run `cargo test edit::` and `cargo test commands::`. They should FAIL, then PASS, and every Plan 2 and Plan 3 test must still pass.

- [ ] **Step 3: Commit.** Commit message: `feat(core): invertible link and board edits that save`.

---

