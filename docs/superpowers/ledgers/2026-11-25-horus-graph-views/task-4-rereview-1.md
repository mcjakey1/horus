# Task 4 re-review 1: fix 056f092..5cca872

Scope: I1 and I2 from task-4-review.md only. Read-only. I did not re-run the suite. I read the fix diff, plus `scene.ts` around `buildScene`, `drawEdges`, `update` and `clearObjs` for context.

## Verdicts

### I1: no message when the WebGL context is lost. ADDRESSED
- `frame.ts` exports `FALLBACK` and adds `fallbackParagraph()`. `mountCanvasOrFallback` and the new `wireContextLoss` both use it, so the sentence exists only once in the code.
- When the context is lost, `wireContextLoss` calls `preventDefault()` so the browser can restore it. It then sets `canvas.hidden = true`, adds the paragraph to `host` and calls `hooks.lost()`, which stops the ticker.
- When the context is restored, it removes the paragraph, shows the canvas and calls `hooks.restored()`. The rebuild is the same as before (`clearObjs`, `tex.clear`, `dirty`, `ticker.start`). It also adds `themeVersion++`, so the edge layer is redrawn after the restore.
- `scene.ts` replaces the two raw listeners with this one call, and `destroy()` calls `unwireContext()`.
- The `styles.css` rule `.graph-canvas[hidden] { display: none; }` is needed. Without it, `.graph-canvas { display: block }` would override the `hidden` attribute.
- `frame.test.ts` has 3 tests that cover these steps.

### I2: every edge was redrawn on every update. ADDRESSED
- `EdgeGate.needs(edges, nodesVersion, scale, themeVersion)` returns false when all four inputs are the same as at the last draw. `update()` now calls `drawEdges()` only when the gate returns true.
- I checked that the four inputs cover everything `drawEdges` reads:
  - **The edge list:** `setEdges` replaces the array, so a check on its identity catches every change.
  - **Node positions:** only `setNodes` changes `nodes`, and it bumps `nodesVersion`. A drag moves only the `ghost` mark, not node positions.
  - **Width:** `e.width / cam.scale` depends on the scale.
  - **Colour:** `resolveColor` changes only when the theme changes, and the theme observer bumps `themeVersion`.
- A pan, a loading frame, or a hover or selection change now updates only the world transform and the marks.
- A zoom or a zooming tween still redraws every frame. That meets the brief, because the brief lists scale as a reason to redraw.

## Fallback checks (task step 3)
| Check | Result |
|---|---|
| Text exactly matches the quote | Yes. It uses the shared `FALLBACK` constant, and the test compares it with the literal sentence. |
| Appears once | Yes. The `:scope > .graph-fallback` guard stops a second paragraph when the context is lost twice, and a test covers this. |
| Only in the affected view | Yes. The paragraph goes into this scene's `host`, the parent of its canvas, and nothing else in the DOM changes. |
| Removed on restore | Yes. The paragraph is removed and `canvas.hidden` is set back to false. A test covers this. |
| No listener leak | Yes. Both listeners share one `AbortController`. `destroy()` aborts it before `app.destroy()`, so if Pixi forces a context loss during teardown, the fallback does not show. A test covers this. |

## New issues introduced by the fix
- **Critical:** none.
- **Important:** none.
- **Minor, M1: the fallback can be left behind by `destroy()`** (`scene.ts` `destroy`, `frame.ts` `wireContextLoss`). If the scene is destroyed while the context is lost, `unwireContext()` removes the listeners but not the paragraph. `app.destroy({ removeView: true })` removes only the canvas. A later mount into the same host would show the old sentence above a working canvas. Fix: make the unwire function also call `host.querySelector(":scope > .graph-fallback")?.remove()`.

## Observations (not new breakage)
- `EdgeGate` checks only the identity of the edge array. A caller that changes the array in place and then calls `setEdges(sameArray)` gets no redraw. Today's callers always pass a new array, so the gate should be documented as part of the `setEdges` contract, or `setEdges` should bump its own version number.
- With 16k edges, a zoom step takes about 50 ms (from the fix report). That is outside I2 and is not on the plan's path, because the Galaxy draws only the edges of the hovered or selected node. The report already names the next step.
- If the canvas has focus when the context is lost, hiding it moves focus to `<body>`. The fallback paragraph is not focusable and has no `aria-live`. This is acceptable, but a screen reader does not announce the loss.
- The `hidden` canvas still has its tab stop removed while the context is lost, which is correct. When the context is restored, the canvas does not take focus again. That is reasonable.
