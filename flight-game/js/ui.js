// Menus: dialogue, shops, hangar, pause, controls. Everything works with mouse, keyboard or a controller.
import { LIBRARY, CATEGORIES, PARTS, PART, SLOT_NAMES, customSpec } from './planes.js';
import { AXIS_ACTIONS, BUTTON_ACTIONS } from './input.js';

const $ = (id) => document.getElementById(id);
const KT = 1.94384;
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hex = (n) => '#' + n.toString(16).padStart(6, '0');

export class UI {
  constructor(G) {
    this.G = G; this.el = null; this.onBack = null; this.kind = null; this.tick = null;
    this.hangarCat = 'Trainers';
    for (const id of ['panel', 'modal', 'dialog']) {
      $(id).addEventListener('click', (e) => { const b = e.target.closest('[data-a]'); if (b && !b.disabled) this.handlers?.[b.dataset.a]?.(b.dataset.v, b); });
      $(id).addEventListener('input', (e) => { const b = e.target.closest('[data-i]'); if (b) this.handlers?.[b.dataset.i]?.(b.type === 'checkbox' ? b.checked : b.value, b); });
    }
  }
  get open() { return !!this.el; }

  show(id, kind, html, handlers, onBack) {
    const keep = this.kind === kind && this.el ? this.focusKey() : null;
    const scroll = this.kind === kind && this.el ? this.el.querySelector('.body')?.scrollTop : 0;
    this.hide(true);
    this.el = $(id); this.kind = kind; this.handlers = handlers; this.onBack = onBack; this.tick = null;
    this.el.innerHTML = html; this.el.hidden = false;
    $('scrim').hidden = id !== 'modal';
    const body = this.el.querySelector('.body'); if (body && scroll) body.scrollTop = scroll;
    const again = keep && [...this.el.querySelectorAll('[data-a]')].find(b => b.dataset.a + '|' + b.dataset.v === keep && !b.disabled);
    (again || this.el.querySelector('[autofocus]') || this.focusables()[0])?.focus({ preventScroll: !!again });
    this.G.onUIChange();
  }
  focusKey() { const a = document.activeElement; return a?.dataset?.a ? a.dataset.a + '|' + a.dataset.v : null; }
  hide(silent) {
    if (this.el) { this.el.hidden = true; this.el.innerHTML = ''; }
    $('scrim').hidden = true;
    this.el = null; this.kind = null; this.tick = null;
    if (!silent) this.G.onUIChange();
  }
  back() { const f = this.onBack; if (f) f(); else this.hide(); }

  focusables() { return this.el ? [...this.el.querySelectorAll('button:not(:disabled), input, select')].filter(e => e.offsetParent) : []; }
  // Move focus to the nearest control in a direction (arrow keys, d-pad, hat or stick).
  nav(dir) {
    const cur = document.activeElement, list = this.focusables();
    if (!list.length) return;
    if (!list.includes(cur)) return list[0].focus();
    if (cur.type === 'range' && (dir === 'Left' || dir === 'Right')) {
      cur.value = +cur.value + (dir === 'Right' ? 1 : -1) * (+cur.step || 1); cur.dispatchEvent(new Event('input', { bubbles: true })); return;
    }
    if (cur.tagName === 'SELECT' && (dir === 'Left' || dir === 'Right')) {
      cur.selectedIndex = Math.min(cur.options.length - 1, Math.max(0, cur.selectedIndex + (dir === 'Right' ? 1 : -1))); cur.dispatchEvent(new Event('input', { bubbles: true })); return;
    }
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const [dx, dy] = { Up: [0, -1], Down: [0, 1], Left: [-1, 0], Right: [1, 0] }[dir];
    let best = null, bs = Infinity;
    for (const e of list) {
      if (e === cur) continue;
      const q = e.getBoundingClientRect(), ex = q.left + q.width / 2 - cx, ey = q.top + q.height / 2 - cy;
      const along = ex * dx + ey * dy, across = Math.abs(ex * dy) + Math.abs(ey * dx);
      if (along < 4) continue;
      const score = along + across * 2.5;
      if (score < bs) { bs = score; best = e; }
    }
    if (best) { best.focus(); best.scrollIntoView({ block: 'nearest' }); }
  }
  accept() { const a = document.activeElement; if (a && this.el?.contains(a)) { if (a.type === 'checkbox') { a.checked = !a.checked; a.dispatchEvent(new Event('input', { bubbles: true })); } else a.click(); } }

