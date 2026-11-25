// Plan 2 Task 12: the end-to-end check (Hoard, then Tag later) against the real release horus.exe,
// driven over WebView2 CDP, after mara-plan1.js. OS gestures CDP can't make are driven one layer
// down: a drop is the `tauri://drag-drop` event the webview would get, a paste is a synthetic
// `paste` event with a DataTransfer. Run: node docs/superpowers/qa/plan2-e2e.js (after
// `npm run tauri build -- --no-bundle` in app/). Needs a fresh %APPDATA%\art.horus.app.
const { chromium } = require(process.env.APPDATA + "/npm/node_modules/playwright");
const { spawn } = require("child_process");
const fs = require("fs"), path = require("path"), os = require("os");

const REPO = path.resolve(__dirname, "../../..");
const EXE = path.join(REPO, "app/src-tauri/target/release/horus.exe");
const DEMO = path.join(REPO, "demo/images");
const LIB_A = "D:\\Design Second Brain\\Références test 2";
const LIB_B = "D:\\Design Second Brain\\Références test 2 B";
const OUT = process.env.E2E_OUT || path.join(os.tmpdir(), "horus-plan2-e2e");
const SRC = path.join(OUT, "src"), BATCH = path.join(SRC, "batch of 20"), SHOTS = path.join(OUT, "shots");
const CONFIG = path.join(process.env.APPDATA, "art.horus.app");
const PORT = 9333; // not 9222: other QA sessions use that one

const R = [], external = [], dialogQueue = [];
const ok = (name, pass, detail = "") => { R.push({ name, pass, detail: String(detail) }); console.log(pass ? "PASS" : "FAIL", name, "::", detail); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const one = (s) => String(s).replace(/\s*\n+\s*/g, " | ");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const lib = (root = LIB_A) => readJson(path.join(root, "library.json"));
const refsOf = (l) => (l?.references ?? []);
async function until(fn, ms = 5000, step = 20) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return { v, ms: Date.now() - t0 }; if (Date.now() - t0 > ms) return { v: null, ms: Date.now() - t0 }; await sleep(step); }
}

// ---------- fixtures: 20 images for the folder, two more for the plate drop and the paste ----------
for (const p of [LIB_A, LIB_B]) if (fs.existsSync(p) && fs.readdirSync(p).length) throw new Error(`${p} is not empty: not a fresh library`);
if (fs.existsSync(path.join(CONFIG, "settings.json"))) throw new Error(`${CONFIG}\\settings.json exists: not a first run`);
fs.rmSync(SRC, { recursive: true, force: true });
fs.mkdirSync(BATCH, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });
for (const p of [LIB_A, LIB_B]) fs.mkdirSync(p, { recursive: true });
const demo = fs.readdirSync(DEMO).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
for (const f of demo.slice(0, 20)) fs.copyFileSync(path.join(DEMO, f), path.join(BATCH, f));
const PLATE_IMG = path.join(SRC, demo[20]);
fs.copyFileSync(path.join(DEMO, demo[20]), PLATE_IMG);
const PASTE_IMG = path.join(DEMO, demo[21]);

let proc;
async function launch(tag) {
  proc = spawn(EXE, [], { env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: "ignore" });
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
    if (!/(^|\.)localhost$/.test(u.hostname) && !["data:", "blob:"].includes(u.protocol)) external.push(r.url());
  });
  page.on("console", (m) => { if (m.type() === "error") ok(`console error (${tag})`, false, m.text()); });
  page.on("pageerror", (e) => ok(`page error (${tag})`, false, e.message));
  return { b, page };
}
/** A PowerShell that already holds the window, so the close request costs no process start-up. */
function closer(pid) {
  const ps = spawn("powershell", ["-NoProfile", "-Command", `$p = Get-Process -Id ${pid}; [void][Console]::In.ReadLine(); [void]$p.CloseMainWindow(); $p.WaitForExit(30000) | Out-Null; 'exited'`], { stdio: ["pipe", "pipe", "ignore"] });
  const ready = sleep(2500); // PowerShell start-up, before the moment we measure
  return { ready, close: () => ps.stdin.write("\n"), done: new Promise((r) => ps.on("exit", r)) };
}
const exited = (p) => new Promise((r) => (p.exitCode !== null ? r() : p.on("exit", r)));
async function closeApp(b) {
  const c = closer(proc.pid);
  await c.ready;
  c.close();
  await Promise.race([exited(proc), sleep(30000)]);
  try { await b.close(); } catch {}
}

