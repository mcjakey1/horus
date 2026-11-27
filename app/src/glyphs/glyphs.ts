// Plan 6 Task 5: the in-app glyph set (Plan 3 cross-plan impact item 6). One single-weight 24 px
// line SVG in currentColor per `icon` description string (every icon in the bundled taxonomy,
// Plan 3's DOMAIN_ICONS and the "a plain square" default). The art comes from the design pass
// and needs the user's approval; until then every entry is a placeholder (`data-placeholder`),
// which `release-check --final` refuses.
import GLYPHS from "./glyphs.json";

const FALLBACK = "a plain square";
const set: Record<string, string> = GLYPHS;

/** The SVG for an icon description; an unknown or empty one (a custom technique) draws the plain square. */
export function glyphFor(icon: string): string {
  // Own keys only: a hand-edited icon such as "toString" never reaches Object.prototype (AGY).
  return Object.prototype.hasOwnProperty.call(set, icon) ? set[icon] : set[FALLBACK];
}
