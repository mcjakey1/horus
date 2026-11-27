// Plan 6 QA (Task 8 on Windows 11, the release build) as Mara (QA-PERSONA.md), on the real horus.exe
// over WebView2 CDP (port 9337). Run: node mara-plan6.js <work dir> <exe> <main|offline>
//   main     intro (plays, first key skips, never again), keyboard-only first run into a library path
//            with spaces and non-ASCII, demo set + asset thumbnails, CSP, Details (R27), Settings and
//            About keyboard, Help menu (UI half + an OS-level F10 try), N3, D8 real Ctrl+Z, paste an
//            image, folder drop, kill during an import + relaunch, single instance, axe per view,
//            and the screenshot set (SHOTS_OUT=<dir>: light/dark x 1280/760, light 1100).
//   offline  model moved aside (restored in finally/exit), HTTPS_PROXY to a closed port: first run
//            "Turn on now" must say it is offline; the rest of first run still works.
// Needs <work dir>/fx (Plan 5's: batch/ with 120 jpg, "outside drop.png", "poster drop.jpg") and
// <work dir>/axe.min.js (axe-core). Refuses to run if %APPDATA%/art.horus.app exists; deletes it after.
const { chromium } = require(process.env.APPDATA + "/npm/node_modules/playwright");
const { spawn, execSync } = require("child_process");
const fs = require("fs"), path = require("path");

const [W, EXE, PHASE] = process.argv.slice(2);
if (!W || !EXE || !PHASE) throw new Error("usage: node mara-plan6.js <work dir> <exe> <main|offline>");
const FX = path.join(W, "fx"), SHOTS = path.join(W, "shots6"), LIB = path.join(W, `Mara's Références 日本 ${PHASE}`);
const OUT = process.env.SHOTS_OUT || null;
const CONFIG = path.join(process.env.APPDATA, "art.horus.app");
const MODEL = path.join(process.env.LOCALAPPDATA, "art.horus.app", "models", "siglip-b16-224-q8"), KEEP = path.join(W, "model-keep");
const PORT = 9337;
const AXE = fs.existsSync(path.join(W, "axe.min.js")) ? fs.readFileSync(path.join(W, "axe.min.js"), "utf8") : null;

const R = [], consoleErr = [], ipcLog = [];
const ok = (name, pass, detail = "") => { const d = typeof detail === "string" ? detail : JSON.stringify(detail); R.push({ name, pass, detail: d }); console.log(pass === null ? "NOTE" : pass ? "PASS" : "FAIL", name, "::", d); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 5000, step = 100) { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); } }
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return null; } };
const ps = (cmd) => execSync(`powershell -NoProfile -Command "${cmd}"`).toString().trim();
const horusPids = () => { try { return ps("(Get-Process horus -ErrorAction SilentlyContinue).Id -join ','").split(",").filter(Boolean); } catch { return []; } };

