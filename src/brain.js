import * as THREE from 'three';
import { createSkeletonLine } from './skeleton.js';

// PLACEHOLDER brain. Real neuron skeletons and pulse timing come from Shreya's neurons file and
// hotspots.json (read.md sections 10 and 13). Until then every hotspot is one seeded, smooth fake
// skeleton at a fixed position, so a hotspot's shape and place stay the same across levels and while
// the brain rotates. There are deliberately no labels: the player has to remember which is which.
// The hotspot ids are the descriptive placeholders from levels.json, not real hs_XX ids.

const COLOR_LIVE = 0x6fa8ff;
const COLOR_SOMA = 0x9cc4ff;
const COLOR_DIM = 0x33415e;
const COLOR_HOVER = 0xffffff;
const TRAIL_FADE_MS = 500;

// center: where the skeleton sits inside the brain blob. mirrorOf: left/right twin of another one.
const HOTSPOTS = {
  walk_forward: { center: [0.0, 0.55, 0.9], seed: 11 },
  turn_right: { center: [0.95, 0.1, 0.25], seed: 23 },
  turn_left: { mirrorOf: 'turn_right' },
  freeze_stop: { center: [0.0, -0.65, 0.45], seed: 37 },
  escape_takeoff: { center: [0.05, 0.8, -0.65], seed: 41 },
  groom_head: { center: [0.6, -0.45, -0.75], seed: 53 },
  feed: { center: [-0.55, -0.7, 0.95], seed: 67 },
  wing_song: { center: [-0.85, 0.6, -0.3], seed: 71 },
  object_track: { center: [1.05, 0.55, 0.7], seed: 83 },
  approach_odor: { center: [-1.05, -0.2, -0.75], seed: 97 },
};

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A smooth wandering skeleton: a few random control points along a spine, as a Catmull-Rom curve.
function skeletonPoints(center, seed, spread = 0.4, controls = 5, samples = 56) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i < controls; i++) {
    pts.push(
      new THREE.Vector3(
        center[0] + (r() - 0.5) * spread * 2,
        center[1] + (r() - 0.5) * spread * 1.4,
        center[2] + (r() - 0.5) * spread * 2,
      ),
    );
  }
  return new THREE.CatmullRomCurve3(pts, false, 'centripetal').getPoints(samples);
}

