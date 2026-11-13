# Tailwind Bay

A 3D flying game that runs in a browser or as a Windows `.exe`.

You live in a small airfield town. Walk the main street, talk to the people who live there, borrow any of 33 aeroplanes from the hangar, and build up your own plane by buying parts in the shops. Every part is bolted onto the aeroplane the moment you pay for it.

- **33 aeroplanes** in seven classes, from an ultralight to a four-engine airliner and a Mach-1.3 fighter.
- **Your own plane**, "The Tinker", built around a one-of-a-kind pod-and-boom body. 37 parts across engines, wings, tails, landing gear, paint and extras.
- **A large world**: streamed terrain with sea, coast, forest and 2,900 m mountains, and nine airfields up to 25 km from home.
- **A town to walk around**: 12 townsfolk and 8 airstrip keepers to talk to, five part shops, a café, a post office, a hangar and a control tower.
- **Three ways to fly**: keyboard, mouse (aim or yoke), and joystick / HOTAS / pedals / gamepad with full rebinding.
- **No build step and no downloads at run time.** Everything is generated in code: models, terrain, textures and sound.

This game lives in its own folder and does not touch the RAR Predictor app in the rest of this repository. It is not part of the Cloudflare deployment.

---

## Contents

- [Run it](#run-it)
- [The Windows .exe](#the-windows-exe)
- [How to play](#how-to-play)
- [Controls](#controls)
- [Joystick, HOTAS, pedals and gamepads](#joystick-hotas-pedals-and-gamepads)
- [The aeroplanes](#the-aeroplanes)
- [Building your own plane](#building-your-own-plane)
- [The world](#the-world)
- [Earning coins](#earning-coins)
- [Graphics settings](#graphics-settings)
- [Flight model](#flight-model)
- [Project structure](#project-structure)
- [Saving](#saving)
- [What was tested](#what-was-tested)
- [Troubleshooting](#troubleshooting)
- [Credits and licence](#credits-and-licence)

---

## Run it

The game is plain HTML and JavaScript modules. It needs a local web server, because browsers will not load JavaScript modules straight from a `file://` path.

From this folder:

```bash
npm install
```

```bash
npm start
```

That serves the folder on `http://localhost:8080` and opens it. Any static server works just as well, for example:

```bash
npx http-server . -p 8080
```

Use a current Chrome, Edge or Firefox with hardware acceleration switched on. Chrome or Edge is the best choice for joysticks.

To run it as a desktop window without building anything:

```bash
npm run desktop
```

## The Windows .exe

`npm run dist:win` builds a single portable `TailwindBay.exe` (about 75 MB) in `dist/`. It needs no installer and no internet connection. Double-click it to play.

```bash
npm install
```

```bash
npm run dist:win
```

This works on Windows, macOS and Linux. On Linux and macOS no Wine is needed.

There is also a GitHub Actions workflow, **Build Tailwind Bay .exe** (`.github/workflows/tailwind-bay-exe.yml`). Run it from the repository's Actions tab and download `TailwindBay.exe` from the run's artifacts. It only runs when you start it by hand.

Things to know about the `.exe`:

- It is **not code-signed**. Windows SmartScreen will show "Windows protected your PC" the first time. Choose **More info**, then **Run anyway**.
- It is a self-extracting portable build, so the first start takes a few seconds while it unpacks.
- **F11** or **Alt+Enter** toggles full screen.
- It asks Windows for the high-performance GPU on laptops that have two.
- The `.exe` is not committed to the repository, because a 75 MB binary would bloat every clone. Build it, or download it from the workflow.

The desktop shell is `desktop/main.js`: an Electron window that serves the same game files through a private `app://` scheme. The browser and desktop versions are the same game.

## How to play

1. Press **Start**. You begin on foot at the edge of town.
2. Click the view to capture the mouse, then walk with **W A S D**. Press **E** next to a person to talk, or next to an aeroplane to board it.
3. **Captain Ines** stands in front of the hangar. She opens the hangar, where you pick any aeroplane. It is rolled out onto the apron, ready to board.
4. Your own plane is parked on the apron next to it.
5. In the aeroplane: throttle up with **R** (or **Shift**, the mouse wheel, or your throttle lever), steer along the taxiway with **Q / E**, or press **Backspace** to be placed on the runway.
6. Full throttle, keep straight, and ease the nose up at about 1.2 times the stall speed shown under the speed read-out.
7. To land: throttle back, flaps down (**V**), cross the runway threshold about a third faster than stall speed, and hold the nose up until the wheels touch. Brake with **B** or **Space**.
8. When stopped, press **Enter** to climb out. You can get out and walk at any airfield.

If you crash, you are towed back to the home runway at no charge.

## Controls

Every menu works with the mouse, the keyboard (arrow keys, Enter, Esc) and a controller (d-pad, hat or stick, plus select and back buttons).

### On foot

| Key | Action |
| --- | --- |
| W A S D or arrows | Walk |
| Shift | Run |
| Space | Hop |
| Mouse | Look around (click the view first; or hold a mouse button and drag) |
| E or Enter | Talk to a person, board an aeroplane |
| Esc | Pause menu |

### Flying

| Key | Action |
| --- | --- |
| W / S, Up / Down | Nose down / nose up |
| A / D, Left / Right | Roll left / right |
| Q / E | Rudder. Also steers on the ground |
| R / F | Throttle up / down. Also Shift, = and −, Page Up and Page Down, mouse wheel |
| 1 … 9, 0 | Set throttle to 10% … 90%, 100% |
| G | Landing gear (retractable gear only) |
| V | Flaps: up, half, full |
| B or Space | Wheel brakes |
| , and . | Pitch trim down / up |
| C | Camera: chase, cockpit, wide |
| M | Mouse flying mode: aim, yoke, off |
| X | Smoke, once the Smoke System is fitted to your plane |
| Enter | Leave the aeroplane when it is stopped |
| Backspace | Jump back to the home runway |
| H | Help |
| Esc or P | Pause menu |

Ctrl is deliberately unused, so Ctrl+W can never close the tab mid-flight.

### Mouse flying

- **Aim** (default). Move the mouse to point a yellow circle where you want to go. The aeroplane banks and pulls onto it by itself. This is the easiest way to fly with a mouse.
- **Yoke**. The mouse is the control stick: left and right roll, forward and back pitch. A small box shows the stick position. Middle-click centres it.
- **Off**. The mouse only looks around.

Hold the **right mouse button** to look around without steering. The mouse wheel moves the throttle.

Mouse aim takes over when you move the mouse, and hands back to the keyboard or stick as soon as you use them. If the browser will not capture the mouse, aim mode falls back to steering by how far the pointer is from the centre of the screen.

**Flight assist** (on by default, for keyboard and mouse only) gently levels the wings when you let go of the roll keys. Switch it off in Controls.

## Joystick, HOTAS, pedals and gamepads

The game reads controllers through the browser's Gamepad API. It handles any number of devices at once, so a separate stick, throttle and pedals work together.

Plug a device in and press any button on it. Browsers hide controllers until then. It is picked up without restarting.

What happens automatically the first time a device is seen:

| Device | Default binding |
| --- | --- |
| Joystick | Axis 0 roll, axis 1 pitch. Twist rudder on axis 5 (or 3, or 2, depending on how many axes it has). Throttle slider on axis 6 (or 2 / 3). Hat switch on axis 9 for looking around and menus. Trigger is brakes, button 2 interact, then gear, flaps, camera and free look |
| Separate throttle unit (name contains "throttle", "TWCS" or "quadrant") | Axis 2 becomes the throttle and replaces the stick's slider. First three buttons are gear, flaps and camera |
| Rudder pedals (name contains "pedal" or "rudder") | Axis 2 becomes the rudder and replaces the stick's twist. Axis 1 becomes the toe brake |
| Standard gamepad | Left stick roll and pitch, right stick rudder. Triggers move the throttle up and down. A interact, B brakes, X gear, Y flaps, LB camera, hold RB to look with the right stick, Start pause, Back reset, d-pad for menus |

Throttle levers are **absolute**: the lever position is the throttle setting. Keys, triggers and the mouse wheel nudge it instead.

Axis numbering differs between manufacturers and browsers, so the defaults are a starting guess. To set things up properly, open **Controls** from the title screen or the pause menu:

- **Controllers** shows every connected device with a live bar for each axis and a light for each button, so you can see which physical control is which.
- Press **Bind** next to an action, then move the axis or press the button you want. Binding waits eight seconds and then gives up.
- **Normal / Inverted** flips an axis. Use it if your throttle runs backwards.
- **Clear** unbinds an action. **Reset bindings** starts again.
- **Stick dead zone** and **Stick response curve** apply to roll, pitch, rudder and look axes. The throttle has neither.

Bindings are saved per device name, so each controller keeps its own setup. A dedicated throttle or pedal unit only replaces a binding the game guessed. It never replaces one you made yourself.

On foot with a joystick: stick forward walks, stick sideways strafes, twist turns, and the hat looks around.

## The aeroplanes

All 33 are available from the start. Speeds are top speed in level flight at sea level.

| Class | Aeroplanes |
| --- | --- |
| Trainers | Sparrow T1 (113 kt), Larkspur 180 (152 kt), Dragonfly UL (64 kt), Meadowlark Twin (190 kt), Albatross SG motor glider (113 kt) |
| Bush & Float | Marmot (107 kt), Otterling floatplane (121 kt), Pelican Amphib flying boat (148 kt), Pack Ox (179 kt), Stiltwalker (89 kt) |
| Aerobatic | Zest 300 (206 kt), Jitterbug biplane (159 kt), Redwing Racer (262 kt), Corkscrew V (194 kt) |
| Classics | Tigerlily biplane (93 kt), Stormpetrel II fighter (321 kt), Longhorn twin-boom fighter (354 kt), Mail Baron trimotor (136 kt), Comet Racer (210 kt) |
| Jets | Swift J2 (418 kt), Arrowhead (641 kt), Kite Delta (816 kt), Twinfire (855 kt), Breeze 6 business jet (467 kt), Puffin Microjet (272 kt), Gyre X (739 kt) |
| Heavies | Skyfreighter 40 (276 kt), Cumulus 220 airliner (486 kt), Cumulus 480 widebody (509 kt), Atlas Hauler (334 kt) |
| Oddballs | Boomerang flying wing (379 kt), Duckling twin-boom pusher (128 kt), Teacup (229 kt) |

Floatplanes (Otterling, Pelican Amphib) land on water as well as on runways. Any other aeroplane that touches water is ditched. Bush planes survive much harder landings than the rest.

The heavies need the long home runway and full flaps. They will not stop on the short strips.

## Building your own plane

Your plane starts with the weakest part in every slot. It flies, but slowly. Talk to a shopkeeper on the main street to open their shop. The camera circles your plane while you browse, each part shows what it would change (top speed, stall speed, climb, roll, mass), and **Buy** puts it on the aeroplane immediately. Parts you own can be swapped back for free.

| Shop | Keeper | Sells |
| --- | --- | --- |
| Piston & Thunder | Marta | Engines: Sputter 65, Brisk 120, Gale 220 Radial, Backdraft Pusher, Twin Zephyrs, Whistler Turboprop, Ember J-1 Jet |
| Wing Works | Odalys | Wings: Plank, Tourer, Bush, Biplane Stack, Soaring, Racer Clipped, Swept Arrow |
| Rudder & Wheel | Fenwick | Tails: Stick, Classic, T-Tail, V-Tail, Twin Fins, Aerobat. Gear: Fixed Tricycle, Tundra Tyres, Speed Taildragger, Amphibious Floats, Retractable |
| Splash Paint | Bo | Eight paint schemes, including polished bare metal |
| Odds & Props | Juniper | Extras: Smoke System, Vortex Generators, Featherweight Kit, Gap Seals & Fairings |

Parts change the model and the flying together. A bigger wing really does lower the stall speed, the jet engine really is slung under the tail boom, and floats really let you land on the bay.

Prices run from 120 coins (paint) to 9,000 coins (the jet engine). You start with 600.

Rename your plane in the hangar. Ask Captain Ines to bring it home if you left it at another airfield.

## The world

The terrain is generated from a fixed seed, so it is the same world every time. It is streamed in around you and has no edge. Home sits on a peninsula with a bay to the south-east, mountain ranges to the east and south, and open sea to the north.

| Airfield | From home | Runway | Notes |
| --- | --- | --- | --- |
| Tailwind Bay | 0 km | 3,000 m | Home. Town, hangar, tower |
| Gull Rock | 7.7 km south-west | 900 m | On the shoreline |
| Pinewatch | 11.7 km north-east | 1,000 m | Coastal, under the eastern ridge |
| Fennel Cove | 13.9 km south | 1,000 m | 358 m up, against the southern mountains |
| Cinder Flats | 15.0 km west | 1,800 m | On the western landmass |
| Northlight | 17.1 km north | 1,200 m | A strip on its own island |
| Highmeadow | 18.2 km east | 850 m | Short valley strip between peaks |
| Saltmarsh | 22.2 km north-east | 1,400 m | Low coastal strip |
| Farpoint | 25.1 km south-east | 2,200 m | The only other runway long enough for the airliners |

Each outlying airfield has a hut, a windsock and a keeper you can get out and talk to.

In flight, the round map at the bottom right shows airfields within 14 km as runway-shaped marks, turned the way each runway lies. Farther ones sit as dots on the rim. A blue marker points home once you are more than 3.5 km away.

## Earning coins

- **Parcels.** Postmaster Hobb, and the keeper at every airfield, offers two deliveries at a time. Pay is 140 coins plus 44 per kilometre. Follow the yellow marker, land, and come to a stop on the field.
- **Rings.** Twelve yellow rings hang over the bay. Each is worth 40 coins, and all twelve in one flight earns 440 more. They reset when you stop at home.
- **Discovery.** The first time you land and stop at a new airfield earns 300 coins.

## Graphics settings

Set **Graphics quality** in Controls. Changing it reloads the game.

| Setting | What you get |
| --- | --- |
| High (default) | 4096 px soft sun shadows, bloom, 4× anti-aliasing on the HDR buffer, full forests, 16 km view |
| Medium | 2048 px shadows, no bloom, slightly thinner forests |
| Low | No shadows, shorter view distance, coarser terrain, sparse forests. For laptops with integrated graphics |

What is on screen, on every setting: ACES filmic tone mapping, physically based materials with sky reflections on the aeroplanes, an analytic sky with a sun disc, animated water with Fresnel reflection and sun glitter, distance haze, lit cloud layers, and terrain shaded per pixel with several scales of detail.

## Flight model

`js/flight.js` simulates each aeroplane as a rigid body at 120 steps per second.

- **Lift** follows a lift curve: linear with angle of attack up to the stall, then falling toward flat-plate behaviour. Flaps raise both the curve and the maximum.
- **Drag** is parasite drag plus induced drag from lift, plus flaps, extended gear, sideslip and a large penalty when stalled.
- **Thrust** falls off with airspeed and with altitude. Jets spool up more slowly than propellers.
- **Controls** command pitch, roll and yaw rates that scale with dynamic pressure, so they go soft near the stall and firm up with speed. Pitch is limited by each aeroplane's g limit and eased off near the stalling angle.
- **Stability**: the nose weathervanes into the airflow in pitch and yaw, and sideslip rolls the aeroplane (dihedral effect).
- **Auto-trim**: while you are steering, the trimmed angle of attack follows the aeroplane. Let go, and it holds the speed you were flying. Manual trim is on **,** and **.**
- **Ground handling**: rolling resistance, wheel brakes, rudder steering, taildragger stance, and water drag for floats.
- **Crashes**: touching down faster than the gear's sink-rate limit, banked past about 35°, nose-first, gear up, into a steep slope, or into water without floats.

Each aeroplane is described by a short spec: mass, wing area, span, maximum lift, drag, top speed and thrust-to-weight. Stall speed, the thrust curve, trim and climb rate are derived from those. Your custom plane's spec is assembled from its fitted parts, then run through the same derivation, so parts change the physics honestly.

The model is tuned to be approachable. It is not a study-level simulator: there is no wind, no engine torque, no fuel, and no compressibility at high Mach.

## Project structure

```
flight-game/
├── index.html            Page, styles (flat placard-style UI), and the overlay containers
├── js/
│   ├── main.js           Game loop, walking, flying, cameras, jobs, rings, saving
│   ├── world.js          Terrain height function, airfields, flattened zones (pure maths)
│   ├── terrain.js        Sky, sun and shadows, streamed terrain chunks, forests, water, clouds
│   ├── flight.js         Flight physics and spec derivation
│   ├── planes.js         The 33 aeroplanes, the 37 parts, and the procedural model builder
│   ├── town.js           Buildings, hangar, tower, runways, people and their dialogue
│   ├── input.js          Keyboard, mouse, and controller reading and binding
│   ├── ui.js             Dialogue, shops, hangar, pause, help, controls screens
│   ├── hud.js            Flight instruments drawn on a 2D canvas
│   └── audio.js          Synthesised engine, wind and chimes
├── desktop/main.js       Electron shell for the .exe
├── vendor/               three.js r170 and its post-processing passes (MIT)
└── package.json          Scripts and the .exe build configuration
```

There are no image, model or sound files. Aeroplane models are built from each spec by lofting a fuselage through cross-sections and adding wing panels, tail, engines, canopy and gear. Terrain comes from layered noise. Textures (signs, runway markings, clouds) are painted onto canvases at start-up. Sound comes from Web Audio oscillators and filtered noise.

To add an aeroplane, add one `P(...)` entry to `LIBRARY` in `js/planes.js`. To add a part, add one entry to `PARTS`. To add an airfield, add one entry to `STRIPS` in `js/world.js`; the ground is flattened for it automatically.

## Saving

Progress saves automatically in the browser's local storage (or the app's own storage in the `.exe`): coins, parts owned and fitted, the plane's name, airfields discovered, the current parcel, settings and controller bindings.

**New game** in the pause menu erases progress and keeps settings and bindings. The browser version and the `.exe` keep separate saves.

## What was tested

Checked in headless Chromium while building:

- The game loads and runs with no script errors on Low, Medium and High.
- Walking, colliding with buildings, the pause menu, dialogue, parcel offers, every shop, buying and fitting parts, and the hangar.
- All 33 aeroplanes plus the starter custom plane through a scripted take-off, climb, hands-off flight, level top speed and roll test. None crashed, and measured top speeds match the specs.
- Mouse-aim steering through an 80° turn in four aeroplanes from trainer to airliner, converging on target with no height lost.
- A scripted approach, touchdown (1 m/s sink) and stop.
- A simulated stick-plus-throttle HOTAS: detection, default bindings, the throttle unit taking over from the stick's slider, live binding of an axis, and flying on it.
- The Electron shell starts and renders the game on Linux, and the Windows `.exe` builds with the game files inside it.

Not tested, so treat as unverified:

- **The `.exe` has not been run on a real Windows machine.** It was built on Linux.
- **Real joystick hardware.** Only simulated devices were available, so default axis numbers for particular sticks may need rebinding.
- **Frame rate on a real graphics card.** The build machine has no GPU. If High is slow, use Medium or Low.

## Troubleshooting

| Problem | Fix |
| --- | --- |
| Blank page, console says the module failed to load | Open it through a web server (`npm start`), not by double-clicking `index.html` |
| Slow or stuttering | Set Graphics quality to Medium or Low. Check that hardware acceleration is on in the browser |
| Controller not listed | Press a button on it. Use Chrome or Edge. Close other programs that grab the device exclusively |
| Throttle works backwards | Controls, then press **Normal** next to Throttle so it reads **Inverted** |
| Aeroplane turns or pitches by itself with a stick plugged in | Raise **Stick dead zone**, or rebind the axis: the default guess may have picked the wrong one |
| Mouse will not turn the camera | Click the 3D view to capture the mouse. Press Esc to release it |
| Mouse keeps steering the aeroplane | Press **M** until it says "Mouse: off" |
| No sound | Sound starts after the first click. Check Sound volume in Controls |
| Cannot get out of the aeroplane | You must be on the ground and stopped. Hold **B**, then press **Enter** |
| Stuck somewhere | **Backspace** returns the aeroplane to the home runway. Pause, then **Return to base** returns you and both aeroplanes home |
| Windows blocks the `.exe` | It is unsigned. Choose **More info**, then **Run anyway** |

## Credits and licence

Rendering uses [three.js](https://threejs.org) r170 and its post-processing passes, vendored in `vendor/` under the MIT licence (`vendor/LICENSE`). The desktop build uses [Electron](https://www.electronjs.org) and [electron-builder](https://www.electron.build).

All aeroplanes, places and characters are fictional and original to this game.
