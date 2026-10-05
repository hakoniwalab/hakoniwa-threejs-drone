// node tests/js/pose_interpolator_check.mjs -> prints JSON; run by tests/test_static_contract.py
import { PoseInterpolator, slerpQuaternion } from "../../src/state_source/pose_interpolator.js";

const pose = (x) => ({ translation: { x, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0, w: 1 } });
// 8 m/s, a pose every 40 ms of simulation time, arriving with +-10 ms jitter.
const ip = new PoseInterpolator();
let arrival = 0;
let seed = 1;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const arrivals = [];
for (let k = 0; k < 250; k += 1) {
  arrival += 40 + (rnd() - 0.5) * 20;
  arrivals.push([arrival, k * 0.04 * 8]);
}
let next = 0;
let previous = null;
const steps = [];
for (let now = 0; now < arrival; now += 1000 / 60) {
  while (next < arrivals.length && arrivals[next][0] <= now) {
    ip.push(pose(arrivals[next][1]), arrivals[next][0]);
    next += 1;
  }
  const sample = ip.sample(now);
  if (sample && previous !== null && now > 2000) steps.push(sample.translation.x - previous);
  if (sample) previous = sample.translation.x;
}
const fresh = new PoseInterpolator();
fresh.push(pose(1), 0);
const repeated = fresh.push(pose(1), 16);
const half = slerpQuaternion({ x: 0, y: 0, z: 0, w: 1 }, { x: 0, y: 0, z: 1, w: 0 }, 0.5);
const snap = new PoseInterpolator({ periodMsec: 40 });
snap.push(pose(0), 0);
snap.push(pose(5), 40);
const teleported = snap.sample(60).translation.x;
console.log(JSON.stringify({
  teleported,
  minStep: Math.min(...steps), maxStep: Math.max(...steps), repeatedPushIgnored: repeated === false,
  halfTurnZ: half.z, halfTurnW: half.w,
}));
