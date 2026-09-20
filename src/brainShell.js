import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// A glassy enclosure round the wiring, for looks only: it has no function, is never picked or hovered, and does not
// touch any hotspot. It lives in the same scene as the neurons, so when the brain view is orbited it turns with them.
// Styled after a rendered fly brain: translucent blue lobes whose rims glow, overlapping so that the outlines of the
// inner compartments show through.
//
// Shape (scene units, the brain view's frame): the brain at the left (anterior), a narrow sloping neck, and the nerve
// cord at the right. Measured from the neurons themselves: brain x -10.3..-5.5, neck x -5.5..-0.5, cord x 0..9, with the
// brain up in z and the cord down in z. Everything is padded so that the neurons sit inside.

// Rounded lobes: { c: centre, r: radii, e: roundness }. e = 2 is a plain ellipsoid; a larger e makes it boxier, which
// hugs the wiring better (the neurons fill their region like a rounded box, not like an egg). Fitted to the neurons'
// actual positions, and checked: the shell contains 99.6% of the wiring and all 11 hotspots.
const CX = 1.1; // the brain's middle line (between the left and right hemispheres)
export const LOBES = [
  // brain
  { c: [-7.7, CX, 1.9], r: [2.35, 3.5, 3.55], e: 3 }, // central brain
  { c: [-7.5, CX - 3.3, 2.0], r: [2.5, 1.9, 2.9], e: 2 }, // left optic lobe
  { c: [-7.5, CX + 3.3, 2.0], r: [2.5, 1.9, 2.9], e: 2 }, // right optic lobe
  { c: [-6.3, CX, 0.1], r: [1.8, 1.9, 1.6], e: 2 }, // subesophageal zone, tapering toward the neck
  // the nerve cord: a long body with a pair of bulges for each pair of legs
  { c: [4.42, 1.39, -2.43], r: [5.3, 2.65, 2.45], e: 3 },
  ...[1.5, 4.5, 7.4].flatMap((x, i) =>
    [-1, 1].map((side) => ({ c: [x, 1.39 + side * [2.2, 2.3, 2.1][i], -2.43], r: [1.3, 1.2, 1.6], e: 2 })),
  ),
];
// The neck: an elliptical tube tilted down from the brain to the cord (from A to B).
export const NECK = { a: [-5.4, CX, 1.7], b: [-0.2, CX, -2.4], ry: 3.5, rz: 2.5 };
// Small compartments inside, drawn so their outlines show through the glass (like the mushroom bodies, antennal lobes,
// central complex and optic neuropils of a rendered brain). Purely visual.
const INNER = [
  { c: [-7.0, CX - 1.3, 4.3], r: [1.0, 1.0, 0.9], e: 2 }, // mushroom body calyces
  { c: [-7.0, CX + 1.3, 4.3], r: [1.0, 1.0, 0.9], e: 2 },
  { c: [-9.1, CX - 1.0, 1.4], r: [0.8, 0.8, 0.8], e: 2 }, // antennal lobes
  { c: [-9.1, CX + 1.0, 1.4], r: [0.8, 0.8, 0.8], e: 2 },
  { c: [-7.7, CX, 2.6], r: [1.2, 1.4, 0.9], e: 2 }, // central complex
  { c: [-7.5, CX - 3.5, 2.1], r: [1.4, 1.2, 1.8], e: 2 }, // optic neuropils
  { c: [-7.5, CX + 3.5, 2.1], r: [1.4, 1.2, 1.8], e: 2 },
  { c: [-6.4, CX - 1.6, 1.4], r: [0.9, 1.0, 1.0], e: 2 },
  { c: [-6.4, CX + 1.6, 1.4], r: [0.9, 1.0, 1.0], e: 2 },
  { c: [4.4, 1.39, -2.43], r: [3.6, 1.5, 1.2], e: 2 }, // the cord's own core
];

const vertexShader = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vView = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

