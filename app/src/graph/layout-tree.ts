// The Tree layout (SPEC §4): four bands, operations on top. Each technique is placed once, at the
// mean x of its parent branches, then pushed apart; edges are drawn as orthogonal hairlines from
// each parent, so a DAG needs no duplicated nodes.
import { BAND_GAP, GAP, ROW } from "./constants";
import type { TaxGraph } from "./taxgraph";

export type Placed = Map<string, { x: number; y: number }>;

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

/**
 * The label row (0, 1 or 2) of each operation, branch and technique: by x order within its band,
 * so labels on one row are at least 3 × GAP = 192 apart, wider than a clipped label (final review
 * I1). Operations need it too: one with no branches, or one branch of one technique, is one GAP wide.
 */
export function labelRows(g: TaxGraph, p: Placed): Map<string, number> {
  const rows = new Map<string, number>();
  for (const kind of ["op", "branch", "tech"] as const) {
    const band = [...g.nodes.values()].filter((n) => n.kind === kind && p.has(n.id)).map((n) => n.id);
    band.sort((a, b) => p.get(a)!.x - p.get(b)!.x);
    band.forEach((id, k) => rows.set(id, k % 3));
  }
  return rows;
}

/** The one technique whose references are shown, or null when none or several are (Show all). */
export function blockTech(g: TaxGraph): string | null {
  const open = [...g.children].filter(([id, kids]) => id.startsWith("tech:") && kids.length);
  return open.length === 1 ? open[0][0] : null;
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
  // References. One technique expanded (the default, decision 3): a square block centred under
  // it, so 1,000+ references stay fittable (final review I5; a plan delta to Tasks 5 and 6, which
  // drew one column). Show all: a column under each technique, as there is no room between slots
  // (deferred to Plan 6).
  const one = blockTech(g);
  if (one) {
    const refs = kids(one);
    const tx = p.get(one)!.x;
    const cols = Math.ceil(Math.sqrt(refs.length));
    refs.forEach((r, k) => p.set(r, { x: tx + (k % cols - (cols - 1) / 2) * ROW, y: 3 * BAND_GAP + Math.floor(k / cols) * ROW }));
    return p;
  }
  for (const t of techs) {
    const x = p.get(t.id)!.x;
    kids(t.id).forEach((r, k) => p.set(r, { x, y: 3 * BAND_GAP + k * ROW }));
  }
  return p;
}
