# Plan 5 (Find similar): preflight conflict scan

Implementer -59, 2026-11-27.
- **Branch:** `plan5-similar` at `8646b91`, which is main with Plan 4.
- **Read-only:** no code edits and no commits. The plan is not amended; the controller rules first.

**Sources:**
- the plan, `docs/superpowers/plans/2026-11-25-horus-find-similar.md`;
- SPEC §3, §5a, §9 and §11;
- `CROSS-PLAN-AUDIT.md`, rows 1, 5, 11, 12, 13, 14, 19, 21 and 22;
- the Plan 4 ledger, which has no Plan 5 deferral;
- the Plan 6 plan, for its platform floor, CSP and CI;
- the code on main;
- the crate sources unpacked from crates.io: `ort` and `ort-sys` 2.0.0-rc.15, `reqwest` 0.13.5 and `sha2` 0.11.2;
- `cargo info` and `cargo tree` on a scratch crate with the plan's exact pins. Nothing was compiled.

**Method:** superpowers SDD preflight.
- There is one row per pair of tasks that share a file or an interface (this includes the code Plans 1–4 left on main).
- There is one self-consistency row per task.
- **CONFIRMED** means checked against code, crate source or plan text. **PLAUSIBLE** means inferred, and the first build that hits it must check it.

## Counts

| Class | Count |
|---|---|
| BLOCK | 4 |
| REWORK | 18 |
| COS | 9 |
| **Total** | **31** |

**BLOCK one-liners:**
- **B1:** the linking choice for ONNX Runtime. `ort`'s prebuilt Windows binary is the DirectML build, linked statically with DXCORE, D3D12 and DirectML imports, and it needs AVX2.
  - The whole app then depends on option B: it may fail to start on Windows 10 1809, and it may crash on CPUs without AVX2, even with the feature off.
  - Run a spike before Task 1, and prefer `load-dynamic`.
- **B2:** `ort` has no `x86_64-apple-darwin` prebuilt, so Plan 6's universal macOS build fails to link.
- **B3:** `ModelSpec::url()` can only produce Hugging Face URLs, so Task 1's local-server tests can't be written as specified. Add a base-URL seam.
- **B4:** Task 5 puts its indexer stop and start in Plan 6's pipeline, which doesn't exist yet. The real `install()`, the lock order and the demo seed aren't covered, so Plan 5 must place both hooks itself.

## Findings

### BLOCK

