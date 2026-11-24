// Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes (⌘ on macOS), SPEC §6.8. Inside a text field
// the browser's own text undo runs instead and the library is left alone (Review Focus 1).
import type { Api } from "./api";
import type { Store } from "./store";

const TEXT_TYPES = new Set(["text", "search", "url", "email", "number"]);

/** A field that takes typed text (and so owns its own text undo). A tick box or radio does not. */
export function isTextEntry(el: EventTarget | null): boolean {
  const e = (el as Element | null)?.closest?.("input, textarea, [contenteditable]");
  if (!e) return false;
  if (!(e instanceof HTMLInputElement)) return true;
  return TEXT_TYPES.has(e.type); // an absent or unknown type reads as "text"
}

export function wireUndoKeys(doc: Document, api: Api, store: Store): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.isComposing) return; // the IME owns the keys mid-composition
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase(); // Shift turns "z" into "Z"
    const redo = k === "y" || (k === "z" && e.shiftKey);
    if (k !== "z" && !redo) return;
    if (isTextEntry(e.target)) return;
    if (doc.querySelector('[role="alertdialog"]')) return; // the save dialog is up: nothing changes behind it
    e.preventDefault();
    // ponytail: a refusal (nothing to undo) leaves the store as it is; no message needed
    (redo ? api.redo() : api.undo()).then((c) => store.apply(c), () => {});
  };
  doc.addEventListener("keydown", onKey);
  return () => doc.removeEventListener("keydown", onKey);
}