export function createBrain(scene) {
  const group = new THREE.Group();
  scene.add(group);

  // Background neurons: context only, not clickable. Keeps the brain from looking like 10 wires.
  const bgMat = new THREE.LineBasicMaterial({ color: COLOR_DIM, transparent: true, opacity: 0.35 });
  const r = rng(7);
  for (let i = 0; i < 70; i++) {
    let c;
    do {
      c = [(r() - 0.5) * 3.4, (r() - 0.5) * 2.4, (r() - 0.5) * 3];
    } while ((c[0] / 1.7) ** 2 + (c[1] / 1.2) ** 2 + (c[2] / 1.5) ** 2 > 1);
    const geo = new THREE.BufferGeometry().setFromPoints(skeletonPoints(c, 1000 + i, 0.3, 4, 32));
    group.add(new THREE.Line(geo, bgMat));
  }

  const somaGeo = new THREE.SphereGeometry(0.075, 14, 10);
  const pulseGeo = new THREE.SphereGeometry(0.09, 12, 10);
  const hotspots = new Map();

  function build(id) {
    const def = HOTSPOTS[id];
    let points;
    if (def.mirrorOf) {
      const src = HOTSPOTS[def.mirrorOf];
      points = skeletonPoints(src.center, src.seed).map((p) => new THREE.Vector3(-p.x, p.y, p.z));
    } else {
      points = skeletonPoints(def.center, def.seed);
    }
    const line = createSkeletonLine(
      points.map((p) => p.toArray()),
      { color: COLOR_LIVE, hotspotId: id },
    );
    line.material.transparent = true;

    const somaMat = new THREE.MeshBasicMaterial({ color: COLOR_SOMA, transparent: true });
    const soma = new THREE.Mesh(somaGeo, somaMat);
    soma.position.copy(points[0]);
    soma.userData.hotspotId = id;

    // The pulse: a bright lit trail (a growing draw range of the same skeleton) plus a head sphere.
    const trailMat = new THREE.LineBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthTest: false,
    });
    const trail = new THREE.Line(line.geometry.clone(), trailMat); // own geometry: its draw range animates
    trail.geometry.setDrawRange(0, 0);
    trail.renderOrder = 2;
    const head = new THREE.Mesh(pulseGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
    head.visible = false;
    head.renderOrder = 3;

    group.add(line, soma, trail, head);
    const h = {
      id,
      points,
      line,
      soma,
      trail,
      head,
      live: false,
      hovered: false,
      pulse: null, // { t, ms, fizzle }
      fade: 0,
    };
    hotspots.set(id, h);
    return h;
  }
  Object.keys(HOTSPOTS).forEach(build);

  let hintId = null;
  let time = 0;

  function paint(h) {
    const glow = h.id === hintId ? 0.55 + 0.45 * Math.sin(time * 0.006) : 0;
    const base = h.live ? COLOR_LIVE : COLOR_DIM;
    h.line.material.color.set(h.hovered && h.live ? COLOR_HOVER : base);
    h.line.material.opacity = h.live ? 1 : 0.45;
    h.soma.material.color.set(h.live ? (h.hovered ? COLOR_HOVER : COLOR_SOMA) : COLOR_DIM);
    h.soma.material.opacity = h.live ? 1 : 0.45;
    if (glow > 0) {
      h.line.material.color.lerp(new THREE.Color(COLOR_HOVER), glow * 0.6);
      h.soma.scale.setScalar(1 + glow * 0.9);
    } else {
      h.soma.scale.setScalar(h.hovered && h.live ? 1.35 : 1);
    }
  }

  return {
    group,

    // Only hotspots in the current level are lit and clickable; the rest stay as dim context.
    setAvailable(ids) {
      const set = new Set(ids);
      hotspots.forEach((h) => {
        h.live = set.has(h.id);
        if (!h.live) h.hovered = false;
        paint(h);
      });
    },

    // Level 1's first_click_hint: a gentle glow on one hotspot until the player probes something.
    setHint(id) {
      hintId = id;
      hotspots.forEach(paint);
    },

    setHover(id) {
      hotspots.forEach((h) => {
        h.hovered = h.id === id;
        paint(h);
      });
    },

    // Only lit hotspots can be picked. Lines and somas both carry userData.hotspotId.
    pickables() {
      const out = [];
      hotspots.forEach((h) => {
        if (h.live) out.push(h.line, h.soma);
      });
      return out;
    },

    // A point on a hotspot's skeleton (u 0..1 along it). Used by dev tooling to aim test clicks.
    pointOf(id, u = 0.5) {
      const h = hotspots.get(id);
      return h ? h.points[Math.round(u * (h.points.length - 1))].clone() : null;
    },

    // Light travels along the skeleton over `ms`. A fizzle dies out early (dead hotspot in the lesion level).
    firePulse(id, ms, { fizzle = false } = {}) {
      const h = hotspots.get(id);
      if (!h) return;
      h.pulse = { t: 0, ms, fizzle };
      h.fade = 0;
      h.trail.material.opacity = 1;
      h.head.visible = true;
    },

    update(dtMs) {
      time += dtMs;
      hotspots.forEach((h) => {
        if (h.id === hintId) paint(h);
        if (h.pulse) {
          h.pulse.t += dtMs;
          const u = Math.min(1, h.pulse.t / h.pulse.ms);
          const reach = h.pulse.fizzle ? u * 0.35 : u;
          const idx = Math.min(h.points.length - 1, Math.floor(reach * (h.points.length - 1)));
          h.trail.geometry.setDrawRange(0, idx + 1);
          h.head.position.copy(h.points[idx]);
          h.head.material.opacity = h.pulse.fizzle ? 1 - u : 1;
          if (u >= 1) {
            h.pulse = null;
            h.fade = TRAIL_FADE_MS;
            h.head.visible = false;
          }
        } else if (h.fade > 0) {
          h.fade = Math.max(0, h.fade - dtMs);
          h.trail.material.opacity = h.fade / TRAIL_FADE_MS;
          if (h.fade === 0) h.trail.geometry.setDrawRange(0, 0);
        }
      });
    },
  };
}
