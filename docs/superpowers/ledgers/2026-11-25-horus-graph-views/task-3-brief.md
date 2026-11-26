### Task 3: Canvas core (pure modules)

**Files:**
- Create:
  - `app/src/graph/constants.ts`;
  - `app/src/graph/camera.ts`;
  - `app/src/graph/spatial.ts`;
  - `app/src/graph/lod.ts`;
  - `app/src/graph/texcache.ts`.
- Test: a `*.test.ts` beside each of `camera`, `spatial`, `lod` and `texcache`.

**Interfaces:**
- Produces:
  ```ts
  export type Rect = { x: number; y: number; w: number; h: number };
  // camera.ts — world→screen: sx = (wx - x) * scale, sy = (wy - y) * scale
  export type Camera = { x: number; y: number; scale: number };
  export function zoomAt(c: Camera, sx: number, sy: number, factor: number): Camera;   // keeps the world point under (sx,sy) fixed; clamps scale
  export function pan(c: Camera, dsx: number, dsy: number): Camera;
  export function fit(bounds: Rect, view: { w: number; h: number }, pad?: number): Camera;   // pad default 40 px
  export function viewRect(c: Camera, view: { w: number; h: number }, margin?: number): Rect;  // margin default 0.1
  // spatial.ts
  export class SpatialGrid { constructor(cell: number); insert(id: string, r: Rect): void; clear(): void;
    query(r: Rect): string[]; hit(x: number, y: number): string | null }   // hit = topmost by insertion order
  // lod.ts
  export type Lod = "dot" | "thumb";
  export function lodFor(worldSize: number, scale: number): Lod;          // "dot" when worldSize*scale < DOT_PX
  // texcache.ts
  export class TexCache<T> { constructor(cap: number, load: (url: string) => Promise<T>, unload: (t: T) => void);
    get(url: string): T | "loading" | "failed"; touch(url: string): void; size(): number }
  ```

- [ ] **Step 1: Write the failing tests**
  - Camera:
    - `zoom_keeps_point_fixed`: for a random camera and point, the world point under `(sx, sy)` is the same within 1e-9 after `zoomAt`.
    - `scale_clamped`: zooming far in or out stays within `[0.05, 4]`.
    - `fit_contains_bounds`: `viewRect(fit(b, v), v, 0)` contains `b`.
  - Spatial:
    - `query_matches_bruteforce`: 2,000 random rectangles and 50 random queries return the same id sets as a brute-force intersection test.
    - `hit_topmost`: overlapping rectangles return the last inserted.
  - LOD:
    - `lod_threshold`: `lodFor(48, 0.2)` is `"dot"` (9.6 px) and `lodFor(48, 0.25)` is `"thumb"` (12 px).
  - Texture cache:
    - `lru_evicts_and_unloads`: with cap 2, a third `get` unloads the least recently touched texture.
    - `failed_is_sticky`: a rejecting loader gives `"failed"`, and a second `get` doesn't call the loader again (Review Focus 5).
    - `loading_dedupes`: two `get` calls before the promise settles call the loader once.

- [ ] **Step 2: Run, then implement, then run again**

  Run `npm test -- graph/`. It should FAIL, then PASS.

- [ ] **Step 3: Commit**

  Commit message: `feat(graph): camera, culling grid, LOD and texture cache`.

---

