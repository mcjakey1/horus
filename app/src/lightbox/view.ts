// The lightbox (SPEC §6.6; Plan 2 Task 10, extended by Plan 4 Task 6): the image letterboxed into the
// viewport, zoomed with the wheel or + - 0 1 and panned with Space+drag, middle-drag or the arrows
// (zoomed in, no draft). Region tags are outlined; hover or Tab names one, `o` hides them, `v` is
// the value view. A box drawn by drag (or by keyboard: Enter, arrows, Shift+arrows resize, Enter)
// tags that region through the picker. It is modal: a dialog, focus kept inside, Esc closes, and
// focus goes back to the opener. The original loads at full size when the webview can show it;
// otherwise a preview, or the thumbnail, with a note saying so (never a blank pane).
import type { Api, Region } from "../api";
import { esc } from "../esc";
import { digitOf, isTextEntry } from "../keys";
import { opInk, opLabel } from "../ops";
import type { Box } from "../reference/tile";
import type { Store } from "../store";
import type { PickerOpts } from "../tagging/picker";
import { MIN_REGION, normRect, type Pt } from "./regions";
import { fitView, hitRegion, panBy, plateOf, type View, zoomAt } from "./zoom";

const STEP = 0.02; // a keyboard move or resize, in 0..1 of the image
const CENTRED: Region = { x: 0.375, y: 0.375, w: 0.25, h: 0.25 };
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [href], [tabindex]";
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${+(v * 100).toFixed(4)}%`;
const PAN_STEP = 0.1; // an arrow pan, in 0..1 of the viewport
const ZOOM_KEYS: Record<string, number> = { "+": 1.25, "=": 1.25, "-": 0.8 };
const PREVIEW_NOTE = "Showing a preview — this format can't be shown at full size here.";

export function openLightbox(
  api: Api,
  store: Store,
  refId: string,
  deps: { openPicker(opts: PickerOpts): void; onClose?(): void },
): { close(): void } {
  const ref = store.refs.get(refId);
  if (!ref) return { close() {} };
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const life = new AbortController();
  const signal = life.signal;
  const imgSize = ref.width && ref.height ? { w: ref.width, h: ref.height } : { w: 3, h: 4 };

  const el = document.createElement("div");
  el.className = "lightbox";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", `Lightbox: ${ref.title}`);
  el.tabIndex = -1; // a click on blank lightbox space focuses the dialog root, never <body>; not a Tab stop
  el.classList.toggle("is-value", document.body.classList.contains("value")); // starts as the artist was looking
  el.innerHTML = `
    <div class="lb-stage" tabindex="0" aria-label="${esc(ref.title)}. Drag a box, or press Enter and the arrow keys, to tag a region." aria-describedby="lb-hint">
      <div class="lb-plate"><img alt="${esc(ref.title)}" draggable="false"><div class="lb-boxes"></div><div class="lb-pending" hidden></div><div class="lb-draft" hidden></div></div>
      <p class="lb-note" hidden>${PREVIEW_NOTE}</p>
    </div>
    <aside class="lb-side" aria-label="Tag the region"></aside>
    <div class="lb-bar"><p class="lb-hint" id="lb-hint">Drag a box to tag a region · Enter, arrows (Shift resizes), Enter · wheel or + − 0 1 zooms · Space+drag pans · o regions · v value view · Esc closes</p><span class="lb-zoom"></span><span class="lb-size">${ref.width} × ${ref.height}</span><button type="button" class="text-btn lb-close">Close</button></div>`;
  const q = <T extends HTMLElement = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const stage = q(".lb-stage"), plateEl = q(".lb-plate"), img = q<HTMLImageElement>("img");
  const boxes = q(".lb-boxes"), draftEl = q(".lb-draft"), pendingEl = q(".lb-pending");
  const note = q(".lb-note"), zoomEl = q(".lb-zoom");
  let closed = false;
  let from: Pt | null = null; // a drag in progress
  let panFrom: Pt | null = null; // a Space+drag or middle-drag pan in progress
  let space = false; // Space is held: a left drag pans
  let draft: Region | null = null; // the box being drawn, in 0..1

  // ---------- geometry: one View for painting the plate and for pointer maths ----------
  let view: View = { scale: 1, tx: 0, ty: 0 };
  let fitted = true; // follows the stage's size until the artist zooms or pans
  const rect = () => stage.getBoundingClientRect();
  const vpOf = (r: DOMRect) => ({ w: r.width, h: r.height });
  const fitScale = () => fitView(imgSize, vpOf(rect())).scale;
  /** The View now: refitted to the stage while `fitted`. */
  const cur = () => (fitted ? (view = fitView(imgSize, vpOf(rect()))) : view);
  /** The plate on screen (client px), for `normRect` (C21). */
  const plateClient = (): Box => {
    const r = rect();
    const p = plateOf(cur(), imgSize);
    return { ...p, left: r.left + p.left, top: r.top + p.top };
  };
  function layout() {
    const r = rect();
    if (!(r.width > 0 && r.height > 0)) return;
    const v = fitted ? cur() : (view = panBy(view, 0, 0, imgSize, vpOf(r)));
    const p = plateOf(v, imgSize);
    for (const k of ["left", "top", "width", "height"] as const) plateEl.style.setProperty(k, `${p[k]}px`);
    zoomEl.textContent = `${Math.round(v.scale * 100)}%`;
  }
  /** Pans so `r` (0..1 of the image) is centred, unless it is already wholly on screen. */
  function reveal(r: Region) {
    const s = rect();
    const p = plateOf(cur(), imgSize);
    const [l, t, w, h] = [p.left + r.x * p.width, p.top + r.y * p.height, r.w * p.width, r.h * p.height];
    if (l >= 0 && t >= 0 && l + w <= s.width && t + h <= s.height) return;
    setView(panBy(cur(), s.width / 2 - (l + w / 2), s.height / 2 - (t + h / 2), imgSize, vpOf(s)));
  }
  function setView(v: View) {
    fitted = false;
    view = v;
    layout();
  }
  /** Zooms at `pt` (stage px; the centre by default). The floor is fit, or 100% when that is smaller. */
  function zoomBy(factor: number, pt?: Pt) {
    const r = rect();
    if (!(r.width > 0 && r.height > 0)) return;
    setView(zoomAt(cur(), factor, pt ?? { x: r.width / 2, y: r.height / 2 }, Math.min(fitScale(), 1)));
  }
  const place = (b: HTMLElement, r: Region) => {
    b.style.left = pct(r.x);
    b.style.top = pct(r.y);
    b.style.width = pct(r.w);
    b.style.height = pct(r.h);
  };
  function showDraft(r: Region | null) {
    draft = r;
    draftEl.hidden = !r;
    if (r) place(draftEl, r);
  }
  const regionTags = () => (store.refs.get(refId)?.tags ?? []).filter((t) => t.region);
  function renderBoxes() {
    boxes.replaceChildren(
      ...regionTags().map((t) => {
        const b = document.createElement("div");
        b.className = "lb-box";
        b.dataset.tag = t.id;
        b.tabIndex = 0; // Tab names it, as hover does
        b.setAttribute("role", "img");
        const ink = opInk(store.tax, t.operationId);
        const plain = opLabel(store.tax, t.operationId).plain;
        const tech = t.techniqueId ? (store.tax.techniques.find((x) => x.id === t.techniqueId)?.name ?? t.techniqueId) : null;
        b.setAttribute("aria-label", tech ? `${plain} › ${tech}` : plain);
        b.innerHTML = `<span class="lb-tag"><span class="text">${esc(plain)}</span>${tech ? ` › ${esc(tech)}` : ""}</span>`;
        place(b, t.region!);
        b.style.setProperty("--c", ink.base);
        b.style.setProperty("--t", ink.text);
        return b;
      }),
    );
  }
  /** Highlights the smallest region under the pointer, with its label. */
  function hover(e: MouseEvent) {
    const r = rect();
    const regions = regionTags().map((t) => ({ tagId: t.id, region: t.region! }));
    const pt = { x: e.clientX - r.left, y: e.clientY - r.top };
    const hot = boxes.hidden ? null : hitRegion(regions, pt, plateOf(cur(), imgSize));
    for (const b of boxes.children) b.classList.toggle("is-hot", (b as HTMLElement).dataset.tag === hot);
  }
  /** The committed box is a read-only marker of what the picker will save; later edits start a new draft. */
  function showPending(r: Region | null) {
    pendingEl.hidden = !r;
    if (r) place(pendingEl, r);
  }
  function commit(region: Region) {
    from = null; // Enter mid-drag ends the drag, so its pointerup can't commit again
    showDraft(null);
    showPending(region);
    deps.openPicker({ refId, region });
  }

  // ---------- pointer: drag a box, or pan ----------
  const pt = (e: MouseEvent): Pt => ({ x: e.clientX, y: e.clientY });
  stage.addEventListener("pointerdown", (e) => {
    if (e.button === 1 || (e.button === 0 && space)) {
      e.preventDefault(); // no middle-click autoscroll
      panFrom = pt(e);
      stage.setPointerCapture?.(e.pointerId);
      stage.focus();
      return;
    }
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection, no native image drag
    from = pt(e);
    showDraft(null);
    stage.setPointerCapture?.(e.pointerId);
    stage.focus();
  }, { signal });
  stage.addEventListener("pointermove", (e) => {
    if (panFrom) {
      const p = pt(e);
      setView(panBy(cur(), p.x - panFrom.x, p.y - panFrom.y, imgSize, vpOf(rect())));
      panFrom = p;
    } else if (from) showDraft(normRect(from, pt(e), plateClient()));
    else hover(e);
  }, { signal });
  stage.addEventListener("pointerup", (e) => {
    if (panFrom) return void (panFrom = null);
    if (!from) return;
    const r = normRect(from, pt(e), plateClient());
    from = null;
    if (r) commit(r);
    else showDraft(null);
  }, { signal });
  // A cancelled pointer, or capture lost mid-drag (window blur, a system gesture), ends the drag.
  const dropDrag = () => {
    panFrom = null;
    if (!from) return; // a keyboard draft is not a drag
    from = null;
    showDraft(null);
  };
  stage.addEventListener("pointercancel", dropDrag, { signal });
  stage.addEventListener("lostpointercapture", dropDrag, { signal });
  // The hover label goes when the pointer leaves the stage (M8).
  stage.addEventListener("pointerleave", () => boxes.querySelectorAll(".is-hot").forEach((b) => b.classList.remove("is-hot")), { signal });
  // The wheel and a trackpad pinch (a ctrl+wheel) zoom at the cursor.
  stage.addEventListener("wheel", (e) => {
    e.preventDefault();
    const r = rect();
    zoomBy(Math.exp(-e.deltaY * 0.0015), { x: e.clientX - r.left, y: e.clientY - r.top });
  }, { signal, passive: false });

  // ---------- keys ----------
  function trap(e: KeyboardEvent) {
    // Computed now: the picker adds and removes controls.
    const f = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
      (x) => x.getAttribute("tabindex") !== "-1" && !x.closest("[hidden]"),
    );
    if (!f.length) return;
    const a = document.activeElement, first = f[0], last = f[f.length - 1];
    const edge = !el.contains(a) || a === (e.shiftKey ? first : last);
    if (edge) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  }
  el.addEventListener("keydown", (e) => {
    if (e.isComposing) return;
    if (e.key === "Tab") return trap(e);
    const t = e.target as HTMLElement;
    if (t.closest(".picker")) return; // the picker owns its keys, Esc included (it closes itself)
    if (e.key === "Escape") {
      e.preventDefault();
      if (!from && !draft) return close();
      from = null; // a drag or a draft in progress is cancelled first
      return showDraft(null);
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+Z and friends reach the undo keys
    if (!isTextEntry(t)) {
      if (e.key === "v") return void el.classList.toggle("is-value");
      if (e.key === "o") return void (boxes.hidden = !boxes.hidden);
      const zoom = ZOOM_KEYS[e.key];
      if (zoom) return void zoomBy(zoom);
      // A docked picker's digits pick operations: they never zoom (Task 8 F2: tagging at 416% went to 100%).
      const picking = !!el.querySelector(".lb-side .picker");
      if (!picking && (e.key === "0" || (!e.shiftKey && e.code === "Digit0"))) { // AZERTY's unshifted "à" (M2)
        fitted = true;
        return layout();
      }
      if (!picking && digitOf(e) === 1) return void zoomBy(1 / cur().scale); // one image pixel per CSS pixel; AZERTY "&" too (M2)
    }
    // The stage's keys work from a Tab-focused region box too (review I1).
    if (t !== stage && !t.matches(".lb-box")) return;
    if (e.key === " ") {
      e.preventDefault();
      space = true;
      return void el.classList.add("is-pan");
    }
    if (e.key === "Enter") {
      e.preventDefault();
      return draft ? commit(draft) : showDraft(CENTRED);
    }
    const d = ARROWS[e.key];
    if (!d) return;
    e.preventDefault();
    const [dx, dy] = d;
    // R19: a draft takes the arrows; with none, zoomed in past fit they pan, and at fit they draft.
    if (!draft && cur().scale > fitScale() + 1e-9) {
      const s = rect();
      return setView(panBy(cur(), -dx * PAN_STEP * s.width, -dy * PAN_STEP * s.height, imgSize, vpOf(s)));
    }
    const r = draft ?? CENTRED;
    showDraft(
      e.shiftKey
        ? { ...r, w: clamp(r.w + dx * STEP, MIN_REGION, 1 - r.x), h: clamp(r.h + dy * STEP, MIN_REGION, 1 - r.y) }
        : { ...r, x: clamp(r.x + dx * STEP, 0, 1 - r.w), y: clamp(r.y + dy * STEP, 0, 1 - r.h) },
    );
  }, { signal });
  // Space is released wherever focus went (a notice over the lightbox), or by leaving the window:
  // a stuck Space would turn every drag into a pan (review I2).
  const releaseSpace = () => {
    space = false;
    el.classList.remove("is-pan");
  };
  document.addEventListener("keyup", (e) => void (e.key === " " && releaseSpace()), { capture: true, signal });
  window.addEventListener("blur", releaseSpace, { signal });
  // A Tab-focused region box off-screen pans the View to show it (review I1); the stage is
  // `overflow: clip`, so focus never scrolls it behind the View's back.
  el.addEventListener("focusin", (e) => {
    const id = (e.target as HTMLElement).closest?.<HTMLElement>(".lb-box")?.dataset.tag;
    const r = regionTags().find((t) => t.id === id)?.region;
    if (r) reveal(r);
  }, { signal });
  el.addEventListener("click", (e) => {
    if ((e.target as Element).closest(".lb-close")) close();
  }, { signal });

  // Focus never leaves the modal: not by a click behind it, and not when the picker removes itself
  // (after tagging or its own Esc), which would drop focus to <body> where the Reference view's keys act.
  // Dialogs raised over the lightbox own their focus and keys: Task 9's notices (the duplicate
  // prompt lives in one) and the save-failure dialog (Task 5). Anything else outside is behind the modal.
  const OVER = '[role="dialog"]:not(.lightbox), [role="alertdialog"], .notice';
  const stray = (n: unknown) => !el.contains(n as Node) && !(n as Element | null)?.closest?.(OVER);
  document.addEventListener("focusin", (e) => {
    if (stray(e.target)) stage.focus();
  }, { signal });
  // A key aimed outside the modal (focus fell to <body>) never reaches the page behind: it is
  // re-sent from the stage, so Esc, v and the undo keys still act, as the lightbox's own.
  document.addEventListener("keydown", (e) => {
    if (e.isComposing || !stray(e.target)) return;
    e.stopPropagation();
    e.preventDefault(); // Tab included: it can't walk into the page behind
    stage.focus();
    if (e.key !== "Tab") stage.dispatchEvent(new KeyboardEvent("keydown", e));
  }, { capture: true, signal });
  const isPicker = (n: Node) => n instanceof Element && (n.matches(".picker") || !!n.querySelector(".picker"));
  const keepFocus = new MutationObserver((records) => {
    if (closed) return;
    // A picker that left without saving (its Esc) leaves no region being tagged.
    if (records.some((r) => [...r.removedNodes].some(isPicker)) && !el.querySelector(".picker")) showPending(null);
    if (stray(document.activeElement)) stage.focus();
  });
  keepFocus.observe(el, { childList: true, subtree: true });
  const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(layout) : null;
  resize?.observe(stage);

  const unsubscribe = store.subscribe((c) => {
    if (c.reset || !store.refs.has(refId)) return close();
    // The pending marker stays: a docked picker still saves that region (the picker leaving clears it).
    if (c.references.some((r) => r.id === refId)) showDraft(null);
    if (c.taxonomy || c.links || c.references.some((r) => r.id === refId)) renderBoxes();
  });

  function close() {
    if (closed) return;
    closed = true;
    life.abort();
    unsubscribe();
    keepFocus.disconnect();
    resize?.disconnect();
    el.remove();
    if (opener?.isConnected) opener.focus();
    deps.onClose?.(); // the caller closes a picker docked inside (it went with el)
  }

  // The thumbnail shows at once. The source (the original, or Task 3's PNG preview) is preloaded
  // off-screen and swapped in only once it decodes. A preview, a refusal or a failed load keeps
  // what is shown and says so (Review Focus 3): the pane is never blank.
  img.setAttribute("src", api.assetUrl(ref.thumb1024));
  const sayPreview = () => void (!closed && (note.hidden = false));
  void Promise.resolve()
    .then(() => api.lightboxSource(refId))
    .then((s) => {
      if (closed) return;
      // A missing or malformed reply is a refusal too: never a throw, never a blank pane.
      if (!s || typeof s.path !== "string" || !s.path) return sayPreview();
      note.hidden = s.full === true;
      const url = api.assetUrl(s.path);
      const pre = new Image();
      pre.addEventListener("load", () => void (!closed && img.setAttribute("src", url)), { once: true });
      pre.addEventListener("error", sayPreview, { once: true }); // e.g. the original gone from disk
      pre.src = url;
    })
    .catch(sayPreview); // refused (an unknown or hidden reference, an undecodable file): the thumbnail stays
  document.body.append(el);
  renderBoxes();
  layout();
  stage.focus();
  return { close };
}
