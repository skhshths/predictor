// Tailwind Bay: the town, its people, the airfield, and the outlying airstrips.
import * as THREE from 'three';
import { STRIPS, HOME_H, stripPoint } from './world.js';
import { TREE_GEO, TREE_MAT } from './terrain.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });

function textTexture(text, { w = 512, h = 128, bg = '#2b2d42', fg = '#fff', font = 'bold 64px Georgia, serif', border = null } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (border) { g.strokeStyle = border; g.lineWidth = 10; g.strokeRect(8, 8, w - 16, h - 16); }
  g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  let size = parseInt(font.match(/(\d+)px/)[1], 10);
  while (g.measureText(text).width > w - 40 && size > 12) { size -= 4; g.font = font.replace(/\d+px/, size + 'px'); }
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

// ------------------------------------------------------------------ people
export function makePerson(o = {}) {
  const g = new THREE.Group();
  const skin = std(o.skin ?? 0xe0ac7e), shirt = std(o.shirt ?? 0x3a6ea5), pants = std(o.pants ?? 0x2f3542), hair = std(o.hair ?? 0x3b2a1a);
  const part = (geo, mat, x, y, z, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };
  part(new THREE.CapsuleGeometry(0.25, 0.42, 4, 10), shirt, 0, 1.16, 0);
  part(new THREE.SphereGeometry(0.2, 14, 10), skin, 0, 1.68, 0);
  const hairM = part(new THREE.SphereGeometry(0.21, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, 0, 1.71, 0.015);
  hairM.rotation.x = 0.25;
  if (o.hat) {
    part(new THREE.CylinderGeometry(0.22, 0.24, 0.12, 14), std(o.hat), 0, 1.86, 0);
    part(new THREE.CylinderGeometry(0.34, 0.34, 0.025, 16), std(o.hat), 0, 1.81, 0);
  }
  if (o.scarf) part(new THREE.TorusGeometry(0.17, 0.06, 6, 14), std(o.scarf), 0, 1.47, 0).rotation.x = Math.PI / 2;
  if (o.apron) part(new THREE.BoxGeometry(0.4, 0.55, 0.06), std(o.apron), 0, 1.0, -0.23);
  const limb = (x, y, len, r, mat) => {
    const piv = new THREE.Group(); piv.position.set(x, y, 0); g.add(piv);
    part(new THREE.CapsuleGeometry(r, len - r * 2, 3, 8), mat, 0, -len / 2, 0, piv);
    return piv;
  };
  const P = { legL: limb(-0.12, 0.82, 0.82, 0.095, pants), legR: limb(0.12, 0.82, 0.82, 0.095, pants), armL: limb(-0.34, 1.4, 0.6, 0.075, shirt), armR: limb(0.34, 1.4, 0.6, 0.075, shirt) };
  P.armL.rotation.z = -0.12; P.armR.rotation.z = 0.12;
  return { group: g, parts: P, phase: Math.random() * 6 };
}
// People face -Z in their own space, like the planes.
export function animatePerson(p, speed, dt) {
  p.phase += dt * (speed > 0.2 ? 4 + speed * 1.6 : 1.5);
  const sw = speed > 0.2 ? Math.sin(p.phase) * Math.min(0.9, 0.25 + speed * 0.12) : 0;
  p.parts.legL.rotation.x = sw; p.parts.legR.rotation.x = -sw;
  p.parts.armL.rotation.x = -sw * 0.8; p.parts.armR.rotation.x = sw * 0.8;
  p.group.position.y += speed > 0.2 ? 0 : Math.sin(p.phase) * 0.0006;
}

function nameTag(name, role) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.font = '600 46px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const w = Math.min(500, g.measureText(name).width + 60);
  g.fillStyle = 'rgba(18,24,38,0.72)'; g.beginPath(); g.roundRect(256 - w / 2, 14, w, 70, 35); g.fill();
  g.fillStyle = '#fff'; g.fillText(name, 256, 51);
  if (role) { g.font = '500 28px system-ui, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.92)'; g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = 5; g.strokeText(role, 256, 108); g.fillText(role, 256, 108); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(2.6, 0.65, 1); s.position.y = 2.45; s.renderOrder = 5;
  return s;
}

// ------------------------------------------------------------------ buildings
const WALLS = [0xf1e3c8, 0xe8d2b0, 0xd9e4dc, 0xf3d9c4, 0xdfe6ee, 0xead9d0];
const ROOFS = [0xa8432f, 0x7d4b3a, 0x4d6274, 0x8c5a3c, 0x5f7355];
const glassMat = new THREE.MeshStandardMaterial({ color: 0x9cc4dd, roughness: 0.08, metalness: 0.7, emissive: 0x332a10, emissiveIntensity: 0.5 });
const woodMat = std(0x6b4a2e), trimMat = std(0xfaf5ea), stoneMat = std(0x9a958a);

function building(parent, colliders, o) {
  const { x, z, w = 20, d = 13, h = 6, face = 1 } = o;
  const g = new THREE.Group(); g.position.set(x, HOME_H, z);
  const add = (geo, mat, px, py, pz, cast = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(px, py, pz); m.castShadow = cast; m.receiveShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(w, h, d), std(o.wall ?? WALLS[0]), 0, h / 2, 0);
  add(new THREE.BoxGeometry(w + 0.5, 0.5, d + 0.5), stoneMat, 0, 0.25, 0);
  const rh = o.roofH ?? 3.6, r = 1;
  const roof = add(new THREE.ConeGeometry(r, rh, 4), std(o.roof ?? ROOFS[0], { roughness: 0.7, flatShading: true }), 0, h + rh / 2, 0);
  roof.rotation.y = Math.PI / 4; roof.scale.set((w + 1.6) / Math.SQRT2, 1, (d + 1.6) / Math.SQRT2);
  add(new THREE.BoxGeometry(1.1, 2.4, 1.1), std(0x8a5a44), w * 0.28, h + rh * 0.62, -face * d * 0.1);
  const fz = face * (d / 2 + 0.06);
  add(new THREE.BoxGeometry(1.5, 2.5, 0.16), woodMat, 0, 1.25 + 0.5, fz);
  add(new THREE.BoxGeometry(1.9, 0.2, 0.3), trimMat, 0, 3.1, fz);
  const cols = Math.max(1, Math.floor((w - 6) / 5));
  for (const sx of [-1, 1]) for (let i = 0; i < cols; i++) {
    const wx = sx * (2.6 + i * 3.4);
    if (Math.abs(wx) > w / 2 - 1.5) continue;
    add(new THREE.BoxGeometry(1.9, 1.9, 0.12), glassMat, wx, 2.5, fz, false);
    add(new THREE.BoxGeometry(2.2, 0.16, 0.3), trimMat, wx, 1.48, fz, false);
  }
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.12, 1.8, 1.8), glassMat, sx * (w / 2 + 0.06), 2.6, 0, false);
  if (o.sign) {
    const board = add(new THREE.PlaneGeometry(Math.min(w * 0.78, 13), 1.7), new THREE.MeshStandardMaterial({ map: textTexture(o.sign, { bg: o.signBg ?? '#22303f', fg: o.signFg ?? '#fdf6e3', border: o.signFg ?? '#fdf6e3' }), roughness: 0.6 }), 0, h - 1.15, face * (d / 2 + 0.45), false);
    if (face < 0) board.rotation.y = Math.PI;
    const aw = add(new THREE.BoxGeometry(w * 0.86, 0.16, 2.4), std(o.awning ?? 0xc8452f), 0, 3.5, face * (d / 2 + 1.1));
    aw.rotation.x = face * 0.22;
    for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.06, 3.3, 6), trimMat, sx * w * 0.4, 1.65, face * (d / 2 + 2.1));
  }
  parent.add(g);
  colliders.push({ minx: x - w / 2 - 0.4, maxx: x + w / 2 + 0.4, minz: z - d / 2 - 0.4, maxz: z + d / 2 + 0.4 });
  return g;
}

