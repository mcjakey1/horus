// "Add images…" / "Add folder…" in the status bar: pick, import, apply the returned Change
// to the store (B4: no reopen, so the import stays undoable), then show what happened. The other
// intake routes (drop, paste, the Inbox's buttons) live in intake.ts; every route ends in the same
// notice, with the note field and the duplicate rows (Task 9).
import type { Api, Change, ImportReport, ImportResult, IntegrityReport, Skip } from "./api";
import { esc } from "./esc";
import type { DupRow } from "./intake";
import type { Store } from "./store";

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
  if (r.cancelled) parts.push("Cancelled: the rest was not imported"); // Plan 6 D15
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

const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** Plan 6 Task 2: the open's integrity report for the same notice. Swept leftovers and
 * rebuilt thumbnails are housekeeping and say nothing. */
export function integrityHTML(r?: IntegrityReport | null): string {
  if (!r) return "";
  let html = "";
  if (r.orphans.length)
    html += `<p>${n(r.orphans.length, "image file isn't", "image files aren't")} in the library. <button type="button" class="text-btn" data-recover>${r.orphans.length === 1 ? "Add it to the Inbox" : "Add them to the Inbox"}</button></p>`;
  if (r.missingOriginals.length)
    html += `<p>${n(r.missingOriginals.length, "reference is", "references are")} missing ${r.missingOriginals.length === 1 ? "its image file" : "their image files"}. <button type="button" class="text-btn" data-show-missing>Show them</button></p>`;
  if (r.taxonomyBackupInvalid) html += `<p>The taxonomy backup (taxonomy.bak.json) is damaged. Horus left it as it is.</p>`;
  return html;
}

/** Shows HTML in the `#import-notice` box. No listeners: safe to make more than one. */
export function noticeIn(root: ParentNode): (html: string) => void {
  const notice = root.querySelector<HTMLElement>("#import-notice")!;
  const body = notice.querySelector<HTMLElement>("[data-body]")!;
  return (html) => {
    body.innerHTML = html;
    notice.hidden = false;
    delete notice.dataset.kind; // a newer notice is no import summary until markImport says so (D9)
    delete notice.dataset.added;
  };
}

/** D9: the notice now shows an import's summary of `added`, so an undo that takes those back
 * can clear it. Call right after writing the summary. */
export function markImport(root: ParentNode, added: string[]): void {
  const notice = root.querySelector<HTMLElement>("#import-notice");
  if (!notice) return;
  notice.dataset.kind = "import";
  notice.dataset.added = added.join(" ");
}

/** D9: an undo (any change) that removes a reference the shown import summary reported hides
 * that summary. Never any other notice: a Find similar failure stays. Returns the unsubscribe. */
export function clearOnUndo(root: ParentNode, store: Store): () => void {
  return store.subscribe((c) => {
    const notice = root.querySelector<HTMLElement>("#import-notice");
    if (!notice || notice.hidden || notice.dataset.kind !== "import" || !c.removed?.length) return;
    const added = new Set((notice.dataset.added ?? "").split(" ").filter(Boolean));
    if (!c.removed.some((id) => added.has(id))) return;
    notice.hidden = true;
    delete notice.dataset.kind;
    delete notice.dataset.added;
  });
}

/** Plan 6 D15: "<verb> N of M" with a Cancel text button in `#import-notice`, until `stop()`.
 * The import uses it, and so does Task 4's "Verify image files…". Cancel calls `onCancel` once. */
export function showProgress(root: ParentNode, verb: string, onCancel: () => void): { update(done: number, total: number): void; stop(): void } {
  const notice = root.querySelector<HTMLElement>("#import-notice")!;
  noticeIn(root)(`<p data-progress>${esc(verb)}…</p><button type="button" class="text-btn" data-cancel>Cancel</button>`);
  const life = new AbortController();
  notice.addEventListener("click", (e) => {
    const b = (e.target as Element).closest<HTMLButtonElement>("[data-cancel]");
    if (!b || b.disabled) return;
    b.disabled = true;
    b.textContent = "Cancelling…";
    onCancel();
  }, { signal: life.signal });
  return {
    update(done, total) {
      const p = notice.querySelector("[data-progress]");
      if (p) p.innerHTML = `${esc(verb)} <span class="mono">${done}</span> of <span class="mono">${total}</span>`;
    },
    stop: () => life.abort(),
  };
}

/** `showProgress` for one intake: listens to `import://progress` until `done()`. `cancelled`:
 * Cancel was clicked, so an intake of several steps stops before its next one (a one-file step can
 * finish before Rust sees the flag). */
export function importProgress(root: ParentNode, api: Api): { readonly cancelled: boolean; done(): void } {
  let cancelled = false;
  const prog = showProgress(root, "Importing", () => {
    cancelled = true;
    void api.cancelImport().catch(() => {});
  });
  const unlisten = api.onImportProgress((p) => prog.update(p.done, p.total));
  return {
    get cancelled() {
      return cancelled;
    },
    done() {
      prog.stop();
      void unlisten.then((f) => f()).catch(() => {});
    },
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
    const progress = importProgress(root, api);
    try {
      const result: ImportResult = await api.importPaths(paths);
      hooks.onChange(result.change);
      say(summaryHTML(result.report));
      markImport(root, result.report.added);
      root.ownerDocument.dispatchEvent(new CustomEvent<ImportResult>(IMPORTED, { detail: result }));
    } catch (err) {
      say(`<p>The import did not finish: ${esc(String(err))}</p>`);
    } finally {
      progress.done();
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
