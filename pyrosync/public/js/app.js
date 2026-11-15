const d3 = window.d3;
const topojson = window.topojson;
const Tone = window.Tone;
const d3Audio = window.d3Audio;

const SANDBOX_DELTAS = {
  marine: { temp: -2.5, rh: +18, windMult: 1.0 },
  calmWind: { temp: 0, rh: 0, windMult: 0.55 },
  rain: { temp: -3.0, rh: +22, windMult: 0.8 },
  heatwave: { temp: +3.5, rh: -12, windMult: 1.0 }
};

const state = {
  dataset: null,
  worldGeo: null,
  biomes: [],
  activeBiomeIndex: 0,
  monthIndex: 0,
  isPlaying: false,
  speed: 1,
  isMuted: false,
  audioReady: false,
  radiusMetric: 'sigma', // 'sigma' | 'ffwi' | 'vpd' | 'eonet'
  tableFilter: 'anomalies', // 'anomalies' | 'all'
  sandbox: {
    marine: false,
    calmWind: false,
    rain: false,
    heatwave: false
  },
  globeRotation: [120, -37],
  timerId: null,
  emberTimers: [],
  prefersReducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  lastAnnouncedMonth: -1
};

// Audio instruments & d3-audio scalers
let padSynth = null;
let leadSynth = null;
let emberSynth = null;

const pitchScale = d3Audio.scalePitch().domain([0, 3.5]).range(['C3', 'E6']);
const filterScale = d3Audio.scaleFilter().domain([0.2, 4.5]).range([320, 8800]);
const gainScale = d3Audio.scaleGain().domain([0, 3.5]).range([0.22, 0.92]);
const panScale = d3Audio.scalePan().domain([-150, 150]).range([-0.85, 0.85]);
const rhythmScale = d3Audio.scaleRhythm().domain([0.5, 11.0]).steps(8).range([1, 7]);
const tensionScale = d3Audio.scaleTension()
  .domain([0, 3.0])
  .root('C3')
  .filterRange([420, 8800])
  .tempoRange([1.0, 1.65])
  .detuneRange([0, 60]);

// Choreography helpers
const glowBeat = d3Audio.choreography().movement('glow').intensity(1.8).duration(0.28);
const pulseAlert = d3Audio.choreography().movement('pulse').intensity(1.35).duration(0.32);

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function computeVpdKpa(tmaxC, rhPct) {
  const es = 0.6108 * Math.exp((17.27 * tmaxC) / (tmaxC + 237.3));
  return Math.max(0.05, +(es * (1 - rhPct / 100)).toFixed(2));
}

function computeFfwi(tmaxC, rhPct, windMs) {
  const tf = (tmaxC * 9) / 5 + 32;
  const mph = Math.max(0, windMs) * 2.23694;
  const rh = clamp(rhPct, 1, 100);
  let m;
  if (rh < 10) {
    m = 0.03229 + 0.281073 * rh - 0.000578 * rh * tf;
  } else if (rh <= 50) {
    m = 2.22749 + 0.160107 * rh - 0.01478 * tf;
  } else {
    m = 21.0606 + 0.005565 * rh * rh - 0.00035 * rh * tf - 0.483199 * rh;
  }
  const eta = 1 - 2 * (m / 30) + 1.5 * Math.pow(m / 30, 2) - 0.5 * Math.pow(m / 30, 3);
  const val = eta * Math.sqrt(1 + mph * mph) / 0.3002;
  return +clamp(val, 0, 100).toFixed(1);
}

function anySandboxActive() {
  return Object.values(state.sandbox).some(Boolean);
}

function getActiveBiome() {
  return state.biomes[state.activeBiomeIndex] || state.biomes[0];
}

function getAdjustedRecord(biome, rawRecord) {
  if (!biome || !rawRecord) return null;
  const norm = biome.norms[rawRecord.month - 1];
  if (!anySandboxActive()) {
    return {
      ...rawRecord,
      normVpdMean: norm.vpdMean,
      normFfwiMean: norm.ffwiMean,
      normTmaxMean: norm.tmaxMean,
      normRhMean: norm.rhMean
    };
  }

  let dTemp = 0;
  let dRh = 0;
  let windMult = 1;
  for (const [key, on] of Object.entries(state.sandbox)) {
    if (!on) continue;
    const mod = SANDBOX_DELTAS[key];
    dTemp += mod.temp;
    dRh += mod.rh;
    windMult *= mod.windMult;
  }

  const tmaxC = +(rawRecord.tmaxC + dTemp).toFixed(1);
  const rhPct = +clamp(rawRecord.rhPct + dRh, 5, 100).toFixed(1);
  const windMs = +Math.max(0.2, rawRecord.windMs * windMult).toFixed(2);
  const vpdKpa = computeVpdKpa(tmaxC, rhPct);
  const ffwi = computeFfwi(tmaxC, rhPct, windMs);

  const deltaVpd = +(vpdKpa - norm.vpdMean).toFixed(2);
  const deltaFfwi = +(ffwi - norm.ffwiMean).toFixed(1);
  const zVpd = deltaVpd / Math.max(0.05, norm.vpdStd);
  const zFfwi = deltaFfwi / Math.max(1.0, norm.ffwiStd);
  const zScore = +(0.6 * zVpd + 0.4 * zFfwi).toFixed(2);

  return {
    ...rawRecord,
    tmaxC,
    rhPct,
    windMs,
    vpdKpa,
    ffwi,
    deltaVpd,
    deltaFfwi,
    zScore,
    normVpdMean: norm.vpdMean,
    normFfwiMean: norm.ffwiMean,
    normTmaxMean: norm.tmaxMean,
    normRhMean: norm.rhMean
  };
}

function tensionColor(z) {
  if (z >= 2.5) return '#f43f5e';
  if (z >= 1.8) return '#fb7185';
  if (z >= 0.9) return '#fbbf24';
  if (z >= 0.0) return '#3ecf82';
  return '#a9c6e8';
}

function formatSigned(val, digits = 2, suffix = '') {
  const sign = val >= 0 ? '+' : '';
  return `${sign}${val.toFixed(digits)}${suffix}`;
}

function tierDisplayLabel(tier) {
  if (tier === 'dissonant') return 'Dissonant';
  if (tier === 'tense') return 'Tense';
  if (tier === 'moderate') return 'Moderate';
  return 'Consonant';
}

// =========================================================================
// Audio Setup (d3-audio + Tone.js)
// =========================================================================
async function ensureAudioStarted() {
  if (state.audioReady) return true;
  if (!Tone || !d3Audio) return false;

  if (window.PyroAudioUnlock) {
    await window.PyroAudioUnlock.enableAudio();
  }
  await Tone.start();
  d3Audio.defaultEngine.setTone(Tone);

  if (Tone.Destination && Tone.Destination.volume) {
    Tone.Destination.volume.value = state.isMuted ? -Infinity : -3;
  }

  padSynth = d3Audio.createSynth({
    type: 'polySynth',
    harmonicity: 1.5,
    modulationIndex: 4,
    volume: -14,
    envelope: { attack: 0.04, decay: 0.22, sustain: 0.45, release: 0.45 }
  });

  leadSynth = d3Audio.createSynth({
    type: 'fmSynth',
    harmonicity: 1.2,
    modulationIndex: 3,
    volume: -11,
    envelope: { attack: 0.01, decay: 0.14, sustain: 0.18, release: 0.28 }
  });

  emberSynth = d3Audio.createSynth({
    type: 'fmSynth',
    harmonicity: 3.5,
    modulationIndex: 14,
    volume: -18,
    envelope: { attack: 0.002, decay: 0.04, sustain: 0, release: 0.03 }
  });

  state.audioReady = true;
  const btn = document.getElementById('btn-audio-activate');
  if (btn) {
    btn.classList.add('is-active');
    btn.setAttribute('aria-pressed', 'true');
    btn.textContent = '🔊 Audio Ready';
  }
  return true;
}

