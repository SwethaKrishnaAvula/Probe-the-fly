import * as THREE from 'three';
import { rng } from './random.js';

// Bigger, self-contained pieces of the arena world: hex-patched bushes that bloom, a campfire with a little
// smoke, the start board, and a low-poly water stream. Scenery only; nothing here is game logic.

// ---------------------------------------------------------------------------------------------
// Bushes: faceted domes with hexagon "flowers" (white, pink, salmon) and darker mottling. The flower hexes
// open and close: a vertex shader shrinks each one toward its own centre on a slow, out-of-step cycle.
// ---------------------------------------------------------------------------------------------
export const bushTime = { value: 0 }; // seconds; the arena advances it every frame

export function makeBushGeometry(variant) {
  const P =
    variant === 'y'
      ? { base: 0xc9d66b, mottle: 0x98a34a, dark: 0x23281a, patchDark: 0x8d9644 }
      : { base: 0x458c3f, mottle: 0x2f6f32, dark: 0x0e2a12, patchDark: 0x27602b };
  const rr = rng(variant === 'y' ? 21 : 22);
  const R = 0.6;
  const dome = new THREE.SphereGeometry(R, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();
  const pos = [];
  const col = [];
  const ctr = [];
  const ph = [];
  const dp = dome.attributes.position;
  const base = new THREE.Color(P.base);
  const mottle = new THREE.Color(P.mottle);
  const dark = new THREE.Color(P.dark);
  for (let i = 0; i < dp.count; i += 3) {
    const cy = (dp.getY(i) + dp.getY(i + 1) + dp.getY(i + 2)) / 3;
    const c = cy < 0.13 ? dark : base.clone().lerp(mottle, rr() * 0.55); // dark skirt, mottled top
    for (let k = 0; k < 3; k++) {
      pos.push(dp.getX(i + k), dp.getY(i + k), dp.getZ(i + k));
      col.push(c.r, c.g, c.b);
      ctr.push(0, 0, 0);
      ph.push(-1); // -1: part of the dome, never animated
    }
  }

  const up = new THREE.Vector3(0, 1, 0);
  [
    { c: 0xffffff, n: 9, r: [0.05, 0.08], bloom: true },
    { c: 0xf7c8da, n: 4, r: [0.13, 0.19], bloom: true },
    { c: 0xf07d7d, n: 4, r: [0.11, 0.16], bloom: true },
    { c: P.patchDark, n: 5, r: [0.1, 0.18], bloom: false },
  ].forEach(({ c, n, r: [a, b], bloom }) => {
    const color = new THREE.Color(c);
    for (let k = 0; k < n; k++) {
      let dir;
      do dir = new THREE.Vector3(rr() - 0.5, rr(), rr() - 0.5).normalize();
      while (dir.y < 0.3);
      const surface = R + 0.008 + (bloom ? 0.006 : 0);
      const cen = dir.clone().multiplyScalar(surface);
      const rad = a + rr() * (b - a);
      const t1 = new THREE.Vector3().crossVectors(dir, up).normalize();
      const t2 = new THREE.Vector3().crossVectors(dir, t1);
      const rot = rr() * Math.PI;
      const phase = bloom ? rr() : -1;
      const ring = (i) => {
        const a0 = rot + (i * Math.PI) / 3;
        return cen
          .clone()
          .addScaledVector(t1, Math.cos(a0) * rad)
          .addScaledVector(t2, Math.sin(a0) * rad)
          .normalize()
          .multiplyScalar(surface); // hug the dome
      };
      for (let i = 0; i < 6; i++) {
        [cen, ring(i), ring(i + 1)].forEach((p) => {
          pos.push(p.x, p.y, p.z);
          col.push(color.r, color.g, color.b);
          ctr.push(cen.x, cen.y, cen.z);
          ph.push(phase);
        });
      }
    }
  });

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aCenter', new THREE.Float32BufferAttribute(ctr, 3));
  geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(ph, 1));
  geo.computeVertexNormals();
  return geo;
}

