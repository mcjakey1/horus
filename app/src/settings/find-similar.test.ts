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
    noticesPath: vi.fn(async () => "C:/Horus/THIRD_PARTY_NOTICES.md"),
    openPath: vi.fn(async () => {}),
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

  it("a computer that can't run it shows one muted line, with no switch and no Try again (B1)", () => {
    const api = fakeApi();
    renderFindSimilar(el, st({ unsupported: "Find similar needs macOS 14 or later." }), api);
    expect($(el, "[data-unsupported]").textContent).toBe("Find similar needs macOS 14 or later.");
    expect(el.querySelector('[role="switch"]')).toBeNull();
    expect(el.querySelector('[data-act="retry"]')).toBeNull();
  });

  it("about_the_model_opens_the_notices (P5-R13, Plan 6 Task 4)", async () => {
    const api = fakeApi();
    renderFindSimilar(el, st(), api);
    $<HTMLButtonElement>(el, '[data-act="about-model"]').click();
    await tick();
    await tick();
    expect(api.openPath).toHaveBeenCalledWith("C:/Horus/THIRD_PARTY_NOTICES.md");
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
    const first = sw();
    sw().focus();
    sw().click();
    await tick();
    expect(api.similarEnable).toHaveBeenCalledTimes(1);
    expect(sw()).toBe(first); // the switch survives a phase change, so its knob animates
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
    expect(line(st({ phase: "downloading", downloadDone: 50_000_000 }))).toBe("Downloading the model · 50 MB of 213 MB");
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

  it("shows disk space used only when there is some", () => {
    renderFindSimilar(el, st({ diskBytes: 230_000_000 }), fakeApi());
    expect(el.textContent).toContain("Disk space used: 230 MB");
    renderFindSimilar(el, st(), fakeApi());
    expect(el.textContent).not.toContain("Disk space used");
  });

  it("a tick in the same phase patches the line and bar in place; a phase change rebuilds", () => {
    const api = fakeApi();
    renderFindSimilar(el, st({ phase: "downloading", downloadDone: 10_000_000 }), api);
    const sw = $(el, '[role="switch"]');
    const bar = $<HTMLProgressElement>(el, "progress");
    renderFindSimilar(el, st({ phase: "downloading", downloadDone: 90_000_000 }), api);
    expect($(el, '[role="switch"]')).toBe(sw); // same node: a click mid-tick still lands
    expect($(el, "progress")).toBe(bar);
    expect(bar.value).toBe(90_000_000);
    expect($(el, "[data-line]").textContent).toBe("Downloading the model · 90 MB of 213 MB");
    renderFindSimilar(el, st({ phase: "indexing", indexed: 1, total: 9 }), api);
    const pause = $(el, '[data-act="pause"]');
    renderFindSimilar(el, st({ phase: "indexing", indexed: 2, total: 9 }), api);
    expect($(el, '[data-act="pause"]')).toBe(pause);
    expect($(el, "[data-line]").textContent).toBe("Indexing your library · 2 of 9");
  });

  it("one persistent status line, updated on a phase change only", () => {
    const api = fakeApi();
    renderFindSimilar(el, st({ phase: "downloading", downloadDone: 10_000_000 }), api);
    const live = $(el, '[role="status"]');
    expect(live.textContent).toBe("Downloading the model · 10 MB of 213 MB");
    renderFindSimilar(el, st({ phase: "downloading", downloadDone: 20_000_000 }), api);
    expect(live.textContent).toBe("Downloading the model · 10 MB of 213 MB"); // not every tick
    renderFindSimilar(el, st({ phase: "ready", indexed: 4, total: 4 }), api);
    expect($(el, '[role="status"]')).toBe(live);
    expect(live.textContent).toBe("Ready · 4 references indexed");
    renderFindSimilar(el, st(), api);
    expect(live.textContent).toBe("Find similar is off.");
  });

  it("the switch is disabled while a call is pending, so a double-click enables once", async () => {
    const api = fakeApi();
    let finish!: (s: SimilarStatus) => void;
    vi.mocked(api.similarEnable).mockReturnValueOnce(new Promise((r) => (finish = r)));
    renderFindSimilar(el, st(), api);
    $<HTMLButtonElement>(el, '[role="switch"]').click();
    expect($(el, '[role="switch"]').getAttribute("aria-disabled")).toBe("true");
    renderFindSimilar(el, st(), api); // a status tick meanwhile keeps it disabled
    $<HTMLButtonElement>(el, '[role="switch"]').click();
    expect(api.similarEnable).toHaveBeenCalledTimes(1);
    finish(st({ phase: "downloading" }));
    await tick();
    expect($(el, '[role="switch"]').getAttribute("aria-disabled")).toBe("false");
  });

  it("Esc in the Remove confirmation cancels it", () => {
    const api = fakeApi();
    renderFindSimilar(el, st({ phase: "ready", diskBytes: 1e8, indexed: 1, total: 1 }), api);
    $<HTMLButtonElement>(el, '[data-act="remove"]').click();
    const esc = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    $(el, '[data-act="remove-cancel"]').dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
    expect(el.querySelector('[data-act="remove-confirm"]')).toBeNull();
    expect(document.activeElement).toBe($(el, '[data-act="remove"]'));
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
    // Keys stay in the dialog: the views behind it never see them (v, t, Backspace…).
    const behind = vi.fn();
    document.addEventListener("keydown", behind);
    $(dlg, ".st-title").dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true }));
    expect(behind).not.toHaveBeenCalled();
    expect(dlg.tabIndex).toBe(-1); // a click on text keeps focus in the dialog, so Esc still works
    dlg.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.removeEventListener("keydown", behind);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect($(document, "header").inert).toBe(false);
    expect(document.activeElement).toBe(gear);
    expect(unlisten).toHaveBeenCalled();
    s.close();
  });

  it("focus_trap_and_stray_keys (QA F2): Tab wraps, and a key aimed at <body> never reaches the view", async () => {
    const api = fakeApi(st({ phase: "ready", diskBytes: 1 }));
    const s = mountSettings(document.body, api);
    s.open();
    await tick();
    const dlg = $(document, '[role="dialog"]');
    const f = [...dlg.querySelectorAll<HTMLElement>("button:not([disabled])")];
    expect(f.length).toBeGreaterThan(1);
    const [first, last] = [f[0], f[f.length - 1]];
    const key = (on: EventTarget, k: string, shiftKey = false) => {
      const e = new KeyboardEvent("keydown", { key: k, shiftKey, bubbles: true, cancelable: true });
      on.dispatchEvent(e);
      return e;
    };
    last.focus();
    expect(key(last, "Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(key(first, "Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    // Focus on the dialog itself (a click on its text): Shift+Tab wraps to the last, Tab goes first.
    dlg.focus();
    expect(key(dlg, "Tab", true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(last);
    dlg.focus();
    expect(key(dlg, "Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    // Focus fell to <body> (a control went away under it): Backspace never reaches the view.
    const behind = vi.fn();
    document.addEventListener("keydown", behind);
    (document.activeElement as HTMLElement).blur();
    expect(key(document.body, "Backspace").defaultPrevented).toBe(true);
    expect(behind).not.toHaveBeenCalled();
    key(document.body, "Tab");
    expect(document.activeElement).toBe(first); // Tab from <body> comes back into the dialog
    (document.activeElement as HTMLElement).blur();
    key(document.body, "Escape");
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    key(document.body, "Backspace"); // closed: keys reach the page again
    expect(behind).toHaveBeenCalledTimes(1);
    document.removeEventListener("keydown", behind);
    s.close();
  });

  it("a late reply from an earlier open is dropped, and its listener removed", async () => {
    const api = fakeApi();
    const subs: { cb: (s: SimilarStatus) => void; done: (u: () => void) => void }[] = [];
    vi.mocked(api.onSimilarStatus).mockImplementation(
      (cb: (s: SimilarStatus) => void) => new Promise<() => void>((done) => subs.push({ cb, done })),
    );
    const s = mountSettings(document.body, api);
    s.open();
    s.close();
    s.open();
    const [u1, u2] = [vi.fn(), vi.fn()];
    subs[0].done(u1);
    subs[1].done(u2);
    await tick();
    expect(u1).toHaveBeenCalled(); // the first open's listener is gone at once
    expect(u2).not.toHaveBeenCalled();
    subs[0].cb(st({ phase: "ready", indexed: 7, total: 7 }));
    expect(document.querySelector(".settings")!.textContent).not.toContain("7 references"); // dropped
    s.close();
    expect(u2).toHaveBeenCalled();
  });
});
