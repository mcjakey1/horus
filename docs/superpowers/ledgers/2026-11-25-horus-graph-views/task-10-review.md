### Spec Compliance
- ❌ Issues found:
  - **Global constraint (Operation-Only Chroma).** The current ink swatch works out its colour by copying `opInk`'s precedence rules, not by calling `opInk` (Important #4).
  - **Plan-mandated.** The brief's "current ink plus the free EXTRA_INKS" means a seed operation that takes an extra ink is never offered its seed ink again (Important #3).
- Everything else matches the brief and the rulings:
  - **Signatures and options.**
    - `openMoveBranches`, `mountTechniqueForm(host, api, branchId)` and `openMoveTags` match the brief.
    - `renderInspector`'s signature is kept. Only optional `InspectorOpts` members were added (`api`, `apply`, `notice`, `focusCanvas`), and `assetUrl` is still passed.
  - **Rulings 1 to 4.**
    - Ruling 1: the scene drag hook is +29 lines. It adds optional members only and changes no existing Scene member.
    - Ruling 2: boot() changes in one line and passes `notice`.
    - Ruling 3: `undefined` is passed for the brief's null arguments, and a new contract test pins `null` over IPC.
    - Ruling 4: the "+" controls are DOM buttons keyed by the selection.
  - **Read-only mode.**
    - The Tree passes `editable: false`, and the note carries `role="status"`.
    - A read-only refusal shows a toast.
    - The `setDraggable` predicate reads the flag live, so a read-only library pans.
    - The controls come back when the flag flips.
  - **Dialogs.**
    - Move-tags: the title, the targets, the search, the partial option and the button labels match the brief. Nothing is pre-selected, and the confirm button stays disabled until a choice is made.
    - The operation and domain delete dialogs show the counts.
  - **Carry-ins.**
    - The madePartial notice is in.
    - EmptyName, BadMoveTarget, `unknown <kind>` and O3 have readable copy, and a generic fallback means raw text is never shown.
    - N3, "Also use under…", is tested through `domainChoice`.
  - **Inks.**
    - The tokens are copied exactly, and DESIGN.md has the table and the B7 delta.
    - `inks.test.ts` asserts all of the following, in both themes:
      - -on ≥ 4.5 for the 5 extra inks;
      - -text against the panel ≥ 4.5 for all 9 inks;
      - the seed -on values pinned, with the 4.37 comment;
      - ΔE2000 ≥ 15 for every pair;
      - Sharma's three pairs.
  - **Other constraints.**
    - No new `style=`: swatches use attribute selectors, and the cursor goes through the CSSOM.
    - Pixi stays inside scene.ts.
    - The new DOM tests start with the jsdom header.
    - Undo key safety: `keys.ts:45` stands down while a `role="alertdialog"` is present.
  - "+ New operation…" combines the brief's "+" band control with its quoted "New operation…", which is a fair reading of ruling 4. It is not counted as a miss.
- ⚠️ Cannot verify from the diff:
  - The Step 3 manual check was not run: rename, delete with a move to Silhouette, Ctrl+Z, Galaxy edges.
  - The real Pixi drag ring and the cursor reset after a drop are tested only on the fake scene.
  - The read-only note may be re-announced. The same node is detached and re-inserted on every render (`app/src/views/inspector.ts:191`, `:193`), and some assistive technology treats that as a new live region.

Review method: the diff was read in three passes. Pass 1 covered DESIGN, the contract test, firstrun, frame, scene, inks and styles. Pass 2 covered inspector.ts. Pass 3 covered the tests, move-tags, technique-form and tree. Focused checks outside the diff, one per named risk:

| File checked | Risk | Result |
|---|---|---|
| `app/src/ops.ts:22-27` | the swatch copies `opInk` | It does. |
| `api.ts:247` and `commands.rs:1174` | `addDomain` without an icon | Accepted: `icon ?? null`, `Option<String>`. |
| `edit.rs:198-210` and the `InUse` call sites | the O3 regex against the real Display text | Checked. |
| `keys.ts:45` | the alertdialog guard | Present. |
| `data.ts:37-44` and `store.ts:48-55` | how a Change reaches the Tree | `apply` → `emit` → `storeSource` → the Tree's `subscribe` → `render()`, all synchronous. |
| `taxonomy.json:1034` | does rim-light have one link? | Yes, one. |

