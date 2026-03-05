// Drone の状態入力経路（legacy/fleets など）を切り替えるための抽象インタフェース。
export class IStateSource {
  async initialize(_params = {}) {
    throw new Error("IStateSource.initialize() is not implemented.");
  }

  async bindDrone(_droneId) {
    throw new Error("IStateSource.bindDrone() is not implemented.");
  }

  async update() {
    throw new Error("IStateSource.update() is not implemented.");
  }

  getState(_droneId) {
    throw new Error("IStateSource.getState() is not implemented.");
  }

  async dispose() {
    throw new Error("IStateSource.dispose() is not implemented.");
  }
}
