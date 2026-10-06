(function () {
"use strict";

// =====================================================================================
// data, models, helpers
// =====================================================================================
const D = JSON.parse(document.getElementById("qb-data").textContent);
const Q = window.QBCore;
const M = Q.makeModels(D);
const pyPct = Q.pyPct, pyFixed = Q.pyFixed, pyComma = Q.pyComma;
const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
const F5 = D.meta.features, INP = D.meta.inputs, N = D.meta.n;
const SEGS = D.meta.segOrder;                       // display order
const segOf = c => D.meta.segNames[String(c)];
const SEG_VAR = { "Families": "--seg-fam", "Premium foodies": "--seg-foo", "Budget students": "--seg-stu" };
const SLOT_VAR = ["--seg-fam", "--seg-foo", "--seg-stu", "--k3", "--k4", "--k5", "--k6", "--k7"];
const SYMBOLS = ["circle", "diamond", "square", "triangle-up", "cross", "star", "pentagon", "hexagon"];
const BUNDLE_NAME = { "Families": "Pizza night", "Premium foodies": "Sushi set", "Budget students": "Wrap combo" };
const FLABEL = { orders_per_month: "Orders per month", avg_order_value: "Avg order value (AED)", avg_items_per_order: "Items per order",
  days_since_last_order: "Days since last order", discount_rate: "Discount use", age: "Age", total_spend: "Total spend (AED)" };
const FSHORT = { orders_per_month: "Orders/month", avg_order_value: "Order value", avg_items_per_order: "Items/order",
  days_since_last_order: "Recency", discount_rate: "Discount use", age: "Age", total_spend: "Total spend", reordered: "Reorder rate" };
const COL = { age: "age", orders_per_month: "opm", avg_order_value: "aov", avg_items_per_order: "items",
  days_since_last_order: "rec", discount_rate: "disc", total_spend: "spend" };
const pretty = s => s.replace(/_/g, " ");
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const segColor = s => css(SEG_VAR[s]);
const slotColor = k => css(SLOT_VAR[k]);
const FONT = "Nunito Sans, Segoe UI, system-ui, sans-serif";
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const sum = a => a.reduce((s, v) => s + v, 0);
const mean = a => a.length ? sum(a) / a.length : NaN;
const aed = (x, d) => "AED " + pyComma(x, d || 0);
const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
function isDarkTheme() { const h = css("--bg").replace("#", ""); if (h.length < 6) return false; const n = parseInt(h.slice(0, 6), 16); return ((n >> 16) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) < 110; }
function paintRange(el) { const mn = +el.min || 0, mx = +el.max || 100, v = +el.value; el.style.setProperty("--pct", ((v - mn) / (mx - mn) * 100) + "%"); }
function paintRanges() { $$('input[type="range"]').forEach(paintRange); }
function schedulePaint() { if (schedulePaint.p) return; schedulePaint.p = requestAnimationFrame(() => { schedulePaint.p = 0; paintRanges(); }); }
document.addEventListener("input", e => { if (e.target && e.target.type === "range") paintRange(e.target); });
const range = (a, b) => { const r = []; for (let i = a; i <= b; i++) r.push(i); return r; };
const ICON_OK = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6.5l2.5 2.5L10 3.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_WARN = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.5L11 10.5H1z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 5v2.5M6 9v.01" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';

const dn = D.diners;
const dinerSeg = dn.seg.map(segOf);
const monthly = dn.opm.map((v, i) => v * dn.aov[i]);
const profiles = range(0, N - 1).map(i => M.dinerProfile(i));
const scoreAll = profiles.map(p => M.prob(p));
const ITEMS = D.baskets.items;
const BASKETS = D.baskets.list.map(l => new Set(l));
const B_SEG = D.baskets.diner.map(i => dinerSeg[i]);

// verification against scikit-learn (shown in learn mode on the model page)
let maxDiff = 0, segMismatch = 0;
for (let i = 0; i < N; i++) {
  maxDiff = Math.max(maxDiff, Math.abs(scoreAll[i] - D.check.pSklearn[i]));
  if (M.segment(profiles[i]).cluster !== D.check.segSklearn[i]) segMismatch++;
}

// ---------- churn clock (F2) ----------
const BANDS = [[0, 5], [6, 8], [9, 11], [12, 14], [15, 18], [19, 999]];
const bandLabel = (a, b) => b < 999 ? `${a}–${b}` : `${a}+`;
const MIN_N = 5;
function clockFor(seg) {
  const idx = range(0, N - 1).filter(i => dinerSeg[i] === seg);
  let trigger = null;
  const rows = BANDS.map(([a, b]) => {
    const s = idx.filter(i => dn.rec[i] >= a && dn.rec[i] <= b);
    const n = s.length, rate = n ? sum(s.map(i => dn.y[i])) / n : null;
    const shown = n >= MIN_N;
    if (shown && trigger === null && rate <= 0.5) trigger = a;
    return { label: bandLabel(a, b), a, b, n, rate, shown };
  });
  const maxRec = Math.max(...idx.map(i => dn.rec[i]));
  const days = range(0, Math.max(...dn.rec)).map(d => {
    const s = idx.filter(i => dn.rec[i] === d);
    return { d, n: s.length, rate: s.length ? sum(s.map(i => dn.y[i])) / s.length : null };
  });
  return { rows, trigger, maxRec, days, n: idx.length };
}
const CLOCK = {};
SEGS.forEach(s => { CLOCK[s] = clockFor(s); });

// ---------- basket helpers ----------
function basketsFor(scope) {
  const out = [];
  for (let b = 0; b < BASKETS.length; b++) if (scope === "Overall" || B_SEG[b] === scope) out.push(BASKETS[b]);
  return out;
}
const SCOPE_BASKETS = { Overall: basketsFor("Overall") };
SEGS.forEach(s => { SCOPE_BASKETS[s] = basketsFor(s); });
function ruleStats(scope, a, c) {
  const bs = SCOPE_BASKETS[scope]; let nA = 0, nC = 0, nAC = 0;
  for (const b of bs) {
    const hasA = a.every(i => b.has(i)), hasC = c.every(i => b.has(i));
    if (hasA) nA++; if (hasC) nC++; if (hasA && hasC) nAC++;
  }
  const n = bs.length, conf = nA ? nAC / nA : null, base = nC / n;
  return { n, nA, nC, nAC, conf, base, lift: (nA && nC) ? conf / base : null };
}
function itemShares(filterFn) {
  const counts = new Array(ITEMS.length).fill(0); let n = 0;
  for (let b = 0; b < BASKETS.length; b++) {
    if (!filterFn(D.baskets.diner[b])) continue;
    n++; BASKETS[b].forEach(i => counts[i]++);
  }
  return counts.map((c, i) => ({ item: ITEMS[i], share: n ? c / n : 0, count: c })).filter(d => d.count > 0)
    .sort((x, y) => (y.share - x.share) || (x.item < y.item ? -1 : 1));
}

// =====================================================================================
// state (remembered per viewer)
// =====================================================================================
const KEY = "quickbite-dashboard-v2";
const DEFAULT = {
  tab: "overview", learn: true,
  pred: { age: 28, orders_per_month: 8, avg_order_value: 90, avg_items_per_order: 3, days_since_last_order: 10,
          discount_rate: 0.3, total_spend: 800, thr: 0.5, detail: "drivers", whatif: "days_since_last_order" },
  seg: { k: 3, view: "pca2", prof: "heat", box: "orders_per_month", fx: "orders_per_month", fy: "avg_order_value" },
  rules: { scope: "Overall", ms: 0.02, mc: 0, ml: 1, dedup: true, rank: "lift", item: "", sel: "", heat: "lift" },
  model: { m: "lrb", ts: 0.25, thr: 0.5, voucher: 20, lost: 700, view: "split" },
  risk: { segs: SEGS.slice(), thr: 0.5, rec: 0, sort: "var", q: "", all: false },
  deep: { sub: "f1", cut: 11, clock: "bands", drop: "days_since_last_order" },
};
function mergeDefaults(def, saved) {
  if (saved === null || typeof saved !== "object" || Array.isArray(def)) return (Array.isArray(def) && Array.isArray(saved)) ? saved : (saved !== undefined && typeof saved === typeof def ? saved : def);
  const out = {};
  for (const k of Object.keys(def)) {
    const dv = def[k], sv = saved[k];
    if (dv && typeof dv === "object" && !Array.isArray(dv)) out[k] = mergeDefaults(dv, sv || {});
    else if (Array.isArray(dv)) out[k] = Array.isArray(sv) ? sv : dv.slice();
    else out[k] = (sv !== undefined && typeof sv === typeof dv) ? sv : dv;
  }
  return out;
}
let ST;
try { ST = mergeDefaults(DEFAULT, JSON.parse(localStorage.getItem(KEY) || "{}")); }
catch (e) { ST = JSON.parse(JSON.stringify(DEFAULT)); }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) { /* storage unavailable */ } }, 150);
}

// =====================================================================================
// charts
// =====================================================================================
const HAS_PLOTLY = typeof window.Plotly !== "undefined";
function isObj(o) { return o && typeof o === "object" && !Array.isArray(o); }
function deepMerge(a, b) {
  const out = Object.assign({}, a);
  for (const k of Object.keys(b || {})) out[k] = (isObj(a[k]) && isObj(b[k])) ? deepMerge(a[k], b[k]) : b[k];
  return out;
}
function axisBase() {
  return { gridcolor: css("--grid"), linecolor: css("--line"), zerolinecolor: css("--line"), zeroline: false, showline: false,
    tickfont: { color: css("--muted"), size: 11, family: FONT }, title: { font: { color: css("--ink-2"), size: 12, family: FONT }, standoff: 8 },
    automargin: true, fixedrange: true };
}
function baseLayout() {
  return {
    paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)",
    font: { family: FONT, size: 12, color: css("--ink-2") },
    margin: { l: 8, r: 14, t: 10, b: 8, pad: 2 },
    xaxis: axisBase(), yaxis: axisBase(),
    hoverlabel: { bgcolor: css("--surface"), bordercolor: css("--line"), font: { color: css("--ink"), family: FONT, size: 13 }, align: "left" },
    legend: { orientation: "h", x: 0, y: 1.02, yanchor: "bottom", font: { color: css("--ink-2"), size: 12 }, bgcolor: "rgba(0,0,0,0)" },
    showlegend: false, hovermode: "closest", dragmode: false, bargap: 0.25,
  };
}
function plot(id, data, layout, cfg) {
  const el = document.getElementById(id);
  if (!el || el.offsetParent === null) return;
  if (!HAS_PLOTLY) {
    el.innerHTML = '<div class="chart-fallback">The charting library could not load, so charts are hidden. All numbers on this page are still correct.</div>';
    return;
  }
  const L = deepMerge(baseLayout(), layout || {});
  for (const k of Object.keys(L)) if (/^[xy]axis\d*$/.test(k) && k.length > 5) L[k] = deepMerge(axisBase(), L[k]);
  Plotly.react(el, data, L, Object.assign({ displaylogo: false, responsive: true, displayModeBar: false }, cfg || {}));
}
const hline = (y, color, dash) => ({ type: "line", xref: "paper", x0: 0, x1: 1, y0: y, y1: y, line: { color, width: 1.5, dash: dash || "dash" } });
const vline = (x, color, dash, w) => ({ type: "line", yref: "paper", y0: 0, y1: 1, x0: x, x1: x, line: { color, width: w || 1.5, dash: dash || "dash" } });

// =====================================================================================
// downloads (artifact capability) + toast
// =====================================================================================
let DL = null;
function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 2600);
}
function toCSV(rows) {
  const q = v => { const s = v === null || v === undefined ? "" : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return rows.map(r => r.map(q).join(",")).join("\n") + "\n";
}
async function saveCSV(filename, rows) {
  if (!DL) return;
  try {
    const r = await DL.save({ filename, data: toCSV(rows) });
    toast(r && r.status === "delivered" ? "Sent " + filename : "Saved " + filename);
  } catch (e) {
    const code = e && e.code;
    if (code === "declined") return;
    if (code === "rate_limited") toast("A save is already waiting for your answer");
    else { toast("Downloads aren't available in this view"); $$(".hidden-dl").forEach(b => { b.hidden = true; }); }
  }
}
(async () => {
  try { if (window.claude && typeof window.claude.use === "function") DL = await window.claude.use("downloads"); }
  catch (e) { DL = null; }
  $$(".hidden-dl").forEach(b => { b.hidden = !DL; });
})();

// =====================================================================================
// tabs & learn mode
// =====================================================================================
const PAGES = ["overview", "predictor", "segments", "rules", "model", "atrisk", "findings", "takeaways"];
const RENDER = {};
function showTab(t, push) {
  if (!PAGES.includes(t)) t = "overview";
  ST.tab = t; save();
  PAGES.forEach(p => {
    $("#page-" + p).hidden = p !== t;
    $("#tab-" + p).setAttribute("aria-selected", String(p === t));
    $("#tab-" + p).tabIndex = p === t ? 0 : -1;
  });
  if (push) { try { history.replaceState(null, "", "#" + t); } catch (e) { /* sandboxed */ } }
  RENDER[t](); paintRanges();
  const tabEl = $("#tab-" + t);
  if (tabEl.scrollIntoView && window.innerWidth < 760) { try { tabEl.scrollIntoView({ block: "nearest", inline: "center" }); } catch (e) { /* ignore */ } }
}
$$(".tab").forEach(b => b.addEventListener("click", () => { showTab(b.dataset.tab, true); window.scrollTo({ top: 0 }); }));
$(".tabs").addEventListener("keydown", e => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const i = PAGES.indexOf(ST.tab), j = (i + (e.key === "ArrowRight" ? 1 : -1) + PAGES.length) % PAGES.length;
  showTab(PAGES[j], true); $("#tab-" + PAGES[j]).focus();
});
function applyLearn() {
  document.body.classList.toggle("learning", ST.learn);
  $("#learnToggle").setAttribute("aria-checked", String(ST.learn));
}
$("#learnToggle").addEventListener("click", () => { ST.learn = !ST.learn; applyLearn(); save(); RENDER[ST.tab](); });

