// Start-up: reopen the last library, or run first-run setup (pick a library, the demo set,
// the Find similar question), then build the Store on the library that came back (B7) and
// mount the Reference view on it.
import type { Api, LibraryView } from "./api";
import { esc } from "./esc";
import { noticeIn } from "./importer";
import { dockPicker, mountInbox } from "./inbox/view";
import { type DropWin, wireIntake } from "./intake";
import { wireUndoKeys } from "./keys";
import { mountLibraryMenu } from "./library-menu";
import { mountReference } from "./reference/view";
import { mountSaveDialog, wireSaveStatus } from "./save-dialog";
import { createStore } from "./store";
import { mountViews } from "./views";

/** SPEC §5a, verbatim. */
export const FIND_SIMILAR_COPY =
  "Turn on Find similar? It downloads a 150–350 MB image model and indexes your library in the background. Recommended for machines with 8 GB of RAM or more.";

/** `win` is the webview, for drag-and-drop; tests (jsdom has no Tauri window) leave it out. */
export async function boot(root: HTMLElement, api: Api, win?: DropWin) {
  // A reload mid-queue leaves Rust's intake flag set, so every close would wait: clear it first,
  // before first run can wait on the artist. It also takes a close owed before the reload.
  void api.intakeBusy(false).catch(() => {});
  const settings = await api.getSettings().catch(() => null);
  const dark = settings?.theme === "dark" ||
    (settings?.theme !== "light" && typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  let lib: LibraryView | undefined;
  let error: string | undefined;
  if (settings?.lastLibrary) {
    try {
      lib = await api.openLibrary(settings.lastLibrary);
    } catch (err) {
      error = `Horus could not open your last library at ${settings.lastLibrary}. ${String(err)} If you moved it, open it from its new place.`;
    }
  }
  lib ??= await firstRun(root, api, { error, askFindSimilar: (settings?.findSimilar ?? "unset") === "unset" });
  const store = createStore(lib, await api.getTaxonomy());
  const notice = noticeIn(root);
  const unwire = wireUndoKeys(document, api, store, notice);
  const view = mountReference(root, api, store);

  // Task 9: the Inbox, intake, the view toggle and the Library menu.
  const inboxRoot = root.querySelector<HTMLElement>("#inbox")!;
  let dock: ReturnType<typeof dockPicker> | null = null;
  const inbox = mountInbox(inboxRoot, api, store, { openPicker: (o) => dock?.(o), closePicker: () => dock?.hide() });
  dock = dockPicker(inboxRoot.querySelector<HTMLElement>(".inbox-dock")!, api, store);
  // Switching to the Inbox lands on its first item, or on the one intake is opening.
  let landOn: string | null = null;
  const views = mountViews(root, { inbox: () => (landOn ? inbox.focusId(landOn) : inbox.focus(0)) });
  const unIntake = wireIntake(win ?? null, document, {
    api,
    store,
    notice,
    show: (id) => {
      views.select("reference");
      view.show(id);
    },
    // ponytail: several new references each keep their preset; the Inbox lands on the last one
    openPicker: (o) => {
      if (o.preset?.length) dock?.remember(o.refId, o.preset);
      landOn = o.refId;
      if (views.current() === "inbox") inbox.focusId(o.refId);
      else views.select("inbox");
      landOn = null;
    },
  });
  const menu = mountLibraryMenu(root.querySelector<HTMLElement>("#library-menu")!, api, store, notice, unIntake.idle);
  const unmountSaveDialog = mountSaveDialog(root, api);
  const unwireSaveStatus = wireSaveStatus(root, api);
  return {
    ...view,
    store,
    destroy: () =>
      (unwire(), unIntake(), menu.destroy(), unmountSaveDialog(), unwireSaveStatus(), dock?.close(), inbox.destroy(), view.destroy()),
  };
}

/** Resolves once a library is created or opened. */
export function firstRun(
  root: HTMLElement,
  api: Api,
  { error, askFindSimilar = true }: { error?: string; askFindSimilar?: boolean } = {},
): Promise<LibraryView> {
  const shell = [...root.children] as HTMLElement[];
  shell.forEach((el) => (el.inert = true));
  const el = document.createElement("div");
  el.className = "firstrun";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "fr-title");
  el.innerHTML = `<div class="fr-sheet">
    <p class="fr-brand">Horus</p>
    <h1 class="fr-title" id="fr-title">Set up your library</h1>
    <p class="fr-lede">A library is a plain folder on your computer. Horus keeps your images and tags in it.</p>
    ${error ? `<p class="fr-error" role="alert">${esc(error)}</p>` : ""}
    <ol class="fr-steps">
      <li class="fr-step">
        <h2><span class="fr-n">1</span>Library</h2>
        <div class="fr-row">
          <button class="fr-btn" data-pick="create">Create a new library…</button>
          <button class="fr-btn" data-pick="open">Open an existing library…</button>
        </div>
        <p class="fr-path mono" id="fr-path" hidden></p>
      </li>
      <li class="fr-step" id="fr-demo-step">
        <h2><span class="fr-n">2</span>Demo set</h2>
        <label class="fr-check"><input type="checkbox" id="fr-demo" checked> Start with the demo set (about 50 public-domain works)</label>
      </li>
      ${
        askFindSimilar
          ? `<li class="fr-step">
        <h2><span class="fr-n">3</span>Find similar</h2>
        <p class="fr-copy">${esc(FIND_SIMILAR_COPY)}</p>
        <p class="fr-ram mono" id="fr-ram">This computer: checking RAM…</p>
        <div class="fr-row" role="group" aria-label="Find similar">
          <button class="fr-btn" data-fs="on" aria-pressed="false">Turn on now</button>
          <button class="fr-btn" data-fs="off" aria-pressed="false">Not now</button>
        </div>
      </li>`
          : ""
      }
    </ol>
    <div class="fr-foot">
      <p class="fr-status" id="fr-status" role="status"></p>
      <button class="fr-go" id="fr-go" disabled>Begin</button>
    </div>
  </div>`;
  root.append(el);
  const $ = <T extends HTMLElement = HTMLElement>(s: string) => el.querySelector<T>(s)!;
  $('[data-pick="create"]').focus(); // the rest of the window is inert, so focus moves in
  const demo = $<HTMLInputElement>("#fr-demo");
  const go = $<HTMLButtonElement>("#fr-go");
  const status = $("#fr-status");
  const S = { mode: null as "create" | "open" | null, path: null as string | null, answered: !askFindSimilar, busy: false };
  const sync = () => {
    go.disabled = S.busy || !S.path || !S.answered;
    demo.disabled = S.busy || S.mode === "open";
    $("#fr-demo-step").classList.toggle("is-off", S.mode === "open");
    el.querySelectorAll<HTMLButtonElement>(".fr-btn").forEach((b) => (b.disabled = S.busy));
  };

  if (askFindSimilar)
    api.systemRamGb().then(
      (gb) => ($("#fr-ram").textContent = gb ? `This computer: ${gb} GB of RAM` : "This computer: RAM could not be read"),
      () => ($("#fr-ram").textContent = "This computer: RAM could not be read"),
    );

  return new Promise((resolve) => {
    el.addEventListener("click", async (e) => {
      const t = e.target as Element;
      const pick = t.closest<HTMLElement>("[data-pick]")?.dataset.pick as "create" | "open" | undefined;
      const fs = t.closest<HTMLElement>("[data-fs]")?.dataset.fs as "on" | "off" | undefined;
      if (pick) {
        const path = await api.pickFolder(pick === "create" ? "Choose a folder for the new library" : "Choose a Horus library folder");
        if (!path) return;
        Object.assign(S, { mode: pick, path });
        const p = $("#fr-path");
        p.textContent = `${pick === "create" ? "New library in" : "Open"} ${path}`;
        p.hidden = false;
        status.textContent = "";
      } else if (fs) {
        el.querySelectorAll("[data-fs]").forEach((b) => b.setAttribute("aria-pressed", String(b === t.closest("[data-fs]"))));
        S.answered = true;
        // Plan 1 only records the answer; the model download comes in Plan 5.
        api.setSettings({ findSimilar: fs }).catch((err) => (status.textContent = `Could not save that choice: ${String(err)}`));
      } else if (t.closest("#fr-go") && S.path) {
        S.busy = true;
        sync();
        const seeding = S.mode === "create" && demo.checked;
        status.textContent = seeding ? "Creating the library and importing the demo set. This can take a minute." : "Opening the library…";
        try {
          const lib = S.mode === "create" ? await api.createLibrary(S.path, demo.checked) : await api.openLibrary(S.path);
          el.remove();
          shell.forEach((x) => (x.inert = false));
          resolve(lib);
          return;
        } catch (err) {
          status.textContent = String(err);
          S.busy = false;
        }
      }
      sync();
    });
  });
}
