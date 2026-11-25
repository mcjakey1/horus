// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Api, Reference } from "../api";
import type { DataSource, Snapshot, SourceEvent } from "../data";
import { refOf, seed, snap, tagOf } from "../graph/fixtures.test-util";
import { WebGLUnavailable, type Mods, type Scene, type SceneEdge, type SceneNode } from "../graph/frame";
import type { ViewHandle } from "../views";
import { mountTree } from "./tree";

type Ev = "hover" | "select" | "activate";
/** Records what the Tree sends; `emit` plays the scene's pointer and Enter events (R9). */
function fakeScene() {
  const handlers: Record<Ev, ((id: string | null, m: Mods) => void)[]> = { hover: [], select: [], activate: [] };
  const nodes: SceneNode[][] = [];
  const edges: SceneEdge[][] = [];
  const selected: (string | null)[] = [];
  const scene: Scene = {
    setNodes: vi.fn((n: SceneNode[]) => void nodes.push(n)),
    setEdges: vi.fn((e: SceneEdge[]) => void edges.push(e)),
    camera: () => ({ x: 0, y: 0, scale: 1 }),
    setCamera: vi.fn(),
    fitAll: vi.fn(),
    on: (ev, fn) => void handlers[ev].push(fn),
    setDraggable: vi.fn(),
    onDrop: vi.fn(),
    select: vi.fn((id: string | null) => void selected.push(id)),
    destroy: vi.fn(),
  };
  const emit = (ev: Ev, id: string | null) => handlers[ev].forEach((f) => f(id, { shift: false }));
  return { scene, nodes, edges, selected, emit, last: () => nodes[nodes.length - 1], lastSel: () => selected[selected.length - 1] };
}

function fakeSource(s0: Snapshot) {
  let s = s0;
  const subs = new Set<(s: Snapshot, e: SourceEvent) => void>();
  const src: DataSource & { set(next: Snapshot, reset?: boolean): void } = {
    get: () => s,
    subscribe(fn) {
      subs.add(fn);
      return () => void subs.delete(fn);
    },
    set(next, reset = false) {
      s = next;
      subs.forEach((f) => f(s, { reset }));
    },
  };
  return src;
}

const api = { assetUrl: (p: string) => `asset://${p}` } as unknown as Api;
const flush = () => new Promise((r) => setTimeout(r, 0));
const refs: Reference[] = [
  refOf("a", [tagOf(seed, { tech: "chiaroscuro" }), tagOf(seed, { tech: "silhouette" }, 1)]),
  refOf("b", [tagOf(seed, { tech: "chiaroscuro", region: { x: 0, y: 0, w: 0.5, h: 0.5 } })]),
  refOf("c", [tagOf(seed, { tech: "closure" })]),
];
const refIds = (ns: SceneNode[]) => ns.filter((n) => n.kind === "ref").map((n) => n.id).sort();

