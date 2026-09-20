import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rng } from './random.js';

// Everything that sits on the kitchen counter, in a warm illustrated style: a copper pot boiling on a gas ring,
// a lattice cherry pie with a steaming cup, a hand chopping a carrot, daisies on a wooden table, and the
// cheese blocks, rolling-pin hurdles and fruit that make up each level's obstacle course.
// Builders return a group, plus an `update(t)` (t in seconds) when the piece moves.

export const sm = THREE.MathUtils.smoothstep;
export const hash = (a, b) => {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return s - Math.floor(s);
};

export function canvasTex(w, h, draw, { repeat = [1, 1], nearest = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.anisotropy = 8;
  if (nearest) tex.magFilter = THREE.NearestFilter;
  return tex;
}

export const cast = (obj, shadow = true) => {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = shadow;
      o.receiveShadow = true;
    }
  });
  return obj;
};

// Soft translucent puffs that rise, drift and thin out: steam and smoke.
export function makePuffPool({ n, size, color = 0xffffff, opacity = 0.3, rise = 3, drift = 0.6, period = 4, y0 = 0, spread = 0.3 }) {
  const group = new THREE.Group();
  const geo = new THREE.IcosahedronGeometry(size, 1);
  const puffs = Array.from({ length: n }, () => {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false }));
    group.add(m);
    return m;
  });
  return {
    group,
    update(t) {
      puffs.forEach((m, i) => {
        const ph = (t / period + i / n) % 1;
        m.position.set(
          Math.sin(ph * 5 + i * 1.7) * spread + ph * drift,
          y0 + ph * rise,
          Math.cos(ph * 4 + i * 2.3) * spread,
        );
        m.scale.setScalar(0.5 + ph * 1.6);
        m.material.opacity = opacity * Math.sin(Math.PI * Math.min(1, ph * 1.1));
      });
    },
  };
}

// ------------------------------------------------------------------------------------------------
// The pie: a lattice-topped cherry pie on a blue-rimmed plate, one slice cut out, a spoon, and a steaming cup.
// ------------------------------------------------------------------------------------------------
export const PIE_R = 1.45;

function sectorGeometry(radius, from, to, depth) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, 0, radius, from, to, false);
  shape.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 24 });
  geo.rotateX(-Math.PI / 2); // shape y becomes world -z
  return geo;
}

