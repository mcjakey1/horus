// @vitest-environment jsdom
// @ts-expect-error type error without @types/node package (as vite.config.ts)
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import manifest from "../src-tauri/resources/demo/manifest.json";
import { aboutHTML, type AboutInfo, demoCredits, FONTS, mountAbout, PRIVACY } from "./about";

const text = (h: string) => {
  const d = document.createElement("div");
  d.innerHTML = h;
  return d.textContent ?? "";
};
const info = (over: Partial<AboutInfo> = {}): AboutInfo => ({
  version: "1.0.0",
  fonts: FONTS,
  noticesPath: "C:/Horus/THIRD_PARTY_NOTICES.md",
  demoCredits: demoCredits(),
  ...over,
});

describe("About (Plan 6 Task 4)", () => {
  it("lists every font family in fonts.css, as release-check's checkFonts reads it", () => {
    const css = readFileSync("src/fonts/fonts.css", "utf8");
    const families = new Set([...css.matchAll(/font-family:\s*['"]?([^'";]+?)['"]?\s*;/g)].map((m) => m[1]));
    expect(new Set(FONTS.map((f) => f.family))).toEqual(families);
    const t = text(aboutHTML(info()));
    for (const f of families) expect(t).toContain(f);
  });

  it("shows one credit per demo record, in plain words", () => {
    const credits = demoCredits();
    expect(credits).toHaveLength(manifest.length);
    const html = aboutHTML(info());
    const d = document.createElement("div");
    d.innerHTML = html;
    expect(d.querySelectorAll(".ab-credits li")).toHaveLength(manifest.length);
    expect(d.textContent).toContain(manifest[0].credit);
    expect(d.textContent).not.toContain("is_public_domain"); // evidence for G3, not copy
    expect(credits.every((c) => c.rights.length > 0)).toBe(true);
  });

  it("states the privacy line naming the model host (G7), the version and the notices link", () => {
    const html = aboutHTML(info({ version: "1.2.3" }));
    expect(text(html)).toContain(PRIVACY);
    expect(PRIVACY).toContain("huggingface.co");
    expect(text(html)).toContain("Version 1.2.3");
    expect(html).toContain("data-notices");
  });

  it("never claims a fixed operation count, and renders data as text", () => {
    const html = aboutHTML(info({ demoCredits: demoCredits([{ title: "<i>t</i>", credit: "<img src=x onerror=1>", rights: "r" }]) }));
    expect(text(html)).not.toMatch(/\b(four|4) operations\b/i);
    const d = document.createElement("div");
    d.innerHTML = html;
    expect(d.querySelector("img")).toBeNull();
    expect(d.textContent).toContain("<img src=x onerror=1>");
  });
});

describe("the About dialog", () => {
  it("holds the window, opens the notices, and Esc closes it back to its opener", () => {
    document.body.innerHTML = `<main><button id="opener">Help</button></main>`;
    const opener = document.querySelector<HTMLButtonElement>("#opener")!;
    opener.focus();
    const openNotices = vi.fn();
    const about = mountAbout(document.body, info(), { openNotices });
    const dlg = document.querySelector<HTMLElement>(".about")!;
    expect(dlg.getAttribute("role")).toBe("dialog");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(document.querySelector<HTMLElement>("main")!.inert).toBe(true);
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close About");
    dlg.querySelector<HTMLButtonElement>("[data-notices]")!.click();
    expect(openNotices).toHaveBeenCalledWith("C:/Horus/THIRD_PARTY_NOTICES.md");
    dlg.querySelector<HTMLElement>("[data-close]")!.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".about")).toBeNull();
    expect(document.querySelector<HTMLElement>("main")!.inert).toBe(false);
    expect(document.activeElement).toBe(opener);
    about.close(); // a second close is harmless
  });

  it("Esc reaches it even when focus fell to the page (holdModal)", () => {
    document.body.innerHTML = "<main></main>";
    mountAbout(document.body, info(), { openNotices: () => {} });
    (document.activeElement as HTMLElement | null)?.blur();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".about")).toBeNull();
  });
});

