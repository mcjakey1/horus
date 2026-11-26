### Task 10: Taxonomy editing in the Tree inspector  ⚑ needs Task 6 and Task 9

**Files:**
- Modify:
  - `app/src/views/inspector.ts`;
  - `app/src/views/tree.ts`;
  - `app/src/firstrun.ts` `boot()`: pass `api` and `store.apply` to the Tree (one line);
  - `DESIGN.md`: add "Extra operation inks" (the table below) and the light Group Green `-on` delta (ruling B7);
  - `app/src/styles.css`: add the `--x-*` ink tokens for both themes.
- Create:
  - `app/src/views/move-tags.ts`, the move dialogs;
  - `app/src/views/technique-form.ts`, Plan 3's own small "new technique" form (Cross-plan audit row 6; the picker exports only `mountPicker`, `picker.ts:31`).
- Test:
  - `app/src/views/inspector-edit.test.ts`;
  - `app/src/views/move-tags.test.ts`;
  - `app/src/inks.test.ts`.
- Not here any more (ruling B1): `data.ts` and `storeSource`, built in Task 2, and the `main.ts` edit (ruling B2). `boot()` already hands every view `storeSource(store)`, so every applied `Change` refreshes the Tree, Galaxy and Radial views.

**Interfaces:**
- Consumes the Task 9 commands through `api`; `Store`, `Change` and `store.apply` (Plan 2); `storeSource` and `Snapshot` (Task 2); and `renderInspector` and `InspectorOpts` (Task 6).
- **`renderInspector`'s signature is kept,** because Task 8 calls it. `InspectorOpts` gains only optional members, `api?: Api` and `apply?(c: Change): void`, which the editing controls require; with `editable: false` they are never read. Every successful edit command's `Change` goes to `apply` (`store.apply`).
- Produces:
  ```ts
  export function openMoveBranches(host: HTMLElement, ctx: { s: Snapshot; kind: "op" | "domain"; id: string }):
    Promise<OpMove | DomainMove | null>;
  export function mountTechniqueForm(host: HTMLElement, api: Api, branchId: string): void;   // calls api.addTechnique({ name, description, operationId, domainId }) — C17: no second argument; the wrapper sends tag: null
  export function openMoveTags(host: HTMLElement, ctx: { s: Snapshot; techId: string; branchId?: string /* unlink */ }):
    Promise<TagMove | null>;   // null = cancelled
  ```
