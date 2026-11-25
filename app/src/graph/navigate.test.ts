// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { seed, snap } from "./fixtures.test-util";
import { canvasKeys, move } from "./navigate";
import { buildTaxGraph } from "./taxgraph";

describe("navigate", () => {
  it("move_siblings_parent_child", () => {
    const g = buildTaxGraph(snap(seed));
    // operations, in taxonomy order
    expect(move(g, "op:differentiate", "next")).toBe("op:group");
    expect(move(g, "op:group", "prev")).toBe("op:differentiate");
    expect(move(g, "op:differentiate", "prev")).toBeNull();
    expect(move(g, "op:infer", "next")).toBeNull();
    expect(move(g, "op:differentiate", "parent")).toBeNull();
    expect(move(g, "op:differentiate", "child")).toBe("br:differentiate.feature");
    // branches: siblings under the same operation
    expect(move(g, "br:differentiate.feature", "next")).toBe("br:differentiate.grouping");
    expect(move(g, "br:differentiate.feature", "prev")).toBeNull();
    expect(move(g, "br:differentiate.grouping", "parent")).toBe("op:differentiate");
    const firstTech = g.children.get("br:differentiate.feature")![0];
    expect(move(g, "br:differentiate.feature", "child")).toBe(firstTech);
    // techniques: the first parent, and siblings under it
    expect(move(g, "tech:face-schema", "parent")).toBe("br:differentiate.social");
    const kids = g.children.get("br:differentiate.feature")!;
    expect(move(g, kids[0], "next")).toBe(kids[1]);
    expect(move(g, kids[kids.length - 1], "next")).toBeNull();
    expect(move(g, kids[0], "child")).toBeNull(); // not expanded
    // nothing selected: the arrows start at the first operation
    expect(move(g, null, "child")).toBe("op:differentiate");
    expect(move(g, null, "parent")).toBeNull();
    expect(move(g, "gone", "next")).toBeNull();
  });

  it("move reaches references and back", () => {
    const g = buildTaxGraph(snap(seed, [
      { id: "a", title: "A", file: "", hash: "a", width: 1, height: 1, addedAt: "", thumb256: "", thumb1024: "",
        tags: [{ id: "t", operationId: "differentiate", techniqueId: "chiaroscuro", branchId: "differentiate.feature", suggested: false }] },
    ]), "all");
    expect(move(g, "tech:chiaroscuro", "child")).toBe("ref:chiaroscuro:a");
    expect(move(g, "ref:chiaroscuro:a", "parent")).toBe("tech:chiaroscuro");
    expect(move(g, "ref:chiaroscuro:a", "next")).toBeNull();
  });

  it("canvas_keys_ignore_text_fields", () => {
    const h = { move: vi.fn(), activate: vi.fn(), clear: vi.fn(), digit: vi.fn() };
    const input = document.createElement("input");
    document.body.append(input);
    for (const key of ["ArrowUp", "Enter", "Escape", "3"]) {
      const e = new KeyboardEvent("keydown", { key, bubbles: true });
      input.addEventListener("keydown", (ev) => expect(canvasKeys(ev, h)).toBe(false), { once: true });
      input.dispatchEvent(e);
    }
    expect(h.move).not.toHaveBeenCalled();
    expect(h.activate).not.toHaveBeenCalled();
    expect(h.clear).not.toHaveBeenCalled();
    expect(h.digit).not.toHaveBeenCalled();
    input.remove();
  });

  it("canvas_keys map arrows, Enter, Esc and digits; leave handled and modified keys alone", () => {
    const h = { move: vi.fn(), activate: vi.fn(), clear: vi.fn(), digit: vi.fn() };
    const key = (k: string, init: KeyboardEventInit = {}) => canvasKeys(new KeyboardEvent("keydown", { key: k, ...init }), h);
    expect(key("ArrowLeft")).toBe(true);
    expect(key("ArrowRight")).toBe(true);
    expect(key("ArrowUp")).toBe(true);
    expect(key("ArrowDown")).toBe(true);
    expect(h.move.mock.calls.map((c) => c[0])).toEqual(["prev", "next", "parent", "child"]);
    expect(key("Enter")).toBe(true);
    expect(h.activate).toHaveBeenCalledTimes(1);
    expect(key("Escape")).toBe(true);
    expect(h.clear).toHaveBeenCalledTimes(1);
    expect(key("&", { code: "Digit1" })).toBe(true); // AZERTY's unshifted 1
    expect(h.digit).toHaveBeenCalledWith(1);
    expect(key("x")).toBe(false);
    expect(key("ArrowUp", { ctrlKey: true })).toBe(false);
    const done = new KeyboardEvent("keydown", { key: "ArrowUp", cancelable: true });
    done.preventDefault(); // the scene already panned with it
    expect(canvasKeys(done, h)).toBe(false);
    expect(h.move).toHaveBeenCalledTimes(4);
    expect(canvasKeys(new KeyboardEvent("keydown", { key: "5" }), { move: vi.fn(), activate: vi.fn(), clear: vi.fn() })).toBe(false);
  });
});
