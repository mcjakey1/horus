import { describe, expect, it } from "vitest";
import type { Reference, Tag } from "../api";
import { matchesFilter, toggle, type Filter } from "./filter";

const tag = (id: string, techniqueId?: string): Tag => ({ id, operationId: "op", techniqueId, branchId: techniqueId && "br", suggested: false });
const ref = (id: string, tags: Tag[]): Reference => ({
  id,
  title: id,
  file: `images/${id}.jpg`,
  hash: id,
  width: 1,
  height: 1,
  addedAt: "2026-11-25T00:00:00Z",
  tags,
  thumb256: "",
  thumb1024: "",
});

const A = ref("A", [tag("a1", "t1")]);
const B = ref("B", [tag("b1", "t1"), tag("b2", "t2")]);
const C = ref("C", [tag("c1", "t2")]);
const P = ref("P", [tag("p1")]); // a partial tag only
const pick = (f: Filter) => [A, B, C].filter((r) => matchesFilter(r, f)).map((r) => r.id);

describe("matchesFilter", () => {
  it("and_needs_every_technique", () => {
    expect(pick({ techniques: ["t1", "t2"], mode: "and" })).toEqual(["B"]);
  });

  it("or_needs_any_technique", () => {
    expect(pick({ techniques: ["t1", "t2"], mode: "or" })).toEqual(["A", "B", "C"]);
  });

  it("empty_filter_matches_everything", () => {
    expect(pick({ techniques: [], mode: "or" })).toEqual(["A", "B", "C"]);
    expect(pick({ techniques: [], mode: "and" })).toEqual(["A", "B", "C"]);
  });

  it("partial_tags_never_match", () => {
    expect(matchesFilter(P, { techniques: ["t1"], mode: "or" })).toBe(false);
    expect(matchesFilter(P, { techniques: ["t1"], mode: "and" })).toBe(false);
    expect(matchesFilter(P, { techniques: [], mode: "and" })).toBe(true);
  });
});

describe("toggle", () => {
  it("adds_then_removes", () => {
    const f: Filter = { techniques: ["t1"], mode: "and" };
    expect(toggle(f, "t2")).toEqual({ techniques: ["t1", "t2"], mode: "and" });
    expect(toggle(f, "t1")).toEqual({ techniques: [], mode: "and" });
    expect(f.techniques).toEqual(["t1"]); // not mutated
  });
});
