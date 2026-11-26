// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { Api, Edge, Scored } from "../api";
import type { DataSource, Snapshot, SourceEvent } from "../data";
import type { Mods, Scene, SceneEdge, SceneNode } from "../graph/frame";
import type { FromWorker, ToWorker } from "../graph/force";
import { refOf, seed, tagOf } from "../graph/fixtures.test-util";
import { mountGalaxy } from "./galaxy";

const settle = () => new Promise((r) => setTimeout(r, 0));
const last = <T,>(a: T[]): T => a[a.length - 1];

function fakeScene() {
  const handlers: Record<string, ((id: string | null, m: Mods) => void)[]> = { hover: [], select: [], activate: [] };
  const calls = { nodes: [] as SceneNode[][], edges: [] as SceneEdge[][], select: [] as (string | null)[], fit: 0, cam: 0 };
  const scene: Scene = {
    setNodes: (n) => void calls.nodes.push(n),
    setEdges: (e) => void calls.edges.push(e),
    camera: () => ({ x: 0, y: 0, scale: 1 }),
    setCamera: () => void calls.cam++,
    fitAll: () => void calls.fit++,
    on: (ev, fn) => void handlers[ev].push(fn),
    setDraggable: () => {},
    onDrop: () => {},
    select: (id) => void calls.select.push(id),
    destroy: () => {},
  };
  const fire = (ev: "hover" | "select" | "activate", id: string | null, shift = false) =>
    handlers[ev].forEach((f) => f(id, { shift }));
  return { scene, calls, fire };
}

function fakeWorker() {
  const posted: ToWorker[] = [];
  const w = {
    postMessage: (m: ToWorker) => void posted.push(m),
    onmessage: null as ((e: MessageEvent<FromWorker>) => void) | null,
    terminate: vi.fn(),
  };
  const lastStart = () => {
    const start = [...posted].reverse().find((m) => m.type === "start");
    if (!start || start.type !== "start") throw new Error("no start");
    return start;
  };
  /** Answers the last start with a finished layout: on a line, or at the given positions. */
  const finish = (at?: Record<string, [number, number]>) => {
    const { run, input } = lastStart();
    const ids = input.ids;
    const xy = new Float32Array(ids.flatMap((id, i) => at?.[id] ?? [i * 100, 0]));
    w.onmessage?.({ data: { type: "tick", run, ids, xy, alpha: 0.005 } } as MessageEvent<FromWorker>);
    w.onmessage?.({ data: { type: "end", run } } as MessageEvent<FromWorker>);
  };
  const deliver = (m: FromWorker) => w.onmessage?.({ data: m } as MessageEvent<FromWorker>);
  return { worker: w as unknown as Worker, posted, finish, lastStart, deliver };
}

function fakeSource(s: Snapshot) {
  const subs = new Set<(s: Snapshot, e: SourceEvent) => void>();
  let cur = s;
  const source: DataSource = { get: () => cur, subscribe: (fn) => (subs.add(fn), () => void subs.delete(fn)) };
  const change = (next: Snapshot, reset = false) => {
    cur = next;
    subs.forEach((fn) => fn(cur, { reset }));
  };
  return { source, change };
}

const snapOf = (ids: string[], version = 1, inScope: (id: string) => boolean = () => true): Snapshot => ({
  refs: new Map(ids.map((id) => [id, refOf(id, [tagOf(seed, { tech: "chiaroscuro" })])])),
  links: [], tax: seed, version, taxonomyReadOnly: false, inScope,
});

const EDGES: Edge[] = [
  { a: "a", b: "b", score: 0.8 },
  { a: "a", b: "c", score: 0.3 },
  { a: "b", b: "c", score: 0.5 },
];

