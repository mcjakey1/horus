// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api, LibraryView, Taxonomy } from "./api";
import { mountLibraryMenu } from "./library-menu";
import { createStore } from "./store";

const tax: Taxonomy = { operations: [], domains: [], branches: [], techniques: [], branchTechniques: [] };
const view = (root: string): LibraryView => ({ root, references: [], links: [], warning: null, taxonomyReadOnly: false });

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
});