export function makePie() {
  const g = new THREE.Group();
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.35 });
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(2.0, 1.8, 0.14, 40), white);
  plate.position.y = 0.07;
  const plateRim = new THREE.Mesh(
    new THREE.TorusGeometry(1.86, 0.045, 8, 48).rotateX(Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x5f95d3, roughness: 0.4 }),
  );
  plateRim.position.y = 0.15;
  g.add(plate, plateRim);

  const latticeTex = canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#9f2029'; // cherry filling showing between strips
    ctx.fillRect(0, 0, w, h);
    const strip = 26;
    const gap = 46;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = -1; i < 7; i++) {
        const pos = i * gap + 8;
        ctx.fillStyle = pass ? '#e0aa55' : '#d29a46';
        if (pass) ctx.fillRect(0, pos, w, strip);
        else ctx.fillRect(pos, 0, strip, h);
        ctx.fillStyle = 'rgba(120,70,20,0.28)';
        if (pass) ctx.fillRect(0, pos + strip - 4, w, 4);
        else ctx.fillRect(pos + strip - 4, 0, 4, h);
      }
    }
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = 'rgba(255,225,150,0.35)';
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 2);
    }
  });
  latticeTex.repeat.set(1 / (2 * PIE_R), 1 / (2 * PIE_R));
  latticeTex.offset.set(0.5, 0.5);
  const crust = new THREE.MeshStandardMaterial({ color: 0xd9a04f, roughness: 0.55 });
  const top = new THREE.MeshStandardMaterial({ map: latticeTex, roughness: 0.5 });
  const filling = new THREE.MeshStandardMaterial({ color: 0xa0242c, roughness: 0.3, side: THREE.DoubleSide });

  // The pie with a wedge missing (angles measured in the extruded shape's frame), and the wedge itself.
  const GAP = 0.75;
  const pie = new THREE.Mesh(sectorGeometry(PIE_R, GAP, Math.PI * 2, 0.5), [top, crust]);
  pie.position.y = 0.16;
  g.add(pie);
  const slice = new THREE.Mesh(sectorGeometry(PIE_R * 0.86, 0, GAP - 0.08, 0.5), [top, crust]);
  slice.position.set(2.25, 0.16, 0.9);
  slice.rotation.y = 0.5;
  g.add(slice);
  const cutFace = (angle, radius, parent, at = [0, 0, 0]) => {
    const f = new THREE.Mesh(new THREE.PlaneGeometry(radius, 0.42), filling);
    // shape angle a maps to world direction (cos a, 0, -sin a)
    f.position.set(at[0] + (Math.cos(angle) * radius) / 2, at[1] + 0.37, at[2] - (Math.sin(angle) * radius) / 2);
    f.rotation.y = angle;
    parent.add(f);
  };
  cutFace(GAP, PIE_R, pie, [0, 0, 0]);
  cutFace(Math.PI * 2, PIE_R, pie, [0, 0, 0]);
  cutFace(0, PIE_R * 0.86, slice, [0, 0, 0]);
  cutFace(GAP - 0.08, PIE_R * 0.86, slice, [0, 0, 0]);
  // crimped golden edge around the pie
  const edge = new THREE.Mesh(new THREE.TorusGeometry(PIE_R, 0.09, 8, 48, Math.PI * 2 - GAP).rotateX(Math.PI / 2), crust);
  edge.rotation.y = 0; // torus starts at +x; the missing wedge mirrors the shape's frame
  edge.scale.z = -1;
  edge.rotation.y = -GAP;
  edge.position.y = 0.68;
  g.add(edge);

  // a few glossy cherries on the plate
  const cherryMat = new THREE.MeshStandardMaterial({ color: 0x7a1220, roughness: 0.15 });
  [
    [1.2, 1.05, 0.14],
    [1.55, 0.7, -0.3],
    [-0.2, 1.7, 0.1],
  ].forEach(([x, z, s]) => {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 10), cherryMat);
    c.position.set(x, 0.3 + s, z);
    g.add(c);
  });

  // spoon lying on the plate rim
  const silver = new THREE.MeshStandardMaterial({ color: 0xcfd5dc, roughness: 0.25, metalness: 0.9 });
  const spoonHandle = new THREE.Mesh(new THREE.CapsuleGeometry(0.05, 1.1, 4, 8), silver);
  spoonHandle.rotation.z = Math.PI / 2;
  spoonHandle.position.set(-2.3, 0.27, -0.6);
  spoonHandle.rotation.y = 0.35;
  const spoonBowl = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), silver);
  spoonBowl.scale.set(1.3, 0.35, 1);
  spoonBowl.position.set(-1.7, 0.27, -0.83);
  g.add(spoonHandle, spoonBowl);

  // steaming cup on a saucer
  const cup = new THREE.Group();
  const saucer = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.55, 0.07, 28), white);
  saucer.position.y = 0.04;
  const cupBody = new THREE.Mesh(
    new THREE.LatheGeometry(
      [
        [0.0, 0.0],
        [0.32, 0.0],
        [0.42, 0.12],
        [0.5, 0.55],
        [0.52, 0.62],
        [0.46, 0.62],
        [0.44, 0.5],
        [0.0, 0.5],
      ].map(([x, y]) => new THREE.Vector2(x, y)),
      28,
    ),
    new THREE.MeshStandardMaterial({ color: 0xf8f4ea, roughness: 0.3, side: THREE.DoubleSide }),
  );
  cupBody.position.y = 0.1;
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.48, 0.03, 6, 28).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5f95d3 }));
  band.position.y = 0.42;
  const tea = new THREE.Mesh(new THREE.CircleGeometry(0.44, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xa8683a, roughness: 0.2 }));
  tea.position.y = 0.6;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.05, 6, 12, Math.PI * 1.2), white);
  handle.position.set(0.55, 0.36, 0);
  handle.rotation.z = -Math.PI / 2 - 0.5;
  cup.add(saucer, cupBody, band, tea, handle);
  cup.position.set(-3.3, 0, 1.6);
  g.add(cup);
  const cupSteam = makePuffPool({ n: 6, size: 0.13, opacity: 0.4, rise: 1.7, drift: 0.15, period: 3, y0: 0.75, spread: 0.12 });
  cupSteam.group.position.copy(cup.position);
  g.add(cupSteam.group);

  cast(g);
  return { group: g, update: (t) => cupSteam.update(t) };
}

