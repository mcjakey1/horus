// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Api, Reference, Scored, Tag, Taxonomy } from "../api";
import { createStore, type Store } from "../store";
import { wireUndoKeys } from "../keys";
import { makeOpenCompare } from "./view";

const tax: Taxonomy = {
  operations: [{ id: "pulse", name: "Pulse", plainLabel: "Beat", color: "rose", icon: "", description: "" }],
  domains: [{ id: "feature", name: "Feature", icon: "", description: "" }],
  branches: [{ id: "pulse.feature", operationId: "pulse", domainId: "feature" }],
  techniques: ["t1", "t2", "t3"].map((id) => ({ id, name: `Tech ${id}`, icon: "", description: "", synonyms: [], examples: [], custom: false })),
  branchTechniques: [],
};
const tag = (id: string, tech: string, region?: Tag["region"]): Tag => ({ id, operationId: "pulse", techniqueId: tech, branchId: "pulse.feature", region, suggested: false });
const ref = (id: string, tags: Tag[]): Reference => ({
  id, title: `Plate ${id}`, file: `images/${id}.jpg`, hash: id, width: 300, height: 400, addedAt: "", tags,
  thumb256: `C:\\t\\256\\${id}.jpg`, thumb1024: `C:\\t\\1024\\${id}.jpg`,
});
const A = ref("a", [tag("a1", "t1"), tag("a2", "t2", { x: 0.1, y: 0.1, w: 0.2, h: 0.2 })]);
const B = ref("b", [tag("b1", "t2"), tag("b2", "t3")]);
const scored = (score: number): Scored => ({ id: "b", score, sharedTechniques: score ? ["t2"] : [], sharedBranches: score ? ["pulse.feature"] : [] });

