import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createPane } from './pane.js';
import { createFly } from './fly.js';
import { createPicker } from './picking.js';
import { createKitchen as createArena } from './kitchen.js';
import { createBehaviorRunner } from './behaviors.js';
import { createNeuronPair, linkPairs } from './neuronPath.js';
import { createStandInHotspot } from './standIn.js';
import { createRules } from './rules.js';
import { createHud } from './hud.js';
import { createMusic } from './music.js';
import { createSfx } from './sfx.js';
import { createLookControls } from './lookControls.js';
import { createCollisions } from './collisions.js';
import { createIntro } from './intro.js';
import { createTelemetry } from './telemetry.js';

// Left pair (turn_left) and right pair (turn_right), straight from the repo's geometry and handoff files.
// The right handoff's pulse timing is the filled version from the filling-json branch (main still has nulls).
import metaL from '../game_data/geometry/DNa02_L_projection/geometry_metadata.json';
import handoffL from '../path_jsons/math_filled/Turn_Left_DNa02_L_handoff.json';
import glbLUrl from '../game_data/geometry/DNa02_L_projection/DNa02_L_523769_to_801548.glb?url';
import swcL1Url from '../game_data/geometry/DNa02_L_projection/523769.swc?url';
import swcL2Url from '../game_data/geometry/DNa02_L_projection/801548.swc?url';
import metaR from '../game_data/geometry/DNa02_R_projection/geometry_metadata_right.json';
import handoffR from '../path_jsons/math_filled/Turn_Right_DNa02_R_handoff.json';
import glbRUrl from '../game_data/geometry/DNa02_R_projection/DNa02_R_10360_801946.glb?url';
import swcR1Url from '../game_data/geometry/DNa02_R_projection/10360.swc?url';
import swcR2Url from '../game_data/geometry/DNa02_R_projection/801946.swc?url';
// Feeding pathway (AN13B002_R -> AN05B099 -> DNge032 -> MN8). Its metadata is derived from the SWC files by
// scripts/derive_geometry_metadata.mjs (not provided yet); replace with the real file when it arrives.
import metaFeed from '../game_data/geometry/AN13B002-feeding/geometry_metadata_derived.json';
import handoffFeed from '../path_jsons/math_filled/feed_AN13B002_R_handoff.json';
import glbFeedUrl from '../game_data/geometry/AN13B002-feeding/feed_AN13B002_R.glb?url';
import swcFeed1Url from '../game_data/geometry/AN13B002-feeding/21763.swc?url';
import swcFeed2Url from '../game_data/geometry/AN13B002-feeding/15758.swc?url';
import swcFeed3Url from '../game_data/geometry/AN13B002-feeding/11063.swc?url';
import swcFeed4Url from '../game_data/geometry/AN13B002-feeding/16827.swc?url';
// Wing song (pIP10_L -> TN1a_i -> hg1 MN). Metadata derived by scripts/derive_geometry_metadata.mjs (none provided yet).
import metaWing from '../game_data/geometry/geometry_pIP10_L/geometry_metadata_derived.json';
import handoffWing from '../path_jsons/math_filled/wing_song_pIP10_L_handoff.json';
import glbWingUrl from '../game_data/geometry/geometry_pIP10_L/wing_song_pIP10_L.glb?url';
import swcWing1Url from '../game_data/geometry/geometry_pIP10_L/523998.swc?url';
import swcWing2Url from '../game_data/geometry/geometry_pIP10_L/804090.swc?url';
import swcWing3Url from '../game_data/geometry/geometry_pIP10_L/800241.swc?url';
// Object tracking (LC10a_L -> AOTU041 -> AOTU064 -> aSP22). Real metadata from the geometry team.
import metaTrack from '../game_data/geometry/object_track_LC10a_L/geometry_metadata_object_track_LC10a_L.json';
import handoffTrack from '../path_jsons/math_filled/object_track_LC10a_L_handoff.json';
import glbTrackUrl from '../game_data/geometry/object_track_LC10a_L/object_track_LC10a_L.glb?url';
import swcTrack1Url from '../game_data/geometry/object_track_LC10a_L/23989.swc?url';
import swcTrack2Url from '../game_data/geometry/object_track_LC10a_L/10148.swc?url';
import swcTrack3Url from '../game_data/geometry/object_track_LC10a_L/11445.swc?url';
import swcTrack4Url from '../game_data/geometry/object_track_LC10a_L/10090.swc?url';

