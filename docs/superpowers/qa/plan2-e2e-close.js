// Plan 2 final fix wave, real app: (a) a window close during an import waits for it, then closes;
// (b) Ctrl+Z on a Cyrillic layout (key "я", code "KeyZ") still undoes. Same set-up as plan2-e2e.js:
// the release horus.exe over WebView2 CDP, a fresh library, 20 demo images in a scratch folder.
const { chromium } = require(process.env.APPDATA + "/npm/node_modules/playwright");
const { spawn } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");

const REPO = path.resolve(__dirname, "../../..");
const EXE = path.join(REPO, "app/src-tauri/target/release/horus.exe");
const DEMO = path.join(REPO, "demo/images");
const LIB = "D:/Design Second Brain/Références test 2";
const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), "horus-plan2-e2e-close");
const BATCH = path.join(OUT, "src", "batch of 20");
const CONFIG = path.join(process.env.APPDATA, "art.horus.app");
const PORT = 9333;

const R = [], dialogQueue = [];
const ok = (name, pass, detail = "") => { R.push({ name, pass, detail: String(detail) }); console.log(pass ? "PASS" : "FAIL", name, "::", detail); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const refs = () => { try { return JSON.parse(fs.readFileSync(path.join(LIB, "library.json"), "utf8")).references; } catch { return null; } };
async function until(fn, ms = 5000, step = 20) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return { v, ms: Date.now() - t0 }; if (Date.now() - t0 > ms) return { v: null, ms: Date.now() - t0 }; await sleep(step); }
}

if (fs.existsSync(LIB) && fs.readdirSync(LIB).length) throw new Error(`${LIB} is not empty`);
if (fs.existsSync(path.join(CONFIG, "settings.json"))) throw new Error("not a first run");
fs.rmSync(path.join(OUT, "src"), { recursive: true, force: true });
fs.mkdirSync(BATCH, { recursive: true });
fs.mkdirSync(LIB, { recursive: true });
for (const f of fs.readdirSync(DEMO).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort().slice(0, 20)) fs.copyFileSync(path.join(DEMO, f), path.join(BATCH, f));

let proc;
const exited = () => new Promise((r) => (proc.exitCode !== null ? r() : proc.on("exit", r)));
async function launch() {
  proc = spawn(EXE, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: "ignore" });
  let b;
  for (let i = 0; i < 60 && !b; i++) { try { b = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await sleep(500); } }
  let page;
  for (let i = 0; i < 40 && !page; i++) { page = b.contexts()[0].pages().find((x) => x.url().includes("tauri.localhost")); if (!page) await sleep(250); }
  await page.route(/ipc\.localhost\/plugin%3Adialog%7Copen/, (route) => {
    const v = dialogQueue.length ? dialogQueue.shift() : null;
    route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Tauri-Response", "Tauri-Response": "ok" }, body: JSON.stringify(v) });
  });
  page.on("pageerror", (e) => ok("page error", false, e.message));
  return { b, page };
}
/** A PowerShell already holding the window, so the close costs no process start-up. */
function closer(pid) {
  const ps = spawn("powershell", ["-NoProfile", "-Command", `$p = Get-Process -Id ${pid}; [void][Console]::In.ReadLine(); [void]$p.CloseMainWindow()`], { stdio: ["pipe", "ignore", "ignore"] });
  return { ready: sleep(2500), close: () => ps.stdin.write("\n") };
}
const count = async (page) => Number(((await page.locator("#lib-count").innerText().catch(() => "")).match(/\d+/) ?? [-1])[0]);

(async () => {
  let { b, page } = await launch();
  await page.waitForSelector(".firstrun", { timeout: 20000 });
  dialogQueue.push(LIB);
  await page.click('[data-pick="create"]');
  await sleep(300);
  await page.uncheck("#fr-demo");
  if (await page.locator('[data-fs="off"]').count()) await page.click('[data-fs="off"]');
  await page.click("#fr-go");
  await page.waitForSelector(".firstrun", { state: "detached", timeout: 60000 });
  ok("setup: fresh library", (await count(page)) === 0);

  // ---------- (a) close mid-import ----------
  const c = closer(proc.pid);
  await c.ready;
  await page.evaluate((p) => void window.__TAURI_INTERNALS__.invoke("import_paths", { paths: [p] }).catch(() => {}), BATCH);
  await sleep(100); // well inside the ~5 s import
  const t0 = Date.now();
  const midImport = refs()?.length ?? 0;
  c.close();
  const note = await until(() => page.evaluate(() => !!document.querySelector("#import-notice:not([hidden]) [data-close-waiting]")).catch(() => false), 5000);
  await page.screenshot({ path: path.join(OUT, "close-waiting.png") }).catch(() => {});
  ok("a: 'Finishing the import before closing.' shows", !!note.v, `${note.ms} ms after the close`);
  await Promise.race([exited(), sleep(60000)]);
  const closeMs = Date.now() - t0;
  const onDisk = refs()?.length ?? 0;
  try { await b.close(); } catch {}
  ok("a: the window closes by itself after the import", proc.exitCode !== null, `closed ${closeMs} ms after CloseMainWindow; references on disk when the close was asked ${midImport}, after exit ${onDisk}`);
  ({ b, page } = await launch());
  await page.waitForFunction(() => /references/.test(document.querySelector("#lib-count")?.textContent || ""), null, { timeout: 30000 });
  const n = await count(page);
  ok("a: on relaunch all 20 references are there", n === 20 && onDisk === 20, `${n} in the app, ${refs()?.length} in library.json`);

  // ---------- (b) Ctrl+Z on a Cyrillic layout ----------
  await page.evaluate(() => document.activeElement?.blur?.());
  const ref = await page.evaluate(() => document.querySelector("[data-ref-drop]")?.dataset.refDrop);
  await page.keyboard.press("t");
  await page.waitForSelector("aside.margin .picker", { timeout: 5000 });
  await page.keyboard.press("1");
  await page.keyboard.type("chiaro");
  await page.keyboard.press("Enter");
  const tagged = (r) => !!r?.find((x) => x.id === ref)?.tags.some((t) => t.techniqueId === "chiaroscuro");
  let w = await until(() => tagged(refs()), 3000);
  ok("b setup: a tag to undo", !!w.v, ref);
  const prevented = await page.evaluate(() => {
    document.activeElement?.blur?.();
    const e = new KeyboardEvent("keydown", { key: "я", code: "KeyZ", ctrlKey: true, bubbles: true, cancelable: true });
    document.body.dispatchEvent(e);
    return e.defaultPrevented;
  });
  w = await until(() => !tagged(refs()), 3000);
  ok("b: Ctrl+я (code KeyZ) undoes", !!w.v, `handled (defaultPrevented ${prevented}); tag gone from library.json after ${w.ms} ms`);

  const c2 = closer(proc.pid);
  await c2.ready;
  c2.close();
  await Promise.race([exited(), sleep(30000)]);
  try { await b.close(); } catch {}
  fs.writeFileSync(path.join(OUT, "results-close.json"), JSON.stringify(R, null, 1));
  process.exit(0);
})().catch((e) => {
  console.error("ABORT", e);
  try { proc?.kill(); } catch {}
  process.exit(1);
});
