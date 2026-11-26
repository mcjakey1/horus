### Task 4: Links you draw yourself (the Links tab, the editor, linked-first Ranked)

**Files:**
- Create: `app/src/links/editor.ts`, which also holds `linkedFirst` [C16].
- Modify:
  - `app/src/reference/view.ts` (Plan 1 Task 8);
  - `app/src/styles.css` (append a "Plan 4 Task 4" section) [R25].
- Test:
  - `app/src/links/editor.test.ts`;
  - new cases in `app/src/reference/view.test.ts`.

**Interfaces:**
- Consumes `store.linksFor`, `api.addLink`, `api.updateLink` and `api.removeLink` (Task 3).
- The store-fed Reference view `mountReference(root, api, store, opts)` has landed (`reference/view.ts:24`) [C5].
- Produces:
  ```ts
  export function mountLinkEditor(root: HTMLElement, api: Api, store: Store,
    opts: { fromRef: string; toRef?: string; linkId?: string }): { close(): void };
  export function linkedFirst(related: Scored[], links: Link[], focus: string): { linked: { link: Link; other: string; score?: number }[]; rest: Scored[] };
  ```
- **Refresh** [R7]: `touchesFocus` (`reference/view.ts:611-628`) also returns true when the event carries `links` or `scope`. Otherwise a links-only `Change` refreshes neither the Links tab nor Ranked.
- **The Links tab** already lists links read-only (`reference/view.ts:318-329`; `index.html:55`, `:59`) [C6]. It now lists `store.linksFor(focus)`. Each row shows the other reference's tile, title and `why`, and gains Edit and Delete controls. The badge shows the count. "+ Link to…" opens the editor.
- **The editor:**
  - When `toRef` is empty, a combobox lists the references by title and note. It is filtered in TypeScript, excludes the focused reference and the references already linked to it, and works with ↑ ↓ Enter.
  - A "Why are these connected?" textarea is required, and Save stays disabled until it has non-whitespace text.
  - A `DuplicateLink:<id>` error switches the editor to that link, with "These two are already linked — edit the note instead.", and keeps the typed text in the textarea (Review Focus 4).
  - The other codes map to copy: `SelfLink` gives "A reference can't link to itself.", and `EmptyWhy` gives "Say why these are connected." Any other error gives "That change didn't save. Try again."
- **Drawing a link:** a small link handle can be dragged onto any element with `[data-ref-id]` in the view. Dropping it opens the editor with `toRef` set. Keyboard equivalent: `k` opens "+ Link to…".
  - The handle is appended to `#lab`, like `.tag-open` (`reference/view.ts:562`), because `#plate` re-renders [R14].
  - **Drop targets:** the tiles that can receive a link (the Ranked and Links rows, and callout thumbnails) gain `data-ref-id`, next to their existing `data-go`. No non-test code carries `[data-ref-id]` today [R14].
  - The drag uses **pointer events**: `pointerdown` on the handle, `setPointerCapture`, then `pointermove` draws a leader line to the pointer.
  - On `pointerup`, `document.elementFromPoint(x, y)?.closest("[data-ref-id]")` picks the target.
  - Esc or `pointercancel` aborts. HTML5 `draggable` is never used (Global Constraints, audit #2).
- **The Ranked list (SPEC §4)** is `#pane-ranked` (`index.html:54`, `:58`), which the old text called "the Related list". It already renders link rows first (`"your link"`, `reference/view.ts:285-291`) through a private `linksOf` (`:312-316`), without de-duplication [R12].
  - Replace both the existing link rows and `linksOf` with `linkedFirst(S.related, store.linksFor(focus), focus)`.
  - A "Linked by you" group comes first. It holds every linked reference, with its `why` and its score shown small, or "not related by technique" when there is none. Then come the scored references, with the linked ones removed, so no reference appears twice. Links never change a score.
  - **"Always shown"** [R13]: the "Linked by you" group stays while a technique filter is on (today `reference/view.ts:286-287` hides links under a filter), and under board scope (Task 5). Only the scored rows filter.
- New tiles follow the "no new inline `style=`" rule: `tileBox` plus `style.setProperty` [R26].

- [ ] **Step 1: Write the failing tests**
  - `linkedFirst`:
    - With related `[B 0.6, C 0.4]` and a link A–C, the result is `linked: [C with score 0.4]` and `rest: [B]`.
    - A link to D, which is not in related, gives `linked` containing D with `score` undefined.
  - Editor:
    - Save is disabled for `"   "`.
    - Saving calls `addLink(A, B, "same raking light")`.
    - A fake reply of `DuplicateLink:L1` shows the exact copy, switches to edit mode for L1, and keeps "same raking light" in the textarea.
    - The combobox omits A and any reference already linked to A.
  - `view.test.ts`:
    - The Ranked pane renders the "Linked by you" heading before the first scored row, and a linked reference that also scores appears once.
    - With a technique filter on, the "Linked by you" rows are still there.
    - A links-only `Change` re-renders the Links tab.
    - Deleting a link row calls `removeLink(L1)`.
    - `link_handle_pointer_drag`:
      - Dispatch `pointerdown` on the handle, `pointermove`, then `pointerup` over a `[data-ref-id="B"]` tile, with `elementFromPoint` stubbed. The editor opens with `toRef: "B"`.
      - The same sequence ending over empty space opens nothing.
      - With a spy on `EventTarget.prototype.addEventListener` installed before mount, no `dragstart` listener is registered [C30].

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- links` and `npm test -- reference`. They should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): draw, edit and delete links with a why note, listed first`.

---

