# Find similar test fixtures (Plan 5 Task 2)

| File | Used by | Source and rights |
|---|---|---|
| `red_blue_300x200.png` | `preprocess_shape_and_squash` | Made for this test (Pillow): 300×200, left half pure red, right half pure blue. No third-party content. |
| `cat.jpg` | `real_model_semantics` (ignored) | "Domestic shorthair cat portrait in grass", photo by Marko Milivojevic on Pixnio, https://commons.wikimedia.org/wiki/File:Domestic_shorthair_cat_portrait_in_grass.jpg . Licence: **CC0** (public-domain dedication). This is Wikimedia's 330 px thumbnail, fetched 2026-11-27: 23,672 bytes, SHA-256 `83c2ffa1ae5f78a0ae0f761f68c13a1ea490715c2bcbd0bab5b3d31da0be5e26`. |
| `dog.jpg` | `real_model_semantics` (ignored) | "Dog on dirt road", by Arlo Barnes (own work), https://commons.wikimedia.org/wiki/File:Dog_on_dirt_road.jpg . Licence: **CC0** (public-domain dedication). This is Wikimedia's 330 px thumbnail, fetched 2026-11-27: 34,855 bytes, SHA-256 `84a2e998e794297a4cb7c4c49e2fbfd816543895d36e5112ebce6483687955c1`. |

The ignored tests need `HORUS_ORT_LIB` (the library from `npm run fetch:ort`) and, for `real_model_semantics`, `HORUS_SIGLIP_DIR` (a hand-downloaded model folder). Run them on their own with `cargo test similar::encoder -- --ignored`, never with `--include-ignored`.
