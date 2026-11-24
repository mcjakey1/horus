# Horus: design spec (draft 5)

**Status:** draft 5. All questions are answered; this draft adds your round-3 answer on search (§5a). It folds in your round-2 answers, and AGY has reviewed it as an independent validator (verdict and fixes in §13). Nothing is built yet.

**How this draft was made:** I (Claude) wrote it after three design rounds with AGY, run at your request with working artists in mind, and after reading the original product's site. What the original does is recorded separately in [`REFERENCE-ANALYSIS.md`](REFERENCE-ANALYSIS.md), with frames from the reel in `reference/`. This file is **our** design.

**Working name:** **Horus**, your pick. It needs a trademark search before launch: the name is used by existing software products. AGY also points out that it is eye-adjacent (the Eye of Horus), like Iris. The original product is **Iris™ — "A Taxonomy of Visuals"** by Modern Art Direction, so we do not use its name or title.

---

## 0. Your decisions so far

| | Your answer (round 1) | What it means for this design |
|---|---|---|
| Audience | Public product | Our own name, visual identity and definitions; the technique names follow the reel (see the next row). No copyrighted images ship with it. `reference/` and `REFERENCE-ANALYSIS.md` contain third-party frames and ads, so they are kept out of any public repository or build. |
| Taxonomy | Seed it from the reel, and draft the missing links. In round 2 you asked whether technique names can be copyrighted. | They generally cannot, so we **keep the reel's names**. See §7. |
| Images | Start with a small demo set | About 50 public-domain or CC0 works, mixing posters, prints and photography. Rights are checked item by item: Library of Congress and WPA items are often only "no known restrictions". |
| Classification | Manual first, Claude-assisted later | Manual in v1. The schema keeps a `suggested` flag for v2. |
| Form | A Rust program → **Tauri v2** (round 2) | A Rust core with a TypeScript and web interface. See §10. |
| v1 views | All of them | All views are in v1. The intro card plays once and can be skipped. |
| v1 scope (round 2) | **All the added features**: Inbox, links you draw, region crops, Boards, Lightbox and Compare, duplicate detection, and all three desktop systems | See below. |
| Look (round 2) | Same interaction model, in our own visual style | The breadcrumb path stays, docked in the inspector. See §8. |
| Search (rounds 2–3) | *"a related/similar image search / way to be able to search an image with the ideas im looking for"*. Round 3: **A and B; B optional, in Settings, and offered during setup.** | See §5a. |
| Core purpose | *"usable for actual artists who want their references connect to other references and see their correlation"* | **This drives everything below.** |

**Calls AGY and I made, now confirmed by your round-2 answers:**

- **Image first, not taxonomy first.** The app opens on a reference and its connections, because your core-purpose answer was about references connecting.
- **Added for working artists:**
  - an Inbox for untagged references;
  - Boards, with export to a folder;
  - region crops;
  - links you draw yourself, each with a "why" note;
  - a lightbox with a value toggle;
  - duplicate detection;
  - ICC colour handling;
  - Windows, macOS and Linux support.
- **Our own visual style, same interaction model.** The original's breadcrumb card is replaced by the same breadcrumb path, docked in the inspector, and the palette is our own.
- **A library is a plain folder** of JSON and images, with no database.

---

## 1. What we're building

A **local, desktop reference workbench**. Artists drop in their own references. They tag *how* each image works: the technique, not the subject or the style. The app then shows which references connect, and why.

The taxonomy is the explanation layer behind each connection. It is not the destination.

**How it differs from Iris.** AGY and I agree on these points:

| Iris | Ours |
|---|---|
| A curated encyclopedia of ads, posters and covers | **Your own library**, in any medium: illustration, concept art, film stills, photography, ads |
| Taxonomy first: you browse the map | **Image first**: you start from a reference and see what it connects to |
| Web only, invite-only beta | Desktop, works offline, a library folder you own forever, no sign-up |
| One reading per image | **Region crops**: different parts of one image carry different techniques |
| Links come only from the taxonomy | Taxonomy links **plus links you draw yourself**, each with a "why" note |

We keep the editable taxonomy, but it is not the headline feature. Most artists want a sharp default and only tweak it now and then. **Full taxonomy editing is in v1**: add, rename, delete, re-link, define, and add synonyms. It happens in the Tree view's inspector (§5).

---

## 2. Artist workflows (the test for every feature)

