import takeoffUrl from './assets/sfx-takeoff.mp3?url';
import restUrl from './assets/sfx-rest.mp3?url';

// Sound that follows what the fly is doing, laid over the quiet background music (music.js):
//   takeoff.mp3  only while the fly is in the air: a flight, a turn, the escape, tracking, the startle, the fly-in
//   rest.mp3     whenever anything else is happening: a hotspot's pulse travelling, or any other movement / behavior
//   silence      when nothing is going on
// The two never play together. The sound starts when the state starts and fades out when it ends, so a clip is
// heard only for as long as the thing it goes with lasts (both clips loop if that is longer than the 2.35 s clip).
// Built on Web Audio so the quieter clip can be boosted above 1.0 (an <audio> element cannot go louder than its file).

// rest.mp3 is about 3.5 dB quieter than takeoff.mp3, so it is lifted to match. Both sit well above the background music.
const GAIN = { takeoff: 1.0, rest: 1.5 };
const FADE_IN_S = 0.04;
const FADE_OUT_S = 0.15;

export function createSfx() {
  const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
  let ctx = null;
  try {
    ctx = Ctx ? new Ctx() : null;
  } catch {
    ctx = null; // no audio available: the game is silent, never broken
  }
  const buffers = {};
  let current = null; // { name, src, gain }
  const history = []; // recent state changes, for checking

  async function load(name, url) {
    if (!ctx) return;
    try {
      const data = await (await fetch(url)).arrayBuffer();
      buffers[name] = await ctx.decodeAudioData(data);
    } catch {
      /* a missing or undecodable clip just stays silent */
    }
  }
  load('takeoff', takeoffUrl);
  load('rest', restUrl);

  // Browsers keep audio suspended until the player has clicked, touched or pressed something.
  const wake = () => ctx?.state === 'suspended' && ctx.resume().catch(() => {});
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => window.addEventListener(ev, wake));

  function stop(playing) {
    if (!playing) return;
    const t = ctx.currentTime;
    playing.gain.gain.cancelScheduledValues(t);
    playing.gain.gain.setValueAtTime(playing.gain.gain.value, t);
    playing.gain.gain.linearRampToValueAtTime(0, t + FADE_OUT_S);
    playing.src.stop(t + FADE_OUT_S + 0.02);
  }

  function start(name) {
    const buffer = buffers[name];
    if (!ctx || !buffer) return null;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(GAIN[name], t + FADE_IN_S);
    src.connect(gain).connect(ctx.destination);
    src.start(t);
    return { name, src, gain };
  }

  let state = null;
  return {
    // Call every frame. flying: the fly is in the air. active: something else is going on (a pulse, any behavior).
    update({ flying, active }) {
      const want = flying ? 'takeoff' : active ? 'rest' : null;
      if (want === state) return;
      stop(current);
      current = want ? start(want) : null;
      state = want;
      history.push(want);
      if (history.length > 200) history.shift();
    },
    get state() {
      return state;
    },
    history,
    get context() {
      return ctx;
    },
    get loaded() {
      return { takeoff: !!buffers.takeoff, rest: !!buffers.rest };
    },
  };
}
