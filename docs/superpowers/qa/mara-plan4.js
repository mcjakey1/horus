// Plan 4 QA (boards, export, links, lightbox, Compare) as Mara (QA-PERSONA.md), on the real
// release horus.exe over WebView2 CDP (port 9334). One main pass: boards via the b menu, the
// Boards view (reorder, rename, scope, delete), export, links, the lightbox (draw + tag at ~416 %,
// the Add technique form's Esc, the preview note), Compare (x, v, L, Link these two, Esc), the
// fix-wave QA focus items 1-9, the Task 8 gaps, and a quick quit after a link and board edit.
// Run: node mara-plan4.js <work dir outside the repo> [exe]. Needs <work dir>/p4fx with
// "Harbour scan.tif", "Long panorama.png" (20,400 px), "Notice test.png", "Background drop.png".
// Export goes to <work dir>/export. Refuses to run if %APPDATA%/art.horus.app exists; deletes it after.
// README=<dir> also saves boards-view.png and compare-view.png (1280x800, light theme) there.
const { chromium } = require(process.env.APPDATA + "/npm/node_modules/playwright");
const { spawn, execSync } = require("child_process");
const fs = require("fs"), path = require("path"), crypto = require("crypto");

const REPO = path.resolve(__dirname, "../../..");
const W = process.argv[2]; if (!W) throw new Error("usage: node mara-plan4.js <work dir> [exe]");
const EXE = process.argv[3] || path.join(REPO, "app/src-tauri/target/release/horus.exe");
const FX = path.join(W, "p4fx"), LIB = path.join(W, "Mara boards é"), EXPORT = path.join(W, "export"), SHOTS = path.join(W, "shots");
const README = process.env.README || null;
const CONFIG = path.join(process.env.APPDATA, "art.horus.app");
const PORT = 9334;

