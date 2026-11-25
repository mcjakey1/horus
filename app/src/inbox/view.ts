// The Inbox (SPEC §5): the references with no tags, derived from the store and never stored,
// tagged one by one with the picker docked beside the grid. A just-tagged item stays, marked
// "tagged", until the artist moves on (Review Focus 3); ← and → move, and never wrap.
import type { Api, NewTag, Reference } from "../api";
import { mountWindowedGrid } from "../grid/windowed";
import { isTextEntry } from "../keys";
import type { Store } from "../store";
import { mountPicker, type PickerOpts } from "../tagging/picker";

const TILE = 160;
const GAP = 8;
export const EMPTY_COPY = "Inbox is empty. Drop, paste or open a folder to add references.";

/** An `openPicker` that docks one picker at a time in `dock`. `remember` holds a "Tag like this"
 * preset (SPEC §6.5) for a reference until it is tagged or gone, however often it is reopened. */
export function dockPicker(
  dock: HTMLElement,
  api: Api,
  store: Store,
): ((o: PickerOpts) => void) & { remember(refId: string, preset: NewTag[]): void; hide(): void; close(): void } {
  let open: ReturnType<typeof mountPicker> | null = null;
  const presets = new Map<string, NewTag[]>();
  const unsubscribe = store.subscribe(() => {
    for (const id of [...presets.keys()]) if (!store.refs.get(id) || store.refs.get(id)!.tags.length) presets.delete(id);
  });
  const hide = () => {
    open?.close();
    open = null;
  };
  const openPicker = (o: PickerOpts) => {
    hide();
    const preset = o.preset ?? presets.get(o.refId);
    open = mountPicker(dock, api, store, preset ? { ...o, preset } : o);
  };
  return Object.assign(openPicker, {
    remember: (refId: string, preset: NewTag[]) => void presets.set(refId, preset),
    hide, // close the docked picker, keeping the presets
    close() {
      hide();
      unsubscribe();
    },
  });
}

export function mountInbox(
  root: HTMLElement,
  api: Api,
  store: Store,
  deps: { openPicker(o: PickerOpts): void; closePicker(): void },
): { focus(i: number): void; focusId(id: string): void; destroy(): void } {
  root.innerHTML = `<header class="inbox-head">
      <h2 class="inbox-title">Inbox <span class="count" data-inbox-count></span></h2>
      <div class="inbox-actions"><button type="button" class="text-btn" data-intake="files">Add images…</button><button type="button" class="text-btn" data-intake="folder">Add folder…</button></div>
    </header>
    <div class="inbox-body">
      <div class="inbox-grid" role="listbox" aria-label="References to tag"></div>
      <p class="inbox-empty none" hidden></p>
      <aside class="inbox-dock" aria-label="Tagging"></aside>
    </div>`;
  const gridEl = root.querySelector<HTMLElement>(".inbox-grid")!;
  const empty = root.querySelector<HTMLElement>(".inbox-empty")!;
  empty.textContent = EMPTY_COPY;
  const S = { list: [] as string[], cur: null as string | null };

  function tile(r: Reference): HTMLElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "inbox-tile";
    b.dataset.id = r.id;
    b.setAttribute("role", "option");
    const on = r.id === S.cur;
    const tagged = r.tags.length > 0;
    b.classList.toggle("is-cur", on);
    b.classList.toggle("is-tagged", tagged);
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on || (!S.cur && r.id === S.list[0]) ? 0 : -1;
    b.title = [r.title, r.note].filter(Boolean).join(" — "); // text, never markup
    const img = document.createElement("img");
    img.src = api.assetUrl(r.thumb256);
    img.alt = r.title;
    img.setAttribute("loading", "lazy");
    img.setAttribute("decoding", "async");
    b.append(img);
    if (tagged) {
      const mark = document.createElement("span");
      mark.className = "inbox-tagged";
      mark.textContent = "tagged";
      b.append(mark);
    }
    return b;
  }
  const grid = mountWindowedGrid<Reference>(gridEl, { items: [], tile: TILE, gap: GAP, render: tile });

  /** The derived list, keeping the current item in its place while it is tagged. */
  function derive() {
    const ids = store.inbox().map((r) => r.id);
    if (S.cur && !store.refs.has(S.cur)) S.cur = null; // undone away
    if (S.cur && !ids.includes(S.cur)) {
      const at = S.list.indexOf(S.cur);
      const before = at < 0 ? ids.length : S.list.slice(0, at).filter((id) => ids.includes(id)).length;
      ids.splice(before, 0, S.cur);
    }
    S.list = ids;
  }

  function render() {
    const n = store.inbox().length;
    root.querySelector("[data-inbox-count]")!.textContent = String(n);
    const badge = root.ownerDocument.getElementById("inbox-count");
    if (badge) badge.textContent = String(n);
    empty.hidden = S.list.length > 0;
    gridEl.hidden = !S.list.length;
    const focused = (root.ownerDocument.activeElement as HTMLElement | null)?.closest?.<HTMLElement>(".inbox-tile")?.dataset.id;
    grid.update(S.list.map((id) => store.refs.get(id)!));
    if (focused) gridEl.querySelector<HTMLElement>(`.inbox-tile[data-id="${CSS.escape(focused)}"]`)?.focus();
  }

  function select(id: string) {
    S.cur = id;
    derive(); // moving on releases the previous, now tagged, item
    render();
    grid.scrollTo(S.list.indexOf(id));
    deps.openPicker({ refId: id, inbox: true });
  }

  function move(d: number) {
    const i = S.cur ? S.list.indexOf(S.cur) : -1;
    const j = i + d;
    if (i < 0 || j < 0 || j >= S.list.length) return; // the ends stay put
    select(S.list[j]);
  }

  root.addEventListener("click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>(".inbox-tile");
    if (t) select(t.dataset.id!);
  });
  root.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || e.isComposing || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const t = e.target as Element;
    if (isTextEntry(t) || t.matches?.('input[type="radio"], select')) return; // the caret, the radios
    e.preventDefault();
    move(e.key === "ArrowRight" ? 1 : -1);
  });

  const unsubscribe = store.subscribe((c) => {
    if (c.reset) S.cur = null; // another library: the same id is not the same item
    derive();
    render();
  });
  derive();
  render();

  /** Coming back to the Inbox: a tagged current item is done with (QA F2). False when it is empty. */
  function enter(): boolean {
    if (S.cur && store.refs.get(S.cur)?.tags.length) S.cur = null;
    derive();
    if (S.list.length) return true;
    render();
    deps.closePicker();
    return false;
  }

  return {
    focus(i) {
      if (enter()) select(S.list[Math.max(0, Math.min(S.list.length - 1, i))]);
    },
    /** By id, not index: a retained tagged item shifts indexes (fix round 1, I1). */
    focusId(id) {
      if (enter()) select(S.list.includes(id) ? id : S.list[0]);
    },
    destroy() {
      unsubscribe();
      grid.destroy();
    },
  };
}
