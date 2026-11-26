### Finding Verdicts
- **N1. Restored definition text has no way to save.** ADDRESSED.
  - `app/src/views/inspector.ts:511-516`: `saveArea` holds the one save path. It returns early when `!target || rewriting.has(el)`, compares `a.value.trim()` with the stored description from the same render's `tax`, and runs `run("description", ...)` only when they differ.
  - `:517-519`: `change` still routes through `saveArea`.
  - `:520-521`: each render sets `defArea.onblur` on the fresh textarea, so its closure's `tax` and `target` belong to the render that drew the text.
  - The restored textarea gets `a.value = keep.area` (`:543-546`) and then focus by its key (`:549-551`). Its later blur saves with no `change` event.
  - **Change then blur is one save.** Chromium fires `change` before `blur` in the same focus change. The first `saveArea` adds the `description` key synchronously (`:300-301`). The second sees the key still pending and returns `false`. The two payloads are the same value, so nothing is lost.
  - **Blur while `rewriting`.** A blur caused by the `innerHTML` rewrite (`:229-231`) reaches the old textarea's `onblur`. Its `saveArea` checks the module-level `rewriting` WeakSet for `el`, which is true at that moment, so it does nothing.
  - **Unchanged value.** Equal to the stored description, so no save.
  - **M-a is not made worse.** A genuinely different second edit sent while the first is pending is still dropped by the shared key, exactly as `change` alone dropped it. It is slightly better now: if the textarea is still focused when the first save's re-render lands, the dropped text is restored, and the new closure compares it with the saved text, so the next blur saves it.
  - Test: `inspector-edit.test.ts` "restored definition text saves on blur, with no change event (fix N1)". It restores the text, blurs with no `change`, and asserts one call with `{ description }`. It then fires `change` followed by blur and asserts 2 calls in all.
- **N2. The mouse-down render hold could stay on with no button held.** ADDRESSED.
  - `inspector.ts:262-279`:
    - `mouseup`, `dragend` and `pointercancel` are listened for on the document (capture), and `blur` on the window (not capture, so element blurs, which don't bubble, do not trigger it).
    - All share one `AbortController`, so `release` runs once and removes every listener.
    - `release` always schedules the timeout that clears `pressed` and runs `deferred`. The held render cannot be left un-run.
    - The re-entry guard (`:262`) can at worst skip the hold for a press that lands between `release` and its 0 ms timeout. It cannot leave the hold stuck.
  - `:284`: the thumbnail `img.draggable = false` (editing only) removes the main native-drag source.
  - Test: "a native drag's end, a cancelled pointer or a window blur releases the render hold (fix N2)". For each of the three ends, it checks that a render is held and then applies. It also checks that no thumbnail image is draggable.

### New Breakage in the Fix Diff
None at Critical or Important.

Minor:
- **m1. A window deactivation now also saves the definition.** `inspector.ts:521`: Alt+Tab while typing a definition blurs the textarea and saves it as its own undo step. This extends the deferred M-e (inline fields) to the textarea. Note it for QA.
- **m2. The held render can run during a native text drag.** `inspector.ts:278`: Chromium fires `pointercancel` when a native drag starts, for example text dragged out of the textarea. The held render then runs mid-drag and rewrites the drag-source node. The OS drag usually carries on with its data. This is benign, and it is what N2 asked for (no hold during a drag).

### Out-of-Scope Observations
- The `rewriting` guard on the textarea blur depends on Chromium firing `blur` synchronously when it removes a focused node. jsdom does not do this, so no test covers it.
  - If Chromium ever fires that blur asynchronously, the old textarea would save its own typed text. That outcome is benign: it is the artist's text.
- Deferred minors M-a to M-e are unchanged by this diff, apart from the small M-a improvement noted under N1.

### Verdict
**Fix round:** All findings addressed, no new Critical/Important breakage.
- N1 and N2 are both fixed, each with a covering test.
- The fix report names both tests and shows tsc as clean, vitest at 441/441 and the build passing. The suite was not re-run.
- Two Minors (m1, m2) are for QA notes only.
