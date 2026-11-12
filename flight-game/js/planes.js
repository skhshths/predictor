// Plane library, custom-plane parts, and the procedural mesh builder that turns a spec into a model.
import * as THREE from 'three';
import { derive } from './flight.js';

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const D2R = Math.PI / 180;

// ---------------------------------------------------------------------------------------------
// Library. Physics: m mass kg, S wing area m2, b span m, vmax m/s, twr static thrust/weight.
// ---------------------------------------------------------------------------------------------
export const CATEGORIES = ['Trainers', 'Bush & Float', 'Aerobatic', 'Classics', 'Jets', 'Heavies', 'Oddballs'];

function P(id, name, cat, blurb, p, vis) {
  const spec = {
    id, name, cat, blurb,
    mass: p.m, area: p.S, span: p.b, clmax: p.cl ?? 1.5, cd0: p.cd ?? 0.03, vmax: p.v, twr: p.t,
    pitchRate: p.pr, rollRate: p.rr, yawRate: p.yr, gLimit: p.g, crashVs: p.cv,
    jet: !!p.jet, retract: !!p.ret, floats: !!p.fl, tailwheel: vis.gear === 'tail', vis,
  };
  for (const k of Object.keys(spec)) if (spec[k] === undefined) delete spec[k];
  return derive(spec);
}

