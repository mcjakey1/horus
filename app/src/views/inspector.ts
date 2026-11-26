// The graph views' docked inspector (SPEC §5): the breadcrumb on top, then the selection's
// detail. With `editable` (and `api` and `apply`), the Tree edits the taxonomy here (Task 10).
// Markup carries no style=; tile geometry and inks go through the CSSOM or CSS attribute
// selectors (Plan 6 CSP, R11).
import type { Api, Change, DomainMove, OpMove, Taxonomy } from "../api";
import type { Snapshot } from "../data";
import { esc } from "../esc";
import { MAX_OPS } from "../graph/constants";
import { buildTaxGraph, type TaxNode } from "../graph/taxgraph";
import { EXTRA_INKS, opInk, opLabel, SEED_INK } from "../ops";
import { tileBox, type Box } from "../reference/tile";
import { branchLabel, confirmDelete, openMoveBranches, openMoveTags, READ_ONLY, refsUsing, sayError } from "./move-tags";
import { mountTechniqueForm } from "./technique-form";

export { READ_ONLY, sayError } from "./move-tags";

export type Selection = { kind: "op" | "branch" | "tech" | "ref"; id: string } | null;
export type InspectorOpts = {
  editable: boolean;
  openReference(id: string): void;
  select(sel: Selection): void;
  /** Additive to the brief (Task 6): `api.assetUrl`, for the tiles' thumbnails. Without it a tile shows no image. */
  assetUrl?(path: string): string;
  /** Task 10: the edit commands. With `editable: false` these are never read. */
  api?: Api;
  /** Task 10: every successful edit's Change goes here (store.apply). */
  apply?(c: Change): void;
  /** Task 10, additive: where refusals and the "made partial" count are said (boot's notice). */
  notice?(html: string): void;
  /** Task 10, additive: after Enter saves a field, focus goes back to the canvas (C19). */
  focusCanvas?(): void;
};

/** Mirrors commands.rs DOMAIN_ICONS (C8); shown as their descriptions until Plan 6 draws them. */
export const DOMAIN_ICONS = [
  "a short strip of three swatches, dark to light",
  "three short bars tied together by one bracket",
  "a horizon line with two lines running to a vanishing point",
  "a simple head in profile",
  "an empty speech bubble",
  "a classical column",
  "a plain square",
  "a dot inside a ring",
];
const SEED_INK_NAME: Record<string, string> = { diff: "Amber", group: "Green", seq: "Blue", infer: "Vermilion" };
const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
const FIELD_LABEL: Record<string, string> = { name: "Name", plainLabel: "Plain label", synonym: "New synonym" };
const partialCopy = (n: number) =>
  n === 1
    ? "1 tag pointed at a technique or domain that no longer exists, and is now a partial tag (operation only). Ctrl+Z puts it back."
    : `${n} tags pointed at a technique or domain that no longer exists, and are now partial tags (operation only). Ctrl+Z puts them back.`;

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
  return { domain, branch, tech, branchLabel: (id: string) => branchLabel(tax, id) };
}

