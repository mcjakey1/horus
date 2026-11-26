# Task 4 review: the PixiJS scene (378f713..056f092)

The line numbers below are from the worktree files at head (`.worktrees/p3-t4/app/src/...`).

## Part 1: Spec, ❌ (one item is missing; everything else matches)

### Missing
- ❌ **The context-lost message (Review Focus 1, a global constraint).** The constraint says that "after the context is lost", the canvas view shows "This view needs WebGL, which isn't available here. The Reference view still works."
  - The `webglcontextlost` handler (`graph/scene.ts:487-490`) only calls `preventDefault` and stops the ticker.
  - If the context never comes back, the view is a frozen canvas with no message.
  - The `Scene` interface has no lost or restored signal, so a view cannot show the message either.
  - The task brief's own wording asks only for "stop the ticker". The controller may waive this or move it to a later task. As written, the global constraint is not met.

### Matches
- `frame.ts` exports everything in the brief: `SceneNode` (with `dim`), `SceneEdge`, `FramePlan`, `Mods`, `Scene`, `WebGLUnavailable`, `planFrame`, `classifyDrag` and `mountCanvasOrFallback`, with the brief's signatures. It does not import `pixi.js` ✅.
- **Loading Pixi (B4).** `scene.ts` loads Pixi with a dynamic `import("pixi.js")`, then `import("pixi.js/unsafe-eval")`, before the renderer is created ✅.
- **WebGL only.** `preference: ["webgl"]` gives no WebGPU or canvas fallback ✅.
  - Only `isWebGLSupported()` or an init error that mentions WebGL becomes `WebGLUnavailable`. Every other error is re-thrown ✅.
  - The regex is a known ceiling, and the implementer accepted it.
- **Drawing a reference:**
  - It is an N5 `--card` tile, and `--card` is `#777776` and not overridden in the dark theme ✅.
  - The thumbnail is letterboxed with `tileBox` ✅.
  - Outlines are solid, dashed or dotted by state ✅.
  - The dot is 3 px in `--ink-2` ✅.
- **Out of scope.** A `dim` reference is a dot at every scale, and picking skips it ✅.
- **Textures.** They load through an `HTMLImageElement`, `img.src = api.assetUrl(url)`, then `Texture.from(img)`. Pixi's `Assets` loader is not used ✅.
- **Picking and dragging:**
  - Hover and select pick through `SpatialGrid.hit`, with no per-sprite listeners ✅.
  - Every event carries `mods.shift` ✅.
  - Dragging uses `classifyDrag`, shows a ghost, and calls `onDrop` with the node under the pointer, excluding the dragged one ✅.
- **Colours and motion:**
  - `resolveColor` handles `var(--x)` and hex, caches per theme, and is cleared by a `MutationObserver` on `data-theme` ✅.
  - The app has no `prefers-color-scheme` themes, so `data-theme` is the only trigger ✅.
  - Reduced motion makes `setCamera(c, true)` jump instead of tween ✅.
- **Keyboard:**
  - The canvas has `tabindex=0`, `role=application` and an `aria-label` ✅.
  - `isTextEntry` is checked first ✅.
  - `+`/`-` zoom, `0` fits, and the arrows pan when nothing is selected. With a selection, the arrows are left to the view (`navigate.ts`), which is a reasonable split ✅.
- **Pan and zoom:**
  - The wheel zooms about the cursor ✅.
  - Drag pans ✅.
  - Scale is clamped by `zoomAt` and `fit` ✅. `setCamera` does not clamp; see Minor 2.
- **Speed:**
  - Culling uses `viewRect(…, 0.1)` ✅.
  - `DOT_PX` is applied through `lodFor` ✅.
  - `TEX_CAP` caps the planned thumbnails, and the overflow draws as dots (carry-in 3) ✅.
  - `visible` is in draw order, not `query()` order ✅.
  - `fitAll` does nothing when there are 0 nodes ✅.
- **`texcache.ts` (carry-in 2):**
  - `clear()` and `destroy()` unload every live texture ✅.
  - `urls()` lists the live URLs ✅.
  - A load that settles after `clear`, `destroy`, `evict` or `cancel` is unloaded, not inserted (a token check) ✅.
- **Carry-ins 4 and 5:**
  - Pixi stays out of jsdom tests: `frame.test.ts` imports only `frame`, `camera` and `constants` ✅.
  - The dependencies are only `pixi.js@^8.23.0`, `d3-force@^3.0.1` and `@types/d3-force` (dev). The lock file adds only their transitive packages ✅.
