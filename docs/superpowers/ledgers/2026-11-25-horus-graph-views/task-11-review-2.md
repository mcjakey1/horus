# Task 11 review 2 (Steps 3-4), 4ae7de2..44b6269

**Verdict: Needs fixes.** One Important finding, and it needs only a docs fix: one README figure gives the wrong run count and is not produced by the committed harness. Everything else matches the evidence or is a Minor finding.

### Spec Compliance
- ✅ **Minor #1:** the `under_budget` doc gives the command with `--test-threads=1` and the parallel figure (correlate.rs, diff lines 120-123).
- ✅ **Minor #2**, with an equivalent form: `if cfg!(debug_assertions) { panic!("run with --release") }`, used instead of `assert!(!cfg!(..))` because clippy's `assertions_on_constants` rejects the assert. The behaviour is identical.
- ✅ **Minor #3:** `.perf-overlay` rule at the end of `styles.css`, using `--ink`, `--panel` and `--mono` (all defined, styles.css:2-3, :17, :23-24). `scene.ts` no longer sets `style.cssText`, so the constraint "no new inline `style=` attributes" holds.
- ✅ **Minor #4:** `.filter(|s| !s.is_empty())` on `HORUS_DEMO_DIR` (lib.rs).
- ✅ **Minor #6:** the docstring notes Pillow 10.1 or later and that `-I` ignores the user site.
- ✅ **Step 4 commit:** the subject of a428343 is exactly `test(perf): 2,500-reference synthetic library and graph speed check`.
- ✅ **README "Performance check":** commands, machine, window, data and a results table, plus the three carry-ins (~110 empty `PIXI.Text` joints: not measured; Galaxy cold settle 898 ms → 5.04-5.10 s; more than `TEX_CAP`: cap holds, minimum 76 fps).
- ✅ **Controller ruling on "first layout":** the row times the first streamed positions (960-967 ms) and records the full settle (5.04-5.10 s), and the verdict is conditional on that reading.
- ✅ **README figures checked against the raw logs** (run1-output.txt, run2/output.txt, run3/output.txt). Each of these matches:
  - seed time 86-110 s;
  - first tick 960-967 ms and settle 5,040-5,103 ms;
  - long tasks 1-3, longest 162-187 ms, frame gap 161-186 ms;
  - Galaxy fitted 116-130 (115.9, 127.4, 129.7);
  - notch 6: 76-90, gaps 22-32 ms;
  - zoomed in 118 (run 3);
  - far-zoom minimums: Galaxy 98-105, Tree 87-89;
  - peak textures 600 / 154 / 0;
  - Tree technique 130-131 / 130;
  - Show all 129-130 / 125-130;
  - Radial 130-131 / 130-131.
