# Task 3 re-review 1 (fix cc44550..d70e050)

### Finding Verdicts
- **I1: no test of lightbox_from's over-8192 px path or of is_allowed on a real preview made after the grant**: ADDRESSED. The new test is `lightbox_source_downscales_oversized_png` at `app/src-tauri/src/commands.rs:2612-2632`.
  - The precondition at :2615 asserts that `cache/lightbox` does not exist after `created()`. `env()` calls `allow_lightbox_cache` at :1537, so the folder is created after the grant, as on a first run.
  - It imports a 9000x2 PNG (:2618-2623). `shown` is true but 9000 > 8192, so the call takes the decode branch at :1083-1105.
  - It asserts `full == false` (:2626), `(8192, 2)` from `fit` and the `image_dimensions` read-back (:2627), that the file is under `cache/lightbox` (:2629), the file's own dimensions (:2630) and `is_allowed(&png)` (:2631).
  - The test can fail:
    - If the Lanczos3 resize at :1087-1091 were skipped, the PNG would be 9000x2, so the asserts at :2627 and :2630 would fail.
    - If `fit` were wrong, the same asserts would fail.
    - If the scope did not cover a folder made after the grant, :2631 would fail, because it checks the real persisted file and not a made-up path like `lightbox_cache_in_asset_scope` (:2638).
  - I ran it at HEAD d70e050 (`cargo test --lib lightbox_`): 4 passed, the new test included.

### New Breakage in the Fix Diff
None. The diff is test-only: 24 added lines in the `mod tests` of `commands.rs`. One nit: :2630 hard-codes `8192` where :2627 uses `LIGHTBOX_MAX_SIDE`. It does no harm.

### Verdict
**Fix round:** All findings addressed, no new Critical/Important breakage.
