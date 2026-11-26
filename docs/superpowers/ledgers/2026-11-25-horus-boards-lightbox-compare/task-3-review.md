# Task 3 review: commands, the lightbox source and store support (98e1333..cc44550)

**Verdict: Approved.** One Important item: the downscale branch has no test, and no test runs `is_allowed` on a preview PNG that exists. Fix it in a follow-up or in Task 6. It does not block.

### Spec Compliance
- ✅ The 10 commands exist with the specified signatures, and `lib.rs` registers them. The 7 edits go through `commit` → `edit::apply`, so each is one undo step, marks the library dirty, and returns Task 1's wire codes through `e.to_string()`. Export does not go through `commit`, so it is not undoable.
- ✅ `Replace*` keeps the identity. `update_link`, `rename_board` and `set_board_members` build `after` as `..before.clone()` and change only `why`, `name` or `reference_ids`, so `InvalidTag` is unreachable (carry-in e).
- ✅ `export_board` and `lightbox_source` use `#[tauri::command(async)]`, the same idiom as `graph_edges`. Each clones or resolves inside a block scope that drops the guard, and the copy and the decode run with the lock released.
- ✅ `export_board` passes only visible members. `export::export_board` iterates `board.reference_ids`, so the board order is kept even though `refs` is in library order. A hidden member shows as "no longer in the library". `dest` goes through `absolute`. Refusals pass through raw (carry-in f).
- ✅ `score_pair` reads through `visible()` and calls `Index::score` with no `MIN_SCORE` cut. `Index::score` builds its vectors only from tags (`correlate.rs:87`), so links cannot enter a score. A hidden or unknown id gives `unknown reference: <id>`.
- ✅ `lightbox_source` takes only `ref_id`; the UI never supplies a path. It resolves through `visible()`, so `r.hash` has passed `thumb_path_in` validation (the test's `../../evil` hash is refused). It finds the original with `lib.image_path(r)`. The cache file is `<cache_dir>/lightbox/<validated hash>.png`.
- ✅ The full/preview split works as specified. jpg, jpeg, png, webp and gif up to 8192 px give the original with `full: true`. Anything else goes through `decode_srgb` (MAX_BYTES guard first, then orientation, ICC and alpha kept), then `fit` + Lanczos3 when over 8192, then a temp file in the cache dir and `persist`. A cache hit reuses the PNG. `width` and `height` are read back from the PNG.
- ✅ Size guard before the full decode: `decode_srgb` checks `MAX_BYTES` from metadata before it opens the file. The pixel budget is the `image` crate's default `Limits` (512 MiB alloc; see below). `store` uses the same limit, so any imported image also decodes here. An image too big for that is never imported.
- ✅ Asset scope: `allow_lightbox_cache` adds only `<cache_dir>/lightbox` (recursive). `cache_dir` is `app_cache_dir()` in `lib.rs` and a tempdir in `env()`, never the library. The test proves the cache root outside `lightbox/` is not allowed. The CSP is untouched.
- ✅ The `import.rs` refactor matches the brief.
  - `Decoded`, `decode_srgb_from` (steps 1–5 in the old order), `decode_srgb`, `pub on_white`, `write_thumbs` (own `Thumbs` guard) and `pub(crate) fit` all exist.
  - `store` keeps hash-on-write, its outer `Thumbs` guard around `write_thumbs` + `sync_all` + `persist`, and the `sync_all`-then-persist order.
  - The panic hook moved into `write_thumbs`, keyed on a `#[cfg(test)]` thread-local `PANIC_HASH`. The `PANIC_STEM` test changed only in how it arms the hook. Thumbnail dimensions now come from `rgb.dimensions()`, which equals the old `width`/`height`.
- ✅ `LibraryView.boards` is added. In TS, `Board`, `ExportReport` (`skipped: [string, string][]`, `credits: string | null`), `LightboxSource`, `Change.links?/boards?` (optional and nullable) and the 10 wrappers are added.
- ✅ Links never reach a score: in `correlate.rs`, `links` appears only in a test fixture (`:251`) and in comments about technique-branch links.
- ✅ The contract rows use camelCase keys that match the Rust parameter names: `fromRef`/`toRef`/`why`, `linkId`, `name`/`referenceIds`, `boardId`, `dest`, `a`/`b`, `refId`. The 10 `vi.fn()` are in both full `Api` fakes.
- ✅ The store matches the brief.
  - It has `boards`, `scope`, `setScope` (emits the specified event with `scope: true`), `inScope` (true when `scope` is null, else members only, false for an unknown id) and `linksFor` (both directions, newest first).
  - `apply` replaces `links`/`boards` when non-null. If the scoped board is gone, it sets `scope = null` and emits `{...c, scopeCleared: true}`.
  - `reset`/`load` sets `scope = null`. The scope lives only in the TS store, so it is never persisted and never undoable.
- ✅ `data.ts` now uses `inScope: (id) => store.inScope(id)`, a live closure. The scope event bumps `version`. `everything` is removed.
- ✅ Carry-ins (a)–(d) are covered: `c.links` triggers a re-render in `lightbox/view.ts` and in `reference/view.ts`'s `touchesFocus`, and both have tests.
- ✅ The fakes deviate from the brief, and the deviation is justified. Three of the brief's 12 files hold `Snapshot` literals, not `LibraryView` literals. `boards` is required, so `tsc` would flag any `LibraryView` literal that is missing it.
- ✅ The new commands can be invoked over real IPC. `build.rs` uses the default `tauri_build::try_build` with no app-manifest command allowlist, and `capabilities/default.json` holds only `core:default` and `dialog:allow-open`. The new commands are therefore as reachable as every existing app command, once registered in `lib.rs`.
- ✅ The size limit is sourced: `image-0.25.10/src/io/limits.rs:54` has `max_alloc: Some(512 * 1024 * 1024)`.
- ⚠️ Cannot verify from the diff that the test suites pass. I took the report's numbers.
- ⚠️ The asset-scope grant needs a closer look. `allow_lightbox_cache` runs at `setup`, before `lightbox/` exists. The library grant at `commands.rs:435` runs on folders that already exist.
  - I read Tauri 2.12.7's `scope/fs.rs`. `push_pattern` also inserts a `canonicalize_parent` pattern: the nearest existing parent, canonicalised to `\\?\C:\…`, joined with `lightbox\**`. `is_allowed` canonicalises an existing file to the same verbatim form, so a real preview PNG should match on Windows.
  - The test only checks a file that does not exist, which is never canonicalised. So the verbatim-form match is unproven by the tests (see Important #1).

### Strengths
- The lock discipline is clean in both async commands. A scoped block drops the guard before any I/O or decode.
- Defence in depth on the cache path: going through `visible()` means only a hash that passed `thumb_path_in` validation can name a cache file. This is stated in a comment and tested with `../../evil`.
- `lightbox_source_preview_for_tiff` is a strong test. The TIFF is generated in the test and imported for real. It checks the PNG is under the cache, that no temp file is left, that a second call returns the same value, and that the mtime is unchanged, which proves the cache hit skips the decode.
- The negative case in `lightbox_cache_in_asset_scope` (cache root not allowed) tests the "narrow scope" rule directly.
- The thread-local panic hook cannot trip a test running in parallel. That is better than the old stem-based global trigger.
- Undo tests compare the whole `links`/`boards` state after each step, not only lengths.

### Issues

#### Critical (Must Fix)
None.

#### Important (Should Fix)
1. **The over-8192 downscale branch has no test** (`commands.rs` `lightbox_from`: `fit` + `imageops::resize`, and the reported `width`/`height` coming from the resized PNG). Review Focus 3 names "an image of 20,000 px or more → PNG preview" and says it is tested in Tasks 3 and 6. Task 3 covers only the TIFF half. A cheap test needs nothing else: import a 9000×2 (or 20000×1) PNG. It is a few KB on disk and decodes in milliseconds. Assert `full: false`, `(width, height) == (8192, …)`, and that the PNG is in the cache. This is also the only path where `fit`'s rounding reaches the UI. In this test, or in the TIFF one, also assert `e.app.asset_protocol_scope().is_allowed(&got.path)` on the real, existing PNG. That proves the webview can load what `lightbox_source` returns once `is_allowed` canonicalises the path, with the cache dir created after the grant, as it is at first run.

#### Minor (Nice to Have)
1. **A bad cache entry is never rebuilt.**
   - On a cache hit, `png.is_file()` is true, so `image_dimensions(&png)` runs. If that read fails, the command returns `Err` on every call, so that reference shows the thumb1024 fallback note forever.
   - A zero-length or truncated PNG left by a power loss can cause this, because there is no `sync_all` before `persist`, unlike `store`. So the brief's "a crash never leaves a half-written cache file" holds for an app crash but not for an OS crash.
   - Fix: when the header read fails, remove the file and decode again. Optionally add `tmp.as_file().sync_all()` before `persist`, to match `store`.
2. **Concurrent first opens of the same reference** (two lightbox windows, or a quick reopen) both decode, then both `persist`. On Windows the second rename can fail if the first PNG is open (the webview or `image_dimensions`). The fallback then covers that one call. Rare and self-correcting; a comment is enough.
3. **Memory peak on large previews:** `imageops::resize` (Lanczos3) allocates an f32 RGBA intermediate. For a 20000×6000 source that is about 780 MB, on top of the decoded RGBA. The brief mandates Lanczos3, so this is not a defect. If the lightbox hits OOM on big scans, `imageops::thumbnail` (already used for thumbs) is the cheap swap. Worth a `ponytail:`-style comment naming that ceiling.
4. **Implementer concern (1), a warning lost when the decode then fails:** this is a real deviation from "without changing its behaviour", but low impact, since the file is reported as skipped anyway. Acceptable as documented. Note it in the plan's ledger, so a later "warnings + skip" expectation is not surprised.
5. **Implementer concern (2), the cache is never pruned:** acceptable for this task. Plan 6's integrity pass is the right home. Carry it forward as a ledger item.
6. **Implementer concern (3), Rust tests not run red first:** low risk here. The tests target new symbols, so they could not compile before. The assertions can fail: mtime, temp-file count, the scope negative, exact error strings. One caveat: `write_thumbs_matches_import` compares two paths that now share the same `write_thumbs` code, so it proves path ↔ reader equivalence, not preservation of Plan 1 behaviour. Plan 1's existing `import::` tests (colour, orientation, panic, cleanup) are what guard preservation, and they pass unchanged.
7. **`inScope` cost:** each call does `boards.find(...)` and then `referenceIds.includes`, which is O(members). Plan 3's graph views call it once per node per render. That is fine at current sizes. If the Galaxy stutters under scope, cache a `Set` keyed on `(scope, boards)` identity.
8. **The `full: true` branch does not check that the original exists.** A missing original gives the webview a broken image, not an `Err`. Task 6 should treat `img.onerror` like an `Err` (fall back to thumb1024 with the note). Pass this to Task 6's brief.

### Assessment
**Task quality:** Approved
**Reasoning:** Every requirement and named risk checks out: the narrow, injected cache scope; no path from the UI; the lock released before decode or copy; links excluded from scores; the scope kept as view state with `scopeCleared`; camelCase contract rows; and a refactor that preserves import behaviour, including the panic and cleanup guards. The only real gap is test coverage: the >8192 downscale branch, and an `is_allowed` check on a real preview PNG. Both are cheap to add.
