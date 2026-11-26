# Task 3 re-review 1: fix round for I1

Range: 176e677..bd484cb (one commit, bd484cb). I read the diff and the current `texcache.ts`. I did not re-run the suite.

## I1: ADDRESSED

- `texcache.ts:28-31`: the fulfil handler now starts with `if (tex == null) { this.pending.set(url, "failed"); return; }`.
  - `== null` catches both `undefined` and `null`. It does not catch falsy but valid values such as `""` or `0`.
  - The handler returns before `live.set`. So no empty entry gets into `live`, `live.size` stays correct, and eviction can never call `unload(undefined)` or `unload(null)`.
  - `pending` holds `"failed"`, so `get` returns it at line 22 on every later call and never calls `load` again. This matches the reject path (line 40) and `failed_is_sticky`.
  - Nothing in the new path can throw, and `get` still returns synchronously.
- The `null` case was a separate bug before the fix. `live.get` returned `null`, which passed the `!== undefined` check at line 17, so `get` handed `null` back as a texture. This fix closes that too.
- Test `texcache.test.ts:+27-38`: it asserts `"failed"` and `toHaveBeenCalledOnce()`, as the review asked. The report shows RED before the fix (`expected 'loading' to be 'failed'`) and GREEN after it, and `tsc` passes.

## New findings introduced by the fix

None that are Critical or Important.

### Minor 1: the `unload` check proves little after the fix
- `texcache.test.ts:+35-37`. The URL `"y"` uses the same loader, so it also resolves `undefined`. Nothing ever becomes live, so `unload` could not be called in any case.
- The check does catch the old code, where `x` sat in `live` as `undefined` and was evicted once `y` arrived. But it never shows that a real texture can load next to a failed one, and that eviction still works then.
- Fix (optional): have the loader resolve `undefined` for `"x"` and a string for `"y"`. Then assert `cache.get("y") === "y"`, `size() === 1`, and that `unload` was not called.

## Observations (outside the fix diff)

- The fix round ran only `texcache.test.ts` and `tsc --noEmit`, not the whole suite. The change touches only `texcache.ts`, so this is low risk.
- The other open items in `task-3-review.md` are unchanged in this round: Minor 1 to 5, plus I2 (`MIN_SCORE`), which the report says the controller ruled on.
