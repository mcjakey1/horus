// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import html from "../index.html?raw";
import type { DragDropEvent } from "@tauri-apps/api/webview";
import seedJson from "../src-tauri/resources/taxonomy.json";
import type { Api, LibraryView, Reference, Tag, Taxonomy } from "./api";
import { boot, FIND_SIMILAR_COPY, reloadThumbs, verifyImageFiles } from "./firstrun";
import { createStore } from "./store";

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
    getSettings: vi.fn(async () => ({ lastLibrary, theme: "light" as const, findSimilar: "unset" as const, introSeen: true })),
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
    recoverOrphans: vi.fn(async () => ({ references: [], removed: [], canUndo: true, canRedo: false })),
    onThumbsRebuilt: vi.fn(async () => () => {}),
    onMenu: vi.fn(async () => () => {}),
    appVersion: vi.fn(async () => "1.0.0"),
    noticesPath: vi.fn(async () => "C:/Horus/THIRD_PARTY_NOTICES.md"),
    openPath: vi.fn(async () => {}),
    verifyImageFiles: vi.fn(async () => ({ changed: [], checked: 0, total: 0 })),
    cancelVerify: vi.fn(async () => {}),
    onVerifyProgress: vi.fn(async () => () => {}),
    onImportProgress: vi.fn(async () => () => {}),
    cancelImport: vi.fn(async () => {}),
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
    expect(api.setSettings).not.toHaveBeenCalled(); // a click only records the choice in memory
    $<HTMLButtonElement>("#fr-go").click();
    const view = await done;
    expect(api.setSettings).toHaveBeenCalledWith({ findSimilar: "off" }); // Begin saves it
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
    // Quitting now saves and downloads nothing: the choice can still change before Begin.
    expect(api.setSettings).not.toHaveBeenCalled();
    expect(api.similarEnable).not.toHaveBeenCalled();
    $<HTMLButtonElement>("#fr-go").click();
    await tick();
    expect(api.similarEnable).not.toHaveBeenCalled(); // not before the library exists
    vi.mocked(api.similarEnable).mockReturnValueOnce(new Promise(() => {})); // a download that never ends
    release();
    const view = await done; // first run finishes without waiting on the download
    expect(api.similarEnable).toHaveBeenCalledTimes(1);
    view.destroy();
  });

  it("a failed save of Not now says so in artist copy, never the raw error (N1)", async () => {
    const api = fakeApi(null);
    vi.mocked(api.setSettings).mockRejectedValueOnce("Could not save settings: Access is denied. (os error 5)");
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { done } = await begin(api, "off");
    $<HTMLButtonElement>("#fr-go").click();
    const view = await done;
    await vi.waitFor(() => expect(document.querySelector("#import-notice")!.textContent).toContain("Horus couldn't save that choice."));
    expect(document.querySelector("#import-notice")!.textContent).not.toContain("os error");
    expect(err).toHaveBeenCalled(); // the raw text goes to the console only
    err.mockRestore();
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

  it("Find similar's tab gets the first shown reference with no manual show (Plan 5 Task 7, review 1)", async () => {
    const ready = { phase: "ready" as const, downloadDone: 0, downloadTotal: 213373093, indexed: 0, total: 0, diskBytes: 0, error: null };
    const mk = (id: string): Reference => ({
      id, title: `Plate ${id}`, file: `images/${id}.jpg`, hash: id, width: 3, height: 4,
      addedAt: "2026-11-25T00:00:00Z", tags: [], thumb256: id, thumb1024: id,
    });
    const library: LibraryView = { root: "C:/lib", references: [mk("p1"), mk("p2")], links: [], boards: [], warning: null, taxonomyReadOnly: false };
    const api: Api = {
      ...fakeApi("C:/lib"),
      openLibrary: vi.fn(async () => library),
      getTaxonomy: vi.fn(async () => seedJson as unknown as Taxonomy),
      similarStatus: vi.fn(async () => ready),
      similarByRef: vi.fn(async () => []),
    };
    const view = await boot(document.body, api);
    await view.ready;
    await new Promise((r) => setTimeout(r, 260));
    const first = view.store.refs.keys().next().value;
    expect(first).toBeDefined();
    expect(api.similarByRef).toHaveBeenCalledWith(first);
    view.destroy();
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

describe("rebuilt thumbnails (Plan 6 Task 2)", () => {
  it("boot subscribes before the open and unsubscribes on destroy", async () => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    const order: string[] = [];
    const off = vi.fn();
    let heard: ((ids: string[]) => void) | null = null;
    const early: Reference = {
      id: "early", title: "Early", file: "early.jpg", hash: "early", width: 3, height: 4,
      addedAt: "2026-11-28T00:00:00Z", tags: [], thumb256: "C:/lib/thumbs/256/early.jpg", thumb1024: "C:/lib/thumbs/1024/early.jpg",
    };
    const setSrc = vi.spyOn(HTMLImageElement.prototype, "src", "set");
    const api: Api = {
      ...fakeApi("C:/lib"),
      openLibrary: vi.fn(async () => (order.push("open"), heard!(["early"]), { root: "C:/lib", references: [early], links: [], boards: [], warning: null, taxonomyReadOnly: false })),
      getTaxonomy: vi.fn(async () => seedJson as unknown as Taxonomy),
      onThumbsRebuilt: vi.fn(async (cb) => ((heard = cb), order.push("subscribe"), off)),
    };
    const view = await boot(document.body, api);
    expect(order).toEqual(["subscribe", "open"]);
    // The id heard during the open is replayed once the views exist: its <img> is re-requested.
    const urls = [api.assetUrl(early.thumb256), api.assetUrl(early.thumb1024)];
    expect(document.querySelector(`img[src="${urls[0]}"], img[src="${urls[1]}"]`)).not.toBeNull();
    // The Inbox sets its tile's src once as it renders; the replay sets it once more.
    expect(setSrc.mock.calls.filter(([v]) => v === urls[0])).toHaveLength(2);
    setSrc.mockRestore();
    view.destroy();
    expect(off).toHaveBeenCalledTimes(1);
  });


  it("reloadThumbs re-requests only the rebuilt references' images", () => {
    const r = (id: string) => ({ id, title: id, file: `${id}.jpg`, hash: id, width: 1, height: 1, addedAt: "", tags: [], thumb256: `C:/t/256/${id}.jpg`, thumb1024: `C:/t/1024/${id}.jpg` });
    const api = { assetUrl: (p: string) => `asset://${p}` } as unknown as Api;
    const store = createStore({ root: "C:/t", references: [r("a"), r("b")], links: [], boards: [], taxonomyReadOnly: false }, seedJson as unknown as Taxonomy);
    document.body.innerHTML = `<img src="asset://C:/t/256/a.jpg"><img src="asset://C:/t/1024/a.jpg"><img src="asset://C:/t/256/b.jpg">`;
    const set: string[] = [];
    document.querySelectorAll("img").forEach((img) => {
      Object.defineProperty(img, "src", { set: (v: string) => set.push(v), get: () => img.getAttribute("src") });
    });
    reloadThumbs(document, api, store, ["a"]);
    expect(set.sort()).toEqual(["asset://C:/t/1024/a.jpg", "asset://C:/t/256/a.jpg"]);
  });
});

describe("the intro in boot (Plan 6 Task 4, R12)", () => {
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  });
  const unseen = (lastLibrary: string | null) => async () =>
    ({ lastLibrary, theme: "light" as const, findSimilar: "unset" as const, introSeen: false });

  it("plays before first run, then records introSeen", async () => {
    const api = fakeApi(null);
    vi.mocked(api.getSettings).mockImplementation(unseen(null));
    const booting = boot(document.body, api);
    await vi.waitFor(() => expect(document.querySelector(".intro")).not.toBeNull());
    expect(document.querySelector(".firstrun")).toBeNull(); // first run waits for the intro
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    await vi.waitFor(() => expect(document.querySelector(".firstrun")).not.toBeNull());
    expect(api.setSettings).toHaveBeenCalledWith({ introSeen: true });
    void booting;
  });

  it("never plays once seen", async () => {
    const api = fakeApi(null);
    const booting = boot(document.body, api);
    await vi.waitFor(() => expect(document.querySelector(".firstrun")).not.toBeNull());
    expect(document.querySelector(".intro")).toBeNull();
    expect(api.setSettings).not.toHaveBeenCalledWith({ introSeen: true });
    void booting;
  });

  it("plays once for a returning artist too, then opens their library", async () => {
    const library: LibraryView = { root: "C:/lib", references: [], links: [], boards: [], warning: null, taxonomyReadOnly: false };
    const api: Api = { ...fakeApi("C:/lib"), openLibrary: vi.fn(async () => library), getTaxonomy: vi.fn(async () => seedJson as unknown as Taxonomy) };
    vi.mocked(api.getSettings).mockImplementation(unseen("C:/lib"));
    const booting = boot(document.body, api);
    await vi.waitFor(() => expect(document.querySelector(".intro")).not.toBeNull());
    expect(api.openLibrary).not.toHaveBeenCalled();
    document.dispatchEvent(new PointerEvent("pointerdown"));
    const view = await booting;
    expect(api.openLibrary).toHaveBeenCalledWith("C:/lib");
    expect(api.setSettings).toHaveBeenCalledWith({ introSeen: true });
    view.destroy();
  });
});

describe("the Help menu (Plan 6 Task 4)", () => {
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  });
  const library: LibraryView = { root: "C:/lib", references: [], links: [], boards: [], warning: null, taxonomyReadOnly: false };
  async function booted() {
    let menu: ((id: "play-intro" | "about" | "verify") => void) | null = null;
    const api: Api = {
      ...fakeApi("C:/lib"),
      openLibrary: vi.fn(async () => library),
      getTaxonomy: vi.fn(async () => seedJson as unknown as Taxonomy),
      onMenu: vi.fn(async (cb) => ((menu = cb), () => {})),
    };
    const view = await boot(document.body, api);
    await vi.waitFor(() => expect(menu).not.toBeNull());
    return { api, view, menu: menu! };
  }

  it("About closes an open Settings first, then opens over everything", async () => {
    const { view, menu } = await booted();
    document.querySelector<HTMLButtonElement>("#settings")!.click();
    expect(document.querySelector(".settings:not(.about)")).not.toBeNull();
    menu("about");
    await vi.waitFor(() => expect(document.querySelector(".about")).not.toBeNull());
    expect(document.querySelector(".settings:not(.about)")).toBeNull();
    expect(document.querySelector(".about")!.textContent).toContain("Version 1.0.0");
    view.destroy();
    expect(document.querySelector(".about")).toBeNull();
  });

  it("a menu item closes an open About first", async () => {
    const { view, menu } = await booted();
    menu("about");
    await vi.waitFor(() => expect(document.querySelector(".about")).not.toBeNull());
    menu("play-intro");
    expect(document.querySelector(".about")).toBeNull();
    expect(document.querySelector(".intro")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
    view.destroy();
  });

  it("Play intro replays it and leaves introSeen alone", async () => {
    const { api, view, menu } = await booted();
    menu("play-intro");
    expect(document.querySelector(".intro")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "x" }));
    await vi.waitFor(() => expect(document.querySelector(".intro")).toBeNull());
    expect(api.setSettings).not.toHaveBeenCalledWith({ introSeen: true });
    view.destroy();
  });
});

