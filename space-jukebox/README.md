# Space Jukebox — 3D Fire Flight

A spaceship flies an auto-piloted tour of a 3D Earth while the data
underneath becomes sound — the ship is the playhead, and the map is
the score. Built for **The Earth Information Jukebox** challenge
(NASA Space Apps 2026) as the side project of **PyroSync**, and
designed audio-first for blind and low-vision listeners: narration
is on by default, so the whole flight works with your eyes closed.

**One subject — Earth. Any map as input.** The flight reads a point
dataset (position + intensity). The current dataset is wildfire; a
different map — a temperature grid, sea ice, city lights — plugs
into the same loop with no new machinery.

## Run it

From the repo root:

    npm run preview

then open http://localhost:8080/space-jukebox/ — or just open
`fly.html` in a browser. It is a single self-contained file; the
3D library is vendored with the repo, with a CDN fallback for when
the file is opened straight from disk.

Live demo: https://dmuldrew.github.io/spatial_sequencers/space-jukebox/fly.html

## The flight

Six fire regions, west to east, ~80 seconds per loop: California
& W. US, Boreal N. America, Amazon & Cerrado, Mediterranean Basin,
Sahel & N. Savanna, Australian Outback. The dataset is the main
project's: 330 NASA FIRMS (MODIS) hotspots with fire radiative
power (FRP), embedded from PyroSync's bundled data.

## How it sounds

- **Continuous tone:** two detuned saws through a pitch-tracking
  lowpass filter. Pitch and brightness follow the FRP-weighted fire
  intensity near the ship (Gaussian falloff, ~16° radius) — calm
  ocean is a low hum; a fire region climbs.
- **Pings:** passing within ~5.5° of a major hotspot (FRP ≥ 280)
  strikes a note whose pitch and loudness scale with that fire's
  FRP. The loudest moment on the planet: Australia, FRP 5083.
- **Narration:** entering a region speaks its name, hotspot count,
  and strongest FRP. Toggle with the Narration button or the N key.

## Controls

Space play/pause · S whereabouts · N narration · M mute · C
chase/orbit camera · ↑/↓ speed. Shortcuts stand down while a button
has focus, so Space still activates the control you are on.

The HUD shows the current region, a fire-intensity meter, the
ship's coordinates, and tour progress (which stop you are at, and
the next one); a screen-reader live region announces each region
as it is reached, and **S** speaks the current region, its hotspot
count and the live fire intensity on demand. Hotspot pings are
panned left/right toward the side the fire is on.

## Manual pilot

The tour is auto-piloted, but you can take the controls: the
**Pilot** button (or the G key) switches to manual flight, and
switching back resumes the tour from wherever you left it. Mode
changes are announced aloud. Steer with the arrow keys or WASD
(↑/↓ set speed) — or plug in an **Xbox controller**: left stick
steers, pushing it forward (or the right trigger) speeds up, the
left trigger slows down, A pauses/resumes, Y narration, X mute,
B camera, bumpers set tour speed, and Start switches pilot mode.
Everything sonified keeps working in manual flight, because the
sound has always been driven by where the ship is, not by the
tour path.

## Technical notes

- Single HTML file; Three.js for the globe, the Web Audio API for
  synthesis, Speech Synthesis for narration. No build step, no
  backend, no runtime data fetches. The 3D library is imported from
  the copy vendored with the repo (the same file PyroSync loads),
  so the flight works offline; the CDN is only a fallback for
  opening `fly.html` from disk.
- The globe's land is a dot grid rasterized at build time from
  Natural Earth country borders (1.5° cells, ~8,300 dots) — no
  texture images.
- The ship follows a closed Catmull-Rom spline through the six
  region centers, projected onto one constant-altitude shell so it
  flies exactly along the drawn path. Fire intensity and the ping
  proximity test share a single dot-product pass over the hotspot
  array, with far hotspots rejected before any trig.
- Continuous tone and pings duck under narration, the flight is
  silent while paused, and `prefers-reduced-motion` stills the
  hotspot pulse and the orbit camera.
