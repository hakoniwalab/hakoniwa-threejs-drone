// src/app.js
import * as THREE from 'three';
import { HakoniwaFrame } from "./frame.js";
import { createGltfLoader, loadConfig } from "./loader.js";
import { OrbitCamera } from "./orbit_camera.js";
import { AudienceCamera } from "./audience_camera.js";
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
let audienceCam = null;
let orbitCameraSnapshot = null;
let drones = [];
let beforeDronesUpdateHook = null;
let nightMode = false;
let ledAnimationTimeSec = 0;
let ledAppearanceScale = 1.0;
let ledAppearanceIntensity = 1.0;
let ledSpatialDepthCue = false;
const runtimeOptions = {
  enableAttachedCameras: true,
  enableMainCameraMouseControl: true,
  transparentBackground: false,
};
const keyState = {};              // キーボード状態

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function buildDroneName(baseName, index1Based) {
  if (typeof baseName !== "string" || baseName.length === 0) {
    return `Drone-${index1Based}`;
  }
  const m = baseName.match(/^(.*?)(?:[-_ ]?)(\d+)$/);
  if (m && m[1]) {
    const prefix = m[1].replace(/[-_ ]+$/, "");
    return `${prefix}-${index1Based}`;
  }
  return `${baseName}-${index1Based}`;
}

function expandDroneInstances(sceneDrones, {
  dynamicSpawn = false,
  templateDroneIndex = 0,
  maxDynamicDrones = 1,
} = {}) {
  const src = Array.isArray(sceneDrones) ? sceneDrones : [];
  if (!dynamicSpawn) {
    return src;
  }
  if (src.length === 0) {
    throw new Error("[Hakoniwa] dynamicSpawn requires at least one drone in scene config.");
  }
  if (!Number.isInteger(templateDroneIndex) || templateDroneIndex < 0 || templateDroneIndex >= src.length) {
    throw new Error(`[Hakoniwa] invalid templateDroneIndex: ${templateDroneIndex}`);
  }
  if (!Number.isInteger(maxDynamicDrones) || maxDynamicDrones <= 0) {
    throw new Error(`[Hakoniwa] invalid maxDynamicDrones: ${maxDynamicDrones}`);
  }
  const template = src[templateDroneIndex];
  const templateName = template?.name ?? "Drone";
  const out = [];
  for (let i = 0; i < maxDynamicDrones; i++) {
    const d = deepClone(template);
    d.name = buildDroneName(templateName, i + 1);
    out.push(d);
  }
  return out;
}

export function getDrones() {
  return drones;
}
export function addSceneDecoration(object3d) {
  if (!object3d?.isObject3D) {
    throw new TypeError("[Hakoniwa] scene decoration must be a THREE.Object3D.");
  }
  scene.add(object3d);
  return object3d;
}
export function removeSceneDecoration(object3d) {
  if (!object3d?.isObject3D) return false;
  scene.remove(object3d);
  return true;
}
export function setBeforeDronesUpdateHook(hookFn) {
  beforeDronesUpdateHook = typeof hookFn === "function" ? hookFn : null;
}
export function setViewerRuntimeOptions(options = {}) {
  if (typeof options.enableAttachedCameras === "boolean") {
    runtimeOptions.enableAttachedCameras = options.enableAttachedCameras;
  }
  if (typeof options.enableMainCameraMouseControl === "boolean") {
    runtimeOptions.enableMainCameraMouseControl = options.enableMainCameraMouseControl;
  }
  if (typeof options.transparentBackground === "boolean") {
    runtimeOptions.transparentBackground = options.transparentBackground;
    applyLighting(nightMode);
  }
  if (orbitCam && !audienceCam?.enabled) {
    orbitCam.setMouseControlEnabled(runtimeOptions.enableMainCameraMouseControl);
  }
}

export function setAudienceCameraEnabled(enabled) {
  if (!orbitCam || !audienceCam) return false;
  const next = !!enabled;
  if (next === audienceCam.enabled) return true;
  if (next) {
    orbitCameraSnapshot = {
      position: orbitCam.camera.position.clone(),
      quaternion: orbitCam.camera.quaternion.clone(),
      target: orbitCam.controls.target.clone(),
      fov: orbitCam.camera.fov,
      mode: orbitCam.mode,
    };
    orbitCam.setMouseControlEnabled(false);
  } else {
    if (orbitCameraSnapshot) {
      orbitCam.camera.position.copy(orbitCameraSnapshot.position);
      orbitCam.camera.quaternion.copy(orbitCameraSnapshot.quaternion);
      orbitCam.camera.fov = orbitCameraSnapshot.fov;
      orbitCam.camera.updateProjectionMatrix();
      orbitCam.controls.target.copy(orbitCameraSnapshot.target);
      orbitCam.setMode(orbitCameraSnapshot.mode);
      orbitCam.controls.update();
    }
    orbitCam.setMouseControlEnabled(runtimeOptions.enableMainCameraMouseControl);
  }
  audienceCam.setEnabled(next);
  return true;
}

