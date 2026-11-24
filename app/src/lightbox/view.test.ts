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

/** The stage is 800Ã—600 at the origin, so the 0.75 plate letterboxes to left 175, width 450, height 600. */
function stubStage() {
  $(".lb-stage").getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON() {} }) as DOMRect;
}
const at = (fx: number, fy: number) => ({ clientX: 175 + fx * 450, clientY: fy * 600 });
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
  store = createStore({ root: "C:\\lib", references: [R], links: [], warning: null, taxonomyReadOnly: false }, taxonomy);
  api = {
    imagePath: vi.fn(async (id: string) => `C:\\lib\\images\\${id}.jpg`),
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
    store.apply({ ...none, references: [{ ...R, tags: [...R.tags, tag("t3", "sequence", saved)] }] });
    expect(marker.hidden).toBe(true); // the saved tag outlines it now
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

  it("full_image_from_imagePath_with_thumb_fallback", async () => {
    const src = () => $<HTMLImageElement>(".lb-plate img").getAttribute("src");
    const reopen = () => {
      lb.close();
      lb = openLightbox(api, store, "r", { openPicker });
    };
    reopen();
    expect(src()).toBe(api.assetUrl(R.thumb1024)); // the thumbnail at once
    await tick();
    expect(api.imagePath).toHaveBeenLastCalledWith("r");
    expect(src()).toBe(api.assetUrl("C:\\lib\\images\\r.jpg")); // then the original
    vi.mocked(api.imagePath).mockRejectedValueOnce("not built"); // Task 5 not landed yet
    reopen();
    await tick();
    expect(src()).toBe(api.assetUrl(R.thumb1024));
    let late!: (p: string) => void;
    vi.mocked(api.imagePath).mockImplementationOnce(() => new Promise<string>((r) => (late = r)));
    reopen();
    await tick();
    lb.close();
    late("C:\\late.jpg"); // an answer after close changes nothing and throws nothing
    await tick();
    expect(document.querySelector(".lightbox")).toBeNull();
  });

  it("store_change_rerenders_and_removal_closes", () => {
    const R2 = { ...R, tags: [...R.tags, tag("t3", "sequence", { x: 0.5, y: 0.5, w: 0.2, h: 0.2 })] };
    store.apply({ ...none, references: [R2] });
    expect(document.querySelectorAll(".lb-box")).toHaveLength(2);
    store.apply({ ...none, removed: ["r"] });
    expect(document.querySelector(".lightbox")).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
