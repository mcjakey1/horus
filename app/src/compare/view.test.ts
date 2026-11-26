// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Api, Reference, Scored, Tag, Taxonomy } from "../api";
import { createStore, type Store } from "../store";
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

let store: Store, api: Api, showReference: ReturnType<typeof vi.fn<(id: string) => void>>;
let open: ReturnType<typeof makeOpenCompare>;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const tick = () => new Promise((r) => setTimeout(r, 0));
const key = (k: string, el: Element = document.activeElement ?? document.body, init: KeyboardEventInit = {}) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));

beforeEach(() => {
  document.body.innerHTML = `<main id="app"></main>`;
  store = createStore({ root: "C:\\lib", references: [A, B], links: [], boards: [], warning: null, taxonomyReadOnly: false }, tax);
  api = { scorePair: vi.fn(async () => scored(0.42)), assetUrl: (p: string) => `asset://${p}` } as unknown as Api;
  showReference = vi.fn<(id: string) => void>();
  open = makeOpenCompare($("#app"), api, store, { showReference });
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

  it("Esc returns through the call's onClose, else to the Reference view", async () => {
    open("a", "b");
    await tick();
    key("Escape");
    expect(document.querySelector(".compare")).toBeNull();
    expect(showReference).toHaveBeenCalledWith("a");
    const onClose = vi.fn();
    open("a", "b", { onClose });
    await tick();
    key("Escape");
    expect(onClose).toHaveBeenCalledWith("a");
    expect(showReference).toHaveBeenCalledTimes(1);
  });

  it("is a modal dialog that keeps Tab inside", async () => {
    open("a", "b");
    await tick();
    const dlg = $(".compare");
    expect([dlg.getAttribute("role"), dlg.getAttribute("aria-modal")]).toEqual(["dialog", "true"]);
    const close = $<HTMLButtonElement>(".cmp-close");
    close.focus();
    const first = dlg.querySelector<HTMLElement>("button")!;
    first.focus();
    key("Tab", first, { shiftKey: true });
    expect(dlg.contains(document.activeElement)).toBe(true);
    close.focus();
    key("Tab", close);
    expect(dlg.contains(document.activeElement)).toBe(true);
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
