// The kitchen's layouts, as plain data (no three.js), so scripts/layouts.mjs can check them in node.
// Positions are json coordinates for an un-mirrored level (+x to the fly's right, +z ahead).
import { VARIANTS } from './kitchenVariants.js';

// start: where the fly lands. pie: the far-end table (with the pie and tea only in levels that have a pie to reach).
// board: the chopping hand. sill: the window-sill board's centre and the daisy jar's x (level 5's target).
// mirrored: swap left and right. items: what is on the counter. A fruit lane is {x, z: [from, to]}: it rolls front to
// back along the counter at that x. Items marked `decor` are just scenery, off the fly's route.
//
// The obstacles ramp up with the levels, following what levels.json asks of each:
//   1 Discovery: explore freely, no goal and no fail, so nothing is in the way: only scenery.
//   2 Reach the pie: the sink to cross, a hurdle and one rolling fruit.
//   3 Pie + shadow: a hurdle, a cheese wall and two rolling fruit, and the shadow to time (the stove is by the start).
//   4 Lesion: a taller cheese wall, a hurdle, two rolling fruit and a stack of salt boxes, all to get round while the
//     left-turn hotspot is dead. The fly starts on the right.
//   5 Threshold: no pie: the daisies on the sill. The most in the way: cheese, hurdle, fruit, salt boxes and a bowl.
export const SCENES = {
  level_1_discovery: {
    start: [-9.3, 0, 2.6],
    pie: [12, 0, 2.4],
    hasPie: false,
    board: [-3.0, 0, -1.4],
    sill: { cx: 0.2, flowers: -0.6 },
    items: [
      { type: 'stove', x: 5.0, z: 6.0, yaw: 0.1, decor: true },
      { type: 'saltbox', x: -5.8, z: 7.2, n: 2, decor: true },
      { type: 'bowl', x: -1.8, z: 6.6, decor: true },
      { type: 'saltbox', x: 8.4, z: -1.6, n: 1, decor: true, offset: 2 },
    ],
  },
  // As briefed: sink, hand, stove under the window, pie and tea at the far right.
  level_2_pie: {
    start: [-9.3, 0, 2.6],
    pie: [12, 0, 2.4],
    hasPie: true,
    board: [-0.8, 0, -1.4],
    sill: { cx: 5.8, flowers: 4.4 },
    items: [
      { type: 'sink', x: -5.4, z: 2.6 },
      { type: 'stove', x: 0.6, z: 5.9, yaw: 0.05 },
      { type: 'hurdle', x: 6.6, z: 5.2, w: 2.4, yaw: -0.2 },
      { type: 'fruit', lanes: [{ x: 4.0, z: [-2.8, 1.5] }] },
      { type: 'bowl', x: -4.4, z: 6.8, decor: true },
      { type: 'saltbox', x: 4.6, z: 7.2, n: 1, decor: true },
    ],
  },
  level_3_shadow: {
    start: [-9.3, 0, 0.8],
    pie: [12, 0, 2.4],
    hasPie: true,
    board: null, // no chopping hand in this level: the stove is the focus
    sill: { cx: 6.4, flowers: 5.6 },
    items: [
      // The stove sits in the middle of the counter under the window: its fumes roll from it toward the camera
      // down the hit band, so the fly has to cross the stove's path.
      { type: 'stove', x: 0, z: 5.9, yaw: 0 },
      { type: 'hurdle', x: -6.4, z: 3.8, w: 2.2, yaw: 0.2 },
      { type: 'wall', x: 4.6, z: 4.5, along: 'z', n: 3, rows: 2, yaw: 0.1 },
      { type: 'fruit', lanes: [{ x: 2.6, z: [-2.8, -0.2] }, { x: 8.0, z: [3.9, 6.8] }] },
      { type: 'saltbox', x: -5.2, z: 6.9, n: 2, decor: true },
      { type: 'bowl', x: -5.4, z: 8.5, decor: true },
    ],
  },
  level_4_lesion: {
    mirrored: true,
    start: [-9.3, 0, 2.6],
    // The left-turn hotspot is dead, so the fly gets left with three right turns and one flight: the pie sits where
    // that ends (the flight is 10.3 long), in the middle of the counter. Its table takes x -3.4..4.2, z -0.8..4.8, so
    // the hurdle, the salt boxes and the second fruit lane were moved out of its way.
    pie: [0.37, 0, 1.96],
    hasPie: true,
    board: [6.4, 0, -1.4], // beside the pie table, not in front of it
    sill: { cx: 1.0, flowers: 0.2 },
    items: [
      { type: 'stove', x: 5.2, z: 5.9, yaw: 0.1 },
      { type: 'wall', x: -4.6, z: 4.6, along: 'z', n: 2, rows: 3, yaw: 0.25 },
      { type: 'hurdle', x: -9.2, z: 6.4, w: 2.0, yaw: 0.2 },
      { type: 'fruit', lanes: [{ x: -6.4, z: [-2.8, 0.6] }, { x: -6.6, z: [4.6, 7.9] }] },
      { type: 'saltbox', x: 9.4, z: 1.4, n: 2 },
    ],
  },
  level_5_threshold: {
    start: [-9.3, 0, 1.0],
    pie: [12.6, 0, 2.4],
    hasPie: false,
    board: [-5.0, 0, -1.4],
    sill: { cx: 0, flowers: -0.6 },
    items: [
      { type: 'stove', x: 5.6, z: 5.9, yaw: 0.2 },
      { type: 'saltbox', x: -8.4, z: 7.0, n: 2, offset: 1 },
      { type: 'wall', x: -1.4, z: 2.4, along: 'x', n: 3, rows: 2, yaw: -0.2 },
      { type: 'hurdle', x: 2.4, z: 3.0, w: 2.6, yaw: 0.25 },
      { type: 'fruit', lanes: [{ x: 1.8, z: [-2.8, 0.6] }, { x: 10.4, z: [3.8, 7.6] }] },
      { type: 'bowl', x: -2.6, z: 6.4 },
    ],
  },
};

// Every task level has its original layout (variant 0) plus generated ones (kitchenVariants.js). A variant only moves
// the movable items (hurdle, cheese, salt boxes, bowl, rolling fruit, the stove where it is not the shadow's source,
// the chopping hand): the start, the pie, the sink and the window sill stay, so the same hotspot clicks still win it.
// scripts/layouts.mjs proves that for each variant. Retrying a level after a loss moves on to the next variant.
export const layoutCount = (levelId) => 1 + (VARIANTS[levelId]?.length ?? 0);
export const layoutId = (levelId, variant = 0) => `${levelId}:v${variant}`;
export function sceneFor(levelId, variant = 0) {
  const base = SCENES[levelId] ?? SCENES.level_1_discovery;
  const v = variant > 0 ? VARIANTS[levelId]?.[variant - 1] : null;
  return v ? { ...base, board: v.board !== undefined ? v.board : base.board, items: v.items } : base;
}
