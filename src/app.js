// src/app.js
import * as THREE from 'three';
import { RenderEntity } from "./render_entity.js";
import { HakoniwaFrame } from "./frame.js";
import { createGltfLoader, loadConfig } from "./loader.js";
import { OrbitCamera } from "./orbit_camera.js";
import { Hakoniwa } from "./hakoniwa/hakoniwa-pdu.js";
import { pduToJs_Twist } from "/thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/geometry_msgs/pdu_conv_Twist.js";
import { pduToJs_HakoHilActuatorControls } from "/thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/hako_mavlink_msgs/pdu_conv_HakoHilActuatorControls.js";

console.log("[Hakoniwa] app.js loaded");
const clock = new THREE.Clock();

const container = document.getElementById("app");
const loader = createGltfLoader(THREE);
let orbitCam = null;
let latestPduPose = null;   // { rosPos: [x,y,z], rosRpyDeg: [r,p,y] }
let rotorSpeed = 0;                // [rad/sec] 実際に使う回転速度
let rotorSpeedHistory = [];        // 過去1秒分の { t, speed } の配列
const MOTOR_CHANNEL_INDICES = [0, 1, 2, 3]; // ch1〜ch4 をモータとみなす

let pduConnected = false;
let followTargetEnt = null;       // 追従する RenderEntity（Drone）
let followOffsetThree = null;     // Three 座標系のオフセット
const tmpVec3 = new THREE.Vector3(); // 毎フレーム使い回す用

const DRONE_ID = "Drone";   // drone_config-1.json の name と合わせる

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

<b>Drone Rotation (ROS)</b>
Roll:  ${rpy[0].toFixed(1)}°
Pitch: ${rpy[1].toFixed(1)}°
Yaw:   ${rpy[2].toFixed(1)}°
  `.trim();
  debugPanel.innerHTML += `
