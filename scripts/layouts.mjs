// Checks (and generates) the kitchen's alternative layouts. Run from the repo root:
//   node scripts/layouts.mjs            check the original and every variant in src/kitchenVariants.js
//   node scripts/layouts.mjs --generate write new variants to src/kitchenVariants.js, then check them
//
// A variant moves the movable items but keeps the start, the pie, the sink and the sill, so the same hotspot clicks must
// still win. "Still win" is proven here, not assumed: the intended clicks are replayed against the layout's solid pieces
// with the game's own movement numbers (behaviors.js), starting at every one of 36 phases of the rolling fruit (a player
// can click at any moment), with extra clearance. Any bonk, soak or miss fails the layout.
// Re-run it after changing FLY_DIST, TURN_*, a start or pie in kitchenScenes.js, or a prop's size.
import { readFileSync, writeFileSync } from 'node:fs';
import { SCENES, sceneFor } from '../src/kitchenScenes.js';
import { VARIANTS } from '../src/kitchenVariants.js';
import { FLY_DIST, FLY_MS, TURN_RAD, TURN_MS, TURN_FORWARD, FLY_LIFT, TURN_LIFT, TRACK_MS, TRACK_DIST } from '../src/behaviors.js';

// ---- constants that live in files three.js keeps out of node: read from the source so they cannot drift ----
const grab = (file, re, what) => {
  const m = readFileSync(new URL(file, import.meta.url), 'utf8').match(re);
  if (!m) throw new Error(`could not read ${what} from ${file}`);
  return m.slice(1).map(Number);
};
const [STOVE_W, STOVE_D, STOVE_H] = grab('../src/kitchenSets.js', /STOVE = \{ w: ([\d.]+), d: ([\d.]+), height: ([\d.]+) \}/, 'STOVE');
const [PIE_R] = grab('../src/kitchenProps.js', /PIE_R = ([\d.]+)/, 'PIE_R');
const [FLY_R] = grab('../src/collisions.js', /FLY_R = ([\d.]+)/, 'FLY_R');
const [FRUIT_R] = grab('../src/kitchen.js', /FRUIT_R = ([\d.]+)/, 'FRUIT_R');
const [ROLL_S] = grab('../src/kitchen.js', /ROLL_PERIOD_S = ([\d.]+)/, 'ROLL_PERIOD_S');
const [PIE_WIN] = [PIE_R + 0.5]; // levels.json pie_radius is 0.5 in every level
const [LAND_W, LAND_D] = [2.8, 4.0]; // the landing and pie tables (kitchen.js buildTables)
const [PIE_TABLE_W, PIE_TABLE_D] = [7.6, 5.6];
const BOUNDS_X = [-11.2, 16.2];
const BOUNDS_Z = [-3.2, 9.0];
const SILL_Z = 9.4 - 0.95;
const COUNTER_FRONT = -3.6; // the counter's front edge (kitchen.js COUNTER); the sill items stand at SILL_Z at the back
const BELLY = 0.1, SOAK_LIFT = 0.1, FLY_Y = 0.13;
const CLEARANCE = 0.5; // extra room a variant's route must have (the original is only held to the game's own FLY_R)

const tw = (x, z) => [-x, z]; // coords.js toWorld
const smooth = (p) => p * p * (3 - 2 * p);
const env = (p, e = 0.2) => smooth(Math.max(0, Math.min(1, p / e, (1 - p) / e)));