// ------------------------------------------------------------------------------------------------
// Chopping board with two hands and a knife, in constant motion: a carrot being sliced.
// Built with +x toward the viewer's right and +z away from the viewer; the caller mirrors it into world x.
// ------------------------------------------------------------------------------------------------
// A faceted low-poly hand, in the style of the reference: flat-shaded tan skin, long tapered fingers in three
// joints, a splayed thumb, pale fingertips, and a wrist that runs back into a striped sleeve. The back of the hand
// faces up. Fingers point along +z (the palm is at the origin) and bend down by `curl` (0 = straight).
function makeHand({ curl }) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xe6c19b, flatShading: true, roughness: 0.8, emissive: 0x3a2616 });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0xece4dc, flatShading: true, roughness: 0.8 });

  // Palm and back of the hand: a coarse box drawn in toward the wrist and puffed up a little, so its few large
  // facets read as tendons and knuckles.
  const palmGeo = new THREE.BoxGeometry(0.92, 0.26, 1.0, 3, 1, 3);
  const pp = palmGeo.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const k = (pp.getZ(i) + 0.5) / 1.0; // 0 at the wrist, 1 at the knuckles
    pp.setX(i, pp.getX(i) * (0.66 + 0.34 * k));
    if (pp.getY(i) > 0) pp.setY(i, pp.getY(i) + 0.05 * (1 - Math.pow(pp.getX(i) / 0.46, 2)) + 0.03 * k);
  }
  palmGeo.computeVertexNormals();
  g.add(new THREE.Mesh(palmGeo, skin));

  // A tapered, six-sided finger segment lying along +z from its pivot, plus an optional pale tip.
  const segment = (len, r0, r1, tip = false) => {
    const seg = new THREE.Group();
    const geo = new THREE.CylinderGeometry(r1, r0, len, 6, 2).rotateX(Math.PI / 2);
    geo.translate(0, 0, len / 2);
    seg.add(new THREE.Mesh(geo, skin));
    if (tip) {
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(r1 * 0.72, r1, 0.09, 6).rotateX(Math.PI / 2), tipMat);
      cap.position.z = len + 0.03;
      seg.add(cap);
    }
    return seg;
  };

  // four fingers, thumb side first (index, middle, ring, little)
  const fingers = [
    { x: -0.3, len: 0.82, r: 0.105 },
    { x: -0.1, len: 0.94, r: 0.11 },
    { x: 0.1, len: 0.86, r: 0.105 },
    { x: 0.3, len: 0.66, r: 0.092 },
  ];
  fingers.forEach(({ x, len, r }, i) => {
    const l1 = len * 0.42;
    const l2 = len * 0.33;
    const l3 = len * 0.25;
    const prox = segment(l1, r, r * 0.92);
    prox.position.set(x, 0.03, 0.5);
    prox.rotation.x = curl * 0.6;
    prox.rotation.y = (i - 1.5) * 0.05; // a slight fan
    const mid = segment(l2, r * 0.92, r * 0.82);
    mid.position.z = l1;
    mid.rotation.x = curl * 0.85;
    const dist = segment(l3, r * 0.82, r * 0.7, true);
    dist.position.z = l2;
    dist.rotation.x = curl * 0.7;
    mid.add(dist);
    prox.add(mid);
    g.add(prox);
  });

  // the thumb: springs from the side of the palm and reaches out and forward
  const thumb = segment(0.44, 0.13, 0.11);
  thumb.position.set(-0.4, -0.02, 0.05);
  thumb.rotation.set(0.15 + curl * 0.2, -0.6, 0);
  const thumbTip = segment(0.36, 0.11, 0.095, true);
  thumbTip.position.z = 0.44;
  thumbTip.rotation.set(curl * 0.4, 0.15, 0);
  thumb.add(thumbTip);
  g.add(thumb);

  // wrist and forearm, then a striped grey-blue sleeve running back toward the counter's edge
  const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.29, 2.2, 8).rotateX(Math.PI / 2), skin);
  wrist.position.set(0, 0.01, -1.55);
  g.add(wrist);
  const sleeveTex = canvasTex(64, 64, (ctx, w, h) => {
    ctx.fillStyle = '#b9c3d1';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#a3afc0';
    for (let y = 0; y < h; y += 12) ctx.fillRect(0, y, w, 4);
  });
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.58, 6, 12, 1, true),
    new THREE.MeshLambertMaterial({ map: sleeveTex, side: THREE.DoubleSide }),
  );
  sleeve.rotation.x = Math.PI / 2;
  sleeve.position.set(0, 0.05, -5.5);
  g.add(sleeve);
  g.scale.setScalar(1.3);
  return g;
}

