import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';

// A glassy, brain-shaped enclosure round the wiring, for looks only: it has no function, is never picked or hovered,
// and does not touch any hotspot. It lives in the same scene as the neurons, so when the brain view is orbited it turns
// with them. The outline is drawn as organic, blended surfaces, not primitives:
//   brain  the central brain (two hemispheres with a notch between them, small bumps at the front, a tapering
//          underside) plus a separate kidney-shaped optic lobe on each side, overlapping it like the lobes of a rendered brain
//   neck   a waisted connective, narrower in the middle than at either end
//   cord   the ventral nerve cord: three swellings (one per pair of legs), each with a bulge on either side
// and, seen through the glass, the soft outlines of the compartments inside (mushroom bodies, the central complex, the
// optic neuropils, the antennal lobes, the cord's ganglia), like a rendered fly brain.
//
// Each part is a "metaball" surface: a set of overlapping balls that blend into one smooth skin. The balls were laid
// out from anatomy and then sized against the neurons' real positions: the outline contains 99.7% of the wiring and all
// 11 hotspots. Scene units, in the brain view's frame: the brain at the left (anterior), the cord at the right.

const CX = 1.1; // the brain's middle line, between the left and right hemispheres
const GAIN = 0.8; // overall size of the outer skin, from the fit against the neurons
const ISO = 80; // the field value MarchingCubes draws its surface at
const SUB = 12; // how fast each ball's influence falls away

// Balls are [x, y, z, radius] in scene units. `side` runs over -1 (left hemisphere) and +1 (right).
const both = (make) => [-1, 1].flatMap((side) => make(side));
const scaled = (balls, k) => balls.map(([x, y, z, r]) => [x, y, z, r * k]);

// The central brain: two hemispheres that leave a notch between them on the far side, small bumps at the front (the
// antennal lobes) and an underside that tapers toward the neck.
const CENTRAL = scaled(
  [
    ...both((s) => [
      [-7.8, CX + s * 1.3, 2.2, 2.4],
      [-8.0, CX + s * 2.0, 3.4, 1.8],
      [-7.7, CX + s * 1.6, 0.4, 1.8],
      [-9.3, CX + s * 1.0, 1.2, 0.9],
    ]),
    [-6.9, CX, 0.1, 1.9],
    [-6.4, CX, -1.2, 1.4],
  ],
  0.9,
);
// Each optic lobe is its own kidney-shaped piece: an arc of balls, concave toward the brain, set a little to the far
// side. It overlaps the central brain rather than merging into it, so both outlines show through the glass.
const OPTIC = (side) =>
  scaled(
    [
      [-7.4, CX + side * 3.6, 2.9, 1.7],
      [-7.0, CX + side * 4.4, 2.0, 1.9],
      [-6.8, CX + side * 4.6, 0.8, 1.8],
      [-7.0, CX + side * 4.2, -0.4, 1.4],
    ],
    0.85,
  );
const OPTIC_L = OPTIC(-1);
const OPTIC_R = OPTIC(1);
const BRAIN_PIECES = [CENTRAL, OPTIC_L, OPTIC_R];

// The neck, from the brain (A) to the cord (B): a chain of balls that pinch in at the middle.
const NECK_A = [-5.4, CX, 1.7];
const NECK_B = [-0.2, CX, -2.4];
const NECK = scaled(
  Array.from({ length: 7 }, (_, i) => {
    const t = i / 6;
    return [0, 1, 2].map((k) => NECK_A[k] + (NECK_B[k] - NECK_A[k]) * t).concat(2.5 - 0.6 * Math.sin(Math.PI * t));
  }),
  GAIN,
);

// The nerve cord: three swellings with a bulge on each side, a rounded tail and a rounded join with the neck.
const CORD = scaled(
  [
    ...[
      [1.6, 2.4],
      [4.4, 2.5],
      [7.3, 2.3],
    ].flatMap(([x, r]) => [[x, 1.39, -2.43, r], ...both((s) => [[x, 1.39 + s * 2.0, -2.43, 1.3]])]),
    [9.2, 1.39, -2.43, 1.7],
    [-0.2, 1.39, -2.2, 1.9],
  ],
  GAIN,
);

// What is inside, drawn fainter: soft outlines that show through the outer glass.
const BRAIN_INSIDE = [
  ...both((s) => [
    // mushroom body: a curved stalk with a lobe at the front
    [-7.2, CX + s * 0.9, 3.9, 0.55],
    [-6.7, CX + s * 1.1, 3.6, 0.5],
    [-6.3, CX + s * 1.2, 3.0, 0.5],
    [-6.1, CX + s * 1.2, 2.3, 0.45],
    [-8.2, CX + s * 0.8, 3.2, 0.4],
    // optic neuropils (medulla and lobula): a smaller arc inside the optic lobe
    [-7.6, CX + s * 3.4, 3.0, 1.0],
    [-7.4, CX + s * 4.1, 2.2, 1.1],
    [-7.2, CX + s * 4.4, 1.0, 1.0],
    [-7.2, CX + s * 4.2, -0.1, 0.85],
    [-9.0, CX + s * 1.0, 1.2, 0.6], // antennal lobes
  ]),
  // the central complex: a ring
  ...Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2;
    return [-7.7 + Math.cos(a) * 0.85, CX + Math.sin(a) * 0.85, 2.5, 0.32];
  }),
];
const CORD_INSIDE = [1.6, 4.4, 7.3].map((x) => [x, 1.39, -2.43, 1.1]);

