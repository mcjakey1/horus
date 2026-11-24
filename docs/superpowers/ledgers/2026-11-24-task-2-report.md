# Task 2 report: `library` module (folder, model, atomic save)

**Status:** DONE_WITH_CONCERNS (one interface addition, see Concern 1)
**Commit:** `c4fd05b feat(core): library folder model with atomic save and backup recovery`

## Implemented

- `model.rs` holds `Region`, `Tag`, `Reference`, `Link`, `Board` and `LibraryData`, all exactly as the brief specifies.
  - Each derives `Serialize, Deserialize, Clone, Debug, PartialEq` and uses `rename_all = "camelCase"`.
  - Every `Option` field has `#[serde(default, skip_serializing_if = "Option::is_none")]`.
  - `added_at` is a `String` holding ISO-8601.
- `library.rs` holds `LibraryError` (`Io`, `Corrupt { recovered_from_backup }`, `NotALibrary`), built on `thiserror`. `Io` has `#[from] std::io::Error`.
- `Library { root, data, recovered_from_backup }` has these methods:
  - **`create(root, seed)`** runs `create_dir_all` for `images/`, `thumbs/256/` and `thumbs/1024/`. It then copies the seed to `taxonomy.json` and saves an empty `LibraryData { version: 1, .. }`.
  - **`open(root)`**:
    - It returns `NotALibrary` when there is no `library.json` file.
    - When `library.json` parses, it returns `Ok` with `recovered_from_backup: false`.
    - When `library.json` does not parse but `library.bak.json` does, it returns `Ok` with the backup's data and `recovered_from_backup: true`.
    - When neither parses, it returns `Err(Corrupt { recovered_from_backup: false })`.
    - When `library.json` cannot be read, it returns `Io`.
  - **`save()`** runs in this order:
    1. Serialize the data.
    2. Remove any stale `library.json.tmp` file, ignoring errors.
    3. Create the tmp file with `tempfile::Builder::new().prefix("library.json.tmp").rand_bytes(0).tempfile_in(root)`. This is a `NamedTempFile` at exactly that name.
    4. Write the data and call `sync_all`.
    5. Run `fs::copy` from `library.json` to `library.bak.json`, if `library.json` exists.
    6. Call `persist` onto `library.json`.

    If tmp creation fails, `library.json` and the backup are both left untouched.
  - **`image_path(r)`** returns `root/images/<r.file>`.
  - **`thumb_path(hash, size)`** returns `root/thumbs/<size>/<hash>.jpg`.
- `lib.rs` gains only `pub mod library; pub mod model;`. `greet` is untouched.
- `Cargo.toml` gains `thiserror = "2"` and `tempfile = "3"` as regular dependencies. `serde` and `serde_json` were already present from Task 1. `Cargo.lock` changes by only 2 lines, because both crates were already transitive dependencies.

## The mechanism for `save_failure_keeps_last_good`

I chose the fixed-name tmp file. With `rand_bytes(0)`, tempfile makes a single `create_new` attempt at exactly `root/library.json.tmp`. The test creates a directory at that path, so the open fails with `Io`. That happens before the backup copy or the persist, so `library.json` stays byte-identical.

The fixed name also makes the "no `library.json.tmp` remains" assertion in `save_is_atomic` meaningful.

I rejected the read-only-parent option. On Windows, the read-only attribute on a directory does not block creating files inside it, so that test would not fail.

A fixed name has one side effect: a crash mid-save could leave a stale tmp *file*, which would block every later save with `AlreadyExists`. `save` therefore runs `let _ = fs::remove_file(tmp)` first. `remove_file` fails on a directory, so the test still exercises the failure path.

**Mutation check.** I removed `.rand_bytes(0)` so the tmp name became random. `save_failure_keeps_last_good` then FAILED, which shows the test exercises this exact mechanism. I restored the line afterwards.

## TDD evidence

**RED.** I wrote the tests first, with no implementation, then ran this from `app/src-tauri`:

```
$ cargo test library::
error[E0432]: unresolved import `crate::model::Board`
error[E0425]: cannot find type `PathBuf` in this scope
error[E0433]: cannot find type `Path` in this scope
error[E0425]: cannot find type `Library` in this scope
error[E0425]: cannot find type `LibraryData` in this scope
error[E0422]: cannot find struct, variant or union type `Tag` in this scope
error[E0433]: cannot find type `Library` in this scope   (x6)
error[E0433]: cannot find type `LibraryError` in this scope
error: could not compile `horus` (lib test) due to 15 previous errors; 2 warnings emitted
exit=101
```

**GREEN:**

```
$ cargo test library::
running 6 tests
test library::tests::create_makes_layout ... ok
test library::tests::save_failure_keeps_last_good ... ok
test library::tests::unicode_path ... ok
test library::tests::corrupt_json_recovers_from_backup ... ok
test library::tests::save_is_atomic ... ok
test library::tests::save_roundtrip ... ok
test result: ok. 6 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out

$ cargo test
test model::tests::json_is_camel_case_and_skips_none ... ok
(+ the 6 library tests)
test result: ok. 7 passed; 0 failed
```

