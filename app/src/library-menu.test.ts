// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api, ImportResult, LibraryView, Reference, Taxonomy } from "./api";
import { noticeIn } from "./importer";
import { wireIntake } from "./intake";
import { mountLibraryMenu } from "./library-menu";
import { createStore } from "./store";

const tax: Taxonomy = { operations: [], domains: [], branches: [], techniques: [], branchTechniques: [] };
const view = (root: string): LibraryView => ({ root, references: [], links: [], boards: [], warning: null, taxonomyReadOnly: false });

function setup() {
  document.body.innerHTML = `<header><button id="library-menu">Library</button></header>`;
  const api = {
    pickFolder: vi.fn(async () => "D:/B" as string | null),
    openLibrary: vi.fn(async (p: string) => view(p)),
    createLibrary: vi.fn(async (p: string) => view(p)),
    getTaxonomy: vi.fn(async () => tax),
  } as unknown as Api;
  const store = createStore(view("D:/A"), tax);
  const reset = vi.spyOn(store, "reset");
  const notice = vi.fn();
  const btn = document.getElementById("library-menu")!;
  const menu = mountLibraryMenu(btn, api, store, notice);
  const item = (k: string) => document.querySelector<HTMLButtonElement>(`[data-lib="${k}"]`)!;
  return { api, store, reset, notice, btn, menu, item };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => (document.body.innerHTML = ""));

describe("Library menu", () => {
  it("opens as a menu from its button", () => {
    const { btn, menu } = setup();
    const m = document.querySelector<HTMLElement>(".lib-menu")!;
    expect(m.hidden).toBe(true);
    btn.click();
    expect(m.hidden).toBe(false);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    m.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(m.hidden).toBe(true);
    menu.destroy();
  });

  it("Open library… opens the picked folder and resets the store", async () => {
    const { api, store, reset, btn, item } = setup();
    btn.click();
    item("open").click();
    await flush();
    expect(api.pickFolder).toHaveBeenCalledWith("Open a Horus library");
    expect(api.openLibrary).toHaveBeenCalledWith("D:/B");
    expect(reset).toHaveBeenCalledTimes(1);
    expect(store.root).toBe("D:/B");
  });

  it("a cancelled picker calls nothing", async () => {
    const { api, reset, btn, item } = setup();
    vi.mocked(api.pickFolder).mockResolvedValueOnce(null);
    btn.click();
    item("open").click();
    await flush();
    expect(api.openLibrary).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it("a refusal shows its message and keeps the library open", async () => {
    const { api, store, reset, notice, btn, item } = setup();
    vi.mocked(api.openLibrary).mockRejectedValueOnce("Couldn't save the current library: <disk full>");
    btn.click();
    item("open").click();
    await flush();
    expect(reset).not.toHaveBeenCalled();
    expect(store.root).toBe("D:/A");
    expect(notice).toHaveBeenCalledTimes(1);
    const shown = document.createElement("div");
    shown.innerHTML = vi.mocked(notice).mock.calls[0][0];
    expect(shown.textContent).toContain("Couldn't save the current library: <disk full>");
    expect(shown.querySelector("disk")).toBeNull();
  });

  it("New library…, with the demo box unticked, creates without the demo set", async () => {
    const { api, store, btn, item } = setup();
    vi.mocked(api.pickFolder).mockResolvedValueOnce("D:/C");
    btn.click();
    item("new").click();
    await flush();
    expect(api.pickFolder).toHaveBeenCalledWith("Choose a folder for the new library");
    const form = document.querySelector<HTMLFormElement>(".lib-new")!;
    expect(form.hidden).toBe(false);
    const demo = form.querySelector<HTMLInputElement>('input[name="demo"]')!;
    expect(demo.checked).toBe(false);
    expect(form.textContent).toContain("Start with the demo set");
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(api.createLibrary).toHaveBeenCalledWith("D:/C", false);
    expect(store.root).toBe("D:/C");
  });

  it("a paste queued behind an import lands in the old library before a switch (I3)", async () => {
    document.body.innerHTML = `<header><button id="library-menu">Library</button></header>
      <aside id="import-notice" hidden><div data-body></div></aside>`;
    const order: string[] = [];
    const pasted = (id: string): ImportResult => ({
      report: { added: [id], duplicates: [], skipped: [] },
      change: { references: [{ id, title: id, file: "", hash: id, width: 1, height: 1, addedAt: "", tags: [], thumb256: "", thumb1024: "" } as Reference], removed: [], canUndo: true, canRedo: false },
    });
    let finish!: (r: ImportResult) => void;
    const api = {
      importBytes: vi
        .fn()
        .mockImplementationOnce(() => new Promise<ImportResult>((r) => (finish = r)))
        .mockImplementationOnce(async () => (order.push("paste p2"), pasted("p2"))),
      pickFolder: vi.fn(async () => "D:/B"),
      openLibrary: vi.fn(async (p: string) => (order.push("open"), view(p))),
      createLibrary: vi.fn(async (p: string) => (order.push("create"), view(p))),
      getTaxonomy: vi.fn(async () => tax),
      intakeBusy: vi.fn(async () => {}),
    } as unknown as Api;
    const store = createStore(view("D:/A"), tax);
    const notice = noticeIn(document.body);
    const intake = wireIntake(null, document, { api, store, notice, openPicker: () => {} });
    const btn = document.getElementById("library-menu")!;
    mountLibraryMenu(btn, api, store, notice, intake.idle);
    const png = (n: string) => new File([new Uint8Array([1])], n, { type: "image/png" });
    for (const n of ["one.png", "two.png"]) {
      const e = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(e, "clipboardData", {
        value: { items: [{ kind: "file", type: "image/png", getAsFile: () => png(n) }], getData: () => "" },
      });
      document.dispatchEvent(e);
    }
    btn.click();
    document.querySelector<HTMLButtonElement>('[data-lib="open"]')!.click();
    for (let i = 0; i < 4; i++) await flush();
    expect(api.openLibrary).not.toHaveBeenCalled(); // the switch waits for the queued intake
    order.push("paste p1 done");
    finish(pasted("p1"));
    for (let i = 0; i < 6; i++) await flush();
    expect(order).toEqual(["paste p1 done", "paste p2", "open"]);
    expect(store.root).toBe("D:/B");
    intake();
  });
});
