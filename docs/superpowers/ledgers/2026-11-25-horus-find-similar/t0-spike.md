# Task 0 spike: ONNX Runtime linking (B1, B2, R1, R2, R4, C9)

-4a, 2026-11-27. For controller -02. Scratch work outside repo:
`C:\Users\JAKE\AppData\Local\Temp\claude\53c841e027131a00\93557f5c-19ef-4ac1-8558-2425fbd74a09\scratchpad\` (`dl\`, `ex\`, `model\`, `solo\`, `ortspike\`). Repo not edited.
Tags: **[measured]** = run/hashed here. **[code-read]** = read in ort rc.15 source, not run. **[not checked]** = could not do.

## Verdict

`ort = { version = "=2.0.0-rc.15", default-features = false, features = ["load-dynamic", "api-31"] }` + Microsoft ORT **1.31.1** CPU works on Windows x64: hello session runs, exe has no ORT/DirectML/D3D12/DXCORE import, starts with ORT never called, load failures are caught `Err`. **Two blockers for the controller:** (1) GitHub `microsoft/onnxruntime` returns 404 today, so the release-zip asset list and its SHA-256 values could not be read. Only NuGet was available (§1). (2) There is a panic trap in ort's fallback loader (§6a). Horus code must avoid it.

## 1. Pinned version, api-NN, assets

- ort rc.15 tops out at `api-31` (`ort-sys` features api-17..api-31; `MINOR_VERSION` = 31; docs link `v1.31.0`) **[code-read]**. Pin **ORT 1.31.1** + `api-31`. `init_from` rejects minor < 31 (`BadVersion`). Minor > 31 only logs an info line. 1.32.0 exists on NuGet/PyPI but was **not tested**.
- **GitHub releases: [not checked], 404.** `github.com/microsoft/onnxruntime` (repo page, `/releases/latest`, `/releases/download/v1.32.0/onnxruntime-win-x64-1.32.0.zip`, raw.githubusercontent README, `api.github.com/repos/...` incl. `/releases/tags/v1.31.1` and `v1.31.0`) returned **404** from here and from a remote web-fetch agent. `onnxruntime-genai` also 404. The search API lists no microsoft/onnxruntime repo. Other repos (microsoft/vscode, onnx/onnx) return 200, so the network works. The `onnxruntime` GitHub org exists but has only EP/demo repos, and `onnxruntime/onnxruntime` 404. **So the plan's "pinned Microsoft release zip + CI fetch from GitHub" source is unavailable right now. The controller must rule:** use NuGet as the pinned source, or wait/recheck.
- **NuGet `Microsoft.ML.OnnxRuntime` 1.31.1** (Microsoft's official package; versions up to 1.32.0 listed) **[measured]**:
  - nupkg `microsoft.ml.onnxruntime.1.31.1.nupkg`: 159,626,394 B, SHA-256 `6871ccbc97f3d5bdb4095a1dcec33aa78d56f6ed8de5980ef5fa1d9f2e7c679a`. This is a nupkg hash, not a release-zip hash.
  - `runtimes/` in the nupkg: android (aar), ios (xcframework.zip), linux-arm64, **linux-x64**, **osx-arm64**, win-arm64, **win-x64**. There is **no osx-x64 and no universal2**.

| File (inside nupkg) | Bytes | SHA-256 |
|---|---|---|
| `runtimes/win-x64/native/onnxruntime.dll` | 17,253,728 | `cb2fa518b18356617f6f9f460c012501da2819ec7e5c1d80bd8f5de20492db0c` |
| `runtimes/win-x64/native/onnxruntime_providers_shared.dll` (not needed, see §3) | 21,816 | `8cea20be64259950cda8643af0ed42c2a424400fc3bb9bb29f9a35cee6b3419f` |
| `runtimes/linux-x64/native/libonnxruntime.so` | 29,345,384 | `a96f132e5eb5ca04e23a7d2fc1078fb95aa591e8d71d0f237702ece3a1e0f4ea` |
| `runtimes/osx-arm64/native/libonnxruntime.dylib` | 44,830,288 | `2685dc296147c47b0dbd8e0615547b12fc0c445d158d1f374cbd0705d9626fdc` |
| `ThirdPartyNotices.txt` | 344,457 | `c53a76501ef60db6f865f20599f220761201ac4057683acefdab37d861b86622` |
| `LICENSE` (MIT, Microsoft) | 1,094 | `c250d6278f0b47a6439fb7592b08b58a55eb9f535aa49a1db63211c3f982b674` |

- DLL VersionInfo: `1.31.1.20261023.4.41d4d61`. `ort::info()`: `git-commit-id=41d4d61, build type=RelWithDebInfo` **[measured]**.
- macOS (scope cut to arm64-only by user via -02): dylib magic `cffaedfe 0c000001` = thin Mach-O 64, CPU ARM64 **[measured]**. The dylib was **not run** (no Mac here). The linux .so was **not run** either.

## 2. CPU floor (R1)

- **Documented floor: not found [not checked].** onnxruntime.ai install/build pages list platforms only, with no ISA baseline ([install](https://onnxruntime.ai/docs/install/), [build](https://onnxruntime.ai/docs/build/inferencing.html)). The release notes could not be read (GitHub 404).
- Indirect only: the CMake options `onnxruntime_USE_AVX/AVX2/AVX512` default OFF ([Red Hat AIPCC-11651](https://issues.redhat.com/browse/AIPCC-11651)). That suggests the stock builds are not compiled with an AVX2 baseline, but this is **not proof**.
- ort's AVX2 warning is gated on `ort_sys::USING_PYKE_BINARIES`, so it never fires with load-dynamic **[code-read]**.
- This machine has AVX2, so a run here proves nothing. Per the ruling, **R1 stays required** (no documented "no AVX2 floor").

## 3. One-session hello [measured]

Scratch crate `ortspike` (edition 2024, rustc 1.100, `CARGO_BUILD_JOBS=2`, release build 19.7 s, exe 349,184 B). `src/main.rs` core:

```rust
static ENV: OnceLock<Environment> = OnceLock::new();
let env = ort::init_from(dll).map_err(|e| format!("load: {e}"))?   // NOT ort::Error::new, see §6a
    .with_telemetry(false).build().map_err(e2s)?;
