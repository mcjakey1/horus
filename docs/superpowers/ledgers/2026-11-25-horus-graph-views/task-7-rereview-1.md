# Task 7 re-review 1: fix round f3e6dee..76d2e4f

Scope: the fix diff (`review-f3e6dee..76d2e4f.diff`) against I1, I2 and I3 in `task-7-review.md`, plus read-only checks of `scene.ts` (`onKey`, `select`), `camera.ts`, `keys.ts` and the `galaxy.ts` context. The review was read-only, and the suite was not re-run. Test results are as the fix report gives them (RED 6 failed, GREEN 34/34).

## Verdicts

### I1, stale worker messages: ADDRESSED
- **The protocol.** `start` carries `run`, the worker echoes it as `runId` on `tick` and `end` (`force.worker.ts`), and `worker.onmessage` returns early on `m.run !== run` before it touches `positions`, `settled` or the fit.
- **The view's counter.**
  - `refresh()` bumps `run` at the same moment it posts `stop`. So a batch from the old run is stale even while `graph_edges` is awaited, and also in the empty-library branch, which posts no new `start`.
  - `start` takes `++run`.
  - Overlapping refreshes stay correct: each one bumps the counter, the superseded one returns on `mine !== gen` before posting, and only the newest `start` matches.
- **`destroy()`** terminates the worker, so it needs no bump.
- **The test delivers a real late message.** It sends an old-run `tick` and `end` after a reset, while the new `graph_edges` is still pending, and then asserts `fit === 0`. Before the fix, that late `end` would set `settled` and spend `fitOnEnd`, so this assertion can fail. It is in the report's RED list. The test then finishes the new run and asserts `fit === 1`.
- **One weak assertion** (see N1): the `prev` check no longer tests anything.

### I2, keyboard route (controller ruling): ADDRESSED
- **Enter with nothing selected.**
  - The host handler picks the in-scope, placed reference nearest the view centre.
  - The centre is `cam.x + clientWidth / (2·scale)`, and the same for y. That is correct for `camera.ts`, where `sx = (wx − x)·scale`; it is the same form that `fit()` uses.
  - It calls `preventDefault` only when it finds a reference.
- **Arrows with a selection.** They move to the nearest in-scope reference inside the open ±45° cone, using `along > 0 && |across| < along` with a unit direction. An empty cone means no move. I worked all five steps of the test by hand, and each gives the asserted id.
- **Enter with a selection** still goes through the scene's `activate` (`scene.ts:461`), and from there to `openReference`.
- **Tests.** There are five, and four of them were RED before the fix.

**No double-fire with the scene's activate.**
- The scene's `onKey` is on the canvas, so it runs first.
- With a scene selection, it emits `activate` and calls `preventDefault`. The host branch is gated on `!selected` (the view's state), so it does nothing.
- With no selection, the scene returns without acting (`else return`), so the event bubbles to the host and only the host acts.
- The scene's selection follows the view's: `select()` calls `scene.select(id)` synchronously, and a click goes through `on("select")`. The two can differ only in the narrow case in N2.
- The arrows split the same way. The scene pans only when `selected === null`, and the host moves only when the view has a selection.

**Enter is not swallowed in text inputs.**
- `isTextEntry(e.target)` is still the first line of the host handler, and it covers `input` of the text types, `textarea` and `[contenteditable]`.
- With nothing selected, the inspector renders only a note or nothing, and the WebGL fallback is a `<p>`. So no button in the host can lose its Enter to the new `preventDefault`.

**Not in the ruling (an observation).** Compare by Shift-click still has no keyboard or inspector route, which the first review listed under Missing.

### I3, forceCollide: ADDRESSED
- **The force.** `forceCollide<N>(NODE / 2 + 4)` is added in `createForce`, so it runs in the worker. That is the ruled radius of 28.
- **Determinism holds.** d3-force 3.0.1's collide takes its jiggle from the simulation's `randomSource`, which is `lcg(seed)`.
- **`warm_start_moves_less`** still passes, according to the report's GREEN run. I did not re-run it.
- **The new test** is `tiles_in_a_cluster_do_not_overlap`, a 10-clique at 0.8.

## New breakage introduced by the fix diff

**Critical:** none.
**Important:** none.

**Minor**
- **N1. The fix made the `prev` assertion vacuous (`galaxy.test.ts`, `superseded_layout_cannot_spend_the_fit`).**
  - The test now resets to `["x", "y"]`, which shares no ids with the old run's `a, b, c`.
  - `prev` is built only from the new ids, so `fresh.input.prev` would be `undefined` even without the run guard.
  - The pre-fix version of the test reset to `a, b, c, d`, which was the id-sharing case that the first review named.
  - Fix: reset to a library that shares ids with the old one, for example `["a", "x"]`. The late tick then really would turn the cold start warm without the guard.
- **N2. Under reduced motion, the keyboard can select a reference the scene has not drawn (`galaxy.ts`, host keydown and `nearest`).**
  - `nearest()` reads `positions`, which every `tick` updates. Under reduced motion, though, `draw()` runs only on `end`.
  - On a cold start, a key pressed mid-stream can therefore select an id that is not yet among the scene's nodes. On a warm start, it can select a newly added reference that is not yet drawn.
  - `scene.select(id)` then ignores the id (`scene.ts:546`, `nodes.has(id)`), so the view has a selection and the scene has none.
  - Until `end` redraws:
    - Enter does nothing. The scene sees no selection, and the host sees one.
    - An arrow both pans the scene and moves the view's selection.
  - The window is short, about one layout. Fix: pick only once the layout has settled under reduced motion, for example `if (reducedMotion() && !settled) return` in the two branches. The other fix is to have `nearest()` skip ids that have not been drawn.

## Observations (not breakage)
- **The view-centre test can't see an offset bug.** The Enter test's "view centre is the world origin" holds only because jsdom's `clientWidth` and `clientHeight` are 0. The `w / (2·scale)` term is never exercised, so a sign or offset error would still pass. I checked the formula by reading `camera.ts` instead.
- **Host Enter with a selection is untested.** No test presses a host-level Enter with a selection and asserts that no new pick happens, which is the double-fire guard. It is correct by reading. A one-line assertion would lock it in.
- **The overlap threshold allows some overlap.** `tiles_in_a_cluster_do_not_overlap` asserts a gap greater than `0.9 × NODE` (43.2), which still allows tiles to overlap by up to 4.8 units. The collide target is 56. `> NODE` would match the test's name. The report measured 54.8 on the demo library.
- **Cold settle is slower.** It went from 258 ms to 898 ms on 50 references, which includes Pixi's first load and `graph_edges`. That is within the 2 s budget, but it is worth re-measuring on a large library.
- **A key move does not pan the camera.** When the keyboard moves the selection off screen, the camera does not follow. The report already notes this limit. It was not in the ruling.
- **The 11 minors from the first review (M1–M11) were deferred as stated.** M4 (the duplicate `stop`) and M5 (`allEdges` declared out of place) are untouched.
