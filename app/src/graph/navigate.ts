// Selection movement over the taxonomy graph, and the canvas key handler the Tree and Radial
// views share (R12). The scene owns Enter, 0, +/- and the arrows while nothing is selected; it
// calls preventDefault on what it handles, and this handler leaves those events alone.
import { digitOf, isTextEntry } from "../keys";
import type { TaxGraph } from "./taxgraph";

export type Dir = "prev" | "next" | "parent" | "child";

const ops = (g: TaxGraph) => [...g.nodes.values()].filter((n) => n.kind === "op").map((n) => n.id);

/** The node's parent: the first parent branch for a technique. */
function parentOf(g: TaxGraph, id: string): string | null {
  const n = g.nodes.get(id);
  if (!n) return null;
  if (n.kind === "branch") return `op:${n.opId}`;
  if (n.kind === "tech") return n.parents.length ? `br:${n.parents[0]}` : null;
  if (n.kind === "ref") return `tech:${n.via.techId}`;
  return null;
}

/** ←/→ walk siblings in taxonomy order, ↑ the (first) parent, ↓ the first child; null past an end.
 * With nothing selected, any move but ↑ lands on the first operation. */
export function move(g: TaxGraph, sel: string | null, dir: Dir): string | null {
  if (sel === null) return dir === "parent" ? null : (ops(g)[0] ?? null);
  const n = g.nodes.get(sel);
  if (!n) return null;
  if (dir === "parent") return parentOf(g, sel);
  if (dir === "child") return g.children.get(sel)?.[0] ?? null;
  const up = parentOf(g, sel);
  const sibs = n.kind === "op" ? ops(g) : up ? (g.children.get(up) ?? []) : [sel];
  const i = sibs.indexOf(sel);
  return sibs[i + (dir === "next" ? 1 : -1)] ?? null;
}

const ARROWS: Record<string, Dir> = { ArrowLeft: "prev", ArrowRight: "next", ArrowUp: "parent", ArrowDown: "child" };

/** true = handled (the caller calls preventDefault). Text fields, modified keys and events the
 * scene already handled are left alone. */
export function canvasKeys(
  e: KeyboardEvent,
  h: { move(dir: Dir): void; activate(): void; clear(): void; digit?(n: number): void },
): boolean {
  if (e.defaultPrevented || e.isComposing || isTextEntry(e.target) || e.ctrlKey || e.metaKey || e.altKey) return false;
  const dir = ARROWS[e.key];
  if (dir) h.move(dir);
  else if (e.key === "Enter") h.activate();
  else if (e.key === "Escape") h.clear();
  else {
    const d = digitOf(e);
    if (d === null || !h.digit) return false;
    h.digit(d);
  }
  return true;
}
