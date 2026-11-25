// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mountWindowedGrid } from "./windowed";

const box = (w: number, h: number) => {
  document.body.innerHTML = `<div id="g"></div>`;
  const g = document.getElementById("g")!;
  Object.defineProperty(g, "clientWidth", { value: w, configurable: true });
  Object.defineProperty(g, "clientHeight", { value: h, configurable: true });
  return g;
};
const tile = (n: number) => {
  const b = document.createElement("button");
  b.className = "t";
  b.innerHTML = `<img alt="">`;
  b.querySelector("img")!.alt = String(n);
  return b;
};
const items = (n: number) => Array.from({ length: n }, (_, i) => i);

afterEach(() => (document.body.innerHTML = ""));

describe("windowed grid", () => {
  it("windowed_grid_bounds_dom: 2,000 items in 800×600 stay under 200 images", () => {
    const g = box(800, 600);
    const grid = mountWindowedGrid(g, { items: items(2000), tile: 100, gap: 8, render: tile });
    expect(g.querySelectorAll("img").length).toBeGreaterThan(0);
    expect(g.querySelectorAll("img").length).toBeLessThanOrEqual(200);
    expect(g.querySelector('[data-i="0"]')).not.toBeNull();
    grid.scrollTo(1500);
    expect(g.querySelector('[data-i="1500"]')).not.toBeNull();
    expect(g.querySelector('[data-i="0"]')).toBeNull();
    expect(g.querySelectorAll("img").length).toBeLessThanOrEqual(200);
    for (const t of g.querySelectorAll("[data-i]")) expect(t.outerHTML).not.toContain("style=");
    grid.destroy();
    expect(g.children).toHaveLength(0);
  });

  it("keeps the nodes it can when the window moves, so a focused tile keeps focus", () => {
    const g = box(800, 600);
    const grid = mountWindowedGrid(g, { items: items(2000), tile: 100, gap: 8, render: tile });
    const t = g.querySelector<HTMLElement>('[data-i="20"]')!;
    t.focus();
    grid.scrollTo(30); // a row or two down: tile 20 is still in the window
    expect(g.querySelector('[data-i="20"]')).toBe(t);
    expect(document.activeElement).toBe(t);
  });

  it("update renders the new items", () => {
    const g = box(800, 600);
    const grid = mountWindowedGrid(g, { items: items(5), tile: 100, gap: 8, render: tile });
    expect(g.querySelectorAll("[data-i]")).toHaveLength(5);
    grid.update(items(2));
    expect(g.querySelectorAll("[data-i]")).toHaveLength(2);
    grid.update([]);
    expect(g.querySelectorAll("[data-i]")).toHaveLength(0);
  });
});
