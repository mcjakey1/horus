import { describe, expect, it } from "vitest";
import { lodFor } from "./lod";

describe("lodFor", () => {
  it("lod_threshold", () => {
    expect(lodFor(48, 0.2)).toBe("dot"); // 9.6 px
    expect(lodFor(48, 0.25)).toBe("thumb"); // 12 px
  });
});
