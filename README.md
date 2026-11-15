# Spatial Sequencers — PyroSync & Space Jukebox

**Project Hub (Live Demo):** **[https://dmuldrew.github.io/spatial_sequencers/](https://dmuldrew.github.io/spatial_sequencers/)**

An interactive **audio-visual NASA wildfire, meteorology, and Earth-data sonification repository** built for the **2026 NASA International Space Apps Challenge** (Seattle), pairing the **[PyroSync Fire-Weather Observatory](pyrosync/)** (`d3-audio`, D3.js v7, Three.js, Tone.js, H3) with the accessible **[Space Jukebox](space-jukebox/)** prototype.

---

## Sub-projects at a Glance

- **[PyroSync (`pyrosync/`)](pyrosync/README.md)** — Live Demo: `https://dmuldrew.github.io/spatial_sequencers/pyrosync/`
  - **26-Year Wildfire Spiral (`/#spiral`)**, **Central Iowa MODIS Hex Map (`/#iowa-map`)**, and **Orbital Flyby (3D) (`/#flyby`)**.
- **[Space Jukebox (`space-jukebox/`)](space-jukebox/README.md)** — Live Demo: `https://dmuldrew.github.io/spatial_sequencers/space-jukebox/fly.html`
  - **3D Fire Flight** (`fly.html`) — a spaceship tours NASA FIRMS fire regions on a 3D globe; Web Audio sonification + Speech Synthesis narration designed for blind and low-vision listeners.
- **Hub Landing Page (`site/`)** — Multi-project entry page deployed to the root of GitHub Pages.

---

## PyroSync: Audio-Visual Fire-Weather Experience

**PyroSync** combines **26 years of NASA POWER monthly meteorology (2001–2026)**, a **30-year climatological baseline (1991–2020)**, **NASA EONET v3 wildfire outbreaks (2015–2026)**, **NASA FIRMS MODIS C6.1 thermal hotspots**, and a **regional MODIS Terra H3 hexagon grid** across three interactive tabs:

- **26-Year Wildfire Climate Spiral (`/#spiral`)** *(inspired by `d3-audio` Example 15 — Climate Rhythm Quest)*: Unrolls **309 monthly steps (`2001-01` → `2026-09`)** across six global fire biomes with a switchable radial axis (**Norm Deviation $\sigma$**, **Fosberg FWI**, **VPD Dryness (kPa)**, or **EONET Fire Counts**). Concentric risk threshold rings mark severity boundaries while golden/crimson flares highlight confirmed EONET wildfire outbreaks (`2015–2026`).
- **Centered 3D Geographic Globe Locator** *(inspired by `d3-audio` Example 13 — Seismic Simon)*: Nested inside the inner radius of the spiral, a live `d3.geoOrthographic()` 3D globe rotates smoothly to frame the active biome polygon and plot NASA FIRMS MODIS 7-day (or on-demand live 24-hour) thermal fire detections.
- **Harmonic Tension for Significant Norm Departure**: Rather than confusing normal seasonal summers with unprecedented extremes, `d3-audio` `scaleTension()` maps positive departure from the 1991–2020 normal (`0.0σ` → `+3.0σ`) from warm Consonant C-major chords (`C3 G3 C4 E4`) through Moderate/Tense intervals into Dissonant tritones (`C3 F#3 Bb3 Db4`), microtonal detuning (`0–60¢`), increased FM modulation grit, and coupled playback acceleration.
- **Climate Norm "What-If" Sandbox & Interactive `audioLegend()`**: Perturb temperature, humidity, or wind (`+18% Coastal Humidity`, `-45% Peak Wind Gusts`, `Rain / Moisture Pulse`, `+3.5 °C Heatwave`), watch the `zScore` recalculate live against the 1991–2020 baseline, and hear tritone dissonance resolve back into consonance.
- **Central Iowa MODIS Hexagon Map (`/#iowa-map`)**: Interactive Leaflet + H3 v4 grid (`midwest/map.html`) exploring MODIS daytime Land Surface Temperature and NDVI across a 180 × 120 mile Iowa study area.
- **Orbital Flyby (3D) (`/#flyby`)**: Controllable Three.js spacecraft flyby combining global MODIS fire hotspots, 3D extruded regional H3 hex columns, a synced 2001–2026 spiral HUD, and real-time Tone.js spatial/proximity sonification.

### NASA Datasets Used

| Source | Coverage | Role in App |
| :--- | :--- | :--- |
| **[NASA POWER v2 Monthly](https://power.larc.nasa.gov/)** | `1991–2026` (`T2M_MAX`, `RH2M`, `WS10M`, `PRECTOTCORR`) | Computes 1991–2020 30-year seasonal normals & standardized monthly VPD/FFWI `zScore` departures (`2001–2026`) |
| **[NASA EONET v3](https://eonet.gsfc.nasa.gov/api/v3/events)** | `2015–2026` global wildfire events | Monthly wildfire outbreak flares overlaid onto the 2015–2026 spiral turns & telemetry table |
| **[NASA FIRMS MODIS C6.1](https://firms.modaps.eosdis.nasa.gov/)** | Global 7-day archive + Live 24h refresh (`/api/live-modis`) | Active thermal hotspot coordinates & Fire Radiative Power (`MW`) plotted on the central 3D globe and 3D flyby |
| **MOD11A2 & MOD13Q1 Terra MODIS** | July 11–26, 2024 Central Iowa snapshot (`7,443` H3 cells) | Daytime LST (°C) & NDVI rendered on the H3 hexagon map and extruded in the 3D flyby |

### `d3-audio` Sonification Mapping

| Physical Variable | `d3-audio` Scaler | Meaningful Auditory Signal |
| :--- | :--- | :--- |
| **1991–2020 Norm Deviation (`σ`)** | `scaleTension()` (`Chords`, `Detune 0–60¢`, `FM Index`, `Tempo`) | Normal variability (`<+0.9σ`) stays warm and Consonant; statistically significant anomalies shift into Tense/Dissonant tritones and FM grit |
| **Anomaly & EONET Fire Intensity** | `scalePitch()` (`C3` → `E6`) + `scaleGain()` | Baseline months whisper in deep octaves; compounding heat/dryness departures and active wildfire months ring higher and louder |
| **Vapor Pressure Deficit (VPD)** | `scaleFilter()` (`320` → `8,800 Hz`) | Moist air sounds muffled and warm; arid, fuel-curing air opens the lowpass filter into crisp brightness |
| **10m Surface Wind Speed** | `scaleRhythm()` (`euclideanRhythm`) | Wind speed controls Bjorklund Euclidean ember pulse density |
| **Biome Longitude** | `scalePan()` (`-0.85` to `+0.85`) | Aligns stereo field with the centered 3D globe (Americas left, Europe/Africa center, Asia/Australia right) |

---

## How to Run the App

### Option 1: Docker Compose (Recommended)

Prerequisites: [Docker Desktop](https://www.docker.com/products/docker-desktop/) or Docker Engine with Compose v2.

```bash
# Build the image and start PyroSync in the background
docker compose -f pyrosync/docker-compose.yml up -d --build
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser (or `/#iowa-map` / `/#flyby`), then click **Enable Audio** (or **Play 2001–2026**) to unlock Web Audio.

Useful Docker Compose commands:

```bash
# Stream container logs
docker compose -f pyrosync/docker-compose.yml logs -f pyrosync

# Check container health status
docker compose -f pyrosync/docker-compose.yml ps

# Stop and remove the container
docker compose -f pyrosync/docker-compose.yml down
```

### Option 2: Docker CLI

```bash
# Build the Docker image
docker build -t spatial-sequencers-pyrosync:latest ./pyrosync

# Run on port 3000 (override PORT if needed)
docker run --rm -p 3000:3000 --name pyrosync-observatory spatial-sequencers-pyrosync:latest
```

### Option 3: Local Node.js (without Docker)

Requires **Node.js 20+** and `git` (for installing `d3-audio` from GitHub):

```bash
cd pyrosync
npm install
npm start
```

Then visit **[http://localhost:3000](http://localhost:3000)**. For **Space Jukebox**, run `npm run preview` from the repo root and open **http://localhost:8080/space-jukebox/**, or open `space-jukebox/fly.html` directly in your browser.

### Option 4: Deploy to GitHub Pages

PyroSync uses relative asset paths (`./styles.css`, `./vendor/...`, `./data/...`) so it runs identically both locally and under `/spatial_sequencers/pyrosync/` on GitHub Pages.

#### Automated via GitHub Actions (Recommended)

This repository includes [.github/workflows/deploy-pages.yml](.github/workflows/deploy-pages.yml), which builds `./pyrosync/dist` via `./pyrosync/scripts/deploy-gh-pages.sh --build-only`, combines it with `site/index.html` and `space-jukebox/` into `./site-dist`, and deploys it to GitHub Pages.

1. On GitHub, open **Repository Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **GitHub Actions**.
3. Push any commit to `main` to deploy automatically, **or deploy a specific branch manually**:
   - Open **Actions → Deploy GitHub Pages → Run workflow**.
   - Keep **Use workflow from** set to **`main`**, enter your target branch/tag/SHA in **`Branch, tag, or SHA to build and deploy`**, and click **Run workflow**.
4. Visit **`https://dmuldrew.github.io/spatial_sequencers/`** (or `/pyrosync/` and `/space-jukebox/fly.html`).

#### Manual PyroSync Branch Deploy via Script

```bash
cd pyrosync
# Preview/validate the static bundle locally without pushing (optional)
./scripts/deploy-gh-pages.sh --dry-run

# Build and force-push the static bundle to origin/gh-pages
./scripts/deploy-gh-pages.sh
```

> Note: The **Live 24h** `/api/live-modis` proxy button requires the Node/Docker backend; on static GitHub Pages, the app gracefully stays on the bundled 7-day NASA FIRMS MODIS archive.

### Refreshing the Bundled NASA Dataset

A pre-fetched, verified NASA dataset is committed at [pyrosync/public/data/fire_weather_data.json](pyrosync/public/data/fire_weather_data.json) so the container runs immediately without external API delays. Regenerate it from live NASA EONET, FIRMS MODIS, and POWER APIs anytime with Python 3 (standard library only):

```bash
python3 pyrosync/scripts/fetch_nasa_data.py
```

---

## Project Structure

```text
spatial_sequencers/
├── .github/workflows/
│   └── deploy-pages.yml            # GitHub Actions multi-project Pages deploy
├── site/
│   └── index.html                  # Hub landing page linking PyroSync & Space Jukebox
├── space-jukebox/                  # 3D sonification flight, audio-first for blind & low-vision listeners
│   ├── fly.html                    # 3D Fire Flight sonification tour (the app)
│   └── README.md                   # Space Jukebox architecture & input model
└── pyrosync/                       # PyroSync Observatory web app & data pipeline
    ├── Dockerfile                  # Node 22 Alpine container image
    ├── docker-compose.yml          # Compose service exposing port 3000
    ├── package.json                # Dependencies: d3, d3-audio, three, tone, topojson-client, world-atlas
    ├── server.js                   # Static + /vendor + /api/health + /api/live-modis proxy server
    ├── README.md                   # PyroSync module notes
    ├── scripts/
    │   ├── deploy-gh-pages.sh      # Stages public/ + vendor/ + .nojekyll
    │   ├── fetch_nasa_data.py      # Fetches & joins NASA EONET, FIRMS MODIS, and POWER data
    │   └── prepare_midwest.py      # Builds Midwest MODIS H3 snapshot using raster_h3
    └── public/
        ├── index.html              # Tabbed UI: Spiral, Central Iowa Hex Map, Orbital Flyby (3D)
        ├── styles.css              # Color-scheme styles, tabs, flyby HUD, reduced motion
        ├── data/
        │   └── fire_weather_data.json
        ├── js/
        │   ├── enable-audio.js     # Web Audio & iOS unlock helper
        │   ├── app.js              # 26-year Spiral, Centered 3D Globe, scaleTension() & tab router
        │   └── flyby.js            # Three.js spacecraft flyby, H3 columns & spatial sonification
        └── midwest/                # Central Iowa MODIS LST/NDVI H3 v4 hexagon map
            ├── map.html
            ├── data/midwest.json
            ├── js/domain/
            └── js/infrastructure/
```

---

## Central Iowa MODIS Hexagon Map & Orbital Flyby

Available on the second home page tab (**Central Iowa MODIS Hex Map** / `/#iowa-map`) or directly at `/midwest/map.html`, this map covers a 180 × 120 mile study area centered on 42°N, 93.5°W. The bundled July 11–26, 2024 Terra MODIS snapshot has 7,443 H3 cells with both inputs and includes its own zoom slider:

- **MOD11A2 daytime land surface temperature** (°C) is averaged from two quality-filtered 8-day composites and controls hue from green to brown.
- **MOD13Q1 NDVI** comes from one quality-filtered 16-day composite and controls saturation from 5% to 95%.
- Both inputs use the visible 5th–95th percentiles for color (clipping extremes to endpoints; falling back to full range when fewer than 20 observations exist). Gray cells are missing one or both inputs.
- To regenerate [pyrosync/public/midwest/data/midwest.json](pyrosync/public/midwest/data/midwest.json) from source GeoTIFF bands without Rasterio, install [`raster_h3`](https://github.com/dmuldrew/raster_h3) (Python package or `raster-h3-cli`) and run:
  ```bash
  python3 pyrosync/scripts/prepare_midwest.py /path/to/geotiffs
  ```

The third home page tab (**Orbital Flyby (3D)** / `/#flyby`) launches a controllable Three.js spacecraft over a 3D Earth textured by NASA FIRMS wildfire hotspots and extruded Iowa MODIS H3 columns, paired with a synced 2001–2026 fire-weather spiral HUD and Tone.js spatial sonification.

---

## 2026 NASA Space Apps Challenge Summaries

### 1. [The Earth Information Jukebox](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/)

- **Subjects:** Arts & Multimedia, Earth Science, Software
- **Difficulty:** Beginner (Youth) / Intermediate
- **Problem:** NASA's Earth Information Center (EIC) produces rich visualizations of planetary changes (such as shifting temperatures, melting ice sheets, and oceanic currents), but relying solely on visual media limits accessibility for blind and low-vision audiences and narrows how users can engage with the data.
- **Goal:** Build an interactive "Earth Jukebox" (application, interface, or script) that translates sight into sound by pairing EIC visual frames with dynamic, real-time data sonifications.
- **Key Approaches:**
  - Map visual parameters—such as color spectra, pixel density, shapes, or time-series environmental metrics—to musical elements, frequencies, chords, rhythms, or synthesizer parameters.
  - Enable users to browse geographic regions or EIC datasets and experience corresponding auditory timelines and soundscapes.
  - Combine scientific rigor with artistic design to make Earth science more accessible and engaging.

### 2. [Dancing with the SARs](https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/)

- **Subjects:** Earth Science
- **Difficulty:** Intermediate / Advanced
- **Problem:** Earth's surface is constantly changing due to natural processes and human activities—including wetland loss, wildfires, earthquakes, agricultural shifts, and glacier movement—which can be difficult to track, interpret, and communicate clearly.
- **Goal:** Create an interactive application, tool, or visual narrative using radar remote sensing data from the **NASA-ISRO Synthetic Aperture Radar (NISAR)** mission to track and explain surface changes over time.
- **Key Approaches:**
  - Analyze SAR imagery across multiple dates, polarizations, and/or frequencies to detect surface changes.
  - Combine SAR time-series observations with ancillary datasets (such as vegetation cover or population density) to hypothesize and explain underlying physical or human drivers.
  - Present findings through interactive maps, image sliders, dashboards, story maps, reports, or multimedia presentations.

### 3. [Harmonization of MODIS and VIIRS Hot Spots](https://www.spaceappschallenge.org/2026/challenges/modis-and-viirs-hot-spots/)

- **Subjects:** Earth Science, Software / Web Development
- **Difficulty:** Intermediate / Advanced
- **Problem:** Satellites have monitored global active fire hotspots (wildfires, controlled burns, and agricultural burning) for over two decades using **MODIS** (~1 km resolution) and **VIIRS** (375 m resolution). Because the sensors differ in spatial resolution, sensitivity, and observation schedules, their raw hotspot records cannot be directly compared, leaving researchers and land managers without a consistent long-term baseline.
- **Goal:** Develop a web application and data pipeline that harmonizes MODIS and VIIRS active-fire records—such as datasets from **NASA FIRMS** (Fire Information for Resource Management System)—into a unified **"Burning Activity Calendar"** or standardized grid.
- **Key Approaches:**
  - Normalize cross-sensor discrepancies onto a common spatial and temporal framework.
  - Provide interactive maps, seasonal comparisons, and historical charts (e.g., comparing current-month burning against historical medians) for a user-selected area of interest.
  - Support scientists, land managers, and emergency responders in identifying unusual burning periods and long-term fire trends.

### Comparison at a Glance

| Challenge | Primary Data / Domain | Core Output | Difficulty |
| :--- | :--- | :--- | :--- |
| **The Earth Information Jukebox** | NASA Earth Information Center (EIC) visuals | Real-time visual-to-audio sonification tool | Beginner (Youth) / Intermediate |
| **Dancing with the SARs** | NISAR Synthetic Aperture Radar (SAR) | Interactive surface-change tracker & visual narrative | Intermediate / Advanced |
| **Harmonization of MODIS and VIIRS Hot Spots** | NASA FIRMS active fire hotspots (MODIS & VIIRS) | Harmonized Burning Activity Calendar & web dashboard | Intermediate / Advanced |
