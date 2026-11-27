# Horus 1.0 release gates

Plan 6 Task 9. A gate closes only with **evidence and a named owner**. Tick its box (`- [x]`) only when its evidence is linked and dated. `npm run release-check -- --final` fails while any box below is open, and the CI release workflow runs it on every tag.

Each gate is one checkbox line: release-check counts those lines. Criteria and evidence are plain bullets.

Evidence files go in `docs/release/evidence/`. Paths are relative to the repository root.

**Order:** run G1 first. A rename changes the identifier (`art.horus.app`), the wordmark, the icon, the intro, the installer names and any certificate subject.

---

## G1. Trademark clearance for "Horus"

- [ ] **G1. Trademark clearance for "Horus"** — owner: **USER**, with counsel.
- **Pass criteria:** a knockout search and a full search in Nice classes 9 and 42, at USPTO, EUIPO and WIPO Madrid, plus any country where the user will sell, show no confusingly similar mark for software. Or counsel advises proceeding in writing.
- **Evidence wanted:** the search reports, or counsel's written advice, in `docs/release/evidence/g1-trademark/`.
- **Evidence so far:** none.
- **Date closed:** —

## G2. Legal review of the shipped taxonomy

- [ ] **G2. Legal review of the shipped taxonomy against Iris** (SPEC §7) — owner: **counsel**, engaged by the USER.
- **Pass criteria:** written advice that the selection and arrangement may ship as it is, with Horus's own definitions, links and 7 custom techniques. Or a list of changes, applied and re-reviewed before the gate closes.
- **Inputs for counsel:** `taxonomy/taxonomy.json` and `taxonomy/README.md`. For counsel only, never shipped: `REFERENCE-ANALYSIS.md`, and what Iris publishes.
- **Evidence wanted:** counsel's written advice in `docs/release/evidence/g2-taxonomy/`.
- **Evidence so far:** none. The shipped resources hold no Iris material: release-check's `checkNoThirdParty` and `checkNoForeignMarks` pass on the sources (see G4). That is not the legal review.
- **Date closed:** —

## G3. Item-by-item rights for the demo set

- [ ] **G3. Item-by-item rights for the 50 demo records** (`demo/README.md`) — owner: **USER**, or counsel.
- **Pass criteria:**
  - Each of the 50 records is re-checked at its source within 30 days of the release, and its `rightsCheckedAt` is updated in `app/src-tauri/resources/demo/manifest.json`.
  - The AIC CC0 statement and the credit format are honoured in About. See "About's demo-rights wording" below.
  - Each of the four WPA posters credited "Unidentified artist (…)" has an explicit keep-or-remove decision recorded. If any is removed, the manifest and its technique examples are updated and `demo/check_manifest.py` passes.
  - The 2026-11-25 additions are confirmed: `wpa-free-art-classes` (Harry Herzog) and `wpa-velonis-photography-exhibition` (Anthony Velonis).
- **The four "Unidentified artist" records (decision needed for each):**
  - `wpa-whos-who-in-the-zoo` (Federal Art Project);
  - `wpa-horse-eats-hat` (Federal Art Project);
  - `wpa-human-interest-photography` (Iowa Art Program, W.P.A.);
  - `wpa-des-moines-forum-lyman-bryson` (Iowa Art Program, WPA).
- **About's demo-rights wording (Plan 6 Task 4, needs the owner's yes):** About lists one line per record: its `credit`, then its rights in plain words. The manifest's `rights` field is evidence text, not copy, so About maps it:
  - `"is_public_domain": true (api.artic.edu/…)` (the Art Institute of Chicago records) is shown as **"Public domain (CC0)"**;
  - any other value (the Library of Congress records: "No known restrictions on publication.") is shown as written.
  - The mapping is `rightsLabel` in `app/src/about.ts`. Confirm this wording honours the AIC CC0 statement quoted in `demo/README.md`, or give the wording to use.
- **Evidence wanted:** the dated re-check of each record and the four keep-or-remove decisions, in `docs/release/evidence/g3-demo-rights/`; the updated `rightsCheckedAt` values in the manifest; the owner's yes (or wording) for About's rights line.
- **Evidence so far:** `demo/README.md` (sources, the AIC CC0 statement, the check method). Every record's `rightsCheckedAt` is `2026-11-24`. That is the set-wide date, and it must be within 30 days of the release date.
- **Date closed:** —

## G4. No third-party material and no foreign marks in the build