- **Read-only taxonomy (Plan 2's fallback):**
  - When `snapshot.taxonomyReadOnly` is true, the Tree renders the inspector with `editable: false`. Inline editing, the ink and icon pickers, every "Delete…" button, the "+" on the bands and drag to link are all absent or disabled, and dragging a technique pans instead.
  - A note at the top of the inspector reads "The technique list is read-only because taxonomy.json is damaged." (Plan 2's copy). With `role="status"`, it is announced once.
  - Any edit command that still returns `Err("TaxonomyReadOnly")` (a race with a reload) shows the same sentence as a toast, and the UI state is left unchanged.
- **With `editable: true`, the inspector offers:**
  - **Name:** click to edit inline. Enter saves through `updateTechnique` or `updateDomain`; Esc cancels. A `NameTaken:<id>` error shows "That name is taken by <Name>." beside the field. After Enter saves, focus leaves the field (back to the canvas), so the next Ctrl+Z is a library undo, not the field's text undo (C19; `wireUndoKeys` skips text fields, `keys.ts:44`).
  - **Definition:** a textarea that saves on blur.
  - **Synonyms:** chips. "+ synonym" adds one, × removes one, and each change saves.
  - **"Used under":** each parent has an "×". When any tag uses that pair, it unlinks through the move-tags dialog; when none does, it calls `unlinkTechnique(t, b, null)` directly (R20).
  - **"Delete technique…":** a confirmation. Anything in use goes through the move-tags dialog first.
  - **Operations (decision 1):**
    - the name, plain label and description are editable inline;
    - **ink:** a swatch row of the operation's current ink plus the free `EXTRA_INKS`, each with its name as an `aria-label`;
    - "Delete operation…" opens `openMoveBranches`. Its options are "Move its branches and tags to <operation>", which re-keys them, and "Delete them and their tags". The second states the counts: "N tags on M references, K techniques left with no other place".
  - **Domains (decision 2):** name, description and an icon picker over `DOMAIN_ICONS`, which shows each description as text until Plan 6 draws the glyphs. "Delete domain…" opens `openMoveBranches` with "Move to <domain>" or "Delete; tags become partial".
- **Drag to link (S3, folded into R20):** SPEC §5's "drag a technique onto a domain to re-link it" is read as "link it again": the drag **adds** a link, and removal is the "×" on "Used under". A move is two undo steps; a move-on-drag would need a new command, which nobody asked for. Recorded as a spec reading for the controller. Dragging a technique node onto a branch node calls `linkTechnique`. While dragging, a valid target outlines in its operation ink, and an invalid target (already linked) shows `not-allowed`. Keyboard alternative: "Also use under…" in the inspector opens a branch list.
- **"+" on the bands:**
  - On the technique band of a branch, it opens `mountTechniqueForm` with that branch fixed (audit row 6: Plan 2's form lives inside `mountPicker` and isn't exported).
  - On the domain band of an operation, it lists the domain types not yet used under that operation, plus "New domain type…", which calls `addDomain(name, description, icon, operationId)`: one call, one undo step.
  - **On the operation band:** "New operation…" asks for a name, plain label and description, then calls `addOperation`. It is disabled at `MAX_OPS`, with the title "Up to 9 operations".
- **The move-tags dialog:**
  - The title reads "N references use <Technique>". For an unlink it reads "N references use <Technique> under <Op · Domain>".
  - Option 1, "Move them to…", lists every linked (technique, branch) pair as "Technique — Op · Domain", except the technique being deleted (or the pair being unlinked), with a search. A moved tag takes the chosen branch's operation (Task 9).
  - Option 2 is "Keep them as partial tags (operation only)".
  - The buttons are "Move and delete" (or "Move and unlink") and "Cancel".
  - Neither option is pre-selected.
- **Undo:** after any edit, Ctrl+Z (Plan 2's undo keys) reverts it, and the Tree, Galaxy and Radial views refresh through `storeSource`.
- **Extra operation inks (decision 1):**
  - DESIGN.md gains a named set of five inks: Teal (HSL hue 180°), Olive (70°), Rose (335°), Indigo (246° light, 255° dark; kept clear of Iris's purple, about 285°) and Umber (25°, darker and less saturated than Vermilion).
  - Each has a light and a dark base, a `-text` and an `-on` variant, written as `--x-<name>`, `--x-<name>-text` and `--x-<name>-on`.
  - The Operation-Only Chroma Rule is unchanged: these inks only ever name an operation.
  - **The values (chosen by the plan amender; AGY-checked; retune if the user dislikes them).** They were computed with a script (WCAG 2 relative-luminance contrast; CIEDE2000 on sRGB → CIELAB D65, checked against Sharma's published test pairs). Light `--panel` is `#FAFAF9` and dark `--panel` is `#1B1B1B`. "Min ΔE" is against the other 8 bases of the same theme, seed inks included:

    | Theme | Ink | `--x-<name>` | `-text` | `-on` | `-on` / base | `-text` / panel | Min ΔE2000 (nearest) |
    |---|---|---|---|---|---|---|---|
    | light | teal | `#089B9B` | `#066B6B` | `#161616` | 5.32 | 6.05 | 18.5 (group) |
    | light | olive | `#6A7A1A` | `#455011` | `#FFFFFF` | 4.76 | 8.35 | 18.9 (group) |
    | light | rose | `#BC4E7B` | `#9B3B63` | `#FFFFFF` | 4.65 | 6.28 | 24.2 (infer) |
    | light | indigo | `#8C84DB` | `#675DD0` | `#161616` | 5.55 | 4.96 | 18.3 (seq) |
    | light | umber | `#815637` | `#5D3E28` | `#FFFFFF` | 6.33 | 9.20 | 18.8 (infer) |
    | dark | teal | `#0ABDBD` | `#0BDADA` | `#161616` | 7.78 | 9.89 | 18.1 (group) |
    | dark | olive | `#9AA951` | `#A7B464` | `#161616` | 7.04 | 7.67 | 18.5 (group) |
    | dark | rose | `#ED7EAC` | `#F098BD` | `#161616` | 7.05 | 8.15 | 21.8 (indigo) |
    | dark | indigo | `#B7A4EF` | `#CBBEF4` | `#161616` | 8.25 | 10.02 | 18.5 (seq) |
    | dark | umber | `#A67E59` | `#B08E6D` | `#161616` | 4.95 | 5.69 | 18.8 (infer) |

    Teal, Indigo (light) and Olive, Rose, Umber (light) take `-on` `#161616` and `#FFFFFF` respectively, whichever reaches AA on that base; every dark `-on` is `#161616`, as for the dark seed inks. The smallest pairwise ΔE2000 over all 9 bases is 18.3 in light (Sequence Blue / Indigo) and 18.1 in dark (Group Green / Teal); the floor is 15.
  - **The seed inks (ruling B7).** Measured: light `-on`/base 5.23 (diff), **4.37 (group)**, 5.56 (seq), 4.52 (infer); dark 8.20, 6.63, 5.56, 5.81; `-text`/panel 6.25–9.14 in both themes. Light Group Green `-on` (`#161616` on `#1E8E5A`, 4.37:1) is under AA. It is **not changed now**, because that is a visible change to a seed ink: DESIGN.md records it as a delta, carried to Plan 6 for a design decision.

- [ ] **Step 1: Write the failing tests**
  - `rename_inline_calls_api`: editing the name and pressing Enter calls `updateTechnique(id, { name })` once. Esc calls nothing.
  - `name_taken_message`: when the fake api rejects with `"NameTaken:pop-out"`, the inspector shows "That name is taken by Pop-out."
  - `delete_in_use_opens_dialog`: deleting a technique used by 2 references opens the dialog with "2 references use Rim light". Choosing "Keep them as partial tags" calls `deleteTechnique(id, { kind: "partial" })`. An unused technique calls `deleteTechnique(id, null)`.
  - `delete_unused_skips_dialog`: an unused custom technique deletes after the confirmation only.
  - `move_targets_exclude_self`: the dialog lists every linked pair except those of the technique being deleted. For an unlink, only the unlinked pair is excluded.
  - `no_default_choice`: the confirm button stays disabled until an option is chosen.
  - `edit_applies_change`: a successful `updateTechnique` passes its `Change` to `opts.apply` once.
  - `unlink_unused_pair_skips_dialog`: "×" on a pair no tag uses calls `unlinkTechnique(t, b, null)` and opens no dialog.
  - `enter_save_leaves_field`: after Enter saves a name, `document.activeElement` is not a text field.
  - `drop_on_branch_links`: dispatching the drag sequence from `tech:X` to `br:group.semantic` on the fake scene calls `linkTechnique("X", "group.semantic")`.
  - `new_operation_flow`: "New operation…" with name "Unsettle" and label "Make it uneasy" calls `addOperation("Unsettle", "Make it uneasy", "", null)`. The button is disabled when 9 operations exist.
  - `ink_picker_lists_free_inks`: with Teal taken, the picker offers Olive, Rose, Indigo and Umber, plus the current ink. Choosing Rose calls `updateOperation(id, { color: "rose" })`.
  - `delete_operation_dialog`: in-use deletion shows both options with counts. Neither is pre-selected, and choosing "Move… to Stand out" calls `deleteOperation(id, { kind: "operation", operationId: "differentiate" })`.
  - `read_only_disables_editing`: with `taxonomyReadOnly: true`:
    - the inspector shows the read-only note;
    - it has no enabled `input`, `textarea`, "Delete…" or "+" controls;
    - `setDraggable` is never true for `tech:` nodes;
    - when the source flips to `false`, the controls return.
  - `read_only_error_toast`: when the fake api rejects `updateTechnique` with `"TaxonomyReadOnly"`, the toast shows "The technique list is read-only because taxonomy.json is damaged.", and the inline field reverts to the stored name.
  - `technique_form_calls_add`: the form calls `api.addTechnique({ name, description, operationId, domainId })` (one argument, C17) with the fixed branch's operation and domain.
  - `inks_contrast_and_distinct`, in `inks.test.ts` (Node), reads `styles.css` with `fs` and parses the `:root` and `:root[data-theme="dark"]` blocks. In both themes (ruling B7):
    - for the 5 extra inks, `-on` against the base is at least 4.5:1;
    - for all 9 inks, `-text` against `--panel` is at least 4.5:1;
    - the 4 seed `-on` values are pinned as they stand (`#161616` or `#FFFFFF`, exactly as in `styles.css` today), with a comment naming the light Group Green 4.37:1 DESIGN delta carried to Plan 6;
    - every pair of the 9 bases differs by at least ΔE2000 15;
    - the CIEDE2000 helper itself passes Sharma's test pairs, given as Lab inputs: (50, 2.6772, −79.7751) vs (50, 0, −82.7485) → 2.0425; (50, 2.5, 0) vs (73, 25, −18) → 27.1492; (60.2574, −34.0099, 36.2677) vs (60.4626, −34.1751, 39.4387) → 1.2644, each within 1e-4, so the ΔE check cannot pass vacuously.

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- views/ inks`. It should FAIL, then PASS. Then run `npm test` and `npm run build`.

- [ ] **Step 3: Manual check**

  On the demo library:
  1. Rename *Rim light*. The Reference view's callouts show the new name.
  2. Delete it, moving its tags to *Silhouette*.
  3. Ctrl+Z. The technique, its links and its tags are all back.
  4. The Galaxy's edges update without a reload.

- [ ] **Step 4: Commit**

  Commit message: `feat(ui): taxonomy editing in the Tree inspector with tag moves`.

---

