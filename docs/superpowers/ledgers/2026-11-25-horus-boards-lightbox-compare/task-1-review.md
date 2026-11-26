# Task 1 review: link and board edits (529043d..490d720)

**Verdict: Approved.** No Critical or Important issues. Four Minor notes.

### Spec Compliance
- ✅ All eight `Edit` variants are present with the names and shapes in the brief. `InsertRefLink` and `InsertBoard` carry `Sealed`, are built only inside `edit.rs`, and do no validation beyond a position check, as the existing `Insert*` pattern does.
- ✅ None of the new variants `touches_taxonomy`. They fall to `_ => false` (`edit.rs:217`), so `commit()`'s read-only and R13 checks are skipped for them.
- ✅ The seven `EditError` variants have the wire-code `Display` from the table. `wire_codes` checks all seven.
- ✅ `Touched` has `links` and `boards`. `merge()` ORs both. `merge_ors_links_and_boards` covers this.
- ✅ `Change` has `links` and `boards` as `Option<Vec<_>>`. Each holds the full list, and is set only when touched (`change()`).
- ✅ B2: `settle()` marks the library dirty for `touched.links || touched.boards`. I traced the save path. `Debounce::touch` sets `dirty_library`. `deadline()` then returns `Some`. `flush()` → `take()` → `lib.save()` writes `LibraryData`, which serializes `links` and `boards` (`model.rs:74-75`). On quit, `close_decision` → `flush_open` reaches the same code. Undo and redo (`step`) also go through `settle`. `link_edit_survives_flush` tests the close path from start to end, and the implementer's mutation check shows that both B2 tests depend on the flag.
- ✅ `is_noop()` treats `ReplaceLink` and `ReplaceBoard` as no-ops when `before == after`. It runs on the inverse, so a `why` that differs only in surrounding spaces is also a no-op.
- ✅ Validation: `SelfLink`; `UnknownReference` for either end; `EmptyWhy`, with `why` stored trimmed; `DuplicateLink(<existing id>)` for either direction of a pair; a board name that is trimmed, non-empty and unique ignoring case, excepting the board's own id; members that exist and are unique, in their given order.
- ✅ C31 guard: with `check: true`, `RemoveReferences` returns `InUse` when a link end or a board member is in the removed set. It is skipped with `check: false`, which undo and batch unwind use. I grepped at 490d720, and nothing builds `RemoveReferences` with `check: true` today. Its only producer outside the tests is the inverse of `InsertReferences`, and that comes from the import's `AddReferences` (`commands.rs:930`). History applies that inverse through `apply_inverse`, with `check: false`. So nothing that works now regresses.
- ✅ Undo and redo restore the exact position for every new variant:
  - `AddLink` and `AddBoard` → `Insert*` at `len` → inverse `Remove*{index}`. Redo is `Insert*` at that same index.
  - `RemoveLink` and `RemoveBoard` of the middle item → `Insert*{index: 1}`. The order is restored, as `remove_*_inverse_restores_position` shows.
  - `Replace*` changes the item in place at `position(== before)`. The inverse swaps `before` and `after`.
  - A reference that is named in both links and boards: I checked this by reading the code, not by a test. The chained `find` returns the first match and changes nothing. `remove_refs_in_use_guarded` covers a board member (r3) and both link ends (r1, r2) separately; see Minor 4.
- ✅ Check-mode-only trimming does not let untrimmed or invalid text in on undo or redo:
  - `Add*` always trims and validates (check does not gate it), and stores the trimmed item. Redo applies `Insert*` with that stored, trimmed item.
  - On a forward `Replace*` (check: true), `after` is trimmed and validated before it is stored. The inverse holds the stored, trimmed `after` as its `before`, so the undo lookup by equality finds it. Undo restores `before` exactly as it was, legacy untrimmed text included.
  - Redo stores the trimmed `after` again. With `check: false`, the only text that can be stored is a state that already existed.
- ✅ Null `links`/`boards` do not break the TS consumer. `api.ts` `Change` does not declare them. `store.apply` (`store.ts:47-54`) reads only `references`, `removed`, `taxonomy`, `canUndo` and `canRedo`. `lightbox/view.ts:211` and `reference/view.ts:613` read named fields only. Nothing spreads, enumerates or runtime-validates `Change` keys. JSON `null` for an undeclared field is ignored at runtime.
- ✅ Links stay out of correlation: `reindex` and `Index::build` do not read `data.links`, and this diff does not change them.
- ✅ All 19 tests the brief names are present, and they assert what the brief asks for, including the rollback of a batch with both directions and a rename to the board's own name in another case.
- ⚠️ Cannot verify from the diff: the test, clippy and fmt counts (227 + 2 ignored + 1 doctest), and the red-first and mutation runs. I did not run the suites. The code and the tests are consistent with the claims.

### Strengths
- The `Add*` variants validate once, then delegate to their sealed `Insert*` at `len`. This reuses one insert path, which is how `AddOperation` works, and makes the inverse fall out for free.
- `Replace*` validates and trims only on the forward path. Undo stays a byte-exact restore, which SPEC §9 and Plan 2's restore rule need.
- The B2 fix is the minimal one, in the one shared function (`settle`) that commit, undo and redo all go through. The mutation checks prove that the tests depend on it.
- The tests go past the brief: trimmed storage, `Change.boards` is `None` after a link edit, a board renamed to its own name in another case, and `UnknownLink` on `RemoveLink`.

### Issues
#### Critical (Must Fix)
None.

#### Important (Should Fix)
None.

#### Minor (Nice to Have)
1. **Board-name key differs from the taxonomy's `name_key`** (`edit.rs` `check_board`). `taxonomy::name_key` (`taxonomy.rs:117`) collapses inner whitespace as well as lowercasing, and it is the existing rule behind `NameTaken`. `check_board` only trims and lowercases, so "Harbour  Night" and "Harbour Night" can both exist. The brief's rule ("trimmed, non-empty and unique without regard to case") is met. Reusing `name_key` (it is `pub(crate)`) would make board names match technique names, and it is one line: `let key = name_key(&board.name);` with `name_key(&b.name) == key` in the comparison.
2. **`InvalidTag` for a link or board replacement that changes its identity.** This is a caller bug that the UI never sees in normal use, and the brief names no variant for it. The choice is acceptable, but the wire text reads "invalid tag: link …". If Task 3's command layer can ever forward it, a short note there would help. No change is needed now.
3. **Forward note for Task 3 and the UI task, not a Task 1 defect:**
   - `store.apply` does not yet read `c.links`, and the TS `Change` type does not declare it, so `store.links` goes stale after a link edit or its undo until the TS side consumes it.
   - Declare the new fields as optional and nullable (`links?: Link[] | null`) so `store.reset`'s literal still type-checks.
   - The re-render checks in `lightbox/view.ts:211` and `reference/view.ts:613` look only at `taxonomy`, `references` and `removed`, so they will not fire on a Change that touches only a link.

4. **Test gap (C31):** no test removes a reference that is in a link and on a board at the same time. By reading the code, `InUse` is returned and nothing changes. To cover it, add `"r1"` to the board in `remove_refs_in_use_guarded`.

### Assessment
**Task quality:** Approved
**Reasoning:** Every requested variant, error code, `Touched`/`Change` field and B2 save path is implemented and tested. Undo and redo restore exact positions and exact stored text for every new variant. The remaining notes are a small consistency nit and forward pointers for Task 3.
