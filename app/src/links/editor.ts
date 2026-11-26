// Plan 4 Task 4: links the artist draws, with a "why" note (SPEC §4). Links are always shown,
// listed first, and never part of any score. One link per unordered pair (Decision 2).
import type { Api, Link, Scored } from "../api";
import { esc } from "../esc";
import type { Store } from "../store";

/** The "Linked by you" group first, then the scored rest with the linked ones removed, so no
 * reference appears twice. `links` keep their order (newest first from `store.linksFor`). */
export function linkedFirst(
  related: Scored[],
  links: Link[],
  focus: string,
): { linked: { link: Link; other: string; score?: number }[]; rest: Scored[] } {
  const score = new Map(related.map((x) => [x.id, x.score]));
  const linked = links
    .map((link) => ({ link, other: link.fromRef === focus ? link.toRef : link.fromRef }))
    .filter((x) => x.other !== focus)
    .map((x) => ({ ...x, score: score.get(x.other) }));
  const ids = new Set(linked.map((x) => x.other));
  return { linked, rest: related.filter((x) => !ids.has(x.id)) };
}

/** Wire codes (Task 1) to copy. Anything else, raw OS text included, gets the generic line. */
export function linkErrorCopy(err: unknown): string {
  const code = String(err);
  if (code === "SelfLink") return "A reference can't link to itself.";
  if (code === "EmptyWhy") return "Say why these are connected.";
  if (code.startsWith("DuplicateLink:")) return "These two are already linked — edit the note instead.";
  return "That change didn't save. Try again.";
}

let uid = 0;

/** The link editor: a new link from `fromRef` (to `toRef`, or picked in the combobox), or an
 * edit of `linkId`. It closes itself after a save. */
export function mountLinkEditor(
  root: HTMLElement,
  api: Api,
  store: Store,
  opts: { fromRef: string; toRef?: string; linkId?: string },
): { close(): void; el: HTMLElement } {
  const name = `le${++uid}`;
  const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  const title = (id: string) => store.refs.get(id)?.title ?? id;
  const st = {
    linkId: opts.linkId ?? null as string | null,
    toRef: opts.toRef ?? null as string | null,
    active: 0,
    busy: false,
  };
  const existing = () => (st.linkId ? store.links.find((l) => l.id === st.linkId) : undefined);
  const otherOf = (l: Link) => (l.fromRef === opts.fromRef ? l.toRef : l.fromRef);
  if (st.linkId) {
    const l = existing();
    if (l) st.toRef = otherOf(l);
  }

  const el = document.createElement("section");
  el.className = "link-editor";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", "Link two references");
  el.innerHTML = `
    <h3 class="le-head">Link <b>${esc(title(opts.fromRef))}</b> to…</h3>
    <div class="le-pick"></div>
    <p class="le-current" hidden></p>
    <label class="le-label" for="${name}-why">Why are these connected?</label>
    <textarea class="le-why" id="${name}-why" rows="3"></textarea>
    <p class="le-msg" role="status"></p>
    <div class="le-actions">
      <button type="button" class="text-btn le-cancel">Cancel</button>
      <button type="button" class="le-save" disabled>Save link</button>
    </div>`;
  const $ = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const why = $<HTMLTextAreaElement>(".le-why");
  const save = $<HTMLButtonElement>(".le-save");
  const msg = $(".le-msg");

  /** References the combobox offers: not the focus, not already linked to it. */
  const candidates = (q: string) => {
    const linked = new Set(store.linksFor(opts.fromRef).map(otherOf));
    const needle = q.trim().toLowerCase();
    return [...store.refs.values()].filter(
      (r) =>
        r.id !== opts.fromRef &&
        !linked.has(r.id) &&
        (!needle || r.title.toLowerCase().includes(needle) || (r.note ?? "").toLowerCase().includes(needle)),
    );
  };

  function renderPick() {
    const pick = $(".le-pick");
    if (st.toRef) {
      pick.innerHTML = `<p class="le-to">to <b>${esc(title(st.toRef))}</b></p>`;
      return;
    }
    pick.innerHTML = `
      <input class="le-q" type="text" role="combobox" aria-expanded="true" aria-autocomplete="list"
        aria-controls="${name}-opts" aria-label="Find a reference by title or note" placeholder="Find a reference…">
      <ul class="le-opts" id="${name}-opts" role="listbox" aria-label="References"></ul>`;
    const q = $<HTMLInputElement>(".le-q");
    q.addEventListener("input", () => {
      st.active = 0;
      renderOpts();
    });
    q.addEventListener("keydown", (e) => {
      const n = $(".le-opts").children.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        if (n) st.active = (st.active + (e.key === "ArrowDown" ? 1 : -1) + n) % n;
        renderOpts();
      } else if (e.key === "Enter" && !e.isComposing) {
        e.preventDefault();
        const id = $(".le-opts").children[st.active]?.getAttribute("data-r");
        if (id) choose(id);
      }
    });
    $(".le-opts").addEventListener("click", (e) => {
      const id = (e.target as Element).closest("[data-r]")?.getAttribute("data-r");
      if (id) choose(id);
    });
    renderOpts();
  }

  function renderOpts() {
    const q = $<HTMLInputElement>(".le-q");
    const list = candidates(q.value).slice(0, 50);
    $(".le-opts").innerHTML = list
      .map((r, k) => `<li role="option" id="${name}-o${k}" data-r="${esc(r.id)}" aria-selected="${k === st.active}">${esc(r.title)}</li>`)
      .join("");
    if (list.length) {
      const id = `${name}-o${Math.min(st.active, list.length - 1)}`;
      q.setAttribute("aria-activedescendant", id);
      el.querySelector(`#${id}`)?.scrollIntoView?.({ block: "nearest" }); // the list scrolls past 6 rows
    } else q.removeAttribute("aria-activedescendant");
  }

  function choose(id: string) {
    st.toRef = id;
    renderPick();
    sync();
    why.focus();
  }

  function renderCurrent() {
    const cur = $(".le-current");
    const l = existing();
    cur.hidden = !l;
    cur.textContent = l ? `Current note: “${l.why}”` : "";
    save.textContent = l ? "Save note" : "Save link";
    if (st.linkId) el.dataset.linkId = st.linkId;
    else delete el.dataset.linkId;
  }

  const sync = () => (save.disabled = st.busy || !why.value.trim() || !(st.linkId || st.toRef));

  async function submit() {
    if (save.disabled) return;
    st.busy = true;
    sync();
    msg.textContent = "";
    try {
      const change = st.linkId
        ? await api.updateLink(st.linkId, why.value)
        : await api.addLink(opts.fromRef, st.toRef!, why.value);
      store.apply(change);
      close();
    } catch (err) {
      msg.textContent = linkErrorCopy(err);
      const code = String(err);
      // Review Focus 4: switch to the existing link; the typed text stays in the textarea.
      if (code.startsWith("DuplicateLink:")) {
        st.linkId = code.slice("DuplicateLink:".length);
        renderCurrent();
      }
      st.busy = false;
      sync();
    }
  }

  why.addEventListener("input", sync);
  save.addEventListener("click", () => void submit());
  $(".le-cancel").addEventListener("click", () => close());
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  });

  let open = true;
  function close() {
    if (!open) return;
    open = false;
    el.remove();
    if (opener?.isConnected) opener.focus();
  }

  if (st.linkId) why.value = existing()?.why ?? "";
  renderPick();
  renderCurrent();
  sync();
  root.prepend(el);
  (st.toRef ? why : $<HTMLInputElement>(".le-q")).focus();
  return { close, el };
}