export const LIBRARY = [
  // Trainers
  P('sparrow', 'Sparrow T1', 'Trainers', 'Forgiving high-wing trainer. Everybody in Tailwind Bay learned on one.',
    { m: 760, S: 15, b: 10.6, cl: 1.6, cd: 0.034, v: 58, t: 0.3, rr: 1.3 },
    { len: 7.3, rad: 0.62, prof: 'ga', wing: { pos: 1, taper: 0.8, dih: 1 }, eng: 'nose', gear: 'tri', canopy: 'cabin', col: [0xf4f1ea, 0xf4f1ea, 0xc8452f] }),
  P('larkspur', 'Larkspur 180', 'Trainers', 'Low-wing tourer with retractable gear. Smooth, quick and easy to trim.',
    { m: 1050, S: 15.5, b: 10, cd: 0.027, v: 78, t: 0.32, rr: 1.6, ret: 1 },
    { len: 7.6, rad: 0.6, prof: 'ga', wing: { pos: -1, taper: 0.6, dih: 5 }, eng: 'nose', gear: 'tri', canopy: 'bubble', col: [0xe9eef2, 0x2c5d8a, 0x2c5d8a] }),
  P('dragonfly', 'Dragonfly UL', 'Trainers', 'Open-air ultralight with a pusher prop. Takes off at a jogging pace.',
    { m: 290, S: 14, b: 9.5, cl: 1.8, cd: 0.05, v: 33, t: 0.38, rr: 1.4, cv: 6.5 },
    { len: 5.6, rad: 0.42, prof: 'pod', podLen: 0.55, wing: { pos: 1, taper: 0.9, dih: 3 }, tail: 'boom', eng: 'pusher', gear: 'tri', canopy: 'bubble', col: [0xf2c230, 0xf7f3e6, 0x2b2b33] }),
  P('meadowlark', 'Meadowlark Twin', 'Trainers', 'Light twin for learning to juggle two throttles’ worth of power.',
    { m: 1900, S: 18.5, b: 11.8, cd: 0.028, v: 98, t: 0.34, rr: 1.4, ret: 1 },
    { len: 8.8, rad: 0.68, prof: 'ga', wing: { pos: -1, taper: 0.55, dih: 5 }, eng: 'wing2', gear: 'tri', canopy: 'cabin', col: [0xf1ede4, 0x8a2c2c, 0x8a2c2c] }),
  P('albatross', 'Albatross SG', 'Trainers', 'Motor glider with endless wings. Sips fuel and floats forever in the flare.',
    { m: 620, S: 17, b: 18, cl: 1.5, cd: 0.016, v: 58, t: 0.2, rr: 0.8, ret: 1 },
    { len: 7.8, rad: 0.5, prof: 'glider', wing: { pos: 0, taper: 0.4, dih: 3 }, tail: 't', eng: 'nose', gear: 'tri', canopy: 'bubble', col: [0xfafafa, 0xfafafa, 0x3a86c8] }),
  // Bush & Float
  P('marmot', 'Marmot', 'Bush & Float', 'Tundra-tyre bush plane. Lands on gravel bars, meadows and bad ideas.',
    { m: 800, S: 17, b: 10.8, cl: 2.0, cd: 0.04, v: 55, t: 0.42, rr: 1.4, cv: 8.5 },
    { len: 7, rad: 0.6, prof: 'ga', wing: { pos: 1, taper: 1, dih: 1 }, eng: 'nose', gear: 'tail', bigTires: 1, canopy: 'cabin', col: [0xd9a520, 0xd9a520, 0x26303a] }),
  P('otterling', 'Otterling', 'Bush & Float', 'Sturdy floatplane. Any lake, bay or inlet is a runway.',
    { m: 1450, S: 23, b: 14, cl: 1.8, cd: 0.045, v: 62, t: 0.36, rr: 1.1, fl: 1, cv: 7 },
    { len: 9.4, rad: 0.72, prof: 'ga', wing: { pos: 1, taper: 1, dih: 2 }, eng: 'nose', gear: 'floats', canopy: 'cabin', col: [0xf3efe6, 0xc23b22, 0xc23b22] }),
  P('pelican', 'Pelican Amphib', 'Bush & Float', 'Twin-engine flying boat with the engines up out of the spray.',
    { m: 2700, S: 30, b: 16, cl: 1.7, cd: 0.04, v: 76, t: 0.34, rr: 0.9, fl: 1, cv: 7 },
    { len: 11.5, rad: 0.9, hf: 1.1, prof: 'liner', wing: { pos: 1, taper: 0.7, dih: 2 }, tail: 't', eng: 'top2', gear: 'floats', canopy: 'liner', col: [0xf4f4f0, 0x1d6f8c, 0xf2a900] }),
  P('yakox', 'Pack Ox', 'Bush & Float', 'Single turboprop hauler. Carries a ton of cargo out of a short strip.',
    { m: 3300, S: 26, b: 15.8, cl: 1.9, cd: 0.036, v: 92, t: 0.36, rr: 1.0, cv: 7 },
    { len: 12, rad: 0.85, prof: 'ga', wing: { pos: 1, taper: 0.7, dih: 2 }, eng: 'nose', gear: 'tri', canopy: 'cabin', col: [0xe8e4da, 0x35553c, 0x35553c] }),
  P('stilt', 'Stiltwalker', 'Bush & Float', 'Extreme STOL machine on long legs. Lands in its own length.',
    { m: 480, S: 19, b: 10.5, cl: 2.5, cd: 0.05, v: 46, t: 0.5, rr: 1.5, cv: 9 },
    { len: 6.6, rad: 0.5, prof: 'ga', wing: { pos: 1, taper: 1, dih: 1 }, eng: 'nose', gear: 'tail', bigTires: 1, canopy: 'cabin', col: [0x3fa7a3, 0xf4f1ea, 0xf4f1ea] }),
  // Aerobatic
  P('zest', 'Zest 300', 'Aerobatic', 'Competition monoplane. Rolls faster than you can count.',
    { m: 650, S: 10, b: 7.4, cl: 1.5, cd: 0.03, v: 106, t: 0.6, pr: 2.2, rr: 6, yr: 1.1, g: 9 },
    { len: 6.6, rad: 0.5, prof: 'war', wing: { pos: 0, taper: 0.55 }, eng: 'nose', gear: 'tail', canopy: 'bubble', col: [0xd62828, 0xfafafa, 0x1b1b1f] }),
  P('jitterbug', 'Jitterbug', 'Aerobatic', 'Stubby aerobatic biplane. Snappy, loud and grinning.',
    { m: 620, S: 12, b: 6.2, cl: 1.6, cd: 0.042, v: 82, t: 0.55, pr: 2.0, rr: 4.6, yr: 1.2, g: 8 },
    { len: 5.8, rad: 0.5, prof: 'war', wing: { pos: -1, taper: 1, bi: 1 }, eng: 'nose', gear: 'tail', canopy: 'bubble', col: [0x1e4fa3, 0xf7c800, 0xf7c800] }),
  P('redwing', 'Redwing Racer', 'Aerobatic', 'Pylon racer with tiny wings and a huge engine. Lands fast.',
    { m: 720, S: 7, b: 6.4, cl: 1.3, cd: 0.022, v: 135, t: 0.6, pr: 1.6, rr: 4, g: 8, ret: 1 },
    { len: 6.4, rad: 0.48, prof: 'war', wing: { pos: -1, taper: 0.5, dih: 3 }, eng: 'nose', gear: 'tail', canopy: 'bubble', col: [0xb3202a, 0xb3202a, 0xf5f0e1] }),
  P('corkscrew', 'Corkscrew V', 'Aerobatic', 'V-tail show plane built for smoke and spirals.',
    { m: 700, S: 11, b: 8, cl: 1.5, cd: 0.027, v: 100, t: 0.5, pr: 2.0, rr: 4.4, yr: 0.9, g: 8 },
    { len: 6.8, rad: 0.5, prof: 'war', wing: { pos: -1, taper: 0.6, dih: 4 }, tail: 'v', eng: 'nose', gear: 'tri', canopy: 'bubble', col: [0x6a2fa0, 0xfafafa, 0x2ec4b6] }),
  // Classics
  P('tigerlily', 'Tigerlily', 'Classics', 'Open-cockpit biplane from the barnstorming days. Wind in the wires.',
    { m: 820, S: 22, b: 8.9, cl: 1.7, cd: 0.05, v: 48, t: 0.3, rr: 1.2, cv: 6.5 },
    { len: 7.3, rad: 0.52, prof: 'war', wing: { pos: -1, taper: 1, bi: 1, dih: 2 }, eng: 'nose', gear: 'tail', canopy: 'none', col: [0xe0b030, 0xe0b030, 0x8a4b1e] }),
  P('petrel', 'Stormpetrel II', 'Classics', 'Piston fighter with elliptical wings and a twelve-cylinder growl.',
    { m: 2900, S: 22.5, b: 11.2, cl: 1.5, cd: 0.022, v: 165, t: 0.45, pr: 1.5, rr: 2.6, g: 8, ret: 1 },
    { len: 9.4, rad: 0.58, prof: 'war', wing: { pos: -1, taper: 0.45, dih: 5 }, eng: 'nose', gear: 'tail', canopy: 'bubble', col: [0x4b5d43, 0x6b6f4f, 0xd8d2c0] }),
  P('longhorn', 'Longhorn', 'Classics', 'Twin-boom, twin-engine heavy fighter. Fast, long-legged and unmistakable.',
    { m: 6400, S: 30.5, b: 15.8, cl: 1.5, cd: 0.024, v: 182, t: 0.42, pr: 1.2, rr: 1.8, g: 7, ret: 1 },
    { len: 11.5, rad: 0.6, prof: 'pod', podLen: 0.55, wing: { pos: 0, taper: 0.4, dih: 4 }, tail: 'boom', eng: 'wing2', boomAt: 0.3, gear: 'tri', canopy: 'bubble', col: [0xb8bcc2, 0xb8bcc2, 0xd4a017] }),
  P('baron', 'Mail Baron', 'Classics', 'Corrugated trimotor that opened the first air-mail routes.',
    { m: 5200, S: 55, b: 22, cl: 1.7, cd: 0.045, v: 70, t: 0.3, pr: 0.8, rr: 0.7, cv: 6.5 },
    { len: 15, rad: 0.95, hf: 1.15, prof: 'liner', wing: { pos: 1, taper: 0.5, dih: 2 }, eng: 'tri', gear: 'tail', canopy: 'liner', col: [0xa9adb3, 0xa9adb3, 0x23395b] }),
  P('comet', 'Comet Racer', 'Classics', 'Sleek 1930s twin built to win long-distance air races.',
    { m: 2400, S: 20, b: 13.4, cd: 0.022, v: 108, t: 0.36, rr: 1.5, ret: 1 },
    { len: 8.8, rad: 0.55, prof: 'war', wing: { pos: -1, taper: 0.4, dih: 4 }, eng: 'wing2', gear: 'tail', canopy: 'bubble', col: [0xc41e3a, 0xc41e3a, 0xf8f4e3] }),
  // Jets
  P('swift', 'Swift J2', 'Jets', 'Tandem jet trainer. Your first taste of kerosene.',
    { m: 2600, S: 17, b: 9.6, cl: 1.5, cd: 0.021, v: 215, t: 0.45, pr: 1.5, rr: 3, g: 7.5, jet: 1, ret: 1 },
    { len: 10.6, rad: 0.62, prof: 'jet', wing: { pos: -1, taper: 0.5, sweep: 12, dih: 3 }, eng: 'tail1', gear: 'tri', canopy: 'bubble', col: [0xf4f4f4, 0xe2572b, 0xe2572b] }),
  P('arrowhead', 'Arrowhead', 'Jets', 'Swept-wing fighter. Point it somewhere and you are already there.',
    { m: 7200, S: 27, b: 9.4, cl: 1.3, cd: 0.019, v: 330, t: 0.72, pr: 1.6, rr: 4, g: 9, jet: 1, ret: 1 },
    { len: 14.5, rad: 0.78, prof: 'jet', wing: { pos: 0, taper: 0.3, sweep: 40 }, eng: 'tail1', gear: 'tri', canopy: 'bubble', col: [0x7d8790, 0x7d8790, 0x2f3a45] }),
  P('kite', 'Kite Delta', 'Jets', 'Tailless delta interceptor. Climbs like a rocket, lands like a brick.',
    { m: 8200, S: 38, b: 8.6, cl: 1.15, cd: 0.017, v: 420, t: 0.88, pr: 1.4, rr: 3.4, g: 8, jet: 1, ret: 1 },
    { len: 15, rad: 0.8, prof: 'jet', wing: { pos: -1, taper: 0.06, sweep: 56, z: 0.12 }, tail: 'fin', eng: 'tail1', gear: 'tri', canopy: 'bubble', col: [0xc9ced4, 0xc9ced4, 0x1f4e8c] }),
  P('twinfire', 'Twinfire', 'Jets', 'Twin-engine, twin-tail air superiority jet. More thrust than weight.',
    { m: 13500, S: 52, b: 12.4, cl: 1.4, cd: 0.02, v: 440, t: 1.05, pr: 1.7, rr: 3.8, g: 9, jet: 1, ret: 1 },
    { len: 18.5, rad: 0.95, wf: 1.5, hf: 0.8, prof: 'jet', wing: { pos: 0, taper: 0.25, sweep: 38 }, tail: 'twin', eng: 'tail2', gear: 'tri', canopy: 'bubble', col: [0x8e9aa6, 0x7b8894, 0x39424c] }),
  P('breeze', 'Breeze 6', 'Jets', 'Six-seat business jet. Quiet, slippery and very comfortable.',
    { m: 6200, S: 25, b: 14.2, cl: 1.5, cd: 0.02, v: 240, t: 0.38, pr: 1.0, rr: 1.6, jet: 1, ret: 1 },
    { len: 14.5, rad: 0.85, prof: 'liner', wing: { pos: -1, taper: 0.4, sweep: 18, dih: 4 }, tail: 't', eng: 'rear2', gear: 'tri', canopy: 'liner', col: [0xfafafa, 0xfafafa, 0x1c2b4a] }),
  P('puffin', 'Puffin Microjet', 'Jets', 'One seat, one tiny turbine. The smallest jet on the field.',
    { m: 420, S: 6, b: 5.2, cl: 1.4, cd: 0.022, v: 140, t: 0.5, pr: 1.9, rr: 4.5, g: 8, jet: 1, ret: 1 },
    { len: 4.2, rad: 0.42, prof: 'jet', wing: { pos: -1, taper: 0.6, sweep: 6, dih: 3 }, tail: 'v', eng: 'tail1', gear: 'tri', canopy: 'bubble', col: [0xf7f7f2, 0xf58220, 0x16161a] }),
  P('gyre', 'Gyre X', 'Jets', 'Experimental forward-swept jet. Looks wrong, turns right.',
    { m: 6400, S: 28, b: 9.8, cl: 1.5, cd: 0.02, v: 380, t: 0.85, pr: 2.0, rr: 4.4, g: 9, jet: 1, ret: 1 },
    { len: 14, rad: 0.75, prof: 'jet', wing: { pos: 0, taper: 0.4, sweep: -28, z: 0.14 }, eng: 'tail1', gear: 'tri', canopy: 'bubble', col: [0x15171c, 0x15171c, 0xe63946] }),
  // Heavies
  P('freighter', 'Skyfreighter 40', 'Heavies', 'Twin turboprop regional. Forty seats and a very patient crew.',
    { m: 13500, S: 56, b: 26, cl: 1.8, cd: 0.027, v: 142, t: 0.38, pr: 0.7, rr: 0.8, ret: 1, cv: 6 },
    { len: 23, rad: 1.3, prof: 'liner', wing: { pos: 1, taper: 0.5, dih: 2 }, tail: 't', eng: 'wing2', gear: 'tri', canopy: 'liner', col: [0xfafafa, 0xfafafa, 0x00796b] }),
  P('cumulus2', 'Cumulus 220', 'Heavies', 'Twin-jet airliner. Use every metre of the long runway.',
    { m: 60000, S: 125, b: 34, cl: 1.9, cd: 0.021, v: 250, t: 0.37, pr: 0.55, rr: 0.6, g: 3, jet: 1, ret: 1, cv: 6 },
    { len: 37, rad: 1.95, prof: 'liner', wing: { pos: -1, taper: 0.28, sweep: 25, dih: 5 }, eng: 'wing2', gear: 'tri', canopy: 'liner', col: [0xfafafa, 0xdfe5ea, 0x1f5fa8] }),
  P('cumulus4', 'Cumulus 480', 'Heavies', 'Four-engine widebody. The biggest thing that fits at Tailwind Bay.',
    { m: 240000, S: 510, b: 60, cl: 2.0, cd: 0.02, v: 262, t: 0.36, pr: 0.45, rr: 0.45, g: 2.8, jet: 1, ret: 1, cv: 6 },
    { len: 68, rad: 3.2, prof: 'liner', wing: { pos: -1, taper: 0.25, sweep: 32, dih: 6 }, eng: 'wing4', gear: 'tri', canopy: 'liner', col: [0xfafafa, 0xdfe5ea, 0xb5232b] }),
  P('atlas', 'Atlas Hauler', 'Heavies', 'Four-turboprop military transport. Flies low, slow and heavy.',
    { m: 58000, S: 162, b: 40, cl: 2.1, cd: 0.03, v: 172, t: 0.4, pr: 0.6, rr: 0.6, g: 3, ret: 1, cv: 6.5 },
    { len: 30, rad: 2.1, prof: 'liner', wing: { pos: 1, taper: 0.5, dih: 1 }, eng: 'wing4', gear: 'tri', canopy: 'liner', col: [0x6d7468, 0x6d7468, 0x3c4039] }),
  // Oddballs
  P('boomerang', 'Boomerang', 'Oddballs', 'Flying wing with no tail at all. Graceful once you trust it.',
    { m: 3000, S: 46, b: 17, cl: 1.3, cd: 0.014, v: 195, t: 0.4, pr: 1.0, rr: 1.8, yr: 0.3, jet: 1, ret: 1 },
    { len: 6.5, rad: 0.7, wf: 1.6, hf: 0.75, prof: 'pod', wing: { pos: 0, taper: 0.25, sweep: 30, z: 0.05 }, tail: 'none', eng: 'tail2', gear: 'tri', canopy: 'bubble', col: [0x2b2f36, 0x2b2f36, 0xf2a900] }),
  P('duckling', 'Duckling', 'Oddballs', 'Twin-boom pusher with a view like a glass balcony.',
    { m: 900, S: 15, b: 10.5, cl: 1.6, cd: 0.032, v: 66, t: 0.34, rr: 1.4 },
    { len: 7.4, rad: 0.62, prof: 'pod', podLen: 0.55, wing: { pos: 1, taper: 0.8, dih: 2 }, tail: 'boom', eng: 'pusher', gear: 'tri', canopy: 'bubble', col: [0xf5f5f0, 0x4aa3df, 0xf06c9b] }),
  P('teacup', 'Teacup', 'Oddballs', 'A racing barrel with wings. More engine than aeroplane.',
    { m: 560, S: 6.5, b: 5.2, cl: 1.4, cd: 0.03, v: 118, t: 0.7, pr: 2.2, rr: 5, g: 9 },
    { len: 4.4, rad: 0.72, prof: 'war', wing: { pos: 0, taper: 0.8 }, eng: 'nose', gear: 'tail', canopy: 'bubble', col: [0xffd23f, 0x1b1b1f, 0xee4266] }),
];

