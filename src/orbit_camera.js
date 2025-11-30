// src/orbit_camera.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RenderEntity } from "./render_entity.js";

export class OrbitCamera {
  constructor(renderer, options = {}) {
    const {
      fov = 60,
      near = 0.1,
      far = 2000,
      position = [5, 5, 5],
      target = [0, 0, 0],
    } = options;

    // RenderEntity を土台として camera をぶら下げる
    this.entity = new RenderEntity("OrbitCamera");

    this.camera = new THREE.PerspectiveCamera(
      fov,
      renderer.domElement.clientWidth / renderer.domElement.clientHeight,
      near,
      far
    );

    this.camera.position.set(...position);
    this.entity.object3d.add(this.camera);

    // コントローラ作成
    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(...target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 1.0;
    this.controls.panSpeed = 0.8;

    this.controls.update();
  }

  update(dt) {
    this.controls.update();
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }
}
