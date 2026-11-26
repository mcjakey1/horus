// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Api, Change, Reference, Region, Tag, Taxonomy } from "../api";
import { createStore, type Store } from "../store";
import type { PickerOpts } from "../tagging/picker";
import { openLightbox } from "./view";

const tag = (id: string, operationId: string, region?: Region): Tag => ({ id, operationId, region, suggested: false });
const ref = (id: string, tags: Tag[]): Reference => ({
  id,
  title: `Plate ${id}`,
  file: `images/${id}.jpg`,
  hash: id,
  width: 300,
  height: 400, // aspect 0.75
  addedAt: "2026-11-25T00:00:00Z",
  tags,
  thumb256: `C:\\lib\\thumbs\\256\\${id}.jpg`,
  thumb1024: `C:\\lib\\thumbs\\1024\\${id}.jpg`,
});
const taxonomy: Taxonomy = {
  operations: [{ id: "sequence", name: "Sequence", plainLabel: "Lead the eye", icon: "", description: "" }],
  domains: [],
  branches: [],
  techniques: [],
  branchTechniques: [],
};
const none: Change = { references: [], removed: [], canUndo: true, canRedo: false };
const R = ref("r", [tag("t1", "sequence", { x: 0.1, y: 0.2, w: 0.3, h: 0.4 }), tag("t2", "sequence")]);

let store: Store, api: Api, opener: HTMLButtonElement, lb: { close(): void };
let openPicker: ReturnType<typeof vi.fn<(o: PickerOpts) => void>>;
const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector<T>(s)!;
const tick = () => new Promise((r) => setTimeout(r, 0));

/** The stage is 800×600 at client (OX, OY), not the origin, so the client offset is exercised (review
 * I3). In stage px the 0.75 plate letterboxes to left 175, width 450, height 600. */
const OX = 40, OY = 30;
function stubStage() {
  $(".lb-stage").getBoundingClientRect = () =>
    ({ left: OX, top: OY, width: 800, height: 600, right: OX + 800, bottom: OY + 600, x: OX, y: OY, toJSON() {} }) as DOMRect;
}
const at = (fx: number, fy: number) => ({ clientX: OX + 175 + fx * 450, clientY: OY + fy * 600 });
const pointer = (type: string, p: { clientX: number; clientY: number }, el = $(".lb-stage")) =>
  el.dispatchEvent(new MouseEvent(type, { ...p, button: 0, bubbles: true }));
const key = (k: string, init: KeyboardEventInit = {}, el: Element = document.activeElement ?? document.body) =>
  el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true, ...init }));
const near = (r: Region | undefined, want: Region) => {
  for (const k of ["x", "y", "w", "h"] as const) expect(r?.[k]).toBeCloseTo(want[k], 6);
};

beforeEach(() => {
  document.body.innerHTML = `<button id="opener">Open lightbox</button>`;
  opener = $<HTMLButtonElement>("#opener");
  opener.focus();
  store = createStore({ root: "C:\\lib", references: [R], links: [], boards: [], warning: null, taxonomyReadOnly: false }, taxonomy);
  api = {
    lightboxSource: vi.fn(async (id: string) => ({ path: `C:\\lib\\images\\${id}.jpg`, full: true, width: 1200, height: 1600 })),
    assetUrl: (p: string) => `asset://${encodeURIComponent(p)}`,
  } as unknown as Api;
  openPicker = vi.fn<(o: PickerOpts) => void>();
  lb = openLightbox(api, store, "r", { openPicker });
  stubStage();
});
afterEach(() => {
  lb.close();
  document.body.innerHTML = "";
});

