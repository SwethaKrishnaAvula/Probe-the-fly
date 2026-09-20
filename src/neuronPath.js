import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { createHalo } from './halo.js';
import { parseSwc, toGlbFrame, buildGrid, nearest, geodesicFrom, vertexProgress, rootIndex } from './skeletonMap.js';

// The clickable DNa02_L neuron and the motor neuron it drives, from the .glb tube meshes.
// Data comes straight from geometry_metadata.json and DNa02_L_handoff.json (Shreya's files).
// Neurons stay dim; a click sends a bright band of light along the path: down DNa02_L, then into the
// motor neuron, using the handoff's math_outputs.pulse_timing.

export const BASE_DIM = 0.4; // resting brightness of a neuron (0..1)
export const BASE_HOVER = 1.35; // (not used for hover any more: a hover shows only the halo)
// A circuit outside the current level keeps its normal look (green, pink, blue, orange), never near-black; only clicking
// is gated. (It was 0.1, which drew those neurons as black lines.)
export const BASE_OFF = BASE_DIM;
export const TAIL = 0.18; // length of the glowing trail behind the head, as a fraction of the neuron
// Hover and click area around a hotspot (scene units). The metadata suggests 0.5; that was too small to find on a thin
// neuron, so every hotspot uses this instead.
export const HIT_RADIUS = 0.8;
const PULSE_TIME_SCALE = 1; // 1 = exactly the milliseconds in the handoff json

const vertexShader = /* glsl */ `
  attribute float aU;
  varying float vU;
  varying vec3 vNormal;
  void main() {
    vU = aU;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// head: where the bright band is along the neuron (0..1+); below 0 means no pulse on this neuron.
const fragmentShader = /* glsl */ `
  uniform vec3 uColor;
  uniform float uBase;
  uniform float uHead;
  uniform float uTail;
  uniform float uGlow;
  varying float vU;
  varying vec3 vNormal;
  void main() {
    float shade = 0.5 + 0.5 * abs(normalize(vNormal).z);
    float behind = uHead - vU;
    float lit = uHead < 0.0 ? 0.0 : smoothstep(-0.02, 0.0, behind) * exp(-max(behind, 0.0) / uTail);
    vec3 col = uColor * uBase * shade;
    col += mix(uColor, vec3(1.0), 0.75) * lit * uGlow * 1.6;
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function makeMaterial(rgba) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    uniforms: {
      uColor: { value: new THREE.Color(rgba[0], rgba[1], rgba[2]) },
      uBase: { value: BASE_DIM },
      uHead: { value: -1 },
      uTail: { value: TAIL },
      uGlow: { value: 1 },
    },
  });
}

async function fetchText(url) {
  return (await fetch(url)).text();
}

