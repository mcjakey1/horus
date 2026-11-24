# Horus seed taxonomy

`taxonomy.json` is the seed taxonomy, the first build deliverable named in SPEC.md §7. It is a draft for you to correct before anything ships. `check_taxonomy.py` checks its structure; run it with `python -I check_taxonomy.py`.

## What is in it

- **4 operations**: Differentiate (*Stand out*), Group (*Hold together*), Sequence (*Lead the eye*) and Infer (*Make them think*).
- **6 domains**: Feature, Grouping, Space, Social, Semantic and Cultural.
- **18 branches** (operation × domain pairs), each with at least one technique.
- **48 techniques**:
  - 41 seed techniques, using the reel's names exactly as written (`custom: false`);
  - 7 custom techniques of our own, which fill the branches that had only one technique (`custom: true`; see below).
- **55 branch→technique links**: 4 observed and 51 drafted.

Techniques reachable from each operation: Differentiate 19, Group 9, Sequence 10 and Infer 17. SPEC §6.1 hopes for about 10 per operation, so Differentiate and Infer are large (see decision 3 below).

## Schema notes

The file follows the SPEC.md §3 schema and adds three fields that the task brief asked for:

- `Technique.citation`: a string, or `null` when no source is certain.
- `BranchTechnique.source`: `"observed"` or `"drafted"`.
- `BranchTechnique.rationale`: one line, in our own words, on why the link exists.

`Technique.examples` is kept as an empty array, as §3 specifies. `Operation.color` is `null` until the design pass (SPEC §8). Icons are one-line descriptions of a glyph, not artwork. They were written to differ from the glyphs recorded in REFERENCE-ANALYSIS.md §2.1, §2.2 and §4.

Ids are kebab-case for techniques and `operation.domain` for branches.

## How the links were drafted

