// Plan 3 pre-QA (Tasks 1-9) as Mara (QA-PERSONA.md): Tree, Galaxy and Radial in the real release
// horus.exe over WebView2 CDP. Aims at the ledger's "to QA" items and Review Focus 1-3 and 5.
// Run: node mara-plan3-preqa.js <work dir outside the repo>. Needs <work dir>/fx from mkfx.py.
// Backs up and restores %APPDATA%\art.horus.app; WebView2 data goes to <work dir>/wv2.
// Release builds expose no Galaxy hook, so positions come from wrapping window.Worker in the page.
const { chromium } = require(process.env.APPDATA + "/npm/node_modules/playwright");
const { spawn, execSync } = require("child_process");
const fs = require("fs"), path = require("path");

const REPO = path.resolve(__dirname, "../../..");
const EXE = path.join(REPO, "app/src-tauri/target/release/horus.exe");
const W = process.argv[2]; if (!W) throw new Error("usage: node mara-plan3-preqa.js <work dir>");
const FX = path.join(W, "fx"), LIB = path.join(FX, "Mara graph é"), EMPTY = path.join(FX, "Empty start");
const MESSY = path.join(FX, "Mara inbox ü"), SHOTS = path.join(W, "shots3");
const CONFIG = path.join(process.env.APPDATA, "art.horus.app"), CONFIG_BAK = path.join(W, "config-backup3");
const PORT = 9334, NODE = 48, GAP = 64;
const FALLBACK = "This view needs WebGL, which isn't available here. The Reference view still works.";

const R = [], external = [], dialogQueue = [], consoleErr = [];
const ok = (name, pass, detail = "") => { R.push({ name, pass, detail: String(detail) }); console.log(pass === null ? "NOTE" : pass ? "PASS" : "FAIL", name, "::", detail); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const refs = (root = LIB) => readJson(path.join(root, "library.json"))?.references ?? [];
async function until(fn, ms = 5000, step = 50) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return { v, ms: Date.now() - t0 }; if (Date.now() - t0 > ms) return { v: null, ms: Date.now() - t0 }; await sleep(step); }
}