let proc, P, B, extraEnv = {};
async function launch(tag, { skipIntro = true } = {}) {
  if (horusPids().length) throw new Error(`another horus.exe runs (${horusPids()}): single instance would swallow this launch`);
  ipcLog.length = 0;
  proc = spawn(EXE, [], { env: { ...process.env, ...extraEnv, WEBVIEW2_USER_DATA_FOLDER: path.join(W, "wv2"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: "ignore" });
  for (let i = 0; i < 60 && !B; i++) { try { B = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await sleep(500); } }
  const ctx = B.contexts()[0];
  let page;
  for (let i = 0; i < 40 && !page; i++) { page = ctx.pages().find((x) => x.url().includes("tauri.localhost")); if (!page) await sleep(250); }
  await page.route(/ipc\.localhost\/plugin%3Adialog%7Copen/, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Tauri-Response", "Tauri-Response": "ok" }, body: JSON.stringify(LIB) }));
  page.on("request", (r) => { const u = new URL(r.url()); if (u.hostname === "ipc.localhost") ipcLog.push(decodeURIComponent(u.pathname.slice(1))); });
  page.on("console", (m) => { if (m.type() === "error" || /Content Security Policy/i.test(m.text())) consoleErr.push(`${tag}: ${m.text().slice(0, 240)}`); });
  page.on("pageerror", (e) => ok(`page error (${tag})`, false, e.message));
  page.setDefaultTimeout(8000); P = page;
  await page.evaluate(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sourceFile}:${e.lineNumber}`)); });
  if (skipIntro) { if (await page.waitForSelector(".intro", { timeout: 4000 }).catch(() => null)) { await page.keyboard.press("Shift"); await page.waitForSelector(".intro", { state: "detached", timeout: 5000 }).catch(() => {}); } }
  return page;
}
async function closeApp() {
  try { ps(`(Get-Process -Id ${proc.pid}).CloseMainWindow() | Out-Null`); } catch {}
  await until(() => proc.exitCode !== null, 30000, 100);
  if (proc.exitCode === null) try { proc.kill(); } catch {}
  try { await B.close(); } catch {}
  B = null;
}
const killHard = async () => { try { execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: "ignore" }); } catch {} await until(() => proc.exitCode !== null, 10000); try { await B.close(); } catch {} B = null; await until(() => !horusPids().length, 10000); };
const shot = (n) => P.screenshot({ path: path.join(SHOTS, `${PHASE}-${n}.png`) }).catch(() => {});
const text = (s) => P.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null, s);
const jsClick = (s) => P.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error("no " + s); el.click(); }, s);
const has = (s) => P.evaluate((s) => !!document.querySelector(s), s);
const blur = () => P.evaluate(() => document.activeElement?.blur());
const activeDesc = () => P.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.id ? "#" + a.id : ""}${a.className && typeof a.className === "string" ? "." + a.className.split(" ")[0] : ""}${a.dataset?.pick ? "[pick=" + a.dataset.pick + "]" : ""}${a.dataset?.fs ? "[fs=" + a.dataset.fs + "]" : ""}` : "none"; });
const count = async () => Number(((await text("#lib-count")) || "").replace(/,/g, "").match(/\d+/)?.[0] ?? -1);
const status = () => P.evaluate(() => window.__TAURI_INTERNALS__.invoke("similar_status"));
const noticeText = () => P.evaluate(() => { const n = document.querySelector("#import-notice"); return n && !n.hidden ? n.textContent.replace(/\s+/g, " ").trim() : null; });
const noticeDone = (ms = 120000) => P.waitForFunction(() => { const n = document.querySelector("#import-notice"); const t = n?.querySelector("[data-body]")?.textContent || ""; return n && !n.hidden && t && !/Importing|Adding|Verifying/.test(t); }, null, { timeout: ms });
const dismiss = () => P.evaluate(() => { const n = document.querySelector("#import-notice"); if (n && !n.hidden) document.querySelector("#import-dismiss")?.click(); });
const emit = (event, payload) => P.evaluate(([event, payload]) => window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event, payload }), [event, payload]);
const menu = (id) => emit("menu://action", id);
const cspLog = async () => [...(await P.evaluate(() => window.__csp || [])), ...consoleErr.filter((c) => /Content Security Policy/i.test(c))];
const refTitle = () => text('.cell[data-level="ref"] [data-v]');
const focusId = () => P.evaluate(() => document.querySelector("#ref-id")?.title);
const tab = async (v) => { await jsClick(`[data-view-tab="${v}"]`); await sleep(900); };
const searchGo = async (q) => {
  await tab("reference").catch(() => {});
  await P.fill("#q", q); await sleep(900);
  const id = await P.evaluate(() => document.querySelector("#q-results [data-r]")?.dataset.r);
  if (!id) { await P.keyboard.press("Escape"); return null; }
  await jsClick(`#q-results [data-r="${id}"]`);
  await P.waitForFunction((n) => document.querySelector("#ref-id")?.title === n, id, { timeout: 5000 }).catch(() => {});
  await sleep(600); return id;
};
async function block(name, fn) {
  try { await fn(); } catch (e) {
    ok(`${name}: block ran to the end`, false, String(e && e.message || e).split("\n").slice(0, 2).join(" | "));
    await shot(`error-${name}`);
    for (let i = 0; i < 3; i++) await P.keyboard.press("Escape").catch(() => {});
  }
}
function resizeWin(w, h) {
  ps(`Add-Type -Name U -Namespace W -MemberDefinition '[DllImport(\\"user32.dll\\")] public static extern bool MoveWindow(System.IntPtr h,int x,int y,int w,int ht,bool r);'; $p=Get-Process -Id ${proc.pid}; [W.U]::MoveWindow($p.MainWindowHandle,20,20,${w},${h},$true) | Out-Null`);
}
async function sizeTo(cssW, cssH = 800) {
  let ow = cssW + 16, oh = cssH + 39;
  for (let i = 0; i < 3; i++) { resizeWin(ow, oh); await sleep(700); const [iw, ih] = await P.evaluate(() => [innerWidth, innerHeight]); if (iw === cssW && ih === cssH) break; ow += cssW - iw; oh += cssH - ih; }
  return P.evaluate(() => `${innerWidth}x${innerHeight}`);
}
async function setTheme(want) { for (let i = 0; i < 3 && (await P.evaluate(() => document.documentElement.dataset.theme)) !== want; i++) { await jsClick("#theme"); await sleep(500); } return P.evaluate(() => document.documentElement.dataset.theme); }
const dropEvt = async (paths, xy = [400, 450]) => {
  await emit("tauri://drag-enter", { paths, position: { x: xy[0], y: xy[1] } }); await sleep(200);
  await emit("tauri://drag-over", { position: { x: xy[0], y: xy[1] } }); await sleep(200);
  await emit("tauri://drag-drop", { paths, position: { x: xy[0], y: xy[1] } });
};
async function axeScan(tag) {
  if (!AXE) return ok(`axe ${tag}`, null, "axe.min.js missing");
  await P.evaluate(AXE).catch(() => {});
  const r = await P.evaluate(async () => { const res = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } }); return res.violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, t: v.nodes[0]?.target?.join(" ") })); });
  const bad = r.filter((v) => v.impact === "serious" || v.impact === "critical");
  ok(`13 axe on ${tag}: no serious or critical`, bad.length === 0, r.length ? r.map((v) => `${v.impact} ${v.id} x${v.n} (${v.t})`).join("; ") : "no violations");
}

