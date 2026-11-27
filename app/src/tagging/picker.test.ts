// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api, Change, DemoExample, NewTag, Reference, Tag, Taxonomy } from "../api";
import seedJson from "../../src-tauri/resources/taxonomy.json";
import { createStore } from "../store";
import { techniquesFor } from "./model";
import { mountPicker, type PickerOpts } from "./picker";

const seed = seedJson as unknown as Taxonomy;
const none: Change = { references: [], removed: [], canUndo: true, canRedo: false };

const tag = (id: string, operationId: string, techniqueId?: string, branchId?: string, suggested = false): Tag => ({
  id,
  operationId,
  techniqueId,
  branchId,
  suggested,
});
const ref = (id: string, tags: Tag[] = []): Reference => ({
  id,
  title: id,
  file: `images/${id}.jpg`,
  hash: id,
  width: 1,
  height: 1,
  addedAt: "2026-11-25T00:00:00Z",
  tags,
  thumb256: `C:\\lib\\thumbs\\${id}.jpg`,
  thumb1024: "",
});

function fakeApi(demo: DemoExample[] = []): Api {
  return {
    addTags: vi.fn(async () => none),
    updateTag: vi.fn(async () => none),
    removeTag: vi.fn(async () => none),
    addTechnique: vi.fn(async () => ({ ...none, created: "halo-glow" })),
    demoExamples: vi.fn(async () => demo),
    assetUrl: (p: string) => `asset://${encodeURIComponent(p)}`,
  } as unknown as Api;
}

/** Operations only: n of them, ids op1…opN. */
const opsTax = (n: number): Taxonomy => ({
  operations: Array.from({ length: n }, (_, i) => ({
    id: `op${i + 1}`,
    name: `Op${i + 1}`,
    plainLabel: `Label ${i + 1}`,
    icon: "",
    description: "",
  })),
  domains: [],
  branches: [],
  techniques: [],
  branchTechniques: [],
});

/** The seed plus a new domain "texture", a Differentiate branch to it, and Chiaroscuro under it too. */
const withTexture = (): Taxonomy => ({
  ...seed,
  domains: [...seed.domains, { id: "texture", name: "Texture", icon: "", description: "" }],
  branches: [...seed.branches, { id: "differentiate.texture", operationId: "differentiate", domainId: "texture" }],
  branchTechniques: [...seed.branchTechniques, { branchId: "differentiate.texture", techniqueId: "chiaroscuro" }],
});

let pickers: { close(): void }[] = [];
function mount(
  opts: Partial<PickerOpts> = {},
  { tax = seed, refs = [ref("r")], api = fakeApi(), readOnly = false } = {},
) {
  document.body.innerHTML = `<div id="host"></div>`;
  const store = createStore({ root: "C:\\lib", references: refs, links: [], boards: [], warning: null, taxonomyReadOnly: readOnly }, tax);
  const p = mountPicker(document.getElementById("host")!, api, store, { refId: "r", ...opts });
  pickers.push(p);
  return { p, api, store, el: p.el };
}
afterEach(() => {
  pickers.forEach((p) => p.close());
  pickers = [];
  document.body.innerHTML = "";
});

const key = (target: Element, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};
const search = (el: HTMLElement) => el.querySelector<HTMLInputElement>(".pk-search")!;
const type = (el: HTMLElement, q: string) => {
  const s = search(el);
  s.focus();
  s.value = q;
  s.dispatchEvent(new Event("input", { bubbles: true }));
};
const ops = (el: HTMLElement) => [...el.querySelectorAll<HTMLButtonElement>(".pk-op")];
const row = (el: HTMLElement) => el.querySelector<HTMLElement>(".pk-ops")!;
const chosen = (el: HTMLElement) => el.querySelector<HTMLElement>('.pk-op[aria-pressed="true"]')?.dataset.op;
const cards = (el: HTMLElement) => [...el.querySelectorAll<HTMLElement>(".pk-card[data-tech]")].map((c) => c.dataset.tech);
const hi = (el: HTMLElement) => el.querySelector<HTMLElement>(".pk-card.is-hi");
const newCard = (el: HTMLElement) => el.querySelector<HTMLElement>(".pk-card.pk-new");
const flush = () => new Promise((r) => setTimeout(r, 0));
const sent = (api: Api) => vi.mocked(api.addTags).mock.calls;