export function makeChoppingBoard() {
  const g = new THREE.Group();
  const woodTex = canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#b07a47';
    ctx.fillRect(0, 0, w, h);
    const r = rng(4);
    ctx.strokeStyle = 'rgba(110,65,30,0.45)';
    for (let i = 0; i < 22; i++) {
      ctx.lineWidth = 1 + r() * 2;
      ctx.beginPath();
      const y = r() * h;
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 12, w * 0.7, y + (r() - 0.5) * 12, w, y + (r() - 0.5) * 8);
      ctx.stroke();
    }
  });
  woodTex.repeat.set(0.3, 0.3);
  // board with a rounded end and a handle hole
  const shape = new THREE.Shape();
  const W = 2.6;
  const H = 1.55;
  shape.moveTo(-W + 0.4, -H);
  shape.lineTo(W - 0.4, -H);
  shape.quadraticCurveTo(W, -H, W, -H + 0.4);
  shape.lineTo(W, -0.55);
  shape.lineTo(W + 1.1, -0.45);
  shape.quadraticCurveTo(W + 1.4, 0, W + 1.1, 0.45);
  shape.lineTo(W, 0.55);
  shape.lineTo(W, H - 0.4);
  shape.quadraticCurveTo(W, H, W - 0.4, H);
  shape.lineTo(-W + 0.4, H);
  shape.quadraticCurveTo(-W, H, -W, H - 0.4);
  shape.lineTo(-W, -H + 0.4);
  shape.quadraticCurveTo(-W, -H, -W + 0.4, -H);
  const hole = new THREE.Path();
  hole.absarc(W + 0.75, 0, 0.16, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  const boardGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.24, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.03, bevelSegments: 2 });
  boardGeo.rotateX(-Math.PI / 2);
  const board = new THREE.Mesh(boardGeo, new THREE.MeshLambertMaterial({ map: woodTex }));
  g.add(board);
  const top = 0.27;

  // carrot lying along x, thick end toward the knife
  const carrotTex = canvasTex(128, 32, (ctx, w, h) => {
    ctx.fillStyle = '#ec7a2a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(160,60,10,0.35)';
    for (let x = 6; x < w; x += 9) ctx.fillRect(x, 4 + (x % 3) * 3, 2, 7 + (x % 4) * 3);
  });
  const carrot = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.05, 3.3, 20), new THREE.MeshStandardMaterial({ map: carrotTex, roughness: 0.6 }));
  carrot.rotation.z = -Math.PI / 2; // thick end toward +x
  carrot.position.set(-0.7, top + 0.32, 0.1);
  g.add(carrot);
  const cutEnd = new THREE.Mesh(new THREE.CircleGeometry(0.34, 20), new THREE.MeshStandardMaterial({ color: 0xf4a24c }));
  cutEnd.rotation.y = Math.PI / 2;
  cutEnd.position.set(0.96, top + 0.32, 0.1);
  g.add(cutEnd);

  // slices: a pile at rest, plus five that hop off the carrot one per chop
  const sliceGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.09, 20);
  const sliceMat = new THREE.MeshStandardMaterial({ color: 0xef7a2c, roughness: 0.5 });
  const centreGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 14);
  const centreMat = new THREE.MeshStandardMaterial({ color: 0xf6a850, roughness: 0.5 });
  const makeSlice = () => {
    const s = new THREE.Group();
    s.add(new THREE.Mesh(sliceGeo, sliceMat), new THREE.Mesh(centreGeo, centreMat));
    return s;
  };
  [
    [2.05, 0.75, 0.3],
    [2.55, 0.2, 1.2],
    [2.15, -0.5, 2.0],
    [3.05, 0.55, 0.9],
    [2.7, -0.85, 0.4],
    [3.1, -0.2, 2.5],
  ].forEach(([x, z, rot]) => {
    const s = makeSlice();
    s.position.set(x, top + 0.05, z);
    s.rotation.y = rot;
    g.add(s);
  });
  const N = 5;
  const hopSlices = Array.from({ length: N }, (_, k) => {
    const s = makeSlice();
    s.visible = false;
    g.add(s);
    return { s, rest: new THREE.Vector3(1.5 + k * 0.32, top + 0.05, -0.3 + ((k * 7) % 5) * 0.28) };
  });

  // a tomato and lemon slices in the corner, as in the reference
  const tomato = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), new THREE.MeshStandardMaterial({ color: 0xc8321f, roughness: 0.3 }));
  tomato.scale.y = 0.85;
  tomato.position.set(-2.0, top + 0.45, 1.0);
  g.add(tomato);
  const calyx = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.08, 5), new THREE.MeshStandardMaterial({ color: 0x3f7a3a }));
  calyx.position.set(-2.0, top + 0.87, 1.0);
  g.add(calyx);
  [0.2, 0.65].forEach((x, i) => {
    const lemon = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.55, 0.08, 20, 1, false, 0, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0xf2c94a, roughness: 0.4 }),
    );
    lemon.position.set(x - 0.4, top + 0.05, 1.1 - i * 0.05);
    lemon.rotation.y = 0.5 + i * 0.4;
    g.add(lemon);
  });

  // hands: the left steadies the carrot, the right works the knife
  const holder = makeHand({ curl: 0.22 });
  holder.position.set(-0.7, top + 0.85, -0.95);
  holder.rotation.y = 0.25;
  g.add(holder);

  const chopper = new THREE.Group(); // hand + knife, slides along the carrot
  const knifeHand = makeHand({ curl: 0.3 });
  knifeHand.position.set(0, 0.8, -1.0);
  chopper.add(knifeHand);
  const knife = new THREE.Group(); // pivots to lift and slam the blade
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(0, 0.02);
  bladeShape.lineTo(1.65, 0.02);
  bladeShape.lineTo(2.1, 0.32);
  bladeShape.lineTo(0, 0.42);
  bladeShape.closePath();
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.05, bevelEnabled: false });
  bladeGeo.rotateY(-Math.PI / 2);
  const blade = new THREE.Mesh(bladeGeo, new THREE.MeshStandardMaterial({ color: 0xdfe3e8, roughness: 0.2, metalness: 0.9 }));
  blade.position.set(0.02, -0.02, 0.2);
  const knifeHandle = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.85, 4, 8).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5b3a26 }));
  knifeHandle.position.set(0, 0.28, -0.35);
  knife.add(blade, knifeHandle);
  knife.position.set(0, 0.32, -0.55);
  chopper.add(knife);
  chopper.position.set(1.35, top, -0.45);
  g.add(chopper);
  cast(g);

  const T = 0.5; // seconds per chop
  const R = 0.8; // seconds to lift and reposition after five chops
  const CYCLE = N * T + R;
  const X0 = 1.35;
  return {
    group: g,
    update(t) {
      const u = t % CYCLE;
      const chopping = u < N * T;
      const chop = chopping ? Math.floor(u / T) : N - 1;
      const p = chopping ? (u - chop * T) / T : 1;
      // blade angle: up, slam down around p = 0.45, hold, lift
      const down = sm(p, 0.3, 0.48) * (1 - sm(p, 0.66, 0.96));
      const lift = chopping ? 0.62 * (1 - down) : 1.0;
      knife.rotation.x = -lift;
      const reset = chopping ? 0 : sm(u - N * T, 0, R);
      const x = X0 + 0.34 * chop * (1 - reset);
      chopper.position.x = x;
      chopper.position.y = top + (chopping ? 0.28 * (1 - down) : 0.4);
      knifeHand.rotation.x = -lift * 0.25;
      // the steadying hand nudges the carrot back a little between chops
      holder.position.x = -0.7 + 0.06 * Math.sin(t * 5.2);
      holder.position.z = -0.95 + 0.05 * Math.sin(t * 2.6);
      hopSlices.forEach(({ s, rest }, k) => {
        const cut = chopping ? k < chop || (k === chop && p > 0.5) : true;
        s.visible = cut;
        if (!cut) return;
        const since = chopping ? (k === chop ? (p - 0.5) * T : (chop - k) * T + (1 - 0.5) * T) : 1;
        const hop = sm(since, 0, 0.35);
        s.position.set(
          THREE.MathUtils.lerp(0.98, rest.x, hop),
          rest.y + Math.sin(Math.PI * Math.min(1, since / 0.35)) * 0.55 * (1 - hop * 0.2),
          THREE.MathUtils.lerp(0.1, rest.z, hop),
        );
        s.rotation.set(0, hop * 6, (1 - hop) * 1.2);
        const fade = chopping ? 1 : 1 - sm(u - N * T, k * 0.1, k * 0.1 + 0.4);
        s.scale.setScalar(Math.max(0.001, fade));
      });
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Obstacle-course pieces
// ------------------------------------------------------------------------------------------------
let cheeseMat = null;
export function cheeseMaterial() {
  if (!cheeseMat) {
    const tex = canvasTex(64, 64, (ctx, w, h) => {
      const r = rng(12);
      ctx.fillStyle = '#f5cf55';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        const x = r() * w;
        const y = r() * h;
        const rad = 3 + r() * 6;
        ctx.fillStyle = '#d8a935';
        ctx.beginPath();
        ctx.arc(x, y, rad, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b98a22';
        ctx.beginPath();
        ctx.arc(x + 1, y + 1, rad * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    cheeseMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55 });
  }
  return cheeseMat;
}
export const cheeseGeo = new RoundedBoxGeometry(0.96, 0.96, 0.96, 3, 0.07);

// A rolling pin resting across two mugs: the "hurdle".
export function makeRollingPinHurdle(w) {
  const g = new THREE.Group();
  const h = 0.78;
  const mugMat = new THREE.MeshStandardMaterial({ color: 0xf3f0e6, roughness: 0.35 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x5f95d3, roughness: 0.4 });
  [-w / 2, w / 2].forEach((x) => {
    const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.3, h, 20), mugMat);
    mug.position.set(x, h / 2, 0);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.345, 0.345, 0.12, 20), blue);
    stripe.position.set(x, h * 0.55, 0);
    const handle = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.045, 6, 12, Math.PI * 1.3), mugMat);
    handle.position.set(x, h * 0.5, 0.36);
    handle.rotation.set(0, 0, 0.6);
    g.add(mug, stripe, handle);
  });
  const wood = new THREE.MeshStandardMaterial({ color: 0xc8965a, roughness: 0.6 });
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, w, 20).rotateZ(Math.PI / 2), wood);
  pin.position.y = h + 0.14;
  g.add(pin);
  [-1, 1].forEach((s) => {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.55, 12).rotateZ(Math.PI / 2), wood);
    grip.position.set(s * (w / 2 + 0.3), h + 0.14, 0);
    g.add(grip);
  });
  return cast(g);
}

