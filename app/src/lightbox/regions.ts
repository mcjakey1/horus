// Region geometry for the lightbox (SPEC §3: {x, y, w, h} in 0..1 of the original image).
import type { Region } from "../api";
import type { Box } from "../reference/tile";

export type Pt = { x: number; y: number }; // client px
export const MIN_REGION = 0.01;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Clamps a drag from `a` to `b` into the plate, normalises it to 0..1, and drops slivers (and NaN). */
export function normRect(a: Pt, b: Pt, plate: Box): Region | null {
  if (!(plate.width > 0 && plate.height > 0)) return null; // a 0-size plate would clamp to the whole image
  const nx = (p: Pt) => clamp01((p.x - plate.left) / plate.width);
  const ny = (p: Pt) => clamp01((p.y - plate.top) / plate.height);
  const x = Math.min(nx(a), nx(b)), y = Math.min(ny(a), ny(b));
  const w = Math.max(nx(a), nx(b)) - x, h = Math.max(ny(a), ny(b)) - y;
  return w >= MIN_REGION && h >= MIN_REGION ? { x, y, w, h } : null; // NaN fails both comparisons
}
