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

describe("TexCache lifecycle (Task 4)", () => {
  it("clear_unloads_every_live_texture", async () => {
    const unload = vi.fn();
    const cache = new TexCache<string>(5, async (url) => `tex:${url}`, unload);
    cache.get("a");
    cache.get("b");
    await settle();
    cache.clear();
    expect(unload.mock.calls.map((c) => c[0]).sort()).toEqual(["tex:a", "tex:b"]);
    expect(cache.size()).toBe(0);
    // After a clear the URLs load again (a restored WebGL context needs new textures).
    expect(cache.get("a")).toBe("loading");
  });

  it("clear_forgets_failures", async () => {
    const load = vi.fn().mockRejectedValueOnce(new Error("lost")).mockResolvedValue("tex");
    const cache = new TexCache<string>(5, load, () => {});
    cache.get("a");
    await settle();
    expect(cache.get("a")).toBe("failed");
    cache.clear();
    cache.get("a");
    await settle();
    expect(cache.get("a")).toBe("tex");
  });

  it("urls_lists_live_textures_oldest_first", async () => {
    const cache = new TexCache<string>(5, async (url) => url, () => {});
    cache.get("a");
    cache.get("b");
    cache.get("c");
    await settle();
    cache.touch("a");
    expect(cache.urls()).toEqual(["b", "c", "a"]);
  });

  it("load_settling_after_clear_is_unloaded_not_inserted", async () => {
    let resolve!: (t: string) => void;
    const unload = vi.fn();
    const cache = new TexCache<string>(5, () => new Promise<string>((r) => (resolve = r)), unload);
    cache.get("a");
    cache.clear();
    resolve("tex:a");
    await settle();
    expect(unload).toHaveBeenCalledWith("tex:a");
    expect(cache.size()).toBe(0);
    expect(cache.urls()).toEqual([]);
  });

  it("load_settling_after_destroy_is_unloaded_and_nothing_loads_again", async () => {
    let resolve!: (t: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const unload = vi.fn();
    const cache = new TexCache<string>(5, load, unload);
    cache.get("a");
    cache.destroy();
    resolve("tex:a");
    await settle();
    expect(unload).toHaveBeenCalledWith("tex:a");
    expect(cache.size()).toBe(0);
    expect(cache.get("b")).toBe("failed");
    expect(load).toHaveBeenCalledOnce();
  });

  it("load_settling_after_its_url_was_evicted_is_unloaded", async () => {
    let resolve!: (t: string) => void;
    const unload = vi.fn();
    const cache = new TexCache<string>(5, () => new Promise<string>((r) => (resolve = r)), unload);
    cache.get("a");
    cache.evict("a");
    resolve("tex:a");
    await settle();
    expect(unload).toHaveBeenCalledWith("tex:a");
    expect(cache.size()).toBe(0);
    expect(cache.get("a")).toBe("loading"); // evicted, not failed: it may load again
  });

  it("evict_unloads_a_live_texture", async () => {
    const unload = vi.fn();
    const cache = new TexCache<string>(5, async (url) => `tex:${url}`, unload);
    cache.get("a");
    await settle();
    cache.evict("a");
    expect(unload).toHaveBeenCalledWith("tex:a");
    expect(cache.size()).toBe(0);
  });
});

describe("TexCache.cancel", () => {
  it("cancel_orphans_a_load_but_keeps_live_textures", async () => {
    const resolvers: ((t: string) => void)[] = [];
    const unload = vi.fn();
    const cache = new TexCache<string>(5, () => new Promise<string>((r) => resolvers.push(r)), unload);
    cache.get("a");
    resolvers[0]("tex:a");
    await settle();
    cache.get("b");
    cache.cancel("a"); // live: kept
    cache.cancel("b"); // loading: orphaned
    resolvers[1]("tex:b");
    await settle();
    expect(cache.urls()).toEqual(["a"]);
    expect(unload).toHaveBeenCalledOnce();
    expect(unload).toHaveBeenCalledWith("tex:b");
  });
});

describe("TexCache.loading", () => {
  it("lists_only_in_flight_urls", async () => {
    let resolve!: (t: string) => void;
    const cache = new TexCache<string>(5, (url) => (url === "slow" ? new Promise<string>((r) => (resolve = r)) : Promise.resolve(url)), () => {});
    cache.get("fast");
    cache.get("slow");
    await settle();
    expect(cache.loading()).toEqual(["slow"]);
    resolve("slow");
    await settle();
    expect(cache.loading()).toEqual([]);
  });
});
