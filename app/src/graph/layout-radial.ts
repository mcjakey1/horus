// The Radial layout (SPEC §4): one operation at the centre, its branches on ring 1, its techniques
// on ring 2, and every reference tagged with those techniques on ring 3. Radial always expands all
// techniques (build the graph with "all"); culling carries the load.
import { BAND_GAP, NODE } from "./constants";
import { type Placed, spread } from "./layout-tree";
import type { TaxGraph } from "./taxgraph";

const TAU = 2 * Math.PI;
const TECH_ARC = NODE + 16; // least arc length between techniques
const REF_ARC = NODE + 8; // least arc length between references

const polar = (r: number, a: number) => ({ x: r * Math.cos(a), y: r * Math.sin(a) });
/** Circular mean; opposite angles have none, and atan2(0, 0) = 0 keeps that finite. */
const meanAngle = (as: number[]) => Math.atan2(as.reduce((s, a) => s + Math.sin(a), 0), as.reduce((s, a) => s + Math.cos(a), 0));

/**
 * Moves the wanted angles apart to at least `arc / r` radians (or an even share of the circle),
 * cutting the circle open at the widest empty gap so a crowd never straddles the seam.
 */
function onRing(want: number[], r: number, arc: number): number[] {
  const n = want.length;
  if (!n) return [];
  const gap = Math.min(arc / r, TAU / n);
  const a = want.map((x) => ((x % TAU) + TAU) % TAU);
  const order = a.map((_, i) => i).sort((i, j) => a[i] - a[j]);
  let cut = 0;
  let widest = -1;
  order.forEach((i, k) => {
    const next = k + 1 < n ? a[order[k + 1]] : a[order[0]] + TAU;
    if (next - a[i] > widest) [widest, cut] = [next - a[i], (k + 1) % n];
  });
  const seq = [...order.slice(cut), ...order.slice(0, cut)];
  const base = a[seq[0]];
  let xs = spread(seq.map((i) => (a[i] < base ? a[i] + TAU : a[i])), gap);
  // ponytail: a full ring falls back to even spacing; a smarter packer only if rings ever crowd
  if (xs[n - 1] - xs[0] > TAU - gap + 1e-9) xs = xs.map((_, k) => xs[0] + (k * TAU) / n);
  const out = new Array<number>(n);
  seq.forEach((i, k) => (out[i] = xs[k]));
  return out;
}

export function layoutRadial(g: TaxGraph, opId: string): Placed {
  const p: Placed = new Map();
  const op = `op:${opId}`;
  if (!g.nodes.has(op)) return p;
  p.set(op, { x: 0, y: 0 });
  const kids = (id: string) => g.children.get(id) ?? [];
  // Ring 1: the branches, evenly, starting at the top.
  const branches = kids(op);
  const branchAngle = new Map(branches.map((b, i) => [b, -Math.PI / 2 + (TAU * i) / branches.length]));
  for (const [b, a] of branchAngle) p.set(b, polar(BAND_GAP, a));
  // Ring 2: each technique at the mean angle of its parent branches in this operation.
  const techs = [...new Set(branches.flatMap(kids))];
  const techAngles = onRing(
    techs.map((t) => meanAngle(branches.filter((b) => kids(b).includes(t)).map((b) => branchAngle.get(b)!))),
    2 * BAND_GAP,
    TECH_ARC,
  );
  const techAngle = new Map(techs.map((t, i) => [t, techAngles[i]]));
  techs.forEach((t, i) => p.set(t, polar(2 * BAND_GAP, techAngles[i])));
  // Ring 3: every reference tagged under this operation (a `vias` entry on one of its branches),
  // one point each, at the mean angle of its techniques here; its nodes under each of those
  // techniques share that point. The ring grows to keep REF_ARC between the kept references.
  const here = new Set(branches.map((b) => (g.nodes.get(b) as { branchId: string }).branchId));
  const byRef = new Map<string, { nodes: string[]; angles: number[] }>();
  for (const t of techs)
    for (const r of kids(t)) {
      const n = g.nodes.get(r);
      if (n?.kind !== "ref" || !n.vias.some((v) => here.has(v.branchId))) continue;
      const e = byRef.get(n.refId) ?? { nodes: [], angles: [] };
      e.nodes.push(r);
      e.angles.push(techAngle.get(t)!);
      byRef.set(n.refId, e);
    }
  const refs = [...byRef.values()];
  const r3 = Math.max(3 * BAND_GAP, (refs.length * REF_ARC) / TAU);
  const refAngles = onRing(refs.map((e) => meanAngle(e.angles)), r3, REF_ARC);
  refs.forEach((e, i) => {
    const at = polar(r3, refAngles[i]);
    for (const id of e.nodes) p.set(id, { ...at });
  });
  return p;
}