// Escape (giant fiber DNp01, left and right). Each GF neuron drives a jump path and a flight path; the four circuits
// are linked into two hotspots (GF_L, GF_R) that fire both paths at once. The geometry metadata for these has no
// click point, so scripts/derive_geometry_metadata.mjs derived it (its normalization matches the real files exactly).
import metaJumpL from '../game_data/geometry/DNp01_GF_escape_circuit/geometry_metadata_derived_escape_jump_L.json';
import metaJumpR from '../game_data/geometry/DNp01_GF_escape_circuit/geometry_metadata_derived_escape_jump_R.json';
import metaFlightL from '../game_data/geometry/DNp01_GF_escape_circuit/geometry_metadata_derived_escape_flight_L.json';
import metaFlightR from '../game_data/geometry/DNp01_GF_escape_circuit/geometry_metadata_derived_escape_flight_R.json';
import handoffJumpL from '../path_jsons/math_filled/escape_jump_DNp01_GF_L_handoff.json';
import handoffJumpR from '../path_jsons/math_filled/escape_jump_DNp01_GF_R_handoff.json';
import handoffFlightL from '../path_jsons/math_filled/escape_flight_DNp01_GF_L_handoff.json';
import handoffFlightR from '../path_jsons/math_filled/escape_flight_DNp01_GF_R_handoff.json';
import glbJumpLUrl from '../game_data/geometry/DNp01_GF_escape_circuit/escape_jump_L.glb?url';
import glbJumpRUrl from '../game_data/geometry/DNp01_GF_escape_circuit/escape_jump_R.glb?url';
import glbFlightLUrl from '../game_data/geometry/DNp01_GF_escape_circuit/escape_flight_L.glb?url';
import glbFlightRUrl from '../game_data/geometry/DNp01_GF_escape_circuit/escape_flight_R.glb?url';
import swcGfLUrl from '../game_data/geometry/DNp01_GF_escape_circuit/10010.swc?url';
import swcGfRUrl from '../game_data/geometry/DNp01_GF_escape_circuit/10001.swc?url';
import swcTtmLUrl from '../game_data/geometry/DNp01_GF_escape_circuit/804642.swc?url';
import swcTtmRUrl from '../game_data/geometry/DNp01_GF_escape_circuit/800146.swc?url';
import swcPsiUrl from '../game_data/geometry/DNp01_GF_escape_circuit/802401.swc?url';
import swcDlmUrl from '../game_data/geometry/DNp01_GF_escape_circuit/802544.swc?url';

// The handoffs name some behaviors differently from the game's behavior runner and levels.json.
const BEHAVIOR_ALIASES = { object_tracking: 'object_track' };

// Branch game_turn_right test screen. Left: the DNa02_L and DNa02_R neurons, each with the motor neuron it
// drives (anterior on the left). Right: the arena with the fly. Click a hotspot: light travels down its path,
// then the fly turns left (DNa02_L) or right (DNa02_R). The world and HUD come from levels.json (open ?level=1..5 to see each level's world);
// the level rules in game.js and the placeholder brain.js are not loaded here.
const brainPane = createPane(document.getElementById('brain-pane'), { position: [0, 4, 21], background: 0x11162a });
// The arena starts with the camera behind the fly's side of the arena, looking down the +z direction the fly
// faces, so the player's left and right match the fly's. The player can then turn it freely (below).
const arenaPane = createPane(document.getElementById('arena-pane'), { position: [0, 11.5, -14.5], background: 0x161b2e });
arenaPane.renderer.shadowMap.enabled = true;

// Right screen: look-around. Drag (or touch-drag) and the view turns toward where you drag, so dragging right shows what
// is to the right and dragging left shows what is to the left. Scroll or pinch to move forward and back; right-drag
// or two fingers to slide. It stays above the counter. (The left screen's neuron still orbits.)
let viewTween = null;
let follow = null; // set while the camera is zoomed in on the fly during a behavior (see beginFollow)
const arenaControls = createLookControls(arenaPane.camera, arenaPane.domElement, {
  onStart: () => {
    viewTween = null;
    if (follow) follow.userTook = true; // the player grabbed the camera: stop following and do not snap back
  },
});

