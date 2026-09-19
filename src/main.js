import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createPane } from './pane.js';
import { createFly } from './fly.js';

// Left: brain (orbit). Right: arena with the fly.
const brain = createPane(document.getElementById('brain-pane'), { position: [3, 3, 5] });
const arena = createPane(document.getElementById('arena-pane'), { position: [0, 3.5, 4.5] });

const controls = new OrbitControls(brain.camera, brain.domElement);
controls.enableDamping = true;

// Placeholder: real neurons replace this cube once the geometry file arrives.
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial());
brain.scene.add(cube);

// Arena: ground grid, lights, fly.
arena.scene.add(new THREE.GridHelper(20, 40, 0x3a4152, 0x22283a));
arena.scene.add(new THREE.HemisphereLight(0xffffff, 0x333344, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 1.5);
sun.position.set(3, 6, 2);
arena.scene.add(sun);
arena.camera.lookAt(0, 0, 0);

const fly = createFly();
arena.scene.add(fly.object);

// Dev-only test keys (open the page with ?debug). The real game has no movement buttons:
// behaviors will be triggered by clicking hotspots on the brain.
if (new URLSearchParams(location.search).has('debug')) {
  const keys = {
    w: ['walk', 1],
    s: ['walk', -1],
    a: ['turn', 1],
    d: ['turn', -1],
    ' ': ['stop', 1],
  };
  window.addEventListener('keydown', (e) => {
    const k = keys[e.key.toLowerCase()];
    if (k) fly.setAction(...k);
  });
}

const clock = new THREE.Clock();
brain.renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  controls.update();
  fly.update(dt);
  brain.renderer.render(brain.scene, brain.camera);
  arena.renderer.render(arena.scene, arena.camera);
});
