// Ctrl+Z undoes, Ctrl+Shift+Z or Ctrl+Y redoes (⌘ on macOS), SPEC §6.8. Inside a text field
// the browser's own text undo runs instead and the library is left alone (Review Focus 1).
import type { Api } from "./api";
import { esc } from "./esc";
import type { Store } from "./store";

const TEXT_TYPES = new Set(["text", "search", "url", "email", "number"]);

/** A field that takes typed text (and so owns its own text undo). A tick box or radio does not. */
export function isTextEntry(el: EventTarget | null): boolean {
  const e = (el as Element | null)?.closest?.("input, textarea, [contenteditable]");
  if (!e) return false;
  if (!(e instanceof HTMLInputElement)) return true;
  return TEXT_TYPES.has(e.type); // an absent or unknown type reads as "text"
}

/** The letter a key press means: `e.key` on a Latin layout (QWERTZ's KeyZ is "y"), else the
 * physical key, so Ctrl+Z still undoes on Cyrillic, Greek and other layouts (I2). */
export function letterOf(e: KeyboardEvent): string {
  if (/^[a-z]$/i.test(e.key)) return e.key.toLowerCase(); // Shift turns "z" into "Z"
  return /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : "";
}

/** The digit 1-9 a key press means: `e.key`, else the physical digit row, so AZERTY's unshifted
 * `&é"…` still count (M3). A shifted symbol (QWERTY's `!`) stays a symbol. */
export function digitOf(e: KeyboardEvent): number | null {
  if (/^[1-9]$/.test(e.key)) return +e.key;
  const m = !e.shiftKey && /^Digit([1-9])$/.exec(e.code);
  return m ? +m[1] : null;
}

export function wireUndoKeys(doc: Document, api: Api, store: Store, notice: (html: string) => void): () => void {
  // M4: a refusal is said in plain words, but never over a save-failed notice.
  const refused = (what: string) => (err: unknown) => {
    if (doc.querySelector("#import-notice [data-save-failed]")) return;
    notice(`<p>Couldn't ${what}: ${esc(String(err).replace(/\.$/, ""))}.</p>`);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.isComposing) return; // the IME owns the keys mid-composition
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = letterOf(e);
    const redo = k === "y" || (k === "z" && e.shiftKey);
    if (k !== "z" && !redo) return;
    if (isTextEntry(e.target)) return;
    if (doc.querySelector('[role="alertdialog"]')) return; // the save dialog is up: nothing changes behind it
    e.preventDefault();
    // "Nothing to undo" is an empty Change, not a refusal: only real errors reach `refused`.
    (redo ? api.redo() : api.undo()).then((c) => store.apply(c), refused(redo ? "redo" : "undo"));
  };
  doc.addEventListener("keydown", onKey);
  return () => doc.removeEventListener("keydown", onKey);
}