export function bushMaterial() {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = bushTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aCenter;\nattribute float aPhase;\nuniform float uTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (aPhase >= 0.0) {
          float t = fract(uTime / 7.0 + aPhase);
          float open = smoothstep(0.0, 0.3, t) * (1.0 - smoothstep(0.72, 1.0, t));
          float b = mix(0.06, 1.0, open); // a tight bud -> a full hexagon -> back to a bud
          transformed = aCenter + (transformed - aCenter) * b;
        }`,
      );
  };
  return m;
}

// ---------------------------------------------------------------------------------------------
// Campfire: a faceted flame over a ring of logs, with sparks and a thin curl of smoke.
// ---------------------------------------------------------------------------------------------
function flameGeometry(colors) {
  const geo = new THREE.IcosahedronGeometry(0.5, 1).toNonIndexed();
  const p = geo.attributes.position;
  const smooth = THREE.MathUtils.smoothstep;
  for (let i = 0; i < p.count; i++) {
    const h = (p.getY(i) / 0.5 + 1) / 2; // 0 at the bottom .. 1 at the tip
    const squeeze = Math.pow(1 - h, 0.75) * 0.95 + 0.05;
    p.setXYZ(i, p.getX(i) * squeeze + 0.22 * h * h * h, h * 1.5, p.getZ(i) * squeeze); // teardrop, tip bent over
  }
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i += 3) {
    const h = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3 / 1.5;
    const c = new THREE.Color(colors[0]).lerp(new THREE.Color(colors[1]), smooth(h, 0.1, 0.5)).lerp(new THREE.Color(colors[2]), smooth(h, 0.5, 0.9));
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export function makeCampfire() {
  const group = new THREE.Group();

  const logMat = new THREE.MeshLambertMaterial({ color: 0x5b3324, flatShading: true });
  const logGeo = new THREE.BoxGeometry(0.46, 0.34, 0.4);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const log = new THREE.Mesh(logGeo, logMat);
    log.position.set(Math.cos(a) * 0.68, 0.17, Math.sin(a) * 0.68);
    log.rotation.set(0.1 * Math.sin(i * 2), -a + 0.3 * Math.cos(i * 3), 0.12 * Math.cos(i));
    log.castShadow = true;
    group.add(log);
  }
  const ash = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.05, 12), new THREE.MeshLambertMaterial({ color: 0x2a201c }));
  ash.position.y = 0.025;
  group.add(ash);

  // Flames: a pale outer body and a hotter orange core, both flat-shaded and a little self-lit.
  const outer = new THREE.Mesh(
    flameGeometry([0xffc23a, 0xf6d88a, 0xfff0c0]),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x7a3e08 }),
  );
  outer.position.y = 0.1;
  outer.scale.setScalar(1.15);
  outer.material.opacity = 0.9;
  outer.material.transparent = true;
  const core = new THREE.Mesh(
    flameGeometry([0xff8a1e, 0xffb640, 0xffd66a]),
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: 0x8a3a08 }),
  );
  core.position.y = 0.08;
  core.scale.set(0.85, 0.9, 0.85);
  group.add(outer, core);

  const light = new THREE.PointLight(0xff9a3a, 6, 7, 2);
  light.position.y = 1;
  group.add(light);

  // Sparks: little bright chips that float up and fade.
  const sparks = [];
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(
      new THREE.BoxGeometry(0.07, 0.07, 0.07),
      new THREE.MeshBasicMaterial({ color: 0xffd25a, transparent: true }),
    );
    sparks.push(s);
    group.add(s);
  }

  // Smoke: a small pool of soft grey puffs that rise, drift and thin out. Kept faint on purpose.
  const puffs = [];
  const puffGeo = new THREE.IcosahedronGeometry(0.16, 0);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(
      puffGeo,
      new THREE.MeshBasicMaterial({ color: 0xb8b8c6, transparent: true, opacity: 0, depthWrite: false }),
    );
    puffs.push(m);
    group.add(m);
  }

  return {
    group,
    update(t) {
      const flick = 1 + 0.07 * Math.sin(t * 9) + 0.04 * Math.sin(t * 17.3);
      outer.scale.set(1.15 * (1 - (flick - 1) * 0.5), 1.15 * flick, 1.15 * (1 - (flick - 1) * 0.5));
      outer.rotation.z = 0.05 * Math.sin(t * 3.1);
      const f2 = 1 + 0.1 * Math.sin(t * 12 + 1) + 0.05 * Math.sin(t * 21);
      core.scale.set(0.85, 0.9 * f2, 0.85);
      core.rotation.y = t * 0.8;
      light.intensity = 6 * (0.85 + 0.15 * Math.sin(t * 11) + 0.08 * Math.sin(t * 23));

      sparks.forEach((s, i) => {
        const ph = (t * 0.55 + i / sparks.length) % 1;
        s.position.set(Math.sin(i * 2.3 + ph * 4) * 0.28, 0.5 + ph * 1.7, Math.cos(i * 1.7 + ph * 3) * 0.28);
        s.material.opacity = 1 - ph;
        s.rotation.set(ph * 6, ph * 4, 0);
      });
      puffs.forEach((m, i) => {
        const ph = (t / 4 + i / puffs.length) % 1;
        m.position.set(0.05 + ph * 0.9 + Math.sin(ph * 6 + i) * 0.1, 1.35 + ph * 2.4, Math.cos(ph * 5 + i) * 0.12);
        m.scale.setScalar(0.5 + ph * 1.6);
        m.material.opacity = 0.24 * Math.sin(Math.PI * Math.min(1, ph * 1.15)); // fades in, then thins out
      });
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Start board: a wooden launch pad marked with an arrow, and a signpost that reads START.
// ---------------------------------------------------------------------------------------------
function textCanvasTexture(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.magFilter = THREE.NearestFilter;
  const paint = () => {
    draw(canvas.getContext('2d'), width, height);
    tex.needsUpdate = true;
  };
  paint();
  // Repaint once the pixel font is available (it loads from the page's stylesheet).
  document.fonts?.load('16px "Press Start 2P"').then(paint).catch(() => {});
  return tex;
}

export function makeStartBoard() {
  const g = new THREE.Group();
  const wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2c });

  const pad = new THREE.Mesh(new THREE.BoxGeometry(2, 0.05, 2), wood);
  pad.position.y = 0.025;
  pad.receiveShadow = true;
  g.add(pad);

  const padTex = textCanvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#86603a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#6f4e2d';
    for (let y = 16; y < h; y += 16) ctx.fillRect(0, y, w, 2);
    ctx.strokeStyle = '#f4efe0';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, w - 12, h - 12);
    ctx.fillStyle = '#f7c948'; // arrow pointing "forward" (up the texture)
    ctx.beginPath();
    ctx.moveTo(64, 24);
    ctx.lineTo(96, 62);
    ctx.lineTo(76, 62);
    ctx.lineTo(76, 88);
    ctx.lineTo(52, 88);
    ctx.lineTo(52, 62);
    ctx.lineTo(32, 62);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#f4efe0';
    ctx.font = '10px "Press Start 2P", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('START', 64, 112);
  });
  const marks = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 1.9), new THREE.MeshBasicMaterial({ map: padTex }));
  marks.rotation.set(-Math.PI / 2, 0, Math.PI); // texture "up" points along +z, away from the default camera
  marks.position.y = 0.053;
  g.add(marks);

  // Signpost, off to one side of the pad (the arena moves it to the inner side), facing the default camera.
  const sign = new THREE.Group();
  const postGeo = new THREE.BoxGeometry(0.09, 1.1, 0.09);
  [-0.7, 0.7].forEach((x) => {
    const post = new THREE.Mesh(postGeo, wood);
    post.position.set(x, 0.55, 0);
    post.castShadow = true;
    sign.add(post);
  });
  const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 0.08), new THREE.MeshLambertMaterial({ color: 0x8a5f34 }));
  board.position.y = 0.85;
  board.castShadow = true;
  sign.add(board);
  const boardTex = textCanvasTexture(256, 80, (ctx, w, h) => {
    ctx.fillStyle = '#f4efe0';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#d8382e';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, w - 8, h - 8);
    ctx.fillStyle = '#d8382e';
    ctx.font = '30px "Press Start 2P", "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('START', w / 2, h / 2 + 2);
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.4), new THREE.MeshBasicMaterial({ map: boardTex }));
  face.position.set(0, 0.85, -0.045);
  face.rotation.y = Math.PI; // faces -z, toward the default camera
  sign.add(face);
  g.add(sign);
  g.userData.sign = sign;
  return g;
}

// ---------------------------------------------------------------------------------------------
// Water stream: a faceted blue channel between tan, faceted cliff banks with a green grass lip.
// Built along z, centred on world x = cx, `width` wide, `length` long around z = zc.
// ---------------------------------------------------------------------------------------------
export const WATER_Y = -0.3;
const BANK_DEPTH = 0.62;

function bankGeometry(xEdge, dir, length, zc, seed, palette = {}) {
  // dir = +1 when the water lies toward +x from this edge, -1 toward -x.
  const rr = rng(seed);
  const tans = (palette.cliff ?? [0xc98a58, 0xb97a4c, 0xd39a68, 0xa96c42]).map((c) => new THREE.Color(c));
  const greens = (palette.lip ?? [0x7cb14f, 0x6ea245, 0x86bb58]).map((c) => new THREE.Color(c));
  const pos = [];
  const col = [];
  const tri = (a, b, c, color) => {
    [a, b, c].forEach((v) => {
      pos.push(...v);
      col.push(color.r, color.g, color.b);
    });
  };
  const step = 2.4;
  const n = Math.ceil(length / step);
  let prev = null;
  for (let i = 0; i <= n; i++) {
    const z = zc - length / 2 + i * step + (rr() - 0.5) * 0.7;
    const edgeX = xEdge + (rr() - 0.5) * 0.14;
    const cur = {
      lipOut: [edgeX - dir * 0.55, 0.03, z], // grass, back from the edge
      top: [edgeX, 0.02 + rr() * 0.05, z], // the cliff's brow
      bottom: [edgeX + dir * (0.18 + rr() * 0.22), -BANK_DEPTH, z], // the foot, under the water
    };
    if (prev) {
      const pick = () => tans[Math.floor(rr() * tans.length)];
      tri(prev.top, prev.bottom, cur.top, pick());
      tri(cur.top, prev.bottom, cur.bottom, pick());
      const g = () => greens[Math.floor(rr() * greens.length)];
      tri(prev.lipOut, prev.top, cur.lipOut, g());
      tri(cur.lipOut, prev.top, cur.top, g());
    }
    prev = cur;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

export function makeStream({ cx, width, length, zc, palette }) {
  const group = new THREE.Group();
  const x0 = cx - width / 2;
  const x1 = cx + width / 2;

  const bankMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
  const left = new THREE.Mesh(bankGeometry(x0, +1, length, zc, 31, palette), bankMat);
  const right = new THREE.Mesh(bankGeometry(x1, -1, length, zc, 32, palette), bankMat);
  left.receiveShadow = right.receiveShadow = true;
  group.add(left, right);

  // Water surface: a triangulated plane with a little unevenness, each facet a slightly different blue.
  const rr = rng(33);
  const water = new THREE.PlaneGeometry(width + 0.3, length, 5, Math.round(length / 2.4)).rotateX(-Math.PI / 2);
  const wp = water.attributes.position;
  for (let i = 0; i < wp.count; i++) wp.setY(i, (rr() - 0.5) * 0.06);
  const facets = water.toNonIndexed();
  const fp = facets.attributes.position;
  const blues = [0x2a86c4, 0x3596d2, 0x46a9de, 0x2f8fc9, 0x5cbbe6].map((c) => new THREE.Color(c));
  const wc = new Float32Array(fp.count * 3);
  for (let i = 0; i < fp.count; i += 3) {
    const c = blues[Math.floor(rr() * blues.length)];
    for (let k = 0; k < 3; k++) wc.set([c.r, c.g, c.b], (i + k) * 3);
  }
  facets.setAttribute('color', new THREE.BufferAttribute(wc, 3));
  facets.computeVertexNormals();
  const surface = new THREE.Mesh(
    facets,
    new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.55, metalness: 0.05 }),
  );
  surface.position.set(cx, WATER_Y, zc);
  group.add(surface);

  // A faint layer of pale streaks that slides down the stream, so the water reads as flowing.
  const streaks = document.createElement('canvas');
  streaks.width = 64;
  streaks.height = 128;
  const sc = streaks.getContext('2d');
  const sr = rng(34);
  for (let i = 0; i < 26; i++) {
    sc.fillStyle = `rgba(255,255,255,${0.35 + sr() * 0.4})`;
    sc.fillRect(Math.floor(sr() * 60), Math.floor(sr() * 124), 2 + Math.floor(sr() * 4), 4 + Math.floor(sr() * 12));
  }
  const flowTex = new THREE.CanvasTexture(streaks);
  flowTex.wrapS = flowTex.wrapT = THREE.RepeatWrapping;
  flowTex.magFilter = THREE.NearestFilter;
  flowTex.repeat.set(Math.max(1, Math.round(width / 1.2)), length / 9);
  const flow = new THREE.Mesh(
    new THREE.PlaneGeometry(width, length).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: flowTex, transparent: true, opacity: 0.4, depthWrite: false }),
  );
  flow.position.set(cx, WATER_Y + 0.045, zc);
  group.add(flow);

  return { group, flowTex, x0, x1 };
}

// ---------------------------------------------------------------------------------------------
// Daisy bouquet: white daisies with orange-yellow centres on long stems, for a jar or a jug. Built upright with
// the stems starting at the origin (the jar's mouth).
// ---------------------------------------------------------------------------------------------
function daisyHead(r, mat) {
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
    const lift = 0.02 + r() * 0.07;
    const j = (r() - 0.5) * 0.05;
    const quad = [
      [dx * rb - px * wb, 0.02, dz * rb - pz * wb],
      [dx * rb + px * wb, 0.02, dz * rb + pz * wb],
      [dx * rt + px * wt + dx * j, 0.02 + lift, dz * rt + pz * wt + dz * j],
      [dx * rt - px * wt - dx * j, 0.02 + lift, dz * rt - pz * wt - dz * j],
    ];
    const shade = 0.93 + r() * 0.07;
    const start = pos.length / 3;
    quad.forEach((v, k) => {
      pos.push(...v);
      col.push(...(k < 2 ? [0.83 * shade, 0.81 * shade, 0.87 * shade] : [shade, shade, shade]));
    });
    idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const petals = new THREE.BufferGeometry();
  petals.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  petals.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  petals.setIndex(idx);
  petals.computeVertexNormals();
  h.add(new THREE.Mesh(petals, mat));

  const dome = new THREE.SphereGeometry(0.21, 14, 9);
  const dp = dome.attributes.position;
  const dc = new Float32Array(dp.count * 3);
  for (let i = 0; i < dp.count; i++) {
    const c = new THREE.Color(0xe58a22).lerp(new THREE.Color(0xf8c93a), THREE.MathUtils.clamp(dp.getY(i) / 0.21, 0, 1));
    dc.set([c.r, c.g, c.b], i * 3);
  }
  dome.setAttribute('color', new THREE.BufferAttribute(dc, 3));
  const centre = new THREE.Mesh(dome, mat);
  centre.scale.y = 0.55;
  centre.position.y = 0.03;
  h.add(centre);
  return h;
}

export function makeBouquet({ count = 9, length = 2, spread = 0.5, seed = 5, headScale = 0.36 } = {}) {
  const g = new THREE.Group();
  const r = rng(seed);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, flatShading: true });
  const stemMat = new THREE.MeshLambertMaterial({ color: 0x4c7a4c });
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + r();
    const lean = 0.06 + r() * spread;
    const len = length * (0.7 + r() * 0.35);
    const tip = new THREE.Vector3(Math.sin(lean) * Math.cos(a), Math.cos(lean), Math.sin(lean) * Math.sin(a)).multiplyScalar(len);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.03, len, 6), stemMat);
    stem.position.copy(tip).multiplyScalar(0.5);
    stem.quaternion.setFromUnitVectors(up, tip.clone().normalize());
    g.add(stem);
    const head = daisyHead(r, mat);
    head.position.copy(tip);
    head.scale.setScalar(headScale * (0.85 + r() * 0.3));
    head.rotation.set((r() - 0.5) * 0.7 + Math.sin(a) * lean, r() * Math.PI * 2, (r() - 0.5) * 0.7 - Math.cos(a) * lean);
    g.add(head);
    if (i % 2 === 0) {
      // a leaf partway up
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.55, 4), new THREE.MeshLambertMaterial({ color: 0x4f8a4a, flatShading: true }));
      leaf.position.copy(tip).multiplyScalar(0.42);
      leaf.quaternion.setFromUnitVectors(up, new THREE.Vector3(Math.cos(a), 0.7, Math.sin(a)).normalize());
      g.add(leaf);
    }
  }
  return g;
}
