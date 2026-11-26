### Task 4: The PixiJS scene

**Files:**
- Create:
  - `app/src/graph/frame.ts`: the Pixi-free half (R6): `planFrame`, `classifyDrag`, `mountCanvasOrFallback`, `WebGLUnavailable`, and the `SceneNode`, `SceneEdge`, `FramePlan` and `Scene` types;
  - `app/src/graph/scene.ts`: `createScene` and `resolveColor`, the only module that loads `pixi.js`.
- Modify: `app/package.json` and `app/package-lock.json` (commit both), adding `pixi.js@^8` here, and `d3-force@^3` with `@types/d3-force` for Task 7.
- Test: `app/src/graph/frame.test.ts`, covering the fallback, the frame plan and the drag classifier only. It never imports `scene.ts` or `pixi.js`. WebGL itself is checked by hand in Step 4.

**Interfaces:**
- Consumes Task 3.
- Produces:
  ```ts
  // frame.ts (no pixi.js import)
  export type SceneNode =
    | { id: string; kind: "ref"; x: number; y: number; size: number; url: string; aspect: number;
        dim?: boolean;   // R9: out of scope (Plan 4 board scope): always "dot", never picked
        outline?: { region: Region; color: string; state: "full" | "partial" | "region" } }
    | { id: string; kind: "label"; x: number; y: number; text: string; font: "serif" | "mono"; color: string }
    | { id: string; kind: "op" | "branch" | "tech"; x: number; y: number; size: number; color: string; label: string };
  export type SceneEdge = { from: string; to: string; width: number; color: string; curve?: boolean };
  export type FramePlan = { visible: string[]; lod: Map<string, Lod> };
  export function planFrame(grid: SpatialGrid, nodes: Map<string, SceneNode>, cam: Camera, view: { w: number; h: number }): FramePlan;
  export function classifyDrag(startHit: string | null, draggable: (id: string) => boolean): "drag" | "pan";
  export type Mods = { shift: boolean };
  export interface Scene {
    setNodes(nodes: SceneNode[]): void;       // rebuilds the grid; keeps the camera
    setEdges(edges: SceneEdge[]): void;       // the caller decides which edges are visible
    camera(): Camera; setCamera(c: Camera, animate?: boolean): void; fitAll(): void;
    on(ev: "hover" | "select" | "activate", fn: (id: string | null, mods: Mods) => void): void;   // R9; activate = double-click or Enter
    setDraggable(pred: (id: string) => boolean): void;   // default: nothing is draggable
    onDrop(fn: (dragged: string, target: string | null) => void): void;   // target = node under the pointer on release
    select(id: string | null): void;          // also from the keyboard
    destroy(): void;
  }
  export class WebGLUnavailable extends Error {}
  export function mountCanvasOrFallback(host: HTMLElement, make: () => Promise<Scene>): Promise<Scene | null>;
  // scene.ts
  export function createScene(host: HTMLElement, api: Pick<Api, "assetUrl">): Promise<Scene>;   // rejects with WebGLUnavailable
  export function resolveColor(css: string): number;   // R8: "var(--x)" or "#rrggbb" -> 0xRRGGBB
  ```
