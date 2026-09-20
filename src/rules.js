// Level rules, driven by levels.json: which hotspots are live, the click budget, win and fail, scoring, the lesion (a
// dead hotspot), the shadow (level 3) and the threshold cues (level 5). Ported from game.js, which drove the old
// placeholder brain; this drives the real hotspots ("pairs") and reports to telemetry.js at the moments it expects.
//
// A hotspot is picked by its behavior id (levels.json lists behavior ids, e.g. 'turn_right', 'feed'). Two hotspots can
// share one (escape left and right are both 'escape_takeoff'); either counts.

const PROBES_TO_UNLOCK = 5; // level 1: "at least 5 of the 8 hotspots probed"
const THRESHOLD_WINDOW_MS = 4000; // level 5: the same window telemetry.js judges by
const DEAD_CLICKS_FOR_NUDGE = 2; // level 4: the fly idles confusedly from the 2nd dead click
const STARTLE_MS = 1200;
const STARTLE_GRACE_MS = 1500; // after a startle the shadow clock rewinds, so the retry is not instant
const RESULT_DELAY_MS = 700; // after the last behavior finishes, before the result card
// Provisional scoring until Shreya's scoring.json arrives.
const WIN_POINTS = 100;
const POINTS_PER_CLICK_LEFT = 25;
const HOLD = 'freeze_stop'; // a behavior that never ends by itself: it must not lock the player out

// ctx: { levels, entries, arena, fly, runner, hud, pairs, capture(which, cb), getTelemetry(), beforeMove(),
//        onProbe(behaviorId), enterLevel(index) }
import { layoutCount, layoutId as makeLayoutId } from './kitchenScenes.js';

