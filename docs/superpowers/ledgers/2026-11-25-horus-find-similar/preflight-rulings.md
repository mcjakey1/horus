# Plan 5 preflight rulings

Controller -02 (was -55). AGY #4: PASS WITH FIXES (fixes 1-5 applied). GLM 5.3 design review: R12, R13, R15, C6/C7 AGREE; R11, R16, B2 changes applied., 2026-11-27. Source: preflight-scan.md (-59). Cap 55% weekly (user 2026-11-27), warn 53%.

## BLOCK

- **B1 ACCEPT.** New Task 0 spike before Task 1. Preferred: `ort` `load-dynamic` + `api-NN`, `default-features = false`, pinned Microsoft ONNX Runtime CPU release binaries (SHA-256 per OS) in `bundle.resources`, loaded with `ort::init_from(path)` only when Find similar is enabled. A load failure is a caught `Err` (phase Error, `find_similar = "off"`). Spike outputs: `dumpbin /dependents horus.exe` shows no onnxruntime/DirectML/D3D12/DXCORE import; app starts with ORT never called; one-session hello runs; DLL size; ORT ThirdPartyNotices present. Also: the pinned ORT version (matching `api-NN`) and that release's asset list (the macOS arm64 archive), and its documented CPU floor (R1). Static pyke only if the spike rules out load-dynamic, then R1 is required.
- **B2 USER RULING (2026-11-27): "Do the silicon version only".** macOS ships arm64 (Apple Silicon) only; no Intel Mac build, no universal2, no Intel "unavailable" surface. Plan 5 ships the arm64 macOS ORT dylib; Plan 6's macOS target changes from universal to aarch64-apple-darwin (note it in Plan 6 deferrals).
- **B3 ACCEPT.** `ModelSpec.base: &'static str` (`"https://huggingface.co"`), `url() = {base}/{repo}/resolve/{revision}/{path}`. Tests build specs with `Box::leak`. `table_is_pinned` asserts the real base.
- **B4 ACCEPT, with AGY #4 fixes.** Plan 5 places its own hooks around `install()`:
  - **Stop (revised with -bb, open_library holds `state` from flush through install()):** open_library takes `indexer.take()` under `similar` while holding `state` (legal order) and bumps the AtomicU64 generation, so the old worker's `still_current()` goes false; drop both guards; `Indexer::stop()` (join) runs after the `state` guard drops, before `remember()`. create_library stops after `Library::create` + demo seed with no lock held. The join is never done under `similar` or `state`.
  - **Start:** after the switch returns (Ok or Err), the start hook runs for whatever library is open then (new on success, after `remember()`; old on Err), if Find similar is ready and no indexer runs. No lock held. Its missing-hash pass covers the demo seed and calls `prune(current hashes)`.
  - **Lock order:** `import_gate`, then `settings`, then `state`, then `similar`. Never call `update_settings` while holding `similar` (e.g. the load-error path setting `find_similar = "off"`: drop `similar` first). The worker and `IdxEvent` callback take neither `state` nor `settings`.
  - **Start-up:** in `setup`, on a background thread when `find_similar == "on"`: if `!is_installed`, resume the `.part` download; then load the model.
  - Plan 6 Task 2 later folds these into its pipeline.

## REWORK

