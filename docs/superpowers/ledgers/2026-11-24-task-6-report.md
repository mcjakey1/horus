# Task 6 report: the `search` module (idea search, SPEC §5a option A)

**Status:** DONE. The work is on branch `t6-search` (worktree `.worktrees/t6-search`), based on `9eea1e9`, in two commits:

- `bc4ad12`: feat(core): idea search over techniques, synonyms and the artist's own words
- `b398b7d`: fix(core): serialize search hits as tagged camelCase JSON for IPC (the AGY fix)

**Implementer:** the taxonomy session, delegated by design-second-brain-73.

## What was done

- `app/src-tauri/src/search.rs` (new) contains:
  - `pub enum Hit { Technique { id, operation_id, count }, Reference { id } }`
  - `pub fn search(tax: &Taxonomy, data: &LibraryData, q: &str) -> Vec<Hit>`
  - The signatures match the brief exactly.
- `app/src-tauri/src/lib.rs` gains `pub mod search;`. Nothing else changed.
- Matching mirrors `prototype/app.js` `searchTechniques`:
  - The query is trimmed and lower-cased; a blank query returns `[]`.
  - A technique matches when its name contains the query, when a synonym contains the query or the query contains a synonym (the prototype's two-way check, with empty synonyms ignored), or when every query word longer than 3 characters appears in its description.
  - When an operation's name or `plainLabel` contains the query, all techniques under that operation match.
  - A reference matches when its title or `note` contains the query, or when the `why` of a link that touches it does. The prototype has no `note` check; the brief asks for one.
  - Results are at most 8 technique hits, sorted by count in descending order (stable, so ties keep taxonomy order), followed by at most 4 reference hits in library order.
- `Hit` derives `Serialize` with `#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]`. Over IPC that gives `{"kind":"technique","id","operationId","count"}` or `{"kind":"reference","id"}`.

## Judgement calls (AGY judged all of them sound)

1. **One hit per technique, even though the taxonomy is a DAG.** `operation_id` is chosen in this order:
   1. the operation the query matched, if any;
   2. otherwise, the operation the library tags this technique under most often;
   3. otherwise, the technique's first operation in taxonomy branch order.

   This avoids duplicate rows, such as Chiaroscuro under both Differentiate and Sequence.
2. **`count` is the number of distinct references tagged with the technique**, as the brief and SPEC §4 say. The prototype counts tag rows instead.
3. **Untagged techniques are included with `count: 0`.** The prototype lists only techniques that are already tagged. Including the rest lets an empty or new library still be searched by idea.
4. **A technique under no branch is skipped**, because it cannot be tagged. This is marked with a `ponytail:` comment. The seed taxonomy has no such technique.

## RED and GREEN

- **RED:** `cargo test search::` against a stub that returns `vec![]` gave 3 failures and 1 pass. The failures were `moody_finds_chiaroscuro`, `plain_label_expands_operation` and `link_note_finds_reference`. `blank_query_is_empty` passed trivially against the stub.
- **GREEN:** `cargo test search::` passes 5 of 5:
  - the 4 tests from the brief;
  - `hit_json_is_tagged_camel_case`, added with the AGY fix.

  The full `cargo test` passes 22 of 22.
- `cargo fmt --check` is clean, and `cargo clippy --all-targets -- -D warnings` is clean.

The tests load the bundled seed through `env!("CARGO_MANIFEST_DIR")/resources/taxonomy.json`. Their fixture library has 3 references and 1 link. `plain_label_expands_operation` asserts:

- exactly 8 technique hits;
- every hit's `operation_id` is `differentiate`;
- every hit really sits under Differentiate (checked with `branches_for`);
- the tagged technique ranks first.

## Files changed

- `app/src-tauri/src/search.rs` (new)
- `app/src-tauri/src/lib.rs` (+1 line)

## AGY

AGY Validator #2 reviewed the work once, in conversation `bb3386cd`, read-only.

**Verdict:** PASS WITH FIXES.

- **Its one finding:** `Hit` needed `Serialize` and camelCase for the Task 7 IPC (`search(q) -> Vec<Hit>`, "All JSON is camelCase"). It was applied in `b398b7d`, along with a test that pins the JSON shape.
- **Everything else was verified sound:** the matching rules, the judgement calls, and the tests against the brief, SPEC §5a and the prototype.

## Concerns

- **The enum tag is a choice I made.** The plan says only "camelCase". Task 7 and Task 8 (`app/src/search.ts`) should switch on `kind: "technique" | "reference"`.
- **Two-way synonym matching.** Because the query may contain a synonym, a short synonym such as "eyes" matches any longer query that contains it. This mirrors the prototype on purpose; tighten it later if it proves noisy.
- **Linear scans.** Each technique scans the branches, links and references. This is fine for 48 techniques and 2,000 references, but an index would be worth adding if search runs on every keystroke and proves slow.