let env = ENV.get_or_init(|| env);
let mut s = Session::builder(env)?.commit_from_file(model)?;
let x = Tensor::from_array(([3usize, 4, 5], vec![1.0f32; 60]))?;   // no ndarray
let out = s.run(ort::inputs!["x" => x, "y" => y])?;
let (shape, data) = out["sum"].try_extract_tensor::<f32>()?;
```

- Model: `onnx/onnx` v1.17.0 `onnx/backend/test/data/node/test_add/model.onnx` (IR 7, Add, float [3,4,5]), 129 B, SHA-256 `93cf0438706cddabf683adc8b13c8a17c4b8b12d8bccb1b041268e1f4dff0a2d`.
- Absolute DLL path. Output: `sum shape=[3, 4, 5] first=3 all3=true`, `HELLO OK`, exit 0.
- Rerun with **only** `onnxruntime.dll` in a fresh folder (no `onnxruntime_providers_shared.dll`): `HELLO OK`. So the CPU path needs just the one DLL.
- Bad path `C:\nope\onnxruntime.dll`: `CAUGHT ERR: load: failed to load from ... LoadLibraryExW failed`, exit 0.
- Wrong version `C:\Windows\System32\onnxruntime.dll` (Windows' own copy, 1.17.1): `CAUGHT ERR: ... expected version >= '1.31.x', but got '1.17.1'`, exit 0.
- `with_telemetry(false)` compiles and runs. It maps to `DisableTelemetryEvents` **[code-read]**. Network silence was **not measured**.
- R4: `default-features = false` + `load-dynamic` + `api-31` pulls only ort, ort-sys, libloading, smallvec, windows-link (19 locked packages total). No ndarray, tracing, tls-native or download-binaries, and no build-time network beyond crates.io **[measured]**.

## 4. Imports and start with ORT never called [measured]

`dumpbin /dependents ortspike.exe` (VS 18 BuildTools 14.51): kernel32, ntdll, api-ms-win-core-synch-l1-2-0, VCRUNTIME140, api-ms-win-crt-{string,runtime,math,stdio,locale,heap}. **There is no delay-load section.** `dumpbin /imports | grep -i onnx|directml|d3d12|dxcore|dxgi|delay` finds nothing.
- The same exe with no argument (ort linked, never called; no onnxruntime.dll next to the exe) prints `started; ort never called`, exit 0.
- For information, the ORT DLL's own load-time imports (they apply only when Find similar is enabled): KERNEL32, ADVAPI32, **MSVCP140, MSVCP140_1, VCRUNTIME140_1**, VCRUNTIME140, dbghelp, SETUPAPI, **dxgi**, api-ms-win-core-path, the CRT set, delay-load SHELL32. **No DirectML/D3D12/DXCORE.** dxgi is present on Win10 1809.
- **Not checked:** the app on a real Win10 1809 machine, and the full Tauri `horus.exe` (only the scratch exe was checked).

## 5. ThirdPartyNotices (C9)

The NuGet 1.31.1 package ships `ThirdPartyNotices.txt` (344,457 B, 6,369 lines) and `LICENSE` (MIT) at the package root **[measured]**. Whether the GitHub release zips ship it is **[not checked]** (404).

## 6. Surprises

a. **Panic trap [measured].** Any ort API call made before a successful `init_from` panics, which breaks the "caught Err" claim. `ort::Error::new` counts as such a call: it calls `CreateStatus`, which calls `api()`, which runs `setup_api`. That fallback loads the bare name `onnxruntime.dll` (or `ORT_DYLIB_PATH`) through the normal DLL search path, and on this machine that is **`System32\onnxruntime.dll` 1.17.1**, so it panics `Failed to load ONNX Runtime dylib: ... got '1.17.1'` (exit 101). My first draft did `init_from(..).map_err(|e| ort::Error::new(..))` and hit this. If System32 ever held a compatible version, it would be loaded **silently** instead of ours. **Rule for Horus:** pass an absolute path. Map `LoadDynamicError` to a String or app error, never to `ort::Error`. Touch no ort API unless `init_from` returned Ok. Consider a source-check test for `ort::Error::new` in the load path.
b. **One environment per process [code-read].** `EnvironmentBuilder::build` returns `Err("only one environment is allowed per process")` once `CURRENT_ENV` has been set, and it is never cleared, even after the Environment drops. So the `OnceLock<Environment>` is mandatory, and a dropped env cannot be rebuilt without an app restart. In rc.15, `Session::builder(&Environment)` takes the env explicitly. I found no implicit default-env path, but the ruling's OnceLock still holds.
c. **Retry after a failed load [code-read].** `G_ORT_LIB.get_or_try_init` leaves the cell empty on Err, so a later `init_from` with a fixed path can succeed. This was not run in-process.
d. **VC++ redistributable.** onnxruntime.dll needs MSVCP140_1 and VCRUNTIME140_1 (the VS 2019+ redist). This machine has both. A machine without them gets a caught LoadLibraryExW Err, not a crash. The installer may want the redist, or the error copy should mention it.
e. **Size:** win-x64 adds about 16.5 MiB (one DLL). The osx-arm64 dylib is about 42.8 MiB. The linux-x64 .so is about 28 MiB.
f. RAM: the build at `CARGO_BUILD_JOBS=2` was fine, with no issue.
g. **The init order in my snippet is spike-only (from AGY #4).** It calls `init_from(..).build()` before `ENV.get_or_init`. In Horus, a disable followed by a re-enable would then hit the one-env `Err` (b). Task 2 must check `ENV.get()` first and serialize lazy init (a `Mutex`, or `OnceLock::get_or_try_init` once it is stable), so `build()` runs at most once per process.

## AGY #4 review (conv 56634001), verbatim line 1: `PASS`

Carry-ins it named, which need no spike rework:
1. The controller rules on the artifact source: NuGet 1.31.1 or a GitHub recheck.
2. Repeat the `dumpbin` and never-called start checks on the real `horus.exe` in Task 2 Step 3.
3. Fix the OnceLock init order (g).
4. R1 stays. Add a source-check test against `ort::Error::new`/`wrap` in the load path (6a).
