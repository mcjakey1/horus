// The Galaxy's force layout, pure and synchronous so it runs in Node tests and, in batches, in
// force.worker.ts (never on the UI thread, SPEC §10). Scores pull references together (SPEC §4).
import { forceCenter, forceLink, forceManyBody, forceRadial, forceSimulation, type SimulationNodeDatum } from "d3-force";
import type { Edge } from "../api";
import { NODE } from "./constants";

export type XY = { x: number; y: number };
export type ForceIn = { ids: string[]; edges: Edge[]; seed: number; prev?: Record<string, XY> };
export type ToWorker = { type: "start"; input: ForceIn } | { type: "stop" };
export type FromWorker =
  | { type: "tick"; ids: string[]; xy: Float32Array /* transferable, 2 per id */; alpha: number }
  | { type: "end" };

const WARMUP = 60; // ticks before the outer ring's radius is measured (cold starts only)
const MAX_TICKS = 600;
const ALPHA_END = 0.01;

/** A small seeded generator in [0, 1), so the same input lays out the same way. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function hash(id: string): number {
  let h = 2166136261; // FNV-1a
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic from a hash of the id: a point in a disc of radius 300. */
export function initialPosition(id: string, seed: number): XY {
  const r = lcg(hash(id) ^ Math.imul(seed, 2654435761));
  const rad = 300 * Math.sqrt(r());
  const ang = 2 * Math.PI * r();
  return { x: rad * Math.cos(ang), y: rad * Math.sin(ang) };
}

type N = SimulationNodeDatum & { id: string; deg: number };
type L = { source: string | N; target: string | N; score: number };

/** A stepping simulation. `step(n)` runs up to n ticks and says whether the layout is done. */
export function createForce(input: ForceIn): {
  step(n: number): boolean;
  positions(): Record<string, XY>;
  alpha(): number;
  ticks(): number;
} {
  const known = new Set(input.ids);
  const edges = input.edges.filter((e) => e.a !== e.b && known.has(e.a) && known.has(e.b));
  const nbrs = new Map<string, string[]>(input.ids.map((id) => [id, []]));
  for (const e of edges) {
    nbrs.get(e.a)!.push(e.b);
    nbrs.get(e.b)!.push(e.a);
  }
  const prev = input.prev;
  const warm = !!prev && input.ids.some((id) => prev[id]);
  // Warm start: a placed node keeps its place; a new one starts among its placed neighbours.
  const start = (id: string): XY => {
    if (prev?.[id]) return prev[id];
    const placed = (nbrs.get(id) ?? []).map((n) => prev?.[n]).filter((p): p is XY => !!p);
    if (placed.length) {
      const j = initialPosition(id, input.seed); // a small, deterministic offset so it isn't stacked
      return {
        x: placed.reduce((s, p) => s + p.x, 0) / placed.length + j.x / 30,
        y: placed.reduce((s, p) => s + p.y, 0) / placed.length + j.y / 30,
      };
    }
    return initialPosition(id, input.seed);
  };
  const nodes: N[] = input.ids.map((id) => ({ id, deg: nbrs.get(id)!.length, ...start(id) }));
  const links: L[] = edges.map((e) => ({ source: e.a, target: e.b, score: e.score }));
  const sim = forceSimulation<N>(nodes)
    .randomSource(lcg(input.seed))
    .force(
      "link",
      forceLink<N, L>(links)
        .id((d) => d.id)
        .strength((l) => l.score)
        .distance((l) => 40 + 160 * (1 - l.score)),
    )
    .force("charge", forceManyBody<N>().strength(-30))
    .force("center", forceCenter<N>(0, 0))
    .stop(); // d3-force otherwise starts its own timer
  if (warm) sim.alpha(0.1); // already settled: nudge, don't rebuild
  let ticks = 0;
  let ringed = false;

  /** R_OUT = 1.25 × the connected cluster's radius; references with no edges sit on it. */
  const addRing = () => {
    ringed = true;
    const linked = nodes.filter((n) => n.deg > 0);
    let r: number;
    if (linked.length) {
      const cx = linked.reduce((s, n) => s + n.x!, 0) / linked.length;
      const cy = linked.reduce((s, n) => s + n.y!, 0) / linked.length;
      r = 1.25 * Math.max(NODE, ...linked.map((n) => Math.hypot(n.x! - cx, n.y! - cy)));
    } else r = Math.max(2 * NODE, Math.sqrt(nodes.length) * NODE * 0.8); // nothing tagged: one even ring
    sim.force("ring", forceRadial<N>(r, 0, 0).strength((n) => (n.deg ? 0 : 0.08)));
  };

  return {
    step(n) {
      for (let i = 0; i < n; i++) {
        if (!ringed && (warm || ticks >= WARMUP)) addRing();
        sim.tick();
        ticks++;
        if (sim.alpha() < ALPHA_END || ticks >= MAX_TICKS) return true;
      }
      return false;
    },
    positions() {
      const out: Record<string, XY> = {};
      for (const n of nodes) out[n.id] = { x: Number.isFinite(n.x) ? n.x! : 0, y: Number.isFinite(n.y) ? n.y! : 0 };
      return out;
    },
    alpha: () => sim.alpha(),
    ticks: () => ticks,
  };
}

/** Runs `ticks` ticks (or until the layout settles) and returns every position. */
export function runForce(input: ForceIn, ticks: number): Record<string, XY> {
  const f = createForce(input);
  f.step(ticks);
  return f.positions();
}