- **Tests.** All 5 required tests are present and assert the brief's conditions, including the exact fallback sentence ✅.
- **The dev harness** is `?scene-demo` behind `import.meta.env.DEV`, with 2,000 synthetic references ✅.
- **No inline `style=` attributes** are added by our code ✅. Pixi writes `canvas.style` through the CSSOM, which the CSP does not block, and `lightbox/view.ts` already does the same.

### Extra (all justified)
- **`main.ts`.** The harness entry needs one. `import.meta.env.DEV && …` is replaced statically, so the dynamic import is dead code in a release build.
  - A grep of the existing `app/dist` finds no `scene-demo` or `runSceneDemo` in the JS.
  - ⚠️ I did not rebuild, so I cannot confirm that `dist` was built from head.
  - The CSS does ship the harness rules; see Minor 6.
- **`pixi-unsafe-eval.d.ts`** is needed: Pixi's `./unsafe-eval` export has no `types` entry (I checked `node_modules/pixi.js/package.json`).
- **The `styles.css` block** is needed for `.graph-canvas` and `.graph-fallback`.
- **`nodeRect` and `buildGrids`** are exported from `frame.ts`: small and tested, and they keep picking pure.

### Could not verify
- ⚠️ The Step 4 manual results (fps, wheel anchor, context restore, theme recolour) and the B4-under-CSP proof come from the report only. I did not re-run them.
- ⚠️ The "Pixi in its own chunk" result is shown only by a dev-mode build. The release build has no Pixi until Task 6 imports `createScene`.
- ⚠️ The extra operation inks (`var(--x-teal)` and the like, from `opInk`) are not defined in `styles.css` yet. Today `resolveColor` would draw them mid grey (see Minor 1). This depends on Task 2.

## Part 2: Quality, Needs fixes

Most of it is well built:
- **Texture cap.** The cap and the URL-keyed cancel together make the on-screen-eviction argument sound:
  - at most 600 distinct thumbnail URLs are wanted;
  - every update touches all of them;
  - loads stay in flight only for wanted URLs;
  - hidden and dot sprites hold `Texture.EMPTY`.

  So the least recently used live texture is never a drawn one.
- **Lifecycle.** The listeners hang off one `AbortController`, and `destroy()` disconnects both observers before destroying the app, which fixed the "dead ticker" error.
- **Late loads.** The token guard is correct, and its tests are real; they settle real promises.

Two Important issues remain.

### Important

**I1: No message when the WebGL context is lost** (`graph/scene.ts:487-497`)
- **Problem:** this is the spec item above. A context lost for good, for example a GPU reset that never restores, leaves a dead canvas with no explanation. Review Focus 1 asks for the plain-words sentence.
- **Fix:**
  1. On `webglcontextlost`, keep the ticker stop, hide the canvas, and append the same `<p class="graph-fallback">` text. Export the sentence from `frame.ts` instead of duplicating it.
  2. On `webglcontextrestored`, remove the paragraph, show the canvas again, and rebuild as today.
  3. If views need it, add a `"lost"` event to `Scene`.

**I2: Every edge is rebuilt on every update** (`graph/scene.ts:235-249`, called at `:316`)
- **Problem:** `update()` runs on every pan frame, every tween frame, and every frame while a thumbnail is loading. Each time, `drawEdges()` calls `edgeLayer.clear()` and re-strokes every edge, unculled, with one `stroke()` per edge. Panning does not change any edge's geometry or width.
  - The harness has 1 edge, so the ≥55 fps evidence does not cover this.
  - The Galaxy, at `K_EDGES = 8` × 2,000 references, can pass up to about 16k edges, and rebuilding that `GraphicsContext` every frame will miss the Speed budget.
- **Fix:** redraw the edges only when the edges, the nodes, the scale or the theme change. Keep an `edgesDirty` flag plus the scale at the last draw. Pan-only frames then skip `drawEdges()`. Doing the same for `drawMarks()` is optional; it is cheap.

### Minor