export function getAudienceCameraState() {
  return audienceCam?.getState() ?? null;
}
export function setAudienceCameraMovementInput(input = {}) {
  if (!audienceCam) return false;
  audienceCam.setMovementInput(input);
  return true;
}
export function setAudienceCameraPose(pose = {}) {
  if (!audienceCam) return null;
  return audienceCam.setPose(pose);
}
// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.toneMappingExposure = 1.25;
container.appendChild(renderer.domElement);

// scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf1f4f8);

function createStarField() {
  const positions = [];
  // Deterministic pseudo-random stars keep screenshots and tests reproducible.
  let seed = 0x48a4c0de;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  for (let i = 0; i < 700; i++) {
    const azimuth = random() * Math.PI * 2;
    const elevation = 0.08 + random() * (Math.PI / 2 - 0.08);
    const radius = 700;
    positions.push(
      radius * Math.cos(elevation) * Math.cos(azimuth),
      radius * Math.sin(elevation),
      radius * Math.cos(elevation) * Math.sin(azimuth),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xbcd7ff,
    size: 1.15,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.72,
    depthWrite: false,
    toneMapped: false,
  });
  const stars = new THREE.Points(geometry, material);
  stars.name = "night_star_field";
  stars.visible = false;
  stars.frustumCulled = false;
  return stars;
}

const starField = createStarField();
scene.add(starField);

// light
const hemi = new THREE.HemisphereLight(0xffffff, 0xa0a0a0, 1.15);
hemi.position.set(0, 20, 0);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 1.5);
dir.position.set(5, 10, 5);
scene.add(dir);

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);

const DAY_LIGHTING = {
  background: 0xf1f4f8,
  hemisphereSky: 0xffffff,
  hemisphereGround: 0xa0a0a0,
  hemisphereIntensity: 1.15,
  directionalColor: 0xffffff,
  directionalIntensity: 1.5,
  ambientColor: 0xffffff,
  ambientIntensity: 0.55,
  exposure: 1.25,
};
const NIGHT_LIGHTING = {
  background: 0x020817,
  hemisphereSky: 0x182a52,
  hemisphereGround: 0x02040a,
  hemisphereIntensity: 0.22,
  directionalColor: 0x9bbcff,
  directionalIntensity: 0.38,
  ambientColor: 0x20345c,
  ambientIntensity: 0.18,
  exposure: 0.72,
};

function applyLighting(mode) {
  const lighting = mode ? NIGHT_LIGHTING : DAY_LIGHTING;
  if (runtimeOptions.transparentBackground) {
    scene.background = null;
    renderer.setClearColor(0x000000, 0.0);
  } else {
    if (!(scene.background instanceof THREE.Color)) {
      scene.background = new THREE.Color(lighting.background);
    } else {
      scene.background.setHex(lighting.background);
    }
    renderer.setClearColor(lighting.background, 1.0);
  }
  hemi.color.setHex(lighting.hemisphereSky);
  hemi.groundColor.setHex(lighting.hemisphereGround);
  hemi.intensity = lighting.hemisphereIntensity;
  dir.color.setHex(lighting.directionalColor);
  dir.intensity = lighting.directionalIntensity;
  ambient.color.setHex(lighting.ambientColor);
  ambient.intensity = lighting.ambientIntensity;
  renderer.toneMappingExposure = lighting.exposure;
  starField.visible = mode && !runtimeOptions.transparentBackground;
}

function createLedGlowTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  const gradient = context.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0.00, "rgba(255,255,255,1.0)");
  gradient.addColorStop(0.12, "rgba(190,245,255,1.0)");
  gradient.addColorStop(0.32, "rgba(30,210,255,0.82)");
  gradient.addColorStop(0.68, "rgba(0,125,255,0.24)");
  gradient.addColorStop(1.00, "rgba(0,60,255,0.0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const ledGlowTexture = createLedGlowTexture();
const ledBulbGeometry = new THREE.SphereGeometry(0.09, 12, 8);
const ledWorldPosition = new THREE.Vector3();

function createLedSprite(name, scale, opacity) {
  const material = new THREE.SpriteMaterial({
    map: ledGlowTexture,
    color: 0x5ee9ff,
    transparent: true,
    opacity,
    depthTest: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.name = name;
  sprite.scale.setScalar(scale);
  sprite.renderOrder = 20;
  return sprite;
}

function createLedBulb(name) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x5ee9ff,
    transparent: true,
    opacity: 1.0,
    toneMapped: false,
  });
  const bulb = new THREE.Mesh(ledBulbGeometry, material);
  bulb.name = name;
  bulb.visible = false;
  bulb.renderOrder = 21;
  return bulb;
}

