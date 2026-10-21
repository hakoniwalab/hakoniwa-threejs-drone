import * as THREE from "three";
import { FrontDirectionTracker } from "./front_camera.js";
import { overviewInsetPose } from "./overview_camera.js";

export class OverviewInsetCamera {
  constructor({ fov = 60, near = 0.1, far = 2000, targets = () => [], minDistanceM = 15, marginM = 5 } = {}) {
    this.camera = new THREE.PerspectiveCamera(fov, 1, near, far);
    this.targets = targets;
    this.minDistanceM = minDistanceM;
    this.marginM = marginM;
    this.directionTracker = new FrontDirectionTracker();
    this.target = new THREE.Vector3();
    this.initialized = false;
  }

  update(dt) {
    const positions = [];
    for (const target of this.targets?.() ?? []) {
      if (!target?.getWorldPosition) continue;
      const position = target.getWorldPosition(new THREE.Vector3());
      positions.push([position.x, position.y, position.z]);
    }
    if (!positions.length) return false;
    const direction = this.directionTracker.update(positions, dt, [], [0, 0, -1]);
    const pose = overviewInsetPose(positions, this.camera.fov, direction, {
      minDistanceM: this.minDistanceM,
      marginM: this.marginM,
    });
    const desiredPosition = new THREE.Vector3(...pose.position);
    const desiredTarget = new THREE.Vector3(...pose.target);
    if (!this.initialized) {
      this.camera.position.copy(desiredPosition);
      this.target.copy(desiredTarget);
      this.initialized = true;
    } else {
      const alpha = 1 - Math.exp(-8 * dt);
      this.camera.position.lerp(desiredPosition, alpha);
      this.target.lerp(desiredTarget, alpha);
    }
    this.camera.lookAt(this.target);
    return true;
  }
}