// Rolling fruit: a lemon (yellow), an orange, and a blueberry (sky blue). All radius ~0.55 so they read as balls.
export function makeFruit(kind, radius) {
  const g = new THREE.Group();
  if (kind === 0) {
    const lemon = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), new THREE.MeshStandardMaterial({ color: 0xf4d23c, roughness: 0.45 }));
    lemon.scale.set(1.12, 0.95, 0.95);
    const nubA = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0xe9c22c }));
    nubA.rotation.z = -Math.PI / 2;
    nubA.position.x = radius * 1.12 + 0.05;
    const nubB = nubA.clone();
    nubB.rotation.z = Math.PI / 2;
    nubB.position.x = -nubA.position.x;
    g.add(lemon, nubA, nubB);
  } else if (kind === 1) {
    const tex = canvasTex(64, 64, (ctx, w, h) => {
      const r = rng(30);
      ctx.fillStyle = '#f08a2b';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(190,90,10,0.45)';
      for (let i = 0; i < 90; i++) ctx.fillRect(r() * w, r() * h, 2, 2);
    });
    const orange = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 14), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    const nub = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshStandardMaterial({ color: 0x4f8a3a }));
    nub.position.y = radius * 0.98;
    g.add(orange, nub);
  } else {
    const berry = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.92, 20, 14), new THREE.MeshStandardMaterial({ color: 0x7cc7ee, roughness: 0.3 }));
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.12, 5), new THREE.MeshStandardMaterial({ color: 0x3b6aa8, roughness: 0.6 }));
    crown.position.y = radius * 0.9;
    const bloom = new THREE.Mesh(new THREE.SphereGeometry(radius * 0.93, 16, 10), new THREE.MeshStandardMaterial({ color: 0xcfe9f8, roughness: 0.9, transparent: true, opacity: 0.25 }));
    g.add(berry, crown, bloom);
  }
  return cast(g);
}

