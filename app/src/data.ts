// The one seam between the graph views and the library data. Read-only: edits go through the
// api and store.apply, never through a Snapshot.
import type { Link, Reference, Taxonomy } from "./api";
import type { Store } from "./store";

export type Snapshot = {
  /** Live: the store's own Map and array, not copies. Key any cache on `version`, never on identity. */
  refs: Map<string, Reference>;
  links: Link[];
  tax: Taxonomy;
  version: number;
  /** store.taxonomyReadOnly (the seed fallback after a damaged taxonomy.json). */
  taxonomyReadOnly: boolean;
  /** store.inScope: the board scope (Plan 4); true for everything when no board is chosen. */
  inScope(refId: string): boolean;
};
/** reset = a library switch (store.reset), not a data change (C20). */
export type SourceEvent = { reset: boolean };
export interface DataSource {
  get(): Snapshot;
  subscribe(fn: (s: Snapshot, e: SourceEvent) => void): () => void;
}

/** `version` bumps on every store event. */
export function storeSource(store: Store): DataSource {
  let version = 0;
  const snap = (): Snapshot => ({
    refs: store.refs,
    links: store.links,
    tax: store.tax,
    version,
    taxonomyReadOnly: store.taxonomyReadOnly,
    inScope: (id) => store.inScope(id),
  });
  let cur = snap();
  store.subscribe(() => {
    version++;
    cur = snap();
  });
  return {
    get: () => cur,
    subscribe: (fn) => store.subscribe((e) => fn(cur, { reset: e.reset === true })),
  };
}