function clearEmberTimers() {
  for (const id of state.emberTimers) {
    clearTimeout(id);
  }
  state.emberTimers = [];
}

function sonifyRecord(biome, adj, durationMs = 260) {
  if (!state.audioReady || state.isMuted || !biome || !adj) return;
  try {
    const positiveZ = Math.max(0, adj.zScore);
    const tensionInfo = tensionScale(positiveZ);
    const pan = panScale(biome.lon);
    const cutoff = Math.max(tensionInfo.filterCutoff, filterScale(adj.vpdKpa));
    const fireBonus = adj.eonetFires ? Math.min(1.0, Math.log1p(adj.eonetFires) * 0.45) : 0;
    const intensity = clamp(positiveZ + fireBonus, 0, 3.5);
    const note = pitchScale(intensity);
    const gain = gainScale(intensity);

    // Harmonic chord reflecting departure from 1991-2020 norm
    if (padSynth) {
      if (padSynth.synth && typeof padSynth.synth.set === 'function') {
        padSynth.synth.set({ detune: tensionInfo.detuneCents });
      }
      const chordDur = Math.max(0.24, (durationMs / 1000) * 1.15);
      padSynth.triggerAttackRelease(tensionInfo.chord, chordDur, undefined, 0.34 + tensionInfo.normalized * 0.24, {
        pan,
        filter: tensionInfo.filterCutoff
      });
    }

    // FM lead voice encodes instantaneous anomaly + active wildfire intensity
    if (leadSynth) {
      if (leadSynth.synth) {
        if (leadSynth.synth.harmonicity && typeof leadSynth.synth.harmonicity.value === 'number') {
          leadSynth.synth.harmonicity.value = 1.0 + tensionInfo.normalized * 1.65;
        }
        if (leadSynth.synth.modulationIndex && typeof leadSynth.synth.modulationIndex.value === 'number') {
          leadSynth.synth.modulationIndex.value = 1.8 + tensionInfo.normalized * 18.0;
        }
      }
      const leadVel = clamp(gain * 0.8, 0.15, 0.9);
      leadSynth.triggerAttackRelease(note, Math.max(0.14, durationMs / 1000), undefined, leadVel, {
        pan,
        filter: cutoff
      });
    }

    // Euclidean wind ember bursts
    if (emberSynth) {
      clearEmberTimers();
      const rInfo = rhythmScale(adj.windMs);
      const pattern = rInfo.pattern || [1, 0, 0, 0, 1, 0, 0, 0];
      const stepMs = durationMs / pattern.length;
      pattern.forEach((hit, idx) => {
        if (!hit) return;
        const tid = setTimeout(() => {
          if (state.isMuted || !emberSynth) return;
          const vel = 0.14 + tensionInfo.normalized * 0.32;
          emberSynth.triggerAttackRelease('C5', 0.035, undefined, vel, {
            pan: clamp(pan + (Math.random() - 0.5) * 0.2, -0.95, 0.95),
            filter: clamp(cutoff * 1.15, 600, 9600)
          });
        }, Math.round(idx * stepMs));
        state.emberTimers.push(tid);
      });
    }
  } catch (err) {
    console.warn('Sonification warning:', err);
  }
}

// =========================================================================
// Geometry Helpers: 26-Year Spiral centered around 3D Globe
// =========================================================================
function getMetricSpec(biome, adjRecords, innerR, outerR) {
  const metric = state.radiusMetric;

  if (metric === 'ffwi') {
    const peak = Math.max(45, Math.ceil((d3.max(adjRecords, (d) => d.ffwi) || 50) / 10) * 10);
    const scale = d3.scaleLinear().domain([0, peak]).range([innerR, outerR]).clamp(true);
    const candidates = [
      { value: 10, label: '10 Low', color: 'rgba(169, 198, 232, 0.25)', dash: '2 4' },
      { value: 20, label: '20 Elev', color: 'rgba(251, 191, 36, 0.32)', dash: '3 4' },
      { value: 35, label: '35 High', color: 'rgba(251, 113, 133, 0.42)', dash: '4 3' },
      { value: 50, label: '50 Red Flag', color: 'rgba(244, 63, 94, 0.55)', dash: '4 3' }
    ].filter((t) => t.value <= peak);
    return {
      title: 'Radial Axis: Fosberg Fire Weather Index (FFWI)',
      valueOf: (d) => d.ffwi,
      scale,
      rings: candidates
    };
  }

  if (metric === 'vpd') {
    const peak = Math.max(3.5, Math.ceil((d3.max(adjRecords, (d) => d.vpdKpa) || 3.5) * 2) / 2);
    const scale = d3.scaleLinear().domain([0, peak]).range([innerR, outerR]).clamp(true);
    const candidates = [
      { value: 1.0, label: '1.0 kPa', color: 'rgba(169, 198, 232, 0.25)', dash: '2 4' },
      { value: 2.0, label: '2.0 Dry', color: 'rgba(251, 191, 36, 0.35)', dash: '3 4' },
      { value: 3.0, label: '3.0 Arid', color: 'rgba(251, 113, 133, 0.45)', dash: '4 3' },
      { value: 4.0, label: '4.0 Extreme', color: 'rgba(244, 63, 94, 0.55)', dash: '4 3' }
    ].filter((t) => t.value <= peak);
    return {
      title: 'Radial Axis: Vapor Pressure Deficit (kPa)',
      valueOf: (d) => d.vpdKpa,
      scale,
      rings: candidates
    };
  }

  if (metric === 'eonet') {
    const maxFires = Math.max(50, d3.max(adjRecords, (d) => d.eonetFires || 0) || 50);
    const scale = d3.scaleLinear()
      .domain([0, Math.log1p(maxFires)])
      .range([innerR, outerR])
      .clamp(true);
    const rawTicks = [0, 5, 25, 100, 500].filter((v) => v <= maxFires * 1.05);
    const rings = rawTicks.map((v) => ({
      value: Math.log1p(v),
      label: v === 0 ? '0 fires' : `${v} fires`,
      color: v >= 100 ? 'rgba(244, 63, 94, 0.5)' : v >= 25 ? 'rgba(251, 191, 36, 0.35)' : 'rgba(169, 198, 232, 0.24)',
      dash: v >= 25 ? '4 3' : '2 4'
    }));
    return {
      title: 'Radial Axis: NASA EONET Wildfire Counts (Log Scale, 2015+)',
      valueOf: (d) => Math.log1p(d.eonetFires || 0),
      scale,
      rings
    };
  }

  // Default: 'sigma' — Standardized Departure from 1991-2020 Seasonal Normal
  const scale = d3.scaleLinear().domain([-1.5, 3.5]).range([innerR, outerR]).clamp(true);
  return {
    title: 'Radial Axis: Deviation from 1991–2020 Norm (σ)',
    valueOf: (d) => d.zScore,
    scale,
    rings: [
      { value: -1.0, label: '-1σ Wet', color: 'rgba(169, 198, 232, 0.25)', dash: '2 4' },
      { value: 0.0, label: '0σ Norm', color: 'rgba(62, 207, 130, 0.45)', dash: '4 3' },
      { value: 1.0, label: '+1σ Elev', color: 'rgba(251, 191, 36, 0.38)', dash: '3 4' },
      { value: 2.0, label: '+2σ Severe', color: 'rgba(251, 113, 133, 0.5)', dash: '4 3' },
      { value: 3.0, label: '+3σ+ Extreme', color: 'rgba(244, 63, 94, 0.58)', dash: '4 3' }
    ]
  };
}