for (const d of [LIB, EMPTY]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
fs.mkdirSync(SHOTS, { recursive: true });
if (fs.existsSync(CONFIG)) { fs.rmSync(CONFIG_BAK, { recursive: true, force: true }); fs.cpSync(CONFIG, CONFIG_BAK, { recursive: true }); fs.rmSync(CONFIG, { recursive: true, force: true }); }

let proc;
async function launch(tag, extraArgs = "") {
  proc = spawn(EXE, [], { env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: path.join(W, "wv2"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT} ${extraArgs}`.trim() }, stdio: "ignore" });
  let b;
  for (let i = 0; i < 60 && !b; i++) { try { b = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await sleep(500); } }
  const ctx = b.contexts()[0];
  let page;
  for (let i = 0; i < 40 && !page; i++) { page = ctx.pages().find((x) => x.url().includes("tauri.localhost")); if (!page) await sleep(250); }
  await page.route(/ipc\.localhost\/plugin%3Adialog%7Copen/, (route) => {
    const v = dialogQueue.length ? dialogQueue.shift() : null;
    route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Tauri-Response", "Tauri-Response": "ok" }, body: JSON.stringify(v) });
  });
  page.on("request", (r) => { const u = new URL(r.url()); if (!/(^|\.)localhost$/.test(u.hostname) && !["data:", "blob:"].includes(u.protocol)) external.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error") consoleErr.push(`${tag}: ${m.text()}`); });
  page.on("pageerror", (e) => ok(`page error (${tag})`, false, e.message));
  return { b, page };
}
const askClose = () => { try { execSync(`powershell -NoProfile -Command "(Get-Process -Id ${proc.pid}).CloseMainWindow() | Out-Null"`); } catch {} };
async function closeApp(b) { askClose(); await until(() => proc.exitCode !== null, 30000, 100); try { await b.close(); } catch {} }
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + ".png") }).catch(() => {});
const txt = (page, s) => page.locator(s).first().innerText().catch(() => "");
const one = (s) => String(s).replace(/\s*\n+\s*/g, " | ");
const count = async (page) => Number((await txt(page, "#lib-count")).replace(/,/g, "").match(/\d+/)?.[0] ?? -1);
const drop = (page, paths) => page.evaluate((paths) => window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://drag-drop", payload: { paths, position: { x: 5, y: 5 } } }), paths);
const noticeDone = (page, ms = 60000) => page.waitForFunction(() => { const t = document.querySelector("#import-notice [data-body]")?.textContent || ""; return t && !/Importing|Adding/.test(t); }, null, { timeout: ms });
const view = (page) => page.evaluate(() => document.body.dataset.view);
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.className ? "." + String(a.className).split(" ")[0] : ""}${a.closest("[data-view-host]") ? "@" + a.closest("[data-view-host]").dataset.viewHost : ""}` : "none"; });

// Galaxy layout spy: every worker message, last positions of the newest run.
const spy = (page) => page.evaluate(() => {
  if (window.__gx) return;
  const Base = window.Worker;
  window.__gx = { run: -1, pos: null, ends: 0, ticks: 0, history: [] };
  window.Worker = class extends Base {
    constructor(...a) {
      super(...a);
      this.addEventListener("message", (ev) => {
        const m = ev.data, g = window.__gx;
        if (m.run < g.run) return;
        if (m.run > g.run) { g.run = m.run; g.ticks = 0; }
        if (m.type === "tick") { const p = {}; m.ids.forEach((id, i) => (p[id] = [m.xy[2 * i], m.xy[2 * i + 1]])); g.pos = p; g.ticks++; }
        else { g.ends++; g.history.push({ run: m.run, pos: g.pos }); }
      });
    }
  };
});
const gx = (page) => page.evaluate(() => window.__gx);
const waitEnd = async (page, after, ms = 20000) => (await until(async () => (await gx(page)).ends > after, ms, 100)).v;

function nearest(pos, p, dir, except, inScope = () => true) {
  let best = null, bestD = Infinity;
  for (const [id, q] of Object.entries(pos)) {
    if (id === except || !inScope(id)) continue;
    const dx = q[0] - p[0], dy = q[1] - p[1];
    if (dir) { const along = dx * dir[0] + dy * dir[1], across = Math.abs(dx * dir[1] - dy * dir[0]); if (along <= 0 || across >= along) continue; }
    const d = Math.hypot(dx, dy);
    if (d < bestD || (d === bestD && best !== null && id < best)) [best, bestD] = [id, d];
  }
  return best;
}
const centreOf = (pos) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of Object.values(pos)) { x0 = Math.min(x0, x - NODE / 2); y0 = Math.min(y0, y - NODE / 2); x1 = Math.max(x1, x + NODE / 2); y1 = Math.max(y1, y + NODE / 2); }
  return [(x0 + x1) / 2, (y0 + y1) / 2];
};
function minDist(pos) {
  const v = Object.values(pos); let m = Infinity, close = 0;
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
    const d = Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1]); m = Math.min(m, d);
    if (Math.abs(v[i][0] - v[j][0]) < NODE && Math.abs(v[i][1] - v[j][1]) < NODE) close++;
  }
  return { m, close };
}
const nan = (pos) => Object.values(pos ?? {}).filter(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y)).length;
async function tabTo(page, sel, max = 40, keep = false, rev = false) {
  if (!keep) await page.evaluate(() => document.activeElement?.blur?.());
  for (let i = 1; i <= max; i++) { await page.keyboard.press(rev ? "Shift+Tab" : "Tab"); if (await page.evaluate((s) => document.activeElement?.matches(s), sel)) return i; }
  return -1;
}
const titleToId = (title) => refs().find((r) => r.title === title)?.id;

