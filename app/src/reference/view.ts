// The Reference view, ported 1:1 from prototype/app.js (show / render*). Correlation comes from
// the Rust `related` command. The references, links and taxonomy come from the Store (tags
// carry ids only); the view keeps only its own state: focus, trail, pin, filter.
import type { Api, Reference, Scored, Settings, Tag } from "../api";
import { esc } from "../esc";
import { mountImport, warningHTML } from "../importer";
import { digitOf } from "../keys";
import { openLightboxWithPicker } from "../lightbox/dock";
import { linkedFirst, linkErrorCopy, mountLinkEditor } from "../links/editor";
import { mountBoardMenu } from "../boards/menu";
import { opInk, opLabel } from "../ops";
import { mountSearch } from "../search";
import type { Store, StoreEvent } from "../store";
import { mountPicker } from "../tagging/picker";
import { type Filter, matchesFilter, toggle } from "./filter";
import { drawLeaders, highlight } from "./leaders";
import { tileHTML } from "./tile";

const fmt = (n: number) => n.toFixed(2);
const stateLabel = { full: "full tag", partial: "partial", region: "region" } as const;
const stateOf = (t: Tag): keyof typeof stateLabel => (t.region ? "region" : t.techniqueId ? "full" : "partial");
const PAINT_DELAY = 180; // matches .specimen.is-leaving transition
const noFilter = (): Filter => ({ techniques: [], mode: "or" });

