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
      mouseEnabled = true,
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
    this.controls.enabled = !!mouseEnabled;
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

    // The direction from the target to the camera while following. It is
    // held: only the user's own orbiting changes it. Re-reading it from the
    // lagging camera every frame turned the camera towards the vertical when
    // the target climbed or dropped fast, and near the pole the view spun.
    this._followDir = new THREE.Vector3().copy(this.camera.position).sub(this.controls.target);
    if (this._followDir.lengthSq() < 1e-6) this._followDir.set(0, 1, 0);
    this._followDir.normalize();
    this._userOrbiting = false;
    this.controls.addEventListener("start", () => { this._userOrbiting = true; });
    this.controls.addEventListener("end", () => { this._userOrbiting = false; });

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
    if (mode === "follow" && this.mode !== "follow") this._captureFollowDir();
    this.mode = mode;
  }

  toggleMode() {
    this.setMode(this.mode === "follow" ? "fixed" : "follow");
    console.log("[OrbitCamera] mode:", this.mode);
  }

  // Follow from where the camera is now (entering follow mode).
  _captureFollowDir() {
    this._tmpDir.copy(this.camera.position).sub(this.controls.target);
    if (this._tmpDir.lengthSq() > 1e-6) this._followDir.copy(this._tmpDir).normalize();
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

    // ユーザーが回しているときだけ、カメラ → target の向きを取り直す（それ以外は保持）
    if (this._userOrbiting) {
      this._tmpDir.copy(this.camera.position).sub(currentTarget);
      if (this._tmpDir.lengthSq() > 1e-6) this._followDir.copy(this._tmpDir).normalize();
    }
    this._tmpDir.copy(this._followDir).multiplyScalar(this.followDistance);

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

  setMouseControlEnabled(enabled) {
    this.controls.enabled = !!enabled;
  }
}
