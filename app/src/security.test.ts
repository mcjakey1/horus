// @vitest-environment jsdom
// Plan 6 Task 3: untrusted text renders as text (Review Focus 3), plus the accessibility smoke
// (audit #17). Every view that shows library, manifest or Rust text is mounted with hostile
// strings through a fake Api; none may become markup, and each must read exactly as written.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import html from "../index.html?raw";
import seedJson from "../src-tauri/resources/taxonomy.json";
import type { Api, Board, LibraryView, Link, Reference, SimilarStatus, Taxonomy } from "./api";
import { demoCredits, FONTS, mountAbout } from "./about";
import { mountBoards } from "./boards/view";
import { mountCompare } from "./compare/view";
import type { Snapshot } from "./data";
import { intakeHTML, noticeIn, warningHTML } from "./importer";
import { mountInbox } from "./inbox/view";
import type { DropWin } from "./intake";
import { openLightbox } from "./lightbox/view";
import { mountLinkEditor } from "./links/editor";
import { mountReference } from "./reference/view";
import { mountSettings } from "./settings/panel";
import { wireSimilar } from "./similar-ui";
import { createStore, type Store } from "./store";
import { mountPicker } from "./tagging/picker";
import { openDetails } from "./reference/details";
import { renderInspector } from "./views/inspector";

// ---------- the hostile fixture ----------
const TITLE = `<img src=x onerror="window.__xss=1">.jpg`;
const NOTE = `<script>window.__xss=2</script>`;
const CREDIT = `<b>bold</b>`;
const WHY = `"><svg onload=window.__xss=3>`;
const TECH = `<i>Halo</i>`;
const INBOX_TITLE = `<svg onload=window.__xss=4>.png`;
const BOARD = `<u>Posters</u>`;
const OP = `<u>Op</u>`;
const OP_PLAIN = `<s>Plain</s>`;
const BAD_INK = `red";onclick="window.__xss=5`; // an operation colour from a hand-edited taxonomy.json
const STATUS_ERROR = `<img src=x onerror="window.__xss=6">`;
const FILE = `C:\\in\\<img src=x onerror="window.__xss=7">.jpg`;
const WARNING = `<b>warning</b>`;

const seed = seedJson as unknown as Taxonomy;
const branch = seed.branches[0];
const taxonomy: Taxonomy = {
  ...seed,
  operations: [...seed.operations, { id: "xop", name: OP, plainLabel: OP_PLAIN, color: BAD_INK, icon: "", description: "" }],
  branches: [...seed.branches, { id: "xop-b", operationId: "xop", domainId: seed.domains[0].id }],
  techniques: [...seed.techniques, { id: "halo", name: TECH, icon: "", description: `${TECH} described`, synonyms: [TECH], examples: [], custom: true }],
  branchTechniques: [...seed.branchTechniques, { branchId: branch.id, techniqueId: "halo" }, { branchId: "xop-b", techniqueId: "halo" }],
};
const ref = (id: string, title: string, tags: Reference["tags"], extra: Partial<Reference> = {}): Reference => ({
  id, title, file: `images/${id}.jpg`, hash: id, width: 300, height: 400, addedAt: "2026-11-25T00:00:00Z", tags,
  thumb256: `C:\\lib\\thumbs\\256\\${id}.jpg`, thumb1024: `C:\\lib\\thumbs\\1024\\${id}.jpg`, ...extra,
});
const halo = (n: string, region = true) => ({
  id: n, operationId: branch.operationId, techniqueId: "halo", branchId: branch.id, suggested: false,
  ...(region ? { region: { x: 0.1, y: 0.2, w: 0.4, h: 0.3 } } : {}),
});
const X1 = ref("x1", TITLE, [halo("t1"), { id: "t2", operationId: "xop", suggested: false }], { note: NOTE, credit: CREDIT, creator: CREDIT });
const X2 = ref("x2", "Plate B", [halo("t3", false)]);
const X3 = ref("x3", INBOX_TITLE, [], { note: NOTE });
const links: Link[] = [{ id: "l1", fromRef: "x1", toRef: "x2", why: WHY }];
const boards: Board[] = [{ id: "b1", name: BOARD, referenceIds: ["x1", "x2"] }];
const library: LibraryView = { root: "C:\\lib", references: [X1, X2, X3], links, boards, warning: WARNING, taxonomyReadOnly: false };

const status = (extra: Partial<SimilarStatus> = {}): SimilarStatus => ({
  phase: "ready", downloadDone: 0, downloadTotal: 213373093, indexed: 3, total: 3, diskBytes: 1, error: null, ...extra,
});

