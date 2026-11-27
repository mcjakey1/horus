// Plan 6 Task 5: the glyph lookup.
import { describe, expect, it } from "vitest";
import seed from "../../src-tauri/resources/taxonomy.json";
import { DOMAIN_ICONS } from "../views/inspector";
import { glyphFor } from "./glyphs";
import set from "./glyphs.json";

describe("glyphFor", () => {
  it("glyph_fallback: an empty or unknown icon draws the plain square", () => {
    const square = glyphFor("a plain square");
    expect(square).toContain("<svg");
    expect(glyphFor("")).toBe(square);
    expect(glyphFor("no such icon")).toBe(square);
  });

  it("every icon in the seed taxonomy and DOMAIN_ICONS has an entry", () => {
    const icons = [...seed.operations, ...seed.domains, ...seed.techniques].map((x) => x.icon).filter(Boolean);
    const missing = [...icons, ...DOMAIN_ICONS].filter((i) => !(i in set));
    expect(missing).toEqual([]);
  });

  it("each is a single 24 px line SVG in currentColor", () => {
    for (const svg of Object.values(set)) {
      expect(svg).toMatch(/^<svg [^>]*viewBox="0 0 24 24"/);
      expect(svg).toContain('stroke="currentColor"');
    }
  });
});
