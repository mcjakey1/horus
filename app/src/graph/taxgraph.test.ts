import { describe, expect, it } from "vitest";
import { refOf, seed, snap, tagOf } from "./fixtures.test-util";
import { buildTaxGraph } from "./taxgraph";

describe("buildTaxGraph", () => {
  const refs = [
    refOf("p", [tagOf(seed, { op: "infer" })]),
    refOf("a", [tagOf(seed, { tech: "chiaroscuro" }), tagOf(seed, { tech: "chiaroscuro", branch: "sequence.feature" }, 1)]),
    refOf("b", [tagOf(seed, { tech: "chiaroscuro", region: { x: 0, y: 0, w: 0.5, h: 0.5 } })]),
  ];

  it("tax_graph_counts", () => {
    const g = buildTaxGraph(snap(seed, refs), "all");
    const n = (id: string) => g.nodes.get(id) as { count: number };
    expect(n("tech:chiaroscuro").count).toBe(2);
    expect(n("op:infer").count).toBe(1);
    expect(n("op:differentiate").count).toBe(2);
    expect(n("op:sequence").count).toBe(1); // a's second tag
    expect(n("br:differentiate.feature").count).toBe(2);
    expect(n("br:sequence.feature").count).toBe(1);
    expect(n("op:group").count).toBe(0);
    // a partial tag makes no node of its own
    expect([...g.nodes.keys()].some((k) => k.endsWith(":p"))).toBe(false);
    // a reference appears once under each expanded technique, however many tags it has there
    expect(g.children.get("tech:chiaroscuro")).toEqual(["ref:chiaroscuro:a", "ref:chiaroscuro:b"]);
    expect(g.nodes.get("ref:chiaroscuro:b")).toMatchObject({ kind: "ref", refId: "b", via: { techId: "chiaroscuro", branchId: "differentiate.feature", state: "region" } });
    expect(g.nodes.get("ref:chiaroscuro:a")).toMatchObject({ via: { state: "full" } });
  });

  it("node ids, taxonomy order and multi-parent techniques", () => {
    const g = buildTaxGraph(snap(seed));
    const ops = [...g.nodes.values()].filter((x) => x.kind === "op").map((x) => x.id);
    expect(ops).toEqual(seed.operations.map((o) => `op:${o.id}`));
    expect(g.children.get("op:differentiate")).toEqual(seed.branches.filter((b) => b.operationId === "differentiate").map((b) => `br:${b.id}`));
    expect(g.nodes.get("tech:face-schema")).toMatchObject({ kind: "tech", parents: ["differentiate.social", "group.social", "infer.social"], count: 0 });
    for (const b of ["differentiate.social", "group.social", "infer.social"]) expect(g.children.get(`br:${b}`)).toContain("tech:face-schema");
    expect([...g.nodes.values()].filter((x) => x.kind === "tech")).toHaveLength(seed.techniques.length);
  });

  it("expands only the listed techniques, and keeps out-of-scope references (drawn as dots)", () => {
    const s = snap(seed, refs);
    expect(buildTaxGraph(s).children.get("tech:chiaroscuro")).toEqual([]);
    expect([...buildTaxGraph(s).nodes.values()].some((x) => x.kind === "ref")).toBe(false);
    expect(buildTaxGraph(s, new Set(["tech:chiaroscuro"])).children.get("tech:chiaroscuro")).toHaveLength(2);
    const scoped = buildTaxGraph({ ...s, inScope: (id) => id !== "a" }, "all");
    expect(scoped.children.get("tech:chiaroscuro")).toEqual(["ref:chiaroscuro:a", "ref:chiaroscuro:b"]);
    expect((scoped.nodes.get("tech:chiaroscuro") as { count: number }).count).toBe(2);
  });

  it("ignores a tag whose technique is not in the taxonomy", () => {
    const g = buildTaxGraph(snap(seed, [refOf("x", [{ id: "t", operationId: "group", techniqueId: "gone", branchId: "group.feature", suggested: false }])]), "all");
    expect(g.nodes.has("tech:gone")).toBe(false);
    expect((g.nodes.get("op:group") as { count: number }).count).toBe(1);
  });
});