function runwayTexture(strip) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 2048;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3c40'; g.fillRect(0, 0, 256, 2048);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},${i % 2 ? 255 : 0},0.04)`; g.fillRect(Math.random() * 256, Math.random() * 2048, 2 + Math.random() * 5, 6 + Math.random() * 30); }
  g.fillStyle = 'rgba(20,20,22,0.3)'; g.fillRect(96, 2048 * 0.1, 64, 2048 * 0.12); g.fillRect(96, 2048 * 0.78, 64, 2048 * 0.12);
  g.fillStyle = '#f2f2ee';
  g.fillRect(8, 0, 5, 2048); g.fillRect(243, 0, 5, 2048);
  const dash = Math.round(2048 / (strip.len / 60));
  for (let y = 260; y < 1790; y += dash) g.fillRect(124, y, 8, dash * 0.5);
  const py = 2048 / strip.len, px = 256 / strip.wid;   // pixels per metre along and across
  for (let i = 0; i < 8; i++) { g.fillRect(26 + i * 27, 6 * py, 14, 30 * py); g.fillRect(26 + i * 27, 2048 - 36 * py, 14, 30 * py); }
  const num = (h) => String(Math.round((((h * 180) / Math.PI) % 360 + 360) % 360 / 10) || 36).padStart(2, '0');
  g.font = 'bold 14px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const sc = Math.min(1.6, strip.wid / 30);
  g.save(); g.translate(128, 2048 - 62 * py); g.scale(px * sc, py * 2.4 * sc); g.fillText(num(-strip.rot), 0, 0); g.restore();
  g.save(); g.translate(128, 62 * py); g.rotate(Math.PI); g.scale(px * sc, py * 2.4 * sc); g.fillText(num(-strip.rot + Math.PI), 0, 0); g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 16;
  return t;
}

