// The "Library" menu at the left of the top bar: open another library, or make a new one.
// Rust flushes the current library first and refuses the switch if that fails (Task 5), so on an
// error the current library simply stays open.
import type { Api, LibraryView } from "./api";
import { esc } from "./esc";
import type { Store } from "./store";

export function mountLibraryMenu(
  button: HTMLElement,
  api: Api,
  store: Store,
  notice: (html: string) => void,
): { destroy(): void } {
  const menu = document.createElement("div");
  menu.className = "lib-menu";
  menu.hidden = true;
  menu.innerHTML = `<div role="menu" aria-label="Library">
      <button type="button" role="menuitem" data-lib="open">Open library…</button>
      <button type="button" role="menuitem" data-lib="new">New library…</button>
    </div>
    <form class="lib-new" hidden>
      <p>New library in <span class="mono" data-lib-path></span></p>
      <label class="toggle"><input type="checkbox" name="demo"> <span>Start with the demo set</span></label>
      <div class="lib-new-actions"><button type="submit" class="text-btn">Create library</button><button type="button" class="text-btn" data-lib="cancel">Cancel</button></div>
    </form>`;
  button.after(menu);
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  const form = menu.querySelector<HTMLFormElement>(".lib-new")!;
  const items = menu.querySelector<HTMLElement>('[role="menu"]')!;
  let newPath: string | null = null;
  let busy = false;

  const show = (on: boolean) => {
    menu.hidden = !on;
    button.setAttribute("aria-expanded", String(on));
    if (!on) {
      form.hidden = true;
      items.hidden = false;
      newPath = null;
    }
  };

  async function switchTo(open: () => Promise<LibraryView>) {
    if (busy) return;
    busy = true;
    try {
      const view = await open();
      store.reset(view, await api.getTaxonomy()); // the views show view.warning, if any
      show(false);
    } catch (err) {
      notice(`<p>${esc(String(err))}</p>`);
    } finally {
      busy = false;
    }
  }

  const onButton = () => {
    show(menu.hidden !== false); // closed (hidden may also read "until-found")
    if (!menu.hidden) items.querySelector<HTMLElement>("button")?.focus();
  };
  const onClick = async (e: Event) => {
    const k = (e.target as Element).closest<HTMLElement>("[data-lib]")?.dataset.lib;
    if (k === "cancel") return show(false);
    if (k === "open") {
      show(false);
      const path = await api.pickFolder("Open a Horus library");
      if (path) await switchTo(() => api.openLibrary(path));
    } else if (k === "new") {
      const path = await api.pickFolder("Choose a folder for the new library");
      if (!path) return show(false);
      newPath = path;
      menu.querySelector("[data-lib-path]")!.textContent = path;
      form.querySelector<HTMLInputElement>('input[name="demo"]')!.checked = false; // unticked by default
      items.hidden = true;
      form.hidden = false;
      show(true);
      form.querySelector<HTMLInputElement>('input[name="demo"]')!.focus();
    }
  };
  const onSubmit = (e: Event) => {
    e.preventDefault();
    const path = newPath;
    const demo = form.querySelector<HTMLInputElement>('input[name="demo"]')!.checked;
    if (path) void switchTo(() => api.createLibrary(path, demo));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape") return;
    e.preventDefault();
    show(false);
    button.focus();
  };
  const onOutside = (e: Event) => {
    if (!menu.hidden && !menu.contains(e.target as Node) && !button.contains(e.target as Node)) show(false);
  };

  button.addEventListener("click", onButton);
  menu.addEventListener("click", onClick);
  form.addEventListener("submit", onSubmit);
  menu.addEventListener("keydown", onKey);
  document.addEventListener("pointerdown", onOutside);
  return {
    destroy() {
      button.removeEventListener("click", onButton);
      document.removeEventListener("pointerdown", onOutside);
      menu.remove();
    },
  };
}
