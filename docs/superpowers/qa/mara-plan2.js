// QA Plan 2 as Mara (QA-PERSONA.md): a Friday "hoard, then tag later" session against the real
// release horus.exe over WebView2 CDP. Complements plan2-e2e.js (Task 12 checklist) by aiming at
// Review Focus 1-5, save failure, Merge, chips, AND/OR, a 2,000-item Inbox, and Plan 1 carries.
// Run: node mara-plan2.js <work dir outside the repo>. Backs up and restores %APPDATA%\art.horus.app.
const { chromium } = require(process.env.APPDATA + "/npm/node_modules/playwright");
const { spawn, execSync } = require("child_process");
const fs = require("fs"), path = require("path");

const REPO = path.resolve(__dirname, "../../..");
const EXE = path.join(REPO, "app/src-tauri/target/release/horus.exe");
const DEMO = path.join(REPO, "demo/images");
const W = process.argv[2]; if (!W) throw new Error("usage: node mara-plan2.js <work dir>");
const FX = path.join(W, "fx");
const LIB = path.join(FX, "Mara Bibliothèque"), MESSY = path.join(FX, "Mara inbox ü"), BIG = path.join(FX, "Old refs 2000");
const FRIDAY = path.join(FX, "Friday batch é"), SHOTS = path.join(W, "shots2");
const CONFIG = path.join(process.env.APPDATA, "art.horus.app"), CONFIG_BAK = path.join(W, "config-backup");
const PORT = 9334;

const R = [], external = [], dialogQueue = [];
const ok = (name, pass, detail = "") => { R.push({ name, pass, detail: String(detail) }); console.log(pass ? "PASS" : "FAIL", name, "::", detail); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const one = (s) => String(s).replace(/\s*\n+\s*/g, " | ");
const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };
const lib = (root = LIB) => readJson(path.join(root, "library.json"));
const refs = (root) => lib(root)?.references ?? [];
async function until(fn, ms = 5000, step = 25) {
  const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return { v, ms: Date.now() - t0 }; if (Date.now() - t0 > ms) return { v: null, ms: Date.now() - t0 }; await sleep(step); }
}

