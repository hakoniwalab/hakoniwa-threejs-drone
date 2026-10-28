import assert from "node:assert/strict";

import {
  FaultInjectionTargetStates,
  resolveFaultInjectionTarget,
} from "../../src/fault_injection/fault_injection_targets.js";

assert.equal(resolveFaultInjectionTarget({ robotName: "Drone" }, "Drone-2"), "Drone");
assert.equal(
  resolveFaultInjectionTarget({ robotNames: ["Drone-1", "Drone-2"] }, "Drone-2"),
  "Drone-2",
);
assert.equal(
  resolveFaultInjectionTarget({ robotNames: ["Drone-1", "Drone-2"] }, "Vehicle-1"),
  null,
);

const targets = new FaultInjectionTargetStates({
  robotNames: ["Drone-1", "Drone-2"],
  rotorCount: 3,
});
assert.equal(targets.getTargetName(), null);
assert.equal(targets.getState(), null);

assert.equal(targets.select("Drone-1"), "Drone-1");
targets.getState().setRotorScales([0.4, 0.5, 0.6]);
targets.getState().setWind({ headingDeg: 90, speedMps: 8 });

assert.equal(targets.select("Drone-2"), "Drone-2");
assert.deepEqual(targets.getState().getRotorScales(), [1, 1, 1]);
assert.deepEqual(targets.getState().getWind(), { headingDeg: 0, speedMps: 0 });
targets.getState().setRotorScale(1, 0.2);
targets.getState().setWind({ headingDeg: 180, speedMps: 3 });

targets.select("Drone-1");
assert.deepEqual(targets.getState().getRotorScales(), [0.4, 0.5, 0.6]);
assert.deepEqual(targets.getState().getWind(), { headingDeg: 90, speedMps: 8 });
targets.select("Drone-2");
assert.deepEqual(targets.getState().getRotorScales(), [1, 0.2, 1]);
assert.deepEqual(targets.getState().getWind(), { headingDeg: 180, speedMps: 3 });

assert.equal(targets.select("Drone-3"), null);
assert.equal(targets.getState(), null);

console.log(JSON.stringify({ targets: 2, rotorCount: 3 }));
