import * as THREE from 'three';
import { rng } from './random.js';
import { toWorld } from './coords.js';
import { bushTime, bushMaterial, makeBushGeometry, makeCampfire, makeStartBoard, makeStream } from './props.js';

// The world the fly lives in: one endless checkerboard floor that fills the whole view, carrying wooden
// crates, ramps, red seats and each level's hurdles. The play area has no visible fence; its edges are
// invisible. The only things that move are the rolling balls; the fly's behaviors live in behaviors.js.
//
// levels.json positions are [x, y, z] with +x on the fly's RIGHT and +z straight ahead of the start
// (level 2's pie sits right of the start and only turn_right is available; level 4's sits left).
// The fly's own frame has its left on +X, so world x is the json x negated.
export { toWorld };

// Arena footprint in json coordinates. The start is at the origin, facing +z.
const BOUNDS = { minX: -6, maxX: 6, minZ: -2.5, maxZ: 7 };
// Where the fly starts, per level: on one side of the arena, facing +z (up the screen in the default view).
// Level 4's apple is on the left, so it starts on the right; the others start on the left.
const START_DEFAULT = [-5.4, 0, -0.6];
const STARTS = {
  level_1_discovery: [-5.4, 0, 1.2], // clear of the balls' lane at z = -0.9
  level_4_lesion: [5.4, 0, -0.6],
};
const SHADOW_HALF_WIDTH = 1.5; // "arena_midpoint_band": a strip down the arena's middle (x = 0)
const FLOWER_POS = [2.4, 0, 8.6]; // level 5's target: past the far edge of the play area, seen from a distance

const SKY = 0x161b2e;
const MOODS = {
  calm: SKY,
  shadow: 0x1a1730, // level 3: "something's watching the sky"
  courtship: 0x241a35, // level 5
};

// Small canvas drawn by `draw`, shown with hard pixels up close (the retro look) and mipmaps far away.
function pixelTexture(size, draw, repeat = [1, 1]) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 4;
  return tex;
}

function speckle(ctx, size, colors, count, seed, px = 2) {
  const r = rng(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(r() * colors.length)];
    ctx.fillRect(Math.floor((r() * size) / px) * px, Math.floor((r() * size) / px) * px, px, px);
  }
}

const crateTexture = () =>
  pixelTexture(32, (ctx, s) => {
    ctx.fillStyle = '#9b6a35';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#87582a'; // plank seams
    for (let y = 8; y < s; y += 8) ctx.fillRect(0, y, s, 1);
    speckle(ctx, s, ['#a9773d', '#7c5026', '#b4823f'], 90, 3);
    ctx.fillStyle = '#6a4220'; // diagonal brace
    for (let i = 0; i < s; i += 2) {
      ctx.fillRect(i, i, 3, 3);
      ctx.fillRect(s - 3 - i, i, 3, 3);
    }
    ctx.fillStyle = '#5a3819'; // frame
    ctx.fillRect(0, 0, s, 3);
    ctx.fillRect(0, s - 3, s, 3);
    ctx.fillRect(0, 0, 3, s);
    ctx.fillRect(s - 3, 0, 3, s);
  });

const floorTexture = (repeat) =>
  pixelTexture(
    64,
    (ctx, s) => {
      const h = s / 2;
      [
        ['#3b4462', 0, 0],
        ['#272e49', h, 0],
        ['#272e49', 0, h],
        ['#3b4462', h, h],
      ].forEach(([c, x, y]) => {
        ctx.fillStyle = c;
        ctx.fillRect(x, y, h, h);
      });
      speckle(ctx, s, ['#3f4867', '#2c3450', '#333c59'], 70, 5);
    },
    repeat,
  );

// Dark outline around a mesh's edges: what makes the reference's blocks read as chunky toys.
function outlined(mesh, color = 0x140f0a) {
  mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color })));
  return mesh;
}

function shadowed(obj, { cast = true, receive = true } = {}) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = cast;
      o.receiveShadow = receive;
    }
  });
  return obj;
}