function decal(scene, w, l, mat, x, y, z, rot = 0, order = 0) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, l), mat);
  m.rotation.set(-Math.PI / 2, 0, 0); m.rotation.order = 'YXZ'; m.rotation.y = rot;
  m.position.set(x, y, z); m.receiveShadow = true; m.renderOrder = order;
  mat.polygonOffset = true; mat.polygonOffsetFactor = -2 - order; mat.polygonOffsetUnits = -2 - order;
  scene.add(m);
  return m;
}

function windsock(scene, x, y, z) {
  const g = new THREE.Group(); g.position.set(x, y, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 7, 8), std(0xdddddd)); pole.position.y = 3.5; pole.castShadow = true;
  const sock = new THREE.Mesh(new THREE.ConeGeometry(0.55, 3, 10, 1, true), std(0xff7a1a, { side: THREE.DoubleSide }));
  sock.rotation.z = Math.PI / 2 + 0.25; sock.position.set(1.5, 6.6, 0); sock.castShadow = true;
  g.add(pole, sock); scene.add(g);
  return sock;
}

function tree(scene, x, z, kind = 'leaf', s = 1) {
  const m = new THREE.Mesh(TREE_GEO[kind], TREE_MAT);
  m.position.set(x, HOME_H - 0.1, z); m.scale.setScalar(s * 0.75); m.rotation.y = x * 1.7 + z;
  m.castShadow = true; m.receiveShadow = true; scene.add(m);
}

// ------------------------------------------------------------------ people of Tailwind Bay
const TIPS = [
  'Keep the nose on the horizon and let the speed build before you pull. A plane that is rushed off the ground settles right back onto it.',
  'On approach, pitch sets your speed and throttle sets your descent. Sounds backwards. Works every time.',
  'If the stall warning shows, ease the stick forward first. Power second. Never the other way round.',
  'Flaps buy you a slower landing, but they are a handbrake in the climb. Bring them up once you are safely away.',
  'Cross the fence about a third faster than your stall speed, then hold her off just above the runway until she quits flying.',
  'Rudder steers on the ground. Small feet, small corrections, and brake only when you are straight.',
];

