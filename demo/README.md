# Horus demo image set

50 public-domain references for the Horus demo library (SPEC.md §0, "Images"). Each image is in `images/<id>.jpg`, and `manifest.json` has one record per image.

| Category (`category` field) | Count |
|---|---|
| Poster / graphic design | 16 |
| Photograph | 12 |
| Print / illustration | 13 |
| Painting | 9 |

Sources: Art Institute of Chicago (38 images) and Library of Congress (12 images). Rights were checked on 2026-11-24, item by item.

## Sources

### Art Institute of Chicago (AIC)

- **Metadata:** `https://api.artic.edu/api/v1/artworks/<id>`.
- **Images:** IIIF, `https://www.artic.edu/iiif/2/<image_id>/full/1686,/0/default.jpg`.
  - Requests used a plain client User-Agent (`horus-demo-builder/0.1`) and AIC's own documented `AIC-User-Agent` header. No browser spoofing.
  - A 1600 px request was refused (403); 1686 px and 843 px worked.
  - For some works AIC returns at most 843 px wide, so a few files are smaller than 1600 px on the long edge. The smallest are Stieglitz at 843 × 635 and Kyōsai at 843 × 450.
- **Statement, quoted verbatim from <https://www.artic.edu/open-access/open-access-images>:**
  > The Art Institute of Chicago is pleased to offer free, unrestricted use of over 50,000 images of works in the collection believed to be in the public domain or to which the museum otherwise waives any copyright it might have. Such images are made available under Creative Commons Zero (CC0) designation and the Terms and Conditions of this website.
- **`rights` field in the manifest:** the literal API field and the endpoint it came from, for example `"is_public_domain": true (api.artic.edu/api/v1/artworks/24645)`. AIC publishes no per-item rights sentence; the statement above is the one that applies.
- **`credit` field:** uses the caption format AIC requests: "Artist. Title, Date. The Art Institute of Chicago."

### Library of Congress, Prints and Photographs (LoC)

- **Discovery:** the LC catalogue SRU endpoint, `http://lx2.loc.gov:210/lcdb`.
- **Metadata and rights:** the MARCXML record at `https://lccn.loc.gov/<lccn>/marcxml`. The `rights` field is MARC 540 `$a`, copied verbatim. For all 12 LoC items it reads exactly "No known restrictions on publication."
- **Images:** the master TIFF from `tile.loc.gov/storage-services/master/pnp/...`, downscaled locally.
- **Not used: `www.loc.gov`.** Its JSON API and item pages return a Cloudflare bot challenge to scripts, and we did not try to get around it. Every LoC fact here comes from the MARC record, which is the same catalogue data.
- **What the 12 are:**
  - 11 WPA Federal Art Project posters;
  - 1 FSA photograph: Dorothea Lange, *Toward Los Angeles*, 1937.

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

Every AIC creator in the set died in 1946 or earlier; the most recent are Stieglitz (1946), Hine (1940), Mucha (1939), Tanner (1937), Käsebier (1934) and F. Holland Day (1933). All 12 LoC items are federal works.

**Remaining assumption.** We treat the WPA posters as public domain because they are federal works, made by artists the Federal Art Project employed, and because LoC marks them "No known restrictions on publication". For four posters LoC records no artist (`creator` reads "Unidentified artist (…)").

**Check date.** `wpa-free-art-classes` and `wpa-velonis-photography-exhibition` were added and checked on 2026-11-25. Their manifest records keep `rightsCheckedAt: "2026-11-24"`, the set-wide value the brief specifies.

`check_manifest.py` in this folder belongs to the taxonomy session, not to this set.

## Rejected, and why

- **W. E. Hill, *My Wife and My Mother-in-Law* (1915, LoC 90707287).**
  - Its 540 reads "No known restrictions on publication", and the 1915 US publication makes it public domain in the US.
  - But Hill died in 1962, so it fails rule 2, and it is neither a WPA poster nor an FSA photograph.
  - Removed. Figure-ground reversal now comes from the WPA poster *Free Art Classes* (Harry Herzog), with Vallotton's *Laziness* as a second example.
- **The Met Open Access.** Its object API works, and `isPublicDomain` can be read per object, but `images.metmuseum.org` returns a bot-challenge HTML page (about 1 KB) instead of the JPEG. We did not try to get around it, so no Met images are included. We also confirmed that Met search is not a public-domain filter: object 788409 came back `isPublicDomain: false`.
- **Dorothea Lange, *Migrant Mother* (1936).**
  - FSA record 2017762891 has the master negative, but its 540 reads "No known restrictions. For information, see U.S. Farm Security Administration/Office of War Information Black & White Photographs". That is not the exact phrase the brief requires.
  - The records that do read "No known restrictions on publication" are not usable:
    - 93506674 is a scrapbook page with the photo as a small inset.
    - 2004681697 (`ppmsca.50236`) has an image path that can't be resolved without `www.loc.gov`.
  - We left it out and used Clarence H. White, *Sunlight* (AIC) in its place.