/** `ready` resolves once the settings (theme, Find similar status) are in; the library is painted at mount. */
export function mountReference(
  root: HTMLElement,
  api: Api,
  store: Store,
  /** `openCompare`: boot()'s one Compare opener (Plan 4 Task 7); Shift-click and Shift+Enter call it. */
  opts: { onNavigate?(): void; openCompare?(a: string, b: string): void } = {},
): { show(id: string): void; ready: Promise<void>; destroy(): void } {
  const life = new AbortController();
  const signal = life.signal;
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s);
  const S = {
    settings: { lastLibrary: null, theme: "system", findSimilar: "unset" } as Settings,
    focus: null as string | null,
    trail: [] as string[],
    pinned: null as number | null,
    hot: null as number | null,
    arrival: null as Tag | null,
    related: [] as Scored[],
    ranked: [] as string[],
    filter: noFilter(),
    paintTimer: 0 as ReturnType<typeof setTimeout> | 0,
    plateSrc: "", // what #plate shows, so any paint can tell whether it is stale
    nav: 0, // drops stale paints
  };

  // ---------- taxonomy lookups (tags carry ids) ----------
  const opColor = (opId: string) => opInk(store.tax, opId).base;
  const opText = (opId: string) => opInk(store.tax, opId).text;
  const opOn = (opId: string) => opInk(store.tax, opId).on;
  const opName = (id: string) => opLabel(store.tax, id).name;
  const opPlain = (id: string) => opLabel(store.tax, id).plain;
  const techName = (id?: string) => (id ? (store.tax.techniques.find((t) => t.id === id)?.name ?? id) : "");
  const techDef = (id?: string) => (id ? store.tax.techniques.find((t) => t.id === id)?.description : undefined);
  const domainOf = (branchId?: string) => {
    const b = branchId ? store.tax.branches.find((x) => x.id === branchId) : undefined;
    return b ? (store.tax.domains.find((d) => d.id === b.domainId)?.name ?? b.domainId) : "";
  };
  const branchLabel = (branchId: string) => {
    const b = store.tax.branches.find((x) => x.id === branchId);
    return b ? `${opName(b.operationId)} · ${domainOf(branchId)}` : branchId;
  };
  /** The operation a technique is shown under, by search's rule (`search.rs`): the one the library
   * tags it under most, else its first operation in branch order; none → opInk's neutral. */
  const techOp = (id: string) => {
    const ops = store.tax.branches
      .filter((b) => store.tax.branchTechniques.some((l) => l.branchId === b.id && l.techniqueId === id))
      .map((b) => b.operationId);
    const uses = (op: string) =>
      allRefs().reduce((n, r) => n + r.tags.filter((t) => t.techniqueId === id && t.operationId === op).length, 0);
    return ops.reduce((best, op) => (uses(op) > uses(best) ? op : best), ops[0] ?? "");
  };
  const aspect = (r: Reference) => (r.width && r.height ? r.width / r.height : 3 / 4);
  const img = (r: Reference, big = false) =>
    `<img src="${esc(api.assetUrl(big ? r.thumb1024 : r.thumb256))}" alt="${esc(r.title)}" loading="lazy">`;
  const allRefs = () => [...store.refs.values()];

  // ---------- rendering ----------
  const arrivalOf = (ref: Reference, via: string | null) =>
    ref.tags.find((t) => via && t.techniqueId === via) ?? ref.tags.find((t) => t.techniqueId) ?? ref.tags[0] ?? null;

  function show(id: string, { push = true, via = null as string | null } = {}) {
    const ref = store.refs.get(id);
    if (!ref) return;
    if (picker && picker.el.dataset.ref !== id) closePicker();
    if (id !== S.focus) lightbox?.close(); // it shows the focus; never another reference behind it
    if (id !== S.focus) linkEditor?.close(); // it links from the focus
    if (id !== S.focus) boardMenu?.close(); // it is for the focus
    if (push && S.focus && S.focus !== id) S.trail.push(S.focus);
    const spec = $("#specimen")!;
    const first = !S.focus;
    S.focus = id;
    S.pinned = null;
    S.hot = null;
    S.filter = noFilter();
    // The path you arrived on stays in the record header at rest.
    S.arrival = arrivalOf(ref, via);
    clearTimeout(S.paintTimer);
    const mine = ++S.nav;
    const related = api.related(id).catch(() => [] as Scored[]);
    const paint = async () => {
      const list = await related;
      if (mine !== S.nav) return;
      S.related = list;
      paintFocus(ref);
    };
    if (first) void paint();
    else {
      spec.classList.add("is-leaving");
      S.paintTimer = setTimeout(() => void paint(), PAINT_DELAY);
    }
    renderBack();
    renderStatus();
  }

  function paintFocus(ref: Reference) {
    const spec = $("#specimen")!;
    spec.style.setProperty("--ar", String(aspect(ref)));
    // A drop here is "Tag like this" for this reference (Task 9). On #specimen, not #plate: the
    // region boxes lie over the plate, so the drop's hit-test lands on a .box (Task 12 item 4).
    spec.dataset.refDrop = ref.id;
    // Repaint the image only when it changed: a superseded show() or reset may have left another one.
    const src = api.assetUrl(ref.thumb1024);
    if (S.plateSrc !== src) {
      $("#plate")!.innerHTML = img(ref, true);
      S.plateSrc = src;
    }
    renderBoxes(ref);
    renderCallouts(ref);
    renderRanked(ref);
    renderLinks(ref);
    renderRecord(ref, S.arrival);
    readout();
    renderBoardsLine(ref);
    // Review Focus 5: a focused reference outside the scoped board stays focused, marked.
    offBoard.hidden = store.inScope(ref.id);
    spec.classList.remove("is-leaving");
    redraw();
  }

  /** Re-render the focus in place after a Change: the pin, filter and trail stay. */
  function refresh() {
    const ref = focusRef();
    if (!ref) return;
    S.arrival = ref.tags.find((t) => t.id === S.arrival?.id) ?? arrivalOf(ref, null);
    if (S.pinned != null && !ref.tags[S.pinned]) S.pinned = null;
    if (S.hot != null && !ref.tags[S.hot]) S.hot = null;
    clearTimeout(S.paintTimer);
    const mine = ++S.nav;
    void api
      .related(ref.id)
      .catch(() => [] as Scored[])
      .then((list) => {
        const now = focusRef();
        if (mine !== S.nav || !now) return;
        S.related = list;
        paintFocus(now);
        syncPins();
        if (S.pinned != null) hot(S.pinned);
      });
  }

  function renderEmpty() {
    linkEditor?.close(); // nothing left to link from
    boardMenu?.close();
    boardsLine.hidden = true;
    S.focus = S.pinned = S.hot = S.arrival = null;
    S.filter = noFilter();
    S.related = [];
    S.ranked = [];
    S.plateSrc = "";
    delete $("#specimen")!.dataset.refDrop;
    clearTimeout(S.paintTimer);
    S.nav++;
    $("#specimen")!.classList.remove("is-leaving");
    for (const s of ["#plate", "#boxes", "#pane-ranked", "#pane-links", "#lab-meta"]) $(s)!.innerHTML = "";
    $("#pane-callouts")!.innerHTML = `<p class="none">No references yet.</p>`;
    $("#links-count")!.textContent = "";
    $("#ref-id")!.textContent = "";
    $("#ref-id")!.title = "";
    root.querySelectorAll(".cell[data-level] [data-v]").forEach((v) => (v.textContent = ""));
    redraw();
  }

  function renderBack() {
    const back = $<HTMLButtonElement>("#back")!;
    const last = S.trail[S.trail.length - 1];
    back.disabled = !S.trail.length;
    $("#back-label")!.textContent = last ? `Back to ${store.refs.get(last)?.title ?? ""}` : "Back";
  }

  function renderStatus() {
    const folder = store.root.split(/[\\/]/).filter(Boolean).pop() ?? store.root;
    $("#lib-count")!.textContent = `${store.refs.size} references`;
    $("#inbox-count")!.textContent = String(store.inbox().length);
    // The library's warning lives in #import-notice only (982f8a6), never here as well.
    $("#data-source")!.textContent = `Library: ${folder}`;
    $("#data-source")!.title = store.root;
    $("#find-similar")!.textContent = `Find similar: ${S.settings.findSimilar === "on" ? "on" : "off"}`;
  }

  function renderBoxes(ref: Reference) {
    $("#boxes")!.innerHTML = ref.tags
      .map((t, i) => {
        const r = t.region, whole = !r;
        const pos = whole ? "" : `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
        const wholeIdx = ref.tags.slice(0, i).filter((x) => !x.region).length;
        return `<div class="box${whole ? " is-whole" : ""}" data-i="${i}" data-state="${stateOf(t)}" style="${pos};--c:${opColor(t.operationId)};--on:${opOn(t.operationId)}">
        <span class="num" style="${whole ? `top:${wholeIdx * 34}px` : ""}">${i + 1}</span></div>`;
      })
      .join("");
  }

  function thumbsFor(technique?: string) {
    if (!technique) return [];
    return S.related
      .filter((x) => store.refs.get(x.id)?.tags.some((t) => t.techniqueId === technique))
      .slice(0, 4);
  }

  function readout() {
    const ref = focusRef();
    if (!ref) return;
    const value = $<HTMLInputElement>("#value")!.checked ? "on" : "off";
    // Items wrap as whole units; the separator trails each item so no line starts with "·".
    $("#lab-meta")!.innerHTML = [ref.creator, ref.year, ref.credit, "Grey card N5", `Value view ${value}`]
      .filter(Boolean)
      .map((x) => `<span>${esc(x)}</span>`)
      .join("");
  }

  function renderCallouts(ref: Reference) {
    const pane = $("#pane-callouts")!;
    if (!ref.tags.length) {
      pane.innerHTML = `<p class="none">Not tagged yet. This reference is in the Inbox.</p>`;
      return;
    }
    pane.innerHTML = ref.tags
      .map((t, i) => {
        const th = thumbsFor(t.techniqueId);
        const op = t.operationId;
        const name = t.techniqueId ? techName(t.techniqueId) : `${opPlain(op) || opName(op)}, technique not chosen yet`;
        const domain = domainOf(t.branchId);
        const def = techDef(t.techniqueId);
        return `<article class="call" data-i="${i}" style="--op-text:${opText(op)};--hot:${opColor(op)};--c:${opColor(op)};--on:${opOn(op)}">
        <span class="num" aria-hidden="true">${i + 1}</span>
        <div><h3><button class="pin" aria-pressed="false" aria-label="Pin callout ${i + 1}: ${esc(name)}">${esc(name)}</button><span class="state">${stateLabel[stateOf(t)]}</span></h3>
          <div class="path"><span class="op">${esc(opName(op))}</span>${domain ? ` · ${esc(domain)}` : ""} · ${esc(opPlain(op))}</div>
          ${def ? `<p class="pane-note">${esc(def)}</p>` : ""}
          ${t.techniqueId ? `<button class="text-btn filter-by" data-filter="${esc(t.techniqueId)}" aria-label="Filter the Ranked list by ${esc(name)}">Filter by this</button>` : ""}
          ${
            !t.techniqueId
              ? `<p class="none">Partial tags don't count toward related scores.</p>`
              : th.length
                ? `<div class="thumbs">${th
                    .map((x) => {
                      const r = store.refs.get(x.id)!;
                      const region = r.tags.find((u) => u.techniqueId === t.techniqueId && u.region)?.region;
                      return `<button class="thumb" data-go="${esc(r.id)}" data-ref-id="${esc(r.id)}" data-via="${esc(t.techniqueId)}" title="${esc(r.title)}" aria-label="Open ${esc(r.title)}, score ${fmt(x.score)}"><span class="t">${tileHTML(img(r), aspect(r), opColor(op), region)}</span><span class="sc">${fmt(x.score)}</span></button>`;
                    })
                    .join("")}</div>`
                : `<p class="none">No other reference uses this yet.</p>`
          }
        </div></article>`;
      })
      .join("");
  }

  function renderRanked(ref: Reference) {
    const pane = $("#pane-ranked")!;
    const prev = new Set(S.ranked);
    const byScore = new Map(S.related.map((x) => [x.id, x]));
    const blank = (id: string): Scored => ({ id, score: 0, sharedTechniques: [], sharedBranches: [] });
    const f = S.filter;
    const filtering = f.techniques.length > 0;
    const list = (filtering
      ? allRefs()
          .filter((r) => matchesFilter(r, f))
          .map((r) => byScore.get(r.id) ?? blank(r.id))
          .sort((a, b) => b.score - a.score)
      : S.related
    ).filter((x) => store.inScope(x.id)); // "Show only this board" (Plan 4 Task 5)
    S.ranked = list.map((x) => x.id);
    const mode = (m: Filter["mode"], label: string) =>
      `<button class="text-btn" data-mode="${m}" aria-pressed="${f.mode === m}">${label}</button>`;
    const head = filtering
      ? `<div class="filter"><div class="filter-mode" role="group" aria-label="Match">${mode("or", "Any of")}${mode("and", "All of")}</div>
        <ul class="chips">${f.techniques
          .map((id) => `<li class="chip" data-t="${esc(id)}"><span>${esc(techName(id))}</span><button class="chip-x" data-untoggle="${esc(id)}" aria-label="Remove ${esc(techName(id))} from the filter">×</button></li>`)
          .join("")}</ul>
        <p class="pane-note">${list.length} references · <button class="settings" id="clear-filter">Clear</button></p></div>`
      : `<p class="pane-note">${list.length} related · strongest first</p>`;
    // SPEC §4: links the artist drew are always shown (a filter or a board scope never hides
    // them), listed first, never mixed into the score; a linked reference appears once.
    const { linked, rest } = linkedFirst(S.related, linksOf(ref), ref.id);
    const linkedIds = new Set(linked.map((x) => x.other));
    const scoredRows = filtering ? list.filter((x) => !linkedIds.has(x.id)) : rest;
    const mine = linked.length
      ? `<h4 class="group-head">Linked by you</h4>` +
        linked
          .map(({ link, other, score }) => {
            const r = store.refs.get(other)!;
            const sc = score === undefined ? `<small>not related by technique</small>` : fmt(score);
            return `<button class="row linked" data-go="${esc(r.id)}" data-ref-id="${esc(r.id)}"><span class="t">${img(r)}</span><span><b>${esc(r.title)}</b><small>“${esc(link.why)}”</small>${store.inScope(r.id) ? "" : `<small class="off-board-note">Not on this board</small>`}</span><span class="sc">${sc}</span></button>`;
          })
          .join("")
      : "";
    const rows = scoredRows
      .map((x) => {
        const r = store.refs.get(x.id);
        if (!r) return "";
        const why = x.sharedTechniques.length
          ? `shares ${x.sharedTechniques.map(techName).join(", ")}`
          : x.sharedBranches.length
            ? `same ${branchLabel(x.sharedBranches[0])}`
            : "";
        return `<button class="row${prev.size && !prev.has(r.id) ? " is-new" : ""}" data-go="${esc(r.id)}" data-ref-id="${esc(r.id)}"><span class="t">${img(r)}</span><span><b>${esc(r.title)}</b><small>${esc(why)}</small></span><span class="sc">${r.id === ref.id ? "this" : fmt(x.score)}</span></button>`;
      })
      .join("");
    const empty = filtering
      ? `No reference has ${f.mode === "and" ? "all" : "any"} of these yet.`
      : "Nothing shares a technique with this reference yet.";
    pane.innerHTML = head + mine + (list.length ? rows : `<p class="none">${empty}</p>`);
    pane.querySelectorAll<HTMLElement>(".chip").forEach((c) => c.style.setProperty("--c", opColor(techOp(c.dataset.t!))));
    setTimeout(() => pane.querySelectorAll(".is-new").forEach((el) => el.classList.remove("is-new")), 2400);
  }

  /** The focus's links, newest first, without any whose other end isn't in the store. */
  const linksOf = (ref: Reference) =>
    store.linksFor(ref.id).filter((l) => store.refs.has(l.fromRef === ref.id ? l.toRef : l.fromRef));

  function renderLinks(ref: Reference) {
    const ls = linksOf(ref);
    $("#links-count")!.textContent = ls.length ? String(ls.length) : "";
    const rows = ls
      .map((l) => {
        const other = store.refs.get(l.fromRef === ref.id ? l.toRef : l.fromRef)!;
        const t = esc(other.title);
        return `<div class="link" data-link="${esc(l.id)}"><button class="row" data-go="${esc(other.id)}" data-ref-id="${esc(other.id)}"><span class="t">${img(other)}</span><span><b>${t}</b><small>your link</small></span><span></span></button><p class="why">“${esc(l.why)}”</p>
          <div class="link-actions"><button type="button" class="text-btn" data-link-edit="${esc(l.id)}" aria-label="Edit the note on the link to ${t}">Edit</button><button type="button" class="text-btn" data-link-del="${esc(l.id)}" aria-label="Delete the link to ${t}">Delete</button></div></div>`;
      })
      .join("");
    const pane = $("#pane-links")!;
    const hadFocus = pane.contains(document.activeElement); // innerHTML drops it (a Delete, a save)
    pane.innerHTML =
      `<button type="button" class="text-btn link-new" data-link-new aria-keyshortcuts="k">+ Link to…</button><p class="links-msg" role="status"></p>` +
      (ls.length ? rows : `<p class="none">No links drawn from this reference yet.</p>`);
    if (hadFocus) pane.querySelector<HTMLElement>("[data-link-new]")!.focus();
  }

  function renderRecord(ref: Reference, tag: Tag | null) {
    const set = (lvl: string, val?: string) => {
      const c = $(`.cell[data-level="${lvl}"]`)!;
      c.querySelector("[data-v]")!.textContent = val || "";
      return c;
    };
    // Ids are 64-hex BLAKE3 hashes: show 8, keep the full id in the tooltip.
    $("#ref-id")!.textContent = ref.id.slice(0, 8);
    $("#ref-id")!.title = ref.id;
    set("ref", ref.title);
    const cells: [string, string | undefined][] = [
      ["op", tag ? opName(tag.operationId) : undefined],
      ["domain", tag ? domainOf(tag.branchId) : undefined],
      ["tech", tag ? techName(tag.techniqueId) : undefined],
    ];
    $<HTMLElement>(".record")!.style.setProperty("--op-text", tag ? opText(tag.operationId) : "var(--ink)");
    cells.forEach(([lvl, val], k) => {
      const c = set(lvl, val);
      if (tag) {
        c.classList.add("is-filling");
        setTimeout(() => c.classList.remove("is-filling"), 40 + k * 90);
      }
    });
  }

  // ---------- leaders and hover ----------
  const focusRef = () => (S.focus ? store.refs.get(S.focus) : undefined);
  const colors = () => (focusRef()?.tags ?? []).map((t) => opColor(t.operationId));
  const redraw = () => requestAnimationFrame(() => drawLeaders(root, colors(), S.hot));

  function hot(i: number | null, keep = false) {
    S.hot = i;
    const ref = focusRef();
    if (!ref) return;
    const t = i == null ? undefined : ref.tags[i];
    if (!t) {
      highlight(root, null);
      renderRecord(ref, S.arrival);
      return;
    }
    highlight(root, i, opColor(t.operationId));
    if (!keep) renderRecord(ref, t);
  }
  const unhot = () => hot(S.pinned);
  const syncPins = () =>
    root.querySelectorAll<HTMLElement>(".call").forEach((c) =>
      c.querySelector(".pin")?.setAttribute("aria-pressed", String(+c.dataset.i! === S.pinned)),
    );

  // ---------- panes, theme, value ----------
  function selectPane(name: string) {
    root.querySelectorAll<HTMLElement>(".m-tab").forEach((b) => {
      const on = b.dataset.pane === name;
      b.classList.toggle("is-on", on);
      b.setAttribute("aria-selected", String(on));
      b.tabIndex = on ? 0 : -1;
    });
    root.querySelectorAll<HTMLElement>(".pane").forEach((p) => (p.hidden = p.id !== `pane-${name}`));
    $<HTMLElement>("#leaders")!.style.visibility = name === "callouts" ? "visible" : "hidden";
    redraw();
  }

  function applyTheme(t: "light" | "dark") {
    document.documentElement.dataset.theme = t;
    $("#theme")!.setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
  }
  const systemTheme = () =>
    typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";

  /** Filter changes are view state: re-rank the Ranked pane only (no Change, no undo, no refetch). */
  function rerank(filter: Filter, focusOn?: () => HTMLElement | null | undefined) {
    S.filter = filter;
    const ref = focusRef();
    if (ref) renderRanked(ref);
    // innerHTML dropped the focused control; put keyboard focus back near where the artist was.
    if (focusOn) (focusOn() ?? $('.m-tab[data-pane="ranked"]'))?.focus();
  }

  /** Choosing a technique (search or callout) adds it; choosing it again keeps it. */
  function applyFilter(tech: string) {
    selectPane("ranked");
    rerank(S.filter.techniques.includes(tech) ? S.filter : toggle(S.filter, tech));
  }

  // ---------- events ----------
  root.addEventListener("click", (e) => {
    const target = e.target as Element;
    const go = target.closest<HTMLElement>("[data-go]");
    // Shift-click (or Shift+Enter, which arrives as a shifted click) compares it with the focus (C23).
    if (go && e.shiftKey && opts.openCompare && S.focus && go.dataset.go !== S.focus) return opts.openCompare(S.focus, go.dataset.go!);
    if (go) return show(go.dataset.go!, { via: go.dataset.via ?? null });
    if (target.closest("[data-link-new]")) return openLinkEditor();
    const edit = target.closest<HTMLElement>("[data-link-edit]");
    if (edit) return openLinkEditor({ linkId: edit.dataset.linkEdit! });
    const del = target.closest<HTMLElement>("[data-link-del]");
    if (del) {
      api.removeLink(del.dataset.linkDel!).then(
        (c) => store.apply(c),
        (err) => {
          const m = $("#pane-links .links-msg");
          if (m) m.textContent = linkErrorCopy(err);
        },
      );
      return;
    }
    const pin = target.closest(".pin");
    if (pin) {
      const i = +pin.closest<HTMLElement>(".call")!.dataset.i!;
      S.pinned = S.pinned === i ? null : i;
      hot(S.pinned);
      syncPins();
      return;
    }
    const choose = target.closest<HTMLElement>("[data-filter]");
    if (choose) {
      applyFilter(choose.dataset.filter!);
      $<HTMLElement>('.m-tab[data-pane="ranked"]')?.focus(); // the callout pane just hid its button
      return;
    }
    const untoggle = target.closest<HTMLElement>("[data-untoggle]");
    if (untoggle) {
      const k = S.filter.techniques.indexOf(untoggle.dataset.untoggle!);
      // the chip that slides into its place (or the one before it) keeps focus; none left → the tab
      return rerank(toggle(S.filter, untoggle.dataset.untoggle!), () => {
        const xs = root.querySelectorAll<HTMLElement>("#pane-ranked .chip-x");
        return xs[Math.min(k, xs.length - 1)];
      });
    }
    const mode = target.closest<HTMLElement>("[data-mode]");
    if (mode) {
      const m = mode.dataset.mode as Filter["mode"];
      return rerank({ ...S.filter, mode: m }, () => $(`#pane-ranked [data-mode="${m}"]`));
    }
    if (target.id === "clear-filter") return rerank(noFilter(), () => null);
    const tab = target.closest<HTMLElement>(".m-tab");
    if (tab) selectPane(tab.dataset.pane!);
  }, { signal });
  root.addEventListener("mouseover", (e) => {
    const el = (e.target as Element).closest<HTMLElement>(".call, .box");
    if (el) hot(+el.dataset.i!);
  }, { signal });
  root.addEventListener("mouseout", (e) => {
    const el = (e.target as Element).closest(".call, .box");
    if (el && !el.contains(e.relatedTarget as Node | null)) unhot();
  }, { signal });
  root.addEventListener("focusin", (e) => {
    const el = (e.target as Element).closest<HTMLElement>(".call");
    if (el) hot(+el.dataset.i!);
  }, { signal });
  $("#back")!.addEventListener("click", () => {
    const id = S.trail.pop();
    if (id) show(id, { push: false });
  }, { signal });
  $("#theme")!.addEventListener("click", () => {
    const t = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    applyTheme(t);
    S.settings = { ...S.settings, theme: t };
    // Only the field that changed: a whole cached Settings would put back a stale lastLibrary.
    api.setSettings({ theme: t }).catch(() => {});
  }, { signal });
  $("#value")!.addEventListener("change", (e) => {
    document.body.classList.toggle("value", (e.target as HTMLInputElement).checked);
    readout();
  }, { signal });
  $(".m-tabs")!.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = [...root.querySelectorAll<HTMLElement>(".m-tab")];
    const i = tabs.indexOf(document.activeElement as HTMLElement);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    next.focus();
    selectPane(next.dataset.pane!);
  }, { signal });
  document.addEventListener("keydown", (e) => {
    if (e.isComposing || e.defaultPrevented) return; // a key a modal above already handled (Compare's Esc)
    if (drag && e.key === "Escape") return cancelDrag(); // a link drag aborts
    // Ctrl/⌘ combos (paste, copy…) belong to the browser; Alt only for Alt+← (Back).
    if (e.ctrlKey || e.metaKey || (e.altKey && e.key !== "ArrowLeft")) return;
    if ((document.body.dataset.view ?? "reference") !== "reference") return; // another view is showing
    if (lightbox) return; // the lightbox is modal: a key in a notice or dialog over it never acts behind it
    if (document.querySelector('.compare[aria-modal="true"]')) return; // so is Compare (R24)
    // The picker, the lightbox and text fields own their keys (Plan 2 Global Constraints).
    if ((e.target as Element).closest?.(".picker, .lightbox, .link-editor, .board-menu, input, textarea, [contenteditable]")) return;
    if (e.key === "/") {
      e.preventDefault();
      $<HTMLInputElement>("#q")!.focus();
    } else if (e.key === "v") {
      const c = $<HTMLInputElement>("#value")!;
      c.checked = !c.checked;
      c.dispatchEvent(new Event("change"));
    } else if (e.key === "Escape") {
      S.pinned = null;
      hot(null);
      syncPins();
    } else if (e.key === "Backspace" || (e.altKey && e.key === "ArrowLeft")) $<HTMLButtonElement>("#back")!.click();
    else if (e.key === "t") openPicker();
    else if (e.key === "l" || e.key === "L") openLb();
    else if (e.key === "k") openLinkEditor();
    else if (e.key === "b") openBoardMenu();
    else if (digitOf(e)) {
      if (pickerOpen()) return; // the picker's digits pick operations, never callouts
      const i = digitOf(e)! - 1;
      if (focusRef()?.tags[i]) {
        S.pinned = i;
        hot(i);
        syncPins();
      }
    }
  }, { signal });
  $("#pane-callouts")!.addEventListener("scroll", redraw, { passive: true, signal });
  const resize = typeof ResizeObserver !== "undefined" ? new ResizeObserver(redraw) : null;
  resize?.observe($(".work")!);
  signal.addEventListener("abort", () => resize?.disconnect());

  mountSearch(root, api, {
    techniqueName: techName,
    operationLabel: (id) => ({ ...opLabel(store.tax, id), color: opColor(id) }),
    // Under a board scope, an out-of-board reference hit is dropped (search.ts drops undefined).
    referenceTitle: (id) => (store.inScope(id) ? store.refs.get(id)?.title : undefined),
    // R5: search works from any view; onNavigate (the shell's select("reference")) runs first.
    onTechnique: (id) => (opts.onNavigate?.(), applyFilter(id)),
    onReference: (id) => (opts.onNavigate?.(), show(id)),
  }, signal);

  const notify = mountImport(root, api, {
    libraryRoot: () => store.root,
    // B4: the import's Change goes to the store; no reopen, so undo survives.
    onChange: (c) => store.apply(c),
  }, signal);

  // ---------- the technique picker (Plan 2 Task 8): "Tag…" on the plate, or the t key ----------
  let picker: ReturnType<typeof mountPicker> | null = null;
  const pickerOpen = () => !!picker?.el.isConnected;
  function closePicker() {
    picker?.close();
    picker = null;
  }
  function openPicker() {
    const ref = focusRef();
    if (!ref) return;
    if (pickerOpen() && picker!.el.dataset.ref === ref.id) {
      picker!.el.querySelector<HTMLElement>('.pk-ops [tabindex="0"]')?.focus();
      return;
    }
    closePicker();
    linkEditor?.close();
    boardMenu?.close();
    // Docked in the margin, for the whole image: an already-tagged reference can gain a tag too.
    const mine = mountPicker($(".margin")!, api, store, {
      refId: ref.id,
      onDone: closePicker,
      onClose: () => void (picker === mine && (picker = null)), // never null a newer picker
    });
    picker = mine;
  }
  $("#lab")!.insertAdjacentHTML("beforeend", `<button type="button" class="tag-open" aria-keyshortcuts="t">Tag…</button>`);
  const tagOpen = $<HTMLButtonElement>("#lab .tag-open")!;
  tagOpen.addEventListener("click", openPicker, { signal });
  signal.addEventListener("abort", () => {
    closePicker();
    tagOpen.remove();
  });

  // ---------- links you draw (Plan 4 Task 4): the editor, and a handle dragged with pointer events ----------
  let linkEditor: ReturnType<typeof mountLinkEditor> | null = null;
  function openLinkEditor(o: { toRef?: string; linkId?: string } = {}) {
    const ref = focusRef();
    if (!ref) return;
    linkEditor?.close();
    boardMenu?.close();
    closePicker(); // one docked panel in the margin at a time
    const mine = mountLinkEditor($(".margin")!, api, store, { fromRef: ref.id, ...o });
    linkEditor = mine;
  }
  // On #lab, like .tag-open: #plate re-renders. Never `draggable` (audit #2: native drops are intake's).
  $("#lab")!.insertAdjacentHTML(
    "beforeend",
    `<button type="button" class="link-handle" aria-keyshortcuts="k" title="Drag onto a reference to link it, or click to choose one">Link…</button>`,
  );
  const handle = $<HTMLButtonElement>("#lab .link-handle")!;
  let drag: { x: number; y: number; moved: boolean; cancelled: boolean; leader: HTMLElement } | null = null;
  let justDragged = false; // the click that follows a drag's pointerup must not open a second editor
  function endDrag() {
    drag?.leader.remove();
    drag = null;
  }
  /** Esc mid-drag: the button is still down, so keep `drag` until its pointerup, which then opens
   * nothing and swallows the click that follows. */
  function cancelDrag() {
    if (!drag || drag.cancelled) return;
    drag.leader.remove();
    drag.cancelled = true;
  }
  handle.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !focusRef()) return;
    handle.setPointerCapture?.(e.pointerId);
    const leader = document.createElement("div");
    leader.className = "link-leader";
    leader.setAttribute("aria-hidden", "true");
    leader.style.setProperty("--x", `${e.clientX}px`);
    leader.style.setProperty("--y", `${e.clientY}px`);
    document.body.append(leader);
    drag = { x: e.clientX, y: e.clientY, moved: false, cancelled: false, leader };
  }, { signal });
  handle.addEventListener("pointermove", (e) => {
    if (!drag || drag.cancelled) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) > 4) drag.moved = true;
    drag.leader.style.setProperty("--len", `${Math.hypot(dx, dy)}px`);
    drag.leader.style.setProperty("--angle", `${Math.atan2(dy, dx)}rad`);
  }, { signal });
  handle.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const { moved, cancelled } = drag;
    endDrag();
    if (!moved && !cancelled) return; // a plain click: the click handler opens the editor
    justDragged = true;
    setTimeout(() => (justDragged = false), 0);
    if (cancelled) return;
    const id = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-ref-id]")?.dataset.refId;
    if (id && id !== S.focus && store.refs.has(id)) openLinkEditor({ toRef: id });
  }, { signal });
  handle.addEventListener("pointercancel", endDrag, { signal });
  handle.addEventListener("click", () => {
    if (justDragged) justDragged = false;
    else openLinkEditor();
  }, { signal });
  signal.addEventListener("abort", () => {
    endDrag();
    linkEditor?.close();
    handle.remove();
  });

  // ---------- boards (Plan 4 Task 5): "Boards…" on the plate, or the b key ----------
  let boardMenu: ReturnType<typeof mountBoardMenu> | null = null;
  function openBoardMenu() {
    const ref = focusRef();
    if (!ref) return;
    boardMenu?.close();
    linkEditor?.close();
    closePicker(); // one docked panel in the margin at a time
    boardMenu = mountBoardMenu($(".margin")!, api, store, ref.id);
  }
  $("#lab")!.insertAdjacentHTML(
    "beforeend",
    `<button type="button" class="boards-open" aria-keyshortcuts="b">Boards…</button><span class="off-board" hidden>Not on this board</span>`,
  );
  // The boards the focus is on, at the top of the margin; "Boards…" (or b) edits them (S1).
  $(".margin")!.insertAdjacentHTML("afterbegin", `<p class="ref-boards" hidden><span class="k">Boards:</span> <span data-v></span></p>`);
  const boardsLine = $<HTMLElement>(".margin .ref-boards")!;
  function renderBoardsLine(ref: Reference) {
    const names = store.boards.filter((b) => b.referenceIds.includes(ref.id)).map((b) => b.name);
    boardsLine.querySelector("[data-v]")!.textContent = names.length ? names.join(" · ") : "On no board";
    boardsLine.hidden = false;
  }
  const boardsOpen = $<HTMLButtonElement>("#lab .boards-open")!;
  const offBoard = $<HTMLElement>("#lab .off-board")!;
  boardsOpen.addEventListener("click", openBoardMenu, { signal });
  signal.addEventListener("abort", () => {
    boardMenu?.close();
    boardsOpen.remove();
    offBoard.remove();
    boardsLine.remove();
  });

  // ---------- the minimal lightbox (Plan 2 Task 10): "Open lightbox" on the plate, or the L key ----------
  let lightbox: { close(): void } | null = null;
  function openLb() {
    const ref = focusRef();
    if (!ref || document.querySelector(".lightbox")) return;
    closePicker(); // a margin picker would sit behind the modal
    // The docking helper (Plan 4 Task 7, R23) owns the docked picker; the margin one closes first.
    lightbox = openLightboxWithPicker(api, store, ref.id, {
      beforePicker: closePicker,
      onClose: () => void (lightbox = null),
    });
  }
  $("#lab")!.insertAdjacentHTML("beforeend", `<button type="button" class="lb-open" aria-keyshortcuts="l">Open lightbox</button>`);
  const lbOpen = $<HTMLButtonElement>("#lab .lb-open")!;
  lbOpen.addEventListener("click", openLb, { signal });
  signal.addEventListener("abort", () => {
    lightbox?.close();
    lbOpen.remove();
  });

  // ---------- the Store ----------
  const start = () => {
    const refs = allRefs();
    return refs.find((r) => r.tags.length >= 3) ?? refs.find((r) => r.tags.length) ?? refs[0];
  };
  /** The brief's re-render scope: the focus, its related references, or the taxonomy. A changed
   * reference sharing a technique or branch with the focus may have just become related. */
  const touchesFocus = (c: StoreEvent) => {
    const f = focusRef();
    if (c.reset || c.taxonomy || c.links || c.scope || c.removed.length || !f) return true;
    // A board Change under a scope can change who is in it; one that removed the board clears it.
    if (c.scopeCleared || (c.boards && store.scope !== null)) return true;
    // With a filter on, a ranked or newly matching reference changes the Ranked list too.
    const filtered = new Set(S.filter.techniques);
    if (
      filtered.size &&
      c.references.some((r) => S.ranked.includes(r.id) || r.tags.some((t) => t.techniqueId && filtered.has(t.techniqueId)))
    )
      return true;
    const techs = new Set(f.tags.map((t) => t.techniqueId).filter(Boolean));
    const branches = new Set(f.tags.map((t) => t.branchId).filter(Boolean));
    return c.references.some(
      (r) =>
        r.id === f.id ||
        S.related.some((x) => x.id === r.id) ||
        r.tags.some((t) => techs.has(t.techniqueId) || branches.has(t.branchId)),
    );
  };
  const unsubscribe = store.subscribe((c) => {
    // A library switch starts a fresh history; Rust clears the undo trail, the Store its flags.
    S.trail = c.reset ? [] : S.trail.filter((id) => store.refs.has(id));
    if (c.reset) {
      if (store.warning) notify(warningHTML(store.warning));
      else $<HTMLElement>("#import-notice")!.hidden = true; // the old library's notice is stale
    }
    if (S.focus && store.refs.has(S.focus)) {
      if (touchesFocus(c)) refresh();
      else if (c.boards) renderBoardsLine(focusRef()!); // membership only: no refetch
    }
    else {
      // The focus was removed: back along the trail, then the first reference, then empty.
      const id = c.reset ? start()?.id : (S.trail.pop() ?? store.refs.keys().next().value);
      if (id) show(id, { push: false });
      else renderEmpty();
    }
    renderBack();
    renderStatus();
  });

  renderStatus();
  if (store.warning) notify(warningHTML(store.warning));
  const first = start();
  if (first) show(first.id, { push: false });
  else renderEmpty();

  const ready = api
    .getSettings()
    .then((s) => void (S.settings = s), () => {}) // keep the defaults
    .then(() => {
      applyTheme(S.settings.theme === "system" ? systemTheme() : S.settings.theme);
      renderStatus();
    });
  return {
    show: (id: string) => show(id),
    ready,
    destroy: () => {
      life.abort();
      unsubscribe();
      clearTimeout(S.paintTimer);
      S.nav++; // drop any paint still in flight
    },
  };
}