let store: Store, api: Api;
let open: ReturnType<typeof makeOpenCompare>;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const tick = () => new Promise((r) => setTimeout(r, 0));
const key = (k: string, el: Element = document.activeElement ?? document.body, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

beforeEach(() => {
  document.body.innerHTML = `<main id="app"></main>`;
  store = createStore({ root: "C:\\lib", references: [A, B], links: [], boards: [], warning: null, taxonomyReadOnly: false }, tax);
  api = { scorePair: vi.fn(async () => scored(0.42)), assetUrl: (p: string) => `asset://${p}` } as unknown as Api;
  open = makeOpenCompare($("#app"), api, store);
});
afterEach(() => {
  document.body.innerHTML = "";
});

describe("Compare", () => {
  it("open_compare_from_galaxy", async () => {
    open("a", "b");
    await tick();
    expect(api.scorePair).toHaveBeenCalledWith("a", "b");
    expect(document.querySelectorAll(".compare")).toHaveLength(1);
    expect(document.querySelectorAll(".compare .cmp-side, .compare .cmp-mid")).toHaveLength(3);
    open("a", "b"); // a second call replaces it: only ever one
    await tick();
    expect(document.querySelectorAll(".compare")).toHaveLength(1);
  });

  it("compare_ink_from_taxonomy", async () => {
    open("a", "b");
    await tick();
    const li = $('.cmp-shared li[data-tech="t2"]');
    expect(li.style.getPropertyValue("--t")).toBe("var(--x-rose-text)");
    expect(li.textContent).toBe("Beat › Tech t2");
    expect([...document.querySelectorAll('.cmp-side[data-side="a"] .cmp-only li')].map((l) => l.textContent)).toEqual(["Beat › Tech t1"]);
    expect($(".cmp-branches").textContent).toBe(""); // its branch has a shared technique
    expect($(".cmp-score").textContent).toBe("0.42 · related by technique");
    // hovering a technique outlines its region on the image that carries it, in its ink
    li.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    const out = $('.cmp-side[data-side="a"] .cmp-out');
    expect(out.hidden).toBe(false);
    expect(out.style.getPropertyValue("--c")).toBe("var(--x-rose)");
    expect($('.cmp-side[data-side="b"] .cmp-out').hidden).toBe(true); // b's tag is whole-image
  });

  it("x swaps the sides and v toggles the value view on both plates", async () => {
    open("a", "b");
    await tick();
    const title = (s: string) => $(`.cmp-side[data-side="${s}"] .cmp-title`).textContent;
    expect([title("a"), title("b")]).toEqual(["Plate a", "Plate b"]);
    key("x");
    expect([title("a"), title("b")]).toEqual(["Plate b", "Plate a"]);
    key("v");
    expect([...document.querySelectorAll(".cmp-tile")].map((t) => t.classList.contains("is-value"))).toEqual([true, true]);
  });

  it("Esc closes and returns focus to the opener; a call's onClose runs after", async () => {
    document.body.insertAdjacentHTML("beforeend", `<button id="opener">open</button>`);
    $("#opener").focus();
    open("a", "b");
    await tick();
    key("Escape");
    expect(document.querySelector(".compare")).toBeNull();
    expect(document.activeElement).toBe($("#opener"));
    const onClose = vi.fn();
    open("a", "b", { onClose });
    await tick();
    key("Escape");
    expect(onClose).toHaveBeenCalledWith("a");
  });

  it("a tag change asks for the score again and the latest reply wins (review I1)", async () => {
    open("a", "b");
    await tick();
    const shared = () => [...document.querySelectorAll<HTMLElement>(".cmp-shared li")].map((l) => l.dataset.tech);
    expect(shared()).toEqual(["t2"]);
    // A gains t3 (say, tagged in the lightbox); the second reply differs from the first.
    let late!: (s: Scored) => void;
    vi.mocked(api.scorePair)
      .mockImplementationOnce(() => new Promise<Scored>((r) => (late = r))) // slow, and then superseded
      .mockResolvedValueOnce({ id: "b", score: 0.9, sharedTechniques: ["t2", "t3"], sharedBranches: [] });
    const A2 = { ...A, tags: [...A.tags, tag("a3", "t3")] };
    store.apply({ references: [A2], removed: [], canUndo: true, canRedo: false });
    expect(shared()).toEqual(["t2", "t3"]); // the local intersection while the reply is out: nothing vanishes
    expect($('.cmp-side[data-side="b"] .cmp-only').textContent).toBe("");
    store.apply({ references: [A2], removed: [], canUndo: true, canRedo: false }); // a second change
    await tick();
    expect(api.scorePair).toHaveBeenCalledTimes(3);
    expect(shared()).toEqual(["t2", "t3"]);
    expect($(".cmp-score").textContent).toBe("0.90 · related by technique");
    late(scored(0.1)); // the superseded reply lands last: ignored
    await tick();
    expect($(".cmp-score").textContent).toBe("0.90 · related by technique");
  });

  it("is a modal dialog that keeps Tab inside", async () => {
    open("a", "b");
    await tick();
    const dlg = $(".compare");
    expect([dlg.getAttribute("role"), dlg.getAttribute("aria-modal")]).toEqual(["dialog", "true"]);
    const close = $<HTMLButtonElement>(".cmp-close");
    const first = dlg.querySelector<HTMLElement>("button")!;
    expect(first).not.toBe(close);
    first.focus();
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    first.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close); // wrapped to the last control
    const on = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    close.dispatchEvent(on);
    expect(on.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first); // and round to the first
  });

  // ---------- final review fix wave ----------
  it("a store event leaves focus in the docked link editor (I3a)", async () => {
    open("a", "b");
    await tick();
    $<HTMLButtonElement>(".cmp-link-btn").click();
    const why = $<HTMLTextAreaElement>(".compare .link-editor .le-why");
    why.focus();
    store.apply({ references: [A], removed: [], canUndo: true, canRedo: false }); // a background change
    expect(document.activeElement).toBe(why);
    key("x", why); // typed into the note: no swap
    expect($('.cmp-side[data-side="a"] .cmp-title').textContent).toBe("Plate a");
  });

  it("keys aimed at <body> reach Compare: Esc closes, Ctrl+Z undoes once (I3b)", async () => {
    vi.mocked(api.scorePair).mockResolvedValue(scored(0.42));
    (api as unknown as { undo: unknown }).undo = vi.fn(async () => ({ references: [], removed: [], canUndo: false, canRedo: true }));
    const unwire = wireUndoKeys(document, api, store, () => {});
    open("a", "b");
    await tick();
    (document.activeElement as HTMLElement).blur(); // e.g. a notice's Dismiss removed the focused control
    expect(document.activeElement).toBe(document.body);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true, cancelable: true }));
    await tick();
    expect(api.undo).toHaveBeenCalledTimes(1);
    expect(document.querySelector(".compare")).not.toBeNull();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(document.querySelector(".compare")).toBeNull();
    unwire();
  });

  it("after saving a link from the docked editor, Esc still closes Compare (I3)", async () => {
    (api as unknown as { addLink: unknown }).addLink = vi.fn(async () => ({
      references: [], removed: [], canUndo: true, canRedo: false, created: "l9",
      links: [{ id: "l9", fromRef: "a", toRef: "b", why: "Same light" }],
    }));
    open("a", "b");
    await tick();
    $<HTMLButtonElement>(".cmp-link-btn").click();
    const why = $<HTMLTextAreaElement>(".compare .link-editor .le-why");
    why.value = "Same light";
    why.dispatchEvent(new Event("input", { bubbles: true }));
    $<HTMLButtonElement>(".compare .le-save").click();
    await tick();
    expect(api.addLink).toHaveBeenCalled();
    const target = document.activeElement && document.activeElement !== document.body ? document.activeElement : document.body;
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    expect(document.querySelector(".compare")).toBeNull();
  });

  it("is named after both references, in side order (I4)", async () => {
    open("a", "b");
    await tick();
    expect($(".compare").getAttribute("aria-label")).toBe("Compare Plate a and Plate b");
    key("x");
    expect($(".compare").getAttribute("aria-label")).toBe("Compare Plate b and Plate a");
  });

  it("plates and outlines are placed in % of the tile (I5)", async () => {
    open("a", "b");
    await tick();
    $('.cmp-shared li[data-tech="t2"]').dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    for (const sel of ['.cmp-side[data-side="a"] .cmp-plate', '.cmp-side[data-side="a"] .cmp-out']) {
      const s = $(sel).style;
      for (const k of ["left", "top", "width", "height"] as const) expect(s[k]).toMatch(/%$/);
    }
  });

  it("the value view starts as the artist was looking (M7)", async () => {
    document.body.classList.add("value");
    open("a", "b");
    await tick();
    expect([...document.querySelectorAll(".cmp-tile")].every((t) => t.classList.contains("is-value"))).toBe(true);
    document.body.classList.remove("value");
  });

  it("a link between them shows its why above Shared; a 0 score is not related", async () => {
    store.apply({ references: [], removed: [], canUndo: true, canRedo: false, links: [{ id: "l1", fromRef: "b", toRef: "a", why: "Same harbour light" }] });
    vi.mocked(api.scorePair).mockResolvedValueOnce(scored(0));
    open("a", "b");
    await tick();
    const link = $(".cmp-link");
    expect(link.hidden).toBe(false);
    expect(link.textContent).toBe("Linked by you: “Same harbour light”");
    expect(link.compareDocumentPosition($(".cmp-shared")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect($(".cmp-score").textContent).toBe("not related by technique");
  });
});
