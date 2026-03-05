export class DroneRenderManager {
  constructor({ getDrones }) {
    if (typeof getDrones !== "function") {
      throw new Error("[DroneRenderManager] getDrones function is required.");
    }
    this.getDrones = getDrones;
    this.droneById = new Map();
    this.activeDroneIds = new Set();
  }

  refreshDroneIndex() {
    this.droneById.clear();
    for (const drone of this.getDrones()) {
      if (!drone?.droneId) continue;
      this.droneById.set(String(drone.droneId), drone);
    }
  }

  upsertState(droneId, state) {
    const key = String(droneId);
    const drone = this.droneById.get(key);
    if (!drone || !state) {
      return false;
    }
    drone.applyState(state);
    this.activeDroneIds.add(key);
    return true;
  }

  applyStates(statesByDroneId) {
    this.refreshDroneIndex();
    this.activeDroneIds.clear();
    for (const [droneId, state] of statesByDroneId.entries()) {
      this.upsertState(droneId, state);
    }
    this.compactActiveSet();
  }

  compactActiveSet() {
    for (const droneId of this.activeDroneIds) {
      if (!this.droneById.has(droneId)) {
        this.activeDroneIds.delete(droneId);
      }
    }
  }
}
