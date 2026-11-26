import { describe, expect, it } from "vitest";
import { clipLabel } from "./frame";
import { BAND_GAP, GAP, NODE, ROW } from "./constants";
import { clashes, labelBox, nameOf, refOf, seed, snap, synth, tagOf } from "./fixtures.test-util";
import { labelRows, layoutTree } from "./layout-tree";
import { buildTaxGraph, type TaxGraph } from "./taxgraph";

const BAND = { op: 0, branch: BAND_GAP, tech: 2 * BAND_GAP } as const;

/** x values of a band's nodes, left to right. */
function bandXs(g: TaxGraph, p: ReturnType<typeof layoutTree>, kind: "op" | "branch" | "tech") {
  return [...g.nodes.values()].filter((n) => n.kind === kind).map((n) => p.get(n.id)!.x).sort((a, b) => a - b);
}
const allFinite = (p: ReturnType<typeof layoutTree>) => [...p.values()].every((q) => Number.isFinite(q.x) && Number.isFinite(q.y));

describe("layoutTree", () => {
  const refs = [
    refOf("a", [tagOf(seed, { tech: "chiaroscuro" }), tagOf(seed, { tech: "closure" }, 1)]),
    refOf("b", [tagOf(seed, { tech: "chiaroscuro" })]),
  ];

  it("tree_bands_ordered", () => {
    const g = buildTaxGraph(snap(seed, refs), "all");
    const p = layoutTree(g);
    expect(p.size).toBe(g.nodes.size);
    for (const n of g.nodes.values()) expect(p.get(n.id)!.y).toBe(n.kind === "ref" ? p.get(n.id)!.y : BAND[n.kind]);
    for (const n of g.nodes.values()) if (n.kind === "ref") expect(p.get(n.id)!.y).toBeGreaterThanOrEqual(3 * BAND_GAP);
    expect(p.get("ref:chiaroscuro:a")!.y).toBe(3 * BAND_GAP);
  });

  it("tree_technique_once_between_parents", () => {
    const g = buildTaxGraph(snap(seed));
    const p = layoutTree(g);
    const multi = [...g.nodes.values()].filter((n) => n.kind === "tech" && n.parents.length >= 2);
    expect(multi.length).toBeGreaterThan(0);
    for (const t of multi) {
      if (t.kind !== "tech") continue;
      expect([...g.nodes.keys()].filter((k) => k === t.id)).toHaveLength(1);
      const xs = t.parents.map((b) => p.get(`br:${b}`)!.x);
      const x = p.get(t.id)!.x;
      expect(x).toBeGreaterThan(Math.min(...xs) - GAP);
      expect(x).toBeLessThan(Math.max(...xs) + GAP);
    }
  });

  it("a shared technique sits near its parents' barycentre, not under one parent", () => {
    const t = synth(2);
    t.techniques.push({ id: "shared", name: "shared", icon: "", description: "", synonyms: [], examples: [], custom: false });
    t.branchTechniques.push({ branchId: "o0.b0", techniqueId: "shared" }, { branchId: "o1.b1", techniqueId: "shared" });
    const p = layoutTree(buildTaxGraph(snap(t)));
    const mean = (p.get("br:o0.b0")!.x + p.get("br:o1.b1")!.x) / 2;
    expect(Math.abs(p.get("tech:shared")!.x - mean)).toBeLessThan(GAP);
  });

  it("tree_no_overlap", () => {
    const g = buildTaxGraph(snap(seed, refs), "all");
    const p = layoutTree(g);
    for (const kind of ["op", "branch", "tech"] as const) {
      const xs = bandXs(g, p, kind);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(GAP - 1e-9);
    }
  });

  it("show_all_columns", () => {
    const techs = ["chiaroscuro", "closure", "silhouette"];
    const refs5 = ["r0", "r1", "r2", "r3", "r4"].map((id, i) =>
      refOf(id, techs.filter((_, k) => (i + k) % 2 === 0).map((tech, k) => tagOf(seed, { tech }, k))),
    );
    const g = buildTaxGraph(snap(seed, refs5), "all");
    const p = layoutTree(g);
    for (const tech of techs) {
      const col = g.children.get(`tech:${tech}`)!;
      expect(col.length).toBeGreaterThan(0);
      const tx = p.get(`tech:${tech}`)!.x;
      col.forEach((id, k) => {
        expect(p.get(id)!.x).toBe(tx);
        expect(p.get(id)!.y).toBe(3 * BAND_GAP + k * (NODE + 8));
      });
    }
  });

  it("single_expanded_refs_form_a_block (final review I5)", () => {
    const many = Array.from({ length: 1158 }, (_, i) => refOf(`r${i}`, [tagOf(seed, { tech: "chiaroscuro" })]));
    const g = buildTaxGraph(snap(seed, many), new Set(["tech:chiaroscuro"]));
    const p = layoutTree(g);
    const pts = g.children.get("tech:chiaroscuro")!.map((id) => p.get(id)!);
    expect(pts).toHaveLength(1158);
    const ys = pts.map((q) => q.y);
    const xs = pts.map((q) => q.x);
    expect(Math.min(...ys)).toBe(3 * BAND_GAP);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThanOrEqual(Math.ceil(Math.sqrt(1158)) * ROW);
    const tx = p.get("tech:chiaroscuro")!.x;
    expect(Math.min(...xs) + Math.max(...xs)).toBeCloseTo(2 * tx, 6); // centred under its technique
    let closest = Infinity;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) closest = Math.min(closest, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
    expect(closest).toBeGreaterThanOrEqual(ROW - 1e-9);
  });

  it("dynamic_operation_count", () => {
    const g5 = buildTaxGraph(snap(synth(5)));
    const p5 = layoutTree(g5);
    const ops = [...g5.nodes.values()].filter((n) => n.kind === "op");
    expect(ops).toHaveLength(5);
    for (const o of ops) expect(p5.get(o.id)!.y).toBe(0);
    const xs = bandXs(g5, p5, "op");
    for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(GAP);
    expect(allFinite(layoutTree(buildTaxGraph(snap(synth(1)))))).toBe(true);
    const bare = synth(1);
    bare.branches = [];
    bare.branchTechniques = []; // an operation with no branches, techniques with no parent
    const pb = layoutTree(buildTaxGraph(snap(bare)));
    expect(allFinite(pb)).toBe(true);
    const tx = [...pb.entries()].filter(([k]) => k.startsWith("tech:")).map(([, q]) => q.x).sort((a, b) => a - b);
    for (let i = 1; i < tx.length; i++) expect(tx[i] - tx[i - 1]).toBeGreaterThanOrEqual(GAP);
  });

  it("labels_never_overlap (final review I1)", () => {
    const long = synth(2);
    long.techniques.forEach((t, i) => (t.name = `A very long technique name number ${i}`)); // names the artist types
    for (const tax of [seed, long]) {
      const g = buildTaxGraph(snap(tax));
      const p = layoutTree(g);
      const rows = labelRows(g, p);
      for (const kind of ["branch", "tech"] as const) {
        const boxes = [...g.nodes.values()].filter((n) => n.kind === kind).map((n) => {
          const { x, y } = p.get(n.id)!;
          return { id: n.id, box: labelBox(x, y, 20, clipLabel(nameOf(tax, n.id)), rows.get(n.id)) };
        });
        expect(boxes.length).toBeGreaterThan(1);
        expect(clashes(boxes)).toEqual([]);
      }
    }
  });

  it("empty_library_no_nan (Review Focus 2)", () => {
    const g = buildTaxGraph(snap(seed), "all");
    const p = layoutTree(g);
    expect(p.size).toBe(g.nodes.size);
    expect(allFinite(p)).toBe(true);
    expect([...g.nodes.values()].every((n) => n.kind === "ref" || n.count === 0)).toBe(true);
    // none tagged: references exist but carry no tags
    const untagged = buildTaxGraph(snap(seed, [refOf("u", [])]), "all");
    expect(allFinite(layoutTree(untagged))).toBe(true);
    expect(allFinite(layoutTree(buildTaxGraph(snap(synth(0)))))).toBe(true);
  });
});
