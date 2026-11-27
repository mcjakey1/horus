// @vitest-environment jsdom
// Plan 6 Task 3b D8: one modal hold for Settings, the move dialogs and (Task 4) About.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { holdModal } from "./modal";

const key = (on: EventTarget, k: string, init: KeyboardEventInit = {}) => {
  const e = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init });
  on.dispatchEvent(e);
  return e;
};

describe("holdModal", () => {
  let sheet: HTMLElement;
  let onEscape: ReturnType<typeof vi.fn<() => void>>;
  let release: () => void;
  beforeEach(() => {
    document.body.innerHTML = `<header id="top"><button id="gear">G</button></header>
      <main id="app"><aside id="side"></aside><div id="host"><p id="near">x</p></div></main><footer id="foot"></footer>`;
    document.getElementById("foot")!.inert = true; // already inert (jsdom reflects the property, not the attribute)
    sheet = document.createElement("div");
    sheet.tabIndex = -1;
    sheet.innerHTML = `<button id="a">A</button><input id="b" aria-label="B"><button id="c" disabled>C</button><button id="d">D</button>`;
    document.getElementById("host")!.append(sheet);
    onEscape = vi.fn<() => void>();
    release = holdModal(sheet, onEscape);
  });
  afterEach(() => release());

  it("makes everything outside the sheet inert, and gives it back on release (keeping what was inert)", () => {
    const inert = (id: string) => !!(document.getElementById(id) as HTMLElement).inert; // jsdom: undefined until set
    expect(["top", "side", "near", "foot"].map(inert)).toEqual([true, true, true, true]);
    expect(["app", "host"].map(inert)).toEqual([false, false]); // the sheet's own ancestors
    release();
    expect(["top", "side", "near", "foot"].map(inert)).toEqual([false, false, false, true]);
  });

  it("wraps Tab and Shift+Tab inside the sheet, from the sheet itself too", () => {
    const [a, d] = ["a", "d"].map((id) => document.getElementById(id)!);
    d.focus();
    expect(key(d, "Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(a);
    expect(key(a, "Tab", { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(d);
    sheet.focus();
    key(sheet, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(d);
  });

  it("a key aimed outside (focus fell to <body>) never reaches the page: Tab comes back, Esc calls onEscape", () => {
    const behind = vi.fn();
    document.addEventListener("keydown", behind);
    expect(key(document.body, "Backspace").defaultPrevented).toBe(true);
    expect(behind).not.toHaveBeenCalled();
    key(document.body, "Tab");
    expect(document.activeElement).toBe(document.getElementById("a"));
    (document.activeElement as HTMLElement).blur();
    key(document.body, "Escape");
    expect(onEscape).toHaveBeenCalledTimes(1);
    release();
    key(document.body, "Backspace");
    expect(behind).toHaveBeenCalledTimes(1); // released: keys reach the page again
    document.removeEventListener("keydown", behind);
  });

  it("leaves keys inside the sheet to the sheet (an inner Esc handler still decides)", () => {
    const inner = vi.fn((e: KeyboardEvent) => e.stopPropagation());
    document.getElementById("b")!.addEventListener("keydown", inner);
    key(document.getElementById("b")!, "Escape");
    expect(inner).toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });
});
