// The UI's one copy of the open library. Rust owns the data; every command that changes it
// returns a `Change`, which `apply` merges here and then announces to the views.
import type { Board, Change, IntegrityReport, LibraryView, Link, Reference, Taxonomy } from "./api";

/** `scope`: the board scope changed (`setScope`). `scopeCleared`: a change removed the scoped
 * board, so the scope went back to everything (the status line says so). */
export type StoreEvent = Change & { reset?: boolean; scope?: true; scopeCleared?: true };

export type Store = {
  root: string;
  warning?: string | null;
  /** Plan 6 Task 2: what the open found on disk, for the notice. */
  integrity?: IntegrityReport | null;
  /** In library order; a changed reference keeps its place, a new one goes last. */
  refs: Map<string, Reference>;
  tax: Taxonomy;
  /** Replaced whole by a `Change` that carries them (Plan 4). */
  links: Link[];
  boards: Board[];
  /** The board the views are scoped to, or null for everything. */
  scope: string | null;
  /** Notifies `{ scope: true }`. */
  setScope(boardId: string | null): void;
  /** True for every reference when `scope` is null, else only for the board's members. */
  inScope(refId: string): boolean;
  /** Links touching `refId`, in either direction, newest first. */
  linksFor(refId: string): Link[];
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
      integrity: v.integrity ?? null,
      refs: new Map(v.references.map((r) => [r.id, r])),
      links: v.links,
      boards: v.boards,
      scope: null, // a library switch never keeps a board id
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
    boards: [],
    scope: null,
    canUndo: false,
    canRedo: false,
    taxonomyReadOnly: false,
    apply(c) {
      for (const r of c.references) store.refs.set(r.id, r);
      for (const id of c.removed) store.refs.delete(id);
      if (c.taxonomy) store.tax = c.taxonomy;
      if (c.links) store.links = c.links;
      if (c.boards) store.boards = c.boards;
      store.canUndo = c.canUndo;
      store.canRedo = c.canRedo;
      if (store.scope !== null && !store.boards.some((b) => b.id === store.scope)) {
        store.scope = null;
        return emit({ ...c, scopeCleared: true });
      }
      emit(c);
    },
    setScope(boardId) {
      store.scope = boardId;
      emit({ references: [], removed: [], created: null, canUndo: store.canUndo, canRedo: store.canRedo, scope: true });
    },
    inScope(refId) {
      if (store.scope === null) return true;
      return store.boards.find((b) => b.id === store.scope)?.referenceIds.includes(refId) ?? false;
    },
    linksFor: (refId) => store.links.filter((l) => l.fromRef === refId || l.toRef === refId).reverse(),
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
