// Plan 4 Task 8: the end-to-end check on the release perf build, over WebView2 CDP (port 9335).
//   node docs/superpowers/qa/plan4-e2e.js <work dir outside the repo> [main|scale]
// main: a fresh library from the bundled demo set; steps 1-8 and the hand checks. It launches twice
//       (step 8 quits and relaunches). scale: <work dir>/perf2500 (scripts/make_perf_library.py)
//       as the demo set; step 9 and the board-reorder-while-scrolled check.
// Build: `VITE_PERF=1 npm run tauri build -- --features perf --no-bundle`; HORUS_EXE overrides
// the exe path. It refuses to run if %APPDATA%/art.horus.app exists, and deletes it afterwards.
// Export goes to EXPORT (created empty; emptied afterwards). The dialog IPC is answered here.
const { chromium } = require(process.env.APPDATA + "/npm/node_modules/playwright");
const { spawn, execSync } = require("child_process");
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const REPO = path.resolve(__dirname, "../../..");
const EXE = process.env.HORUS_EXE || path.join(REPO, "app/src-tauri/target/release/horus.exe");
const W = process.argv[2], MODE = process.argv[3] || "main";
const LIB = path.join(W, MODE === "scale" ? "scale-lib" : "e2e-lib"), SHOTS = path.join(W, `shots-${MODE}`);
const EXPORT = "E:\\D drive files\\Design Second Brain\\Export test";
const CONFIG = path.join(process.env.APPDATA, "art.horus.app");
const PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = {};
const log = (k, v) => { out[k] = v; console.log(k, "::", typeof v === "string" ? v : JSON.stringify(v)); };
let pg = null;
const check = async (k, fn) => {
  try { log(k, await fn()); } catch (e) {
    log(k, { ERROR: String(e && e.message || e).split("\n").slice(0, 3).join(" | ") });
    if (pg) await pg.screenshot({ path: path.join(SHOTS, `error-${k}.png`) }).catch(() => {});
  }
};

if (fs.existsSync(CONFIG)) throw new Error("art.horus.app exists: refusing to touch it");
fs.rmSync(LIB, { recursive: true, force: true }); fs.mkdirSync(LIB, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

let proc, dialogAnswer = LIB;
async function launch(env = {}) {
  proc = spawn(EXE, [], { env: { ...process.env, ...env, WEBVIEW2_USER_DATA_FOLDER: path.join(W, "wv2"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: "ignore" });
  let b;
  for (let i = 0; i < 60 && !b; i++) { try { b = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await sleep(500); } }
  const ctx = b.contexts()[0];
  let page;
  for (let i = 0; i < 40 && !page; i++) { page = ctx.pages().find((x) => x.url().includes("tauri.localhost")); if (!page) await sleep(250); }
  await page.route(/ipc\.localhost\/plugin%3Adialog%7Copen/, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Tauri-Response", "Tauri-Response": "ok" }, body: JSON.stringify(dialogAnswer) }));
  // The route attaches while the page is already booting, which can stall boot's first IPC (the
  // Plan 3 run-2 hang; QA ruled it a harness artifact). Reloading boots again under the route.
  await page.reload();
  page.on("pageerror", (e) => log("pageerror", e.message));
  page.on("console", (m) => m.type() === "error" && console.log("console.error ::", m.text().slice(0, 300)));
  page.on("request", (r) => /ipc\.localhost/.test(r.url()) && /dialog|create_library/.test(r.url()) && console.log("ipc ::", decodeURIComponent(r.url())));
  page.on("requestfailed", (r) => /ipc\.localhost/.test(r.url()) && console.log("ipc failed ::", decodeURIComponent(r.url()), r.failure()?.errorText));
  return { b, page };
}
async function closeApp(b) {
  try { execSync(`powershell -NoProfile -Command "(Get-Process -Id ${proc.pid}).CloseMainWindow() | Out-Null"`); } catch {}
  for (let i = 0; i < 300 && proc.exitCode === null; i++) await sleep(100);
  if (proc.exitCode === null) try { proc.kill(); } catch {}
  try { await b.close(); } catch {}
}
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + ".png") }).catch(() => {});
const text = (page, s) => page.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null, s);
const jsClick = (page, s) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error("no " + s); el.click(); }, s);
const focusId = (page) => page.evaluate(() => document.querySelector("#ref-id")?.title);
const center = async (page, s) => { const b = await page.locator(s).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const rectOf = (page, s) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height }; }, s);
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");

