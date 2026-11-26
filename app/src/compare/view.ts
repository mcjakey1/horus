// Compare (SPEC §6.5; Plan 4 Task 7): two references side by side, A on the left and B on the
// right, with what they share in the middle and what each has alone under it. A modal dialog,
// like the lightbox. The score comes from `scorePair` only: a link shows ("Linked by you") but
// never changes it. Keys: v value view, x swap, L lightbox on the side under the pointer, Esc closes.
// Esc never navigates: from the Reference view it only closes and gives focus back to the opener
// (the view underneath keeps its filter and pins); a caller's onClose (the Galaxy's) goes back.
import type { Api, Reference, Scored, Tag } from "../api";
import { esc } from "../esc";
import { openLightboxWithPicker } from "../lightbox/dock";
import { mountLinkEditor } from "../links/editor";
import { opInk, opLabel } from "../ops";
import { type Box, tileBox } from "../reference/tile";
import type { Store } from "../store";
import { sides } from "./sides";

const TILE = 420; // the N5 tile each plate letterboxes into (px)
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [href], [tabindex]";
const aspect = (r: Reference) => (r.width && r.height ? r.width / r.height : 3 / 4);
/** In % of the tile, so a tile narrower than TILE px (a narrow window) scales its plate too (I5). */
const place = (el: HTMLElement, b: Box) => {
  for (const k of ["left", "top", "width", "height"] as const) el.style.setProperty(k, `${(b[k] / TILE) * 100}%`);
};

