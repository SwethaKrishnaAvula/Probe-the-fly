import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createPane } from './pane.js';
import { createFly } from './fly.js';
import { createPicker } from './picking.js';
import { createArena } from './arena.js';
import { createBehaviorRunner } from './behaviors.js';
import { createNeuronPair } from './neuronPath.js';

import meta from '../game_data/geometry/geometry_metadata.json';
import handoff from '../path_jsons/DNa02_L_handoff.json';
import glbUrl from '../game_data/geometry/DNa02_L_523769_to_801548.glb?url';
import swcDnUrl from '../game_data/geometry/523769.swc?url';
import swcMnUrl from '../game_data/geometry/801548.swc?url';

// Branch game_turn_right test screen. Left: the DNa02_L neuron and the motor neuron it drives (anterior
// on the left). Right: the arena with the fly. Click the hotspot: light travels down the path, then the
// fly turns left. The full level flow (game.js, levels.json, brain.js) stays in the repo but is not loaded here.
const brainPane = createPane(document.getElementById('brain-pane'), { position: [0, 4, 21] });
// The arena camera sits behind the fly's start, looking down the +z direction the fly faces, so the
// player's left and right match the fly's.
const arenaPane = createPane(document.getElementById('arena-pane'), { position: [0, 13.5, -4.5] });
arenaPane.camera.lookAt(0, 0, 2.3);

const controls = new OrbitControls(brainPane.camera, brainPane.domElement);
controls.enableDamping = true;

const arena = createArena(arenaPane.scene);
arena.configure(null);
const fly = createFly();
arenaPane.scene.add(fly.object);
const runner = createBehaviorRunner(fly, arena.world);

// The old level HUD is not used on this screen.
document.getElementById('hud').classList.add('hidden');

async function boot() {
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
  });

  if (new URLSearchParams(location.search).has('debug')) {
    window.__dev = { THREE, neurons, fly, runner, brainPane, camera: brainPane.camera, canvas: brainPane.domElement };
  }
}

boot();
