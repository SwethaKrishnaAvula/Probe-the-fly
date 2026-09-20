import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { toWorld } from './coords.js';
import { rng } from './random.js';
import {
  canvasTex,
  makePie,
  PIE_R,
  makeChoppingBoard,
  makeRollingPinHurdle,
  makeFruit,
  cheeseMaterial,
  cheeseGeo,
  makeSaltBox,
  makeVegBowl,
} from './kitchenProps.js';
import { makeStove, STOVE, makeSink, makeLandingTable, makePieTable, makeSillFlowers, TABLE_TOP } from './kitchenSets.js';

export { toWorld };

// The world the fly lives in: a warm, illustrated kitchen, built around one long, fairly narrow blue counter.
// Left to right, in level 2: the fly's landing table, a square sink, the chopping hand, then the stove under the
// window (with the daisies on the sill beside it), and at the far right end the pie and tea on a side table. The
// camera opens on the fly's end, so the pie is not in the first view; orbit or slide the view to find it.
// Level 4 is the mirror image (the fly starts on the right). The chopping hand, the boiling pot, flames, steam,
// tap water and rolling fruit move; everything else is still. Same interface as the old sandbox arena.
//
// The room's walls are drawn single-sided, facing in, so they never block the view when the camera swings round.
// levels.json puts the pie at [4, 0, 2]; here it sits at the far end of the counter, [12, 0, 2.4], instead.

// Positions below are json coordinates for an un-mirrored level (+x to the fly's right, +z ahead).
// Level 2 is laid out as briefed: landing table, square sink, chopping hand, stove under the window, pie and tea at
// the far right. Every other level has its own arrangement, so no two levels share a layout.
const COUNTER_X = [-11.5, 16.5];
const BOUNDS_X = [-11.2, 16.2]; // where the fly may go
const BOUNDS_Z = [-3.2, 9.0];
const SHADOW_HALF_WIDTH = 1.5;
const SINK_SIZE = 4.2;

// Counter depth (world z; the counter surface is y = 0).
const COUNTER = { front: -3.6, back: 9.4 };
const TABLE_H = TABLE_TOP;

// start: where the fly lands. pie: the far-end table (with the pie and tea only in levels that have a pie to reach).
// board: the chopping hand. sill: the window-sill board's centre and the daisy jar's x (level 5's target).
// mirrored: swap left and right. items: what is on the counter. A fruit lane is {x, z: [from, to]}: it rolls front to
// back along the counter at that x. Items marked `decor` are just scenery, off the fly's route.
//
// The obstacles ramp up with the levels, following what levels.json asks of each:
//   1 Discovery: explore freely, no goal and no fail, so nothing is in the way: only scenery.
//   2 Reach the pie: the sink to cross, a hurdle and one rolling fruit.
//   3 Pie + shadow: a hurdle, a cheese wall and two rolling fruit, and the shadow to time (the stove is by the start).
//   4 Lesion: a taller cheese wall, a hurdle, two rolling fruit and a stack of salt boxes, all to get round while the
//     left-turn hotspot is dead. The fly starts on the right.
//   5 Threshold: no pie: the daisies on the sill. The most in the way: cheese, hurdle, fruit, salt boxes and a bowl.
const SCENES = {
  level_1_discovery: {
    start: [-9.3, 0, 2.6],
    pie: [12, 0, 2.4],
    hasPie: false,
    board: [-3.0, 0, -1.4],
    sill: { cx: 0.2, flowers: -0.6 },
    items: [
      { type: 'stove', x: 5.0, z: 6.0, yaw: 0.1, decor: true },
      { type: 'saltbox', x: -5.8, z: 7.2, n: 2, decor: true },
      { type: 'bowl', x: -1.8, z: 6.6, decor: true },
      { type: 'saltbox', x: 8.4, z: -1.6, n: 1, decor: true, offset: 2 },
    ],
  },
  // As briefed: sink, hand, stove under the window, pie and tea at the far right.
  level_2_pie: {
    start: [-9.3, 0, 2.6],
    pie: [12, 0, 2.4],
    hasPie: true,
    board: [-0.8, 0, -1.4],
    sill: { cx: 5.8, flowers: 4.4 },
    items: [
      { type: 'sink', x: -5.4, z: 2.6 },
      { type: 'stove', x: 0.6, z: 5.9, yaw: 0.05 },
      { type: 'hurdle', x: 6.6, z: 5.2, w: 2.4, yaw: -0.2 },
      { type: 'fruit', lanes: [{ x: 4.0, z: [-2.8, 1.5] }] },
      { type: 'bowl', x: -4.4, z: 6.8, decor: true },
      { type: 'saltbox', x: 4.6, z: 7.2, n: 1, decor: true },
    ],
  },
  level_3_shadow: {
    start: [-9.3, 0, 0.8],
    pie: [12, 0, 2.4],
    hasPie: true,
    board: null, // no chopping hand in this level: the stove is the focus
    sill: { cx: 6.4, flowers: 5.6 },
    items: [
      // The stove sits in the middle of the counter under the window: its fumes roll from it toward the camera
      // down the hit band, so the fly has to cross the stove's path.
      { type: 'stove', x: 0, z: 5.9, yaw: 0 },
      { type: 'hurdle', x: -6.4, z: 3.8, w: 2.2, yaw: 0.2 },
      { type: 'wall', x: 4.6, z: 4.5, along: 'z', n: 3, rows: 2, yaw: 0.1 },
      { type: 'fruit', lanes: [{ x: 2.6, z: [-2.8, -0.2] }, { x: 8.0, z: [3.9, 6.8] }] },
      { type: 'saltbox', x: -5.2, z: 6.9, n: 2, decor: true },
      { type: 'bowl', x: -5.4, z: 8.5, decor: true },
    ],
  },
  level_4_lesion: {
    mirrored: true,
    start: [-9.3, 0, 2.6],
    // The left-turn hotspot is dead, so the fly gets left with three right turns and one flight: the pie sits where
    // that ends (the flight is 10.3 long), in the middle of the counter. Its table takes x -3.4..4.2, z -0.8..4.8, so
    // the hurdle, the salt boxes and the second fruit lane were moved out of its way.
    pie: [0.37, 0, 1.96],
    hasPie: true,
    board: [6.4, 0, -1.4], // beside the pie table, not in front of it
    sill: { cx: 1.0, flowers: 0.2 },
    items: [
      { type: 'stove', x: 5.2, z: 5.9, yaw: 0.1 },
      { type: 'wall', x: -4.6, z: 4.6, along: 'z', n: 2, rows: 3, yaw: 0.25 },
      { type: 'hurdle', x: -9.2, z: 6.4, w: 2.0, yaw: 0.2 },
      { type: 'fruit', lanes: [{ x: -6.4, z: [-2.8, 0.6] }, { x: -6.6, z: [4.6, 7.9] }] },
      { type: 'saltbox', x: 9.4, z: 1.4, n: 2 },
    ],
  },
  level_5_threshold: {
    start: [-9.3, 0, 1.0],
    pie: [12.6, 0, 2.4],
    hasPie: false,
    board: [-5.0, 0, -1.4],
    sill: { cx: 0, flowers: -0.6 },
    items: [
      { type: 'stove', x: 5.6, z: 5.9, yaw: 0.2 },
      { type: 'saltbox', x: -8.4, z: 7.0, n: 2, offset: 1 },
      { type: 'wall', x: -1.4, z: 2.4, along: 'x', n: 3, rows: 2, yaw: -0.2 },
      { type: 'hurdle', x: 2.4, z: 3.0, w: 2.6, yaw: 0.25 },
      { type: 'fruit', lanes: [{ x: 1.8, z: [-2.8, 0.6] }, { x: 10.4, z: [3.8, 7.6] }] },
      { type: 'bowl', x: -2.6, z: 6.4 },
    ],
  },
};

