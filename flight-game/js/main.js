// Tailwind Bay — game loop, walking, flying, cameras, jobs and saving.
import * as THREE from 'three';
import { EffectComposer } from '../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from '../vendor/jsm/postprocessing/OutputPass.js';
import { heightAt, STRIPS, HOME_H, stripPoint } from './world.js';
import { Aircraft } from './flight.js';
import { LIBRARY, PART, DEFAULT_LOADOUT, customSpec, buildPlane, animatePlane } from './planes.js';
import { Environment } from './terrain.js';
import { buildWorld, makePerson, animatePerson, updateNPCs } from './town.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { drawHUD } from './hud.js';
import { Audio } from './audio.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const SAVE_KEY = 'tailwind-bay-save-v1';

// ------------------------------------------------------------------ save
function freshSave(keep = {}) {
  return {
    coins: 600, loadout: structuredClone(DEFAULT_LOADOUT), owned: Object.values(DEFAULT_LOADOUT).filter(v => typeof v === 'string'),
    lib: 'sparrow', planeName: 'The Tinker', met: {}, cyc: {}, visited: ['home'], job: null, jobCount: 0,
    settings: keep.settings ?? { mouseMode: 'aim', mouseSens: 1, invertPitch: false, assist: true, deadzone: 0.08, curve: 1.5, volume: 0.6, quality: 2 },
    bindings: keep.bindings ?? {},
  };
}
let save;
try { save = { ...freshSave(), ...JSON.parse(localStorage.getItem(SAVE_KEY) || '{}') }; } catch { save = freshSave(); }
if (!PART[save.loadout?.engine]) save.loadout = structuredClone(DEFAULT_LOADOUT);
save.loadout.extras ??= [];
if (!LIBRARY.some(p => p.id === save.lib)) save.lib = 'sparrow';
const settings = save.settings;
const Q = settings.quality;

// ------------------------------------------------------------------ renderer
const canvas = $('gl'), hudCanvas = $('hud'), hud = hudCanvas.getContext('2d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: Q < 2, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = Q > 0; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.4, 60000);
let composer = null, bloom = null;
if (Q === 2) {
  const rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.2, 0.55, 0.95);
  composer.addPass(bloom); composer.addPass(new OutputPass());
}
let W = 1, H = 1, DPR = 1;
function resize() {
  W = innerWidth; H = innerHeight; DPR = Math.min(devicePixelRatio || 1, Q === 0 ? 1 : Q === 1 ? 1.5 : 2);
  renderer.setPixelRatio(DPR); renderer.setSize(W, H, false);
  composer?.setPixelRatio(DPR); composer?.setSize(W, H);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  hudCanvas.width = W * DPR; hudCanvas.height = H * DPR; hud.setTransform(DPR, 0, 0, DPR, 0, 0);
}
addEventListener('resize', resize);

// ------------------------------------------------------------------ game state
const G = {
  mode: 'title', save, camera, time: 0, rings: [], brake: 0, aimActive: false, yokeActive: false, yoke: { x: 0, y: 0 },
  groundAt: heightAt, showroom: null,
  get uiOpen() { return ui.open; },
  persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage may be unavailable */ } },
};
const audio = G.audio = new Audio(settings.volume);
const input = G.input = new Input(canvas, settings, save.bindings, () => G.persist());
const ui = G.ui = new UI(G);
window.__G = G;   // handy for debugging from the console

const env = new Environment(scene, renderer, Q);
const world = buildWorld(scene);
const npcById = Object.fromEntries(world.npcs.map(n => [n.id, n]));

