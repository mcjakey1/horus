import { describe, expect, it } from "vitest";
import type { Region } from "../api";
import { MIN_REGION, normRect } from "./regions";

const plate = { left: 100, top: 50, width: 400, height: 300 };
const close = (r: Region | null, want: Region) => {
  expect(r).not.toBeNull();
  for (const k of ["x", "y", "w", "h"] as const) expect(r![k]).toBeCloseTo(want[k], 6);
};

describe("normRect", () => {
  it("normalises a drag to 0..1 of the plate", () => {
    close(normRect({ x: 200, y: 125 }, { x: 300, y: 200 }, plate), { x: 0.25, y: 0.25, w: 0.25, h: 0.25 });
  });

  it("gives the same region for a reversed drag", () => {
    close(normRect({ x: 300, y: 200 }, { x: 200, y: 125 }, plate), { x: 0.25, y: 0.25, w: 0.25, h: 0.25 });
  });

  it("clamps a drag from the margin to past the plate into 0..1", () => {
    close(normRect({ x: 20, y: 10 }, { x: 900, y: 125 }, plate), { x: 0, y: 0, w: 1, h: 0.25 });
  });

  it("drops a 2 px drag", () => {
    expect(normRect({ x: 200, y: 125 }, { x: 202, y: 127 }, plate)).toBeNull();
    expect(MIN_REGION).toBe(0.01);
  });

  it("drops a box thinner than MIN_REGION on one side only", () => {
    expect(normRect({ x: 200, y: 125 }, { x: 300, y: 126 }, plate)).toBeNull();
  });

  it("rejects NaN points and a zero-size plate", () => {
    expect(normRect({ x: NaN, y: 125 }, { x: 300, y: 200 }, plate)).toBeNull();
    expect(normRect({ x: 0, y: 0 }, { x: 300, y: 200 }, { left: 0, top: 0, width: 0, height: 0 })).toBeNull();
  });
});
