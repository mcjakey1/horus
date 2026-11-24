// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import html from "../index.html?raw";
import { mountViews } from "./views";

describe("view toggle", () => {
  it("select(inbox) sets body[data-view] and moves aria-current", () => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
    const inbox = vi.fn();
    const views = mountViews(document.body, { inbox });
    const tab = (id: string) => document.querySelector<HTMLElement>(`[data-view-tab="${id}"]`)!;
    expect(views.current()).toBe("reference");
    expect(document.body.dataset.view).toBe("reference");
    views.select("inbox");
    expect(document.body.dataset.view).toBe("inbox");
    expect(tab("inbox").getAttribute("aria-current")).toBe("page");
    expect(tab("reference").hasAttribute("aria-current")).toBe(false);
    expect(inbox).toHaveBeenCalledTimes(1);
    expect(views.current()).toBe("inbox");
    tab("reference").click();
    expect(document.body.dataset.view).toBe("reference");
    expect(tab("reference").getAttribute("aria-current")).toBe("page");
    expect((tab("inbox") as HTMLButtonElement).disabled).toBe(false);
  });
});
