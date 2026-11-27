// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import html from "../index.html?raw";
import type { Api, Change, ImportResult } from "./api";
import { integrityHTML, mountImport, summaryHTML } from "./importer";

const text = (h: string) => {
  const d = document.createElement("div");
  d.innerHTML = h;
  return d.textContent ?? "";
};

describe("importer", () => {
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  });

  it("words each skip reason", () => {
    const out = text(
      summaryHTML({
        added: [],
        duplicates: [],
        skipped: [
          ["C:/lib/images", { kind: "insideLibrary" }],
          ["C:/in/a.psd", { kind: "unsupported", detail: "unrecognised file type" }],
        ],
      }),
    );
    expect(out).toContain("images already inside the library folder");
    expect(out).toContain("a.psd not a supported image type");
  });

  it("hands the import's change to the hook and never reopens the library (B4)", async () => {
    const change: Change = { references: [], removed: [], canUndo: true, canRedo: false };
    const result: ImportResult = { report: { added: ["d"], duplicates: [], skipped: [] }, change };
    const api = {
      pickImages: vi.fn(async () => ["C:/in/x.jpg"]),
      importPaths: vi.fn(async () => result),
      openLibrary: vi.fn(),
      onImportProgress: vi.fn(async () => () => {}),
    } as unknown as Api;
    const onChange = vi.fn();
    mountImport(document.body, api, { libraryRoot: () => "C:\\lib", onChange });
    // Design review F9: "Add", as in the Inbox.
    expect([...document.querySelectorAll("[data-import]")].map((b) => b.textContent)).toEqual(["Add images…", "Add folder…"]);
    document.querySelector<HTMLButtonElement>('[data-import="files"]')!.click();
    await vi.waitFor(() => expect(onChange).toHaveBeenCalledWith(change));
    expect(api.importPaths).toHaveBeenCalledWith(["C:/in/x.jpg"]);
    expect(api.openLibrary).not.toHaveBeenCalled();
    expect(document.querySelector("#import-notice")!.textContent).toContain("Added 1 to the Inbox");
  });

  it("shows Importing N of M with a Cancel button, and says what a cancel left out (D15)", async () => {
    let progress!: (p: { done: number; total: number }) => void;
    let finish!: (r: ImportResult) => void;
    const unlisten = vi.fn();
    const api = {
      pickImages: vi.fn(async () => ["C:/in/folder"]),
      importPaths: vi.fn(() => new Promise<ImportResult>((r) => (finish = r))),
      onImportProgress: vi.fn(async (cb: typeof progress) => ((progress = cb), unlisten)),
      cancelImport: vi.fn(async () => {}),
    } as unknown as Api;
    mountImport(document.body, api, { libraryRoot: () => "C:\\lib", onChange: vi.fn() });
    document.querySelector<HTMLButtonElement>('[data-import="files"]')!.click();
    const notice = document.querySelector<HTMLElement>("#import-notice")!;
    await vi.waitFor(() => expect(api.importPaths).toHaveBeenCalled());
    expect(notice.textContent).toContain("Importing…");
    progress({ done: 2, total: 5 });
    expect(notice.querySelector("[data-progress]")!.textContent).toBe("Importing 2 of 5");
    const cancel = notice.querySelector<HTMLButtonElement>("[data-cancel]")!;
    cancel.click();
    expect(api.cancelImport).toHaveBeenCalledTimes(1);
    expect(cancel.disabled).toBe(true);
    finish({ report: { added: ["a", "b"], duplicates: [], skipped: [], cancelled: true }, change: { references: [], removed: [], canUndo: true, canRedo: false } });
    await vi.waitFor(() => expect(notice.textContent).toContain("Added 2 to the Inbox"));
    expect(notice.textContent).toContain("Cancelled: the rest was not imported");
    expect(notice.querySelector("[data-cancel]")).toBeNull();
    expect(unlisten).toHaveBeenCalled();
  });
});

describe("integrityHTML (Plan 6 Task 2)", () => {
  const base = { sweptTmp: [], missingOriginals: [], missingThumbs: [], orphans: [], taxonomyBackupInvalid: false };
  it("says nothing for housekeeping only", () => {
    expect(integrityHTML(null)).toBe("");
    expect(integrityHTML({ ...base, sweptTmp: ["x.tmp"], missingThumbs: ["a"] })).toBe("");
  });
  it("counts in singular and plural, with one action each", () => {
    const one = integrityHTML({ ...base, orphans: ["o"], missingOriginals: ["m"] });
    expect(one).toContain("Recovered 1 image to the Inbox.");
    expect(one).toContain("1 reference is missing its image file.");
    expect(one).toContain("data-recover");
    expect(one).toContain("data-show-missing");
    const many = integrityHTML({ ...base, orphans: ["o", "p"], missingOriginals: ["m", "n"], taxonomyBackupInvalid: true });
    expect(many).toContain("Recovered 2 images to the Inbox.");
    expect(many).toContain("2 references are missing their image files.");
    expect(many).toContain("taxonomy.bak.json");
  });
});