function setup(opts: { ids?: string[]; edges?: Edge[]; inScope?: (id: string) => boolean; related?: Scored[]; failEdgesOnce?: boolean } = {}) {
  const ids = opts.ids ?? ["a", "b", "c"];
  const { source, change } = fakeSource(snapOf(ids, 1, opts.inScope));
  const sc = fakeScene();
  const wk = fakeWorker();
  const api = {
    graphEdges: vi.fn(async () => opts.edges ?? EDGES),
    related: vi.fn(async () => opts.related ?? []),
    assetUrl: (p: string) => p,
  } as unknown as Api;
  if (opts.failEdgesOnce) vi.mocked(api.graphEdges).mockRejectedValueOnce(new Error("IPC down"));
  const openReference = vi.fn();
  const openCompare = vi.fn();
  const host = document.createElement("section");
  document.body.append(host);
  const view = mountGalaxy(host, source, {
    api, openReference, openCompare,
    makeScene: async () => sc.scene,
    makeWorker: () => wk.worker,
  });
  return { host, view, source, change, sc, wk, api, openReference, openCompare };
}

const lastEdges = (sc: ReturnType<typeof fakeScene>) => sc.calls.edges[sc.calls.edges.length - 1];

describe("Galaxy", () => {
  it("edges_only_on_hover", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    expect(lastEdges(t.sc)).toEqual([]);
    t.sc.fire("hover", "a");
    const drawn = lastEdges(t.sc);
    expect(drawn.map((e) => [e.from, e.to].sort().join("-")).sort()).toEqual(["a-b", "a-c"]);
    for (const e of drawn) {
      const score = EDGES.find((x) => [x.a, x.b].sort().join() === [e.from, e.to].sort().join())!.score;
      expect(e.width).toBeCloseTo(0.75 + 2.25 * score, 12);
      expect(e.color).toBe("var(--ink-2)");
    }
    t.sc.fire("hover", null);
    expect(lastEdges(t.sc)).toEqual([]);
  });

  it("graph_edges_once_per_version", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    t.sc.fire("hover", "a");
    t.sc.fire("hover", "b");
    expect(t.api.graphEdges).toHaveBeenCalledTimes(1);
    expect(t.api.graphEdges).toHaveBeenCalledWith(8);
  });

  it("select_pins_edges", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    t.sc.fire("select", "a");
    t.sc.fire("hover", "b");
    t.sc.fire("hover", null);
    expect(lastEdges(t.sc).every((e) => e.from === "a" || e.to === "a")).toBe(true);
    expect(lastEdges(t.sc).length).toBe(2);
    // Esc clears the selection and its edges
    t.host.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(lastEdges(t.sc)).toEqual([]);
    expect(last(t.sc.calls.select)).toBeNull();
  });

  it("shift_click_opens_compare", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    t.sc.fire("select", "b", true); // no selection yet: just selects b
    expect(t.openCompare).not.toHaveBeenCalled();
    t.sc.fire("select", "a");
    t.sc.fire("select", "b", true);
    expect(t.openCompare).toHaveBeenCalledWith("a", "b");
    expect(last(t.sc.calls.select)).toBe("a"); // the selection stays on a
  });

  it("activate_opens_reference", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    t.sc.fire("activate", "c");
    expect(t.openReference).toHaveBeenCalledWith("c");
  });

  it("out_of_scope_no_edges", async () => {
    const t = setup({ inScope: (id) => id !== "b" });
    await settle();
    t.wk.finish();
    const nodes = last(t.sc.calls.nodes)!;
    expect(nodes.find((n) => n.id === "b")).toMatchObject({ kind: "ref", dim: true });
    t.sc.fire("hover", "a");
    expect(lastEdges(t.sc).map((e) => [e.from, e.to].sort().join("-"))).toEqual(["a-c"]);
  });

  it("inspector_names_shared_techniques", async () => {
    const t = setup({ related: [{ id: "b", score: 0.8, sharedTechniques: ["chiaroscuro", "rim-light"], sharedBranches: [] }] });
    await settle();
    t.wk.finish();
    t.sc.fire("select", "a");
    await settle();
    expect(t.api.related).toHaveBeenCalledWith("a");
    const row = t.host.querySelector(".gx-neighbours li")!;
    expect(row.textContent).toContain("Plate b");
    const names = [...row.querySelectorAll(".gx-shares i")].map((i) => i.textContent);
    expect(names).toEqual(["Chiaroscuro", seed.techniques.find((x) => x.id === "rim-light")!.name]);
    expect(row.querySelector(".mono")!.textContent).toBe("0.80");
    t.host.querySelector<HTMLButtonElement>("[data-open-ref]")!.click();
    expect(t.openReference).toHaveBeenCalledWith("a");
  });

  it("data_change_warm_starts", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    t.sc.fire("select", "a");
    const fits = t.sc.calls.fit;
    t.change(snapOf(["a", "b", "c", "d"], 2));
    await settle();
    const start = last(t.wk.posted.filter((m) => m.type === "start"))!;
    expect(start.type === "start" && Object.keys(start.input.prev ?? {}).sort()).toEqual(["a", "b", "c"]);
    expect(t.api.graphEdges).toHaveBeenCalledTimes(2); // a new version
    t.wk.finish();
    expect(t.sc.calls.fit).toBe(fits); // the camera is kept
    expect(lastEdges(t.sc).length).toBeGreaterThan(0); // and the selection
  });

  it("deleted_selection_clears", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    t.sc.fire("select", "a");
    t.change(snapOf(["b", "c"], 2));
    await settle();
    t.wk.finish();
    expect(lastEdges(t.sc)).toEqual([]);
    expect(t.host.querySelector(".gx-neighbours")).toBeNull();
    // "a" comes back (an undo): a kept selection would show it again; a cleared one does not (M7)
    t.change(snapOf(["a", "b", "c"], 3));
    await settle();
    t.wk.finish();
    expect(t.host.querySelector(".gx-title")).toBeNull();
    expect(last(t.sc.calls.select)).toBeNull();
    expect(lastEdges(t.sc)).toEqual([]);
  });

  it("a failed graph_edges is not cached as no edges (final review M4)", async () => {
    const t = setup({ failEdgesOnce: true });
    await settle();
    t.wk.finish();
    expect(t.api.graphEdges).toHaveBeenCalledTimes(1);
    expect(t.host.textContent).not.toContain("Tag references to see them cluster.");
    t.change(snapOf(["a", "b", "c"], 1)); // same version: only a failed fetch asks again
    await settle();
    expect(t.api.graphEdges).toHaveBeenCalledTimes(2);
    t.wk.finish();
    t.sc.fire("hover", "a");
    expect(lastEdges(t.sc).length).toBeGreaterThan(0); // the retry's edges are in use
  });

  it("an emptied library fits again when it refills (final review M5)", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    expect(t.sc.calls.fit).toBe(1);
    t.change(snapOf([], 2));
    await settle();
    t.change(snapOf(["a", "b", "c"], 3));
    await settle();
    t.wk.finish();
    expect(t.sc.calls.fit).toBe(2);
  });

  it("reset_cold_starts", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    t.sc.fire("select", "a");
    const fits = t.sc.calls.fit;
    t.change(snapOf(["x", "y"], 5), true);
    await settle();
    const start = last(t.wk.posted.filter((m) => m.type === "start"))!;
    expect(start.type === "start" && start.input.prev).toBeUndefined();
    t.wk.finish();
    expect(t.sc.calls.fit).toBe(fits + 1);
    expect(last(t.sc.calls.select)).toBeNull();
  });

  it("fits_when_the_scene_arrives_after_the_layout", async () => {
    // The worker can settle before Pixi has loaded: the first fit must still happen.
    const { source } = fakeSource(snapOf(["a", "b", "c"]));
    const sc = fakeScene();
    const wk = fakeWorker();
    let ready!: (s: Scene) => void;
    const api = { graphEdges: vi.fn(async () => EDGES), related: vi.fn(async () => []), assetUrl: (p: string) => p } as unknown as Api;
    mountGalaxy(document.createElement("section"), source, {
      api, openReference: () => {}, makeScene: () => new Promise<Scene>((r) => (ready = r)), makeWorker: () => wk.worker,
    });
    await settle();
    wk.finish(); // settled, no scene yet
    ready(sc.scene);
    await settle();
    expect(sc.calls.fit).toBe(1);
    expect(last(sc.calls.nodes).length).toBe(3);
    // A later data change warm-starts without touching the camera (no late "centre").
    const cams = sc.calls.cam;
    wk.finish();
    expect(sc.calls.cam).toBe(cams);
  });

  it("warm_restart_never_moves_the_camera", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    const cams = t.sc.calls.cam;
    const fits = t.sc.calls.fit;
    t.change(snapOf(["a", "b", "c", "d"], 2));
    await settle();
    t.wk.finish();
    expect(t.sc.calls.cam).toBe(cams);
    expect(t.sc.calls.fit).toBe(fits);
  });

  it("hidden_galaxy_defers_refresh_until_shown", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    t.view.hide();
    t.change(snapOf(["a", "b", "c", "d"], 2));
    t.change(snapOf(["a", "b", "c", "d"], 3));
    t.change(snapOf(["a", "b", "c", "d", "e"], 4));
    await settle();
    expect(t.api.graphEdges).toHaveBeenCalledTimes(1); // nothing while hidden (carry-in 6)
    const starts = () => t.wk.posted.filter((m) => m.type === "start").length;
    const before = starts();
    t.view.show();
    await settle();
    expect(t.api.graphEdges).toHaveBeenCalledTimes(2);
    expect(starts()).toBe(before + 1);
    const start = last(t.wk.posted.filter((m) => m.type === "start"))!;
    expect(start.type === "start" && Object.keys(start.input.prev ?? {}).sort()).toEqual(["a", "b", "c"]);
  });

  it("hidden_galaxy_keeps_a_deferred_reset", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    t.sc.fire("select", "a");
    t.view.hide();
    t.change(snapOf(["x", "y"], 5), true);
    t.change(snapOf(["x", "y", "z"], 6)); // a later plain change must not lose the reset
    t.view.show();
    await settle();
    const start = last(t.wk.posted.filter((m) => m.type === "start"))!;
    expect(start.type === "start" && start.input.prev).toBeUndefined();
    expect(last(t.sc.calls.select)).toBeNull();
  });

  it("no_fit_while_hidden", async () => {
    const t = setup();
    await settle();
    t.view.hide();
    t.wk.finish(); // the cold layout settles while another view shows: a 1x1 fit would be wrong
    expect(t.sc.calls.fit).toBe(0);
    t.view.show();
    expect(t.sc.calls.fit).toBe(1);
  });

  it("kept_selection_refetches_neighbours_on_change", async () => {
    const t = setup();
    await settle();
    t.wk.finish();
    t.sc.fire("select", "a");
    await settle();
    t.change(snapOf(["a", "b", "c"], 2));
    await settle();
    expect(t.api.related).toHaveBeenCalledTimes(2);
  });

  it("superseded_layout_cannot_spend_the_fit", async () => {
    const t = setup();
    await settle(); // first start posted, its layout still running
    const old = t.wk.lastStart();
    t.change(snapOf(["a", "b", "x"], 2), true); // shares ids with the old library, so a warm start would show (M7)
    expect(last(t.wk.posted).type).toBe("stop"); // the old run is stopped before graph_edges returns
    // The worker had already posted a batch of the old run before it read the stop: it arrives late.
    t.wk.deliver({ type: "tick", run: old.run, ids: old.input.ids, xy: new Float32Array([0, 0, 1, 1, 2, 2]), alpha: 0.005 });
    t.wk.deliver({ type: "end", run: old.run });
    expect(t.sc.calls.fit).toBe(0); // the late end did not spend the fit
    await settle();
    const fresh = t.wk.lastStart();
    expect(fresh.run).not.toBe(old.run);
    expect(fresh.input.prev).toBeUndefined(); // the late tick did not turn the reset into a warm start
    t.wk.finish();
    expect(t.sc.calls.fit).toBe(1); // the new library fits
  });

  describe("keyboard (Global Constraints: every action from the keyboard)", () => {
    // a at the centre; b east; c south-east, exactly on the 45 deg edges (outside: the cone is open); d north; e far west
    const AT: Record<string, [number, number]> = { a: [0, 0], b: [100, 0], c: [100, 100], d: [0, -80], e: [-300, 10] };
    const key = (t: ReturnType<typeof setup>, k: string) =>
      t.host.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
    async function ready() {
      const t = setup({ ids: ["a", "b", "c", "d", "e"], edges: [] });
      await settle();
      t.wk.finish(AT);
      return t;
    }

    it("enter_with_nothing_selected_picks_the_reference_nearest_the_centre", async () => {
      const t = await ready(); // the fake camera's view centre is the world origin
      key(t, "Enter");
      expect(last(t.sc.calls.select)).toBe("a");
      expect(t.openReference).not.toHaveBeenCalled(); // a second Enter is the scene's activate
    });

    it("first_pick_skips_out_of_scope_references", async () => {
      const t = setup({ ids: ["a", "b"], edges: [], inScope: (id) => id !== "a" });
      await settle();
      t.wk.finish({ a: [0, 0], b: [100, 0] });
      key(t, "Enter");
      expect(last(t.sc.calls.select)).toBe("b");
    });

    it("arrows_move_to_the_nearest_reference_in_that_direction", async () => {
      const t = await ready();
      key(t, "Enter"); // a
      key(t, "ArrowRight");
      expect(last(t.sc.calls.select)).toBe("b"); // c sits exactly on the cone's edge, so only b qualifies
      key(t, "ArrowDown");
      expect(last(t.sc.calls.select)).toBe("c");
      key(t, "ArrowLeft"); // from c (100,100): a lies exactly on the edge, so e is the one to the west
      expect(last(t.sc.calls.select)).toBe("e");
      key(t, "ArrowRight"); // from e: a (300 away, nearly level) is nearest in the east cone
      expect(last(t.sc.calls.select)).toBe("a");
      key(t, "ArrowUp");
      expect(last(t.sc.calls.select)).toBe("d");
    });

    it("an_empty_cone_does_not_move", async () => {
      const t = await ready();
      key(t, "Enter"); // a
      key(t, "ArrowUp"); // d
      const n = t.sc.calls.select.length;
      key(t, "ArrowUp"); // nothing north of d
      expect(t.sc.calls.select.length).toBe(n);
      expect(last(t.sc.calls.select)).toBe("d");
    });

    it("arrows_without_a_selection_are_left_to_the_scene", async () => {
      const t = await ready();
      const n = t.sc.calls.select.length;
      key(t, "ArrowRight"); // the scene pans
      expect(t.sc.calls.select.length).toBe(n);
    });
  });

  it("empty_library_copy", async () => {
    const t = setup({ ids: [] });
    await settle();
    expect(t.host.textContent).toContain("No references yet.");
    expect(t.api.graphEdges).not.toHaveBeenCalled();
  });

  it("untagged_library_note", async () => {
    const t = setup({ edges: [] });
    await settle();
    t.wk.finish();
    expect(t.host.textContent).toContain("Tag references to see them cluster.");
  });

  it("destroy_terminates_worker", async () => {
    const t = setup();
    await settle();
    t.view.destroy();
    expect((t.wk.worker as unknown as { terminate: ReturnType<typeof vi.fn> }).terminate).toHaveBeenCalled();
  });
});
