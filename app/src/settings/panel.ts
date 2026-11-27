// The Settings panel (Plan 5 Task 6): a modal dialog opened from the top bar's gear. The rest
// of the window goes inert while it is open, and Tab wraps inside it; Esc or Close returns focus to
// whatever opened it. Find similar is its one section; it follows `similar://status` while open.
import type { Api } from "../api";
import { holdModal } from "../modal";
import { renderFindSimilar } from "./find-similar";

export function mountSettings(root: HTMLElement, api: Api): { open(section?: "find-similar"): void; close(): void } {
  let el: HTMLElement | null = null;
  let opener: HTMLElement | null = null;
  let unlisten: (() => void) | null = null;
  let release = () => {}; // the open dialog's hold on the window (modal.ts)
  let gen = 0; // bumped by every open and close, so a late reply from an earlier open is dropped

  function close() {
    if (!el) return;
    gen++;
    unlisten?.();
    unlisten = null;
    release();
    el.remove();
    el = null;
    if (opener?.isConnected) opener.focus();
  }

  function open(section?: "find-similar") {
    if (el) return;
    const id = ++gen;
    const gone = () => id !== gen;
    opener = document.activeElement as HTMLElement | null;
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
    // The rest of the window goes inert, Tab wraps, and a key aimed outside (focus fell to <body>)
    // never reaches the view behind (QA F2; modal.ts, D8).
    release = holdModal(sheet, close);
    sheet.addEventListener("keydown", (e) => {
      e.stopPropagation(); // no key reaches the views underneath (v, t, Backspace, their Esc)
      if (e.key !== "Escape") return; // the Remove confirmation stops its own Esc first
      e.preventDefault();
      close();
    });
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
