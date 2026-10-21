import assert from "node:assert/strict";
import {
  overviewCentroid,
  overviewDistance,
  overviewFrame,
  overviewRadius,
  clampOverviewZoom,
  updateOverviewZoom,
  overviewInsetPose,
} from "../../src/overview_camera.js";

const positions = [[-3, 1, 0], [3, 1, 0], [0, 4, 0]];
assert.deepEqual(overviewCentroid(positions), [0, 2, 0]);
assert.equal(overviewRadius(positions, [0, 2, 0]), Math.sqrt(10));
assert.ok(Math.abs(overviewDistance(10, 60, { minDistanceM: 0, marginM: 5 }) - 30) < 1e-12);
assert.equal(overviewDistance(1, 60, { minDistanceM: 15, marginM: 0 }), 15);

const single = overviewFrame([[4, 5, 6]], 60);
assert.deepEqual(single.centroid, [4, 5, 6]);
assert.equal(single.radius, 0);
assert.equal(single.distance, 15);
assert.equal(overviewFrame([], 60), null);
assert.equal(updateOverviewZoom(1, 0.8), 0.8);
assert.equal(updateOverviewZoom(0.2, 0.5), 0.2);
assert.equal(updateOverviewZoom(5, 2), 5);
assert.equal(clampOverviewZoom(2.5), 2.5);
const inset = overviewInsetPose([[-5, 0, 0], [5, 0, 0]], 60, [1, 0, 0], {
  minDistanceM: 0, marginM: 0,
});
assert.deepEqual(inset.target, [0, 0, 0]);
assert.ok(inset.position[0] < 0); // behind eastbound subjects
assert.ok(inset.position[1] > 0);
assert.ok(Math.abs(Math.hypot(...inset.position) - inset.distance) < 1e-12);

console.log(JSON.stringify({ centroid: overviewCentroid(positions), single, passed: true }));
