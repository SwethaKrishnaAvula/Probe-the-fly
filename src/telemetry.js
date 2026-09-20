// Records every probe and every mistake so the game can be personalised (Tiger Cloud, via /api, see server/app.py).
// One event per hotspot click, resolved when the behavior it triggered has finished:
//   hotspot_id   the level-file id of the behavior (turn_right, feed, ...): what weak_spot.py groups by
//   correct      true / false, or null where nothing is scored (the discovery level, or a behavior with no goal)
//   response_ms  how long the player took: from the fly being ready (level card closed or last behavior over) to the click
//   mistake      null, or why: bonk:<thing>, soaked:sink, wrong_hotspot, dead_hotspot, half_hearted_song, missed_pie
// The game never waits on the network: events queue in memory (and localStorage) and retry.

const ENDPOINT = '/api/events';
const FLUSH_MS = 4000;
const MAX_QUEUE = 500;
const PLAYER_KEY = 'probefly.player_id';
const QUEUE_KEY = 'probefly.event_queue';
const THRESHOLD_WINDOW_MS = 4000; // level 5: the same window game.js uses

const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : '00000000-0000-4000-8000-' + String(Date.now()).padStart(12, '0'));

function store(op, key, value) {
  try {
    return op === 'get' ? localStorage.getItem(key) : op === 'set' ? localStorage.setItem(key, value) : localStorage.removeItem(key);
  } catch {
    return null; // private window, blocked storage: fine, just not remembered
  }
}

export function getPlayerId() {
  let id = store('get', PLAYER_KEY);
  if (!id) {
    id = uuid();
    store('set', PLAYER_KEY, id);
  }
  return id;
}

// level: a levels.json level. world: arena.world (pie, target). getPos: () => the fly's position.
export function createTelemetry({ level, world, getPos, fetchImpl = globalThis.fetch?.bind(globalThis), now = () => performance.now(), wall = () => Date.now() }) {
  const playerId = getPlayerId();
  const sessionId = uuid();
  let queue = [];
  try {
    queue = JSON.parse(store('get', QUEUE_KEY) || '[]');
  } catch {
    queue = [];
  }
  let readyAt = null; // when the player could next click
  let open = null; // the probe in flight
  const cues = {}; // level 5: when object_track / approach_odor finished
  let warned = false;

  const pieDist = () => (world.pie ? Math.hypot(getPos().x - world.pie.pos.x, getPos().z - world.pie.pos.z) : null);
  const persist = () => store('set', QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));

  // Sends everything queued, in batches. One flush runs at a time; a caller during a flush gets the same promise.
  let inflight = null;
  function flush({ keepalive = false } = {}) {
    if (inflight || !queue.length || !fetchImpl) return inflight ?? Promise.resolve();
    inflight = (async () => {
      try {
        while (queue.length) {
          const batch = queue.slice(0, 100);
          const res = await fetchImpl(ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ player_id: playerId, session_id: sessionId, events: batch }),
            keepalive,
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          queue = queue.slice(batch.length);
          persist();
        }
      } catch (err) {
        if (!warned) console.warn('telemetry: could not reach the API, will retry.', err?.message ?? err);
        warned = true;
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  }

  function push(ev) {
    queue.push(ev);
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    persist();
    flush();
  }

  const timer = setInterval(flush, FLUSH_MS);
  if (typeof addEventListener === 'function') addEventListener('pagehide', () => flush({ keepalive: true }));

  // Decide correctness once the behavior is over. Returns { correct, mistake }.
  function judge(p, mishap) {
    if (level.type === 'discovery') return { correct: null, mistake: mishap };
    if (!level.hotspots.includes(p.hotspot)) return { correct: false, mistake: 'wrong_hotspot' };
    if (level.dead_hotspot === p.hotspot) return { correct: false, mistake: 'dead_hotspot' };
    if (mishap) return { correct: false, mistake: mishap };

    if (level.arena?.target) {
      // Threshold: both cues, then the song inside the window.
      if (p.hotspot === 'object_track' || p.hotspot === 'approach_odor') {
        cues[p.hotspot] = p.endedAt;
        return { correct: true, mistake: null };
      }
      if (p.hotspot === 'wing_song') {
        const a = cues.object_track;
        const b = cues.approach_odor;
        const ready = a != null && b != null && p.clickedAt - Math.max(a, b) <= THRESHOLD_WINDOW_MS;
        return ready ? { correct: true, mistake: null } : { correct: false, mistake: 'half_hearted_song' };
      }
      return { correct: null, mistake: null };
    }
    if (world.pie) {
      const d = pieDist();
      if (p.hotspot === 'feed') return d <= world.pie.radius ? { correct: true, mistake: null } : { correct: false, mistake: 'missed_pie' };
      if (p.startDist != null && d != null && ['walk_forward', 'turn_left', 'turn_right', 'escape_takeoff', 'object_track', 'approach_odor'].includes(p.hotspot)) {
        // a move is right if it did not take the fly further from the pie (a turn keeps it about level)
        const tolerance = p.hotspot.startsWith('turn') ? 1.5 : 0;
        return d <= p.startDist + tolerance ? { correct: true, mistake: null } : { correct: false, mistake: 'moved_away' };
      }
    }
    return { correct: null, mistake: null }; // e.g. freeze_stop: no way to score it without the shadow
  }

  return {
    playerId,
    sessionId,

    // The player can act now: the level card closed, or the last behavior finished.
    ready() {
      readyAt = now();
    },

    // A hotspot was clicked.
    probe(hotspot) {
      const t = now();
      open = { hotspot, clickedAt: t, responseMs: readyAt == null ? null : Math.round(t - readyAt), wall: wall(), startDist: pieDist(), mishap: null };
    },

    // collisions.js reported a mishap: { kind: 'hit' | 'soaked', what }.
    mishap({ kind, what }) {
      if (open && !open.mishap) open.mishap = kind === 'soaked' ? `soaked:${what.replace('the ', '')}` : `bonk:${what}`;
    },

    // A behavior finished (the runner's update returned its id).
    behaviorEnded() {
      const t = now();
      readyAt = t;
      if (!open) return; // a bonk / confused animation after the probe was already resolved
      const p = open;
      open = null;
      p.endedAt = t;
      const { correct, mistake } = judge(p, p.mishap);
      push({
        hotspot_id: p.hotspot,
        level_id: level.id,
        behavior_id: p.hotspot,
        correct,
        response_ms: p.responseMs,
        notebook_visible: !!level.notebook_visible,
        mistake,
        time: new Date(p.wall).toISOString(),
      });
    },

    flush,
    stop: () => clearInterval(timer),
    get pending() {
      return queue.length;
    },
  };
}