// urls: { glb, swc: { [bodyId]: url } }. meta and handoff are the parsed json files.
// reference: another pair's metadata.normalization. Each pair was normalized on its own (its own center and
// scale), so to show two pairs in one brain this pair is moved into the reference pair's frame. Both come
// from the same dataset space, so this is an exact similarity transform, not an estimate.
export async function createNeuronPair({ urls, meta, handoff, reference = null }) {
  const group = new THREE.Group();
  const inner = new THREE.Group(); // holds the meshes and hotspot; carries the frame alignment
  group.add(inner);
  const byId = {};
  meta.neurons.forEach((n) => (byId[n.body_id] = { info: n }));

  const gltf = await new GLTFLoader().loadAsync(urls.glb);
  gltf.scene.traverse((o) => {
    if (o.isMesh && byId[o.name]) byId[o.name].mesh = o;
  });

  // Skeletons, in the .glb's frame.
  const ids = meta.game_mapping.pulse_order; // hotspot first, then the motor neuron it drives
  for (const id of ids) {
    const swc = parseSwc(await fetchText(urls.swc[id]));
    const pos = toGlbFrame(swc, meta.normalization);
    byId[id].swc = swc;
    byId[id].pos = pos;
    byId[id].grid = buildGrid(pos);
  }

  // Where the pulse starts on each neuron: the hotspot at its root; the next neuron where it touches the previous one.
  ids.forEach((id, k) => {
    const n = byId[id];
    let src = rootIndex(n.swc);
    if (k > 0) {
      const prev = byId[ids[k - 1]];
      let best = Infinity;
      for (let i = 0; i < n.swc.n; i++) {
        const h = nearest(prev.grid, n.pos[i * 3], n.pos[i * 3 + 1], n.pos[i * 3 + 2], 8);
        if (h && h.d2 < best) {
          best = h.d2;
          src = i;
        }
      }
    }
    const geo = geodesicFrom(n.swc, n.pos, src);
    const mesh = n.mesh;
    const vertexPos = mesh.geometry.attributes.position.array;
    mesh.geometry.setAttribute('aU', new THREE.BufferAttribute(vertexProgress(n.grid, geo, vertexPos), 1));
    mesh.material = makeMaterial(n.info.color_rgba);
    n.material = mesh.material;
    inner.add(mesh);
  });

  // Move into the reference frame: shared = pair * (sRef / s) + swap(c - cRef) * sRef, with the .glb's
  // (x, z, -y) axis order. (Verified for the right pair: its nodes and hotspot still land on its tubes.)
  let fit = 1; // the scale applied, so the click sphere can be corrected to stay exactly the requested size
  if (reference) {
    const { center_native: c, scale: s } = meta.normalization;
    const { center_native: cr, scale: sr } = reference;
    fit = sr / s;
    inner.scale.setScalar(fit);
    inner.position.set((c[0] - cr[0]) * sr, (c[2] - cr[2]) * sr, -(c[1] - cr[1]) * sr);
  }

  // Anterior (the brain end, at -Y in the file) goes to the left of the screen.
  group.rotation.z = -Math.PI / 2;

  // Click target: a 0.5-radius sphere at the hotspot. hotspot_center_game is in the pre-export axis order,
  // so it is reordered to the .glb's (x, z, -y) like the skeletons (checked: it lies on the tube).
  const hs = byId[ids[0]].info;
  const [hx, hy, hz] = hs.hotspot_center_game;
  const hotspot = new THREE.Mesh(
    new THREE.SphereGeometry(HIT_RADIUS / fit, 16, 12), // /fit: the same size in the shared frame for every pair
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hotspot.position.set(hx, hz, -hy);
  hotspot.userData.hotspotId = meta.game_mapping.hotspot_id;
  inner.add(hotspot);

  // The glow that shows a hotspot is there when the cursor is over it (and pulses with the level's hint).
  const halo = createHalo(hs.color_rgba, fit);
  halo.sprite.position.copy(hotspot.position);
  inner.add(halo.sprite);

  // Pulse schedule from the handoff.
  const timing = handoff.math_outputs.pulse_timing.map((t) => ({
    id: String(t.body_id),
    start: t.t_start_ms * PULSE_TIME_SCALE,
    end: t.t_end_ms * PULSE_TIME_SCALE,
    glow: handoff.math_outputs.brightness.find((b) => b.body_id === t.body_id)?.value ?? 1,
  }));
  const totalMs = Math.max(...timing.map((t) => t.end));

  let pulse = null; // { t, onDone }
  let hovered = false;
  const hotspotMat = byId[ids[0]].material;
  // Two circuits can contain the very same neuron (the giant fiber drives both a jump and a flight path), drawn twice
  // at exactly the same place. While a pair pulses its meshes are pulled slightly toward the camera, so the lit copy
  // is never fought over by a dim one (z-fighting).
  const setInFront = (on) =>
    ids.forEach((id) => {
      const m = byId[id].material;
      m.polygonOffset = on;
      m.polygonOffsetFactor = on ? -2 : 0;
      m.polygonOffsetUnits = on ? -2 : 0;
    });
  // Resting brightness. A circuit outside the current level is nearly invisible. Hover shows only a circle, and a
  // click sends the spark along it. The one thing that glows on its own is the level's first_click_hint, until the
  // player clicks something.
  let live = true;
  let hint = false;
  let clock = 0;
  const restMats = ids.slice(1).map((id) => byId[id].material);
  const setBase = () => {
    restMats.forEach((m) => (m.uniforms.uBase.value = live ? BASE_DIM : BASE_OFF));
    // Hovering shows only the glowing circle (halo.js), for any hotspot, live or not: the neurons stay at rest until clicked.
    let base = !live ? BASE_OFF : BASE_DIM;
    if (live && hint && !pulse) base = BASE_DIM + 0.35 * (0.5 + 0.5 * Math.sin(clock * 0.006)); // a gentle, slow pulse
    hotspotMat.uniforms.uBase.value = base;
  };
  setBase();

  return {
    group,
    hotspotMesh: hotspot,
    hotspotId: meta.game_mapping.hotspot_id,
    behaviorId: handoff.behavior_id,
    get busy() {
      return pulse !== null;
    },

    setHover(on) {
      hovered = on;
      setBase();
    },

    // Is this circuit part of the current level? Not live: dim, and the game will not offer it for clicking.
    setLive(on) {
      live = on;
      setBase();
    },

    // The level's first_click_hint: the hotspot neuron glows gently until the player clicks something.
    setHint(on) {
      hint = on;
      setBase();
    },

    // Send the light down the path. onDone runs when it has reached the end of the last neuron. A fizzle (a dead
    // hotspot) lights only the first neuron, dies out part-way along it, and never reaches the rest.
    firePulse(onDone, { fizzle = false } = {}) {
      if (pulse) return;
      pulse = { t: 0, onDone, fizzle };
      setInFront(true);
      setBase();
    },

    update(dtMs) {
      clock += dtMs;
      if (hint && !pulse) setBase();
      halo.update(pulse ? 0.45 : hovered ? 1 : live && hint ? 0.3 + 0.4 * (0.5 + 0.5 * Math.sin(clock * 0.006)) : 0, dtMs);
      if (!pulse) return;
      pulse.t += dtMs;
      const dead = pulse.fizzle;
      const runMs = dead ? timing[0].end : totalMs;
      timing.forEach((s, i) => {
        const m = byId[s.id].material.uniforms;
        if ((dead && i > 0) || pulse.t < s.start) return void (m.uHead.value = -1);
        const p = Math.min(1, (pulse.t - s.start) / (s.end - s.start));
        m.uHead.value = p * (1 + TAIL * 3) * (dead ? 0.4 : 1); // run past the end so the band fully leaves the neuron
        m.uGlow.value = dead ? s.glow * (1 - p) : s.glow;
      });
      if (pulse.t >= runMs) {
        const done = pulse.onDone;
        pulse = null;
        timing.forEach((s) => (byId[s.id].material.uniforms.uHead.value = -1));
        setInFront(false);
        setBase();
        done?.();
      }
    },
  };
}

// One hotspot that fires two circuits at once. The escape giant fiber is one neuron with two downstream paths (jump and
// flight), so each side has a single clickable hotspot (the primary's) and both paths light together.
// behaviorId is what the game records (notebook, probe counts); playBehavior is what the fly performs.
export function linkPairs(primary, secondary, { hotspotId, behaviorId, playBehavior }) {
  const parts = [primary, secondary];
  const group = new THREE.Group();
  group.add(primary.group, secondary.group);
  primary.hotspotMesh.userData.hotspotId = hotspotId; // clicks report the linked hotspot, not the jump circuit's own id
  return {
    group,
    hotspotMesh: primary.hotspotMesh, // the secondary's click sphere is deliberately not exposed
    hotspotId,
    behaviorId,
    playBehavior,
    get busy() {
      return parts.some((p) => p.busy);
    },
    setHover(on) {
      parts.forEach((p) => p.setHover(on)); // both copies of the shared neuron, so they never differ in brightness
    },
    setLive(on) {
      parts.forEach((p) => p.setLive(on));
    },
    setHint(on) {
      parts.forEach((p) => p.setHint(on));
    },
    firePulse(onDone, opts) {
      let left = parts.length;
      parts.forEach((p) => p.firePulse(() => --left === 0 && onDone?.(), opts));
    },
    update(dtMs) {
      parts.forEach((p) => p.update(dtMs));
    },
  };
}