- **R1** Conditional on a Task 0 spike output: check the pinned ORT release's documented CPU requirements (AVX/AVX2 floor). Required if static pyke stays or if the pinned Microsoft build needs AVX2; dropped only if the spike shows the Microsoft build has no AVX2 floor (an illegal-instruction crash is uncatchable under load-dynamic too).
- **R2 ACCEPT, with AGY #4 fix.** `ort::init_from(path)?.with_telemetry(false).build()?` once; the returned `Environment` is held alive in a process-wide `OnceLock<Environment>` (ort keeps only a `Weak`; dropping it lets a session recreate a default env with telemetry on). `api-NN` <= the pinned Microsoft ORT minor; Global Constraints line + one source-check test.
- **R3 ACCEPT, pick ureq.** `ureq = "3"` with rustls on ring, no tokio in the client. T1 confirms `cargo tree` has no `aws-lc-sys`/`cmake`. Tests use a local server and no proxy.
- **R4 ACCEPT.** No ndarray; `Tensor::from_array((shape, Vec))`.
- **R5 ACCEPT.** T1 adds ureq + sha2 only; T2 adds ort + tokenizers.
- **R6 ACCEPT.** Encoder/disk `similar_*` commands are `#[tauri::command(async)]`; download on its own `std::thread`.
- **R7 ACCEPT.** `start(job, embedder, store, still_current: Box<dyn Fn() -> bool + Send>, on)`; `Arc<AtomicU64>` generation counter (bumped by B4 hooks) is the guard's source, read lock-free by `still_current`. T5 start pass calls `prune(current hashes)`.
- **R8 ACCEPT.** `decode_srgb` then `on_white(&d.rgba)`; `Skip::TooLarge` maps to `"TooLarge"`, other Skips to `"Unreadable"`.
- **R9 ACCEPT.** `ReferenceView::hash()`, `thumb1024()`; hook only queues.
- **R10 ACCEPT.** Eight contract rows; `onSimilarStatus` in `NON_IPC_KEYS`.
- **R11 ACCEPT.** One copy table (`similar/copy.rs`), raw text to stderr only, test asserts no raw text in status. Copy per scan, except (GLM 5.3) Checksum: "The download didn't finish correctly. Try again." Add a catch-all row (unmapped error: "Find similar ran into a problem. Try again.") and the no-raw-text test covers an unknown error.
- **R12 ACCEPT.** Click records the choice; after Begin's create/open resolves, call `similarEnable()` un-awaited when choice is "on". Keep `systemRamGb`, append "Download: 213 MB". Drop `SimilarStatus.ram_bytes` and `status_reports_ram`. (GLM 5.3) If that un-awaited enable later fails, show the mapped error once as a one-line status notice outside Settings.
- **R13 ACCEPT.** Credit line text only; About link deferred to Plan 6 Task 4.
- **R14 ACCEPT.** `SearchHooks.similar?`, shared `seq`; `mountReference` opts `onShow?(id)`; `wireSimilar(root, api, store, win, hooks)` in `boot()`; T7 Files list `firstrun.ts`, `search.ts`.
- **R15 ACCEPT.** Both surfaces filter by `store.inScope`, re-render on scope events, one test each.
- **R16 ACCEPT.** Debounce option B by 150 ms; option A instant. (GLM 5.3) While a `similarByText` call is pending, the "Looks similar" group shows a quiet "Searching…" line, so empty never reads as no results.
- **R17 ACCEPT.** `app_local_data_dir()/models/<id>`; QA harness names it separately.
- **R18 DROP the fp32 parity fixture (user confirmed 2026-11-27: "Go ahead do it").** Model files are SHA-pinned, so int8 behaviour is fixed; `real_model_semantics` (ignored test) + T8 measured cut-offs cover quality. Saves a second large download. T2 records peak RSS and s/image before T4 (CARGO_BUILD_JOBS=2); text session loads lazily.

## COS

- C1–C7, C9 ACCEPT as suggested. C9 notices come from the spike's ORT ThirdPartyNotices.
- **C8:** keep `ModelFile.path` subpaths (`onnx/...`); `is_installed` checks `dir.join(f.path)`; `disk_bytes` recurses.

## Pair / self-consistency items (AGY #4 fix 5)

- **T1 -> T5:** `SimilarStatus.download_total` is always `SIGLIP_B16_Q8.total_bytes()`, in every phase including `Off`.
- **T2:** CI never runs `--ignored` model tests; they read a hand-downloaded `HORUS_SIGLIP_DIR`.
- **T4:** "low priority" means `BATCH = 16`, `NAP_MS = 40`, `intra_threads = 2`; no OS priority API.
- **R18:** user confirmed the drop.

## Next

Amender (-bb) amends the plan per these rulings, commits on plan5-similar; then the controller dispatches Task 0 (spike).

## Task 0 spike rulings (controller -02, 2026-11-27; spike by -4a, AGY #4 PASS; report t0-spike.md)

- **Source: NuGet `Microsoft.ML.OnnxRuntime` 1.31.1** (official Microsoft package, MIT, ships ThirdPartyNotices.txt). Pin the nupkg SHA-256 and each extracted binary's size + SHA-256 (win-x64 onnxruntime.dll 17,253,728 B; osx-arm64 dylib 44,830,288 B; linux-x64 .so 29,345,384 B; full hashes from t0-spike.md). GitHub release zips are not used (repo returned 404 to every fetch). `ort` features `load-dynamic` + `api-31`.
- **R1 REQUIRED.** No documented CPU floor found, so the AVX2 guard stays (better "unavailable" than an uncatchable crash).
- **Load rules (spike surprises):** `init_from` gets an absolute path to the bundled DLL only, never a bare name (System32 has ORT 1.17.1). No `ort` API call before a successful init: `LoadDynamicError` maps to a `String`/own error, never `ort::Error`. One env per process: check `ENV.get()` first; a failed init leaves Find similar in Error until restart.
- **VC++ runtime:** onnxruntime.dll imports MSVCP140_1/VCRUNTIME140_1. A missing runtime gives a caught load Err, mapped to "Find similar couldn't start on this computer." Shipping the runtime with the app is deferred to Plan 6 (installer).
- **C9:** notices = the nupkg's ThirdPartyNotices.txt + LICENSE for 1.31.1.
- The `horus.exe` dumpbin check (no onnx/DirectML/D3D12/DXCORE load-time import) moves to Task 2 Step 3 as a recorded check.