function attachShowLed(drone, index) {
  if (!drone?.root?.object3d) return;
  const name = drone.droneId ?? `Drone-${index + 1}`;
  const led = new THREE.Group();
  led.name = `${name}_show_led`;
  // Three.js Y is up. Mount the billboard slightly below the body so it is
  // visible when the audience looks up at the show.
  led.position.set(0, -0.16, 0);
  led.userData.showLedIndex = index;
  led.userData.core = createLedSprite(`${name}_show_led_core`, 0.34, 1.0);
  led.userData.halo = createLedSprite(`${name}_show_led_halo`, 1.55, 0.7);
  led.userData.bulb = createLedBulb(`${name}_show_led_bulb`);
  led.add(led.userData.halo);
  led.add(led.userData.core);
  led.add(led.userData.bulb);
  drone.root.object3d.add(led);
  drone.showLed = led;
}

export function setDroneLedStates(states = []) {
  if (!Array.isArray(states)) {
    throw new TypeError("[Hakoniwa] LED states must be an array.");
  }
  const byDroneId = new Map(drones.map((drone) => [String(drone.droneId), drone]));
  let applied = 0;
  for (const state of states) {
    const droneId = String(state?.droneId ?? state?.drone_id ?? "");
    const rgb = state?.rgb;
    const brightness = Number(state?.brightness);
    if (!droneId || !Array.isArray(rgb) || rgb.length !== 3
      || rgb.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
      || !Number.isFinite(brightness) || brightness < 0 || brightness > 1) {
      throw new TypeError(`[Hakoniwa] Invalid LED state for drone '${droneId}'.`);
    }
    const led = byDroneId.get(droneId)?.showLed;
    const core = led?.userData?.core;
    const halo = led?.userData?.halo;
    const bulb = led?.userData?.bulb;
    if (!core?.material || !halo?.material || !bulb?.material) continue;
    const color = new THREE.Color().setStyle(`rgb(${rgb[0]},${rgb[1]},${rgb[2]})`);
    core.material.color.copy(color);
    halo.material.color.copy(color);
    bulb.material.color.copy(color);
    led.userData.showLedBrightness = brightness;
    applied += 1;
  }
  return applied;
}

export function setDroneLedAppearance(options = {}) {
  const scale = Number(options.scale ?? 1.0);
  const intensity = Number(options.intensity ?? 1.0);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 4
    || !Number.isFinite(intensity) || intensity <= 0 || intensity > 4) {
    throw new TypeError("[Hakoniwa] LED appearance requires scale and intensity within (0, 4].");
  }
  if (options.spatialDepthCue != null && typeof options.spatialDepthCue !== "boolean") {
    throw new TypeError("[Hakoniwa] LED spatialDepthCue must be boolean.");
  }
  ledAppearanceScale = scale;
  ledAppearanceIntensity = intensity;
  ledSpatialDepthCue = options.spatialDepthCue === true;
  return {
    scale: ledAppearanceScale,
    intensity: ledAppearanceIntensity,
    spatialDepthCue: ledSpatialDepthCue,
  };
}

function updateShowLeds(dt) {
  ledAnimationTimeSec += dt;
  for (let index = 0; index < drones.length; index++) {
    const led = drones[index]?.showLed;
    const core = led?.userData?.core;
    const halo = led?.userData?.halo;
    const bulb = led?.userData?.bulb;
    if (!core?.material || !halo?.material || !bulb?.material) continue;
    const brightness = Number.isFinite(led.userData.showLedBrightness)
      ? THREE.MathUtils.clamp(led.userData.showLedBrightness, 0, 1)
      : 1.0;
    led.visible = brightness > 0;
    bulb.visible = ledSpatialDepthCue && brightness > 0;

    // A roughly 4.5-second shared breathing cycle remains comfortable to
    // watch while preserving the silhouette of the complete formation.
    const groupWave = 0.5 + 0.5 * Math.sin(ledAnimationTimeSec * Math.PI * 2 * 0.22);
    const shimmer = 0.98 + 0.02 * Math.sin(ledAnimationTimeSec * 1.7 + index * 0.13);
    const pulse = (0.48 + 0.52 * groupWave) * shimmer;
    core.material.opacity = THREE.MathUtils.clamp(
      brightness * (nightMode ? 1.0 : 0.48) * (0.72 + 0.28 * pulse) * ledAppearanceIntensity,
      0,
      1,
    );
    halo.material.opacity = THREE.MathUtils.clamp(
      brightness * (nightMode ? 0.74 : 0.18) * pulse * ledAppearanceIntensity,
      0,
      1,
    );
    bulb.material.opacity = THREE.MathUtils.clamp(
      brightness * ledAppearanceIntensity,
      0,
      1,
    );
    const cameraDistanceM = orbitCam?.camera
      ? orbitCam.camera.position.distanceTo(led.getWorldPosition(ledWorldPosition))
      : 20.0;
    const farBlend = ledSpatialDepthCue
      ? THREE.MathUtils.smoothstep(cameraDistanceM, 3.0, 20.0)
      : 1.0;
    core.scale.setScalar(
      THREE.MathUtils.lerp(
        0.16,
        nightMode ? 0.46 : 0.28,
        farBlend,
      ) * (0.96 + 0.07 * pulse) * ledAppearanceScale,
    );
    halo.scale.setScalar(
      THREE.MathUtils.lerp(
        0.34,
        nightMode ? 1.65 : 0.72,
        farBlend,
      ) * (0.88 + 0.18 * pulse) * ledAppearanceScale,
    );
    bulb.scale.setScalar(ledAppearanceScale);
  }
}