function segBtns(el, options, current, onPick) {
  el.innerHTML = options.map(o => `<button type="button" data-v="${esc(o.v)}" aria-pressed="${String(o.v) === String(current)}">${esc(o.label)}</button>`).join("");
  $$("button", el).forEach(b => b.addEventListener("click", () => onPick(b.dataset.v)));
}
function subTabs(el, current, onPick) {
  $$(".subtab", el).forEach(b => {
    b.setAttribute("aria-selected", String(b.dataset.sub === current));
    b.onclick = () => onPick(b.dataset.sub);
  });
}
function statTiles(el, tiles) {
  el.innerHTML = tiles.map(t => `<div class="stat"><span class="lab">${t.lab}</span><span class="big">${t.big}</span>${t.note ? `<span class="note">${t.note}</span>` : ""}</div>`).join("");
}
const segSwatch = s => `<span class="swatch" style="background:var(${SEG_VAR[s]})"></span>`;
const pill = (cls, txt, icon) => `<span class="pill ${cls}">${icon || ""}${txt}</span>`;

// =====================================================================================
// shared numbers
// =====================================================================================
function runKey(m, ts) { return `${m}|${Number(ts).toFixed(2)}`; }
function evalRun(m, ts, thr, voucher, lost) {
  const r = D.models.runs[runKey(m, ts)];
  const y = r.test.map(i => dn.y[i]);
  let caught = 0, missed = 0, fa = 0, tp = 0;
  r.p.forEach((p, k) => {
    const predReorder = p > thr;
    if (y[k] === 0) { if (predReorder) missed++; else caught++; }
    else { if (predReorder) tp++; else fa++; }
  });
  const n = y.length, churners = caught + missed;
  return { r, y, caught, missed, fa, tp, n, churners, acc: (caught + tp) / n, base: (tp + fa) / n,
    cost: missed * lost + fa * voucher, auc: Q.aucScore(y, r.p) };
}
const SEG_STATS = {};
SEGS.forEach(s => {
  const idx = range(0, N - 1).filter(i => dinerSeg[i] === s);
  const ch = idx.filter(i => dn.y[i] === 0), re = idx.filter(i => dn.y[i] === 1);
  SEG_STATS[s] = {
    idx, n: idx.length, reorder: mean(idx.map(i => dn.y[i])),
    opm: mean(idx.map(i => dn.opm[i])), aov: mean(idx.map(i => dn.aov[i])), items: mean(idx.map(i => dn.items[i])),
    rec: mean(idx.map(i => dn.rec[i])), disc: mean(idx.map(i => dn.disc[i])), age: mean(idx.map(i => dn.age[i])),
    spend: mean(idx.map(i => dn.spend[i])),
    kept: sum(re.map(i => monthly[i])), lost: sum(ch.map(i => monthly[i])), churners: ch.length,
    discRe: mean(re.map(i => dn.disc[i])), discCh: mean(ch.map(i => dn.disc[i])),
    discAuc: (ch.length && re.length) ? Q.aucScore(idx.map(i => dn.y[i]), idx.map(i => dn.disc[i])) : null,
    top: itemShares(d => dinerSeg[d] === s),
  };
});

// =====================================================================================
// OVERVIEW
// =====================================================================================
RENDER.overview = function () {
  const ev = evalRun("lrb", 0.25, 0.5, 20, 700);
  const sil3 = D.kscan.find(k => k.k === 3).sil;
  statTiles($("#ov-stats"), [
    { lab: "Diners", big: pyComma(N), note: `${pyComma(D.meta.nBaskets)} baskets in orders.csv` },
    { lab: "Reorder rate", big: pyPct(mean(dn.y), 1), note: `${sum(dn.y)} reordered, ${N - sum(dn.y)} churned` },
    { lab: "Segments", big: "3", note: `silhouette ${pyFixed(sil3, 3)}, best of k = 2–10` },
    { lab: "Reorder model", big: pyPct(ev.acc, 1), note: `test accuracy vs ${pyPct(ev.base, 1)} baseline` },
    { lab: "Churners caught", big: `${ev.caught} of ${ev.churners}`, note: "in the 25% test set" },
  ]);
  $("#ov-segcards").innerHTML = SEGS.map(s => {
    const st = SEG_STATS[s], T = CLOCK[s].trigger;
    return `<article class="seg-card">
      <div class="top"><h2 class="seg-name" style="font-size:19px">${segSwatch(s)}${s}</h2><span class="small muted num">${st.n} diners · ${pyPct(st.n / N, 0)}</span></div>
      <dl>
        <dt>Orders per month</dt><dd>${pyFixed(st.opm, 1)}</dd>
        <dt>Average order</dt><dd>${aed(st.aov)}</dd>
        <dt>Items per order</dt><dd>${pyFixed(st.items, 1)}</dd>
        <dt>Days since last order</dt><dd>${pyFixed(st.rec, 1)}</dd>
        <dt>Discount use</dt><dd>${pyPct(st.disc, 0)}</dd>
        <dt>Reorder rate</dt><dd>${pyPct(st.reorder, 1)}</dd>
        <dt>Win-back offer</dt><dd>${T === null ? "not needed" : "by day " + T}</dd>
      </dl>
      <p class="small"><span class="muted">Top items:</span> ${st.top.slice(0, 4).map(d => `${pretty(d.item)} ${pyPct(d.share, 0)}`).join(", ")}</p>
    </article>`;
  }).join("");
  const segs = SEGS.slice().reverse();
  plot("ov-value", [
    { type: "bar", orientation: "h", name: "Kept (reorderers)", y: segs, x: segs.map(s => SEG_STATS[s].kept), marker: { color: css("--yes") },
      customdata: segs.map(s => [SEG_STATS[s].n - SEG_STATS[s].churners]), hovertemplate: "%{y}<br>Kept: AED %{x:,.0f} per month<br>%{customdata[0]} reorderers<extra></extra>" },
    { type: "bar", orientation: "h", name: "Lost (churners)", y: segs, x: segs.map(s => SEG_STATS[s].lost), marker: { color: css("--warn") },
      customdata: segs.map(s => [SEG_STATS[s].churners]), hovertemplate: "%{y}<br>Lost: AED %{x:,.0f} per month<br>%{customdata[0]} churners<extra></extra>" },
  ], { barmode: "stack", showlegend: true, legend: { traceorder: "normal" }, xaxis: { title: { text: "AED per month" }, tickformat: ",.0f" }, yaxis: { ticksuffix: "  " },
       annotations: segs.map(s => ({ x: SEG_STATS[s].kept + SEG_STATS[s].lost, y: s, text: aed(SEG_STATS[s].lost) + " lost", xanchor: "left", showarrow: false, xshift: 6, font: { size: 12, color: css("--ink-2") } })) ,
       margin: { r: 120 } });
  clockChart("ov-clock", "bands");
};

function clockChart(id, mode) {
  const traces = [];
  if (mode === "bands") {
    const x = BANDS.map(([a, b]) => bandLabel(a, b));
    SEGS.forEach(s => {
      const rows = CLOCK[s].rows;
      traces.push({ type: "scatter", mode: "lines+markers", name: s, x, y: rows.map(r => r.shown ? r.rate : null),
        line: { color: segColor(s), width: 2.5 }, marker: { size: 9, color: segColor(s), line: { color: css("--surface"), width: 2 } },
        customdata: rows.map(r => [r.n, r.rate === null ? "—" : pyPct(r.rate, 1)]), connectgaps: false,
        hovertemplate: `${s}<br>%{x} days: %{customdata[1]} reorder<br>%{customdata[0]} diners<extra></extra>` });
    });
    plot(id, traces, { showlegend: true, shapes: [hline(0.5, css("--warn"))], hovermode: "closest",
      yaxis: { tickformat: ".0%", range: [0, 1.05], title: { text: "reorder rate" } }, xaxis: { title: { text: "days since last order" }, type: "category" } });
  } else {
    SEGS.forEach(s => {
      const days = CLOCK[s].days.filter(d => d.n > 0);
      traces.push({ type: "scatter", mode: "markers", name: s, x: days.map(d => d.d), y: days.map(d => d.rate),
        marker: { color: segColor(s), size: days.map(d => 6 + 2.2 * Math.sqrt(d.n)), opacity: days.map(d => d.n >= MIN_N ? 0.9 : 0.35), line: { color: css("--surface"), width: 1.5 } },
        customdata: days.map(d => [d.n, pyPct(d.rate, 1)]),
        hovertemplate: `${s}<br>day %{x}: %{customdata[1]} reorder<br>%{customdata[0]} diners<extra></extra>` });
      const solid = days.filter(d => d.n >= MIN_N);
      traces.push({ type: "scatter", mode: "lines", x: solid.map(d => d.d), y: solid.map(d => d.rate), line: { color: segColor(s), width: 1.5 }, hoverinfo: "skip", showlegend: false });
    });
    plot(id, traces, { showlegend: true, shapes: [hline(0.5, css("--warn"))],
      yaxis: { tickformat: ".0%", range: [-0.05, 1.08], title: { text: "reorder rate" } }, xaxis: { title: { text: "days since last order" }, dtick: 2 } });
  }
}

// =====================================================================================
// PREDICTOR
// =====================================================================================
const PRED_INPUTS = [
  ["in-age", "age", v => String(v)], ["in-opm", "orders_per_month", v => String(v)], ["in-aov", "avg_order_value", v => String(v)],
  ["in-items", "avg_items_per_order", v => String(v)], ["in-rec", "days_since_last_order", v => String(v)],
  ["in-disc", "discount_rate", v => pyPct(v, 0)], ["in-thr", "thr", v => pyPct(v, 0)],
];
const OUT_ID = { "in-age": "out-age", "in-opm": "out-opm", "in-aov": "out-aov", "in-items": "out-items", "in-rec": "out-rec", "in-disc": "out-disc", "in-thr": "out-thr" };
function profileFromState() {
  const p = {}; INP.forEach(f => { p[f] = ST.pred[f]; }); return p;
}
function syncPredInputs() {
  PRED_INPUTS.forEach(([id, key, fmt]) => { $("#" + id).value = ST.pred[key]; $("#" + OUT_ID[id]).textContent = fmt(ST.pred[key]); });
  $("#in-spend").value = ST.pred.total_spend;
}
function initPredictor() {
  const row = $("#pred-personas");
  D.personas.forEach((p, k) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.dataset.k = k;
    b.innerHTML = `${segSwatch(p.skSeg)}${esc(p.name)}`;
    b.addEventListener("click", () => { Object.assign(ST.pred, p.p); syncPredInputs(); save(); RENDER.predictor(); });
    row.appendChild(b);
  });
  PRED_INPUTS.forEach(([id, key, fmt]) => {
    $("#" + id).addEventListener("input", e => {
      ST.pred[key] = Number(e.target.value); $("#" + OUT_ID[id]).textContent = fmt(ST.pred[key]); save(); RENDER.predictor();
    });
  });
  $("#in-spend").addEventListener("input", e => {
    const v = Number(e.target.value); if (!isFinite(v) || e.target.value === "") return;
    ST.pred.total_spend = Math.min(20000, Math.max(50, v)); save(); RENDER.predictor();
  });
  syncPredInputs();
}

function nextAction(seg, p, thr, rec) {
  const T = CLOCK[seg].trigger, bn = BUNDLE_NAME[seg], items = D.bundles[seg].items.map(pretty).join(" + ");
  const offer = `the ${bn} (${items})`;
  if (T === null) {
    return p > thr ? `No voucher needed. Feature ${offer} in the app; students reorder almost regardless.`
                   : `Unusual for a student. Send a small offer on ${offer} now and check the account details.`;
  }
  if (p <= thr) {
    if (rec > T) return `Send the win-back offer on ${offer} today. They are ${rec - T} day${rec - T === 1 ? "" : "s"} past the day-${T} trigger.`;
    if (rec === T) return `Send the win-back offer on ${offer} today. Today is the day-${T} trigger.`;
    return `Schedule the win-back offer on ${offer} for day ${T}, ${T - rec} day${T - rec === 1 ? "" : "s"} from now, unless they order first.`;
  }
  if (rec >= T) return `Likely to reorder, but already at or past the day-${T} trigger. A light reminder about ${offer} is enough; no discount.`;
  return `On track. Suggest ${offer} at full price on their next order.`;
}

