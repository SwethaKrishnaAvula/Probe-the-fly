import * as THREE from 'three';

// Primitive fly: ellipsoid body, cylinder legs, flat wings. Procedural sine animation only.
// Local frame: forward is +Z, up is +Y, the fly's left is +X.

const WALK_SPEED = 1.2; // units per second (debug keys only; scripted behaviors set their own pace)
const TURN_RATE = 1.6; // radians per second
const STEP_HZ = 3.5; // leg cycles per second
const LEG_SWING = 0.55; // radians
const LEG_LIFT = 0.35; // radians
const BODY_Y = 0.32;

export function createFly({ bodyColor = 0x8a6a3c, scale = 1 } = {}) {
  const root = new THREE.Group();
  root.scale.setScalar(scale);
  const body = new THREE.Group();
  root.add(body);
  body.position.y = BODY_Y;

  const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 });
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

  // The head and proboscis hang from a pivot at the front of the thorax, so the whole head can dip (pose.headDip).
  const HEAD_PIVOT_Z = 0.22;
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0, HEAD_PIVOT_Z);
  body.add(headPivot);

  const head = new THREE.Mesh(sphere, darkMat);
  head.scale.set(0.16, 0.15, 0.15);
  head.position.set(0, 0, 0.36 - HEAD_PIVOT_Z);
  headPivot.add(head);

  // Proboscis: a tube that grows out of the front of the head (scale.z 0 = retracted). Long, thick and pale so
  // the feeding response is readable even when the whole fly is only a few dozen pixels on screen.
  const proboscisMat = new THREE.MeshStandardMaterial({ color: 0xf0c9a8, roughness: 0.6 });
  const proboscisGeo = new THREE.CylinderGeometry(0.05, 0.034, 0.8, 8);
  proboscisGeo.rotateX(Math.PI / 2);
  proboscisGeo.translate(0, 0, 0.4);
  const proboscis = new THREE.Mesh(proboscisGeo, proboscisMat);
  proboscis.position.set(0, -0.06, 0.46 - HEAD_PIVOT_Z);
  proboscis.visible = false;
  headPivot.add(proboscis);

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
      legs.push({ pivot, phaseOffset, baseZ: side * 0.9, i, side });
    });
  });

  // Wings: flat planes folded back over the abdomen. The outer pivot swings the wing sideways
  // (spread); the inner one rolls it about its long axis (flap).
  const wingGeo = new THREE.PlaneGeometry(0.16, 0.6);
  wingGeo.translate(0, 0.3, 0); // pivot at the root edge
  const wings = [1, -1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.08, 0.16, -0.05);
    const inner = new THREE.Group();
    const wing = new THREE.Mesh(wingGeo, wingMat);
    wing.rotation.x = -Math.PI / 2; // lie flat, pointing backward (-Z)
    inner.add(wing);
    inner.rotation.z = side * 0.2;
    pivot.add(inner);
    body.add(pivot);
    return { pivot, inner, side };
  });

  let action = { type: 'stop', dir: 1 };
  let phase = 0;
  let blend = 0; // 0 = standing, 1 = full stride; eases so stop/start is not abrupt
  let time = 0;

  // Scripted behaviors write these each frame; update() turns them into joint angles.
  const pose = {
    lift: 0, // body height above the ground
    pitch: 0, // nose-up angle
    spread: 0, // both wings swung out, 0..1
    flap: 0, // both wings buzzing, 0..1
    flapLeft: 0, // the fly's left wing buzzing on its own, 0..1 (a turn beats the outside wing harder)
    flapRight: 0, // the fly's right wing buzzing on its own, 0..1
    roll: 0, // banking about the long axis, radians (positive lifts the fly's left side)
    song: 0, // one wing extended and vibrating, 0..1
    groom: 0, // front legs sweeping over the head, 0..1
    proboscis: 0, // 0..1
    headTilt: 0, // radians
    headDip: 0, // head and proboscis pitched down, radians
  };
  const resetPose = () => Object.keys(pose).forEach((k) => (pose[k] = 0));

  return {
    object: root,
    pose,
    resetPose,

    // type: 'walk' | 'turn' | 'stop' | 'gait'. walk dir: 1 forward, -1 backward. turn dir: 1 left, -1 right.
    // 'gait' animates the legs but does not move the root (scripted behaviors move it themselves).
    setAction(type, dir = 1) {
      action = { type, dir };
    },

    getAction() {
      return { ...action };
    },

    update(dt) {
      time += dt;
      const moving = action.type === 'walk' || action.type === 'turn' || action.type === 'gait';
      blend += ((moving ? 1 : 0) - blend) * Math.min(1, dt * 10);

      if (action.type === 'walk') {
        root.translateZ(action.dir * WALK_SPEED * dt);
      } else if (action.type === 'turn') {
        // Turn + walk: arc forward while rotating.
        root.rotation.y += action.dir * TURN_RATE * dt;
        root.translateZ(WALK_SPEED * 0.45 * dt);
      }

      // Backward walking reverses the leg cycle.
      const cycleDir = action.type === 'walk' || action.type === 'gait' ? action.dir : 1;
      if (moving) phase += cycleDir * dt * STEP_HZ * Math.PI * 2;

      legs.forEach((l) => {
        const p = phase + l.phaseOffset;
        let rx = Math.sin(p) * LEG_SWING * blend;
        let rz = l.baseZ + Math.sign(l.baseZ) * Math.max(0, Math.cos(p)) * LEG_LIFT * blend;
        if (l.i === 0 && pose.groom > 0) {
          // Front legs swing forward to the head and rub back and forth.
          const rub = Math.sin(time * 22 + (l.side === 1 ? 0 : Math.PI)) * 0.3;
          rx = rx * (1 - pose.groom) + (-1.5 + rub) * pose.groom;
          rz = rz * (1 - pose.groom) + l.side * 0.35 * pose.groom;
        }
        l.pivot.rotation.x = rx;
        l.pivot.rotation.z = rz;
      });

      wings.forEach((w) => {
        const isSongWing = w.side === -1;
        // side 1 is the fly's left wing (+X), side -1 its right; each also buzzes with the shared flap.
        const buzz = Math.sin(time * 70) * Math.max(pose.flap, w.side === 1 ? pose.flapLeft : pose.flapRight);
        const songBuzz = isSongWing ? Math.sin(time * 55) * pose.song : 0;
        const spread = Math.max(pose.spread, isSongWing ? pose.song : 0);
        w.pivot.rotation.y = -w.side * spread * 1.35;
        w.inner.rotation.z = w.side * (0.2 + buzz * 0.5 + songBuzz * 0.18);
      });

      proboscis.visible = pose.proboscis > 0.01;
      proboscis.scale.z = Math.max(0.001, pose.proboscis);
      head.rotation.z = pose.headTilt;
      headPivot.rotation.x = pose.headDip;

      // Tiny body bob while walking.
      body.position.y = BODY_Y + Math.abs(Math.sin(phase * 2)) * 0.012 * blend + pose.lift;
      body.rotation.x = -pose.pitch;
      body.rotation.z = pose.roll;
    },
  };
}
