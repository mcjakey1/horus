// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Api, Change } from "./api";
import { wireUndoKeys } from "./keys";
import type { Store } from "./store";

const undone: Change = { references: [], removed: [], canUndo: false, canRedo: true };
const redone: Change = { references: [], removed: [], canUndo: true, canRedo: false };
let off = () => {};

function setup() {
  const api = { undo: vi.fn(async () => undone), redo: vi.fn(async () => redone) } as unknown as Api;
  const store = { apply: vi.fn() } as unknown as Store;
  const notice = vi.fn<(html: string) => void>();
  off = wireUndoKeys(document, api, store, notice);
  return { api, store, notice };
}
const press = (el: EventTarget, init: KeyboardEventInit) => {
  const e = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
  el.dispatchEvent(e);
  return e;
};
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("undo keys", () => {
  afterEach(() => {
    off();
    document.body.innerHTML = "";
  });

  it("Ctrl+Z on body undoes once and applies the result", async () => {
    const { api, store } = setup();
    expect(press(document.body, { key: "z", ctrlKey: true }).defaultPrevented).toBe(true);
    await tick();
    expect(api.undo).toHaveBeenCalledTimes(1);
    expect(api.redo).not.toHaveBeenCalled();
    expect(store.apply).toHaveBeenCalledWith(undone);
  });

  it("Ctrl+Shift+Z, Ctrl+Y and Cmd+Shift+Z redo", async () => {
    const { api, store } = setup();
    press(document.body, { key: "Z", ctrlKey: true, shiftKey: true });
    press(document.body, { key: "y", ctrlKey: true });
    press(document.body, { key: "z", metaKey: true, shiftKey: true });
    await tick();
    expect(api.redo).toHaveBeenCalledTimes(3);
    expect(api.undo).not.toHaveBeenCalled();
    expect(store.apply).toHaveBeenCalledWith(redone);
  });

  it("text fields keep the browser's own undo (Review Focus 1)", async () => {
    const { api } = setup();
    document.body.innerHTML = `<input id="i"><textarea id="t"></textarea><div contenteditable="true"><span id="c">x</span></div>`;
    for (const id of ["i", "t", "c"]) {
      expect(press(document.getElementById(id)!, { key: "z", ctrlKey: true }).defaultPrevented).toBe(false);
      press(document.getElementById(id)!, { key: "y", ctrlKey: true });
    }
    await tick();
    expect(api.undo).not.toHaveBeenCalled();
    expect(api.redo).not.toHaveBeenCalled();
  });

  it("tick_box_does_not_block_undo: only text-entry inputs keep the browser's undo", async () => {
    const { api } = setup();
    document.body.innerHTML = `<input id="cb" type="checkbox"><input id="rd" type="radio">`;
    for (const t of ["text", "search", "url", "email", "number"]) document.body.insertAdjacentHTML("beforeend", `<input id="${t}" type="${t}">`);
    for (const t of ["text", "search", "url", "email", "number"])
      expect(press(document.getElementById(t)!, { key: "z", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(press(document.getElementById("cb")!, { key: "z", ctrlKey: true }).defaultPrevented).toBe(true);
    press(document.getElementById("rd")!, { key: "y", ctrlKey: true });
    await tick();
    expect(api.undo).toHaveBeenCalledTimes(1);
    expect(api.redo).toHaveBeenCalledTimes(1);
  });

  it("ime_composition_is_left_alone", async () => {
    const { api } = setup();
    expect(press(document.body, { key: "z", ctrlKey: true, isComposing: true }).defaultPrevented).toBe(false);
    await tick();
    expect(api.undo).not.toHaveBeenCalled();
  });

  it("undo_sleeps_behind_the_save_dialog (merge ruling B)", async () => {
    const { api } = setup();
    document.body.innerHTML = `<div role="alertdialog"><button id="retry">Try again</button></div>`;
    expect(press(document.getElementById("retry")!, { key: "z", ctrlKey: true }).defaultPrevented).toBe(false);
    press(document.body, { key: "y", ctrlKey: true });
    await tick();
    expect(api.undo).not.toHaveBeenCalled();
    expect(api.redo).not.toHaveBeenCalled();
    document.body.innerHTML = ""; // the dialog is gone: undo works again
    press(document.body, { key: "z", ctrlKey: true });
    await tick();
    expect(api.undo).toHaveBeenCalledTimes(1);
  });

  it("non_latin_layouts: Cyrillic я on KeyZ undoes, and Shift or н on KeyY redoes (I2)", async () => {
    const { api } = setup();
    expect(press(document.body, { key: "я", code: "KeyZ", ctrlKey: true }).defaultPrevented).toBe(true);
    await tick();
    expect(api.undo).toHaveBeenCalledTimes(1);
    press(document.body, { key: "Я", code: "KeyZ", ctrlKey: true, shiftKey: true });
    press(document.body, { key: "н", code: "KeyY", ctrlKey: true });
    await tick();
    expect(api.redo).toHaveBeenCalledTimes(2);
    expect(press(document.body, { key: "ч", code: "KeyX", ctrlKey: true }).defaultPrevented).toBe(false);
  });

  it("latin_layouts_keep_their_letters: QWERTZ y on KeyZ redoes, AZERTY z on KeyW undoes", async () => {
    const { api } = setup();
    press(document.body, { key: "y", code: "KeyZ", ctrlKey: true });
    press(document.body, { key: "z", code: "KeyW", ctrlKey: true });
    await tick();
    expect(api.redo).toHaveBeenCalledTimes(1);
    expect(api.undo).toHaveBeenCalledTimes(1);
  });

  it("non_latin_text_fields_keep_their_own_undo", async () => {
    const { api } = setup();
    document.body.innerHTML = `<input id="i">`;
    expect(press(document.getElementById("i")!, { key: "я", code: "KeyZ", ctrlKey: true }).defaultPrevented).toBe(false);
    await tick();
    expect(api.undo).not.toHaveBeenCalled();
  });

  it("a refused undo changes nothing and says why in plain words (M4)", async () => {
    const { api, store, notice } = setup();
    vi.mocked(api.undo).mockRejectedValueOnce("No library is open.");
    vi.mocked(api.redo).mockRejectedValueOnce("<b>locked</b>");
    press(document.body, { key: "z", ctrlKey: true });
    press(document.body, { key: "y", ctrlKey: true });
    await tick();
    expect(store.apply).not.toHaveBeenCalled();
    expect(notice.mock.calls.map(([h]) => h)).toEqual([
      "<p>Couldn't undo: No library is open.</p>",
      "<p>Couldn't redo: &lt;b&gt;locked&lt;/b&gt;.</p>",
    ]);
  });

  it("a refused undo leaves a save-failed notice showing (M4)", async () => {
    const { api, notice } = setup();
    document.body.innerHTML = `<aside id="import-notice"><div data-body><p data-save-failed>Couldn't save your last changes</p></div></aside>`;
    vi.mocked(api.undo).mockRejectedValueOnce("No library is open.");
    press(document.body, { key: "z", ctrlKey: true });
    await tick();
    expect(notice).not.toHaveBeenCalled();
    document.getElementById("import-notice")!.hidden = true; // dismissed: the refusal may show
    vi.mocked(api.undo).mockRejectedValueOnce("No library is open.");
    press(document.body, { key: "z", ctrlKey: true });
    await tick();
    expect(notice).toHaveBeenCalledTimes(1);
  });
});
