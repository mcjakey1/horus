// Plan 3 full QA (Phase 2: T1-T11 + the final-review fix wave) as Mara (QA-PERSONA.md), on the real
// release horus.exe over WebView2 CDP. Covers what jsdom can't: taxonomy editing (T10) clicks and
// focus, Review Focus 4 (one undo step restores everything), ae N3, and the fix-wave "QA focus"
// scene behaviour (label threshold, clip, rows, camera reveal, +/- compounding, Enter, crumb).
// Run: node mara-plan3.js <work dir outside the repo> [exe]. Needs <work dir>/fx from mkfx.py.
// With a perf exe and HORUS_DEMO_DIR set, run with BIG=1 for the 2,500-reference checks only.
// Release builds expose no test hooks: the harness reads the Pixi scene through Pixi's own
// devtools hook (globalThis.__PIXI_APP_INIT__), read-only.
const { chromium } = require(process.env.APPDATA + "/npm/node_modules/playwright");
const { spawn, execSync } = require("child_process");
const fs = require("fs"), path = require("path");

const REPO = path.resolve(__dirname, "../../..");
const W = process.argv[2]; if (!W) throw new Error("usage: node mara-plan3.js <work dir> [exe]");
const EXE = process.argv[3] || path.join(REPO, "app/src-tauri/target/release/horus.exe");
const BIG = !!process.env.BIG, EXTRA = !!process.env.EXTRA;
const FX = path.join(W, "fx"), LIB = path.join(FX, BIG ? "Mara big é" : EXTRA ? "Mara extra é" : "Mara edit é"), FRIDAY = path.join(FX, "Friday batch é");
const SHOTS = path.join(W, BIG ? "shots-big" : EXTRA ? "shots-extra" : "shots-p2");
const CONFIG = path.join(process.env.APPDATA, "art.horus.app");
const PORT = 9334, THRESH = 8 / 13;