// Each part is drawn in its own cube: centre, half-size (scene units) and how finely it is sampled.
const DOMAIN = {
  brain: { center: [-7.7, CX, 1.9], half: 8.0, res: 88 },
  neck: { center: [-2.8, CX, -0.35], half: 4.5, res: 56 },
  cord: { center: [4.4, 1.4, -2.4], half: 6.5, res: 72 },
};

// A ball's strength for MarchingCubes so that, alone, its surface sits at radius R (scene units).
const strengthFor = (R, half) => (R / (2 * half)) ** 2 * (ISO + SUB);

// The field MarchingCubes computes at a point: the sum over balls of max(0, s / d^2 - SUB), d in cube units.
function fieldAt(p, balls, { center, half }) {
  const W = 2 * half;
  let total = 0;
  for (const [bx, by, bz, R] of balls) {
    const dx = (p[0] - bx) / W;
    const dy = (p[1] - by) / W;
    const dz = (p[2] - bz) / W;
    const v = strengthFor(R, half) / (1e-6 + dx * dx + dy * dy + dz * dz) - SUB;
    if (v > 0) total += v;
  }
  return total;
}

// Uses the same formulas as the surface, so "inside" means inside the drawn skin.
function containsIn(p) {
  return BRAIN_PIECES.some((b) => fieldAt(p, b, DOMAIN.brain) >= ISO) || fieldAt(p, NECK, DOMAIN.neck) >= ISO || fieldAt(p, CORD, DOMAIN.cord) >= ISO;
}

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

// Faint glass in the middle and a glowing rim at the silhouette, so the outline reads clearly from any side.
const fragmentShader = /* glsl */ `
  uniform vec3 uInner;
  uniform vec3 uRim;
  uniform float uBase;
  uniform float uRimAlpha;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float facing = abs(dot(normalize(vNormal), normalize(vView)));
    float rim = pow(1.0 - facing, 1.9);
    vec3 col = mix(uInner, uRim, rim);
    gl_FragColor = vec4(col, uBase + rim * uRimAlpha);
  }
`;

function glass({ base, rimAlpha, inner, rim }) {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false, // never hides a neuron behind it, and never blocks one in front
    side: THREE.DoubleSide,
    uniforms: {
      uInner: { value: new THREE.Color(inner) },
      uRim: { value: new THREE.Color(rim) },
      uBase: { value: base },
      uRimAlpha: { value: rimAlpha },
    },
  });
}

// One blended surface from a set of balls, sampled inside `domain`.
function skin(balls, domain, material) {
  const { center, half, res } = domain;
  const mc = new MarchingCubes(res, material, false, false, 90000);
  mc.isolation = ISO;
  mc.reset();
  const W = 2 * half;
  for (const [x, y, z, R] of balls) {
    mc.addBall((x - (center[0] - half)) / W, (y - (center[1] - half)) / W, (z - (center[2] - half)) / W, strengthFor(R, half), SUB);
  }
  mc.update();
  mc.position.set(...center);
  mc.scale.setScalar(half); // MarchingCubes draws in a cube from -1 to 1
  mc.frustumCulled = false;
  mc.renderOrder = -1;
  return mc;
}

export function createBrainShell() {
  const group = new THREE.Group();
  group.name = 'brain-shell';
  const outer = glass({ base: 0.03, rimAlpha: 0.62, inner: 0x1d5f80, rim: 0x86d6ea });
  const inside = glass({ base: 0.015, rimAlpha: 0.34, inner: 0x2a6f95, rim: 0x6cc0dc });
  // The neck only has to hold the long thin axons together, so it is drawn much fainter and does not steal the eye.
  const faint = glass({ base: 0.012, rimAlpha: 0.2, inner: 0x1d5f80, rim: 0x6cc0dc });

  BRAIN_PIECES.forEach((balls) => group.add(skin(balls, DOMAIN.brain, outer)));
  group.add(skin(NECK, DOMAIN.neck, faint));
  group.add(skin(CORD, DOMAIN.cord, outer));
  group.add(skin(BRAIN_INSIDE, DOMAIN.brain, inside));
  group.add(skin(CORD_INSIDE, DOMAIN.cord, inside));

  // It is decoration: nothing may pick it, so every mesh ignores rays.
  group.traverse((o) => {
    if (o.isMesh) o.raycast = () => {};
  });

  // Is a point inside the enclosure? (Used to check that the wiring really sits inside it.)
  return { group, contains: containsIn };
}