async function firstRun(page) {
  await page.waitForSelector(".firstrun", { timeout: 30000 });
  await sleep(1500);
  let picked = false;
  for (let i = 0; i < 4 && !picked; i++) {
    await page.click('[data-pick="create"]');
    try { await page.waitForFunction(() => /New library in/.test(document.querySelector(".firstrun")?.textContent || ""), null, { timeout: 8000 }); picked = true; } catch {}
    if (!picked) log(`first run pick ${i + 1}`, await text(page, ".firstrun"));
  }
  if (await page.locator('[data-fs="off"]').count()) await page.click('[data-fs="off"]');
  await page.waitForSelector("#fr-go:not([disabled])", { timeout: 15000 });
  const t0 = Date.now();
  await page.click("#fr-go");
  await page.waitForSelector(".firstrun", { state: "detached", timeout: 1800000 });
  await sleep(1500);
  log("first run: seeded s", ((Date.now() - t0) / 1000).toFixed(1));
  log("library count", await text(page, "#lib-count"));
}

async function main() {
  fs.mkdirSync(EXPORT, { recursive: true });
  if (fs.readdirSync(EXPORT).length) throw new Error("Export test is not empty");
  let { b, page } = await launch();
  pg = page;
  const titles = {};
  try {
    await firstRun(page);
    log("window", await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })));

    // ---------- Step 1: b on 10 references, new board "Harbour" ----------
    const chosen = [];
    const nonMembers = new Set();
    const remember = async () => {
      const id = await focusId(page);
      titles[id] = await text(page, '.cell[data-level="ref"] [data-v]');
      return id;
    };
    await check("step1", async () => {
      let id = await remember();
      await page.keyboard.press("b");
      await page.click(".board-menu .bm-new");
      await page.fill(".board-menu .bm-name", "Harbour");
      await page.keyboard.press("Enter");
      await page.waitForSelector('.board-menu input[data-board]:checked', { timeout: 5000 });
      await page.click(".board-menu .bm-close");
      chosen.push(id);
      for (let guard = 0; chosen.length < 10 && guard < 40; guard++) {
        const cands = await page.evaluate(() => [...document.querySelectorAll("#pane-ranked [data-go], #pane-callouts [data-go], #pane-links [data-go]")].map((e) => e.dataset.go));
        const next = cands.find((c) => !chosen.includes(c));
        cands.filter((c) => !chosen.includes(c)).forEach((c) => nonMembers.add(c));
        if (!next) { await jsClick(page, "#back"); await sleep(600); continue; }
        await jsClick(page, `[data-go="${next}"]`);
        await page.waitForFunction((n) => document.querySelector("#ref-id")?.title === n, next, { timeout: 5000 });
        await sleep(400);
        id = await remember();
        await page.keyboard.press("b");
        await page.waitForSelector(".board-menu", { timeout: 3000 });
        const box = page.locator('.board-menu input[data-board]').first();
        await box.check();
        await page.waitForFunction(() => document.querySelector(".board-menu input[data-board]")?.checked, null, { timeout: 3000 });
        await sleep(300);
        await page.click(".board-menu .bm-close");
        chosen.push(id);
      }
      chosen.forEach((c) => nonMembers.delete(c));
      return { members: chosen.length, boardsLine: await text(page, ".ref-boards") };
    });

    // ---------- Step 2: Boards, Alt+→ then Ctrl+Z ----------
    const order = () => page.evaluate(() => [...document.querySelectorAll(".bd-tile")].map((t) => t.dataset.id));
    await check("step2", async () => {
      await page.click('[data-view-tab="boards"]');
      await page.waitForSelector(".bd-tile", { timeout: 5000 });
      const before = await order();
      await page.focus('.bd-tile[data-i="0"]');
      await page.keyboard.press("Alt+ArrowRight");
      await page.waitForFunction((b0) => document.querySelector('.bd-tile[data-i="0"]')?.dataset.id !== b0, before[0], { timeout: 5000 });
      const moved = await order();
      await page.keyboard.press("Control+z");
      await page.waitForFunction((b0) => document.querySelector('.bd-tile[data-i="0"]')?.dataset.id === b0, before[0], { timeout: 5000 });
      const undone = await order();
      await shot(page, "s2-boards");
      return { tiles: before.length, swapped: moved[0] === before[1] && moved[1] === before[0], restored: JSON.stringify(undone) === JSON.stringify(before), focusAfterMove: await page.evaluate(() => document.activeElement?.dataset?.id ?? document.activeElement?.tagName) };
    });

    // ---------- Step 3: Show only this board ----------
    await check("step3", async () => {
      const boardIds = await order();
      await page.click('[data-act="scope"]');
      const status = await text(page, "#board-scope");
      await page.click('[data-view-tab="reference"]');
      await jsClick(page, `[data-go="${chosen[0]}"]`).catch(() => {});
      await sleep(900);
      const scored = await page.evaluate(() => [...document.querySelectorAll("#pane-ranked .row:not(.linked)")].map((r) => r.dataset.go));
      const outside = scored.filter((id) => !boardIds.includes(id));
      const outsideTitles = await page.evaluate((ids) => ids.map((id) => document.querySelector(`#pane-ranked [data-go="${id}"] b`)?.textContent), outside);
      const probe = [...nonMembers].find((id) => !boardIds.includes(id)) ?? outside[0];
      let searchOut = "no non-member seen";
      if (probe && titles[probe] === undefined) titles[probe] = await page.evaluate((p) => document.querySelector(`[data-go="${p}"] b`)?.textContent, probe);
      if (probe && titles[probe]) {
        await page.fill("#q", titles[probe]);
        await sleep(900);
        const hits = await page.evaluate(() => [...document.querySelectorAll("#q-results [data-r]")].map((e) => e.dataset.r));
        searchOut = { query: titles[probe], hitIds: hits.length, nonMemberHits: hits.filter((h) => !chosen.includes(h)).length };
        await page.fill("#q", "");
        await page.keyboard.press("Escape");
      }
      await shot(page, "s3-scope");
      return { status, boardTiles: boardIds.length, chosenEqualsTiles: [...chosen].sort().join() === [...boardIds].sort().join(), focus: await focusId(page), scoredRows: scored.length, outsideRows: outside.length, outsideTitles, search: searchOut };
    });

    // ---------- Step 4: export twice, credits, Open folder ----------
    await check("step4", async () => {
      await page.click('[data-view-tab="boards"]');
      dialogAnswer = EXPORT;
      const boardOrder = await order();
      await page.click('[data-act="export"]');
      await page.waitForFunction(() => /Exported/.test(document.querySelector("#import-notice [data-body]")?.textContent || ""), null, { timeout: 30000 });
      const toast1 = await text(page, "#import-notice [data-body]");
      const files1 = fs.readdirSync(EXPORT).sort();
      const hashes1 = Object.fromEntries(files1.map((f) => [f, sha(path.join(EXPORT, f))]));
      const credits = fs.readFileSync(path.join(EXPORT, "credits.txt"));
      const ctext = credits.toString("utf8");
      const blockFiles = [...ctext.matchAll(/^(\d\d - .+)$/gm)].map((m) => m[1]);
      const imgs = files1.filter((f) => /^\d\d - /.test(f));
      // Board order: block i's Title is board member i's title.
      const blockTitles = [...ctext.matchAll(/^Title: (.*)$/gm)].map((m) => m[1]);
      const wantTitles = boardOrder.map((id) => titles[id]);
      await page.click('[data-act="export"]');
      await page.waitForFunction((t) => (document.querySelector("#import-notice [data-body]")?.textContent || "") !== "" , null, { timeout: 30000 });
      await sleep(1500);
      const files2 = fs.readdirSync(EXPORT).sort();
      const unchanged = files1.every((f) => sha(path.join(EXPORT, f)) === hashes1[f]);
      // Open folder: which Explorer windows exist before and after.
      const explorers = () => { try { return execSync(`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).Windows() | ForEach-Object { $_.LocationURL }"`).toString().split(/\r?\n/).filter(Boolean); } catch { return []; } };
      const before = explorers();
      await page.click('#import-notice [data-act="reveal"]');
      let after = before;
      for (let i = 0; i < 20 && after.length === before.length; i++) { await sleep(500); after = explorers(); }
      const opened = after.filter((u) => !before.includes(u));
      await shot(page, "s4-export");
      await page.evaluate(() => document.querySelector("#import-dismiss")?.click());
      return {
        toast1, imageFiles: imgs.length, names: imgs.slice(0, 3).concat("…", imgs.slice(-1)),
        bom: credits.slice(0, 3).toString("hex") === "efbbbf", crlf: ctext.includes("\r"), blocks: blockFiles.length,
        blocksInBoardOrder: JSON.stringify(blockTitles) === JSON.stringify(wantTitles),
        secondExport: { total: files2.length, suffixed: files2.filter((f) => / \(2\)\./.test(f)).length, credits2: files2.includes("credits (2).txt"), firstFilesUnchanged: unchanged },
        openFolder: { newExplorerWindows: opened },
      };
    });

    // ---------- Step 5: lightbox zoom, pan, hover, draw at 400 %; T6 Tab while zoomed ----------
    await check("step5", async () => {
      await page.click('[data-view-tab="reference"]');
      await sleep(500);
      const tagsBefore = await page.evaluate(() => document.querySelectorAll("#pane-callouts .call").length);
      await page.keyboard.press("l");
      await page.waitForSelector(".lightbox .lb-stage", { timeout: 5000 });
      await sleep(1500);
      const [cx, cy] = await center(page, ".lightbox .lb-stage");
      await page.mouse.move(cx, cy);
      let zoom = await text(page, ".lb-zoom");
      for (let i = 0; i < 40 && parseInt(zoom) < 400; i++) { await page.mouse.wheel(0, -120); await sleep(80); zoom = await text(page, ".lb-zoom"); }
      const plate0 = await rectOf(page, ".lb-plate");
      await page.keyboard.down(" ");
      await page.mouse.down(); await page.mouse.move(cx - 120, cy - 80, { steps: 8 }); await page.mouse.up();
      await page.keyboard.up(" ");
      const plate1 = await rectOf(page, ".lb-plate");
      const hover = await page.evaluate(() => document.querySelectorAll(".lb-box").length);
      let hoverLabel = "no region tags on this reference";
      if (hover) {
        const r = await rectOf(page, ".lb-box");
        await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2);
        await sleep(300);
        hoverLabel = await page.evaluate(() => { const b = document.querySelector(".lb-box.is-hot .lb-tag"); return b ? getComputedStyle(b).visibility + "/" + getComputedStyle(b).display + ": " + b.textContent : "no .is-hot"; });
      }
      // T6: Tab onto a region while zoomed: the plate must not jump.
      const tabCheck = await (async () => {
        if (!hover) return "not checked (no region)";
        await page.focus(".lightbox .lb-stage");
        const a = await rectOf(page, ".lb-plate");
        await page.keyboard.press("Tab");
        await sleep(300);
        const z = await rectOf(page, ".lb-plate");
        const focused = await page.evaluate(() => document.activeElement?.className);
        return { focused, plateShift: [Math.round(z.x - a.x), Math.round(z.y - a.y)] };
      })();
      // Draw at 400 %: a drag inside the visible plate.
      const vp = await rectOf(page, ".lb-stage");
      const x1 = vp.x + vp.w * 0.4, y1 = vp.y + vp.h * 0.4, x2 = vp.x + vp.w * 0.55, y2 = vp.y + vp.h * 0.6;
      await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 10 });
      const pl = await rectOf(page, ".lb-plate"); // the plate the drag was drawn on
      const zoomAtDraw = await text(page, ".lb-zoom");
      await page.mouse.up();
      await page.waitForSelector(".lightbox .lb-side .picker", { timeout: 5000 });
      await sleep(300);
      const plAfterPicker = await rectOf(page, ".lb-plate"), zoomAfterPicker = await text(page, ".lb-zoom");
      const frac = { x: (x1 - pl.x) / pl.w, y: (y1 - pl.y) / pl.h, w: (x2 - x1) / pl.w, h: (y2 - y1) / pl.h };
      const boxesBefore = await page.evaluate(() => document.querySelectorAll(".lb-box").length);
      await page.keyboard.press("1");
      await sleep(300);
      await page.keyboard.press("Enter");
      await page.waitForFunction((n) => document.querySelectorAll(".lb-box").length > n, boxesBefore, { timeout: 8000 });
      await sleep(400);
      const newBox = async () => page.evaluate(() => { const bs = [...document.querySelectorAll(".lb-box")]; const p = document.querySelector(".lb-plate").getBoundingClientRect(); const r = bs[bs.length - 1].getBoundingClientRect(); return { x: (r.x - p.x) / p.width, y: (r.y - p.y) / p.height, w: r.width / p.width, h: r.height / p.height, px: { x: r.x, y: r.y, w: r.width, h: r.height } }; });
      const at400 = await newBox(); const zoomAfterTag = await text(page, ".lb-zoom");
      await page.focus(".lightbox .lb-stage"); await page.keyboard.press("0"); await sleep(500);
      const atFit = await newBox(); const zFit = await text(page, ".lb-zoom");
      await page.keyboard.press("1"); await sleep(500);
      const at100 = await newBox(); const z100 = await text(page, ".lb-zoom");
      const d = (a) => Math.max(Math.abs(a.x - frac.x), Math.abs(a.y - frac.y), Math.abs(a.w - frac.w), Math.abs(a.h - frac.h)).toFixed(4);
      await shot(page, "s5-lightbox");
      await page.keyboard.press("Escape");
      await sleep(400);
      if (await page.locator(".lightbox").count()) { await page.keyboard.press("Escape"); await sleep(300); }
      const tagsAfter = await page.evaluate(() => document.querySelectorAll("#pane-callouts .call").length);
      return {
        zoom, panMoved: [Math.round(plate1.x - plate0.x), Math.round(plate1.y - plate0.y)], hoverLabel, tabCheck,
        drawnPx400: { x1: Math.round(x1), y1: Math.round(y1), x2: Math.round(x2), y2: Math.round(y2) }, outlinePxAfterTag: at400.px,
        zoomAtDraw, zoomAfterPicker, zoomAfterTag, plateAtDraw: pl, plateAfterPicker: plAfterPicker,
        maxFracError: { at400: d(at400), atFit: d(atFit), at100: d(at100) }, zFit, z100, callouts: [tagsBefore, tagsAfter],
      };
    });

    // ---------- Hand checks T7: Shift+Enter; Esc keeps filter and pin ----------
    await check("hand-T7", async () => {
      await page.click("#tab-ranked");
      await sleep(300);
      const rowSel = "#pane-ranked .row:not(.linked)";
      await page.focus(rowSel);
      await page.keyboard.press("Shift+Enter");
      const viaShiftEnter = await page.waitForSelector(".compare", { timeout: 5000 }).then(() => true, () => false);
      await page.keyboard.press("Escape"); await sleep(400);
      await page.click("#tab-callouts"); await sleep(200);
      await page.keyboard.press("1"); // pin callout 1
      const filterBtn = await page.locator("#pane-callouts [data-filter]").count();
      if (filterBtn) await jsClick(page, "#pane-callouts [data-filter]");
      await sleep(300);
      const pinBefore = await page.evaluate(() => document.querySelector('.call[data-i="0"] .pin')?.getAttribute("aria-pressed"));
      const chipsBefore = await page.evaluate(() => document.querySelectorAll("#pane-ranked .chip").length);
      await page.click("#tab-ranked"); await sleep(200);
      const target = await page.evaluate(() => document.querySelector("#pane-ranked .row:not(.linked)")?.dataset.go);
      await page.click(`#pane-ranked [data-go="${target}"]`, { modifiers: ["Shift"] });
      await page.waitForSelector(".compare", { timeout: 5000 });
      await page.keyboard.press("Escape"); await sleep(500);
      const pinAfter = await page.evaluate(() => document.querySelector('.call[data-i="0"] .pin')?.getAttribute("aria-pressed"));
      const chipsAfter = await page.evaluate(() => document.querySelectorAll("#pane-ranked .chip").length);
      // clear the filter again for the next steps
      if (chipsAfter) await jsClick(page, "#clear-filter").catch(() => {});
      await page.keyboard.press("Escape");
      return { viaShiftEnter, pin: [pinBefore, pinAfter], filterChips: [chipsBefore, chipsAfter] };
    });

    // ---------- Step 6: Shift-click, Compare, Link these two ----------
    await check("step6", async () => {
      await page.click("#tab-ranked"); await sleep(300);
      const target = await page.evaluate(() => document.querySelector("#pane-ranked .row:not(.linked)")?.dataset.go);
      await page.click(`#pane-ranked [data-go="${target}"]`, { modifiers: ["Shift"] });
      await page.waitForSelector(".compare .cmp-mid", { timeout: 5000 });
      await sleep(600);
      const shared = await page.evaluate(() => [...document.querySelectorAll(".cmp-shared li")].map((l) => l.textContent.trim()));
      await shot(page, "s6-compare");
      log("step6 compare open", true);
      await page.click(".compare .cmp-link-btn");
      await page.waitForSelector(".link-editor .le-why", { timeout: 5000 });
      await page.fill(".link-editor .le-why", "same raking light");
      await page.click(".link-editor .le-save");
      await sleep(800);
      const linkLine = await text(page, ".compare .cmp-link");
      log("step6 saved", { linkLine, editors: await page.evaluate(() => document.querySelectorAll(".link-editor").length), active: await page.evaluate(() => document.activeElement?.className) });
      await page.keyboard.press("Escape"); await sleep(600);
      if (await page.locator(".compare").count()) { await page.keyboard.press("Escape"); await sleep(400); }
      log("step6 after Esc", await page.evaluate(() => ({ compare: document.querySelectorAll(".compare").length, view: document.body.dataset.view, editors: document.querySelectorAll(".link-editor").length })));
      await shot(page, "s6-after-esc");
      if (await page.locator(".compare").count()) { await page.click(".compare .cmp-close"); await sleep(500); }
      await page.click("#tab-ranked", { timeout: 5000 }); await sleep(400);
      const firstKid = await page.evaluate(() => { const p = document.querySelector("#pane-ranked"); const h = p.querySelector(".group-head"); const r = p.querySelector(".row:not(.linked)"); return { head: h?.textContent, headBeforeScored: !!h && (!r || !!(h.compareDocumentPosition(r) & 4)) }; });
      return { shared, linkLine, ranked: firstKid };
    });

    // ---------- Hand check T4: the link handle with a real mouse ----------
    await check("hand-T4", async () => {
      await page.click("#tab-ranked"); await sleep(300);
      const [hx, hy] = await center(page, "#lab .link-handle");
      const [tx, ty] = await center(page, "#pane-ranked .row:not(.linked)");
      await page.mouse.move(hx, hy); await page.mouse.down();
      await page.mouse.move((hx + tx) / 2, (hy + ty) / 2, { steps: 6 });
      const leader = await page.evaluate(() => !!document.querySelector(".link-leader"));
      await page.mouse.move(tx, ty, { steps: 6 }); await page.mouse.up();
      await sleep(400);
      const editors = await page.evaluate(() => document.querySelectorAll(".link-editor").length);
      const to = await text(page, ".link-editor .le-to");
      await shot(page, "hand-t4-drop");
      if (editors) await page.click(".link-editor .le-cancel");
      await page.mouse.move(hx, hy); await page.mouse.down();
      await page.mouse.move(hx - 80, hy - 60, { steps: 6 });
      await page.keyboard.press("Escape");
      const leaderAfterEsc = await page.evaluate(() => !!document.querySelector(".link-leader"));
      await page.mouse.move(tx, ty, { steps: 6 }); await page.mouse.up();
      await sleep(500);
      const editorsAfterEsc = await page.evaluate(() => document.querySelectorAll(".link-editor").length);
      await page.mouse.click(hx, hy); await sleep(300);
      const plainClick = await page.evaluate(() => !!document.querySelector(".link-editor .le-q"));
      if (plainClick) await page.click(".link-editor .le-cancel");
      return { leaderDuringDrag: leader, editorsAfterDrop: editors, to, leaderAfterEsc, editorsAfterEscAndRelease: editorsAfterEsc, plainClickOpensCombobox: plainClick };
    });

    // ---------- Step 7: three Ctrl+Z ----------
    await check("step7", async () => {
      const state = () => page.evaluate(() => ({ linked: !!document.querySelector("#pane-ranked .group-head"), links: document.querySelector("#links-count")?.textContent, callouts: document.querySelectorAll("#pane-callouts .call").length, scope: document.querySelector("#board-scope")?.textContent }));
      await page.focus("#tab-callouts");
      const s0 = await state();
      const steps = [];
      for (let i = 0; i < 3; i++) { await page.keyboard.press("Control+z"); await sleep(1200); steps.push(await state()); }
      return { before: s0, after: steps };
    });

    // ---------- Step 8: edit a link's note, quit within 0.5 s, relaunch ----------
    await check("step8-prepare", async () => {
      await page.click("#tab-links"); await sleep(300);
      await page.click("#pane-links [data-link-new]");
      await page.waitForSelector(".link-editor .le-q", { timeout: 3000 });
      await page.keyboard.press("Enter");
      await page.fill(".link-editor .le-why", "first note");
      await page.click(".link-editor .le-save");
      await page.waitForSelector("#pane-links [data-link-edit]", { timeout: 5000 });
      await sleep(1500); // the first note is saved
      await page.click("#pane-links [data-link-edit]");
      await page.fill(".link-editor .le-why", "edited just before quitting");
      const t0 = Date.now();
      await page.click(".link-editor .le-save");
      await page.waitForFunction(() => /edited just before quitting/.test(document.querySelector("#pane-links")?.textContent || ""), null, { timeout: 3000 });
      try { execSync(`powershell -NoProfile -Command "(Get-Process -Id ${proc.pid}).CloseMainWindow() | Out-Null"`); } catch {}
      const quitMs = Date.now() - t0;
      return { quitRequestedMsAfterSave: quitMs, focus: await focusId(page).catch(() => null) };
    });
    await closeApp(b);
    ({ b, page } = await launch());
    await check("step8", async () => {
      await page.waitForSelector("#lib-count:not(:empty)", { timeout: 30000 });
      await sleep(1500);
      const onDisk = fs.readFileSync(path.join(LIB, "library.json"), "utf8");
      await page.click("#tab-links").catch(() => {});
      return { noteOnDisk: onDisk.includes("edited just before quitting"), noteInLinksTab: /edited just before quitting/.test(await text(page, "#pane-links") || "") };
    });
  } catch (e) {
    log("ERROR", String(e && e.stack || e));
    await shot(page, "error");
  } finally {
    await closeApp(b);
    fs.rmSync(CONFIG, { recursive: true, force: true });
    for (const f of fs.readdirSync(EXPORT)) fs.rmSync(path.join(EXPORT, f), { recursive: true, force: true });
    fs.writeFileSync(path.join(W, "e2e-main.json"), JSON.stringify(out, null, 1));
  }
}

