// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import html from "../../index.html?raw";
import type { Api, Hit, ImportReport, ImportResult, LibraryView, Reference, Scored, Tag, Taxonomy } from "../api";
import { summaryHTML } from "../importer";
import { createStore, type Store } from "../store";
import { mountReference } from "./view";

const tag = (id: string, operationId: string, techniqueId?: string, branchId?: string): Tag => ({
  id,
  operationId,
  techniqueId,
  branchId,
  suggested: true,
});

const ref = (id: string, title: string, tags: Tag[]): Reference => ({
  id,
  title,
  file: `images/${id}.jpg`,
  hash: id,
  width: 300,
  height: 400,
  addedAt: "2026-11-25T00:00:00Z",
  tags,
  thumb256: `C:\\lib\\thumbs\\256\\${id}.jpg`,
  thumb1024: `C:\\lib\\thumbs\\1024\\${id}.jpg`,
});

const taxonomy: Taxonomy = {
  operations: [
    { id: "differentiate", name: "Differentiate", plainLabel: "Stand out", icon: "", description: "" },
    { id: "sequence", name: "Sequence", plainLabel: "Lead the eye", icon: "", description: "" },
  ],
  domains: [{ id: "feature", name: "Feature", icon: "", description: "" }],
  branches: [
    { id: "differentiate-feature", operationId: "differentiate", domainId: "feature" },
    { id: "sequence-feature", operationId: "sequence", domainId: "feature" },
  ],
  techniques: [
    { id: "silhouette", name: "Silhouette", icon: "", description: "A dark shape against light.", synonyms: [], examples: [], custom: false },
    { id: "rhythm", name: "Rhythm", icon: "", description: "", synonyms: [], examples: [], custom: false },
  ],
  branchTechniques: [
    { branchId: "differentiate-feature", techniqueId: "silhouette" },
    { branchId: "sequence-feature", techniqueId: "rhythm" },
  ],
};

const A = ref("a", "Plate A", [tag("a1", "differentiate", "silhouette", "differentiate-feature"), tag("a2", "sequence")]);
const B = ref("b", "Plate B", [tag("b1", "differentiate", "silhouette", "differentiate-feature")]);
const C = ref("c", "Plate C", []);

const library: LibraryView = {
  root: "C:\\lib",
  references: [A, B, C],
  links: [{ id: "l1", fromRef: "a", toRef: "c", why: "same mood" }],
  warning: null,
  taxonomyReadOnly: false,
};

const scored: Record<string, Scored[]> = {
  a: [{ id: "b", score: 0.8, sharedTechniques: ["silhouette"], sharedBranches: ["differentiate-feature"] }],
  b: [{ id: "a", score: 0.8, sharedTechniques: ["silhouette"], sharedBranches: ["differentiate-feature"] }],
  c: [],
};

function fakeApi(): Api {
  return {
    createLibrary: vi.fn(async () => library),
    openLibrary: vi.fn(async () => library),
    getTaxonomy: vi.fn(async () => taxonomy),
    related: vi.fn(async (id: string) => scored[id] ?? []),
    graphEdges: vi.fn(),
    importPaths: vi.fn(async () => imported([])),
    search: vi.fn(async () => []),
    getSettings: vi.fn(async () => ({ lastLibrary: "C:\\lib", theme: "light" as const, findSimilar: "unset" as const })),
    setSettings: vi.fn(async () => {}),
    systemRamGb: vi.fn(async () => 16),
    pickFolder: vi.fn(async () => null),
    pickImages: vi.fn(async () => []),
    assetUrl: (path: string) => `asset://${encodeURIComponent(path)}`,
    undo: vi.fn(async () => ({ references: [], removed: [], canUndo: false, canRedo: false })),
    redo: vi.fn(async () => ({ references: [], removed: [], canUndo: false, canRedo: false })),
    addTags: vi.fn(async () => ({ references: [], removed: [], canUndo: true, canRedo: false })),
    updateTag: vi.fn(async () => ({ references: [], removed: [], canUndo: true, canRedo: false })),
    removeTag: vi.fn(async () => ({ references: [], removed: [], canUndo: true, canRedo: false })),
    addTechnique: vi.fn(async () => ({ references: [], removed: [], canUndo: true, canRedo: false })),
    demoExamples: vi.fn(async () => []),
    setField: vi.fn(async () => ({ references: [], removed: [], canUndo: true, canRedo: false })),
    importBytes: vi.fn(async () => imported([])),
    imagePath: vi.fn(async (id: string) => `C:\\lib\\images\\${id}.jpg`),
    updateTechnique: vi.fn(),
    deleteTechnique: vi.fn(),
    linkTechnique: vi.fn(),
    unlinkTechnique: vi.fn(),
    addBranch: vi.fn(),
    addDomain: vi.fn(),
    updateDomain: vi.fn(),
    deleteDomain: vi.fn(),
    addOperation: vi.fn(),
    updateOperation: vi.fn(),
    deleteOperation: vi.fn(),
    intakeBusy: vi.fn(async () => {}),
    retrySave: vi.fn(async () => {}),
    exitWithoutSaving: vi.fn(async () => {}),
    onSaveStatus: vi.fn(async () => () => {}),
    onSaveFailed: vi.fn(async () => () => {}),
    onCloseWaiting: vi.fn(async () => () => {}),
  };
}

