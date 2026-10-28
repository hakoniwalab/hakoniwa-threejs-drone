import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";

// drone_viewer.js has browser-only imports. Load and execute its actual validator
// body in Node so this contract cannot regress behind Python/static checks again.
const viewerSource = await readFile(
  new URL("../../src/public/drone_viewer.js", import.meta.url),
  "utf8",
);
const start = viewerSource.indexOf("function validateViewerConfig(config) {");
const end = viewerSource.indexOf("\n\nexport class DroneViewer", start);
assert.notEqual(start, -1, "validateViewerConfig must exist");
assert.notEqual(end, -1, "validateViewerConfig boundary must exist");

const context = vm.createContext({
  Set,
  Error,
  Number,
  Array,
  MAX_FAULT_ROTORS: 16,
  validateFlightPaths() {},
  validateRoutePaths() {},
});
vm.runInContext(`${viewerSource.slice(start, end)}\nthis.validateViewerConfig = validateViewerConfig;`, context);
const { validateViewerConfig } = context;

function configWithFaultInjection(faultInjection) {
  return {
    version: "1.0",
    three: { sceneConfigPath: "./scene.json" },
    pdu: {
      pduDefPath: "./pdudef.json",
      wsUri: "ws://127.0.0.1:8765",
      wireVersion: "v2",
    },
    stateInput: {
      mode: "fleets",
      fleets: { roleMap: { visual_state_array: "visual_state_array" } },
    },
    faultInjection,
  };
}

assert.doesNotThrow(() => validateViewerConfig(configWithFaultInjection({
  robotNames: ["Drone-1", "Drone-2"],
  rotorCount: 6,
})));
assert.doesNotThrow(() => validateViewerConfig(configWithFaultInjection({
  robotName: "Drone",
  rotorCount: 6,
})));

for (const faultInjection of [
  { rotorCount: 6 },
  { robotNames: [], rotorCount: 6 },
  { robotNames: ["Drone-1", ""], rotorCount: 6 },
  { robotNames: ["Drone-1", "Drone-1"], rotorCount: 6 },
  { robotName: "", robotNames: ["Drone-1"], rotorCount: 6 },
  { robotName: "Drone", robotNames: [], rotorCount: 6 },
]) {
  assert.throws(() => validateViewerConfig(configWithFaultInjection(faultInjection)));
}

console.log(JSON.stringify({ multiDrone: true, singleDrone: true, invalidCases: 6 }));
