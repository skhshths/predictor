/* =========================================================================
   The prediction model. Pure functions only: this whole function is also
   stringified into a Web Worker so training never freezes the page.

   Two model families are tried, each with a few regularisation strengths:
     - logistic regression (L2)
     - a small neural network (one hidden layer of 6 tanh units, L2, Adam)
   Each candidate is scored with cross-validation (leave-one-out for small
   data sets, 10-fold otherwise) on days it did not train on. The candidate
   with the lowest held-out log loss wins and is retrained on all days.
   ========================================================================= */
function modelLib() {
  'use strict';

  var FEATURES = [
    { key: 'tempAvg', label: 'Temperature, 6–8 PM' },
    { key: 'windAvg', label: 'Wind speed' },
    { key: 'gustMax', label: 'Wind gusts' },
    { key: 'windN', label: 'Wind from north vs south' },
    { key: 'windE', label: 'Wind from east vs west' },
    { key: 'daylight', label: 'Daylight during practice' },
    { key: 'twilight', label: 'Twilight during practice' },
    { key: 'cloud', label: 'Cloud cover' },
    { key: 'precip', label: 'Rain' },
    { key: 'thunder', label: 'Thunderstorms' }
  ];
  var MIN_DAYS = 6, MIN_EACH = 2;

  var CANDIDATES = [
    { type: 'lr', lambda: 0.01, name: 'Logistic regression (light regularisation)' },
    { type: 'lr', lambda: 0.1, name: 'Logistic regression' },
    { type: 'lr', lambda: 1, name: 'Logistic regression (strong regularisation)' },
    { type: 'mlp', lambda: 0.003, H: 6, name: 'Neural network (6 hidden units)' },
    { type: 'mlp', lambda: 0.03, H: 6, name: 'Neural network (6 hidden units, regularised)' }
  ];

  function num(v) { return v == null || v === '' || isNaN(v) ? NaN : +v; }

  // Weather object -> raw feature vector. Wind direction is turned into two
  // signed components (speed × cos/sin of the direction it blows from), so
  // "strong wind from the south" and "light wind from the north" differ.
  function vector(w) {
    var s = num(w.windAvg), d = num(w.dir) * Math.PI / 180;
    var ok = !isNaN(s) && !isNaN(d);
    return [
      num(w.tempAvg), s, num(w.gustMax),
      ok ? s * Math.cos(d) : (s === 0 ? 0 : NaN), ok ? s * Math.sin(d) : (s === 0 ? 0 : NaN),
      num(w.daylight), num(w.twilight), num(w.cloud), num(w.precip),
      w.thunder == null || w.thunder === '' ? NaN : (+w.thunder ? 1 : 0)
    ];
  }

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function sig(z) { return z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)); }
  function clampP(p) { return Math.min(1 - 1e-6, Math.max(1e-6, p)); }
  function logloss(p, y) { p = clampP(p); return -(y ? Math.log(p) : Math.log(1 - p)); }

  // Standardise each feature with the training data; missing values become 0 (the mean).
  function scaler(X) {
    var d = X[0].length, mu = [], sd = [];
    for (var j = 0; j < d; j++) {
      var vals = X.map(function (x) { return x[j]; }).filter(function (v) { return !isNaN(v); });
      var m = vals.length ? vals.reduce(function (a, b) { return a + b; }, 0) / vals.length : 0;
      var v = vals.length ? vals.reduce(function (a, b) { return a + (b - m) * (b - m); }, 0) / vals.length : 0;
      mu.push(m); sd.push(Math.sqrt(v) > 1e-9 ? Math.sqrt(v) : 1);
    }
    return { mu: mu, sd: sd };
  }
  function scale(sc, x) { return x.map(function (v, j) { return isNaN(v) ? 0 : (v - sc.mu[j]) / sc.sd[j]; }); }

  function trainLR(Z, y, lambda) {
    var n = y.length, d = Z[0].length, w = new Array(d).fill(0);
    var pos = y.reduce(function (a, b) { return a + b; }, 0);
    var b = Math.log((pos + 0.5) / (n - pos + 0.5));
    var lr = 0.5, gw = new Array(d);
    for (var it = 0; it < 1500; it++) {
      gw.fill(0); var gb = 0;
      for (var i = 0; i < n; i++) {
        var z = b, zi = Z[i];
        for (var j = 0; j < d; j++) z += w[j] * zi[j];
        var e = sig(z) - y[i];
        gb += e;
        for (j = 0; j < d; j++) gw[j] += e * zi[j];
      }
      var change = 0;
      for (j = 0; j < d; j++) { var step = lr * (gw[j] / n + lambda * w[j]); w[j] -= step; change += Math.abs(step); }
      b -= lr * gb / n;
      if (change < 1e-7 && it > 50) break;
    }
    return { type: 'lr', w: w, b: b };
  }

  function trainMLP(Z, y, lambda, H, seed) {
    var n = y.length, d = Z[0].length, r = rng(seed || 1);
    var P = H * d + H + H + 1, th = new Float64Array(P);
    var o1 = 0, ob1 = H * d, ow2 = ob1 + H, ob2 = ow2 + H;
    for (var k = 0; k < H * d; k++) th[k] = (r() * 2 - 1) * Math.sqrt(1 / d);
    for (k = 0; k < H; k++) th[ow2 + k] = (r() * 2 - 1) * Math.sqrt(1 / H);
    var pos = y.reduce(function (a, b) { return a + b; }, 0);
    th[ob2] = Math.log((pos + 0.5) / (n - pos + 0.5));
    var m = new Float64Array(P), v = new Float64Array(P), g = new Float64Array(P), h = new Float64Array(H);
    var lr = 0.03, b1 = 0.9, b2 = 0.999, eps = 1e-8;
    for (var ep = 1; ep <= 600; ep++) {
      g.fill(0);
      for (var i = 0; i < n; i++) {
        var zi = Z[i], out = th[ob2];
        for (k = 0; k < H; k++) {
          var a = th[ob1 + k];
          for (var j = 0; j < d; j++) a += th[o1 + k * d + j] * zi[j];
          h[k] = Math.tanh(a);
          out += th[ow2 + k] * h[k];
        }
        var e = sig(out) - y[i];
        g[ob2] += e;
        for (k = 0; k < H; k++) {
          g[ow2 + k] += e * h[k];
          var dh = e * th[ow2 + k] * (1 - h[k] * h[k]);
          g[ob1 + k] += dh;
          for (j = 0; j < d; j++) g[o1 + k * d + j] += dh * zi[j];
        }
      }
      for (k = 0; k < P; k++) {
        var reg = (k < ob1 || (k >= ow2 && k < ob2)) ? lambda * th[k] : 0;
        var gk = g[k] / n + reg;
        m[k] = b1 * m[k] + (1 - b1) * gk;
        v[k] = b2 * v[k] + (1 - b2) * gk * gk;
        th[k] -= lr * (m[k] / (1 - Math.pow(b1, ep))) / (Math.sqrt(v[k] / (1 - Math.pow(b2, ep))) + eps);
      }
    }
    return { type: 'mlp', H: H, d: d, th: Array.prototype.slice.call(th) };
  }

  function predictZ(mo, z) {
    if (mo.type === 'lr') {
      var s = mo.b;
      for (var j = 0; j < z.length; j++) s += mo.w[j] * z[j];
      return sig(s);
    }
    var H = mo.H, d = mo.d, th = mo.th, ob1 = H * d, ow2 = ob1 + H, ob2 = ow2 + H, out = th[ob2];
    for (var k = 0; k < H; k++) {
      var a = th[ob1 + k];
      for (var jj = 0; jj < d; jj++) a += th[k * d + jj] * z[jj];
      out += th[ow2 + k] * Math.tanh(a);
    }
    return sig(out);
  }

  function fit(cfg, X, y) {
    var sc = scaler(X), Z = X.map(function (x) { return scale(sc, x); });
    var mo = cfg.type === 'lr' ? trainLR(Z, y, cfg.lambda) : trainMLP(Z, y, cfg.lambda, cfg.H, 7);
    mo.sc = sc;
    return mo;
  }
  function predict(mo, x) { return predictZ(mo, scale(mo.sc, x)); }

  // Deterministic, roughly class-balanced fold assignment.
  function folds(y, k) {
    var r = rng(42), idx = y.map(function (_, i) { return i; });
    for (var i = idx.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = idx[i]; idx[i] = idx[j]; idx[j] = t; }
    idx.sort(function (a, b) { return y[a] - y[b]; });
    var f = new Array(y.length);
    idx.forEach(function (row, pos) { f[row] = pos % k; });
    return f;
  }

  function crossVal(cfg, X, y) {
    var n = y.length, k = n <= 30 ? n : 10, f = folds(y, k), oof = new Array(n);
    for (var fold = 0; fold < k; fold++) {
      var tr = [], te = [];
      for (var i = 0; i < n; i++) (f[i] === fold ? te : tr).push(i);
      if (!te.length) continue;
      var ytr = tr.map(function (i) { return y[i]; });
      var pos = ytr.reduce(function (a, b) { return a + b; }, 0);
      if (pos === 0 || pos === ytr.length) {
        // Only one class left in this training fold: predict its rate.
        te.forEach(function (i) { oof[i] = (pos + 0.5) / (ytr.length + 1); });
        continue;
      }
      var mo = fit(cfg, tr.map(function (i) { return X[i]; }), ytr);
      te.forEach(function (i) { oof[i] = predict(mo, X[i]); });
    }
    var correct = 0, ll = 0;
    for (var t = 0; t < n; t++) { if ((oof[t] >= 0.5 ? 1 : 0) === y[t]) correct++; ll += logloss(oof[t], y[t]); }
    return { acc: correct / n, correct: correct, n: n, logloss: ll / n, oof: oof, folds: k };
  }

  // Permutation importance (how much worse predictions get when a feature is
  // scrambled) plus the direction each feature pushes the prediction.
  function importance(mo, X, y) {
    var base = 0, n = y.length, r = rng(9), out = [];
    X.forEach(function (x, i) { base += logloss(predict(mo, x), y[i]); });
    base /= n;
    for (var j = 0; j < FEATURES.length; j++) {
      var present = X.filter(function (x) { return !isNaN(x[j]); }).length;
      if (!present) { out.push({ key: FEATURES[j].key, label: FEATURES[j].label, weight: 0, dir: 0 }); continue; }
      var inc = 0;
      for (var rep = 0; rep < 4; rep++) {
        var col = X.map(function (x) { return x[j]; });
        for (var i = col.length - 1; i > 0; i--) { var s = Math.floor(r() * (i + 1)), tmp = col[i]; col[i] = col[s]; col[s] = tmp; }
        var ll = 0;
        X.forEach(function (x, i2) { var x2 = x.slice(); x2[j] = col[i2]; ll += logloss(predict(mo, x2), y[i2]); });
        inc += ll / n - base;
      }
      // Direction: average change in P(water) when this feature goes up by one standard deviation.
      var eff = 0;
      X.forEach(function (x) {
        var z = scale(mo.sc, x), up = z.slice(), dn = z.slice();
        up[j] += 0.5; dn[j] -= 0.5;
        eff += predictZ(mo, up) - predictZ(mo, dn);
      });
      out.push({ key: FEATURES[j].key, label: FEATURES[j].label, weight: Math.max(0, inc / 4), dir: eff / n });
    }
    var total = out.reduce(function (a, b) { return a + b.weight; }, 0) || 1;
    out.forEach(function (o) { o.share = o.weight / total; });
    return out.sort(function (a, b) { return b.weight - a.weight; });
  }

  // rows: [{ date, x: rawVector, y: 1 water / 0 land }]
  function trainAll(rows, progress) {
    var X = rows.map(function (r) { return r.x; }), y = rows.map(function (r) { return r.y; });
    var n = y.length, pos = y.reduce(function (a, b) { return a + b; }, 0);
    var base = { n: n, water: pos, land: n - pos, majority: pos >= n - pos ? 'water' : 'land', acc: n ? Math.max(pos, n - pos) / n : 0 };
    if (n < MIN_DAYS || pos < MIN_EACH || n - pos < MIN_EACH) {
      return { ready: false, reason: n < MIN_DAYS ? 'need' : 'oneclass', base: base, minDays: MIN_DAYS, minEach: MIN_EACH };
    }
    var results = CANDIDATES.map(function (cfg, i) {
      var cv = crossVal(cfg, X, y);
      if (progress) progress((i + 1) / (CANDIDATES.length + 1));
      return { cfg: cfg, cv: cv };
    });
    results.sort(function (a, b) { return a.cv.logloss - b.cv.logloss || b.cv.acc - a.cv.acc; });
    var best = results[0];
    var mo = fit(best.cfg, X, y);
    var trainCorrect = 0;
    X.forEach(function (x, i) { if ((predict(mo, x) >= 0.5 ? 1 : 0) === y[i]) trainCorrect++; });
    var oof = {};
    rows.forEach(function (r, i) { oof[r.date] = best.cv.oof[i]; });
    return {
      ready: true, model: mo, cfg: best.cfg, base: base,
      cv: { acc: best.cv.acc, correct: best.cv.correct, n: n, logloss: best.cv.logloss, folds: best.cv.folds },
      trainAcc: trainCorrect / n, oof: oof,
      candidates: results.map(function (r) { return { name: r.cfg.name, acc: r.cv.acc, logloss: r.cv.logloss }; }),
      importance: importance(mo, X, y)
    };
  }

  // Sensible starting rules, used until there is enough of your own data to learn from.
  function starter(w) {
    var z = 2.2, wind = num(w.windAvg), gust = num(w.gustMax), t = num(w.tempAvg), rain = num(w.precip);
    var light = num(w.daylight) + 0.5 * num(w.twilight);
    if (!isNaN(wind)) z -= 0.35 * Math.max(0, wind - 10);
    if (!isNaN(gust)) z -= 0.12 * Math.max(0, gust - 18);
    if (!isNaN(t)) z -= 0.12 * Math.max(0, 45 - t);
    if (!isNaN(light)) z -= 0.05 * Math.max(0, 75 - light);
    if (!isNaN(rain)) z -= 8 * Math.max(0, rain - 0.02);
    if (+w.thunder) z -= 4;
    return sig(z);
  }

  return { FEATURES: FEATURES, CANDIDATES: CANDIDATES, MIN_DAYS: MIN_DAYS, MIN_EACH: MIN_EACH, vector: vector, trainAll: trainAll, predict: predict, starter: starter, crossVal: crossVal };
}