/** An import's result: `added` references, applied through the store (no reopen, B4). */
function imported(added: Reference[], skipped: ImportReport["skipped"] = []): ImportResult {
  return {
    report: { added: added.map((r) => r.id), duplicates: [], skipped },
    change: { references: added, removed: [], canUndo: added.length > 0, canRedo: false },
  };
}

const settle = () => new Promise((r) => setTimeout(r, 260));

describe("Reference view", () => {
  let api: Api;
  let store: Store;
  let view: ReturnType<typeof mountReference>;
  beforeEach(async () => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    api = fakeApi();
    store = createStore(library, taxonomy);
    view = mountReference(document.body, api, store);
    await view.ready;
    view.show("a");
    await settle();
  });
  afterEach(() => view.destroy());

  it("renders one callout per tag", () => {
    expect(document.querySelectorAll("#pane-callouts .call")).toHaveLength(2);
  });

  it("shows the library folder name, with the full path in the tooltip", () => {
    const src = document.querySelector<HTMLElement>("#data-source")!;
    expect([src.textContent, src.title]).toEqual(["Library: lib", "C:\\lib"]);
    expect(document.querySelector<HTMLElement>("#ref-id")!.title).toBe("a");
  });

  it("labels the partial callout", () => {
    const calls = document.querySelectorAll("#pane-callouts .call");
    expect(calls[1].textContent).toContain("technique not chosen yet");
  });

  it("shows the link count on the Links tab", () => {
    expect(document.querySelector("#links-count")?.textContent).toBe("1");
  });

  it("asks for related of the new reference when a thumbnail is clicked, and Back returns", async () => {
    const thumb = document.querySelector<HTMLButtonElement>('#pane-callouts .thumb[data-go="b"]');
    expect(thumb).not.toBeNull();
    thumb!.click();
    await settle();
    expect(api.related).toHaveBeenLastCalledWith("b");
    expect(document.querySelector("#ref-id")?.textContent).toBe("b");

    document.querySelector<HTMLButtonElement>("#back")!.click();
    await settle();
    expect(document.querySelector("#ref-id")?.textContent).toBe("a");
    // showing the reference already in focus must not add a Back step
    expect(document.querySelector<HTMLButtonElement>("#back")!.disabled).toBe(true);
  });

  it("theme_toggle_sends_only_theme", () => {
    document.querySelector<HTMLButtonElement>("#theme")!.click();
    expect(api.setSettings).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.setSettings).mock.calls[0][0]).toStrictEqual({ theme: "dark" });
  });

  it("toggles Value view once per v key", () => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "v" }));
    expect(document.querySelector<HTMLInputElement>("#value")!.checked).toBe(true);
  });

  it("Import images calls importPaths, applies its change and summarises (no reopen)", async () => {
    vi.mocked(api.pickImages).mockResolvedValueOnce(["C:/in/x.jpg", "C:/in/y.psd"]);
    const D = ref("d", "Plate D", []);
    vi.mocked(api.importPaths).mockResolvedValueOnce(
      imported([D], [["C:/in/y.psd", { kind: "unsupported", detail: "unrecognised file type" }]]),
    );
    document.querySelector<HTMLButtonElement>('[data-import="files"]')!.click();
    await settle();
    expect(api.importPaths).toHaveBeenCalledWith(["C:/in/x.jpg", "C:/in/y.psd"]);
    expect(api.openLibrary).not.toHaveBeenCalled();
    expect(store.refs.has("d")).toBe(true);
    expect(store.canUndo).toBe(true); // the import is an undo step
    expect(document.querySelector("#lib-count")?.textContent).toBe("4 references");
    const notice = document.querySelector<HTMLElement>("#import-notice")!;
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("Added 1 to the Inbox · 1 file skipped");
    expect(notice.textContent).toContain("y.psd not a supported image type");
  });

  it("ignores a search response that arrives after the field was cleared", async () => {
    let resolve!: (h: Hit[]) => void;
    vi.mocked(api.search).mockImplementationOnce(() => new Promise<Hit[]>((r) => (resolve = r)));
    const q = document.querySelector<HTMLInputElement>("#q")!;
    q.value = "sil";
    q.dispatchEvent(new Event("input"));
    q.value = "";
    q.dispatchEvent(new Event("input"));
    resolve([{ kind: "technique", id: "silhouette", operationId: "differentiate", count: 2 }]);
    await settle();
    expect(document.querySelector<HTMLUListElement>("#q-results")!.hidden).toBe(true);
  });

  const none = { references: [], removed: [], canUndo: true, canRedo: false };
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

  it("store_change_rerenders_focus", async () => {
    const calls = vi.mocked(api.related).mock.calls.length;
    const A2 = { ...A, tags: [...A.tags, tag("a3", "differentiate", "silhouette", "differentiate-feature")] };
    store.apply({ ...none, references: [A2] });
    await settle();
    expect(document.querySelectorAll("#pane-callouts .call")).toHaveLength(3);
    expect(vi.mocked(api.related).mock.calls.length).toBe(calls + 1); // scores refetched
    expect($("#ref-id").textContent).toBe("a");
  });

  it("taxonomy_rename_rerenders", async () => {
    const renamed = { ...taxonomy, techniques: [{ ...taxonomy.techniques[0], name: "Contre-jour" }] };
    store.apply({ ...none, taxonomy: renamed });
    await settle();
    expect($("#pane-callouts .call .pin").textContent).toBe("Contre-jour");
  });

  it("removed_focus_falls_back", async () => {
    $<HTMLButtonElement>('#pane-callouts .thumb[data-go="b"]').click();
    await settle();
    expect($("#ref-id").textContent).toBe("b");
    store.apply({ ...none, removed: ["b"] }); // back along the trail
    await settle();
    expect($("#ref-id").textContent).toBe("a");
    expect($<HTMLButtonElement>("#back").disabled).toBe(true);
    store.apply({ ...none, removed: ["a"] }); // then the first reference
    await settle();
    expect($("#ref-id").textContent).toBe("c");
    store.apply({ ...none, removed: ["c"] }); // then the empty state
    await settle();
    expect($("#pane-callouts").textContent).toContain("No references yet.");
    expect($("#plate").innerHTML).toBe("");
    expect($("#ref-id").textContent).toBe("");
    expect($("#lib-count").textContent).toBe("0 references");
    store.apply({ ...none, references: [B] }); // an undo brings one back
    await settle();
    expect($("#ref-id").textContent).toBe("b");
  });

  it("reset_switches_library", async () => {
    store.reset({ root: "D:\\Pictures\\Second", references: [ref("z", "Plate Z", [])], links: [], warning: null, taxonomyReadOnly: false }, taxonomy);
    await settle();
    expect($("#data-source").textContent).toBe("Library: Second");
    expect($("#ref-id").textContent).toBe("z");
    expect($("#import-notice").hidden).toBe(true); // no warning, no empty notice
    // the same reference id in another library (a shared hash) repaints with that library's files
    store.reset({ ...library, root: "D:\\Third", references: [{ ...ref("z", "Plate Z", []), thumb1024: "D:\\Third\\z.jpg" }] }, taxonomy);
    await settle();
    expect($("#plate img").getAttribute("src")).toBe(`asset://${encodeURIComponent("D:\\Third\\z.jpg")}`);
  });

  const plateSrc = () => $("#plate img")?.getAttribute("src");
  const src = (r: Reference) => api.assetUrl(r.thumb1024);

  it("change_during_show_paints_the_new_plate", async () => {
    view.show("b");
    store.apply({ ...none, references: [{ ...B, title: "Plate B2" }] }); // inside show()'s paint delay
    await settle();
    expect($("#ref-id").textContent).toBe("b");
    expect(plateSrc()).toBe(src(B));
  });

  it("change_after_reset_keeps_the_new_library_plate", async () => {
    const A3 = { ...A, thumb1024: "D:\\Third\\a.jpg" };
    store.reset({ ...library, root: "D:\\Third", references: [A3, B, C] }, taxonomy);
    store.apply({ ...none, references: [{ ...A3, title: "Plate A3" }] }); // supersedes the reset's refresh
    await settle();
    expect(plateSrc()).toBe(src(A3));
  });

  it("change_at_mount_still_paints_the_plate", async () => {
    view.destroy();
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    store = createStore(library, taxonomy);
    view = mountReference(document.body, api, store);
    store.apply({ ...none, references: [{ ...A, title: "Plate A2" }] }); // before the first related() returns
    await settle();
    expect(plateSrc()).toBe(src(A));
  });

  it("unrelated_change_does_not_refresh", async () => {
    const calls = vi.mocked(api.related).mock.calls.length;
    $("#pane-callouts .call").dataset.mark = "kept";
    store.apply({ ...none, references: [ref("u", "Plate U", [tag("u1", "infer")])] });
    await settle();
    expect(vi.mocked(api.related).mock.calls.length).toBe(calls);
    expect($("#pane-callouts .call").dataset.mark).toBe("kept");
    expect($("#lib-count").textContent).toBe("4 references"); // the status line still updates
    // a reference that now shares a technique with the focus does refresh
    store.apply({ ...none, references: [ref("s", "Plate S", [tag("s1", "differentiate", "silhouette", "differentiate-feature")])] });
    await settle();
    expect(vi.mocked(api.related).mock.calls.length).toBe(calls + 1);
  });

  it("no_private_fetch", () => {
    expect(api.openLibrary).not.toHaveBeenCalled();
    expect(api.getTaxonomy).not.toHaveBeenCalled();
  });

  it("unknown_op_is_neutral", async () => {
    store.apply({ ...none, references: [ref("q", "Plate Q", [tag("q1", "provoke")])] });
    view.show("q");
    await settle();
    for (const el of [$("#pane-callouts .call"), $("#boxes .box")]) {
      expect(el.getAttribute("style")).toContain("--c:var(--ink-2)");
      expect(el.getAttribute("style")).not.toContain("--diff");
    }
  });

  it("t_opens_the_picker_for_the_focused_reference", () => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true }));
    const pickers = document.querySelectorAll<HTMLElement>(".margin .picker");
    expect(pickers).toHaveLength(1);
    expect(pickers[0].dataset.ref).toBe("a");
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true })); // still one
    expect(document.querySelectorAll(".margin .picker")).toHaveLength(1);
  });

  it("tag_button_on_the_plate_opens_the_picker", () => {
    const btn = document.querySelector<HTMLButtonElement>("#lab .tag-open")!;
    expect(btn.textContent).toBe("Tag…");
    btn.click();
    expect(document.querySelector<HTMLElement>(".margin .picker")?.dataset.ref).toBe("a");
  });

  it("digits_do_not_pin_while_the_picker_is_open", () => {
    const pins = () => [...document.querySelectorAll(".pin")].map((p) => p.getAttribute("aria-pressed"));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true }));
    const picker = document.querySelector<HTMLElement>(".margin .picker")!;
    picker.querySelector(".pk-ops")!.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true }));
    expect(pins()).toEqual(["false", "false"]);
  });

  it("picker_closes_when_the_focus_moves", async () => {
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true }));
    view.show("b");
    await settle();
    expect(document.querySelector(".margin .picker")).toBeNull();
  });

  it("typing_in_picker_search_does_not_pin", () => {
    const picker = document.createElement("div");
    picker.className = "picker";
    picker.innerHTML = "<input>";
    document.body.append(picker);
    const pins = () => [...document.querySelectorAll(".pin")].map((p) => p.getAttribute("aria-pressed"));
    picker.querySelector("input")!.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true }));
    expect(pins()).toEqual(["false", "false"]);
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "2", bubbles: true }));
    expect(pins()).toEqual(["false", "true"]);
  });

  it("azerty_digit_pins: the unshifted é on Digit2 pins callout 2 (M3)", () => {
    const pins = () => [...document.querySelectorAll(".pin")].map((p) => p.getAttribute("aria-pressed"));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "é", code: "Digit2", bubbles: true }));
    expect(pins()).toEqual(["false", "true"]);
  });

  // ---------- Task 10: the minimal lightbox (SPEC §6.6) ----------
  const keyOn = (k: string, el: Element = document.activeElement ?? document.body) =>
    el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

  it("l_opens_the_lightbox_and_v_stays_inside", () => {
    keyOn("l", document.body);
    expect($(".lightbox").getAttribute("aria-label")).toContain("Plate A");
    const lbValue = () => $(".lightbox").classList.contains("is-value");
    const before = lbValue(); // it starts from the Reference view's value state (body.value)
    expect(before).toBe(document.body.classList.contains("value"));
    const checked = $<HTMLInputElement>("#value").checked;
    keyOn("v");
    expect(lbValue()).toBe(!before);
    expect($<HTMLInputElement>("#value").checked).toBe(checked); // the Reference view's checkbox is untouched
    keyOn("Escape");
    expect(document.querySelector(".lightbox")).toBeNull();
    expect($<HTMLInputElement>("#value").checked).toBe(checked);
  });

  it("lightbox_keys_never_reach_the_view_from_body", () => {
    keyOn("l", document.body);
    const checked = $<HTMLInputElement>("#value").checked;
    (document.activeElement as HTMLElement).blur(); // a click on blank lightbox space
    keyOn("v", document.body);
    expect($<HTMLInputElement>("#value").checked).toBe(checked);
    (document.activeElement as HTMLElement).blur();
    keyOn("t", document.body);
    expect(document.querySelector(".margin .picker")).toBeNull();
    (document.activeElement as HTMLElement).blur();
    keyOn("Escape", document.body);
    expect(document.querySelector(".lightbox")).toBeNull();
  });

  it("open_lightbox_button_on_the_plate", () => {
    const btn = $<HTMLButtonElement>("#lab .lb-open");
    expect(btn.textContent).toBe("Open lightbox");
    btn.focus();
    btn.click();
    expect(document.querySelector(".lightbox")).not.toBeNull();
    keyOn("Escape");
    expect(document.activeElement).toBe(btn); // focus returns to the opener
  });

  it("region_drag_docks_the_picker_inside_the_lightbox", async () => {
    keyOn("t", document.body); // a margin picker is open first
    $<HTMLButtonElement>("#lab .lb-open").click();
    expect(document.querySelector(".margin .picker")).toBeNull(); // it would sit behind the modal
    const stage = $(".lb-stage");
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
    // plate 300×400 → left 175, width 450, height 600; drag 0.1,0.1 → 0.4,0.5
    for (const [type, fx, fy] of [["pointerdown", 0.1, 0.1], ["pointermove", 0.4, 0.5], ["pointerup", 0.4, 0.5]] as const)
      stage.dispatchEvent(new MouseEvent(type, { clientX: 175 + fx * 450, clientY: fy * 600, button: 0, bubbles: true }));
    const picker = $(".lightbox .lb-side .picker");
    expect(picker.dataset.ref).toBe("a");
    expect(picker.contains(document.activeElement)).toBe(true);
    keyOn("1"); // the first operation
    keyOn("Enter"); // a partial tag for the region
    await settle();
    const [refId, tags] = vi.mocked(api.addTags).mock.calls[0];
    expect(refId).toBe("a");
    expect(tags[0].operationId).toBe("differentiate");
    for (const [k, v] of Object.entries({ x: 0.1, y: 0.1, w: 0.3, h: 0.4 })) expect(tags[0].region![k as "x"]).toBeCloseTo(v, 6);
    // the picker closed after tagging: focus is back in the lightbox, so v never reaches the Reference view
    expect(document.querySelector(".lightbox .picker")).toBeNull();
    expect($(".lightbox").contains(document.activeElement)).toBe(true);
    const checked = $<HTMLInputElement>("#value").checked;
    keyOn("v");
    expect($<HTMLInputElement>("#value").checked).toBe(checked);
  });

  /** Opens the lightbox on "a" and drags a box, so a picker docks inside it. */
  function dockPickerInLightbox() {
    $<HTMLButtonElement>("#lab .lb-open").click();
    const stage = $(".lb-stage");
    stage.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
    for (const [type, fx, fy] of [["pointerdown", 0.1, 0.1], ["pointerup", 0.4, 0.5]] as const)
      stage.dispatchEvent(new MouseEvent(type, { clientX: 175 + fx * 450, clientY: fy * 600, button: 0, bubbles: true }));
    return $(".lightbox .picker");
  }

  it("closing_the_lightbox_closes_its_docked_picker", () => {
    const real = store.subscribe.bind(store);
    const unsubs: ReturnType<typeof vi.fn>[] = [];
    vi.spyOn(store, "subscribe").mockImplementation((fn) => {
      const u = vi.fn(real(fn));
      unsubs.push(u);
      return u;
    });
    dockPickerInLightbox(); // subscribes the lightbox, then the picker
    expect(unsubs).toHaveLength(2);
    $<HTMLButtonElement>(".lightbox .lb-close").click(); // closed with the picker still docked
    expect(document.querySelector(".lightbox")).toBeNull();
    expect(unsubs[1]).toHaveBeenCalledTimes(1); // the picker unsubscribed: no detached picker left on the store
    // view.ts dropped it: digits pin callouts again, and t opens a fresh margin picker
    keyOn("t", document.body);
    expect(document.querySelectorAll(".picker")).toHaveLength(1);
    expect(document.querySelector(".margin .picker")).not.toBeNull();
  });

  it("showing_another_reference_closes_the_lightbox", async () => {
    keyOn("l", document.body);
    view.show("a"); // the same reference: it stays
    expect(document.querySelector(".lightbox")).not.toBeNull();
    view.show("b"); // e.g. "Show" on a duplicate in the intake notice
    expect(document.querySelector(".lightbox")).toBeNull();
    await settle();
    expect($("#ref-id").textContent).toBe("b");
  });

  it("notice_over_the_lightbox_takes_focus_and_keys", () => {
    dockPickerInLightbox();
    const notice = $("#import-notice");
    notice.hidden = false;
    const dismiss = $<HTMLButtonElement>("#import-dismiss");
    dismiss.focus();
    expect(document.activeElement).toBe(dismiss); // the lightbox's focus guard lets a notice keep focus
    const checked = $<HTMLInputElement>("#value").checked;
    keyOn("v", dismiss); // nor does a key there reach the Reference view behind the modal
    expect($<HTMLInputElement>("#value").checked).toBe(checked);
    dismiss.click();
    expect(notice.hidden).toBe(true); // its button works
    expect(document.querySelector(".lightbox")).not.toBeNull();
  });

  // ---------- Task 11: the AND/OR technique filter (SPEC §5a) ----------
  const rows = () => [...document.querySelectorAll<HTMLElement>("#pane-ranked .row")].map((r) => r.dataset.go);
  const chips = () => [...document.querySelectorAll<HTMLElement>("#pane-ranked .chip")].map((c) => c.textContent?.replace("×", "").trim());
  const pressed = () => document.querySelector("#pane-ranked [data-mode][aria-pressed='true']")?.textContent;
  const byCallout = (tech: string) => $<HTMLButtonElement>(`#pane-callouts [data-filter="${tech}"]`).click();
  /** A's partial tag becomes Rhythm, and D has only Rhythm: A = {silhouette, rhythm}, B = {silhouette}, D = {rhythm}. */
  async function withRhythm() {
    const A2 = { ...A, tags: [A.tags[0], tag("a2", "sequence", "rhythm", "sequence-feature")] };
    store.apply({ ...none, references: [A2, ref("d", "Plate D", [tag("d1", "sequence", "rhythm", "sequence-feature")])] });
    await settle();
  }

  it("filter_two_chips_all_of_leaves_single_match", async () => {
    await withRhythm();
    const calls = vi.mocked(api.related).mock.calls.length;
    $("#pane-callouts .call").dataset.mark = "kept";
    byCallout("silhouette");
    byCallout("rhythm");
    byCallout("rhythm"); // choosing it again keeps it, never toggles it off
    expect($("#pane-ranked").hidden).toBe(false);
    expect(chips()).toEqual(["Silhouette", "Rhythm"]);
    expect(pressed()).toBe("Any of"); // the default
    expect(rows()[0]).toBe("b"); // ranked by related score: b scores 0.8
    expect(new Set(rows())).toEqual(new Set(["a", "b", "d"]));
    $<HTMLButtonElement>('#pane-ranked [data-mode="and"]').click();
    expect(rows()).toEqual(["a"]);
    expect(pressed()).toBe("All of");
    expect(document.activeElement).toBe($('#pane-ranked [data-mode="and"]')); // keyboard focus survives the re-render
    // view state only: no new scores, no store Change, the callouts untouched
    expect(vi.mocked(api.related).mock.calls.length).toBe(calls);
    expect($("#pane-callouts .call").dataset.mark).toBe("kept");
    expect(api.undo).not.toHaveBeenCalled();
  });

  it("filter_show_clears_chips", async () => {
    byCallout("silhouette");
    $<HTMLButtonElement>('#pane-ranked [data-mode="and"]').click();
    expect(chips()).toEqual(["Silhouette"]);
    view.show("b");
    await settle();
    expect(chips()).toEqual([]);
    expect($("#pane-ranked").textContent).toContain("related · strongest first");
    byCallout("silhouette");
    expect(pressed()).toBe("Any of"); // the mode resets too
  });

  it("filter_chip_ink_and_remove", async () => {
    await withRhythm();
    byCallout("silhouette");
    byCallout("rhythm");
    const chip = $("#pane-ranked .chip");
    expect(chip.style.getPropertyValue("--c")).toBe("var(--diff)"); // opInk of Silhouette's operation
    // the ink is set through the CSSOM: no inline style in the markup beyond that one property
    expect(document.querySelectorAll("#pane-ranked [style]:not(.chip)")).toHaveLength(0);
    expect(chip.getAttribute("style")).toBe("--c: var(--diff);");
    const x = $<HTMLButtonElement>("#pane-ranked .chip-x");
    expect(x.getAttribute("aria-label")).toBe("Remove Silhouette from the filter");
    x.click();
    expect(chips()).toEqual(["Rhythm"]);
    expect(document.activeElement).toBe($('#pane-ranked .chip-x[data-untoggle="rhythm"]'));
    $<HTMLButtonElement>("#pane-ranked .chip-x").click();
    expect(chips()).toEqual([]);
    expect(document.activeElement).toBe($('.m-tab[data-pane="ranked"]'));
  });

  it("search_hit_navigates_first (Plan 3 R5)", async () => {
    view.destroy();
    const seen: string[] = [];
    const onNavigate = vi.fn(() => {
      const asked = vi.mocked(api.related).mock.calls.some(([id]) => id === "b");
      const ranked = $('.m-tab[data-pane="ranked"]').getAttribute("aria-selected");
      seen.push(`related(b)=${asked} ranked=${ranked}`);
    });
    view = mountReference(document.body, api, store, { onNavigate });
    await view.ready;
    view.show("a");
    await settle();
    vi.mocked(api.related).mockClear();
    const q = $<HTMLInputElement>("#q");
    vi.mocked(api.search).mockResolvedValue([{ kind: "reference", id: "b" }]);
    q.value = "plate b";
    q.dispatchEvent(new Event("input"));
    await settle();
    $('#q-results li[data-r="b"]').click();
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(api.related).toHaveBeenCalledWith("b");
    vi.mocked(api.search).mockResolvedValue([{ kind: "technique", id: "rhythm", operationId: "sequence", count: 0 }]);
    q.value = "rhy";
    q.dispatchEvent(new Event("input"));
    await settle();
    $('#q-results li[data-t="rhythm"]').click();
    expect(onNavigate).toHaveBeenCalledTimes(2);
    expect($('.m-tab[data-pane="ranked"]').getAttribute("aria-selected")).toBe("true");
    expect(seen).toEqual(["related(b)=false ranked=false", "related(b)=true ranked=false"]);
  });

  // ---------- Task 9 carry-ins ----------
  it("filtered_ranked_refreshes_for_a_change_outside_the_focus (Task 11 carry-in)", async () => {
    vi.mocked(api.search).mockResolvedValue([{ kind: "technique", id: "rhythm", operationId: "sequence", count: 0 }]);
    const q = $<HTMLInputElement>("#q");
    q.value = "rhy";
    q.dispatchEvent(new Event("input"));
    await settle();
    $('#q-results li[data-t="rhythm"]').click();
    expect($("#pane-ranked").textContent).toContain("No reference has any of these yet.");
    // shares nothing with the focus, but carries the filtered technique
    store.apply({ ...none, references: [ref("u", "Plate U", [tag("u1", "sequence", "rhythm", "sequence-x")])] });
    await settle();
    expect($("#pane-ranked").textContent).toContain("Plate U");
  });

  it("filtered_ranked_refreshes_when_a_ranked_reference_loses_its_tag (Task 11 carry-in)", async () => {
    vi.mocked(api.search).mockResolvedValue([{ kind: "technique", id: "rhythm", operationId: "sequence", count: 0 }]);
    const q = $<HTMLInputElement>("#q");
    q.value = "rhy";
    q.dispatchEvent(new Event("input"));
    await settle();
    $('#q-results li[data-t="rhythm"]').click();
    store.apply({ ...none, references: [ref("u", "Plate U", [tag("u1", "sequence", "rhythm", "sequence-x")])] });
    await settle();
    expect($("#pane-ranked").textContent).toContain("Plate U"); // U is now in S.ranked
    // U loses the filtered technique: it shares nothing with the focus, but it was ranked
    store.apply({ ...none, references: [ref("u", "Plate U", [tag("u1", "infer")])] });
    await settle();
    expect($("#pane-ranked").textContent).not.toContain("Plate U");
    expect($("#pane-ranked").textContent).toContain("No reference has any of these yet.");
  });

  it("filter_by_this_moves_focus_to_the_ranked_tab (Task 11 carry-in)", () => {
    $<HTMLButtonElement>("#pane-callouts .filter-by").click();
    expect(document.activeElement).toBe($('.m-tab[data-pane="ranked"]'));
  });

  it("modifier_combos_are_left_to_the_browser (Task 7 carry-in)", () => {
    const pins = () => [...document.querySelectorAll(".pin")].map((p) => p.getAttribute("aria-pressed"));
    for (const init of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }]) {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true, ...init }));
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "1", bubbles: true, ...init }));
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true, ...init }));
    }
    expect($<HTMLInputElement>("#value").checked).toBe(false);
    expect(pins()).toEqual(["false", "false"]);
    expect(document.querySelector(".margin .picker")).toBeNull();
  });

  it("alt_left_still_goes_back", async () => {
    $<HTMLButtonElement>('#pane-callouts .thumb[data-go="b"]').click();
    await settle();
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", altKey: true, bubbles: true }));
    await settle();
    expect($("#ref-id").textContent).toBe("a");
  });

  it("view_keys_sleep_while_another_view_shows", () => {
    document.body.dataset.view = "inbox";
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true }));
    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true }));
    delete document.body.dataset.view;
    expect($<HTMLInputElement>("#value").checked).toBe(false);
    expect(document.querySelector(".margin .picker")).toBeNull();
  });

  it("library_switch_clears_the_back_trail (Task 7 carry-in)", async () => {
    $<HTMLButtonElement>('#pane-callouts .thumb[data-go="b"]').click();
    await settle();
    expect($<HTMLButtonElement>("#back").disabled).toBe(false);
    store.apply({ ...none, canUndo: true, canRedo: true }); // an undo trail exists before the switch
    expect([store.canUndo, store.canRedo]).toEqual([true, true]);
    store.reset({ ...library, root: "D:\\other" }, taxonomy);
    await settle();
    expect($<HTMLButtonElement>("#back").disabled).toBe(true);
    expect([store.canUndo, store.canRedo]).toEqual([false, false]);
  });

  it("specimen_is_the_drop_target_so_region_boxes_do_not_hide_it (Task 12 item 4)", async () => {
    // #boxes lies over #plate (inset: 0), so the hit-test lands on a .box: the target must contain both.
    expect($("#specimen").dataset.refDrop).toBe("a");
    const box = $("#boxes .box");
    expect(box.closest<HTMLElement>("[data-ref-drop]")?.dataset.refDrop).toBe("a");
    view.show("b");
    await settle();
    expect($("#specimen").dataset.refDrop).toBe("b");
  });

  it("filter_from_search_and_empty_copy", async () => {
    vi.mocked(api.search).mockResolvedValue([{ kind: "technique", id: "rhythm", operationId: "sequence", count: 0 }]);
    const q = $<HTMLInputElement>("#q");
    q.value = "rhy";
    q.dispatchEvent(new Event("input"));
    await settle();
    $('#q-results li[data-t="rhythm"]').click();
    expect(chips()).toEqual(["Rhythm"]);
    expect($("#pane-ranked").textContent).toContain("No reference has any of these yet.");
    $<HTMLButtonElement>('#pane-ranked [data-mode="and"]').click();
    expect($("#pane-ranked").textContent).toContain("No reference has all of these yet.");
  });
});

