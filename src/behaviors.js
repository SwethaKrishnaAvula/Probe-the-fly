// Scripted fly behaviors. Every behavior is hand-authored animation (read.md rule 20: the last step
// from motor output to animation is hand-authored). The step sizes below were tuned so the levels in
// levels.json are winnable in their shortest solutions below, with the kitchen's real layout (kitchen.js SCENES).
// Each level's click_budget in levels.json is double its shortest solution, so a player has room to explore and err:
//   level 2: turn_right, walk_forward, walk_forward, feed        (4 clicks, budget 8)
//   level 3: the same, plus a freeze_stop for the smoke          (5 clicks, budget 10)
//   level 4: turn_right x3 (turn_left is dead), walk_forward, feed  (5 clicks, budget 10)
//   level 5: object_track, approach_odor, wing_song              (3 clicks, budget 6)
// Changing FLY_DIST, TURN_RAD or TURN_FORWARD, or a start or pie in kitchen.js, changes that: re-check the levels.

// walk_forward is a short straight flight: the fly lifts off, beats both wings equally, flies a fixed distance
// and lands. (The behavior id stays walk_forward because levels.json and the notebook use it.)
export const FLY_DIST = 10.3; // arena units per walk_forward
export const FLY_MS = 2400;
const FLY_LIFT = 0.55;
// The escape: the giant fiber's jump, then a sustained forward flight (escape_takeoff is the jump alone).
const ESCAPE_MS = 3400;
const ESCAPE_DIST = 6.0;
const ESCAPE_LIFT = 1.3;
// Object tracking: pursue. Swivel toward the target (if the level has one), then fly forward.
const TRACK_MS = 2000;
const TRACK_DIST = 3.5;
// A turn is an airborne arc: the fly lifts off, beats its wings (the one on the OUTSIDE of the turn harder, so a left
// turn is driven by the right wing), banks into the turn, flies a short way forward and lands.
export const TURN_RAD = Math.PI / 2; // per turn click: 90 degrees
export const TURN_MS = 1300;
export const TURN_FORWARD = 1.0; // forward travel over the whole turn
const TURN_LIFT = 0.55; // how high the fly rises during a turn
const TURN_BANK = 0.4; // radians of roll into the turn

// Time the light pulse takes to travel along the neuron before the fly reacts (visual delay only).
export const PULSE_MS = 450;
const FAST_PULSE_MS = 220; // escape and freeze circuits are the fast ones

