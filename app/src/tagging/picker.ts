// The technique picker (SPEC §6.1–6.4, 6.7, 6.8): one button per operation, technique cards with
// examples, synonym search, an inferred domain, ticks for "Tag like this", inline custom
// techniques, and the reference's current tags as chips. Rust owns the data: every call returns a
// Change, which goes through the store. Sections re-render on their own, so the search keeps focus.
import type { Api, Change, DemoExample, NewTag, Region, Tag, TagFor, Technique } from "../api";
import { esc } from "../esc";
import { digitOf, isTextEntry } from "../keys";
import { opInk, opLabel } from "../ops";
import type { Store } from "../store";
import { domainChoice, examplesFor, rankByQuery, techniquesFor } from "./model";

export type PickerOpts = {
  refId: string;
  region?: Region;
  preset?: NewTag[];
  inbox?: boolean;
  onDone?: () => void;
  /** Every close (Esc, `close()`, its reference removed), once. */
  onClose?: () => void;
};

// One fetch per Api (the demo set is bundled); a refusal means no demo examples.
const demoCache = new WeakMap<Api, Promise<DemoExample[]>>();
const demoFor = (api: Api) => {
  let p = demoCache.get(api);
  if (!p) demoCache.set(api, (p = api.demoExamples().catch(() => [])));
  return p;
};
let uid = 0;

