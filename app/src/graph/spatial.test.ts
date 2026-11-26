import { describe, expect, it } from "vitest";
import { SpatialGrid } from "./spatial";
import type { Rect } from "./camera";

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("SpatialGrid", () => {
  it("query_matches_bruteforce", () => {
    const r = rng(7);
    const grid = new SpatialGrid(64);
    const rects = new Map<string, Rect>();
    for (let i = 0; i < 2000; i++) {
      const rect = { x: (r() - 0.5) * 4000, y: (r() - 0.5) * 4000, w: r() * 120, h: r() * 120 };
      rects.set(`n${i}`, rect);
      grid.insert(`n${i}`, rect);
    }
    for (let q = 0; q < 50; q++) {
      // Mix small queries with a few that cover the whole world.
      const s = q % 10 === 0 ? 10000 : r() * 800;
      const query = { x: (r() - 0.5) * 4000 - s / 2, y: (r() - 0.5) * 4000 - s / 2, w: s, h: s };
      const expected = [...rects].filter(([, rect]) => overlaps(rect, query)).map(([id]) => id);
      expect(grid.query(query).sort()).toEqual(expected.sort());
    }
  });

  it("hit_topmost", () => {
    const grid = new SpatialGrid(64);
    grid.insert("a", { x: 0, y: 0, w: 100, h: 100 });
    grid.insert("b", { x: 50, y: 50, w: 100, h: 100 });
    grid.insert("c", { x: 300, y: 300, w: 10, h: 10 });
    expect(grid.hit(75, 75)).toBe("b");
    expect(grid.hit(10, 10)).toBe("a");
    expect(grid.hit(200, 10)).toBeNull();
  });

  it("clear empties the grid", () => {
    const grid = new SpatialGrid(64);
    grid.insert("a", { x: 0, y: 0, w: 10, h: 10 });
    grid.clear();
    expect(grid.query({ x: -100, y: -100, w: 200, h: 200 })).toEqual([]);
    expect(grid.hit(5, 5)).toBeNull();
  });
});
