# Task 4 report: debounced saver, path guards and backup hardening

**Status:** DONE. Commit `a5d17dc` on `p2-t4-saver` (parent `bdb47e2`), with the message `feat(core): debounced saves, guarded reference paths, hardened backup rotation`.

## Changes

### `saver.rs` (new, `pub mod saver;` in `lib.rs`)

- **`SAVE_DEBOUNCE_MS = 500`.**
- **`Debounce`:** the fields are private, as in the brief. The methods are `new`, `touch`, `due`, `deadline`, `take`, `restore` and `clear_library`.
  - `touch` clears `failed`.
  - `restore` sets `failed`, so `deadline` and `due` stay `None` and false until the next `touch`.
- **`flush(lib, tax, tax_writable, d)`:**
  - It saves `library.json` if that is dirty, and clears `recovered_from_backup` only after the save succeeds.
  - Then it saves `taxonomy.json` if that is dirty and `tax_writable`.
  - **On a `library.json` failure:** it restores `(true, taxonomy)` and returns `Err("library.json could not be saved (…)")`.
  - **On a `taxonomy.json` failure:** it restores `(false, true)`.

### `library.rs`

- **New error:** `LibraryError::InvalidFile(String)`.
- **The guards** (hand-written, no regex):
  - `image_path_in(root, file)` accepts `<64 lowercase hex>.<2–5 of [a-z0-9]>`;
  - `thumb_path_in(root, hash, size)` accepts a 64-lowercase-hex hash with `size` 256 or 1024;
  - both, and `Library::image_path` and `thumb_path`, now return `Result<PathBuf, LibraryError>`.
- **New and unguarded:** `images_dir(root)` (ruling B2).
- **`pub(crate) write_atomic(path, bytes)`:** writes a fixed-name `<name>.tmp`, removing any stale one first, then syncs and renames.
  - The backup is now written through `library.bak.json.tmp` instead of `fs::copy`.
- **The rotation gate is unchanged:** only a `library.json` that parses is rotated.
  - A `library.json` that can't be read (any error other than NotFound) skips the rotation with an `eprintln!`, and the save goes ahead.
  - The now-unused `parse()` helper is removed.

### `taxonomy.rs`

- **Carry-in 1:** `save` returns `Err("Couldn't read taxonomy.json: …")` on a read error other than NotFound, using the same match as `read_taxonomy`. It no longer skips the rotation and then writes.
- **Shared writes:** the private `NamedTempFile` `write_atomic` is replaced by `library::write_atomic`. So taxonomy writes use the fixed names `taxonomy.json.tmp` and `taxonomy.bak.json.tmp`.

### `import.rs`

- `:141` uses `images_dir(root)`.
- The thumbnail write and the persist inside the `io::Result` closures map the guard error with `io::Error::other`.
- The `Thumbs` drop guard uses `if let Ok(…)`.
- 17 test call sites gain `.unwrap()`.

### `commands.rs`

- `library_error` gains `InvalidFile(_) => "That image file name is not valid."`.
- **Also changed, because the signature forced it:** `install` builds the `ReferenceView` thumbnail paths with `?` and collects a `Result`. A reference whose hash is malformed now makes the open fail with that message, instead of handing the WebView an arbitrary path.

## Tests

- **Baseline:** `cargo test` at `bdb47e2` gave 109 passed plus 1 doctest. This was confirmed before any edit.
- **RED:** `cargo test --lib` failed to compile, with 27 errors (no `Debounce`, `flush`, `SAVE_DEBOUNCE_MS`, `images_dir` or `InvalidFile`; the path functions still returned `PathBuf`).
  - On the old code, these tests' assertions would also fail:
    - `backup_written_via_tmp`: a junk `library.bak.json.tmp` is left behind;
    - `save_failure_keeps_old_taxonomy`: the random tmp name is not blocked, so the save succeeds;
    - `save_refuses_unreadable_current`: the error does not name the file.
  - `rotation_skips_valid_json_of_the_wrong_shape` and `custom_id_skips_orphan_link` are guards over behaviour that already holds.
- **GREEN:** `cargo test` gives 123 passed (+14) plus 1 doctest.
  - `saver::` (8): `debounce_waits_for_quiet`, `debounce_not_due_when_clean`, `failed_flush_waits_for_touch`, `clear_library_keeps_the_taxonomy_dirty`, `flush_saves_only_dirty`, `flush_respects_read_only`, `flush_failure_restores_dirty` and `recovered_flag_clears_after_flush`.
  - `library::backup_written_via_tmp`.
  - `import::path_guards`, which includes the `small.jpg` import check.
  - `taxonomy::` (4, the carry-ins): `save_refuses_unreadable_current`, `rotation_skips_valid_json_of_the_wrong_shape` (`{}` and `[]`), `custom_id_skips_orphan_link` (`halo-glow-2`) and `save_failure_keeps_old_taxonomy`.
  - Plan 1's import tests at `commands.rs:608-655` pass unchanged (ruling B3).