const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + ".png") }).catch(() => {});
const txt = (page, s) => page.locator(s).first().innerText().catch(() => "");
const count = async (page) => Number((await txt(page, "#lib-count")).match(/\d+/)?.[0] ?? -1);
const noticeDone = (page) => page.waitForFunction(() => !/Importing/.test(document.querySelector("#import-notice [data-body]")?.textContent || "Importing"), null, { timeout: 60000 });
/** Tauri's own drop event, as the webview gets it from the OS; position in physical pixels. */
const drop = (page, paths, at) => page.evaluate(([paths, at]) => {
  const dpr = window.devicePixelRatio || 1;
  let x = 5, y = 5;
  if (at) { const r = document.querySelector(at).getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  return window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://drag-drop", payload: { paths, position: { x: x * dpr, y: y * dpr } } });
}, [paths, at]);
const blur = (page) => page.evaluate(() => (document.activeElement)?.blur?.());
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}.${a.className}` : "none"; });
/** Search the top bar for a title and open it in the Reference view. */
async function openRef(page, r) {
  await page.click('[data-view-tab="reference"]');
  await page.fill("#q", r.title);
  const li = page.locator(`#q-results li[data-r="${r.id}"]`);
  await li.waitFor({ timeout: 5000 });
  await li.click();
  await sleep(500);
  await blur(page);
}
const focusId = (page) => page.evaluate(() => document.querySelector("[data-ref-drop]")?.dataset.refDrop ?? null);

