// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Api, Change, Reference, Taxonomy } from "../api";
import type { DataSource, Snapshot, SourceEvent } from "../data";
import { refOf, seed, snap, synth, tagOf } from "../graph/fixtures.test-util";
import type { Mods, Scene } from "../graph/frame";
import { isTextEntry } from "../keys";
import { domainChoice } from "../tagging/model";
import type { ViewHandle } from "../views";
import { READ_ONLY, renderInspector, sayError, type InspectorOpts, type Selection } from "./inspector";
import { mountTechniqueForm } from "./technique-form";
import { mountTree } from "./tree";

const flush = () => new Promise((r) => setTimeout(r, 0));
const done = (extra: Partial<Change> = {}): Change => ({ references: [], removed: [], canUndo: true, canRedo: false, ...extra });
const METHODS = ["updateTechnique", "deleteTechnique", "linkTechnique", "unlinkTechnique", "addBranch", "addDomain", "updateDomain",
  "deleteDomain", "addOperation", "updateOperation", "deleteOperation", "addTechnique"] as const;
type FakeApi = Api & Record<(typeof METHODS)[number], Mock>;
function fakeApi(): FakeApi {
  const a: Record<string, unknown> = { assetUrl: (p: string) => `asset://${p}` };
  for (const m of METHODS) a[m] = vi.fn(async () => done());
  return a as unknown as FakeApi;
}

const mine: Taxonomy = {
  ...seed,
  techniques: [...seed.techniques, { id: "my-trick", name: "My trick", icon: "", description: "", synonyms: [], examples: [], custom: true }],
  branchTechniques: [...seed.branchTechniques, { branchId: "differentiate.feature", techniqueId: "my-trick" }],
};
const refs: Reference[] = [
  refOf("a", [tagOf(mine, { tech: "rim-light" }), tagOf(mine, { tech: "chiaroscuro" }, 1)]),
  refOf("b", [tagOf(mine, { tech: "rim-light" })]),
];
const s = snap(mine, refs);
const tech = (id: string): Selection => ({ kind: "tech", id: `tech:${id}` });
const button = (root: ParentNode, text: string) =>
  [...root.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent!.trim() === text);
