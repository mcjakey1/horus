# Task 7 report: Tauri commands, app state and the asset scope

**Status:** DONE. Commit `b535308` on horus-foundation (parent 6a3e11d).

## What changed
- `src/commands.rs` (new). Holds `AppState`, the 8 commands, `LibraryView`/`ReferenceView`, and the tests.
  - State: `open: Mutex<Option<(Library, Taxonomy, Index)>>`, an `import_gate: Mutex<()>`, a `settings: Mutex<()>` that guards the read-merge-write, plus `config_dir` and `seed_taxonomy`. Both paths are injected: `.setup()` takes them from `app_config_dir()` and the `resources/taxonomy.json` resource; tests pass a tempdir and `CARGO_MANIFEST_DIR`.
  - Every command is generic over `R: Runtime`, so tests call it directly with `MockRuntime`.
  - Command names and arguments match `api.ts`: `path`, `id`, `paths`, `q` and `s`.
- `src/settings.rs` (new).
  - `Settings` has `lastLibrary`, `theme` (system/light/dark) and `findSimilar` (unset/on/off). The default is system/unset/null.
  - `SettingsPatch` has all fields optional and is merged on the server.
  - Atomic write: a `NamedTempFile` in the config dir, then `sync_all`, then `persist` (a rename).
  - A missing or corrupt settings.json loads as the defaults.
