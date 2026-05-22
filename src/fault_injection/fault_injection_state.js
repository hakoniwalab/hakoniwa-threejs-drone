export class FaultInjectionState {
  constructor({ rotorCount = 4, defaultScale = 1.0 } = {}) {
    this.rotorCount = rotorCount;
    this.defaultScale = defaultScale;
    this.rotorScales = new Array(rotorCount).fill(defaultScale);
  }

  getRotorScales() {
    return [...this.rotorScales];
  }

  setRotorScales(scales = []) {
    const next = new Array(this.rotorCount).fill(this.defaultScale);
    for (let i = 0; i < Math.min(scales.length, this.rotorCount); i++) {
      const value = Number(scales[i]);
      next[i] = Number.isFinite(value) ? value : this.defaultScale;
    }
    this.rotorScales = next;
    return this.getRotorScales();
  }

  setRotorScale(index, scale) {
    if (!Number.isInteger(index) || index < 0 || index >= this.rotorCount) {
      return this.getRotorScales();
    }
    const value = Number(scale);
    this.rotorScales[index] = Number.isFinite(value) ? value : this.defaultScale;
    return this.getRotorScales();
  }

  reset() {
    this.rotorScales = new Array(this.rotorCount).fill(this.defaultScale);
    return this.getRotorScales();
  }
}
