# Task 3 report: saving the taxonomy, its backup, and custom techniques

**Status:** DONE.

**Branch and commit:** branch `p2-t3-taxonomy` (worktree `.worktrees/p2-t3-taxonomy`), based on `b51ff9f`. One commit:

- `39df7ee`: feat(core): atomic taxonomy save with backup, fallback and inline custom techniques

**Implementer:** the taxonomy session.

## What was done

All the changes are in `app/src-tauri/src/taxonomy.rs`; 391 lines were added, and no other file changed. The brief's interface is implemented exactly.

**`Taxonomy::save(path)`:**
- It first rotates `taxonomy.bak.json` from the current file, but only if that file parses as a full `Taxonomy`, so a damaged file never replaces a good backup.
- It then writes atomically: `NamedTempFile::new_in(dir)`, then `write_all`, `sync_all` and `persist`.
- The output is `to_vec_pretty`. For the seed, it is value-equal to the seed file.

**`Taxonomy::load_with_fallback(root, seed)`:**
- It tries `taxonomy.json` (`File`), then `taxonomy.bak.json` (`Backup`), then the bundled seed (`SeedReadOnly`).
- **The newer-version check runs first**, in `read_taxonomy`, mirroring `library.rs:183-195`. A top-level `version` greater than `TAXONOMY_VERSION` (1), whether in the file or in the backup, gives `Err("This library was saved by a newer version of Horus.")`. It never falls through to the next source, so a newer file is never overwritten.
- It returns `Err` with a plain-words message only when all three sources are unusable. Nothing panics.

**`find_by_name`:** it ignores case and collapses whitespace only (`name_key`), per Review Focus 4 and ruling B6.

**`custom_technique`:**
- It builds an `Edit::AddTechnique` without applying it. The technique has the slugified id, `custom: true`, `icon: ""`, empty `synonyms` and `examples`, and `citation: None`. It carries one link with `source: "drafted"` and `rationale: "Added by the artist in the tag picker."`.
- The name is whitespace-collapsed, and the description is trimmed.
- **The branch is found by `(operation_id, domain_id)`,** not by joining the two into an id string, so branches added by Plan 3 work whatever their id.
- **Ids that orphan links already use count as taken.** This matches `edit.rs`, where `AddTechnique` returns `DuplicateId` when any `branch_techniques` entry already has the id. A suffix is added (`-2`, `-3`, …) until an id is free. A name that slugifies to nothing becomes `"technique"`.

**`CustomError` and `TaxSource`:**
- `CustomError` is `NameTaken(id)`, `EmptyName` or `NoSuchBranch`. Its `Display` text is in plain words, for the picker to show.
- `TaxSource` is `Copy`.

**Serde:** `BranchTechnique.source` and `rationale` get `#[serde(default)]`. The `Option` fields are unchanged and still serialise as `null`, as the brief says.

`lib.rs` needed no change, because `pub mod taxonomy;` already exists.

## RED and GREEN

- **RED:** after the tests were written, `cargo test taxonomy::` failed to compile, with 28 errors. All of them came from the missing `save`, `load_with_fallback`, `find_by_name`, `custom_technique`, `CustomError` and `TaxSource`.
- **GREEN:** `cargo test taxonomy::` passes 16 tests: the 6 existing ones and 10 new ones.
  - The new ones are `save_writes_no_key_absent_from_the_seed`, `custom_technique_is_custom_and_linked`, `custom_name_collision`, `custom_unknown_branch`, `custom_id_suffix`, `find_by_name_ignores_case_and_spacing_only`, `taxonomy_backup_rotates`, `damaged_taxonomy_falls_back`, `newer_taxonomy_refused` and `branch_technique_source_and_rationale_default`.
  - The full `cargo test` passes 103 lib tests and 1 doctest.
  - `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check` are clean.

## AGY #2 (conversation bb3386cd, read-only)

**Verdict:** "PASS". It found no real problems, and confirmed all six design choices against the brief, B6, Review Focus 4, SPEC §§3 and 9, `library.rs:183-195` and `edit.rs:360-364`.

## Concerns

1. **The test count doesn't match the brief.** The brief gave a baseline of 83 tests plus 1 doctest. The suite now has 103, which is 93 before this commit plus the 10 new ones. The difference is probably the Task 6 search tests merged into `b51ff9f`. Worth a glance at merge.
2. **The brief said to extend `roundtrip_preserves_fields`.** I left that test unchanged, and added `save_writes_no_key_absent_from_the_seed`, which carries both of the brief's assertions: saving the seed gives a value equal to the seed file, and a save/load round trip keeps unknown keys. AGY judged this sound.
3. **`save` gates the rotation on a full `Taxonomy` parse,** not just on valid JSON. A file that is valid JSON but the wrong shape is therefore treated as damaged, and doesn't replace the backup. This is deliberate.

## Fix round 1 (Opus review of 39df7ee: Important finding I1)

**Commit:** `2c1d06a`, fix(core): refuse an unreadable taxonomy instead of silently using an older copy.

**The finding:** `read_taxonomy` mapped *every* IO error to "absent" (`let Ok(bytes) = fs::read(path) else { return Ok(None) }`). A sync lock or a permission error on an existing `taxonomy.json` therefore loaded the older `taxonomy.bak.json`. The next two saves would then rotate the newer file out of both copies.

**The fix,** in `taxonomy.rs` `read_taxonomy`:
- Only `ErrorKind::NotFound` returns `Ok(None)`.
- Any other read error, on `taxonomy.json` or on `taxonomy.bak.json`, returns `Err("Couldn't read <file name>: <reason>")`. `load_with_fallback` passes it on with `?`, so the open is refused instead of using an older copy.
- This mirrors `library.rs:77-78`.

**The covering test,** `unreadable_taxonomy_refuses_instead_of_using_backup`:
- A directory at the `taxonomy.json` path, with a good backup present, gives `Err` starting "Couldn't read taxonomy.json:". The backup is not loaded.
- The same holds for a directory at the `taxonomy.bak.json` path when `taxonomy.json` is absent: "Couldn't read taxonomy.bak.json:".

**RED:** `cargo test taxonomy::tests::unreadable` FAILED:

```
called `Result::unwrap_err()` on an `Ok` value: (Taxonomy { ... })
```

The load returned the backup taxonomy.

**GREEN:**
- `cargo test taxonomy::` gives `test result: ok. 17 passed; 0 failed`.
- `cargo test` gives `test result: ok. 104 passed; 0 failed`, plus `1 passed` (doctest).
- `cargo clippy --all-targets -- -D warnings` is clean, and `cargo fmt --check` is clean.

**Not changed, by the ruling's scope:**
- `Taxonomy::save` still skips the backup rotation when the current file can't be read (`if let Ok(current) = fs::read(path)`), and then attempts the write. With a sync lock, that write would normally fail too.
- But if a read fails while a write succeeds, the newest file would be replaced without a backup.
- I suggest having Task 4 also treat a non-NotFound read error in `save` as an `Err`. It is a one-line match, the same as in this fix.

The deferred minors are logged for Task 4, as ruled.