export function setNightMode(enabled) {
  nightMode = !!enabled;
  applyLighting(nightMode);
  return nightMode;
}

export function getNightMode() {
  return nightMode;
}

// カメラ初期位置計算用
const tmpVec3 = new THREE.Vector3();

// -------------------------------------------------------------
//  main
// -------------------------------------------------------------
export async function main(
  url = "/config/drone_config-compact-1.json",
  {
    dynamicSpawn = false,
    templateDroneIndex = 0,
    maxDynamicDrones = 1,
    droneAppearance = {},
    audienceCamera = null,
    initialCameraMode = "free",
  } = {},
) {
  console.log("[Hakoniwa] main() start. loading config:", url);
  const cfg = await loadConfig(url);

  // Environment
  if (cfg.environments) {
    await buildEnvironments(scene, loader, cfg.environments);
  }

  // Drone
  const droneInstances = expandDroneInstances(cfg.drones, {
    dynamicSpawn,
    templateDroneIndex,
    maxDynamicDrones,
  });
  for (let i = 0; i < droneInstances.length; i++) {
    console.log("[Hakoniwa] Creating drone:", droneInstances[i].name);
    const drone = await Drone.create(scene, loader, droneInstances[i], {
      motorChannels: [0, 1, 2, 3],
      rotorScale: 200.0,
      bodyColor: droneAppearance.bodyColor ?? null,
    });
    attachShowLed(drone, i);
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
      mouseEnabled: runtimeOptions.enableMainCameraMouseControl,
    });

  } else {
    orbitCam = new OrbitCamera(renderer, {
      mouseEnabled: runtimeOptions.enableMainCameraMouseControl,
    });
  }

  scene.add(orbitCam.entity.object3d);
  if (audienceCamera) {
    audienceCam = new AudienceCamera(orbitCam.camera, renderer.domElement, audienceCamera);
    if (initialCameraMode === "audience") setAudienceCameraEnabled(true);
  }
  animate();
}

export function focusDroneById(droneId, { snap = true } = {}) {
  if (!orbitCam || !drones?.length) return false;

  const target = drones.find(d => String(d.droneId) === String(droneId));
  if (!target) return false;

  orbitCam.setFollowTarget(target);
  orbitCam.setMode("follow");

  return true;
}

export function setCameraFollowEnabled(enabled) {
  if (!orbitCam) return false;
  orbitCam.setMode(enabled ? "follow" : "fixed");
  return true;
}

// -------------------------------------------------------------
//  loop
// -------------------------------------------------------------
function animate() {
  requestAnimationFrame(animate);

  let dt = clock.getDelta();
  if (dt < 0.0001) dt = 0.0001; // ほぼ0は 0.1ms とみなす
  if (dt > 0.05)   dt = 0.05;   // 50ms(=20fps) より大きいのは固定

  if (beforeDronesUpdateHook) {
    beforeDronesUpdateHook(dt);
  }

  for (let i = 0; i < drones.length; i++) {
    drones[i].update(dt, keyState);
  }
  updateShowLeds(dt);
  if (!audienceCam?.enabled && keyState["1"]) {
    orbitCam.updateFollowDistance(-dt * 1.0);
  }
  if (!audienceCam?.enabled && keyState["2"]) {
    orbitCam.updateFollowDistance(dt * 1.0);
  }

  if (orbitCam) {
    if (audienceCam?.enabled) audienceCam.update(dt);
    else orbitCam.update(dt);

    const w = container.clientWidth;
    const h = container.clientHeight;

    // ① メインビュー
    renderer.setViewport(0, 0, w, h);
    renderer.setScissorTest(false);
    renderer.render(scene, orbitCam.camera);

    // ② 小窓たち（AttachCamera 相当）
    if (runtimeOptions.enableAttachedCameras) {
      for (const d of drones) {
        d.renderAttachedCameras(renderer, scene, w, h);
      }
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