// ---------------------------------------------------------------- main
async function phaseMain() {
  // Row 2: the intro on the first launch; the first key skips it and goes no further.
  await launch("main", { skipIntro: false });
  const introT0 = Date.now();
  const intro = await P.waitForSelector(".intro", { timeout: 6000 }).catch(() => null);
  ok("2 intro plays on the first launch", !!intro, intro ? `shown ${Date.now() - introT0} ms after attach; label "${await P.evaluate(() => document.querySelector(".intro")?.getAttribute("aria-label"))}"` : "no .intro");
  await sleep(1800); await shot("intro");
  if (OUT) await P.screenshot({ path: path.join(OUT, "intro-light-1280.png") });
  const n0 = ipcLog.length, f0 = await activeDesc();
  await P.keyboard.press("Enter"); await sleep(400);
  ok("2 the first key (Enter) skips the intro and doesn't press the button under it", !(await has(".intro")) && !ipcLog.slice(n0).includes("plugin:dialog|open") && !(await P.evaluate(() => /New library in/.test(document.querySelector(".firstrun")?.textContent || ""))), `intro gone ${!(await has(".intro"))}; focus ${f0} -> ${await activeDesc()}; dialog calls ${ipcLog.slice(n0).filter((c) => c === "plugin:dialog|open").length}`);

  // Row 3 + 13: keyboard-only first run into a path with spaces, an apostrophe and non-ASCII.
  await P.waitForSelector(".firstrun");
  await until(() => P.evaluate(() => !/checking/.test(document.querySelector("#fr-ram")?.textContent || "")), 6000);
  await shot("firstrun"); if (OUT) await P.screenshot({ path: path.join(OUT, "firstrun-light-1280.png") });
  const steps = [];
  const tabTo = async (pred, max = 12) => { for (let i = 0; i < max; i++) { const d = await activeDesc(); if (pred(d)) return d; await P.keyboard.press("Tab"); steps.push(await activeDesc()); } return null; };
  let picked = false;
  for (let i = 0; i < 6 && !picked; i++) {
    if (i && i % 2 === 0) { // D5: the dialog route dies for a whole launch; relaunch on a fresh config
      await closeApp(); fs.rmSync(CONFIG, { recursive: true, force: true });
      await launch(`relaunch-${i}`); await P.waitForSelector(".firstrun"); await sleep(800);
    }
    const n1 = ipcLog.length;
    await tabTo((d) => d.includes("[pick=create]"));
    await P.keyboard.press("Enter");
    picked = !!(await until(() => P.evaluate(() => /New library in/.test(document.querySelector(".firstrun")?.textContent || "")), 8000, 200));
    if (!picked) ok("first run pick (harness dialog route, D5)", null, `miss ${i + 1}; ipc after Enter: ${ipcLog.slice(n1).join(",") || "none"}; focus ${await activeDesc()}`);
  }
  const onBtn = await tabTo((d) => d.includes("[fs=on]"));
  await P.keyboard.press("Space"); await sleep(300);
  const goBtn = await tabTo((d) => d.includes("#fr-go"));
  await P.waitForSelector("#fr-go:not([disabled])", { timeout: 15000 });
  await P.keyboard.press("Enter");
  ok("13 keyboard-only first run: create, Turn on now, Begin", picked && !!onBtn && !!goBtn, `tab stops ${steps.join(" > ")}`);
  await P.waitForSelector(".firstrun", { state: "detached", timeout: 600000 });
  await sleep(2000);
  const lib = readJson(path.join(LIB, "library.json"));
  ok("3 library created at a path with spaces, an apostrophe and non-ASCII", !!lib && fs.existsSync(path.join(LIB, "taxonomy.json")) && fs.existsSync(path.join(LIB, "thumbs", "256")), `${LIB}; library.json refs ${lib?.references?.length ?? lib?.refs?.length ?? "?"}`);
  ok("4 the demo set opens (50 references)", (await count()) === 50, `count ${await count()}`);
  const imgs = await until(async () => { const r = await P.evaluate(() => { const a = [...document.querySelectorAll("img")].filter((i) => /asset/.test(i.src)); return { n: a.length, loaded: a.filter((i) => i.complete && i.naturalWidth > 0).length, src: a[0]?.src.slice(0, 60) }; }); return r.n && r.loaded === r.n ? r : null; }, 10000) || (await P.evaluate(() => { const a = [...document.querySelectorAll("img")].filter((i) => /asset/.test(i.src)); return { n: a.length, loaded: a.filter((i) => i.naturalWidth > 0).length }; }));
  ok("4 thumbnails show through the asset protocol", imgs.n > 0 && imgs.loaded === imgs.n, imgs);
  ok("2 introSeen saved after the first launch", readJson(path.join(CONFIG, "settings.json"))?.introSeen === true, JSON.stringify(readJson(path.join(CONFIG, "settings.json"))));
  const fsReady = await until(async () => (await status()).phase === "ready", 240000, 500);
  ok("Find similar reaches Ready on the release build (model installed)", !!fsReady, JSON.stringify(await status()));
  const ort = (() => { try { return /onnxruntime/i.test(ps(`(Get-Process -Id ${proc.pid}).Modules | ForEach-Object ModuleName`)); } catch { return "?"; } })();
  ok("ORT loads in the release build", ort === true, String(ort));

  await block("details", async () => {
    const id = await searchGo("Divan Japonais");
    const t0 = await refTitle();
    await P.click("#lab .details-open"); await P.waitForSelector(".details[role=dialog]");
    const f = await activeDesc();
    const out = [];
    for (let i = 0; i < 8; i++) { await P.keyboard.press("Tab"); if (!(await P.evaluate(() => !!document.activeElement?.closest(".details")))) out.push(await activeDesc()); }
    ok("3c Details opens on Title; Tab x8 stays inside", f.includes("dt-title") && !out.length, `focus ${f}; escaped ${out.join(",") || "never"}`);
    await P.fill("#dt-title", "Divan Japonais — Mara’s note «QA»"); await P.fill("#dt-year", "c. 1892–93");
    await P.focus("#dt-title"); await P.keyboard.press("Enter"); await sleep(900);
    const libRef = (readJson(path.join(LIB, "library.json"))?.references || []).find((r) => r.id === id);
    ok("3c Enter saves: title and year change on screen and in library.json", !(await has(".details")) && /Mara’s note «QA»/.test(await refTitle()) && libRef?.year === "c. 1892–93", `title "${await refTitle()}"; json ${JSON.stringify({ t: libRef?.title, y: libRef?.year })}; focus ${await activeDesc()}`);
    await blur(); await P.keyboard.press("Control+z"); await sleep(1000);
    ok("3c one Ctrl+Z restores both fields", (await refTitle()) === t0 && !((readJson(path.join(LIB, "library.json"))?.references || []).find((r) => r.id === id)?.year === "c. 1892–93"), `"${await refTitle()}"`);
    await P.click("#lab .details-open"); await P.waitForSelector(".details[role=dialog]");
    await P.fill("#dt-title", "   "); await P.click(".details [data-save]"); await sleep(600);
    const err = await P.evaluate(() => [...document.querySelectorAll(".details [role=alert], .details .dt-err, .details [aria-live]")].map((e) => e.hidden ? "" : e.textContent.trim()).filter(Boolean).join(" | "));
    ok("3c an empty title is refused with artist copy; the dialog stays", (await has(".details")) && /title/i.test(err), `"${err}"`);
    await shot("details-error");
    await P.keyboard.press("Escape"); await sleep(400);
    ok("3c Esc cancels: dialog closed, title unchanged, focus back on Details…", !(await has(".details")) && (await refTitle()) === t0 && (await activeDesc()).includes("details-open"), `focus ${await activeDesc()}`);
  });

  await block("settings keyboard", async () => {
    await P.click("#settings"); await P.waitForSelector('.settings [role="switch"]'); await sleep(400);
    const inside = () => P.evaluate(() => !!document.activeElement?.closest(".settings"));
    const out = [];
    for (let i = 0; i < 9; i++) { await P.keyboard.press("Tab"); if (!(await inside())) out.push(await activeDesc()); }
    for (let i = 0; i < 9; i++) { await P.keyboard.press("Shift+Tab"); if (!(await inside())) out.push(await activeDesc()); }
    ok("Settings (holdModal): Tab and Shift+Tab x9 stay inside", !out.length, out.join(",") || "inside");
    await blur(); await P.keyboard.press("Escape"); await sleep(400);
    ok("Settings: Esc with focus on body closes, focus returns to the gear", !(await has('.settings[role="dialog"]:not(.details)')) && (await activeDesc()).startsWith("button#settings"), await activeDesc());
  });

  await block("N3", async () => {
    await searchGo("Divan Japonais");
    const r = await P.evaluate(() => ["#tab-similar", "#tab-ranked", "#tab-callouts"].map((s) => { const e = document.querySelector(s); const b = e?.getBoundingClientRect(); return e && { s, h: Math.round(b.height), lines: Math.round(b.height / parseFloat(getComputedStyle(e).lineHeight || "16")) }; }));
    ok("N3 'Looks similar' tab label on one line at 1280", r[0] && r[0].h === r[1]?.h, r);
  });

  await block("about + menu", async () => {
    await menu("about"); await P.waitForSelector(".ab-sheet", { timeout: 5000 });
    const ab = await P.evaluate(() => ({ v: document.querySelector(".ab-version")?.textContent, fonts: document.querySelectorAll(".ab-sheet .ab-list:not(.ab-credits) li").length, credits: document.querySelectorAll(".ab-credits li").length, focus: document.activeElement?.closest(".ab-sheet") ? "inside" : document.activeElement?.tagName }));
    await shot("about");
    const n = ipcLog.length; await P.click(".ab-sheet [data-notices]"); await sleep(1200);
    const err = await text(".ab-err");
    ok("4 About: version, fonts, 50 demo credits; Third-party notices opens a file", /Version \d/.test(ab.v) && ab.fonts > 0 && ab.credits === 50 && ipcLog.slice(n).some((c) => /open_path|opener/.test(c)) && !err, `${JSON.stringify(ab)}; ipc ${ipcLog.slice(n).join(",")}; err "${err}"`);
    try { ps("Get-Process notepad,TextInputHost -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -match 'NOTICE' } | ForEach-Object { $_.CloseMainWindow() | Out-Null }"); } catch {}
    await P.bringToFront().catch(() => {});
    await P.keyboard.press("Escape"); await sleep(400);
    ok("About: Esc closes", !(await has(".ab-sheet")), "");
    const seen0 = readJson(path.join(CONFIG, "settings.json"))?.introSeen;
    await menu("play-intro"); const replay = !!(await P.waitForSelector(".intro", { timeout: 3000 }).catch(() => null));
    await P.mouse.click(600, 400); await sleep(400);
    ok("2 Help > Play intro replays it (UI half); a click skips; introSeen stays", replay && !(await has(".intro")) && seen0 === true && readJson(path.join(CONFIG, "settings.json"))?.introSeen === true, `replay ${replay}`);
    // OS-level: F10 then Right, Down, Enter on the native menu bar (Help > Play intro).
    let native = "not tried";
    try {
      ps(`$w=New-Object -ComObject wscript.shell; [void]$w.AppActivate(${proc.pid}); Start-Sleep -m 500; $w.SendKeys('{F10}'); Start-Sleep -m 300; $w.SendKeys('{RIGHT}'); Start-Sleep -m 200; $w.SendKeys('{DOWN}'); Start-Sleep -m 300; $w.SendKeys('{ENTER}')`);
      native = (await P.waitForSelector(".intro", { timeout: 2500 }).catch(() => null)) ? "intro played" : "no intro";
      await P.keyboard.press("Shift"); await sleep(300); await P.keyboard.press("Escape").catch(() => {});
    } catch (e) { native = `error ${e.message.slice(0, 80)}`; }
    ok("2 Help > Play intro through the native menu (OS keys F10, Right, Down, Enter)", native === "intro played" ? true : null, native);
  });

  await block("D8 move dialog Ctrl+Z", async () => {
    await P.fill("#q", "rim"); await sleep(400); await P.fill("#q", ""); await P.keyboard.press("Escape");
    await tab("tree");
    const H = '[data-view-host="tree"]';
    for (let i = 0; i < 5 && !(await has(`${H} [data-act="del-tech"]`)); i++) {
      const sel = await P.evaluate((H) => { const b = [...document.querySelectorAll(`${H} .insp-sel`)].find((x) => Number((x.textContent.match(/(\d+)\s*$/) || [])[1] || 0) > 0) || document.querySelector(`${H} .insp-sel`); if (!b) return null; b.click(); return b.textContent.trim(); }, H);
      if (!sel) break; await sleep(700);
    }
    await P.click(`${H} [data-act="del-tech"]`); await sleep(600);
    const dlg = await P.evaluate(() => { const s = document.querySelector(".tx-search"); return { open: !!s, focus: document.activeElement === s }; });
    await P.keyboard.press("Control+z"); await sleep(500);
    const after = await P.evaluate(() => ({ q: document.querySelector("#q")?.value, inDialog: !!document.activeElement?.closest('[aria-modal="true"]'), focus: document.activeElement?.className }));
    await shot("move-dialog");
    await P.keyboard.press("Escape"); await sleep(400);
    ok("D8 real Ctrl+Z in an empty move-dialog search: #q not refilled, focus stays, Esc closes", dlg.open && after.q === "" && after.inDialog && !(await has(".tx-search")), `dialog ${JSON.stringify(dlg)}; after ${JSON.stringify(after)}; closed ${!(await has(".tx-search"))}`);
  });

  await block("paste", async () => {
    await tab("reference"); await blur();
    const c0 = await count();
    ps(`Add-Type -AssemblyName System.Windows.Forms,System.Drawing; $i=[System.Drawing.Image]::FromFile('${path.join(FX, "outside drop.png").replace(/'/g, "''")}'); [System.Windows.Forms.Clipboard]::SetImage($i)`.replace(/"/g, '\\"'));
    await P.keyboard.press("Control+v"); await noticeDone(30000).catch(() => {}); await sleep(800);
    ok("5 paste an image (clipboard bitmap) adds a reference", (await count()) === c0 + 1, `count ${c0} -> ${await count()}; notice "${await noticeText()}"`);
    await dismiss();
  });

  await block("folder drop + kill during import", async () => {
    const c0 = await count();
    await dropEvt([path.join(FX, "batch")]);
    await until(() => P.evaluate(() => /Importing|Adding/.test(document.querySelector("#import-notice")?.textContent || "")), 8000, 50);
    await sleep(1200);
    const mid = await noticeText();
    await killHard();
    ok("11 killed horus.exe during a 120-image folder import", !horusPids().length, `notice at kill "${mid}"`);
    await launch("after-kill", { skipIntro: false });
    const introAgain = !!(await P.waitForSelector(".intro", { timeout: 4000 }).catch(() => null));
    ok("2 the intro does not play on the next launch", !introAgain, "");
    await P.waitForSelector("#lib-count", { timeout: 30000 }); await sleep(3000);
    const nt = await noticeText(), c1 = await count();
    const lj = readJson(path.join(LIB, "library.json"));
    ok("11 next start: library.json opens; Recovered N images or a clean report", !!lj && c1 >= c0, `count ${c0} -> ${c1}; notice "${nt}"; tmp left ${fs.readdirSync(path.join(LIB, "thumbs", "256")).filter((f) => f.endsWith(".tmp")).length}`);
    await dismiss();
    const c2 = await count();
    await dropEvt([path.join(FX, "batch")]); await noticeDone(240000).catch(() => {}); await sleep(800);
    ok("5 folder drop imports (the rest of the 120 or duplicates reported)", (await count()) >= c2 && (await count()) <= c0 + 120 + 1, `count ${c2} -> ${await count()}; notice "${await noticeText()}"`);
    await dismiss();
  });

  await block("single instance", async () => {
    const before = horusPids();
    const second = spawn(EXE, [], { stdio: "ignore" });
    const gone = await until(() => second.exitCode !== null, 10000);
    await sleep(800);
    let fg = "?";
    try { fg = ps(`Add-Type -Name F -Namespace W2 -MemberDefinition '[DllImport(\\"user32.dll\\")] public static extern System.IntPtr GetForegroundWindow();'; [W2.F]::GetForegroundWindow() -eq (Get-Process -Id ${proc.pid}).MainWindowHandle`); } catch {}
    ok("10 a second launch exits and focuses the existing window", gone !== null && horusPids().length === before.length, `second exit ${second.exitCode}; pids ${before} -> ${horusPids()}; foreground is the first window ${fg}`);
  });

  if (OUT) await shotSet();
  else ok("screenshot set", null, "SHOTS_OUT not set");
  ok("CSP: no violations over the run", (await cspLog()).length === 0, (await cspLog()).slice(0, 5).join(" | ") || "none");
  const styled = await P.evaluate(() => document.querySelectorAll("[style]").length);
  ok("CSP: inline style attributes left in the DOM (info)", null, `${styled}`);
  await closeApp();
}

// The screenshot set for the design judge: light/dark x 1280/760 (+ light 1100), axe on light 1280.
async function shotSet() {
  fs.mkdirSync(OUT, { recursive: true });
  await P.bringToFront().catch(() => {});
  const views = [
    ["reference", async () => { await searchGo("Divan Japonais"); await jsClick("#tab-ranked").catch(() => {}); }],
    ["reference-similar", async () => { await searchGo("Divan Japonais"); await jsClick("#tab-similar"); await sleep(1500); }],
    ["search-dropdown", async () => { await tab("reference"); await P.fill("#q", ""); await P.focus("#q"); await P.keyboard.type("poster", { delay: 20 }); await sleep(1800); }],
    ["inbox", async () => { await tab("inbox"); }],
    ["tree", async () => { await tab("tree"); await sleep(1500); }],
    ["galaxy", async () => { await tab("galaxy"); await sleep(3500); }],
    ["radial", async () => { await tab("radial"); await sleep(2000); }],
    ["boards", async () => { await tab("boards"); }],
    ["lightbox", async () => { await searchGo("Divan Japonais"); await blur(); await P.keyboard.press("l"); await P.waitForSelector(".lightbox .lb-stage", { timeout: 5000 }); await sleep(1500); }],
    ["compare", async () => { await searchGo("Divan Japonais"); await jsClick("#tab-ranked"); await sleep(300); const b = await P.evaluate(() => document.querySelector("#pane-ranked .row:not(.linked)")?.dataset.go); await P.click(`#pane-ranked [data-go="${b}"]`, { modifiers: ["Shift"] }); await P.waitForSelector(".compare .cmp-mid", { timeout: 5000 }); await sleep(1200); }],
    ["details", async () => { await searchGo("Divan Japonais"); await P.click("#lab .details-open"); await P.waitForSelector(".details[role=dialog]"); }],
    ["settings", async () => { await P.click("#settings"); await P.waitForSelector('.settings [role="switch"]'); await sleep(500); }],
    ["about", async () => { await menu("about"); await P.waitForSelector(".ab-sheet"); await sleep(400); }],
    ["intro", async () => { await menu("play-intro"); await P.waitForSelector(".intro"); await sleep(2500); }],
  ];
  const combos = [["light", 1280], ["light", 760], ["dark", 1280], ["dark", 760], ["light", 1100]];
  for (const [theme, w] of combos) {
    for (let i = 0; i < 3; i++) await P.keyboard.press("Escape").catch(() => {});
    const got = await sizeTo(w); const th = await setTheme(theme);
    ok(`shots ${theme} ${w}`, null, `window ${got}, theme ${th}`);
    for (const [name, go] of views) {
      await block(`shot ${name} ${theme} ${w}`, async () => {
        await go(); if (name !== "search-dropdown") { await P.mouse.move(2, 2); }
        await P.screenshot({ path: path.join(OUT, `${name}-${theme}-${w}.png`) });
        if (theme === "light" && w === 1280 && name !== "intro") await axeScan(name);
        if (name === "intro") { await P.keyboard.press("Shift"); await sleep(300); }
        for (let i = 0; i < 3; i++) { await P.keyboard.press("Escape").catch(() => {}); await sleep(120); }
        await P.evaluate(() => document.querySelector(".compare .cmp-close")?.click()).catch(() => {});
      });
    }
  }
  await sizeTo(1280);
}

// ---------------------------------------------------------------- offline (no network for the model download)
async function phaseOffline() {
  if (!fs.existsSync(MODEL)) throw new Error("model not installed");
  fs.rmSync(KEEP, { recursive: true, force: true });
  fs.renameSync(MODEL, KEEP);
  extraEnv = { HTTPS_PROXY: "http://127.0.0.1:9", HTTP_PROXY: "http://127.0.0.1:9", NO_PROXY: "" };
  await launch("offline");
  await P.waitForSelector(".firstrun", { timeout: 30000 }); await sleep(1200);
  let picked = false;
  for (let i = 0; i < 4 && !picked; i++) { await P.click('[data-pick="create"]'); picked = !!(await until(() => P.evaluate(() => /New library in/.test(document.querySelector(".firstrun")?.textContent || "")), 8000, 200)); }
  await P.click('[data-fs="on"]'); await P.waitForSelector("#fr-go:not([disabled])", { timeout: 15000 }); await P.click("#fr-go");
  await P.waitForSelector(".firstrun", { state: "detached", timeout: 600000 }); await sleep(1500);
  ok("9 offline: first run with the demo set still completes", (await count()) === 50, `count ${await count()}`);
  const vis = await P.evaluate(() => { const a = [...document.querySelectorAll("img")].filter((i) => /asset/.test(i.src)); const inView = a.filter((i) => { const b = i.getBoundingClientRect(); return b.width && b.bottom > 0 && b.top < innerHeight && b.right > 0 && b.left < innerWidth; }); return { all: a.length, inView: inView.length, loaded: inView.filter((i) => i.complete && i.naturalWidth > 0).length, lazyOff: a.filter((i) => i.loading === "lazy" && !inView.includes(i)).length }; });
  ok("4 (re-check) every on-screen asset thumbnail loads (off-screen ones are loading=lazy)", vis.inView > 0 && vis.loaded === vis.inView, vis);
  const s = await until(async () => { const s = await status(); return s.phase === "error" ? s : null; }, 60000, 500);
  const bar = await text("#find-similar");
  await P.click("#settings").catch(() => {}); await sleep(800);
  const line = await text(".settings [data-line]");
  await shot("offline-settings");
  ok("9 offline: Find similar's download reports it can't reach the network", !!s && /reach|connection|offline/i.test(`${s?.message} ${bar} ${line}`), `status ${JSON.stringify(s)}; bar "${bar}"; settings "${line}"`);
  await P.keyboard.press("Escape");
  await closeApp();
}

// ---------------------------------------------------------------- d4 (Plan 4 QA J3): a full-tag region's hover label in the lightbox
async function phaseD4() {
  await launch("d4");
  await P.waitForSelector(".firstrun", { timeout: 30000 }); await sleep(1200);
  let picked = false;
  for (let i = 0; i < 4 && !picked; i++) { await P.click('[data-pick="create"]'); picked = !!(await until(() => P.evaluate(() => /New library in/.test(document.querySelector(".firstrun")?.textContent || "")), 8000, 200)); }
  await P.click('[data-fs="off"]'); await P.waitForSelector("#fr-go:not([disabled])", { timeout: 15000 }); await P.click("#fr-go");
  await P.waitForSelector(".firstrun", { state: "detached", timeout: 600000 }); await sleep(1500);
  await searchGo("Divan Japonais"); await blur(); await P.keyboard.press("l");
  await P.waitForSelector(".lightbox .lb-stage", { timeout: 5000 }); await sleep(1500);
  const n = await P.evaluate(() => document.querySelectorAll(".lb-box").length);
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = await P.evaluate((i) => { const b = document.querySelectorAll(".lb-box")[i].getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; }, i);
    await P.mouse.move(r.x, r.y); await sleep(400);
    out.push(await P.evaluate(() => { const b = document.querySelector(".lb-box.is-hot"); const t = b?.querySelector(".lb-tag"); return b ? { label: t?.textContent, vis: t ? getComputedStyle(t).visibility + "/" + getComputedStyle(t).display : null, w: t ? Math.round(t.getBoundingClientRect().width) : 0, sw: t ? t.scrollWidth : 0 } : null; }));
  }
  await shot("d4-hover");
  ok("D4 lightbox: hovering a tagged region shows the full 'Operation › Technique' label, visible and not clipped", n > 0 && out.every((h) => h && / › /.test(h.label || "") && !/hidden|none/.test(h.vis || "") && h.sw <= h.w + 1), out);
  await closeApp();
}

function restoreModel() {
  if (fs.existsSync(KEEP) && !fs.existsSync(path.join(MODEL, ".ok"))) { fs.rmSync(MODEL, { recursive: true, force: true }); fs.renameSync(KEEP, MODEL); console.log("model restored"); }
}
process.on("exit", () => { if (PHASE === "offline") try { restoreModel(); } catch (e) { console.log("RESTORE FAILED", e.message); } });

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  if (fs.existsSync(CONFIG)) throw new Error("art.horus.app exists: refusing to touch it");
  fs.rmSync(LIB, { recursive: true, force: true }); fs.mkdirSync(LIB, { recursive: true });
  try {
    await ({ main: phaseMain, offline: phaseOffline, d4: phaseD4 })[PHASE]();
  } catch (e) {
    ok(`${PHASE}: phase ran to the end`, false, String(e && e.stack || e).split("\n").slice(0, 3).join(" | "));
    if (B) { await shot("fatal"); await closeApp().catch(() => {}); }
  } finally {
    if (horusPids().length) try { execSync("taskkill /F /IM horus.exe", { stdio: "ignore" }); } catch {}
    if (PHASE === "offline") restoreModel();
    fs.rmSync(CONFIG, { recursive: true, force: true });
    const f = R.filter((r) => r.pass === false).length;
    console.log(`\n${PHASE}: ${R.filter((r) => r.pass === true).length} pass, ${f} fail, ${R.filter((r) => r.pass === null).length} notes; console errors: ${consoleErr.length}`);
    consoleErr.slice(0, 10).forEach((c) => console.log("  console:", c));
    fs.writeFileSync(path.join(W, `results6-${PHASE}.json`), JSON.stringify({ R, consoleErr }, null, 1));
  }
})();
