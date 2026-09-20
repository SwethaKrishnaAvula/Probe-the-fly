import * as THREE from 'three';

// Look-around controls for the kitchen view. The camera stays where it is and the view turns toward wherever you
// drag: drag right and you see what is to the right, drag left and you see what is to the left, drag up to look
// up, down to look down. Mouse wheel or a two-finger pinch moves the camera forward and back along the view;
// right-drag, shift-drag or a two-finger drag slides it sideways and up or down. It stays above the counter.
export function createLookControls(camera, dom, { onStart = () => {}, min = [-45, 0.3, -40], max = [45, 40, 45] } = {}) {
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const fwd = new THREE.Vector3();
  const right = new THREE.Vector3();
  let yaw = 0;
  let pitch = 0;
  const pointers = new Map(); // active pointers: id -> {x, y}
  let pinch = 0;
  let mode = 'look';

  const LOOK = 0.0045; // radians per pixel
  const SLIDE = 0.03; // world units per pixel
  const PINCH = 0.05;

  function apply() {
    pitch = THREE.MathUtils.clamp(pitch, -1.45, 1.45);
    euler.set(pitch, yaw, 0);
    camera.quaternion.setFromEuler(euler);
    camera.position.clamp(new THREE.Vector3(...min), new THREE.Vector3(...max));
  }
  const forward = () => fwd.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const rightVec = () => right.set(Math.cos(yaw), 0, -Math.sin(yaw));

  // Put the camera at `pos` looking at `target`.
  function setView(pos, target) {
    camera.position.copy(pos);
    const d = target.clone().sub(pos);
    yaw = Math.atan2(-d.x, -d.z);
    pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    apply();
  }

  const center = () => {
    const pts = [...pointers.values()];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
  };

  dom.addEventListener('contextmenu', (e) => e.preventDefault());
  dom.addEventListener('pointerdown', (e) => {
    dom.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    mode = e.button === 2 || e.shiftKey ? 'slide' : 'look';
    if (pointers.size === 2) pinch = center().d;
    onStart();
  });
  dom.addEventListener('pointermove', (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    if (pointers.size === 2) {
      const before = center();
      p.x = e.clientX;
      p.y = e.clientY;
      const now = center();
      // two fingers: pinch to move along the view, drag together to slide
      camera.position.addScaledVector(forward(), (now.d - pinch) * PINCH);
      pinch = now.d;
      camera.position.addScaledVector(rightVec(), (now.x - before.x) * SLIDE);
      camera.position.y -= (now.y - before.y) * SLIDE;
      apply();
      return;
    }
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (mode === 'slide') {
      camera.position.addScaledVector(rightVec(), dx * SLIDE);
      camera.position.y -= dy * SLIDE;
    } else {
      yaw -= dx * LOOK; // drag right: turn right
      pitch -= dy * LOOK; // drag up: look up
    }
    apply();
  });
  const end = (e) => {
    pointers.delete(e.pointerId);
    if (pointers.size === 1) pinch = 0;
  };
  dom.addEventListener('pointerup', end);
  dom.addEventListener('pointercancel', end);
  dom.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      onStart();
      camera.position.addScaledVector(forward(), -THREE.MathUtils.clamp(e.deltaY, -120, 120) * 0.03);
      apply();
    },
    { passive: false },
  );

  // Slide the camera sideways (dx > 0 = to the camera's right) without turning it: the nav bar uses this.
  function slide(dx) {
    camera.position.addScaledVector(rightVec(), dx);
    apply();
  }

  return { setView, slide };
}
