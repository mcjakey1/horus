### Task 7: The Compare view

**Files:**
- Create: `app/src/compare/view.ts` and `app/src/compare/sides.ts`.
- Modify:
  - `app/src/reference/view.ts`, for Shift-click and Shift+Enter, the `openCompare` opt, the keydown guard and the switch to the docking helper [R23, R24];
  - create `app/src/lightbox/dock.ts`, the lifted docking helper; `lightbox/view.ts` itself is unchanged [R23];
  - `app/src/firstrun.ts`, where `boot()` builds `makeOpenCompare` and passes it to `mountGalaxy` (`firstrun.ts:63`) [R22];
  - `app/src/styles.css` (append a "Plan 4 Task 7" section) [R25].
- Test: `app/src/compare/sides.test.ts`, `app/src/compare/view.test.ts`, and new cases in `app/src/reference/view.test.ts` [C23] and `app/src/firstrun.test.ts` (the wiring).

**Interfaces:**
- Consumes `api.scorePair` (Task 3), `tileBox` (Plan 1 Task 8), `mountLinkEditor` (Task 4) and `openLightbox` (Task 6).
- **One docking helper** [R23]: read `reference/view.ts:570-600` first. Lift the picker-docking closure out of `openLb` into a new `app/src/lightbox/dock.ts`:
  ```ts
  export function openLightboxWithPicker(api: Api, store: Store, refId: string,
    deps: { beforePicker?(): void; onClose?(): void }): { close(): void };
  ```
  - It calls `openLightbox` with an `openPicker` that mounts the picker into `.lightbox .lb-side`, and keeps that picker itself, never nulling a newer one.
  - It closes that picker when the lightbox closes.
  - The Reference view passes `beforePicker: closePicker`, so its margin picker closes first. Its own `picker` variable no longer tracks the docked one.
  - Both the Reference view and Compare call it; nothing copies the closure.
- Produces:
  ```ts
  export type Sides = { shared: string[]; onlyA: string[]; onlyB: string[]; partialA: string[]; partialB: string[] };   // technique ids; partial = operation ids
  export function sides(a: Reference, b: Reference, sharedTechniques: string[], tax: Taxonomy): Sides;   // regions collapse; order = tax.techniques order
  export function mountCompare(root: HTMLElement, api: Api, store: Store, a: string, b: string,
    deps: { showReference(id: string): void; onClose?(a: string): void }): { swap(): void; close(): void };
  export function makeOpenCompare(root: HTMLElement, api: Api, store: Store,
    deps: { showReference(id: string): void }): (a: string, b: string, opts?: { onClose?(a: string): void }) => void;
  ```
- **Wiring in `firstrun.ts` `boot()`** [R22, R24]. There is exactly one `openCompare`, so "only ever one Compare" holds for every caller:
  ```ts
  const openCompare = makeOpenCompare(root, api, store, { showReference: (id) => { shell.select("reference"); view.show(id); } });
  // mountReference gains `openCompare` in its opts (today { onNavigate }); Shift-click and Shift+Enter call it with no onClose.
  // mountGalaxy's dep stays exactly Plan 3's `openCompare?(a: string, b: string): void` (galaxy.ts:29; item 10):
  //   openCompare: (a, b) => openCompare(a, b, { onClose: () => shell.select("galaxy") })
  ```
  `view` must exist before `openCompare` is first called. `boot()` either builds `openCompare` before `mountReference` with a closure over `view`, or passes the Reference view a thin forwarder.
- **Opening it:** Shift-click a second reference in Ranked, a callout thumbnail or the Links tab, or press Shift+Enter on a focused row (which arrives as a click with `shiftKey` on the row). Compare opens on the focused reference (A) and that one (B) [C23].
  - The Galaxy's Shift-click calls `openCompare`. The Tree and Radial have no Compare entry in this plan; that half of audit #25 is recorded as deferred [C26].
