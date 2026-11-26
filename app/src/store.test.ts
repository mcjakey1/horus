import { describe, expect, it, vi } from "vitest";
import type { Board, LibraryView, Link, Reference, Tag, Taxonomy } from "./api";
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
  boards: [],
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
    store.reset({ root: "D:\\b", references: [ref("e")], links: [link], boards: [], warning: "w2", taxonomyReadOnly: true }, tax2);
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

describe("store: links, boards and the board scope (Plan 4 Task 3)", () => {
  const boardA: Board = { id: "bA", name: "A", referenceIds: ["a", "e"] };
  const boardB: Board = { id: "bB", name: "B", referenceIds: ["p"] };
  const scoped = () => createStore({ ...view, boards: [boardA, boardB] }, tax);
  const none = { references: [], removed: [], canUndo: true, canRedo: false };

  it("inScope is true for every reference with no scope, and only for members with one", () => {
    const store = scoped();
    expect(store.scope).toBeNull();
    expect(["a", "p", "e", "nope"].map((id) => store.inScope(id))).toEqual([true, true, true, true]);
    store.setScope("bA");
    expect(["a", "p", "e", "nope"].map((id) => store.inScope(id))).toEqual([true, false, true, false]);
  });

  it("setScope notifies with scope: true", () => {
    const store = scoped();
    const seen = vi.fn();
    store.subscribe(seen);
    store.setScope("bB");
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0]).toMatchObject({ references: [], removed: [], scope: true });
    expect(seen.mock.calls[0][0].scopeCleared).toBeUndefined();
  });

  it("a Change carrying links or boards replaces them; one without keeps them", () => {
    const store = scoped();
    const link: Link = { id: "l1", fromRef: "a", toRef: "p", why: "x" };
    store.apply({ ...none, links: [link] });
    expect(store.links).toEqual([link]);
    expect(store.boards).toEqual([boardA, boardB]);
    store.apply({ ...none, links: null, boards: [boardB] });
    expect(store.links).toEqual([link]);
    expect(store.boards).toEqual([boardB]);
  });

  it("a Change that drops the scoped board clears the scope and says scopeCleared", () => {
    const store = scoped();
    store.setScope("bA");
    const seen = vi.fn();
    store.subscribe(seen);
    store.apply({ ...none, boards: [boardA, { ...boardB, name: "B2" }] }); // bA still there
    expect(store.scope).toBe("bA");
    expect(seen.mock.calls[0][0].scopeCleared).toBeUndefined();
    store.apply({ ...none, boards: [boardB] });
    expect(store.scope).toBeNull();
    expect(seen.mock.calls[1][0]).toMatchObject({ boards: [boardB], scopeCleared: true });
    expect(store.inScope("p")).toBe(true);
  });

  it("reset clears the scope", () => {
    const store = scoped();
    store.setScope("bA");
    store.reset({ ...view, boards: [boardA] }, tax);
    expect(store.scope).toBeNull();
    expect(store.boards).toEqual([boardA]);
  });

  it("linksFor returns the links touching a reference in both directions, newest first", () => {
    const l1: Link = { id: "l1", fromRef: "a", toRef: "p", why: "x" };
    const l2: Link = { id: "l2", fromRef: "e", toRef: "p", why: "y" };
    const l3: Link = { id: "l3", fromRef: "p", toRef: "e", why: "z" };
    const store = createStore({ ...view, links: [l1, l2, l3] }, tax);
    expect(store.linksFor("p").map((l) => l.id)).toEqual(["l3", "l2", "l1"]);
    expect(store.linksFor("a")).toEqual([l1]);
    expect(store.linksFor("nope")).toEqual([]);
  });
});
