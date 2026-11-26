### Finding Verdicts
- **I1. A definition save drops or detaches the next action, or wipes what is open.** ADDRESSED.
  - (a) Commands now queue instead of being dropped (`app/src/views/inspector.ts:284-308`). A command only waits behind the one in flight.
  - (b) While a mouse button is down in the inspector, a render waits for it (`inspector.ts:110`, `:260-270`). The waiting render runs on a `setTimeout` after `mouseup`, so it lands after the click.
  - (c) On a same-selection re-render, open controls come back (`inspector.ts:216-226`, `:505-528`):
    - a slot form is moved across as the same node;
    - a pick list is rebuilt from the new data;
    - an open name or synonym field is reopened with its value and its error line.

    The `rewriting` guard (`:229-231`, `:363`, `:498`) stops the rewrite's own blur or change from saving.
  - (d) Focus goes back to the same node, or to the control with the same `data-*` key (`keyOf`, `:94-98`, `:530-533`). A new selection still focuses the title (`:233`).
  - Both tests the review asked for are present and assert what it required:
    - `inspector-edit.test.ts:375`: `updateOperation` is called a second time with `{ color: "rose" }`, and `apply` is called twice.
    - `:390`: the "+ Technique…" form survives the save's re-render. It is the same node, it keeps its text and focus, and it still submits.
    - Further tests: `:413`, `:432`, `:441`.
  - The mechanisms themselves bring new problems (N1, N2 and the Minors below).
- **I2. Name and synonym fields discard typed text on blur.** ADDRESSED.
  - `onblur` now calls `commit(false)`, so a changed value saves (`inspector.ts:363-375`). An unchanged value, or a blank or duplicate synonym, still cancels in place (`:365-366`).
  - Esc still cancels (`:354-357`).
  - Test: `inspector-edit.test.ts:454` covers a name and a synonym. Despite its title, it does not press Esc; that path is covered by the older tests and by `:413`.
- **I3. A seed operation on an extra ink can't get its seed ink back (plan amendment).** ADDRESSED.
  - `inspector.ts:157` adds the seed swatch (`data-ink="seed"`) when `inkAs(null) !== cur`, and `:412` sends `color: null`.
  - The Rust claim checks out:
    - `commands.rs:212-214`: `OperationPatch.color` is `Option<Option<String>>` with `double_option`;
    - `commands.rs:3877`: `{"color": null}` gives `Ok(None)`;
    - `api.ts:253`: the patch is passed through unchanged.
  - Test: `inspector-edit.test.ts:259`.
- **I4. The current ink is not resolved through `opInk`.** ADDRESSED.
  - Every swatch resolves through `opInk`: the current one at `inspector.ts:155`, and the seed and free swatches through `opInk` with `color` swapped (`:154`).
  - `--c` is set through the CSSOM (`:234`).
  - The copied precedence branch, `SEED_INK_NAME` and the nine `data-swatch` rules are gone (`styles.css:420`).
  - Labels come from the resolved base (`INK_NAME`), and an unknown base reads "Neutral".
  - Test: `inspector-edit.test.ts:246-251`.

### New Breakage in the Fix Diff
**N1 (Important): restored definition text has no way to save.** This is reasoned from how Chromium/WebView2 handles `change`. jsdom cannot show it, because the tests fire `change` by hand.
- **Where:** `inspector.ts:223` and `:524-527` put unsaved textarea text back by setting `a.value` from script, and then focus it. The textarea's only save path is `el.onchange` (`:496-501`).
- **Why it fails:** browsers fire `change` on blur only after a *user* edit. Setting the value from script does not arm it.
- **What the artist sees:**
  1. They type a definition.
  2. A store event lands, for example an import's `store.apply` at `intake.ts:94`, or an earlier queued command resolving.
  3. They click away without typing again.
  4. Nothing saves. The textarea still shows their text, so it looks saved.
  5. The next re-render, with the textarea no longer focused, rebuilds it from `tax`, and the text is gone without a word.
- **Severity:** this is the same class as I1(c), lost user input. It is not a regression from `2cd6971`, which wiped the text at once. But the fix report says this text "is kept", and in the real app it is kept only on screen.
- **Fix:** save the definition the way the inline fields do. On blur (`focusout`), compare `value` with the stored description, instead of relying on `change`. Alternatively, mark a restored textarea and treat its blur as a commit.
- **Test:** restore the text, then blur without dispatching `change`, and assert that `update({ description })` is called.

