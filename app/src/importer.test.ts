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

