import { LegacyStateSource } from "./legacy_state_source.js";
import { FleetStateSource } from "./fleet_state_source.js";

export class StateSourceFactory {
  static create(config) {
    const mode = config?.stateInput?.mode;
    if (mode === "legacy") {
      const input = config?.stateInput?.legacy ?? {};
      return new LegacyStateSource(input.roleMap, {
        motorChannels: input.motorChannels,
        rotorScale: input.rotorScale,
      });
    }
    if (mode === "fleets") {
      const input = config?.stateInput?.fleets ?? {};
      return new FleetStateSource(input.roleMap, {
        motorChannels: input.motorChannels,
        rotorScale: input.rotorScale,
      });
    }
    throw new Error(`[StateSourceFactory] unsupported mode: ${mode}`);
  }
}
