// @vitest-environment jsdom
// The fallback test needs a DOM host; the rest are pure and never touch pixi.js.
import { describe, expect, it } from "vitest";
import { viewRect, type Camera, type Rect } from "./camera";
import { NODE, TEX_CAP } from "./constants";
import {
  buildGrids,
  classifyDrag,
  clipLabel,
  labelsShown,
  barBoxes,
  LABEL_PX,
  mountCanvasOrFallback,
  nodeRect,
  planFrame,
  WebGLUnavailable,
  EdgeGate,
  sameLook,
  wireContextLoss,
  type Scene,
  type SceneEdge,
  type SceneNode,
} from "./frame";

const FALLBACK = "This view needs WebGL, which isn't available here. The Reference view still works.";
const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function refGrid(cols: number, rows: number, gap = 60): Map<string, SceneNode> {
  const nodes = new Map<string, SceneNode>();
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++) {
      const id = `r${i}_${j}`;
      nodes.set(id, { id, kind: "ref", x: i * gap, y: j * gap, size: NODE, url: `u/${id}`, aspect: 1 });
    }
  return nodes;
}

describe("planFrame", () => {
  it("plan_frame_culls_and_lods", () => {
    const nodes = refGrid(50, 40); // 2,000 nodes, 3000 x 2400 world units
    const { all } = buildGrids(nodes);
    const view = { w: 800, h: 600 };
    // Scale 1 sees 800 x 600 world units (plus the 10% margin): about a tenth of the nodes.
    const near: Camera = { x: 600, y: 400, scale: 1 };
    const plan = planFrame(all, nodes, near, view);
    const want = [...nodes.values()].filter((n) => overlaps(nodeRect(n), viewRect(near, view, 0.1))).map((n) => n.id);
    expect(new Set(plan.visible)).toEqual(new Set(want));
    expect(plan.visible.length).toBeGreaterThan(150);
    expect(plan.visible.length).toBeLessThan(300);

    const far: Camera = { x: 0, y: 0, scale: 0.1 };
    const farPlan = planFrame(all, nodes, far, view);
    expect(farPlan.visible.length).toBeGreaterThan(0);
    for (const id of farPlan.visible) expect(farPlan.lod.get(id)).toBe("dot");
  });

  it("plan_frame_visible_in_draw_order", () => {
    const nodes = refGrid(10, 10);
    const { all } = buildGrids(nodes);
    const plan = planFrame(all, nodes, { x: -100, y: -100, scale: 1 }, { w: 2000, h: 2000 });
    const order = [...nodes.keys()];
    const idx = plan.visible.map((id) => order.indexOf(id));
    expect(idx).toEqual([...idx].sort((a, b) => a - b));
  });

  it("plan_frame_dim_is_dot", () => {
    const nodes = new Map<string, SceneNode>([
      ["a", { id: "a", kind: "ref", x: 0, y: 0, size: NODE, url: "u/a", aspect: 1, dim: true }],
      ["b", { id: "b", kind: "ref", x: 100, y: 0, size: NODE, url: "u/b", aspect: 1 }],
    ]);
    const plan = planFrame(buildGrids(nodes).all, nodes, { x: -50, y: -50, scale: 4 }, { w: 1000, h: 1000 });
    expect(plan.lod.get("a")).toBe("dot");
    expect(plan.lod.get("b")).toBe("thumb");
  });

  it("plan_frame_caps_thumbs_at_tex_cap", () => {
    // 900 thumb-sized nodes all on screen: only TEX_CAP get a texture, the rest are dots,
    // so the cache never evicts a texture that is still drawn.
    const nodes = refGrid(30, 30, 50);
    const plan = planFrame(buildGrids(nodes).all, nodes, { x: -100, y: -100, scale: 0.25 }, { w: 2000, h: 2000 });
    expect(plan.visible.length).toBe(900);
    const thumbs = plan.visible.filter((id) => plan.lod.get(id) === "thumb");
    expect(thumbs.length).toBe(TEX_CAP);
    // Deterministic: the same frame plans the same thumbs.
    const again = planFrame(buildGrids(nodes).all, nodes, { x: -100, y: -100, scale: 0.25 }, { w: 2000, h: 2000 });
    expect(again.visible.filter((id) => again.lod.get(id) === "thumb")).toEqual(thumbs);
  });

  it("plan_frame_empty_is_empty", () => {
    const nodes = new Map<string, SceneNode>();
    const plan = planFrame(buildGrids(nodes).all, nodes, { x: 0, y: 0, scale: 1 }, { w: 100, h: 100 });
    expect(plan.visible).toEqual([]);
  });

  it("taxonomy nodes never become dots; references still do (final review I1)", () => {
    const nodes = new Map<string, SceneNode>([
      ["tech:a", { id: "tech:a", kind: "tech", x: 0, y: 0, size: 20, color: "var(--ink-3)", label: "A" }],
      ["op:o", { id: "op:o", kind: "op", x: 40, y: 0, size: 28, color: "var(--diff)", label: "O" }],
      ["r", { id: "r", kind: "ref", x: 80, y: 0, size: 20, url: "u/r", aspect: 1 }],
    ]);
    const plan = planFrame(buildGrids(nodes).all, nodes, { x: -1000, y: -1000, scale: 0.1 }, { w: 1000, h: 1000 });
    expect(plan.lod.get("tech:a")).toBe("thumb");
    expect(plan.lod.get("op:o")).toBe("thumb");
    expect(plan.lod.get("r")).toBe("dot");
  });

  it("labels hide by overlap, not by size: operations, then branches, then techniques (design review F5)", () => {
    const box = (id: string, x: number, y: number, rank: number, w = 60) => ({ id, x, y, w, h: 16, rank });
    const shown = labelsShown([
      box("tech:a", 0, 0, 2), // overlaps the branch below: the branch wins
      box("br:b", 10, 4, 1),
      box("op:o", 200, 0, 0),
      box("tech:c", 230, 10, 2), // overlaps the operation
      box("tech:d", 400, 0, 2),
      box("tech:e", 459, 0, 2), // touches d's right edge minus 1 px: overlaps, the earlier one stays
      box("tech:f", 470, 0, 2), // clear of d once e is hidden, by 10 px (the gap is 8)
      box("tech:g", 535, 0, 2), // 5 px from f: too close
      box("tech:sel", 10, 0, -1), // the selected name: always shown, and it pushes others out
    ]);
    expect([...shown].sort()).toEqual(["op:o", "tech:d", "tech:f", "tech:sel"]);
    expect(LABEL_PX).toBe(12);
  });

  it("a name on a Tree connector bar hides; the selected name still shows (quick look 2)", () => {
    const j = (id: string, x: number, y: number) => [id, { id, kind: "label" as const, x, y, text: "", font: "mono" as const, color: "#000" }] as const;
    const nodes = new Map<string, SceneNode>([j("j:dn:a", 0, 100), j("j:up:b", 200, 100), j("j:up:c", 0, 300)]);
    const edges = [
      { from: "j:dn:a", to: "j:up:b", width: 1, color: "#000" }, // a bar
      { from: "j:dn:a", to: "j:up:c", width: 1, color: "#000" }, // a stem: vertical, not an obstacle
    ];
    const bars = barBoxes(edges, nodes, { x: 0, y: 0, scale: 1 });
    expect(bars).toEqual([{ id: "bar:j:dn:a>j:up:b", x: 100, y: 99, w: 200, h: 2, rank: 0 }]);
    const name = (id: string, x: number, y: number, rank: number) => ({ id, x, y, w: 60, h: 19, rank });
    const shown = labelsShown([name("br:on", 30, 90, 1), name("br:clear", 30, 120, 1), name("tech:sel", 170, 90, -1)], bars);
    expect(shown.has("br:on")).toBe(false);
    expect(shown.has("br:clear")).toBe(true);
    expect(shown.has("tech:sel")).toBe(true);
  });

  it("labels are cut at 24 characters (final review I1)", () => {
    expect(clipLabel("Rim light")).toBe("Rim light");
    expect(clipLabel("x".repeat(24))).toBe("x".repeat(24));
    expect(clipLabel("Complementary pairing of warm and cool")).toBe("Complementary pairing of…");
  });
});