// The opening view: raised behind the fly's end of the counter, looking along the counter, so the fly, the first
// obstacles and the window are in frame and the far end (the pie) is out of it.
function overview() {
  const start = arena.world.start;
  const inward = -Math.sign(start.x) || 1; // toward the middle of the counter
  const target = new THREE.Vector3(start.x + inward * 4.8, 0, 3.0);
  return { pos: new THREE.Vector3(target.x, 12.5, target.z - 16), target };
}

// "Fly view": the fly's eye view. The camera sits at the fly's head and looks the way the fly is facing, low over the
// counter. The button glides the camera here from wherever it is, every time it is pressed.
const _fwd = new THREE.Vector3();
function eyeView() {
  const p = fly.object.position;
  _fwd.set(0, 0, 1).applyQuaternion(fly.object.quaternion);
  _fwd.y = 0;
  _fwd.normalize();
  return {
    pos: new THREE.Vector3(p.x + _fwd.x * 0.6, p.y + 0.62, p.z + _fwd.z * 0.6), // at the fly's head, so its body is behind the lens
    target: new THREE.Vector3(p.x + _fwd.x * 4, p.y + 0.45, p.z + _fwd.z * 4),
  };
}
// Glide the camera to a view: position and the point it looks at both ease across.
const _viewDir = new THREE.Vector3();
function currentTarget() {
  return _viewDir.set(0, 0, -1).applyQuaternion(arenaPane.camera.quaternion).multiplyScalar(6).add(arenaPane.camera.position).clone();
}
function goToView(v, immediate = false) {
  if (immediate) {
    arenaControls.setView(v.pos, v.target);
    viewTween = null;
    return;
  }
  viewTween = { t: 0, fromPos: arenaPane.camera.position.clone(), fromTarget: currentTarget(), v };
}
// Feeding camera (feeding only; other behaviors keep the fixed view): while the behavior plays, zoom in on the fly (from the front-right and above, so turns and
// the feeding reach are readable), keep it framed as it moves, then glide back to wherever the camera was.
// The offset is fixed in the world at the start, so when the fly turns you see it turn instead of the view spinning.
const FOLLOW_SIDE = 1.6; // scene units to the fly's right
const FOLLOW_AHEAD = 3.0; // in front of the fly
const FOLLOW_UP = 1.6;
const FOLLOW_AIM_DROP = 0.55; // aim below the fly so it sits in the upper part of the pane, clear of the notebook drawer
const FOLLOW_EASE = 5; // higher = the camera catches up faster
function beginFollow() {
  if (follow) return;
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(fly.object.quaternion).setY(0).normalize();
  const right = fwd.clone().cross(new THREE.Vector3(0, 1, 0)); // the fly's right
  follow = {
    saved: { pos: arenaPane.camera.position.clone(), target: currentTarget() },
    offset: right.multiplyScalar(FOLLOW_SIDE).addScaledVector(fwd, FOLLOW_AHEAD).add(new THREE.Vector3(0, FOLLOW_UP, 0)),
    userTook: false,
  };
  viewTween = null;
}
function updateFollow(dt, behaviorRunning) {
  if (!follow) return;
  if (follow.userTook) return void (follow = null);
  if (!behaviorRunning) {
    goToView(follow.saved);
    follow = null;
    return;
  }
  const p = fly.object.position;
  const k = 1 - Math.exp(-dt * FOLLOW_EASE);
  const pos = arenaPane.camera.position.clone().lerp(p.clone().add(follow.offset), k);
  const target = currentTarget().lerp(new THREE.Vector3(p.x, p.y + 0.3 - FOLLOW_AIM_DROP, p.z), k);
  arenaControls.setView(pos, target);
}

// Two buttons at the top right of the arena: Recenter goes back to the opening view; Fly view is the eye view.
const viewBar = document.createElement('div');
viewBar.id = 'view-bar';
[
  ['Recenter', 'Back to the starting view', () => goToView(overview())],
  ['Fly view', "Look through the fly's eyes", () => goToView(eyeView())],
].forEach(([label, title, fn]) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = title;
  b.addEventListener('click', fn);
  viewBar.append(b);
});
document.getElementById('arena-pane').append(viewBar);

