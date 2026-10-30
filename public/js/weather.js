/* =========================================================================
   Weather for Rye, NY from Open-Meteo (free, no API key, CORS enabled).
   Recent and upcoming days come from the forecast API (which also serves
   the last ~3 months); older days come from the historical archive.
   Each date is reduced to the 6–8 PM practice features the model uses.
   ========================================================================= */
(function () {
  'use strict';

  var S = window.Sun, P = S.PLACE;
  var HOURLY = 'temperature_2m,wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,cloud_cover,weather_code';
  var FORECAST = 'https://api.open-meteo.com/v1/forecast';
  var ARCHIVE = 'https://archive-api.open-meteo.com/v1/archive';
  var PRACTICE_HOURS = [18, 19, 20];       // 6, 7 and 8 PM
  var FORECAST_BACK = 80;                  // days the forecast API reliably covers in the past
  var FORECAST_AHEAD = 15;

  var DIRS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  function compass(deg) { return deg == null || isNaN(deg) ? '–' : DIRS[Math.round(((deg % 360) + 360) % 360 / 22.5) % 16]; }

  function url(base, start, end) {
    // elevation: the boathouse sits at sea level, so temperatures are not adjusted to the
    // grid cell's average height. cell_selection=nearest uses the grid cell closest to the
    // harbor itself instead of preferring a land cell further away.
    return base + '?latitude=' + P.lat + '&longitude=' + P.lon + '&elevation=' + P.elevation + '&cell_selection=nearest&hourly=' + HOURLY +
      '&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch' +
      '&timezone=' + encodeURIComponent(P.tz) + '&start_date=' + start + '&end_date=' + end;
  }

  function round(v, d) { var f = Math.pow(10, d || 0); return Math.round(v * f) / f; }
  function avg(a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; }

  // Reduce one day's hourly series to practice features.
  function features(dateKey, H) {
    var temp = [], wind = [], gust = [], u = 0, v = 0, rain = 0, cloud = [], thunder = false, codes = [];
    PRACTICE_HOURS.forEach(function (h) {
      var r = H[h];
      if (!r) return;
      if (r.t != null) temp.push(r.t);
      if (r.w != null) wind.push(r.w);
      if (r.g != null) gust.push(r.g);
      if (r.w != null && r.d != null) { u += r.w * Math.sin(r.d * Math.PI / 180); v += r.w * Math.cos(r.d * Math.PI / 180); }
      if (r.p != null) rain += r.p;
      if (r.c != null) cloud.push(r.c);
      if (r.code != null) codes.push(r.code);
    });
    [17, 18, 19, 20].forEach(function (h) { if (H[h] && H[h].code >= 95) thunder = true; });
    if (!temp.length || !wind.length) return null;
    var dir = (u === 0 && v === 0) ? null : (Math.atan2(u, v) * 180 / Math.PI + 360) % 360;
    var L = S.light(dateKey);
    return {
      tempAvg: round(avg(temp), 1), tempMin: round(Math.min.apply(null, temp), 1),
      windAvg: round(avg(wind), 1), gustMax: gust.length ? round(Math.max.apply(null, gust), 1) : null,
      dir: dir == null ? null : Math.round(dir),
      precip: round(rain, 2), cloud: cloud.length ? Math.round(avg(cloud)) : null,
      thunder: thunder ? 1 : 0, code: codes.length ? Math.max.apply(null, codes) : null,
      daylight: L.daylight, twilight: L.twilight, sunset: L.sunset,
      source: 'open-meteo'
    };
  }

  function parse(json) {
    var out = {}, hr = json && json.hourly;
    if (!hr || !hr.time) return out;
    var byDay = {};
    for (var i = 0; i < hr.time.length; i++) {
      var t = hr.time[i], day = t.slice(0, 10), h = +t.slice(11, 13);
      (byDay[day] = byDay[day] || {})[h] = {
        t: hr.temperature_2m[i], w: hr.wind_speed_10m[i], d: hr.wind_direction_10m[i], g: hr.wind_gusts_10m ? hr.wind_gusts_10m[i] : null,
        p: hr.precipitation ? hr.precipitation[i] : null, c: hr.cloud_cover ? hr.cloud_cover[i] : null, code: hr.weather_code ? hr.weather_code[i] : null
      };
    }
    Object.keys(byDay).forEach(function (d) { var f = features(d, byDay[d]); if (f) out[d] = f; });
    return out;
  }

  async function getJSON(u) {
    var res;
    try { res = await fetch(u); }
    catch (e) { throw new Error('Could not reach the weather service. Check your connection.'); }
    if (!res.ok) {
      var msg = 'Weather service error ' + res.status;
      try { var j = await res.json(); if (j && j.reason) msg += ': ' + j.reason; } catch (e) {}
      throw new Error(msg);
    }
    return res.json();
  }

  // Fetch practice features for every date in [start, end]. Returns { 'YYYY-MM-DD': features }.
  async function fetchRange(start, end) {
    var today = S.todayKey();
    var cut = S.addDays(today, -FORECAST_BACK);
    var maxEnd = S.addDays(today, FORECAST_AHEAD);
    if (end > maxEnd) end = maxEnd;
    if (start > end) return {};
    var jobs = [];
    if (start < cut) jobs.push(getJSON(url(ARCHIVE, start, end < cut ? end : S.addDays(cut, -1))));
    if (end >= cut) jobs.push(getJSON(url(FORECAST, start < cut ? cut : start, end)));
    var results = await Promise.all(jobs);
    var out = {};
    results.forEach(function (j) { Object.assign(out, parse(j)); });
    var stamp = Date.now();
    Object.keys(out).forEach(function (d) { out[d].fetchedAt = stamp; out[d].provisional = d >= today; });
    return out;
  }

  // Weather that only comes from the date (used for manual entries without a fetch).
  function lightOnly(dateKey) {
    var L = S.light(dateKey);
    return { daylight: L.daylight, twilight: L.twilight, sunset: L.sunset };
  }

  window.Weather = { fetchRange: fetchRange, parse: parse, compass: compass, lightOnly: lightOnly, FORECAST_AHEAD: FORECAST_AHEAD, PRACTICE_HOURS: PRACTICE_HOURS };
})();
