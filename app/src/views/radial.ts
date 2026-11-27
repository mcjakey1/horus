// The Radial view (SPEC §5): one operation at a time, as a layout mode over the taxonomy graph.
// The operation sits at the centre, its branches on ring 1, its techniques on ring 2 and its
// references on ring 3. The scene (Task 4) owns Enter, 0, +/- and the arrows while nothing is
// selected; the view listens for `activate` and moves a selection through navigate.ts (R12).
import type { Api, Region } from "../api";
import type { DataSource, Snapshot } from "../data";
import { esc } from "../esc";
import { MAX_OPS, NODE } from "../graph/constants";
import { clipLabel, mountCanvasOrFallback, type Scene, type SceneEdge, type SceneNode } from "../graph/frame";
import { layoutRadial } from "../graph/layout-radial";
import type { Placed } from "../graph/layout-tree";
import { canvasKeys, move } from "../graph/navigate";
import { createScene } from "../graph/scene";
import { buildTaxGraph, type TaxGraph, type Via } from "../graph/taxgraph";
import { opInk, opLabel } from "../ops";
import type { ViewHandle } from "../views";
import { renderInspector, selectionOf } from "./inspector";

/** The chosen operation, remembered for the session. */
let opSession: string | null = null;

const SIZE = { op: 32, branch: 20, tech: 20 } as const;
const HAIR = "var(--line-2)"; // connectors (DESIGN's structural rule)
/** Off-path branch and technique outlines (final review I7); the centre always takes its ink. */
const OFF = "var(--ink-3)";
const WHOLE: Region = { x: 0, y: 0, w: 1, h: 1 };

type Layout = {
  key: string;
  g: TaxGraph;
  placed: Placed;
  /** This operation's branch ids. */
  here: Set<string>;
  /** Ring 3: every placed ref node id → the one node drawn for its reference (carry-in 2). */
  rep: Map<string, string>;
  /** Drawn ref node → its tags on this operation's branches (carry-in 3), and its techniques here. */
  vias: Map<string, Via[]>;
  techs: Map<string, string[]>;
  /** The graph cut down to this ring, for the arrow keys: this operation's nodes and edges only,
   * a technique's parents limited to this operation, one node per reference. */
  ring: TaxGraph;
};

/** The operation with the most tagged references; ties go to taxonomy order. */
function busiest(s: Snapshot): string {
  const g = buildTaxGraph(s);
  let best = s.tax.operations[0]?.id ?? "";
  let most = -1;
  for (const o of s.tax.operations) {
    const n = g.nodes.get(`op:${o.id}`) as { count: number };
    if (n.count > most) [best, most] = [o.id, n.count];
  }
  return best;
}

