// src/app.js
import * as THREE from 'three';
import { RenderEntity } from "./render_entity.js";
import { HakoniwaFrame } from "./frame.js";
import { createGltfLoader, loadConfig } from "./loader.js";
import { OrbitCamera } from "./orbit_camera.js";

console.log("[Hakoniwa] app.js loaded");
const clock = new THREE.Clock();

const container = document.getElementById("app");
const loader = createGltfLoader(THREE);
let orbitCam = null;

// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

// scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

// ★ デバッグ用
let droneRoot = null;            // ドローンのルート RenderEntity
const rotorEntities = [];          // プロペラ用 RenderEntity（またはその object3d）
const keyState = {};             // キーボード状態
let rotorSpeed = 0;              // [rad/sec] 回転速度（+で正転, -で逆転）

// ★ デバッグUI要素
const debugPanel = document.createElement('div');
debugPanel.style.cssText = `
  position: absolute;
  top: 10px;
  left: 10px;
  background: rgba(0, 0, 0, 0.7);
  color: #0f0;
  font-family: monospace;
  font-size: 14px;
  padding: 10px;
  border-radius: 5px;
  pointer-events: none;
  z-index: 1000;
`;
container.appendChild(debugPanel);

function updateDebugUI() {
  if (!droneRoot) {
    debugPanel.textContent = 'Drone: Not loaded';
    return;
  }

  const pos = droneRoot.rosPos;
  const rpy = droneRoot.rosRpyDeg;
  
  // Three.js座標を取得
  const threePos = droneRoot.object3d.position;
  const threeRot = droneRoot.object3d.rotation;

  debugPanel.innerHTML = `
<b>Drone Position (ROS)</b>
X: ${pos[0].toFixed(3)} m (forward)
Y: ${pos[1].toFixed(3)} m (left)
Z: ${pos[2].toFixed(3)} m (up)

<b>Drone Position (Three.js)</b>
X: ${threePos.x.toFixed(3)} m (right)
Y: ${threePos.y.toFixed(3)} m (up)
Z: ${threePos.z.toFixed(3)} m (forward)

<b>Drone Rotation (ROS)</b>
Roll:  ${rpy[0].toFixed(1)}°
Pitch: ${rpy[1].toFixed(1)}°
Yaw:   ${rpy[2].toFixed(1)}°

<b>Drone Rotation (Three.js)</b>
X: ${(threeRot.x * 180 / Math.PI).toFixed(1)}°
Y: ${(threeRot.y * 180 / Math.PI).toFixed(1)}°
Z: ${(threeRot.z * 180 / Math.PI).toFixed(1)}°
  `.trim();
}


// -------------------------------------------------------------
//  Environment builder
// -------------------------------------------------------------
async function buildEnvironment(envCfg) {
  const ent = new RenderEntity(envCfg.name);

  return new Promise((resolve, reject) => {
    loader.load(
      envCfg.model,
      (gltf) => {
        const m = gltf.scene;

        if (envCfg.scale) {
          m.scale.set(envCfg.scale, envCfg.scale, envCfg.scale);
        }

        ent.setAttachment(m);

        if (envCfg.pos) { ent.setPositionRos(envCfg.pos); }
        if (envCfg.hpr) { ent.setRpyRosDeg(envCfg.hpr); }

        scene.add(ent.object3d);
        resolve(ent);
      },
      undefined,
      reject
    );
  });
}


// -------------------------------------------------------------
//  Drone builder
// -------------------------------------------------------------
async function buildDrone(droneCfg) {
  const ent = new RenderEntity(droneCfg.name);

  const m = await new Promise((resolve, reject) => {
    loader.load(
      droneCfg.model,
      (gltf) => resolve(gltf.scene),
      undefined,
      reject
    );
  });
  const ent_model = new RenderEntity(droneCfg.name + "_model");
  ent_model.setAttachment(m);
  ent_model.setPositionRos(droneCfg.model_pos);
  ent_model.setRpyRosDeg(droneCfg.model_hpr);
  ent.addChild(ent_model);
  if (droneCfg.pos) { ent.setPositionRos(droneCfg.pos); }
  if (droneCfg.hpr) { ent.setRpyRosDeg(droneCfg.hpr); }

  // rotors (最小)
  if (droneCfg.rotors) {
    for (const r of droneCfg.rotors) {
      const rotorEnt = new RenderEntity(r.name);
      const rotorEntModel = new RenderEntity(r.name + "_model");

      loader.load(r.model, (gltf) => {
        rotorEntModel.setAttachment(gltf.scene);
      });
      rotorEntModel.setRpyRosDeg(r.model_hpr);
      rotorEnt.addChild(rotorEntModel);

      rotorEnt.setPositionRos(r.pos);
      ent.addChild(rotorEnt);

      //for debug
      rotorEntities.push(rotorEnt);
    }
  }
  if (droneCfg.cameras) {
    for (const c of droneCfg.cameras) {
      const camEnt = new RenderEntity(c.name);
      const camModelEnt = new RenderEntity(c.name + "_model");
      camModelEnt.setPositionRos(c.model.pos);
      camModelEnt.setRpyRosDeg(c.model.hpr);
      loader.load(c.model.model_path, (gltf) => {
        camModelEnt.setAttachment(gltf.scene);
      });

      camEnt.addChild(camModelEnt);
      camEnt.setPositionRos(c.pos);
      camEnt.setRpyRosDeg(c.hpr);

      ent.addChild(camEnt);
    }
  }

  scene.add(ent.object3d);

  // for debug
  droneRoot = ent;

  return ent;
}


