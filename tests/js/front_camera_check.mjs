import assert from "node:assert/strict";
import {
  FrontDirectionTracker,
  clampFrontZoom,
  frontCameraFrame,
  frontmostIndex,
  updateFrontZoom,
} from "../../src/front_camera.js";

const positions = [[0, 2, 0], [8, 3, 0], [3, 1, 0]];
assert.equal(frontmostIndex(positions, [1, 0, 0]), 1);
const frame = frontCameraFrame(positions, [1, 0, 0]);
assert.deepEqual(frame.position, [14, 4, 0]);
assert.deepEqual(frame.target, [-4, 1.5, 0]);

const tracker = new FrontDirectionTracker({ smoothing: 100 });
assert.deepEqual(tracker.update([[0, 0, 0]], 0.1, [[0, 0, -1]], [1, 0, 0]), [0, 0, -1]);
const moving = tracker.update([[1, 0, 0]], 0.1);
assert.ok(moving[0] > 0.99);
assert.deepEqual(tracker.update([[1, 0, 0]], 0.1), moving); // still: hold last direction

// Switching the winning anchor changes the desired frame, but exponential
// camera interpolation (lerp) approaches it without a one-frame jump.
const oldFrame = frontCameraFrame([[4, 0, 0], [3, 0, 0]], [1, 0, 0]);
const newFrame = frontCameraFrame([[4, 0, 0], [5, 0, 0]], [1, 0, 0]);
assert.equal(oldFrame.anchorIndex, 0);
assert.equal(newFrame.anchorIndex, 1);
const smoothedX = oldFrame.position[0] + (newFrame.position[0] - oldFrame.position[0]) * 0.2;
assert.ok(smoothedX > oldFrame.position[0] && smoothedX < newFrame.position[0]);
assert.equal(updateFrontZoom(0.25, 0.5), 0.25);
assert.equal(updateFrontZoom(4, 2), 4);
assert.equal(clampFrontZoom(1.5), 1.5);

console.log(JSON.stringify({ frame, passed: true }));
