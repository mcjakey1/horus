// QA Plan 2 probe: does Enter right after fast typing in the picker apply a stale card?
// Opens an existing library (argv[2]) via first run, tags references with "1, rim light, Enter"
// at different typing speeds, and reads library.json. Backs up and restores %APPDATA%\art.horus.app.
const { chromium } = require(process.env.APPDATA + "/npm/node_modules/playwright");
const { spawn, execSync } = require("child_process");
const fs = require("fs"), path = require("path");
const EXE = path.resolve(__dirname, "../../../app/src-tauri/target/release/horus.exe");
const LIB = process.argv[2], CONFIG = path.join(process.env.APPDATA, "art.horus.app"), BAK = path.join(path.dirname(LIB), "..", "config-backup-race");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const refs = () => JSON.parse(fs.readFileSync(path.join(LIB, "library.json"), "utf8")).references;
if (fs.existsSync(CONFIG)) { fs.cpSync(CONFIG, BAK, { recursive: true }); fs.rmSync(CONFIG, { recursive: true, force: true }); }
let proc;
(async () => {
  proc = spawn(EXE, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=9335" }, stdio: "ignore" });
  let b; for (let i = 0; i < 60 && !b; i++) { try { b = await chromium.connectOverCDP("http://127.0.0.1:9335"); } catch { await sleep(500); } }
  let page; for (let i = 0; i < 40 && !page; i++) { page = b.contexts()[0].pages().find((x) => x.url().includes("tauri.localhost")); if (!page) await sleep(250); }
  const q = [LIB];
  await page.route(/ipc\.localhost\/plugin%3Adialog%7Copen/, (r) => r.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Tauri-Response", "Tauri-Response": "ok" }, body: JSON.stringify(q.shift() ?? null) }));
  await page.waitForSelector(".firstrun", { timeout: 20000 });
  await page.click('[data-pick="open"]'); await sleep(300);
  if (await page.locator('[data-fs="off"]').count()) await page.click('[data-fs="off"]');
  await page.click("#fr-go"); await page.waitForSelector(".firstrun", { state: "detached", timeout: 30000 }); await sleep(800);
  const targets = refs().filter((r) => !r.tags.some((t) => t.techniqueId === "rim-light")).slice(0, 8);
  const out = [];
  for (const [i, r] of targets.entries()) {
    const delay = [0, 0, 0, 0, 20, 20, 60, 60][i];
    await page.click('[data-view-tab="reference"]'); await page.fill("#q", r.title);
    const li = page.locator(`#q-results li[data-r="${r.id}"]`); await li.waitFor({ timeout: 5000 }); await li.click(); await sleep(400);
    await page.evaluate(() => document.activeElement?.blur?.());
    await page.keyboard.press("t"); await page.waitForSelector("aside.margin .picker", { timeout: 5000 });
    await page.keyboard.press("1"); await page.keyboard.type("rim light", { delay });
    const hi = await page.evaluate(() => document.querySelector(".picker .pk-card.is-hi")?.dataset.tech ?? null);
    const query = await page.evaluate(() => document.querySelector(".picker .pk-search")?.value ?? null);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => !document.querySelector("aside.margin .picker"), null, { timeout: 5000 }).catch(() => {});
    await sleep(900);
    const got = refs().find((x) => x.id === r.id).tags.filter((t) => !r.tags.some((o) => o.id === t.id)).map((t) => t.techniqueId ?? `partial:${t.operationId}`);
    out.push({ delay, query, highlightedBeforeEnter: hi, applied: got });
    console.log(JSON.stringify(out.at(-1)));
  }
  execSync(`powershell -NoProfile -Command "(Get-Process -Id ${proc.pid}).CloseMainWindow() | Out-Null"`); await sleep(3000);
  fs.writeFileSync(path.join(path.dirname(LIB), "..", "race.json"), JSON.stringify(out, null, 1));
  finish(0);
})().catch((e) => { console.error("ABORT", e); try { proc.kill(); } catch {} finish(1); });
function finish(c) { fs.rmSync(CONFIG, { recursive: true, force: true }); if (fs.existsSync(BAK)) { fs.cpSync(BAK, CONFIG, { recursive: true }); fs.rmSync(BAK, { recursive: true, force: true }); } process.exit(c); }
