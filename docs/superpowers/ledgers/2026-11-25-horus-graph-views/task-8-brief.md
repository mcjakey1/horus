### Task 8: The Radial view

**Files:**
- Create: `app/src/views/radial.ts`.
- Modify:
  - `app/src/firstrun.ts` `boot()`: `shell.register("radial", …)` on the `[data-view-host="radial"]` host (ruling B2).
- Test: `app/src/views/radial.test.ts`, using a fake `Scene`.

**Interfaces:**
- Consumes `buildTaxGraph` and `layoutRadial` (Task 5), and from Task 6 `renderInspector` (with the same `InspectorOpts`, R10) and `graph/navigate.ts` (`move`, `canvasKeys`), imported, not copied (R12). It only imports `views/inspector.ts`; it does not edit it, so it runs beside Task 10.
- Produces:
  ```ts
  export function mountRadial(host: HTMLElement, data: DataSource, deps: { api: Api; openReference(id: string): void;
    makeScene?: …; initialOp?: string }): ViewHandle;
  ```
- **The operation switch:** a segmented control above the canvas, with one button per taxonomy operation (1–9, in taxonomy order).
  - Each button shows the operation's plain label and an `opInk` swatch of 10 px.
  - Keys `1`–`9` switch while the canvas has focus, read with `digitOf` (`keys.ts:26`, so AZERTY's shifted digits work; Plan 2 ruling M3) through `canvasKeys`' `digit` handler. Digits above the operation count, or above `MAX_OPS` (Task 3's constants), do nothing. The control wraps to a second row past five operations.
- **Defaults and memory:** the default is the operation with the most tagged references. The choice is remembered for the session.
- **Reference nodes** sit on ring 3. Each is drawn with its region outline when it is on the ring because of a region-tagged technique (ruling a1).
- **The connector from a technique to its references** is drawn only for the hovered or selected technique, using the operation's ink, as on the Tree's selected path. This applies the "edges only on hover" rule to the outer ring.

- [ ] **Step 1: Write the failing tests**
  - `switch_operation_relayouts`: clicking "Lead the eye" calls `setNodes`, and the result contains only `sequence` branches and techniques.
  - `default_op_is_busiest`: with two references under `infer` and one under `group`, the first render is `infer`.
  - `key_3_selects_sequence`: pressing `3` on a focused canvas selects "Lead the eye". A keydown with `key: '"'` and `code: "Digit3"` (AZERTY) does the same.
  - `renders_dynamic_ops`: with a fifth operation added ("Unsettle", `color: "rose"`), 5 buttons render, `5` selects it, and its swatch is `var(--x-rose)` (a string check; the token itself arrives in Task 10).
  - `out_of_scope_refs_are_dots`: as in Task 6.
  - `radial_shares_inspector`: selecting a technique renders the same inspector markup as the Tree does for that selection. The comparison uses `renderInspector`'s output.

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- views/radial`. It should FAIL, then PASS.

- [ ] **Step 3: Commit**

  Commit message: `feat(ui): Radial view as a layout mode over the taxonomy graph`.

---

