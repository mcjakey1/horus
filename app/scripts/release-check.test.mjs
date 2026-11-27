// Plan 6 Task 1: the release-check rules. Each check gets one failing and one passing fixture.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CSP,
  checkCapabilities,
  checkCapabilitySources,
  checkCargoMeta,
  checkCsp,
  checkFonts,
  checkGates,
  checkGlobals,
  checkNoForeignMarks,
  checkNoInlineStyle,
  checkNoRemoteUrls,
  checkNoThirdParty,
  checkNotices,
  checkVersions,
  appSources,
  resourceFiles,
  walk,
} from "./release-check.mjs";

const fx = (p) => new URL(`./fixtures/${p}`, import.meta.url);
const conf = () => JSON.parse(readFileSync(fx("tauri.conf.fixture.json"), "utf8"));
const cargo = readFileSync(fx("Cargo.fixture.toml"), "utf8");
const withCsp = (csp) => {
  const c = conf();
  c.app.security.csp = csp;
  return c;
};
const IMG = { textures: "img-element" };

describe("checkCsp", () => {
  it("passes the exact policy", () => {
    expect(checkCsp(conf(), IMG)).toEqual([]);
    // Line breaks and runs of spaces don't count (the plan prints it over three lines).
    expect(checkCsp(withCsp(CSP.replaceAll("; ", ";\n  ")), IMG)).toEqual([]);
  });
  it("fails 'unsafe-eval', a null CSP, the interim 'unsafe-inline' and any other string (C5)", () => {
    expect(checkCsp(withCsp(CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")), IMG).join()).toMatch(/unsafe-eval/);
    expect(checkCsp(withCsp(null), IMG)).not.toEqual([]);
    expect(checkCsp(withCsp(CSP.replace("style-src 'self'", "style-src 'self' 'unsafe-inline'")), IMG).join()).toMatch(/unsafe-inline/);
    expect(checkCsp(withCsp(CSP.replace("; form-action 'none'", "")), IMG)).not.toEqual([]);
    expect(checkCsp(withCsp(CSP.replace("worker-src 'self'", "worker-src 'self' blob:")), IMG)).not.toEqual([]);
  });
  it("fails a duplicated directive (browsers enforce the first one; AGY #2)", () => {
    expect(checkCsp(withCsp(`script-src 'self' https://evil.example; ${CSP}`), IMG).join()).toMatch(/duplicate/);
  });
  it("fails asset: in connect-src while textures load through img elements (R1)", () => {
    const loose = CSP.replace("connect-src ipc:", "connect-src ipc: asset:");
    expect(checkCsp(withCsp(loose), IMG).join()).toMatch(/connect-src/);
    expect(checkCsp(conf(), {}).join()).toMatch(/img-element/);
  });
});

describe("checkGlobals", () => {
  it("needs withGlobalTauri set to false explicitly (C6)", () => {
    expect(checkGlobals(conf())).toEqual([]);
    const on = conf();
    on.app.withGlobalTauri = true;
    expect(checkGlobals(on)).not.toEqual([]);
    const absent = conf();
    delete absent.app.withGlobalTauri;
    expect(checkGlobals(absent)).not.toEqual([]);
  });
});

describe("checkCapabilities", () => {
  const caps = (permissions) => [{ identifier: "default", permissions }];
  it("allows only the listed permissions", () => {
    expect(checkCapabilities(caps(["core:default", "dialog:allow-open", "opener:allow-reveal-item-in-dir"]))).toEqual([]);
    expect(checkCapabilities(caps(["core:default", "opener:default"])).join()).toMatch(/opener:default/);
  });
  it("allows opener:allow-open-path only for the notices file (R2, R10)", () => {
    const scoped = { identifier: "opener:allow-open-path", allow: [{ path: "$RESOURCE/THIRD_PARTY_NOTICES.md" }] };
    expect(checkCapabilities(caps(["core:default", scoped]))).toEqual([]);
    expect(checkCapabilities(caps(["opener:allow-open-path"]))).not.toEqual([]);
    expect(checkCapabilities(caps([{ ...scoped, allow: [{ path: "$HOME/**" }] }]))).not.toEqual([]);
  });
  it("fails a capability for remote pages (T1 review)", () => {
    expect(checkCapabilities([{ identifier: "web", remote: { urls: ["https://*.example"] }, permissions: ["core:default"] }]).join()).toMatch(/remote/);
  });
});

describe("checkCapabilitySources", () => {
  it("allows JSON capability files only, and none inline in tauri.conf.json (T1 review)", () => {
    expect(checkCapabilitySources(conf(), ["default.json"])).toEqual([]);
    expect(checkCapabilitySources(conf(), ["default.json", "extra.toml"]).join()).toMatch(/extra\.toml/);
    const inline = conf();
    inline.app.security.capabilities = [{ identifier: "x", permissions: ["fs:default"] }];
    expect(checkCapabilitySources(inline, ["default.json"]).join()).toMatch(/app\.security\.capabilities/);
  });
});

describe("checkCargoMeta", () => {
  it("needs a real description and the author with no email (Decision 3)", () => {
    expect(checkCargoMeta(cargo)).toEqual([]);
    expect(checkCargoMeta(cargo.replace('["Jake Manahan"]', '["you"]'))).not.toEqual([]);
    expect(checkCargoMeta(cargo.replace('["Jake Manahan"]', '["Jake Manahan <j@x.org>"]')).join()).toMatch(/email/);
    expect(checkCargoMeta(cargo.replace("A local reference workbench for artists", "A Tauri App"))).not.toEqual([]);
  });
});

describe("checkVersions", () => {
  it("needs one version in package.json, Cargo.toml and tauri.conf.json", () => {
    expect(checkVersions({ version: "0.1.0" }, cargo, conf())).toEqual([]);
    expect(checkVersions({ version: "1.0.0" }, cargo, conf())).not.toEqual([]);
  });
});

describe("checkFonts", () => {
  it("needs OFL-<Family>.txt with the licence line and a copyright line for each fonts.css family (R3)", () => {
    expect(checkFonts(fx("fonts-ok"))).toEqual([]);
    expect(checkFonts(fx("fonts-missing")).join()).toMatch(/OFL-SourceSerif4\.txt/);
  });
  it("passes the real fonts folder", () => {
    expect(checkFonts(new URL("../src/fonts", import.meta.url))).toEqual([]);
  });
});

describe("checkNoThirdParty", () => {
  it("fails a dist/ or resource path from the excluded set", () => {
    expect(checkNoThirdParty(["dist/index.html", "dist/assets/index-1.js"])).toEqual([]);
    expect(checkNoThirdParty(["dist/reference/frame-036s.jpg"]).join()).toMatch(/reference\//);
    expect(checkNoThirdParty([".impeccable/mocks/a.png", "REFERENCE-ANALYSIS.md"])).toHaveLength(2);
  });
  it("resolves bundle resources, including a file with no folder (AGY #2)", () => {
    const files = resourceFiles(fx(""), {
      "Cargo.fixture.toml": "Cargo.toml",
      "dist/assets/pixi-*.js": "assets/",
    });
    expect(files.map((f) => [f.source, f.path])).toEqual([
      ["Cargo.fixture.toml", "Cargo.toml"],
      ["dist/assets/pixi-abc123.js", "assets/pixi-abc123.js"],
    ]);
    expect(files[1].text).toContain("pixijs.com");
    expect(files.empty).toEqual([]);
  });
  it("lists an entry that matches no file, so the scans can't pass on an empty set (T1 review)", () => {
    const files = resourceFiles(fx(""), { dist: "dist/", "dist/": "dist/", "dist/**/*.js": "js/", "dist/index.html": "index.html" });
    expect(files.empty).toEqual(["dist", "dist/", "dist/**/*.js"]);
    expect(files.map((f) => f.path)).toEqual(["index.html"]);
  });
  it("walks the fixture dist/ tree", () => {
    const paths = walk(fx("dist")).map((f) => f.path);
    expect(paths.sort()).toEqual(["assets/pixi-abc123.js", "index.html"]);
    expect(checkNoThirdParty(paths)).toEqual([]);
  });
});

describe("checkNoForeignMarks", () => {
  it("fails shipped text that names the source taxonomy", () => {
    expect(checkNoForeignMarks([{ path: "dist/assets/index.js", text: 'const t = "A Taxonomy of Visuals";' }])).not.toEqual([]);
    expect(checkNoForeignMarks([{ path: "dist/assets/index.js", text: "iridescent irises" }])).toEqual([]);
    expect(checkNoForeignMarks(walk(fx("dist"), true))).toEqual([]);
  });
});

describe("checkNoRemoteUrls", () => {
  it("fails a remote URL in app sources", () => {
    expect(checkNoRemoteUrls([{ path: "src/a.ts", text: 'fetch("https://x")' }]).join()).toMatch(/https:\/\/x/);
  });
  it("allows the SVG namespace, the Tauri local hosts, test files, vendor chunks and the demo manifest (R13)", () => {
    expect(
      checkNoRemoteUrls([
        { path: "src/a.ts", text: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' },
        { path: "src/b.ts", text: "// asset: and http://asset.localhost on Windows; ipc: and http://ipc.localhost" },
        { path: "src/styles.css", text: "background: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg%27\")" },
        { path: "src/c.test.ts", text: 'const u = "https://ex.org/a.png";' },
        { path: "dist/assets/pixi-abc123.js", text: "/* https://pixijs.com */" },
        { path: "src-tauri/resources/demo/manifest.json", text: '{"source": "https://www.artic.edu/"}' },
      ]),
    ).toEqual([]);
  });
  it("fails a look-alike of the Tauri local hosts (AGY #2)", () => {
    expect(checkNoRemoteUrls([{ path: "src/a.ts", text: 'fetch("http://asset.localhost.evil.example/x")' }])).not.toEqual([]);
    expect(checkNoRemoteUrls([{ path: "src/a.ts", text: 'fetch("http://ipc.localhostx/")' }])).not.toEqual([]);
    expect(checkNoRemoteUrls([{ path: "src/a.ts", text: "`http://asset.localhost/${p}`" }])).toEqual([]);
  });
  it("fails userinfo after the local host, and an upper-case scheme (T1 review)", () => {
    expect(checkNoRemoteUrls([{ path: "src/a.ts", text: 'fetch("http://asset.localhost:@evil.example/x")' }])).not.toEqual([]);
    expect(checkNoRemoteUrls([{ path: "src/a.ts", text: 'fetch("HTTPS://evil.example/x")' }])).not.toEqual([]);
    expect(checkNoRemoteUrls([{ path: "src/a.ts", text: "// http://asset.localhost:8080/x and http://ipc.localhost" }])).toEqual([]);
  });
});

describe("checkNoInlineStyle", () => {
  it("fails an upper-case STYLE attribute (AGY #2)", () => {
    expect(checkNoInlineStyle([{ path: "index.html", text: '<div STYLE="color:red"></div>' }])).not.toEqual([]);
  });
  it("fails spaces around the = (T1 review)", () => {
    expect(checkNoInlineStyle([{ path: "src/a.ts", text: '`<i style ="x">`' }])).not.toEqual([]);
    expect(checkNoInlineStyle([{ path: "src/a.ts", text: "`<i style= ${s}>`" }])).not.toEqual([]);
  });
  it("fails style attributes in templates, passes data-css, skips tests and CSS (R13)", () => {
    expect(checkNoInlineStyle([{ path: "src/a.ts", text: "`<span style=\"left:${x}px\">`" }])).not.toEqual([]);
    expect(checkNoInlineStyle([{ path: "src/a.ts", text: "`<span style=${s}>`" }])).not.toEqual([]);
    expect(checkNoInlineStyle([{ path: "index.html", text: '<div style="color:red"></div>' }])).not.toEqual([]);
    expect(checkNoInlineStyle([{ path: "src/a.ts", text: "`<span data-css=\"left:${x}px\">`" }])).toEqual([]);
    expect(checkNoInlineStyle([{ path: "src/a.test.ts", text: '<i style="x"></i>' }])).toEqual([]);
    expect(checkNoInlineStyle([{ path: "src/styles.css", text: '[style="x"] {}' }])).toEqual([]);
  });
});

describe("the real tree", () => {
  const app = new URL("../", import.meta.url);
  const read = (p) => readFileSync(new URL(p, app), "utf8");
  it("its sources pass both scans", () => {
    const src = appSources(app);
    expect(src.some((f) => f.path === "index.html")).toBe(true);
    expect(src.some((f) => f.path.endsWith(".test.ts"))).toBe(false);
    expect(checkNoInlineStyle(src)).toEqual([]);
    expect(checkNoRemoteUrls(src)).toEqual([]);
  });
  it("its configuration passes", () => {
    const tauri = JSON.parse(read("src-tauri/tauri.conf.json"));
    const toml = read("src-tauri/Cargo.toml");
    expect(checkCsp(tauri, JSON.parse(read("release-check.json")))).toEqual([]);
    expect(checkGlobals(tauri)).toEqual([]);
    expect(checkCapabilities([JSON.parse(read("src-tauri/capabilities/default.json"))])).toEqual([]);
    expect(checkCargoMeta(toml)).toEqual([]);
    expect(checkVersions(JSON.parse(read("package.json")), toml, tauri)).toEqual([]);
  });
});

describe("checkGates", () => {
  const md = "# Release gates\n\n- [x] G1 legal review\n- [ ] G2 trademark search\n";
  it("an open gate passes when not final and fails when final", () => {
    expect(checkGates(md, false)).toEqual([]);
    expect(checkGates(md, true).join()).toMatch(/G2 trademark search/);
    expect(checkGates(md.replace("- [ ]", "- [x]"), true)).toEqual([]);
  });
});

describe("checkNotices", () => {
  const entry = "SigLIP base (google/siglip-base-patch16-224), Copyright Google LLC.\nLicensed under the Apache License, Version 2.0.\n";
  it("needs the SigLIP Apache-2.0 entry and its NOTICE status (gate G8, R5)", () => {
    expect(checkNotices("# Notices\n\nRed Hat Mono: OFL.\n")).not.toEqual([]);
    expect(checkNotices(entry)).not.toEqual([]); // no NOTICE line
    expect(checkNotices(`${entry}- NOTICE: none. Re-checked 2026-11-27: no NOTICE file upstream.\n`)).toEqual([]);
    expect(checkNotices(`${entry}\n### NOTICE (upstream)\n\nThis product includes software developed at Google.\n`)).toEqual([]);
    expect(checkNotices(`${entry}- NOTICE: none.\n`)).not.toEqual([]); // undated
    // AGY #2: only SigLIP's own section counts, and a NOTICE heading needs its text.
    expect(checkNotices(`${entry}\n### NOTICE\n\n## Next\n`)).not.toEqual([]);
    const merged = (siglip) => `# Notices\n\n## left-pad\n\nApache License, Version 2.0\n\n### NOTICE\n\nleft-pad notice.\n\n## SigLIP\n\n${siglip}\n## Red Hat Mono\n\nOFL.\n`;
    expect(checkNotices(merged("SigLIP base (google/siglip-base-patch16-224), Copyright Google LLC.\n"))).not.toEqual([]);
    expect(checkNotices(merged(`${entry}- NOTICE: none. Re-checked 2026-11-27.\n`))).toEqual([]);
    // A Windows checkout has CRLF line ends (AGY #2 round 2).
    const crlf = (s) => s.replaceAll("\n", "\r\n");
    expect(checkNotices(crlf(`${entry}\n### NOTICE (upstream)\n\nThis product includes software developed at Google.\n`))).toEqual([]);
    expect(checkNotices(crlf(`${entry}\n### NOTICE\n\n## Next\n`))).not.toEqual([]);
  });
  it("passes Plan 5's hand-written notices", () => {
    expect(checkNotices(readFileSync(new URL("../notices/manual.md", import.meta.url), "utf8"))).toEqual([]);
  });
});

// ---------- Plan 6 Task 5 ----------
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkBudgets, checkBundle, checkGlyphs, peMajorVersion } from "./release-check.mjs";

describe("checkGlyphs", () => {
  const tax = { operations: [{ icon: "a" }], domains: [{ icon: "b" }], techniques: [{ icon: "c" }, { icon: "" }] };
  const art = (extra = "") => `<svg viewBox="0 0 24 24"${extra}></svg>`;
  it("fails an undrawn icon, always", () => {
    const set = { a: art(), b: art(), "a plain square": art() };
    expect(checkGlyphs(tax, ["d"], set, false).join()).toMatch(/"c"/);
    expect(checkGlyphs(tax, ["d"], set, false).join()).toMatch(/"d"/);
  });
  it("fails placeholder art only in a final run (the user approves the real set)", () => {
    const set = { a: art(), b: art(), c: art(' data-placeholder=""'), "a plain square": art() };
    expect(checkGlyphs(tax, [], set, false)).toEqual([]);
    expect(checkGlyphs(tax, [], set, true).join()).toMatch(/placeholder.*"c"/);
  });
  it("passes the real set outside a final run", () => {
    const seed = JSON.parse(readFileSync(new URL("../src-tauri/resources/taxonomy.json", import.meta.url), "utf8"));
    const set = JSON.parse(readFileSync(new URL("../src/glyphs/glyphs.json", import.meta.url), "utf8"));
    expect(checkGlyphs(seed, [], set, false)).toEqual([]);
  });
});

describe("checkBundle", () => {
  /** A fresh src-tauri-like tree; returns its path. */
  function tree({ icons = ["icons/a.png"], ort = { "onnxruntime.dll": 10 }, vc = 14 } = {}) {
    const dir = mkdtempSync(join(tmpdir(), "horus-bundle-"));
    for (const p of icons) {
      mkdirSync(join(dir, p, ".."), { recursive: true });
      writeFileSync(join(dir, p), "");
    }
    mkdirSync(join(dir, "ort"));
    writeFileSync(join(dir, "ort/.gitkeep"), "");
    for (const [n, size] of Object.entries(ort)) writeFileSync(join(dir, "ort", n), Buffer.alloc(size));
    if (vc !== null) for (const d of ["msvcp140.dll", "msvcp140_1.dll", "vcruntime140.dll", "vcruntime140_1.dll"]) writeFileSync(join(dir, "ort", d), pe(vc));
    mkdirSync(join(dir, "resources"));
    writeFileSync(join(dir, "resources/taxonomy.json"), "{}");
    return dir;
  }
  /** Bytes holding a VS_FIXEDFILEINFO with file version `major`.0. */
  const pe = (major) => {
    const b = Buffer.alloc(64);
    b.writeUInt32LE(0xfeef04bd, 16);
    b.writeUInt32LE(major << 16, 24);
    return b;
  };
  const conf = (over = {}) => ({
    bundle: {
      targets: ["nsis", "msi", "dmg", "app", "appimage", "deb"],
      icon: ["icons/a.png"],
      resources: { "resources/taxonomy.json": "resources/taxonomy.json", "ort/*": "ort/" },
      ...over,
    },
  });
  const pins = { "win32-x64": { path: "runtimes/win-x64/native/onnxruntime.dll", size: 10 } };
  const opts = (dir, bundles = true) => ({ tauriDir: dir, platform: "win32", arch: "x64", pins, bundles });

  it("passes a complete tree", () => {
    expect(checkBundle(conf(), opts(tree()))).toEqual([]);
  });
  it("fails a missing icon, a resource matching nothing, and a third-party resource", () => {
    const dir = tree();
    expect(checkBundle(conf({ icon: ["icons/gone.png"] }), opts(dir)).join()).toMatch(/icons\/gone\.png/);
    expect(checkBundle(conf({ resources: { "resources/none/*": "x/" } }), opts(dir)).join()).toMatch(/matches no file/);
    expect(checkBundle(conf({ resources: { "reference/frame-036s.jpg": "x.jpg" } }), opts(dir)).join()).toMatch(/reference\//);
    expect(checkBundle(conf({ targets: "all" }), opts(dir)).join()).toMatch(/targets/);
  });
  it("with bundles: fails an ort/ with only .gitkeep, a wrong-size ORT, and a missing or pre-14 VC++ DLL (R8, B4)", () => {
    expect(checkBundle(conf(), opts(tree({ ort: {} }))).join()).toMatch(/onnxruntime\.dll is missing/);
    expect(checkBundle(conf(), opts(tree({ ort: { "onnxruntime.dll": 9 } }))).join()).toMatch(/size/);
    expect(checkBundle(conf(), opts(tree({ vc: null }))).join()).toMatch(/msvcp140\.dll is missing/);
    expect(checkBundle(conf(), opts(tree({ vc: 12 }))).join()).toMatch(/version 12/);
  });
  it("before the build, ORT and the VC++ DLLs are not checked", () => {
    expect(checkBundle(conf(), opts(tree({ ort: {}, vc: null }), false))).toEqual([]);
  });
  it("reads a PE file version", () => {
    expect(peMajorVersion(pe(14))).toBe(14);
    expect(peMajorVersion(Buffer.alloc(8))).toBeNull();
  });
  it("passes the real configuration before the build", () => {
    const real = JSON.parse(readFileSync(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
    expect(checkBundle(real, { tauriDir: new URL("../src-tauri/", import.meta.url), bundles: false })).toEqual([]);
  });
});

describe("checkBudgets", () => {
  it("fails an artefact over its budget; no budget means no ceiling yet (R9)", () => {
    const files = [{ kind: "nsis", name: "Horus.exe", size: 120 }, { kind: "dmg", name: "Horus.dmg", size: 999 }];
    expect(checkBudgets({ nsis: 100, dmg: null }, files).join()).toMatch(/Horus\.exe.*120.*100/);
    expect(checkBudgets({ nsis: 150, dmg: null }, files)).toEqual([]);
    expect(checkBudgets({ nsis: 150 }, [])).not.toEqual([]); // --bundles with nothing built
  });
});