// ---- the world for a scene: the same solid pieces kitchen.js builds ----
export function buildWorld(scene, levelId) {
  const F = scene.mirrored ? -1 : 1;
  const col = [];
  let sink = null;
  const own = (owner) => (c) => (col.push({ owner, ...c }), c);
  scene.items.forEach((it, i) => {
    const add = own(i);
    if (it.type === 'stove') {
      const [x, z] = tw(F * it.x, it.z);
      add({ kind: 'stove', type: 'box', cx: x, cz: z, hx: STOVE_W / 2 + 0.1, hz: STOVE_D / 2 + 0.1, rot: -F * it.yaw, h: STOVE_H });
    } else if (it.type === 'wall') {
      const yw = F * it.yaw, span = (it.n + (it.rows > 1 ? 0.5 : 0)) / 2;
      const [x, z] = tw(F * it.x, it.z);
      add({ kind: 'cheese', type: 'box', cx: x, cz: z, hx: it.along === 'x' ? span : 0.5, hz: it.along === 'z' ? span : 0.5, rot: -yw, h: it.rows * 0.96 });
    } else if (it.type === 'hurdle') {
      const [x, z] = tw(F * it.x, it.z);
      add({ kind: 'hurdle', type: 'box', cx: x, cz: z, hx: it.w / 2 + 0.4, hz: 0.4, rot: -F * it.yaw, h: 0.92 });
    } else if (it.type === 'fruit') {
      it.lanes.forEach((l, k) => {
        const [x] = tw(F * l.x, 0);
        add({ kind: 'fruit', type: 'circle', cx: x, cz: l.z[0], r: FRUIT_R, h: FRUIT_R * 2, range: l.z, phase: k * 2.1 });
      });
    } else if (it.type === 'saltbox') {
      for (let k = 0; k < (it.n ?? 1); k++) {
        const a1 = (k - ((it.n ?? 1) - 1) / 2) * 1.05, yaw = it.yaw ?? 0;
        const [x, z] = tw(F * it.x + a1 * Math.cos(F * yaw), it.z - a1 * Math.sin(F * yaw));
        add({ kind: 'salt box', type: 'box', cx: x, cz: z, hx: 0.5, hz: 0.34, rot: -F * yaw + (k % 2 ? 0.12 : -0.08), h: 1.5 });
      }
    } else if (it.type === 'bowl') {
      const [x, z] = tw(F * it.x, it.z);
      add({ kind: 'bowl', type: 'circle', cx: x, cz: z, r: 0.95, h: 0.7 });
    } else if (it.type === 'sink') {
      const [cx] = tw(F * it.x, 0);
      sink = { x0: cx - 2.1, x1: cx + 2.1, z0: it.z - 2.1, z1: it.z + 2.1 };
    }
  });
  if (scene.board) {
    const [bx, bz] = tw(F * scene.board[0], scene.board[2]);
    const th = 0.06, lx = -0.7, lz = -0.3;
    col.push({ owner: 'board', kind: 'chopping board', type: 'box', cx: bx + lx * Math.cos(th) + lz * Math.sin(th), cz: bz - lx * Math.sin(th) + lz * Math.cos(th), hx: 3.3, hz: 1.9, rot: th, h: 1.7 });
  }
  const cxw = tw(F * scene.sill.cx, 0)[0], at = (j) => tw(F * j, 0)[0] - cxw;
  for (const [kind, dx, dz, r, h] of [['vase', 0, 0, 0.65, 2.6], ['jug', 1.4, -0.1, 0.5, 2.6], ['plate of apples', 2.8, 0.1, 0.62, 0.6], ['basil pot', 4.1, 0, 0.42, 1.1]]) {
    col.push({ owner: 'sill', kind, type: 'circle', cx: cxw + at(scene.sill.flowers + dx), cz: SILL_Z + dz, r, h });
  }
  const bw = [tw(F * BOUNDS_X[0], 0)[0], tw(F * BOUNDS_X[1], 0)[0]];
  const start = tw(F * scene.start[0], scene.start[2]);
  const pie = scene.hasPie ? tw(F * scene.pie[0], scene.pie[2]) : null;
  return {
    F, col, sink,
    movers: col.filter((c) => c.range),
    bounds: { minX: Math.min(...bw), maxX: Math.max(...bw), minZ: BOUNDS_Z[0], maxZ: BOUNDS_Z[1] },
    start, pie,
    tables: [
      { cx: start[0], cz: start[1], hx: LAND_W / 2, hz: LAND_D / 2 },
      { cx: tw(F * scene.pie[0], 0)[0], cz: scene.pie[2], hx: PIE_TABLE_W / 2, hz: PIE_TABLE_D / 2 },
    ],
    _target: levelId === 'level_5_threshold' ? { x: tw(F * scene.sill.flowers, 0)[0], z: SILL_Z } : null,
  };
}