1. **Hoard.**
   - In the middle of research, the artist grabs 20 screenshots in two minutes.
   - Drag, paste, or drop a whole folder: everything lands in the **Inbox** at once, untagged, with an optional three-word note.
   - The app never asks them to classify an image at intake.
2. **Tag later.**
   - The artist works through the Inbox fast (§6).
   - Partial tagging is fine: an image can carry just an operation, or stay untagged.
3. **Explore.**
   - Open a reference to see its techniques and the references that share them, ranked.
   - Walk from one reference to the next.
   - Compare two references side by side, with what they share and what only one has.
4. **Brief.**
   - Starting a piece, the artist narrows down to 8–15 working references in a **Board**.
   - They filter the view to that board, then export it to a folder and drag it into PureRef, Photoshop or Figma.
5. **Study.**
   - **Lightbox** at full resolution, with a grayscale (value) toggle.
   - Region boxes highlight on hover.
   - Side-by-side compare.

---

## 3. Data model

There are four levels, using the reel's names (see §7):

| Level | What it is | Example |
|---|---|---|
| **Operation** | What the image has to do | *Differentiate* ("Stand out") |
| **Domain** | What it works through | *Feature*: colour, light, shape |
| **Technique** | The concrete move | *Silhouette* |
| **Reference** | One real image, or a region of one | *WPA poster, 1938, region: figure* |

A technique can sit under several operation × domain pairs, so the taxonomy is a DAG (a node can have more than one parent). A reference can have many techniques.

```
Operation   { id, name, plainLabel /* "Stand out" */, color, icon, description }
Domain      { id, name, icon, description }
Branch      { id, operationId, domainId }                    // operation × domain
Technique   { id, name, icon, description, synonyms[], examples[], custom: bool }
BranchTechnique { branchId, techniqueId }

Reference   { id, title, creator?, year?, sourceUrl?, credit? /* free-text attribution */, note?,
              file, hash /* BLAKE3 */, width, height, addedAt }
Tag         { id, referenceId,
              operationId,                       // always set
              techniqueId?, branchId?,           // set together: a technique tag always records
                                                 // which operation × domain it was tagged under
              region?: {x,y,w,h} /* 0..1 */, suggested: bool /* v2 */ }
// A tag with only operationId is a partial tag ("it stands out, not sure how yet").
// Inbox is derived, not stored: a reference with zero tags is in the Inbox.
Link        { id, fromRef, toRef, why: string }               // drawn by the artist
Board       { id, name, referenceIds[] }
```

A library is a folder that holds:

- `library.json`
- `images/`: copies of the originals, named by their hash.
- `thumbs/256/` and `thumbs/1024/`.
- `taxonomy.json`
- `library.bak.json`
- `taxonomy.bak.json`: the last good copy of `taxonomy.json` (Plan 2)
- `embeddings.bin`: only if search option B ships (§5a).

---

## 4. Correlation: how "related" is scored

These are the fixes from the AGY round, built into the score:

