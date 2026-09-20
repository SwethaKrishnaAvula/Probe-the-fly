// Keep the game's DATA in step with GitHub. This repo and origin/main have no shared history, so `git pull` refuses;
// this fetches instead and compares the data files (game_data/, path_jsons/, levels) with the working tree.
//
//   node scripts/sync_from_origin.mjs           report only: what is new or changed on GitHub, and what is still missing
//   node scripts/sync_from_origin.mjs --apply   also copy in what is safe: NEW files, and UPDATED files we have not edited
//
// It remembers what GitHub looked like last time (scripts/.sync_state.json), so it can tell "GitHub changed this" from
// "we changed this": a file we have edited locally (levels.json has the pie tuning) is reported and NEVER overwritten.
//
// It never touches src/, index.html or anything else in the game code. Files that exist only locally (for example the
// geometry_metadata_derived*.json we generated) are left alone; when real metadata for the same circuit appears on
// GitHub it says so, so the derived file can be replaced.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APPLY = process.argv.includes('--apply');
const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const gitBuf = (...a) => execFileSync('git', a, { maxBuffer: 1 << 28 });

git('fetch', '-q', 'origin');

// Data lives on two branches: geometry and handoffs on main, the filled-in pulse timing on filling-json.
const SOURCES = [
  { ref: 'origin/main', roots: ['game_data/', 'levels.json'], map: (p) => (p === 'levels.json' ? 'public/data/levels.json' : p) },
  { ref: 'origin/filling-json', roots: ['path_jsons/math_filled/'], map: (p) => p },
];
const SKIP = /\.(png|csv|txt|md|DS_Store)$|DS_Store/;

const STATE = 'scripts/.sync_state.json';
const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, 'utf8')) : {};
const localHash = (file) => (fs.existsSync(file) ? git('hash-object', file) : null);
const report = { new: [], updated: [], conflict: [], modified: [], same: 0 };

for (const { ref, roots, map } of SOURCES) {
  const files = git('ls-tree', '-r', '--name-only', ref).split('\n').filter((f) => roots.some((r) => f === r || f.startsWith(r)) && !SKIP.test(f));
  for (const f of files) {
    const dest = map(f);
    const remote = git('rev-parse', `${ref}:${f}`);
    const local = localHash(dest);
    const key = `${ref}:${f}`;
    const seen = state[key]; // GitHub's version when we last synced (undefined the first time)
    const write = () => {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, gitBuf('show', `${ref}:${f}`));
      state[key] = remote;
    };
    if (local === remote) {
      report.same++;
      state[key] = remote;
    } else if (local === null) {
      report.new.push({ ref, f, dest });
      if (APPLY) write();
    } else if (seen !== undefined && seen !== remote) {
      // GitHub changed it. Safe to take only if we have not edited our copy since the last sync.
      if (local === seen) {
        report.updated.push({ ref, f, dest });
        if (APPLY) write();
      } else report.conflict.push({ ref, f, dest });
    } else {
      report.modified.push({ ref, f, dest }); // GitHub unchanged, our copy edited: keep ours
      state[key] ??= remote;
    }
  }
}
if (APPLY || !fs.existsSync(STATE)) fs.writeFileSync(STATE, JSON.stringify(state, null, 1) + '\n');

const show = (label, list) => {
  console.log(`\n${label}: ${list.length}`);
  list.forEach((x) => console.log(`  ${APPLY ? 'updated' : 'would update'}  ${x.dest}   (${x.ref})`));
};
console.log(`origin/main ${git('rev-parse', '--short', 'origin/main')}  ${git('log', '-1', '--format=%s', 'origin/main')}`);
console.log(`origin/filling-json ${git('rev-parse', '--short', 'origin/filling-json')}  ${git('log', '-1', '--format=%s', 'origin/filling-json')}`);
console.log(`data files identical to GitHub: ${report.same}`);
show('NEW on GitHub, missing here', report.new);
show('UPDATED on GitHub since the last sync', report.updated);
console.log(`\nCONFLICT (GitHub changed it AND we edited it; needs a human): ${report.conflict.length}`);
report.conflict.forEach((x) => console.log(`  ${x.dest}   (${x.ref})`));
console.log(`\nEDITED LOCALLY, GitHub unchanged (ours is kept): ${report.modified.length}`);
report.modified.forEach((x) => console.log(`  ${x.dest}`));

// Missing data that GitHub still does not have.
console.log('\nSTILL MISSING (needs a teammate, or is derived locally):');
const geo = 'game_data/geometry';
const derived = fs.existsSync(geo) ? fs.readdirSync(geo, { recursive: true }).filter((f) => /geometry_metadata_derived.*\.json$/.test(f)) : [];
const originFiles = git('ls-tree', '-r', '--name-only', 'origin/main').split('\n');
for (const d of derived) {
  const dir = path.dirname(d);
  const real = originFiles.filter((f) => f.startsWith(`${geo}/${dir}/`) && /geometry_metadata(?!_derived).*\.json$/.test(f));
  let usable = false;
  let spinalClick = false;
  for (const r of real) {
    try {
      const m = JSON.parse(git('show', `origin/main:${r}`));
      const n = m.normalization ?? {};
      const [hc] = (m.neurons ?? []).filter((x) => x.role === 'clickable_hotspot');
      if (Array.isArray(n.center_native) && typeof n.scale === 'number' && Array.isArray(hc?.hotspot_center_game)) {
        usable = true;
        // Every hotspot must sit in the brain. In the metadata's axis order the brain end is negative z (checked on
        // the descending neurons); a positive z means the click point is at the nerve-cord end.
        if (hc.hotspot_center_game[2] > 0) spinalClick = true;
      }
    } catch {
      /* not json */
    }
  }
  console.log(`  ${d}: ${usable ? (spinalClick ? 'real metadata on GitHub, but its click point is at the NERVE-CORD end (hotspots must be in the brain): keep the derived click point' : 'REAL METADATA NOW AVAILABLE on GitHub, replace the derived file') : real.length ? 'GitHub has a metadata file but it is incomplete (TODO values or no click point); derived file still in use' : 'no metadata on GitHub; derived file still in use'}`);
}
// Handoffs on main whose pulse timing is still null and that have no filled version on filling-json.
const filled = new Set(git('ls-tree', '-r', '--name-only', 'origin/filling-json').split('\n').filter((f) => f.startsWith('path_jsons/math_filled/')).map((f) => path.basename(f).toLowerCase()));
for (const f of originFiles.filter((x) => /handoff\.json$/i.test(x) && x.startsWith('data/handoffs/'))) {
  try {
    const h = JSON.parse(git('show', `origin/main:${f}`));
    if (h.math_outputs?.pulse_timing) continue;
    const hasFilled = [...filled].some((n) => n.includes(String(h.hotspot_id ?? '').toLowerCase()) || n.includes(String(h.hotspot?.instance ?? '').toLowerCase().replace('(gf)', '_gf')));
    console.log(`  ${f}: pulse timing is null${hasFilled ? ' (a filled version exists on filling-json)' : ' and there is NO filled version yet'}`);
  } catch {
    /* skip */
  }
}
if (!APPLY && (report.new.length || report.updated.length)) console.log('\nRun with --apply to copy these into the working tree.');
