// Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes (⌘ on macOS), SPEC §6.8. Inside a text field
// the browser's own text undo runs instead and the library is left alone (Review Focus 1).
import type { Api } from "./api";
import type { Store } from "./store";

export function wireUndoKeys(doc: Document, api: Api, store: Store): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase(); // Shift turns "z" into "Z"
    const redo = k === "y" || (k === "z" && e.shiftKey);
    if (k !== "z" && !redo) return;
    if ((e.target as Element | null)?.closest?.("input, textarea, [contenteditable]")) return;
    e.preventDefault();
    // ponytail: a refusal (nothing to undo) leaves the store as it is; no message needed
    (redo ? api.redo() : api.undo()).then((c) => store.apply(c), () => {});
  };
  doc.addEventListener("keydown", onKey);
  return () => doc.removeEventListener("keydown", onKey);
}
