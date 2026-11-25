# Task 6 report: search tuning for per-keystroke use

**Status:** DONE. Commit `3a22449` on `p2-t6-search` (base `c2e0285`): `fix(core): word-boundary, NFC and punctuation-aware idea search`.

## Changes

- `app/src-tauri/src/search.rs`:
  - `pub const MIN_QUERY_CHARS: usize = 2`. The count is taken after `normalise`, and shorter queries return `[]`.
  - `pub fn normalise(s) -> String`: NFC, lowercase, every run of non-alphanumeric characters becomes one space, and the result is trimmed.
  - `fn has_phrase(hay, phrase) -> bool`: a whole-word phrase match on normalised strings. An empty phrase gives false.
  - Matching rules, as in the brief:
    - **Technique name or synonym:** the field contains `q`, or `q` contains the field as a whole-word phrase.
    - **Description:** every query word longer than 3 characters appears as a whole word.
    - **Operation:** `has_phrase(q, name) || has_phrase(q, plain_label)`, iterating over `tax.operations`.
    - **Reference:** the normalised title, note or link `why` contains `q`.
  - `search`'s signature is unchanged, and so is `Hit`. The doc comment is updated.
- `app/src-tauri/Cargo.toml`: `unicode-normalization = "0.1"`. `Cargo.lock` resolves it to 0.1.26.

## Tests (TDD)

- **RED:** 6 of the 10 new tests failed on the old code: `nfc_both_sides`, `min_query_length`, `operation_label_needs_whole_words`, `note_and_title_match`, `query_contains_name` and `punctuation_stripped`.
  - The other 4 already held under the old rules: `custom_operation_label`, `operation_id_rungs`, `reference_cap_is_4` and `description_words_over_3`.
- **GREEN:** `cargo test search::` passes 15/15: the 5 existing tests, unchanged, plus 10 new ones with the brief's names.
- **Full suite:** `cargo test` passes 79. `cargo clippy --all-targets -- -D warnings` is clean, and so is `cargo fmt --check`.
- **TypeScript:** not touched, so `npm` was not run.

**Fixed expected sets.** These were computed from the seed under the new rules, and each is capped at `MAX_TECHNIQUES = 8`:
- `"lead the eye"` gives the first 8 Sequence techniques, all with `operationId: "sequence"`:
  - chiaroscuro, good-continuation, size-hierarchy, temporal-synthesis, leading-lines, gaze-cue, body-vector, reading-path.
  - Sequence has 10 techniques; the cap drops repoussoir and arrow-cue.
- `"make it stand out"` gives the first 8 Differentiate techniques:
  - chiaroscuro, pop-out, saturation-blocking, simultaneous-contrast, warm-and-cool-split, semantic-contrast, face-schema, complementary-pairing.
- `"out"` gives text matches only:
  - pop-out, scale-disparity, contextual-metaphor, rim-light, silhouette, pattern-break, crop-at-the-edge, set-apart.
  - Chiaroscuro, which is tagged under Differentiate in the fixture and has no "out" in its text, is absent.

## AGY #2

**Verdict: PASS.** Quote: "Exact match on public API … all 4 matching rules … and all 15 tests". "Zero 4-operation assumptions". For Task 7, "Verified all 10 cases against `resources/taxonomy.json` — 10/10 agree with `search.rs`, and every `true` case has `<= 2` technique hits (none clipped by `MAX_TECHNIQUES = 8`)."

## Concerns

- **Turkish `İ` (minor, non-blocking; raised by AGY):** `to_lowercase()` turns `İ` into `i` plus U+0307, and `normalise` then splits on U+0307. JS `normalize("NFC").toLowerCase()` does the same, so Task 7's `matchesQuery` will agree if it normalises in the same order: NFC, then lowercase, then strip non-`\p{L}\p{N}`.
- **Cap applies to the operation tests:** "returns exactly Sequence's technique ids" is read under the cap of 8, so the test pins the first 8.
- **Per-keystroke cost:** each field is normalised on every call, roughly 50 techniques with their synonyms plus the references. That is fine at this library size. Pre-normalise on load if profiling ever shows it.
