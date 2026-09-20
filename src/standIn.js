import * as THREE from 'three';
import { makeMaterial, BASE_DIM, BASE_HOVER, BASE_OFF, TAIL } from './neuronPath.js';
import { rng } from './random.js';

// STAND-IN hotspots. Some behaviors (walk forward, freeze, groom head, approach odor) have no neuron data yet, but the
// levels need them to be playable. Each stand-in is a smooth, invented tube that looks and behaves like a real hotspot
// (click sphere, hover, a pulse of light along it) but is NOT a real neuron: it is drawn in a different colour, and
// each should be replaced by a real pair from createNeuronPair() when its circuit arrives (read.md: "use fake data with
// the same schema and swap later"). The honesty statement "neuron shapes are real" applies only to the real ones.

const STAND_IN_COLOR = [0.7, 0.6, 0.95, 1]; // lavender: unmistakably not one of the green/pink/blue/orange real neurons
const HIT_RADIUS = 0.5;
const TUBE_R = 0.03;

// position: where the click target (the neuron's start) sits, in the brain view's world coordinates.
export function createStandInHotspot({ hotspotId, behaviorId, position, seed, length = 4, pulseMs = 600 }) {
  const rand = rng(seed);
  const group = new THREE.Group();
  group.position.set(...position);

  // A gently wandering path heading toward the nerve cord (+x in the brain view), like a descending neuron.
  const pts = [new THREE.Vector3()];
  const steps = 6;
  for (let i = 1; i <= steps; i++) {
    const prev = pts[i - 1];
    pts.push(new THREE.Vector3(prev.x + (length / steps) * (0.7 + 0.6 * rand()), prev.y + (rand() - 0.5) * 0.9, prev.z + (rand() - 0.5) * 0.9));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const geo = new THREE.TubeGeometry(curve, 90, TUBE_R, 6, false);
  const u = new Float32Array(geo.attributes.uv.count);
  for (let i = 0; i < u.length; i++) u[i] = geo.attributes.uv.getX(i); // 0..1 along the tube
  geo.setAttribute('aU', new THREE.BufferAttribute(u, 1));
  const mat = makeMaterial(STAND_IN_COLOR);
  const tube = new THREE.Mesh(geo, mat);
  group.add(tube);

  const hotspot = new THREE.Mesh(new THREE.SphereGeometry(HIT_RADIUS, 16, 12), new THREE.MeshBasicMaterial({ visible: false }));
  hotspot.userData.hotspotId = hotspotId;
  group.add(hotspot);

  let pulse = null;
  let hovered = false;
  let live = true;
  let hint = false;
  let clock = 0;
  const setBase = () => {
    // A placeholder wire is invisible until the cursor is over it (it then lights up), and it shows while its pulse runs
    // after a click. The one exception is the level's first_click_hint: the wire appears and glows gently until the
    // player clicks something.
    let base = !live ? BASE_OFF : hovered && !pulse ? BASE_HOVER : BASE_DIM;
    if (live && hint && !pulse) base = BASE_DIM + 0.35 * (0.5 + 0.5 * Math.sin(clock * 0.006));
    mat.uniforms.uBase.value = base;
    tube.visible = pulse !== null || (live && (hovered || hint));
  };
  setBase();

  return {
    group,
    hotspotMesh: hotspot,
    hotspotId,
    behaviorId,
    standIn: true,
    get busy() {
      return pulse !== null;
    },
    setHover(on) {
      hovered = on;
      setBase();
    },
    setLive(on) {
      live = on;
      setBase();
    },
    setHint(on) {
      hint = on;
      setBase();
    },
    // A fizzle (a dead hotspot): the light dies out part-way along the tube.
    firePulse(onDone, { fizzle = false } = {}) {
      if (pulse) return;
      pulse = { t: 0, onDone, fizzle };
      setBase();
    },
    update(dtMs) {
      clock += dtMs;
      if (hint && !pulse) setBase();
      if (!pulse) return;
      pulse.t += dtMs;
      const dead = pulse.fizzle;
      const runMs = dead ? pulseMs * 0.5 : pulseMs;
      const p = Math.min(1, pulse.t / runMs);
      mat.uniforms.uHead.value = p * (1 + TAIL * 3) * (dead ? 0.4 : 1);
      mat.uniforms.uGlow.value = dead ? 1 - p : 1;
      if (p >= 1) {
        const done = pulse.onDone;
        pulse = null;
        mat.uniforms.uHead.value = -1;
        mat.uniforms.uGlow.value = 1;
        setBase();
        done?.();
      }
    },
  };
}
