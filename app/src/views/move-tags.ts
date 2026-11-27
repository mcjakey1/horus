// Task 10's taxonomy-edit dialogs (where the tags of a removed technique, link, operation or
// domain go) and the readable copy for the edit commands' errors. A dialog is a role="alertdialog"
// sheet, so Ctrl+Z stands down behind it (keys.ts); no option is pre-selected.
import type { DomainMove, OpMove, TagMove, Tag, Taxonomy } from "../api";
import type { Snapshot } from "../data";
import { esc } from "../esc";
import { holdModal } from "../modal";
import { opLabel } from "../ops";

/** Plan 2's copy for the seed fallback after a damaged taxonomy.json. */
export const READ_ONLY = "The technique list is read-only because taxonomy.json is damaged.";

const FIXED: Record<string, string> = {
  TaxonomyReadOnly: READ_ONLY,
  EmptyName: "A name can't be empty.",
  BadMoveTarget: "That place can't take these tags. Choose another.",
  NeedsMove: "References still use this. Choose where their tags go.",
  LastLink: "A technique needs at least one place. Delete it instead.",
  LastOperation: "Horus needs at least one operation.",
  TooManyOperations: "Up to 9 operations.",
  UnknownInk: "That ink isn't available.",
  UnknownIcon: "That icon isn't available.",
  // Plan 6 D6: Rust's own copy for a tag that is already gone; shown as it is.
  "That tag is no longer on this reference. Nothing changed.": "That tag is no longer on this reference. Nothing changed.",
};

/** A refusal already put into words (a caller without the taxonomy shows its message as is). */
export class Said extends Error {}

/** An edit command's error string as a sentence for the artist; the raw text is never shown. */
export function sayError(err: unknown, tax?: Taxonomy): string {
  if (err instanceof Said) return err.message;
  const raw = typeof err === "string" ? err : "";
  if (FIXED[raw]) return FIXED[raw];
  const named = (id: string) =>
    tax?.techniques.find((x) => x.id === id)?.name ?? tax?.domains.find((x) => x.id === id)?.name ?? tax?.operations.find((x) => x.id === id)?.name;
  let m = /^(Name|Label)Taken:(.+)$/.exec(raw);
  if (m) {
    const n = named(m[2]);
    return `That ${m[1] === "Name" ? "name" : "plain label"} is taken${n ? ` by ${n}` : ""}.`;
  }
  m = /^unknown (operation|domain|branch|technique|reference|tag):/.exec(raw);
  if (m) return `That ${m[1]} no longer exists.`;
  m = /^still in use: (.+)$/.exec(raw);
  if (m) {
    // O3 is about an operation or domain move that a tag pointing at a missing place blocked;
    // anything else still in use is said plainly (D12 M2).
    const place = tax?.operations.some((x) => x.id === m![1]) || tax?.domains.some((x) => x.id === m![1]);
    if (place)
      return `Horus couldn't move every tag off ${named(m[1]) ?? "it"}: some point at a technique or domain that no longer exists. Retag those references, or delete them with their tags.`;
    return `${named(m[1]) ?? "It"} is still in use. Move or remove its tags first.`;
  }
  return "That change didn't save. Try again.";
}

export const branchLabel = (tax: Taxonomy, id: string) => {
  const b = tax.branches.find((x) => x.id === id);
  return b ? `${opLabel(tax, b.operationId).name} · ${tax.domains.find((d) => d.id === b.domainId)?.name ?? b.domainId}` : id;
};
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Tags matching `hit`, and the references that hold them. */
function using(s: Snapshot, hit: (t: Tag) => boolean) {
  let tags = 0;
  let refs = 0;
  for (const r of s.refs.values()) {
    const n = r.tags.filter(hit).length;
    tags += n;
    if (n) refs++;
  }
  return { tags, refs };
}
/** References whose tags use technique `techId` (under `branchId`, if given). */
export const refsUsing = (s: Snapshot, techId: string, branchId?: string) =>
  using(s, (t) => t.techniqueId === techId && (!branchId || t.branchId === branchId)).refs;

