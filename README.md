<h1 align="center">Horus</h1>

<p align="center">
  <strong>A reference library for artists that connects images by the technique they use.</strong><br>
  Horus keeps your reference images in a local folder. You tag each image with the visual technique it uses. Horus then shows which references are related and why.
</p>

<p align="center">
  <a href="#how-it-works"><strong>How it works</strong></a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#run-it-locally">Run it locally</a>
</p>

<p align="center">
  <img alt="Tauri 2" src="https://img.shields.io/badge/Tauri-2-24C8DB">
  <img alt="Rust core" src="https://img.shields.io/badge/core-Rust-B7410E">
  <img alt="TypeScript UI" src="https://img.shields.io/badge/UI-TypeScript-3178C6">
  <img alt="Platform: Windows" src="https://img.shields.io/badge/platform-Windows-0078D6">
  <img alt="Status: early beta" src="https://img.shields.io/badge/status-early%20beta-777776">
</p>

<p align="center">
  <img src="docs/images/reference-view.png" alt="The Reference view shows a poster on a grey card, numbered region callouts, and a list of related references" width="860">
</p>

## The problem

An artist collects hundreds of reference images for a project. Folders and mood boards sort these images by subject or by style. They do not show why an image works.

For example, a film still and a poster can use the same silhouette against a light background. A folder keeps them apart. Horus connects them through the technique "Silhouette".

Horus is for illustrators, concept artists, photographers, and designers who keep their own reference collections.

## Screenshots

<table>
  <tr>
    <td width="50%">
      <img src="docs/images/first-run.png" alt="The first-run screen with the library, demo set, and Find similar steps. The Find similar step shows Download: 213 MB and the RAM of the computer">
      <br><sub><strong>First run.</strong> Make a library folder, add the demo set, and decide about Find similar. This step shows the download size and the RAM of your computer.</sub>
    </td>
    <td width="50%">
      <img src="docs/images/value-view.png" alt="The Reference view with Value view on, which shows the poster in grayscale">
      <br><sub><strong>Value view.</strong> Show all images in grayscale to compare light and dark values.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/images/import-summary.png" alt="A notice that tells how many references Horus added and which files have warnings">
      <br><sub><strong>Import summary.</strong> Horus tells you what it added, what it skipped, and why.</sub>
    </td>
    <td width="50%">
      <img src="docs/images/reference-view.png" alt="Callouts for Silhouette and Crop at the edge, with related thumbnails and scores">
      <br><sub><strong>Callouts.</strong> Each numbered callout names a technique and shows related references with a score.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/images/tree-view.png" alt="The Tree view with the path Differentiate, Feature, Rim light selected, its four references below it, and the inspector on the right">
      <br><sub><strong>Tree view.</strong> Select a technique to show its path. The inspector shows its definition, synonyms, branches, and references.</sub>
    </td>
    <td width="50%">
      <img src="docs/images/tree-edit.png" alt="The dialog 4 references use Rim light, with a list of other techniques and the option to keep them as partial tags">
      <br><sub><strong>Safe delete.</strong> Before Horus deletes a technique, you move its tags to a different technique or keep them as partial tags.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/images/galaxy-view.png" alt="The Galaxy with Toward Los Angeles, Calif selected, edges to its neighbors, and a list of related references with scores">
      <br><sub><strong>Galaxy.</strong> Edges show for the selected reference. The inspector lists related references with a score and a shared technique.</sub>
    </td>
    <td width="50%">
      <img src="docs/images/radial-view.png" alt="The Radial view with Differentiate at the center, its domains and techniques on rings, operation tabs at the top, and the operation list on the right">
      <br><sub><strong>Radial.</strong> Differentiate ("Stand out") at the center, with its domains and techniques on rings. Use the tabs to change the operation.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/images/boards-view.png" alt="The Boards view: the board Harbour light with 8 references as tiles, and a line at the bottom that shows the board and Show all">
      <br><sub><strong>Boards.</strong> The board "Harbour light" has 8 references. Only this board shows in the other views, and the line at the bottom tells you this.</sub>
    </td>
    <td width="50%">
      <img src="docs/images/compare-view.png" alt="Compare: Zodiaque (La Plume) and The Great Wave side by side, with a score of 0.49 and two shared techniques in the middle">
      <br><sub><strong>Compare.</strong> Zodiaque ("La Plume") and The Great Wave, with a score of 0.49. Two shared techniques are in the middle. The unique techniques are on each side.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%">
      <img src="docs/images/looks-similar.png" alt="The Reference view for Divan Japonais with the Looks similar tab open. The list shows Jane Avril, Zodiaque (La Plume), Moulin Rouge, La Goulue, and other posters, with no scores">
      <br><sub><strong>Looks similar.</strong> For Divan Japonais, the tab shows posters that look alike, for example Jane Avril. The tab does not show a score or a technique.</sub>
    </td>
    <td width="50%">
      <img src="docs/images/search-similar.png" alt="The search list for silhouette: the techniques Silhouette and Repoussoir, then a Looks similar group with three references and the line Works best in English">
      <br><sub><strong>Search with Find similar.</strong> The technique results are first. Below them, the "Looks similar" group shows references that look like your words. English words give the best results.</sub>
    </td>
  </tr>
  <tr>
    <td colspan="2" align="center">
      <img src="docs/images/settings-find-similar.png" alt="Settings with Find similar on: the switch, Ready · 50 references indexed, Disk space used: 214 MB, Remove model, and the model credit" width="640">
      <br><sub><strong>Settings → Find similar.</strong> The switch turns Find similar on or off. The panel shows the index status, the disk space that the model uses, and Remove model.</sub>
    </td>
  </tr>
