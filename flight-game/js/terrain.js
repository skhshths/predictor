// Everything the world looks like: sky, sun, streamed terrain, forests, water and clouds.
import * as THREE from 'three';
import { heightAt, flatness, fbm, vnoise, rand2 } from './world.js';

export const SUN_DIR = new THREE.Vector3(-0.48, 0.6, 0.56).normalize();
const CH = 1600;           // chunk size, metres
const SKIRT = 90;
const HORIZON = new THREE.Color().setRGB(0.6, 0.75, 0.92);

const GLSL_NOISE = `
float h21(vec2 p){ p = fract(p*vec2(123.34, 456.21)); p += dot(p, p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h21(i), h21(i+vec2(1,0)), f.x), mix(h21(i+vec2(0,1)), h21(i+vec2(1,1)), f.x), f.y); }
`;

// ------------------------------------------------------------------ sky
function makeSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { sun: { value: SUN_DIR } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 sun; varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        float h = max(d.y, 0.0);
        vec3 zen = vec3(0.045, 0.2, 0.6), hor = vec3(0.6, 0.75, 0.92);
        vec3 col = mix(hor, zen, pow(h, 0.42));
        col = mix(col, vec3(0.42, 0.55, 0.66), clamp(-d.y*5.0, 0.0, 1.0));
        float s = max(dot(d, sun), 0.0);
        col += vec3(1.0, 0.72, 0.42)*pow(s, 6.0)*0.22 + vec3(1.0, 0.9, 0.72)*pow(s, 90.0)*0.6;
        col += vec3(1.0, 0.96, 0.88)*smoothstep(0.99935, 0.9997, s)*14.0;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), mat);
  m.frustumCulled = false; m.renderOrder = -10;
  return m;
}

// ------------------------------------------------------------------ terrain colours
const C = (hex) => new THREE.Color(hex);
const COL = {
  deep: C(0x1b4650), sand: C(0xcdb67e), grass: C(0x3f7029), grass2: C(0x6f8a34), field: C(0x47752c),
  forest: C(0x244f22), alpine: C(0x66733f), rock: C(0x6b635c), rock2: C(0x4f4b4a), snow: C(0xeef2f8),
};
const tc = new THREE.Color();
function terrainColor(x, z, y, slope, flat) {
  if (y < 1.6) {
    tc.copy(COL.sand);
    if (y < 0) tc.lerp(COL.deep, Math.min(1, -y / 22));
    return tc;
  }
  const n = vnoise(x / 420, z / 420, 3) * 0.5 + 0.5;
  tc.copy(COL.grass).lerp(COL.grass2, n);
  const forest = fbm(x / 1500, z / 1500, 3, 71);
  if (forest > -0.05) tc.lerp(COL.forest, Math.min(1, (forest + 0.05) * 3) * 0.8);
  if (flat > 0.5) tc.lerp(COL.field, (flat - 0.5) * 1.3);
  if (y < 5) tc.lerp(COL.sand, 1 - (y - 1.6) / 3.4);
  if (y > 600) tc.lerp(COL.alpine, Math.min(1, (y - 600) / 500));
  const rocky = Math.min(1, Math.max(0, (slope - 0.42) / 0.3));
  if (rocky > 0) tc.lerp(n > 0.5 ? COL.rock : COL.rock2, rocky);
  const snowLine = 1250 + n * 260;
  if (y > snowLine && slope < 1.1) tc.lerp(COL.snow, Math.min(1, (y - snowLine) / 160));
  return tc;
}

