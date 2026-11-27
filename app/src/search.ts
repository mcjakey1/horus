// Search by idea (option A): the combobox. Results come from the Rust `search` command;
// names and plain labels come from the taxonomy. Port of prototype renderResults/moveActive/choose.
// Plan 5 adds option B ("Looks similar") as its own group below, from the `similar` hook or a
// dropped image.
import type { Api, Hit } from "./api";
import { esc } from "./esc";

export type SearchHooks = {
  techniqueName(id: string): string;
  operationLabel(id: string): { name: string; plain: string; color: string };
  referenceTitle(id: string): string | undefined;
  onTechnique(id: string): void;
  onReference(id: string): void;
  /** Plan 5 option B: reference ids that look like the words, best first. Absent while Find
   * similar is off (read on every keystroke, so it can come and go). */
  similar?: (q: string) => Promise<string[]>;
};

/** R16: option B runs the text encoder, so it waits for a pause in typing; option A never waits. */
export const SIMILAR_DEBOUNCE_MS = 150;
/** The "Looks similar" group shows at most this many references. */
const SIMILAR_ROWS = 4;
const FAILED = "Looks similar couldn't search just now. Try again.";
/** What the group shows: reference ids, or a quiet line. */
export type SimilarResults = { ids: string[] } | { note: string };

export type SearchHandle = {
  close(): void;
  /** A dropped image's search starts: takes the next response slot now, so a later typed query,
   * Esc or another drop makes this one stale. Apply "Searching…", then the answer. */
  beginDrop(): (r: SimilarResults) => void;
  /** The board scope changed: repaint from what the list already has (R15). */
  refresh(): void;
};

