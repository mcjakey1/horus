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