// Nav bar along the bottom of the arena: hold an arrow to slide the view left or right, at a steady pace.
const navBar = document.createElement('div');
navBar.id = 'nav-bar';
const navHeld = { dir: 0 };
[
  ['\u25C0', -1, 'Move left'],
  ['\u25B6', 1, 'Move right'],
].forEach(([glyph, dir, title]) => {
  const b = document.createElement('button');
  b.textContent = glyph;
  b.title = title;
  const press = (e) => {
    e.preventDefault();
    navHeld.dir = dir;
    viewTween = null;
  };
  const release = () => {
    if (navHeld.dir === dir) navHeld.dir = 0;
  };
  b.addEventListener('pointerdown', press);
  ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, release));
  navBar.append(b);
  if (dir < 0) {
    const label = document.createElement('span');
    label.textContent = 'Move';
    navBar.append(label);
  }
});
document.getElementById('arena-pane').append(navBar);
const NAV_SPEED = 9; // world units per second


const controls = new OrbitControls(brainPane.camera, brainPane.domElement);
controls.enableDamping = true;

// Keep every neuron in view whatever the pane's shape, by moving the camera along its current line of sight.
// Runs on load, when neurons are added (frameBrain) and when the pane is resized, not while orbiting.
// The starting numbers fit one neuron (about 20 units long, 8 tall); frameBrain replaces them with the real extents.
let FIT_HALF_WIDTH = 12;
let FIT_HALF_HEIGHT = 5;
function fitBrainCamera() {
  const el = document.getElementById('brain-pane');
  const cam = brainPane.camera;
  const tanHalf = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
  const aspect = el.clientWidth / el.clientHeight;
  const dist = Math.max(FIT_HALF_WIDTH / (tanHalf * aspect), FIT_HALF_HEIGHT / tanHalf);
  const dir = cam.position.clone().sub(controls.target).normalize();
  cam.position.copy(controls.target).addScaledVector(dir, dist);
}
new ResizeObserver(fitBrainCamera).observe(document.getElementById('brain-pane'));
fitBrainCamera();

// Centre the view on the neurons' bounding box and size the fit to it (plus a margin, so hotspots at the edge stay clickable).
function frameBrain(groups) {
  const box = new THREE.Box3();
  groups.forEach((g) => {
    g.updateMatrixWorld(true);
    box.expandByObject(g);
  });
  const size = box.getSize(new THREE.Vector3());
  controls.target.copy(box.getCenter(new THREE.Vector3()));
  // The margin also covers perspective: neurons nearer the camera (+z) appear wider than the box suggests.
  FIT_HALF_WIDTH = size.x / 2 + 3;
  FIT_HALF_HEIGHT = size.y / 2 + 3;
  fitBrainCamera();
  controls.update();
}

const arena = createArena(arenaPane.scene);
arena.configure(null);
const fly = createFly();
fly.object.traverse((o) => {
  if (o.isMesh) o.castShadow = true;
});
arenaPane.scene.add(fly.object);
const runner = createBehaviorRunner(fly, arena.world);
const hud = createHud();
const music = createMusic(); // quiet looping background music, with an on/off button at the top right
// Movement sounds laid over the music (sfx.js): takeoff.mp3 while the fly is in the air, rest.mp3 for any other activity.
const sfx = createSfx();
const IN_THE_AIR = new Set(['walk_forward', 'turn_left', 'turn_right', 'escape_takeoff', 'escape_flight', 'object_track', 'startle']);
// Solid things stop the fly, the sink soaks it, the counter's edge holds it (collisions.js). It is switched on once the
// fly has landed, so the fly-in through the window is never counted.
let telemetry = null; // probe and mistake log for the current level (telemetry.js), created in loadLevel
const collisions = createCollisions({ fly, runner, world: arena.world, arena, say: (t) => hud.toast(t), onMishap: (m) => telemetry?.mishap(m) });
collisions.enabled = false;