  toast(msg, kind = '') {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
    $('toasts').append(t); setTimeout(() => t.remove(), 4600);
    while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  }
  prompt(html) { const p = $('prompt'); if (html) { if (p.dataset.h !== html) { p.innerHTML = html; p.dataset.h = html; } p.hidden = false; } else p.hidden = true; }
  coins(n) { $('coins').lastElementChild.textContent = n.toLocaleString('en-US'); }
  objective(html) { const o = $('objective'); o.hidden = !html; if (html && o.dataset.h !== html) { o.innerHTML = html; o.dataset.h = html; } }

  // ------------------------------------------------------------ dialogue
  dialog(npc, node) {
    const opts = (node.options || []).map((o, i) => `<button data-a="o" data-v="${i}">${esc(o.label)}</button>`).join('');
    this.show('dialog', 'dialog', `<div class="who"><b>${esc(npc.name)}</b><span>${esc(npc.role)}</span></div><p>${esc(node.text)}</p>
      <div class="opts">${opts}<button data-a="bye" class="${opts ? 'ghost' : 'primary'}">${opts ? 'Leave' : 'OK'}</button></div>`,
      { o: (i) => { const o = node.options[+i]; this.hide(); o.fn(); }, bye: () => this.hide() });
  }

  // ------------------------------------------------------------ stats helpers
  statBlock(s) {
    return `<div class="stats">
      <div class="stat"><small>Top speed</small><b>${Math.round(s.vmax * KT)}</b> kt</div>
      <div class="stat"><small>Stall</small><b>${Math.round(s.vstall * KT)}</b> kt</div>
      <div class="stat"><small>Climb</small><b>${Math.round(s.climb * 196.85 / 10) * 10}</b> fpm</div>
      <div class="stat"><small>Roll</small><b>${Math.round(s.rollRate * 57.3)}</b>°/s</div></div>`;
  }
  deltaChips(cur, nxt) {
    const rows = [['Top', nxt.vmax * KT - cur.vmax * KT, 'kt', 1], ['Stall', nxt.vstall * KT - cur.vstall * KT, 'kt', -1], ['Climb', (nxt.climb - cur.climb) * 196.85, 'fpm', 1],
      ['Roll', (nxt.rollRate - cur.rollRate) * 57.3, '°/s', 1], ['Pitch', (nxt.pitchRate - cur.pitchRate) * 57.3, '°/s', 1], ['Rudder', (nxt.yawRate - cur.yawRate) * 57.3, '°/s', 1], ['Mass', nxt.mass - cur.mass, 'kg', -1]];
    return rows.filter(r => Math.abs(r[1]) >= (r[2] === 'fpm' ? 15 : 1)).map(([n, d, u, good]) =>
      `<span class="chip ${d * good > 0 ? 'up' : 'down'}">${n} ${d > 0 ? '+' : '−'}${Math.abs(Math.round(d))} ${u}</span>`).join('');
  }

  // ------------------------------------------------------------ part shop
  shop(slot, npc) {
    const G = this.G, S = G.save, cur = G.custom.spec;
    const titles = { engine: 'Piston & Thunder', wings: 'Wing Works', tail: 'Rudder & Wheel', gear: 'Rudder & Wheel', paint: 'Splash Paint', extra: 'Odds & Props' };
    const cards = PARTS.filter(p => p.slot === slot).map(p => {
      const owned = S.owned.includes(p.id);
      const fitted = slot === 'extra' ? S.loadout.extras.includes(p.id) : S.loadout[slot] === p.id;
      const lo = slot === 'extra' ? { ...S.loadout, extras: fitted ? S.loadout.extras : [...S.loadout.extras, p.id] } : { ...S.loadout, [slot]: p.id };
      const chips = fitted ? '' : this.deltaChips(cur, customSpec(lo));
      const extra = p.col ? `<span class="swatch">${p.col.map(c => `<i style="background:${hex(c)}"></i>`).join('')}</span>` : p.retract ? '<span class="chip">Retracts</span>' : p.floats ? '<span class="chip">Lands on water</span>' : p.id === 'x_smoke' ? '<span class="chip">Smoke trail</span>' : '';
      const btn = fitted ? `<button disabled>Fitted</button>` :
        owned ? `<button data-a="fit" data-v="${p.id}" class="primary">Fit</button>` :
          `<button data-a="buy" data-v="${p.id}" class="primary" ${S.coins < p.price ? 'disabled' : ''}>${S.coins < p.price ? `Short ${p.price - S.coins}` : 'Buy'}</button>`;
      return `<div class="card ${fitted ? 'on' : ''}"><div class="head"><b>${esc(p.name)}</b><span class="price">${owned ? 'Owned' : p.price}</span></div>
        <p>${esc(p.blurb)}</p><div class="chips">${chips}${extra}</div>${btn}</div>`;
    }).join('');
    this.show('panel', 'shop', `<header><h2>${titles[slot]}</h2><span class="price num">${S.coins.toLocaleString('en-US')}</span></header>
      <div class="body"><p class="note">${SLOT_NAMES[slot]} · fitted on purchase · ${esc(S.planeName)}</p>${this.statBlock(cur)}${cards}</div>
      <footer><button data-a="close">Done</button></footer>`,
      { buy: (id) => { if (G.buyPart(id)) this.shop(slot, npc); }, fit: (id) => { G.fitPart(id); this.shop(slot, npc); }, close: () => this.hide() });
  }