const FRUIT_R = 0.55;
const BOX_KINDS = [
  { label: 'SALT', tint: 0x3f6fb5 },
  { label: 'PEPPER', tint: 0x9a3b2f },
  { label: 'SUGAR', tint: 0xd9772f },
];

export function createKitchen(scene) {
  const cz = (COUNTER.front + COUNTER.back) / 2;
  const depth = COUNTER.back - COUNTER.front;
  scene.background = new THREE.Color(0x2b2436);

  // ---- Lights: warm sun through the window, a soft fill from the room ----
  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x3b3050, 1.05);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe2b4, 2.3);
  sun.position.set(5, 16, 24);
  sun.target.position.set(0, 0, 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 22, bottom: -22, near: 1, far: 70 });
  sun.shadow.bias = -0.0005;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xfff3e2, 1.5);
  fill.position.set(-4, 12, -20);
  fill.target.position.set(0, 2, 6);
  scene.add(fill, fill.target);

  // ---- The room: plank floor, cream side walls, tiled back wall with the window ----
  // Walls are single-sided planes facing into the room, so from outside (a camera swung round the side or
  // behind) they are simply not drawn and never hide the counter.
  const ROOM_X = 26;
  const floorTex = canvasTex(
    128,
    128,
    (ctx, w, h) => {
      const r = rng(15);
      for (let i = 0; i < 8; i++) {
        const t = 120 + Math.floor(r() * 25);
        ctx.fillStyle = `rgb(${t + 15},${t - 20},${t - 60})`;
        ctx.fillRect(0, (i * h) / 8, w, h / 8);
        ctx.fillStyle = 'rgba(50,25,10,0.5)';
        ctx.fillRect(0, (i * h) / 8, w, 2);
      }
    },
    { repeat: [14, 14] },
  );
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshLambertMaterial({ map: floorTex }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -9.05, cz);
  scene.add(floor);
  const wallZ = COUNTER.back + 0.3;
  const roomDepth = wallZ - (COUNTER.front - 8);
  [-1, 1].forEach((side) => {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(roomDepth, 26), new THREE.MeshLambertMaterial({ color: 0xe9dcc2 }));
    wall.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2; // faces the room
    wall.position.set(side * ROOM_X, 4, (wallZ + COUNTER.front - 8) / 2);
    scene.add(wall);
    const wain = new THREE.Mesh(new THREE.PlaneGeometry(roomDepth, 6), new THREE.MeshLambertMaterial({ color: 0x86ac93 }));
    wain.rotation.y = wall.rotation.y;
    wain.position.set(side * (ROOM_X - 0.02), -6, wall.position.z);
    scene.add(wain);
  });

  const tileBase = canvasTex(128, 64, (ctx, w, h) => {
    ctx.fillStyle = '#d9d2c2';
    ctx.fillRect(0, 0, w, h);
    const r = rng(6);
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const off = row ? w / 4 : 0;
        const shade = 0.95 + r() * 0.05;
        ctx.fillStyle = `rgb(${Math.floor(246 * shade)},${Math.floor(241 * shade)},${Math.floor(230 * shade)})`;
        ctx.fillRect(col * (w / 2) + off + 2, row * (h / 2) + 2, w / 2 - 4, h / 2 - 4);
      }
    }
  });
  const WIN = { x0: -3.6, x1: 3.6, y0: 3.0, y1: 7.6 };
  const WALL_TOP = 17;
  const tiled = (x0, x1, y0, y1) => {
    const tex = tileBase.clone();
    tex.needsUpdate = true;
    tex.repeat.set((x1 - x0) / 2.4, (y1 - y0) / 1.2);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, y1 - y0), new THREE.MeshLambertMaterial({ map: tex }));
    m.rotation.y = Math.PI; // faces -z, into the room
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, wallZ);
    m.receiveShadow = true;
    scene.add(m);
  };
  tiled(-ROOM_X, WIN.x0, -9, WALL_TOP);
  tiled(WIN.x1, ROOM_X, -9, WALL_TOP);
  tiled(WIN.x0, WIN.x1, -9, WIN.y0);
  tiled(WIN.x0, WIN.x1, WIN.y1, WALL_TOP);

  const frameWood = new THREE.MeshLambertMaterial({ color: 0x9a6a3c });
  const bar = (w, h, d, x, y, z) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), frameWood);
    b.position.set(x, y, z);
    b.castShadow = true;
    scene.add(b);
  };
  const fw = WIN.x1 - WIN.x0;
  const fh = WIN.y1 - WIN.y0;
  bar(fw + 0.5, 0.3, 0.5, 0, WIN.y1 + 0.1, wallZ - 0.25);
  bar(fw + 0.5, 0.3, 0.5, 0, WIN.y0 - 0.1, wallZ - 0.25);
  bar(0.3, fh, 0.5, WIN.x0 - 0.1, (WIN.y0 + WIN.y1) / 2, wallZ - 0.25);
  bar(0.3, fh, 0.5, WIN.x1 + 0.1, (WIN.y0 + WIN.y1) / 2, wallZ - 0.25);
  bar(0.16, fh, 0.2, 0, (WIN.y0 + WIN.y1) / 2, wallZ - 0.1);
  bar(fw, 0.16, 0.2, 0, (WIN.y0 + WIN.y1) / 2, wallZ - 0.1);
  bar(fw + 1.2, 0.22, 1.0, 0, WIN.y0 - 0.32, wallZ - 0.6);
  [-1, 1].forEach((side) => {
    const curtain = new THREE.Mesh(new THREE.BoxGeometry(1.5, fh + 0.8, 0.22), new THREE.MeshLambertMaterial({ color: 0xf3e6c8 }));
    curtain.position.set(side * (fw / 2 + 0.9), (WIN.y0 + WIN.y1) / 2 + 0.2, wallZ - 0.5);
    scene.add(curtain);
  });
  const garden = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 40),
    new THREE.MeshBasicMaterial({
      map: canvasTex(512, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#8ccdf2');
        g.addColorStop(0.55, '#dff1f5');
        g.addColorStop(0.56, '#9ccc6a');
        g.addColorStop(1, '#6fae4f');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#7fb85a';
        ctx.beginPath();
        ctx.ellipse(120, h * 0.62, 190, 40, 0, Math.PI, 0);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(400, h * 0.62, 210, 55, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#4f9a48';
        [[60, 120], [200, 132], [330, 118], [450, 128]].forEach(([x, y]) => {
          ctx.beginPath();
          ctx.arc(x, y, 22 + (x % 7), 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.fillStyle = '#fff';
        for (let i = 0; i < 6; i++) ctx.fillRect(30 + i * 80, 30 + ((i * 37) % 40), 44, 10);
      }),
    }),
  );
  garden.position.set(0, 4.4, wallZ + 14);
  garden.rotation.y = Math.PI;
  scene.add(garden);

  // Upper cabinets and a shelf of jars either side of the window (set into the wall, above head height).
  const upperTex = canvasTex(
    128,
    128,
    (ctx, w, h) => {
      ctx.fillStyle = '#86ac93';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#6a9078';
      ctx.lineWidth = 4;
      ctx.strokeRect(8, 8, w - 16, h - 16);
      ctx.fillStyle = '#d9c489';
      ctx.beginPath();
      ctx.arc(w - 22, h - 26, 4, 0, Math.PI * 2);
      ctx.fill();
    },
    { repeat: [3, 1] },
  );
  [-1, 1].forEach((side) => {
    const cab = new THREE.Mesh(new THREE.BoxGeometry(8.5, 4.6, 1.5), new THREE.MeshLambertMaterial({ map: upperTex }));
    cab.position.set(side * 9.6, 6.6, wallZ - 1.0);
    cab.castShadow = true;
    scene.add(cab);
  });
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(5, 0.22, 1.0), frameWood);
  shelf.position.set(-16, 5.2, wallZ - 0.6);
  scene.add(shelf);
  [0xe85f4a, 0xf2c94c, 0x7cb46a, 0xe8a04a, 0x5f95d3].forEach((c, i) => {
    const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 16), new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, transparent: true, opacity: 0.88 }));
    jar.position.set(-17.9 + i * 1.05, 5.78, wallZ - 0.6);
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.43, 0.43, 0.14, 16), new THREE.MeshStandardMaterial({ color: 0xd9c489, metalness: 0.6, roughness: 0.4 }));
    lid.position.set(-17.9 + i * 1.05, 6.3, wallZ - 0.6);
    jar.castShadow = true;
    scene.add(jar, lid);
  });

  // ---- Counter: rebuilt per level (its ends and the sink hole depend on the level) ----
  const counterTex = (rep) =>
    canvasTex(
      256,
      256,
      (ctx, w, h) => {
        const r = rng(2);
        ctx.fillStyle = '#3f79bd';
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 900; i++) {
          const c = r();
          ctx.fillStyle = c < 0.4 ? 'rgba(96,152,214,0.55)' : c < 0.75 ? 'rgba(40,88,150,0.5)' : 'rgba(255,255,255,0.45)';
          const sz = 1 + Math.floor(r() * 3);
          ctx.fillRect(r() * w, r() * h, sz, sz);
        }
      },
      { repeat: rep },
    );
  const counterMat = (rep) => new THREE.MeshStandardMaterial({ map: counterTex(rep), roughness: 0.62, metalness: 0 });
  const lipMat = new THREE.MeshStandardMaterial({ color: 0xdce9f7, roughness: 0.4 });
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x6f8f80 });
  const cabinetTexBase = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#86ac93';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#6a9078';
    ctx.lineWidth = 4;
    ctx.strokeRect(10, 12, w - 20, h - 24);
    ctx.strokeStyle = '#a3c4ae';
    ctx.lineWidth = 2;
    ctx.strokeRect(18, 20, w - 36, h - 40);
    ctx.fillStyle = '#d9c489';
    ctx.beginPath();
    ctx.arc(w - 26, h / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  });
  const counterGroup = new THREE.Group();
  scene.add(counterGroup);

  // x0..x1: world extent of the counter. hole: world rectangle cut out for a sink, or null.
  function buildCounter(x0, x1, hole) {
    counterGroup.clear();
    const piece = (xa, xb, za, zb) => {
      if (xb - xa < 0.01 || zb - za < 0.01) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(xb - xa, zb - za), counterMat([(xb - xa) / 4, (zb - za) / 4]));
      m.rotation.x = -Math.PI / 2;
      m.position.set((xa + xb) / 2, 0, (za + zb) / 2);
      m.receiveShadow = true;
      counterGroup.add(m);
    };
    if (hole) {
      piece(x0, hole.x0, COUNTER.front, COUNTER.back);
      piece(hole.x1, x1, COUNTER.front, COUNTER.back);
      piece(hole.x0, hole.x1, COUNTER.front, hole.z0);
      piece(hole.x0, hole.x1, hole.z1, COUNTER.back);
    } else {
      piece(x0, x1, COUNTER.front, COUNTER.back);
    }
    const len = x1 - x0;
    const cx = (x0 + x1) / 2;
    const body = new THREE.Mesh(new THREE.BoxGeometry(len, 8.3, depth), bodyMat);
    body.position.set(cx, -0.75 - 4.15, cz);
    const lip = new THREE.Mesh(new RoundedBoxGeometry(len + 0.2, 0.75, 0.5, 2, 0.08), lipMat);
    lip.position.set(cx, -0.375, COUNTER.front - 0.02);
    const tex = cabinetTexBase.clone();
    tex.needsUpdate = true;
    tex.repeat.set(len / 4, 1);
    const cabinets = new THREE.Mesh(new THREE.BoxGeometry(len, 8.2, 0.3), new THREE.MeshLambertMaterial({ map: tex }));
    cabinets.position.set(cx, -0.75 - 4.1, COUNTER.front - 0.1);
    counterGroup.add(body, lip, cabinets);
    [x0, x1].forEach((x) => {
      const edge = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.75, depth + 0.2, 2, 0.08), lipMat);
      edge.position.set(x, -0.375, cz);
      counterGroup.add(edge);
    });
  }

  // ---- Things that are always on the counter ----
  const animators = [];

  // The hand chopping a carrot, on the counter's front edge, its arms reaching in over the edge.
  const board = makeChoppingBoard();
  const boardWrap = new THREE.Group(); // mirrored so the board's +x (viewer's right) is world -x
  boardWrap.scale.x = -1;
  boardWrap.add(board.group);
  boardWrap.rotation.y = 0.06;
  scene.add(boardWrap);
  animators.push(board.update);

  // Daisies on the window sill, just right of the stove (rebuilt per level, since a mirrored level swaps sides).
  const sillHolder = new THREE.Group();
  scene.add(sillHolder);
  let sill = null;
  animators.push((t) => sill && sill.bouquets.forEach((b, i) => (b.rotation.z = 0.02 * Math.sin(t * 0.9 + i)))); // a slight sway

  // ---- The two tables and the pie, rebuilt per level ----
  const tableGroup = new THREE.Group();
  scene.add(tableGroup);
  const pieGroup = new THREE.Group();
  const pie = makePie();
  pieGroup.add(pie.group);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.975, 1, 64),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  const glow = new THREE.PointLight(0xffc98a, 5, 7, 2);
  glow.position.y = 1.4;
  pieGroup.add(ring, glow);
  scene.add(pieGroup);
  animators.push(pie.update);

  // ---- Per-level pieces, rebuilt by configure ----
  const levelGroup = new THREE.Group();
  scene.add(levelGroup);
  const obstacles = [];
  const movers = []; // rolling fruit
  const levelAnimators = [];
  let time = 0;
  let F = 1; // 1, or -1 in a mirrored level: multiplies every json x
  let sc = SCENES.level_1_discovery; // the current level's arrangement
  let sinkHole = null;
  const ROLL_PERIOD_S = 9;

  // Solid things the fly cannot pass through, in world coordinates (see collisions.js). Every piece that stands on the
  // counter is one, whether or not the level counts it as an obstacle: a decorative stove is still a stove.
  //   box:    {cx, cz, hx, hz, rot}  half sizes along the piece's own x and z, turned by `rot` (three's rotation.y)
  //   circle: {cx, cz, r}            or {ref} for a piece that moves (rolling fruit): cx, cz follow ref.position
  // height: how tall it is; a fly whose belly is above that clears it.
  const colliders = [];
  const solidBox = (kind, cx, cz, hx, hz, rot, height) => colliders.push({ kind, type: 'box', cx, cz, hx, hz, rot, height });
  const solidCircle = (kind, cx, cz, r, height, ref = null) => colliders.push({ kind, type: 'circle', cx, cz, r, height, ref });

  const build = {
    stove({ x, z, yaw = 0, decor = false }) {
      const stove = makeStove();
      const w = toWorld([F * x, 0, z]);
      stove.group.position.set(w.x, 0, w.z);
      stove.group.rotation.y = -F * yaw;
      levelGroup.add(stove.group);
      levelAnimators.push(stove.update);
      solidBox('stove', w.x, w.z, STOVE.w / 2 + 0.1, STOVE.d / 2 + 0.1, -F * yaw, STOVE.height);
      if (!decor && !stoveFx) stoveFx = { setFlare: stove.setFlare, x: w.x, z: w.z };
      if (!decor) obstacles.push({ kind: 'stove', x: F * x, z, w: STOVE.w, d: STOVE.d, height: STOVE.height, blocking: true, moving: false });
    },

    wall({ x, z, along, n, rows, yaw = 0 }) {
      const rowH = 0.96;
      const yw = F * yaw;
      for (let row = 0; row < rows; row++) {
        const offset = rows > 1 ? (row % 2 ? 0.25 : -0.25) : 0;
        for (let i = 0; i < n; i++) {
          const a1 = (i - (n - 1) / 2) * 1 + offset;
          const [dx, dz] = along === 'x' ? [a1, 0] : [0, a1];
          const w = toWorld([F * x + dx * Math.cos(yw) + dz * Math.sin(yw), 0, z - dx * Math.sin(yw) + dz * Math.cos(yw)]);
          const c = new THREE.Mesh(cheeseGeo, cheeseMaterial());
          c.position.set(w.x, row * rowH + 0.48, w.z);
          c.rotation.y = -yw + (((row * 7 + i * 3) % 5) - 2) * 0.03;
          c.castShadow = c.receiveShadow = true;
          levelGroup.add(c);
        }
      }
      const span = (n + (rows > 1 ? 0.5 : 0)) / 2; // the rows are staggered a quarter crate each way
      const c = toWorld([F * x, 0, z]);
      solidBox('cheese', c.x, c.z, along === 'x' ? span : 0.5, along === 'z' ? span : 0.5, -yw, rows * rowH);
      obstacles.push({ kind: 'wall', x: F * x, z, w: along === 'x' ? n : 1, d: along === 'z' ? n : 1, height: rows * rowH, moving: false });
    },

    hurdle({ x, z, w, yaw = 0 }) {
      const g = makeRollingPinHurdle(w);
      const p = toWorld([F * x, 0, z]);
      g.position.set(p.x, 0, p.z);
      g.rotation.y = -F * yaw;
      levelGroup.add(g);
      solidBox('hurdle', p.x, p.z, w / 2 + 0.4, 0.4, -F * yaw, 0.92);
      obstacles.push({ kind: 'hurdle', x: F * x, z, w: w + 0.7, d: 0.7, height: 0.92, moving: false });
    },

    // Fruit rolling front to back along the counter, one lane each, out of step with its neighbours.
    fruit({ lanes, colorOffset = 0 }) {
      lanes.forEach(({ x, z }, i) => {
        const fruit = makeFruit((i + colorOffset) % 3, FRUIT_R);
        const ob = { kind: 'ball', x: F * x, z: z[0], w: FRUIT_R * 2, d: FRUIT_R * 2, height: FRUIT_R * 2, moving: true, axis: 'z', range: z };
        fruit.position.copy(toWorld([ob.x, FRUIT_R, ob.z]));
        levelGroup.add(fruit);
        obstacles.push(ob);
        solidCircle('fruit', fruit.position.x, fruit.position.z, FRUIT_R, FRUIT_R * 2, fruit);
        movers.push({ fruit, ob, phase: i * 2.1 + colorOffset, range: z });
      });
    },

    // Cartons of salt in a row along x: a low wall to get round (or scenery, when `decor`).
    saltbox({ x, z, n = 1, yaw = 0, decor = false, offset = 0 }) {
      for (let i = 0; i < n; i++) {
        const box = makeSaltBox(BOX_KINDS[(i + offset) % BOX_KINDS.length]); // salt, pepper, sugar, in turn
        const a1 = (i - (n - 1) / 2) * 1.05;
        const w = toWorld([F * x + a1 * Math.cos(F * yaw), 0, z - a1 * Math.sin(F * yaw)]);
        box.position.set(w.x, 0, w.z);
        box.rotation.y = -F * yaw + (i % 2 ? 0.12 : -0.08);
        levelGroup.add(box);
        solidBox('salt box', w.x, w.z, 0.5, 0.34, box.rotation.y, 1.5);
      }
      if (!decor) obstacles.push({ kind: 'saltbox', x: F * x, z, w: n * 1.05, d: 0.7, height: 1.5, moving: false });
    },

    // A bowl of cut vegetables (scenery unless it is meant to be in the way).
    bowl({ x, z, decor = false }) {
      const bowl = makeVegBowl(0.95);
      const w = toWorld([F * x, 0, z]);
      bowl.position.set(w.x, 0, w.z);
      levelGroup.add(bowl);
      solidCircle('bowl', w.x, w.z, 0.95, 0.7);
      if (!decor) obstacles.push({ kind: 'bowl', x: F * x, z, w: 1.9, d: 1.9, height: 0.7, moving: false });
    },

    // A square stainless sink set into the counter, with an arched tap and lemon slices.
    sink({ x, z, size = SINK_SIZE }) {
      const c = toWorld([F * x, 0, z]);
      sinkHole = { x0: c.x - size / 2, x1: c.x + size / 2, z0: z - size / 2, z1: z + size / 2 };
      world.sinkRect = sinkHole;
      const sink = makeSink({ size });
      sink.group.position.set(c.x, 0, c.z);
      levelGroup.add(sink.group);
      levelAnimators.push(sink.update);
      obstacles.push({ kind: 'sink', x: F * x, z, w: size, d: size, height: -0.7, moving: false });
    },
  };

  // The level-3 "shadow" is the stove's fumes. First the fire flares and dark smoke boils up off the stove and hazes
  // the middle of the counter (the warning); then a thick bank of smoke rolls down the counter through the hit band,
  // and a fly caught in it, not frozen, is startled. Driven by game.js through arena.shadow.
  const haze = new THREE.Mesh(
    new THREE.PlaneGeometry(SHADOW_HALF_WIDTH * 2, depth),
    new THREE.MeshBasicMaterial({ color: 0x4a3d3a, transparent: true, opacity: 0, depthWrite: false }),
  );
  haze.rotation.x = -Math.PI / 2;
  haze.position.set(0, 0.03, cz);
  scene.add(haze);
  const fumes = new THREE.Group();
  fumes.visible = false;
  scene.add(fumes);
  const puffGeo = new THREE.IcosahedronGeometry(1, 1);
  const pr = rng(91);
  const puffs = Array.from({ length: 46 }, (_, i) => {
    const m = new THREE.Mesh(puffGeo, new THREE.MeshBasicMaterial({ color: i % 3 ? 0x3b3438 : 0x555055, transparent: true, opacity: 0, depthWrite: false }));
    fumes.add(m);
    return { m, ox: (pr() - 0.5) * SHADOW_HALF_WIDTH * 2, oz: (pr() - 0.5) * 5.5, oy: 0.5 + pr() * 1.5, s: 0.9 + pr() * 1.0, ph: pr() * 6.28 };
  });
  let stoveFx = null; // the level's stove, if any: {update, setFlare, x, z}
  let smokePhase = 'off';
  let smokeK = 0; // 0..1 through the warning
  let smokeU = 0; // 0..1 through the sweep
  function layoutSmoke(t) {
    const sx = stoveFx ? stoveFx.x : 0;
    const sz = stoveFx ? stoveFx.z : COUNTER.back - 1;
    puffs.forEach(({ m, ox, oy, s, ph }, i) => {
      const f = i / puffs.length; // this puff's place along the plume, 0 at the stove, 1 at the head
      if (smokePhase === 'warn') {
        // boiling up off the stove and starting to lean toward the camera (away from the window)
        const q = (f + t * 0.35) % 1;
        m.position.set(sx + Math.sin(ph + t) * 0.35, 2.7 + q * 2.0, sz - q * (0.4 + smokeK * 1.6));
        m.scale.setScalar((0.5 + q * 1.5) * (0.4 + smokeK * 0.9));
        m.material.opacity = 0.55 * smokeK * Math.sin(Math.PI * Math.min(1, q * 1.1));
      } else if (smokePhase === 'sweep') {
        // A plume that pours off the stove and rolls toward the camera along the counter, low and spreading, its
        // head moving from the stove out to the front edge. Puffs trail back to the stove; the tail is thick.
        const reach = (smokeU * 1.05 + 0.03) * (sz - COUNTER.front + 2.5); // how far the head has come
        const along = f * reach; // this puff's distance from the stove
        const settle = THREE.MathUtils.smoothstep(along, 0.5, 4); // drops from the stove top to the counter
        m.position.set(
          sx + ox * (0.35 + settle * 0.65) + Math.sin(t * 1.3 + ph) * 0.3,
          THREE.MathUtils.lerp(3.2, oy, settle) + Math.sin(t * 2 + ph) * 0.12,
          sz - along,
        );
        m.scale.setScalar(s * (0.6 + settle * 0.6) * (1 + 0.1 * Math.sin(t * 3 + ph)));
        const head = 1 - THREE.MathUtils.smoothstep(f, 0.8, 1); // the head is wispy
        m.material.opacity = 0.7 * head * Math.min(1, smokeU * 6);
      }
    });
  }


  // The fly comes in from outside: `entry` is beyond the window, `window` is the opening in the back wall.
  // A splash where a fly falls into the sink: a ring that spreads and a spray of droplets that rise and fall.
  const splashFx = new THREE.Group();
  splashFx.visible = false;
  scene.add(splashFx);
  const splashRing = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.55, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
  splashFx.add(splashRing);
  const drops = Array.from({ length: 12 }, (_, i) => {
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xcfeefc, transparent: true }));
    d.userData.a = (i / 12) * Math.PI * 2;
    splashFx.add(d);
    return d;
  });
  let splashT = -1;
  function updateSplash(dt) {
    if (splashT < 0) return;
    splashT += dt;
    const k = splashT / 1.1;
    if (k >= 1) {
      splashT = -1;
      splashFx.visible = false;
      return;
    }
    splashRing.scale.setScalar(1 + k * 3);
    splashRing.material.opacity = 0.7 * (1 - k);
    drops.forEach((d) => {
      const rad = 0.3 + k * 1.3;
      d.position.set(Math.cos(d.userData.a) * rad, 0.1 + Math.sin(Math.PI * k) * 1.4, Math.sin(d.userData.a) * rad);
      d.material.opacity = 1 - k * k;
    });
  }

  const world = {
    bounds: { minX: -16.2, maxX: 11.2, minZ: BOUNDS_Z[0], maxZ: BOUNDS_Z[1] },
    pie: null,
    target: null,
    obstacles,
    colliders,
    sinkRect: null,
    start: toWorld(SCENES.level_1_discovery.start),
    entry: new THREE.Vector3(1.4, 6.6, wallZ + 10),
    window: new THREE.Vector3(0, 5.3, wallZ - 0.3),
  };
  world.start.y = TABLE_H + 0.03; // the fly stands on the landing table

  function buildLevel(levelId) {
    levelGroup.clear();
    obstacles.length = 0;
    movers.length = 0;
    levelAnimators.length = 0;
    colliders.length = 0;
    sinkHole = null;
    world.sinkRect = null;
    stoveFx = null;
    sc.items.forEach((item) => build[item.type](item));
  }

  function buildTables() {
    tableGroup.clear();
    // Landing table under the start, at the fly's end; its doily sits right under the fly.
    const land = makeLandingTable({ w: 2.8, d: 4.0 });
    const sp = toWorld([F * sc.start[0], 0, sc.start[2]]);
    land.position.set(sp.x, 0, sp.z);
    land.userData.doily.position.set(0, TABLE_H + 0.006, 0);
    tableGroup.add(land);
    // The pie's side table at the far end.
    let decorate = null;
    if (!sc.hasPie) {
      // no pie here: a bowl of cut vegetables and a couple of salt boxes in the middle of the table instead
      decorate = new THREE.Group();
      const bowl = makeVegBowl(1.2);
      bowl.position.set(-0.3, TABLE_H + 0.03, 0.2);
      decorate.add(bowl);
      [0, 1, 2].forEach((i) => {
        const box = makeSaltBox(BOX_KINDS[i]);
        box.position.set(1.7 + i * 1.05, TABLE_H + 0.03, -0.5);
        box.rotation.y = 0.2 - i * 0.25;
        decorate.add(box);
      });
    }
    const pt = makePieTable({ w: 7.6, d: 5.6, decorate });
    const pp = toWorld([F * sc.pie[0], 0, sc.pie[2]]);
    pt.position.set(pp.x, 0, pp.z);
    tableGroup.add(pt);
    pieGroup.position.set(pp.x, TABLE_H, pp.z);
    pieGroup.rotation.y = pp.x > 0 ? 0.5 : -0.5;
    pieGroup.visible = !!sc.hasPie;
  }

  function buildSill() {
    sillHolder.clear();
    const cxw = toWorld([F * sc.sill.cx, 0, 0]).x;
    const at = (json) => toWorld([F * json, 0, 0]).x - cxw; // local x on the sill board
    sill = makeSillFlowers({ w: 7.4, d: 1.7, jarX: at(sc.sill.flowers), jugX: at(sc.sill.flowers + 1.4), plateX: at(sc.sill.flowers + 2.8), potX: at(sc.sill.flowers + 4.1) });
    sill.group.position.set(cxw, 0, COUNTER.back - 0.95);
    sillHolder.add(sill.group);
    // the daisy jar and jug, the plate of apples and the basil pot stand on the sill
    const sz = COUNTER.back - 0.95;
    solidCircle('vase', cxw + at(sc.sill.flowers), sz, 0.65, 2.6);
    solidCircle('jug', cxw + at(sc.sill.flowers + 1.4), sz - 0.1, 0.5, 2.6);
    solidCircle('plate of apples', cxw + at(sc.sill.flowers + 2.8), sz + 0.1, 0.62, 0.6);
    solidCircle('basil pot', cxw + at(sc.sill.flowers + 4.1), sz, 0.42, 1.1);
  }

  return {
    world,

    // cfg is a level's `arena` block from levels.json (or null for the open discovery counter).
    configure(cfg, levelId) {
      sc = SCENES[levelId] ?? SCENES.level_1_discovery;
      F = sc.mirrored ? -1 : 1;
      buildLevel(levelId);
      const a = toWorld([F * COUNTER_X[0], 0, 0]).x;
      const b = toWorld([F * COUNTER_X[1], 0, 0]).x;
      buildCounter(Math.min(a, b), Math.max(a, b), sinkHole);
      buildTables();
      buildSill();
      const bw = [toWorld([F * BOUNDS_X[0], 0, 0]).x, toWorld([F * BOUNDS_X[1], 0, 0]).x];
      world.bounds = { minX: Math.min(...bw), maxX: Math.max(...bw), minZ: BOUNDS_Z[0], maxZ: BOUNDS_Z[1] };
      boardWrap.visible = !!sc.board;
      if (sc.board) {
        const bp = toWorld([F * sc.board[0], 0, sc.board[2]]);
        boardWrap.position.set(bp.x, 0, bp.z);
        // the board, the hands and the knife: a box over the board's footprint (the board is mirrored into world x)
        const th = boardWrap.rotation.y;
        const lx = -0.7;
        const lz = -0.3;
        solidBox('chopping board', bp.x + lx * Math.cos(th) + lz * Math.sin(th), bp.z - lx * Math.sin(th) + lz * Math.cos(th), 3.3, 1.9, th, 1.7);
      }

      world.start = toWorld([F * sc.start[0], 0, sc.start[2]]);
      world.start.y = TABLE_H + 0.03;
      world.pie = null;
      world.target = null;
      ring.visible = false;
      glow.visible = false;
      this.shadow.hide();
      hemi.intensity = 1.05;
      sun.color.set(0xffe2b4);

      if (cfg?.pie_position) {
        // "Fly near the pie": the win radius is measured from the pie's centre, out past its rim.
        world.pie = { pos: toWorld([F * sc.pie[0], 0, sc.pie[2]]), radius: PIE_R + cfg.pie_radius };
        ring.scale.setScalar(world.pie.radius + 0.55);
        ring.visible = true;
        glow.visible = true;
      }
      if (cfg?.shadow) {
        hemi.intensity = 0.8;
        sun.color.set(0xd9c8ff);
      }
      if (cfg?.target === 'female_fly_present_offscreen_cue') {
        // The daisies on the window sill are level 5's target (levels.json still calls it the female-fly cue).
        world.target = toWorld([F * sc.sill.flowers, 0, COUNTER.back - 0.95]);
      }
    },

    // Is a world position inside the shadow's hit band?
    inHitArea: (pos) => Math.abs(pos.x) <= SHADOW_HALF_WIDTH,

    // Advances every animation: the chopping hand, the boiling pot and its steam, flames, the sink's water,
    // the pie's tea steam, the daisies' sway and the rolling fruit.
    // A splash at world (x, z), at the sink's water level.
    splash(x, z) {
      splashFx.position.set(x, -0.27, z);
      splashFx.visible = true;
      splashT = 0;
    },

    update(dtMs) {
      time += dtMs / 1000;
      updateSplash(dtMs / 1000);
      animators.forEach((fn) => fn(time));
      if (smokePhase !== 'off') layoutSmoke(time);
      levelAnimators.forEach((fn) => fn(time));
      movers.forEach(({ fruit, ob, phase, range }) => {
        const mid = (range[0] + range[1]) / 2;
        const half = (range[1] - range[0]) / 2;
        ob.z = mid - half * Math.cos((time / ROLL_PERIOD_S) * Math.PI * 2 + phase);
        const before = fruit.position.z;
        fruit.position.z = ob.z;
        fruit.rotation.x += (fruit.position.z - before) / FRUIT_R; // rolls without slipping
      });
    },

    shadow: {
      // Warning: the fire flares, dark smoke boils up off the stove and a haze settles over the hit band.
      telegraph(k) {
        smokePhase = 'warn';
        smokeK = k;
        fumes.visible = true;
        stoveFx?.setFlare(k);
        haze.material.opacity = 0.05 + 0.2 * k * (0.7 + 0.3 * Math.sin(k * 24));
        layoutSmoke(time);
      },
      // The sweep: u 0..1 through the active window, the smoke rolling down the counter.
      sweep(u) {
        smokePhase = 'sweep';
        smokeU = u;
        fumes.visible = true;
        stoveFx?.setFlare(0.6);
        haze.material.opacity = 0.32;
        layoutSmoke(time);
      },
      hide() {
        smokePhase = 'off';
        fumes.visible = false;
        haze.material.opacity = 0;
        stoveFx?.setFlare(0);
      },
    },
  };
}
