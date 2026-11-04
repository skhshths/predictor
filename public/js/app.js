/* =========================================================================
   RAR Predictor: app
   Lock screen, daily logging, automatic weather collection, training in a
   Web Worker, predictions with certainty, and training-data management.
   ========================================================================= */
(function () {
  'use strict';

  var S = window.Sun, W = window.Weather, C = window.Conditions, L = modelLib();
  var KEY = 'rar-predictor/v1';
  var PASSWORD = 'rar';
  var FORECAST_TTL = 30 * 60 * 1000;

  /* ---------- Small helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function h(html) { var t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function pct(p) { return Math.round(p * 100) + '%'; }
  function num(v, d) { return v == null || isNaN(v) ? '–' : (+v).toFixed(d == null ? 0 : d); }
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dateObj(key) { var p = key.split('-'); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function fmtDate(key, opts) {
    var d = dateObj(key), s = DOW[d.getUTCDay()] + ', ' + MON[d.getUTCMonth()] + ' ' + d.getUTCDate();
    if ((opts && opts.year) || key.slice(0, 4) !== S.todayKey().slice(0, 4)) s += ', ' + d.getUTCFullYear();
    return s;
  }
  function relDay(key) {
    var t = S.todayKey();
    if (key === t) return 'Today';
    if (key === S.addDays(t, 1)) return 'Tomorrow';
    if (key === S.addDays(t, -1)) return 'Yesterday';
    return fmtDate(key);
  }
  function ago(ms) {
    var s = (Date.now() - ms) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' days ago';
  }
  function debounce(fn, ms) { var t; return function () { clearTimeout(t); t = setTimeout(fn, ms); }; }

  var ICONS = {
    waves: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/><path d="M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    land: '<path d="M14.4 14.4 9.6 9.6"/><path d="M18.657 21.485a2 2 0 1 1-2.829-2.828l-1.767 1.768a2 2 0 1 1-2.829-2.829l6.364-6.364a2 2 0 1 1 2.829 2.829l-1.768 1.767a2 2 0 1 1 2.828 2.829z"/><path d="m21.5 21.5-1.4-1.4"/><path d="M3.9 3.9 2.5 2.5"/><path d="M6.404 12.768a2 2 0 1 1-2.829-2.829l1.768-1.767a2 2 0 1 1-2.828-2.829l2.828-2.828a2 2 0 1 1 2.829 2.828l1.767-1.768a2 2 0 1 1 2.829 2.829z"/>',
    lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    thermo: '<path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>',
    wind: '<path d="M12.8 19.6A2 2 0 1 0 14 16H2"/><path d="M17.5 8a2.5 2.5 0 1 1 2 4H2"/><path d="M9.8 4.4A2 2 0 1 1 11 8H2"/>',
    up: '<path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>',
    sunset: '<path d="M12 10V2"/><path d="m4.93 10.93 1.41 1.41"/><path d="M2 18h2"/><path d="M20 18h2"/><path d="m19.07 10.93-1.41 1.41"/><path d="M22 22H2"/><path d="m16 6-4 4-4-4"/><path d="M16 18a4 4 0 0 0-8 0"/>',
    rain: '<path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M16 14v6"/><path d="M8 14v6"/><path d="M12 16v6"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    cpu: '<rect width="16" height="16" x="4" y="4" rx="2"/><rect width="6" height="6" x="9" y="9" rx="1"/><path d="M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2"/>',
    calPlus: '<path d="M8 2v4"/><path d="M16 2v4"/><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16v6"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    edit: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
    star: '<path d="M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z"/>',
    split: '<path d="M16 3h5v5"/><path d="M8 3H3v5"/><path d="M12 22v-8.3a4 4 0 0 0-1.172-2.872L3 3"/><path d="m15 9 6-6"/>',
    table: '<path d="M12 3v18"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18"/><path d="M3 15h18"/>'
  };
  function icon(name, style) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"' + (style ? ' style="' + style + '"' : '') + '>' + (ICONS[name] || '') + '</svg>'; }

  function toast(msg, opts) {
    opts = opts || {};
    var box = $('#toasts');
    var t = h('<div class="toast" role="status"><span>' + esc(msg) + '</span>' + (opts.action ? '<button type="button">' + esc(opts.action) + '</button>' : '') + '</div>');
    box.appendChild(t);
    while (box.children.length > 3) box.firstElementChild.remove();
    requestAnimationFrame(function () { t.classList.add('in'); });
    var gone = false;
    function close() { if (gone) return; gone = true; t.classList.add('out'); setTimeout(function () { t.remove(); }, 220); }
    if (opts.action) t.querySelector('button').addEventListener('click', function () { opts.onAction(); close(); });
    setTimeout(close, opts.duration || (opts.action ? 6000 : 2800));
  }

  var openModals = 0;
  function modal(opts) {
    var root = h('<div class="modal-root" role="dialog" aria-modal="true" aria-label="' + esc(opts.title) + '"><div class="backdrop"></div>' +
      '<div class="modal ' + (opts.size || '') + '"><div class="modal-head"><h2>' + esc(opts.title) + '</h2><button class="icon-btn sm" data-close aria-label="Close">' + icon('x') + '</button></div>' +
      '<div class="modal-body"></div><div class="modal-foot"></div></div></div>');
    var body = $('.modal-body', root), foot = $('.modal-foot', root);
    if (typeof opts.body === 'string') body.innerHTML = opts.body; else body.appendChild(opts.body);
    (opts.actions || []).forEach(function (a) {
      var b = h('<button type="button" class="btn ' + (a.kind || 'btn-soft') + (a.left ? ' left' : '') + '">' + esc(a.label) + '</button>');
      b.addEventListener('click', function () { var r = a.onClick ? a.onClick(close, b) : true; if (r !== false) close(); });
      foot.appendChild(b);
    });
    var closed = false, prev = document.activeElement;
    function close() {
      if (closed) return; closed = true; openModals--;
      root.classList.remove('open');
      if (!openModals) document.body.classList.remove('no-scroll');
      setTimeout(function () { root.remove(); }, 300);
      if (prev && prev.focus) prev.focus();
      if (opts.onClose) opts.onClose();
    }
    $('.backdrop', root).addEventListener('click', close);
    $('[data-close]', root).addEventListener('click', close);
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { var pb = $('.btn-primary', foot); if (pb) pb.click(); }
    });
    document.body.appendChild(root); document.body.classList.add('no-scroll'); openModals++;
    requestAnimationFrame(function () { root.classList.add('open'); var f = $('[autofocus]', body) || $('.btn-primary', foot); if (f) f.focus(); });
    return { root: root, body: body, close: close };
  }
  function confirmBox(title, text, label, kind) {
    return new Promise(function (resolve) {
      var ok = false;
      modal({ title: title, size: 'sm', body: '<p class="confirm-text">' + esc(text) + '</p>', actions: [
        { label: 'Cancel', kind: 'btn-ghost' },
        { label: label || 'Delete', kind: kind || 'btn-danger', onClick: function () { ok = true; } }
      ], onClose: function () { resolve(ok); } });
    });
  }
  function seg(el, value, onChange) {
    function set(v) { $$('button', el).forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === v)); }); }
    set(value);
    el.addEventListener('click', function (e) { var b = e.target.closest('button[data-v]'); if (!b) return; set(b.dataset.v); onChange(b.dataset.v); });
    return set;
  }
  function download(name, text, type) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: type || 'application/json' }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function pickFile(accept) {
    return new Promise(function (resolve) {
      var i = document.createElement('input'); i.type = 'file'; i.accept = accept || '';
      i.addEventListener('change', function () { resolve(i.files[0]); }); i.click();
    });
  }

  /* ---------- Storage ---------- */
  function blank() { return { version: 1, days: {}, forecast: null, model: null, trainedAt: null, trainedOn: null, preds: {}, synced: { days: {}, preds: {}, version: null } }; }
  function load() {
    try {
      var d = JSON.parse(localStorage.getItem(KEY));
      if (d && d.days) { d = Object.assign(blank(), d); if (!d.synced || !d.synced.days) d.synced = blank().synced; return d; }
    } catch (e) {}
    return blank();
  }
  var store = load();
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); }
    catch (e) { toast('Could not save. Browser storage is full or blocked.'); }
    if (mode === 'shared') scheduleSync();
  }

  /* ---------- Shared data (Cloudflare Worker API) ----------
     In shared mode every device keeps a local copy and syncs with the team's
     single copy on the server. store.synced remembers what the server had at
     the last sync (as JSON per date), so local edits can be told apart from
     remote ones: local edits are pushed, remote ones are pulled in. */
  var mode = 'local';           // 'shared' when the /api backend is available
  var net = { busy: false, again: false, lastOk: 0, error: null, timer: null };
  function getToken() { try { return sessionStorage.getItem('rar-token') || localStorage.getItem('rar-predictor/token'); } catch (e) { return null; } }
  function setToken(t, remember) {
    try {
      sessionStorage.setItem('rar-token', t);
      if (remember) localStorage.setItem('rar-predictor/token', t);
    } catch (e) {}
  }
  function clearToken() { try { sessionStorage.removeItem('rar-token'); localStorage.removeItem('rar-predictor/token'); } catch (e) {} }
  async function detectMode() {
    if (location.protocol === 'file:') return 'local';
    try {
      var r = await fetch('/api/health', { cache: 'no-store' });
      if (r.ok && /json/.test(r.headers.get('content-type') || '')) { var j = await r.json(); if (j && j.shared) return 'shared'; }
    } catch (e) {}
    return 'local';
  }
  function SignedOut() { this.message = 'Signed out'; }
  async function api(path, body) {
    var res;
    try {
      res = await fetch(path, {
        method: body ? 'POST' : 'GET', cache: 'no-store',
        headers: Object.assign({ authorization: 'Bearer ' + (getToken() || '') }, body ? { 'content-type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined
      });
    } catch (e) { throw new Error('Offline. Changes are saved on this device and will sync when you reconnect.'); }
    if (res.status === 401) { clearToken(); throw new SignedOut(); }
    var j = null; try { j = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((j && j.error) || 'Server error ' + res.status);
    return j;
  }
  function keysOf() { var o = {}; for (var i = 0; i < arguments.length; i++) Object.keys(arguments[i] || {}).forEach(function (k) { o[k] = 1; }); return Object.keys(o); }
  function localChanges() {
    var out = { days: {}, preds: {} }, n = 0;
    ['days', 'preds'].forEach(function (k) {
      var local = store[k], synced = store.synced[k];
      keysOf(local, synced).forEach(function (d) {
        var cur = local[d] === undefined ? undefined : JSON.stringify(local[d]);
        if (cur !== synced[d]) { out[k][d] = local[d] === undefined ? null : local[d]; n++; }
      });
    });
    out.n = n;
    return out;
  }
  function mergeRemote(r) {
    var changed = false;
    ['days', 'preds'].forEach(function (k) {
      var local = store[k], synced = store.synced[k], server = r[k] || {};
      keysOf(local, synced, server).forEach(function (d) {
        var cur = local[d] === undefined ? undefined : JSON.stringify(local[d]);
        if (cur !== synced[d]) return;                       // unsent local edit wins; it is pushed next
        var srv = server[d] === undefined ? undefined : JSON.stringify(server[d]);
        if (srv === cur) return;
        if (server[d] === undefined) delete local[d]; else local[d] = server[d];
        changed = true;
      });
      var snap = {};
      Object.keys(server).forEach(function (d) { snap[d] = JSON.stringify(server[d]); });
      store.synced[k] = snap;
    });
    store.synced.version = r.version;
    return changed;
  }
  var scheduleSync = debounce(function () { syncNow(); }, 400);
  async function syncNow() {
    if (mode !== 'shared') return;
    if (net.busy) { net.again = true; return; }
    net.busy = true; net.again = false;
    var pulled = false;
    try {
      // 1. Push local edits.
      var ch = localChanges();
      if (ch.n) {
        var all = [];
        ['days', 'preds'].forEach(function (k) { Object.keys(ch[k]).forEach(function (d) { all.push([k, d, ch[k][d]]); }); });
        for (var i = 0; i < all.length; i += 1500) {
          var part = { days: {}, preds: {} };
          all.slice(i, i + 1500).forEach(function (c) { part[c[0]][c[1]] = c[2]; });
          var before = store.synced.version;
          var res = await api('/api/sync', part);
          all.slice(i, i + 1500).forEach(function (c) {
            if (c[2] === null) delete store.synced[c[0]][c[1]]; else store.synced[c[0]][c[1]] = JSON.stringify(c[2]);
          });
          // Only skip the next full pull if nobody else wrote in between.
          if (before != null && res.version === before + 1) store.synced.version = res.version; else store.synced.version = null;
        }
      }
      // 2. Pull everyone else's edits.
      var r = await api('/api/data' + (store.synced.version != null ? '?v=' + store.synced.version : ''));
      if (!r.unchanged) pulled = mergeRemote(r);
      net.lastOk = Date.now(); net.error = null;
      try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
    } catch (e) {
      if (e instanceof SignedOut) { net.busy = false; signedOut(); return; }
      net.error = e.message;
    }
    net.busy = false;
    renderStatus();
    if (pulled) { renderAll(); maybeRetrain(); if (Object.keys(store.days).some(needsWeather)) sync(); }
    if (net.again) syncNow();
  }
  function signedOut() {
    renderLock('You were signed out. The password may have changed.');
  }

  /* ---------- Lock ---------- */
  function unlocked() {
    if (mode === 'shared') return !!getToken();
    try { return sessionStorage.getItem('rar-unlocked') === '1' || localStorage.getItem('rar-predictor/unlocked') === '1'; } catch (e) { return false; }
  }
  function lock() {
    clearToken();
    try { sessionStorage.removeItem('rar-unlocked'); localStorage.removeItem('rar-predictor/unlocked'); } catch (e) {}
    location.reload();
  }
  var started = false;
  function renderLock(message) {
    if (started) { try { sessionStorage.setItem('rar-msg', message || ''); } catch (e) {} location.reload(); return; }
    if (!message) { try { message = sessionStorage.getItem('rar-msg') || ''; sessionStorage.removeItem('rar-msg'); } catch (e) {} }
    $('#topActions').innerHTML = themeBtnHtml();
    bindTheme();
    $('#view').innerHTML =
      '<div class="lock"><div class="panel lock-card">' +
        '<div class="lock-icon">' + icon('lock') + '</div>' +
        '<h1>RAR Predictor</h1><p>Enter the team password to continue.</p>' +
        '<form id="lockForm" autocomplete="off">' +
          '<input class="text-input" id="pw" type="password" placeholder="Password" aria-label="Password" autocomplete="current-password" autofocus>' +
          '<label class="check-label"><input type="checkbox" id="remember">Keep signed in on this device</label>' +
          '<button class="btn btn-primary btn-lg" type="submit">Unlock</button>' +
          '<div class="err" id="pwErr" role="alert">' + esc(message || '') + '</div>' +
        '</form></div></div>';
    var form = $('#lockForm'), pw = $('#pw');
    pw.focus();
    function fail(msg) {
      $('#pwErr').textContent = msg;
      var card = $('.lock-card'); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
      pw.select();
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (mode === 'shared') {
        var btn = $('button[type=submit]', form); btn.disabled = true;
        fetch('/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ password: pw.value }) })
          .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (x) {
            btn.disabled = false;
            if (!x.ok) return fail('Wrong password.');
            setToken(x.j.token, $('#remember').checked);
            start();
          })
          .catch(function () { btn.disabled = false; fail('Could not reach the server. Check your connection.'); });
        return;
      }
      if (pw.value === PASSWORD) {
        try {
          sessionStorage.setItem('rar-unlocked', '1');
          if ($('#remember').checked) localStorage.setItem('rar-predictor/unlocked', '1');
        } catch (err) {}
        start();
      } else fail('Wrong password.');
    });
  }

  /* ---------- Theme ---------- */
  function themeBtnHtml() { return '<button class="icon-btn" id="themeBtn" title="Toggle dark mode" aria-label="Toggle dark mode">' + icon(document.documentElement.dataset.theme === 'dark' ? 'sun' : 'moon') + '</button>'; }
  function bindTheme() {
    $('#themeBtn').addEventListener('click', function () {
      var t = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      var run = function () { document.documentElement.dataset.theme = t; $('#themeBtn').innerHTML = icon(t === 'dark' ? 'sun' : 'moon'); };
      if (document.startViewTransition) document.startViewTransition(run); else run();
      try { localStorage.setItem('rar-predictor/theme', t); } catch (e) {}
    });
  }

  /* ---------- Data helpers ---------- */
  function weatherFor(date) {
    var e = store.days[date];
    if (e && e.weather && e.weather.tempAvg != null) return e.weather;
    if (store.forecast && store.forecast.days[date]) return store.forecast.days[date];
    return e && e.weather ? e.weather : null;
  }
  function predictFor(w) {
    if (!w || w.tempAvg == null || w.windAvg == null) return null;
    var M = store.model;
    // A model trained before the feature list changed is ignored until it retrains.
    if (M && M.ready && M.model.sc && M.model.sc.mu.length === L.FEATURES.length) return { p: L.predict(M.model, L.vector(w)), by: 'model' };
    return { p: L.starter(w), by: 'rules' };
  }
  // What a logged day teaches the model:
  //   1    the weather allowed rowing (on the water, or half & half)
  //   0    the weather kept the team on land
  //   null not a weather decision (planned land day, no practice): never used for training
  function labelOf(e) {
    if (!e || !e.outcome) return null;
    if (e.outcome === 'water' || e.outcome === 'split') return 1;
    if (e.outcome === 'land') return e.landWhy === 'planned' ? null : 0;
    return null;
  }
  function onWater(e) { return !!e && (e.outcome === 'water' || e.outcome === 'split'); }
  function outcomeText(e) {
    if (!e || !e.outcome) return '';
    return e.outcome === 'water' ? 'on the water' : e.outcome === 'split' ? 'half & half' : e.outcome === 'none' ? 'no practice' : e.landWhy === 'planned' ? 'planned land day' : 'on land (weather)';
  }
  function loggedDates() { return Object.keys(store.days).filter(function (d) { return store.days[d].outcome; }); }
  function trainingRows() {
    return Object.keys(store.days).sort().filter(function (d) {
      var e = store.days[d];
      return labelOf(e) !== null && e.include !== false && e.weather && e.weather.tempAvg != null && e.weather.windAvg != null;
    }).map(function (d) { var e = store.days[d]; return { date: d, x: L.vector(e.weather), y: labelOf(e) }; });
  }
  function signature(rows) { return rows.map(function (r) { return r.date + r.y + r.x.map(function (v) { return isNaN(v) ? '' : Math.round(v * 100); }).join(','); }).join('|'); }
  function liveRecord() {
    var n = 0, ok = 0;
    Object.keys(store.days).forEach(function (d) {
      var e = store.days[d];
      var y = labelOf(e);
      if (!e.prediction || y === null) return;
      n++; if ((e.prediction.p >= 0.5) === (y === 1)) ok++;
    });
    return { n: n, ok: ok };
  }

  // Keep a snapshot of today's prediction (made before practice) to measure real-world accuracy.
  function snapshot() {
    var t = S.todayKey(), e = store.days[t];
    if (e && e.outcome) return;
    var P = S.practice(t);
    if (S.nowMinutes() >= P.start[0] * 60 + P.start[1] && store.preds[t]) return; // frozen once practice starts
    var pr = predictFor(weatherFor(t));
    if (pr) store.preds[t] = { p: pr.p, by: pr.by, at: Date.now() };
    var cut = S.addDays(t, -14);
    Object.keys(store.preds).forEach(function (d) { if (d < cut) delete store.preds[d]; });
  }

  /* ---------- Weather sync ---------- */
  var syncing = false, syncError = null;
  function needsWeather(d) {
    if (!store.days[d].outcome) return false;   // plan-only entries (future days) have no weather of their own
    var w = store.days[d].weather, t = S.todayKey();
    if (w && w.source === 'manual') return false;
    if (!w || w.tempAvg == null) return true;
    if (w.v !== W.FEATURE_VERSION) return true;   // computed with older rules (e.g. before Saturday mornings)
    if (w.provisional && d < t) return true;
    if (w.provisional && d === t && Date.now() - (w.fetchedAt || 0) > FORECAST_TTL) return true;
    return false;
  }
  async function sync(force) {
    if (syncing) return;
    syncing = true; syncError = null; renderStatus();
    var changed = false;
    try {
      var t = S.todayKey();
      if (force || !store.forecast || Date.now() - store.forecast.fetchedAt > FORECAST_TTL || store.forecast.today !== t || store.forecast.v !== W.FEATURE_VERSION) {
        var f = await W.fetchRange(S.addDays(t, -7), S.addDays(t, W.FORECAST_AHEAD));
        store.forecast = { fetchedAt: Date.now(), today: t, days: f, v: W.FEATURE_VERSION };
      }
      var need = Object.keys(store.days).filter(needsWeather).sort();
      var fromForecast = need.filter(function (d) { return store.forecast.days[d]; });
      fromForecast.forEach(function (d) { store.days[d].weather = Object.assign({}, store.forecast.days[d]); changed = true; });
      var rest = need.filter(function (d) { return !store.forecast.days[d] && d <= t; });
      // Fetch the rest in ranges of at most a year.
      while (rest.length) {
        var start = rest[0], limit = S.addDays(start, 365);
        var chunk = rest.filter(function (d) { return d < limit; });
        rest = rest.filter(function (d) { return d >= limit; });
        var got = await W.fetchRange(start, chunk[chunk.length - 1]);
        chunk.forEach(function (d) { if (got[d]) { store.days[d].weather = got[d]; changed = true; } });
      }
      snapshot();
      save();
    } catch (e) {
      syncError = e.message;
    }
    syncing = false;
    renderAll();
    if (changed) maybeRetrain();
  }

  /* ---------- Training ---------- */
  var worker = null, training = false, trainId = 0, trainWanted = false, manualTrain = false;
  function makeWorker() {
    try {
      var src = 'var modelLib = ' + modelLib.toString() + ';\nvar L = modelLib();\n' +
        'self.onmessage = function (e) { var r = L.trainAll(e.data.rows, function (p) { self.postMessage({ id: e.data.id, progress: p }); }); self.postMessage({ id: e.data.id, done: true, result: r }); };';
      var w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = function (e) { onTrained(e.data); };
      w.onerror = function () { worker = null; };
      return w;
    } catch (e) { return null; }
  }
  function maybeRetrain(force) {
    var rows = trainingRows(), sig = signature(rows);
    if (!force && store.model && store.trainedOn === sig) return;
    if (training) { trainWanted = true; return; }
    training = true; trainWanted = false;
    var id = ++trainId;
    renderModel();
    if (!worker) worker = makeWorker();
    var payload = { id: id, rows: rows };
    pending = { sig: sig, n: rows.length };
    if (worker) worker.postMessage(payload);
    else setTimeout(function () { onTrained({ id: id, done: true, result: L.trainAll(rows) }); }, 20);
  }
  var pending = null, trainProgress = 0;
  function onTrained(m) {
    if (m.id !== trainId) return;
    if (m.progress != null) { trainProgress = m.progress; var el = $('#trainPct'); if (el) el.textContent = pct(m.progress); return; }
    training = false; trainProgress = 0;
    store.model = m.result; store.trainedAt = Date.now(); store.trainedOn = pending.sig;
    snapshot(); save();
    renderAll();
    if (manualTrain) {
      manualTrain = false;
      toast(m.result.ready ? 'Retrained on ' + m.result.cv.n + ' days. Accuracy ' + pct(m.result.cv.acc) + ' on days it hadn’t seen.' : 'Not enough data to train yet. Using starter rules.');
    }
    if (trainWanted) maybeRetrain();
  }
  var retrainSoon = debounce(function () { maybeRetrain(); }, 500);

  /* ---------- Logging ---------- */
  function logOutcome(date, outcome, why) {
    var e = store.days[date] || { include: true };
    var prev = JSON.parse(JSON.stringify(store.days[date] || null));
    e.outcome = outcome;
    if (e.include == null) e.include = true;
    if (outcome === 'land') e.landWhy = why || e.landWhy || (e.plan === 'land' ? 'planned' : 'weather');
    else delete e.landWhy;
    e.loggedAt = Date.now();
    if (!e.weather && weatherFor(date)) e.weather = Object.assign({}, weatherFor(date));
    if (!e.prediction && store.preds[date]) e.prediction = store.preds[date];
    store.days[date] = e;
    save(); renderAll(); retrainSoon();
    if (needsWeather(date)) sync();
    toast('Logged ' + relDay(date).toLowerCase() + ': ' + outcomeText(e), { action: 'Undo', onAction: function () {
      if (prev) store.days[date] = prev; else delete store.days[date];
      save(); renderAll(); retrainSoon();
    } });
  }

  // Plans for today or upcoming days: a planned land day or a half & half practice.
  // Stored on the day's entry until an outcome is logged.
  var PLAN_TEXT = { weather: 'Weather decides', land: 'Planned land day', split: 'Half & half' };
  function setPlan(date, plan) {
    var e = store.days[date] || {};
    if (plan === 'weather') delete e.plan; else e.plan = plan;
    if (!e.outcome && !e.plan) delete store.days[date]; else store.days[date] = e;
    save(); renderAll();
  }
  function planDialog(date) {
    var e = store.days[date], cur = (e && e.plan) || 'weather';
    var body = h('<div><p class="confirm-text">' + (date === S.todayKey() ? 'Today' : fmtDate(date)) + ', ' + S.practice(date).label + '. Is this practice already decided?</p>' +
      '<div class="plan-opts">' +
        ['weather', 'land', 'split'].map(function (k) {
          var sub = { weather: 'Normal day: the forecast decides water or land.', land: 'A land day for its own sake, not because of the weather. Not used to train the model.', split: 'Half the practice on the water, then swap with the land half. The prediction shows the chance the water half can go ahead.' }[k];
          return '<button type="button" class="plan-opt" data-p="' + k + '" aria-pressed="' + (cur === k) + '">' + icon(k === 'land' ? 'land' : k === 'split' ? 'split' : 'waves') + '<span><b>' + PLAN_TEXT[k] + '</b><small>' + sub + '</small></span></button>';
        }).join('') + '</div></div>');
    var m = modal({ title: 'Plan for ' + relDay(date).toLowerCase(), body: body });
    body.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-p]'); if (!b) return;
      setPlan(date, b.dataset.p); m.close();
      toast(fmtDate(date) + ': ' + PLAN_TEXT[b.dataset.p].toLowerCase());
    });
  }

  /* ---------- Rendering ---------- */
  function start() {
    started = true;
    $('#topActions').innerHTML = '<span class="training" id="topStatus"></span>' + themeBtnHtml() +
      '<button class="icon-btn" id="lockBtn" title="Lock" aria-label="Lock">' + icon('lock') + '</button>' +
      '<div class="menu-wrap"><button class="icon-btn" id="moreBtn" aria-label="More options">' + icon('more') + '</button><div class="menu" id="menu" role="menu"></div></div>';
    bindTheme();
    $('#lockBtn').addEventListener('click', lock);
    bindMenu();
    $('#view').innerHTML =
      '<div class="head"><div><h1 id="headTitle">Water or land?</h1><p id="headSub"></p></div>' +
        '<div class="head-actions"><button class="btn btn-ghost btn-sm" id="refreshBtn">' + icon('refresh') + 'Refresh weather</button>' +
        '<button class="btn btn-soft btn-sm" data-act="add">' + icon('calPlus') + 'Add past days</button></div></div>' +
      '<div class="seg lg viewseg" id="viewSeg" role="tablist"><button data-v="predict" role="tab">' + icon('cpu') + 'Water or land?</button><button data-v="conditions" role="tab">' + icon('star') + 'Conditions</button></div>' +
      '<div id="predictView">' +
        '<div class="grid-2">' +
          '<div class="stack"><section class="panel hero" id="hero"></section><section class="panel" id="week"></section></div>' +
          '<section class="panel" id="modelPanel"></section>' +
        '</div>' +
        '<section class="panel" id="dataPanel" style="margin-top:12px"></section>' +
      '</div>' +
      '<div id="condView" hidden></div>';
    var setView = seg($('#viewSeg'), currentView(), function (v) { location.hash = v === 'conditions' ? '#conditions' : ''; });
    window.addEventListener('hashchange', function () { setView(currentView()); showView(); });
    showView();
    $('#refreshBtn').addEventListener('click', function () { sync(true); });
    $('#view').addEventListener('click', onClick);
    $('#view').addEventListener('change', onChange);
    renderAll();
    if (mode === 'shared') syncNow().then(function () { sync(); maybeRetrain(); });
    else { sync(); maybeRetrain(); }
    setInterval(function () { if (!document.hidden) sync(); }, FORECAST_TTL);
    if (mode === 'shared') setInterval(function () { if (!document.hidden) syncNow(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { sync(); if (mode === 'shared') syncNow(); } });
    window.addEventListener('online', function () { if (mode === 'shared') syncNow(); });
  }

  function renderAll() { renderStatus(); renderHero(); renderWeek(); renderModel(); renderData(); renderConditions(); }
  function currentView() { return location.hash === '#conditions' ? 'conditions' : 'predict'; }
  function showView() {
    var c = currentView() === 'conditions';
    $('#predictView').hidden = c; $('#condView').hidden = !c;
    $('#headTitle').textContent = c ? 'How will it feel on the water?' : 'Water or land?';
    document.title = c ? 'Conditions · RAR Predictor' : 'RAR Predictor';
    renderConditions();
  }

  function renderStatus() {
    var sub = $('#headSub'); if (!sub) return;
    var f = store.forecast;
    sub.innerHTML = 'Practice 6:00–8:15 PM, Saturdays 10:00 AM–12:15 PM · ' + esc(S.PLACE.name) + ' · ' +
      (syncing ? 'updating weather…' : syncError ? '<span style="color:var(--danger)">' + esc(syncError) + '</span>' : f ? 'weather updated ' + ago(f.fetchedAt) : 'weather not loaded yet') +
      '<br>' + (mode === 'shared'
        ? (net.error ? '<span style="color:var(--warn)">' + esc(net.error) + '</span>' : 'Shared with every device' + (net.lastOk ? ' · synced ' + ago(net.lastOk) : ' · syncing…'))
        : '<span style="color:var(--warn)">Local mode: data is saved in this browser only</span>');
    var ts = $('#topStatus');
    if (ts) ts.innerHTML = training ? '<span class="spinner"></span>Training <span id="trainPct">' + pct(trainProgress) + '</span>' : '';
  }

  function certaintyWord(c) { return c >= 0.85 ? 'Very confident' : c >= 0.7 ? 'Fairly confident' : c >= 0.6 ? 'Leaning' : 'Toss-up'; }

  function renderHero() {
    var el = $('#hero'); if (!el) return;
    var t = S.todayKey(), w = weatherFor(t), pr = predictFor(w), e = store.days[t], M = store.model;
    var snap = e && e.prediction;
    if (e && e.outcome && snap) pr = { p: snap.p, by: snap.by };
    var water = pr && pr.p >= 0.5, cert = pr ? Math.max(pr.p, 1 - pr.p) : 0;
    var plan = e && !e.outcome ? e.plan : null;
    el.style.setProperty('--verdict', plan === 'land' ? 'var(--land)' : plan === 'split' ? 'var(--water)' : pr ? (water ? 'var(--water)' : 'var(--land)') : 'var(--text-3)');
    var acc = M && M.ready ? 'Model accuracy <b>' + pct(M.cv.acc) + '</b> (' + M.cv.correct + ' of ' + M.cv.n + ' days it hadn’t seen)'
      : 'Using starter rules until you log ' + L.MIN_DAYS + '+ days with at least ' + L.MIN_EACH + ' of each';
    var C = 2 * Math.PI * 47;
    var light = S.light(t);
    var lightTxt = light.daylight >= light.window ? 'Daylight all practice' : light.daylight > 0 ? light.daylight + ' min of daylight' : light.twilight > 0 ? 'Dark after ' + light.twilight + ' min of twilight' : 'Dark the whole practice';
    el.innerHTML =
      '<div class="hero-body"><div>' +
        '<div class="hero-date">' + fmtDate(t) + ' · Today’s practice, ' + S.practice(t).label + (pr ? '<span class="badge">' + (pr.by === 'model' ? icon('cpu') + 'AI model' : 'Starter rules') + '</span>' : '') +
          (!e || !e.outcome ? '<button class="plan-link" data-plan="' + t + '">' + icon(plan === 'land' ? 'land' : plan === 'split' ? 'split' : 'calPlus') + (plan ? PLAN_TEXT[plan] : 'Set plan') + '</button>' : '') + '</div>' +
        (plan === 'land' ? '<div class="verdict"><span class="verdict-icon">' + icon('land') + '</span><h2>On land (planned)</h2></div>' +
          '<p class="verdict-sub">A planned land day, not because of the weather.' + (pr ? ' Conditions alone would give a ' + pct(pr.p) + ' chance of rowing.' : '') + '</p>'
        : plan === 'split' && pr ? '<div class="verdict"><span class="verdict-icon">' + icon('split') + '</span><h2>Half &amp; half</h2></div>' +
          '<p class="verdict-sub">Water half: <b>' + pct(pr.p) + '</b> chance conditions allow rowing · ' + certaintyWord(cert).toLowerCase() + '</p>' +
          '<p class="verdict-sub" style="margin-top:4px;font-size:13px">' + acc + '</p>'
        : pr ? '<div class="verdict"><span class="verdict-icon">' + icon(water ? 'waves' : 'land') + '</span><h2>' + (water ? 'On the water' : 'On land') + '</h2></div>' +
          '<p class="verdict-sub">' + certaintyWord(cert) + ' · ' + pct(pr.p) + ' chance of rowing on the water</p>' +
          '<p class="verdict-sub" style="margin-top:4px;font-size:13px">' + acc + '</p>'
          : '<div class="verdict"><span class="verdict-icon">' + icon('refresh') + '</span><h2 style="font-size:24px">Waiting for weather</h2></div><p class="verdict-sub">' + (syncError ? 'Weather could not be loaded: ' + esc(syncError) : 'Loading the practice-time forecast for Milton Harbor…') + '</p>') +
      '</div>' +
      (pr && plan !== 'land' ? '<div class="ring" title="Certainty"><svg viewBox="0 0 112 112"><circle class="track" cx="56" cy="56" r="47"/><circle class="prog" cx="56" cy="56" r="47" stroke-dasharray="' + C.toFixed(1) + '" stroke-dashoffset="' + (C * (1 - cert)).toFixed(1) + '"/></svg><div class="ring-label"><b>' + pct(cert) + '</b><span>certainty</span></div></div>' : '') +
      '</div>' +
      (w ? '<div class="wx">' +
        wx('thermo', 'Temperature', num(w.tempAvg) + '°F', 'low ' + num(w.tempMin) + '°F, ' + S.practice(t).short) +
        wx('wind', 'Wind', num(w.windAvg) + ' mph', 'gusts ' + num(w.gustMax) + ' mph') +
        wx('up', 'Direction', (w.dir == null ? '–' : '<span class="arrow" style="transform:rotate(' + ((w.dir + 180) % 360) + 'deg)">↑</span> ' + W.compass(w.dir)), w.dir == null ? '' : 'from ' + w.dir + '°') +
        wx('sunset', 'Light', light.daylight + light.twilight + ' min', lightTxt + (light.sunset ? ' · sunset ' + light.sunset : '')) +
        wx('rain', 'Sky', (w.thunder ? 'Storms' : num(w.cloud) + '% cloud'), (w.precip ? num(w.precip, 2) + ' in rain' : 'no rain') ) +
      '</div>' : '') +
      '<div class="log-row"><span class="q">' + (e && e.outcome ? 'Logged for today' : 'How did practice go today?') + '</span>' +
        '<button class="btn btn-water' + (e && e.outcome === 'water' ? ' on' : '') + '" data-log="water">' + icon('waves') + 'On the water</button>' +
        '<button class="btn btn-split' + (e && e.outcome === 'split' ? ' on' : '') + '" data-log="split" title="Half on the water, half on land">' + icon('split') + 'Half & half</button>' +
        '<button class="btn btn-land' + (e && e.outcome === 'land' ? ' on' : '') + '" data-log="land">' + icon('land') + 'On land</button>' +
        '<button class="btn btn-ghost' + (e && e.outcome === 'none' ? ' on' : '') + '" data-log="none" title="Practice cancelled. Not used for training.">No practice</button>' +
      '</div>' +
      (e && e.outcome === 'land' ? whyRow(t, e) : '') +
      (onWater(e) ? rateRow(t, e) : '');
  }
  // After logging a land day: was it the weather, or a planned land day?
  function whyRow(d, e) {
    var why = e.landWhy === 'planned' ? 'planned' : 'weather';
    return '<div class="rate-row why-row"><span class="q">Why on land?</span>' +
      '<div class="seg"><button data-why="weather" data-date="' + d + '" aria-pressed="' + (why === 'weather') + '">Because of the weather</button><button data-why="planned" data-date="' + d + '" aria-pressed="' + (why === 'planned') + '">Planned land day</button></div>' +
      '<span class="rate-label">' + (why === 'planned' ? 'Not used to train the model.' : 'Teaches the model these conditions mean land.') + '</span></div>';
  }
  // 1–5 rating buttons plus a short note, for a day on the water.
  function rateRow(d, e, compact) {
    var btns = [1, 2, 3, 4, 5].map(function (n) {
      return '<button type="button" data-rate="' + n + '" data-date="' + d + '" aria-pressed="' + (e.rating === n) + '" title="' + n + ': ' + C.LABELS[n] + '" style="--rh:' + RATE_HUE[n] + '">' + n + '</button>';
    }).join('');
    return '<div class="rate-row' + (compact ? ' compact' : '') + '">' +
      (compact ? '' : '<span class="q">How were conditions on the water?</span>') +
      '<div class="rate" role="group" aria-label="Conditions rating 1 to 5">' + btns + '</div>' +
      (compact ? '' : '<span class="rate-label">' + (e.rating ? e.rating + ' · ' + C.LABELS[e.rating] : '1 very rough · 5 glassy') + '</span>' +
        '<input class="text-input sm rate-note" data-rnote="' + d + '" maxlength="140" placeholder="Short note, e.g. chop past the breakwall" value="' + esc(e.ratingNote || '') + '" aria-label="Conditions note">') +
    '</div>';
  }
  var RATE_HUE = { 1: 25, 2: 55, 3: 90, 4: 150, 5: 210 };
  function stars(r, size) {
    var out = '';
    for (var k = 1; k <= 5; k++) {
      var fill = Math.max(0, Math.min(1, r - k + 1));
      out += '<span class="st" style="--f:' + (fill * 100).toFixed(0) + '%' + (size ? ';--s:' + size + 'px' : '') + '"></span>';
    }
    return '<span class="stars" title="' + r.toFixed(1) + ' out of 5">' + out + '</span>';
  }
  function wx(ic, label, value, sub) {
    return '<div class="wx-item"><div class="l">' + icon(ic) + label + '</div><div class="v">' + value + '</div><div class="s">' + esc(sub) + '</div></div>';
  }

  function renderWeek() {
    var el = $('#week'); if (!el) return;
    var t = S.todayKey(), cards = '';
    for (var k = 1; k <= 7; k++) {
      var d = S.addDays(t, k), w = store.forecast && store.forecast.days[d], pr = predictFor(w);
      var water = pr && pr.p >= 0.5, dt = dateObj(d), plan = store.days[d] && store.days[d].plan;
      var col = plan === 'land' ? 'var(--land)' : plan === 'split' ? 'var(--water)' : pr ? (water ? 'var(--water)' : 'var(--land)') : 'var(--text-3)';
      var ic = plan === 'land' ? 'land' : plan === 'split' ? 'split' : pr ? (water ? 'waves' : 'land') : 'refresh';
      var label = plan === 'land' ? 'Planned land' : plan === 'split' ? 'Half · ' + (pr ? pct(pr.p) : '–') : pr ? (water ? 'Water' : 'Land') + ' ' + pct(Math.max(pr.p, 1 - pr.p)) : '–';
      cards += '<button type="button" class="day-card' + (plan ? ' planned' : '') + '" data-plan="' + d + '" style="--c:' + col + '" title="Set a plan for ' + fmtDate(d) + '">' +
        '<div class="dn">' + (k === 1 ? 'Tomorrow' : DOW[dt.getUTCDay()]) + '</div><div class="dd">' + MON[dt.getUTCMonth()] + ' ' + dt.getUTCDate() + (S.practice(d).id === 'sat' ? ' · AM' : '') + '</div>' +
        '<div class="di">' + icon(ic) + '</div>' +
        '<div class="dp">' + label + '</div>' +
        '<div class="dw">' + (w ? num(w.tempAvg) + '° · ' + num(w.windAvg) + ' mph ' + W.compass(w.dir) : 'no forecast') + '</div>' +
        '<div class="bar" title="Chance of water: ' + (pr ? pct(pr.p) : '–') + '"><span style="width:' + (pr && plan !== 'land' ? pr.p * 100 : 0) + '%"></span></div>' +
      '</button>';
    }
    el.innerHTML = '<div class="panel-head"><span class="panel-title">Next 7 days <span class="muted">· forecast for practice time · tap a day to plan it</span></span></div><div class="panel-body"><div class="week">' + cards + '</div></div>';
  }

  function renderModel() {
    var el = $('#modelPanel'); if (!el) return;
    renderStatus();
    var M = store.model, rows = trainingRows(), live = liveRecord();
    var water = rows.filter(function (r) { return r.y === 1; }).length, land = rows.length - water;
    var head = '<div class="panel-head"><span class="panel-title">' + icon('cpu') + 'Model</span><div class="panel-actions">' +
      (training ? '<span class="training"><span class="spinner"></span>Training…</span>' : '<button class="btn btn-soft btn-sm" data-act="retrain">' + icon('refresh') + 'Retrain</button>') + '</div></div>';
    var body = '';
    if (M && M.ready) {
      body += '<div class="stats">' +
        stat('Accuracy', pct(M.cv.acc), M.cv.correct + ' of ' + M.cv.n + ' unseen days right') +
        stat('Live record', live.n ? pct(live.ok / live.n) : '–', live.n ? live.ok + ' of ' + live.n + ' real predictions' : 'Builds as you log days') +
        stat('Baseline', pct(M.base.acc), 'Always guessing “' + (M.base.majority === 'water' ? 'water' : 'land') + '”') +
        stat('Trained on', M.cv.n + ' days', M.base.water + ' water · ' + M.base.land + ' land') +
      '</div>';
      var better = M.cv.acc - M.base.acc;
      body += '<p class="note" style="margin-top:12px">Using <b>' + esc(M.cfg.name) + '</b>, the best of ' + M.candidates.length + ' models tried. ' +
        (better > 0.02 ? 'It beats always guessing the most common outcome by ' + Math.round(better * 100) + ' points.' : 'It is not yet clearly better than always guessing the most common outcome. More varied days will help.') +
        (M.cv.n < 25 ? ' With under 25 days logged, expect accuracy to move around.' : '') + '</p>';
      body += '<div class="section-label" style="margin:18px 0 10px">What drives the prediction</div><ul class="imp">' +
        M.importance.filter(function (f) { return f.share > 0.005; }).slice(0, 8).map(function (f) {
          var toWater = f.dir > 0, c = toWater ? 'var(--water)' : 'var(--land)';
          return '<li><span class="nm">' + esc(f.label) + '</span><span class="track"><span style="width:' + Math.max(3, f.share * 100).toFixed(1) + '%;background:' + c + '"></span></span>' +
            '<span class="dir" style="color:' + c + '">' + (toWater ? 'higher → water' : 'higher → land') + '</span></li>';
        }).join('') + '</ul>';
      body += '<details style="margin-top:14px;font-size:13px"><summary class="muted" style="cursor:pointer">All models tried</summary><table class="data" style="margin-top:6px"><thead><tr><th>Model</th><th>Accuracy</th><th>Log loss</th></tr></thead><tbody>' +
        M.candidates.map(function (c, i) { return '<tr><td>' + (i === 0 ? '<b>' + esc(c.name) + '</b>' : esc(c.name)) + '</td><td>' + pct(c.acc) + '</td><td>' + c.logloss.toFixed(3) + '</td></tr>'; }).join('') +
        '</tbody></table><p class="muted" style="margin:8px 0 0">Scored with ' + (M.cv.folds === M.cv.n ? 'leave-one-out' : M.cv.folds + '-fold') + ' cross-validation: each day is predicted by a model that never saw it. Lower log loss means better-calibrated certainty.</p></details>';
    } else {
      var needDays = Math.max(0, L.MIN_DAYS - rows.length), needW = Math.max(0, L.MIN_EACH - water), needL = Math.max(0, L.MIN_EACH - land);
      body += '<div class="stats">' +
        stat('Days logged', String(rows.length), water + ' water · ' + land + ' land') +
        stat('Live record', live.n ? pct(live.ok / live.n) : '–', live.n ? live.ok + ' of ' + live.n + ' predictions' : 'Builds as you log days') + '</div>' +
        '<p class="note" style="margin-top:12px"><b>Using starter rules for now.</b> The AI model trains once there are at least ' + L.MIN_DAYS + ' logged days with ' + L.MIN_EACH + '+ water days and ' + L.MIN_EACH + '+ land days. Still needed: ' +
        [needDays ? needDays + ' more day' + (needDays === 1 ? '' : 's') : '', needW ? needW + ' water' : '', needL ? needL + ' land' : ''].filter(Boolean).join(', ') + '.' +
        ' Use <b>Add past days</b> to backfill earlier practices; their weather is fetched automatically.</p>' +
        '<p class="muted" style="font-size:12.5px;margin:10px 0 0">Starter rules lean towards land when wind is over ~10 mph, gusts over ~18 mph, it is below ~45°F, there is little light during practice, or there is rain or thunder.</p>';
    }
    var planned = 0, none = 0, splits = 0;
    loggedDates().forEach(function (d) { var e = store.days[d]; if (e.outcome === 'none') none++; else if (e.outcome === 'split') splits++; else if (labelOf(e) === null) planned++; });
    if (planned || none || splits) body += '<p class="muted" style="font-size:12.5px;margin:12px 0 0">' +
      [splits ? splits + ' half & half day' + (splits === 1 ? '' : 's') + ' count as water days (the water half went ahead)' : '',
       planned ? planned + ' planned land day' + (planned === 1 ? ' is' : 's are') + ' left out because ' + (planned === 1 ? 'it wasn’t' : 'they weren’t') + ' a weather decision' : '',
       none ? none + ' no-practice day' + (none === 1 ? ' is' : 's are') + ' left out' : ''].filter(Boolean).join('. ') + '.</p>';
    var foot = M && M.ready && store.trainedAt ? '<div class="panel-foot">Last trained ' + ago(store.trainedAt) + ' · retrains automatically whenever the data changes</div>' : '';
    el.innerHTML = head + '<div class="panel-body">' + body + '</div>' + foot;
  }
  function stat(label, value, sub) { return '<div class="stat"><div class="stat-label">' + label + '</div><div class="stat-value">' + esc(value) + '</div><div class="stat-sub">' + esc(sub) + '</div></div>'; }

  var filter = 'all';
  function renderData() {
    var el = $('#dataPanel'); if (!el) return;
    var all = loggedDates().sort().reverse();
    var demo = all.some(function (d) { return store.days[d].demo; });
    var list = all.filter(function (d) {
      var e = store.days[d];
      if (filter === 'water' || filter === 'split' || filter === 'none') return e.outcome === filter;
      if (filter === 'land') return e.outcome === 'land' && e.landWhy !== 'planned';
      if (filter === 'planned') return e.outcome === 'land' && e.landWhy === 'planned';
      if (filter === 'off') return e.include === false;
      return true;
    });
    var M = store.model, oof = M && M.ready ? M.oof : {};
    var head = '<div class="panel-head"><span class="panel-title">' + icon('table') + 'Training data <span class="muted">· ' + all.length + ' days</span></span>' +
      '<div class="panel-actions"><div class="seg" id="filterSeg"><button data-v="all">All</button><button data-v="water">Water</button><button data-v="split">Half & half</button><button data-v="land">Land</button><button data-v="planned">Planned land</button><button data-v="none">No practice</button><button data-v="off">Excluded</button></div>' +
      (demo ? '<button class="btn btn-ghost btn-sm" data-act="clearDemo">Remove demo days</button>' : '') +
      '<button class="btn btn-soft btn-sm" data-act="add">' + icon('plus') + 'Add days</button></div></div>';
    if (!all.length) {
      el.innerHTML = head + '<div class="empty"><h3>No days logged yet</h3><p>Log today with the buttons above after practice, or backfill past practices. Weather for each day is collected automatically from Open-Meteo for Milton Harbor.</p>' +
        '<div class="empty-actions"><button class="btn btn-primary" data-act="add">' + icon('calPlus') + 'Add past days</button><button class="btn btn-soft" data-act="demo">' + icon('sparkles') + 'Try with demo data</button></div></div>';
      bindFilter(); return;
    }
    var rows = list.map(function (d) {
      var e = store.days[d], w = e.weather || {}, off = e.include === false;
      var out = e.outcome === 'water' ? '<span class="badge water">' + icon('waves') + 'Water</span>'
        : e.outcome === 'split' ? '<span class="badge split">' + icon('split') + 'Half & half</span>'
        : e.outcome === 'land' ? (e.landWhy === 'planned' ? '<span class="badge" title="Planned land day, not because of the weather">' + icon('land') + 'Land · planned</span>' : '<span class="badge land" title="On land because of the weather">' + icon('land') + 'Land · weather</span>')
        : '<span class="badge">No practice</span>';
      var held = oof[d] != null && labelOf(e) !== null ? guess(oof[d], e) : '<span class="muted">–</span>';
      var live = e.prediction ? guess(e.prediction.p, e) : '<span class="muted">–</span>';
      var wxNote = !e.weather ? '<span class="badge warn">no weather</span>' : w.source === 'manual' ? ' <span class="muted" title="Entered by hand">✎</span>' : w.provisional ? ' <span class="muted" title="Forecast; replaced with observed weather after the day">~</span>' : '';
      return '<tr data-date="' + d + '" class="' + (off ? 'off' : '') + '">' +
        '<td><input type="checkbox" data-include ' + (off ? '' : 'checked') + ' ' + (labelOf(e) === null ? 'disabled title="No-practice and planned land days are never used for training"' : 'title="Use this day for training"') + ' aria-label="Use ' + d + ' for training"></td>' +
        '<td>' + fmtDate(d) + (e.demo ? '<span class="demo">demo</span>' : '') + '</td><td>' + out + '</td>' +
        '<td class="num">' + num(w.tempAvg) + '°F' + wxNote + '</td><td class="num">' + num(w.windAvg) + '</td><td class="num">' + num(w.gustMax) + '</td>' +
        '<td>' + (w.dir == null ? '–' : W.compass(w.dir)) + '</td><td class="num">' + (w.daylight == null ? '–' : w.daylight + ' + ' + w.twilight) + '</td>' +
        '<td class="num">' + num(w.cloud) + '%</td><td class="num">' + (w.precip ? num(w.precip, 2) : '0') + (w.thunder ? ' ⚡' : '') + '</td>' +
        '<td>' + held + '</td><td>' + live + '</td>' +
        '<td title="' + esc(e.ratingNote || '') + '">' + (e.rating ? e.rating + '/5' + (e.ratingNote ? ' ✎' : '') : onWater(e) ? '<span class="muted">–</span>' : '') + '</td>' +
        '<td style="text-align:right"><button class="icon-btn sm" data-edit aria-label="Edit ' + d + '">' + icon('edit') + '</button><button class="icon-btn sm danger" data-del aria-label="Delete ' + d + '">' + icon('trash') + '</button></td></tr>';
    }).join('');
    el.innerHTML = head + '<div class="table-wrap"><table class="data"><thead><tr><th title="Use for training">Use</th><th>Date</th><th>Practice</th><th>Temp</th><th>Wind mph</th><th>Gusts</th><th>From</th><th title="Minutes of daylight + twilight during practice">Light min</th><th>Clouds</th><th>Rain in</th><th title="Prediction from a model that did not see this day (cross-validation)">Held-out guess</th><th title="The prediction shown on the day, before practice">Live guess</th><th title="Conditions on the water, 1–5">Cond.</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="14" class="muted" style="text-align:center;padding:20px">No days match this filter.</td></tr>') + '</tbody></table></div>' +
      '<div class="panel-foot">Uncheck <b style="color:var(--text-2)">Use</b> to leave a day out of training without deleting it. Half & half days count as water; planned land days are never used. Weather is for practice hours (6–8 PM; Saturdays 10 AM–12 PM). Light is minutes of daylight + twilight during practice.</div>';
    bindFilter();
  }
  function guess(p, e) {
    var y = labelOf(e), w = p >= 0.5, right = y === null ? null : w === (y === 1);
    return '<span class="badge ' + (right == null ? '' : right ? 'ok' : 'bad') + '">' + (w ? 'Water' : 'Land') + ' ' + pct(Math.max(p, 1 - p)) + (right == null ? '' : right ? ' ✓' : ' ✗') + '</span>';
  }
  function bindFilter() { var s = $('#filterSeg'); if (s) seg(s, filter, function (v) { filter = v; renderData(); }); }

  /* ---------- Conditions view ---------- */
  function renderConditions() {
    var el = $('#condView'); if (!el || el.hidden) return;
    var t = S.todayKey(), w = weatherFor(t), e = store.days[t];
    var waterDays = Object.keys(store.days).filter(function (d) { return onWater(store.days[d]); }).sort().reverse();
    var ratedN = waterDays.filter(function (d) { return store.days[d].rating; }).length;
    var html = '<div class="grid-2">';

    // Today: most similar day, or a generated "what it might feel like".
    html += '<section class="panel hero" style="--verdict:var(--water)">';
    if (!w) {
      html += '<div class="panel-body"><h3 style="margin:0 0 6px">Waiting for today’s forecast</h3><p class="muted" style="margin:0">' + (syncError ? esc(syncError) : 'Loading practice-time weather for Milton Harbor…') + '</p></div>';
    } else {
      var matches = C.similarDays(w, store.days, t), best = matches[0], exp = C.expected(w, store.days, t);
      var matched = best && best.sim >= C.MATCH;
      html += '<div class="hero-body"><div>' +
        '<div class="hero-date">' + fmtDate(t) + ' · Today on the water, ' + S.practice(t).label + '</div>' +
        '<div class="verdict"><span class="verdict-icon" style="--verdict:oklch(var(--al) var(--ac) ' + RATE_HUE[Math.round(exp.rating)] + ')">' + icon('waves') + '</span>' +
          '<div><h2>' + exp.rating.toFixed(1) + '<span class="muted" style="font-size:18px;font-weight:500"> / 5</span></h2>' + stars(exp.rating, 16) + '</div></div>' +
        '<p class="verdict-sub">Expected: <b>' + C.LABELS[Math.round(exp.rating)] + '</b> · ' +
          (exp.basis === 'similar' ? 'based on ' + exp.used + ' similar rated day' + (exp.used === 1 ? '' : 's')
            : exp.basis === 'blend' ? 'similar rated days blended with a weather estimate'
            : 'estimated from the weather (rate more days to improve this)') + '</p>' +
        '</div></div>';
      if (matched) {
        var be = best.entry;
        html += '<div class="match"><div class="match-head"><span class="badge water">' + Math.round(best.sim * 100) + '% similar</span><b>Most similar day: ' + fmtDate(best.date) + '</b>' +
          (be.rating ? '<span class="badge" style="margin-left:auto">' + stars(be.rating, 12) + ' ' + be.rating + ' · ' + C.LABELS[be.rating] + '</span>' : '<span class="badge warn" style="margin-left:auto">not rated yet</span>') + '</div>' +
          (be.ratingNote ? '<blockquote class="quote">“' + esc(be.ratingNote) + '”</blockquote>' : '') +
          compare(w, be.weather) + '</div>';
      } else {
        html += '<div class="match"><div class="match-head"><b>' + icon('sparkles') + ' What it might feel like</b><span class="muted" style="margin-left:auto;font-size:12.5px">' +
          (best ? 'No close match (closest: ' + fmtDate(best.date) + ', ' + Math.round(best.sim * 100) + '% similar)' : 'No water days logged yet to compare') + '</span></div>' +
          '<ul class="feel">' + C.describe(w, t).map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' +
          '<p class="muted" style="font-size:12px;margin:8px 0 0">Generated from the forecast. A real similar day replaces this once one is logged.</p></div>';
      }
      var others = matches.slice(matched ? 1 : 0, (matched ? 1 : 0) + 3).filter(function (m) { return m.sim >= 0.4; });
      if (others.length) html += '<div class="others"><span class="section-label" style="margin:0">Also similar</span>' + others.map(function (m) {
        return '<span class="chip-day" title="' + esc(m.entry.ratingNote || '') + '">' + fmtDate(m.date) + ' · ' + Math.round(m.sim * 100) + '%' + (m.entry.rating ? ' · ' + m.entry.rating + '/5' : '') + '</span>';
      }).join('') + '</div>';
      if (onWater(e)) html += rateRow(t, e);
      else if (!e || !e.outcome) html += '<div class="log-row"><span class="q">Went out today?</span><button class="btn btn-water" data-log="water">' + icon('waves') + 'On the water</button><button class="btn btn-split" data-log="split">' + icon('split') + 'Half & half</button><button class="btn btn-land" data-log="land">' + icon('land') + 'On land</button></div>';
    }
    html += '</section>';

    // Upcoming days.
    var up = '';
    for (var k = 1; k <= 7; k++) {
      var d = S.addDays(t, k), fw = store.forecast && store.forecast.days[d];
      if (!fw) continue;
      var ex = C.expected(fw, store.days), m = C.similarDays(fw, store.days)[0];
      up += '<li><span class="ud">' + (k === 1 ? 'Tomorrow' : fmtDate(d)) + '</span>' + stars(ex.rating, 12) + '<b>' + ex.rating.toFixed(1) + '</b>' +
        '<span class="um">' + (m && m.sim >= C.MATCH ? 'like ' + fmtDate(m.date) + ' (' + Math.round(m.sim * 100) + '%)' : num(fw.windAvg) + ' mph ' + W.compass(fw.dir) + ', ' + num(fw.tempAvg) + '°F') + '</span></li>';
    }
    html += '<section class="panel"><div class="panel-head"><span class="panel-title">Next 7 days <span class="muted">· expected conditions</span></span></div><div class="panel-body"><ul class="upcoming">' + (up || '<li class="muted">Forecast not loaded yet.</li>') + '</ul>' +
      '<p class="note" style="margin-top:12px">Ratings: <b>1</b> very rough · <b>2</b> rough · <b>3</b> OK · <b>4</b> good · <b>5</b> glassy. ' + ratedN + ' of ' + waterDays.length + ' water days rated so far.</p></div></section>';
    html += '</div>';

    // Every water day, with inline rating and note.
    html += '<section class="panel" style="margin-top:12px"><div class="panel-head"><span class="panel-title">' + icon('star') + 'Water days <span class="muted">· rate each one 1–5 with a short note</span></span>' +
      '<div class="panel-actions"><button class="btn btn-soft btn-sm" data-act="add">' + icon('plus') + 'Add days</button></div></div>';
    if (!waterDays.length) html += '<div class="empty"><h3>No water days yet</h3><p>Log a practice as “On the water”, then rate how it was. Similar-day matching gets better with every rated day.</p></div>';
    else html += '<div class="table-wrap"><table class="data cond"><thead><tr><th>Date</th><th>Rating</th><th>Note</th><th>Wind</th><th>Gusts</th><th>From</th><th>Temp</th><th>Light</th>' + (w ? '<th title="How similar this day was to today">Like today</th>' : '') + '</tr></thead><tbody>' +
      waterDays.map(function (d) {
        var en = store.days[d], ww = en.weather || {};
        return '<tr data-date="' + d + '"><td>' + fmtDate(d) + (en.outcome === 'split' ? ' <span class="badge split" title="Half & half">½</span>' : '') + '</td><td>' + rateRow(d, en, true) + '</td>' +
          '<td><input class="text-input sm" data-rnote="' + d + '" maxlength="140" value="' + esc(en.ratingNote || '') + '" placeholder="Add a note" style="min-width:200px" aria-label="Note for ' + d + '"></td>' +
          '<td class="num">' + num(ww.windAvg) + '</td><td class="num">' + num(ww.gustMax) + '</td><td>' + (ww.dir == null ? '–' : W.compass(ww.dir)) + '</td><td class="num">' + num(ww.tempAvg) + '°</td>' +
          '<td class="num">' + (ww.daylight == null ? '–' : ww.daylight + ' + ' + ww.twilight) + '</td>' +
          (w ? '<td class="num">' + (en.weather && en.weather.windAvg != null ? Math.round(C.similarity(w, en.weather) * 100) + '%' : '–') + '</td>' : '') + '</tr>';
      }).join('') + '</tbody></table></div>';
    html += '</section>';
    el.innerHTML = html;
  }
  function compare(a, b) {
    function row(label, x, y) { return '<tr><td>' + label + '</td><td>' + x + '</td><td>' + y + '</td></tr>'; }
    function sky(w) { return w.thunder ? 'Storms' : (w.precip ? num(w.precip, 2) + ' in rain' : num(w.cloud) + '% cloud'); }
    var La = a.daylight + a.twilight, Lb = b.daylight + b.twilight;
    return '<table class="cmp"><thead><tr><th></th><th>Today</th><th>That day</th></tr></thead><tbody>' +
      row('Wind', num(a.windAvg) + ' mph', num(b.windAvg) + ' mph') +
      row('Gusts', num(a.gustMax) + ' mph', num(b.gustMax) + ' mph') +
      row('From', W.compass(a.dir), W.compass(b.dir)) +
      row('Temp', num(a.tempAvg) + '°F', num(b.tempAvg) + '°F') +
      row('Light', isNaN(La) ? '–' : La + ' min', isNaN(Lb) ? '–' : Lb + ' min') +
      row('Sky', sky(a), sky(b)) +
      '</tbody></table>';
  }

  /* ---------- Events ---------- */
  function onClick(e) {
    var rt = e.target.closest('[data-rate]');
    if (rt) {
      var rd = rt.dataset.date, en = store.days[rd]; if (!en) return;
      var val = +rt.dataset.rate;
      en.rating = en.rating === val ? null : val;
      save(); renderAll();
      if (en.rating) toast('Rated ' + fmtDate(rd) + ': ' + en.rating + ' · ' + C.LABELS[en.rating]);
      return;
    }
    var lg = e.target.closest('[data-log]');
    if (lg) { logOutcome(S.todayKey(), lg.dataset.log); return; }
    var wy = e.target.closest('[data-why]');
    if (wy) {
      var wd = store.days[wy.dataset.date]; if (!wd) return;
      wd.landWhy = wy.dataset.why; save(); renderAll(); retrainSoon();
      toast(wy.dataset.why === 'planned' ? 'Marked as a planned land day. It won’t be used for training.' : 'Marked as land because of the weather');
      return;
    }
    var pl = e.target.closest('[data-plan]');
    if (pl) { planDialog(pl.dataset.plan); return; }
    var a = e.target.closest('[data-act]');
    if (a) {
      var act = a.dataset.act;
      if (act === 'add') addDaysDialog();
      if (act === 'retrain') { manualTrain = true; maybeRetrain(true); }
      if (act === 'demo') loadDemo();
      if (act === 'clearDemo') {
        Object.keys(store.days).forEach(function (d) { if (store.days[d].demo) delete store.days[d]; });
        save(); renderAll(); maybeRetrain(); toast('Demo days removed');
      }
      return;
    }
    var tr = e.target.closest('tr[data-date]');
    if (!tr) return;
    var d = tr.dataset.date;
    if (e.target.closest('[data-edit]')) editDay(d);
    if (e.target.closest('[data-del]')) {
      var prev = store.days[d];
      delete store.days[d]; save(); renderAll(); retrainSoon();
      toast('Deleted ' + fmtDate(d), { action: 'Undo', onAction: function () { store.days[d] = prev; save(); renderAll(); retrainSoon(); } });
    }
  }
  function onChange(e) {
    if (e.target.matches('[data-rnote]')) {
      var nd = e.target.dataset.rnote;
      if (store.days[nd]) { store.days[nd].ratingNote = e.target.value.trim(); save(); toast('Note saved'); }
      return;
    }
    if (e.target.matches('[data-include]')) {
      var d = e.target.closest('tr').dataset.date;
      store.days[d].include = e.target.checked;
      save(); renderData(); retrainSoon();
    }
  }

  function bindMenu() {
    var btn = $('#moreBtn'), menu = $('#menu');
    var items = [
      ['export', 'download', 'Export backup (JSON)'], ['import', 'upload', 'Import backup'], ['csv', 'table', 'Export data as CSV'], '-',
      ['demo', 'sparkles', 'Load demo data'], '-', ['erase', 'trash', 'Erase all data', true]
    ];
    menu.innerHTML = items.map(function (it) { return it === '-' ? '<hr>' : '<button data-m="' + it[0] + '" class="' + (it[3] ? 'danger' : '') + '">' + icon(it[1]) + esc(it[2]) + '</button>'; }).join('');
    function close() { menu.classList.remove('open'); document.removeEventListener('pointerdown', outside, true); }
    function outside(e) { if (!menu.parentElement.contains(e.target)) close(); }
    btn.addEventListener('click', function () { if (menu.classList.contains('open')) return close(); menu.classList.add('open'); document.addEventListener('pointerdown', outside, true); });
    menu.addEventListener('click', function (e) {
      var b = e.target.closest('[data-m]'); if (!b) return; close();
      var m = b.dataset.m;
      if (m === 'export') { download('rar-predictor-' + S.todayKey() + '.json', JSON.stringify({ app: 'rar-predictor', version: 1, exportedAt: new Date().toISOString(), days: store.days }, null, 2)); toast('Backup downloaded'); }
      if (m === 'import') importDialog();
      if (m === 'csv') exportCsv();
      if (m === 'demo') loadDemo();
      if (m === 'erase') confirmBox('Erase all data?', mode === 'shared' ? 'This deletes every logged day for everyone, on every device. Export a backup first if you might want it back.' : 'This deletes every logged day and the trained model from this browser. Export a backup first if you might want it back.', 'Erase everything').then(function (ok) {
        if (!ok) return; var syn = store.synced; store = blank(); store.synced = syn; save(); renderAll(); toast('All data erased'); sync();
      });
    });
  }

  function exportCsv() {
    var cols = ['date', 'outcome', 'land_reason', 'used_for_training', 'temp_avg_f', 'temp_min_f', 'wind_avg_mph', 'gust_max_mph', 'wind_dir_deg', 'wind_from', 'daylight_min', 'twilight_min', 'cloud_pct', 'rain_in', 'thunder', 'weather_source', 'live_prediction_water_pct', 'heldout_prediction_water_pct', 'conditions_rating', 'conditions_note', 'note'];
    var oof = store.model && store.model.ready ? store.model.oof : {};
    var lines = [cols.join(',')].concat(loggedDates().sort().map(function (d) {
      var e = store.days[d], w = e.weather || {};
      return [d, e.outcome, e.outcome === 'land' ? (e.landWhy || 'weather') : '', e.include !== false && labelOf(e) !== null, w.tempAvg, w.tempMin, w.windAvg, w.gustMax, w.dir, w.dir == null ? '' : W.compass(w.dir), w.daylight, w.twilight, w.cloud, w.precip, w.thunder, w.source,
        e.prediction ? Math.round(e.prediction.p * 100) : '', oof[d] != null ? Math.round(oof[d] * 100) : '', e.rating || '', e.ratingNote || '', e.note || '']
        .map(function (v) { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(',');
    }));
    download('rar-practice-data-' + S.todayKey() + '.csv', lines.join('\n') + '\n', 'text/csv');
  }

  function importDialog() {
    pickFile('.json,application/json').then(function (f) {
      if (!f) return;
      f.text().then(function (txt) {
        var data;
        try { data = JSON.parse(txt); } catch (e) { toast('That file is not valid JSON'); return; }
        if (!data || data.app !== 'rar-predictor' || typeof data.days !== 'object') { toast('That is not an RAR Predictor backup'); return; }
        var n = Object.keys(data.days).length;
        modal({ title: 'Import ' + n + ' days', size: 'sm', body: '<p class="confirm-text">Merge adds days from the backup and keeps your current days (the backup wins where both have the same date). Replace deletes your current days first.</p>', actions: [
          { label: 'Cancel', kind: 'btn-ghost' },
          { label: 'Replace', kind: 'btn-soft', onClick: function () { store.days = data.days; store.model = null; save(); renderAll(); maybeRetrain(true); sync(); toast('Imported ' + n + ' days'); } },
          { label: 'Merge', kind: 'btn-primary', onClick: function () { Object.assign(store.days, data.days); save(); renderAll(); maybeRetrain(); sync(); toast('Merged ' + n + ' days'); } }
        ] });
      });
    });
  }

  /* ---------- Add past days ---------- */
  function addDaysDialog() {
    var t = S.todayKey();
    var body = h('<div>' +
      '<p class="confirm-text">Pick a date range, then mark each day. <b>Land</b> means the weather kept you off the water; <b>Planned land</b> means a land day for its own sake (not used for training); <b>Half</b> is half & half. Weather and light are filled in automatically.</p>' +
      '<div class="form-row" style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
        '<div><label class="form-label" for="from">From</label><input class="text-input" type="date" id="from" max="' + t + '" value="' + S.addDays(t, -7) + '"></div>' +
        '<div><label class="form-label" for="to">To</label><input class="text-input" type="date" id="to" max="' + t + '" value="' + S.addDays(t, -1) + '"></div></div>' +
      '<div class="form-row" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="form-label" style="margin:0">Set all to</span>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-all="water">Water</button><button type="button" class="btn btn-ghost btn-sm" data-all="split">Half</button><button type="button" class="btn btn-ghost btn-sm" data-all="land">Land</button><button type="button" class="btn btn-ghost btn-sm" data-all="planned">Planned land</button><button type="button" class="btn btn-ghost btn-sm" data-all="none">No practice</button><button type="button" class="btn btn-ghost btn-sm" data-all="skip">Skip</button>' +
        '<label class="check-label" style="margin-left:auto"><input type="checkbox" id="wkends">Skip weekends</label></div>' +
      '<div class="bulk" id="bulk"></div></div>');
    var from = $('#from', body), to = $('#to', body), list = $('#bulk', body), wk = $('#wkends', body);
    var choice = {};
    function dates() {
      var a = from.value, b = to.value, out = [];
      if (!a || !b) return out;
      if (a > b) { var tmp = a; a = b; b = tmp; }
      if (b > t) b = t;
      for (var d = a; d <= b && out.length < 366; d = S.addDays(d, 1)) out.push(d);
      return out;
    }
    function paint() {
      var ds = dates();
      list.innerHTML = ds.map(function (d) {
        var cur = store.days[d] && store.days[d].outcome ? store.days[d] : null;
        return '<div class="bulk-row" data-d="' + d + '"><span class="d">' + fmtDate(d) + (cur ? '<small>logged: ' + outcomeText(cur) + '</small>' : '') + '</span>' +
          '<div class="seg"><button data-v="water">Water</button><button data-v="split">Half</button><button data-v="land">Land</button><button data-v="planned" title="Planned land day (not weather)">Planned</button><button data-v="none">None</button><button data-v="skip">Skip</button></div></div>';
      }).join('') || '<div class="muted" style="padding:14px;text-align:center">Pick a range of past dates.</div>';
      $$('.bulk-row', list).forEach(function (row) {
        var d = row.dataset.d, cur = store.days[d] && store.days[d].outcome ? store.days[d] : null, wkend = [0, 6].indexOf(dateObj(d).getUTCDay()) !== -1;
        var v = choice[d] || (cur ? (cur.outcome === 'land' && cur.landWhy === 'planned' ? 'planned' : cur.outcome) : 'skip');
        if (!choice[d] && !cur && wk.checked && wkend) v = 'skip';
        seg($('.seg', row), v, function (nv) { choice[d] = nv; });
      });
    }
    [from, to, wk].forEach(function (i) { i.addEventListener('change', paint); });
    body.addEventListener('click', function (e) {
      var b = e.target.closest('[data-all]'); if (!b) return;
      dates().forEach(function (d) {
        var wkend = [0, 6].indexOf(dateObj(d).getUTCDay()) !== -1;
        choice[d] = wk.checked && wkend ? 'skip' : b.dataset.all;
      });
      paint();
    });
    paint();
    modal({ title: 'Add past days', size: 'lg', body: body, actions: [
      { label: 'Cancel', kind: 'btn-ghost' },
      { label: 'Save days', kind: 'btn-primary', onClick: function () {
        var n = 0;
        Object.keys(choice).forEach(function (d) {
          var v = choice[d];
          if (v === 'skip') { return; }
          var e = store.days[d] || { include: true };
          if (e.include == null) e.include = true;
          e.outcome = v === 'planned' ? 'land' : v; e.loggedAt = Date.now();
          if (e.outcome === 'land') e.landWhy = v === 'planned' ? 'planned' : 'weather'; else delete e.landWhy;
          store.days[d] = e; n++;
        });
        if (!n) { toast('Mark at least one day (anything other than Skip)'); return false; }
        save(); renderAll();
        toast('Saved ' + n + ' day' + (n === 1 ? '' : 's') + '. Fetching their weather…');
        sync().then(function () { maybeRetrain(); });
      } }
    ] });
  }

  /* ---------- Edit a day ---------- */
  var FIELDS = [
    ['tempAvg', 'Avg temp °F'], ['tempMin', 'Low temp °F'], ['windAvg', 'Avg wind mph'], ['gustMax', 'Max gust mph'],
    ['dir', 'Wind from (°)'], ['cloud', 'Cloud cover %'], ['precip', 'Rain (in)']
  ];
  function editDay(d) {
    var e = store.days[d], w = Object.assign({}, e.weather || W.lightOnly(d));
    var L2 = S.light(d);
    var body = h('<div>' +
      '<div class="form-row"><span class="form-label">Practice</span><div class="seg" id="eo"><button data-v="water">On the water</button><button data-v="split">Half & half</button><button data-v="land">On land</button><button data-v="none">No practice</button></div></div>' +
      '<div class="form-row" id="ewhyRow"><span class="form-label">Why on land?</span><div class="seg" id="ewhy"><button data-v="weather">Because of the weather</button><button data-v="planned">Planned land day</button></div>' +
        '<p class="muted" style="font-size:12.5px;margin:6px 0 0">Planned land days are never used to train the model.</p></div>' +
      '<div class="form-row"><label class="check-label"><input type="checkbox" id="einc"' + (e.include === false ? '' : ' checked') + '>Use this day for training</label></div>' +
      '<div class="form-row" id="erateRow"><span class="form-label">Conditions on the water</span><div class="seg" id="erate"><button data-v="0">Not rated</button>' + [1, 2, 3, 4, 5].map(function (k) { return '<button data-v="' + k + '" title="' + C.LABELS[k] + '">' + k + '</button>'; }).join('') + '</div>' +
        '<input class="text-input sm" id="ernote" maxlength="140" style="margin-top:8px" placeholder="Short note about the water" value="' + esc(e.ratingNote || '') + '"></div>' +
      '<div class="section-label" style="margin:18px 0 8px;display:flex;justify-content:space-between;align-items:center">Weather, ' + S.practice(d).short + ' <button type="button" class="btn btn-ghost btn-sm" id="refetch">' + icon('refresh') + 'Re-fetch</button></div>' +
      '<div class="form-grid">' + FIELDS.map(function (f) {
        return '<div><label class="form-label" for="f-' + f[0] + '">' + f[1] + '</label><input class="text-input sm" type="number" step="any" id="f-' + f[0] + '" value="' + (w[f[0]] == null ? '' : w[f[0]]) + '"></div>';
      }).join('') +
      '<div><span class="form-label">Thunder</span><label class="check-label" style="height:32px"><input type="checkbox" id="f-thunder"' + (w.thunder ? ' checked' : '') + '>Storms</label></div></div>' +
      '<p class="muted" style="font-size:12.5px;margin:10px 0 0">Light (calculated): ' + L2.daylight + ' min daylight + ' + L2.twilight + ' min twilight during ' + S.practice(d).label + (L2.sunset ? ' · sunset ' + L2.sunset : '') + '. Source: ' + (w.source === 'manual' ? 'entered by hand' : w.source ? 'Open-Meteo' + (w.provisional ? ' (forecast)' : '') : 'none yet') + '.</p>' +
      '<div class="form-row"><label class="form-label" for="enote">Note</label><textarea class="text-area" id="enote" rows="2" placeholder="e.g. lightning nearby, coach call">' + esc(e.note || '') + '</textarea></div>' +
      '</div>');
    var outcome = e.outcome, rating = e.rating || 0, why = e.landWhy === 'planned' ? 'planned' : 'weather';
    function showRate() { $('#erateRow', body).hidden = outcome !== 'water' && outcome !== 'split'; $('#ewhyRow', body).hidden = outcome !== 'land'; }
    seg($('#ewhy', body), why, function (v) { why = v; });
    seg($('#eo', body), outcome, function (v) { outcome = v; showRate(); });
    seg($('#erate', body), String(rating), function (v) { rating = +v; });
    showRate();
    var edited = false;
    $$('.form-grid input', body).forEach(function (i) { i.addEventListener('input', function () { edited = true; }); });
    $('#refetch', body).addEventListener('click', function (ev) {
      var b = ev.currentTarget; b.disabled = true;
      W.fetchRange(d, d).then(function (got) {
        if (!got[d]) throw new Error('No weather available for this date');
        w = got[d]; edited = false;
        FIELDS.forEach(function (f) { $('#f-' + f[0], body).value = w[f[0]] == null ? '' : w[f[0]]; });
        $('#f-thunder', body).checked = !!w.thunder;
        toast('Weather re-fetched');
      }).catch(function (err) { toast(err.message); }).then(function () { b.disabled = false; });
    });
    modal({ title: fmtDate(d, { year: true }), body: body, actions: [
      { label: 'Delete day', kind: 'btn-ghost', left: true, onClick: function () {
        var prev = store.days[d]; delete store.days[d]; save(); renderAll(); retrainSoon();
        toast('Deleted ' + fmtDate(d), { action: 'Undo', onAction: function () { store.days[d] = prev; save(); renderAll(); retrainSoon(); } });
      } },
      { label: 'Cancel', kind: 'btn-ghost' },
      { label: 'Save', kind: 'btn-primary', onClick: function () {
        var nw = Object.assign({}, w);
        FIELDS.forEach(function (f) { var v = $('#f-' + f[0], body).value; nw[f[0]] = v === '' ? null : +v; });
        nw.thunder = $('#f-thunder', body).checked ? 1 : 0;
        nw.daylight = L2.daylight; nw.twilight = L2.twilight; nw.sunset = L2.sunset; nw.window = S.practice(d).id;
        if (edited || nw.thunder !== (w.thunder ? 1 : 0)) { nw.source = 'manual'; nw.provisional = false; }
        e.outcome = outcome; e.include = $('#einc', body).checked; e.note = $('#enote', body).value.trim();
        e.rating = (outcome === 'water' || outcome === 'split') && rating ? rating : null; e.ratingNote = $('#ernote', body).value.trim();
        if (outcome === 'land') e.landWhy = why; else delete e.landWhy;
        e.weather = nw.tempAvg == null && nw.windAvg == null && !e.weather ? null : nw;
        store.days[d] = e; save(); renderAll(); retrainSoon();
        toast('Saved ' + fmtDate(d));
      } }
    ] });
  }

  /* ---------- Demo data ---------- */
  function loadDemo() {
    var t = S.todayKey(), start = S.addDays(t, -75), end = S.addDays(t, -1);
    toast('Fetching 75 days of real weather for the demo…');
    W.fetchRange(start, end).then(function (got) {
      var seed = 11, n = 0;
      function r() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
      Object.keys(got).forEach(function (d) {
        if (store.days[d]) return;
        if ([0, 6].indexOf(dateObj(d).getUTCDay()) !== -1) return;
        var p = L.starter(got[d]);
        var water = r() < (p > 0.5 ? 0.9 : 0.12);
        store.days[d] = { outcome: water ? 'water' : 'land', include: true, weather: got[d], demo: true, loggedAt: Date.now() };
        n++;
      });
      save(); renderAll(); maybeRetrain();
      toast('Added ' + n + ' demo weekdays with made-up outcomes. Remove them any time.');
    }).catch(function (e) { toast(e.message); });
  }

  /* ---------- Boot ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    $('#brandMark').innerHTML = '<svg viewBox="0 0 24 24">' + ICONS.waves + '</svg>';
    detectMode().then(function (m) {
      mode = m;
      if (unlocked()) start(); else renderLock();
    });
  });
})();