const R = [], external = [], dialogQueue = [], consoleErr = [], ipcLog = [];
const ok = (name, pass, detail = "") => { R.push({ name, pass, detail: String(detail) }); console.log(pass === null ? "NOTE" : pass ? "PASS" : "FAIL", name, "::", detail); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const lib = () => readJson(path.join(LIB, "library.json"));
const tax = () => readJson(path.join(LIB, "taxonomy.json"));
async function until(fn, ms = 5000, step = 50) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return { v, ms: Date.now() - t0 }; if (Date.now() - t0 > ms) return { v: null, ms: Date.now() - t0 }; await sleep(step); }
}
if (fs.existsSync(CONFIG)) throw new Error("art.horus.app exists: refusing to touch it");
fs.rmSync(LIB, { recursive: true, force: true }); fs.mkdirSync(LIB, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

let proc;
async function launch(tag) {
  proc = spawn(EXE, [], { env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: path.join(W, "wv2"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: "ignore" });
  let b;
  for (let i = 0; i < 60 && !b; i++) { try { b = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await sleep(500); } }
  const ctx = b.contexts()[0];
  let page;
  for (let i = 0; i < 40 && !page; i++) { page = ctx.pages().find((x) => x.url().includes("tauri.localhost")); if (!page) await sleep(250); }
  await page.route(/ipc\.localhost\/plugin%3Adialog%7Copen/, (route) => {
    const v = dialogQueue.length ? dialogQueue.shift() : null;
    route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Tauri-Response", "Tauri-Response": "ok" }, body: JSON.stringify(v) });
  });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname === "ipc.localhost" && r.method() === "POST") ipcLog.push(decodeURIComponent(u.pathname.slice(1)));
    if (!/(^|\.)localhost$/.test(u.hostname) && !["data:", "blob:"].includes(u.protocol)) external.push(r.url());
  });
  page.on("console", (m) => { if (m.type() === "error") consoleErr.push(`${tag}: ${m.text()}`); });
  page.on("pageerror", (e) => ok(`page error (${tag})`, false, e.message));
  page.setDefaultTimeout(8000); P = page;
  return { b, page };
}
let P;
async function closeApp(b) {
  try { execSync(`powershell -NoProfile -Command "(Get-Process -Id ${proc.pid}).CloseMainWindow() | Out-Null"`); } catch {}
  await until(() => proc.exitCode !== null, 30000, 100);
  if (proc.exitCode === null) try { proc.kill(); } catch {}
  try { await b.close(); } catch {}
}
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + ".png") }).catch(() => {});
const txt = (page, s) => page.locator(s).first().innerText().catch(() => "");
const one = (s) => String(s).replace(/\s*\n+\s*/g, " | ");
const count = async (page) => Number((await txt(page, "#lib-count")).replace(/,/g, "").match(/\d+/)?.[0] ?? -1);
const drop = (page, paths) => page.evaluate((paths) => window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://drag-drop", payload: { paths, position: { x: 5, y: 5 } } }), paths);
const noticeDone = (page, ms = 60000) => page.waitForFunction(() => { const t = document.querySelector("#import-notice [data-body]")?.textContent || ""; return t && !/Importing|Adding/.test(t); }, null, { timeout: ms });
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.className ? "." + String(a.className).split(" ")[0] : ""}` : "none"; });
const H = (v) => `[data-view-host="${v}"]`;
const crumb = (page, v = "tree") => txt(page, `${H(v)} .insp-crumb`).then(one);
const insp = (page, v = "tree") => txt(page, `${H(v)} .insp`).then(one);
const step = async (page, ms = 350) => sleep(ms);
// A JSON file written by the debounced saver: wait until pred holds.
const saved = (pred, ms = 6000) => until(() => { try { return pred(); } catch { return false; } }, ms, 100);

// ---------- Pixi scene probe (read-only) ----------
const hook = (page) => page.evaluate(() => {
  if (window.__apps) return;
  window.__apps = [];
  globalThis.__PIXI_APP_INIT__ = (app) => window.__apps.push(app);
});
// Camera and every taxonomy label of the view: world boxes, visibility and the row offset.
const probe = (page, v) => page.evaluate((v) => {
  const app = window.__apps.find((a) => a.canvas.isConnected && a.canvas.closest(`[data-view-host="${v}"]`));
  if (!app) return null;
  const world = app.stage.children[0], layer = world.children[1], marks = world.children[2];
  const r = app.canvas.getBoundingClientRect();
  const nodes = [];
  for (const root of layer.children) {
    const [a, b] = root.children;
    if (a && a.text !== undefined) { // a "label" node
      nodes.push({ kind: "label", x: root.x, y: root.y, text: a.text, on: root.visible && a.visible, w: a.width, h: a.height, bx: root.x - a.width / 2, by: root.y });
      continue;
    }
    const body = b; if (!body) continue;
    const t = body.children.find((c) => c.text !== undefined);
    const size = body.children[0]?.width ?? 0;
    const n = { x: root.x, y: root.y, size, shown: root.visible, body: body.visible };
    if (t) Object.assign(n, { kind: "tax", text: t.text, on: root.visible && body.visible && t.visible, w: t.width, h: t.height, bx: root.x + t.x - t.width / 2, by: root.y + t.y, dy: t.y });
    else n.kind = "ref";
    nodes.push(n);
  }
  const mb = marks.getBounds();
  return { s: world.scale.x, px: world.position.x, py: world.position.y, cw: r.width, ch: r.height, cl: r.left, ct: r.top, nodes,
    ring: mb.width > 0 ? { x: mb.x, y: mb.y, w: mb.width, h: mb.height } : null };
}, v);
const scr = (p, x, y) => [p.cl + p.px + x * p.s, p.ct + p.py + y * p.s]; // world point to page px
const labels = (p) => p.nodes.filter((n) => n.kind === "tax");
function overlaps(ls, pad = 0) {
  const hits = [];
  for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) {
    const a = ls[i], b = ls[j];
    const ox = Math.min(a.bx + a.w, b.bx + b.w) - Math.max(a.bx, b.bx), oy = Math.min(a.by + a.h, b.by + b.h) - Math.max(a.by, b.by);
    if (ox > pad && oy > pad) hits.push(`${a.text} / ${b.text}`);
  }
  return hits;
}
const visibleLabels = (p) => labels(p).filter((n) => n.on).length;
const canvasFocus = (page, v) => page.locator(`${H(v)} canvas`).focus();
const sel = (page, id, v = "tree") => page.click(`${H(v)} .insp [data-sel="${id}"]`).then(() => sleep(350));
// Selects an id by walking the inspector from the top (nothing selected).
const noticeText = (page) => page.evaluate(() => { const n = document.querySelector("#import-notice"); return n && !n.hidden ? n.innerText.split(String.fromCharCode(10)).map((x) => x.trim()).filter(Boolean).join(" | ") : ""; });
const dismiss = (page) => page.locator('#import-notice button:has-text("Dismiss"), #import-notice [data-dismiss]').first().click({ timeout: 800 }).catch(() => {});
// Is the control under the toast? (elementFromPoint at its centre)
const covered = (page, s) => page.evaluate((s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return top && !e.contains(top) ? (top.closest("[id]")?.id || top.className) : ""; }, s);
async function path3(page, ids) { await dismiss(page); await canvasFocus(page, "tree"); await page.keyboard.press("Escape"); await sleep(250); for (const id of ids) await sel(page, id); }
const undo = async (page) => { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press("Control+z"); await sleep(400); };
const redo = async (page) => { await page.evaluate(() => document.activeElement?.blur?.()); await page.keyboard.press("Control+Shift+z"); await sleep(400); };
const node = (p, text, kind = "tax") => p.nodes.filter((n) => n.kind === kind && n.text === text);
const tagsOf = (L) => JSON.stringify((L?.references ?? []).map((r) => [r.id, r.tags]));
const taxKey = (T) => JSON.stringify(T);

(async () => {
  let { b, page } = await launch("main");
  await page.waitForSelector(".firstrun", { timeout: 20000 });
  let picked = false;
  for (let i = 0; i < 10 && !picked; i++) {
    dialogQueue.length = 0; dialogQueue.push(LIB); await page.click('[data-pick="create"]');
    picked = !!(await until(() => page.evaluate(() => /New library in/.test(document.querySelector(".firstrun")?.textContent || "")), 1500)).v;
  }
  ok("setup: first-run create picked", picked);
  if (await page.locator('[data-fs="off"]').count()) await page.click('[data-fs="off"]');
  await page.waitForSelector("#fr-go:not([disabled])", { timeout: 15000 });
  await page.click("#fr-go");
  await page.waitForSelector(".firstrun", { state: "detached", timeout: 600000 }); await sleep(1000);
  const N0 = await count(page);
  ok("setup: demo library", BIG ? N0 >= 2000 : N0 === 50, `${N0} refs; window ${await page.evaluate(() => `${innerWidth}x${innerHeight} dpr ${devicePixelRatio}`)}`);
  await hook(page);
  if (BIG) return big(page, b);
  if (EXTRA) return extra(page, b);

  // ========== Enter starts a selection (fix wave I3) ==========
  await page.click(`[data-view-tab="tree"]`);
  await page.waitForSelector(`${H("tree")} canvas`, { timeout: 15000 }); await sleep(1500);
  let p = await probe(page, "tree");
  ok("probe: Pixi scene readable through the devtools hook", !!p && p.nodes.length > 0, p ? `${p.nodes.length} nodes, scale ${p.s.toFixed(3)}` : "no app");
  const fitS = p.s;
  ok("Tree at fit: scale below the label threshold, names hidden (J2 deferred)", p.s < THRESH && visibleLabels(p) === 0, `scale ${p.s.toFixed(3)}; ${visibleLabels(p)} labels on; ${labels(p).length} taxonomy nodes`);
  await shot(page, "a01-tree-fit");
  await canvasFocus(page, "tree");
  const c0 = await crumb(page);
  await page.keyboard.press("Enter"); await sleep(400);
  const c1 = await crumb(page);
  ok("Tree: Enter with nothing selected selects the first operation; crumb updates", c1 !== c0 && /Differentiate/i.test(c1), `${c0} -> ${c1}`);
  await page.keyboard.press("Enter"); await sleep(400);
  ok("Tree: a second Enter is the scene's (selection kept, no error)", /Differentiate/i.test(await crumb(page)), await crumb(page));
  await page.keyboard.press("ArrowDown"); await sleep(350);
  const c2 = await crumb(page);
  ok("Tree: ↓ from the canvas walks into the operation", c2 !== c1, c2);

  // ========== Labels: threshold, rows, clip, overlap (fix wave I1) ==========
  p = await probe(page, "tree");
  const ls = labels(p);
  const long = ls.filter((n) => n.text.length > 25 || (n.text.length === 25 && !n.text.endsWith("…")));
  ok("Tree labels: no name longer than 24 chars + …", long.length === 0, long.map((n) => n.text).join("; ") || `${ls.length} labels, longest ${Math.max(...ls.map((n) => n.text.length))} chars`);
  const rows = {};
  for (const n of ls) (rows[Math.round(n.y)] ??= new Set()).add(Math.round(n.dy));
  ok("Tree labels: staggered on 3 rows per band", Object.values(rows).every((s) => s.size <= 3) && Object.values(rows).some((s) => s.size === 3), JSON.stringify(Object.fromEntries(Object.entries(rows).map(([y, s]) => [y, [...s].sort((a, b) => a - b)]))));
  const ov = overlaps(ls);
  ok("Tree labels: no two taxonomy names overlap (real Source Serif 4 widths)", ov.length === 0, ov.length ? `${ov.length}: ${ov.slice(0, 6).join("; ")}` : `${ls.length} labels checked`);
  // Toggle: sample every frame while wheeling across the threshold and back.
  await page.evaluate(() => {
    const w = (window.__lab = { s: [], on: true });
    const f = () => {
      if (!w.on) return;
      const app = window.__apps.find((a) => a.canvas.isConnected && a.canvas.closest('[data-view-host="tree"]'));
      const world = app.stage.children[0];
      let vis = 0;
      for (const root of world.children[1].children) { const body = root.children[1]; const t = body?.children?.find((c) => c.text !== undefined); if (t && root.visible && body.visible && t.visible) vis++; }
      w.s.push([world.scale.x, vis]);
      requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  });
  const box = await page.locator(`${H("tree")} canvas`).boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 26; i++) { await page.mouse.wheel(0, -40); await sleep(60); }
  for (let i = 0; i < 26; i++) { await page.mouse.wheel(0, 40); await sleep(60); }
  for (const k of ["+", "+", "+", "-", "-", "-"]) { await page.keyboard.press(k); await sleep(400); }
  const lab = await page.evaluate(() => { window.__lab.on = false; return window.__lab.s; });
  let flips = 0, crosses = 0, wrong = 0;
  for (let i = 1; i < lab.length; i++) {
    if ((lab[i][1] > 0) !== (lab[i - 1][1] > 0)) flips++;
    if ((lab[i][0] >= THRESH) !== (lab[i - 1][0] >= THRESH)) crosses++;
  }
  for (const [s, v] of lab) if ((v > 0) !== (s >= THRESH) && Math.abs(s - THRESH) > 0.002) wrong++;
  ok("Label toggle: names switch exactly at the threshold crossings, no flicker", flips === crosses && wrong === 0 && crosses > 0,
    `${lab.length} frames; scale ${Math.min(...lab.map((x) => x[0])).toFixed(3)}..${Math.max(...lab.map((x) => x[0])).toFixed(3)}; ${crosses} crossings, ${flips} visibility flips, ${wrong} frames on the wrong side`);
  await canvasFocus(page, "tree"); await page.keyboard.press("0"); await sleep(600);

  // ========== +/- compounding (P3-4 / M1) ==========
  await page.keyboard.press("Escape"); await sleep(200);
  p = await probe(page, "tree"); const s0 = p.s;
  for (let i = 0; i < 6; i++) await page.keyboard.press("+");
  await sleep(700);
  p = await probe(page, "tree");
  const want = Math.min(4, s0 * 1.25 ** 6);
  ok("P3-4: six + at 0 ms compound to 1.25^6 (capped at 4)", Math.abs(p.s / want - 1) < 0.01, `fit ${s0.toFixed(3)} -> ${p.s.toFixed(3)}, want ${want.toFixed(3)}`);
  const px0 = p.px;
  for (let i = 0; i < 6; i++) await page.keyboard.press("ArrowRight");
  await sleep(700);
  p = await probe(page, "tree");
  ok("P3-4: six fast → pans with nothing selected compound (6 × 60 px)", Math.abs((px0 - p.px) - 360) < 2, `moved ${(px0 - p.px).toFixed(1)} px`);
  // Wheel mid-tween: the wheel wins, no snap back to the key's target.
  const sA = p.s;
  await page.keyboard.press("+"); await sleep(60);
  await page.mouse.wheel(0, 300); await sleep(40);
  const sMid = (await probe(page, "tree")).s;
  await sleep(600);
  p = await probe(page, "tree");
  ok("Wheel mid-tween: no snap back to the key's target", Math.abs(p.s - sMid) < 0.002 && Math.abs(p.s - sA * 1.25) > 0.05, `before ${sA.toFixed(3)}, key target ${(sA * 1.25).toFixed(3)}, after wheel ${sMid.toFixed(3)}, 600 ms later ${p.s.toFixed(3)}`);
  await canvasFocus(page, "tree");
  await page.keyboard.press("ArrowLeft"); await sleep(40);
  await page.mouse.move(box.x + 300, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 380, box.y + 330, { steps: 4 }); await page.mouse.up();
  const dMid = await probe(page, "tree"); await sleep(600);
  p = await probe(page, "tree");
  ok("Drag mid-tween: no snap back to the key's target", Math.abs(p.px - dMid.px) < 1 && Math.abs(p.py - dMid.py) < 1, `after drag (${dMid.px.toFixed(0)},${dMid.py.toFixed(0)}), 600 ms later (${p.px.toFixed(0)},${p.py.toFixed(0)})`);
  await canvasFocus(page, "tree"); await page.keyboard.press("0"); await sleep(600);

  // ========== Camera follows a new selection, once; never on click (I6) ==========
  await path3(page, ["op:differentiate"]);
  await canvasFocus(page, "tree");
  for (let i = 0; i < 9; i++) { await page.keyboard.press("+"); await sleep(30); }
  await sleep(700);
  await page.keyboard.press("ArrowDown"); await sleep(400); await page.keyboard.press("ArrowDown"); await sleep(400); // a technique
  let pans = 0, inside = 0, offAfter = 0, steps = 0, last = await probe(page, "tree");
  for (let i = 0; i < 14; i++) {
    const before = await probe(page, "tree");
    const ringIn = (q) => q.ring && q.ring.x >= q.cl - 1 && q.ring.x + q.ring.w <= q.cl + q.cw + 1 && q.ring.y >= q.ct - 1 && q.ring.y + q.ring.h <= q.ct + q.ch + 1;
    await page.keyboard.press("ArrowRight"); await sleep(450);
    const q = await probe(page, "tree");
    steps++;
    const moved = Math.hypot(q.px - before.px, q.py - before.py) > 0.5;
    if (moved) pans++;
    if (ringIn(q)) inside++; else offAfter++;
    last = q;
  }
  ok("Camera: walking past the edge keeps the selection on screen (pans only when needed)", offAfter === 0 && pans > 0 && pans < steps, `${steps} → steps, ${pans} pans, selection on screen after ${inside}/${steps}`);
  await shot(page, "a02-walk-reveal");
  // A click on an on-screen node never pans.
  p = await probe(page, "tree");
  const onScreen = labels(p).filter((n) => { const [x, y] = scr(p, n.x, n.y); return x > p.cl + 60 && x < p.cl + p.cw - 60 && y > p.ct + 60 && y < p.ct + p.ch - 60; });
  if (onScreen.length) {
    const t = onScreen[0]; const [x, y] = scr(p, t.x, t.y);
    await page.mouse.click(x, y); await sleep(500);
    const q = await probe(page, "tree");
    ok("Camera: a click selects and never pans", Math.hypot(q.px - p.px, q.py - p.py) < 0.5 && (await crumb(page)).length > 0, `clicked ${t.text}; moved ${Math.hypot(q.px - p.px, q.py - p.py).toFixed(1)} px; crumb ${await crumb(page)}`);
  } else ok("Camera: a click selects and never pans", false, "no node on screen to click");
  // Same selection, store change: drag the selection off screen, then edit it; the camera stays.
  await page.mouse.move(box.x + 200, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 200 + 700, box.y + 300, { steps: 8 }); await page.mouse.up(); await sleep(300);
  p = await probe(page, "tree");
  const hasSyn = await page.locator(`${H("tree")} .insp [data-syn-add]`).count();
  if (hasSyn) {
    await page.click(`${H("tree")} .insp [data-syn-add]`);
    await page.keyboard.type("qa-word"); await page.keyboard.press("Enter"); await sleep(900);
    const q = await probe(page, "tree");
    ok("Camera: a store change with the same selection never pans", Math.hypot(q.px - p.px, q.py - p.py) < 0.5, `moved ${Math.hypot(q.px - p.px, q.py - p.py).toFixed(1)} px after a synonym save`);
    await undo(page);
  } else ok("Camera: a store change with the same selection never pans", false, `selection is not a technique: ${await crumb(page)}`);
  // From the inspector's list: a child whose node is off screen is revealed.
  const childBtn = page.locator(`${H("tree")} .insp .insp-used [data-sel]`).first();
  if (await childBtn.count()) {
    p = await probe(page, "tree");
    await childBtn.click(); await sleep(500);
    const q = await probe(page, "tree");
    const ringIn = q.ring && q.ring.x >= q.cl - 1 && q.ring.x + q.ring.w <= q.cl + q.cw + 1 && q.ring.y >= q.ct - 1 && q.ring.y + q.ring.h <= q.ct + q.ch + 1;
    ok("Camera: an inspector pick off screen is brought on screen", ringIn, `moved ${Math.hypot(q.px - p.px, q.py - p.py).toFixed(0)} px; crumb ${await crumb(page)}`);
  }
  // Reduced motion: the reveal jumps.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.mouse.move(box.x + 200, box.y + 300); await page.mouse.down(); await page.mouse.move(box.x + 900, box.y + 300, { steps: 8 }); await page.mouse.up(); await sleep(200);
  await canvasFocus(page, "tree");
  const r0 = await probe(page, "tree");
  await page.keyboard.press("ArrowRight"); await sleep(30);
  const r1 = await probe(page, "tree"); await sleep(400);
  const r2 = await probe(page, "tree");
  ok("Camera reveal under reduced motion jumps (no tween)", Math.hypot(r1.px - r0.px, r1.py - r0.py) > 1 && Math.hypot(r2.px - r1.px, r2.py - r1.py) < 0.5, `30 ms: moved ${Math.hypot(r1.px - r0.px, r1.py - r0.py).toFixed(0)} px; then ${Math.hypot(r2.px - r1.px, r2.py - r1.py).toFixed(1)} px more`);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await canvasFocus(page, "tree"); await page.keyboard.press("0"); await sleep(600);

  // ========== Inspector at 1280x800 (I4) ==========
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:complementary-pairing"]);
  await sleep(400);
  const ins = await page.evaluate(() => {
    const a = document.querySelector('[data-view-host="tree"] .insp'), c = a.querySelector(".insp-crumb");
    const cs = getComputedStyle(a);
    return { win: `${innerWidth}x${innerHeight}`, asideW: Math.round(a.getBoundingClientRect().width), crumbH: Math.round(c.getBoundingClientRect().height), crumbNatural: c.scrollHeight, crumbClipped: c.scrollHeight > c.clientHeight + 1,
      overflowY: cs.overflowY, scrolls: a.scrollHeight > a.clientHeight, sh: a.scrollHeight, chh: a.clientHeight };
  });
  ok("Inspector at 1280x800: crumb never squeezed, aside scrolls as a whole", !ins.crumbClipped && ins.crumbH >= ins.crumbNatural - 1 && /auto|scroll/.test(ins.overflowY), JSON.stringify(ins));
  await shot(page, "a03-inspector-1280x800");
  await page.evaluate(() => document.querySelector('[data-view-host="tree"] .insp').scrollTop = 1e6); await sleep(200);
  await shot(page, "a03b-inspector-scrolled");

  // ========== T10: rename, name taken, blur saves, Reference callouts ==========
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:rim-light"]);
  const rimRef = lib().references.find((r) => r.tags.some((t) => t.techniqueId === "rim-light"));
  await page.click(`${H("tree")} .insp-title .insp-edit`);
  await page.waitForSelector(`${H("tree")} .insp input[data-field="name"]`, { timeout: 3000 });
  await page.fill(`${H("tree")} .insp input[data-field="name"]`, "Silhouette"); await page.keyboard.press("Enter"); await sleep(600);
  const taken = await insp(page);
  ok("T10: a taken name says so, with the owner's name", /That name is taken by Silhouette\./.test(taken), taken.slice(0, 200));
  await page.fill(`${H("tree")} .insp input[data-field="name"]`, "Rim glow"); await page.keyboard.press("Enter");
  const ren = await saved(() => tax().techniques.find((t) => t.id === "rim-light")?.name === "Rim glow");
  ok("T10: rename inline (Enter) saves", !!ren.v, `${ren.ms} ms`);
  ok("T10: after Enter saves, focus leaves the text field (C19)", !/^(input|textarea)/.test(await active(page)), await active(page));
  ok("T10: the Tree label shows the new name", (await probe(page, "tree")).nodes.some((n) => n.text === "Rim glow"));
  if (rimRef) {
    await page.click('[data-view-tab="reference"]');
    await page.fill("#q", rimRef.title);
    const li = page.locator(`#q-results li[data-r="${rimRef.id}"]`);
    await li.waitFor({ timeout: 5000 }).catch(() => {}); await li.click().catch(() => {}); await sleep(700);
    const body = one(await page.locator("main, body").first().innerText());
    ok("T10 step 3.1: the Reference view's callouts show the new name", /Rim glow/.test(body) && !/Rim light/.test(body), body.match(/.{0,60}Rim (glow|light).{0,40}/)?.[0] ?? body.slice(0, 160));
    await shot(page, "a04-reference-renamed");
    await page.click('[data-view-tab="tree"]'); await sleep(800);
  }
  // Blur saves a name (fix I2): type, then click the canvas.
  await path3(page, ["op:differentiate", "br:differentiate.feature"]);
  await page.click(`${H("tree")} .insp-title .insp-edit`);
  await page.fill(`${H("tree")} .insp input[data-field="name"]`, "Feature QA");
  await page.mouse.click(box.x + 40, box.y + box.height - 40);
  const blurSave = await saved(() => tax().domains.find((d) => d.id === "feature")?.name === "Feature QA");
  ok("T10: a blur with a changed name saves it", !!blurSave.v, `${blurSave.ms} ms; domain name ${tax().domains.find((d) => d.id === "feature")?.name}`);
  // Esc cancels.
  await path3(page, ["op:differentiate", "br:differentiate.feature"]);
  await page.click(`${H("tree")} .insp-title .insp-edit`);
  await page.fill(`${H("tree")} .insp input[data-field="name"]`, "Should not save"); await page.keyboard.press("Escape"); await sleep(700);
  ok("T10: Esc cancels a name edit", tax().domains.find((d) => d.id === "feature")?.name === "Feature QA");
  await undo(page); // the blur rename
  ok("Undo: the domain rename reverts", !!(await saved(() => tax().domains.find((d) => d.id === "feature")?.name === "Feature")).v, tax().domains.find((d) => d.id === "feature")?.name);

  // ========== T10: synonyms ==========
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:rim-light"]);
  const syn0 = tax().techniques.find((t) => t.id === "rim-light").synonyms;
  await page.click(`${H("tree")} .insp [data-syn-add]`); await page.keyboard.type("qa-rimword"); await page.keyboard.press("Enter");
  const synA = await saved(() => tax().techniques.find((t) => t.id === "rim-light").synonyms.includes("qa-rimword"));
  await page.click(`${H("tree")} .insp [aria-label="Remove synonym qa-rimword"]`).catch(() => {});
  const synD = await saved(() => !tax().techniques.find((t) => t.id === "rim-light").synonyms.includes("qa-rimword"));
  ok("T10: + synonym adds a chip, × removes it; each saves", !!synA.v && !!synD.v, `before ${JSON.stringify(syn0)} after ${JSON.stringify(tax().techniques.find((t) => t.id === "rim-light").synonyms)}`);

  // ========== T10: definition then a swatch click; seed ink back ==========
  await path3(page, ["op:infer"]);
  const desc0 = tax().operations.find((o) => o.id === "infer").description;
  await page.click(`${H("tree")} .insp textarea[data-field="description"]`);
  await page.keyboard.press("End"); await page.keyboard.type(" QA-edit");
  await page.click(`${H("tree")} .insp .insp-ink[data-ink="rose"]`);
  const both = await saved(() => { const o = tax().operations.find((o) => o.id === "infer"); return o.description.endsWith(" QA-edit") && o.color === "rose"; }, 8000);
  const o1 = tax().operations.find((o) => o.id === "infer");
  ok("T10: edit a definition, then click a swatch: both apply", !!both.v, `description …${o1.description.slice(-20)}; color ${o1.color}`);
  await sleep(500);
  const sw = await page.$$eval(`${H("tree")} .insp .insp-ink`, (b) => b.map((x) => `${x.dataset.ink || "current"}:${x.getAttribute("aria-label")}:${x.getAttribute("aria-pressed")}`));
  ok("T10: ink row = current + seed ink back + free extra inks, named", sw[0].startsWith("current:Rose") && sw.some((x) => x.startsWith("seed:")), sw.join(" "));
  await shot(page, "a05-ink-rose");
  await page.click(`${H("tree")} .insp .insp-ink[data-ink="seed"]`);
  const back = await saved(() => tax().operations.find((o) => o.id === "infer").color == null);
  ok("T10: a seed operation gets its seed ink back", !!back.v, `color ${tax().operations.find((o) => o.id === "infer").color}; swatches ${(await page.$$eval(`${H("tree")} .insp .insp-ink`, (b) => b.map((x) => x.getAttribute("aria-label")))).join(" ")}`);
  await undo(page); await undo(page); await undo(page);
  const u3 = await saved(() => { const o = tax().operations.find((o) => o.id === "infer"); return o.description === desc0 && o.color == null; });
  const o2 = tax().operations.find((o) => o.id === "infer");
  ok("Undo ×3: seed ink, rose and the description revert", !!u3.v, `color ${o2.color}; description restored ${o2.description === desc0}`);

  // ========== T10: typed text survives a store event; thumbnail drag ==========
  await path3(page, ["op:differentiate", "br:differentiate.feature"]);
  await page.click(`${H("tree")} .insp [data-act="add-tech"]`);
  await page.waitForSelector(`${H("tree")} .insp form input[name="name"]`, { timeout: 3000 });
  await page.click(`${H("tree")} .insp form input[name="name"]`);
  await page.keyboard.type("Lens flare QA");
  const n0 = await count(page);
  await drop(page, [path.join(FRIDAY, "friday old ref 0001.jpg")]);
  await until(async () => (await count(page)) > n0, 20000, 200); await sleep(800);
  const kept = await page.evaluate(() => { const i = document.querySelector('[data-view-host="tree"] .insp form input[name="name"]'); return { v: i?.value ?? null, focus: document.activeElement === i }; });
  ok("T10: typed text in an open form survives a store event (an import)", kept.v === "Lens flare QA", `${n0} -> ${await count(page)} refs; value ${JSON.stringify(kept.v)}, focused ${kept.focus}`);
  if (kept.v) {
    await page.keyboard.press("Enter");
    const added = await saved(() => tax().techniques.some((t) => t.name === "Lens flare QA"));
    ok("T10: + Technique… form adds under the fixed branch", !!added.v && tax().branchTechniques.some((l) => l.branchId === "differentiate.feature" && tax().techniques.find((t) => t.id === l.techniqueId)?.name === "Lens flare QA"));
    await undo(page);
    ok("Undo: the new technique goes", !!(await saved(() => !tax().techniques.some((t) => t.name === "Lens flare QA"))).v);
  }
  await undo(page); // the import
  // An open name field survives too.
  await page.click(`${H("tree")} .insp-title .insp-edit`).catch(() => {});
  await page.fill(`${H("tree")} .insp input[data-field="name"]`, "Typing in progress").catch(() => {});
  const n1 = await count(page);
  await drop(page, [path.join(FRIDAY, "friday old ref 0003.jpg")]);
  await until(async () => (await count(page)) > n1, 20000, 200); await sleep(800);
  const kept2 = await page.evaluate(() => document.querySelector('[data-view-host="tree"] .insp input[data-field="name"]')?.value ?? null);
  ok("T10: an open name field's text survives a store event, and is not saved", kept2 === "Typing in progress" && tax().domains.find((d) => d.id === "feature").name === "Feature", JSON.stringify(kept2));
  await page.keyboard.press("Escape"); await sleep(300);
  await undo(page);
  // Dragging a thumbnail does not freeze the inspector.
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:rim-light"]);
  const th = page.locator(`${H("tree")} .insp .thumb img`).first();
  if (await th.count()) {
    const tb = await th.boundingBox();
    const drag = await page.evaluate(() => [...document.querySelectorAll('[data-view-host="tree"] .insp .thumb img')].every((i) => i.draggable === false));
    await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + 300, box.y + 300, { steps: 10 }); await page.mouse.up(); await sleep(300);
    await page.click(`${H("tree")} .insp [data-syn-add]`); await page.keyboard.type("afterdrag"); await page.keyboard.press("Enter");
    const unfrozen = await saved(() => tax().techniques.find((t) => t.id === "rim-light").synonyms.includes("afterdrag"));
    await sleep(500);
    const chip = /afterdrag/.test(await insp(page));
    ok("T10: dragging a thumbnail does not freeze the inspector", !!unfrozen.v && chip, `thumbs draggable=false ${drag}; next edit saved ${!!unfrozen.v}, chip shown ${chip}`);
    await undo(page);
  } else ok("T10: dragging a thumbnail does not freeze the inspector", false, "no thumbnail");

  // ========== Review Focus 4: delete a technique in use ==========
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:rim-light"]);
  await drop(page, [path.join(FRIDAY, "friday old ref 0005.jpg")]); await sleep(2500);
  const cov = await covered(page, `${H("tree")} .insp [data-act="del-tech"]`);
  const notice = (await noticeText(page));
  await undo(page); await sleep(800);
  const notice2 = (await noticeText(page));
  ok("Import toast vs the inspector at 1280x800: Delete technique… is under the toast", cov ? false : true, `covered by: ${JSON.stringify(cov)}; toast "${notice.slice(0, 60)}"; after undoing the import, toast "${notice2.slice(0, 60)}", ${await count(page)} refs`);
  await shot(page, "a05b-toast-covers-inspector");
  await dismiss(page);
  const L0 = tagsOf(lib()), T0 = taxKey(tax());
  const users = lib().references.filter((r) => r.tags.some((t) => t.techniqueId === "rim-light"));
  const nTags = users.reduce((a, r) => a + r.tags.filter((t) => t.techniqueId === "rim-light").length, 0);
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:rim-light"]);
  await page.click(`${H("tree")} .insp [data-act="del-tech"]`);
  await page.waitForSelector(".tx-dialog", { timeout: 3000 });
  const dlg = await page.evaluate(() => {
    const d = document.querySelector(".tx-dialog");
    return { title: d.querySelector(".tx-title").textContent, opts: [...d.querySelectorAll("label")].map((l) => l.textContent.trim()), checked: d.querySelectorAll("input:checked").length, okOff: d.querySelector(".tx-ok").disabled, ok: d.querySelector(".tx-ok").textContent, focus: document.activeElement?.className };
  });
  ok("RF4: dialog asks where the tags go (title, Move them to…, Keep them as partial tags)", dlg.title === `${users.length} ${users.length === 1 ? "reference uses" : "references use"} Rim glow` && dlg.opts.some((o) => /Keep them as partial tags \(operation only\)/.test(o)) && dlg.ok === "Move and delete",
    `${dlg.title} | ${dlg.opts.length} options | ok "${dlg.ok}"`);
  ok("RF4: no option pre-selected; confirm disabled until one is chosen; self excluded", dlg.checked === 0 && dlg.okOff && !dlg.opts.some((o) => /^Rim glow —/.test(o)), `checked ${dlg.checked}, disabled ${dlg.okOff}, focus ${dlg.focus}`);
  await shot(page, "a06-rf4-dialog");
  await page.fill(".tx-dialog .tx-search", "silhou"); await sleep(200);
  const vis = await page.$$eval(".tx-dialog .tx-list li:not([hidden])", (l) => l.map((x) => x.textContent.trim()));
  ok("RF4: search narrows the targets", vis.length >= 1 && vis.every((x) => /silhou/i.test(x)), vis.join("; "));
  await page.click(".tx-dialog .tx-list li:not([hidden]) input");
  await page.click(".tx-dialog .tx-ok");
  const moved = await saved(() => !tax().techniques.some((t) => t.id === "rim-light") && !lib().references.some((r) => r.tags.some((t) => t.techniqueId === "rim-light")));
  const toSil = lib().references.filter((r) => users.some((u) => u.id === r.id)).every((r) => r.tags.some((t) => t.techniqueId === "silhouette"));
  ok("RF4: Move N tags to… moves every tag and deletes the technique", !!moved.v && toSil, `${nTags} tags on ${users.length} refs moved to Silhouette: ${toSil}`);
  await undo(page);
  const rest = await saved(() => tagsOf(lib()) === L0 && taxKey(tax()) === T0, 8000);
  ok("RF4: one Ctrl+Z restores the technique, its links and every tag in its original position", !!rest.v, rest.v ? "library.json tags and taxonomy.json byte-equal to before" : `tags equal ${tagsOf(lib()) === L0}, taxonomy equal ${taxKey(tax()) === T0}`);
  // Partial.
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:rim-light"]);
  await page.click(`${H("tree")} .insp [data-act="del-tech"]`);
  await page.waitForSelector(".tx-dialog", { timeout: 3000 });
  await page.click('.tx-dialog input[value="partial"]'); await page.click(".tx-dialog .tx-ok");
  const part = await saved(() => !tax().techniques.some((t) => t.id === "rim-light"));
  const partTags = lib().references.filter((r) => users.some((u) => u.id === r.id)).map((r) => r.tags.filter((t) => !t.techniqueId && t.operationId === "differentiate").length);
  ok("RF4: Keep them as partial tags leaves operation-only tags", !!part.v && partTags.every((n) => n >= 1), JSON.stringify(partTags));
  ok("RF4 partial: the notice the artist sees", null, (await noticeText(page)) || "(none)");
  await undo(page);
  ok("RF4: one Ctrl+Z restores everything after the partial delete", !!(await saved(() => tagsOf(lib()) === L0 && taxKey(tax()) === T0, 8000)).v);
  await redo(page);
  ok("Redo re-applies the partial delete in one step", !!(await saved(() => !tax().techniques.some((t) => t.id === "rim-light"))).v);
  await undo(page);
  await saved(() => taxKey(tax()) === T0, 8000);
  // Cancel and Esc change nothing.
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:rim-light"]);
  await page.click(`${H("tree")} .insp [data-act="del-tech"]`); await page.waitForSelector(".tx-dialog");
  await page.keyboard.press("Escape"); await sleep(300);
  const escFocus = await active(page);
  await page.click(`${H("tree")} .insp [data-act="del-tech"]`); await page.waitForSelector(".tx-dialog");
  await page.click(".tx-dialog .tx-cancel"); await sleep(600);
  ok("RF4: Esc and Cancel change nothing; focus returns to the opener", taxKey(tax()) === T0 && !(await page.locator(".tx-dialog").count()), `focus after Esc ${escFocus}`);
  // Ctrl+Z behind an open dialog stands down.
  await page.click(`${H("tree")} .insp [data-act="del-tech"]`); await page.waitForSelector(".tx-dialog");
  await page.keyboard.press("Control+z"); await sleep(600);
  ok("Ctrl+Z behind an open dialog does nothing", taxKey(tax()) === T0 && (await page.locator(".tx-dialog").count()) === 1);
  const fz = await active(page);
  await page.keyboard.press("Escape"); await sleep(300);
  const still = await page.locator(".tx-dialog").count();
  ok("Esc still closes the dialog after a Ctrl+Z inside it", still === 0, `focus after Ctrl+Z ${fz}; dialogs open after Esc ${still}`);
  if (still) { await shot(page, "a06b-dialog-stuck"); await page.click(".tx-dialog .tx-cancel"); await sleep(300); }

  // ========== Unlink: in use (dialog) and unused (direct) ==========
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:chiaroscuro"]);
  const chUsers = lib().references.filter((r) => r.tags.some((t) => t.techniqueId === "chiaroscuro" && t.branchId === "sequence.feature")).length;
  await page.click(`${H("tree")} .insp [data-unlink="sequence.feature"]`); await sleep(500);
  const ud = await page.evaluate(() => { const d = document.querySelector(".tx-dialog"); return d ? { title: d.querySelector(".tx-title").textContent, ok: d.querySelector(".tx-ok").textContent } : null; });
  if (chUsers) {
    ok("Unlink a pair in use opens the move dialog (… under Op · Domain, Move and unlink)", !!ud && /under Sequence · Feature/.test(ud.title) && ud.ok === "Move and unlink", JSON.stringify(ud));
    if (ud) { await page.click('.tx-dialog input[value="partial"]'); await page.click(".tx-dialog .tx-ok"); }
  } else {
    ok("Unlink a pair no tag uses: no dialog, unlinks directly (R20)", !ud, JSON.stringify(ud));
  }
  const unl = await saved(() => !tax().branchTechniques.some((l) => l.techniqueId === "chiaroscuro" && l.branchId === "sequence.feature"));
  ok("Unlink removes the pair", !!unl.v, `${chUsers} refs used the pair`);
  await sleep(500);
  const lastX = await page.evaluate(() => { const b = document.querySelector('[data-view-host="tree"] .insp [data-unlink]'); return b ? { dis: b.disabled, title: b.title } : null; });
  ok("The technique's only link: × disabled with its reason", lastX?.dis && /needs at least one place/.test(lastX.title), JSON.stringify(lastX));
  await undo(page);
  ok("Undo: the unlink and its tags revert", !!(await saved(() => tagsOf(lib()) === L0 && taxKey(tax()) === T0, 8000)).v);

  // ========== Drag to link on the canvas ==========
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:silhouette"]);
  await canvasFocus(page, "tree"); await page.keyboard.press("0"); await sleep(700);
  p = await probe(page, "tree");
  const opXs = labels(p).filter((n) => ["Differentiate", "Group", "Sequence", "Infer"].includes(n.text)).map((n) => [n.text, n.x]);
  const ownerOf = (n) => opXs.reduce((a, o) => (Math.abs(o[1] - n.x) < Math.abs(a[1] - n.x) ? o : a))[0];
  const silN = node(p, "Silhouette")[0];
  const brs = labels(p).filter((n) => n.size && n.y > Math.min(...opXs.map(() => 0)) && /Social|Space|Semantic/.test(n.text) && Math.abs(n.y - silN.y) > 10);
  const target = brs.find((n) => n.text === "Social" && ownerOf(n) === "Differentiate") ?? brs[0];
  const linked = labels(p).find((n) => n.text === "Feature" && ownerOf(n) === "Differentiate");
  if (silN && target) {
    const [sx, sy] = scr(p, silN.x, silN.y), [tx, ty] = scr(p, target.x, target.y), [lx, ly] = scr(p, linked.x, linked.y);
    const l0 = tax().branchTechniques.length;
    await page.mouse.move(sx, sy); await page.mouse.down();
    await page.mouse.move(lx, ly, { steps: 12 }); await sleep(150);
    const cur = await page.evaluate(() => document.querySelector('[data-view-host="tree"] canvas').style.cursor);
    await shot(page, "a07-drag-blocked");
    await page.mouse.move(tx, ty, { steps: 12 }); await sleep(150);
    const hint = (await probe(page, "tree")).ring;
    const cur2 = await page.evaluate(() => document.querySelector('[data-view-host="tree"] canvas').style.cursor);
    await shot(page, "a07b-drag-valid");
    await page.mouse.up(); await sleep(300);
    const lk = await saved(() => tax().branchTechniques.length === l0 + 1);
    const nl = tax().branchTechniques.filter((l) => l.techniqueId === "silhouette").map((l) => l.branchId);
    const cur3 = await page.evaluate(() => document.querySelector('[data-view-host="tree"] canvas').style.cursor);
    ok("Drag to link: a technique dropped on a branch links it", !!lk.v && nl.includes("differentiate.social"), `silhouette under ${nl.join(", ")}; dropped on ${target.text} (${ownerOf(target)})`);
    ok("Drag to link: over an already-linked branch the cursor says not-allowed; valid target outlined; cursor reset after drop", cur === "not-allowed" && cur2 !== "not-allowed" && !!hint && cur3 !== "not-allowed", `over linked: "${cur}", over valid: "${cur2}" ring ${!!hint}, after drop "${cur3}"`);
    await undo(page);
    ok("Undo: the drag link reverts", !!(await saved(() => taxKey(tax()) === T0)).v);
  } else ok("Drag to link", false, `nodes not found: silhouette ${!!silN}, target ${!!target}`);

  // ========== ae N3: Also use under… makes the picker's domain radios reachable ==========
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:chiaroscuro"]);
  await page.click(`${H("tree")} .insp [data-act="also"]`); await sleep(300);
  const also = await page.$$eval(`${H("tree")} .insp [data-link]`, (b) => b.map((x) => x.dataset.link));
  ok("Also use under… lists only branches not linked yet", also.length > 0 && !also.includes("differentiate.feature") && !also.includes("sequence.feature"), also.join(" "));
  await page.focus(`${H("tree")} .insp [data-link="differentiate.social"]`); await page.keyboard.press("Enter");
  const n3l = await saved(() => tax().branchTechniques.some((l) => l.techniqueId === "chiaroscuro" && l.branchId === "differentiate.social"));
  ok("Also use under… links by keyboard", !!n3l.v);
  const plain = lib().references.find((r) => !r.tags.some((t) => t.techniqueId === "chiaroscuro"));
  await page.click('[data-view-tab="reference"]');
  await page.fill("#q", plain.title);
  await page.locator(`#q-results li[data-r="${plain.id}"]`).click({ timeout: 5000 }).catch(() => {}); await sleep(600);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("t"); await page.waitForSelector("aside.margin .picker", { timeout: 5000 }).catch(() => {});
  await page.keyboard.press("1"); await page.keyboard.type("chiaro"); await sleep(500);
  const radios = await page.$$eval(".picker .pk-domains input[type=radio]", (r) => r.map((x) => x.value));
  ok("ae N3: the picker asks which domain (radios) for a technique under two domains of one operation", radios.length === 2 && radios.includes("differentiate.social"), radios.join(" "));
  await shot(page, "a08-n3-radios");
  if (radios.length) {
    await page.check('.picker .pk-domains input[value="differentiate.social"]'); await sleep(200);
    await page.keyboard.press("Enter");
    const tg = await saved(() => lib().references.find((r) => r.id === plain.id).tags.some((t) => t.techniqueId === "chiaroscuro" && t.branchId === "differentiate.social"));
    ok("ae N3: tagging with the chosen domain saves that branch", !!tg.v, JSON.stringify(lib().references.find((r) => r.id === plain.id).tags));
  }
  await page.keyboard.press("Escape"); await sleep(300);
  await page.click('[data-view-tab="tree"]'); await sleep(600);
  await undo(page); await undo(page);
  ok("Undo ×2: the N3 tag and link revert", !!(await saved(() => tagsOf(lib()) === L0 && taxKey(tax()) === T0, 8000)).v);

  // ========== Domain add / delete; operation delete ==========
  await path3(page, ["op:differentiate"]);
  await page.click(`${H("tree")} .insp [data-act="add-dom"]`); await sleep(300);
  const addable = await page.$$eval(`${H("tree")} .insp [data-add-branch]`, (b) => b.map((x) => x.dataset.addBranch));
  ok("+ Domain… lists only domain types not used under the operation", addable.join(",") === "cultural", addable.join(" "));
  await page.click(`${H("tree")} .insp [data-act="new-dom"]`);
  await page.waitForSelector(`${H("tree")} .insp form[data-form] input`, { timeout: 3000 });
  const inputs = await page.$$eval(`${H("tree")} .insp form[data-form] input`, (i) => i.map((x) => x.name));
  await page.fill(`${H("tree")} .insp form[data-form] input[name="${inputs[0]}"]`, "Weather");
  if (inputs[1]) await page.fill(`${H("tree")} .insp form[data-form] input[name="${inputs[1]}"]`, "Sky, rain and fog as a mood signal");
  await page.keyboard.press("Enter");
  const nd = await saved(() => tax().domains.some((d) => d.name === "Weather") && tax().branches.some((b) => b.operationId === "differentiate" && tax().domains.find((d) => d.id === b.domainId)?.name === "Weather"));
  ok("New domain type… adds the domain and its branch under the operation", !!nd.v, `form fields ${inputs.join(",")}`);
  await undo(page);
  ok("Undo: one step removes both the domain and its branch", !!(await saved(() => taxKey(tax()) === T0)).v);
  await path3(page, ["op:differentiate"]);
  await page.click(`${H("tree")} .insp [data-act="add-dom"]`); await sleep(300);
  await page.click(`${H("tree")} .insp [data-add-branch="cultural"]`);
  ok("+ Domain… adds an existing domain type as a branch", !!(await saved(() => tax().branches.some((b) => b.id === "differentiate.cultural"))).v);
  await undo(page); await saved(() => taxKey(tax()) === T0);
  // Delete a domain branch with tags: Move to … or Delete; tags become partial.
  await path3(page, ["op:infer", "br:infer.social"]);
  await page.click(`${H("tree")} .insp [data-act="del-domain"]`); await page.waitForSelector(".tx-dialog", { timeout: 3000 });
  const dd = await page.evaluate(() => { const d = document.querySelector(".tx-dialog"); return { title: d.querySelector(".tx-title").textContent, opts: [...d.querySelectorAll("label")].map((l) => l.textContent.trim()), checked: d.querySelectorAll("input:checked").length }; });
  ok("Delete domain…: Move to <domain> or Delete; tags become partial (with counts), none pre-selected", dd.opts.some((o) => /^Move to /.test(o)) && dd.opts.some((o) => /^Delete; tags become partial: \d+ tags? on \d+ references?, \d+ techniques? left with no other place$/.test(o)) && dd.checked === 0, `${dd.title} | ${dd.opts.join(" / ")}`);
  await shot(page, "a09-delete-domain");
  await page.click('.tx-dialog input[value="delete"]'); await page.click(".tx-dialog .tx-ok");
  ok("Delete domain applies", !!(await saved(() => !tax().branches.some((b) => b.id === "infer.social"))).v);
  ok("Delete domain: the notice the artist sees", null, (await noticeText(page)) || "(none)");
  await undo(page);
  ok("Undo: the domain delete reverts with its tags", !!(await saved(() => tagsOf(lib()) === L0 && taxKey(tax()) === T0, 8000)).v);
  // Delete an operation: options with counts; move to another.
  await path3(page, ["op:infer"]);
  await page.click(`${H("tree")} .insp [data-act="del-op"]`); await page.waitForSelector(".tx-dialog", { timeout: 3000 });
  const od = await page.evaluate(() => { const d = document.querySelector(".tx-dialog"); return { title: d.querySelector(".tx-title").textContent, opts: [...d.querySelectorAll("label")].map((l) => l.textContent.trim()), checked: d.querySelectorAll("input:checked").length }; });
  ok("Delete operation…: Move its branches and tags to <op> / Delete them and their tags (counts)", od.opts.some((o) => o === "Move its branches and tags to Stand out") && od.opts.some((o) => /^Delete them and their tags: \d+ tags? on \d+ references?, \d+ techniques? left with no other place$/.test(o)) && od.checked === 0, `${od.title} | ${od.opts.join(" / ")}`);
  await page.click('.tx-dialog input[value="differentiate"]'); await page.click(".tx-dialog .tx-ok");
  const om = await saved(() => !tax().operations.some((o) => o.id === "infer"), 8000);
  ok("Delete operation with Move re-keys its branches and tags", !!om.v && !lib().references.some((r) => r.tags.some((t) => t.operationId === "infer")), (await insp(page)).slice(0, 160));
  await undo(page);
  ok("Undo: the operation delete reverts", !!(await saved(() => tagsOf(lib()) === L0 && taxKey(tax()) === T0, 8000)).v);

  // ========== Operations to 9; Radial keys; Radial delete-active-op (M3) ==========
  const added = [];
  for (const [nm, pl] of [["Unsettle", "Make it uneasy"], ["Soothe", "Calm it down"], ["Surprise", "Catch them off guard"], ["Reveal", "Show what hides"], ["Echo", "Repeat to bind"]]) {
    await path3(page, []);
    const b0 = page.locator(`${H("tree")} .insp [data-act="new-op"]`);
    if (await b0.isDisabled()) break;
    await b0.click();
    await page.waitForSelector(`${H("tree")} .insp form[data-form] input`, { timeout: 3000 });
    const f = await page.$$eval(`${H("tree")} .insp form[data-form] input`, (i) => i.map((x) => x.name));
    await page.fill(`${H("tree")} .insp form[data-form] input[name="${f[0]}"]`, nm);
    if (f[1]) await page.fill(`${H("tree")} .insp form[data-form] input[name="${f[1]}"]`, pl);
    await page.keyboard.press("Enter");
    if ((await saved(() => tax().operations.some((o) => o.name === nm))).v) added.push(nm);
  }
  await sleep(500);
  const nb = page.locator(`${H("tree")} .insp [data-act="new-op"]`);
  ok("New operation…: up to 9, then disabled with 'Up to 9 operations'", tax().operations.length === 9 && (await nb.isDisabled()) && (await nb.getAttribute("title")) === "Up to 9 operations", `${tax().operations.length} ops; added ${added.join(", ")}; inks ${tax().operations.map((o) => o.color ?? "seed").join(",")}`);
  await canvasFocus(page, "tree"); await page.keyboard.press("0"); await sleep(700);
  for (let i = 0; i < 2; i++) { await page.keyboard.press("+"); await sleep(30); } await sleep(700);
  p = await probe(page, "tree");
  const ops9 = labels(p).filter((n) => tax().operations.some((o) => o.name === n.text) && n.y === Math.min(...labels(p).map((m) => m.y)));
  const opsOv = overlaps(labels(p).filter((n) => n.y === ops9[0]?.y));
  ok("Tree: 9 operations side by side with staggered labels, no overlap", ops9.length === 9 && new Set(ops9.map((n) => Math.round(n.x))).size === 9 && opsOv.length === 0, `${ops9.length} op nodes; rows ${[...new Set(ops9.map((n) => n.dy))].join(",")}; overlaps ${opsOv.join("; ") || 0}`);
  await shot(page, "a10-tree-9-ops");
  await page.click('[data-view-tab="radial"]'); await page.waitForSelector(`${H("radial")} canvas`, { timeout: 15000 }); await sleep(1200);
  await canvasFocus(page, "radial");
  await page.keyboard.press("9"); await sleep(600);
  const r9 = await page.evaluate(() => document.querySelector('[data-view-host="radial"] .radial-op[aria-pressed="true"], [data-view-host="radial"] .radial-op.is-on')?.textContent ?? "");
  ok("Radial: key 9 reaches the 9th operation", /Echo|Repeat to bind/.test(r9 + (await crumb(page, "radial"))), `${one(r9)} | ${await crumb(page, "radial")}`);
  await shot(page, "a11-radial-op9");
  // M3: undo the 9th op while it is active in the Radial.
  await page.keyboard.press("Control+z"); await sleep(1200);
  const after = await page.evaluate(() => [...document.querySelectorAll('[data-view-host="radial"] .radial-op')].map((b) => `${b.textContent.trim()}${b.getAttribute("aria-pressed") === "true" ? "*" : ""}`).join(" | "));
  const rp = await probe(page, "radial");
  await canvasFocus(page, "radial"); await page.keyboard.press("0"); await sleep(700);
  const rf = await probe(page, "radial");
  ok("Radial M3: the active operation deleted (undo) switches to the busiest and refits", !/Echo/.test(after) && /\*/.test(after) && Math.abs(rp.s - rf.s) < 0.01, `ops ${after}; scale ${rp.s.toFixed(3)} vs fit ${rf.s.toFixed(3)}`);
  await page.click('[data-view-tab="tree"]'); await sleep(600); await page.click('[data-view-tab="radial"]'); await sleep(900);
  const after2 = await page.evaluate(() => [...document.querySelectorAll('[data-view-host="radial"] .radial-op')].filter((b) => b.getAttribute("aria-pressed") === "true").map((b) => b.textContent.trim()).join());
  ok("Radial M3: a remount keeps a live operation", after2.length > 0 && !/Echo/.test(after2), after2);
  for (let i = 0; i < added.length - 1; i++) await undo(page);
  ok("Undo: the added operations revert", !!(await saved(() => taxKey(tax()) === T0, 8000)).v, `${tax().operations.length} ops`);

  // ========== Radial labels (I1.5) and Enter ==========
  await page.click('[data-view-tab="radial"]'); await sleep(900);
  for (const [k, name] of [["1", "Differentiate"], ["4", "Infer"], ["2", "Group"], ["3", "Sequence"]]) {
    await canvasFocus(page, "radial"); await page.keyboard.press(k); await sleep(900); await page.keyboard.press("0"); await sleep(700);
    let q = await probe(page, "radial");
    const atFit = `${name} fit ${q.s.toFixed(3)} (${visibleLabels(q)} names on)`;
    for (let i = 0; i < 8 && q.s < THRESH; i++) { await page.keyboard.press("+"); await sleep(30); q = await probe(page, "radial"); await sleep(300); q = await probe(page, "radial"); }
    const lq = labels(q);
    const rov = overlaps(lq);
    ok(`Radial ${name}: rings 1-2 names don't collide when shown`, rov.length === 0 && visibleLabels(q) > 0, `${atFit}; zoomed ${q.s.toFixed(3)}; ${lq.length} names; overlaps ${rov.slice(0, 5).join("; ") || 0}`);
    if (name === "Differentiate") await shot(page, "a12-radial-diff-zoom");
  }
  await page.keyboard.press("Escape"); await sleep(300);
  const rc0 = await crumb(page, "radial");
  await page.keyboard.press("Enter"); await sleep(400);
  ok("Radial: Enter with nothing selected selects the centre", (await crumb(page, "radial")) !== rc0, `${rc0} -> ${await crumb(page, "radial")}`);

  // ========== Long names: clip at 24 + … in the Tree ==========
  await page.click('[data-view-tab="tree"]'); await sleep(600);
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:silhouette"]);
  await page.click(`${H("tree")} .insp-title .insp-edit`);
  await page.fill(`${H("tree")} .insp input[data-field="name"]`, "Silhouette against a burning evening sky"); await page.keyboard.press("Enter");
  await saved(() => /burning/.test(tax().techniques.find((t) => t.id === "silhouette").name));
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:rim-light"]);
  await page.click(`${H("tree")} .insp-title .insp-edit`);
  await page.fill(`${H("tree")} .insp input[data-field="name"]`, "Rim light from a low window at dusk"); await page.keyboard.press("Enter");
  await saved(() => /dusk/.test(tax().techniques.find((t) => t.id === "rim-light").name)); await sleep(600);
  await canvasFocus(page, "tree"); await page.keyboard.press("0"); await sleep(600);
  p = await probe(page, "tree");
  const clipped = labels(p).filter((n) => /…$/.test(n.text)).map((n) => n.text);
  const lov = overlaps(labels(p));
  ok("Long names: clipped to 24 chars + …, still no overlap", clipped.length >= 2 && clipped.every((t) => t.length === 25) && lov.length === 0, `${clipped.map((t) => JSON.stringify(t)).join(", ")}; overlaps ${lov.slice(0, 4).join("; ") || 0}`);
  for (let i = 0; i < 3; i++) { await page.keyboard.press("+"); await sleep(30); } await sleep(700);
  await shot(page, "a13-tree-long-names");
  await undo(page); await undo(page);
  await saved(() => taxKey(tax()) === T0);

  // ========== Galaxy: edges refresh after an edit, no reload ==========
  await page.click('[data-view-tab="galaxy"]'); await page.waitForSelector(`${H("galaxy")} canvas`, { timeout: 15000 }); await sleep(2500);
  const e0 = ipcLog.filter((c) => c === "graph_edges").length;
  await page.click('[data-view-tab="tree"]'); await sleep(500);
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:rim-light"]);
  await page.click(`${H("tree")} .insp [data-act="del-tech"]`); await page.waitForSelector(".tx-dialog");
  await page.fill(".tx-dialog .tx-search", "silhou"); await page.click(".tx-dialog .tx-list li:not([hidden]) input"); await page.click(".tx-dialog .tx-ok");
  await saved(() => !tax().techniques.some((t) => t.id === "rim-light"));
  await page.click('[data-view-tab="galaxy"]'); await sleep(2500);
  const e1 = ipcLog.filter((c) => c === "graph_edges").length;
  ok("T10 step 3.4: the Galaxy re-fetches its edges after a taxonomy edit, without a reload", e1 > e0, `graph_edges calls ${e0} -> ${e1}`);
  await undo(page);
  ok("Undo from the Galaxy restores the technique and tags", !!(await saved(() => tagsOf(lib()) === L0 && taxKey(tax()) === T0, 8000)).v);
  await shot(page, "a14-galaxy");

  ok("no requests outside localhost", external.length === 0, external.slice(0, 3).join(" "));
  ok("no console errors", consoleErr.length === 0, consoleErr.slice(0, 4).join(" || "));
  ok("no raw error text in the UI", !/Error:|NameTaken:|still in use:|unknown (technique|branch):/.test(await page.evaluate(() => document.body.innerText)));
  await closeApp(b);
  done();
})().catch(async (e) => {
  try { await shot(P, "zz-crash"); ok("crash state", null, `${await crumb(P)} || ${(await insp(P)).slice(0, 400)} || del-tech ${await P.locator('[data-act="del-tech"]').count()} dialogs ${await P.locator('.tx-dialog').count()} focus ${await active(P)}`); } catch {}
  ok("harness crashed", false, e.stack); try { proc.kill(); } catch {} done(1); });

