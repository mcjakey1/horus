// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api, Change, Reference, Tag, Taxonomy } from "../api";
import seedJson from "../../src-tauri/resources/taxonomy.json";
import { createStore } from "../store";
import type { PickerOpts } from "../tagging/picker";
import { dockPicker, mountInbox } from "./view";

const seed = seedJson as unknown as Taxonomy;
const none: Change = { references: [], removed: [], canUndo: true, canRedo: false };
const partial = (id: string): Tag => ({ id, operationId: "infer", suggested: false });
const ref = (id: string, tags: Tag[] = [], extra: Partial<Reference> = {}): Reference => ({
  id,
  title: `Plate ${id}`,
  file: `images/${id}.jpg`,
  hash: id,
  width: 300,
  height: 400,
  addedAt: "2026-11-25T00:00:00Z",
  tags,
  thumb256: `C:\\lib\\${id}.jpg`,
  thumb1024: "",
  ...extra,
});
const fakeApi = () =>
  ({
    addTags: vi.fn(async () => none),
    updateTag: vi.fn(async () => none),
    removeTag: vi.fn(async () => none),
    addTechnique: vi.fn(async () => none),
    demoExamples: vi.fn(async () => []),
    assetUrl: (p: string) => `asset://${encodeURIComponent(p)}`,
  }) as unknown as Api;

let off = () => {};
function setup(refs: Reference[]) {
  document.body.innerHTML = `<span id="inbox-count">0</span><section id="inbox"></section>`;
  const api = fakeApi();
  const store = createStore({ root: "C:\\lib", references: refs, links: [], warning: null, taxonomyReadOnly: false }, seed);
  const root = document.getElementById("inbox")!;
  let dock!: ReturnType<typeof dockPicker>;
  const openPicker = vi.fn((o: PickerOpts) => dock(o));
  const inbox = mountInbox(root, api, store, { openPicker });
  dock = dockPicker(root.querySelector<HTMLElement>(".inbox-dock")!, api, store);
  off = () => (dock.close(), inbox.destroy());
  return { api, store, root, inbox, openPicker, dock };
}
afterEach(() => {
  off();
  document.body.innerHTML = "";
});

const tiles = () => [...document.querySelectorAll<HTMLElement>(".inbox-tile")];
const ids = () => tiles().map((t) => t.dataset.id);
const cur = () => document.querySelector<HTMLElement>(".inbox-tile.is-cur")?.dataset.id;
const picker = () => document.querySelector<HTMLElement>(".inbox-dock .picker");
const key = (t: Element, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  t.dispatchEvent(e);
  return e;
};

