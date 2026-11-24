# Task 4 report: the `import` module

**Status:** DONE_WITH_CONCERNS. The concern is the ICC fixture colour; see concern 1.
**Commit:** `903f66d feat(core): safe import with BLAKE3 dedupe, thumbnails and ICC→sRGB`

## What I implemented

The module is `app/src-tauri/src/import.rs`.

### Public interface

These follow the brief:
- `Skip`
- `ImportReport { added, duplicates, skipped, warnings }`
- `MAX_BYTES`
- `ImportOutcome { references, report }`
- `import_paths(root, known_hashes, paths) -> ImportOutcome`

`import_paths` is lock-free. It never touches `LibraryData`.

### Steps for each file

1. **Walk the input.** Each input path goes through `WalkDir` with `follow_links(true)` and `sort_by_file_name`, so the order is deterministic. A file input returns the file itself.
   - A walk error becomes `Skip::Unreadable`.
2. **Check the size.** `fs::metadata` length is checked before the file is opened.
   - Larger than `MAX_BYTES` gives `TooLarge(len)`.
   - 0 bytes gives `Unreadable("empty file")`.
3. **Hash.** BLAKE3 through `Hasher::update_reader`.
4. **Dedupe.** The hash is looked up in `known_hashes`, then in a batch map of `hash → id` for files added earlier in this call.
   - A match gives `duplicates.push((src, id))`.
5. **Decode.** The decode runs in memory before anything is written, so an unreadable file leaves nothing in `images/`.
   - The format is sniffed from the content (`with_guessed_format`), not from the extension.
   - An unknown format gives `Unsupported`, and so does `ImageError::Unsupported`. Any other decode error gives `Unreadable`.
   - `decoder.icc_profile()` runs before `DynamicImage::from_decoder`. An `Err` from it becomes a warning, not a skip.
6. **Convert ICC.** The decoded image becomes RGBA8, and qcms converts it to sRGB (`Profile::new_from_slice` → `Transform::new(.., RGBA8, Perceptual)` with an sRGB output that has `precache_output_transform`, then `apply`).
   - This happens before resizing.
   - Profiles that are not RGB (header bytes 16..20 are not `RGB `) are refused before they reach qcms. qcms has `debug_assert!(false, "unexpected colorspace")` in `transform_create`, which would panic in dev or test builds on a CMYK profile.
   - A failure to parse, to create the transform, or a non-RGB profile all go into `report.warnings` with the pixels left untouched. The import still succeeds.
7. **Make the thumbnails.** RGBA becomes RGB8, because JPEG can't encode alpha. There are two sizes, 256 and 1024, matching `Library::create`'s folders.
   - `fit()` caps the longest side at `size` and never upscales. If the image is already small enough it is written unchanged. Otherwise it goes through `image::imageops::thumbnail`.
   - The thumbnails are JPEG at quality 90.
8. **Write.** The thumbnails are written first, then the original is copied byte for byte with `fs::copy` to `images/<hash>.<ext>`.
   - Every write goes through `<dst>.tmp` and then `fs::rename`. `write_atomic` also creates the parent folders, so a bare root works.
   - If any write fails, the `.tmp` is removed and every output already written for that file is removed. The result is `Skip::Unreadable("could not write to the library: …")`.

### The new Reference

| Field | Value |
|---|---|
| `id` | the hash hex |
| `hash` | the hash hex |
| `file` | `<hash>.<ext>`, a bare name. The extension comes from the sniffed format's first extension (`jpg`, `png`, `webp`, `tiff`, `gif`). |
| `title` | the source file stem |
| `width`, `height` | the decoded dimensions |
| `added_at` | `iso_utc(now)` as `YYYY-MM-DDTHH:MM:SSZ`, using std and Hinnant's civil-from-days (about 15 lines, no time crate) |
| `tags` | empty |

### library.rs

I added `image_path_in(root, file)` and `thumb_path_in(root, hash, size)`. `Library::image_path` and `Library::thumb_path` now call them, so the two can't drift. There is no other change.

### Dependencies

| Crate | Version |
|---|---|
| `blake3` | 1.8.7 |
| `walkdir` | 2.5.1 |
| `qcms` | 0.3.0, builds fine on Windows MSVC |
| `image` | 0.25.10, with `default-features = false` and features `jpeg`, `png`, `webp`, `tiff` and `gif` |