function terrainMaterial() {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0, envMapIntensity: 0.35 });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix*vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWP;' + GLSL_NOISE)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float dd = length(vWP - cameraPosition);
        float near = 1.0 - smoothstep(60.0, 900.0, dd);
        float n0 = vn(vWP.xz*0.0017 + 3.0), n1 = vn(vWP.xz*0.012), n2 = vn(vWP.xz*0.11 + 7.0), n3 = vn(vWP.xz*1.3), n4 = vn(vWP.xz*7.0);
        diffuseColor.rgb *= 0.62 + 0.34*n0 + 0.3*n1 + 0.16*n2*(0.4 + 0.6*near) + (0.2*(n3 - 0.5) + 0.22*(n4 - 0.5))*near;
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb*vec3(1.12, 1.04, 0.72), smoothstep(0.55, 0.8, n1)*0.5);`);
  };
  return mat;
}

function buildChunkGeometry(cx, cz, n) {
  const step = CH / n, w = n + 3;
  const H = new Float32Array(w * w);
  const x0 = cx * CH, z0 = cz * CH;
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) H[j * w + i] = heightAt(x0 + (i - 1) * step, z0 + (j - 1) * step);
  const pos = new Float32Array(w * w * 3), nor = new Float32Array(w * w * 3), col = new Float32Array(w * w * 3);
  let maxY = -1e9, minY = 1e9;
  for (let j = 0; j < w; j++) for (let i = 0; i < w; i++) {
    const ci = Math.min(n + 1, Math.max(1, i)), cj = Math.min(n + 1, Math.max(1, j));
    const edge = ci !== i || cj !== j;
    const h = H[cj * w + ci];
    const k = (j * w + i) * 3;
    const lx = (ci - 1) * step, lz = (cj - 1) * step;
    pos[k] = lx; pos[k + 1] = edge ? h - SKIRT : h; pos[k + 2] = lz;
    const dx = H[cj * w + ci - 1] - H[cj * w + ci + 1], dz = H[(cj - 1) * w + ci] - H[(cj + 1) * w + ci];
    const il = 1 / Math.hypot(dx, 2 * step, dz);
    nor[k] = dx * il; nor[k + 1] = 2 * step * il; nor[k + 2] = dz * il;
    const slope = Math.hypot(dx, dz) / (2 * step);
    const wx = x0 + lx, wz = z0 + lz;
    const c = terrainColor(wx, wz, h, slope, h > 1.6 ? flatness(wx, wz) : 0);
    col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
    if (h > maxY) maxY = h; if (h < minY) minY = h;
  }
  const idx = new Uint32Array((w - 1) * (w - 1) * 6);
  let t = 0;
  for (let j = 0; j < w - 1; j++) for (let i = 0; i < w - 1; i++) {
    const a = j * w + i, b = a + 1, c = a + w, d = c + 1;
    idx[t++] = a; idx[t++] = c; idx[t++] = b; idx[t++] = b; idx[t++] = c; idx[t++] = d;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  const mid = (maxY + minY) / 2 - SKIRT / 2, ry = (maxY - minY) / 2 + SKIRT;
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(CH / 2, mid, CH / 2), Math.hypot(CH * 0.71, ry));
  return g;
}

// ------------------------------------------------------------------ trees
function mergeColored(parts) {
  const pos = [], nor = [], col = [];
  for (const [geo, hex, m] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo.clone(); if (m) g.applyMatrix4(m);
    g.computeVertexNormals();
    const c = new THREE.Color(hex);
    pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array);
    for (let i = 0; i < g.attributes.position.count; i++) col.push(c.r, c.g, c.b);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}
const T = (x, y, z, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
export const TREE_GEO = {
  pine: mergeColored([
    [new THREE.CylinderGeometry(0.28, 0.4, 3, 6), 0x5a4030, T(0, 1.5, 0)],
    [new THREE.ConeGeometry(2.6, 5, 8), 0x2f5d34, T(0, 4.6, 0)],
    [new THREE.ConeGeometry(2.0, 4.4, 8), 0x356b3a, T(0, 7.2, 0)],
    [new THREE.ConeGeometry(1.3, 3.6, 8), 0x3d7742, T(0, 9.6, 0)],
  ]),
  leaf: mergeColored([
    [new THREE.CylinderGeometry(0.3, 0.45, 4, 6), 0x66482f, T(0, 2, 0)],
    [new THREE.IcosahedronGeometry(2.9, 1), 0x4c8a3a, T(0, 6, 0, 1, 0.9, 1)],
    [new THREE.IcosahedronGeometry(2.0, 1), 0x5c9c44, T(1.3, 7.6, 0.6)],
    [new THREE.IcosahedronGeometry(1.8, 1), 0x427c34, T(-1.4, 7, -0.8)],
  ]),
};
export const TREE_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, envMapIntensity: 0.3 });

function buildTrees(cx, cz, density) {
  const cell = 24, n = Math.floor(CH / cell);
  const lists = { pine: [], leaf: [] };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const gx = cx * n + i, gz = cz * n + j;
    const r = rand2(gx, gz, 91);
    const x = (gx + rand2(gx, gz, 92)) * cell, z = (gz + rand2(gx, gz, 93)) * cell;
    const f = fbm(x / 1500, z / 1500, 3, 71);
    const dens = Math.min(0.95, Math.max(0.035, (f + 0.14) * 2.6)) * density;
    if (r > dens) continue;
    const y = heightAt(x, z);
    if (y < 2.6 || y > 1150) continue;
    if (flatness(x, z) > 0.04) continue;
    if (Math.abs(heightAt(x + 8, z) - y) > 5 || Math.abs(heightAt(x, z + 8) - y) > 5) continue;
    const kind = y > 380 || rand2(gx, gz, 94) < 0.35 + f * 0.4 ? 'pine' : 'leaf';
    const sc = 1.1 + rand2(gx, gz, 95) * 1.1;
    q.setFromAxisAngle(up, r * 80);
    m.compose(p.set(x - cx * CH, y - 0.3, z - cz * CH), q, s.set(sc, sc * (0.85 + rand2(gx, gz, 96) * 0.4), sc));
    lists[kind].push(m.clone());
  }
  const grp = new THREE.Group();
  for (const k of ['pine', 'leaf']) {
    if (!lists[k].length) continue;
    const im = new THREE.InstancedMesh(TREE_GEO[k], TREE_MAT, lists[k].length);
    lists[k].forEach((mm, i) => im.setMatrixAt(i, mm));
    im.castShadow = true; im.receiveShadow = true;
    im.computeBoundingSphere();
    grp.add(im);
  }
  return grp;
}

// ------------------------------------------------------------------ water
function makeWater() {
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 }, sun: { value: SUN_DIR.clone() } }]),
    vertexShader: `#include <common>
      #include <fog_pars_vertex>
      #include <logdepthbuf_pars_vertex>
      varying vec3 vW;
      void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; vec4 mvPosition = viewMatrix*wp; gl_Position = projectionMatrix*mvPosition;
        #include <logdepthbuf_vertex>
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <common>
      #include <fog_pars_fragment>
      #include <logdepthbuf_pars_fragment>
      uniform float uTime; uniform vec3 sun; varying vec3 vW;
      ${GLSL_NOISE}
      float wave(vec2 p){ float t = uTime;
        return vn(p*0.045 + vec2(t*0.12, t*0.07)) + 0.5*vn(p*0.13 - vec2(t*0.17, -t*0.11)) + 0.28*vn(p*0.41 + vec2(-t*0.2, t*0.26)); }
      void main(){
        #include <logdepthbuf_fragment>
        vec3 V = cameraPosition - vW; float dist = length(V); V /= dist;
        float e = 0.7 + dist*0.004;
        float h0 = wave(vW.xz), hx = wave(vW.xz + vec2(e, 0.0)), hz = wave(vW.xz + vec2(0.0, e));
        float amp = 1.5/(1.0 + dist*0.0007);
        vec3 n = normalize(vec3((h0 - hx)*amp/e*1.2, 1.0, (h0 - hz)*amp/e*1.2));
        float fres = 0.04 + 0.96*pow(1.0 - max(dot(n, V), 0.0), 5.0);
        vec3 R = reflect(-V, n); R.y = abs(R.y);
        vec3 sky = mix(vec3(0.6, 0.75, 0.92), vec3(0.045, 0.2, 0.6), pow(R.y, 0.42));
        float s = max(dot(R, sun), 0.0);
        vec3 deep = mix(vec3(0.015, 0.14, 0.2), vec3(0.03, 0.26, 0.3), h0*0.4);
        vec3 col = mix(deep, sky, fres) + vec3(1.0, 0.92, 0.78)*(pow(s, 420.0)*9.0 + pow(s, 40.0)*0.22);
        col += vec3(0.9)*smoothstep(1.52, 1.72, h0)*0.25/(1.0 + dist*0.002);
        gl_FragColor = vec4(col, 0.8 + 0.2*fres);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  m.rotation.x = -Math.PI / 2; m.scale.setScalar(160000); m.renderOrder = 2; m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------ clouds
function puffTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  for (let i = 0; i < 34; i++) {
    const a = rand2(i, 3, 5) * 6.28, r = rand2(i, 7, 5) * 66, x = 128 + Math.cos(a) * r, y = 140 + Math.sin(a) * r * 0.5, rr = 30 + rand2(i, 9, 5) * 40;
    // Lit from above: lower puffs are a cooler grey so the cloud has a shaded base.
    const sh = Math.round(255 - Math.max(0, (y - 120) / 70) * 70);
    const gr = g.createRadialGradient(x, y - rr * 0.2, 0, x, y, rr);
    gr.addColorStop(0, `rgba(${sh},${sh},${Math.min(255, sh + 8)},0.62)`); gr.addColorStop(0.55, `rgba(${sh},${sh},${Math.min(255, sh + 8)},0.3)`); gr.addColorStop(1, `rgba(${sh},${sh},${sh},0)`);
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const CLOUD_TILE = 32000;

// ------------------------------------------------------------------ environment
export class Environment {
  constructor(scene, renderer, quality) {
    this.scene = scene; this.quality = quality;
    this.far = quality === 0 ? 7 : 10;      // view radius in chunks
    this.nearR = quality === 0 ? 1 : 2;
    this.n0 = quality === 0 ? 40 : 64; this.n1 = 14;
    this.treeDensity = quality === 0 ? 0.45 : quality === 1 ? 0.8 : 1;
    this.treeR = this.nearR + (quality === 2 ? 1 : 0);   // forests reach a little past the detailed terrain

    this.sky = makeSky(); scene.add(this.sky);
    scene.fog = new THREE.Fog(HORIZON, 4200, this.far * CH * 0.98);
    const pm = new THREE.PMREMGenerator(renderer);
    const es = new THREE.Scene(); const sk = makeSky(); sk.scale.setScalar(100); es.add(sk);
    scene.environment = pm.fromScene(es, 0.02).texture; scene.environmentIntensity = 0.55;
    pm.dispose();

    scene.add(new THREE.HemisphereLight(0xbcd6ff, 0x5d5a44, 0.4));
    const sun = this.sun = new THREE.DirectionalLight(0xfff0db, 3.3);
    sun.castShadow = quality > 0;
    sun.shadow.mapSize.setScalar(quality === 2 ? 4096 : 2048);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.06;
    scene.add(sun, sun.target);

    this.mat = terrainMaterial();
    this.chunks = new Map(); this.queue = []; this.center = null;
    this.water = makeWater(); scene.add(this.water);

    const tex = puffTexture();
    this.clouds = [];
    const n = quality === 0 ? 36 : 70;
    for (let i = 0; i < n; i++) {
      const bx = rand2(i, 1, 201) * CLOUD_TILE, bz = rand2(i, 2, 201) * CLOUD_TILE, by = 1300 + rand2(i, 3, 201) * 1500;
      const big = 0.7 + rand2(i, 4, 201) * 1.2;
      for (let k = 0; k < 7; k++) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, fog: true, opacity: 0.96, color: 0xffffff }));
        const s = (420 + rand2(i, k, 202) * 520) * big;
        sp.scale.set(s * 1.5, s, 1);
        sp.userData = { bx: bx + (rand2(i, k, 203) - 0.5) * 900 * big, bz: bz + (rand2(i, k, 204) - 0.5) * 600 * big, by: by + (rand2(i, k, 205) - 0.3) * 160 * big };
        sp.renderOrder = 3;
        scene.add(sp); this.clouds.push(sp);
      }
    }
  }

  // Shadows follow whatever the player is doing: tight in town, wider around a big aircraft.
  focusShadow(p, size) {
    const s = this.sun, c = s.shadow.camera;
    s.target.position.copy(p);
    s.position.copy(p).addScaledVector(SUN_DIR, 600);
    if (c.right !== size) { c.left = -size; c.right = size; c.top = size; c.bottom = -size; c.near = 10; c.far = 1400; c.updateProjectionMatrix(); }
  }

  update(cam, time, budgetMs = 5) {
    this.sky.position.copy(cam); this.sky.scale.setScalar(30000);
    this.water.position.set(cam.x, 0, cam.z);
    this.water.material.uniforms.uTime.value = time;
    for (const sp of this.clouds) {
      const u = sp.userData, wx = u.bx + time * 6;
      sp.position.set(wx + Math.round((cam.x - wx) / CLOUD_TILE) * CLOUD_TILE, u.by, u.bz + Math.round((cam.z - u.bz) / CLOUD_TILE) * CLOUD_TILE);
    }
    const ccx = Math.floor(cam.x / CH), ccz = Math.floor(cam.z / CH);
    if (!this.center || this.center[0] !== ccx || this.center[1] !== ccz) {
      this.center = [ccx, ccz];
      const want = new Map(), R = this.far;
      for (let j = -R; j <= R; j++) for (let i = -R; i <= R; i++) {
        if (i * i + j * j > R * R + 1) continue;
        want.set((ccx + i) + ',' + (ccz + j), { cx: ccx + i, cz: ccz + j, lod: Math.max(Math.abs(i), Math.abs(j)) <= this.nearR ? 0 : 1, trees: Math.max(Math.abs(i), Math.abs(j)) <= this.treeR, d: i * i + j * j });
      }
      for (const [k, c] of this.chunks) if (!want.has(k)) { this.drop(c); this.chunks.delete(k); }
      this.queue = [...want.entries()].filter(([k, wv]) => !this.chunks.has(k) || this.chunks.get(k).lod !== wv.lod || !!this.chunks.get(k).trees !== wv.trees).sort((a, b) => b[1].d - a[1].d);
    }
    const t0 = performance.now();
    while (this.queue.length && performance.now() - t0 < budgetMs) {
      const [k, wv] = this.queue.pop();
      const old = this.chunks.get(k);
      const mesh = new THREE.Mesh(buildChunkGeometry(wv.cx, wv.cz, wv.lod === 0 ? this.n0 : this.n1), this.mat);
      mesh.position.set(wv.cx * CH, 0, wv.cz * CH);
      mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.updateMatrix();
      const c = { lod: wv.lod, mesh, trees: null };
      if (wv.trees) { c.trees = buildTrees(wv.cx, wv.cz, this.treeDensity); c.trees.position.copy(mesh.position); this.scene.add(c.trees); }
      this.scene.add(mesh);
      if (old) this.drop(old);
      this.chunks.set(k, c);
    }
    return this.queue.length;
  }

  drop(c) {
    this.scene.remove(c.mesh); c.mesh.geometry.dispose();
    if (c.trees) { this.scene.remove(c.trees); c.trees.children.forEach(m => m.dispose()); }
  }
}
