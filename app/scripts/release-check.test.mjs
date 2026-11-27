// Plan 6 Task 1: the release-check rules. Each check gets one failing and one passing fixture.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  CSP,
  checkCapabilities,
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
});

describe("checkNoInlineStyle", () => {
  it("fails a look-alike of the Tauri local hosts (AGY #2)", () => {
    expect(checkNoRemoteUrls([{ path: "src/a.ts", text: 'fetch("http://asset.localhost.evil.example/x")' }])).not.toEqual([]);
    expect(checkNoRemoteUrls([{ path: "src/a.ts", text: 'fetch("http://ipc.localhostx/")' }])).not.toEqual([]);
    expect(checkNoRemoteUrls([{ path: "src/a.ts", text: "`http://asset.localhost/${p}`" }])).toEqual([]);
  });
  it("fails an upper-case STYLE attribute (AGY #2)", () => {
    expect(checkNoInlineStyle([{ path: "index.html", text: '<div STYLE="color:red"></div>' }])).not.toEqual([]);
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
  });
  it("passes Plan 5's hand-written notices", () => {
    expect(checkNotices(readFileSync(new URL("../notices/manual.md", import.meta.url), "utf8"))).toEqual([]);
  });
});
