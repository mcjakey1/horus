// The graph views' docked inspector (SPEC §5): the breadcrumb on top, then the selection's
// detail. Read-only here; `editable` is for the editing task (R10). Markup carries no style=; tile
// geometry and inks go through the CSSOM (Plan 6 CSP, R11).
import type { Taxonomy } from "../api";
import type { Snapshot } from "../data";
import { esc } from "../esc";
import { buildTaxGraph, type TaxNode } from "../graph/taxgraph";
import { opInk, opLabel } from "../ops";
import { tileBox, type Box } from "../reference/tile";

export type Selection = { kind: "op" | "branch" | "tech" | "ref"; id: string } | null;
export type InspectorOpts = {
  editable: boolean;
  openReference(id: string): void;
  select(sel: Selection): void;
  /** Additive to the brief (Task 6): `api.assetUrl`, for the tiles' thumbnails. Without it a tile shows no image. */
  assetUrl?(path: string): string;
};

const KIND: Record<string, NonNullable<Selection>["kind"]> = { op: "op", br: "branch", tech: "tech", ref: "ref" };
/** A graph node id (`op:…`, `br:…`, `tech:…`, `ref:…`) as a Selection. */
export const selectionOf = (id: string | null): Selection => (id && KIND[id.split(":")[0]] ? { kind: KIND[id.split(":")[0]], id } : null);

const TILE = 64;
const place = (el: HTMLElement, b: Box) =>
  Object.assign(el.style, { left: `${b.left}px`, top: `${b.top}px`, width: `${b.width}px`, height: `${b.height}px` });

function crumbHTML(cells: (string | undefined)[]): string {
  const keys = [["op", "01 Operation"], ["domain", "02 Domain"], ["tech", "03 Technique"], ["ref", "04 Reference"]];
  return `<div class="record insp-crumb">${keys
    .map(([level, k], i) => `<div class="cell" data-level="${level}"><span class="k">${k}</span><span class="v${i === 1 ? "" : " serif"}">${esc(cells[i] ?? "")}</span></div>`)
    .join("")}</div>`;
}

const count = (n: number) => `<span class="count">${n}</span>`;
const selBtn = (id: string, label: string, n?: number) =>
  `<button class="insp-sel" data-sel="${esc(id)}"><span>${esc(label)}</span>${n === undefined ? "" : count(n)}</button>`;

function names(tax: Taxonomy) {
  const domain = (id: string) => tax.domains.find((d) => d.id === id);
  const branch = (id: string) => tax.branches.find((b) => b.id === id);
  const tech = (id: string) => tax.techniques.find((t) => t.id === id);
  const branchLabel = (id: string) => {
    const b = branch(id);
    return b ? `${opLabel(tax, b.operationId).name} · ${domain(b.domainId)?.name ?? b.domainId}` : id;
  };
  return { domain, branch, tech, branchLabel };
}