// The apple: a slightly squat sphere with a dented top, coloured by how much light the spot would catch
// (cream-gold highlight, orange, deep red, a hint of plum at the shadowed rim), plus freckles and a stem.
function makeApple() {
  const g = new THREE.Group();
  const geo = new THREE.SphereGeometry(0.5, 44, 30);
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const light = new THREE.Vector3(-0.55, 0.7, 0.55).normalize();
  const red = new THREE.Color(0xb02d1f);
  const orange = new THREE.Color(0xd9702f);
  const gold = new THREE.Color(0xf1c561);
  const cream = new THREE.Color(0xfbe3a0);
  const plum = new THREE.Color(0x9c3a5c);
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = v.clone().normalize();
    const t = v.y / 0.5;
    const rad = Math.hypot(v.x, v.z) / 0.5;
    v.x *= 1 + 0.07 * t; // broader shoulders
    v.z *= 1 + 0.07 * t;
    v.y *= 0.92;
    v.y -= (t > 0 ? 0.13 : 0.05) * Math.exp(-((rad / 0.36) ** 2)); // dents at the stem and the base
    pos.setXYZ(i, v.x, v.y, v.z);
    const d = n.dot(light);
    const smooth = (a, b, x) => THREE.MathUtils.smoothstep(x, a, b);
    const c = red
      .clone()
      .lerp(orange, smooth(-0.6, 0.45, d))
      .lerp(gold, smooth(0.05, 0.8, d))
      .lerp(cream, smooth(0.78, 1, d) * 0.7)
      .lerp(plum, smooth(0.1, -0.9, d) * 0.35);
    col.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  const dots = document.createElement('canvas');
  dots.width = 256;
  dots.height = 128;
  const ctx = dots.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, 256, 128);
  const r = rng(17);
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(120,30,20,${0.25 + r() * 0.25})`;
    ctx.beginPath();
    ctx.arc(r() * 256, 12 + r() * 104, 1.2 + r() * 3, 0, Math.PI * 2);
    ctx.fill();
  }
  const map = new THREE.CanvasTexture(dots);
  map.colorSpace = THREE.SRGBColorSpace;
  const body = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map, roughness: 0.42, metalness: 0.02 }));
  g.add(body);

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x6a3b28, roughness: 0.8 });
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.26, 12), woodMat);
  stem.position.set(0.03, 0.5, 0);
  stem.rotation.z = -0.3;
  const cut = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 12),
    new THREE.MeshStandardMaterial({ color: 0x8c5637, roughness: 0.7 }),
  );
  cut.rotation.x = -Math.PI / 2;
  cut.position.y = 0.131;
  stem.add(cut);
  g.add(stem);

  g.rotation.z = 0.1;
  g.scale.setScalar(1.02);
  g.position.y = 0.48;
  return g;
}

// One tuft of grass in the reference's style: broad leaves fanning out, a few tall thin stalks with
// olive buds. Built once as a single geometry and then instanced across the floor.
function makeGrassGeometry() {
  const pos = [];
  const col = [];
  const idx = [];
  const r = rng(3);
  const vert = (p, c) => {
    pos.push(...p);
    col.push(c.r, c.g, c.b);
    return pos.length / 3 - 1;
  };
  // A curved ribbon that tapers to a point. Origin (ox, oy, oz), heading `yaw`, leaning over by `lean`.
  const ribbon = ({ ox = 0, oy = 0, oz = 0, yaw, lean, h, w, c0, c1, seg = 5 }) => {
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const sx = Math.cos(yaw);
    const sz = -Math.sin(yaw);
    let prev = null;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      const bend = lean * h * t * t;
      const half = (w / 2) * Math.sin(Math.PI * (0.12 + 0.88 * t));
      const cx = ox + fx * bend;
      const cy = oy + h * t;
      const cz = oz + fz * bend;
      const c = c0.clone().lerp(c1, t);
      const l = vert([cx - sx * half, cy, cz - sz * half], c);
      const rt = vert([cx + sx * half, cy, cz + sz * half], c);
      if (prev) idx.push(prev[0], prev[1], l, prev[1], rt, l);
      prev = [l, rt];
    }
  };
  const darkG = new THREE.Color(0x2f5e3c);
  const midG = new THREE.Color(0x4f8a4a);
  const tipG = new THREE.Color(0x9ccb6c);
  for (let i = 0; i < 11; i++) {
    ribbon({
      yaw: (i / 11) * Math.PI * 2 + r() * 0.5,
      lean: 0.15 + r() * 0.45,
      h: 0.5 + r() * 0.5,
      w: 0.14 + r() * 0.12,
      c0: r() < 0.5 ? darkG : midG,
      c1: tipG,
    });
  }
  const stalkC0 = new THREE.Color(0x4f7d3f);
  const stalkC1 = new THREE.Color(0x7fa453);
  const budC0 = new THREE.Color(0x9a9553);
  const budC1 = new THREE.Color(0xd2ca84);
  for (let i = 0; i < 3; i++) {
    const yaw = r() * Math.PI * 2;
    const lean = 0.05 + r() * 0.2;
    const h = 1.1 + r() * 0.4;
    ribbon({ yaw, lean, h, w: 0.035, c0: stalkC0, c1: stalkC1, seg: 6 });
    // buds: small pointed leaves alternating up the top of the stalk
    for (let k = 0; k < 4; k++) {
      const t = 0.55 + k * 0.11;
      ribbon({
        ox: Math.sin(yaw) * lean * h * t * t,
        oy: h * t,
        oz: Math.cos(yaw) * lean * h * t * t,
        yaw: yaw + (k % 2 ? 1.6 : -1.6),
        lean: 0.6,
        h: 0.16,
        w: 0.09,
        c0: budC0,
        c1: budC1,
        seg: 3,
      });
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

// Build an InstancedMesh from a list of {px,py,pz, yaw, rx, rz, sx,sy,sz, color}. Returns null when empty.
function instanced(geo, mat, items) {
  if (!items.length) return null;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const sc = new THREE.Vector3();
  items.forEach((it, i) => {
    e.set(it.rx ?? 0, it.yaw ?? 0, it.rz ?? 0, 'YXZ');
    q.setFromEuler(e);
    p.set(it.px, it.py, it.pz);
    sc.set(it.sx ?? 1, it.sy ?? 1, it.sz ?? 1);
    m.compose(p, q, sc);
    mesh.setMatrixAt(i, m);
    if (it.color != null) mesh.setColorAt(i, new THREE.Color(it.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

// A low-poly daisy bush (level 5's target): white petals around a domed orange-yellow centre, on tall dark
// stems over a spread of broad green leaves.
function makeFlower() {
  const g = new THREE.Group();
  const r = rng(7);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
  const paint = (geo, colorAt) => {
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const c = colorAt(pos.getX(i), pos.getY(i), pos.getZ(i), i);
      col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  };

  // Leaves: broad and pointed, a light midrib fading to dark green edges.
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.52, 0.18, 0.58, 0.8, 0.06, 1.15);
  leafShape.bezierCurveTo(-0.46, 0.8, -0.5, 0.2, 0, 0);
  const rib = new THREE.Color(0x86b862);
  const edges = [new THREE.Color(0x3b7240), new THREE.Color(0x4d8446), new THREE.Color(0x2f6a42)];
  const leafGeos = edges.map((edge) =>
    paint(new THREE.ShapeGeometry(leafShape, 6).rotateX(-Math.PI / 2), (x) =>
      rib.clone().lerp(edge, Math.min(1, Math.abs(x) / 0.4)),
    ),
  );
  for (let i = 0; i < 9; i++) {
    const pivot = new THREE.Group();
    pivot.position.y = 0.03 + r() * 0.25;
    pivot.rotation.y = (i / 9) * Math.PI * 2 + (r() - 0.5) * 0.5;
    const leaf = new THREE.Mesh(leafGeos[i % 3], mat);
    leaf.rotation.x = 0.25 + r() * 0.6; // tips rise and arch outward
    leaf.scale.setScalar(0.7 + r() * 0.45);
    pivot.add(leaf);
    g.add(pivot);
  }

  // Daisy head, facing +Y: 18 flat white petals (blunt, slightly ragged tips, a touch of grey at the base),
  // a domed centre that is yellow on top and orange at the rim, and a dark green sepal disc underneath.
  const head = () => {
    const h = new THREE.Group();
    const pos = [];
    const col = [];
    const idx = [];
    const N = 18;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (r() - 0.5) * 0.12;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const px = -dz;
      const pz = dx;
      const rb = 0.15;
      const rt = 0.6 + r() * 0.12;
      const wb = 0.034;
      const wt = 0.07 + r() * 0.02;
      const lift = 0.02 + r() * 0.07; // some petals tilt up, some droop
      const j = (r() - 0.5) * 0.05;
      const base = [
        [dx * rb - px * wb, 0.02, dz * rb - pz * wb],
        [dx * rb + px * wb, 0.02, dz * rb + pz * wb],
        [dx * rt + px * wt + dx * j, 0.02 + lift, dz * rt + pz * wt + dz * j],
        [dx * rt - px * wt - dx * j, 0.02 + lift, dz * rt - pz * wt - dz * j],
      ];
      const shade = 0.93 + r() * 0.07;
      const c0 = [0.83 * shade, 0.81 * shade, 0.87 * shade];
      const c1 = [shade, shade, shade];
      const start = pos.length / 3;
      base.forEach((v, k) => {
        pos.push(...v);
        col.push(...(k < 2 ? c0 : c1));
      });
      idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
    }
    const petals = new THREE.BufferGeometry();
    petals.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    petals.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    petals.setIndex(idx);
    petals.computeVertexNormals();
    h.add(new THREE.Mesh(petals, mat));

    const dome = paint(new THREE.SphereGeometry(0.21, 14, 9), (x, y, z) => {
      const up = THREE.MathUtils.clamp(y / 0.21, 0, 1);
      return new THREE.Color(0xe58a22).lerp(new THREE.Color(0xf8c93a), up);
    });
    const centre = new THREE.Mesh(dome, mat);
    centre.scale.y = 0.55;
    centre.position.y = 0.03;
    h.add(centre);

    const sepal = new THREE.Mesh(
      paint(new THREE.CircleGeometry(0.2, 10).rotateX(-Math.PI / 2), () => new THREE.Color(0x2f5f36)),
      mat,
    );
    sepal.position.y = -0.005;
    h.add(sepal);
    return h;
  };

  const stemMat = new THREE.MeshLambertMaterial({ color: 0x4c7a4c });
  const up = new THREE.Vector3(0, 1, 0);
  const stems = [
    { a: 0.2, dist: 0.7, h: 0.95, size: 0.5 },
    { a: 1.4, dist: 0.25, h: 1.22, size: 0.55 },
    { a: 2.5, dist: 0.6, h: 1.0, size: 0.46 },
    { a: 3.7, dist: 0.5, h: 0.78, size: 0.42 },
    { a: 5.0, dist: 0.8, h: 1.08, size: 0.5 },
  ];
  stems.forEach(({ a, dist, h, size }) => {
    const tip = new THREE.Vector3(Math.cos(a) * dist, h, Math.sin(a) * dist);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, tip.length(), 6), stemMat);
    stem.position.copy(tip).multiplyScalar(0.5);
    stem.quaternion.setFromUnitVectors(up, tip.clone().normalize());
    g.add(stem);
    const d = head();
    d.position.copy(tip);
    d.scale.setScalar(size);
    d.rotation.set((r() - 0.5) * 0.7, r() * Math.PI * 2, (r() - 0.5) * 0.7);
    g.add(d);
  });
  // A closed white bud on its own short stem.
  const budTip = new THREE.Vector3(0.05, 0.42, 0.42);
  const budStem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, budTip.length(), 6), stemMat);
  budStem.position.copy(budTip).multiplyScalar(0.5);
  budStem.quaternion.setFromUnitVectors(up, budTip.clone().normalize());
  const bud = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.13, 1),
    new THREE.MeshLambertMaterial({ color: 0xf6f4f8, flatShading: true }),
  );
  bud.position.copy(budTip);
  g.add(budStem, bud);
  return g;
}

export function createArena(scene) {
  const { minX, maxX, minZ, maxZ } = BOUNDS;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 45, 130);

  // ---- Lights ----
  scene.add(new THREE.HemisphereLight(0xc9d6ff, 0x2a2438, 1.15));
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
  sun.position.set(-7, 14, -6);
  sun.target.position.set(0, 0, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 40 });
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // ---- Floor: an endless checkerboard, one-unit tiles, fading softly into the distance ----
  const FLOOR = 600;
  const floorMat = new THREE.MeshLambertMaterial({ map: floorTexture([FLOOR / 2, FLOOR / 2]) });
  floorMat.map.anisotropy = 8;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR, FLOOR), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.002, cz);
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- Shared bits for props ----
  const crateMat = new THREE.MeshLambertMaterial({ map: crateTexture() });
  const crateGeo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
  const occupied = []; // {x, z, r} in json coordinates: where props stand, so grass keeps out of the way
  const claim = (x, z, r) => occupied.push({ x, z, r });
  const hashStr = (str) => [...String(str)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

  // ---- Scenery around the play area: different for every level ----
  // Positions are in levels.json coordinates; yaw turns a piece; a tower is `rows` tall and `cols` wide.
  // seats: n red seats starting at (x, z), each step (stepX, stepZ) further on, facing `face`.
  const SCENERY = {
    level_1_discovery: {
      towers: [{ x: -8.6, z: 3.1, yaw: 0, rows: 5, cols: 2 }],
      crates: [
        { x: -8.4, z: 5.6, yaw: 0.4 },
        { x: 8.2, z: -0.4, yaw: 0.5 },
        { x: -7.2, z: 6.6, yaw: 0.25 },
      ],
      ramps: [
        { color: 0x94a9b8, x: 7.2, z: -5.6, yaw: 0, tilt: 0.16 },
        { color: 0x7a6040, x: 8.4, z: -7.6, yaw: 0, tilt: 0.1 },
      ],
      seats: { n: 5, x: -2.6, z: -6.2, stepX: 1.15, stepZ: 0, face: -Math.PI / 2 },
    },
    level_2_pie: {
      towers: [{ x: 9.2, z: 5.5, yaw: 0.65, rows: 4, cols: 3 }],
      crates: [
        { x: -8.5, z: 1.5, yaw: 1.1 },
        { x: -9.7, z: 2.7, yaw: 0.2 },
        { x: 8.4, z: -2.2, yaw: -0.7 },
      ],
      ramps: [
        { color: 0x7a6040, x: -8, z: -4.5, yaw: 0.8, tilt: 0.12 },
        { color: 0x94a9b8, x: -9.6, z: -1.6, yaw: 1.05, tilt: 0.16 },
      ],
      seats: { n: 4, x: 3.5, z: -5.2, stepX: 1.0, stepZ: -0.55, face: -Math.PI / 2 + 0.9 },
    },
    level_3_shadow: {
      towers: [
        { x: -9.2, z: 7.2, yaw: -0.5, rows: 6, cols: 2 },
        { x: 9.6, z: -1.2, yaw: 0.3, rows: 3, cols: 2 },
      ],
      crates: [
        { x: 8.6, z: 3.8, yaw: 0.9 },
        { x: -8.2, z: -2.4, yaw: -0.3 },
      ],
      ramps: [{ color: 0x94a9b8, x: 0.5, z: -7.8, yaw: 0.25, tilt: 0.12 }],
      seats: { n: 3, x: -6.6, z: -4.2, stepX: 0.4, stepZ: 1.1, face: 0.2 },
    },
    level_4_lesion: {
      towers: [{ x: 9.4, z: 2.5, yaw: -0.8, rows: 5, cols: 3 }],
      crates: [
        { x: -8.6, z: 6.4, yaw: 0.35 },
        { x: -8.0, z: -0.8, yaw: -1.2 },
        { x: 7.6, z: 7.2, yaw: 0.6 },
      ],
      ramps: [
        { color: 0x7a6040, x: -6.8, z: -6.2, yaw: -0.5, tilt: 0.14 },
        { color: 0x94a9b8, x: 6.6, z: -7.4, yaw: 0.35, tilt: 0.1 },
      ],
      seats: { n: 5, x: -1.6, z: -7.4, stepX: 1.1, stepZ: 0.2, face: -Math.PI / 2 - 0.4 },
    },
    level_5_threshold: {
      towers: [{ x: -9.6, z: 4.6, yaw: 1.2, rows: 4, cols: 2 }],
      crates: [
        { x: 8.8, z: 1.4, yaw: 0.15 },
        { x: 9.9, z: 2.5, yaw: 0.8 },
        { x: -8.0, z: -1.6, yaw: 0.5 },
      ],
      ramps: [
        { color: 0x94a9b8, x: 7.8, z: -4.8, yaw: -0.6, tilt: 0.16 },
        { color: 0x7a6040, x: 9.2, z: -7, yaw: -0.3, tilt: 0.1 },
      ],
      seats: { n: 4, x: -7.8, z: -6.2, stepX: 1.05, stepZ: 0.1, face: -Math.PI / 2 + 0.3 },
    },
  };

  const scenery = new THREE.Group();
  scene.add(scenery);
  const seatMat = new THREE.MeshLambertMaterial({ color: 0xb23a2e });

  function buildScenery(levelId) {
    scenery.clear();
    const cfg = SCENERY[levelId] ?? SCENERY.level_1_discovery;
    const rr = rng(hashStr(levelId));
    const at = (obj, x, z) => {
      const w = toWorld([x, 0, z]);
      obj.position.set(w.x, obj.position.y, w.z);
    };

    cfg.towers.forEach(({ x, z, yaw, rows, cols }) => {
      const g = new THREE.Group();
      for (let row = 0; row < rows; row++) {
        const n = row < rows - 1 ? cols : Math.max(1, cols - 1); // narrows at the top
        for (let c = 0; c < n; c++) {
          const cr = outlined(new THREE.Mesh(crateGeo, crateMat));
          cr.position.set((c - (n - 1) / 2) * 1.02 + (rr() - 0.5) * 0.12, row * 0.96 + 0.48, (rr() - 0.5) * 0.1);
          cr.rotation.y = (rr() - 0.5) * 0.2;
          g.add(cr);
        }
      }
      at(g, x, z);
      g.rotation.y = -yaw;
      scenery.add(shadowed(g));
      claim(x, z, 1 + cols * 0.9);
    });

    cfg.crates.forEach(({ x, z, yaw }) => {
      const cr = outlined(new THREE.Mesh(crateGeo, crateMat));
      cr.position.y = 0.48;
      at(cr, x, z);
      cr.rotation.y = -yaw;
      scenery.add(shadowed(cr));
      claim(x, z, 1);
    });

    cfg.ramps.forEach(({ color, x, z, yaw, tilt }) => {
      const ramp = outlined(
        new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.4, 1.9), new THREE.MeshLambertMaterial({ color })),
        0x0f141c,
      );
      ramp.position.y = 0.4;
      at(ramp, x, z);
      ramp.rotation.set(0, -yaw, tilt, 'YXZ');
      scenery.add(shadowed(ramp));
      claim(x, z, 3);
    });

    const { n, x, z, stepX, stepZ, face } = cfg.seats;
    for (let i = 0; i < n; i++) {
      const seat = new THREE.Group();
      const base = outlined(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.9), seatMat), 0x3d0f0b);
      base.position.y = 0.25;
      const back = outlined(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.9), seatMat), 0x3d0f0b);
      back.position.set(-0.32, 0.85, 0);
      seat.add(base, back);
      at(seat, x + i * stepX, z + i * stepZ);
      seat.rotation.y = face + 0.08 * (i - n / 2);
      scenery.add(shadowed(seat));
      claim(x + i * stepX, z + i * stepZ, 0.9);
    }
  }

  // ---- Level props (rebuilt by configure) ----
  // The apple (the "pie" of levels.json): glossy, yellow at the lit shoulder fading to deep red, with
  // freckles, a dent at the top and a stubby brown stem. A soft ring marks the win radius.
  const pie = new THREE.Group();
  pie.add(makeApple());
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.93, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  const glow = new THREE.PointLight(0xffc27a, 5, 4.5, 2);
  glow.position.y = 1;
  pie.add(ring, glow);
  pie.visible = false;
  scene.add(pie);

  // The shadow (level 3): a bird's silhouette waiting past the far edge. Its telegraph strip and sweep
  // are driven by game.js through arena.shadow.
  const birdShape = new THREE.Shape();
  birdShape.moveTo(0, 1.1);
  birdShape.bezierCurveTo(0.5, 1.0, 0.6, 0.4, 1.6, 0.5);
  birdShape.bezierCurveTo(2.4, 0.55, 3.0, 0.3, 3.6, -0.2);
  birdShape.bezierCurveTo(2.6, -0.1, 1.9, -0.5, 1.0, -0.4);
  birdShape.bezierCurveTo(0.6, -1.0, 0.3, -1.4, 0, -1.9);
  birdShape.bezierCurveTo(-0.3, -1.4, -0.6, -1.0, -1.0, -0.4);
  birdShape.bezierCurveTo(-1.9, -0.5, -2.6, -0.1, -3.6, -0.2);
  birdShape.bezierCurveTo(-3.0, 0.3, -2.4, 0.55, -1.6, 0.5);
  birdShape.bezierCurveTo(-0.6, 0.4, -0.5, 1.0, 0, 1.1);
  const bird = new THREE.Mesh(
    new THREE.ShapeGeometry(birdShape),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }),
  );
  bird.rotation.x = -Math.PI / 2;
  bird.scale.setScalar(0.85);
  bird.position.set(-0.6, 0.02, 11.8);
  bird.visible = false;
  scene.add(bird);

  const bandLen = maxZ - minZ + 6;
  const telegraph = new THREE.Mesh(
    new THREE.PlaneGeometry(SHADOW_HALF_WIDTH * 2, bandLen),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }),
  );
  telegraph.rotation.x = -Math.PI / 2;
  telegraph.position.set(0, 0.03, cz);
  scene.add(telegraph);

  const shadowBody = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  shadowBody.rotation.x = -Math.PI / 2;
  shadowBody.scale.set(SHADOW_HALF_WIDTH + 0.4, 2.2, 1);
  shadowBody.position.y = 0.04;
  shadowBody.visible = false;
  scene.add(shadowBody);

  // Level 5's target: a daisy bush past the far edge, with a few pollen motes drifting toward the start.
  const flower = makeFlower();
  flower.position.copy(toWorld(FLOWER_POS));
  flower.scale.setScalar(2);
  shadowed(flower);
  const pollen = new THREE.Group();
  [0.09, 0.07, 0.06, 0.05].forEach((size, i) => {
    const mote = new THREE.Mesh(
      new THREE.SphereGeometry(size, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0xfff1a0, transparent: true, opacity: 0.7 - i * 0.1 }),
    );
    mote.position.set(-2 + i * 0.4, 0.9 + i * 0.15, 7.3 - i * 1.1);
    pollen.add(mote);
  });
  flower.visible = false;
  pollen.visible = false;
  scene.add(flower, pollen);

  // ---- Hurdles: each level's obstacle course ----
  // Layouts are in levels.json coordinates (+x right of the start, +z ahead). Nothing collides with them
  // yet. Every piece is also listed in world.obstacles (kind, footprint, height) so that when flying and
  // steering exist, the fly can be told what to go over or around. Each `balls` lane holds one ball that rolls across the arena from one side to the other and back.
  //   wall:   a brick-pattern wall of crates.  hurdle: a striped track hurdle.  balls: big balls rolling across.
  const LAYOUTS = {
    level_1_discovery: [
      { type: 'hurdle', x: -3.2, z: 4.8, w: 2.6, yaw: 0.35 },
      { type: 'hurdle', x: 3.2, z: 4.8, w: 2.6, yaw: -0.3 },
      { type: 'balls', lanes: [-2.2, -0.9, 3.7] },
      { type: 'wall', x: 4.8, z: 1.5, along: 'z', n: 3, rows: 2 },
      { type: 'wall', x: -4.8, z: 6.2, along: 'x', n: 2, rows: 3, yaw: 0.4 },
    ],
    level_2_pie: [
      // A stream between the fly's side and the apple's: the fly has to cross it. Balls stay on the far bank.
      { type: 'stream', x: -1.7, w: 2.4 },
      { type: 'wall', x: 2.2, z: -0.2, along: 'z', n: 3, rows: 2 },
      { type: 'hurdle', x: 4.2, z: 4.3, w: 2.4, yaw: -0.4 },
      { type: 'balls', lanes: [3, 5.4], range: [0.8, 5.6] },
      { type: 'wall', x: -4.6, z: 3.6, along: 'z', n: 2, rows: 3, yaw: 0.35 },
    ],
    level_3_shadow: [
      { type: 'wall', x: 2.2, z: -0.2, along: 'z', n: 3, rows: 2 },
      { type: 'hurdle', x: 4.2, z: 4.3, w: 2.4, yaw: -0.4 },
      { type: 'wall', x: -4.5, z: 3.0, along: 'z', n: 2, rows: 4 },
      { type: 'balls', lanes: [-2.4, 5.4, 6.6] },
    ],
    level_4_lesion: [
      { type: 'wall', x: -2.2, z: -0.2, along: 'z', n: 3, rows: 2 },
      { type: 'hurdle', x: -4.2, z: 4.3, w: 2.4, yaw: 0.5 },
      { type: 'balls', lanes: [3, 5.4] },
      { type: 'wall', x: 4.5, z: 1.0, along: 'z', n: 2, rows: 3, yaw: -0.35 },
    ],
    level_5_threshold: [
      { type: 'wall', x: -3.6, z: 4.4, along: 'x', n: 3, rows: 1, yaw: -0.2 },
      { type: 'hurdle', x: 4.2, z: 4.4, w: 2.6, yaw: 0.25 },
      { type: 'balls', lanes: [1, 2.6, 5.5] },
      { type: 'wall', x: -4.8, z: 6.6, along: 'x', n: 2, rows: 4, yaw: 0.3 },
    ],
  };

  const CRATE = 1; // crate pitch
  const props = new THREE.Group();
  scene.add(props);
  const obstacles = [];
  const movers = []; // balls that roll
  const streams = []; // water streams in this level: {x, w} in json coordinates
  let flowTex = null;
  const nearStream = (x, pad) => streams.some((st) => Math.abs(x - st.x) < st.w / 2 + pad);
  let time = 0;
  const ROLL_FROM = -5.5; // balls roll between these x values (json coordinates)
  const ROLL_TO = 5.5;
  const ROLL_PERIOD_S = 10; // one full trip there and back
  const BALL_R = 0.55;
  const ballColorList = [0xf2c63a, 0xe88a3c, 0x6cc8ee]; // yellow, orange, sky blue
  const ballGeo = new THREE.SphereGeometry(BALL_R, 24, 16);
  const barTex = pixelTexture(16, (ctx, sz) => {
    for (let i = 0; i < sz; i += 4) {
      ctx.fillStyle = (i / 4) % 2 ? '#f2efe6' : '#d8382e';
      ctx.fillRect(i, 0, 4, sz);
    }
  });
  const postMat = new THREE.MeshLambertMaterial({ color: 0xe9e4d6 });

  function addProp(obj, ob) {
    props.add(shadowed(obj));
    obstacles.push(ob);
  }

  const build = {
    wall({ x, z, along, n, rows, yaw = 0 }) {
      const rowH = 0.96;
      for (let row = 0; row < rows; row++) {
        const offset = row % 2 ? CRATE / 4 : -CRATE / 4; // alternate rows shift half a crate: brick pattern
        for (let i = 0; i < n; i++) {
          const along1 = (i - (n - 1) / 2) * CRATE + (rows > 1 ? offset : 0);
          const c = outlined(new THREE.Mesh(crateGeo, crateMat));
          const [dx, dz] = along === 'x' ? [along1, 0] : [0, along1];
          const w = toWorld([x + dx * Math.cos(yaw) + dz * Math.sin(yaw), 0, z - dx * Math.sin(yaw) + dz * Math.cos(yaw)]);
          c.position.set(w.x, row * rowH + 0.48, w.z);
          c.rotation.y = -yaw + (((row * 7 + i * 3) % 5) - 2) * 0.03;
          props.add(shadowed(c));
        }
      }
      obstacles.push({
        kind: 'wall',
        x,
        z,
        w: along === 'x' ? n * CRATE : CRATE,
        d: along === 'z' ? n * CRATE : CRATE,
        height: rows * rowH,
      });
    },

    hurdle({ x, z, w, yaw = 0 }) {
      const g = new THREE.Group();
      const h = 0.72;
      [-w / 2, w / 2].forEach((dx) => {
        const post = outlined(new THREE.Mesh(new THREE.BoxGeometry(0.14, h, 0.14), postMat), 0x2a2a30);
        post.position.set(dx, h / 2, 0);
        const foot = outlined(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.6), postMat), 0x2a2a30);
        foot.position.set(dx, 0.03, 0);
        g.add(post, foot);
      });
      const barMat = new THREE.MeshLambertMaterial({ map: barTex.clone() });
      barMat.map.needsUpdate = true;
      barMat.map.repeat.set(Math.round(w * 2), 1);
      const bar = outlined(new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 0.12), barMat), 0x2a2a30);
      bar.position.y = h - 0.1;
      g.add(bar);
      const pos = toWorld([x, 0, z]);
      g.position.set(pos.x, 0, pos.z);
      g.rotation.y = -yaw;
      addProp(g, { kind: 'hurdle', x, z, w: w + 0.14, d: 0.6, height: h });
    },

    // A water stream running along z: splits the floor, adds cliff banks, water and a flow layer.
    stream({ x, w }) {
      const FL = 600;
      const cxw = -x; // world x of the stream's centre
      const x0 = cxw - w / 2;
      const x1 = cxw + w / 2;
      floor.visible = false;
      [
        [-FL / 2, x0],
        [x1, FL / 2],
      ].forEach(([a, b]) => {
        const half = new THREE.Mesh(
          new THREE.PlaneGeometry(b - a, FL),
          new THREE.MeshLambertMaterial({ map: floorTexture([(b - a) / 2, FL / 2]) }),
        );
        half.rotation.x = -Math.PI / 2;
        half.position.set((a + b) / 2, -0.002, cz);
        half.receiveShadow = true;
        props.add(half);
      });
      const stream = makeStream({ cx: cxw, width: w, length: 140, zc: 30 });
      props.add(stream.group);
      flowTex = stream.flowTex;
      streams.push({ x, w });
      obstacles.push({ kind: 'water', x, z: 30, w, d: 140, height: -0.3, moving: false, spans: 'z' });
    },

    balls({ lanes, range = [ROLL_FROM, ROLL_TO] }) {
      lanes.forEach((z, i) => {
        const ball = new THREE.Mesh(
          ballGeo,
          new THREE.MeshStandardMaterial({ color: ballColorList[i % ballColorList.length], roughness: 0.3, metalness: 0.05 }),
        );
        const ob = { kind: 'ball', x: range[0], z, w: BALL_R * 2, d: BALL_R * 2, height: BALL_R * 2, moving: true, axis: 'x', range };
        ball.position.copy(toWorld([ob.x, BALL_R, z]));
        addProp(ball, ob);
        // One ball per lane, so lanes never collide; each starts at a different point of its trip.
        movers.push({ ball, ob, phase: i * 2.1, range });
      });
    },
  };

  // ---- The endless course: hurdles, crates and ramps scattered across the whole floor ----
  // Everything outside the play area's neighbourhood, placed from a per-level seed so each level's
  // ground is laid out differently. Instanced, so hundreds of pieces stay cheap. No collisions.
  const fieldGroup = new THREE.Group();
  scene.add(fieldGroup);
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0x140f0a, side: THREE.BackSide });
  const fieldBarTex = barTex.clone();
  fieldBarTex.needsUpdate = true;
  fieldBarTex.repeat.set(5, 1);
  const fieldBarMat = new THREE.MeshLambertMaterial({ map: fieldBarTex });
  const rampGeo = new THREE.BoxGeometry(4.4, 0.4, 1.7);
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });

  function buildField(levelId) {
    fieldGroup.clear();
    const rr = rng(hashStr(levelId) + 99);
    const crates = [];
    const hurdles = [];
    const ramps = [];
    const CELL = 5.5;
    // world position of a spot offset (lx, lz) from json (x, z) after turning by yaw
    const spot = (x, z, yaw, lx, lz) => {
      const w = toWorld([x, 0, z]);
      return [w.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), w.z - lx * Math.sin(yaw) + lz * Math.cos(yaw)];
    };
    const crate = (x, z, yaw, lx, ly, lz) => {
      const [px, pz] = spot(x, z, yaw, lx, lz);
      crates.push({ px, py: ly * 0.96 + 0.48, pz, yaw: yaw + (rr() - 0.5) * 0.08 });
    };

    for (let cz = -10; cz <= 34; cz += CELL) {
      for (let cx = -30; cx <= 30; cx += CELL) {
        const x = cx + rr() * CELL * 0.8;
        const z = cz + rr() * CELL * 0.8;
        if (Math.abs(x) < 12.5 && z > -10 && z < 10) continue; // play area and its scenery
        // Keep the Side and Front preset views' lines of sight open.
        if (Math.abs(z - 2.6) < 5 && Math.abs(x) > 12) continue;
        if (Math.abs(x) < 4.5 && z > 10) continue;
        if (nearStream(x, 3)) continue; // keep clear of the water
        if (rr() < 0.78) continue;
        const kind = rr();
        const yaw = rr() * Math.PI;
        if (kind < 0.4) {
          hurdles.push({ x, z, yaw });
          claim(x, z, 2);
        } else if (kind < 0.64) {
          const n = 2 + Math.floor(rr() * 4);
          const rows = 1 + Math.floor(rr() * 3);
          for (let row = 0; row < rows; row++) {
            for (let i = 0; i < n; i++) crate(x, z, yaw, (i - (n - 1) / 2) * 1 + (row % 2 ? 0.25 : -0.25), row, 0);
          }
          claim(x, z, n / 2 + 1);
        } else if (kind < 0.8) {
          const rows = 2 + Math.floor(rr() * 4);
          for (let row = 0; row < rows; row++) {
            const n = row < rows - 1 ? 2 : 1;
            for (let i = 0; i < n; i++) crate(x, z, yaw, (i - (n - 1) / 2) * 1.02, row, (rr() - 0.5) * 0.1);
          }
          claim(x, z, 1.8);
        } else if (kind < 0.92) {
          for (let i = 0; i < 1 + Math.floor(rr() * 3); i++) crate(x, z, rr() * 3, (rr() - 0.5) * 3, 0, (rr() - 0.5) * 3);
          claim(x, z, 2.2);
        } else {
          const [px, pz] = spot(x, z, 0, 0, 0);
          ramps.push({ px, py: 0.35, pz, yaw: -yaw, rz: 0.1 + rr() * 0.08, color: rr() < 0.5 ? 0x94a9b8 : 0x7a6040 });
          claim(x, z, 2.6);
        }
      }
    }

    // Crates, each with a slightly larger black back-face copy: the same chunky outline as the near ones.
    const outlineItems = crates.map((c) => ({ ...c, sx: 1.07, sy: 1.07, sz: 1.07 }));
    const parts = [
      instanced(crateGeo, crateMat, crates),
      instanced(crateGeo, outlineMat, outlineItems),
      instanced(rampGeo, white, ramps),
    ];

    // Hurdles: two posts with feet and a striped bar, all 2.4 wide.
    const W = 2.4;
    const posts = [];
    const feet = [];
    const bars = [];
    hurdles.forEach(({ x, z, yaw }) => {
      [-W / 2, W / 2].forEach((lx) => {
        const [px, pz] = spot(x, z, yaw, lx, 0);
        posts.push({ px, py: 0.36, pz, yaw: yaw });
        feet.push({ px, py: 0.03, pz, yaw: yaw });
      });
      const [bx, bz] = spot(x, z, yaw, 0, 0);
      bars.push({ px: bx, py: 0.62, pz: bz, yaw: yaw });
    });
    parts.push(
      instanced(new THREE.BoxGeometry(0.14, 0.72, 0.14), postMat, posts),
      instanced(new THREE.BoxGeometry(0.16, 0.06, 0.6), postMat, feet),
      instanced(new THREE.BoxGeometry(W, 0.16, 0.12), fieldBarMat, bars),
    );
    parts.forEach((m) => m && fieldGroup.add(m));
  }

  // ---- Grass and bushes: random tufts and blooming hex-patched bushes around the play area ----
  const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const grassGeo = makeGrassGeometry();
  const bushMat = bushMaterial();
  const bushGeos = { y: makeBushGeometry('y'), g: makeBushGeometry('g') };
  const grassGroup = new THREE.Group();
  scene.add(grassGroup);

  function buildGrass(levelId) {
    grassGroup.clear();
    const rr = rng(hashStr(levelId) + 7);
    // Keep the play area and everything standing in it clear.
    const blockers = [
      ...occupied,
      { x: -world.start.x, z: world.start.z, r: 2.4 },
      ...(world.pie ? [{ x: -world.pie.pos.x, z: world.pie.pos.z, r: 2.4 }] : []),
      ...(world.target ? [{ x: -world.target.x, z: world.target.z, r: 3.4 }] : []),
    ];
    obstacles.forEach((ob) => {
      if (ob.kind === 'water') return; // handled by nearStream
      if (ob.kind === 'ball') for (let x = ob.range[0]; x <= ob.range[1]; x += 1) blockers.push({ x, z: ob.z, r: 1.1 });
      else blockers.push({ x: ob.x, z: ob.z, r: Math.max(ob.w, ob.d) / 2 + 1 });
    });
    const grass = [];
    const bushes = { y: [], g: [] };
    let bushCount = 0;
    for (let tries = 0; tries < 1400 && grass.length + bushCount < 150; tries++) {
      const x = (rr() - 0.5) * 56;
      const z = -9 + Math.pow(rr(), 1.2) * 50;
      if (Math.abs(x) < 6.8 && z > -3.3 && z < 7.8) continue; // the play area itself stays clear
      if (nearStream(x, 1.6)) continue;
      if (blockers.some((b) => Math.hypot(b.x - x, b.z - z) < b.r)) continue;
      const w = toWorld([x, 0, z]);
      // About a third of the spots become a bush instead of a tuft of grass.
      if (rr() < 0.36 && bushCount < 40 && !blockers.some((b) => Math.hypot(b.x - x, b.z - z) < b.r + 0.8)) {
        const sc = 1.1 + rr() * 0.9;
        bushes[rr() < 0.5 ? 'y' : 'g'].push({ px: w.x, py: 0, pz: w.z, yaw: rr() * Math.PI * 2, sx: sc, sy: sc * (0.9 + rr() * 0.3), sz: sc });
        blockers.push({ x, z, r: 1.5 });
        bushCount++;
        continue;
      }
      const sc = 0.65 + rr() * 0.6;
      grass.push({ px: w.x, py: 0, pz: w.z, yaw: rr() * Math.PI * 2, sx: sc, sy: sc * (0.85 + rr() * 0.4), sz: sc });
    }
    [instanced(grassGeo, grassMat, grass), instanced(bushGeos.y, bushMat, bushes.y), instanced(bushGeos.g, bushMat, bushes.g)].forEach(
      (m) => m && grassGroup.add(m),
    );
  }

  function buildLevel(levelId) {
    props.clear();
    obstacles.length = 0;
    movers.length = 0;
    streams.length = 0;
    flowTex = null;
    floor.visible = true;
    (LAYOUTS[levelId] ?? []).forEach((item) => build[item.type](item));
  }

  // ---- Start board and campfire ----
  const startBoard = makeStartBoard();
  scene.add(startBoard);
  const campfire = makeCampfire();
  const fire = campfire;
  scene.add(campfire.group);
  // One campfire per level, off to a side the fly has no business going. json coordinates.
  const FIRES = {
    level_1_discovery: [7.4, 3.4],
    level_2_pie: [7.6, 1.8],
    level_3_shadow: [7.4, 1.4],
    level_4_lesion: [-7.4, 3.6],
    level_5_threshold: [7.2, 5.4],
  };

  // Shared with the behavior runner: it reads these fields every frame.
  const world = { bounds: BOUNDS, pie: null, target: null, obstacles, start: toWorld(START_DEFAULT) };
  world.start.y = 0.055; // the fly stands on the start board

  const setMood = (hex) => {
    scene.background.set(hex);
    scene.fog.color.set(hex);
  };

  return {
    world,

    // cfg is a level's `arena` block from levels.json (or null for the open discovery arena).
    // levelId picks the hurdle layout for that level.
    configure(cfg, levelId) {
      occupied.length = 0;
      world.start = toWorld(STARTS[levelId] ?? START_DEFAULT);
      world.start.y = 0.055;
      // The start board sits under the fly, with its signpost on the side nearer the middle of the arena.
      startBoard.position.set(world.start.x, 0, world.start.z);
      startBoard.userData.sign.position.x = world.start.x > 0 ? -1.75 : 1.75;
      const [fx, fz] = FIRES[levelId] ?? FIRES.level_1_discovery;
      const fw = toWorld([fx, 0, fz]);
      campfire.group.position.set(fw.x, 0, fw.z);
      claim(fx, fz, 3.2);
      buildLevel(levelId);
      buildScenery(levelId);
      world.pie = null;
      world.target = null;
      pie.visible = false;
      bird.visible = false;
      flower.visible = false;
      pollen.visible = false;
      this.shadow.hide();
      setMood(MOODS.calm);

      if (cfg?.pie_position) {
        world.pie = { pos: toWorld(cfg.pie_position), radius: cfg.pie_radius };
        pie.position.copy(world.pie.pos);
        ring.scale.setScalar(cfg.pie_radius);
        pie.visible = true;
      }
      if (cfg?.shadow) {
        bird.visible = true;
        setMood(MOODS.shadow);
      }
      if (cfg?.target === 'female_fly_present_offscreen_cue') {
        world.target = flower.position.clone();
        flower.visible = true;
        pollen.visible = true;
        setMood(MOODS.courtship);
      }

      buildField(levelId);
      buildGrass(levelId);
    },

    // Rolls the balls. The only animation in the world.
    update(dtMs) {
      time += dtMs / 1000;
      bushTime.value = time; // drives the bushes' blooming
      fire.update(time);
      if (flowTex) flowTex.offset.y = -(time * 0.07) % 1; // the stream flows toward the default camera
      movers.forEach(({ ball, ob, phase, range }) => {
        // Left to right, then back, slowing at each side: -cos starts at the left edge heading right.
        const mid = (range[0] + range[1]) / 2;
        const half = (range[1] - range[0]) / 2;
        ob.x = mid - half * Math.cos((time / ROLL_PERIOD_S) * Math.PI * 2 + phase);
        const before = ball.position.x;
        ball.position.x = -ob.x;
        ball.rotation.z -= (ball.position.x - before) / BALL_R; // roll without slipping
      });
    },

    // Is a world position inside the shadow's hit band?
    inHitArea: (pos) => Math.abs(pos.x) <= SHADOW_HALF_WIDTH,

    shadow: {
      // Warning: the band darkens and pulses. `k` is 0..1 through the telegraph lead.
      telegraph(k) {
        telegraph.material.color.set(0x5a1414);
        telegraph.material.opacity = 0.18 + 0.32 * k * (0.6 + 0.4 * Math.sin(k * 30));
      },
      // The sweep: u 0..1 through the active window, moving down the band from far to near.
      sweep(u) {
        telegraph.material.color.set(0x000000);
        telegraph.material.opacity = 0.35;
        shadowBody.visible = true;
        shadowBody.position.z = maxZ + 3 - u * (maxZ - minZ + 6);
      },
      hide() {
        telegraph.material.opacity = 0;
        shadowBody.visible = false;
      },
    },
  };
}
