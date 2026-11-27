#!/usr/bin/env node
// Fetches the pinned Microsoft ONNX Runtime CPU library for this OS into src-tauri/ort/
// (Plan 5 Task 2, B1). The binaries are never committed. Plan 6's CI runs this too.
//
// The pins live here only. The Rust test `ort_pins_match_plan` checks they match the plan.
// Plain Node, no npm dependency. Re-running with verified files in place does nothing.

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const VERSION = "1.31.1";
const NUPKG_URL = `https://www.nuget.org/api/v2/package/Microsoft.ML.OnnxRuntime/${VERSION}`;
const NUPKG = { size: 159626394, sha256: "6871ccbc97f3d5bdb4095a1dcec33aa78d56f6ed8de5980ef5fa1d9f2e7c679a" };

// One CPU library per OS. macOS is arm64 only (B2). Exported for release-check's checkBundle (R8).
export const BINARIES = {
  "win32-x64": { path: "runtimes/win-x64/native/onnxruntime.dll", size: 17253728, sha256: "cb2fa518b18356617f6f9f460c012501da2819ec7e5c1d80bd8f5de20492db0c" },
  "darwin-arm64": { path: "runtimes/osx-arm64/native/libonnxruntime.dylib", size: 44830288, sha256: "2685dc296147c47b0dbd8e0615547b12fc0c445d158d1f374cbd0705d9626fdc" },
  "linux-x64": { path: "runtimes/linux-x64/native/libonnxruntime.so", size: 29345384, sha256: "a96f132e5eb5ca04e23a7d2fc1078fb95aa591e8d71d0f237702ece3a1e0f4ea" },
};
// Bundled next to the library (C9).
const NOTICES = [
  { path: "ThirdPartyNotices.txt", size: 344457, sha256: "c53a76501ef60db6f865f20599f220761201ac4057683acefdab37d861b86622" },
  { path: "LICENSE", size: 1094, sha256: "c250d6278f0b47a6439fb7592b08b58a55eb9f535aa49a1db63211c3f982b674" },
];

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "src-tauri", "ort");

const sha256 = (file) => createHash("sha256").update(readFileSync(file)).digest("hex");
const verified = (file, pin) => existsSync(file) && statSync(file).size === pin.size && sha256(file) === pin.sha256;

/** bsdtar reads zip. By absolute path: a bare `tar` on Windows can be Git's GNU tar, which can't. */
function extract(nupkg, members, dest) {
  if (process.platform === "win32") {
    const tar = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe");
    execFileSync(tar, ["-xf", nupkg, "-C", dest, ...members], { stdio: "inherit" });
  } else if (process.platform === "darwin") {
    execFileSync("/usr/bin/tar", ["-xf", nupkg, "-C", dest, ...members], { stdio: "inherit" });
  } else {
    execFileSync("unzip", ["-q", "-o", nupkg, ...members, "-d", dest], { stdio: "inherit" });
  }
}

/** Plan 6 B4: the Visual C++ runtime DLLs onnxruntime.dll needs, shipped app-local. */
export const VC_DLLS = ["msvcp140.dll", "msvcp140_1.dll", "vcruntime140.dll", "vcruntime140_1.dll"];

/** B4: copies the VC++ runtime DLLs from this machine's Visual Studio (found through vswhere)
 * into src-tauri/ort/, beside onnxruntime.dll, when any is missing. No SHA pin: the build
 * machines' copies change; release-check's checkBundle checks each is version 14 or later. */
function copyVcRuntime() {
  if (VC_DLLS.every((d) => existsSync(join(OUT, d)))) return;
  const pf = process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)";
  const vswhere = join(pf, "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (!existsSync(vswhere)) throw new Error(`vswhere not found at ${vswhere}: install Visual Studio with the C++ tools`);
  const vs = execFileSync(vswhere, ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"], { encoding: "utf8" }).trim();
  if (!vs) throw new Error("vswhere found no Visual Studio with the C++ tools");
  const redist = join(vs, "VC", "Redist", "MSVC");
  // The newest MSVC version that has an x64 CRT folder.
  for (const ver of readdirSync(redist).sort().reverse()) {
    const x64 = join(redist, ver, "x64");
    const crt = existsSync(x64) && readdirSync(x64).find((n) => /^Microsoft\.VC14\d*\.CRT$/.test(n));
    if (!crt) continue;
    mkdirSync(OUT, { recursive: true });
    for (const d of VC_DLLS) copyFileSync(join(x64, crt, d), join(OUT, d));
    console.log(`fetch-ort: the VC++ runtime copied from ${join(x64, crt)}`);
    return;
  }
  throw new Error(`no x64 Microsoft.VC14*.CRT under ${redist}`);
}

async function main() {
  await fetchOrt();
  if (process.platform === "win32") copyVcRuntime();
}

async function fetchOrt() {
  const key = `${process.platform}-${process.arch}`;
  const binary = BINARIES[key];
  if (!binary) throw new Error(`no pinned ONNX Runtime build for ${key} (Windows x64, Linux x64 and macOS arm64 only)`);
  const wanted = [binary, ...NOTICES];

  if (wanted.every((pin) => verified(join(OUT, basename(pin.path)), pin))) {
    console.log(`fetch-ort: ONNX Runtime ${VERSION} (${key}) already in place and verified.`);
    return;
  }

  const work = mkdtempSync(join(tmpdir(), "horus-ort-"));
  try {
    console.log(`fetch-ort: downloading ${NUPKG_URL}`);
    const res = await fetch(NUPKG_URL, { headers: { "User-Agent": "Horus-build" } });
    if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
    const nupkg = join(work, `microsoft.ml.onnxruntime.${VERSION}.nupkg`);
    writeFileSync(nupkg, Buffer.from(await res.arrayBuffer()));
    if (!verified(nupkg, NUPKG)) {
      rmSync(nupkg, { force: true });
      throw new Error("the NuGet package does not match its pinned size and SHA-256");
    }

    const unpacked = join(work, "x");
    mkdirSync(unpacked);
    extract(nupkg, wanted.map((pin) => pin.path), unpacked);

    mkdirSync(OUT, { recursive: true });
    for (const pin of wanted) {
      const src = join(unpacked, pin.path);
      if (!verified(src, pin)) {
        rmSync(src, { force: true });
        throw new Error(`${pin.path} does not match its pinned size and SHA-256`);
      }
      const dest = join(OUT, basename(pin.path));
      copyFileSync(src, dest);
      if (!verified(dest, pin)) {
        rmSync(dest, { force: true });
        throw new Error(`${dest} did not copy intact`);
      }
    }
    console.log(`fetch-ort: ONNX Runtime ${VERSION} (${key}) written to ${OUT}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

// Run only as the script; release-check imports the pins.
// ponytail: matched by file name, since D: here is a subst drive and the two paths differ.
if (process.argv[1]?.endsWith("fetch-ort.mjs")) {
  try {
    await main();
  } catch (e) {
    // A mismatched file was already deleted.
    console.error(`fetch-ort: ${e.message}`);
    process.exitCode = 1;
  }
}
