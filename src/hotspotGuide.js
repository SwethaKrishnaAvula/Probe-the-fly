import * as THREE from 'three';

// A live guide over the left screen: it circles every hotspot and says which action a click on it performs. It is
// drawn from the hotspots' real click positions every frame, so the circles stay on the right spot when the brain is
// rotated. A button switches it on and off; it starts off, because working out which hotspot does what is the game.
// Hotspots that this level does not use are drawn faint and dashed.

const FUNCTION = {
  turn_left: 'Turn left',
  turn_right: 'Turn right',
  feed: 'Feed',
  wing_song: 'Wing song',
  object_track: 'Track a moving object',
  escape_takeoff: 'Escape takeoff',
  walk_forward: 'Fly forward',
  freeze_stop: 'Freeze',
  groom_head: 'Groom head',
  approach_odor: 'Approach a smell',
};
const nameOf = (pair) => {
  const base = FUNCTION[pair.behaviorId] ?? pair.behaviorId;
  const side = /_([LR])$/.exec(pair.hotspotId)?.[1];
  return pair.behaviorId === 'escape_takeoff' && side ? `${base} (${side === 'L' ? 'left' : 'right'})` : base;
};

const NS = 'http://www.w3.org/2000/svg';
const FONT = 'ui-monospace, Menlo, Consolas, monospace';
const LEVEL_COLOR = '#ffd35e';
const OTHER_COLOR = '#8a93b0';

export function createHotspotGuide({ pane, camera, pairs, isLive }) {
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'hotspot-guide';
  svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;display:none;';
  pane.append(svg);
  const make = (tag, attrs, parent = svg) => {
    const e = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    parent.append(e);
    return e;
  };

  const items = pairs.map((pair) => {
    const g = make('g', {});
    const line = make('line', { 'stroke-width': 1.4 }, g);
    const box = make('rect', { height: 22, rx: 6, fill: 'rgba(14,18,36,0.92)', 'stroke-width': 1.6 }, g);
    const text = make('text', { 'font-size': 12.5, 'font-weight': 700, 'font-family': FONT, fill: '#fff' }, g);
    text.textContent = nameOf(pair);
    const circle = make('circle', { fill: 'none', 'stroke-width': 2.6 }, g);
    return { pair, g, line, box, text, circle, width: 0 };
  });

  let on = false;
  const button = document.createElement('button');
  button.id = 'guide-btn';
  button.textContent = 'Hotspot guide';
  button.title = 'Circle every hotspot and name what it does';
  button.addEventListener('click', () => {
    on = !on;
    svg.style.display = on ? 'block' : 'none';
    button.classList.toggle('active', on);
    if (on) items.forEach((it) => (it.width = it.text.getComputedTextLength() + 18)); // measured once it is visible
  });
  pane.append(button);

  const v = new THREE.Vector3();
  const right = new THREE.Vector3();

  return {
    // Call every frame.
    update() {
      if (!on) return;
      const W = pane.clientWidth;
      const H = pane.clientHeight;
      items.forEach((it) => {
        const mesh = it.pair.hotspotMesh;
        mesh.getWorldPosition(v);
        right.set(1, 0, 0).applyQuaternion(camera.quaternion).multiplyScalar(0.5 * mesh.scale.x);
        const c = v.clone().project(camera);
        const e = v.clone().add(right).project(camera);
        it.x = ((c.x + 1) / 2) * W;
        it.y = ((1 - c.y) / 2) * H;
        it.r = Math.max(9, (Math.abs(e.x - c.x) / 2) * W);
        it.live = isLive(it.pair);
        it.left = it.x < W / 2;
      });
      // Labels go in the empty bands above and below the neurons, in two staggered rows each, ordered by the circle's
      // x so the leader lines do not cross. Hotspots in the upper half of the cluster label upward, the rest downward.
      const meanY = items.reduce((t, it) => t + it.y, 0) / items.length;
      const groups = [
        { col: items.filter((it) => it.y <= meanY), rows: [170, 208], up: true },
        { col: items.filter((it) => it.y > meanY), rows: [H - 150, H - 112], up: false },
      ];
      groups.forEach(({ col, rows, up }) => {
        col.sort((a, b) => a.x - b.x);
        const maxW = Math.max(...col.map((it) => it.width), 0);
        const step = col.length > 1 ? (W - 20 - maxW) / (col.length - 1) : 0;
        col.forEach((it, k) => {
          it.lx = 10 + k * step;
          it.ly = rows[k % 2];
          it.up = up;
        });
      });
      items.forEach((it) => {
        const color = it.live ? LEVEL_COLOR : OTHER_COLOR;
        const ax = it.lx + it.width / 2;
        const ay = it.ly + (it.up ? 11 : -11); // the label edge nearest the circle
        const d = Math.hypot(ax - it.x, ay - it.y) || 1;
        it.circle.setAttribute('cx', it.x);
        it.circle.setAttribute('cy', it.y);
        it.circle.setAttribute('r', it.r);
        it.circle.setAttribute('stroke', color);
        it.circle.setAttribute('stroke-dasharray', it.live ? 'none' : '5 4');
        it.line.setAttribute('x1', it.x + ((ax - it.x) / d) * it.r);
        it.line.setAttribute('y1', it.y + ((ay - it.y) / d) * it.r);
        it.line.setAttribute('x2', ax);
        it.line.setAttribute('y2', ay);
        it.line.setAttribute('stroke', color);
        it.line.setAttribute('opacity', it.live ? 0.9 : 0.5);
        it.box.setAttribute('x', it.lx);
        it.box.setAttribute('y', it.ly - 11);
        it.box.setAttribute('width', it.width);
        it.box.setAttribute('stroke', color);
        it.text.setAttribute('x', it.lx + 9);
        it.text.setAttribute('y', it.ly + 4.5);
        it.text.setAttribute('fill', it.live ? '#ffffff' : '#98a1bd');
        it.g.setAttribute('opacity', it.live ? 1 : 0.7);
      });
    },
  };
}
