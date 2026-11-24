// Intake (SPEC §2, §6.5, §9): drag-and-drop, paste and the Inbox's file pickers. Every route
// applies the import's Change to the store (B4) and ends in the same notice: "Added N to the
// Inbox", an optional note field, and a row per duplicate (Show, or Merge its empty fields).
// Intake never asks the artist to classify anything, and never fetches a URL.
import type { DragDropEvent } from "@tauri-apps/api/webview";
import type { Api, FieldPatch, ImportMeta, ImportReport, ImportResult } from "./api";
import { esc } from "./esc";
import { IMPORTED, intakeHTML } from "./importer";
import { isTextEntry } from "./keys";
import type { Store } from "./store";
import { presetFrom } from "./tagging/model";
import type { PickerOpts } from "./tagging/picker";

export type IntakeDeps = {
  api: Api;
  store: Store;
  openPicker(opts: PickerOpts): void;
  notice(html: string): void;
  /** A duplicate's Show: open that reference (switching views if needed). */
  show?(id: string): void;
};
export type DupRow = { existingId: string; title: string; action: "show" | "merge"; fills: ("note" | "sourceUrl")[] };
/** What `getCurrentWebview()` offers; the payload's position is in physical pixels. */
export type DropWin = { onDragDropEvent(cb: (e: { payload: DragDropEvent }) => void): Promise<() => void> };

export const NO_IMAGE = "Paste the image itself — Horus doesn't download from the web.";
const FIELDS = ["note", "sourceUrl"] as const;
const isHttp = (s?: string | null): s is string => !!s && /^https?:\/\//i.test(s.trim());

/** One row per existing reference an intake duplicated. Merge only fills what it lacks (Decision 1). */
export function dupRows(report: ImportReport, store: Store, meta: ImportMeta): DupRow[] {
  const ids = [...new Set(report.duplicates.map(([, id]) => id))];
  return ids.flatMap((id) => {
    const r = store.refs.get(id);
    if (!r) return [];
    const fills = FIELDS.filter((k) => meta[k]?.trim() && !r[k]?.trim());
    return [{ existingId: id, title: r.title, action: fills.length ? "merge" : "show", fills }];
  });
}

/** The page the image came from, if the clipboard says (never fetched). DOMParser loads nothing. */
function sourceUrlOf(dt: DataTransfer): string | undefined {
  const html = dt.getData("text/html");
  const src = html ? new DOMParser().parseFromString(html, "text/html").querySelector("img[src]")?.getAttribute("src") : null;
  if (isHttp(src)) return src.trim();
  return dt
    .getData("text/uri-list")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => !l.startsWith("#") && isHttp(l));
}

