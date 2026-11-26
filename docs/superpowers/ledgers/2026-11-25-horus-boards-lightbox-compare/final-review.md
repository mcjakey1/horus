# Plan 4 final whole-branch review (a7fb0f0..6e07004)

Reviewer: senior code reviewer (final gate before QA and merge). Date: 2026-11-26.

**What I read, in passes:**
- **Pass 1, the Rust side.** The diffs of `edit.rs` and `import.rs` (changed lines). At HEAD: `export.rs` (implementation and its first tests), the Plan 4 block of `commands.rs` (`find_link` .. `allow_lightbox_cache`, with `settle`, `is_noop`, `commit` and `step`), the Plan 4 command tests (commands.rs:2440-2710), `lib.rs`, the capability, `Cargo.toml` and `package.json`. I also checked the `tauri-plugin-opener` 2.7.3 source for `reveal_item_in_dir`.
- **Pass 2, the TS side, at HEAD.** `links/editor.ts`, `boards/{view,menu,status}.ts`, `compare/{view,sides}.ts`, `lightbox/{view,dock,zoom}.ts`, `store.ts` and `data.ts`. The diffs of `reference/view.ts`, `firstrun.ts`, `api.ts`, `views/{tree,galaxy,radial}.ts`, `views.ts` and `styles.css`.
- **Pass 3, a sample of the tests.** The board-scope block of `reference/view.test.ts`, the Compare tests (rescore, Tab trap, link), and the export cases in `boards/view.test.ts`.

**What I did not read:**
- the `commands/taxonomy_edit.rs` move (T0, reviewed as a pure move);
- most test files beyond the sample, and the bottom half of `export.rs`'s tests;
- DESIGN.md;
- the plan's task sections other than Task 5 (I keyword-searched Task 4);
- SPEC.md in full: I keyword-searched it for the sections Plan 4 cites rather than reading it through.

**Other notes:**
- I ran no tests. The implementers' verification at 6e07004 stands: vitest exit 0 (585), tsc, build, cargo 261+2+1, clippy.
- `D:\Design Second Brain` is a `subst` of `E:\D drive files`, so the D: and E: sdd folders are the same directory.

---

### Strengths

- **The edit model is clean.** Links and boards are new `edit::Edit` variants with sealed inverses. Each has a position-restoring `Insert*`/`Remove*` pair, and `Replace*` keeps the identity (edit.rs). Undo, redo, batches and rollback all come for free, and `is_noop` covers the new `Replace*` (commands.rs:638-651).
- **B2 is done at the right altitude.** One condition in `settle` (commands.rs:626-635) marks the library dirty for links and boards. It is shared by commit, undo and redo, so there is no per-command patching.
- **Export is careful:**
  - both sides are canonicalised for the inside-library check;
  - `persist_noclobber` through a temp file in `dest`;
  - names are de-duplicated case-insensitively, and reserved names and trailing dots are handled;
  - per-item skips with the rest carrying on;
  - originals are opened read-only.
  - Review Focus 1-2 are well covered by tests (export.rs:258+).
- **Async commands drop the state lock before slow work** (`export_board`, `lightbox_source`; commands.rs:994-1112). `lightbox_source` takes an id, never a path. A hidden reference never names a cache file.
- **The security footprint is small:**
  - the cache's asset scope is only `<cache>/lightbox` (tested at commands.rs:2635);
  - the opener grant is exactly `opener:allow-reveal-item-in-dir` (tested at lib.rs:146-163);
  - CSP is untouched (`tauri.conf.json` is not in the diffstat).
- **Cross-view scope plumbing:**
  - `store.inScope` flows through `storeSource` into Tree, Galaxy and Radial;
  - out-of-scope selections clear, and the arrow keys step past refused nodes, bounded by the loop;
  - `scopeCleared` is a single, well-defined event.
- **The constraints hold across all new modules:**
  - pointer events only (no `dragstart`, `dataTransfer` or `draggable="true"` anywhere in the new code);
  - no new inline `style=`;
  - `opInk`/`opLabel` only;
  - CSS in task-headed sections;
  - wire codes mapped to copy in links, boards and export.