export function mountRadial(
  host: HTMLElement,
  data: DataSource,
  deps: { api: Api; openReference(id: string): void; makeScene?: (el: HTMLElement) => Promise<Scene>; initialOp?: string },
): ViewHandle {
  host.classList.add("radial");
  host.innerHTML = `<div class="radial-main">
    <div class="radial-ops" role="group" aria-label="Operation"></div>
    <div class="radial-stage"></div>
  </div><aside class="insp" aria-label="Inspector"></aside>`;
  const opsEl = host.querySelector<HTMLElement>(".radial-ops")!;
  const stage = host.querySelector<HTMLElement>(".radial-stage")!;
  const insp = host.querySelector<HTMLElement>(".insp")!;
  const life = new AbortController();
  const exists = (id: string | null | undefined): id is string => !!id && data.get().tax.operations.some((o) => o.id === id);
  let op = exists(deps.initialOp) ? deps.initialOp : exists(opSession) ? opSession : busiest(data.get());
  let scene: Scene | null = null;
  let dead = false;
  let sel: string | null = null;
  let hovered: string | null = null;
  let L: Layout | null = null;
  let opsSig = "";
  let shown = false;
  let stale = false;
  let fitOnShow = false;

  /** Rebuilt only when the data `version` or the operation changes (the Snapshot is live). */
  function layout(): Layout {
    const s = data.get();
    const key = `${s.version}:${op}`;
    if (L?.key === key) return L;
    const g = buildTaxGraph(s, "all"); // Radial always expands every technique
    const placed = layoutRadial(g, op);
    const here = new Set(s.tax.branches.filter((b) => b.operationId === op).map((b) => b.id));
    const rep = new Map<string, string>();
    const first = new Map<string, string>();
    const vias = new Map<string, Via[]>();
    const techs = new Map<string, string[]>();
    for (const id of placed.keys()) {
      const n = g.nodes.get(id);
      if (n?.kind !== "ref") continue;
      const r = first.get(n.refId) ?? id;
      first.set(n.refId, r);
      rep.set(id, r);
      vias.set(r, [...(vias.get(r) ?? []), ...n.vias.filter((v) => here.has(v.branchId))]);
      techs.set(r, [...(techs.get(r) ?? []), `tech:${n.via.techId}`]);
    }
    const ring: TaxGraph = { nodes: new Map(), children: new Map() };
    for (const id of placed.keys()) {
      const n = g.nodes.get(id)!;
      if (n.kind === "ref" && rep.get(id) !== id) continue;
      ring.nodes.set(id, n.kind === "tech" ? { ...n, parents: n.parents.filter((b) => here.has(b)) } : n);
      const kids = (g.children.get(id) ?? []).filter((c) => placed.has(c)).map((c) => rep.get(c) ?? c);
      ring.children.set(id, [...new Set(kids)]);
    }
    return (L = { key, g, placed, here, rep, vias, techs, ring });
  }

  /** The selection's path on this operation: the centre, its branches here, techniques, reference. */
  function pathIds(l: Layout): Set<string> {
    const ids = new Set<string>();
    const n = sel ? l.g.nodes.get(sel) : undefined;
    if (!n) return ids;
    ids.add(n.id).add(`op:${op}`);
    if (n.kind === "branch") return ids;
    const techs = n.kind === "tech" ? [n.id] : n.kind === "ref" ? (l.techs.get(n.id) ?? []) : [];
    for (const t of techs) {
      ids.add(t);
      const tn = l.g.nodes.get(t);
      if (tn?.kind === "tech") for (const b of tn.parents) if (l.here.has(b)) ids.add(`br:${b}`);
    }
    return ids;
  }

  function edges(l: Layout, ink: string): SceneEdge[] {
    const path = pathIds(l);
    const out: SceneEdge[] = [];
    const add = (from: string, to: string, inked: boolean) => out.push({ from, to, width: 1, color: inked ? ink : HAIR });
    for (const b of l.g.children.get(`op:${op}`) ?? []) {
      add(`op:${op}`, b, path.has(b));
      for (const t of l.g.children.get(b) ?? []) add(b, t, path.has(b) && path.has(t));
    }
    // Ring 3's connectors only for the hovered or selected technique ("edges only on hover").
    const selNode = sel ? l.g.nodes.get(sel) : undefined;
    const active = hovered ? [hovered] : selNode?.kind === "tech" ? [selNode.id] : selNode?.kind === "ref" ? (l.techs.get(selNode.id) ?? []) : [];
    for (const t of active)
      for (const r of new Set((l.g.children.get(t) ?? []).filter((c) => l.placed.has(c)).map((c) => l.rep.get(c)!))) add(t, r, true);
    return out.sort((a, b) => Number(a.color !== HAIR) - Number(b.color !== HAIR)); // ink draws last
  }

  function syncOps() {
    const { tax } = data.get();
    const sig = JSON.stringify(tax.operations.map((o) => [o.id, o.plainLabel, o.color]));
    if (sig !== opsSig) {
      opsSig = sig;
      opsEl.innerHTML = tax.operations
        .map((o) => `<button class="radial-op" data-op="${esc(o.id)}" aria-pressed="false"><span class="sw" aria-hidden="true"></span>${esc(o.plainLabel)}</button>`)
        .join("");
      for (const b of opsEl.querySelectorAll<HTMLElement>(".radial-op"))
        b.querySelector<HTMLElement>(".sw")!.style.setProperty("--c", opInk(tax, b.dataset.op!).base);
    }
    for (const b of opsEl.querySelectorAll<HTMLElement>(".radial-op")) b.setAttribute("aria-pressed", String(b.dataset.op === op));
  }

  function render(fit = false) {
    const s = data.get();
    if (!exists(op)) {
      // The active operation was deleted: the busiest takes over, remembered, and fitted (M3).
      op = opSession = busiest(s);
      hovered = null;
      fit = true;
    }
    const l = layout();
    if (sel && l.rep.has(sel)) sel = l.rep.get(sel)!; // a change can make another node the drawn one
    if (sel && (!l.placed.has(sel) || refused(sel))) sel = null; // gone since the change (Review Focus 3), or out of the board scope (Plan 4)
    syncOps();
    renderInspector(insp, s, selectionOf(sel), {
      editable: false,
      openReference: deps.openReference,
      select: (x) => select(x?.id ?? null),
      assetUrl: (p) => deps.api.assetUrl(p),
      centreOp: op,
    });
    if (!scene) return;
    const ink = opInk(s.tax, op).base;
    const path = pathIds(l);
    const nodes: SceneNode[] = [];
    for (const [id, { x, y }] of l.placed) {
      const n = l.g.nodes.get(id)!;
      if (n.kind === "ref") {
        if (l.rep.get(id) !== id) continue; // one point per reference
        const ref = s.refs.get(n.refId)!;
        const vs = l.vias.get(id)!;
        const v = vs.find((x) => x.state === "region") ?? vs[0];
        nodes.push({
          id, kind: "ref", x, y, size: NODE, url: ref.thumb256, aspect: ref.width / ref.height || 3 / 4, // raw: the scene runs assetUrl
          ...(s.inScope(n.refId) ? {} : { dim: true }),
          outline: { region: v.region ?? WHOLE, color: ink, state: v.state },
        });
      } else {
        const label = n.kind === "op" ? opLabel(s.tax, n.opId).name
          : n.kind === "branch" ? (s.tax.domains.find((d) => d.id === n.domainId)?.name ?? n.domainId)
          : (s.tax.techniques.find((t) => t.id === n.techId)?.name ?? n.techId);
        nodes.push({ id, kind: n.kind, x, y, size: SIZE[n.kind], color: n.kind === "op" || path.has(id) ? ink : OFF, label: clipLabel(label) });
      }
    }
    scene.setNodes(nodes);
    scene.setEdges(edges(l, ink));
    scene.select(sel);
    if (fit) scene.fitAll();
  }

  function switchOp(next: string, then: string | null = null) {
    op = opSession = next;
    sel = then;
    hovered = null;
    render(true);
  }

  /** A reference outside the board scope: dimmed, never selected (audit row 10). */
  function refused(id: string) {
    const n = layout().g.nodes.get(id);
    return n?.kind === "ref" && !data.get().inScope(n.refId);
  }

  function select(id: string | null) {
    const l = layout();
    const n = id ? l.g.nodes.get(id) : undefined;
    if (n?.kind === "op" && n.opId !== op) return switchOp(n.opId, n.id);
    if (n?.kind === "branch" && n.opId !== op) return switchOp(n.opId, n.id); // "Used under" another operation
    if (id && (!n || !l.placed.has(id) || (n.kind === "ref" && !data.get().inScope(n.refId)))) {
      scene?.select(sel); // another operation's node, out of scope (audit row 10) or gone
      return;
    }
    sel = id && n?.kind === "ref" ? l.rep.get(id)! : id;
    render();
  }

  opsEl.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>(".radial-op");
    if (b && b.dataset.op !== op) switchOp(b.dataset.op!);
  }, { signal: life.signal });

  stage.addEventListener("keydown", (e) => {
    const handled = canvasKeys(e, {
      move: (dir) => {
        let next = sel === null ? (dir === "parent" ? null : `op:${op}`) : move(layout().ring, sel, dir);
        // Out-of-scope references are stepped over in the same direction (Plan 4, as in the Tree); a
        // refused first child walks on to its next sibling. The loop is bounded by the ring's size.
        const step = dir === "child" ? "next" : dir;
        for (let n = layout().ring.nodes.size; next && refused(next) && n > 0; n--) next = move(layout().ring, next, step);
        if (next) select(next);
      },
      // With a selection, Enter is the scene's: it emits `activate`. With none, Enter selects the
      // centre (final review I3).
      activate: () => {
        if (!sel) select(`op:${op}`);
      },
      clear: () => select(null),
      digit: (k) => {
        const ops = data.get().tax.operations;
        if (k <= Math.min(ops.length, MAX_OPS) && ops[k - 1].id !== op) switchOp(ops[k - 1].id);
      },
    });
    if (handled) e.preventDefault();
  }, { signal: life.signal });

  const unsubscribe = data.subscribe((_s, e) => {
    if (e.reset) {
      sel = null; // a library switch (C20)
      fitOnShow = true;
    }
    if (!shown) return void (stale = true);
    render(fitOnShow);
    fitOnShow = false;
  });

  const make = deps.makeScene ?? ((el: HTMLElement) => createScene(el, deps.api));
  void mountCanvasOrFallback(stage, () => make(stage)).then((sc) => {
    if (dead) return sc?.destroy();
    if (!sc) return; // the fallback paragraph is up; the switch and the inspector still work
    scene = sc;
    sc.on("select", (id) => select(id));
    sc.on("hover", (id) => {
      const next = id?.startsWith("tech:") ? id : null;
      if (next === hovered || !scene) return;
      hovered = next;
      scene.setEdges(edges(layout(), opInk(data.get().tax, op).base));
    });
    sc.on("activate", (id) => {
      const n = id ? layout().g.nodes.get(id) : undefined;
      if (n?.kind === "ref") deps.openReference(n.refId);
    });
    render(true);
  });
  render();

  return {
    show() {
      shown = true;
      if (!stale) return;
      stale = false;
      render(fitOnShow);
      fitOnShow = false;
    },
    hide() {
      shown = false;
    },
    destroy() {
      dead = true;
      life.abort();
      unsubscribe();
      scene?.destroy();
      scene = null;
      host.replaceChildren();
      host.classList.remove("radial");
    },
  };
}
