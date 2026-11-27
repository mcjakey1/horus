// Plan 6 Task 3c (R27, user ruling): edit a reference's title, creator, year and credit. A modal
// on holdModal; Enter in a one-line field saves, Esc cancels. Only changed fields are sent, as one
// `setField` call: one undo step. Rust trims, checks the caps and returns artist copy on a refusal.
import type { Api, FieldPatch, Reference } from "../api";
import { esc } from "../esc";
import { holdModal } from "../modal";
import type { Store } from "../store";

type Key = "title" | "creator" | "year" | "credit";
/** Label, and the cap Rust enforces (`Field::cap` in edit.rs); maxlength is only a hint here. */
const FIELDS: [Key, string, number][] = [
  ["title", "Title", 200],
  ["creator", "Creator", 120],
  ["year", "Year", 40],
  ["credit", "Credit", 400],
];

export function openDetails(root: HTMLElement, ref: Reference, api: Api, store: Pick<Store, "apply">): { close(): void } {
  const opener = document.activeElement as HTMLElement | null;
  const was: Record<Key, string> = { title: ref.title, creator: ref.creator ?? "", year: ref.year ?? "", credit: ref.credit ?? "" };
  const el = document.createElement("div");
  el.className = "settings details";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "dt-heading");
  el.tabIndex = -1;
  const row = ([k, label, max]: [Key, string, number]) => {
    const id = `dt-${k}`;
    const input =
      k === "credit"
        ? `<textarea id="${id}" name="${k}" rows="5" maxlength="${max}">${esc(was[k])}</textarea>`
        : `<input id="${id}" name="${k}" type="text" maxlength="${max}" value="${esc(was[k])}">`;
    return `<div class="dt-row"><label for="${id}">${label}</label>${input}</div>`;
  };
  el.innerHTML = `<div class="st-sheet dt-sheet">
    <div class="st-head"><h1 class="st-title" id="dt-heading">Details</h1></div>
    <div class="st-section dt-body">
      ${FIELDS.map(row).join("")}
      <p class="dt-err" role="status" hidden></p>
      <div class="dt-actions"><button type="button" class="fr-btn" data-save>Save</button><button type="button" class="text-btn" data-cancel>Cancel</button></div>
    </div>
  </div>`;
  root.append(el);
  const value = (k: Key) => el.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${k}"]`)!.value;
  const err = el.querySelector<HTMLElement>(".dt-err")!;
  let open = true;
  let saving = false;
  const close = () => {
    if (!open) return;
    open = false;
    release();
    el.remove();
    if (opener?.isConnected) opener.focus();
  };
  const release = holdModal(el, close);

  async function save() {
    if (saving) return;
    const patch: FieldPatch = {};
    for (const [k] of FIELDS) {
      const v = value(k);
      if (v !== was[k]) patch[k] = k === "title" || v.trim() ? v : null; // an emptied optional field clears
    }
    if (!Object.keys(patch).length) return close();
    saving = true;
    err.hidden = true;
    try {
      store.apply(await api.setField([ref.id], patch));
      close();
    } catch (e) {
      // Rust's copy ("A title can't be empty.", "That credit is too long: …"); what was typed stays.
      err.textContent = String(e);
      err.hidden = false;
    } finally {
      saving = false;
    }
  }

  el.addEventListener("keydown", (e) => {
    e.stopPropagation(); // the Reference view's keys never fire while it is open
    if (e.key === "Escape") return (e.preventDefault(), close());
    if (e.key === "Enter" && (e.target as Element).tagName === "INPUT") return (e.preventDefault(), void save());
  });
  el.addEventListener("click", (e) => {
    const t = e.target as Element;
    if (t.closest("[data-save]")) return void save();
    if (t.closest("[data-cancel]")) close(); // never on a backdrop click: it would drop what was typed
  });
  el.querySelector<HTMLInputElement>('[name="title"]')!.focus();
  return { close };
}