export function townNPCs() {
  return [
    { id: 'ines', name: 'Captain Ines', role: 'Hangar chief', x: 112, z: -84, face: 0, look: { shirt: 0x5b4636, pants: 0x3b3a36, hat: 0x2c3e50, scarf: 0xf1ede4 },
      talk: (G) => ({
        text: G.save.met.ines ? 'Back again? The whole fleet is fuelled and waiting. Pick anything you like.' :
          'So you are the new pilot. Welcome to Tailwind Bay. Every aeroplane in this hangar is yours to borrow, and that odd little pod-and-boom machine on the apron is yours to keep. The shops in town sell parts for it.',
        options: [
          { label: 'Show me the hangar', fn: () => G.openHangar() },
          { label: 'Bring my own plane back here', fn: () => G.recallCustom() },
          { label: 'Any advice?', fn: () => G.say('ines', 'Deliveries for the post office pay best. Golden rings over the bay pay a little each. Spend it all on your aeroplane, that is what I did.') },
        ],
      }) },
    { id: 'marta', name: 'Marta', role: 'Engines', x: 212, z: -13.5, face: Math.PI, look: { shirt: 0x8d3b2b, pants: 0x2d2d33, hair: 0x1f1a17, apron: 0x3a3a3a },
      talk: (G) => ({ text: 'Piston, turbine or jet, I bolt it on while you wait. More thrust means more speed and a shorter take-off, but watch the weight.',
        options: [{ label: 'Show me engines', fn: () => G.openShop('engine', 'marta') }] }) },
    { id: 'odalys', name: 'Odalys', role: 'Wings', x: 247, z: -13.5, face: Math.PI, look: { shirt: 0x2f7f7b, pants: 0x4a3f35, hair: 0x5a3825, hat: 0xe9c46a },
      talk: (G) => ({ text: 'A wing is a promise about how you want to fly. Big wings land slow. Small wings go fast and roll quick. Which pilot are you today?',
        options: [{ label: 'Show me wings', fn: () => G.openShop('wings', 'odalys') }] }) },
    { id: 'fenwick', name: 'Fenwick', role: 'Tails & gear', x: 212, z: 13.5, face: 0, look: { shirt: 0x49566b, pants: 0x2b2b2b, hair: 0xbdbdbd, skin: 0xc98f62 },
      talk: (G) => ({ text: 'Rudder & Wheel, at your service. Tails for the back end, undercarriage for the bottom end. What is she missing?',
        options: [{ label: 'Tails', fn: () => G.openShop('tail', 'fenwick') }, { label: 'Landing gear', fn: () => G.openShop('gear', 'fenwick') }] }) },
    { id: 'bo', name: 'Bo', role: 'Paint', x: 247, z: 13.5, face: 0, look: { shirt: 0xff70a6, pants: 0x3d5a80, hair: 0x22223b, apron: 0xf4f1de },
      talk: (G) => ({ text: 'Nobody remembers a grey aeroplane. Let me fix that for you.',
        options: [{ label: 'Show me paint', fn: () => G.openShop('paint', 'bo') }] }) },
    { id: 'juniper', name: 'Juniper', role: 'Odds & Props', x: 357, z: 13.5, face: 0, look: { shirt: 0x6a4c93, pants: 0x30343f, hair: 0xb5651d, skin: 0xf0c9a0 },
      talk: (G) => ({ text: 'Smoke canisters, go-faster tape, parts that fell off other aeroplanes. Everything here bolts straight on.',
        options: [{ label: 'Show me extras', fn: () => G.openShop('extra', 'juniper') }] }) },
    { id: 'hobb', name: 'Postmaster Hobb', role: 'Deliveries', x: 397, z: -13.5, face: Math.PI, look: { shirt: 0x1d3557, pants: 0x1b263b, hat: 0x1d3557, hair: 0x888888 },
      talk: (G) => G.jobNode(STRIPS[0], 'hobb') },
    { id: 'pim', name: 'Pim', role: 'Windsock Café', x: 357, z: -13.5, face: Math.PI, look: { shirt: 0xf4a261, pants: 0x3a3a3a, hair: 0x2b1d0e, apron: 0xfaf5ea, skin: 0xb9805a },
      talk: (G) => G.say('pim', ['Coffee is on the house for pilots. The view from Highmeadow is worth the climb, they say, but the strip is short and the air is thin.',
        'A fisherman told me there is a lake past Pinewatch you can only reach with floats. Sounds like your kind of trouble.',
        'Farpoint is the long one, way out east. The big jets can stop there. Nothing much else can find it.'][G.cycle('pim', 3)]) },
    { id: 'gus', name: 'Old Gus', role: 'Retired pilot', x: 292, z: 9, face: 0.6, look: { shirt: 0x7a6a53, pants: 0x4b4237, hair: 0xe6e6e6, hat: 0x6b4a2e, skin: 0xd9a37a },
      talk: (G) => G.say('gus', TIPS[G.cycle('gus', TIPS.length)]) },
    { id: 'tamsin', name: 'Tamsin', role: 'Future pilot', x: 305, z: -7, face: 2, small: 0.72, look: { shirt: 0xffd166, pants: 0x457b9d, hair: 0x7b3f00 },
      wander: [[305, -7], [312, 6], [296, 8], [290, -6]],
      talk: (G) => G.say('tamsin', ['Is that pointy one with the pod YOURS? Can it do a loop? Can I watch?', 'When I grow up I am going to fly the big white one with four engines. And a biplane. At the same time.',
        'I counted the rings over the bay. There are twelve. I bet you cannot get them all without landing.'][G.cycle('tamsin', 3)]) },
    { id: 'dot', name: 'Dot', role: 'Town gossip', x: 330, z: 3, face: -1.5, look: { shirt: 0x90be6d, pants: 0x4d4d57, hair: 0x4a2c2a },
      wander: [[330, 3], [372, 4], [372, -4], [228, -4], [228, 4]],
      talk: (G) => G.say('dot', ['You did not hear it from me, but Marta has a jet engine under a tarp in the back. Nine thousand coins, she wants.',
        'Gull Rock has the best sunsets and the worst crosswind. Take the Marmot.', 'The keeper at every strip has parcels waiting. Good money if you do not mind the flying, and I hear you do not.'][G.cycle('dot', 3)]) },
    { id: 'rosa', name: 'Rosa', role: 'Tower', x: 152, z: 100, face: -1.2, look: { shirt: 0xf1faee, pants: 0x1d3557, hair: 0x14213d, skin: 0x9c6b4a },
      talk: (G) => G.say('rosa', 'Runway three-six is the long one right in front of you, three thousand metres. If you ever get in a muddle out there, Backspace puts you back on the numbers.') },
  ];
}