  // ------------------------------------------------------------ hangar
  hangar() {
    const G = this.G, S = G.save, sel = G.lib.spec;
    const tabs = CATEGORIES.map(c => `<button data-a="cat" data-v="${c}" class="${c === this.hangarCat ? 'on' : ''}">${c}</button>`).join('');
    const list = LIBRARY.filter(p => p.cat === this.hangarCat).map(p => `<button data-a="pick" data-v="${p.id}" class="${p.id === sel.id ? 'on' : ''}"><span>${esc(p.name)}</span><small>${Math.round(p.vmax * KT)} kt</small></button>`).join('');
    const bar = (label, val, max, unit) => `<div class="barrow"><span>${label}</span><div class="bar"><i style="width:${Math.min(100, (val / max) * 100)}%"></i></div><span>${Math.round(val)} ${unit}</span></div>`;
    const tags = [sel.jet ? 'Jet' : 'Propeller', sel.retract ? 'Retractable gear' : sel.floats ? 'Floats: lands on water' : 'Fixed gear', sel.tailwheel ? 'Taildragger' : null].filter(Boolean).map(t => `<span class="chip">${t}</span>`).join('');
    this.show('panel', 'hangar', `<header><h2>Hangar</h2><span class="price">${LIBRARY.length} aeroplanes</span></header>
      <div class="body"><div class="tabs">${tabs}</div><div class="list">${list}</div>
        <div class="card on"><div class="head"><b>${esc(sel.name)}</b><span class="price">${esc(sel.cat)}</span></div><p>${esc(sel.blurb)}</p><div class="chips">${tags}</div>
          ${bar('Top speed', sel.vmax * KT, 860, 'kt')}${bar('Stall speed', sel.vstall * KT, 140, 'kt')}${bar('Climb', sel.climb * 196.85, 30000, 'fpm')}${bar('Roll rate', sel.rollRate * 57.3, 345, '°/s')}${bar('Weight', sel.mass / 1000, 240, 't')}
        </div>
        <div class="field"><label for="pname">Your plane's name</label><input type="text" id="pname" data-i="name" maxlength="22" value="${esc(S.planeName)}" style="width:170px"></div>
      </div>
      <footer><button data-a="fly" class="primary">Fly</button><button data-a="close">Close</button></footer>`,
      { cat: (c) => { this.hangarCat = c; this.hangar(); }, pick: (id) => { G.setLibPlane(id); this.hangar(); }, fly: () => { this.hide(); G.board(G.lib); },
        name: (v) => { S.planeName = v.trim() || 'The Tinker'; G.custom.spec.name = S.planeName; G.persist(); }, close: () => this.hide() });
  }

  // ------------------------------------------------------------ pause
  pause() {
    const G = this.G;
    this.show('modal', 'pause', `<header><h2>Paused</h2><span class="price num">${G.save.coins.toLocaleString('en-US')}</span></header>
      <div class="body"><div class="menu">
        <button data-a="resume" class="primary">Resume</button>
        <button data-a="controls">Controls &amp; settings</button>
        <button data-a="help">Help</button>
        <button data-a="home">Return to base</button>
        <button data-a="wipe">New game</button>
      </div></div>`,
      { resume: () => this.hide(), controls: () => this.controls(() => this.pause()), help: () => this.help(() => this.pause()), home: () => { this.hide(); G.goHome(); },
        wipe: () => this.confirm('New game', 'Erases coins, parts and discoveries. Keeps settings and bindings.', () => G.wipe(), () => this.pause()) });
  }
  confirm(title, text, yes, no) {
    this.show('modal', 'confirm', `<header><h2>${title}</h2></header><div class="body"><p class="note">${text}</p></div><footer><button data-a="no" class="primary" autofocus>Cancel</button><button data-a="yes">Erase</button></footer>`,
      { yes, no }, no);
  }

