// The Pixi-free half of the scene (R6): types, the per-frame plan, picking grids and the WebGL
// fallback. Views and their tests import this; only scene.ts loads pixi.js.
import type { Region } from "../api";
import { viewRect, type Camera, type Rect } from "./camera";
import { NODE, TEX_CAP } from "./constants";
import { lodFor, type Lod } from "./lod";
import { SpatialGrid } from "./spatial";

export type SceneNode =
  | {
      id: string; kind: "ref"; x: number; y: number; size: number; url: string; aspect: number;
      dim?: boolean; // R9: out of scope (Plan 4 board scope): always "dot", never picked
      outline?: { region: Region; color: string; state: "full" | "partial" | "region" };
    }
  | { id: string; kind: "label"; x: number; y: number; text: string; font: "serif" | "mono"; color: string }
  | { id: string; kind: "op" | "branch" | "tech"; x: number; y: number; size: number; color: string; label: string };
export type SceneEdge = { from: string; to: string; width: number; color: string; curve?: boolean };
/** `visible` is in draw order (the order of `setNodes`), never `SpatialGrid.query` order. */
export type FramePlan = { visible: string[]; lod: Map<string, Lod> };
export type Mods = { shift: boolean };

export interface Scene {
  setNodes(nodes: SceneNode[]): void; // rebuilds the grid; keeps the camera
  setEdges(edges: SceneEdge[]): void; // the caller decides which edges are visible
  camera(): Camera;
  setCamera(c: Camera, animate?: boolean): void;
  fitAll(): void;
  on(ev: "hover" | "select" | "activate", fn: (id: string | null, mods: Mods) => void): void; // activate = double-click or Enter
  setDraggable(pred: (id: string) => boolean): void; // default: nothing is draggable
  onDrop(fn: (dragged: string, target: string | null) => void): void; // target = node under the pointer on release
  select(id: string | null): void; // also from the keyboard
  destroy(): void;
}

export class WebGLUnavailable extends Error {
  constructor() {
    super("WebGL unavailable");
    this.name = "WebGLUnavailable";
  }
}

const FALLBACK = "This view needs WebGL, which isn't available here. The Reference view still works.";

/** A node's world rect: shapes are centred on (x, y); a label is a point. */
export function nodeRect(n: SceneNode): Rect {
  if (n.kind === "label") return { x: n.x - 0.5, y: n.y - 0.5, w: 1, h: 1 };
  return { x: n.x - n.size / 2, y: n.y - n.size / 2, w: n.size, h: n.size };
}

/** `all` culls; `pick` holds only what can be picked (no labels, no dim refs), in draw order. */
export function buildGrids(nodes: Map<string, SceneNode>): { all: SpatialGrid; pick: SpatialGrid } {
  const all = new SpatialGrid(NODE * 2);
  const pick = new SpatialGrid(NODE * 2);
  for (const n of nodes.values()) {
    const r = nodeRect(n);
    all.insert(n.id, r);
    if (n.kind !== "label" && !(n.kind === "ref" && n.dim)) pick.insert(n.id, r);
  }
  return { all, pick };
}

/**
 * What to draw this frame: the nodes inside the viewport plus a 10% margin, each with its LOD.
 * At most TEX_CAP references get a thumbnail, the ones nearest the view centre; the rest draw as
 * dots, so the texture cache never evicts a texture that is still on screen.
 */
export function planFrame(
  grid: SpatialGrid,
  nodes: Map<string, SceneNode>,
  cam: Camera,
  view: { w: number; h: number },
): FramePlan {
  const hits = new Set(grid.query(viewRect(cam, view, 0.1)));
  // ponytail: an O(N) pass for draw order; fine at a few thousand nodes
  const visible = [...nodes.keys()].filter((id) => hits.has(id));
  const lod = new Map<string, Lod>();
  const thumbs: SceneNode[] = [];
  for (const id of visible) {
    const n = nodes.get(id)!;
    if (n.kind === "label") lod.set(id, "thumb");
    else if (n.kind === "ref" && n.dim) lod.set(id, "dot");
    else {
      const l = lodFor(n.size, cam.scale);
      lod.set(id, l);
      if (n.kind === "ref" && l === "thumb") thumbs.push(n);
    }
  }
  if (thumbs.length > TEX_CAP) {
    const cx = cam.x + view.w / (2 * cam.scale);
    const cy = cam.y + view.h / (2 * cam.scale);
    const d = (n: SceneNode) => (n.x - cx) ** 2 + (n.y - cy) ** 2;
    thumbs.sort((a, b) => d(a) - d(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const n of thumbs.slice(TEX_CAP)) lod.set(n.id, "dot");
  }
  return { visible, lod };
}

/** A pointer drag that starts on a draggable node drags it; anything else pans. */
export function classifyDrag(startHit: string | null, draggable: (id: string) => boolean): "drag" | "pan" {
  return startHit !== null && draggable(startHit) ? "drag" : "pan";
}

/** Mounts the scene, or shows the plain-words fallback when WebGL is missing (Review Focus 1). */
export async function mountCanvasOrFallback(host: HTMLElement, make: () => Promise<Scene>): Promise<Scene | null> {
  try {
    return await make();
  } catch (e) {
    if (!(e instanceof WebGLUnavailable)) throw e; // a CSP or code error must not hide as "no WebGL"
    const p = document.createElement("p");
    p.className = "graph-fallback";
    p.textContent = FALLBACK;
    host.replaceChildren(p);
    return null;
  }
}
