// The Find similar section of Settings (Plan 5 Task 6): the switch, progress by phase, disk
// used, Remove model and the credit. Every message is artist copy: Rust's copy table fills
// `SimilarStatus.error`, and a rejected call shows CATCH_ALL, never its raw text (R11).
import type { Api, SimilarStatus } from "../api";
import { esc } from "../esc";

/** SPEC §5a, verbatim: the first-run question. */
export const FIND_SIMILAR_COPY =
  "Turn on Find similar? It downloads a 150–350 MB image model and indexes your library in the background. Recommended for machines with 8 GB of RAM or more.";
/** The same sentence without the question, under the switch. */
const DESCRIPTION = FIND_SIMILAR_COPY.replace(/^Turn on Find similar\? /, "");
/** R11's catch-all, for a call that rejects. Matches Rust's copy table. */
export const CATCH_ALL = "Find similar ran into a problem. Try again.";
const CREDIT = "SigLIP base (Google, Apache-2.0) · ONNX export by Xenova";

/** Decimal: "213 MB" rounded, "1.2 GB" from 1,000 MB up. */
export const fmtBytes = (n: number): string =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)} GB` : `${Math.round(n / 1e6)} MB`;

const num = (s: string) => `<span class="mono">${esc(s)}</span>`;
const on = (s: SimilarStatus) => s.phase !== "off" && s.phase !== "error";

/** The progress line (HTML) and its one action, per phase. */
function progress(s: SimilarStatus): { line: string; act?: [string, string]; bar?: boolean } | null {
  switch (s.phase) {
    case "downloading":
      return { line: `Downloading the model · ${num(fmtBytes(s.downloadDone))} of ${num(fmtBytes(s.downloadTotal))}`, bar: true };
    case "verifying":
      return { line: "Checking the download…" };
    case "loading":
      return { line: "Loading the model…" };
    case "indexing":
      return { line: `Indexing your library · ${num(String(s.indexed))} of ${num(String(s.total))}`, act: ["pause", "Pause"] };
    case "paused":
      return { line: `Indexing paused · ${num(String(s.indexed))} of ${num(String(s.total))}`, act: ["resume", "Resume"] };
    case "ready":
      return { line: `Ready · ${num(String(s.indexed))} ${s.indexed === 1 ? "reference" : "references"} indexed` };
    case "error":
      return { line: esc(s.error ?? CATCH_ALL), act: ["retry", "Try again"] };
    default:
      return null;
  }
}

/** Renders the section into `el`; call it on every status event. The body is rebuilt only when
 *  its shape changes (phase, confirmation, disk used): a tick patches the line and bar in place,
 *  so a click mid-download still lands. One persistent status line speaks phase changes only. */
export function renderFindSimilar(el: HTMLElement, s: SimilarStatus, api: Api): void {
  // The status line and the switch persist (the knob animates); only the body below is rebuilt.
  if (!el.querySelector("[data-announce]")) {
    el.innerHTML = `<p class="sr-only" role="status" data-announce></p>
    <div class="fs-head">
      <h2 class="st-h2" id="fs-label">Find similar</h2>
      <button type="button" class="fs-switch" role="switch" aria-checked="false" aria-labelledby="fs-label" aria-describedby="fs-desc" data-act="switch"><span class="fs-knob"></span></button>
    </div>
    <p class="fs-desc" id="fs-desc">${esc(DESCRIPTION)}</p>
    <div class="st-body" data-body></div>`;
  }
  const body = el.querySelector<HTMLElement>("[data-body]")!;
  const confirming = el.dataset.confirm === "1";
  const p = progress(s);
  const shape = `${s.phase}|${confirming}|${s.diskBytes > 0}`;
  if (el.dataset.shape !== shape) {
    const focused = el.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset.act : undefined;
    body.innerHTML = `${
      p
        ? `<div class="fs-progress">
      <p class="fs-line" data-line>${p.line}</p>
      ${p.bar ? `<progress class="fs-bar" value="${s.downloadDone}" max="${s.downloadTotal}" aria-labelledby="fs-label"></progress>` : ""}
      ${p.act ? `<button type="button" class="fr-btn" data-act="${p.act[0]}">${p.act[1]}</button>` : ""}
    </div>`
        : ""
    }
    ${
      s.diskBytes > 0
        ? `<p class="fs-disk">Disk space used: <span class="mono" data-disk>${esc(fmtBytes(s.diskBytes))}</span></p>
    ${
      confirming
        ? `<div class="fs-confirm" role="group" aria-labelledby="fs-confirm-q">
      <p id="fs-confirm-q">Remove the Find similar model and this library's index? You can download it again later.</p>
      <div class="fr-row"><button type="button" class="fr-btn" data-act="remove-confirm">Remove</button><button type="button" class="text-btn" data-act="remove-cancel">Cancel</button></div>
    </div>`
        : `<button type="button" class="text-btn" data-act="remove">Remove model</button>`
    }`
        : ""
    }
    <p class="fs-credit">${esc(CREDIT)} · <button type="button" class="text-btn" data-act="about-model">About the model</button></p>`;
    el.dataset.shape = shape;
    if (focused) {
      // Same control if it's still there; Pause and Resume swap; anything else falls back to the switch.
      const q = (a: string) => el.querySelector<HTMLElement>(`[data-act="${a}"]`);
      (q(focused) ?? (focused === "pause" || focused === "resume" ? q("pause") ?? q("resume") : null) ?? q("switch"))?.focus();
    }
    if (el.dataset.phase !== s.phase) {
      el.dataset.phase = s.phase;
      el.querySelector("[data-announce]")!.textContent = body.querySelector("[data-line]")?.textContent ?? "Find similar is off.";
    }
  } else {
    const line = body.querySelector("[data-line]");
    if (line && p) line.innerHTML = p.line;
    const bar = body.querySelector<HTMLProgressElement>("progress");
    if (bar) [bar.max, bar.value] = [s.downloadTotal, s.downloadDone];
    const disk = body.querySelector("[data-disk]");
    if (disk) disk.textContent = fmtBytes(s.diskBytes);
  }
  // One call at a time, so a double-click enables once. aria-disabled, not disabled, so the
  // switch keeps keyboard focus while the call is out.
  const sw = el.querySelector<HTMLButtonElement>('[role="switch"]')!;
  sw.setAttribute("aria-checked", String(on(s)));
  const busy = () => el.dataset.busy === "1";
  sw.setAttribute("aria-disabled", String(busy()));

  const run = (call: () => Promise<SimilarStatus>) => {
    el.dataset.busy = "1";
    sw.setAttribute("aria-disabled", "true");
    const done = (next: SimilarStatus) => {
      el.dataset.busy = "";
      renderFindSimilar(el, next, api);
    };
    return call().then(done, () => done({ ...s, phase: "error", error: CATCH_ALL }));
  };
  const confirm = (open: boolean) => {
    el.dataset.confirm = open ? "1" : "";
    renderFindSimilar(el, s, api);
    body.querySelector<HTMLElement>(`[data-act="${open ? "remove-cancel" : "remove"}"]`)?.focus();
  };
  el.onclick = (e) => {
    const act = (e.target as Element).closest<HTMLElement>("[data-act]")?.dataset.act;
    // P5-R13: the model's licence is in the bundled notices, the one file the app may open.
    if (act === "about-model") return void api.noticesPath().then((p) => api.openPath(p)).catch(() => {});
    if (busy() && act !== "remove" && act !== "remove-cancel") return;
    if (act === "switch") void run(on(s) ? api.similarDisable : api.similarEnable);
    else if (act === "retry") void run(api.similarEnable);
    else if (act === "pause" || act === "resume") void run(() => api.similarPause(act === "pause"));
    else if (act === "remove" || act === "remove-cancel") confirm(act === "remove");
    else if (act === "remove-confirm") {
      el.dataset.confirm = "";
      void run(api.similarRemoveModel);
    }
  };
  // Esc in the confirmation cancels it, rather than closing the panel.
  el.onkeydown = (e) => {
    if (e.key !== "Escape" || el.dataset.confirm !== "1") return;
    e.preventDefault();
    e.stopPropagation();
    confirm(false);
  };
}