1. **Branches.** I started from the per-operation domain subsets in REFERENCE-ANALYSIS.md §2.2, which gave 18 branches. I added one more:
   - **Group → Feature.** Grouping by shared colour or shape (Wertheimer's similarity factor) is one of the most basic ways to make parts hold together. The reel's Group domain row is cropped on its left, and Feature sits first in the domain order, so it may simply have been off screen. *Color blocking* and the custom *Limited palette* sit under this branch.

   No other branch was added.

   **Group → Semantic was dropped**, at your decision. The reel shows it, but none of the 41 techniques holds things together *through meaning* without stretching the label. That leaves 18 branches.
2. **Observed links.** The four breadcrumb paths from REFERENCE-ANALYSIS.md §2.3 are marked `"observed"`. Their rationales are our own description of the mechanism.
3. **Drafted links.** For every technique I asked two questions:
   - What does it *do* for the viewer? That gives the operation.
   - What lever does it pull? That gives the domain.

   A second parent was added only when an artist pressing a different plain-language button would honestly reach for the same technique.

   No technique sits under two domains of the same operation, because SPEC §6.3 would then make the artist pick a domain on every tag. `check_taxonomy.py` enforces this.
4. **Text.** Every description, synonym list, rationale and icon line is written fresh. None of it is taken or paraphrased from Iris or Modern Art Direction material.

   Each citation names a primary source that I checked exists. Where I was not sure that a source covered the mechanism, the citation is `null` (10 of the 41 seed techniques and 2 of the 7 custom ones).
5. **Review.** AGY reviewed the draft (`agy --mode plan`). Its round-1 fixes were applied:
   - Two citations were corrected: Face schema and Visual quotation.
   - Five links it judged spurious were removed: Sequence → Feature → Saturation blocking, Sequence → Space → Occlusion, Sequence → Space → Frame within a frame, Group → Semantic → Semantic compounding, and Sequence → Space → Reading path.
   - Differentiate was trimmed: Scale disparity and Caricatural exaggeration were removed from it.
   - Infer → Social → Face schema was added.
   - The Grouping icon was changed.
   - The self-check was tightened.

   I kept one link that AGY suggested removing, **Sequence → Feature → Chiaroscuro**. A path of light through the dark is a standard way painters and cinematographers move the eye, and that is a different job from simply making one area win.

## Link table

| Operation | Domain | Technique | Source |
|---|---|---|---|
| Differentiate | Feature | Complementary pairing | **observed** |
| Differentiate | Feature | Chiaroscuro | drafted |
| Differentiate | Feature | Pop-out | drafted |
| Differentiate | Feature | Saturation blocking | drafted |
| Differentiate | Feature | Simultaneous contrast | drafted |
| Differentiate | Feature | Warm and cool split | drafted |
| Differentiate | Feature | Rim light | drafted |
| Differentiate | Feature | Silhouette | drafted |
| Differentiate | Feature | Texture against flat | drafted |
| Differentiate | Grouping | Pattern break | drafted |
| Differentiate | Grouping | *Set apart* (custom) | drafted |
| Differentiate | Space | Isolation in void | drafted |
| Differentiate | Space | Selective focus | drafted |
| Differentiate | Space | Center placement | drafted |
| Differentiate | Space | Frame within a frame | drafted |
| Differentiate | Social | Face schema | drafted |
| Differentiate | Social | *Direct address* (custom) | drafted |
| Differentiate | Semantic | Semantic contrast | **observed** |
| Differentiate | Semantic | *Incongruous object* (custom) | drafted |
| Group | Feature | Color blocking | drafted |
| Group | Feature | *Limited palette* (custom) | drafted |
| Group | Grouping | Common region | drafted |
| Group | Grouping | Good continuation | drafted |
| Group | Grouping | Symmetry | drafted |
| Group | Grouping | Closure | drafted |
| Group | Grouping | Proximity clustering | drafted |
| Group | Social | Face schema | drafted |
| Group | Social | Body vector | drafted |
| Sequence | Feature | Chiaroscuro | drafted |
| Sequence | Feature | Size hierarchy | drafted |
| Sequence | Grouping | Good continuation | drafted |
| Sequence | Grouping | Temporal synthesis | drafted |
| Sequence | Space | Leading lines | drafted |
| Sequence | Space | *Repoussoir* (custom) | drafted |
| Sequence | Social | Gaze cue | drafted |
| Sequence | Social | Body vector | drafted |
| Sequence | Cultural | Reading path | drafted |
| Sequence | Cultural | *Arrow cue* (custom) | drafted |
| Infer | Grouping | Closure | drafted |
| Infer | Grouping | *Missing piece* (custom) | drafted |
| Infer | Space | Forced perspective | drafted |
| Infer | Space | Figure-ground reversal | drafted |
| Infer | Space | Occlusion | drafted |
| Infer | Space | Crop at the edge | drafted |
| Infer | Social | Face schema | drafted |
| Infer | Social | Caricatural exaggeration | drafted |
| Infer | Social | Anthropomorphism | drafted |
| Infer | Semantic | Contextual metaphor | **observed** |
| Infer | Semantic | Semantic contrast | drafted |
| Infer | Semantic | Scale disparity | drafted |
| Infer | Semantic | Semantic compounding | drafted |
| Infer | Semantic | Form substitution | drafted |
| Infer | Cultural | Genre quotation | **observed** |
| Infer | Cultural | Visual quotation | drafted |
| Infer | Cultural | Visible facture | drafted |

**Number of parents:**

- **Face schema has the most, with 3**: Differentiate → Social, Group → Social and Infer → Social.
- **Five techniques have 2**: Chiaroscuro, Semantic contrast, Good continuation, Closure and Body vector.
- **The other 35 seed techniques and all 7 custom ones have 1.**

## Decisions taken (round 3, 2026-11-24)

Your call: drop Group → Semantic and take the recommended option on every other doubt.

1. **Group → Semantic: dropped.** The reel shows this branch, so it is part of the observed floor, but no technique fits it. `check_taxonomy.py` no longer allows it, and every branch now has at least one technique.
2. **Reading path: kept under Sequence → Cultural only.** It works because it follows a learned reading direction. This keeps Sequence → Cultural populated and avoids asking for a domain on every tag (SPEC §6.3).
3. **Size per operation: no further trims.** Review already cut Differentiate from 18 to 16 techniques. Cutting more would remove true "stand out" uses. Differentiate and Infer stayed at 16 at that point. The custom techniques (decision 8) have since brought them to 19 and 17.
4. **Weakest links: kept as they are.** These are Infer → Semantic → Scale disparity, Face schema under Group and Infer, and Silhouette under Differentiate only. They are judgement calls best tested on real tagging with the demo set, and AGY passed them.
5. **Visible facture: the reel's name is kept,** as the brief says. It stays under Infer → Cultural only.
6. **The `subject` pill and the dashed edges: deferred.** Nothing in v1 needs them. Add a `primary | secondary` flag on BranchTechnique only if a view needs it.
7. **Citations: the two doubtful ones are now confirmed by web search.**
   - Phillips & McQuarrie (2004) sort visual figures by structure: juxtaposition, fusion and replacement. That supports Semantic contrast (juxtaposition) and Form substitution (replacement).
   - Zettl's index vectors are pointers: gestures, arrows and the direction a person looks. That supports Body vector.
8. **Thin branches: filled with custom techniques** (round 4). The seven branches that had only one technique each got one new technique of our own, marked `custom: true`. That flag separates them from the reel's 41 names, which keeps the seed's provenance clear for the SPEC §7 legal check. Their names are ordinary art and design vocabulary. Each one is a mechanism distinct from the technique already in its branch.

   | Branch | Custom technique | What it does | Citation |
   |---|---|---|---|
   | Differentiate → Grouping | Set apart | Moves one element away from a tight group | Wertheimer (1923), proximity |
   | Differentiate → Social | Direct address | The subject looks straight at the viewer | Senju & Hasegawa (2005) |
   | Differentiate → Semantic | Incongruous object | One thing in the scene plainly doesn't belong | Loftus & Mackworth (1978) |
   | Group → Feature | Limited palette | A few related colours bind the whole image | Itten (1961), colour harmony |
   | Sequence → Space | Repoussoir | A dark near-edge shape pushes the eye into the scene | `null` |
   | Sequence → Cultural | Arrow cue | Learned signs (arrows, numbers) set the order | Zettl, index vectors |
   | Infer → Grouping | Missing piece | A familiar set with one member gone | `null` |

   The Senju & Hasegawa and Loftus & Mackworth citations were confirmed by web search before they were added.

## Still open

- **The domain rows in the reel are cropped** (REFERENCE-ANALYSIS §2.2). Group → Space, Group → Cultural, Differentiate → Cultural and Sequence → Semantic may exist in Iris and be off screen. Add one only when a technique needs it.
- **The custom techniques are drafts.** Rename, re-home or delete any of them. Repoussoir and Missing piece are the ones I'm least sure an artist would reach for.
- **Operation size:** Differentiate (19) and Infer (17) are well above the roughly 10 in SPEC §6.1, so the Stand out and Make them think pickers will be long.
- **Before launch:** check every citation against its source text. A lawyer should compare this selection and arrangement with what Iris publishes (SPEC §7).
