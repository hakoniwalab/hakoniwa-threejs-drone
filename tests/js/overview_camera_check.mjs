import assert from "node:assert/strict";
import {
  overviewCentroid,
  overviewDistance,
  overviewFrame,
  overviewRadius,
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

console.log(JSON.stringify({ centroid: overviewCentroid(positions), single, passed: true }));
