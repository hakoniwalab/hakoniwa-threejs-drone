import { FaultInjectionState } from "./fault_injection_state.js";

function isRobotName(value) {
  return typeof value === "string" && value.length > 0;
}

/** Return the configured target for the selected Drone, or null if it is not eligible. */
export function resolveFaultInjectionTarget(fault = {}, selectedRobotName = null) {
  if (Array.isArray(fault.robotNames)) {
    return isRobotName(selectedRobotName) && fault.robotNames.includes(selectedRobotName)
      ? selectedRobotName
      : null;
  }
  return isRobotName(fault.robotName) ? fault.robotName : null;
}

/** Keep independent rotor and wind values for every configured injection target. */
export class FaultInjectionTargetStates {
  constructor(fault = {}) {
    this.fault = {
      robotName: fault.robotName,
      robotNames: Array.isArray(fault.robotNames) ? [...fault.robotNames] : undefined,
    };
    this.rotorCount = fault.rotorCount ?? 4;
    this.defaultScale = fault.defaultScale ?? 1.0;
    const names = this.fault.robotNames ?? [this.fault.robotName].filter(isRobotName);
    this.states = new Map(names.map((name) => [
      name,
      new FaultInjectionState({
        rotorCount: this.rotorCount,
        defaultScale: this.defaultScale,
      }),
    ]));
    this.targetName = resolveFaultInjectionTarget(this.fault, null);
  }

  select(selectedRobotName) {
    this.targetName = resolveFaultInjectionTarget(this.fault, selectedRobotName);
    return this.targetName;
  }

  getTargetName() {
    return this.targetName;
  }

  getState(robotName = this.targetName) {
    return this.states.get(robotName) ?? null;
  }
}
