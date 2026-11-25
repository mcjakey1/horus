// The minimal view toggle (Task 9) until Plan 3's shell.ts absorbs it: body[data-view] picks the
// view, and the top-bar tab carries aria-current. ViewId uses Plan 3's names.
export type ViewId = "reference" | "inbox";

export function mountViews(
  root: HTMLElement,
  views: Partial<Record<ViewId, () => void>>,
): { select(id: ViewId): void; current(): ViewId } {
  const tabs = [...root.querySelectorAll<HTMLElement>("[data-view-tab]")];
  let cur: ViewId = "reference";
  const mark = (id: ViewId) => {
    cur = id;
    document.body.dataset.view = id;
    for (const t of tabs) {
      const on = t.dataset.viewTab === id;
      t.classList.toggle("is-on", on);
      if (on) t.setAttribute("aria-current", "page");
      else t.removeAttribute("aria-current");
    }
  };
  function select(id: ViewId) {
    mark(id);
    views[id]?.();
  }
  root.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-view-tab]");
    if (t) select(t.dataset.viewTab as ViewId);
  });
  mark(cur);
  return { select, current: () => cur };
}