export function mountPicker(
  root: HTMLElement,
  api: Api,
  store: Store,
  opts: PickerOpts,
): { close(): void; el: HTMLElement } {
  const name = `pk${++uid}`;
  const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  const el = document.createElement("section");
  el.className = "picker";
  el.dataset.ref = opts.refId;
  el.setAttribute("aria-label", "Tag this reference");
  el.innerHTML = `
    <div class="pk-ops" role="group" aria-label="Operation"></div>
    <input class="pk-search" type="search" autocomplete="off" aria-label="Search techniques" placeholder="Search techniques — “moody”, “spotlight”…">
    <div class="pk-grid" role="listbox" aria-label="Techniques"></div>
    <div class="pk-form-slot"></div>
    <div class="pk-foot"><p class="pk-msg" role="status"></p><button type="button" class="text-btn pk-apply">Apply</button></div>
    <div class="pk-chips" role="group" aria-label="Tags on this reference"></div>`;
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const opsEl = $(".pk-ops"), search = $<HTMLInputElement>(".pk-search"), grid = $(".pk-grid");
  const slot = $(".pk-form-slot"), msg = $(".pk-msg"), chips = $(".pk-chips");

  const tax = () => store.tax;
  const hasOp = (id: string) => tax().operations.some((o) => o.id === id);
  const S = {
    op: opts.preset?.find((t) => hasOp(t.operationId))?.operationId ?? (null as string | null),
    q: "",
    hi: -1,
    nav: false, // arrows or a click chose the highlight; otherwise it follows the search
    ticks: [...(opts.preset ?? [])],
    branch: new Map<string, string>(), // technique id → the domain branch picked when asked
    form: false,
    busy: false, // an addTags or addTechnique is in flight
    demo: [] as DemoExample[],
    closed: false,
  };

  const techName = (id?: string) => (id ? (tax().techniques.find((t) => t.id === id)?.name ?? id) : "");
  const domainName = (branchId: string) => {
    const b = tax().branches.find((x) => x.id === branchId);
    return b ? (tax().domains.find((d) => d.id === b.domainId)?.name ?? b.domainId) : branchId;
  };
  const withRegion = <T extends object>(t: T): T => (opts.region ? { ...t, region: opts.region } : t);
  const visible = (): Technique[] => (S.op ? rankByQuery(techniquesFor(tax(), S.op), S.q) : []); // best match first (QA F1)
  const showNew = () => !!S.op && S.q.trim() !== "";
  const count = () => visible().length + (showNew() ? 1 : 0);
  const hiIndex = () => (S.nav ? Math.min(S.hi, count() - 1) : S.q.trim() ? 0 : -1);
  const tickOf = (techId: string) => S.ticks.findIndex((t) => t.operationId === S.op && t.techniqueId === techId);
  /** The tag a card stands for, or null while its domain still has to be picked. */
  const tagFor = (techId: string): NewTag | null => {
    const d = domainChoice(tax(), S.op!, techId);
    const branchId = "branchId" in d ? d.branchId : S.branch.get(techId);
    return branchId ? { operationId: S.op!, techniqueId: techId, branchId } : null;
  };
  const say = (text: string) => void (msg.textContent = text);

  // ---------- rendering ----------
  /** Re-render a section; if focus was inside it, put it back on the section's tab stop. */
  const keep = (section: HTMLElement, paint: () => void) => {
    const had = section.contains(document.activeElement);
    paint();
    if (had) section.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  };

  function renderOps() {
    keep(opsEl, () => {
      const list = tax().operations;
      const stop = S.op ?? list[0]?.id;
      opsEl.innerHTML = list
        .map((o, i) => {
          const l = opLabel(tax(), o.id);
          return `<button type="button" class="pk-op" data-op="${esc(o.id)}" aria-pressed="${o.id === S.op}" aria-keyshortcuts="${i + 1}" tabindex="${o.id === stop ? 0 : -1}"><span class="pk-sw" aria-hidden="true"></span><span class="serif">${esc(l.plain)}</span><span class="mono">${esc(l.name)}</span></button>`;
        })
        .join("");
      opsEl.querySelectorAll<HTMLElement>(".pk-op").forEach((b) => b.style.setProperty("--c", opInk(tax(), b.dataset.op!).base));
    });
    if (S.op) el.style.setProperty("--c", opInk(tax(), S.op).base);
    else el.style.removeProperty("--c");
  }

  function exampleHTML(t: Technique) {
    return examplesFor(store.refs.values(), t.id, 2, S.demo)
      .map((x) =>
        x.kind === "library"
          ? `<span class="pk-ex"><img src="${esc(api.assetUrl(x.ref.thumb256))}" alt="${esc(x.ref.title)}" loading="lazy"></span>`
          : `<span class="pk-ex"><img src="${esc(api.assetUrl(x.demo.path))}" alt="${esc(x.demo.title)}" loading="lazy"><span class="pk-demo mono">demo</span></span>`,
      )
      .join("");
  }

  function domainHTML(t: Technique) {
    const d = domainChoice(tax(), S.op!, t.id);
    if ("branchId" in d) return `<span class="pk-domain">${esc(domainName(d.branchId))}</span>`;
    const picked = S.branch.get(t.id);
    return `<fieldset class="pk-domains"><legend class="sr-only">Domain for ${esc(t.name)}</legend>${d.ask
      .map(
        (b) =>
          `<label><input type="radio" name="${name}-domain" value="${esc(b.id)}"${b.id === picked ? " checked" : ""}> ${esc(domainName(b.id))}</label>`,
      )
      .join("")}</fieldset>`;
  }

  function renderCards() {
    keep(grid, () => {
      if (!S.op) {
        const n = tax().operations.length;
        grid.innerHTML = `<p class="none">Choose an operation${n ? `, or press ${n > 1 ? `1–${n}` : "1"}` : ""}.</p>`;
        return;
      }
      const vis = visible();
      const h = hiIndex();
      const stop = h < 0 ? 0 : h;
      const cards = vis.map((t, i) => {
        const on = i === h;
        const ticked = tickOf(t.id) >= 0;
        const ex = exampleHTML(t);
        return `<div class="pk-card${on ? " is-hi" : ""}${ticked ? " is-ticked" : ""}" role="option" aria-selected="${on}" data-tech="${esc(t.id)}" tabindex="${i === stop ? 0 : -1}">
          <input type="checkbox" class="pk-tick" tabindex="-1" aria-label="Tick ${esc(t.name)}"${ticked ? " checked" : ""}>
          <span class="pk-body"><span class="pk-head"><b class="pk-name">${esc(t.name)}</b>${on ? domainHTML(t) : ""}</span>
          <span class="pk-icon">${esc(t.icon)}</span>
          <span class="pk-desc">${esc(t.description)}</span>
          ${ex ? `<span class="pk-exs">${ex}</span>` : ""}</span></div>`;
      });
      if (showNew()) {
        const on = h === vis.length;
        cards.push(
          `<div class="pk-card pk-new${on ? " is-hi" : ""}" role="option" aria-selected="${on}" aria-disabled="${store.taxonomyReadOnly}" tabindex="${vis.length === stop ? 0 : -1}"${store.taxonomyReadOnly ? ` title="The technique list is read-only because taxonomy.json is damaged."` : ""}>+ New technique <span class="muted">“${esc(S.q.trim())}”</span></div>`,
        );
      }
      grid.innerHTML = cards.join("") || `<p class="none">No technique matches.</p>`;
    });
  }

  const chipLabel = (t: Tag) => {
    const plain = opLabel(tax(), t.operationId).plain;
    return t.techniqueId ? `${plain} › ${techName(t.techniqueId)}` : plain;
  };
  function renderChips() {
    keep(chips, () => {
      chips.innerHTML = (store.refs.get(opts.refId)?.tags ?? [])
        .map((t) => {
          const label = esc(chipLabel(t));
          return `<span class="pk-chip${t.suggested ? " is-suggested" : ""}" tabindex="0" data-tag="${esc(t.id)}"><span class="pk-chip-label">${label}</span>${
            t.suggested ? `<button type="button" class="pk-confirm" aria-label="Confirm ${label}">✓</button>` : ""
          }<button type="button" class="pk-remove" aria-label="Remove ${label}">×</button></span>`;
        })
        .join("");
    });
  }

  // ---------- actions ----------
  /** Applies a command's Change. `done`: the tagging is finished, so reset and tell the caller. */
  function run(p: Promise<Change>, done: boolean) {
    say("");
    return p.then(
      (c) => {
        if (done) S.busy = false;
        store.apply(c);
        if (!done || S.closed) return; // a late result must not close a picker opened since
        S.ticks = [];
        S.form = false;
        slot.innerHTML = "";
        setQuery("");
        // In the Inbox the next key is usually →: take focus off the search so it reaches the Inbox.
        if (opts.inbox && el.contains(document.activeElement))
          opsEl.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
        opts.onDone?.();
      },
      (err) => {
        if (done) S.busy = false;
        if (!S.closed) sayError(String(err));
      },
    );
  }

  function sayError(err: string) {
    if (err.startsWith("NameTaken:")) {
      const id = err.slice("NameTaken:".length);
      msg.innerHTML = `Already exists: ${esc(techName(id))} — <button type="button" class="text-btn" data-use="${esc(id)}">use it</button>`;
    } else if (err === "TaxonomyReadOnly") say("The technique list is read-only because taxonomy.json is damaged.");
    else say(`Couldn't save: ${err}`);
  }

  function send(tags: NewTag[]) {
    if (S.busy || !tags.length) return;
    S.busy = true;
    void run(api.addTags(opts.refId, tags.map(withRegion)), true);
  }

  /** Enter: the ticked set, else the highlighted card, else a partial tag for the operation. */
  function apply() {
    if (S.form) return;
    if (S.ticks.length) return send(S.ticks);
    if (!S.op) return;
    const vis = visible();
    const h = hiIndex();
    if (h >= 0 && h < vis.length) {
      const t = tagFor(vis[h].id);
      return t ? send([t]) : say("Choose a domain first.");
    }
    if (h >= 0 && showNew()) return openForm();
    send([{ operationId: S.op }]);
  }

  function setQuery(q: string) {
    S.q = q;
    if (search.value !== q) search.value = q;
    S.nav = false;
    S.hi = -1;
    renderCards();
  }

  function chooseOp(id: string) {
    S.op = id;
    S.nav = false;
    S.hi = -1;
    closeForm();
    renderOps();
    renderCards();
  }

  function move(d: number) {
    const n = count();
    if (!n) return;
    const h = hiIndex();
    S.nav = true;
    S.hi = h < 0 ? (d > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, h + d));
    renderCards();
    if (grid.contains(document.activeElement)) grid.querySelector<HTMLElement>(".pk-card.is-hi")?.focus();
  }

  /** Space ticks the highlighted card; a tick-box click names its own card. */
  function toggleTick(id = grid.querySelector<HTMLElement>(".pk-card.is-hi[data-tech]")?.dataset.tech) {
    if (!id) return;
    const i = tickOf(id);
    if (i >= 0) S.ticks.splice(i, 1);
    else {
      const t = tagFor(id);
      if (!t) {
        renderCards(); // shows the card's domain radios and resets its tick box
        return say("Choose a domain first.");
      }
      S.ticks.push(t);
    }
    renderCards();
  }

  function openForm() {
    if (store.taxonomyReadOnly || !S.op) return;
    const domains = [...new Set(tax().branches.filter((b) => b.operationId === S.op).map((b) => b.domainId))];
    S.form = true;
    slot.innerHTML = `<form class="pk-form">
      <label>Name <input name="name" type="text" required maxlength="80" autocomplete="off" value="${esc(S.q.trim())}"></label>
      <label>One-line description <input name="description" type="text" maxlength="200" autocomplete="off"></label>
      <label>Domain <select name="domain">${domains
        .map((d) => `<option value="${esc(d)}">${esc(tax().domains.find((x) => x.id === d)?.name ?? d)}</option>`)
        .join("")}</select></label>
      <div class="pk-form-actions"><button type="submit" class="text-btn">Add technique</button><button type="button" class="text-btn pk-cancel">Cancel</button></div>
    </form>`;
    slot.querySelector<HTMLInputElement>('[name="name"]')!.focus();
  }

  function closeForm() {
    S.form = false;
    slot.innerHTML = "";
  }

  function submitForm(f: HTMLFormElement) {
    const val = (n: string) => (f.elements.namedItem(n) as HTMLInputElement | HTMLSelectElement | null)?.value.trim() ?? "";
    const techName = val("name");
    const domainId = val("domain");
    if (!techName || S.busy || !S.op) return;
    if (!domainId) return say("This operation has no domains yet.");
    S.busy = true;
    const tag: TagFor = withRegion({ refId: opts.refId });
    void run(api.addTechnique({ name: techName, description: val("description"), operationId: S.op, domainId }, tag), true);
  }

  /** "use it" after NameTaken: tag the existing technique, or show its card when its domain must be picked. */
  function useExisting(id: string) {
    closeForm();
    const d = domainChoice(tax(), S.op!, id);
    if ("ask" in d && d.ask.length > 1) return setQuery(techName(id));
    const branchId = "branchId" in d ? d.branchId : tax().branchTechniques.find((l) => l.techniqueId === id)?.branchId;
    const op = tax().branches.find((b) => b.id === branchId)?.operationId;
    if (branchId && op) send([{ operationId: op, techniqueId: id, branchId }]);
  }

  const tagById = (id: string) => store.refs.get(opts.refId)?.tags.find((t) => t.id === id);
  const removeTag = (id: string) => void run(api.removeTag(opts.refId, id), false);
  function confirmTag(id: string) {
    const t = tagById(id);
    if (!t) return;
    const same: NewTag = { operationId: t.operationId, techniqueId: t.techniqueId, branchId: t.branchId };
    void run(api.updateTag(opts.refId, id, t.region ? { ...same, region: t.region } : same), false);
  }

  // ---------- events ----------
  // Pointer focus lands on mousedown; repainting then would detach the target and drop its click.
  let pointer = false;
  el.addEventListener("pointerdown", () => void (pointer = true));

  el.addEventListener("keydown", (e) => {
    pointer = false;
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+Z and the IME pass through
    const t = e.target as HTMLElement;
    const text = isTextEntry(t);
    if (e.key === "Escape") {
      e.preventDefault();
      // D1: the picker's Esc is its own, so a lightbox it is docked in stays open (and keeps an
      // unsaved region and its zoom).
      e.stopPropagation();
      if (S.form) {
        closeForm();
        search.focus();
      } else if (S.q) setQuery("");
      else close();
      return;
    }
    if (t.closest(".pk-form")) return; // the form owns its keys; Enter submits it
    const chip = t.closest<HTMLElement>(".pk-chip");
    if (chip && e.key === "Delete") return void (e.preventDefault(), removeTag(chip.dataset.tag!));
    if (t.closest(".pk-chips, .pk-msg") && (e.key === "Enter" || e.key === " ")) return; // their own buttons
    const digit = text ? null : digitOf(e);
    if (digit) {
      e.preventDefault(); // out of range is swallowed too, never typed
      const op = tax().operations[digit - 1];
      if (op) chooseOp(op.id);
      return;
    }
    const vertical = e.key === "ArrowDown" || e.key === "ArrowUp";
    const sideways = (e.key === "ArrowRight" || e.key === "ArrowLeft") && !opts.inbox && !text;
    if (vertical || sideways) {
      if (t.matches('input[type="radio"]')) return; // the domain radios move themselves
      e.preventDefault();
      return move(e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      return apply();
    }
    if (e.key === " " && !text) {
      if (t.matches('input[type="radio"]')) return; // Space picks the domain radio
      if (!grid.querySelector(".pk-card.is-hi[data-tech]")) return; // a focused button clicks as usual
      e.preventDefault();
      return toggleTick();
    }
    if (e.key.length === 1 && !text) {
      e.preventDefault();
      search.focus();
      setQuery(search.value + e.key);
    }
  });

  // A card reached by Tab (or any focus) is the highlighted one, so Enter, Space and the arrows act on it.
  el.addEventListener("focusin", (e) => {
    const byPointer = pointer;
    pointer = false; // one press, one focus
    const card = (e.target as Element).closest<HTMLElement>(".pk-card");
    if (!card) return;
    const i = [...grid.querySelectorAll(".pk-card")].indexOf(card);
    if (i < 0) return;
    const shown = i === hiIndex(); // already highlighted: record it, never repaint (that would drop the focus)
    S.nav = true;
    S.hi = i;
    if (!shown && !byPointer) renderCards(); // a click repaints in its own handler
  });

  el.addEventListener("input", (e) => {
    if (e.target === search) setQuery(search.value);
  });

  el.addEventListener("change", (e) => {
    const r = e.target as HTMLInputElement;
    if (r.type !== "radio") return;
    const id = r.closest<HTMLElement>(".pk-card")?.dataset.tech;
    if (!id) return;
    S.branch.set(id, r.value);
    const i = tickOf(id);
    if (i >= 0) S.ticks[i] = { ...S.ticks[i], branchId: r.value };
  });

  el.addEventListener("submit", (e) => {
    e.preventDefault();
    submitForm(e.target as HTMLFormElement);
  });

  el.addEventListener("click", (e) => {
    pointer = false;
    const t = e.target as HTMLElement;
    const op = t.closest<HTMLElement>(".pk-op");
    if (op) return chooseOp(op.dataset.op!);
    const use = t.closest<HTMLElement>("[data-use]");
    if (use) return useExisting(use.dataset.use!);
    if (t.closest(".pk-apply")) return apply();
    if (t.closest(".pk-cancel")) return closeForm();
    const chip = t.closest<HTMLElement>(".pk-chip");
    if (chip && t.closest(".pk-remove")) return removeTag(chip.dataset.tag!);
    if (chip && t.closest(".pk-confirm")) return confirmTag(chip.dataset.tag!);
    if (t.closest(".pk-domains")) return; // picks arrive as change events
    const card = t.closest<HTMLElement>(".pk-card");
    if (!card) return;
    if (card.classList.contains("pk-new")) return openForm();
    S.nav = true;
    S.hi = [...grid.querySelectorAll(".pk-card")].indexOf(card);
    if (t.classList.contains("pk-tick")) toggleTick(card.dataset.tech);
    else renderCards();
  });

  const unsubscribe = store.subscribe((c) => {
    if (c.reset) demoCache.delete(api); // technique ids resolve against the new library's taxonomy
    if (!store.refs.has(opts.refId)) return close();
    if (c.taxonomy) {
      if (S.op && !hasOp(S.op)) S.op = null;
      // A tick whose operation, technique or branch is gone would be refused by Rust.
      S.ticks = S.ticks.filter(
        (t) =>
          hasOp(t.operationId) &&
          (!t.techniqueId ||
            store.tax.branchTechniques.some((l) => l.branchId === t.branchId && l.techniqueId === t.techniqueId)),
      );
      renderOps();
    }
    renderCards();
    renderChips();
  });

  function close() {
    if (S.closed) return;
    S.closed = true;
    unsubscribe();
    const hadFocus = el.contains(document.activeElement);
    el.remove();
    if (hadFocus && opener?.isConnected) opener.focus(); // back where the artist opened it from
    opts.onClose?.();
  }

  renderOps();
  renderCards();
  renderChips();
  root.append(el);
  opsEl.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  void demoFor(api).then((d) => {
    if (S.closed) return;
    S.demo = d;
    renderCards();
  });
  return { close, el };
}