// ------------------------------------------------------------------ planes
const SPOT = { custom: { x: 80, z: -40, h: Math.PI * 1.5 }, lib: { x: 80, z: 30, h: Math.PI * 1.5 } };
function disposeGroup(g) { scene.remove(g); g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose?.(); } }); }
function sync(e) { e.built.group.position.copy(e.ac.pos); e.built.group.quaternion.copy(e.ac.quat); }
function attach(e, spec) {
  if (e.built) disposeGroup(e.built.group);
  e.built = buildPlane(spec); spec.gearH = e.built.gearH; spec.bellyH = e.built.bellyH;
  e.spec = spec; scene.add(e.built.group);
}
function makeEntity(spec, spot) {
  const e = { spot }; attach(e, spec);
  e.ac = new Aircraft(spec); park(e);
  return e;
}
function park(e) {
  const big = e.spec.vis.len > 25;
  e.ac.place(e.spot.x + (big ? 20 : 0), HOME_H, e.spot.z + (big ? 25 : 0), e.spot.h);
  animatePlane(e.built, 0, 1, 0, false); sync(e);
}
// Swap the model under an aircraft (new parts, or a different library plane) without moving it.
function refit(e, spec) {
  const ground = e.ac.pos.y - e.spec.gearH;
  attach(e, spec); e.ac.spec = spec; e.ac.pos.y = ground + spec.gearH; e.ac.gear = 1; e.ac.gearDown = true;
  animatePlane(e.built, 0, 1, 0, false); sync(e);
}
G.custom = makeEntity(customSpec(save.loadout, save.planeName), SPOT.custom);
G.lib = makeEntity(LIBRARY.find(p => p.id === save.lib), SPOT.lib);
G.active = G.custom;

// ------------------------------------------------------------------ rings & smoke
const ringGeo = new THREE.TorusGeometry(36, 2.2, 10, 44), ringMat = new THREE.MeshBasicMaterial({ color: 0xffc933 });
for (let i = 0; i < 12; i++) {
  const a = (i / 12) * Math.PI * 2, r = 2700 + 900 * Math.sin(a * 3);
  const x = Math.sin(a) * r, z = -Math.cos(a) * r - 300;
  const y = Math.max(heightAt(x, z), 0) + 130 + 70 * Math.sin(a * 2 + 1);
  const m = new THREE.Mesh(ringGeo, ringMat); m.position.set(x, y, z); m.rotation.y = -a; scene.add(m);
  G.rings.push({ pos: m.position, mesh: m, got: false });
}
function resetRings() { for (const r of G.rings) { r.got = false; r.mesh.visible = true; } }

const SMOKE_N = 500;
const smokeGeo = new THREE.BufferGeometry();
smokeGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SMOKE_N * 3).fill(-9999), 3));
const smokeTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const smoke = new THREE.Points(smokeGeo, new THREE.PointsMaterial({ size: 9, map: smokeTex, transparent: true, opacity: 0.55, depthWrite: false, color: 0xffffff }));
smoke.frustumCulled = false; scene.add(smoke);
let smokeOn = false, smokeI = 0, smokeT = 0;

// ------------------------------------------------------------------ player
const player = { x: 172, z: 2, y: HOME_H, vy: 0, yaw: Math.PI / 2, face: Math.PI / 2, camPitch: -0.18, speed: 0, person: makePerson({ shirt: 0x7b4a2a, pants: 0x3b3f4a, hair: 0x2d1f14, scarf: 0xf4ead2, hat: 0x5b3a22 }) };
scene.add(player.person.group);

const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpQ2 = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, 'YXZ');
const X_AXIS = new THREE.Vector3(1, 0, 0), Y_AXIS = new THREE.Vector3(0, 1, 0);
const camQ = new THREE.Quaternion(), look = { yaw: 0, pitch: 0 }, aim = { yaw: 0, pitch: 0 };
let camMode = 0, airTime = 0, crashT = 0, stopT = 0, showAngle = 0, titleAngle = 0;
const CAM_NAMES = ['Chase camera', 'Cockpit camera', 'Wide camera'];

