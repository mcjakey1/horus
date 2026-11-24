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
  off = wireUndoKeys(document, api, store);
  return { api, store };
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

  it("a refused undo (nothing to undo) changes nothing and does not throw", async () => {
    const { api, store } = setup();
    vi.mocked(api.undo).mockRejectedValueOnce("NothingToUndo");
    press(document.body, { key: "z", ctrlKey: true });
    await tick();
    expect(store.apply).not.toHaveBeenCalled();
  });
});
