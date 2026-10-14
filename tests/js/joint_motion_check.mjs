import { jointBindingSpec } from "../../src/joint_motion.js";

const direct = jointBindingSpec({ joint: "front_left_steer_joint" });
const derived = jointBindingSpec({
  joint: "steering_wheel_joint",
  source_joint: "front_left_steer_joint",
  multiplier: 15,
});
let rejectedZero = false;
try {
  jointBindingSpec({ joint: "bad", multiplier: 0 });
} catch {
  rejectedZero = true;
}

console.log(JSON.stringify({ direct, derived, rejectedZero }));