// ------------------------------------------------------------------ assemble the world
export function buildWorld(scene) {
  const H = HOME_H, colliders = [], npcs = [], socks = [];

  // Runways and keepers for every strip.
  const hutNames = ['', 'Gull Rock', 'Pinewatch', 'Highmeadow', 'Saltmarsh', 'Cinder Flats', 'Northlight', 'Fennel Cove', 'Farpoint'];
  const keeperNames = ['', 'Skerry', 'Aspen', 'Brae', 'Reed', 'Ash', 'Sol', 'Anise', 'Miles'];
  STRIPS.forEach((s, i) => {
    decal(scene, s.wid, s.len, new THREE.MeshStandardMaterial({ map: runwayTexture(s), roughness: 0.92 }), s.x, s.h + 0.06, s.z, s.rot, 0);
    if (i === 0) return;
    const a = stripPoint(s, s.wid / 2 + 34, 0);
    decal(scene, 46, 60, std(0x4a4c50), a.x, s.h + 0.05, a.z, s.rot, 0);
    const hp = stripPoint(s, s.wid / 2 + 66, 0);
    const hut = new THREE.Group(); hut.position.set(hp.x, s.h, hp.z); hut.rotation.y = s.rot;
    const body = new THREE.Mesh(new THREE.BoxGeometry(9, 4, 7), std(WALLS[i % WALLS.length])); body.position.y = 2;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 2.6, 4), std(ROOFS[i % ROOFS.length], { flatShading: true })); roof.position.y = 5.3; roof.rotation.y = Math.PI / 4; roof.scale.set(10.4 / Math.SQRT2, 1, 8.4 / Math.SQRT2);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.1), new THREE.MeshStandardMaterial({ map: textTexture(hutNames[i], { bg: '#22303f', border: '#fdf6e3' }) }));
    sign.position.set(-4.56, 3.1, 0); sign.rotation.y = -Math.PI / 2;
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 1.2), woodMat); door.position.set(-4.5, 1.1, 0);
    hut.add(body, roof, sign, door); hut.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(hut);
    const sp = stripPoint(s, s.wid / 2 + 18, 70); socks.push(windsock(scene, sp.x, s.h, sp.z));
    const kp = stripPoint(s, s.wid / 2 + 56, 4);
    npcs.push({ id: 'keeper_' + s.id, name: keeperNames[i], role: s.name + ' keeper', x: kp.x, z: kp.z, y: s.h, face: s.rot + Math.PI / 2,
      look: { shirt: [0x386641, 0x6d597a, 0xbc4749, 0x457b9d, 0x9c6644, 0x577590, 0xb5838d, 0x52796f][i - 1], pants: 0x343a40, hat: 0x5b4636 },
      talk: (G) => G.jobNode(s, 'keeper_' + s.id) });
  });

  // Airfield ground.
  decal(scene, 142, 190, std(0x53565b, { roughness: 0.95 }), 96, H + 0.05, 0, 0, 0);
  const line = std(0xe9c12e);
  decal(scene, 0.5, 60, line, 80, H + 0.07, -40, Math.PI / 2, 1); decal(scene, 0.5, 60, line, 80, H + 0.07, 30, Math.PI / 2, 1);
  decal(scene, 250, 11, std(0xb9a98c, { roughness: 1 }), 300, H + 0.05, 0, 0, 0);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(24, 40), std(0xc7b99c, { roughness: 1, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
  plaza.rotation.x = -Math.PI / 2; plaza.position.set(300, H + 0.06, 0); plaza.receiveShadow = true; plaza.renderOrder = 1; scene.add(plaza);

  // Hangar: a big Quonset arch, open toward the apron.
  const hg = new THREE.Group(); hg.position.set(112, H, -122);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(32, 32, 46, 28, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ color: 0xb9c0c7, metalness: 0.75, roughness: 0.42, side: THREE.DoubleSide }));
  shell.rotation.x = -Math.PI / 2; shell.scale.z = 0.5; shell.castShadow = true; shell.receiveShadow = true;
  const back = new THREE.Mesh(new THREE.CircleGeometry(32, 28, 0, Math.PI), std(0x8f979f, { side: THREE.DoubleSide })); back.scale.y = 0.5; back.position.z = -23; back.castShadow = true;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(63, 46), std(0x6c6f73, { polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 })); floor.rotation.x = -Math.PI / 2; floor.position.y = 0.06; floor.receiveShadow = true;
  const hs = new THREE.Mesh(new THREE.PlaneGeometry(26, 3.2), new THREE.MeshStandardMaterial({ map: textTexture('TAILWIND BAY', { bg: '#1d3557', border: '#f1faee', font: 'bold 70px Georgia, serif' }) })); hs.position.set(0, 13.2, 23.4);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(30, 4.4, 0.5), std(0x2b3a4a)); beam.position.set(0, 13.2, 23.1);
  hg.add(shell, back, floor, beam, hs);
  for (let i = 0; i < 7; i++) {
    const cr = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), std([0x9c6644, 0x7f5539, 0x386641][i % 3])); cr.position.set(-26 + (i % 4) * 1.9, 0.8 + (i > 3 ? 1.6 : 0), -16 + (i > 3 ? 0.4 : 0)); cr.castShadow = true; hg.add(cr);
  }
  for (const sx of [-1, 1]) { const dr = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.6, 14), std(sx > 0 ? 0xc1121f : 0x1d6f8c, { metalness: 0.5, roughness: 0.4 })); dr.position.set(sx * 24, 0.8, 14); dr.castShadow = true; hg.add(dr); }
  scene.add(hg);
  colliders.push({ minx: 80, maxx: 144, minz: -146.5, maxz: -144 }, { minx: 79, maxx: 81.5, minz: -146, maxz: -99 }, { minx: 142.5, maxx: 145, minz: -146, maxz: -99 });

  // Control tower.
  const tw = new THREE.Group(); tw.position.set(160, H, 108);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 16, 10), std(0xe9e4d8)); shaft.position.y = 8;
  const cab = new THREE.Mesh(new THREE.CylinderGeometry(5, 4, 3.4, 10), glassMat); cab.position.y = 17.7;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 5.6, 0.5, 10), std(0xa8432f)); cap.position.y = 19.6;
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.45, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff3b30 })); lamp.position.y = 20.4;
  tw.add(shaft, cab, cap, lamp); tw.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(tw);
  colliders.push({ minx: 156.5, maxx: 163.5, minz: 104.5, maxz: 111.5 });
  socks.push(windsock(scene, 36, H, 150));

  // Main street.
  const B = (o) => building(scene, colliders, o);
  B({ x: 212, z: -22, sign: 'PISTON & THUNDER', wall: 0xe5d5b8, roof: 0x7d4b3a, awning: 0x8d3b2b });
  B({ x: 247, z: -22, w: 22, sign: 'WING WORKS', wall: 0xdce6e2, roof: 0x4d6274, awning: 0x2f7f7b, signBg: '#17494d' });
  B({ x: 212, z: 22, face: -1, sign: 'RUDDER & WHEEL', wall: 0xead9d0, roof: 0x5f7355, awning: 0x49566b, signBg: '#2e3440' });
  B({ x: 247, z: 22, face: -1, w: 18, sign: 'SPLASH PAINT', wall: 0xfdf0f4, roof: 0xa8432f, awning: 0xff70a6, signBg: '#7b2d5b' });
  B({ x: 357, z: -22, sign: 'WINDSOCK CAFÉ', wall: 0xf3d9c4, roof: 0x8c5a3c, awning: 0xf4a261, signBg: '#5a3e2b' });
  B({ x: 397, z: -22, w: 18, h: 7, sign: 'POST OFFICE', wall: 0xdfe6ee, roof: 0x4d6274, awning: 0x1d3557, signBg: '#1d3557' });
  B({ x: 357, z: 22, face: -1, sign: 'ODDS & PROPS', wall: 0xe8d2b0, roof: 0x7d4b3a, awning: 0x6a4c93, signBg: '#3c2a57' });
  B({ x: 397, z: 22, face: -1, w: 16, wall: WALLS[2], roof: ROOFS[3] });
  const houses = [[282, -44, 1], [322, -46, 1], [282, 44, -1], [322, 46, -1], [432, -30, 1], [436, 28, -1], [468, -6, 1], [250, -58, 1], [214, 58, -1], [360, 60, -1], [398, -60, 1], [455, 62, -1], [470, -52, 1]];
  houses.forEach(([x, z, f], i) => B({ x, z, face: f, w: 12 + (i % 3) * 2, d: 10 + (i % 2) * 2, h: 5 + (i % 2), wall: WALLS[i % WALLS.length], roof: ROOFS[(i * 2) % ROOFS.length] }));

  // Fountain.
  const ft = new THREE.Group(); ft.position.set(300, H, 0);
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.5, 0.9, 24), stoneMat); basin.position.y = 0.45;
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 3.8, 0.1, 24), new THREE.MeshStandardMaterial({ color: 0x3aa0c8, roughness: 0.05, metalness: 0.6 })); pool.position.y = 0.88;
  const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 2.6, 10), stoneMat); col.position.y = 1.7;
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 0.4, 0.5, 16), stoneMat); bowl.position.y = 3.1;
  // A little bronze aeroplane on top, the town mascot.
  const bronze = new THREE.MeshStandardMaterial({ color: 0xb08d57, metalness: 1, roughness: 0.3 });
  const mf = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 1.1, 4, 8), bronze); mf.rotation.z = Math.PI / 2; mf.position.y = 4.1;
  const mw = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 2.2), bronze); mw.position.set(0.15, 4.12, 0);
  const mt = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.05, 0.8), bronze); mt.position.set(-0.6, 4.14, 0);
  const mp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7, 6), bronze); mp.position.y = 3.65;
  const plane = new THREE.Group(); plane.add(mf, mw, mt); plane.rotation.z = 0.25;
  ft.add(basin, pool, col, bowl, mp, plane); ft.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(ft);
  colliders.push({ minx: 295.6, maxx: 304.4, minz: -4.4, maxz: 4.4 });

  // Street lamps, benches, trees.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff1c1 });
  for (let x = 195; x <= 415; x += 31.4) for (const sz of [-1, 1]) {
    if (Math.abs(x - 300) < 22) continue;
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 4.2, 8), std(0x2b2d33, { metalness: 0.6 })); p.position.set(x, H + 2.1, sz * 7.2); p.castShadow = true;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), lampMat); b.position.set(x, H + 4.3, sz * 7.2);
    scene.add(p, b);
  }
  const bench = (x, z, r) => {
    const g = new THREE.Group(); g.position.set(x, H, z); g.rotation.y = r;
    const seat = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.1, 0.6), woodMat); seat.position.y = 0.5;
    const bk = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 0.08), woodMat); bk.position.set(0, 0.9, -0.28);
    g.add(seat, bk); for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 0.5), std(0x2b2d33)); l.position.set(sx * 0.9, 0.25, 0); g.add(l); }
    g.traverse(o => { if (o.isMesh) o.castShadow = true; }); scene.add(g);
  };
  bench(291, 11.5, Math.PI + 0.5); bench(309, 11.5, Math.PI - 0.5); bench(291, -11.5, -0.5); bench(309, -11.5, 0.5);
  [[284, 17, 'leaf', 1.1], [316, 17, 'leaf', 1], [284, -17, 'leaf', 1], [316, -17, 'leaf', 1.2], [231, -40, 'pine', 1], [268, 36, 'leaf', 1.2], [340, -40, 'leaf', 1.1], [376, 40, 'pine', 1],
    [420, 8, 'leaf', 1.3], [418, -44, 'pine', 1.1], [190, 40, 'leaf', 1.2], [190, -42, 'leaf', 1], [450, 40, 'leaf', 1], [300, 66, 'pine', 1.2], [300, -68, 'pine', 1.3], [340, 78, 'leaf', 1.1],
    [176, 96, 'leaf', 1], [176, -60, 'pine', 0.9], [485, 20, 'pine', 1.2], [240, 78, 'leaf', 1.2], [420, 78, 'leaf', 1], [380, -82, 'leaf', 1.2], [262, -80, 'pine', 1]]
    .forEach(([x, z, k, s]) => tree(scene, x, z, k, s));
  // Flower boxes by the shops.
  const petals = [0xe63946, 0xffb703, 0xff70a6, 0xf1faee];
  for (const [x, z] of [[203, -14.5], [221, -14.5], [238, 14.5], [256, 14.5], [348, -14.5], [366, 14.5], [389, -14.5]]) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(2, 0.5, 0.6), woodMat); box.position.set(x, H + 0.25, z); box.castShadow = true; scene.add(box);
    for (let i = 0; i < 5; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.17, 6, 5), std(petals[(i + Math.round(x)) % 4])); f.position.set(x - 0.8 + i * 0.4, H + 0.62, z); scene.add(f); }
  }

  // People.
  for (const d of townNPCs()) npcs.push(d);
  for (const n of npcs) {
    n.y ??= H;
    n.person = makePerson(n.look);
    n.person.group.position.set(n.x, n.y, n.z); n.person.group.rotation.y = n.face;
    if (n.small) n.person.group.scale.setScalar(n.small);
    n.person.group.add(nameTag(n.name, n.role));
    n.wp = 0; n.home = [n.x, n.z];
    scene.add(n.person.group);
  }
  return { colliders, npcs, socks };
}

