// The Reference view, ported 1:1 from prototype/app.js (show / render*). Correlation comes from
// the Rust `related` command; names come from the library's taxonomy (tags carry ids only).
import type { Api, Link, Reference, Scored, Settings, Tag, Taxonomy } from "../api";
import { mountSearch } from "../search";
import { drawLeaders, highlight } from "./leaders";
import { tileHTML } from "./tile";

const OP_KEY: Record<string, string> = { differentiate: "diff", group: "group", sequence: "seq", infer: "infer" };
const key = (opId: string) => OP_KEY[opId] ?? "diff";
const opColor = (opId: string) => `var(--${key(opId)})`;
const opText = (opId: string) => `var(--${key(opId)}-text)`;
const opOn = (opId: string) => `var(--${key(opId)}-on)`;
const esc = (s: unknown = "") =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
const fmt = (n: number) => n.toFixed(2);
const stateLabel = { full: "full tag", partial: "partial", region: "region" } as const;
const stateOf = (t: Tag): keyof typeof stateLabel => (t.region ? "region" : t.techniqueId ? "full" : "partial");
const PAINT_DELAY = 180; // matches .specimen.is-leaving transition

export function mountReference(
  root: HTMLElement,
  api: Api,
): { show(id: string): void; ready: Promise<void>; destroy(): void } {
  const life = new AbortController();
  const signal = life.signal;
  const $ = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s);
  const S = {
    refs: [] as Reference[],
    byId: new Map<string, Reference>(),
    links: [] as Link[],
    tax: null as Taxonomy | null,
    settings: { lastLibrary: null, theme: "system", findSimilar: "unset" } as Settings,
    focus: null as string | null,
    trail: [] as string[],
    pinned: null as number | null,
    hot: null as number | null,
    arrival: null as Tag | null,
    related: [] as Scored[],
    ranked: [] as string[],
    filter: null as string | null,
    source: "",
    paintTimer: 0 as ReturnType<typeof setTimeout> | 0,
    nav: 0, // drops stale show() calls
  };

  // ---------- taxonomy lookups (tags carry ids) ----------
  const opOf = (id: string) => S.tax?.operations.find((o) => o.id === id);
  const opName = (id: string) => opOf(id)?.name ?? id;
  const opPlain = (id: string) => opOf(id)?.plainLabel ?? "";
  const techName = (id?: string) => (id ? (S.tax?.techniques.find((t) => t.id === id)?.name ?? id) : "");
  const techDef = (id?: string) => (id ? S.tax?.techniques.find((t) => t.id === id)?.description : undefined);
  const domainOf = (branchId?: string) => {
    const b = branchId ? S.tax?.branches.find((x) => x.id === branchId) : undefined;
    return b ? (S.tax?.domains.find((d) => d.id === b.domainId)?.name ?? b.domainId) : "";
  };
  const branchLabel = (branchId: string) => {
    const b = S.tax?.branches.find((x) => x.id === branchId);
    return b ? `${opName(b.operationId)} · ${domainOf(branchId)}` : branchId;
  };
  const aspect = (r: Reference) => (r.width && r.height ? r.width / r.height : 3 / 4);
  const img = (r: Reference, big = false) =>
    `<img src="${esc(api.assetUrl(big ? r.thumb1024 : r.thumb256))}" alt="${esc(r.title)}" loading="lazy">`;

  // ---------- rendering ----------
  function show(id: string, { push = true, via = null as string | null } = {}) {
    const ref = S.byId.get(id);
    if (!ref) return;
    if (push && S.focus && S.focus !== id) S.trail.push(S.focus);
    const spec = $("#specimen")!;
    const first = !S.focus;
    S.focus = id;
    S.pinned = null;
    S.hot = null;
    S.filter = null;
    // The path you arrived on stays in the record header at rest.
    S.arrival = ref.tags.find((t) => via && t.techniqueId === via) ?? ref.tags.find((t) => t.techniqueId) ?? ref.tags[0] ?? null;
    clearTimeout(S.paintTimer);
    const mine = ++S.nav;
    const related = api.related(id).catch(() => [] as Scored[]);
    const paint = async () => {
      const list = await related;
      if (mine !== S.nav) return;
      S.related = list;
      spec.style.setProperty("--ar", String(aspect(ref)));
      $("#plate")!.innerHTML = img(ref, true);
      renderBoxes(ref);
      renderCallouts(ref);
      renderRanked(ref);
      renderLinks(ref);
      renderRecord(ref, S.arrival);
      readout();
      spec.classList.remove("is-leaving");
      redraw();
    };
    if (first) void paint();
    else {
      spec.classList.add("is-leaving");
      S.paintTimer = setTimeout(() => void paint(), PAINT_DELAY);
    }
    const back = $<HTMLButtonElement>("#back")!;
    back.disabled = !S.trail.length;
    $("#back-label")!.textContent = S.trail.length ? `Back to ${S.byId.get(S.trail[S.trail.length - 1])?.title ?? ""}` : "Back";
    renderStatus();
  }

  function renderStatus() {
    $("#lib-count")!.textContent = `${S.refs.length} references`;
    $("#inbox-count")!.textContent = String(S.refs.filter((r) => !r.tags.length).length);
    $("#data-source")!.textContent = S.source;
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
      .filter((x) => S.byId.get(x.id)?.tags.some((t) => t.techniqueId === technique))
      .slice(0, 4);
  }

  function readout() {
    const ref = S.focus ? S.byId.get(S.focus) : undefined;
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
          ${
            !t.techniqueId
              ? `<p class="none">Partial tags don't count toward related scores.</p>`
              : th.length
                ? `<div class="thumbs">${th
                    .map((x) => {
                      const r = S.byId.get(x.id)!;
                      const region = r.tags.find((u) => u.techniqueId === t.techniqueId && u.region)?.region;
                      return `<button class="thumb" data-go="${esc(r.id)}" data-via="${esc(t.techniqueId)}" title="${esc(r.title)}" aria-label="Open ${esc(r.title)}, score ${fmt(x.score)}"><span class="t">${tileHTML(img(r), aspect(r), opColor(op), region)}</span><span class="sc">${fmt(x.score)}</span></button>`;
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
    const list = S.filter
      ? S.refs.filter((r) => r.tags.some((t) => t.techniqueId === S.filter)).map((r) => byScore.get(r.id) ?? blank(r.id))
      : S.related;
    S.ranked = list.map((x) => x.id);
    const head = S.filter
      ? `<p class="pane-note">Using <b class="mono">${esc(techName(S.filter))}</b> · ${list.length} references · <button class="settings" id="clear-filter">Clear</button></p>`
      : `<p class="pane-note">${list.length} related · strongest first</p>`;
    // SPEC §4: links the artist drew are always shown, listed first, never mixed into the score.
    const mine = S.filter
      ? []
      : linksOf(ref).map(
          ({ other }) =>
            `<button class="row" data-go="${esc(other.id)}"><span class="t">${img(other)}</span><span><b>${esc(other.title)}</b><small>your link</small></span><span class="sc">link</span></button>`,
        );
    const rows = list
      .map((x) => {
        const r = S.byId.get(x.id);
        if (!r) return "";
        const why = x.sharedTechniques.length
          ? `shares ${x.sharedTechniques.map(techName).join(", ")}`
          : x.sharedBranches.length
            ? `same ${branchLabel(x.sharedBranches[0])}`
            : "";
        return `<button class="row${prev.size && !prev.has(r.id) ? " is-new" : ""}" data-go="${esc(r.id)}"><span class="t">${img(r)}</span><span><b>${esc(r.title)}</b><small>${esc(why)}</small></span><span class="sc">${r.id === ref.id ? "this" : fmt(x.score)}</span></button>`;
      })
      .join("");
    pane.innerHTML =
      head + mine.join("") + (list.length ? rows : `<p class="none">Nothing shares a technique with this reference yet.</p>`);
    setTimeout(() => pane.querySelectorAll(".is-new").forEach((el) => el.classList.remove("is-new")), 2400);
  }

  const linksOf = (ref: Reference) =>
    S.links
      .filter((l) => l.fromRef === ref.id || l.toRef === ref.id)
      .map((l) => ({ ...l, other: S.byId.get(l.fromRef === ref.id ? l.toRef : l.fromRef)! }))
      .filter((l) => l.other);

  function renderLinks(ref: Reference) {
    const ls = linksOf(ref);
    $("#links-count")!.textContent = ls.length ? String(ls.length) : "";
    $("#pane-links")!.innerHTML = ls.length
      ? ls
          .map(
            ({ other, why }) =>
              `<div class="link"><button class="row" data-go="${esc(other.id)}"><span class="t">${img(other)}</span><span><b>${esc(other.title)}</b><small>your link</small></span><span></span></button><p class="why">“${esc(why)}”</p></div>`,
          )
          .join("")
      : `<p class="none">No links drawn from this reference yet.</p>`;
  }

  function renderRecord(ref: Reference, tag: Tag | null) {
    const set = (lvl: string, val?: string) => {
      const c = $(`.cell[data-level="${lvl}"]`)!;
      c.querySelector("[data-v]")!.textContent = val || "";
      return c;
    };
    $("#ref-id")!.textContent = ref.id;
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
  const focusRef = () => (S.focus ? S.byId.get(S.focus) : undefined);
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

  function applyFilter(tech: string) {
    S.filter = tech;
    selectPane("ranked");
    const ref = focusRef();
    if (ref) renderRanked(ref);
  }

  // ---------- events ----------
  root.addEventListener("click", (e) => {
    const target = e.target as Element;
    const go = target.closest<HTMLElement>("[data-go]");
    if (go) return show(go.dataset.go!, { via: go.dataset.via ?? null });
    const pin = target.closest(".pin");
    if (pin) {
      const i = +pin.closest<HTMLElement>(".call")!.dataset.i!;
      S.pinned = S.pinned === i ? null : i;
      hot(S.pinned);
      syncPins();
      return;
    }
    if (target.id === "clear-filter") {
      S.filter = null;
      const ref = focusRef();
      if (ref) renderRanked(ref);
      return;
    }
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
    if ((e.target as Element).matches?.("input")) return;
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
    else if (/^[1-9]$/.test(e.key)) {
      const i = +e.key - 1;
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
    operationLabel: (id) => ({ name: opName(id), plain: opPlain(id), color: opColor(id) }),
    referenceTitle: (id) => S.byId.get(id)?.title,
    onTechnique: applyFilter,
    onReference: (id) => show(id),
  }, signal);

  // ---------- load ----------
  async function load() {
    try {
      S.settings = await api.getSettings();
    } catch {
      /* keep defaults */
    }
    applyTheme(S.settings.theme === "system" ? systemTheme() : S.settings.theme);
    if (!S.settings.lastLibrary) {
      S.source = "No library open yet.";
      renderStatus();
      return;
    }
    try {
      const lib = await api.openLibrary(S.settings.lastLibrary);
      S.tax = await api.getTaxonomy();
      S.refs = lib.references;
      S.links = lib.links;
      S.refs.forEach((r) => S.byId.set(r.id, r));
      S.source = [`Library: ${lib.root}`, lib.warning].filter(Boolean).join(" · ");
    } catch (err) {
      S.source = `Could not open the library: ${String(err)}`;
      renderStatus();
      return;
    }
    const start = S.refs.find((r) => r.tags.length >= 3) ?? S.refs.find((r) => r.tags.length) ?? S.refs[0];
    if (start) show(start.id, { push: false });
    else renderStatus();
  }

  const ready = load();
  return {
    show: (id: string) => show(id),
    ready,
    destroy: () => {
      life.abort();
      clearTimeout(S.paintTimer);
      S.nav++; // drop any paint still in flight
    },
  };
}