// Start of every level: the fly flies in from outside the window, through it, and lands on the landing table at
// its end of the counter. On level 1 a short video of the cottage plays first. Skip both with ?intro=0.
const params = new URLSearchParams(location.search);
const playLanding = params.get('intro') !== '0';
const playIntro = playLanding && (params.get('level') || '1') === '1';
const intro = playIntro ? createIntro(document.getElementById('cinematic')) : null;
const introDone = intro ? intro.play() : Promise.resolve();
if (!playIntro) document.getElementById('cinematic').remove();

// The landing path: from beyond the window, through the opening, over the counter, and down onto the table.
let landing = null;
function landFly() {
  const { entry, window: win, start } = arena.world;
  const path = new THREE.CatmullRomCurve3(
    [
      entry.clone(),
      win.clone(),
      new THREE.Vector3(win.x * 0.6 + start.x * 0.4, 4.4, 6.2),
      new THREE.Vector3(start.x * 0.85, 2.3, start.z + 2.2),
      new THREE.Vector3(start.x, start.y + 0.4, start.z + 0.3),
      start.clone(),
    ],
    false,
    'centripetal',
  );
  fly.object.visible = true;
  fly.pose.flap = 1;
  fly.pose.spread = 0.85;
  fly.setAction('gait', 1);
  fly.object.position.copy(entry);
  return new Promise((resolve) => {
    landing = { t: 0, dur: 4.2, path, start, resolve };
  });
}
const _look = new THREE.Vector3();
function updateLanding(dt) {
  if (!landing) return;
  landing.t = Math.min(1, landing.t + dt / landing.dur);
  const k = landing.t * landing.t * (3 - 2 * landing.t);
  const { path, start } = landing;
  path.getPoint(k, fly.object.position);
  fly.object.position.y += Math.sin(landing.t * 40) * 0.04 * (1 - landing.t); // a bobbing flight
  if (landing.t < 0.86) {
    path.getPoint(Math.min(1, k + 0.02), _look);
    fly.object.lookAt(_look);
  } else {
    // settle: level out and turn to face forward (+z), as the landing wings fold
    fly.object.quaternion.slerp(new THREE.Quaternion(), 0.18);
    fly.pose.spread = 0.85 * (1 - (landing.t - 0.86) / 0.14);
  }
  if (landing.t >= 1) {
    fly.pose.flap = 0;
    fly.pose.spread = 0;
    fly.setAction('stop');
    fly.object.quaternion.identity();
    fly.object.position.copy(start);
    const done = landing.resolve;
    landing = null;
    done();
  }
}

// Notebook snapshots: grab a thumbnail of a canvas right after it renders (the WebGL buffer is only
// readable in the same frame it was drawn).
const THUMB_W = 200;
const thumbCanvas = document.createElement('canvas');
const captureQueue = [];
const capture = (pane, cb) => captureQueue.push({ pane, cb });
function flushCaptures() {
  while (captureQueue.length) {
    const { pane, cb } = captureQueue.shift();
    const src = pane.domElement;
    if (!src.width) continue;
    thumbCanvas.width = THUMB_W;
    thumbCanvas.height = Math.round((THUMB_W * src.height) / src.width);
    thumbCanvas.getContext('2d').drawImage(src, 0, 0, thumbCanvas.width, thumbCanvas.height);
    cb(thumbCanvas.toDataURL('image/jpeg', 0.7));
  }
}

// Level data. ?level=1..5 picks the first level (default 1); the rules (rules.js) move on from there.
let levelsData = [];
let levelEntries = {};
let rules = null;

async function fetchLevels() {
  const data = await fetch('/data/levels.json').then((r) => r.json());
  levelsData = data.levels.filter((l) => l.type !== 'weak_spot');
  levelEntries = data.hotspot_notebook_entries;
  const wanted = Number(new URLSearchParams(location.search).get('level')) || 1;
  return Math.min(levelsData.length, Math.max(1, wanted)) - 1;
}

// The world for a level: the kitchen, the fly back at its start, a fresh telemetry log. Nothing here needs the neurons.
function prepareLevel(index) {
  const level = levelsData[index];
  runner.stop();
  fly.resetPose();
  arena.configure(level.arena, level.id);
  fly.object.position.copy(arena.world.start);
  fly.object.rotation.set(0, 0, 0);
  goToView(overview(), true);
  if (playLanding) fly.object.visible = false; // it arrives through the window
  telemetry?.stop();
  telemetry = createTelemetry({ level, world: arena.world, getPos: () => fly.object.position });
  return level;
}