// A carton of salt: cream cardboard with a blue band and label, and a little metal pouring spout on top.
const saltTexCache = new Map();
export function makeSaltBox({ label = 'SALT', tint = 0x3f6fb5 } = {}) {
  const g = new THREE.Group();
  const key = label + tint;
  if (!saltTexCache.has(key)) {
    saltTexCache.set(key, canvasTex(128, 192, (ctx, w, h) => {
      ctx.fillStyle = '#f3ecdc';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#' + tint.toString(16).padStart(6, '0');
      ctx.fillRect(0, 0, w, 44);
      ctx.fillRect(0, h - 26, w, 26);
      ctx.fillStyle = '#fff';
      ctx.fillRect(14, 62, w - 28, 62);
      ctx.fillStyle = '#' + tint.toString(16).padStart(6, '0');
      ctx.font = 'bold 30px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, w / 2, 94);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let i = 0; i < 6; i++) ctx.fillRect(14 + i * 20, 134, 10, 6);
    }));
  }
  const saltTex = saltTexCache.get(key);
  const box = new THREE.Mesh(new RoundedBoxGeometry(0.95, 1.4, 0.62, 2, 0.05), new THREE.MeshStandardMaterial({ map: saltTex, roughness: 0.7 }));
  box.position.y = 0.7;
  const spout = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.14), new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.8, roughness: 0.3 }));
  spout.position.set(0, 1.5, 0);
  spout.rotation.z = 0.35;
  g.add(box, spout);
  return cast(g);
}

