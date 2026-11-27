// The PixiJS half of the scene: the only module that loads pixi.js, and only inside createScene
// (a dynamic import, so Pixi stays out of unit tests and the start-up bundle, R6). It draws what
// frame.ts plans; all decisions it makes are pure and live there.
import type * as PixiNS from "pixi.js";
import type { Api } from "../api";
import { isTextEntry } from "../keys";
import { tileBox } from "../reference/tile";
import { fit, pan, reveal, zoomAt, type Camera, type Rect } from "./camera";
import { LABEL_FONT, LABEL_ROW_PX, TEX_CAP } from "./constants";
import {
  buildGrids,
  classifyDrag,
  EdgeGate,
  labelsShown,
  LABEL_PX,
  type LabelBox,
  sameLook,
  nodeRect,
  planFrame,
  WebGLUnavailable,
  wireContextLoss,
  type FramePlan,
  type Mods,
  type Scene,
  type SceneEdge,
  type SceneNode,
} from "./frame";
import type { SpatialGrid } from "./spatial";
import { TexCache } from "./texcache";

type Pixi = typeof PixiNS;

// ---------- colours (R8) ----------

const colorCache = new Map<string, number>();

function parseHex(v: string): number | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return parseInt(h, 16);
}

/** "var(--x)" (read from the current theme) or "#rrggbb" → 0xRRGGBB. Unknown values are mid grey. */
export function resolveColor(css: string): number {
  const hit = colorCache.get(css);
  if (hit !== undefined) return hit;
  const v = /^var\((--[\w-]+)\)$/.exec(css.trim());
  const raw = v ? getComputedStyle(document.documentElement).getPropertyValue(v[1]) : css;
  const n = parseHex(raw) ?? 0x777776;
  colorCache.set(css, n);
  return n;
}

/** Theme changed: colours must be read again. */
export function clearColorCache(): void {
  colorCache.clear();
}

// ---------- drawing helpers ----------

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** The Line Says the State: solid full, dashed partial, dotted region. Lengths in world units. */
function strokeRect(g: PixiNS.Graphics, r: { left: number; top: number; width: number; height: number },
  state: "full" | "partial" | "region", width: number, color: number): void {
  if (state === "full") {
    g.rect(r.left, r.top, r.width, r.height).stroke({ width, color });
    return;
  }
  const [dash, gap] = state === "partial" ? [width * 4, width * 3] : [width, width * 2];
  const pts: [number, number][] = [
    [r.left, r.top], [r.left + r.width, r.top], [r.left + r.width, r.top + r.height], [r.left, r.top + r.height], [r.left, r.top],
  ];
  for (let i = 0; i < 4; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[i + 1];
    const len = Math.hypot(x1 - x0, y1 - y0);
    for (let s = 0; s < len; s += dash + gap) {
      const e = Math.min(len, s + dash);
      g.moveTo(x0 + ((x1 - x0) * s) / len, y0 + ((y1 - y0) * s) / len);
      g.lineTo(x0 + ((x1 - x0) * e) / len, y0 + ((y1 - y0) * e) / len);
    }
  }
  g.stroke({ width, color });
}

type Obj = {
  root: PixiNS.Container;
  dot?: PixiNS.Graphics;
  body?: PixiNS.Container; // the tile or shape drawn in "thumb" LOD
  sprite?: PixiNS.Sprite;
  outline?: PixiNS.Graphics;
  label?: PixiNS.Text; // a label node's text, or a taxonomy node's name (hidden when tiny)
};

// ---------- the scene ----------

/** Creates the WebGL scene in `host`. Rejects with WebGLUnavailable only when WebGL is missing or fails. */
export async function createScene(host: HTMLElement, api: Pick<Api, "assetUrl">): Promise<Scene> {
  const PIXI: Pixi = await import("pixi.js");
  await import("pixi.js/unsafe-eval"); // B4: the CSP has no unsafe-eval, so Pixi needs its own shader sync
  if (!PIXI.isWebGLSupported()) throw new WebGLUnavailable();
  const app = new PIXI.Application();
  try {
    // An array preference tries only WebGL: never a WebGPU or canvas fallback (C14).
    await app.init({
      preference: ["webgl"],
      resizeTo: host,
      antialias: true,
      backgroundAlpha: 0,
      autoDensity: true,
      resolution: globalThis.devicePixelRatio || 1,
    });
  } catch (e) {
    if (/no available renderer|webgl/i.test(String((e as Error)?.message ?? e))) throw new WebGLUnavailable();
    throw e;
  }
  return buildScene(PIXI, app, host, api);
}