## TDD evidence

**RED.** I wrote the tests first against stub bodies (`todo!()`). `cargo test import::` gave:

```
test result: FAILED. 0 passed; 9 failed; 0 ignored; 0 measured; 17 filtered out
```

**GREEN** after the implementation:

```
test result: ok. 9 passed; 0 failed; 0 ignored; 0 measured; 17 filtered out
```

**Mutation check.** I commented out `t.apply(rgba)` and `icc_converted_to_srgb` failed. The centre pixel was **(254, 70, 70)** unconverted, against **(255, 41, 57)** converted. I restored the line afterwards.

**Full suite:** `cargo test` gives 26 passed, 0 failed. `cargo fmt` is clean. `cargo clippy --all-targets -- -D warnings` is clean.

### Tests

The 7 from the brief:
- `imports_and_thumbs`
  - It checks 64×48, `id == hash`, `file == "<hash>.jpg"`, the title, empty tags and the shape of `added_at`.
  - The original is byte-identical.
  - Both thumbnails are **exactly** 64×48. That proves no upscaling, which "at most 256" alone would not.
- `dedupes_same_bytes`
  - It covers a duplicate within one batch, and a second run with `known_hashes` that reports the existing id.
- `skips_with_reasons`
  - `fake.psd` gives Unsupported or Unreadable. `empty.jpg` gives Unreadable. The valid file is still added.
  - `images/` holds exactly one file, so there are no partials and no `.tmp`.
- `too_large_is_skipped_without_reading`
  - It uses a sparse file made with `set_len(MAX_BYTES + 1)` and expects `TooLarge(MAX_BYTES + 1)`.
- `icc_converted_to_srgb`
- `bad_icc_falls_back`
  - The embedded profile is corrupt bytes that claim `RGB ` at offset 16, so they get past the header guard and **qcms itself** rejects them.
  - The test asserts that the import succeeds, that there is one warning with the path and the message "could not be parsed", and that the thumbnail exists.
- `folder_import_recurses_unicode`
  - It imports `Été/sub/small.jpg` through its parent folder and gets one reference with no skips.

Two extras:
- `thumbs_downscale_keeping_aspect`
  - A 1000×500 image gives a 256×128 thumbnail for size 256 and stays 1000×500 for size 1024.
- `iso_utc_formats`
  - It checks the epoch, the leap day 2000-02-29T12:00:00Z and 2026-11-30T01:02:03Z, all checked against Python `datetime`.

## How the fixtures were made

The script is `scripts/make_icc_fixture.py`. Run it with `python -I scripts/make_icc_fixture.py` (Pillow 12.3.0, LittleCMS 2.19). It writes all five fixtures to `app/src-tauri/tests/fixtures/`, and they are committed.

### The Display P3 profile

Pillow's `ImageCms.createProfile` only supports sRGB, LAB and XYZ, and it doesn't expose LittleCMS's `cmsCreateRGBProfile`. There is also no P3 profile in Windows' colour folder.

So the script writes a standard **ICC v2 matrix/TRC display profile** by hand. It has these tags:
- `desc` and `cprt`;
- `wtpt` = D50;
- `rXYZ`, `gXYZ` and `bXYZ` from the P3 primaries (0.680, 0.320), (0.265, 0.690) and (0.150, 0.060), with a D65 white Bradford-adapted to the D50 PCS;
- `r/g/bTRC` as a 1024-entry `curv` of the sRGB transfer curve, which is the curve Display P3 uses.

`ImageCms.ImageCmsProfile` loads the profile back, which checks that it parses. Then Pillow embeds it with `save(icc_profile=…)`.

### The other fixtures

- `small.jpg`: a 64×48 gradient.
- `fake.psd`: `8BPS` followed by 1 KB of junk.
- `empty.jpg`: 0 bytes.
- `bad_icc.png`: a 32×32 image with a corrupt embedded profile.

## Concerns

### 1. `p3_red.png` is not pure P3 red. This is a deviation from the brief, made on purpose.

Pure P3 red (255, 0, 0) lies outside sRGB. Converting it gives linear sRGB of about (1.225, −0.042, −0.020), which is clipped back to **(255, 0, 0)**. The script shows this with LittleCMS: `P3 (255, 0, 0) -> sRGB via LittleCMS (255, 0, 0)`.

With that fixture, the brief's "G and B above 0" can't hold. A test of "within 3 of 255" alone would pass even with the conversion deleted.