const overlapsFly = (c, px, pz, R) => {
  const dx = px - c.cx, dz = pz - c.cz;
  if (c.type === 'circle') return Math.hypot(dx, dz) < c.r + R;
  const cs = Math.cos(c.rot), sn = Math.sin(c.rot);
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;
  const ex = lx - Math.max(-c.hx, Math.min(c.hx, lx)), ez = lz - Math.max(-c.hz, Math.min(c.hz, lz));
  return ex * ex + ez * ez < R * R;
};

// ---- one behavior, frame by frame, as behaviors.js + collisions.js play it ----
const STEP_MS = { walk_forward: FLY_MS, turn_left: TURN_MS, turn_right: TURN_MS, object_track: TRACK_MS, approach_odor: 1700 };
function runStep(W, s, b, t0, R) {
  let { x, z, rot } = s;
  const from = rot;
  const head = W._target ? Math.atan2(W._target.x - x, W._target.z - z) : rot;
  const delta = Math.atan2(Math.sin(head - from), Math.cos(head - from));
  const dur = STEP_MS[b];
  const adv = (d) => {
    x += Math.sin(rot) * d; z += Math.cos(rot) * d;
    const B = W.bounds;
    if (x < B.minX || x > B.maxX || z < B.minZ || z > B.maxZ) {
      x = Math.min(B.maxX, Math.max(B.minX, x)); z = Math.min(B.maxZ, Math.max(B.minZ, z));
      return true;
    }
    return false;
  };
  const dt = 20;
  let t = 0, pp = 0;
  while (pp < 1) {
    t += dt;
    const p = Math.min(1, t / dur), dp = p - pp;
    pp = p;
    let lift = 0, halt = false;
    if (b === 'walk_forward') { lift = FLY_LIFT * env(p, 0.15); halt = adv(FLY_DIST * dp); }
    else if (b === 'turn_left' || b === 'turn_right') {
      const d = b === 'turn_left' ? 1 : -1;
      lift = TURN_LIFT * env(p, 0.25); rot += d * TURN_RAD * dp; halt = adv(TURN_FORWARD * dp);
    } else if (b === 'object_track') {
      lift = FLY_LIFT * env(p, 0.2);
      rot = from + delta * smooth(Math.min(1, p / 0.4));
      if (p >= 0.25) { if (W._target && Math.hypot(W._target.x - x, W._target.z - z) < 2.2) halt = true; else halt = adv((TRACK_DIST * dp) / 0.75); }
    } else if (b === 'approach_odor') {
      rot = from + delta * smooth(Math.min(1, p / 0.4)); // a walk: no lift, so the low pieces are in the way too
      if (p >= 0.3) { if (W._target && Math.hypot(W._target.x - x, W._target.z - z) < 2.2) halt = true; else halt = adv(2.4 * (dp / 0.7)); }
    }
    const T = (t0 + t) / 1000;
    for (const m of W.movers) {
      const mid = (m.range[0] + m.range[1]) / 2, half = (m.range[1] - m.range[0]) / 2;
      m.cz = mid - half * Math.cos((T / ROLL_S) * 2 * Math.PI + m.phase);
    }
    const belly = FLY_Y + lift + BELLY, r = W.sink;
    if (r && lift < SOAK_LIFT && x > r.x0 + 0.15 && x < r.x1 - 0.15 && z > r.z0 + 0.15 && z < r.z1 - 0.15) return { x, z, rot, res: 'soaked in the sink' };
    for (const c of W.col) if (belly < c.h && overlapsFly(c, x, z, R)) return { x, z, rot, res: `hit the ${c.kind}` };
    if (halt) break;
  }
  return { x, z, rot, res: 'ok' };
}

