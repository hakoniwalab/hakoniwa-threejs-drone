// src/app.js
import * as THREE from 'three';
import { HakoniwaFrame } from "./frame.js";
import { createGltfLoader, loadConfig } from "./loader.js";
import { OrbitCamera } from "./orbit_camera.js";
import { buildEnvironments } from './environment.js';
import { Drone } from "./drone.js";

console.log("[Hakoniwa] app.js loaded");

const clock = new THREE.Clock();

const container = document.getElementById("three-root");
if (!container) {
  console.error("[Hakoniwa] three-root element not found");
  // 念のため fallback（デバッグ用）
  // throw new Error("three-root not found"); でも OK
}
const loader = createGltfLoader(THREE);

let orbitCam = null;
let drones = [];
const keyState = {};              // キーボード状態
export function getDrones() {
  return drones;
}
// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

// scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

// light
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
hemi.position.set(0, 20, 0);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(5, 10, 5);
scene.add(dir);

// カメラ初期位置計算用
const tmpVec3 = new THREE.Vector3();

// -------------------------------------------------------------
//  main
// -------------------------------------------------------------
export async function main(url = "/config/drone_config-1.json") {
  const cfg = await loadConfig(url);

  // Environment
  if (cfg.environments) {
    await buildEnvironments(scene, loader, cfg.environments);
  }

  // Drone
  for (let i = 0; i < (cfg.drones ? cfg.drones.length : 0); i++) {
    const drone = await Drone.create(scene, loader, cfg.drones[i], {
      motorChannels: [0, 1, 2, 3],
      rotorScale: 200.0,
    });
    drones.push(drone);
  }

  // Main camera 設定
  if (cfg.main_camera) {
    const mc = cfg.main_camera;

    // ROS オフセット -> Three ベクトル
    const offsetRos = mc.position ?? [0, 0, 0];
    const offsetThree = HakoniwaFrame.rosPosToThree(offsetRos);

    // 初期位置: Drone のワールド座標 + オフセット
    let targetWorld = new THREE.Vector3(0, 0, 0);
    if (drones.length > 0) {
      targetWorld = drones[0].getWorldPosition(tmpVec3.clone());
    }

    const camPos = targetWorld.clone().add(offsetThree);
    const followTarget = (drones.length > 0) ? drones[0] : null;

    orbitCam = new OrbitCamera(renderer, {
      fov:  mc.fov  ?? 60,
      near: mc.near ?? 0.1,
      far:  mc.far  ?? 1000,
      position: [camPos.x,      camPos.y,      camPos.z],
      target:   [targetWorld.x, targetWorld.y, targetWorld.z],

      followTarget,
      initialMode: mc.initialMode ?? "follow",
      followDistance: mc.followDistance ?? null,   // null → position/target の距離をそのまま使う
      followLerpPos: mc.followLerpPos ?? 8.0,
      followLerpTarget: mc.followLerpTarget ?? 10.0,
      followToggleKey: mc.followToggleKey ?? "c",
    });

  } else {
    orbitCam = new OrbitCamera(renderer);
  }

  scene.add(orbitCam.entity.object3d);
  animate();
}

// -------------------------------------------------------------
//  loop
// -------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);

  let dt = clock.getDelta();
  if (dt < 0.0001) dt = 0.0001; // ほぼ0は 0.1ms とみなす
  if (dt > 0.05)   dt = 0.05;   // 50ms(=20fps) より大きいのは固定

  for (let i = 0; i < drones.length; i++) {
    drones[i].update(dt, keyState);
  }
  if (keyState["1"]) {
    orbitCam.updateFollowDistance(-dt * 1.0);
  }
  if (keyState["2"]) {
    orbitCam.updateFollowDistance(dt * 1.0);
  }

  if (orbitCam) {
    orbitCam.update(dt);

    const w = container.clientWidth;
    const h = container.clientHeight;

    // ① メインビュー
    renderer.setViewport(0, 0, w, h);
    renderer.setScissorTest(false);
    renderer.render(scene, orbitCam.camera);

    // ② 小窓たち（AttachCamera 相当）
    for (const d of drones) {
      d.renderAttachedCameras(renderer, scene, w, h);
    }
  }
}

// -------------------------------------------------------------
//  events
// -------------------------------------------------------------
window.addEventListener("resize", () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h);

  if (orbitCam) {
    orbitCam.resize(w, h);
  }
});

window.addEventListener("keydown", (e) => {
  keyState[e.key] = true;
});

window.addEventListener("keyup", (e) => {
  keyState[e.key] = false;
});

//main().catch((e) => console.error(e));