// ---------------------------------------------------------------------------------------------
// Custom plane parts
// ---------------------------------------------------------------------------------------------
export const SLOTS = ['engine', 'wings', 'tail', 'gear', 'paint'];
export const SLOT_NAMES = { engine: 'Engine', wings: 'Wings', tail: 'Tail', gear: 'Landing gear', paint: 'Paint', extra: 'Extras' };

export const PARTS = [
  // Engines: thrust N (static), vz m/s (speed at which thrust runs out), mass kg
  { id: 'e_sputter', slot: 'engine', name: 'Sputter 65', price: 0, blurb: 'Two cylinders and a lot of hope. It runs.', thrust: 1700, vz: 78, mass: 70, eng: 'nose' },
  { id: 'e_brisk', slot: 'engine', name: 'Brisk 120', price: 450, blurb: 'Flat-four with real climb power.', thrust: 2700, vz: 100, mass: 95, eng: 'nose' },
  { id: 'e_gale', slot: 'engine', name: 'Gale 220 Radial', price: 1200, blurb: 'Seven-cylinder radial. Pulls hard, sounds better.', thrust: 4300, vz: 122, mass: 150, eng: 'nose', propR: 1.25 },
  { id: 'e_push', slot: 'engine', name: 'Backdraft Pusher', price: 1700, blurb: 'Mounted behind the pod under the boom. Clean air over the nose.', thrust: 4000, vz: 150, mass: 125, eng: 'pusher', cd: -0.003 },
  { id: 'e_twin', slot: 'engine', name: 'Twin Zephyrs', price: 2600, blurb: 'One on each wing. Twice the noise, twice the pull.', thrust: 6200, vz: 140, mass: 230, eng: 'wing2' },
  { id: 'e_turbo', slot: 'engine', name: 'Whistler Turboprop', price: 4500, blurb: 'Turbine smooth with a five-blade prop.', thrust: 8600, vz: 190, mass: 165, eng: 'nose', propR: 1.3, blades: 5 },
  { id: 'e_jet', slot: 'engine', name: 'Ember J-1 Jet', price: 9000, blurb: 'A small turbojet slung under the boom. Hold on to your hat.', thrust: 9500, vz: 520, mass: 240, eng: 'boomjet', jet: true },
  // Wings
  { id: 'w_plank', slot: 'wings', name: 'Plank Wings', price: 0, blurb: 'Straight, simple, a bit draggy.', area: 11, span: 8.6, clmax: 1.35, cd: 0.014, roll: 1.0, mass: 90, wing: { pos: 0, taper: 1, dih: 2 } },
  { id: 'w_tour', slot: 'wings', name: 'Tourer Wings', price: 500, blurb: 'Tapered and efficient. A proper all-rounder.', area: 13.5, span: 10, clmax: 1.5, cd: 0.008, roll: 1.4, mass: 100, wing: { pos: -1, taper: 0.6, dih: 5 } },
  { id: 'w_bush', slot: 'wings', name: 'Bush Wings', price: 1100, blurb: 'High-mounted with slats. Flies slower than a bicycle.', area: 17, span: 11, clmax: 2.0, cd: 0.013, roll: 1.2, mass: 125, wing: { pos: 1, taper: 1, dih: 1 } },
  { id: 'w_bi', slot: 'wings', name: 'Biplane Stack', price: 1500, blurb: 'Two short wings. Tight turns, lots of wire.', area: 18, span: 7.2, clmax: 1.6, cd: 0.02, roll: 2.8, mass: 120, wing: { pos: -1, taper: 1, bi: 1 } },
  { id: 'w_soar', slot: 'wings', name: 'Soaring Wings', price: 2000, blurb: 'Long and slender. Glides for miles on idle.', area: 15.5, span: 16, clmax: 1.55, cd: 0.004, roll: 0.8, mass: 120, wing: { pos: 0, taper: 0.4, dih: 3 } },
  { id: 'w_race', slot: 'wings', name: 'Racer Clipped', price: 2400, blurb: 'Short and thin. Fast everywhere, including the approach.', area: 8.2, span: 6.4, clmax: 1.3, cd: 0.004, roll: 3.6, mass: 75, wing: { pos: -1, taper: 0.5, dih: 3 } },
  { id: 'w_delta', slot: 'wings', name: 'Swept Arrow', price: 5200, blurb: 'Swept for speed. Wants a big engine.', area: 14, span: 7.6, clmax: 1.25, cd: 0.002, roll: 3.2, mass: 95, wing: { pos: -1, taper: 0.3, sweep: 38, z: 0.03 }, thin: true },
  // Tails
  { id: 't_stick', slot: 'tail', name: 'Stick Tail', price: 0, blurb: 'Small surfaces on a prayer.', pitch: 0.8, yaw: 0.4, stab: 1.8, cd: 0.004, tail: 'std', tsize: 0.75 },
  { id: 't_classic', slot: 'tail', name: 'Classic Tail', price: 350, blurb: 'Sensible fin and stabiliser. Steady and predictable.', pitch: 1.2, yaw: 0.6, stab: 2.4, cd: 0.003, tail: 'std' },
  { id: 't_tee', slot: 'tail', name: 'T-Tail', price: 900, blurb: 'Stabiliser up in clean air. Crisp pitch feel.', pitch: 1.45, yaw: 0.65, stab: 2.4, cd: 0.002, tail: 't' },
  { id: 't_vee', slot: 'tail', name: 'V-Tail', price: 1300, blurb: 'Two surfaces doing the work of three. Less drag.', pitch: 1.5, yaw: 0.5, stab: 2.2, cd: 0.0005, tail: 'v' },
  { id: 't_twin', slot: 'tail', name: 'Twin Fins', price: 1800, blurb: 'Two rudders in the prop wash. Great on the ground.', pitch: 1.5, yaw: 1.0, stab: 2.6, cd: 0.003, tail: 'twin' },
  { id: 't_aero', slot: 'tail', name: 'Aerobat Tail', price: 2600, blurb: 'Huge surfaces for loops, spins and hammerheads.', pitch: 2.2, yaw: 1.3, stab: 2.2, cd: 0.004, tail: 'std', tsize: 1.3 },
  // Gear
  { id: 'g_fixed', slot: 'gear', name: 'Fixed Tricycle', price: 0, blurb: 'Three wheels, always down.', cd: 0.01, gear: 'tri', crashVs: 5.5 },
  { id: 'g_tundra', slot: 'gear', name: 'Tundra Tyres', price: 400, blurb: 'Balloon tyres that shrug off rough landings.', cd: 0.014, gear: 'tail', bigTires: 1, crashVs: 9, mass: 20 },
  { id: 'g_spats', slot: 'gear', name: 'Speed Taildragger', price: 600, blurb: 'Light tailwheel gear. Less drag than the trike.', cd: 0.006, gear: 'tail', crashVs: 5.5, mass: -10 },
  { id: 'g_floats', slot: 'gear', name: 'Amphibious Floats', price: 1500, blurb: 'Land on water or on a runway.', cd: 0.02, gear: 'floats', crashVs: 7, mass: 70, floats: true },
  { id: 'g_retract', slot: 'gear', name: 'Retractable Gear', price: 2800, blurb: 'Tucks away after take-off. Press G.', cd: 0, gear: 'tri', crashVs: 5.5, mass: 25, retract: true },
  // Paint
  { id: 'p_tinker', slot: 'paint', name: 'Workshop Teal', price: 0, blurb: 'The colour it left the shed in.', col: [0x2a9d8f, 0xf4f1de, 0xe76f51] },
  { id: 'p_sun', slot: 'paint', name: 'Sunrise', price: 120, blurb: 'Yellow over orange.', col: [0xffb703, 0xfb8500, 0x023047] },
  { id: 'p_mail', slot: 'paint', name: 'Air Mail', price: 150, blurb: 'Postal red with cream wings.', col: [0xb5232b, 0xf3e9d2, 0x1d3557] },
  { id: 'p_night', slot: 'paint', name: 'Night Owl', price: 200, blurb: 'Matte black, gold trim.', col: [0x1b1c22, 0x2a2c35, 0xe9b949] },
  { id: 'p_sky', slot: 'paint', name: 'Skywriter', price: 150, blurb: 'White and sky blue.', col: [0xfafafa, 0x4ea8de, 0x1d3557] },
  { id: 'p_moss', slot: 'paint', name: 'Bushline', price: 150, blurb: 'Moss green and bare metal.', col: [0x4f6f52, 0xb9bec4, 0xe9c46a] },
  { id: 'p_candy', slot: 'paint', name: 'Bubblegum', price: 220, blurb: 'Pink, mint and proud of it.', col: [0xff70a6, 0x70d6ff, 0xffd670] },
  { id: 'p_chrome', slot: 'paint', name: 'Polished Metal', price: 600, blurb: 'Bare aluminium, buffed until it mirrors the clouds.', col: [0xd7dbe0, 0xd7dbe0, 0xc1121f], metal: true },
  // Extras (all owned extras are fitted)
  { id: 'x_smoke', slot: 'extra', name: 'Smoke System', price: 700, blurb: 'Draw in the sky. Press X in flight.' },
  { id: 'x_vortex', slot: 'extra', name: 'Vortex Generators', price: 900, blurb: 'Tiny tabs that delay the stall.', clmax: 0.18 },
  { id: 'x_light', slot: 'extra', name: 'Featherweight Kit', price: 1500, blurb: 'Titanium bolts, thin seats, no cup holder.', mass: -70 },
  { id: 'x_seal', slot: 'extra', name: 'Gap Seals & Fairings', price: 1300, blurb: 'Tape and fairings over every draggy gap.', cd: -0.004 },
];
export const PART = Object.fromEntries(PARTS.map(p => [p.id, p]));

