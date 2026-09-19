import * as THREE from 'three';

// Click picking for the brain pane. A mesh is a hotspot if its userData.hotspotId is set.
// Only real clicks count: dragging to orbit the brain must not fire a probe.
const CLICK_MAX_MOVE_PX = 5;

export function createPicker({ domElement, camera, getTargets, onPick }) {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;

  domElement.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });

  domElement.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > CLICK_MAX_MOVE_PX) return;

    const rect = domElement.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);

    const hit = raycaster.intersectObjects(getTargets(), false)[0];
    if (hit) onPick(hit.object.userData.hotspotId, hit);
  });
}