const smooth = (p) => p * p * (3 - 2 * p);
// 0 -> 1 -> 0 with flat top: ramp up over `edge`, hold, ramp down.
const envelope = (p, edge = 0.2) => smooth(Math.min(1, p / edge, (1 - p) / edge));
const shortestDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function createBehaviorRunner(fly, world) {
  // world: { bounds: {minX,maxX,minZ,maxZ}, pie: {pos, radius} | null, target: Vector3 | null }
  let cur = null;
  const root = fly.object;

  // Move along the fly's facing. Returns true if the move should halt (arena edge, or reached the pie when
  // stopAtPie is set). Flights cover a fixed distance and land themselves, so they do not stop at the pie.
  function advance(dist, { stopAtPie = false } = {}) {
    root.translateZ(dist);
    const b = world.bounds;
    const p = root.position;
    let halt = false;
    if (p.x < b.minX || p.x > b.maxX || p.z < b.minZ || p.z > b.maxZ) {
      p.x = Math.min(b.maxX, Math.max(b.minX, p.x));
      p.z = Math.min(b.maxZ, Math.max(b.minZ, p.z));
      halt = true;
    }
    if (stopAtPie && world.pie && dist > 0) {
      // A fly stops when it reaches pie, which also keeps a long walk from overshooting the radius.
      const dx = p.x - world.pie.pos.x;
      const dz = p.z - world.pie.pos.z;
      if (Math.hypot(dx, dz) <= world.pie.radius) halt = true;
    }
    return halt;
  }

  const headingTo = (target) => Math.atan2(target.x - root.position.x, target.z - root.position.z);

  // dir: 1 = left, -1 = right (the fly's left is +X, and +rotation.y turns left).
  const turn = (dir) => ({
    ms: TURN_MS,
    begin: () => fly.setAction('stop'), // legs off the ground, not walking
    tick: (p, c) => {
      const air = envelope(p, 0.25); // 0 on the ground, 1 while airborne
      fly.pose.lift = TURN_LIFT * air;
      fly.pose.spread = 0.6 * air;
      const outside = 1;
      const inside = 0.35;
      fly.pose.flapLeft = (dir > 0 ? inside : outside) * air; // left turn: the right wing does the work
      fly.pose.flapRight = (dir > 0 ? outside : inside) * air;
      fly.pose.roll = -dir * TURN_BANK * air; // bank into the turn
      root.rotation.y += dir * TURN_RAD * c.dp;
      return advance(TURN_FORWARD * c.dp);
    },
  });

  const BEHAVIORS = {
    walk_forward: {
      ms: FLY_MS,
      begin: () => fly.setAction('stop'), // legs off the ground: this is flight, not walking
      tick: (p, c) => {
        const air = envelope(p, 0.15); // 0 on the ground, 1 while airborne
        fly.pose.lift = FLY_LIFT * air;
        fly.pose.spread = 0.6 * air;
        fly.pose.flapLeft = air; // straight flight: both wings beat equally
        fly.pose.flapRight = air;
        return advance(FLY_DIST * c.dp);
      },
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
    // Jump, then keep flying: a quick rise with the wings buzzing hard, a long forward flight up in the air, then down.
    escape_flight: {
      ms: ESCAPE_MS,
      begin: () => fly.setAction('stop'),
      tick: (p, c) => {
        const air = Math.min(smooth(Math.min(1, p / 0.2)), smooth(Math.min(1, (1 - p) / 0.15)));
        fly.pose.flap = air;
        fly.pose.spread = 0.8 * air;
        fly.pose.lift = (ESCAPE_LIFT + 0.08 * Math.sin(p * 30)) * air;
        fly.pose.pitch = 0.35 * (1 - smooth(Math.min(1, p / 0.3))) * air; // nose up in the jump, level in the flight
        return p > 0.12 && p < 0.9 ? advance((ESCAPE_DIST * c.dp) / 0.78) : false;
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
    // Pursuit: the whole body swivels toward the target (if there is one), then the fly flies forward after it, up in
    // the air with both wings beating. It never flies onto the target. With no target (the discovery level) it
    // simply flies forward.
    object_track: {
      ms: TRACK_MS,
      begin: (c) => {
        fly.setAction('stop'); // flying, not walking
        c.from = root.rotation.y;
        c.delta = world.target ? shortestDelta(c.from, headingTo(world.target)) : 0;
      },
      tick: (p, c) => {
        const air = envelope(p, 0.2);
        fly.pose.lift = FLY_LIFT * air;
        fly.pose.spread = 0.6 * air;
        fly.pose.flapLeft = air;
        fly.pose.flapRight = air;
        root.rotation.y = c.from + c.delta * smooth(Math.min(1, p / 0.4)); // swivel first
        if (p < 0.25) return false;
        if (world.target && Math.hypot(world.target.x - root.position.x, world.target.z - root.position.z) < 2.2) return true;
        return advance((TRACK_DIST * c.dp) / 0.75);
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
    // Hit something solid: a quick recoil, a hop and a dizzy wobble. collisions.js puts the fly back afterwards.
    bonk: {
      ms: 1000,
      begin: () => fly.setAction('stop'),
      tick: (p, c) => {
        root.translateZ(-1.4 * c.dp * (1 - p)); // knocked back
        fly.pose.lift = Math.sin(Math.PI * Math.min(1, p * 1.4)) * 0.35;
        fly.pose.roll = 0.5 * Math.sin(p * 16) * (1 - p);
        fly.pose.headTilt = 0.5 * Math.sin(p * 20) * (1 - p);
        fly.pose.flap = 0.3 * (1 - p);
      },
    },
    // Fell in the sink: sinks into the water, soaked, wings drooping, then shakes itself off.
    soaked: {
      ms: 1900,
      begin: (c) => {
        fly.setAction('stop');
        c.y0 = root.position.y;
      },
      tick: (p, c) => {
        const wet = envelope(p, 0.12);
        root.position.y = c.y0 - 0.34 * wet;
        fly.pose.wet = wet;
        fly.pose.headDip = 0.5 * wet;
        fly.pose.roll = 0.22 * Math.sin(p * 46) * wet * (p > 0.4 ? 1 : 0.3); // the shakes
        fly.pose.flapLeft = p > 0.45 ? 0.3 * (1 - p) : 0;
        fly.pose.flapRight = fly.pose.flapLeft;
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