- [ ] **G4. No third-party material, and no foreign marks, in the build** — owner: release engineer. Automated.
- **Pass criteria:** release-check's `checkNoThirdParty` and `checkNoForeignMarks` pass on every final artefact's unpacked resources.
- **Evidence wanted:** the release-check output from the tag build's CI log (`.github/workflows/release.yml`, "release-check, with the bundles"), for all three platforms.
- **Evidence so far:** both checks pass on the sources (`npm run release-check`, 2026-11-28). The final artefacts are not built yet.
- **Date closed:** —

## G5. Licences

- [ ] **G5. Licences** — owner: release engineer. Automated.
- **Pass criteria:** the OFL texts ship with the fonts; `THIRD_PARTY_NOTICES.md` is complete, with no unaccepted licence, and includes Plan 5's model entries; About links both.
- **Evidence wanted:** the tag build's generated `app/THIRD_PARTY_NOTICES.md` (CI step "Generate THIRD_PARTY_NOTICES.md") with release-check's `checkNotices` passing.
- **Evidence so far:**
  - the OFL texts: `app/src/fonts/OFL-SourceSerif4.txt`, `app/src/fonts/OFL-RedHatMono.txt` (release-check `checkFonts` passes);
  - the hand-written part: `app/notices/manual.md` (SigLIP, ONNX Runtime, tokenizers);
  - About shows the font licences and links the notices, and Find similar's "About the model" opens the same file (Plan 6 Task 4);
  - not yet: the generated notices file (Task 5 adds `about.toml` and `about.hbs`; CI generates the file).
- **Date closed:** —

## G6. Signed builds, or a properly labelled unsigned beta

- [ ] **G6. A properly labelled unsigned beta** (Decision 2: the unsigned route applies for 1.0) — owner: release engineer.
- **Route taken:** unsigned beta. Why: no code-signing certificate or Apple Developer ID exists yet (Task 7 is deferred).
- **Pass criteria, every one:**
  - the GitHub release is a **prerelease**, and its name ends "(unsigned beta)";
  - its body is `docs/release/INSTALL-UNSIGNED.md`;
  - `app/README.md` has the same "Installing the unsigned beta" section (Task 10);
  - `SHA256SUMS` is attached;
  - QA row 1a passes on all three systems (Task 8).
- **Evidence wanted:** the release page URL (showing "prerelease" and the name), its attached `SHA256SUMS`, the README section, and QA row 1a in `docs/release/qa-matrix.md`.
- **Evidence so far:**
  - `.github/workflows/release.yml` makes the draft prerelease "Horus <tag> (unsigned beta)" with `--notes-file docs/release/INSTALL-UNSIGNED.md` and one `SHA256SUMS` (written, not run);
  - `docs/release/INSTALL-UNSIGNED.md` exists (Task 10 prep).
- **Date closed:** —

## G7. The privacy statement is accurate

- [ ] **G7. The privacy statement is accurate** — owner: release engineer.
- **Pass criteria:** About's text matches behaviour: `checkNoRemoteUrls` passes, QA row 9 (offline) passes, and About names the model host `huggingface.co`.
- **Evidence wanted:** the tag build's release-check output, and QA row 9 for all three systems in `docs/release/qa-matrix.md`.
- **Evidence so far:**
  - About says: "Works offline. No account, no telemetry. Find similar downloads an image model from huggingface.co only if you turn it on." (`PRIVACY` in `app/src/about.ts`; `app/src/about.test.ts` checks it);
  - `checkNoRemoteUrls` passes on the sources (2026-11-28);
  - not yet: QA row 9 (Task 8).
- **Date closed:** —

## G8. Licence of the Find similar model export

- [ ] **G8. Licence of the Find similar model export** (Plan 5, Decision 1) — owner: **USER**, or counsel.
- **The issue:** the weights `google/siglip-base-patch16-224` are Apache-2.0, but the ONNX export Plan 5 downloads, `Xenova/siglip-base-patch16-224` at commit `4649052661e53c7000355844105f8a1792088239`, carries no licence tag.
- **Pass criteria, one route, recorded with its evidence:**
  - **(a) Confirmed:** written confirmation (from the repository owner, or a licence file added at a pinned commit) that the export is redistributable under Apache-2.0. If the commit changes, Plan 5's `SIGLIP_B16_Q8` revision and SHA-256 values are updated and Plan 5's download tests pass.
  - **(b) Self-converted:** the model is converted from `google/siglip-base-patch16-224` with Hugging Face Optimum (int8, the same inputs and outputs) and hosted at a Horus-owned location. Then `SIGLIP_B16_Q8` gets the new files, sizes, SHA-256 values and host; Plan 5's ignored `real_model_semantics` test passes; Plan 5 Task 8 Step 3b re-calibrates the cut-offs; and About's privacy line names the new host (G7).
  - **On either route:** `app/notices/manual.md` keeps SigLIP's Apache-2.0 entry with the upstream NOTICE text or a dated "NOTICE: none" line, and so does the generated `THIRD_PARTY_NOTICES.md` (G5). release-check's `checkNotices` enforces this.
