// Start-up: reopen the last library, or run first-run setup (pick a library, the demo set,
// the Find similar question), then build the Store on the library that came back (B7) and
// mount the Reference view on it.
import { makeOpenCompare } from "./compare/view";
import type { Api, LibraryView } from "./api";
import { esc } from "./esc";
import { noticeIn } from "./importer";
import { dockPicker, mountInbox } from "./inbox/view";
import { type DropWin, wireIntake } from "./intake";
import { wireUndoKeys } from "./keys";
import { mountLibraryMenu } from "./library-menu";
import { mountReference } from "./reference/view";
import { mountSaveDialog, wireSaveStatus } from "./save-dialog";
import { storeSource } from "./data";
import { createStore, type Store } from "./store";
import { mountViews } from "./views";
import { mountTree } from "./views/tree";
import { mountRadial } from "./views/radial";
import { mountGalaxy } from "./views/galaxy";
import { mountBoards } from "./boards/view";
import { mountScopeStatus } from "./boards/status";
import { wireSimilar } from "./similar-ui";
import { CATCH_ALL, FIND_SIMILAR_COPY, fmtBytes } from "./settings/find-similar";
import { mountSettings } from "./settings/panel";
import { playIntro, shouldPlayIntro } from "./intro/intro";
import { demoCredits, FONTS, mountAbout } from "./about";
import { showProgress } from "./importer";

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export { FIND_SIMILAR_COPY };