export const DEFAULT_LOADOUT = { engine: 'e_sputter', wings: 'w_plank', tail: 't_stick', gear: 'g_fixed', paint: 'p_tinker', extras: [] };

// Assemble the custom plane's spec from its fitted parts.
export function customSpec(lo, name = 'The Tinker') {
  const e = PART[lo.engine], w = PART[lo.wings], t = PART[lo.tail], g = PART[lo.gear], p = PART[lo.paint];
  const ex = (lo.extras || []).map(id => PART[id]);
  const sum = k => ex.reduce((a, x) => a + (x[k] || 0), 0);
  const spec = {
    id: 'custom', name, cat: 'Custom', custom: true,
    blurb: 'Your own aeroplane, built around a one-of-a-kind pod-and-boom body.',
    mass: 330 + e.mass + w.mass + (g.mass || 0) + sum('mass'),
    area: w.area, span: w.span, clmax: w.clmax + sum('clmax'),
    cd0: Math.max(0.014, 0.02 + w.cd + t.cd + g.cd + (e.cd || 0) + sum('cd')),
    thrust: e.thrust, vz: e.vz, jet: !!e.jet,
    pitchRate: t.pitch, yawRate: t.yaw, rollRate: w.roll, stab: t.stab, gLimit: 7,
    crashVs: g.crashVs, retract: !!g.retract, floats: !!g.floats, tailwheel: g.gear === 'tail',
    smoke: (lo.extras || []).includes('x_smoke'),
    vis: {
      len: 6.4, rad: 0.72, prof: 'tinker', wing: { ...w.wing }, thin: w.thin, tail: t.tail, tsize: t.tsize,
      eng: e.eng, propR: e.propR, blades: e.blades, gear: g.gear, bigTires: g.bigTires,
      canopy: 'tinker', col: p.col, metal: p.metal,
    },
  };
  return derive(spec);
}

