# Task 1 report: link and board edits

**Status:** DONE. One commit, `490d720` (`feat(core): invertible link and board edits that save`), on `plan4-boards`, on top of `529043d`. Nothing is pushed or merged. I did not touch `export.rs` or the `mod` lines in `lib.rs` (Task 2).

## What changed

### `edit.rs`

- **New `Edit` variants**, named as in the brief:
  - `AddLink`, `RemoveLink`, `ReplaceLink`, `AddBoard`, `RemoveBoard` and `ReplaceBoard`;
  - the sealed inverses `InsertRefLink` and `InsertBoard`.
  - The add variants validate, then run as `Insert*` at the end of the list, as `AddOperation` does. None of the new variants `touches_taxonomy`; they fall to `_ => false`.
- **`Touched`** gains `links: bool` and `boards: bool`, and `merge()` ORs them.
- **New `EditError` variants**, whose `Display` is the wire code from the brief's table: `SelfLink`, `DuplicateLink:{id}`, `EmptyWhy`, `EmptyName`, `BoardNameTaken:{id}`, `UnknownLink:{id}` and `UnknownBoard:{id}`.
- **Link rules:**
  - Both references must exist (`UnknownReference`) and differ (`SelfLink`).
  - `why` is stored trimmed and must not be empty (`EmptyWhy`).
  - A link id that is already used gives `DuplicateId`.
  - One link per unordered pair, in either direction. A second gives `DuplicateLink(<existing id>)`.
- **Board rules** (`check_board`, used by add and replace):
  - The name is trimmed and must not be empty (`EmptyName`).
  - The name must be unique, ignoring case and the other names' surrounding spaces (`BoardNameTaken(<id>)`). The board's own id is excepted, so a board can be renamed to its own name in another case.
  - Members must exist (`UnknownReference`) and be listed once (`DuplicateId(<ref id>)`). Their order is kept.
- **Replace rules:**
  - `ReplaceLink` may change `why` only. A different id, `from_ref` or `to_ref` gives `InvalidTag("link <id>: a replacement changes `why` only")`. The brief names no variant for this caller bug, so I followed the way `ReplaceTag` and `update()` report theirs.
  - `ReplaceBoard` must keep the id.
  - Both validate and trim only with `check: true`, so undo restores the stored values exactly, legacy untrimmed text included.
- **C31 guard:** with `check: true`, `RemoveReferences` returns `InUse(<ref id>)` while a link or a board names one of the references being removed. Undo runs with `check: false` and does not see the guard.

### `commands.rs` (B2)

- `Change` gains `links: Option<Vec<Link>>` and `boards: Option<Vec<Board>>`. Each holds the full list and is set only when touched.
- `settle()` marks the library dirty when `touched.links || touched.boards`. Undo and redo (`step`) also go through `settle`.
- `is_noop()` treats `ReplaceLink` and `ReplaceBoard` with `before == after` as no-ops. It runs on the inverse, so a `why` that differs only in surrounding spaces is a no-op too.
- The `Touched { … }` literal in `removed_wins_in_change` gains `links: false, boards: false`.

### `saver.rs`

I read it and made no change. `Debounce::deadline()` waits on `dirty_library || dirty_taxonomy`, and `flush()` saves `library.json` when `take()` returns `library`. So the `settle()` flag is the whole fix.

## Tests

- **`edit::tests`**: the 16 tests the brief names, all passing:
  - `link_add_inverse_restores`, `board_add_inverse_restores`;
  - `remove_link_inverse_restores_position`, `remove_board_inverse_restores_position`;
  - `self_link_refused`, `empty_why_refused`, `link_unknown_ref_refused`;
  - `duplicate_pair_refused_either_direction`;
  - `replace_link_changes_why_only`;
  - `board_name_unique_case_insensitive`, `board_members_must_exist_and_be_unique`, `unknown_board_refused`;
  - `board_reorder_is_one_edit`;
  - `remove_refs_in_use_guarded`;
  - `wire_codes`, `merge_ors_links_and_boards`.
- **`commands::tests`**: 3 tests, through `commit()` directly, with two imported fixtures (`small.jpg` and `rotated.jpg`):
  - `link_edit_marks_library_dirty`
  - `link_edit_survives_flush`: the close path (`close_decision`) flushes, then `library.json` is read again.
  - `noop_replace_link_is_noop`: one undo after the no-op takes the add.
- **Extra assertions** beyond the brief's list:
  - `why` and the board name are stored trimmed.
  - `Change.links` is the full list, and `Change.boards` is `None`, after a link edit.
  - `unknown_board_refused` also covers `UnknownLink` for `RemoveLink`.
  - `board_name_unique_case_insensitive` also covers a rename to another board's name (taken), a rename to the board's own name in another case (allowed), and an `EmptyName` case.

**Red first:** with the tests in and no implementation, `cargo test edit::` failed to compile (47 errors: missing variants and fields).

**Mutation checks:** I took the change back temporarily, ran the tests, then put it back.
- Removing `touched.links || touched.boards` from `settle()` makes `link_edit_marks_library_dirty` and `link_edit_survives_flush` FAIL.
- Removing the `ReplaceLink` arm from `is_noop()` makes `noop_replace_link_is_noop` FAIL.

## Checks

| Check | Result |
|---|---|
| `cargo test` | **227** passed (208 + 19 new), 2 ignored; plus 0 and 1 |
| `cargo test edit::` | 67 passed |
| `cargo clippy --all-targets -- -D warnings` | clean |
| `cargo fmt --check` | clean |
| tsc, vitest, build | not run: no TS is touched |

## Notes for later tasks

- `Change` JSON now always carries `links` and `boards`, as `null` when not touched, the same way it carries `taxonomy`. `api.ts` `Change` does not list them yet; Task 3 or the UI task adds them.
- `Change.links` and `Change.boards` are the full lists from `lib.data`. They are not filtered by `visible()`, so a link or a board can name a hidden (bad-hash) reference. The UI should skip ids it does not have.
