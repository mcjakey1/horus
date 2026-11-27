// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../api";
import { INTRO_MAX_MS, playIntro, shouldPlayIntro } from "./intro";

const settings = (introSeen: boolean): Settings => ({ lastLibrary: null, theme: "system", findSimilar: "unset", introSeen });

describe("the intro card (Plan 6 Task 4)", () => {
  beforeEach(() => {
    document.body.innerHTML = "<main></main>";
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("plays until it has been seen", () => {
    expect(shouldPlayIntro(settings(false))).toBe(true);
    expect(shouldPlayIntro(settings(true))).toBe(false);
    expect(shouldPlayIntro(null)).toBe(false); // settings unreadable: never block the start on it
  });

  it("resolves done at INTRO_MAX_MS and removes itself", async () => {
    const p = playIntro(document.body, { reducedMotion: false });
    expect(document.querySelector(".intro")).not.toBeNull();
    vi.advanceTimersByTime(INTRO_MAX_MS - 1);
    let result: string | null = null;
    void p.then((r) => (result = r));
    await Promise.resolve();
    expect(result).toBeNull();
    vi.advanceTimersByTime(1);
    expect(await p).toBe("done");
    expect(document.querySelector(".intro")).toBeNull();
  });

  it.each(["keydown", "pointerdown", "wheel"])("a %s skips it at once, and goes no further", async (type) => {
    const p = playIntro(document.body, { reducedMotion: false });
    vi.advanceTimersByTime(100);
    const below = vi.fn();
    document.body.addEventListener(type, below);
    document.body.dispatchEvent(new Event(type, { bubbles: true }));
    expect(await p).toBe("skipped");
    expect(below).not.toHaveBeenCalled(); // the skip key never reaches first run or the views
    expect(document.querySelector(".intro")).toBeNull();
  });

  it("under reduced motion it is a still frame that waits for input", async () => {
    const p = playIntro(document.body, { reducedMotion: true });
    const el = document.querySelector<HTMLElement>(".intro")!;
    expect(el.classList.contains("is-still")).toBe(true);
    for (const x of [el, ...el.querySelectorAll<HTMLElement>("*")]) {
      expect(x.style.animation).toBe("");
      expect(x.style.transition).toBe("");
    }
    vi.advanceTimersByTime(INTRO_MAX_MS * 3);
    expect(document.querySelector(".intro")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    expect(await p).toBe("skipped");
  });

  it("names Horus only, and never claims a fixed operation count", () => {
    void playIntro(document.body, { reducedMotion: true });
    const text = document.querySelector(".intro")!.textContent ?? "";
    expect(text).toContain("Horus");
    expect(text).not.toMatch(/Taxonomy of Visuals|Iris/);
    expect(text).not.toMatch(/\b(four|4) operations\b/i);
  });
});