// A small white bowl heaped with cut vegetables: tomato wedges, cucumber and carrot coins, and a few herb leaves.
export function makeVegBowl(radius = 0.95) {
  const g = new THREE.Group();
  const bowl = new THREE.Mesh(
    new THREE.LatheGeometry(
      [[0, 0], [radius * 0.45, 0], [radius * 0.85, radius * 0.25], [radius, radius * 0.62], [radius * 0.98, radius * 0.66], [radius * 0.9, radius * 0.6], [radius * 0.4, radius * 0.08], [0, radius * 0.08]].map(([x, y]) => new THREE.Vector2(x, y)),
      28,
    ),
    new THREE.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.35, side: THREE.DoubleSide }),
  );
  const band = new THREE.Mesh(new THREE.TorusGeometry(radius * 0.99, 0.03, 6, 28).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5f95d3 }));
  band.position.y = radius * 0.64;
  g.add(bowl, band);
  const r = rng(Math.floor(radius * 100));
  const tomato = new THREE.MeshStandardMaterial({ color: 0xd23a26, roughness: 0.4 });
  const cuke = new THREE.MeshStandardMaterial({ color: 0x8cc76a, roughness: 0.5 });
  const carrot = new THREE.MeshStandardMaterial({ color: 0xee7f2c, roughness: 0.5 });
  const herb = new THREE.MeshStandardMaterial({ color: 0x3f8a3a, roughness: 0.7, flatShading: true });
  const wedge = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.09, 12, 1, false, 0, Math.PI).rotateX(Math.PI / 2), tomato);
  const coin = new THREE.CylinderGeometry(0.17, 0.17, 0.05, 14);
  for (let i = 0; i < 16; i++) {
    const a = r() * Math.PI * 2;
    const d = r() * radius * 0.6;
    const h = radius * 0.3 + (1 - d / (radius * 0.6)) * radius * 0.22;
    let m;
    if (i % 3 === 0) m = wedge.clone();
    else m = new THREE.Mesh(coin, i % 3 === 1 ? cuke : carrot);
    m.position.set(Math.cos(a) * d, h, Math.sin(a) * d);
    m.rotation.set(r() * 2, r() * 6, r() * 2);
    g.add(m);
  }
  for (let i = 0; i < 4; i++) {
    const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.1, 0), herb);
    l.position.set((r() - 0.5) * radius, radius * 0.55, (r() - 0.5) * radius);
    g.add(l);
  }
  return cast(g);
}
