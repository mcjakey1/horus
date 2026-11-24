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
};

export function mountSearch(root: HTMLElement, api: Api, hooks: SearchHooks, signal?: AbortSignal): { close(): void } {
  const input = root.querySelector<HTMLInputElement>("#q")!;
  const ul = root.querySelector<HTMLUListElement>("#q-results")!;
  let active = 0;
  let seq = 0; // drop stale responses when typing fast

  function close() {
    seq++; // any in-flight response is now stale
    ul.hidden = true;
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

  async function render() {
    const q = input.value;
    active = 0;
    if (!q.trim()) return close();
    const mine = ++seq;
    let hits: Hit[] = [];
    try {
      hits = await api.search(q);
    } catch {
      hits = [];
    }
    if (mine !== seq) return;
    const shown = hits.filter((h) => h.kind === "technique" || hooks.referenceTitle(h.id) !== undefined);
    ul.innerHTML = shown.length
      ? shown.map(row).join("")
      : `<li class="empty" role="option" aria-disabled="true">No technique matches “${esc(q)}”. Try a plain word like “shadow” or “empty space”.</li>`;
    ul.hidden = false;
    input.setAttribute("aria-expanded", "true");
    if (shown.length) input.setAttribute("aria-activedescendant", "opt-0");
    else input.removeAttribute("aria-activedescendant");
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