function renderTracker(seg, rec) {
  const cl = CLOCK[seg], T = cl.trigger, noTrig = T === null, goal = noTrig ? cl.maxRec : T;
  const far = Math.max(goal, rec);
  const end = far + Math.max(2, Math.round(far * 0.15));
  const pos = v => (Math.min(v, end) / end * 100);
  let status, cls, color;
  if (noTrig) {
    if (rec > goal) { status = `Beyond the longest student gap (day ${goal})`; cls = "mid"; color = css("--accent"); }
    else { status = "On track: no win-back day for students"; cls = "yes"; color = css("--yes"); }
  } else if (rec > T) { status = `Slipping: ${rec - T} day${rec - T === 1 ? "" : "s"} past the win-back day`; cls = "no"; color = css("--warn"); }
  else if (rec === T) { status = "Due today: this is the win-back day"; cls = "no"; color = css("--warn"); }
  else if (rec >= 0.6 * T) { status = `Due soon: ${T - rec} day${T - rec === 1 ? "" : "s"} to the win-back day`; cls = "mid"; color = css("--accent"); }
  else { status = `On track: ${T - rec} days to the win-back day`; cls = "yes"; color = css("--yes"); }
  $("#tr-status").innerHTML = pill(cls, status, cls === "no" ? ICON_WARN : (cls === "yes" ? ICON_OK : ""));
  const step = end > 40 ? 5 : (end > 20 ? 2 : 1);
  let ticks = "";
  for (let d = step; d < end; d += step) ticks += `<span class="tr-tick" style="left:${pos(d)}%"></span>`;
  $("#tr-route").innerHTML = `
    <span class="tr-rail"></span>
    ${noTrig ? "" : `<span class="tr-over" style="left:${pos(goal)}%;right:0"></span>`}
    ${ticks}
    <span class="tr-fill" style="width:${pos(rec)}%;background:${color}"></span>
    <span class="tr-stop" style="left:0%"></span>
    <span class="tr-stop ${noTrig ? "" : "goal"}" style="left:${pos(goal)}%"></span>
    <span class="tr-now" style="left:${pos(rec)}%"><span class="tag num">Day ${rec}</span><span class="pin"></span><span class="dot" style="background:${color}"></span></span>`;
  const gp = pos(goal);
  const gcls = gp > 82 ? "right" : "";
  $("#tr-labels").innerHTML = (gp > 28 ? `<span class="left" style="left:0"><b>Last order</b>day 0</span>` : `<span class="left" style="left:0"><b>Day 0</b></span>`) +
    (gp > 18 ? `<span class="${gcls}" style="left:${gp}%"><b>${noTrig ? "Longest student gap" : "Win-back offer"}</b>${noTrig ? "" : "by "}day ${goal}</span>` :
               `<span class="left" style="left:${gp}%;transform:translateX(-8px)"><b>${noTrig ? "Longest gap" : "Win-back"}</b>day ${goal}</span>`);
  if (noTrig) {
    $("#tr-note").textContent = `Budget students keep reordering through day ${cl.maxRec}, the longest gap in the data, so their churn clock never reaches 50%.`;
  } else {
    const band = cl.rows.find(r => r.a === T);
    $("#tr-note").textContent = `From the ${seg} churn clock: in the ${band.label} day band only ${pyPct(band.rate, 1)} of ${seg.toLowerCase()} reordered (${band.n} diners), the first band at or below 50%.`;
  }
}

function renderPredictor() {
  schedulePaint();
  const prof = profileFromState(), thr = ST.pred.thr;
  const sg = M.segment(prof), seg = sg.name, p = M.prob(prof), rec = prof.days_since_last_order;
  // personas highlight
  $$("#pred-personas .chip").forEach(b => {
    const pp = D.personas[+b.dataset.k].p;
    b.setAttribute("aria-pressed", String(INP.every(f => pp[f] === prof[f])));
  });
  $("#pr-seg").innerHTML = `${segSwatch(seg)}${seg}`;
  const order = sg.dists.map((d, c) => ({ c, d })).sort((a, b) => a.d - b.d);
  $("#pr-seg-why").textContent = `Closest to the ${segOf(order[0].c)} centre (distance ${pyFixed(order[0].d, 2)}); next is ${segOf(order[1].c)} (${pyFixed(order[1].d, 2)}).`;
  $("#pr-prob").textContent = pyPct(p, 0);
  $("#pr-verdict").innerHTML = p > thr ? pill("yes", "Will reorder", ICON_OK) : pill("no", "At risk", ICON_WARN);
  const gap = Math.round(Math.abs(p - thr) * 100);
  $("#pr-prob-note").textContent = `${gap} point${gap === 1 ? "" : "s"} ${p > thr ? "above" : "below"} the ${pyPct(thr, 0)} at-risk threshold. Exact: ${pyFixed(p, 4)}.`;
  $("#pr-action").textContent = nextAction(seg, p, thr, rec);
  renderTracker(seg, rec);
  const bundle = D.bundles[seg];
  $("#pr-reco").innerHTML = (D.meta.reco[seg] || []).map(it => `<span class="item ${bundle.items.includes(it) ? "in-bundle" : ""}">${pretty(it)}</span>`).join("");
  const br = bundle.rule;
  $("#pr-bundle").innerHTML = `<div class="grid" style="gap:6px"><div class="items">${bundle.items.map(it => `<span class="item in-bundle">${pretty(it)}</span>`).join("")}</div>
    <p class="small"><b>${BUNDLE_NAME[seg]}.</b> ${pyPct(br.conf, 0)} of ${seg.toLowerCase()} baskets with ${br.a.map(pretty).join(" + ")} also had ${br.c.map(pretty).join(" + ")}, ${pyFixed(br.lift, 1)}× more than chance within the segment.</p></div>`;
  subTabs($("#pr-subtabs"), ST.pred.detail, v => { ST.pred.detail = v; save(); renderPredictor(); });
  renderPredDetail(prof, sg, p);
}
RENDER.predictor = renderPredictor;

function renderPredDetail(prof, sg, p) {
  const host = $("#pr-detail"), det = ST.pred.detail, thr = ST.pred.thr;
  if (det === "drivers") {
    host.innerHTML = `<div class="chart" id="pd-drv"></div><p class="detail-note" id="pd-drv-note"></p>
      <div class="learn"><p>Logistic regression adds up evidence on a "log-odds" scale. Each bar is one input's push: its weight × how far this diner is from the average diner (in standard deviations). Bars to the right raise the reorder chance; bars to the left lower it. The total is turned into a probability with the S-shaped logistic curve.</p></div>`;
    const con = M.contributions(prof).sort((a, b) => Math.abs(a.c) - Math.abs(b.c));
    const lg = M.logit(prof);
    plot("pd-drv", [{ type: "bar", orientation: "h", y: con.map(c => FLABEL[c.f]), x: con.map(c => c.c),
      marker: { color: con.map(c => c.c >= 0 ? css("--yes") : css("--warn")) },
      customdata: con.map(c => [prof[c.f], pyFixed(c.z, 2), pyFixed(c.w, 3), pyFixed(c.c, 2)]),
      hovertemplate: "%{y}: %{customdata[0]}<br>%{customdata[1]} SD from average × weight %{customdata[2]}<br>= %{customdata[3]} log-odds<extra></extra>" }],
      { xaxis: { title: { text: "← lowers chance · raises chance →" }, zeroline: true, zerolinecolor: css("--muted") }, yaxis: { ticksuffix: "  " } });
    $("#pd-drv-note").textContent = `Starting point ${pyFixed(D.model.clf.intercept, 2)} + the bars (${pyFixed(lg - D.model.clf.intercept, 2)}) = ${pyFixed(lg, 2)} log-odds, which is a ${pyPct(p, 1)} reorder chance.`;
  } else if (det === "why") {
    host.innerHTML = `<div class="grid-2"><div><h3>Distance to each segment centre</h3><div class="chart short" id="pd-dist"></div></div>
      <div><h3>This diner vs the segment centres</h3><div class="chart short" id="pd-z"></div></div></div>
      <div class="learn"><p>K-Means assigns a diner to the nearest centre, measured in standardised units across the five behaviour features. Age and total spend don't affect the segment. On the right, the black dot is this diner and the coloured marks are the three centres.</p></div>`;
    const segs = SEGS.slice();
    const dists = segs.map(s => sg.dists[+Object.keys(D.meta.segNames).find(k => D.meta.segNames[k] === s)]);
    plot("pd-dist", [{ type: "bar", orientation: "h", y: segs, x: dists, marker: { color: segs.map(segColor) },
      text: dists.map(d => pyFixed(d, 2)), textposition: "outside", cliponaxis: false, textfont: { color: css("--ink-2") },
      hovertemplate: "%{y}: distance %{text}<extra></extra>" }],
      { xaxis: { title: { text: "distance (standardised units); shorter = closer" }, rangemode: "tozero" }, yaxis: { ticksuffix: "  " }, margin: { r: 40 } });
    const traces = SEGS.map(s => {
      const c = D.model.centers[+Object.keys(D.meta.segNames).find(k => D.meta.segNames[k] === s)];
      return { type: "scatter", mode: "markers", name: s + " centre", x: c, y: F5.map(f => FSHORT[f]),
        marker: { symbol: "line-ns-open", size: 18, color: segColor(s), line: { width: 3, color: segColor(s) } },
        hovertemplate: `${s} centre<br>%{y}: %{x:.2f} SD<extra></extra>` };
    });
    traces.push({ type: "scatter", mode: "markers", name: "This diner", x: sg.z, y: F5.map(f => FSHORT[f]),
      marker: { size: 12, color: css("--ink"), line: { color: css("--surface"), width: 2 } },
      customdata: F5.map(f => prof[f]), hovertemplate: "This diner<br>%{y}: %{customdata} (%{x:.2f} SD)<extra></extra>" });
    plot("pd-z", traces, { showlegend: true, xaxis: { title: { text: "standard deviations from the average diner" }, zeroline: true, zerolinecolor: css("--muted") }, yaxis: { ticksuffix: "  " } });
  } else if (det === "map") {
    host.innerHTML = `<div class="chart tall" id="pd-map"></div><p class="detail-note">Every dot is one of the 480 diners, placed on a 2-D map of the five behaviour features (PCA). The ringed point is the profile above. Drag to zoom, double-click to reset.</p>`;
    const C = D.pca.coords, traces = [];
    SEGS.forEach(s => {
      const idx = range(0, N - 1).filter(i => dinerSeg[i] === s);
      traces.push({ type: "scattergl", mode: "markers", name: s, x: idx.map(i => C[i][0]), y: idx.map(i => C[i][1]),
        marker: { color: segColor(s), size: 6, opacity: 0.45 }, text: idx.map(i => dn.id[i]), hovertemplate: `%{text} · ${s}<extra></extra>` });
    });
    const pp = M.pcaProject(sg.z);
    traces.push({ type: "scatter", mode: "markers+text", name: "This diner", x: [pp[0]], y: [pp[1]], text: ["This diner"], textposition: "top center",
      textfont: { color: css("--ink"), size: 13 }, marker: { size: 18, color: segColor(sg.name), line: { color: css("--ink"), width: 3 } },
      hovertemplate: `This diner · ${sg.name}<extra></extra>` });
    const ev = D.pca.evr;
    plot("pd-map", traces, { showlegend: true, dragmode: "zoom", xaxis: { fixedrange: false, title: { text: `PC1 (${pyPct(ev[0], 0)} of variation)` } },
      yaxis: { fixedrange: false, title: { text: `PC2 (${pyPct(ev[1], 0)})` } } });
  } else if (det === "whatif") {
    host.innerHTML = `<div class="inline-ctl"><label class="small" for="pd-wf" style="font-weight:700">Vary</label><select id="pd-wf">${INP.map(f => `<option value="${f}" ${f === ST.pred.whatif ? "selected" : ""}>${FLABEL[f]}</option>`).join("")}</select><span class="small muted">All other inputs stay as set above.</span></div>
      <div class="chart" id="pd-wf-chart"></div><p class="detail-note" id="pd-wf-note"></p>
      <div class="learn"><p>The curve shows the reorder chance if only this one input changed. Its colour shows which segment the diner would fall into, so where the colour changes, the segment does too. The red dashed line is the at-risk threshold; the orange diamond marks where the verdict flips.</p></div>`;
    $("#pd-wf").addEventListener("change", e => { ST.pred.whatif = e.target.value; save(); renderPredDetail(prof, sg, p); });
    whatIf(prof, thr);
  } else {
    host.innerHTML = `<div class="bundle-cards">${SEGS.map(s => {
      const b = D.bundles[s], r = b.rule, sh = SEG_STATS[s].top;
      return `<article class="bundle-card ${s === sg.name ? "current" : ""}"><h3>${segSwatch(s)}${s}${s === sg.name ? ' <span class="pill mid" style="margin-left:auto">this diner</span>' : ""}</h3>
        <div class="kicker" style="font-size:16px">${BUNDLE_NAME[s]}</div>
        <div class="items">${b.items.map(it => `<span class="item in-bundle">${pretty(it)}</span>`).join("")}</div>
        <p class="small">${r.a.map(pretty).join(" + ")} → ${r.c.map(pretty).join(" + ")}: confidence ${pyPct(r.conf, 1)}, lift ${pyFixed(r.lift, 2)}, in ${pyPct(r.s, 1)} of the segment's baskets.</p>
        <p class="small muted">Most-ordered: ${sh.slice(0, 5).map(d => `${pretty(d.item)} ${pyPct(d.share, 0)}`).join(" · ")}</p></article>`;
    }).join("")}</div>
    <div class="learn"><p>Each bundle is the strongest rule <i>inside</i> that segment among item sets that appear in at least 10% of the segment's baskets. Recommended items are the segment's five most-ordered items, the same list the app shows.</p></div>`;
  }
}

const WF_RANGE = { age: [18, 70], orders_per_month: [1, 20], avg_order_value: [15, 250], avg_items_per_order: [1, 10],
  days_since_last_order: [0, 60], discount_rate: [0, 1], total_spend: [50, 3000] };
