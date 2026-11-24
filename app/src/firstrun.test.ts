// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import html from "../index.html?raw";
import type { DragDropEvent } from "@tauri-apps/api/webview";
import seedJson from "../src-tauri/resources/taxonomy.json";
import type { Api, LibraryView, Reference, Tag, Taxonomy } from "./api";
import { boot, FIND_SIMILAR_COPY } from "./firstrun";

// The library may land in a "Horus Library" subfolder of the picked folder.
const lib: LibraryView = {
  root: "C:\\Références\\Horus Library",
  references: [],
  links: [],
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
    importPaths: vi.fn(async () => ({ report: { added: [], duplicates: [], skipped: [] }, change: { references: [], removed: [], canUndo: false, canRedo: false } })),
    importBytes: vi.fn(async () => ({ report: { added: [], duplicates: [], skipped: [] }, change: { references: [], removed: [], canUndo: false, canRedo: false } })),
    setField: vi.fn(async () => ({ references: [], removed: [], canUndo: true, canRedo: false })),
    search: vi.fn(async () => []),
    getSettings: vi.fn(async () => ({ lastLibrary, theme: "light" as const, findSimilar: "unset" as const })),
    setSettings: vi.fn(async () => {}),
    systemRamGb: vi.fn(async () => 16),
    pickFolder: vi.fn(async () => "C:\\Références"),
    pickImages: vi.fn(async () => []),
    assetUrl: (p: string) => p,
    undo: vi.fn(async () => ({ references: [], removed: [], canUndo: false, canRedo: false })),
    redo: vi.fn(async () => ({ references: [], removed: [], canUndo: false, canRedo: false })),
    addTags: vi.fn(),
    updateTag: vi.fn(),
    removeTag: vi.fn(),
    addTechnique: vi.fn(),
    demoExamples: vi.fn(async () => []),
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
    const library: LibraryView = { root: "C:/lib", references: [mk("s"), mk("r1", [full])], links: [], warning: null, taxonomyReadOnly: false };
    const api: Api = {
      ...fakeApi("C:/lib"),
      openLibrary: vi.fn(async () => library),
      getTaxonomy: vi.fn(async () => seedJson as unknown as Taxonomy),
      importPaths: vi.fn(async () => ({ report: { added: ["n1"], duplicates: [], skipped: [] }, change: { references: [mk("n1")], removed: [], canUndo: true, canRedo: false } })),
    };
    let drop!: (e: { payload: DragDropEvent }) => void;
    const win = { onDragDropEvent: vi.fn((cb: typeof drop) => ((drop = cb), Promise.resolve(() => {}))) };
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
    expect($("#plate").dataset.refDrop).toBe("r1");
    document.elementFromPoint = vi.fn(() => $("#plate"));
    drop({ payload: { type: "drop", paths: ["C:/in/x.jpg"], position: { x: 1, y: 1 } } as unknown as DragDropEvent });
    for (let i = 0; i < 4; i++) await tick();

    expect(document.body.dataset.view).toBe("inbox");
    expect($(".inbox-tile.is-cur").dataset.id).toBe("n1");
    const picker = $(".inbox-dock .picker");
    expect(picker.dataset.ref).toBe("n1");
    expect([...picker.querySelectorAll<HTMLElement>(".pk-card.is-ticked")].map((c) => c.dataset.tech)).toEqual(["chiaroscuro"]);
    view.destroy();
  });
});