describe("Tree view", () => {
  let host: HTMLElement;
  let view: ViewHandle;
  let fake: ReturnType<typeof fakeScene>;
  let src: ReturnType<typeof fakeSource>;
  let openReference: Mock<(id: string) => void>;
  beforeEach(async () => {
    document.body.innerHTML = "";
    host = document.createElement("section");
    document.body.append(host);
    fake = fakeScene();
    src = fakeSource(snap(seed, refs));
    openReference = vi.fn();
    view = mountTree(host, src, { api, openReference, makeScene: async () => fake.scene });
    view.show();
    await flush();
  });
  afterEach(() => view.destroy());
  const stage = () => host.querySelector<HTMLElement>(".tree-stage")!;
  const key = (k: string) => stage().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  const crumb = (level: string) => host.querySelector(`.insp-crumb .cell[data-level="${level}"] .v`)!.textContent;

  it("mounts the four bands collapsed, and fits once", () => {
    const ns = fake.last();
    expect(ns.filter((n) => n.kind === "op")).toHaveLength(4);
    expect(refIds(ns)).toEqual([]);
    expect(fake.scene.fitAll).toHaveBeenCalledTimes(1);
  });

  it("selecting_tech_expands_its_refs", () => {
    fake.emit("select", "tech:chiaroscuro");
    expect(refIds(fake.last())).toEqual(["ref:chiaroscuro:a", "ref:chiaroscuro:b"]);
    expect(fake.lastSel()).toBe("tech:chiaroscuro");
    expect(crumb("tech")).toBe("Chiaroscuro");
    fake.emit("select", "tech:closure"); // one technique expanded at a time
    expect(refIds(fake.last())).toEqual(["ref:closure:c"]);
    const b = fake.last().find((n) => n.id === "ref:closure:c")!;
    expect(b).toMatchObject({ kind: "ref", url: "asset://c", aspect: 3 / 4 });
  });

  it("show_all_toggle", () => {
    fake.emit("select", "tech:chiaroscuro");
    const btn = host.querySelector<HTMLButtonElement>(".tree-all")!;
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    btn.click();
    expect(btn.getAttribute("aria-pressed")).toBe("true");
    expect(refIds(fake.last())).toEqual(["ref:chiaroscuro:a", "ref:chiaroscuro:b", "ref:closure:c", "ref:silhouette:a"]);
    btn.click();
    expect(btn.getAttribute("aria-pressed")).toBe("false");
    expect(refIds(fake.last())).toEqual(["ref:chiaroscuro:a", "ref:chiaroscuro:b"]);
  });

  it("out_of_scope_refs_are_dots", () => {
    src.set({ ...snap(seed, refs), version: 1, inScope: (id) => id !== "b" });
    fake.emit("select", "tech:chiaroscuro");
    const ns = fake.last();
    expect(ns.find((n) => n.id === "ref:chiaroscuro:b")).toMatchObject({ dim: true });
    expect(ns.find((n) => n.id === "ref:chiaroscuro:a")).not.toMatchObject({ dim: true });
    fake.emit("select", "ref:chiaroscuro:b"); // can't be selected
    expect(fake.lastSel()).toBe("tech:chiaroscuro");
  });

  it("region and whole-image references carry the state outline (ruling a1)", () => {
    fake.emit("select", "tech:chiaroscuro");
    const ns = fake.last();
    expect(ns.find((n) => n.id === "ref:chiaroscuro:b")).toMatchObject({
      outline: { region: { x: 0, y: 0, w: 0.5, h: 0.5 }, state: "region", color: "var(--diff)" },
    });
    expect(ns.find((n) => n.id === "ref:chiaroscuro:a")).toMatchObject({
      outline: { region: { x: 0, y: 0, w: 1, h: 1 }, state: "full", color: "var(--diff)" },
    });
  });

  it("selected_path_coloured", () => {
    fake.emit("select", "ref:chiaroscuro:a"); // not on the canvas yet: refused
    expect(fake.selected).not.toContain("ref:chiaroscuro:a");
    fake.emit("select", "tech:chiaroscuro");
    fake.emit("select", "ref:chiaroscuro:a");
    const ns = new Map(fake.last().map((n) => [n.id, n]));
    const color = (id: string) => (ns.get(id) as { color: string }).color;
    expect(color("op:differentiate")).toBe("var(--diff)");
    expect(color("br:differentiate.feature")).toBe("var(--diff)");
    expect(color("tech:chiaroscuro")).toBe("var(--diff)");
    expect(color("op:group")).toBe("var(--line-2)");
    expect(color("br:sequence.feature")).toBe("var(--line-2)");
    expect(color("tech:silhouette")).toBe("var(--line-2)");
    const es = fake.edges[fake.edges.length - 1];
    const inked = es.filter((e) => e.color === "var(--diff)");
    expect(inked.length).toBeGreaterThan(0);
    for (const e of es) {
      expect(e.width).toBe(1); // hairlines
      expect(e.curve).toBeFalsy();
      expect(["var(--diff)", "var(--line-2)"]).toContain(e.color);
    }
    // orthogonal: every segment is horizontal or vertical
    for (const e of es) {
      const a = ns.get(e.from)!;
      const b = ns.get(e.to)!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
    }
    // the inked segments are drawn last, over the hairlines
    expect(es.slice(es.length - inked.length).every((e) => e.color === "var(--diff)")).toBe(true);
  });

  it("arrow_up_goes_to_parent", () => {
    fake.emit("select", "tech:face-schema");
    key("ArrowUp");
    expect(fake.lastSel()).toBe("br:differentiate.social");
    key("ArrowUp");
    expect(fake.lastSel()).toBe("op:differentiate");
    key("ArrowRight");
    expect(fake.lastSel()).toBe("op:group");
    key("Escape");
    expect(fake.lastSel()).toBeNull();
    key("3");
    expect(fake.lastSel()).toBe("op:sequence");
  });

  it("enter_is_left_to_the_scene; activate opens a reference", () => {
    fake.emit("select", "tech:chiaroscuro");
    fake.emit("select", "ref:chiaroscuro:b");
    key("Enter");
    expect(openReference).not.toHaveBeenCalled(); // the scene emits activate for Enter (carry-in 1)
    fake.emit("activate", "ref:chiaroscuro:b");
    expect(openReference).toHaveBeenCalledWith("b");
    fake.emit("activate", "tech:chiaroscuro");
    expect(openReference).toHaveBeenCalledTimes(1);
  });

  it("data_change_keeps_selection_or_clears", () => {
    fake.emit("select", "tech:chiaroscuro");
    fake.emit("select", "ref:chiaroscuro:a");
    const fits = vi.mocked(fake.scene.fitAll).mock.calls.length;
    src.set({ ...snap(seed, refs), version: 1 });
    expect(fake.lastSel()).toBe("ref:chiaroscuro:a");
    expect(crumb("ref")).toBe("Plate a");
    src.set({ ...snap(seed, refs.slice(1)), version: 2 });
    expect(fake.lastSel()).toBeNull();
    expect(crumb("ref")).toBe("");
    expect(fake.scene.fitAll).toHaveBeenCalledTimes(fits);
    expect(fake.scene.setCamera).not.toHaveBeenCalled();
  });

  it("reset_clears_and_fits", () => {
    fake.emit("select", "tech:chiaroscuro");
    const fits = vi.mocked(fake.scene.fitAll).mock.calls.length;
    src.set({ ...snap(seed, refs), version: 1 }, true);
    expect(fake.lastSel()).toBeNull();
    expect(fake.scene.fitAll).toHaveBeenCalledTimes(fits + 1);
    expect(refIds(fake.last())).toEqual([]);
  });

  it("a hidden Tree rebuilds on show, and fits then after a library switch", () => {
    view.hide();
    const calls = fake.nodes.length;
    const fits = vi.mocked(fake.scene.fitAll).mock.calls.length;
    src.set({ ...snap(seed, refs), version: 1 }, true);
    expect(fake.nodes.length).toBe(calls);
    view.show();
    expect(fake.nodes.length).toBe(calls + 1);
    expect(fake.scene.fitAll).toHaveBeenCalledTimes(fits + 1);
    view.show(); // nothing new: no rebuild
    expect(fake.nodes.length).toBe(calls + 1);
  });

  it("inspector selections drive the canvas", () => {
    host.querySelector<HTMLElement>('.insp [data-sel="op:group"]')!.click();
    expect(fake.lastSel()).toBe("op:group");
    expect(crumb("op")).toBe("Group");
  });

  it("fallback_has_inspector", async () => {
    view.destroy();
    host.replaceChildren();
    view = mountTree(host, src, { api, openReference, makeScene: async () => { throw new WebGLUnavailable(); } });
    view.show();
    await flush();
    expect(host.querySelector(".graph-fallback")).not.toBeNull();
    const ops = [...host.querySelectorAll<HTMLElement>('.insp [data-sel^="op:"]')];
    expect(ops.map((b) => b.tagName)).toEqual(["BUTTON", "BUTTON", "BUTTON", "BUTTON"]);
    ops[0].click();
    expect(crumb("op")).toBe("Differentiate");
    host.querySelector<HTMLElement>('.insp [data-sel="br:differentiate.feature"]')!.click();
    host.querySelector<HTMLElement>('.insp [data-sel="tech:chiaroscuro"]')!.click();
    host.querySelector<HTMLElement>('.insp .thumb[data-open="a"]')!.click();
    expect(openReference).toHaveBeenCalledWith("a");
  });
});
