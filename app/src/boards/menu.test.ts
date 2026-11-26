// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { boardErrorCopy, mountBoardMenu } from "./menu";
import { boardsApi, change, flush, ref, storeWith } from "./boards.test-util";

describe("mountBoardMenu", () => {
  let host: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = `<div id="host"></div>`;
    host = document.getElementById("host")!;
  });
  const harbour = { id: "h", name: "Harbour", referenceIds: ["r1", "r2"] };
  const ships = { id: "s", name: "Ships", referenceIds: ["r3"] };
  const $ = <T extends Element = HTMLElement>(s: string) => document.querySelector<T>(s)!;

  it("lists the boards with a checkbox each, ticked for membership", () => {
    const store = storeWith([ref("r1"), ref("r2"), ref("r3")], [harbour, ships]);
    mountBoardMenu(host, boardsApi(), store, "r3");
    const boxes = [...document.querySelectorAll<HTMLInputElement>(".board-menu input[type=checkbox]")];
    expect(boxes.map((b) => [b.dataset.board, b.checked])).toEqual([["h", false], ["s", true]]);
  });

  it("ticking Harbour for r3 appends it; unticking removes it", async () => {
    const store = storeWith([ref("r1"), ref("r2"), ref("r3")], [harbour, ships]);
    const api = boardsApi();
    mountBoardMenu(host, api, store, "r3");
    $<HTMLInputElement>('[data-board="h"]').click();
    await flush();
    expect(api.setBoardMembers).toHaveBeenCalledWith("h", ["r1", "r2", "r3"]);
    $<HTMLInputElement>('[data-board="s"]').click();
    await flush();
    expect(api.setBoardMembers).toHaveBeenLastCalledWith("s", []);
  });

  it("New board… creates a board holding this reference", async () => {
    const store = storeWith([ref("r3")], []);
    const api = boardsApi({ createBoard: vi.fn(async () => change({ boards: [{ id: "n", name: "Ships", referenceIds: ["r3"] }] })) });
    mountBoardMenu(host, api, store, "r3");
    $<HTMLButtonElement>(".bm-new").click();
    const name = $<HTMLInputElement>(".bm-name");
    name.value = "Ships";
    name.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await flush();
    expect(api.createBoard).toHaveBeenCalledWith("Ships", ["r3"]);
    expect(store.boards.map((b) => b.name)).toEqual(["Ships"]);
  });

  it("BoardNameTaken shows the copy and keeps the menu open", async () => {
    const store = storeWith([ref("r3")], [ships]);
    const api = boardsApi({ createBoard: vi.fn(async () => Promise.reject("BoardNameTaken:s")) });
    mountBoardMenu(host, api, store, "r3");
    $<HTMLButtonElement>(".bm-new").click();
    $<HTMLInputElement>(".bm-name").value = " ships ";
    $<HTMLButtonElement>(".bm-create").click();
    await flush();
    expect($(".bm-msg").textContent).toBe("A board called Ships already exists.");
    expect(document.querySelector(".board-menu")).not.toBeNull();
  });

  it("Esc closes it", () => {
    const store = storeWith([ref("r3")], []);
    mountBoardMenu(host, boardsApi(), store, "r3");
    $(".board-menu").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector(".board-menu")).toBeNull();
  });

  it("maps every board wire code to copy, never raw text", () => {
    const store = storeWith([], [ships]);
    expect(boardErrorCopy("BoardNameTaken:s", store, "x")).toBe("A board called Ships already exists.");
    expect(boardErrorCopy("BoardNameTaken:gone", store, "Typed")).toBe("A board called Typed already exists.");
    expect(boardErrorCopy("EmptyName", store, "")).toBe("Give the board a name.");
    expect(boardErrorCopy("UnknownBoard:s", store, "")).toBe("That board is gone. It may have been undone.");
    expect(boardErrorCopy("os error 5: access denied", store, "")).toBe("That change didn't save. Try again.");
  });
});
