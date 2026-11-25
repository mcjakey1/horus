import { describe, expect, it } from "vitest";
import { fitBox, tileBox } from "./tile";

describe("fitBox", () => {
  it("letterboxes into any w×h", () => {
    const b = fitBox(4 / 3, 800, 400);
    expect(b.left).toBeCloseTo(133.333, 2);
    expect(b.top).toBe(0);
    expect(b.width).toBeCloseTo(533.333, 2);
    expect(b.height).toBe(400);
  });

  it("pillarboxes a tall plate in a wide box, and fills an exact fit", () => {
    expect(fitBox(1 / 2, 300, 400)).toEqual({ left: 50, top: 0, width: 200, height: 400 });
    expect(fitBox(2, 400, 200)).toEqual({ left: 0, top: 0, width: 400, height: 200 });
  });
});

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