// Start (or restart) a level: set the world up, let the fly land, then the rules show the level card and play begins.
let entering = false; // a level is being set up (the fly is landing): ignore a second request
async function enterLevel(index) {
  if (entering) return;
  entering = true;
  try {
    collisions.enabled = false;
    prepareLevel(index);
    rules.setLevel(index);
    if (playLanding) await landFly();
    collisions.reset();
    collisions.enabled = true;
    rules.begin();
  } finally {
    entering = false;
  }
}

async function boot() {
  const startIndex = await fetchLevels();
  prepareLevel(startIndex);
  // The left pair defines the shared frame; the right pair is moved into it.
  const pairs = [
    await createNeuronPair({
      urls: { glb: glbLUrl, swc: { 523769: swcL1Url, 801548: swcL2Url } },
      meta: metaL,
      handoff: handoffL,
    }),
    await createNeuronPair({
      urls: { glb: glbRUrl, swc: { 10360: swcR1Url, 801946: swcR2Url } },
      meta: metaR,
      handoff: handoffR,
      reference: metaL.normalization,
    }),
    await createNeuronPair({
      urls: { glb: glbFeedUrl, swc: { 21763: swcFeed1Url, 15758: swcFeed2Url, 11063: swcFeed3Url, 16827: swcFeed4Url } },
      meta: metaFeed,
      handoff: handoffFeed,
      reference: metaL.normalization,
    }),
    await createNeuronPair({
      urls: { glb: glbWingUrl, swc: { 523998: swcWing1Url, 804090: swcWing2Url, 800241: swcWing3Url } },
      meta: metaWing,
      handoff: handoffWing,
      reference: metaL.normalization,
    }),
    await createNeuronPair({
      urls: { glb: glbTrackUrl, swc: { 23989: swcTrack1Url, 10148: swcTrack2Url, 11445: swcTrack3Url, 10090: swcTrack4Url } },
      meta: metaTrack,
      handoff: handoffTrack,
      reference: metaL.normalization,
    }),
    // Escape: the jump path is the primary (it owns the click sphere), the flight path shares its cell body.
    linkPairs(
      await createNeuronPair({
        urls: { glb: glbJumpLUrl, swc: { 10010: swcGfLUrl, 804642: swcTtmLUrl } },
        meta: metaJumpL,
        handoff: handoffJumpL,
        reference: metaL.normalization,
      }),
      await createNeuronPair({
        urls: { glb: glbFlightLUrl, swc: { 10010: swcGfLUrl, 802401: swcPsiUrl, 802544: swcDlmUrl } },
        meta: metaFlightL,
        handoff: handoffFlightL,
        reference: metaL.normalization,
      }),
      { hotspotId: 'escape_GF_L', behaviorId: 'escape_takeoff', playBehavior: 'escape_flight' },
    ),
    linkPairs(
      await createNeuronPair({
        urls: { glb: glbJumpRUrl, swc: { 10001: swcGfRUrl, 800146: swcTtmRUrl } },
        meta: metaJumpR,
        handoff: handoffJumpR,
        reference: metaL.normalization,
      }),
      await createNeuronPair({
        urls: { glb: glbFlightRUrl, swc: { 10001: swcGfRUrl, 802401: swcPsiUrl, 802544: swcDlmUrl } },
        meta: metaFlightR,
        handoff: handoffFlightR,
        reference: metaL.normalization,
      }),
      { hotspotId: 'escape_GF_R', behaviorId: 'escape_takeoff', playBehavior: 'escape_flight' },
    ),
  ];
  pairs.forEach((p) => (p.behaviorId = BEHAVIOR_ALIASES[p.behaviorId] ?? p.behaviorId));
  // STAND-INS (lavender, not real neurons): behaviors the levels need but that have no circuit data yet. Each is to be
  // replaced by a real createNeuronPair() when Shreya's geometry and handoff for it arrive. Positions are in the brain
  // view's world coordinates, clear of the real hotspots (which sit at x -9.8..-7.4).
  pairs.push(
    createStandInHotspot({ hotspotId: 'standin_walk_forward', behaviorId: 'walk_forward', position: [-6.5, 3.2, 1.5], seed: 11 }),
    createStandInHotspot({ hotspotId: 'standin_freeze_stop', behaviorId: 'freeze_stop', position: [-6.0, -1.0, 1.0], seed: 23 }),
    createStandInHotspot({ hotspotId: 'standin_groom_head', behaviorId: 'groom_head', position: [-5.5, 1.4, 2.0], seed: 37 }),
    createStandInHotspot({ hotspotId: 'standin_approach_odor', behaviorId: 'approach_odor', position: [-9.6, 2.0, 1.5], seed: 53 }),
  );
  pairs.forEach((p) => brainPane.scene.add(p.group));
  frameBrain(pairs.map((p) => p.group));
  const pairById = new Map(pairs.map((p) => [p.hotspotId, p]));
  rules = createRules({
    levels: levelsData,
    entries: levelEntries,
    arena,
    fly,
    runner,
    hud,
    pairs,
    capture: (which, cb) => capture(which === 'brain' ? brainPane : arenaPane, cb),
    getTelemetry: () => telemetry,
    beforeMove: () => collisions.begin(),
    onProbe: (behaviorId) => {
      if (behaviorId === 'feed') beginFollow(); // feeding only: the camera glides in during the pulse and arrives as the behavior starts
    },
    enterLevel,
  });

  // The heading at the top goes back to the Discovery Lab and starts the run over.
  const brand = document.getElementById('brand');
  const goHome = () => {
    if (!entering) rules?.restart();
  };
  brand.addEventListener('click', goHome);
  brand.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      goHome();
    }
  });

  createPicker({
    domElement: brainPane.domElement,
    camera: brainPane.camera,
    getTargets: () => pairs.map((p) => p.hotspotMesh), // every hotspot lights up on hover; rules.onPick only takes clicks on this level's own
    onPick: (hotspotId) => {
      console.log('hotspot clicked:', hotspotId);
      const pair = pairById.get(hotspotId);
      if (pair) rules.onPick(pair);
    },
    onHover: (hotspotId) => pairs.forEach((p) => p.setHover(p.hotspotId === hotspotId)),
  });

  const clock = new THREE.Clock();
  brainPane.renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    controls.update();
    if (navHeld.dir) arenaControls.slide(navHeld.dir * NAV_SPEED * dt);
    if (viewTween) {
      viewTween.t = Math.min(1, viewTween.t + dt / 0.8);
      const k = viewTween.t * viewTween.t * (3 - 2 * viewTween.t); // ease in and out
      const pos = new THREE.Vector3().lerpVectors(viewTween.fromPos, viewTween.v.pos, k);
      const tgt = new THREE.Vector3().lerpVectors(viewTween.fromTarget, viewTween.v.target, k);
      arenaControls.setView(pos, tgt);
      if (viewTween.t >= 1) viewTween = null;
    }
    pairs.forEach((p) => p.update(dt * 1000));
    const ended = runner.update(dt * 1000);
    if (ended) {
      telemetry?.behaviorEnded();
      rules.onBehaviorEnded(ended);
    }
    rules.update(dt * 1000);
    sfx.update({
      flying: IN_THE_AIR.has(runner.current) || landing !== null, // a flight, a turn, the escape, tracking, the startle, the fly-in
      active: pairs.some((p) => p.busy) || (runner.current != null && runner.current !== 'freeze_stop'), // a pulse, or any other behavior
    });
    arena.update(dt * 1000);
    collisions.update();
    updateFollow(dt, pairs.some((p) => p.busy) || !!runner.current);
    updateLanding(dt);
    fly.update(dt);
    brainPane.renderer.render(brainPane.scene, brainPane.camera);
    arenaPane.renderer.render(arenaPane.scene, arenaPane.camera);
    flushCaptures();
  });

  if (new URLSearchParams(location.search).has('debug')) {
    window.__dev = { THREE, music, sfx, arena, rules, pairs, fly, runner, collisions, goToView, eyeView, arenaControls, arenaPane, brainPane, camera: brainPane.camera, canvas: brainPane.domElement };
  }
  // Start of the level: wait for the opening video (level 1), fly the fly in and land it, then show the level card.
  await introDone;
  if (intro) intro.hide();
  await enterLevel(startIndex);
}

boot();