function buildSpiralGeometry(biome) {
  const cx = 320;
  const cy = 307.5;
  const innerR = 104; // Clears 168px (r=84px) centered 3D globe
  const outerR = 266;

  const adjRecords = biome.records.map((rec) => getAdjustedRecord(biome, rec));
  const metricSpec = getMetricSpec(biome, adjRecords, innerR, outerR);

  const nodes = adjRecords.map((adj, i) => {
    const angle = ((adj.month - 1) / 12) * Math.PI * 2 - Math.PI / 2;
    const val = metricSpec.valueOf(adj);
    const r = clamp(metricSpec.scale(val), innerR, outerR);
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    return { i, angle, r, x, y, adj };
  });

  return { cx, cy, innerR, outerR, nodes, metricSpec };
}

function smoothSegmentPath(nodes, i) {
  // Exact centripetal Catmull-Rom (alpha=0.5) evaluation from nodes[i - 1] to nodes[i]
  // Avoids loops/overshoot when fire risk or EONET counts spike outward sharply.
  const p1 = nodes[i - 1];
  const p2 = nodes[i];
  const p0 = nodes[Math.max(0, i - 2)];
  const p3 = nodes[Math.min(nodes.length - 1, i + 1)];

  const stepT = (ti, a, b) => ti + Math.pow(Math.max(0.01, Math.hypot(b.x - a.x, b.y - a.y)), 0.5);
  const t0 = 0;
  const t1 = stepT(t0, p0, p1);
  const t2 = stepT(t1, p1, p2);
  const t3 = stepT(t2, p2, p3);

  const lerpPt = (a, b, ta, tb, t) => {
    const denom = tb - ta || 1e-4;
    const w1 = (tb - t) / denom;
    const w2 = (t - ta) / denom;
    return { x: w1 * a.x + w2 * b.x, y: w1 * a.y + w2 * b.y };
  };

  const steps = 6;
  const pts = [`M${p1.x.toFixed(2)},${p1.y.toFixed(2)}`];
  for (let s = 1; s <= steps; s++) {
    const t = t1 + ((t2 - t1) * s) / steps;
    const A1 = lerpPt(p0, p1, t0, t1, t);
    const A2 = lerpPt(p1, p2, t1, t2, t);
    const A3 = lerpPt(p2, p3, t2, t3, t);
    const B1 = lerpPt(A1, A2, t0, t2, t);
    const B2 = lerpPt(A2, A3, t1, t3, t);
    const C = lerpPt(B1, B2, t1, t2, t);
    pts.push(`L${C.x.toFixed(2)},${C.y.toFixed(2)}`);
  }
  return pts.join(' ');
}

const trailLineGen = d3.line()
  .x((d) => d.x)
  .y((d) => d.y)
  .curve(d3.curveCatmullRom.alpha(0.5));

function renderSpiral() {
  const biome = getActiveBiome();
  if (!biome) return;

  const svg = d3.select('#spiral-svg');
  svg.attr('viewBox', '0 0 640 615');
  svg.selectAll('*').remove();

  const { cx, cy, innerR, outerR, nodes, metricSpec } = buildSpiralGeometry(biome);
  svg.attr('aria-label', `${biome.name} 26-year fire-weather spiral. ${metricSpec.title}`);
  const g = svg.append('g');

  // Concentric fire-risk / threshold rings for the selected radial variable
  for (const ring of metricSpec.rings) {
    const r = metricSpec.scale(ring.value);
    g.append('circle')
      .attr('cx', cx)
      .attr('cy', cy)
      .attr('r', r)
      .attr('fill', 'none')
      .attr('stroke', ring.color)
      .attr('stroke-width', 1.15)
      .attr('stroke-dasharray', ring.dash);

    // Label along ~1:15 angle so HUD corners stay completely clear
    const labelAngle = -Math.PI / 3.4;
    g.append('text')
      .attr('x', cx + Math.cos(labelAngle) * r + 4)
      .attr('y', cy + Math.sin(labelAngle) * r - 3)
      .attr('fill', '#f0f7ee')
      .attr('font-size', '9.5px')
      .attr('font-weight', '700')
      .attr('font-family', 'ui-monospace, SFMono-Regular, Menlo, monospace')
      .text(ring.label);
  }

  // 12 Month Radial Spokes
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  months.forEach((name, m) => {
    const a = (m / 12) * Math.PI * 2 - Math.PI / 2;
    g.append('line')
      .attr('x1', cx + Math.cos(a) * (innerR - 6))
      .attr('y1', cy + Math.sin(a) * (innerR - 6))
      .attr('x2', cx + Math.cos(a) * (outerR + 8))
      .attr('y2', cy + Math.sin(a) * (outerR + 8))
      .attr('stroke', 'rgba(148, 163, 184, 0.16)')
      .attr('stroke-width', 1);

    g.append('text')
      .attr('x', cx + Math.cos(a) * (outerR + 22))
      .attr('y', cy + Math.sin(a) * (outerR + 22) + 3.5)
      .attr('text-anchor', 'middle')
      .attr('fill', '#a3bfa5')
      .attr('font-size', '11px')
      .attr('font-weight', '700')
      .text(name);
  });

  // Smooth centripetal Catmull-Rom curve segments drawn progressively up to current month (no faded future lines)
  const segGroup = g.append('g').attr('class', 'spiral-segments');
  for (let i = 1; i < nodes.length; i++) {
    const b = nodes[i];
    const z = b.adj.zScore;
    const width = 1.65 + Math.max(0, Math.min(3.5, z)) * 1.15;
    const age = state.monthIndex - i;
    segGroup.append('path')
      .attr('d', smoothSegmentPath(nodes, i))
      .attr('fill', 'none')
      .attr('stroke', tensionColor(z))
      .attr('stroke-width', width)
      .attr('stroke-linecap', 'round')
      .attr('opacity', age <= 24 ? 0.94 : 0.36)
      .style('display', i <= state.monthIndex ? null : 'none')
      .attr('data-idx', i);
  }

  // Gradual illuminated Catmull-Rom trailing head behind active playhead (3 glowing spline layers)
  const trailGroup = g.append('g').attr('class', 'needle-trail-group');
  trailGroup.append('path')
    .attr('id', 'trail-outer')
    .attr('fill', 'none')
    .attr('stroke', '#facc15')
    .attr('stroke-width', 3.0)
    .attr('stroke-linecap', 'round')
    .attr('opacity', 0.34);
  trailGroup.append('path')
    .attr('id', 'trail-mid')
    .attr('fill', 'none')
    .attr('stroke', '#fde047')
    .attr('stroke-width', 3.6)
    .attr('stroke-linecap', 'round')
    .attr('opacity', 0.58);
  trailGroup.append('path')
    .attr('id', 'trail-inner')
    .attr('fill', 'none')
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 2.4)
    .attr('stroke-linecap', 'round')
    .attr('opacity', 0.85);

  // Clickable month nodes + EONET outbreak flares (drawn up to current month only)
  const nodeGroup = g.append('g').attr('class', 'spiral-nodes');
  nodeGroup.selectAll('circle.spiral-node')
    .data(nodes)
    .join('circle')
    .attr('class', 'spiral-node')
    .attr('cx', (d) => d.x)
    .attr('cy', (d) => d.y)
    .attr('r', (d) => {
      if (d.adj.eonetFires && d.adj.eonetFires > 0) {
        return clamp(3.0 + Math.sqrt(d.adj.eonetFires) * 0.48, 3.2, 8.5);
      }
      return d.adj.zScore >= 1.8 ? 3.2 : 1.8;
    })
    .attr('fill', (d) => {
      if (d.adj.eonetFires && d.adj.eonetFires > 0) return '#facc15';
      return d.adj.zScore >= 1.8 ? tensionColor(d.adj.zScore) : 'rgba(226, 232, 240, 0.45)';
    })
    .attr('stroke', (d) => (d.adj.eonetFires > 0 ? '#f43f5e' : 'none'))
    .attr('stroke-width', (d) => (d.adj.eonetFires > 0 ? 1.2 : 0))
    .attr('opacity', (d) => (d.adj.eonetFires > 0 || d.adj.zScore >= 1.5 ? 0.94 : 0.5))
    .style('display', (d) => (d.i <= state.monthIndex ? null : 'none'))
    .style('cursor', 'pointer')
    .on('click', (_ev, d) => {
      jumpToMonth(d.i, true);
    })
    .append('title')
    .text((d) => {
      const f = d.adj.eonetFires === null ? 'Pre-EONET' : `${d.adj.eonetFires} EONET fires`;
      return `${d.adj.ym} (${d.adj.monthName}) · ${formatSigned(d.adj.zScore, 2, 'σ')} · VPD ${d.adj.vpdKpa} kPa (${formatSigned(d.adj.deltaVpd)}) · FFWI ${d.adj.ffwi} · ${f}`;
    });

  // Sweeping luminous playhead beam anchored at outer edge of center globe -> active point
  const cur = nodes[state.monthIndex] || nodes[0];
  const beamX1 = cx + Math.cos(cur.angle) * (innerR - 14);
  const beamY1 = cy + Math.sin(cur.angle) * (innerR - 14);

  g.append('line')
    .attr('id', 'spiral-needle')
    .attr('x1', beamX1)
    .attr('y1', beamY1)
    .attr('x2', cur.x)
    .attr('y2', cur.y)
    .attr('stroke', '#facc15')
    .attr('stroke-width', 2)
    .attr('stroke-dasharray', '3 3')
    .attr('opacity', 0.88);

  g.append('circle')
    .attr('id', 'spiral-head')
    .attr('cx', cur.x)
    .attr('cy', cur.y)
    .attr('r', 8.5)
    .attr('fill', tensionColor(cur.adj.zScore))
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 2.4);

  state._spiralNodes = nodes;
  state._spiralCx = cx;
  state._spiralCy = cy;
  state._spiralInnerR = innerR;

  updateSpiralTrail(svg, nodes);
}

