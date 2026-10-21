// node tests/js/fleet_interpolation_check.mjs -> prints JSON
import { FleetPoseInterpolator } from "../../src/state_source/fleet_pose_interpolator.js";

const state = (x, yaw, pwm) => ({
  rosPos: [x, 0, 1], rosRpyDeg: [0, 0, yaw * 180 / Math.PI], pwmDuty: pwm,
});

const disabled = new FleetPoseInterpolator({ enabled: false });
const disabledNewest = state(2, Math.PI / 2, [0.8]);
disabled.push("Drone-1", state(0, 0, [0.1]), 0);
disabled.push("Drone-1", disabledNewest, 20);
const disabledState = disabled.sample("Drone-1", disabledNewest, 30);

const enabled = new FleetPoseInterpolator(
  { enabled: true, periodMsec: 20, delayMsec: 20, snapDistanceM: 3 });
const enabledNewest = state(2, Math.PI / 2, [0.8]);
enabled.push("Drone-1", state(0, 0, [0.1]), 0);
enabled.push("Drone-1", enabledNewest, 20);
const midpoint = enabled.sample("Drone-1", enabledNewest, 30);

const snap = new FleetPoseInterpolator(
  { enabled: true, periodMsec: 20, delayMsec: 20, snapDistanceM: 1 });
const snapNewest = state(5, Math.PI, [0.9]);
snap.push("Drone-1", state(0, 0, [0.1]), 0);
snap.push("Drone-1", snapNewest, 20);
const snapped = snap.sample("Drone-1", snapNewest, 21);

console.log(JSON.stringify({
  disabledX: disabledState.rosPos[0],
  midpointX: midpoint.rosPos[0],
  midpointYawDeg: midpoint.rosRpyDeg[2],
  midpointPwm: midpoint.pwmDuty[0],
  snappedX: snapped.rosPos[0],
}));