// ---------------------------------------------------------------------------------------------
// Mesh builder
// ---------------------------------------------------------------------------------------------
// Fuselage profiles: [t along length 0..1, radius factor, vertical offset factor]
const PROFILES = {
  ga: [[0, 0.5, 0], [0.04, 0.72, 0], [0.2, 1, 0], [0.42, 1, 0.04], [0.7, 0.5, 0.2], [1, 0.14, 0.34]],
  war: [[0, 0.62, 0], [0.06, 0.92, 0], [0.3, 1, 0], [0.6, 0.72, 0.06], [1, 0.12, 0.18]],
  glider: [[0, 0.3, -0.1], [0.06, 0.7, 0], [0.2, 1, 0], [0.36, 0.9, 0.05], [0.55, 0.35, 0.2], [1, 0.14, 0.3]],
  jet: [[0, 0.03, -0.1], [0.07, 0.36, -0.05], [0.2, 0.8, 0], [0.38, 1, 0], [0.75, 1, 0], [1, 0.72, 0.03]],
  liner: [[0, 0.1, -0.25], [0.03, 0.55, -0.12], [0.09, 0.92, -0.02], [0.14, 1, 0], [0.7, 1, 0], [0.87, 0.6, 0.25], [1, 0.12, 0.5]],
  pod: [[0, 0.2, -0.1], [0.08, 0.7, -0.03], [0.3, 1, 0], [0.62, 0.95, 0], [0.88, 0.6, 0.05], [1, 0.25, 0.08]],
  tinker: [[0, 0.3, -0.15], [0.06, 0.78, -0.06], [0.2, 1, 0], [0.36, 0.96, 0.06], [0.48, 0.5, 0.36], [0.6, 0.22, 0.52], [1, 0.13, 0.56]],
  nacelle: [[0, 0.55, 0], [0.12, 1, 0], [0.6, 0.95, 0], [1, 0.3, 0]],
  jetpod: [[0, 0.82, 0], [0.1, 1, 0], [0.65, 1, 0], [1, 0.68, 0]],
  float: [[0, 0.15, 0.5], [0.12, 0.85, 0.1], [0.45, 1, 0], [0.75, 0.75, 0.1], [1, 0.15, 0.4]],
  boom: [[0, 0.9, 0], [0.2, 1, 0], [1, 0.6, 0]],
};