- **The lightbox is robust.** It always shows the thumbnail first. A refusal, a malformed reply or an image `onerror` keeps the thumbnail and shows the note (Review Focus 3). `zoom.ts` is pure and tested.
- **Compare's rescoring is careful.** The latest reply wins, the local intersection shows while a request is pending, and Esc is stopped so it cannot unpin behind Compare. These are real tests that can fail.

---

### Issues

#### Critical (Must Fix)

**C1. "Show only this board" does not filter the Ranked list when no technique filter is on.**
- **Where:** `app/src/reference/view.ts:298-301`.
- **What:** T5a scope-filtered `list` (line 286). The unfiltered branch, though, still renders `rest` from `linkedFirst(S.related, …)` (T4, line 301), and `S.related` is unscoped. So with no filter, every related reference shows in Ranked, on or off the board, as soon as at least one in-board reference is related. Meanwhile the count line (`list.length`) and `S.ranked` say otherwise.
- **Why it matters:** SPEC §2 ("filter the view to that board") is the Brief workflow, and Plan Task 5 says Ranked keeps only members. This is a T4×T5a integration bug.
- **Why the test missed it:** the existing test (`reference/view.test.ts:1082`) only passes because the fixture's `a` has a single related reference (`b`). Under scope `["a"]`, `list` is empty and the empty-note branch hides `rows`.
- **Fix:** `const scoredRows = list.filter((x) => !linkedIds.has(x.id));` for both branches. `rest` from `linkedFirst` is then unused here (keep the helper; `links/editor.test.ts` uses it).
- **Proving test:** in the board-scope block, give `a` two related references (`b` 0.8 and a new `d` 0.5) and scope to `["a","b"]`. Expect:
  - a scored row for `b`, and none for `d`;
  - the pane note to read "1 related".

  Add one case under a technique filter: a linked reference that matches the filter appears once (it also closes T4's "dedupe under a filter untested").

#### Important (Should Fix)

**I1. Review Focus 6 is only half tested: no test saves a board edit.**
- **Where:** `app/src-tauri/src/commands.rs` tests. `link_edit_survives_flush` exists (:2674), but no board equivalent does. Dropping `|| touched.boards` from `settle` (:632) fails no test.
- **Fix:** add the test `board_edit_survives_flush`:
  1. `create_board` (empty list is fine) on `created()`;
  2. `close_decision(&st(&e)) == Close`;
  3. `saved(&e)["boards"]` holds the board.
- **Proving test:** the new test fails when the `touched.boards` term is removed.

**I2. The board menu loses keyboard focus on every tick and on Create.**
- **Where:** `app/src/boards/menu.ts:57` and `:70`.
- **What:** `render()` rewrites `.bm-list` with `innerHTML`, so the focused checkbox is removed and focus falls to `<body>`. The next key reaches the Reference view (for example Esc unpins, `t` opens the picker), while the menu stays open but unfocused. After Create, the hidden name field had focus, with the same result.
- **Why it matters:** these are keyboard basics for a new panel.
- **Fix:** in `render()`, note the focused `data-board` before the rewrite and refocus `input[data-board="<id>"]` after it. After Create, focus the new board's checkbox (`c.created`).
- **Proving test:** in `menu.test.ts`:
  - focus Harbour's box, fire `change`, await; `document.activeElement` is Harbour's box;
  - Create "Ships"; `activeElement` is the Ships box.

**I3. Compare steals focus from its docked link editor, and its keys die when focus falls to `<body>`.**
- **Where:** `app/src/compare/view.ts:88`, `:107`, `:180` and `:210-213`.
- **What, part 1:** `inside` tests `el`, but only `body` is rewritten. So any store event while the artist types a "why" in the docked editor (a background import, an undo) calls `el.focus()`. The following keys then reach Compare's handler: `x` swaps, `v` toggles, and Esc closes Compare and throws away the typed note.
- **What, part 2:** a notice's Dismiss (or anything else that drops focus to `<body>`) leaves no key working. The handler is on `el`, `<body>` raises no `focusin`, and the Reference view ignores keys while Compare is open. Esc is dead.
- **Fix:**
  - (a) use `const inside = body.contains(document.activeElement);`
  - (b) add the lightbox's pattern (`lightbox/view.ts:301-307`): a capture-phase document `keydown`. When `!closed && !lightbox` and the target is `<body>`, it calls `stopPropagation()` and `preventDefault()` on the original event, focuses `el`, and re-dispatches the key on `el`. The re-dispatch bubbles to `wireUndoKeys`, so Ctrl+Z still works, and it runs once, because the original is stopped.
  - After (a), saving from the docked editor leaves focus on `<body>` (the editor's opener, the old "Link these two" button, was rewritten), so (b) is what keeps Esc working there.
- **Proving tests:**
  - with the link editor open and its textarea focused, `store.apply(change)` leaves `activeElement` on the textarea;
  - focus `<body>`, dispatch Escape on `document`, and Compare is gone;
  - save a link from the docked editor, then press Esc: Compare closes;
  - with focus on `<body>`, Ctrl+Z calls `api.undo` exactly once.

**I4. Compare's modal dialog has no accessible name.**
- **Where:** `app/src/compare/view.ts:45-48`.
- **What:** the lightbox, the link editor and the board menu all have one; Compare does not.
- **Fix:** in `render()`, `el.setAttribute("aria-label", `Compare ${ra.title} and ${rb.title}`)`. It follows a swap.
- **Proving test:** after open, `aria-label` contains both titles; after `x` the order flips.

**I5. Compare plates overflow into the Shared column at window widths of about 900-1150 CSS px.**
- **Where:** `app/src/compare/view.ts:16`, `:19-21`, `:105` and `:119`; `styles.css:567`.
- **What:** `.cmp-tile` has `max-width: 100%`, but the plate and the region outline are placed in absolute px from a 420 px `tileBox`. A side column narrower than 420 px lets the image overlap the middle column. That width is common on scaled laptop screens (1366/125%, 2256/200%), so a reasonable artist will hit it.
- **Fix:**
  - `place()` writes percentages: `${(b[k] / TILE) * 100}%`;
  - CSS (T7's section): `.cmp-tile { width: min(420px, 100%); height: auto; aspect-ratio: 1; }`.
- **Proving test:** the plate's and the outline's `left`, `top`, `width` and `height` style values are percentages (assert the `%` unit only).

#### Minor (Nice to Have)

Each of these is triaged below.

- **M0a. Reorder and "Remove from board" drop hidden members.** `app/src/boards/view.ts:127-131` and `:188`.
  - What: `move()` and Remove build the new list from `members()`, which holds only the references in `store.refs`. A hidden reference is one whose hash fails the path guard in a hand-edited `library.json` (commands.rs:375-386; `thumb_path_in` is a path check, not an existence check). Such a reference is dropped from the board by one Alt+→. It is undoable and rare (T5a's deferral was reasonable), but it is silent.
  - Fix: permute only the visible ids, and leave hidden ids in place:
    ```ts
    const vis = moveItem(visibleIds, from, to); let k = 0;
    const next = b.referenceIds.map((id) => (store.refs.has(id) ? vis[k++] : id));
    ```
    Remove becomes `b.referenceIds.filter((x) => x !== id)`.
  - Test: board `["a","ghost","b","c"]`, with `ghost` not in the store.
    - Alt+→ on `a` sends `["b","ghost","a","c"]`.
    - Remove `b` sends `["a","ghost","c"]`.
- **M0b. The lightbox preview downscale's memory peak.** `app/src-tauri/src/commands.rs:1090`.
  - What: `imageops::resize(.., Lanczos3)` works through an f32 intermediate. For a 20000 x 6000 original the T3 ledger estimates about 780 MB of scratch on top of the 480 MB RGBA decode. That figure is an estimate, not a measurement.
  - Fix: `image::imageops::thumbnail(&d.rgba, w, h)`, the integer area-average that import already uses. Add a `ponytail:` comment naming the ceiling. The trade-off is that a box filter is slightly softer than Lanczos in the view meant for studying pixels, though only for the preview path (TIFF and over 8192 px).
  - Test: the existing preview tests stay green. Memory isn't unit-testable, so measure it in T8 or QA if it's kept.

- **M1. `k` and `b` accept lowercase Latin only.** `app/src/reference/view.ts:551-552`.
  - Fix: use `letterOf(e)` from `keys.ts`, which is the project's layout policy.
  - Test: keydown `{key:"K"}` opens the editor, and `{key:"и", code:"KeyB"}` opens the board menu.
- **M2. The lightbox's `0` and `1` use `e.key` only, which fails on AZERTY.** `app/src/lightbox/view.ts:238` and `:242`.
  - Fix: use `digitOf(e) === 1`, and `e.key === "0" || (!e.shiftKey && e.code === "Digit0")`.
  - Test: `{key:"&", code:"Digit1"}` sets 100%.
- **M3. A double-clicked link Delete shows "That change didn't save. Try again." after it succeeded.** `app/src/links/editor.ts:24-30`.
  - Fix: map `UnknownLink:` to "That link is gone. It may have been undone." (this mirrors `boardErrorCopy`).
  - Test: `linkErrorCopy("UnknownLink:x")`.
- **M4. A link drag that loses its `pointerup` keeps `drag.cancelled`, so Esc never unpins again until the next drag.** `app/src/reference/view.ts:529` and `:676`.
  - Fix: add `handle.addEventListener("lostpointercapture", endDrag, { signal })` next to the `pointercancel` line (:676). It fires after `pointerup`, so the click swallow still works. Guard line 529 with `drag && !drag.cancelled`.
  - Test: pointerdown, Esc, `lostpointercapture`, Esc: the pin is cleared.
- **M5. The board menu does not subscribe to the store, so its ticks are stale after an undo with the menu open.** `app/src/boards/menu.ts`.
  - Fix: `store.subscribe` re-renders on `c.boards` or `c.reset`; unsubscribe in `close()`.
  - Test: apply a boards Change, and the box reflects it.
- **M6. Saving in duplicate mode replaces the existing note.** `app/src/links/editor.ts:171-174`. This is a design call; it is not in the wave. See Declined to judge.
- **M7. Compare's value view always starts off, while the lightbox starts as the artist was looking.** `app/src/compare/view.ts:38`.
  - Fix: `let value = document.body.classList.contains("value")`.
  - Test: with `body.value` set, the tiles open with `.is-value`.
- **M8. The lightbox `.is-hot` label sticks after the pointer leaves the stage.** `app/src/lightbox/view.ts:175-182`.
  - Fix: on stage `pointerleave`, clear `.is-hot`.
  - Test: hover a box, then `pointerleave`: no `.is-hot`.
- **M9. No test covers the inspector membership line after a focus change** (T5a's own minor). `app/src/reference/view.test.ts`.
  - Fix: show `b`, and assert `.ref-boards` lists `b`'s boards.
- **M10. "Board removed — showing all references" stays after the delete is undone.** `app/src/boards/status.ts:20-22`. It is misleading for a moment only. DEFER.
- **M11. Export's skip reasons and refusals are matched by prose prefix across Rust and TS, with no shared contract.** `boards/view.ts:14,25-29` against `export.rs:14,60,69`. DEFER to Plan 6's copy pass (turn them into codes).
- **M12. The two lightbox shadows (`rgb(0 0 0 / …)`) and `.cmp-*` shadows add literal colours.** `styles.css`, T6 and T7 sections. They follow the existing shadow idiom (`styles.css:64, 220`). Accept.
- **M13. Board tiles use `object-fit: contain`, not `tileBox`.** The constraint says new tiles use `tileBox`; the visual result (letterboxed, true aspect) is the same and there's no inline `style=`. Accept as is.

---

### Triage of deferred minors

Verdicts: **MUST** = MUST-FIX-BEFORE-MERGE, **CHEAP** = FIX-IF-CHEAP (in the one wave), **DEFER** = later (owner named). **CLOSED** = a carry-in that has already landed (evidence given).

#### Rulings and carry-ins

| Item | Verdict |
|---|---|
| B1-B4, T5 split, R27, C26 | Rulings applied. CLOSED. R27 (no metadata editing) is still flagged to the user as a scope call. C26 (Compare from Tree and Radial): DEFER, Plan 5/6, as recorded. |
| `UnknownTag` remap for taxonomy items | DEFER, Plan 6 copy pass (recorded). |
| Carry to T5: raw OS text mapped in the UI | CLOSED: `skipCopy` and the refusal copy (`boards/view.ts:25-29,142`); the test at `boards/view.test.ts:189`. |
| Carry to T5: "credits.txt was not written" | CLOSED: `boards/view.ts:151`; the test at :202. |
| Carry to T3: `store.apply` reads links and boards; TS `Change` gains optional and nullable fields | CLOSED: `store.ts:67-68`, `api.ts` `Change`. |
| Carry to T3: re-render on link-only changes | CLOSED: `reference/view.ts:748` (`c.links`); `lightbox/view.ts:323`. |
| Carry to T3: UI skips unknown ref ids | CLOSED: `linksOf` filter (`reference/view.ts`), `members()` (`boards/view.ts:48`). |
| Carry to T6: full:true with the original missing | CLOSED: `pre.onerror -> sayPreview` (`lightbox/view.ts:353`). |
| T8 hand check: "Esc mid-drag, then release" | Carried to T8 (running). |
| FINDING: unhandled rejections; exit-code gate | CLOSED: 09a99f6; merge checks now assert exit 0. |
| Ruling (inputs :75): T5b extension, where Galaxy and Radial drop an out-of-scope selection and Radial's arrows skip | CLOSED: 4cbaf85; `galaxy.ts:124,159`, `radial.ts:170,241-246`. |
| Ruling (inputs :84): a visible membership line in the inspector | CLOSED: `reference/view.ts` `renderBoardsLine` (`.ref-boards`), the test "S1: shows which boards the focus is on". |
| Ruling (inputs :98, I2): closing Compare doesn't navigate | CLOSED: 956fc28 and 6e07004; `firstrun.ts` passes no `onClose` from Reference; Esc is stopped (`compare/view.ts:185-190`). |
| Ruling (inputs :99, I1): Shared/Only is right at all times (rescore, latest wins, local intersection) | CLOSED: `compare/view.ts:66-74,125-142,215-221`; the test "a tag change asks for the score again…". |

#### Task 1

| Item | Verdict |
|---|---|
| `check_board` uses trim+lowercase, not `name_key` (inner whitespace) | DEFER, Plan 6 copy/validation pass. |
| `InvalidTag` wording for an identity-changing `Replace*` | DEFER. The commands can't reach it (commands.rs:858-861). |
| C31 test lacks a ref that is on both a link and a board | DEFER, test-only. The guard's `find` over a chained iterator is already covered for each kind separately. |

#### Task 2

| Item | Verdict |
|---|---|
| `NamedTempFile` gives 0600 on Unix | DEFER, Plan 6 cross-platform. |
| One refusal message for missing, unreadable or inside | DEFER, Plan 6 copy pass. `pickFolder` returns only existing folders; an unreadable folder already gets the "couldn't write" copy. |
| A failed credits write loses its reason | CLOSED in the UI ("credits.txt was not written"); the reason itself: DEFER. |
| Raw OS text in skipped reasons | CLOSED (mapped in T5). |
| 120 chars against 255-byte names | DEFER, Plan 6. A CJK title can exceed 255 bytes on APFS and ext4. |
| Hard-link fallback on FAT/exFAT under Linux | DEFER, Plan 6. |
| No junction or symlink test | DEFER, Plan 6. |

#### Task 3

| Item | Verdict |
|---|---|
| A bad or zero-length cached PNG is never rebuilt; no `sync_all` before the rename | DEFER, Plan 6 integrity. Temp+rename makes it rare, and the fallback is the thumbnail with the note, never blank. |
| Concurrent first opens both decode | DEFER (harmless: an atomic rename, last wins). |
| Lanczos3 f32 peak at about 780 MB | CHEAP (M0b; unmeasured, a quality trade). |
| ICC/EXIF warning lost when the decode then fails | Accepted, CLOSED. |
| The cache is never pruned | DEFER, Plan 6 integrity. |
| `write_thumbs_matches_import` compares shared code | DEFER, test quality. |
| `inScope` is O(members) per call | DEFER, Plan 6 performance. A memoised `Set` keyed on the board's `referenceIds` is a one-liner if 2,000 x 2,000 shows in profiling. |

#### Task 4

| Item | Verdict |
|---|---|
| Dedupe under a filter untested | MUST (folded into C1's proving test). |
| "N related" counts linked refs; the all-linked case shows no empty note | DEFER, polish. |
| Duplicate-mode Save replaces the note | DEFER, a design call for the user or QA. The plan (Task 4) and `editor.test.ts:107` specify "keeps the typed text", and Decision 2 says a second reason means editing the note, which is what the editor does. |
| Combobox titles only, no "no matches" line | DEFER, Plan 6 accessibility pass. |
| Delete has no busy guard (double-click spurious error) | CHEAP (M3). |
| `k` lowercase only | CHEAP (M1, together with `b`). |
| A half-typed note is lost on `t` or a focus change | DEFER, Plan 5/6 (drafts). |
| `openLb` leaves the link editor open | DEFER. It is harmless: the lightbox covers it, and it is still there on close. |
| `linkedFirst` has no pair dedupe | DEFER. Decision 2 and the `DuplicateLink` guard make it impossible short of a hand-edited `library.json`. |
| A cancelled drag with no `pointerup` keeps `drag` | CHEAP (M4). |

#### Task 5a

| Item | Verdict |
|---|---|
| Reorder and remove send only UI-visible members, dropping hidden members | CHEAP (M0a). "Hidden" means a hand-edited bad hash, so it is rare. |
| The board menu doesn't subscribe (stale ticks after undo) | CHEAP (M5). |
| Menu counts include unknown ids | DEFER, polish. |
| The toast's "Open folder" is dead after the Boards view unmounts | DEFER. Views are only hidden, never destroyed except by `shell.destroy()` (`views.ts:12-75`). |
| Confirm buttons inside `role=status` | DEFER, Plan 6 accessibility pass. |
| Renaming refocuses the rename input on every `renderHead`, with no blur exit | DEFER, Plan 5/6 polish. Note: a store event mid-rename also resets the typed name to the stored one. |
| No test of the membership line after a focus change | CHEAP (M9). |
| (new) Menu focus lost after a tick or Create | MUST (I2). |

#### Task 6

| Item | Verdict |
|---|---|
| Source dimensions never read (100% is not 1:1 for the preview or thumbnail fallback) | DEFER, Plan 6. |
| `fitted` resets only via `0` | DEFER, polish. |
| The wheel mid-drag remaps the start corner | DEFER, polish. |
| `0` and `1` keys use `e.key` only | CHEAP (M2). |
| `.is-hot` has no z-index | DEFER, polish. |
| `is-hot` not cleared on `pointerleave` | CHEAP (M8). |
| Enter while zoomed drafts off-screen | DEFER, Plan 6. The right fix drafts at the visible centre, which is more than a line. |
| 0x0 dimensions | CLOSED: the `imgSize` fallback (`lightbox/view.ts:39`). |
| Window blur releases Space but doesn't call `dropDrag` | DEFER (`lostpointercapture` covers the usual case). |
| Tab onto an off-screen box mid-drag pans under the drag | DEFER, polish. |

#### Prefix fix

| Item | Verdict |
|---|---|
| `.catch(sayPreview)` logs nothing | DEFER, Plan 6 diagnostics. |

#### Task 7

| Item | Verdict |
|---|---|
| Plates overflow the side column at 900-1150 px | MUST (I5). |
| A store event refocuses the dialog while typing in the docked editor | MUST (I3a). |
| Only the first region is outlined | DEFER, Plan 5/6 polish. |
| An unknown operation gives an empty label | DEFER, Plan 6 copy pass. |
| The `sides` comparator gives NaN (Infinity - Infinity) | DEFER (harmless order; `?? Infinity` can become a large number later). |
| Value view starts off | CHEAP (M7). |
| `L` and `beforePicker` untested | DEFER, test gap, low risk (`dock.ts` is 40 lines). |
| The test uses a callout, not a Ranked tile | DEFER. |
| Boot `destroy` doesn't close Compare | DEFER. `c.reset` closes it on a library switch. |
| The dialog has no accessible name | MUST (I4). |
| Keys bound on `el` only (focus on `<body>` kills Esc, `v` and `x`) | MUST (I3b). |
| A pending re-score shows the previous branches and score | DEFER, polish. |
| The onClose-after-focus test doesn't assert the order | DEFER. |
| The third reply's Shared equals the local overlap (can't tell them apart) | DEFER, test quality. |
| Shift+Enter relies on Chromium's shifted click | DEFER, Plan 6 (check on WKWebView). |

---

### The fix-wave list (numbered, complete)

**Must-fix (1 Critical, 5 Important):**

1. **C1. Scope the Ranked rows.** `reference/view.ts:301`: `scoredRows = list.filter((x) => !linkedIds.has(x.id))`, for both branches.
   - Test: related `[b 0.8, d 0.5]` under scope `["a","b"]` shows no scored `d` and reads "1 related".
   - Test: under a technique filter, a linked match appears once.
2. **I1. Add `board_edit_survives_flush`** to the `commands.rs` tests: `create_board`, then `close_decision`, then `saved()["boards"]`.
   - It must fail without `|| touched.boards` in `settle` (:632).
3. **I2. Keep focus in the board menu.** `boards/menu.ts:28-36`, `:57` and `:70`: refocus the same `input[data-board]` after `render()`; after Create, focus the new board's box.
   - Tests in `menu.test.ts`.
4. **I3. Compare focus and keys.** In `compare/view.ts`:
   - `:88`: `inside = body.contains(document.activeElement)`;
   - add a capture-phase document `keydown` forwarder for keys aimed at `<body>`. It stops the original event, focuses `el` and re-dispatches on `el`, gated on `!closed && !lightbox`; the pattern is at `lightbox/view.ts:301-307`.
   - Tests: a store event leaves the docked textarea focused; Esc on `<body>` closes Compare; a save from the docked editor followed by Esc closes Compare; Ctrl+Z on `<body>` calls `api.undo` once.
5. **I4. Compare `aria-label`** "Compare <A> and <B>", set in `render()` (`compare/view.ts:66+`).
   - Test: both titles are present, and the order flips on `x`.
6. **I5. Compare plates in percentages.**
   - `compare/view.ts:19-21`: `place()` writes % of `TILE`;
   - `styles.css`, T7 section: `.cmp-tile { width: min(420px, 100%); height: auto; aspect-ratio: 1; }`.
   - Test: the plate's and the outline's box values use `%`.

**Fix-if-cheap (same wave):**

7. **M0a.** `boards/view.ts:127-131` and `:188`: permute only the visible ids, leaving hidden (bad-hash) ids in place; Remove filters only the removed id.
   - Test: `["a","ghost","b","c"]`: Alt+→ gives `["b","ghost","a","c"]`; Remove `b` gives `["a","ghost","c"]`.
8. **M0b.** `commands.rs:1090`: `imageops::thumbnail` instead of `resize(.., Lanczos3)`, plus a `ponytail:` ceiling comment.
   - It is unmeasured and trades a little sharpness on the preview path only. Skip it if the controller prefers Lanczos.
   - Tests: the existing preview tests stay green.
9. **M1.** `reference/view.ts:551-552`: `letterOf(e) === "k"` / `"b"`.
   - Test: `{key:"K"}` and `{key:"и",code:"KeyB"}`.
10. **M2.** `lightbox/view.ts:238` and `:242`: `digitOf(e) === 1`; `0` by `e.key`, or by `code === "Digit0"` without Shift.
    - Test: AZERTY `{key:"&",code:"Digit1"}`.
11. **M3.** `links/editor.ts:24-30`: `UnknownLink:` maps to "That link is gone. It may have been undone."
    - Test: the copy.
12. **M4.** `reference/view.ts:676`: `lostpointercapture -> endDrag` on the handle; `:529` guards Esc with `!drag.cancelled`.
    - Test: Esc unpins after a lost capture.
13. **M5.** `boards/menu.ts`: subscribe, re-render on `boards` or `reset`, unsubscribe in `close()`.
    - Test: the stale-tick case.
14. **M7.** `compare/view.ts:38`: the value view starts from `body.classList.contains("value")`.
    - Test.
15. **M8.** `lightbox/view.ts`: a stage `pointerleave` clears `.is-hot`.
    - Test.
16. **M9.** `reference/view.test.ts`: the membership line updates after `show(b)`.
    - Test only.

After the wave, the gates are the same as the per-task checks: vitest exit 0 with 0 Errors, tsc, build, cargo test, and clippy `-D warnings`.

---

### Declined to judge

- **The always-on-top board window:** v1.1 (SPEC §11, plan Global Constraints).
- **Metadata editing (title, creator, year, credit):** the R27 scope call belongs to the user, not a review finding.
- **Duplicate-mode Save replacing the existing note (M6):**
  - the plan (Task 4) and `links/editor.test.ts:107` specify that the typed text is kept;
  - Decision 2 says a second reason means editing the note.

  Whether the editor should also prefill the old note so both are kept is a UX call for the user or QA.
- **Callout thumbnails (the technique nodes' "other references") ignoring the board scope:** the plan names only Ranked and search for the Reference view (Task 5). Whether callouts scope too is a design call for Plan 5/6 or the user.
- **"Open folder" reveals the export folder inside its parent rather than opening it:** this is the B3 ruling (reveal-only capability). Opening inside would need `open-path`, or a revealed file path; that belongs to Plan 6 T1's opener work.
- **`reveal_item_in_dir` has no scope in `tauri-plugin-opener` 2.7.3, so the webview can reveal any path:** accepted under B3. It only shows the item in the file manager, never reads or runs it.
- **The UI supplies `export_board`'s `dest`.** This is inherent to "Export board to folder". It is mitigated by `std::path::absolute`, canonicalisation, the outside-library refusal, `persist_noclobber` and new-file-only writes. `lightbox_source` takes an id only.
- **Compare shows `thumb1024`, not full resolution:** SPEC §5 asks for "large", and full resolution is the lightbox's job (`L` from Compare).
- **Region thumbnails outlined rather than cropped:** recorded ruling a1.
- **DESIGN.md token and type fidelity of the new CSS:** not read in depth. T8 and QA as the artist persona are better placed to judge it.
- **The cross-platform behaviour of the opener, the file names and the permissions on macOS and Linux:** Plan 6, as recorded.

---

### Assessment

**Ready to merge?** With fixes

**Reasoning:** The core is sound: edits, undo, saves, export safety, asset scope, the opener grant, and scope plumbing in the graph views. One functional break remains: "Show only this board" doesn't filter Ranked when no technique filter is on (C1). Five Important items follow: the untested board save, focus and keys in the board menu and in Compare, and Compare's accessible name and layout. All are small, concrete and testable, so one fix wave plus a scoped re-review should clear the gate.