- ✅ **Exclusions checked against the screenshots:** run 2's "Galaxy pan zoomed in" really is empty canvas (overlay min 115). Run 2's notch 6, Tree "Show all" zoomed (overlay min 126) and Radial zoomed all show content. In each screenshot opened, the overlay text agrees with the logged minimum.
- ✅ **Committed harness = the run-2/3 script:** I diffed it with `--strip-trailing-cr`. It runs the same steps and notch counts (13 Galaxy notches with the pan at 6; 14 notches per `zoomIn`). The only differences are the dropped thumbs logic, the comments, `REPO` and the dropped `Galaxy fitted thumbs` log line (see Important #1).
- ❌ **The "UI responsive" row's `lowest 500 ms fps window 38–41`** is shown as resting on 3 runs, but the evidence has it for 2 runs only, and the committed harness cannot produce it (Important #1).
- ⚠️ **Cannot verify from the diff or the evidence:**
  - the WMI 60 Hz reading and the machine spec (no raw evidence);
  - run 1's harness and screenshots (not saved: its log keys, such as `Galaxy pan at the TEX_CAP zoom`, are not in `perf-as-run.js`);
  - the release budget test after the minors (not re-run; the guard is `false` in release, so the risk is low);
  - tsc, vitest 441/441 and clippy, as the report states them.

### Strengths
- The README is unusually honest:
  - every row carries a run count;
  - zoom-in fps is written "not measured";
  - the 60 Hz display against the ~130 fps ticker is called out;
  - the Radial row says plainly that it measured the taxonomy wheel only;
  - the harness is labelled a tidied copy that was not re-run.
- The reported figures reconcile to the raw logs to the millisecond. Where the README errs on run counts, it mostly under-claims.
- The minors are folded in surgically, with no scope creep. The clippy-driven deviation on #2 is explained and is behaviourally equivalent.
- The harness guards `%APPDATA%\art.horus.app`: it refuses to run if the folder exists and removes it afterwards. It uses its own WebView2 profile and CDP port.
- `maxTex` is sampled every ticker frame (scene.ts:612-613), not every 500 ms window, so "never above 600" is a per-frame claim, which is sound.

### Issues
#### Critical (Must Fix)
None.

#### Important (Should Fix)
1. **The "UI responsive during that layout" row overstates one measured figure** (app/README.md, diff line 68).
   - **Wrong run count.** The row reads Runs = 3, and that is true for the long-task and frame-gap numbers. But `lowest 500 ms fps window 38–41` exists only in run 2 (41.1) and run 3 (38.3), on the `Galaxy fitted thumbs` line of `perf-as-run.js`. Run 1's log has no such line.
   - **Not reproducible.** The committed `plan3-perf.js` dropped that log line, so the README's "It reads the same numbers from `window.__horusPerf.<view>`" is false for this figure. The report calls the dropped code "a dead thumbs-count branch", but this line produced a published number.
   - **Wider window than labelled.** The value is the min since the Galaxy scene's stats were created, with no reset in between. The scene mounts on the first select (galaxy.ts:55, :221). So the window runs from the tab click through Pixi init, the 5 s layout, the 800 ms wait, a CDP screenshot and the fit animation. It is not only "during that layout".
   - **Fix (docs only):**
     - Mark that figure "(2 runs)".
     - Describe it as "lowest 500 ms window from the tab click to the fitted view".
     - Either restore `log("Galaxy fitted thumbs", await perf(page, "galaxy"))` (renamed) in the committed harness, or qualify the "same numbers" sentence.

#### Minor (Nice to Have)
1. **The run counts do not follow the README's own rule.**
   - **Tree technique zoomed** is counted as 1 run, but run 2's screenshot shows the column of thumbnails (min 130.4). By the stated rule (only run 1's zoomed pans and run 2's zoomed Galaxy pan excluded), it should count 2 runs.
   - **Tree far zoom** is counted as 1 run, but the run 2 and run 3 screenshots are identical columns of dots.
   - **The "Zooming" row** counts run 2's Galaxy 98, but that figure's window starts at run 2's excluded empty-canvas zoomed pan. The pan itself had min 115, so the 98 came from the fit or the zoom-out, which is valid content. The row's description should still say so.
   - All of these under-claim or leave the numbers unchanged. Align the counts with the rule, or state the rule as "screenshots I checked".
2. **Run 1 has no screenshots or script in the evidence.** The README defines Runs as "runs whose screenshots show the measured content". Run 1 still counts on every fitted-pan row and on peak textures, and it alone sets the 116 lower bound of "Galaxy pan, fitted". Either say run 1's fitted pans were judged from the log only, or save its screenshots if they still exist.
3. **The a428343 commit body says** "docs/superpowers/qa/plan3-perf.js is the CDP harness used". That is true only of `perf-as-run.js`. 44b6269 corrects the README, but the commit body stays wrong. Fix it at squash or merge time.
4. **The "Zooming" target is only half covered.** The brief asks for at least 55 fps while zooming, both fitted and zoomed in. Zoom-in fps is honestly "not measured", but the verdict column reads as partly passing. The controller should rule on whether that is acceptable, or ask for a re-run that keeps the `notch()` perf reads, which the harness already returns and discards.
5. **The Radial check exercises the wheel only (~25 nodes, 0 textures).** So "Radial for the busiest operation" says nothing about references at 2,500. This is disclosed. A related observation: in r0-radial.png (run 3) the fitted wheel is only about 30 px wide in a 940×712 canvas. The fit appears to frame bounds much larger than what is drawn. Worth a QA look; this review did not investigate it.
6. **The "Pass" threshold for "UI responsive"** ("no main-thread stall reached 0.2 s") is the implementer's own bar, and the 187 ms longest task sits close to it. Name it as a chosen threshold, or let the controller set one.
7. **The "Galaxy pan, zoomed in (thumbnails)" row** reads as distinct from the cap case. But the run 3 screenshot and `tex 600` show the cap is still binding at notch 13 (dots between thumbnails). Wording only.
8. **`VITE_PERF=1 npm run …` is POSIX env syntax** (README, diff line 42). It fails in PowerShell or cmd on this Windows-only build. Add the PowerShell form or say "in Git Bash".
9. **The "Peak live textures" row** reads "any view, any run", but `maxTex` resets with each `measurePan`, so it is the peak over the measured windows. Run 1's per-notch log does show 600 throughout, so the claim holds. Wording only.

### Assessment
**Task quality:** Needs fixes
**Reasoning:** The minors are folded in correctly, the Step 4 commit is right, and almost every README figure reconciles exactly with the raw logs and screenshots. But one published measured figure (the 38–41 fps window) carries the wrong run count, is labelled with a narrower window than it covers, and cannot be reproduced by the committed harness. The fix is a few lines of README and harness.
