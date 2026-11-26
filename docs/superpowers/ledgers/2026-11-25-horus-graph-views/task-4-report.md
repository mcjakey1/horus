# Task 4 report: the PixiJS scene

**Status:** DONE, with concerns (listed at the end).

**Branch:** `p3-t4` (worktree `.worktrees/p3-t4`), from `plan3-graph` `378f713`. Two commits:
- `df51424`: feat(graph): PixiJS scene with culling, LOD, picking and WebGL fallback
- `056f092`: fix(graph): keep loads to on-screen thumbnails, follow host resizes, clean destroy. These fixes came from a self-review pass before this report.

`.impeccable/hook.cache.json` and `AGY-NOTE.md` were not touched or committed. Every file was added by name.

## What was built

**`app/src/graph/frame.ts`** is the Pixi-free half (R6). It holds:
- **Types:** the `SceneNode` (with `dim`), `SceneEdge`, `FramePlan`, `Mods` and `Scene` types, exactly as the brief gives them, and `WebGLUnavailable`.
- **`nodeRect(n)`:** shapes are centred on `(x, y)`; a label is a 1×1 point.
- **`buildGrids(nodes)`:** returns `{ all, pick }`. `all` culls. `pick` holds only what can be picked, in draw order, so dim references and labels are never picked (R9).
- **`planFrame(grid, nodes, cam, view)`:**
  - It culls to `viewRect(…, 0.1)`.
  - It returns `visible` in **draw order** (the `setNodes` order), never in `SpatialGrid.query` order (AGY on T3).
  - A `dim` reference is `"dot"` at every scale.
  - **At most `TEX_CAP` references get `"thumb"`,** the ones nearest the view centre, ties broken by id. The overflow draws as dots (ruling 3).
- **`classifyDrag`** and **`mountCanvasOrFallback`:** only `WebGLUnavailable` gives the verbatim fallback sentence, and any other error is re-thrown (C14).

**`app/src/graph/scene.ts`** is the only module that loads Pixi, and only inside `createScene`:
- **Loading (B4).** It runs `await import("pixi.js")` and then `await import("pixi.js/unsafe-eval")`. `PIXI.isWebGLSupported()` decides `WebGLUnavailable`.
- **WebGL only.** `app.init({ preference: ["webgl"], resizeTo: host, … })`. The **array** form makes Pixi try WebGL only, never WebGPU or canvas (C14). An init error maps to `WebGLUnavailable` only when it reads "No available renderer" or mentions WebGL.
- **`resolveColor(css)`:** turns `var(--x)` (read through `getComputedStyle(documentElement)`) or hex into `0xRRGGBB`, cached per theme. A `MutationObserver` on `data-theme` clears the cache and rebuilds the display objects (R8).
- **Drawing:**
  - A reference is an N5 `--card` tile with the texture letterboxed by `tileBox`.
  - An outline is solid for full, dashed for partial and dotted for region.
  - At dot LOD it is a 3 px neutral `--ink-2` dot (C3), and a failed thumbnail also falls back to a dot (Review Focus 5).
  - op, branch and tech shapes take their ink and a serif label; labels are serif or mono.
  - Edges are straight or curved, with their `width` in screen pixels.
  - The selection ring is `--ink` and the hover ring `--line-2`.
- **Camera.** The world container carries the camera transform, so panning does not rebuild objects. Each node's display objects are built once, when it is first visible.
- **Input:**
  - Picking goes through `SpatialGrid.hit`, with no per-sprite listeners.
  - Pointer drags are classified by `classifyDrag`. A drag on a draggable node shows a ghost, and `onDrop` fires with the node under the pointer, excluding the dragged node.
  - A double-click fires `activate`, and every event carries `mods.shift` (R9).
  - The wheel zooms about the cursor.
  - Keys:
    - `+`/`=` and `-` zoom.
    - `0` fits, including AZERTY's unshifted `Digit0`.
    - Enter activates the selection.
    - The arrows pan, but only when nothing is selected.
    - Text fields and modifier keys are ignored (`isTextEntry`, C19).
