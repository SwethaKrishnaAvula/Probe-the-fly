import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { rng } from './random.js';
import { makeBouquet } from './props.js';
import { canvasTex, makePuffPool, cast, hash } from './kitchenProps.js';

// The larger set pieces of the kitchen: a dark hearth stove with a kettle and a bubbling pot, a stainless
// trough sink with a running tap and floating lemon slices, a small wooden landing table, a linen-covered
// side table for the pie, and the daisies on the window sill. Builders return a group and, when the piece
// moves, an update(t) (t in seconds).

// ------------------------------------------------------------------------------------------------
// Stove: dark brown iron range with a glowing firebox, a cream kettle and a cream pot. Too tall to fly over.
// ------------------------------------------------------------------------------------------------
export const STOVE = { w: 4.8, d: 3.2, height: 4.2 };

export function makeStove() {
  const g = new THREE.Group();
  const H = 2.3; // height of the range body
  const dark = new THREE.MeshStandardMaterial({ color: 0x4a2b1b, roughness: 0.55, metalness: 0.15 });
  const slabMat = new THREE.MeshStandardMaterial({ color: 0x5f3824, roughness: 0.3, metalness: 0.25 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x7c4c2c, roughness: 0.5, metalness: 0.2 });
  const front = -STOVE.d / 2;

  const body = new THREE.Mesh(new RoundedBoxGeometry(STOVE.w, H, STOVE.d, 3, 0.06), dark);
  body.position.y = H / 2;
  const slab = new THREE.Mesh(new RoundedBoxGeometry(STOVE.w + 0.25, 0.2, STOVE.d + 0.25, 3, 0.05), slabMat);
  slab.position.y = H + 0.1;
  g.add(body, slab);

  // A firebox opening, framed, with the fire showing and a door standing ajar.
  const OX = -0.5;
  const hole = new THREE.Mesh(new THREE.BoxGeometry(1.95, 1.2, 0.06), new THREE.MeshBasicMaterial({ color: 0x120805 }));
  hole.position.set(OX, 1.0, front - 0.01);
  g.add(hole);
  [
    [2.15, 0.1, 0, 0.62],
    [2.15, 0.1, 0, -0.62],
    [0.1, 1.34, -1.02, 0],
    [0.1, 1.34, 1.02, 0],
  ].forEach(([w, h, x, y]) => {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.1), trimMat);
    f.position.set(OX + x, 1.0 + y, front - 0.04);
    g.add(f);
  });
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.8, 1.05),
    new THREE.MeshBasicMaterial({
      map: canvasTex(64, 64, (ctx, w, h) => {
        const gr = ctx.createRadialGradient(w / 2, h, 4, w / 2, h, w * 0.7);
        gr.addColorStop(0, 'rgba(255,170,60,0.95)');
        gr.addColorStop(1, 'rgba(255,90,20,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, w, h);
      }),
      transparent: true,
      depthWrite: false,
    }),
  );
  glow.position.set(OX, 1.0, front - 0.06);
  glow.rotation.y = Math.PI;
  g.add(glow);
  const flames = [];
  const flameGeo = new THREE.ConeGeometry(0.24, 0.95, 5);
  [-0.65, -0.3, 0, 0.32, 0.62].forEach((x, i) => {
    const f = new THREE.Mesh(flameGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffb43c : 0xff7a1c }));
    f.position.set(OX + x, 0.72, front - 0.08);
    f.scale.set(0.9 + (i % 3) * 0.15, 1, 0.5);
    g.add(f);
    flames.push(f);
  });
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.6, 5), new THREE.MeshBasicMaterial({ color: 0xffe28a }));
  core.position.set(OX, 0.62, front - 0.1);
  g.add(core);
  const fireLight = new THREE.PointLight(0xff8a30, 4, 7, 2);
  fireLight.position.set(OX, 1.0, front - 0.8);
  g.add(fireLight);

  const door = new THREE.Group();
  door.position.set(OX + 1.45, 1.0, front - 0.05);
  door.rotation.y = -1.05; // swung open toward the viewer
  const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.3, 0.09), trimMat);
  leaf.position.x = -0.5;
  const knob = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd9c489, metalness: 0.7, roughness: 0.3 }));
  knob.position.set(-0.85, 0, -0.08);
  door.add(leaf, knob);
  g.add(door);

  // brand plate on the upper front
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.26),
    new THREE.MeshBasicMaterial({
      map: canvasTex(256, 60, (ctx, w, h) => {
        ctx.fillStyle = '#5a3520';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#d9b66a';
        ctx.lineWidth = 4;
        ctx.strokeRect(5, 5, w - 10, h - 10);
        ctx.fillStyle = '#e6c983';
        ctx.font = 'bold 30px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('HEARTH', w / 2, h / 2 + 2);
      }),
    }),
  );
  plate.position.set(1.15, 2.0, front - 0.012);
  plate.rotation.y = Math.PI;
  g.add(plate);

  // Cream enamel: warm, slightly self-lit so it reads like the illustration.
  const cream = new THREE.MeshStandardMaterial({ color: 0xe9d8b2, roughness: 0.65, emissive: 0x2a1c0a });
  const wood = new THREE.MeshStandardMaterial({ color: 0x6a3b26, roughness: 0.7 });
  const TOP = H + 0.2;

  // kettle on the left: round body, domed lid with a wooden knob, a tall spout, and a high arched handle
  const kettle = new THREE.Group();
  kettle.position.set(-1.45, TOP, 0.05);
  const kBody = new THREE.Mesh(new THREE.SphereGeometry(0.98, 30, 22), cream);
  kBody.scale.y = 0.9;
  kBody.position.y = 0.88;
  const kLid = new THREE.Mesh(new THREE.SphereGeometry(0.52, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), cream);
  kLid.scale.y = 0.55;
  kLid.position.y = 1.7;
  const kKnob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), wood);
  kKnob.position.y = 2.0;
  const kStem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.14, 10), wood);
  kStem.position.y = 1.9;
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 1.3, 12), cream);
  spout.position.set(0.98, 1.4, 0);
  spout.rotation.z = -0.7;
  const spoutTip = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.1, 0.12, 12), cream);
  spoutTip.position.set(1.42, 1.86, 0);
  spoutTip.rotation.z = -0.7;
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.98, 0.04, 8, 36, Math.PI), new THREE.MeshStandardMaterial({ color: 0xf3e7c8, roughness: 0.5 }));
  handle.position.y = 1.15;
  handle.rotation.z = 0.02;
  kettle.add(kBody, kLid, kKnob, kStem, spout, spoutTip, handle);
  g.add(kettle);

  // pot on the right: cream stew pot with wooden handles, a tilted glass lid, and noodles bubbling inside
  const pot = new THREE.Group();
  pot.position.set(1.4, TOP, 0.15);
  const pWall = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.92, 1.0, 36, 1, true), new THREE.MeshStandardMaterial({ color: 0xe9d8b2, roughness: 0.6, emissive: 0x2a1c0a, side: THREE.DoubleSide }));
  pWall.position.y = 0.5;
  const pBase = new THREE.Mesh(new THREE.CircleGeometry(0.92, 28).rotateX(-Math.PI / 2), cream);
  pBase.position.y = 0.02;
  const pRim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.055, 8, 36).rotateX(Math.PI / 2), cream);
  pRim.position.y = 1.0;
  pot.add(pWall, pBase, pRim);
  [-1, 1].forEach((s) => {
    const h = new THREE.Mesh(new RoundedBoxGeometry(0.6, 0.15, 0.2, 2, 0.05), wood);
    h.position.set(s * 1.28, 0.72, 0);
    h.rotation.z = s * -0.12;
    pot.add(h);
  });
  const stewTex = canvasTex(256, 256, (ctx, w, hh) => {
    const r = rng(4);
    ctx.fillStyle = '#d9a95a';
    ctx.fillRect(0, 0, w, hh);
    ctx.lineWidth = 6;
    for (let i = 0; i < 26; i++) {
      ctx.strokeStyle = i % 3 ? '#f3dfaa' : '#eccb84';
      ctx.beginPath();
      const x = r() * w;
      const y = r() * hh;
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + 40, y - 30, x + 50, y + 30, x + 90, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#c95b2b';
    for (let i = 0; i < 12; i++) ctx.fillRect(r() * w, r() * hh, 12, 9);
    ctx.fillStyle = '#5b9146';
    for (let i = 0; i < 14; i++) ctx.fillRect(r() * w, r() * hh, 9, 6);
  });
  const stew = new THREE.Mesh(new THREE.CircleGeometry(0.93, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: stewTex, roughness: 0.4 }));
  stew.position.y = 0.86;
  pot.add(stew);
  const bubbleGeo = new THREE.SphereGeometry(1, 10, 8);
  const bubbleMat = new THREE.MeshStandardMaterial({ color: 0xf2d992, roughness: 0.2 });
  const bubbles = Array.from({ length: 8 }, () => {
    const b = new THREE.Mesh(bubbleGeo, bubbleMat);
    pot.add(b);
    return b;
  });
  const lid = new THREE.Group();
  lid.position.set(0, 1.1, 0.72);
  lid.rotation.x = -0.75;
  lid.add(
    new THREE.Mesh(
      new THREE.CircleGeometry(0.98, 30),
      new THREE.MeshStandardMaterial({ color: 0xdde8ea, transparent: true, opacity: 0.35, roughness: 0.1, side: THREE.DoubleSide }),
    ),
  );
  const lidKnob = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), wood);
  lidKnob.position.z = 0.1;
  lid.add(lidKnob);
  pot.add(lid);
  g.add(pot);

  const potSteam = makePuffPool({ n: 8, size: 0.34, opacity: 0.3, rise: 3.2, drift: 0.5, period: 4, y0: TOP + 1.2, spread: 0.4 });
  potSteam.group.position.set(1.4, 0, 0.15);
  const kettleSteam = makePuffPool({ n: 4, size: 0.16, opacity: 0.32, rise: 1.4, drift: 0.4, period: 2.6, y0: TOP + 2.0, spread: 0.06 });
  kettleSteam.group.position.set(-1.45 + 1.5, 0, 0.05);
  g.add(potSteam.group, kettleSteam.group);
  cast(g);

  let flare = 0; // 0..1: the fire roars up (level 3, just before the fumes)
  return {
    group: g,
    // 0 = normal, 1 = fully flared: taller flames and a brighter glow.
    setFlare(k) {
      flare = k;
    },
    update(t) {
      flames.forEach((f, i) => {
        const k = (1 + 0.22 * Math.sin(t * 9 + i * 1.9) + 0.1 * Math.sin(t * 17 + i * 3.1)) * (1 + flare * 0.9);
        f.scale.y = k;
        f.position.y = 0.72 + (k - 1) * 0.28;
      });
      core.scale.y = 1 + 0.2 * Math.sin(t * 13);
      fireLight.intensity = 4 * (0.85 + 0.15 * Math.sin(t * 11) + 0.08 * Math.sin(t * 23)) * (1 + flare * 1.6);
      stew.rotation.y = t * 0.15;
      stew.position.y = 0.86 + 0.012 * Math.sin(t * 8);
      bubbles.forEach((b, i) => {
        const period = 0.8 + (i % 3) * 0.3;
        const k = Math.floor(t / period + i * 0.37);
        const ph = (t / period + i * 0.37) % 1;
        const a = hash(k, i) * Math.PI * 2;
        const rad = 0.2 + hash(i, k) * 0.6;
        const sz = 0.08 + hash(k, i + 9) * 0.07;
        const pop = Math.sin(Math.PI * ph);
        b.position.set(Math.cos(a) * rad, 0.87 + pop * 0.08, Math.sin(a) * rad);
        b.scale.set(sz * pop, sz * pop * 0.8, sz * pop);
      });
      lid.position.y = 1.1 + 0.015 * Math.sin(t * 14); // the lid rattles a little
      potSteam.update(t);
      kettleSteam.update(t);
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Sink: a square stainless basin set into the counter, with a tall arched tap behind it running a thin stream
// into the water. Lemon slices float and turn slowly. Centred on the origin; the tap stands behind (+z).
// ------------------------------------------------------------------------------------------------
export const SINK_DEPTH = 0.7;

export function makeSink({ size }) {
  const g = new THREE.Group();
  const w = size;
  const d = size;
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa6b2, roughness: 0.35, metalness: 0.5, emissive: 0x141a22, side: THREE.BackSide });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe4e9ee, roughness: 0.2, metalness: 0.85, emissive: 0x161a20 });

  const basin = new THREE.Mesh(new THREE.BoxGeometry(w, SINK_DEPTH, d), steel);
  basin.position.y = -SINK_DEPTH / 2;
  g.add(basin);
  // chrome rim around the opening, with rounded corners
  const rimH = 0.14;
  [
    [0.34, d + 0.68, -w / 2 - 0.02, 0],
    [0.34, d + 0.68, w / 2 + 0.02, 0],
    [w + 0.34, 0.34, 0, -d / 2 - 0.02],
    [w + 0.34, 0.34, 0, d / 2 + 0.02],
  ].forEach(([rw, rd, x, z]) => {
    const r = new THREE.Mesh(new RoundedBoxGeometry(rw, rimH, rd, 2, 0.06), chrome);
    r.position.set(x, rimH / 2 - 0.02, z);
    g.add(r);
  });

  // drain in the middle of the floor
  const drainMat = new THREE.MeshStandardMaterial({ color: 0xb3bbc4, metalness: 0.8, roughness: 0.3 });
  const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.46, 0.03, 24), drainMat);
  drain.position.set(0, -SINK_DEPTH + 0.02, 0);
  const drainRing = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 8, 24).rotateX(Math.PI / 2), drainMat);
  drainRing.position.set(0, -SINK_DEPTH + 0.04, 0);
  const grate = new THREE.Mesh(
    new THREE.CircleGeometry(0.38, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: canvasTex(64, 64, (ctx, ww, hh) => {
        ctx.fillStyle = '#8b939c';
        ctx.fillRect(0, 0, ww, hh);
        ctx.fillStyle = '#1e242b';
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.beginPath();
          ctx.arc(32 + Math.cos(a) * 11, 32 + Math.sin(a) * 11, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }),
    }),
  );
  grate.position.set(0, -SINK_DEPTH + 0.045, 0);
  g.add(drain, drainRing, grate);

  // water surface with a little swell, plus pale streaks that drift across it
  const WATER_Y = -0.27;
  const waterGeo = new THREE.PlaneGeometry(w - 0.1, d - 0.1, 12, 12).rotateX(-Math.PI / 2);
  const wp = waterGeo.attributes.position;
  const base = Float32Array.from(wp.array);
  const water = new THREE.Mesh(
    waterGeo,
    new THREE.MeshStandardMaterial({ color: 0x4fb4e6, transparent: true, opacity: 0.72, roughness: 0.08, metalness: 0.1, emissive: 0x0b2c44 }),
  );
  water.position.y = WATER_Y;
  g.add(water);
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
  flowTex.repeat.set(3, 2);
  const flow = new THREE.Mesh(
    new THREE.PlaneGeometry(w - 0.1, d - 0.1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: flowTex, transparent: true, opacity: 0.35, depthWrite: false }),
  );
  flow.position.y = WATER_Y + 0.02;
  g.add(flow);

  // lemon slices: rind, pith and eight segments
  const lemonTex = canvasTex(128, 128, (ctx) => {
    ctx.translate(64, 64);
    ctx.fillStyle = '#f2c530';
    ctx.beginPath();
    ctx.arc(0, 0, 62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff4c8';
    ctx.beginPath();
    ctx.arc(0, 0, 55, 0, Math.PI * 2);
    ctx.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.fillStyle = '#f8d24a';
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 6, Math.sin(a) * 6);
      ctx.arc(0, 0, 49, a + 0.06, a + Math.PI / 4 - 0.06);
      ctx.closePath();
      ctx.fill();
    }
  });
  const lemonGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.05, 24);
  const lemonMats = [new THREE.MeshStandardMaterial({ color: 0xf0b820, roughness: 0.4 }), new THREE.MeshStandardMaterial({ map: lemonTex, roughness: 0.4 }), new THREE.MeshStandardMaterial({ color: 0xf0b820 })];
  const spots = [[-1.1, -1.0], [0.9, -1.3], [-1.3, 0.6], [1.2, 0.5], [-0.2, 1.4], [0.2, -0.3], [1.3, 1.5]];
  const lemons = spots.map(([x, z], i) => {
    const m = new THREE.Mesh(lemonGeo, lemonMats);
    m.userData = { x: x * (w / 4.2), z: z * (d / 4.2), ph: i * 1.3 };
    g.add(m);
    return m;
  });

  // Tall arched tap on the counter behind the sink: a post, a big arc over the basin, a spout pointing down.
  const zb = d / 2 + 0.95; // post position
  const R = 0.9;
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.15, 2.7, 16), chrome);
  post.position.set(0, 1.35, zb);
  const baseRing = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.2, 18), chrome);
  baseRing.position.set(0, 0.1, zb);
  const arc = new THREE.Mesh(new THREE.TorusGeometry(R, 0.12, 12, 24, Math.PI).rotateY(-Math.PI / 2), chrome);
  arc.position.set(0, 2.7, zb - R);
  const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.6, 14), chrome);
  spout.position.set(0, 2.4, zb - 2 * R);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.16, 14), chrome);
  nozzle.position.set(0, 2.06, zb - 2 * R);
  const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8).rotateZ(Math.PI / 2.3), chrome);
  lever.position.set(0.32, 2.0, zb);
  g.add(post, baseRing, arc, spout, nozzle, lever);

  const zs = zb - 2 * R; // where the water leaves the spout
  const fallTex = flowTex.clone();
  fallTex.needsUpdate = true;
  fallTex.repeat.set(1, 3);
  const fallH = 2.0 - WATER_Y;
  const fall = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.055, fallH, 8, 1, true),
    new THREE.MeshBasicMaterial({ map: fallTex, color: 0xcfeefc, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }),
  );
  fall.position.set(0, WATER_Y + fallH / 2, zs);
  const splash = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.26, 20).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false }),
  );
  splash.position.set(0, WATER_Y + 0.03, zs);
  g.add(fall, splash);
  const spray = makePuffPool({ n: 3, size: 0.1, opacity: 0.35, rise: 0.5, drift: 0, period: 1.4, y0: WATER_Y + 0.1, spread: 0.12 });
  spray.group.position.set(0, 0, zs);
  g.add(spray.group);

  cast(g, false);
  return {
    group: g,
    update(t) {
      for (let i = 0; i < wp.count; i++) {
        const x = base[i * 3];
        const z = base[i * 3 + 2];
        const nearFall = Math.exp(-((x * x + (z - zs) * (z - zs)) / 0.6));
        wp.setY(i, 0.03 * Math.sin(x * 2.1 + t * 1.6) + 0.025 * Math.sin(z * 1.3 - t * 1.2) + nearFall * 0.04 * Math.sin(t * 9 - Math.hypot(x, z - zs) * 6));
      }
      wp.needsUpdate = true;
      flowTex.offset.set(0.02 * t, -(t * 0.05) % 1);
      fallTex.offset.y = (t * 1.8) % 1;
      lemons.forEach((m) => {
        const { x, z, ph } = m.userData;
        m.position.set(x + 0.18 * Math.sin(t * 0.5 + ph), WATER_Y + 0.05 + 0.02 * Math.sin(t * 1.3 + ph), z + 0.15 * Math.cos(t * 0.4 + ph));
        m.rotation.y = t * 0.2 + ph;
        m.rotation.x = 0.06 * Math.sin(t * 0.9 + ph);
      });
      splash.scale.setScalar(1 + 0.25 * Math.sin(t * 7));
      spray.update(t);
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Tables. Both are slabs flush with the counter, so the fly walks straight onto them.
// ------------------------------------------------------------------------------------------------
export const TABLE_TOP = 0.1;

// The landing table: warm planks with a lace doily where the fly touches down.
export function makeLandingTable({ w, d }) {
  const g = new THREE.Group();
  const plankTex = canvasTex(128, 128, (ctx, ww, hh) => {
    const r = rng(12);
    for (let i = 0; i < 6; i++) {
      const tone = 150 + Math.floor(r() * 30);
      ctx.fillStyle = `rgb(${tone + 20},${tone - 10},${tone - 55})`;
      ctx.fillRect(0, (i * hh) / 6, ww, hh / 6);
      ctx.fillStyle = 'rgba(80,45,20,0.45)';
      ctx.fillRect(0, (i * hh) / 6, ww, 2);
      ctx.strokeStyle = 'rgba(90,50,20,0.25)';
      for (let k = 0; k < 4; k++) {
        ctx.beginPath();
        const y = (i * hh) / 6 + 4 + r() * (hh / 6 - 8);
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(ww * 0.3, y + 2, ww * 0.6, y - 2, ww, y + 1);
        ctx.stroke();
      }
    }
  }, { repeat: [w / 4, d / 4] });
  const top = new THREE.Mesh(new RoundedBoxGeometry(w, TABLE_TOP, d, 2, 0.03), new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.7 }));
  top.position.y = TABLE_TOP / 2;
  g.add(top);
  const doilyTex = canvasTex(128, 128, (ctx, ww, hh) => {
    ctx.translate(64, 64);
    ctx.fillStyle = '#fbf6ea';
    ctx.beginPath();
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const r = 60 + (i % 2 ? -5 : 0);
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#d8ccb0';
    ctx.lineWidth = 2;
    [50, 38, 22].forEach((r) => {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.fillStyle = '#d8ccb0';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * 44, Math.sin(a) * 44, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  const doily = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: doilyTex, transparent: true, roughness: 0.9 }));
  doily.position.y = TABLE_TOP + 0.006;
  doily.userData.isDoily = true;
  g.userData.doily = doily;
  g.add(doily);
  cast(g);
  return g;
}

// The pie's side table: a cream linen top over a deep green cloth that drapes down the front and sides, with
// a blue plate and knife, a syrup bottle on a round board, a jar of butter and a small bowl at the corners.
export function makePieTable({ w, d, decorate = null }) {
  const g = new THREE.Group();
  const cloth = new THREE.MeshStandardMaterial({ color: 0x33503f, roughness: 0.95, side: THREE.DoubleSide });
  const green = new THREE.Mesh(new THREE.BoxGeometry(w, TABLE_TOP, d), cloth);
  green.position.y = TABLE_TOP / 2;
  const linen = new THREE.Mesh(
    new THREE.BoxGeometry(w - 0.9, 0.03, d - 0.9),
    new THREE.MeshStandardMaterial({
      map: canvasTex(128, 128, (ctx, ww, hh) => {
        ctx.fillStyle = '#f1e4d0';
        ctx.fillRect(0, 0, ww, hh);
        const r = rng(3);
        ctx.strokeStyle = 'rgba(190,160,130,0.35)';
        for (let i = 0; i < 40; i++) {
          ctx.beginPath();
          const y = r() * hh;
          ctx.moveTo(0, y);
          ctx.lineTo(ww, y + (r() - 0.5) * 6);
          ctx.stroke();
        }
      }, { repeat: [w / 4, d / 4] }),
      roughness: 0.95,
    }),
  );
  linen.position.y = TABLE_TOP + 0.015;
  g.add(green, linen);

  // draped cloth: rippled curtains hanging off the front and both sides
  const drape = (len, rotY, x, z) => {
    const geo = new THREE.PlaneGeometry(len, 2.4, 28, 6);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const depth = (1.2 - p.getY(i)) / 2.4; // 0 at the top edge, 1 at the hem
      p.setZ(i, Math.sin(p.getX(i) * 2.4 + depth * 1.5) * 0.09 * depth + 0.05 * depth);
      p.setY(i, p.getY(i) - depth * 0.1 * Math.abs(Math.sin(p.getX(i) * 1.7)));
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, cloth);
    m.position.set(x, TABLE_TOP - 1.2, z);
    m.rotation.y = rotY;
    m.castShadow = true;
    g.add(m);
  };
  drape(w, Math.PI, 0, -d / 2);
  drape(d, -Math.PI / 2, w / 2, 0);
  drape(d, Math.PI / 2, -w / 2, 0);

  // blue plate with a butter knife, at the back corner
  const plate = new THREE.Group();
  plate.position.set(-w / 2 + 1.5, TABLE_TOP + 0.03, d / 2 - 1.3);
  plate.add(
    new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 0.75, 0.09, 30),
      new THREE.MeshStandardMaterial({
        map: canvasTex(128, 128, (ctx, ww, hh) => {
          ctx.fillStyle = '#3f74b8';
          ctx.fillRect(0, 0, ww, hh);
          ctx.fillStyle = '#e9f0fa';
          ctx.beginPath();
          ctx.ellipse(64, 64, 34, 20, 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(40, 90, 16, 10, -0.4, 0, Math.PI * 2);
          ctx.fill();
        }),
        roughness: 0.3,
      }),
    ),
  );
  const knife = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 1.15), new THREE.MeshStandardMaterial({ color: 0xdfe6ea, metalness: 0.8, roughness: 0.25 }));
  knife.position.set(0.15, 0.09, -0.05);
  knife.rotation.y = 0.25;
  plate.add(knife);
  g.add(plate);

  // syrup bottle on a round wooden board, at the front corner
  const board = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 28), new THREE.MeshStandardMaterial({ color: 0xd98d3c, roughness: 0.6 }));
  board.position.set(w / 2 - 1.4, TABLE_TOP + 0.07, -d / 2 + 1.3);
  const bottle = new THREE.Mesh(
    new THREE.LatheGeometry(
      [[0, 0], [0.34, 0], [0.38, 0.1], [0.38, 0.85], [0.2, 1.15], [0.16, 1.35], [0.19, 1.4], [0.15, 1.4], [0.12, 1.3]].map(([x, y]) => new THREE.Vector2(x, y)),
      22,
    ),
    new THREE.MeshStandardMaterial({ color: 0xb35a1e, roughness: 0.12, transparent: true, opacity: 0.88, side: THREE.DoubleSide }),
  );
  bottle.position.copy(board.position);
  bottle.position.y += 0.04;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.13, 0.22, 12), new THREE.MeshStandardMaterial({ color: 0xd9b56a }));
  cork.position.copy(bottle.position);
  cork.position.y += 1.5;
  g.add(board, bottle, cork);

  // butter jar and a small white bowl beside the syrup
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.55, 18), new THREE.MeshStandardMaterial({ color: 0xcfe6e2, transparent: true, opacity: 0.55, roughness: 0.1 }));
  jar.position.set(w / 2 - 2.7, TABLE_TOP + 0.3, -d / 2 + 0.9);
  const butter = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.34, 0.34, 2, 0.05), new THREE.MeshStandardMaterial({ color: 0xf0d27a, roughness: 0.5 }));
  butter.position.copy(jar.position);
  butter.position.y -= 0.08;
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xf6f2e8, roughness: 0.35, side: THREE.DoubleSide }));
  bowl.position.set(w / 2 - 3.6, TABLE_TOP + 0.42, -d / 2 + 0.7);
  g.add(jar, butter, bowl);
  // a level with no pie has something else in the middle of the table
  if (decorate) g.add(decorate);
  cast(g);
  return g;
}

