// The one seam between the graph views and the library data. Read-only: edits go through the
// api and store.apply, never through a Snapshot.
import type { Link, Reference, Taxonomy } from "./api";
import type { Store } from "./store";

export type Snapshot = {
  refs: Map<string, Reference>;
  links: Link[];
  tax: Taxonomy;
  version: number;
  /** store.taxonomyReadOnly (the seed fallback after a damaged taxonomy.json). */
  taxonomyReadOnly: boolean;
  /** () => true until Plan 4 adds store.inScope (board scope, audit row 10). */
  inScope(refId: string): boolean;
};
/** reset = a library switch (store.reset), not a data change (C20). */
export type SourceEvent = { reset: boolean };
export interface DataSource {
  get(): Snapshot;
  subscribe(fn: (s: Snapshot, e: SourceEvent) => void): () => void;
}

const everything = () => true;

/** `version` bumps on every store event. */
export function storeSource(store: Store): DataSource {
  let version = 0;
  const snap = (): Snapshot => ({
    refs: store.refs,
    links: store.links,
    tax: store.tax,
    version,
    taxonomyReadOnly: store.taxonomyReadOnly,
    inScope: everything,
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
