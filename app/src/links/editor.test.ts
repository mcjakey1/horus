// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Api, Change, LibraryView, Link, Reference, Scored, Taxonomy } from "../api";
import { createStore, type Store } from "../store";
import { linkedFirst, linkErrorCopy, mountLinkEditor } from "./editor";

const ref = (id: string, title: string, note?: string): Reference => ({
  id,
  title,
  note,
  file: `${id}.jpg`,
  hash: id,
  width: 300,
  height: 400,
  addedAt: "2026-11-26T00:00:00Z",
  tags: [],
  thumb256: `t/${id}.jpg`,
  thumb1024: `T/${id}.jpg`,
});
const taxonomy: Taxonomy = { operations: [], domains: [], branches: [], techniques: [], branchTechniques: [] };
const sc = (id: string, score: number): Scored => ({ id, score, sharedTechniques: [], sharedBranches: [] });
const link = (id: string, fromRef: string, toRef: string, why = "x"): Link => ({ id, fromRef, toRef, why });

describe("linkedFirst", () => {
  it("puts linked references first with their score, and removes them from the rest", () => {
    const out = linkedFirst([sc("B", 0.6), sc("C", 0.4)], [link("L", "A", "C")], "A");
    expect(out.linked).toEqual([{ link: link("L", "A", "C"), other: "C", score: 0.4 }]);
    expect(out.rest.map((x) => x.id)).toEqual(["B"]);
  });

  it("keeps a link to an unrelated reference, with no score", () => {
    const out = linkedFirst([sc("B", 0.6)], [link("L", "D", "A")], "A");
    expect(out.linked).toEqual([{ link: link("L", "D", "A"), other: "D", score: undefined }]);
    expect(out.rest.map((x) => x.id)).toEqual(["B"]);
  });

  it("keeps the links' order and never changes a score", () => {
    const related = [sc("B", 0.6), sc("C", 0.4)];
    const out = linkedFirst(related, [link("L2", "A", "B"), link("L1", "C", "A")], "A");
    expect(out.linked.map((x) => [x.other, x.score])).toEqual([["B", 0.6], ["C", 0.4]]);
    expect(related).toEqual([sc("B", 0.6), sc("C", 0.4)]);
  });
});

describe("linkErrorCopy", () => {
  it("maps every wire code to copy, never raw text", () => {
    expect(linkErrorCopy("SelfLink")).toBe("A reference can't link to itself.");
    expect(linkErrorCopy("EmptyWhy")).toBe("Say why these are connected.");
    expect(linkErrorCopy("DuplicateLink:L1")).toBe("These two are already linked — edit the note instead.");
    expect(linkErrorCopy("UnknownReference:zz")).toBe("That change didn't save. Try again.");
    expect(linkErrorCopy(new Error("os error 5"))).toBe("That change didn't save. Try again.");
  });
});

