import { attachedCameraConfigs } from "../../src/vehicle_camera.js";

const frontCamera = { position: [1, 0, 1] };
const cabinCamera = { name: "cabin", position: [0.4, 0.4, 0.8] };
const cameras = attachedCameraConfigs({
  frontCamera,
  extraCameras: [cabinCamera],
});
let rejectedUnnamed = false;
try {
  attachedCameraConfigs({ extraCameras: [{ position: [0, 0, 0] }] });
} catch {
  rejectedUnnamed = true;
}

console.log(JSON.stringify({ cameras, rejectedUnnamed }));
