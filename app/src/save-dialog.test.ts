// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Api, SaveStatus } from "./api";
import { mountSaveDialog, wireSaveStatus } from "./save-dialog";

const tick = () => new Promise((r) => setTimeout(r, 0));

function fakeApi() {
  let fire!: (message: string) => void;
  const api = {
    onSaveFailed: vi.fn(async (cb: (m: string) => void) => {
      fire = cb;
      return () => {};
    }),
    retrySave: vi.fn(async () => {}),
    exitWithoutSaving: vi.fn(async () => {}),
  } as unknown as Api;
  return { api, fail: (m: string) => fire(m) };
}

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;

describe("save-failure dialog", () => {
  beforeEach(() => {
    document.body.innerHTML = `<main id="app"></main>`;
  });

  it("shows the reason as text, focused on Try again", async () => {
    const { api, fail } = fakeApi();
    mountSaveDialog(document.body, api);
    await tick();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    fail("<b>disk full</b>");
    const dlg = $('[role="alertdialog"]');
    expect(dlg.textContent).toContain("Couldn't save your last changes: <b>disk full</b>.");
    expect(dlg.querySelector("b")).toBeNull();
    expect(document.activeElement?.textContent).toBe("Try again");
    expect($<HTMLElement>("#app").inert).toBe(true);
  });

  it("Try again calls retrySave once, and a rejection shows the new reason", async () => {
    const { api, fail } = fakeApi();
    vi.mocked(api.retrySave).mockRejectedValueOnce("Could not read or write the library: still full");
    mountSaveDialog(document.body, api);
    await tick();
    fail("disk full");
    $<HTMLButtonElement>("[data-retry]").click();
    await tick();
    expect(api.retrySave).toHaveBeenCalledTimes(1);
    expect($('[role="alertdialog"]').textContent).toContain(
      "Couldn't save your last changes: Could not read or write the library: still full.",
    );
    expect(document.querySelectorAll('[role="alertdialog"]')).toHaveLength(1);
  });

  it("Quit without saving calls exitWithoutSaving", async () => {
    const { api, fail } = fakeApi();
    mountSaveDialog(document.body, api);
    await tick();
    fail("disk full");
    $<HTMLButtonElement>("[data-quit]").click();
    expect(api.exitWithoutSaving).toHaveBeenCalledTimes(1);
    expect(api.retrySave).not.toHaveBeenCalled();
  });
});

describe("background save status (merge ruling A)", () => {
  beforeEach(() => {
    document.body.innerHTML = `<aside id="import-notice" hidden><div data-body></div></aside>`;
  });

  function statusApi() {
    let fire!: (s: SaveStatus) => void;
    let waiting!: () => void;
    const api = {
      onSaveStatus: vi.fn(async (cb: (s: SaveStatus) => void) => {
        fire = cb;
        return () => {};
      }),
      onCloseWaiting: vi.fn(async (cb: () => void) => {
        waiting = cb;
        return () => {};
      }),
    } as unknown as Api;
    return { api, status: (s: SaveStatus) => fire(s), waiting: () => waiting() };
  }
  const notice = () => $("#import-notice");

  it("a failed background save shows its reason as text, and the next good save clears it", async () => {
    const { api, status } = statusApi();
    const off = wireSaveStatus(document.body, api);
    await tick();
    status({ ok: false, message: "library.json is locked by <OneDrive>." });
    expect(notice().hidden).toBe(false);
    expect(notice().textContent).toBe(
      "Couldn't save your last changes: library.json is locked by <OneDrive>. Horus will try again with your next change, and before it closes.",
    );
    expect(notice().querySelector("onedrive")).toBeNull();
    status({ ok: true });
    expect(notice().hidden).toBe(true);
    off();
  });

  it("a good save leaves any other notice alone", async () => {
    const { api, status } = statusApi();
    wireSaveStatus(document.body, api);
    await tick();
    notice().querySelector("[data-body]")!.innerHTML = "<p>Added 2 to the Inbox</p>";
    notice().hidden = false;
    status({ ok: true });
    expect(notice().hidden).toBe(false);
    status({ ok: false }); // no reason given
    expect(notice().textContent).toContain("Couldn't save your last changes: an unknown error.");
  });

  it("a close during an import says it is finishing first, and a good save keeps that (I1)", async () => {
    const { api, status, waiting } = statusApi();
    wireSaveStatus(document.body, api);
    await tick();
    waiting();
    expect(notice().hidden).toBe(false);
    expect(notice().textContent).toBe("Finishing the import before closing.");
    status({ ok: true });
    expect(notice().textContent).toBe("Finishing the import before closing.");
  });
});
