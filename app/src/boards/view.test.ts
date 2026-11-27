// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import html from "../../index.html?raw";
import type { Api, ExportReport } from "../api";
import type { Store } from "../store";
import { boardsApi, change, flush, ref, storeWith } from "./boards.test-util";
import { mountScopeStatus } from "./status";
import { mountBoards, moveItem } from "./view";

describe("moveItem", () => {
  it("moves one id, and leaves out-of-range moves unchanged", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    const ids = ["a", "b", "c"];
    expect(moveItem(ids, 0, 3)).toBe(ids);
    expect(moveItem(ids, -1, 1)).toBe(ids);
    expect(moveItem(ids, 1, 1)).toEqual(ids);
  });
});

describe("mountBoards", () => {
  let api: Api;
  let store: Store;
  let view: ReturnType<typeof mountBoards>;
  let openReference: ReturnType<typeof vi.fn<(id: string) => void>>;
  const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;
  const host = () => $('[data-view-host="boards"]');
  const harbour = { id: "h", name: "Harbour", referenceIds: ["r1", "r2", "r3"] };

  function mount(boards = [harbour, { id: "s", name: "Ships", referenceIds: ["r2"] }], refs = ["r1", "r2", "r3", "r4"].map((id) => ref(id)), over: Partial<Api> = {}) {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    document.body.dataset.view = "boards";
    api = boardsApi(over);
    store = storeWith(refs, boards);
    openReference = vi.fn<(id: string) => void>();
    view = mountBoards(host(), api, store, { openReference });
    view.show();
  }
  afterEach(() => view?.destroy());
  const tiles = () => [...document.querySelectorAll<HTMLElement>(".bd-tile")].map((t) => t.dataset.id);

  it("returns a ViewHandle", () => {
    mount();
    expect([typeof view.show, typeof view.hide, typeof view.destroy]).toEqual(["function", "function", "function"]);
  });

  it("lists the boards with counts, and shows the first board's tiles in order", () => {
    mount();
    const items = [...document.querySelectorAll(".bd-pick")].map((b) => b.textContent?.replace(/\s+/g, " ").trim());
    expect(items).toEqual(["Harbour 3", "Ships 1"]);
    expect(tiles()).toEqual(["r1", "r2", "r3"]);
    expect($(".bd-name").textContent).toBe("Harbour");
  });

  it("skips member ids the library doesn't have", () => {
    mount([{ id: "h", name: "Harbour", referenceIds: ["r1", "gone", "r2"] }]);
    expect(tiles()).toEqual(["r1", "r2"]);
  });

  it("after Alt+→ the moved tile keeps focus (Task 8 F3)", async () => {
    mount();
    vi.mocked(api.setBoardMembers).mockResolvedValueOnce(change({ boards: [{ id: "h", name: "Harbour", referenceIds: ["r2", "r1", "r3"] }] }));
    const t = $<HTMLElement>('.bd-tile[data-id="r1"]');
    t.focus();
    t.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }));
    await flush();
    expect((document.activeElement as HTMLElement).dataset.id).toBe("r1");
  });

  it("the refocus after a move never scrolls the grid (D19)", async () => {
    mount();
    vi.mocked(api.setBoardMembers).mockResolvedValueOnce(change({ boards: [{ id: "h", name: "Harbour", referenceIds: ["r2", "r1", "r3"] }] }));
    const spy = vi.spyOn(HTMLElement.prototype, "focus");
    $('.bd-tile[data-id="r1"]').dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }));
    await flush();
    const last = spy.mock.calls[spy.mock.calls.length - 1];
    spy.mockRestore();
    expect(last?.[0]).toEqual({ preventScroll: true });
  });

  it("reorder and Remove keep a hidden member in its slot (final review M0a)", async () => {
    mount([{ id: "h", name: "Harbour", referenceIds: ["r1", "ghost", "r2", "r3"] }]);
    $('.bd-tile[data-id="r1"]').dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }));
    await flush();
    expect(api.setBoardMembers).toHaveBeenLastCalledWith("h", ["r2", "ghost", "r1", "r3"]);
    $<HTMLButtonElement>('.bd-tile[data-id="r2"] [data-act="remove"]').click();
    await flush();
    expect(api.setBoardMembers).toHaveBeenLastCalledWith("h", ["r1", "ghost", "r3"]);
  });

  it("Alt+→ on tile 1 swaps tiles 1 and 2 in one call", async () => {
    mount();
    $('.bd-tile[data-id="r1"]').dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", altKey: true, bubbles: true }));
    await flush();
    expect(api.setBoardMembers).toHaveBeenCalledTimes(1);
    expect(api.setBoardMembers).toHaveBeenCalledWith("h", ["r2", "r1", "r3"]);
  });

  describe("tile_pointer_reorder", () => {
    const fire = (el: Element, type: string, x: number, y: number) =>
      el.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));

    it("a drag from tile 1 onto tile 3 is one setBoardMembers call", async () => {
      mount();
      const t1 = $('.bd-tile[data-id="r1"]');
      document.elementFromPoint = vi.fn(() => $('.bd-tile[data-id="r3"]'));
      fire(t1, "pointerdown", 10, 10);
      fire(t1, "pointermove", 200, 40);
      expect(document.querySelector(".bd-ghost")).not.toBeNull();
      fire(t1, "pointerup", 380, 40);
      await flush();
      expect(document.querySelector(".bd-ghost")).toBeNull();
      expect(api.setBoardMembers).toHaveBeenCalledTimes(1);
      expect(api.setBoardMembers).toHaveBeenCalledWith("h", moveItem(["r1", "r2", "r3"], 0, 2));
    });

    it("pointercancel calls nothing", async () => {
      mount();
      const t1 = $('.bd-tile[data-id="r1"]');
      document.elementFromPoint = vi.fn(() => $('.bd-tile[data-id="r3"]'));
      fire(t1, "pointerdown", 10, 10);
      fire(t1, "pointermove", 200, 40);
      fire(t1, "pointercancel", 200, 40);
      fire(t1, "pointerup", 380, 40);
      await flush();
      expect(api.setBoardMembers).not.toHaveBeenCalled();
      expect(document.querySelector(".bd-ghost")).toBeNull();
    });
  });

  it("windows a 2,000-member board: at most 200 <img>", () => {
    const refs = Array.from({ length: 2000 }, (_, i) => ref(`m${i}`));
    mount([{ id: "big", name: "Big", referenceIds: refs.map((r) => r.id) }], refs);
    const imgs = document.querySelectorAll(".bd-grid img");
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs.length).toBeLessThanOrEqual(200);
    expect(imgs[0].getAttribute("loading")).toBe("lazy"); // jsdom has no .loading property
    expect(imgs[0].getAttribute("decoding")).toBe("async");
    expect(document.querySelectorAll(".bd-grid [style]:not(.wg-sizer):not(.wg-window)")).toHaveLength(0);
  });

  it("Show only this board sets the scope, and a second press clears it", () => {
    mount();
    const btn = $<HTMLButtonElement>('[data-act="scope"]');
    btn.click();
    expect(store.scope).toBe("h");
    expect($('[data-act="scope"]').getAttribute("aria-pressed")).toBe("true");
    $<HTMLButtonElement>('[data-act="scope"]').click();
    expect(store.scope).toBeNull();
  });

  it("the scope button keeps its label; Delete sits apart, after a separator (design review F11)", () => {
    mount();
    $<HTMLButtonElement>('[data-act="scope"]').click();
    expect($('[data-act="scope"]').textContent).toBe("Show only this board"); // CSS adds " · on" while pressed
    const acts = [...document.querySelectorAll(".bd-actions > *")].map((e) => (e as HTMLElement).dataset.act ?? e.className);
    expect(acts).toEqual(["scope", "rename", "export", "sep", "delete"]);
  });

  it("Open goes to the Reference view; Remove from board drops the member", async () => {
    mount();
    $<HTMLButtonElement>('.bd-tile[data-id="r2"] [data-act="open"]').click();
    expect(openReference).toHaveBeenCalledWith("r2");
    $<HTMLButtonElement>('.bd-tile[data-id="r2"] [data-act="remove"]').click();
    await flush();
    expect(api.setBoardMembers).toHaveBeenCalledWith("h", ["r1", "r3"]);
  });

  it("selecting another board shows its tiles", () => {
    mount();
    $<HTMLButtonElement>('.bd-pick[data-board="s"]').click();
    expect(tiles()).toEqual(["r2"]);
    expect($(".bd-name").textContent).toBe("Ships");
  });

  it("Rename edits inline and calls renameBoard; a taken name keeps the field open", async () => {
    mount(undefined, undefined, { renameBoard: vi.fn(async () => Promise.reject("BoardNameTaken:s")) });
    $<HTMLButtonElement>('[data-act="rename"]').click();
    const input = $<HTMLInputElement>(".bd-rename");
    input.value = "Ships";
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect(api.renameBoard).toHaveBeenCalledWith("h", "Ships");
    expect($(".bd-msg").textContent).toBe("A board called Ships already exists.");
    expect(document.querySelector(".bd-rename")).not.toBeNull();
  });

  it("Delete asks first; when the deleted board was the scope, the status says so", async () => {
    mount(undefined, undefined, { deleteBoard: vi.fn(async () => change({ boards: [{ id: "s", name: "Ships", referenceIds: ["r2"] }] })) });
    mountScopeStatus($("#board-scope"), store);
    $<HTMLButtonElement>('[data-act="scope"]').click();
    $<HTMLButtonElement>('[data-act="delete"]').click();
    expect(api.deleteBoard).not.toHaveBeenCalled();
    expect($(".bd-msg").textContent).toContain("Delete Harbour?");
    $<HTMLButtonElement>('[data-act="delete-yes"]').click();
    await flush();
    expect(api.deleteBoard).toHaveBeenCalledWith("h");
    expect($("#board-scope").textContent).toBe("Board removed — showing all references");
    expect($(".bd-name").textContent).toBe("Ships"); // the next board is shown
  });

  describe("export", () => {
    const report = (r: Partial<ExportReport>): ExportReport => ({ written: [], credits: "credits.txt", skipped: [], ...r });
    const notice = () => $("#import-notice [data-body]").textContent!.replace(/\s+/g, " ");

    it("picks a folder and exports to it; a cancelled pick calls nothing", async () => {
      mount();
      $<HTMLButtonElement>('[data-act="export"]').click();
      await flush();
      expect(api.pickFolder).toHaveBeenCalledWith("Export board to folder");
      expect(api.exportBoard).toHaveBeenCalledWith("h", "D:/out");
      api.pickFolder = vi.fn(async () => null);
      vi.mocked(api.exportBoard).mockClear();
      $<HTMLButtonElement>('[data-act="export"]').click();
      await flush();
      expect(api.exportBoard).not.toHaveBeenCalled();
    });

    it("reads Exported N to <folder>, counting images only", async () => {
      mount(undefined, undefined, { exportBoard: vi.fn(async () => report({ written: Array.from({ length: 10 }, (_, i) => `${i} - x.jpg`) })) });
      $<HTMLButtonElement>('[data-act="export"]').click();
      await flush();
      expect(notice()).toContain("Exported 10 to D:/out");
      expect(notice()).not.toContain("skipped");
      expect(notice()).not.toContain("credits.txt was not written");
    });

    it("adds · M skipped with mapped reasons, never raw OS text", async () => {
      mount(undefined, undefined, {
        exportBoard: vi.fn(async () =>
          report({ written: ["1 - a.jpg"], skipped: [["r2", "The original is missing or unreadable: The system cannot find the file specified. (os error 2)"]] })),
      });
      $<HTMLButtonElement>('[data-act="export"]').click();
      await flush();
      expect(notice()).toContain("Exported 1 to D:/out · 1 skipped");
      expect(notice()).toContain("Plate r2: the original file is missing.");
      expect(notice()).not.toContain("os error");
    });

    it("says when credits.txt was not written", async () => {
      mount(undefined, undefined, { exportBoard: vi.fn(async () => report({ written: ["1 - a.jpg"], credits: null })) });
      $<HTMLButtonElement>('[data-act="export"]').click();
      await flush();
      expect(notice()).toContain("credits.txt was not written");
    });

    it("Show in folder reveals the folder", async () => {
      mount();
      $<HTMLButtonElement>('[data-act="export"]').click();
      await flush();
      expect($('#import-notice [data-act="reveal"]').textContent).toBe("Show in folder");
      $<HTMLButtonElement>('#import-notice [data-act="reveal"]').click();
      expect(api.revealFolder).toHaveBeenCalledWith("D:/out");
    });

    it("maps a refusal: the library message stays, raw text never shows", async () => {
      mount(undefined, undefined, { exportBoard: vi.fn(async () => Promise.reject("Choose a folder outside the library.")) });
      $<HTMLButtonElement>('[data-act="export"]').click();
      await flush();
      expect(notice()).toContain("Choose a folder outside the library.");
      api.exportBoard = vi.fn(async () => Promise.reject("That folder can't be read: Access is denied. (os error 5)"));
      $<HTMLButtonElement>('[data-act="export"]').click();
      await flush();
      expect(notice()).toContain("Horus couldn't write to that folder. Choose another.");
      expect(notice()).not.toContain("os error");
    });
  });

  // ---------- fix round 1 (I1, I2, I3) ----------
  it("I1: tile images can't start a native drag", () => {
    mount();
    expect($(".bd-tile img").getAttribute("draggable")).toBe("false");
  });

  it("I2: Show only this board from the keyboard keeps focus on it", () => {
    mount();
    const btn = $<HTMLButtonElement>('[data-act="scope"]');
    btn.focus();
    btn.click();
    expect(document.activeElement).toBe($('[data-act="scope"]'));
    expect(document.activeElement?.getAttribute("aria-pressed")).toBe("true");
  });

  it("I2: Rename focuses the field; Esc and a save return focus to Rename", async () => {
    mount(undefined, undefined, { renameBoard: vi.fn(async () => change({ boards: [{ ...harbour, name: "Docks" }] })) });
    $<HTMLButtonElement>('[data-act="rename"]').click();
    expect(document.activeElement).toBe($(".bd-rename"));
    $(".bd-rename").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.activeElement).toBe($('[data-act="rename"]'));
    $<HTMLButtonElement>('[data-act="rename"]').click();
    $<HTMLInputElement>(".bd-rename").value = "Docks";
    $(".bd-rename").dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect($(".bd-name").textContent).toBe("Docks");
    expect(document.activeElement).toBe($('[data-act="rename"]'));
  });

  it("I3: a delete prompt never deletes another board after the selection changes", async () => {
    mount();
    $<HTMLButtonElement>('[data-act="delete"]').click();
    const yes = $<HTMLButtonElement>('[data-act="delete-yes"]');
    expect(yes.dataset.board).toBe("h");
    store.apply(change({ boards: [{ id: "s", name: "Ships", referenceIds: ["r2"] }] })); // an undo removes Harbour
    expect($(".bd-name").textContent).toBe("Ships");
    expect(document.querySelector('[data-act="delete-yes"]')).toBeNull(); // the prompt went with the selection
    // A stale confirm bound to Harbour, put back by hand, still deletes nothing else.
    $(".bd-msg").append(yes);
    yes.click();
    await flush();
    expect(api.deleteBoard).not.toHaveBeenCalled();
  });

  it("says what to do when there are no boards, and New board makes an empty one (design judgement #4)", async () => {
    mount([], undefined, { createBoard: vi.fn(async () => change({ created: "n", boards: [{ id: "n", name: "Poster", referenceIds: [] }] })) });
    expect($(".bd-list").textContent).toContain("No boards yet.");
    expect($(".bd-empty").hidden).toBe(false);
    expect($(".bd-empty").textContent).toContain("press b on any reference");
    $<HTMLInputElement>(".bd-new-name").value = "Poster";
    $<HTMLButtonElement>(".bd-new").click();
    await flush();
    expect(api.createBoard).toHaveBeenCalledWith("Poster", []);
    expect($(".bd-empty").hidden).toBe(true);
    expect($(".bd-name").textContent).toBe("Poster");
  });
});
