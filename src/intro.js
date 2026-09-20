import * as THREE from 'three';
import { createFly } from './fly.js';
import { rng } from './random.js';
import { canvasTex } from './kitchenProps.js';

// The opening "video": a low-poly cottage on a little green island. A small fly zooms in, heads for the lit
// kitchen window, and slips inside; the screen washes warm and the game starts on the kitchen counter.
// It is a scripted camera and fly path in its own scene, drawn over the whole game screen, and can be skipped.

const DURATION = 7.6; // seconds
const smooth = THREE.MathUtils.smoothstep;
const ease = (x) => x * x * (3 - 2 * x);

const CAPTIONS = [
  [0, 'Down a quiet lane, a little cottage...'],
  [2.6, 'a tiny fly smells something baking...'],
  [5.3, '...and slips in through the kitchen window.'],
];

function flat(color, opts = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...opts });
}

function makeTree(r, x, z, s) {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 1.4 * s, 6), flat(0x8a5a36));
  trunk.position.y = 0.7 * s;
  g.add(trunk);
  const greens = [0x5ea04a, 0x6cb055, 0x4f9142];
  for (let i = 0; i < 3; i++) {
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry((1.05 - i * 0.18) * s, 0), flat(greens[i]));
    crown.position.set((r() - 0.5) * 0.3 * s, (1.7 + i * 0.7) * s, (r() - 0.5) * 0.3 * s);
    g.add(crown);
  }
  g.position.set(x, 0, z);
  return g;
}

function makeBush(x, z, s, color = 0x5ea04a) {
  const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.7 * s, 0), flat(color));
  b.position.set(x, 0.45 * s, z);
  b.scale.y = 0.85;
  return b;
}

function makeCloud(r) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4 + r() * 1.1, 0), mat);
    p.position.set(i * 1.7 - 3.2, r() * 0.7, (r() - 0.5) * 1.2);
    p.scale.y = 0.65;
    g.add(p);
  }
  return g;
}

