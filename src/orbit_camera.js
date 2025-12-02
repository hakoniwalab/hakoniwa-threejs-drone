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

      // 追従系
      followTarget = null,         // Drone など
      initialMode = "fixed",       // "follow" | "fixed"
      followDistance = null,       // null の場合は初期距離を使う
      followLerpPos = 8.0,         // 位置の追従スピード
      followLerpTarget = 10.0,     // ターゲットの追従スピード
      followToggleKey = "c",       // モード切り替えキー
    } = options;

    this.entity = new RenderEntity("OrbitCamera");

    this.camera = new THREE.PerspectiveCamera(
      fov,
      renderer.domElement.clientWidth / renderer.domElement.clientHeight,
      near,
      far
    );
    this.camera.position.set(...position);
    this.entity.object3d.add(this.camera);

    this.controls = new OrbitControls(this.camera, renderer.domElement);
    this.controls.target.set(...target);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;
    this.controls.rotateSpeed = 0.8;
    this.controls.zoomSpeed = 1.0;
    this.controls.panSpeed = 0.8;
    this.controls.update();

    // --- 追従状態 ---
    this.mode = initialMode;        // "follow" or "fixed"
    this.followTarget = followTarget;
    this.followLerpPos = followLerpPos;
    this.followLerpTarget = followLerpTarget;
    this.followToggleKey = followToggleKey;

    // 初期距離（position と target の距離）
    const initDist = this.camera.position.distanceTo(this.controls.target);
    this.followDistance = (followDistance != null) ? followDistance : initDist;

    this._tmpTarget = new THREE.Vector3();
    this._tmpDesiredPos = new THREE.Vector3();
    this._tmpDir = new THREE.Vector3();

    // キーボード切り替え
    this._onKeyDown = (e) => {
      if (e.key === this.followToggleKey) {
        this.toggleMode();
      }
    };
    window.addEventListener("keydown", this._onKeyDown);
  }

  setFollowTarget(target) {
    this.followTarget = target;
  }

  setMode(mode) {
    if (mode !== "follow" && mode !== "fixed") return;
    this.mode = mode;
  }

  toggleMode() {
    this.mode = (this.mode === "follow") ? "fixed" : "follow";
    console.log("[OrbitCamera] mode:", this.mode);
  }
  update(dt) {
    // 追従しない場合はここまで
    if (this.mode !== "follow" || !this.followTarget) {
      this.controls.update();
      return;
    }

    // ★ OrbitControls更新「前」の距離を記録
    const distanceBefore = this.camera.position.distanceTo(this.controls.target);
    
    // マウス入力を反映
    this.controls.update();
    
    // ★ OrbitControls更新「後」の距離
    const distanceAfter = this.camera.position.distanceTo(this.controls.target);
    const zoomDelta = Math.abs(distanceAfter - distanceBefore);
    
    // ユーザーがズーム操作したときだけ followDistance を更新
    if (zoomDelta > 0.01) {
      this.followDistance = distanceAfter;
    }

    // dt → lerp 係数
    const alphaPos = 1.0 - Math.exp(-this.followLerpPos * dt);
    const alphaTarget = 1.0 - Math.exp(-this.followLerpTarget * dt);

    const currentTarget = this.controls.target;

    // 追従対象のワールド位置
    const dronePos = this.followTarget.getWorldPosition(this._tmpTarget);

    // target を dronePos ににじませる
    currentTarget.lerp(dronePos, alphaTarget);

    // 現在のカメラ → target ベクトルの「向き」だけ使う
    this._tmpDir.copy(this.camera.position).sub(currentTarget);
    if (this._tmpDir.lengthSq() < 1e-6) {
      this._tmpDir.set(0, 1, 0);
    }
    this._tmpDir.normalize().multiplyScalar(this.followDistance);

    // 「target + 指定距離のオフセット」を目標位置とする
    this._tmpDesiredPos.copy(currentTarget).add(this._tmpDir);

    // カメラ位置をゆっくり目標に寄せる
    this.camera.position.lerp(this._tmpDesiredPos, alphaPos);
  }

  updateFollowDistance(distance) {
    this.followDistance += distance;
    console.log("[OrbitCamera] followDistance:", this.followDistance);
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    window.removeEventListener("keydown", this._onKeyDown);
    this.controls.dispose();
  }
}
