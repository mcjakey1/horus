#!/usr/bin/env node
// Plan 6 Task 5: assembles app/THIRD_PARTY_NOTICES.md from three parts, in this order:
// notices/manual.md (hand-written: SigLIP, ONNX Runtime, the VC++ runtime, tokenizers), then
// `cargo about generate about.hbs`, then `license-checker-rseidelsohn --production --plainVertical`.
// The two tools run in CI only (Task 6) and pass their output here as files:
//   node scripts/notices.mjs [--cargo <file>] [--npm <file>]
// With neither, it writes the hand-written part alone: the checked-in stand-in, so a local
// build (whose bundle names this file) works without the tools.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STAND_IN = "\n## Rust crates and npm packages\n\nTheir licences are generated in CI for every release build.\n";

/** The notices file from its parts; without the tool output, the hand-written part, marked. */
export function assemble({ manual, cargo = "", npm = "" }) {
  if (!cargo && !npm) return manual + STAND_IN;
  return `${manual}\n${cargo.trim()}\n\n## npm packages\n\n${npm.trim()}\n`;
}

// ponytail: matched by file name, since D: here is a subst drive and the two paths differ.
if (process.argv[1]?.endsWith("notices.mjs")) {
  const arg = (flag) => {
    const i = process.argv.indexOf(flag);
    return i > 0 ? readFileSync(process.argv[i + 1], "utf8") : "";
  };
  const app = new URL("../", import.meta.url);
  const out = assemble({ manual: readFileSync(new URL("notices/manual.md", app), "utf8"), cargo: arg("--cargo"), npm: arg("--npm") });
  writeFileSync(new URL("THIRD_PARTY_NOTICES.md", app), out);
  console.log(`notices: wrote ${fileURLToPath(new URL("THIRD_PARTY_NOTICES.md", app))} (${out.length} characters)`);
}