- **Loading Pixi (B4, R6).** `createScene` does `const PIXI = await import("pixi.js"); await import("pixi.js/unsafe-eval");` before it creates the renderer. Views import `createScene` only as their default `makeScene`; their tests pass a fake.
- **WebGL only (C14).** `createScene` requires a WebGL renderer, so it never falls back to WebGPU. It maps a missing or failed WebGL context to `WebGLUnavailable`. It does **not** map other init errors (such as Pixi's unsafe-eval error, B4) to it, so a CSP mistake surfaces as an error rather than as the fallback message on every machine.
- **Drawing a reference node:** an N5 tile (`--card`) of `size` world units, with the `thumb256` texture letterboxed through Plan 1's `tileBox(aspect, size, outline?.region)`. When the tile has an outline, it is stroked in the operation colour, using the state's line style (Review Focus: The Line Says the State). In `"dot"` LOD, the node is a 3 px dot in `--ink-2` (C3).
- **Out of scope (R9).** `planFrame` returns `"dot"` for a ref node with `dim: true` at any scale, and picking skips it.
- **Textures (Cross-plan audit row 3):**
  - Thumbnails load through an `HTMLImageElement` (`img.src = api.assetUrl(thumb256)`, then `Texture.from(img)`). Pixi's `Assets` loader is not used, so its `preferWorkers` default does not apply.
  - Loading is then governed by the CSP's `img-src`, not `connect-src` or `worker-src`.
  - Plan 6 Task 1 Step 4 verifies this under the strict CSP.
- **Picking:** hover and select use `SpatialGrid.hit`, not Pixi's per-sprite events, so 2,000 sprites cost no listeners. Every event passes `mods.shift` from the pointer or key event (R9).
- **Dragging:** a pointer drag that starts on a node accepted by `setDraggable` moves a ghost of that node and fires `onDrop` on release; any other drag pans (`classifyDrag`). Task 10 uses this to link techniques.
- **Colours (R8).** WebGL cannot read CSS variables, so views keep passing `opInk(...)` strings (`var(--seq)`) and `scene.ts` resolves them. `resolveColor` reads `getComputedStyle(document.documentElement)` for `var(--x)` (and parses plain hex), caches per theme, and the cache is cleared and the scene redrawn when a `MutationObserver` sees `data-theme` change on `<html>`. Unit tests check the strings, never the numbers.
- **Reduced motion (C13).** `setCamera(c, true)` tweens only when `prefers-reduced-motion: reduce` does not match; otherwise it jumps.
- **Keyboard:** the canvas is focusable (`tabindex="0"`, `role="application"`, with an `aria-label` per view). The inspector's `aria-live="polite"` region announces the selection. Every canvas key handler returns early on `isTextEntry(e.target)` (`keys.ts:10`; C19).
- **`webglcontextlost`:** stop the ticker. On `webglcontextrestored`, recreate textures from the cache's URLs.

- [ ] **Step 1: Write the failing tests**, in `frame.test.ts` (Node, plus `// @vitest-environment jsdom` for the fallback test's `host`):
  - `plan_frame_culls_and_lods`: 2,000 nodes on a 50×40 grid, with a camera showing about a tenth of them. `visible` equals the brute-force set inside `viewRect(…, 0.1)`, and every visible ref node at scale 0.1 is `"dot"`.
  - `plan_frame_dim_is_dot`: a ref node with `dim: true` is `"dot"` at scale 4.
  - `drag_vs_pan`: with the predicate `id => id.startsWith("tech:")`, `classifyDrag` returns `"drag"` for a technique node and `"pan"` for empty space (`null`) or a branch node.
  - `fallback_message_when_no_webgl`: `mountCanvasOrFallback(host, () => Promise.reject(new WebGLUnavailable()))` resolves `null`, and `host` contains exactly the text "This view needs WebGL, which isn't available here. The Reference view still works." (Review Focus 1).
  - `fallback_rethrows_other_errors`: a `make` that rejects with a plain `Error` makes `mountCanvasOrFallback` reject, and `host` shows no fallback text.

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- graph/frame`. It should FAIL, then PASS. Run `npm test` and `npm run build` too; the build must succeed with `pixi.js` split into its own chunk.

- [ ] **Step 3: Add a dev harness**

  The harness is `?scene-demo` on the dev URL, and only `import.meta.env.DEV` builds it. It renders 2,000 synthetic ref nodes on a grid.

- [ ] **Step 4: Manual check**

  Run `npm run tauri dev` and open the harness. `tauri dev` enforces the same CSP, because no `devCsp` is set. Expected:
  - The scene renders (no "This view needs WebGL…" and no unsafe-eval error in the console).
  - Wheel zoom stays anchored under the cursor.
  - Drag pans.
  - `0` fits.
  - Pixi's ticker reports at least 55 fps while panning on the development machine.
  - At far zoom the tiles become dots.
  - Switching the theme recolours the canvas without a reload.

- [ ] **Step 5: Commit**

  Commit message: `feat(graph): PixiJS scene with culling, LOD, picking and WebGL fallback`.

---