// ------------------------------------------------------------------ game actions (used by UI and townsfolk)
Object.assign(G, {
  onUIChange() {
    input.setLockWanted(G.mode !== 'title' && !ui.open);
    if (!ui.open) G.showroom = null;
    $('top').hidden = G.mode === 'title' || ui.open;
  },
  say(id, text, options) { ui.dialog(npcById[id], { text, options }); },
  cycle(id, n) { const v = save.cyc[id] ?? 0; save.cyc[id] = v + 1; G.persist(); return v % n; },
  openShop(slot, npcId) { G.showroom = G.custom; ui.shop(slot, npcById[npcId]); },
  openHangar() { if (G.lib.ac.pos.distanceTo(tmpV.set(SPOT.lib.x, HOME_H, SPOT.lib.z)) > 150) park(G.lib); G.showroom = G.lib; ui.hangar(); },
  recallCustom() { park(G.custom); ui.toast(`${save.planeName} is back on the apron.`, 'good'); },
  setLibPlane(id) { save.lib = id; refit(G.lib, LIBRARY.find(p => p.id === id)); park(G.lib); G.showroom = G.lib; G.persist(); },
  buyPart(id) {
    const p = PART[id];
    if (save.coins < p.price) return false;
    save.coins -= p.price; save.owned.push(id); audio.chime([660, 990, 1320]);
    G.fitPart(id); ui.toast(`${p.name} fitted to ${save.planeName}.`, 'good');
    return true;
  },
  fitPart(id) {
    const p = PART[id];
    if (p.slot === 'extra') { if (!save.loadout.extras.includes(id)) save.loadout.extras.push(id); } else save.loadout[p.slot] = id;
    refit(G.custom, customSpec(save.loadout, save.planeName));
    ui.coins(save.coins); G.persist();
  },
  earn(n, msg) { save.coins += n; ui.coins(save.coins); ui.toast(`${msg}  +${n} coins`, 'good'); audio.chime(); G.persist(); },

  // Parcel jobs, offered by the postmaster and by every strip keeper.
  jobNode(strip, npcId) {
    if (save.job) {
      const t = STRIPS.find(s => s.id === save.job.to);
      if (t === strip) return { text: `That parcel is for right here. Taxi the aeroplane in and stop on the field and I will sign for it.` };
      return { text: `You still have a parcel for ${t.name}. It pays ${save.job.pay} coins when you land and stop there.`,
        options: [{ label: 'Give the parcel back', fn: () => { save.job = null; G.persist(); G.say(npcId, 'No harm done. Come back when you want another.'); } }] };
    }
    const others = STRIPS.filter(s => s !== strip);
    const pick = [others[(save.jobCount * 3 + 1) % others.length], others[(save.jobCount * 5 + 4) % others.length]];
    if (pick[0] === pick[1]) pick[1] = others[(others.indexOf(pick[0]) + 1) % others.length];
    const offer = (t) => { const km = Math.hypot(t.x - strip.x, t.z - strip.z) / 1000; return { t, km, pay: Math.round((140 + km * 44) / 10) * 10 }; };
    const [a, b] = pick.map(offer);
    const take = (o) => () => { save.job = { to: o.t.id, pay: o.pay }; save.jobCount++; G.persist(); G.say(npcId, `Parcel for ${o.t.name}, ${o.km.toFixed(1)} km out. Follow the gold marker, land, and come to a stop. Mind the runway length: ${o.t.len} metres.`); };
    return { text: `Parcels going out today: ${a.t.name}, ${a.km.toFixed(1)} km, pays ${a.pay} coins. Or ${b.t.name}, ${b.km.toFixed(1)} km, pays ${b.pay}.`,
      options: [{ label: `Take the ${a.t.name} parcel`, fn: take(a) }, { label: `Take the ${b.t.name} parcel`, fn: take(b) }] };
  },

  board(e) {
    G.mode = 'fly'; G.active = e; player.person.group.visible = false;
    input.throttle = 0; input.lastThrAxis = null; input.active = input.active === 'stick' ? 'stick' : 'keys';
    camQ.copy(e.ac.quat); look.yaw = look.pitch = 0; airTime = 0; smokeOn = false;
    audio.start(); G.onUIChange();
    ui.toast(`${e.spec.name}. Throttle up with R or your lever. Backspace jumps to the runway.`);
  },
  leave() {
    const ac = G.active.ac, v = G.active.spec.vis;
    tmpV.set(-(v.rad * (v.wf ?? 1) + 2.4), 0, -v.len * 0.2).applyQuaternion(ac.quat).add(ac.pos);
    player.x = tmpV.x; player.z = tmpV.z; player.y = Math.max(heightAt(tmpV.x, tmpV.z), 0); player.yaw = player.face = ac.heading; player.camPitch = -0.15;
    player.person.group.visible = true; G.mode = 'walk'; ac.thr = 0; G.onUIChange();
  },
  toRunway() {
    const e = G.active, s = STRIPS[0], p = stripPoint(s, 0, s.len / 2 - 70);
    e.ac.place(p.x, s.h, p.z, 0); camQ.copy(e.ac.quat); input.throttle = 0; airTime = 0; sync(e);
  },
  goHome() {
    park(G.custom); park(G.lib); Object.assign(player, { x: 172, z: 2, y: HOME_H, yaw: Math.PI / 2, face: Math.PI / 2 });
    player.person.group.visible = true; G.mode = 'walk'; resetRings(); G.onUIChange();
  },
  wipe() { const s = freshSave({ settings: save.settings, bindings: save.bindings }); localStorage.setItem(SAVE_KEY, JSON.stringify(s)); location.reload(); },
});