function whatIf(prof, thr) {
  const f = ST.pred.whatif, [lo, hiBase] = WF_RANGE[f], hi = Math.max(hiBase, prof[f]);
  const n = 301, xs = [], ps = [], segs = [];
  const at = v => { const q = Object.assign({}, prof); q[f] = v; return q; };
  for (let k = 0; k < n; k++) {
    const v = lo + (hi - lo) * k / (n - 1); xs.push(v);
    const q = at(v); ps.push(M.prob(q)); segs.push(M.segment(q).name);
  }
  const bisect = (a, b, test) => { for (let it = 0; it < 40; it++) { const m = (a + b) / 2; if (test(m) === test(a)) a = m; else b = m; } return (a + b) / 2; };
  const flips = [], segChanges = [];
  for (let k = 1; k < n; k++) {
    if ((ps[k - 1] > thr) !== (ps[k] > thr)) flips.push({ x: bisect(xs[k - 1], xs[k], v => M.prob(at(v)) > thr), left: ps[k - 1] > thr ? "will reorder" : "at risk", right: ps[k] > thr ? "will reorder" : "at risk" });
    if (segs[k - 1] !== segs[k]) segChanges.push({ x: bisect(xs[k - 1], xs[k], v => M.segment(at(v)).name), from: segs[k - 1], to: segs[k] });
  }
  const traces = SEGS.map(s => ({ type: "scatter", mode: "lines", name: s, x: xs,
    y: ps.map((pp, k) => (segs[k] === s || (k > 0 && segs[k - 1] === s) || (k < n - 1 && segs[k + 1] === s)) ? pp : null),
    line: { color: segColor(s), width: 3 }, connectgaps: false, hovertemplate: `${FLABEL[f]} %{x:.2f}<br>reorder chance %{y:.1%}<br>${s}<extra></extra>` }));
  const cur = M.prob(prof);
  traces.push({ type: "scatter", mode: "markers", name: "Current", x: [prof[f]], y: [cur], showlegend: false,
    marker: { size: 14, color: css("--ink"), line: { color: css("--surface"), width: 2 } }, hovertemplate: `Current: %{x}<br>reorder chance %{y:.1%}<extra></extra>` });
  if (flips.length) traces.push({ type: "scatter", mode: "markers", name: "Verdict flips", x: flips.map(d => d.x), y: flips.map(() => thr),
    marker: { symbol: "diamond", size: 12, color: css("--accent"), line: { color: css("--ink"), width: 1 } },
    customdata: flips.map(d => [d.left, d.right]), hovertemplate: "Verdict changes at %{x:.2f}<br>below: %{customdata[0]} · above: %{customdata[1]}<extra></extra>" });
  const shapes = [hline(thr, css("--warn"))].concat(segChanges.map(c => vline(c.x, css("--muted"), "dot", 1)));
  const annotations = segChanges.map(c => ({ x: c.x, y: 1.02, yref: "y", text: "→ " + c.to, showarrow: false, xanchor: "left", xshift: 4, font: { size: 11, color: css("--ink-2") } }));
  plot("pd-wf-chart", traces, { showlegend: true, shapes, annotations, hovermode: "closest",
    yaxis: { tickformat: ".0%", range: [-0.03, 1.08], title: { text: "reorder chance" } }, xaxis: { title: { text: FLABEL[f] } } });
  const fmt = v => f === "discount_rate" ? pyPct(v, 0) : pyFixed(v, 1);
  const parts = [];
  const up = flips.filter(d => d.x > prof[f]).sort((a, b) => a.x - b.x)[0], down = flips.filter(d => d.x < prof[f]).sort((a, b) => b.x - a.x)[0];
  if (up) parts.push(`Raising ${FLABEL[f].toLowerCase()} past ${fmt(up.x)} flips the verdict to ${up.right}.`);
  if (down) parts.push(`Lowering ${FLABEL[f].toLowerCase()} below ${fmt(down.x)} flips the verdict to ${down.left}.`);
  if (!flips.length) parts.push(`Across ${fmt(lo)}–${fmt(hi)} the verdict never changes from ${cur > thr ? "will reorder" : "at risk"}.`);
  const su = segChanges.filter(c => c.x > prof[f]).sort((a, b) => a.x - b.x)[0], sd = segChanges.filter(c => c.x < prof[f]).sort((a, b) => b.x - a.x)[0];
  if (su) parts.push(`The segment changes to ${su.to} above ${fmt(su.x)}.`);
  if (sd) parts.push(`Below ${fmt(sd.x)} the segment becomes ${sd.from}.`);
  if (!segChanges.length) parts.push("The segment stays the same across the range.");
  $("#pd-wf-note").textContent = parts.join(" ");
}

