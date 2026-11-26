// The graph views' docked inspector (SPEC §5): the breadcrumb on top, then the selection's
// detail. With `editable` (and `api` and `apply`), the Tree edits the taxonomy here (Task 10).
// Markup carries no style=; tile geometry and inks go through the CSSOM (Plan 6 CSP, R11).
import type { Api, Change, DomainMove, OpMove, Taxonomy } from "../api";
import type { Snapshot } from "../data";
import { esc } from "../esc";
import { MAX_OPS } from "../graph/constants";
import { buildTaxGraph, type TaxNode } from "../graph/taxgraph";
import { EXTRA_INKS, opInk, opLabel, SEED_INK } from "../ops";
import { tileBox, type Box } from "../reference/tile";
import { branchLabel, confirmDelete, openMoveBranches, openMoveTags, READ_ONLY, refsUsing, Said, sayError } from "./move-tags";
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
const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
/** A resolved ink (opInk's `base`) by name, for the swatches' labels. */
const INK_NAME: Record<string, string> = {
  "var(--diff)": "Amber", "var(--group)": "Green", "var(--seq)": "Blue", "var(--infer)": "Vermilion",
  ...Object.fromEntries(EXTRA_INKS.map((k) => [`var(--x-${k})`, cap(k)])),
};
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

// Per-inspector state that outlives a render (each render rebuilds the aside and its closures).
/** Edit commands run one at a time, in order; a repeat of a pending one (a double click) is dropped. */
const queues = new WeakMap<HTMLElement, { tail: Promise<unknown>; keys: Set<string> }>();
/** The newest taxonomy, for a queued command that builds its patch when it runs. */
const latest = new WeakMap<HTMLElement, Taxonomy>();
/** A mouse button is down in the inspector: a render waits for the click, so it can't detach it. */
const pressed = new WeakSet<HTMLElement>();
const deferred = new WeakMap<HTMLElement, () => void>();
/** The innerHTML rewrite is under way: a blur or change it causes is not the artist's. */
const rewriting = new WeakSet<HTMLElement>();
const lastSel = new WeakMap<HTMLElement, string | null>();
/** The data-* attributes that name a control across renders. */
const KEYS = ["data-field", "data-edit", "data-act", "data-sel", "data-ink", "data-icon", "data-unlink", "data-link", "data-add-branch", "data-syn-add", "data-syn-del", "data-open", "data-cancel"];
function keyOf(a: Element): string | null {
  for (const k of KEYS) if (a.hasAttribute(k)) return `[${k}="${CSS.escape(a.getAttribute(k)!)}"]`;
  return null;
}

function roNote(): HTMLElement {
  const p = document.createElement("p");
  p.className = "insp-ro";
  p.setAttribute("role", "status");
  p.textContent = READ_ONLY;
  return p;
}