`cargo clippy --all-targets` reports no warnings. `cargo fmt --check` is clean.

**Process note.** While implementing, a Python prepend step truncated `library.rs` and `model.rs` before reading them back. That dropped the test blocks, and the first green-looking run showed "0 tests". I caught this and re-added the tests verbatim. The GREEN run above has all 6 plus the 1 model test. The RED run was captured before the truncation and is genuine.

## Files changed

- `app/src-tauri/Cargo.toml` and `app/src-tauri/Cargo.lock`
- `app/src-tauri/src/lib.rs`: two `pub mod` lines.
- `app/src-tauri/src/model.rs`: new.
- `app/src-tauri/src/library.rs`: new.

## Self-review

- Every type, field and signature named in the brief matches verbatim. The test names match the brief.
- Inbox status is not stored anywhere; an untagged `Reference` counts as Inbox, and that is documented on the type.
- The backup is written only after the new tmp file is fully written and synced. A failed write therefore never rotates the backup.
- `persist` errors map to `Io` through `.map_err(|e| e.error)`. Serialization errors also map to `Io`, through `io::Error::other`; with these types they cannot occur.
- `create` does not refuse a folder that already holds a library. It would overwrite `library.json` with an empty library, after copying the old one into `.bak`. The brief does not specify this case. See Concern 2.

## Concerns

1. **Interface addition.** `Library` has one extra field, `pub recovered_from_backup: bool`.
   - The brief's `open` returns `Result<Library, LibraryError>` but must both return the backup's data and report `recovered_from_backup: true`. One return value cannot do both.
   - `Ok` with the flag set is the smallest resolution. Task 7's `LibraryView.warning` should read `lib.recovered_from_backup`.
   - As a result, `LibraryError::Corrupt { recovered_from_backup: true }` is never constructed. Only `false` is used, when both files are unreadable. Every listed name and signature is unchanged.
2. **`create` on an existing library.** `create` on a folder that is already a library silently replaces its data with an empty library. The previous data survives only in `library.bak.json`. Task 7 may want a guard against this, for example returning an error when `library.json` already exists.
3. **The `.superpowers/` folder is gitignored**, so this report is not committed.

---

## Fix: `create` refuses an existing library (controller ruling 2)

**Commit:** `302f4df fix(core): refuse to create a library over an existing one`. This is a new commit; nothing was amended.

**Ruling 1 accepted:** `pub recovered_from_backup: bool` on `Library` stays as implemented. Concern 2 above is resolved by this fix.

### Change

- I added the variant `LibraryError::AlreadyALibrary` (`#[error("folder already holds a Horus library")]`).
- `Library::create` now checks `root.join("library.json").exists()` before doing anything else, and returns `Err(AlreadyALibrary)` if it is true. No directories, taxonomy copy, save or backup happen in that case.
- I added the test `create_refuses_existing_library`. It runs these steps:
  1. Create a library and push one `Reference` (`r1`).
  2. Save, then record the bytes of `library.json`.
  3. Call `create` again and assert `Err(AlreadyALibrary)`.
  4. Assert `library.json` is byte-identical to the recorded bytes.
  5. Assert `open` still returns the reference.

### RED 1: test written, no implementation (compile error)

```
$ cargo test library::
error[E0599]: no variant, associated function, or constant named `AlreadyALibrary` found for enum `library::LibraryError` in the current scope
error: could not compile `horus` (lib test) due to 1 previous error
```

### RED 2: variant added, no guard (behavioural failure)

```
$ cargo test library::
test library::tests::create_refuses_existing_library ... FAILED
thread 'library::tests::create_refuses_existing_library' panicked at src\library.rs:222:9:
assertion failed: matches!(Library::create(dir.path(), &seed()),
test result: FAILED. 6 passed; 1 failed; 0 ignored; 0 measured; 1 filtered out
```

### GREEN: guard added

```
$ cargo test library::
test library::tests::save_failure_keeps_last_good ... ok
test library::tests::create_makes_layout ... ok
test library::tests::save_is_atomic ... ok
test library::tests::corrupt_json_recovers_from_backup ... ok
test library::tests::create_refuses_existing_library ... ok
test library::tests::unicode_path ... ok
test library::tests::save_roundtrip ... ok
test result: ok. 7 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out

$ cargo test
test result: ok. 8 passed; 0 failed   (7 library + 1 model)
```

`cargo clippy --all-targets` reports 0 warnings. `cargo fmt --check` is clean.

---

## Fix round 1: saving after a recovery no longer destroys the good backup

**Commit:** `4c52d31 fix(core): only rotate the backup from a library.json that parses`. This is a new commit; nothing was amended.

### Change

- In `save`, the backup rotation was `if data.is_file()`. It is now `if parse(&data).is_some()`.
  - A corrupt `library.json` is never copied over `library.bak.json`.
  - This covers recovery after `open`, and also a file that an external tool corrupts after `open`.
