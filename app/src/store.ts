// The UI's one copy of the open library. Rust owns the data; every command that changes it
// returns a `Change`, which `apply` merges here and then announces to the views.
import type { Change, LibraryView, Link, Reference, Taxonomy } from "./api";

export type StoreEvent = Change & { reset?: boolean };

export type Store = {
  root: string;
  warning?: string | null;
  /** In library order; a changed reference keeps its place, a new one goes last. */
  refs: Map<string, Reference>;
  tax: Taxonomy;
  /** Plan 2 never changes links (Plan 4 adds `Change.links`). */
  links: Link[];
  canUndo: boolean;
  canRedo: boolean;
  taxonomyReadOnly: boolean;
  apply(c: Change): void;
  /** A library switch: replaces everything and notifies `{ reset: true }`. */
  reset(view: LibraryView, tax: Taxonomy): void;
  subscribe(fn: (c: StoreEvent) => void): () => void;
  /** Derived, never stored: references with no tags at all (SPEC §3). */
  inbox(): Reference[];
};

export function createStore(view: LibraryView, tax: Taxonomy): Store {
  const subs = new Set<(c: StoreEvent) => void>();
  const emit = (c: StoreEvent) => subs.forEach((fn) => fn(c));
  const load = (v: LibraryView, t: Taxonomy) =>
    Object.assign(store, {
      root: v.root,
      warning: v.warning ?? null,
      refs: new Map(v.references.map((r) => [r.id, r])),
      links: v.links,
      tax: t,
      taxonomyReadOnly: v.taxonomyReadOnly === true, // absent until Plan 2 Task 5's Rust sends it
      canUndo: false,
      canRedo: false,
    });
  const store: Store = {
    root: "",
    refs: new Map(),
    tax,
    links: [],
    canUndo: false,
    canRedo: false,
    taxonomyReadOnly: false,
    apply(c) {
      for (const r of c.references) store.refs.set(r.id, r);
      for (const id of c.removed) store.refs.delete(id);
      if (c.taxonomy) store.tax = c.taxonomy;
      store.canUndo = c.canUndo;
      store.canRedo = c.canRedo;
      emit(c);
    },
    reset(v, t) {
      load(v, t);
      emit({ references: [], removed: [], taxonomy: t, created: null, canUndo: false, canRedo: false, reset: true });
    },
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    inbox: () => [...store.refs.values()].filter((r) => !r.tags.length),
  };
  load(view, tax);
  return store;
}
