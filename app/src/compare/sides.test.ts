import { describe, expect, it } from "vitest";
import type { Reference, Tag, Taxonomy } from "../api";
import { sides } from "./sides";

const tag = (id: string, tech: string | null, op = "group", region?: Tag["region"]): Tag => ({
  id, operationId: op, ...(tech ? { techniqueId: tech, branchId: `${op}.feature` } : {}), region, suggested: false,
});
const ref = (id: string, tags: Tag[]): Reference => ({
  id, title: id, file: `images/${id}.jpg`, hash: id, width: 3, height: 4, addedAt: "", tags, thumb256: "", thumb1024: "",
});
const techs = (...ids: string[]) => ids.map((id) => ({ id, name: id, icon: "", description: "", synonyms: [], examples: [], custom: false }));
const tax = (...order: string[]) => ({ operations: [], domains: [], branches: [], branchTechniques: [], techniques: techs(...order) }) as Taxonomy;

describe("sides", () => {
  it("splits shared, only-here and operation-only", () => {
    const a = ref("a", [tag("1", "t1"), tag("2", "t2"), tag("3", null, "infer")]);
    const b = ref("b", [tag("4", "t2"), tag("5", "t3")]);
    expect(sides(a, b, ["t2"], tax("t1", "t2", "t3"))).toEqual({ shared: ["t2"], onlyA: ["t1"], onlyB: ["t3"], partialA: ["infer"], partialB: [] });
  });

  it("two region tags of one technique count once", () => {
    const r = { x: 0, y: 0, w: 0.5, h: 0.5 };
    const a = ref("a", [tag("1", "t1", "group", r), tag("2", "t1", "group", { ...r, x: 0.5 })]);
    expect(sides(a, ref("b", []), [], tax("t1")).onlyA).toEqual(["t1"]);
  });

  it("lists follow the taxonomy's order, not the tags'", () => {
    const a = ref("a", [tag("1", "t2"), tag("2", "t1"), tag("3", "t3")]);
    const b = ref("b", [tag("4", "t2"), tag("5", "t3"), tag("6", "t1")]);
    const s = sides(a, ref("b0", []), [], tax("t3", "t1", "t2"));
    expect(s.onlyA).toEqual(["t3", "t1", "t2"]);
    expect(sides(ref("a0", []), b, [], tax("t3", "t1", "t2")).onlyB).toEqual(["t3", "t1", "t2"]);
  });
});