// ------------------------------------------------------------------------------------------------
// Window sill: a wooden ledge under the window with a jar and a jug of daisies, a plate of apples and a herb pot.
// Centred on x = 0 in world x; items are placed in world x (json x is the negative).
// ------------------------------------------------------------------------------------------------
export function makeSillFlowers({ w, d, jarX, jugX, plateX, potX }) {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0xb9854a, roughness: 0.7 });
  const board = new THREE.Mesh(new RoundedBoxGeometry(w, 0.16, d, 2, 0.04), wood);
  board.position.y = 0.08;
  g.add(board);
  const deck = 0.16;

  const glass = new THREE.MeshStandardMaterial({ color: 0xb4e0dc, roughness: 0.05, transparent: true, opacity: 0.32, side: THREE.DoubleSide });
  const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 1.5, 24, 1, true), glass);
  jar.position.set(jarX, deck + 0.75, 0);
  const jarBase = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), glass);
  jarBase.position.set(jarX, deck + 0.02, 0);
  const water = new THREE.Mesh(new THREE.CylinderGeometry(0.56, 0.5, 1.0, 24), new THREE.MeshStandardMaterial({ color: 0x8fd2cf, roughness: 0.1, transparent: true, opacity: 0.4 }));
  water.position.set(jarX, deck + 0.52, 0);
  g.add(jar, jarBase, water);
  const bouquet = makeBouquet({ count: 9, length: 2.3, spread: 0.55, seed: 5, headScale: 0.4 });
  bouquet.position.set(jarX, deck + 0.7, 0);
  g.add(bouquet);

  const jug = new THREE.Mesh(
    new THREE.LatheGeometry(
      [[0, 0], [0.42, 0], [0.5, 0.35], [0.5, 0.7], [0.34, 0.95], [0.3, 1.15], [0.36, 1.2], [0.28, 1.2], [0.24, 1.1]].map(([x, y]) => new THREE.Vector2(x, y)),
      24,
    ),
    new THREE.MeshStandardMaterial({ color: 0xe9e5da, roughness: 0.35, side: THREE.DoubleSide }),
  );
  jug.position.set(jugX, deck, -0.1);
  g.add(jug);
  const small = makeBouquet({ count: 6, length: 1.6, spread: 0.5, seed: 9, headScale: 0.36 });
  small.position.set(jugX, deck + 1.1, -0.1);
  g.add(small);

  // plate of apples
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.5, 0.06, 24), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.35 }));
  plate.position.set(plateX, deck + 0.03, 0.1);
  g.add(plate);
  [[-0.2, 0xc9382a], [0.2, 0xe4b04a]].forEach(([dx, color]) => {
    const a = new THREE.Mesh(new THREE.SphereGeometry(0.27, 14, 10), new THREE.MeshStandardMaterial({ color, roughness: 0.35 }));
    a.scale.y = 0.9;
    a.position.set(plateX + dx, deck + 0.3, 0.1 + dx * 0.3);
    g.add(a);
  });

  // a terracotta pot of basil at the far end
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.3, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xc46a3c, roughness: 0.8 }));
  pot.position.set(potX, deck + 0.25, 0);
  g.add(pot);
  const rr = rng(21);
  for (let i = 0; i < 9; i++) {
    const leaf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 + rr() * 0.1, 0), new THREE.MeshStandardMaterial({ color: 0x4f9a48, roughness: 0.7, flatShading: true }));
    leaf.position.set(potX + (rr() - 0.5) * 0.6, deck + 0.6 + rr() * 0.4, (rr() - 0.5) * 0.6);
    g.add(leaf);
  }
  cast(g);
  return { group: g, bouquets: [bouquet, small] };
}
