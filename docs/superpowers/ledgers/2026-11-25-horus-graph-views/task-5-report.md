# Task 5 report: the taxonomy graph model, and the Tree and Radial layouts

**Status:** DONE. There are two commits on `p3-t5` (parent `30d2d44`):
- `438940c` `feat(graph): taxonomy graph model with tree and radial layouts`;
- `7da8547` `fix(graph): keep out-of-scope references in the taxonomy graph` (from AGY's finding, below).

All of it is pure TypeScript, with no pixi import. `BAND_GAP` and `NODE` are imported from `graph/constants.ts`.

## What was implemented

### `graph/taxgraph.ts`: `buildTaxGraph(s, expanded = new Set())`

- **Types:** `TaxNode` and `TaxGraph` exactly as in the brief. `children` has an entry, possibly empty, for every node.
- **Node ids:** `op:<id>`, `br:<branchId>`, `tech:<techId>` and `ref:<techId>:<refId>`.
- **Node order** is taxonomy order: operations, then branches (each under its operation), then techniques. Each technique is followed by its reference nodes.
- **Technique `parents`** are raw branch ids, sorted by branch order. A technique is pushed into `children` of each parent branch, so it is one node in a DAG.
- **Counts** are distinct references, each held in a `Set`:
  - a technique counts references with that technique;
  - a branch counts references with a tag whose `branchId` is that branch;
  - an operation counts references with any tag whose `operationId` is that operation, partial tags included.
  - A partial tag makes no node.
  - A tag whose technique is no longer in the taxonomy counts only toward its operation.
- **Reference nodes:** one per (expanded technique, reference). `via` is the reference's first tag with that technique, in library order, with `state` set to `"region"` when that tag has a region, otherwise `"full"`.
- **Board scope:** `inScope` does not filter anything. An out-of-scope reference stays in the graph, because Plan 3 draws it as a dot (P:495 and `out_of_scope_refs_are_dots`). Counts include all references.
- **Dropped quietly:** a branch whose operation is missing, and its links (`ponytail:` note; Rust validates `taxonomy.json`).

### `graph/layout-tree.ts`: `layoutTree(g)`, `Placed` and `spread`

- **Bands:** y is `0`, `BAND_GAP`, `2·BAND_GAP`, and `3·BAND_GAP + k·(NODE + 8)` for references.
- **Branches:** each branch gets a slot `max(1, its technique count) · (NODE + 16)` wide, laid out left to right in taxonomy order, grouped by operation.
  - The branch sits at the centre of its slot, and the operation over the middle of its branches.
  - An operation with no branches still takes one slot.
  - So both bands are at least `NODE + 16` apart, for any number of operations.
- **Techniques:**
  - Each technique wants the mean x of its parent branches (the barycentre). One with no parent goes past the last slot.
  - They are sorted by that x, with taxonomy order breaking ties, and then pushed apart to `NODE + 16`.
  - `spread` does this by least squares, pooling adjacent violators on `want[i] − i·gap`. A crowd therefore spreads around its mean instead of being pushed to one side. This is the reading I took of "pushed apart left to right".
- **References:** a column under each expanded technique, at the technique's x.
- **On the seed:** the 6 multi-parent techniques land 8–68 units from their barycentre. The worst technique is 224 units off (a 9-technique branch). The tree is 3488 units wide.

### `graph/layout-radial.ts`: `layoutRadial(g, opId)`

- **Centre:** the operation, at (0, 0).
- **Ring 1:** the branches, evenly, starting at the top.
- **Ring 2:** each technique at the circular mean angle of its parent branches in this operation.
- **Spreading (`onRing`):** it spreads to an arc of `NODE + 16`, or an even share of the circle when the ring is full.
  - It cuts the circle open at the widest empty gap, so a crowd never sits across the seam.
  - It then uses the same `spread`. If the ring is overfull it falls back to even spacing (`ponytail:` note).
- **Ring 3:**
  - It holds one point per reference: every reference child of a ring-2 technique.
  - That point is the circular mean of its techniques' placed angles. Its `ref:` nodes under each of those techniques share it.
  - The radius is `max(3·BAND_GAP, n·(NODE + 8)/2π)`, and the arc spacing is `NODE + 8`.
- **Not placed:** other operations' nodes. An unknown `opId` gives an empty map.

## Tests

There are 14 tests over three files, plus `graph/fixtures.test-util.ts`, a set of shared builders: the seed taxonomy, `tagOf`, `refOf`, `snap` (a `Snapshot` literal) and `synth(n)` (n operations).

- **`taxgraph.test.ts`:**
  - `tax_graph_counts` (also checks the branch counts and `via`);
  - node ids and taxonomy order, with face-schema's 3 parents;
  - expanded set versus "all", and out-of-scope references kept;
  - a deleted technique.
- **`layout-tree.test.ts`:**
  - `tree_bands_ordered`;
  - `tree_technique_once_between_parents`;
  - an extra barycentre test on a synthetic shared technique;
  - `tree_no_overlap`;
  - `show_all_columns`;
  - `dynamic_operation_count` (5 operations, 1 operation, and an operation with no branches);
  - `empty_library_no_nan` (zero references, untagged references, and zero operations).
- **`layout-radial.test.ts`:**
  - `radial_rings`: 62 references, so ring 3 grows. It also checks arc spacing including the wrap, the shared point, finiteness and the excluded operations.
  - `radial_single_tech_ref_angle`;
  - technique-ring spacing, a bare operation and an unknown operation.
- **Brief deviation:** the brief's `rhythm` is not a seed technique, so `show_all_columns` uses chiaroscuro, closure and silhouette.

### TDD evidence

- **RED:** `npx vitest run src/graph/taxgraph src/graph/layout` gave "Test Files 3 failed (3)", with `Cannot find module './taxgraph'`, `'./layout-tree'` and `'./layout-radial'`. The output is saved in `scratchpad/p3t5-red.txt`.
- **GREEN:** `npm test` gives "Test Files 28 passed (28), Tests 273 passed (273)". `npx tsc --noEmit` is clean, and `npm run build` ends with "✓ built".
- **Mutation checks:**
  - placing a technique at its first parent instead of the barycentre fails `tree_technique_once_between_parents` and the barycentre test;
  - removing `spread` fails `tree_no_overlap`.
  - Both were restored.

## Carry-ins

1. **Caches and `version`:** there is no cache. `buildTaxGraph` and both layouts are pure functions of their input. The doc comment says to rebuild when `version` changes and never to cache on the live Map's identity.
2. **Empty library:** with no references, or none tagged, every node is present with a count of 0 and every coordinate is finite. This is tested for the seed, for `synth(0)`, `synth(1)` and an operation with no branches.
3. **Constants:** `BAND_GAP` and `NODE` are imported. `MAX_OPS` is not used: the layouts handle any count, and limiting the number keys to 1–9 is a job for the view.
4. **Task 4's files:** no pixi import, and package.json and the scene files are untouched.

## AGY #2

**Verdict: FAIL, then fixed.**
- **Blocking finding,** quoted: "`if (!s.inScope(r.id)) continue;` omits out-of-scope references … Plan 3 Tasks 6 and 8 require out-of-scope references to stay in the graph so views emit them … with `dim: true`."
  - I checked this against the plan (P:495, P:513) and fixed it in `7da8547`.
- **Non-blocking finding,** quoted: "a reference tagged with a multi-parent technique (e.g. `chiaroscuro`) only under `sequence.feature` still appears on `differentiate`'s ring 3. Inherent to the brief's `TaxNode` shape". See concern 2.
- Quote: "Everything else checks out".

## Concerns

1. **Radial reference ids:** ring 3 has one point per reference, but the node-id scheme has one node per (technique, reference). All of a reference's nodes in that operation share one position, so the renderer (Task 8) should draw one tile per `refId` and an edge from each technique.
2. **Radial ring 3 and the operation:** ring 3 includes a reference tagged with a technique shown in this operation, even when its tag went through another operation's branch. Filtering strictly would need the reference node to carry every tag's branch, not only `via`. Tell me if Task 8 wants that.
3. **`suggested` tags** (v2) count like confirmed ones. The SPEC keeps the flag for v2 only, and nothing sets it yet.
4. **Extra file:** `graph/fixtures.test-util.ts` is a test-only helper beyond the brief's file list. It doesn't match vitest's test pattern and the app doesn't import it.

## Fix round 1 (commit `890e79a`)

### I1: ring 3 showed references tagged through another operation's branch

- **`taxgraph.ts`:** the reference `TaxNode` gains an additive field, `vias: Via[]` (ruling: interface change approved).
  - `vias` holds every tag of that reference on that technique, the first tag per branch, in tag order.
  - `via` is unchanged; it equals `vias[0]`.
  - The shared shape is exported as `Via`.
- **`layout-radial.ts`:** ring 3 keeps a reference node only when one of its `vias` is on this operation's branches. `here` is the set of this operation's raw branch ids.
  - The mean angle uses only the kept techniques.
  - The radius `max(3·BAND_GAP, n·(NODE + 8)/2π)` counts only the kept references.
- **Tests:**
  - `taxgraph.test.ts` `tax_graph_counts` now asserts `vias`:
    - reference `a` has two (`differentiate.feature`, then `sequence.feature`), and `via` is still the first;
    - reference `b`'s region tag gives `state: "region"`.
  - New test `radial_ring3_only_this_operation (fix round 1, I1)`. The fixture:
    - a chiaroscuro plate `s`, tagged only under `sequence.feature`;
    - a plate `w`, tagged under both branches;
    - 60 more `sequence.feature`-only plates.
  - What it checks:
    - On Differentiate: `s` is absent, and only `w` is on ring 3, at exactly `3·BAND_GAP` (the ring did not grow for the 61 excluded references).
    - On Sequence: `s` and `w` are present, and the ring grows for 62 references.

### Runs

- **RED:** `npx vitest run src/graph/taxgraph src/graph/layout` gave "Tests 2 failed | 13 passed (15)":
  - `tax_graph_counts`: "expected { id: 'ref:chiaroscuro:a', …(3) } to match object", because there was no `vias`;
  - `radial_ring3_only_this_operation`: "expected true to be false", because `s` was on Differentiate.
- **GREEN:**
  - `npx vitest run src/graph/layout-radial.test.ts src/graph/taxgraph.test.ts src/graph/layout-tree.test.ts` gives "Test Files 3 passed (3), Tests 15 passed (15)".
  - `npx tsc --noEmit` is clean.
  - The full `npm test` gives "Test Files 28 passed (28), Tests 274 passed (274)".
- **Concern 2 above is resolved.**
