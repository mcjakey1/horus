// The minimal lightbox (SPEC §6.6; Plan 4 replaces its chrome): the full image letterboxed into the
// viewport, its region tags outlined, `v` for the value view, and a box drawn by drag (or by
// keyboard: Enter, arrows, Shift+arrows resize, Enter) to tag that region through the picker.
// It is modal: a dialog, focus kept inside, Esc closes, and focus goes back to the opener.
import type { Api, Region } from "../api";
import { esc } from "../esc";
import { isTextEntry } from "../keys";
import { opInk } from "../ops";
import { type Box, fitBox } from "../reference/tile";
import type { Store } from "../store";
import type { PickerOpts } from "../tagging/picker";
import { MIN_REGION, normRect, type Pt } from "./regions";

const STEP = 0.02; // a keyboard move or resize, in 0..1 of the image
const CENTRED: Region = { x: 0.375, y: 0.375, w: 0.25, h: 0.25 };
const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea, [href], [tabindex]";
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const pct = (v: number) => `${+(v * 100).toFixed(4)}%`;

export function openLightbox(
  api: Api,
  store: Store,
  refId: string,
  deps: { openPicker(opts: PickerOpts): void },
): { close(): void } {
  const ref = store.refs.get(refId);
  if (!ref) return { close() {} };
  const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const life = new AbortController();
  const signal = life.signal;
  const aspect = ref.width && ref.height ? ref.width / ref.height : 3 / 4;

  const el = document.createElement("div");
  el.className = "lightbox";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", `Lightbox: ${ref.title}`);
  el.classList.toggle("is-value", document.body.classList.contains("value")); // starts as the artist was looking
  el.innerHTML = `
    <div class="lb-stage" tabindex="0" aria-label="${esc(ref.title)}. Drag a box, or press Enter and the arrow keys, to tag a region." aria-describedby="lb-hint">
      <div class="lb-plate"><img alt="${esc(ref.title)}" draggable="false"><div class="lb-boxes"></div><div class="lb-draft" hidden></div></div>
    </div>
    <aside class="lb-side" aria-label="Tag the region"></aside>
    <div class="lb-bar"><p class="lb-hint" id="lb-hint">Drag a box to tag a region · Enter, arrows (Shift resizes), Enter · v value view · Esc closes</p><button type="button" class="text-btn lb-close">Close</button></div>`;
  const q = <T extends HTMLElement = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  const stage = q(".lb-stage"), plateEl = q(".lb-plate"), img = q<HTMLImageElement>("img");
  const boxes = q(".lb-boxes"), draftEl = q(".lb-draft");
  let closed = false;
  let from: Pt | null = null; // a drag in progress
  let draft: Region | null = null; // the box being drawn, in 0..1

  // ---------- geometry: one source for painting the plate and for pointer maths ----------
  /** The plate inside the stage (stage px) and on screen (client px), read now. */
  const fit = () => {
    const r = stage.getBoundingClientRect();
    const f = fitBox(aspect, r.width, r.height);
    return { f, client: { ...f, left: r.left + f.left, top: r.top + f.top } as Box };
  };
  function layout() {
    const { f } = fit();
    for (const k of ["left", "top", "width", "height"] as const) plateEl.style.setProperty(k, `${f[k]}px`);
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
  function renderBoxes() {
    const now = store.refs.get(refId);
    boxes.replaceChildren(
      ...(now?.tags ?? [])
        .filter((t) => t.region)
        .map((t) => {
          const b = document.createElement("div");
          b.className = "lb-box";
          place(b, t.region!);
          b.style.setProperty("--c", opInk(store.tax, t.operationId).base);
          return b;
        }),
    );
  }
  const commit = (region: Region) => deps.openPicker({ refId, region });

  // ---------- pointer: drag a box ----------
  const pt = (e: MouseEvent): Pt => ({ x: e.clientX, y: e.clientY });
  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection, no native image drag
    from = pt(e);
    showDraft(null);
    stage.setPointerCapture?.(e.pointerId);
    stage.focus();
  }, { signal });
  stage.addEventListener("pointermove", (e) => {
    if (from) showDraft(normRect(from, pt(e), fit().client));
  }, { signal });
  stage.addEventListener("pointerup", (e) => {
    if (!from) return;
    const r = normRect(from, pt(e), fit().client);
    from = null;
    showDraft(r); // it stays drawn while the picker tags it
    if (r) commit(r);
  }, { signal });
  stage.addEventListener("pointercancel", () => {
    from = null;
    showDraft(null);
  }, { signal });

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
      return draft && !from ? showDraft(null) : close();
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl+Z and friends reach the undo keys
    if (e.key === "v" && !isTextEntry(t)) return void el.classList.toggle("is-value");
    if (t !== stage) return;
    if (e.key === "Enter") {
      e.preventDefault();
      return draft ? commit(draft) : showDraft(CENTRED);
    }
    const d = ARROWS[e.key];
    if (!d) return;
    e.preventDefault();
    const r = draft ?? CENTRED;
    const [dx, dy] = d;
    showDraft(
      e.shiftKey
        ? { ...r, w: clamp(r.w + dx * STEP, MIN_REGION, 1 - r.x), h: clamp(r.h + dy * STEP, MIN_REGION, 1 - r.y) }
        : { ...r, x: clamp(r.x + dx * STEP, 0, 1 - r.w), y: clamp(r.y + dy * STEP, 0, 1 - r.h) },
    );
  }, { signal });
  el.addEventListener("click", (e) => {
    if ((e.target as Element).closest(".lb-close")) close();
  }, { signal });

  // Focus never leaves the modal: not by a click behind it, and not when the picker removes itself
  // (after tagging or its own Esc), which would drop focus to <body> where the Reference view's keys act.
  document.addEventListener("focusin", (e) => {
    if (!el.contains(e.target as Node)) stage.focus();
  }, { signal });
  const keepFocus = new MutationObserver(() => {
    if (!closed && !el.contains(document.activeElement)) stage.focus();
  });
  keepFocus.observe(el, { childList: true, subtree: true });
  const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(layout) : null;
  resize?.observe(stage);

  const unsubscribe = store.subscribe((c) => {
    if (c.reset || !store.refs.has(refId)) return close();
    if (c.references.some((r) => r.id === refId)) showDraft(null); // a new tag now outlines that box
    if (c.taxonomy || c.references.some((r) => r.id === refId)) renderBoxes();
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
  }

  // The thumbnail shows at once; the original replaces it when its path arrives.
  img.setAttribute("src", api.assetUrl(ref.thumb1024));
  void Promise.resolve()
    .then(() => api.imagePath(refId))
    .then((p) => void (!closed && img.setAttribute("src", api.assetUrl(p))), () => {}); // ponytail: keep the thumb
  document.body.append(el);
  renderBoxes();
  layout();
  stage.focus();
  return { close };
}
