import * as THREE from 'three';
import { makeMaterial, BASE_DIM, BASE_HOVER, TAIL } from './neuronPath.js';
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
  const setBase = () => (mat.uniforms.uBase.value = hovered && !pulse ? BASE_HOVER : BASE_DIM);

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
    firePulse(onDone) {
      if (pulse) return;
      pulse = { t: 0, onDone };
      setBase();
    },
    update(dtMs) {
      if (!pulse) return;
      pulse.t += dtMs;
      const p = Math.min(1, pulse.t / pulseMs);
      mat.uniforms.uHead.value = p * (1 + TAIL * 3);
      if (p >= 1) {
        const done = pulse.onDone;
        pulse = null;
        mat.uniforms.uHead.value = -1;
        setBase();
        done?.();
      }
    },
  };
}
