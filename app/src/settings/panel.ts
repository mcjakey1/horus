// The Settings panel (Plan 5 Task 6): a modal dialog opened from the top bar's gear. The rest
// of the window goes inert while it is open, which traps focus; Esc or Close returns focus to
// whatever opened it. Find similar is its one section; it follows `similar://status` while open.
import type { Api } from "../api";
import { renderFindSimilar } from "./find-similar";

export function mountSettings(root: HTMLElement, api: Api): { open(section?: "find-similar"): void; close(): void } {
  let el: HTMLElement | null = null;
  let shell: HTMLElement[] = [];
  let opener: HTMLElement | null = null;
  let unlisten: (() => void) | null = null;
  let gone = false;

  function close() {
    if (!el) return;
    gone = true;
    unlisten?.();
    unlisten = null;
    el.remove();
    el = null;
    shell.forEach((x) => (x.inert = false));
    if (opener?.isConnected) opener.focus();
  }

  function open(section?: "find-similar") {
    if (el) return;
    gone = false;
    opener = document.activeElement as HTMLElement | null;
    shell = ([...root.children] as HTMLElement[]).filter((x) => !x.inert);
    shell.forEach((x) => (x.inert = true));
    el = document.createElement("div");
    el.className = "settings";
    el.setAttribute("role", "dialog");
    el.setAttribute("aria-modal", "true");
    el.setAttribute("aria-labelledby", "st-title");
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
    sheet.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation(); // the views underneath have their own Esc
      close();
    });
    sheet.addEventListener("click", (e) => {
      if ((e.target as Element).closest("[data-close]") || e.target === sheet) close();
    });
    sheet.querySelector<HTMLElement>("[data-close]")!.focus();
    void api.similarStatus().then((s) => {
      if (gone) return;
      renderFindSimilar(fs, s, api);
      if (section === "find-similar") fs.querySelector<HTMLElement>('[role="switch"]')?.focus();
    });
    void api
      .onSimilarStatus((s) => !gone && renderFindSimilar(fs, s, api))
      .then((u) => (gone ? u() : (unlisten = u)));
  }

  root.querySelector<HTMLElement>("#settings")?.addEventListener("click", () => open());
  return { open, close };
}
