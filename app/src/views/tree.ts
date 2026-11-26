// The taxonomy Tree view (SPEC §5): four bands on a canvas, the inspector docked on the right.
// Task 10: the inspector edits the taxonomy, and a technique dragged onto a branch links there. The scene (Task 4) owns Enter, 0, +/- and the arrows while nothing is
// selected; the Tree listens for its `activate` and moves a selection through navigate.ts.
import type { Api, Change, Region } from "../api";
import type { DataSource } from "../data";
import { esc } from "../esc";
import { LABEL_ROW, NODE } from "../graph/constants";
import { clipLabel, mountCanvasOrFallback, type Scene, type SceneEdge, type SceneNode } from "../graph/frame";
import { labelRows, layoutTree } from "../graph/layout-tree";
import { canvasKeys, move } from "../graph/navigate";
import { createScene } from "../graph/scene";
import { buildTaxGraph, type TaxGraph } from "../graph/taxgraph";
import { opInk, opLabel } from "../ops";
import type { ViewHandle } from "../views";
import { renderInspector, sayError, selectionOf } from "./inspector";

/** Decision 3: "Show all references" is off by default and remembered for the session. */
let showAllSession = false;

const SIZE = { op: 28, branch: 20, tech: 20 } as const;
const HAIR = "var(--line-2)";
const WHOLE: Region = { x: 0, y: 0, w: 1, h: 1 };

/** The selection's path: its operation, branch, technique and reference node ids. */
function pathOf(g: TaxGraph, sel: string | null): { op: string | null; ids: Set<string> } {
  const ids = new Set<string>();
  const n = sel ? g.nodes.get(sel) : undefined;
  if (!n) return { op: null, ids };
  ids.add(n.id);
  if (n.kind === "op") return { op: n.opId, ids };
  let branch: string | undefined;
  if (n.kind === "branch") branch = n.id;
  else if (n.kind === "tech") branch = n.parents[0] && `br:${n.parents[0]}`; // the first parent, as ↑ goes
  else {
    ids.add(`tech:${n.via.techId}`);
    branch = `br:${n.via.branchId}`;
  }
  const b = branch ? g.nodes.get(branch) : undefined;
  if (b?.kind !== "branch") return { op: null, ids };
  ids.add(b.id).add(`op:${b.opId}`);
  return { op: b.opId, ids };
}