</table>

## Features

- **Technique tags in four levels.** Each tag has an operation, a domain, a technique, and a reference. An example is "Differentiate → Feature → Silhouette".
- **Region tags.** You can tag one part of an image. The callout box shows the region on the image.
- **Related references with a score.** Horus compares the tags of two references. Rare techniques count more than common techniques. The score uses cosine similarity with IDF weights.
- **Search by idea.** Type a plain word, for example "moody" or "backlit". Horus finds the techniques that match, through their names, synonyms, and descriptions.
- **Find similar (optional).** Horus can also find references that look alike. It uses a local image model, Google SigLIP, on ONNX Runtime. You turn it on in the first run or in Settings. Horus then downloads the 213 MB model one time.
- **"Looks similar" tab.** In the Reference view, this tab shows the references that look like the current reference. The results are about the look of the image, not about technique.
- **"Looks similar" in search.** When Find similar is on, the search list has a "Looks similar" group below the technique results. Horus does not show a score for these results.
- **Drop an image to search.** Drag an image file onto the drop target next to the search box. Horus shows the references that look like it. Horus does not import this image.
- **Settings.** Select the gear to open Settings. There, you turn Find similar on or off and see the download and index progress. You can also pause the index or remove the model.
- **Tree view.** The Tree shows the taxonomy in four bands, from top to bottom: operations, domains, techniques, and references. The inspector on the right shows the selected item. A breadcrumb at the top of the inspector shows its path.
- **Taxonomy editing.** In the Tree inspector, you can rename an item, write its definition, and add or remove synonyms. Each edit is one undo step. Press `Ctrl+Z` to undo it.
- **Safe delete.** When you delete a technique, Horus shows how many references use it. You move its tags to a different technique, or you keep them as partial tags (operation only).
- **Operations and domains.** A library can have 1 to 9 operations. Each operation has its own ink color. Each domain has an icon.
- **Drag to link.** Drag a technique onto a different branch in the Tree. The technique then also occurs under that branch. Without a mouse, use **Also use under…** in the inspector.
- **Galaxy.** The Galaxy shows all references as points. A force layout puts references with high correlation scores near each other. The layout runs in a Web Worker.
- **Galaxy edges.** The Galaxy draws edges only for the hovered or selected reference. Each edge goes to one of its 8 strongest neighbors.
- **Radial view.** The Radial shows one operation at a time. The operation is at the center. Its domains, techniques, and references are on three rings. Press `1` to `9` to show a different operation.
- **Keyboard control.** In the graph views, `+` and `-` zoom, `0` fits the full graph, and the arrow keys pan. With a selection, the arrow keys move the selection. `Enter` opens the selected reference in the Reference view.
- **Boards.** A board is a named group of references for a project. Press `b` on a reference to open the board menu, then tick or clear a board. You can also make a new board there. In the Boards view, drag a tile, or press `Alt+←` and `Alt+→`, to change the order.
- **Show only this board.** This command limits the Ranked list and the search results to the references on the board. The graph views dim the other references. A line at the bottom shows the board and its count, with a **Show all** command.
- **Export a board.** Horus copies the original files of a board into a folder that you select, with numbers in board order, for example `1 - Title.jpg` and `2 - Title.jpg`. It also writes `credits.txt`. It never writes over a file: a name that exists gets ` (2)`. **Show in folder** opens the parent folder in the file manager, with the export folder selected.
- **Links that you draw.** Link two references and write why they are connected. Press `k`, or drag the link handle onto a different reference. Two references can have only one link. Your links show first, under "Linked by you". They never change a score.
- **Lightbox.** Press `l` to see the image at full size. Zoom with the mouse wheel or `+`, `-`, `0`, and `1` (100%). Pan with `Space`+drag or the middle mouse button. Region tags show as outlines; move the pointer over one, or press `Tab`, to see its name. Press `o` to hide the outlines.
- **Lightbox preview.** The lightbox shows JPEG, PNG, WebP, and GIF files at full size, up to 8,192 px. For a TIFF file or a larger image, Horus makes a PNG preview one time and keeps it in the app's cache folder. A note tells you that you see a preview.
- **Compare.** Shift-click a different reference in the Reference view or the Galaxy. Compare shows the two references side by side. The shared techniques are in the middle. The unique techniques are on each side. Press `v` for the value view, `x` to change the sides, and `Esc` to close.
- **Value view.** Press `v` to show all images in grayscale.
- **Safe import.** Horus copies each image into the library and does not change the original. It finds duplicates through a BLAKE3 hash. It makes 256 px and 1024 px thumbnails.
- **Correct color and orientation.** Horus converts embedded color profiles to sRGB for thumbnails. It applies the EXIF orientation of phone photos.
- **Safe saves.** Horus writes each save to a temporary file first. It keeps a backup copy of the last good library file. It can open a library from its backup.
- **Demo set.** The app includes 50 public-domain works with suggested tags. Use them to learn the app before you add your own images.
- **Local and offline.** Horus does not use a server or an account. The library is a folder that you own. The only network use is the one model download for Find similar.
- **Light and dark themes.** The image card stays the same neutral grey in both themes. This keeps the colors of your references accurate.

