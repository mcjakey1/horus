import { describe, expect, it, vi } from "vitest";
import type { LibraryView, Reference, Taxonomy } from "./api";
import { storeSource } from "./data";
import { createStore } from "./store";

const ref = (id: string): Reference => ({
  id, title: `Plate ${id}`, file: `images/${id}.jpg`, hash: id, width: 3, height: 4,
  addedAt: "2026-11-25T00:00:00Z", tags: [], thumb256: id, thumb1024: id,
});
const tax = { operations: [], techniques: [] } as unknown as Taxonomy;
const library: LibraryView = {
  root: "C:/lib", references: [ref("a"), ref("b")],
  links: [{ id: "l1", fromRef: "a", toRef: "b", why: "same light" }], warning: null, taxonomyReadOnly: false,
};
const change = { references: [ref("c")], removed: [], canUndo: true, canRedo: false };

describe("storeSource", () => {
  it("store_source_versions", () => {
    const store = createStore(library, tax);
    const src = storeSource(store);
    const v0 = src.get().version;
    const one = vi.fn();
    const two = vi.fn();
    const gone = vi.fn();
    src.subscribe(one);
    src.subscribe(two);
    src.subscribe(gone)();
    store.apply(change);
    expect(src.get().version).toBe(v0 + 1);
    expect(one).toHaveBeenCalledTimes(1);
    expect(two).toHaveBeenCalledTimes(1);
    expect(one).toHaveBeenCalledWith(src.get(), { reset: false });
    expect(one.mock.calls[0][0].refs.has("c")).toBe(true);
    expect(gone).not.toHaveBeenCalled();
    store.apply(change);
    expect(src.get().version).toBe(v0 + 2);
  });

  it("store_source_reset_event", () => {
    const store = createStore(library, tax);
    const src = storeSource(store);
    const fn = vi.fn();
    src.subscribe(fn);
    const other = { ...library, root: "D:/other", references: [ref("z")], links: [], taxonomyReadOnly: true };
    const tax2 = { operations: [], techniques: [] } as unknown as Taxonomy;
    store.reset(other, tax2);
    expect(fn).toHaveBeenCalledTimes(1);
    const [snap, e] = fn.mock.calls[0];
    expect(e).toEqual({ reset: true });
    expect([...snap.refs.keys()]).toEqual(["z"]);
    expect(snap.links).toEqual([]);
    expect(snap.tax).toBe(tax2);
    expect(snap.taxonomyReadOnly).toBe(true);
  });

  it("store_source_fields", () => {
    const store = createStore({ ...library, taxonomyReadOnly: true }, tax);
    const s = storeSource(store).get();
    expect(s.refs).toBe(store.refs);
    expect(s.links).toBe(store.links);
    expect(s.tax).toBe(store.tax);
    expect(s.taxonomyReadOnly).toBe(true);
    expect(s.inScope("a")).toBe(true);
    expect(s.inScope("nope")).toBe(true);
  });
});
