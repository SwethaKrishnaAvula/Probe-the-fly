import * as THREE from 'three';

// The kitchen is real: the fly cannot pass through anything solid, and it cannot fly beyond the counter.
//   - Solid pieces (cheese, hurdles, stoves, salt boxes, bowls, rolling fruit, the chopping board, the sill items) are
//     world.colliders. A fly whose belly is below a piece's height and whose footprint touches it has hit it: it is
//     bonked, and put back where it took off from. A high enough flight (escape_takeoff) clears the low ones.
//   - The sink is water. Flying over it is fine; being on the counter's level inside it, i.e. landing in it, soaks the
//     fly: it splashes, drips, and is put back where it took off from.
//   - The edge of the counter stops a flight (the behavior runner clamps to world.bounds); this says so.
// Both mishaps cost nothing extra here (the click was already spent); onMishap tells the game so it can score them.

const FLY_R = 0.42; // radius of the fly's footprint
const BELLY = 0.1; // the fly's belly is this far above its lift
const SOAK_LIFT = 0.1; // below this lift the fly is on the counter's level
const MOVES = new Set(['walk_forward', 'turn_left', 'turn_right', 'approach_odor', 'escape_takeoff', 'escape_flight', 'object_track']);

function overlaps(c, px, pz) {
  const cx = c.ref ? c.ref.position.x : c.cx;
  const cz = c.ref ? c.ref.position.z : c.cz;
  const dx = px - cx;
  const dz = pz - cz;
  if (c.type === 'circle') return Math.hypot(dx, dz) < c.r + FLY_R;
  const cos = Math.cos(c.rot);
  const sin = Math.sin(c.rot);
  const lx = dx * cos - dz * sin;
  const lz = dx * sin + dz * cos;
  const ex = lx - THREE.MathUtils.clamp(lx, -c.hx, c.hx);
  const ez = lz - THREE.MathUtils.clamp(lz, -c.hz, c.hz);
  return ex * ex + ez * ez < FLY_R * FLY_R;
}

export function createCollisions({ fly, runner, world, arena, say = () => {}, onMishap = () => {} }) {
  let start = null; // where the current move took off from: { pos, rot }
  let recovering = null; // a mishap's animation is playing: { restore }
  let edgeSaid = false;
  let prev = null; // the behavior that was running last frame: a flight that ends this frame still counts as moving
  const api = {
    enabled: true,

    // Call just before a behavior starts, so a mishap knows where to put the fly back.
    begin() {
      start = { pos: fly.object.position.clone(), rot: fly.object.rotation.y };
      edgeSaid = false;
    },

    // Forget everything (new level).
    reset() {
      start = null;
      recovering = null;
      prev = null;
    },

    update() {
      if (!api.enabled) return;
      const p = fly.object.position;
      const wasMoving = MOVES.has(prev) || MOVES.has(runner.current);
      prev = runner.current;

      if (recovering) {
        if (!runner.current) {
          if (recovering.restore && start) {
            p.copy(start.pos);
            fly.object.rotation.y = start.rot;
          }
          fly.resetPose();
          recovering = null;
        }
        return;
      }

      const altitude = p.y + fly.pose.lift;
      const belly = altitude + BELLY;

      // The sink: on the counter's level and inside its opening.
      const r = world.sinkRect;
      if (r && fly.pose.lift < SOAK_LIFT && p.x > r.x0 + 0.15 && p.x < r.x1 - 0.15 && p.z > r.z0 + 0.15 && p.z < r.z1 - 0.15) {
        arena.splash?.(p.x, p.z);
        say('Splash! It fell in the sink. Fly over the water, do not land in it.');
        onMishap({ kind: 'soaked', what: 'the sink' });
        runner.start('soaked');
        recovering = { restore: true };
        return;
      }

      // Solid pieces.
      const moving = wasMoving;
      for (const c of world.colliders) {
        if (belly >= c.height) continue; // flown high enough to clear it
        if (!overlaps(c, p.x, p.z)) continue;
        say(`Bonk! The fly hit the ${c.kind}. Find a way round it.`);
        onMishap({ kind: 'hit', what: c.kind });
        if (!moving && c.ref) {
          // a rolling fruit ran into a fly that was resting: nudge the fly clear of it rather than send it back
          const dx = p.x - c.ref.position.x;
          const dz = p.z - c.ref.position.z;
          const d = Math.hypot(dx, dz) || 1;
          p.x = c.ref.position.x + (dx / d) * (c.r + FLY_R + 0.15);
          p.z = c.ref.position.z + (dz / d) * (c.r + FLY_R + 0.15);
          runner.start('bonk');
          recovering = { restore: false };
        } else {
          runner.start('bonk');
          recovering = { restore: true };
        }
        return;
      }

      // The edge of the counter: the flight has been stopped by the bounds.
      if (moving && !edgeSaid) {
        const b = world.bounds;
        if (p.x <= b.minX + 0.001 || p.x >= b.maxX - 0.001 || p.z <= b.minZ + 0.001 || p.z >= b.maxZ - 0.001) {
          edgeSaid = true;
          say('That is the edge of the counter. The fly stays over the counter.');
        }
      }
    },
  };
  return api;
}
