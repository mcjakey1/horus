// @vitest-environment jsdom
// Plan 6 Task 1: `data-css` stands in for `style="…"` under `style-src 'self'`.
import { describe, expect, it } from "vitest";
import { applyCss } from "./css";

describe("applyCss", () => {
  it("copies data-css to the element's style, then removes the attribute", () => {
    const root = document.createElement("div");
    root.innerHTML = `<span data-css="left:12px;--c:#123456"></span><b data-css=""></b><i></i>`;
    applyCss(root);
    const span = root.querySelector<HTMLElement>("span")!;
    expect(span.style.left).toBe("12px");
    expect(span.style.getPropertyValue("--c")).toBe("#123456");
    expect(root.querySelector("[data-css]")).toBeNull();
  });

  it("covers the root itself", () => {
    const el = document.createElement("div");
    el.dataset.css = "top:3px";
    applyCss(el);
    expect(el.style.top).toBe("3px");
    expect(el.hasAttribute("data-css")).toBe(false);
  });
});
