export function attachedCameraConfigs(config) {
  const cameras = [];
  if (config.frontCamera) {
    cameras.push({ name: "front", config: config.frontCamera, primary: true });
  }
  for (const camera of config.extraCameras ?? []) {
    if (!camera || typeof camera.name !== "string" || camera.name.length === 0) {
      throw new Error("[Vehicle] extra camera name must be a non-empty string.");
    }
    cameras.push({ name: camera.name, config: camera, primary: false });
  }
  return cameras;
}