(async () => {
  // ---------- set up: a fresh library, demo set off ----------
  let { b, page } = await launch("first-run");
  await page.waitForSelector(".firstrun", { timeout: 20000 });
  dialogQueue.push(LIB_A);
  await page.click('[data-pick="create"]');
  await sleep(300);
  await page.uncheck("#fr-demo");
  if (await page.locator('[data-fs="off"]').count()) await page.click('[data-fs="off"]');
  await page.click("#fr-go");
  await page.waitForSelector(".firstrun", { state: "detached", timeout: 60000 });
  await sleep(800);
  ok("setup: fresh library, demo off", (await count(page)) === 0, await txt(page, "#lib-count"));

  // ---------- 1. drop a folder of 20; Ctrl+Z, Ctrl+Shift+Z ----------
  let t0 = Date.now();
  await drop(page, [BATCH]);
  await noticeDone(page);
  const n1 = await txt(page, "#import-notice [data-body]");
  await shot(page, "01-drop-20");
  ok("1 drop: 'Added 20 to the Inbox'", /Added 20 to the Inbox/.test(n1), `${one(n1).slice(0, 160)} (${Date.now() - t0} ms)`);
  ok("1 badge shows 20", (await txt(page, "#inbox-count")) === "20", await txt(page, "#inbox-count"));
  await blur(page);
  ok("1 focus before Ctrl+Z is not a text field", true, await active(page));
  await page.keyboard.press("Control+z");
  let w = await until(async () => (await count(page)) === 0, 5000);
  ok("1 Ctrl+Z removes all 20", !!w.v, `${await txt(page, "#lib-count")}, badge ${await txt(page, "#inbox-count")} (${w.ms} ms)`);
  await page.keyboard.press("Control+Shift+z");
  w = await until(async () => (await count(page)) === 20, 5000);
  ok("1 Ctrl+Shift+Z brings them back", !!w.v && (await txt(page, "#inbox-count")) === "20", `${await txt(page, "#lib-count")}, badge ${await txt(page, "#inbox-count")} (${w.ms} ms)`);

  // ---------- 2. drop it again ----------
  await drop(page, [BATCH]);
  await noticeDone(page);
  await sleep(200);
  const dupRows = await page.locator("#import-notice li", { hasText: "Already in your library" }).count();
  const n2 = await txt(page, "#import-notice [data-body]");
  await shot(page, "02-drop-again");
  ok("2 again: 20 'Already in your library' rows", dupRows === 20, `${dupRows} rows; ${one(n2).slice(0, 120)}`);
  ok("2 no new references", (await count(page)) === 20, await txt(page, "#lib-count"));

  // ---------- 3. tag 5 Inbox items by keyboard only ----------
  const Q = ["chiaro", "silhou", "chiaro", "rim light", "chiaro"];
  await page.click('[data-view-tab="inbox"]'); // the view switch; the tagging below is keys only
  await sleep(500);
  const times = [], tagged = [];
  let arrowMoved = 0;
  for (let i = 0; i < Q.length; i++) {
    const id = await page.evaluate(() => document.querySelector(".inbox-dock .picker")?.dataset.ref ?? null);
    if (!id) { ok(`3 item ${i + 1}: picker open`, false, "no picker"); break; }
    const s = Date.now();
    await page.keyboard.press("1");
    await page.keyboard.type(Q[i]);
    await page.keyboard.press("Enter");
    const got = await until(() => page.evaluate((id) => !!document.querySelector(`.inbox-tile[data-id="${CSS.escape(id)}"] .inbox-tagged`), id), 10000);
    times.push(Date.now() - s);
    if (got.v) tagged.push(id);
    if (i === Q.length - 1) break;
    const before = await active(page);
    await page.keyboard.press("ArrowRight");
    await sleep(250);
    let next = await page.evaluate(() => document.querySelector(".inbox-dock .picker")?.dataset.ref ?? null);
    if (next !== id) arrowMoved++;
    else {
      ok(`3 item ${i + 1}: → moves on`, false, `→ stayed on the same item; focus was ${before}`);
      await page.keyboard.press("Tab"); // out of the search, onto a technique card
      const onto = await active(page);
      await page.keyboard.press("ArrowRight");
      await sleep(250);
      next = await page.evaluate(() => document.querySelector(".inbox-dock .picker")?.dataset.ref ?? null);
      ok(`3 item ${i + 1}: Tab then → moves on`, !!next && next !== id, `Tab put focus on ${onto}`);
    }
  }
  await shot(page, "03-inbox-tagged");
  ok("3 five items tagged by keyboard", tagged.length === 5, `${tagged.length} tagged`);
  ok("3 each under 10 s (app time, scripted keys)", times.length === 5 && times.every((t) => t < 10000), times.map((t) => `${t} ms`).join(", "));
  ok("3 → after Enter moves to the next item", arrowMoved === Q.length - 1, `${arrowMoved}/${Q.length - 1} moves by → alone`);
  await sleep(800); // the debounced save
  const A1 = lib();
  const byId = new Map(refsOf(A1).map((r) => [r.id, r]));
  const chiaro = tagged.filter((id) => byId.get(id)?.tags.some((t) => t.techniqueId === "chiaroscuro"));

  // ---------- 4. drop a new image onto a reference's plate ----------
  const src = byId.get(chiaro[0]);
  await openRef(page, src);
  const shown = await focusId(page);
  ok("4 setup: tagged reference on the plate", shown === src.id, `${shown} / ${src.id} ${src.title}`);
  const hit = await page.evaluate(() => {
    const r = document.querySelector("#plate").getBoundingClientRect();
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return `${e?.tagName.toLowerCase()}#${e?.id}.${e?.className}; closest [data-ref-drop]: ${e?.closest("[data-ref-drop]")?.id ?? "none"}`;
  });
  ok("4 diagnostic: what the plate centre hit-tests to", true, hit);
  await drop(page, [PLATE_IMG], "#plate");
  await noticeDone(page);
  const pk = await until(() => page.evaluate(() => {
    const p = document.querySelector(".inbox-dock .picker");
    return p && { ref: p.dataset.ref, ticked: [...p.querySelectorAll(".pk-card.is-ticked")].map((c) => c.dataset.tech), view: document.body.dataset.view };
  }), 5000);
  const want = [...new Set(src.tags.filter((t) => t.techniqueId).map((t) => t.techniqueId))].sort();
  const newId = pk.v?.ref;
  await shot(page, "04-plate-drop");
  ok("4 picker opens on the new reference", !!newId && newId !== src.id && !byId.has(newId), JSON.stringify(pk.v));
  ok("4 the source's techniques are ticked", JSON.stringify([...(pk.v?.ticked ?? [])].sort()) === JSON.stringify(want), `ticked ${pk.v?.ticked} / source ${want}`);
  await page.keyboard.press("Escape"); // leave it untagged

  // ---------- 5. a box dragged in the lightbox shows as an outline on a Reference view tile ----------
  const other = chiaro.find((id) => id !== src.id);
  if (!other) throw new Error(`item 5 needs two Chiaroscuro references; tagged ${JSON.stringify(chiaro)}`);
  const X = byId.get(other), Y = src;
  await openRef(page, X);
  ok("5 setup: on reference X", (await focusId(page)) === X.id, X.title);
  await page.keyboard.press("l");
  await page.waitForSelector(".lightbox .lb-plate", { timeout: 5000 });
  await sleep(400);
  const pb = await page.locator(".lightbox .lb-plate").boundingBox();
  await page.mouse.move(pb.x + pb.width * 0.3, pb.y + pb.height * 0.3);
  await page.mouse.down();
  await page.mouse.move(pb.x + pb.width * 0.5, pb.y + pb.height * 0.5, { steps: 6 });
  await page.mouse.move(pb.x + pb.width * 0.6, pb.y + pb.height * 0.65, { steps: 6 });
  await page.mouse.up();
  await page.waitForSelector(".lightbox .lb-side .picker", { timeout: 5000 }).catch(() => {});
  await page.keyboard.press("1");
  await page.keyboard.type("chiaro");
  await page.keyboard.press("Enter");
  const boxed = await until(() => page.evaluate(() => document.querySelectorAll(".lightbox .lb-box").length > 0), 5000);
  await shot(page, "05a-lightbox-box");
  ok("5 lightbox: the region is tagged", !!boxed.v, `${boxed.ms} ms`);
  await page.keyboard.press("Escape");
  await sleep(300);
  if (await page.locator(".lightbox").count()) { await page.keyboard.press("Escape"); await sleep(300); }
  await page.click("#tab-callouts").catch(() => {});
  await openRef(page, Y);
  const outline = await until(() => page.evaluate((x) => !!document.querySelector(`#pane-callouts .thumb[data-go="${CSS.escape(x)}"] .treg`), X.id), 3000);
  await shot(page, "05b-tile-outline");
  ok("5 X's tile on Y's callout shows the outline", !!outline.v, `X ${X.title} on Y ${Y.title}`);

  // ---------- 6. "Halo glow" from the picker; one Ctrl+Z ----------
  const tagRef = await focusId(page);
  const taxPath = path.join(LIB_A, "taxonomy.json");
  const halo = () => (readJson(taxPath)?.techniques ?? []).find((t) => t.name === "Halo glow");
  ok("6 setup: no Halo glow yet", !halo());
  await page.keyboard.press("t");
  await page.waitForSelector("aside.margin .picker", { timeout: 5000 });
  await page.keyboard.press("1");
  await page.keyboard.type("Halo glow");
  let hi = "";
  for (let i = 0; i < 40; i++) {
    hi = await page.evaluate(() => document.querySelector(".picker .pk-card.is-hi")?.className ?? "");
    if (/pk-new/.test(hi)) break;
    await page.keyboard.press("ArrowDown");
  }
  ok("6 '+ New technique' highlighted", /pk-new/.test(hi), hi);
  await page.keyboard.press("Enter"); // opens the form, name filled in
  await page.waitForSelector(".pk-form", { timeout: 3000 });
  await page.keyboard.press("Tab");
  await page.keyboard.type("A bright ring of light around the subject.");
  t0 = Date.now();
  await page.keyboard.press("Enter"); // submits the form
  w = await until(() => halo(), 5000);
  ok("6 taxonomy.json has Halo glow, custom: true, within 1 s", !!w.v && w.v.custom === true && w.ms <= 1000, `${w.ms} ms; ${JSON.stringify(w.v && { id: w.v.id, custom: w.v.custom })}`);
  const haloId = w.v?.id;
  const tagShown = await until(() => page.evaluate((h) => [...document.querySelectorAll("#pane-callouts .call h3")].some((e) => e.textContent.includes(h)), "Halo glow"), 3000);
  ok("6 the reference carries the Halo glow tag", !!tagShown.v);
  await sleep(100);
  ok("6 focus before Ctrl+Z", true, await active(page));
  t0 = Date.now();
  await page.keyboard.press("Control+z");
  w = await until(() => !halo(), 5000);
  ok("6 one Ctrl+Z: taxonomy.json drops it within 1 s", !!w.v && w.ms <= 1000, `${w.ms} ms`);
  await sleep(800);
  const r6 = refsOf(lib()).find((r) => r.id === tagRef);
  ok("6 the same Ctrl+Z removed the tag", !!r6 && !r6.tags.some((t) => t.techniqueId === haloId), JSON.stringify(r6?.tags.map((t) => t.techniqueId)));

  // ---------- 7. paste an image with <img> HTML ----------
  const URL7 = "https://images.example.invalid/halo-study.jpg";
  const bytes = [...fs.readFileSync(PASTE_IMG)];
  const before7 = await count(page);
  await page.evaluate(([bytes, name, url]) => {
    const dt = new DataTransfer();
    dt.items.add(new File([new Uint8Array(bytes)], name, { type: "image/jpeg" }));
    dt.setData("text/html", `<meta charset="utf-8"><img src="${url}" alt="">`);
    document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  }, [bytes, path.basename(PASTE_IMG), URL7]);
  await noticeDone(page);
  w = await until(() => refsOf(lib()).find((r) => r.sourceUrl === URL7), 3000);
  await shot(page, "07-paste");
  ok("7 paste adds one reference", (await count(page)) === before7 + 1, await txt(page, "#import-notice [data-body]"));
  ok("7 sourceUrl filled from the <img> HTML (library.json)", !!w.v, w.v ? `${w.v.title}: ${w.v.sourceUrl}` : "no reference with that sourceUrl");

  // ---------- 8. tag, then close within 0.5 s; relaunch ----------
  await blur(page);
  const ref8 = await focusId(page);
  const c = closer(proc.pid);
  await c.ready;
  await page.keyboard.press("t");
  await page.waitForSelector("aside.margin .picker", { timeout: 5000 });
  await page.keyboard.press("1");
  await page.keyboard.type("silhou");
  t0 = Date.now();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.querySelector("aside.margin .picker"), null, { timeout: 5000 });
  const tagMs = Date.now() - t0;
  const has8 = (l) => !!refsOf(l).find((r) => r.id === ref8)?.tags.some((t) => t.techniqueId === "silhouette");
  const savedBefore = has8(lib());
  const tc = Date.now();
  c.close();
  await Promise.race([exited(proc), sleep(30000)]);
  const closeMs = Date.now() - tc;
  try { await b.close(); } catch {}
  ok("8 closed within 0.5 s of tagging", tc - t0 < 500, `tag ${tagMs} ms after Enter; close asked ${tc - t0} ms after Enter; window gone ${closeMs} ms later; on disk before close: ${savedBefore}`);
  ok("8 the tag is on disk after close", has8(lib()));
  ({ b, page } = await launch("relaunch"));
  await page.waitForFunction(() => /references/.test(document.querySelector("#lib-count")?.textContent || ""), null, { timeout: 30000 });
  await sleep(800);
  const r8 = refsOf(lib()).find((r) => r.id === ref8);
  await openRef(page, r8);
  const sil = await until(() => page.evaluate(() => [...document.querySelectorAll("#pane-callouts .call h3")].some((e) => /Silhouette/.test(e.textContent))), 3000);
  ok("8 on relaunch the tag is there", has8(lib()) && !!sil.v, `${await txt(page, "#lib-count")}; ${r8.title}`);

  // ---------- 9. Library → Open library… switches; Ctrl+Z has nothing to undo ----------
  const countA = await count(page);
  await page.click("#library-menu");
  dialogQueue.push(LIB_B);
  await page.click('[data-lib="new"]');
  await page.waitForSelector(".lib-new:not([hidden])", { timeout: 3000 });
  await page.click('.lib-new button[type="submit"]');
  w = await until(async () => (await count(page)) === 0, 10000);
  ok("9 setup: New library… B (empty)", !!w.v, await txt(page, "#lib-count"));
  await page.click("#library-menu");
  dialogQueue.push(LIB_A);
  await page.click('[data-lib="open"]');
  w = await until(async () => (await count(page)) === countA, 10000);
  ok("9 setup: back on A", !!w.v, await txt(page, "#lib-count"));
  await blur(page);
  await page.keyboard.press("t"); // an edit in A, so A has something to undo
  await page.waitForSelector("aside.margin .picker", { timeout: 5000 });
  await page.keyboard.press("1");
  await page.keyboard.type("rim light");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => !document.querySelector("aside.margin .picker"), null, { timeout: 5000 });
  await sleep(900);
  const aText = fs.readFileSync(path.join(LIB_A, "library.json"), "utf8");
  await page.click("#library-menu");
  dialogQueue.push(LIB_B);
  t0 = Date.now();
  await page.click('[data-lib="open"]');
  w = await until(async () => (await count(page)) === 0, 10000);
  await shot(page, "09-switched");
  ok("9 Open library… switches to B", !!w.v, `${await txt(page, "#lib-count")} (${w.ms} ms)`);
  const bText = fs.readFileSync(path.join(LIB_B, "library.json"), "utf8");
  await blur(page);
  await page.keyboard.press("Control+z");
  await sleep(1200);
  // An empty history answers undo with an empty Change and canUndo false (or a refusal).
  const undo = await page.evaluate(() => window.__TAURI_INTERNALS__.invoke("undo").then((c) => ({ c }), (e) => ({ e: String(e) })));
  const empty = undo.e !== undefined || (!undo.c.references.length && !undo.c.removed.length && !undo.c.taxonomy && !undo.c.canUndo);
  ok("9 Ctrl+Z has nothing to undo", empty && (await count(page)) === 0, JSON.stringify(undo).slice(0, 160));
  ok("9 B and A unchanged by the Ctrl+Z", fs.readFileSync(path.join(LIB_B, "library.json"), "utf8") === bText && fs.readFileSync(path.join(LIB_A, "library.json"), "utf8") === aText);

  await closeApp(b);
  ok("zero external network requests", external.length === 0, external.slice(0, 5).join(", "));
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(R, null, 1));
  process.exit(0);
})().catch((e) => {
  console.error("ABORT", e);
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify([...R, { name: "ABORT", pass: false, detail: e.stack }], null, 1));
  try { proc?.kill(); } catch {}
  process.exit(1);
});