export function renderInspector(el: HTMLElement, s: Snapshot, sel: Selection, opts: InspectorOpts): void {
  const { tax } = s;
  const N = names(tax);
  const techId = sel?.kind === "tech" ? sel.id.slice(5) : sel?.kind === "ref" ? sel.id.split(":")[1] : null;
  const g = buildTaxGraph(s, techId ? new Set([`tech:${techId}`]) : new Set());
  const node: TaxNode | undefined = sel ? g.nodes.get(sel.id) : undefined;
  if (sel && !node) sel = null; // gone since: show the operations

  // The path, to the depth of the selection.
  const branchId = node?.kind === "branch" ? node.branchId : node?.kind === "tech" ? node.parents[0] : node?.kind === "ref" ? node.via.branchId : undefined;
  const br = branchId ? N.branch(branchId) : undefined;
  const opId = node?.kind === "op" ? node.opId : br?.operationId;
  const refNode = node?.kind === "ref" ? node : undefined;
  const crumb = crumbHTML([
    opId ? opLabel(tax, opId).name : undefined,
    br ? N.domain(br.domainId)?.name : undefined,
    techId && node ? N.tech(techId)?.name : undefined,
    refNode ? s.refs.get(refNode.refId)?.title : undefined,
  ]);

  let body = "";
  if (!node) {
    body = `<h2 class="insp-title" tabindex="-1">Operations</h2><div class="insp-list">${tax.operations
      .map((o) => selBtn(`op:${o.id}`, `${o.name} · ${o.plainLabel}`, (g.nodes.get(`op:${o.id}`) as { count: number }).count))
      .join("")}</div>`;
  } else if (node.kind === "op") {
    const op = tax.operations.find((o) => o.id === node.opId)!;
    body = `<p class="insp-plain">${esc(op.plainLabel)}</p><h2 class="insp-title" tabindex="-1">${esc(op.name)}</h2>
      <p class="insp-desc">${esc(op.description)}</p><p class="insp-count mono">${node.count} ${node.count === 1 ? "reference" : "references"}</p>
      <div class="insp-list">${(g.children.get(node.id) ?? []).map((b) => selBtn(b, N.branchLabel(b.slice(3)), (g.nodes.get(b) as { count: number }).count)).join("")}</div>`;
  } else if (node.kind === "branch") {
    const d = N.domain(node.domainId);
    body = `<h2 class="insp-title" tabindex="-1">${esc(d?.name ?? node.domainId)}</h2><p class="insp-desc">${esc(d?.description ?? "")}</p>
      <div class="insp-list">${(g.children.get(node.id) ?? [])
        .map((t) => selBtn(t, N.tech(t.slice(5))?.name ?? t, (g.nodes.get(t) as { count: number }).count))
        .join("")}</div>`;
  } else if (node.kind === "tech") {
    const t = N.tech(node.techId)!;
    const tiles = (g.children.get(node.id) ?? []).map((id) => {
      const r = g.nodes.get(id) as Extract<TaxNode, { kind: "ref" }>;
      const ref = s.refs.get(r.refId)!;
      return `<button class="thumb" data-open="${esc(ref.id)}" title="${esc(ref.title)}"><span class="t"><span class="tplate">${opts.assetUrl ? `<img alt="" src="${esc(opts.assetUrl(ref.thumb256))}">` : ""}</span>${r.via.region ? `<span class="treg"></span>` : ""}</span></button>`;
    });
    body = `<h2 class="insp-title" tabindex="-1">${esc(t.name)}</h2><p class="insp-desc">${esc(t.description)}</p>
      ${t.synonyms.length ? `<p class="insp-syn">${esc(t.synonyms.join(", "))}</p>` : ""}
      <h3 class="insp-h">Used under</h3><div class="insp-list insp-used">${node.parents.map((b) => selBtn(`br:${b}`, N.branchLabel(b))).join("")}</div>
      <h3 class="insp-h">References ${count(node.count)}</h3>
      ${tiles.length ? `<div class="thumbs">${tiles.join("")}</div>` : `<p class="none">No reference has this technique yet.</p>`}`;
  } else {
    const ref = s.refs.get(node.refId)!;
    body = `<h2 class="insp-title" tabindex="-1">${esc(ref.title)}</h2>
      ${ref.creator || ref.year ? `<p class="insp-desc">${esc([ref.creator, ref.year].filter(Boolean).join(", "))}</p>` : ""}
      <button class="text-btn" data-open="${esc(ref.id)}">Open in Reference view</button>`;
  }
  // Rewriting the aside destroys the focused button: keep the keyboard route inside it (I1).
  const hadFocus = el.contains(document.activeElement);
  el.innerHTML = `${crumb}<div class="insp-body">${body}</div>`;
  if (hadFocus) el.querySelector<HTMLElement>(".insp-title")?.focus();

  // Inks and tile geometry, through the CSSOM.
  if (opId) el.querySelector<HTMLElement>(".insp-crumb")!.style.setProperty("--op-text", opInk(tax, opId).text);
  if (node?.kind === "tech")
    for (const id of g.children.get(node.id) ?? []) {
      const r = g.nodes.get(id) as Extract<TaxNode, { kind: "ref" }>;
      const ref = s.refs.get(r.refId)!;
      const tile = el.querySelector<HTMLElement>(`.thumb[data-open="${CSS.escape(ref.id)}"]`)!;
      const { plate, outline } = tileBox(ref.width / ref.height || 3 / 4, TILE, r.via.region);
      place(tile.querySelector<HTMLElement>(".tplate")!, plate);
      const reg = tile.querySelector<HTMLElement>(".treg");
      if (reg && outline) {
        place(reg, outline);
        reg.style.setProperty("--c", opInk(tax, N.branch(r.via.branchId)?.operationId ?? "").base);
      }
    }
  el.onclick = (e) => {
    const t = e.target as Element;
    const pick = t.closest<HTMLElement>("[data-sel]");
    if (pick) return opts.select(selectionOf(pick.dataset.sel!));
    const open = t.closest<HTMLElement>("[data-open]");
    if (open) opts.openReference(open.dataset.open!);
  };
}
