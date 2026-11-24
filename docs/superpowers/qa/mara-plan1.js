// QA walkthrough as Mara against the real release horus.exe over WebView2 CDP.
const { chromium } = require(process.env.APPDATA + "/npm/node_modules/playwright");
const { spawn, execSync } = require("child_process");
const fs = require("fs"), path = require("path");
const EXE = "D:/Design Second Brain/taxonomy-of-visuals/app/src-tauri/target/release/horus.exe";
const FX = path.join(__dirname, "fx"), SHOTS = path.join(__dirname, "shots");
fs.mkdirSync(SHOTS, { recursive: true });
const LIB = path.join(FX, "Références Été"), BATCH = path.join(FX, "Mara inbox ü"), BIG = path.join(FX, "Old refs 2000");
const R = [];
const ok = (name, pass, detail = "") => { R.push({ name, pass, detail: String(detail) }); console.log(pass ? "PASS" : "FAIL", name, "::", detail); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const dialogQueue = [], external = [];
const one = (s) => String(s).replace(/\n+/g, " | ");

async function launch(tag) {
  spawn(EXE, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9222" }, detached: true, stdio: "ignore" });
  let b;
  for (let i = 0; i < 60 && !b; i++) { try { b = await chromium.connectOverCDP("http://127.0.0.1:9222"); } catch { await sleep(500); } }
  const ctx = b.contexts()[0];
  let page;
  for (let i = 0; i < 40 && !page; i++) { page = ctx.pages().find((x) => x.url().includes("tauri.localhost")); if (!page) await sleep(250); }
  await page.route(/ipc\.localhost\/plugin%3Adialog%7Copen/, (route) => {
    const v = dialogQueue.length ? dialogQueue.shift() : null;
    route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Tauri-Response", "Tauri-Response": "ok" }, body: JSON.stringify(v) });
  });
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (!/(^|\.)localhost$/.test(u.hostname) && !["data:", "blob:"].includes(u.protocol)) external.push(r.url());
  });
  page.on("console", (m) => { if (m.type() === "error") ok(`console error (${tag})`, false, m.text()); });
  page.on("pageerror", (e) => ok(`page error (${tag})`, false, e.message));
  return { b, page };
}
async function closeApp(b) {
  try { execSync('powershell -NoProfile -Command "(Get-Process horus -ErrorAction SilentlyContinue).CloseMainWindow() | Out-Null"'); } catch {}
  for (let i = 0; i < 60; i++) {
    const out = execSync('tasklist /FI "IMAGENAME eq horus.exe"').toString();
    if (!/horus\.exe/i.test(out)) break;
    await sleep(250);
  }
  try { await b.close(); } catch {}
}
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + ".png") });
const txt = (page, s) => page.locator(s).first().innerText().catch(() => "");
const notDone = () => !/Importing/.test(document.querySelector("#import-notice [data-body]")?.textContent || "Importing");

