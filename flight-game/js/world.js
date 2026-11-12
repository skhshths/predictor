// World definition: deterministic terrain height field, airstrips and flattened zones.
// Pure math (no rendering) so physics, terrain meshes and tests all agree on the ground.

export const SEA = 0;

function hash2(ix, iz, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263) ^ Math.imul(seed, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
export const rand2 = hash2;

// Smooth value noise in -1..1.
export function vnoise(x, z, seed) {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = x - ix, fz = z - iz;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return (a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz) * 2 - 1;
}

export function fbm(x, z, oct, seed) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, z * f, seed + i * 17);
    n += a; a *= 0.5; f *= 2.03;
  }
  return s / n;
}

function ridged(x, z, oct, seed) {
  let s = 0, a = 1, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    const v = 1 - Math.abs(vnoise(x * f, z * f, seed + i * 31));
    s += a * v * v;
    n += a; a *= 0.5; f *= 2.1;
  }
  return s / n;
}

const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Terrain before airstrips are flattened into it.
export function rawHeight(x, z) {
  const d2 = x * x + z * z;
  const bx = x - 2300, bz = z - 3100;
  const cont = fbm(x / 15000, z / 15000, 4, 11) + 0.6 * Math.exp(-d2 / (6000 * 6000)) - 1.5 * Math.exp(-(bx * bx + bz * bz) / (2100 * 2100));
  const land = cont + 0.27;
  if (land < 0) return Math.max(-300, land * 500) + vnoise(x / 400, z / 400, 5) * 3;
  const hills = fbm(x / 2600, z / 2600, 5, 23) * 0.5 + 0.5;
  const range = sstep(-0.3, 0.3, fbm(x / 9000 + 40, z / 9000 - 13, 3, 37));
  const mMask = sstep(0.1, 0.45, land) * range * sstep(3500, 9000, Math.sqrt(d2));
  const peaks = ridged(x / 5200, z / 5200, 5, 41);
  const shore = sstep(0, 0.08, land);
  return land * 150 + hills * shore * (40 + land * 260) + mMask * peaks * peaks * 3000;
}

// Airstrips. rot is the runway direction: the local +Z axis rotated about Y.
// Index 0 is the home base.
export const STRIPS = [
  { id: 'home', name: 'Tailwind Bay', x: 0, z: 0, rot: 0, len: 3000, wid: 50 },
  { id: 'gull', name: 'Gull Rock', x: -6500, z: 4200, rot: 0.6, len: 900, wid: 30 },
  { id: 'pine', name: 'Pinewatch', x: 10500, z: -5250, rot: -0.4, len: 1000, wid: 30 },
  { id: 'high', name: 'Highmeadow', x: 18000, z: -3000, rot: 1.2, len: 850, wid: 28 },
  { id: 'salt', name: 'Saltmarsh', x: 13000, z: -18000, rot: 0.2, len: 1400, wid: 36 },
  { id: 'cinder', name: 'Cinder Flats', x: -14000, z: -5500, rot: 1.5, len: 1800, wid: 40 },
  { id: 'north', name: 'Northlight', x: 6000, z: -16000, rot: -1.0, len: 1200, wid: 32 },
  { id: 'fennel', name: 'Fennel Cove', x: 3500, z: 13500, rot: 0.9, len: 1000, wid: 30 },
  { id: 'far', name: 'Farpoint', x: 22000, z: 12000, rot: 0.0, len: 2200, wid: 45 },
];

// Town centre offset from the home runway, in world metres.
export const TOWN = { x: 300, z: 0 };

const zones = [];
for (const s of STRIPS) {
  s.h = Math.min(1100, Math.max(s.id === 'home' ? 14 : 8, rawHeight(s.x, s.z)));
  zones.push({ x: s.x, z: s.z, rot: s.rot, hx: s.wid / 2 + 45, hz: s.len / 2 + 130, blend: s.id === 'home' ? 900 : 650, h: s.h });
}
zones.push({ x: 250, z: 0, rot: 0, hx: 260, hz: 220, blend: 900, h: STRIPS[0].h });
for (const zn of zones) {
  zn.c = Math.cos(zn.rot); zn.s = Math.sin(zn.rot);
  zn.r = Math.hypot(zn.hx, zn.hz) + zn.blend;
}
export const HOME_H = STRIPS[0].h;

function zoneMask(zn, x, z) {
  const dx = x - zn.x, dz = z - zn.z;
  if (Math.abs(dx) > zn.r || Math.abs(dz) > zn.r) return 0;
  const lx = dx * zn.c - dz * zn.s, lz = dx * zn.s + dz * zn.c;
  const ex = Math.max(Math.abs(lx) - zn.hx, 0), ez = Math.max(Math.abs(lz) - zn.hz, 0);
  const d = Math.hypot(ex, ez);
  if (d >= zn.blend) return 0;
  const t = 1 - d / zn.blend;
  return t * t * (3 - 2 * t);
}

// How strongly (0..1) a point sits inside any flattened airfield zone.
export function flatness(x, z) {
  let m = 0;
  for (const zn of zones) m = Math.max(m, zoneMask(zn, x, z));
  return m;
}

export function heightAt(x, z) {
  let h = rawHeight(x, z);
  for (const zn of zones) {
    const m = zoneMask(zn, x, z);
    if (m > 0) h += (zn.h - h) * m;
  }
  return h;
}

// World position for a point given in a strip's local frame (lx across, lz along the runway).
export function stripPoint(s, lx, lz) {
  const c = Math.cos(s.rot), sn = Math.sin(s.rot);
  return { x: s.x + lx * c + lz * sn, z: s.z - lx * sn + lz * c };
}

export function nearestStrip(x, z) {
  let best = null, bd = Infinity;
  for (const s of STRIPS) {
    const d = Math.hypot(x - s.x, z - s.z);
    if (d < bd) { bd = d; best = s; }
  }
  return { strip: best, dist: bd };
}