describe("picking", () => {
  it("pick_skips_dim_and_labels", () => {
    const nodes = new Map<string, SceneNode>([
      ["a", { id: "a", kind: "ref", x: 0, y: 0, size: NODE, url: "u/a", aspect: 1 }],
      ["b", { id: "b", kind: "ref", x: 0, y: 0, size: NODE, url: "u/b", aspect: 1, dim: true }],
      ["l", { id: "l", kind: "label", x: 0, y: 0, text: "x", font: "serif", color: "var(--ink)" }],
    ]);
    const { pick } = buildGrids(nodes);
    expect(pick.hit(0, 0)).toBe("a"); // b is on top but dim; the label is not pickable
  });

  it("pick_topmost_in_draw_order", () => {
    const nodes = new Map<string, SceneNode>([
      ["a", { id: "a", kind: "tech", x: 0, y: 0, size: NODE, color: "var(--seq)", label: "A" }],
      ["b", { id: "b", kind: "tech", x: 10, y: 0, size: NODE, color: "var(--seq)", label: "B" }],
    ]);
    expect(buildGrids(nodes).pick.hit(5, 0)).toBe("b");
  });
});

describe("classifyDrag", () => {
  it("drag_vs_pan", () => {
    const isTech = (id: string) => id.startsWith("tech:");
    expect(classifyDrag("tech:chiaroscuro", isTech)).toBe("drag");
    expect(classifyDrag(null, isTech)).toBe("pan");
    expect(classifyDrag("br:differentiate.feature", isTech)).toBe("pan");
  });
});