describe("mountLinkEditor", () => {
  let api: Api;
  let store: Store;
  let host: HTMLElement;
  const changed: Change = { references: [], removed: [], canUndo: true, canRedo: false, links: [] };
  beforeEach(() => {
    document.body.innerHTML = `<div id="host"></div>`;
    host = document.getElementById("host")!;
    const view: LibraryView = {
      root: "C:\\lib",
      references: [ref("A", "Harbour"), ref("B", "Pier"), ref("C", "Gulls", "raking light at dusk"), ref("D", "Dock")],
      links: [link("L0", "D", "A", "both wet")],
      boards: [],
      warning: null,
      taxonomyReadOnly: false,
    };
    store = createStore(view, taxonomy);
    api = {
      addLink: vi.fn(async () => ({ ...changed, links: [...store.links, link("L9", "A", "B", "same raking light")] })),
      updateLink: vi.fn(async () => changed),
    } as unknown as Api;
  });
  afterEach(() => (document.body.innerHTML = ""));

  const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
  const type = (el: HTMLInputElement | HTMLTextAreaElement, v: string) => {
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it("keeps Save disabled for whitespace", () => {
    mountLinkEditor(host, api, store, { fromRef: "A", toRef: "B" });
    const save = $<HTMLButtonElement>(".le-save");
    expect(save.disabled).toBe(true);
    type($(".le-why"), "   ");
    expect(save.disabled).toBe(true);
    type($(".le-why"), "same raking light");
    expect(save.disabled).toBe(false);
  });

  it("saves through addLink and applies the Change", async () => {
    const ed = mountLinkEditor(host, api, store, { fromRef: "A", toRef: "B" });
    type($(".le-why"), "same raking light");
    $<HTMLButtonElement>(".le-save").click();
    await flush();
    expect(api.addLink).toHaveBeenCalledWith("A", "B", "same raking light");
    expect(store.links.map((l) => l.id)).toContain("L9");
    expect(document.querySelector(".link-editor")).toBeNull(); // closed after a save
    ed.close(); // a second close is harmless
  });

  it("switches to the existing link on DuplicateLink, keeping the typed text", async () => {
    api.addLink = vi.fn(async () => Promise.reject("DuplicateLink:L1"));
    store.apply({ ...changed, links: [link("L1", "B", "A", "first note")] });
    mountLinkEditor(host, api, store, { fromRef: "A", toRef: "B" });
    type($(".le-why"), "same raking light");
    $<HTMLButtonElement>(".le-save").click();
    await flush();
    expect($(".le-msg").textContent).toBe("These two are already linked — edit the note instead.");
    expect($<HTMLTextAreaElement>(".le-why").value).toBe("same raking light");
    expect($(".link-editor").dataset.linkId).toBe("L1");
    expect($(".le-current").textContent).toContain("first note");
    // Saving again now edits L1.
    $<HTMLButtonElement>(".le-save").click();
    await flush();
    expect(api.updateLink).toHaveBeenCalledWith("L1", "same raking light");
  });

  it("shows mapped copy for other codes and stays open", async () => {
    api.addLink = vi.fn(async () => Promise.reject("SelfLink"));
    mountLinkEditor(host, api, store, { fromRef: "A", toRef: "B" });
    type($(".le-why"), "x");
    $<HTMLButtonElement>(".le-save").click();
    await flush();
    expect($(".le-msg").textContent).toBe("A reference can't link to itself.");
    expect(document.querySelector(".link-editor")).not.toBeNull();
  });

  it("edits an existing link: the note is prefilled and Save calls updateLink", async () => {
    mountLinkEditor(host, api, store, { fromRef: "A", linkId: "L0" });
    expect($<HTMLTextAreaElement>(".le-why").value).toBe("both wet");
    expect($(".link-editor").textContent).toContain("Dock");
    type($(".le-why"), "both wet, both grey");
    $<HTMLButtonElement>(".le-save").click();
    await flush();
    expect(api.updateLink).toHaveBeenCalledWith("L0", "both wet, both grey");
  });

  it("the combobox omits the focus and references already linked to it", () => {
    mountLinkEditor(host, api, store, { fromRef: "A" });
    const titles = () => [...document.querySelectorAll(".le-opts [role=option]")].map((o) => o.textContent);
    expect(titles()).toEqual(["Pier", "Gulls"]); // not Harbour (A), not Dock (linked)
    type($(".le-q"), "raking"); // matches C's note
    expect(titles()).toEqual(["Gulls"]);
  });

  it("the combobox works with arrows and Enter, then Save needs a why", () => {
    mountLinkEditor(host, api, store, { fromRef: "A" });
    const q = $<HTMLInputElement>(".le-q");
    expect($<HTMLButtonElement>(".le-save").disabled).toBe(true);
    q.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    expect(q.getAttribute("aria-activedescendant")).toBe(document.querySelectorAll(".le-opts [role=option]")[1].id);
    q.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect($(".le-to").textContent).toContain("Gulls");
    type($(".le-why"), "dusk");
    expect($<HTMLButtonElement>(".le-save").disabled).toBe(false);
  });

  it("ignores Enter while an IME is composing", () => {
    mountLinkEditor(host, api, store, { fromRef: "A" });
    $(".le-q").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }));
    expect(document.querySelector(".le-to")).toBeNull();
  });

  it("Esc closes the editor", () => {
    mountLinkEditor(host, api, store, { fromRef: "A", toRef: "B" });
    $(".le-why").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".link-editor")).toBeNull();
  });
});
