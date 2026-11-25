import { describe, expect, it } from "vitest";
import { fit, pan, viewRect, zoomAt, type Camera } from "./camera";
import { MAX_SCALE, MIN_SCALE } from "./constants";

// Seeded LCG so a failure reproduces.
const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const toWorld = (c: Camera, sx: number, sy: number) => ({ x: sx / c.scale + c.x, y: sy / c.scale + c.y });

describe("camera", () => {
  it("zoom_keeps_point_fixed", () => {
    const r = rng(1);
    for (let i = 0; i < 200; i++) {
      const c: Camera = { x: (r() - 0.5) * 5000, y: (r() - 0.5) * 5000, scale: 0.1 + r() * 2 };
      const sx = r() * 1920;
      const sy = r() * 1080;
      const before = toWorld(c, sx, sy);
      const after = toWorld(zoomAt(c, sx, sy, 0.5 + r() * 1.5), sx, sy);
      expect(after.x).toBeCloseTo(before.x, 9);
      expect(after.y).toBeCloseTo(before.y, 9);
    }
  });

  it("scale_clamped", () => {
    const c: Camera = { x: 0, y: 0, scale: 1 };
    expect(zoomAt(c, 100, 100, 1e6).scale).toBe(MAX_SCALE);
    expect(zoomAt(c, 100, 100, 1e-6).scale).toBe(MIN_SCALE);
    expect([MIN_SCALE, MAX_SCALE]).toEqual([0.05, 4]);
  });

  it("fit_contains_bounds", () => {
    const view = { w: 1200, h: 800 };
    for (const b of [
      { x: -300, y: 50, w: 2000, h: 400 },
      { x: 10, y: 10, w: 100, h: 900 },
      { x: 0, y: 0, w: 0, h: 0 },
    ]) {
      const v = viewRect(fit(b, view), view, 0);
      expect(v.x).toBeLessThanOrEqual(b.x);
      expect(v.y).toBeLessThanOrEqual(b.y);
      expect(v.x + v.w).toBeGreaterThanOrEqual(b.x + b.w);
      expect(v.y + v.h).toBeGreaterThanOrEqual(b.y + b.h);
    }
  });

  it("pan moves the world with the drag", () => {
    const c = pan({ x: 0, y: 0, scale: 2 }, 100, -40);
    expect(toWorld(c, 100, -40)).toEqual({ x: 0, y: 0 });
  });

  it("viewRect adds the margin on every side", () => {
    expect(viewRect({ x: 0, y: 0, scale: 1 }, { w: 100, h: 50 })).toEqual({ x: -10, y: -5, w: 120, h: 60 });
  });
});
