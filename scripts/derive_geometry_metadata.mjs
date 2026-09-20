// Derive a geometry_metadata file for a circuit whose own metadata has not been provided.
//
// Every geometry_metadata.json we have (DNa02_L, DNa02_R, escape_jump_L) uses "shared_center_and_scale":
// center = middle of the bounding box of all the circuit's skeleton nodes, scale = 20 / longest side.
// That rule reproduces those three files exactly (0 error), so it is used here for the circuits without one.
// The click point follows the DNa02_L file: its hotspot_center_game is the widest node (the cell body).
// The output is marked "derived": true. Replace it with the real file when it arrives.
//
// usage: node scripts/derive_geometry_metadata.mjs <geometry folder> <filled handoff json> <glb file name> <out file>

import fs from 'fs';
import path from 'path';

const [folder, handoffPath, glbFile, outPath] = process.argv.slice(2);
if (!outPath) {
  console.error('usage: node scripts/derive_geometry_metadata.mjs <folder> <handoff.json> <glb> <out.json>');
  process.exit(1);
}

const handoff = JSON.parse(fs.readFileSync(handoffPath, 'utf8'));
const TARGET = 20;
const PALETTE = [
  [0.05, 0.8, 0.2, 1.0], // hotspot: green
  [0.9, 0.05, 0.55, 1.0],
  [0.1, 0.45, 0.95, 1.0],
  [0.95, 0.6, 0.05, 1.0],
]; // the colors the other circuits' blender_export_config.json files use, in path order

const readSwc = (id) =>
  fs
    .readFileSync(path.join(folder, `${id}.swc`), 'utf8')
    .split('\n')
    .filter((l) => l && l[0] !== '#')
    .map((l) => l.trim().split(/\s+/).map(Number)); // id type x y z radius parent

const ids = handoff.path.map((p) => String(p.body_id));
const swcs = Object.fromEntries(ids.map((id) => [id, readSwc(id)]));

const lo = [Infinity, Infinity, Infinity];
const hi = [-Infinity, -Infinity, -Infinity];
for (const rows of Object.values(swcs)) {
  for (const r of rows) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], r[2 + a]);
      hi[a] = Math.max(hi[a], r[2 + a]);
    }
  }
}
const center = lo.map((v, a) => (v + hi[a]) / 2);
const scale = TARGET / Math.max(...hi.map((v, a) => v - lo[a]));

// Widest node of the hotspot neuron, in the metadata's own (pre-export) axis order: (native - center) * scale.
const hotspotRows = swcs[ids[0]];
const soma = hotspotRows.reduce((best, r) => (r[5] > best[5] ? r : best));
const hotspotCenter = [0, 1, 2].map((a) => (soma[2 + a] - center[a]) * scale);

const meta = {
  version: 1,
  derived: true,
  derived_note:
    'Not provided by the geometry team. Normalization recomputed from the SWC files with the same rule that reproduces the existing metadata files; hotspot_center_game is the widest node of the hotspot neuron. Replace with the real file.',
  dataset: handoff.dataset,
  geometry_type: 'tube_mesh_from_swc',
  glb_file: glbFile,
  source_coordinate_unit_nm: 8,
  normalization: {
    method: 'shared_center_and_scale',
    center_native: center,
    scale,
    target_largest_dimension: TARGET,
    rotation_applied: false,
  },
  neurons: handoff.path.map((p, i) => ({
    body_id: String(p.body_id),
    name: `${p.type}`,
    role: i === 0 ? 'clickable_hotspot' : p.role,
    glb_object_name: String(p.body_id),
    swc_file: `${p.body_id}.swc`,
    color_rgba: PALETTE[Math.min(i, PALETTE.length - 1)],
    ...(i === 0 ? { hotspot_center_game: hotspotCenter, suggested_hit_radius: 0.5 } : {}),
  })),
  game_mapping: {
    hotspot_id: handoff.hotspot_id,
    behavior_id: handoff.behavior_id,
    pulse_order: ids,
    branch_level_pulse_source: 'swc',
  },
};

fs.writeFileSync(outPath, JSON.stringify(meta, null, 2) + '\n');
console.log('wrote', outPath);
console.log('center_native', center.map((v) => v.toFixed(1)), 'scale', scale);
console.log('hotspot_center_game', hotspotCenter.map((v) => v.toFixed(3)), 'from node', soma[0], 'radius', soma[5]);