<hr>
<b>PDU</b>
Connected: ${pduConnected}
Has Pose:  ${latestPduPose ? 'yes' : 'no'}
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
        ent.setPositionRos(envCfg.pos);
        ent.setRpyRosDeg(envCfg.hpr);

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
      droneCfg.model.model_path,
      (gltf) => resolve(gltf.scene),
      undefined,
      reject
    );
  });
  const ent_model = new RenderEntity(droneCfg.name + "_model");
  ent_model.setAttachment(m);
  ent_model.setPositionRos(droneCfg.model.pos);
  ent_model.setRpyRosDeg(droneCfg.model.hpr);
  ent.setModel(ent_model);
  if (droneCfg.pos) { ent.setPositionRos(droneCfg.pos); }
  if (droneCfg.hpr) { ent.setRpyRosDeg(droneCfg.hpr); }

  // rotors (最小)
  if (droneCfg.rotors) {
    for (const r of droneCfg.rotors) {
      const rotorEnt = new RenderEntity(r.name);
      const rotorEntModel = new RenderEntity(r.name + "_model");

      loader.load(r.model.model_path, (gltf) => {
        rotorEntModel.setAttachment(gltf.scene);
      });
      rotorEntModel.setRpyRosDeg(r.model.hpr);
      rotorEntModel.setPositionRos(r.model.pos);
      rotorEnt.setModel(rotorEntModel);

      rotorEnt.setPositionRos(r.pos);
      rotorEnt.setRpyRosDeg(r.hpr);
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

async function startPduPolling() {
  // すでに接続済みなら二重起動しない
  const state = Hakoniwa.getConnectionState();
  if (state.isConnected) {
    return;
  }

  const ok = await Hakoniwa.connect();
  if (!ok) {
    console.error("[HakoniwaThree] PDU connect failed.");
    return;
  }
  pduConnected = true;
  console.log("[HakoniwaThree] PDU connected.");

  // pos PDU を declare（Leaflet版と同じ）
  Hakoniwa.withPdu(async (pdu) => {
    let ret = await pdu.declare_pdu_for_read(DRONE_ID, "pos");
    console.log(`[HakoniwaThree] declare ${DRONE_ID}/pos:`, ret);
    ret = await pdu.declare_pdu_for_read(DRONE_ID, "motor");
    console.log(`[HakoniwaThree] declare ${DRONE_ID}/motor:`, ret);
  });

  // ★ ポーリング開始（100msごと）
  setInterval(() => {
    Hakoniwa.withPdu((pdu) => {
      const buf = pdu.read_pdu_raw_data(DRONE_ID, "pos");
      if (!buf) return;

      const twist = pduToJs_Twist(buf);

      const x_ros = twist.linear.x;
      const y_ros = twist.linear.y;
      const z_ros = twist.linear.z;
      const roll  = twist.angular.x; // [rad]
      const pitch = twist.angular.y;
      const yaw   = twist.angular.z;

      // rad → deg に変換（RenderEntity は deg 前提）
      const rad2deg = (r) => r * 180.0 / Math.PI;

      latestPduPose = {
        rosPos: [x_ros, y_ros, z_ros],
        rosRpyDeg: [
          rad2deg(roll),
          rad2deg(pitch),
          rad2deg(yaw),
        ],
      };
      // --- PWM duty PDU も読む ---
      const buf_motor = pdu.read_pdu_raw_data(DRONE_ID, "motor");
      if (!buf_motor) return;
      // PWM duty PDU も読む
      const msg = pduToJs_HakoHilActuatorControls(buf_motor);
      const controls = msg.controls; // [ch1, ch2, ..., ch16]
      if (!controls || controls.length === 0) return;

      // 今回サンプルとしてモータ1〜4の duty を平均する
      let sumDuty = 0;
      let count = 0;
      for (const idx of MOTOR_CHANNEL_INDICES) {
        if (idx < controls.length) {
          sumDuty += controls[idx];
          count++;
        }
      }
      if (count === 0) return;

      const avgDutyNow = sumDuty / count;

      // duty → 回転速度（仮変換）
      const rotorSpeedNow = avgDutyNow * 200.0; // 好きなスケールに調整OK
      //console.log("avgDutyNow:", avgDutyNow.toFixed(3),
      //            "rotorSpeedNow:", rotorSpeedNow.toFixed(1));

      // --- 1秒分の履歴を作る ---
      const nowSec = performance.now() / 1000.0;
      rotorSpeedHistory.push({ t: nowSec, speed: rotorSpeedNow });

      // 1秒より古いものを捨てる
      const windowSec = 1.0;
      while (rotorSpeedHistory.length > 0 &&
            nowSec - rotorSpeedHistory[0].t > windowSec) {
        rotorSpeedHistory.shift();
      }

      // 平均を計算してグローバル rotorSpeed に反映
      const sumSpeed = rotorSpeedHistory.reduce((a, v) => a + v.speed, 0);
      rotorSpeed = sumSpeed / rotorSpeedHistory.length;
      //console.log("length:", rotorSpeedHistory.length,
      //            "rotorSpeed(1s avg):", rotorSpeed.toFixed(1));

      // デバッグ
      // console.log("avgDutyNow:", avgDutyNow.toFixed(3),
      //             "rotorSpeedNow:", rotorSpeedNow.toFixed(1),
      //             "rotorSpeed(1s avg):", rotorSpeed.toFixed(1));
      });
  }, 100);
}
function updateDroneFromPdu(dt) {
  if (!droneRoot) return;
  if (!pduConnected) return;
  if (!latestPduPose) return;

  // ここは毎フレーム同じ値で上書きする前提
  const { rosPos, rosRpyDeg } = latestPduPose;

  // 直接絶対姿勢をセット
  droneRoot.setPositionRos(rosPos);
  droneRoot.setRpyRosDeg(rosRpyDeg);

  // プロペラ回転速度セット
  //console.log("Setting rotorSpeed from PDU:", rotorSpeed);
  if (dt <= 0) return;
  let index = 0;
  if (rotorSpeed !== 0) {
    const d = rotorSpeed * dt;
    //console.log("Updating rotors with speed:", d);
    //console.log("rotorSpeed:", rotorSpeed);
    //console.log("dt:", dt);
    for (const rotorEnt of rotorEntities) {
      // ローターは自分のローカル軸まわりに回転
      if (index % 2 === 0) {
        rotorEnt.rotateLocalEuler([0, -d, 0]); // 例: Y 軸 逆回転
      } else {
        rotorEnt.rotateLocalEuler([0, d, 0]); // 例: Y 軸
      }
      index++;
    }
  }


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
    followTargetEnt = drone; // buildDrone で作ったやつ

    // ROS オフセット -> Three ベクトル
    const offsetRos = mc.position ?? [0, 0, 0];
    followOffsetThree = HakoniwaFrame.rosPosToThree(offsetRos);

    // 初期位置: Drone のワールド座標 + オフセット
    const targetWorld = followTargetEnt.getWorldPosition(tmpVec3.clone());
    const camPos = targetWorld.clone().add(followOffsetThree);

    orbitCam = new OrbitCamera(renderer, {
      fov:  mc.fov  ?? 60,
      near: mc.near ?? 0.1,
      far:  mc.far  ?? 1000,
      position: [camPos.x,      camPos.y,      camPos.z],
      target:   [targetWorld.x, targetWorld.y, targetWorld.z],
    });
  } else {
    orbitCam = new OrbitCamera(renderer);
  }

  scene.add(orbitCam.entity.object3d);

  startPduPolling().catch(e => console.error(e));

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
    //console.log("Updating rotors with speed:", d);
    for (const rotorEnt of rotorEntities) {
      // ローターは自分のローカル軸まわりに回転
      //console.log("rotorSpeed:", rotorSpeed);
      //console.log("dt:", dt);
      rotorEnt.rotateLocalEuler([0, d, 0]); // 例: Y 軸
    }
  }
}


function animate() {
  requestAnimationFrame(animate);
  let dt = clock.getDelta();
  if (dt < 0.0001) dt = 0.0001; // ほぼ0は 0.1ms とみなす
  if (dt > 0.05)   dt = 0.05;   // 50ms(=20fps) より大きいのは固定

  // ★ PDU優先で位置決め
  updateDroneFromPdu(dt);

  // ★ デバッグ用 WASD は「PDU未接続のときだけ」有効にしてもいい
  if (!pduConnected) {
    updateDroneDebug(dt);
  }
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
