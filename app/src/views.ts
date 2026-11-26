// The view shell (Plan 3, grown from Plan 2's toggle): body[data-view] picks the view, and the
// top-bar tab carries .is-on and aria-current. Views mount lazily on their first select, then are
// only hidden and shown, so a canvas view keeps its camera between visits.
export type ViewId = "reference" | "inbox" | "tree" | "galaxy" | "radial" | "boards";

export interface ViewHandle {
  show(): void;
  hide(): void;
  destroy(): void;
}

export function mountViews(
  root: HTMLElement,
  deps: { showReference(id: string): void },
): {
  /** Enables that id's tab: a tab is clickable only once its view exists. */
  register(id: ViewId, factory: () => ViewHandle): void;
  /** Runs the view's `show` on every select, a re-select of the current view included. */
  select(id: ViewId): void;
  current(): ViewId;
  /** select("reference"), then deps.showReference(id). */
  openReference(id: string): void;
  destroy(): void;
} {
  const tab = (id: ViewId) => root.querySelector<HTMLButtonElement>(`[data-view-tab="${id}"]`);
  const factories = new Map<ViewId, () => ViewHandle>();
  const mounted = new Map<ViewId, ViewHandle>();
  let cur: ViewId = "reference";
  const mark = (id: ViewId) => {
    cur = id;
    document.body.dataset.view = id;
    for (const t of root.querySelectorAll<HTMLElement>("[data-view-tab]")) {
      const on = t.dataset.viewTab === id;
      t.classList.toggle("is-on", on);
      if (on) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    }
  };
  function select(id: ViewId) {
    if (id !== cur) mounted.get(cur)?.hide();
    mark(id);
    let view = mounted.get(id);
    const make = factories.get(id);
    if (!view && make) mounted.set(id, (view = make()));
    view?.show();
  }
  const life = new AbortController();
  root.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLButtonElement>("[data-view-tab]");
    if (t && !t.disabled) select(t.dataset.viewTab as ViewId);
  }, { signal: life.signal });
  mark(cur);
  return {
    register(id, factory) {
      factories.set(id, factory);
      const t = tab(id);
      t?.removeAttribute("disabled");
      t?.removeAttribute("title");
    },
    select,
    current: () => cur,
    openReference(id) {
      select("reference");
      deps.showReference(id);
    },
    destroy() {
      life.abort();
      for (const v of mounted.values()) v.destroy();
      mounted.clear();
    },
  };
}