describe("technique picker", () => {
  it("each technique card draws its glyph, named by the icon description (Plan 6)", () => {
    const { el } = mount();
    key(row(el), "1"); // an operation's techniques show as cards
    const card = el.querySelector<HTMLElement>(".pk-card[data-tech]")!;
    const t = seed.techniques.find((x) => x.id === card.dataset.tech)!;
    const icon = card.querySelector<HTMLElement>(".pk-icon")!;
    expect(icon.querySelector("svg")).not.toBeNull();
    expect(icon.getAttribute("role")).toBe("img");
    expect(icon.getAttribute("aria-label")).toBe(t.icon);
    expect(icon.textContent).toBe("");
  });

  it("the technique grid is a listbox only while it holds options (QA F1)", () => {
    const { el } = mount();
    const grid = el.querySelector<HTMLElement>(".pk-grid")!;
    expect(grid.hasAttribute("role")).toBe(false); // "Choose an operation…" is no option
    key(row(el), "1");
    expect(grid.getAttribute("role")).toBe("listbox");
    expect(grid.getAttribute("aria-label")).toBe("Techniques");
    expect(grid.querySelector('[role="option"]')).not.toBeNull();
  });

  it("seed_buttons: plain labels in taxonomy order, and 2 selects Group", () => {
    const { el } = mount();
    expect(ops(el).map((b) => b.querySelector(".serif")!.textContent)).toEqual([
      "Stand out",
      "Hold together",
      "Lead the eye",
      "Make them think",
    ]);
    expect(ops(el).map((b) => b.querySelector(".pk-opname")!.textContent)).toEqual(["Differentiate", "Group", "Sequence", "Infer"]);
    expect(ops(el)[0].style.getPropertyValue("--c")).toBe("var(--diff)");
    key(row(el), "2");
    expect(chosen(el)).toBe("group");
    expect(cards(el)).toEqual(techniquesFor(seed, "group").map((t) => t.id));
  });

  it("azerty_digits: the unshifted & on Digit1 picks the first operation (M3)", () => {
    const { el } = mount();
    expect(key(row(el), "&", { code: "Digit1" }).defaultPrevented).toBe(true);
    expect(chosen(el)).toBe(ops(el)[0].dataset.op);
    key(row(el), "é", { code: "Digit2" });
    expect(chosen(el)).toBe(ops(el)[1].dataset.op);
  });

  it("dynamic_operations: 5, 9 and 1 operations", () => {
    let { el } = mount({}, { tax: opsTax(5) });
    expect(ops(el)).toHaveLength(5);
    key(row(el), "5");
    expect(chosen(el)).toBe("op5");
    expect(key(row(el), "6").defaultPrevented).toBe(true); // swallowed, never typed into the search
    expect(chosen(el)).toBe("op5");
    expect(search(el).value).toBe("");

    ({ el } = mount({}, { tax: opsTax(9) }));
    key(row(el), "9");
    expect(chosen(el)).toBe("op9");

    ({ el } = mount({}, { tax: opsTax(1) }));
    expect(ops(el)).toHaveLength(1);
    key(row(el), "1");
    expect(chosen(el)).toBe("op1");
  });

  it("renamed_operation_label: a Change updates the button with no remount", () => {
    const { el, store } = mount();
    type(el, "kept");
    store.apply({
      ...none,
      taxonomy: { ...seed, operations: seed.operations.map((o) => (o.id === "group" ? { ...o, plainLabel: "Bundle" } : o)) },
    });
    expect(el.isConnected).toBe(true);
    expect(ops(el)[1].querySelector(".serif")!.textContent).toBe("Bundle");
    expect(search(el).value).toBe("kept");
  });

  it("deleted_operation_clears_choice", () => {
    const { el, store } = mount();
    key(row(el), "2");
    expect(chosen(el)).toBe("group");
    store.apply({ ...none, taxonomy: { ...seed, operations: seed.operations.filter((o) => o.id !== "group") } });
    expect(ops(el)).toHaveLength(3);
    expect(chosen(el)).toBeUndefined();
    expect(cards(el)).toEqual([]);
  });

  it("custom_domain_listed: a branch to a new domain appears in the form's select", () => {
    const { el } = mount({}, { tax: withTexture() });
    key(row(el), "1");
    type(el, "Halo glow");
    newCard(el)!.click();
    const options = [...el.querySelectorAll<HTMLOptionElement>(".pk-form select option")];
    expect(options.map((o) => o.value)).toContain("texture");
    expect(options.find((o) => o.value === "texture")!.textContent).toBe("Texture");
  });

  it("filter_then_enter: 1, then moody, leaves Chiaroscuro highlighted; Enter tags it", () => {
    const { el, api } = mount();
    key(row(el), "1");
    type(el, "moody");
    expect(cards(el)).toEqual(["chiaroscuro"]);
    expect(hi(el)?.dataset.tech).toBe("chiaroscuro");
    expect(hi(el)!.querySelector(".pk-domain")!.textContent).toBe("Feature");
    key(search(el), "Enter");
    expect(sent(api)).toEqual([
      ["r", [{ operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.feature" }]],
    ]);
  });

  it("exact_name_ranks_first: 1, then rim light, highlights Rim light, not Chiaroscuro; Enter tags it (QA F1)", () => {
    const { el, api } = mount();
    key(row(el), "1");
    type(el, "rim light");
    expect(cards(el)[0]).toBe("rim-light");
    expect(hi(el)?.dataset.tech).toBe("rim-light");
    key(search(el), "Enter");
    expect(sent(api)).toEqual([
      ["r", [{ operationId: "differentiate", techniqueId: "rim-light", branchId: "differentiate.feature" }]],
    ]);
  });

  it("digits_type_in_search: a digit in the search field is text, not an operation", () => {
    const { el } = mount();
    key(row(el), "1");
    search(el).focus();
    expect(key(search(el), "2").defaultPrevented).toBe(false);
    type(el, "2");
    expect(search(el).value).toBe("2");
    expect(chosen(el)).toBe("differentiate");
  });

  it("printable_key_outside_text_field_starts_a_search", () => {
    const { el } = mount();
    key(row(el), "1");
    expect(key(row(el), "m").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(search(el));
    expect(search(el).value).toBe("m");
  });

  it("ask_domain: two branches show two radios, and Enter waits for a pick", () => {
    const { el, api } = mount({}, { tax: withTexture() });
    key(row(el), "1");
    type(el, "chiaroscuro");
    const radios = [...hi(el)!.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(radios.map((r) => r.value)).toEqual(["differentiate.feature", "differentiate.texture"]);
    key(search(el), "Enter");
    expect(api.addTags).not.toHaveBeenCalled();
    radios[1].checked = true;
    radios[1].dispatchEvent(new Event("change", { bubbles: true }));
    key(search(el), "Enter");
    expect(sent(api)).toEqual([
      ["r", [{ operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.texture" }]],
    ]);
  });

  it("tab_focused_card_is_what_enter_applies (fix round 1, I1)", () => {
    const { el, api } = mount();
    key(row(el), "1");
    const first = el.querySelector<HTMLElement>(".pk-card[data-tech]")!;
    first.focus(); // where Tab from the search field lands
    expect(hi(el)?.dataset.tech).toBe(first.dataset.tech);
    expect(document.activeElement).toBe(hi(el));
    key(document.activeElement!, "Enter");
    expect(sent(api)).toEqual([
      ["r", [{ operationId: "differentiate", techniqueId: first.dataset.tech, branchId: "differentiate.feature" }]],
    ]);
  });

  it("tab_focused_card_space_ticks_and_down_moves_on (fix round 1, I1)", () => {
    const { el } = mount();
    key(row(el), "1");
    el.querySelector<HTMLElement>(".pk-card[data-tech]")!.focus();
    key(document.activeElement!, " ");
    expect(hi(el)!.classList.contains("is-ticked")).toBe(true);
    key(document.activeElement!, "ArrowDown");
    expect(hi(el)?.dataset.tech).toBe(cards(el)[1]);
    expect(document.activeElement).toBe(hi(el));
  });

  const pointerdown = (t: Element) => t.dispatchEvent(new Event("pointerdown", { bubbles: true }));

  it("pointer_focus_on_a_tick_box_does_not_repaint_before_the_click (fix round 2, I3)", () => {
    const { el } = mount();
    key(row(el), "1");
    const box = el.querySelectorAll<HTMLInputElement>(".pk-card[data-tech] .pk-tick")[1];
    pointerdown(box);
    box.focus(); // the browser focuses on mousedown
    expect(box.isConnected).toBe(true); // a detached mousedown target loses its click
    box.click();
    expect([...el.querySelectorAll<HTMLElement>(".pk-card.is-ticked")].map((c) => c.dataset.tech)).toEqual([cards(el)[1]]);
  });

  it("pointer_focus_on_new_technique_does_not_repaint_before_the_click (fix round 2, I3)", () => {
    const { el } = mount();
    key(row(el), "1");
    type(el, "Halo glow");
    const card = newCard(el)!;
    expect(card.classList.contains("is-hi")).toBe(false);
    pointerdown(card);
    card.focus();
    expect(card.isConnected).toBe(true);
    card.click();
    expect(el.querySelector(".pk-form")).not.toBeNull();
  });

  it("keyboard_focus_after_a_pointer_press_still_highlights (fix round 2, I3)", () => {
    const { el } = mount();
    key(row(el), "1");
    pointerdown(el.querySelector(".pk-search")!); // a press that never became a click
    key(search(el), "Tab"); // the next keydown clears it
    el.querySelector<HTMLElement>(".pk-card[data-tech]")!.focus();
    expect(hi(el)?.dataset.tech).toBe(cards(el)[0]);
  });

  it("space_on_a_domain_radio_is_left_to_the_radio (fix round 1, I2)", () => {
    const { el, api } = mount({}, { tax: withTexture() });
    key(row(el), "1");
    type(el, "chiaroscuro");
    const radio = hi(el)!.querySelector<HTMLInputElement>('input[type="radio"]')!;
    radio.focus();
    expect(key(radio, " ").defaultPrevented).toBe(false); // the browser checks it
    expect(el.querySelector(".pk-msg")!.textContent).toBe("");
    expect(hi(el)!.classList.contains("is-ticked")).toBe(false);
    radio.click(); // what the browser's Space does: check it and fire change
    key(radio, "Enter");
    expect(sent(api)).toEqual([
      ["r", [{ operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.feature" }]],
    ]);
  });

  it("partial_tag: 3, then Enter with nothing highlighted", async () => {
    const onDone = vi.fn();
    const { el, api } = mount({ onDone });
    key(row(el), "3");
    key(row(el), "Enter");
    expect(sent(api)).toEqual([["r", [{ operationId: "sequence" }]]]);
    await flush();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("enter_with_no_operation_sends_nothing", () => {
    const { el, api } = mount();
    key(row(el), "Enter");
    expect(api.addTags).not.toHaveBeenCalled();
  });

  it("apply_is_disabled_until_an_operation_is_chosen (design judgement #11)", () => {
    const { el } = mount();
    const apply = el.querySelector<HTMLButtonElement>(".pk-apply")!;
    expect(apply.disabled).toBe(true);
    key(row(el), "3");
    expect(apply.disabled).toBe(false);
    type(el, "zzz brand new");
    newCard(el)!.click(); // the New technique form has its own Add button
    expect(apply.disabled).toBe(true);
    el.querySelector<HTMLButtonElement>(".pk-cancel")!.click();
    expect(apply.disabled).toBe(false);
  });

  const twoDiff = (): NewTag[] =>
    techniquesFor(seed, "differentiate")
      .filter((t) => seed.branchTechniques.some((l) => l.techniqueId === t.id && l.branchId === "differentiate.feature"))
      .slice(0, 2)
      .map((t) => ({ operationId: "differentiate", techniqueId: t.id, branchId: "differentiate.feature" }));

  it("preset: two techniques start ticked and Enter sends both in one call", () => {
    const preset = twoDiff();
    const { el, api } = mount({ preset });
    expect(chosen(el)).toBe("differentiate");
    expect([...el.querySelectorAll<HTMLElement>(".pk-card.is-ticked")].map((c) => c.dataset.tech)).toEqual(
      preset.map((t) => t.techniqueId),
    );
    key(row(el), "Enter");
    expect(sent(api)).toEqual([["r", preset]]);
  });

  it("space_ticks_and_unticks_the_highlighted_card", () => {
    const { el, api } = mount();
    key(row(el), "1");
    key(row(el), "ArrowDown");
    const first = hi(el)!.dataset.tech;
    key(row(el), " ");
    expect(hi(el)!.classList.contains("is-ticked")).toBe(true);
    key(row(el), "ArrowDown");
    key(row(el), " ");
    key(row(el), "ArrowUp");
    key(row(el), " "); // unticks the first
    key(row(el), "Enter");
    expect(sent(api)[0][1].map((t) => t.techniqueId)).toEqual([cards(el)[1]]);
    expect(first).toBe(cards(el)[0]);
  });

  it("clicking_a_tick_box_ticks_its_own_card", () => {
    const { el, api } = mount();
    key(row(el), "1");
    key(row(el), "ArrowDown"); // the first card is highlighted
    el.querySelectorAll<HTMLInputElement>(".pk-card[data-tech] .pk-tick")[1].click();
    expect([...el.querySelectorAll<HTMLElement>(".pk-card.is-ticked")].map((c) => c.dataset.tech)).toEqual([cards(el)[1]]);
    key(row(el), "Enter");
    expect(sent(api)[0][1].map((t) => t.techniqueId)).toEqual([cards(el)[1]]);
  });

  it("tick_box_on_an_ask_card_shows_its_radios_and_stays_unticked", () => {
    const { el } = mount({}, { tax: withTexture() });
    key(row(el), "1");
    const box = el.querySelector<HTMLInputElement>('.pk-card[data-tech="chiaroscuro"] .pk-tick')!;
    box.click();
    const card = el.querySelector<HTMLElement>('.pk-card[data-tech="chiaroscuro"]')!;
    expect(card.classList.contains("is-hi")).toBe(true);
    expect(card.querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(card.querySelector<HTMLInputElement>(".pk-tick")!.checked).toBe(false);
    expect(el.querySelector(".pk-msg")!.textContent).toBe("Choose a domain first.");
  });

  it("a_late_result_after_close_does_not_call_onDone", async () => {
    const onDone = vi.fn();
    const { p, el } = mount({ onDone });
    key(row(el), "3");
    key(row(el), "Enter");
    p.close();
    await flush();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("ticks_drop_when_their_technique_leaves_the_taxonomy", () => {
    const preset = twoDiff();
    const { el, api, store } = mount({ preset });
    store.apply({
      ...none,
      taxonomy: { ...seed, branchTechniques: seed.branchTechniques.filter((l) => l.techniqueId !== preset[0].techniqueId) },
    });
    key(row(el), "Enter");
    expect(sent(api)).toEqual([["r", [preset[1]]]]);
  });

  it("arrows_left_right_belong_to_the_inbox_when_docked_there", () => {
    let { el } = mount();
    key(row(el), "1");
    expect(key(row(el), "ArrowRight").defaultPrevented).toBe(true);
    expect(hi(el)?.dataset.tech).toBe(cards(el)[0]);
    ({ el } = mount({ inbox: true }));
    key(row(el), "1");
    expect(key(row(el), "ArrowRight").defaultPrevented).toBe(false);
    expect(hi(el)).toBeNull();
  });

  it("its Esc stays in the picker, so a lightbox around it stays open (D1)", () => {
    const { el } = mount();
    const host = el.parentElement!;
    const outside = vi.fn();
    host.addEventListener("keydown", outside);
    key(search(el), "Escape"); // empty search: the picker closes itself
    expect(el.isConnected).toBe(false);
    expect(outside).not.toHaveBeenCalled();
    host.removeEventListener("keydown", outside);
  });

  it("esc_clears_the_search_then_closes", () => {
    const { el } = mount();
    key(row(el), "1");
    type(el, "moody");
    key(search(el), "Escape");
    expect(search(el).value).toBe("");
    expect(el.isConnected).toBe(true);
    key(search(el), "Escape");
    expect(el.isConnected).toBe(false);
  });

  it("modified_keys_pass_through: Ctrl+Z is not typed into the search", () => {
    const { el } = mount();
    expect(key(row(el), "z", { ctrlKey: true }).defaultPrevented).toBe(false);
    expect(key(row(el), "2", { isComposing: true }).defaultPrevented).toBe(false);
    expect(search(el).value).toBe("");
    expect(chosen(el)).toBeUndefined();
  });

  describe("custom_technique", () => {
    it("Halo glow calls addTechnique once with the tag, and addTags never", async () => {
      const onDone = vi.fn();
      const { el, api, store } = mount({ onDone });
      key(row(el), "1");
      type(el, "Halo glow");
      expect(newCard(el)).toBe(el.querySelectorAll(".pk-card")[el.querySelectorAll(".pk-card").length - 1]);
      newCard(el)!.click();
      const form = el.querySelector<HTMLFormElement>(".pk-form")!;
      expect(form.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("Halo glow");
      form.querySelector<HTMLInputElement>('[name="description"]')!.value = "A soft ring of light.";
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); // a double submit sends once
      expect(api.addTechnique).toHaveBeenCalledTimes(1);
      expect(vi.mocked(api.addTechnique).mock.calls[0]).toEqual([
        { name: "Halo glow", description: "A soft ring of light.", operationId: "differentiate", domainId: store.tax.branches.find((b) => b.operationId === "differentiate")!.domainId },
        { refId: "r" },
      ]);
      await flush();
      expect(api.addTags).not.toHaveBeenCalled();
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("NameTaken shows the exact copy, and use it tags the existing one", async () => {
      const api = fakeApi();
      vi.mocked(api.addTechnique).mockRejectedValueOnce("NameTaken:chiaroscuro");
      const { el } = mount({}, { api });
      key(row(el), "1");
      type(el, "chiaroscuro ");
      newCard(el)!.click();
      el.querySelector<HTMLFormElement>(".pk-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await flush();
      expect(el.querySelector(".pk-msg")!.textContent).toBe("Already exists: Chiaroscuro — use it");
      el.querySelector<HTMLButtonElement>(".pk-msg button")!.click();
      expect(sent(api)).toEqual([
        ["r", [{ operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.feature" }]],
      ]);
    });

    it("TaxonomyReadOnly shows the copy", async () => {
      const api = fakeApi();
      vi.mocked(api.addTechnique).mockRejectedValueOnce("TaxonomyReadOnly");
      const { el } = mount({}, { api });
      key(row(el), "1");
      type(el, "Halo glow");
      newCard(el)!.click();
      el.querySelector<HTMLFormElement>(".pk-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await flush();
      expect(el.querySelector(".pk-msg")!.textContent).toBe(
        "The technique list is read-only because taxonomy.json is damaged.",
      );
    });

    it("with store.taxonomyReadOnly the card is disabled", () => {
      const { el } = mount({}, { readOnly: true });
      key(row(el), "1");
      type(el, "Halo glow");
      expect(newCard(el)!.getAttribute("aria-disabled")).toBe("true");
      newCard(el)!.click();
      expect(el.querySelector(".pk-form")).toBeNull();
    });
  });

  it("region: the opts region is on every NewTag sent", async () => {
    const region = { x: 0.1, y: 0.2, w: 0.3, h: 0.4 };
    const preset = twoDiff();
    let { el, api } = mount({ region, preset });
    key(row(el), "Enter");
    expect(sent(api)[0][1]).toEqual(preset.map((t) => ({ ...t, region })));

    ({ el, api } = mount({ region }));
    key(row(el), "4");
    key(row(el), "Enter");
    expect(sent(api)[0][1]).toEqual([{ operationId: "infer", region }]);

    ({ el, api } = mount({ region }));
    key(row(el), "1");
    type(el, "Halo glow");
    newCard(el)!.click();
    el.querySelector<HTMLFormElement>(".pk-form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    expect(vi.mocked(api.addTechnique).mock.calls[0][1]).toEqual({ refId: "r", region });
  });

  it("chips: the current tags, with confirm on suggestions and remove on all", () => {
    const t1 = tag("t1", "differentiate", "chiaroscuro", "differentiate.feature", true);
    const t2 = tag("t2", "sequence");
    const { el, api } = mount({}, { refs: [ref("r", [t1, t2])] });
    const chips = [...el.querySelectorAll<HTMLElement>(".pk-chip")];
    expect(chips.map((c) => c.querySelector(".pk-chip-label")!.textContent)).toEqual(["Stand out › Chiaroscuro", "Lead the eye"]);
    expect(chips[1].querySelector(".pk-confirm")).toBeNull();
    chips[0].querySelector<HTMLButtonElement>(".pk-confirm")!.click();
    expect(api.updateTag).toHaveBeenCalledWith("r", "t1", {
      operationId: "differentiate",
      techniqueId: "chiaroscuro",
      branchId: "differentiate.feature",
    });
    chips[1].querySelector<HTMLButtonElement>(".pk-remove")!.click();
    expect(api.removeTag).toHaveBeenCalledWith("r", "t2");
    key(chips[0], "Delete");
    expect(api.removeTag).toHaveBeenLastCalledWith("r", "t1");
  });

  it("chips_follow_the_store", () => {
    const { el, store } = mount();
    expect(el.querySelectorAll(".pk-chip")).toHaveLength(0);
    store.apply({ ...none, references: [ref("r", [tag("t9", "infer")])] });
    expect(el.querySelectorAll(".pk-chip")).toHaveLength(1);
  });

  it("demo_examples_shown: two demo thumbnails, and one fetch across two pickers", async () => {
    const demo = (title: string): DemoExample => ({ techniqueId: "chiaroscuro", title, path: `D:\\demo\\${title}.jpg` });
    const api = fakeApi([demo("One"), demo("Two")]);
    let { el } = mount({}, { api });
    await flush();
    key(row(el), "1");
    type(el, "chiaroscuro");
    const ex = [...hi(el)!.querySelectorAll<HTMLElement>(".pk-ex")];
    expect(ex).toHaveLength(2);
    expect(ex.map((x) => x.querySelector(".pk-demo")?.textContent)).toEqual(["demo", "demo"]);
    expect(ex[0].querySelector("img")!.getAttribute("src")).toBe(api.assetUrl("D:\\demo\\One.jpg"));
    ({ el } = mount({}, { api }));
    await flush();
    expect(api.demoExamples).toHaveBeenCalledTimes(1);
  });

  it("library_example_comes_first_without_a_demo_label", async () => {
    const used = ref("u", [tag("u1", "differentiate", "chiaroscuro", "differentiate.feature")]);
    const { el } = mount({}, { refs: [ref("r"), used] });
    await flush();
    key(row(el), "1");
    type(el, "chiaroscuro");
    const ex = hi(el)!.querySelectorAll<HTMLElement>(".pk-ex");
    expect(ex).toHaveLength(1);
    expect(ex[0].querySelector(".pk-demo")).toBeNull();
  });

  it("user_text_is_escaped", () => {
    const { el } = mount();
    key(row(el), "1");
    type(el, `<img src=x onerror=alert(1)>`);
    newCard(el)!.click();
    expect(el.querySelector("img[onerror]")).toBeNull();
  });

  it("close_returns_focus_to_the_opener_and_calls_onClose (Task 8 carry-in)", () => {
    document.body.innerHTML = `<button id="opener">Tag…</button><div id="host"></div>`;
    const opener = document.getElementById("opener")!;
    opener.focus();
    const onClose = vi.fn();
    const store = createStore({ root: "C:\\lib", references: [ref("r")], links: [], boards: [], warning: null, taxonomyReadOnly: false }, seed);
    const p = mountPicker(document.getElementById("host")!, fakeApi(), store, { refId: "r", onClose });
    pickers.push(p);
    expect(p.el.contains(document.activeElement)).toBe(true);
    key(row(p.el), "Escape"); // empty search: Esc closes
    expect(p.el.isConnected).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(onClose).toHaveBeenCalledTimes(1);
    p.close(); // a second close is a no-op
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("close_leaves_focus_alone_when_it_is_elsewhere_or_the_opener_is_gone", () => {
    document.body.innerHTML = `<button id="opener">Tag…</button><input id="other"><div id="host"></div>`;
    document.getElementById("opener")!.focus();
    const store = createStore({ root: "C:\\lib", references: [ref("r")], links: [], boards: [], warning: null, taxonomyReadOnly: false }, seed);
    const p = mountPicker(document.getElementById("host")!, fakeApi(), store, { refId: "r" });
    document.getElementById("other")!.focus();
    p.close();
    expect(document.activeElement).toBe(document.getElementById("other"));
    const q = mountPicker(document.getElementById("host")!, fakeApi(), store, { refId: "r" });
    document.getElementById("opener")!.remove();
    expect(() => q.close()).not.toThrow();
  });

  it("close_unsubscribes", () => {
    const { p, el, store } = mount();
    p.close();
    expect(el.isConnected).toBe(false);
    store.apply({ ...none, references: [ref("r", [tag("t9", "infer")])] });
    expect(el.querySelectorAll(".pk-chip")).toHaveLength(0);
  });
});