So the fixture is P3 **(255, 70, 70)**, a red that is still saturated but lands inside sRGB:

| Path | Result |
|---|---|
| Pure P3 (255, 0, 0) through qcms in our pipeline (measured with a temporary fixture, then restored) | **(254, 0, 0)**, which can't be told apart from no conversion |
| LittleCMS reference for (255, 70, 70) | (255, 41, 58) |
| qcms in our pipeline, centre of the 256 JPEG thumbnail | **(255, 41, 57)** |
| Unconverted (mutation check) | (254, 70, 70) |

The test keeps the brief's assertions (R ≥ 252, G > 0, B > 0). It also asserts that G and B are within 4 of the LittleCMS reference values (41, 58). That is what actually proves the conversion ran, because the raw value is 70.

I kept the filename `p3_red.png`.

### 2. Alpha is dropped, not composited, in the thumbnails

A transparent PNG's thumbnail shows whatever RGB is stored under the transparent pixels, often black. There is a `ponytail:` comment on it. Composite onto a neutral background if this matters.

### 3. A write failure is reported as `Skip::Unreadable`

The `Skip` enum is fixed by the brief and has no write-error variant. The message says "could not write to the library: …", so the cause is visible.

### 4. Time-of-check gap between hash and copy

The source is hashed, decoded and then copied in separate reads. If the file changes during import, `images/<hash>` could hold bytes that don't match the hash.

Hashing the `.tmp` copy would close the gap, at the cost of copying duplicates. I left it as is.

### 5. Other small points

- **Non-RGB profiles.** A grayscale or CMYK image with an embedded profile gets a "not an RGB profile" warning, with no conversion. This avoids the qcms debug-assert panic.
- **sRGB-tagged images** go through qcms as well, which is a near-identity transform.
- **Durability.** Files under `images/` and `thumbs/` are not `fsync`ed before the rename, unlike `library.json`.
- **EXIF orientation is not applied.** Rotated phone photos get sideways thumbnails, and their width and height are swapped. The brief doesn't ask for it, so this is a note for later.
- **Fixtures are deterministic.** Re-running the script reproduces the committed fixtures byte for byte (checked by MD5). The full suite passes on HEAD.
- **Fixture script name.** `make_icc_fixture.py` also generates the non-ICC fixtures, to keep a single generator.

## Files changed

- `app/src-tauri/src/import.rs`: new.
- `app/src-tauri/src/lib.rs`: added `pub mod import;`.
- `app/src-tauri/src/library.rs`: added the `image_path_in` and `thumb_path_in` helpers, which the methods delegate to.
- `app/src-tauri/Cargo.toml` and `Cargo.lock`: added `blake3`, `walkdir`, `qcms` and `image`.
- `app/src-tauri/tests/fixtures/`: new, with `small.jpg`, `p3_red.png`, `bad_icc.png`, `fake.psd` and `empty.jpg`.
- `scripts/make_icc_fixture.py`: new.

---

# Follow-up: controller rulings (a) to (e)

**Commit:** `de43b15 fix(core): orientation, durability, alpha and hash-on-write in import`

This follow-up resolves concerns 2, 3 and 4 and the EXIF and durability notes from the first round.

## Changes

**(a) EXIF orientation**
- `decoder.orientation()` is read before `from_decoder`. Then `DynamicImage::apply_orientation` runs, and width and height are read after the rotation.
- If the orientation can't be read, the result is a warning and no transform.
- The new fixture `tests/fixtures/rotated.jpg` is stored as 64×48 with EXIF Orientation=6. It is generated by `scripts/make_icc_fixture.py` through Pillow's `Image.Exif`.

**(b) Durability**
- Each thumbnail `.tmp` is flushed and gets `sync_all()` before the rename.
- The image temp file gets `sync_all()` before `persist`.
- Folders are not fsynced, because Windows has no directory fsync.

**(c) Transparency**
- `on_white()` composites RGBA onto #FFFFFF after the ICC conversion and before the JPEG encoding.
- The formula is `(c·a + 255·(255−a) + 127) / 255`.