function updateSpiralTrail(svg, nodes) {
  const end = state.monthIndex + 1;
  const sliceOuter = nodes.slice(Math.max(0, end - 24), end);
  const sliceMid = nodes.slice(Math.max(0, end - 14), end);
  const sliceInner = nodes.slice(Math.max(0, end - 7), end);

  svg.select('#trail-outer').attr('d', sliceOuter.length > 1 ? trailLineGen(sliceOuter) : null);
  svg.select('#trail-mid').attr('d', sliceMid.length > 1 ? trailLineGen(sliceMid) : null);
  svg.select('#trail-inner').attr('d', sliceInner.length > 1 ? trailLineGen(sliceInner) : null);
}

function updateSpiralPlayhead() {
  const nodes = state._spiralNodes;
  if (!nodes || !nodes.length) return;
  const cur = nodes[state.monthIndex] || nodes[0];
  const svg = d3.select('#spiral-svg');

  svg.selectAll('.spiral-segments path')
    .style('display', function () {
      const idx = +this.getAttribute('data-idx');
      return idx <= state.monthIndex ? null : 'none';
    })
    .attr('opacity', function () {
      const idx = +this.getAttribute('data-idx');
      return state.monthIndex - idx <= 24 ? 0.94 : 0.36;
    });

  svg.selectAll('.spiral-nodes circle.spiral-node')
    .style('display', (d) => (d.i <= state.monthIndex ? null : 'none'));

  updateSpiralTrail(svg, nodes);

  const cx = state._spiralCx;
  const cy = state._spiralCy;
  const innerR = state._spiralInnerR;

  svg.select('#spiral-needle')
    .attr('x1', cx + Math.cos(cur.angle) * (innerR - 14))
    .attr('y1', cy + Math.sin(cur.angle) * (innerR - 14))
    .attr('x2', cur.x)
    .attr('y2', cur.y);

  const head = svg.select('#spiral-head')
    .attr('cx', cur.x)
    .attr('cy', cur.y)
    .attr('fill', tensionColor(cur.adj.zScore));

  if (!state.prefersReducedMotion && cur.adj.zScore >= 1.5 && head.node()) {
    glowBeat(head.node());
  }
}

// =========================================================================
// Central 3D Orthographic Globe (Geo Context inside Spiral Core)
// =========================================================================
function renderCenterGlobe() {
  if (!state.worldGeo) return;
  const biome = getActiveBiome();
  if (!biome) return;

  const svg = d3.select('#globe-svg');
  svg.selectAll('*').remove();

  const width = 256;
  const height = 256;
  const cx = 128;
  const cy = 128;
  const radius = 122;

  const defs = svg.append('defs');
  const oceanGrad = defs.append('radialGradient')
    .attr('id', 'ocean-grad')
    .attr('cx', '35%')
    .attr('cy', '30%');
  oceanGrad.append('stop').attr('offset', '0%').attr('stop-color', '#0b2e1c');
  oceanGrad.append('stop').attr('offset', '75%').attr('stop-color', '#071a0f');
  oceanGrad.append('stop').attr('offset', '100%').attr('stop-color', '#020805');

  const projection = d3.geoOrthographic()
    .scale(radius)
    .translate([cx, cy])
    .clipAngle(90)
    .rotate(state.globeRotation);

  const path = d3.geoPath(projection);

  // Ocean sphere
  svg.append('path')
    .datum({ type: 'Sphere' })
    .attr('d', path)
    .attr('fill', 'url(#ocean-grad)')
    .attr('stroke', 'rgba(62, 207, 130, 0.35)')
    .attr('stroke-width', 1.2);

  // Graticule
  const graticule = d3.geoGraticule().step([30, 30]);
  svg.append('path')
    .datum(graticule())
    .attr('class', 'globe-graticule')
    .attr('d', path)
    .attr('fill', 'none')
    .attr('stroke', 'rgba(62, 207, 130, 0.14)')
    .attr('stroke-width', 0.65);

  // Landmasses
  const landGroup = svg.append('g');
  landGroup.selectAll('path.country')
    .data(state.worldGeo.features)
    .join('path')
    .attr('class', 'country globe-geo')
    .attr('d', path)
    .attr('fill', '#1d5a3a')
    .attr('stroke', 'rgba(163, 191, 165, 0.3)')
    .attr('stroke-width', 0.55);

  // Active Biome Bounding Box Polygon
  const [w, s, e, n] = biome.bbox;
  const bboxFeature = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]]
    }
  };

  svg.append('path')
    .datum(bboxFeature)
    .attr('id', 'globe-biome-bbox')
    .attr('class', 'globe-geo')
    .attr('d', path)
    .attr('fill', biome.color)
    .attr('fill-opacity', 0.24)
    .attr('stroke', biome.color)
    .attr('stroke-width', 2.0);

  // Hotspots layer
  const hotspotGroup = svg.append('g').attr('id', 'globe-hotspots');
  drawGlobeHotspots(hotspotGroup, projection, biome);

  // Center beacon crosshair on active biome
  const centerPt = projection([biome.lon, biome.lat]);
  if (centerPt) {
    svg.append('circle')
      .attr('id', 'globe-biome-pin')
      .attr('cx', centerPt[0])
      .attr('cy', centerPt[1])
      .attr('r', 5)
      .attr('fill', 'none')
      .attr('stroke', '#facc15')
      .attr('stroke-width', 2);
  }
}