### Strengths
- **One path for command results.** The `run` helper handles every result: it applies the Change, says the madePartial copy, reverts after a read-only refusal, routes field errors, and guards against a double click. `sayError` never shows raw text: it has a fixed table, names the owner for `NameTaken`/`LabelTaken`, and falls back to a generic line.
- **Inline fields.** `inline()` cancels in place (`input.replaceWith(anchor)`) instead of re-rendering, so a blur never detaches the control being clicked.
- **Dialogs.** They mount beside the aside, so an inspector re-render can't destroy them. As `alertdialog`, they make `wireUndoKeys` stand down (verified at `keys.ts:45`). A search that hides the chosen target unchooses it.
- **`inks.test.ts`.** It parses the shipped stylesheet, and it proves its ΔE helper against Sharma's published pairs, so it cannot pass vacuously.
- **Tests.** They drive real DOM events through the real inspector and Tree; only the api and the scene are faked. They assert call arguments, apply counts and focus (`isTextEntry`).
- **Scene hook.** It is small and additive, clears on both drop and pointercancel, and draws through the existing `ring()`.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
1. **A definition save drops or detaches the artist's next action, and wipes what they open next.**
   - Where: `app/src/views/inspector.ts:397-403` (`el.onchange`), with `run`'s guard at `inspector.ts:231` and `hadFocus` at `inspector.ts:189`/`:194`.
   - A textarea's `change` fires on blur, so the save starts on the mousedown of the next control. That makes four failures, and none depends on timing:
     - **(a) Command click dropped.** While the save is pending, `inFlight.has(el)` is true, so a click on a command (an ink, an icon, the × on a synonym, an unused unlink, an "Also use under" pick) goes to `run`, which returns `false` silently. The click is lost, with no message.
     - **(b) Click detached.** If the save has already resolved, `apply` re-renders the aside synchronously (`innerHTML`). The pressed button is replaced, and the click reaches no handler.
     - **(c) Opened form wiped.** A click that doesn't go through `run` survives, and the save then wipes what it opened: an inline name field, the "Also use under…" list, "+ Technique…", or the new-domain and new-operation forms. Any text typed there is lost (lost user input). Any other store event does the same, such as an import landing (report concern 10).
     - **(d) Tab focus to the title.** Tab from the definition to the next control saves, and the re-render's `hadFocus` sends focus to `.insp-title`. Every Tab out of the definition loses the artist's place.
   - Why it matters: "edit the definition, then do the next thing" is the main editing flow. Holding the re-render until pointerup is not enough, because (a) drops the command outright.
   - Fix, two parts:
     - queue a command that arrives while another is in flight (chain it onto the pending promise) instead of discarding it;
     - don't rebuild open controls under the artist: keep `.insp-slot` and an open inline field across a re-render (or patch the changed text in place), and give focus back to the control that had it, by its `data-*` key.
   - Regression test in jsdom: fire a textarea `change` with a pending mock api, then click a swatch, and assert that `updateOperation` is called once the first save resolves. Also open the technique form while a save is pending, resolve the save, and assert that the form and its text survive.
2. **Name and synonym fields discard typed text on blur.**
   - Where: `inspector.ts:304` (`input.onblur = () => void (busy || cancel(false))`).
   - The brief says only that Enter saves and Esc cancels. Clicking away after typing silently loses the text, while the definition next to it saves on blur. The behaviour is inconsistent and loses user input. The stated reason (avoiding the click-detach bug) does not lower the severity.
   - Fix: once #1's queueing and in-place handling exist, let a blur with a changed value save, as the definition does. Esc still cancels.
3. **Plan-mandated: a seed operation that picks an extra ink can never get its seed ink back from the picker.**
   - Where: `inspector.ts:135-140`.
   - `free` lists only `EXTRA_INKS`. Once `color` is set, the seed swatch is gone. Only an immediate Ctrl+Z can return Differentiate to Amber, so after any later edit the DESIGN.md seed ink is lost through an ordinary UI action (report concern 4).
   - Fix: for an operation in `SEED_INK` whose `color` is an extra ink, add its seed swatch to the row, sending `color: null`. Confirm with one check that Rust's `update_operation` takes `null`.
   - Raise this with the controller as a plan amendment.