function roNote(): HTMLElement {
  const p = document.createElement("p");
  p.className = "insp-ro";
  p.setAttribute("role", "status");
  p.textContent = READ_ONLY;
  return p;
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

  // E: the editing controls (Task 10). Without them the markup is exactly Task 6's.
  const E = opts.editable && !!opts.api && !!opts.apply;
  const edit = (field: string, v: string) => `<button class="insp-edit" data-edit="${field}" title="Edit">${esc(v)}</button>`;
  const area = (label: string, v: string) =>
    `<textarea class="insp-field insp-area" data-field="description" aria-label="${label}" rows="3">${esc(v)}</textarea>`;
  const act = (a: string, label: string, extra = "") => `<button class="text-btn insp-act" data-act="${a}"${extra}>${esc(label)}</button>`;
  const tail = `<div class="insp-slot"></div><p class="insp-msg" role="status"></p>`;
  let body = "";
  if (!node) {
    body = `<h2 class="insp-title" tabindex="-1">Operations</h2><div class="insp-list">${tax.operations
      .map((o) => selBtn(`op:${o.id}`, `${o.name} · ${o.plainLabel}`, (g.nodes.get(`op:${o.id}`) as { count: number }).count))
      .join("")}</div>`;
    if (E) body += act("new-op", "+ New operation…", tax.operations.length >= MAX_OPS ? ` disabled title="Up to ${MAX_OPS} operations"` : "") + tail;
  } else if (node.kind === "op") {
    const op = tax.operations.find((o) => o.id === node.opId)!;
    if (!E)
      body = `<p class="insp-plain">${esc(op.plainLabel)}</p><h2 class="insp-title" tabindex="-1">${esc(op.name)}</h2>
      <p class="insp-desc">${esc(op.description)}</p>`;
    else {
      const cur = op.color && (EXTRA_INKS as readonly string[]).includes(op.color)
        ? { sw: `x-${op.color}`, name: cap(op.color) }
        : Object.prototype.hasOwnProperty.call(SEED_INK, op.id)
          ? { sw: SEED_INK[op.id], name: SEED_INK_NAME[SEED_INK[op.id]] }
          : { sw: "neutral", name: "Neutral" };
      const free = EXTRA_INKS.filter((k) => k !== op.color && !tax.operations.some((o) => o.id !== op.id && o.color === k));
      const swatch = (ink: string, sw: string, name: string, on: boolean) =>
        `<button class="insp-ink" data-ink="${ink}" data-swatch="${sw}" aria-label="${name}" aria-pressed="${on}"></button>`;
      body = `<p class="insp-plain">${edit("plainLabel", op.plainLabel)}</p><h2 class="insp-title" tabindex="-1">${edit("name", op.name)}</h2>
      ${area("Description", op.description)}
      <div class="insp-inks" role="group" aria-label="Ink">${swatch("", cur.sw, cur.name, true)}${free.map((k) => swatch(k, `x-${k}`, cap(k), false)).join("")}</div>`;
    }
    body += `<p class="insp-count mono">${node.count} ${node.count === 1 ? "reference" : "references"}</p>
      <div class="insp-list">${(g.children.get(node.id) ?? []).map((b) => selBtn(b, N.branchLabel(b.slice(3)), (g.nodes.get(b) as { count: number }).count)).join("")}</div>`;
    if (E)
      body += act("add-dom", "+ Domain…") +
        act("del-op", "Delete operation…", tax.operations.length < 2 ? ` disabled title="Horus needs at least one operation"` : "") + tail;
  } else if (node.kind === "branch") {
    const d = N.domain(node.domainId);
    body = E
      ? `<h2 class="insp-title" tabindex="-1">${edit("name", d?.name ?? node.domainId)}</h2>${area("Description", d?.description ?? "")}
      <h3 class="insp-h">Icon</h3><div class="insp-icons" role="group" aria-label="Icon">${DOMAIN_ICONS.map(
        (i) => `<button class="insp-icon" data-icon="${esc(i)}" aria-pressed="${i === d?.icon}">${esc(i)}</button>`).join("")}</div>`
      : `<h2 class="insp-title" tabindex="-1">${esc(d?.name ?? node.domainId)}</h2><p class="insp-desc">${esc(d?.description ?? "")}</p>`;
    body += `
      <div class="insp-list">${(g.children.get(node.id) ?? [])
        .map((t) => selBtn(t, N.tech(t.slice(5))?.name ?? t, (g.nodes.get(t) as { count: number }).count))
        .join("")}</div>`;
    if (E) body += act("add-tech", "+ Technique…") + act("del-domain", "Delete domain…") + tail;
  } else if (node.kind === "tech") {
    const t = N.tech(node.techId)!;
    const tiles = (g.children.get(node.id) ?? []).map((id) => {
      const r = g.nodes.get(id) as Extract<TaxNode, { kind: "ref" }>;
      const ref = s.refs.get(r.refId)!;
      return `<button class="thumb" data-open="${esc(ref.id)}" title="${esc(ref.title)}"><span class="t"><span class="tplate">${opts.assetUrl ? `<img alt="" src="${esc(opts.assetUrl(ref.thumb256))}">` : ""}</span>${r.via.region ? `<span class="treg"></span>` : ""}</span></button>`;
    });
    const refsHTML = `<h3 class="insp-h">References ${count(node.count)}</h3>
      ${tiles.length ? `<div class="thumbs">${tiles.join("")}</div>` : `<p class="none">No reference has this technique yet.</p>`}`;
    body = E
      ? `<h2 class="insp-title" tabindex="-1">${edit("name", t.name)}</h2>${area("Definition", t.description)}
      <div class="insp-syns" role="group" aria-label="Synonyms">${t.synonyms
        .map((x, i) => `<span class="chip">${esc(x)}<button class="insp-x" data-syn-del="${i}" aria-label="Remove synonym ${esc(x)}">×</button></span>`)
        .join("")}<button class="text-btn insp-add" data-syn-add>+ synonym</button></div>
      <h3 class="insp-h">Used under</h3><div class="insp-list insp-used">${node.parents
        .map((b) => `<div class="insp-pair">${selBtn(`br:${b}`, N.branchLabel(b))}<button class="insp-x" data-unlink="${esc(b)}" aria-label="Stop using under ${esc(N.branchLabel(b))}"${
          node.parents.length < 2 ? ` disabled title="A technique needs at least one place"` : ""}>×</button></div>`)
        .join("")}</div>${act("also", "Also use under…")}
      ${refsHTML}${act("del-tech", "Delete technique…")}${tail}`
      : `<h2 class="insp-title" tabindex="-1">${esc(t.name)}</h2><p class="insp-desc">${esc(t.description)}</p>
      ${t.synonyms.length ? `<p class="insp-syn">${esc(t.synonyms.join(", "))}</p>` : ""}
      <h3 class="insp-h">Used under</h3><div class="insp-list insp-used">${node.parents.map((b) => selBtn(`br:${b}`, N.branchLabel(b))).join("")}</div>
      ${refsHTML}`;
  } else {
    const ref = s.refs.get(node.refId)!;
    body = `<h2 class="insp-title" tabindex="-1">${esc(ref.title)}</h2>
      ${ref.creator || ref.year ? `<p class="insp-desc">${esc([ref.creator, ref.year].filter(Boolean).join(", "))}</p>` : ""}
      <button class="text-btn" data-open="${esc(ref.id)}">Open in Reference view</button>`;
  }
  // Rewriting the aside destroys the focused button: keep the keyboard route inside it (I1).
  const hadFocus = el.contains(document.activeElement);
  // The read-only note is kept across renders, so role="status" announces it once.
  const ro = s.taxonomyReadOnly && opts.apply ? (el.querySelector<HTMLElement>(":scope > .insp-ro") ?? roNote()) : null;
  el.innerHTML = `${crumb}<div class="insp-body">${body}</div>`;
  if (ro) el.prepend(ro);
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
    if (open) return opts.openReference(open.dataset.open!);
    if (E) editClick(t);
  };
  el.onchange = el.onsubmit = null;
  if (!E) return;

  // ---------- Editing (Task 10) ----------
  const api = opts.api!;
  const rerender = () => renderInspector(el, s, sel, opts);
  const say = (text: string) => {
    if (opts.notice) opts.notice(`<p>${esc(text)}</p>`);
    else el.querySelector(".insp-msg")!.textContent = text;
  };
  /** Applies a command's Change, or says why it was refused. A read-only refusal reverts the UI. */
  const run = (p: Promise<Change>, fieldErr?: (msg: string) => void): Promise<boolean> =>
    p.then(
      (c) => {
        opts.apply!(c);
        if (c.madePartial) say(partialCopy(c.madePartial));
        return true;
      },
      (err) => {
        const msg = sayError(err, tax);
        if (msg === READ_ONLY) {
          say(msg);
          rerender();
        } else if (fieldErr) fieldErr(msg);
        else say(msg);
        return false;
      },
    );
  // What the name, description and icon fields edit.
  const target =
    node?.kind === "tech" ? { kind: "tech", id: node.techId } : node?.kind === "branch" ? { kind: "domain", id: node.domainId } : node?.kind === "op" ? { kind: "op", id: node.opId } : null;
  const update = (patch: Record<string, unknown>) =>
    target!.kind === "tech" ? api.updateTechnique(target!.id, patch) : target!.kind === "domain" ? api.updateDomain(target!.id, patch) : api.updateOperation(target!.id, patch);
  const slot = () => el.querySelector<HTMLElement>(".insp-slot")!;
  // Dialogs live beside the aside: a re-render would destroy them inside it.
  const dialogHost = () => el.parentElement ?? document.body;
  const leave = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    opts.focusCanvas?.();
    if (!document.activeElement || document.activeElement === document.body) el.querySelector<HTMLElement>(".insp-title")?.focus();
  };

  /** Swaps `anchor` for a text field. Enter saves `patch(value)` (null: nothing to save); Esc and blur cancel. */
  function inline(anchor: HTMLElement, field: string, patch: (v: string) => Record<string, unknown> | null, old = "") {
    const input = document.createElement("input");
    input.className = "insp-field";
    input.dataset.field = field;
    input.value = old;
    input.setAttribute("aria-label", FIELD_LABEL[field]);
    const err = document.createElement("span");
    err.className = "insp-err";
    err.setAttribute("role", "alert");
    anchor.replaceWith(input);
    (input.parentElement?.matches(".insp-title, .insp-plain") ? input.parentElement : input).after(err);
    input.focus();
    input.select();
    let busy = false; // Enter saved or cancelled: the blur that follows does nothing
    input.onkeydown = (e) => {
      if (e.isComposing || busy) return;
      if (e.key === "Escape") {
        e.preventDefault();
        busy = true;
        return rerender();
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      const p = patch(input.value.trim());
      busy = true;
      if (!p) return rerender();
      void run(update(p), (m) => {
        err.textContent = m;
        busy = false;
        input.focus();
      }).then((ok) => ok && leave());
    };
    input.onblur = () => void (busy || rerender());
  }

  function editClick(t: Element) {
    const b = t.closest<HTMLButtonElement>("button");
    if (!b || b.disabled) return;
    const d = b.dataset;
    const techNode = node?.kind === "tech" ? node : null;
    const tech = techNode ? N.tech(techNode.techId)! : null;
    if (d.edit) {
      const old = b.textContent!;
      return inline(b, d.edit, (v) => (v === old ? null : { [d.edit!]: v }), old);
    }
    if (tech && "synAdd" in d) return inline(b, "synonym", (v) => (!v || tech.synonyms.includes(v) ? null : { synonyms: [...tech.synonyms, v] }));
    if (tech && d.synDel) return void run(update({ synonyms: tech.synonyms.filter((_, i) => i !== +d.synDel!) }));
    if (tech && d.unlink) {
      const br = d.unlink;
      // R20: no tag uses the pair, so nothing to move.
      if (!refsUsing(s, tech.id, br)) return void run(api.unlinkTechnique(tech.id, br, undefined));
      return void openMoveTags(dialogHost(), { s, techId: tech.id, branchId: br }).then((m) => m && run(api.unlinkTechnique(tech.id, br, m)));
    }
    if (tech && d.link) return void run(api.linkTechnique(tech.id, d.link));
    if (d.ink && node?.kind === "op") return void run(api.updateOperation(node.opId, { color: d.ink }));
    if (d.icon && node?.kind === "branch" && d.icon !== N.domain(node.domainId)?.icon) return void run(api.updateDomain(node.domainId, { icon: d.icon }));
    if (d.addBranch && node?.kind === "op") return void run(api.addBranch(node.opId, d.addBranch));
    if ("cancel" in d) return slot().replaceChildren();
    const pickList = (label: string, items: string) => {
      slot().innerHTML = `<div class="insp-list insp-pick" role="group" aria-label="${label}">${items}<button class="text-btn" data-cancel>Cancel</button></div>`;
      slot().querySelector<HTMLElement>("button")!.focus();
    };
    switch (d.act) {
      case "also": {
        // Keyboard route for drag to link; a second domain under the same operation is offered too (ae N3).
        const linked = new Set(techNode!.parents);
        return pickList("Also use under", tax.branches
          .filter((x) => !linked.has(x.id))
          .map((x) => `<button class="insp-sel" data-link="${esc(x.id)}"><span>${esc(N.branchLabel(x.id))}</span></button>`)
          .join(""));
      }
      case "del-tech":
        if (refsUsing(s, tech!.id)) return void openMoveTags(dialogHost(), { s, techId: tech!.id }).then((m) => m && run(api.deleteTechnique(tech!.id, m)));
        return void confirmDelete(dialogHost(), `Delete ${tech!.name}?`, "Delete technique").then((yes) => yes && run(api.deleteTechnique(tech!.id, undefined)));
      case "del-op":
        return void openMoveBranches(dialogHost(), { s, kind: "op", id: target!.id }).then((m) => m && run(api.deleteOperation(target!.id, m as OpMove)));
      case "del-domain":
        return void openMoveBranches(dialogHost(), { s, kind: "domain", id: target!.id }).then((m) => m && run(api.deleteDomain(target!.id, m as DomainMove)));
      case "add-tech":
        // The form's api applies its Change; one argument (C17).
        return mountTechniqueForm(slot(), { ...api, addTechnique: (x) => api.addTechnique(x).then((c) => (opts.apply!(c), c)) }, (node as { branchId: string }).branchId);
      case "add-dom": {
        const used = new Set(tax.branches.filter((x) => x.operationId === target!.id).map((x) => x.domainId));
        return pickList("Add a domain", tax.domains
          .filter((x) => !used.has(x.id))
          .map((x) => `<button class="insp-sel" data-add-branch="${esc(x.id)}"><span>${esc(x.name)}</span></button>`)
          .join("") + `<button class="text-btn" data-act="new-dom">New domain type…</button>`);
      }
      case "new-dom":
        return form("domain", [["name", "Name"], ["description", "Description"]], "Add domain");
      case "new-op":
        return form("op", [["name", "Name"], ["plainLabel", "Plain label"], ["description", "Description"]], "Add operation");
    }
  }

  function form(kind: "op" | "domain", fields: [string, string][], ok: string) {
    slot().innerHTML = `<form class="insp-form" data-form="${kind}" novalidate>${fields
      .map(([n, l]) => `<label>${l} <input name="${n}" autocomplete="off"></label>`)
      .join("")}<p class="insp-err" role="alert"></p><div class="tx-actions"><button class="fr-btn">${ok}</button><button type="button" class="text-btn" data-cancel>Cancel</button></div></form>`;
    slot().querySelector<HTMLInputElement>("input")!.focus();
  }
  let submitting = false;
  el.onsubmit = (e) => {
    const f = (e.target as Element).closest<HTMLFormElement>("form[data-form]");
    if (!f) return; // the technique form handles its own
    e.preventDefault();
    if (submitting) return;
    const v = (n: string) => f.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value.trim() ?? "";
    submitting = true;
    const p = f.dataset.form === "op"
      ? api.addOperation(v("name"), v("plainLabel"), v("description")) // no color: the first free ink
      : api.addDomain(v("name"), v("description"), undefined, target!.id); // one call, one undo step
    void run(p, (m) => void (f.querySelector(".insp-err")!.textContent = m)).finally(() => (submitting = false));
  };
  // A textarea's change fires on blur, and only when the text changed.
  el.onchange = (e) => {
    const a = e.target as HTMLTextAreaElement;
    if (!a.matches("textarea[data-field=description]") || !target) return;
    const old = target.kind === "tech" ? N.tech(target.id)?.description : target.kind === "domain" ? N.domain(target.id)?.description : tax.operations.find((o) => o.id === target.id)?.description;
    const v = a.value.trim();
    if (v !== (old ?? "")) void run(update({ description: v }));
  };
}