- I moved the existing `parse` closure out of `open` into a module-level `fn parse(p: &Path) -> Option<LibraryData>`. Now `open` and `save` share one function.
- I did not gate this on `recovered_from_backup`, following the review. That flag never clears, and it misses corruption that happens after `open`.
- I left the review's minor findings alone, as instructed.

### Test: `save_after_recovery_keeps_good_backup`

The test runs these steps:

1. Create a library.
2. Save with board b1, then save with b2, so the backup holds b1.
3. Write `{` into `library.json`.
4. Call `open` and assert `recovered_from_backup`.
5. Save.
6. Assert `library.bak.json` still parses and equals the recovered data (b1).

### RED, before the fix

```
$ cargo test library::
test library::tests::save_after_recovery_keeps_good_backup ... FAILED
thread 'library::tests::save_after_recovery_keeps_good_backup' panicked at src\library.rs:249:18:
called `Result::unwrap()` on an `Err` value: Error("EOF while parsing an object", line: 1, column: 1)
test result: FAILED. 7 passed; 1 failed; 0 ignored; 0 measured; 1 filtered out
```

The backup had been overwritten with `{`, which reproduces the reported data-loss path.

### GREEN, after the fix

```
$ cargo test library::
test library::tests::save_failure_keeps_last_good ... ok
test library::tests::create_makes_layout ... ok
test library::tests::create_refuses_existing_library ... ok
test library::tests::corrupt_json_recovers_from_backup ... ok
test library::tests::save_is_atomic ... ok
test library::tests::unicode_path ... ok
test library::tests::save_roundtrip ... ok
test library::tests::save_after_recovery_keeps_good_backup ... ok
test result: ok. 8 passed; 0 failed; 0 ignored; 0 measured; 1 filtered out

$ cargo test
test result: ok. 9 passed; 0 failed   (8 library + 1 model)
```

`cargo clippy --all-targets` reports 0 warnings. `cargo fmt --check` is clean.

---

## Fix round 2: a missing `library.json` recovers from the backup (AGY Validator #2)

**Commit:** `9eea1e9 fix(core): recover from backup when library.json is missing`. This is a new commit; nothing was amended. Only `library.rs` changed; Task 3's `taxonomy.rs` and bundle config are untouched.

### Change

- **`open`** now reaches each outcome like this:
  - With neither `library.json` nor `library.bak.json`, it returns `NotALibrary`, as before.
  - When `library.json` is missing or does not parse and the backup parses, it returns `Ok` with `recovered_from_backup: true`.
  - When neither parses, it returns `Corrupt { recovered_from_backup: false }`. This now includes the case where the json is missing and the backup is unreadable.
  - When `library.json` exists but cannot be read, it still returns `Io`.
- **`create`** refuses with `AlreadyALibrary` when either `library.json` or `library.bak.json` exists, and touches nothing.

### Tests

- `missing_json_recovers_from_backup` runs these steps:
  1. Save twice, so the backup holds b1.
  2. Delete `library.json`.
  3. Call `open` and assert `Ok`, the flag, and data equal to the backup.
  4. Assert that an empty tempdir still gives `NotALibrary`.
- `create_refuses_backup_only_folder` runs these steps:
  1. Save, so `library.bak.json` exists.
  2. Delete `library.json`.
  3. Call `create` and assert `Err(AlreadyALibrary)`.
  4. Assert the backup is byte-identical and no `library.json` was written.

### RED, before the fix

```
$ cargo test library::
test library::tests::missing_json_recovers_from_backup ... FAILED
test library::tests::create_refuses_backup_only_folder ... FAILED
thread 'library::tests::missing_json_recovers_from_backup' panicked at src\library.rs:267:48:
called `Result::unwrap()` on an `Err` value: NotALibrary
thread 'library::tests::create_refuses_backup_only_folder' panicked at src\library.rs:285:9:
    Err(LibraryError::AlreadyALibrary))
test result: FAILED. 8 passed; 2 failed; 0 ignored; 0 measured; 7 filtered out
```

### GREEN, after the fix

```
$ cargo test library::
test library::tests::save_failure_keeps_last_good ... ok
test library::tests::create_makes_layout ... ok
test library::tests::create_refuses_backup_only_folder ... ok
test library::tests::save_is_atomic ... ok
test library::tests::unicode_path ... ok
test library::tests::create_refuses_existing_library ... ok
test library::tests::save_roundtrip ... ok
test library::tests::missing_json_recovers_from_backup ... ok
test library::tests::corrupt_json_recovers_from_backup ... ok
test library::tests::save_after_recovery_keeps_good_backup ... ok
test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 7 filtered out

$ cargo test
test result: ok. 17 passed; 0 failed   (whole crate, including Task 3's tests)
```

`cargo clippy --all-targets` reports 0 warnings. `cargo fmt --check` is clean.