function buildCottage() {
  const g = new THREE.Group();
  const cream = flat(0xf2e4c2);
  const wood = flat(0x8a5a36);

  const W = 5.2;
  const D = 4.2;
  const H = 3;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), cream);
  walls.position.y = H / 2;
  g.add(walls);
  // stone foundation
  const base = new THREE.Mesh(new THREE.BoxGeometry(W + 0.2, 0.35, D + 0.2), flat(0xb9b2a4));
  base.position.y = 0.17;
  g.add(base);

  // roof: two shingled slopes, gable triangles at both ends
  const shingles = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#8b3a2c';
    ctx.fillRect(0, 0, w, h);
    const rr = rng(3);
    for (let row = 0; row < 8; row++) {
      for (let col = -1; col < 8; col++) {
        const x = col * 16 + (row % 2 ? 8 : 0);
        ctx.fillStyle = `rgb(${125 + rr() * 30},${52 + rr() * 16},${40 + rr() * 12})`;
        ctx.fillRect(x + 1, row * 16 + 1, 14, 14);
      }
      ctx.fillStyle = 'rgba(40,10,5,0.35)';
      ctx.fillRect(0, row * 16 + 14, w, 2);
    }
  }, { repeat: [3, 1.6], nearest: true });
  const roofMat = new THREE.MeshLambertMaterial({ map: shingles, flatShading: true });
  const slope = 0.65;
  const len = 3.0;
  [1, -1].forEach((s) => {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(W + 0.7, 0.18, len), roofMat);
    slab.position.set(0, H + 0.82, s * 1.02);
    slab.rotation.x = s * slope;
    g.add(slab);
  });
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(W + 0.75, 0.16, 0.3), flat(0x6f2b21));
  ridge.position.set(0, H + 1.62, 0);
  g.add(ridge);
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-D / 2, 0);
  gableShape.lineTo(D / 2, 0);
  gableShape.lineTo(0, 1.6);
  gableShape.closePath();
  [-1, 1].forEach((s) => {
    const gable = new THREE.Mesh(new THREE.ExtrudeGeometry(gableShape, { depth: 0.15, bevelEnabled: false }), cream);
    gable.rotation.y = s * (Math.PI / 2);
    gable.position.set(s * (W / 2 - (s > 0 ? 0.15 : 0)), H, 0);
    g.add(gable);
    // a round attic window on each gable
    const attic = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), new THREE.MeshBasicMaterial({ color: 0xffdf9a }));
    attic.position.set(s * (W / 2 + 0.02), H + 0.55, 0);
    attic.rotation.y = s * (Math.PI / 2);
    g.add(attic);
  });

  // chimney
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.9, 0.8), flat(0xf1ece0));
  chimney.position.set(1.7, H + 1.45, -0.7);
  const cap = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.18, 1.0), flat(0xd9d2c2));
  cap.position.set(1.7, H + 2.45, -0.7);
  g.add(chimney, cap);

  // front (+z): the kitchen window (left), a door (right), flower box, steps
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffe0a0 });
  const front = D / 2 + 0.02;
  const archWindow = (x, y, w, h) => {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w + 0.28, h + 0.28, 0.14), wood);
    frame.position.set(x, y, front);
    const archFrame = new THREE.Mesh(new THREE.CylinderGeometry((w + 0.28) / 2, (w + 0.28) / 2, 0.14, 16, 1, false, 0, Math.PI), wood);
    archFrame.rotation.x = Math.PI / 2;
    archFrame.position.set(x, y + (h + 0.28) / 2, front);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glowMat);
    glass.position.set(x, y, front + 0.08);
    const glassArch = new THREE.Mesh(new THREE.CircleGeometry(w / 2, 16, 0, Math.PI), glowMat);
    glassArch.position.set(x, y + h / 2, front + 0.08);
    const barV = new THREE.Mesh(new THREE.BoxGeometry(0.06, h + w / 2, 0.06), wood);
    barV.position.set(x, y + w / 4, front + 0.1);
    const barH = new THREE.Mesh(new THREE.BoxGeometry(w, 0.06, 0.06), wood);
    barH.position.set(x, y + 0.1, front + 0.1);
    g.add(frame, archFrame, glass, glassArch, barV, barH);
  };
  archWindow(-1.3, 1.7, 1.3, 1.25);
  archWindow(-2.1 + 4.2, 2.0, 0.6, 0.6); // a small one beside the door

  const door = new THREE.Mesh(new THREE.BoxGeometry(1.05, 1.8, 0.14), flat(0x9a6238));
  door.position.set(1.15, 0.95, front);
  const doorTop = new THREE.Mesh(new THREE.CylinderGeometry(0.525, 0.525, 0.14, 16, 1, false, 0, Math.PI), flat(0x9a6238));
  doorTop.rotation.x = Math.PI / 2;
  doorTop.position.set(1.15, 1.85, front);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), flat(0xe6c25a));
  knob.position.set(1.5, 0.95, front + 0.1);
  g.add(door, doorTop, knob);
  for (let i = 0; i < 2; i++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(1.5 - i * 0.2, 0.16, 0.5), flat(0xb9b2a4));
    step.position.set(1.15, 0.08 + i * 0.16, front + 0.9 - i * 0.4);
    g.add(step);
  }
  // flower box under the kitchen window
  const box = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.4), wood);
  box.position.set(-1.3, 0.8, front + 0.28);
  g.add(box);
  const rr = rng(9);
  for (let i = 0; i < 9; i++) {
    const bloom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), flat([0xf07d7d, 0xf7c8da, 0xffffff, 0x5ea04a][i % 4]));
    bloom.position.set(-1.9 + i * 0.16, 1.05 + rr() * 0.1, front + 0.28);
    g.add(bloom);
  }
  // a little bench by the wall
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.1, 0.4), wood);
  bench.position.set(-3.6, 0.5, front + 0.3);
  g.add(bench);
  [-0.5, 0.5].forEach((x) => {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.36), wood);
    leg.position.set(-3.6 + x, 0.25, front + 0.3);
    g.add(leg);
  });
  return { group: g, chimneyPos: new THREE.Vector3(1.7, H + 2.6, -0.7), frontZ: front };
}

