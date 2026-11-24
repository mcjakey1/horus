import { describe, expect, it, vi } from "vitest";
import type { LibraryView, Reference, Tag, Taxonomy } from "./api";
import { createStore } from "./store";

const tax: Taxonomy = { operations: [], domains: [], branches: [], techniques: [], branchTechniques: [] };
const tax2: Taxonomy = { ...tax, domains: [{ id: "feature", name: "Feature", icon: "", description: "" }] };
const full: Tag = { id: "t1", operationId: "group", techniqueId: "closure", branchId: "group.grouping", suggested: false };
const partial: Tag = { id: "t2", operationId: "group", suggested: false };
const ref = (id: string, tags: Tag[] = [], title = id): Reference => ({
  id,
  title,
  file: `images/${id}.jpg`,
  hash: id,
  width: 1,
  height: 1,
  addedAt: "2026-11-25T00:00:00Z",
  tags,
  thumb256: "",
  thumb1024: "",
});
const view: LibraryView = {
  root: "C:\\a",
  references: [ref("a", [full]), ref("p", [partial]), ref("e")],
  links: [],
  warning: "w",
  taxonomyReadOnly: false,
};

describe("store", () => {
  it("apply merges changed references, deletes removed, swaps the taxonomy and the undo flags", () => {
    const store = createStore(view, tax);
    const seen = vi.fn();
    store.subscribe(seen);
    const c = { references: [ref("a", [full], "A2"), ref("n")], removed: ["e"], taxonomy: tax2, canUndo: true, canRedo: false };
    store.apply(c);
    expect([...store.refs.keys()]).toEqual(["a", "p", "n"]);
    expect(store.refs.get("a")!.title).toBe("A2");
    expect(store.tax).toBe(tax2);
    expect([store.canUndo, store.canRedo]).toEqual([true, false]);
    expect(seen).toHaveBeenCalledWith(c);
    // Rust sends null for an unchanged taxonomy
    store.apply({ references: [], removed: [], taxonomy: null, canUndo: false, canRedo: true });
    expect(store.tax).toBe(tax2);
    expect([store.canUndo, store.canRedo]).toEqual([false, true]);
  });

  it("inbox() holds only untagged references; a partial tag takes one out", () => {
    expect(createStore(view, tax).inbox().map((r) => r.id)).toEqual(["e"]);
  });

  it("reset replaces root, warning and data, and notifies { reset: true }", () => {
    const store = createStore(view, tax);
    store.apply({ references: [], removed: [], canUndo: true, canRedo: true });
    const seen = vi.fn();
    const off = store.subscribe(seen);
    const link = { id: "l", fromRef: "e", toRef: "e", why: "x" };
    store.reset({ root: "D:\\b", references: [ref("e")], links: [link], warning: "w2", taxonomyReadOnly: true }, tax2);
    expect([store.root, store.warning, store.refs.size, store.links, store.tax, store.taxonomyReadOnly]).toEqual([
      "D:\\b",
      "w2",
      1,
      [link],
      tax2,
      true,
    ]);
    expect([store.canUndo, store.canRedo]).toEqual([false, false]);
    expect(seen).toHaveBeenCalledWith(expect.objectContaining({ reset: true }));
    off();
    store.reset(view, tax);
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it("missing optional fields from Rust become null and false", () => {
    const store = createStore({ root: "C:\\a", references: [], links: [] } as unknown as LibraryView, tax);
    expect([store.warning, store.taxonomyReadOnly]).toEqual([null, false]);
  });
});