// Faint glass in the middle, a glowing rim at the silhouette. Overlapping lobes add up, which draws the inner outlines.
const fragmentShader = /* glsl */ `
  uniform vec3 uInner;
  uniform vec3 uRim;
  uniform float uBase;
  uniform float uRimAlpha;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float rim = pow(1.0 - facing, 2.4);
    vec3 col = mix(uInner, uRim, rim);
    gl_FragColor = vec4(col, uBase + rim * uRimAlpha);
  }
`;

function glass(strength = 1) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false, // never hides a neuron behind it, and never blocks one in front
    side: THREE.DoubleSide,
    uniforms: {
      uInner: { value: new THREE.Color(0x1d5f80) },
      uRim: { value: new THREE.Color(0x7fd0e6) },
      uBase: { value: 0.035 * strength },
      uRimAlpha: { value: 0.5 * strength },
    },
  });
}

// A unit "rounded lobe" of roundness e: an icosphere pushed out to |x|^e + |y|^e + |z|^e = 1, with smooth normals.
const geoCache = new Map();
function lobeGeometry(e) {
  if (geoCache.has(e)) return geoCache.get(e);
  let g = new THREE.IcosahedronGeometry(1, 4);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  g = mergeVertices(g); // one vertex per point, so the normals below come out smooth
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const k = (Math.abs(x) ** e + Math.abs(y) ** e + Math.abs(z) ** e) ** (1 / e);
    pos.setXYZ(i, x / k, y / k, z / k);
  }
  g.computeVertexNormals();
  geoCache.set(e, g);
  return g;
}

export function createBrainShell() {
  const group = new THREE.Group();
  group.name = 'brain-shell';
  const outer = glass(1);
  const inner = glass(0.7);

  const lobe = ({ c, r, e }, material) => {
    const m = new THREE.Mesh(lobeGeometry(e), material);
    m.position.set(...c);
    m.scale.set(...r);
    m.renderOrder = -1; // drawn before the transparent hotspot glows; neurons are opaque and unaffected
    group.add(m);
    return m;
  };
  LOBES.forEach((l) => lobe(l, outer));
  INNER.forEach((l) => lobe(l, inner));

  // The neck: a unit cylinder along x, made elliptical, then tilted from A to B.
  const a = new THREE.Vector3(...NECK.a);
  const b = new THREE.Vector3(...NECK.b);
  const len = a.distanceTo(b);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).rotateZ(Math.PI / 2), outer); // axis along x
  neck.scale.set(len, NECK.ry, NECK.rz);
  neck.position.copy(a).add(b).multiplyScalar(0.5);
  neck.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x); // tilt about y so the axis runs A -> B
  neck.renderOrder = -1;
  group.add(neck);

  // It is decoration: nothing may pick it, so every mesh ignores rays.
  group.traverse((o) => {
    if (o.isMesh) o.raycast = () => {};
  });

  // Is a point inside the enclosure? (Used to check that the wiring really sits inside it.)
  const ax = new THREE.Vector3().subVectors(b, a).normalize();
  const mid = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5);
  const zdir = new THREE.Vector3(0, 1, 0).cross(ax).normalize();
  const contains = (p) => {
    for (const { c, r, e } of LOBES) {
      if (Math.abs((p[0] - c[0]) / r[0]) ** e + Math.abs((p[1] - c[1]) / r[1]) ** e + Math.abs((p[2] - c[2]) / r[2]) ** e <= 1) return true;
    }
    const d = new THREE.Vector3(p[0], p[1], p[2]).sub(mid);
    const along = d.dot(ax);
    if (Math.abs(along) > len / 2) return false;
    const dy = d.y; // the tube's cross-section: y, and the direction in the x-z plane at right angles to the axis
    const dz = d.dot(zdir);
    return (dy / NECK.ry) ** 2 + (dz / NECK.rz) ** 2 <= 1;
  };

  return { group, contains };
}
