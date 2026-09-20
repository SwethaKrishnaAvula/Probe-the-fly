import * as THREE from 'three';

// The enclosure round the neurons: a dark, glassy, wire-mesh outline of the fly's nervous system, like the reference
// image's brain shell. It is decoration only (never picked, never lit), drawn behind and around the neurons, which keep
// their own look. There is no anatomical mesh in the repo, so the shells are built here:
//   - the brain: a central mass with two optic lobes, round the dense left-hand cluster where the neurons take input;
//   - the neck: a tube that carries the long fibres from the brain to the ventral nerve cord;
//   - the nerve cord: an elongated shell round the right-hand cluster, where the motor neurons finish.
// The sizes come from measuring the neurons' extents in the scene (see the numbers below); if the neuron files change,
// re-measure with contains() (below) and adjust. Set SHOW_NERVE_CORD to false for a brain-only enclosure.

const SHOW_NERVE_CORD = true;
const WIRE_COLOR = 0x9aa6c4;
const WIRE_OPACITY = 0.075;
const GLASS_COLOR = 0xa9b4d0;

// A smooth pseudo-random surface texture: gentle folds over the whole shell.
const fold = (n, k) =>
  0.045 * Math.sin(4.3 * n.x + 1.1 * n.y + k) + 0.04 * Math.sin(3.7 * n.y - 2.2 * n.z + 1.9 * k) + 0.035 * Math.sin(5.1 * n.z + 2.3 * n.x - k);

// A shell is an ellipsoid (centre c, radii r) whose radius is pushed in or out by folds and by Gaussian bumps in given
// directions. radial(n) is its radius along the unit direction n (in the ellipsoid's own scaled space).
function makeShellSpec({ c, r, bumps = [], seed = 0, foldAmount = 1 }) {
  const dirs = bumps.map((b) => ({ ...b, d: new THREE.Vector3(...b.d).normalize() }));
  const radial = (n) => {
    let v = 1 + foldAmount * fold(n, seed);
    for (const b of dirs) {
      const ang = Math.acos(THREE.MathUtils.clamp(n.dot(b.d), -1, 1));
      v += b.a * Math.exp(-((ang / b.s) ** 2));
    }
    return v;
  };
  return { c: new THREE.Vector3(...c), r: new THREE.Vector3(...r), radial };
}

// Is the world point p inside this displaced ellipsoid?
function insideSpec(spec, p, pad = 0) {
  const q = new THREE.Vector3((p.x - spec.c.x) / (spec.r.x + pad), (p.y - spec.c.y) / (spec.r.y + pad), (p.z - spec.c.z) / (spec.r.z + pad));
  const len = q.length();
  if (len < 1e-6) return true;
  return len <= spec.radial(q.divideScalar(len));
}

function buildGeometry(spec, detail = 10) {
  const geo = new THREE.IcosahedronGeometry(1, detail);
  const pos = geo.attributes.position;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(pos, i).normalize();
    const k = spec.radial(n);
    pos.setXYZ(i, spec.c.x + n.x * k * spec.r.x, spec.c.y + n.y * k * spec.r.y, spec.c.z + n.z * k * spec.r.z);
  }
  geo.computeVertexNormals();
  return geo;
}

// Glass: almost see-through in the middle, brighter toward the silhouette, so the shell reads as a soft outline.
const glassMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(GLASS_COLOR) } },
    vertexShader: /* glsl */ `
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vN = normalize(normalMatrix * normal);
        vV = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float facing = abs(dot(normalize(vN), normalize(vV)));
        float rim = pow(1.0 - facing, 2.6);
        gl_FragColor = vec4(uColor, 0.012 + 0.17 * rim);
      }
    `,
  });

const wireMaterial = () => new THREE.LineBasicMaterial({ color: WIRE_COLOR, transparent: true, opacity: WIRE_OPACITY, depthWrite: false });

