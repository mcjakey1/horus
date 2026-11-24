// The window's close was stopped because the final save failed (B5, Review Focus 2). Rust
// keeps the window open; this asks what to do. Styled with the first-run sheet's classes.
import type { Api } from "./api";
import { esc } from "./esc";

/** A failed background save is shown at once, not only at close (SPEC §9, §11); the next good save
 * clears it. Only our own notice is cleared: an import summary shown since stays. */
export function wireSaveStatus(root: HTMLElement, api: Api): () => void {
  const notice = root.querySelector<HTMLElement>("#import-notice")!;
  const body = notice.querySelector<HTMLElement>("[data-body]")!;
  let off: (() => void) | null = null;
  let gone = false;
  void api
    .onSaveStatus((s) => {
      if (!s.ok) {
        const reason = (s.message ?? "an unknown error").replace(/\.$/, "");
        body.innerHTML = `<p data-save-failed>Couldn't save your last changes: ${esc(reason)}. Horus will try again with your next change, and before it closes.</p>`;
        notice.hidden = false;
      } else if (body.querySelector("[data-save-failed]")) {
        body.innerHTML = "";
        notice.hidden = true;
      }
    })
    .then((u) => (gone ? u() : (off = u)));
  return () => {
    gone = true;
    off?.();
  };
}

export function mountSaveDialog(root: HTMLElement, api: Api): () => void {
  let el: HTMLElement | null = null;
  let shell: HTMLElement[] = [];
  let off: (() => void) | null = null;
  let gone = false;
  void api.onSaveFailed((message) => show(message)).then((u) => (gone ? u() : (off = u)));

  function show(reason: string) {
    if (!el) {
      shell = ([...root.children] as HTMLElement[]).filter((x) => !x.inert);
      shell.forEach((x) => (x.inert = true));
      el = document.createElement("div");
      el.className = "firstrun";
      el.setAttribute("role", "alertdialog");
      el.setAttribute("aria-modal", "true");
      el.setAttribute("aria-labelledby", "sd-title");
      el.setAttribute("aria-describedby", "sd-reason");
      el.innerHTML = `<div class="fr-sheet">
        <h1 class="fr-title" id="sd-title">Your changes are not saved</h1>
        <p class="fr-error" id="sd-reason"></p>
        <div class="fr-row">
          <button class="fr-go" data-retry>Try again</button>
          <button class="fr-btn" data-quit>Quit without saving</button>
        </div>
      </div>`;
      el.addEventListener("click", (e) => {
        const t = e.target as Element;
        if (t.closest("[data-retry]")) api.retrySave().catch((err) => show(String(err)));
        else if (t.closest("[data-quit]")) void api.exitWithoutSaving();
      });
      root.append(el);
    }
    el.querySelector("#sd-reason")!.innerHTML = `Couldn't save your last changes: ${esc(reason.replace(/\.$/, ""))}.`;
    el.querySelector<HTMLElement>("[data-retry]")!.focus();
  }

  return () => {
    gone = true;
    off?.();
    el?.remove();
    shell.forEach((x) => (x.inert = false));
  };
}
