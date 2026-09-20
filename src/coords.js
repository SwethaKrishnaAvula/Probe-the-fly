import * as THREE from 'three';

// levels.json positions are [x, y, z] with +x on the fly's RIGHT and +z straight ahead of the start.
// The fly's own frame has its left on +X, so world x is the json x negated.
export const toWorld = ([x, y, z]) => new THREE.Vector3(-x, y, z);