- **Camera calls:** `setCamera(c, true)` tweens over 250 ms unless `prefers-reduced-motion: reduce`, when it jumps (C13). `fitAll()` does nothing when there are 0 nodes (AGY on T3).
- **Canvas:** it has `tabindex=0`, `role="application"`, and `aria-label` from `host.dataset.label`.
- **Lost context.** `webglcontextlost` calls `preventDefault` and stops the ticker. `webglcontextrestored` drops the objects, clears the cache and restarts; visible textures reload.
- **Resize.** A `ResizeObserver` on the host calls `app.resize()`, because views are shown and hidden by CSS.
- **`destroy()`** aborts every canvas listener first, then destroys the cache and the app.
- **Texture rules (ruling 3):**
  - At most `TEX_CAP` thumbnails are planned, and each update touches them all.
  - **Every in-flight load that no thumbnail wants this frame is cancelled, keyed by URL** (`tex.loading()` against the frame's wanted set). A node can drop from thumb to dot while still on screen, and one reference can appear under several techniques.
  - Hidden and dot sprites hold `Texture.EMPTY`.
  - So the least recently used live texture is always one that is not drawn, and eviction never destroys an on-screen texture.

**`app/src/graph/texcache.ts`** (ruling 2) adds:
- `clear()`: unloads every live texture, and forgets loads and failures;
- `destroy()`: `clear()`, after which `get` returns `"failed"` and nothing loads;
- `urls()`: the live URLs, least recently used first;
- `evict(url)`: unloads a live texture or orphans its load;
- `cancel(url)`: orphans an in-flight load only;
- `loading()`: the in-flight URLs.

Each load carries a token, so a load that settles after `clear`, `destroy`, `evict` or `cancel` is **unloaded, not inserted**.

**Supporting files:**
- `app/src/graph/scene-demo.ts` is the dev-only harness (`?scene-demo`): 2,000 synthetic reference nodes with canvas-drawn `data:` thumbnails, plus an op node, a tech node, a label, an edge, outlines in all three states, and some `dim` nodes. `&unique` gives every node its own thumbnail. It shows fps, has a theme switch, and exposes `window.__scene`.
- `app/src/main.ts` loads the harness only under `import.meta.env.DEV && ?scene-demo`. A grep confirmed the release `dist` contains no harness.
- `app/src/graph/pixi-unsafe-eval.d.ts` is a one-line `declare module`, because Pixi ships no types for that entry.
- `app/src/styles.css` gains a small block: `.graph-canvas`, `.graph-fallback`, and the harness's bar and host.
- `app/package.json` and `package-lock.json`: `pixi.js@^8.23.0`, `d3-force@^3.0.1` and `@types/d3-force@^3.0.10`, and nothing else.

## Tests

**`frame.test.ts`** has 11 tests. It runs in jsdom for the fallback host, and never imports `scene.ts` or `pixi.js`:
- `plan_frame_culls_and_lods`: 2,000 nodes; the result equals the brute-force set inside `viewRect(…, 0.1)`, between 150 and 300 visible; every one is a dot at scale 0.1.
- `plan_frame_visible_in_draw_order`
- `plan_frame_dim_is_dot` (scale 4)
- `plan_frame_caps_thumbs_at_tex_cap`: 900 on screen, exactly 600 thumbnails, deterministic.
- `plan_frame_empty_is_empty`
- `pick_skips_dim_and_labels`, `pick_topmost_in_draw_order`
- `drag_vs_pan`
- `fallback_message_when_no_webgl` (exact text), `fallback_rethrows_other_errors`, `returns the scene when it mounts`

**`texcache.test.ts`** has 9 new tests, beside T3's 5:
- `clear_unloads_every_live_texture`, `clear_forgets_failures`
- `urls_lists_live_textures_oldest_first`
- `load_settling_after_clear_is_unloaded_not_inserted`
- `load_settling_after_destroy_is_unloaded_and_nothing_loads_again`
- `load_settling_after_its_url_was_evicted_is_unloaded`
- `evict_unloads_a_live_texture`
- `cancel_orphans_a_load_but_keeps_live_textures`
- `lists_only_in_flight_urls`

**Totals:** `npm test` runs 25 files and passes 269 of 269. `npx tsc --noEmit` is clean. `npm run build` is clean.

## TDD evidence

- **RED** (`npx vitest run src/graph/frame src/graph/texcache`):
  - "Failed to resolve import "./frame"".
  - 7 failing texcache tests, such as `TypeError: cache.clear is not a function` and `cache.evict is not a function`, with 5 passing.
- **GREEN:** after `texcache.ts` and `frame.ts`, `Tests 32 passed (32)`. After `cancel`, 33; after `loading`, 34.
- **Not strictly test-first:** `cancel_orphans_…` and `lists_only_in_flight_urls` were written right after their methods. The URL-keyed cancel in `scene.ts` has no unit test, because it lives in the Pixi half; the manual run below covers it.

## Manual check (Step 4)

- **The run:** `npm run tauri dev` in this worktree, with `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9334`, driven by Playwright over CDP on `?scene-demo`. The screenshots are in the session scratchpad and are not committed.
- **Results:**
  - The scene renders: no fallback text, and no unsafe-eval error.
  - **Wheel zoom** under the cursor gives an anchor drift of **0** world units (scale 0.264 → 0.413).
  - **Drag** pans, and the scale is unchanged.
  - **`0`** fits.
  - **Frame rate:** idle 164 fps, panning 165 fps. That is the display's refresh rate, well above 55.
  - **Far zoom:** at scale 0.05 everything is dots.
  - **Theme:** switching recolours the canvas live. The outlines change ink, and the card stays N5.
  - **Lost context:** `WEBGL_lose_context` lost and restored, the scene redrew, and there were no errors.
  - **Enter** on a selection fires `activate`.
- **Follow-up run (`?scene-demo&unique`, 2,000 distinct thumbnails):**
  - Panning at fit zoom (scale 0.26, thumb LOD) and zooming back and forth across the thumb/dot boundary: **the peak live texture count is 600**, and 0 loads are left in flight.
  - Shrinking the host without a window resize: canvas 880 = host 880.
  - Dragging `tech:demo` onto `op:seq` gives `drop tech:demo op:seq`.
  - Shift-click gives `select op:seq true`.
  - `destroy()` removes the canvas. Before `056f092` it also logged "Cannot read properties of null (reading 'stop')": destroying the renderer fired `webglcontextlost` on a dead ticker. That is fixed.
  - An earlier run logged one 404 from the navigation away from boot; it did not recur.
- **B4 under the real CSP. `tauri dev` does not prove it.** In the dev page, `new Function("return 1")()` returned 1, and so it did under a CSP header too, because Playwright's `evaluate` runs over CDP, which bypasses CSP. So I checked it separately:
  - **Set-up:** a dev-mode `vite build`, served with the exact `tauri.conf.json` CSP as a response header, in headless Chromium with SwiftShader WebGL.
  - **CSP enforced:** a string `setTimeout`, which runs in the page's own context, was **blocked**, with violation `script-src` ("Evaluating a string as JavaScript violates … 'unsafe-eval' is not an allowed source"). With `'unsafe-eval'` added (the control), it ran.
  - **With the import:** the scene rendered, with a canvas, no fallback, `fitAll` run, and no page errors.
  - **Control build without the `pixi.js/unsafe-eval` import:** no canvas, and the page error "Current environment does not allow unsafe-eval, please use pixi.js/unsafe-eval module to enable support". That surfaced as a real error, not the "needs WebGL" text, so C14 holds. The import is therefore required, and it works under our CSP.
  - The temporary edit was restored, and `scene.ts` still has the import. The scratch builds were deleted.
  - Plan 6 Task 1 Step 4 still re-checks this in the packaged app.
- **Chunk split:** a dev-mode build (the only build that imports `createScene` today) emits Pixi as separate lazy chunks: `lib` 682 kB, plus `ParticleBuffer`, `GraphicsContext` and others. The `index` entry is 82 kB. The release `npm run build` has no Pixi yet, because nothing in production imports `createScene` until Task 6.
- **Clean-up:** the dev processes were stopped. `%APPDATA%\art.horus.app` was never created.

## Files

- **Created:** `app/src/graph/frame.ts`, `frame.test.ts`, `scene.ts`, `scene-demo.ts`, `pixi-unsafe-eval.d.ts`.
- **Modified:** `app/src/graph/texcache.ts`, `texcache.test.ts`, `app/package.json`, `app/package-lock.json`, `app/src/main.ts`, `app/src/styles.css`.

## Self-review and concerns

1. **Files outside the brief's list:**
   - `main.ts` holds the harness entry. The plan says `main.ts` is not edited, but Step 3's harness needs an entry, and the DEV check drops it from release.
   - `styles.css` gets a new block at the end. **Task 2 also edits `styles.css`,** in a different block; expect a trivial merge.
   - `pixi-unsafe-eval.d.ts` is needed for `tsc`.
2. **`preference: ["webgl"]`** is used, not the string `"webgl"`. Pixi's string form falls back to WebGPU and then canvas (`autoDetectRenderer.mjs`), which C14 forbids.
3. **Keys the scene owns:** Enter (activate), `0`, `+`/`-`, and the arrows only while nothing is selected. With a selection, the arrows are left to the view (`navigate.ts`). **Task 6 and later must not bind Enter too,** or a reference would open twice. They should listen for `activate`.
4. **`aria-label`** comes from `host.dataset.label`, with a default of "Graph view". Views should set `data-label` on their host.
5. **`TexCache.evict`** is tested but not used by the scene, which uses `cancel`. It was kept, because ruling 2 asked for evicted-URL behaviour.
6. **Proof of the release-build chunk split** waits for Task 6, which makes production import `createScene`. Here it is shown by the dev-mode build only.
7. **The B4 evidence comes from headless Chromium,** not WebView2: SwiftShader WebGL, plus a header CSP equal to the config. The WebView2 run under `tauri dev` showed the scene works, but cannot show that eval is blocked there. Plan 6's packaged-app check closes this.
8. **The error mapping in `createScene`:** an init error whose message mentions "webgl" becomes `WebGLUnavailable`. A different WebGL-related bug would then show the fallback text. I accepted this ceiling, because Pixi's unsafe-eval error does not mention WebGL.
9. **Fidelity of the shapes.** Text is world-sized, at 13 world units, and op, branch and tech shapes are plain squares. Tasks 6 to 8 may want a refined look; the scene API does not limit that.

## Fix round 1 (review `task-4-review.md`: I1 and I2)

**Commit:** `5cca872`, fix(graph): show the WebGL fallback on a lost context; redraw edges only when they change. Only I1 and I2 were fixed; the 11 minors stay deferred.

**I1: a lost context showed nothing.**
- **The change.** In `frame.ts`, `wireContextLoss(canvas, host, { lost, restored })` handles both events and returns its unwiring function:
  - **On `webglcontextlost`**, it calls `preventDefault`, sets `canvas.hidden = true` and appends the same `<p class="graph-fallback">` sentence to the host, once only, using the exported `FALLBACK` constant. Then it calls `lost`, which stops the ticker.
  - **On `webglcontextrestored`**, it removes the paragraph, shows the canvas, and calls `restored`. That drops the display objects, clears the texture cache, bumps the theme version so the edges are redrawn, and restarts the ticker.
  - `scene.ts` uses it in place of its two raw listeners, and `destroy()` unwires it.
  - `styles.css` gains `.graph-canvas[hidden] { display: none; }`, because `.graph-canvas` sets `display: block`, which would override the `hidden` attribute.
- **Scope.** Only this view's host changes, so the other views keep working. No `"lost"` event was added to `Scene`, because the scene shows the sentence itself.
- **Tests** (`frame.test.ts`, jsdom, pure seam):
  - `lost_context_shows_fallback_and_hides_canvas`: the event is default-prevented, the exact sentence shows, the canvas is hidden, the hook is called, and a second loss adds no second paragraph.
  - `restored_context_removes_fallback_and_rebuilds`
  - `unwired_after_destroy`
- **In the real WebView** (`tauri dev`, CDP, `WEBGL_lose_context`):
  - During the loss, the text was exactly the fallback sentence, `canvas.hidden` was true and its computed `display` was `none`.
  - After the restore, the fallback was gone and the canvas was shown again.

**I2: every edge was redrawn every frame.**
- **The change.** In `frame.ts`, `EdgeGate.needs(edges, nodesVersion, scale, themeVersion)` returns true only when one of these changed since the last draw:
  - the edge list's identity (`setEdges` always stores the new array);
  - `nodesVersion`, which `setNodes` bumps;
  - the scale, because edge widths are screen pixels;
  - `themeVersion`, which a theme change or a restored context bumps.

  `update()` calls `drawEdges()` only when the gate says so. A pan, a loading frame and a selection or hover change move the world container's transform only; marks are still redrawn, which is cheap.
- **Test:** `edges_redraw_only_when_inputs_change` counts redraws. The first frame draws, 100 pan frames redraw nothing, and each of a new list, new node positions, a zoom and a theme change redraws once: 7 in total.
- **Speed with about 16k edges** (`?scene-demo&edges`: 2,000 nodes × 8 neutral edges, plus 1), measured in the real WebView as `requestAnimationFrame` frame times:

  | Gesture | Frames | Average | p95 frame | Worst frame |
  |---|---|---|---|---|
  | Pan, 3 s of continuous drag | 991 | **164 fps** | 6.2 ms | 12.3 ms |
  | Wheel zoom, 30 steps | 146 | 71 fps | **48.4 ms** | 79 ms |

  So panning holds the budget with 16k edges. **A zoom step with 16k edges costs about 50 ms**, because widths are in screen pixels and must be re-stroked at the new scale.

  This is a worst case the plan never draws: the Galaxy draws edges only for the hovered or selected reference (Global Constraints), so at most about K_EDGES at a time. If a view ever draws thousands of edges at once, the next step is to re-stroke only after a zoom settles, or to use world-unit widths.

**Commands and output:**
- `npx vitest run src/graph/frame.test.ts src/graph/texcache.test.ts`:
  - **RED,** before the change: `× lost_context_shows_fallback_and_hides_canvas`, `× restored_context_removes_fallback_and_rebuilds`, `× unwired_after_destroy` (`TypeError: wireContextLoss is not a function`), and `× edges_redraw_only_when_inputs_change` (`TypeError: EdgeGate is not a constructor`). `Tests 4 failed | 11 passed (15)`.
  - **GREEN:** `Test Files 2 passed (2)`, `Tests 29 passed (29)`.
- `npm test`: `Test Files 25 passed (25)`, `Tests 273 passed (273)`.
- `npx tsc --noEmit`: clean.
- `npm run build`: `✓ built`.

**Clean-up:** the dev processes were stopped, and `%APPDATA%\art.horus.app` was never created. The one 404 in the console is the dev page's own, from before the harness mounts; it happened before this change too.
