// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Api } from "./api";
import { mountSaveDialog } from "./save-dialog";

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
