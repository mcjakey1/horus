// Horus — Reference view prototype. Vanilla JS, no build step.
// Serve from the taxonomy-of-visuals folder: `python -m http.server` then open /prototype/.
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const OPS = {
    Differentiate: { key: "diff", plain: "Stand out" },
    Group: { key: "group", plain: "Hold together" },
    Sequence: { key: "seq", plain: "Lead the eye" },
    Infer: { key: "infer", plain: "Make them think" },
  };
  const opColor = (op) => `var(--${OPS[op]?.key || "diff"})`;
  const opText = (op) => `var(--${OPS[op]?.key || "diff"}-text)`;

  const S = { refs: [], byId: new Map(), links: [], synonyms: {}, defs: {}, focus: null, trail: [], pinned: null, ranked: [], filter: null, source: "" };

  // ---------- data ----------
  async function getJSON(url) { try { const r = await fetch(url); return r.ok ? await r.json() : null; } catch { return null; } }

  async function load() {
    const sample = window.HORUS_SAMPLE;
    const [manifest, taxonomy] = await Promise.all([getJSON("../demo/manifest.json"), getJSON("../taxonomy/taxonomy.json")]);
    if (Array.isArray(manifest) && manifest.length) {
      S.refs = manifest.map((m) => ({
        id: m.id, title: m.title, creator: m.creator, year: m.year, src: `../demo/${m.file}`,
        credit: [m.institution, m.rights].filter(Boolean).join(" · "),
        ar: m.width && m.height ? m.width / m.height : undefined,
        tags: (m.suggestedTechniques || []).map((x) => ({ technique: x.technique, operation: x.operation, domain: x.domain, region: x.region, state: x.region ? "region" : (x.state || "full") })),
      }));
      S.source = `Demo set: ${S.refs.length} public-domain works. Technique tags are suggestions to check.`;
    } else {
      S.refs = sample.refs.map((r) => ({ ...r, credit: "Synthetic placeholder plate" }));
      S.links = sample.links;
      S.source = "Placeholder plates for now. The public-domain demo set replaces them when it is ready.";
    }
    S.synonyms = { ...sample.synonyms };
    if (taxonomy?.techniques) {
      for (const t of taxonomy.techniques) {
        S.defs[t.name] = t.description;
        if (t.synonyms?.length) S.synonyms[t.name] = t.synonyms;
      }
    }
    S.refs.forEach((r) => S.byId.set(r.id, r));
    computeIdf();
    const start = S.refs.find((r) => r.tags.length >= 3) || S.refs.find((r) => r.tags.length) || S.refs[0];
    show(start.id, { push: false });
  }

  // ---------- correlation (SPEC §4) ----------
  let idf = new Map();
  function computeIdf() {
    const tagged = S.refs.filter((r) => r.tags.length);
    const N = tagged.length || 1, df = new Map();
    for (const r of tagged) for (const t of new Set(r.tags.map((x) => x.technique).filter(Boolean))) df.set(t, (df.get(t) || 0) + 1);
    idf = new Map([...df].map(([t, d]) => [t, Math.log(1 + N / d)])); // SPEC §4: ln(1 + N/df), unscaled
  }
  // Cosine similarity over one entry per technique (smoothed IDF) and one per
  // operation × domain branch (0.3). Operation alone has no entry (weight 0).
  // Region tags of the same technique collapse into one entry.
  const BRANCH_W = 0.3;
  const MIN_SCORE = 0.05; // ponytail: hides branch-only noise; tune against a real library
  function vec(r) {
    const v = new Map();
    for (const t of r.tags) { // partial tags (operation only) add nothing: weight 0
      if (t.technique) v.set(`t:${t.technique}`, idf.get(t.technique) || 0);
      if (t.technique && t.domain) v.set(`b:${t.operation}|${t.domain}`, BRANCH_W);
    }
    return v;
  }
  const norm = (v) => Math.sqrt([...v.values()].reduce((s, w) => s + w * w, 0));
  function score(a, b) {
    const A = vec(a), B = vec(b), nA = norm(A), nB = norm(B);
    if (!nA || !nB) return { s: 0, shared: [], near: [] };
    let dot = 0; const shared = [], near = [];
    for (const [k, w] of A) if (B.has(k)) {
      dot += w * B.get(k);
      if (k.startsWith("t:")) shared.push(k.slice(2)); else near.push(k.slice(2).replace("|", " · "));
    }
    return { s: dot / (nA * nB), shared, near };
  }
  function related(ref) {
    return S.refs.filter((r) => r.id !== ref.id).map((r) => ({ r, ...score(ref, r) })).filter((x) => x.s >= MIN_SCORE).sort((a, b) => b.s - a.s);
  }

  // ---------- rendering ----------
  const plateHTML = (r) => r.src ? `<img src="${r.src}" alt="${esc(r.title)}" loading="lazy">` : r.svg;
  const esc = (s = "") => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const fmt = (n) => n.toFixed(2);

  function show(id, { push = true, via = null } = {}) {
    const ref = S.byId.get(id); if (!ref) return;
    if (push && S.focus) S.trail.push(S.focus);
    const spec = $("#specimen");
    const first = !S.focus;
    S.focus = id; S.pinned = null; S.hot = null; S.filter = null;
    // The path you arrived on stays in the record header at rest.
    S.arrival = ref.tags.find((t) => via && t.technique === via) || ref.tags.find((t) => t.technique) || ref.tags[0] || null;
    clearTimeout(S.paintTimer);
    const paint = () => {
      spec.style.setProperty("--ar", ref.ar || 3 / 4);
      $("#plate").innerHTML = plateHTML(ref);
      const img = $("#plate img");
      if (img) img.addEventListener("load", () => { ref.ar = img.naturalWidth / img.naturalHeight; spec.style.setProperty("--ar", ref.ar); requestAnimationFrame(drawLeaders); }, { once: true });
      renderBoxes(ref); renderCallouts(ref); renderRanked(ref); renderLinks(ref); renderRecord(ref, S.arrival);
      readout();
      spec.classList.remove("is-leaving");
      requestAnimationFrame(drawLeaders);
    };
    if (first) paint(); else { spec.classList.add("is-leaving"); S.paintTimer = setTimeout(paint, 180); }
    $("#back").disabled = !S.trail.length;
    $("#back-label").textContent = S.trail.length ? `Back to ${S.byId.get(S.trail.at(-1)).title}` : "Back";
    $("#lib-count").textContent = `${S.refs.length} references`;
    $("#inbox-count").textContent = S.refs.filter((r) => !r.tags.length).length;
    $("#data-source").textContent = S.source;
  }

  function renderBoxes(ref) {
    $("#boxes").innerHTML = ref.tags.map((t, i) => {
      const r = t.region, whole = !r;
      const pos = whole ? "" : `left:${r.x * 100}%;top:${r.y * 100}%;width:${r.w * 100}%;height:${r.h * 100}%`;
      const wholeIdx = ref.tags.slice(0, i).filter((x) => !x.region).length;
      return `<div class="box${whole ? " is-whole" : ""}" data-i="${i}" data-state="${t.state}" style="${pos};--c:${opColor(t.operation)};--on:var(--${OPS[t.operation]?.key}-on)">
        <span class="num" style="${whole ? `top:${wholeIdx * 34}px` : ""}">${i + 1}</span></div>`;
    }).join("");
  }

  function thumbsFor(ref, technique) {
    if (!technique) return [];
    return related(ref).filter((x) => x.r.tags.some((t) => t.technique === technique)).slice(0, 4);
  }
  // Whole plate letterboxed on the N5 tile, with the matching region outlined, so every tile stays recognisable.
  function tileHTML(r, technique, op, size = 64) {
    const ar = r.ar || 3 / 4, w = ar >= 1 ? size : size * ar, h = ar >= 1 ? size / ar : size;
    const left = (size - w) / 2, top = (size - h) / 2;
    const reg = r.tags.find((t) => t.technique === technique && t.region)?.region;
    const out = reg ? `<span class="treg" style="left:${left + reg.x * w}px;top:${top + reg.y * h}px;width:${reg.w * w}px;height:${reg.h * h}px;--c:${opColor(op)}"></span>` : "";
    return `<span class="tplate" style="left:${left}px;top:${top}px;width:${w}px;height:${h}px">${plateHTML(r)}</span>${out}`;
  }
  function readout() {
    const ref = S.byId.get(S.focus); if (!ref) return;
    const value = $("#value").checked ? "on" : "off";
    // Items wrap as whole units; the separator trails each item so no line starts with "·".
    $("#lab-meta").innerHTML = [ref.creator, ref.year, ref.credit, "Grey card N5", `Value view ${value}`].filter(Boolean).map((x) => `<span>${esc(x)}</span>`).join("");
  }
  const stateLabel = { full: "full tag", partial: "partial", region: "region" };

  function renderCallouts(ref) {
    const pane = $("#pane-callouts");
    if (!ref.tags.length) { pane.innerHTML = `<p class="none">Not tagged yet. This reference is in the Inbox.</p>`; return; }
    pane.innerHTML = ref.tags.map((t, i) => {
      const th = thumbsFor(ref, t.technique);
      const name = t.technique || `${OPS[t.operation]?.plain || t.operation}, technique not chosen yet`;
      return `<article class="call" data-i="${i}" style="--op-text:${opText(t.operation)};--hot:${opColor(t.operation)};--c:${opColor(t.operation)};--on:var(--${OPS[t.operation]?.key}-on)">
        <span class="num" aria-hidden="true">${i + 1}</span>
        <div><h3><button class="pin" aria-pressed="false" aria-label="Pin callout ${i + 1}: ${esc(name)}">${esc(name)}</button><span class="state">${stateLabel[t.state] || ""}</span></h3>
          <div class="path"><span class="op">${t.operation}</span>${t.domain ? ` · ${t.domain}` : ""} · ${OPS[t.operation]?.plain || ""}</div>
          ${S.defs[t.technique] ? `<p class="pane-note">${esc(S.defs[t.technique])}</p>` : ""}
          ${!t.technique ? `<p class="none">Partial tags don't count toward related scores.</p>`
            : th.length ? `<div class="thumbs">${th.map((x) => `<button class="thumb" data-go="${x.r.id}" data-via="${esc(t.technique)}" title="${esc(x.r.title)}" aria-label="Open ${esc(x.r.title)}, score ${fmt(x.s)}"><span class="t">${tileHTML(x.r, t.technique, t.operation)}</span><span class="sc">${fmt(x.s)}</span></button>`).join("")}</div>`
            : `<p class="none">No other reference uses this yet.</p>`}
        </div></article>`;
    }).join("");
  }

  function renderRanked(ref) {
    const pane = $("#pane-ranked");
    const prev = new Set(S.ranked);
    const list = S.filter ? S.refs.filter((r) => r.tags.some((t) => t.technique === S.filter)).map((r) => ({ r, ...score(ref, r) })) : related(ref);
    S.ranked = list.map((x) => x.r.id);
    const head = S.filter ? `<p class="pane-note">Using <b class="mono">${esc(S.filter)}</b> · ${list.length} references · <button class="settings" id="clear-filter">Clear</button></p>` : `<p class="pane-note">${list.length} related · strongest first</p>`;
    // SPEC §4: links the artist drew are always shown, listed first, never mixed into the score.
    const mine = S.filter ? [] : linksOf(ref).map(({ other }) => `<button class="row" data-go="${other.id}"><span class="t">${plateHTML(other)}</span><span><b>${esc(other.title)}</b><small>your link</small></span><span class="sc">link</span></button>`);
    pane.innerHTML = head + mine.join("") + (list.length ? list.map((x) => {
      const why = x.shared.length ? `shares ${x.shared.join(", ")}` : x.near.length ? `same ${x.near[0]}` : "";
      return `<button class="row${prev.size && !prev.has(x.r.id) ? " is-new" : ""}" data-go="${x.r.id}"><span class="t">${plateHTML(x.r)}</span><span><b>${esc(x.r.title)}</b><small>${esc(why)}</small></span><span class="sc">${x.r.id === ref.id ? "this" : fmt(x.s)}</span></button>`;
    }).join("") : `<p class="none">Nothing shares a technique with this reference yet.</p>`);
    setTimeout(() => pane.querySelectorAll(".is-new").forEach((el) => el.classList.remove("is-new")), 2400);
  }

  const linksOf = (ref) => S.links.filter((l) => l.from === ref.id || l.to === ref.id)
    .map((l) => ({ ...l, other: S.byId.get(l.from === ref.id ? l.to : l.from) })).filter((l) => l.other);
  function renderLinks(ref) {
    const ls = linksOf(ref);
    $("#links-count").textContent = ls.length || "";
    $("#pane-links").innerHTML = ls.length ? ls.map(({ other, why }) =>
      `<div class="link"><button class="row" data-go="${other.id}"><span class="t">${plateHTML(other)}</span><span><b>${esc(other.title)}</b><small>your link</small></span><span></span></button><p class="why">“${esc(why)}”</p></div>`
    ).join("") : `<p class="none">No links drawn from this reference yet.</p>`;
  }

  function renderRecord(ref, tag) {
    const set = (lvl, val) => { const c = $(`.cell[data-level="${lvl}"]`); c.querySelector("[data-v]").textContent = val || ""; return c; };
    $("#ref-id").textContent = ref.id;
    set("ref", ref.title);
    const cells = [["op", tag?.operation], ["domain", tag?.domain], ["tech", tag?.technique]];
    document.querySelector(".record").style.setProperty("--op-text", tag ? opText(tag.operation) : "var(--ink)");
    cells.forEach(([lvl, val], k) => {
      const c = set(lvl, val);
      if (tag) { c.classList.add("is-filling"); setTimeout(() => c.classList.remove("is-filling"), 40 + k * 90); }
    });
  }

  // ---------- leaders: the signature move ----------
  function drawLeaders() {
    const svg = $("#leaders"), work = $(".work").getBoundingClientRect();
    if (getComputedStyle(svg).display === "none") return;
    const ref = S.byId.get(S.focus); if (!ref) return;
    let out = "";
    ref.tags.forEach((t, i) => {
      const box = $(`.box[data-i="${i}"] .num`), call = $(`.call[data-i="${i}"] .num`);
      if (!box || !call) return;
      const a = box.getBoundingClientRect(), b = call.getBoundingClientRect();
      const pane = $("#pane-callouts").getBoundingClientRect();
      if (b.bottom < pane.top || b.top > pane.bottom) return;
      const x1 = a.right - work.left, y1 = a.top + a.height / 2 - work.top;
      const x2 = b.left - work.left - 4, y2 = b.top + b.height / 2 - work.top;
      const dx = (x2 - x1) * 0.5;
      out += `<path data-i="${i}" style="--hot:${opColor(t.operation)}" d="M${x1} ${y1} C${x1 + dx} ${y1} ${x2 - dx} ${y2} ${x2} ${y2}"/>`;
    });
    svg.innerHTML = out;
    if (S.hot != null) hot(S.hot, true);
  }

  function hot(i, keep) {
    S.hot = i;
    const ref = S.byId.get(S.focus); const t = ref?.tags[i];
    const lab = $("#lab"), svg = $("#leaders");
    document.querySelectorAll(".is-hot").forEach((el) => el.classList.remove("is-hot"));
    if (t == null) { lab.classList.remove("has-hover"); svg.classList.remove("has-hover"); renderRecord(ref, S.arrival); return; }
    lab.classList.add("has-hover"); svg.classList.add("has-hover");
    lab.style.setProperty("--hot", opColor(t.operation));
    $(`.box[data-i="${i}"]`)?.classList.add("is-hot");
    $(`.call[data-i="${i}"]`)?.classList.add("is-hot");
    const p = svg.querySelector(`path[data-i="${i}"]`);
    if (p) { p.style.setProperty("--len", Math.ceil(p.getTotalLength())); p.classList.add("is-hot"); }
    if (!keep) renderRecord(ref, t);
  }
  const unhot = () => hot(S.pinned, false);

  // ---------- search by idea (option A) ----------
  function searchTechniques(q) {
    q = q.trim().toLowerCase(); if (!q) return [];
    const counts = new Map();
    for (const r of S.refs) for (const t of r.tags) {
      const e = counts.get(t.technique) || { technique: t.technique, operation: t.operation, n: 0 };
      e.n++; counts.set(t.technique, e);
    }
    const opHit = Object.entries(OPS).filter(([op, o]) => o.plain.toLowerCase().includes(q) || op.toLowerCase().includes(q)).map(([op]) => op);
    const words = q.split(/\s+/).filter((w) => w.length > 3);
    const techs = [...counts.values()].filter((e) => e.technique && (
      e.technique.toLowerCase().includes(q) || opHit.includes(e.operation) ||
      (S.synonyms[e.technique] || []).some((s) => s.toLowerCase().includes(q) || q.includes(s.toLowerCase())) ||
      (words.length && words.every((w) => (S.defs[e.technique] || "").toLowerCase().includes(w)))
    )).sort((a, b) => b.n - a.n).slice(0, 8).map((e) => ({ kind: "t", ...e }));
    // Also match the artist's own words: link notes and reference titles.
    const refs = S.refs.filter((r) => r.title.toLowerCase().includes(q) ||
      S.links.some((l) => (l.from === r.id || l.to === r.id) && l.why.toLowerCase().includes(q))).slice(0, 4).map((r) => ({ kind: "r", r }));
    return [...techs, ...refs];
  }
  let active = 0;
  function renderResults() {
    const q = $("#q").value, ul = $("#q-results"), res = searchTechniques(q), input = $("#q");
    active = 0;
    if (!q.trim()) { ul.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); return; }
    ul.innerHTML = res.length ? res.map((e, k) => e.kind === "t"
      ? `<li role="option" id="opt-${k}" data-t="${esc(e.technique)}" aria-selected="${k === 0}"><span class="sw" style="background:${opColor(e.operation)}"></span><span><b class="serif">${esc(e.technique)}</b><small>${e.operation} · ${OPS[e.operation]?.plain}</small></span><span class="n">${e.n}</span></li>`
      : `<li role="option" id="opt-${k}" data-r="${e.r.id}" aria-selected="${k === 0}"><span class="sw" style="background:var(--ink-3)"></span><span><b class="serif">${esc(e.r.title)}</b><small>reference · matches your words</small></span><span></span></li>`).join("")
      : `<li class="empty" role="option" aria-disabled="true">No technique matches “${esc(q)}”. Try a plain word like “shadow” or “empty space”.</li>`;
    ul.hidden = false; input.setAttribute("aria-expanded", "true");
    if (res.length) input.setAttribute("aria-activedescendant", "opt-0"); else input.removeAttribute("aria-activedescendant");
  }
  function moveActive(d) {
    const opts = [...document.querySelectorAll("#q-results li[id]")]; if (!opts.length) return;
    active = (active + d + opts.length) % opts.length;
    opts.forEach((o, k) => o.setAttribute("aria-selected", k === active));
    $("#q").setAttribute("aria-activedescendant", opts[active].id);
    opts[active].scrollIntoView({ block: "nearest" });
  }
  function choose(li) {
    if (!li) return;
    if (li.dataset.t) applyFilter(li.dataset.t);
    else if (li.dataset.r) { $("#q").value = ""; renderResults(); show(li.dataset.r); }
  }
  function applyFilter(tech) {
    S.filter = tech; $("#q").value = ""; $("#q-results").hidden = true;
    $("#q").setAttribute("aria-expanded", "false"); $("#q").removeAttribute("aria-activedescendant");
    selectPane("ranked"); renderRanked(S.byId.get(S.focus));
  }

  // ---------- panes, theme, value ----------
  function selectPane(name) {
    document.querySelectorAll(".m-tab").forEach((b) => { const on = b.dataset.pane === name; b.classList.toggle("is-on", on); b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
    document.querySelectorAll(".pane").forEach((p) => (p.hidden = p.id !== `pane-${name}`));
    $("#leaders").style.visibility = name === "callouts" ? "visible" : "hidden";
    requestAnimationFrame(drawLeaders);
  }
  function setTheme(t) {
    document.documentElement.dataset.theme = t;
    $("#theme").setAttribute("aria-label", t === "dark" ? "Switch to light theme" : "Switch to dark theme");
    try { localStorage.setItem("horus-theme", t); } catch {}
  }

  // ---------- events ----------
  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]"); if (go) { show(go.dataset.go, { via: go.dataset.via }); return; }
    const pin = e.target.closest(".pin"); if (pin) { const i = +pin.closest(".call").dataset.i; S.pinned = S.pinned === i ? null : i; hot(S.pinned); syncPins(); return; }
    const li = e.target.closest("#q-results li[id]"); if (li) { choose(li); return; }
    if (e.target.id === "clear-filter") { S.filter = null; renderRanked(S.byId.get(S.focus)); return; }
    const tab = e.target.closest(".m-tab"); if (tab) selectPane(tab.dataset.pane);
  });
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest(".call, .box"); if (el) hot(+el.dataset.i);
  });
  document.addEventListener("mouseout", (e) => {
    const el = e.target.closest(".call, .box"); if (el && !el.contains(e.relatedTarget)) unhot();
  });
  document.addEventListener("focusin", (e) => { const el = e.target.closest(".call"); if (el) hot(+el.dataset.i); });
  $("#back").addEventListener("click", () => { const id = S.trail.pop(); if (id) show(id, { push: false }); });
  $("#theme").addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  $("#value").addEventListener("change", (e) => { document.body.classList.toggle("value", e.target.checked); readout(); });
  $("#q").addEventListener("input", renderResults);
  $("#q").addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); moveActive(e.key === "ArrowDown" ? 1 : -1); }
    if (e.key === "Enter") choose($(`#q-results li[aria-selected="true"][id]`));
    if (e.key === "Escape") { $("#q").value = ""; renderResults(); $("#q").blur(); }
  });
  $(".m-tabs").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const tabs = [...document.querySelectorAll(".m-tab")], i = tabs.indexOf(document.activeElement);
    const next = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    next.focus(); selectPane(next.dataset.pane);
  });
  const syncPins = () => document.querySelectorAll(".call").forEach((c) => c.querySelector(".pin")?.setAttribute("aria-pressed", +c.dataset.i === S.pinned));
  document.addEventListener("keydown", (e) => {
    if (e.target.matches("input")) return;
    if (e.key === "/") { e.preventDefault(); $("#q").focus(); }
    else if (e.key === "v") { const c = $("#value"); c.checked = !c.checked; c.dispatchEvent(new Event("change")); }
    else if (e.key === "Escape") { S.pinned = null; hot(null); syncPins(); }
    else if (e.key === "Backspace" || (e.altKey && e.key === "ArrowLeft")) $("#back").click();
    else if (/^[1-9]$/.test(e.key)) { const i = +e.key - 1; if (S.byId.get(S.focus)?.tags[i]) { S.pinned = i; hot(i); syncPins(); } }
  });
  $("#pane-callouts").addEventListener("scroll", () => requestAnimationFrame(drawLeaders), { passive: true });
  new ResizeObserver(() => requestAnimationFrame(drawLeaders)).observe($(".work"));

  let saved = null; try { saved = localStorage.getItem("horus-theme"); } catch {}
  setTheme(saved || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  load();
})();