// -------------------------------------------------------------
//  Main flow
// -------------------------------------------------------------


// light
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
hemi.position.set(0, 20, 0);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(5, 10, 5);
scene.add(dir);


async function main() {
  const cfg = await loadConfig();

  // Environment
  if (cfg.environments) {
    for (const envCfg of cfg.environments) {
      await buildEnvironment(envCfg);
    }
  }

  // Drone
  let drone = null;
  if (cfg.drones && cfg.drones.length > 0) {
    drone = await buildDrone(cfg.drones[0]);
  }

  // Main camera 設定
  if (cfg.main_camera) {
    const mc = cfg.main_camera;
    const three_position = HakoniwaFrame.rosPosToThree(mc.position);
    const three_target = HakoniwaFrame.rosPosToThree(mc.target);
    orbitCam = new OrbitCamera(renderer, {
      fov: mc.fov ?? 60,
      near: mc.near ?? 0.1,
      far: mc.far ?? 1000,
      position: [three_position.x, three_position.y, three_position.z],
      target: [three_target.x, three_target.y, three_target.z]
    });
  } else {
    orbitCam = new OrbitCamera(renderer);
  }

  scene.add(orbitCam.entity.object3d);

  animate();
}

function updateDroneDebug(dt) {
  if (!droneRoot) return;

  const moveSpeed = 2.0;        // [m/s] (ROS 座標系)
  const rotSpeedDeg = 60.0;     // [deg/s] yaw 用

  const dPos = [0, 0, 0];       // [dx, dy, dz] in ROS
  const dRpy = [0, 0, 0];       // [droll, dpitch, dyaw] in deg

  // --- 位置: ROS 絶対座標系での移動 ---
  //  X: forward, Y: left, Z: up
  if (keyState["w"]) dPos[0] += moveSpeed * dt;   // 前へ
  if (keyState["s"]) dPos[0] -= moveSpeed * dt;   // 後ろへ
  if (keyState["a"]) dPos[1] += moveSpeed * dt;   // 左へ
  if (keyState["d"]) dPos[1] -= moveSpeed * dt;   // 右へ
  if (keyState["r"]) dPos[2] += moveSpeed * dt;   // 上へ
  if (keyState["f"]) dPos[2] -= moveSpeed * dt;   // 下へ

  // --- 姿勢: ROS の yaw を変更 ---
  if (keyState["q"]) dRpy[2] += rotSpeedDeg * dt; // 左ヨー
  if (keyState["e"]) dRpy[2] -= rotSpeedDeg * dt; // 右ヨー

  if (dPos[0] || dPos[1] || dPos[2]) {
    droneRoot.translateRos(dPos);
  }
  if (dRpy[0] || dRpy[1] || dRpy[2]) {
    droneRoot.rotateRosDeg(dRpy);
  }

  // --- プロペラ回転 ---
  const accel = 20.0; // [rad/s^2]
  if (keyState["j"]) rotorSpeed -= accel * dt;
  if (keyState["k"]) rotorSpeed += accel * dt;
  if (keyState["l"]) rotorSpeed = 0;

  if (rotorSpeed !== 0) {
    const d = rotorSpeed * dt;
    for (const rotorEnt of rotorEntities) {
      // ローターは自分のローカル軸まわりに回転
      rotorEnt.rotateLocalEuler([0, d, 0]); // 例: Y 軸
    }
  }
}


function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();
  updateDroneDebug(dt);
  updateDebugUI();
  if (orbitCam) {
    orbitCam.update(dt);
    renderer.render(scene, orbitCam.camera);
  }
}


window.addEventListener("resize", () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  renderer.setSize(w, h);

  if (orbitCam) {
    orbitCam.resize(w, h);
  }
});
// ★ キー入力
window.addEventListener("keydown", (e) => {
  keyState[e.key] = true;
});

window.addEventListener("keyup", (e) => {
  keyState[e.key] = false;
});


main().catch((e) => console.error(e));
