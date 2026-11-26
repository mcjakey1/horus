// The lightbox's zoom and pan (Plan 4 Task 6). Kept apart from graph/camera.ts on purpose: its
// clamps and conventions differ (audit #20). A View maps image px to stage px: x' = x*scale + tx.
import type { Region } from "../api";
import type { Box } from "../reference/tile";

export type View = { scale: number; tx: number; ty: number };
type Size = { w: number; h: number };
type Pt = { x: number; y: number };

export const MAX_ZOOM = 8; // 800 %

/** The whole image letterboxed into the viewport, centred. */
export function fitView(img: Size, vp: Size): View {
  const scale = Math.min(vp.w / img.w, vp.h / img.h);
  return { scale, tx: (vp.w - img.w * scale) / 2, ty: (vp.h - img.h * scale) / 2 };
}

/** Scales by `factor`, clamped to [min, MAX_ZOOM] (`min` wins), keeping the image point under `pt` still. */
export function zoomAt(v: View, factor: number, pt: Pt, min: number): View {
  const scale = Math.max(min, Math.min(MAX_ZOOM, v.scale * factor));
  const k = scale / v.scale;
  return { scale, tx: pt.x - (pt.x - v.tx) * k, ty: pt.y - (pt.y - v.ty) * k };
}

/** A side larger than the viewport keeps the viewport covered; a smaller side stays centred. */
const along = (t: number, size: number, vp: number) =>
  size <= vp ? (vp - size) / 2 : Math.min(0, Math.max(vp - size, t));

/** Moves the image by (dx, dy) stage px, never off the viewport. `panBy(v, 0, 0, …)` clamps. */
export function panBy(v: View, dx: number, dy: number, img: Size, vp: Size): View {
  return { scale: v.scale, tx: along(v.tx + dx, img.w * v.scale, vp.w), ty: along(v.ty + dy, img.h * v.scale, vp.h) };
}

/** The image's box in stage px. `normRect` takes client px: add the stage's client offset first. */
export function plateOf(v: View, img: Size): Box {
  return { left: v.tx, top: v.ty, width: img.w * v.scale, height: img.h * v.scale };
}

/** The tag whose region holds `pt` (stage px); the smallest wins. */
export function hitRegion(regions: { tagId: string; region: Region }[], pt: Pt, plate: Box): string | null {
  let best: string | null = null;
  let area = Infinity;
  for (const { tagId, region: r } of regions) {
    const x = (pt.x - plate.left) / plate.width;
    const y = (pt.y - plate.top) / plate.height;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h && r.w * r.h < area) {
      best = tagId;
      area = r.w * r.h;
    }
  }
  return best;
}
