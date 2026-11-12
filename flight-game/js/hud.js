// Flight instruments, drawn on a 2D canvas over the 3D view.
import { Vector3 } from 'three';
import { STRIPS } from './world.js';

const KT = 1.94384, FT = 3.28084;
const v = new Vector3();
const CREAM = '#f4ead2', BRASS = '#e9b949', PANEL = 'rgba(13,22,38,0.72)', LINE = 'rgba(233,215,170,0.35)';

function box(g, x, y, w, h, r = 8) { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = PANEL; g.fill(); g.strokeStyle = LINE; g.lineWidth = 1; g.stroke(); }
function text(g, s, x, y, font, color = CREAM, align = 'left') { g.font = font; g.fillStyle = color; g.textAlign = align; g.fillText(s, x, y); }
const MONO = '"Cascadia Mono", Consolas, ui-monospace, monospace', SANS = '"Segoe UI", system-ui, sans-serif';

// Project a world point; returns null when it is behind the camera.
function project(cam, p, w, h) {
  v.copy(p).project(cam);
  if (v.z > 1) return null;
  return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h];
}

export function drawHUD(g, w, h, G) {
  g.clearRect(0, 0, w, h);
  if (G.mode !== 'fly' || G.uiOpen) return;
  const ac = G.active.ac, s = ac.spec, cam = G.camera;
  g.textBaseline = 'middle';

  // --- waypoints
  const marks = [];
  if (G.save.job) { const t = STRIPS.find(x => x.id === G.save.job.to); marks.push({ p: v.set(t.x, t.h + 30, t.z).clone(), name: t.name, color: BRASS }); }
  const dh = Math.hypot(ac.pos.x, ac.pos.z);
  if (dh > 3500 && !(G.save.job && G.save.job.to === 'home')) marks.push({ p: new Vector3(0, STRIPS[0].h + 30, 0), name: 'Tailwind Bay', color: '#8fd0ff' });
  for (const m of marks) {
    const d = m.p.distanceTo(ac.pos);
    let sp = project(cam, m.p, w, h);
    const label = `${m.name}  ${(d / 1000).toFixed(1)} km`;
    if (sp && sp[0] > 40 && sp[0] < w - 40 && sp[1] > 60 && sp[1] < h - 60) {
      g.strokeStyle = m.color; g.lineWidth = 2; g.beginPath(); g.moveTo(sp[0], sp[1] - 9); g.lineTo(sp[0] + 9, sp[1]); g.lineTo(sp[0], sp[1] + 9); g.lineTo(sp[0] - 9, sp[1]); g.closePath(); g.stroke();
      text(g, label, sp[0], sp[1] - 22, `600 13px ${SANS}`, m.color, 'center');
    } else {
      // Off screen: an arrow on the edge pointing the way to turn.
      v.copy(m.p).applyMatrix4(cam.matrixWorldInverse);
      const a = Math.atan2(v.x, v.y);
      const ex = w / 2 + Math.sin(a) * (w / 2 - 70), ey = h / 2 - Math.cos(a) * (h / 2 - 90);
      g.save(); g.translate(ex, ey); g.rotate(a); g.fillStyle = m.color; g.beginPath(); g.moveTo(0, -12); g.lineTo(9, 8); g.lineTo(-9, 8); g.closePath(); g.fill(); g.restore();
      text(g, label, Math.min(w - 120, Math.max(120, ex)), ey + (ey > h / 2 ? -22 : 24), `600 13px ${SANS}`, m.color, 'center');
    }
  }

  // --- aim / nose reticles
  const nose = project(cam, v.set(0, 0, -1).applyQuaternion(ac.quat).multiplyScalar(1500).add(ac.pos), w, h);
  if (nose) { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(nose[0] - 14, nose[1]); g.lineTo(nose[0] - 5, nose[1]); g.moveTo(nose[0] + 5, nose[1]); g.lineTo(nose[0] + 14, nose[1]); g.moveTo(nose[0], nose[1] - 5); g.lineTo(nose[0], nose[1] - 12); g.stroke(); }
  if (G.aimActive) { g.strokeStyle = BRASS; g.lineWidth = 2; g.beginPath(); g.arc(w / 2, h / 2, 11, 0, 7); g.stroke(); g.beginPath(); g.arc(w / 2, h / 2, 1.5, 0, 7); g.fillStyle = BRASS; g.fill(); }
  if (G.yokeActive) {
    const cx = w / 2, cy = h - 150; g.strokeStyle = LINE; g.strokeRect(cx - 40, cy - 40, 80, 80);
    g.fillStyle = BRASS; g.beginPath(); g.arc(cx + G.yoke.x * 40, cy + G.yoke.y * 40, 5, 0, 7); g.fill();
  }

  // --- heading tape
  const hdg = (ac.heading * 180) / Math.PI;
  const tw = Math.min(420, w * 0.5), tx = w / 2 - tw / 2;
  box(g, tx, 12, tw, 34);
  g.save(); g.beginPath(); g.rect(tx + 4, 12, tw - 8, 34); g.clip();
  for (let d = Math.floor((hdg - 45) / 5) * 5; d <= hdg + 45; d += 5) {
    const x = w / 2 + ((d - hdg) / 45) * (tw / 2);
    const dd = ((d % 360) + 360) % 360;
    g.strokeStyle = CREAM; g.lineWidth = 1; g.beginPath(); g.moveTo(x, 40); g.lineTo(x, dd % 10 === 0 ? 33 : 37); g.stroke();
    if (dd % 30 === 0) text(g, { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[dd] ?? String(dd / 10).padStart(2, '0'), x, 24, `700 13px ${MONO}`, dd % 90 === 0 ? BRASS : CREAM, 'center');
  }
  g.restore();
  g.fillStyle = BRASS; g.beginPath(); g.moveTo(w / 2, 46); g.lineTo(w / 2 - 6, 54); g.lineTo(w / 2 + 6, 54); g.fill();
  text(g, String(Math.round(((hdg % 360) + 360) % 360) % 360).padStart(3, '0') + '°', w / 2, 66, `700 14px ${MONO}`, CREAM, 'center');

  // --- speed and altitude
  const cy = h / 2;
  const kt = ac.ias * KT, alt = ac.pos.y * FT, agl = (ac.pos.y - s.gearH - Math.max(0, G.groundAt(ac.pos.x, ac.pos.z))) * FT;
  const lx = Math.max(16, w * 0.5 - 330), rx = Math.min(w - 136, w * 0.5 + 210);
  box(g, lx, cy - 34, 120, 68);
  text(g, 'SPEED kt', lx + 10, cy - 20, `600 10px ${SANS}`, '#a9b4c6');
  text(g, String(Math.round(kt)), lx + 110, cy + 6, `700 30px ${MONO}`, ac.stalled ? '#ff8a7a' : CREAM, 'right');
  text(g, `stall ${Math.round(s.vstall * KT)}`, lx + 10, cy + 24, `500 10px ${MONO}`, '#a9b4c6');
  box(g, rx, cy - 34, 120, 68);
  text(g, 'ALT ft', rx + 10, cy - 20, `600 10px ${SANS}`, '#a9b4c6');
  text(g, String(Math.round(alt / 10) * 10), rx + 110, cy + 6, `700 30px ${MONO}`, CREAM, 'right');
  const vs = ac.vel.y * FT * 60;
  text(g, `${vs >= 0 ? '+' : '−'}${Math.round(Math.abs(vs) / 10) * 10} fpm`, rx + 10, cy + 24, `500 10px ${MONO}`, '#a9b4c6');
  if (agl < 2500) text(g, `${Math.max(0, Math.round(agl))} ft above ground`, rx + 60, cy + 48, `600 11px ${SANS}`, agl < 200 && !ac.onGround ? BRASS : '#a9b4c6', 'center');

  // --- attitude ball
  const ax = w / 2, ay = h - 84, ar = 52;
  g.save(); g.beginPath(); g.arc(ax, ay, ar, 0, 7); g.clip();
  g.translate(ax, ay); g.rotate(-ac.bank);
  const po = ac.pitch * (180 / Math.PI) * 2.4;
  g.fillStyle = '#3f86c9'; g.fillRect(-ar * 2, -ar * 3 + po, ar * 4, ar * 3);
  g.fillStyle = '#7a5a37'; g.fillRect(-ar * 2, po, ar * 4, ar * 3);
  g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-ar * 2, po); g.lineTo(ar * 2, po); g.stroke();
  g.lineWidth = 1;
  for (const d of [-20, -10, 10, 20]) { g.beginPath(); g.moveTo(-14, po - d * 2.4); g.lineTo(14, po - d * 2.4); g.stroke(); }
  g.restore();
  g.strokeStyle = LINE; g.lineWidth = 2; g.beginPath(); g.arc(ax, ay, ar, 0, 7); g.stroke();
  g.strokeStyle = BRASS; g.lineWidth = 3; g.beginPath(); g.moveTo(ax - 30, ay); g.lineTo(ax - 10, ay); g.lineTo(ax, ay + 7); g.lineTo(ax + 10, ay); g.lineTo(ax + 30, ay); g.stroke();

  // --- throttle, systems
  const bx = 22, by = h - 190;
  box(g, bx, by, 150, 168);
  text(g, 'THROTTLE', bx + 12, by + 16, `600 10px ${SANS}`, '#a9b4c6');
  g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(bx + 12, by + 30, 16, 124);
  g.fillStyle = BRASS; g.fillRect(bx + 12, by + 30 + 124 * (1 - G.input.throttle), 16, 124 * G.input.throttle);
  g.fillStyle = '#fff'; g.fillRect(bx + 9, by + 29 + 124 * (1 - ac.thr), 22, 2);
  text(g, Math.round(G.input.throttle * 100) + '%', bx + 40, by + 40, `700 18px ${MONO}`);
  const row = (label, val, color, i) => { text(g, label, bx + 40, by + 70 + i * 20, `600 10px ${SANS}`, '#a9b4c6'); text(g, val, bx + 140, by + 70 + i * 20, `700 12px ${MONO}`, color, 'right'); };
  row('GEAR', s.floats ? 'FLOATS' : !s.retract ? 'FIXED' : ac.gear > 0.98 ? 'DOWN' : ac.gear < 0.02 ? 'UP' : '···', ac.gear > 0.98 || s.floats ? '#7fd6a1' : BRASS, 0);
  row('FLAPS', ['UP', 'HALF', 'FULL'][ac.flapsSet], ac.flapsSet ? BRASS : CREAM, 1);
  row('BRAKE', G.brake > 0.1 ? 'ON' : 'OFF', G.brake > 0.1 ? BRASS : CREAM, 2);
  row('G', ac.gload.toFixed(1), Math.abs(ac.gload) > s.gLimit * 0.85 ? '#ff8a7a' : CREAM, 3);
  row('TRIM', (ac.trim * 57.3 >= 0 ? '+' : '') + (ac.trim * 57.3).toFixed(1), CREAM, 4);

  // --- warnings
  let warn = '';
  if (ac.stalled) warn = 'STALL — ease the nose down';
  else if (s.retract && !ac.gearDown && agl < 400 && kt < s.vstall * KT * 1.6 && !ac.onGround) warn = 'GEAR UP — press G';
  else if (!ac.onGround && agl < 150 && ac.vel.y * FT * 60 < -1400) warn = 'SINK RATE';
  if (warn && Math.floor(G.time * 3) % 2 === 0) { g.font = `800 20px ${SANS}`; const tw2 = g.measureText(warn).width + 36; box(g, w / 2 - tw2 / 2, h * 0.3 - 20, tw2, 40, 20); text(g, warn, w / 2, h * 0.3 + 1, `800 20px ${SANS}`, '#ff8a7a', 'center'); }

  // --- radar map
  const mr = 74, mx = w - mr - 22, my = h - mr - 22, range = 14000;
  g.save(); g.beginPath(); g.arc(mx, my, mr, 0, 7); g.fillStyle = PANEL; g.fill(); g.strokeStyle = LINE; g.lineWidth = 1.5; g.stroke(); g.clip();
  g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.arc(mx, my, mr / 2, 0, 7); g.stroke();
  const hd = ac.heading;
  const plot = (x, z) => { const dx = x - ac.pos.x, dz = z - ac.pos.z; const d = Math.hypot(dx, dz), a = Math.atan2(dx, -dz) - hd; const r = Math.min(d / range, 1) * (mr - 8); return [mx + Math.sin(a) * r, my - Math.cos(a) * r, d > range]; };
  for (const st of STRIPS) {
    const [px, py, far] = plot(st.x, st.z);
    const isJob = G.save.job && G.save.job.to === st.id;
    g.save(); g.translate(px, py); g.rotate(-st.rot - hd);
    g.fillStyle = isJob ? BRASS : st.id === 'home' ? '#8fd0ff' : G.save.visited.includes(st.id) ? CREAM : 'rgba(244,234,210,0.45)';
    if (far) { g.beginPath(); g.arc(0, 0, 3, 0, 7); g.fill(); } else g.fillRect(-2, -7, 4, 14);
    g.restore();
  }
  for (const r of G.rings) if (!r.got) { const [px, py, far] = plot(r.pos.x, r.pos.z); if (!far) { g.strokeStyle = BRASS; g.lineWidth = 1.5; g.beginPath(); g.arc(px, py, 2.5, 0, 7); g.stroke(); } }
  g.restore();
  g.fillStyle = '#fff'; g.beginPath(); g.moveTo(mx, my - 8); g.lineTo(mx + 5, my + 6); g.lineTo(mx, my + 3); g.lineTo(mx - 5, my + 6); g.closePath(); g.fill();
  const na = -hd; text(g, 'N', mx + Math.sin(na) * (mr + 10), my - Math.cos(na) * (mr + 10), `700 11px ${SANS}`, BRASS, 'center');
  text(g, s.name, mx, my - mr - 26, `italic 700 14px Georgia, serif`, CREAM, 'center');
}
