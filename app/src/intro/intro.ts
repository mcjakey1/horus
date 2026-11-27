// The intro card (Plan 6 Task 4): plays once on first launch, from boot() (R12), and again
// from Help > Play intro. Any key, pointer press or wheel skips it within the same event.
// The look lives in styles.css (`.intro`, its tokens and its keyframes); this module is only
// the mechanics, so the design pass can change the frame without touching them.
import type { Settings } from "../api";

export const INTRO_MAX_MS = 6000;

/** Unreadable settings (`null`) never block the start on an intro. */
export const shouldPlayIntro = (s: Settings | null): boolean => !!s && !s.introSeen;

const SKIP = ["keydown", "pointerdown", "wheel"] as const;

export function playIntro(root: HTMLElement, opts: { reducedMotion: boolean }): Promise<"done" | "skipped"> {
  const el = document.createElement("div");
  el.className = opts.reducedMotion ? "intro is-still" : "intro";
  el.setAttribute("role", "img");
  el.setAttribute("aria-label", "Horus. Your references, and why they connect.");
  // "The first specimen" (DESIGN.md "Intro card"; Task 4 design pass, pending the user's
  // approval). Every ink, place and delay is keyed off data-op in styles.css (no style=: CSP).
  el.innerHTML = `<div class="intro-frame">
    <p class="intro-mark">Horus</p>
    <p class="intro-line">Your references, and why they connect.</p>
    <div class="intro-card" aria-hidden="true">
      <span class="intro-box" data-op="diff"><span class="intro-num">1</span></span>
      <span class="intro-box" data-op="group"><span class="intro-num">2</span></span>
      <span class="intro-box" data-op="seq"><span class="intro-num">3</span></span>
      <span class="intro-box" data-op="infer"><span class="intro-num">4</span></span>
    </div>
    <ul class="intro-ops">
      <li data-op="diff">Stand out</li><li data-op="group">Hold together</li><li data-op="seq">Lead the eye</li><li data-op="infer">Make them think</li>
    </ul>
    <p class="intro-note">A starting set. Rename them or add your own.</p>
  </div>`;
  root.append(el);
  return new Promise((resolve) => {
    const life = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const end = (r: "done" | "skipped") => {
      life.abort();
      clearTimeout(timer);
      el.remove();
      resolve(r);
    };
    // Capture on the document, so the skip input never reaches first run or the views.
    for (const type of SKIP) {
      document.addEventListener(type, (e) => (e.stopPropagation(), end("skipped")), { capture: true, signal: life.signal });
    }
    // Under reduced motion the still frame stays until an input.
    if (!opts.reducedMotion) timer = setTimeout(() => end("done"), INTRO_MAX_MS);
  });
}