function loft(prof, len, rad, wf = 1, hf = 1, seg = 18) {
  const pos = [], idx = [];
  for (const [t, r, yo] of prof) {
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * r * rad * wf, yo * rad + Math.sin(a) * r * rad * hf, t * len);
    }
  }
  const n = prof.length;
  for (let i = 0; i < n - 1; i++) {
    for (let k = 0; k < seg; k++) {
      const a = i * seg + k, b = i * seg + ((k + 1) % seg), c = a + seg, d = b + seg;
      idx.push(a, b, c, b, d, c);
    }
  }
  const c0 = pos.length / 3; pos.push(0, prof[0][2] * rad, 0);
  const c1 = c0 + 1; pos.push(0, prof[n - 1][2] * rad, len);
  for (let k = 0; k < seg; k++) {
    idx.push(c0, (k + 1) % seg, k);
    idx.push(c1, (n - 1) * seg + k, (n - 1) * seg + ((k + 1) % seg));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function profAt(prof, t) {
  for (let i = 0; i < prof.length - 1; i++) {
    const a = prof[i], b = prof[i + 1];
    if (t <= b[0]) { const u = (t - a[0]) / (b[0] - a[0]); return [lerp(a[1], b[1], u), lerp(a[2], b[2], u)]; }
  }
  const l = prof[prof.length - 1];
  return [l[1], l[2]];
}

// A tapered aerofoil panel from a root to a tip (leading edge points), growing along +X.
const TH = [0.4, 1, 0.9, 0.55, 0.08];
function panel(root, rc, tip, tc, thick) {
  const g = new THREE.BoxGeometry(1, 1, 1, 1, 1, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) + 0.5, v = p.getY(i), w = p.getZ(i) + 0.5;
    const c = lerp(rc, tc, u);
    p.setXYZ(i, lerp(root[0], tip[0], u), lerp(root[1], tip[1], u) + v * thick * c * TH[Math.round(w * 4)], lerp(root[2], tip[2], u) + w * c);
  }
  g.computeVertexNormals();
  return g;
}

function mirrored(geo, mat) {
  const g = new THREE.Group();
  const r = new THREE.Mesh(geo, mat), l = new THREE.Mesh(geo, mat);
  l.scale.x = -1;
  g.add(r, l);
  return g;
}

function materials(v) {
  const m = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, metalness: v.metal ? 0.95 : 0.3, roughness: v.metal ? 0.16 : 0.42, ...o });
  return {
    body: m(v.col[0]), wing: m(v.col[1]), accent: m(v.col[2]),
    dark: new THREE.MeshStandardMaterial({ color: 0x17171b, roughness: 0.85 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: 0.9, roughness: 0.3 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x1a2b3c, metalness: 0.9, roughness: 0.06, transparent: true, opacity: 0.82 }),
    glow: () => new THREE.MeshBasicMaterial({ color: 0xff9b3d, transparent: true, opacity: 0 }),
    disc: new THREE.MeshBasicMaterial({ color: 0x222222, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false }),
  };
}