(async () => {
  // ---------- first run with the demo ----------
  let { b, page } = await launch("demo");
  await page.waitForSelector(".firstrun", { timeout: 20000 });
  // The first-run buttons can be clicked before their handlers bind: retry until the path shows.
  let picked = false;
  for (let i = 0; i < 10 && !picked; i++) {
    dialogQueue.length = 0; dialogQueue.push(LIB); await page.click('[data-pick="create"]');
    picked = !!(await until(() => page.evaluate(() => /New library in/.test(document.querySelector(".firstrun")?.textContent || "")), 1500)).v;
  }
  ok("setup: first-run create picked", picked);
  if (await page.locator('[data-fs="off"]').count()) await page.click('[data-fs="off"]');
  await page.waitForSelector("#fr-go:not([disabled])", { timeout: 15000 });
  await page.click("#fr-go");
  await page.waitForSelector(".firstrun", { state: "detached", timeout: 120000 }); await sleep(1000);
  ok("setup: demo library 50", (await count(page)) === 50, await txt(page, "#lib-count"));
  const tabs = await page.$$eval("[data-view-tab]", (t) => t.map((x) => `${x.dataset.viewTab}:${x.disabled ? "off" : "on"}`).join(" "));
  ok("tabs Tree/Galaxy/Radial enabled", /tree:on/.test(tabs) && /galaxy:on/.test(tabs) && /radial:on/.test(tabs), tabs);

  // ---------- Tree ----------
  await page.click('[data-view-tab="tree"]');
  await page.waitForSelector('[data-view-host="tree"] canvas', { timeout: 15000 }); await sleep(1200);
  await shot(page, "t01-tree-fit-light");
  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    return { serif: document.fonts.check('13px "Source Serif 4"'), mono: document.fonts.check('13px "Red Hat Mono"'),
      faces: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.style}:${f.status}`) };
  });
  ok("T8/T6: canvas label fonts loaded (Source Serif 4, Red Hat Mono)", fonts.serif && fonts.mono, `serif ${fonts.serif}, mono ${fonts.mono}; ${fonts.faces.join("; ")}`);
  const tax = readJson(path.join(LIB, "taxonomy.json"));
  const widths = await page.evaluate((names) => {
    const c = document.createElement("canvas").getContext("2d"); c.font = '13px "Source Serif 4", Georgia, serif';
    return names.map((n) => [n, Math.round(c.measureText(n).width)]);
  }, tax.techniques.map((t) => t.name));
  const wide = widths.filter(([, w]) => w > GAP);
  ok("T6: technique labels wider than the 64-unit spacing (13 px serif)", null, `${wide.length}/${widths.length} wider than 64; median ${widths.map((x) => x[1]).sort((a, b) => a - b)[widths.length >> 1]} px; widest ${widths.sort((a, b) => b[1] - a[1]).slice(0, 4).map((x) => x.join(" ")).join(", ")}`);
  ok("Tree inspector starts on Operations", /Operations/.test(await txt(page, '[data-view-host="tree"] .insp-body')), one(await txt(page, '[data-view-host="tree"] .insp-body')).slice(0, 160));
  // Keyboard-only: Tab to the canvas, then try to make a first selection.
  const tTabs = await tabTo(page, '[data-view-host="tree"] canvas');
  ok("Tree canvas reachable by Tab", tTabs > 0, `${tTabs} Tab presses`);
  const crumb = () => txt(page, '[data-view-host="tree"] .insp-crumb');
  const c0 = await crumb();
  for (const k of ["Enter", "ArrowDown", "ArrowRight"]) await page.keyboard.press(k);
  await sleep(400);
  ok("Tree: Enter/arrows on the canvas with nothing selected make a selection", (await crumb()) !== c0, `crumb before ${one(c0)} | after ${one(await crumb())}`);
  await page.keyboard.press("Escape"); await sleep(300); // Phase 2: Enter now selects (fix wave I3); clear it so the inspector route starts from the top
  // Inspector route: Tab to the first operation button.
  const iTabs = await tabTo(page, '[data-view-host="tree"] .insp-sel');
  await page.keyboard.press("Enter"); await sleep(400);
  const afterOp = await crumb();
  ok("Tree: inspector Operation button selects by keyboard", afterOp !== c0, `${iTabs} Tabs; ${one(afterOp)}; focus ${await active(page)}`);
  await page.keyboard.press("ArrowDown"); await sleep(300);
  ok("Tree: arrow keys after an inspector pick (focus still in inspector)", null, `crumb ${one(await crumb())}; focus ${await active(page)}`);
  const backRev = await tabTo(page, '[data-view-host="tree"] canvas', 40, true, true);
  const back = backRev; // Shift+Tab from the inspector title
  await page.keyboard.press("ArrowDown"); await sleep(300);
  const c2 = await crumb();
  await page.keyboard.press("ArrowDown"); await sleep(300);
  const c3 = await crumb();
  ok("Tree: ↓ walks op → domain → technique from the canvas", c2 !== afterOp && c3 !== c2, `${back} Shift+Tabs back; ${one(c2)} || ${one(c3)}`);
  await page.keyboard.press("ArrowDown"); await sleep(300);
  await shot(page, "t02-tree-path-light");
  for (let i = 0; i < 6; i++) { await page.keyboard.press("+"); await sleep(350); } // spaced: rapid presses do not compound (P3-4)
  await sleep(700); await shot(page, "t02b-tree-zoom-light");
  await page.click(".tree-all"); await sleep(900); await shot(page, "t02c-tree-showall-zoom");
  await page.click(".tree-all"); await sleep(500);
  await page.locator('[data-view-host="tree"] canvas').focus(); await page.keyboard.press("0"); await sleep(600);
  await page.click("#theme"); await sleep(800);
  await shot(page, "t03-tree-path-dark");
  const inks = await page.evaluate(() => {
    const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
    return { theme: document.documentElement.dataset.theme, line2: v("--line-2"), bg: v("--bg"), panel: v("--panel"), shell: v("--shell"), ink2: v("--ink-2") };
  });
  await page.click("#theme"); await sleep(500);
  const inksL = await page.evaluate(() => { const v = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim(); return { theme: document.documentElement.dataset.theme, line2: v("--line-2"), bg: v("--bg"), panel: v("--panel"), shell: v("--shell"), ink2: v("--ink-2") }; });
  ok("theme tokens for the off-path look", null, JSON.stringify([inksL, inks]));
  // Reduced motion: press 0 after a zoom; an instant fit means the 1st and a 400 ms later frame match.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const rm = await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  await page.locator('[data-view-host="tree"] canvas').focus();
  for (let i = 0; i < 4; i++) { await page.keyboard.press("+"); await sleep(350); } // spaced: rapid presses do not compound (P3-4)
  await sleep(300); await page.keyboard.press("0");
  const a = await page.locator('[data-view-host="tree"] canvas').screenshot(); await sleep(450);
  const bb = await page.locator('[data-view-host="tree"] canvas').screenshot();
  ok("Tree reduced motion: 0 fits without a tween", rm && a.equals(bb), `matchMedia ${rm}; frames equal ${a.equals(bb)}`);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // ---------- Radial ----------
  await page.click('[data-view-tab="radial"]');
  await page.waitForSelector('[data-view-host="radial"] canvas', { timeout: 15000 }); await sleep(1200);
  await shot(page, "r01-radial-light");
  const opsBtns = await page.$$eval('[data-view-host="radial"] .radial-ops button', (b) => b.map((x) => `${x.textContent.trim()}${x.getAttribute("aria-pressed") === "true" ? "*" : ""}`));
  ok("Radial: operation buttons from the taxonomy", opsBtns.length === tax.operations.length, opsBtns.join(" / "));
  const rTabs = await tabTo(page, '[data-view-host="radial"] canvas');
  await page.keyboard.press("2"); await sleep(500);
  const ops2 = await page.$$eval('[data-view-host="radial"] .radial-ops button', (b) => b.map((x) => x.getAttribute("aria-pressed")));
  ok("Radial: digit 2 switches operation", ops2[1] === "true", `${rTabs} Tabs; pressed ${ops2.join(",")}`);
  const rc0 = await txt(page, '[data-view-host="radial"] .insp-crumb');
  await page.keyboard.press("Enter"); await sleep(300); // arrows pan with nothing selected (by design); Enter selects the centre (fix wave I3)
  ok("Radial: first keyboard selection from the canvas (Enter)", (await txt(page, '[data-view-host="radial"] .insp-crumb')) !== rc0, one(await txt(page, '[data-view-host="radial"] .insp-crumb')));
  await shot(page, "r02-radial-op2");
  for (let i = 0; i < 4; i++) { await page.keyboard.press("+"); await sleep(350); } // spaced: rapid presses do not compound (P3-4)
  await sleep(700); await shot(page, "r02b-radial-zoom");
  await page.keyboard.press("0"); await sleep(500);
  await page.click("#theme"); await sleep(800); await shot(page, "r03-radial-dark"); await page.click("#theme"); await sleep(300);

  // ---------- Galaxy ----------
  await spy(page);
  await page.click('[data-view-tab="galaxy"]');
  await page.waitForSelector('[data-view-host="galaxy"] canvas', { timeout: 15000 });
  await waitEnd(page, 0); await sleep(800);
  let G = await gx(page);
  const n0 = Object.keys(G.pos ?? {}).length;
  ok("Galaxy: 50 placed, no NaN", n0 === 50 && nan(G.pos) === 0, `${n0} placed, NaN ${nan(G.pos)}, ticks ${G.ticks}`);
  const md = minDist(G.pos);
  ok("T7: Galaxy square tiles do not overlap (collide)", md.close === 0, `min centre distance ${md.m.toFixed(1)} (collide radius 28 → 56; tile ${NODE} square); pairs whose 48-unit squares overlap: ${md.close}`);
  await shot(page, "g01-galaxy-light");
  const gTabs = await tabTo(page, '[data-view-host="galaxy"] canvas');
  ok("Galaxy canvas reachable by Tab", gTabs > 0, `${gTabs} Tab presses`);
  const title = () => txt(page, '[data-view-host="galaxy"] .gx-title');
  const want = nearest(G.pos, centreOf(G.pos), null);
  await page.keyboard.press("Enter"); await sleep(500);
  let t = await title();
  ok("T7: Enter picks the reference nearest the centre", titleToId(t) === want, `got ${t}; want ${refs().find((r) => r.id === want)?.title}`);
  for (const [k, d] of [["ArrowRight", [1, 0]], ["ArrowDown", [0, 1]], ["ArrowLeft", [-1, 0]], ["ArrowUp", [0, -1]]]) {
    const cur = titleToId(await title());
    const exp = nearest(G.pos, G.pos[cur], d, cur);
    await page.keyboard.press(k); await sleep(400);
    const got = titleToId(await title());
    ok(`T7: ${k} moves in its ±45° cone`, got === (exp ?? cur), `from ${cur} want ${exp ?? "(stay)"} got ${got}`);
  }
  await shot(page, "g02-galaxy-selected");
  ok("Galaxy inspector neighbours with plain-words reasons", null, one(await txt(page, '[data-view-host="galaxy"] .gx-insp')).slice(0, 240));
  const selTitle = await title();
  await page.keyboard.press("Enter"); await sleep(700);
  ok("T7: Enter on a selection opens it in the Reference view", (await view(page)) === "reference" && (await txt(page, '[data-level="ref"] [data-v]')).includes(selTitle), `${await view(page)}; ${await txt(page, '[data-level="ref"] [data-v]')}`);

  // ---------- Review Focus 3: data changes while the Galaxy is open ----------
  await page.click('[data-view-tab="galaxy"]'); await sleep(600);
  ok("back in Galaxy: selection kept across view switch", (await title()) === selTitle, await title());
  await page.locator('[data-view-host="galaxy"] canvas').focus();
  for (let i = 0; i < 3; i++) { await page.keyboard.press("+"); await sleep(350); } // spaced: rapid presses do not compound (P3-4)
  await sleep(600); await shot(page, "g03-zoomed-before-change");
  const cv = page.locator('[data-view-host="galaxy"] canvas');
  const before = await cv.screenshot();
  G = await gx(page); const P0 = G.pos, ends0 = G.ends;
  // (a) visible change: import 3 new images by drop
  const msg = fs.readdirSync(MESSY).filter((f) => f.endsWith(".png")).slice(0, 3).map((f) => path.join(MESSY, f));
  await drop(page, msg); await noticeDone(page); await waitEnd(page, ends0); await sleep(800);
  G = await gx(page);
  const moved = Object.keys(P0).map((id) => Math.hypot(G.pos[id][0] - P0[id][0], G.pos[id][1] - P0[id][1])).sort((a, b) => a - b);
  ok("RF3: import while open — selection kept", (await title()) === selTitle && (await view(page)) === "galaxy", `${await title()}; ${Object.keys(G.pos).length} placed`);
  ok("RF3: warm start — placed refs move little", moved[moved.length >> 1] < NODE, `median move ${moved[moved.length >> 1].toFixed(1)}, max ${moved[moved.length - 1].toFixed(1)} world units`);
  await shot(page, "g04-zoomed-after-import");
  ok("RF3: camera kept (zoomed frame vs before; judged on g03/g04)", null, `frames identical ${before.equals(await cv.screenshot())}`);
  const endsH = (await gx(page)).ends;
  // (c) hidden change: tag the 3 new ones in the Inbox, come back
  await page.click('[data-view-tab="inbox"]'); await sleep(600);
  for (let i = 0; i < 3; i++) {
    if (!(await page.locator(".inbox-dock .picker").count())) break;
    await page.keyboard.press("1"); await page.keyboard.type("chiaro"); await page.keyboard.press("Enter"); await sleep(500); await page.keyboard.press("ArrowRight"); await sleep(250);
  }
  await page.click('[data-view-tab="galaxy"]'); await waitEnd(page, endsH); await sleep(800);
  ok("RF3: hidden change (Inbox tags) — selection kept on return", (await title()) === selTitle, await title());
  await shot(page, "g05-after-hidden-change");
  G = await gx(page);
  // (b) undo while open
  const ends1 = (await gx(page)).ends;
  await page.locator('[data-view-host="galaxy"] canvas').focus();
  await page.keyboard.press("Control+z"); await waitEnd(page, ends1); await sleep(800);
  const undid = (await count(page));
  ok("RF3: Ctrl+Z (tag undo) while open keeps the selection", (await title()) === selTitle, await title());
  await shot(page, "g05b-after-undo");
  ok("Ctrl+Z state after undo", null, `count now ${undid}; notice ${one(await txt(page, "#import-notice [data-body]")).slice(0, 120)}`);
  ok("Galaxy after changes: no NaN, all placed", nan(G.pos) === 0 && Object.keys(G.pos).length === (await count(page)), `${Object.keys(G.pos).length} placed of ${await count(page)}`);

  // ---------- Tree live data change ----------
  await page.click('[data-view-tab="tree"]'); await sleep(800);
  const tc = await crumb();
  await page.keyboard.press("Control+z"); await sleep(800);
  ok("RF3 Tree: undo while open keeps the selection", (await crumb()) === tc, `${one(tc)} → ${one(await crumb())}`);
  await page.keyboard.press("Control+Shift+z"); await sleep(500);

  // ---------- context loss on the Galaxy ----------
  await page.click('[data-view-tab="galaxy"]'); await sleep(600);
  const lost = await page.evaluate(async () => {
    const c = document.querySelector('[data-view-host="galaxy"] canvas');
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    const ext = gl?.getExtension("WEBGL_lose_context");
    if (!ext) return "no ext";
    ext.loseContext(); await new Promise((r) => setTimeout(r, 600));
    const during = document.querySelector('[data-view-host="galaxy"] .graph-fallback')?.textContent ?? null;
    ext.restoreContext(); await new Promise((r) => setTimeout(r, 1200));
    return { during, after: document.querySelector('[data-view-host="galaxy"] .graph-fallback')?.textContent ?? null };
  });
  await shot(page, "g06-after-context-restore");
  ok("RF1: context lost shows the sentence, restore removes it", lost.during === FALLBACK && lost.after === null, JSON.stringify(lost));

  // ---------- library switch: empty library (Review Focus 2) ----------
  await page.click("#library-menu"); dialogQueue.push(EMPTY); await page.click('[data-lib="new"]');
  await page.waitForSelector(".lib-new:not([hidden])", { timeout: 3000 });
  await page.click('.lib-new button[type="submit"]');
  await until(async () => (await count(page)) === 0, 15000); await sleep(1500);
  ok("RF2 Galaxy empty: 'No references yet.'", /No references yet\./.test(await txt(page, '[data-view-host="galaxy"] .gx-insp')) && !(await title()), one(await txt(page, '[data-view-host="galaxy"] .gx-insp')));
  await shot(page, "g07-empty");
  await page.click('[data-view-tab="tree"]'); await sleep(800);
  const zeros = await page.$$eval('[data-view-host="tree"] .insp-sel .count', (c) => c.map((x) => x.textContent));
  ok("RF2 Tree empty: taxonomy with 0 counts, selection cleared by the switch", zeros.length > 0 && zeros.every((z) => z === "0"), `${zeros.join(",")}; crumb ${one(await crumb())}`);
  await shot(page, "t04-tree-empty");
  await page.click('[data-view-tab="galaxy"]'); await sleep(300);
  const e0 = (await gx(page)).ends;
  await drop(page, msg); await noticeDone(page); await waitEnd(page, e0); await sleep(800);
  G = await gx(page);
  ok("RF2 Galaxy untagged only: note + ring, no NaN", /Tag references to see them cluster\./.test(await txt(page, '[data-view-host="galaxy"] .gx-insp')) && nan(G.pos) === 0 && Object.keys(G.pos).length === 3,
    `${one(await txt(page, '[data-view-host="galaxy"] .gx-insp'))}; ${JSON.stringify(G.pos)}`);
  await shot(page, "g08-untagged-ring");
  await page.locator('[data-view-host="galaxy"] canvas').focus(); await page.keyboard.press("Enter"); await sleep(400);
  ok("Galaxy: Enter picks in an untagged-only library", !!(await title()), await title());
  const e2 = (await gx(page)).ends;
  await page.keyboard.press("Control+z"); await sleep(1500);
  ok("RF3: a deleted selection clears (undo the import)", !(await title()) && (await count(page)) === 0, `title ${JSON.stringify(await title())}; count ${await count(page)}; insp ${one(await txt(page, '[data-view-host="galaxy"] .gx-insp'))}`);
  await closeApp(b);

  // ---------- Review Focus 5: missing and broken thumbnails ----------
  const lr = refs();
  const gone = lr[0], bad = lr[1];
  const th = (r) => path.join(LIB, "thumbs", "256", fs.readdirSync(path.join(LIB, "thumbs", "256")).find((f) => f.startsWith(r.hash)));
  fs.rmSync(th(gone)); fs.writeFileSync(th(bad), "");
  ({ b, page } = await launch("thumbs"));
  await page.waitForFunction(() => /references/.test(document.querySelector("#lib-count")?.textContent || ""), null, { timeout: 30000 });
  if ((await count(page)) !== 53) { await page.click("#library-menu"); dialogQueue.push(LIB); await page.click('[data-lib="open"]'); await until(async () => (await count(page)) === 53, 10000); }
  const hits = {};
  page.on("request", (r) => { for (const [k, x] of [["gone", gone], ["bad", bad]]) if (decodeURIComponent(r.url()).includes(x.hash)) hits[k] = (hits[k] || 0) + 1; });
  await spy(page);
  await page.click('[data-view-tab="galaxy"]'); await page.waitForSelector('[data-view-host="galaxy"] canvas', { timeout: 15000 });
  await waitEnd(page, 0); await sleep(1500);
  await page.locator('[data-view-host="galaxy"] canvas').focus();
  await page.keyboard.press("-"); await sleep(400); await page.keyboard.press("+"); await sleep(1500);
  await shot(page, "g09-missing-thumbs");
  ok("RF5: a missing/empty thumbnail is fetched once, not per frame", (hits.gone ?? 0) <= 2 && (hits.bad ?? 0) <= 2, JSON.stringify(hits));
  await closeApp(b);

  // ---------- Review Focus 1: no WebGL at all ----------
  ({ b, page } = await launch("nowebgl", "--disable-3d-apis --disable-webgl"));
  await page.waitForFunction(() => /references/.test(document.querySelector("#lib-count")?.textContent || ""), null, { timeout: 30000 });
  const hasGl = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl"));
  const fb = {};
  for (const v of ["tree", "galaxy", "radial"]) {
    await page.click(`[data-view-tab="${v}"]`); await sleep(1500);
    fb[v] = await txt(page, `[data-view-host="${v}"] .graph-fallback`);
  }
  await shot(page, "x01-nowebgl-radial");
  ok("RF1: no WebGL — each canvas view shows the sentence", !hasGl && Object.values(fb).every((x) => x === FALLBACK), `webgl ${hasGl}; ${JSON.stringify(fb)}`);
  ok("RF1: no WebGL — inspectors still work", /Operations/.test(await txt(page, '[data-view-host="tree"] .insp-body')), one(await txt(page, '[data-view-host="tree"] .insp-body')).slice(0, 100));
  await page.click('[data-view-tab="reference"]'); await sleep(600);
  ok("RF1: no WebGL — Reference view still works", (await view(page)) === "reference" && (await count(page)) > 0 && !!(await txt(page, '[data-level="ref"] [data-v]')), await txt(page, '[data-level="ref"] [data-v]'));
  await closeApp(b);

  ok("console errors (triage: thumbnail 404s expected in RF5 run)", consoleErr.length === 0, consoleErr.slice(0, 8).join(" || "));
  ok("zero external network requests", external.length === 0, external.slice(0, 5).join(", "));
  fs.writeFileSync(path.join(W, "results3.json"), JSON.stringify(R, null, 1));
  done(0);
})().catch((e) => {
  console.error("ABORT", e);
  fs.writeFileSync(path.join(W, "results3.json"), JSON.stringify([...R, { name: "ABORT", pass: false, detail: e.stack }], null, 1));
  try { proc?.kill(); } catch {}
  done(1);
});
function done(code) {
  fs.rmSync(CONFIG, { recursive: true, force: true });
  if (fs.existsSync(CONFIG_BAK)) fs.cpSync(CONFIG_BAK, CONFIG, { recursive: true });
  process.exit(code);
}