export function createIntro(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.prepend(renderer.domElement);
  renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
  const caption = container.querySelector('.cin-caption');
  const skipBtn = container.querySelector('.cin-skip');
  const flash = container.querySelector('.cin-flash');

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa9d8f0);
  scene.fog = new THREE.Fog(0xcfe7ee, 40, 120);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 300);

  // Sky gradient dome and drifting clouds.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(150, 24, 12),
    new THREE.MeshBasicMaterial({
      side: THREE.BackSide,
      fog: false,
      map: canvasTex(4, 128, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#5aaee8');
        g.addColorStop(0.5, '#a9d8f0');
        g.addColorStop(1, '#f2f6e8');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      }),
    }),
  );
  scene.add(sky);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6f9a55, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.2);
  sun.position.set(-10, 18, 14);
  scene.add(sun);
  const windowGlow = new THREE.PointLight(0xffc46a, 6, 9, 2);
  windowGlow.position.set(-1.3, 1.8, 3.2);
  scene.add(windowGlow);

  const r = rng(77);
  const clouds = Array.from({ length: 6 }, (_, i) => {
    const c = makeCloud(r);
    c.position.set(-50 + i * 22, 22 + r() * 8, -20 - r() * 30);
    c.scale.setScalar(1.6 + r());
    scene.add(c);
    return c;
  });

  // Island, cliff, and water.
  const island = new THREE.Mesh(new THREE.CylinderGeometry(17, 16, 2, 28), flat(0x8cc063));
  island.position.y = -1;
  const cliff = new THREE.Mesh(new THREE.CylinderGeometry(16, 11, 4.5, 28), flat(0xb98a5a));
  cliff.position.y = -4.2;
  scene.add(island, cliff);
  const sea = new THREE.PlaneGeometry(400, 400, 40, 40).rotateX(-Math.PI / 2);
  const sp = sea.attributes.position;
  for (let i = 0; i < sp.count; i++) sp.setY(i, (r() - 0.5) * 0.25);
  const seaMesh = new THREE.Mesh(sea.toNonIndexed(), flat(0x4aa8db));
  seaMesh.position.y = -5;
  scene.add(seaMesh);
  // grassy lumps and a stepping-stone path to the door
  [[-11, -6, 5], [12, -8, 6], [-15, 6, 4]].forEach(([x, z, s]) => {
    const hill = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), flat(0x7fb85c));
    hill.position.set(x, -s * 0.35, z);
    hill.scale.y = 0.55;
    scene.add(hill);
  });
  for (let i = 0; i < 6; i++) {
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.1, 7), flat(0xcfc8b8));
    stone.position.set(1.15 + Math.sin(i) * 0.3, 0.05, 3.3 + i * 0.95);
    scene.add(stone);
  }

  const cottage = buildCottage();
  scene.add(cottage.group);

  const trees = [
    [-7, -1, 1.5],
    [-9.5, 4, 1.2],
    [8, 0, 1.6],
    [10, 5, 1.2],
    [5, -6, 1.3],
    [-5, -7, 1.4],
  ].map(([x, z, s]) => {
    const t = makeTree(r, x, z, s);
    scene.add(t);
    return t;
  });
  [[-4.6, 3.2, 1], [4.4, 3.4, 1.2], [-6.5, 2, 1.1], [6.6, 1.5, 0.9]].forEach(([x, z, s], i) => {
    scene.add(makeBush(x, z, s, i % 2 ? 0x6cb055 : 0x5ea04a));
  });

  // Chimney smoke.
  const smokeGeo = new THREE.IcosahedronGeometry(0.28, 1);
  const smoke = Array.from({ length: 7 }, () => {
    const m = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({ color: 0xf4f4f4, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(m);
    return m;
  });

  // The fly.
  const fly = createFly({ scale: 0.3 });
  fly.pose.flap = 1;
  fly.pose.spread = 0.85;
  fly.setAction('gait', 1);
  scene.add(fly.object);

  const flyPath = new THREE.CatmullRomCurve3(
    [
      [-11, 6.8, 21],
      [-8, 5.4, 15.5],
      [-4.5, 3.6, 10.5],
      [-2.2, 2.5, 6.6],
      [-1.3, 1.85, 3.9],
      [-1.3, 1.72, 2.4],
      [-1.3, 1.65, 1.0],
    ].map((p) => new THREE.Vector3(...p)),
    false,
    'catmullrom',
    0.4,
  );
  const camPath = new THREE.CatmullRomCurve3(
    [
      [7, 6.8, 25],
      [3, 4.8, 16.5],
      [0.2, 3.0, 10.5],
      [-0.7, 2.3, 7.0],
      [-1.15, 1.95, 4.9],
    ].map((p) => new THREE.Vector3(...p)),
    false,
    'catmullrom',
    0.4,
  );
  const windowCentre = new THREE.Vector3(-1.3, 1.75, 2.2);
  const houseCentre = new THREE.Vector3(0, 2.4, 0);

  let raf = 0;
  let t = 0; // video time: advances by rendered frames, so page-load stalls do not eat into the video
  let prevNow = null;
  let done = null;
  let finished = false;
  const tmp = new THREE.Vector3();
  const look = new THREE.Vector3();
  let lastCaption = -1;

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(container);
  resize();

  function frame(now) {
    if (finished) return;
    const dt = prevNow == null ? 0 : Math.min(0.05, (now - prevNow) / 1000);
    prevNow = now;
    t += dt;

    // fly along its path, then a hop into the window
    const fu = ease(THREE.MathUtils.clamp((t - 0.5) / 6.2, 0, 1));
    flyPath.getPoint(fu, tmp);
    tmp.y += Math.sin(t * 7) * 0.05; // a bobbing flight
    fly.object.position.copy(tmp);
    flyPath.getPoint(Math.min(1, fu + 0.02), look);
    fly.object.lookAt(look);
    fly.object.visible = fu < 0.985;
    fly.update(dt);

    // camera glides in, follows the fly, and finally frames the window
    const cu = ease(THREE.MathUtils.clamp(t / (DURATION - 0.6), 0, 1));
    camPath.getPoint(cu, camera.position);
    const toWindow = smooth(t, 4.6, 6.4);
    // open on the cottage, pick up the fly as it arrives, then settle on the window
    look.copy(houseCentre).lerp(fly.object.position, smooth(t, 1.2, 3.4)).lerp(windowCentre, toWindow);
    camera.lookAt(look);
    camera.fov = THREE.MathUtils.lerp(52, 34, smooth(t, 3.5, 7));
    camera.updateProjectionMatrix();

    // life in the scene
    clouds.forEach((c, i) => (c.position.x = ((c.position.x + 60 + dt * (0.6 + i * 0.1)) % 140) - 60));
    trees.forEach((tree, i) => (tree.rotation.z = Math.sin(t * 1.2 + i) * 0.015));
    smoke.forEach((m, i) => {
      const ph = (t / 3.5 + i / smoke.length) % 1;
      m.position.set(cottage.chimneyPos.x + ph * 1.2 + Math.sin(ph * 5 + i) * 0.15, cottage.chimneyPos.y + ph * 3, cottage.chimneyPos.z);
      m.scale.setScalar(0.6 + ph * 1.8);
      m.material.opacity = 0.5 * Math.sin(Math.PI * Math.min(1, ph * 1.1));
    });
    windowGlow.intensity = 6 + Math.sin(t * 9) * 0.6 + smooth(t, 5, 6.6) * 8;

    // captions and the closing warm flash
    const ci = CAPTIONS.reduce((acc, [start], i) => (t >= start ? i : acc), 0);
    if (ci !== lastCaption) {
      caption.textContent = CAPTIONS[ci][1];
      lastCaption = ci;
    }
    flash.style.opacity = String(smooth(t, 6.5, 7.4));

    renderer.render(scene, camera);
    if (t >= DURATION) return finish();
    raf = requestAnimationFrame(frame);
  }

  function finish() {
    if (finished) return;
    finished = true;
    cancelAnimationFrame(raf);
    done?.();
  }

  return {
    // Resolves when the video ends (or is skipped). The overlay stays up, warm and blank, until hide() is called.
    play() {
      container.classList.remove('hidden');
      flash.style.opacity = '0';
      return new Promise((resolve) => {
        done = resolve;
        skipBtn.onclick = finish;
        window.addEventListener('keydown', function onKey(e) {
          if (e.key === 'Escape' || e.key === ' ') {
            window.removeEventListener('keydown', onKey);
            finish();
          }
        });
        raf = requestAnimationFrame(frame);
      });
    },

    // Fade the warm overlay away to reveal the kitchen, then free the intro's graphics memory.
    hide() {
      container.classList.add('fading');
      setTimeout(() => {
        container.classList.add('hidden');
        ro.disconnect();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      }, 900);
    },
  };
}
