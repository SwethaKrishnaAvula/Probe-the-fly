import * as THREE from 'three';

// Click picking for the brain pane. Neurons are skeletons (lines), and an object is a hotspot
// if its userData.hotspotId is set. Only real clicks count: dragging to orbit must not fire a probe.
const CLICK_MAX_MOVE_PX = 5;
const LINE_PICK_RADIUS = 0.06; // world units: how close a click must be to a skeleton line

export function createPicker({ domElement, camera, getTargets, onPick, onHover }) {
  const raycaster = new THREE.Raycaster();
  raycaster.params.Line.threshold = LINE_PICK_RADIUS;
  const pointer = new THREE.Vector2();
  let down = null;

  domElement.addEventListener('pointerdown', (e) => {
    down = { x: e.clientX, y: e.clientY };
  });

  function firstHit(e) {
    const rect = domElement.getBoundingClientRect();
    pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(getTargets(), false)[0];
  }

  domElement.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    down = null;
    if (moved > CLICK_MAX_MOVE_PX) return;

    const hit = firstHit(e);
    if (hit) onPick(hit.object.userData.hotspotId, hit);
  });

  // Hover highlight only (no labels, so it never gives the answer away). Skipped while orbiting.
  if (onHover) {
    let hovered = null;
    const setHovered = (id) => {
      if (id === hovered) return;
      hovered = id;
      domElement.style.cursor = id ? 'pointer' : '';
      onHover(id);
    };
    domElement.addEventListener('pointermove', (e) => {
      if (e.buttons) return setHovered(null);
      const hit = firstHit(e);
      setHovered(hit ? hit.object.userData.hotspotId : null);
    });
    domElement.addEventListener('pointerleave', () => setHovered(null));
  }
}
