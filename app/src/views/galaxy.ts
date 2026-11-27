// The Galaxy (SPEC §4, §5): every reference placed by a force layout of correlation scores, run in
// a Web Worker. Edges are drawn only for the hovered or selected reference, in neutral --ink-2.
import type { Api, Edge, Scored } from "../api";
import type { DataSource, SourceEvent } from "../data";
import { esc } from "../esc";
import { EDGE_W0, EDGE_W1, K_EDGES, NODE } from "../graph/constants";
import type { FromWorker, ToWorker, XY } from "../graph/force";
import { mountCanvasOrFallback, type Scene, type SceneEdge, type SceneNode } from "../graph/frame";
import { createScene } from "../graph/scene";
import { isTextEntry } from "../keys";
import { opLabel } from "../ops";
import type { ViewHandle } from "../views";
import { crumbHTML } from "./inspector";

const SEED = 7;
const ARROWS: Record<string, XY> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };

// R7: a same-origin module chunk (Vite resolves the URL from this file). Never `?worker&inline`:
// that is a blob: URL, which the CSP blocks.
const defaultWorker = () => new Worker(new URL("../graph/force.worker.ts", import.meta.url), { type: "module" });

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function mountGalaxy(
  host: HTMLElement,
  data: DataSource,
  deps: {
    api: Api;
    openReference(id: string): void;
    openCompare?(a: string, b: string): void; // Plan 4 mountCompare, wired in boot() when present
    makeScene?: (el: HTMLElement) => Promise<Scene>;
    makeWorker?: () => Worker;
  },
): ViewHandle {
  host.innerHTML = `<div class="gx">
    <div class="gx-canvas" data-label="Galaxy of references"></div>
    <aside class="gx-insp"></aside>
    <p class="sr-only" aria-live="polite" data-gx-live></p>
  </div>`;
  const canvasEl = host.querySelector<HTMLElement>(".gx-canvas")!;
  const insp = host.querySelector<HTMLElement>(".gx-insp")!;
  /** Says the selected reference: the inspector re-renders, so its own nodes can't be the live region. */
  const live = host.querySelector<HTMLElement>("[data-gx-live]")!;

  let scene: Scene | null = null;
  let destroyed = false;
  let positions: Record<string, XY> = {};
  let byRef = new Map<string, Edge[]>(); // each reference's top K_EDGES, strongest first
  let edgesVersion = -1; // graph_edges is costly (Task 11): once per data version, never per frame
  let edgesFetched = false;
  let selected: string | null = null;
  let hovered: string | null = null;
  let related: { id: string; rows: Scored[] } | null = null;
  let fitOnEnd = true; // the first layout, and the first after a library switch
  let centredOnce = false;
  let gen = 0; // a newer refresh supersedes an older one still awaiting graph_edges

  let settled = false; // the worker's last layout has ended
  let visible = true; // mounted on its first select; then the shell calls show() and hide()
  let pending: SourceEvent | null = null; // a change that arrived while hidden (reset kept)
  const worker = (deps.makeWorker ?? defaultWorker)();
  const post = (m: ToWorker) => worker.postMessage(m);
  let run = 0; // the current layout; a batch posted before the worker read a stop is dropped (I1)

  // ---------- drawing ----------

  function draw() {
    if (!scene) return;
    const s = data.get();
    const nodes: SceneNode[] = [];
    for (const r of s.refs.values()) {
      const p = positions[r.id];
      if (!p) continue;
      nodes.push({
        id: r.id, kind: "ref", x: p.x, y: p.y, size: NODE, url: r.thumb256,
        aspect: r.width > 0 && r.height > 0 ? r.width / r.height : 3 / 4,
        dim: !s.inScope(r.id), // out of board scope: a dot, never picked, no edges
      });
    }
    scene.setNodes(nodes);
    drawEdges();
  }

  /** The hovered reference's edges, or the selected one's, which stay until Esc. */
  function drawEdges() {
    if (!scene) return;
    const s = data.get();
    const focus = selected ?? hovered;
    if (!focus || !s.inScope(focus) || !positions[focus]) {
      scene.setEdges([]);
      return;
    }
    const out: SceneEdge[] = [];
    for (const e of byRef.get(focus) ?? []) {
      const other = e.a === focus ? e.b : e.a;
      if (!s.inScope(other) || !positions[other]) continue;
      out.push({ from: focus, to: other, width: EDGE_W0 + EDGE_W1 * e.score, color: "var(--ink-2)" });
    }
    scene.setEdges(out);
  }

  // ---------- the inspector ----------

  function renderInsp() {
    const s = data.get();
    if (!s.refs.size) {
      insp.innerHTML = `<div class="insp-body"><p class="gx-note">No references yet.</p></div>`;
      return;
    }
    const sel = selected ? s.refs.get(selected) : undefined;
    if (!sel) {
      insp.innerHTML = edgesFetched && !byRef.size ? `<div class="insp-body"><p class="gx-note">Tag references to see them cluster.</p></div>` : "";
      return;
    }
    const techName = (id: string) => s.tax.techniques.find((t) => t.id === id)?.name ?? id;
    // Only neighbours inside the board scope are listed (Plan 4 T7 M10).
    const rows = (related?.id === sel.id ? related.rows : []).filter((r) => s.inScope(r.id));
    // Design review F4: the path of the selection's first tag, as in the Tree and the Radial.
    const t = sel.tags.find((x) => x.techniqueId) ?? sel.tags[0];
    const br = t?.branchId ? s.tax.branches.find((b) => b.id === t.branchId) : undefined;
    const crumb = crumbHTML([
      t ? opLabel(s.tax, t.operationId).name : undefined,
      br ? s.tax.domains.find((d) => d.id === br.domainId)?.name : undefined,
      t?.techniqueId ? techName(t.techniqueId) : undefined,
      sel.title,
    ]);
    insp.innerHTML = `${crumb}<div class="insp-body"><h2 class="gx-title">${esc(sel.title)}</h2>
      <button class="gx-open" data-open-ref>Open in Reference view</button>
      ${rows.length ? `<ol class="gx-neighbours">${rows.map((r) => `<li><button data-ref="${esc(r.id)}">
        <span class="gx-name">${esc(s.refs.get(r.id)?.title ?? r.id)}</span>
        ${r.sharedTechniques.length ? `<span class="gx-shares">shares ${r.sharedTechniques.map((t) => `<i>${esc(techName(t))}</i>`).join(", ")}</span>` : ""}
        <span class="mono">${r.score.toFixed(2)}</span>
      </button></li>`).join("")}</ol>` : ""}</div>`;
  }

  async function select(id: string | null) {
    if (id && !data.get().inScope(id)) return void scene?.select(selected); // out of the board scope: keep what was selected
    selected = id;
    live.textContent = id ? (data.get().refs.get(id)?.title ?? "") : "";
    related = null;
    scene?.select(id);
    renderInsp();
    drawEdges();
    if (id) await loadRelated(id);
  }

  /** Neighbours with their shared techniques (C18); fetched again on every data change. */
  async function loadRelated(id: string) {
    const v = data.get().version;
    const rows = await deps.api.related(id).catch(() => [] as Scored[]);
    if (selected !== id || destroyed || data.get().version !== v) return;
    related = { id, rows };
    renderInsp();
  }

  // ---------- data ----------

  async function refresh(e: SourceEvent | null) {
    const mine = ++gen;
    const s = data.get();
    // Stop the run in progress now, so it can't stream stale positions or spend the first fit
    // while graph_edges is awaited.
    settled = false;
    run++; // anything still in flight from the old run is now stale
    post({ type: "stop" });
    if (e?.reset) {
      // A library switch: cold start, fit when settled, no selection (C20).
      positions = {};
      fitOnEnd = true;
      centredOnce = false;
      hovered = null;
      if (selected) void select(null);
    } else if (selected && (!s.refs.has(selected) || !s.inScope(selected))) void select(null); // a deleted or out-of-scope selection clears
    if (!s.refs.size) {
      post({ type: "stop" });
      fitOnEnd = true; // a refilled library fits again (M5)
      centredOnce = false;
      positions = {};
      byRef = new Map();
      scene?.setNodes([]);
      scene?.setEdges([]);
      renderInsp();
      return;
    }
    if (edgesVersion !== s.version) {
      const edges = await deps.api.graphEdges(K_EDGES).catch(() => null);
      if (mine !== gen || destroyed) return; // a newer change is already on its way
      // A failed fetch is not "no edges": keep the last ones, show no "Tag references" note, and
      // ask again on the next change (M4).
      if (edges) {
        edgesVersion = s.version;
        edgesFetched = true;
        byRef = topK(edges);
        allEdges = edges;
      }
    }
    const ids = [...s.refs.keys()];
    const prev: Record<string, XY> = {};
    for (const id of ids) if (positions[id]) prev[id] = positions[id];
    // Warm start (Review Focus 3): placed references begin where they are.
    post({ type: "start", run: ++run, input: { ids, edges: allEdges, seed: SEED, prev: Object.keys(prev).length ? prev : undefined } });
    renderInsp();
    drawEdges();
    if (selected) void loadRelated(selected); // scores and neighbours may have changed (carry-in 4)
  }
  let allEdges: Edge[] = [];

  worker.onmessage = (ev: MessageEvent<FromWorker>) => {
    const m = ev.data;
    if (m.run !== run) return; // from a stopped or superseded layout
    if (m.type === "tick") {
      const next: Record<string, XY> = {};
      m.ids.forEach((id, i) => (next[id] = { x: m.xy[2 * i], y: m.xy[2 * i + 1] }));
      positions = next;
      if (!reducedMotion()) draw(); // C13: reduced motion draws only the final layout
      centre();
    } else {
      settled = true;
      draw();
      fitIfSettled();
    }
  };

  /** While a cold layout streams in, look at its origin; the fit comes once it settles. */
  function centre() {
    // Only before the first fit of a cold layout: a warm restart keeps the artist's camera.
    if (centredOnce || !fitOnEnd || !scene || !visible) return;
    centredOnce = true;
    const c = scene.camera();
    scene.setCamera({ x: -canvasEl.clientWidth / (2 * c.scale), y: -canvasEl.clientHeight / (2 * c.scale), scale: c.scale });
  }

  /** The first layout (and the first after a switch) fits once both it and the scene are ready:
   * the worker can settle before Pixi has loaded. */
  function fitIfSettled() {
    if (!fitOnEnd || !settled || !scene || !visible) return; // hidden, the view is 1x1
    fitOnEnd = false;
    scene.fitAll();
  }

  // ---------- input ----------

  void mountCanvasOrFallback(canvasEl, () => (deps.makeScene ?? ((el) => createScene(el, deps.api)))(canvasEl)).then((sc) => {
    if (!sc) return; // the fallback sentence is showing; the inspector still works
    if (destroyed) return sc.destroy();
    scene = sc;
    sc.on("hover", (id) => {
      hovered = id;
      drawEdges();
    });
    sc.on("select", (id, mods) => {
      // Shift-click with another reference selected compares the two (audit row 25).
      if (mods.shift && selected && id && id !== selected && deps.openCompare) {
        deps.openCompare(selected, id);
        sc.select(selected);
        return;
      }
      void select(id);
    });
    sc.on("activate", (id) => id && deps.openReference(id)); // the scene owns Enter and double-click
    draw();
    if (settled) fitIfSettled();
    else if (Object.keys(positions).length) centre();
  });

  const life = new AbortController();
  host.addEventListener("keydown", (e) => {
    if (isTextEntry(e.target)) return;
    if (e.key === "Escape" && selected) {
      e.preventDefault();
      void select(null);
    } else if (e.key === "Enter" && !selected) {
      // With a selection the scene's Enter is `activate` (open). Without one, it falls through to
      // here: pick the in-scope reference nearest the view centre (Global Constraints).
      const c = scene?.camera() ?? { x: 0, y: 0, scale: 1 };
      const at = { x: c.x + canvasEl.clientWidth / (2 * c.scale), y: c.y + canvasEl.clientHeight / (2 * c.scale) };
      const id = nearest(at, null);
      if (id) {
        e.preventDefault();
        void select(id);
      }
    } else if (selected && ARROWS[e.key]) {
      // With a selection the scene leaves the arrows to the view: move along the arrow.
      e.preventDefault();
      const id = positions[selected] ? nearest(positions[selected], ARROWS[e.key], selected) : null;
      if (id) void select(id);
    }
  }, { signal: life.signal });

  /** The in-scope placed reference nearest `p`, optionally only inside the open ±45° cone along `dir`. */
  function nearest(p: XY, dir: XY | null, except?: string): string | null {
    const s = data.get();
    let best: string | null = null;
    let bestD = Infinity;
    for (const [id, q] of Object.entries(positions)) {
      if (id === except || !s.refs.has(id) || !s.inScope(id)) continue;
      const dx = q.x - p.x;
      const dy = q.y - p.y;
      if (dir) {
        const along = dx * dir.x + dy * dir.y;
        const across = Math.abs(dx * dir.y - dy * dir.x);
        if (along <= 0 || across >= along) continue; // outside the cone; nothing there means no move
      }
      const d = Math.hypot(dx, dy);
      if (d < bestD || (d === bestD && best !== null && id < best)) [best, bestD] = [id, d];
    }
    return best;
  }
  insp.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest("[data-open-ref]") && selected) deps.openReference(selected);
    const row = t.closest<HTMLElement>("[data-ref]");
    if (row) {
      void select(row.dataset.ref!);
      canvasEl.querySelector("canvas")?.focus(); // the row re-renders; keep Esc and the keys working
    }
  }, { signal: life.signal });

  // Dev-only handle for the manual check (positions and settle state); release builds drop it.
  if (import.meta.env.DEV)
    (globalThis as unknown as { __galaxy: unknown }).__galaxy = {
      positions: () => positions, settled: () => settled, camera: () => scene?.camera(), selected: () => selected, scene: () => scene,
    };
  // Hidden, a change is only remembered (a reset is never lost): each Inbox tag would otherwise
  // pay for graph_edges and a layout nobody sees (carry-in 6).
  const unsub = data.subscribe((_, e) => {
    if (visible) void refresh(e);
    else pending = { reset: (pending?.reset ?? false) || e.reset };
  });
  void refresh(null);

  return {
    show() {
      visible = true;
      if (pending) {
        const e = pending;
        pending = null;
        void refresh(e);
      }
      fitIfSettled();
    },
    hide() {
      visible = false;
    },
    destroy() {
      destroyed = true;
      unsub();
      life.abort();
      post({ type: "stop" });
      worker.terminate();
      scene?.destroy();
      host.replaceChildren();
    },
  };
}

/** Each reference's strongest K_EDGES edges, by (score desc, other id asc). */
function topK(edges: Edge[]): Map<string, Edge[]> {
  const by = new Map<string, Edge[]>();
  for (const e of edges)
    for (const id of [e.a, e.b]) {
      const l = by.get(id);
      if (l) l.push(e);
      else by.set(id, [e]);
    }
  for (const [id, l] of by) {
    const other = (e: Edge) => (e.a === id ? e.b : e.a);
    l.sort((x, y) => y.score - x.score || (other(x) < other(y) ? -1 : 1));
    by.set(id, l.slice(0, K_EDGES));
  }
  return by;
}
