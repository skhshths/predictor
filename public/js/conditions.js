/* =========================================================================
   Conditions: 1–5 ratings of how it was on the water, "most similar day"
   matching, and a plain forecast summary when no logged day is close
   enough.

   Similarity compares the practice-time weather of two days feature by feature,
   using natural scales (e.g. 5 mph of wind ≈ 10 °F of temperature in
   importance) and weights that favour what matters most on the water:
   wind, gusts and wind direction.
   ========================================================================= */
(function () {
  'use strict';

  var W = window.Weather;

  var LABELS = { 1: 'Very rough', 2: 'Rough', 3: 'OK', 4: 'Good', 5: 'Glassy' };
  var MATCH = 0.65;          // similarity needed to call a day "a match"

  // [feature, natural scale, weight]
  var FEATS = [
    ['windAvg', 5, 3], ['gustMax', 7, 2], ['windN', 6, 1.5], ['windE', 6, 1.5],
    ['tempAvg', 10, 1], ['light', 40, 1], ['cloud', 40, 0.4], ['precip', 0.1, 1.5], ['thunder', 1, 2]
  ];

  function n(v) { return v == null || v === '' || isNaN(v) ? null : +v; }
  function vec(w) {
    var s = n(w.windAvg), d = n(w.dir);
    return {
      windAvg: s, gustMax: n(w.gustMax),
      windN: s != null && d != null ? s * Math.cos(d * Math.PI / 180) : null,
      windE: s != null && d != null ? s * Math.sin(d * Math.PI / 180) : null,
      tempAvg: n(w.tempAvg),
      light: n(w.daylight) != null ? n(w.daylight) + (n(w.twilight) || 0) : null,
      cloud: n(w.cloud), precip: n(w.precip), thunder: w.thunder == null ? null : (+w.thunder ? 1 : 0)
    };
  }
  function distance(a, b) {
    var va = vec(a), vb = vec(b), sum = 0, wsum = 0;
    FEATS.forEach(function (f) {
      var x = va[f[0]], y = vb[f[0]];
      if (x == null || y == null) return;
      var z = (x - y) / f[1];
      sum += f[2] * z * z; wsum += f[2];
    });
    return wsum ? Math.sqrt(sum / wsum) : Infinity;
  }
  function similarity(a, b) { var d = distance(a, b); return isFinite(d) ? Math.exp(-d * d / 0.8) : 0; }

  // Logged days ranked by similarity to weather `w`. Only days on the water have
  // on-water conditions, so those are the candidates; rated days rank first on ties.
  function similarDays(w, days, exclude) {
    var out = [];
    Object.keys(days).forEach(function (d) {
      var e = days[d];
      if (d === exclude || (e.outcome !== 'water' && e.outcome !== 'split') || !e.weather || e.weather.windAvg == null) return;
      out.push({ date: d, sim: similarity(w, e.weather), entry: e });
    });
    return out.sort(function (a, b) { return b.sim - a.sim || (b.entry.rating ? 1 : 0) - (a.entry.rating ? 1 : 0); });
  }

  function compassFrom(dir) { return W.compass(dir); }
  // Milton Harbor opens to the south onto Long Island Sound, so southerly winds
  // have a long fetch up the harbor; northerly winds come off the land.
  function exposure(dir) {
    if (dir == null) return 'unknown';
    var d = ((dir % 360) + 360) % 360;
    if (d >= 125 && d <= 235) return 'sound';
    if (d >= 300 || d <= 60) return 'offshore';
    return 'cross';
  }

  // A rough 1–5 rating estimated from the weather alone.
  function heuristic(w) {
    var wind = n(w.windAvg) || 0, gust = n(w.gustMax) || wind, t = n(w.tempAvg), light = n(w.daylight) != null ? n(w.daylight) + (n(w.twilight) || 0) : null;
    var r = 5 - Math.max(0, wind - 5) * 0.2 - Math.max(0, gust - 14) * 0.06;
    var ex = exposure(n(w.dir));
    if (ex === 'sound') r -= Math.max(0, wind - 6) * 0.08;
    if (ex === 'offshore') r += Math.min(0.4, Math.max(0, wind - 6) * 0.05);
    if (t != null && t < 45) r -= 0.4;
    if (t != null && t < 35) r -= 0.4;
    if (n(w.precip) > 0.02) r -= 0.8;
    if (light != null && light < 45) r -= 0.4;
    if (+w.thunder) r = 1;
    return Math.max(1, Math.min(5, r));
  }

  // Expected rating: similarity-weighted average of the most similar rated days,
  // blended with the weather-only estimate when evidence is thin.
  function expected(w, days, exclude) {
    var rated = similarDays(w, days, exclude).filter(function (s) { return s.entry.rating; }).slice(0, 7);
    var h = heuristic(w), sw = 0, sr = 0;
    rated.forEach(function (s) { var k = s.sim * s.sim; sw += k; sr += k * s.entry.rating; });
    var prior = 0.35;
    var rating = (sr + h * prior) / (sw + prior);
    var basis = sw >= 1 ? 'similar' : sw > 0.15 ? 'blend' : 'estimate';
    return { rating: Math.max(1, Math.min(5, rating)), basis: basis, used: rated.filter(function (s) { return s.sim > 0.2; }).length, heuristic: h };
  }

  function round(v) { return Math.round(v); }

  // Plain summary of the forecast for a day, used when no logged day is similar.
  function describe(w, dateKey) {
    var lines = [], wind = n(w.windAvg), gust = n(w.gustMax), t = n(w.tempAvg), tl = n(w.tempMin), dir = n(w.dir);
    var ex = exposure(dir), from = dir == null ? '' : ' from the ' + compassFrom(dir);
    if (wind == null) lines.push('Wind: no data.');
    else {
      var strength = wind < 5 ? 'Calm' : wind < 9 ? 'Light' : wind < 13 ? 'Moderate' : wind < 18 ? 'Strong' : 'Very strong';
      lines.push(strength + ' wind: ' + round(wind) + ' mph' + from + '.');
    }
    if (wind != null && wind >= 6) {
      if (ex === 'sound') lines.push('Blows up the harbor from Long Island Sound, so water is usually rougher near the harbor mouth.');
      else if (ex === 'offshore') lines.push('Blows off the land, so water is usually calmer near the boathouse than farther out.');
      else if (ex === 'cross') lines.push('Blows across the harbor.');
    }
    if (gust != null && wind != null && gust - wind >= 8) lines.push('Gusts to ' + round(gust) + ' mph.');
    if (t != null) {
      var feel = t < 40 ? 'Cold' : t < 50 ? 'Chilly' : t < 62 ? 'Cool' : t < 75 ? 'Mild' : t < 85 ? 'Warm' : 'Hot';
      lines.push(feel + ': ' + round(t) + '°F' + (tl != null && t - tl >= 3 ? ', low ' + round(tl) + '°F' : '') + '.');
    }
    var L = window.Sun.light(dateKey);
    if (L.daylight >= L.window) lines.push('Daylight for all of practice.');
    else if (L.daylight > 0) lines.push('Sunset at ' + L.sunset + '. Last ' + (L.window - L.daylight) + ' minutes in twilight' + (L.daylight + L.twilight < L.window ? ', then dark' : '') + '.');
    else if (L.twilight > 0) lines.push('Sunset at ' + L.sunset + ', before practice. ' + L.twilight + ' minutes of twilight, then dark.');
    else lines.push('Dark for all of practice (sunset ' + L.sunset + ').');
    if (+w.thunder) lines.push('Thunderstorms possible.');
    else if (n(w.precip) > 0.02) lines.push('Rain likely: ' + w.precip + ' in during practice.');
    else if (n(w.cloud) != null) lines.push(n(w.cloud) > 80 ? 'Overcast.' : n(w.cloud) > 40 ? 'Partly cloudy.' : 'Mostly clear.');
    return lines;
  }

  window.Conditions = { LABELS: LABELS, MATCH: MATCH, similarity: similarity, similarDays: similarDays, expected: expected, describe: describe, heuristic: heuristic, exposure: exposure };
})();
