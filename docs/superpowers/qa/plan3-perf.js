// Task 11 Step 3: the speed check on the real release perf build, over WebView2 CDP (port 9335).
// node docs/superpowers/qa/plan3-perf.js <work dir outside the repo>; <work dir>/perf2500 comes from
// `python -I scripts/make_perf_library.py <work dir>/perf2500 --n 2500 --seed 7`. Needs the perf build:
// `VITE_PERF=1 npm run tauri build -- --features perf --no-bundle`. It refuses to run if %APPDATA%/art.horus.app
// exists, and deletes that folder afterwards. Delete the test library (<work dir>/perf-lib) by hand.
// The pan and zoom points are page coordinates read off the fitted screenshots at 1280x800.
const { chromium } = require(process.env.APPDATA + "/npm/node_modules/playwright");
const { spawn, execSync } = require("child_process");
const fs = require("fs"), path = require("path");

const REPO = path.resolve(__dirname, "../../..");
const EXE = process.env.HORUS_EXE || path.join(REPO, "app/src-tauri/target/release/horus.exe"); // HORUS_EXE: a build in another CARGO_TARGET_DIR
const W = process.argv[2];
const DEMO = path.join(W, "perf2500"), LIB = path.join(W, "perf-lib"), SHOTS = path.join(W, "shots");
const CONFIG = path.join(process.env.APPDATA, "art.horus.app");
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const log = (k, v) => { out[k] = v; console.log(k, "::", typeof v === "string" ? v : JSON.stringify(v)); };

if (fs.existsSync(CONFIG)) throw new Error("art.horus.app exists: refusing to touch it");
fs.rmSync(LIB, { recursive: true, force: true }); fs.mkdirSync(LIB, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

// Busiest operation and technique, from the manifest.
const man = JSON.parse(fs.readFileSync(path.join(DEMO, "manifest.json"), "utf8"));
const tax = JSON.parse(fs.readFileSync(path.join(REPO, "app/src-tauri/resources/taxonomy.json"), "utf8"));
const byOp = {}, byTech = {};
for (const e of man) {
  for (const op of new Set(e.suggestedTechniques.map((s) => s.operation))) byOp[op] = (byOp[op] || 0) + 1;
  for (const s of e.suggestedTechniques) { const k = `${s.operation}|${s.domain}|${s.technique}`; byTech[k] = (byTech[k] || 0) + 1; }
}
const busyOpName = Object.entries(byOp).sort((a, b) => b[1] - a[1])[0];
const busyOp = tax.operations.find((o) => o.name === busyOpName[0]);
const techTotals = {};
for (const e of man) for (const t of new Set(e.suggestedTechniques.map((s) => s.technique))) techTotals[t] = (techTotals[t] || 0) + 1;
const busyTechName = Object.entries(techTotals).sort((a, b) => b[1] - a[1])[0];
const busyTech = tax.techniques.find((t) => t.name === busyTechName[0]);
// The busiest branch for that technique.
const brCounts = {};
for (const [k, n] of Object.entries(byTech)) { const [op, dom, t] = k.split("|"); if (t === busyTech.name) brCounts[`${op}|${dom}`] = n; }
const [bop, bdom] = Object.entries(brCounts).sort((a, b) => b[1] - a[1])[0][0].split("|");
const techOp = tax.operations.find((o) => o.name === bop), techDom = tax.domains.find((d) => d.name === bdom);
log("busiest", { op: busyOpName, tech: busyTechName, branch: `${techOp.id}.${techDom.id}` });

let proc;
async function launch() {
  proc = spawn(EXE, [], { env: { ...process.env, HORUS_DEMO_DIR: DEMO, WEBVIEW2_USER_DATA_FOLDER: path.join(W, "wv2"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: "ignore" });
  let b;
  for (let i = 0; i < 60 && !b; i++) { try { b = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await sleep(500); } }
  const ctx = b.contexts()[0];
  let page;
  for (let i = 0; i < 40 && !page; i++) { page = ctx.pages().find((x) => x.url().includes("tauri.localhost")); if (!page) await sleep(250); }
  await page.route(/ipc\.localhost\/plugin%3Adialog%7Copen/, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Tauri-Response", "Tauri-Response": "ok" }, body: JSON.stringify(LIB) }));
  page.on("pageerror", (e) => log("pageerror", e.message));
  return { b, page };
}
async function closeApp(b) {
  try { execSync(`powershell -NoProfile -Command "(Get-Process -Id ${proc.pid}).CloseMainWindow() | Out-Null"`); } catch {}
  for (let i = 0; i < 300 && proc.exitCode === null; i++) await sleep(100);
  if (proc.exitCode === null) try { proc.kill(); } catch {}
  try { await b.close(); } catch {}
}
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + ".png") }).catch(() => {});
const perf = (page, v) => page.evaluate((v) => { const s = globalThis.__horusPerf?.[v]; return s && { fps: +s.fps.toFixed(1), minFps: +s.minFps.toFixed(1), tex: s.tex, maxTex: s.maxTex }; }, v);
const reset = (page, v) => page.evaluate((v) => globalThis.__horusPerf?.[v]?.reset(), v);
const box = async (page, v) => page.locator(`[data-view-host="${v}"] canvas`).first().boundingBox();

// Main-thread health: long tasks and the worst gap between animation frames.
const watch = (page) => page.evaluate(() => {
  const w = (window.__watch = { long: [], maxGap: 0, last: performance.now(), on: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) w.long.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: false });
  const f = (t) => { if (!w.on) return; w.maxGap = Math.max(w.maxGap, t - w.last); w.last = t; requestAnimationFrame(f); };
  requestAnimationFrame(f);
});
const watchReset = (page) => page.evaluate(() => { const w = window.__watch; w.long = []; w.maxGap = 0; w.last = performance.now(); });
const watchRead = (page) => page.evaluate(() => { const w = window.__watch; return { longTasks: w.long.length, longestMs: Math.max(0, ...w.long), maxFrameGapMs: Math.round(w.maxGap) }; });


