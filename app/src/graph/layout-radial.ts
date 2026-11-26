// The Radial layout (SPEC §4): one operation at the centre, its branches on ring 1, its techniques
// on ring 2, and on ring 3 every reference tagged under this operation (a tag on one of its
// branches). Rings 1 and 2 are sized so neighbouring labels never meet. Ring 3 is a band of
// concentric rows REF_ARC apart, so 2,000+ references fit in a wheel about 1,600 units across
// rather than one ring tens of thousands long (final review I2; a plan delta to Task 8, which
// specified one growing ring). Radial always expands all techniques (build the graph with "all");
// culling carries the load.
import { BAND_GAP, LABEL_W, REF_ARC } from "./constants";
import { type Placed, spread } from "./layout-tree";
import type { TaxGraph } from "./taxgraph";

const TAU = 2 * Math.PI;
/** The least radius at which n evenly spaced neighbours are LABEL_W apart (a chord); 0 below 2. */
const chordR = (n: number) => (n < 2 ? 0 : LABEL_W / (2 * Math.sin(Math.PI / n)));
/** The angle between neighbours LABEL_W apart on a ring of radius r. */
const labelAngle = (r: number) => 2 * Math.asin(Math.min(1, LABEL_W / (2 * r)));

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
  // Ring 1: the branches, evenly, starting at the top, far enough out that neighbouring labels
  // (LABEL_W wide) don't meet (final review I1).
  const branches = kids(op);
  const r1 = Math.max(BAND_GAP, chordR(branches.length));
  const branchAngle = new Map(branches.map((b, i) => [b, -Math.PI / 2 + (TAU * i) / branches.length]));
  for (const [b, a] of branchAngle) p.set(b, polar(r1, a));
  // Ring 2: each technique at the mean angle of its parent branches in this operation, on the
  // smallest ring past r1 + BAND_GAP where every technique gets a label's chord.
  const techs = [...new Set(branches.flatMap(kids))];
  const r2 = Math.max(r1 + BAND_GAP, chordR(techs.length));
  const techAngles = onRing(
    techs.map((t) => meanAngle(branches.filter((b) => kids(b).includes(t)).map((b) => branchAngle.get(b)!))),
    r2,
    r2 * labelAngle(r2), // onRing takes an arc length
  );
  const techAngle = new Map(techs.map((t, i) => [t, techAngles[i]]));
  techs.forEach((t, i) => p.set(t, polar(r2, techAngles[i])));
  // Ring 3: every reference tagged under this operation (a `vias` entry on one of its branches),
  // one point each, near the mean angle of its techniques here; its nodes under each of those
  // techniques share that point.
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
  // Rows j = 0, 1, … at r3 + j·REF_ARC, each holding floor(TAU·r / REF_ARC): the fewest rows that
  // hold them all. In order of wanted angle, each reference goes to the row least full for its
  // size (ties: the inner row), so every row spans the whole angle range evenly.
  const r3 = r2 + BAND_GAP;
  const caps: number[] = [];
  for (let held = 0; held < refs.length; held += caps[caps.length - 1])
    caps.push(Math.floor((TAU * (r3 + caps.length * REF_ARC)) / REF_ARC));
  const want = refs.map((e) => meanAngle(e.angles));
  const rows: number[][] = caps.map(() => []);
  for (const i of want.map((_, i) => i).sort((a, b) => want[a] - want[b])) {
    let j = 0;
    for (let k = 1; k < rows.length; k++) if (rows[k].length / caps[k] < rows[j].length / caps[j]) j = k;
    rows[j].push(i);
  }
  rows.forEach((row, j) => {
    const rj = r3 + j * REF_ARC;
    onRing(row.map((i) => want[i]), rj, REF_ARC).forEach((a, k) => {
      const at = polar(rj, a);
      for (const id of refs[row[k]].nodes) p.set(id, { ...at });
    });
  });
  return p;
}
