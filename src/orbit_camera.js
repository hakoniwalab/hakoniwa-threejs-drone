// src/orbit_camera.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RenderEntity } from "./render_entity.js";
import { overviewFrame, updateOverviewZoom } from "./overview_camera.js";
import { FrontDirectionTracker, frontCameraFrame, updateFrontZoom } from "./front_camera.js";

const MIN_FOLLOW_DISTANCE_M = 1;
const MAX_FOLLOW_DISTANCE_M = 500;
const WHEEL_ZOOM_RATE = 0.0015;

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
      followHeading = false,       // true: 追従方向を対象の向き（yaw）に合わせて回す（後方追従）
      overviewTargets = () => [],
      overviewMinDistanceM = 15,
      overviewMarginM = 5,
      overviewToggleKey = "o",
      frontTargets = () => [],
      front = {},
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
    this._mouseControlEnabled = !!mouseEnabled;
    this.controls.update();

    // --- 追従状態 ---
    this.mode = initialMode;        // "follow" or "fixed"
    this.controls.enableZoom = initialMode === "fixed";
    this.followTarget = followTarget;
    this.followLerpPos = followLerpPos;
    this.followLerpTarget = followLerpTarget;
    this.followToggleKey = followToggleKey;
    this.followHeading = !!followHeading;
    this.overviewTargets = overviewTargets;
    this.overviewMinDistanceM = overviewMinDistanceM;
    this.overviewMarginM = overviewMarginM;
    this.overviewToggleKey = overviewToggleKey;
    this.overviewZoom = 1.0;
    this.frontTargets = frontTargets;
    this.frontOptions = {
      aheadM: front.aheadM ?? 6,
      upM: front.upM ?? 1,
      lookBackM: front.lookBackM ?? 12,
      dropM: front.dropM ?? 1.5,
    };
    this.frontZoom = 1.0;
    this.frontDirectionTracker = new FrontDirectionTracker();

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
    // With followHeading, _followDir is held in the target's yaw frame.
    this._followDirLocal = null;
    this._tmpQuat = new THREE.Quaternion();
    this._yAxis = new THREE.Vector3(0, 1, 0);
    this.controls.addEventListener("start", () => { this._userOrbiting = true; });
    this.controls.addEventListener("end", () => { this._userOrbiting = false; });
    this._onWheel = (event) => {
      if (!this._mouseControlEnabled || !["follow", "overview", "front"].includes(this.mode)) return;
      event.preventDefault();
      this.zoomByFactor(Math.exp(event.deltaY * WHEEL_ZOOM_RATE));
    };
    renderer.domElement.addEventListener("wheel", this._onWheel, { passive: false });
    this._domElement = renderer.domElement;

    // キーボード切り替え
    this._onKeyDown = (e) => {
      if (e.key === this.followToggleKey) {
        this.toggleMode();
      } else if (e.key.toLowerCase() === this.overviewToggleKey.toLowerCase()) {
        this.setMode(this.mode === "overview" ? "follow" : "overview");
      }
    };
    window.addEventListener("keydown", this._onKeyDown);
  }

  setFollowTarget(target) {
    this.followTarget = target;
  }

  setMode(mode) {
    if (!['follow', 'fixed', 'overview', 'front'].includes(mode)) return;
    if (mode === "follow" && this.mode !== "follow") this._captureFollowDir();
    if (mode === "overview" && this.mode !== "overview") {
      this._captureOverviewDir();
      // Each overview session starts with automatic framing; subsequent zoom persists.
      this.overviewZoom = 1.0;
    }
    if (mode === "front" && this.mode !== "front") this.frontZoom = 1.0;
    this.mode = mode;
    // Follow/overview distances are stateful; fixed mode uses OrbitControls' dolly.
    this.controls.enableZoom = mode === "fixed";
    window.dispatchEvent(new CustomEvent("hakoniwa-camera-mode-change", { detail: { mode } }));
  }

  toggleMode() {
    this.setMode(this.mode === "follow" ? "fixed" : "follow");
    console.log("[OrbitCamera] mode:", this.mode);
  }

  // Follow from where the camera is now (entering follow mode).
  _captureFollowDir() {
    this._tmpDir.copy(this.camera.position).sub(this.controls.target);
    if (this._tmpDir.lengthSq() > 1e-6) this._followDir.copy(this._tmpDir).normalize();
    this._followDirLocal = null;
  }

  _captureOverviewDir() {
    this._tmpDir.copy(this.camera.position).sub(this.controls.target);
    if (this._tmpDir.lengthSq() < 1e-6) this._tmpDir.set(0, 1, 1);
    this._tmpDir.normalize();
    // A level/below-ground view can hide the subjects behind the ground.
    if (this._tmpDir.y < Math.sin(THREE.MathUtils.degToRad(5))) {
      const azimuth = Math.atan2(this._tmpDir.z, this._tmpDir.x);
      const horizontal = Math.cos(THREE.MathUtils.degToRad(35));
      this._tmpDir.set(
        horizontal * Math.cos(azimuth),
        Math.sin(THREE.MathUtils.degToRad(35)),
        horizontal * Math.sin(azimuth),
      );
    }
    this._followDir.copy(this._tmpDir);
    this._followDirLocal = null;
  }

  // The follow target's yaw about the scene's up axis (Y), or null.
  _targetYaw() {
    const object = this.followTarget?.root ?? this.followTarget?.object3d ?? null;
    if (!object?.getWorldQuaternion) return null;
    object.getWorldQuaternion(this._tmpQuat);
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this._tmpQuat);
    return Math.atan2(-forward.x, -forward.z);
  }
  update(dt) {
    if (this.mode === "front") {
      this._updateFront(dt);
      return;
    }
    if (this.mode === "overview") {
      this._updateOverview(dt);
      return;
    }
    // 追従しない場合はここまで
    if (this.mode !== "follow" || !this.followTarget) {
      this.controls.update();
      return;
    }

    this.controls.update();

    // dt → lerp 係数
    const alphaPos = 1.0 - Math.exp(-this.followLerpPos * dt);
    const alphaTarget = 1.0 - Math.exp(-this.followLerpTarget * dt);

    const currentTarget = this.controls.target;

    // 追従対象のワールド位置
    const dronePos = this.followTarget.getWorldPosition(this._tmpTarget);

    // target を dronePos ににじませる
    currentTarget.lerp(dronePos, alphaTarget);

    // ユーザーが回しているときだけ、カメラ → target の向きを取り直す（それ以外は保持）
    const yaw = this.followHeading ? this._targetYaw() : null;
    if (this._userOrbiting) {
      this._tmpDir.copy(this.camera.position).sub(currentTarget);
      if (this._tmpDir.lengthSq() > 1e-6) this._followDir.copy(this._tmpDir).normalize();
      this._followDirLocal = null;
    }
    if (yaw !== null) {
      // Keep the camera where it is relative to the target's heading (behind it).
      if (!this._followDirLocal) this._followDirLocal = this._followDir.clone().applyAxisAngle(this._yAxis, -yaw);
      this._followDir.copy(this._followDirLocal).applyAxisAngle(this._yAxis, yaw);
    }
    this._tmpDir.copy(this._followDir).multiplyScalar(this.followDistance);

    if (yaw !== null) {
      // A chase camera rides with the target: no lag, so the target does not
      // move inside the view (lagging, it jumped back and forth whenever the
      // target's poses arrived unevenly).
      currentTarget.copy(dronePos);
      this.camera.position.copy(currentTarget).add(this._tmpDir);
      this.camera.lookAt(currentTarget);
      return;
    }

    // 「target + 指定距離のオフセット」を目標位置とする
    this._tmpDesiredPos.copy(currentTarget).add(this._tmpDir);

    // カメラ位置をゆっくり目標に寄せる
    this.camera.position.lerp(this._tmpDesiredPos, alphaPos);
  }

  _updateOverview(dt) {
    this.controls.update();
    const targets = this.overviewTargets?.() ?? [];
    const positions = [];
    for (const target of targets) {
      if (!target?.getWorldPosition) continue;
      const position = target.getWorldPosition(new THREE.Vector3());
      positions.push([position.x, position.y, position.z]);
    }
    const frame = overviewFrame(positions, this.camera.fov, {
      minDistanceM: this.overviewMinDistanceM,
      marginM: this.overviewMarginM,
    });
    if (!frame) return;

    const alphaPos = 1.0 - Math.exp(-this.followLerpPos * dt);
    const alphaTarget = 1.0 - Math.exp(-this.followLerpTarget * dt);
    const desiredTarget = this._tmpTarget.set(...frame.centroid);
    this.controls.target.lerp(desiredTarget, alphaTarget);

    if (this._userOrbiting) {
      this._tmpDir.copy(this.camera.position).sub(this.controls.target);
      if (this._tmpDir.lengthSq() > 1e-6) this._followDir.copy(this._tmpDir).normalize();
    }
    this._tmpDesiredPos.copy(this.controls.target).add(
      this._tmpDir.copy(this._followDir).multiplyScalar(frame.distance * this.overviewZoom),
    );
    this.camera.position.lerp(this._tmpDesiredPos, alphaPos);
  }

  _updateFront(dt) {
    const targets = this.frontTargets?.() ?? [];
    const positions = [];
    const headings = [];
    for (const target of targets) {
      if (!target?.getWorldPosition) continue;
      const position = target.getWorldPosition(new THREE.Vector3());
      positions.push([position.x, position.y, position.z]);
      const object = target.root?.object3d ?? target.root ?? target.object3d;
      if (object?.getWorldQuaternion) {
        object.getWorldQuaternion(this._tmpQuat);
        const heading = new THREE.Vector3(0, 0, -1).applyQuaternion(this._tmpQuat);
        headings.push([heading.x, heading.y, heading.z]);
      }
    }
    if (!positions.length) return;
    this.camera.getWorldDirection(this._tmpDir);
    const direction = this.frontDirectionTracker.update(
      positions, dt, headings, [this._tmpDir.x, this._tmpDir.y, this._tmpDir.z],
    );
    const frame = frontCameraFrame(positions, direction, {
      ...this.frontOptions,
      zoom: this.frontZoom,
    });
    const alphaPos = 1 - Math.exp(-this.followLerpPos * dt);
    const alphaTarget = 1 - Math.exp(-this.followLerpTarget * dt);
    this._tmpDesiredPos.set(...frame.position);
    this._tmpTarget.set(...frame.target);
    this.camera.position.lerp(this._tmpDesiredPos, alphaPos);
    this.controls.target.lerp(this._tmpTarget, alphaTarget);
    this.camera.lookAt(this.controls.target);
  }

  zoomByFactor(multiplier) {
    if (!Number.isFinite(multiplier) || multiplier <= 0) return false;
    if (this.mode === "follow") {
      this.followDistance = THREE.MathUtils.clamp(
        this.followDistance * multiplier,
        MIN_FOLLOW_DISTANCE_M,
        MAX_FOLLOW_DISTANCE_M,
      );
      return true;
    }
    if (this.mode === "overview") {
      this.overviewZoom = updateOverviewZoom(this.overviewZoom, multiplier);
      return true;
    }
    if (this.mode === "front") {
      this.frontZoom = updateFrontZoom(this.frontZoom, multiplier);
      return true;
    }
    return false;
  }

  updateFollowDistance(distance) {
    if (!Number.isFinite(distance)) return;
    this.followDistance = THREE.MathUtils.clamp(
      this.followDistance + distance,
      MIN_FOLLOW_DISTANCE_M,
      MAX_FOLLOW_DISTANCE_M,
    );
  }

  resize(width, height) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    window.removeEventListener("keydown", this._onKeyDown);
    this._domElement.removeEventListener("wheel", this._onWheel);
    this.controls.dispose();
  }

  setMouseControlEnabled(enabled) {
    this._mouseControlEnabled = !!enabled;
    this.controls.enabled = this._mouseControlEnabled;
  }
}
