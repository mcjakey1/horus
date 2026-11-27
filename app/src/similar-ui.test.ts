// @vitest-environment jsdom
// Plan 5 Task 7: "Looks similar" in the Reference view, the search dropdown and the drop target.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import html from "../index.html?raw";
import source from "./similar-ui.ts?raw";
import type { Api, LibraryView, Reference, SimilarPhase, SimilarStatus, Taxonomy } from "./api";
import type { DropWin } from "./intake";
import { wireIntake } from "./intake";
import { mountReference } from "./reference/view";
import { createStore, type Store } from "./store";
import { wireSimilar } from "./similar-ui";

const ref = (id: string, title: string): Reference => ({
  id,
  title,
  file: `images/${id}.jpg`,
  hash: id,
  width: 300,
  height: 400,
  addedAt: "2026-11-25T00:00:00Z",
  tags: [],
  thumb256: `C:\\lib\\thumbs\\256\\${id}.jpg`,
  thumb1024: `C:\\lib\\thumbs\\1024\\${id}.jpg`,
});

const taxonomy: Taxonomy = {
  operations: [{ id: "differentiate", name: "Differentiate", plainLabel: "Stand out", icon: "", description: "" }],
  domains: [{ id: "feature", name: "Feature", icon: "", description: "" }],
  branches: [{ id: "differentiate-feature", operationId: "differentiate", domainId: "feature" }],
  techniques: [{ id: "backlight", name: "Backlight", icon: "", description: "", synonyms: [], examples: [], custom: false }],
  branchTechniques: [{ branchId: "differentiate-feature", techniqueId: "backlight" }],
};

const library: LibraryView = {
  root: "C:\\lib",
  references: [ref("a", "Plate A"), ref("b", "Plate B"), ref("c", "Plate C")],
  links: [],
  boards: [{ id: "bd", name: "Posters", referenceIds: ["a", "b"] }],
  warning: null,
  taxonomyReadOnly: false,
};

const status = (phase: SimilarPhase, extra: Partial<SimilarStatus> = {}): SimilarStatus => ({
  phase,
  downloadDone: 0,
  downloadTotal: 213373093,
  indexed: 0,
  total: 0,
  diskBytes: 0,
  error: null,
  ...extra,
});

const settle = (ms = 300) => new Promise((r) => setTimeout(r, ms));

type Rig = {
  view: ReturnType<typeof mountReference>;
  api: Api;
  store: Store;
  emit(s: SimilarStatus): void;
  drop(type: "enter" | "over" | "drop" | "leave", paths?: string[]): void;
  openSettings: ReturnType<typeof vi.fn>;
  destroy(): void;
};

/** Everything boot() wires for Find similar, on the real index.html. */
async function rig(phase: SimilarPhase): Promise<Rig> {
  document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  let emit: (s: SimilarStatus) => void = () => {};
  let dropCb: ((e: { payload: never }) => void)[] = [];
  const base: Partial<Api> = {
    getSettings: vi.fn(async () => ({ lastLibrary: "C:\\lib", theme: "light" as const, findSimilar: "on" as const })),
    getTaxonomy: vi.fn(async () => taxonomy),
    related: vi.fn(async () => []),
    search: vi.fn(async () => [{ kind: "technique" as const, id: "backlight", operationId: "differentiate", count: 2 }]),
    assetUrl: (p: string) => `asset://${encodeURIComponent(p)}`,
    similarStatus: vi.fn(async () => status(phase)),
    onSimilarStatus: vi.fn(async (cb: (s: SimilarStatus) => void) => ((emit = cb), () => {})),
    // Scores stay in the API for tests; the UI never shows them.
    similarByRef: vi.fn(async () => [{ id: "b", score: 0.91 }, { id: "c", score: 0.62 }]),
    similarByText: vi.fn(async () => [{ id: "b", score: 0.07 }, { id: "c", score: 0.05 }]),
    similarByFile: vi.fn(async () => [{ id: "c", score: 0.8 }]),
    importPaths: vi.fn(async () => ({ report: { added: [], duplicates: [], skipped: [], warnings: [] }, change: { references: [], removed: [], canUndo: false, canRedo: false } })),
  };
  // Any other Api member: a quiet stub.
  const api = new Proxy(base as Api, {
    get: (t, k: string) => (k in t ? t[k as keyof Api] : ((t as unknown as Record<string, unknown>)[k] = vi.fn(async () => undefined))),
  });
  const win: DropWin = {
    onDragDropEvent: async (cb) => ((dropCb = [...dropCb, cb as never]), () => {}),
  };
  const store = createStore(library, taxonomy);
  const openSettings = vi.fn();
  // As boot() wires it: the view shows its first reference before wireSimilar exists.
  let sim: ReturnType<typeof wireSimilar> | null = null;
  let last: string | null = null;
  const view = mountReference(document.body, api, store, { onShow: (id) => ((last = id), sim?.show(id)), similar: () => sim?.search() });
  await view.ready;
  const intake = wireIntake(win, document, { api, store, notice: () => {}, show: () => {}, openPicker: () => {} });
  sim = wireSimilar(document.body, api, store, win, { search: view.search, openSettings });
  if (last) sim.show(last);
  await settle();
  // jsdom has no layout: the drop's hit-test returns whatever element the test aims at.
  let aim: Element | null = null;
  document.elementFromPoint = () => aim;
  return {
    view,
    api,
    store,
    emit: (s) => emit(s),
    drop(type, paths = ["C:\\x\\dropped.png"]) {
      aim = document.querySelector("[data-similar-drop]");
      const payload = { type, paths, position: { x: 1, y: 1 } };
      dropCb.forEach((cb) => cb({ payload: payload as never }));
    },
    openSettings,
    destroy: () => (sim?.destroy(), intake(), view.destroy()),
  };
}

