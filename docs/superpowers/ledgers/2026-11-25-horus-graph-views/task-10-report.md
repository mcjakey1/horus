# Task 10 report: taxonomy editing in the Tree inspector

Implementer: design-second-brain-4d. Branch `p3-t10`, base `41d96ce` (Tasks 1-9 merged).
Status: **DONE_WITH_CONCERNS** (the concerns are listed at the end. None of them blocks the review.)

## Commits

| Commit | Content |
|---|---|
| `567db9e` | `feat(ui)`: extra operation inks in `styles.css` and DESIGN.md, with the contrast and distinctness tests |
| `70b8a1f` | `feat(ui)`: taxonomy editing in the Tree inspector with tag moves (the brief's commit message) |
| `9e227c3` | `fix(ui)`: fixes from the AGY self-check (in-flight guard, search unchooses a hidden target, technique-form refusals) |
| `2cd6971` | `fix(ui)`: an inline edit cancels in place, not by a re-render that would detach the control being clicked; an empty plain label stays editable; the synonym chip class is renamed `.insp-chip`, because the new `.chip` rule was restyling the Reference view's filter chips |

## What I built

- **`inspector.ts`.** `renderInspector`'s signature is unchanged. `InspectorOpts` gains only optional members:
  - `api?` and `apply?`, from the brief;
  - `notice?` and `focusCanvas?`, both accepted by the controller.
  - **Editing condition.** The editing controls render only when `editable && api && apply`. With `editable: false`, the markup is exactly Task 6's. The only exception is the read-only note, which needs `apply` and the `taxonomyReadOnly` flag, so Radial never shows it.
  - **Technique:**
    - the name is inline: a button in the title that becomes an input. Enter saves through `updateTechnique`. Esc and blur cancel, and an unchanged value saves nothing. `NameTaken:<id>` shows "That name is taken by <Name>." beside the field. After a save, focus goes to the canvas (`focusCanvas`), or to the title if there is no canvas. It never stays in a text field (C19).
    - The definition is a textarea that saves on `change`, so a blur saves only when the text changed.
    - Synonyms are chips. "+ synonym" adds one (a blank or duplicate word is not sent), × removes one, and each change saves.
    - An empty name or plain label shows a tertiary "Add …" placeholder, so it can still be edited.
  - Every "Used under" pair has a ×. When no tag uses the pair, × calls `unlinkTechnique(t, b, undefined)` directly (R20). When tags use it, × opens the move-tags dialog. On a technique's only link, × is disabled with the title "A technique needs at least one place".
    - "Also use under…" lists every branch the technique is not linked to yet. It is the keyboard route for drag to link.
    - "Delete technique…": a technique in use goes through the move-tags dialog. An unused one gets a confirmation ("Delete <Name>?") and then `deleteTechnique(id, undefined)`.
  - **Operation:**
    - the name, plain label and description are inline.
    - The ink swatch row shows the current ink first, then the free `EXTRA_INKS`. Each swatch has its name as its `aria-label` (Amber, Green, Blue or Vermilion for the seed inks). Colours come from `data-swatch` CSS attribute selectors, not `style`.
    - "+ Domain…" lists the domain types not yet used under the operation and calls `addBranch`. Its "New domain type…" form calls `addDomain(name, description, undefined, operationId)`: one call, one undo step.
    - "Delete operation…" opens `openMoveBranches`. It is disabled for the last operation.
  - **Domain (branch selection):**
    - name and description, edited as above.
    - An icon picker over `DOMAIN_ICONS` (a mirror of the 8 strings in `commands.rs`), which shows each description as text.
    - "+ Technique…" opens `mountTechniqueForm` with the branch fixed.
    - "Delete domain…" opens `openMoveBranches`.
  - **No selection:** "+ New operation…" opens a form (name, plain label, description) and calls `addOperation(name, label, desc)`, with no colour, so Rust picks the first free ink. At `MAX_OPS` it is disabled, with the title "Up to 9 operations".
  - **The `run` helper** handles every command result:
    - it passes each `Change` to `apply` and says `madePartial > 0`: "N tags pointed at a technique or domain that no longer exists, and are now partial tags (operation only). Ctrl+Z puts them back."
    - On `TaxonomyReadOnly`, it shows the toast and re-renders, so the UI reverts.
    - Any other refusal is said through `sayError`.
    - A per-inspector in-flight guard makes a double click one api call and one undo step.
  - **Read-only:** the note (`role="status"`, Plan 2's sentence) is one node that is kept across renders, so it is announced once.
  - **Dialogs** mount beside the aside (`el.parentElement`), so an inspector re-render cannot destroy them.
- **`move-tags.ts`** (new):
  - `openMoveTags` and `openMoveBranches`, with the brief's signatures, plus `confirmDelete`. Each is a `role="alertdialog"` sheet, so `wireUndoKeys` stands down behind it. No option is pre-selected, and the confirm button is disabled until one is chosen. Esc and Cancel return `null`, and focus goes back to the opener.
  - Move-tags dialog:
    - the title is "N references use <Technique>" (or "1 reference uses …"). For an unlink, "… under <Op · Domain>" is added.
    - The targets are every linked pair except the technique's own (delete), or except only the unlinked pair (unlink). Each reads "Technique — Op · Domain".
    - A search narrows the targets. A target the search hides is unchosen.
    - Option 2 is "Keep them as partial tags (operation only)". The buttons are "Move and delete" or "Move and unlink", and "Cancel".
  - Move-branches dialog:
    - for an operation, "Move its branches and tags to <plain label>" for each other operation, then "Delete them and their tags: N tags on M references, K techniques left with no other place".
    - For a domain, "Move to <domain>" for each other domain, then "Delete; tags become partial: …" with the same counts.
  - The error copy: `READ_ONLY`, `sayError(err, tax?)` and `Said`. The raw text never reaches the UI. Every string is mapped:
    - the fixed strings: `EmptyName`, `BadMoveTarget`, `NeedsMove`, `LastLink`, `LastOperation`, `TooManyOperations`, `UnknownInk`, `UnknownIcon` and `TaxonomyReadOnly`;
    - `NameTaken:<id>` and `LabelTaken:<id>`, with the owner's name looked up across techniques, domains and operations;
    - `unknown <kind>: …` becomes "That <kind> no longer exists.";
    - the O3 `still in use: <id>` gets its own sentence, naming the item;
    - everything else gets "That change didn't save. Try again."
- **`technique-form.ts`** (new): `mountTechniqueForm(host, api, branchId)` calls `api.addTechnique({ name, description, operationId, domainId })` with one argument (C17).
  - It takes the operation and domain from the branch id, split at the first dot. I checked the Rust `slug()` (`[alnum]` joined by `-`), so an id cannot contain a dot.
  - The inspector hands it an api whose `addTechnique` applies the Change. On a refusal it rejects with a `Said` sentence that already holds the owner's name; on `TaxonomyReadOnly` it also shows the toast and re-renders.
- **`tree.ts`:**
  - `deps` gains optional `apply?` and `notice?`. The inspector is editable when `apply` is given and the snapshot is not read-only.
  - `setDraggable` allows `tech:` nodes only, and its predicate reads `taxonomyReadOnly` live, so a read-only library pans instead.
  - Drag to link: a drop onto a branch the technique is not linked to yet calls `linkTechnique`. A drop onto a linked branch, onto nothing or onto another kind of node does nothing.
  - During a drag, `onDragOver` and `setDropHint` outline a valid target in its operation's base ink, and an invalid (already linked) one shows `not-allowed`.
- **`scene.ts` and `frame.ts`** (ruling 1): a minimal additive hook, +29 lines in `scene.ts` and +4 in `frame.ts`.
  - New optional `Scene` members: `onDragOver?(fn)` and `setDropHint?(hint)`. No existing member changed, and the other fake scenes still compile.
  - The scene emits drag-over on each pointer move while dragging. It clears the hint, the cursor and the drag-over on a drop or a `pointercancel`.
  - The hint draws as a 2px ring in the given colour, and `"blocked"` sets `canvas.style.cursor = "not-allowed"` through the CSSOM.
- **`firstrun.ts`** (still one line): `mountTree(…, { api, apply: store.apply, notice, openReference })`.
- **`styles.css`:**
  - the `--x-<name>`, `-text` and `-on` tokens for the five extra inks in both themes, verbatim from the brief's table;
  - one block of styles for the inspector controls and `.tx-dialog`, with no ink except the operation swatches.
- **`DESIGN.md`:**
  - a new "Extra operation inks" section: the five hues, the token names, the brief's table verbatim, and the method and floor;
  - the ruling-B7 delta: light Group Green `-on` measures 4.37:1 and is carried to Plan 6 unchanged;
  - the new inks in the front-matter colours.

## Carry-ins

1. **`assetUrl`:** still passed. The Tree hands `assetUrl`, `api`, `apply`, `notice` and `focusCanvas` to the inspector.
2. **`renderInspector`'s signature:** kept. Only optional `InspectorOpts` members were added. Radial's call compiles unchanged.
3. **`madePartial`:** when it is above 0, the notice tells the artist how many tags became partial and that Ctrl+Z restores them. Tested.
4. **Inks and B7:** the DESIGN.md table and delta are in. `inks.test.ts` asserts that:
   - every extra ink's `-on` against its base is at least 4.5:1;
   - every ink's `-text` against `--panel` is at least 4.5:1 (all 9 inks, both themes);
   - every pair of the 9 bases differs by at least ΔE2000 15;
   - the seed `-on` values are pinned as they stand, with a comment naming the 4.37:1 delta. The test also asserts that this value is 4.37.

   The CIEDE2000 helper passes Sharma's three pairs within 1e-4. I did not retune any value: every brief value passed.
5. **O3:** handled in the UI. A raw `still in use: <id>` becomes a readable sentence that names the item and gives two ways out. Rust is unchanged, so the move itself is still refused (see the concerns).
6. **ae N3:** "Also use under…" offers branches under the same operation in another domain, for example `differentiate.social` for Chiaroscuro. The test links one and shows that `domainChoice` then returns `ask` with both branches, so the picker's domain radios are now reachable.
7. **T9 error strings:** `EmptyName`, `BadMoveTarget` and `unknown <kind>` have readable copy. `sayError` tests cover them, and a generic fallback catches everything else, so raw text is never shown.

## TDD evidence

**RED.** I wrote the brief's tests first and ran `npx vitest run src/views/ src/inks` before the inspector, dialog, form, tree and ink code existed. Two exceptions to "before any implementation": the small `scene.ts`/`frame.ts` drag-over hook (ruling 1) was written just before this RED run, and the contract test for `null` over IPC was added just after it.
```
 FAIL  src/inks.test.ts > inks_contrast_and_distinct > light: every ink is defined, legible and distinct
 FAIL  src/inks.test.ts > inks_contrast_and_distinct > dark: every ink is defined, legible and distinct
TypeError: .toMatch() expects to receive a string, but got undefined      (no --x-* tokens yet)
 Test Files  3 failed | 4 passed (7)      (inspector-edit + move-tags: modules ./move-tags, ./technique-form not found)
      Tests  2 failed | 64 passed (66)
```
Sharma's pairs and the seed pin passed at RED, as they should: they test the helper and the existing values.

**GREEN:**
- `npx vitest run` at `2cd6971`: **38 files, 432/432 passed** (baseline 386; +46 new).
- `npx tsc --noEmit -p .`: clean.
- `npm run build`: built. The only warning is the large-chunk notice on the existing `lib` chunk, which this task did not add.

**Test-file fixes made during GREEN:**
- the seed already has "tenebrism" as a synonym, and the code rightly refuses a duplicate, so the test now adds "candlelit";
- a synthetic `input` event lacked `bubbles: true`;
- `.at()` is not in the TS lib, so the tests use `lastCall`;
- `node:fs` uses the repo's `@ts-expect-error` pattern from `vite.config.ts`, because the `?raw` CSS import comes back empty under vitest.

**New tests:**
- `views/inspector-edit.test.ts`:
  - every brief case except `move_targets_exclude_self` and `no_default_choice`, which are in `move-tags.test.ts`; `inks_contrast_and_distinct` is in `inks.test.ts`;
  - extras: synonyms, operation fields, domain icon, + Domain and delete, + Technique, N3, the in-flight guard, technique-form refusals and `sayError`;
  - the Tree's `drop_on_branch_links`, with drop-hint feedback, and `read_only_disables_editing`, both on a fake scene.
- `views/move-tags.test.ts`: the target exclusion for delete and unlink, the search, `no_default_choice`, Esc, a hidden target being unchosen, and the operation and domain dialogs with their counts.
- `inks.test.ts`.
- A contract test in `api.contract.test.ts`: absent `moveTo` and `color` reach Rust as `null` (ruling 3).

## Deviations (each ruled or a spec reading)

- **Ruling 3:** the brief's `null` arguments are passed as `undefined`, for `deleteTechnique(id, undefined)`, `unlinkTechnique(t, b, undefined)` and `addOperation(name, label, desc)`. The contract test pins that the wrapper sends `null` over IPC.
- **Ruling 4 (spec reading):** the "+" controls on the bands are DOM buttons in the inspector, keyed by the selection:
  - no selection: "+ New operation…";
  - an operation: "+ Domain…";
  - a branch: "+ Technique…".
- **Ruling 2:** toasts go through boot's existing `notice`, so they share `#import-notice` with the import summaries.
- **Accepted:** `InspectorOpts.focusCanvas?`.
- **Ruling 1:** the drag feedback is the scene hook described above.

## Self-check (AGY, `--mode plan`, new conversation `9695ca04-a6a7-456b-b63e-7a52f3db5fdd`)

The verdict, verbatim: **"FAIL"**, with four findings:
1. "`+ Technique…` bypass `run(...)`. On `Err("TaxonomyReadOnly")`, `opts.notice` toast never fire and form stay open … Also `technique-form.ts:34` call `sayError(x)` without `tax`, so `NameTaken:<id>` show "That name is taken." instead of …".
2. "Search filter hide non-matching `<li>` … without unchecking hidden radio or re-checking `okBtn.disabled`."
3. "Click edits … lack in-flight guard. Rapid double-click before IPC resolve fire duplicate API calls and can push extra undo step."
4. "`el.querySelector(".insp-msg")!.textContent = text` throw if `opts.notice` omitted and selection switch to `ref` node …".

Its clean checks, verbatim: "No raw error text reach UI", "No new inline `style=` attribute in markup", "`editable: false` output unchanged (except brief-required `.insp-ro` banner …)", and "scene.ts and tree.ts: drag hint, cursor reset on drop/cancel, live `editing()` check all clean."

I fixed all four in `9e227c3`, with a regression test for each of 1, 2 and 3. Finding 4 is a guarded lookup. AGY was not re-run: one self-check was allowed.

## Concerns

1. **Step 3 manual check not run.** I did not run `tauri dev` on the demo library, so these steps are unverified on the real app:
   - rename Rim light and see the Reference callouts;
   - delete it with its tags moved to Silhouette, then Ctrl+Z;
   - Galaxy edges updating without a reload.

   The data path is unit-tested: `apply` is called once per edit, and `storeSource` refreshes every view. This needs QA (-6a).
2. **The scene drag hint is not tested on the real Pixi canvas.** It is tested only through the fake scene's `onDragOver`/`setDropHint`. The Pixi side is +29 lines, and these are still open:
   - the ring's look;
   - the cursor reset after a drop;
   - a hand-merge with T11's overlay.
3. **O3 is surfaced, not fixed.** An operation move that hits a tag whose branch no longer exists is still refused by Rust. The UI now says why and offers two ways out (retag, or delete with tags). A real fix belongs to the Rust re-key (T9 ruling (a) extended to dangling branches), so it goes to the final review.
4. **No way back to a seed ink.** As the brief specifies, the ink row offers the current ink plus the free extra inks. Once a seed operation takes an extra ink, the picker cannot return it to its seed ink: only Ctrl+Z or `color: null` can. It is a one-line addition if wanted.
5. **Seed techniques can be deleted.** "Delete technique…" is offered for seed techniques as well as custom ones. The brief does not restrict it, and Rust allows it.
6. **Blur on an inline name field cancels the edit** (the brief only says Enter saves and Esc cancels). The definition saves on blur, as specified.
7. **Toast placement.** A taxonomy toast replaces any import summary that is showing in `#import-notice` (the shared notice, ruling 2).
8. **`DOMAIN_ICONS` is duplicated** in TS (`inspector.ts`) and Rust (`commands.rs`). There is no test that ties them together, so they can drift.
9. **A definition blur-save re-renders asynchronously.** When the save's Change arrives between a mousedown and its mouseup on another inspector control, that click can be lost. Name and synonym fields no longer have this problem (`2cd6971`), but the textarea save still re-renders when it lands. Unverified without the real app (QA).
10. **Forms open inside the aside are lost on any store event.** Any store event while the new-technique, new-operation or new-domain form is open re-renders the aside and discards the typed text. Examples are a Ctrl+Z, or an import landing.
11. **The dialogs do not trap Tab.** They declare `role="alertdialog"` and `aria-modal="true"`, take focus, handle Esc, and return focus to the opener, but Tab can leave them. Candidate for Plan 6's accessibility pass.
12. **A stray file.** `.impeccable/hook.cache.json` in the worktree was modified by a hook, not by me. I left it uncommitted.

## Files changed (`41d96ce..HEAD`)

```
 DESIGN.md                            |  48 ++++
 app/src/api.contract.test.ts         |  13 +
 app/src/firstrun.ts                  |   2 +-
 app/src/graph/frame.ts               |   4 +
 app/src/graph/scene.ts               |  29 +-
 app/src/inks.test.ts                 |  94 +++++++
 app/src/styles.css                   |  52 ++++
 app/src/views/inspector-edit.test.ts | 520 +++++++++++
 app/src/views/inspector.ts           | 305 +++++++++-
 app/src/views/move-tags.test.ts      | 123 +++++
 app/src/views/move-tags.ts           | 168 ++++++
 app/src/views/technique-form.ts      |  38 +++
 app/src/views/tree.ts                |  46 +++-
 13 files changed, 1419 insertions(+), 23 deletions(-)
```

---

## Fix round 1/5 (review `task-10-review.md`, Important 1-4)

Commit: `8407d12` on `p3-t10` (parent `2cd6971`). Files: `app/src/views/inspector.ts`, `app/src/views/inspector-edit.test.ts`, `app/src/styles.css` (+309 lines, -63). No Rust change.

### What changed

**I1: a definition save dropped or detached the next action.** I fixed all four failures (a) to (d):
- **(a) A command clicked during a save was dropped.** Edit commands now run in a queue, one per inspector, kept in a `WeakMap` so it outlives a render. A command that arrives while another is in flight waits behind it and is not discarded. Each command has a key, such as `ink:rose` or `description`. A repeat of a pending command, for example a double click, is dropped, so one click is still one undo step.
  - Queued synonym edits now build their list when they run, from the newest taxonomy, and × removes by word. Two quick edits therefore compose instead of the second one undoing the first.
- **(b) A resolved save could detach the pressed button.**
  - While a mouse button is down in the inspector, any render waits.
  - On `mouseup`, the waiting render runs after the click has been dispatched (`setTimeout`), using the newest arguments.
  - A real render clears any waiting one, so a selection click is never undone by an older render.
- **(c) A save or other store event wiped what was open.** When a re-render keeps the same selection, what is open survives:
  - **Slot forms** (new technique, new operation, new domain) are moved across whole, with their nodes, listeners and typed text.
  - **The "Also use under…" and "+ Domain…" pick lists** are rebuilt from the new data.
  - **An open name or synonym field** is reopened with its typed value and its error line.
  - **Unsaved text in a focused definition textarea** is kept.
  - A field that is saving carries `data-saving` and is not reopened after its own save.
  - A `blur` or `change` caused by the `innerHTML` rewrite itself is ignored (`rewriting` guard), so a store event never saves half-typed text.
  - On success, a pick list or form closes itself. A `TaxonomyReadOnly` refusal clears the slot and reverts the view.
- **(d) Tab out of the definition sent focus to the title.** With the same selection, focus goes back to the element that had it, if that element is still attached (as with a moved slot). Otherwise it goes to the control with the same `data-*` key (`data-field`, `-edit`, `-act`, `-sel`, `-ink`, `-icon`, `-unlink`, `-link`, `-add-branch`, `-syn-add`, `-syn-del`, `-open` or `-cancel`), and failing that to the title. A new selection still focuses the title, as before.
- A naming clash found while fixing: the slot first marked its kind with `data-open`, which the inspector's click handler reads as "open a reference". It is now `data-slot`.

**I2: name and synonym fields discarded typed text on blur.** A blur with a changed value now saves. An unchanged value, or a blank or duplicate synonym, cancels in place. Esc still cancels.

**I3: no way back to a seed ink.** I followed the controller's ruling (a plan amendment). For an operation in `SEED_INK` whose `color` resolves to an extra ink, the row adds the seed swatch, which sends `updateOperation(id, { color: null })`.
- Rust check: `OperationPatch.color` is `Option<Option<String>>` with `double_option`, and the doc comment says "Absent keeps it, `null` resets it (the seed ink by id, or neutral)". The existing cargo test at `commands.rs:3877` asserts that `{"color": null}` becomes `None`. No Rust change was needed.

**I4: the current ink was not resolved through `opInk`.** Every swatch's colour is now `opInk(...).base`, set through the CSSOM as `--c`:
- the current swatch uses `opInk(tax, op.id)`;
- the seed and free swatches use `opInk` of the same operation with `color` replaced.

I removed the copied precedence branch and the nine `.insp-ink[data-swatch=…]` CSS rules. `.insp-ink` now reads `background: var(--c, var(--ink-2))`. Each label comes from the resolved base (`INK_NAME`: `var(--diff)` gives "Amber", and so on).

**Minors:** none fixed, as instructed. M1 (the field freezing while busy) no longer happens: `run` refuses only a repeat of a pending command with the same key, and a field's own blur and Enter are already guarded by `busy`.

### Covering tests (new or changed, in `app/src/views/inspector-edit.test.ts`)
- `a command clicked while a definition save is pending is queued, not dropped (I1a)`: a textarea `change` with a pending mock, then a swatch click; `updateOperation` is called a second time with `{ color: "rose" }` after the first save resolves, and `apply` is called twice.
- `a form opened while a save is pending survives the save's re-render, with its text (I1c)`: here `apply` re-renders. The "+ Technique…" form opened mid-save keeps its typed name and its focus (the same node), and it still submits `addTechnique`.
- `an open name field and unsaved definition text survive a store event (I1c)`: the field's value and focus survive, no save happens, and the textarea's unsaved text and focus survive.
- `focus comes back to the control that had it, by its key (I1d)`: on the same selection, a re-render keeps focus on the olive swatch. A new selection focuses the title.
- `a render waits while the mouse is down in the inspector, so the click lands (I1b)`.
- `a blur with a changed name saves it; Esc still cancels (I2)`: the same for a synonym.
- `a seed operation on an extra ink can take its seed ink back (fix I3)`: Rose is current, then Amber (`--c: var(--diff)`) sends `color: null`.
- `ink_picker_lists_free_inks`: now asserts `--c` from `opInk` and no `data-swatch` (I4).
- `a second click while a command is in flight sends nothing`: one flush was added, because the queued call goes out on the next microtask.
- `move-tags.test.ts` and `inks.test.ts` pass unchanged. The ink tokens did not change; only the swatch CSS rules did.

### Commands and output (`app/`, at `8407d12`)
```
npx tsc --noEmit -p .        -> (no output, clean)
npx vitest run               -> Test Files  38 passed (38)
                                Tests  439 passed (439)
npm run build                -> ✓ built in 409ms   (only the existing large-chunk notice on lib)
```

### Concerns after this round
- The mouse-down render hold and the focus restore are tested in jsdom only. I have not checked them on the real app, so they need QA, as does Step 3.
- `renderInspector` grew by about 60 lines (review M9 is deferred to the final review).
- When the selection changes, open slot forms are still discarded by design: a new selection means new content.

---

## Fix round 2/5 (re-review `task-10-rereview-1.md`, New Breakage N1-N2)

Commit: `eb319f9` on `p3-t10` (parent `8407d12`). Files: `app/src/views/inspector.ts` and `app/src/views/inspector-edit.test.ts`. No Rust change. The minors M-a to M-e are deferred, as instructed.

### What changed
- **N1: restored definition text never saved.**
  - **Cause:** the definition saved only through `el.onchange`. Text that a same-selection re-render puts back is set by script, and browsers fire no `change` for it.
  - **Fix:** the textarea now also saves on its own `blur`. Each render sets `textarea.onblur`, and the save runs when the value differs from the stored description. This is the same comparison the inline fields use.
  - `change` still saves too. A `change` followed by its `blur` shares the queue key `description`, so it is one save and one undo step.
  - A blur that the `innerHTML` rewrite itself causes is ignored (the `rewriting` guard), as before.
- **N2: the mouse-down render hold could stick.** The hold now ends at any end of the press, and the handler releases at most once:
  - `mouseup`, `dragend` and `pointercancel` on the document (capture);
  - `blur` on the window (a swallowed mouseup).

  After a release, the held render still runs after the click.

  While editing, the thumbnail `<img>` elements get `draggable = false` through the DOM property. The markup string is unchanged, so `editable: false` output (Radial) stays byte-identical.

### Covering tests (`app/src/views/inspector-edit.test.ts`)
- `restored definition text saves on blur, with no change event (fix N1)`:
  - Type, then a store event puts the text back, then `blur()` with no `change`: `updateTechnique(id, { description })` is called once.
  - Then `change` followed by `blur` is still one save (2 calls in all).
- `a native drag's end, a cancelled pointer or a window blur releases the render hold (fix N2)`:
  - Thumbnail images are present and none is draggable.
  - For each of `dragend`, `pointercancel` and window `blur`: mousedown, then a render is held (the old title node stays), then the end event, then the held render applies (the title reads "Infer").

### Commands and output (`app/`, at `eb319f9`)
```
npx tsc --noEmit -p .        -> (no output, clean)
npx vitest run               -> Test Files  38 passed (38)
                                Tests  441 passed (441)
npm run build                -> ✓ built in 422ms
```

### Concerns
- The hold and the restore are still tested in jsdom only, not on the real app (QA, with Step 3).
