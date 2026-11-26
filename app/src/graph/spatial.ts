import type { Rect } from "./camera";

const overlaps = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const contains = (r: Rect, x: number, y: number) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;

type Entry = { r: Rect; seq: number };

/** Uniform-grid index for culling and picking. A later insert sits on top of an earlier one. */
export class SpatialGrid {
  private entries = new Map<string, Entry>();
  private cells = new Map<string, string[]>();
  private seq = 0;

  constructor(private cell: number) {}

  insert(id: string, r: Rect): void {
    // Re-inserting moves the id to the top. Its old buckets go stale, but every
    // lookup re-tests against the current rect, so stale entries never match.
    this.entries.set(id, { r, seq: this.seq++ });
    const [i0, j0, i1, j1] = this.span(r);
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++) {
        const k = `${i},${j}`;
        const bucket = this.cells.get(k);
        if (bucket) bucket.push(id);
        else this.cells.set(k, [id]);
      }
  }

  clear(): void {
    this.entries.clear();
    this.cells.clear();
  }

  query(r: Rect): string[] {
    const [i0, j0, i1, j1] = this.span(r);
    // Zoomed far out, the query can span more cells than there are rects: scan the rects instead.
    if ((i1 - i0 + 1) * (j1 - j0 + 1) > this.entries.size)
      return [...this.entries].filter(([, e]) => overlaps(e.r, r)).map(([id]) => id);
    const out = new Set<string>();
    for (let i = i0; i <= i1; i++)
      for (let j = j0; j <= j1; j++)
        for (const id of this.cells.get(`${i},${j}`) ?? []) if (overlaps(this.entries.get(id)!.r, r)) out.add(id);
    return [...out];
  }

  hit(x: number, y: number): string | null {
    let top: string | null = null;
    let topSeq = -1;
    for (const id of this.cells.get(`${Math.floor(x / this.cell)},${Math.floor(y / this.cell)}`) ?? []) {
      const e = this.entries.get(id)!;
      if (e.seq > topSeq && contains(e.r, x, y)) [top, topSeq] = [id, e.seq];
    }
    return top;
  }

  private span(r: Rect): [number, number, number, number] {
    const c = this.cell;
    return [Math.floor(r.x / c), Math.floor(r.y / c), Math.floor((r.x + r.w) / c), Math.floor((r.y + r.h) / c)];
  }
}
