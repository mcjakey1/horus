// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Api, Reference, Taxonomy } from "../api";
import type { DataSource, Snapshot, SourceEvent } from "../data";
import { refOf, seed, snap, tagOf } from "../graph/fixtures.test-util";
import type { Mods, Scene, SceneEdge, SceneNode } from "../graph/frame";
import { buildTaxGraph } from "../graph/taxgraph";
import type { ViewHandle } from "../views";
import { renderInspector } from "./inspector";

type Ev = "hover" | "select" | "activate";
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
  return { scene, nodes, edges, selected, emit, last: () => nodes[nodes.length - 1], lastEdges: () => edges[edges.length - 1], lastSel: () => selected[selected.length - 1] };
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
const region = { x: 0.1, y: 0.1, w: 0.5, h: 0.5 };
/** Two references under infer, one under group. */
const refs: Reference[] = [
  refOf("i1", [tagOf(seed, { tech: "contextual-metaphor" }), tagOf(seed, { tech: "genre-quotation" }, 1)]),
  refOf("i2", [tagOf(seed, { tech: "forced-perspective", region })]),
  refOf("g1", [tagOf(seed, { tech: "symmetry" })]),
];
const ids = (ns: SceneNode[], kind: string) => ns.filter((n) => n.kind === kind).map((n) => n.id);

