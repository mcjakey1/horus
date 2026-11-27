# Plan 6 preflight rulings

Controller -02, 2026-11-27. Source: plan6-preflight-scan.md (-bb): 4 BLOCK, 13 REWORK, 9 COS, 24 deferred. The user delegated decisions while away ("I trust that you can make the best decisions for the application"); every call below can be reversed by the user.

## BLOCK

- **B1 (macOS 14 dylib floor) — keep macOS 11+ for the app; Find similar needs macOS 14.** Plan 6 adds a pre-load guard beside the AVX2 guard: on macOS < 14.0 (read via `sysinfo::System::os_version()` or `NSProcessInfo`), Find similar is unavailable with fixed copy "Find similar needs macOS 14 or later." (Settings: one muted line in place of the switch, no "Try again"; first-run: the same line instead of the choice, records `"off"`). ORT is never dlopen'd there. Test with an injected version. Reason: the rest of the app has no reason to drop macOS 11–13.
- **B2 (dylib outside Frameworks) — ACCEPT spike.** A CI job on macos-latest runs `codesign --verify --deep --strict` and a quarantined launch with Find similar enabled. If it fails, move the dylib to `bundle.macOS.frameworks` and resolve its path from there.
- **B3 (pipeline order) — ACCEPT.** Plan 6 T2 adopts Plan 5's order and tests (stop after open/create succeeds; start hook on Ok and Err). Sweep and existence checks run before `install()`; thumbnail rebuilds run off-lock after `remember()`.
- **B4 (VC++ runtime) — ACCEPT app-local.** Ship `msvcp140.dll`, `msvcp140_1.dll`, `vcruntime140.dll`, `vcruntime140_1.dll` app-local (Microsoft's Visual C++ redistributable terms allow app-local copies; T5 records the licence line). Place them in the directory Windows searches for onnxruntime.dll's dependencies: preferred beside `horus.exe` (the application directory is always searched); if Tauri can't place resources there, load with `LoadLibraryExW(LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS)` on the ort/ path. A spike on a clean Windows VM/sandbox (no redist) decides, plus a QA row "Find similar on a machine without the VC++ redistributable".

## REWORK

- R1–R10, R12, R13: ACCEPT as suggested in the scan.
- **R11: ACCEPT new Task 3b "Deferred fixes"** owning D1–D3, D6, D8, D9, D12, D13, D15, D18, D19 (copy, CSS, focus, notice passes). D4, D5, D7, D10, D16 go to T8 rows as the scan routes them. D14 stays in T2. D20–D24 are covered by R7, R8/R9, B4, R10 and B3.
- **D17 (Light Group Green 4.37:1):** fix to AA 4.5:1 with the smallest seed-ink change; the design reviewer (impeccable) picks the value in T4's pass and DESIGN.md records it.
- **D11 (label cosmetics):** in T8 as a judgment row; fix only what the design review calls P1.

## COS

- C1–C9: ACCEPT as suggested.

## Open with the user

- R27 (metadata editing in v1): not ruled; stays out of v1 unless the user says otherwise.

## Order

Plan 6 code starts after Plan 5 merges to main. plan6-release is then rebased (or re-created) on the new main. The amended plan can be written now.

## AGY #4 fixes (PASS WITH FIXES, applied by controller)

- **B4 load:** `ort::init_from` uses `LoadLibraryExW(..., 0)`, which won't search `ort/` for dependencies. Rule: map the 4 VC++ DLLs to the resource root (on Windows that is beside `horus.exe`, always searched). Also pre-load `onnxruntime.dll` with `LoadLibraryExW(path, NULL, LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_DEFAULT_DIRS)` and keep the HMODULE alive before `init_from`, so dev runs (DLLs in ort/) work too.
- **B4 sourcing:** copy the 4 DLLs from the build machine's VS `VC\Redist\MSVC\<ver>\x64\Microsoft.VC14*.CRT\`; `checkBundle` verifies presence and PE file version >= 14.x, no SHA pin (runner images change them). The licence line cites the VC++ redistributable terms.
- **B1 contract:** add `unsupported: Option<String>` to `SimilarStatus` (and `api.ts`), set at start-up when the guard fails (AVX2 or macOS < 14), so Settings and first-run render the muted line before any enable. Use `sysinfo::System::os_version()`, parse the major as `u32` (handles 26+); fail open if it returns `None`.
- **B2 scope:** the CI spike runs `codesign --verify --deep --strict` and `codesign -dv` on the dylib only. Quarantined launch + Find similar moves to T8 manual Mac QA. Default to `bundle.macOS.frameworks` (Tauri signs frameworks, treats resources as data); Resources only if the spike proves it signs and notarises.
- **C6:** set `withGlobalTauri: false` explicitly in tauri.conf.json and test it.
- **C3:** "Verify image files…" uses the import notice with progress and a Cancel text-btn (same surface as D15 import progress).
- **R13:** allow `http://asset.localhost` and `http://ipc.localhost` in the https scan's allow-list; exclude `*.test.ts` from both scans.
- **Pair T2, T4 ↔ Plan 5 T5:** in `lib.rs`, `tauri_plugin_single_instance` is the first plugin registered; the native menu is built inside `setup` after Plan 5's `SimilarEnv` manage and before the Find similar background start.
