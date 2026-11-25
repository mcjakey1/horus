# Task 7 report: UI store, tagging model, undo keys, Reference view on the store

**Status:** DONE. Two commits on `p2-t7-store` (parent `3a22449`):
- `bafbc90`: `feat(ui): change store, Reference view on the store, tagging model and undo keys`
- `bb0ecfa`: `fix(ui): repaint the plate on a library switch that keeps the focus id; boot destroy unwires undo keys` (the AGY notes)

## What was built

### New modules

- **`store.ts`: `createStore(view, tax)`.**
  - `refs` is a `Map` in library order. `apply` merges `references`, deletes `removed`, swaps `taxonomy` when it is non-null, and sets `canUndo` and `canRedo`.
  - `reset` replaces everything and emits `{ reset: true }`.
  - `inbox()` returns the references with zero tags.
  - `warning ?? null` and `taxonomyReadOnly === true` are coerced, because Rust does not send `taxonomyReadOnly` yet.
- **`ops.ts`:** follows Plan 3 Task 2's precedence. `color ∈ EXTRA_INKS` gives `var(--x-c…)`. With no colour, a seed id gives its seed ink. Anything else is neutral, including a missing op, an unknown colour, and an id such as `constructor` (guarded with `hasOwnProperty`). `opLabel` falls back to the id.
- **`esc.ts`:** escapes `& < > " '`. It replaces the local copies in `importer.ts`, `search.ts`, `firstrun.ts` and `view.ts`.
- **`tagging/model.ts`:** `techniquesFor`, `domainChoice`, `matchesQuery`, `examplesFor` and `presetFrom`.
  - `matchesQuery` normalises with `normalize("NFC")`, then `toLowerCase()`, then `/[^\p{Alphabetic}\p{N}]+/gu` to a space, then trims, as ruled.
  - It counts word length in code points (`[...w].length`), as Rust's `chars().count()` does.
- **`tagging/match-cases.json`:** the brief's 10 cases, plus one Devanagari case, `छाया`.
  - It also carries one fixture technique in `extraTechniques`, "Chhaya", described as "गहरी छाया". Both test sides inject it, and the Rust test links it under `differentiate.feature`.
  - The case passes only through the description rule, which needs the word "छाया" to keep its 4 code points. Under `\p{L}`, U+093E becomes a space and the case fails. This was verified by swapping in `\p{L}`: the test went RED.
- **`keys.ts`: `wireUndoKeys`.**
  - Ctrl or ⌘ with `z` undoes. With Shift held, or with `y`, it redoes. `e.key` is lowercased.
  - It returns early inside `input`, `textarea` and `[contenteditable]` without calling `preventDefault`, so the browser's own text undo runs.
  - The result goes to `store.apply`, and a rejection is swallowed.

### Changed modules

- **`firstrun.ts` `boot()` (B7):** opens or runs first run, then `getTaxonomy()`, then `createStore`, then `wireUndoKeys`, then `mountReference(root, api, store)`. It returns `{ ...view, store, destroy }`, and `destroy` also unwires the keys.
- **`reference/view.ts`:**
  - `mountReference(root, api, store)` makes no `openLibrary` or `getTaxonomy` calls and keeps no private copy of the library.
  - It paints synchronously at mount. `ready` resolves once the settings (theme and Find similar) are in.
  - `OP_KEY` is replaced by `opInk` and `opLabel`.
  - **Every Change** runs `refresh()`, which re-renders in place: it refetches `related` under the `S.nav` guard, keeps the pin, filter and trail, re-resolves the arrival tag by id, and clears a pin that is now out of range. It refreshes on every Change, not only "touching" ones, so a reference that has just become related shows up.
  - **A removed focus** falls back to the trail (with removed ids pruned), then the first reference, then the empty state "No references yet.". The empty state clears the plate, record and panes, and a later Change that adds references shows one.
  - **On `reset`:** the warning goes to `say`, but only when it is non-empty. If the focus id still exists, the plate is repainted.
  - **The `keydown` guard** covers `.picker, .lightbox, input, textarea, [contenteditable]`.

### Tests

- **Rust:** `search::tests::shared_match_cases` reads `include_str!("../../src/tagging/match-cases.json")`. It is test-only Rust.

## Results

- **`npx vitest run`:** 42/42 across 8 files.
  - New files: `store` (4), `ops` (2), `esc` (1), `tagging/model` (6) and `keys` (4).
  - `view` adds 9: the brief's 8 view tests (`store_change_rerenders_focus`, `taxonomy_rename_rerenders`, `removed_focus_falls_back`, `reset_switches_library`, `no_private_fetch`, `warning_shown_from_store`, `unknown_op_is_neutral` and `typing_in_picker_search_does_not_pin`), plus the two 982f8a6 notice tests moved onto a Store.
  - `firstrun` gains the Store assertions.
