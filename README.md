# Luke Hands — Arcade Gallery & Browser Toys

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-Live%20Gallery-blueviolet?style=for-the-badge&logo=github)](https://luke-hands.github.io/pages/)
[![Zero Build](https://img.shields.io/badge/Build-Zero%20Dependencies%20%2F%20Vanilla%20JS-brightgreen?style=for-the-badge)](https://github.com/luke-hands/pages)

Welcome to **Luke Hands — Gallery**, a curated collection of 14 self-contained HTML5 browser games, physics simulations, and web toys. Each project is designed to run directly in the browser with zero build steps, framework dependencies, or installation required.

Visit the live gallery at **[luke-hands.github.io/pages/](https://luke-hands.github.io/pages/)**.

---

## 🌟 Gallery Overview

The root gallery (`index.html`) serves as an interactive glassmorphic arcade dashboard featuring:
- **Live Search & Tag Filtering**: Quickly filter games by category (*Action, Retro, Physics, Rhythm, Survival, Zen, Casino*).
- **Persistent Stats & High Scores**: Automatic tracking of games played, cumulative arcade points, and dynamic player rank progression (*Novice Cadet* to *Galaxy Legend*).
- **Constellation Background**: An interactive canvas particle network reacting to pointer movements and device orientation.
- **Universal Mobile & Gamepad Support**: Built for cross-device compatibility with touch controls, physical gamepad support (Joypad.js), and high-DPI screen auto-scaling.

---

## 🕹️ Mini-App Showcase

### 🤖 AI Space Interface
* **Folder**: [`/ai-space/`](./ai-space/)
* **Tags**: `Zen`
* **Description**: A futuristic, sci-fi glassmorphic command station presenting interactive 3D planetary orbits, telemetry graphs, particle systems, and simulated neural link communications.
* **Controls**: Mouse drag / touch to orbit space camera; click interface buttons to toggle orbits, telemetry, and system diagnostics.
* **Technologies**: HTML5 Canvas, Three.js (r128), Web Audio API, CSS Backdrop Filters.
* **Storage**: `ai-space-chat-v2`

---

### 🚀 Asteroids
* **Folder**: [`/asteroids/`](./asteroids/)
* **Tags**: `Retro`, `Action`, `Physics`
* **Description**: Modernized retro space shooter featuring physics-driven ship thrust, jagged asteroid fragmentation, wraparound boundary logic, weapon heat management, and custom post-processing bloom shaders.
* **Controls**: `Arrow Keys` / `WASD` or Touch Joystick to steer & thrust; `Space` / Button to fire. Physical gamepads supported.
* **Technologies**: PixiJS v7, Matter.js v0.19.0 physics, `pixi-filters` (AdvancedBloomFilter), Web Audio API, Joypad.js.
* **Storage**: `asteroids-best`

---

### ☄️ Comet Graze
* **Folder**: [`/comet-graze/`](./comet-graze/)
* **Tags**: `Retro`, `Action`
* **Description**: Precision arcade flyer where you thread a glowing comet through a undulating neon cave. Your score multiplier only increases when you risk flying close to the cave walls ("grazing").
* **Controls**: Press & hold `Space` / `Click` / `Touch` to dive downward; release to climb upward.
* **Technologies**: Vanilla HTML5 Canvas, Procedural Audio Synthesis, Frame-rate independent physics.
* **Storage**: `comet-graze-best`, `comet-graze-best-easy`, `comet-graze-best-medium`, `comet-graze-best-hard`, `comet-graze-difficulty`

---

### 🎯 Grazer
* **Folder**: [`/grazer/`](./grazer/)
* **Tags**: `Action`, `Survival`
* **Description**: High-intensity bullet-hell survival game where point accumulation relies on intentionally grazing enemy projectiles. Close grazes charge a slow-motion shockwave burst to clear the screen.
* **Controls**: `WASD` / `Arrow Keys` or drag anywhere on screen/touch to pilot ship. `Space` or double-tap to activate slow-mo burst when charged.
* **Technologies**: HTML5 Canvas 2D, Web Audio API, Monotonic Milestone Decay Tracking.
* **Storage**: `grazer-best`

---

### 💡 Last Light
* **Folder**: [`/last-light/`](./last-light/)
* **Tags**: `Survival`, `Action`
* **Description**: Atmospheric survival experience where you control a sweeping spotlight to burn away shadow creatures (Moths, Skitters, Splitters, Tanks) creeping in from the darkness before your lamp battery drains.
* **Controls**: Aim with `Mouse` / `Touch` pointer; `Space` or tap to pulse/relight lamp; `P` to pause.
* **Technologies**: Canvas 2D Shadow / Composite Ops, Web Audio API, Delta-time spatial mechanics.
* **Storage**: `lastlight-best`

---

### ⚔️ Last Parry
* **Folder**: [`/last-parry/`](./last-parry/)
* **Tags**: `Rhythm`, `Action`
* **Description**: Minimalist rhythmic combat arena where precision timing is your sole defense. Parry incoming strike lines at the exact moment of impact to build multiplier chains and trigger visual counter-attacks.
* **Controls**: `Space` / `Click` / `Touch` / Gamepad face button to parry at impact.
* **Technologies**: GSAP 3, Joypad.js controller integration, HTML5 Canvas, Web Audio API.
* **Storage**: `last-parry-best`

---

### 🎲 Limbo
* **Folder**: [`/limbo/`](./limbo/)
* **Tags**: `Casino`
* **Description**: Multiplier betting simulation game. Set target multipliers, manage play-money bankrolls, configure automated betting strategies (On Loss / On Win scaling), and watch the multiplier ramp up.
* **Controls**: Interactive UI panel with click/tap inputs for Target Multiplier, Stake, and Strategy presets. Shortcuts: `Space` (Roll), `A` (Halve), `S` (Double), `D` (Max).
* **Technologies**: Vanilla JS, Glassmorphic UI CSS, HTML Audio / Web Audio, LocalStorage strategy saving.
* **Storage**: `limbo-balance`, `limbo-best`, `limbo-target`, `limbo-bet`, `limbo-strategy`

---

### 🐍 Loop Serpent
* **Folder**: [`/loop-serpent/`](./loop-serpent/)
* **Tags**: `Retro`, `Action`
* **Description**: Arcade snake evolution game. Instead of simply eating dots, close complete geometric loops with your glowing tail to entrap prey entities and eliminate hostile hunter serpents.
* **Controls**: `Arrow Keys` / `WASD` / Touch Swipe or On-screen D-Pad to turn snake.
* **Technologies**: HTML5 Canvas, Pre-allocated Ring Buffers, Polyline Loop Intersection Logic, Web Audio API.
* **Storage**: `loop-serpent-best`

---

### 🎨 Neon Scrawl
* **Folder**: [`/neon-scrawl/`](./neon-scrawl/)
* **Tags**: `Physics`, `Zen`
* **Description**: Relaxing physics drawing sandbox. Draw glowing neon lines and ramps onto the canvas to channel streams of falling energy motes into matching color basins.
* **Controls**: Drag `Mouse` / `Touch` to draw barriers; click UI buttons to clear canvas or toggle emitter nodes.
* **Technologies**: Canvas 2D particle & collision physics, Web Audio harmonic tones.
* **Storage**: `neonScrawlBest`

---

### 🏴‍☠️ Plunder Run
* **Folder**: [`/plunder-run/`](./plunder-run/)
* **Tags**: `Action`, `Zen`
* **Description**: Nautical sailing adventure where you captain a pirate galleon across sunlit waters. Trim your sails to catch wind vectors, scoop up floating gold chest cargo, avoid jagged reefs, and escape ghost ships.
* **Controls**: `A` / `D` or `Left` / `Right` Arrows to steer ship; `W` / `S` or `Up` / `Down` Arrows to raise/lower sails. Full Touch D-Pad support.
* **Technologies**: HTML5 Canvas 2D, Fluid Water Vector Math, Dynamic Difficulty Tiers.
* **Storage**: `plunder-run-best`, `plunder-run-best-easy`, `plunder-run-best-medium`, `plunder-run-best-hard`

---

### 🌀 Pulsar
* **Folder**: [`/pulsar/`](./pulsar/)
* **Tags**: `Rhythm`, `Action`, `Survival`
* **Description**: Rhythmic orbital dodger centered around a pulsating core. Orbit clockwise or counter-clockwise, diving toward or away from the core to dodge incoming geometric bullet patterns synced to the beat.
* **Controls**: `Space` / `Tap` to reverse orbital direction; `S` / `Down Arrow` / Hold to dive toward core.
* **Technologies**: HTML5 Canvas, Audio Beat Synthesizer, Dynamic Screen Shake & Particle Bursts.
* **Storage**: `pulsar-best`

---

### 🛡️ Singularity Command
* **Folder**: [`/singularity-command/`](./singularity-command/)
* **Tags**: `Action`, `Physics`
* **Description**: Missile defense game where you control a micro singularity (black hole). Drag the gravity well across the screen to bend missile trajectories, consume warheads, and safeguard defendable surface cities.
* **Controls**: Drag `Mouse` or `Touch` pointer to position the black hole gravity well. `Space` to pulse gravitational pull.
* **Technologies**: Canvas 2D N-Body Gravitational Physics, Particle Attractors, Web Audio API.
* **Storage**: `singularity_best`

---

### 🎆 Skyburst
* **Folder**: [`/skyburst/`](./skyburst/)
* **Tags**: `Action`, `Zen`
* **Description**: Ascend through a starry midnight sky aboard a buoyant spark. Soar upward by riding thermal updrafts and catching exploding firework shells while avoiding falling cold debris.
* **Controls**: Move `Mouse` / `Touch` to guide horizontal flight trajectory.
* **Technologies**: PixiJS v7, Howler.js audio management, Canvas visual effects.
* **Storage**: `skyburst-best`

---

### ⏱️ Standstill
* **Folder**: [`/standstill/`](./standstill/)
* **Tags**: `Action`, `Survival`
* **Description**: Precision bullet-time arena dodger inspired by *SUPERHOT*. Time and enemy projectiles only move when your ship moves. Plan surgical micro-movements to weave through lethal bullet matrices.
* **Controls**: `WASD` / `Arrow Keys` or drag `Mouse` / `Touch` to move. Staying stationary freezes time. `Space` or tap to trigger quick burst.
* **Technologies**: HTML5 Canvas, Time-Dilation Engine, Frame-rate independent delta physics, Web Audio.
* **Storage**: `standstill_best`

---

## 🛠️ Technical Architecture

### 1. Zero Build Philosophy
Every app in this repository operates as pure static HTML, CSS, and JavaScript. There are no build scripts (`npm run build`, Webpack, Vite, etc.), transpilation steps, or node node_modules required.

### 2. Standalone Portability
Each mini-app resides in its own isolated directory (`/<slug>/index.html`) and functions completely offline via the `file://` protocol or any standard static Web Server.

### 3. Procedural Audio
Game sound effects and ambient soundtracks are primarily generated programmatically using the browser's native **WebAudio API** (`OscillatorNode`, `GainNode`, `BiquadFilterNode`). Audio Contexts are initialized upon user interaction to satisfy modern browser autoplay policies.

### 4. Frame-Rate Independence & Smoothness
All physics simulations, entity movements, particle aging, and decay mechanics utilize delta-time scaling (`dt`) with exponential smoothing formulas (`1.0 - Math.pow(friction, dt)`), ensuring uniform gameplay speed across 60Hz, 120Hz, and high-refresh displays.

---

## 🚀 Running Locally

To run the gallery or any individual game locally:

### Option A: Open directly in browser
Double-click `index.html` or any `/<slug>/index.html` file to open directly in your web browser (`file:///.../index.html`).

### Option B: Local HTTP Server
Using Python (pre-installed on macOS/Linux):
```bash
python3 -m http.server 8000
```
Then open `http://localhost:8000` in your web browser.

Using Node.js / `npx`:
```bash
npx serve .
```

---

## 📜 Contributing & Guidelines

When adding or modifying games in this repository, please follow the guidelines specified in [`AGENTS.md`](./AGENTS.md):

1. **Folder Convention**: Create a new subdirectory `/<slug>/index.html`.
2. **Gallery Card**: Add a corresponding linked card to the root `index.html` with relevant category `data-tags` and a score configuration entry in `gameScoreConfigs`.
3. **Back to Gallery Navigation**: Ensure the sub-game includes a top floating navigation button linked back to `../index.html`:
   ```html
   <a href="../index.html" class="back-to-gallery">← Gallery</a>
   ```
4. **No Build Step**: Rely strictly on vanilla JS/CSS or permitted CDN dependencies (Three.js, PixiJS, Matter.js, GSAP, Howler.js, Joypad.js).
5. **Accessibility**: Support high-contrast visuals, responsive touch scaling, and respect `prefers-reduced-motion`.

---

## 📄 License

Created by **Luke Hands**. Open source and available under the MIT License.
