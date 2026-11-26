### Task 5: The taxonomy graph model, and the Tree and Radial layouts

**Files:**
- Create:
  - `app/src/graph/taxgraph.ts`;
  - `app/src/graph/layout-tree.ts`;
  - `app/src/graph/layout-radial.ts`.
- Test: a `*.test.ts` beside each.

**Interfaces:**
- Consumes `Snapshot` (Task 2) and the constants (Task 3). **It starts only once Tasks 2 and 3 are merged** (schedule wave 2). Tests build a `Snapshot` literal directly; they need no Store.
- Produces:
  ```ts
  export type TaxNode =
    | { id: string; kind: "op"; opId: string; count: number }
    | { id: string; kind: "branch"; branchId: string; opId: string; domainId: string; count: number }
    | { id: string; kind: "tech"; techId: string; parents: string[] /* branch ids, taxonomy order */; count: number }
    | { id: string; kind: "ref"; refId: string; via: { techId: string; branchId: string; region?: Region; state: "full" | "region" } };
  export type TaxGraph = { nodes: Map<string, TaxNode>; children: Map<string, string[]> };   // op→branches, branch→techs, tech→refs
  export function buildTaxGraph(s: Snapshot, expanded?: Set<string> | "all" /* tech node ids whose refs are included */): TaxGraph;
  export type Placed = Map<string, { x: number; y: number }>;
  export function layoutTree(g: TaxGraph): Placed;
  export function layoutRadial(g: TaxGraph, opId: string): Placed;
  ```
- **Node ids:** `op:<id>`, `br:<branchId>`, `tech:<techId>` and `ref:<techId>:<refId>`. A reference appears once under each expanded technique it is tagged with.
- **Counts:** the number of distinct references tagged with the technique, under that branch, or under that operation. Partial tags count toward their operation only.
- **Tree layout:**
  - **Rows:** y is `0`, `BAND_GAP`, `2·BAND_GAP` and `3·BAND_GAP` for operations, branches, techniques and references.
  - **Branches** are grouped under their operation, in taxonomy order.
  - **A technique with several parents** is placed **once**, at the mean x of its parent branches (barycentre), and then pushed apart left to right to a minimum spacing of `NODE + 16`.
  - **References** of an expanded technique sit in a column under it, sharing its x, at y = `3·BAND_GAP + k·(NODE + 8)`. A column keeps "Show all" (decision 3) from making the band thousands of tiles wide; culling (Task 4) handles tall columns.
  - **Operations:** however many the taxonomy has, 1 to 9, in taxonomy order.
  - Edges are orthogonal hairlines from each parent. This is how a DAG is drawn without duplicating nodes.
- **Radial layout:**
  - **Centre:** the operation, at (0, 0).
  - **Ring 1** (radius `BAND_GAP`): its branches, spaced evenly.
  - **Ring 2** (radius `2·BAND_GAP`): its techniques, each at the circular mean angle of its parent branches inside this operation, then spread to a minimum arc spacing.
  - **Ring 3** (radius `3·BAND_GAP`, growing so the arc spacing stays at least `NODE + 8`): every reference tagged under this operation. Each sits at the circular mean angle of its techniques here.
  - Radial always expands all of its techniques, so culling (Task 4) carries the load.

- [ ] **Step 1: Write the failing tests**
  - `tax_graph_counts`: with the bundled seed taxonomy and 3 references (one partial under `infer`, two tagged `chiaroscuro`), `tech:chiaroscuro.count === 2`, `op:infer.count === 1`, and no node is created for a partial tag.
  - `tree_bands_ordered`: every node's y equals its band's value.
  - `tree_technique_once_between_parents`: in the seed, a technique with two parent branches has exactly one node. Its x lies within the parents' x range, or was pushed less than `NODE + 16` beyond it.
  - `tree_no_overlap`: within each band, neighbouring x values differ by at least `NODE + 16`.
  - `radial_rings`: every branch, technique and reference node lies on its ring within 1e-6 (or on the grown ring 3). All references tagged under the operation are present.
  - `radial_single_tech_ref_angle`: a reference with one technique under the operation shares that technique's angle.
  - `show_all_columns`: with `expanded = "all"` on 3 techniques and 5 references, every reference node's x equals its technique's x, and the y values in each column are strictly increasing in steps of `NODE + 8`.
  - `dynamic_operation_count`: a taxonomy with 5 operations gives 5 `op:` nodes on band 0, with no overlap. With 1 operation, the layout still has finite coordinates.
  - `empty_library_no_nan`: with zero references, every placed coordinate is finite (Review Focus 2).

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- graph/taxgraph graph/layout`. It should FAIL, then PASS.

- [ ] **Step 3: Commit**

  Commit message: `feat(graph): taxonomy graph model with tree and radial layouts`.

---