export function createRules(ctx) {
  const { levels, entries, arena, fly, runner, hud, pairs } = ctx;
  const T = () => ctx.getTelemetry?.();

  let idx = 0;
  let variant = 0; // which arrangement of the kitchen this attempt is on (kitchenScenes.js); 0 is the original
  let attempt = 1; // which try at this level
  let lastOutcome = null; // 'win' | 'loss' for the attempt that just ended
  let attemptLogged = false;
  let level = null;
  let phase = 'idle'; // idle | intro | play | startle | ending
  let budget = null;
  let score = 0;
  let lastGain = 0;
  let now = 0; // game time in ms, advanced by update()
  let epoch = 0; // bumped on a new level or a startle; callbacks from before it are dropped
  let timers = [];
  let pulseId = null; // the behavior whose pulse is travelling now

  let probed = new Set();
  let counts = new Map();
  let deadClicks = 0;
  let cueEnded = {}; // level 5: when object_track and approach_odor finished (wall clock, like telemetry.js)
  let clock = null; // shadow clock in ms, starts at the level's first click
  let snapshot = null; // the fly just before the shadow event
  let pendingResult = null; // a result card waiting for the last behavior to finish

  const after = (ms, fn) => timers.push({ at: now + ms, fn, epoch });
  const busy = () => pairs.some((p) => p.busy) || (runner.current != null && runner.current !== HOLD);
  const wall = () => performance.now();
  const pieDist = () => {
    const pie = arena.world.pie;
    return pie ? Math.hypot(fly.object.position.x - pie.pos.x, fly.object.position.z - pie.pos.z) : Infinity;
  };

  function refreshClicks() {
    hud.setClicks(budget, `${probed.size}/${level.hotspots.length}`);
  }

  // Level 1's "Start Task N" button. Task numbering counts from the level after discovery.
  function refreshAction() {
    if (level.type !== 'discovery') return hud.setAction(null);
    hud.setAction(`Start Task ${idx + 1}`, probed.size >= PROBES_TO_UNLOCK, () => nextLevel());
  }

  // Start level i: a new level begins on its original layout, a retry passes the layout and attempt it wants.
  function go(i, v = 0, n = 1) {
    variant = v;
    attempt = n;
    ctx.enterLevel(i, { variant: v, attempt: n });
  }

  function nextLevel() {
    if (idx + 1 < levels.length) go(idx + 1);
    else
      hud.showFinished(score, () => {
        score = 0;
        go(0);
      });
  }

  // After a loss the kitchen is rearranged: the next layout in the level's set, same hotspots, same way to win it.
  // After a win, a replay keeps the layout the player just beat.
  function retry() {
    score -= lastGain; // a replayed win must not count twice
    const next = lastOutcome === 'loss' ? (variant + 1) % layoutCount(level.id) : variant;
    go(idx, next, attempt + 1);
  }

  // Record how this attempt ended (once): to Tiger, with the layout it was played on.
  function logAttempt(outcome) {
    lastOutcome = outcome;
    if (attemptLogged) return;
    attemptLogged = true;
    T()?.attemptEnded({ outcome, clicksUsed: level.click_budget != null ? level.click_budget - budget : null });
  }

  function showFail() {
    logAttempt('loss');
    hud.showResult({ won: false, message: 'The clicks ran out before it worked. Try again from memory.', onRetry: retry });
  }

  function win() {
    phase = 'ending';
    logAttempt('win');
    lastGain = WIN_POINTS + (budget ?? 0) * POINTS_PER_CLICK_LEFT;
    score += lastGain;
    hud.setScore(score);
    pendingResult = () =>
      hud.showResult({
        won: true,
        gained: lastGain,
        message: level.arena?.target ? 'She noticed.' : 'You got there and fed.',
        onRetry: retry,
        onNext: nextLevel,
        nextLabel: idx + 1 < levels.length ? 'Next level' : 'Finish',
      });
  }

  function checkBudget() {
    if (budget != null && budget <= 0 && phase === 'play') {
      phase = 'ending';
      pendingResult = showFail;
    }
  }

  // The pulse has arrived: decide what the fly does and whether that wins the level.
  function land(pair, dead, clickedAt, myEpoch) {
    if (myEpoch !== epoch) return; // the level was reset (a startle, a retry) while the pulse travelled
    pulseId = null;
    const id = pair.behaviorId;

    if (dead) {
      // A dead hotspot does nothing. From the 2nd click the fly idles confusedly; no hint about the answer.
      T()?.behaviorEnded(); // resolves the probe (telemetry judges it dead_hotspot)
      deadClicks++;
      if (deadClicks >= DEAD_CLICKS_FOR_NUDGE) {
        ctx.beforeMove?.();
        runner.start('confused');
      }
      return checkBudget();
    }

    let behavior = pair.playBehavior ?? id; // what the fly performs (the escape hotspot plays escape_flight)
    const intended = behavior;
    let won = false;

    if (level.arena?.target) {
      // Threshold level: build the case (both cues, any order), then sing within the window.
      if (id === 'wing_song') {
        const a = cueEnded.object_track;
        const b = cueEnded.approach_odor;
        const ready = a != null && b != null && clickedAt - Math.max(a, b) <= THRESHOLD_WINDOW_MS;
        if (ready) won = true;
        else behavior = 'half_hearted_song';
      }
    } else if (id === 'feed' && arena.world.pie) {
      won = pieDist() <= arena.world.pie.radius;
    }

    ctx.beforeMove?.();
    runner.start(behavior);
    if (behavior === HOLD) T()?.behaviorEnded(); // a hold never "ends", so resolve the probe now

    if (behavior === intended) {
      counts.set(id, (counts.get(id) || 0) + 1);
      if (level.notebook_visible) {
        hud.recordProbe(id, entries[id] ?? '', counts.get(id));
        ctx.capture('brain', (url) => hud.setSnapshot(id, 'brain', url));
        after(700, () => ctx.capture('arena', (url) => hud.setSnapshot(id, 'arena', url)));
      }
    }

    if (level.type === 'discovery') {
      probed.add(id);
      refreshClicks();
      refreshAction();
    }

    if (won) return win();
    checkBudget();
  }

  // ---- Shadow (level 3) ----
  function startle() {
    phase = 'startle';
    epoch++; // drops any pulse still in flight
    timers = [];
    pulseId = null;
    if (budget != null) budget = Math.max(0, budget - 1);
    refreshClicks();
    arena.shadow.hide();
    runner.start('startle');
    const s = level.arena.shadow;
    const saved = snapshot;
    after(STARTLE_MS, () => {
      runner.stop();
      fly.object.position.copy(saved.pos);
      fly.object.rotation.y = saved.rot;
      clock = s.active_window_ms[0] - s.telegraph_lead_ms - STARTLE_GRACE_MS;
      snapshot = null;
      phase = 'play';
      if (budget <= 0) {
        phase = 'ending';
        pendingResult = showFail;
      }
    });
  }

  function updateShadow(dtMs) {
    const s = level.arena?.shadow;
    if (!s || clock == null || phase !== 'play') return;
    clock += dtMs;
    const [start, end] = s.active_window_ms;
    const warn = start - s.telegraph_lead_ms;
    if (clock >= warn && !snapshot) snapshot = { pos: fly.object.position.clone(), rot: fly.object.rotation.y };
    if (clock >= warn && clock < start) {
      arena.shadow.telegraph((clock - warn) / s.telegraph_lead_ms);
    } else if (clock >= start && clock <= end) {
      arena.shadow.sweep((clock - start) / (end - start));
      // Caught: inside the hit area and not frozen. A freeze click whose pulse is already travelling counts, so the
      // fast circuit's own delay cannot lose the race.
      const frozen = runner.current === HOLD || pulseId === HOLD;
      if (arena.inHitArea(fly.object.position) && !frozen) startle();
    } else {
      arena.shadow.hide();
    }
  }

  return {
    // Which hotspots the player may click in this level.
    isLive: (pair) => !!level && level.hotspots.includes(pair.behaviorId),

    // A level is starting (the world is already set up by the caller): HUD, live circuits, hint, budget.
    setLevel(i) {
      idx = i;
      level = levels[i];
      epoch++;
      timers = [];
      pendingResult = null;
      budget = level.click_budget;
      pulseId = null;
      probed = new Set();
      counts = new Map();
      deadClicks = 0;
      cueEnded = {};
      clock = null;
      snapshot = null;
      lastGain = 0;
      lastOutcome = null;
      attemptLogged = false;
      phase = 'intro';
      pairs.forEach((p) => {
        p.setLive(level.hotspots.includes(p.behaviorId));
        p.setHint(level.first_click_hint === p.behaviorId);
      });
      hud.setLevel({ index: i, total: levels.length, level });
      hud.setNotebookVisible(level.notebook_visible);
      hud.setScore(score);
      refreshClicks();
      refreshAction();
    },

    // The fly has landed: show the level card, then play.
    begin() {
      hud.showIntro(level, () => {
        hud.hideOverlay();
        phase = 'play';
        T()?.ready();
      });
    },

    // The player clicked a hotspot. Returns true if the click was taken.
    onPick(pair) {
      const id = pair.behaviorId;
      if (phase !== 'play' || busy() || !level.hotspots.includes(id)) return false;
      if (budget != null) {
        budget--;
        refreshClicks();
      }
      if (level.arena?.shadow && clock == null) clock = 0;
      if (level.first_click_hint) pairs.forEach((p) => p.setHint(false));
      ctx.onProbe?.(id);
      T()?.probe(id);
      const dead = level.dead_hotspot === id;
      pulseId = id;
      const clickedAt = wall();
      const myEpoch = epoch;
      pair.firePulse(() => land(pair, dead, clickedAt, myEpoch), { fizzle: dead });
      return true;
    },

    // The runner finished a behavior (its id).
    onBehaviorEnded(id) {
      if (level?.arena?.target && (id === 'object_track' || id === 'approach_odor')) cueEnded[id] = wall();
    },

    update(dtMs) {
      now += dtMs;
      const due = timers.filter((t) => t.at <= now);
      if (due.length) {
        timers = timers.filter((t) => t.at > now);
        due.forEach((t) => t.epoch === epoch && t.fn());
      }
      // The result card waits for the last behavior to play out.
      if (pendingResult && !busy()) {
        const show = pendingResult;
        pendingResult = null;
        after(RESULT_DELAY_MS, show);
      }
      if (level) updateShadow(dtMs);
    },

    // The heading was clicked: a fresh run from the Discovery Lab. Score, notebook and level state reset; what the
    // player did before stays in Tiger (telemetry.js keeps the same anonymous player id).
    restart() {
      score = 0;
      hud.setScore(0);
      hud.clearNotebook();
      hud.hideOverlay();
      go(0);
    },

    get score() {
      return score;
    },
    get phase() {
      return phase;
    },
    get budget() {
      return budget;
    },
  };
}
