// Plan 5 QA (Find similar) as Mara (QA-PERSONA.md), on the real horus.exe over WebView2 CDP (port 9335).
// Run: node mara-plan5.js <work dir outside the repo> <exe> <phase>
//   main     first run "Turn on now" (model already installed), Settings, the Looks similar tab, the
//            search group, the drop target, board scope, live indexing (import + Pause/Resume + Galaxy
//            pan), switch off/on, light/dark shots. Leaves the config + library for "restart".
//   restart  relaunch twice: ready with no download and no re-index; then a truncated embeddings.bin.
//   notnow   first run "Not now": all surfaces absent, ORT not loaded; then the Settings switch.
//   download moves the installed model aside (restored in finally), routes the app through a local
//            CONNECT proxy (HTTPS_PROXY), cuts it mid-transfer, resumes, Remove model, a bad .part
//            (checksum copy) and a same-size garbage model (couldn't start copy).
// Needs <work dir>/fx: batch/ (120 jpg), "outside drop.png", "poster drop.jpg", "not an image.jpg".
// The exe folder needs ort/, resources/ and licenses/ next to horus.exe.
const { chromium } = require(process.env.APPDATA + "/npm/node_modules/playwright");
const { spawn, execSync } = require("child_process");
const fs = require("fs"), path = require("path"), net = require("net");

const [W, EXE, PHASE] = process.argv.slice(2);
if (!W || !EXE || !PHASE) throw new Error("usage: node mara-plan5.js <work dir> <exe> <main|restart|notnow|download>");
const FX = path.join(W, "fx"), SHOTS = path.join(W, "shots"), LIB = path.join(W, PHASE === "restart" ? "lib-main" : `lib-${PHASE}`);
const CONFIG = path.join(process.env.APPDATA, "art.horus.app");
const MODELS = path.join(process.env.LOCALAPPDATA, "art.horus.app", "models");
const MODEL = path.join(MODELS, "siglip-b16-224-q8"), KEEP = path.join(W, "model-keep");
const PORT = 9335, PROXY_PORT = 18765;
const FILES = [["onnx/vision_model_quantized.onnx", 99499129], ["onnx/text_model_quantized.onnx", 111475220], ["tokenizer.json", 2398744]];
const COPY = {
  first: "Turn on Find similar? It downloads a 150–350 MB image model and indexes your library in the background. Recommended for machines with 8 GB of RAM or more.",
  net: "Couldn't reach the download. Check your connection and try again.",
  sum: "The download didn't finish correctly. Try again.",
  start: "Find similar couldn't start on this computer.",
  confirm: "Remove the Find similar model and this library's index? You can download it again later.",
  credit: "SigLIP base (Google, Apache-2.0) · ONNX export by Xenova",
};
const DEMO = JSON.parse(fs.readFileSync(path.join(path.dirname(EXE), "resources/demo/manifest.json"), "utf8"));
const creatorOf = Object.fromEntries(DEMO.map((d) => [d.title, d.creator]));

const R = [], consoleErr = [], ipcLog = [];
const ok = (name, pass, detail = "") => { const d = typeof detail === "string" ? detail : JSON.stringify(detail); R.push({ name, pass, detail: d }); console.log(pass === null ? "NOTE" : pass ? "PASS" : "FAIL", name, "::", d); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, step = 100) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const settingsFile = () => readJson(path.join(CONFIG, "settings.json"));
const modelOk = (dir) => fs.existsSync(path.join(dir, ".ok")) && FILES.every(([f, n]) => { try { return fs.statSync(path.join(dir, f)).size === n; } catch { return false; } });