describe("mountCanvasOrFallback", () => {
  it("fallback_message_when_no_webgl", async () => {
    const host = document.createElement("div");
    await expect(mountCanvasOrFallback(host, () => Promise.reject(new WebGLUnavailable()))).resolves.toBeNull();
    expect(host.textContent).toBe(FALLBACK);
  });

  it("fallback_rethrows_other_errors", async () => {
    const host = document.createElement("div");
    await expect(mountCanvasOrFallback(host, () => Promise.reject(new Error("unsafe-eval")))).rejects.toThrow("unsafe-eval");
    expect(host.textContent).not.toContain("WebGL");
  });

  it("returns the scene when it mounts", async () => {
    const host = document.createElement("div");
    const scene = { destroy() {} } as unknown as Scene;
    await expect(mountCanvasOrFallback(host, async () => scene)).resolves.toBe(scene);
    expect(host.textContent).toBe("");
  });
});

describe("lost WebGL context (Review Focus 1, I1)", () => {
  const setup = () => {
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    host.append(canvas);
    const calls: string[] = [];
    const off = wireContextLoss(canvas, host, { lost: () => calls.push("lost"), restored: () => calls.push("restored") });
    return { host, canvas, calls, off };
  };

  it("lost_context_shows_fallback_and_hides_canvas", () => {
    const { host, canvas, calls } = setup();
    const e = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(true); // lets the browser restore it
    expect(host.querySelector(".graph-fallback")?.textContent).toBe(FALLBACK);
    expect(canvas.hidden).toBe(true);
    expect(calls).toEqual(["lost"]);
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(host.querySelectorAll(".graph-fallback").length).toBe(1); // never twice
  });

  it("restored_context_removes_fallback_and_rebuilds", () => {
    const { host, canvas, calls } = setup();
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    canvas.dispatchEvent(new Event("webglcontextrestored"));
    expect(host.querySelector(".graph-fallback")).toBeNull();
    expect(canvas.hidden).toBe(false);
    expect(calls).toEqual(["lost", "restored"]);
  });

  it("unwired_after_destroy", () => {
    const { host, canvas, calls, off } = setup();
    off();
    canvas.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
    expect(calls).toEqual([]);
    expect(host.querySelector(".graph-fallback")).toBeNull();
  });
});

describe("EdgeGate (I2)", () => {
  it("edges_redraw_only_when_inputs_change", () => {
    const g = new EdgeGate();
    const edges: SceneEdge[] = [{ from: "a", to: "b", width: 1, color: "var(--ink-2)" }];
    let redraws = 0;
    const frame = (e: SceneEdge[], nodesV: number, scale: number, themeV: number) => {
      if (g.needs(e, nodesV, scale, themeV)) redraws++;
    };
    frame(edges, 1, 1, 0); // first frame draws
    for (let i = 0; i < 100; i++) frame(edges, 1, 1, 0); // 100 pan frames: same scale, nothing redrawn
    expect(redraws).toBe(1);
    frame([...edges], 1, 1, 0); // new edge list
    frame([...edges].slice(), 2, 1, 0); // new list and new node positions
    expect(redraws).toBe(3);
    const same = [...edges];
    frame(same, 2, 1, 0);
    frame(same, 3, 1, 0); // node positions changed
    frame(same, 3, 1.25, 0); // zoom
    frame(same, 3, 1.25, 1); // theme
    frame(same, 3, 1.25, 1);
    expect(redraws).toBe(7);
  });
});

describe("sameLook (Task 7: streaming layouts move nodes, not rebuild them)", () => {
  it("same_look_ignores_position_only", () => {
    const a: SceneNode = { id: "a", kind: "ref", x: 0, y: 0, size: NODE, url: "u", aspect: 1 };
    expect(sameLook(a, { ...a, x: 50, y: -3 })).toBe(true);
    expect(sameLook(a, { ...a, dim: true })).toBe(false);
    expect(sameLook(a, { ...a, url: "v" })).toBe(false);
    expect(sameLook(a, { ...a, outline: { region: { x: 0, y: 0, w: 1, h: 1 }, color: "var(--seq)", state: "full" } })).toBe(false);
    const t: SceneNode = { id: "t", kind: "tech", x: 0, y: 0, size: 32, color: "var(--seq)", label: "A" };
    expect(sameLook(t, { ...t, x: 9 })).toBe(true);
    expect(sameLook(t, { ...t, label: "B" })).toBe(false);
  });
});
