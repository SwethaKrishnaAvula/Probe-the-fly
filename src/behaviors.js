// Scripted fly behaviors. Every behavior is hand-authored animation (read.md rule 20: the last step
// from motor output to animation is hand-authored). The step sizes below are tuned so the levels in
// levels.json are winnable in exactly their click budgets, e.g. level 2 is walk, turn_right, walk, feed
// and level 4 is walk, turn_right, turn_right, walk, feed.

export const WALK_DIST = 4.5; // arena units per walk_forward
export const WALK_MS = 2000;
export const TURN_RAD = (120 * Math.PI) / 180; // per turn click
export const TURN_MS = 800;
export const TURN_ADVANCE = 0.1; // a turn is nearly in place, with a small forward creep

// Time the light pulse takes to travel along the neuron before the fly reacts (visual delay only).
export const PULSE_MS = 450;
const FAST_PULSE_MS = 220; // escape and freeze circuits are the fast ones

const smooth = (p) => p * p * (3 - 2 * p);
// 0 -> 1 -> 0 with flat top: ramp up over `edge`, hold, ramp down.
const envelope = (p, edge = 0.2) => smooth(Math.min(1, p / edge, (1 - p) / edge));
const shortestDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createBehaviorRunner(fly, world) {
  // world: { bounds: {minX,maxX,minZ,maxZ}, sugar: {pos, radius} | null, target: Vector3 | null }
  let cur = null;
  const root = fly.object;

  // Move along the fly's facing. Returns true if the walk should halt (arena edge or reached sugar).
  function advance(dist) {
    root.translateZ(dist);
    const b = world.bounds;
    const p = root.position;
    let halt = false;
    if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) {
      p.x = Math.min(b.maxX, Math.max(b.minX, p.x));
      p.z = Math.min(b.maxZ, Math.max(b.minZ, p.z));
      halt = true;
    }
    if (world.sugar && dist > 0) {
      // A fly stops when it reaches sugar, which also keeps a long walk from overshooting the radius.
      const dx = p.x - world.sugar.pos.x;
      const dz = p.z - world.sugar.pos.z;
      if (Math.hypot(dx, dz) <= world.sugar.radius) halt = true;
    }
    return halt;
  }

  const headingTo = (target) => Math.atan2(target.x - root.position.x, target.z - root.position.z);

  const turn = (dir) => ({
    ms: TURN_MS,
    begin: () => fly.setAction('gait', 1),
    tick: (p, c) => {
      root.rotation.y += dir * TURN_RAD * c.dp;
      return advance(TURN_ADVANCE * c.dp);
    },
  });

  const BEHAVIORS = {
    walk_forward: {
      ms: WALK_MS,
      begin: () => fly.setAction('gait', 1),
      tick: (p, c) => advance(WALK_DIST * c.dp),
    },
    // Left is +rotation.y (the fly's left is +X), right is -rotation.y.
    turn_left: turn(1),
    turn_right: turn(-1),
    // Legs halt and the fly stays frozen until the next behavior lands.
    freeze_stop: { ms: 0, hold: true, begin: () => fly.setAction('stop') },
    escape_takeoff: {
      ms: 1800,
      begin: (c) => {
        fly.setAction('stop');
        c.startY = root.position.y;
      },
      tick: (p, c) => {
        fly.pose.flap = p > 0.12 && p < 0.88 ? 1 : 0;
        fly.pose.spread = envelope(p, 0.15);
        const air = p < 0.15 ? -0.06 * (p / 0.15) : Math.sin(Math.PI * Math.min(1, (p - 0.15) / 0.75));
        fly.pose.lift = air * 1.4;
        fly.pose.pitch = Math.max(0, air) * 0.35;
        return p > 0.15 && p < 0.9 ? advance(2.6 * c.dp) : false;
      },
    },
    groom_head: {
      ms: 2200,
      begin: () => fly.setAction('stop'),
      tick: (p) => {
        fly.pose.groom = envelope(p, 0.15);
        fly.pose.headTilt = Math.sin(p * 40) * 0.08 * fly.pose.groom;
      },
    },
    feed: {
      ms: 1300,
      begin: () => fly.setAction('stop'),
      tick: (p) => {
        fly.pose.proboscis = envelope(p, 0.25);
        fly.pose.headDip = 0.6 * envelope(p, 0.25); // the head drops toward the food as the proboscis reaches out
      },
    },
    wing_song: {
      ms: 1800,
      begin: () => fly.setAction('stop'),
      tick: (p) => {
        fly.pose.song = envelope(p, 0.15);
      },
    },
    // The wing twitches out, half-commits, and folds back in.
    half_hearted_song: {
      ms: 900,
      begin: () => fly.setAction('stop'),
      tick: (p) => {
        fly.pose.song = 0.55 * Math.sin(Math.PI * Math.min(1, p * 1.2));
      },
    },
    // Whole body swivels to keep the target in sight.
    object_track: {
      ms: 900,
      begin: (c) => {
        fly.setAction('gait', 1);
        c.from = root.rotation.y;
        c.delta = world.target ? shortestDelta(c.from, headingTo(world.target)) : 0;
      },
      tick: (p, c) => {
        root.rotation.y = c.from + c.delta * smooth(p);
      },
    },
    // Turn toward the smell, then walk up it (but never onto the target).
    approach_odor: {
      ms: 1700,
      begin: (c) => {
        fly.setAction('gait', 1);
        c.from = root.rotation.y;
        c.delta = world.target ? shortestDelta(c.from, headingTo(world.target)) : 0;
      },
      tick: (p, c) => {
        root.rotation.y = c.from + c.delta * smooth(Math.min(1, p / 0.4));
        if (p < 0.3) return false;
        if (world.target && root.position.distanceTo(world.target) < 2.2) return true;
        return advance(2.4 * (c.dp / 0.7));
      },
    },
    // Dead hotspot nudge: idle head-tilt wobble. Reveals nothing about the answer.
    confused: {
      ms: 1300,
      begin: () => fly.setAction('stop'),
      tick: (p) => {
        fly.pose.headTilt = Math.sin(p * Math.PI * 4) * 0.5 * envelope(p, 0.2);
      },
    },
    // Shadow startle: non-punishing hop and spin. The game restores the fly's position afterwards.
    startle: {
      ms: 1100,
      begin: (c) => {
        fly.setAction('stop');
        c.from = root.rotation.y;
      },
      tick: (p, c) => {
        fly.pose.lift = Math.sin(Math.PI * p) * 0.7;
        fly.pose.flap = 1;
        fly.pose.spread = envelope(p, 0.2);
        root.rotation.y = c.from + Math.PI * 2 * smooth(p);
      },
    },
  };

  function finish() {
    if (!cur) return;
    fly.setAction('stop');
    fly.resetPose();
    cur = null;
  }

  return {
    // Starts a behavior, cancelling whatever is running. Unknown ids are ignored.
    start(id) {
      const def = BEHAVIORS[id];
      if (!def) return;
      finish();
      cur = { id, def, t: 0, p: 0, dp: 0 };
      def.begin?.(cur);
    },

    stop: finish,

    // Advance the running behavior by dtMs. Returns the id of a behavior that just ended, or null.
    update(dtMs) {
      if (!cur || cur.def.hold) return null;
      const prev = cur.p;
      cur.t += dtMs;
      cur.p = Math.min(1, cur.t / cur.def.ms);
      cur.dp = cur.p - prev;
      const halted = cur.def.tick?.(cur.p, cur) === true;
      if (halted || cur.p >= 1) {
        const id = cur.id;
        finish();
        return id;
      }
      return null;
    },

    get current() {
      return cur ? cur.id : null;
    },
  };
}

export const pulseMsFor = (behaviorId) =>
  behaviorId === 'freeze_stop' || behaviorId === 'escape_takeoff' ? FAST_PULSE_MS : PULSE_MS;
