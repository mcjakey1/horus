#!/usr/bin/env node
// Plan 6 Task 1: the release check. No dependencies. Each check returns a list of problems
// ([] means pass). CLI: `node scripts/release-check.mjs [--final] [--bundles]` prints them and exits 1
// if any; open release gates are warnings until `--final`; `--bundles` (after the build) adds
// ONNX Runtime, the VC++ DLLs and the installer budgets.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { BINARIES, VC_DLLS } from "./fetch-ort.mjs";

/** The one allowed policy (C5), compared token for token. No 'unsafe-eval', no 'unsafe-inline'.
 * worker-src: the Galaxy's same-origin module worker, no blob: (R1). connect-src: no asset:,
 * because canvas textures load through img elements (`release-check.json`, R1). */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self'; font-src 'self'; " +
  "img-src 'self' asset: http://asset.localhost data: blob:; connect-src ipc: http://ipc.localhost; " +
  "worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

/** Every grant the window has, each with its reason. Anything new needs a line here. */
const ALLOWED_PERMISSIONS = {
  "core:default": "the app's own commands and events",
  "dialog:allow-open": "the folder and file pickers",
  "opener:allow-reveal-item-in-dir": "Plan 4's Show in folder after a board export",
};
/** opener:allow-open-path, scoped to the notices file only (About, "About the model"; R2, R10). */
const OPEN_PATH = "$RESOURCE/THIRD_PARTY_NOTICES.md";

