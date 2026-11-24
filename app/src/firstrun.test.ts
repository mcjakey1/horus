// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import html from "../index.html?raw";
import type { Api, LibraryView } from "./api";
import { boot, FIND_SIMILAR_COPY } from "./firstrun";

const lib: LibraryView = { root: "C:\Références", references: [], links: [], warning: null, seedWarnings: [] };

function fakeApi(lastLibrary: string | null): Api {
  return {
    createLibrary: vi.fn(async () => lib),
    openLibrary: vi.fn(async () => {
      throw "That folder is not a Horus library.";
    }),
    getTaxonomy: vi.fn(async () => ({ operations: [], domains: [], branches: [], techniques: [], branchTechniques: [] })),
    related: vi.fn(async () => []),
    importPaths: vi.fn(async () => ({ added: [], duplicates: [], skipped: [] })),
    search: vi.fn(async () => []),
    getSettings: vi.fn(async () => ({ lastLibrary, theme: "light" as const, findSimilar: "unset" as const })),
    setSettings: vi.fn(async () => {}),
    systemRamGb: vi.fn(async () => 16),
    pickFolder: vi.fn(async () => "C:\Références"),
    pickImages: vi.fn(async () => []),
    assetUrl: (p: string) => p,
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

    $<HTMLButtonElement>('[data-pick="create"]').click();
    await tick();
    expect($<HTMLButtonElement>("#fr-go").disabled).toBe(true); // Find similar not answered yet
    $<HTMLButtonElement>('[data-fs="off"]').click();
    expect(api.setSettings).toHaveBeenCalledWith({ findSimilar: "off" });
    $<HTMLButtonElement>("#fr-go").click();
    await done;
    expect(api.createLibrary).toHaveBeenCalledWith("C:\Références", true);
    expect(document.querySelector(".firstrun")).toBeNull();
  });

  it("shows first run with a readable message when lastLibrary fails to open", async () => {
    void boot(document.body, fakeApi("D:\moved"));
    await tick();
    await tick();
    expect($(".fr-error").textContent).toContain("could not open your last library at D:\moved");
  });
});