export function mountSearch(root: HTMLElement, api: Api, hooks: SearchHooks, signal?: AbortSignal): SearchHandle {
  const input = root.querySelector<HTMLInputElement>("#q")!;
  const ul = root.querySelector<HTMLUListElement>("#q-results")!;
  const box = input.closest<HTMLElement>(".search") ?? root;
  let activeId: string | null = null; // the selected option, kept across repaints
  let seq = 0; // drop stale responses when typing fast; shared by option A, option B and drops
  let hits: Hit[] | null = null; // option A's answer, null before it arrives (and for a drop)
  let similar: "pending" | SimilarResults | null = null; // option B's group, null when absent
  let dropped = false; // the group answers an image, not words: no English hint
  let timer: ReturnType<typeof setTimeout> | undefined;
  let live: HTMLElement | null = null; // option B's count for screen readers, made on first use

  function close() {
    seq++; // any in-flight response is now stale
    clearTimeout(timer);
    similar = null;
    hits = null;
    activeId = null;
    ul.hidden = true;
    ul.innerHTML = ""; // nothing stale, option B's group included, waits in the hidden listbox
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function row(h: Hit, k: number): string {
    if (h.kind === "technique") {
      const op = hooks.operationLabel(h.operationId);
      return `<li role="option" id="opt-${k}" data-t="${esc(h.id)}" aria-selected="false"><span class="sw" style="background:${op.color}"></span><span><b class="serif">${esc(hooks.techniqueName(h.id))}</b><small>${esc(op.name)} · ${esc(op.plain)}</small></span><span class="n">${h.count}</span></li>`;
    }
    return `<li role="option" id="opt-${k}" data-r="${esc(h.id)}" aria-selected="false"><span class="sw" style="background:var(--ink-3)"></span><span><b class="serif">${esc(hooks.referenceTitle(h.id) ?? h.id)}</b><small>reference · matches your words</small></span><span></span></li>`;
  }

  /** The "Looks similar" group: its own `role="group"`, after option A, no score (Global
   * Constraints); out-of-scope references drop out through `referenceTitle` (R15). */
  function group(): string {
    if (!similar) return "";
    let body: string;
    let count: number | null = null;
    if (similar === "pending") body = `<li class="sim-note" role="presentation">Searching…</li>`;
    else if ("note" in similar) body = `<li class="sim-note" role="presentation">${esc(similar.note)}</li>`;
    else {
      const ids = similar.ids.filter((id) => hooks.referenceTitle(id) !== undefined).slice(0, SIMILAR_ROWS);
      count = ids.length;
      const rows = ids.map((id, k) => `<li role="option" id="opt-s${k}" class="sim-opt" data-r="${esc(id)}" aria-selected="false"><span class="sw sw-ref"></span><span><b class="serif">${esc(hooks.referenceTitle(id)!)}</b><small>reference · looks alike</small></span><span></span></li>`);
      body = rows.join("") || `<li class="sim-note" role="presentation">Nothing in this library looks like that yet.</li>`;
    }
    announce(count === null ? "" : count === 1 ? "1 looks similar" : `${count} look similar`);
    // decision 3: the hint is about words, so a dropped image's group goes without it.
    const hint = dropped ? "" : `<small id="q-sim-hint">Works best in English.</small>`;
    return `<li class="sim-group" role="presentation"><ul role="group" aria-label="Looks similar"${dropped ? "" : ` aria-describedby="q-sim-hint"`}><li class="sim-head" role="presentation">Looks similar${hint}</li>${body}</ul></li>`;
  }

  /** A polite live line beside the listbox: option B's rows arrive after the list opened. */
  function announce(text: string) {
    if (!live && !text) return;
    if (!live) {
      live = document.createElement("p");
      live.className = "sr-only";
      live.setAttribute("aria-live", "polite");
      box.append(live);
    }
    if (live.textContent !== text) live.textContent = text;
  }

  function paint() {
    const q = input.value;
    const shown = (hits ?? []).filter((h) => h.kind === "technique" || hooks.referenceTitle(h.id) !== undefined);
    const a = shown.length
      ? shown.map(row).join("")
      : hits
        ? `<li class="empty" role="option" aria-disabled="true">No technique matches “${esc(q)}”. Try a plain word like “shadow” or “empty space”.</li>`
        : "";
    ul.innerHTML = a + group();
    // Option B can land after an arrow key: keep that option selected, else the first.
    const opts = [...ul.querySelectorAll<HTMLElement>("li[id]")];
    const on = opts.find((li) => li.id === activeId) ?? opts[0];
    activeId = on?.id ?? null;
    opts.forEach((li) => li.setAttribute("aria-selected", String(li === on)));
    ul.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (on) input.setAttribute("aria-activedescendant", on.id);
    else input.removeAttribute("aria-activedescendant");
  }

  async function render() {
    const q = input.value;
    clearTimeout(timer);
    if (!q.trim()) return close();
    const mine = ++seq;
    hits = null; // a new query: nothing of the last one's answer shows
    activeId = null;
    dropped = false;
    // R16: option B waits for typing to pause; the group says so meanwhile.
    const findSimilar = hooks.similar;
    similar = findSimilar ? "pending" : null;
    if (findSimilar) {
      timer = setTimeout(() => {
        findSimilar(q).then(
          // Not once Find similar turned off meanwhile (off means absent).
          (ids) => mine === seq && hooks.similar && ((similar = { ids }), paint()),
          () => mine === seq && hooks.similar && ((similar = { note: FAILED }), paint()),
        );
      }, SIMILAR_DEBOUNCE_MS);
    }
    let found: Hit[] = [];
    try {
      found = await api.search(q);
    } catch {
      found = [];
    }
    if (mine !== seq) return;
    hits = found;
    paint();
  }

  // The drop target has no keyboard path of its own: the Reference view's "Looks similar" tab
  // gives the same search from the keyboard.
  function beginDrop() {
    const mine = ++seq;
    clearTimeout(timer);
    return (r: SimilarResults) => {
      if (mine !== seq) return; // typed, Esc'd or dropped again meanwhile
      hits = null;
      activeId = null;
      dropped = true;
      input.value = "";
      similar = r;
      paint();
      input.focus();
    };
  }

  function move(d: number) {
    const opts = [...ul.querySelectorAll<HTMLLIElement>("li[id]")];
    if (!opts.length) return;
    const at = opts.findIndex((li) => li.id === activeId);
    const next = opts[(at + d + opts.length) % opts.length];
    activeId = next.id;
    opts.forEach((o) => o.setAttribute("aria-selected", String(o === next)));
    input.setAttribute("aria-activedescendant", next.id);
    next.scrollIntoView?.({ block: "nearest" });
  }

  function choose(li: HTMLElement | null) {
    if (!li) return;
    input.value = "";
    close();
    if (li.dataset.t) hooks.onTechnique(li.dataset.t);
    else if (li.dataset.r) hooks.onReference(li.dataset.r);
  }

  input.addEventListener("input", () => void render(), { signal });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      move(e.key === "ArrowDown" ? 1 : -1);
    }
    if (e.key === "Enter") choose(ul.querySelector<HTMLElement>('li[aria-selected="true"][id]'));
    if (e.key === "Escape") {
      input.value = "";
      close();
      input.blur();
    }
  }, { signal });
  ul.addEventListener("click", (e) => choose((e.target as Element).closest<HTMLElement>("li[id]")), { signal });
  // A pointer down anywhere outside the search closes the list (a dropped image's list too).
  document.addEventListener("pointerdown", (e) => {
    if (!ul.hidden && !box.contains(e.target as Node)) close();
  }, { signal });
  /** Scope changed, or Find similar turned off: an open list drops option B (off means absent). */
  function refresh() {
    if (!hooks.similar) clearTimeout(timer); // a debounced option B never starts
    if (ul.hidden) return;
    if (!hooks.similar && similar) {
      similar = null;
      if (!hits) return close(); // the list held only a dropped image's group
    }
    paint();
  }

  return { close, beginDrop, refresh };
}
