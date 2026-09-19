import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createPane } from './pane.js';

// Left: brain (orbit). Right: arena with the fly.
const brain = createPane(document.getElementById('brain-pane'), { position: [3, 3, 5] });
const arena = createPane(document.getElementById('arena-pane'), { position: [0, 6, 8] });

const controls = new OrbitControls(brain.camera, brain.domElement);
controls.enableDamping = true;

// Placeholder: real neurons replace this cube once the geometry file arrives.
const cube = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshNormalMaterial());
brain.scene.add(cube);

// Placeholder arena: ground grid. The fly goes here next.
arena.scene.add(new THREE.GridHelper(20, 20, 0x3a4152, 0x22283a));
arena.camera.lookAt(0, 0, 0);

brain.renderer.setAnimationLoop(() => {
  controls.update();
  brain.renderer.render(brain.scene, brain.camera);
  arena.renderer.render(arena.scene, arena.camera);
});
