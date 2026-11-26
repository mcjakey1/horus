// The one home for the graph views' tuning constants (SPEC §4).
// MIN_SCORE and BRANCH_W are scoring constants and live in Rust (correlate.rs).
export const K_EDGES = 8; // strongest neighbours kept per reference in the Galaxy
export const DOT_PX = 10; // a reference smaller than this on screen draws as a dot
export const TEX_CAP = 600; // most thumbnail textures alive at once
export const MIN_SCALE = 0.05;
export const MAX_SCALE = 4;
export const EDGE_W0 = 0.75; // edge px = EDGE_W0 + EDGE_W1 * score
export const EDGE_W1 = 2.25;
export const BAND_GAP = 160; // world units between Tree bands and Radial rings
export const NODE = 48; // reference node size in world units
export const MAX_OPS = 9; // number keys 1–9 reach each operation
// Layout spacing (final review I1, I2, I5): the Tree's band step and reference grid, and the
// label box both layouts make room for.
export const GAP = NODE + 16; // least x spacing between neighbours in a Tree band
export const ROW = NODE + 8; // step between references in the Tree's reference block or column
export const REF_ARC = NODE + 8; // least spacing between references on the Radial's ring 3
export const LABEL_CHARS = 24; // a canvas label longer than this is cut, plus "…"
export const LABEL_W = 184; // world width kept for a label: 25 characters × 7, plus padding
export const LABEL_ROW = 18; // the Tree staggers branch and technique labels over 3 rows this far apart
export const LABEL_FONT = 13; // label size in world units
export const LABEL_MIN_PX = 8; // a label smaller than this on screen is hidden