// ---------- 2,500 references (perf exe with HORUS_DEMO_DIR) ----------
async function big(page, b) {
  await page.click('[data-view-tab="tree"]'); await page.waitForSelector(`${H("tree")} canvas`, { timeout: 30000 }); await sleep(2500);
  let p = await probe(page, "tree");
  ok("2,500 Tree at fit: names hidden (J2), every taxonomy node drawn", visibleLabels(p) === 0 && labels(p).length > 0, `scale ${p.s.toFixed(3)}; ${labels(p).length} taxonomy nodes`);
  await shot(page, "b01-tree-fit");
  await page.click(`${H("tree")} .insp [data-sel="op:differentiate"]`); await sleep(500);
  await page.click(`${H("tree")} .insp [data-sel="br:differentiate.feature"]`); await sleep(500);
  await page.click(`${H("tree")} .insp [data-sel="tech:complementary-pairing"]`); await sleep(1500);
  const ins = await page.evaluate(() => {
    const a = document.querySelector('[data-view-host="tree"] .insp'), c = a.querySelector(".insp-crumb");
    return { win: `${innerWidth}x${innerHeight}`, crumbH: Math.round(c.getBoundingClientRect().height), crumbNatural: c.scrollHeight, overflowY: getComputedStyle(a).overflowY, sh: a.scrollHeight, chh: a.clientHeight };
  });
  ok("2,500 inspector at 1280x800 (Complementary pairing, editing controls): crumb not squeezed, aside scrolls", ins.crumbH >= ins.crumbNatural - 1 && ins.sh > ins.chh && /auto|scroll/.test(ins.overflowY), JSON.stringify(ins));
  await shot(page, "b00-inspector-top");
  await page.evaluate(() => document.querySelector('[data-view-host="tree"] .insp').scrollTop = 600); await sleep(300);
  const ins2 = await page.evaluate(() => { const c = document.querySelector('[data-view-host="tree"] .insp-crumb'); return { top: Math.round(c.getBoundingClientRect().top), h: Math.round(c.getBoundingClientRect().height) }; });
  ok("2,500 inspector: the crumb scrolls with the aside (not squeezed when scrolled)", ins2.h >= ins.crumbNatural - 1, JSON.stringify(ins2));
  await shot(page, "b00b-inspector-scrolled");
  await canvasFocus(page, "tree"); await page.keyboard.press("0"); await sleep(1500);
  p = await probe(page, "tree");
  const refsN = p.nodes.filter((n) => n.kind === "ref");
  const xs = refsN.map((n) => n.x), ys = refsN.map((n) => n.y);
  const inView = refsN.filter((n) => { const [x, y] = scr(p, n.x, n.y); return x >= p.cl && x <= p.cl + p.cw && y >= p.ct && y <= p.ct + p.ch; }).length;
  ok("2,500 Tree, Complementary pairing expanded: the reference block fits on screen", refsN.length > 0 && inView === refsN.length, `${refsN.length} refs, ${inView} on screen; block ${Math.round(Math.max(...xs) - Math.min(...xs))}x${Math.round(Math.max(...ys) - Math.min(...ys))} world; scale ${p.s.toFixed(3)}`);
  await shot(page, "b02-tree-block");
  await page.click(".tree-all").catch(() => {}); await sleep(2500);
  await shot(page, "b03-tree-showall");
  await page.click(".tree-all").catch(() => {}); await sleep(1000);
  await page.click('[data-view-tab="radial"]'); await page.waitForSelector(`${H("radial")} canvas`, { timeout: 30000 }); await sleep(2500);
  await canvasFocus(page, "radial"); await page.keyboard.press("0"); await sleep(1200);
  p = await probe(page, "radial");
  const rr = p.nodes.filter((n) => n.kind === "ref" && n.shown);
  const rIn = rr.filter((n) => { const [x, y] = scr(p, n.x, n.y); return x >= p.cl && x <= p.cl + p.cw && y >= p.ct && y <= p.ct + p.ch; }).length;
  const rad = Math.max(...p.nodes.filter((n) => n.kind === "ref").map((n) => Math.hypot(n.x, n.y)));
  ok("2,500 Radial: ring 3's rows on screen at fit", rr.length > 0 && rIn === rr.length, `${rr.length} refs drawn, ${rIn} on screen; outer radius ${Math.round(rad)}; scale ${p.s.toFixed(3)}`);
  await shot(page, "b04-radial-fit");
  await wspy(page);
  await page.click('[data-view-tab="galaxy"]'); await page.waitForSelector(`${H("galaxy")} canvas`, { timeout: 30000 });
  const ended = await until(() => page.evaluate(() => window.__gx.ends > 0), 120000, 250); await sleep(1500);
  ok("2,500 Galaxy: layout worker reached end", !!ended.v, `${ended.ms} ms after the tab opened`);
  p = await probe(page, "galaxy");
  const g = p.nodes.filter((n) => n.kind === "ref");
  let close = 0;
  const cell = new Map(); for (const n of g) { const k = `${Math.floor(n.x / 48)},${Math.floor(n.y / 48)}`; (cell.get(k) ?? cell.set(k, []).get(k)).push(n); }
  for (const n of g) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const m of cell.get(`${Math.floor(n.x / 48) + dx},${Math.floor(n.y / 48) + dy}`) ?? []) if (m !== n && Math.abs(m.x - n.x) < 48 && Math.abs(m.y - n.y) < 48) close++;
  const depth = [], inv = new Set();
  for (let i = 0; i < g.length; i++) for (let j = i + 1; j < g.length; j++) { const dx = Math.abs(g[i].x - g[j].x), dy = Math.abs(g[i].y - g[j].y); if (dx < 48 && dy < 48) { depth.push(Math.min(48 - dx, 48 - dy)); inv.add(i); inv.add(j); } }
  depth.sort((a, b) => a - b);
  ok("2,500 Galaxy: overlapping tile pairs after the worker's end", null, `${g.length} refs; ${depth.length} overlapping pairs touching ${inv.size} tiles; overlap depth median ${depth[depth.length >> 1]?.toFixed(1)}, p90 ${depth[Math.floor(depth.length * 0.9)]?.toFixed(1)}, max ${depth[depth.length - 1]?.toFixed(1)} world units (tile 48)`);
  await shot(page, "b05-galaxy");
  ok("no console errors (big)", consoleErr.length === 0, consoleErr.slice(0, 4).join(" || "));
  await closeApp(b);
  done();
}

