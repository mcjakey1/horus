### Task 7: The Galaxy view

**Files:**
- Create:
  - `app/src/graph/force.ts`: the pure simulation setup, testable in Node;
  - `app/src/graph/force.worker.ts`;
  - `app/src/views/galaxy.ts`.
- Modify:
  - `app/src/firstrun.ts` `boot()`: `shell.register("galaxy", …)` on the `[data-view-host="galaxy"]` host (ruling B2);
  - `app/src/styles.css`: the Galaxy inspector, in its own block.
- Test:
  - `app/src/graph/force.test.ts` (Node);
  - `app/src/views/galaxy.test.ts`, using a fake `Scene` and a fake worker.

**Interfaces:**
- Consumes `api.graphEdges` (Task 1), `api.related` (Plan 1; `Scored.sharedTechniques`), `Scene` and `Mods` (Task 4), and `DataSource` (Task 2). It does not use Task 6's `navigate.ts`, because Tasks 6 and 7 run in the same wave. `d3-force` comes from Task 4's `package.json`; this task's worktree runs its own `npm install`.
- Produces:
  ```ts
  export type ForceIn = { ids: string[]; edges: Edge[]; seed: number; prev?: Record<string, { x: number; y: number }> };
  export function runForce(input: ForceIn, ticks: number): Record<string, { x: number; y: number }>;   // synchronous; the worker calls it in batches
  export function initialPosition(id: string, seed: number): { x: number; y: number };   // deterministic from a hash of id
  // worker protocol
  type ToWorker = { type: "start"; input: ForceIn } | { type: "stop" };
  type FromWorker = { type: "tick"; ids: string[]; xy: Float32Array /* transferable, 2 per id */; alpha: number } | { type: "end" };
  export function mountGalaxy(host: HTMLElement, data: DataSource, deps: { api: Api; openReference(id: string): void;
    openCompare?(a: string, b: string): void;   // Plan 4 mountCompare, wired in boot() when present
    makeScene?: (el: HTMLElement) => Promise<Scene>; makeWorker?: () => Worker }): ViewHandle;
  ```
- **The worker (R7):**
  - The default `makeWorker` is `() => new Worker(new URL("../graph/force.worker.ts", import.meta.url), { type: "module" })`, written in `views/galaxy.ts`. Vite resolves the URL relative to the importing file and emits a same-origin chunk, which passes `default-src 'self'`. **Never `?worker&inline`:** it makes a `blob:` URL, which the CSP blocks.
  - `force.worker.ts` types its scope with a local cast (`self as unknown as { postMessage(m: FromWorker, t: Transferable[]): void; onmessage: ((e: MessageEvent<ToWorker>) => void) | null }`). Do not add `WebWorker` to the global `tsconfig` `lib`, because it conflicts with `DOM`.
  - `runForce` builds `forceSimulation(…)` with `.randomSource(lcg(seed))`, calls `.stop()` at once (d3-force otherwise starts its own timer), then `.tick(n)`. This is what makes `deterministic` pass.
- **The simulation:**
  - `forceLink(edges)`, with `strength = score` and `distance = 40 + 160 × (1 − score)`;
  - `forceManyBody`, with strength −30;
  - `forceCenter`;
  - `forceRadial(R_OUT)`, strength 0.08, applied **only** to references with no edges, so untagged references form an outer ring. `R_OUT` is 1.25 times the radius of the connected cluster, measured after warm-up.
- **Warm start:** nodes that are in `prev` start at those positions. A new node starts at the mean of its neighbours that have a `prev` position, or at `initialPosition` if none do.
- **The worker** posts a `tick` message every 10 ticks. It stops when alpha drops below 0.01, or after 600 ticks. Under `prefers-reduced-motion: reduce`, the view draws only the `end` positions, not each `tick` (C13).
- **Nodes:** each reference is a `NODE`-sized ref node, drawn with the full image (no region outline).
- **Edges:**
  - **Hover:** the hovered reference's top `K_EDGES` edges, neutral `--ink-2`, with width `EDGE_W0 + EDGE_W1 × score`.
  - **Select:** the selected reference keeps its edges until Esc.
  - **Shift-click (Cross-plan audit row 25, SPEC §5 Compare):** Shift-clicking a reference node while another is selected calls `openCompare(selected, clicked)`. The scene's `select` event carries `mods.shift` (R9).
  - **Board scope (audit row 10):** references out of scope are `dim` nodes (dots, never picked), and none of their edges are drawn.
  - Otherwise no edges are drawn.
- **The inspector, on selection:** the title; the ranked neighbours, each with "shares *technique*, …" in serif names and the score in mono; and "Open in Reference view". `Edge` carries only a score, so on selection the view calls `api.related(id)` and takes the names from `Scored.sharedTechniques` (C18).
- **Data changes and library switches** follow Review Focus 3: a store change warm-starts the layout and keeps the camera and selection (or clears a deleted one); a `{ reset: true }` event clears the selection, cold-starts and calls `fitAll()` (C20).
- **Keys:** the Galaxy's own small canvas handler: Esc clears the selection, Enter opens the selected reference, and it returns early on `isTextEntry(e.target)` (`keys.ts:10`; C19).
- **Empty states:**
  - "No references yet." when the library has none.
  - "Tag references to see them cluster." as an inspector note when no reference has edges (Review Focus 2).

- [ ] **Step 1: Write the failing tests**
  - Force:
    - `two_cliques_separate`: two 10-node cliques with internal score 0.8 and one bridge at 0.06. After `runForce(…, 300)`, the mean distance between cliques is more than twice the mean distance within a clique.
    - `deterministic`: the same input and seed give identical output.
    - `zero_degree_on_outer_ring`: five isolated nodes all end farther from the centroid than every connected node.
    - `warm_start_moves_less`: add one node to a settled 50-node layout. The old nodes' mean displacement after `runForce(prev, 100)` is less than 25% of their displacement from a cold start.
    - `no_nan`: with 0 edges and 3 nodes, every coordinate is finite.
  - Galaxy:
    - `edges_only_on_hover`: after the layout, `setEdges` was last called with `[]`. A hover on `a` calls it with exactly `a`'s edges, each with `width === 0.75 + 2.25 * score`. A hover on `null` calls it with `[]` again.
    - `select_pins_edges`: after `select("a")`, a hover on `b` and then on `null` leaves `a`'s edges drawn.
    - `shift_click_opens_compare`: with `a` selected, the fake scene's `select("b", { shift: true })` calls `openCompare("a", "b")`. Without a selection, it only selects `b`.
    - `out_of_scope_no_edges`: hovering a reference whose neighbour is out of scope draws no edge to that neighbour.
    - `inspector_names_shared_techniques`: selecting `a` calls `api.related("a")`, and each neighbour row shows its `sharedTechniques` names.
    - `data_change_warm_starts`: a store change posts `start` with `prev` holding every previously placed id.
    - `reset_cold_starts`: a `{ reset: true }` event posts `start` with no `prev` and clears the selection.
    - `empty_library_copy`: zero references render "No references yet."

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- graph/force views/galaxy`. It should FAIL, then PASS. Then run `npm test` and `npm run build`; the build output contains a separate worker chunk.

- [ ] **Step 3: Manual check**

  Run `npm run tauri dev` on the demo library. Expected:
  - The clusters settle within about 2 s.
  - Hovering shows edges.
  - The UI never freezes while the layout runs, so the worker is doing the work.

- [ ] **Step 4: Commit**

  Commit message: `feat(ui): Galaxy view with worker force layout and hover edges`.

---

