# Task 3 report: the `taxonomy` module

**Status:** DONE_WITH_CONCERNS
**Commit:** `3a26494 feat(core): taxonomy loader and validator` (branch horus-foundation)

## What I implemented

- `app/src-tauri/src/taxonomy.rs`:
  - The structs `Taxonomy`, `Operation`, `Domain`, `Branch`, `Technique` and `BranchTechnique`. They use `#[serde(rename_all = "camelCase")]`, and each one has `#[serde(flatten)] extra: Map<String, Value>`.
    - `color` and `citation` are plain `Option<String>`, with no `skip_serializing_if`, so `null` round-trips.
    - `examples` is `Vec<Value>`.
    - `version` is not a named field. It lives in `Taxonomy.extra` and round-trips. The brief's struct does not list it.
  - `Taxonomy::load(path)` reads and parses the file. It does not call `validate`, and its errors name the path.
  - `Taxonomy::validate()` ports every check in `taxonomy/check_taxonomy.py`:
    - unique ids, unique branch pairs and unique links;
    - the operation names and plainLabels, in order, and the set of domain names;
    - the 41 reel names for the non-custom techniques. A custom technique must not reuse a reel name, and technique names must be unique ignoring case;
    - every branch reference resolves, and each branch's domain is in ALLOWED for its operation;
    - every link reference resolves, `source` is observed or drafted, and the rationale is not blank;
    - every technique has a branch, and no branch is empty;
    - a technique appears at most once per operation (SPEC §6.3);
    - the observed paths are exactly the four expected ones, and there are 4 observed links;
    - the shape of the fields: `examples == []`, non-blank icon and description, non-empty synonyms, citation either null or non-blank, and `color` null on operations.

    It gathers every problem into `Err(Vec<String>)`, with one message per problem, and each message names the offending id. Lookups use `HashMap::get`, so a dangling reference adds an error and cannot panic.
  - `branches_for(op, tech)` returns the branches of `op` that have a link to `tech`.
- `app/src-tauri/resources/taxonomy.json` is a byte-identical copy of `taxonomy/taxonomy.json`. I checked this with `cmp`.
- `tauri.conf.json` has `bundle.resources: ["resources/taxonomy.json"]`.
- `lib.rs` has `pub mod taxonomy;`.

## Tests (`cargo test taxonomy::`)

| Test | What it checks |
|---|---|
| `seed_validates` | The bundled seed (loaded through `CARGO_MANIFEST_DIR`) passes `validate()`. It has 48 techniques, 18 branches and 55 links, and the link `differentiate.feature` → `complementary-pairing` exists. |
| `validate_catches_dangling` | A link to `nope.missing` makes `validate()` return `Err`, and at least one message contains `nope.missing`. |
| `roundtrip_preserves_fields` | The test reads the seed as a `Value` and puts a `futureKey` at the top level and in item 0 of every array. It writes that to a tempfile and loads it with `Taxonomy::load`. It serialises the result, parses it back to a `Value`, and asserts equality with the original. It also spot-checks `color`, `examples` and `version`. |
| `branches_for_dag` | `branches_for("differentiate","chiaroscuro")` is not empty. The test then adds an in-memory link that puts `chiaroscuro` under `differentiate.space` too, and checks that both branches come back. |

### RED (stub that compiles and returns `Err("todo")` / an empty Vec)
```
running 4 tests
test taxonomy::tests::branches_for_dag ... FAILED
test taxonomy::tests::validate_catches_dangling ... FAILED
test taxonomy::tests::seed_validates ... FAILED
test taxonomy::tests::roundtrip_preserves_fields ... FAILED
...
seed loads: "todo"
loads: "todo"
test result: FAILED. 0 passed; 4 failed; 0 ignored; 0 measured; 9 filtered out
```

### GREEN
```
running 4 tests
test taxonomy::tests::branches_for_dag ... ok
test taxonomy::tests::validate_catches_dangling ... ok
test taxonomy::tests::seed_validates ... ok
test taxonomy::tests::roundtrip_preserves_fields ... ok
test result: ok. 4 passed; 0 failed; 0 ignored; 0 measured; 9 filtered out
```
The full `cargo test` run passed 13 tests and failed 0. `cargo fmt --check` exited 0, and `cargo clippy --all-targets` gave no warnings.

## Files changed
- `app/src-tauri/src/taxonomy.rs` (new)
- `app/src-tauri/resources/taxonomy.json` (new, a copy of the seed)
- `app/src-tauri/src/lib.rs` (+1 line)
- `app/src-tauri/tauri.conf.json` (+1 line)