describe("Radial view", () => {
  let mountRadial: typeof import("./radial").mountRadial;
  let WebGLUnavailable: typeof import("../graph/frame").WebGLUnavailable;
  let host: HTMLElement;
  let view: ViewHandle;
  let fake: ReturnType<typeof fakeScene>;
  let src: ReturnType<typeof fakeSource>;
  let openReference: Mock<(id: string) => void>;
  const mount = async (s: Snapshot = snap(seed, refs)) => {
    src = fakeSource(s);
    fake = fakeScene();
    view = mountRadial(host, src, { api, openReference, makeScene: async () => fake.scene });
    view.show();
    await flush();
  };
  beforeEach(async () => {
    vi.resetModules(); // the chosen operation is remembered per session: start each test fresh
    ({ mountRadial } = await import("./radial"));
    ({ WebGLUnavailable } = await import("../graph/frame")); // the same module instance radial.ts sees
    document.body.innerHTML = "";
    host = document.createElement("section");
    document.body.append(host);
    openReference = vi.fn();
    await mount();
  });
  afterEach(() => view.destroy());
  const stage = () => host.querySelector<HTMLElement>(".radial-stage")!;
  const key = (k: string, init: KeyboardEventInit = {}) =>
    stage().dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
  const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>(".radial-op")].find((b) => b.textContent === label)!;
  const pressed = () => host.querySelector<HTMLButtonElement>('.radial-op[aria-pressed="true"]')!.textContent;

  it("default_op_is_busiest", () => {
    expect(pressed()).toBe("Make them think");
    expect(ids(fake.last(), "op")).toEqual(["op:infer"]);
    expect(fake.scene.fitAll).toHaveBeenCalledTimes(1);
  });

  it("switch_operation_relayouts", () => {
    const calls = fake.nodes.length;
    button("Lead the eye").click();
    expect(fake.nodes.length).toBe(calls + 1);
    const g = buildTaxGraph(snap(seed));
    const seqTechs = new Set(g.children.get("op:sequence")!.flatMap((b) => g.children.get(b)!));
    const ns = fake.last();
    expect(ids(ns, "op")).toEqual(["op:sequence"]);
    expect(ids(ns, "branch").length).toBeGreaterThan(0);
    expect(ids(ns, "branch").every((b) => b.startsWith("br:sequence."))).toBe(true);
    expect(ids(ns, "tech").every((t) => seqTechs.has(t))).toBe(true);
    expect(ids(ns, "tech").length).toBe(seqTechs.size);
    expect(pressed()).toBe("Lead the eye");
    expect(fake.scene.fitAll).toHaveBeenCalledTimes(2);
  });

  it("key_3_selects_sequence", () => {
    key("3");
    expect(pressed()).toBe("Lead the eye");
    button("Stand out").click();
    key('"', { code: "Digit3" }); // AZERTY's unshifted 3 (M3)
    expect(pressed()).toBe("Lead the eye");
    key("8"); // above the operation count: nothing
    expect(pressed()).toBe("Lead the eye");
  });

  it("renders_dynamic_ops", async () => {
    view.destroy();
    const tax: Taxonomy = { ...seed, operations: [...seed.operations, { id: "unsettle", name: "Unsettle", plainLabel: "Unsettle", color: "rose", icon: "", description: "" }] };
    await mount(snap(tax, refs));
    const buttons = host.querySelectorAll<HTMLButtonElement>(".radial-op");
    expect(buttons).toHaveLength(5);
    expect([...buttons].map((b) => b.dataset.op)).toEqual(["differentiate", "group", "sequence", "infer", "unsettle"]);
    key("5");
    expect(pressed()).toBe("Unsettle");
    expect(ids(fake.last(), "op")).toEqual(["op:unsettle"]);
    expect(buttons[4].querySelector<HTMLElement>(".sw")!.style.getPropertyValue("--c")).toBe("var(--x-rose)");
    expect(buttons[0].querySelector<HTMLElement>(".sw")!.style.getPropertyValue("--c")).toBe("var(--diff)");
    key("6");
    expect(pressed()).toBe("Unsettle");
  });

  it("out_of_scope_refs_are_dots", () => {
    src.set({ ...snap(seed, refs), version: 1, inScope: (id) => id !== "i2" });
    const ns = fake.last();
    expect(ns.find((n) => n.kind === "ref" && n.id.endsWith(":i2"))).toMatchObject({ dim: true });
    expect(ns.find((n) => n.kind === "ref" && n.id.endsWith(":i1"))).not.toMatchObject({ dim: true });
    const dimId = ns.find((n) => n.id.endsWith(":i2"))!.id;
    fake.emit("select", dimId);
    expect(fake.lastSel()).not.toBe(dimId);
  });

  it("radial_shares_inspector", () => {
    fake.emit("select", "tech:contextual-metaphor");
    const mine = host.querySelector<HTMLElement>(".insp")!;
    const tree = document.createElement("aside");
    renderInspector(tree, src.get(), { kind: "tech", id: "tech:contextual-metaphor" }, {
      editable: false, openReference: vi.fn(), select: vi.fn(), assetUrl: (p) => api.assetUrl(p),
    });
    expect(mine.innerHTML).toBe(tree.innerHTML);
    expect(mine.querySelector<HTMLImageElement>(".thumb img")!.getAttribute("src")).toBe("asset://i1"); // carry-in 1
  });

  it("ring 3: one point per reference, outlined by its via on this operation (carry-ins 2, 3)", async () => {
    view.destroy();
    const both = refOf("w", [
      tagOf(seed, { tech: "chiaroscuro", branch: "sequence.feature", region }),
      tagOf(seed, { tech: "chiaroscuro" }, 1), // whole image, through differentiate.feature
      tagOf(seed, { tech: "silhouette" }, 2),
    ]);
    await mount(snap(seed, [both]));
    button("Stand out").click();
    let rs = fake.last().filter((n) => n.kind === "ref");
    expect(rs).toHaveLength(1); // chiaroscuro and silhouette share one point: one node
    expect(rs[0]).toMatchObject({ outline: { region: { x: 0, y: 0, w: 1, h: 1 }, state: "full", color: "var(--diff)" } });
    button("Lead the eye").click();
    rs = fake.last().filter((n) => n.kind === "ref");
    expect(rs).toHaveLength(1);
    expect(rs[0]).toMatchObject({ outline: { region, state: "region", color: "var(--seq)" } });
  });

  it("technique-to-reference connectors only for the hovered or selected technique", () => {
    const toRefs = (es: SceneEdge[]) => es.filter((e) => e.to.startsWith("ref:"));
    expect(toRefs(fake.lastEdges())).toEqual([]);
    fake.emit("hover", "tech:forced-perspective");
    expect(toRefs(fake.lastEdges())).toEqual([{ from: "tech:forced-perspective", to: "ref:forced-perspective:i2", width: 1, color: "var(--infer)" }]);
    fake.emit("hover", null);
    expect(toRefs(fake.lastEdges())).toEqual([]);
    fake.emit("select", "tech:contextual-metaphor");
    expect(toRefs(fake.lastEdges()).map((e) => e.to)).toEqual(["ref:contextual-metaphor:i1"]);
    // the rest of the ring stays hairline
    for (const e of fake.lastEdges()) expect(["var(--infer)", "var(--line-2)"]).toContain(e.color);
  });

  it("ring-3 count is not the operation count: partial tags have no node (carry-in 4)", async () => {
    view.destroy();
    await mount(snap(seed, [...refs, refOf("p", [tagOf(seed, { op: "group" })])]));
    button("Hold together").click();
    expect(fake.last().filter((n) => n.kind === "ref").map((n) => n.id)).toEqual(["ref:symmetry:g1"]);
    expect(host.querySelector(".insp")!.textContent).not.toContain("undefined");
  });

  it("activate opens a reference; Enter is the scene's; arrows move the selection", () => {
    fake.emit("select", "tech:forced-perspective");
    key("ArrowDown");
    expect(fake.lastSel()).toBe("ref:forced-perspective:i2");
    key("Enter");
    expect(openReference).not.toHaveBeenCalled();
    fake.emit("activate", "ref:forced-perspective:i2");
    expect(openReference).toHaveBeenCalledWith("i2");
    key("Escape");
    expect(fake.lastSel()).toBeNull();
  });

  it("remembers the operation for the session; a reset clears and fits", async () => {
    button("Lead the eye").click();
    fake.emit("select", "op:sequence");
    const fits = vi.mocked(fake.scene.fitAll).mock.calls.length;
    src.set({ ...snap(seed, refs), version: 1 }, true);
    expect(fake.lastSel()).toBeNull();
    expect(fake.scene.fitAll).toHaveBeenCalledTimes(fits + 1);
    view.destroy();
    await mount();
    expect(pressed()).toBe("Lead the eye");
  });

  it("a data change keeps the selection while it is on the ring", () => {
    fake.emit("select", "tech:forced-perspective");
    key("ArrowDown");
    src.set({ ...snap(seed, refs), version: 1 });
    expect(fake.lastSel()).toBe("ref:forced-perspective:i2");
    src.set({ ...snap(seed, refs.filter((r) => r.id !== "i2")), version: 2 });
    expect(fake.lastSel()).toBeNull();
    expect(fake.scene.setCamera).not.toHaveBeenCalled();
  });

  it("↑ from a shared technique goes to its parent on this operation; a moved representative follows", async () => {
    view.destroy();
    const r = refOf("r", [tagOf(seed, { tech: "chiaroscuro", branch: "sequence.feature" })]);
    const q = refOf("q", [tagOf(seed, { tech: "size-hierarchy" })]);
    await mount(snap(seed, [r, q]));
    button("Lead the eye").click();
    fake.emit("select", "tech:chiaroscuro");
    key("ArrowUp"); // its first parent overall is differentiate.feature, which is not on this ring
    expect(fake.lastSel()).toBe("br:sequence.feature");
    fake.emit("select", "tech:size-hierarchy");
    key("ArrowDown");
    expect(fake.lastSel()).toBe("ref:size-hierarchy:q");
    // a new tag on chiaroscuro (earlier on the ring) makes that node the drawn one: the selection follows
    const q2 = refOf("q", [...q.tags, tagOf(seed, { tech: "chiaroscuro", branch: "sequence.feature" }, 1)]);
    src.set({ ...snap(seed, [r, q2]), version: 1 });
    const drawn = fake.last().filter((n) => n.kind === "ref" && n.id.endsWith(":q")).map((n) => n.id);
    expect(drawn).toEqual(["ref:chiaroscuro:q"]);
    expect(fake.lastSel()).toBe("ref:chiaroscuro:q");
  });

  it("arrows walk this operation's ring on a shared technique (fix round 1, I1)", async () => {
    view.destroy();
    const r = refOf("r", [tagOf(seed, { tech: "chiaroscuro", branch: "sequence.feature" })]);
    await mount(snap(seed, [r]));
    button("Lead the eye").click();
    fake.emit("select", "tech:chiaroscuro"); // shared with differentiate.feature, its first parent overall
    key("ArrowRight");
    expect(fake.lastSel()).toBe("tech:size-hierarchy"); // its sibling under sequence.feature
    key("ArrowLeft");
    expect(fake.lastSel()).toBe("tech:chiaroscuro");
    key("ArrowLeft");
    expect(fake.lastSel()).toBe("tech:chiaroscuro"); // first on its branch here: nothing
    key("ArrowDown");
    expect(fake.lastSel()).toBe("ref:chiaroscuro:r");
    key("ArrowUp");
    expect(fake.lastSel()).toBe("tech:chiaroscuro");
    key("ArrowUp");
    expect(fake.lastSel()).toBe("br:sequence.feature");
    key("ArrowUp");
    expect(fake.lastSel()).toBe("op:sequence");
    key("ArrowRight"); // the centre has no sibling on this ring
    expect(fake.lastSel()).toBe("op:sequence");
    expect(pressed()).toBe("Lead the eye");
  });

  it("a Used-under branch from another operation switches to it (fix round 1, I2)", () => {
    button("Lead the eye").click();
    fake.emit("select", "tech:chiaroscuro");
    host.querySelector<HTMLElement>('.insp-used [data-sel="br:differentiate.feature"]')!.click();
    expect(pressed()).toBe("Stand out");
    expect(fake.lastSel()).toBe("br:differentiate.feature");
    expect(host.querySelector('.insp-crumb .cell[data-level="op"] .v')!.textContent).toBe("Differentiate");
  });

  it("the fallback keeps the switch and the inspector", async () => {
    view.destroy();
    src = fakeSource(snap(seed, refs));
    view = mountRadial(host, src, { api, openReference, makeScene: async () => { throw new WebGLUnavailable(); } });
    view.show();
    await flush();
    expect(host.querySelector(".graph-fallback")).not.toBeNull();
    expect(host.querySelectorAll(".radial-op")).toHaveLength(4);
    host.querySelector<HTMLElement>('.insp [data-sel="op:infer"]')!.click();
    host.querySelector<HTMLElement>('.insp [data-sel^="br:"]')!.click();
    expect(host.querySelector('.insp-crumb .cell[data-level="domain"] .v')!.textContent).not.toBe("");
  });
});