// ------------------------------------------------------------------ walking
function updateWalk(dt) {
  const K = input.keys, P = input.pad, sens = settings.mouseSens;
  if (input.locked || input.buttons) { player.yaw += input.mdx * 0.0026 * sens; player.camPitch = clamp(player.camPitch - input.mdy * 0.0022 * sens, -1.2, 0.7); }
  const yawShared = input.bind.axes.yaw && input.bind.axes.lookX && input.bind.axes.yaw.axis === input.bind.axes.lookX.axis && input.bind.axes.yaw.dev === input.bind.axes.lookX.dev;
  player.yaw += (P.lookX + (yawShared ? 0 : P.yaw) + P.hatX) * 2.4 * dt;
  player.camPitch = clamp(player.camPitch - (P.lookY + P.hatY * 0.6) * 1.6 * dt, -1.2, 0.7);
  let f = (K.has('KeyW') || K.has('ArrowUp') ? 1 : 0) - (K.has('KeyS') || K.has('ArrowDown') ? 1 : 0) - P.pitch;
  let r = (K.has('KeyD') || K.has('ArrowRight') ? 1 : 0) - (K.has('KeyA') || K.has('ArrowLeft') ? 1 : 0) + P.roll;
  const mag = Math.hypot(f, r);
  if (mag > 1) { f /= mag; r /= mag; }
  const run = K.has('ShiftLeft') || K.has('ShiftRight') || mag > 1.2 ? 8.5 : 4.4;
  const sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  const vx = (sy * f + cy * r) * run, vz = (-cy * f + sy * r) * run;
  let nx = player.x + vx * dt, nz = player.z + vz * dt;
  for (const c of world.colliders) {
    if (nx > c.minx - 0.4 && nx < c.maxx + 0.4 && nz > c.minz - 0.4 && nz < c.maxz + 0.4) {
      const pen = [nx - (c.minx - 0.4), c.maxx + 0.4 - nx, nz - (c.minz - 0.4), c.maxz + 0.4 - nz];
      const m = Math.min(...pen);
      if (m === pen[0]) nx = c.minx - 0.4; else if (m === pen[1]) nx = c.maxx + 0.4; else if (m === pen[2]) nz = c.minz - 0.4; else nz = c.maxz + 0.4;
    }
  }
  for (const n of world.npcs) { const dx = nx - n.x, dz = nz - n.z, d = Math.hypot(dx, dz); if (d < 0.75 && d > 0.001) { nx = n.x + (dx / d) * 0.75; nz = n.z + (dz / d) * 0.75; } }
  if (heightAt(nx, nz) > -0.7) { player.x = nx; player.z = nz; }
  const ground = Math.max(heightAt(player.x, player.z), -0.7);
  if (input.consume('space') && player.y <= ground + 0.02) player.vy = 4.6;
  player.vy -= 14 * dt; player.y += player.vy * dt;
  if (player.y <= ground) { player.y = ground; player.vy = 0; }
  player.speed = Math.hypot(vx, vz);
  if (player.speed > 0.2) player.face += wrap(Math.atan2(vx, -vz) - player.face) * Math.min(1, dt * 12);
  const pg = player.person.group;
  pg.position.set(player.x, player.y, player.z); pg.rotation.y = -player.face;
  animatePerson(player.person, player.speed, dt);

  // Third-person camera.
  const cp = Math.cos(player.camPitch), dist = 5.2;
  tmpV.set(sy * cp, Math.sin(player.camPitch), -cy * cp);
  camera.position.set(player.x - tmpV.x * dist, player.y + 1.75 - tmpV.y * dist, player.z - tmpV.z * dist);
  camera.position.y = Math.max(camera.position.y, Math.max(heightAt(camera.position.x, camera.position.z), 0) + 0.35);
  camera.lookAt(player.x + tmpV.x * 3, player.y + 1.6 + tmpV.y * 3, player.z + tmpV.z * 3);
  camera.fov += (58 - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
  env.focusShadow(pg.position, 60);

  // What can be interacted with?
  let target = null, best = 3.4;
  for (const n of world.npcs) { const d = Math.hypot(n.x - player.x, n.z - player.z); if (d < best) { best = d; target = { npc: n }; } }
  if (!target) for (const e of [G.custom, G.lib]) {
    const d = Math.hypot(e.ac.pos.x - player.x, e.ac.pos.z - player.z);
    if (d < Math.max(5.5, e.spec.vis.len * 0.5)) target = { plane: e };
  }
  if (target) ui.prompt(target.npc ? `<kbd>E</kbd> Talk to ${target.npc.name}` : `<kbd>E</kbd> Board ${target.plane.spec.custom ? save.planeName : 'the ' + target.plane.spec.name}`);
  else ui.prompt('');
  if (input.consume('keyE') || input.consume('enter') || input.consume('interact')) {
    if (target?.npc) {
      const n = target.npc, node = n.talk(G);
      if (node) ui.dialog(n, node);
      if (!save.met[n.id]) { save.met[n.id] = 1; G.persist(); }
    } else if (target?.plane) G.board(target.plane);
  }
  ui.objective(save.job ? `Parcel for <b>${STRIPS.find(s => s.id === save.job.to).name}</b>. Board a plane and follow the gold marker.` :
    !save.met.ines ? 'Walk to the hangar and talk to <b>Captain Ines</b>, or board your plane on the apron.' : '');
  audio.update(false, 0, 0, false);
}

// ------------------------------------------------------------------ flying
const ctl = { pitch: 0, roll: 0, yaw: 0, throttle: 0, brake: 0, assist: false };
function mouseAim(ac, dt) {
  // Mouse aim: steer a target direction; a simple "instructor" rolls and pulls the plane onto it.
  const sens = settings.mouseSens;
  if (!(input.buttons & 4)) {
    if (input.locked) { aim.yaw += input.mdx * 0.0016 * sens; aim.pitch -= input.mdy * 0.0016 * sens; }
    else { const dz = (v) => (Math.abs(v) < 0.12 ? 0 : v - Math.sign(v) * 0.12); aim.yaw += dz(input.mx) * 1.6 * sens * dt; aim.pitch -= dz(input.my) * 1.2 * sens * dt; }
  }
  aim.pitch = clamp(aim.pitch, -1.45, 1.45);
  const cp = Math.cos(aim.pitch);
  tmpV.set(Math.sin(aim.yaw) * cp, Math.sin(aim.pitch), -Math.cos(aim.yaw) * cp);
  tmpV2.copy(tmpV).applyQuaternion(tmpQ.copy(ac.quat).invert());
  const ex = Math.atan2(tmpV2.x, -tmpV2.z), ey = Math.atan2(tmpV2.y, Math.hypot(tmpV2.x, tmpV2.z));
  const off = Math.acos(clamp(-tmpV2.z, -1, 1));
  let pitch = clamp(ey * 3.2, -1, 1), yaw = clamp(ex * 2.2, -1, 1), roll = 0;
  if (!ac.onGround) {
    const bank = ac.bank, level = clamp(-bank * 1.6, -1, 1);
    const below = tmpV2.y < 0 && Math.abs(tmpV2.x) < Math.abs(tmpV2.y) * 0.6 && off < 0.9;
    const hard = below ? level : clamp(Math.atan2(tmpV2.x, Math.max(tmpV2.y, 0.0) + 0.02) * 1.4, -1, 1);
    // Small corrections: bank gently toward the target. Big ones: roll the lift vector onto it.
    const gentle = clamp(level + ex * 3.5, -1, 1);
    const b = clamp((off - 0.12) / 0.3, 0, 1);
    roll = gentle + (hard - gentle) * b;
    yaw *= 0.5;
  }
  return { pitch, roll, yaw };
}

G.debug = { mouseAim, aim, ctl };

function updateFly(dt) {
  const e = G.active, ac = e.ac, s = e.spec, K = input.keys, P = input.pad;
  if (ac.crashed) {
    crashT -= dt;
    if (crashT < 0.7) $('fade').classList.add('on');
    if (crashT <= 0) { G.toRunway(); $('fade').classList.remove('on'); ui.toast('Towed back to the runway. No charge this time.'); }
    return flyCamera(dt, e);
  }
  // --- gather controls
  let mp = 0, mr = 0, my = 0;
  const mode = settings.mouseMode, looking = !!(input.buttons & 4);
  G.aimActive = mode === 'aim' && input.active === 'mouse';
  G.yokeActive = mode === 'yoke' && input.active === 'mouse';
  if (G.aimActive) { const m = mouseAim(ac, dt); mp = m.pitch; mr = m.roll; my = m.yaw; }
  else {
    tmpV.set(0, 0, -1).applyQuaternion(ac.quat);
    aim.yaw = Math.atan2(tmpV.x, -tmpV.z); aim.pitch = Math.asin(clamp(tmpV.y, -1, 1));
  }
  if (G.yokeActive) {
    if (!looking) {
      if (input.locked) { G.yoke.x = clamp(G.yoke.x + input.mdx * 0.004 * settings.mouseSens, -1, 1); G.yoke.y = clamp(G.yoke.y + input.mdy * 0.004 * settings.mouseSens, -1, 1); }
      else { G.yoke.x = clamp(input.mx * 1.6, -1, 1); G.yoke.y = clamp(input.my * 1.6, -1, 1); }
    }
    if (input.buttons & 2) G.yoke.x = G.yoke.y = 0;
    mr = G.yoke.x; mp = G.yoke.y * (settings.invertPitch ? -1 : 1);
  } else G.yoke.x = G.yoke.y = 0;
  ctl.pitch = clamp(input.k.pitch + P.pitch + mp, -1, 1);
  ctl.roll = clamp(input.k.roll + P.roll + mr, -1, 1);
  ctl.yaw = clamp(input.k.yaw + P.yaw + my, -1, 1);
  ctl.throttle = input.throttle;
  G.brake = ctl.brake = Math.max(K.has('KeyB') || K.has('Space') ? 1 : 0, P.brake);
  ctl.assist = settings.assist && input.active !== 'stick' && !G.aimActive;

  // --- one-shot actions
  if (input.consume('gear')) {
    if (!s.retract) ui.toast(s.floats ? 'Floats do not retract.' : 'This gear is fixed.');
    else if (ac.onGround) ui.toast('Gear stays down on the ground.');
    else { ac.gearDown = !ac.gearDown; ui.toast(ac.gearDown ? 'Gear coming down.' : 'Gear coming up.'); }
  }
  if (input.consume('flaps')) { ac.flapsSet = (ac.flapsSet + 1) % 3; ui.toast(['Flaps up.', 'Flaps half.', 'Flaps full.'][ac.flapsSet]); }
  if (input.consume('camera')) { camMode = (camMode + 1) % 3; ui.toast(CAM_NAMES[camMode]); }
  if (input.consume('mouseMode')) { settings.mouseMode = { aim: 'yoke', yoke: 'off', off: 'aim' }[mode]; G.persist(); ui.toast({ aim: 'Mouse aim: point where you want to fly.', yoke: 'Mouse yoke: the mouse is the stick.', off: 'Mouse flying off.' }[settings.mouseMode]); }
  if (input.consume('smoke')) { if (s.smoke) { smokeOn = !smokeOn; ui.toast(smokeOn ? 'Smoke on.' : 'Smoke off.'); } else ui.toast('No smoke system fitted. Juniper sells one at Odds & Props.'); }
  if (input.consume('reset')) { G.toRunway(); ui.toast('Lined up on runway 36.'); }
  const trim = (K.has('Period') || input.down('trimUp') ? 1 : 0) - (K.has('Comma') || input.down('trimDown') ? 1 : 0);
  ac.trim = clamp(ac.trim + trim * 0.04 * dt, -0.14, 0.14);
  const speed = ac.vel.length();
  if (input.consume('enter') || input.consume('interact')) {
    if (ac.onGround && speed < 2) return G.leave();
    ui.toast(ac.onGround ? 'Stop the aeroplane first (B or Space to brake).' : 'Land and stop before you get out.');
  }

  // --- simulate
  const n = Math.max(1, Math.ceil(dt / (1 / 120)));
  for (let i = 0; i < n; i++) ac.step(dt / n, ctl, heightAt);
  sync(e);
  animatePlane(e.built, ac.thr, ac.gear, dt, true);
  if (ac.crashed) { crashT = 2.4; audio.thud(); ui.toast(ac.crashed + '.', 'bad'); smokeOn = false; return flyCamera(dt, e); }

  // --- events
  if (!ac.onGround) airTime += dt;
  if (ac.touchdown) {
    if (airTime > 6) ui.toast(ac.onWater ? 'Splashdown.' : ac.touchdown < 1 ? 'Greaser! Barely felt it.' : ac.touchdown < 2.6 ? 'Nice landing.' : 'Firm arrival. The gear held.', 'good');
    ac.touchdown = 0; airTime = 0;
  }
  if (ac.onGround && speed < 1.5) {
    stopT += dt;
    if (stopT > 0.6) {
      for (const st of STRIPS) {
        const dx = ac.pos.x - st.x, dz = ac.pos.z - st.z, c = Math.cos(st.rot), sn = Math.sin(st.rot);
        const lx = dx * c - dz * sn, lz = dx * sn + dz * c;
        if (Math.abs(lx) > 220 || Math.abs(lz) > st.len / 2 + 160) continue;
        if (!save.visited.includes(st.id)) { save.visited.push(st.id); G.earn(300, `Discovered ${st.name}.`); }
        if (save.job && save.job.to === st.id) { const pay = save.job.pay; save.job = null; G.earn(pay, `Parcel delivered to ${st.name}.`); }
        if (st.id === 'home' && G.rings.some(r => r.got)) resetRings();
      }
    }
  } else stopT = 0;
  for (const r of G.rings) {
    if (!r.got && r.pos.distanceTo(ac.pos) < 38) {
      r.got = true; r.mesh.visible = false;
      const left = G.rings.filter(x => !x.got).length;
      if (left) G.earn(40, `Ring! ${left} to go.`); else { G.earn(440, 'All twelve rings in one flight!'); resetRings(); }
    }
  }
  if (smokeOn) {
    smokeT += dt;
    while (smokeT > 0.02) {
      smokeT -= 0.02;
      tmpV.set((Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6, s.vis.len * 0.6).applyQuaternion(ac.quat).add(ac.pos);
      smokeGeo.attributes.position.setXYZ(smokeI, tmpV.x, tmpV.y, tmpV.z); smokeI = (smokeI + 1) % SMOKE_N;
    }
    smokeGeo.attributes.position.needsUpdate = true;
  }

  flyCamera(dt, e);
  const t = save.job && STRIPS.find(x => x.id === save.job.to);
  ui.objective(t ? `Parcel for <b>${t.name}</b> · ${(Math.hypot(t.x - ac.pos.x, t.z - ac.pos.z) / 1000).toFixed(1)} km · land and stop to deliver` : '');
  ui.prompt(ac.onGround && speed < 2 && ac.thr < 0.1 ? '<kbd>Enter</kbd> Leave the plane' : '');
  audio.update(true, ac.thr, speed, s.jet);
}

function flyCamera(dt, e) {
  const ac = e.ac, v = e.spec.vis, P = input.pad;
  // Free look: right mouse button, a look stick, or the hat switch.
  const padYaw = P.lookX * 2.6 + P.hatX * 1.57, padPitch = -P.lookY * 1.0 - P.hatY * 0.7;
  if (input.buttons & 4) { look.yaw += input.mdx * 0.004; look.pitch = clamp(look.pitch - input.mdy * 0.004, -1.2, 1.2); }
  else { const k = Math.min(1, dt * 6); look.yaw += (padYaw - look.yaw) * k; look.pitch += (padPitch - look.pitch) * k; }
  const span = e.spec.span;
  const dist = (v.len * 1.25 + span * 0.35 + 5) * (camMode === 2 ? 2.3 : 1), height = v.len * 0.22 + 1.6;
  if (G.aimActive) {
    const cp = Math.cos(aim.pitch + look.pitch), yw = aim.yaw + look.yaw;
    tmpV.set(Math.sin(yw) * cp, Math.sin(aim.pitch + look.pitch), -Math.cos(yw) * cp);
    if (camMode === 1) camera.position.set(0, v.rad * (v.hf ?? 1) * 1.3 + 0.2, -v.len * 0.1).applyQuaternion(ac.quat).add(ac.pos);
    else camera.position.copy(ac.pos).addScaledVector(tmpV, -dist).add(tmpV2.set(0, height, 0));
    camera.up.set(0, 1, 0);
    camQ.copy(ac.quat);
    camera.lookAt(tmpV2.copy(camera.position).addScaledVector(tmpV, 100));
  } else {
    camQ.slerp(ac.quat, 1 - Math.exp(-(camMode === 1 ? 30 : 4.5) * dt));
    tmpQ.setFromAxisAngle(Y_AXIS, -look.yaw); tmpQ2.setFromAxisAngle(X_AXIS, look.pitch);
    const q = tmpQ.premultiply(camQ).multiply(tmpQ2);
    if (camMode === 1) camera.position.set(0, v.rad * (v.hf ?? 1) * 1.3 + 0.2, -v.len * 0.1).applyQuaternion(ac.quat).add(ac.pos);
    else camera.position.set(0, height, dist).applyQuaternion(q).add(ac.pos);
    camera.quaternion.copy(q);
    if (camMode !== 1) camera.quaternion.multiply(tmpQ2.setFromAxisAngle(X_AXIS, -0.07));
  }
  const floor = Math.max(heightAt(camera.position.x, camera.position.z), 0) + 1.2;
  if (camera.position.y < floor) camera.position.y = floor;
  const fov = 60 + clamp(ac.vel.length() / e.spec.vmax, 0, 1.2) * 12;
  camera.fov += (fov - camera.fov) * Math.min(1, dt * 2); camera.updateProjectionMatrix();
  env.focusShadow(ac.pos, Math.max(45, span * 1.25));
}

// ------------------------------------------------------------------ menus and attract cameras
function orbitCamera(target, radius, angle, heightK = 0.3) {
  camera.up.set(0, 1, 0);
  camera.position.set(target.x + Math.cos(angle) * radius, target.y + radius * heightK + 1.5, target.z + Math.sin(angle) * radius);
  camera.lookAt(target.x, target.y + 0.4, target.z);
  camera.fov += (50 - camera.fov) * 0.2; camera.updateProjectionMatrix();
}

function openPause() { ui.pause(); }
input.onUnlock = () => { if (!ui.open && G.mode !== 'title') openPause(); };

$('btn-start').onclick = () => { $('title').hidden = true; audio.start(); G.mode = 'walk'; G.onUIChange(); input.requestLock(); ui.toast('Welcome to Tailwind Bay. Click the view to look around with the mouse.'); };
$('btn-controls').onclick = () => { audio.start(); ui.controls(); };
$('btn-help').onclick = () => ui.help();

// ------------------------------------------------------------------ main loop
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  G.time += dt;
  const uiWasOpen = ui.open;
  input.poll(dt, G.mode === 'fly' && !uiWasOpen);
  camera.clearViewOffset();

  if (uiWasOpen) {
    for (const d of ['Up', 'Down', 'Left', 'Right']) if (input.consume('nav' + d)) ui.nav(d);
    if (input.consume('menuAccept')) ui.accept();
    if (input.consume('pause') || input.consume('menuBack')) ui.back();
    ui.tick?.();
    if (G.showroom) {
      const e = G.showroom; showAngle += dt * 0.28;
      orbitCamera(e.ac.pos, e.spec.vis.len * 0.9 + e.spec.span * 0.75 + 4, showAngle, 0.22);
      const pw = Math.min(430, W);
      if (W > 820) camera.setViewOffset(W, H, -pw / 2, 0, W, H);
      env.focusShadow(e.ac.pos, Math.max(40, e.spec.span));
    }
    audio.update(false, 0, 0, false);
  } else if (G.mode === 'title') {
    titleAngle += dt * 0.07;
    orbitCamera(tmpV.set(150, HOME_H + 6, -10), 190, titleAngle + 2.2, 0.2);
    env.focusShadow(tmpV, 240);
  } else {
    if (input.consume('pause')) openPause();
    else if (input.consume('help')) ui.help();
    else if (G.mode === 'walk') updateWalk(dt);
    else updateFly(dt);
  }
  if (ui.open) ui.prompt('');

  updateNPCs(world.npcs, uiWasOpen ? 0 : dt, player.x, player.z, G.time);
  for (const s of world.socks) s.rotation.z = Math.PI / 2 + 0.22 + Math.sin(G.time * 2.3 + s.id) * 0.06;
  for (const r of G.rings) r.mesh.rotation.z += dt * 0.4;
  env.update(camera.position, G.time, 5);
  if (composer) composer.render(dt); else renderer.render(scene, camera);
  drawHUD(hud, W, H, G);
  input.endFrame();
}

// Build the terrain around home before showing anything.
resize();
camera.position.set(150, HOME_H + 40, 180);
env.update(camera.position, 0, 20000);
ui.coins(save.coins);
G.persist();
$('loading').hidden = true; $('title').hidden = false;
requestAnimationFrame(frame);