| ID | Finding | Evidence | Conf. | Suggested ruling |
|---|---|---|---|---|
| B1 | **ONNX Runtime linking makes the whole app depend on option B.**<br>• With `ort`'s default `download-binaries` and no EP feature, `resolve_dist` takes the first Windows row, `x86_64-pc-windows-msvc+directml` (there is no plain-CPU Windows dist).<br>• It links ORT **statically**, with `cargo:rustc-link-lib=dxguid`, `DXCORE`, `DXGI`, `D3D12` and `DirectML`.<br>• Those are likely load-time imports of `horus.exe`. Windows 10 1809, which Plan 6 supports, has no `System32\DirectML.dll` (it arrived in 1903). So the app may not start at all, feature on or off.<br>• `ort` itself warns that pyke binaries need **AVX2**: "The app will likely crash with an illegal instruction error". That can't be caught, which breaks Review Focus 3 ("unsupported CPU, then a status error and the rest of the app works") and SPEC §5a ("nothing in the app depends on B").<br>• This machine has `System32\DirectML.dll` 1.15.6, so it would not show the problem. | `ort-sys/build/main.rs` (static link); `build/static_link/mod.rs:47-54`; `build/download/dist.tsv`; `build/download/resolve.rs:117-130`; `ort/src/environment.rs` `EnvironmentBuilder::new` (the AVX2 warning); Plan 6 "Windows 10 1809+" | Imports: CONFIRMED. Runtime effect: PLAUSIBLE | **Move Task 2 Step 3 to a spike before Task 1:** build a one-session hello, run `dumpbin /dependents horus.exe`, and start it with ORT never called.<br>**Preferred:** the `ort` features `load-dynamic` and `api-NN`, with the pinned **Microsoft** ONNX Runtime release binaries (MIT; SHA-256 pinned per OS) shipped in `bundle.resources`.<br>• They are loaded with `ort::init_from(path)` only on enable, so a failure is a caught `Err`, and there is no build-time network.<br>• Cost: a DLL or dylib in the installer (size **not measured**), and one CI fetch step.<br>**Static pyke only if** `dumpbin` shows no DirectML, D3D12 or DXCORE load-time import, plus an AVX2 guard (R1). |
| B2 | **There is no Intel Mac prebuilt.** `dist.tsv` has `aarch64-apple-darwin` (coreml) only. Plan 6 wants macOS 11+ universal (arm64 and x86_64). With `download-binaries`, the x86_64 slice gets "no prebuilt binaries available for target" and fails to link. | `dist.tsv` (no `x86_64-apple-darwin` row); Plan 6:62 | CONFIRMED | Solved by B1's `load-dynamic`, using Microsoft's macOS build. That it is universal2 is **not checked**; the spike confirms it. Otherwise the user chooses: (a) build ORT from source for x86_64 (`ORT_LIB_PATH`); (b) Find similar unavailable on Intel Macs, with `similar_status` saying so; (c) arm64-only macOS. |
| B3 | **Task 1 has no URL seam.**<br>• `url()` builds `https://huggingface.co/<repo>/resolve/<revision>/<path>`, and `download` takes no base URL. The required `TcpListener` tests (`fresh_download…`, `resume_after_cutoff`, `server_ignores_range_restarts`, `bad_bytes_rejected`, `cancel…`, `installed_files_skipped`) therefore can't reach a local server.<br>• `ModelSpec` and `ModelFile` are `&'static`, while the test hashes are computed at run time. | Plan T1 Interfaces and Step 1 | CONFIRMED | Add `base: &'static str` to `ModelSpec` (`"https://huggingface.co"` in `SIGLIP_B16_Q8`), so `url()` is `{base}/{repo}/resolve/{revision}/{path}`. The tests build their spec with `Box::leak`. Keep `table_is_pinned` asserting the real base. |
| B4 | **Task 5's start and stop hooks point at Plan 6 Task 2's pipeline, which doesn't exist.** Plan 5 lands first.<br>• The real code is `create_library` and `open_library`, then `install()`, under `hold_gate`, then `flush_for_switch`, then the state lock, then `remember()`. The lock order is "import gate, then settings, then state".<br>• The new `similar: Mutex<SimilarState>` has no place in that order. `Indexer::stop` joins a thread, so taking it under the state lock is a deadlock risk.<br>• `create_library`'s demo seed adds references without `hooks::after_change`, so the "index on any change" trigger never sees them.<br>• Nothing in start-up (`lib.rs` `setup`) loads the model. | `commands.rs:406-557` (install, create, open, lock order); `hooks.rs`; Plan T5 "At start-up and on library open"; audit #12 | CONFIRMED | Plan 5 places the hooks itself. Plan 6 Task 2 later folds them into its pipeline as steps 1 and 8.<br>• **Stop:** stop the indexer after `hold_gate`, before `flush_for_switch`, with no state lock held.<br>• **Start:** start it after `remember()`, with no lock held. The pass over missing hashes also covers the demo seed.<br>• **Lock order:** state that `similar` is taken after `state` and never held while taking `state`. The worker never takes either.<br>• **Model load:** load it in `setup` on a background thread when `find_similar == "on"`. |

### REWORK