describe("openLightbox", () => {
  it("lightbox_is_a_modal_dialog_with_focus_inside", () => {
    const el = $(".lightbox");
    expect(el.getAttribute("role")).toBe("dialog");
    expect(el.getAttribute("aria-modal")).toBe("true");
    expect(el.getAttribute("aria-label")).toContain("Plate r");
    expect(el.contains(document.activeElement)).toBe(true);
    expect($<HTMLImageElement>(".lb-plate img").draggable).toBe(false); // no native image drag
  });

  it("drag_opens_picker_with_region", () => {
    pointer("pointerdown", at(0.1, 0.1));
    pointer("pointermove", at(0.4, 0.5));
    expect($(".lb-draft").hidden).toBe(false);
    pointer("pointerup", at(0.4, 0.5));
    expect(openPicker).toHaveBeenCalledTimes(1);
    expect(openPicker.mock.calls[0][0].refId).toBe("r");
    near(openPicker.mock.calls[0][0].region, { x: 0.1, y: 0.1, w: 0.3, h: 0.4 });
  });

  it("committed_box_stays_what_the_picker_saves", () => {
    pointer("pointerdown", at(0.1, 0.1));
    pointer("pointerup", at(0.4, 0.5));
    const saved = openPicker.mock.calls[0][0].region!;
    const marker = $(".lb-pending");
    const drawn = () => [marker.style.left, marker.style.top, marker.style.width, marker.style.height];
    expect(marker.hidden).toBe(false);
    expect($(".lb-draft").hidden).toBe(true);
    const before = drawn();
    expect(before).toEqual(["10%", "10%", "30%", "40%"]);
    key("ArrowRight", {}, $(".lb-stage")); // a fresh draft, never the committed box
    expect($(".lb-draft").hidden).toBe(false);
    key("Escape", {}, $(".lb-stage")); // drops the draft only
    pointer("pointerdown", at(0.6, 0.6));
    pointer("pointerup", at(0.601, 0.601)); // an abandoned sliver
    expect(drawn()).toEqual(before); // the marker still shows what the docked picker will save
    expect(openPicker).toHaveBeenCalledTimes(1);
    near(saved, { x: 0.1, y: 0.1, w: 0.3, h: 0.4 });
    // a chip action or Ctrl+Z changes this reference while the picker is still docked: it will
    // still save that region, so the marker stays (only the picker leaving clears it)
    store.apply({ ...none, references: [{ ...R, tags: [R.tags[1]] }] });
    expect(marker.hidden).toBe(false);
    expect(drawn()).toEqual(before);
  });

  it("enter_mid_drag_commits_once", () => {
    pointer("pointerdown", at(0.1, 0.1));
    pointer("pointermove", at(0.4, 0.5));
    key("Enter", {}, $(".lb-stage"));
    pointer("pointerup", at(0.4, 0.5)); // the drag ended with the commit
    expect(openPicker).toHaveBeenCalledTimes(1);
  });

  it("lost_pointer_capture_ends_the_drag", () => {
    pointer("pointerdown", at(0.1, 0.1));
    pointer("pointermove", at(0.4, 0.5));
    $(".lb-stage").dispatchEvent(new Event("lostpointercapture"));
    expect($(".lb-draft").hidden).toBe(true);
    pointer("pointerup", at(0.4, 0.5));
    expect(openPicker).not.toHaveBeenCalled();
  });

  it("dialogs_raised_over_the_lightbox_keep_focus_and_keys", async () => {
    for (const [role, cls] of [["alertdialog", ""], ["dialog", ""], ["status", "notice"]] as const) {
      const d = document.createElement("div");
      d.setAttribute("role", role);
      if (cls) d.className = cls;
      d.innerHTML = `<button type="button">Try again</button>`;
      document.body.append(d);
      const btn = d.querySelector("button")!;
      const pressed = vi.fn();
      btn.addEventListener("keydown", pressed);
      btn.addEventListener("click", () => d.remove());
      btn.focus();
      expect(document.activeElement).toBe(btn); // not pulled back to the stage
      key("Enter", {}, btn);
      expect(pressed).toHaveBeenCalledTimes(1); // the key reached it, not re-sent from the stage
      store.apply({ ...none, references: [{ ...R }] }); // a lightbox re-render while the dialog holds focus
      await tick();
      expect(document.activeElement).toBe(btn);
      btn.click();
      expect(d.isConnected).toBe(false); // its button works
    }
    expect(document.querySelector(".lightbox")).not.toBeNull();
  });

  it("focus_on_body_keeps_keys_in_the_modal", () => {
    expect($(".lightbox").tabIndex).toBe(-1); // a click on blank lightbox area focuses the dialog root
    const behind = vi.fn((e: Event) => (e.target as Element).closest?.(".lightbox") ?? e.target);
    document.addEventListener("keydown", behind);
    (document.activeElement as HTMLElement).blur(); // e.g. a click on empty panel space in a browser without the tabIndex
    expect(document.activeElement).toBe(document.body);
    key("v", {}, document.body);
    expect($(".lightbox").classList.contains("is-value")).toBe(true); // handled by the lightbox
    expect(document.activeElement).toBe($(".lb-stage"));
    expect(behind.mock.calls.every(([e]) => (e.target as Element).closest?.(".lightbox"))).toBe(true); // nothing behind saw a body key
    (document.activeElement as HTMLElement).blur();
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.body.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true); // Tab can't walk into the page behind
    expect(document.activeElement).toBe($(".lb-stage"));
    (document.activeElement as HTMLElement).blur();
    key("Escape", {}, document.body);
    expect(document.querySelector(".lightbox")).toBeNull();
    document.removeEventListener("keydown", behind);
  });

  it("picker_cancel_clears_the_marker", async () => {
    openPicker.mockImplementation(() => {
      $(".lb-side").innerHTML = `<section class="picker"><input></section>`;
      $(".lb-side input").focus();
    });
    pointer("pointerdown", at(0.1, 0.1));
    pointer("pointerup", at(0.4, 0.5));
    await tick();
    expect($(".lb-pending").hidden).toBe(false); // the picker is open for it
    $(".lb-side").innerHTML = ""; // Esc in the picker: it closes itself, nothing saved
    await tick();
    expect($(".lb-pending").hidden).toBe(true);
    expect(document.activeElement).toBe($(".lb-stage"));
  });

  it("esc_mid_drag_cancels_the_drag_only", () => {
    pointer("pointerdown", at(0.1, 0.1));
    pointer("pointermove", at(0.4, 0.5));
    key("Escape", {}, $(".lb-stage"));
    expect(document.querySelector(".lightbox")).not.toBeNull();
    expect($(".lb-draft").hidden).toBe(true);
    pointer("pointerup", at(0.4, 0.5));
    expect(openPicker).not.toHaveBeenCalled();
  });

  it("tiny_or_cancelled_drag_opens_nothing", () => {
    pointer("pointerdown", at(0.1, 0.1));
    pointer("pointerup", { clientX: at(0.1, 0.1).clientX + 2, clientY: at(0.1, 0.1).clientY + 2 });
    pointer("pointerdown", at(0.1, 0.1));
    pointer("pointercancel", at(0.5, 0.5));
    pointer("pointerup", at(0.5, 0.5)); // no drag in progress any more
    expect(openPicker).not.toHaveBeenCalled();
    expect($(".lb-draft").hidden).toBe(true);
  });

  it("keyboard_draws_region", () => {
    $(".lb-stage").focus();
    key("Enter"); // a centred box
    expect($(".lb-draft").hidden).toBe(false);
    key("ArrowRight"); // move
    key("ArrowDown", { shiftKey: true }); // taller
    key("Escape"); // cancels the draft, keeps the lightbox
    expect($(".lb-draft").hidden).toBe(true);
    expect(document.querySelector(".lightbox")).not.toBeNull();
    key("Enter");
    key("ArrowRight");
    key("ArrowDown", { shiftKey: true });
    key("Enter"); // confirm
    expect(openPicker).toHaveBeenCalledTimes(1);
    near(openPicker.mock.calls[0][0].region, { x: 0.395, y: 0.375, w: 0.25, h: 0.27 });
  });

  it("esc_closes_and_returns_focus", () => {
    key("Escape");
    expect(document.querySelector(".lightbox")).toBeNull();
    expect(document.activeElement).toBe(opener);
    lb.close(); // idempotent
  });

  it("close_button_closes", () => {
    $<HTMLButtonElement>(".lb-close").click();
    expect(document.querySelector(".lightbox")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it("tab_wraps_inside_the_lightbox", () => {
    $(".lb-close").focus();
    key("Tab");
    expect(document.activeElement).toBe($(".lb-stage"));
    key("Tab", { shiftKey: true });
    expect(document.activeElement).toBe($(".lb-close"));
  });

  it("v_toggles_the_value_class", () => {
    key("v");
    expect($(".lightbox").classList.contains("is-value")).toBe(true);
    key("v");
    expect($(".lightbox").classList.contains("is-value")).toBe(false);
  });

  it("picker_keys_stay_in_the_picker", () => {
    const side = $(".lb-side");
    side.innerHTML = `<section class="picker"><input class="pk-search"></section>`;
    const input = side.querySelector("input")!;
    input.focus();
    key("v", {}, input);
    expect($(".lightbox").classList.contains("is-value")).toBe(false);
    // the picker cancels its own Esc (it closes itself), so the lightbox stays
    input.addEventListener("keydown", (e) => e.preventDefault());
    key("Escape", {}, input);
    expect(document.querySelector(".lightbox")).not.toBeNull();
  });

  it("focus_returns_into_lightbox_when_picker_leaves", async () => {
    const side = $(".lb-side");
    side.innerHTML = `<section class="picker"><input></section>`;
    side.querySelector("input")!.focus();
    side.innerHTML = ""; // the picker closed (Esc or tagged)
    await tick();
    expect(document.activeElement).toBe($(".lb-stage"));
  });

  it("outlines_existing_regions_through_the_cssom", () => {
    const boxes = document.querySelectorAll<HTMLElement>(".lb-box");
    expect(boxes).toHaveLength(1); // the whole-image tag draws no box
    const b = boxes[0];
    expect([b.style.left, b.style.top, b.style.width, b.style.height]).toEqual(["10%", "20%", "30%", "40%"]);
    expect(b.style.getPropertyValue("--c")).toBe("var(--seq)");
    expect(document.querySelectorAll(".lightbox [style]:not(.lb-box):not(.lb-plate)")).toHaveLength(0);
  });

  it("full_image_from_lightboxSource_with_thumb_fallback", async () => {
    const src = () => $<HTMLImageElement>(".lb-plate img").getAttribute("src");
    const note = () => $(".lb-note").hidden === false;
    const reopen = () => {
      lb.close();
      lb = openLightbox(api, store, "r", { openPicker });
    };
    // The original is preloaded off-screen; the plate swaps only once it has decoded.
    const preloads = vi.spyOn(HTMLImageElement.prototype, "src", "set");
    const preload = () => preloads.mock.contexts[preloads.mock.contexts.length - 1] as HTMLImageElement;
    reopen();
    expect(src()).toBe(api.assetUrl(R.thumb1024)); // the thumbnail at once
    await tick();
    expect(api.lightboxSource).toHaveBeenLastCalledWith("r");
    expect(preloads).toHaveBeenLastCalledWith(api.assetUrl("C:\\lib\\images\\r.jpg"));
    expect(src()).toBe(api.assetUrl(R.thumb1024)); // not swapped before it loads
    preload().dispatchEvent(new Event("load"));
    expect(src()).toBe(api.assetUrl("C:\\lib\\images\\r.jpg")); // then the original
    expect(note()).toBe(false); // full size: no preview note
    reopen();
    await tick();
    preload().dispatchEvent(new Event("error")); // e.g. an original gone from disk (carry-in b)
    expect(src()).toBe(api.assetUrl(R.thumb1024));
    expect(note()).toBe(true); // never a blank pane, and it says why
    reopen();
    await tick();
    const pending = preload();
    lb.close();
    pending.dispatchEvent(new Event("load")); // a load after close changes nothing
    lb = openLightbox(api, store, "r", { openPicker });
    await tick(); // its own lightboxSource call is made before the next mock is set
    preloads.mockRestore();
    vi.mocked(api.lightboxSource).mockRejectedValueOnce("Unknown reference"); // an unknown or hidden reference
    reopen();
    await tick();
    expect(src()).toBe(api.assetUrl(R.thumb1024));
    expect(note()).toBe(true);
    let late!: (s: { path: string; full: boolean; width: number; height: number }) => void;
    vi.mocked(api.lightboxSource).mockImplementationOnce(() => new Promise((r) => (late = r)));
    reopen();
    await tick();
    lb.close();
    late({ path: "C:\\late.jpg", full: true, width: 1, height: 1 }); // an answer after close changes nothing and throws nothing
    await tick();
    expect(document.querySelector(".lightbox")).toBeNull();
  });

  it("store_change_rerenders_and_removal_closes", () => {
    const R2 = { ...R, tags: [...R.tags, tag("t3", "sequence", { x: 0.5, y: 0.5, w: 0.2, h: 0.2 })] };
    store.apply({ ...none, references: [R2] });
    expect(document.querySelectorAll(".lb-box")).toHaveLength(2);
    // a link-only change re-renders too (Plan 4 Task 3 carry-in)
    const before = document.querySelector(".lb-box");
    store.apply({ ...none, links: [] });
    expect(document.querySelector(".lb-box")).not.toBe(before);
    store.apply({ ...none, removed: ["r"] });
    expect(document.querySelector(".lightbox")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  // ---------- Plan 4 Task 6: zoom, pan, overlays, preview ----------

  it("a_missing_or_invalid_source_reply_is_a_refusal", async () => {
    const src = () => $<HTMLImageElement>(".lb-plate img").getAttribute("src");
    for (const bad of [undefined, null, {}, { path: "", full: true }]) {
      vi.mocked(api.lightboxSource).mockResolvedValueOnce(bad as never);
      lb.close();
      lb = openLightbox(api, store, "r", { openPicker });
      await tick();
      expect(src()).toBe(api.assetUrl(R.thumb1024)); // the thumbnail stays
      expect($(".lb-note").hidden).toBe(false); // and says why
    }
  });

  it("preview_note_for_a_preview_source", async () => {
    vi.mocked(api.lightboxSource).mockResolvedValueOnce({ path: "C:\\cache\\r.png", full: false, width: 300, height: 400 });
    lb.close();
    lb = openLightbox(api, store, "r", { openPicker });
    expect($(".lb-note").hidden).toBe(true);
    await tick();
    expect($(".lb-note").hidden).toBe(false);
    expect($(".lb-note").textContent).toBe("Showing a preview — this format can't be shown at full size here.");
  });

  it("o_toggles_the_overlays", () => {
    key("o");
    expect($(".lb-boxes").hidden).toBe(true);
    key("o");
    expect($(".lb-boxes").hidden).toBe(false);
  });

  it("toolbar_shows_zoom_and_source_size_and_1_is_100_percent", () => {
    key("0"); // refit to the stubbed stage
    expect($(".lb-zoom").textContent).toBe("150%");
    expect($(".lb-size").textContent).toBe("300 × 400"); // the original's size (the reference), not the source's 1200 × 1600
    key("1");
    expect($(".lb-plate").style.width).toBe("300px");
    expect($(".lb-zoom").textContent).toBe("100%");
    key("0");
    expect($(".lb-plate").style.width).toBe("450px");
  });

  it("arrow_pans_when_zoomed_in_and_drafts_at_fit", () => {
    $(".lb-stage").focus();
    key("+"); // 150% to 187.5% at the centre: the plate is 750 tall in a 600 stage
    expect($(".lb-plate").style.top).toBe("-75px");
    key("ArrowUp"); // no draft: pans down by 10% of the stage
    expect($(".lb-plate").style.top).toBe("-15px");
    expect($(".lb-draft").hidden).toBe(true);
    key("0");
    key("ArrowUp"); // at fit: the centred draft, as in Plan 2
    expect($(".lb-draft").hidden).toBe(false);
  });

  it("wheel_zooms_at_the_cursor", () => {
    key("0");
    // Off-centre, at stage (300, 150): the image point under it, (300-175)/450 and 150/600, stays put.
    const p = { x: 300, y: 150 };
    $(".lb-stage").dispatchEvent(new WheelEvent("wheel", { deltaY: -1000, clientX: OX + p.x, clientY: OY + p.y, cancelable: true, bubbles: true }));
    const n = (k: "left" | "top" | "width" | "height") => parseFloat($(".lb-plate").style[k]);
    expect(n("width")).toBeGreaterThan(450);
    expect((p.x - n("left")) / n("width")).toBeCloseTo(125 / 450, 4); // the px strings are rounded
    expect((p.y - n("top")) / n("height")).toBeCloseTo(0.25, 4);
  });

  it("drag_after_zoom_saves_the_literal_region", () => {
    $(".lb-stage").focus();
    key("+"); // scale 1.875 at the centre: the plate is 562.5×750 at stage (118.75, -75)
    // The image rectangle x 0.2..0.6, y 0.3..0.5, in client px (stage + offset).
    pointer("pointerdown", { clientX: OX + 118.75 + 0.2 * 562.5, clientY: OY - 75 + 0.3 * 750 });
    pointer("pointerup", { clientX: OX + 118.75 + 0.6 * 562.5, clientY: OY - 75 + 0.5 * 750 });
    expect(openPicker).toHaveBeenCalledTimes(1);
    const r = openPicker.mock.calls[0][0].region!;
    for (const [k, want] of [["x", 0.2], ["y", 0.3], ["w", 0.4], ["h", 0.2]] as const) expect(Math.abs(r[k] - want)).toBeLessThan(1e-9);
  });

  it("a_focused_region_box_is_revealed_and_keeps_the_stage_keys", () => {
    $(".lb-stage").focus();
    for (let i = 0; i < 5; i++) key("+"); // about 458%
    for (let i = 0; i < 12; i++) key("ArrowRight"); // pan to the right edge ...
    for (let i = 0; i < 12; i++) key("ArrowDown"); // ... and the bottom: the region (top left) is off-screen
    const n = (k: "left" | "top" | "width" | "height") => parseFloat($(".lb-plate").style[k]);
    const centre = () => ({ x: n("left") + 0.25 * n("width"), y: n("top") + 0.4 * n("height") }); // R's region centre
    expect(centre().x).toBeLessThan(0);
    const box = $(".lb-box");
    box.focus(); // Tab lands on it
    const c = centre();
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.x).toBeLessThanOrEqual(800);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeLessThanOrEqual(600);
    key("Enter", {}, box); // the stage's keys still work from the box
    expect($(".lb-draft").hidden).toBe(false);
  });

  it("space_is_released_by_a_window_blur_or_a_keyup_elsewhere", () => {
    $(".lb-stage").focus();
    key(" ");
    expect($(".lightbox").classList.contains("is-pan")).toBe(true);
    window.dispatchEvent(new Event("blur"));
    expect($(".lightbox").classList.contains("is-pan")).toBe(false);
    pointer("pointerdown", at(0.2, 0.2)); // a plain drag draws again
    pointer("pointerup", at(0.5, 0.5));
    expect(openPicker).toHaveBeenCalledTimes(1);
    key(" ");
    document.body.dispatchEvent(new KeyboardEvent("keyup", { key: " ", bubbles: true })); // released outside the lightbox
    expect($(".lightbox").classList.contains("is-pan")).toBe(false);
  });

  it("overlay_ink_from_taxonomy", () => {
    const tax: Taxonomy = {
      ...taxonomy,
      operations: [...taxonomy.operations, { id: "pulse", name: "Pulse", plainLabel: "Beat", color: "teal", icon: "", description: "" }],
      techniques: [{ id: "rim-light", name: "Rim light", icon: "", description: "", synonyms: [], examples: [], custom: false }],
    };
    const tagged = { ...tag("p1", "pulse", { x: 0.1, y: 0.1, w: 0.2, h: 0.2 }), techniqueId: "rim-light", branchId: "pulse.x" };
    const R3 = ref("r3", [tagged, tag("g1", "ghost", { x: 0.6, y: 0.6, w: 0.2, h: 0.2 })]);
    lb.close();
    store = createStore({ root: "C:\\lib", references: [R3], links: [], boards: [], warning: null, taxonomyReadOnly: false }, tax);
    lb = openLightbox(api, store, "r3", { openPicker });
    stubStage();
    const [pulse, ghost] = [...document.querySelectorAll<HTMLElement>(".lb-box")];
    expect(pulse.style.getPropertyValue("--c")).toBe("var(--x-teal)");
    expect(ghost.style.getPropertyValue("--c")).toBe("var(--ink-2)"); // unknown: neutral, never amber
    store.apply({ ...none, taxonomy: { ...tax, operations: tax.operations.map((o) => (o.id === "pulse" ? { ...o, plainLabel: "Throb" } : o)) } });
    pointer("pointermove", at(0.2, 0.28)); // hover the pulse region, near its lower edge: a dropped client offset (30 px) would miss it
    const hot = document.querySelector<HTMLElement>(".lb-box.is-hot")!;
    expect(hot.querySelector(".lb-tag")!.textContent).toBe("Throb › Rim light");
    expect(hot.querySelector(".lb-tag .text")!.textContent).toBe("Throb");
    expect(hot.tabIndex).toBe(0); // Tab reaches it too
  });
});