- **Each reference's tags are reduced to a set** of distinct (technique, branch) pairs first. Tagging the same technique on three regions counts once.
- **Same technique.** Weighted by how rare the technique is in the library, using smoothed IDF: `ln(1 + N / df)`, where N is the number of references with at least one technique tag (decided 2026-11-25; untagged and partial-only references are left out) and df is the number tagged with the technique. Smoothing means a technique on every image still counts a little. Two references sharing *Chiaroscuro* in a library full of moody lighting count for less than two sharing *Pattern break*.
- **Same operation × domain.** Each branch the reference is tagged under is its own entry, weighted 0.3. It is matched on the tag's recorded `branchId`, so it is never ambiguous in the DAG.
- **Same operation only**, including partial tags. **Weight 0.** Nearly everything "stands out", so counting it would make everything look related.
- **Normalisation: cosine similarity** (changed after AGY's review). Each reference becomes a vector with one entry per technique (its IDF weight) and one per branch (0.3), and the score is the cosine of the two vectors. Dividing by the smaller tag set, as an earlier draft did, let a 1-tag reference score 1.0 against a 6-tag reference; cosine scores that pair at about 0.4.
- **Links drawn by the artist.** Always shown, and listed first. They are not mixed into the score.
- **Settings.** Strong defaults, with no sliders in the UI. The weights live in a constants file.

The score drives the ranked "Related" list, the Galaxy clustering and the edge thickness.

---

## 5. Views

The default view on launch is the **Reference view**, once the library has any references. On first launch the library already contains the demo set, so the app opens straight into the Reference view.

| View | What it's for | Notes |
|---|---|---|
| **Reference** (home) | "What does this connect to, and why?" | The selected reference sits in the centre, with its technique nodes around it and the references that share each technique beyond those. A docked inspector on the right has the ranked Related list, its tags, its links and its notes. Clicking a related reference re-centres on it, and a back stack keeps the trail. |
| **Compare** | "Why are these two related?" | Shift-click a second reference. Shared techniques sit in the middle, and the ones unique to each sit on its side. Images are shown large, with the value toggle. |
| **Taxonomy tree** | Learn the system; browse by operation | Bands: operation → domain → technique → references. Our own layout grammar is a top-down tree with a docked inspector; the breadcrumb path is docked in the inspector. **The taxonomy is edited here**: select a node to rename it, define it, add synonyms or delete it; drag a technique onto a domain to re-link it; use "+" on any band to add a node. Deleting a node that is in use asks where its tags should move. |
| **Galaxy** | See the whole library's shape | A force layout driven by the correlation scores, so clusters mean something. Edges appear only on hover or selection, which keeps it from turning into a hairball. |
| **Radial** | A different look at one operation | A thin layout mode over the same graph, not a separate system. |
| **Inbox** | Triage new references | A grid of untagged references with keyboard-driven tagging (§6). |
| **Boards** | Working sets for a piece | A named subset, "Show only this board", and "Export board to folder". |
| **Lightbox** | Study the pixels | Full resolution, zoom, value toggle, region overlays. |
| **Intro card** | First impression | Plays once on first launch and can be replayed from a menu. Any key or click skips it. It uses our own identity. |

Light and dark themes apply throughout. Pan and zoom work on the canvas views.

**Region tags outside the lightbox.** Wherever a reference appears *because of* a region-tagged technique (around that technique node, or in Related and Compare for that technique), its thumbnail shows the **cropped region**. Everywhere else it shows the full image.

---

## 5a. Search by idea **[Decided in round 3: A and B in v1, with B optional]**

You asked for *"a way to search an image with the ideas I'm looking for"*. That can mean three different things, and each costs very different amounts to build:

| | What you type or drop | What you get | Cost |
|---|---|---|---|
| **A. Idea search** | Words: "make the product feel like food", "moody", "show one thing as another" | Matches on technique names, synonyms and definitions, plus your notes and "why" links. Results are the techniques and the references tagged with them. You can combine techniques with AND/OR. | Small. Fully local. |
| **B. Find similar** | An image (from your library or dropped in), **or words** such as "a hand holding something fragile" | References that look alike or show similar content, ranked, even when nothing is tagged yet. | Medium. It uses a local AI model (CLIP, run with ONNX Runtime in Rust; about 150–350 MB). The model is a **one-time optional download** when you first use the feature, not part of the installer. Everything stays offline after that. |
| **C. Find new images online** | An idea or an image | New references from the web, to bring in | Large. Needs an outside service or API, has costs, and raises copyright questions for each result. |

**What B can and can't do (AGY's correction).** CLIP is good at subject, content, style and mood. It is **not** good at abstract techniques such as Closure or Semantic contrast. So B finds "looks like this", not "works like this".

To keep the app from sliding into a mood board, B's results are always labelled **"Looks similar"** and kept apart from the technique-based **"Related"** list. B does not give v2 auto-tagging for free: at most it could propose candidates for a human to confirm.

**Decided (round 3):** A and B are in v1, and C is later.

- **A is always on.** It needs no download.
- **B is optional and off until the artist turns it on**, because some machines aren't powerful enough to run a model comfortably. There are two ways in:
  - **During first-run setup**, one step asks: *"Turn on Find similar? It downloads a 150–350 MB image model and indexes your library in the background. Recommended for machines with 8 GB of RAM or more."* The choices are **Turn on now** and **Not now**. Neither is pre-selected, and the step shows the download size and the machine's detected RAM.
  - **In Settings → Find similar**, the same switch can be flipped at any time. The panel also shows:
    - the download and indexing progress;
    - the disk space used;
    - a "Remove model" button that deletes the model and `embeddings.bin`.
- **While B is off:**
  - the "Looks similar" tab and the "drop an image to search" target are hidden, not shown greyed out;
  - typed searches only use A;
  - nothing in the app depends on B.
- **Indexing runs in the background at low priority**, a batch at a time, and can be paused. A machine that struggles stays usable.

