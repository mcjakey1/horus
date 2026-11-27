// Plan 5 Task 7: "Looks similar" (search option B) in the UI. Everything here exists in the DOM
// only while Find similar is ready, indexing or paused (Global Constraints: off means absent):
// a fourth margin tab on the Reference view, the search dropdown's group (search.ts renders it
// from the `similar` seam), and a drop target beside the dropdown. It also keeps the status
// bar's #find-similar line. No path here leads to tagging (SPEC §5a, §11).
import type { Api, SimilarStatus } from "./api";
import { esc } from "./esc";
import { type DropWin, dropHit } from "./intake";
import type { SearchHandle } from "./search";
import type { Store } from "./store";

const ON = new Set<SimilarStatus["phase"]>(["ready", "indexing", "paused"]);

/** The tab pane: waiting for the shown reference's answer, its ids, or a quiet line. */
type PaneState = "pending" | { ids: string[] } | { note: string } | null;

const NOTE = "Looks alike — not about technique.";
const NOT_INDEXED = "This reference isn't indexed yet.";
const FAILED = "Looks similar couldn't search just now. Try again.";
const DROP_NOTES: Record<string, string> = {
  TooLarge: "That image is too large to search with.",
  Unreadable: "Horus couldn't read that image.",
};

/** The status line: phase words in the UI face, numbers in mono (DESIGN.md). */
function statusHTML(s: SimilarStatus): string {
  const n = (v: number) => `<span class="mono">${v}</span>`;
  const word: Record<SimilarStatus["phase"], string> = {
    off: "off",
    downloading: `downloading ${n(Math.floor((100 * s.downloadDone) / Math.max(1, s.downloadTotal)))}%`,
    verifying: "downloading",
    loading: "loading",
    indexing: `indexing ${n(s.indexed)} of ${n(s.total)}`,
    paused: "paused",
    ready: "ready",
    error: "needs attention",
  };
  return `Find similar: ${word[s.phase]}`;
}

/** `hooks.search`: the Reference view's search box (drop results, scope refresh).
 * `hooks.openSettings`: Settings at its Find similar section (the status bar's click). */