  // ------------------------------------------------------------ help
  help(back) {
    const k = (keys, what) => `<span>${keys.split(' ').map(x => x === '/' ? '/' : `<kbd>${x}</kbd>`).join(' ')}</span><span>${what}</span>`;
    this.show('modal', 'help', `<header><h2>Help</h2></header><div class="body">
      <p class="note">Board a plane from the apron. Hangar: Captain Ines. Parts: shops on the main street, fitted on purchase. Coins: parcels, rings, new airfields.</p>
      <div class="cols"><div><h3>Flying</h3><div class="keys">
        ${k('W S', 'Nose down / nose up')}${k('A D', 'Roll left / right')}${k('Q E', 'Rudder, and steering on the ground')}${k('R F', 'Throttle up / down (also <kbd>Shift</kbd>, mouse wheel)')}${k('1 … 9 0', 'Set throttle 10% … 100%')}
        ${k('G', 'Landing gear')}${k('V', 'Flaps: up, half, full')}${k('B / Space', 'Wheel brakes')}${k(', .', 'Pitch trim')}${k('C', 'Camera: chase, cockpit, wide')}${k('M', 'Mouse flying: aim, yoke, off')}
        ${k('X', 'Smoke (if fitted)')}${k('Enter', 'Leave the plane when stopped')}${k('Backspace', 'Back to the home runway')}${k('Esc', 'Pause')}</div></div>
      <div><h3>On foot</h3><div class="keys">${k('W A S D', 'Walk')}${k('Shift', 'Run')}${k('Space', 'Hop')}${k('E', 'Talk, board a plane')}</div>
        <h3>Mouse</h3><div class="keys"><span>Aim</span><span>Plane follows the circle</span><span>Yoke</span><span>Mouse is the stick. Middle-click centres</span><span>Right button</span><span>Look around</span></div>
        <h3>Joystick / HOTAS</h3><p class="note">Plug in and press a button. Throttle levers are absolute. Rebind in Controls.</p>
        <h3>Take-off / landing</h3><p class="note">Rotate at 1.2 × VS. Land at 1.3 × VS, flaps full, hold the nose up.</p></div></div>
      </div><footer><button data-a="close" class="primary">Close</button></footer>`, { close: () => (back ? back() : this.hide()) }, back);
  }

