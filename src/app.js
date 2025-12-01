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
    orbitCam = new OrbitCamera(renderer, {
      fov: mc.fov ?? 60,
      near: mc.near ?? 0.1,
      far: mc.far ?? 1000,
      position: mc.position ?? [5, 5, 5],
      target: mc.target ?? [0, 0, 0]
    });
  } else {
    orbitCam = new OrbitCamera(renderer);
  }

  scene.add(orbitCam.entity.object3d);

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  const dt = clock.getDelta();

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


main().catch((e) => console.error(e));