export function mountCompare(
  root: HTMLElement,
  api: Api,
  store: Store,
  a: string,
  b: string,
  deps: { onClose?(a: string): void } = {},
): { swap(): void; close(): void } {
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const life = new AbortController();
  const signal = life.signal;
  let [A, B] = [a, b];
  let scored: Scored | null = null;
  let pending = true; // a scorePair request is out: the lists use the local intersection meanwhile
  let req = 0; // the latest request wins
  let value = document.body.classList.contains("value"); // starts as the artist was looking (M7)
  let pointerSide: "a" | "b" = "a";
  let closed = false;
  let lightbox: { close(): void } | null = null;
  let editor: { close(): void } | null = null;

  const el = document.createElement("div");
  el.className = "compare";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.tabIndex = -1;
  el.innerHTML = `<div class="cmp-body"></div><div class="cmp-dock"></div>`;
  const body = el.querySelector<HTMLElement>(".cmp-body")!;
  const dock = el.querySelector<HTMLElement>(".cmp-dock")!;

  const ref = (id: string) => store.refs.get(id);
  const techName = (id: string) => store.tax.techniques.find((t) => t.id === id)?.name ?? id;
  /** The operation a technique sits under on these two references (A's tags first). */
  const opOf = (tech: string) => [ref(A), ref(B)].flatMap((r) => r?.tags ?? []).find((t) => t.techniqueId === tech)?.operationId ?? "";
  const techItem = (tech: string) =>
    `<li data-tech="${esc(tech)}" data-op="${esc(opOf(tech))}"><span class="text">${esc(opLabel(store.tax, opOf(tech)).plain)}</span> › ${esc(techName(tech))}</li>`;
  const opItem = (op: string) => `<li data-op="${esc(op)}"><span class="text">${esc(opLabel(store.tax, op).plain)}</span></li>`;
  const branchItem = (id: string) => {
    const br = store.tax.branches.find((x) => x.id === id);
    const dom = store.tax.domains.find((d) => d.id === br?.domainId)?.name ?? br?.domainId ?? id;
    return `<li data-op="${esc(br?.operationId ?? "")}"><span class="text">${esc(opLabel(store.tax, br?.operationId ?? "").plain)}</span> × ${esc(dom)}</li>`;
  };

  function render() {
    const ra = ref(A), rb = ref(B);
    if (!ra || !rb) return close(); // one of them was deleted
    // scorePair's list once it has answered for the current tags; until then (or after a refusal)
    // the local intersection, so a technique never vanishes from both sides (review I1).
    const techs = (r: Reference) => new Set(r.tags.flatMap((t) => (t.techniqueId ? [t.techniqueId] : [])));
    const tb = techs(rb);
    const shared = !pending && scored ? scored.sharedTechniques : [...techs(ra)].filter((t) => tb.has(t));
    const s = sides(ra, rb, shared, store.tax);
    const sharedSet = new Set(shared);
    // Branches both use, where no shared technique already says so.
    const onShared = (br: string) => [ra, rb].some((r) => r.tags.some((t) => t.branchId === br && t.techniqueId && sharedSet.has(t.techniqueId)));
    const branches = (scored?.sharedBranches ?? []).filter((br) => !onShared(br));
    const link = store.links.find((l) => (l.fromRef === A && l.toRef === B) || (l.fromRef === B && l.toRef === A));
    const score = scored === null ? "" : scored.score > 0 ? `${scored.score.toFixed(2)} · related by technique` : "not related by technique";
    const side = (key: "a" | "b", r: Reference, only: string[], partial: string[]) => `
      <section class="cmp-side" data-side="${key}">
        <h2 class="cmp-title">${esc(r.title)}</h2>
        <div class="cmp-tile${value ? " is-value" : ""}"><span class="cmp-plate"><img alt="${esc(r.title)}" src="${esc(api.assetUrl(r.thumb1024))}" draggable="false"></span><span class="cmp-out" hidden></span></div>
        <h3 class="cmp-h">Only here</h3><ul class="cmp-only">${only.map(techItem).join("")}</ul>
        ${partial.length ? `<h3 class="cmp-h">Operation only</h3><ul class="cmp-partial">${partial.map(opItem).join("")}</ul>` : ""}
      </section>`;
    // Only the rewritten part counts: focus in the docked link editor stays where it is (I3).
    const inside = body.contains(document.activeElement);
    el.setAttribute("aria-label", `Compare ${ra.title} and ${rb.title}`); // follows a swap (I4)
    body.innerHTML = `
      <header class="cmp-top">
        <p class="cmp-link"${link ? "" : " hidden"}>${link ? `Linked by you: “${esc(link.why)}”` : ""}</p>
        <p class="cmp-score">${score}</p>
        <button type="button" class="text-btn cmp-link-btn">${link ? "Edit link" : "Link these two"}</button>
        <button type="button" class="text-btn cmp-close">Close</button>
      </header>
      <div class="cmp-grid">
        ${side("a", ra, s.onlyA, s.partialA)}
        <section class="cmp-mid">
          <h3 class="cmp-h">Shared</h3><ul class="cmp-shared">${s.shared.map(techItem).join("")}</ul>
          <h3 class="cmp-h">Same operation × domain</h3><ul class="cmp-branches">${branches.map(branchItem).join("")}</ul>
        </section>
        ${side("b", rb, s.onlyB, s.partialB)}
      </div>`;
    // Plates and inks through the CSSOM: no inline style= (R26).
    for (const [key, r] of [["a", ra], ["b", rb]] as const) place(body.querySelector<HTMLElement>(`[data-side="${key}"] .cmp-plate`)!, tileBox(aspect(r), TILE).plate);
    body.querySelectorAll<HTMLElement>("li[data-op]").forEach((li) => li.style.setProperty("--t", opInk(store.tax, li.dataset.op!).text));
    if (inside) el.focus(); // the focused control was rewritten: keep the keys in the dialog
  }

  /** Outlines `tech`'s region on whichever image carries it as a region tag (ruling a1). */
  function outline(tech: string | null) {
    for (const [key, id] of [["a", A], ["b", B]] as const) {
      const out = body.querySelector<HTMLElement>(`[data-side="${key}"] .cmp-out`);
      const r = ref(id);
      if (!out || !r) continue;
      const t: Tag | undefined = tech ? r.tags.find((x) => x.techniqueId === tech && x.region) : undefined;
      out.hidden = !t;
      if (!t) continue;
      place(out, tileBox(aspect(r), TILE, t.region).outline!);
      out.style.setProperty("--c", opInk(store.tax, t.operationId).base);
    }
  }

  /** Asks for the score of the current tags; a store change asks again (the IDF is library-wide). */
  function rescore() {
    const n = ++req;
    pending = true;
    api.scorePair(A, B).then(
      (s) => {
        if (closed || n !== req) return; // closed, or a newer request is out
        scored = s;
        pending = false;
        render();
      },
      () => {
        if (closed || n !== req) return;
        scored = null; // no score (a hidden reference): the local intersection stands
        pending = false;
        render();
      },
    );
  }

  /** The score is symmetric, so a swap asks nothing. The Reference view's focus does not follow a
   * swap: Compare is a modal over it, and closing leaves the view as it was (review I2). */
  function swap() {
    [A, B] = [B, A];
    render();
  }
  function openLb() {
    if (lightbox || document.querySelector(".lightbox")) return;
    lightbox = openLightboxWithPicker(api, store, pointerSide === "a" ? A : B, {
      onClose: () => {
        lightbox = null;
        if (!closed) el.focus();
      },
    });
  }
  function openLinkEditor() {
    editor?.close();
    const link = store.links.find((l) => (l.fromRef === A && l.toRef === B) || (l.fromRef === B && l.toRef === A));
    editor = mountLinkEditor(dock, api, store, { fromRef: A, toRef: B, ...(link ? { linkId: link.id } : {}) });
  }
  /** Esc or Close: close, then the caller's onClose if it gave one (the Galaxy's goes back to it). */
  function exit() {
    const back = A;
    close();
    deps.onClose?.(back);
  }

  function trap(e: KeyboardEvent) {
    const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.getAttribute("tabindex") !== "-1" && !x.closest("[hidden]"));
    if (!f.length) return;
    const t = document.activeElement, first = f[0], last = f[f.length - 1];
    if (!el.contains(t) || t === el || t === (e.shiftKey ? first : last)) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }
  el.addEventListener("keydown", (e) => {
    if (e.isComposing || lightbox) return; // the lightbox over it owns the keys
    if (e.key === "Tab") return trap(e);
    if ((e.target as Element).closest(".link-editor, input, textarea, select")) return; // the editor owns its keys
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Escape") {
      // exit() removes the dialog mid-delivery: stop the key here, or the Reference view's document
      // Esc (no longer seeing .compare) would clear the artist's pin (re-review I2).
      e.preventDefault();
      e.stopPropagation();
      return exit();
    }
    if (e.key === "v") {
      value = !value;
      body.querySelectorAll(".cmp-tile").forEach((t) => t.classList.toggle("is-value", value));
    } else if (e.key === "x") swap();
    else if (e.key === "l" || e.key === "L") openLb();
  }, { signal });
  el.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest(".cmp-close")) exit();
    else if (t.closest(".cmp-link-btn")) openLinkEditor();
  }, { signal });
  el.addEventListener("mouseover", (e) => {
    const side = (e.target as Element).closest<HTMLElement>(".cmp-side")?.dataset.side;
    if (side === "a" || side === "b") pointerSide = side;
    outline((e.target as Element).closest<HTMLElement>("li[data-tech]")?.dataset.tech ?? null);
  }, { signal });
  el.addEventListener("mouseleave", () => outline(null), { signal });
  // Focus stays in the dialog, unless a dialog raised over it (the lightbox, a notice) has it.
  // A key aimed outside the dialog (focus fell to <body>, e.g. after a notice's Dismiss or the
  // editor's save) is stopped and re-sent from the dialog, so Esc, v, x and Ctrl+Z still act, once (I3).
  document.addEventListener("keydown", (e) => {
    const t = e.target as Element;
    if (closed || !el.isConnected || lightbox || e.isComposing || el.contains(t) || t?.closest?.('.lightbox, [role="alertdialog"], .notice')) return;
    e.stopPropagation();
    e.preventDefault();
    el.focus();
    if (e.key !== "Tab") el.dispatchEvent(new KeyboardEvent("keydown", e));
  }, { capture: true, signal });
  document.addEventListener("focusin", (e) => {
    const t = e.target as Element;
    if (!el.contains(t) && !t.closest?.('.lightbox, [role="alertdialog"], .notice')) el.focus();
  }, { signal });

  const unsubscribe = store.subscribe((c) => {
    if (c.reset) return close();
    const tags = c.references.length > 0 || c.removed.length > 0 || !!c.taxonomy;
    if (tags) pending = true; // the old reply no longer matches the tags
    render();
    if (tags && !closed) rescore();
  });

  function close() {
    if (closed) return;
    closed = true;
    life.abort();
    unsubscribe();
    lightbox?.close();
    editor?.close();
    el.remove();
    if (opener?.isConnected) opener.focus();
  }

  root.append(el);
  render();
  el.focus();
  rescore();
  return { swap, close };
}

/** The one Compare opener: a new call closes the open one first, so there is only ever one. */
export function makeOpenCompare(
  root: HTMLElement,
  api: Api,
  store: Store,
): (a: string, b: string, opts?: { onClose?(a: string): void }) => void {
  let cur: { close(): void } | null = null;
  return (a, b, opts = {}) => {
    cur?.close();
    cur = mountCompare(root, api, store, a, b, { onClose: opts.onClose });
  };
}
