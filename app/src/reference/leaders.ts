// Leaders: curves from each region number on the plate to its callout number.
// Drawn always, shown only on hover or pin (CSS `.has-hover`). Port of prototype drawLeaders/hot.

/** Redraws every leader. `colors[i]` is the operation colour for tag i. */
export function drawLeaders(root: HTMLElement, colors: string[], hotIndex: number | null): void {
  const svg = root.querySelector<SVGSVGElement>("#leaders");
  const work = root.querySelector(".work");
  const pane = root.querySelector("#pane-callouts");
  if (!svg || !work || !pane || getComputedStyle(svg).display === "none") return;
  const w = work.getBoundingClientRect();
  const p = pane.getBoundingClientRect();
  let out = "";
  colors.forEach((color, i) => {
    const box = root.querySelector(`.box[data-i="${i}"] .num`);
    const call = root.querySelector(`.call[data-i="${i}"] .num`);
    if (!box || !call) return;
    const a = box.getBoundingClientRect();
    const b = call.getBoundingClientRect();
    if (b.bottom < p.top || b.top > p.bottom) return;
    const x1 = a.right - w.left, y1 = a.top + a.height / 2 - w.top;
    const x2 = b.left - w.left - 4, y2 = b.top + b.height / 2 - w.top;
    const dx = (x2 - x1) * 0.5;
    out += `<path data-i="${i}" style="--hot:${color}" d="M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}"/>`;
  });
  svg.innerHTML = out;
  if (hotIndex != null) highlight(root, hotIndex, colors[hotIndex]);
}

/** Marks tag i (box, callout, leader) as hot; `null` clears. */
export function highlight(root: HTMLElement, i: number | null, color?: string): void {
  const lab = root.querySelector<HTMLElement>("#lab");
  const svg = root.querySelector("#leaders");
  root.querySelectorAll(".is-hot").forEach((el) => el.classList.remove("is-hot"));
  if (i == null || !color) {
    lab?.classList.remove("has-hover");
    svg?.classList.remove("has-hover");
    return;
  }
  lab?.classList.add("has-hover");
  svg?.classList.add("has-hover");
  lab?.style.setProperty("--hot", color);
  root.querySelector(`.box[data-i="${i}"]`)?.classList.add("is-hot");
  root.querySelector(`.call[data-i="${i}"]`)?.classList.add("is-hot");
  const path = svg?.querySelector<SVGPathElement>(`path[data-i="${i}"]`);
  if (path) {
    // jsdom has no getTotalLength
    if (typeof path.getTotalLength === "function") path.style.setProperty("--len", String(Math.ceil(path.getTotalLength())));
    path.classList.add("is-hot");
  }
}