const EXCLUDED = [
  /(^|\/)reference\//,
  /(^|\/)REFERENCE-ANALYSIS\.md$/,
  /(^|\/)\.impeccable\/(mocks|review|questions)\//,
];
const FOREIGN = /\bIris\b|Taxonomy of Visuals|Modern Art Direction/i;
const URL_RE = /https?:\/\/[^\s"'`)<>\\]+/gi;
// The hosts end at a path, query, fragment or port, so a look-alike (asset.localhost.example) or
// userinfo (asset.localhost:@evil.example) fails (AGY #2, T1 review).
const LOCAL_URLS = [/^http:\/\/www\.w3\.org\/2000\/svg/, /^http:\/\/www\.w3\.org\/1999\/xlink/, /^http:\/\/asset\.localhost(?:$|[/?#]|:\d)/, /^http:\/\/ipc\.localhost(?:$|[/?#]|:\d)/];
const INLINE_STYLE = /\bstyle\s*=\s*(["'`]|\$\{)/i;
const TEXT = /\.(html|ts|js|mjs|css|json|txt|md|svg|map)$/i;

const tokens = (s) => s.trim().split(/\s+/).join(" ");
/** Directive name to its normalised text, plus the names that occur twice (a browser enforces the
 * first one and ignores the rest, so a duplicate can hide a looser policy; AGY #2). */
function directives(s) {
  const map = new Map();
  const dup = [];
  for (const d of s.split(";").map(tokens).filter(Boolean)) {
    const name = d.split(" ")[0];
    if (map.has(name)) dup.push(name);
    else map.set(name, d);
  }
  return Object.assign(map, { dup });
}

export function checkCsp(conf, rc) {
  const out = [];
  if (rc?.textures !== "img-element") out.push('release-check.json: "textures" must be "img-element" (R1)');
  const csp = conf?.app?.security?.csp;
  if (typeof csp !== "string") return [...out, "CSP: app.security.csp must be the release policy string, not " + JSON.stringify(csp ?? null)];
  if (csp.includes("'unsafe-eval'")) out.push("CSP: 'unsafe-eval' is not allowed");
  if (csp.includes("'unsafe-inline'")) out.push("CSP: 'unsafe-inline' is not allowed (convert style attributes to data-css)");
  const got = directives(csp);
  for (const name of got.dup) out.push(`CSP: duplicate directive "${name}"`);
  if (/\basset:/.test(got.get("connect-src") ?? "")) out.push("CSP: connect-src must not hold asset: (textures load through img elements, R1)");
  for (const [name, want] of directives(CSP)) {
    if (got.get(name) !== want) out.push(`CSP: expected "${want}", found "${got.get(name) ?? "(missing)"}"`);
  }
  for (const name of got.keys()) if (!directives(CSP).has(name)) out.push(`CSP: unexpected directive "${got.get(name)}"`);
  return out;
}

export function checkGlobals(conf) {
  const app = conf?.app ?? {};
  return Object.hasOwn(app, "withGlobalTauri") && app.withGlobalTauri === false
    ? []
    : ["tauri.conf.json: app.withGlobalTauri must be set to false explicitly (C6)"];
}

/** `caps`: the parsed capability files. */
export function checkCapabilities(caps) {
  const out = [];
  for (const cap of caps) {
    // Remote pages never get the app's commands (T1 review).
    if (cap.remote) out.push(`capability ${cap.identifier}: "remote" grants IPC to remote pages`);
    for (const p of cap.permissions ?? []) {
      const id = typeof p === "string" ? p : p.identifier;
      if (id === "opener:allow-open-path") {
        const paths = typeof p === "string" ? [] : (p.allow ?? []).map((a) => a.path);
        if (paths.length !== 1 || paths[0] !== OPEN_PATH || p.deny?.length) out.push(`capability ${cap.identifier}: opener:allow-open-path must allow ${OPEN_PATH} only`);
      } else if (!Object.hasOwn(ALLOWED_PERMISSIONS, id) || typeof p !== "string") {
        out.push(`capability ${cap.identifier}: "${id}" is not in ALLOWED_PERMISSIONS`);
      }
    }
  }
  return out;
}

/** Capabilities live only in JSON files that `checkCapabilities` reads: no TOML file (Tauri reads
 * those too) and none inline in tauri.conf.json (T1 review). `names`: the capabilities folder. */
export function checkCapabilitySources(conf, names) {
  const out = names.filter((n) => !n.endsWith(".json")).map((n) => `capabilities/${n}: only JSON capability files are checked`);
  if (conf?.app?.security?.capabilities !== undefined) out.push("tauri.conf.json: app.security.capabilities must be absent (capabilities live in capabilities/*.json)");
  return out;
}

/** The `[package]` table's `key = value` lines, values as written. */
function cargoPackage(toml) {
  const m = /^\[package\]\s*$([\s\S]*?)(?=^\[|(?![\s\S]))/m.exec(toml);
  const keys = {};
  for (const line of (m?.[1] ?? "").split(/\r?\n/)) {
    const kv = /^\s*([\w-]+)\s*=\s*(.+?)\s*$/.exec(line);
    if (kv) keys[kv[1]] = kv[2];
  }
  return keys;
}
const tomlString = (v) => (v && /^"(.*)"$/.exec(v)?.[1]) ?? null;

export function checkCargoMeta(cargoToml) {
  const pkg = cargoPackage(cargoToml);
  const out = [];
  const description = tomlString(pkg.description);
  if (!description || description === "A Tauri App") out.push("Cargo.toml: description must describe Horus, not the template's");
  let authors = null;
  try {
    authors = JSON.parse(pkg.authors ?? "null");
  } catch {
    /* reported below */
  }
  if (Array.isArray(authors) && authors.some((a) => /<[^>]*@[^>]*>/.test(a))) out.push("Cargo.toml: authors must not hold an email address (Decision 3)");
  else if (JSON.stringify(authors) !== JSON.stringify(["Jake Manahan"])) out.push('Cargo.toml: authors must be ["Jake Manahan"] (Decision 3)');
  return out;
}

export function checkVersions(pkg, cargoToml, conf) {
  const v = { "package.json": pkg?.version, "Cargo.toml": tomlString(cargoPackage(cargoToml).version), "tauri.conf.json": conf?.version };
  return new Set(Object.values(v)).size === 1 && v["package.json"]
    ? []
    : [`versions differ: ${Object.entries(v).map(([k, x]) => `${k} ${x}`).join(", ")}`];
}

/** Each `@font-face` family in fonts.css needs OFL-<Family>.txt (spaces removed) with the
 * licence line and a copyright line (R3). */
export function checkFonts(fontDir) {
  const dir = fontDir instanceof URL ? fileURLToPath(fontDir) : fontDir;
  const css = readFileSync(join(dir, "fonts.css"), "utf8");
  const families = new Set([...css.matchAll(/font-family:\s*['"]?([^'";]+?)['"]?\s*;/g)].map((m) => m[1]));
  const out = [];
  if (!families.size) out.push("fonts.css: no @font-face family found");
  for (const family of families) {
    const file = `OFL-${family.replace(/\s+/g, "")}.txt`;
    const path = join(dir, file);
    if (!existsSync(path)) {
      out.push(`fonts: ${file} is missing for "${family}"`);
      continue;
    }
    const text = readFileSync(path, "utf8");
    if (!text.includes("SIL OPEN FONT LICENSE Version 1.1")) out.push(`fonts: ${file} lacks "SIL OPEN FONT LICENSE Version 1.1"`);
    if (!/^.*Copyright.*$/m.test(text)) out.push(`fonts: ${file} lacks a Copyright line`);
  }
  return out;
}

export function checkNoThirdParty(paths) {
  return paths.filter((p) => EXCLUDED.some((re) => re.test(p.replaceAll("\\", "/")))).map((p) => `third-party material ships: ${p}`);
}

/** `files`: shipped text, `{ path, text }`. */
export function checkNoForeignMarks(files) {
  return files.filter((f) => FOREIGN.test(f.text)).map((f) => `foreign mark in ${f.path}: "${FOREIGN.exec(f.text)[0]}"`);
}

/** Our own sources only: `src/**` (ts, js, css, html) and `index.html`, minus `*.test.ts` (R13).
 * Never dist/ (vendor chunks carry documentation URLs) or the demo manifest (source URLs). */
const isSource = (p) => /^(src\/.+\.(ts|js|css|html)|index\.html)$/.test(p) && !p.endsWith(".test.ts");

export function checkNoRemoteUrls(files) {
  const out = [];
  for (const f of files.filter((f) => isSource(f.path))) {
    for (const [url] of f.text.matchAll(URL_RE)) {
      if (!LOCAL_URLS.some((re) => re.test(url))) out.push(`remote URL in ${f.path}: ${url}`);
    }
  }
  return out;
}

export function checkNoInlineStyle(files) {
  return files
    .filter((f) => isSource(f.path) && !f.path.endsWith(".css"))
    .filter((f) => INLINE_STYLE.test(f.text))
    .map((f) => `inline style attribute in ${f.path} (use data-css and applyCss): ${INLINE_STYLE.exec(f.text)[0]}`);
}

const openGates = (markdown) => markdown.split(/\r?\n/).filter((l) => /^\s*- \[ \]/.test(l)).map((l) => l.replace(/^\s*- \[ \]\s*/, ""));

/** Open `- [ ]` items in RELEASE-GATES.md fail only in a final run (G1–G9). */
export function checkGates(markdown, final) {
  return final ? openGates(markdown).map((g) => `release gate open: ${g}`) : [];
}

/** The SigLIP entry with its Apache-2.0 licence, and its NOTICE: an upstream NOTICE section,
 * or a dated "NOTICE: none" line with its evidence (gate G8, R5). Only SigLIP's own `## ` section
 * counts, so another package's licence or NOTICE in the merged file can't stand in (AGY #2). */
export function checkNotices(noticesMd) {
  const at = noticesMd.indexOf("google/siglip-base-patch16-224");
  if (at < 0) return ["notices: no entry for google/siglip-base-patch16-224"];
  const start = noticesMd.lastIndexOf("\n## ", at) + 1; // 0 when there is no heading before it
  const end = noticesMd.indexOf("\n## ", at);
  const section = noticesMd.slice(start, end < 0 ? undefined : end);
  const out = [];
  if (!section.includes("Apache License, Version 2.0")) out.push('notices: no "Apache License, Version 2.0" in the SigLIP entry');
  const none = /NOTICE: none\b.*\b\d{4}-\d{2}-\d{2}\b/.test(section);
  const upstream = /^#+[ \t]*NOTICE\b[^\r\n]*(?:\r?\n)+[ \t]*[^\s#]/m.test(section); // a heading with its text (LF or CRLF)
  if (!none && !upstream) out.push('notices: SigLIP needs its upstream NOTICE text or a dated "NOTICE: none" line');
  return out;
}

/** Every file under `dir` (a path or file URL), as `{ path }` relative to it with `/`, plus
 * `text` for text files when `withText`. */
export function walk(dir, withText = false) {
  const root = dir instanceof URL ? fileURLToPath(dir) : dir;
  const out = [];
  const visit = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) visit(p);
      else {
        const path = relative(root, p).replaceAll("\\", "/");
        out.push(withText && TEXT.test(name) ? { path, text: readFileSync(p, "utf8") } : { path, text: "" });
      }
    }
  };
  if (existsSync(root)) visit(root);
  return out;
}

/** The app's own sources, paths relative to `app/` (`src/…`, `index.html`). */
export function appSources(appDir) {
  const app = appDir instanceof URL ? fileURLToPath(appDir) : appDir;
  const src = walk(join(app, "src"), true).map((f) => ({ ...f, path: `src/${f.path}` }));
  return [...src, { path: "index.html", text: readFileSync(join(app, "index.html"), "utf8") }].filter((f) => isSource(f.path));
}

/** The bundle's resource sources (simple globs: `*` in the last segment) and targets. `tauriDir`:
 * a path or file URL. */
export function resourceFiles(tauriDir, resources) {
  if (tauriDir instanceof URL) tauriDir = fileURLToPath(tauriDir);
  const entries = Array.isArray(resources) ? resources.map((s) => [s, s]) : Object.entries(resources ?? {});
  const files = [];
  /** Entries that matched no file: a directory, a trailing `/`, a `**` glob or a missing path. The
   * scans below would pass on an empty set, so `run` reports them (T1 review). */
  const empty = [];
  for (const [from, to] of entries) {
    const slash = from.lastIndexOf("/"); // -1 for a file in src-tauri/ itself (AGY #2)
    const folder = slash < 0 ? "" : from.slice(0, slash + 1);
    const dir = join(tauriDir, folder);
    const pattern = new RegExp(`^${from.slice(slash + 1).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    const before = files.length;
    for (const name of existsSync(dir) ? readdirSync(dir) : []) {
      if (!pattern.test(name) || statSync(join(dir, name)).isDirectory()) continue;
      const path = `${to}${to.endsWith("/") ? name : ""}`;
      files.push({ path, source: `${folder}${name}`, text: TEXT.test(name) ? readFileSync(join(dir, name), "utf8") : "" });
    }
    if (files.length === before) empty.push(from);
  }
  return Object.assign(files, { empty });
}

// ---------- Plan 6 Task 5 ----------

/** Glyphs (Task 5): every icon string in the bundled taxonomy and DOMAIN_ICONS (plus the
 * "a plain square" default) has an SVG; placeholder art fails only a final run, because the real
 * set comes from the design pass and needs the user's approval. */
export function checkGlyphs(taxonomy, domainIcons, set, final) {
  const icons = new Set(
    [...(taxonomy.operations ?? []), ...(taxonomy.domains ?? []), ...(taxonomy.techniques ?? [])]
      .map((x) => x.icon)
      .filter(Boolean)
      .concat(domainIcons, ["a plain square"]),
  );
  const out = [];
  for (const icon of icons) {
    if (!set[icon]) out.push(`glyph: no SVG for "${icon}"`);
    else if (final && set[icon].includes("data-placeholder")) out.push(`glyph: placeholder art for "${icon}" (the design pass, approved by the user)`);
  }
  return out;
}

const TARGETS = ["nsis", "msi", "dmg", "app", "appimage", "deb"];

/** The major file version in a PE's VS_FIXEDFILEINFO (its 0xFEEF04BD signature, then
 * dwFileVersionMS 8 bytes on), or null when there is none. */
export function peMajorVersion(bytes) {
  const at = bytes.indexOf(Buffer.from([0xbd, 0x04, 0xef, 0xfe]));
  return at < 0 || at + 12 > bytes.length ? null : bytes.readUInt32LE(at + 8) >>> 16;
}

/** The bundle config (Task 5): the targets, every resource resolving (R2), no third-party
 * material, the icons. With `bundles` (after the build), also ONNX Runtime at its pinned size
 * (R8) and, on Windows, the four VC++ DLLs at version 14 or later (B4). */
export function checkBundle(conf, { tauriDir, platform = process.platform, arch = process.arch, pins = BINARIES, bundles = false }) {
  const dir = tauriDir instanceof URL ? fileURLToPath(tauriDir) : tauriDir;
  const b = conf?.bundle ?? {};
  const out = [];
  if (JSON.stringify(b.targets) !== JSON.stringify(TARGETS)) out.push(`bundle.targets must be ${JSON.stringify(TARGETS)}`);
  for (const icon of b.icon ?? []) if (!existsSync(join(dir, icon))) out.push(`bundle.icon: ${icon} is missing`);
  const files = resourceFiles(dir, b.resources);
  out.push(...files.empty.map((from) => `bundle.resources: "${from}" matches no file (name files or use a "dir/*" glob)`));
  out.push(...checkNoThirdParty(Object.entries(b.resources ?? {}).flat().filter((x) => typeof x === "string")));
  if (!bundles) return out;
  const pin = pins[`${platform}-${arch}`];
  if (!pin) out.push(`no pinned ONNX Runtime build for ${platform}-${arch}`);
  else {
    const name = pin.path.split("/").pop();
    const file = join(dir, "ort", name);
    if (!existsSync(file)) out.push(`ort/${name} is missing: run npm run fetch:ort (R8)`);
    else if (statSync(file).size !== pin.size) out.push(`ort/${name} has size ${statSync(file).size}, pinned ${pin.size} (R8)`);
  }
  if (platform === "win32") {
    for (const dll of VC_DLLS) {
      const file = join(dir, "ort", dll);
      if (!existsSync(file)) {
        out.push(`ort/${dll} is missing: run npm run fetch:ort (B4)`);
        continue;
      }
      const v = peMajorVersion(readFileSync(file));
      if (v === null || v < 14) out.push(`ort/${dll} is version ${v}, under 14 (B4)`);
    }
  }
  return out;
}

/** R9: each installer within its measured budget (`budgetBytes` per kind in release-check.json);
 * a kind with no budget has no ceiling yet. `files`: `{ kind, name, size }` from the bundle folder. */
export function checkBudgets(budgets, files) {
  if (!files.length) return ["--bundles: no installers found under target/release/bundle"];
  return files
    .filter((f) => budgets?.[f.kind] && f.size > budgets[f.kind])
    .map((f) => `${f.kind}/${f.name} is ${f.size} bytes, over its budget of ${budgets[f.kind]} (R9)`);
}

/** The installers under `bundleDir` (one folder per kind), as `{ kind, name, size }`. */
function installers(bundleDir) {
  if (!existsSync(bundleDir)) return [];
  return readdirSync(bundleDir).flatMap((kind) =>
    statSync(join(bundleDir, kind)).isDirectory()
      ? readdirSync(join(bundleDir, kind))
          .filter((n) => /\.(exe|msi|dmg|AppImage|deb)$/.test(n))
          .map((name) => ({ kind, name, size: statSync(join(bundleDir, kind, name)).size }))
      : [],
  );
}

export function run(appDir, final, bundles = false) {
  const app = fileURLToPath(appDir);
  const at = (...p) => join(app, ...p);
  const json = (p) => JSON.parse(readFileSync(at(p), "utf8"));
  const conf = json("src-tauri/tauri.conf.json");
  const cargoToml = readFileSync(at("src-tauri/Cargo.toml"), "utf8");
  const capNames = readdirSync(at("src-tauri/capabilities"));
  const caps = capNames.filter((n) => n.endsWith(".json")).map((n) => json(`src-tauri/capabilities/${n}`));
  const dist = walk(at("dist"), true);
  const resources = resourceFiles(at("src-tauri"), conf.bundle?.resources);
  const problems = [];
  const warnings = [];
  if (!dist.length) problems.push("dist/ is empty: run `npm run build` first");
  problems.push(
    ...checkCsp(conf, json("release-check.json")),
    ...checkGlobals(conf),
    ...checkCapabilities(caps),
    ...checkCapabilitySources(conf, capNames),
    ...checkBundle(conf, { tauriDir: at("src-tauri"), bundles }),
    ...checkCargoMeta(cargoToml),
    ...checkVersions(json("package.json"), cargoToml, conf),
    ...checkFonts(at("src/fonts")),
    ...checkNoThirdParty([...dist.map((f) => `dist/${f.path}`), ...resources.flatMap((f) => [f.source, f.path])]),
    ...checkNoForeignMarks([...dist.map((f) => ({ ...f, path: `dist/${f.path}` })), ...resources]),
    ...checkNoRemoteUrls(appSources(app)),
    ...checkNoInlineStyle(appSources(app)),
  );
  // Task 5: the glyphs; DOMAIN_ICONS is read from its TypeScript source.
  const domainIcons = [...(/export const DOMAIN_ICONS = \[([\s\S]*?)\];/.exec(readFileSync(at("src/views/inspector.ts"), "utf8"))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const glyphs = json("src/glyphs/glyphs.json");
  problems.push(...checkGlyphs(json("src-tauri/resources/taxonomy.json"), domainIcons, glyphs, final));
  const placeholders = Object.values(glyphs).filter((g) => g.includes("data-placeholder")).length;
  if (!final && placeholders) warnings.push(`${placeholders} glyphs are placeholder art (the design pass; --final refuses them)`);
  if (bundles) problems.push(...checkBudgets(json("release-check.json").budgetBytes, installers(join(process.env.CARGO_TARGET_DIR ?? at("src-tauri/target"), "release", "bundle"))));
  const notices = [at("THIRD_PARTY_NOTICES.md"), at("notices/manual.md")].find(existsSync);
  if (notices) problems.push(...checkNotices(readFileSync(notices, "utf8")));
  else problems.push("notices: neither THIRD_PARTY_NOTICES.md nor notices/manual.md exists");
  const gates = at("..", "RELEASE-GATES.md");
  if (existsSync(gates)) {
    const md = readFileSync(gates, "utf8");
    problems.push(...checkGates(md, final));
    if (!final) warnings.push(...openGates(md).map((g) => `release gate open: ${g}`));
  } else (final ? problems : warnings).push("RELEASE-GATES.md does not exist yet (Task 9)");
  return { problems, warnings };
}

// ponytail: matched by file name, since D: here is a subst drive and the two paths differ.
if (process.argv[1]?.endsWith("release-check.mjs")) {
  const { problems, warnings } = run(new URL("../", import.meta.url), process.argv.includes("--final"), process.argv.includes("--bundles"));
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const p of problems) console.error(`problem: ${p}`);
  console.log(problems.length ? `release-check: ${problems.length} problem(s)` : "release-check: pass");
  process.exit(problems.length ? 1 : 0);
}
