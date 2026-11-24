// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import html from "../../index.html?raw";
import type { Api, LibraryView, Reference, Scored, Tag, Taxonomy } from "../api";
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
    assetUrl: (path: string) => `asset://${encodeURIComponent(path)}`,
  };
}

const settle = () => new Promise((r) => setTimeout(r, 260));

describe("Reference view", () => {
  let api: Api;
  beforeEach(async () => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    api = fakeApi();
    const view = mountReference(document.body, api);
    await view.ready;
    view.show("a");
    await settle();
  });

  it("renders one callout per tag", () => {
    expect(document.querySelectorAll("#pane-callouts .call")).toHaveLength(2);
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
  });
});