- **`npm run build`** (tsc + vite) passes.
- **Rust:** `cargo test` passes 80, and `search::` passes 16. `clippy --all-targets -D warnings` and `fmt --check` are clean.
- **TDD:**
  - **RED, vitest:** 7 files failed (missing modules, and `firstrun`'s `view.store`); then GREEN.
  - **`shared_match_cases`:** passed on its first run. It is a parity check against Task 6's code, so it has no RED of its own; its RED evidence is the `\p{L}` mutation on the TS side.
  - **The `bb0ecfa` plate fix:** RED was shown by reverting it, then GREEN.

## AGY #2

**Verdict: PASS WITH NOTES.**
- **Conformance:** "All created/modified files, exported interfaces … and named tests … match `task-7-brief.md` and B7." "Zero 4-operation assumptions … zero new inline `style=` attributes, single `esc` definition."
- **Note 1:** on a switch between libraries that share a hash, `refresh` left the old library's `thumb1024` on the plate. **Fixed in `bb0ecfa`**, with a test.
  - AGY also suggested that a real switch should clear the trail and re-pick the focus. That is deferred, because the interim import reopen goes through `reset` too (below).
- **Note 2:** `boot` discarded the undo-key unwire. **Fixed in `bb0ecfa`.**

## Assumptions about Task 5 (not built)

1. **`importer.ts` keeps Plan 1's behaviour** (import, then reopen the library, then `onLibrary`). Only the `esc` import changed.
   - The view routes `onLibrary` to `store.reset(lib, store.tax)`, which keeps the focus and pin.
   - Task 5's merge swaps this for `onChange: (c) => store.apply(c)` (`view.ts`, the `mountImport` call).
   - Once it does, `reset` means only a library switch. At that point the trail could be cleared on `reset`, as AGY suggested.
2. **`api.ts` has only what Task 7 uses**, with the plan's shapes: `Change`, `NewTag`, `DemoExample`, `LibraryView.taxonomyReadOnly: boolean`, and `undo()`/`redo()` wrappers (`invoke("undo")`, `invoke("redo")`).
   - `NewTechnique`, `TagFor`, `FieldPatch`, `ImportResult`, the other wrappers, the events and the `Skip` `insideLibrary` variant are left to Task 5.
   - Task 5's `api.contract.test.ts` should include the `undo` and `redo` rows.
3. **`search.rs` gained only a test.** "Don't write Rust" was read as applying to Task 5's commands.
4. **`boot()` wires `wireUndoKeys(document, api, store)` and returns the store.** Task 5's save-dialog mount goes in the same function.
5. **`Change.taxonomy` and `Change.created`** are typed optional and nullable, so both Rust's `null` and absent work. `removed` and `references` are always arrays.

## Other notes

- **`boot` and `getTaxonomy`:** `boot` now awaits `getTaxonomy()` itself. If it rejected, `boot` would reject, whereas Plan 1's view showed "Could not open the library". Rust's `get_taxonomy` only fails when no library is open, which cannot happen after a successful open.
- **Unknown operation in a callout:** the path line shows the id twice ("provoke · provoke"), because `opLabel` falls back to the id for both the name and the plain label.

## Fix round 1 (commit `57560bc`)

**Rulings applied:** I1, S1 and S2. AGY was skipped this round, as instructed.

### I1: stale plate after a superseded paint (`view.ts`)

- **The fix:** the `plate` boolean is gone. `paintFocus` repaints `#plate` whenever `api.assetUrl(ref.thumb1024)` differs from `S.plateSrc`. `renderEmpty` resets `S.plateSrc`.
- **Effect:** a paint that supersedes `show()`, a reset's refresh, or the first mount paint now draws the right image.
- **Covering tests:**
  - `change_during_show_paints_the_new_plate`: `show("b")`, then `store.apply` with no settle, then `settle()`. The plate shows b's `thumb1024`.
  - `change_after_reset_keeps_the_new_library_plate`: `reset` to a library whose `a` has another `thumb1024`, then an immediate Change on `a`. The plate shows the new path.
  - `change_at_mount_still_paints_the_plate`: a Change before the first `related()` returns. The plate is painted.

### S1: re-render scope, as the brief states

`touchesFocus(c)` refreshes only when one of these holds:
- the Change is a reset;
- it has a taxonomy;
- its `removed` is non-empty;
- there is no focus;
- a changed reference is the focus, is in `S.related`, or shares a technique or branch with the focus.

The status line still updates on every Change.

- **Covering test:** `unrelated_change_does_not_refresh`.
  - A reference tagged only under Infer makes no `related` call. A marker on the first `.call` survives, and `#lib-count` still updates.
  - A new reference sharing Silhouette does refetch.

### S2: `opInk` precedence (`ops.ts`)

- **The fix:** a colour in `EXTRA_INKS` gives that ink. Otherwise the seed id gives its seed ink, else neutral.
- **Covering test:** `op_ink_seed_extra_neutral` now asserts that `differentiate` with `color: "chartreuse"` gives `var(--diff)`, `var(--diff-text)` and `var(--diff-on)`. A non-seed id with an unknown colour stays neutral.

### Runs

- **RED:** `npx vitest run` gave "Tests 5 failed | 41 passed (46)": the 4 new view tests and `op_ink_seed_extra_neutral`.
- **GREEN:** `npx vitest run` gives "Test Files 8 passed (8) / Tests 46 passed (46)".
- **Build:** `npm run build` gives "✓ built".