// ---------- fixtures ----------
fs.rmSync(LIB, { recursive: true, force: true }); fs.mkdirSync(LIB, { recursive: true });
fs.rmSync(path.join(MESSY, "Horus Library"), { recursive: true, force: true });
fs.rmSync(FRIDAY, { recursive: true, force: true }); fs.mkdirSync(FRIDAY, { recursive: true });
const bigFiles = [];
for (const d of [path.join(BIG, "nested", "deeper"), path.join(BIG, "nested")]) for (const f of fs.readdirSync(d)) if (f.endsWith(".jpg")) bigFiles.push(path.join(d, f));
for (const f of bigFiles.slice(0, 12)) fs.copyFileSync(f, path.join(FRIDAY, "friday " + path.basename(f)));
for (const f of ["fake.psd", "empty.jpg"]) fs.copyFileSync(path.join(MESSY, f), path.join(FRIDAY, f));
const demo = fs.readdirSync(DEMO).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort();
fs.copyFileSync(path.join(DEMO, demo[0]), path.join(FRIDAY, "already have this " + demo[0])); // dup of a demo ref
fs.mkdirSync(SHOTS, { recursive: true });
if (fs.existsSync(CONFIG)) { fs.rmSync(CONFIG_BAK, { recursive: true, force: true }); fs.cpSync(CONFIG, CONFIG_BAK, { recursive: true }); fs.rmSync(CONFIG, { recursive: true, force: true }); }

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
  page.on("request", (r) => { const u = new URL(r.url()); if (!/(^|\.)localhost$/.test(u.hostname) && !["data:", "blob:"].includes(u.protocol)) external.push(r.url()); });
  page.on("console", (m) => { if (m.type() === "error") ok(`console error (${tag})`, false, m.text()); });
  page.on("pageerror", (e) => ok(`page error (${tag})`, false, e.message));
  return { b, page };
}
const askClose = () => { try { execSync(`powershell -NoProfile -Command "(Get-Process -Id ${proc.pid}).CloseMainWindow() | Out-Null"`); } catch {} };
const exited = (ms) => until(() => proc.exitCode !== null, ms, 100);
async function closeApp(b) { askClose(); await exited(30000); try { await b.close(); } catch {} }
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + ".png") }).catch(() => {});
const txt = (page, s) => page.locator(s).first().innerText().catch(() => "");
const count = async (page) => Number((await txt(page, "#lib-count")).replace(/,/g, "").match(/\d+/)?.[0] ?? -1);
const notice = (page) => txt(page, "#import-notice [data-body]");
const noticeDone = (page, ms = 60000) => page.waitForFunction(() => { const t = document.querySelector("#import-notice [data-body]")?.textContent || ""; return t && !/Importing|Adding/.test(t); }, null, { timeout: ms });
const drop = (page, paths, at) => page.evaluate(([paths, at]) => {
  const dpr = window.devicePixelRatio || 1; let x = 5, y = 5;
  if (at) { const r = document.querySelector(at).getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  return window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://drag-drop", payload: { paths, position: { x: x * dpr, y: y * dpr } } });
}, [paths, at]);
const paste = (page, items) => page.evaluate((items) => {
  const dt = new DataTransfer();
  for (const it of items) { if (it.bytes) dt.items.add(new File([new Uint8Array(it.bytes)], it.name, { type: it.type })); else dt.setData(it.type, it.data); }
  document.body.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
}, items);
const blur = (page) => page.evaluate(() => document.activeElement?.blur?.());
const dockRef = (page) => page.evaluate(() => document.querySelector(".inbox-dock .picker")?.dataset.ref ?? null);
const focusId = (page) => page.evaluate(() => document.querySelector("[data-ref-drop]")?.dataset.refDrop ?? null);
async function openRef(page, r) {
  await page.click('[data-view-tab="reference"]');
  await page.fill("#q", r.title);
  const li = page.locator(`#q-results li[data-r="${r.id}"]`);
  await li.waitFor({ timeout: 5000 }); await li.click(); await sleep(500); await blur(page);
}

(async () => {
  // ---------- first run: demo on, library under a non-ASCII path ----------
  let { b, page } = await launch("first-run");
  await page.waitForSelector(".firstrun", { timeout: 20000 });
  dialogQueue.push(LIB); await page.click('[data-pick="create"]'); await sleep(300);
  if (await page.locator('[data-fs="off"]').count()) await page.click('[data-fs="off"]');
  await page.click("#fr-go");
  await page.waitForSelector(".firstrun", { state: "detached", timeout: 120000 }); await sleep(1000);
  ok("setup: demo library", (await count(page)) === 50, await txt(page, "#lib-count"));
  const layout = ["library.json", "taxonomy.json", "images", "thumbs/256", "thumbs/1024"].filter((p) => !fs.existsSync(path.join(LIB, p)));
  ok("P1 carry: library layout complete", layout.length === 0, layout.join(", ") || "library.json, taxonomy.json, images/, thumbs/256/, thumbs/1024/");
  ok("P1 carry: thumbs written for every demo ref", fs.readdirSync(path.join(LIB, "thumbs/256")).length >= 50 && fs.readdirSync(path.join(LIB, "thumbs/1024")).length >= 50);

  // ---------- M2 re-test + AND/OR (Task 11) ----------
  await page.locator("#pane-callouts .filter-by").first().click(); await sleep(500);
  await shot(page, "01-filter-one");
  const scores = await page.$$eval("#pane-ranked .row .sc", (els) => els.map((e) => e.textContent.trim()).filter((s) => s !== "this" && s !== "link").map(Number));
  ok("M2 re-test: filtered Ranked sorted by score desc", scores.length > 1 && scores.every((s, i) => i === 0 || scores[i - 1] >= s), scores.join(", "));
  const nOne = await page.locator("#pane-ranked .row").count();
  await page.click("#tab-callouts"); await page.locator("#pane-callouts .filter-by").nth(1).click(); await sleep(500);
  const chips = await page.locator("#pane-ranked .chip").count();
  const orN = await page.locator("#pane-ranked .row").count();
  await page.click('#pane-ranked [data-mode="and"]'); await sleep(400);
  const andN = await page.locator("#pane-ranked .row").count();
  await shot(page, "02-filter-and");
  ok("AND/OR: two chips, Any of ≥ All of", chips === 2 && orN >= andN && orN >= nOne, `chips ${chips}; one ${nOne}, any ${orN}, all ${andN}; ${one(await txt(page, "#pane-ranked .pane-note, #pane-ranked .filter"))}`);
  if (andN === 0) ok("AND empty-state copy", /No reference has all of these yet\./.test(await txt(page, "#pane-ranked")));
  await page.locator("#pane-ranked .chip-x").first().click(); await sleep(300);
  ok("chip × removes one technique", (await page.locator("#pane-ranked .chip").count()) === 1);

  // ---------- Review Focus 1: Ctrl+Z inside text fields never undoes the library ----------
  await page.click("#tab-callouts");
  const before = fs.readFileSync(path.join(LIB, "library.json"), "utf8");
  await page.click("#q"); await page.keyboard.type("moody shadows"); await page.keyboard.press("Control+z"); await sleep(600);
  ok("RF1: Ctrl+Z in search undoes typing", (await page.inputValue("#q")) !== "moody shadows", JSON.stringify(await page.inputValue("#q")));
  ok("RF1: …and leaves the library alone", (await count(page)) === 50 && fs.readFileSync(path.join(LIB, "library.json"), "utf8") === before);
  await page.keyboard.press("Escape"); await blur(page);

  // ---------- Job 1 hoard: drop the Friday folder ----------
  await drop(page, [FRIDAY]); await noticeDone(page);
  const n1 = await notice(page); await shot(page, "03-friday-drop");
  ok("drop: 'Added 12 to the Inbox'", /Added 12 to the Inbox/.test(n1), one(n1).slice(0, 220));
  ok("drop: skips psd + empty with reasons", /fake\.psd/.test(n1) && /empty\.jpg/.test(n1));
  ok("drop: duplicate row with Show", (await page.locator("#import-notice [data-dup-show]").count()) === 1, one(await txt(page, "#import-notice .intake-dups")));
  ok("drop: note field offered, not required", (await page.locator("#import-notice [data-intake-note] input").count()) === 1);
  ok("badge = 12", (await txt(page, "#inbox-count")) === "12", await txt(page, "#inbox-count"));
  // RF1 in the note field, then an XSS-shaped note
  const noteIn = page.locator("#import-notice [data-intake-note] input");
  await noteIn.click(); await page.keyboard.type("abc"); await page.keyboard.press("Control+z"); await sleep(400);
  ok("RF1: Ctrl+Z in note field stays in the field", (await count(page)) === 62, `field ${JSON.stringify(await noteIn.inputValue())}, count ${await count(page)}`);
  await noteIn.fill(`moodboard friday <img src=x onerror="window.__xss=1">`); await page.keyboard.press("Enter");
  let w = await until(() => refs().filter((r) => (r.note || "").startsWith("moodboard friday")).length === 12, 3000);
  ok("note saved on all 12 in one go", !!w.v, `${w.ms} ms`);
  ok("XSS note rendered as text", await page.evaluate(() => window.__xss === undefined && !document.querySelector('img[src="x"]')));
  await blur(page); await page.keyboard.press("Control+z");
  w = await until(() => refs().filter((r) => (r.note || "").startsWith("moodboard")).length === 0, 3000);
  ok("one Ctrl+Z removes the batch note", !!w.v, `${w.ms} ms; refs still ${await count(page)}`);
  await page.keyboard.press("Control+Shift+z"); await until(() => refs().some((r) => (r.note || "").startsWith("moodboard")), 3000);
  // Dismiss path: Show opens the existing reference
  if (await page.locator("#import-notice [data-dup-show]").count()) {
    await page.locator("#import-notice [data-dup-show]").first().click(); await sleep(600);
    ok("Show opens the existing reference", (await page.evaluate(() => document.body.dataset.view)) === "reference" && !!(await focusId(page)), await txt(page, '[data-level="ref"] [data-v]'));
  }

  // ---------- Review Focus 5: paste without an image ----------
  const c5 = await count(page);
  await paste(page, [{ type: "text/plain", data: "https://www.example.com/cool-ref.jpg" }]); await sleep(700);
  const n5 = await notice(page);
  ok("RF5: text-only paste → exact copy, nothing added", /Paste the image itself — Horus doesn.t download from the web\./.test(n5) && (await count(page)) === c5, one(n5));
  await paste(page, [{ type: "text/uri-list", data: "https://www.example.com/a.png" }, { type: "text/html", data: '<img src="https://www.example.com/a.png">' }]); await sleep(700);
  ok("RF5: URL + HTML paste, no image → nothing added", (await count(page)) === c5, one(await notice(page)));

  // ---------- Merge: paste the bytes of a demo ref with a source URL it lacks ----------
  const existing = refs().find((r) => !r.sourceUrl && r.file);
  if (existing) {
    const bytes = [...fs.readFileSync(path.join(LIB, "images", existing.file.replace(/^images[\\/]/, "")))];
    await paste(page, [{ bytes, name: "pasted.jpg", type: "image/jpeg" }, { type: "text/html", data: '<img src="https://museum.example/hi-res.jpg">' }]);
    await noticeDone(page); await sleep(300);
    const mergeBtn = page.locator("#import-notice [data-dup-merge]");
    ok("Merge offered when paste brings a missing source URL", (await mergeBtn.count()) === 1, one(await notice(page)).slice(0, 200));
    if (await mergeBtn.count()) {
      await mergeBtn.click();
      w = await until(() => refs().find((r) => r.id === existing.id)?.sourceUrl === "https://museum.example/hi-res.jpg", 3000);
      ok("Merge fills only the empty sourceUrl, no new ref", !!w.v && (await count(page)) === c5, `${w.ms} ms`);
    }
  } else ok("Merge setup", false, "every demo ref already has a sourceUrl");

  // ---------- Job 2: Friday tagging in the Inbox, keyboard only ----------
  await page.click('[data-view-tab="inbox"]'); await sleep(600);
  await shot(page, "04-inbox");
  const inboxImgs = await page.locator("#inbox img").count();
  ok("Inbox shows 12 tiles", (await page.locator("#inbox .inbox-tile").count()) === 12, `${inboxImgs} imgs`);
  const times = [];
  const plan = [["1", "moody"], ["3", ""], ["1", "silhou"], ["2", ""], ["4", "crop"]];
  for (let i = 0; i < 12; i++) {
    const id = await dockRef(page);
    if (!id) { ok(`tag item ${i + 1}: picker docked`, false); break; }
    const [op, q] = plan[i % plan.length];
    const s = Date.now();
    await page.keyboard.press(op); if (q) await page.keyboard.type(q); await page.keyboard.press("Enter");
    const got = await until(() => page.evaluate((id) => !!document.querySelector(`.inbox-tile[data-id="${CSS.escape(id)}"] .inbox-tagged`), id), 5000);
    times.push(got.v ? Date.now() - s : -1);
    if (i === 0) ok("synonym 'moody' tagged Chiaroscuro", !!refs().find((r) => r.id === id)?.tags.some((t) => t.techniqueId === "chiaroscuro") || !!(await until(() => refs().find((r) => r.id === id)?.tags.some((t) => t.techniqueId === "chiaroscuro"), 2000)).v);
    if (i === 1) { await sleep(700); const t = refs().find((r) => r.id === id)?.tags ?? []; ok("operation-only Enter = partial tag", t.length === 1 && !t[0].techniqueId && t[0].operationId === "sequence", JSON.stringify(t)); }
    if (i === 11) {
      await sleep(300);
      ok("RF3: last item stays on screen after tagging", (await dockRef(page)) === id && (await page.locator("#inbox .inbox-tile").count()) >= 1);
      await page.keyboard.press("ArrowRight"); await sleep(300);
      ok("RF3: → on last item stays put", (await dockRef(page)) === id, String(await dockRef(page)));
      break;
    }
    await page.keyboard.press("ArrowRight"); await sleep(250);
    if ((await dockRef(page)) === id) { await page.keyboard.press("Tab"); await page.keyboard.press("ArrowRight"); await sleep(250); }
  }
  ok("12 Inbox items tagged by keyboard", times.length === 12 && times.every((t) => t >= 0), times.join(", ") + " ms");
  await page.click('[data-view-tab="reference"]'); await sleep(300); await page.click('[data-view-tab="inbox"]'); await sleep(500);
  await shot(page, "05-inbox-empty");
  ok("RF3: empty Inbox copy", /Inbox is empty\. Drop, paste or open a folder to add references\./.test(await txt(page, "#inbox")), one(await txt(page, "#inbox")).slice(0, 120));
  ok("badge 0", (await txt(page, "#inbox-count")) === "0", await txt(page, "#inbox-count"));

  // ---------- Review Focus 4: custom technique names ----------
  const tax = () => readJson(path.join(LIB, "taxonomy.json"));
  const nTech = tax().techniques.length;
  const r4 = refs().find((r) => r.tags.length && !r.note);
  await openRef(page, r4); await page.keyboard.press("t");
  await page.waitForSelector("aside.margin .picker", { timeout: 5000 });
  await page.keyboard.press("1"); await page.keyboard.type("Halo glow");
  for (let i = 0; i < 40 && !/pk-new/.test(await page.evaluate(() => document.querySelector(".picker .pk-card.is-hi")?.className ?? "")); i++) await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter"); await page.waitForSelector(".pk-form", { timeout: 3000 });
  await page.keyboard.press("Tab"); await page.keyboard.type("A bright ring of light around the subject."); await page.keyboard.press("Enter");
  w = await until(() => tax().techniques.find((t) => t.name === "Halo glow"), 3000);
  ok("custom 'Halo glow' saved custom:true", w.v?.custom === true, `${w.ms} ms`);
  await sleep(500); await blur(page);
  await page.keyboard.press("t"); await page.waitForSelector("aside.margin .picker", { timeout: 5000 });
  await page.keyboard.press("1"); await page.keyboard.type("  halo   GLOW ");
  const newCard = await page.locator(".picker .pk-new").count();
  let rf4 = "";
  if (newCard) {
    for (let i = 0; i < 40 && !/pk-new/.test(await page.evaluate(() => document.querySelector(".picker .pk-card.is-hi")?.className ?? "")); i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter"); await page.waitForSelector(".pk-form", { timeout: 3000 }).catch(() => {});
    await page.keyboard.press("Tab"); await page.keyboard.type("dup"); await page.keyboard.press("Enter"); await sleep(700);
    rf4 = await txt(page, ".picker .pk-msg");
  }
  await shot(page, "06-rf4-name-taken");
  ok("RF4: '  halo   GLOW ' makes no duplicate", tax().techniques.filter((t) => /halo\s*glow/i.test(t.name)).length === 1 && tax().techniques.length === nTech + 1, `${newCard ? "new card shown; msg: " + one(rf4) : "no + New card (existing offered)"}`);
  if (rf4) ok("RF4: 'Already exists: Halo glow — use it' copy", /Already exists: Halo glow — use it/.test(one(rf4)));
  await page.keyboard.press("Escape"); await page.keyboard.press("Escape"); await sleep(300);

  // ---------- chips on a demo ref with suggested tags: ✓ confirm, × remove, undo ----------
  const sug = refs().find((r) => r.tags.some((t) => t.suggested) && r.tags.length >= 2);
  await openRef(page, sug); await page.keyboard.press("t"); await page.waitForSelector("aside.margin .picker", { timeout: 5000 });
  await shot(page, "07-chips");
  const sTag = sug.tags.find((t) => t.suggested);
  const conf = page.locator(`.picker .pk-confirm`).first();
  if (await conf.count()) { await conf.click(); w = await until(() => refs().find((r) => r.id === sug.id)?.tags.find((t) => t.id === sTag.id)?.suggested === false, 3000); ok("chip ✓ confirms a suggested tag", !!w.v, `${w.ms} ms`); }
  else ok("chip ✓ present on suggested tag", false, one(await txt(page, ".picker .pk-chips")));
  const nTags = refs().find((r) => r.id === sug.id).tags.length;
  await page.locator(".picker .pk-remove").first().click();
  w = await until(() => refs().find((r) => r.id === sug.id)?.tags.length === nTags - 1, 3000);
  ok("chip × removes a tag", !!w.v);
  await page.keyboard.press("Escape"); await sleep(200); await page.keyboard.press("Escape"); await blur(page);
  await page.keyboard.press("Control+z");
  w = await until(() => refs().find((r) => r.id === sug.id)?.tags.length === nTags, 3000);
  ok("Ctrl+Z restores the removed tag", !!w.v);

  // ---------- Study: lightbox v doesn't touch the Reference checkbox ----------
  await page.keyboard.press("l"); await page.waitForSelector(".lightbox", { timeout: 5000 }).catch(() => {});
  if (await page.locator(".lightbox").count()) {
    await sleep(500); await page.keyboard.press("v"); await sleep(200); await shot(page, "08-lightbox-value");
    ok("lightbox v leaves Reference value checkbox", !(await page.locator("#value").isChecked()));
    await page.keyboard.press("Escape"); await sleep(300);
    ok("Esc closes lightbox", (await page.locator(".lightbox").count()) === 0);
  } else ok("L opens lightbox", false);

  // ---------- Mara quit-trigger: background save fails, then close ----------
  const libJson = path.join(LIB, "library.json");
  execSync(`attrib +R "${libJson}"`);
  const rS = refs().find((r) => !r.tags.some((t) => t.techniqueId === "rim-light")) ?? refs()[0];
  await openRef(page, rS); await page.keyboard.press("t"); await page.waitForSelector("aside.margin .picker", { timeout: 5000 });
  await page.keyboard.press("1"); await page.keyboard.type("rim light"); await page.keyboard.press("Enter");
  w = await until(async () => /Couldn.t save your last changes/.test(await notice(page)), 6000);
  await shot(page, "09-save-failed-notice");
  ok("background save failure is told to the artist", !!w.v, one(await notice(page)).slice(0, 200));
  askClose(); await sleep(1500);
  const dlg = await page.locator("[data-retry]").count();
  await shot(page, "10-save-dialog");
  ok("close with failing save: window stays, dialog asks", proc.exitCode === null && dlg === 1, one(await txt(page, ".fr-sheet")).slice(0, 200));
  execSync(`attrib -R "${libJson}"`);
  if (dlg) await page.click("[data-retry]");
  await exited(15000);
  ok("Try again saves and closes", proc.exitCode !== null && refs().find((r) => r.id === rS.id)?.tags.some((t) => t.techniqueId === "rim-light"), `exit ${proc.exitCode}`);
  try { await b.close(); } catch {}

  // ---------- relaunch; Library menu: New in a non-empty folder, Open via parent ----------
  ({ b, page } = await launch("relaunch"));
  await page.waitForFunction(() => /references/.test(document.querySelector("#lib-count")?.textContent || ""), null, { timeout: 30000 }); await sleep(800);
  ok("relaunch reopens library, nothing lost", (await count(page)) === 62, await txt(page, "#lib-count"));
  await page.click("#library-menu"); dialogQueue.push(MESSY); await page.click('[data-lib="new"]');
  await page.waitForSelector(".lib-new:not([hidden])", { timeout: 3000 });
  ok("New library: demo box unticked by default", !(await page.locator(".lib-new input[type=checkbox]").first().isChecked()));
  await page.click('.lib-new button[type="submit"]');
  w = await until(async () => (await count(page)) === 0, 15000);
  const sub = path.join(MESSY, "Horus Library");
  ok("P1 carry: New in non-empty folder makes 'Horus Library' subfolder", !!w.v && fs.existsSync(path.join(sub, "library.json")) && fs.readdirSync(MESSY).length >= 9, `${await txt(page, "#data-source")}`);
  await blur(page); await page.keyboard.press("Control+z"); await sleep(600);
  ok("after switch Ctrl+Z does nothing", (await count(page)) === 0);
  await page.click("#library-menu"); dialogQueue.push(LIB); await page.click('[data-lib="open"]');
  await until(async () => (await count(page)) === 62, 10000);
  await page.click("#library-menu"); dialogQueue.push(MESSY); await page.click('[data-lib="open"]');
  w = await until(async () => (await count(page)) === 0, 10000);
  ok("P1 carry: Open on the parent folder opens its Horus Library", !!w.v, `${one(await notice(page)).slice(0, 160)} | ${await txt(page, "#data-source")}`);

  // ---------- scale: 2,000 into the Inbox ----------
  let t0 = Date.now();
  await drop(page, [BIG]); await noticeDone(page, 900000);
  const importMs = Date.now() - t0;
  await page.click('[data-view-tab="inbox"]'); await sleep(800);
  const imgs = await page.locator("#inbox img").count();
  ok("2,000 Inbox: windowed DOM", (await txt(page, "#inbox-count")) === "2000" && imgs <= 200, `badge ${await txt(page, "#inbox-count")}, ${imgs} imgs, import ${importMs} ms`);
  await page.evaluate(() => { const g = document.querySelector("#inbox .inbox-body, #inbox .inbox-grid"); g && (g.scrollTop = g.scrollHeight); }); await sleep(500);
  await shot(page, "11-inbox-2000-bottom");
  ok("scrolled to the end: tiles still bounded", (await page.locator("#inbox img").count()) <= 200, `${await page.locator("#inbox img").count()} imgs`);
  const big = [];
  for (let i = 0; i < 5; i++) {
    const id = await dockRef(page); if (!id) break;
    const s = Date.now();
    await page.keyboard.press("1"); await page.keyboard.type("chiaro"); await page.keyboard.press("Enter");
    const g = await until(() => page.evaluate((id) => !!document.querySelector(`.inbox-tile[data-id="${CSS.escape(id)}"] .inbox-tagged`), id), 5000);
    big.push(g.v ? Date.now() - s : -1);
    await page.keyboard.press("ArrowRight"); await sleep(150);
  }
  ok("tagging stays fast at 2,000 (each < 1 s app time)", big.length === 5 && big.every((t) => t >= 0 && t < 1000), big.join(", ") + " ms");
  await page.evaluate(() => document.documentElement.dataset.theme = "dark"); await sleep(200); await shot(page, "12-inbox-dark");
  await page.evaluate(() => document.documentElement.dataset.theme = "light");
  await closeApp(b);

  // ---------- M5 re-test: warning once ----------
  fs.writeFileSync(path.join(sub, "library.json"), "{");
  ({ b, page } = await launch("corrupt")); await sleep(4000);
  await shot(page, "13-corrupt-warning");
  const inNotice = /backup/.test(await notice(page)), inStatus = /backup/.test(await txt(page, "#data-source"));
  ok("M5 re-test: recovery warning shown once", inNotice !== inStatus, `notice ${inNotice}, status bar ${inStatus}`);
  await closeApp(b);

  ok("zero external network requests", external.length === 0, external.slice(0, 5).join(", "));
  fs.writeFileSync(path.join(W, "results2.json"), JSON.stringify(R, null, 1));
  done(0);
})().catch((e) => {
  console.error("ABORT", e);
  fs.writeFileSync(path.join(W, "results2.json"), JSON.stringify([...R, { name: "ABORT", pass: false, detail: e.stack }], null, 1));
  try { proc?.kill(); } catch {}
  done(1);
});
function done(code) {
  try { execSync(`attrib -R "${path.join(LIB, "library.json")}"`); } catch {}
  fs.rmSync(CONFIG, { recursive: true, force: true });
  if (fs.existsSync(CONFIG_BAK)) fs.cpSync(CONFIG_BAK, CONFIG, { recursive: true });
  process.exit(code);
}
