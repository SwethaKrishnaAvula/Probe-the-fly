import musicUrl from './assets/background-music.mp3?url';

// Quiet background music: one looping track, faded in gently. Browsers do not allow sound before the player has
// clicked or pressed something, so it starts on the first click, touch or key press (or straight away if the
// browser lets it). A small button at the top right turns it off and on, and the choice is remembered.

const VOLUME = 0.03; // quiet on purpose: the movement sounds (sfx.js) are laid clearly over it. (Was 0.05, and 0.14 before that.)
const FADE_MS = 3500;
const STORAGE_KEY = 'probefly.music';
const OLD_STORAGE_KEY = 'flybywire.music'; // the game's old name: still read, so a player who turned the music off keeps it off

export function createMusic() {
  const audio = new Audio(musicUrl);
  audio.loop = true;
  audio.preload = 'auto';
  audio.volume = 0;

  let wanted = true; // does the player want music?
  try {
    wanted = (localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(OLD_STORAGE_KEY)) !== 'off';
  } catch {
    /* storage can be blocked; music is then simply on */
  }
  let started = false;
  let fade = null;

  function fadeTo(target, ms) {
    cancelAnimationFrame(fade);
    const from = audio.volume;
    const t0 = performance.now();
    const step = (now) => {
      // Clamped both ways: a frame's timestamp can be a hair earlier than t0, and a negative k would set a negative
      // volume, which throws and stops the fade for good (the music then stays silent).
      const k = Math.min(1, Math.max(0, (now - t0) / ms));
      audio.volume = from + (target - from) * k;
      if (k < 1) fade = requestAnimationFrame(step);
      else if (target === 0) audio.pause();
    };
    fade = requestAnimationFrame(step);
  }

  async function play() {
    try {
      await audio.play();
      started = true;
      fadeTo(VOLUME, FADE_MS);
    } catch {
      /* blocked until the player does something: the gesture listeners below try again */
    }
  }

  const button = document.createElement('button');
  button.id = 'music-btn';
  const paint = () => {
    button.textContent = wanted ? 'Music on' : 'Music off';
    button.setAttribute('aria-pressed', String(wanted));
    button.title = wanted ? 'Turn the music off' : 'Turn the music on';
  };
  paint();
  button.addEventListener('click', (e) => {
    e.stopPropagation(); // this click is the toggle, not a gesture to start the music
    wanted = !wanted;
    try {
      localStorage.setItem(STORAGE_KEY, wanted ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    paint();
    if (wanted) play();
    else fadeTo(0, 600);
  });
  document.body.append(button);

  // The first click, touch or key press starts the music.
  const onGesture = () => {
    if (!wanted || started) return;
    play();
    if (started) removeGestureListeners();
  };
  const events = ['pointerdown', 'keydown', 'touchstart'];
  const removeGestureListeners = () => events.forEach((ev) => window.removeEventListener(ev, onGesture));
  events.forEach((ev) => window.addEventListener(ev, onGesture));

  // Silence while the tab is hidden; carry on when it comes back.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.pause();
    else if (wanted && started) audio.play().catch(() => {});
  });

  if (wanted) play(); // works if the browser already allows sound for this page
  return { audio, setVolume: (v) => (audio.volume = v) };
}
