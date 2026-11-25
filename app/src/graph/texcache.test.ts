import { describe, expect, it, vi } from "vitest";
import { TexCache } from "./texcache";

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("TexCache", () => {
  it("lru_evicts_and_unloads", async () => {
    const unload = vi.fn();
    const cache = new TexCache<string>(2, async (url) => `tex:${url}`, unload);
    cache.get("a");
    cache.get("b");
    await settle();
    cache.touch("a"); // only touch decides: b is now least recently touched
    cache.get("c");
    await settle();
    expect(unload).toHaveBeenCalledOnce();
    expect(unload).toHaveBeenCalledWith("tex:b");
    expect(cache.size()).toBe(2);
    expect(cache.get("a")).toBe("tex:a");
    expect(cache.get("c")).toBe("tex:c");
  });

  it("failed_is_sticky", async () => {
    const load = vi.fn(() => Promise.reject(new Error("missing")));
    const cache = new TexCache<string>(2, load, () => {});
    expect(cache.get("x")).toBe("loading");
    await settle();
    expect(cache.get("x")).toBe("failed");
    expect(cache.get("x")).toBe("failed");
    expect(load).toHaveBeenCalledOnce();
    expect(cache.size()).toBe(0);
  });

  it("a loader that throws synchronously also fails without throwing", async () => {
    const cache = new TexCache<string>(2, () => { throw new Error("bad"); }, () => {});
    expect(cache.get("x")).toBe("loading");
    await settle();
    expect(cache.get("x")).toBe("failed");
  });

  it("a loader that resolves nothing counts as failed", async () => {
    const load = vi.fn(async () => undefined as unknown as string);
    const unload = vi.fn();
    const cache = new TexCache<string>(1, load, unload);
    cache.get("x");
    await settle();
    expect(cache.get("x")).toBe("failed");
    expect(load).toHaveBeenCalledOnce();
    cache.get("y");
    await settle();
    expect(unload).not.toHaveBeenCalled();
  });

  it("loading_dedupes", async () => {
    const load = vi.fn(async (url: string) => url);
    const cache = new TexCache<string>(2, load, () => {});
    expect(cache.get("a")).toBe("loading");
    expect(cache.get("a")).toBe("loading");
    expect(load).toHaveBeenCalledOnce();
    await settle();
    expect(cache.get("a")).toBe("a");
  });
});
