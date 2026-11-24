import { describe, expect, it } from "vitest";
import { tileBox } from "./tile";

describe("tileBox", () => {
  it("letterboxes a portrait plate horizontally, with no outline", () => {
    expect(tileBox(3 / 4, 64)).toEqual({ plate: { left: 8, top: 0, width: 48, height: 64 } });
  });

  it("outlines the region inside the letterboxed plate", () => {
    expect(tileBox(3 / 4, 64, { x: 0.5, y: 0.5, w: 0.5, h: 0.25 }).outline).toEqual({
      left: 32,
      top: 32,
      width: 24,
      height: 16,
    });
  });

  it("letterboxes a landscape plate vertically", () => {
    expect(tileBox(4 / 3, 64).plate).toEqual({ left: 0, top: 8, width: 64, height: 48 });
  });
});
