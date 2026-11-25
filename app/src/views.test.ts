// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import html from "../index.html?raw";
import { mountViews, type ViewHandle } from "./views";

const tab = (id: string) => document.querySelector<HTMLButtonElement>(`[data-view-tab="${id}"]`)!;
const handle = (): ViewHandle => ({ show: vi.fn(), hide: vi.fn(), destroy: vi.fn() });

describe("view shell", () => {
  // Every shell listens on document.body, so each test's shell must go before the next mounts.
  let views: ReturnType<typeof mountViews>;
  afterEach(() => views.destroy());
  beforeEach(() => {
    document.body.innerHTML = new DOMParser().parseFromString(html, "text/html").body.innerHTML;
  });

  it("tabs_reflect_selection: select and clicks set body[data-view] and move aria-current", () => {
    views = mountViews(document.body, { showReference: vi.fn() });
    const inbox = handle();
    views.register("reference", handle);
    views.register("inbox", () => inbox);
    expect(views.current()).toBe("reference");
    expect(document.body.dataset.view).toBe("reference");
    views.select("inbox");
    expect(document.body.dataset.view).toBe("inbox");
    expect(tab("inbox").getAttribute("aria-current")).toBe("page");
    expect(tab("inbox").classList.contains("is-on")).toBe(true);
    expect(tab("reference").hasAttribute("aria-current")).toBe(false);
    expect(inbox.show).toHaveBeenCalledTimes(1);
    expect(views.current()).toBe("inbox");
    tab("reference").click();
    expect(document.body.dataset.view).toBe("reference");
    expect(tab("reference").getAttribute("aria-current")).toBe("page");
    expect(tab("inbox").disabled).toBe(false);
  });

  it("select_mounts_lazily_and_hides_others", () => {
    views = mountViews(document.body, { showReference: vi.fn() });
    const tree = handle();
    const galaxy = handle();
    const makeTree = vi.fn(() => tree);
    const makeGalaxy = vi.fn(() => galaxy);
    views.register("tree", makeTree);
    views.register("galaxy", makeGalaxy);
    expect(makeTree).not.toHaveBeenCalled();
    views.select("tree");
    expect(makeTree).toHaveBeenCalledTimes(1);
    expect(makeGalaxy).not.toHaveBeenCalled();
    views.select("tree");
    expect(makeTree).toHaveBeenCalledTimes(1);
    views.select("galaxy");
    expect(makeGalaxy).toHaveBeenCalledTimes(1);
    expect(tree.hide).toHaveBeenCalledTimes(1);
    expect(galaxy.hide).not.toHaveBeenCalled();
    views.select("tree");
    expect(makeTree).toHaveBeenCalledTimes(1); // shown again, not rebuilt: the camera survives
    expect(galaxy.hide).toHaveBeenCalledTimes(1);
  });

  it("show_runs_on_every_select", () => {
    views = mountViews(document.body, { showReference: vi.fn() });
    const inbox = handle();
    views.register("inbox", () => inbox);
    views.select("inbox");
    views.select("inbox");
    expect(inbox.show).toHaveBeenCalledTimes(2);
  });

  it("register_enables_tab", () => {
    views = mountViews(document.body, { showReference: vi.fn() });
    expect(tab("tree").disabled).toBe(true);
    expect(tab("tree").title).toBe("Not built yet");
    views.register("tree", handle);
    expect(tab("tree").disabled).toBe(false);
    expect(tab("tree").hasAttribute("title")).toBe(false);
  });

  it("disabled_tab_ignored: clicking Boards changes nothing", () => {
    views = mountViews(document.body, { showReference: vi.fn() });
    views.register("reference", handle);
    expect(tab("boards").disabled).toBe(true);
    tab("boards").click();
    // jsdom drops clicks on disabled buttons, so also dispatch on a child to reach the delegate
    tab("boards").dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(views.current()).toBe("reference");
    expect(document.body.dataset.view).toBe("reference");
    expect(tab("boards").hasAttribute("aria-current")).toBe(false);
  });

  it("open_reference_switches_view", () => {
    const showReference = vi.fn();
    views = mountViews(document.body, { showReference });
    const ref = handle();
    views.register("reference", () => ref);
    views.register("inbox", handle);
    views.select("inbox");
    views.openReference("b");
    expect(views.current()).toBe("reference");
    expect(document.body.dataset.view).toBe("reference");
    expect(showReference).toHaveBeenCalledWith("b");
    expect(ref.show).toHaveBeenCalled();
  });

  it("destroy tears down mounted views and stops listening", () => {
    views = mountViews(document.body, { showReference: vi.fn() });
    const inbox = handle();
    views.register("reference", handle);
    views.register("inbox", () => inbox);
    views.select("inbox");
    views.destroy();
    expect(inbox.destroy).toHaveBeenCalledTimes(1);
    tab("reference").click();
    expect(document.body.dataset.view).toBe("inbox");
  });
});