(async () => {
  // ---------- Job 7: first run ----------
  let { b, page } = await launch("first-run");
  await page.waitForSelector(".firstrun", { timeout: 15000 });
  await sleep(800);
  await shot(page, "01-firstrun");
  ok("first run shows 3 steps", (await page.locator(".fr-step").count()) === 3);
  ok("Begin disabled before choices", await page.locator("#fr-go").isDisabled());
  ok("Find similar not pre-selected", (await page.locator('[data-fs][aria-pressed="true"]').count()) === 0);
  ok("focus moved into dialog", await page.evaluate(() => document.activeElement?.dataset?.pick === "create"));
  ok("demo checkbox on by default", await page.locator("#fr-demo").isChecked());
  ok("RAM shown", /\d+ GB/.test(await txt(page, "#fr-ram")), await txt(page, "#fr-ram"));
  dialogQueue.push(LIB);
  await page.click('[data-pick="create"]');
  await sleep(400);
  ok("chosen non-ASCII path shown", (await txt(page, "#fr-path")).includes("Références Été"), await txt(page, "#fr-path"));
  await page.click('[data-fs="off"]');
  let t0 = Date.now();
  await page.click("#fr-go");
  await page.waitForSelector(".firstrun", { state: "detached", timeout: 120000 });
  ok("demo library created", true, `${Date.now() - t0} ms`);
  await sleep(1500);
  await shot(page, "02-reference-demo");
  const count0 = await txt(page, "#lib-count");
  ok("status shows 50 references", /50 references/.test(count0), count0);
  ok("opens on a tagged reference", (await txt(page, '[data-level="op"] [data-v]')).trim().length > 0, await txt(page, '[data-level="op"] [data-v]'));
  const imgsOk = await page.evaluate(() => [...document.querySelectorAll("img")].filter((i) => i.complete && i.naturalWidth > 0).length);
  ok("images render over non-ASCII asset path", imgsOk > 0, `${imgsOk} loaded imgs`);
  ok("callouts rendered", (await page.locator("#pane-callouts > *").count()) > 0, await page.locator("#pane-callouts > *").count());
  ok("callouts text", true, one((await txt(page, "#pane-callouts")).slice(0, 300)));

  // ---------- Job 3: explore ----------
  await page.click("#tab-ranked");
  await sleep(400);
  await shot(page, "03-ranked");
  ok("ranked list shows reasons", (await txt(page, "#pane-ranked")).length > 20, one((await txt(page, "#pane-ranked")).slice(0, 300)));
  const firstTitle = await txt(page, '[data-level="ref"] [data-v]');
  const clickable = page.locator("#pane-ranked button, #pane-ranked [data-id], #pane-ranked a").first();
  if (await clickable.count()) {
    await clickable.click();
    await sleep(800);
    const t2 = await txt(page, '[data-level="ref"] [data-v]');
    ok("clicking related navigates", t2 !== firstTitle, `${firstTitle} -> ${t2}`);
    ok("Back enabled after nav", !(await page.locator("#back").isDisabled()));
    await page.keyboard.press("Backspace");
    await sleep(800);
    ok("Backspace returns", (await txt(page, '[data-level="ref"] [data-v]')) === firstTitle);
  } else ok("ranked items clickable", false, "no clickable element in #pane-ranked");
  await page.click("#tab-links");
  await sleep(300);
  ok("links pane", true, one((await txt(page, "#pane-links")).slice(0, 200)) + " badge=" + (await txt(page, "#links-count")));
  await page.click("#tab-callouts");

  await page.keyboard.press("Escape");
  await page.keyboard.press("/");
  ok("'/' focuses search", await page.evaluate(() => document.activeElement?.id === "q"));
  await page.keyboard.type("moody");
  await sleep(800);
  await shot(page, "04-search-moody");
  ok("'moody' finds Chiaroscuro", /chiaroscuro/i.test(await txt(page, "#q-results")), one((await txt(page, "#q-results")).slice(0, 200)));
  await page.fill("#q", "stand out");
  await sleep(800);
  ok("'stand out' returns techniques", (await page.locator("#q-results li").count()) > 0, one((await txt(page, "#q-results")).slice(0, 200)));
  const beforeTech = await txt(page, '[data-level="tech"] [data-v]');
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await sleep(800);
  ok("Enter on hit changes view", (await txt(page, '[data-level="tech"] [data-v]')) !== beforeTech || (await txt(page, '[data-level="ref"] [data-v]')) !== firstTitle, `tech ${beforeTech} -> ${await txt(page, '[data-level="tech"] [data-v]')}`);
  await shot(page, "04b-after-search-enter");
  await page.keyboard.press("Escape");
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press("1");
  await sleep(300);
  await shot(page, "05a-key-1");
  await page.keyboard.press("v");
  await sleep(400);
  await shot(page, "05-value");
  ok("'v' toggles value view", await page.locator("#value").isChecked());
  await page.keyboard.press("v");
  const th0 = await page.evaluate(() => document.documentElement.dataset.theme);
  await page.click("#theme");
  await sleep(300);
  const th1 = await page.evaluate(() => document.documentElement.dataset.theme);
  ok("theme toggles", th0 !== th1, `${th0} -> ${th1}`);
  await shot(page, `06-theme-${th1}`);
  await page.click("#theme");
  await sleep(300);
  await shot(page, `06-theme-${th0}`);
  await page.click("#theme"); // leave on th1, check persistence later

  // ---------- Job 1: hoard ----------
  const files = fs.readdirSync(BATCH).map((f) => path.join(BATCH, f));
  dialogQueue.push(files);
  await page.click('[data-import="files"]');
  await page.waitForFunction(notDone, null, { timeout: 60000 });
  const n1 = await txt(page, "#import-notice [data-body]");
  await shot(page, "07-import-summary");
  ok("mixed batch summary", /Added/.test(n1), one(n1));
  ok("psd + empty skipped with reasons", /fake\.psd/.test(n1) && /empty\.jpg/.test(n1));
  ok("duplicate reported", /already in the library/.test(n1));
  ok("bad ICC imported with warning", /bad_icc\.png[^|]*warning/i.test(one(n1)));
  const libImgs = fs.readdirSync(path.join(LIB, "images"));
  ok("no partial/.tmp/psd in images/", !libImgs.some((f) => /\.tmp|psd/i.test(f)), libImgs.length + " files");
  ok("originals untouched", fs.readdirSync(BATCH).length === files.length);
  const c1 = await txt(page, "#lib-count");
  ok("count after batch", /5[3-6] references/.test(c1), c1);
  ok("inbox count after untagged imports", Number(await txt(page, "#inbox-count")) > 0, await txt(page, "#inbox-count"));

  // scale: 2000 refs, recursive folder; measure main-thread stalls
  await page.evaluate(() => { window.__gap = 0; let last = performance.now(); window.__iv = setInterval(() => { const n = performance.now(); window.__gap = Math.max(window.__gap, n - last - 50); last = n; }, 50); });
  dialogQueue.push(BIG);
  t0 = Date.now();
  await page.click('[data-import="folder"]');
  await sleep(1500);
  const s0 = Date.now();
  await page.fill("#q", "backlit");
  const typeMs = Date.now() - s0;
  await page.waitForFunction(notDone, null, { timeout: 600000 });
  const importMs = Date.now() - t0;
  const gap = await page.evaluate(() => (clearInterval(window.__iv), window.__gap));
  const n2 = await txt(page, "#import-notice [data-body]");
  const c2 = await txt(page, "#lib-count");
  ok("2000-ref recursive folder import", /20\d\d references/.test(c2.replace(",", "")), `${c2}; ${one(n2)}; ${importMs} ms`);
  ok("UI responsive during import (max stall < 500 ms)", gap < 500, `max stall ${Math.round(gap)} ms; typing took ${typeMs} ms`);
  await page.keyboard.press("Escape");
  await shot(page, "08-after-2000");
  const domNodes = await page.evaluate(() => document.getElementsByTagName("*").length);
  ok("DOM size sane at 2000+", domNodes < 5000, domNodes + " nodes");
  await page.fill("#q", "");
  t0 = Date.now();
  await page.fill("#q", "moody");
  await page.waitForFunction(() => document.querySelectorAll("#q-results li").length > 0, null, { timeout: 5000 }).catch(() => {});
  ok("search < 300 ms at 2000+", Date.now() - t0 < 300, `${Date.now() - t0} ms`);
  await page.keyboard.press("Escape");
  // open one synthetic untagged ref: what does Mara see?
  await page.fill("#q", "ref_0001");
  await sleep(800);
  ok("title search finds imported ref", (await page.locator("#q-results li").count()) > 0, one(await txt(page, "#q-results")));
  if (await page.locator("#q-results li").count()) { await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await sleep(900); await shot(page, "08b-untagged-ref"); ok("untagged ref view", true, one((await txt(page, "#pane-callouts")).slice(0, 200))); }

  // ---------- crash-safety ----------
  await closeApp(b);
  const sett = JSON.parse(fs.readFileSync(path.join(process.env.APPDATA, "art.horus.app", "settings.json"), "utf8"));
  ok("settings: findSimilar off + lastLibrary", sett.findSimilar === "off" && String(sett.lastLibrary).includes("Références"), JSON.stringify(sett));
  ({ b, page } = await launch("reopen"));
  await page.waitForFunction(() => /references/.test(document.querySelector("#lib-count")?.textContent || ""), null, { timeout: 30000 }).catch(() => {});
  await sleep(1000);
  const c3 = await txt(page, "#lib-count");
  ok("restart reopens last library, nothing lost", c3 === c2, `${c2} -> ${c3}`);
  ok("theme persisted", (await page.evaluate(() => document.documentElement.dataset.theme)) === th1);
  await closeApp(b);
  fs.writeFileSync(path.join(LIB, "library.json"), "{");
  ({ b, page } = await launch("corrupt"));
  await sleep(4000);
  await shot(page, "09-corrupt-recovery");
  const vis = await page.locator("#import-notice").isVisible();
  const warn = vis ? await txt(page, "#import-notice [data-body]") : "";
  ok("corrupt library.json: recovered + warning shown", warn.length > 0, `${one(warn)} | count ${await txt(page, "#lib-count")}`);
  await closeApp(b);
  ok("zero external network requests", external.length === 0, external.slice(0, 5).join(", "));
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify(R, null, 1));
  process.exit(0);
})().catch((e) => {
  console.error("ABORT", e);
  fs.writeFileSync(path.join(__dirname, "results.json"), JSON.stringify([...R, { name: "ABORT", pass: false, detail: e.stack }], null, 1));
  try { execSync("taskkill /IM horus.exe /F"); } catch {}
  process.exit(1);
});
