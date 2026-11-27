import type { Region } from "../api";

export type Box = { left: number; top: number; width: number; height: number };

/** A plate of `aspect` (w/h) letterboxed, centred, into a w×h box (pixels). */
export function fitBox(aspect: number, w: number, h: number): Box {
  const wide = aspect >= w / h; // the plate is wider than the box, so its width binds
  const width = wide ? w : h * aspect;
  const height = wide ? w / aspect : h;
  return { left: (w - width) / 2, top: (h - height) / 2, width, height };
}

/** Whole plate letterboxed on a square N5 tile, with the matching region outlined (pixels). */
export function tileBox(aspect: number, tile: number, region?: Region): { plate: Box; outline?: Box } {
  const plate = fitBox(aspect, tile, tile);
  const { width, height } = plate;
  if (!region) return { plate };
  return {
    plate,
    outline: {
      left: plate.left + region.x * width,
      top: plate.top + region.y * height,
      width: region.w * width,
      height: region.h * height,
    },
  };
}

const px = (b: Box) => `left:${b.left}px;top:${b.top}px;width:${b.width}px;height:${b.height}px`;

/** `imgHTML` is already-escaped `<img>` markup; `color` is a CSS value for the outline. The
 * geometry rides in `data-css`: run `applyCss` on whatever this markup lands in (Plan 6 CSP). */
export function tileHTML(imgHTML: string, aspect: number, color: string, region?: Region, size = 64): string {
  const { plate, outline } = tileBox(aspect, size, region);
  const out = outline ? `<span class="treg" data-css="${px(outline)};--c:${color}"></span>` : "";
  return `<span class="tplate" data-css="${px(plate)}">${imgHTML}</span>${out}`;
}