- **Evidence wanted:** for (a), the written confirmation or the licence file at its pinned commit; for (b), the conversion record (tool versions, command, output hashes) and the new host. Either in `docs/release/evidence/g8-model-licence/`.
- **Evidence so far:** `app/notices/manual.md` holds the Apache-2.0 entry and "NOTICE: none. Re-checked 2026-11-27" with its evidence. The route, (a) or (b), is not chosen.
- **Date closed:** —

## G9. The Visual C++ runtime may ship app-local

- [ ] **G9. The Visual C++ runtime may ship app-local** (B4) — owner: **USER**, or counsel.
- **The issue:** the ruling that Microsoft's terms allow app-local copies of `msvcp140.dll`, `msvcp140_1.dll`, `vcruntime140.dll` and `vcruntime140_1.dll` was made from recall, not from the terms.
- **Pass criteria:** the Microsoft licence terms for the Visual Studio edition and version the DLLs come from (the build machine's, and the CI runner's `windows-latest`) are read. Their distributable-code list names those four files. Any condition they set (for example, distributing them only with your program) is met and recorded.
- **Evidence wanted:** a copy of or link to the terms and the distributable-code list, the Visual Studio version, and the date, in `docs/release/evidence/g9-vcredist/`.
- **Evidence so far (not a pass):**
  - The local build tools are Visual Studio 18 BuildTools. The DLLs come from `VC\Redist\MSVC\14.51.36231\x64\Microsoft.VC145.CRT\` (found through `vswhere`, 2026-11-28).
  - That installation's `Licenses\1033\Redist.txt` holds no list. It says only: "For the latest version of this Redist.txt file, please visit https://aka.ms/vs/18/redistribution." That page is the list to read. The CI runner's Visual Studio version can differ, so its list must be read too.
- **If it fails:** the Windows bundle drops the four DLLs (`tauri.windows.conf.json` and `checkBundle`); `docs/release/INSTALL-UNSIGNED.md` and the release notes say that Find similar needs Microsoft's Visual C++ Redistributable on Windows; and QA row 9a records what a machine without it shows.
- **Date closed:** —

## G10. The source is offered with every binary (AGPL)

- [ ] **G10. The source is offered with every binary** (AGPL-3.0-only) — owner: **USER**.
- **The issue:** the user chose the GNU AGPL v3 only (2026-11-28). Everyone who receives a Horus binary must be offered its Corresponding Source. The repository `https://github.com/mcjakey1/horus` is private today, and About names it as the source location.
- **Pass criteria, one route, recorded with its evidence:**
  - **(a) Public repository:** the repository is public before the first release, and the release tag's commit is in it.
  - **(b) Source with the release:** each release carries a source archive of its tag, and About names where it is.
- **Evidence wanted:** the public repository URL and the date, or the release page with its source archive, in `docs/release/evidence/g10-source/`.
- **Evidence so far:** `LICENSE` (the verbatim AGPL-3.0 text from gnu.org, SHA-256 `0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0`), `license = "AGPL-3.0-only"` in `app/src-tauri/Cargo.toml` and `app/package.json` (release-check `checkCargoMeta` asserts it), and About's licence line. Every dependency licence is AGPL-compatible: the Rust crates are limited to `about.toml`'s accepted list, and the npm production packages are MIT, ISC, BSD-3-Clause or MIT/Apache-2.0 (checked 2026-11-28).
- **Date closed:** —

---

## Open decisions for the user (not gates)

These do not block release-check. Each needs the user's answer before 1.0 ships.

- **R27, metadata editing: RESOLVED (user, 2026-11-28).** The user ruled that metadata editing is implemented in v1: Plan 6 Task 3c edits a reference's title, creator, year and credit. Source: `docs/superpowers/plans/2026-11-25-horus-release.md`, Task 3c.
- **The Plan 6 Task 4 design pass.** The intro concept and its copy, the D17 ink lever, Library on the right, and the `.insp-plain` swap are implemented and APPROVED by the user on 2026-11-28 ("yes approve all four"). Motion on macOS/Linux is still a Task 8 check. See "Open for the user" in `docs/superpowers/plans/plan6-design-proposal.md`.
