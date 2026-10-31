/* =========================================================================
   Sun position and practice-time light for Rye, NY.
   Everything here is computed locally from the date, so light works even
   for days entered by hand or when the weather service is unreachable.
   ========================================================================= */
(function () {
  'use strict';

  var RAD = Math.PI / 180;
  // RowAmerica Rye (RAR) boathouse at the Rye City Boat Basin, 668 Milton Road, on Milton Harbor.
  // Coordinates of the basin (Waterway Guide: N 40° 57.470', W 073° 41.379').
  var PLACE = { name: 'RAR boathouse, Milton Harbor, Rye NY', short: 'Milton Harbor, Rye', lat: 40.9578, lon: -73.6897, elevation: 2, tz: 'America/New_York' };
  // Practice times: Saturdays 10:00 AM–12:15 PM, every other day 6:00–8:15 PM.
  // `hours` are the whole hours whose weather describes the practice.
  var SCHEDULE = {
    evening: { id: 'pm', start: [18, 0], end: [20, 15], hours: [18, 19, 20], label: '6:00–8:15 PM', short: '6–8 PM' },
    saturday: { id: 'sat', start: [10, 0], end: [12, 15], hours: [10, 11, 12], label: '10:00 AM–12:15 PM', short: '10 AM–12 PM' }
  };
  var PRACTICE = SCHEDULE.evening;
  function weekday(key) { var p = key.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])).getUTCDay(); }
  function practice(key) { return weekday(key) === 6 ? SCHEDULE.saturday : SCHEDULE.evening; }

  var dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: PLACE.tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  function parts(ms) {
    var o = {};
    dtf.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return o;
  }
  // Milliseconds that local Rye time is ahead of UTC at instant `ms` (negative in New York).
  function offset(ms) {
    var o = parts(ms);
    var asUTC = Date.UTC(+o.year, +o.month - 1, +o.day, +o.hour % 24, +o.minute, +o.second);
    return asUTC - Math.floor(ms / 1000) * 1000;
  }
  // UTC instant for a wall-clock time in Rye on a YYYY-MM-DD date.
  function zoned(dateKey, h, m) {
    var p = dateKey.split('-');
    var guess = Date.UTC(+p[0], +p[1] - 1, +p[2], h, m || 0);
    var first = guess - offset(guess);
    return guess - offset(first);
  }
  // Today's date in Rye as YYYY-MM-DD (not the device's time zone).
  function todayKey(ms) {
    var o = parts(ms == null ? Date.now() : ms);
    return o.year + '-' + o.month + '-' + o.day;
  }
  function nowMinutes() { var o = parts(Date.now()); return (+o.hour % 24) * 60 + +o.minute; }

  function addDays(key, n) {
    var p = key.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.toISOString().slice(0, 10);
  }

  // Solar altitude in degrees (low-precision almanac formula, about 0.1° accuracy).
  function altitude(ms, lat, lon) {
    var d = ms / 86400000 + 2440587.5 - 2451545.0;
    var g = ((357.529 + 0.98560028 * d) % 360) * RAD;
    var q = (280.459 + 0.98564736 * d) % 360;
    var L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) * RAD;
    var e = (23.439 - 0.00000036 * d) * RAD;
    var ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L)) / RAD;
    var dec = Math.asin(Math.sin(e) * Math.sin(L));
    var gmst = (18.697374558 + 24.06570982441908 * d) % 24;
    var ha = (gmst * 15 + lon - ra) * RAD;
    var la = lat * RAD;
    return Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha)) / RAD;
  }

  function fmtClock(ms) {
    var o = parts(ms), h = +o.hour % 24, m = o.minute;
    return (h % 12 || 12) + ':' + m + ' ' + (h < 12 ? 'AM' : 'PM');
  }

  // Minutes of daylight (sun above the horizon) and civil twilight (sun 0–6° below)
  // inside that day's practice window, plus sunset and dusk times.
  var cache = {};
  function light(dateKey) {
    if (cache[dateKey]) return cache[dateKey];
    var P = practice(dateKey);
    var start = zoned(dateKey, P.start[0], P.start[1]);
    var end = zoned(dateKey, P.end[0], P.end[1]);
    var mins = Math.round((end - start) / 60000), day = 0, twi = 0;
    for (var k = 0; k < mins; k++) {
      var a = altitude(start + (k + 0.5) * 60000, PLACE.lat, PLACE.lon);
      if (a > -0.833) day++;
      else if (a > -6) twi++;
    }
    var sunset = null, dusk = null, prev = null;
    var from = zoned(dateKey, 15, 0);
    for (var t = 0; t <= 7 * 60; t++) {
      var ms = from + t * 60000, alt = altitude(ms, PLACE.lat, PLACE.lon);
      if (prev != null && prev > -0.833 && alt <= -0.833) sunset = ms;
      if (prev != null && prev > -6 && alt <= -6) { dusk = ms; break; }
      prev = alt;
    }
    var out = { daylight: day, twilight: twi, window: mins, sunset: sunset ? fmtClock(sunset) : null, dusk: dusk ? fmtClock(dusk) : null };
    cache[dateKey] = out;
    return out;
  }

  window.Sun = { PLACE: PLACE, PRACTICE: PRACTICE, SCHEDULE: SCHEDULE, practice: practice, weekday: weekday, light: light, altitude: altitude, zoned: zoned, todayKey: todayKey, nowMinutes: nowMinutes, addDays: addDays, fmtClock: fmtClock };
})();
