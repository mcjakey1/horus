// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import html from "../../index.html?raw";
import type { Api, Hit, LibraryView, Reference, Scored, Tag, Taxonomy } from "../api";
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
  branches: [{ id: "differentiate-feature", operationId: "differentiate", domainId: "feature" }],
  techniques: [
    { id: "silhouette", name: "Silhouette", icon: "", description: "A dark shape against light.", synonyms: [], examples: [], custom: false },
  ],
  branchTechniques: [{ branchId: "differentiate-feature", techniqueId: "silhouette" }],
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
    importPaths: vi.fn(async () => ({ added: [], duplicates: [], skipped: [] })),
    search: vi.fn(async () => []),
    getSettings: vi.fn(async () => ({ lastLibrary: "C:\\lib", theme: "light" as const, findSimilar: "unset" as const })),
    setSettings: vi.fn(async () => {}),
    systemRamGb: vi.fn(async () => 16),
    pickFolder: vi.fn(async () => null),
    pickImages: vi.fn(async () => []),
    assetUrl: (path: string) => `asset://${encodeURIComponent(path)}`,
    undo: vi.fn(async () => ({ references: [], removed: [], canUndo: false, canRedo: false })),
    redo: vi.fn(async () => ({ references: [], removed: [], canUndo: false, canRedo: false })),
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

  it("Import images calls importPaths, then reopens the library and summarises", async () => {
    vi.mocked(api.pickImages).mockResolvedValueOnce(["C:/in/x.jpg", "C:/in/y.psd"]);
    vi.mocked(api.importPaths).mockResolvedValueOnce({
      added: ["d"],
      duplicates: [],
      skipped: [["C:/in/y.psd", { kind: "unsupported", detail: "unrecognised file type" }]],
    });
    const D = ref("d", "Plate D", []);
    vi.mocked(api.openLibrary).mockResolvedValueOnce({ ...library, references: [A, B, C, D] });
    document.querySelector<HTMLButtonElement>('[data-import="files"]')!.click();
    await settle();
    expect(api.importPaths).toHaveBeenCalledWith(["C:/in/x.jpg", "C:/in/y.psd"]);
    expect(api.openLibrary).toHaveBeenLastCalledWith("C:\\lib");
    const imported = vi.mocked(api.importPaths).mock.invocationCallOrder[0];
    expect(Math.max(...vi.mocked(api.openLibrary).mock.invocationCallOrder)).toBeGreaterThan(imported);
    expect(document.querySelector("#lib-count")?.textContent).toBe("4 references");
    const notice = document.querySelector<HTMLElement>("#import-notice")!;
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("Added 1 reference · 1 file skipped");
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
});

describe("notices", () => {
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  });

  it("open_warning_is_shown_in_notice", async () => {
    const api = fakeApi();
    const warning = "library.json could not be read, so Horus opened its backup <b>library.bak.json</b>.";
    vi.mocked(api.openLibrary).mockResolvedValue({ ...library, warning }); // the import's reopen (Plan 1, until Task 5)
    const view = mountReference(document.body, api, createStore({ ...library, warning }, taxonomy));
    await view.ready;
    const notice = document.querySelector<HTMLElement>("#import-notice")!;
    expect(notice.hidden).toBe(false);
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.querySelector("[data-body]")!.textContent).toContain(warning); // escaped, not markup
    expect(notice.querySelector("b")).toBeNull();
    document.querySelector<HTMLButtonElement>("#import-dismiss")!.click();
    expect(notice.hidden).toBe(true);

    // Every reopen shows it again: after an import, next to the import summary.
    vi.mocked(api.pickImages).mockResolvedValueOnce(["C:/in/x.jpg"]);
    vi.mocked(api.importPaths).mockResolvedValueOnce({ added: ["d"], duplicates: [], skipped: [] });
    document.querySelector<HTMLButtonElement>('[data-import="files"]')!.click();
    await settle();
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("Added 1 reference");
    expect(notice.textContent).toContain(warning);
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
    expect(el.textContent).toContain("Added 1 reference");
    expect(el.textContent).toContain("p3 <red>.png");
    expect(el.textContent).toContain("ICC profile could not be parsed; colours left unconverted");
    expect(el.querySelector("red")).toBeNull();
  });
});
