// Plan 6 Task 3b D8: how a modal dialog holds the window, shared by Settings, the move dialogs
// and (Task 4) About. Everything outside the sheet goes inert, Tab and Shift+Tab wrap inside it,
// and a key aimed outside it (focus fell to <body>) is stopped in the capture phase before the
// app's own listeners: Tab comes back in, Esc calls `onEscape`, nothing else reaches the page.
// Keys inside the sheet are the sheet's own, so an inner Esc handler (a confirmation) decides.

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [href], [tabindex]";

/** Holds the window for `sheet` until the returned release is called. */
export function holdModal(sheet: HTMLElement, onEscape: () => void): () => void {
  // Inert every sibling along the sheet's ancestors, so only the sheet can take focus; what was
  // already inert stays as it was on release.
  const inerted: HTMLElement[] = [];
  for (let n: HTMLElement = sheet; n.parentElement && n !== document.body; n = n.parentElement) {
    for (const sib of n.parentElement.children) {
      if (sib !== n && sib instanceof HTMLElement && !sib.inert) {
        sib.inert = true;
        inerted.push(sib);
      }
    }
  }
  /** Computed per key: the sheet's content can re-render. */
  const trap = (e: KeyboardEvent) => {
    const f = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.tabIndex >= 0 && !x.closest("[hidden]"));
    if (!f.length) return;
    const a = document.activeElement, first = f[0], last = f[f.length - 1];
    // Not `sheet.contains`: focus can sit on the sheet itself (tabIndex -1), and wraps from there too.
    if (f.includes(a as HTMLElement) && a !== (e.shiftKey ? first : last)) return;
    e.preventDefault();
    (e.shiftKey ? last : first).focus();
  };
  const life = new AbortController();
  const signal = life.signal;
  sheet.addEventListener("keydown", (e) => e.key === "Tab" && trap(e), { signal });
  document.addEventListener("keydown", (e) => {
    if (e.target instanceof Node && sheet.contains(e.target)) return;
    e.stopPropagation();
    e.preventDefault();
    if (e.key === "Tab") trap(e);
    else if (e.key === "Escape") onEscape();
  }, { capture: true, signal });
  return () => {
    life.abort();
    inerted.forEach((x) => (x.inert = false));
  };
}
