// Dev-only harness (`?scene-demo` on the dev URL): 2,000 synthetic reference nodes on a grid, plus a
// few shapes, outlines and edges. main.ts loads it only when import.meta.env.DEV, so release builds
// never contain it. Thumbnails are canvas-drawn data: URLs (img-src allows data:), so it needs no library.
import { NODE } from "./constants";
import { mountCanvasOrFallback, type SceneNode } from "./frame";
import { createScene } from "./scene";

function swatches(n: number): string[] {
  const out: string[] = [];
  const c = document.createElement("canvas");
  c.width = 192;
  c.height = 256;
  const g = c.getContext("2d")!;
  for (let i = 0; i < n; i++) {
    g.fillStyle = `hsl(${(i * 37) % 360} 45% 55%)`;
    g.fillRect(0, 0, 192, 256);
    g.fillStyle = "#161616";
    g.font = "64px serif";
    g.fillText(String(i + 1), 48, 150);
    out.push(c.toDataURL("image/png"));
  }
  return out;
}

export async function runSceneDemo(root: HTMLElement): Promise<void> {
  root.replaceChildren();
  const bar = document.createElement("div");
  bar.className = "scene-demo-bar";
  const fps = document.createElement("span");
  fps.className = "mono";
  const theme = document.createElement("button");
  theme.textContent = "Switch theme";
  theme.addEventListener("click", () => {
    const d = document.documentElement;
    d.dataset.theme = d.dataset.theme === "dark" ? "light" : "dark";
  });
  bar.append(theme, fps);
  const host = document.createElement("div");
  host.className = "scene-demo-host";
  host.dataset.label = "Scene demo";
  root.append(bar, host);

  const urls = swatches(24);
  const nodes: SceneNode[] = [];
  const states = ["full", "partial", "region"] as const;
  for (let i = 0; i < 50; i++)
    for (let j = 0; j < 40; j++) {
      const k = i * 40 + j;
      nodes.push({
        id: `ref:${k}`, kind: "ref", x: i * 64, y: j * 64, size: NODE, url: urls[k % urls.length], aspect: k % 3 ? 3 / 4 : 4 / 3,
        dim: k % 97 === 0,
        outline: k % 11 === 0 ? { region: { x: 0.2, y: 0.2, w: 0.5, h: 0.4 }, color: "var(--seq)", state: states[k % 3] } : undefined,
      });
    }
  nodes.push({ id: "op:seq", kind: "op", x: -160, y: 0, size: NODE, color: "var(--seq)", label: "Lead the eye" });
  nodes.push({ id: "tech:demo", kind: "tech", x: -160, y: 160, size: 32, color: "var(--seq)", label: "Leading lines" });
  nodes.push({ id: "label:1", kind: "label", x: -160, y: -60, text: "Scene demo", font: "serif", color: "var(--ink)" });

  const scene = await mountCanvasOrFallback(host, () => createScene(host, { assetUrl: (p) => p }));
  if (!scene) return;
  (window as unknown as { __scene: unknown }).__scene = scene; // for the manual check's console
  scene.setNodes(nodes);
  scene.setEdges([{ from: "op:seq", to: "tech:demo", width: 1.5, color: "var(--seq)" }]);
  scene.setDraggable((id) => id.startsWith("tech:"));
  scene.on("select", (id, m) => console.info("select", id, m.shift));
  scene.onDrop((d, t) => console.info("drop", d, t));
  scene.fitAll();

  // Frame rate as the browser paints it (the Pixi ticker runs on the same frames).
  let n = 0;
  let t0 = performance.now();
  const count = (t: number) => {
    n++;
    if (t - t0 >= 1000) {
      fps.textContent = `${Math.round((n * 1000) / (t - t0))} fps`;
      (window as unknown as { __sceneFps: number }).__sceneFps = (n * 1000) / (t - t0);
      n = 0;
      t0 = t;
    }
    requestAnimationFrame(count);
  };
  requestAnimationFrame(count);
}