## Self-review findings
- In `roundtrip_preserves_fields`, the nested `extra` maps are tested because an unknown key is injected into each array. Without it, only the top-level `extra` would be exercised, through `version`.
- No technique in the seed sits under two branches of one operation, and `validate` forbids that case. That is why the second half of `branches_for_dag` builds the case in memory. That half asserts that `differentiate.space` exists in the seed.
- A dangling link adds secondary errors as well, such as the observed-path check if the link was observed. The test therefore asserts that some message contains the id, not that exactly one error comes back.

## Concerns (non-blocking)
1. **Seed-pinned checks will reject edited taxonomies.** Following the ruling that `validate` must match `check_taxonomy.py`, I ported these checks too:
   - the 41 reel names;
   - the operation names and labels;
   - the domain names;
   - exactly four observed paths;
   - `examples == []`;
   - `color` null.

   Once Plan 6 lets users edit and save the taxonomy, adding an example, setting a colour or renaming a technique will fail `validate`. Plan 6 needs to split these into a seed-only check and a structural check. They are marked in the code with a `ponytail:` comment above the constants.
2. There are now two copies of the seed: `taxonomy/taxonomy.json` and `app/src-tauri/resources/taxonomy.json`. Nothing keeps them in sync. A future edit to one will not reach the other.

---

## Follow-up: controller rulings on concerns 1 to 3

**Commit:** `fix(core): split structural and seed taxonomy validation` `5bc16d2`.

### What changed
- **`validate()` now checks structure only.** It checks:
  - that the operation, domain, branch and technique ids are unique;
  - that no two branches share an (operation, domain) pair;
  - that no (branch, technique) link appears twice;
  - that every branch's `operationId` and `domainId` resolve;
  - that every link's `branchId` and `techniqueId` resolve;
  - that every technique has at least one branch.

  It allows a technique under several branches of one operation, and it pins no seed contents.
- **`validate_seed()` is new.** It starts with the errors from `validate()`, then runs the rest of `check_taxonomy.py`:
  - the operation names and plainLabels, the domain names, the 41 reel names, the custom-name rule and unique technique names ignoring case;
  - ALLOWED, the `source` and `rationale` rules, and the no-empty-branch rule;
  - the four observed paths;
  - `examples == []`, `color` null and the other field-shape rules.

  It also keeps the Python check that a technique sits under only one branch per operation, as a seed-only policy, so `validate_seed` still matches `check_taxonomy.py`.
- **Tests:**
  - `seed_validates` now calls `validate_seed`.
  - `branches_for_dag` adds a drafted link that puts `chiaroscuro` under `differentiate.space`. It asserts that `validate()` returns `Ok` and that `branches_for` returns both branches.
  - The new `validate_is_structural_only` sets an operation's colour, renames an operation and a technique, and adds an example. `validate()` must return `Ok` and `validate_seed()` must return `Err`.
  - The new `bundled_seed_matches_repo` compares `resources/taxonomy.json` with `../../taxonomy/taxonomy.json` through `CARGO_MANIFEST_DIR`, after normalising `\r\n` to `\n`.

### RED
The tests were written first, against a stub `validate_seed() { self.validate() }`:
```
test taxonomy::tests::validate_is_structural_only ... FAILED
  left: Err(["operation names must be [...], got [\"Stand apart\", ...]", "chiaroscuro: seed technique name \"Renamed\" is not a reel name", ..., "chiaroscuro: examples must be empty", "differentiate: color must be null"])
test taxonomy::tests::branches_for_dag ... FAILED
  left: Err(["chiaroscuro: under 2 branches of operation differentiate"])
test result: FAILED. 4 passed; 2 failed
```
`bundled_seed_matches_repo` passes as soon as it exists, because the two copies match. To show RED, I appended a space to `resources/taxonomy.json`, ran the test and then restored the file:
```
test taxonomy::tests::bundled_seed_matches_repo ... FAILED
resources/taxonomy.json drifted from taxonomy/taxonomy.json; copy it again
```

### GREEN
```
running 6 tests
test taxonomy::tests::bundled_seed_matches_repo ... ok
test taxonomy::tests::branches_for_dag ... ok
test taxonomy::tests::validate_catches_dangling ... ok
test taxonomy::tests::seed_validates ... ok
test taxonomy::tests::validate_is_structural_only ... ok
test taxonomy::tests::roundtrip_preserves_fields ... ok
test result: ok. 6 passed; 0 failed
```
The full `cargo test` run passed 15 tests and failed 0. `cargo fmt --check` exited 0, and `cargo clippy --all-targets -- -D warnings` was clean after I touched the file to force a re-lint.

### Remaining notes
- Two checks go slightly beyond the ruling's list:
  - `validate()` keeps the duplicate (operation, domain) branch-pair check. It is a uniqueness rule and does not pin any seed content. If Task 7 needs it gone, it is one loop to remove.
  - `validate_seed()` keeps the one-branch-per-operation rule for the seed only, to match `check_taxonomy.py`.
- The lookup-map setup (4 lines) appears in both functions. I left it duplicated rather than add a helper.
