// Plan 4 Task 5: the Boards view. A list of boards, and the selected board's tiles in board
// order (windowed, so a 2,000-member board stays light). Reorder by pointer drag or Alt+←/→;
// each move is one `setBoardMembers` call and one undo step. Export copies to a folder.
import type { Api, Board, ExportReport, Reference } from "../api";
import { esc } from "../esc";
import { mountWindowedGrid } from "../grid/windowed";
import { noticeIn } from "../importer";
import type { Store } from "../store";
import type { ViewHandle } from "../views";
import { boardErrorCopy } from "./menu";

const TILE = 160;
const GAP = 8;
const OUTSIDE = "Choose a folder outside the library.";

/** `ids` with the item at `from` moved to `to`; out-of-range indices return `ids` itself. */
export function moveItem(ids: string[], from: number, to: number): string[] {
  if (from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const out = ids.slice();
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}

/** T2's skip reasons carry raw OS text; the artist sees one of these instead. */
function skipCopy(reason: string): string {
  if (reason.startsWith("It is no longer in the library")) return "it is no longer in the library.";
  if (reason.startsWith("The original is missing") || reason.startsWith("invalid")) return "the original file is missing.";
  return "it couldn't be copied to that folder.";
}

export function mountBoards(root: HTMLElement, api: Api, store: Store, deps: { openReference(id: string): void }): ViewHandle {
  const life = new AbortController();
  const signal = life.signal;
  const say = noticeIn(document);
  const S = { board: null as string | null, renaming: false, focusAfter: null as number | null, lastDest: "" };
  root.innerHTML = `
    <div class="bd">
      <nav class="bd-list" aria-label="Boards"></nav>
      <section class="bd-main" aria-label="Board">
        <header class="bd-head"></header>
        <p class="bd-msg" role="status"></p>
        <div class="bd-grid" role="list" aria-label="References on this board"></div>
      </section>
    </div>`;
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s)!;
  const board = (): Board | undefined => store.boards.find((b) => b.id === S.board);
  /** Members the library still has, in board order (lists aren't filtered by visible()). */
  const members = (b?: Board): Reference[] => (b?.referenceIds ?? []).flatMap((id) => store.refs.get(id) ?? []);
  const msg = (t: string, html = false) => (html ? ($(".bd-msg").innerHTML = t) : ($(".bd-msg").textContent = t));

  function tile(r: Reference): HTMLElement {
    const el = document.createElement("div");
    el.className = "bd-tile";
    el.setAttribute("role", "listitem");
    el.tabIndex = 0;
    el.dataset.id = r.id;
    el.setAttribute("aria-keyshortcuts", "Alt+ArrowLeft Alt+ArrowRight");
    el.innerHTML = `<span class="bd-plate"><img src="${esc(api.assetUrl(r.thumb256))}" alt="" loading="lazy" decoding="async"></span>
      <span class="bd-title">${esc(r.title)}</span>
      <span class="bd-tools"><button type="button" class="text-btn" data-act="open">Open</button><button type="button" class="text-btn" data-act="remove" aria-label="Remove ${esc(r.title)} from this board">Remove from board</button></span>`;
    return el;
  }
  const grid = mountWindowedGrid<Reference>($(".bd-grid"), { items: [], tile: TILE, gap: GAP, render: tile });

  function renderList() {
    const nav = $(".bd-list");
    nav.innerHTML = store.boards.length
      ? `<ul>${store.boards
          .map((b) => `<li><button type="button" class="bd-pick" data-board="${esc(b.id)}"${b.id === S.board ? ' aria-current="true"' : ""}><span>${esc(b.name)}</span> <span class="count">${members(b).length}</span></button></li>`)
          .join("")}</ul>`
      : `<p class="none">No boards yet. Press b on a reference to put it on a board.</p>`;
  }

  function renderHead() {
    const b = board();
    const head = $(".bd-head");
    if (!b) {
      head.innerHTML = "";
      return;
    }
    const scoped = store.scope === b.id;
    head.innerHTML = `${S.renaming ? `<input class="bd-rename" type="text" aria-label="Board name" value="${esc(b.name)}">` : `<h2 class="bd-name">${esc(b.name)}</h2>`}
      <div class="bd-actions">
        <button type="button" class="text-btn" data-act="scope" aria-pressed="${scoped}">${scoped ? "Showing only this board" : "Show only this board"}</button>
        <button type="button" class="text-btn" data-act="rename">Rename</button>
        <button type="button" class="text-btn" data-act="export">Export board to folder…</button>
        <button type="button" class="text-btn" data-act="delete">Delete</button>
      </div>`;
    if (S.renaming) $<HTMLInputElement>(".bd-rename").select();
  }

  function render() {
    if (!board()) S.board = store.boards[0]?.id ?? null;
    renderList();
    renderHead();
    grid.update(members(board()));
    if (S.focusAfter != null) {
      $(`.bd-tile[data-i="${S.focusAfter}"]`)?.focus();
      S.focusAfter = null;
    }
  }

  /** One `setBoardMembers` call; `focus` is the tile index to focus once the Change lands. */
  function setMembers(ids: string[], focus?: number) {
    const b = board();
    if (!b) return;
    msg("");
    api.setBoardMembers(b.id, ids).then(
      (c) => {
        if (focus != null) S.focusAfter = focus;
        store.apply(c);
      },
      (err) => msg(boardErrorCopy(err, store, b.name)),
    );
  }
  const move = (from: number, to: number) => {
    const ids = members(board()).map((r) => r.id);
    const next = moveItem(ids, from, to);
    if (next !== ids && from !== to) setMembers(next, to);
  };

  async function exportBoard() {
    const b = board();
    if (!b) return;
    const dest = await api.pickFolder("Export board to folder");
    if (!dest) return;
    let report: ExportReport;
    try {
      report = await api.exportBoard(b.id, dest);
    } catch (err) {
      say(`<p>${String(err) === OUTSIDE ? OUTSIDE : "Horus couldn't write to that folder. Choose another."}</p>`);
      return;
    }
    S.lastDest = dest;
    const n = report.written.length, m = report.skipped.length;
    const reasons = report.skipped
      .map(([id, why]) => `<li>${esc(store.refs.get(id)?.title ?? "A reference")}: ${esc(skipCopy(why))}</li>`)
      .join("");
    say(
      `<p>Exported ${n} to ${esc(dest)}${m ? ` · ${m} skipped` : ""}${report.credits ? "" : " · credits.txt was not written"}</p>` +
        (m ? `<details><summary>Why some were skipped</summary><ul>${reasons}</ul></details>` : "") +
        `<p><button type="button" class="text-btn" data-act="reveal">Open folder</button></p>`,
    );
  }
  // The notice lives outside this view; its "Open folder" is wired here, once.
  document.addEventListener("click", (e) => {
    if ((e.target as Element).closest?.('#import-notice [data-act="reveal"]') && S.lastDest) void api.revealFolder(S.lastDest).catch(() => {});
  }, { signal });

  function rename(name: string) {
    const b = board();
    if (!b) return;
    api.renameBoard(b.id, name).then(
      (c) => {
        S.renaming = false;
        store.apply(c);
      },
      (err) => msg(boardErrorCopy(err, store, name)),
    );
  }

  root.addEventListener("click", (e) => {
    const t = e.target as Element;
    const pick = t.closest<HTMLElement>(".bd-pick");
    if (pick) {
      S.board = pick.dataset.board!;
      S.renaming = false;
      msg("");
      return render();
    }
    const act = t.closest<HTMLElement>("[data-act]")?.dataset.act;
    const b = board();
    if (!act || !b) return;
    const id = t.closest<HTMLElement>(".bd-tile")?.dataset.id;
    if (act === "open" && id) deps.openReference(id);
    else if (act === "remove" && id) setMembers(b.referenceIds.filter((x) => x !== id && store.refs.has(x)));
    else if (act === "scope") store.setScope(store.scope === b.id ? null : b.id);
    else if (act === "rename") {
      S.renaming = true;
      renderHead();
    } else if (act === "export") void exportBoard();
    else if (act === "delete")
      msg(`Delete ${esc(b.name)}? You can undo this. <button type="button" class="text-btn" data-act="delete-yes">Delete</button> <button type="button" class="text-btn" data-act="delete-no">Cancel</button>`, true);
    else if (act === "delete-no") msg("");
    else if (act === "delete-yes") {
      msg("");
      api.deleteBoard(b.id).then((c) => store.apply(c), (err) => msg(boardErrorCopy(err, store, b.name)));
    }
  }, { signal });

  root.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (t.classList.contains("bd-rename")) {
      if (e.key === "Enter" && !e.isComposing) rename((t as HTMLInputElement).value);
      else if (e.key === "Escape") {
        S.renaming = false;
        renderHead();
      }
      return;
    }
    const el = t.closest<HTMLElement>(".bd-tile");
    if (!el || !e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
    e.preventDefault();
    const i = +el.dataset.i!;
    move(i, i + (e.key === "ArrowRight" ? 1 : -1));
  }, { signal });

  // Reorder by drag: pointer events only, never HTML5 DnD (audit #2). A ghost follows the pointer;
  // the tile under the pointer on release is the insertion index.
  let drag: { from: number; x: number; y: number; moved: boolean; ghost: HTMLElement | null } | null = null;
  const endDrag = () => {
    drag?.ghost?.remove();
    drag = null;
  };
  root.addEventListener("pointerdown", (e) => {
    const el = (e.target as Element).closest<HTMLElement>(".bd-tile");
    if (!el || e.button !== 0 || (e.target as Element).closest("button")) return;
    el.setPointerCapture?.(e.pointerId);
    drag = { from: +el.dataset.i!, x: e.clientX, y: e.clientY, moved: false, ghost: null };
  }, { signal });
  root.addEventListener("pointermove", (e) => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) <= 4) return;
    if (!drag.ghost) {
      const src = $(`.bd-tile[data-i="${drag.from}"]`);
      drag.ghost = document.createElement("div");
      drag.ghost.className = "bd-ghost";
      drag.ghost.setAttribute("aria-hidden", "true");
      drag.ghost.innerHTML = src?.querySelector(".bd-plate")?.outerHTML ?? "";
      document.body.append(drag.ghost);
    }
    drag.moved = true;
    drag.ghost.style.setProperty("--x", `${e.clientX}px`);
    drag.ghost.style.setProperty("--y", `${e.clientY}px`);
  }, { signal });
  root.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const { from, moved } = drag;
    endDrag();
    if (!moved) return;
    const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>(".bd-grid .bd-tile");
    if (over) move(from, +over.dataset.i!);
  }, { signal });
  root.addEventListener("pointercancel", endDrag, { signal });

  const unsubscribe = store.subscribe((c) => {
    if (c.reset) S.board = null;
    if (c.boards || c.references.length || c.removed.length || c.reset || c.scope || c.scopeCleared) render();
  });
  render();

  return {
    show: () => render(),
    hide: () => endDrag(),
    destroy() {
      life.abort();
      unsubscribe();
      endDrag();
      grid.destroy();
      root.innerHTML = "";
    },
  };
}
