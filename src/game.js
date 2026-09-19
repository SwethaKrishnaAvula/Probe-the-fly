import { pulseMsFor } from './behaviors.js';

// Level flow and rules, driven entirely by levels.json. Hotspot ids in the level file are
// descriptive placeholders; each one names the behavior it triggers until hotspots.json exists.

const PROBES_TO_UNLOCK = 5; // level 1: "at least 5 of the 8 hotspots probed"
const THRESHOLD_WINDOW_MS = 4000; // level 5: threshold_window_ms
const DEAD_CLICKS_FOR_NUDGE = 2; // level 4: confused animation from the 2nd dead click
const STARTLE_MS = 1200;
const STARTLE_GRACE_MS = 1500; // after a startle the shadow clock rewinds so the retry is not instant
const ENDING_MS = 2200; // let the last behavior play out before the result card
// Provisional scoring, until Shreya's scoring.json lands.
const WIN_POINTS = 100;
const POINTS_PER_CLICK_LEFT = 25;

export function createGame({ levels, entries, brain, arena, fly, runner, hud, capture }) {
  let idx = 0;
  let level = null;
  let phase = 'idle'; // idle | intro | play | startle | ending
  let budget = null;
  let score = 0;
  let lastGain = 0;
  let now = 0;
  let epoch = 0; // bumped when a level loads or a startle resets the scene; stale timers are dropped
  let timers = [];
  let pulseBusy = false;
  let pulseId = null; // hotspot whose pulse is currently travelling

  let probed = new Set();
  let counts = new Map();
  let deadClicks = 0;
  let landedAt = {}; // level 5: when object_track and approach_odor landed
  let clock = null; // shadow clock in ms, starts at the first click of the level
  let snapshot = null; // fly state just before the shadow event

  const after = (ms, fn) => timers.push({ at: now + ms, fn, epoch });

  function loadLevel(i) {
    idx = i;
    level = levels[i];
    epoch++;
    timers = [];
    runner.stop();
    fly.object.position.set(0, 0, 0);
    fly.object.rotation.y = 0;
    arena.configure(level.arena);
    brain.setAvailable(level.hotspots);
    brain.setHint(level.first_click_hint ?? null);

    budget = level.click_budget;
    pulseBusy = false;
    pulseId = null;
    probed = new Set();
    counts = new Map();
    deadClicks = 0;
    landedAt = {};
    clock = null;
    snapshot = null;
    lastGain = 0;

    hud.setLevel({ index: i, total: levels.length, level });
    hud.setNotebookVisible(level.notebook_visible);
    refreshClicks();
    refreshAction();
    hud.setScore(score);
    phase = 'intro';
    hud.showIntro(level, () => {
      hud.hideOverlay();
      phase = 'play';
    });
  }

  function refreshClicks() {
    hud.setClicks(budget, `${probed.size}/${level.hotspots.length}`);
  }

  // Level 1's "Start Task N" button. Task numbering counts from the level after discovery.
  function refreshAction() {
    if (level.type !== 'discovery') return hud.setAction(null);
    hud.setAction(`Start Task ${idx + 1}`, probed.size >= PROBES_TO_UNLOCK, () => nextLevel());
  }

  function nextLevel() {
    if (idx + 1 < levels.length) loadLevel(idx + 1);
    else hud.showFinished(score, () => {
      score = 0;
      loadLevel(0);
    });
  }

  function onPick(id) {
    if (phase !== 'play' || pulseBusy || !level.hotspots.includes(id)) return;

    if (budget != null) {
      budget--;
      refreshClicks();
    }
    if (level.arena?.shadow && clock == null) clock = 0;
    if (level.type === 'discovery') brain.setHint(null);

    const dead = level.dead_hotspot === id;
    const ms = pulseMsFor(id);
    pulseBusy = true;
    pulseId = id;
    brain.firePulse(id, ms, { fizzle: dead });
    const clickedAt = now;
    after(ms, () => land(id, dead, clickedAt));
  }

  // The pulse has arrived: decide what the fly does and whether that wins the level.
  function land(id, dead, clickedAt) {
    pulseBusy = false;
    pulseId = null;

    if (dead) {
      // A dead hotspot does nothing. From the 2nd click the fly idles confusedly; no hint about the answer.
      deadClicks++;
      if (deadClicks >= DEAD_CLICKS_FOR_NUDGE) runner.start('confused');
      return checkBudget();
    }

    let behavior = id;
    let won = false;

    if (level.arena?.target) {
      // Threshold level: build the case (both cues, any order), then sing within the window.
      if (id === 'object_track' || id === 'approach_odor') landedAt[id] = now;
      if (id === 'wing_song') {
        const a = landedAt.object_track;
        const b = landedAt.approach_odor;
        const ready = a != null && b != null && clickedAt - Math.max(a, b) <= THRESHOLD_WINDOW_MS;
        if (ready) won = true;
        else behavior = 'half_hearted_song';
      }
    } else if (id === 'feed' && arena.world.sugar) {
      const { pos, radius } = arena.world.sugar;
      won = fly.object.position.distanceTo(pos) <= radius;
    }

    runner.start(behavior);

    if (behavior === id) {
      counts.set(id, (counts.get(id) || 0) + 1);
      if (level.notebook_visible) {
        hud.recordProbe(id, entries[id] ?? '', counts.get(id));
        capture('brain', (url) => hud.setSnapshot(id, 'brain', url));
        after(700, () => capture('arena', (url) => hud.setSnapshot(id, 'arena', url)));
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

  function checkBudget() {
    if (budget != null && budget <= 0 && phase === 'play') {
      phase = 'ending';
      after(ENDING_MS, showFail);
    }
  }

  function win() {
    phase = 'ending';
    lastGain = WIN_POINTS + (budget ?? 0) * POINTS_PER_CLICK_LEFT;
    score += lastGain;
    hud.setScore(score);
    after(ENDING_MS, () =>
      hud.showResult({
        won: true,
        gained: lastGain,
        message: level.arena?.target ? 'She noticed.' : 'You got there and fed.',
        onRetry: retry,
        onNext: nextLevel,
        nextLabel: idx + 1 < levels.length ? 'Next level' : 'Finish',
      }),
    );
  }

  function showFail() {
    hud.showResult({
      won: false,
      message: 'The clicks ran out before it worked. Try again from memory.',
      onRetry: retry,
    });
  }

  function retry() {
    score -= lastGain; // a replayed win must not count twice
    loadLevel(idx);
  }

  // ---- Shadow (level 3) ----
  function startle() {
    phase = 'startle';
    epoch++; // drops any pulse still in flight
    timers = [];
    pulseBusy = false;
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
        showFail();
      }
    });
  }

  function updateShadow(dtMs) {
    const s = level.arena?.shadow;
    if (!s || clock == null || phase !== 'play') return;
    clock += dtMs;
    const [start, end] = s.active_window_ms;
    const warn = start - s.telegraph_lead_ms;
    if (clock >= warn && !snapshot) {
      snapshot = { pos: fly.object.position.clone(), rot: fly.object.rotation.y };
    }
    if (clock >= warn && clock < start) {
      arena.shadow.telegraph((clock - warn) / s.telegraph_lead_ms);
    } else if (clock >= start && clock <= end) {
      arena.shadow.sweep((clock - start) / (end - start));
      // Caught: inside the hit area and not in a freeze_stop state. A freeze click whose pulse is
      // already travelling counts, so the fast circuit's own delay cannot lose the race.
      const frozen = runner.current === 'freeze_stop' || pulseId === 'freeze_stop';
      if (arena.inHitArea(fly.object.position) && !frozen) startle();
    } else {
      arena.shadow.hide();
    }
  }

  return {
    start: () => loadLevel(0),

    onPick,

    update(dtMs) {
      now += dtMs;
      const due = timers.filter((t) => t.at <= now);
      if (due.length) {
        timers = timers.filter((t) => t.at > now);
        due.forEach((t) => t.epoch === epoch && t.fn());
      }
      runner.update(dtMs);
      updateShadow(dtMs);
    },
  };
}
