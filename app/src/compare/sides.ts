// What two references share and what each has alone (Plan 4 Task 7). Technique ids, in the
// taxonomy's order; a technique tagged on several regions of one image counts once.
import type { Reference, Taxonomy } from "../api";

export type Sides = { shared: string[]; onlyA: string[]; onlyB: string[]; partialA: string[]; partialB: string[] }; // partial = operation ids

export function sides(a: Reference, b: Reference, sharedTechniques: string[], tax: Taxonomy): Sides {
  const rank = new Map(tax.techniques.map((t, i) => [t.id, i]));
  const ordered = (ids: Iterable<string>) => [...new Set(ids)].sort((x, y) => (rank.get(x) ?? Infinity) - (rank.get(y) ?? Infinity));
  const techs = (r: Reference) => new Set(r.tags.flatMap((t) => (t.techniqueId ? [t.techniqueId] : [])));
  const partial = (r: Reference) => [...new Set(r.tags.filter((t) => !t.techniqueId).map((t) => t.operationId))];
  const [ta, tb] = [techs(a), techs(b)];
  return {
    shared: ordered(sharedTechniques),
    onlyA: ordered([...ta].filter((t) => !tb.has(t))),
    onlyB: ordered([...tb].filter((t) => !ta.has(t))),
    partialA: partial(a),
    partialB: partial(b),
  };
}