// The shells, in the neurons' coordinates. Measured from the loaded neurons:
//   brain cluster   x -10.3..-5,  y -2.9..4.9, z -1.6..5.3
//   fibres (neck)   x  -5..0,     y -1.1..3.9, z -3.9..0.1
//   nerve cord      x   0..10.2,  y -1.8..4.6, z -5..-0.1
const SPECS = {
  brain: makeShellSpec({
    c: [-7.7, 0.9, 1.5],
    r: [3.8, 4.7, 3.5],
    seed: 0.6,
    foldAmount: 1.4,
    bumps: [
      { d: [0.1, 1, 0.55], a: 0.13, s: 0.5 }, // upper lobes
      { d: [0.1, 1, -0.55], a: 0.13, s: 0.5 },
      { d: [0.7, 0.75, 0], a: 0.09, s: 0.45 }, // rear top
      { d: [-1, -0.45, 0.4], a: 0.11, s: 0.45 }, // front lower bumps
      { d: [-1, -0.45, -0.4], a: 0.11, s: 0.45 },
      { d: [-1, 0.3, 0], a: 0.07, s: 0.5 },
      { d: [0.75, -0.35, 0], a: -0.1, s: 0.55 }, // a dip at the back
      { d: [0, -1, 0], a: -0.06, s: 0.6 }, // a shallow hollow underneath
    ],
  }),
  opticRight: makeShellSpec({ c: [-7.9, 0.9, 6.5], r: [3.3, 4.0, 2.2], seed: 2.1, foldAmount: 0.7, bumps: [{ d: [0, 0, 1], a: 0.06, s: 0.9 }, { d: [0.5, 0.6, 0.3], a: 0.05, s: 0.6 }] }),
  opticLeft: makeShellSpec({ c: [-7.9, 0.9, -2.9], r: [3.1, 3.7, 1.9], seed: 3.4, foldAmount: 0.7, bumps: [{ d: [0, 0, -1], a: 0.06, s: 0.9 }, { d: [0.5, 0.6, -0.3], a: 0.05, s: 0.6 }] }),
  cord: makeShellSpec({
    c: [5.3, 1.1, -2.6],
    r: [6.1, 4.0, 3.1],
    seed: 4.2,
    bumps: [
      { d: [-0.3, 0.6, 0], a: 0.07, s: 0.7 },
      { d: [0.6, 0.6, 0], a: 0.07, s: 0.7 },
      { d: [0.1, -0.3, 0], a: -0.06, s: 0.5 },
    ],
  }),
};

// The neck: a tube along the path the fibres take between the brain and the cord.
const NECK_PATH = [new THREE.Vector3(-5.6, 1.4, 1.0), new THREE.Vector3(-3.6, 1.5, -0.6), new THREE.Vector3(-1.6, 1.5, -2.2), new THREE.Vector3(0.6, 1.4, -2.7)];
const NECK_RADIUS = 2.95;

export function createBrainShell() {
  const group = new THREE.Group();
  group.renderOrder = -1;
  const add = (geo) => {
    const glass = new THREE.Mesh(geo, glassMaterial());
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), wireMaterial());
    group.add(glass, wire);
  };
  add(buildGeometry(SPECS.brain));
  add(buildGeometry(SPECS.opticRight));
  add(buildGeometry(SPECS.opticLeft));

  const curve = new THREE.CatmullRomCurve3(NECK_PATH);
  const neck = new THREE.TubeGeometry(curve, 36, NECK_RADIUS, 28, false);
  // a little swell at the ends where it joins the brain and the cord
  const np = neck.attributes.position;
  for (let i = 0; i < np.count; i++) {
    const t = Math.floor(i / 29) / 36;
    const swell = 1 + 0.18 * Math.exp(-((t / 0.18) ** 2)) + 0.14 * Math.exp(-(((1 - t) / 0.18) ** 2));
    const c = curve.getPoint(Math.min(1, t));
    np.setXYZ(i, c.x + (np.getX(i) - c.x) * swell, c.y + (np.getY(i) - c.y) * swell, c.z + (np.getZ(i) - c.z) * swell);
  }
  neck.computeVertexNormals();
  add(neck);
  if (SHOW_NERVE_CORD) add(buildGeometry(SPECS.cord));

  // Is a point inside any part of the enclosure? (Used to check that every neuron fits.)
  const nodes = curve.getPoints(60);
  const contains = (p, pad = 0) => {
    if (insideSpec(SPECS.brain, p, pad) || insideSpec(SPECS.opticRight, p, pad) || insideSpec(SPECS.opticLeft, p, pad)) return true;
    if (SHOW_NERVE_CORD && insideSpec(SPECS.cord, p, pad)) return true;
    return nodes.some((q) => q.distanceTo(p) <= NECK_RADIUS + pad);
  };
  return { group, contains };
}
