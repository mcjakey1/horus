// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import html from "../index.html?raw";
import type { DragDropEvent } from "@tauri-apps/api/webview";
import seedJson from "../src-tauri/resources/taxonomy.json";
import type { Api, LibraryView, Reference, Tag, Taxonomy } from "./api";
import { boot, FIND_SIMILAR_COPY } from "./firstrun";

// Plan 4 Task 7 wiring: capture what boot() hands the Galaxy and what reaches the one openCompare.
const wiring = vi.hoisted(() => ({
  compare: [] as unknown[][],
  galaxy: null as null | { openCompare?(a: string, b: string): void },
}));
vi.mock("./compare/view", () => ({ makeOpenCompare: () => (...args: unknown[]) => void wiring.compare.push(args) }));
vi.mock("./views/galaxy", () => ({
  mountGalaxy: (_h: unknown, _s: unknown, deps: typeof wiring.galaxy) => ((wiring.galaxy = deps), { show() {}, hide() {}, destroy() {} }),
}));

// The library may land in a "Horus Library" subfolder of the picked folder.
const lib: LibraryView = {
  root: "C:\\Références\\Horus Library",
  references: [],
  links: [],
  boards: [],
  warning: null,
  seedWarnings: [],
  taxonomyReadOnly: false,
};

function fakeApi(lastLibrary: string | null): Api {
  return {
    createLibrary: vi.fn(async () => lib),
    openLibrary: vi.fn(async () => {
      throw "That folder is not a Horus library.";
    }),
    getTaxonomy: vi.fn(async () => ({ operations: [], domains: [], branches: [], techniques: [], branchTechniques: [] })),
    related: vi.fn(async () => []),
    graphEdges: vi.fn(),
    importPaths: vi.fn(async () => ({
      report: { added: [], duplicates: [], skipped: [] },
      change: { references: [], removed: [], canUndo: false, canRedo: false },
    })),
    search: vi.fn(async () => []),
    getSettings: vi.fn(async () => ({ lastLibrary, theme: "light" as const, findSimilar: "unset" as const })),
    setSettings: vi.fn(async () => {}),
    systemRamGb: vi.fn(async () => 16),
    pickFolder: vi.fn(async () => "C:\\Références"),
    pickImages: vi.fn(async () => []),
    revealFolder: vi.fn(async () => {}),
    assetUrl: (p: string) => p,
    undo: vi.fn(async () => ({ references: [], removed: [], canUndo: false, canRedo: false })),
    redo: vi.fn(async () => ({ references: [], removed: [], canUndo: false, canRedo: false })),
    addTags: vi.fn(),
    updateTag: vi.fn(),
    removeTag: vi.fn(),
    addTechnique: vi.fn(),
    demoExamples: vi.fn(async () => []),
    setField: vi.fn(async () => ({ references: [], removed: [], canUndo: true, canRedo: false })),
    importBytes: vi.fn(async () => ({ report: { added: [], duplicates: [], skipped: [] }, change: { references: [], removed: [], canUndo: false, canRedo: false } })),
    imagePath: vi.fn(async () => ""),
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
    addLink: vi.fn(),
    updateLink: vi.fn(),
    removeLink: vi.fn(),
    createBoard: vi.fn(),
    renameBoard: vi.fn(),
    setBoardMembers: vi.fn(),
    deleteBoard: vi.fn(),
    exportBoard: vi.fn(),
    scorePair: vi.fn(),
    lightboxSource: vi.fn(async (id: string) => ({ path: `C:\\lib\\images\\${id}.jpg`, full: true, width: 1, height: 1 })),
    intakeBusy: vi.fn(async () => {}),
    retrySave: vi.fn(async () => {}),
    exitWithoutSaving: vi.fn(async () => {}),
    onSaveStatus: vi.fn(async () => () => {}),
    onSaveFailed: vi.fn(async () => () => {}),
    onCloseWaiting: vi.fn(async () => () => {}),
    // Plan 5: Find similar stays off in these tests.
    similarStatus: vi.fn(async () => ({ phase: "off" as const, downloadDone: 0, downloadTotal: 213373093, indexed: 0, total: 0, diskBytes: 0, error: null })),
    similarEnable: vi.fn(async () => ({ phase: "off" as const, downloadDone: 0, downloadTotal: 213373093, indexed: 0, total: 0, diskBytes: 0, error: null })),
    similarDisable: vi.fn(async () => ({ phase: "off" as const, downloadDone: 0, downloadTotal: 213373093, indexed: 0, total: 0, diskBytes: 0, error: null })),
    similarRemoveModel: vi.fn(async () => ({ phase: "off" as const, downloadDone: 0, downloadTotal: 213373093, indexed: 0, total: 0, diskBytes: 0, error: null })),
    similarPause: vi.fn(async () => ({ phase: "off" as const, downloadDone: 0, downloadTotal: 213373093, indexed: 0, total: 0, diskBytes: 0, error: null })),
    similarByRef: vi.fn(async () => []),
    similarByText: vi.fn(async () => []),
    similarByFile: vi.fn(async () => []),
    onSimilarStatus: vi.fn(async () => () => {}),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

describe("first run", () => {
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  });

  it("shows the three steps when there is no lastLibrary, and Not now records off", async () => {
    const api = fakeApi(null);
    const done = boot(document.body, api);
    await tick();
    const fr = $(".firstrun");
    expect(fr.querySelectorAll(".fr-step")).toHaveLength(3);
    expect(fr.textContent).toContain("Start with the demo set (about 50 public-domain works)");
    expect(fr.textContent).toContain(FIND_SIMILAR_COPY);
    expect(fr.textContent).toContain("16 GB of RAM");
    expect($<HTMLInputElement>("#fr-demo").checked).toBe(true);
    expect([...fr.querySelectorAll("[data-fs]")].map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
    expect(document.activeElement).toBe($('[data-pick="create"]')); // focus moves into the dialog

    $<HTMLButtonElement>('[data-pick="create"]').click();
    await tick();
    expect($<HTMLButtonElement>("#fr-go").disabled).toBe(true); // Find similar not answered yet
    $<HTMLButtonElement>('[data-fs="off"]').click();
    expect(api.setSettings).toHaveBeenCalledWith({ findSimilar: "off" });
    $<HTMLButtonElement>("#fr-go").click();
    const view = await done;
    expect(api.createLibrary).toHaveBeenCalledWith("C:\\Références", true);
    expect(document.querySelector(".firstrun")).toBeNull();
    // The view runs on the root Rust returned, not the picked folder; Rust saves lastLibrary.
    await view.ready;
    expect($("#data-source").textContent).toBe("Library: Horus Library");
    expect($("#data-source").title).toBe("C:\\Références\\Horus Library");
    expect(api.setSettings).not.toHaveBeenCalledWith(expect.objectContaining({ lastLibrary: expect.anything() }));
    // B7: boot() builds the Store from the opened library and mounts the view on it
    expect(view.store.root).toBe(lib.root);
    expect(api.getTaxonomy).toHaveBeenCalledTimes(1);
    expect(api.openLibrary).not.toHaveBeenCalled();
    // Task 9: boot wires the Inbox, the view toggle and the Library menu
    expect(document.querySelector("#inbox .inbox-head")).not.toBeNull();
    expect(document.body.dataset.view).toBe("reference");
    expect(document.querySelector("#library-menu + .lib-menu")).not.toBeNull();
    view.destroy();
  });

  it("firstrun_copy_and_no_default: the SPEC sentence, then RAM and download size; nothing pre-selected", async () => {
    const api = fakeApi(null);
    void boot(document.body, api);
    await tick();
    await tick();
    const fr = $(".firstrun");
    expect(fr.textContent).toContain(FIND_SIMILAR_COPY);
    expect($("#fr-ram").textContent).toBe("Download: 213 MB · This computer: 16 GB of RAM");
    const choices = [...fr.querySelectorAll<HTMLElement>("[data-fs]")];
    expect(choices.map((b) => b.getAttribute("aria-pressed"))).toEqual(["false", "false"]);
    expect(choices).not.toContain(document.activeElement);
  });

  async function begin(api: Api, choice: "on" | "off") {
    const done = boot(document.body, api);
    await tick();
    $<HTMLButtonElement>('[data-pick="create"]').click();
    await tick();
    $<HTMLButtonElement>(`[data-fs="${choice}"]`).click();
    return { done }; // wrapped, so awaiting begin doesn't wait for boot
  }

  it("firstrun_enables_after_begin: a click only records the choice; Begin's library then enables, un-awaited", async () => {
    const api = fakeApi(null);
    let release!: () => void;
    vi.mocked(api.createLibrary).mockImplementationOnce(() => new Promise((r) => (release = () => r(lib))));
    const { done } = await begin(api, "on");
    expect(api.setSettings).toHaveBeenCalledWith({ findSimilar: "on" });
    expect(api.similarEnable).not.toHaveBeenCalled(); // the choice can still change before Begin
    $<HTMLButtonElement>("#fr-go").click();
    await tick();
    expect(api.similarEnable).not.toHaveBeenCalled(); // not before the library exists
    vi.mocked(api.similarEnable).mockReturnValueOnce(new Promise(() => {})); // a download that never ends
    release();
    const view = await done; // first run finishes without waiting on the download
    expect(api.similarEnable).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it("Not now never enables", async () => {
    const api = fakeApi(null);
    const { done } = await begin(api, "off");
    $<HTMLButtonElement>("#fr-go").click();
    const view = await done;
    expect(api.similarEnable).not.toHaveBeenCalled();
    // boot wires the top bar's gear to the Settings panel
    $<HTMLButtonElement>("#settings").click();
    expect(document.querySelector('.settings[role="dialog"]')).not.toBeNull();
    view.destroy();
    expect(document.querySelector(".settings")).toBeNull();
  });

  it("firstrun_enable_failure_notice: the first error status shows its copy once, as a notice", async () => {
    const api = fakeApi(null);
    // Every subscriber hears it: Settings (Task 6) and the status bar (Task 7) both listen.
    type Status = Parameters<Parameters<Api["onSimilarStatus"]>[0]>[0];
    const subs: ((s: Status) => void)[] = [];
    const emit = (s: Status) => subs.forEach((cb) => cb(s));
    vi.mocked(api.onSimilarStatus).mockImplementation(async (cb) => (subs.push(cb), () => {}));
    const { done } = await begin(api, "on");
    $<HTMLButtonElement>("#fr-go").click();
    const view = await done;
    await tick();
    const notice = $("#import-notice");
    expect(notice.hidden).toBe(true);
    const err = { phase: "error" as const, downloadDone: 0, downloadTotal: 213373093, indexed: 0, total: 0, diskBytes: 0 };
    emit({ ...err, error: "Couldn't reach the download. Check your connection and try again." });
    expect(notice.hidden).toBe(false);
    expect(notice.textContent).toContain("Couldn't reach the download. Check your connection and try again.");
    expect(notice.getAttribute("aria-label")).toBe("Notice");
    // Open Settings goes straight to the Find similar section
    $<HTMLButtonElement>("#import-notice [data-open-settings]").click();
    await tick();
    expect(document.querySelector('.settings[role="dialog"]')).not.toBeNull();
    expect(document.activeElement?.getAttribute("role")).toBe("switch");
    $(".settings").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    $<HTMLButtonElement>("#import-dismiss").click();
    emit({ ...err, error: "Find similar couldn't start on this computer." });
    expect(notice.textContent).not.toContain("couldn't start"); // once only
    view.destroy();
  });

  it("a rejected enable shows the catch-all copy once, never the raw text", async () => {
    const api = fakeApi(null);
    vi.mocked(api.similarEnable).mockRejectedValueOnce("Io(\"os error 112\")");
    const { done } = await begin(api, "on");
    $<HTMLButtonElement>("#fr-go").click();
    const view = await done;
    await tick();
    expect($("#import-notice").textContent).toContain("Find similar ran into a problem. Try again.");
    expect($("#import-notice").textContent).not.toContain("os error");
    view.destroy();
  });

  it("boot first clears a busy intake left by a reload, before anything can wait (round 2)", () => {
    const api = fakeApi(null);
    void boot(document.body, api);
    expect(api.intakeBusy).toHaveBeenCalledWith(false);
    const first = (f: unknown) => vi.mocked(f as () => void).mock.invocationCallOrder[0];
    expect(first(api.intakeBusy)).toBeLessThan(first(api.getSettings)); // the clear goes out first
  });

  it("shows first run with a readable message when lastLibrary fails to open", async () => {
    void boot(document.body, fakeApi("D:\\moved"));
    await tick();
    await tick();
    expect($(".fr-error").textContent).toContain("could not open your last library at D:\\moved");
  });
});

describe("boot wiring (Task 9)", () => {
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  });

  it("a Tag-like-this drop lands on the new Inbox item with its preset, past a retained tagged item (fix round 1, I1)", async () => {
    const full: Tag = { id: "t1", operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.feature", suggested: false };
    const mk = (id: string, tags: Tag[] = []): Reference => ({
      id, title: `Plate ${id}`, file: `images/${id}.jpg`, hash: id, width: 3, height: 4,
      addedAt: "2026-11-25T00:00:00Z", tags, thumb256: id, thumb1024: id,
    });
    const library: LibraryView = { root: "C:/lib", references: [mk("s"), mk("r1", [full])], links: [], boards: [], warning: null, taxonomyReadOnly: false };
    const api: Api = {
      ...fakeApi("C:/lib"),
      openLibrary: vi.fn(async () => library),
      getTaxonomy: vi.fn(async () => seedJson as unknown as Taxonomy),
      importPaths: vi.fn(async () => ({ report: { added: ["n1"], duplicates: [], skipped: [] }, change: { references: [mk("n1")], removed: [], canUndo: true, canRedo: false } })),
    };
    // Every listener hears it: intake and Find similar's drop target (Plan 5 Task 7) both listen.
    const drops: ((e: { payload: DragDropEvent }) => void)[] = [];
    const drop = (e: { payload: DragDropEvent }) => drops.forEach((cb) => cb(e));
    const win = { onDragDropEvent: vi.fn((cb: (e: { payload: DragDropEvent }) => void) => (drops.push(cb), Promise.resolve(() => {}))) };
    const view = await boot(document.body, api, win);
    await view.ready;
    await new Promise((r) => setTimeout(r, 260));

    // The artist tags the first Inbox item; it stays on screen, marked tagged.
    $<HTMLButtonElement>('[data-view-tab="inbox"]').click();
    expect($(".inbox-tile.is-cur").dataset.id).toBe("s");
    view.store.apply({ references: [mk("s", [{ ...full, id: "t2" }])], removed: [], canUndo: true, canRedo: false });
    expect($(".inbox-tile.is-tagged").dataset.id).toBe("s");

    // Back on the Reference view, an image is dropped onto r1's plate.
    $<HTMLButtonElement>('[data-view-tab="reference"]').click();
    // As in the real app: the drop point hits r1's whole-image region box, which lies over the plate.
    const box = $("#boxes .box");
    document.elementFromPoint = vi.fn(() => box);
    drop({ payload: { type: "drop", paths: ["C:/in/x.jpg"], position: { x: 1, y: 1 } } as unknown as DragDropEvent });
    for (let i = 0; i < 4; i++) await tick();

    expect(document.body.dataset.view).toBe("inbox");
    expect($(".inbox-tile.is-cur").dataset.id).toBe("n1");
    const picker = $(".inbox-dock .picker");
    expect(picker.dataset.ref).toBe("n1");
    expect([...picker.querySelectorAll<HTMLElement>(".pk-card.is-ticked")].map((c) => c.dataset.tech)).toEqual(["chiaroscuro"]);
    view.destroy();
  });

  it("one openCompare: the Galaxy's returns to the Galaxy, the Reference view's passes no onClose (Task 7)", async () => {
    const full: Tag = { id: "t1", operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.feature", suggested: false };
    const mk = (id: string, tags: Tag[] = []): Reference => ({
      id, title: `Plate ${id}`, file: `images/${id}.jpg`, hash: id, width: 3, height: 4,
      addedAt: "2026-11-25T00:00:00Z", tags, thumb256: id, thumb1024: id,
    });
    const library: LibraryView = { root: "C:/lib", references: [mk("s"), mk("r1", [full])], links: [], boards: [], warning: null, taxonomyReadOnly: false };
    const api: Api = { ...fakeApi("C:/lib"), openLibrary: vi.fn(async () => library), getTaxonomy: vi.fn(async () => seedJson as unknown as Taxonomy) };
    const view = await boot(document.body, api);
    await view.ready;
    view.show("r1");
    $<HTMLButtonElement>('[data-view-tab="galaxy"]').click();
    wiring.galaxy!.openCompare!("r1", "s");
    const [a, b, opts] = wiring.compare[wiring.compare.length - 1] as [string, string, { onClose(a: string): void }];
    expect([a, b]).toEqual(["r1", "s"]);
    $<HTMLButtonElement>('[data-view-tab="reference"]').click();
    opts.onClose("r1"); // Esc in that Compare
    expect(document.body.dataset.view).toBe("galaxy");
    // the Reference view's Shift-click (here on a stand-in row) calls it with no onClose
    $<HTMLButtonElement>('[data-view-tab="reference"]').click();
    document.body.insertAdjacentHTML("beforeend", `<button id="row-s" data-go="s"></button>`);
    $("#row-s").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true }));
    expect(wiring.compare[wiring.compare.length - 1]).toEqual(["r1", "s"]);
    view.destroy();
  });

  it("a finished Inbox shows the empty copy on return, with no picker docked (QA F2)", async () => {
    const full: Tag = { id: "t1", operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.feature", suggested: false };
    const mk = (id: string, tags: Tag[] = []): Reference => ({
      id, title: `Plate ${id}`, file: `images/${id}.jpg`, hash: id, width: 3, height: 4,
      addedAt: "2026-11-25T00:00:00Z", tags, thumb256: id, thumb1024: id,
    });
    const library: LibraryView = { root: "C:/lib", references: [mk("s"), mk("r1", [full])], links: [], boards: [], warning: null, taxonomyReadOnly: false };
    const api: Api = {
      ...fakeApi("C:/lib"),
      openLibrary: vi.fn(async () => library),
      getTaxonomy: vi.fn(async () => seedJson as unknown as Taxonomy),
    };
    const view = await boot(document.body, api);
    await view.ready;

    $<HTMLButtonElement>('[data-view-tab="inbox"]').click();
    expect($(".inbox-tile.is-cur").dataset.id).toBe("s");
    view.store.apply({ references: [mk("s", [{ ...full, id: "t2" }])], removed: [], canUndo: true, canRedo: false });
    expect($(".inbox-tile.is-tagged").dataset.id).toBe("s"); // Task 9: it stays while the artist is on it
    expect(document.querySelector(".inbox-dock .picker")).not.toBeNull();

    $<HTMLButtonElement>('[data-view-tab="reference"]').click();
    $<HTMLButtonElement>('[data-view-tab="inbox"]').click();
    expect($(".inbox-empty").hidden).toBe(false);
    expect(document.querySelector(".inbox-tile")).toBeNull();
    expect(document.querySelector(".inbox-dock .picker")).toBeNull();
    view.destroy();
  });
});
