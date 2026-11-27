// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Api, Change, Reference } from "../api";
import { openDetails } from "./details";

const ref: Reference = {
  id: "a", title: "Plate A", creator: "A. Painter", year: "c. 1906", credit: "Private collection",
  file: "a.jpg", hash: "a", width: 3, height: 4, addedAt: "2026-11-28T00:00:00Z", tags: [], thumb256: "a", thumb1024: "a",
};
const change = (r: Partial<Reference>): Change => ({ references: [{ ...ref, ...r }], removed: [], canUndo: true, canRedo: false });

let api: Api;
let applied: Change[];
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const field = (name: string) => $<HTMLInputElement>(`.details [name="${name}"]`);
const key = (el: Element, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

beforeEach(() => {
  document.body.innerHTML = `<main><button id="opener">Details…</button></main>`;
  api = { setField: vi.fn(async (_ids: string[], p: Record<string, unknown>) => change(p as Partial<Reference>)) } as unknown as Api;
  applied = [];
  $("#opener").focus();
});
let dialogs: { close(): void }[] = [];
const open = () => {
  const d = openDetails(document.body, ref, api, { apply: (c) => applied.push(c) });
  dialogs.push(d);
  return d;
};
afterEach(() => {
  dialogs.forEach((d) => d.close()); // releases holdModal's document listener
  dialogs = [];
});

describe("the Details dialog (Plan 6 Task 3c)", () => {
  it("is a labelled modal with four labelled fields, focus on Title", () => {
    open();
    const dlg = $(".details");
    expect(dlg.getAttribute("role")).toBe("dialog");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(document.getElementById(dlg.getAttribute("aria-labelledby")!)!.textContent).toBe("Details");
    for (const [name, label, value] of [["title", "Title", "Plate A"], ["creator", "Creator", "A. Painter"], ["year", "Year", "c. 1906"], ["credit", "Credit", "Private collection"]]) {
      const f = field(name);
      expect([...(f.labels ?? [])].map((l) => l.textContent)).toEqual([label]);
      expect(f.value).toBe(value);
    }
    expect(field("credit").tagName).toBe("TEXTAREA");
    expect(document.activeElement).toBe(field("title"));
    expect($("main").inert).toBe(true);
  });

  it("Enter saves only what changed, applies the change, and returns focus", async () => {
    open();
    field("title").value = "Harbour at dusk";
    field("year").value = "1906";
    key(field("title"), "Enter");
    await vi.waitFor(() => expect(document.querySelector(".details")).toBeNull());
    expect(api.setField).toHaveBeenCalledWith(["a"], { title: "Harbour at dusk", year: "1906" });
    expect(applied).toHaveLength(1);
    expect(document.activeElement).toBe($("#opener"));
    expect($("main").inert).toBe(false);
  });

  it("Save with nothing changed just closes", async () => {
    open();
    $<HTMLButtonElement>(".details [data-save]").click();
    await vi.waitFor(() => expect(document.querySelector(".details")).toBeNull());
    expect(api.setField).not.toHaveBeenCalled();
  });

  it("Esc and Cancel send nothing", () => {
    open();
    field("creator").value = "Someone else";
    key(field("creator"), "Escape");
    expect(document.querySelector(".details")).toBeNull();
    open();
    field("creator").value = "Someone else";
    $<HTMLButtonElement>(".details [data-cancel]").click();
    expect(document.querySelector(".details")).toBeNull();
    expect(api.setField).not.toHaveBeenCalled();
  });

  it("a click on the backdrop keeps the dialog and what was typed", () => {
    open();
    field("title").value = "typed";
    $(".details").click(); // the backdrop is the dialog element itself
    expect(document.querySelector(".details")).not.toBeNull();
    expect(field("title").value).toBe("typed");
  });

  it("Enter in Credit is a new line, not a save", () => {
    open();
    key(field("credit"), "Enter");
    expect(document.querySelector(".details")).not.toBeNull();
    expect(api.setField).not.toHaveBeenCalled();
  });

  it("a refused save stays open, keeps what was typed and says why", async () => {
    vi.mocked(api.setField).mockRejectedValueOnce("A title can't be empty.");
    open();
    field("title").value = "   ";
    $<HTMLButtonElement>(".details [data-save]").click();
    const err = $(".details .dt-err");
    await vi.waitFor(() => expect(err.hidden).toBe(false));
    expect(err.textContent).toBe("A title can't be empty.");
    expect(err.getAttribute("role")).toBe("status");
    expect(field("title").value).toBe("   ");
    expect(applied).toHaveLength(0);
  });

  it("an emptied optional field is sent as a clear", async () => {
    open();
    field("credit").value = "";
    $<HTMLButtonElement>(".details [data-save]").click();
    await vi.waitFor(() => expect(api.setField).toHaveBeenCalledWith(["a"], { credit: null }));
  });
});
