// The Tree layout (SPEC §4): four bands, operations on top. Each technique is placed once, at the
// mean x of its parent branches, then pushed apart; edges are drawn as orthogonal hairlines from
// each parent, so a DAG needs no duplicated nodes.
import { BAND_GAP, NODE } from "./constants";
import type { TaxGraph } from "./taxgraph";

export type Placed = Map<string, { x: number; y: number }>;

const GAP = NODE + 16; // least x spacing between neighbours in a band
const ROW = NODE + 8; // step between references in a technique's column

/**
 * Least-squares placement of sorted `want` values with neighbours at least `gap` apart: pool
 * adjacent violators of the shifted values `want[i] - i·gap`, so a crowd spreads around its mean
 * instead of being shoved to one side.
 */
export function spread(want: number[], gap: number): number[] {
  const blocks: { sum: number; n: number }[] = [];
  want.forEach((w, i) => {
    blocks.push({ sum: w - i * gap, n: 1 });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1];
      const a = blocks[blocks.length - 2];
      if (a.sum / a.n <= b.sum / b.n) break;
      a.sum += b.sum;
      a.n += b.n;
      blocks.pop();
    }
  });
  const out: number[] = [];
  for (const b of blocks) for (let k = 0; k < b.n; k++) out.push(b.sum / b.n + out.length * gap);
  return out;
}

export function layoutTree(g: TaxGraph): Placed {
  const p: Placed = new Map();
  const kids = (id: string) => g.children.get(id) ?? [];
  // Operations and branches: each branch gets a slot as wide as its techniques need, so the
  // technique band rarely has to push far; an operation sits over the middle of its branches.
  let left = 0;
  for (const n of g.nodes.values()) {
    if (n.kind !== "op") continue;
    const start = left;
    for (const b of kids(n.id)) {
      const w = Math.max(1, kids(b).length) * GAP;
      p.set(b, { x: left + w / 2, y: BAND_GAP });
      left += w;
    }
    if (left === start) left += GAP; // an operation with no branches still takes a slot
    p.set(n.id, { x: (start + left) / 2, y: 0 });
  }
  // Techniques: barycentre of the parent branches; one with no parent goes after the last slot.
  const techs = [...g.nodes.values()].filter((n) => n.kind === "tech");
  let orphan = left;
  const want = techs.map((t) => {
    const xs = t.parents.map((b) => p.get(`br:${b}`)?.x).filter((x): x is number => x !== undefined);
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : (orphan += GAP);
  });
  const order = techs.map((_, i) => i).sort((a, b) => want[a] - want[b]); // stable: taxonomy order breaks ties
  const xs = spread(order.map((i) => want[i]), GAP);
  order.forEach((i, k) => p.set(techs[i].id, { x: xs[k], y: 2 * BAND_GAP }));
  // References: a column under each expanded technique.
  for (const t of techs) {
    const x = p.get(t.id)!.x;
    kids(t.id).forEach((r, k) => p.set(r, { x, y: 3 * BAND_GAP + k * ROW }));
  }
  return p;
}