## How it works

```mermaid
flowchart LR
  A[Image files] --> B[Copy and hash]
  B --> C[Thumbnails and color]
  C --> D[library.json]
  D --> E[Technique tags]
  E --> F[Correlation index]
  F --> G[Related list]
```

1. **Import.** Select images or a folder. Horus copies each file into `images/` and gives it a hash name.
2. **Prepare.** Horus makes two thumbnails for each image. It converts the color to sRGB.
3. **Save.** Horus records each reference in `library.json`. It writes a backup before each save.
4. **Tag.** You tag each reference with techniques in the Inbox or in the Reference view. The demo set comes with suggested tags.
5. **Index.** Horus counts how often each technique occurs. Rare techniques get a higher weight.
6. **Relate.** Horus compares the tag sets of two references. It shows the strongest matches first.

### Find similar

```mermaid
flowchart LR
  A[Turn on] --> B[Download and verify]
  B --> C[Load the model]
  C --> D[Index thumbnails]
  D --> E[embeddings.bin]
  E --> F[Looks similar]
```

1. **Turn on.** You select **Turn on now** in the first run, or you turn on the switch in Settings.
2. **Download.** Horus downloads the model files from Hugging Face, at one pinned revision. It checks the SHA-256 of each file. If you quit during the download, the download continues from the same point at the next start.
3. **Load.** Horus loads ONNX Runtime from the app folder, and then the model. The model uses the CPU only.
4. **Index.** Horus makes a list of 768 numbers (a vector) from the 1024 px thumbnail of each reference. It saves the vectors in `embeddings.bin` in the library folder. New imports go into the index automatically.
5. **Search.** Horus compares the vectors by cosine similarity. It shows only the results above a minimum value: 0.55 for image to image, and 0.05 for words to image.

The model files are in the app's local data folder, in `models/siglip-b16-224-q8/`, and all libraries use the same files. On Windows, this folder is in `%LOCALAPPDATA%`.

### The library folder

| Item | Contents |
|---|---|
| `library.json` | All references, tags, and links |
| `library.bak.json` | The last good copy of `library.json` |
| `taxonomy.json` | The operations, domains, and techniques for this library |
| `images/` | Copies of the original images, named by their BLAKE3 hash |
| `thumbs/256/`, `thumbs/1024/` | Thumbnails in two sizes |
| `embeddings.bin` | The Find similar index (only when Find similar is on) |

If you select a folder that contains other files, Horus makes the library in a `Horus Library` subfolder. It does not change your other files.

## The taxonomy

