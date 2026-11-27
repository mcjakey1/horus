// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { mountScopeStatus } from "./status";
import { change, ref, storeWith } from "./boards.test-util";

describe("mountScopeStatus", () => {
  let el: HTMLElement;
  beforeEach(() => {
    document.body.innerHTML = `<span id="board-scope"></span>`;
    el = document.getElementById("board-scope")!;
  });
  const ten = Array.from({ length: 10 }, (_, i) => ref(`r${i}`));
  const harbour = { id: "h", name: "Harbour", referenceIds: ten.map((r) => r.id) };

  it("is empty with no scope, and reads the board with a scope", () => {
    const store = storeWith(ten, [harbour]);
    mountScopeStatus(el, store);
    expect(el.hidden).toBe(true);
    store.setScope("h");
    expect(el.hidden).toBe(false);
    expect(el.textContent).toBe("Board: Harbour · 10 references · Show all");
  });

  it("Show all clears the scope", () => {
    const store = storeWith(ten, [harbour]);
    mountScopeStatus(el, store);
    store.setScope("h");
    el.querySelector<HTMLButtonElement>("[data-scope-clear]")!.click();
    expect(store.scope).toBeNull();
    expect(el.hidden).toBe(true);
  });

  it("says so when the scoped board is removed, until the scope changes again", () => {
    const store = storeWith(ten, [harbour]);
    mountScopeStatus(el, store);
    store.setScope("h");
    store.apply(change({ boards: [] }));
    expect(store.scope).toBeNull();
    expect(el.textContent).toBe("Board removed — showing all references");
    store.apply(change({ references: [ref("r0", "Renamed")] })); // an unrelated change keeps the note
    expect(el.textContent).toBe("Board removed — showing all references");
  });

  it("an undo that brings the board back clears the note (D3)", () => {
    const store = storeWith(ten, [harbour]);
    mountScopeStatus(el, store);
    store.setScope("h");
    store.apply(change({ boards: [] }));
    expect(el.textContent).toBe("Board removed — showing all references");
    store.apply(change({ boards: [harbour] })); // the undo of the delete
    expect(el.hidden).toBe(true);
  });

  it("counts only members still in the library, and follows a rename", () => {
    const store = storeWith(ten, [{ ...harbour, referenceIds: [...harbour.referenceIds, "gone"] }]);
    mountScopeStatus(el, store);
    store.setScope("h");
    expect(el.textContent).toContain("10 references");
    store.apply(change({ boards: [{ ...harbour, name: "Docks", referenceIds: ["r0"] }] }));
    expect(el.textContent).toBe("Board: Docks · 1 reference · Show all");
  });
});
