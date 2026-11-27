// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Api, SimilarStatus } from "../api";
import { fmtBytes, renderFindSimilar } from "./find-similar";
import { mountSettings } from "./panel";

const st = (p: Partial<SimilarStatus> = {}): SimilarStatus => ({
  phase: "off",
  downloadDone: 0,
  downloadTotal: 213_373_093,
  indexed: 0,
  total: 0,
  diskBytes: 0,
  error: null,
  ...p,
});

let listener: ((s: SimilarStatus) => void) | null = null;
const unlisten = vi.fn();
function fakeApi(start: SimilarStatus = st()) {
  listener = null;
  return {
    similarStatus: vi.fn(async () => start),
    similarEnable: vi.fn(async () => st({ phase: "downloading" })),
    similarDisable: vi.fn(async () => st()),
    similarRemoveModel: vi.fn(async () => st()),
    similarPause: vi.fn(async (p: boolean) => st({ phase: p ? "paused" : "indexing", indexed: 3, total: 10 })),
    onSimilarStatus: vi.fn(async (cb: (s: SimilarStatus) => void) => ((listener = cb), unlisten)),
  } as unknown as Api & Record<string, ReturnType<typeof vi.fn>>;
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const $ = <T extends HTMLElement = HTMLElement>(el: ParentNode, s: string) => el.querySelector<T>(s)!;

describe("fmtBytes", () => {
  it("decimal MB rounded, then GB with one decimal", () => {
    expect(fmtBytes(213_373_093)).toBe("213 MB");
    expect(fmtBytes(50_000_000)).toBe("50 MB");
    expect(fmtBytes(0)).toBe("0 MB");
    expect(fmtBytes(1_234_000_000)).toBe("1.2 GB");
  });
});

describe("Find similar section", () => {
  let el: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = "<section></section>";
    el = document.querySelector("section")!;
  });

  it("switch_calls_enable_disable", async () => {
    const api = fakeApi();
    renderFindSimilar(el, st(), api);
    const sw = () => $<HTMLButtonElement>(el, '[role="switch"]');
    expect(sw().getAttribute("aria-checked")).toBe("false");
    expect(el.textContent).toContain(
      "It downloads a 150–350 MB image model and indexes your library in the background. Recommended for machines with 8 GB of RAM or more.",
    );
    expect(el.textContent).not.toContain("Turn on Find similar?");
    sw().focus();
    sw().click();
    await tick();
    expect(api.similarEnable).toHaveBeenCalledTimes(1);
    expect(sw().getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(sw()); // a re-render keeps focus on the control
    sw().click();
    await tick();
    expect(api.similarDisable).toHaveBeenCalledTimes(1);
    expect(sw().getAttribute("aria-checked")).toBe("false");
  });

  it("progress_text_by_phase", () => {
    const api = fakeApi();
    const line = (s: SimilarStatus) => (renderFindSimilar(el, s, api), $(el, "[data-line]").textContent);
    expect(line(st({ phase: "downloading", downloadDone: 50_000_000 }))).toBe("Downloading model · 50 MB of 213 MB");
    const bar = $<HTMLProgressElement>(el, "progress");
    expect([bar.value, bar.max]).toEqual([50_000_000, 213_373_093]);
    expect(line(st({ phase: "verifying" }))).toBe("Checking the download…");
    expect(line(st({ phase: "indexing", indexed: 12, total: 50 }))).toBe("Indexing your library · 12 of 50");
    expect($(el, '[data-act="pause"]').textContent).toBe("Pause");
    expect(line(st({ phase: "paused", indexed: 12, total: 50 }))).toBe("Indexing paused · 12 of 50");
    expect($(el, '[data-act="resume"]').textContent).toBe("Resume");
    expect(line(st({ phase: "ready", indexed: 50, total: 50 }))).toBe("Ready · 50 references indexed");
    renderFindSimilar(el, st(), api);
    expect(el.querySelector("[data-line]")).toBeNull(); // off: no progress line
  });

  it("pause and resume call similarPause", async () => {
    const api = fakeApi();
    renderFindSimilar(el, st({ phase: "indexing", indexed: 3, total: 10 }), api);
    $<HTMLButtonElement>(el, '[data-act="pause"]').focus();
    $<HTMLButtonElement>(el, '[data-act="pause"]').click();
    await tick();
    expect(api.similarPause).toHaveBeenCalledWith(true);
    expect(document.activeElement).toBe($(el, '[data-act="resume"]')); // Pause hands focus to Resume
    $<HTMLButtonElement>(el, '[data-act="resume"]').click();
    await tick();
    expect(api.similarPause).toHaveBeenLastCalledWith(false);
  });

  it("shows disk space used", () => {
    renderFindSimilar(el, st({ diskBytes: 230_000_000 }), fakeApi());
    expect(el.textContent).toContain("Disk space used: 230 MB");
  });

  it("remove_needs_confirmation", async () => {
    const api = fakeApi();
    renderFindSimilar(el, st({ phase: "ready", diskBytes: 230_000_000, indexed: 5, total: 5 }), api);
    $<HTMLButtonElement>(el, '[data-act="remove"]').click();
    expect(document.activeElement).toBe($(el, '[data-act="remove-cancel"]')); // the safe choice
    expect(el.textContent).toContain("Remove the Find similar model and this library's index? You can download it again later.");
    $<HTMLButtonElement>(el, '[data-act="remove-cancel"]').click();
    expect(api.similarRemoveModel).not.toHaveBeenCalled();
    expect(el.querySelector('[data-act="remove-confirm"]')).toBeNull();
    $<HTMLButtonElement>(el, '[data-act="remove"]').click();
    $<HTMLButtonElement>(el, '[data-act="remove-confirm"]').click();
    await tick();
    expect(api.similarRemoveModel).toHaveBeenCalledTimes(1);
  });

  it("error_try_again", async () => {
    const api = fakeApi();
    renderFindSimilar(el, st({ phase: "error", error: "The download didn't finish correctly. Try again." }), api);
    expect($(el, "[data-line]").textContent).toBe("The download didn't finish correctly. Try again.");
    expect($(el, '[role="switch"]').getAttribute("aria-checked")).toBe("false");
    $<HTMLButtonElement>(el, '[data-act="retry"]').click();
    await tick();
    expect(api.similarEnable).toHaveBeenCalledTimes(1);
  });

  it("a rejected call shows the catch-all copy, never the raw text", async () => {
    const api = fakeApi();
    vi.mocked(api.similarEnable).mockRejectedValueOnce("ort::Error: LoadLibraryExW failed");
    renderFindSimilar(el, st(), api);
    $<HTMLButtonElement>(el, '[role="switch"]').click();
    await tick();
    expect($(el, "[data-line]").textContent).toBe("Find similar ran into a problem. Try again.");
    expect(el.textContent).not.toContain("LoadLibraryExW");
  });

  it("the credit is text only, with no link", () => {
    renderFindSimilar(el, st(), fakeApi());
    expect(el.textContent).toContain("SigLIP base (Google, Apache-2.0) · ONNX export by Xenova");
    expect(el.querySelector("a")).toBeNull();
  });
});

describe("Settings panel", () => {
  beforeEach(() => {
    document.body.innerHTML = `<header><button id="settings" aria-label="Settings">S</button></header><main></main>`;
  });

  it("opens as a modal dialog, follows status events, and Esc closes it back to the gear", async () => {
    const api = fakeApi(st({ phase: "indexing", indexed: 1, total: 4 }));
    const s = mountSettings(document.body, api);
    const gear = $<HTMLButtonElement>(document, "#settings");
    gear.focus();
    gear.click();
    await tick();
    const dlg = $(document, '[role="dialog"]');
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect($(document, "header").inert).toBe(true); // the rest of the window can't take focus
    expect(dlg.contains(document.activeElement)).toBe(true);
    expect($(dlg, "[data-line]").textContent).toBe("Indexing your library · 1 of 4");
    listener!(st({ phase: "indexing", indexed: 2, total: 4 }));
    expect($(dlg, "[data-line]").textContent).toBe("Indexing your library · 2 of 4");
    dlg.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect($(document, "header").inert).toBe(false);
    expect(document.activeElement).toBe(gear);
    expect(unlisten).toHaveBeenCalled();
    s.close();
  });
});