The seed taxonomy has 4 operations, 6 domains, and 48 techniques. The four operations are:

| Operation | Plain label |
|---|---|
| Differentiate | Stand out |
| Group | Hold together |
| Sequence | Lead the eye |
| Infer | Make them think |

A technique can occur under more than one operation and domain. The full taxonomy is in [`taxonomy/taxonomy.json`](taxonomy/taxonomy.json), with a description and citation for each technique.

## The Find similar model

| Item | Value |
|---|---|
| Model | Google SigLIP base, patch 16, 224 px (Apache-2.0), 8-bit ONNX export `Xenova/siglip-base-patch16-224` |
| Download | 213,373,093 bytes (213 MB), one time, from Hugging Face |
| Runtime | Microsoft ONNX Runtime 1.31.1 (CPU), in the installer |
| Installer size | Windows: about 24.4 MiB (NSIS) and 28.1 MiB (MSI). The model is not in the installer. |

These values come from the Plan 5 checks on a Windows 11 computer with 16 GB of RAM:

| Check | Result |
|---|---|
| Index the 50 demo references | About 14 s (release build) |
| Index 2,500 references | About 12.3 minutes, at 0.295 s for each image (debug build) |
| Peak memory of `horus.exe` while it indexes | 363 MB |
| Search with words, when the index is complete | 68–110 ms |
| Search with words, while the index runs | 313–359 ms |
| Frame time in the Reference view while the index runs | 18.8 ms or less |

