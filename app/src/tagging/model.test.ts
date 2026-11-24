import { describe, expect, it } from "vitest";
import type { DemoExample, Reference, Tag, Taxonomy, Technique } from "../api";
import seedJson from "../../src-tauri/resources/taxonomy.json";
import cases from "./match-cases.json";
import { domainChoice, examplesFor, matchesQuery, presetFrom, techniquesFor } from "./model";

const seed = seedJson as unknown as Taxonomy;

const tag = (id: string, techniqueId?: string, suggested = false, extra: Partial<Tag> = {}): Tag => ({
  id,
  operationId: "differentiate",
  techniqueId,
  branchId: techniqueId ? "differentiate.feature" : undefined,
  suggested,
  ...extra,
});
const ref = (id: string, addedAt: string, tags: Tag[]): Reference => ({
  id,
  title: id,
  file: `images/${id}.jpg`,
  hash: id,
  width: 1,
  height: 1,
  addedAt,
  tags,
  thumb256: "",
  thumb1024: "",
});
const demo = (title: string, techniqueId = "chiaroscuro"): DemoExample => ({ techniqueId, title, path: `D:\\demo\\${title}.jpg` });

describe("tagging model", () => {
  it("techniquesFor lists the operation's techniques only", () => {
    const ids = techniquesFor(seed, "group").map((t) => t.id);
    expect(ids).toContain("color-blocking");
    expect(ids).not.toContain("pop-out");
  });

  it("domainChoice infers a single branch and asks between several", () => {
    expect(domainChoice(seed, "differentiate", "chiaroscuro")).toEqual({ branchId: "differentiate.feature" });
    const two: Taxonomy = {
      ...seed,
      branchTechniques: [...seed.branchTechniques, { branchId: "differentiate.space", techniqueId: "chiaroscuro" }],
    };
    const both = two.branches.filter((b) => b.id === "differentiate.feature" || b.id === "differentiate.space");
    expect(domainChoice(two, "differentiate", "chiaroscuro")).toEqual({ ask: both });
  });

  it("matchesQuery agrees with match-cases.json (shared with search.rs)", () => {
    const all = [...seed.techniques, ...(cases.extraTechniques as Technique[])];
    for (const c of cases.cases) {
      const t = all.find((x) => x.id === c.technique)!;
      expect(matchesQuery(t, c.q), `${c.q} -> ${c.technique}`).toBe(c.match);
    }
    expect(matchesQuery(all[0], "  ")).toBe(true);
  });

  it("examplesFor ranks confirmed above suggested, newest first, at most n", () => {
    const s1 = ref("s1", "2026-11-03T00:00:00Z", [tag("t1", "chiaroscuro", true)]);
    const c1 = ref("c1", "2026-11-01T00:00:00Z", [tag("t2", "chiaroscuro")]);
    const c2 = ref("c2", "2026-11-02T00:00:00Z", [tag("t3", "chiaroscuro")]);
    const other = ref("o", "2026-11-04T00:00:00Z", [tag("t4", "pop-out")]);
    const ids = (xs: ReturnType<typeof examplesFor>) => xs.map((x) => (x.kind === "library" ? x.ref.id : x.demo.title));
    expect(ids(examplesFor([s1, c1, c2, other], "chiaroscuro"))).toEqual(["c2", "c1"]);
    expect(ids(examplesFor([s1, c1], "chiaroscuro"))).toEqual(["c1", "s1"]);
  });

  it("examplesFor fills up with demo examples after the library", () => {
    const demos = [demo("d1"), demo("d2"), demo("d3"), demo("x", "pop-out")];
    expect(examplesFor([], "chiaroscuro", 2, demos)).toEqual([
      { kind: "demo", demo: demos[0] },
      { kind: "demo", demo: demos[1] },
    ]);
    const c1 = ref("c1", "2026-11-01T00:00:00Z", [tag("t2", "chiaroscuro")]);
    expect(examplesFor([c1], "chiaroscuro", 2, demos)).toEqual([
      { kind: "library", ref: c1 },
      { kind: "demo", demo: demos[0] },
    ]);
  });

  it("presetFrom skips partial tags, drops regions and collapses duplicates", () => {
    const src = ref("r", "2026-11-01T00:00:00Z", [
      tag("a", "chiaroscuro"),
      tag("b"),
      tag("c", "pop-out", false, { region: { x: 0, y: 0, w: 0.5, h: 0.5 } }),
      tag("d", "chiaroscuro", true),
    ]);
    expect(presetFrom(src)).toStrictEqual([
      { operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.feature" },
      { operationId: "differentiate", techniqueId: "pop-out", branchId: "differentiate.feature" },
    ]);
  });
});
