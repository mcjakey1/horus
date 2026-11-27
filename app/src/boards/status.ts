// Plan 4 Task 5: the board scope in the footer (#board-scope). "Show only this board" is view
// state; when a change removes the scoped board, the store clears the scope and this says so.
import { esc } from "../esc";
import type { Store } from "../store";

export function mountScopeStatus(el: HTMLElement, store: Store): () => void {
  let removed: string | null = null; // the removed board: "Board removed" stays until the scope changes, or it comes back
  let scoped = store.scope;
  function render() {
    const b = store.scope ? store.boards.find((x) => x.id === store.scope) : undefined;
    if (b) {
      const n = b.referenceIds.filter((id) => store.refs.has(id)).length;
      el.innerHTML = `Board: <b>${esc(b.name)}</b> · ${n} reference${n === 1 ? "" : "s"} · <button type="button" class="text-btn" data-scope-clear>Show all</button>`;
    } else el.textContent = removed !== null ? "Board removed — showing all references" : "";
    el.hidden = !el.textContent;
  }
  const onClick = (e: Event) => {
    if ((e.target as Element).closest("[data-scope-clear]")) store.setScope(null);
  };
  el.addEventListener("click", onClick);
  const unsubscribe = store.subscribe((c) => {
    if (c.scopeCleared) removed = scoped;
    else if (c.scope || c.reset) removed = null;
    // D3: an undo that brings the board back makes the note untrue.
    else if (removed !== null && c.boards?.some((b) => b.id === removed)) removed = null;
    scoped = store.scope;
    render();
  });
  render();
  return () => {
    unsubscribe();
    el.removeEventListener("click", onClick);
  };
}