function drawGlobeHotspots(container, projection, activeBiome) {
  const spots = (state.dataset && state.dataset.hotspots) || [];
  const centerRotate = projection.rotate();
  const viewCenter = [-centerRotate[0], -centerRotate[1]];

  const visibleSpots = spots.filter((sp) => d3.geoDistance([sp.lon, sp.lat], viewCenter) < Math.PI / 2);

  container.selectAll('circle.hotspot')
    .data(visibleSpots)
    .join('circle')
    .attr('class', 'hotspot')
    .attr('cx', (d) => {
      const p = projection([d.lon, d.lat]);
      return p ? p[0] : -100;
    })
    .attr('cy', (d) => {
      const p = projection([d.lon, d.lat]);
      return p ? p[1] : -100;
    })
    .attr('r', (d) => {
      const inBiome = d.biome === activeBiome.id;
      const base = clamp(1.3 + Math.sqrt(d.frp || 20) * 0.22, 1.5, 4.6);
      return inBiome ? base * 1.3 : base * 0.85;
    })
    .attr('fill', (d) => (d.biome === activeBiome.id ? '#facc15' : '#f43f5e'))
    .attr('fill-opacity', (d) => (d.biome === activeBiome.id ? 0.92 : 0.58));
}

function rotateGlobeToBiome(biome) {
  if (!state.worldGeo || !biome) return;
  const target = [-biome.lon, -biome.lat];
  const start = state.globeRotation.slice();

  if (state.prefersReducedMotion) {
    state.globeRotation = target;
    renderCenterGlobe();
    return;
  }

  const interp = d3.interpolate(start, target);
  const svg = d3.select('#globe-svg');
  const projection = d3.geoOrthographic().scale(122).translate([128, 128]).clipAngle(90);
  const path = d3.geoPath(projection);
  const graticule = d3.geoGraticule().step([30, 30])();

  const [w, s, e, n] = biome.bbox;
  const bboxFeature = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[w, s], [e, s], [e, n], [w, n], [w, s]]]
    }
  };

  svg.transition('globe-rot')
    .duration(650)
    .ease(d3.easeCubicOut)
    .tween('rotate', () => (t) => {
      state.globeRotation = interp(t);
      projection.rotate(state.globeRotation);
      svg.select('.globe-graticule').attr('d', path(graticule));
      svg.selectAll('path.country').attr('d', path);
      svg.select('#globe-biome-bbox')
        .datum(bboxFeature)
        .attr('d', path)
        .attr('fill', biome.color)
        .attr('stroke', biome.color);

      const pin = projection([biome.lon, biome.lat]);
      if (pin) {
        svg.select('#globe-biome-pin').attr('cx', pin[0]).attr('cy', pin[1]).attr('opacity', 1);
      } else {
        svg.select('#globe-biome-pin').attr('opacity', 0);
      }

      drawGlobeHotspots(svg.select('#globe-hotspots'), projection, biome);
    });
}

