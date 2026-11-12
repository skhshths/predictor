// Flight model. Body axes follow three.js: forward is -Z, right is +X, up is +Y.
// Angular velocity is in body axes: +x pitches the nose up, +y yaws left, +z rolls left.
import { Vector3, Quaternion, Euler } from 'three';

const G = 9.81, RHO0 = 1.225;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;

function dragAt(s, v) {
  const q = 0.5 * RHO0 * v * v;
  const cl = (s.mass * G) / (q * s.area);
  return q * s.area * (s.cd0 + (cl * cl) / (Math.PI * s.ar * 0.8));
}

// Fill in everything the simulation needs from a short spec.
// Library planes give `vmax` + `twr`; the custom plane gives engine `thrust` + `vz` directly.
export function derive(s) {
  s.ar = (s.span * s.span) / s.area;
  s.cla ??= clamp((2 * Math.PI * s.ar) / (s.ar + 2.5), 2.6, 5.4);
  s.cl0 ??= 0.2;
  s.pitchRate ??= 1.2; s.rollRate ??= 1.6; s.yawRate ??= 0.5;
  s.gLimit ??= 5; s.stab ??= 2.2; s.crashVs ??= 5.5;
  s.vstall = Math.sqrt((2 * s.mass * G) / (RHO0 * s.area * s.clmax));
  if (s.vmax && s.twr) {
    let ts = s.twr * s.mass * G;
    const d = dragAt(s, s.vmax);
    if (d > 0.85 * ts) ts = d / 0.85;
    s.thrust = ts;
    s.vz = s.vmax / (1 - d / ts);
  } else {
    // Solve thrust(v) = drag(v) for the top level speed.
    let lo = s.vstall, hi = s.vz;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (s.thrust * (1 - m / s.vz) > dragAt(s, m)) lo = m; else hi = m;
    }
    s.vmax = lo;
  }
  const vt = Math.max(0.72 * s.vmax, 1.35 * s.vstall);
  s.alphaTrim = ((s.mass * G) / (0.5 * RHO0 * vt * vt * s.area) - s.cl0) / s.cla;
  s.qRef = 0.5 * RHO0 * (1.4 * s.vstall) ** 2;
  // Best sea-level climb rate, for the stat cards.
  let best = 0;
  for (let v = s.vstall * 1.1; v < s.vmax; v += 2) {
    best = Math.max(best, ((s.thrust * (1 - v / s.vz) - dragAt(s, v)) * v) / (s.mass * G));
  }
  s.climb = best;
  return s;
}

const fwd = new Vector3(), up = new Vector3(), right = new Vector3();
const vb = new Vector3(), velDir = new Vector3(), liftDir = new Vector3();
const force = new Vector3(), tmp = new Vector3(), qi = new Quaternion(), dq = new Quaternion();
const eul = new Euler(0, 0, 0, 'YXZ');

export class Aircraft {
  constructor(spec) {
    this.spec = spec;
    this.pos = new Vector3(); this.vel = new Vector3();
    this.quat = new Quaternion(); this.omega = new Vector3();
    this.thr = 0; this.flaps = 0; this.flapsSet = 0; this.gear = 1; this.gearDown = true;
    this.trim = 0; this.onGround = true; this.crashed = null;
    this.aTrim = spec.alphaTrim; this.alpha = 0; this.gload = 1; this.stalled = false; this.ias = 0; this.touchdown = 0; this.onWater = false;
  }

  place(x, y, z, heading, speed = 0) {
    this.pos.set(x, y + this.spec.gearH, z);
    this.quat.setFromEuler(eul.set(0, -heading, 0));
    this.vel.set(Math.sin(heading), 0, -Math.cos(heading)).multiplyScalar(speed);
    this.omega.set(0, 0, 0);
    this.thr = 0; this.flaps = this.flapsSet = 0; this.gear = 1; this.gearDown = true;
    this.trim = 0; this.aTrim = this.spec.alphaTrim; this.onGround = speed === 0; this.crashed = null; this.stalled = false;
  }

  get heading() {
    fwd.set(0, 0, -1).applyQuaternion(this.quat);
    return (Math.atan2(fwd.x, -fwd.z) + Math.PI * 2) % (Math.PI * 2);
  }
  get pitch() { return eul.setFromQuaternion(this.quat).x; }
  get bank() { return -eul.setFromQuaternion(this.quat).z; }

