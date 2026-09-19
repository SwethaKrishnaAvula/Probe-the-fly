import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createPane } from './pane.js';
import { createFly } from './fly.js';
import { createPicker } from './picking.js';
import { createArena } from './arena.js';
import { createBehaviorRunner } from './behaviors.js';
import { createNeuronPair } from './neuronPath.js';
import { createHud } from './hud.js';

import meta from '../game_data/geometry/geometry_metadata.json';
import handoff from '../path_jsons/DNa02_L_handoff.json';
import glbUrl from '../game_data/geometry/DNa02_L_523769_to_801548.glb?url';
import swcDnUrl from '../game_data/geometry/523769.swc?url';
import swcMnUrl from '../game_data/geometry/801548.swc?url';

// Branch game_turn_right test screen. Left: the DNa02_L neuron and the motor neuron it drives (anterior
// on the left). Right: the arena with the fly. Click the hotspot: light travels down the path, then the
// fly turns left. The world and HUD come from levels.json (open ?level=1..5 to see each level's world);
// the level rules in game.js and the placeholder brain.js are not loaded here.
const brainPane = createPane(document.getElementById('brain-pane'), { position: [0, 4, 21], background: 0x11162a });
// The arena camera sits behind the fly's start, looking down the +z direction the fly faces, so the
// player's left and right match the fly's.
const arenaPane = createPane(document.getElementById('arena-pane'), { position: [0, 11.5, -14.5], background: 0x161b2e });
arenaPane.camera.lookAt(0, 0, 3.2);
arenaPane.renderer.shadowMap.enabled = true;

const controls = new OrbitControls(brainPane.camera, brainPane.domElement);
controls.enableDamping = true;

// Keep the whole neuron (about 20 units long, 8 tall) in view whatever the pane's shape, by moving the
// camera along its current line of sight. Runs on load and when the pane is resized, not while orbiting.
const FIT_HALF_WIDTH = 12; // neuron half-length 10, plus margin
const FIT_HALF_HEIGHT = 5;
function fitBrainCamera() {
  const el = document.getElementById('brain-pane');
  const cam = brainPane.camera;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const aspect = el.clientWidth / el.clientHeight;
  const dist = Math.max(FIT_HALF_WIDTH / (tanHalf * aspect), FIT_HALF_HEIGHT / tanHalf);
  const dir = cam.position.clone().sub(controls.target).normalize();
  cam.position.copy(controls.target).addScaledVector(dir, dist);
}
new ResizeObserver(fitBrainCamera).observe(document.getElementById('brain-pane'));
fitBrainCamera();

const arena = createArena(arenaPane.scene);
arena.configure(null);
const fly = createFly();
fly.object.traverse((o) => {
  if (o.isMesh) o.castShadow = true;
});
arenaPane.scene.add(fly.object);
const runner = createBehaviorRunner(fly, arena.world);
const hud = createHud();

// Notebook snapshots: grab a thumbnail of a canvas right after it renders (the WebGL buffer is only
// readable in the same frame it was drawn).
const THUMB_W = 200;
const thumbCanvas = document.createElement('canvas');
const captureQueue = [];
const capture = (pane, cb) => captureQueue.push({ pane, cb });
function flushCaptures() {
  while (captureQueue.length) {
    const { pane, cb } = captureQueue.shift();
    const src = pane.domElement;
    if (!src.width) continue;
    thumbCanvas.width = THUMB_W;
    thumbCanvas.height = Math.round((THUMB_W * src.height) / src.width);
    thumbCanvas.getContext('2d').drawImage(src, 0, 0, thumbCanvas.width, thumbCanvas.height);
    cb(thumbCanvas.toDataURL('image/jpeg', 0.7));
  }
}

// Which level's world to show: ?level=1..5 (default 1).
async function loadLevel() {
  const data = await fetch('/data/levels.json').then((r) => r.json());
  const levels = data.levels.filter((l) => l.type !== 'weak_spot');
  const wanted = Number(new URLSearchParams(location.search).get('level')) || 1;
  const index = Math.min(levels.length, Math.max(1, wanted)) - 1;
  const level = levels[index];

  arena.configure(level.arena);
  hud.setLevel({ index, total: levels.length, level });
  hud.setNotebookVisible(level.notebook_visible);
  hud.setScore(0);
  let budget = level.click_budget;
  hud.setClicks(budget, '0/' + level.hotspots.length);
  // Level 1 unlocks "Start Task 1" after 5 probes; this screen has one hotspot, so it stays locked.
  if (level.type === 'discovery') hud.setAction('Start Task 1', false, () => {});
  hud.showIntro(level, () => hud.hideOverlay());

  let probes = 0;
  return {
    entries: data.hotspot_notebook_entries,
    // One click on the hotspot: spend a click (never below 0) and record it in the notebook.
    onProbe(behaviorId) {
      probes++;
      if (budget != null) hud.setClicks((budget = Math.max(0, budget - 1)));
      else hud.setClicks(null, `${Math.min(probes, 1)}/${level.hotspots.length}`);
      if (level.notebook_visible) {
        hud.recordProbe(behaviorId, data.hotspot_notebook_entries[behaviorId] ?? '', probes);
        capture(brainPane, (url) => hud.setSnapshot(behaviorId, 'brain', url));
        setTimeout(() => capture(arenaPane, (url) => hud.setSnapshot(behaviorId, 'arena', url)), 700);
      }
    },
  };
}

async function boot() {
  const game = await loadLevel();
  const neurons = await createNeuronPair({
    urls: { glb: glbUrl, swc: { 523769: swcDnUrl, 801548: swcMnUrl } },
    meta,
    handoff,
  });
  brainPane.scene.add(neurons.group);

  createPicker({
    domElement: brainPane.domElement,
    camera: brainPane.camera,
    getTargets: () => [neurons.hotspotMesh],
    onPick: (hotspotId) => {
      console.log('hotspot clicked:', hotspotId);
      if (neurons.busy || runner.current) return; // one probe at a time
      game.onProbe(neurons.behaviorId);
      neurons.firePulse(() => runner.start(neurons.behaviorId));
    },
    onHover: (hotspotId) => neurons.setHover(hotspotId !== null),
  });

  const clock = new THREE.Clock();
  brainPane.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    controls.update();
    neurons.update(dt * 1000);
    runner.update(dt * 1000);
    fly.update(dt);
    brainPane.renderer.render(brainPane.scene, brainPane.camera);
    arenaPane.renderer.render(arenaPane.scene, arenaPane.camera);
    flushCaptures();
  });

  if (new URLSearchParams(location.search).has('debug')) {
    window.__dev = { THREE, neurons, fly, runner, brainPane, camera: brainPane.camera, canvas: brainPane.domElement };
  }
}

boot();
