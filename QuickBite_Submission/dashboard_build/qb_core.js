/* QuickBite core: model re-implementation + Python-style number formatting.
   Shared by the dashboard page (inlined) and the Node verification script. */
(function (root) {
  "use strict";

  // ---------- Python-identical rounding ----------
  // Python formats floats by correctly rounding the exact binary value, ties to even.
  // Number.prototype.toFixed(100) gives the exact decimal expansion for the values we show.
  function pyFixed(x, d) {
    if (!isFinite(x)) return String(x);
    const neg = x < 0 || Object.is(x, -0);
    const s = Math.abs(x).toFixed(100);
    const dot = s.indexOf(".");
    const ip = s.slice(0, dot), fp = s.slice(dot + 1);
    const keep = fp.slice(0, d), rest = fp.slice(d);
    let up = false;
    if (rest.length) {
      const f = rest.charCodeAt(0) - 48;
      if (f > 5) up = true;
      else if (f === 5) {
        if (/[1-9]/.test(rest.slice(1))) up = true;
        else {
          const last = d > 0 ? keep.charCodeAt(d - 1) - 48 : ip.charCodeAt(ip.length - 1) - 48;
          up = last % 2 === 1;
        }
      }
    }
    let digits = (ip + keep).split("").map(Number);
    if (up) {
      let i = digits.length - 1;
      while (i >= 0) {
        if (digits[i] === 9) { digits[i] = 0; i--; }
        else { digits[i] += 1; break; }
      }
      if (i < 0) digits.unshift(1);
    }
    const str = digits.join("");
    const intPart = str.slice(0, str.length - d) || "0";
    const out = d > 0 ? intPart + "." + str.slice(str.length - d) : intPart;
    return (neg ? "-" : "") + out;
  }
  // f"{x:.{d}%}"  (Python multiplies by 100 in floating point, then formats)
  function pyPct(x, d) { return pyFixed(x * 100, d === undefined ? 1 : d) + "%"; }
  // f"{x:,.{d}f}"
  function pyComma(x, d) {
    const s = pyFixed(x, d || 0);
    const neg = s[0] === "-";
    const body = neg ? s.slice(1) : s;
    const [i, f] = body.split(".");
    const withC = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return (neg ? "-" : "") + withC + (f !== undefined ? "." + f : "");
  }

  // ---------- models ----------
  function makeModels(D) {
    const F = D.meta.features;            // 5 clustering features
    const INP = D.meta.inputs;            // 7 classifier inputs
    const S = D.model.segScaler, C = D.model.centers, L = D.model.clf;
    const names = D.meta.segNames;

    function scaled5(p) { return F.map((f, i) => (p[f] - S.mean[i]) / S.scale[i]); }
    function dist2(a, b) { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s; }
    function segment(p, centers) {
      const z = scaled5(p), cs = centers || C;
      let best = 0, bd = Infinity; const ds = [];
      for (let c = 0; c < cs.length; c++) { const d = dist2(z, cs[c]); ds.push(Math.sqrt(d)); if (d < bd) { bd = d; best = c; } }
      return { cluster: best, name: centers ? null : names[String(best)], z, dists: ds };
    }
    function zInputs(p) { return INP.map((f, i) => (p[f] - L.mean[i]) / L.scale[i]); }
    function logit(p) {
      const z = zInputs(p); let s = 0;
      for (let i = 0; i < z.length; i++) s += z[i] * L.coef[i];
      return s + L.intercept;
    }
    function prob(p) { return 1 / (1 + Math.exp(-logit(p))); }
    function contributions(p) {
      const z = zInputs(p);
      return INP.map((f, i) => ({ f, z: z[i], w: L.coef[i], c: z[i] * L.coef[i] }));
    }
    function pcaProject(z5) {
      const P = D.pca;
      return P.components.map(row => row.reduce((s, w, i) => s + w * (z5[i] - P.mean[i]), 0));
    }
    function dinerProfile(i) {
      const d = D.diners;
      return { age: d.age[i], orders_per_month: d.opm[i], avg_order_value: d.aov[i], avg_items_per_order: d.items[i],
               days_since_last_order: d.rec[i], discount_rate: d.disc[i], total_spend: d.spend[i] };
    }
    return { segment, prob, logit, contributions, scaled5, pcaProject, dinerProfile };
  }

  // ---------- ROC / AUC (matches sklearn.metrics.roc_auc_score) ----------
  function aucScore(y, p) {
    // Mann-Whitney U with ties counted as 1/2
    const idx = p.map((v, i) => i).sort((a, b) => p[a] - p[b]);
    let rankSum = 0, nPos = 0, nNeg = 0, i = 0;
    const ranks = new Array(p.length);
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && p[idx[j + 1]] === p[idx[i]]) j++;
      const r = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) ranks[idx[k]] = r;
      i = j + 1;
    }
    for (let k = 0; k < y.length; k++) { if (y[k] === 1) { nPos++; rankSum += ranks[k]; } else nNeg++; }
    return (rankSum - nPos * (nPos + 1) / 2) / (nPos * nNeg);
  }
  function rocCurve(y, p) {
    const idx = p.map((v, i) => i).sort((a, b) => p[b] - p[a]);
    const P = y.filter(v => v === 1).length, N = y.length - P;
    const fpr = [0], tpr = [0], thr = [Infinity];
    let tp = 0, fp = 0;
    for (let k = 0; k < idx.length; k++) {
      if (y[idx[k]] === 1) tp++; else fp++;
      if (k === idx.length - 1 || p[idx[k + 1]] !== p[idx[k]]) { fpr.push(fp / N); tpr.push(tp / P); thr.push(p[idx[k]]); }
    }
    return { fpr, tpr, thr };
  }

  const api = { pyFixed, pyPct, pyComma, makeModels, aucScore, rocCurve };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.QBCore = api;
})(typeof window !== "undefined" ? window : globalThis);
