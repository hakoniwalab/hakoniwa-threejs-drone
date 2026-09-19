import * as THREE from "three";
import { HakoniwaFrame } from "./frame.js";

const gltfCache = new Map();

function finiteVector(values, length, label) {
  if (!Array.isArray(values) || values.length !== length
    || values.some((value) => !Number.isFinite(value))) {
    throw new Error(`[Vehicle] ${label} must contain ${length} finite numbers.`);
  }
  return values;
}

function fluVectorToThree(values) {
  const [x, y, z] = finiteVector(values, 3, "FLU vector");
  return new THREE.Vector3(-y, z, -x);
}

function fluRpyToThreeQuaternion(rpyRad) {
  finiteVector(rpyRad, 3, "RPY");
  return HakoniwaFrame.rosRpyToThreeQuaternion(
    rpyRad.map((value) => value * 180 / Math.PI),
  );
}

function fluQuaternionToThree(quaternion) {
  const { x, y, z, w } = quaternion ?? {};
  if (![x, y, z, w].every(Number.isFinite)) {
    throw new Error("[Vehicle] world quaternion is invalid.");
  }
  return new THREE.Quaternion(-y, z, -x, w).normalize();
}

function fluAssetBasis() {
  const matrix = new THREE.Matrix4();
  matrix.set(
    0, -1, 0, 0,
    0, 0, 1, 0,
    -1, 0, 0, 0,
    0, 0, 0, 1,
  );
  return matrix;
}

async function loadGltfScene(loader, url) {
  if (!gltfCache.has(url)) {
    gltfCache.set(url, loader.loadAsync(url).then((gltf) => gltf.scene));
  }
  return (await gltfCache.get(url)).clone(true);
}

export class Vehicle {
  constructor(scene, loader, config) {
    this.scene = scene;
    this.loader = loader;
    this.config = config;
    this.vehicleId = config.name;
    this.root = new THREE.Object3D();
    this.root.name = config.name;
    this.parts = new Map();
    this.joints = new Map();
    this.latestPose = null;
    this.viewCameras = [];
  }

  static async create(scene, loader, config) {
    const vehicle = new Vehicle(scene, loader, config);
    await vehicle.initialize();
    return vehicle;
  }

  async initialize() {
    const viewModelUrl = this.config.viewModelPath;
    const response = await fetch(viewModelUrl);
    if (!response.ok) {
      throw new Error(`[Vehicle] failed to load view model: ${viewModelUrl}`);
    }
    const model = await response.json();
    if (model.format !== "hako_viewer_model" || model.coordinate_system !== "mujoco") {
      throw new Error("[Vehicle] expected a MuJoCo hako_viewer_model.");
    }
    const assets = new Map(
      (model.assets ?? []).map((asset) => [
        asset.id,
        new URL(asset.path, viewModelUrl).toString(),
      ]),
    );
    const parts = [model.base, ...(model.fixed_parts ?? []), ...(model.movable_parts ?? [])];
    const pending = [...parts];
    while (pending.length > 0) {
      let progress = false;
      for (let index = pending.length - 1; index >= 0; index -= 1) {
        const part = pending[index];
        const isBase = part.name === model.base?.name;
        const parent = isBase ? this.root : this.parts.get(part.parent);
        if (!parent) continue;
        const node = new THREE.Object3D();
        node.name = `${this.vehicleId}/${part.name}`;
        const mount = part.mount ?? { xyz: [0, 0, 0], rpy: [0, 0, 0] };
        node.position.copy(fluVectorToThree(mount.xyz));
        node.quaternion.copy(fluRpyToThreeQuaternion(mount.rpy));
        node.userData.mountQuaternion = node.quaternion.clone();
        parent.add(node);
        this.parts.set(part.name, node);
        if (part.joint) {
          this.joints.set(part.joint, {
            node,
            axis: fluVectorToThree(part.motion?.axis ?? [0, 0, 1]).normalize(),
            motionType: part.motion?.type,
            mountQuaternion: node.quaternion.clone(),
          });
        }
        if (part.asset) {
          const assetUrl = assets.get(part.asset);
          if (!assetUrl) throw new Error(`[Vehicle] unknown asset: ${part.asset}`);
          const visual = await loadGltfScene(this.loader, assetUrl);
          visual.name = `${node.name}/visual`;
          visual.applyMatrix4(fluAssetBasis());
          node.add(visual);
        }
        pending.splice(index, 1);
        progress = true;
      }
      if (!progress) {
        throw new Error(`[Vehicle] unresolved part hierarchy: ${pending.map((p) => p.name).join(", ")}`);
      }
    }
    const frontCamera = this.config.frontCamera;
    if (frontCamera) {
      const camera = new THREE.PerspectiveCamera(
        frontCamera.fov ?? 70,
        1.0,
        frontCamera.near ?? 0.1,
        frontCamera.far ?? 1000,
      );
      camera.name = `${this.vehicleId}/front-camera`;
      camera.position.copy(fluVectorToThree(frontCamera.position ?? [1.2, 0, 1.2]));
      camera.quaternion.copy(fluRpyToThreeQuaternion(frontCamera.rpy ?? [0, 0, 0]));
      this.root.add(camera);
      this.viewCameras.push({
        camera,
        viewport: frontCamera.window ?? {
          x: 0.70, y: 0.70, width: 0.28, height: 0.28,
        },
        backgroundColor: new THREE.Color(frontCamera.backgroundColor ?? 0x000000),
        borderColor: new THREE.Color(frontCamera.borderColor ?? 0xffffff),
        borderWidthPx: frontCamera.borderWidthPx ?? 3,
      });
    }
    this.scene.add(this.root);
  }

