import * as THREE from 'three';

// One WebGL view inside a container element: own scene, camera and renderer.
export function createPane(container, { fov = 60, position = [3, 3, 5], background = 0x0b0d12 } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(background);

  const camera = new THREE.PerspectiveCamera(fov, 1, 0.1, 100);
  camera.position.set(...position);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  return { scene, camera, renderer, domElement: renderer.domElement };
}
