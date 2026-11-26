# Task 7 prefix: unhandled rejections from the lightbox

**Status:** DONE. One commit on `plan4-boards`, `09a99f6` (`fix(test): typed Api fakes resolve a LightboxSource; the lightbox treats a bad reply as a refusal`). Nothing is pushed or merged.

## Root cause

- The typed `Api` fakes in `reference/view.test.ts` and `firstrun.test.ts` had `lightboxSource: vi.fn()`, which resolves `undefined`.
- When a test opened the lightbox, `lightbox/view.ts` read `s.full` on `undefined`.
- The throw happened inside the success handler of `.then(ok, onRejected)`. A rejection handler never catches its sibling success handler's throw, so vitest reported 2 unhandled rejections and exited 1, although all 570 tests passed.

## Fix

- **The fakes:** both now resolve a valid `LightboxSource` (`{ path: C:\lib\images\<id>.jpg, full: true, width: 1, height: 1 }`).
- **`lightbox/view.ts`:**
  - A missing or malformed reply (falsy, or with no string `path` or an empty one) is treated as a refusal: the thumbnail stays and the preview note shows.
  - `note.hidden` is now `s.full === true`.
  - The chain now ends in `.catch(sayPreview)` instead of a sibling rejection handler, so nothing in it can surface as an unhandled rejection.
- **New test:** `a_missing_or_invalid_source_reply_is_a_refusal` tries `undefined`, `null`, `{}` and an empty path. Each keeps the thumbnail and shows the note. It failed first: 1 failed, with an unhandled error.

## Checks

| Check | Result |
|---|---|
| `npx vitest run` | **exit 0**, **0 errors**, 571 passed (570 + 1), 43 files |
| `tsc --noEmit` | clean |
| `npm run build` | exit 0 |
