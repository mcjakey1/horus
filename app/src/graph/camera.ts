import { MAX_SCALE, MIN_SCALE } from "./constants";

export type Rect = { x: number; y: number; w: number; h: number };
/** World→screen: sx = (wx - x) * scale, sy = (wy - y) * scale. */
export type Camera = { x: number; y: number; scale: number };

const clampScale = (s: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));

/** Zooms by `factor`, keeping the world point under screen (sx, sy) fixed. */
export function zoomAt(c: Camera, sx: number, sy: number, factor: number): Camera {
  const scale = clampScale(c.scale * factor);
  return { x: c.x + sx / c.scale - sx / scale, y: c.y + sy / c.scale - sy / scale, scale };
}

/** Moves the world with a drag of (dsx, dsy) screen pixels. */
export function pan(c: Camera, dsx: number, dsy: number): Camera {
  return { x: c.x - dsx / c.scale, y: c.y - dsy / c.scale, scale: c.scale };
}

/** Centres `bounds` in the view with `pad` screen pixels around it. Never NaN, even for empty bounds. */
export function fit(bounds: Rect, view: { w: number; h: number }, pad = 40): Camera {
  const sw = Math.max(1, view.w - 2 * pad) / bounds.w;
  const sh = Math.max(1, view.h - 2 * pad) / bounds.h;
  const scale = clampScale(Math.min(sw, sh));
  return {
    x: bounds.x + bounds.w / 2 - view.w / (2 * scale),
    y: bounds.y + bounds.h / 2 - view.h / (2 * scale),
    scale,
  };
}

/** The world rect the camera sees, grown by `margin` of its size on every side. */
export function viewRect(c: Camera, view: { w: number; h: number }, margin = 0.1): Rect {
  const w = view.w / c.scale;
  const h = view.h / c.scale;
  return { x: c.x - w * margin, y: c.y - h * margin, w: w * (1 + 2 * margin), h: h * (1 + 2 * margin) };
}

/**
 * Keeps `rect` on screen (final review I6): the same camera when the rect lies inside the view
 * inset by `margin` of its size, otherwise one centred on the rect at the same scale.
 */
export function reveal(c: Camera, view: { w: number; h: number }, rect: Rect, margin = 0.05): Camera {
  const w = view.w / c.scale;
  const h = view.h / c.scale;
  const inside = rect.x >= c.x + w * margin && rect.y >= c.y + h * margin
    && rect.x + rect.w <= c.x + w * (1 - margin) && rect.y + rect.h <= c.y + h * (1 - margin);
  if (inside) return c;
  return { x: rect.x + rect.w / 2 - w / 2, y: rect.y + rect.h / 2 - h / 2, scale: c.scale };
}
