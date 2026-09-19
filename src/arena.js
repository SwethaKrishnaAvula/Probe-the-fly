import * as THREE from 'three';
import { createFly } from './fly.js';

// levels.json positions are [x, y, z] with +x on the fly's RIGHT and +z straight ahead of the start
// (level 2's sugar sits right of the start and only turn_right is available; level 4's sits left).
// The fly's own frame has its left on +X, so world x is the json x negated.
export const toWorld = ([x, y, z]) => new THREE.Vector3(-x, y, z);

// Arena footprint in json coordinates. The start is at the origin, facing +z.
const BOUNDS = { minX: -6, maxX: 6, minZ: -2.5, maxZ: 7 };
const SHADOW_HALF_WIDTH = 1.5; // "arena_midpoint_band": a strip down the arena's middle (x = 0)
const FEMALE_POS = [2, 0, 8.6]; // just past the far edge: the "offscreen cue"

export function createArena(scene) {
  const { minX, maxX, minZ, maxZ } = BOUNDS;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;

  // Floor, faint grid, and a rim.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(maxX - minX, maxZ - minZ),
    new THREE.MeshStandardMaterial({ color: 0x151a26, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cx, -0.002, cz);
  scene.add(floor);

  const gridPts = [];
  for (let x = minX; x <= maxX; x++) gridPts.push(x, 0, minZ, x, 0, maxZ);
  for (let z = minZ; z <= maxZ; z++) gridPts.push(minX, 0, z, maxX, 0, z);
  const grid = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(gridPts, 3)),
    new THREE.LineBasicMaterial({ color: 0x252c40 }),
  );
  scene.add(grid);

  const rim = new THREE.LineLoop(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(minX, 0.01, minZ),
      new THREE.Vector3(maxX, 0.01, minZ),
      new THREE.Vector3(maxX, 0.01, maxZ),
      new THREE.Vector3(minX, 0.01, maxZ),
    ]),
    new THREE.LineBasicMaterial({ color: 0x4a5573 }),
  );
  scene.add(rim);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(3, 6, 2);
  scene.add(sun);

  // Sugar: a small pile of crystals and a faint ring at the win radius.
  const sugar = new THREE.Group();
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0xfff6e0, roughness: 0.35, emissive: 0x554a30 });
  [
    [0, 0.09, 0, 0.18],
    [0.16, 0.06, 0.08, 0.12],
    [-0.14, 0.07, 0.1, 0.14],
    [0.03, 0.05, -0.17, 0.1],
    [0.02, 0.24, 0.02, 0.1],
  ].forEach(([x, y, z, s], i) => {
    const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crystalMat);
    c.position.set(x, y, z);
    c.rotation.set(i, i * 1.7, i * 0.6);
    sugar.add(c);
  });
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.97, 1, 48),
    new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.5, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.012;
  sugar.add(ring);
  sugar.visible = false;
  scene.add(sugar);

  // The shadow: a telegraph outline of the hit band, then a dark shape sweeping down it.
  const bandLen = maxZ - minZ + 6;
  const telegraph = new THREE.Mesh(
    new THREE.PlaneGeometry(SHADOW_HALF_WIDTH * 2, bandLen),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthWrite: false }),
  );
  telegraph.rotation.x = -Math.PI / 2;
  telegraph.position.set(0, 0.015, cz);
  scene.add(telegraph);

  const shadowBody = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.75, depthWrite: false }),
  );
  shadowBody.rotation.x = -Math.PI / 2;
  shadowBody.scale.set(SHADOW_HALF_WIDTH + 0.4, 2.2, 1);
  shadowBody.position.y = 0.02;
  shadowBody.visible = false;
  scene.add(shadowBody);

  // Female fly, only for the threshold level: sits just past the far edge of the floor.
  const female = createFly({ bodyColor: 0xb98aa8, scale: 1.15 });
  female.object.position.copy(toWorld(FEMALE_POS));
  female.object.rotation.y = Math.PI; // facing back toward the start
  female.object.visible = false;
  scene.add(female.object);

  // Shared with the behavior runner: it reads these fields every frame.
  const world = { bounds: BOUNDS, sugar: null, target: null };

  return {
    world,

    // cfg is a level's `arena` block from levels.json (or null for the open discovery arena).
    configure(cfg) {
      world.sugar = null;
      world.target = null;
      sugar.visible = false;
      female.object.visible = false;
      this.shadow.hide();

      if (cfg?.sugar_position) {
        world.sugar = { pos: toWorld(cfg.sugar_position), radius: cfg.sugar_radius };
        sugar.position.copy(world.sugar.pos);
        ring.scale.setScalar(cfg.sugar_radius);
        sugar.visible = true;
      }
      if (cfg?.target === 'female_fly_present_offscreen_cue') {
        world.target = female.object.position.clone();
        female.object.visible = true;
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