For all the measured values, read [`app/README.md`](app/README.md#find-similar-verification-numbers-plan-5-task-8).

## Run it locally

### Prerequisites

- Windows 10 or Windows 11
- [Rust](https://rustup.rs/) (stable, MSVC toolchain)
- Visual Studio Build Tools with the "Desktop development with C++" workload
- [Node.js](https://nodejs.org/) 24
- Microsoft Edge WebView2 (Windows 11 has it)

### Start the app in development mode

1. Open a terminal in the `app` folder.
2. Install the packages:

   ```bash
   cd app
   npm install
   ```

3. Get ONNX Runtime for Find similar. This command downloads the library one time, checks its SHA-256, and puts it in `src-tauri/ort/`:

   ```bash
   npm run fetch:ort
   ```

4. Start the app:

   ```bash
   npm run tauri dev
   ```

5. On the first-run screen, select **Create a new library…**.
6. Keep **Start with the demo set** selected.
7. For Find similar, select **Turn on now** or **Not now**.
8. Select **Begin**.

### Run the tests

```bash
cd app
npm test
cd src-tauri
cargo test
```

### Make the Windows installers

1. Open a terminal in the `app` folder.
2. If `src-tauri/ort/` is empty, run `npm run fetch:ort`. The installers include this ONNX Runtime library.
3. Make the release build:

   ```bash
   npm run tauri build
   ```

4. Find the installers in `app/src-tauri/target/release/bundle/`:
   - `msi/Horus_0.1.0_x64_en-US.msi`
   - `nsis/Horus_0.1.0_x64-setup.exe`

The installers are not signed. Windows SmartScreen can show "Windows protected your PC". To continue, select **More info**, then **Run anyway**.

## Project status

Horus is an early beta. The project has six plans in [`docs/superpowers/plans/`](docs/superpowers/plans/).

| Plan | Scope | Status |
|---|---|---|
| 1 | Foundation: library, import, related references, search, first run, Windows build | Done |
| 2 | Tagging, Inbox, undo and redo, drag and drop, library menu | Done |
| 3 | Tree, Galaxy, and Radial views; taxonomy editing | Done |
| 4 | Boards, Lightbox, Compare, and links between references | Done |
| 5 | Find similar (local SigLIP image model) and Settings | Done |
| 6 | Intro card, macOS and Linux builds, release checks | Planned |

## Architecture

| Path | Responsibility |
|---|---|
| `app/src-tauri/src/library.rs` | Library folder, safe save, and backup recovery |
| `app/src-tauri/src/import.rs` | Copy, hash, thumbnails, color conversion, and duplicate check |
| `app/src-tauri/src/taxonomy.rs` | Load and validate the taxonomy |
| `app/src-tauri/src/correlate.rs` | Related-reference scores and the Galaxy edges (`graph_edges`) |
| `app/src-tauri/src/search.rs` | Search by idea |
| `app/src-tauri/src/edit.rs`, `history.rs` | Validated edits to tags and the taxonomy, with undo and redo |
| `app/src-tauri/src/commands.rs` | Tauri commands that the UI calls |
| `app/src-tauri/src/commands/taxonomy_edit.rs` | Tauri commands for taxonomy edits |
| `app/src-tauri/src/export.rs` | Board export to a folder, with `credits.txt` |
| `app/src-tauri/src/demo.rs` | Demo set seed |
| `app/src-tauri/src/similar/` | Find similar: the model table, the download, the SigLIP encoder, the index store, the indexer, and the error text |
| `app/src-tauri/src/commands/similar.rs` | Tauri commands and status events for Find similar, and the index start and stop around a library change |
| `app/scripts/fetch-ort.mjs` | Downloads and checks the pinned ONNX Runtime library (`npm run fetch:ort`) |
| `app/src/` | TypeScript UI: Reference view, first run, and import |
| `app/src/graph/` | Graph engine: camera, culling, level of detail, texture cache, layouts, PixiJS scene, and the force-layout worker |
| `app/src/views/` | Tree, Galaxy, and Radial views, the inspector, the move-tags dialogs, and the technique form |
| `app/src/boards/` | Boards view, the board menu, the board scope line, and export |
| `app/src/links/` | Link editor |
| `app/src/compare/` | Compare view |
| `app/src/lightbox/` | Lightbox: zoom and pan (`zoom.ts`), and the tag picker docked in the lightbox (`dock.ts`) |
| `app/src/similar-ui.ts`, `app/src/settings/` | The "Looks similar" tab, the drop target, the status line, and the Settings panel |
| `taxonomy/` | Seed taxonomy and its check script |
| `demo/` | Demo images, manifest, and rights record |
| `prototype/` | HTML prototype of the Reference view |
| `scripts/make_perf_library.py` | Synthetic 2,500-reference library for the [performance check](app/README.md#performance-check) |

For the product design, read [`SPEC.md`](SPEC.md), [`PRODUCT.md`](PRODUCT.md), and [`DESIGN.md`](DESIGN.md).

## Limits

- You cannot edit the title, creator, year, or credit of a reference yet.
- Compare opens from the Reference view and the Galaxy only. It does not open from the Tree or the Radial.
- **Show in folder** opens the parent folder and selects the export folder in it. It does not open the export folder.
- Plan 6 fixes two small problems from Plan 4 QA. In the lightbox, `Esc` in the **Add technique** form closes the lightbox. In the Boards view, the first column cuts off the tile tools that show on hover.
- At the zoom that fits the full graph, the Tree and the Radial hide the names of items. Zoom in to read them. Plan 6 adds a minimum name size.
- In the Tree, **Show all references** draws the references of each technique as one thin column.
- A long import shows "Importing…" only. It does not show a count or a Cancel button yet.
- Only Windows builds are available. Plan 6 adds macOS and Linux builds. On macOS, Horus supports Apple Silicon only. There is no build for Intel Macs.
- On x86 computers, Find similar needs a processor with AVX2. Without AVX2, Settings tells you that the processor cannot run Find similar.
- Find similar search with words works best in English.
- While the index runs, a search with words can be slower (about 0.3 s).
- The first search with words after a start takes up to 0.9 s, because Horus loads the text part of the model at that time.
- Nobody has tested the installers on a computer without a network connection yet.
- The security policy (CSP) still allows inline styles. Plan 6 removes this permission.

## Data and privacy

- Horus does not send your data over the network.
- Find similar downloads its model one time, from Hugging Face. It does not send your images or your search words. The model runs on your computer.
- Find similar is off until you turn it on. When you turn it off, the model stays on disk. **Remove model** in Settings deletes it.
- Horus does not change your original image files. It copies them into the library folder.
- All library data stays in the library folder on your computer.
- Horus uses `tauri-plugin-opener` only to show an export folder in the file manager.
- Lightbox previews of TIFF files and very large images stay in the app's cache folder on your computer.

## Credits

- **Demo images:** The Art Institute of Chicago (CC0) and the Library of Congress (no known restrictions on publication). Each item has its rights record in [`demo/README.md`](demo/README.md).
- **Fonts:** Source Serif 4 (Adobe) and Red Hat Mono (Red Hat), under the SIL Open Font License 1.1.
- **Taxonomy:** The seed technique names come from the Iris™ taxonomy by Modern Art Direction. The descriptions and links are original. [`SPEC.md`](SPEC.md) §7 records the IP position. A legal review must occur before a public release.

## License

This repository does not have a license yet. The author keeps all rights.
