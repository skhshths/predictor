// Input: keyboard, mouse and any number of game controllers (gamepads, sticks, throttles, pedals).
// Controllers are read through the Gamepad API. Every axis and button is rebindable per device.

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

export const AXIS_ACTIONS = [
  ['roll', 'Roll (ailerons)'], ['pitch', 'Pitch (elevator)'], ['yaw', 'Yaw (rudder)'], ['throttle', 'Throttle (absolute lever)'],
  ['brakeAxis', 'Wheel brakes (toe brake axis)'], ['lookX', 'Look left / right'], ['lookY', 'Look up / down'], ['hat', 'Hat switch (POV axis)'],
];
export const BUTTON_ACTIONS = [
  ['interact', 'Interact / board / leave plane'], ['brake', 'Wheel brakes (hold)'], ['gear', 'Landing gear'], ['flaps', 'Flaps (cycle)'],
  ['camera', 'Change camera'], ['lookMod', 'Free look (hold)'], ['throttleUp', 'Throttle up (hold)'], ['throttleDown', 'Throttle down (hold)'],
  ['trimUp', 'Trim nose up'], ['trimDown', 'Trim nose down'], ['smoke', 'Smoke'], ['reset', 'Reset to runway'], ['pause', 'Pause / menu'],
  ['menuAccept', 'Menu: select'], ['menuBack', 'Menu: back'], ['menuUp', 'Menu: up'], ['menuDown', 'Menu: down'], ['menuLeft', 'Menu: left'], ['menuRight', 'Menu: right'],
];

const FLY_KEYS = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const KEY_ACTIONS = {
  KeyG: 'gear', KeyV: 'flaps', KeyC: 'camera', KeyM: 'mouseMode', KeyX: 'smoke', Backspace: 'reset', Escape: 'pause', KeyP: 'pause',
  Enter: 'enter', KeyE: 'keyE', KeyH: 'help', Tab: 'map',
};
// Chrome reports a POV hat as one axis with eight evenly spaced values; idle sits above 1.
const HAT_DIRS = [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];

