### Task 5: Boards (the view, membership, scope and export)

**Files:**
- Create: `app/src/boards/view.ts`, `app/src/boards/menu.ts` and `app/src/boards/status.ts` [R16].
- Modify:
  - `app/index.html`: add `<section class="graph-host" data-view-host="boards">` beside the other hosts (`index.html:63-66`), and a `<span id="board-scope">` in the footer (`index.html:68-79`). The Boards tab already exists (`index.html:19`), and `register()` enables it (`views.ts:54-59`) [R15];
  - `app/src/firstrun.ts`: `shell.register("boards", …)` and the status wiring in `boot()` [R15, R16];
  - `app/src/reference/view.ts`, to add the "Boards" section to the inspector and apply the scope;
  - `app/src/views/tree.ts` and `app/src/views/galaxy.ts`, for the scope items Plan 3 deferred [R17];
  - `app/src/styles.css`: append a "Plan 4 Task 5" section, including `body[data-view="boards"] > [data-view-host="boards"]` (see `styles.css:300-304`) [R15, R25];
  - **opener** [B3]: `app/src-tauri/Cargo.toml` (`tauri-plugin-opener`), `app/package.json` (`@tauri-apps/plugin-opener`), `app/src-tauri/src/lib.rs` (`.plugin(tauri_plugin_opener::init())`) and `app/src-tauri/capabilities/default.json` (add only `opener:allow-reveal-item-in-dir`);
  - `app/src/api.ts` (`revealFolder`), `app/src/api.contract.test.ts` (`NON_IPC_KEYS`), and the typed `Api` fakes in `firstrun.test.ts` and `reference/view.test.ts`.
- Test: `app/src/boards/view.test.ts`, `app/src/boards/menu.test.ts`, `app/src/boards/status.test.ts`, and new cases in `app/src/reference/view.test.ts`, `app/src/views/tree.test.ts` and `app/src/views/galaxy.test.ts`.

**Interfaces:**
- Consumes Task 3's board commands and `exportBoard`, `store.scope`, `setScope` and `inScope`, `api.pickFolder` [R18], `mountWindowedGrid` [C4] and `noticeIn` [C17].
- Registration: in `boot()`, `shell.register("boards", () => mountBoards(host, api, store, { openReference: shell.openReference }))`, where `"boards"` is already a `ViewId` [R15].
- Produces:
  ```ts
  export function mountBoards(root: HTMLElement, api: Api, store: Store, deps: { openReference(id: string): void }): ViewHandle;   // [R15]
  export function mountBoardMenu(anchor: HTMLElement, api: Api, store: Store, refId: string): { close(): void };
  export function moveItem(ids: string[], from: number, to: number): string[];   // pure reorder
  export function mountScopeStatus(el: HTMLElement, store: Store): () => void;   // boards/status.ts [R16]
  ```
- **The board menu**, opened with `b` in the Reference view or from the inspector's "Boards" section:
  - lists the boards with a checkbox each; ticking or unticking calls `setBoardMembers` with the reference appended or removed;
  - ends with "New board…", which creates a board containing this reference.
  - `BoardNameTaken:<id>` maps to "A board called <name> already exists.", and `EmptyName` to "Give the board a name." [R2].