**(d) Hash on write**
- `copy_and_hash` streams the source in 64 KiB chunks into a `tempfile` `NamedTempFile` in `images/`, with a `.tmp` suffix. It hashes exactly the bytes it writes.
- Dedupe then runs on that hash. A duplicate's temp file is dropped, which deletes it.
- The decode reads the temp copy rather than the source, so the source is read only once.
- Last of all, `persist` renames the copy to `images/<hash>.<ext>`.
- Cost: a duplicate now costs one copy. There is a `ponytail:` comment on this.

**(e) `Skip::WriteFailed(String)`**
- This is used for failures to create the temp file, write it, write a thumbnail, fsync, or rename.
- On failure every thumbnail is removed and the temp file deletes itself.
- The final destination is no longer removed on failure, because we never wrote it before the rename.

## TDD evidence

**RED.** I added 4 tests and the `WriteFailed` variant first. `cargo test import::` gave `FAILED. 10 passed; 3 failed`:
- `exif_orientation_applied` failed. The image read as 64×48, not 48×64.
- `transparent_png_on_white` failed. A fully transparent pixel came out black.
- `write_failure_is_reported_and_cleaned_up` failed. A folder squatting on `images/<hash>.jpg` produced `Unreadable`, not `WriteFailed`.
- `stored_file_matches_its_hash` passed before the fix as well. It checks that BLAKE3 of the stored file equals `r.hash`, and that the duplicate's temp file is gone. A source changing mid-import can't be simulated without a test hook, so this test guards the invariant but was not a true RED for (d).
- (b) durability has no test. An fsync can't be observed from a unit test.

**GREEN.** `cargo test import::` gave `ok. 13 passed; 0 failed`.

**Full suite:** `cargo test` gives 30 passed. `cargo fmt` is clean. `cargo clippy --all-targets -- -D warnings` is clean.

**Fixtures:** re-running the script reproduced the five existing fixtures byte for byte, and git shows no diff on them.

## Concerns still open

- Concern 1 (the fixture colour) and concern 5 were accepted by the controller.
- A duplicate now costs one full temp copy before it is discarded. This trades disk I/O for a hash that is guaranteed to match the stored bytes.

---

# Fix round 1: never walk into the library

**Commit:** `fix(core): never walk into the library folder during import` (see `git log`)

## The issue

When a folder that contains the library was imported, the walk went into `thumbs/` and `images/`. Each thumbnail is a valid JPEG with its own hash, so it was imported as a new reference, and that happened again on every run.

## The fix (`import_paths`)

1. `root` is created first with `create_dir_all`, so it can be canonicalised. This also covers a library that is created inside the dropped folder partway through the walk. Then `root` is canonicalised once.
2. An `inside(p)` check canonicalises `p` and tests `starts_with(canonical root)`. Both sides are canonical, so both carry the `\?\` prefix on Windows.
3. A path passed directly that is inside the library is skipped with `Skip::Unsupported("inside the library")`. That covers both files and folders.
4. The walk uses `.into_iter().filter_entry(|e| !(e.file_type().is_dir() && inside(e.path())))`.
   - Only folders are canonicalised, so files cost nothing extra. A file can only be inside the library by way of a folder that has already been pruned, or by being passed directly, which step 3 handles.
   - With `follow_links(true)`, a symlinked folder that points into the library is also pruned, because `canonicalize` resolves it.
5. The report keeps the user's original, uncanonicalised paths.

## TDD

**RED.** I added `parent_folder_import_skips_library`, which works like this:
- A parent folder holds `Horus/`, the library, and `outside.jpg`.
- The parent is imported twice. The second run passes the first run's hashes as `known_hashes`.
- Expected: exactly one reference in total; on the second run, 0 added, 1 duplicate and 0 skipped.
- A thumbnail path passed directly must give `Unsupported`.

Before the fix the test failed: the second run added a reference (a thumbnail, hash `e0406060…`).

**Side effect in the tests.** The fix also failed 4 existing tests: `too_large`, `transparent_png_on_white`, `dedupes_same_bytes` and `thumbs_downscale_keeping_aspect`.
- They had created their source files inside the library root, which is the same temp folder. That is exactly the case the fix now refuses, so the new behaviour is correct.
- I moved those sources, and the one in `stored_file_matches_its_hash`, to a separate temp folder. That last test had kept passing, but it would no longer have exercised the duplicate's temp file.
- No assertions were changed.

**GREEN.** `cargo test import::` gives 14 passed. The full `cargo test` gives 31 passed. `cargo fmt` is clean. `cargo clippy --all-targets -- -D warnings` is clean.