describe("notices", () => {
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  });

  it("open_warning_is_shown_in_notice", async () => {
    const api = fakeApi();
    const warning = "library.json could not be read, so Horus opened its backup <b>library.bak.json</b>.";
    const view = mountReference(document.body, api, createStore({ ...library, warning }, taxonomy));
    await view.ready;
    const notice = document.querySelector<HTMLElement>("#import-notice")!;
    expect(notice.hidden).toBe(false);
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.querySelector("[data-body]")!.textContent).toContain(warning); // escaped, not markup
    expect(notice.querySelector("b")).toBeNull();
    document.querySelector<HTMLButtonElement>("#import-dismiss")!.click();
    expect(notice.hidden).toBe(true);

    // An import no longer reopens the library (B4): the notice shows its own summary.
    vi.mocked(api.pickImages).mockResolvedValueOnce(["C:/in/x.jpg"]);
    vi.mocked(api.importPaths).mockResolvedValueOnce(imported([ref("d", "Plate D", [])]));
    document.querySelector<HTMLButtonElement>('[data-import="files"]')!.click();
    await settle();
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("Added 1 to the Inbox");
    expect(api.openLibrary).not.toHaveBeenCalled();
    view.destroy();
  });

  it("open_warning_is_shown_in_notice for a library handed over by first run", async () => {
    const api = fakeApi();
    const view = mountReference(document.body, api, createStore({ ...library, warning: "Demo image d07 was not imported." }, taxonomy));
    await view.ready;
    const notice = document.querySelector<HTMLElement>("#import-notice")!;
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("Demo image d07 was not imported.");
    view.destroy();
  });

  it("warning_shows_once_in_the_notice_not_the_status_bar (Plan 1 QA carry-in)", async () => {
    const warning = "taxonomy.json could not be read";
    const view = mountReference(document.body, fakeApi(), createStore({ ...library, warning }, taxonomy));
    await view.ready;
    const src = document.querySelector<HTMLElement>("#data-source")!;
    expect([src.textContent, src.title]).toEqual(["Library: lib", "C:\\lib"]);
    expect(document.querySelector("#import-notice [data-body]")!.textContent).toContain(warning);
    view.destroy();
  });

  it("reset_without_warning_clears_the_warning_notice (Task 7 carry-in)", async () => {
    const store = createStore({ ...library, warning: "taxonomy.json could not be read" }, taxonomy);
    const view = mountReference(document.body, fakeApi(), store);
    await view.ready;
    const notice = document.querySelector<HTMLElement>("#import-notice")!;
    expect(notice.hidden).toBe(false);
    store.reset({ ...library, root: "D:\\b", warning: null }, taxonomy);
    expect(notice.hidden).toBe(true);
    view.destroy();
  });

  it("warning_shown_from_store", async () => {
    const store = createStore({ ...library, warning: "taxonomy.json could not be read" }, taxonomy);
    const view = mountReference(document.body, fakeApi(), store);
    await view.ready;
    const body = document.querySelector<HTMLElement>("#import-notice [data-body]")!;
    expect(body.textContent).toContain("taxonomy.json could not be read");
    store.reset({ ...library, root: "D:\\b", warning: "Demo image d07 was not imported." }, taxonomy);
    expect(body.textContent).toContain("Demo image d07 was not imported.");
    expect(body.textContent).not.toContain("taxonomy.json");
    view.destroy();
  });

  it("import_warnings_are_listed", () => {
    const out = summaryHTML({
      added: ["d"],
      duplicates: [],
      skipped: [],
      warnings: [["C:\\in\\p3 <red>.png", "ICC profile could not be parsed; colours left unconverted"]],
    });
    const el = document.createElement("div");
    el.innerHTML = out;
    expect(el.textContent).toContain("Added 1 to the Inbox");
    expect(el.textContent).toContain("p3 <red>.png");
    expect(el.textContent).toContain("ICC profile could not be parsed; colours left unconverted");
    expect(el.querySelector("red")).toBeNull();
  });
});
