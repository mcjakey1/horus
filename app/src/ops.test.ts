import { describe, expect, it } from "vitest";
import type { Taxonomy } from "./api";
import seedJson from "../src-tauri/resources/taxonomy.json";
import { opInk, opLabel } from "./ops";

const seed = seedJson as unknown as Taxonomy;
const NEUTRAL = { base: "var(--ink-2)", text: "var(--ink)", on: "var(--panel)" };
const withOp = (id: string, color: string | null): Taxonomy => ({
  ...seed,
  operations: [...seed.operations.filter((o) => o.id !== id), { id, name: id, plainLabel: id, color, icon: "", description: "" }],
});

describe("ops", () => {
  it("op_ink_seed_extra_neutral", () => {
    expect(opInk(seed, "group")).toEqual({ base: "var(--group)", text: "var(--group-text)", on: "var(--group-on)" });
    expect(opInk(seed, "sequence")).toEqual({ base: "var(--seq)", text: "var(--seq-text)", on: "var(--seq-on)" });
    expect(opInk(withOp("provoke", "teal"), "provoke")).toEqual({
      base: "var(--x-teal)",
      text: "var(--x-teal-text)",
      on: "var(--x-teal-on)",
    });
    // color takes precedence over the seed mapping (Plan 3 Task 2)
    expect(opInk(withOp("differentiate", "rose"), "differentiate").base).toBe("var(--x-rose)");
    expect(opInk(seed, "provoke")).toEqual(NEUTRAL);
    expect(opInk(withOp("provoke", "chartreuse"), "provoke")).toEqual(NEUTRAL);
    expect(opInk(withOp("constructor", null), "constructor")).toEqual(NEUTRAL);
  });

  it("opLabel reads the data", () => {
    expect(opLabel(seed, "sequence")).toEqual({ plain: "Lead the eye", name: "Sequence" });
    const renamed: Taxonomy = {
      ...seed,
      operations: seed.operations.map((o) => (o.id === "sequence" ? { ...o, name: "Flow", plainLabel: "Walk the eye" } : o)),
    };
    expect(opLabel(renamed, "sequence")).toEqual({ plain: "Walk the eye", name: "Flow" });
    expect(opLabel(seed, "provoke")).toEqual({ plain: "provoke", name: "provoke" });
  });
});
