import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  buildPwmRows,
  buildRotorScaleControls,
  normalizeRotorCount,
} from "../../src/fault_injection/rotor_controls.js";
import { loadViewerConfig } from "../../src/viewer_config_loader.js";

function countIds(markup, prefix) {
  return [...markup.matchAll(new RegExp(`id="${prefix}\\d+"`, "g"))].length;
}

for (const rotorCount of [4, 6]) {
  const controls = buildRotorScaleControls(rotorCount);
  const pwmRows = buildPwmRows(rotorCount);
  assert.equal(countIds(controls, "rotor-scale-"), rotorCount);
  assert.equal(countIds(controls, "rotor-scale-slider-"), rotorCount);
  assert.equal(countIds(pwmRows, "prop-pwm-"), rotorCount);
  assert.match(controls, new RegExp(`Rotor ${rotorCount - 1}`));
}
assert.equal(normalizeRotorCount(undefined), 4);

const rawConfig = JSON.parse(await readFile(
  new URL("../../config/viewer-config-fleets-hexa-eams-disturb.json", import.meta.url),
  "utf8",
));
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => ({
  ok: true,
  async json() { return rawConfig; },
});

try {
  const { config } = await loadViewerConfig({
    search: "?viewerConfigPath=/config/viewer-config-fleets-hexa-eams-disturb.json",
    pageUrl: "http://127.0.0.1:8000/index.html",
  });
  assert.equal(config.faultInjection.robotName, "Drone");
  assert.equal(config.faultInjection.rotorCount, 6);
  assert.equal(config.pdu.pduDefPath, "http://127.0.0.1:8000/config/pdudef-disturb.json");
  assert.deepEqual(config.stateInput.fleets.motorChannels, [0, 1, 2, 3, 4, 5]);
} finally {
  globalThis.fetch = originalFetch;
}

console.log(JSON.stringify({ defaultRotorCount: 4, eamsRotorCount: 6 }));
