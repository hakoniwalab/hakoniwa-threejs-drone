import { PoseInterpolator } from "./pose_interpolator.js";

const RAD2DEG = 180.0 / Math.PI;
const DEG2RAD = Math.PI / 180.0;

function stateToTransform(state) {
  const [rollDeg, pitchDeg, yawDeg] = state.rosRpyDeg;
  const roll = rollDeg * DEG2RAD / 2;
  const pitch = pitchDeg * DEG2RAD / 2;
  const yaw = yawDeg * DEG2RAD / 2;
  const cr = Math.cos(roll); const sr = Math.sin(roll);
  const cp = Math.cos(pitch); const sp = Math.sin(pitch);
  const cy = Math.cos(yaw); const sy = Math.sin(yaw);
  return {
    translation: { x: state.rosPos[0], y: state.rosPos[1], z: state.rosPos[2] },
    rotation: {
      x: sr * cp * cy - cr * sp * sy,
      y: cr * sp * cy + sr * cp * sy,
      z: cr * cp * sy - sr * sp * cy,
      w: cr * cp * cy + sr * sp * sy,
    },
  };
}

function transformToPose(transform) {
  const { x, y, z, w } = transform.rotation;
  const roll = Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y));
  const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x))));
  const yaw = Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z));
  return {
    rosPos: [transform.translation.x, transform.translation.y, transform.translation.z],
    rosRpyDeg: [roll * RAD2DEG, pitch * RAD2DEG, yaw * RAD2DEG],
  };
}

export class FleetPoseInterpolator {
  constructor(config = null) {
    this.config = config?.enabled === true ? config : null;
    this.byDrone = new Map();
  }

  push(droneId, state, nowMsec) {
    if (!this.config) return;
    let interpolator = this.byDrone.get(droneId);
    if (!interpolator) {
      interpolator = new PoseInterpolator({
        delayMsec: this.config.delayMsec,
        periodMsec: this.config.periodMsec,
        snapDistanceM: this.config.snapDistanceM,
      });
      this.byDrone.set(droneId, interpolator);
    }
    interpolator.push(stateToTransform(state), nowMsec);
  }

  sample(droneId, newestState, nowMsec) {
    const transform = this.byDrone.get(droneId)?.sample(nowMsec);
    return transform ? { ...newestState, ...transformToPose(transform) } : newestState;
  }

  clear() {
    this.byDrone.clear();
  }
}
