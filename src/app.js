// src/app.js
import * as THREE from 'three';
import { RenderEntity } from "./render_entity.js";
import { HakoniwaFrame } from "./frame.js";
import { createGltfLoader } from "./loader.js";

console.log("[Hakoniwa] app.js loaded");

const container = document.getElementById("app");

// renderer
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(container.clientWidth, container.clientHeight);
container.appendChild(renderer.domElement);

// scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020);

// camera
const camera = new THREE.PerspectiveCamera(
  60,
  container.clientWidth / container.clientHeight,
  0.1,
  1000
);
camera.position.set(0, 5, 10);
camera.lookAt(0, 0, 0);

// light
const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.5);
hemi.position.set(0, 20, 0);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(5, 10, 5);
scene.add(dir);

// loader
const loader = createGltfLoader(THREE);

// ひとまずテスト用 config を config/drone_config.json に置いておく想定
async function loadConfig() {
  const res = await fetch("./config/drone_config-1.json");
  if (!res.ok) {
    throw new Error("Failed to load config/drone_config.json");
  }
  return await res.json();
}

async function main() {
  const config = await loadConfig();

  // とりあえず environments[0] だけ出してみる
  const envCfg = (config.environments && config.environments[0]) || null;

  if (envCfg) {
    const env = new RenderEntity(envCfg.name || "env");

    loader.load(
      envCfg.model, // 例: "assets/models/shibuya.glb"
      (gltf) => {
        env.setAttachment(gltf.scene);

        if (envCfg.pos) {
          env.setPositionRos(envCfg.pos);
        }
        if (envCfg.rpy) {
          env.setRpyRosDeg(envCfg.rpy);
        }

        scene.add(env.object3d);
      },
      undefined,
      (err) => {
        console.error("Failed to load model:", err);
      }
    );
  }

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}

window.addEventListener("resize", () => {
  const w = container.clientWidth;
  const h = container.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

main().catch((e) => console.error(e));
