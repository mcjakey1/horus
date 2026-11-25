// @vitest-environment jsdom
// The fallback test needs a DOM host; the rest are pure and never touch pixi.js.
import { describe, expect, it } from "vitest";
import { viewRect, type Camera, type Rect } from "./camera";
import { NODE, TEX_CAP } from "./constants";
import {
  buildGrids,
  classifyDrag,
  mountCanvasOrFallback,
  nodeRect,
  planFrame,
  WebGLUnavailable,
  EdgeGate,
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
