import { describe, expect, it } from "vitest";
import { BAND_GAP, NODE } from "./constants";
import { refOf, seed, snap, synth, tagOf } from "./fixtures.test-util";
import { layoutRadial } from "./layout-radial";
import { buildTaxGraph } from "./taxgraph";

const r = (q: { x: number; y: number }) => Math.hypot(q.x, q.y);
const ang = (q: { x: number; y: number }) => Math.atan2(q.y, q.x);
const sameAngle = (a: number, b: number) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-9;

describe("layoutRadial", () => {
  it("radial_rings", () => {
    const refs = [
      refOf("a", [tagOf(seed, { tech: "chiaroscuro" }), tagOf(seed, { tech: "silhouette" }, 1)]),
      refOf("b", [tagOf(seed, { tech: "face-schema", branch: "differentiate.social" })]),
      refOf("c", [tagOf(seed, { tech: "closure" })]), // group, not differentiate
      refOf("d", [tagOf(seed, { op: "differentiate" })]), // partial: no technique to sit under
      ...Array.from({ length: 60 }, (_, i) => refOf(`m${i}`, [tagOf(seed, { tech: "silhouette" })])),
    ];
    const g = buildTaxGraph(snap(seed, refs), "all");
    const p = layoutRadial(g, "differentiate");
    expect(p.get("op:differentiate")).toEqual({ x: 0, y: 0 });
    const branches = g.children.get("op:differentiate")!;
    for (const b of branches) expect(Math.abs(r(p.get(b)!) - BAND_GAP)).toBeLessThan(1e-6);
    const techs = new Set(branches.flatMap((b) => g.children.get(b)!));
    for (const t of techs) expect(Math.abs(r(p.get(t)!) - 2 * BAND_GAP)).toBeLessThan(1e-6);
    // ring 3: one radius for every reference, at least 3·BAND_GAP, grown for 62 references
    const ring3 = [...p.entries()].filter(([k]) => k.startsWith("ref:"));
    const r3 = r(ring3[0][1]);
    expect(r3).toBeGreaterThan(3 * BAND_GAP);
    for (const [, q] of ring3) expect(Math.abs(r(q) - r3)).toBeLessThan(1e-6);
    const placedRefs = new Set(ring3.map(([k]) => k.split(":")[2]));
    expect(placedRefs).toEqual(new Set(["a", "b", ...Array.from({ length: 60 }, (_, i) => `m${i}`)]));
    // a reference's nodes under several techniques share one point
    expect(p.get("ref:chiaroscuro:a")).toEqual(p.get("ref:silhouette:a"));
    // distinct references keep the minimum arc spacing
    const angles = [...new Set(ring3.map(([k]) => k.split(":")[2]))].map((id) => ang(ring3.find(([k]) => k.endsWith(`:${id}`))![1])).sort((x, y) => x - y);
    for (let i = 1; i < angles.length; i++) expect((angles[i] - angles[i - 1]) * r3).toBeGreaterThanOrEqual(NODE + 8 - 1e-6);
    expect((angles[0] + 2 * Math.PI - angles[angles.length - 1]) * r3).toBeGreaterThanOrEqual(NODE + 8 - 1e-6);
    // other operations' nodes are not placed
    expect(p.has("op:group")).toBe(false);
    expect(p.has("tech:closure")).toBe(false);
    expect([...p.values()].every((q) => Number.isFinite(q.x) && Number.isFinite(q.y))).toBe(true);
  });

  it("radial_ring3_only_this_operation (fix round 1, I1)", () => {
    const seqOnly = refOf("s", [tagOf(seed, { tech: "chiaroscuro", branch: "sequence.feature" })]);
    const both = refOf("w", [tagOf(seed, { tech: "chiaroscuro", branch: "sequence.feature" }), tagOf(seed, { tech: "chiaroscuro" }, 1)]);
    const crowd = Array.from({ length: 60 }, (_, i) => refOf(`q${i}`, [tagOf(seed, { tech: "chiaroscuro", branch: "sequence.feature" })]));
    const g = buildTaxGraph(snap(seed, [seqOnly, both, ...crowd]), "all");
    const diff = layoutRadial(g, "differentiate");
    expect(diff.has("ref:chiaroscuro:s")).toBe(false);
    expect(diff.has("ref:chiaroscuro:w")).toBe(true); // a second tag goes through differentiate.feature
    // ring 3 counts only the kept references: one, so it stays at 3·BAND_GAP
    expect(r(diff.get("ref:chiaroscuro:w")!)).toBeCloseTo(3 * BAND_GAP, 6);
    expect([...diff.keys()].filter((k) => k.startsWith("ref:"))).toEqual(["ref:chiaroscuro:w"]);
    const seq = layoutRadial(g, "sequence");
    expect(seq.has("ref:chiaroscuro:s")).toBe(true);
    expect(seq.has("ref:chiaroscuro:w")).toBe(true);
    expect(r(seq.get("ref:chiaroscuro:s")!)).toBeGreaterThan(3 * BAND_GAP); // 62 references grow it
  });

  it("radial_single_tech_ref_angle", () => {
    const g = buildTaxGraph(snap(seed, [refOf("a", [tagOf(seed, { tech: "silhouette" })]), refOf("b", [tagOf(seed, { tech: "chiaroscuro" })])]), "all");
    const p = layoutRadial(g, "differentiate");
    expect(sameAngle(ang(p.get("ref:silhouette:a")!), ang(p.get("tech:silhouette")!))).toBe(true);
    expect(sameAngle(ang(p.get("ref:chiaroscuro:b")!), ang(p.get("tech:chiaroscuro")!))).toBe(true);
  });

  it("technique ring keeps its arc spacing; an empty or bare operation stays finite", () => {
    const g = buildTaxGraph(snap(seed), "all");
    const p = layoutRadial(g, "differentiate");
    const techs = [...p.entries()].filter(([k]) => k.startsWith("tech:")).map(([, q]) => ang(q)).sort((x, y) => x - y);
    const step = Math.min(NODE + 16, (2 * Math.PI * 2 * BAND_GAP) / techs.length);
    for (let i = 1; i < techs.length; i++) expect((techs[i] - techs[i - 1]) * 2 * BAND_GAP).toBeGreaterThanOrEqual(step - 1e-6);
    const bare = synth(1);
    bare.branches = [];
    bare.branchTechniques = [];
    const pb = layoutRadial(buildTaxGraph(snap(bare)), "o0");
    expect([...pb.values()]).toEqual([{ x: 0, y: 0 }]);
    expect(layoutRadial(buildTaxGraph(snap(seed)), "missing").size).toBe(0);
  });
});