const dlg = () => document.querySelector<HTMLElement>('[role="alertdialog"]');
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
function type(el: HTMLInputElement | HTMLTextAreaElement, v: string) {
  el.value = v;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("inspector editing", () => {
  let el: HTMLElement;
  let api: FakeApi;
  let opts: InspectorOpts & { apply: Mock; notice: Mock; focusCanvas: Mock };
  beforeEach(() => {
    document.body.innerHTML = "";
    el = document.createElement("aside");
    document.body.append(el);
    api = fakeApi();
    opts = { editable: true, openReference: vi.fn(), select: vi.fn(), api, apply: vi.fn(), notice: vi.fn(), focusCanvas: vi.fn() };
  });
  const render = (sel: Selection, snapshot: Snapshot = s) => renderInspector(el, snapshot, sel, opts);
  const nameField = () => {
    el.querySelector<HTMLElement>('.insp-edit[data-edit="name"]')!.click();
    return el.querySelector<HTMLInputElement>('input[data-field="name"]')!;
  };

  it("rename_inline_calls_api", async () => {
    render(tech("rim-light"));
    let f = nameField();
    expect(f.value).toBe("Rim light");
    expect(document.activeElement).toBe(f);
    type(f, "Rim glow");
    key(f, "Enter");
    f.dispatchEvent(new FocusEvent("blur")); // Enter then blur saves once
    await flush();
    expect(api.updateTechnique).toHaveBeenCalledTimes(1);
    expect(api.updateTechnique).toHaveBeenCalledWith("rim-light", { name: "Rim glow" });
    render(tech("rim-light"));
    f = nameField();
    type(f, "Something");
    key(f, "Escape");
    await flush();
    expect(api.updateTechnique).toHaveBeenCalledTimes(1);
    expect(el.querySelector('input[data-field="name"]')).toBeNull();
    expect(el.querySelector(".insp-title")!.textContent).toBe("Rim light");
    f = nameField(); // an unchanged name saves nothing
    key(f, "Enter");
    await flush();
    expect(api.updateTechnique).toHaveBeenCalledTimes(1);
  });

  it("a blur cancels in place: the control being clicked is not replaced (advisor)", () => {
    render(tech("rim-light"));
    const del = button(el, "Delete technique…")!;
    const f = nameField();
    f.dispatchEvent(new FocusEvent("blur"));
    expect(button(el, "Delete technique…")).toBe(del);
    expect(el.querySelector('input[data-field="name"]')).toBeNull();
    expect(el.querySelector(".insp-title")!.textContent).toBe("Rim light");
  });

  it("an empty plain label can still be edited", async () => {
    const t: Taxonomy = { ...mine, operations: mine.operations.map((o) => (o.id === "group" ? { ...o, plainLabel: "" } : o)) };
    render({ kind: "op", id: "op:group" }, snap(t, refs));
    const b = el.querySelector<HTMLElement>('.insp-edit[data-edit="plainLabel"]')!;
    expect(b.textContent).toBe("Add plain label");
    b.click();
    const f = el.querySelector<HTMLInputElement>('input[data-field="plainLabel"]')!;
    expect(f.value).toBe("");
    type(f, "Bind");
    key(f, "Enter");
    await flush();
    expect(api.updateOperation).toHaveBeenCalledWith("group", { plainLabel: "Bind" });
  });

  it("name_taken_message", async () => {
    api.updateTechnique.mockRejectedValueOnce("NameTaken:pop-out");
    render(tech("rim-light"));
    const f = nameField();
    type(f, "Pop-out");
    key(f, "Enter");
    await flush();
    expect(el.querySelector(".insp-err")!.textContent).toBe("That name is taken by Pop-out.");
    expect(opts.apply).not.toHaveBeenCalled();
  });

  it("edit_applies_change", async () => {
    const c = done({ taxonomy: mine });
    api.updateTechnique.mockResolvedValueOnce(c);
    render(tech("rim-light"));
    const d = el.querySelector<HTMLTextAreaElement>('textarea[data-field="description"]')!;
    type(d, "Light from behind.");
    d.dispatchEvent(new Event("change", { bubbles: true })); // a textarea's change fires on blur
    await flush();
    expect(api.updateTechnique).toHaveBeenCalledWith("rim-light", { description: "Light from behind." });
    expect(opts.apply).toHaveBeenCalledTimes(1);
    expect(opts.apply).toHaveBeenCalledWith(c);
  });

  it("enter_save_leaves_field", async () => {
    render(tech("rim-light"));
    const f = nameField();
    type(f, "Rim glow");
    key(f, "Enter");
    await flush();
    expect(opts.focusCanvas).toHaveBeenCalled();
    expect(isTextEntry(document.activeElement)).toBe(false);
    delete (opts as Partial<typeof opts>).focusCanvas; // without a canvas the title takes focus
    render(tech("rim-light"));
    const g = nameField();
    type(g, "Rim glare");
    key(g, "Enter");
    await flush();
    expect(isTextEntry(document.activeElement)).toBe(false);
  });

  it("synonyms: chips add and remove, each saving", async () => {
    render(tech("chiaroscuro"));
    const syns = mine.techniques.find((t) => t.id === "chiaroscuro")!.synonyms;
    el.querySelector<HTMLElement>("[data-syn-add]")!.click();
    const f = el.querySelector<HTMLInputElement>('input[data-field="synonym"]')!;
    type(f, "candlelit");
    key(f, "Enter");
    await flush();
    expect(api.updateTechnique).toHaveBeenLastCalledWith("chiaroscuro", { synonyms: [...syns, "candlelit"] });
    if (syns.length) {
      render(tech("chiaroscuro"));
      el.querySelector<HTMLElement>('[data-syn-del="0"]')!.click();
      await flush();
      expect(api.updateTechnique).toHaveBeenLastCalledWith("chiaroscuro", { synonyms: syns.slice(1) });
    }
  });

  it("delete_in_use_opens_dialog", async () => {
    render(tech("rim-light"));
    button(el, "Delete technique…")!.click();
    expect(dlg()!.querySelector(".tx-title")!.textContent).toBe("2 references use Rim light");
    dlg()!.querySelector<HTMLInputElement>('input[value="partial"]')!.click();
    dlg()!.querySelector<HTMLButtonElement>(".tx-ok")!.click();
    await flush();
    expect(api.deleteTechnique).toHaveBeenCalledWith("rim-light", { kind: "partial" });
    expect(opts.apply).toHaveBeenCalledTimes(1);
  });

  it("delete_unused_skips_dialog", async () => {
    render(tech("my-trick"));
    button(el, "Delete technique…")!.click();
    const d = dlg()!;
    expect(d.querySelector('input[type="radio"]')).toBeNull(); // a confirmation, not the move dialog
    expect(d.querySelector(".tx-title")!.textContent).toBe("Delete My trick?");
    d.querySelector<HTMLButtonElement>(".tx-ok")!.click();
    await flush();
    // the brief's `null`: the api wrapper sends `moveTo ?? null` (ruling 3)
    expect(api.deleteTechnique).toHaveBeenCalledWith("my-trick", undefined);
    render(tech("my-trick"));
    button(el, "Delete technique…")!.click();
    dlg()!.querySelector<HTMLButtonElement>(".tx-cancel")!.click();
    await flush();
    expect(api.deleteTechnique).toHaveBeenCalledTimes(1);
  });

  it("unlink_unused_pair_skips_dialog", async () => {
    render(tech("chiaroscuro")); // a's tag uses differentiate.feature; nothing uses sequence.feature
    el.querySelector<HTMLElement>('[data-unlink="sequence.feature"]')!.click();
    await flush();
    expect(dlg()).toBeNull();
    expect(api.unlinkTechnique).toHaveBeenCalledWith("chiaroscuro", "sequence.feature", undefined);
    el.querySelector<HTMLElement>('[data-unlink="differentiate.feature"]')!.click(); // in use: the dialog
    expect(dlg()!.querySelector(".tx-title")!.textContent).toBe("1 reference uses Chiaroscuro under Differentiate · Feature");
    dlg()!.querySelector<HTMLInputElement>('input[value="partial"]')!.click();
    dlg()!.querySelector<HTMLButtonElement>(".tx-ok")!.click();
    await flush();
    expect(api.unlinkTechnique).toHaveBeenLastCalledWith("chiaroscuro", "differentiate.feature", { kind: "partial" });
    render(tech("rim-light")); // a sole link cannot be removed (LastLink)
    expect(el.querySelector<HTMLButtonElement>('[data-unlink="differentiate.feature"]')?.disabled ?? true).toBe(true);
  });

  it("also use under: same-operation domains are offered, so the domain ask is reachable (ae N3)", async () => {
    render(tech("chiaroscuro"));
    button(el, "Also use under…")!.click();
    const opts2 = [...el.querySelectorAll<HTMLElement>("[data-link]")].map((b) => b.dataset.link);
    expect(opts2).toContain("differentiate.social");
    expect(opts2).not.toContain("differentiate.feature"); // already linked
    el.querySelector<HTMLElement>('[data-link="differentiate.social"]')!.click();
    await flush();
    expect(api.linkTechnique).toHaveBeenCalledWith("chiaroscuro", "differentiate.social");
    const linked = { ...mine, branchTechniques: [...mine.branchTechniques, { branchId: "differentiate.social", techniqueId: "chiaroscuro" }] };
    const d = domainChoice(linked, "differentiate", "chiaroscuro");
    expect("ask" in d && d.ask.map((b) => b.id)).toEqual(["differentiate.feature", "differentiate.social"]);
  });

  it("new_operation_flow", async () => {
    render(null);
    button(el, "+ New operation…")!.click();
    const form = el.querySelector<HTMLFormElement>('form[data-form="op"]')!;
    type(form.querySelector<HTMLInputElement>('[name="name"]')!, "Unsettle");
    type(form.querySelector<HTMLInputElement>('[name="plainLabel"]')!, "Make it uneasy");
    form.requestSubmit();
    await flush();
    expect(api.addOperation).toHaveBeenCalledWith("Unsettle", "Make it uneasy", ""); // color absent: first free ink
    expect(opts.apply).toHaveBeenCalledTimes(1);
    render(null, snap(synth(9)));
    const b = button(el, "+ New operation…")!;
    expect(b.disabled).toBe(true);
    expect(b.title).toBe("Up to 9 operations");
  });

  it("ink_picker_lists_free_inks", async () => {
    const t: Taxonomy = { ...mine, operations: [...mine.operations, { id: "pulse", name: "Pulse", plainLabel: "Beat", color: "teal", icon: "", description: "" }] };
    render({ kind: "op", id: "op:differentiate" }, snap(t, refs));
    const sw = [...el.querySelectorAll<HTMLButtonElement>(".insp-ink")];
    expect(sw.map((b) => b.getAttribute("aria-label"))).toEqual(["Amber", "Olive", "Rose", "Indigo", "Umber"]);
    expect(sw[0].getAttribute("aria-pressed")).toBe("true");
    // every swatch's colour comes from opInk, through the CSSOM (fix I4)
    expect(sw.map((b) => b.style.getPropertyValue("--c"))).toEqual(["var(--diff)", "var(--x-olive)", "var(--x-rose)", "var(--x-indigo)", "var(--x-umber)"]);
    expect(sw.some((b) => b.hasAttribute("data-swatch"))).toBe(false);
    sw[2].click();
    await flush();
    expect(api.updateOperation).toHaveBeenCalledWith("differentiate", { color: "rose" });
    render({ kind: "op", id: "op:pulse" }, snap(t, refs));
    expect([...el.querySelectorAll(".insp-ink")].map((b) => b.getAttribute("aria-label"))).toEqual(["Teal", "Olive", "Rose", "Indigo", "Umber"]);
  });

  it("a seed operation on an extra ink can take its seed ink back (fix I3)", async () => {
    const t: Taxonomy = { ...mine, operations: mine.operations.map((o) => (o.id === "differentiate" ? { ...o, color: "rose" } : o)) };
    render({ kind: "op", id: "op:differentiate" }, snap(t, refs));
    const sw = [...el.querySelectorAll<HTMLButtonElement>(".insp-ink")];
    expect(sw.map((b) => b.getAttribute("aria-label"))).toEqual(["Rose", "Amber", "Teal", "Olive", "Indigo", "Umber"]);
    expect(sw.map((b) => b.style.getPropertyValue("--c")).slice(0, 2)).toEqual(["var(--x-rose)", "var(--diff)"]);
    sw[1].click();
    await flush();
    expect(api.updateOperation).toHaveBeenCalledWith("differentiate", { color: null });
  });

  it("operation fields edit inline", async () => {
    render({ kind: "op", id: "op:group" });
    el.querySelector<HTMLElement>('.insp-edit[data-edit="plainLabel"]')!.click();
    const f = el.querySelector<HTMLInputElement>('input[data-field="plainLabel"]')!;
    type(f, "Bind");
    key(f, "Enter");
    await flush();
    expect(api.updateOperation).toHaveBeenCalledWith("group", { plainLabel: "Bind" });
  });

  it("delete_operation_dialog, and a move that made tags partial is reported", async () => {
    api.deleteOperation.mockResolvedValueOnce(done({ madePartial: 3 }));
    render({ kind: "op", id: "op:group" });
    button(el, "Delete operation…")!.click();
    const d = dlg()!;
    expect(d.querySelector(".tx-ok")!.hasAttribute("disabled")).toBe(true);
    d.querySelector<HTMLInputElement>('input[value="differentiate"]')!.click();
    d.querySelector<HTMLButtonElement>(".tx-ok")!.click();
    await flush();
    expect(api.deleteOperation).toHaveBeenCalledWith("group", { kind: "operation", operationId: "differentiate" });
    expect(opts.notice.mock.lastCall![0]).toContain("3 tags");
    expect(opts.notice.mock.lastCall![0]).toContain("partial");
  });

  it("domain: icon picker, + domain and delete", async () => {
    render({ kind: "branch", id: "br:group.feature" });
    const icons = [...el.querySelectorAll<HTMLButtonElement>(".insp-icon")];
    expect(icons).toHaveLength(8);
    expect(icons[0].textContent).toBe("a short strip of three swatches, dark to light");
    expect(icons[0].getAttribute("aria-pressed")).toBe("true");
    icons[7].click();
    await flush();
    expect(api.updateDomain).toHaveBeenCalledWith("feature", { icon: "a dot inside a ring" });
    render({ kind: "branch", id: "br:group.feature" });
    button(el, "Delete domain…")!.click();
    dlg()!.querySelector<HTMLInputElement>('input[value="delete"]')!.click();
    dlg()!.querySelector<HTMLButtonElement>(".tx-ok")!.click();
    await flush();
    expect(api.deleteDomain).toHaveBeenCalledWith("feature", { kind: "delete" });

    render({ kind: "op", id: "op:group" });
    button(el, "+ Domain…")!.click();
    expect([...el.querySelectorAll<HTMLElement>("[data-add-branch]")].map((b) => b.dataset.addBranch)).toEqual(["space", "semantic", "cultural"]);
    el.querySelector<HTMLElement>('[data-add-branch="space"]')!.click();
    await flush();
    expect(api.addBranch).toHaveBeenCalledWith("group", "space");
    render({ kind: "op", id: "op:group" });
    button(el, "+ Domain…")!.click();
    button(el, "New domain type…")!.click();
    const form = el.querySelector<HTMLFormElement>('form[data-form="domain"]')!;
    type(form.querySelector<HTMLInputElement>('[name="name"]')!, "Motion");
    form.requestSubmit();
    await flush();
    expect(api.addDomain).toHaveBeenCalledWith("Motion", "", undefined, "group");
  });

  it("+ technique on a branch opens the technique form, and its Change is applied", async () => {
    render({ kind: "branch", id: "br:group.social" });
    button(el, "+ Technique…")!.click();
    const form = el.querySelector<HTMLFormElement>("form.tx-tech")!;
    type(form.querySelector<HTMLInputElement>('[name="name"]')!, "Gaze line");
    form.requestSubmit();
    await flush();
    expect(api.addTechnique).toHaveBeenCalledWith({ name: "Gaze line", description: "", operationId: "group", domainId: "social" });
    expect(opts.apply).toHaveBeenCalledTimes(1);
  });

  it("a second click while a command is in flight sends nothing (one click, one undo step)", async () => {
    let finish!: (c: Change) => void;
    api.updateOperation.mockImplementationOnce(() => new Promise<Change>((r) => (finish = r)));
    render({ kind: "op", id: "op:group" });
    const rose = el.querySelector<HTMLButtonElement>('.insp-ink[data-ink="rose"]')!;
    rose.click();
    rose.click();
    await flush(); // queued: the call goes out on the next microtask
    finish(done());
    await flush();
    expect(api.updateOperation).toHaveBeenCalledTimes(1);
    expect(opts.apply).toHaveBeenCalledTimes(1);
  });

  it("the technique form says a taken name with its owner, and a read-only refusal reverts (AGY)", async () => {
    api.addTechnique.mockRejectedValueOnce("NameTaken:pop-out").mockRejectedValueOnce("TaxonomyReadOnly");
    render({ kind: "branch", id: "br:group.social" });
    button(el, "+ Technique…")!.click();
    const form = el.querySelector<HTMLFormElement>("form.tx-tech")!;
    type(form.querySelector<HTMLInputElement>('[name="name"]')!, "Pop-out");
    form.requestSubmit();
    await flush();
    expect(form.querySelector(".insp-err")!.textContent).toBe("That name is taken by Pop-out.");
    form.requestSubmit();
    await flush();
    expect(opts.notice).toHaveBeenCalledWith(expect.stringContaining(READ_ONLY));
    expect(el.querySelector("form.tx-tech")).toBeNull();
    expect(opts.apply).not.toHaveBeenCalled();
  });

  // ---------- Fix round 1 (review I1, I2) ----------
  /** A pending api call, resolved by hand. */
  function pending(m: Mock) {
    let finish!: (c: Change) => void;
    m.mockImplementationOnce(() => new Promise<Change>((r) => (finish = r)));
    return (c: Change = done()) => finish(c);
  }

  it("a command clicked while a definition save is pending is queued, not dropped (I1a)", async () => {
    const finish = pending(api.updateOperation);
    render({ kind: "op", id: "op:group" });
    const d = el.querySelector<HTMLTextAreaElement>("textarea[data-field=description]")!;
    type(d, "Things that belong.");
    d.dispatchEvent(new Event("change", { bubbles: true }));
    el.querySelector<HTMLButtonElement>('.insp-ink[data-ink="rose"]')!.click();
    await flush();
    expect(api.updateOperation).toHaveBeenCalledTimes(1);
    finish();
    await flush();
    expect(api.updateOperation.mock.calls).toEqual([["group", { description: "Things that belong." }], ["group", { color: "rose" }]]);
    expect(opts.apply).toHaveBeenCalledTimes(2);
  });

  it("a form opened while a save is pending survives the save's re-render, with its text (I1c)", async () => {
    let snapNow = s;
    opts.apply.mockImplementation(() => render({ kind: "branch", id: "br:group.social" }, (snapNow = { ...snapNow, version: snapNow.version + 1 })));
    const finish = pending(api.updateDomain);
    render({ kind: "branch", id: "br:group.social" });
    const d = el.querySelector<HTMLTextAreaElement>("textarea[data-field=description]")!;
    type(d, "Faces and bodies.");
    d.dispatchEvent(new Event("change", { bubbles: true }));
    button(el, "+ Technique…")!.click();
    const name = el.querySelector<HTMLInputElement>('form.tx-tech [name="name"]')!;
    type(name, "Gaze line");
    await flush(); // the queued save goes out
    finish();
    await flush();
    expect(opts.apply).toHaveBeenCalledTimes(1); // the save landed and re-rendered the aside
    const form = el.querySelector<HTMLFormElement>("form.tx-tech")!;
    expect(form.querySelector<HTMLInputElement>('[name="name"]')!.value).toBe("Gaze line");
    expect(document.activeElement).toBe(name); // the same node, still focused
    form.requestSubmit();
    await flush();
    expect(api.addTechnique).toHaveBeenCalledWith({ name: "Gaze line", description: "", operationId: "group", domainId: "social" });
  });

  it("an open name field and unsaved definition text survive a store event (I1c)", () => {
    render(tech("rim-light"));
    const f = nameField();
    type(f, "Rim gl");
    render(tech("rim-light"), { ...s, version: 9 }); // e.g. an import landing
    const g = el.querySelector<HTMLInputElement>('input[data-field="name"]')!;
    expect(g.value).toBe("Rim gl");
    expect(document.activeElement).toBe(g);
    expect(api.updateTechnique).not.toHaveBeenCalled(); // the rewrite's blur is not a save
    key(g, "Escape");
    const d = el.querySelector<HTMLTextAreaElement>("textarea[data-field=description]")!;
    d.focus();
    type(d, "Half a thought");
    render(tech("rim-light"), { ...s, version: 10 });
    const d2 = el.querySelector<HTMLTextAreaElement>("textarea[data-field=description]")!;
    expect(d2.value).toBe("Half a thought");
    expect(document.activeElement).toBe(d2);
  });

  it("focus comes back to the control that had it, by its key (I1d)", () => {
    render({ kind: "op", id: "op:group" });
    el.querySelector<HTMLButtonElement>('.insp-ink[data-ink="olive"]')!.focus();
    render({ kind: "op", id: "op:group" }, { ...s, version: 3 }); // the definition's save landing after Tab
    expect(document.activeElement).toBe(el.querySelector('.insp-ink[data-ink="olive"]'));
    render({ kind: "op", id: "op:infer" }); // a new selection: the title, as before
    expect(document.activeElement).toBe(el.querySelector(".insp-title"));
  });

  it("a render waits while the mouse is down in the inspector, so the click lands (I1b)", async () => {
    render({ kind: "op", id: "op:group" });
    const rose = el.querySelector<HTMLButtonElement>('.insp-ink[data-ink="rose"]')!;
    rose.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    render({ kind: "op", id: "op:group" }, { ...s, version: 4 }); // a save resolving mid-click
    expect(el.querySelector('.insp-ink[data-ink="rose"]')).toBe(rose); // not detached
    rose.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    rose.click();
    await flush();
    expect(api.updateOperation).toHaveBeenCalledWith("group", { color: "rose" });
    expect(el.querySelector('.insp-ink[data-ink="rose"]')).not.toBe(rose); // the deferred render ran after the click
  });

  it("a blur with a changed name saves it; Esc still cancels (I2)", async () => {
    render(tech("rim-light"));
    const f = nameField();
    type(f, "Rim glow");
    f.dispatchEvent(new FocusEvent("blur"));
    await flush();
    expect(api.updateTechnique).toHaveBeenCalledWith("rim-light", { name: "Rim glow" });
    render(tech("rim-light"), { ...s, version: 5 });
    el.querySelector<HTMLElement>("[data-syn-add]")!.click();
    const g = el.querySelector<HTMLInputElement>('input[data-field="synonym"]')!;
    type(g, "back light");
    g.dispatchEvent(new FocusEvent("blur"));
    await flush();
    const syns = mine.techniques.find((t) => t.id === "rim-light")!.synonyms;
    expect(api.updateTechnique).toHaveBeenLastCalledWith("rim-light", { synonyms: [...syns, "back light"] });
    expect(api.updateTechnique).toHaveBeenCalledTimes(2);
  });

  it("read_only_error_toast", async () => {
    api.updateTechnique.mockRejectedValueOnce("TaxonomyReadOnly");
    render(tech("rim-light"));
    const f = nameField();
    type(f, "Rim glow");
    key(f, "Enter");
    await flush();
    expect(opts.notice).toHaveBeenCalledWith(expect.stringContaining("The technique list is read-only because taxonomy.json is damaged."));
    expect(el.querySelector('input[data-field="name"]')).toBeNull();
    expect(el.querySelector(".insp-title")!.textContent).toBe("Rim light");
    expect(opts.apply).not.toHaveBeenCalled();
  });

  it("editable: false keeps the read-only inspector", () => {
    renderInspector(el, s, tech("rim-light"), { ...opts, editable: false });
    expect(el.querySelector("input, textarea, .insp-edit, .insp-add, [data-unlink]")).toBeNull();
    expect(button(el, "Delete technique…")).toBeUndefined();
  });
});

describe("technique form", () => {
  it("technique_form_calls_add", async () => {
    document.body.innerHTML = "";
    const api = fakeApi();
    mountTechniqueForm(document.body, api, "group.social");
    const form = document.querySelector<HTMLFormElement>("form.tx-tech")!;
    type(form.querySelector<HTMLInputElement>('[name="name"]')!, "Gaze line");
    type(form.querySelector<HTMLTextAreaElement>('[name="description"]')!, "Eyes point the way.");
    form.requestSubmit();
    await flush();
    expect(api.addTechnique).toHaveBeenCalledTimes(1);
    expect(api.addTechnique.mock.calls[0]).toEqual([{ name: "Gaze line", description: "Eyes point the way.", operationId: "group", domainId: "social" }]);
  });
});

describe("sayError: readable copy, never the raw text", () => {
  it.each([
    ["EmptyName", "A name can't be empty."],
    ["BadMoveTarget", "That place can't take these tags. Choose another."],
    ["unknown technique: ghost", "That technique no longer exists."],
    ["NameTaken:pop-out", "That name is taken by Pop-out."],
    ["LabelTaken:group", "That plain label is taken by Group."],
    ["LastLink", "A technique needs at least one place. Delete it instead."],
    ["LastOperation", "Horus needs at least one operation."],
    ["TaxonomyReadOnly", READ_ONLY],
  ])("%s", (raw, text) => expect(sayError(raw, mine)).toBe(text));

  it("O3: a move refused by a stale tag", () => {
    const t = sayError("still in use: group", mine);
    expect(t).toContain("Group");
    expect(t).not.toContain("still in use");
  });

  it("anything else gets a generic line", () => {
    for (const raw of ["invalid tag: t1: unknown branch", "duplicate id: x", "boom", new Error("kaput")]) {
      const t = sayError(raw, mine);
      expect(t).toBe("That change didn't save. Try again.");
    }
  });
});

// ---------- The Tree: drag to link and the read-only fallback ----------

type Ev = "hover" | "select" | "activate";
function fakeScene() {
  const handlers: Record<Ev, ((id: string | null, m: Mods) => void)[]> = { hover: [], select: [], activate: [] };
  const drops: ((d: string, t: string | null) => void)[] = [];
  const overs: ((d: string, t: string | null) => void)[] = [];
  const scene: Scene & { setDraggable: Mock; setDropHint: Mock } = {
    setNodes: vi.fn(), setEdges: vi.fn(), camera: () => ({ x: 0, y: 0, scale: 1 }), setCamera: vi.fn(), fitAll: vi.fn(),
    on: (ev, fn) => void handlers[ev].push(fn),
    setDraggable: vi.fn(),
    onDrop: (fn) => void drops.push(fn),
    onDragOver: (fn) => void overs.push(fn),
    setDropHint: vi.fn(),
    select: vi.fn(), destroy: vi.fn(),
  };
  const emit = (ev: Ev, id: string | null) => handlers[ev].forEach((f) => f(id, { shift: false }));
  /** The drag sequence as the scene plays it: over each target, then the drop. */
  const drag = (from: string, to: string | null) => {
    overs.forEach((f) => f(from, to));
    overs.forEach((f) => f(from, null));
    drops.forEach((f) => f(from, to));
  };
  const draggable = (id: string): boolean => scene.setDraggable.mock.lastCall![0](id);
  return { scene, emit, drag, overs, draggable };
}
function fakeSource(s0: Snapshot) {
  let cur = s0;
  const subs = new Set<(s: Snapshot, e: SourceEvent) => void>();
  return {
    get: () => cur,
    subscribe(fn: (s: Snapshot, e: SourceEvent) => void) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    set(next: Snapshot) {
      cur = next;
      subs.forEach((f) => f(cur, { reset: false }));
    },
  } satisfies DataSource & { set(s: Snapshot): void };
}

describe("Tree editing", () => {
  const withX: Taxonomy = {
    ...mine,
    branches: [...mine.branches, { id: "group.semantic", operationId: "group", domainId: "semantic" }],
    techniques: [...mine.techniques, { id: "X", name: "X", icon: "", description: "", synonyms: [], examples: [], custom: true }],
    branchTechniques: [...mine.branchTechniques, { branchId: "differentiate.feature", techniqueId: "X" }],
  };
  let host: HTMLElement;
  let view: ViewHandle;
  let fake: ReturnType<typeof fakeScene>;
  let src: ReturnType<typeof fakeSource>;
  let api: FakeApi;
  let apply: Mock;
  beforeEach(async () => {
    document.body.innerHTML = "";
    host = document.createElement("section");
    document.body.append(host);
    fake = fakeScene();
    src = fakeSource(snap(withX, refs));
    api = fakeApi();
    apply = vi.fn();
    view = mountTree(host, src, { api, apply, notice: vi.fn(), openReference: vi.fn(), makeScene: async () => fake.scene });
    view.show();
    await flush();
  });
  afterEach(() => view.destroy());

  it("drop_on_branch_links", async () => {
    expect(fake.draggable("tech:X")).toBe(true);
    expect(fake.draggable("br:group.semantic")).toBe(false);
    fake.overs.forEach((f) => f("tech:X", "br:group.semantic"));
    expect(fake.scene.setDropHint).toHaveBeenLastCalledWith({ id: "br:group.semantic", color: "var(--group)" });
    fake.overs.forEach((f) => f("tech:X", "br:differentiate.feature")); // already linked
    expect(fake.scene.setDropHint).toHaveBeenLastCalledWith("blocked");
    fake.drag("tech:X", "br:group.semantic");
    await flush();
    expect(api.linkTechnique).toHaveBeenCalledWith("X", "group.semantic");
    expect(apply).toHaveBeenCalledTimes(1);
    fake.drag("tech:X", "br:differentiate.feature"); // an invalid drop does nothing
    fake.drag("tech:X", null);
    await flush();
    expect(api.linkTechnique).toHaveBeenCalledTimes(1);
  });

  it("read_only_disables_editing", async () => {
    src.set({ ...snap(withX, refs), version: 1, taxonomyReadOnly: true });
    fake.emit("select", "tech:rim-light");
    const insp = host.querySelector<HTMLElement>(".insp")!;
    const note = insp.querySelector<HTMLElement>(".insp-ro")!;
    expect(note.textContent).toBe(READ_ONLY);
    expect(note.getAttribute("role")).toBe("status");
    expect(insp.querySelector("input:not([disabled]), textarea:not([disabled])")).toBeNull();
    expect([...insp.querySelectorAll("button:not([disabled])")].some((b) => /^Delete|^\+/.test(b.textContent!.trim()))).toBe(false);
    expect(insp.querySelector(".insp-edit, [data-unlink]")).toBeNull();
    expect(fake.draggable("tech:rim-light")).toBe(false);
    fake.emit("select", "op:group"); // the note survives re-renders: announced once
    expect(insp.querySelector(".insp-ro")).toBe(note);
    src.set({ ...snap(withX, refs), version: 2, taxonomyReadOnly: false });
    fake.emit("select", "tech:rim-light");
    expect(insp.querySelector(".insp-ro")).toBeNull();
    expect(button(insp, "Delete technique…")).toBeDefined();
    expect(insp.querySelector("textarea")).not.toBeNull();
    expect(fake.draggable("tech:rim-light")).toBe(true);
  });
});
