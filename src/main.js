import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createPane } from './pane.js';
import { createFly } from './fly.js';
import { createPicker } from './picking.js';
import { createBrain } from './brain.js';
import { createArena } from './arena.js';
import { createBehaviorRunner } from './behaviors.js';
import { createHud } from './hud.js';
import { createGame } from './game.js';

// Left: brain (orbit, click hotspots). Right: arena with the fly. The game itself runs from
// levels.json and never talks to a backend, so it plays fine offline (read.md rules 2 and 3).
const brainPane = createPane(document.getElementById('brain-pane'), { position: [3, 3, 5] });
// The arena camera sits behind the fly's start, looking down the +z direction the fly faces, so the
// player's left and right match the fly's.
const arenaPane = createPane(document.getElementById('arena-pane'), { position: [0, 13.5, -4.5] });
arenaPane.camera.lookAt(0, 0, 2.3);

const controls = new OrbitControls(brainPane.camera, brainPane.domElement);
controls.enableDamping = true;

const brain = createBrain(brainPane.scene);
const arena = createArena(arenaPane.scene);
const fly = createFly();
arenaPane.scene.add(fly.object);
const runner = createBehaviorRunner(fly, arena.world);
const hud = createHud();

// Notebook snapshots: grab a thumbnail of a canvas right after it renders (the WebGL buffer is only
// readable in the same frame it was drawn).
const THUMB_W = 200;
const thumbCanvas = document.createElement('canvas');
const captureQueue = [];
function capture(which, cb) {
  captureQueue.push({ pane: which === 'brain' ? brainPane : arenaPane, cb });
}
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

async function boot() {
  const data = await fetch('/data/levels.json').then((r) => r.json());
  // Weak-spot levels are generated at runtime from task_templates.json, not authored here.
  const levels = data.levels.filter((l) => l.type !== 'weak_spot');
  const entries = data.hotspot_notebook_entries;

  const game = createGame({ levels, entries, brain, arena, fly, runner, hud, capture });

  createPicker({
    domElement: brainPane.domElement,
    camera: brainPane.camera,
    getTargets: () => brain.pickables(),
    onPick: (hotspotId) => game.onPick(hotspotId),
    onHover: (hotspotId) => brain.setHover(hotspotId),
  });

  game.start();

  // Dev-only test keys (open the page with ?debug). The real game has no movement buttons.
  if (new URLSearchParams(location.search).has('debug')) {
    const keys = { w: ['walk', 1], s: ['walk', -1], a: ['turn', 1], d: ['turn', -1], ' ': ['stop', 1] };
    window.addEventListener('keydown', (e) => {
      const k = keys[e.key.toLowerCase()];
      if (k) fly.setAction(...k);
    });
    window.__dev = { THREE, game, brain, camera: brainPane.camera, canvas: brainPane.domElement };
  }

  const clock = new THREE.Clock();
  brainPane.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    controls.update();
    game.update(dt * 1000);
    brain.update(dt * 1000);
    fly.update(dt);
    brainPane.renderer.render(brainPane.scene, brainPane.camera);
    arenaPane.renderer.render(arenaPane.scene, arenaPane.camera);
    flushCaptures();
  });
}

boot();
