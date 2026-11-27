// Operation inks in styles.css (DESIGN.md "Extra operation inks", ruling B7): contrast and
// distinctness, measured from the stylesheet itself.
import { describe, expect, it } from "vitest";
// @ts-expect-error type error without @types/node package (as vite.config.ts)
import { readFileSync } from "node:fs";
import { EXTRA_INKS } from "./ops";

const css: string = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

function block(selector: RegExp): Record<string, string> {
  const m = selector.exec(css);
  if (!m) throw new Error(`no block for ${selector}`);
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\b/g)].map((x) => [x[1], x[2].toUpperCase()]));
}
const THEMES = {
  light: block(/^:root \{([\s\S]*?)\n\}/m), // the bare :root, never the [data-theme="dark"] block
  dark: block(/^:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/m),
};
const SEED = ["diff", "group", "seq", "infer"];
const EXTRA = EXTRA_INKS.map((k) => `x-${k}`);

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = (hex: string) => {
  const [r, g, b] = rgb(hex).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
/** WCAG 2 contrast ratio. */
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};
/** sRGB to CIELAB, D65. */
function lab(hex: string): [number, number, number] {
  const [r, g, b] = rgb(hex).map(lin);
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
/** CIEDE2000 (Sharma, Wu and Dalal 2005). */
function dE2000([L1, a1, b1]: number[], [L2, a2, b2]: number[]): number {
  const rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2);
  const Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2;
  const Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2);
  const hue = (b: number, a: number) => (b === 0 && a === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const hp1 = hue(b1, ap1), hp2 = hue(b2, ap2);
  const dL = L2 - L1, dC = Cp2 - Cp1;
  let dh = 0;
  if (Cp1 * Cp2 !== 0) dh = Math.abs(hp2 - hp1) <= 180 ? hp2 - hp1 : hp2 - hp1 > 180 ? hp2 - hp1 - 360 : hp2 - hp1 + 360;
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2;
  let hb = hp1 + hp2;
  if (Cp1 * Cp2 !== 0) hb = Math.abs(hp1 - hp2) <= 180 ? hb / 2 : hb < 360 ? (hb + 360) / 2 : (hb - 360) / 2;
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTheta = 30 * Math.exp(-(((hb - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2);
  const SC = 1 + 0.045 * Cpb, SH = 1 + 0.015 * Cpb * T;
  const RT = -Math.sin(2 * dTheta * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}

describe("inks_contrast_and_distinct", () => {
  it("the CIEDE2000 helper passes Sharma's test pairs", () => {
    expect(dE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 4);
    expect(dE2000([50, 2.5, 0], [73, 25, -18])).toBeCloseTo(27.1492, 4);
    expect(dE2000([60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387])).toBeCloseTo(1.2644, 4);
  });

  for (const [theme, v] of Object.entries(THEMES)) {
    it(`${theme}: every ink is defined, legible and distinct`, () => {
      for (const k of [...SEED, ...EXTRA]) for (const s of ["", "-text", "-on"]) expect(v[k + s], `${theme} --${k}${s}`).toMatch(/^#[0-9A-F]{6}$/);
      for (const k of [...SEED, ...EXTRA]) expect(contrast(v[`${k}-on`], v[k]), `${theme} ${k}-on`).toBeGreaterThanOrEqual(4.5);
      for (const k of [...SEED, ...EXTRA]) expect(contrast(v[`${k}-text`], v.panel), `${theme} ${k}-text`).toBeGreaterThanOrEqual(4.5);
      const bases = [...SEED, ...EXTRA];
      for (let i = 0; i < bases.length; i++)
        for (let j = i + 1; j < bases.length; j++)
          expect(dE2000(lab(v[bases[i]]), lab(v[bases[j]])), `${theme} ${bases[i]} / ${bases[j]}`).toBeGreaterThanOrEqual(15);
    });
  }

  it("light Group Green clears AA for its numeral (D17, closing ruling B7)", () => {
    // D17: the base moved #1E8E5A -> #1E915C (ΔE2000 1.05), so #161616 on it is 4.53:1 (was 4.37).
    expect(THEMES.light.group).toBe("#1E915C");
    expect(SEED.map((k) => THEMES.light[`${k}-on`])).toEqual(["#161616", "#161616", "#FFFFFF", "#FFFFFF"]);
    expect(SEED.map((k) => THEMES.dark[`${k}-on`])).toEqual(["#161616", "#161616", "#161616", "#161616"]);
    expect(contrast(THEMES.light["group-on"], THEMES.light.group)).toBeGreaterThanOrEqual(4.5);
  });
});