The RAM guidance is our estimate and gets checked when the feature is built.

---

## 6. Tagging: fast for someone who has never heard of "chiaroscuro"

1. **Start with the operation, in plain words.** There is one button per operation, built from the taxonomy. The seed has four: *Stand out* (Differentiate) · *Hold together* (Group) · *Lead the eye* (Sequence) · *Make them think* (Infer). Operations are fully editable (Plan 3 decision, 2026-11-25), so artists can rename, add or delete them, from 1 to about 9, and number keys follow the order shown. Picking one narrows the techniques to that operation's.
2. **A visual picker.** Each technique card shows:
   - its diagram icon;
   - one or two examples from the artist's own library, or from the demo set;
   - a one-line description.
3. **Domain is inferred.** It shows as a muted chip beside the chosen technique, and the app asks only when the technique sits under more than one domain for that operation. The domain stays visible in the inspector and the Tree, where it teaches.
4. **Synonym search.** Typing "spotlight", "moody" or "shadow" finds *Chiaroscuro*.
5. **"Tag like this."** Drop a new image onto an existing reference to start with that reference's techniques already ticked.
6. **Region tagging.** Drag a box on the image in the lightbox, then pick a technique for that box.
7. **Inline custom technique.** Choose "+ New technique" right in the picker.
8. **Full keyboard flow.** Number keys pick the operation, typing searches, Enter applies, and arrows move to the next Inbox item. Undo and redo cover everything.

---

## 7. Seed taxonomy and IP

**Your question was: aren't art names non-copyrightable?** Broadly, yes. This is our non-lawyer reading of US law, and most other countries follow the same principle:

- **Names, titles and short phrases** cannot be copyrighted. That covers technique names such as "Form substitution" and "Chiaroscuro".
- **Ideas, methods and systems** cannot be copyrighted either. "Differentiate through semantic contrast" is a method.
- **What can be protected** is:
  - **The written text.** Iris's definitions, explanations and captions belong to Iris, so we write our own.
  - **The images.** Their example images are other people's copyrighted work, so we ship our own demo set.
  - **The look.** Their visual design is theirs; we use our own style, per your round-2 answer.
  - **A trademark.** Using "Iris" or "A Taxonomy of Visuals" as our product name would be a problem, so we don't.
- **A thin "compilation" protection** can cover a creative selection and arrangement of uncopyrightable items. That makes copying their *entire* taxonomy word for word the one grey area. Writing our own definitions and links does **not** remove that risk for the seed that ships in v1; what matters is how much the shipped selection and arrangement match theirs. To lower it in practice:
  - write all definitions and descriptions ourselves;
  - draft the missing operation → domain → technique links from our own reasoning, which will differ from theirs;
  - before launch, have a lawyer compare the shipped `taxonomy.json` with what Iris publishes.

**So, per your answer, we use the reel's names as the seed:**

- All 4 operations: Differentiate, Group, Sequence, Infer. These are the seed. Artists can later rename, add or delete operations, and add new domain types (Plan 3 decision, 2026-11-25).
- The 6 domains: Feature, Grouping, Space, Social, Semantic, Cultural.
- All 41 technique names.

On top of the seed:

- **Plain-English labels** for tagging, for example "Stand out" → Differentiate, shown next to the real name.
- **Our own definitions, synonyms and citations** for every node, citing Gestalt research, Arnheim, cinematography and semiotics.
- **The first build deliverable** is a complete `taxonomy.json` with every operation → domain → technique link and a one-line definition for each. You correct it before anything ships.

**Remaining risk:** some reputational pushback from the design community, plus the thin compilation grey area. Get a quick legal check before the public launch.

---

## 8. Visual identity

We keep the **interaction model** of the original, per your round-2 answer. The selected path always reads operation → domain → technique → reference, as a breadcrumb that grows as you go deeper. The path is **docked at the top of the inspector**.

We do not copy the original's **look**: the floating card, the red monospace `01 OPERATION` numbering, the colour spine, the typewriter text, or the yellow-green title lockup.

Our direction:

- A calm studio palette that stays out of the way of the images, which carry the colour.
- A docked inspector panel.
- Editorial type: one serif for titles and one grotesk for the UI, both licensed for distribution.
- Thumbnails at their true aspect ratio.

The full look is decided in a design pass after you approve the approach. This is a builder task, done with you.

---

## 9. Reliability: what artists won't forgive