let dropCb: ((e: { payload: never }) => void)[] = [];
function fakeApi(): Api {
  const base: Partial<Api> = {
    getSettings: vi.fn(async () => ({ lastLibrary: "C:\\lib", theme: "light" as const, findSimilar: "on" as const, introSeen: true })),
    getTaxonomy: vi.fn(async () => taxonomy),
    related: vi.fn(async (id: string) => [{ id: id === "x1" ? "x2" : "x1", score: 0.5, sharedTechniques: ["halo"], sharedBranches: [branch.id] }]),
    search: vi.fn(async () => [{ kind: "technique" as const, id: "halo", operationId: branch.operationId, count: 2 }, { kind: "reference" as const, id: "x1" }]),
    assetUrl: (p: string) => `asset://${encodeURIComponent(p)}`,
    similarStatus: vi.fn(async () => status()),
    onSimilarStatus: vi.fn(async () => () => {}),
    similarByRef: vi.fn(async () => [{ id: "x1", score: 0.9 }]),
    similarByText: vi.fn(async () => [{ id: "x1", score: 0.07 }]),
    similarByFile: vi.fn(async () => [{ id: "x1", score: 0.8 }]),
    demoExamples: vi.fn(async () => [{ techniqueId: "halo", title: TITLE, path: "C:\\demo\\a.jpg" }]),
    scorePair: vi.fn(async () => ({ id: "x2", score: 0.5, sharedTechniques: ["halo"], sharedBranches: [branch.id] })),
    lightboxSource: vi.fn(async () => ({ path: "C:\\lib\\images\\x1.jpg", full: true, width: 300, height: 400 })),
  };
  return new Proxy(base as Api, {
    get: (t, k: string) => (k in t ? t[k as keyof Api] : ((t as unknown as Record<string, unknown>)[k] = vi.fn(async () => undefined))),
  });
}

// ---------- the assertions ----------
const settle = (ms = 0) => new Promise((r) => setTimeout(r, ms));
/** No element or handler that came from the data: the strings stay text. */
function noMarkup() {
  expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  expect(document.querySelectorAll('img[src="x"], svg[onload], [onerror], [onload], [onclick]')).toHaveLength(0);
  // An element built from the data holds just the inner word; code-made wrappers hold escaped text.
  const fromData = [
    ...[...document.querySelectorAll("script")].filter((e) => (e.textContent ?? "").includes("__xss")),
    ...[...document.querySelectorAll("i, b, u, s")].filter((e) => /^(Halo|bold|warning|Posters|Op|Plain)$/.test(e.textContent ?? "")),
  ];
  expect(fromData.map((e) => e.outerHTML)).toEqual([]);
}
/** `strings` appear in the text of `root` exactly as written. */
function readsAsText(root: ParentNode, strings: string[]) {
  const text = root.textContent ?? "";
  for (const s of strings) expect(text, s).toContain(s);
}
/** Audit #17: every control has an accessible name from its text, aria-label or aria-labelledby
 * (an associated <label> and an image's alt count as its text). */
function unnamed(root: ParentNode): string[] {
  const sel = 'button, a[href], input:not([type="hidden"]), select, textarea, [role="tab"], [role="switch"], [role="option"]';
  return [...root.querySelectorAll<HTMLElement>(sel)]
    .filter((el) => {
      const by = el.getAttribute("aria-labelledby");
      const named = [
        el.getAttribute("aria-label"),
        by && by.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? "").join(" "),
        el.textContent,
        [...el.querySelectorAll("img[alt]")].map((i) => i.getAttribute("alt")).join(" "),
        "labels" in el ? [...((el as HTMLInputElement).labels ?? [])].map((l) => l.textContent).join(" ") : "",
      ];
      return !named.some((n) => n && n.trim());
    })
    .map((el) => el.outerHTML.slice(0, 140));
}

