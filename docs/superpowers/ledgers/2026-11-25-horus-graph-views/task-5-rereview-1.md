# Task 5 re-review 1: fix round for I1

Range: 7da8547..890e79a (890e79a). I read the fix diff and made four focused checks outside it: `fixtures.test-util.ts` (the `tagOf` defaults), the head of `layout-radial.ts`, `validate_tag` in `src-tauri/src/edit.rs`, and a grep for other users of `via` and ref nodes. The suite was not re-run.

## I1: ADDRESSED

Each point of the controller ruling is met:

- **`vias` is added:** `taxgraph.ts:11-12,64-65`. `techTags` now keeps `Tag[]` per (technique, reference), at most one tag per `branchId`, in library and tag order. Every ref node carries `vias`.
- **`via` is unchanged:** `via = vias[0]`, and the first tag is always pushed, so `via` is still the first tag with that technique. The `count` (`byRef.size`) is unchanged. A grep found no other code that builds a ref node or reads `via`, so the new required field breaks no other code.
- **Ring 3 is filtered:** `layout-radial.ts:66,69`. `here` is the set of `branchId`s on ring 1, and a ref node is skipped unless one of its `vias` is in `here`. Each `Branch` has exactly one `operationId`, so being on one of this operation's branches means being tagged under this operation.
- **The radius counts only kept refs:** the filter runs before `byRef` is filled, so `refs.length`, and therefore `r3`, counts only the kept references.
- **There is a cross-operation test:** `radial_ring3_only_this_operation` checks four things:
  - `s`, tagged only through `sequence.feature`, is absent from Differentiate and present in Sequence.
  - `w`, tagged through both branches, is present in both.
  - Differentiate's only ref is `w`, at r = 3·BAND_GAP.
  - Sequence's ring grows with its 62 references: 62·56/2π ≈ 553 > 480.

  The radius assertion would fail before the fix, when Differentiate's ring 3 held all 62 references, so the test actually checks the defect. `taxgraph.test.ts` checks that `vias` has the right length and order through `toMatchObject` on arrays, which matches array length exactly.
- **The related region-state concern from the review is now fixable:** Task 8 can read `region`/`state` from the `vias` entry whose branch is in this operation, and no longer has to rely on `via`.

## New breakage from the fix diff

Critical: none. Important: none.

**Minor**
- **N1: the module header is stale.** `layout-radial.ts:1-2` still says ring 3 holds "every reference tagged with those techniques". It should say "tagged under this operation", which is how the new ring-3 comment at `:61` puts it. The fix did not update the header.

## Observations (outside the fix diff, no change requested)

- **The `""` sentinel (review M4) now hides a ref everywhere.** A technique tag without a `branchId` gets `branchId ""`. It never matches `here`, so the ref is now absent from every Radial; before the fix it showed on every Radial. `validate_tag` (`edit.rs:137-146`) requires technique and branch together, so validated data cannot reach this case. M4 still stands as a documentation item.
- **Same-branch duplicate tags are merged.** When a reference has two tags with the same technique and branch (for example one full and one region), `vias` keeps only the first, so a later region tag on that branch is not visible. This matches the old first-tag rule for `via`. Flag it to Task 8 only if a region outline must show when *any* tag on the branch is region-tagged.
- **`vias` order differs from the review's suggestion.** It follows tag order, as the doc comment says; the original review suggested taxonomy order, and the controller ruling did not set an order. No current code depends on the order.
- **Ring-3 count versus operation count:** the earlier review's note still applies. Partial-only references count in `op:<id>.count` but never appear on ring 3.