describe("Inbox", () => {
  it("shows the untagged references only, and the badge counts them", () => {
    setup([ref("a"), ref("b"), ref("c"), ref("d", [partial("d1")])]);
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(document.getElementById("inbox-count")!.textContent).toBe("3");
    const img = tiles()[0].querySelector("img")!;
    expect([img.getAttribute("loading"), img.getAttribute("decoding")]).toEqual(["lazy", "async"]);
    expect(img.getAttribute("src")).toBe(`asset://${encodeURIComponent("C:\\lib\\a.jpg")}`);
  });

  it("selecting an item docks the picker for it, in Inbox mode", () => {
    const { openPicker } = setup([ref("a"), ref("b")]);
    tiles()[1].click();
    expect(openPicker).toHaveBeenLastCalledWith({ refId: "b", inbox: true });
    expect(picker()?.dataset.ref).toBe("b");
    expect(cur()).toBe("b");
  });

  it("a tagged item stays, marked tagged, until the artist moves on (Review Focus 3)", () => {
    const { store, inbox } = setup([ref("a"), ref("b"), ref("c")]);
    inbox.focus(1);
    store.apply({ ...none, references: [ref("b", [partial("b1")])] });
    expect(ids()).toEqual(["a", "b", "c"]);
    expect(tiles()[1].classList.contains("is-tagged")).toBe(true);
    expect(tiles()[1].textContent).toContain("tagged");
    expect(document.getElementById("inbox-count")!.textContent).toBe("2");
    key(document.activeElement!, "ArrowRight");
    expect(ids()).toEqual(["a", "c"]);
    expect(cur()).toBe("c");
    expect(picker()?.dataset.ref).toBe("c");
  });

  it("→ on the last item stays put and never wraps", () => {
    const { store, inbox, openPicker } = setup([ref("a"), ref("b")]);
    inbox.focus(1);
    store.apply({ ...none, references: [ref("b", [partial("b1")])] }); // the last one gets tagged
    const calls = openPicker.mock.calls.length;
    expect(() => key(document.activeElement!, "ArrowRight")).not.toThrow();
    expect(cur()).toBe("b");
    expect(openPicker.mock.calls.length).toBe(calls);
    key(document.activeElement!, "ArrowLeft");
    expect(cur()).toBe("a");
  });

  it("the empty copy shows only when the derived list is empty", () => {
    const { store } = setup([ref("a", [partial("a1")])]);
    const empty = document.querySelector<HTMLElement>(".inbox-empty")!;
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toBe("Inbox is empty. Drop, paste or open a folder to add references.");
    store.apply({ ...none, references: [ref("n")] });
    expect(empty.hidden).toBe(true);
    expect(ids()).toEqual(["n"]);
  });

  it("with the picker docked: → on a card moves to the next item, ↓ to the next card, → in the search moves the caret", () => {
    const { inbox } = setup([ref("a"), ref("b"), ref("c")]);
    inbox.focus(0);
    const p = picker()!;
    key(p.querySelector(".pk-ops")!, "1");
    p.querySelector<HTMLElement>(".pk-card[data-tech]")!.focus(); // the picker repaints it as highlighted
    expect(key(document.activeElement!, "ArrowDown").defaultPrevented).toBe(true);
    const hi = () => picker()!.querySelector<HTMLElement>(".pk-card.is-hi")?.dataset.tech;
    const cards = [...p.querySelectorAll<HTMLElement>(".pk-card[data-tech]")].map((c) => c.dataset.tech);
    expect(hi()).toBe(cards[1]);
    expect(cur()).toBe("a");
    key(document.activeElement!, "ArrowRight");
    expect(cur()).toBe("b");
    expect(picker()!.dataset.ref).toBe("b");
    const search = picker()!.querySelector<HTMLInputElement>(".pk-search")!;
    search.focus();
    expect(key(search, "ArrowRight").defaultPrevented).toBe(false);
    expect(cur()).toBe("b");
  });

  it("the keyboard flow 1, type, Enter, → advances to the next item (Task 12 item 3)", async () => {
    const { inbox, api } = setup([ref("a"), ref("b"), ref("c")]);
    inbox.focus(0);
    key(picker()!.querySelector(".pk-ops")!, "1");
    const search = picker()!.querySelector<HTMLInputElement>(".pk-search")!;
    search.focus();
    search.value = "moody";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    key(search, "Enter");
    expect(api.addTags).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0)); // the tag lands
    expect(picker()!.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).not.toBe(search); // off the text field, so → is the Inbox's again
    key(document.activeElement!, "ArrowRight");
    expect(cur()).toBe("b");
    expect(picker()!.dataset.ref).toBe("b");
  });

  it("modified arrows and arrows on a domain radio are not Inbox moves", () => {
    const { inbox } = setup([ref("a"), ref("b")]);
    inbox.focus(0);
    key(document.activeElement!, "ArrowRight", { altKey: true });
    expect(cur()).toBe("a");
    const radio = document.createElement("input");
    radio.type = "radio";
    picker()!.append(radio);
    key(radio, "ArrowRight");
    expect(cur()).toBe("a");
  });

  it("typed_text_is_text: a note and a title are text in the tile, never markup", () => {
    delete (window as { __xss?: number }).__xss;
    const note = `<img src=x onerror="window.__xss=1">`;
    setup([ref("a", [], { title: "<b>t</b>", note })]);
    const t = tiles()[0];
    expect(t.title).toContain(note);
    expect(t.title).toContain("<b>t</b>");
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(document.querySelector("#inbox b")).toBeNull();
    expect((window as { __xss?: number }).__xss).toBeUndefined();
  });

  it("a remembered Tag-like-this preset survives refocusing until the item is tagged (AGY fix)", () => {
    const { store, inbox, dock } = setup([ref("a"), ref("b")]);
    const preset = [{ operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.feature" }];
    dock.remember("b", preset);
    const ticked = () => [...picker()!.querySelectorAll<HTMLElement>(".pk-card.is-ticked")].map((c) => c.dataset.tech);
    inbox.focus(0); // what switching to the Inbox does first
    inbox.focus(1);
    expect(ticked()).toEqual(["chiaroscuro"]);
    inbox.focus(1); // focusing it again keeps the preset
    expect(ticked()).toEqual(["chiaroscuro"]);
    store.apply({ ...none, references: [ref("b", [partial("b1")])] }); // tagged: the preset is spent
    store.apply({ ...none, references: [ref("b")] }); // undone: back in the Inbox, untagged
    inbox.focus(1);
    expect(ticked()).toEqual([]);
  });

  it("a library switch clears the current item, and dock.close() tears the picker down (AGY fix)", () => {
    const { store, inbox, dock } = setup([ref("a"), ref("b")]);
    inbox.focus(1);
    store.reset({ root: "D:\other", references: [ref("a"), ref("b")], links: [], warning: null, taxonomyReadOnly: false }, seed);
    expect(cur()).toBeUndefined();
    inbox.focus(0);
    expect(picker()).not.toBeNull();
    dock.close();
    expect(picker()).toBeNull();
  });

  it("an item removed by undo leaves the list, and the picker closes", () => {
    const { store, inbox } = setup([ref("a"), ref("b")]);
    inbox.focus(0);
    store.apply({ ...none, removed: ["a"] });
    expect(ids()).toEqual(["b"]);
    expect(picker()).toBeNull();
  });
});
