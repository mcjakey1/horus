import { describe, expect, it } from "vitest";
import { fitView, hitRegion, MAX_ZOOM, panBy, plateOf, zoomAt } from "./zoom";

const img = { w: 4000, h: 3000 };
const vp = { w: 800, h: 800 };

describe("lightbox zoom", () => {
  it("fitView letterboxes and centres", () => {
    expect(fitView(img, vp)).toEqual({ scale: 0.2, tx: 0, ty: 100 });
  });

  it("zoomAt keeps the image point under the cursor and clamps the scale", () => {
    const fit = fitView(img, vp);
    const pt = { x: 400, y: 400 };
    const toImage = (v: typeof fit) => ({ x: (pt.x - v.tx) / v.scale, y: (pt.y - v.ty) / v.scale });
    const v = zoomAt(fit, 2, pt, 0.2);
    expect(v.scale).toBeCloseTo(0.4, 12);
    const [a, b] = [toImage(fit), toImage(v)];
    expect(b.x).toBeCloseTo(a.x, 9);
    expect(b.y).toBeCloseTo(a.y, 9);
    expect(zoomAt(fit, 1000, pt, 0.2).scale).toBe(MAX_ZOOM);
    expect(zoomAt(fit, 0.01, pt, 0.2).scale).toBe(0.2);
  });

  it("panBy never moves the image off the viewport", () => {
    const v = { scale: 1, tx: -100, ty: -100 }; // 4000×3000 in 800×800
    const far = panBy(v, 1e6, 1e6, img, vp);
    expect([far.tx, far.ty]).toEqual([0, 0]); // the left and top edges stop at the viewport's
    const back = panBy(v, -1e6, -1e6, img, vp);
    expect([back.tx, back.ty]).toEqual([800 - 4000, 800 - 3000]);
    // A side smaller than the viewport stays centred.
    const fit = fitView(img, vp);
    expect(panBy(fit, 50, 50, img, vp)).toEqual(fit);
  });

  it("plateOf is the image's box in stage px", () => {
    expect(plateOf({ scale: 1.6, tx: -200, ty: -150 }, { w: 1000, h: 750 })).toEqual({ left: -200, top: -150, width: 1600, height: 1200 });
  });

  it("hitRegion picks the smallest region under the point", () => {
    const plate = { left: 0, top: 0, width: 1000, height: 1000 };
    const regions = [
      { tagId: "big", region: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 } },
      { tagId: "small", region: { x: 0.4, y: 0.4, w: 0.1, h: 0.1 } },
    ];
    expect(hitRegion(regions, { x: 450, y: 450 }, plate)).toBe("small");
    expect(hitRegion(regions, { x: 200, y: 200 }, plate)).toBe("big");
    expect(hitRegion(regions, { x: 50, y: 50 }, plate)).toBeNull();
  });
});