// =========================================================================
// Sidebar Scatter Plot: 1991-2020 Norm Deviation (σ) vs FFWI
// =========================================================================
function renderScatterPlot() {
  const biome = getActiveBiome();
  if (!biome) return;

  const svg = d3.select('#scatter-svg');
  svg.attr('viewBox', '0 0 350 195');
  svg.selectAll('*').remove();

  const adjRecords = biome.records.map((r) => getAdjustedRecord(biome, r));
  const xMin = Math.min(-2.0, d3.min(adjRecords, (d) => d.zScore) - 0.25);
  const xMax = Math.max(3.4, d3.max(adjRecords, (d) => d.zScore) + 0.25);
  const yMax = Math.max(25, (d3.max(adjRecords, (d) => d.ffwi) || 30) * 1.1);

  const margin = { top: 14, right: 14, bottom: 28, left: 36 };
  const x = d3.scaleLinear().domain([xMin, xMax]).range([margin.left, 350 - margin.right]);
  const y = d3.scaleLinear().domain([0, yMax]).range([195 - margin.bottom, margin.top]);

  // 0σ Normal reference line & +2σ Severe Anomaly reference line
  svg.append('line')
    .attr('x1', x(0)).attr('y1', margin.top)
    .attr('x2', x(0)).attr('y2', 195 - margin.bottom)
    .attr('stroke', 'rgba(62, 207, 130, 0.45)')
    .attr('stroke-dasharray', '3 3');

  svg.append('line')
    .attr('x1', x(2.0)).attr('y1', margin.top)
    .attr('x2', x(2.0)).attr('y2', 195 - margin.bottom)
    .attr('stroke', 'rgba(244, 63, 94, 0.48)')
    .attr('stroke-dasharray', '3 3');

  svg.append('text')
    .attr('x', x(0) + 3).attr('y', margin.top + 9)
    .attr('fill', '#3ecf82').attr('font-size', '9px').text('0σ Norm');

  svg.append('text')
    .attr('x', x(2.0) + 3).attr('y', margin.top + 9)
    .attr('fill', '#fb7185').attr('font-size', '9px').text('+2σ Severe');

  svg.append('g')
    .attr('transform', `translate(0,${195 - margin.bottom})`)
    .call(d3.axisBottom(x).ticks(5).tickFormat((d) => `${d >= 0 ? '+' : ''}${d}σ`))
    .attr('color', '#a3bfa5')
    .attr('font-size', '9.5px');

  svg.append('g')
    .attr('transform', `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(4))
    .attr('color', '#a3bfa5')
    .attr('font-size', '9.5px');

  svg.selectAll('circle.scatter-dot')
    .data(adjRecords)
    .join('circle')
    .attr('class', 'scatter-dot')
    .attr('cx', (d) => x(d.zScore))
    .attr('cy', (d) => y(d.ffwi))
    .attr('r', (d) => (d.eonetFires > 0 ? 3.5 : 2.1))
    .attr('fill', (d) => tensionColor(d.zScore))
    .attr('stroke', (d) => (d.eonetFires > 0 ? '#ffffff' : 'none'))
    .attr('stroke-width', 0.7)
    .attr('opacity', 0.72)
    .attr('data-idx', (_d, idx) => idx);

  const cur = adjRecords[state.monthIndex] || adjRecords[0];
  svg.append('circle')
    .attr('id', 'scatter-active-dot')
    .attr('cx', x(cur.zScore))
    .attr('cy', y(cur.ffwi))
    .attr('r', 6.5)
    .attr('fill', tensionColor(cur.zScore))
    .attr('stroke', '#ffffff')
    .attr('stroke-width', 2.2);

  state._scatterX = x;
  state._scatterY = y;
}

function updateScatterActiveDot(adj) {
  if (!state._scatterX || !state._scatterY || !adj) return;
  d3.select('#scatter-active-dot')
    .attr('cx', state._scatterX(adj.zScore))
    .attr('cy', state._scatterY(adj.ffwi))
    .attr('fill', tensionColor(adj.zScore));
}

// =========================================================================
// Telemetry HUDs, Danger Badge, Table & Audio Legend
// =========================================================================
function updateHudAndSidebar() {
  const biome = getActiveBiome();
  if (!biome) return;
  const raw = biome.records[state.monthIndex] || biome.records[0];
  const adj = getAdjustedRecord(biome, raw);
  const tensionInfo = tensionScale(Math.max(0, adj.zScore));
  const cutoff = Math.round(Math.max(tensionInfo.filterCutoff, filterScale(adj.vpdKpa)));

  // Corner HUDs
  document.getElementById('spiral-biome-name').textContent = biome.name;
  document.getElementById('spiral-date-val').textContent = `${adj.ym} · ${adj.monthName}`;
  document.getElementById('spiral-sigma-val').textContent = formatSigned(adj.zScore, 2, ' σ');
  document.getElementById('spiral-sigma-val').style.color = tensionColor(adj.zScore);

  document.getElementById('spiral-ffwi-val').textContent = `FFWI ${adj.ffwi.toFixed(1)} (${formatSigned(adj.deltaFfwi, 1)})`;
  document.getElementById('spiral-vpd-val').textContent = `${adj.vpdKpa.toFixed(2)} (${formatSigned(adj.deltaVpd, 2)})`;
  document.getElementById('spiral-rhwind-val').textContent = `${adj.rhPct.toFixed(0)}% · ${adj.windMs.toFixed(1)} m/s`;

  document.getElementById('spiral-fires-val').textContent =
    adj.eonetFires === null ? 'Pre-EONET' : String(adj.eonetFires);
  document.getElementById('spiral-modis-val').textContent = String(biome.modis7dCount);
  document.getElementById('spiral-frp-val').textContent = `${Math.round(biome.modis7dFrpMw)} MW`;

  document.getElementById('spiral-tension-tier').textContent = tierDisplayLabel(tensionInfo.tier);
  document.getElementById('spiral-tension-tier').style.color = tensionColor(adj.zScore);
  document.getElementById('spiral-chord-val').textContent = tensionInfo.chord.join(' ');
  document.getElementById('spiral-filter-val').textContent =
    `+${Math.round(tensionInfo.detuneCents)}¢ · ${cutoff.toLocaleString()} Hz`;

  // Sidebar slider & stat cards
  const slider = document.getElementById('month-slider');
  slider.max = Math.max(0, biome.records.length - 1);
  slider.value = state.monthIndex;
  document.getElementById('month-slider-label').textContent =
    `${adj.ym} · ${adj.monthName} ${adj.year}`;

  const dTempNorm = adj.tmaxC - adj.normTmaxMean;
  const dRhNorm = adj.rhPct - adj.normRhMean;
  document.getElementById('stat-temp').textContent = `${adj.tmaxC.toFixed(1)}°C (${formatSigned(dTempNorm, 1)})`;
  document.getElementById('stat-rh').textContent = `${adj.rhPct.toFixed(0)}% (${formatSigned(dRhNorm, 0)})`;
  document.getElementById('stat-wind').textContent = `${adj.windMs.toFixed(1)} m/s · ${adj.precipMm.toFixed(1)} mm`;
  document.getElementById('stat-sigma').textContent = formatSigned(adj.zScore, 2, ' σ');
  document.getElementById('stat-sigma').style.color = tensionColor(adj.zScore);

  // Header status badge reflecting departure from norm
  const badge = document.getElementById('danger-badge');
  badge.className = 'status-badge';
  if (adj.zScore >= 2.0) {
    badge.classList.add('danger');
    badge.textContent = `● Extreme Departure (${formatSigned(adj.zScore, 2, 'σ')})`;
    if (!state.prefersReducedMotion) pulseAlert(badge);
  } else if (adj.zScore >= 0.9) {
    badge.classList.add('warn');
    badge.textContent = `● Elevated Departure (${formatSigned(adj.zScore, 2, 'σ')})`;
  } else {
    badge.classList.add('safe');
    badge.textContent = `● Near Normal (${formatSigned(adj.zScore, 2, 'σ')})`;
  }

  // Central globe border glow synced to tension
  const globeBox = document.querySelector('.center-globe-box');
  if (globeBox) {
    const col = tensionColor(adj.zScore);
    globeBox.style.borderColor = adj.zScore >= 1.5 ? col : 'rgba(62, 207, 130, 0.45)';
  }

  // Highlight active row in table
  document.querySelectorAll('#monthly-table-body tr').forEach((tr) => {
    const rowIdx = Number(tr.dataset.idx);
    tr.classList.toggle('is-current-row', rowIdx === state.monthIndex);
  });

  // Throttled live announcer for screen readers
  if (Math.abs(state.monthIndex - state.lastAnnouncedMonth) >= 12 || !state.isPlaying) {
    state.lastAnnouncedMonth = state.monthIndex;
    const sr = document.getElementById('sr-live-announcer');
    if (sr) {
      sr.textContent = `${biome.name}, ${adj.ym}: deviation ${formatSigned(adj.zScore, 2, ' sigma')}, harmony ${tierDisplayLabel(tensionInfo.tier)}.`;
    }
  }

  updateScatterActiveDot(adj);
}

function renderMonthlyTable() {
  const biome = getActiveBiome();
  const tbody = document.getElementById('monthly-table-body');
  if (!biome || !tbody) return;

  const rows = [];
  biome.records.forEach((raw, idx) => {
    const adj = getAdjustedRecord(biome, raw);
    const isAnomaly = Math.abs(adj.zScore) >= 1.0 || (adj.eonetFires !== null && adj.eonetFires > 0);
    if (state.tableFilter === 'anomalies' && !isAnomaly) return;
    rows.push({ idx, adj });
  });

  tbody.innerHTML = '';
  const frag = document.createDocumentFragment();

  for (const { idx, adj } of rows) {
    const tInfo = tensionScale(Math.max(0, adj.zScore));
    const tr = document.createElement('tr');
    tr.dataset.idx = String(idx);
    tr.style.cursor = 'pointer';
    if (idx === state.monthIndex) tr.classList.add('is-current-row');

    const eonetStr = adj.eonetFires === null ? '—' : String(adj.eonetFires);
    tr.innerHTML = `
      <th scope="row">${adj.ym} (${adj.monthName})</th>
      <td style="color: ${tensionColor(adj.zScore)}; font-weight: 800;">${formatSigned(adj.zScore, 2, 'σ')}</td>
      <td>${adj.vpdKpa.toFixed(2)} (${formatSigned(adj.deltaVpd, 2)})</td>
      <td>${adj.ffwi.toFixed(1)} (${formatSigned(adj.deltaFfwi, 1)})</td>
      <td>${adj.tmaxC.toFixed(1)}°C / ${adj.rhPct.toFixed(0)}%</td>
      <td>${tierDisplayLabel(tInfo.tier)}</td>
      <td>${eonetStr}</td>
    `;

    tr.addEventListener('click', () => {
      jumpToMonth(idx, true);
      window.scrollTo({ top: 0, behavior: state.prefersReducedMotion ? 'auto' : 'smooth' });
    });
    frag.appendChild(tr);
  }

  tbody.appendChild(frag);
}

function renderAudioLegend() {
  const mount = document.getElementById('legend-mount');
  if (!mount || typeof d3Audio.audioLegend !== 'function') return;
  mount.innerHTML = '';

  try {
    const legend = d3Audio.audioLegend()
      .title('d3-audio · Norm Deviation & Fire-Weather Encoding')
      .tension(tensionScale, '1991–2020 Deviation (σ)')
      .pitch(pitchScale, 'Anomaly & Fire Intensity')
      .filter(filterScale, 'VPD Dryness (kPa)')
      .gain(gainScale, 'Fire Risk Amplitude')
      .pan(panScale, 'Biome Longitude');

    d3.select(mount).call(legend);
  } catch (err) {
    console.warn('Audio legend render note:', err);
  }
}

function renderBiomeControls() {
  const pillsHost = document.getElementById('biome-pills');
  const select = document.getElementById('biome-select');
  pillsHost.innerHTML = '';
  select.innerHTML = '';

  state.biomes.forEach((b, i) => {
    const opt = document.createElement('option');
    opt.value = String(i);
    opt.textContent = `${b.name} (Peak +${b.peakAnomaly.zScore.toFixed(2)}σ in ${b.peakAnomaly.ym})`;
    select.appendChild(opt);

    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'biome-pill';
    pill.setAttribute('aria-pressed', String(i === state.activeBiomeIndex));
    pill.innerHTML = `<span class="biome-dot" style="background:${b.color}"></span><span>${b.name}</span>`;
    pill.addEventListener('click', () => selectBiome(i));
    pillsHost.appendChild(pill);
  });

  select.value = String(state.activeBiomeIndex);
  document.getElementById('biome-driver-text').textContent = getActiveBiome().driver;
}

// =========================================================================
// Playback Loop & Navigation Actions
// =========================================================================
function stepPlayback() {
  if (!state.isPlaying) return;
  const biome = getActiveBiome();
  if (!biome) return;

  state.monthIndex = (state.monthIndex + 1) % biome.records.length;
  updateSpiralPlayhead();
  updateHudAndSidebar();

  const adj = getAdjustedRecord(biome, biome.records[state.monthIndex]);
  const tensionInfo = tensionScale(Math.max(0, adj.zScore));
  // Speed couples gently with harmonic tension so intense anomalies accelerate slightly
  const baseMs = 240 / state.speed;
  const stepMs = Math.max(70, Math.round(baseMs / (0.85 + tensionInfo.tempoMultiplier * 0.25)));

  sonifyRecord(biome, adj, stepMs);
  state.timerId = setTimeout(stepPlayback, stepMs);
}

async function togglePlay() {
  await ensureAudioStarted();
  state.isPlaying = !state.isPlaying;
  const btn = document.getElementById('btn-play-pause');

  if (state.isPlaying) {
    btn.textContent = '⏸ Pause Cycle';
    stepPlayback();
  } else {
    btn.textContent = '▶ Play 2001–2026';
    clearTimeout(state.timerId);
    clearEmberTimers();
  }
}

function selectBiome(index) {
  state.activeBiomeIndex = index;
  const biome = getActiveBiome();
  state.monthIndex = Math.min(state.monthIndex, biome.records.length - 1);

  document.getElementById('biome-select').value = String(index);
  document.getElementById('biome-driver-text').textContent = biome.driver;
  document.querySelectorAll('.biome-pill').forEach((el, i) => {
    el.setAttribute('aria-pressed', String(i === index));
  });

  renderSpiral();
  renderScatterPlot();
  renderMonthlyTable();
  updateHudAndSidebar();
  rotateGlobeToBiome(biome);

  if (state.audioReady) {
    const adj = getAdjustedRecord(biome, biome.records[state.monthIndex]);
    sonifyRecord(biome, adj, 380);
  }
}

async function jumpToMonth(idx, audition = true) {
  const biome = getActiveBiome();
  if (!biome) return;
  state.monthIndex = clamp(idx, 0, biome.records.length - 1);
  updateSpiralPlayhead();
  updateHudAndSidebar();

  if (audition) {
    await ensureAudioStarted();
    const adj = getAdjustedRecord(biome, biome.records[state.monthIndex]);
    sonifyRecord(biome, adj, 420);
  }
}

function wireEvents() {
  document.getElementById('btn-audio-activate').addEventListener('click', async () => {
    await ensureAudioStarted();
    const biome = getActiveBiome();
    const adj = getAdjustedRecord(biome, biome.records[state.monthIndex]);
    sonifyRecord(biome, adj, 450);
  });

  document.getElementById('btn-mute-audio').addEventListener('click', (e) => {
    state.isMuted = !state.isMuted;
    e.currentTarget.setAttribute('aria-pressed', String(state.isMuted));
    e.currentTarget.textContent = state.isMuted ? '🔈 Unmute' : '🔇 Mute';
    if (Tone && Tone.Destination && Tone.Destination.volume) {
      Tone.Destination.volume.value = state.isMuted ? -Infinity : -3;
    }
    if (state.isMuted) clearEmberTimers();
  });

  document.getElementById('btn-play-pause').addEventListener('click', togglePlay);

  document.querySelectorAll('.btn-speed').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.speed = Number(btn.dataset.speed);
      document.querySelectorAll('.btn-speed').forEach((b) => {
        b.setAttribute('aria-pressed', String(b === btn));
      });
    });
  });

  document.querySelectorAll('.btn-metric').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.radiusMetric = btn.dataset.metric;
      document.querySelectorAll('.btn-metric').forEach((b) => {
        b.setAttribute('aria-pressed', String(b === btn));
      });

      const biome = getActiveBiome();
      if (state.radiusMetric === 'eonet' && biome) {
        const cur = biome.records[state.monthIndex];
        if (cur && cur.year < 2015) {
          let bestIdx = biome.records.findIndex((r) => r.year >= 2015);
          let bestFires = -1;
          biome.records.forEach((r, i) => {
            if ((r.eonetFires || 0) > bestFires) {
              bestFires = r.eonetFires || 0;
              bestIdx = i;
            }
          });
          if (bestIdx >= 0) state.monthIndex = bestIdx;
        }
      }

      renderSpiral();
      updateHudAndSidebar();
      if (state.audioReady && biome) {
        const adj = getAdjustedRecord(biome, biome.records[state.monthIndex]);
        sonifyRecord(biome, adj, 400);
      }
    });
  });

  document.getElementById('biome-select').addEventListener('change', (e) => {
    selectBiome(Number(e.target.value));
  });

  document.getElementById('month-slider').addEventListener('input', (e) => {
    jumpToMonth(Number(e.target.value), false);
  });
  document.getElementById('month-slider').addEventListener('change', (e) => {
    jumpToMonth(Number(e.target.value), true);
  });

  document.getElementById('btn-jump-start').addEventListener('click', () => {
    jumpToMonth(0, true);
  });

  document.getElementById('btn-jump-eonet').addEventListener('click', () => {
    const biome = getActiveBiome();
    const idx = biome.records.findIndex((r) => r.year >= 2015);
    jumpToMonth(idx >= 0 ? idx : 0, true);
  });

  document.getElementById('btn-jump-peak').addEventListener('click', () => {
    const biome = getActiveBiome();
    let bestIdx = 0;
    let bestZ = -Infinity;
    biome.records.forEach((raw, i) => {
      const adj = getAdjustedRecord(biome, raw);
      if (adj.zScore > bestZ) {
        bestZ = adj.zScore;
        bestIdx = i;
      }
    });
    jumpToMonth(bestIdx, true);
  });

  document.querySelectorAll('.btn-sandbox').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const key = btn.dataset.mod;
      state.sandbox[key] = !state.sandbox[key];
      btn.setAttribute('aria-pressed', String(state.sandbox[key]));

      renderSpiral();
      renderScatterPlot();
      renderMonthlyTable();
      updateHudAndSidebar();

      if (state.audioReady) {
        const biome = getActiveBiome();
        const adj = getAdjustedRecord(biome, biome.records[state.monthIndex]);
        sonifyRecord(biome, adj, 440);
      }
    });
  });

  document.getElementById('btn-filter-anomalies').addEventListener('click', () => {
    state.tableFilter = 'anomalies';
    document.getElementById('btn-filter-anomalies').setAttribute('aria-pressed', 'true');
    document.getElementById('btn-filter-all').setAttribute('aria-pressed', 'false');
    renderMonthlyTable();
  });

  document.getElementById('btn-filter-all').addEventListener('click', () => {
    state.tableFilter = 'all';
    document.getElementById('btn-filter-anomalies').setAttribute('aria-pressed', 'false');
    document.getElementById('btn-filter-all').setAttribute('aria-pressed', 'true');
    renderMonthlyTable();
  });

  document.getElementById('btn-refresh-live').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    btn.textContent = '🛰️ Fetching…';
    try {
      const res = await fetch('./api/live-modis');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const live = await res.json();
      if (live && Array.isArray(live.hotspots) && live.hotspots.length) {
        state.dataset.hotspots = live.hotspots;
        state.dataset.totalModis7dGlobal = live.totalGlobal || live.hotspots.length;
        renderCenterGlobe();
        document.getElementById('dataset-meta').textContent =
          `Live 24h FIRMS refreshed (${live.totalGlobal.toLocaleString()} global detections)`;
      }
    } catch (err) {
      console.warn('Live MODIS refresh unavailable on static host:', err);
      document.getElementById('dataset-meta').textContent =
        'Static archive mode (run Docker/Node server for live 24h /api/live-modis refresh)';
    } finally {
      btn.disabled = false;
      btn.textContent = '🛰️ Live 24h';
    }
  });
}

let flybyController = null;
let flybyControllerPromise = null;

async function getFlybyController() {
  if (flybyController) return flybyController;
  if (!flybyControllerPromise) {
    flybyControllerPromise = import('./flyby.js').then(({ createFlybyController }) => {
      flybyController = createFlybyController({
        getState: () => state,
        ensureAudioStarted,
        tensionScale,
        pitchScale
      });
      return flybyController;
    });
  }
  return flybyControllerPromise;
}

function activatePageTab(tabId, { focusTab = false, updateHash = true } = {}) {
  const tabs = Array.from(document.querySelectorAll('.page-tab[role="tab"]'));
  const targetTab = tabs.find((t) => t.id === tabId) || tabs[0];
  if (!targetTab) return;

  tabs.forEach((tab) => {
    const selected = tab === targetTab;
    tab.setAttribute('aria-selected', String(selected));
    tab.setAttribute('tabindex', selected ? '0' : '-1');
    const panelId = tab.getAttribute('aria-controls');
    const panel = panelId ? document.getElementById(panelId) : null;
    if (panel) panel.hidden = !selected;
  });

  if (targetTab.id === 'tab-iowa') {
    if (state.isPlaying) togglePlay();
    flybyController?.setActive(false);
    const frame = document.getElementById('midwest-map-frame');
    if (frame) {
      if (!frame.getAttribute('src') && frame.dataset.src) {
        frame.src = frame.dataset.src;
      } else if (frame.contentWindow) {
        frame.contentWindow.dispatchEvent(new Event('resize'));
      }
    }
  } else if (targetTab.id === 'tab-flyby') {
    if (state.isPlaying) togglePlay();
    getFlybyController()
      .then((ctrl) => {
        ctrl.syncMonth(state.monthIndex);
        return ctrl.setActive(true);
      })
      .catch((err) => console.error('Failed to activate flyby view:', err));
  } else {
    flybyController?.setActive(false);
  }

  if (focusTab) targetTab.focus();
  if (updateHash && window.history && window.history.replaceState) {
    let hash = '#spiral';
    if (targetTab.id === 'tab-iowa') hash = '#iowa-map';
    else if (targetTab.id === 'tab-flyby') hash = '#flyby';
    window.history.replaceState(null, '', hash);
  }
}

function wirePageTabs() {
  const tabs = Array.from(document.querySelectorAll('.page-tab[role="tab"]'));
  if (!tabs.length) return;

  tabs.forEach((tab, idx) => {
    tab.addEventListener('click', () => activatePageTab(tab.id));
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        activatePageTab(tabs[(idx + 1) % tabs.length].id, { focusTab: true });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        activatePageTab(tabs[(idx - 1 + tabs.length) % tabs.length].id, { focusTab: true });
      } else if (e.key === 'Home') {
        e.preventDefault();
        activatePageTab(tabs[0].id, { focusTab: true });
      } else if (e.key === 'End') {
        e.preventDefault();
        activatePageTab(tabs[tabs.length - 1].id, { focusTab: true });
      }
    });
  });

  const syncFromHash = () => {
    const h = window.location.hash;
    if (h === '#iowa-map' || h === '#tab-iowa') {
      activatePageTab('tab-iowa', { updateHash: false });
    } else if (h === '#flyby' || h === '#tab-flyby') {
      activatePageTab('tab-flyby', { updateHash: false });
    } else if (h === '#spiral' || h === '#tab-spiral') {
      activatePageTab('tab-spiral', { updateHash: false });
    }
  };

  window.addEventListener('hashchange', syncFromHash);
  syncFromHash();
}

// =========================================================================
// Bootstrap
// =========================================================================
async function init() {
  try {
    const [dataRes, worldRes] = await Promise.all([
      fetch('./data/fire_weather_data.json'),
      fetch('./vendor/countries-110m.json')
    ]);
    if (!dataRes.ok) throw new Error(`Dataset HTTP ${dataRes.status}`);
    if (!worldRes.ok) throw new Error(`World map HTTP ${worldRes.status}`);
    const dataset = await dataRes.json();
    const world = await worldRes.json();

    state.dataset = dataset;
    state.biomes = dataset.biomes || [];
    state.worldGeo = topojson.feature(world, world.objects.countries);

    // Start centered on California's highest anomaly month so the spiral & tension immediately tell a story
    const firstBiome = state.biomes[0];
    if (firstBiome) {
      state.globeRotation = [-firstBiome.lon, -firstBiome.lat];
      const peakIdx = firstBiome.records.findIndex((r) => r.ym === firstBiome.peakAnomaly.ym);
      state.monthIndex = peakIdx >= 0 ? peakIdx : firstBiome.records.length - 1;
    }

    renderBiomeControls();
    renderCenterGlobe();
    renderSpiral();
    renderScatterPlot();
    renderMonthlyTable();
    renderAudioLegend();
    updateHudAndSidebar();
    wireEvents();

    const meta = document.getElementById('dataset-meta');
    if (meta) {
      meta.textContent = `Baseline ${dataset.baselinePeriod} · Timeline ${dataset.period.start} to ${dataset.period.end} · ${dataset.totalModis7dGlobal.toLocaleString()} MODIS 7d global hotspots`;
    }
  } catch (err) {
    console.error('Initialization failed:', err);
    const meta = document.getElementById('dataset-meta');
    if (meta) meta.textContent = `Failed to load NASA dataset: ${err.message}`;
  }
}

init();
