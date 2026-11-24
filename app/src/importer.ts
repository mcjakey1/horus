// "Import images…" / "Import folder…" in the status bar: pick, import, hand the returned
// `Change` to the view, then show what happened. No reopen (B4), so the import stays undoable.
import type { Api, Change, ImportReport, Skip } from "./api";
import { esc } from "./esc";

export type ImportHooks = {
  libraryRoot(): string | null;
  onChange(c: Change): void;
};

const fileName = (p: string) => p.split(/[\\/]/).pop() || p;

function reason(s: Skip): string {
  switch (s.kind) {
    case "tooLarge":
      return "larger than 500 MB";
    case "insideLibrary":
      return "already inside the library folder";
    case "unsupported":
      return "not a supported image type";
    case "unreadable":
      return `could not be read (${s.detail})`;
    case "writeFailed":
      return `could not be saved (${s.detail})`;
  }
}

/** One readable line, then the skipped files with their reasons. */
export function summaryHTML(r: ImportReport): string {
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`;
  const parts = [
    r.added.length ? `Added ${n(r.added.length, "reference")}` : "",
    r.duplicates.length ? `${n(r.duplicates.length, "file was", "files were")} already in the library` : "",
    r.skipped.length ? `${n(r.skipped.length, "file")} skipped` : "",
  ].filter(Boolean);
  const line = parts.length ? parts.join(" · ") : "Nothing to import.";
  const skipped = r.skipped
    .map(([p, why]) => `<li><span class="mono">${esc(fileName(p))}</span> ${esc(reason(why))}</li>`)
    .join("");
  // Imported, but with a caveat (e.g. an ICC profile that could not be applied).
  const warned = (r.warnings ?? [])
    .map(([p, why]) => `<li><span class="mono">${esc(fileName(p))}</span> imported with a warning: ${esc(why)}</li>`)
    .join("");
  return `<p>${esc(line)}</p>${skipped ? `<ul>${skipped}</ul>` : ""}${warned ? `<ul>${warned}</ul>` : ""}`;
}

/** `LibraryView.warning` (backup recovery, seed or taxonomy problems) for the notice. */
export const warningHTML = (w?: string | null) => (w ? `<p>${esc(w)}</p>` : "");

/** Returns `say`, which shows HTML in the `#import-notice` box (it has a Dismiss button). */
export function mountImport(root: HTMLElement, api: Api, hooks: ImportHooks, signal?: AbortSignal): (html: string) => void {
  const notice = root.querySelector<HTMLElement>("#import-notice")!;
  const body = notice.querySelector<HTMLElement>("[data-body]")!;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-import]")];
  const say = (html: string) => {
    body.innerHTML = html;
    notice.hidden = false;
  };

  async function run(pick: () => Promise<string[]>) {
    if (!hooks.libraryRoot()) return;
    const paths = await pick();
    if (!paths.length) return;
    buttons.forEach((b) => (b.disabled = true));
    say(`<p>Importing…</p>`);
    try {
      const result = await api.importPaths(paths);
      hooks.onChange(result.change);
      say(summaryHTML(result.report)); // the import's own warnings are in the summary
    } catch (err) {
      say(`<p>The import did not finish: ${esc(String(err))}</p>`);
    } finally {
      buttons.forEach((b) => (b.disabled = false));
    }
  }

  root.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLElement>("[data-import]");
    if (b?.dataset.import === "files") void run(() => api.pickImages());
    else if (b?.dataset.import === "folder")
      void run(async () => {
        const p = await api.pickFolder("Import a folder of images");
        return p ? [p] : [];
      });
    else if ((e.target as Element).closest("#import-dismiss")) notice.hidden = true;
  }, { signal });
  return say;
}