// A 3 s circular drag from a page point on content: pans the camera continuously.
async function panFor(page, pt, ms = 3000) {
  const [cx, cy] = pt;
  await page.mouse.move(cx, cy); await page.mouse.down();
  const t0 = Date.now(); let i = 0;
  while (Date.now() - t0 < ms) {
    const a = i++ * 0.12;
    await page.mouse.move(cx + 150 * Math.sin(a) + 6, cy + 100 * (1 - Math.cos(a)) + 6);
    await sleep(8);
  }
  await page.mouse.move(cx, cy, { steps: 5 }); // back to the press point: the camera ends where it began
  await page.mouse.up();
}
async function measurePan(page, v, label, pt) {
  await sleep(1200); // let loads triggered by the last zoom settle
  await reset(page, v); await watchReset(page);
  await panFor(page, pt);
  await sleep(600); // one more overlay window, so the numbers include the end of the pan
  const p = await perf(page, v), w = await watchRead(page);
  log(label, { ...p, ...w });
  await shot(page, label);
  return p;
}
// One wheel notch (x1.16) at a page point.
async function notch(page, v, pt, dy = -100) {
  await page.mouse.move(pt[0], pt[1]); await page.mouse.wheel(0, dy); await sleep(650);
  return perf(page, v);
}
// Zooms in at pt by n notches (14 notches is about x8; at 1280x800 the Galaxy and Tree then draw thumbnails).
async function zoomIn(page, v, pt, n = 14) { for (let i = 0; i < n; i++) await notch(page, v, pt); }
const fit = async (page, v) => { await page.locator(`[data-view-host="${v}"] canvas`).first().focus(); await page.keyboard.press("0"); await sleep(1500); };
async function farZoom(page, v, pt, label) {
  await page.mouse.move(pt[0], pt[1]);
  for (let i = 0; i < 30; i++) { await page.mouse.wheel(0, 300); await sleep(40); }
  await sleep(1200);
  log(label, await perf(page, v));
  await shot(page, label);
}