- **Lint:** `cargo clippy --all-targets -- -D warnings` and `cargo fmt --check` are clean.

## AGY #2

**Verdict: PASS.**
- Quote: "Exact match on `SAVE_DEBOUNCE_MS`, `Debounce` API, `flush`, … All 5 Task 3 carry-ins are implemented and tested."
- On the guards: they "reject `..`, separators, extra dots, Windows drives, ADS (`:`), and reserved device names".
- On the thread: "Deferring `start_saver`/`Condvar`/`AppState` to Task 5 is right".
- **Minor note:** `write_atomic`'s `parent()` fallback to `"."` is moot, because library roots are absolute.

## Concerns and decisions

- **`start_saver`, `AppState.saver: Condvar` and the thread are not in this commit.** They need Task 5's `Open { debounce, tax_source, … }` and `setup`, and `commands.rs` AppState is outside Task 4's Files list. `Debounce::deadline()` and `due()` are the seam for them.
- **Carry-in 5 (the sweep):** the brief's backup hardening does not include a sweep.
  - With fixed tmp names, no random `.tmp*` files are created in the root any more. Task 3's `NamedTempFile` names never shipped.
  - So there is a `ponytail:` note on `write_atomic`, and Plan 6's `sweep_tmp` owns crash leftovers.
- **Different rules on purpose:** an unreadable `library.json` skips the rotation and still saves, as the brief says, while an unreadable `taxonomy.json` refuses to save, as carry-in 1 says.

## Fix round 1 (commit `961219b`)

### I1: one malformed hash made the library unopenable (`commands.rs` `install`)

- **The fix:** `install` now uses `filter_map` to skip any reference whose thumbnail paths fail the guard, instead of collecting a `Result`.
- It pushes one line onto the existing `warnings`: "N references in library.json have an image name Horus did not write, so they are hidden."
- `lib.data` keeps those references, so saves don't drop them.
- **Covering test:** `commands::tests::bad_hash_is_hidden_not_fatal`.
  - A `library.json` with one extra reference whose hash is `"../../evil"` opens.
  - The view carries the warning and shows only the good reference.
  - After an import, which saves `library.json`, the file still holds the bad entry: 3 references, one of them `bad` with hash `../../evil`.

### Also in this round

- **Stray doc comment:** the comment left at `taxonomy.rs:164` ("/// Atomic write: …") is deleted, so `NAMES_41` no longer carries it.

### Runs

- **RED:** `cargo test --lib bad_hash` gave "test commands::tests::bad_hash_is_hidden_not_fatal ... FAILED". It panicked at the `open_library(..).unwrap()` call, which returned `Err`.
- **GREEN:** `cargo test` gives "test result: ok. 124 passed" plus "1 passed" for the doctest.
- **Lint:** `cargo clippy --all-targets -- -D warnings` finished clean, and `cargo fmt --check` passes.

## Fix round 2 (commit `250eb42`)

### I2: hidden references still reached the UI through the index, `related` and `search`

- **The mechanism:** `commands.rs` `fn visible(lib: &Library) -> Cow<'_, LibraryData>`.
  - It returns `lib.data` without the references whose hash fails the path guard.
  - It borrows when nothing is hidden (the usual case), so nothing is copied.
- **Where it is used:** `Index::build` in `install` and `run_import`, `index.related`, and `search::search` all read `visible(lib)`. `lib.data` stays complete for saving.
- **Why this one:** the view is derived from the data each time, so no hidden-id set has to be kept in step after edits or index rebuilds.
  - A doc comment on `visible` states the rule for Task 5: hidden means no `ReferenceView`, no `related` score, no search hit or count; they stay in `lib.data`; every index build and search reads this view.
- **Covering test:** `bad_hash_is_hidden_not_fatal` is extended. The good and the bad reference both carry a Chiaroscuro tag, and the bad one is titled "Evil plate".
  - `related(good)` doesn't list `bad`.
  - `search("chiaroscuro")` gives `Hit::Technique { id: "chiaroscuro", count: 1 }`.
  - `search("evil plate")` gives no `Hit::Reference { id: "bad" }`.
  - The save-keeps-it assertions from round 1 still hold.

### Runs

- **RED:** `cargo test --lib bad_hash` gave "FAILED". It panicked at the `related` assertion, because `bad` was listed.
- **GREEN:** `cargo test` gives "test result: ok. 124 passed" plus "1 passed" for the doctest.
- **Lint:** `cargo clippy --all-targets -- -D warnings` finished clean, and `cargo fmt --check` passes.
