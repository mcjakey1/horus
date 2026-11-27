// "Add images…" / "Add folder…" in the status bar: pick, import, apply the returned Change
// to the store (B4: no reopen, so the import stays undoable), then show what happened. The other
// intake routes (drop, paste, the Inbox's buttons) live in intake.ts; every route ends in the same
// notice, with the note field and the duplicate rows (Task 9).
import type { Api, Change, ImportReport, ImportResult, Skip } from "./api";
import { esc } from "./esc";
import type { DupRow } from "./intake";

export type ImportHooks = {
  libraryRoot(): string | null;
  onChange(c: Change): void;
};

/** Fired on the document after the status-bar import, so intake can add its note field and rows. */
export const IMPORTED = "horus:imported";

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
    r.added.length ? `Added ${r.added.length} to the Inbox` : "",
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

/** The summary, then the optional note field (or what was saved) and one row per duplicate (SPEC §9). */
export function intakeHTML(r: ImportReport, dups: DupRow[], savedNote?: string): string {
  const note =
    savedNote != null
      ? `<p class="intake-saved">Note saved: “${esc(savedNote)}”</p>`
      : r.added.length
        ? `<form class="intake-note" data-intake-note><input name="note" type="text" maxlength="200" autocomplete="off" aria-label="Note for the new references" placeholder="Add a short note (optional)"><button type="submit" class="text-btn">Save note</button></form>`
        : "";
  const rows = dups
    .map(
      (d) =>
        `<li>Already in your library: <i>${esc(d.title)}</i> <button type="button" class="text-btn" data-dup-show="${esc(d.existingId)}">Show</button>${
          d.action === "merge"
            ? ` <button type="button" class="text-btn" data-dup-merge="${esc(d.existingId)}" title="Adds the ${d.fills.map((f) => (f === "note" ? "note" : "source link")).join(" and ")} it lacks">Merge</button>`
            : ""
        }</li>`,
    )
    .join("");
  return summaryHTML(r) + note + (rows ? `<ul class="intake-dups">${rows}</ul>` : "");
}

/** `LibraryView.warning` (backup recovery, seed or taxonomy problems) for the notice. */
export const warningHTML = (w?: string | null) => (w ? `<p>${esc(w)}</p>` : "");

/** Shows HTML in the `#import-notice` box. No listeners: safe to make more than one. */
export function noticeIn(root: ParentNode): (html: string) => void {
  const notice = root.querySelector<HTMLElement>("#import-notice")!;
  const body = notice.querySelector<HTMLElement>("[data-body]")!;
  return (html) => {
    body.innerHTML = html;
    notice.hidden = false;
  };
}

/** Wires the status-bar import buttons and Dismiss; returns `say`. */
export function mountImport(root: HTMLElement, api: Api, hooks: ImportHooks, signal?: AbortSignal): (html: string) => void {
  const notice = root.querySelector<HTMLElement>("#import-notice")!;
  const buttons = [...root.querySelectorAll<HTMLButtonElement>("[data-import]")];
  const say = noticeIn(root);

  async function run(pick: () => Promise<string[]>) {
    if (!hooks.libraryRoot()) return;
    const paths = await pick();
    if (!paths.length) return;
    buttons.forEach((b) => (b.disabled = true));
    say(`<p>Importing…</p>`);
    try {
      const result: ImportResult = await api.importPaths(paths);
      hooks.onChange(result.change);
      say(summaryHTML(result.report));
      root.ownerDocument.dispatchEvent(new CustomEvent<ImportResult>(IMPORTED, { detail: result }));
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
        const p = await api.pickFolder("Add a folder of images");
        return p ? [p] : [];
      });
    else if ((e.target as Element).closest("#import-dismiss")) notice.hidden = true;
  }, { signal });
  return say;
}