- ***Toward Los Angeles*, record 2017769825.** Its 540 reads "No known restrictions on images made by the U.S. government; images copied from other sources may be restricted." We used the copy-print record **2004681694** instead, whose 540 is exactly "No known restrictions on publication."
- **Photographers excluded by rule 2 without being searched:** Alvin Langdon Coburn (died 1966), Edward Steichen (died 1973) and Paul Strand (died 1976).
- **Rijksmuseum** (it needs an API key) and **Wikimedia** were not used.
- **LoC records with no 540 field**, or 540 "Rights status not evaluated" (for example 2009631019 and the 1938 WPA calendar sheets), were skipped.
- ***Public School Art, Sioux City Art Center* (WPA, LoC 89715176).**
  - Its 540 reads exactly "No known restrictions on publication", and MARC 245 says "made by WPA Federal Art Project, Iowa".
  - But the marching band is drawn in a childlike style, and the record names no artist. If the design copies a pupil's painting, it is not a federal employee's work.
  - Removed under rule 4. In its place: Anthony Velonis, *Photography Exhibition* (WPA FAP NYC, 1941, LoC 98507251), a named federal artist with the exact 540 phrase.
- ***Smoke over Des Moines* (WPA).** Rights were fine. We dropped it to keep the set at 50, because its techniques are covered elsewhere.

## Technique suggestions (draft)

- Every entry in `suggestedTechniques` is a **draft suggestion**. Each one carries `"suggested": true`, and each record has `"suggestedTechniquesStatus": "draft"`.
- Each image has 2 to 4 techniques, using the 41 names from REFERENCE-ANALYSIS.md §2.3. **All 41 have at least one example.** These have exactly one: Pattern break, Form substitution, Temporal synthesis, Visual quotation, Warm and cool split and Anthropomorphism.
- I wrote the suggestions after looking at every shipped image, not from titles.
- `region` is `{x, y, w, h}` in 0..1 fractions of the shipped image, per SPEC §3. The boxes are approximate (eyeballed against a 10 % grid) and need a human pass in the lightbox.
- **`operation` / `domain`** come from the branches in `../taxonomy/taxonomy.json`, which another session is building, as read on 2026-11-25. Where a technique sits under several branches, I chose the one that fits the image. Where my choice was no longer in the file, the first listed branch was used:
  - Frame within a frame now sits only under Differentiate × Space.
  - Occlusion sits only under Infer × Space.
  - Semantic compounding sits only under Infer × Semantic.
- **If the taxonomy changes again, re-derive the pairs.** The build script fails loudly on an unknown technique name.
- The taxonomy file now also has seven techniques that are not in §2.3 and have no demo example yet: Arrow cue, Direct address, Incongruous object, Limited palette, Missing piece, Repoussoir and Set apart.

**Clear cases of the required techniques:**

| Technique | Clear examples |
|---|---|
| Silhouette | `wpa-whos-who-in-the-zoo`, `edouart-church-brothers-silhouette`, `lautrec-moulin-rouge-la-goulue` |
| Chiaroscuro | `zurbaran-crucifixion`, `pether-gladiator-by-candlelight`, `rembrandt-three-crosses` |
| Leading lines | `stieglitz-hand-of-man`, `caillebotte-paris-street-rainy-day` |
| Figure-ground reversal | `wpa-free-art-classes` (faces cut as negative space) |
| Scale disparity | `hokusai-great-wave`, `wpa-see-america-cavern` |
| Frame within a frame | `hokusai-fujimigahara`, `kasebier-blessed-art-thou` |
| Pattern break | `hine-sadie-pfeifer` (the child interrupts the run of spinning frames); see the note below |
| Closure | `wpa-horse-eats-hat`, `wpa-human-interest-photography` |
| Rim light | `pether-gladiator-by-candlelight`, `white-sunlight` |
| Gaze cue | `daumier-can-you-see-the-comet`, `cassatt-childs-bath` |

**Weakest calls, worth a second look:**

- **Rim light.** Le Gray, *The Great Wave, Sète*: the backlit cloud edges are a loose reading.
- **Selective focus.** Cameron and White are soft-focus pictorialist photographs; the effect is not shallow depth of field.
- **Pattern break.** Hine, *Sadie Pfeifer* is the only example, and it is not a textbook "one odd item in a grid" case. A clearer public-domain example is still wanted.