let proc, P, B, extraEnv = {}, dialogAnswer = LIB;
async function launch(tag) {
  ipcLog.length = 0;
  proc = spawn(EXE, [], { env: { ...process.env, ...extraEnv, WEBVIEW2_USER_DATA_FOLDER: path.join(W, "wv2"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: "ignore" });
  for (let i = 0; i < 60 && !B; i++) { try { B = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await sleep(500); } }
  const ctx = B.contexts()[0];
  let page;
  for (let i = 0; i < 40 && !page; i++) { page = ctx.pages().find((x) => x.url().includes("tauri.localhost")); if (!page) await sleep(250); }
  await page.route(/ipc\.localhost\/plugin%3Adialog%7Copen/, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Tauri-Response", "Tauri-Response": "ok" }, body: JSON.stringify(dialogAnswer) }));
  page.on("request", (r) => { const u = new URL(r.url()); if (u.hostname === "ipc.localhost") ipcLog.push(decodeURIComponent(u.pathname.slice(1))); });
  page.on("console", (m) => { if (m.type() === "error") consoleErr.push(`${tag}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => ok(`page error (${tag})`, false, e.message));
  page.setDefaultTimeout(8000); P = page;
  await page.emulateMedia({ colorScheme: "light" });
  return page;
}
async function closeApp() {
  try { execSync(`powershell -NoProfile -Command "(Get-Process -Id ${proc.pid}).CloseMainWindow() | Out-Null"`); } catch {}
  await until(() => proc.exitCode !== null, 30000, 100);
  if (proc.exitCode === null) try { proc.kill(); } catch {}
  try { await B.close(); } catch {}
  B = null;
}
const ortLoaded = () => { try { return /onnxruntime/i.test(execSync(`powershell -NoProfile -Command "(Get-Process -Id ${proc.pid}).Modules | ForEach-Object ModuleName"`).toString()); } catch (e) { return `? ${e.message}`; } };
const shot = (n) => P.screenshot({ path: path.join(SHOTS, `${PHASE}-${n}.png`) }).catch(() => {});
const text = (s) => P.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null, s);
const jsClick = (s) => P.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error("no " + s); el.click(); }, s);
const has = (s) => P.evaluate((s) => !!document.querySelector(s), s);
const status = () => P.evaluate(() => window.__TAURI_INTERNALS__.invoke("similar_status"));
const focusId = () => P.evaluate(() => document.querySelector("#ref-id")?.title);
const activeDesc = () => P.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.id ? "#" + a.id : ""}${a.getAttribute("role") ? "[" + a.getAttribute("role") + "]" : ""}${a.dataset?.act ? "{" + a.dataset.act + "}" : ""}` : "none"; });
const count = async () => Number(((await text("#lib-count")) || "").replace(/,/g, "").match(/\d+/)?.[0] ?? -1);
const ipcSince = (n, cmd) => ipcLog.slice(n).filter((c) => c === cmd).length;
const noticeText = () => P.evaluate(() => { const n = document.querySelector("#import-notice"); return n && !n.hidden ? n.textContent.replace(/\s+/g, " ").trim() : null; });
const noticeDone = (ms = 120000) => P.waitForFunction(() => { const n = document.querySelector("#import-notice"); const t = n?.querySelector("[data-body]")?.textContent || ""; return n && !n.hidden && t && !/Importing|Adding/.test(t); }, null, { timeout: ms });
const dismiss = () => P.evaluate(() => { const n = document.querySelector("#import-notice"); if (n && !n.hidden) document.querySelector("#import-dismiss")?.click(); });
async function waitPhase(want, ms) { const t0 = Date.now(); const s = await until(async () => { const s = await status(); return want.includes(s.phase) ? s : null; }, ms, 250); return { s, secs: ((Date.now() - t0) / 1000).toFixed(1) }; }
// Every status-bar text the page shows, from now on (window.__fsLog).
const watchBar = () => P.evaluate(() => {
  window.__fsLog = [];
  const el = document.querySelector("#find-similar");
  const rec = () => { const t = el.textContent.replace(/\s+/g, " ").trim(); if (window.__fsLog.at(-1) !== t) window.__fsLog.push(t); };
  rec(); new MutationObserver(rec).observe(el, { childList: true, subtree: true, characterData: true });
});
const barLog = () => P.evaluate(() => window.__fsLog || []);
async function block(name, fn) {
  try { await fn(); } catch (e) {
    ok(`${name}: block ran to the end`, false, String(e && e.message || e).split("\n").slice(0, 2).join(" | "));
    await shot(`error-${name}`);
    await P.keyboard.press("Escape").catch(() => {}); await P.keyboard.press("Escape").catch(() => {});
  }
}
const searchGo = async (q) => {
  await P.fill("#q", q); await sleep(900);
  const id = await P.evaluate(() => document.querySelector("#q-results [data-r]")?.dataset.r);
  if (!id) { await P.keyboard.press("Escape"); return null; }
  await jsClick(`#q-results [data-r="${id}"]`);
  await P.waitForFunction((n) => document.querySelector("#ref-id")?.title === n, id, { timeout: 5000 }).catch(() => {});
  await sleep(600); return id;
};
const refTitle = () => text('.cell[data-level="ref"] [data-v]');
async function openSimTab() { await jsClick("#tab-similar"); await P.waitForFunction(() => { const p = document.querySelector("#pane-similar"); return p && !p.hidden && !/Searching…/.test(p.textContent); }, null, { timeout: 15000 }); }
const simRows = () => P.evaluate(() => [...document.querySelectorAll("#pane-similar .sim-row")].map((r) => ({ id: r.dataset.refId, t: r.textContent.trim() })));
const groupState = () => P.evaluate(() => {
  const g = document.querySelector('#q-results [role="group"][aria-label="Looks similar"]');
  if (!g) return null;
  const all = [...document.querySelectorAll("#q-results li[id]")];
  const gi = all.findIndex((li) => g.contains(li));
  return { head: g.querySelector(".sim-head")?.textContent.trim(), hint: !!g.querySelector("#q-sim-hint"), note: g.querySelector(".sim-note")?.textContent.trim() ?? null,
    rows: [...g.querySelectorAll(".sim-opt")].map((li) => ({ id: li.dataset.r, t: li.textContent.trim() })), techBefore: all.slice(0, gi < 0 ? all.length : gi).filter((li) => li.dataset.t).length,
    simInTech: all.slice(0, gi < 0 ? all.length : gi).some((li) => li.classList.contains("sim-opt")) };
});
async function typeQuery(q, delay = 25) { await P.fill("#q", ""); await P.focus("#q"); await P.keyboard.type(q, { delay }); }
// Tauri's native drag events, as the OS would send them (physical px).
const dragEvt = (event, payload) => P.evaluate(([event, payload]) => window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event, payload }), [event, payload]);
async function dropAt(paths, xy) {
  const dpr = await P.evaluate(() => devicePixelRatio);
  await dragEvt("tauri://drag-enter", { paths, position: { x: xy[0] * dpr, y: xy[1] * dpr } }); await sleep(250);
  await dragEvt("tauri://drag-over", { position: { x: xy[0] * dpr, y: xy[1] * dpr } }); await sleep(250);
  return async (xy2) => { const p = xy2 || xy; await dragEvt("tauri://drag-drop", { paths, position: { x: p[0] * dpr, y: p[1] * dpr } }); };
}
async function zoneCenter() { const r = await P.evaluate(() => { const z = document.querySelector("[data-similar-drop]"); if (!z) return null; const b = z.getBoundingClientRect(); return b.width ? [b.x + b.width / 2, b.y + b.height / 2] : null; }); return r; }
async function rafGaps(ms, during) {
  await P.evaluate(() => { window.__gaps = []; let last = performance.now(); window.__rafOn = true; const f = (t) => { window.__gaps.push(t - last); last = t; if (window.__rafOn) requestAnimationFrame(f); }; requestAnimationFrame(f); });
  await during(); await P.evaluate(() => (window.__rafOn = false));
  const g = (await P.evaluate(() => window.__gaps)).slice(2).sort((a, b) => a - b);
  const q = (p) => g[Math.min(g.length - 1, Math.floor(p * g.length))]?.toFixed(1);
  return { n: g.length, p50: q(0.5), p95: q(0.95), max: g.at(-1)?.toFixed(1) };
}
async function galaxyPan() {
  await jsClick('[data-view-tab="galaxy"]');
  await P.waitForSelector('[data-view-host="galaxy"] canvas', { timeout: 20000 }); await sleep(2500);
  const b = await P.locator('[data-view-host="galaxy"] canvas').first().boundingBox();
  const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
  return rafGaps(0, async () => {
    await P.mouse.move(cx, cy); await P.mouse.down();
    for (let i = 0; i < 60; i++) { await P.mouse.move(cx + 200 * Math.sin(i / 6), cy + 120 * Math.cos(i / 6)); await sleep(50); }
    await P.mouse.up();
  });
}
const settingsOpen = () => has('.settings[role="dialog"]');
async function openSettings() { await P.click("#settings"); await P.waitForSelector('.settings [role="switch"]', { timeout: 8000 }); await sleep(400); }
const fsLine = () => text(".settings [data-line]");

async function firstRun(choice) {
  await P.waitForSelector(".firstrun", { timeout: 30000 });
  await sleep(1500);
  const fr = await P.evaluate(() => ({ copy: document.querySelector(".fr-copy")?.textContent, ram: document.querySelector("#fr-ram")?.textContent,
    pressed: [...document.querySelectorAll("[data-fs]")].map((b) => b.getAttribute("aria-pressed")), focus: document.activeElement?.dataset?.fs ?? null }));
  await until(() => P.evaluate(() => !/checking/.test(document.querySelector("#fr-ram")?.textContent || "")), 5000);
  fr.ram = await text("#fr-ram");
  let picked = false, misses = 0;
  for (let i = 0; i < 4 && !picked; i++) {
    await P.click('[data-pick="create"]');
    picked = !!(await until(() => P.evaluate(() => /New library in/.test(document.querySelector(".firstrun")?.textContent || "")), 8000, 200));
    if (!picked) misses++;
  }
  if (misses) ok("first run: library picker (harness dialog route)", null, `${misses} miss(es) before the pick landed`);
  await P.click(`[data-fs="${choice}"]`); await sleep(300);
  fr.after = await P.evaluate(() => [...document.querySelectorAll("[data-fs]")].map((b) => `${b.dataset.fs}:${b.getAttribute("aria-pressed")}`).join(" "));
  const enBefore = ipcSince(0, "similar_enable");
  await watchBar();
  await P.waitForSelector("#fr-go:not([disabled])", { timeout: 15000 });
  await P.click("#fr-go");
  await P.waitForSelector(".firstrun", { state: "detached", timeout: 600000 });
  await sleep(1500);
  fr.enableBeforeBegin = enBefore;
  return fr;
}

// ---------------------------------------------------------------- main
async function phaseMain() {
  if (!modelOk(MODEL)) throw new Error("model not installed at " + MODEL);
  await launch("main");
  const t0 = Date.now();
  const fr = await firstRun("on");
  ok("First run: SPEC §5a question verbatim", fr.copy === COPY.first, fr.copy);
  ok("First run: 'Download: 213 MB · This computer: N GB of RAM'", /^Download: 213 MB · This computer: \d+ GB of RAM$/.test(fr.ram), fr.ram);
  ok("First run: neither choice pre-selected or focused on load", fr.pressed.every((p) => p === "false") && fr.focus === null, `aria-pressed ${fr.pressed}; focus ${fr.focus}`);
  ok("First run: 'Turn on now' records the choice; no enable before Begin", /on:true/.test(fr.after) && /off:false/.test(fr.after) && fr.enableBeforeBegin === 0, `${fr.after}; similar_enable before Begin: ${fr.enableBeforeBegin}`);
  const { s, secs } = await waitPhase(["ready", "error"], 240000);
  const log = await barLog();
  ok("Turn on now with the model installed: ready, no download", s?.phase === "ready" && !log.some((t) => /downloading/.test(t)), `phase ${s?.phase} after ${secs}s from Begin (${((Date.now() - t0) / 1000).toFixed(0)}s from launch); indexed ${s?.indexed}/${s?.total}; status bar seen: ${JSON.stringify(log)}`);
  ok("Settings file: findSimilar on", settingsFile()?.findSimilar === "on", JSON.stringify(settingsFile()));
  ok("Status bar reads 'Find similar: ready'", (await text("#find-similar")) === "Find similar: ready", await text("#find-similar"));
  await shot("ready-reference");

  await block("settings", async () => {
    await P.click("#find-similar");
    await P.waitForSelector('.settings [role="switch"]', { timeout: 8000 }); await sleep(500);
    ok("Status bar click opens Settings at Find similar, focus on the switch", (await settingsOpen()) && (await activeDesc()) === "button[switch]{switch}", await activeDesc());
    const st = await P.evaluate(() => ({ checked: document.querySelector('.settings [role="switch"]').getAttribute("aria-checked"), desc: document.querySelector("#fs-desc")?.textContent, credit: document.querySelector(".fs-credit")?.textContent, disk: document.querySelector(".fs-disk")?.textContent.replace(/\s+/g, " ").trim(), remove: !!document.querySelector('[data-act="remove"]'), link: !!document.querySelector(".settings a") }));
    ok("Settings: switch on, Ready line, disk line, credit text (no link), description", st.checked === "true" && /^Ready · \d+ references indexed$/.test((await fsLine()) || "") && /^Disk space used: \d+ MB$/.test(st.disk) && st.credit === COPY.credit && !st.link && st.desc === COPY.first.replace(/^Turn on Find similar\? /, "") && st.remove, { line: await fsLine(), ...st });
    // Focus stays in the dialog.
    const outside = [];
    for (let i = 0; i < 8; i++) { await P.keyboard.press("Tab"); if (!(await P.evaluate(() => !!document.activeElement?.closest(".settings")))) outside.push(`Tab ${i + 1}: ${await activeDesc()}`); }
    ok("Settings: Tab x8 never leaves the dialog", outside.length === 0, outside.join(", ") || "inside");
    await P.focus('.settings [role="switch"]');
    const n0 = ipcLog.length;
    await P.click('.settings [data-act="remove"]'); await sleep(300);
    const q = await text("#fs-confirm-q"), f1 = await activeDesc();
    await P.keyboard.press("Escape"); await sleep(300);
    const afterEsc = { dialog: await settingsOpen(), confirm: await has(".fs-confirm") };
    await P.click('.settings [data-act="remove"]'); await sleep(300);
    await P.click('.settings [data-act="remove-cancel"]'); await sleep(300);
    ok("Remove model: confirmation copy; Esc cancels only the confirmation; Cancel calls nothing", q === COPY.confirm && afterEsc.dialog && !afterEsc.confirm && !(await has(".fs-confirm")) && ipcSince(n0, "similar_remove_model") === 0, `"${q}"; focus ${f1}; after Esc ${JSON.stringify(afterEsc)}; remove calls ${ipcSince(n0, "similar_remove_model")}`);
    await P.keyboard.press("Escape"); await sleep(400);
    ok("Esc closes Settings; focus back on the status-bar button", !(await settingsOpen()) && (await activeDesc()) === "button#find-similar", await activeDesc());
    await openSettings(); await P.keyboard.press("Escape"); await sleep(300);
    ok("Gear opens Settings; Esc returns focus to the gear", (await activeDesc()) === "button#settings", await activeDesc());
  });

  let divan = null;
  await block("tab", async () => {
    divan = await searchGo("Divan Japonais");
    ok("Search option A finds Divan Japonais", divan && (await refTitle()) === "Divan Japonais", `${divan} "${await refTitle()}"`);
    const ranked0 = await P.evaluate(() => document.querySelector("#pane-ranked")?.innerHTML);
    // Keyboard: arrow keys reach the inserted tab.
    await P.focus('.m-tab[data-pane="ranked"]');
    let hops = 0;
    while (hops < 6 && (await activeDesc()) !== "button#tab-similar[tab]") { await P.keyboard.press("ArrowRight"); hops++; await sleep(150); }
    ok("Looks similar tab: reachable with ArrowRight from Ranked", (await activeDesc()) === "button#tab-similar[tab]", `${hops} presses; ${await activeDesc()}; tabs ${JSON.stringify(await P.evaluate(() => [...document.querySelectorAll(".m-tab")].map((t) => t.textContent.trim())))}`);
    await P.keyboard.press("Enter"); await sleep(300);
    await openSimTab();
    const rows = await simRows();
    const top6 = rows.slice(0, 6).map((r) => r.t);
    const lautrec = top6.filter((t) => creatorOf[t] === "Henri de Toulouse-Lautrec").length;
    const note = await text("#pane-similar .pane-note");
    ok("Looks similar tab: note, rows by rank with no score", note === "Looks alike — not about technique." && rows.length > 0 && rows.every((r) => !/\b0\.\d|\d%|score/i.test(r.t)), `note "${note}"; ${rows.length} rows: ${JSON.stringify(rows.slice(0, 8).map((r) => r.t))}`);
    ok("Divan Japonais: other Lautrec posters near the top (Task 8 Step 1)", lautrec >= 3, `${lautrec} Lautrec in top 6: ${JSON.stringify(top6)}`);
    ok("Looks similar never lists the query reference itself", !rows.some((r) => r.id === divan), "");
    const ranked1 = await P.evaluate(() => document.querySelector("#pane-ranked")?.innerHTML);
    ok("Ranked (Related) unchanged by the Looks similar tab", ranked0 === ranked1 && !(await has("#pane-ranked .sim-row")), "");
    await shot("tab-light");
    await P.emulateMedia({ colorScheme: "dark" }); await sleep(400); await shot("tab-dark"); await P.emulateMedia({ colorScheme: "light" });
    // A row opens that reference (Mara clicks through).
    if (rows[0]) { await jsClick(`#pane-similar [data-ref-id="${rows[0].id}"]`); await sleep(800); ok("A Looks similar row opens its reference", (await focusId()) === rows[0].id, `${await refTitle()}`); }
  });

  await block("focus-leak", async () => {
    // Now on a reference reached from another (Back has somewhere to go).
    await openSettings();
    for (let i = 0; i < 6 && (await P.evaluate(() => !!document.activeElement?.closest(".settings"))); i++) await P.keyboard.press("Tab");
    const at = await activeDesc(), ref0 = await focusId(), t0 = await refTitle();
    if (await P.evaluate(() => !!document.activeElement?.closest(".settings"))) return ok("Focus past the dialog's last control", true, "focus stays inside");
    await P.keyboard.press("Escape"); await sleep(300);
    const stillOpen = await settingsOpen();
    await P.keyboard.press("Backspace"); await sleep(700);
    const t1 = await refTitle();
    ok("Focus past the dialog's last control: Esc still closes it, no key reaches the view behind", !stillOpen && (await focusId()) === ref0, `focus on ${at}; Esc there leaves the dialog open: ${stillOpen}; Backspace behind the open modal: "${t0}" -> "${t1}"`);
    await shot("focus-leak");
    if (await settingsOpen()) { await P.click('.settings [data-close]'); await sleep(300); }
  });

  await block("dropdown", async () => {
    let n0 = ipcLog.length;
    await typeQuery("boa", 30);
    const pend = await groupState();
    await sleep(1500);
    ok("Typing 3 keys fast: search x3, similar_by_text x1 (150 ms debounce), 'Searching…' meanwhile", ipcSince(n0, "search") === 3 && ipcSince(n0, "similar_by_text") === 1 && pend?.note === "Searching…", `search ${ipcSince(n0, "search")}, similar_by_text ${ipcSince(n0, "similar_by_text")}; right after typing: ${JSON.stringify(pend)}`);
    await P.keyboard.press("Escape");
    for (const q of ["a poster with bold flat colour", "a ship at sea", "a photo of a cat"]) {
      n0 = ipcLog.length;
      await typeQuery(q, 15); await sleep(1800);
      const g = await groupState();
      ok(`Typed "${q}": technique options first, then the Looks similar group with the English hint`, g && g.head?.startsWith("Looks similar") && g.hint && !g.simInTech && g.rows.length <= 4 && g.rows.every((r) => !/\b0\.\d|\d%/.test(r.t)), `${g?.techBefore} technique options before; rows ${JSON.stringify(g?.rows.map((r) => r.t.replace("reference · looks alike", "")))}; note ${g?.note}; by_text calls ${ipcSince(n0, "similar_by_text")}`);
      if (q === "a ship at sea") { await shot("dropdown-light"); await P.emulateMedia({ colorScheme: "dark" }); await sleep(300); await shot("dropdown-dark"); await P.emulateMedia({ colorScheme: "light" }); }
      await P.keyboard.press("Escape");
    }
    // Stale: type, then clear before option B answers.
    await typeQuery("harbour", 10); await P.fill("#q", ""); await sleep(1200);
    ok("A cleared field shows no late Looks similar group", !(await groupState()) && (await P.evaluate(() => document.querySelector("#q-results").hidden)), "");
    // Keyboard: arrow into the group's rows and open one with Enter.
    await typeQuery("a ship at sea", 10); await sleep(1800);
    const g = await groupState();
    if (g?.rows.length) {
      for (let i = 0; i < 40; i++) { const sel = await P.evaluate(() => document.querySelector('#q-results li[aria-selected="true"]')?.classList.contains("sim-opt")); if (sel) break; await P.keyboard.press("ArrowDown"); }
      const target = await P.evaluate(() => document.querySelector('#q-results li[aria-selected="true"]')?.dataset.r);
      await P.keyboard.press("Enter"); await sleep(900);
      ok("Keyboard: ArrowDown into the Looks similar group, Enter opens that reference", target && (await focusId()) === target, `${target} -> ${await refTitle()}`);
    } else ok("Keyboard into the group", null, "no rows to reach");
  });

  await block("drop", async () => {
    await typeQuery("boat", 10); await sleep(600);
    const z = await P.evaluate(() => { const z = document.querySelector("[data-similar-drop]"); return z && { text: z.textContent, inListbox: !!z.closest("#q-results"), shown: getComputedStyle(z).display !== "none" }; });
    ok("Drop target beside the open dropdown, outside the listbox", z && z.shown && !z.inListbox && z.text === "Drop an image to find similar", JSON.stringify(z));
    await shot("dropzone-open");
    await P.keyboard.press("Escape"); await P.evaluate(() => document.activeElement?.blur()); await sleep(300);
    const c0 = await count(); let n0 = ipcLog.length;
    let fin = await dropAt([path.join(FX, "poster drop.jpg")], [400, 400]);
    const zc = await zoneCenter();
    ok("During a drag the drop zone shows by the empty search field", !!zc, JSON.stringify(zc));
    await shot("dropzone-drag");
    await fin(zc); await sleep(2500);
    const g = await groupState();
    const lt = (g?.rows || []).filter((r) => creatorOf[r.t.replace("reference · looks alike", "").trim()] === "Henri de Toulouse-Lautrec").length;
    ok("Drop a poster on the zone: Looks similar group, no English hint, no import", ipcSince(n0, "similar_by_file") === 1 && ipcSince(n0, "import_paths") === 0 && (await count()) === c0 && g && !g.hint && g.rows.length > 0, `by_file ${ipcSince(n0, "similar_by_file")}, import_paths ${ipcSince(n0, "import_paths")}, count ${c0}->${await count()}; rows ${JSON.stringify(g?.rows.map((r) => r.t.replace("reference · looks alike", "")))} (${lt} Lautrec)`);
    await P.keyboard.press("Escape"); await sleep(300);
    // The same drop while the dropdown is open (the zone is shown by the open list, not the drag).
    n0 = ipcLog.length;
    await typeQuery("boat", 10); await sleep(700);
    const zc2 = await zoneCenter();
    fin = await dropAt([path.join(FX, "poster drop.jpg")], zc2); await fin(zc2); await sleep(2500);
    const g2 = await groupState();
    ok("Drop a poster on the zone with the dropdown open: searches, no import", ipcSince(n0, "similar_by_file") === 1 && ipcSince(n0, "import_paths") === 0 && g2 && !g2.hint && g2.rows.length > 0, `by_file ${ipcSince(n0, "similar_by_file")}, import_paths ${ipcSince(n0, "import_paths")}; rows ${JSON.stringify(g2?.rows.map((r) => r.t.replace("reference · looks alike", "")))}`);
    await shot("drop-result");
    await P.keyboard.press("Escape"); await sleep(300);
    n0 = ipcLog.length;
    await typeQuery("boat", 10); await sleep(700);
    fin = await dropAt([path.join(FX, "not an image.jpg")], await zoneCenter()); await fin(await zoneCenter()); await sleep(1500);
    ok("Drop a non-image on the zone: artist copy, no import", (await groupState())?.note === "Horus couldn't read that image." && ipcSince(n0, "import_paths") === 0, JSON.stringify(await groupState()));
    await P.keyboard.press("Escape");
    // Too large: a sparse file over MAX_BYTES (500 MiB).
    const big = path.join(FX, "huge scan.jpg");
    try {
      if (!fs.existsSync(big)) { fs.writeFileSync(big, ""); execSync(`fsutil sparse setflag "${big}"`); fs.truncateSync(big, 520 * 1024 * 1024); }
      n0 = ipcLog.length;
      await typeQuery("boat", 10); await sleep(700);
      fin = await dropAt([big], await zoneCenter()); await fin(await zoneCenter()); await sleep(1500);
      ok("Drop a >500 MiB file on the zone: 'too large' copy", (await groupState())?.note === "That image is too large to search with.", JSON.stringify(await groupState()));
      await P.keyboard.press("Escape");
    } catch (e) { ok("Too-large drop", null, `not run: ${e.message.split("\n")[0]}`); }
    // Elsewhere still imports (Plan 2 routing intact).
    n0 = ipcLog.length;
    fin = await dropAt([path.join(FX, "outside drop.png")], [600, 500]); await fin(); await noticeDone(60000).catch(() => {}); await sleep(800);
    ok("Drop elsewhere still imports (Plan 2 routing)", ipcSince(n0, "import_paths") === 1 && (await count()) === c0 + 1 && ipcSince(n0, "similar_by_file") === 0, `import_paths ${ipcSince(n0, "import_paths")}; count ${c0}->${await count()}; notice "${await noticeText()}"`);
    await dismiss();
  });

  await block("scope", async () => {
    await searchGo("Divan Japonais");
    await openSimTab();
    const rows = await simRows();
    const members = [await focusId()];
    await P.evaluate(() => document.activeElement?.blur());
    await P.keyboard.press("b");
    await P.click(".board-menu .bm-new"); await P.fill(".board-menu .bm-name", "Lautrec pitch"); await P.keyboard.press("Enter");
    await P.waitForSelector(".board-menu input[data-board]:checked", { timeout: 5000 }); await P.click(".board-menu .bm-close");
    for (const r of rows.slice(1, 3)) {
      await jsClick(`#pane-similar [data-ref-id="${r.id}"]`); await P.waitForFunction((n) => document.querySelector("#ref-id")?.title === n, r.id, { timeout: 5000 }); await sleep(500);
      await P.evaluate(() => document.activeElement?.blur());
      await P.keyboard.press("b"); await P.waitForSelector(".board-menu", { timeout: 3000 });
      await P.focus(".board-menu input[data-board]"); await P.keyboard.press(" "); await sleep(400); await P.click(".board-menu .bm-close");
      members.push(r.id);
    }
    await jsClick('[data-view-tab="boards"]'); await sleep(800);
    await P.click('.bd-pick:has-text("Lautrec pitch")').catch(() => {});
    await P.click('.bd-head [data-act="scope"]'); await sleep(600);
    ok("Board scope on (Boards view)", /Lautrec pitch/.test((await text("#board-scope")) || ""), await text("#board-scope"));
    await jsClick('[data-view-tab="reference"]'); await sleep(600);
    await searchGo("Divan Japonais");
    await openSimTab(); await sleep(600);
    const inScope = await simRows();
    ok("Scope: the Looks similar tab lists board members only", inScope.length > 0 && inScope.every((r) => members.includes(r.id)), `${inScope.length} rows, ${inScope.filter((r) => !members.includes(r.id)).length} outside; members ${members.length}`);
    await typeQuery("a poster with bold flat colour", 10); await sleep(1800);
    const g = await groupState();
    ok("Scope: the search group lists board members only", g && g.rows.every((r) => members.includes(r.id)), `rows ${JSON.stringify(g?.rows.map((r) => r.t))}; note ${g?.note}`);
    await P.keyboard.press("Escape");
    await P.evaluate(() => document.querySelector("#board-scope [data-scope-clear]")?.click()); await sleep(800);
    const back = await simRows();
    ok("Scope cleared: the tab's other rows come back", back.length > inScope.length, `${inScope.length} -> ${back.length}`);
  });

  await block("indexing", async () => {
    const c0 = await count(); let n0 = ipcLog.length;
    const fin = await dropAt([path.join(FX, "batch")], [600, 500]); await fin();
    const st = await until(async () => { const s = await status(); return s.phase === "indexing" ? s : null; }, 120000, 200);
    ok("Import 120 while on: indexing starts by itself", !!st, `${JSON.stringify(st && { indexed: st.indexed, total: st.total })}; bar "${await text("#find-similar")}"`);
    await noticeDone(180000).catch(() => {}); await dismiss();
    ok("Import added 120", (await count()) === c0 + 120, `${c0} -> ${await count()}`);
    const last = await searchGo("qa batch 119");
    let note = null;
    if (last) { await openSimTab(); note = await text("#pane-similar"); }
    ok("A not-yet-indexed reference: 'This reference isn't indexed yet.' (or rows if already indexed)", last && /This reference isn't indexed yet\.|Looks alike/.test(note || ""), `${last} "${note?.slice(0, 90)}"`);
    await openSettings();
    const l1 = await fsLine();
    await P.click('.settings [data-act="pause"]');
    const ps = await until(async () => { const s = await status(); return s.phase === "paused" ? s : null; }, 8000, 100);
    await sleep(3000);
    const ps2 = await status();
    const l2 = await fsLine(), bar = await text("#find-similar");
    ok("Pause: stops within one batch (16) and stays stopped; line + status bar say paused", ps && ps2.phase === "paused" && ps2.indexed - ps.indexed <= 16 && /^Indexing paused · \d+ of \d+$/.test(l2 || "") && bar === "Find similar: paused" && (await has('.settings [data-act="resume"]')), `before "${l1}"; paused at ${ps?.indexed}, 3 s later ${ps2.indexed}; "${l2}"; bar "${bar}"; focus ${await activeDesc()}`);
    await P.click('.settings [data-act="resume"]');
    const rs = await until(async () => { const s = await status(); return s.phase === "indexing" && s.indexed > ps2.indexed ? s : null; }, 10000, 200);
    ok("Resume continues indexing", !!rs, `${ps2.indexed} -> ${rs?.indexed}; line "${await fsLine()}"`);
    await P.keyboard.press("Escape"); await sleep(300);
    const pan = (await status()).phase === "indexing" ? await galaxyPan() : null;
    const during = (await status()).phase;
    ok("NOT CHECKED in T8: Galaxy pan while indexing (rAF gaps, ms)", pan ? Number(pan.p95) < 50 : null, `${JSON.stringify(pan)}; still ${during} after the pan`);
    const rd = await waitPhase(["ready"], 240000);
    const pan2 = await galaxyPan();
    ok("Galaxy pan at ready (baseline, ms)", null, JSON.stringify(pan2));
    ok("Indexing finishes: ready, indexed = total", rd.s?.phase === "ready" && rd.s.indexed === rd.s.total, `${rd.s?.indexed}/${rd.s?.total} after ${rd.secs}s more`);
    await jsClick('[data-view-tab="reference"]'); await sleep(600);
    if (last) { await searchGo("qa batch 119"); await openSimTab(); const r = await simRows(); ok("After indexing the new reference has Looks similar rows", r.length > 0, `${r.length} rows: ${JSON.stringify(r.slice(0, 4).map((x) => x.t))}`); }
  });

  await block("off-on", async () => {
    await searchGo("Divan Japonais"); await openSimTab();
    await openSettings();
    await P.click('.settings [role="switch"]');
    await waitPhase(["off"], 15000); await sleep(800);
    const sw = await P.evaluate(() => document.querySelector('.settings [role="switch"]').getAttribute("aria-checked"));
    const disk = await text(".fs-disk");
    await P.keyboard.press("Escape"); await sleep(400);
    const dom = await P.evaluate(() => ({ tab: !!document.querySelector('#tab-similar, [data-pane="similar"]'), pane: !!document.querySelector("#pane-similar"), group: !!document.querySelector('[aria-label="Looks similar"]'), drop: !!document.querySelector("[data-similar-drop]"), selected: document.querySelector('.m-tab[aria-selected="true"]')?.dataset.pane }));
    ok("Switch off with the tab open: tab, pane, group and drop target gone; Callouts selected", !dom.tab && !dom.pane && !dom.group && !dom.drop && dom.selected === "callouts" && sw === "false", `${JSON.stringify(dom)}; switch ${sw}; disk "${disk}"; bar "${await text("#find-similar")}"`);
    ok("Off keeps the files (disk line still there) and saves findSimilar off", /Disk space used/.test(disk || "") && settingsFile()?.findSimilar === "off", `${disk}; ${JSON.stringify(settingsFile())}`);
    const n0 = ipcLog.length;
    await typeQuery("a ship at sea", 15); await sleep(1500);
    ok("Off: typing calls only option A", ipcSince(n0, "similar_by_text") === 0 && ipcSince(n0, "search") > 0 && !(await groupState()), `search ${ipcSince(n0, "search")}, similar_by_text ${ipcSince(n0, "similar_by_text")}`);
    await P.keyboard.press("Escape");
    const n1 = ipcLog.length;
    const fin = await dropAt([path.join(FX, "poster drop.jpg")], [400, 400]);
    const zone = await zoneCenter();
    await fin([600, 500]); await noticeDone(60000).catch(() => {}); await sleep(500);
    ok("Off: a drag shows no drop zone; the drop imports as usual (duplicate)", !zone && ipcSince(n1, "similar_by_file") === 0 && ipcSince(n1, "import_paths") === 1, `zone ${JSON.stringify(zone)}; notice "${await noticeText()}"`);
    await dismiss();
    await openSettings();
    const t0 = Date.now();
    await P.click('.settings [role="switch"]');
    const r = await waitPhase(["ready", "error"], 120000);
    ok("Switch on again: ready from the kept files, no download", r.s?.phase === "ready" && !(await barLog()).some((t) => /downloading \d/.test(t)), `${r.s?.phase} in ${((Date.now() - t0) / 1000).toFixed(1)}s; line "${await fsLine()}"`);
    await P.keyboard.press("Escape"); await sleep(400);
    ok("On again: the tab is back", await has("#tab-similar"), "");
    await openSettings(); await P.emulateMedia({ colorScheme: "dark" }); await sleep(300); await shot("settings-dark"); await P.emulateMedia({ colorScheme: "light" }); await sleep(300); await shot("settings-light"); await P.keyboard.press("Escape");
  });
  const s2 = await status();
  fs.writeFileSync(path.join(W, "main-state.json"), JSON.stringify({ indexed: s2.indexed, total: s2.total, emb: fs.statSync(path.join(LIB, "embeddings.bin")).size }));
  await closeApp();
}

// ---------------------------------------------------------------- restart
async function phaseRestart() {
  const prev = readJson(path.join(W, "main-state.json"));
  const emb = path.join(LIB, "embeddings.bin");
  const m0 = fs.statSync(emb).mtimeMs, z0 = fs.statSync(emb).size;
  await launch("restart1");
  await P.waitForSelector("#q", { timeout: 30000 }); await watchBar();
  let r = await waitPhase(["ready", "error"], 120000);
  ok("Restart: ready again with no download, nothing re-indexed", r.s?.phase === "ready" && r.s.indexed === prev.total && !(await barLog()).some((t) => /downloading \d/.test(t)) && fs.statSync(emb).size === z0, `${r.s?.indexed}/${r.s?.total} in ${r.secs}s; bar ${JSON.stringify(await barLog())}; embeddings.bin ${z0} B, rewritten ${fs.statSync(emb).mtimeMs !== m0}`);
  ok("Restart: ORT loaded (feature on)", ortLoaded() === true, "");
  await closeApp();
  const cut = 1000 + Math.floor(z0 / 3);
  fs.truncateSync(emb, cut);
  await launch("restart2");
  await P.waitForSelector("#q", { timeout: 30000 });
  r = await waitPhase(["ready", "error"], 240000);
  ok("Truncated embeddings.bin: rebuilt, no crash, ready", r.s?.phase === "ready" && r.s.indexed === prev.total && fs.statSync(emb).size === z0, `cut to ${cut} B; ${r.s?.indexed}/${r.s?.total} in ${r.secs}s; size now ${fs.statSync(emb).size}`);
  await searchGo("Divan Japonais"); await openSimTab();
  ok("After the rebuild the tab lists results", (await simRows()).length > 0, `${(await simRows()).length} rows`);
  await closeApp();
}

// ---------------------------------------------------------------- notnow
async function phaseNotNow() {
  await launch("notnow");
  const fr = await firstRun("off");
  ok("Not now: choice recorded off, no enable", fr.after === "on:false off:true" && settingsFile()?.findSimilar === "off" && ipcSince(0, "similar_enable") === 0, `${fr.after}; ${JSON.stringify(settingsFile())}`);
  await sleep(1500);
  await searchGo("Divan Japonais");
  const dom = await P.evaluate(() => ({ tab: !!document.querySelector('[data-pane="similar"]'), group: !!document.querySelector('[aria-label="Looks similar"]'), drop: !!document.querySelector("[data-similar-drop]") }));
  ok("Off from first run: no tab, no group, no drop target in the DOM", !dom.tab && !dom.group && !dom.drop, JSON.stringify(dom));
  const n0 = ipcLog.length;
  await typeQuery("a ship at sea", 15); await sleep(1500);
  ok("Off: typed search calls only option A", ipcSince(n0, "similar_by_text") === 0 && !(await groupState()), `search ${ipcSince(n0, "search")}`);
  await P.keyboard.press("Escape");
  ok("Off: ONNX Runtime is not loaded in horus.exe", ortLoaded() === false, String(ortLoaded()));
  ok("Status bar 'Find similar: off'", (await text("#find-similar")) === "Find similar: off", await text("#find-similar"));
  await openSettings();
  ok("Settings while off: switch unchecked, no progress line", (await P.evaluate(() => document.querySelector('.settings [role="switch"]').getAttribute("aria-checked"))) === "false" && !(await has(".settings [data-line]")), `disk "${await text(".fs-disk")}"`);
  await watchBar();
  await P.keyboard.press("Tab"); // focus on the switch, then Space (keyboard only)
  while ((await activeDesc()) !== "button[switch]{switch}") await P.keyboard.press("Tab");
  await P.keyboard.press(" ");
  const r = await waitPhase(["ready", "error"], 180000);
  ok("Settings switch (Space) turns it on: loading, indexing, ready; no download", r.s?.phase === "ready" && r.s.indexed === r.s.total && !(await barLog()).some((t) => /downloading \d/.test(t)), `${r.s?.indexed}/${r.s?.total} in ${r.secs}s; bar ${JSON.stringify(await barLog())}; line "${await fsLine()}"`);
  ok("On: ONNX Runtime now loaded", ortLoaded() === true, "");
  await P.keyboard.press("Escape"); await sleep(400);
  ok("On: tab inserted on the open Reference view", await has("#tab-similar"), "");
  await closeApp();
}

// ---------------------------------------------------------------- download
function proxy({ cutAt = Infinity } = {}) {
  const socks = new Set(); let bytes = 0, cut = false;
  const srv = net.createServer((c) => {
    socks.add(c);
    pxLog.push("conn");
    c.on("error", (e) => pxLog.push("client err " + e.message));
    c.once("data", (h) => {
      pxLog.push(h.toString().split("\r\n")[0]);
      const m = /^CONNECT ([^:]+):(\d+)/.exec(h.toString());
      if (!m) return c.destroy();
      const u = net.connect(+m[2], m[1], () => { c.write("HTTP/1.1 200 Connection Established\r\n\r\n"); u.pipe(c); c.pipe(u); });
      socks.add(u);
      u.on("data", (d) => { bytes += d.length; if (!cut && bytes > cutAt) { cut = true; kill(); } });
      u.on("error", () => c.destroy()); c.on("error", () => u.destroy());
    });
  });
  const kill = () => { srv.close(); for (const s of socks) s.destroy(); };
  srv.on("error", (e) => pxLog.push("server err " + e.message));
  return new Promise((res) => srv.listen(PROXY_PORT, "127.0.0.1", () => res({ kill, bytes: () => bytes, isCut: () => cut })));
}
const pxLog = [];
// A crash must never leave the shared model moved aside.
process.on("exit", () => { if (fs.existsSync(KEEP)) { fs.rmSync(MODEL, { recursive: true, force: true }); fs.renameSync(KEEP, MODEL); console.log("exit: model restored"); } });
async function phaseDownload() {
  if (fs.existsSync(KEEP)) throw new Error("model-keep exists: restore it first");
  if (!modelOk(MODEL)) throw new Error("model not installed at " + MODEL);
  fs.renameSync(MODEL, KEEP);
  fs.writeFileSync(path.join(W, "MODEL-MOVED.txt"), `${MODEL} was moved to ${KEEP}\n`);
  let px = null;
  try {
    extraEnv = { HTTPS_PROXY: `http://127.0.0.1:${PROXY_PORT}`, HTTP_PROXY: `http://127.0.0.1:${PROXY_PORT}` };
    await launch("download");
    // 1. No network at first run.
    await firstRun("on");
    const nt = await until(noticeText, 60000, 250);
    ok("First run 'Turn on now' with no network: the notice shows artist copy + Open Settings", nt?.startsWith(`${COPY.net}Open Settings`), nt);
    ok("Network error: findSimilar saved off; status bar 'needs attention'", settingsFile()?.findSimilar === "off" && (await text("#find-similar")) === "Find similar: needs attention", `${JSON.stringify(settingsFile())}; bar "${await text("#find-similar")}"`);
    await P.click("#import-notice [data-open-settings]");
    await P.waitForSelector('.settings [data-act="retry"]', { timeout: 8000 });
    ok("Open Settings: error copy + Try again", (await fsLine()) === COPY.net, await fsLine());
    // 2. Mid-transfer cut (simulated with the proxy; the Wi-Fi itself is not touched).
    px = await proxy({ cutAt: 60e6 });
    await watchBar();
    await P.click('.settings [data-act="retry"]');
    const dl = await until(async () => { const l = await fsLine(); return /^Downloading the model · \d+ MB of 213 MB$/.test(l || "") && (await has(".settings progress.fs-bar")) ? l : null; }, 30000, 200);
    await shot("downloading");
    ok("Downloading: 'Downloading the model · N MB of 213 MB' + a progress bar; status bar %", !!dl, `${dl}; bar "${await text("#find-similar")}"`);
    const er = await waitPhase(["error", "ready"], 300000);
    const parts = fs.existsSync(MODEL) ? execSync(`dir /s /b "${MODEL}"`, { shell: "cmd.exe" }).toString().trim().split(/\r?\n/).map((f) => `${path.basename(f)} ${fs.statSync(f).size}`) : [];
    ok("Connection cut mid-transfer: network copy + Try again, partial files kept", er.s?.phase === "error" && er.s.error === COPY.net && (await fsLine()) === COPY.net && (await has('.settings [data-act="retry"]')), `cut after ${(px.bytes() / 1e6).toFixed(1)} MB relayed; status ${JSON.stringify({ phase: er.s?.phase, done: er.s?.downloadDone, error: er.s?.error })}; files ${JSON.stringify(parts)}`);
    ok("Proxy log (harness)", null, JSON.stringify(pxLog.slice(0, 12)));
    if (!px.isCut()) throw new Error("the proxy never cut the transfer: stop here");
    const doneAtCut = Math.max(er.s?.downloadDone || 0, ...parts.map((p) => Number(p.split(" ").pop())));
    // 3. Try again resumes.
    px.kill();
    px = await proxy();
    await P.click('.settings [data-act="retry"]');
    const first = await until(async () => { const s = await status(); return s.phase === "downloading" && s.downloadDone > 0 ? s : null; }, 30000, 100);
    const t0 = Date.now();
    const rd = await waitPhase(["ready", "error"], 480000);
    ok("Try again resumes from the partial files, verifies, indexes, ready", first && first.downloadDone >= 0.8 * Math.min(doneAtCut, 60e6) && rd.s?.phase === "ready" && modelOk(MODEL), `first status after retry ${first?.downloadDone} B (had ~${doneAtCut}); ready in ${((Date.now() - t0) / 1000).toFixed(0)}s; model ok ${modelOk(MODEL)}; bar ${JSON.stringify((await barLog()).slice(-6))}`);
    ok("Download relayed ~213 MB minus the resumed part (no restart from 0)", px.bytes() < 213.4e6 - 0.5 * doneAtCut, `${(px.bytes() / 1e6).toFixed(1)} MB relayed after retry`);
    // 4. Remove model.
    const n0 = ipcLog.length;
    await P.click('.settings [data-act="remove"]'); await sleep(300);
    await P.click('.settings [data-act="remove-cancel"]'); await sleep(300);
    await P.click('.settings [data-act="remove"]'); await sleep(300);
    await P.click('.settings [data-act="remove-confirm"]');
    const off = await waitPhase(["off"], 20000); await sleep(800);
    ok("Remove model: confirm then gone (model dir, embeddings.bin, disk line); feature off", off.s?.diskBytes === 0 && !fs.existsSync(MODEL) && !fs.existsSync(path.join(LIB, "embeddings.bin")) && !(await has(".fs-disk")) && ipcSince(n0, "similar_remove_model") === 1 && settingsFile()?.findSimilar === "off", `disk ${off.s?.diskBytes}; model dir ${fs.existsSync(MODEL)}; embeddings ${fs.existsSync(path.join(LIB, "embeddings.bin"))}; calls ${ipcSince(n0, "similar_remove_model")}`);
    await P.keyboard.press("Escape"); await sleep(300);
    ok("After Remove: no tab, group or drop target", !(await has('[data-pane="similar"], [data-similar-drop]')), "");
    // 5. A bad .part: the checksum copy.
    fs.mkdirSync(path.join(MODEL, "onnx"), { recursive: true });
    for (const f of ["onnx/vision_model_quantized.onnx", "onnx/text_model_quantized.onnx"]) fs.copyFileSync(path.join(KEEP, f), path.join(MODEL, f));
    fs.writeFileSync(path.join(MODEL, "tokenizer.json.part"), Buffer.alloc(2398743, 0x41));
    await openSettings(); await P.click('.settings [role="switch"]');
    const sm = await waitPhase(["error", "ready"], 120000);
    ok("Wrong bytes (.part of garbage): checksum copy, .part deleted, feature off", sm.s?.phase === "error" && sm.s.error === COPY.sum && !fs.existsSync(path.join(MODEL, "tokenizer.json.part")) && settingsFile()?.findSimilar === "off", `${JSON.stringify({ phase: sm.s?.phase, error: sm.s?.error })}; .part ${fs.existsSync(path.join(MODEL, "tokenizer.json.part"))}; ${JSON.stringify(settingsFile())}`);
    await P.keyboard.press("Escape");
    // 6. A same-size garbage model with .ok: couldn't start.
    fs.copyFileSync(path.join(KEEP, "tokenizer.json"), path.join(MODEL, "tokenizer.json"));
    const fd = fs.openSync(path.join(MODEL, "onnx/vision_model_quantized.onnx"), "r+"); fs.writeSync(fd, Buffer.alloc(4096, 0x5a), 0, 4096, 0); fs.writeSync(fd, Buffer.alloc(4096, 0x5a), 0, 4096, 50e6); fs.closeSync(fd);
    fs.writeFileSync(path.join(MODEL, ".ok"), "");
    await openSettings(); await P.click('.settings [role="switch"]');
    const cs = await waitPhase(["error", "ready"], 120000);
    ok("Damaged model file: 'couldn't start' copy, feature off", cs.s?.phase === "error" && cs.s.error === COPY.start && settingsFile()?.findSimilar === "off", JSON.stringify({ phase: cs.s?.phase, error: cs.s?.error, fs: settingsFile()?.findSimilar }));
    await P.keyboard.press("Escape"); await sleep(300);
    ok("After the load error the app still works: option A search answers", (await searchGo("Divan Japonais")) !== null && !(await has('[data-pane="similar"]')), await refTitle());
    await closeApp();
  } finally {
    try { px?.kill(); } catch {}
    if (B) await closeApp().catch(() => {});
    if (fs.existsSync(KEEP)) { fs.rmSync(MODEL, { recursive: true, force: true }); fs.renameSync(KEEP, MODEL); }
    ok("Model restored to %LOCALAPPDATA% (.ok + pinned sizes)", modelOk(MODEL), MODEL);
    if (modelOk(MODEL)) fs.rmSync(path.join(W, "MODEL-MOVED.txt"), { force: true });
  }
}

// ---------------------------------------------------------------- damaged (no network: the proxy port is closed)
const settle = async (ms = 3000) => { let last = JSON.stringify(await status()); for (let t = 0; t < 20; t++) { await sleep(ms / 3); const s = JSON.stringify(await status()); if (s === last) return JSON.parse(s); last = s; } return JSON.parse(last); };
async function phaseDamaged() {
  if (fs.existsSync(KEEP)) throw new Error("model-keep exists: restore it first");
  if (!modelOk(MODEL)) throw new Error("model not installed at " + MODEL);
  fs.renameSync(MODEL, KEEP);
  try {
    fs.cpSync(KEEP, MODEL, { recursive: true });
    extraEnv = { HTTPS_PROXY: `http://127.0.0.1:${PROXY_PORT}`, HTTP_PROXY: `http://127.0.0.1:${PROXY_PORT}` };
    await launch("damaged");
    await firstRun("on");
    const r = await waitPhase(["ready", "error"], 180000);
    ok("Intact copy: ready", r.s?.phase === "ready", `${r.s?.indexed}/${r.s?.total}`);
    await openSettings();
    await P.click('.settings [data-act="remove"]'); await sleep(300);
    await P.click('.settings [data-act="remove-confirm"]');
    const s = await settle();
    await sleep(500);
    ok("Remove model (settled): phase off, diskBytes 0, no disk line, files gone, findSimilar off", s.phase === "off" && s.diskBytes === 0 && !(await has(".fs-disk")) && !fs.existsSync(MODEL) && !fs.existsSync(path.join(LIB, "embeddings.bin")) && settingsFile()?.findSimilar === "off", `status ${JSON.stringify({ phase: s.phase, diskBytes: s.diskBytes })}; disk line "${await text(".fs-disk")}"; model dir ${fs.existsSync(MODEL)}; embeddings ${fs.existsSync(path.join(LIB, "embeddings.bin"))}; ${settingsFile()?.findSimilar}`);
    await shot("after-remove");
    await P.keyboard.press("Escape"); await sleep(300);
    // Same-size damaged vision file with the .ok marker: loading must fail, not hang or crash.
    fs.cpSync(KEEP, MODEL, { recursive: true });
    const fd = fs.openSync(path.join(MODEL, "onnx/vision_model_quantized.onnx"), "r+"); fs.writeSync(fd, Buffer.alloc(65536, 0x5a), 0, 65536, 0); fs.closeSync(fd);
    await openSettings();
    await P.click('.settings [role="switch"]');
    await until(async () => (await status()).phase !== "off", 10000, 50);
    const e = await waitPhase(["error", "ready"], 120000); const e2 = await settle();
    ok("Damaged model file: artist copy, feature off, app keeps working", e2.phase === "error" && [COPY.start, COPY.sum].includes(e2.error) && settingsFile()?.findSimilar === "off" && (await fsLine()) === e2.error, `${JSON.stringify({ phase: e2.phase, error: e2.error })}; findSimilar ${settingsFile()?.findSimilar}; line "${await fsLine()}"; vision file now ${fs.existsSync(path.join(MODEL, "onnx/vision_model_quantized.onnx")) ? fs.statSync(path.join(MODEL, "onnx/vision_model_quantized.onnx")).size : "gone"}; ORT loaded ${ortLoaded()}`);
    await P.keyboard.press("Escape"); await sleep(300);
    ok("After the error option A search still answers", (await searchGo("Divan Japonais")) !== null, await refTitle());
    await closeApp();
  } finally {
    if (B) await closeApp().catch(() => {});
    if (fs.existsSync(KEEP)) { fs.rmSync(MODEL, { recursive: true, force: true }); fs.renameSync(KEEP, MODEL); }
    ok("Model restored to %LOCALAPPDATA% (.ok + pinned sizes)", modelOk(MODEL), MODEL);
  }
}

// ---------------------------------------------------------------- recheck (final-review fixes a, b)
async function phaseRecheck() {
  // (a) A choice clicked, then quit before Begin: nothing saved, nothing started.
  await launch("recheck-a");
  await P.waitForSelector(".firstrun", { timeout: 30000 }); await sleep(1500);
  await P.click('[data-fs="on"]'); await sleep(500);
  await closeApp();
  const sf = settingsFile();
  ok("(a) 'Turn on now' then quit before Begin: no enable, findSimilar not saved", ipcSince(0, "similar_enable") === 0 && sf?.findSimilar !== "on", `similar_enable ${ipcSince(0, "similar_enable")}; settings.json ${JSON.stringify(sf)}; ipc ${JSON.stringify([...new Set(ipcLog)])}`);
  await launch("recheck-a2");
  const fr = await firstRun("on");
  ok("(a) Next launch asks again; Begin then saves on and starts", fr.copy === COPY.first, `asked again: ${!!fr.copy}`);
  const r = await waitPhase(["ready", "error"], 180000);
  ok("(a) After Begin: ready, findSimilar on", r.s?.phase === "ready" && settingsFile()?.findSimilar === "on", `${r.s?.phase}; ${JSON.stringify(settingsFile())}`);
  // (b) Disk line follows the open library.
  const embA = fs.statSync(path.join(LIB, "embeddings.bin")).size;
  const diskOf = async () => { await openSettings(); const t = await text(".fs-disk"); const s = await status(); await P.keyboard.press("Escape"); await sleep(300); return { t, b: s.diskBytes, remove: t !== null }; };
  const dA = await diskOf();
  const LIB2 = path.join(W, "lib-recheck-b"); fs.rmSync(LIB2, { recursive: true, force: true }); fs.mkdirSync(LIB2, { recursive: true });
  dialogAnswer = LIB2;
  await P.click("#library-menu"); await P.click('[data-lib="new"]');
  await P.waitForSelector(".lib-new:not([hidden])", { timeout: 8000 });
  await P.click('.lib-new button[type="submit"]');
  await until(async () => (await count()) === 0, 15000, 200); await sleep(1500);
  const dB = await diskOf();
  dialogAnswer = LIB;
  await P.click("#library-menu"); await P.click('[data-lib="open"]');
  await until(async () => (await count()) === 50, 15000, 200); await sleep(1500);
  const dA2 = await diskOf();
  ok("(b) Disk space follows the open library (A, new empty B, A again)", dA.b - dB.b === embA && dA2.b === dA.b && dB.remove, `A ${dA.b} B ("${dA.t}") -> empty B ${dB.b} B ("${dB.t}") -> A ${dA2.b} B; A's embeddings.bin ${embA} B; Remove model shown in B ${dB.remove}`);
  await closeApp();
}

// ---------------------------------------------------------------- dark (the app's own theme toggle)
async function phaseDark() {
  await launch("dark");
  await firstRun("on");
  await waitPhase(["ready"], 180000);
  for (let i = 0; i < 3 && (await P.evaluate(() => document.documentElement.dataset.theme)) !== "dark"; i++) { await P.click("#theme"); await sleep(500); }
  ok("Dark theme on (app toggle)", (await P.evaluate(() => document.documentElement.dataset.theme)) === "dark", "");
  await searchGo("Divan Japonais"); await openSimTab(); await shot("tab");
  await typeQuery("a ship at sea", 10); await sleep(1800); await shot("dropdown"); await P.keyboard.press("Escape");
  await openSettings(); await shot("settings");
  await P.click('.settings [data-act="remove"]'); await sleep(300); await shot("confirm"); await P.click('.settings [data-act="remove-cancel"]');
  await P.keyboard.press("Escape");
  const fin = await dropAt([path.join(FX, "poster drop.jpg")], [400, 400]); await sleep(300); await shot("drag"); await dragEvt("tauri://drag-leave", null); await sleep(300);
  void fin;
  await closeApp();
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  if (PHASE !== "restart") {
    if (fs.existsSync(CONFIG)) throw new Error("art.horus.app exists: refusing to touch it");
    fs.rmSync(LIB, { recursive: true, force: true }); fs.mkdirSync(LIB, { recursive: true });
  }
  try {
    await ({ main: phaseMain, restart: phaseRestart, notnow: phaseNotNow, download: phaseDownload, damaged: phaseDamaged, recheck: phaseRecheck, dark: phaseDark })[PHASE]();
  } catch (e) {
    ok(`${PHASE}: phase ran to the end`, false, String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
    if (B) { await shot("fatal"); await closeApp().catch(() => {}); }
  } finally {
    if (PHASE !== "main") fs.rmSync(CONFIG, { recursive: true, force: true });
    const f = R.filter((r) => r.pass === false).length;
    console.log(`\n${PHASE}: ${R.filter((r) => r.pass === true).length} pass, ${f} fail, ${R.filter((r) => r.pass === null).length} notes; console errors: ${consoleErr.length}`);
    consoleErr.slice(0, 10).forEach((c) => console.log("  console:", c));
    fs.writeFileSync(path.join(W, `results-${PHASE}.json`), JSON.stringify({ R, consoleErr }, null, 1));
  }
})();