- **Never lose data.**
  - Atomic saves: write a `.tmp` file, then rename it over the original.
  - A rolling `library.bak.json`.
  - Undo and redo.
  - Images are copied into the library. Originals are never moved or modified.
- **Duplicates.** A BLAKE3 hash on import catches the same image saved twice, and the app offers to merge the two.
- **Speed at 2,000+ references.**
  - Two thumbnail sizes, 256 px and 1024 px, generated on Rust background threads.
  - Originals are decoded only in the lightbox.
  - The canvas draws only what is on screen.
- **Colour accuracy.** Convert embedded ICC profiles (for example Display P3) to sRGB when making thumbnails, so colours don't wash out.
- **Import.** Drag and drop, paste, a folder (recursive), and the file picker. The source URL is kept when it is known.

---

## 10. How to build it

| | **Tauri v2: Rust core + web UI** (✅ your choice) | **egui: pure Rust** | **gpui: pure Rust** (the framework behind the Zed editor) |
|---|---|---|---|
| What the artist notices | A polished, Figma-like feel: crisp mixed typography and smooth 60 fps canvas animation | Instant start-up and low memory use, but it looks like a programmer's tool unless we custom-build heavily | A snappy native feel, but less standard UI polish |
| Who does what | Rust handles the library, import, hashing, thumbnails, ICC, correlation maths and the search index. TypeScript draws the canvas with **PixiJS (WebGL)**, which keeps 2,000+ thumbnails visible at once at 60 fps, and the HTML panels. | All Rust. The graph, text and animation are custom-painted. | All Rust. |
| Risk | Two languages; uses the system WebView | Polished editorial typography and animation are hard to get | Thin documentation, frequent API changes, and Windows support is AGY's claim, not checked |

Decided in round 2: **Tauri v2**. The egui and gpui columns are kept only as a record of the alternatives.

In practice:

- The **core is Rust**: the library, import, thumbnails, correlation and the search index.
- The **interface is TypeScript**: a PixiJS canvas plus HTML panels, inside Tauri's WebView.
- **Layout** uses `d3-force` running in a Web Worker for the Galaxy, and fixed band and radial maths for the Tree and Radial views.
- **Culling** draws only the thumbnails in view; at far zoom it swaps to 256 px textures or coloured dots.
- **No file watching in v1.** The app owns the library folder; editing it from outside while the app runs is not supported.
- It is cross-platform: Windows, macOS and Linux.
- It runs locally, with no server.

---

## 11. Goals, non-goals, anti-goals

**Goals**

- An artist adds their references and, within minutes, sees which ones connect and why.
- Intake never blocks.
- Tagging is fast enough to do in bulk.
- Smooth with 2,000+ references.
- It never loses work.

**Non-goals for v1**

- Accounts, cloud sync and sharing.
- Mobile.
- Claude-assisted tagging (v2). It would use a vision model; CLIP alone cannot detect techniques.
- An always-on-top board window (v1.1).
- Exporting to PureRef's `.pur` format. It is an undocumented binary format; export to a folder instead.
- Importing from Pinterest or Are.na.

**Anti-goals**

- **It becomes a mood board** that sorts by style.
- **It becomes an Iris clone:** a screenshot of ours could be mistaken for theirs.
- **The animation slows down work.** Every effect is instant or can be switched off after the first time.

---

## 12. Questions for you

None open. All decisions are recorded in §0.

---

## 13. Validation by AGY (independent review of draft 4)

**Verdict: PASS WITH FIXES.** All five fixes below are now applied in this draft:

1. **Tag schema, Inbox and scoring (§3, §4).**
   - A partial tag carries only `operationId`.
   - A technique tag always records its `branchId`.
   - The Inbox is derived from tags, not stored.
   - IDF is smoothed, and region tags are deduplicated.
2. **CLIP claims (§5a, §12).**
   - Text search is added to option B.
   - The model is an optional download.
   - "Auto-tagging for free" is removed, and the spec now says plainly what CLIP can't do.
3. **Stale §0 wording and taxonomy editing (§0, §1, §5).** Taxonomy editing is explicitly in v1, in the Tree view's inspector.
4. **The compilation-risk hedge in §7 is tightened.**
5. **Build-blocking choices (§3, §10).**
   - PixiJS is chosen, with d3-force in a worker and culling.
   - File watching is cut from v1.
   - The `source` field is merged into `credit`.

**Left to the builder or to the later design pass, as AGY noted:** palette, inspector layout, Radial geometry and the intro-card storyboard (§8).
