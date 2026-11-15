# Contributor Guide

Thanks for contributing to Spatial Sequencers (PyroSync). We welcome improvements to the data pipeline, UI, docs, deployment flow, and accessibility.

## Project overview

This project is a browser-based NASA fire-weather observatory that presents wildfire and meteorology data as a spatial, audio-visual timeline. The main runtime is a small Node.js server, while the front end is built in static HTML/CSS/JavaScript and the research data is refreshed with Python scripts.

The repo is a hub with three parts:

- `pyrosync/` — PyroSync, the fire-weather observatory: the 26-year wildfire spiral, central 3D globe, and fire-weather data.
- `space-jukebox/` — the Earth Information Jukebox, an accessible Earth-data sonification prototype (`index.html`, plus `fly.html`, the 3D Fire Flight).
- `site/` — the hub landing page that links PyroSync and the Space Jukebox.

## Project structure

```text
spatial_sequencers/
├── CONTRIBUTOR.md
├── README.md                            # Hub: PyroSync + Space Jukebox
├── .github/workflows/deploy-pages.yml
├── pyrosync/                            # PyroSync fire-weather observatory
│   ├── Dockerfile
│   ├── docker-compose.yml
│   ├── package.json                     # d3, d3-audio, tone, topojson-client, world-atlas
│   ├── server.js                        # Static + /vendor + /api/health + /api/live-modis proxy
│   ├── scripts/
│   │   ├── deploy-gh-pages.sh
│   │   └── fetch_nasa_data.py           # Regenerates public/data/fire_weather_data.json
│   └── public/
│       ├── index.html
│       ├── styles.css
│       ├── data/fire_weather_data.json
│       └── js/
│           ├── enable-audio.js
│           └── app.js                   # Spiral, 3D globe, and scaleTension() engine
├── space-jukebox/                       # Accessible Earth-data sonification prototype
│   ├── index.html
│   └── fly.html                         # 3D Fire Flight
└── site/                                # Hub landing page
```

## Prerequisites

- Node.js 20 or newer
- Python 3
- Git
- Optional: Docker Desktop or Docker Engine for containerized runs

## Local setup

### Option 1: Docker Compose (recommended)

Prerequisites: Docker Desktop or Docker Engine with Compose v2.

```bash
docker compose -f pyrosync/docker-compose.yml up -d --build
```

Open http://localhost:3000, then click **Enable Audio** to unlock Web Audio.

```bash
docker compose -f pyrosync/docker-compose.yml logs -f pyrosync
docker compose -f pyrosync/docker-compose.yml ps
docker compose -f pyrosync/docker-compose.yml down
```

### Option 2: Local Node.js (without Docker)

Requires Node.js 20+ and `git`:

```bash
cd pyrosync
npm install
npm start
```

Then visit http://localhost:3000.

## Working with data

A pre-fetched NASA dataset is committed at `pyrosync/public/data/fire_weather_data.json` so the app runs immediately.

To regenerate it from live NASA EONET, FIRMS MODIS, and POWER APIs:

```bash
python3 pyrosync/scripts/fetch_nasa_data.py
```

Only commit a regenerated dataset when it is intentional — note it in your pull request.

The **Live 24h** button in the app queries `/api/live-modis` on the Node server. On static GitHub Pages it falls back to the bundled 7-day archive.

## How to contribute

1. **Find or open an issue** describing the change, bug, or idea.
2. **Fork the repo** (if you don't have write access) and clone it:
   ```bash
   git clone https://github.com/dmuldrew/spatial_sequencers.git
   cd spatial_sequencers
   ```
3. **Create a branch** from `main` for your work:
   ```bash
   git checkout main
   git pull
   git checkout -b <your-name>/<short-description>
   ```
   Example: `monica/add-contributor-guide`
4. **Make your change**, keeping it focused on one thing per pull request.
5. **Test locally** (see above).
6. **Commit with a clear message**, push your branch, and open a pull request against `main`.
   - Describe what changed and why, and link the related issue if there is one.
   - Include screenshots or a short screen recording for UI / audio-visual changes.

## Branching workflow

Work from a feature branch off `main` (or the active development branch in your fork):

```bash
git checkout -b my-feature
```

Before opening a PR:

- Rebase or merge the latest target branch as needed.
- Ensure the app still boots locally.
- Verify the relevant UI or script behavior still works.
- Keep changes focused to a single concern.

## Contribution expectations

### Code changes

- Prefer small, reviewable patches.
- Keep JavaScript and Python code readable and explicit.
- Avoid introducing unrelated dependencies unless necessary.
- Respect the existing file organization and naming conventions.
- Match the existing style in the file you are editing.
- Keep relative asset paths (`./styles.css`, `./vendor/...`, `./data/...`) so the app works the same locally, in Docker, and on GitHub Pages under `/spatial_sequencers/`.
- Be careful with audio: test with sound on and off, and respect reduced-motion preferences where the UI already does.
- Don't commit secrets, API keys, or local-only config. Don't commit `node_modules/` or build output.

### Documentation

- Update README or inline comments when behavior changes.
- Document any new environment variables, commands, or deployment steps.

### Data pipeline

If you change dataset generation or visualization assumptions:

- Re-run `python3 pyrosync/scripts/fetch_nasa_data.py` when applicable.
- Verify the generated JSON still matches the expected schema.
- Check that the front end still renders correctly with the updated data.

### Frontend / UX

- Preserve accessibility patterns already used in the app.
- Prefer semantic HTML and keyboard-friendly controls.
- Keep the atmospheric experience readable and responsive across screen sizes.

## Pull request checklist

Before submitting a PR, confirm:

- [ ] I tested locally with `npm start` or `docker compose -f pyrosync/docker-compose.yml up -d --build`
- [ ] I visited http://localhost:3000 and checked the change
- [ ] The change works locally.
- [ ] The README or relevant docs were updated if needed.
- [ ] Data and deployment flows were checked if the change affects them.
- [ ] I kept the change focused and described it in the PR
- [ ] The diff is scoped and easy to review.
- [ ] The branch is up to date with the target branch.

## Coding standards

- Use clear, descriptive variable names.
- Favor explicit logic over clever abstractions.
- Keep comments helpful and limited to non-obvious behavior.
- Match the existing formatting style in the surrounding files.

## Questions or ideas

If you are unsure whether an idea fits the project, open a discussion or draft a PR and ask for feedback early. We are happy to help shape ideas before they become large changes.

Open an issue with what you tried, what you expected, and what happened, including your Node / Docker version and browser if relevant.

Thank you for helping improve Spatial Sequencers.