export function buildPlane(spec) {
  const v = spec.vis, len = v.len, rad = v.rad, wf = v.wf ?? 1, hf = v.hf ?? 1;
  const M = materials(v);
  const g = new THREE.Group();
  const out = { group: g, rotors: [], discs: [], glows: [], gearGroup: new THREE.Group(), len, span: spec.span };
  const prof = PROFILES[v.prof];
  const podLen = len * (v.podLen ?? 1);
  const z0 = -0.42 * len, zAt = t => z0 + t * len;
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };

  add(loft(prof, podLen, rad, wf, hf), M.body, 0, 0, z0);
  const tailSec = profAt(prof, 1);
  const tailY = v.podLen ? 0 : tailSec[1] * rad;
  const tz = zAt(1);

  // --- wings
  const W = v.wing ?? {};
  const span = spec.span, half = span / 2, taper = W.taper ?? 0.6;
  const rc = ((2 * spec.area) / (span * (1 + taper))) * (W.bi ? 0.55 : 1), tc = rc * taper;
  const wpos = W.pos ?? -1;
  const wy = wpos > 0 ? rad * hf * 0.86 : wpos < 0 ? -rad * hf * 0.62 : 0;
  const wz = (W.z ?? 0) * len - rc * 0.35;
  const sweepOff = Math.tan((W.sweep ?? 0) * D2R) * half, dihRise = Math.tan((W.dih ?? 0) * D2R) * half;
  const wthick = spec.jet || v.thin ? 0.07 : 0.13;
  g.add(mirrored(panel([0, wy, wz], rc, [half, wy + dihRise, wz + sweepOff], tc, wthick), M.wing));
  if (W.bi) {
    const uy = rad * hf + rad * 0.95, uz = wz - rc * 0.45;
    g.add(mirrored(panel([0, uy, uz], rc, [half * 1.05, uy, uz], tc, wthick), M.wing));
    for (const sx of [-1, 1]) {
      for (const f of [0.25, 0.75]) {
        const s = add(new THREE.BoxGeometry(0.05, uy - wy, 0.09), M.metal, sx * half * 0.62, (uy + wy) / 2, wz + rc * f - rc * 0.22);
        s.rotation.x = -0.25;
      }
      add(new THREE.BoxGeometry(0.05, uy - rad * hf * 0.7, 0.08), M.metal, sx * rad * 0.5, (uy + rad * hf * 0.7) / 2, uz + rc * 0.4);
    }
  }
  const wingAt = f => [f * half, wy + dihRise * f, wz + sweepOff * f, lerp(rc, tc, f)];

  // --- tail
  const ts = v.tsize ?? 1;
  const hSpan = Math.max(span * 0.33, rad * 3.6) * ts, hc = Math.max(rc * 0.55, rad * 0.9) * (ts * 0.5 + 0.5);
  const fh = Math.max(rad * 2.1, span * 0.115) * ts, fc = Math.max(rc * 0.8, rad * 1.5) * (ts * 0.5 + 0.5);
  const fin = (x, y, z, h = fh, c = fc, mat = M.accent) => {
    const m = add(panel([0, 0, 0], c, [h, 0, c * 0.55], c * 0.45, 0.1), mat, x, y, z);
    m.rotation.z = Math.PI / 2;
    return m;
  };
  const hstab = (y, z, sp = hSpan) => g.add(mirrored(panel([0, y, z], hc, [sp / 2, y, z + hc * 0.3], hc * 0.6, 0.09), M.accent));
  const tail = v.tail ?? 'std';
  if (tail === 'std') { hstab(tailY, tz - hc * 1.1); fin(0, tailY, tz - fc * 1.1); }
  else if (tail === 'fin') { fin(0, tailY + rad * 0.4, tz - fc * 1.5, fh * 1.25, fc * 1.4); }
  else if (tail === 't') { fin(0, tailY, tz - fc * 1.15); hstab(tailY + fh, tz - fc * 1.15 + fc * 0.55); }
  else if (tail === 'v') {
    g.add(mirrored(panel([0, tailY, tz - hc * 1.2], hc * 1.1, [hSpan * 0.42, tailY + hSpan * 0.36, tz - hc * 0.7], hc * 0.6, 0.09), M.accent));
  } else if (tail === 'twin') {
    hstab(tailY, tz - hc * 1.1);
    const fx = v.wf ? rad * wf * 0.75 : hSpan * 0.48;
    for (const sx of [-1, 1]) { const f = fin(sx * fx, tailY, tz - fc * 1.2, fh * 0.9); f.rotation.y = 0; if (v.wf) f.rotation.z = Math.PI / 2 - sx * 0.2; }
  } else if (tail === 'none') {
    for (const sx of [-1, 1]) fin(sx * half, wy + dihRise, wz + sweepOff, rad * 1.2, tc * 0.9);
  } else if (tail === 'boom') {
    const bf = v.boomAt ?? 0.24;
    const [bx, by, bz] = wingAt(bf);
    const bl = tz - bz;
    for (const sx of [-1, 1]) {
      add(loft(PROFILES.boom, bl, rad * 0.24), M.body, sx * bx, by, bz);
      fin(sx * bx, by, tz - fc * 1.05, fh * 0.9);
    }
    g.add(new THREE.Mesh(panel([-bx, by + fh * 0.45, tz - hc * 1.05], hc, [bx, by + fh * 0.45, tz - hc * 1.05], hc, 0.09), M.accent));
  }

  // --- canopy
  const canopy = v.canopy ?? 'bubble';
  const sphere = new THREE.SphereGeometry(1, 20, 12);
  if (canopy === 'bubble') {
    const t = v.prof === 'jet' ? 0.3 : v.prof === 'pod' ? 0.3 : 0.36;
    const [r, yo] = profAt(prof, t * (len / podLen > 1 ? 1 : 1));
    const c = add(sphere, M.glass, 0, yo * rad + r * rad * hf * 0.62, z0 + t * podLen);
    c.scale.set(rad * wf * 0.58 / (wf > 1.2 ? wf : 1), rad * hf * 0.62, Math.min(podLen * 0.16, rad * 2.6));
  } else if (canopy === 'cabin') {
    const c = add(sphere, M.glass, 0, rad * hf * 0.42, z0 + 0.3 * len);
    c.scale.set(rad * wf * 0.88, rad * hf * 0.62, len * 0.13);
  } else if (canopy === 'tinker') {
    const c = add(sphere, M.glass, 0, rad * 0.38, z0 + 0.2 * len);
    c.scale.set(rad * 0.86, rad * 0.8, len * 0.15);
    // Dorsal scoop and porthole rims make the body recognisable from any angle.
    const sc = add(loft(PROFILES.jetpod, len * 0.16, rad * 0.26), M.accent, 0, rad * 1.0, z0 + 0.3 * len);
    sc.rotation.x = -0.25;
    for (const sx of [-1, 1]) {
      const rim = add(new THREE.TorusGeometry(rad * 0.24, rad * 0.05, 8, 20), M.metal, sx * rad * 0.9, -rad * 0.12, z0 + 0.34 * len);
      rim.rotation.y = Math.PI / 2 + sx * 0.25;
    }
  } else if (canopy === 'liner') {
    const c = add(sphere, M.glass, 0, rad * hf * 0.3, zAt(0.055));
    c.scale.set(rad * 0.7, rad * 0.42, len * 0.035);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(rad * 0.06, rad * 0.13, len * 0.5), M.glass, sx * rad * wf * 0.955, rad * hf * 0.25, zAt(0.42));
    const stripe = add(new THREE.BoxGeometry(rad * wf * 2.02, rad * 0.1, len * 0.56), M.accent, 0, -rad * hf * 0.1, zAt(0.42));
    stripe.scale.x = 0.992;
  }

  // --- engines
  const propUnit = (r, blades = 3) => {
    const u = new THREE.Group(), rotor = new THREE.Group();
    const sp = new THREE.Mesh(new THREE.ConeGeometry(r * 0.17, r * 0.42, 14), M.accent);
    sp.rotation.x = -Math.PI / 2; sp.position.z = -r * 0.15;
    rotor.add(sp);
    for (let i = 0; i < blades; i++) {
      const piv = new THREE.Group();
      const b = new THREE.Mesh(new THREE.BoxGeometry(r * 0.13, r, 0.03), M.dark);
      b.position.y = r / 2; b.rotation.y = 0.35;
      piv.add(b); piv.rotation.z = (i / blades) * Math.PI * 2;
      rotor.add(piv);
    }
    const disc = new THREE.Mesh(new THREE.CircleGeometry(r, 28), M.disc);
    disc.visible = false;
    u.add(rotor, disc);
    out.rotors.push(rotor); out.discs.push(disc);
    return u;
  };
  const jetPod = (L, r, x, y, z) => {
    add(loft(PROFILES.jetpod, L, r), M.body, x, y, z);
    add(new THREE.CircleGeometry(r * 0.72, 18), M.dark, x, y, z - 0.01).rotation.y = Math.PI;
    const gl = add(new THREE.CircleGeometry(r * 0.6, 18), M.glow(), x, y, z + L + 0.02);
    out.glows.push(gl);
  };
  const eng = v.eng ?? 'nose';
  let noseProp = 0, lowest = -rad * hf;
  const propR = v.propR ?? clamp(rad * 1.55, 0.75, 2.1);
  if (eng === 'nose' || eng === 'tri') {
    noseProp = propR;
    const u = propUnit(propR, v.blades ?? (propR > 1.5 ? 4 : 3));
    u.position.set(0, prof[0][2] * rad, z0 - 0.04);
    g.add(u);
  }
  if (eng === 'wing2' || eng === 'wing4' || eng === 'tri' || eng === 'top2') {
    const fr = eng === 'wing4' ? [0.24, 0.5] : [eng === 'tri' ? 0.34 : 0.3];
    for (const f of fr) for (const sx of [-1, 1]) {
      const [x, y, z, c] = wingAt(f);
      if (spec.jet) {
        const r = rad * 0.44, L = Math.max(c * 0.95, r * 3.4);
        const py = y - r * 1.45;
        jetPod(L, r, sx * x, py, z - L * 0.55);
        add(new THREE.BoxGeometry(r * 0.25, r * 1.2, L * 0.6), M.wing, sx * x, y - r * 0.5, z + L * 0.05);
        lowest = Math.min(lowest, py - r);
      } else {
        const r = rad * 0.4, L = c * 1.15, ny = eng === 'top2' ? y + r * 1.9 : y + (wpos > 0 ? -r * 0.5 : r * 0.15);
        const pr = clamp(rad * 1.25, 0.7, 2.6);
        add(loft(PROFILES.nacelle, L, r), M.body, sx * x, ny, z - L * 0.45);
        if (eng === 'top2') add(new THREE.BoxGeometry(r * 0.3, r * 1.6, L * 0.4), M.wing, sx * x, y + r * 0.8, z + L * 0.1);
        const u = propUnit(pr, pr > 1.6 ? 4 : 3);
        u.position.set(sx * x, ny, z - L * 0.45 - 0.05);
        g.add(u);
        lowest = Math.min(lowest, ny - pr);
      }
    }
  }
  if (eng === 'rear2') {
    const r = rad * 0.46, L = len * 0.17;
    for (const sx of [-1, 1]) {
      jetPod(L, r, sx * (rad * wf + r * 0.85), rad * 0.35, zAt(0.66));
      add(new THREE.BoxGeometry(r * 1.2, r * 0.25, L * 0.5), M.body, sx * rad * wf * 0.95, rad * 0.35, zAt(0.66) + L * 0.5);
    }
  }
  if (eng === 'tail1' || eng === 'tail2') {
    const xs = eng === 'tail2' ? [-rad * wf * 0.45, rad * wf * 0.45] : [0];
    const r = eng === 'tail2' ? rad * hf * 0.6 : rad * 0.6;
    for (const x of xs) {
      const nz = add(new THREE.CylinderGeometry(r, r * 0.85, rad * 0.8, 16, 1, true), M.dark, x, tailSec[1] * rad, z0 + podLen + rad * 0.2);
      nz.rotation.x = Math.PI / 2; nz.material = M.metal;
      out.glows.push(add(new THREE.CircleGeometry(r * 0.8, 18), M.glow(), x, tailSec[1] * rad, z0 + podLen + rad * 0.45));
    }
    if (v.prof === 'jet') for (const sx of [-1, 1]) {
      const it = add(loft(PROFILES.jetpod, len * 0.3, rad * 0.42, 0.8, 1), M.body, sx * rad * wf * 0.88, -rad * hf * 0.1, zAt(0.3));
      add(new THREE.CircleGeometry(rad * 0.3, 14), M.dark, sx * rad * wf * 0.88, -rad * hf * 0.1, zAt(0.3) - 0.01).rotation.y = Math.PI;
      it.castShadow = true;
    }
  }
  if (eng === 'pusher') {
    const pr = clamp(rad * 1.3, 0.7, 1.2);
    const tinker = v.prof === 'tinker';
    const pz = tinker ? zAt(0.52) : z0 + podLen + 0.1, py = tinker ? -rad * 0.05 : rad * 0.15;
    if (tinker) add(loft(PROFILES.nacelle, len * 0.14, rad * 0.4), M.accent, 0, py, zAt(0.4)).scale.z = 1;
    const u = propUnit(pr, 3);
    u.rotation.y = Math.PI; u.position.set(0, py, pz + (tinker ? len * 0.03 : 0));
    g.add(u);
  }
  if (eng === 'boomjet') {
    const r = rad * 0.42, L = len * 0.3;
    jetPod(L, r, 0, -rad * 0.1, zAt(0.46));
  }

  // --- landing gear
  const gg = out.gearGroup; g.add(gg);
  const wr = clamp(rad * 0.36, 0.16, 0.8) * (v.bigTires ? 1.75 : 1);
  const belly = rad * hf;
  let leg = Math.max(rad * 0.5, noseProp - belly + 0.3, -lowest - belly + 0.35);
  if (v.bigTires) leg += 0.15;
  const wheelY = -(belly + leg);
  const wheel = (x, z, r = wr, top = -belly * 0.5) => {
    const w = add(new THREE.CylinderGeometry(r, r, r * 0.55, 18), M.dark, x, wheelY + (wr - r), z, gg);
    w.rotation.z = Math.PI / 2;
    const hub = add(new THREE.CylinderGeometry(r * 0.45, r * 0.45, r * 0.6, 12), M.metal, x, wheelY + (wr - r), z, gg);
    hub.rotation.z = Math.PI / 2;
    const h = top - (wheelY + (wr - r));
    add(new THREE.CylinderGeometry(rad * 0.07 + 0.02, rad * 0.07 + 0.02, h, 8), M.metal, x * 0.97, top - h / 2, z, gg);
  };
  const track = clamp(span * 0.11, rad * 1.2, rad * 2.2 + 1.5);
  if (v.gear === 'floats') {
    const fr = rad * 0.46, fl = len * 0.78, fy = wheelY + wr - fr;
    for (const sx of [-1, 1]) {
      add(loft(PROFILES.float, fl, fr, 1, 0.85), M.wing, sx * track * 1.1, fy, z0 + len * 0.02, gg);
      for (const zf of [0.22, 0.5]) {
        const s = add(new THREE.BoxGeometry(0.07, -fy - belly * 0.3, 0.14), M.metal, sx * track * 0.8, (fy - belly * 0.3) / 2, zAt(zf), gg);
        s.rotation.z = sx * 0.3;
      }
    }
  } else if (v.gear === 'tail') {
    for (const sx of [-1, 1]) wheel(sx * track, -0.1 * len + wz * 0.3);
    wheel(0, zAt(0.93), wr * 0.4, tailSec[1] * rad);
  } else {
    wheel(0, zAt(0.13), wr * 0.85);
    for (const sx of [-1, 1]) wheel(sx * track, len * 0.07, wr, wpos < 0 ? wy : -belly * 0.5);
    if (len > 25) for (const sx of [-1, 1]) wheel(sx * track * 0.55, len * 0.09);
  }
  out.gearH = belly + leg + wr;
  out.bellyH = Math.max(belly, -lowest) + 0.05;

  g.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  return out;
}

// Per-frame visuals: spinning props, jet glow, gear doors.
export function animatePlane(b, thr, gear, dt, running) {
  const rpm = running ? 14 + thr * 60 : 0;
  for (const r of b.rotors) r.rotation.z -= rpm * dt;
  for (const d of b.discs) d.visible = rpm > 30;
  for (const r of b.rotors) for (let i = 1; i < r.children.length; i++) r.children[i].visible = rpm < 55;
  for (const gl of b.glows) gl.material.opacity = running ? 0.25 + thr * 0.75 : 0;
  b.gearGroup.visible = gear > 0.5;
  b.gearGroup.scale.y = clamp(gear * 2 - 1, 0.01, 1);
}