- **Modality** [R24]: Compare is a modal dialog, like the lightbox: `role="dialog"`, `aria-modal="true"`, its own keydown and a focus trap. The Reference view's document keydown (`reference/view.ts:487-518`) also returns while Compare is open: beside `if (lightbox) return;`, it checks `document.querySelector('.compare[aria-modal="true"]')`, the same kind of DOM check `openLb` uses for `.lightbox`. So its `v`, Esc, `l`, `t` and digit keys don't fire under Compare. The Galaxy's keys are behind the modal too.
- **Layout:**
  - A sits on the left and B on the right, both large. They use `thumb1024`, letterboxed on the N5 tile.
  - The middle column, "Shared", lists `scored.sharedTechniques`.
  - Under it, "Same operation × domain" lists `scored.sharedBranches` that have no shared technique.
  - Each side lists its own unique techniques under "Only here", and then its partial tags under "Operation only".
  - Hovering a technique outlines its region on whichever image carries it, if it is a region tag (ruling a1). The outline and the technique's operation path use `opInk` and `opLabel` (Global Constraints).
  - **Entry from the graph views:** `makeOpenCompare` returns the function Plan 3's Galaxy calls on Shift-click. Calling it closes any open Compare first, so there is only ever one, and then mounts a new one.
    - **Esc** calls the per-call `opts.onClose(a)` when it is given; the Galaxy's returns to the Galaxy.
    - Without it, Esc calls `deps.showReference(a)`, which `boot()` wires to the Reference view [R24].
  - The score shows small, with the wording "related by technique", or "not related by technique" when the score is 0.
  - If A and B are linked, their link's `why` shows at the top, marked "Linked by you". Links never change the score.
- **Keys:** `v` toggles the value view on both images, `x` swaps the sides, and `L` opens the lightbox on the side under the pointer, through `openLightboxWithPicker`. Esc returns as above. "Link these two" opens the link editor.
- When Compare is open, the scope is ignored: comparing is always explicit.
- Plates and outlines go through `tileBox` and the CSSOM, with no new inline `style=` [R26].

- [ ] **Step 1: Write the failing tests**
  - `sides`:
    - With A having t1, t2 and partial `infer`, B having t2 and t3, and shared `[t2]`, the result is `shared: [t2]`, `onlyA: [t1]`, `onlyB: [t3]`, `partialA: ["infer"]` and `partialB: []`.
    - Two region tags of t1 on A count once.
    - With a taxonomy order of t3, t1, t2, `onlyA` and `onlyB` follow that order, not the tag order.
  - `reference/view.test.ts` [C23]:
    - Shift-click on a Ranked tile calls `openCompare` with (A, B), which calls `scorePair(A, B)` and renders three columns.
    - With Compare open, `v` and Esc reach Compare only; the Reference view's handlers don't fire.
    - The Reference view's lightbox still docks the picker after the helper is lifted, and the margin picker closes first.
  - `compare/view.test.ts`:
    - `open_compare_from_galaxy`: `makeOpenCompare(root, api, store, deps)("a", "b")` calls `scorePair("a", "b")` and mounts one Compare. A second call replaces it, so there is still only one.
    - `firstrun.test.ts`: the Galaxy's `openCompare` wrapper passes an `onClose` that selects the Galaxy, and the Reference view's Shift-click passes none.
    - `compare_ink_from_taxonomy`: a shared technique under an operation with `color: "rose"` renders its path in `var(--x-rose-text)`.
    - `x` swaps the titles.
    - `v` toggles the value class on both plates.
    - Esc calls `deps.showReference(A)` when the call had no `onClose`, and the call's `onClose(A)` when it had one.
    - The dialog has `role="dialog"` and `aria-modal="true"`, and Tab stays inside it.
    - With a link A–B in the store, its `why` renders above "Shared".
    - The score text for a 0 score is "not related by technique".

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- compare`, `npm test -- reference`, `npm test -- lightbox` and `npm test -- firstrun`, then `npm run build`. They should FAIL, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): compare two references by shared and unique techniques`.

---