**N2 (Important): the mouse-down render hold can stay on with no mouse button held.**
- **Where:** `inspector.ts:260-270`. Only a document `mouseup` clears `pressed`.
- **The trigger:** a native drag-and-drop ends with `dragend`, not `mouseup`, and two native drags start inside the inspector:
  - the reference thumbnails: their `<img>` (`inspector.ts:188`) is draggable by default, while the lightbox explicitly sets `draggable="false"` (`lightbox/view.ts:43`);
  - dragging selected text out of the definition textarea.

  A focus steal while the button is held (Alt+Tab, an OS dialog) can also swallow the `mouseup`.
- **The effect:** until the next `mouseup` anywhere in the document, every `renderInspector` call is only deferred (`:110`).
  - A selection change made from the keyboard leaves the inspector showing the old node and its old controls. The arrow keys in the canvas move the selection (`scene.ts:482` notes this).
  - So does a save made from the keyboard.
  - Commands sent from those stale controls use the old render's closures.
- **Recovery:** it heals on the next mouse click. The canvas `pointerdown` does not call `preventDefault` (`scene.ts:408-416`), so its compatibility `mouseup` still fires.
- **Fix:** release the hold on `dragend`, on window `blur` and on `pointercancel` as well, for example by checking `e.buttons === 0`. Alternatively, release on `pointerup` with capture.
- **Test:** dispatch `mousedown`, then `dragend`, and check that a render applies.

**Minor:**
- **M-a. Queue keys carry no target or value.**
  - Where: `inspector.ts:287`.
  - `description`, `field:name`, `form:op`/`form:domain`, `ink:<k>` and `del` are shared across selections and payloads. A second, *different* edit with the same key, sent while the first is pending, is dropped silently. Two examples:
    - blur the definition, then refocus it, edit again and blur, all within one save's latency;
    - save a name, then save the same field on another selection, both quickly.
  - For an inline field, `commit` sets `busy` and `data-saving` *before* `run` returns `false` (`:367-374`), and `fieldErr` never runs. The field then freezes: Enter, Esc and blur are all ignored. The next re-render then discards it, because a `data-saving` field is not reopened (`:218`).
  - So review M1 is not fully gone, as the fix report claims. It now needs a matching key to be pending.
  - This only happens when a save is slow.
  - Fix: key by target and value, for example `field:${target.id}:${field}`, or drop a command only if its payload is identical. Clear `busy` and `data-saving` when `run` returns `false`.
- **M-b. A rejected tail loses the next command.**
  - Where: `inspector.ts:289` and `:306`. This is not a deadlock.
  - `q.tail = p`, and `p` rejects if `opts.apply` or `say` throws. The next command is chained with `q.tail.then(call)`, so its `call` is skipped. It goes straight to the rejection handler and is reported as "That change didn't save" without ever being sent. The queue then recovers.
  - The `void run(...)` callers also leave that rejection unhandled.
  - Fix: `q.tail = p.catch(() => {})`.
  - A promise that never settles still blocks the queue, as `inFlight` did before. No new hazard.
- **M-c. Queued commands run with the closures of the render that queued them.**
  - Where: `:275`, `:300`, `:408`, `:420`, `:492`, `:369-373`. All of these need a slow save.
  - **A read-only refusal re-renders an old view.** Its `rerender()` uses that render's `s` and `sel`, so it can jump the inspector back to a selection the artist has left.
  - **A success clears the wrong slot.** `clearSlot()` clears whatever the slot holds *now*. That can be a form opened since (with its typed text), or another selection's slot.
  - **A refusal is said into detached nodes.** If a re-render happens between `commit` and a `NameTaken` refusal, `fieldErr` writes into the detached input (a `data-saving` field is not reopened). Both the error and the typed name are lost.
- **M-d. Focus after picking an ink goes to the title.**
  - The clicked swatch's key `[data-ink="rose"]` is gone after the save, because the new current swatch has `data-ink=""`. Focus falls back to the title, not the row.
  - Minor for keyboard users.
- **M-e. A blur from deactivating the window now saves.**
  - Alt+Tab with a half-typed name now saves it, as its own undo step. This is defensible, since native apps commit on focus loss, but it should be noted for QA.

### Out-of-Scope Observations
None beyond what the first review already lists: Minors 2 to 9, and the read-only note being re-announced.

### Verdict
**Fix round:** Findings remain open as new breakage. I1 to I4 are all addressed. The fix diff adds two Important problems:
- **N1:** restored definition text never saves on blur, so typed input is lost silently.
- **N2:** the mouse-down render hold sticks after a native drag (a thumbnail image or a text drag), and the inspector goes stale until the next mouse click.

Five Minors (M-a to M-e) need a slow save, a throw inside `apply`, or are keyboard and QA details.
Tests: the fix report names covering tests for each finding and shows the 439/439 output. The diff matches those claims. The suite was not re-run. N1 and N2 are reasoned from browser behaviour that jsdom does not model.