// =====================================================================================
// SEGMENTS
// =====================================================================================
const ALLF = F5.concat(["age", "total_spend"]);
function kfit() { return D.kfits[String(ST.seg.k)]; }
function clusterOrder(kf) { return kf.slots.map((s, c) => ({ s, c })).sort((a, b) => a.s - b.s).map(d => d.c); }
function clusterLabel(kf, c) { return ST.seg.k === 3 ? kf.names[c] : `${kf.names[c]} · ${kf.desc[c]}`; }
const zOf = (f, v) => { const i = F5.indexOf(f); return (v - D.model.segScaler.mean[i]) / D.model.segScaler.scale[i]; };
const popStats = {};
ALLF.concat(["reordered"]).forEach(f => {
  const arr = f === "reordered" ? dn.y : dn[COL[f]]; const m = mean(arr);
  popStats[f] = { mean: m, sd: Math.sqrt(mean(arr.map(v => (v - m) * (v - m)))) };
});
function initSegments() {
  segBtns($("#sg-view"), [{ v: "pca2", label: "2-D map" }, { v: "pair", label: "Feature pair" }, { v: "pca3", label: "3-D" }], ST.seg.view, v => { ST.seg.view = v; save(); renderSegments(); });
  segBtns($("#sg-prof"), [{ v: "heat", label: "Heatmap" }, { v: "radar", label: "Radar" }, { v: "bars", label: "Bars" }], ST.seg.prof, v => { ST.seg.prof = v; save(); renderSegments(); });
  const opts = ALLF.map(f => `<option value="${f}">${FLABEL[f]}</option>`).join("");
  $("#sg-box").innerHTML = opts; $("#sg-fx").innerHTML = opts; $("#sg-fy").innerHTML = opts;
  $("#sg-box").addEventListener("change", e => { ST.seg.box = e.target.value; save(); renderSegments(); });
  $("#sg-fx").addEventListener("change", e => { ST.seg.fx = e.target.value; save(); renderSegments(); });
  $("#sg-fy").addEventListener("change", e => { ST.seg.fy = e.target.value; save(); renderSegments(); });
  $("#sg-dl").addEventListener("click", () => saveCSV(`quickbite_segments_k${ST.seg.k}.csv`, segTableRows(true)));
}
function segTableRows(raw) {
  const kf = kfit(), lab = kf.labels, rows = [];
  rows.push(["segment", "description", "diners", "share", ...ALLF, "reorder_rate", "top_items"]);
  clusterOrder(kf).forEach(c => {
    const idx = range(0, N - 1).filter(i => lab[i] === c);
    const means = ALLF.map(f => mean(idx.map(i => dn[COL[f]][i])));
    const top = ST.seg.k === 3 ? D.meta.reco[kf.names[c]] : itemShares(d => lab[d] === c).slice(0, 5).map(d => d.item);
    rows.push([kf.names[c], ST.seg.k === 3 ? kf.desc[c] : `${kf.desc[c]} (mostly ${kf.parent[c]})`, idx.length,
      raw ? pyFixed(idx.length / N, 4) : pyPct(idx.length / N, 1),
      ...means.map((m, j) => raw ? pyFixed(m, 3) : (ALLF[j] === "discount_rate" ? pyPct(m, 0) : pyFixed(m, ALLF[j] === "avg_order_value" || ALLF[j] === "total_spend" ? 0 : 1))),
      raw ? pyFixed(mean(idx.map(i => dn.y[i])), 4) : pyPct(mean(idx.map(i => dn.y[i])), 1), top.map(pretty).join(raw ? "; " : ", ")]);
  });
  return rows;
}
function centreNotes(cx, cy, ct) {
  return cx.map((x, j) => ({ x, y: cy[j], text: ct[j], showarrow: true, arrowhead: 0, arrowwidth: 1, arrowcolor: css("--ink-2"), ax: 0, ay: -34,
    bgcolor: css("--surface"), bordercolor: css("--line"), borderpad: 3, font: { size: 12, color: css("--ink"), family: FONT } }));
}
function renderSegments() {
  schedulePaint();
  const k = ST.seg.k, kf = kfit(), lab = kf.labels, ord = clusterOrder(kf);
  segBtns($("#sg-k"), range(2, 8).map(v => ({ v, label: String(v) })), k, v => { ST.seg.k = +v; save(); renderSegments(); });
  $$("#sg-view button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === ST.seg.view)));
  $$("#sg-prof button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === ST.seg.prof)));
  $("#sg-box").value = ST.seg.box; $("#sg-fx").value = ST.seg.fx; $("#sg-fy").value = ST.seg.fy;
  $("#sg-fxy").hidden = ST.seg.view !== "pair";
  // elbow & silhouette
  const ks = D.kscan.map(d => d.k);
  const mk = (key, id, title, fmt) => plot(id, [
    { type: "scatter", mode: "lines+markers", x: ks, y: D.kscan.map(d => d[key]), line: { color: css("--ink-2"), width: 2 },
      marker: { size: ks.map(v => v === k ? 14 : 8), color: ks.map(v => v === k ? css("--accent") : css("--ink-2")), line: { color: css("--surface"), width: 2 } },
      text: D.kscan.map(d => fmt(d[key])), hovertemplate: `k = %{x}<br>${title} %{text}<extra></extra>` }],
    { xaxis: { dtick: 1, title: { text: "number of segments (k)" } }, yaxis: { title: { text: title } } });
  mk("inertia", "sg-elbow", "inertia", v => pyFixed(v, 1));
  mk("sil", "sg-sil", "silhouette", v => pyFixed(v, 4));
  // map
  const evr = D.pca.evr, C = D.pca.coords, view = ST.seg.view;
  $("#sg-map-title").textContent = view === "pair" ? "Segments on two features" : (view === "pca3" ? "Segments in 3-D (PCA)" : "Segment map (PCA)");
  $("#sg-map-note").textContent = `k = ${k} · silhouette ${pyFixed(kf.sil, 3)}`;
  const traces = [];
  ord.forEach((c, j) => {
    const idx = range(0, N - 1).filter(i => lab[i] === c), col = slotColor(kf.slots[c]);
    const hover = idx.map(i => `${dn.id[i]} · ${kf.names[c]}<br>${dn.opm[i]} orders/mo · AED ${pyFixed(dn.aov[i], 0)} · ${dn.items[i]} items<br>${dn.rec[i]} days ago · ${pyPct(dn.disc[i], 0)} discount`);
    let x, y, z;
    if (view === "pair") { x = idx.map(i => dn[COL[ST.seg.fx]][i]); y = idx.map(i => dn[COL[ST.seg.fy]][i]); }
    else { x = idx.map(i => C[i][0]); y = idx.map(i => C[i][1]); z = idx.map(i => C[i][2]); }
    const t = { type: view === "pca3" ? "scatter3d" : "scattergl", mode: "markers", name: clusterLabel(kf, c), x, y,
      marker: { color: col, size: view === "pca3" ? 3.5 : 7, opacity: view === "pca3" ? 0.75 : 0.6, symbol: SYMBOLS[j % SYMBOLS.length] },
      text: hover, hovertemplate: "%{text}<extra></extra>" };
    if (view === "pca3") t.z = z;
    traces.push(t);
  });
  // centres
  const cx = [], cy = [], cz = [], ct = [];
  ord.forEach(c => {
    if (view === "pair") {
      const idx = range(0, N - 1).filter(i => lab[i] === c);
      cx.push(mean(idx.map(i => dn[COL[ST.seg.fx]][i]))); cy.push(mean(idx.map(i => dn[COL[ST.seg.fy]][i])));
    } else { const pp = M.pcaProject(kf.centers[c]); cx.push(pp[0]); cy.push(pp[1]); cz.push(pp[2]); }
    ct.push(k === 3 ? kf.names[c] : kf.names[c]);
  });
  const centre = { type: view === "pca3" ? "scatter3d" : "scatter", mode: view === "pca3" ? "markers+text" : "markers", name: "Centres", x: cx, y: cy, text: ct, textposition: "top center",
    textfont: { color: css("--ink"), size: 13, family: FONT }, marker: { symbol: view === "pca3" ? "x" : "x-thin", size: view === "pca3" ? 6 : 16, color: css("--ink"), line: { color: css("--ink"), width: 3 } },
    hovertemplate: "%{text} centre<extra></extra>", showlegend: false };
  if (view === "pca3") centre.z = cz;
  traces.push(centre);
  if (view === "pca3") {
    const ax = t => ({ title: { text: t, font: { color: css("--ink-2"), size: 11 } }, gridcolor: css("--grid"), zerolinecolor: css("--line"), tickfont: { color: css("--muted"), size: 10 }, backgroundcolor: "rgba(0,0,0,0)", showbackground: false });
    plot("sg-map", traces, { showlegend: true, scene: { xaxis: ax(`PC1 ${pyPct(evr[0], 0)}`), yaxis: ax(`PC2 ${pyPct(evr[1], 0)}`), zaxis: ax(`PC3 ${pyPct(evr[2], 0)}`), camera: { eye: { x: 1.5, y: 1.4, z: 0.9 } } }, margin: { l: 0, r: 0, t: 10, b: 0 } });
  } else if (view === "pair") {
    plot("sg-map", traces, { showlegend: true, dragmode: "zoom", annotations: centreNotes(cx, cy, ct), xaxis: { fixedrange: false, title: { text: FLABEL[ST.seg.fx] } }, yaxis: { fixedrange: false, title: { text: FLABEL[ST.seg.fy] } } });
  } else {
    plot("sg-map", traces, { showlegend: true, dragmode: "zoom", annotations: centreNotes(cx, cy, ct), xaxis: { fixedrange: false, title: { text: `PC1 (${pyPct(evr[0], 0)} of variation)` } }, yaxis: { fixedrange: false, title: { text: `PC2 (${pyPct(evr[1], 0)})` } } });
  }
  $("#sg-legend").innerHTML = ord.map(c => `<span><span class="swatch" style="background:${slotColor(kf.slots[c])}"></span>${esc(clusterLabel(kf, c))} · ${kf.sizes[c]} diners · ${pyPct(kf.reorder[c], 0)} reorder${k !== 3 ? ` · mostly ${kf.parent[c]}` : ""}</span>`).join("");
  // profile
  const prof = ord.map(c => {
    const idx = range(0, N - 1).filter(i => lab[i] === c);
    const z5 = F5.map(f => mean(idx.map(i => zOf(f, dn[COL[f]][i]))));
    const extra = ["age", "total_spend", "reordered"].map(f => { const arr = f === "reordered" ? idx.map(i => dn.y[i]) : idx.map(i => dn[COL[f]][i]); return (mean(arr) - popStats[f].mean) / popStats[f].sd; });
    return { c, name: clusterLabel(kf, c), short: kf.names[c], col: slotColor(kf.slots[c]), z: z5.concat(extra) };
  });
  const cols = F5.concat(["age", "total_spend", "reordered"]).map(f => FSHORT[f]);
  if (ST.seg.prof === "heat") {
    const zmax = Math.max(1.5, ...prof.flatMap(p => p.z.map(Math.abs)));
    plot("sg-profile", [{ type: "heatmap", z: prof.map(p => p.z), x: cols, y: prof.map(p => p.short), zmid: 0, zmin: -zmax, zmax,
      colorscale: [[0, css("--div-lo")], [0.5, css("--div-mid")], [1, css("--accent")]], xgap: 2, ygap: 2,
      text: prof.map(p => p.z.map(v => pyFixed(v, 2))),
      hovertemplate: "%{y}<br>%{x}: %{text} SD from average<extra></extra>", colorbar: { thickness: 10, outlinewidth: 0, tickfont: { color: css("--muted") }, title: { text: "z", font: { color: css("--muted") } } } }],
      { xaxis: { side: "bottom", tickangle: -30 }, yaxis: { autorange: "reversed", ticksuffix: "  " },
        annotations: prof.flatMap(p => p.z.map((v, j) => ({ x: cols[j], y: p.short, text: pyFixed(v, 2), showarrow: false,
          font: { size: 12, family: FONT, color: Math.abs(v) / zmax > 0.45 ? (isDarkTheme() ? css("--bg") : "#FFFFFF") : css("--ink") } }))),
        shapes: [{ type: "line", xref: "x", yref: "paper", x0: 4.5, x1: 4.5, y0: 0, y1: 1, line: { color: css("--ink-2"), width: 2 } }] });
  } else if (ST.seg.prof === "radar") {
    const th = F5.map(f => FSHORT[f]);
    plot("sg-profile", prof.map(p => ({ type: "scatterpolar", r: p.z.slice(0, 5).concat([p.z[0]]), theta: th.concat([th[0]]), name: p.short, fill: "toself",
      line: { color: p.col, width: 2 }, fillcolor: p.col, opacity: 0.55, hovertemplate: `${p.short}<br>%{theta}: %{r:.2f} SD<extra></extra>` })),
      { showlegend: true, polar: { bgcolor: "rgba(0,0,0,0)", radialaxis: { gridcolor: css("--grid"), linecolor: css("--line"), tickfont: { color: css("--muted"), size: 10 }, angle: 90 },
        angularaxis: { gridcolor: css("--grid"), linecolor: css("--line"), tickfont: { color: css("--ink-2"), size: 11 } } }, margin: { l: 40, r: 40, t: 30, b: 30 } });
  } else {
    plot("sg-profile", prof.map(p => ({ type: "bar", name: p.short, x: cols, y: p.z, marker: { color: p.col },
      hovertemplate: `${p.short}<br>%{x}: %{y:.2f} SD<extra></extra>` })),
      { showlegend: true, barmode: "group", bargap: 0.3, bargroupgap: 0.08, yaxis: { title: { text: "SD from average" }, zeroline: true, zerolinecolor: css("--muted") }, xaxis: { tickangle: -30 } });
  }
  // box plots
  const bf = ST.seg.box;
  plot("sg-boxplot", ord.map(c => {
    const idx = range(0, N - 1).filter(i => lab[i] === c);
    return { type: "box", name: kf.names[c], y: idx.map(i => dn[COL[bf]][i]), marker: { color: slotColor(kf.slots[c]), size: 4 }, line: { color: slotColor(kf.slots[c]), width: 1.5 },
      fillcolor: "rgba(0,0,0,0)", boxpoints: "outliers", hovertemplate: `${kf.names[c]}<br>%{y}<extra></extra>` };
  }), { yaxis: { title: { text: FLABEL[bf] }, tickformat: bf === "discount_rate" ? ".0%" : "" }, xaxis: { tickangle: 0 } });
  // table
  const rows = segTableRows(false), head = rows[0];
  const headLabels = ["Segment", "Description", "Diners", "Share", ...ALLF.map(f => FSHORT[f]), "Reorder", "Top items"];
  $("#sg-table").innerHTML = `<table><thead><tr>${headLabels.map((h, j) => `<th class="${j >= 2 && j < head.length - 1 ? "r" : ""}">${h}</th>`).join("")}</tr></thead><tbody>${rows.slice(1).map((r, ri) =>
    `<tr>${r.map((v, j) => `<td class="${j >= 2 && j < r.length - 1 ? "r" : ""}">${j === 0 ? `<span class="swatch" style="background:${slotColor(kf.slots[ord[ri]])};margin-right:6px"></span>` : ""}${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}
RENDER.segments = renderSegments;

// =====================================================================================
// BASKET RULES
// =====================================================================================
const SCOPES = ["Overall"].concat(SEGS);
const lbl = arr => arr.map(i => ITEMS[i]).join(" + ");
const plbl = arr => arr.map(i => pretty(ITEMS[i])).join(" + ");
function pyOrder(a, b) {
  const la = Math.round(a.lift * 1e10) / 1e10, lb = Math.round(b.lift * 1e10) / 1e10;
  if (la !== lb) return lb - la;
  if (a.conf !== b.conf) return b.conf - a.conf;
  if (a.s !== b.s) return b.s - a.s;
  if (a.A !== b.A) return a.A < b.A ? -1 : 1;
  if (a.C !== b.C) return a.C < b.C ? -1 : 1;
  return 0;
}
function currentRules() {
  const R = ST.rules, src = D.rules[R.scope];
  let rs = src.rules.map(r => Object.assign({}, r, { A: lbl(r.a), C: lbl(r.c) })).sort(pyOrder);
  if (R.dedup) {
    const seen = new Set();
    rs = rs.filter(r => { const key = [r.A, r.C].sort().join("|"); if (seen.has(key)) return false; seen.add(key); return true; });
  }
  const it = R.item === "" ? -1 : ITEMS.indexOf(R.item);
  rs = rs.filter(r => r.s >= R.ms - 1e-9 && r.conf >= R.mc - 1e-9 && r.lift >= R.ml - 1e-9 && (it < 0 || r.a.includes(it) || r.c.includes(it)));
  if (R.rank !== "lift") rs.sort((a, b) => (b[R.rank] - a[R.rank]) || pyOrder(a, b));
  return { rs, n: src.n };
}
function initRules() {
  segBtns($("#ru-scope"), SCOPES.map(s => ({ v: s, label: s })), ST.rules.scope, v => { ST.rules.scope = v; save(); renderRules(); });
  segBtns($("#ru-heat-mode"), [{ v: "lift", label: "Lift" }, { v: "count", label: "Baskets together" }], ST.rules.heat, v => { ST.rules.heat = v; save(); renderRules(); });
  $("#ru-item").innerHTML = `<option value="">Any item</option>` + ITEMS.map(i => `<option value="${i}">${pretty(i)}</option>`).join("");
  const bind = (id, key, fmt) => {
    $("#" + id).addEventListener("input", e => { ST.rules[key] = Number(e.target.value); $("#" + id + "-o").textContent = fmt(ST.rules[key]); save(); renderRules(); });
  };
  bind("ru-ms", "ms", v => pyPct(v, 0)); bind("ru-mc", "mc", v => pyPct(v, 0)); bind("ru-ml", "ml", v => pyFixed(v, 1));
  $("#ru-rank").addEventListener("change", e => { ST.rules.rank = e.target.value; save(); renderRules(); });
  $("#ru-item").addEventListener("change", e => { ST.rules.item = e.target.value; save(); renderRules(); });
  $("#ru-dedup").addEventListener("change", e => { ST.rules.dedup = e.target.checked; save(); renderRules(); });
}
function renderRules() {
  schedulePaint();
  const R = ST.rules;
  $$("#ru-scope button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === R.scope)));
  $$("#ru-heat-mode button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === R.heat)));
  $("#ru-ms").value = R.ms; $("#ru-ms-o").textContent = pyPct(R.ms, 0);
  $("#ru-mc").value = R.mc; $("#ru-mc-o").textContent = pyPct(R.mc, 0);
  $("#ru-ml").value = R.ml; $("#ru-ml-o").textContent = pyFixed(R.ml, 1);
  $("#ru-rank").value = R.rank; $("#ru-item").value = R.item; $("#ru-dedup").checked = R.dedup;
  const { rs, n } = currentRules();
  $("#ru-count").textContent = `${rs.length} rule${rs.length === 1 ? "" : "s"} · ${pyComma(n)} baskets`;
  let sel = rs.find(r => r.A + "→" + r.C === R.sel);
  if (!sel && rs.length) { sel = rs[0]; }
  const shown = rs.slice(0, 200);
  $("#ru-table").innerHTML = rs.length ? `<table><thead><tr><th class="r">#</th><th>If the basket has</th><th>It also has</th><th class="r">Support</th><th class="r">Confidence</th><th class="r">Lift</th><th class="r">Baskets</th></tr></thead><tbody>${shown.map((r, k) =>
    `<tr class="clickable ${r === sel ? "sel" : ""}" data-key="${esc(r.A + "→" + r.C)}" tabindex="0"><td class="r muted">${k + 1}</td><td>${esc(plbl(r.a))}</td><td>${esc(plbl(r.c))}</td><td class="r">${pyPct(r.s, 1)}</td><td class="r">${pyPct(r.conf, 1)}</td><td class="r">${pyFixed(r.lift, 2)}</td><td class="r">${r.nAC}</td></tr>`).join("")}</tbody></table>`
    : `<p class="chart-fallback" style="height:auto;padding:24px">No rules pass these filters. Lower the minimum support, confidence or lift.</p>`;
  $$("#ru-table tr.clickable").forEach(tr => {
    const pick = () => { ST.rules.sel = tr.dataset.key; save(); renderRules(); };
    tr.addEventListener("click", pick);
    tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });
  explainRule(sel, n);
  pairHeat();
}
function explainRule(r, n) {
  const host = $("#ru-explain"), scope = ST.rules.scope, where = scope === "Overall" ? "" : ` ${scope.toLowerCase()}`;
  if (!r) { host.innerHTML = `<p class="muted">No rule selected.</p>`; plot("ru-compare", [], {}); $("#ru-compare-note").textContent = ""; return; }
  const A = plbl(r.a), C = plbl(r.c);
  let verdict;
  if (r.lift >= 2) verdict = "A strong pairing, worth selling as a bundle.";
  else if (r.lift >= 1.2) verdict = "A mild pairing. Fine for a \"goes well with\" suggestion, but too weak to justify a bundle discount.";
  else if (r.lift >= 0.9) verdict = `No real link: ${C} is common anyway, so this rule adds nothing.`;
  else verdict = "These items tend not to be ordered together.";
  host.innerHTML = `<div class="explain"><div class="rule-title">${esc(A)} → ${esc(C)}</div>
    <p><b>${pyComma(r.nA)}</b> of the ${pyComma(n)}${where} baskets contain ${esc(A)} (${pyPct(r.nA / n, 1)}). In <b>${pyComma(r.nAC)}</b> of those, ${esc(C)} was there too: a confidence of <b>${pyPct(r.conf, 1)}</b>.</p>
    <p>${esc(cap(C))} turns up in ${pyComma(r.nC)} of ${pyComma(n)} baskets anyway (${pyPct(r.nC / n, 1)}), so having ${esc(A)} in the basket makes it <b>${pyFixed(r.lift, 2)}×</b> as likely. Support: ${pyPct(r.s, 1)} of all baskets contain both.</p>
    <p><b>${verdict}</b></p></div>`;
  const stats = SCOPES.map(s => Object.assign({ scope: s }, ruleStats(s, r.a, r.c)));
  plot("ru-compare", [{ type: "bar", x: stats.map(s => s.scope), y: stats.map(s => s.lift),
    marker: { color: stats.map(s => s.scope === "Overall" ? css("--ink-2") : segColor(s.scope)) },
    text: stats.map(s => s.lift === null ? "never" : `${pyFixed(s.lift, 1)}×`), textposition: "outside", cliponaxis: false, textfont: { color: css("--ink-2") },
    customdata: stats.map(s => [s.conf === null ? "—" : pyPct(s.conf, 1), pyPct(s.base, 1), s.nA, s.nAC]),
    hovertemplate: "%{x}<br>lift %{text}<br>confidence %{customdata[0]} (%{customdata[3]} of %{customdata[2]} baskets)<br>base rate of the second part %{customdata[1]}<extra></extra>" }],
    { yaxis: { title: { text: "lift" }, rangemode: "tozero" }, shapes: [hline(1, css("--muted"), "dot")], margin: { t: 24 },
      annotations: stats.filter(s => s.lift === null).map(s => ({ x: s.scope, y: 0, yanchor: "bottom", yshift: 18, text: s.nA ? "never together" : "not ordered", showarrow: false, font: { size: 11, color: css("--muted") } })) });
  const ov = stats[0], segBest = stats.slice(1).filter(s => s.lift !== null).sort((a, b) => b.nAC - a.nAC)[0];
  $("#ru-compare-note").textContent = segBest && ov.lift !== null
    ? `Overall lift ${pyFixed(ov.lift, 1)} vs ${pyFixed(segBest.lift, 1)} inside ${segBest.scope}. ${cap(C)} is in ${pyPct(ov.base, 1)} of all baskets but ${pyPct(segBest.base, 1)} of ${segBest.scope.toLowerCase()} baskets, so the overall figure also counts "both items belong to the same menu".`
    : "";
}
function pairHeat() {
  const scope = ST.rules.scope, bs = SCOPE_BASKETS[scope], n = bs.length;
  const cnt = new Array(ITEMS.length).fill(0), pair = ITEMS.map(() => new Array(ITEMS.length).fill(0));
  for (const b of bs) { const arr = Array.from(b); arr.forEach(i => { cnt[i]++; arr.forEach(j => { if (i !== j) pair[i][j]++; }); }); }
  const present = range(0, ITEMS.length - 1).filter(i => cnt[i] > 0).sort((a, b) => cnt[b] - cnt[a]);
  const names = present.map(i => pretty(ITEMS[i]));
  if (ST.rules.heat === "lift") {
    const z = present.map(i => present.map(j => (i === j || !pair[i][j]) ? null : Math.log2(pair[i][j] * n / (cnt[i] * cnt[j]))));
    const txt = present.map(i => present.map(j => i === j ? "" : `${pretty(ITEMS[i])} + ${pretty(ITEMS[j])}<br>together in ${pair[i][j]} baskets<br>lift ${pair[i][j] ? pyFixed(pair[i][j] * n / (cnt[i] * cnt[j]), 2) : "0 (never together)"}`));
    const zmax = Math.max(1, ...z.flat().filter(v => v !== null && isFinite(v)).map(Math.abs));
    plot("ru-heat", [{ type: "heatmap", x: names, y: names, z, text: txt, hovertemplate: "%{text}<extra></extra>", hoverongaps: false, zmin: -zmax, zmax, zmid: 0, xgap: 1, ygap: 1,
      colorscale: [[0, css("--div-lo")], [0.5, css("--div-mid")], [1, css("--accent")]],
      colorbar: { thickness: 10, outlinewidth: 0, tickvals: [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5].filter(v => Math.abs(v) <= zmax), ticktext: [-4, -3, -2, -1, 0, 1, 2, 3, 4, 5].filter(v => Math.abs(v) <= zmax).map(v => (v < 0 ? pyFixed(Math.pow(2, v), v < -2 ? 3 : 2) : pyFixed(Math.pow(2, v), 0)) + "×"), tickfont: { color: css("--muted") }, title: { text: "lift", font: { color: css("--muted") } } } }],
      { xaxis: { tickangle: -40 }, yaxis: { autorange: "reversed", ticksuffix: " " } });
  } else {
    const z = present.map(i => present.map(j => i === j ? null : pair[i][j]));
    plot("ru-heat", [{ type: "heatmap", x: names, y: names, z, hovertemplate: "%{y} + %{x}<br>together in %{z} baskets<extra></extra>", hoverongaps: false, xgap: 1, ygap: 1,
      colorscale: [[0, css("--div-mid")], [1, css("--yes")]], colorbar: { thickness: 10, outlinewidth: 0, tickfont: { color: css("--muted") }, title: { text: "baskets", font: { color: css("--muted") } } } }],
      { xaxis: { tickangle: -40 }, yaxis: { autorange: "reversed", ticksuffix: " " } });
  }
}
RENDER.rules = renderRules;

// =====================================================================================
// REORDER MODEL
// =====================================================================================
function initModel() {
  $("#mo-m").innerHTML = D.models.keys.map(k => `<option value="${k}">${D.models.labels[k]}</option>`).join("");
  $("#mo-m").addEventListener("change", e => { ST.model.m = e.target.value; save(); renderModel(); });
  segBtns($("#mo-ts"), D.models.sizes.map(s => ({ v: s.toFixed(2), label: pyPct(s, 0) })), Number(ST.model.ts).toFixed(2), v => { ST.model.ts = Number(v); save(); renderModel(); });
  segBtns($("#mo-view"), [{ v: "split", label: "Probability split" }, { v: "cost", label: "Cost curve" }, { v: "roc", label: "ROC curve" }], ST.model.view, v => { ST.model.view = v; save(); renderModel(); });
  $("#mo-thr").addEventListener("input", e => { ST.model.thr = Number(e.target.value); save(); renderModel(); });
  $("#mo-v").addEventListener("input", e => { const v = Number(e.target.value); if (e.target.value !== "" && isFinite(v) && v >= 0) { ST.model.voucher = v; save(); renderModel(); } });
  $("#mo-l").addEventListener("input", e => { const v = Number(e.target.value); if (e.target.value !== "" && isFinite(v) && v >= 0) { ST.model.lost = v; save(); renderModel(); } });
  $("#mo-cheapest").addEventListener("click", () => { ST.model.thr = cheapest().thr; save(); renderModel(); toast(`Threshold set to ${pyPct(ST.model.thr, 0)}`); });
}
const THRS = range(1, 99).map(v => v / 100);
function costCurve() {
  const S = ST.model;
  return THRS.map(t => ({ thr: t, cost: evalRun(S.m, S.ts, t, S.voucher, S.lost).cost }));
}
function cheapest() {
  const cc = costCurve(); const min = Math.min(...cc.map(d => d.cost));
  return cc.filter(d => d.cost === min).sort((a, b) => Math.abs(a.thr - 0.5) - Math.abs(b.thr - 0.5))[0];
}
function renderModel() {
  schedulePaint();
  const S = ST.model, ev = evalRun(S.m, S.ts, S.thr, S.voucher, S.lost), r = ev.r;
  $("#mo-m").value = S.m; $("#mo-thr").value = S.thr; $("#mo-thr-o").textContent = pyPct(S.thr, 0);
  $("#mo-v").value = S.voucher; $("#mo-l").value = S.lost;
  $$("#mo-ts button").forEach(b => b.setAttribute("aria-pressed", String(Number(b.dataset.v) === Number(S.ts))));
  $$("#mo-view button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === S.view)));
  statTiles($("#mo-stats"), [
    { lab: "Test accuracy", big: pyPct(ev.acc, 1), note: `baseline ${pyPct(ev.base, 1)} (always "reorder")` },
    { lab: "Churners caught", big: `${ev.caught} / ${ev.churners}`, note: `${pyPct(ev.caught / ev.churners, 0)} of the diners who left` },
    { lab: "False alarms", big: String(ev.fa), note: "vouchers sent to diners who'd stay" },
    { lab: "Cost of mistakes", big: aed(ev.cost), note: `${ev.missed} × ${aed(S.lost)} + ${ev.fa} × ${aed(S.voucher)}` },
    { lab: "ROC-AUC", big: pyFixed(ev.auc, 3), note: `CV accuracy ${pyPct(r.cvAcc, 1)} (5-fold, training set)` },
  ]);
  $("#mo-cm-note").textContent = `${ev.n} test diners · threshold ${pyPct(S.thr, 0)}`;
  $("#mo-cm").innerHTML = `<div class="cm">
    <span></span><span class="h col">Predicted at risk</span><span class="h col">Predicted will reorder</span>
    <span class="h">Actually churned</span><div class="cell good"><b>${ev.caught}</b>churners caught</div><div class="cell bad"><b>${ev.missed}</b>missed churners</div>
    <span class="h">Actually reordered</span><div class="cell meh"><b>${ev.fa}</b>false alarms</div><div class="cell good"><b>${ev.tp}</b>correctly left alone</div></div>`;
  // chart views
  const yesC = css("--yes"), warnC = css("--warn");
  if (S.view === "split") {
    const pC = r.p.filter((v, k) => ev.y[k] === 0), pR = r.p.filter((v, k) => ev.y[k] === 1);
    const xb = { start: 0, end: 1.0001, size: 0.05 };
    plot("mo-chart", [
      { type: "histogram", name: "Actually churned", x: pC, xbins: xb, marker: { color: warnC, line: { color: css("--surface"), width: 1 } }, opacity: 0.75, hovertemplate: "churned: %{y} diners<br>chance %{x}<extra></extra>" },
      { type: "histogram", name: "Actually reordered", x: pR, xbins: xb, marker: { color: yesC, line: { color: css("--surface"), width: 1 } }, opacity: 0.65, hovertemplate: "reordered: %{y} diners<br>chance %{x}<extra></extra>" }],
      { barmode: "overlay", showlegend: true, shapes: [vline(S.thr, css("--accent"), "solid", 2)], xaxis: { title: { text: "predicted reorder chance" }, tickformat: ".0%", range: [0, 1] }, yaxis: { title: { text: "test diners" } },
        annotations: [{ x: S.thr, y: 1, yref: "paper", text: "threshold", showarrow: false, xanchor: "left", xshift: 4, yanchor: "top", font: { color: css("--accent-ink"), size: 11 } }] });
    $("#mo-chart-note").textContent = "Diners left of the line are flagged at risk. Red bars to the right of the line are missed churners; teal bars to the left are false alarms.";
  } else if (S.view === "cost") {
    const cc = costCurve(), ch = cheapest(), cur = cc.find(d => Math.abs(d.thr - S.thr) < 1e-9);
    plot("mo-chart", [
      { type: "scatter", mode: "lines", x: cc.map(d => d.thr), y: cc.map(d => d.cost), line: { color: css("--ink-2"), width: 2, shape: "hv" }, hovertemplate: "threshold %{x:.0%}<br>cost AED %{y:,.0f}<extra></extra>" },
      { type: "scatter", mode: "markers+text", x: [ch.thr], y: [ch.cost], text: [`cheapest ${pyPct(ch.thr, 0)}`], textposition: "top center", textfont: { color: css("--ink-2"), size: 11 },
        marker: { size: 12, color: css("--yes"), symbol: "diamond", line: { color: css("--surface"), width: 2 } }, hovertemplate: "cheapest: %{x:.0%}<br>AED %{y:,.0f}<extra></extra>" },
      { type: "scatter", mode: "markers", x: [S.thr], y: [cur ? cur.cost : ev.cost], marker: { size: 13, color: css("--accent"), line: { color: css("--ink"), width: 1.5 } }, hovertemplate: "current: %{x:.0%}<br>AED %{y:,.0f}<extra></extra>" }],
      { xaxis: { title: { text: "at-risk threshold" }, tickformat: ".0%", range: [0, 1] }, yaxis: { title: { text: "cost of mistakes (AED)" }, tickformat: ",.0f", rangemode: "tozero" } });
    $("#mo-chart-note").textContent = `Cheapest threshold for these costs: ${pyPct(ch.thr, 0)} (${aed(ch.cost)}). The orange dot is the current threshold.`;
  } else {
    const roc = Q.rocCurve(ev.y, r.p);
    const tpr = ev.tp / (ev.tp + ev.fa), fpr = ev.missed / ev.churners;
    plot("mo-chart", [
      { type: "scatter", mode: "lines", x: roc.fpr, y: roc.tpr, line: { color: css("--ink"), width: 2.5, shape: "linear" }, name: "ROC", hovertemplate: "false-positive rate %{x:.2f}<br>true-positive rate %{y:.2f}<extra></extra>" },
      { type: "scatter", mode: "lines", x: [0, 1], y: [0, 1], line: { color: css("--muted"), width: 1, dash: "dot" }, hoverinfo: "skip" },
      { type: "scatter", mode: "markers", x: [fpr], y: [tpr], marker: { size: 13, color: css("--accent"), line: { color: css("--ink"), width: 1.5 } }, hovertemplate: `threshold ${pyPct(S.thr, 0)}<br>FPR %{x:.2f} · TPR %{y:.2f}<extra></extra>` }],
      { xaxis: { title: { text: "churners wrongly called 'will reorder' (FPR)" }, range: [-0.02, 1.02] }, yaxis: { title: { text: "reorderers correctly called (TPR)" }, range: [-0.02, 1.02] } });
    $("#mo-chart-note").textContent = `Area under the curve: ${pyFixed(ev.auc, 3)}. The orange dot is the current threshold. Treating "reorder" as the positive class, as scikit-learn does.`;
  }
  // drivers
  const imp = r.imp.map((v, k) => ({ f: INP[k], v })).sort((a, b) => Math.abs(a.v) - Math.abs(b.v));
  const isCoef = r.impKind === "coef";
  $("#mo-drv-note").textContent = isCoef ? "standardised weights (log-odds per SD)" : "feature importance (share of the model's splits)";
  plot("mo-drivers", [{ type: "bar", orientation: "h", y: imp.map(d => FLABEL[d.f]), x: imp.map(d => d.v),
    marker: { color: imp.map(d => isCoef ? (d.v >= 0 ? css("--yes") : css("--warn")) : css("--ink-2")) },
    text: imp.map(d => pyFixed(d.v, isCoef ? 2 : 3)), textposition: "auto", cliponaxis: false, outsidetextfont: { color: css("--ink-2") }, insidetextfont: { color: css("--surface") },
    hovertemplate: "%{y}: %{text}<extra></extra>" }],
    { xaxis: { title: { text: isCoef ? "← lowers chance · raises chance →" : "importance" }, zeroline: true, zerolinecolor: css("--muted") }, yaxis: { ticksuffix: "  " }, margin: { r: 40, l: 8 } });
  // errors by segment
  const errs = SEGS.map(s => {
    let miss = 0, fa = 0, n = 0;
    r.test.forEach((i, k) => { if (dinerSeg[i] !== s) return; n++; const pr = r.p[k] > S.thr; if (dn.y[i] === 0 && pr) miss++; if (dn.y[i] === 1 && !pr) fa++; });
    return { s, miss, fa, n };
  });
  plot("mo-errors", [
    { type: "bar", name: "Missed churners", x: errs.map(e => e.s), y: errs.map(e => e.miss), marker: { color: css("--warn") }, text: errs.map(e => String(e.miss)), textposition: "outside", cliponaxis: false, textfont: { color: css("--ink-2") }, hovertemplate: "%{x}: %{y} missed churners<extra></extra>" },
    { type: "bar", name: "False alarms", x: errs.map(e => e.s), y: errs.map(e => e.fa), marker: { color: css("--accent") }, text: errs.map(e => String(e.fa)), textposition: "outside", cliponaxis: false, textfont: { color: css("--ink-2") }, hovertemplate: "%{x}: %{y} false alarms<extra></extra>" }],
    { barmode: "group", showlegend: true, yaxis: { title: { text: "test diners" }, rangemode: "tozero" }, margin: { t: 24 } });
  // all models
  const all = D.models.keys.map(k => Object.assign({ k }, evalRun(k, S.ts, S.thr, S.voucher, S.lost)));
  const minCost = Math.min(...all.map(a => a.cost));
  $("#mo-all-note").textContent = `test size ${pyPct(S.ts, 0)} · threshold ${pyPct(S.thr, 0)} · select a row to switch model`;
  $("#mo-all").innerHTML = `<table><thead><tr><th>Model</th><th class="r">CV accuracy</th><th class="r">Test accuracy</th><th class="r">ROC-AUC</th><th class="r">Churners caught</th><th class="r">False alarms</th><th class="r">Cost of mistakes</th></tr></thead><tbody>${all.map(a =>
    `<tr class="clickable ${a.k === S.m ? "sel" : ""}" data-k="${a.k}" tabindex="0"><td>${D.models.labels[a.k]}${a.cost === minCost ? ' ' + pill("yes", "cheapest") : ""}</td><td class="r">${pyPct(a.r.cvAcc, 1)}</td><td class="r">${pyPct(a.acc, 1)}</td><td class="r">${pyFixed(a.auc, 3)}</td><td class="r">${a.caught} / ${a.churners}</td><td class="r">${a.fa}</td><td class="r">${aed(a.cost)}</td></tr>`).join("")}</tbody></table>`;
  $$("#mo-all tr.clickable").forEach(tr => {
    const pick = () => { ST.model.m = tr.dataset.k; save(); renderModel(); };
    tr.addEventListener("click", pick); tr.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
  });
  $("#mo-verify").innerHTML = `<p><b>Checked in this browser:</b> the saved model's reorder chances, rebuilt here from its weights, differ from scikit-learn's by at most <span class="num">${maxDiff.toExponential(1)}</span> across all 480 diners, and ${segMismatch === 0 ? "all 480 segments match" : segMismatch + " segments differ"}. The other four models' test-set probabilities were computed in Python and embedded.</p>`;
}
RENDER.model = renderModel;

// =====================================================================================
// AT-RISK LIST
// =====================================================================================
function initRisk() {
  $("#ar-segs").innerHTML = SEGS.map(s => `<button type="button" class="chip" data-s="${s}">${segSwatch(s)}${s}</button>`).join("");
  $$("#ar-segs .chip").forEach(b => b.addEventListener("click", () => {
    const s = b.dataset.s, set = new Set(ST.risk.segs);
    if (set.has(s)) set.delete(s); else set.add(s);
    ST.risk.segs = SEGS.filter(x => set.has(x)); save(); renderRisk();
  }));
  $("#ar-thr").addEventListener("input", e => { ST.risk.thr = Number(e.target.value); save(); renderRisk(); });
  $("#ar-rec").addEventListener("input", e => { ST.risk.rec = Number(e.target.value); save(); renderRisk(); });
  $("#ar-sort").addEventListener("change", e => { ST.risk.sort = e.target.value; save(); renderRisk(); });
  $("#ar-q").addEventListener("input", e => { ST.risk.q = e.target.value.trim(); save(); renderRisk(); });
  $("#ar-more").addEventListener("click", () => { ST.risk.all = !ST.risk.all; save(); renderRisk(); });
  $("#ar-dl").addEventListener("click", () => {
    const rows = [["diner_id", "segment", "reorder_chance", "days_since_last_order", "winback_day", "status", "monthly_value_aed", "value_at_risk_aed", "offer", "recommended_items"]];
    riskRows().forEach(d => rows.push([d.id, d.seg, pyFixed(d.p, 4), d.rec, d.T === null ? "" : d.T, d.status, pyFixed(d.mv, 2), pyFixed(d.var, 2),
      `${BUNDLE_NAME[d.seg]}: ${D.bundles[d.seg].items.map(pretty).join(" + ")}`, (D.meta.reco[d.seg] || []).map(pretty).join("; ")]));
    saveCSV("quickbite_at_risk.csv", rows);
  });
}
function riskStatus(seg, rec) {
  const T = CLOCK[seg].trigger;
  if (T === null) return "no trigger";
  if (rec > T) return "past win-back day"; if (rec === T) return "due today"; if (rec >= 0.6 * T) return "due soon"; return "on track";
}
function riskRows() {
  const R = ST.risk, segs = new Set(R.segs), q = R.q.toLowerCase();
  const rows = [];
  for (let i = 0; i < N; i++) {
    const s = dinerSeg[i], p = scoreAll[i];
    if (!segs.has(s) || p > R.thr + 1e-12 || dn.rec[i] < R.rec) continue;
    if (q && !dn.id[i].toLowerCase().includes(q)) continue;
    rows.push({ i, id: dn.id[i], seg: s, p, rec: dn.rec[i], T: CLOCK[s].trigger, status: riskStatus(s, dn.rec[i]), mv: monthly[i], var: monthly[i] * (1 - p), y: dn.y[i] });
  }
  const key = R.sort;
  rows.sort((a, b) => key === "p" ? (a.p - b.p) : key === "rec" ? (b.rec - a.rec || b.var - a.var) : (b.var - a.var));
  return rows;
}
function renderRisk() {
  schedulePaint();
  const R = ST.risk;
  $$("#ar-segs .chip").forEach(b => b.setAttribute("aria-pressed", String(R.segs.includes(b.dataset.s))));
  $("#ar-thr").value = R.thr; $("#ar-thr-o").textContent = pyPct(R.thr, 0);
  $("#ar-rec").value = R.rec; $("#ar-rec-o").textContent = String(R.rec);
  $("#ar-sort").value = R.sort; if ($("#ar-q").value !== R.q) $("#ar-q").value = R.q;
  const rows = riskRows();
  const past = rows.filter(d => d.status === "past win-back day" || d.status === "due today").length;
  const churned = rows.filter(d => d.y === 0).length;
  statTiles($("#ar-stats"), [
    { lab: "Diners on the list", big: pyComma(rows.length), note: `of ${N} scored` },
    { lab: "Monthly value at risk", big: aed(sum(rows.map(d => d.var))), note: `of ${aed(sum(rows.map(d => d.mv)))} they order per month` },
    { lab: "At or past win-back day", big: pyComma(past), note: "send the offer now" },
    { lab: "Churned in the data", big: rows.length ? pyPct(churned / rows.length, 0) : "—", note: `${churned} of ${rows.length}, an in-sample check` },
  ]);
  const inSet = new Set(rows.map(d => d.i));
  const traces = SEGS.map(s => {
    const idx = range(0, N - 1).filter(i => dinerSeg[i] === s);
    return { type: "scattergl", mode: "markers", name: s, x: idx.map(i => dn.rec[i] + ((i * 37) % 11 - 5) * 0.045), y: idx.map(i => scoreAll[i]),
      marker: { color: segColor(s), size: idx.map(i => inSet.has(i) ? 8 : 6), opacity: idx.map(i => inSet.has(i) ? 0.9 : 0.15) },
      text: idx.map(i => `${dn.id[i]} · ${s}<br>reorder chance ${pyPct(scoreAll[i], 0)} · ${dn.rec[i]} days<br>value at risk ${aed(monthly[i] * (1 - scoreAll[i]))}/month`),
      hovertemplate: "%{text}<extra></extra>" };
  });
  plot("ar-chart", traces, { showlegend: true, dragmode: "zoom", shapes: [hline(R.thr, css("--accent"), "solid")],
    xaxis: { fixedrange: false, title: { text: "days since last order" } }, yaxis: { fixedrange: false, tickformat: ".0%", range: [-0.03, 1.03], title: { text: "reorder chance" } } });
  const shown = R.all ? rows : rows.slice(0, 25);
  $("#ar-more").textContent = R.all ? "Show top 25" : `Show all ${rows.length}`;
  $("#ar-more").hidden = rows.length <= 25;
  const stCls = { "past win-back day": "no", "due today": "no", "due soon": "mid", "on track": "yes", "no trigger": "yes" };
  $("#ar-table").innerHTML = rows.length ? `<table><thead><tr><th>Diner</th><th>Segment</th><th class="r">Reorder chance</th><th class="r">Days since order</th><th class="r">Win-back day</th><th>Status</th><th class="r">Monthly value</th><th class="r">Value at risk</th><th>Offer</th></tr></thead><tbody>${shown.map(d =>
    `<tr><td class="num">${d.id}</td><td>${segSwatch(d.seg)} ${d.seg}</td><td class="r">${pyPct(d.p, 0)}</td><td class="r">${d.rec}</td><td class="r">${d.T === null ? "—" : d.T}</td><td>${pill(stCls[d.status], d.status)}</td><td class="r">${aed(d.mv)}</td><td class="r">${aed(d.var)}</td><td>${BUNDLE_NAME[d.seg]}</td></tr>`).join("")}</tbody></table>`
    : `<p class="chart-fallback" style="height:auto;padding:24px">No diners match. Raise the reorder-chance limit or add a segment.</p>`;
}
RENDER.atrisk = renderRisk;

// =====================================================================================
// DEEPER FINDINGS
// =====================================================================================
function initFindings() {
  $("#f1-cut").addEventListener("input", e => { ST.deep.cut = Number(e.target.value); save(); renderFindings(); });
  $("#f1-best").addEventListener("click", () => { ST.deep.cut = Math.floor(D.f1.cut); save(); renderFindings(); });
  segBtns($("#f2-view"), [{ v: "bands", label: "Bands" }, { v: "days", label: "Day by day" }], ST.deep.clock, v => { ST.deep.clock = v; save(); renderFindings(); });
  $("#f5-drop").innerHTML = D.f5.map(d => `<option value="${d.dropped || ""}">${d.dropped ? FLABEL[d.dropped] : "Nothing (all 5 features)"}</option>`).join("");
  $("#f5-drop").addEventListener("change", e => { ST.deep.drop = e.target.value; save(); renderFindings(); });
}
function ruleAcc(cut) {
  let ok = 0, caught = 0, missed = 0, fa = 0;
  for (let i = 0; i < N; i++) { const pr = dn.rec[i] <= cut ? 1 : 0; if (pr === dn.y[i]) ok++; if (dn.y[i] === 0 && pr === 0) caught++; if (dn.y[i] === 0 && pr === 1) missed++; if (dn.y[i] === 1 && pr === 0) fa++; }
  return { acc: ok / N, caught, missed, fa };
}
function renderFindings() {
  schedulePaint();
  subTabs($("#fd-subtabs"), ST.deep.sub, v => { ST.deep.sub = v; save(); renderFindings(); });
  $$("[data-fsub]").forEach(el => { el.hidden = el.dataset.fsub !== ST.deep.sub; });
  const sub = ST.deep.sub;
  if (sub === "f1") {
    const cut = ST.deep.cut, best = Math.floor(D.f1.cut), ra = ruleAcc(cut);
    $("#f1-cut").value = cut; $("#f1-cut-o").textContent = `${cut} day${cut === 1 ? "" : "s"}`;
    const cv = D.f1.cv, rule = cv.find(d => d.kind === "rule"), full = cv[1], two = cv.find(d => d.name === "Recency + segment (plain LR)");
    statTiles($("#f1-stats"), [
      { lab: "This rule, all 480", big: pyPct(ra.acc, 1), note: `catches ${ra.caught} of ${N - sum(dn.y)} churners · ${ra.fa} false alarms` },
      { lab: `Best rule (≤ ${best} days), CV`, big: pyPct(rule.acc, 1), note: "5-fold cross-validated" },
      { lab: "Full 7-input model, CV", big: pyPct(full.acc, 1), note: "balanced logistic regression" },
      { lab: "Recency + segment, CV", big: pyPct(two.acc, 1), note: "plain logistic regression" },
    ]);
    const cuts = range(0, 30), accs = cuts.map(c => ruleAcc(c).acc);
    plot("f1-curve", [
      { type: "scatter", mode: "lines+markers", x: cuts, y: accs, line: { color: css("--ink-2"), width: 2 }, marker: { size: 6, color: css("--ink-2") }, text: accs.map(a => pyPct(a, 1)), hovertemplate: "reorder if within %{x} days<br>accuracy %{text}<extra></extra>" },
      { type: "scatter", mode: "markers", x: [cut], y: [ra.acc], marker: { size: 14, color: css("--accent"), line: { color: css("--ink"), width: 1.5 } }, text: [pyPct(ra.acc, 1)], hovertemplate: "current: %{x} days · %{text}<extra></extra>" }],
      { shapes: [hline(mean(dn.y), css("--muted"), "dot"), vline(best, css("--yes"), "dot", 1)], yaxis: { tickformat: ".0%", title: { text: "accuracy" } }, xaxis: { title: { text: "cut-off (days since last order)" } },
        annotations: [{ x: 0, y: mean(dn.y), text: "baseline 60%", showarrow: false, xanchor: "left", yanchor: "bottom", font: { size: 11, color: css("--muted") } },
                      { x: best, y: 1, yref: "paper", text: `best: ${best} days`, showarrow: false, xanchor: "left", xshift: 4, yanchor: "top", font: { size: 11, color: css("--ink-2") } }] });
    const au = D.f1.auc1.slice().reverse();
    plot("f1-auc", [{ type: "bar", orientation: "h", y: au.map(d => FLABEL[d.f]), x: au.map(d => d.auc),
      marker: { color: au.map(d => d.f === "days_since_last_order" ? css("--accent") : css("--ink-2")) },
      text: au.map(d => pyFixed(d.auc, 3)), textposition: "outside", cliponaxis: false, textfont: { color: css("--ink-2") },
      customdata: au.map(d => d.up ? "higher → more reorders" : "lower → more reorders"), hovertemplate: "%{y}: %{text}<br>%{customdata}<extra></extra>" }],
      { xaxis: { range: [0.4, 1.02], title: { text: "ROC-AUC on its own" } }, yaxis: { ticksuffix: "  " }, shapes: [vline(0.5, css("--muted"), "dot", 1)], margin: { r: 40 } });
    $("#f1-table").innerHTML = `<table><thead><tr><th>Approach</th><th class="r">CV accuracy</th><th class="r">CV ROC-AUC</th></tr></thead><tbody>${cv.map(d => `<tr><td>${d.name}</td><td class="r">${pyPct(d.acc, 1)}</td><td class="r">${pyFixed(d.auc, 3)}</td></tr>`).join("")}</tbody></table>`;
  } else if (sub === "f2") {
    $$("#f2-view button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === ST.deep.clock)));
    statTiles($("#f2-stats"), SEGS.map(s => {
      const T = CLOCK[s].trigger, row = T === null ? null : CLOCK[s].rows.find(r => r.a === T);
      return { lab: s, big: T === null ? "No trigger" : `By day ${T}`, note: T === null ? `stays above 50% in every band (longest gap ${CLOCK[s].maxRec} days)` : `${pyPct(row.rate, 1)} reorder in the ${row.label} band (${row.n} diners)` };
    }));
    $("#f2-title").textContent = ST.deep.clock === "bands" ? "Reorder rate by recency band" : "Reorder rate by exact day";
    $("#f2-note").textContent = ST.deep.clock === "bands" ? "bands with fewer than 5 diners hidden" : "dot size = diners; faded dots have fewer than 5";
    clockChart("f2-chart", ST.deep.clock);
    $("#f2-table").innerHTML = `<table><thead><tr><th>Days since last order</th>${SEGS.map(s => `<th class="r">${s}</th>`).join("")}</tr></thead><tbody>${BANDS.map(([a, b], k) =>
      `<tr><td>${bandLabel(a, b)}</td>${SEGS.map(s => { const r = CLOCK[s].rows[k]; const trig = CLOCK[s].trigger === a; return `<td class="r">${r.shown ? `${trig ? pill("no", pyPct(r.rate, 1)) : pyPct(r.rate, 1)} <span class="muted">(n=${r.n})</span>` : `<span class="muted">hidden (n=${r.n})</span>`}</td>`; }).join("")}</tr>`).join("")}</tbody></table>`;
  } else {
    const sel = D.f5.find(d => (d.dropped || "") === ST.deep.drop) || D.f5[0];
    $("#f5-drop").value = sel.dropped || "";
    const base = D.f5[0];
    statTiles($("#f5-stats"), [
      { lab: "Silhouette", big: pyFixed(sel.sil, 3), note: `vs ${pyFixed(base.sil, 3)} with all 5 features` },
      { lab: "Agreement (ARI)", big: pyFixed(sel.ari, 3), note: sel.ari >= 0.9999999 ? "identical segments" : (sel.ari > 0.9 ? "almost identical segments" : "segments change") },
      { lab: "Diners who switch", big: String(N - sel.crosstab.reduce((s, row) => s + Math.max(...row), 0)), note: "relative to the saved segments" },
    ]);
    const labs = D.f5.map(d => d.dropped ? FSHORT[d.dropped] : "none");
    plot("f5-chart", [{ type: "bar", x: labs, y: D.f5.map(d => d.sil),
      marker: { color: D.f5.map(d => d === sel ? css("--accent") : css("--ink-2")) },
      text: D.f5.map(d => `ARI ${pyFixed(d.ari, 2)}`), textposition: "outside", cliponaxis: false, textfont: { color: css("--ink-2"), size: 11 },
      customdata: D.f5.map(d => pyFixed(d.sil, 4)), hovertemplate: "dropped: %{x}<br>silhouette %{customdata}<br>%{text}<extra></extra>" }],
      { yaxis: { title: { text: "silhouette" }, range: [0, 0.75] }, xaxis: { title: { text: "feature dropped" } }, margin: { t: 24 } });
    // order new clusters by best match to saved segments
    const ct = sel.crosstab, colOrder = [];
    SEGS.forEach((s, r) => { const row = ct[r]; let bj = -1, bv = -1; row.forEach((v, j) => { if (!colOrder.includes(j) && v > bv) { bv = v; bj = j; } }); if (bj >= 0) colOrder.push(bj); });
    ct[0].forEach((v, j) => { if (!colOrder.includes(j)) colOrder.push(j); });
    $("#f5-table").innerHTML = `<table><thead><tr><th>Saved segment</th>${colOrder.map((j, k) => `<th class="r">New cluster ${k + 1}</th>`).join("")}</tr></thead><tbody>${SEGS.map((s, r) =>
      `<tr><td>${segSwatch(s)} ${s}</td>${colOrder.map(j => `<td class="r">${ct[r][j]}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }
}
RENDER.findings = renderFindings;

// =====================================================================================
// TAKEAWAYS
// =====================================================================================
function renderTakeaways() {
  const S = ST.model, ev = evalRun(S.m, S.ts, S.thr, S.voucher, S.lost);
  const lostSorted = SEGS.slice().sort((a, b) => SEG_STATS[b].lost - SEG_STATS[a].lost), top = lostSorted[0], second = lostSorted[1];
  const fam = D.bundles["Families"], foo = D.bundles["Premium foodies"];
  const risk = range(0, N - 1).filter(i => scoreAll[i] <= S.thr);
  const riskVal = sum(risk.map(i => monthly[i] * (1 - scoreAll[i])));
  const stu = SEG_STATS["Budget students"], famS = SEG_STATS["Families"];
  const allRe = mean(range(0, N - 1).filter(i => dn.y[i] === 1).map(i => dn.disc[i])), allCh = mean(range(0, N - 1).filter(i => dn.y[i] === 0).map(i => dn.disc[i]));
  $("#tk-body").innerHTML = `
  <section class="panel takeaway"><div class="copy"><span class="eyebrow">Who to focus on</span><h2 class="kicker">Focus on ${top}</h2>
    <p>${SEG_STATS[top].churners} of ${SEG_STATS[top].n} ${top.toLowerCase()} did not reorder, taking <b>${aed(SEG_STATS[top].lost)}</b> of monthly orders with them, the largest loss of any segment. ${second} lost ${aed(SEG_STATS[second].lost)}; ${lostSorted[2].toLowerCase()} only ${aed(SEG_STATS[lostSorted[2]].lost)}.</p></div>
    <div class="chart short" id="tk-lost"></div></section>
  <section class="panel takeaway"><div class="copy"><span class="eyebrow">What to promote</span><h2 class="kicker">Promote the pizza night and the sushi set</h2>
    <p><b>Pizza night</b> (${fam.items.map(pretty).join(" + ")}) for Families: ${pyPct(fam.rule.conf, 0)} of family baskets with ${fam.rule.a.map(pretty).join(" + ")} also had ${fam.rule.c.map(pretty).join(" + ")}, ${pyFixed(fam.rule.lift, 1)}× chance within the segment.</p>
    <p><b>Sushi set</b> (${foo.items.map(pretty).join(" + ")}) for Premium foodies: ${pyPct(foo.rule.conf, 0)} confidence, ${pyFixed(foo.rule.lift, 1)}× chance within the segment.</p>
    <p class="small muted">Both pairings hold inside their own segment, not just in the pooled data, where lifts are inflated.</p></div>
    <div class="bundle-cards" style="grid-template-columns:minmax(0,1fr)">${["Families", "Premium foodies"].map(s => `<div class="bundle-card"><h3>${segSwatch(s)}${BUNDLE_NAME[s]}</h3><div class="items">${D.bundles[s].items.map(it => `<span class="item in-bundle">${pretty(it)}</span>`).join("")}</div></div>`).join("")}</div></section>
  <section class="panel takeaway"><div class="copy"><span class="eyebrow">When to act</span><h2 class="kicker">Time offers with the churn clock</h2>
    <p>${SEGS.map(s => CLOCK[s].trigger === null ? `${s}: no offer needed (they reorder through day ${CLOCK[s].maxRec})` : `${s}: send the win-back offer <b>by day ${CLOCK[s].trigger}</b>`).join(". ")}.</p>
    <p class="small muted">Families order about every ${pyFixed(30 / famS.opm, 0)} days, so a family that hasn't ordered in a week is already late.</p></div>
    <div class="trigger-chips">${SEGS.map(s => `<span class="chip" style="cursor:default">${segSwatch(s)}${s}: ${CLOCK[s].trigger === null ? "no trigger" : "day " + CLOCK[s].trigger}</span>`).join("")}</div></section>
  <section class="panel takeaway"><div class="copy"><span class="eyebrow">How to use the model</span><h2 class="kicker">Run the reorder model every week</h2>
    <p>Each week, score every diner and send the segment's bundle offer to anyone at or below a ${pyPct(S.thr, 0)} reorder chance. On the ${pyPct(S.ts, 0)} test set, ${D.models.labels[S.m].toLowerCase()} caught <b>${ev.caught} of ${ev.churners}</b> churners with ${ev.fa} false alarms (cost of mistakes ${aed(ev.cost)} at ${aed(S.voucher)} per voucher and ${aed(S.lost)} per lost diner).</p>
    <p>Today that list holds <b>${pyComma(risk.length)} diners</b> with ${aed(riskVal)} of monthly orders at risk.</p></div>
    <div class="stats" style="grid-template-columns:repeat(2,minmax(0,1fr))"><div class="stat"><span class="lab">Caught</span><span class="big">${ev.caught}/${ev.churners}</span></div><div class="stat"><span class="lab">False alarms</span><span class="big">${ev.fa}</span></div></div></section>
  <section class="panel takeaway"><div class="copy"><span class="eyebrow">What to change</span><h2 class="kicker">Student discounts can be pulled back, carefully</h2>
    <p>Across all diners, reorderers use discounts on ${pyPct(allRe, 0)} of orders against ${pyPct(allCh, 0)} for churners. That gap is a segment effect. Within students, discount use is the same for both groups (${pyPct(stu.discRe, 0)} vs ${pyPct(stu.discCh, 0)}), and ${pyPct(stu.reorder, 0)} reorder anyway. Test a smaller student discount on a holdout group first: there are only ${stu.churners} student churners to learn from.</p>
    <p>Family reorderers use discounts a little more (${pyPct(famS.discRe, 0)} vs ${pyPct(famS.discCh, 0)}), so keep the family offers.</p></div>
    <div class="table-wrap"><table><thead><tr><th>Segment</th><th class="r">Reorderers</th><th class="r">Churners</th><th class="r">Separates them? (AUC)</th></tr></thead><tbody>${SEGS.map(s => `<tr><td>${segSwatch(s)} ${s}</td><td class="r">${pyPct(SEG_STATS[s].discRe, 0)}</td><td class="r">${pyPct(SEG_STATS[s].discCh, 0)} <span class="muted">(n=${SEG_STATS[s].churners})</span></td><td class="r">${SEG_STATS[s].discAuc === null ? "—" : pyFixed(SEG_STATS[s].discAuc, 2)}</td></tr>`).join("")}</tbody></table></div></section>
  <div class="learn"><p>An AUC of 0.5 means discount use tells reorderers and churners apart no better than a coin flip; 1.0 would separate them perfectly.</p></div>`;
  const segs = SEGS.slice().reverse();
  plot("tk-lost", [{ type: "bar", orientation: "h", y: segs, x: segs.map(s => SEG_STATS[s].lost), marker: { color: segs.map(segColor) },
    text: segs.map(s => aed(SEG_STATS[s].lost)), textposition: "outside", cliponaxis: false, textfont: { color: css("--ink-2") },
    customdata: segs.map(s => SEG_STATS[s].churners), hovertemplate: "%{y}: %{text} per month<br>%{customdata} churners<extra></extra>" }],
    { xaxis: { title: { text: "monthly order value lost to churners (AED)" }, tickformat: ",.0f" }, yaxis: { ticksuffix: "  " }, margin: { r: 100 } });
}
RENDER.takeaways = renderTakeaways;

// =====================================================================================
// boot
// =====================================================================================
initPredictor(); initSegments(); initRules(); initModel(); initRisk(); initFindings();
applyLearn();
const fromHash = (location.hash || "").replace("#", "");
showTab(PAGES.includes(fromHash) ? fromHash : ST.tab, false);
const rerender = () => { RENDER[ST.tab](); paintRanges(); };
try { matchMedia("(prefers-color-scheme: dark)").addEventListener("change", rerender); } catch (e) { /* old browser */ }
new MutationObserver(rerender).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
window.addEventListener("hashchange", () => { const h = location.hash.replace("#", ""); if (PAGES.includes(h) && h !== ST.tab) showTab(h, false); });
window.__qb = { D, M, Q, ST: () => ST, evalRun, CLOCK, SEG_STATS, currentRules, riskRows, maxDiff, segMismatch };
})();