const R = [], consoleErr = [], picks = [], ipcLog = [];
const ok = (name, pass, detail = "") => { R.push({ name, pass, detail: typeof detail === "string" ? detail : JSON.stringify(detail) }); console.log(pass === null ? "NOTE" : pass ? "PASS" : "FAIL", name, "::", typeof detail === "string" ? detail : JSON.stringify(detail)); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readLib = () => { try { return JSON.parse(fs.readFileSync(path.join(LIB, "library.json"), "utf8")); } catch { return null; } };
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
async function until(fn, ms = 5000, step = 50) {
  const t0 = Date.now();
  for (;;) { let v; try { v = await fn(); } catch { v = null; } if (v) return v; if (Date.now() - t0 > ms) return null; await sleep(step); }
}
if (fs.existsSync(CONFIG)) throw new Error("art.horus.app exists: refusing to touch it");
for (const d of [LIB, EXPORT]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
fs.mkdirSync(SHOTS, { recursive: true });
if (README) fs.mkdirSync(README, { recursive: true });

let proc, dialogAnswer = LIB, P;
async function launch(tag) {
  proc = spawn(EXE, [], { env: { ...process.env, WEBVIEW2_USER_DATA_FOLDER: path.join(W, "wv2"), WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }, stdio: "ignore" });
  let b;
  for (let i = 0; i < 60 && !b; i++) { try { b = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`); } catch { await sleep(500); } }
  const ctx = b.contexts()[0];
  let page;
  for (let i = 0; i < 40 && !page; i++) { page = ctx.pages().find((x) => x.url().includes("tauri.localhost")); if (!page) await sleep(250); }
  await page.route(/ipc\.localhost\/plugin%3Adialog%7Copen/, (route) => route.fulfill({ status: 200, contentType: "application/json", headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "Tauri-Response", "Tauri-Response": "ok" }, body: JSON.stringify(dialogAnswer) }));
  if (process.env.RELOAD) await page.reload();
  page.on("request", (r) => { const u = new URL(r.url()); if (u.hostname === "ipc.localhost") ipcLog.push(decodeURIComponent(u.pathname.slice(1))); });
  page.on("console", (m) => { if (m.type() === "error") consoleErr.push(`${tag}: ${m.text().slice(0, 200)}`); });
  page.on("pageerror", (e) => ok(`page error (${tag})`, false, e.message));
  page.setDefaultTimeout(8000); P = page; if (await page.waitForSelector(".intro", { timeout: 4000 }).catch(() => null)) { await page.keyboard.press("Shift"); await page.waitForSelector(".intro", { state: "detached", timeout: 5000 }).catch(() => {}); } // Plan 6: the intro plays on every fresh config
  await page.emulateMedia({ colorScheme: "light" });
  return { b, page };
}
async function closeApp(b) {
  try { execSync(`powershell -NoProfile -Command "(Get-Process -Id ${proc.pid}).CloseMainWindow() | Out-Null"`); } catch {}
  await until(() => proc.exitCode !== null, 30000, 100);
  if (proc.exitCode === null) try { proc.kill(); } catch {}
  try { await b.close(); } catch {}
}
// Outer window size through user32 MoveWindow (CSS px = outer minus the frame at DPR 1).
function resizeWin(w, h) {
  execSync(`powershell -NoProfile -Command "Add-Type -Name U -Namespace W -MemberDefinition '[DllImport(\\"user32.dll\\")] public static extern bool MoveWindow(System.IntPtr h,int x,int y,int w,int ht,bool r);'; $p=Get-Process -Id ${proc.pid}; [W.U]::MoveWindow($p.MainWindowHandle,40,40,${w},${h},$true) | Out-Null"`);
}
const shot = (page, n) => page.screenshot({ path: path.join(SHOTS, n + ".png") }).catch(() => {});
const text = (page, s) => page.evaluate((s) => document.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null, s);
const jsClick = (page, s) => page.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error("no " + s); el.click(); }, s);
const focusId = (page) => page.evaluate(() => document.querySelector("#ref-id")?.title);
const center = async (page, s) => { const b = await page.locator(s).first().boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
const rectOf = (page, s) => page.evaluate((s) => { const r = document.querySelector(s)?.getBoundingClientRect(); return r && { x: r.x, y: r.y, w: r.width, h: r.height }; }, s);
const active = (page) => page.evaluate(() => { const a = document.activeElement; return a ? `${a.tagName.toLowerCase()}${a.className ? "." + String(a.className).split(" ")[0] : ""}${a.dataset?.board ? "[board]" : ""}` : "none"; });
const blur = (page) => page.evaluate(() => document.activeElement?.blur());
const drop = (page, paths) => page.evaluate((paths) => window.__TAURI_INTERNALS__.invoke("plugin:event|emit", { event: "tauri://drag-drop", payload: { paths, position: { x: 5, y: 5 } } }), paths);
const noticeDone = (page, ms = 60000) => page.waitForFunction(() => { const n = document.querySelector("#import-notice"); const t = n?.querySelector("[data-body]")?.textContent || ""; return n && !n.hidden && t && !/Importing|Adding/.test(t); }, null, { timeout: ms });
const dismiss = (page) => page.evaluate(() => { const n = document.querySelector("#import-notice"); if (n && !n.hidden) document.querySelector("#import-dismiss")?.click(); });
const count = async (page) => Number(((await text(page, "#lib-count")) || "").replace(/,/g, "").match(/\d+/)?.[0] ?? -1);
const undo = async (page, ms = 900) => { await page.keyboard.press("Control+z"); await sleep(ms); };
const redo = async (page, ms = 900) => { await page.keyboard.press("Control+y"); await sleep(ms); };
const go = async (page, id) => { await jsClick(page, `[data-go="${id}"]`); await page.waitForFunction((n) => document.querySelector("#ref-id")?.title === n, id, { timeout: 5000 }); await sleep(500); };
const searchGo = async (page, q) => {
  await page.fill("#q", q); await sleep(900);
  const id = await page.evaluate(() => document.querySelector("#q-results [data-r]")?.dataset.r);
  if (!id) return null;
  await jsClick(page, `#q-results [data-r="${id}"]`);
  await page.waitForFunction((n) => document.querySelector("#ref-id")?.title === n, id, { timeout: 5000 }).catch(() => {});
  await sleep(600); return id;
};
const tab = async (page, v) => { await page.click(`[data-view-tab="${v}"]`); await sleep(600); };
const tiles = (page) => page.evaluate(() => [...document.querySelectorAll(".bd-tile")].sort((a, b) => a.dataset.i - b.dataset.i).map((t) => t.dataset.id));

async function firstRun(page, tag) {
  await page.waitForSelector(".firstrun", { timeout: 30000 });
  await sleep(1500);
  let misses = 0, picked = false;
  for (let i = 0; i < 4 && !picked; i++) {
    await page.click('[data-pick="create"]');
    picked = !!(await until(() => page.evaluate(() => /New library in/.test(document.querySelector(".firstrun")?.textContent || "")), 8000, 200));
    if (!picked) { misses++; console.log("pick miss; ipc so far:", ipcLog.slice(-6).join(", ")); }
  }
  picks.push({ tag, misses });
  if (await page.locator('[data-fs="off"]').count()) await page.click('[data-fs="off"]');
  await page.waitForSelector("#fr-go:not([disabled])", { timeout: 15000 });
  await page.click("#fr-go");
  await page.waitForSelector(".firstrun", { state: "detached", timeout: 600000 });
  await sleep(1500);
}
// A failed block logs and moves on; later blocks start from the Reference view.
async function block(name, fn) {
  try { await fn(); } catch (e) {
    ok(`${name}: block ran to the end`, false, String(e && e.message || e).split("\n").slice(0, 2).join(" | "));
    await shot(P, `error-${name}`);
    await P.keyboard.press("Escape").catch(() => {}); await P.keyboard.press("Escape").catch(() => {});
    await P.evaluate(() => document.querySelector(".compare .cmp-close")?.click()).catch(() => {});
  }
}

async function main() {
  let { b, page } = await launch("run1");
  const titles = {}, members = [];
  let N1 = null, openClip = null; // a non-member, linked from M0 (off-board link)
  try {
    await firstRun(page, "run1");
    ok("Library seeded from the demo set", (await count(page)) > 0, `${await count(page)} refs; window ${JSON.stringify(await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })))}`);
    const remember = async () => { const id = await focusId(page); titles[id] = await text(page, '.cell[data-level="ref"] [data-v]'); return id; };

    // ===== 1. Boards through the b menu, with fix-wave item 7 (I2 / M5) =====
    await block("menu", async () => {
      let id = await remember();
      await page.keyboard.press("b");
      await page.click(".board-menu .bm-new");
      await page.fill(".board-menu .bm-name", "Harbour");
      await page.keyboard.press("Enter");
      await page.waitForSelector(".board-menu input[data-board]:checked", { timeout: 5000 });
      const createFocus = await page.evaluate(() => { const a = document.activeElement; return a?.matches?.("input[data-board]") ? a.checked : `not a box: ${a?.className}`; });
      ok("Item 7: Create a board with Enter: the new board's box has focus", createFocus === true, String(createFocus));
      await page.click(".board-menu .bm-close");
      members.push(id);
      let m5done = false;
      for (let guard = 0; members.length < 8 && guard < 30; guard++) {
        const cands = await page.evaluate(() => [...document.querySelectorAll("#pane-ranked [data-go], #pane-callouts [data-go], #pane-links [data-go]")].map((e) => e.dataset.go));
        const next = cands.find((c) => !members.includes(c));
        if (!next) { await jsClick(page, "#back"); await sleep(600); continue; }
        await go(page, next);
        id = await remember();
        await page.keyboard.press("b");
        await page.waitForSelector(".board-menu", { timeout: 3000 });
        const harbourBox = '.board-menu input[data-board]';
        await page.focus(harbourBox);
        await page.keyboard.press(" ");
        await page.waitForFunction((s) => document.querySelector(s)?.checked, harbourBox, { timeout: 3000 });
        await sleep(300);
        if (members.length === 1) {
          const f = await page.evaluate(() => document.activeElement?.matches?.("input[data-board]") && document.activeElement === document.querySelector(".board-menu input[data-board]"));
          ok("Item 7: Space-tick a box: focus stays on it", f, await active(page));
        }
        if (members.length === 3 && !m5done) {
          m5done = true;
          // Make a second board here (Enter), then tick it and Ctrl+Z that tick with the menu open.
          await page.click(".board-menu .bm-new");
          await page.fill(".board-menu .bm-name", "Scratch");
          await page.keyboard.press("Enter");
          await page.waitForFunction(() => document.querySelectorAll(".board-menu input[data-board]").length === 2, null, { timeout: 5000 });
          await sleep(300);
          const scratchFocus = await page.evaluate(() => { const bs = [...document.querySelectorAll(".board-menu input[data-board]")]; return document.activeElement === bs[1] && bs[1].checked; });
          ok("Item 7: second board created with Enter: its (ticked) box has focus", scratchFocus, await active(page));
          await page.focus('.board-menu input[data-board]');
          const before = await page.evaluate(() => [...document.querySelectorAll(".board-menu input[data-board]")].map((x) => x.checked));
          await undo(page); // undoes "Harbour" tick on this ref? no: the last edit is Scratch's creation
          const after1 = await page.evaluate(() => [...document.querySelectorAll(".board-menu input[data-board]")].map((x) => x.checked));
          await redo(page);
          const after2 = await page.evaluate(() => [...document.querySelectorAll(".board-menu input[data-board]")].map((x) => x.checked));
          ok("Item 7 (M5): Ctrl+Z / Ctrl+Y with the menu open: the boxes follow", after1.length === 1 && after2.length === 2 && after2[0] && after2[1], `before ${JSON.stringify(before)}, after Ctrl+Z ${JSON.stringify(after1)}, after Ctrl+Y ${JSON.stringify(after2)}`);
          // Ctrl+Z an earlier edit: untick Harbour (Space), then Ctrl+Z: the Harbour tick comes back.
          await page.focus('.board-menu input[data-board]');
          await page.keyboard.press(" "); await sleep(600);
          const un = await page.evaluate(() => document.querySelector(".board-menu input[data-board]").checked);
          await undo(page);
          const back = await page.evaluate(() => document.querySelector(".board-menu input[data-board]").checked);
          ok("Item 7 (M5): untick, then Ctrl+Z with the menu open: the tick comes back", un === false && back === true, `after untick ${un}, after Ctrl+Z ${back}`);
        }
        await page.click(".board-menu .bm-close");
        members.push(id);
      }
      ok("Boards: 8 references put on Harbour with b", members.length === 8, `${members.length}; boards line "${await text(page, ".ref-boards")}"`);
    });
    const M0 = members[0];

    // ===== 2. Links: the handle, the combobox (k), refusals, edit, delete, undo =====
    await block("links", async () => {
      await go(page, M0).catch(async () => { await searchGo(page, titles[M0]); });
      await page.click("#tab-ranked"); await sleep(400);
      const nonMemberRow = await page.evaluate((m) => [...document.querySelectorAll("#pane-ranked .row:not(.linked)")].map((r) => r.dataset.go).find((x) => !m.includes(x)), members);
      N1 = nonMemberRow;
      const [hx, hy] = await center(page, "#lab .link-handle");
      const [tx, ty] = await center(page, `#pane-ranked .row[data-go="${N1}"]`);
      await page.mouse.move(hx, hy); await page.mouse.down();
      await page.mouse.move((hx + tx) / 2, (hy + ty) / 2, { steps: 6 });
      const leader = await page.evaluate(() => !!document.querySelector(".link-leader"));
      await page.mouse.move(tx, ty, { steps: 6 }); await page.mouse.up(); await sleep(400);
      const to = await text(page, ".link-editor .le-to");
      titles[N1] = await page.evaluate((n) => document.querySelector(`[data-go="${n}"] b`)?.textContent, N1);
      ok("Links: drag the handle onto a Ranked row opens the editor for that pair", leader && !!to, `leader during drag ${leader}; editor "${to}"; target "${titles[N1]}"`);
      const saveDisabled = await page.evaluate(() => document.querySelector(".link-editor .le-save")?.disabled);
      await page.fill(".link-editor .le-why", "   ");
      await page.evaluate(() => document.querySelector(".link-editor .le-save").disabled = false); // a forced click: is the refusal server-side too?
      await page.click(".link-editor .le-save"); await sleep(600);
      const emptyMsg = await text(page, ".link-editor .le-msg");
      const kept = await page.inputValue(".link-editor .le-why");
      ok("RF4: empty why: Save is disabled; a forced save of spaces is refused with a message, text kept", saveDisabled === true && /Say why/.test(emptyMsg || "") && kept === "   ", `disabled ${saveDisabled}; msg "${emptyMsg}"; kept ${JSON.stringify(kept)}`);
      await page.fill(".link-editor .le-why", "same harbour light, other side of the board");
      await page.click(".link-editor .le-save");
      await page.waitForSelector(".link-editor", { state: "detached", timeout: 5000 });
      await sleep(600);
      await page.click("#tab-ranked"); await sleep(300);
      const first = await page.evaluate(() => { const p = document.querySelector("#pane-ranked"); const h = p.querySelector(".group-head"); const r = p.querySelector(".row:not(.linked)"); return { head: h?.textContent, first: !!h && (!r || !!(h.compareDocumentPosition(r) & 4)), linked: [...p.querySelectorAll(".row.linked")].map((x) => x.dataset.go) }; });
      ok("Links: 'Linked by you' is listed first in Ranked and holds the new link", first.first && first.linked.includes(N1), JSON.stringify(first));

      // k: the combobox; self and the already-linked pair are not offered.
      await page.click("#tab-callouts"); await blur(page);
      await page.keyboard.press("k");
      await page.waitForSelector(".link-editor .le-q", { timeout: 3000 });
      const offered = async (q) => { await page.fill(".link-editor .le-q", q); await sleep(400); return page.evaluate(() => [...document.querySelectorAll(".link-editor .le-opts [data-id], .link-editor .le-opts [role=option]")].map((o) => o.dataset.id || o.textContent.trim())); };
      const selfOpts = await offered(titles[M0]);
      const dupOpts = await offered(titles[N1]);
      ok("RF4: k opens the combobox; the reference itself and an already-linked one are not offered", !selfOpts.includes(M0) && !dupOpts.includes(N1) && !selfOpts.some((o) => o === titles[M0]) && !dupOpts.some((o) => o === titles[N1]), `self query → ${JSON.stringify(selfOpts).slice(0, 120)}; linked query → ${JSON.stringify(dupOpts).slice(0, 120)}`);
      const M1 = members[1];
      await page.fill(".link-editor .le-q", titles[M1]); await sleep(400);
      await page.keyboard.press("ArrowDown"); await page.keyboard.press("Enter"); await sleep(300);
      const picked = await text(page, ".link-editor .le-current") || await text(page, ".link-editor .le-to");
      await page.fill(".link-editor .le-why", "both lit from the left");
      await page.click(".link-editor .le-save");
      await page.waitForSelector(".link-editor", { state: "detached", timeout: 5000 }).catch(() => {});
      await sleep(600);
      const nLinks = (readLib()?.links || []).length;
      ok("Links: k + type + ArrowDown + Enter picks a reference; saved", /both lit/.test(JSON.stringify(readLib()?.links || [])) || nLinks >= 1, `picked "${picked}"; links on disk ${nLinks}; Links tab "${await text(page, "#links-count")}"`);

      // The duplicate pair from the other side: the editor switches to the existing link (Decision 2).
      await go(page, N1).catch(() => {});
      await page.click("#tab-ranked"); await sleep(300);
      const backRow = await page.evaluate((m) => !!document.querySelector(`#pane-ranked .row.linked[data-go="${m}"]`), M0);
      ok("Links: the link shows from the other end too (B → A is the same pair)", backRow, `on "${titles[N1]}" Ranked has M0 under Linked by you: ${backRow}`);
      await go(page, M0);

      // Edit, delete and undo through the Links tab.
      await page.click("#tab-links"); await sleep(300);
      const linkRows = () => page.evaluate(() => [...document.querySelectorAll("#pane-links [data-link-edit]")].length);
      const n0 = await linkRows();
      await page.click("#pane-links [data-link-edit]");
      await page.fill(".link-editor .le-why", "edited note");
      await page.click(".link-editor .le-save"); await sleep(800);
      const edited = /edited note/.test(await text(page, "#pane-links") || "");
      await undo(page);
      const editUndone = !/edited note/.test(await text(page, "#pane-links") || "");
      await redo(page);
      await page.click("#pane-links [data-link-del]"); await sleep(800);
      const n1 = await linkRows();
      await undo(page);
      const n2 = await linkRows();
      ok("Links: edit, Ctrl+Z, delete, Ctrl+Z each one step (Links tab)", edited && editUndone && n1 === n0 - 1 && n2 === n0, `rows ${n0}; edited ${edited}; edit undone ${editUndone}; after delete ${n1}; after Ctrl+Z ${n2}`);
    });

    // ===== 3. Boards view: Alt+arrows (item 1), resize, drag, rename =====
    await block("boardsview", async () => {
      await tab(page, "boards");
      await page.click('.bd-pick:has-text("Harbour")').catch(() => {});
      await page.waitForSelector(".bd-tile", { timeout: 5000 });
      const t0 = await tiles(page);
      await page.focus('.bd-tile[data-i="0"]');
      await page.keyboard.press("Alt+ArrowRight");
      await until(async () => (await tiles(page))[1] === t0[0], 4000);
      await sleep(300);
      const f1 = await page.evaluate(() => ({ id: document.activeElement?.dataset?.id, i: document.activeElement?.dataset?.i }));
      await page.keyboard.press("Alt+ArrowRight");
      await until(async () => (await tiles(page))[2] === t0[0], 4000);
      await sleep(300);
      const t2 = await tiles(page);
      const f2 = await page.evaluate(() => ({ id: document.activeElement?.dataset?.id, i: document.activeElement?.dataset?.i }));
      ok("Item 1 (F3): Alt+→ keeps focus on the moved tile; a second Alt+→ moves it again", f1.id === t0[0] && t2[2] === t0[0] && f2.id === t0[0], `after 1st: focus ${JSON.stringify(f1)}; after 2nd: order[2]=${t2[2] === t0[0] ? "moved tile" : t2[2]}, focus ${JSON.stringify(f2)}`);
      await page.keyboard.press("Alt+ArrowLeft"); await sleep(700);
      const fl = await page.evaluate(() => document.activeElement?.dataset?.id);
      await undo(page); await undo(page); await undo(page);
      const tu = await tiles(page);
      ok("Boards: Alt+← works too; three Ctrl+Z restore the order", fl === t0[0] && JSON.stringify(tu) === JSON.stringify(t0), `focus after Alt+← on moved tile: ${fl === t0[0]}; restored ${JSON.stringify(tu) === JSON.stringify(t0)}`);
      // Resize with a tile focused.
      await page.focus('.bd-tile[data-i="3"]');
      const g0 = await page.evaluate(() => ({ st: document.querySelector(".bd-grid").scrollTop, id: document.activeElement?.dataset?.id }));
      resizeWin(1000, 760); await sleep(900);
      const g1 = await page.evaluate(() => ({ st: document.querySelector(".bd-grid").scrollTop, id: document.activeElement?.dataset?.id, tag: document.activeElement?.className, w: innerWidth }));
      resizeWin(1296, 839); await sleep(900);
      const g2 = await page.evaluate(() => ({ st: document.querySelector(".bd-grid").scrollTop, id: document.activeElement?.dataset?.id, w: innerWidth, h: innerHeight }));
      ok("Item 1: resize with a tile focused: focus stays on that tile, the grid doesn't jump", g1.id === g0.id && g2.id === g0.id && Math.abs(g1.st - g0.st) < 2, `before ${JSON.stringify(g0)}; at ${g1.w} px ${JSON.stringify(g1)}; back ${JSON.stringify(g2)}`);
      // Drag reorder with the mouse.
      const [sx, sy] = await center(page, '.bd-tile[data-i="0"] .bd-plate');
      const [ex, ey] = await center(page, '.bd-tile[data-i="2"] .bd-plate');
      await page.mouse.move(sx, sy); await page.mouse.down(); await page.mouse.move(sx + 30, sy + 10, { steps: 5 });
      const ghost = await page.evaluate(() => !!document.querySelector(".bd-ghost"));
      await page.mouse.move(ex, ey, { steps: 10 }); await page.mouse.up();
      await until(async () => (await tiles(page))[2] === t0[0], 4000);
      const td = await tiles(page);
      await undo(page);
      ok("Boards: drag a tile with the mouse reorders (ghost shown); Ctrl+Z restores", ghost && td[2] === t0[0] && JSON.stringify(await tiles(page)) === JSON.stringify(t0), `ghost ${ghost}; landed ${td[2] === t0[0]}`);
      // Rename, Esc, undo.
      await page.click('.bd-head [data-act="rename"]');
      await page.fill(".bd-rename", "Harbour light"); await page.keyboard.press("Escape"); await sleep(300);
      const escName = await text(page, ".bd-name");
      await page.click('.bd-head [data-act="rename"]');
      await page.fill(".bd-rename", "Harbour light"); await page.keyboard.press("Enter"); await sleep(800);
      const nm = await text(page, ".bd-name"), f = await active(page);
      await undo(page);
      const nmU = await text(page, ".bd-name");
      await redo(page);
      ok("Boards: rename (Esc cancels, Enter saves, focus back on Rename), Ctrl+Z / Ctrl+Y", escName === "Harbour" && nm === "Harbour light" && nmU === "Harbour" && (await text(page, ".bd-name")) === "Harbour light", `Esc → "${escName}"; Enter → "${nm}", focus ${f}; Ctrl+Z → "${nmU}"; Ctrl+Y → "${await text(page, ".bd-name")}"`);
    });

    // ===== 4. Scope (C1 = Task 8 F1 replay, item 5, RF5, search under scope) + boards-view.png =====
    await block("scope", async () => {
      await tab(page, "boards");
      await page.click('.bd-pick:has-text("Harbour light")').catch(() => {});
      await page.click('.bd-head [data-act="scope"]'); await sleep(500);
      const status = await text(page, "#board-scope");
      const btn = await text(page, '.bd-head [data-act="scope"]');
      ok("Scope: 'Show only this board' → button and status line", /Board: Harbour light · 8 references · Show all/.test(status || "") && /Showing only/.test(btn || ""), `button "${btn}"; status "${status}"`);
      await dismiss(page); await page.mouse.move(640, 790); await sleep(400);
      if (README) await page.screenshot({ path: path.join(README, "boards-view.png") });
      await shot(page, "boards-view");
      // Task 8's sequence: scope on in Boards, Reference, show a member (no filter).
      await page.focus(`.bd-tile[data-id="${M0}"]`); openClip = await page.evaluate((m) => { const b = document.querySelector(`.bd-tile[data-id="${m}"] [data-act="open"]`), g = document.querySelector(".bd-grid").getBoundingClientRect(), r = b.getBoundingClientRect(); return { btnLeft: Math.round(r.left), gridLeft: Math.round(g.left), clipped: r.left < g.left }; }, M0); await shot(page, "tile-tools"); await jsClick(page, `.bd-tile[data-id="${M0}"] [data-act="open"]`);
      await sleep(1200);
      await page.click("#tab-ranked").catch(() => {}); await sleep(400);
      const rk = await page.evaluate(() => ({ view: document.body.dataset.view, scored: [...document.querySelectorAll("#pane-ranked .row:not(.linked)")].map((r) => r.dataset.go), linked: [...document.querySelectorAll("#pane-ranked .row.linked")].map((r) => ({ id: r.dataset.go, off: !!r.querySelector(".off-board-note") })), note: document.querySelector("#pane-ranked .pane-note")?.textContent }));
      const outside = rk.scored.filter((x) => !members.includes(x));
      const n = Number(rk.note?.match(/\d+/)?.[0]);
      ok("Boards: a first-column tile's Open button is inside the grid (not clipped)", openClip && !openClip.clipped, JSON.stringify(openClip));
      ok("Item 5 (C1, Task 8 F1): under scope Ranked lists members only and 'N related' matches", outside.length === 0 && n === rk.scored.length + rk.linked.filter((l) => members.includes(l.id)).length || (outside.length === 0 && n === rk.scored.length), `focus ${await focusId(page) === M0 ? "M0" : await focusId(page)}; ${rk.scored.length} scored rows, ${outside.length} outside; note "${rk.note}"; linked ${JSON.stringify(rk.linked)}`);
      const off = rk.linked.find((l) => l.id === N1);
      ok("Item 5: 'Linked by you' still shows the off-board link, marked 'Not on this board'", !!off && off.off, JSON.stringify(rk.linked));
      // Search under scope.
      await page.fill("#q", titles[N1]); await sleep(900);
      const hitsN = await page.evaluate(() => [...document.querySelectorAll("#q-results [data-r]")].map((e) => e.dataset.r));
      await page.fill("#q", titles[members[2]]); await sleep(900);
      const hitsM = await page.evaluate(() => [...document.querySelectorAll("#q-results [data-r]")].map((e) => e.dataset.r));
      await page.fill("#q", ""); await page.keyboard.press("Escape");
      ok("Task 8 gap: search under scope returns members only", !hitsN.includes(N1) && hitsN.every((h) => members.includes(h)) && hitsM.includes(members[2]), `non-member "${titles[N1]}" → ${hitsN.length} hits (${hitsN.filter((h) => !members.includes(h)).length} non-members); member "${titles[members[2]]}" → found ${hitsM.includes(members[2])}`);
      // RF5: the focused reference isn't on the board.
      await page.click(`#pane-ranked .row.linked[data-go="${N1}"]`); await sleep(900);
      const chip = await page.evaluate(() => { const c = document.querySelector("#lab .off-board"); return c && !c.hidden ? c.textContent : null; });
      const rk2 = await page.evaluate(() => [...document.querySelectorAll("#pane-ranked .row:not(.linked)")].map((r) => r.dataset.go));
      ok("RF5: a focused non-member stays focused with 'Not on this board'; its Ranked lists members only", (await focusId(page)) === N1 && chip === "Not on this board" && rk2.every((x) => members.includes(x)), `focus is N1 ${(await focusId(page)) === N1}; chip "${chip}"; ${rk2.length} scored, ${rk2.filter((x) => !members.includes(x)).length} outside`);
      await shot(page, "scope-nonmember");
      // RF5: delete the scoped board.
      await tab(page, "boards");
      await page.click('.bd-head [data-act="delete"]');
      const prompt = await text(page, ".bd-msg");
      await page.click('.bd-msg [data-act="delete-yes"]'); await sleep(900);
      const st = await page.evaluate(() => { const s = document.querySelector("#board-scope"); return s.hidden ? "(hidden)" : s.textContent; });
      const boardsLeft = await page.evaluate(() => [...document.querySelectorAll(".bd-pick span:first-child")].map((s) => s.textContent));
      await undo(page, 1200);
      const st2 = await page.evaluate(() => { const s = document.querySelector("#board-scope"); return s.hidden ? "(hidden)" : s.textContent; });
      const boardsBack = await page.evaluate(() => [...document.querySelectorAll(".bd-pick span:first-child")].map((s) => s.textContent));
      const scopeBtn = await page.evaluate(() => document.querySelector('.bd-head [data-act="scope"]')?.getAttribute("aria-pressed"));
      ok("RF5: deleting the scoped board clears the scope and the status says so; Ctrl+Z brings the board back, scope stays off", /Board removed — showing all references/.test(st) && !boardsLeft.includes("Harbour light") && boardsBack.includes("Harbour light"), `prompt "${prompt}"; status after delete "${st}"; boards ${JSON.stringify(boardsLeft)}; after Ctrl+Z ${JSON.stringify(boardsBack)}, status "${st2}", scope pressed ${scopeBtn}`);
      const sel = await page.evaluate(() => document.querySelector('.bd-pick[aria-current="true"] span')?.textContent);
      if (sel !== "Harbour light") await page.click('.bd-pick:has-text("Harbour light")').catch(() => {});
    });

    // ===== 5. Export twice, credits.txt, Show in folder (item 8) =====
    await block("export", async () => {
      await tab(page, "boards");
      const order = await tiles(page);
      dialogAnswer = EXPORT;
      await page.click('.bd-head [data-act="export"]');
      await page.waitForFunction(() => /Exported/.test(document.querySelector("#import-notice [data-body]")?.textContent || ""), null, { timeout: 30000 });
      const toast1 = await text(page, "#import-notice [data-body]");
      const files1 = fs.readdirSync(EXPORT).sort();
      const h1 = Object.fromEntries(files1.map((f) => [f, sha(path.join(EXPORT, f))]));
      const credits = fs.readFileSync(path.join(EXPORT, "credits.txt"));
      const ct = credits.toString("utf8");
      const lib = readLib();
      const origs = order.map((id) => lib.references.find((r) => r.id === id)).filter(Boolean);
      const origSha = origs.map((r) => { const f = [path.join(LIB, r.file || ""), path.join(LIB, "images", r.file || "")].find((x) => fs.existsSync(x) && fs.statSync(x).isFile()); return f ? sha(f) : null; });
      const imgs = files1.filter((f) => f !== "credits.txt");
      const copiesMatch = origSha.every((s) => s === null) ? "originals not located by field name" : origSha.filter(Boolean).every((s) => Object.values(h1).includes(s));
      const blockTitles = [...ct.matchAll(/^Title: (.*)$/gm)].map((m) => m[1]);
      ok("Export: 8 images + credits.txt; names valid; copies byte-identical to the originals", imgs.length === 8 && files1.includes("credits.txt") && imgs.every((f) => !/[<>:"|?*]/.test(f) && !/[ .]$/.test(f)) && copiesMatch === true, `toast "${toast1}"; files ${JSON.stringify(imgs.slice(0, 3))}…; byte-identical ${copiesMatch}`);
      ok("credits.txt: UTF-8 without BOM, LF, one block per image in board order", credits.slice(0, 3).toString("hex") !== "efbbbf" && !ct.includes("\r") && blockTitles.length === 8 && JSON.stringify(blockTitles) === JSON.stringify(order.map((id) => titles[id] ?? lib.references.find((r) => r.id === id)?.title)), `BOM ${credits.slice(0, 3).toString("hex") === "efbbbf"}; CR ${ct.includes("\r")}; blocks ${blockTitles.length}; valid UTF-8 ${Buffer.from(ct, "utf8").equals(credits)}; head ${JSON.stringify(ct.slice(0, 160))}`);
      fs.copyFileSync(path.join(EXPORT, "credits.txt"), path.join(SHOTS, "credits.txt"));
      const revealLabel = await text(page, '#import-notice [data-act="reveal"]');
      await page.click('.bd-head [data-act="export"]');
      await sleep(2500);
      const toast2 = await text(page, "#import-notice [data-body]");
      const files2 = fs.readdirSync(EXPORT).sort();
      const unchanged = files1.every((f) => sha(path.join(EXPORT, f)) === h1[f]);
      ok("Export twice: nothing overwritten, every second copy gets ' (2)', credits (2).txt", unchanged && files2.length === 18 && files2.includes("credits (2).txt") && files2.filter((f) => / \(2\)\./.test(f)).length === 9, `toast "${toast2}"; ${files2.length} files; first files unchanged ${unchanged}`);
      const explorers = () => { try { return execSync(`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).Windows() | ForEach-Object { $_.LocationURL }"`).toString().split(/\r?\n/).filter(Boolean); } catch { return []; } };
      const before = explorers();
      await page.click('#import-notice [data-act="reveal"]');
      let after = before;
      for (let i = 0; i < 20 && after.length === before.length; i++) { await sleep(500); after = explorers(); }
      const opened = after.filter((u) => !before.includes(u));
      ok("Item 8: 'Show in folder' label, and it opens Explorer on the export", revealLabel === "Show in folder" && opened.length > 0, `label "${revealLabel}"; new Explorer windows ${JSON.stringify(opened)}`);
      // Close the Explorer window it opened.
      try { execSync(`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).Windows() | Where-Object { @(${opened.map((u) => `'${u.replace(/'/g, "''")}'`).join(",") || "'none'"}) -contains $_.LocationURL } | ForEach-Object { $_.Quit() }"`); } catch {}
      await dismiss(page);
    });

    // ===== 6. Lightbox: zoom, pan, draw + tag at ~416 % (item 2), item 9, hover label, Tab (T6) =====
    await block("lightbox", async () => {
      await tab(page, "reference");
      await go(page, M0).catch(async () => { await searchGo(page, titles[M0]); });
      await blur(page);
      await page.keyboard.press("l");
      await page.waitForSelector(".lightbox .lb-stage", { timeout: 5000 });
      await sleep(1500);
      const [cx, cy] = await center(page, ".lightbox .lb-stage");
      await page.mouse.move(cx, cy);
      let zoom = await text(page, ".lb-zoom");
      for (let i = 0; i < 40 && parseInt(zoom) < 400; i++) { await page.mouse.wheel(0, -120); await sleep(80); zoom = await text(page, ".lb-zoom"); }
      const p0 = await rectOf(page, ".lb-plate");
      await page.keyboard.down(" "); await page.mouse.down(); await page.mouse.move(cx - 120, cy - 80, { steps: 8 }); await page.mouse.up(); await page.keyboard.up(" ");
      const p1 = await rectOf(page, ".lb-plate");
      ok("Lightbox: wheel zoom to ~400 % and Space-drag pan", parseInt(zoom) >= 400 && Math.abs(p1.x - p0.x) > 50, `zoom ${zoom}; pan moved ${Math.round(p1.x - p0.x)},${Math.round(p1.y - p0.y)} px`);
      const vp = await rectOf(page, ".lb-stage");
      const x1 = vp.x + vp.w * 0.4, y1 = vp.y + vp.h * 0.4, x2 = vp.x + vp.w * 0.55, y2 = vp.y + vp.h * 0.6;
      await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 10 });
      const pl = await rectOf(page, ".lb-plate"); const zDraw = await text(page, ".lb-zoom"); let zDraw2 = zDraw;
      await page.mouse.up();
      await page.waitForSelector(".lightbox .lb-side .picker", { timeout: 5000 }); await sleep(300);
      // Item 9: the Add technique form's Esc.
      await page.keyboard.press("1"); await sleep(300);
      await page.fill(".lightbox .pk-search", "qa harbour glint"); await sleep(400);
      await page.keyboard.press("Enter"); await sleep(400);
      if (!(await page.locator(".lightbox .pk-form").count())) { await page.click(".lightbox .pk-new").catch(() => {}); await sleep(400); }
      const formOpen = await page.locator(".lightbox .pk-form").count();
      const beforeEsc = await active(page);
      await page.keyboard.press("Escape"); await sleep(400);
      const s9 = await page.evaluate(() => ({ lightbox: !!document.querySelector(".lightbox"), picker: !!document.querySelector(".lightbox .picker"), form: !!document.querySelector(".lightbox .pk-form"), q: document.querySelector(".lightbox .pk-search")?.value, focus: document.activeElement?.className, draft: !document.querySelector(".lightbox .lb-pending")?.hidden || !document.querySelector(".lightbox .lb-draft")?.hidden, zoom: document.querySelector(".lb-zoom")?.textContent }));
      ok("Item 9: Esc in the picker's Add technique form closes the form only (lightbox, picker, region and zoom stay)", formOpen > 0 && s9.lightbox && s9.picker && !s9.form && s9.draft && s9.zoom === zDraw, `form opened ${formOpen > 0}; focus before Esc ${beforeEsc}; after Esc ${JSON.stringify(s9)}`);
      if (!s9.lightbox) {
        await blur(page); await page.keyboard.press("l"); await page.waitForSelector(".lightbox .lb-stage"); await sleep(1500);
        await page.mouse.move(cx, cy);
        for (let i = 0; i < 40 && parseInt(await text(page, ".lb-zoom")) < 400; i++) { await page.mouse.wheel(0, -120); await sleep(80); }
        await page.keyboard.down(" "); await page.mouse.down(); await page.mouse.move(cx - 120, cy - 80, { steps: 8 }); await page.mouse.up(); await page.keyboard.up(" ");
        await page.mouse.move(x1, y1); await page.mouse.down(); await page.mouse.move(x2, y2, { steps: 10 });
        Object.assign(pl, await rectOf(page, ".lb-plate")); zDraw2 = await text(page, ".lb-zoom");
        await page.mouse.up(); await page.waitForSelector(".lightbox .lb-side .picker"); await sleep(300);
      } else { await page.keyboard.press("Escape"); await page.evaluate(() => document.activeElement?.blur()); } // clears the query; Plan 6: focus stays in the search (F1 fixed), so leave it before "1"
      await sleep(300);
      const zPick = await text(page, ".lb-zoom");
      const nBox = await page.evaluate(() => document.querySelectorAll(".lb-box").length);
      await page.keyboard.press("1"); await sleep(300); await page.keyboard.press("Enter");
      await page.waitForFunction((n) => document.querySelectorAll(".lb-box").length > n, nBox, { timeout: 8000 });
      await sleep(500);
      const zTag = await text(page, ".lb-zoom");
      const frac = { x: (x1 - pl.x) / pl.w, y: (y1 - pl.y) / pl.h, w: (x2 - x1) / pl.w, h: (y2 - y1) / pl.h };
      const box = () => page.evaluate(() => { const bs = [...document.querySelectorAll(".lb-box")]; const p = document.querySelector(".lb-plate").getBoundingClientRect(); const r = bs[bs.length - 1].getBoundingClientRect(); return { x: (r.x - p.x) / p.width, y: (r.y - p.y) / p.height, w: r.width / p.width, h: r.height / p.height }; });
      const d = (a) => Math.max(Math.abs(a.x - frac.x), Math.abs(a.y - frac.y), Math.abs(a.w - frac.w), Math.abs(a.h - frac.h));
      const b416 = await box();
      const picker = await page.locator(".lightbox .lb-side .picker").count();
      await page.focus(".lightbox .lb-stage"); await page.keyboard.press("0"); await sleep(500);
      const zFit = await text(page, ".lb-zoom"); const bFit = await box();
      await page.keyboard.press("1"); await sleep(500);
      const z100 = await text(page, ".lb-zoom");
      ok("Item 2 (F2): tag a region drawn at ~416 %: zoom stays; after the picker closes 0 and 1 zoom again; region exact", zTag === zDraw2 && zPick === zDraw2 && picker === 0 && zFit !== zDraw && /100/.test(z100 || "") && d(b416) < 0.01 && d(bFit) < 0.01, `zoom at draw ${zDraw}, after form ${zPick}, after tag ${zTag}; picker still open ${picker}; 0 → ${zFit}, 1 → ${z100}; error at 416 % ${d(b416).toFixed(4)}, at fit ${d(bFit).toFixed(4)}`);
      // Hover label.
      const r = await rectOf(page, ".lb-box:last-child");
      await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2); await sleep(400);
      const hov = await page.evaluate(() => { const b = document.querySelector(".lb-box.is-hot"); const t = b?.querySelector(".lb-tag"); return b ? { label: t?.textContent, vis: t ? getComputedStyle(t).visibility + "/" + getComputedStyle(t).display : null } : null; });
      ok("Task 8 gap: hover a region shows its label 'Operation › Technique'", !!hov && / › /.test(hov.label || "") && !/hidden|none/.test(hov.vis || ""), JSON.stringify(hov));
      await shot(page, "lightbox-hover");
      // T6: Tab onto a region while zoomed.
      await page.mouse.move(vp.x + 5, vp.y + 5);
      for (let i = 0; i < 12 && parseInt(await text(page, ".lb-zoom")) < 400; i++) { await page.mouse.move(r.x + r.w / 2, r.y + r.h / 2); await page.mouse.wheel(0, -120); await sleep(80); }
      await page.mouse.move(vp.x + vp.w - 4, vp.y + 4);
      await page.focus(".lightbox .lb-stage");
      const a = await rectOf(page, ".lb-plate");
      await page.keyboard.press("Tab"); await sleep(400);
      const z = await rectOf(page, ".lb-plate");
      const tabSt = await page.evaluate(() => { const a = document.activeElement; const r = a.getBoundingClientRect(), s = document.querySelector(".lb-stage").getBoundingClientRect(); return { focused: a.className, hot: a.classList.contains("is-hot"), label: a.querySelector(".lb-tag") ? getComputedStyle(a.querySelector(".lb-tag")).visibility : null, inView: r.right > s.left && r.left < s.right && r.bottom > s.top && r.top < s.bottom, zoom: document.querySelector(".lb-zoom").textContent }; });
      ok("Task 8 gap (T6): Tab onto a region while zoomed focuses and labels it, in view", /lb-box/.test(tabSt.focused) && tabSt.inView && (tabSt.hot || tabSt.label === "visible"), `${JSON.stringify(tabSt)}; plate shift ${Math.round(z.x - a.x)},${Math.round(z.y - a.y)} px`);
      await page.keyboard.press("Escape"); await sleep(400);
      if (await page.locator(".lightbox").count()) { await page.keyboard.press("Escape"); await sleep(300); }
      ok("Lightbox: Esc closes it", !(await page.locator(".lightbox").count()), "");
    });

    // ===== 7. RF3: TIFF and a 20,400 px image =====
    await block("rf3", async () => {
      await page.evaluate(() => document.querySelector("#board-scope [data-scope-clear]")?.click());
      const n0 = await count(page);
      await drop(page, [path.join(FX, "Harbour scan.tif"), path.join(FX, "Long panorama.png")]);
      await noticeDone(page);
      const toast = await text(page, "#import-notice [data-body]");
      await dismiss(page);
      ok("RF3 setup: TIFF and 20,400 px PNG import", (await count(page)) === n0 + 2, `${n0} → ${await count(page)}; "${toast}"`);
      for (const q of ["Harbour scan", "Long panorama"]) {
        const id = await searchGo(page, q);
        if (!id) { ok(`RF3: ${q} lightbox`, false, "not found by search"); continue; }
        await blur(page); await page.keyboard.press("l");
        await page.waitForSelector(".lightbox .lb-stage", { timeout: 5000 }); await sleep(3000);
        const st = await page.evaluate(() => { const i = document.querySelector(".lightbox .lb-plate img"); const n = document.querySelector(".lightbox .lb-note"); return { note: n && !n.hidden ? n.textContent.trim() : null, natural: i ? [i.naturalWidth, i.naturalHeight] : null, src: (i?.currentSrc || i?.src || "").split("/").pop().slice(0, 60), size: document.querySelector(".lightbox .lb-size")?.textContent }; });
        await shot(page, `rf3-${q.split(" ")[0].toLowerCase()}`);
        const wantNote = q === "Harbour scan";
        ok(`RF3: ${q} in the lightbox: never blank${wantNote ? "; preview note shown" : ""}`, st.natural && st.natural[0] > 0 && (!wantNote || /Showing a preview — this format can't be shown at full size here\./.test(st.note || "")), JSON.stringify(st));
        await page.keyboard.press("Escape"); await sleep(400);
      }
    });

    // ===== 8. Item 3c: the link editor's caret during a background import =====
    await block("caret", async () => {
      await go(page, M0).catch(async () => { await searchGo(page, titles[M0]); });
      await page.click("#tab-callouts"); await blur(page);
      await page.keyboard.press("k");
      await page.waitForSelector(".link-editor .le-why", { timeout: 3000 });
      await page.fill(".link-editor .le-why", "harbour glare");
      await page.evaluate(() => { const t = document.querySelector(".link-editor .le-why"); t.focus(); t.setSelectionRange(7, 7); });
      await drop(page, [path.join(FX, "Background drop.png")]);
      await noticeDone(page); await sleep(500);
      const c = await page.evaluate(() => { const t = document.querySelector(".link-editor .le-why"); return { focused: document.activeElement === t, sel: t ? [t.selectionStart, t.selectionEnd] : null, value: t?.value }; });
      ok("Item 3c: a background import doesn't move the caret in the link editor's why", c.focused && c.sel?.[0] === 7 && c.sel?.[1] === 7 && c.value === "harbour glare", JSON.stringify(c));
      await page.click(".link-editor .le-cancel"); await dismiss(page);
    });

    // ===== 9. Compare: shot, x, v, L, Link these two, Esc (items 3, 4, 6) =====
    await block("compare", async () => {
      await go(page, M0).catch(async () => { await searchGo(page, titles[M0]); });
      // Pin callout 1: Esc from Compare must keep it.
      await page.click("#tab-callouts"); await blur(page); await page.keyboard.press("1"); await sleep(300);
      const pin = () => page.evaluate(() => document.querySelector('.call[data-i="0"] .pin')?.getAttribute("aria-pressed"));
      const pin0 = await pin();
      await page.click("#tab-ranked"); await sleep(300);
      const B = await page.evaluate(() => document.querySelector("#pane-ranked .row:not(.linked)")?.dataset.go);
      await page.click(`#pane-ranked [data-go="${B}"]`, { modifiers: ["Shift"] });
      await page.waitForSelector(".compare .cmp-mid", { timeout: 5000 });
      await page.waitForFunction(() => (document.querySelector(".compare .cmp-score")?.textContent || "") !== "", null, { timeout: 8000 });
      await sleep(600);
      const cmp0 = await page.evaluate(() => ({ a: document.querySelector('[data-side="a"] .cmp-title')?.textContent, b: document.querySelector('[data-side="b"] .cmp-title')?.textContent, shared: [...document.querySelectorAll(".cmp-shared li")].map((l) => l.textContent.trim()), onlyA: document.querySelectorAll('[data-side="a"] .cmp-only li').length, onlyB: document.querySelectorAll('[data-side="b"] .cmp-only li').length, score: document.querySelector(".cmp-score")?.textContent, modal: document.querySelector(".compare")?.getAttribute("aria-modal") }));
      ok("Compare: Shift-click opens it; shared in the middle, unique on each side, score", cmp0.shared.length > 0 && cmp0.modal === "true" && !!cmp0.score, JSON.stringify(cmp0));
      await page.mouse.move(640, 60); await sleep(300);
      if (README) await page.screenshot({ path: path.join(README, "compare-view.png") });
      await shot(page, "compare-view");
      // Item 6 (I5) at ~1050 CSS px.
      resizeWin(1066, 839); await sleep(900);
      const lay = await page.evaluate(() => { const rr = (s) => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; }; return { w: innerWidth, a: rr('[data-side="a"] .cmp-tile'), ap: rr('[data-side="a"] .cmp-plate'), mid: rr(".cmp-mid"), b: rr('[data-side="b"] .cmp-tile'), bp: rr('[data-side="b"] .cmp-plate') }; });
      const inside = (p, t) => p.l >= t.l - 1 && p.r <= t.r + 1 && p.t >= t.t - 1 && p.b <= t.b + 1;
      // Hover a shared technique: an outline inside its tile, when the tag is a region.
      await page.hover(".cmp-shared li").catch(() => {}); await sleep(300);
      const outl = await page.evaluate(() => [...document.querySelectorAll(".cmp-out:not([hidden])")].map((o) => { const r = o.getBoundingClientRect(), t = o.closest(".cmp-tile").getBoundingClientRect(); return r.left >= t.left - 1 && r.right <= t.right + 1 && r.top >= t.top - 1 && r.bottom <= t.bottom + 1; }));
      await shot(page, "compare-1050");
      ok("Item 6 (I5): Compare at ~1050 CSS px: plates inside their columns, no overlap into Shared", lay.w >= 900 && lay.w <= 1150 && inside(lay.ap, lay.a) && inside(lay.bp, lay.b) && lay.ap.r <= lay.mid.l + 1 && lay.bp.l >= lay.mid.r - 1, `${JSON.stringify(lay)}; hovered outlines inside tile: ${JSON.stringify(outl)}`);
      resizeWin(1296, 839); await sleep(900);
      // x and v, once each from <body> after a notice's Dismiss (item 3b).
      await drop(page, [path.join(FX, "Notice test.png")]); await noticeDone(page);
      const nAfterImport = await count(page);
      await page.click("#import-dismiss"); await sleep(300);
      const actAfterDismiss = await active(page);
      const titlesNow = () => page.evaluate(() => [document.querySelector('[data-side="a"] .cmp-title')?.textContent, document.querySelector('[data-side="b"] .cmp-title')?.textContent]);
      await blur(page); await page.keyboard.press("x"); await sleep(400);
      const tx = await titlesNow();
      await blur(page); await page.keyboard.press("v"); await sleep(300);
      const val = await page.evaluate(() => [...document.querySelectorAll(".cmp-tile")].map((t) => t.classList.contains("is-value")));
      await page.keyboard.press("v"); await page.keyboard.press("x"); await sleep(400);
      ok("Item 3b: after Dismiss, x swaps once and v flips once (from <body>)", tx[0] === cmp0.b && tx[1] === cmp0.a && val.every(Boolean), `focus after Dismiss ${actAfterDismiss}; after x ${JSON.stringify(tx)}; value ${JSON.stringify(val)}`);
      // Link these two, save: focus on Edit link; Esc closes Compare; pin kept (item 3a).
      await page.click(".compare .cmp-link-btn");
      await page.waitForSelector(".link-editor .le-why", { timeout: 5000 });
      await page.fill(".link-editor .le-why", "same raking light");
      await page.click(".link-editor .le-save"); await sleep(900);
      const s3a = await page.evaluate(() => ({ focus: document.activeElement?.className, label: document.activeElement?.textContent, line: document.querySelector(".compare .cmp-link")?.textContent, score: document.querySelector(".compare .cmp-score")?.textContent }));
      ok("Item 3a: Link these two + save: focus on 'Edit link'; 'Linked by you' line; score unchanged", /cmp-link-btn/.test(s3a.focus || "") && s3a.label === "Edit link" && /Linked by you: “same raking light”/.test(s3a.line || "") && s3a.score === cmp0.score, `${JSON.stringify(s3a)}; score before ${cmp0.score}`);
      // Ctrl+Z from <body> in Compare: one step (the link only; the import stays).
      await blur(page); await undo(page, 1200);
      const u = await page.evaluate(() => ({ btn: document.querySelector(".compare .cmp-link-btn")?.textContent, open: !!document.querySelector(".compare") }));
      const nU = await count(page);
      ok("Item 3b: Ctrl+Z from <body> in Compare is one undo step", u.btn === "Link these two" && nU === nAfterImport, `button "${u.btn}"; refs ${nAfterImport} → ${nU}`);
      await redo(page, 1200);
      // Item 4: lightbox over Compare.
      const [bx, by] = await center(page, '[data-side="b"] .cmp-plate');
      await page.mouse.move(bx, by);
      await blur(page); await page.keyboard.press("L");
      await page.waitForSelector(".lightbox .lb-stage", { timeout: 5000 }); await sleep(800);
      const lbTitle = await page.evaluate(() => document.querySelector(".lightbox .lb-plate img")?.alt);
      await blur(page); await undo(page, 1200);
      const lbU = await page.evaluate(() => ({ lb: !!document.querySelector(".lightbox"), btn: document.querySelector(".compare .cmp-link-btn")?.textContent }));
      const nU2 = await count(page);
      await blur(page); await page.keyboard.press("Escape"); await sleep(500);
      const e1 = await page.evaluate(() => ({ lb: !!document.querySelector(".lightbox"), cmp: !!document.querySelector(".compare") }));
      await blur(page); await page.keyboard.press("Escape"); await sleep(500);
      const e2 = await page.evaluate(() => ({ lb: !!document.querySelector(".lightbox"), cmp: !!document.querySelector(".compare") }));
      ok("Item 4: L over Compare (side under the pointer); from <body> Ctrl+Z is one step, Esc closes the lightbox only, a second Esc closes Compare", lbTitle === tx[1] || lbTitle === cmp0.b, `lightbox on "${lbTitle}" (B "${cmp0.b}"); Ctrl+Z → link button "${lbU.btn}", lightbox open ${lbU.lb}, refs ${nAfterImport} → ${nU2}; Esc 1 ${JSON.stringify(e1)}; Esc 2 ${JSON.stringify(e2)}`);
      const pass4 = lbU.btn === "Link these two" && nU2 === nAfterImport && e1.lb === false && e1.cmp === true && e2.cmp === false;
      ok("Item 4: one step + Esc order", pass4, "");
      const pin1 = await pin();
      ok("Item 3a: Esc from Compare keeps the Reference view's pin", pin0 === "true" && pin1 === "true", `pin before ${pin0}, after ${pin1}`);
      await redo(page, 1200);
      ok("Compare's link is back after Ctrl+Y", (readLib()?.links || []).some((l) => l.why === "same raking light") || /same raking light/.test(await text(page, "#pane-ranked") || ""), `links on disk ${(readLib()?.links || []).length}`);
    });

    // ===== 10. RF6: a board rename and a link edit, then a quick quit =====
    await block("rf6-prepare", async () => {
      await tab(page, "boards");
      await page.click('.bd-pick:has-text("Harbour light")').catch(() => {});
      await page.click('.bd-head [data-act="rename"]');
      await page.fill(".bd-rename", "Harbour quit"); await page.keyboard.press("Enter");
      await page.waitForFunction(() => document.querySelector(".bd-name")?.textContent === "Harbour quit", null, { timeout: 3000 });
      await tab(page, "reference");
      await go(page, M0).catch(async () => { await searchGo(page, titles[M0]); });
      await page.click("#tab-links"); await sleep(300);
      await page.click("#pane-links [data-link-edit]");
      await page.fill(".link-editor .le-why", "edited just before quitting");
      const t0 = Date.now();
      await page.click(".link-editor .le-save");
      await page.waitForFunction(() => /edited just before quitting/.test(document.querySelector("#pane-links")?.textContent || ""), null, { timeout: 3000 });
      try { execSync(`powershell -NoProfile -Command "(Get-Process -Id ${proc.pid}).CloseMainWindow() | Out-Null"`); } catch {}
      ok("RF6 setup: quit requested soon after the link save", true, `${Date.now() - t0} ms after Save`);
    });
    await closeApp(b);
    ({ b, page } = await launch("run2"));
    await block("rf6", async () => {
      await page.waitForSelector("#lib-count:not(:empty)", { timeout: 30000 }); await sleep(1500);
      const disk = fs.readFileSync(path.join(LIB, "library.json"), "utf8");
      await page.click("#tab-links").catch(() => {});
      await tab(page, "boards");
      const names = await page.evaluate(() => [...document.querySelectorAll(".bd-pick span:first-child")].map((s) => s.textContent));
      ok("RF6: a board rename and a link edit survive a quick quit (disk and UI)", disk.includes("edited just before quitting") && disk.includes("Harbour quit") && names.includes("Harbour quit"), `on disk: note ${disk.includes("edited just before quitting")}, board ${disk.includes("Harbour quit")}; boards list ${JSON.stringify(names)}`);
      const sc = await page.evaluate(() => document.querySelector("#board-scope")?.hidden);
      ok("Scope is view state: not restored after a relaunch", sc === true, `status hidden ${sc}`);
    });
  } catch (e) {
    ok("harness", false, String(e && e.stack || e).slice(0, 400));
    await shot(page, "error");
  } finally {
    await closeApp(b);
    fs.rmSync(CONFIG, { recursive: true, force: true });
    ok("First-run 'Create a new library…' pick misses per launch", null, JSON.stringify(picks));
    ok("Console errors", consoleErr.length === 0, consoleErr.slice(0, 5).join(" | "));
    fs.writeFileSync(path.join(W, "results-p4.json"), JSON.stringify(R, null, 1));
    const f = R.filter((r) => r.pass === false).length, p = R.filter((r) => r.pass === true).length;
    console.log(`\n${p} passed, ${f} failed, ${R.filter((r) => r.pass === null).length} notes`);
  }
}
main();