// The clicks that win each level, with the game's numbers. (Level 5 wins on the clicks alone, in either order, but the
// two pursuit moves must still be flyable: a bonk there would cost the player the level's mood, not the level.)
const ROUTES = {
  level_2_pie: [['turn_right', 'walk_forward', 'walk_forward']],
  level_3_shadow: [['turn_right', 'walk_forward', 'walk_forward']],
  level_4_lesion: [['turn_right', 'turn_right', 'turn_right', 'walk_forward']],
  level_5_threshold: [['object_track', 'approach_odor'], ['approach_odor', 'object_track']],
};

export function checkRoute(scene, levelId, R) {
  const problems = [];
  for (const route of ROUTES[levelId]) {
    const W = buildWorld(scene, levelId);
    let s = { x: W.start[0], z: W.start[1], rot: 0 };
    for (const b of route) {
      let next = null;
      for (let t0 = 0; t0 < ROLL_S * 1000; t0 += 250) { // a click can land at any phase of the rolling fruit
        const r = runStep(W, s, b, t0, R);
        if (r.res !== 'ok') { problems.push(`${route.join('>')}: ${b} ${r.res} (fruit phase ${t0} ms)`); break; }
        next = r;
      }
      if (!next) break;
      s = next;
    }
    if (W.pie && !problems.length && Math.hypot(s.x - W.pie[0], s.z - W.pie[1]) > PIE_WIN) problems.push(`${route.join('>')}: ends ${Math.hypot(s.x - W.pie[0], s.z - W.pie[1]).toFixed(2)} from the pie (needs <= ${PIE_WIN})`);
  }
  return problems;
}

// ---- layout sanity: nothing on top of anything else, nothing off the counter ----
function corners(c, m = 0) {
  const cs = Math.cos(c.rot ?? 0), sn = Math.sin(c.rot ?? 0), hx = c.hx + m, hz = c.hz + m;
  return [[-hx, -hz], [hx, -hz], [hx, hz], [-hx, hz]].map(([lx, lz]) => [c.cx + lx * cs + lz * sn, c.cz - lx * sn + lz * cs]);
}
function overlap2(a, b, m) {
  const A = a.type === 'circle' ? { ...a, hx: a.r, hz: a.r, rot: 0 } : a;
  const B = b.type === 'circle' ? { ...b, hx: b.r, hz: b.r, rot: 0 } : b;
  if (a.type === 'circle' && b.type === 'circle') return Math.hypot(a.cx - b.cx, a.cz - b.cz) < a.r + b.r + m;
  const pa = corners(A, m / 2), pb = corners(B, m / 2);
  const axes = [0, 1].flatMap((i) => [pa, pb].map((P) => { const e = [P[i + 1][0] - P[i][0], P[i + 1][1] - P[i][1]], n = Math.hypot(...e); return [-e[1] / n, e[0] / n]; }));
  return axes.every(([ax, az]) => {
    const pr = (P) => P.map(([x, z]) => x * ax + z * az);
    const [a0, a1, b0, b1] = [Math.min(...pr(pa)), Math.max(...pr(pa)), Math.min(...pr(pb)), Math.max(...pr(pb))];
    return a1 > b0 && b1 > a0; // the projections overlap on this axis
  });
}
const sweep = (c) => (c.range ? { type: 'box', cx: c.cx, cz: (c.range[0] + c.range[1]) / 2, hx: c.r, hz: (c.range[1] - c.range[0]) / 2 + c.r, rot: 0 } : c);

