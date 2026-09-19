import * as THREE from 'three';

// A neuron skeleton is a chain of 3D points. This is the stand-in shape until Shreya's file
// format is confirmed; only this function should need to change when it is.
export function createSkeletonLine(points, { color = 0x6fa8ff, hotspotId = null } = {}) {
  const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(...p)));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color }));
  if (hotspotId) line.userData.hotspotId = hotspotId;
  return line;
}
