import type { Region } from "../api";

export type Box = { left: number; top: number; width: number; height: number };

/** Whole plate letterboxed on a square N5 tile, with the matching region outlined (pixels). */
export function tileBox(aspect: number, tile: number, region?: Region): { plate: Box; outline?: Box } {
  const width = aspect >= 1 ? tile : tile * aspect;
  const height = aspect >= 1 ? tile / aspect : tile;
  const plate = { left: (tile - width) / 2, top: (tile - height) / 2, width, height };
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

/** `imgHTML` is already-escaped `<img>` markup; `color` is a CSS value for the outline. */
export function tileHTML(imgHTML: string, aspect: number, color: string, region?: Region, size = 64): string {
  const { plate, outline } = tileBox(aspect, size, region);
  const out = outline ? `<span class="treg" style="${px(outline)};--c:${color}"></span>` : "";
  return `<span class="tplate" style="${px(plate)}">${imgHTML}</span>${out}`;
}