- **The Boards view:**
  - shows a list of boards with their counts, and the selected board's grid of `thumb256` tiles at their true aspect ratio;
  - offers Rename, which edits inline, and Delete, which asks for confirmation and can be undone;
  - lets tiles be reordered by drag, or by Alt+← and Alt+→ on a focused tile. Each move makes one `setBoardMembers` call with `moveItem`'s result.
    - The drag uses **pointer events**, like the link handle in Task 4: a ghost tile follows the pointer, the insertion index comes from the tile under it, and the move is committed on `pointerup`. HTML5 DnD is never used (audit #2).
  - renders the grid with `loading="lazy"` and `decoding="async"` images at a fixed tile size, through `mountWindowedGrid` (`grid/windowed.ts:5`, whose header already says "Plan 4 reuses this") (audit #16) [C4];
  - offers "Remove from board", and "Open", which calls `deps.openReference(id)`.
- **"Show only this board":**
  - `setScope(boardId)`. `mountScopeStatus`, wired in `boot()` to `#board-scope`, reads "Board: <name> · N references · Show all". On `scopeCleared` it reads "Board removed — showing all references" [R16].
  - The Reference view's scored Ranked rows and search reference results keep only references for which `inScope` is true. Search filters through the existing `referenceTitle` hook, returning `undefined` for an out-of-scope id (`search.ts:47` drops it) [C17].
  - The "Linked by you" group stays, and each out-of-board row in it carries "Not on this board" (SPEC §4 "always shown") [R13].
  - A focused reference outside the board shows the chip "Not on this board" (Review Focus 5).
  - **Plan 3's graph views** see the scope through `storeSource` (Task 3, R8). Plan 3 already refuses `select` of a dim reference in the Tree and Radial (`tree.ts:193`, `radial.ts:219`) and dims out-of-scope nodes and edges. The three items Plan 3 deferred to "Plan 4, board scope" are closed here, because SPEC §2 says "filter the view to that board" [R17]:
    - **T6 M2:** `tree.ts:97-98` also clears `sel` when the selected reference falls out of scope, not only when it is gone.
    - **T6 M3:** the Tree's arrow keys (`tree.ts:209-211`) step past refused (out-of-scope) ids in the same direction, instead of stopping.
    - **T7 M10:** the Galaxy inspector rows list only `inScope` neighbours (`galaxy.ts:113`), and `select()` refuses out-of-scope ids (`galaxy.ts:122`, `:296-298`).
- **"Export board to folder…"** calls `api.pickFolder("Export board to folder")` [R18], then `exportBoard`. A toast through `noticeIn` [C17] then reads "Exported N to <folder>", where N is `report.written.length`, which counts images only [R21]. If anything was skipped, it adds "· M skipped" with an expandable list of the reasons. "Open folder" calls a new `api.revealFolder(path)`, which wraps the opener plugin's `revealItemInDir` [B3]. Like `pickFolder`, it is a plugin call, so it goes into `NON_IPC_KEYS` in `api.contract.test.ts:15`, and the two typed `Api` fakes (`firstrun.test.ts`, `reference/view.test.ts`) gain it.
- New tiles follow the "no new inline `style=`" rule [R26].

- [ ] **Step 1: Write the failing tests**
  - `moveItem(["a","b","c"], 0, 2)` gives `["b","c","a"]`, and out-of-range indices return the input unchanged.
  - Menu:
    - Ticking "Harbour" for `r3` calls `setBoardMembers(harbourId, [...members, "r3"])`.
    - "New board…" with the name "Ships" calls `createBoard("Ships", ["r3"])`.
    - A `BoardNameTaken:<id>` error shows "A board called Ships already exists." and keeps the menu open.
  - Boards view:
    - `mountBoards` returns a `ViewHandle`, with `show`, `hide` and `destroy`.
    - Alt+→ on tile 1 calls `setBoardMembers` with tiles 1 and 2 swapped.
    - `tile_pointer_reorder`: `pointerdown` on tile 1, `pointermove`, then `pointerup` over tile 3 calls `setBoardMembers` once with `moveItem(ids, 0, 2)`. A `pointercancel` calls nothing.
    - With 2,000 board members, the grid creates at most 200 `<img>` elements.
    - "Show only this board" sets `store.scope`.
    - "Open" calls `deps.openReference(id)`.
  - Status (`boards/status.test.ts`):
    - With a scope set, it reads "Board: Harbour · 10 references · Show all".
    - Delete, after confirmation, calls `deleteBoard`. When the deleted board was the scope, the status then reads "Board removed — showing all references".
  - Reference view, under scope:
    - Ranked and search hits hold only members.
    - A linked non-member stays in "Linked by you" with "Not on this board".
    - A focused non-member shows the "Not on this board" chip.
  - Graph views [R17], one test each:
    - Tree: a selected reference that falls out of scope is deselected.
    - Tree: an arrow key steps over an out-of-scope reference to the next in-scope one.
    - Galaxy: the inspector lists no out-of-scope neighbour, and `select` of an out-of-scope id does nothing.
  - Export:
    - An `Api` fake whose `pickFolder` returns `"D:/out"` makes the view call `exportBoard(id, "D:/out")` [R18].
    - A `pickFolder` that returns `null` (cancelled) calls nothing.
    - A report with 10 images and `credits: "credits.txt"` reads "Exported 10 to …" [R21].
    - A report with 1 skipped shows "· 1 skipped".
    - "Open folder" calls `api.revealFolder("D:/out")`.

- [ ] **Step 2: Run, then implement, then run again.** Run `npm test -- boards`, `npm test -- reference`, `npm test -- views`, then the full `npm test`, `npm run build` and `cargo clippy --all-targets -- -D warnings` (because of the opener plugin). All should FAIL first where new, then PASS.

- [ ] **Step 3: Commit.** Commit message: `feat(ui): boards with membership, show-only scope, reorder and export`.

---