// ---------- EXTRA=1: the follow-ups (advisor pass) ----------
const wspy = (page) => page.evaluate(() => {
  if (window.__gx) return;
  const Base = window.Worker;
  window.__gx = { ends: 0 };
  window.Worker = class extends Base { constructor(...a) { super(...a); this.addEventListener("message", (ev) => { if (ev.data?.type === "end") window.__gx.ends++; }); } };
});
const ringOn = (q) => !!q.ring && q.ring.x >= q.cl - 1 && q.ring.x + q.ring.w <= q.cl + q.cw + 1 && q.ring.y >= q.ct - 1 && q.ring.y + q.ring.h <= q.ct + q.ch + 1;
async function extra(page, b) {
  await wspy(page);
  // 1. Esc after Ctrl+Z in the move dialog, after earlier typed edits (as in the full run).
  await page.click('[data-view-tab="reference"]'); await page.fill("#q", "rim"); await sleep(400); await page.fill("#q", ""); await page.evaluate(() => document.activeElement?.blur?.());
  await page.click('[data-view-tab="tree"]'); await page.waitForSelector(`${H("tree")} canvas`); await sleep(1200);
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:rim-light"]);
  await page.click(`${H("tree")} .insp-title .insp-edit`); await page.fill(`${H("tree")} .insp input[data-field="name"]`, "Rim glow"); await page.keyboard.press("Enter");
  await saved(() => tax().techniques.find((t) => t.id === "rim-light").name === "Rim glow");
  const T1 = taxKey(tax());
  const who = () => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}#${a.id}.${a.className}[${a.getAttribute("name") ?? a.dataset.field ?? ""}] in-dialog=${!!a.closest(".tx-dialog")}` : "none"; });
  for (const [label, prep] of [["fresh dialog", null], ["after typing in its search", "silhou"], ["after typing then clearing its search", "x"]]) {
    await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:rim-light"]);
    await page.click(`${H("tree")} .insp [data-act="del-tech"]`); await page.waitForSelector(".tx-dialog");
    if (prep) { await page.keyboard.type(prep); await sleep(200); if (prep === "x") await page.keyboard.press("Backspace"); }
    const f0 = await who(), q0 = await page.inputValue("#q");
    await page.keyboard.press("Control+z"); await sleep(600);
    const f1 = await who(), q1 = await page.inputValue("#q"), sv = await page.inputValue(".tx-dialog .tx-search").catch(() => "?");
    await page.keyboard.press("Escape"); await sleep(300);
    const open = await page.locator(".tx-dialog").count();
    ok(`Move dialog, ${label}: Ctrl+Z keeps focus inside; Esc closes`, open === 0 && /in-dialog=true/.test(f1) && taxKey(tax()) === T1, `before ${f0}; after Ctrl+Z ${f1}; search "${sv}"; #q "${q0}"->"${q1}"; open after Esc ${open}; taxonomy unchanged ${taxKey(tax()) === T1}`);
    if (open) { await shot(page, `x01-dialog-${label.replace(/\W+/g, "-")}`); await page.click(".tx-dialog .tx-cancel").catch(() => {}); await sleep(300); }
  }
  await undo(page); await saved(() => tax().techniques.find((t) => t.id === "rim-light").name === "Rim light");

  // 2. RF4 unlink in use: link Silhouette under differentiate.social, then unlink Feature (which tags use).
  const L0 = tagsOf(lib()), T0 = taxKey(tax());
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:silhouette"]);
  await page.click(`${H("tree")} .insp [data-act="also"]`); await page.click(`${H("tree")} .insp [data-link="differentiate.social"]`);
  await saved(() => tax().branchTechniques.some((l) => l.techniqueId === "silhouette" && l.branchId === "differentiate.social"));
  const L1 = tagsOf(lib()), T1b = taxKey(tax());
  const used = lib().references.filter((r) => r.tags.some((t) => t.techniqueId === "silhouette" && t.branchId === "differentiate.feature"));
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:silhouette"]);
  await page.click(`${H("tree")} .insp [data-unlink="differentiate.feature"]`); await page.waitForSelector(".tx-dialog", { timeout: 3000 }).catch(() => {});
  const ud = await page.evaluate(() => { const d = document.querySelector(".tx-dialog"); return d ? { title: d.querySelector(".tx-title").textContent, ok: d.querySelector(".tx-ok").textContent, opts: [...d.querySelectorAll("label")].map((l) => l.textContent.trim()), checked: d.querySelectorAll("input:checked").length } : null; });
  ok("RF4 unlink in use: dialog '… under Differentiate · Feature', Move and unlink, own other pair offered, unlinked pair excluded, none chosen",
    !!ud && ud.title === `${used.length} ${used.length === 1 ? "reference uses" : "references use"} Silhouette under Differentiate · Feature` && ud.ok === "Move and unlink" && ud.opts.includes("Silhouette — Differentiate · Social") && !ud.opts.includes("Silhouette — Differentiate · Feature") && ud.checked === 0,
    ud ? `${ud.title} | ok "${ud.ok}" | ${ud.opts.length} options | own: ${ud.opts.filter((o) => o.startsWith("Silhouette")).join("; ")}` : "no dialog");
  if (ud) {
    await page.check('.tx-dialog input[value="silhouette|differentiate.social"]'); await page.click(".tx-dialog .tx-ok");
    const mv = await saved(() => !tax().branchTechniques.some((l) => l.techniqueId === "silhouette" && l.branchId === "differentiate.feature"));
    const re = lib().references.filter((r) => used.some((u) => u.id === r.id)).every((r) => r.tags.some((t) => t.techniqueId === "silhouette" && t.branchId === "differentiate.social") && !r.tags.some((t) => t.techniqueId === "silhouette" && t.branchId === "differentiate.feature"));
    ok("RF4 unlink in use: Move and unlink re-points every tag to the chosen pair", !!mv.v && re, `${used.length} refs`);
    await undo(page);
    ok("RF4 unlink in use: one Ctrl+Z restores the link and every tag in its original position", !!(await saved(() => tagsOf(lib()) === L1 && taxKey(tax()) === T1b, 8000)).v);
  }
  await undo(page);
  ok("Undo: the Also-use link reverts", !!(await saved(() => tagsOf(lib()) === L0 && taxKey(tax()) === T0, 8000)).v);

  // 3. Operation name and plain label show in the Radial and the picker; icon picker.
  await path3(page, ["op:group"]);
  await page.click(`${H("tree")} .insp-title .insp-edit`); await page.fill(`${H("tree")} .insp input[data-field="name"]`, "Gather"); await page.keyboard.press("Enter");
  await saved(() => tax().operations.find((o) => o.id === "group").name === "Gather");
  await page.click(`${H("tree")} .insp-plain .insp-edit`); await page.fill(`${H("tree")} .insp input[data-field="plainLabel"]`, "Bind them"); await page.keyboard.press("Enter");
  await saved(() => tax().operations.find((o) => o.id === "group").plainLabel === "Bind them");
  await page.click('[data-view-tab="radial"]'); await page.waitForSelector(`${H("radial")} canvas`); await sleep(1000);
  const rops = await page.$$eval(`${H("radial")} .radial-op`, (b) => b.map((x) => x.textContent.trim()));
  const rlist = await insp(page, "radial");
  ok("Op rename: the Radial's operation buttons and inspector use the new label and name", rops.includes("Bind them") && /Gather · Bind them/.test(rlist), `${rops.join(" / ")} | ${rlist.slice(0, 120)}`);
  const ref = lib().references[0];
  await page.click('[data-view-tab="reference"]'); await page.fill("#q", ref.title);
  await page.locator(`#q-results li[data-r="${ref.id}"]`).click({ timeout: 5000 }).catch(() => {}); await sleep(600);
  await page.evaluate(() => document.activeElement?.blur?.());
  await page.keyboard.press("t"); await page.waitForSelector("aside.margin .picker", { timeout: 5000 }).catch(() => {}); await sleep(300);
  const pk = one(await txt(page, "aside.margin .picker"));
  ok("Op rename: the tagging picker shows the new name and label", /Gather/.test(pk) && /Bind them/.test(pk), pk.slice(0, 200));
  await page.keyboard.press("Escape"); await sleep(300);
  await page.click('[data-view-tab="tree"]'); await sleep(600);
  await path3(page, ["op:differentiate", "br:differentiate.feature"]);
  const icons = await page.$$eval(`${H("tree")} .insp .insp-icon`, (b) => b.map((x) => `${x.dataset.icon}:${x.getAttribute("aria-pressed")}`));
  const pickIcon = icons.find((x) => x.endsWith(":false"))?.split(":")[0];
  await page.click(`${H("tree")} .insp .insp-icon[data-icon="${pickIcon}"]`);
  const ic = await saved(() => tax().domains.find((d) => d.id === "feature").icon === pickIcon);
  await sleep(400);
  const pressed = await page.$$eval(`${H("tree")} .insp .insp-icon[aria-pressed="true"]`, (b) => b.map((x) => x.dataset.icon));
  ok("Domain icon picker: shows the icons as text, saves the choice, marks it pressed", icons.length >= 8 && !!ic.v && pressed.join() === pickIcon, `${icons.join(" ")} -> ${pickIcon}; pressed ${pressed.join()}`);
  await shot(page, "x02-icon-picker");
  await undo(page); await undo(page); await undo(page);
  ok("Undo ×3: icon, label and name revert", !!(await saved(() => taxKey(tax()) === T0, 8000)).v);

  // 4. Camera reveal in the Radial and the Galaxy.
  await page.click('[data-view-tab="radial"]'); await sleep(800);
  await canvasFocus(page, "radial"); await page.keyboard.press("1"); await sleep(600); await page.keyboard.press("0"); await sleep(600);
  for (let i = 0; i < 9; i++) await page.keyboard.press("+");
  await sleep(700);
  await page.keyboard.press("Enter"); await sleep(400); await page.keyboard.press("ArrowDown"); await sleep(400); await page.keyboard.press("ArrowDown"); await sleep(400);
  let pans = 0, off = 0, n = 0;
  for (let i = 0; i < 10; i++) { const a = await probe(page, "radial"); await page.keyboard.press("ArrowRight"); await sleep(450); const c = await probe(page, "radial"); n++; if (Math.hypot(c.px - a.px, c.py - a.py) > 0.5) pans++; if (!ringOn(c)) off++; }
  ok("Radial: walking the ring past the edge keeps the selection on screen", off === 0 && pans > 0, `${n} steps, ${pans} pans, off screen after ${off}; crumb ${await crumb(page, "radial")}`);
  await shot(page, "x03-radial-reveal");
  await page.click('[data-view-tab="galaxy"]'); await page.waitForSelector(`${H("galaxy")} canvas`); await until(() => page.evaluate(() => window.__gx.ends > 0), 20000, 200); await sleep(800);
  await canvasFocus(page, "galaxy"); for (let i = 0; i < 12; i++) await page.keyboard.press("+");
  await sleep(800);
  await page.keyboard.press("Enter"); await sleep(400);
  pans = 0; off = 0; n = 0;
  for (const k of ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowDown", "ArrowDown", "ArrowLeft", "ArrowLeft", "ArrowLeft", "ArrowUp", "ArrowUp"]) {
    const a = await probe(page, "galaxy"); await page.keyboard.press(k); await sleep(450); const c = await probe(page, "galaxy"); n++;
    if (Math.hypot(c.px - a.px, c.py - a.py) > 0.5) pans++; if (!ringOn(c)) off++;
  }
  ok("Galaxy: walking past the edge keeps the selection on screen", off === 0 && pans > 0, `${n} steps, ${pans} pans, off screen after ${off}; scale ${(await probe(page, "galaxy")).s.toFixed(2)}`);
  await shot(page, "x04-galaxy-reveal");

  // 5. Reduced motion with a reference selected and thumbnails showing (the pre-QA harness state).
  await page.click('[data-view-tab="tree"]'); await sleep(600);
  await path3(page, ["op:differentiate", "br:differentiate.feature", "tech:rim-light"]);
  await canvasFocus(page, "tree"); await page.keyboard.press("ArrowDown"); await sleep(400);
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (let i = 0; i < 4; i++) { await page.keyboard.press("+"); await sleep(350); }
  await page.keyboard.press("0"); await sleep(30); const r1 = await probe(page, "tree"); await sleep(450); const r2 = await probe(page, "tree");
  ok("Tree reduced motion, a reference selected: 0 fits without a tween", Math.abs(r1.s - r2.s) < 1e-6 && Math.abs(r1.px - r2.px) < 0.5, `crumb ${await crumb(page)}; 30 ms ${r1.s.toFixed(3)}, 480 ms ${r2.s.toFixed(3)}`);
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // 6. Read-only taxonomy on the real app: damage taxonomy.json, relaunch.
  await closeApp(b);
  fs.writeFileSync(path.join(LIB, "taxonomy.json"), "{ damaged"); fs.writeFileSync(path.join(LIB, "taxonomy.bak.json"), "{ damaged"); // both: else the backup is used
  ({ b, page } = await launch("read-only"));
  await page.waitForSelector("#lib-count", { timeout: 20000 }); await until(async () => (await count(page)) > 0, 20000, 200);
  await hook(page);
  await page.click('[data-view-tab="tree"]'); await page.waitForSelector(`${H("tree")} canvas`); await sleep(1500);
  const roNote = await txt(page, `${H("tree")} .insp-ro`);
  await sel(page, "op:differentiate"); await sel(page, "br:differentiate.feature"); await sel(page, "tech:rim-light");
  const ctl = await page.evaluate(() => { const a = document.querySelector('[data-view-host="tree"] .insp'); return { inputs: a.querySelectorAll("input:not([disabled]), textarea:not([disabled])").length, edits: a.querySelectorAll(".insp-edit, [data-act], [data-unlink], [data-syn-add]").length }; });
  ok("Read-only taxonomy: the note, and no editing controls", roNote === "The technique list is read-only because taxonomy.json is damaged." && ctl.inputs === 0 && ctl.edits === 0, `note "${roNote}"; ${JSON.stringify(ctl)}`);
  await canvasFocus(page, "tree"); await page.keyboard.press("0"); await sleep(700);
  const p = await probe(page, "tree");
  const t = node(p, "Silhouette")[0];
  if (t) {
    const [sx, sy] = scr(p, t.x, t.y);
    await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 150, sy + 60, { steps: 8 }); await page.mouse.up(); await sleep(400);
    const q = await probe(page, "tree");
    ok("Read-only taxonomy: dragging a technique pans instead", Math.hypot(q.px - p.px, q.py - p.py) > 50 && fs.readFileSync(path.join(LIB, "taxonomy.json"), "utf8") === "{ damaged", `camera moved ${Math.hypot(q.px - p.px, q.py - p.py).toFixed(0)} px; taxonomy.json untouched`);
  } else ok("Read-only taxonomy: dragging a technique pans instead", false, "Silhouette node not found");
  await shot(page, "x05-read-only");
  ok("no console errors (extra)", consoleErr.length === 0, consoleErr.slice(0, 4).join(" || "));
  await closeApp(b);
  done();
}

function done(code) {
  const pass = R.filter((r) => r.pass === true).length, fail = R.filter((r) => r.pass === false).length;
  console.log(`\n${pass} pass, ${fail} fail, ${R.filter((r) => r.pass === null).length} notes`);
  fs.writeFileSync(path.join(W, BIG ? "results-big.json" : EXTRA ? "results-extra.json" : "results-p2.json"), JSON.stringify(R, null, 1));
  try { fs.rmSync(CONFIG, { recursive: true, force: true }); } catch {}
  process.exit(code ?? (fail ? 1 : 0));
}
