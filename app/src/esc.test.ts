import { expect, it } from "vitest";
import { esc } from "./esc";

it("esc escapes & < > \" and '", () => {
  expect(esc('<img src=x onerror="a">&\'')).toBe("&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;");
  expect(esc()).toBe("");
  expect(esc(3)).toBe("3");
});
