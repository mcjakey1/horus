// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { Api, Change, ImportReport, ImportResult, Reference, Tag, Taxonomy } from "./api";
import { IMPORTED, noticeIn } from "./importer";
import { dupRows, wireIntake } from "./intake";
import { createStore, type Store } from "./store";
import { presetFrom } from "./tagging/model";
import type { PickerOpts } from "./tagging/picker";

const tax: Taxonomy = { operations: [], domains: [], branches: [], techniques: [], branchTechniques: [] };
const full = (id: string): Tag => ({ id, operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.feature", suggested: false });
const ref = (id: string, extra: Partial<Reference> = {}): Reference => ({
  id,
  title: `Plate ${id}`,
  file: `images/${id}.jpg`,
  hash: id,
  width: 1,
  height: 1,
  addedAt: "2026-11-25T00:00:00Z",
  tags: [],
  thumb256: "",
  thumb1024: "",
  ...extra,
});
const change = (refs: Reference[]): Change => ({ references: refs, removed: [], canUndo: true, canRedo: false });
const result = (report: Partial<ImportReport>, refs: Reference[] = []): ImportResult => ({
  report: { added: [], duplicates: [], skipped: [], ...report },
  change: change(refs),
});
const R1 = ref("r1", { tags: [full("t1")] });
const E = ref("e"); // an existing reference with no note and no source

type DropCb = (e: { payload: { type: string; paths?: string[]; position?: { x: number; y: number } } }) => void;

let api: Api;
let store: Store;
let drop: DropCb;
let openPicker: Mock<(o: PickerOpts) => void>;
let show: Mock<(id: string) => void>;
let off = () => {};
const body = () => document.querySelector<HTMLElement>("#import-notice [data-body]")!;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  document.body.innerHTML = `<div id="plate" data-ref-drop="r1"></div><input id="field" type="text">
    <button data-intake="files">Add images…</button><button data-intake="folder">Add folder…</button>
    <aside id="import-notice" hidden><div data-body></div><button id="import-dismiss">Dismiss</button></aside>`;
  api = {
    importPaths: vi.fn(async () => result({ added: ["n1", "n2"] }, [ref("n1"), ref("n2")])),
    importBytes: vi.fn(async () => result({ added: ["p1"] }, [ref("p1")])),
    setField: vi.fn(async () => change([])),
    pickImages: vi.fn(async () => ["C:/in/a.jpg", "C:/in/b.jpg"]),
    pickFolder: vi.fn(async () => "C:/in" as string | null),
  } as unknown as Api;
  store = createStore({ root: "C:\\lib", references: [R1, E], links: [], warning: null, taxonomyReadOnly: false }, tax);
  openPicker = vi.fn<(o: PickerOpts) => void>();
  show = vi.fn<(id: string) => void>();
  const win = { onDragDropEvent: vi.fn((cb: DropCb) => ((drop = cb), Promise.resolve(() => {}))) };
  document.elementFromPoint = vi.fn(() => document.body);
  off = wireIntake(win, document, { api, store, openPicker, notice: noticeIn(document.body), show });
});
afterEach(() => {
  off();
  Object.defineProperty(window, "devicePixelRatio", { value: 1, configurable: true });
});

const dropAt = (x: number, y: number, paths = ["C:/in/a.jpg", "C:/in/b.jpg"]) =>
  drop({ payload: { type: "drop", paths, position: { x, y } } });

function paste(target: EventTarget, items: { type: string; file?: File }[], data: Record<string, string> = {}) {
  const e = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(e, "clipboardData", {
    value: {
      items: items.map((i) => ({ kind: i.file ? "file" : "string", type: i.type, getAsFile: () => i.file ?? null })),
      getData: (t: string) => data[t] ?? "",
    },
  });
  target.dispatchEvent(e);
  return e;
}