describe("Verify image files (Plan 6 Task 4)", () => {
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  });
  const say = (h: string) => {
    const n = document.querySelector<HTMLElement>("#import-notice")!;
    n.querySelector("[data-body]")!.innerHTML = h;
    n.hidden = false;
  };

  it("shows progress with Cancel, then the changed files with Show them", async () => {
    let progress: ((p: { done: number; total: number }) => void) | null = null;
    let finish: (r: { changed: string[]; checked: number; total: number }) => void = () => {};
    const api = {
      ...fakeApi("C:/lib"),
      onVerifyProgress: vi.fn(async (cb: (p: { done: number; total: number }) => void) => ((progress = cb), () => {})),
      verifyImageFiles: vi.fn(() => new Promise<{ changed: string[]; checked: number; total: number }>((r) => (finish = r))),
    } as Api;
    const run = verifyImageFiles(document, api, say);
    await vi.waitFor(() => expect(progress).not.toBeNull());
    progress!({ done: 3, total: 10 });
    const n = document.querySelector("#import-notice")!;
    expect(n.textContent).toContain("Verifying image files 3 of 10");
    n.querySelector<HTMLButtonElement>("[data-cancel]")!.click();
    expect(api.cancelVerify).toHaveBeenCalledTimes(1);
    finish({ changed: ["a", "b"], checked: 10, total: 10 });
    await run;
    expect(n.textContent).toContain("2 image files have changed since they were added.");
    expect(n.querySelector("[data-show-refs]")!.getAttribute("data-show-refs")).toBe("a b");
  });

  it("runs once at a time: a second click keeps the live progress", async () => {
    let finish: (r: { changed: string[]; checked: number; total: number }) => void = () => {};
    const api = {
      ...fakeApi("C:/lib"),
      verifyImageFiles: vi.fn(() => new Promise<{ changed: string[]; checked: number; total: number }>((r) => (finish = r))),
    } as Api;
    const first = verifyImageFiles(document, api, say);
    await verifyImageFiles(document, api, say); // returns at once
    expect(api.verifyImageFiles).toHaveBeenCalledTimes(1);
    expect(document.querySelector("#import-notice [data-cancel]")).not.toBeNull();
    finish({ changed: [], checked: 1, total: 1 });
    await first;
    const again = verifyImageFiles(document, api, say); // free again once it ended
    expect(api.verifyImageFiles).toHaveBeenCalledTimes(2);
    finish({ changed: [], checked: 1, total: 1 });
    await again;
  });

  it("says when it was stopped, or when everything matches", async () => {
    const api = { ...fakeApi("C:/lib"), verifyImageFiles: vi.fn(async () => ({ changed: [], checked: 4, total: 9 })) } as Api;
    await verifyImageFiles(document, api, say);
    expect(document.querySelector("#import-notice")!.textContent).toContain("Verify stopped after 4 of 9 image files.");
    vi.mocked(api.verifyImageFiles).mockResolvedValueOnce({ changed: [], checked: 9, total: 9 });
    await verifyImageFiles(document, api, say);
    expect(document.querySelector("#import-notice")!.textContent).toContain("All 9 image files match the library.");
  });
});