export function mountTree(
  host: HTMLElement,
  data: DataSource,
  deps: {
    api: Api;
    openReference(id: string): void;
    makeScene?: (el: HTMLElement) => Promise<Scene>;
    /** Task 10: store.apply. Without it the Tree stays read-only. */
    apply?(c: Change): void;
    /** Task 10: boot's notice, for refusals. */
    notice?(html: string): void;
  },
): ViewHandle {
  host.classList.add("tree");
  host.innerHTML = `<div class="tree-main">
    <div class="tree-bar"><button class="text-btn tree-all" aria-pressed="${showAllSession}">Show all references</button></div>
    <div class="tree-stage"></div>
  </div><aside class="insp" aria-label="Inspector"></aside>`;
  const stage = host.querySelector<HTMLElement>(".tree-stage")!;
  const insp = host.querySelector<HTMLElement>(".insp")!;
  const allBtn = host.querySelector<HTMLButtonElement>(".tree-all")!;
  const life = new AbortController();
  let scene: Scene | null = null;
  let dead = false;
  let sel: string | null = null;
  let g: TaxGraph = buildTaxGraph(data.get());
  let shown = false;
  let stale = false;
  let fitOnShow = false;

  const editing = () => !!deps.apply && !data.get().taxonomyReadOnly;
  /** Drag to link (S3, R20): "ok" onto a branch that doesn't hold the technique yet, "no" onto one that does. */
  const linkable = (dragged: string, target: string | null): "ok" | "no" | null => {
    if (!dragged.startsWith("tech:") || !target?.startsWith("br:")) return null;
    const { tax } = data.get();
    const [t, b] = [dragged.slice(5), target.slice(3)];
    if (!tax.branches.some((x) => x.id === b)) return null;
    return tax.branchTechniques.some((l) => l.techniqueId === t && l.branchId === b) ? "no" : "ok";
  };

  /** One technique is expanded: the selected one, or the one the selected reference sits under. */
  const expandedFor = (id: string | null): Set<string> | "all" => {
    if (showAllSession) return "all";
    const n = id ? g.nodes.get(id) : undefined;
    return n?.kind === "tech" ? new Set([n.id]) : n?.kind === "ref" ? new Set([`tech:${n.via.techId}`]) : new Set();
  };

  function render() {
    const s = data.get();
    g = buildTaxGraph(s, expandedFor(sel));
    if (sel && !g.nodes.has(sel)) {
      sel = null; // gone since the change (Review Focus 3)
      g = buildTaxGraph(s, expandedFor(null));
    }
    renderInspector(insp, s, selectionOf(sel), {
      editable: editing(),
      openReference: deps.openReference,
      select: (x) => select(x?.id ?? null),
      assetUrl: (p) => deps.api.assetUrl(p),
      api: deps.api,
      apply: deps.apply,
      notice: deps.notice,
      focusCanvas: () => stage.querySelector("canvas")?.focus(),
    });
    if (!scene) return;
    const placed = layoutTree(g);
    const rows = labelRows(g, placed); // branch and technique labels on 3 staggered rows (I1)
    const path = pathOf(g, sel);
    const ink = path.op ? opInk(s.tax, path.op).base : HAIR;
    const colorOf = (id: string) => (path.ids.has(id) ? ink : HAIR);
    const opOfBranch = (b: string) => s.tax.branches.find((x) => x.id === b)?.operationId ?? "";
    const nodes: SceneNode[] = [];
    for (const n of g.nodes.values()) {
      const { x, y } = placed.get(n.id)!;
      if (n.kind === "ref") {
        const ref = s.refs.get(n.refId)!;
        nodes.push({
          id: n.id, kind: "ref", x, y, size: NODE, url: ref.thumb256, aspect: ref.width / ref.height || 3 / 4, // url is raw: the scene runs assetUrl
          ...(s.inScope(n.refId) ? {} : { dim: true }),
          outline: { region: n.via.region ?? WHOLE, color: opInk(s.tax, opOfBranch(n.via.branchId)).base, state: n.via.state },
        });
      } else {
        const label = n.kind === "op" ? opLabel(s.tax, n.opId).name
          : n.kind === "branch" ? (s.tax.domains.find((d) => d.id === n.domainId)?.name ?? n.domainId)
          : (s.tax.techniques.find((t) => t.id === n.techId)?.name ?? n.techId);
        nodes.push({
          id: n.id, kind: n.kind, x, y, size: SIZE[n.kind], color: colorOf(n.id), label: clipLabel(label),
          ...(n.kind === "op" ? {} : { labelDy: rows.get(n.id)! * LABEL_ROW }),
        });
      }
    }
    // Orthogonal hairlines: down from the parent to the gap between the bands, across, then down
    // to the child. The joints are empty labels, which the scene never picks.
    const segs = new Map<string, SceneEdge>();
    const seg = (from: string, to: string, inked: boolean) => {
      const k = `${from}>${to}`;
      const e = segs.get(k);
      if (!e || inked) segs.set(k, { from, to, width: 1, color: inked ? ink : HAIR });
    };
    const joint = (id: string, x: number, y: number) => {
      if (!placed.has(id)) {
        placed.set(id, { x, y });
        nodes.push({ id, kind: "label", x, y, text: "", font: "mono", color: HAIR });
      }
    };
    for (const [parent, kids] of g.children) {
      const a = placed.get(parent)!;
      for (const child of kids) {
        const b = placed.get(child)!;
        const inked = path.ids.has(parent) && path.ids.has(child);
        if (child.startsWith("ref:")) {
          seg(parent, child, inked); // a reference column shares its technique's x
          continue;
        }
        const mid = (a.y + b.y) / 2;
        joint(`j:dn:${parent}`, a.x, mid);
        joint(`j:up:${child}`, b.x, mid);
        seg(parent, `j:dn:${parent}`, inked);
        seg(`j:dn:${parent}`, `j:up:${child}`, inked);
        seg(`j:up:${child}`, child, inked);
      }
    }
    const edges = [...segs.values()];
    edges.sort((x, y) => Number(x.color !== HAIR) - Number(y.color !== HAIR)); // the path draws last
    scene.setNodes(nodes);
    scene.setEdges(edges);
    scene.select(sel);
  }

  function select(id: string | null) {
    const n = id ? g.nodes.get(id) : undefined;
    if (id && (!n || (n.kind === "ref" && !data.get().inScope(n.refId)))) {
      scene?.select(sel); // out of scope (audit row 10) or gone: keep what was selected
      return;
    }
    sel = id;
    render();
  }

  allBtn.addEventListener("click", () => {
    showAllSession = !showAllSession;
    allBtn.setAttribute("aria-pressed", String(showAllSession));
    render();
  }, { signal: life.signal });

  stage.addEventListener("keydown", (e) => {
    const handled = canvasKeys(e, {
      move: (dir) => {
        const next = move(g, sel, dir);
        if (next) select(next);
      },
      // With a selection, Enter is the scene's: it emits `activate` (carry-in 1). With none, Enter
      // starts one on the first operation (final review I3: every canvas action from the keyboard).
      activate: () => {
        if (!sel) select(move(g, null, "child"));
      },
      clear: () => select(null),
    });
    if (handled) e.preventDefault();
  }, { signal: life.signal });

  const unsubscribe = data.subscribe((_s, e) => {
    if (e.reset) {
      sel = null; // a library switch (C20)
      fitOnShow = true;
    }
    if (!shown) return void (stale = true);
    render();
    if (fitOnShow) scene?.fitAll();
    fitOnShow = false;
  });

  const make = deps.makeScene ?? ((el: HTMLElement) => createScene(el, deps.api));
  void mountCanvasOrFallback(stage, () => make(stage)).then((sc) => {
    if (dead) return sc?.destroy();
    if (!sc) return; // the fallback paragraph is up; the inspector still works (Review Focus 1)
    scene = sc;
    sc.on("select", (id) => select(id));
    sc.setDraggable((id) => id.startsWith("tech:") && editing()); // read live: a read-only library pans instead
    sc.onDragOver?.((dragged, target) => {
      const v = editing() ? linkable(dragged, target) : null;
      const op = target && data.get().tax.branches.find((b) => `br:${b.id}` === target)?.operationId;
      sc.setDropHint?.(v === "ok" ? { id: target!, color: opInk(data.get().tax, op ?? "").base } : v === "no" ? "blocked" : null);
    });
    sc.onDrop((dragged, target) => {
      if (!editing() || linkable(dragged, target) !== "ok") return;
      deps.api.linkTechnique(dragged.slice(5), target!.slice(3)).then(
        (c) => deps.apply!(c),
        (err) => deps.notice?.(`<p>${esc(sayError(err, data.get().tax))}</p>`),
      );
    });
    sc.on("activate", (id) => {
      const n = id ? g.nodes.get(id) : undefined;
      if (n?.kind === "ref") deps.openReference(n.refId);
    });
    render();
    sc.fitAll();
  });
  render();

  return {
    show() {
      shown = true;
      if (!stale) return;
      stale = false;
      render();
      if (fitOnShow) scene?.fitAll();
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
      host.classList.remove("tree");
    },
  };
}