describe("intake", () => {
  it("a drop of 2 paths imports once and applies the change", async () => {
    dropAt(10, 10);
    await flush();
    expect(api.importPaths).toHaveBeenCalledTimes(1);
    expect(api.importPaths).toHaveBeenCalledWith(["C:/in/a.jpg", "C:/in/b.jpg"]);
    expect(store.refs.has("n1") && store.refs.has("n2")).toBe(true);
    expect(body().textContent).toContain("Added 2 to the Inbox");
    expect(openPicker).not.toHaveBeenCalled();
  });

  it("drop_position_scaled: physical pixels are divided by devicePixelRatio", async () => {
    Object.defineProperty(window, "devicePixelRatio", { value: 2, configurable: true });
    dropAt(400, 300);
    await flush();
    expect(document.elementFromPoint).toHaveBeenCalledWith(200, 150);
  });

  it("a drop on a reference's plate opens the picker with its techniques (Tag like this)", async () => {
    vi.mocked(document.elementFromPoint).mockReturnValue(document.getElementById("plate"));
    vi.mocked(api.importPaths).mockResolvedValueOnce(result({ added: ["n1"] }, [ref("n1")]));
    dropAt(10, 10, ["C:/in/a.jpg"]);
    await flush();
    expect(openPicker).toHaveBeenCalledWith({ refId: "n1", preset: presetFrom(R1) });
  });

  it("enter, over and leave are not drops", async () => {
    drop({ payload: { type: "over", position: { x: 1, y: 1 } } });
    drop({ payload: { type: "leave" } });
    await flush();
    expect(api.importPaths).not.toHaveBeenCalled();
  });

  it("a PNG paste carries the source URL from its text/html", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    const e = paste(document.body, [{ type: "image/png", file }, { type: "text/html" }], {
      "text/html": `<meta charset="utf-8"><img src="https://ex.org/a.png" alt="">`,
    });
    expect(e.defaultPrevented).toBe(true);
    await flush();
    await flush();
    expect(api.importBytes).toHaveBeenCalledTimes(1);
    const [name, bytes, meta] = vi.mocked(api.importBytes).mock.calls[0];
    expect(name).toBe("a.png");
    expect([...bytes]).toEqual([1, 2, 3]);
    expect(meta).toEqual({ sourceUrl: "https://ex.org/a.png" });
    expect(store.refs.has("p1")).toBe(true);
  });

  it("a uri-list http URL is a source too; anything else is not", async () => {
    const file = new File([new Uint8Array([1])], "", { type: "image/png" });
    paste(document.body, [{ type: "image/png", file }], { "text/uri-list": "# comment\r\nhttps://ex.org/b.png" });
    await flush();
    await flush();
    expect(vi.mocked(api.importBytes).mock.calls[0]).toEqual(["pasted.png", expect.any(Uint8Array), { sourceUrl: "https://ex.org/b.png" }]);
    paste(document.body, [{ type: "image/png", file }], { "text/html": `<img src="javascript:alert(1)">` });
    await flush();
    await flush();
    expect(vi.mocked(api.importBytes).mock.calls[1][2]).toEqual({});
  });

  it("two pastes back to back both import, in order, the second after the first (fix round 1, I2)", async () => {
    let finish!: (r: ImportResult) => void;
    vi.mocked(api.importBytes)
      .mockImplementationOnce(() => new Promise<ImportResult>((r) => (finish = r)))
      .mockResolvedValueOnce(result({ added: ["p2"] }, [ref("p2")]));
    const png = (n: string) => new File([new Uint8Array([1])], n, { type: "image/png" });
    expect(paste(document.body, [{ type: "image/png", file: png("one.png") }]).defaultPrevented).toBe(true);
    expect(paste(document.body, [{ type: "image/png", file: png("two.png") }]).defaultPrevented).toBe(true);
    for (let i = 0; i < 4; i++) await flush();
    expect(vi.mocked(api.importBytes).mock.calls.map((c) => c[0])).toEqual(["one.png"]); // the second waits
    finish(result({ added: ["p1"] }, [ref("p1")]));
    for (let i = 0; i < 4; i++) await flush();
    expect(vi.mocked(api.importBytes).mock.calls.map((c) => c[0])).toEqual(["one.png", "two.png"]);
    expect(store.refs.has("p1") && store.refs.has("p2")).toBe(true);
  });

  it("a drop during a running import is queued too", async () => {
    let finish!: (r: ImportResult) => void;
    vi.mocked(api.importPaths)
      .mockImplementationOnce(() => new Promise<ImportResult>((r) => (finish = r)))
      .mockResolvedValueOnce(result({ added: ["n3"] }, [ref("n3")]));
    dropAt(1, 1, ["C:/in/a.jpg"]);
    dropAt(1, 1, ["C:/in/b.jpg"]);
    await flush();
    expect(api.importPaths).toHaveBeenCalledTimes(1);
    finish(result({ added: ["n1"] }, [ref("n1")]));
    for (let i = 0; i < 4; i++) await flush();
    expect(vi.mocked(api.importPaths).mock.calls).toEqual([[["C:/in/a.jpg"]], [["C:/in/b.jpg"]]]);
  });

  it("a paste with no image imports nothing and says so (Review Focus 5)", async () => {
    paste(document.body, [{ type: "text/plain" }], { "text/plain": "https://ex.org/a.png" });
    await flush();
    expect(api.importBytes).not.toHaveBeenCalled();
    expect(api.importPaths).not.toHaveBeenCalled();
    expect(body().textContent).toBe("Paste the image itself — Horus doesn't download from the web.");
  });

  it("a text paste into a text field stays a text paste", () => {
    const e = paste(document.getElementById("field")!, [{ type: "text/plain" }], { "text/plain": "moody" });
    expect(e.defaultPrevented).toBe(false);
    expect(document.getElementById("import-notice")!.hidden).toBe(true);
  });

  it("Add images… imports the picked files once; a cancel imports nothing", async () => {
    document.querySelector<HTMLButtonElement>('[data-intake="files"]')!.click();
    await flush();
    expect(api.importPaths).toHaveBeenCalledTimes(1);
    expect(api.importPaths).toHaveBeenCalledWith(["C:/in/a.jpg", "C:/in/b.jpg"]);
    vi.mocked(api.pickImages).mockResolvedValueOnce([]);
    document.querySelector<HTMLButtonElement>('[data-intake="files"]')!.click();
    await flush();
    expect(api.importPaths).toHaveBeenCalledTimes(1);
  });

  it("Add folder… imports the picked folder; a cancel imports nothing", async () => {
    document.querySelector<HTMLButtonElement>('[data-intake="folder"]')!.click();
    await flush();
    expect(api.pickFolder).toHaveBeenCalledWith("Add a folder of images");
    expect(api.importPaths).toHaveBeenCalledWith(["C:/in"]);
    vi.mocked(api.pickFolder).mockResolvedValueOnce(null);
    document.querySelector<HTMLButtonElement>('[data-intake="folder"]')!.click();
    await flush();
    expect(api.importPaths).toHaveBeenCalledTimes(1);
  });

  it("the note field sets the note on every new reference in one call", async () => {
    dropAt(10, 10);
    await flush();
    const form = body().querySelector<HTMLFormElement>("form[data-intake-note]")!;
    form.querySelector<HTMLInputElement>('[name="note"]')!.value = "  moody ";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(api.setField).toHaveBeenCalledTimes(1);
    expect(api.setField).toHaveBeenCalledWith(["n1", "n2"], { note: "moody" });
    expect(body().textContent).toContain("Note saved");
  });

  it("the importer's route (status bar) gets the same note field", () => {
    document.dispatchEvent(new CustomEvent(IMPORTED, { detail: result({ added: ["n1"] }) }));
    expect(body().querySelector("form[data-intake-note]")).not.toBeNull();
  });

  it("duplicates: Show opens the existing one; Merge fills only its empty fields, in one call", async () => {
    vi.mocked(api.importBytes).mockResolvedValueOnce(result({ added: ["p1"], duplicates: [["pasted.png", "e"]] }, [ref("p1")]));
    const file = new File([new Uint8Array([1])], "x.png", { type: "image/png" });
    paste(document.body, [{ type: "image/png", file }], { "text/uri-list": "https://ex.org/x.png" });
    await flush();
    await flush();
    expect(body().textContent).toContain("Already in your library: Plate e");
    body().querySelector<HTMLButtonElement>('[data-dup-show="e"]')!.click();
    expect(show).toHaveBeenCalledWith("e");
    expect(body().querySelector('[data-dup-merge="e"]')).not.toBeNull(); // the paste carried a sourceUrl
    // a note saved afterwards is intake metadata too, so Merge now fills both
    const form = body().querySelector<HTMLFormElement>("form[data-intake-note]")!;
    form.querySelector<HTMLInputElement>('[name="note"]')!.value = "moody";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    vi.mocked(api.setField).mockResolvedValueOnce(change([ref("e", { note: "moody", sourceUrl: "https://ex.org/x.png" })]));
    body().querySelector<HTMLButtonElement>('[data-dup-merge="e"]')!.click();
    await flush();
    expect(vi.mocked(api.setField).mock.lastCall).toEqual([["e"], { note: "moody", sourceUrl: "https://ex.org/x.png" }]);
    expect(api.setField).toHaveBeenCalledTimes(2);
    expect(body().querySelector('[data-dup-merge="e"]')).toBeNull(); // nothing left to fill
  });

  it("typed_text_is_text: a typed note and a returned title render as text", async () => {
    delete (window as { __xss?: number }).__xss;
    store.apply(change([ref("e", { title: "<b>t</b>" })]));
    vi.mocked(api.importPaths).mockResolvedValueOnce(result({ added: ["n1"], duplicates: [["C:/in/b.jpg", "e"]] }, [ref("n1")]));
    dropAt(10, 10);
    await flush();
    expect(body().textContent).toContain("Already in your library: <b>t</b>");
    const note = `<img src=x onerror="window.__xss=1">`;
    const form = body().querySelector<HTMLFormElement>("form[data-intake-note]")!;
    form.querySelector<HTMLInputElement>('[name="note"]')!.value = note;
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(body().textContent).toContain(note);
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(body().querySelector("b")).toBeNull();
    expect((window as { __xss?: number }).__xss).toBeUndefined();
  });

  it("after a library switch, the old notice's buttons do nothing", async () => {
    dropAt(10, 10);
    await flush();
    const form = body().querySelector<HTMLFormElement>("form[data-intake-note]")!;
    store.reset({ root: "D:\\other", references: [], links: [], warning: null, taxonomyReadOnly: false }, tax);
    form.querySelector<HTMLInputElement>('[name="note"]')!.value = "moody";
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(api.setField).not.toHaveBeenCalled();
  });

  it("a failed import says so and changes nothing", async () => {
    vi.mocked(api.importPaths).mockRejectedValueOnce("disk <full>");
    dropAt(10, 10);
    await flush();
    expect(body().textContent).toBe("The import did not finish: disk <full>");
    expect(store.refs.size).toBe(2);
  });
});

describe("dupRows", () => {
  const rep = (id: string): ImportReport => ({ added: [], duplicates: [["C:/in/x.jpg", id]], skipped: [] });
  it("an existing reference lacking the carried sourceUrl gives merge", () => {
    expect(dupRows(rep("e"), store, { sourceUrl: "https://ex.org/x.png" })).toEqual([
      { existingId: "e", title: "Plate e", action: "merge", fills: ["sourceUrl"] },
    ]);
  });
  it("no metadata gives show", () => {
    expect(dupRows(rep("e"), store, {})).toEqual([{ existingId: "e", title: "Plate e", action: "show", fills: [] }]);
  });
  it("both fields missing gives both fills; a filled field is never overwritten", () => {
    const meta = { note: "moody", sourceUrl: "https://ex.org/x.png" };
    expect(dupRows(rep("e"), store, meta)[0].fills).toEqual(["note", "sourceUrl"]);
    store.apply(change([ref("e", { note: "mine" })]));
    expect(dupRows(rep("e"), store, meta)[0].fills).toEqual(["sourceUrl"]);
  });
});