  applyState({ transform, joints = {} } = {}) {
    if (transform) {
      const translation = transform.translation;
      this.root.position.copy(fluVectorToThree([
        translation.x, translation.y, translation.z,
      ]));
      this.root.quaternion.copy(fluQuaternionToThree(transform.rotation));
      this.latestPose = transform;
    }
    for (const [jointName, value] of Object.entries(joints)) {
      const binding = this.joints.get(jointName);
      if (!binding || !Number.isFinite(value)) continue;
      if (!["continuous", "revolute"].includes(binding.motionType)) continue;
      const motion = new THREE.Quaternion().setFromAxisAngle(binding.axis, value);
      binding.node.quaternion.copy(binding.mountQuaternion).multiply(motion);
    }
  }

  getWorldPosition(target = new THREE.Vector3()) {
    return this.root.getWorldPosition(target);
  }

  renderAttachedCameras(renderer, scene, fullWidth, fullHeight) {
    for (const {
      viewport, camera, backgroundColor, borderColor, borderWidthPx,
    } of this.viewCameras) {
      const vpW = Math.max(1, Math.floor(fullWidth * viewport.width));
      const vpH = Math.max(1, Math.floor(fullHeight * viewport.height));
      const vpX = Math.floor(fullWidth * viewport.x);
      const vpY = Math.floor(fullHeight * viewport.y);
      camera.aspect = vpW / vpH;
      camera.updateProjectionMatrix();
      renderer.setScissorTest(true);
      renderer.setViewport(vpX, vpY, vpW, vpH);
      renderer.setScissor(vpX, vpY, vpW, vpH);
      const previousColor = renderer.getClearColor(new THREE.Color());
      const previousAlpha = renderer.getClearAlpha();
      renderer.setClearColor(borderColor, 1.0);
      renderer.clear(true, false, false);
      const border = Math.max(0, Math.floor(borderWidthPx));
      renderer.setViewport(
        vpX + border, vpY + border,
        Math.max(1, vpW - border * 2), Math.max(1, vpH - border * 2),
      );
      renderer.setScissor(
        vpX + border, vpY + border,
        Math.max(1, vpW - border * 2), Math.max(1, vpH - border * 2),
      );
      renderer.setClearColor(backgroundColor, 1.0);
      renderer.clearDepth();
      renderer.render(scene, camera);
      renderer.setClearColor(previousColor, previousAlpha);
      renderer.setScissorTest(false);
    }
  }

  getPrimaryAttachedCamera() {
    return this.viewCameras[0]?.camera ?? null;
  }
}