4. **Global constraint: the current ink is not resolved through `opInk`.**
   - Where: `inspector.ts:130-134` re-implements `opInk`'s precedence (`ops.ts:22-27`): an extra `color` first, then `SEED_INK[op.id]`, then neutral. The colour then comes from nine `.insp-ink[data-swatch=…]` rules in `styles.css`.
   - The constraint says every operation ink resolves through `opInk(tax, opId)`. Behaviour is the same today, but this copy drifts the first time `opInk` changes (for example, with #3's fix).
   - Fix: set `--c` on the current swatch through the CSSOM from `opInk(tax, op.id).base`, as the tile region already does, and set each free swatch to `var(--x-<k>)` the same way. Then the copied branch and the `data-swatch` rules can go.

#### Minor (Nice to Have)
1. **An inline field can freeze.**
   - Where: `inspector.ts:297-302`.
   - When `run` returns `false` because another command is in flight, `busy` stays `true` and `fieldErr` is never called. Enter, Esc and blur are then all ignored until a re-render. #1's queueing removes the cause; otherwise, reset `busy` on a `false` result.
2. **Every `InUse` refusal gets the O3 sentence.**
   - Where: `app/src/views/move-tags.ts:41-43`.
   - `still in use: <id>` also comes from stale-snapshot races: an "unused" technique delete (`edit.rs:515`), or an unlink, whose id is `link a -> b` (`edit.rs:656`). The copy then claims that tags "point at a technique or domain that no longer exists" and names "it". It is readable, but misleading.
   - Fix: use the O3 sentence only when the id is an operation or domain id. Otherwise use the NeedsMove copy.
3. **The last-link test can pass vacuously.**
   - Where: `app/src/views/inspector-edit.test.ts:210`.
   - `?.disabled ?? true` passes if the button doesn't exist. It is the only test of the last-link rule. The fixture does give rim-light exactly one link (`taxonomy.json:1034`), so the assertion is true today.
   - Fix: assert that the button exists, then that it is `disabled`.
4. **The dialogs don't trap Tab, and they use a stale snapshot.**
   - Where: `move-tags.ts:70-117` (`sheet()`).
   - The sheet declares `aria-modal="true"`, but Tab reaches the canvas and the aside behind it. Clicking the backdrop drops focus to body, and then Esc does nothing.
   - The targets come from the snapshot taken when the dialog opened. That is safe, because Rust re-validates the move.
   - Log it for Plan 6's accessibility pass.
5. **`DOMAIN_ICONS` is duplicated.**
   - Where: `inspector.ts:35-44`, mirroring `commands.rs`.
   - No test ties the two together. `inks.test.ts` already reads files with `node:fs`, so a 5-line test could compare the 8 strings against `src-tauri/src/commands.rs`.
6. **Copy.**
   - `FIXED.TooManyOperations` hard-codes "9" (`move-tags.ts:19`), while the button uses `${MAX_OPS}`.
   - A duplicate or blank synonym is cancelled with no message (`inspector.ts:317`).
7. **The new-domain form never asks for an icon.**
   - Where: `inspector.ts:393`, which calls `addDomain(name, desc, undefined, opId)`. The brief's signature names an icon.
   - Rust accepts `None`, and the icon can be set afterwards with the picker. Record it as a deviation.
8. **Esc doesn't close the technique form or the slot forms.**
   - Where: `app/src/views/technique-form.ts` and `inspector.ts` `form()`. Only Cancel closes them.
9. **File growth.**
   - `renderInspector` is now about 330 lines: one function with nested `inline`, `editClick` and `form` closures, rebuilt on every render. `inspector.ts` is 404 lines in all.
   - That is within the brief's file plan, but the edit half (`inspector.ts:222` onward) would read better as its own module, for example `wireInspectorEdit(...)`.
   - The first line of the `tree.ts` header comment is now about 160 characters (`app/src/views/tree.ts:2`).

### Assessment
**Task quality:** Needs fixes
**Reasoning:** The build is solid and well tested, and it meets the brief and the rulings almost everywhere. It cannot be trusted yet: a definition save silently drops or detaches the artist's next action and wipes forms they open, a name typed and then clicked away from is discarded, and the ink row both bypasses `opInk` and strands a seed operation away from its seed ink. Each fix is small.