// Wandering townsfolk stroll between waypoints and stop to face you when you are close.
export function updateNPCs(npcs, dt, px, pz, time) {
  for (const n of npcs) {
    const g = n.person.group;
    const dp = Math.hypot(px - n.x, pz - n.z);
    if (dp > 400) continue;
    let speed = 0;
    if (dp < 4.5) {
      const want = Math.atan2(-(px - n.x), -(pz - n.z));
      let d = want - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * Math.min(1, dt * 5);
    } else if (n.wander) {
      const [tx, tz] = n.wander[n.wp];
      const dx = tx - n.x, dz = tz - n.z, d = Math.hypot(dx, dz);
      if (d < 0.5) n.wp = (n.wp + 1) % n.wander.length;
      else {
        speed = 1.3;
        n.x += (dx / d) * speed * dt; n.z += (dz / d) * speed * dt;
        const want = Math.atan2(-dx, -dz);
        let dd = want - g.rotation.y; dd = Math.atan2(Math.sin(dd), Math.cos(dd));
        g.rotation.y += dd * Math.min(1, dt * 4);
      }
    } else {
      let d = n.face - g.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
      g.rotation.y += d * Math.min(1, dt * 2);
    }
    g.position.set(n.x, n.y, n.z);
    animatePerson(n.person, speed, dt);
  }
}