export class Input {
  constructor(canvas, settings, bindings, onChange) {
    this.canvas = canvas; this.settings = settings; this.onChange = onChange;
    this.bind = bindings; this.bind.axes ??= {}; this.bind.buttons ??= {}; this.bind.seen ??= [];
    this.keys = new Set(); this.pressed = new Set();
    this.mdx = 0; this.mdy = 0; this.wheel = 0; this.mx = 0; this.my = 0; this.buttons = 0;
    this.locked = false; this.lockWanted = false; this.onUnlock = null;
    this.active = 'keys';        // which device last gave a flight command: keys | mouse | stick
    this.throttle = 0; this.lastThrAxis = null;
    this.k = { pitch: 0, roll: 0, yaw: 0 };
    this.pad = { pitch: 0, roll: 0, yaw: 0, lookX: 0, lookY: 0, brake: 0, hatX: 0, hatY: 0 };
    this.held = {}; this.prevBtn = {}; this.menuRepeat = 0; this.menuDir = '';
    this.listen = null; this.pads = [];

    addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' && e.target.type === 'text') return;
      if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(e.code)) e.preventDefault();
      if (e.repeat) { if (e.code.startsWith('Arrow')) this.pressed.add('nav' + e.code.slice(5)); return; }
      this.keys.add(e.code);
      if (FLY_KEYS.has(e.code)) this.active = 'keys';
      if (KEY_ACTIONS[e.code]) this.pressed.add(KEY_ACTIONS[e.code]);
      if (e.code.startsWith('Arrow')) this.pressed.add('nav' + e.code.slice(5));
      if (e.code.startsWith('Digit')) this.pressed.add('thr' + e.code.slice(5));
      if (e.code === 'Space') this.pressed.add('space');
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', e => {
      this.mdx += e.movementX || 0; this.mdy += e.movementY || 0;
      this.mx = (e.clientX / innerWidth) * 2 - 1; this.my = (e.clientY / innerHeight) * 2 - 1;
    });
    addEventListener('mousedown', e => { this.buttons |= 1 << e.button; });
    addEventListener('mouseup', e => { this.buttons &= ~(1 << e.button); });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    addEventListener('wheel', e => { if (e.target === canvas || this.locked) this.wheel += Math.sign(e.deltaY); }, { passive: true });
    canvas.addEventListener('click', () => { if (this.lockWanted && !this.locked) this.requestLock(); });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.lockWanted && this.onUnlock) this.onUnlock();
    });
    addEventListener('gamepadconnected', () => this.onChange?.());
    addEventListener('gamepaddisconnected', () => this.onChange?.());
  }

  requestLock() {
    try { const p = this.canvas.requestPointerLock?.(); p?.catch?.(() => {}); } catch { /* optional */ }
  }
  setLockWanted(w) {
    this.lockWanted = w;
    if (!w && this.locked) document.exitPointerLock();
  }

  consume(a) { return this.pressed.delete(a); }
  down(a) { return !!this.held[a]; }

  // Sensible defaults for a controller the first time it is seen. Anything can be rebound later.
  autoBind(p) {
    const A = this.bind.axes, B = this.bind.buttons, id = p.id;
    // `own` marks a device built for that job (a throttle unit, pedals): it replaces an earlier automatic guess.
    const ax = (name, axis, inv = false, own = false) => { if (!A[name] || (own && A[name].auto)) A[name] = { dev: id, axis, inv, auto: !own }; };
    const bt = (name, button) => { if (!B[name]) B[name] = { dev: id, button }; };
    if (p.mapping === 'standard') {
      ax('roll', 0); ax('pitch', 1); ax('yaw', 2); ax('lookX', 2); ax('lookY', 3);
      [['interact', 0], ['brake', 1], ['gear', 2], ['flaps', 3], ['camera', 4], ['lookMod', 5], ['throttleDown', 6], ['throttleUp', 7],
        ['reset', 8], ['pause', 9], ['smoke', 10], ['menuAccept', 0], ['menuBack', 1], ['menuUp', 12], ['menuDown', 13], ['menuLeft', 14], ['menuRight', 15]]
        .forEach(([n, b]) => bt(n, b));
    } else {
      const n = p.axes.length, name = id.toLowerCase();
      if (/pedal|rudder/.test(name)) { ax('yaw', n > 2 ? 2 : 0, false, true); if (n > 2) ax('brakeAxis', 1, true, true); }
      else if (/throttle|twcs|quadrant/.test(name)) { ax('throttle', 2 < n ? 2 : 0, true, true); bt('gear', 0); bt('flaps', 1); bt('camera', 2); }
      else {
        ax('roll', 0); ax('pitch', 1);
        const yawAxis = n >= 6 ? 5 : n >= 4 ? 3 : 2;
        if (n > 2) ax('yaw', yawAxis);
        if (n >= 7) ax('throttle', 6, true); else if (n >= 4) ax('throttle', yawAxis === 3 ? 2 : 3, true);
        if (n >= 10) ax('hat', 9);
        [['brake', 0], ['interact', 1], ['gear', 2], ['flaps', 3], ['camera', 4], ['lookMod', 5], ['menuAccept', 0], ['menuBack', 1], ['pause', 9]]
          .forEach(([nm, b]) => { if (b < p.buttons.length) bt(nm, b); });
      }
    }
    this.bind.seen.push(id);
    this.onChange?.();
  }

  rawAxis(name) {
    const b = this.bind.axes[name]; if (!b) return null;
    const p = this.pads.find(q => q.id === b.dev); if (!p) return null;
    const v = p.axes[b.axis]; if (v === undefined) return null;
    return b.inv ? -v : v;
  }
  stickAxis(name) {
    const v = this.rawAxis(name); if (v === null) return 0;
    const dz = this.settings.deadzone, a = Math.abs(v);
    if (a < dz) return 0;
    return Math.sign(v) * Math.pow((a - dz) / (1 - dz), this.settings.curve);
  }
  btn(name) {
    const b = this.bind.buttons[name]; if (!b) return 0;
    const p = this.pads.find(q => q.id === b.dev); if (!p) return 0;
    return p.buttons[b.button]?.value || 0;
  }

  // Start waiting for the player to move an axis or press a button to bind it.
  startListen(kind, action, done) {
    const base = this.pads.map(p => ({ id: p.id, axes: [...p.axes], btn: p.buttons.map(b => b.pressed) }));
    this.listen = { kind, action, done, base, t: 0 };
  }
  cancelListen() { this.listen = null; }

  pollListen(dt) {
    const L = this.listen; L.t += dt;
    for (const p of this.pads) {
      const base = L.base.find(b => b.id === p.id); if (!base) continue;
      if (L.kind === 'axis') {
        for (let i = 0; i < p.axes.length; i++) {
          // A hat axis jumps from its idle value (>1) to a direction; a normal axis moves by half its travel.
          const moved = L.action === 'hat' ? base.axes[i] > 1.1 && p.axes[i] <= 1.01 : Math.abs(p.axes[i] - base.axes[i]) > 0.5 && Math.abs(p.axes[i]) <= 1.01;
          if (moved) {
            this.bind.axes[L.action] = { dev: p.id, axis: i, inv: L.action === 'throttle' ? p.axes[i] < base.axes[i] : false };
            return this.endListen(true);
          }
        }
      } else {
        for (let i = 0; i < p.buttons.length; i++) if (p.buttons[i].pressed && !base.btn[i]) {
          this.bind.buttons[L.action] = { dev: p.id, button: i };
          return this.endListen(true);
        }
      }
    }
    if (L.t > 8) this.endListen(false);
  }
  endListen(ok) { const L = this.listen; this.listen = null; this.lastThrAxis = null; if (ok) this.onChange?.(); L.done?.(ok); }

  describe(kind, action) {
    const b = this.bind[kind === 'axis' ? 'axes' : 'buttons'][action];
    if (!b) return null;
    const short = b.dev.replace(/\s*\(.*?\)\s*/g, ' ').trim().slice(0, 26);
    return { text: `${kind === 'axis' ? 'Axis ' + b.axis : 'Button ' + (b.button + 1)} · ${short}`, connected: this.pads.some(p => p.id === b.dev), inv: !!b.inv };
  }

  poll(dt, flying) {
    this.pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    for (const p of this.pads) if (!this.bind.seen.includes(p.id)) this.autoBind(p);
    if (this.listen) { this.pollListen(dt); return; }

    // --- keyboard: digital keys ramp so taps give small corrections
    const K = this.keys, key = (a, b) => (K.has(a) ? 1 : 0) - (K.has(b) ? 1 : 0);
    const ramp = (cur, target, up = 3.2, down = 5) => cur + clamp(target - cur, -(target === 0 ? down : up) * dt, (target === 0 ? down : up) * dt);
    const inv = this.settings.invertPitch ? -1 : 1;
    this.k.pitch = ramp(this.k.pitch, clamp(key('KeyS', 'KeyW') + key('ArrowDown', 'ArrowUp'), -1, 1) * inv);
    this.k.roll = ramp(this.k.roll, clamp(key('KeyD', 'KeyA') + key('ArrowRight', 'ArrowLeft'), -1, 1));
    this.k.yaw = ramp(this.k.yaw, key('KeyE', 'KeyQ'));

    // --- controllers
    const P = this.pad;
    const lookMod = this.btn('lookMod') > 0.5;
    P.roll = this.stickAxis('roll'); P.pitch = this.stickAxis('pitch');
    const shared = this.bind.axes.yaw && this.bind.axes.lookX && this.bind.axes.yaw.dev === this.bind.axes.lookX.dev && this.bind.axes.yaw.axis === this.bind.axes.lookX.axis;
    P.yaw = shared && lookMod && flying ? 0 : this.stickAxis('yaw');
    P.lookX = !flying || lookMod || !shared ? this.stickAxis('lookX') : 0;
    P.lookY = !flying || lookMod || !shared ? this.stickAxis('lookY') : 0;
    const ba = this.rawAxis('brakeAxis');
    P.brake = Math.max(this.btn('brake'), ba === null ? 0 : clamp((ba + 1) / 2, 0, 1) > 0.08 ? (ba + 1) / 2 : 0);
    P.hatX = 0; P.hatY = 0;
    const hv = this.rawAxis('hat');
    if (hv !== null && hv <= 1.01) { const d = HAT_DIRS[clamp(Math.round((hv + 1) / (2 / 7)), 0, 7)]; P.hatX = d[0]; P.hatY = d[1]; }
    if (Math.abs(P.roll) > 0.12 || Math.abs(P.pitch) > 0.12 || Math.abs(P.yaw) > 0.2) this.active = 'stick';
    if (flying && Math.hypot(this.mdx, this.mdy) > 4 && this.settings.mouseMode !== 'off') this.active = 'mouse';

    // --- buttons: edges become one-shot actions, holds stay in `held`
    for (const [name] of BUTTON_ACTIONS) {
      const v = this.btn(name) > 0.5;
      if (v && !this.prevBtn[name]) this.pressed.add(name);
      this.prevBtn[name] = v; this.held[name] = v;
    }
    // Menu navigation from d-pad buttons, the hat, or the stick, with key-repeat.
    let dir = '';
    if (this.held.menuUp || P.hatY < 0 || P.pitch < -0.6) dir = 'Up';
    else if (this.held.menuDown || P.hatY > 0 || P.pitch > 0.6) dir = 'Down';
    else if (this.held.menuLeft || P.hatX < 0 || P.roll < -0.6) dir = 'Left';
    else if (this.held.menuRight || P.hatX > 0 || P.roll > 0.6) dir = 'Right';
    if (dir !== this.menuDir) { this.menuDir = dir; this.menuRepeat = 0.4; if (dir) this.pressed.add('nav' + dir); }
    else if (dir) { this.menuRepeat -= dt; if (this.menuRepeat <= 0) { this.menuRepeat = 0.14; this.pressed.add('nav' + dir); } }

    // --- throttle: levers are absolute, keys / triggers / wheel nudge it
    if (flying) {
      const up = (K.has('KeyR') || K.has('ShiftLeft') || K.has('Equal') || K.has('PageUp') ? 1 : 0) + this.btn('throttleUp');
      const dn = (K.has('KeyF') || K.has('Minus') || K.has('PageDown') ? 1 : 0) + this.btn('throttleDown');
      this.throttle = clamp(this.throttle + (up - dn) * 0.55 * dt - this.wheel * 0.05, 0, 1);
      for (let d = 0; d <= 9; d++) if (this.consume('thr' + d)) this.throttle = d === 0 ? 1 : d / 10;
      const ta = this.rawAxis('throttle');
      if (ta !== null) {
        const v = clamp((ta + 1) / 2, 0, 1);
        if (this.lastThrAxis === null) {
          // Take the lever's position straight away, unless the device has not reported anything yet
          // (browsers hand out all-zero axes until the first movement).
          const tp = this.pads.find(q => q.id === this.bind.axes.throttle.dev);
          if (tp.axes.some(x => x !== 0)) this.throttle = v;
          this.lastThrAxis = v;
        }
        else if (Math.abs(v - this.lastThrAxis) > 0.004) { this.throttle = v; this.lastThrAxis = v; }
      }
    }
    this.wheel = 0;
  }

  endFrame() { this.pressed.clear(); this.mdx = 0; this.mdy = 0; }
}
