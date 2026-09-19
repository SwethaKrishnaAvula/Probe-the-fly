// Pure helpers (no three.js) that turn a neuron skeleton (.swc) into a per-vertex "how far along the
// neuron am I" value for the tube mesh, so a pulse of light can travel along the neuron.
// This is geometry lookup done once at load, not a brain simulation (read.md rule 2).

// .swc columns: id, type, x, y, z, radius, parent. Coordinates are native units (8 nm).
export function parseSwc(text) {
  const rows = [];
  for (const line of text.split('\n')) {
    if (!line || line[0] === '#') continue;
    const c = line.trim().split(/\s+/);
    if (c.length < 7) continue;
    rows.push([+c[0], +c[2], +c[3], +c[4], +c[6]]);
  }
  const index = new Map(rows.map((r, i) => [r[0], i]));
  const n = rows.length;
  const native = new Float64Array(n * 3);
  const parent = new Int32Array(n);
  rows.forEach((r, i) => {
    native.set([r[1], r[2], r[3]], i * 3);
    parent[i] = r[4] === -1 ? -1 : (index.get(r[4]) ?? -1);
  });
  return { n, native, parent };
}

// Native coordinates -> the .glb's frame. geometry_metadata.json normalizes with a shared center and
// scale; the .glb was then exported with its axes reordered as (x, z, -y). Checked against the mesh:
// skeleton nodes land on the tubes (median gap 0.02 units) only with this order.
export function toGlbFrame(swc, { center_native: c, scale: s }) {
  const out = new Float32Array(swc.n * 3);
  for (let i = 0; i < swc.n; i++) {
    const x = swc.native[i * 3];
    const y = swc.native[i * 3 + 1];
    const z = swc.native[i * 3 + 2];
    out[i * 3] = (x - c[0]) * s;
    out[i * 3 + 1] = (z - c[2]) * s;
    out[i * 3 + 2] = -(y - c[1]) * s;
  }
  return out;
}

const key = (ix, iy, iz) => ((ix + 512) << 20) | ((iy + 512) << 10) | (iz + 512);

export function buildGrid(pos, cell = 0.3) {
  const cells = new Map();
  for (let i = 0; i < pos.length / 3; i++) {
    const k = key(Math.floor(pos[i * 3] / cell), Math.floor(pos[i * 3 + 1] / cell), Math.floor(pos[i * 3 + 2] / cell));
    const list = cells.get(k);
    if (list) list.push(i);
    else cells.set(k, [i]);
  }
  return { cells, cell, pos };
}

// Nearest indexed point to (qx,qy,qz), searching outward ring by ring. Returns { i, d2 } or null.
export function nearest(grid, qx, qy, qz, maxRing = 6) {
  const { cells, cell, pos } = grid;
  const cx = Math.floor(qx / cell);
  const cy = Math.floor(qy / cell);
  const cz = Math.floor(qz / cell);
  let best = null;
  for (let r = 0; r <= maxRing; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) !== r) continue; // ring surface only
          const list = cells.get(key(cx + dx, cy + dy, cz + dz));
          if (!list) continue;
          for (const i of list) {
            const ex = pos[i * 3] - qx;
            const ey = pos[i * 3 + 1] - qy;
            const ez = pos[i * 3 + 2] - qz;
            const d2 = ex * ex + ey * ey + ez * ez;
            if (!best || d2 < best.d2) best = { i, d2 };
          }
        }
      }
    }
    // A hit inside ring r can still be beaten by ring r+1, so finish one more ring before stopping.
    if (best && best.d2 <= (r * cell) ** 2) break;
  }
  return best;
}

// Distance along the skeleton from node `src` to every node (a skeleton is a tree, so each node has one path).
export function geodesicFrom(swc, pos, src) {
  const n = swc.n;
  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const p = swc.parent[i];
    if (p >= 0) {
      adj[i].push(p);
      adj[p].push(i);
    }
  }
  const dist = new Float32Array(n).fill(-1);
  dist[src] = 0;
  const stack = [src];
  while (stack.length) {
    const a = stack.pop();
    for (const b of adj[a]) {
      if (dist[b] >= 0) continue;
      const dx = pos[a * 3] - pos[b * 3];
      const dy = pos[a * 3 + 1] - pos[b * 3 + 1];
      const dz = pos[a * 3 + 2] - pos[b * 3 + 2];
      dist[b] = dist[a] + Math.hypot(dx, dy, dz);
      stack.push(b);
    }
  }
  return dist;
}

// For every mesh vertex: 0..1 progress along the neuron from `src` (nearest skeleton node's distance / longest).
export function vertexProgress(nodeGrid, geo, vertexPos) {
  let max = 0;
  for (const d of geo) if (d > max) max = d;
  const count = vertexPos.length / 3;
  const u = new Float32Array(count);
  for (let v = 0; v < count; v++) {
    const hit = nearest(nodeGrid, vertexPos[v * 3], vertexPos[v * 3 + 1], vertexPos[v * 3 + 2]);
    u[v] = hit && geo[hit.i] >= 0 ? geo[hit.i] / max : 1;
  }
  return u;
}

export function rootIndex(swc) {
  return swc.parent.findIndex((p) => p < 0);
}