/** `win` is the webview, for drag-and-drop; tests (jsdom has no Tauri window) leave it out. */
export async function boot(root: HTMLElement, api: Api, win?: DropWin) {
  // A reload mid-queue leaves Rust's intake flag set, so every close would wait: clear it first,
  // before first run can wait on the artist. It also takes a close owed before the reload.
  void api.intakeBusy(false).catch(() => {});
  // Plan 6 Task 2: subscribed before any open (its rebuild can end before the views exist);
  // ids heard that early wait in `early` until the views are up.
  let early: string[] | null = [];
  let onRebuilt: (ids: string[]) => void = (ids) => void early?.push(...ids);
  let destroyed = false;
  let unThumbs: (() => void) | null = null;
  void api.onThumbsRebuilt((ids) => onRebuilt(ids)).then((u) => (destroyed ? u() : (unThumbs = u)));
  const settings = await api.getSettings().catch(() => null);
  const dark = settings?.theme === "dark" ||
    (settings?.theme !== "light" && typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  // Plan 6 Task 4 (R12): once for everyone, before the last library opens and before first run.
  if (shouldPlayIntro(settings)) {
    await playIntro(root, { reducedMotion: reducedMotion() });
    void api.setSettings({ introSeen: true }).catch(() => {});
  }
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
  // Plan 4 Task 7: the one Compare opener (R22). Closing it never navigates (review I2): from the
  // Reference view it just closes over the view underneath; the Galaxy's call passes an onClose.
  const openCompare = makeOpenCompare(root, api, store);
  // Plan 3: the view shell. Search hits from any view switch to the Reference view first (R5).
  const shell = mountViews(root, { showReference: (id) => view.show(id) });
  // Plan 5 Task 7 (R14): Find similar hears every shown reference and gives search its option B.
  // The view shows its first reference before wireSimilar exists: remember the last one shown.
  let similar: ReturnType<typeof wireSimilar> | null = null;
  let lastShown: string | null = null;
  const view = mountReference(root, api, store, {
    onNavigate: () => shell.select("reference"),
    openCompare: (a, b) => openCompare(a, b), // no onClose: Esc only closes; filter and pins stay
    onShow: (id) => ((lastShown = id), similar?.show(id)),
    similar: () => similar?.search(),
  });
  // The graph views' read-only data seam; Tasks 6-8 pass it to their views.
  const source = storeSource(store);

  // Task 9: the Inbox, intake, the view toggle and the Library menu.
  const inboxRoot = root.querySelector<HTMLElement>("#inbox")!;
  let dock: ReturnType<typeof dockPicker> | null = null;
  const inbox = mountInbox(inboxRoot, api, store, { openPicker: (o) => dock?.(o), closePicker: () => dock?.hide() });
  dock = dockPicker(inboxRoot.querySelector<HTMLElement>(".inbox-dock")!, api, store);
  // Switching to the Inbox lands on its first item, or on the one intake is opening.
  let landOn: string | null = null;
  const still = () => {};
  // The Reference view is always mounted; CSS shows it.
  shell.register("reference", () => ({ show: still, hide: still, destroy: still }));
  // Plan 3 Task 7: the Galaxy.
  shell.register("galaxy", () =>
    mountGalaxy(root.querySelector<HTMLElement>('[data-view-host="galaxy"]')!, source, {
      api,
      openReference: shell.openReference,
      openCompare: (a, b) => openCompare(a, b, { onClose: () => shell.select("galaxy") }), // Esc returns to the Galaxy
    }));
  shell.register("inbox", () => ({
    show: () => (landOn ? inbox.focusId(landOn) : inbox.focus(0)),
    hide: still,
    destroy: still,
  }));
  // Plan 3 Task 6: the taxonomy Tree, mounted on its first select.
  shell.register("tree", () =>
    mountTree(root.querySelector<HTMLElement>('[data-view-host="tree"]')!, source, { api, apply: store.apply, notice, openReference: shell.openReference }));
  // Plan 3 Task 8: the Radial view, one operation at a time.
  shell.register("radial", () =>
    mountRadial(root.querySelector<HTMLElement>('[data-view-host="radial"]')!, source, { api, openReference: shell.openReference }));
  // Plan 4 Task 5: Boards, and the board scope in the footer.
  shell.register("boards", () =>
    mountBoards(root.querySelector<HTMLElement>('[data-view-host="boards"]')!, api, store, { openReference: shell.openReference }));
  const unScope = mountScopeStatus(root.querySelector<HTMLElement>("#board-scope")!, store);
  const unIntake = wireIntake(win ?? null, document, {
    api,
    store,
    notice,
    show: shell.openReference,
    // ponytail: several new references each keep their preset; the Inbox lands on the last one
    openPicker: (o) => {
      if (o.preset?.length) dock?.remember(o.refId, o.preset);
      landOn = o.refId;
      shell.select("inbox"); // the Inbox's show lands on landOn, a re-select included
      landOn = null;
    },
  });
  const menu = mountLibraryMenu(root.querySelector<HTMLElement>("#library-menu")!, api, store, notice, unIntake.idle);
  const unmountSaveDialog = mountSaveDialog(root, api);
  const unwireSaveStatus = wireSaveStatus(root, api);
  const settingsPanel = mountSettings(root, api); // Plan 5 Task 6: the top bar's gear
  similar = wireSimilar(root, api, store, win ?? null, {
    search: view.search,
    openSettings: () => settingsPanel.open("find-similar"),
  });
  if (lastShown) similar.show(lastShown);
  // Plan 6 Task 4: the Help menu. An open Settings closes first: its capture-phase key listener
  // would eat the intro's skip key and About's Esc.
  let about: { close(): void } | null = null;
  let unMenu: (() => void) | null = null;
  const openAbout = async () => {
    const [version, noticesPath] = await Promise.all([
      api.appVersion().catch(() => "unknown"),
      api.noticesPath().catch(() => ""),
    ]);
    if (destroyed) return; // boot was torn down while the version was read
    about?.close();
    about = mountAbout(root, { version, fonts: FONTS, noticesPath, demoCredits: demoCredits() }, {
      openNotices: (p) => api.openPath(p),
    });
  };
  void api.onMenu((id) => {
    settingsPanel.close();
    about?.close(); // its holdModal would keep the notice inert and catch the intro's keys
    if (id === "play-intro") void playIntro(root, { reducedMotion: reducedMotion() }); // introSeen stays
    else if (id === "about") void openAbout();
    else if (id === "verify") void verifyImageFiles(root, api, notice);
  }).then((u) => (destroyed ? u() : (unMenu = u)));
  // Plan 6 Task 2: a rebuilt thumbnail replaces the broken image wherever it shows.
  onRebuilt = (ids) => reloadThumbs(root, api, store, ids);
  if (early?.length) reloadThumbs(root, api, store, early);
  early = null;
  return {
    ...view,
    store,
    source,
    destroy: () =>
      (unwire(), unScope(), unIntake(), menu.destroy(), unmountSaveDialog(), unwireSaveStatus(), settingsPanel.close(), similar?.destroy(), (destroyed = true), unThumbs?.(), unMenu?.(), about?.close(), dock?.close(), inbox.destroy(), shell.destroy(), view.destroy()),
  };
}

/** Help > Verify image files…: progress and Cancel in the notice (D15's surface), then one line.
 * The ids it finds go to "Show them", like a missing original's. */
let verifying = false;

export async function verifyImageFiles(root: ParentNode, api: Api, notice: (html: string) => void) {
  if (verifying) return; // one run: a second click would replace the live progress and Cancel
  verifying = true;
  const prog = showProgress(root, "Verifying image files", () => void api.cancelVerify().catch(() => {}));
  const unlisten = api.onVerifyProgress((p) => prog.update(p.done, p.total)).catch(() => null);
  try {
    const r = await api.verifyImageFiles();
    prog.stop();
    const n = r.changed.length;
    if (r.checked < r.total) notice(`<p>Verify stopped after ${r.checked} of ${r.total} image files.</p>`);
    else if (!n) notice(`<p>All ${r.total} image files match the library.</p>`);
    else
      notice(
        `<p>${n} image ${n === 1 ? "file has" : "files have"} changed since ${n === 1 ? "it was" : "they were"} added. <button type="button" class="text-btn" data-show-refs="${esc(r.changed.join(" "))}">Show them</button></p>`,
      );
  } catch (err) {
    prog.stop();
    notice(`<p>${esc(String(err))}</p>`);
  } finally {
    verifying = false;
    void unlisten.then((u) => u?.());
  }
}

/** Re-requests every `<img>` showing one of these references' thumbnails (they 404ed before). */
export function reloadThumbs(root: ParentNode, api: Api, store: Store, ids: string[]) {
  const urls = new Set(
    ids.flatMap((id) => {
      const r = store.refs.get(id);
      return r ? [api.assetUrl(r.thumb256), api.assetUrl(r.thumb1024)] : [];
    }),
  );
  root.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
    const src = img.getAttribute("src");
    if (src && urls.has(src)) img.src = src;
  });
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
  const S = { mode: null as "create" | "open" | null, path: null as string | null, answered: !askFindSimilar, findSimilar: null as "on" | "off" | null, busy: false };
  const sync = () => {
    go.disabled = S.busy || !S.path || !S.answered;
    demo.disabled = S.busy || S.mode === "open";
    $("#fr-demo-step").classList.toggle("is-off", S.mode === "open");
    el.querySelectorAll<HTMLButtonElement>(".fr-btn").forEach((b) => (b.disabled = S.busy));
  };

  if (askFindSimilar) {
    // R12: the download size (always the model's total), then the existing RAM line.
    const ram = api.systemRamGb().then(
      (gb) => (gb ? `This computer: ${gb} GB of RAM` : "This computer: RAM could not be read"),
      () => "This computer: RAM could not be read",
    );
    const size = api.similarStatus().then(
      (s) => `Download: ${fmtBytes(s.downloadTotal)} · `,
      () => "",
    );
    void Promise.all([size, ram]).then(([d, r]) => ($("#fr-ram").textContent = d + r));
  }

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
        S.findSimilar = fs;
        // A click only records the choice in memory (it can still change, and quitting before
        // Begin saves and downloads nothing); Begin saves it (R12).
      } else if (t.closest("#fr-go") && S.path) {
        S.busy = true;
        sync();
        const seeding = S.mode === "create" && demo.checked;
        status.textContent = seeding ? "Creating the library and importing the demo set. This can take a minute." : "Opening the library…";
        try {
          const lib = S.mode === "create" ? await api.createLibrary(S.path, demo.checked) : await api.openLibrary(S.path);
          el.remove();
          shell.forEach((x) => (x.inert = false));
          // "on": similarEnable saves it before it starts the download.
          if (S.findSimilar === "on") enableInBackground(root, api);
          else if (S.findSimilar === "off") {
            api.setSettings({ findSimilar: "off" }).catch((err) => noticeIn(root)(`<p>Could not save that choice: ${esc(String(err))}</p>`));
          }
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

/** After first run's library exists: starts Find similar without waiting on it (the download
 *  runs in the background), and shows the first failure once as a status notice (R12). */
function enableInBackground(root: HTMLElement, api: Api) {
  let told = false;
  let off: (() => void) | null = null;
  const done = () => {
    told = true;
    off?.();
  };
  const tell = (copy: string) => {
    if (told) return;
    done();
    noticeIn(root)(`<p>${esc(copy)}</p><button type="button" class="text-btn" data-open-settings>Open Settings</button>`);
  };
  void api
    .onSimilarStatus((s) => {
      if (s.phase === "error") tell(s.error ?? CATCH_ALL);
      else if (s.phase === "ready" || s.phase === "indexing" || s.phase === "paused") done(); // it started
    })
    .then((u) => (told ? u() : (off = u)));
  api.similarEnable().then(
    (s) => s.phase === "error" && tell(s.error ?? CATCH_ALL),
    () => tell(CATCH_ALL),
  );
}
