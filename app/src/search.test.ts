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

  it("an arrow-key selection survives option B arriving (review 3)", async () => {
    api = { search: vi.fn(async () => [
      { kind: "technique", id: "t1", operationId: "op", count: 1 },
      { kind: "technique", id: "t2", operationId: "op", count: 1 },
    ]) } as unknown as Api;
    const chosen = vi.fn();
    const hooks: SearchHooks = {
      techniqueName: (id) => id,
      operationLabel: () => ({ name: "", plain: "", color: "" }),
      referenceTitle: (id) => `Plate ${id}`,
      onTechnique: chosen,
      onReference: () => {},
      similar: () => new Promise<string[]>((r) => (resolve = r)),
    };
    mountSearch(document.body, api, hooks, life.signal);
    const input = document.querySelector<HTMLInputElement>("#q")!;
    input.value = "x";
    input.dispatchEvent(new Event("input"));
    await settle(0);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(input.getAttribute("aria-activedescendant")).toBe("opt-1");
    await settle(200);
    resolve(["r1"]);
    await settle(0);
    expect(document.querySelector('[data-r="r1"]')).not.toBeNull();
    expect(input.getAttribute("aria-activedescendant")).toBe("opt-1");
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(chosen).toHaveBeenCalledWith("t2");
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