const $ = (s: string) => document.querySelector<HTMLElement>(s);
const type = (q: string) => {
  const input = $("#q") as HTMLInputElement;
  input.value = q;
  input.dispatchEvent(new Event("input"));
};
const group = () => $('[aria-label="Looks similar"]');

describe("Find similar UI", () => {
  let r: Rig;
  afterEach(() => r.destroy());

  describe("off", () => {
    beforeEach(async () => (r = await rig("off")));

    it("absent_when_off", async () => {
      expect($('[data-pane="similar"]')).toBeNull();
      expect(group()).toBeNull();
      expect($("[data-similar-drop]")).toBeNull();
      type("backlit");
      await settle();
      expect(r.api.search).toHaveBeenCalled();
      expect(r.api.similarByText).not.toHaveBeenCalled();
      expect(group()).toBeNull();
    });

    it("appears_when_ready_and_leaves_when_off", async () => {
      r.emit(status("ready"));
      await settle(0);
      const tab = $('[data-pane="similar"]')!;
      expect(tab.getAttribute("role")).toBe("tab");
      tab.click();
      await settle(0);
      expect(tab.getAttribute("aria-selected")).toBe("true");
      r.emit(status("off"));
      await settle(0);
      expect($('[data-pane="similar"]')).toBeNull();
      expect($("#pane-similar")).toBeNull();
      expect($('[data-pane="callouts"]')!.getAttribute("aria-selected")).toBe("true");
      expect($("#pane-callouts")!.hidden).toBe(false);
    });

    it("status_bar_reflects_phase_and_opens_settings", async () => {
      const bar = $("#find-similar")!;
      expect(bar.tagName).toBe("BUTTON");
      expect(bar.textContent).toBe("Find similar: off");
      r.emit(status("indexing", { indexed: 12, total: 50 }));
      expect(bar.textContent).toBe("Find similar: indexing 12 of 50");
      expect([...bar.querySelectorAll(".mono")].map((e) => e.textContent)).toEqual(["12", "50"]);
      r.emit(status("paused"));
      expect(bar.textContent).toBe("Find similar: paused");
      r.emit(status("error", { error: "Find similar couldn't start on this computer." }));
      expect(bar.textContent).toBe("Find similar: needs attention");
      r.emit(status("ready"));
      expect(bar.textContent).toBe("Find similar: ready");
      bar.click();
      expect(r.openSettings).toHaveBeenCalledTimes(1);
    });
  });

  describe("on", () => {
    beforeEach(async () => (r = await rig("ready")));

    it("tab_lists_similar_labelled", async () => {
      const ranked = $("#pane-ranked")!.innerHTML;
      $('[data-pane="similar"]')!.click();
      await settle(0);
      expect(r.api.similarByRef).toHaveBeenCalledWith("a");
      const pane = $("#pane-similar")!;
      expect(pane.hidden).toBe(false);
      expect(pane.textContent).toContain("Looks alike — not about technique.");
      const rows = [...pane.querySelectorAll<HTMLElement>("[data-go]")].map((e) => e.dataset.go);
      expect(rows).toEqual(["b", "c"]);
      expect(pane.querySelector(".row")!.textContent).not.toMatch(/\d/);
      expect($("#pane-ranked")!.innerHTML).toBe(ranked);
    });

    it("tab_not_indexed_yet", async () => {
      vi.mocked(r.api.similarByRef).mockRejectedValue("NotIndexedYet");
      $('[data-pane="similar"]')!.click();
      await settle(0);
      expect($("#pane-similar")!.textContent).toContain("This reference isn't indexed yet.");
    });

    it("search_groups_kept_apart", async () => {
      type("backlit");
      await settle();
      const opts = [...$("#q-results")!.children] as HTMLElement[];
      const techniques = opts.filter((li) => li.matches('[role="option"][data-t]'));
      expect(techniques.length).toBe(1);
      const g = group()!;
      expect(g.getAttribute("role")).toBe("group");
      // The technique options come first; the group after them, apart.
      expect(opts.indexOf(techniques[0])).toBeLessThan(opts.findIndex((li) => li.contains(g)));
      expect(g.textContent).toContain("Looks similar");
      expect(g.textContent).toContain("Works best in English.");
      const rows = [...g.querySelectorAll<HTMLElement>('[role="option"]')];
      expect(rows.map((x) => x.dataset.r)).toEqual(["b", "c"]);
      expect(rows.every((x) => !/\d/.test(x.textContent!))).toBe(true);
      expect(techniques.some((li) => li.dataset.r)).toBe(false);
    });

    it("stale_similar_dropped", async () => {
      let resolve!: (hits: { id: string; score: number }[]) => void;
      vi.mocked(r.api.similarByText).mockImplementation(() => new Promise((res) => (resolve = res)));
      type("backlit");
      await settle(200); // past the debounce: the call is out
      type("");
      resolve([{ id: "b", score: 0.5 }]);
      await settle(0);
      expect(group()).toBeNull();
      expect($("#q-results")!.hidden).toBe(true);
    });

    it("tab_filters_by_scope", async () => {
      $('[data-pane="similar"]')!.click();
      await settle(0);
      r.store.setScope("bd");
      await settle(0);
      const ids = () => [...$("#pane-similar")!.querySelectorAll<HTMLElement>("[data-go]")].map((e) => e.dataset.go);
      expect(ids()).toEqual(["b"]);
      r.store.setScope(null);
      await settle(0);
      expect(ids()).toEqual(["b", "c"]);
    });

    it("group_filters_by_scope", async () => {
      r.store.setScope("bd");
      type("backlit");
      await settle();
      const ids = () => [...group()!.querySelectorAll<HTMLElement>('[role="option"]')].map((e) => e.dataset.r);
      expect(ids()).toEqual(["b"]);
      r.store.setScope(null);
      await settle(0);
      expect(ids()).toEqual(["b", "c"]);
    });

    it("drop_zone_outside_listbox", () => {
      const zone = $("[data-similar-drop]")!;
      expect(zone).not.toBeNull();
      expect($("#q-results")!.contains(zone)).toBe(false);
      expect(zone.closest(".search")).not.toBeNull();
    });

    it("drop_searches_not_imports", async () => {
      r.drop("drop", ["C:\\x\\dropped.png"]);
      await settle(0);
      expect(r.api.similarByFile).toHaveBeenCalledWith("C:\\x\\dropped.png");
      expect(r.api.importPaths).not.toHaveBeenCalled();
      const ids = [...group()!.querySelectorAll<HTMLElement>('[role="option"]')].map((e) => e.dataset.r);
      expect(ids).toEqual(["c"]);
    });

    it("first_reference_reaches_tab_without_a_manual_show (review 1)", async () => {
      // The rig never calls show(): the view's own first show() was buffered until wiring.
      expect(r.api.similarByRef).toHaveBeenCalledWith("a");
      $('[data-pane="similar"]')!.click();
      await settle(0);
      expect([...$("#pane-similar")!.querySelectorAll<HTMLElement>("[data-go]")].length).toBe(2);
    });

    it("late_drop_result_is_stale_after_typing_esc_or_another_drop (review 2)", async () => {
      const answers: ((h: { id: string; score: number }[]) => void)[] = [];
      vi.mocked(r.api.similarByFile).mockImplementation(() => new Promise((res) => answers.push(res)));
      // Esc after a drop: its late answer never reopens the list.
      r.drop("drop");
      const input = $("#q") as HTMLInputElement;
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      answers[0]([{ id: "c", score: 0.8 }]);
      await settle(0);
      expect($("#q-results")!.hidden).toBe(true);
      // A typed query after a drop: the drop's late answer doesn't clear it.
      r.drop("drop");
      type("backlit");
      answers[1]([{ id: "c", score: 0.8 }]);
      await settle();
      expect(input.value).toBe("backlit");
      expect(group()!.textContent).toContain("Works best in English."); // the typed query's group, not the drop's
      // Two drops: the first one's late answer never replaces the second's.
      r.drop("drop");
      r.drop("drop");
      answers[3]([{ id: "b", score: 0.9 }]);
      answers[2]([{ id: "c", score: 0.8 }]);
      await settle(0);
      const ids = [...group()!.querySelectorAll<HTMLElement>('[role="option"]')].map((e) => e.dataset.r);
      expect(ids).toEqual(["b"]);
    });

    it("drop_focuses_and_outside_pointer_closes (review 4)", async () => {
      r.drop("drop");
      await settle(0);
      expect(document.activeElement).toBe($("#q"));
      expect($("#q-results")!.hidden).toBe(false);
      $("#specimen")!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      expect($("#q-results")!.hidden).toBe(true);
    });

    it("dropped_image_group_has_no_english_hint (review 8)", async () => {
      r.drop("drop");
      await settle(0);
      expect(group()!.textContent).not.toContain("Works best in English.");
      type("backlit");
      await settle();
      expect(group()!.textContent).toContain("Works best in English.");
      expect(group()!.getAttribute("aria-describedby")).toBe("q-sim-hint");
    });

    it("tab_shows_pending_not_old_rows (review 5)", async () => {
      $('[data-pane="similar"]')!.click();
      await settle(0);
      expect($("#pane-similar")!.querySelectorAll("[data-go]").length).toBe(2);
      vi.mocked(r.api.similarByRef).mockImplementation(() => new Promise(() => {}));
      r.view.show("b");
      await settle(0);
      const pane = $("#pane-similar")!;
      expect(pane.querySelectorAll("[data-go]").length).toBe(0);
      expect(pane.textContent).toContain("Looks alike — not about technique.");
      expect(pane.textContent).toContain("Searching…");
    });

    it("an open group leaves when Find similar turns off (AGY #2)", async () => {
      type("backlit");
      await settle();
      expect(group()).not.toBeNull();
      r.emit(status("off"));
      await settle(0);
      expect(group()).toBeNull();
      expect($("#q-results")!.hidden).toBe(false); // option A's list stays
      r.emit(status("ready"));
      await settle(0);
      r.drop("drop");
      await settle(0);
      expect(group()).not.toBeNull();
      r.emit(status("off"));
      await settle(0);
      expect(group()).toBeNull();
      expect($("#q-results")!.hidden).toBe(true); // it held only the drop's group
    });

    it("a pending option B never returns after Find similar turns off (AGY #2)", async () => {
      let reject!: (e: unknown) => void;
      vi.mocked(r.api.similarByText).mockImplementation(() => new Promise((_res, rej) => (reject = rej)));
      type("backlit");
      await settle(200); // past the debounce: the call is out
      r.emit(status("off"));
      reject("FindSimilarOff");
      await settle(0);
      expect(group()).toBeNull();
      r.emit(status("ready"));
      await settle(0);
      type("moody");
      await settle(20); // inside the debounce
      r.emit(status("off"));
      await settle(300);
      expect(group()).toBeNull();
    });

    it("no_tagging_path", () => {
      expect(source).not.toMatch(/\baddTags\b|\bupdateTag\b/);
    });
  });
});