export function checkSanity(scene, levelId) {
  const W = buildWorld(scene, levelId);
  const problems = [];
  const shapes = W.col.filter((c) => c.owner !== 'sill').map((c) => ({ ...c, s: sweep(c) }));
  const { minX, maxX } = W.bounds;
  for (const c of shapes) {
    const P = c.s.type === 'circle' ? [[c.s.cx - c.s.r, c.s.cz - c.s.r], [c.s.cx + c.s.r, c.s.cz + c.s.r]] : corners(c.s);
    const xs = P.map((p) => p[0]), zs = P.map((p) => p[1]);
    if (Math.min(...xs) < minX + 0.2 || Math.max(...xs) > maxX - 0.2 || (c.owner !== 'board' && Math.min(...zs) < COUNTER_FRONT - 0.05) || (!c.range && Math.max(...zs) > SILL_Z - 0.65)) problems.push(`${c.kind} is off the counter`); // (a rolling fruit may roll right back to the sill; the chopping hand already overhangs the front edge)
  }
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      if (shapes[i].owner === shapes[j].owner) continue;
      if (overlap2(shapes[i].s, shapes[j].s, 0.25)) problems.push(`${shapes[i].kind} overlaps ${shapes[j].kind}`);
    }
    for (const t of W.tables) if (overlap2(shapes[i].s, { type: 'box', ...t, rot: 0 }, 0)) problems.push(`${shapes[i].kind} sits on a table`);
    if (W.sink && overlap2(shapes[i].s, { type: 'box', cx: (W.sink.x0 + W.sink.x1) / 2, cz: (W.sink.z0 + W.sink.z1) / 2, hx: 2.1, hz: 2.1, rot: 0 }, 0.2)) problems.push(`${shapes[i].kind} is over the sink`);
  }
  return [...new Set(problems)];
}

// ---- generation ----
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 20) / 20;

const between = (rand, a, b) => a + rand() * (b - a);
// One movable item somewhere new. The sink (the counter's cut-out) and level 3's stove (the shadow's source) stay put.
const isFixed = (it, levelId) => it.type === 'sink' || (it.type === 'stove' && levelId === 'level_3_shadow');
function sampleItem(it, rand) {
  const x = r1(between(rand, -9.5, 14.5));
  if (it.type === 'stove') return { ...it, x: r1(between(rand, -6, 9)), yaw: r2(between(rand, -0.05, 0.05)) }; // z stays: it stands against the back
  if (it.type === 'fruit') return { ...it, lanes: it.lanes.map((l) => ({ ...l, x: r1(between(rand, -9, 14)) })) };
  if (it.type === 'wall') return { ...it, x, z: r1(between(rand, -0.5, 6.2)), yaw: r2(between(rand, -0.35, 0.35)), along: rand() < 0.5 ? 'x' : 'z' };
  if (it.type === 'hurdle') return { ...it, x, z: r1(between(rand, -0.5, 6.5)), yaw: r2(between(rand, -0.4, 0.4)) };
  return { ...it, x, z: r1(between(rand, 0.5, 6.6)) }; // salt boxes, bowl
}
const sizeRank = { wall: 0, stove: 1, hurdle: 2, fruit: 3, saltbox: 4, bowl: 5, sink: -1 };
const moved = (a, b) => {
  let total = 0, count = 0;
  a.items.forEach((it, i) => {
    const o = b.items[i];
    const d = it.type === 'fruit' ? Math.abs(it.lanes[0].x - o.lanes[0].x) : Math.hypot((it.x ?? 0) - (o.x ?? 0), (it.z ?? 0) - (o.z ?? 0));
    total += d; if (d >= 2) count++;
  });
  return { total, count };
};

