import { describe, expect, it } from "vitest";
import type { Edge } from "../api";
import { NODE } from "./constants";
import { createForce, initialPosition, runForce, type XY } from "./force";

const dist = (a: XY, b: XY) => Math.hypot(a.x - b.x, a.y - b.y);
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
const centroid = (ps: XY[]) => ({ x: mean(ps.map((p) => p.x)), y: mean(ps.map((p) => p.y)) });

function clique(prefix: string, n: number, score: number): { ids: string[]; edges: Edge[] } {
  const ids = Array.from({ length: n }, (_, i) => `${prefix}${i}`);
  const edges: Edge[] = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) edges.push({ a: ids[i], b: ids[j], score });
  return { ids, edges };
}

describe("force layout", () => {
  it("two_cliques_separate", () => {
    const a = clique("a", 10, 0.8);
    const b = clique("b", 10, 0.8);
    const edges = [...a.edges, ...b.edges, { a: "a0", b: "b0", score: 0.06 }];
    const p = runForce({ ids: [...a.ids, ...b.ids], edges, seed: 7 }, 300);
    const within = mean([
      ...a.ids.flatMap((x, i) => a.ids.slice(i + 1).map((y) => dist(p[x], p[y]))),
      ...b.ids.flatMap((x, i) => b.ids.slice(i + 1).map((y) => dist(p[x], p[y]))),
    ]);
    const between = mean(a.ids.flatMap((x) => b.ids.map((y) => dist(p[x], p[y]))));
    expect(between).toBeGreaterThan(2 * within);
  });

  it("deterministic", () => {
    const { ids, edges } = clique("n", 12, 0.5);
    const input = { ids: [...ids, "lone"], edges, seed: 42 };
    expect(runForce(input, 200)).toEqual(runForce(input, 200));
  });

  it("zero_degree_on_outer_ring", () => {
    const c = clique("c", 12, 0.6);
    const lone = ["z0", "z1", "z2", "z3", "z4"];
    const p = runForce({ ids: [...c.ids, ...lone], edges: c.edges, seed: 3 }, 300);
    const all = Object.values(p);
    const ctr = centroid(all);
    const farthestConnected = Math.max(...c.ids.map((id) => dist(p[id], ctr)));
    for (const id of lone) expect(dist(p[id], ctr)).toBeGreaterThan(farthestConnected);
  });

  it("warm_start_moves_less", () => {
    const g1 = clique("g", 25, 0.5);
    const g2 = clique("h", 25, 0.5);
    const ids = [...g1.ids, ...g2.ids];
    const edges = [...g1.edges, ...g2.edges, { a: "g0", b: "h0", score: 0.1 }];
    const settled = runForce({ ids, edges, seed: 9 }, 400);
    const input = { ids: [...ids, "new"], edges: [...edges, { a: "new", b: "g1", score: 0.7 }], seed: 9 };
    const warm = runForce({ ...input, prev: settled }, 100);
    const cold = runForce(input, 100);
    const warmMove = mean(ids.map((id) => dist(warm[id], settled[id])));
    const coldMove = mean(ids.map((id) => dist(cold[id], settled[id])));
    expect(warmMove).toBeLessThan(0.25 * coldMove);
    // the new node starts at its placed neighbour, not somewhere random
    expect(dist(warm.new, warm.g1)).toBeLessThan(200);
  });

  it("no_nan", () => {
    const p = runForce({ ids: ["a", "b", "c"], edges: [], seed: 1 }, 50);
    for (const v of Object.values(p)) {
      expect(Number.isFinite(v.x)).toBe(true);
      expect(Number.isFinite(v.y)).toBe(true);
    }
    expect(runForce({ ids: [], edges: [], seed: 1 }, 10)).toEqual({});
    const one = runForce({ ids: ["only"], edges: [], seed: 1 }, 10);
    expect(Number.isFinite(one.only.x) && Number.isFinite(one.only.y)).toBe(true);
  });

  it("tiles_in_a_cluster_do_not_overlap", () => {
    // I3: forceCollide keeps tiles inside a tight clique legible (radius NODE/2 + 4).
    const { ids, edges } = clique("k", 10, 0.8);
    const p = runForce({ ids, edges, seed: 5 }, 600);
    let closest = Infinity;
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) closest = Math.min(closest, dist(p[ids[i]], p[ids[j]]));
    expect(closest).toBeGreaterThan(NODE * 0.9);
  });

  it("edges_to_unknown_ids_are_ignored", () => {
    const p = runForce({ ids: ["a", "b"], edges: [{ a: "a", b: "gone", score: 0.9 }, { a: "a", b: "b", score: 0.5 }], seed: 1 }, 30);
    expect(Object.keys(p).sort()).toEqual(["a", "b"]);
  });

  it("initial_position_is_deterministic_and_finite", () => {
    expect(initialPosition("x", 7)).toEqual(initialPosition("x", 7));
    expect(initialPosition("x", 7)).not.toEqual(initialPosition("y", 7));
    const p = initialPosition("x", 7);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });

  it("stepper_stops_by_alpha_or_600_ticks", () => {
    const { ids, edges } = clique("s", 8, 0.5);
    const f = createForce({ ids, edges, seed: 2 });
    let steps = 0;
    while (!f.step(10)) steps++;
    expect(f.ticks()).toBeLessThanOrEqual(600);
    expect(f.ticks() >= 600 || f.alpha() < 0.01).toBe(true);
    expect(steps).toBeGreaterThan(0);
  });
});
