// A windowed grid: only the rows in view (plus overscan) exist in the DOM, so a 10,000-item
// library stays light. Tiles flow in a CSS grid; the only positions are custom properties on the
// grid's own wrappers, set through the CSSOM, so no tile ever carries a style attribute.
// Plan 4 reuses this for the Library grid.
export function mountWindowedGrid<T>(
  root: HTMLElement,
  opts: { items: T[]; tile: number; gap: number; render(item: T, i: number): HTMLElement; overscanRows?: number },
): { update(items: T[]): void; scrollTo(i: number): void; destroy(): void } {
  const over = opts.overscanRows ?? 2;
  const step = opts.tile + opts.gap;
  let items = opts.items;
  let top = 0;
  let shown = new Map<number, HTMLElement>();
  let range: [number, number] = [0, 0];

  const sizer = document.createElement("div");
  sizer.className = "wg-sizer";
  const win = document.createElement("div");
  win.className = "wg-window";
  sizer.append(win);
  root.append(sizer);
  win.style.setProperty("--wg-tile", `${opts.tile}px`);
  win.style.setProperty("--wg-gap", `${opts.gap}px`);

  const pad = (side: "Left" | "Right") => parseFloat(getComputedStyle(root)[`padding${side}`]) || 0;
  // ponytail: before layout (or in jsdom) the box reads 0; the window's size stands in for it
  const cols = () => Math.max(1, Math.floor(((root.clientWidth || innerWidth) - pad("Left") - pad("Right") + opts.gap) / step));

  function paint(force = false) {
    const c = cols();
    const rows = Math.ceil(items.length / c);
    const h = root.clientHeight || innerHeight;
    const first = Math.max(0, Math.floor(top / step) - over);
    const last = Math.min(rows, Math.ceil((top + h) / step) + over);
    const from = Math.min(items.length, first * c);
    const to = Math.min(items.length, last * c);
    sizer.style.setProperty("--wg-h", `${Math.max(0, rows * step - opts.gap)}px`);
    win.style.setProperty("--wg-top", `${first * step}px`);
    win.style.setProperty("--wg-cols", String(c));
    if (!force && from === range[0] && to === range[1]) return;
    // The index whose tile has focus: if that tile is replaced, its replacement takes focus (F3).
    const had = [...shown].find(([, el]) => el.contains(document.activeElement))?.[0];
    const next = new Map<number, HTMLElement>();
    for (let i = from; i < to; i++) {
      const el = (!force && shown.get(i)) || opts.render(items[i], i);
      el.dataset.i = String(i);
      next.set(i, el);
    }
    for (const [i, el] of shown) if (next.get(i) !== el) el.remove();
    // Insert in order without moving a node that is already in place (moving one would blur it).
    [...next.values()].forEach((el, k) => {
      if (win.children[k] !== el) win.insertBefore(el, win.children[k] ?? null);
    });
    shown = next;
    range = [from, to];
    if (had !== undefined && !win.contains(document.activeElement)) next.get(had)?.focus();
  }

  const onScroll = () => {
    top = root.scrollTop;
    paint();
  };
  root.addEventListener("scroll", onScroll, { passive: true });
  const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => paint(true)) : null;
  resize?.observe(root);
  paint(true);

  return {
    update(next) {
      items = next;
      paint(true);
    },
    scrollTo(i) {
      top = Math.floor(i / cols()) * step;
      root.scrollTop = top;
      paint();
    },
    destroy() {
      root.removeEventListener("scroll", onScroll);
      resize?.disconnect();
      sizer.remove();
    },
  };
}
