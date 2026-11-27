#!/usr/bin/env node
// Plan 6 Task 1: the release check. No dependencies. Each check returns a list of problems
// ([] means pass). CLI: `node scripts/release-check.mjs [--final]` prints them and exits 1 if
// any; open release gates are warnings until `--final`.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

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
const URL_RE = /https?:\/\/[^\s"'`)<>\\]+/g;
// The hosts end at a delimiter, so a look-alike such as asset.localhost.example fails (AGY #2).
const LOCAL_URLS = [/^http:\/\/www\.w3\.org\/2000\/svg/, /^http:\/\/www\.w3\.org\/1999\/xlink/, /^http:\/\/asset\.localhost(?:$|[/:?#])/, /^http:\/\/ipc\.localhost(?:$|[/:?#])/];
const INLINE_STYLE = /\bstyle=(["'`]|\$\{)/i;
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
  const upstream = /^#+[ \t]*NOTICE\b[^\n]*\n+[ \t]*[^\s#]/m.test(section); // a heading with its text
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
  for (const [from, to] of entries) {
    const slash = from.lastIndexOf("/"); // -1 for a file in src-tauri/ itself (AGY #2)
    const folder = slash < 0 ? "" : from.slice(0, slash + 1);
    const dir = join(tauriDir, folder);
    const pattern = new RegExp(`^${from.slice(slash + 1).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`);
    if (!existsSync(dir)) continue;
    for (const name of readdirSync(dir)) {
      if (!pattern.test(name) || statSync(join(dir, name)).isDirectory()) continue;
      const path = `${to}${to.endsWith("/") ? name : ""}`;
      files.push({ path, source: `${folder}${name}`, text: TEXT.test(name) ? readFileSync(join(dir, name), "utf8") : "" });
    }
  }
  return files;
}

export function run(appDir, final) {
  const app = fileURLToPath(appDir);
  const at = (...p) => join(app, ...p);
  const json = (p) => JSON.parse(readFileSync(at(p), "utf8"));
  const conf = json("src-tauri/tauri.conf.json");
  const cargoToml = readFileSync(at("src-tauri/Cargo.toml"), "utf8");
  const caps = readdirSync(at("src-tauri/capabilities")).filter((n) => n.endsWith(".json")).map((n) => json(`src-tauri/capabilities/${n}`));
  const dist = walk(at("dist"), true);
  const resources = resourceFiles(at("src-tauri"), conf.bundle?.resources);
  const problems = [];
  const warnings = [];
  if (!dist.length) problems.push("dist/ is empty: run `npm run build` first");
  problems.push(
    ...checkCsp(conf, json("release-check.json")),
    ...checkGlobals(conf),
    ...checkCapabilities(caps),
    ...checkCargoMeta(cargoToml),
    ...checkVersions(json("package.json"), cargoToml, conf),
    ...checkFonts(at("src/fonts")),
    ...checkNoThirdParty([...dist.map((f) => `dist/${f.path}`), ...resources.flatMap((f) => [f.source, f.path])]),
    ...checkNoForeignMarks([...dist.map((f) => ({ ...f, path: `dist/${f.path}` })), ...resources]),
    ...checkNoRemoteUrls(appSources(app)),
    ...checkNoInlineStyle(appSources(app)),
  );
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
  const { problems, warnings } = run(new URL("../", import.meta.url), process.argv.includes("--final"));
  for (const w of warnings) console.warn(`warning: ${w}`);
  for (const p of problems) console.error(`problem: ${p}`);
  console.log(problems.length ? `release-check: ${problems.length} problem(s)` : "release-check: pass");
  process.exit(problems.length ? 1 : 0);
}