// ---------- the suite ----------
describe("untrusted text renders as text (Plan 6 Task 3)", () => {
  let api: Api;
  let store: Store;
  let view: ReturnType<typeof mountReference>;
  let sim: ReturnType<typeof wireSimilar>;
  const host = () => document.body.appendChild(document.createElement("div"));

  beforeEach(async () => {
    delete (window as unknown as { __xss?: number }).__xss;
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    dropCb = [];
    api = fakeApi();
    store = createStore(library, taxonomy);
    const win: DropWin = { onDragDropEvent: async (cb) => ((dropCb = [...dropCb, cb as never]), () => {}) };
    let last: string | null = null;
    let s: ReturnType<typeof wireSimilar> | null = null;
    // As boot() wires it: the Reference view first, then wireSimilar with its SearchHandle.
    view = mountReference(document.body, api, store, { onShow: (id) => ((last = id), s?.show(id)), similar: () => s?.search() });
    await view.ready;
    s = sim = wireSimilar(document.body, api, store, win, { search: view.search, openSettings: () => {} });
    if (last) sim.show(last);
    view.show("x1");
    await settle(50);
  });
  afterEach(() => {
    sim.destroy();
    view.destroy();
    document.body.innerHTML = "";
  });

  it("the Reference view: plate, callouts, Ranked, Links, hover and the operation ink", async () => {
    document.querySelector<HTMLElement>("#boxes .box")?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    for (const t of ["#tab-ranked", "#tab-links", "#tab-callouts"]) document.querySelector<HTMLElement>(t)?.click();
    await settle(20);
    noMarkup();
    readsAsText(document.querySelector("#lab-meta")!, [CREDIT]);
    readsAsText(document.querySelector("#pane-callouts")!, [TECH, OP]);
    readsAsText(document.body, [TITLE]);
    document.querySelector<HTMLElement>("#tab-links")!.click();
    readsAsText(document.querySelector("#pane-links")!, [WHY]);
    // The bad ink never reaches data-css or a style: only DESIGN.md inks (var(--…)) do.
    const partial = document.querySelector<HTMLElement>('#boxes .box[data-i="1"]')!;
    expect(partial.style.getPropertyValue("--c").trim()).toBe("var(--ink-2)");
    expect(document.body.innerHTML).not.toContain("window.__xss=5");
    expect(unnamed(document.querySelector(".main, main, body")!)).toEqual([]);
  });

  it("search: technique and reference options, and the Looks similar group", async () => {
    const q = document.querySelector<HTMLInputElement>("#q")!;
    q.value = "img";
    q.dispatchEvent(new Event("input"));
    await settle(300);
    const list = document.querySelector("#q-results")!;
    readsAsText(list, [TECH, TITLE]);
    expect(list.querySelector('[aria-label="Looks similar"]')).not.toBeNull();
    expect(list.querySelectorAll(".sim-opt")).toHaveLength(1);
    noMarkup();
    expect(unnamed(list)).toEqual([]);
  });

  it("Looks similar: the tab's rows and a dropped image's results", async () => {
    document.querySelector<HTMLElement>("#tab-similar")!.click();
    await settle(20);
    const pane = document.querySelector("#pane-similar")!;
    readsAsText(pane, [TITLE]);
    expect(pane.querySelector("img")!.getAttribute("alt")).toBe(TITLE);
    document.elementFromPoint = () => document.querySelector("[data-similar-drop]");
    dropCb.forEach((cb) => cb({ payload: { type: "drop", paths: [FILE], position: { x: 1, y: 1 } } as never }));
    await settle(20);
    readsAsText(document.querySelector("#q-results")!, [TITLE]);
    noMarkup();
    expect(unnamed(pane)).toEqual([]);
    expect(unnamed(document.querySelector("#q-results")!)).toEqual([]);
  });

  it("the picker, with the custom technique", async () => {
    const root = host();
    const p = mountPicker(root, api, store, { refId: "x1" });
    const input = p.el.querySelector<HTMLInputElement>("input")!;
    input.value = "halo";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await settle(20);
    readsAsText(p.el, [TECH]);
    noMarkup();
    expect(unnamed(p.el)).toEqual([]);
    p.close();
  });

  it("the Inbox", async () => {
    const root = host();
    const inbox = mountInbox(root, api, store, { openPicker: () => {}, closePicker: () => {} });
    await settle(20);
    // The tile carries the title as its tooltip and its image's alt text only.
    const tile = root.querySelector<HTMLElement>('.inbox-tile[data-id="x3"]')!;
    expect(tile.title).toBe(`${INBOX_TITLE} — ${NOTE}`);
    expect(tile.querySelector("img")!.alt).toBe(INBOX_TITLE);
    noMarkup();
    expect(unnamed(root)).toEqual([]);
    inbox.destroy();
  });

  it("the link editor", async () => {
    const root = host();
    const ed = mountLinkEditor(root, api, store, { fromRef: "x1", linkId: "l1" });
    await settle(20);
    readsAsText(ed.el, [WHY]);
    expect(ed.el.querySelector<HTMLTextAreaElement>(".le-why")!.value).toBe(WHY);
    noMarkup();
    expect(unnamed(ed.el)).toEqual([]);
    ed.close();
  });

  it("Boards", async () => {
    const root = host();
    const boards = mountBoards(root, api, store, { openReference: () => {} });
    boards.show?.();
    await settle(20);
    root.querySelector<HTMLElement>('[data-board="b1"], .bd-board')?.click();
    await settle(20);
    readsAsText(root, [BOARD]);
    noMarkup();
    expect(unnamed(root)).toEqual([]);
    boards.destroy();
  });

  it("Compare", async () => {
    const root = host();
    const cmp = mountCompare(root, api, store, "x1", "x2");
    await settle(20);
    readsAsText(root, [TITLE, TECH, WHY]);
    noMarkup();
    expect(unnamed(root)).toEqual([]);
    cmp.close?.();
  });

  it("the Tree inspector, on the technique and on the reference", async () => {
    const el = host();
    const opts = { editable: true, openReference: () => {}, select: () => {}, assetUrl: (p: string) => p };
    const snap: Snapshot = { refs: store.refs, links: store.links, tax: store.tax, version: 1, taxonomyReadOnly: false, inScope: () => true };
    renderInspector(el, snap, { kind: "tech", id: "tech:halo" }, opts as never);
    readsAsText(el, [TECH, `${TECH} described`]);
    noMarkup();
    expect(unnamed(el)).toEqual([]);
    renderInspector(el, snap, { kind: "ref", id: "ref:halo:x1" }, opts as never);
    readsAsText(el, [TITLE]);
    noMarkup();
    expect(unnamed(el)).toEqual([]);
    renderInspector(el, snap, { kind: "op", id: "op:xop" }, opts as never);
    readsAsText(el, [OP]);
    noMarkup();
    expect(unnamed(el)).toEqual([]);
  });

  it("the lightbox", async () => {
    const lb = openLightbox(api, store, "x1", { openPicker: () => {} });
    await settle(50);
    const el = document.querySelector<HTMLElement>(".lightbox")!;
    // The lightbox names the reference in its labels and the image's alt text only.
    expect(el.getAttribute("aria-label")).toBe(`Lightbox: ${TITLE}`);
    expect(el.querySelector(".lb-plate img")!.getAttribute("alt")).toBe(TITLE);
    readsAsText(el, [TECH]);
    noMarkup();
    expect(unnamed(el)).toEqual([]);
    lb.close();
  });

  it("Settings shows Rust's status copy as text", async () => {
    vi.mocked(api.similarStatus).mockResolvedValue(status({ phase: "error", error: STATUS_ERROR }));
    const s = mountSettings(document.body, api);
    s.open();
    await settle(20);
    const dlg = document.querySelector('.settings[role="dialog"]')!;
    readsAsText(dlg, [STATUS_ERROR]);
    noMarkup();
    expect(unnamed(dlg)).toEqual([]);
    s.close();
  });

  it("notices: the library warning and an import summary with hostile file names", () => {
    const say = noticeIn(document);
    say(warningHTML(WARNING) + intakeHTML(
      { added: ["x3"], duplicates: [[FILE, "x1"]], skipped: [[FILE, { kind: "unreadable", detail: WARNING }]], warnings: [[FILE, WARNING]] },
      [{ existingId: "x1", title: TITLE, action: "show", fills: [] }],
    ));
    const n = document.querySelector("#import-notice")!;
    readsAsText(n, [WARNING, TITLE, `<img src=x onerror="window.__xss=7">.jpg`]);
    noMarkup();
    expect(unnamed(n)).toEqual([]);
  });

  it("About: a hostile demo credit and version (Plan 6 Task 4)", () => {
    const about = mountAbout(document.body, {
      version: TITLE,
      fonts: FONTS,
      noticesPath: FILE,
      demoCredits: demoCredits([{ title: TITLE, credit: CREDIT + NOTE, rights: WHY }]),
    }, { openNotices: async () => {} });
    const d = document.querySelector<HTMLElement>(".about")!;
    readsAsText(d, [TITLE, CREDIT + NOTE, WHY]);
    noMarkup();
    expect(unnamed(d)).toEqual([]);
    about.close();
  });

  it("Details: hostile title, creator, year and credit stay text (Plan 6 Task 3c)", () => {
    const hostile = { ...store.refs.get("x1")!, year: WHY };
    const d = openDetails(document.body, hostile, api, store);
    const dlg = document.querySelector<HTMLElement>(".details")!;
    const val = (n: string) => dlg.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${n}"]`)!.value;
    expect([val("title"), val("creator"), val("year"), val("credit")]).toEqual([TITLE, CREDIT, WHY, CREDIT]);
    noMarkup();
    expect(unnamed(dlg)).toEqual([]);
    d.close();
  });
});