(async () => {
  const { b, page } = await launch();
  try {
    await page.waitForSelector(".firstrun", { timeout: 30000 });
    let picked = false;
    await sleep(1500); // the first-run buttons bind after the page shows
    for (let i = 0; i < 4 && !picked; i++) {
      await page.click('[data-pick="create"]');
      try { await page.waitForFunction(() => /New library in/.test(document.querySelector(".firstrun")?.textContent || ""), null, { timeout: 8000 }); picked = true; } catch {}
    }
    log("first run picked", picked);
    if (await page.locator('[data-fs="off"]').count()) await page.click('[data-fs="off"]');
    await page.waitForSelector("#fr-go:not([disabled])", { timeout: 15000 });
    const demoOn = await page.evaluate(() => [...document.querySelectorAll(".firstrun input, .firstrun button")].map((x) => `${x.id || x.className}:${x.type === "checkbox" || x.type === "radio" ? x.checked : x.textContent.trim().slice(0, 30)}`));
    log("first run controls", demoOn);
    const s0 = Date.now();
    await page.click("#fr-go");
    await page.waitForSelector(".firstrun", { state: "detached", timeout: 1800000 });
    log("seed 2,500 (Start with the demo set) s", ((Date.now() - s0) / 1000).toFixed(1));
    await sleep(1500);
    log("library count", await page.locator("#lib-count").first().innerText());
    log("window", await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })));

    // ---------- Galaxy ----------
    await page.evaluate(() => {
      const Base = window.Worker;
      window.__gx = { t0: 0, first: 0, end: 0, ticks: 0 };
      window.Worker = class extends Base {
        constructor(...a) { super(...a); this.addEventListener("message", (ev) => { const g = window.__gx; if (ev.data.type === "tick") { g.ticks++; if (!g.first) g.first = performance.now(); } else if (!g.end) g.end = performance.now(); }); }
      };
    });
    await watch(page);
    await page.evaluate(() => { window.__gx.t0 = performance.now(); });
    await page.click('[data-view-tab="galaxy"]');
    await page.waitForFunction(() => window.__gx.end, null, { timeout: 60000, polling: 50 });
    const g = await page.evaluate(() => window.__gx);
    const health = await watchRead(page);
    log("Galaxy first layout", { firstTickMs: Math.round(g.first - g.t0), settledMs: Math.round(g.end - g.t0), ticks: g.ticks, ...health });

    await sleep(800); await shot(page, "g0-galaxy-fit");
    log("galaxy canvas", await box(page, "galaxy"));
    const G = [400, 400]; // the main cluster (fitted screenshot)
    await fit(page, "galaxy");
    log("Galaxy fitted (min fps since the tab click)", await perf(page, "galaxy"));
    await measurePan(page, "galaxy", "Galaxy pan fitted", G);
    // Notch 6: past the cap (600 thumbnails, the rest dots). Notch 13: zoomed in.
    for (let i = 1; i <= 13; i++) { await notch(page, "galaxy", G); if (i === 6) await measurePan(page, "galaxy", "Galaxy pan at notch 6", G); }
    await measurePan(page, "galaxy", "Galaxy pan zoomed in", G);
    await fit(page, "galaxy");
    await farZoom(page, "galaxy", G, "Galaxy far zoom");

    // ---------- Tree, busiest technique ----------
    await page.click('[data-view-tab="tree"]');
    await page.waitForSelector('[data-view-host="tree"] canvas', { timeout: 15000 }); await sleep(1500);
    const sel = (id) => page.click(`[data-view-host="tree"] [data-sel="${id}"]`).then(() => sleep(700));
    await sel(`op:${techOp.id}`); await sel(`br:${techOp.id}.${techDom.id}`); await sel(`tech:${busyTech.id}`);
    log("Tree crumb", (await page.locator('[data-view-host="tree"] .insp-crumb').first().innerText()).replace(/\s+/g, " "));
    await fit(page, "tree"); await shot(page, "t0-tree-tech");
    const T = [397, 430]; // the references column (fitted screenshot)
    await measurePan(page, "tree", "Tree busiest technique pan fitted", T);
    await fit(page, "tree");
    await zoomIn(page, "tree", T);
    await measurePan(page, "tree", "Tree busiest technique pan zoomed", T);
    await fit(page, "tree");
    await farZoom(page, "tree", T, "Tree busiest technique far zoom");
    await page.click('[data-view-host="tree"] .tree-all'); await sleep(2000);
    log("Show all pressed", await page.locator('[data-view-host="tree"] .tree-all').getAttribute("aria-pressed"));
    await fit(page, "tree"); await shot(page, "t1-tree-all");
    const TA = [492, 430]; // the middle column with Show all on
    await measurePan(page, "tree", "Tree show all pan fitted", TA);
    await fit(page, "tree");
    await zoomIn(page, "tree", TA);
    await measurePan(page, "tree", "Tree show all pan zoomed", TA);
    await fit(page, "tree");
    await farZoom(page, "tree", TA, "Tree far zoom");
    await page.click('[data-view-host="tree"] .tree-all'); await sleep(800);

    // ---------- Radial, busiest operation ----------
    await page.click('[data-view-tab="radial"]');
    await page.waitForSelector('[data-view-host="radial"] canvas', { timeout: 15000 }); await sleep(1200);
    await page.click(`[data-view-host="radial"] .radial-op[data-op="${busyOp.id}"]`); await sleep(1500);
    await fit(page, "radial"); await shot(page, "r0-radial");
    const R = [470, 428]; // the wheel (fitted screenshot)
    await measurePan(page, "radial", "Radial busiest operation pan fitted", R);
    await fit(page, "radial");
    const RZ = [470, 170]; // the top of ring 3's rows (fitted screenshot)
    await zoomIn(page, "radial", RZ);
    await measurePan(page, "radial", "Radial busiest operation pan zoomed", RZ);
  } catch (e) {
    log("ERROR", String(e && e.stack || e));
    await shot(page, "error");
  } finally {
    await closeApp(b);
    fs.rmSync(CONFIG, { recursive: true, force: true }); // absent before this run (QA's ask)
    fs.writeFileSync(path.join(W, "perf-results.json"), JSON.stringify(out, null, 1));
  }
})();
