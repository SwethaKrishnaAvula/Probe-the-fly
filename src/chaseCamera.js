import * as THREE from 'three';

// The chase camera. While the fly moves, the camera moves with it (same direction, same distance), so the fly stays on
// screen however far it flies. The camera does not turn or zoom: it slides, easing after the fly a little so starts and
// stops are soft. If the fly would leave the safe part of the screen, the camera also slides to bring it back to the
// middle: that covers the player having dragged the view away before a click, or the fly being put back after a bonk.
// It never fights the player: while a finger or mouse is down on the view it does not re-frame, and any move the player
// makes is kept (the chase only adds the fly's own movement).
const EASE = 7; // higher = the camera catches up faster
const SAFE = { x: 0.7, yLow: -0.45, yHigh: 0.6 }; // the part of the screen (-1..1) the fly must stay in: clear of the top bar and the drawer
const FLY_HEIGHT = 0.3; // aim at the fly's body, not its feet
const EYE = 2.5; // a camera this close to the fly is the 'Fly view' (at its head): the fly is behind the lens on purpose
const JUMP = 1.5; // no flight covers this much in a frame: the fly was put somewhere (after a bonk), so the camera goes with it at once

// camera: the arena's camera. nudge(vec3): slide the camera by that much (lookControls keeps it above the counter).
// getPos(): the fly's position. isMoving(): a behavior that moves the fly is running.
// isPaused(): something else has the camera (the feeding close-up, a button's glide, the fly-in): do nothing.
// isDragging(): the player has the view in hand.
export function createChase({ camera, nudge, getPos, isMoving, isPaused = () => false, isDragging = () => false }) {
  const last = new THREE.Vector3();
  const pending = new THREE.Vector3(); // how far the camera still has to slide to be where the fly's movement says
  const q = new THREE.Vector3();
  const step = new THREE.Vector3();
  const ray = new THREE.Vector3();
  let tracking = false;

  // Where the fly will appear once `pending` has been applied, in screen terms.
  function reframe(p) {
    if (camera.position.distanceTo(p) < EYE) return; // fly view: it just travels with the fly
    q.copy(p).sub(pending);
    q.y += FLY_HEIGHT;
    const ndc = q.clone().project(camera);
    const inside = ndc.z < 1 && Math.abs(ndc.x) <= SAFE.x && ndc.y >= SAFE.yLow && ndc.y <= SAFE.yHigh;
    if (inside) return;
    // Slide so the fly lands where the camera's centre line meets its height.
    ray.set(0, 0.05, 0.5).unproject(camera).sub(camera.position).normalize();
    if (ray.y > -0.02) return; // looking level or up: no ground to aim at
    const t = (q.y - camera.position.y) / ray.y;
    pending.x += q.x - (camera.position.x + ray.x * t);
    pending.z += q.z - (camera.position.z + ray.z * t);
  }

  return {
    // A new level or a jump of the view: forget where the fly was.
    reset() {
      tracking = false;
      pending.set(0, 0, 0);
    },

    update(dt) {
      if (isPaused()) return this.reset();
      const p = getPos();
      if (!tracking) {
        last.copy(p);
        tracking = true;
      }
      step.copy(p).sub(last);
      last.copy(p);
      if (step.length() > JUMP) {
        nudge(step); // put back: keep the fly exactly where it was on screen
        return;
      }
      pending.add(step); // whatever the fly did since last frame, the camera owes
      if (isMoving() && !isDragging()) reframe(p);
      if (pending.lengthSq() < 1e-8) return;
      step.copy(pending).multiplyScalar(1 - Math.exp(-dt * EASE));
      nudge(step);
      pending.sub(step);
    },
  };
}
