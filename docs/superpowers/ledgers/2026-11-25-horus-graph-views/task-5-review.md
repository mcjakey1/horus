# Task 5 review: taxonomy graph model, Tree and Radial layouts

Range: 30d2d44..7da8547 (438940c, 7da8547). Reviewed from the diff, plus three focused checks outside it: the `Snapshot` type in `app/src/data.ts`, `app/src/graph/constants.ts`, and the plan's Task 8 section on Radial.

## Part 1: Spec, ❌

**Misunderstood (1):**
- **Radial ring 3 is not scoped to the operation.** The brief says ring 3 holds "every reference tagged under this operation", and the plan calls Radial "for one operation at a time". `layoutRadial` puts every reference child of every ring-2 technique on ring 3. A child of `tech:chiaroscuro` is any reference tagged chiaroscuro through *any* branch. So a plate tagged only `sequence.feature · chiaroscuro` shows on Differentiate's ring 3. That contradicts `op:differentiate.count`, which does not count it, and it breaks the brief's wording. See finding I1. The implementer's concern 2 is valid. It is a defect, not a reading choice.

**Missing:** none. All 9 brief tests are present. `rhythm` was swapped for `silhouette`, which is justified because `rhythm` is not a seed technique.

**Extra (1, acceptable):**
- `app/src/graph/fixtures.test-util.ts` is a test-only helper. It isn't matched by `*.test.ts`, the app doesn't import it, and it duplicates no existing helper (grep found no other `refOf` or `snap(`). Keep it.

**Verified as matching:**
- Node ids follow `op:`/`br:`/`tech:`/`ref:<tech>:<ref>`.
- The `TaxNode` and `TaxGraph` shapes are exactly as briefed.
- Counts are distinct references. Partial tags count toward their operation only and make no node.
- Tree bands are 0, G, 2G and 3G + k·(NODE+8).
- A multi-parent technique is one node, placed at its barycentre and then spread.
- Reference columns are correct.
- Radial: the centre is at (0, 0), ring 1 is even, ring 2 uses the in-operation circular mean, and ring 3 grows.
- Constants are imported only from `constants.ts` (BAND_GAP 160 and NODE 48 confirmed).
- No operation labels are hard-coded, and there is no pixi import.
- The `version` note is in the doc comment, and there is no identity cache.
- `Snapshot.inScope` exists (`data.ts:14`), so the out-of-scope fix in 7da8547 is sound.
- `suggested` is treated as normal, per the controller's ruling.

## Part 2: Quality, Needs fixes

| Check | Result |
|---|---|
| Multi-parent techniques | OK in the Tree: one node, a DAG edge from each parent, and face-schema's 3 parents tested. Not OK in Radial ring 3 (I1). |
| NaN safety | OK. `meanAngle` of opposite angles gives atan2(~0, ~0), which is finite. Empty operations, branches and libraries are handled (`max(1, …)`, `if (!n)`, the no-branch slot). Tested for the seed, synth(0), synth(1) and bare operations. |
| Determinism | OK. Map insertion order follows taxonomy and library order, and `Array.sort` is stable, so taxonomy order breaks ties. |
| 1, 5, 9 operations | 1 and 5 are tested. 9 is not tested (M3). The code doesn't depend on the count. |
| Empty domains | A branch with no techniques gets one slot (`layout-tree.ts:43`), but no test covers it (M5). |
| Untagged and out-of-scope references | OK, both tested. Out-of-scope references are kept and counted. |
| Radial seam | OK. `onRing` cuts at the widest gap. Wants become ascending after the +TAU shift. An overfull ring falls back to even spacing. Wrap spacing is tested on ring 3. |
| Tests check real behaviour | Mostly. Two assertions are tautological (M1, M2). The mutation checks in the report are credible. |
| YAGNI | Clean. `spread` is shared by both layouts, and no `MAX_OPS` logic is added (that clamp belongs to the view). |
| Fixtures file | Fine (see Extra). |

## Findings

### Important

**I1: Radial ring 3 includes references not tagged under the operation**
- **Where:** `app/src/graph/layout-radial.ts:63-72`. The root cause is `app/src/graph/taxgraph.ts:34` and `:63`, where `via` keeps only the first tag with the technique.
- **Problem:**
  - A reference tagged with a multi-parent technique only through another operation's branch is placed on this operation's ring 3. The seed has 6 such techniques, for example chiaroscuro under differentiate.feature and sequence.feature.
  - There is a related problem: `via.state`/`region` may come from another operation's tag. Task 8 draws the region outline "when it is on the ring because of a region-tagged technique" (ruling a1). So the outline can be wrong too, and a reference tagged chiaroscuro through both branches can show the wrong full/region state in one of the two Radials.
  - The ring-3 radius also counts these extra references.
  - The current test misses this because ref `a` uses first-branch tags only.
- **Fix:**
  - Make an additive, controller-approved extension to the ref node: keep `via` (the Tree still uses it) and add `vias: { branchId; region?; state }[]`. That is the reference's tags with this technique, one per distinct branch, in taxonomy order. Build it in `buildTaxGraph` by collecting every tag per (technique, reference), not only the first.
  - In `layoutRadial`, skip a ref node unless one of its `vias` has a branch in this operation's ring 1.
  - Task 8 then reads region state from that operation's `via`.
  - Add a test: a reference tagged chiaroscuro only via `sequence.feature` is absent from `layoutRadial(g, "differentiate")` and present in `layoutRadial(g, "sequence")`.
  - Without a type change, there is no correct fix inside the layout, because the graph does not carry the information.

### Minor

**M1:** `app/src/graph/layout-tree.test.ts:26`
- **Problem:** for ref nodes the assertion is `expect(y).toBe(y)`, a tautology.
- **Fix:** assert `3·BAND_GAP + k·(NODE+8)` using the node's index in its technique's column, or drop the branch, because `show_all_columns` covers it.

**M2:** `app/src/graph/layout-tree.test.ts:38`
- **Problem:** "exactly one node" filters Map keys for `=== t.id`. Map keys are unique, so it can never fail.
- **Fix:** count the nodes with `kind === "tech" && techId === t.techId`, and assert that `t.id` is in `children` of every parent branch.

**M3:** `app/src/graph/layout-tree.test.ts:82` (and the radial tests)
- **Problem:** the constraint is 1 to 9 operations, but 9 is never exercised.
- **Fix:** add `synth(9)` to `dynamic_operation_count`, checking op-band spacing and finiteness, and add one `layoutRadial(…, "o8")` finiteness check.

**M4:** `app/src/graph/taxgraph.ts:63`
- **Problem:** `branchId: tag.branchId ?? ""` uses an empty string as a sentinel. A technique tag without a `branchId` yields `via.branchId === ""`, which a view lookup (`br:`) won't find.
- **Fix:** fall back to the technique's first parent branch, or skip such tags. Either way, document the choice.

**M5:** `app/src/graph/layout-tree.ts:43`
- **Problem:** the empty-branch slot (`Math.max(1, kids(b).length)`) is untested. The `bare` fixture removes branches entirely, so a branch (a domain per operation) with zero techniques is never laid out in a test.
- **Fix:** add a synth branch with no `branchTechniques`, and assert that its x is finite and the branch band keeps at least `NODE + 16` spacing.

### Note (no change requested)
- A partial-only reference counts in `op:<id>.count` but cannot appear on ring 3, because it has no technique and therefore no angle or node id. This follows the brief ("no node for a partial tag"). Task 8 should not expect ring-3 size to equal the operation count, or the "busiest operation" count.
