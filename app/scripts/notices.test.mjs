// Plan 6 Task 5: THIRD_PARTY_NOTICES.md is assembled from three parts, in order.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkNotices } from "./release-check.mjs";
import { assemble } from "./notices.mjs";

describe("assemble", () => {
  it("puts the hand-written part first, then the Rust crates, then the npm packages", () => {
    const out = assemble({ manual: "# Notices\n\nSigLIP…\n", cargo: "## Rust crates\n\nserde: MIT\n", npm: "pixi.js\n  licenses: MIT\n" });
    expect(out.indexOf("SigLIP")).toBeLessThan(out.indexOf("## Rust crates"));
    expect(out.indexOf("## Rust crates")).toBeLessThan(out.indexOf("## npm packages"));
    expect(out).toContain("pixi.js");
  });
  it("without the tool output it is the hand-written part, marked as such", () => {
    const out = assemble({ manual: "# Notices\n" });
    expect(out.startsWith("# Notices\n")).toBe(true);
    expect(out).toContain("generated in CI");
  });
  it("the checked-in stand-in is the hand-written part, and passes checkNotices", () => {
    // A Windows checkout may turn both into CRLF: compare the text, not the line ends.
    const lf = (s) => s.replace(/\r\n/g, "\n");
    const manual = lf(readFileSync(new URL("../notices/manual.md", import.meta.url), "utf8"));
    const standIn = lf(readFileSync(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"));
    expect(standIn).toBe(assemble({ manual }));
    expect(checkNotices(standIn)).toEqual([]);
  });
});
