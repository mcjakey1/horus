// About Horus (Plan 6 Task 4), from Help > About Horus (on macOS, the app menu). Its text is
// built here from data; the dialog shell is a modal like Settings.
import manifest from "../src-tauri/resources/demo/manifest.json";
import { esc } from "./esc";

export type AboutInfo = {
  version: string;
  fonts: { family: string; licence: string }[];
  /** Absolute path of the bundled THIRD_PARTY_NOTICES.md. */
  noticesPath: string;
  demoCredits: { title: string; credit: string; rights: string }[];
};

/** G7: names the one host the app ever contacts, and only after the artist opts in. */
export const PRIVACY =
  "Works offline. No account, no telemetry. Find similar downloads an image model from huggingface.co only if you turn it on.";

/** The families in src/fonts/fonts.css; about.test.ts checks this against that file. */
export const FONTS: AboutInfo["fonts"] = [
  { family: "Source Serif 4", licence: "SIL Open Font License 1.1" },
  { family: "Red Hat Mono", licence: "SIL Open Font License 1.1" },
];

type Record = { title: string; credit: string; rights: string };

/** The manifest's `rights` is evidence for the release gate (G3); About shows its meaning. */
const rightsLabel = (raw: string) => (/"is_public_domain":\s*true/.test(raw) ? "Public domain (CC0)" : raw);

/** One credit per demo-set record, in manifest order. */
export function demoCredits(records: Record[] = manifest as Record[]): AboutInfo["demoCredits"] {
  return records.map((r) => ({ title: r.title, credit: r.credit, rights: rightsLabel(r.rights) }));
}

export function aboutHTML(info: AboutInfo): string {
  const fonts = info.fonts.map((f) => `<li>${esc(f.family)} · ${esc(f.licence)}</li>`).join("");
  const credits = info.demoCredits
    .map((c) => `<li><span class="ab-credit">${esc(c.credit)}</span> <span class="ab-rights">${esc(c.rights)}</span></li>`)
    .join("");
  return `<div class="ab-sheet">
    <div class="st-head">
      <h1 class="st-title" id="ab-title">Horus</h1>
      <button type="button" class="icon-btn" data-close aria-label="Close About">
        <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5 5 15" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
      </button>
    </div>
    <p class="ab-version">Version ${esc(info.version)}</p>
    <p>${esc(PRIVACY)}</p>
    <h2 class="ab-h">Fonts</h2>
    <ul class="ab-list">${fonts}</ul>
    <p><button type="button" class="text-btn" data-notices>Third-party notices</button></p>
    <h2 class="ab-h">Demo set</h2>
    <ul class="ab-list ab-credits">${credits}</ul>
  </div>`;
}
