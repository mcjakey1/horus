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
  el.setAttribute("aria-label", "Horus");
  // Placeholder frame until the design pass (SPEC §8): the wordmark, centred.
  el.innerHTML = `<p class="intro-mark">Horus</p>`;
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
