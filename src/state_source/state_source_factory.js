import { LegacyStateSource } from "./legacy_state_source.js";
import { FleetStateSource } from "./fleet_state_source.js";

export class StateSourceFactory {
  static create(config) {
    const mode = config?.stateInput?.mode;
    if (mode === "legacy") {
      return new LegacyStateSource(config?.stateInput?.legacy?.roleMap);
    }
    if (mode === "fleets") {
      return new FleetStateSource(config?.stateInput?.fleets?.roleMap);
    }
    throw new Error(`[StateSourceFactory] unsupported mode: ${mode}`);
  }
}