async function scale() {
  const { b, page } = await launch({ HORUS_DEMO_DIR: path.join(W, "perf2500") });
  try {
    await firstRun(page);
    await check("step9", async () => {
      const ids = await page.evaluate(async (lib) => (await window.__TAURI_INTERNALS__.invoke("open_library", { path: lib })).references.map((r) => r.id), LIB);
      await page.evaluate(async (ids) => window.__TAURI_INTERNALS__.invoke("create_board", { name: "Big", referenceIds: ids }), ids.slice(0, 2000));
      await page.reload();
      await page.waitForSelector("#lib-count:not(:empty)", { timeout: 60000 });
      await sleep(1500);
      await page.click('[data-view-tab="boards"]');
      await page.waitForSelector(".bd-tile", { timeout: 10000 });
      await sleep(1500);
      const count = () => page.evaluate(() => ({ imgs: document.querySelectorAll(".bd-grid img").length, tiles: document.querySelectorAll(".bd-tile").length, first: document.querySelector(".bd-tile")?.dataset.i }));
      const top = await count();
      await shot(page, "s9-top");
      await page.evaluate(() => { const g = document.querySelector(".bd-grid"); g.scrollTop = g.scrollHeight / 2; });
      await sleep(1500);
      const mid = await count();
      await shot(page, "s9-middle");
      // T5a hand check: drag-reorder while scrolled, with a real mouse.
      const pair = await page.evaluate(() => { const ts = [...document.querySelectorAll(".bd-tile")]; const vis = ts.filter((t) => { const r = t.getBoundingClientRect(); return r.top > 120 && r.bottom < innerHeight - 60; }); return vis.length > 2 ? [vis[0].dataset.i, vis[0].dataset.id, vis[2].dataset.i] : null; });
      let reorder = "not checked (no visible pair)";
      if (pair) {
        const [fi, fid, ti] = pair;
        const [sx, sy] = await center(page, `.bd-tile[data-i="${fi}"] .bd-plate`);
        const [tx, ty] = await center(page, `.bd-tile[data-i="${ti}"] .bd-plate`);
        await page.mouse.move(sx, sy); await page.mouse.down();
        await page.mouse.move(sx + 30, sy + 10, { steps: 5 });
        const ghost = await page.evaluate(() => !!document.querySelector(".bd-ghost"));
        await page.mouse.move(tx, ty, { steps: 10 }); await page.mouse.up();
        await page.waitForFunction(([ti, fid]) => document.querySelector(`.bd-tile[data-i="${ti}"]`)?.dataset.id === fid, [ti, fid], { timeout: 8000 }).catch(() => {});
        await sleep(500);
        reorder = { from: +fi, to: +ti, ghostShown: ghost, landed: await page.evaluate(([ti]) => document.querySelector(`.bd-tile[data-i="${ti}"]`)?.dataset.id, [ti]) === fid, scrollTopKept: await page.evaluate(() => Math.round(document.querySelector(".bd-grid").scrollTop)) };
      }
      return { top, middle: mid, reorder };
    });
  } catch (e) {
    log("ERROR", String(e && e.stack || e));
    await shot(page, "error");
  } finally {
    await closeApp(b);
    fs.rmSync(CONFIG, { recursive: true, force: true });
    fs.writeFileSync(path.join(W, "e2e-scale.json"), JSON.stringify(out, null, 1));
  }
}

(MODE === "scale" ? scale : main)();
