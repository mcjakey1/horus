# Horus demo image set

50 public-domain references for the Horus demo library (SPEC.md §0, "Images"). Each image is in `images/<id>.jpg`, and `manifest.json` has one record per image.

| Category (`category` field) | Count |
|---|---|
| Poster / graphic design | 15 |
| Photograph | 12 |
| Print / illustration | 14 |
| Painting | 9 |

Sources: Art Institute of Chicago (38 images) and Library of Congress (12 images). Rights were checked on 2026-11-24, item by item.

## Sources

### Art Institute of Chicago (AIC)

- **Metadata:** `https://api.artic.edu/api/v1/artworks/<id>`.
- **Images:** IIIF, `https://www.artic.edu/iiif/2/<image_id>/full/1686,/0/default.jpg`.
  - Requests used a plain client User-Agent (`horus-demo-builder/0.1`) and AIC's own documented `AIC-User-Agent` header. No browser spoofing.
  - AIC serves only the 843 px and 1686 px width tiers. For some works it caps the size at 843 px wide. Those files are smaller than 1600 px on the long edge; the smallest are Stieglitz at 843 × 635 and Kyōsai at 843 × 450.
- **Statement, quoted verbatim from <https://www.artic.edu/open-access/open-access-images>:**
  > The Art Institute of Chicago is pleased to offer free, unrestricted use of over 50,000 images of works in the collection believed to be in the public domain or to which the museum otherwise waives any copyright it might have. Such images are made available under Creative Commons Zero (CC0) designation and the Terms and Conditions of this website.
- **`rights` field in the manifest:** the literal API field and the endpoint it came from, for example `"is_public_domain": true (api.artic.edu/api/v1/artworks/24645)`. AIC publishes no per-item rights sentence; the statement above is the one that applies.
- **`credit` field:** uses the caption format AIC requests: "Artist. Title, Date. The Art Institute of Chicago."

### Library of Congress, Prints and Photographs (LoC)

- **Discovery:** the LC catalogue SRU endpoint, `http://lx2.loc.gov:210/lcdb`.
- **Metadata and rights:** the MARCXML record at `https://lccn.loc.gov/<lccn>/marcxml`. The `rights` field is MARC 540 `$a`, copied verbatim.
- **Images:** the master TIFF from `tile.loc.gov/storage-services/master/pnp/...`, downscaled locally.
- **Not used: `www.loc.gov`.** Its JSON API and item pages return a Cloudflare bot challenge to scripts, and we did not try to get around it. Every LoC fact here comes from the MARC record, which is the same catalogue data.

### Processing (all images)

- Decoded with Pillow, converted to RGB and downscaled to a long edge of at most 1600 px.
- Re-encoded as new JPEG files (quality 88). No EXIF or other source metadata is carried over.
- Three LoC files were **cropped** to remove scanner colour targets and borders; each record says so in its `note` field:
  - `wpa-federal-theatre-rur`
  - `wpa-see-america-cavern`
  - `lange-toward-los-angeles`
- Downloads were handled as untrusted data. The scripts lived outside `demo/`, and Python ran with `-I`.

## Rights rule applied

An image ships only if **all** of these hold:

1. **The source says it is free.**
   - AIC: `is_public_domain` is `true` and `copyright_notice` is empty.
   - LoC: MARC 540 begins with exactly **"No known restrictions on publication"**.
   - We considered the Met and dropped it (see "Rejected" below).
2. **The work is out of copyright on its own terms.** The creator died before 1956 (more than 70 years ago), **or** it is a US federal work: a WPA / Federal Art Project poster, or an FSA/OWI photograph.
3. **It is not a contemporary advertisement.** No living artist's work is included.
4. **When in doubt, leave it out.**

Every AIC creator in the set died in 1946 or earlier; the most recent are Stieglitz (1946), Mucha (1939), Tanner (1937), Käsebier (1934) and F. Holland Day (1933). The LoC posters are WPA Federal Art Project silkscreens, made by federally employed artists.

## Rejected, and why

- **The Met Open Access.** Its object API works, and `isPublicDomain` can be read per object, but `images.metmuseum.org` returns a bot-challenge HTML page (about 1 KB) instead of the JPEG. We did not try to get around it, so no Met images are included. We also confirmed that Met search is not a public-domain filter: object 788409 came back `isPublicDomain: false`.
- **Dorothea Lange, *Migrant Mother* (1936).**
  - FSA record 2017762891 has the master negative, but its 540 reads "No known restrictions. For information, see U.S. Farm Security Administration/Office of War Information Black & White Photographs". That is not the exact phrase the brief requires.
  - The records that do read "No known restrictions on publication" are not usable:
    - 93506674 is a scrapbook page with the photo as a small inset.
    - 2004681697 (`ppmsca.50236`) has an image path that can't be resolved without `www.loc.gov`.
  - We left it out and used Clarence H. White, *Sunlight* (AIC) in its place.
- ***Toward Los Angeles*, record 2017769825.** Its 540 reads "No known restrictions on images made by the U.S. government; images copied from other sources may be restricted." We used the copy-print record **2004681694** instead, whose 540 is exactly "No known restrictions on publication."
- **Works that AIC flags as public domain but that fail rule 2.** Alvin Langdon Coburn (died 1966), Edward Steichen (died 1973) and Paul Strand (died 1976) were not considered. Their pre-1929 US publication makes them public domain in the US, but not worldwide.
- **Rijksmuseum** (it needs an API key) and **Wikimedia** were not used.
- **LoC records with no 540 field**, or 540 "Rights status not evaluated" (for example 2009631019 and the 1938 WPA calendar sheets), were skipped.

## Technique suggestions (draft)

- Every entry in `suggestedTechniques` is a **draft suggestion**. Each one carries `"suggested": true`, and each record has `"suggestedTechniquesStatus": "draft"`.
- Each image has 2 to 4 techniques, using the 41 names from REFERENCE-ANALYSIS.md §2.3. **All 41 have at least one example.** These have exactly one: Temporal synthesis, Figure-ground reversal, Form substitution, Visual quotation, Warm and cool split and Anthropomorphism.
- I wrote the suggestions after looking at every shipped image, not from titles.
- `region` is `{x, y, w, h}` in 0..1 fractions of the shipped image, per SPEC §3. The boxes are approximate (eyeballed against a 10 % grid) and need a human pass in the lightbox.
- **`operation` / `domain`** come from the branches in `../taxonomy/taxonomy.json`, which another session is building, as read on 2026-11-25. Where a technique sits under several branches, I chose the one that fits the image. Where my choice was no longer in the file, the first listed branch was used:
  - Frame within a frame now sits only under Differentiate × Space.
  - Occlusion sits only under Infer × Space.
  - Semantic compounding sits only under Infer × Semantic.
- **If the taxonomy changes again, re-derive the pairs.** The build script fails loudly on an unknown technique name.
- The taxonomy file now also has seven techniques that are not in §2.3 and have no demo example yet: Arrow cue, Direct address, Incongruous object, Limited palette, Missing piece, Repoussoir and Set apart.

**Weakest calls, worth a second look:**

- **Pattern break.** Hine, *Sadie Pfeifer* (the child interrupts the run of spinning frames) and Vallotton, *Laziness*. Neither is a textbook "one odd item in a grid" example.
- **Rim light.** Le Gray, *The Great Wave, Sète*: the backlit cloud edges are a loose reading. Pether, Käsebier's *The Manger* and White's *Sunlight* are clearer.
- **Selective focus.** Cameron and White are soft-focus pictorialist photographs; the effect is not shallow depth of field.