function buildScene(PIXI: Pixi, app: PixiNS.Application, host: HTMLElement, api: Pick<Api, "assetUrl">): Scene {
  const canvas = app.canvas;
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.setAttribute("aria-label", host.dataset.label || "Graph view");
  canvas.classList.add("graph-canvas");
  host.append(canvas);

  const world = new PIXI.Container();
  const edgeLayer = new PIXI.Graphics();
  const nodeLayer = new PIXI.Container();
  const marks = new PIXI.Graphics(); // selection, hover and the drag ghost, above the nodes
  world.addChild(edgeLayer, nodeLayer, marks);
  app.stage.addChild(world);

  let nodes = new Map<string, SceneNode>();
  let order = new Map<string, number>();
  let grids: { all: SpatialGrid; pick: SpatialGrid } = buildGrids(nodes);
  let edges: SceneEdge[] = [];
  const objs = new Map<string, Obj>();
  let shown = new Set<string>();
  let plan: FramePlan = { visible: [], lod: new Map() };
  let cam: Camera = { x: 0, y: 0, scale: 1 };
  let tween: { from: Camera; to: Camera; t0: number } | null = null;
  let selected: string | null = null;
  let hovered: string | null = null;
  let ghost: { id: string; x: number; y: number } | null = null;
  let draggable: (id: string) => boolean = () => false;
  let dirty = true;
  let nodesVersion = 0; // bumped by setNodes: edge endpoints may have moved
  let themeVersion = 0; // bumped on a theme change or a restored context
  const edgeGate = new EdgeGate();
  const handlers: Record<"hover" | "select" | "activate", ((id: string | null, m: Mods) => void)[]> = {
    hover: [], select: [], activate: [],
  };
  const drops: ((dragged: string, target: string | null) => void)[] = [];
  const overs: ((dragged: string, target: string | null) => void)[] = [];
  let over: string | null = null; // the node under the dragged one
  let hint: { id: string; color: string } | "blocked" | null = null;
  const setHint = (h: typeof hint) => {
    hint = h;
    canvas.style.cursor = h === "blocked" ? "not-allowed" : "";
    dirty = true;
  };
  const dragOver = (dragged: string, target: string | null) => {
    if (target === over) return;
    over = target;
    overs.forEach((f) => f(dragged, target));
  };
  const endDrag = (dragged: string) => {
    dragOver(dragged, null);
    setHint(null);
  };
  const emit = (ev: "hover" | "select" | "activate", id: string | null, m: Mods) => handlers[ev].forEach((f) => f(id, m));

  const tex = new TexCache<PixiNS.Texture>(
    TEX_CAP,
    (url) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        // http://asset.localhost is another origin: without CORS mode WebGL refuses the pixels
        // ("contains cross-origin data"). Tauri's asset protocol answers with the window's origin.
        img.crossOrigin = "anonymous";
        img.decoding = "async";
        img.onload = () => resolve(PIXI.Texture.from(img, true));
        img.onerror = () => reject(new Error(`thumbnail failed: ${url}`));
        img.src = api.assetUrl(url); // img-src governs this, not connect-src (audit row 3)
      }),
    (t) => t.destroy(true),
  );

  if (import.meta.env.DEV) (globalThis as unknown as { __horusTex: unknown }).__horusTex = tex; // dev checks only
  const view = () => ({ w: host.clientWidth || canvas.clientWidth || 1, h: host.clientHeight || canvas.clientHeight || 1 });
  const toWorld = (sx: number, sy: number) => ({ x: cam.x + sx / cam.scale, y: cam.y + sy / cam.scale });

  function dropObj(id: string) {
    const o = objs.get(id);
    if (!o) return;
    o.root.destroy({ children: true }); // sprites only borrow cache textures: never destroy those here
    objs.delete(id);
  }

  function clearObjs() {
    for (const o of objs.values()) {
      if (o.sprite) o.sprite.texture = PIXI.Texture.EMPTY;
      o.root.destroy({ children: true });
    }
    objs.clear();
    shown = new Set();
  }

  /** Builds a node's display objects once; colours are read from the current theme. */
  function make(n: SceneNode): Obj {
    const root = new PIXI.Container();
    root.position.set(n.x, n.y);
    const o: Obj = { root };
    if (n.kind === "label") {
      o.label = new PIXI.Text({
        text: n.text,
        style: { fontFamily: n.font === "serif" ? "Source Serif 4, Georgia, serif" : "Red Hat Mono, monospace", fontSize: 13, fill: resolveColor(n.color) },
      });
      o.label.anchor.set(0.5, 0);
      root.addChild(o.label);
    } else {
      const dot = new PIXI.Graphics().circle(0, 0, 1.5).fill(resolveColor("var(--ink-2)")); // C3: neutral dots
      o.dot = dot;
      const body = new PIXI.Container();
      const half = n.size / 2;
      if (n.kind === "ref") {
        if (n.faint) root.alpha = 0.5;
        body.addChild(new PIXI.Graphics().rect(-half, -half, n.size, n.size).fill(resolveColor("var(--card)")));
        const { plate, outline } = tileBox(n.aspect || 3 / 4, n.size, n.outline?.region);
        const sprite = new PIXI.Sprite(PIXI.Texture.EMPTY);
        sprite.position.set(plate.left - half, plate.top - half);
        sprite.width = plate.width;
        sprite.height = plate.height;
        o.sprite = sprite;
        body.addChild(sprite);
        if (n.outline) {
          const box = outline ?? plate;
          o.outline = new PIXI.Graphics();
          strokeRect(o.outline, { left: box.left - half, top: box.top - half, width: box.width, height: box.height },
            n.outline.state, Math.max(1, n.size / 32), resolveColor(n.outline.color));
          body.addChild(o.outline);
        }
      } else {
        const ink = resolveColor(n.color);
        // Taxonomy nodes are markers, so circles; squares stay for data, the references (DESIGN.md Shapes; design judgement #13).
        const g = new PIXI.Graphics().circle(0, 0, half);
        if (n.kind === "op") g.fill(ink);
        else g.fill(resolveColor("var(--panel)")).stroke({ width: 1, color: ink });
        body.addChild(g);
        const t = new PIXI.Text({ text: n.label, style: { fontFamily: "Source Serif 4, Georgia, serif", fontSize: LABEL_FONT, fill: resolveColor("var(--ink)"),
          // A shell-coloured halo: hierarchy lines pass behind a name, never through it (F3).
          stroke: { color: resolveColor("var(--shell)"), width: 4, join: "round" }, padding: 4 } }); // padding: the halo never crops a last glyph
        t.anchor.set(0.5, 0);
        // Placed per frame in update(): the offset is screen px (design review F5).
        body.addChild(t);
        o.label = t;
      }
      o.body = body;
      root.addChild(dot, body);
    }
    return o;
  }

  function drawEdges() {
    edgeLayer.clear();
    for (const e of edges) {
      const a = nodes.get(e.from);
      const b = nodes.get(e.to);
      if (!a || !b) continue;
      edgeLayer.moveTo(a.x, a.y);
      if (e.curve) {
        const mx = (a.x + b.x) / 2;
        const my = (a.y + b.y) / 2;
        edgeLayer.quadraticCurveTo(mx - (b.y - a.y) * 0.2, my + (b.x - a.x) * 0.2, b.x, b.y);
      } else edgeLayer.lineTo(b.x, b.y);
      edgeLayer.stroke({ width: e.width / cam.scale, color: resolveColor(e.color) }); // px on screen
    }
  }

  function drawMarks() {
    marks.clear();
    const ring = (id: string | null, color: string, w: number) => {
      const n = id ? nodes.get(id) : undefined;
      if (!n || n.kind === "label") return;
      const r = nodeRect(n);
      const pad = 3 / cam.scale;
      if (n.kind === "ref") marks.rect(r.x - pad, r.y - pad, r.w + 2 * pad, r.h + 2 * pad);
      else marks.circle(n.x, n.y, r.w / 2 + pad); // a ring round a marker
      marks.stroke({ width: w / cam.scale, color: resolveColor(color) });
    };
    if (hovered !== selected) ring(hovered, "var(--line-2)", 1);
    ring(selected, "var(--ink)", 2);
    if (hint && hint !== "blocked") ring(hint.id, hint.color, 2);
    if (ghost) {
      const n = nodes.get(ghost.id);
      if (n && n.kind !== "label") {
        if (n.kind === "ref") marks.rect(ghost.x - n.size / 2, ghost.y - n.size / 2, n.size, n.size);
        else marks.circle(ghost.x, ghost.y, n.size / 2);
        marks.fill({ color: resolveColor("var(--ink-2)"), alpha: 0.35 });
      }
    }
  }

  /** Plans the frame and syncs display objects to it. Returns true while textures are loading. */
  function update(): boolean {
    world.position.set(-cam.x * cam.scale, -cam.y * cam.scale);
    world.scale.set(cam.scale);
    plan = planFrame(grids.all, nodes, cam, view());
    const next = new Set(plan.visible);
    for (const id of shown) {
      if (next.has(id)) continue;
      const o = objs.get(id);
      if (!o) continue;
      o.root.visible = false;
      if (o.sprite) o.sprite.texture = PIXI.Texture.EMPTY; // hidden sprites never hold a texture
    }
    let loading = false;
    const wanted = new Set<string>(); // URLs drawn as thumbnails this frame
    const names: LabelBox[] = []; // the taxonomy names on screen this frame (F5)
    const named = new Map<string, PixiNS.Text>();
    for (const id of plan.visible) {
      const n = nodes.get(id)!;
      let o = objs.get(id);
      if (!o) {
        o = make(n);
        objs.set(id, o);
        nodeLayer.addChild(o.root);
      }
      o.root.visible = true;
      if (!o.body || !o.dot) continue; // a label
      const thumb = plan.lod.get(id) === "thumb";
      o.dot.visible = !thumb;
      o.dot.scale.set(1 / cam.scale); // a 3 px dot at every zoom
      o.body.visible = thumb;
      if (o.label && thumb && n.kind !== "ref" && n.kind !== "label") {
        // A taxonomy name, LABEL_PX tall on screen at every zoom; which ones show is decided by
        // overlap once every name on screen is known (design review F5).
        // The gap and the Tree's row stagger are screen px too, so rows never collapse at fit.
        const dy = 4 + (n.labelRow ?? 0) * LABEL_ROW_PX;
        o.label.scale.set(LABEL_PX / (LABEL_FONT * cam.scale));
        o.label.position.set(0, n.size / 2 + dy / cam.scale);
        // The selected and hovered names always show (rank -1).
        const rank = id === selected || id === hovered ? -1 : n.kind === "op" ? 0 : n.kind === "branch" ? 1 : 2;
        names.push({ id, x: (n.x - cam.x) * cam.scale, y: (n.y + n.size / 2 - cam.y) * cam.scale + dy - 2, w: o.label.width * cam.scale + 4, h: LABEL_PX * 1.25 + 4, rank }); // 2 px margin all round: names that only touch hide by rank too (F3)
        named.set(id, o.label);
      }
      if (n.kind === "ref" && o.sprite) {
        if (!thumb) {
          o.sprite.texture = PIXI.Texture.EMPTY;
          continue;
        }
        wanted.add(n.url);
        const t = tex.get(n.url);
        if (t === "loading") loading = true;
        else if (t !== "failed" && o.sprite.texture !== t) o.sprite.texture = t;
        else if (t === "failed") {
          o.body.visible = false; // Review Focus 5: a missing thumbnail falls back to a dot
          o.dot.visible = true;
        }
      }
    }
    const keep = labelsShown(names);
    for (const [id, label] of named) label.visible = keep.has(id);
    // By URL, not by node: one reference can be drawn under several techniques (Tree), and a node
    // can drop from thumb to dot while still on screen. Only loads a thumbnail wants stay in flight.
    for (const url of tex.loading()) if (!wanted.has(url)) tex.cancel(url);
    shown = next;
    if (edgeGate.needs(edges, nodesVersion, cam.scale, themeVersion)) drawEdges(); // I2: never on a pan alone
    drawMarks();
    return loading;
  }

  // Why eviction never hits an on-screen texture: planFrame gives at most TEX_CAP thumbnails,
  // every update touches each of them, and loads stay in flight only for them (cancel above). So
  // the least recently used live texture is always one no longer drawn as a thumbnail.

  const tick = () => {
    if (tween) {
      const t = Math.min(1, (performance.now() - tween.t0) / 250);
      const k = 1 - (1 - t) ** 3;
      const { from, to } = tween;
      cam = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k, scale: from.scale + (to.scale - from.scale) * k };
      if (t === 1) tween = null;
      dirty = true;
    }
    if (dirty) dirty = update();
  };
  app.ticker.add(tick);
  const perf = import.meta.env.DEV || import.meta.env.VITE_PERF ? perfOverlay(app, host, () => tex.size()) : null;

  // The pad of the last fitAll while the camera still sits at it; any other move clears it. A resize
  // (a narrower window, a hidden view shown) then fits again (design judgement P1-1: fit at 760).
  let fitPad: number | null = null;
  function setCamera(c: Camera, animate = false) {
    fitPad = null;
    if (animate && !reducedMotion()) tween = { from: cam, to: c, t0: performance.now() };
    else {
      tween = null;
      cam = c;
    }
    dirty = true;
  }

  function fitAll(padPx = 0, animate = true) {
    if (!nodes.size) return; // empty bounds are Infinity: keep the camera
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const n of nodes.values()) {
      const r = nodeRect(n);
      x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y);
      x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h);
    }
    const b: Rect = { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
    setCamera(fit(b, view(), 40 + padPx), animate); // 40: fit's own padding
    fitPad = padPx;
  }

  /** Topmost pickable node under a world point, skipping `except` (the node being dragged). */
  function pickAt(x: number, y: number, except?: string): string | null {
    if (!except) return grids.pick.hit(x, y);
    let best: string | null = null;
    for (const id of grids.pick.query({ x: x - 0.01, y: y - 0.01, w: 0.02, h: 0.02 })) {
      if (id !== except && (best === null || order.get(id)! > order.get(best)!)) best = id;
    }
    return best;
  }

  // ---------- input ----------

  // Every canvas listener goes with destroy: destroying the renderer fires webglcontextlost.
  const life = new AbortController();
  const signal = life.signal;

  const local = (e: { clientX: number; clientY: number }) => {
    const r = canvas.getBoundingClientRect();
    return { sx: e.clientX - r.left, sy: e.clientY - r.top };
  };
  let press: { sx: number; sy: number; hit: string | null; mode: "drag" | "pan"; moved: boolean; cam: Camera } | null = null;

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    canvas.focus();
    const { sx, sy } = local(e);
    const w = toWorld(sx, sy);
    const hit = pickAt(w.x, w.y);
    press = { sx, sy, hit, mode: classifyDrag(hit, draggable), moved: false, cam };
    canvas.setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: PointerEvent) => {
    const { sx, sy } = local(e);
    if (press) {
      if (!press.moved && Math.hypot(sx - press.sx, sy - press.sy) < 4) return;
      press.moved = true;
      if (press.mode === "pan") setCamera(pan(press.cam, sx - press.sx, sy - press.sy));
      else {
        ghost = { id: press.hit!, ...toWorld(sx, sy) };
        dirty = true;
        dragOver(press.hit!, pickAt(ghost.x, ghost.y, press.hit!));
      }
      return;
    }
    const w = toWorld(sx, sy);
    const h = pickAt(w.x, w.y);
    if (h !== hovered) {
      hovered = h;
      dirty = true;
      emit("hover", h, { shift: e.shiftKey });
    }
  };
  const onUp = (e: PointerEvent) => {
    const p = press;
    press = null;
    if (!p) return;
    if (!p.moved) {
      selected = p.hit;
      dirty = true;
      emit("select", p.hit, { shift: e.shiftKey });
    } else if (p.mode === "drag" && p.hit) {
      const { sx, sy } = local(e);
      const w = toWorld(sx, sy);
      ghost = null;
      dirty = true;
      const target = pickAt(w.x, w.y, p.hit);
      endDrag(p.hit);
      drops.forEach((f) => f(p.hit!, target));
    }
  };
  const onLeave = () => {
    if (hovered !== null && !press) {
      hovered = null;
      dirty = true;
      emit("hover", null, { shift: false });
    }
  };
  const onDbl = (e: MouseEvent) => {
    const { sx, sy } = local(e);
    const w = toWorld(sx, sy);
    const h = pickAt(w.x, w.y);
    if (h) emit("activate", h, { shift: e.shiftKey });
  };
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const { sx, sy } = local(e);
    setCamera(zoomAt(cam, sx, sy, Math.exp(-e.deltaY * 0.0015)));
  };
  const onKey = (e: KeyboardEvent) => {
    if (isTextEntry(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
    const { w, h } = view();
    const base = tween?.to ?? cam; // fast presses compound: each starts where the last one is going (M1)
    const zero = e.key === "0" || (!e.shiftKey && e.code === "Digit0"); // AZERTY's unshifted "à"
    if (e.key === "+" || e.key === "=") setCamera(zoomAt(base, w / 2, h / 2, 1.25), true);
    else if (e.key === "-") setCamera(zoomAt(base, w / 2, h / 2, 0.8), true);
    else if (zero) fitAll();
    else if (e.key === "Enter" && selected) emit("activate", selected, { shift: e.shiftKey });
    else if (e.key.startsWith("Arrow") && selected === null) {
      // With a selection, the view moves it (navigate.ts); without one, the arrows pan.
      const d = 60;
      const [dx, dy] = { ArrowLeft: [d, 0], ArrowRight: [-d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] }[e.key] ?? [0, 0];
      setCamera(pan(base, dx, dy), true);
    } else return;
    e.preventDefault();
  };

  canvas.addEventListener("pointerdown", onDown, { signal });
  canvas.addEventListener("pointermove", onMove, { signal });
  canvas.addEventListener("pointerup", onUp, { signal });
  canvas.addEventListener("pointercancel", () => {
    if (press?.mode === "drag" && press.hit) endDrag(press.hit);
    press = null; ghost = null; dirty = true;
  }, { signal });
  canvas.addEventListener("pointerleave", onLeave, { signal });
  canvas.addEventListener("dblclick", onDbl, { signal });
  canvas.addEventListener("wheel", onWheel, { passive: false, signal });
  canvas.addEventListener("keydown", onKey, { signal });

  // ---------- theme, resize, lost context ----------

  const themeObserver = new MutationObserver(() => {
    clearColorCache();
    clearObjs(); // rebuilt with the new theme's colours on the next frame
    themeVersion++;
    dirty = true;
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  // A host shown or resized by CSS (no window resize): resizeTo alone would miss it.
  const resize = typeof ResizeObserver === "function"
    ? new ResizeObserver(() => {
      app.resize();
      if (fitPad !== null && host.clientWidth && host.clientHeight) fitAll(fitPad, false); // hidden (0 × 0) keeps the pad for its show
      dirty = true;
    })
    : null;
  resize?.observe(host);
  // I1: a lost context shows the fallback sentence over this view only; a restore rebuilds.
  const unwireContext = wireContextLoss(canvas, host, {
    lost: () => app.ticker.stop(),
    restored: () => {
      // The GPU lost every texture: drop them and the sprites holding them; visible ones reload.
      clearObjs();
      tex.clear();
      themeVersion++; // the edge layer is GPU state too: redraw it
      dirty = true;
      app.ticker.start();
    },
  });

  return {
    setNodes(list) {
      const ids = new Set(list.map((n) => n.id));
      const next = new Map(list.map((n) => [n.id, n]));
      // A node that only moved keeps its display objects (a streaming layout posts every 10 ticks).
      for (const [id, o] of [...objs]) {
        const was = nodes.get(id);
        const now = next.get(id);
        if (was && now && sameLook(was, now)) o.root.position.set(now.x, now.y);
        else dropObj(id);
      }
      nodes = next;
      order = new Map(list.map((n, i) => [n.id, i]));
      grids = buildGrids(nodes);
      nodesVersion++;
      if (selected && !ids.has(selected)) selected = null;
      if (hovered && !ids.has(hovered)) hovered = null;
      dirty = true;
    },
    setEdges(list) {
      edges = list;
      dirty = true;
    },
    camera: () => cam,
    setCamera,
    fitAll,
    on(ev, fn) {
      handlers[ev].push(fn);
    },
    setDraggable(pred) {
      draggable = pred;
    },
    onDrop(fn) {
      drops.push(fn);
    },
    onDragOver(fn) {
      overs.push(fn);
    },
    setDropHint: setHint,
    select(id) {
      const next = id && nodes.has(id) ? id : null;
      // A new selection (keyboard or inspector) is brought on screen; the same one re-sent by a
      // render never pans, and a click has already set `selected` before it emits (I6).
      if (next && next !== selected) {
        const base = tween?.to ?? cam;
        const c = reveal(base, view(), nodeRect(nodes.get(next)!));
        if (c !== base) setCamera(c, true);
      }
      selected = next;
      dirty = true;
    },
    destroy() {
      life.abort();
      unwireContext();
      themeObserver.disconnect();
      resize?.disconnect();
      app.ticker.remove(tick);
      perf?.();
      clearObjs();
      tex.destroy();
      app.destroy({ removeView: true }, { children: true });
    },
  };
}

/**
 * Task 11's speed check (dev or VITE_PERF builds only): the Pixi ticker's fps and the live texture
 * count, with the worst fps and the most textures since the last reset (click the overlay, or call
 * `__horusPerf.<view>.reset()` over CDP, e.g. `__horusPerf.galaxy`). Views stay mounted while
 * hidden, so each scene has its own entry, keyed by its `data-view-host`. fps is averaged per
 * 500 ms window, which is also how often the text is written, so the overlay barely touches the
 * frames it measures. Returns its teardown.
 */
function perfOverlay(app: PixiNS.Application, host: HTMLElement, texSize: () => number): () => void {
  const el = document.createElement("div");
  el.className = "perf-overlay";
  host.append(el);
  const stats = { fps: 0, minFps: Infinity, tex: 0, maxTex: 0, reset() { stats.minFps = Infinity; stats.maxTex = 0; } };
  const key = host.closest<HTMLElement>("[data-view-host]")?.dataset.viewHost ?? "scene";
  const reg = ((globalThis as unknown as { __horusPerf?: Record<string, typeof stats> }).__horusPerf ??= {});
  reg[key] = stats;
  el.onclick = () => stats.reset();
  let frames = 0;
  let t0 = performance.now();
  const count = () => {
    frames++;
    stats.tex = texSize();
    stats.maxTex = Math.max(stats.maxTex, stats.tex);
    const now = performance.now();
    if (now - t0 < 500) return;
    stats.fps = (frames * 1000) / (now - t0);
    stats.minFps = Math.min(stats.minFps, stats.fps);
    frames = 0;
    t0 = now;
    el.textContent = `${stats.fps.toFixed(0)} fps (min ${stats.minFps.toFixed(0)})  tex ${stats.tex} (max ${stats.maxTex})`;
  };
  app.ticker.add(count);
  return () => {
    app.ticker.remove(count);
    el.remove();
    if (reg[key] === stats) delete reg[key];
  };
}
