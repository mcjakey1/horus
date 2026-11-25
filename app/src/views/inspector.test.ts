// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { refOf, seed, snap, tagOf } from "../graph/fixtures.test-util";
import { tileBox } from "../reference/tile";
import { renderInspector, type InspectorOpts, type Selection } from "./inspector";

const region = { x: 0.1, y: 0.2, w: 0.5, h: 0.4 };
const refs = [
  refOf("a", [tagOf(seed, { tech: "chiaroscuro" })]),
  refOf("b", [tagOf(seed, { tech: "chiaroscuro", region })]),
  refOf("c", [tagOf(seed, { op: "infer" })]),
];
const s = snap(seed, refs);

describe("renderInspector", () => {
  let el: HTMLElement;
  let opts: InspectorOpts;
  beforeEach(() => {
    document.body.innerHTML = "";
    el = document.createElement("aside");
    document.body.append(el);
    opts = { editable: false, openReference: vi.fn(), select: vi.fn() };
  });
  const cell = (level: string) => el.querySelector<HTMLElement>(`.insp-crumb .cell[data-level="${level}"] .v`)!;

  it("breadcrumb_fills_to_depth", () => {
    renderInspector(el, s, { kind: "tech", id: "tech:chiaroscuro" }, opts);
    expect(el.querySelectorAll(".insp-crumb .cell")).toHaveLength(4);
    expect([...el.querySelectorAll(".insp-crumb .k")].map((k) => k.textContent)).toEqual(["01 Operation", "02 Domain", "03 Technique", "04 Reference"]);
    expect(cell("op").textContent).toBe("Differentiate");
    expect(cell("domain").textContent).toBe("Feature");
    expect(cell("tech").textContent).toBe("Chiaroscuro");
    expect(cell("ref").textContent).toBe(""); // .v:empty draws the tertiary em dash
    expect(cell("ref").matches(":empty")).toBe(true);
    renderInspector(el, s, { kind: "ref", id: "ref:chiaroscuro:b" }, opts);
    expect(cell("ref").textContent).toBe("Plate b");
    renderInspector(el, s, { kind: "op", id: "op:infer" }, opts);
    expect(cell("op").textContent).toBe("Infer");
    expect(cell("domain").matches(":empty")).toBe(true);
  });

  it("tech_tiles_use_letterbox", () => {
    renderInspector(el, s, { kind: "tech", id: "tech:chiaroscuro" }, opts);
    const tiles = el.querySelectorAll(".thumb");
    expect(tiles).toHaveLength(2);
    const { plate, outline } = tileBox(3 / 4, 64, region);
    const reg = el.querySelector<HTMLElement>('.thumb[data-open="b"] .treg')!;
    expect(reg.style.left).toBe(`${outline!.left}px`);
    expect(reg.style.top).toBe(`${outline!.top}px`);
    expect(reg.style.width).toBe(`${outline!.width}px`);
    expect(reg.style.height).toBe(`${outline!.height}px`);
    expect(reg.style.getPropertyValue("--c")).toBe("var(--diff)");
    const p = el.querySelector<HTMLElement>('.thumb[data-open="b"] .tplate')!;
    expect(p.style.left).toBe(`${plate.left}px`);
    expect(p.style.width).toBe(`${plate.width}px`);
    expect(el.querySelector('.thumb[data-open="a"] .treg')).toBeNull(); // a whole-image tag: letterbox only
    expect(el.querySelector('.thumb[data-open="a"] img')).toBeNull(); // no assetUrl given
    renderInspector(el, s, { kind: "tech", id: "tech:chiaroscuro" }, { ...opts, assetUrl: (p) => `asset://${p}` });
    expect(el.querySelector<HTMLImageElement>('.thumb[data-open="a"] img')!.getAttribute("src")).toBe("asset://a");
    el.querySelector<HTMLElement>('.thumb[data-open="a"]')!.click();
    expect(opts.openReference).toHaveBeenCalledWith("a");
  });

  it("ref_open_button", () => {
    renderInspector(el, s, { kind: "ref", id: "ref:chiaroscuro:a" }, opts);
    const b = [...el.querySelectorAll("button")].find((x) => x.textContent === "Open in Reference view")!;
    b.click();
    expect(opts.openReference).toHaveBeenCalledWith("a");
  });

  it("branch_tech_button_selects", () => {
    renderInspector(el, s, { kind: "branch", id: "br:differentiate.feature" }, opts);
    expect(el.textContent).toContain("Feature");
    const b = el.querySelector<HTMLElement>('[data-sel="tech:chiaroscuro"]')!;
    expect(b.textContent).toContain("Chiaroscuro");
    expect(b.querySelector(".count")!.textContent).toBe("2");
    b.click();
    expect(opts.select).toHaveBeenCalledWith({ kind: "tech", id: "tech:chiaroscuro" });
  });

  it("operation, technique detail and the empty selection", () => {
    renderInspector(el, s, { kind: "op", id: "op:differentiate" }, opts);
    expect(el.textContent).toContain("Stand out");
    expect(el.querySelector(".insp-count")!.textContent).toContain("2");
    renderInspector(el, s, { kind: "tech", id: "tech:face-schema" }, opts);
    expect(el.querySelector(".insp-title")!.textContent).toBe("Face schema");
    expect([...el.querySelectorAll('.insp-used [data-sel^="br:"]')].map((b) => b.getAttribute("data-sel"))).toEqual([
      "br:differentiate.social", "br:group.social", "br:infer.social",
    ]);
    renderInspector(el, s, null, opts);
    const ops = [...el.querySelectorAll<HTMLElement>('[data-sel^="op:"]')];
    expect(ops.map((b) => b.dataset.sel)).toEqual(seed.operations.map((o) => `op:${o.id}`));
    ops[3].click();
    expect(opts.select).toHaveBeenCalledWith({ kind: "op", id: "op:infer" });
    // an unknown id renders as no selection rather than throwing
    renderInspector(el, s, { kind: "tech", id: "tech:gone" }, opts);
    expect(el.querySelectorAll('[data-sel^="op:"]')).toHaveLength(4);
  });

  it("no_inline_style_markup", () => {
    const written: string[] = [];
    const desc = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML")!;
    Object.defineProperty(el, "innerHTML", {
      configurable: true,
      get() { return desc.get!.call(this); },
      set(v: string) { written.push(v); desc.set!.call(this, v); },
    });
    const sels: Selection[] = [null, { kind: "op", id: "op:differentiate" }, { kind: "branch", id: "br:differentiate.feature" },
      { kind: "tech", id: "tech:chiaroscuro" }, { kind: "ref", id: "ref:chiaroscuro:b" }];
    for (const sel of sels) renderInspector(el, s, sel, opts);
    expect(written.length).toBeGreaterThanOrEqual(sels.length);
    for (const html of written) expect(html).not.toContain("style=");
    // geometry and inks arrive through the CSSOM only, on these elements
    renderInspector(el, s, { kind: "tech", id: "tech:chiaroscuro" }, opts);
    for (const x of el.querySelectorAll("[style]")) expect(x.matches(".tplate, .treg, .insp-crumb")).toBe(true);
  });
});
