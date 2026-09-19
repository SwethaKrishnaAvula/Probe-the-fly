import * as THREE from 'three';

// Primitive fly: ellipsoid body, cylinder legs, flat wings. Procedural sine animation only.
// Local frame: forward is +Z, up is +Y, the fly's left is +X.

const WALK_SPEED = 1.2; // units per second
const TURN_RATE = 1.6; // radians per second
const STEP_HZ = 3.5; // leg cycles per second
const LEG_SWING = 0.55; // radians
const LEG_LIFT = 0.35; // radians

export function createFly() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.position.y = 0.32;

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x8a6a3c, roughness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x2b2118, roughness: 0.8 });
  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xcfe6ff,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
  });

  const sphere = new THREE.SphereGeometry(1, 20, 14);

  const thorax = new THREE.Mesh(sphere, bodyMat);
  thorax.scale.set(0.22, 0.2, 0.3);
  body.add(thorax);

  const abdomen = new THREE.Mesh(sphere, bodyMat);
  abdomen.scale.set(0.2, 0.18, 0.34);
  abdomen.position.set(0, -0.01, -0.5);
  body.add(abdomen);

  const head = new THREE.Mesh(sphere, darkMat);
  head.scale.set(0.16, 0.15, 0.15);
  head.position.set(0, 0, 0.36);
  body.add(head);

  // Legs: 3 per side. Each pivot sits on the thorax so rotating it swings the leg.
  const legGeo = new THREE.CylinderGeometry(0.018, 0.014, 0.42, 6);
  legGeo.translate(0, -0.21, 0); // hang down from the pivot
  const legs = [];
  const legZ = [0.16, 0, -0.16]; // front, middle, hind
  [1, -1].forEach((side) => {
    legZ.forEach((z, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(side * 0.15, -0.05, z);
      pivot.rotation.z = side * 0.9; // splay outward
      const leg = new THREE.Mesh(legGeo, darkMat);
      pivot.add(leg);
      body.add(pivot);
      // Tripod gait: front-left, middle-right, hind-left move together.
      const phaseOffset = (i + (side === 1 ? 0 : 1)) % 2 === 0 ? 0 : Math.PI;
      legs.push({ pivot, phaseOffset, baseZ: side * 0.9, i });
    });
  });

  // Wings: flat planes folded back over the abdomen.
  const wingGeo = new THREE.PlaneGeometry(0.16, 0.6);
  wingGeo.translate(0, 0.3, 0); // pivot at the root edge
  const wings = [1, -1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.08, 0.16, -0.05);
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.rotation.x = -Math.PI / 2; // lie flat, pointing backward (-Z)
    pivot.add(wing);
    pivot.rotation.z = side * 0.2;
    body.add(pivot);
    return { pivot, side };
  });

  let action = { type: 'stop', dir: 1 };
  let phase = 0;
  let blend = 0; // 0 = standing, 1 = full stride; eases so stop/start is not abrupt

  return {
    object: root,

    // type: 'walk' | 'turn' | 'stop'. walk dir: 1 forward, -1 backward. turn dir: 1 left, -1 right.
    setAction(type, dir = 1) {
      action = { type, dir };
    },

    getAction() {
      return { ...action };
    },

    update(dt) {
      const moving = action.type === 'walk' || action.type === 'turn';
      blend += ((moving ? 1 : 0) - blend) * Math.min(1, dt * 10);

      if (action.type === 'walk') {
        root.translateZ(action.dir * WALK_SPEED * dt);
      } else if (action.type === 'turn') {
        // Turn + walk: arc forward while rotating.
        root.rotation.y += action.dir * TURN_RATE * dt;
        root.translateZ(WALK_SPEED * 0.45 * dt);
      }

      // Backward walking reverses the leg cycle.
      const cycleDir = action.type === 'walk' ? action.dir : 1;
      if (moving) phase += cycleDir * dt * STEP_HZ * Math.PI * 2;

      legs.forEach((l) => {
        const p = phase + l.phaseOffset;
        l.pivot.rotation.x = Math.sin(p) * LEG_SWING * blend;
        // Lift the leg during the forward half of the swing.
        l.pivot.rotation.z = l.baseZ + Math.sign(l.baseZ) * Math.max(0, Math.cos(p)) * LEG_LIFT * blend;
      });

      // Tiny body bob while walking.
      body.position.y = 0.32 + Math.abs(Math.sin(phase * 2)) * 0.012 * blend;
    },
  };
}