export function wireSimilar(
  root: HTMLElement,
  api: Api,
  store: Store,
  win: DropWin | null,
  hooks: { search: SearchHandle; openSettings?(): void },
): { show(id: string): void; search(): ((q: string) => Promise<string[]>) | undefined; destroy(): void } {
  const life = new AbortController();
  const signal = life.signal;
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s);
  let on = false;
  let current: string | null = null; // the reference the Reference view shows
  let pane: PaneState = null;
  let seq = 0; // drops a stale similarByRef answer
  let listObs: ResizeObserver | null = null; // places the drop zone under the open list

  // ---------- the status bar ----------
  const bar = $("#find-similar");
  bar?.addEventListener("click", () => hooks.openSettings?.(), { signal });

  function setStatus(s: SimilarStatus) {
    if (signal.aborted) return;
    if (bar) bar.innerHTML = statusHTML(s);
    const want = ON.has(s.phase);
    if (want && !on) insert();
    else if (!want && on) remove();
  }

  // ---------- inserted while on, removed while off ----------
  function insert() {
    if (signal.aborted) return; // a status that lands after destroy()
    on = true;
    const tab = document.createElement("button");
    tab.setAttribute("role", "tab");
    tab.className = "m-tab";
    tab.id = "tab-similar";
    tab.setAttribute("aria-controls", "pane-similar");
    tab.setAttribute("aria-selected", "false");
    tab.tabIndex = -1;
    tab.dataset.pane = "similar";
    tab.textContent = "Looks similar";
    $(".m-tabs")?.append(tab);
    const el = document.createElement("div");
    el.className = "pane";
    el.id = "pane-similar";
    el.setAttribute("role", "tabpanel");
    el.setAttribute("aria-labelledby", "tab-similar");
    el.hidden = true;
    $("#pane-links")?.after(el);
    // Beside the dropdown's listbox, never inside it (C7). It has no keyboard path: the tab
    // above gives the same search from the keyboard.
    const zone = document.createElement("div");
    zone.className = "sim-drop";
    zone.dataset.similarDrop = "";
    zone.textContent = "Drop an image to find similar";
    $("#q-results")?.after(zone);
    // Under the open list, never beside it over the record header (design judgement §7): the
    // list's height, read as it changes, places the zone (0 while the list is hidden).
    const list = $("#q-results");
    if (list && typeof ResizeObserver === "function") {
      zone.style.setProperty("--list-h", `${list.offsetHeight}px`); // before the first observation
      listObs = new ResizeObserver(() => zone.style.setProperty("--list-h", `${list.offsetHeight}px`));
      listObs.observe(list);
    }
    tab.addEventListener("click", () => void load(), { signal });
    tab.addEventListener("focus", () => void load(), { signal });
    if (current) pending();
    void load();
  }

  function remove() {
    on = false;
    seq++;
    pane = null;
    const tab = $("#tab-similar");
    // The active pane falls back to Callouts (the Reference view's own tab click).
    if (tab?.getAttribute("aria-selected") === "true") $<HTMLElement>("#tab-callouts")?.click();
    tab?.remove();
    $("#pane-similar")?.remove();
    $("[data-similar-drop]")?.remove();
    listObs?.disconnect();
    listObs = null;
    $(".search")?.classList.remove("is-drag");
    hooks.search.refresh(); // the search's own group goes with the next keystroke
  }

  // ---------- the tab: similarByRef for the shown reference ----------
  /** A new reference: its old rows never show under it, and the wait reads as a wait. */
  function pending() {
    pane = "pending";
    paintPane();
  }

  async function load() {
    if (!on || !current) return;
    const id = current;
    const mine = ++seq;
    let next: PaneState;
    try {
      next = { ids: (await api.similarByRef(id)).map((h) => h.id) };
    } catch (err) {
      const code = String(err);
      next = code === "NotIndexedYet"
        ? { note: NOT_INDEXED }
        : code === "FindSimilarOff" || code.startsWith("UnknownReference:")
          ? { ids: [] } // no results, not an error (api.ts wire codes)
          : { note: FAILED };
    }
    if (mine !== seq || !on) return;
    pane = next;
    paintPane();
  }

  /** Plan 1 ranked rows, in rank order, with no score (Global Constraints); board scope (R15). */
  function paintPane() {
    const el = $("#pane-similar");
    if (!el || !pane) return;
    let body: string;
    if (pane === "pending") body = `<p class="none">Searching…</p>`;
    else if ("note" in pane) body = `<p class="none">${esc(pane.note)}</p>`;
    else {
      const rows = pane.ids
        .filter((id) => store.inScope(id))
        .map((id) => store.refs.get(id))
        .filter((r) => r !== undefined)
        .map((r) => `<button class="row sim-row" data-go="${esc(r.id)}" data-ref-id="${esc(r.id)}"><span class="t"><img src="${esc(api.assetUrl(r.thumb256))}" alt="${esc(r.title)}" loading="lazy"></span><span><b>${esc(r.title)}</b></span></button>`);
      body = rows.join("") || `<p class="none">Nothing in this library looks like it yet.</p>`;
    }
    el.innerHTML = `<p class="pane-note">${NOTE}</p>${body}`;
  }

  // ---------- the drop target (Tauri gives paths; HTML5 drops don't) ----------
  const unlisten = win?.onDragDropEvent(({ payload: p }) => {
    const search = $(".search");
    if (!on || !search) return;
    if (p.type === "enter" || p.type === "over") return void search.classList.add("is-drag");
    // Hit-test before `is-drag` goes: the target may be showing only because of the drag.
    const hit = p.type === "drop" && p.paths.length ? dropHit(document, p.position) : null;
    search.classList.remove("is-drag");
    if (p.type !== "drop" || !hit?.closest("[data-similar-drop]")) return; // wireIntake imports it
    // The response slot is taken now: a typed query, Esc or a later drop makes this one stale.
    const show = hooks.search.beginDrop();
    show({ note: "Searching…" });
    api.similarByFile(p.paths[0]).then(
      (hits) => on && show({ ids: hits.map((h) => h.id) }),
      (err) => on && show({ note: DROP_NOTES[String(err)] ?? FAILED }),
    );
  });

  // ---------- board scope (R15) and library switches ----------
  const unsub = store.subscribe((e) => {
    // A switch shows the new library's first reference right after (onShow), so `current`
    // stays as it is; only the old library's rows go.
    if (e.reset && on && current) pending();
    if (e.scope || e.scopeCleared) {
      paintPane();
      hooks.search.refresh();
    } else if (e.references.length) paintPane(); // a renamed title (Task 3c)
  });

  // ---------- status ----------
  api.similarStatus().then(setStatus, () => {});
  const unlistenStatus = api.onSimilarStatus((s) => {
    const wasOn = on;
    setStatus(s);
    // A finished pass can turn "isn't indexed yet" into results.
    if (wasOn && on && s.phase === "ready") void load();
  });

  return {
    show(id) {
      current = id;
      if (on) pending();
      void load();
    },
    search: () => (on ? async (q: string) => (await api.similarByText(q)).map((h) => h.id) : undefined),
    destroy() {
      life.abort();
      unsub();
      void unlisten?.then((f) => f());
      void unlistenStatus.then((f) => f());
      if (on) remove();
    },
  };
}
