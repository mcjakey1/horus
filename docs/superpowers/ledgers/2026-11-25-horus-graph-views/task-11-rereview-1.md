# Task 11 re-review 1 (fix 44b6269..8ebfbf4, p3-t11)

### Finding Verdicts
- **I1: the "lowest 500 ms fps window 38–41" figure had the wrong run count, the wrong window, and no harness log line** — ADDRESSED.
  - **Run count:** the figure is moved out of the responsiveness row into a row of its own at `app/README.md:59`, with Runs = 2. The responsiveness row at `app/README.md:58` no longer carries it, so its Runs = 3 now covers only the long-task and frame-gap figures.
  - **Window:** the `app/README.md:59` label now reads "from the tab click to the fitted view (Pixi start-up, the layout, the fit)". Target and Verdict are "—", so the figure is no longer offered as evidence for the "during that layout" pass.
  - **Log line:** restored at `docs/superpowers/qa/plan3-perf.js:162`: `log("Galaxy fitted (min fps since the tab click)", await perf(page, "galaxy"));`. It sits in the same place as `perf-as-run.js:169` (`log("Galaxy fitted thumbs", await perf(page, "galaxy"))`): after `fit(page, "galaxy")` and before `measurePan(... "Galaxy pan fitted" ...)`. The `perf()` call is the same. Only the label differs. The committed `perf()` (`plan3-perf.js:65`) returns `minFps`, so the README sentence at `app/README.md:37` ("It reads the same numbers from `window.__horusPerf.<view>`") now holds for this figure.

### New Breakage in the Fix Diff
None. The only other hunk changes the wording of the first-layout verdict (`app/README.md:57`) to cite the controller ruling of 2026-11-26. The fix report (`task-11-report.md:179`) records it. The numbers are unchanged, and the settle time is still shown next to them.

### Out-of-Scope Observations
None.

### Verdict
**Fix round:** All findings addressed, no new Critical/Important breakage.
