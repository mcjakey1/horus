# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

(The product is a Tauri v2 desktop app, but its interface is a web UI rendered in the system WebView, so its design language is web, not native OS.)

## Stack

- Tauri v2.
- A Rust core: library, import, hashing, thumbnails, ICC conversion, correlation and the search index.
- A TypeScript UI: a PixiJS (WebGL) canvas for the graph views, and HTML panels.
- `d3-force` runs in a Web Worker for layout.
- Confirmed by the user in round 2 of SPEC.md.

## Users

Working artists in any medium: illustration, concept art, photography, film and advertising. Each one keeps a personal collection of visual references.

Their job is to connect their own references to one another and see why they relate. "Why" means by the technique an image uses, not by its look, subject or trend.

In the user's words: *"usable for actual artists who want their references connect to other references and see their correlation."*

## Product Purpose

Horus is a local reference workbench. Artists:

1. drop in their references;
2. tag *how* each image works: an operation, a domain, a technique and, optionally, a region of the image;
3. see which references connect, and why.

The taxonomy explains each connection; it is not the destination.

Success means an artist adds references and, within minutes, sees meaningful connections. Intake never blocks, and work is never lost.

## Positioning

Horus is distinct from Iris™ ("A Taxonomy of Visuals" by Modern Art Direction), a curated, invite-only web encyclopedia of ads, posters and covers:

- **Your own library, in any medium.** No curated archive.
- **Image-first.** Start from a reference and see what it connects to.
- **Desktop and local.** Works offline, in a library folder the artist owns. No sign-up.
- **Region crops.** Different parts of one image can carry different techniques.
- **Links the artist draws** between references, each with a "why" note, alongside the links that come from the taxonomy.

## Operating Context

- **Studio desktop use.** Horus runs alongside Photoshop, Blender, Figma and PureRef.
- **Workflows:**
  - Hoard: fast intake into the Inbox.
  - Tag later.
  - Explore correlations.
  - Brief: Boards, exported to a folder.
  - Study: Lightbox and Compare, with a value toggle.
- **Scale:** libraries of 2,000 or more references.
- **Themes:** light and dark.

## Capabilities and Constraints

- The taxonomy has four levels: **Operation → Domain → Technique → Reference**. It is a DAG, because one technique can sit under several operation × domain pairs.
- The seed taxonomy uses the reel's names:
  - Operations: Differentiate, Group, Sequence, Infer.
  - Domains: Feature, Grouping, Space, Social, Semantic, Cultural.
  - About 41 techniques.
  - The definitions are our own.
- Operations have plain-English labels for tagging: *Stand out*, *Hold together*, *Lead the eye*, *Make them think*.
- **v1 includes:**
  - Views: Reference (home), Compare, Taxonomy Tree, Galaxy and Radial.
  - Inbox, Boards, Lightbox and the intro card.
  - Region tags, links the artist draws, duplicate detection and taxonomy editing.
  - Windows, macOS and Linux.
- **Search is in v1:**
  - Idea search over techniques and notes.
  - An optional "Find similar" feature using a local CLIP model, downloaded on demand. Its results are labelled "Looks similar", never technique matches.
- **Search in v1:** Idea search is always on. Find similar is optional: the artist can turn it on during first-run setup or in Settings, and it is off until they do, because some machines can't run the model comfortably.
- **Correlation scoring:**
  - Same technique scores with smoothed IDF.
  - Same operation × domain scores 0.3.
  - Same operation only scores 0.
  - Scores use cosine similarity over technique (IDF) and branch (0.3) entries.

## Brand Commitments

- Working name: **Horus**. A trademark search is pending.
- The user asked for a design "like the modernartdirection app with major distinctions". It should be close to Iris's feel and interaction model, but clearly not a clone:
  - The breadcrumb path is kept, docked in an inspector instead of a floating card.
  - We do not use Iris's name, title lockup, copy or images.
- There is no logo, palette or type commitment yet.

## Evidence on Hand

- `REFERENCE-ANALYSIS.md` and `reference/`: frames from the Iris reel and notes from its site. These are **third-party material, for reference only**. They must never ship or go into a public repository.
- There is no demo image set yet. The plan is about 50 public-domain or CC0 works, with rights checked item by item.
- There are no testimonials, users, pricing or metrics. Do not fabricate any.

## Product Principles

1. **Mechanism over aesthetic.** Every connection is explained by a technique, never by "looks similar" alone.
2. **The image leads.** References are the content. The interface recedes and carries no colour that competes with the work.
3. **Intake never blocks.** Capture first and classify later; partial tags are fine.
4. **The path is always readable.** Wherever you are, operation → domain → technique → reference is visible.
5. **Never lose work.** Atomic saves, backups and undo.

## Accessibility & Inclusion

No product-specific requirement has been set yet. Default to WCAG 2.2 AA for the UI chrome. Images are the content and are exempt from colour-contrast rules.
