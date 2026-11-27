// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "./api";
import { mountSearch, type SearchHooks } from "./search";

const settle = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("search", () => {
  let life: AbortController;
  let api: Api;
  let resolve: (ids: string[]) => void;
  beforeEach(() => {
    document.body.innerHTML = `<div class="search"><input id="q"><ul id="q-results" role="listbox" hidden></ul></div>`;
    life = new AbortController();
    api = { search: vi.fn(async () => []) } as unknown as Api;
  });
  afterEach(() => life.abort());

  it("similar_debounced_search_instant", async () => {
    const similar = vi.fn(() => new Promise<string[]>((r) => (resolve = r)));
    const hooks: SearchHooks = {
      techniqueName: (id) => id,
      operationLabel: () => ({ name: "", plain: "", color: "" }),
      referenceTitle: (id) => `Plate ${id}`,
      onTechnique: () => {},
      onReference: () => {},
      similar,
    };
    mountSearch(document.body, api, hooks, life.signal);
    const input = document.querySelector<HTMLInputElement>("#q")!;
    for (const q of ["b", "ba", "bac"]) {
      input.value = q;
      input.dispatchEvent(new Event("input"));
      await settle(20);
    }
    expect(api.search).toHaveBeenCalledTimes(3);
    expect(similar).not.toHaveBeenCalled();
    const group = () => document.querySelector('[aria-label="Looks similar"]');
    expect(group()!.textContent).toContain("Searching…");
    await settle(200);
    expect(similar).toHaveBeenCalledTimes(1);
    expect(similar).toHaveBeenCalledWith("bac");
    expect(group()!.textContent).toContain("Searching…");
    resolve(["x"]);
    await settle(0);
    expect(group()!.textContent).not.toContain("Searching…");
    expect(group()!.querySelector('[role="option"][data-r="x"]')).not.toBeNull();
  });

  it("without the similar hook only option A runs", async () => {
    const hooks: SearchHooks = {
      techniqueName: (id) => id,
      operationLabel: () => ({ name: "", plain: "", color: "" }),
      referenceTitle: () => undefined,
      onTechnique: () => {},
      onReference: () => {},
    };
    mountSearch(document.body, api, hooks, life.signal);
    const input = document.querySelector<HTMLInputElement>("#q")!;
    input.value = "moody";
    input.dispatchEvent(new Event("input"));
    await settle(200);
    expect(api.search).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[aria-label="Looks similar"]')).toBeNull();
  });
});