export function wireIntake(win: DropWin | null, doc: Document, deps: IntakeDeps): () => void {
  const { api, store } = deps;
  // The latest notice's import, for its note field and duplicate rows; gone after a library switch.
  let last: { report: ImportReport; meta: ImportMeta; saved?: string } | null = null;
  let busy = false;

  const render = () => last && deps.notice(intakeHTML(last.report, dupRows(last.report, store, last.meta), last.saved));
  const failed = (what: string) => (err: unknown) => deps.notice(`<p>${esc(what)}: ${esc(String(err))}</p>`);
  function shown(report: ImportReport, meta: ImportMeta) {
    last = { report, meta };
    render();
  }

  /** Runs imports one after another, applying each Change, then shows one notice for them all. */
  async function run(meta: ImportMeta, steps: (() => Promise<ImportResult>)[]): Promise<string[] | null> {
    if (busy || !steps.length) return null;
    busy = true;
    deps.notice(`<p>Importing…</p>`);
    const all: ImportReport = { added: [], duplicates: [], skipped: [], warnings: [] };
    try {
      for (const step of steps) {
        const r = await step();
        store.apply(r.change);
        all.added.push(...r.report.added);
        all.duplicates.push(...r.report.duplicates);
        all.skipped.push(...r.report.skipped);
        all.warnings!.push(...(r.report.warnings ?? []));
      }
      shown(all, meta);
      return all.added;
    } catch (err) {
      failed("The import did not finish")(err);
      return null;
    } finally {
      busy = false;
    }
  }
  const importPaths = (paths: string[]) => (paths.length ? run({}, [() => api.importPaths(paths)]) : Promise.resolve(null));

  // ---------- drag and drop ----------
  const unlisten = win?.onDragDropEvent(({ payload: p }) => {
    if (p.type !== "drop" || !p.paths.length) return;
    const dpr = window.devicePixelRatio || 1; // Tauri reports physical pixels; hit-testing wants CSS ones
    const hit = doc.elementFromPoint?.(p.position.x / dpr, p.position.y / dpr);
    const onto = hit?.closest<HTMLElement>("[data-ref-drop]")?.dataset.refDrop;
    const source = onto ? store.refs.get(onto) : undefined;
    void importPaths(p.paths).then((added) => {
      // "Tag like this" (SPEC §6.5): each new reference starts with the source's techniques ticked.
      if (source && added) for (const id of added) deps.openPicker({ refId: id, preset: presetFrom(source) });
    });
  });

  // ---------- paste ----------
  const onPaste = (e: ClipboardEvent) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const files = [...dt.items]
      .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
      .map((i) => i.getAsFile())
      .filter((f): f is File => !!f);
    if (!files.length) {
      if (!isTextEntry(e.target)) deps.notice(`<p>${esc(NO_IMAGE)}</p>`); // a text paste into a field stays one
      return;
    }
    e.preventDefault();
    const url = sourceUrlOf(dt);
    const meta: ImportMeta = url ? { sourceUrl: url } : {};
    void run(
      meta,
      files.map((f) => async () => api.importBytes(f.name || "pasted.png", new Uint8Array(await f.arrayBuffer()), meta)),
    );
  };

  // ---------- the notice's note field and duplicate rows; the Inbox's pickers ----------
  const onSubmit = (e: Event) => {
    const form = (e.target as Element).closest?.<HTMLFormElement>("form[data-intake-note]");
    if (!form) return;
    e.preventDefault();
    const note = (form.elements.namedItem("note") as HTMLInputElement | null)?.value.trim();
    const cur = last;
    if (!note || !cur) return;
    const ids = cur.report.added.filter((id) => store.refs.has(id));
    const done = () => {
      if (last !== cur) return;
      cur.meta = { ...cur.meta, note }; // now intake metadata: a duplicate may merge it
      cur.saved = note;
      render();
    };
    if (!ids.length) return done();
    // One call for the whole batch: one undo step.
    api.setField(ids, { note }).then((c) => (store.apply(c), done()), failed("The note was not saved"));
  };

  const onClick = (e: Event) => {
    const t = e.target as Element;
    const pick = t.closest<HTMLElement>("[data-intake]")?.dataset.intake;
    if (pick === "files") return void api.pickImages().then(importPaths);
    if (pick === "folder") return void api.pickFolder("Add a folder of images").then((p) => importPaths(p ? [p] : []));
    const showId = t.closest<HTMLElement>("[data-dup-show]")?.dataset.dupShow;
    if (showId) return deps.show?.(showId);
    const mergeId = t.closest<HTMLElement>("[data-dup-merge]")?.dataset.dupMerge;
    if (!mergeId || !last) return;
    const cur = last;
    const row = dupRows(cur.report, store, cur.meta).find((d) => d.existingId === mergeId && d.action === "merge");
    if (!row) return;
    const patch: FieldPatch = {};
    for (const k of row.fills) patch[k] = cur.meta[k]!.trim(); // only the empty fields; absent keys keep theirs
    api.setField([mergeId], patch).then(
      (c) => {
        store.apply(c);
        if (last === cur) render();
      },
      failed("The merge did not finish"),
    );
  };

  const onImported = (e: Event) => shown((e as CustomEvent<ImportResult>).detail.report, {});
  const unsubscribe = store.subscribe((c) => {
    if (c.reset) last = null; // the old library's ids mean nothing now
  });

  doc.addEventListener("paste", onPaste);
  doc.addEventListener("submit", onSubmit);
  doc.addEventListener("click", onClick);
  doc.addEventListener(IMPORTED, onImported);
  return () => {
    void unlisten?.then((f) => f());
    unsubscribe();
    doc.removeEventListener("paste", onPaste);
    doc.removeEventListener("submit", onSubmit);
    doc.removeEventListener("click", onClick);
    doc.removeEventListener(IMPORTED, onImported);
  };
}
