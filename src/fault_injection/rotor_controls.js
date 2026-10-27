export const DEFAULT_ROTOR_COUNT = 4;

export function normalizeRotorCount(rotorCount) {
  return Number.isInteger(rotorCount) && rotorCount > 0
    ? rotorCount
    : DEFAULT_ROTOR_COUNT;
}

export function buildRotorScaleControls(rotorCount = DEFAULT_ROTOR_COUNT) {
  return Array.from({ length: normalizeRotorCount(rotorCount) }, (_, index) => `
          <label for="rotor-scale-${index}">Rotor ${index}</label>
          <input id="rotor-scale-slider-${index}" type="range" min="0" max="1" step="0.1" value="1.0">
          <input id="rotor-scale-${index}" type="number" min="0" max="1" step="0.1" value="1.0">`).join("");
}

export function buildPwmRows(rotorCount = DEFAULT_ROTOR_COUNT) {
  return Array.from({ length: normalizeRotorCount(rotorCount) }, (_, index) =>
    `          <tr><td class="label">pwm${index}:</td><td class="value" id="prop-pwm-${index}"></td></tr>`,
  ).join("\n");
}