  // c: {pitch, roll, yaw in -1..1, throttle 0..1, brake 0..1, assist bool}
  step(dt, c, heightAt) {
    if (this.crashed) return;
    const s = this.spec, q = this.quat;
    this.thr += clamp(c.throttle - this.thr, -dt * (s.jet ? 0.45 : 0.9), dt * (s.jet ? 0.45 : 0.9));
    this.flaps += clamp(this.flapsSet / 2 - this.flaps, -dt * 0.4, dt * 0.4);
    if (s.retract) this.gear += clamp((this.gearDown ? 1 : 0) - this.gear, -dt * 0.5, dt * 0.5);
    else { this.gear = 1; this.gearDown = true; }

    fwd.set(0, 0, -1).applyQuaternion(q);
    up.set(0, 1, 0).applyQuaternion(q);
    right.set(1, 0, 0).applyQuaternion(q);
    const V = this.vel.length();
    qi.copy(q).invert();
    vb.copy(this.vel).applyQuaternion(qi);
    const moving = V > 2;
    const alpha = moving ? Math.atan2(-vb.y, -vb.z) : 0;
    const sinB = moving ? clamp(vb.x / V, -1, 1) : 0;
    const rho = RHO0 * Math.exp(-Math.max(0, this.pos.y) / 9000);
    const qd = 0.5 * rho * V * V;
    this.ias = V * Math.sqrt(rho / RHO0);

    // Lift curve: linear up to the stall, then blends into a flat plate.
    const fl = this.flaps;
    const clmax = s.clmax + 0.55 * fl, cl0 = s.cl0 + 0.35 * fl;
    const aS = (clmax - cl0) / s.cla, aN = -(0.7 * s.clmax + cl0) / s.cla;
    const plate = 0.95 * Math.sin(2 * alpha);
    let CL, post = 0;
    if (alpha > aS) { post = Math.min((alpha - aS) / 0.3, 1); CL = lerp(clmax, plate, post); }
    else if (alpha < aN) { post = Math.min((aN - alpha) / 0.3, 1); CL = lerp(cl0 + s.cla * aN, plate, post); }
    else CL = cl0 + s.cla * alpha;
    const sa = Math.sin(alpha);
    const CD = s.cd0 + (CL * CL) / (Math.PI * s.ar * 0.8) + fl * 0.045 + (s.retract ? 0.014 * this.gear : 0)
      + post * 1.3 * sa * sa + 0.5 * sinB * sinB;
    this.alpha = alpha; this.stalled = post > 0.05 && !this.onGround && V > 5;

    force.set(0, 0, 0);
    if (moving) {
      velDir.copy(this.vel).multiplyScalar(1 / V);
      liftDir.crossVectors(right, velDir).normalize();
      force.addScaledVector(liftDir, qd * s.area * CL);
      force.addScaledVector(velDir, -qd * s.area * CD);
      force.addScaledVector(right, -qd * s.area * 1.1 * sinB);
    }
    const lift = qd * s.area * CL;
    const thrust = s.thrust * this.thr * Math.max(0.04, 1 - V / s.vz) * Math.pow(rho / RHO0, 0.8);
    force.addScaledVector(fwd, thrust);
    this.gload = force.dot(up) / (s.mass * G);
    force.y -= s.mass * G;

    // Rotation: the stick commands body rates, scaled by how much air is over the controls.
    const eff = clamp(qd / s.qRef, 0, 1.3), effS = Math.min(eff, 1);
    let p = c.pitch;
    if (!this.onGround) {
      if (p > 0) p *= clamp((aS + 0.03 - alpha) / 0.12, 0, 1);
      else if (p < 0) p *= clamp((alpha - aN + 0.03) / 0.12, 0, 1);
      // Auto-trim: while you are steering, the trimmed angle of attack follows the aeroplane,
      // so letting go holds the speed you were flying instead of diving for the cruise speed.
      if (Math.abs(c.pitch) > 0.04) this.aTrim += (clamp(alpha, -0.03, aS * 0.8) - this.aTrim) * Math.min(1, 2.5 * dt);
    }
    const maxPitch = Math.min(s.pitchRate, (s.gLimit * G) / Math.max(V, 25));
    let tx = p * maxPitch * eff, ty = -c.yaw * s.yawRate * eff, tz = -c.roll * s.rollRate * eff;
    if (V > 8) {
      tx -= s.stab * (alpha - this.aTrim - this.trim) * effS + post * 0.7;
      const beta = Math.asin(sinB);
      ty -= 2.2 * beta * effS;
      tz += 0.7 * beta * effS;
    }
    if (c.assist && Math.abs(c.roll) < 0.05 && !this.onGround) {
      const bank = this.bank;
      if (Math.abs(bank) < 0.6) tz += bank * 1.2 * effS;
    }
    const k = Math.min(1, 4.5 * (0.08 + eff) * dt);
    this.omega.x += (tx - this.omega.x) * k;
    this.omega.y += (ty - this.omega.y) * k;
    this.omega.z += (tz - this.omega.z) * k;

    this.vel.addScaledVector(force, dt / s.mass);
    this.pos.addScaledVector(this.vel, dt);
    const w = this.omega.length();
    if (w > 1e-6) {
      dq.setFromAxisAngle(tmp.copy(this.omega).multiplyScalar(1 / w), w * dt);
      q.multiply(dq).normalize();
    }

    // Ground and water contact.
    const gh = heightAt(this.pos.x, this.pos.z);
    const water = gh < 0;
    const surf = Math.max(gh, 0);
    const clearance = this.gear > 0.5 || s.floats ? s.gearH : s.bellyH;
    if (this.pos.y - clearance <= surf) {
      eul.setFromQuaternion(q);
      if (!this.onGround) {
        const vs = -this.vel.y;
        if (water && !s.floats) return this.crash('Ditched in the water');
        if (vs > s.crashVs) return this.crash('Hit the ground too hard');
        if (Math.abs(eul.z) > 0.6 || eul.x < -0.3) return this.crash('Touched down out of shape');
        if (!s.floats && this.gear < 0.5) return this.crash('Landed with the gear up');
        if (!water) {
          const slope = Math.abs(heightAt(this.pos.x + fwd.x * 6, this.pos.z + fwd.z * 6) - gh) / 6;
          if (slope > 0.45 && V > 15) return this.crash('Flew into a hillside');
        }
        this.touchdown = vs;
        this.onGround = true;
      }
      this.onWater = water;
      this.pos.y = surf + clearance;
      if (this.vel.y < 0) this.vel.y = 0;
      const hl = Math.hypot(fwd.x, fwd.z) || 1;
      const fx = fwd.x / hl, fz = fwd.z / hl;
      let vf = this.vel.x * fx + this.vel.z * fz;
      let vl = this.vel.x * -fz + this.vel.z * fx;
      vl *= Math.exp(-(water ? 3 : 10) * dt);
      const wow = clamp(1 - lift / (s.mass * G), 0, 1);
      if (water) vf *= Math.exp(-0.35 * wow * dt);
      const dec = (0.02 + c.brake * (water ? 0.15 : 0.5)) * G * dt * wow;
      vf -= Math.sign(vf) * Math.min(Math.abs(vf), dec);
      this.vel.x = fx * vf - fz * vl;
      this.vel.z = fz * vf + fx * vl;
      // Hold the wings level, keep the nose off the ground, steer with the rudder.
      const rest = s.tailwheel ? 0.16 * (1 - clamp(V / (0.55 * s.vstall), 0, 1)) : 0;
      eul.z *= Math.exp(-8 * dt);
      if (eul.x < rest) { eul.x = Math.min(rest, eul.x + dt * 0.6); if (this.omega.x < 0) this.omega.x = 0; }
      if (eul.x > rest + 0.3) { eul.x = rest + 0.3; if (this.omega.x > 0) this.omega.x = 0; }
      eul.y -= c.yaw * clamp(Math.abs(vf) / 5, 0, 1) * clamp(14 / (Math.abs(vf) + 1), 0.12, 0.9) * dt * Math.sign(vf || 1);
      q.setFromEuler(eul);
      this.omega.y = 0; this.omega.z = 0;
    } else if (this.pos.y - clearance > surf + 0.15) {
      this.onGround = false; this.onWater = false;
    }
  }

  crash(reason) {
    this.crashed = reason;
    this.vel.set(0, 0, 0); this.omega.set(0, 0, 0);
  }
}