let seq = 0;
/** A modal sheet. With `options`, resolves the chosen radio's value; without, "ok". Null = cancelled. */
function sheet(host: HTMLElement, p: { title: string; options?: { value: string; label: string; list?: boolean }[]; ok: string; search?: boolean }): Promise<string | null> {
  const id = `tx-${++seq}`;
  const opener = document.activeElement as HTMLElement | null;
  const radio = (o: { value: string; label: string }) =>
    `<label><input type="radio" name="${id}" value="${esc(o.value)}"> ${esc(o.label)}</label>`;
  const listed = (p.options ?? []).filter((o) => o.list);
  const rest = (p.options ?? []).filter((o) => !o.list);
  const d = document.createElement("div");
  d.className = "tx-dialog";
  d.setAttribute("role", "alertdialog");
  d.setAttribute("aria-modal", "true");
  d.setAttribute("aria-labelledby", `${id}-t`);
  d.innerHTML = `<div class="tx-sheet"><h2 class="tx-title" id="${id}-t">${esc(p.title)}</h2>${
    listed.length
      ? `<p class="tx-h">Move them to…</p>${p.search ? `<input type="search" class="tx-search" aria-label="Search places">` : ""}<ul class="tx-list">${listed.map((o) => `<li>${radio(o)}</li>`).join("")}</ul>`
      : ""
  }${rest.map((o) => `<div class="tx-opt">${radio(o)}</div>`).join("")}<div class="tx-actions"><button type="button" class="fr-btn tx-ok"${p.options ? " disabled" : ""}>${esc(p.ok)}</button><button type="button" class="text-btn tx-cancel">Cancel</button></div></div>`;
  host.append(d);
  const okBtn = d.querySelector<HTMLButtonElement>(".tx-ok")!;
  (d.querySelector<HTMLElement>(".tx-search, input[type=radio]") ?? okBtn).focus();
  return new Promise((resolve) => {
    // Settings' hold (D8): inert around it, Tab wraps, and a key that fell to <body> comes back.
    const release = holdModal(d, () => close(null));
    const close = (v: string | null) => {
      release();
      d.remove();
      if (opener?.isConnected) opener.focus();
      resolve(v);
    };
    const sync = () => (okBtn.disabled = !d.querySelector("input[type=radio]:checked"));
    d.addEventListener("change", sync);
    d.addEventListener("input", (e) => {
      const q = (e.target as HTMLInputElement).matches(".tx-search") ? (e.target as HTMLInputElement).value.trim().toLowerCase() : null;
      if (q === null) return;
      d.querySelectorAll<HTMLElement>(".tx-list li").forEach((li) => {
        li.hidden = !li.textContent!.toLowerCase().includes(q);
        const r = li.querySelector("input")!;
        if (li.hidden) r.checked = false; // a hidden choice is never the one confirmed
      });
      sync();
    });
    d.addEventListener("keydown", (e) => {
      // D8: Ctrl/Cmd+Z in the empty search would run WebView2's own undo, refill the field and
      // move focus out of the dialog; with a typed query it is the field's undo.
      const t = e.target as HTMLInputElement;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && t.matches?.(".tx-search") && !t.value) return void e.preventDefault();
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      close(null);
    });
    okBtn.addEventListener("click", () => close(p.options ? d.querySelector<HTMLInputElement>("input[type=radio]:checked")!.value : "ok"));
    d.querySelector(".tx-cancel")!.addEventListener("click", () => close(null));
  });
}

/** "Delete <name>?" for something nothing uses. */
export const confirmDelete = (host: HTMLElement, title: string, ok: string) => sheet(host, { title, ok }).then((v) => v !== null);

export function openMoveTags(host: HTMLElement, ctx: { s: Snapshot; techId: string; branchId?: string /* unlink */ }): Promise<TagMove | null> {
  const { tax } = ctx.s;
  const name = tax.techniques.find((t) => t.id === ctx.techId)?.name ?? ctx.techId;
  const n = refsUsing(ctx.s, ctx.techId, ctx.branchId);
  const title = `${plural(n, "reference uses", "references use")} ${name}${ctx.branchId ? ` under ${branchLabel(tax, ctx.branchId)}` : ""}`;
  const targets = tax.branchTechniques
    .filter((l) => (ctx.branchId ? !(l.techniqueId === ctx.techId && l.branchId === ctx.branchId) : l.techniqueId !== ctx.techId))
    .map((l) => ({
      value: `${l.techniqueId}|${l.branchId}`,
      label: `${tax.techniques.find((t) => t.id === l.techniqueId)?.name ?? l.techniqueId} — ${branchLabel(tax, l.branchId)}`,
      list: true,
    }));
  return sheet(host, {
    title,
    options: [...targets, { value: "partial", label: "Keep them as partial tags (operation only)" }],
    ok: ctx.branchId ? "Move and unlink" : "Move and delete",
    search: true,
  }).then((v) => {
    if (v === null) return null;
    if (v === "partial") return { kind: "partial" };
    const [techniqueId, branchId] = v.split("|");
    return { kind: "technique", techniqueId, branchId };
  });
}

export function openMoveBranches(host: HTMLElement, ctx: { s: Snapshot; kind: "op" | "domain"; id: string }): Promise<OpMove | DomainMove | null> {
  const { tax } = ctx.s;
  const op = ctx.kind === "op";
  const gone = new Set(tax.branches.filter((b) => (op ? b.operationId : b.domainId) === ctx.id).map((b) => b.id));
  const { tags, refs } = using(ctx.s, (t) => (op ? t.operationId === ctx.id : !!t.branchId && gone.has(t.branchId)));
  const left = new Set(tax.branchTechniques.filter((l) => gone.has(l.branchId)).map((l) => l.techniqueId));
  for (const l of tax.branchTechniques) if (!gone.has(l.branchId)) left.delete(l.techniqueId);
  const counts = `${plural(tags, "tag", "tags")} on ${plural(refs, "reference", "references")}, ${plural(left.size, "technique", "techniques")} left with no other place`;
  const others = op
    ? tax.operations.filter((o) => o.id !== ctx.id).map((o) => ({ value: o.id, label: `Move its branches and tags to ${o.plainLabel || o.name}` }))
    : tax.domains.filter((d) => d.id !== ctx.id).map((d) => ({ value: d.id, label: `Move to ${d.name}` }));
  const name = op ? opLabel(tax, ctx.id).name : (tax.domains.find((d) => d.id === ctx.id)?.name ?? ctx.id);
  return sheet(host, {
    title: `Delete ${name}?`,
    options: [...others, { value: "delete", label: op ? `Delete them and their tags: ${counts}` : `Delete; tags become partial: ${counts}` }],
    ok: op ? "Delete operation" : "Delete domain",
  }).then((v) => {
    if (v === null) return null;
    if (v === "delete") return { kind: "delete" };
    return op ? { kind: "operation", operationId: v } : { kind: "domain", domainId: v };
  });
}