export function renderInspector(el: HTMLElement, s: Snapshot, sel: Selection, opts: InspectorOpts): void {
  latest.set(el, s.tax);
  if (pressed.has(el)) return void deferred.set(el, () => renderInspector(el, s, sel, opts));
  deferred.delete(el);
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
  const edit = (field: string, v: string) =>
    `<button class="insp-edit" data-edit="${field}" data-old="${esc(v)}" title="Edit">${v ? esc(v) : `<span class="insp-ph">Add ${FIELD_LABEL[field].toLowerCase()}</span>`}</button>`;
  const area = (label: string, v: string) =>
    `<textarea class="insp-field insp-area" data-field="description" aria-label="${label}" rows="3">${esc(v)}</textarea>`;
  const act = (a: string, label: string, extra = "") => `<button class="text-btn insp-act" data-act="${a}"${extra}>${esc(label)}</button>`;
  const tail = `<div class="insp-slot"></div><p class="insp-msg" role="status"></p>`;
  const swatches: { ink: string; base: string }[] = [];
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
      // Every swatch's ink resolves through opInk: the current one, the seed ink back (I3, sent
      // as `color: null`) and each free extra ink, as this operation would draw with it.
      const inkAs = (color: string | null) => opInk({ ...tax, operations: [{ ...op, color }] }, op.id).base;
      const cur = opInk(tax, op.id).base;
      swatches.push({ ink: "", base: cur });
      if (Object.prototype.hasOwnProperty.call(SEED_INK, op.id) && inkAs(null) !== cur) swatches.push({ ink: "seed", base: inkAs(null) });
      for (const k of EXTRA_INKS)
        if (k !== op.color && !tax.operations.some((o) => o.id !== op.id && o.color === k)) swatches.push({ ink: k, base: inkAs(k) });
      body = `<p class="insp-plain">${edit("plainLabel", op.plainLabel)}</p><h2 class="insp-title" tabindex="-1">${edit("name", op.name)}</h2>
      ${area("Description", op.description)}
      <div class="insp-inks" role="group" aria-label="Ink">${swatches
        .map((w, i) => `<button class="insp-ink" data-ink="${w.ink}" aria-label="${INK_NAME[w.base] ?? "Neutral"}" aria-pressed="${i === 0}"></button>`)
        .join("")}</div>`;
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
        .map((x, i) => `<span class="insp-chip">${esc(x)}<button class="insp-x" data-syn-del="${i}" aria-label="Remove synonym ${esc(x)}">×</button></span>`)
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
  const active = el.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null;
  // Same selection, editing: what the artist has open survives the rewrite (T10 fix I1): the
  // slot (a form or a pick list), an open name or synonym field, and unsaved definition text.
  const same = E && lastSel.get(el) === (sel?.id ?? null);
  lastSel.set(el, sel?.id ?? null);
  const openField = same ? el.querySelector<HTMLInputElement>("input.insp-field[data-field]:not([data-saving])") : null;
  const keep = same
    ? {
        slot: el.querySelector<HTMLElement>(".insp-slot"),
        field: openField && { name: openField.dataset.field!, value: openField.value, err: errOf(openField)?.textContent ?? "" },
        area: active?.matches("textarea[data-field=description]") ? (active as HTMLTextAreaElement).value : null,
      }
    : null;
  const focusKey = same && active ? keyOf(active) : null;
  // The read-only note is kept across renders, so role="status" announces it once.
  const ro = s.taxonomyReadOnly && opts.apply ? (el.querySelector<HTMLElement>(":scope > .insp-ro") ?? roNote()) : null;
  rewriting.add(el);
  el.innerHTML = `${crumb}<div class="insp-body">${body}</div>`;
  rewriting.delete(el);
  if (ro) el.prepend(ro);
  if (active && !same) el.querySelector<HTMLElement>(".insp-title")?.focus();
  el.querySelectorAll<HTMLElement>(".insp-ink").forEach((b, i) => b.style.setProperty("--c", swatches[i].base));

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
  el.onmousedown = E
    ? () => {
        pressed.add(el);
        el.ownerDocument.addEventListener("mouseup", () => setTimeout(() => {
          pressed.delete(el);
          const later = deferred.get(el);
          deferred.delete(el);
          later?.();
        }), { once: true });
      }
    : null;
  if (!E) return;

  // ---------- Editing (Task 10) ----------
  const api = opts.api!;
  const rerender = () => renderInspector(el, s, sel, opts);
  const say = (text: string) => {
    if (opts.notice) opts.notice(`<p>${esc(text)}</p>`);
    else if (el.querySelector(".insp-msg")) el.querySelector(".insp-msg")!.textContent = text;
  };
  /**
   * Queues a command behind any in flight, applies its Change, or says why it was refused. A
   * read-only refusal reverts the UI. `key` names it: a repeat while it is pending is dropped.
   */
  const run = (key: string, call: () => Promise<Change>, fieldErr?: (msg: string) => void): Promise<boolean> => {
    const q = queues.get(el) ?? { tail: Promise.resolve(), keys: new Set<string>() };
    queues.set(el, q);
    if (q.keys.has(key)) return Promise.resolve(false);
    q.keys.add(key);
    const p = q.tail.then(call).then(
      (c) => {
        opts.apply!(c);
        if (c.madePartial) say(partialCopy(c.madePartial));
        return true;
      },
      (err) => {
        const msg = sayError(err, tax);
        if (msg === READ_ONLY) {
          say(msg);
          clearSlot();
          rerender();
        } else if (fieldErr) fieldErr(msg);
        else say(msg);
        return false;
      },
    ).finally(() => q.keys.delete(key));
    q.tail = p;
    return p;
  };
  /** The selected technique as it is now: a queued command builds its patch from this. */
  const nowTech = (id: string) => latest.get(el)!.techniques.find((x) => x.id === id);
  const clearSlot = () => el.querySelector(".insp-slot")?.replaceChildren();
  let restoring = false; // reopening what was open: nothing takes focus
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

  /** Swaps `anchor` for a text field. Enter or blur saves `save(value)` (null: nothing to save); Esc cancels. */
  function inline(anchor: HTMLElement, field: string, save: (v: string) => (() => Promise<Change>) | null, old = "") {
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
    if (!restoring) {
      input.focus();
      input.select();
    }
    let busy = false; // Enter saved or cancelled: the blur that follows does nothing
    // Cancel puts the button back in place. A full re-render here would detach whatever the
    // artist is clicking, mid-click, when the blur comes from that click.
    const cancel = (refocus: boolean) => {
      busy = true;
      input.replaceWith(anchor);
      err.remove();
      if (refocus) anchor.focus();
    };
    input.onkeydown = (e) => {
      if (e.isComposing || busy) return;
      if (e.key === "Escape") {
        e.preventDefault();
        return cancel(true);
      }
      if (e.key !== "Enter") return;
      e.preventDefault();
      commit(true);
    };
    // T10 fix I2: clicking away saves a changed value, as the definition does.
    input.onblur = () => void (busy || rewriting.has(el) || commit(false));
    function commit(enter: boolean) {
      const call = save(input.value.trim());
      if (!call) return cancel(enter);
      busy = true;
      input.dataset.saving = ""; // a re-render while it saves doesn't reopen it
      void run(`field:${field}`, call, (m) => {
        err.textContent = m;
        busy = false;
        delete input.dataset.saving;
        if (enter) input.focus();
      }).then((ok) => ok && enter && leave());
    }
  }

  function editClick(t: Element): void {
    const b = t.closest<HTMLButtonElement>("button");
    if (!b || b.disabled) return;
    const d = b.dataset;
    const techNode = node?.kind === "tech" ? node : null;
    const tech = techNode ? N.tech(techNode.techId)! : null;
    if (d.edit) {
      const old = d.old ?? "";
      const f = d.edit;
      return inline(b, f, (v) => (v === old ? null : () => update({ [f]: v })), old);
    }
    // Synonym edits build their list when they run, from the newest taxonomy, so queued ones compose.
    const syns = (f: (cur: string[]) => string[]) => () => {
      const cur = nowTech(tech!.id);
      return cur ? update({ synonyms: f(cur.synonyms) }) : Promise.reject(`unknown technique: ${tech!.id}`);
    };
    if (tech && "synAdd" in d)
      return inline(b, "synonym", (v) => (!v || tech.synonyms.includes(v) ? null : syns((cur) => (cur.includes(v) ? cur : [...cur, v]))));
    if (tech && d.synDel) {
      const word = tech.synonyms[+d.synDel];
      return void run(`syn-del:${word}`, syns((cur) => cur.filter((x) => x !== word)));
    }
    if (tech && d.unlink) {
      const br = d.unlink;
      // R20: no tag uses the pair, so nothing to move.
      if (!refsUsing(s, tech.id, br)) return void run(`unlink:${br}`, () => api.unlinkTechnique(tech.id, br, undefined));
      return void openMoveTags(dialogHost(), { s, techId: tech.id, branchId: br }).then((m) => m && run(`unlink:${br}`, () => api.unlinkTechnique(tech.id, br, m)));
    }
    if (tech && d.link) {
      const br = d.link;
      return void run(`link:${br}`, () => api.linkTechnique(tech.id, br)).then((ok) => ok && clearSlot());
    }
    if (d.ink && node?.kind === "op") {
      const ink = d.ink;
      return void run(`ink:${ink}`, () => api.updateOperation(node.opId, { color: ink === "seed" ? null : ink }));
    }
    if (d.icon && node?.kind === "branch" && d.icon !== N.domain(node.domainId)?.icon) {
      const icon = d.icon;
      return void run(`icon:${icon}`, () => api.updateDomain(node.domainId, { icon }));
    }
    if (d.addBranch && node?.kind === "op") {
      const dom = d.addBranch;
      return void run(`branch:${dom}`, () => api.addBranch(node.opId, dom)).then((ok) => ok && clearSlot());
    }
    if ("cancel" in d) return slot().replaceChildren();
    const pickList = (label: string, items: string) => {
      slot().dataset.slot = d.act;
      slot().innerHTML = `<div class="insp-list insp-pick" role="group" aria-label="${label}">${items}<button class="text-btn" data-cancel>Cancel</button></div>`;
      if (!restoring) slot().querySelector<HTMLElement>("button")!.focus();
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
        if (refsUsing(s, tech!.id)) return void openMoveTags(dialogHost(), { s, techId: tech!.id }).then((m) => m && run("del", () => api.deleteTechnique(tech!.id, m)));
        return void confirmDelete(dialogHost(), `Delete ${tech!.name}?`, "Delete technique").then((yes) => yes && run("del", () => api.deleteTechnique(tech!.id, undefined)));
      case "del-op":
        return void openMoveBranches(dialogHost(), { s, kind: "op", id: target!.id }).then((m) => m && run("del", () => api.deleteOperation(target!.id, m as OpMove)));
      case "del-domain":
        return void openMoveBranches(dialogHost(), { s, kind: "domain", id: target!.id }).then((m) => m && run("del", () => api.deleteDomain(target!.id, m as DomainMove)));
      case "add-tech":
        // The form's api applies its Change; one argument (C17).
        slot().dataset.slot = "form";
        return mountTechniqueForm(slot(), {
          ...api,
          addTechnique: (x) => api.addTechnique(x).then((c) => (opts.apply!(c), c), (err) => {
            const msg = sayError(err, tax);
            if (msg === READ_ONLY) {
              say(msg);
              clearSlot();
              rerender();
            }
            throw new Said(msg); // the form shows it as is, names resolved
          }),
        }, (node as { branchId: string }).branchId);
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
    slot().dataset.slot = "form";
    slot().innerHTML = `<form class="insp-form" data-form="${kind}" novalidate>${fields
      .map(([n, l]) => `<label>${l} <input name="${n}" autocomplete="off"></label>`)
      .join("")}<p class="insp-err" role="alert"></p><div class="tx-actions"><button class="fr-btn">${ok}</button><button type="button" class="text-btn" data-cancel>Cancel</button></div></form>`;
    if (!restoring) slot().querySelector<HTMLInputElement>("input")!.focus();
  }
  let submitting = false;
  el.onsubmit = (e) => {
    const f = (e.target as Element).closest<HTMLFormElement>("form[data-form]");
    if (!f) return; // the technique form handles its own
    e.preventDefault();
    if (submitting) return;
    const v = (n: string) => f.querySelector<HTMLInputElement>(`[name="${n}"]`)?.value.trim() ?? "";
    submitting = true;
    const p = () => f.dataset.form === "op"
      ? api.addOperation(v("name"), v("plainLabel"), v("description")) // no color: the first free ink
      : api.addDomain(v("name"), v("description"), undefined, target!.id); // one call, one undo step
    void run(`form:${f.dataset.form}`, p, (m) => void (f.querySelector(".insp-err")!.textContent = m))
      .then((ok) => ok && clearSlot())
      .finally(() => (submitting = false));
  };
  // A textarea's change fires on blur, and only when the text changed.
  el.onchange = (e) => {
    const a = e.target as HTMLTextAreaElement;
    if (!a.matches("textarea[data-field=description]") || !target || rewriting.has(el)) return;
    const old = target.kind === "tech" ? N.tech(target.id)?.description : target.kind === "domain" ? N.domain(target.id)?.description : tax.operations.find((o) => o.id === target.id)?.description;
    const v = a.value.trim();
    if (v !== (old ?? "")) void run("description", () => update({ description: v }));
  };

  // Put back what was open (same selection only), then the focus, by the control's data-* key.
  if (keep) {
    restoring = true;
    const fresh = el.querySelector<HTMLElement>(".insp-slot");
    if (keep.slot?.childElementCount && fresh) {
      const open = keep.slot.dataset.slot;
      const again = open && open !== "form" ? el.querySelector<HTMLElement>(`[data-act="${open}"]`) : null;
      if (again) editClick(again); // a pick list is rebuilt from the new data
      else if (open === "form") fresh.replaceWith(keep.slot); // a form keeps its nodes, listeners and text
    }
    if (keep.field) {
      const anchor = el.querySelector<HTMLElement>(keep.field.name === "synonym" ? "[data-syn-add]" : `.insp-edit[data-edit="${keep.field.name}"]`);
      if (anchor) {
        editClick(anchor);
        const input = el.querySelector<HTMLInputElement>(`input[data-field="${keep.field.name}"]`)!;
        input.value = keep.field.value;
        const err = errOf(input);
        if (err) err.textContent = keep.field.err;
      }
    }
    if (keep.area !== null) {
      const a = el.querySelector<HTMLTextAreaElement>("textarea[data-field=description]");
      if (a) a.value = keep.area;
    }
    restoring = false;
  }
  if (active && same) {
    const back = (active.isConnected && el.contains(active) ? active : null) ?? (focusKey ? el.querySelector<HTMLElement>(focusKey) : null);
    (back ?? el.querySelector<HTMLElement>(".insp-title"))?.focus();
  }
}

/** An inline field's error line: after its title or plain-label line, else right after it. */
function errOf(input: HTMLElement): Element | null {
  const host = input.parentElement?.matches(".insp-title, .insp-plain") ? input.parentElement : input;
  return host.nextElementSibling?.matches(".insp-err") ? host.nextElementSibling : null;
}