| ID | Finding | Evidence | Conf. | Suggested ruling |
|---|---|---|---|---|
| R1 | **AVX2 guard.** Required if pyke static stays, and harmless otherwise. | `ort/src/environment.rs` | CONFIRMED | Before load: `if !is_x86_feature_detected!("avx2")`, phase `Error`, "This computer's processor can't run Find similar.", and `find_similar` set to `"off"`. Add a test using an injected detector. |
| R2 | **Telemetry is on by default in Microsoft ORT builds.** `EnvironmentBuilder.telemetry: true`; pyke builds are compiled without it. If B1 picks Microsoft's binaries, "the download is the only network access" depends on turning it off. | `environment.rs:427,444-448` | CONFIRMED | Require `ort::init…().with_telemetry(false)` before any session. Add a line to Global Constraints and one source-check test. |
| R3 | **reqwest 0.13's `rustls` feature means `aws-lc-rs`.** `cargo tree` shows `aws-lc-sys v0.47.0`, a C build, with `cmake` as a build dependency. Neither `cmake` nor `nasm` is on PATH here. Whether aws-lc-sys builds without them is **not checked**. Also: `default-features = false` drops `system-proxy`. | `cargo info reqwest@0.13`; `cargo tree -i cmake` | CONFIRMED (dependency). Build: PLAUSIBLE | Either reqwest `features = ["rustls-no-provider", "blocking"]` with rustls `ring` installed as provider, or `ureq = "3"` with rustls/ring (a smaller graph, and no tokio in the client). Task 1's `client:` parameter type follows the choice. Tests build the client with `no_proxy()`. |
| R4 | **ort's default features** add `ndarray`, `tracing`, `tls-native` and `copy-dylibs`.<br>• `tls-native` is native-tls in ort-sys's build script, which needs `libssl-dev` on Linux CI (Plan 6 installs it).<br>• `download-binaries` fetches from `cdn.pyke.io` on a cold cache. `CARGO_NET_OFFLINE` or `ORT_SKIP_DOWNLOAD` then produce a link error, not an offline build. | `ort` `[features] default`; `ort-sys/build/download/mod.rs` `should_skip`; `vars.rs` | CONFIRMED | `ort = { version = "=2.0.0-rc.15", default-features = false, features = [the B1 choice, "std", "api-NN"] }`, with no ndarray: `Tensor::from_array((shape, Vec))`. If static pyke stays, CI caches `%LOCALAPPDATA%\ort.pyke.io\dfbin` (and the Linux and macOS equivalents), and the README states the build-time fetch. |
| R5 | **Task 1 adds `ort` to Cargo.toml.** From then on every `cargo build` or `cargo test` runs ort-sys's build script: network on a cold cache, plus the ORT link in every test binary. Task 1 doesn't use ORT. | Plan T1 Files | CONFIRMED | Task 1 adds only the download crate and `sha2`. Task 2 adds `ort` and `tokenizers`. (`sysinfo` is already a dependency, `0.40.4`.) |
| R6 | **Threads.** A plain `#[tauri::command]` runs on the main thread (see the comment at `commands.rs:488-496`), so `similar_by_text`, `_by_ref` and `_by_file`, which wait on the encoder lock behind an indexing image, would freeze the window. A blocking HTTP client must not be built or dropped inside the tokio runtime. | `commands.rs:488-496`; Plan T5 | CONFIRMED | All `similar_*` commands that touch the encoder or the disk are `#[tauri::command(async)]`. The download runs on its own `std::thread`, which builds the client. |
| R7 | **Task 4's self-consistency.**<br>• `no_write_after_root_changes` "flips the guard closure", but `Indexer::start` takes no guard.<br>• "Each save checks the state's open root" contradicts "the worker never holds the app-state lock".<br>• `prune` and `generation()` have no named consumer. | Plan T4 Interfaces and Step 1 | CONFIRMED | `start(job, embedder, store, still_current: Box<dyn Fn() -> bool + Send>, on)`. `SimilarState` keeps its own `open_root` or generation counter, set by B4's hooks, so the guard never touches `AppState.open`. Task 5's start pass calls `prune(current hashes)`. Drop `generation()`, or make it the guard's source. |
| R8 | **`decode_srgb`'s real signature.** It is `decode_srgb(path) -> Result<Decoded, Skip>`, where `Decoded { rgba, width, height, format, warnings }` keeps alpha, not `(RgbImage, Vec<String>)`. Over `MAX_BYTES` it gives `Skip::TooLarge(len)`. | `import.rs:265-323`, `:379` (`pub fn on_white`) | CONFIRMED | `similar_by_file`: `decode_srgb`, then `on_white(&d.rgba)`, then embed. Map `Skip::TooLarge(_)` to the wire code `"TooLarge"` and other `Skip`s to `"Unreadable"`. The test asserts the wire codes. |
| R9 | **The index hook can't read a hash.** `hooks::register` gets `&Change`, and `Change.references` is `Vec<ReferenceView>`, whose fields (`reference`, `thumb1024`) are private. Also, `Change.references` holds every touched reference, including tag edits, so the "lacks" filter does real work on every edit. | `commands.rs:89-103,124-140`; `hooks.rs` | CONFIRMED | Add `pub fn hash(&self) -> &str` and `pub fn thumb1024(&self) -> &Path` to `ReferenceView`. The hook only queues: it takes no encoder lock and does no I/O. |
| R10 | **`api.contract.test.ts` isn't mentioned.** It asserts every `tauriApi` wrapper's command name and keys (audit #1). `onSimilarStatus` is not an IPC command. | `src/api.contract.test.ts` (Plan 4 added `revealFolder` to `NON_IPC_KEYS`) | CONFIRMED | Task 5 Step 3 adds eight contract rows (`{id}`, `{q}`, `{path}`, `{paused}`) and puts `onSimilarStatus` in `NON_IPC_KEYS`. |
| R11 | **There is no error-copy table.** `SimilarStatus.error` would carry raw `DlError::Network(String)`, `Io(String)`, ort load text and `Http(u16)` into the Settings panel, and "Find similar couldn't start: <reason>." embeds raw OS or ORT text. That breaks the standing rule: wire codes and raw text are mapped to artist copy. | Plan T1 `DlError`; T5 Review Focus 3; T6 "the error text" | CONFIRMED | One table, in Task 5 or a `similar/copy.rs`.<br>• `Network`: "Couldn't reach the download. Check your connection and try again."<br>• `Http`: "The download server didn't answer. Try again later."<br>• `Checksum`: the existing copy.<br>• `Io`: "Couldn't save the model. Check free disk space."<br>• Load error: "Find similar couldn't start on this computer."<br>Raw text goes to stderr only. A test asserts that no raw text reaches the status. |
| R12 | **Task 6 against the real first-run.**<br>• It is one sheet with a Begin button, so there is no "next step".<br>• Step 3 can be answered before any library exists, and can be flipped On and Off (each click currently calls `setSettings`).<br>• "Turn on now" as `similarEnable()` on click would start a 213 MB download the artist can still undo by clicking "Not now".<br>• The RAM line already exists, through `systemRamGb()`: "This computer: N GB of RAM", rounded to whole GiB. `fmtBytes(ram_bytes)` (decimal) would show "17.1 GB" on this 15.9 GiB machine. | `firstrun.ts:120-215`; `commands.rs:1373-1380` | CONFIRMED | Keep the click recording the choice, as now. After Begin's create or open resolves, call `similarEnable()` if the choice was "on", without awaiting it. Keep `systemRamGb`, and add "Download: 213 MB" to that line. Drop `SimilarStatus.ram_bytes` and `status_reports_ram`, which duplicate `system_ram_gb` and its test. |
| R13 | **Task 6's "About the model" link** opens `THIRD_PARTY_NOTICES.md` through the opener. That needs `opener:allow-open-path`, which the test `capability_grants_opener_reveal_only` forbids. The file is generated by Plan 6 and doesn't exist yet. | `lib.rs` tests; `capabilities/default.json`; Plan 6:140 | CONFIRMED | Plan 5 shows the credit line as text only. Plan 6 Task 4 adds the link with About and the scoped `open-path` grant. |
| R14 | **Task 7 has no seams in the real code.**<br>• `mountSearch` is called inside `mountReference` (`view.ts:569`) and has no extension point for a second result group or a shared `seq`.<br>• `mountReference` returns only `{ show, ready, destroy }`: there is no current-reference accessor or on-show hook for the tab.<br>• `wireSimilar(root, api, hooks)` has no `store` (for titles, `thumb256` and `inScope`) and no `win` (for `onDragDropEvent`).<br>• The wiring lives in `firstrun.ts` `boot()`, not `main.ts`. Tasks 6 and 7 both edit `firstrun.ts`. | `search.ts`; `reference/view.ts:26-31,569,804`; `firstrun.ts:28-60`; `main.ts` | CONFIRMED | `SearchHooks` gains an optional `similar?(q): Promise<string[]>`. `mountSearch` renders the group and extends its own `seq` to both calls.<br>`mountReference`'s `opts` gains `onShow?(id)`. The signature becomes `wireSimilar(root, api, store, win, hooks)`, wired in `boot()`. Task 7's Files then names `firstrun.ts` and `search.ts`. |
| R15 | **Board scope.** "Looks similar" rows, in both the tab and the dropdown, don't check `store.inScope`. Under "Show only this board" they would list non-members: the same class as Plan 4's final-review C1 (my T8 F1). The search's `referenceTitle` hook already returns `undefined` out of scope. | `store.ts:81-84`; `view.ts` (Ranked `.filter(inScope)`); SPEC §2 Brief | CONFIRMED (gap) | Filter both by `store.inScope`. Re-render on `{ scope: true }` and on `scopeCleared` store events. Add one test per surface. This is a ruling, because SPEC §2 says scope filters "the view". |
| R16 | **Search flood.** `search.ts` renders on every `input` event. `similarByText` runs the text encoder, which waits up to one image behind indexing, on every keystroke. | `search.ts:84` | CONFIRMED | Debounce option B only, by about 150 ms. Option A stays instant. |
| R17 | **Model folder.** On Windows, Tauri's `app_data_dir` is `%APPDATA%\art.horus.app` (Roaming), the same folder as `app_config_dir`.<br>• The QA rule requires that folder absent, and the harness deletes it, so every QA run would re-download 213 MB.<br>• Roaming profiles would sync 213 MB. | Plan Global Constraints; `lib.rs` `setup` (config and cache dirs); the QA harness rule | CONFIRMED (Tauri path mapping, per its docs; not run) | Use `app_local_data_dir()/models/<id>` (`%LOCALAPPDATA%`). QA's harness rule names that folder separately, so a model can be kept between runs on purpose. |
| R18 | **The fp32 parity fixture.** `quantized_close_to_reference` needs `onnx/vision_model.onnx` and `onnx/text_model.onnx`, whose sizes and hashes aren't in the plan (**not checked**). The record tool is unspecified (a Python ORT?). Its RAM cost is **not measured** on this machine (2.76 GB free at scan time). | Plan T2 Step 1 | CONFIRMED (gap) | Pin both files' size and SHA-256 in the fixture README. Record once, by hand, with the script kept beside the fixture. Or drop it to `real_model_semantics` only, and let the user rule whether int8 parity is needed. |

### COS

| ID | Finding | Evidence | Suggested ruling |
|---|---|---|---|
| C1 | `commands::similar` (T5 Step 2's filter) implies `commands/similar.rs`, following the Plan 4 T0 split. Files says `commands.rs` (3,115 lines). | `src-tauri/src/commands/` | Create `commands/similar.rs`, and list it. |
| C2 | Files lists miss edits:<br>• T2 Step 3 touches `tauri.conf.json`, `app/README.md` and `lib.rs` (the dylib path);<br>• T8 Step 3b touches `similar/model.rs` and the `mode_cutoffs` test;<br>• T7's `search.test.ts` doesn't exist yet. | the plan; `src/` | Add them. `search.test.ts` is created. |
| C3 | `mode_cutoffs` uses literal cosines tied to the provisional 0.5 and 0.03. Task 8 Step 3b changes the constants. | Plan T5, T8 | Derive the test's fake cosines from `SIGLIP_B16_Q8.sim_min_*` (±0.01). |
| C4 | `by_ref_excludes_self_and_maps_hashes` needs two references with one hash. Import never makes them: a same-hash file becomes `report.duplicates`. Only a hand-edited `library.json` reaches that state. | `import.rs:150-153` | Keep the test, building the state directly, and say why in a comment. |
| C5 | The `Embedder::image(&RgbImage)` vs `preprocess(&DynamicImage)` types differ. | Plan T2 | `preprocess(&RgbImage)`. |
| C6 | New search and similar rows must not add `style=`. The existing `search.ts` rows already use inline `style="background:…"`, which Plan 6's `checkNoInlineStyle` will catch. | `search.ts:31,33` | Use classes for the new rows. The existing two are Plan 6's. |
| C7 | The drop zone inside `#q-results` (`role="listbox"`) is a non-option child, which is invalid ARIA. | `index.html:24` | Put `[data-similar-drop]` beside the listbox, not in it. |
| C8 | `ModelFile.path` is `onnx/…`, so the model folder holds an `onnx/` subfolder. `is_installed` and `disk_bytes` must recurse. | Plan model table | Say so in Task 1, or flatten to the file name on disk. |
| C9 | The third-party notices: ORT's binary bundles its own third-party code (protobuf, abseil and others, in ORT's `ThirdPartyNotices.txt`), so "ONNX Runtime: MIT" is incomplete. aws-lc's licences apply if R3 keeps it. | Plan T1 `notices/manual.md`; `aws-lc-sys` licence field | Task 1 reproduces ORT's `ThirdPartyNotices.txt` for the pinned version. That it ships one is **not checked**; the B1 spike confirms it. |

## Pair rows (tasks sharing a file or an interface)

| Pair | Produces → consumes | Found |
|---|---|---|
| T1 → T2 | `ModelSpec`, `model_dir`, `files` paths → `SiglipEncoder::load(dir, spec)` | Consistent, apart from C8 (the `onnx/` subfolder) and R5 (when `ort` enters Cargo.toml). |
| T1 → T3 | `spec.files[].sha256` → `model_key` | Consistent. |
| T1 → T5 | `download`, `DlEvent`, `DlError`, `cancel` → `similar_enable`, `Phase::{Downloading, Verifying}`, `SimilarStatus.download_*` | R6 (own thread), R11 (copy), R3 (client type). `download_total` must be set while `Off`, for the first-run line: say so. |
| T1 → T6 | `total_bytes()` → "Download: 213 MB" | Fine through R12 (a constant line, or the status's `download_total`). |
| T2 → T4 | `Embedder` (`Send`) → `Arc<Mutex<Box<dyn Embedder>>>` | Consistent. |
| T2 → T5 | `load` errors → `Phase::Error`, `find_similar = "off"` | B1, R1, R2 and R11. |
| T2 → T8 | Step 3 (ORT size) → T8 Step 4 and the Plan 6 budget | B1 decides what is measured. C2. |
| T3 → T4 | `has`, `put`, `save` → the indexer | Consistent. `prune` is unconsumed (R7). |
| T3 → T5 | `top_k(…, exclude: None)`, `embeddings_path` → `by_ref` mapping, remove | C4. `remove` deletes only the open library's file, which matches the plan. |
| T4 → T5 | `start`, `pause`, `stop`, the root guard → the state hooks | R7 and B4. |
| T5 → T6 | wrappers and status → the panel and first-run | R10, R11, R12 and R13. |
| T5 → T7 | `similarBy*`, `onSimilarStatus` → tab, group, drop | R6, R14, R15 and R16. |
| T6 ↔ T7 | both edit `firstrun.ts` `boot()` and append to `styles.css` | R14. Each appends its own `styles.css` section ("Plan 5 Task 6", "Plan 5 Task 7"). |
| T5 ↔ Plan 1/2/4 code | `import::decode_srgb`, `hooks::register`, `install`, `SettingsPatch` | R8, R9 and B4. Audit #5, #11 and #13 are already resolved on main: `decode_srgb`, `hooks.rs`, `setSettings(Partial<Settings>)`. |
| T6 ↔ Plan 4 code | the opener capability and its test | R13. |
| T7 ↔ Plan 2/4 code | `wireIntake` drop routing; store scope; search dropdown | The routing is easy: `intake.ts:110-120` already hit-tests `elementFromPoint`, so add a `[data-similar-drop]` check before `importPaths`. R14, R15 and C7. |
| T8 ↔ T2/T5 | measured cut-offs → `SIGLIP_B16_Q8`, `mode_cutoffs` | C2 and C3. |

## Self-consistency rows (one per task)

| Task | Own text agrees with itself? |
|---|---|
| T1 | **No: B3** (the tests need a seam the interface lacks). Also R5 and C8. The tests themselves use a local `TcpListener` only, which meets the "no network in tests" rule. |
| T2 | Mostly. C5 (types). R18 (the fp32 fixture is under-specified). The ignored tests read a pre-downloaded `HORUS_SIGLIP_DIR`, so there is no network in a test run. The one-off 213 MB download for them is a manual step: say that CI never runs `--ignored`. |
| T3 | Yes. |
| T4 | **No: R7** (the guard is tested but not in the signature, and the root check contradicts the lock rule). "Low priority" has no OS priority mechanism; read it as "a nap plus 2 threads", which the plan already specifies. |
| T5 | **No: B4** (the hooks are delegated to a pipeline that isn't there). Also R6, R8, R9, R10, R11, C1 and C4. |
| T6 | **No: R12** (a "next step" that doesn't exist; the RAM source is duplicated). Also R13. |
| T7 | **No: R14** (the named seams don't exist). Also R15, R16, C6 and C7. The `no_tagging_path` source check is fine. |
| T8 | Partly. C2 (Step 3b edits code). Step 1 deletes `settings.json` and `models/`, which R17 moves. The real 213 MB HF download is here, by hand, not in a test. |

## Checked and consistent (the controller's five risks)

1. **Crates, edition 2024 and the toolchain.**
   - The toolchain is `rustc 1.100.0`. `Cargo.toml` sets edition 2024 and has **no `rust-version`**, so the MSRV is whatever is installed.
   - Each pin's `rust-version` is lower: `ort` and `ort-sys` 1.92, `sha2` 0.11.2 1.88, `reqwest` 0.13.5 1.85, `ndarray` 0.17.2 1.64. `tokenizers` 0.23.2 declares none.
   - All four pins resolve. `tokenizers` with `default-features = false, features = ["fancy-regex"]` pulls in no `onig`, and `esaxx-rs` comes in with `cpp` off (`cargo tree -e features`), so it is pure Rust.
   - `sha2` 0.11 shows no `{:x}` formatting in its README. Formatting the bytes by hand (`{:02x}`) is safe.
   - Download-binaries offline, CI and DLL placement: B1, B2 and R4. `copy-dylibs` symlinks or copies any `.dll` into `target/`. Without Developer Mode it falls back to copying, and its own warning says tests can't see the DLLs then. What the Windows tarball contains is **not checked**.
2. **CSP and capabilities.** No CSP change is needed, and none should be made.
   - The download is Rust-side (reqwest or ureq), not the webview, so `connect-src` stays `ipc: http://ipc.localhost`.
   - The thumbnails are already `asset:`.
   - `listen("similar://status")` is covered by `core:default`.
   - No `unsafe-eval` anywhere: `lib.rs` `csp_is_strict_except_styles` guards it.
   - The only capability pressure is R13.
3. **Network in tests.** Task 1 uses a local `TcpListener` only. No test reaches Hugging Face. The `--ignored` model tests read a local folder. The build-time network (pyke CDN) is R4 or B1, not a test.
4. **Memory and time budgets.**
   - **Measured at scan time:**
     - total RAM 17,101,672,448 B (15.9 GiB);
     - free RAM 2.76 GB;
     - model download 213,373,093 B, from the plan's table (not re-measured).
   - **Not measured:**
     - ORT session RSS with both encoders loaded;
     - seconds per image at `intra_threads = 2`;
     - indexing time at 50 and at 2,500 references;
     - build peak RAM and time with ORT, tokenizers and aws-lc;
     - installer growth.
   - **Suggested ruling:** Task 2 records peak RSS and seconds per image before Task 4 starts, using `CARGO_BUILD_JOBS=2`. Consider loading the text session lazily (only typed queries need it).
5. **The Plan 1 Task 9 first-run, and the Plan 4 store and search code:** R12, R14, R15 and R16. `FindSimilar { Unset, On, Off }`, `SettingsPatch.find_similar` and `FIND_SIMILAR_COPY` (verbatim SPEC §5a) already exist on main.

**Not checked:**
- a compile of the new crates;
- the contents of `ort`'s Windows tarball;
- whether Microsoft's macOS ORT is universal2;
- whether aws-lc-sys builds without cmake or NASM;
- the fp32 file sizes.

The B1 spike answers the first three.