**M1: `resolveColor` silently greys anything it cannot parse** (`graph/scene.ts:39-47`)
- **Problem:** a missing token, or a non-hex value (for example `rgb()`, `oklch()`, or Task 2's `--x-*` inks before they land), becomes `0x777776`. That is the N5 card grey, so a mistyped operation ink is drawn invisibly, as a card-coloured outline.
- **Fix:** in DEV builds, `console.warn` once per unknown value, or fall back to `--ink-2` rather than the card grey.

**M2: `setCamera` does not clamp the scale** (`graph/scene.ts:338-345`)
- **Problem:** `zoomAt` and `fit` clamp to [0.05, 4], but a view that calls `scene.setCamera({…, scale: 10})` gets 10, and so does a tween to that target.
- **Fix:** clamp `c.scale` inside `setCamera`. Export `clampScale` from `camera.ts`, or reuse `MIN_SCALE`/`MAX_SCALE`.

**M3: Repeated key presses undershoot** (`graph/scene.ts:449-457`)
- **Problem:** `+`/`-` and the arrow pans compute their target from `cam`, the camera partway through a tween. Pressing `+` twice quickly, or holding an arrow so the key repeats, zooms or pans less than intended and looks uneven.
- **Fix:** compute the target from `tween?.to ?? cam`.

**M4: `app` leaks when `init` throws** (`graph/scene.ts:99-113`)
- **Problem:** when `app.init` throws, whether the error is mapped or re-thrown, the half-built `Application` is never destroyed. It may hold a GL context, and browsers cap the number of live contexts.
- **Fix:** call `app.destroy()` in the `catch`, wrapped in try/catch, before throwing.

**M5: `setNodes` tears down every display object** (`graph/scene.ts:502`)
- **Problem:** this includes every `Text`. If Task 7's force layout calls `setNodes` on each simulation tick, that is 2,000 objects destroyed and rebuilt per tick.
- **Fix:** none needed now. Note the cost for Task 7, or reuse the objects whose `kind`, `url` and look are unchanged and only move them.

**M6: Dev-harness CSS ships in release** (`styles.css:355-356`)
- **Problem:** the `.scene-demo-bar` and `.scene-demo-host` rules ship in the release CSS; the grep of `dist/assets/index-*.css` confirms it. They are harmless but dead.
- **Fix:** move the two rules into a `scene-demo.css` that `scene-demo.ts` imports, so they live only in the dev chunk.

**M7: Pixi's event system still walks the stage** (`graph/scene.ts:130`)
- **Problem:** picking does not use Pixi's events, but Pixi's own `EventSystem` still hit-test walks all 2,000 node containers on every pointer move. The default `eventMode` is `passive` with `interactiveChildren` set, so Pixi recurses into every container.
- **Fix:** set `app.stage.eventMode = "none"`, or `world.interactiveChildren = false`.

**M8: The ticker renders every frame while idle** (`graph/scene.ts:336`)
- **Problem:** the tick skips `update()` when nothing is dirty, but Pixi's `Application` still renders at the display rate (the report saw 164 fps idle). On a laptop, that is GPU and battery spent on a static view.
- **Fix:** none needed now; this is optional. Render on demand, or lower `app.ticker.maxFPS` when nothing is dirty.

**M9: No key clears the selection** (`graph/scene.ts:453`)
- **Problem:** the arrows pan only while nothing is selected, but the scene has no key that clears the selection. Escape does not, so a keyboard-only user who has selected a node cannot pan with the arrows any more.
- **Fix:** either handle `Escape` in the scene (`select(null)` plus an emit), or confirm that Task 6's `navigate.ts` owns this. Record the decision.

**M10: `urls()` and `evict()` are unused in production** (`graph/texcache.ts:64`, `:98`)
- **Problem:** the restore path is `clearObjs()` plus `tex.clear()`, after which the visible thumbnails reload lazily. That is better than reloading every URL in `urls()`, but it differs from the brief's "recreate textures from the cache's URLs".
- **Fix:** these are not a YAGNI finding against the implementer, because carry-in 2 asked for both. Either note the deviation in the plan, or drop the two methods if the controller agrees.

**M11: The cancel rule's guarantee has no unit test** (`graph/scene.ts:314`)
- **Problem:** the URL-keyed cancel loop is what guarantees that eviction never hits an on-screen texture. It lives in the Pixi half, where no unit test reaches it. Only the manual peak-600 run covers it.
- **Fix:** move the wanted-set and cancel logic into a small pure helper in `frame.ts`, for example `syncThumbs(plan, nodes, tex)` returning the wanted URLs. Test it with a fake cache: 700 thumbnail-sized nodes, pan, and assert that no wanted URL is ever evicted.

## On the implementer's concerns

1. **`main.ts` and the harness do not leak into release JS.** The DEV guard is static, and the `dist` grep finds no harness in the JS. Only the CSS leaks (M6). `pixi-unsafe-eval.d.ts` is needed.
2. **`evict` is tested but unused.** It is acceptable because the carry-in required it; see M10.
3. **The scene owns Enter, `0`, `+`/`-` and the unselected arrows.** That is acceptable. Task 6 must listen for `activate` and must not bind Enter itself; this belongs in Task 6's brief. See M9 for Escape.