- `src/lib.rs`: removed `greet`, added a setup that manages `AppState`, and registered all commands.
- `src/import.rs`: `ImportReport` and `Skip` now derive `Serialize` (coordinator note).
- `tauri.conf.json`: removed `withGlobalTauri` and enabled `app.security.assetProtocol`. There is no static scope.
- `Cargo.toml`: added the tauri feature `protocol-asset`, and a dev-dependency on tauri with `test`.
- **`build.rs` and `windows-app-manifest.xml` (beyond the brief's file list, but needed).**
  - The problem: under `tauri::test`, the lib test binary died with `STATUS_ENTRYPOINT_NOT_FOUND` (0xc0000139). tauri-build embeds the Common-Controls v6 manifest only in the app binary.
  - The fix: build.rs now passes `WindowsAttributes::new_without_app_manifest()` and embeds the same manifest through the linker (`/MANIFEST:EMBED /MANIFESTINPUT`). The xml is a verbatim copy of tauri-build's manifest. This applies to MSVC targets only.
  - Checked: `horus.exe` contains the manifest and linked with no duplicate-resource error.
  - Production seed path checked: after `cargo build`, `target/debug/resources/taxonomy.json` exists, which is what the `.setup()` `BaseDirectory::Resource` resolve finds. The tests inject the seed, so this path has no test.
- `capabilities/default.json` already existed and is unchanged. App commands need no permission entry; the opener cleanup is Task 10.

## Wire shapes (for the UI)
- `LibraryView`: `{ root, references: [Reference + thumb256 + thumb1024], links, warning: string|null }`.
  - `root` and the thumb paths are absolute. They are built with `std::path::absolute` and `thumb_path_in`, never `canonicalize`, so they have no `\\?\` prefix.
- `ImportReport`: `{ added: [id], duplicates: [[path, existingId]], skipped: [[path, {kind, detail}]], warnings: [[path, msg]] }`.
  - `Skip` is tagged as `{"kind": "unsupported"|"unreadable"|"tooLarge"|"writeFailed", "detail": string|number}`.
  - This fits `api.ts` (`skipped: [string, unknown][]`).
- `Settings`: `{"lastLibrary": null, "theme": "system", "findSimilar": "unset"}`. `set_settings({s})` takes a partial patch, and `lastLibrary: null` (or absent) means "keep".

## Behaviour decisions
- **Import:**
  - `import_paths` is async and does all its work in `spawn_blocking`.
  - The gate is taken *before* the hash snapshot. The state lock is held only for the snapshot and for the append, index rebuild and save.
  - If a different library was opened mid-import, it returns `"Another library was opened during the import, so nothing was added to it."`. The copied files stay in the old library's `images/` folder as orphans.
- **`open_library` and `create_library` share `install`.** It does these steps in order:
  1. Adds the backup-recovery warning.
  2. Loads `taxonomy.json` and runs `validate()`. Validate errors are joined into the warning.
  3. Calls `allow_directory(root, true)`.
  4. Sets `lastLibrary`. If that fails, it becomes a warning, not an error.
  5. Rebuilds the index.
- **An unparseable `taxonomy.json` fails the open** with `"Could not read the library's taxonomy: …"`. The rulings only covered validate errors.
- **Error messages:**

  | Condition | Message |
  |---|---|
  | `AlreadyALibrary` | "That folder already contains a Horus library." |
  | `NotALibrary` | "That folder is not a Horus library." |
  | `Corrupt` | "The library file is damaged and its backup could not be read either." |
  | `Io` | "Could not read or write the library: …" |
  | No library open | "No library is open." |

- `get_taxonomy`, `related` and `search` return the "No library is open." error when no library is open.

## Tests (TDD)
- **RED:** with stub bodies returning `Err("todo")`, `cargo test --lib commands::` gave 0 passed and 8 failed. Each test panicked on an unwrap of `"todo"`.
- **GREEN:** all 8 pass:
  - `create_then_related_roundtrip`
  - `settings_default_find_similar_unset`
  - `set_settings_patch_keeps_last_library`, which also covers a full Settings sent with `lastLibrary: null`
  - `open_recovered_library_returns_warning`
  - `open_reports_taxonomy_problems_without_failing`
  - `errors_are_readable`
  - `import_twice_is_serialised_and_deduped`: two real threads; asserts one add, one duplicate and one reference on disk
  - `thumb_paths_are_absolute_and_exist`: also asserts `asset_protocol_scope().is_allowed(thumb)` and the camelCase JSON keys
- **Mutation check:** with the import gate removed, `import_twice_is_serialised_and_deduped` fails in 3 out of 3 runs.
- **Full suite:**

  | Check | Result |
  |---|---|
  | `cargo test` | 52 passed (44 + 8) |
  | `cargo clippy --all-targets -D warnings` | clean |
  | `cargo fmt --check` | clean |
  | `cargo build` | OK |
  | `npm run build` | OK |
  | `npm test` | 9/9 |

## Concerns
1. **build.rs and `windows-app-manifest.xml` are outside the brief's file list.** `tauri::test` on Windows needs them; see "What changed".
2. **The settings hazard from ruling 4 is closed on the server only if the UI omits or nulls `lastLibrary`.**
   - `api.ts` types `setSettings(s: Settings)` as a full object. A UI that spreads a cached `Settings` sends a stale non-null `lastLibrary`.
   - Example: start with library A, open library B, toggle the theme, and `lastLibrary` goes back to A.
   - Recommendation: widen `setSettings` in `api.ts` to `Partial<Settings>` and send only changed fields. I did not edit `api.ts`.
   - Also, with patch semantics `lastLibrary` can't be cleared.
3. **A narrow lost-update window.**
   - `open_library` reads `library.json` outside the state lock and swaps it in later.
   - If an import on the same root saves between that read and the swap, the in-memory state lacks those references, and the next save drops them from `library.json`.
   - It needs a reopen of the same library during an import. Fix: hold the `open` lock (or the import gate) across the read and the swap.
4. **`import_paths` returns ids only.** The UI must call `open_library` again to get the new references and thumb paths.
5. **The asset scope only grows.** A library opened earlier stays allowed until restart; this is marked `ponytail:`.
6. **Paths that aren't valid UTF-8 fail to serialise.** This is rare on Windows, and it happens after the import has already saved.
7. **The sync commands run on the main thread.** That is every command except `import_paths`.
8. **The `Skip` wire shape (`{kind, detail}`) is not asserted by any test.** It is derive-only, so the risk is low.

## Follow-up: controller fixes (commit `3e2ed7c`)
`fix(app): serialise library open with imports; partial settings writes`

### (3) Open races an import: fixed
- `create_library` and `open_library` now hold the import gate from the disk read through `install`, which covers the state swap and the index rebuild. An open waits for an in-flight import to save, and no import can start mid-open.
- **Lock order** is the same everywhere: import gate, then the settings mutex, then the state mutex. Here is what each command takes:

  | Command | Locks, in order |
  |---|---|
  | `create_library`, `open_library` | gate; settings, released; then state |
  | `import_paths` | gate; state, released; state again |
  | Other commands | state only, or settings only |

  No path takes them in the reverse order.
- **Both commands are now `#[tauri::command(async)]`.** While waiting on the gate they would otherwise freeze the main thread for the whole import. Their signatures are unchanged, so the tests call them as before.
- **Test `open_waits_for_inflight_import`:**
  1. Imports a folder holding `a_small.jpg` and a generated 1500×1500 `b_big.png` on one thread.
  2. Polls until the first thumbnail appears, with a 60 s deadline.
  3. Calls `open_library` on the same root.
  4. Asserts the returned view and the in-memory state both have 2 references.

  | Run | Result |
  |---|---|
  | RED (no gate) | `left: 0, right: 2` "open read the library mid-import" |
  | Mutation check: gate removed from `open_library` again | fails 3 of 3 runs (`left: 0`) |
  | GREEN | passes in about 3 s |

### (2) Partial settings: fixed
- `api.ts`: `setSettings(s: Partial<Settings>)`.
- `reference/view.ts`: the theme toggle sends `api.setSettings({ theme: t })`. That was the only `setSettings` call in `src/`, so no whole-object writes remain.
- **Vitest `theme_toggle_sends_only_theme`:** asserts one call whose argument is `toStrictEqual({ theme: "dark" })`.
  - RED: it received `findSimilar: "unset"` and `lastLibrary: "C:\lib"` as extra keys.
  - GREEN: passes.

### Evidence

| Check | Result |
|---|---|
| `cargo test` | 53 passed |
| `cargo clippy --all-targets -D warnings` | clean |
| `cargo fmt --check` | clean |
| `npm test` | 10/10 |
| `npm run build` | OK |

Concerns 2 and 3 above are resolved. The rest are accepted by the controller.
