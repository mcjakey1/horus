// The Settings panel (Plan 5 Task 6): a modal dialog opened from the top bar's gear. The rest
// of the window goes inert while it is open, and Tab wraps inside it; Esc or Close returns focus to
// whatever opened it. Find similar is its one section; it follows `similar://status` while open.
import type { Api } from "../api";
import { renderFindSimilar } from "./find-similar";

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [href], [tabindex]";

export function mountSettings(root: HTMLElement, api: Api): { open(section?: "find-similar"): void; close(): void } {
  let el: HTMLElement | null = null;
  let shell: HTMLElement[] = [];
  let opener: HTMLElement | null = null;
  let unlisten: (() => void) | null = null;
  let unbind = () => {}; // the open dialog's document key listener
  let gen = 0; // bumped by every open and close, so a late reply from an earlier open is dropped

  function close() {
    if (!el) return;
    gen++;
    unlisten?.();
    unlisten = null;
    unbind();
    el.remove();
    el = null;
    shell.forEach((x) => (x.inert = false));
    if (opener?.isConnected) opener.focus();
  }

  function open(section?: "find-similar") {
    if (el) return;
    const id = ++gen;
    const gone = () => id !== gen;
    opener = document.activeElement as HTMLElement | null;
    shell = ([...root.children] as HTMLElement[]).filter((x) => !x.inert);
    shell.forEach((x) => (x.inert = true));
    el = document.createElement("div");
    el.className = "settings";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "st-title");
    el.tabIndex = -1; // a click on text keeps focus inside, so Esc still reaches the dialog
    el.innerHTML = `<div class="st-sheet">
      <div class="st-head">
        <h1 class="st-title" id="st-title">Settings</h1>
        <button type="button" class="icon-btn" data-close aria-label="Close settings">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
        </button>
      </div>
      <section class="st-section" data-section="find-similar" aria-labelledby="fs-label"></section>
    </div>`;
    root.append(el);
    const sheet = el;
    const fs = sheet.querySelector<HTMLElement>('[data-section="find-similar"]')!;
    /** Tab and Shift+Tab wrap inside the dialog (QA F2); computed now, as the section re-renders. */
    const trap = (e: KeyboardEvent) => {
      const f = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.tabIndex >= 0 && !x.closest("[hidden]"));
      if (!f.length) return;
      const a = document.activeElement, first = f[0], last = f[f.length - 1];
      // Not `sheet.contains`: focus can sit on the dialog itself (tabIndex -1), and wraps from there too.
      if (f.includes(a as HTMLElement) && a !== (e.shiftKey ? first : last)) return;
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    };
    sheet.addEventListener("keydown", (e) => {
      e.stopPropagation(); // no key reaches the views underneath (v, t, Backspace, their Esc)
      if (e.key === "Tab") return trap(e);
      if (e.key !== "Escape") return;
      e.preventDefault();
      close();
    });
    // A key aimed outside the dialog (focus fell to <body>) stops here, before the app's own
    // listeners: Tab comes back in, Esc closes, nothing else reaches the view behind (QA F2).
    // Keys inside the dialog take the listener above, so the Remove confirmation keeps its Esc.
    const life = new AbortController();
    unbind = () => life.abort();
    document.addEventListener("keydown", (e) => {
      if (e.target instanceof Node && sheet.contains(e.target)) return;
      e.stopPropagation();
      e.preventDefault();
      if (e.key === "Tab") trap(e);
      else if (e.key === "Escape") close();
    }, { capture: true, signal: life.signal });
    sheet.addEventListener("click", (e) => {
      if ((e.target as Element).closest("[data-close]") || e.target === sheet) close();
    });
    sheet.querySelector<HTMLElement>("[data-close]")!.focus();
    void api.similarStatus().then((s) => {
      if (gone()) return;
      renderFindSimilar(fs, s, api);
      if (section === "find-similar") fs.querySelector<HTMLElement>('[role="switch"]')?.focus();
    });
    void api
      .onSimilarStatus((s) => !gone() && renderFindSimilar(fs, s, api))
      .then((u) => (gone() ? u() : (unlisten = u)));
  }

  root.querySelector<HTMLElement>("#settings")?.addEventListener("click", () => open());
  // First run's failure notice links here (F4): "Open Settings" goes to the Find similar section.
  const notice = root.querySelector<HTMLElement>("#import-notice");
  notice?.addEventListener("click", (e) => {
    if (!(e.target as Element).closest("[data-open-settings]")) return;
    notice.hidden = true;
    open("find-similar");
  });
  return { open, close };
}
