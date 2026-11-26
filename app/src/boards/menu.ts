// Plan 4 Task 5: the board menu for one reference (`b` in the Reference view, or its "Boards…"
// button). A checkbox per board, then "New board…". Each change is one undo step.
import type { Api } from "../api";
import { esc } from "../esc";
import type { Store } from "../store";

/** Board wire codes (Task 1) to copy; anything else, raw OS text included, gets the generic line.
 * `typed` names the board in BoardNameTaken when its id is no longer in the store. */
export function boardErrorCopy(err: unknown, store: Store, typed: string): string {
  const code = String(err);
  if (code.startsWith("BoardNameTaken:")) {
    const name = store.boards.find((b) => b.id === code.slice("BoardNameTaken:".length))?.name ?? typed.trim();
    return `A board called ${name} already exists.`;
  }
  if (code === "EmptyName") return "Give the board a name.";
  if (code.startsWith("UnknownBoard:")) return "That board is gone. It may have been undone.";
  return "That change didn't save. Try again.";
}

export function mountBoardMenu(anchor: HTMLElement, api: Api, store: Store, refId: string): { close(): void; el: HTMLElement } {
  const opener = document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
  const el = document.createElement("section");
  el.className = "board-menu";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", `Boards for ${store.refs.get(refId)?.title ?? "this reference"}`);
  const $ = <T extends Element = HTMLElement>(s: string) => el.querySelector<T>(s)!;

  function render() {
    const rows = store.boards
      .map((b) => {
        const on = b.referenceIds.includes(refId);
        return `<li><label><input type="checkbox" data-board="${esc(b.id)}"${on ? " checked" : ""}> <span>${esc(b.name)}</span> <span class="count">${b.referenceIds.length}</span></label></li>`;
      })
      .join("");
    $(".bm-list").innerHTML = rows || `<li class="none">No boards yet.</li>`;
  }

  el.innerHTML = `
    <h3 class="bm-head">Boards</h3>
    <ul class="bm-list"></ul>
    <div class="bm-create-row" hidden>
      <input class="bm-name" type="text" aria-label="New board name" placeholder="Board name">
      <button type="button" class="bm-create">Create</button>
    </div>
    <p class="bm-msg" role="status"></p>
    <div class="bm-actions"><button type="button" class="text-btn bm-new">New board…</button><button type="button" class="text-btn bm-close">Close</button></div>`;
  render();
  const say = (t: string) => ($(".bm-msg").textContent = t);

  el.addEventListener("change", (e) => {
    const box = (e.target as Element).closest<HTMLInputElement>("input[data-board]");
    const b = box && store.boards.find((x) => x.id === box.dataset.board);
    if (!box || !b) return;
    const ids = box.checked ? [...b.referenceIds.filter((id) => id !== refId), refId] : b.referenceIds.filter((id) => id !== refId);
    say("");
    api.setBoardMembers(b.id, ids).then(
      (c) => (store.apply(c), render()),
      (err) => (say(boardErrorCopy(err, store, b.name)), render()),
    );
  });

  function create() {
    const name = $<HTMLInputElement>(".bm-name").value;
    say("");
    api.createBoard(name, [refId]).then(
      (c) => {
        store.apply(c);
        $<HTMLInputElement>(".bm-name").value = "";
        $(".bm-create-row").hidden = true;
        render();
      },
      (err) => say(boardErrorCopy(err, store, name)),
    );
  }
  $(".bm-new").addEventListener("click", () => {
    $(".bm-create-row").hidden = false;
    $<HTMLInputElement>(".bm-name").focus();
  });
  $(".bm-create").addEventListener("click", create);
  $(".bm-close").addEventListener("click", () => close());
  el.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close();
    } else if (e.key === "Enter" && !e.isComposing && (e.target as Element).classList.contains("bm-name")) {
      e.preventDefault();
      create();
    }
  });

  let open = true;
  function close() {
    if (!open) return;
    open = false;
    el.remove();
    if (opener?.isConnected) opener.focus();
  }
  anchor.prepend(el);
  (el.querySelector<HTMLElement>("input[data-board]") ?? $(".bm-new")).focus();
  return { close, el };
}
