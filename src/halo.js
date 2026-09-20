import * as THREE from 'three';

// A soft glowing disc that always faces the camera, sitting on a hotspot. It lights up when the cursor is over the
// hotspot (and pulses with the level's first-click hint), so even a hairline neuron in a crowded brain is impossible
// to miss. Additive, drawn over the neurons, and it fades in and out smoothly.

const SIZE = 2.6; // diameter in scene units (about 80 px on a laptop screen)
const FADE_PER_MS = 0.012; // how fast the glow follows its target

let sharedTexture = null;
function glowTexture() {
  if (sharedTexture) return sharedTexture;
  const n = 128;
  const c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.14)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, n, n);
  sharedTexture = new THREE.CanvasTexture(c);
  return sharedTexture;
}

// color: [r, g, b] 0..1. localScale: the parent group's scale, so the halo is the same size on screen whatever it sits in.
export function createHalo(color = [1, 1, 1], localScale = 1) {
  const material = new THREE.SpriteMaterial({
    map: glowTexture(),
    color: new THREE.Color(color[0] * 0.6 + 0.4, color[1] * 0.6 + 0.4, color[2] * 0.6 + 0.4), // the neuron's colour, lifted toward white
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.setScalar(SIZE / localScale);
  sprite.renderOrder = 6;
  sprite.visible = false;
  let level = 0;
  return {
    sprite,
    // target 0..1. Call every frame with the elapsed milliseconds.
    update(target, dtMs) {
      level += Math.max(-1, Math.min(1, target - level)) * Math.min(1, FADE_PER_MS * dtMs * 6);
      if (Math.abs(target - level) < 0.005) level = target;
      material.opacity = level * 0.85;
      sprite.visible = level > 0.01;
    },
  };
}
