export class FaultInjectionState {
  constructor({ rotorCount = 4, defaultScale = 1.0 } = {}) {
    this.rotorCount = rotorCount;
    this.defaultScale = defaultScale;
    this.rotorScales = new Array(rotorCount).fill(defaultScale);
    this.windHeadingDeg = 0.0;
    this.windSpeedMps = 0.0;
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

  getWind() {
    return {
      headingDeg: this.windHeadingDeg,
      speedMps: this.windSpeedMps,
    };
  }

  setWind({ headingDeg = this.windHeadingDeg, speedMps = this.windSpeedMps } = {}) {
    const heading = Number(headingDeg);
    const speed = Number(speedMps);
    this.windHeadingDeg = Number.isFinite(heading) ? heading : this.windHeadingDeg;
    this.windSpeedMps = Number.isFinite(speed) ? speed : this.windSpeedMps;
    return this.getWind();
  }

  setWindHeadingDeg(headingDeg) {
    return this.setWind({ headingDeg, speedMps: this.windSpeedMps });
  }

  setWindSpeedMps(speedMps) {
    return this.setWind({ headingDeg: this.windHeadingDeg, speedMps });
  }

  reset() {
    this.rotorScales = new Array(this.rotorCount).fill(this.defaultScale);
    this.windHeadingDeg = 0.0;
    this.windSpeedMps = 0.0;
    return {
      rotorScales: this.getRotorScales(),
      wind: this.getWind(),
    };
  }
}