// Lay a level out afresh, one piece at a time: each must sit clear of what is already down (and off the tables and sink)
// AND leave the winning clicks a clear flight. Placing piece by piece is what makes a crowded level (4) possible at all.
function layOut(base, levelId, rand, why) {
  const no = (k) => { why[k] = (why[k] || 0) + 1; };
  const items = base.items.map((it) => (isFixed(it, levelId) ? { ...it } : null));
  const trial = (board) => ({ ...base, board, items: items.filter(Boolean) });
  let board = base.board;
  const ok = (b) => {
    const sc = trial(b);
    const sane = checkSanity(sc, levelId);
    if (sane.length) { no('layout: ' + sane[0].replace(/^.* (overlaps|sits on|is over|is off)/, '$1')); return false; }
    const route = checkRoute(sc, levelId, FLY_R + CLEARANCE);
    if (route.length) { no('route: ' + route[0].replace(/\(fruit.*$/, '').replace(/^[a-z_>]+: /, '')); return false; }
    return true;
  };
  if (base.board) { // the chopping hand goes first: it is the biggest thing
    let placed = false;
    for (let k = 0; k < 200 && !placed; k++) { board = [r1(between(rand, -8, 10)), 0, base.board[2]]; placed = ok(board); }
    if (!placed) return null;
  }
  const order = base.items.map((it, i) => i).filter((i) => !items[i]).sort((a, b) => sizeRank[base.items[a].type] - sizeRank[base.items[b].type]);
  for (const i of order) {
    let placed = false;
    for (let k = 0; k < 300 && !placed; k++) {
      items[i] = sampleItem(base.items[i], rand);
      placed = ok(board);
      if (!placed) items[i] = null;
    }
    if (!placed) return null;
  }
  return { items, board };
}

function generate() {
  const out = {};
  for (const levelId of Object.keys(ROUTES)) {
    const base = SCENES[levelId], rand = rng(levelId.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
    const found = [], why = {};
    for (let tries = 0; found.length < 3 && tries < 400; tries++) {
      const cand = layOut(base, levelId, rand, why);
      if (!cand) { why['could not place every piece'] = (why['could not place every piece'] || 0) + 1; continue; }
      const scene = { ...base, ...cand };
      const m = moved(base, scene);
      if (m.count < 3 || m.total < 10) { why['too like the original'] = (why['too like the original'] || 0) + 1; continue; }
      if (found.some((f) => moved({ items: f.items }, scene).total < 10)) { why['too like another variant'] = (why['too like another variant'] || 0) + 1; continue; }
      found.push(cand);
    }
    if (found.length < 3) throw new Error(`only found ${found.length} layouts for ${levelId}; rejected: ${JSON.stringify(why)}`);
    out[levelId] = found;
  }
  const body = JSON.stringify(out, null, 2).replace(/"([a-z_]+)":/g, '$1:').replace(/"/g, "'");
  writeFileSync(new URL('../src/kitchenVariants.js', import.meta.url), `// Generated by scripts/layouts.mjs --generate (seeded, so it is reproducible). Do not edit by hand:\n// node scripts/layouts.mjs proves each one is winnable with the same hotspot clicks.\nexport const VARIANTS = ${body};\n`);
  console.log('wrote src/kitchenVariants.js');
}

// ---- check ----
async function check() {
  const { VARIANTS: V } = await import(`../src/kitchenVariants.js?t=${Date.now()}`);
  let bad = 0;
  for (const levelId of Object.keys(ROUTES)) {
    const n = 1 + (V[levelId]?.length ?? 0);
    for (let v = 0; v < n; v++) {
      const scene = v === 0 ? SCENES[levelId] : { ...SCENES[levelId], ...V[levelId][v - 1] };
      const route = checkRoute(scene, levelId, v === 0 ? FLY_R : FLY_R + CLEARANCE);
      const sane = v === 0 ? [] : checkSanity(scene, levelId);
      const ok = !route.length && !sane.length;
      if (!ok) bad++;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${levelId}:v${v}${v === 0 ? ' (original)' : ''}${ok ? '' : '  ' + [...route, ...sane].join('; ')}`);
    }
  }
  if (bad) { console.log(`${bad} layout(s) failed`); process.exit(1); }
  console.log('all layouts pass');
}

if (process.argv[1]?.endsWith('layouts.mjs')) {
  if (process.argv.includes('--generate')) generate();
  await check();
}
