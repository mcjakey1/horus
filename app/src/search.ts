// Search by idea (option A): the combobox. Results come from the Rust `search` command;
// names and plain labels come from the taxonomy. Port of prototype renderResults/moveActive/choose.
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
/** Dispatched on `#q` by the drop target: `{ ids }` or `{ note }` to show in the group. */
export const SIMILAR_RESULTS = "similar:results";
/** Dispatched on `#q` when the board scope changed: repaint the group from what it has. */
export const SIMILAR_REFRESH = "similar:refresh";
export type SimilarResults = { ids: string[] } | { note: string };

export function mountSearch(root: HTMLElement, api: Api, hooks: SearchHooks, signal?: AbortSignal): { close(): void } {
  const input = root.querySelector<HTMLInputElement>("#q")!;
  const ul = root.querySelector<HTMLUListElement>("#q-results")!;
  let active = 0;
  let seq = 0; // drop stale responses when typing fast; shared by option A and option B
  let hits: Hit[] | null = null; // option A's answer, null before it arrives (or after a drop)
  let similar: "pending" | SimilarResults | null = null; // option B's group, null when absent
  let timer: ReturnType<typeof setTimeout> | undefined;

  function close() {
    seq++; // any in-flight response is now stale
    clearTimeout(timer);
    similar = null;
    ul.hidden = true;
    ul.innerHTML = ""; // nothing stale, option B's group included, waits in the hidden listbox
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
  }

  function row(h: Hit, k: number): string {
    if (h.kind === "technique") {
      const op = hooks.operationLabel(h.operationId);
      return `<li role="option" id="opt-${k}" data-t="${esc(h.id)}" aria-selected="${k === 0}"><span class="sw" style="background:${op.color}"></span><span><b class="serif">${esc(hooks.techniqueName(h.id))}</b><small>${esc(op.name)} · ${esc(op.plain)}</small></span><span class="n">${h.count}</span></li>`;
    }
    return `<li role="option" id="opt-${k}" data-r="${esc(h.id)}" aria-selected="${k === 0}"><span class="sw" style="background:var(--ink-3)"></span><span><b class="serif">${esc(hooks.referenceTitle(h.id) ?? h.id)}</b><small>reference · matches your words</small></span><span></span></li>`;
  }

  /** The "Looks similar" group: its own `role="group"`, after option A, no score (Global
   * Constraints); out-of-scope references drop out through `referenceTitle` (R15). */
  function group(): string {
    if (!similar) return "";
    let body: string;
    if (similar === "pending") body = `<li class="sim-note" role="presentation">Searching…</li>`;
    else if ("note" in similar) body = `<li class="sim-note" role="presentation">${esc(similar.note)}</li>`;
    else {
      const rows = similar.ids
        .filter((id) => hooks.referenceTitle(id) !== undefined)
        .slice(0, SIMILAR_ROWS)
        .map((id, k) => `<li role="option" id="opt-s${k}" class="sim-opt" data-r="${esc(id)}" aria-selected="false"><span class="sw sw-ref"></span><span><b class="serif">${esc(hooks.referenceTitle(id)!)}</b><small>looks alike</small></span><span></span></li>`);
      body = rows.join("") || `<li class="sim-note" role="presentation">Nothing in this library looks like that yet.</li>`;
    }
    return `<li class="sim-group" role="presentation"><ul role="group" aria-label="Looks similar"><li class="sim-head" role="presentation">Looks similar<small>Works best in English.</small></li>${body}</ul></li>`;
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
    active = 0;
    const first = ul.querySelector<HTMLElement>("li[id]");
    ul.querySelectorAll<HTMLElement>("li[id]").forEach((li) => li.setAttribute("aria-selected", String(li === first)));
    ul.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (first) input.setAttribute("aria-activedescendant", first.id);
    else input.removeAttribute("aria-activedescendant");
  }

  async function render() {
    const q = input.value;
    active = 0;
    clearTimeout(timer);
    if (!q.trim()) return close();
    const mine = ++seq;
    // R16: option B waits for typing to pause; the group says so meanwhile.
    const findSimilar = hooks.similar;
    similar = findSimilar ? "pending" : null;
    if (findSimilar) {
      timer = setTimeout(() => {
        findSimilar(q).then(
          (ids) => mine === seq && ((similar = { ids }), paint()),
          () => mine === seq && ((similar = { ids: [] }), paint()),
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

  /** The drop target's answer: the group alone, as a fresh result (any typed query is stale). */
  function showDropped(r: SimilarResults) {
    seq++;
    clearTimeout(timer);
    hits = null;
    input.value = "";
    similar = r;
    paint();
  }

  function move(d: number) {
    const opts = [...ul.querySelectorAll<HTMLLIElement>("li[id]")];
    if (!opts.length) return;
    active = (active + d + opts.length) % opts.length;
    opts.forEach((o, k) => o.setAttribute("aria-selected", String(k === active)));
    input.setAttribute("aria-activedescendant", opts[active].id);
    opts[active].scrollIntoView?.({ block: "nearest" });
  }

  function choose(li: HTMLElement | null) {
    if (!li) return;
    input.value = "";
    close();
    if (li.dataset.t) hooks.onTechnique(li.dataset.t);
    else if (li.dataset.r) hooks.onReference(li.dataset.r);
  }

  input.addEventListener("input", () => void render(), { signal });
  input.addEventListener(SIMILAR_RESULTS, (e) => showDropped((e as CustomEvent<SimilarResults>).detail), { signal });
  input.addEventListener(SIMILAR_REFRESH, () => !ul.hidden && paint(), { signal });
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
  return { close };
}
