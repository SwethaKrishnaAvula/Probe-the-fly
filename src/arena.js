import * as THREE from 'three';
import { createFly } from './fly.js';

// The world the fly lives in: a chunky "toy sandbox" (dark navy sky, checkerboard floor, wooden crates
// with dark outlines, candy-coloured balls, ramps, red seats) with the level's own props on top.
// It is scenery only. Nothing here moves; the fly's behaviors live in behaviors.js.
//
// levels.json positions are [x, y, z] with +x on the fly's RIGHT and +z straight ahead of the start
// (level 2's sugar sits right of the start and only turn_right is available; level 4's sits left).
// The fly's own frame has its left on +X, so world x is the json x negated.
export const toWorld = ([x, y, z]) => new THREE.Vector3(-x, y, z);

// Arena footprint in json coordinates. The start is at the origin, facing +z.
const BOUNDS = { minX: -6, maxX: 6, minZ: -2.5, maxZ: 7 };
const SHADOW_HALF_WIDTH = 1.5; // "arena_midpoint_band": a strip down the arena's middle (x = 0)
const FEMALE_POS = [2, 0, 8.6]; // just past the far edge: the "offscreen cue"

const SKY = 0x161b2e;
const MOODS = {
  calm: SKY,
  shadow: 0x1a1730, // level 3: "something's watching the sky"
  courtship: 0x241a35, // level 5
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

const plankTexture = () =>
  pixelTexture(32, (ctx, s) => {
    ctx.fillStyle = '#7a5d3e';
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = '#654b31';
    for (let y = 10; y < s; y += 10) ctx.fillRect(0, y, s, 1);
    speckle(ctx, s, ['#876a48', '#5d4429'], 60, 9);
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

const sugarTexture = () =>
  pixelTexture(16, (ctx, s) => {
    ctx.fillStyle = '#f7f2e6';
    ctx.fillRect(0, 0, s, s);
    speckle(ctx, s, ['#e3dccb', '#ffffff', '#d6ceb9'], 40, 21, 1);
    ctx.fillStyle = '#d9d1bd';
    ctx.fillRect(0, s - 2, s, 2);
  });

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

export function createArena(scene) {
  const { minX, maxX, minZ, maxZ } = BOUNDS;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 22, 46);

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

  // ---- Floor: one big checkerboard, tiles one unit wide, fading into the navy sky ----
  const FLOOR = 70;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(FLOOR, FLOOR),
    new THREE.MeshLambertMaterial({ map: floorTexture([FLOOR / 2, FLOOR / 2]) }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.002, cz);
  floor.receiveShadow = true;
  scene.add(floor);

  // ---- Wooden curb around the play area: the fly clamps at these edges ----
  const plank = new THREE.MeshLambertMaterial({ map: plankTexture() });
  const curbH = 0.22;
  const curbT = 0.3;
  [
    [maxX - minX + curbT * 2, curbT, cx, minZ - curbT / 2],
    [maxX - minX + curbT * 2, curbT, cx, maxZ + curbT / 2],
    [curbT, maxZ - minZ, minX - curbT / 2, cz],
    [curbT, maxZ - minZ, maxX + curbT / 2, cz],
  ].forEach(([w, d, x, z]) => {
    const b = outlined(new THREE.Mesh(new THREE.BoxGeometry(w, curbH, d), plank), 0x2a1d10);
    b.position.set(x, curbH / 2, z);
    scene.add(shadowed(b));
  });

  // ---- Scenery outside the play area (fixed, seeded, never in the fly's way) ----
  const crateMat = new THREE.MeshLambertMaterial({ map: crateTexture() });
  const crateGeo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
  const r = rng(42);
  const crate = (x, y, z, rot = 0) => {
    const c = outlined(new THREE.Mesh(crateGeo, crateMat));
    c.position.set(x, y + 0.48, z);
    c.rotation.y = rot;
    scene.add(shadowed(c));
  };

  // A wobbly tower: rows of two, narrowing to one at the top.
  for (let row = 0; row < 5; row++) {
    const cols = row < 4 ? 2 : 1;
    for (let c = 0; c < cols; c++) {
      crate(8.6 + (r() - 0.5) * 0.14, row * 0.96, 3.1 + c * 1.02 + row * 0.08 + (r() - 0.5) * 0.1, (r() - 0.5) * 0.2);
    }
  }
  crate(8.4, 0, 5.6, 0.4);
  crate(-8.2, 0, -0.4, 0.5);
  crate(7.2, 0, 6.6, 0.25);

  // Candy-coloured balls in a row.
  const ballColors = [0xe0453a, 0xe88a3c, 0xe6d13c, 0x66c24a, 0x35c2c2];
  ballColors.forEach((color, i) => {
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 20, 14),
      new THREE.MeshStandardMaterial({ color, roughness: 0.35, metalness: 0.05 }),
    );
    ball.position.set(-8.4, 0.34, 1.8 + i * 1.05);
    scene.add(shadowed(ball));
  });

  // Two ramps, a pale steel slab and a brown wooden one.
  [
    { color: 0x94a9b8, x: -7.2, z: -5.6, tilt: -0.16 },
    { color: 0x7a6040, x: -8.4, z: -7.6, tilt: -0.1 },
  ].forEach(({ color, x, z, tilt }) => {
    const ramp = outlined(
      new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.4, 1.9), new THREE.MeshLambertMaterial({ color })),
      0x0f141c,
    );
    ramp.position.set(x, 0.4, z);
    ramp.rotation.z = tilt;
    scene.add(shadowed(ramp));
  });

  // A row of red seats in the foreground, facing the arena.
  const seatMat = new THREE.MeshLambertMaterial({ color: 0xb23a2e });
  for (let i = 0; i < 5; i++) {
    const seat = new THREE.Group();
    const base = outlined(new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.9), seatMat), 0x3d0f0b);
    base.position.y = 0.25;
    const back = outlined(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.8, 0.9), seatMat), 0x3d0f0b);
    back.position.set(-0.32, 0.85, 0);
    seat.add(base, back);
    seat.position.set(2.6 + i * 1.15, 0, -6.2);
    seat.rotation.y = -Math.PI / 2 + 0.08 * (i - 2); // facing the arena
    scene.add(shadowed(seat));
  }

  // ---- Level props (rebuilt by configure) ----
  // Sugar: a stack of sugar cubes on a small plate, with a soft ring at the win radius.
  const sugar = new THREE.Group();
  const cubeMat = new THREE.MeshLambertMaterial({ map: sugarTexture() });
  [
    [0, 0.13, 0, 0.26, 0.2],
    [0.27, 0.11, 0.1, 0.22, -0.3],
    [-0.24, 0.1, 0.14, 0.2, 0.5],
    [0.02, 0.36, 0.02, 0.22, 0.1],
    [0.0, 0.1, -0.28, 0.2, -0.1],
  ].forEach(([x, y, z, s, rot]) => {
    const cube = outlined(new THREE.Mesh(new THREE.BoxGeometry(s, s, s), cubeMat), 0x8d8470);
    cube.position.set(x, y, z);
    cube.rotation.y = rot;
    sugar.add(shadowed(cube));
  });
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.6, 0.04, 24),
    new THREE.MeshLambertMaterial({ color: 0xe3b95a }),
  );
  plate.position.y = 0.02;
  sugar.add(shadowed(plate, { cast: false }));
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.93, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.6, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.015;
  const glow = new THREE.PointLight(0xffd27a, 6, 4.5, 2);
  glow.position.y = 1;
  sugar.add(ring, glow);
  sugar.visible = false;
  scene.add(sugar);

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

  // Female fly (level 5): stands just past the far edge, with a few scent puffs drifting toward the start.
  const female = createFly({ bodyColor: 0xc98bb5, scale: 1.15 });
  female.object.position.copy(toWorld(FEMALE_POS));
  female.object.rotation.y = Math.PI; // facing back toward the start
  shadowed(female.object);
  const scent = new THREE.Group();
  [0.32, 0.24, 0.17].forEach((size, i) => {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(size, 12, 10),
      new THREE.MeshBasicMaterial({ color: 0xff9fd0, transparent: true, opacity: 0.32 - i * 0.07 }),
    );
    puff.position.set(-2 + i * 0.35, 0.7 + i * 0.12, 7.8 - i * 1.2);
    scent.add(puff);
  });
  female.object.visible = false;
  scent.visible = false;
  scene.add(female.object, scent);

  // Shared with the behavior runner: it reads these fields every frame.
  const world = { bounds: BOUNDS, sugar: null, target: null };

  const setMood = (hex) => {
    scene.background.set(hex);
    scene.fog.color.set(hex);
  };

  return {
    world,

    // cfg is a level's `arena` block from levels.json (or null for the open discovery arena).
    configure(cfg) {
      world.sugar = null;
      world.target = null;
      sugar.visible = false;
      bird.visible = false;
      female.object.visible = false;
      scent.visible = false;
      this.shadow.hide();
      setMood(MOODS.calm);

      if (cfg?.sugar_position) {
        world.sugar = { pos: toWorld(cfg.sugar_position), radius: cfg.sugar_radius };
        sugar.position.copy(world.sugar.pos);
        ring.scale.setScalar(cfg.sugar_radius);
        sugar.visible = true;
      }
      if (cfg?.shadow) {
        bird.visible = true;
        setMood(MOODS.shadow);
      }
      if (cfg?.target === 'female_fly_present_offscreen_cue') {
        world.target = female.object.position.clone();
        female.object.visible = true;
        scent.visible = true;
        setMood(MOODS.courtship);
      }
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