  // ------------------------------------------------------------ controls & settings
  controls(back) {
    const G = this.G, st = G.save.settings, inp = G.input;
    const row = (kind, [id, label]) => {
      const d = inp.describe(kind, id);
      const listening = inp.listen && inp.listen.action === id;
      return `<tr><td>${label}</td><td class="bindtxt ${listening ? '' : d ? (d.connected ? '' : 'off') : 'none'}">${listening ? (kind === 'axis' ? 'Move axis' : 'Press button') : d ? esc(d.text) + (d.connected ? '' : ' (unplugged)') : 'not bound'}</td>
        <td style="white-space:nowrap"><button data-a="bind" data-v="${kind}:${id}">${listening ? 'Cancel' : 'Bind'}</button>
        ${kind === 'axis' && d ? ` <button data-a="inv" data-v="${id}">${d.inv ? 'Inverted' : 'Normal'}</button>` : ''}${d ? ` <button data-a="clear" data-v="${kind}:${id}" class="ghost">Clear</button>` : ''}</td></tr>`;
    };
    const again = () => this.controls(back);
    this.show('modal', 'controls', `<header><h2>Controls</h2><span class="price">${inp.pads.length} connected</span></header><div class="body">
      <h3>Settings</h3>
      <div class="field"><label for="s-mouse">Mouse flying</label><select id="s-mouse" data-i="mouseMode"><option value="aim">Aim</option><option value="yoke">Yoke</option><option value="off">Off</option></select></div>
      <div class="field"><label for="s-sens">Mouse sensitivity</label><input id="s-sens" type="range" min="0.3" max="2.5" step="0.1" value="${st.mouseSens}" data-i="mouseSens"></div>
      <div class="field"><label for="s-inv">Invert pitch</label><input id="s-inv" type="checkbox" ${st.invertPitch ? 'checked' : ''} data-i="invertPitch"></div>
      <div class="field"><label for="s-assist">Flight assist<small>Levels the wings hands-off. Keyboard and mouse only.</small></label><input id="s-assist" type="checkbox" ${st.assist ? 'checked' : ''} data-i="assist"></div>
      <div class="field"><label for="s-dz">Stick dead zone</label><input id="s-dz" type="range" min="0" max="0.3" step="0.01" value="${st.deadzone}" data-i="deadzone"></div>
      <div class="field"><label for="s-curve">Stick response curve</label><input id="s-curve" type="range" min="1" max="2.5" step="0.1" value="${st.curve}" data-i="curve"></div>
      <div class="field"><label for="s-vol">Sound volume</label><input id="s-vol" type="range" min="0" max="1" step="0.05" value="${st.volume}" data-i="volume"></div>
      <div class="field"><label for="s-q">Graphics quality<small>Reloads the game.</small></label><select id="s-q" data-i="quality"><option value="0">Low</option><option value="1">Medium</option><option value="2">High</option></select></div>
      <h3>Controllers</h3>
      <div id="devs">${inp.pads.length ? '' : '<p class="note">No controller. Plug one in and press a button on it.</p>'}</div>
      <h3>Axes</h3><table><tr><th>Action</th><th>Bound to</th><th></th></tr>${AXIS_ACTIONS.map(a => row('axis', a)).join('')}</table>
      <h3>Buttons</h3><table><tr><th>Action</th><th>Bound to</th><th></th></tr>${BUTTON_ACTIONS.map(a => row('button', a)).join('')}</table>
      </div><footer><button data-a="close" class="primary">Done</button><button data-a="defaults">Reset bindings</button></footer>`,
      {
        mouseMode: (v) => { st.mouseMode = v; G.persist(); }, mouseSens: (v) => { st.mouseSens = +v; G.persist(); }, invertPitch: (v) => { st.invertPitch = v; G.persist(); },
        assist: (v) => { st.assist = v; G.persist(); }, deadzone: (v) => { st.deadzone = +v; G.persist(); }, curve: (v) => { st.curve = +v; G.persist(); },
        volume: (v) => { st.volume = +v; G.persist(); G.audio.setVolume(st.volume); }, quality: (v) => { st.quality = +v; G.persist(); location.reload(); },
        bind: (v) => { const [kind, id] = v.split(':'); if (inp.listen) { inp.cancelListen(); again(); } else { inp.startListen(kind, id, again); again(); } },
        inv: (id) => { inp.bind.axes[id].inv = !inp.bind.axes[id].inv; inp.lastThrAxis = null; G.persist(); again(); },
        clear: (v) => { const [kind, id] = v.split(':'); delete inp.bind[kind === 'axis' ? 'axes' : 'buttons'][id]; G.persist(); again(); },
        defaults: () => { inp.bind.axes = {}; inp.bind.buttons = {}; inp.bind.seen = []; G.persist(); setTimeout(again, 60); },
        close: () => { inp.cancelListen(); back ? back() : this.hide(); },
      }, () => { inp.cancelListen(); back ? back() : this.hide(); });
    $('s-mouse').value = st.mouseMode; $('s-q').value = String(st.quality);
    // Live read-out of every axis and button, so it is obvious which physical control is which.
    let sig = '';
    this.tick = () => {
      const box = $('devs'); if (!box) return;
      const now = inp.pads.map(p => p.id + p.axes.length + ':' + p.buttons.length).join('|');
      if (now !== sig) {
        sig = now;
        if (inp.pads.length) box.innerHTML = inp.pads.map((p, i) => `<div class="dev"><b>${esc(p.id.slice(0, 60))}</b><div class="axes">${p.axes.map((_, a) => `<div class="axis"><div><i id="ax-${i}-${a}"></i></div>${a}</div>`).join('')}</div><div class="btns">${p.buttons.map((_, b) => `<i id="bt-${i}-${b}"></i>`).join('')}</div></div>`).join('');
      }
      inp.pads.forEach((p, i) => {
        p.axes.forEach((val, a) => { const e = $(`ax-${i}-${a}`); if (e) e.style.top = (Math.min(1, Math.max(-1, val)) * 0.5 + 0.5) * 31 + 'px'; });
        p.buttons.forEach((b, j) => { const e = $(`bt-${i}-${j}`); if (e) e.className = b.pressed ? 'on' : ''; });
      });
    };
  }
}
