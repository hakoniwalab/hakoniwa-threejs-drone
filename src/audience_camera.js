import * as THREE from "three";

const DEG2RAD = Math.PI / 180;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  return target.matches("input, textarea, select, button, a, [contenteditable='true']");
}

function enuToThree([east, north, up]) {
  return new THREE.Vector3(east, up, -north);
}

export class AudienceCamera {
  constructor(camera, domElement, options = {}) {
    this.camera = camera;
    this.domElement = domElement;
    this.enabled = false;
    this.positionM = [...(options.positionM ?? [0, 0, 2])];
    this.yawDeg = Number(options.yawDeg ?? 0);
    this.pitchDeg = Number(options.pitchDeg ?? 0);
    this.fovDeg = Number(options.fovDeg ?? 55);
    this.moveSpeedMps = Number(options.moveSpeedMps ?? 5);
    this.fastMultiplier = Number(options.fastMultiplier ?? 4);
    this.lookSensitivityDegPerPixel = Number(options.lookSensitivityDegPerPixel ?? 0.15);
    this.fovSensitivityDegPerPixel = Number(options.fovSensitivityDegPerPixel ?? 0.02);
    this.keys = new Set();
    this.dragButton = null;
    this.lastPointer = null;

    this._onKeyDown = (event) => {
      if (!this.enabled || isEditableTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (!["arrowup", "arrowdown", "arrowleft", "arrowright", "u", "d", "shift"].includes(key)) return;
      event.preventDefault();
      this.keys.add(key);
    };
    this._onKeyUp = (event) => this.keys.delete(event.key.toLowerCase());
    this._onPointerDown = (event) => {
      if (!this.enabled || (event.button !== 0 && event.button !== 2)) return;
      event.preventDefault();
      this.dragButton = event.button;
      this.lastPointer = [event.clientX, event.clientY];
      this.domElement.setPointerCapture?.(event.pointerId);
    };
    this._onPointerMove = (event) => {
      if (!this.enabled || this.dragButton == null || !this.lastPointer) return;
      const dx = event.clientX - this.lastPointer[0];
      const dy = event.clientY - this.lastPointer[1];
      this.lastPointer = [event.clientX, event.clientY];
      if (this.dragButton === 0) this.yawDeg -= dx * this.lookSensitivityDegPerPixel;
      else this.pitchDeg = clamp(this.pitchDeg - dy * this.lookSensitivityDegPerPixel, -85, 85);
      this.applyPose();
    };
    this._onPointerUp = (event) => {
      if (event.button !== this.dragButton) return;
      this.dragButton = null;
      this.lastPointer = null;
      this.domElement.releasePointerCapture?.(event.pointerId);
    };
    this._onWheel = (event) => {
      if (!this.enabled) return;
      event.preventDefault();
      this.fovDeg = clamp(this.fovDeg + event.deltaY * this.fovSensitivityDegPerPixel, 25, 90);
      this.applyPose();
    };
    this._onContextMenu = (event) => {
      if (this.enabled) event.preventDefault();
    };

    window.addEventListener("keydown", this._onKeyDown, { passive: false });
    window.addEventListener("keyup", this._onKeyUp);
    window.addEventListener("blur", () => this.keys.clear());
    domElement.addEventListener("pointerdown", this._onPointerDown);
    domElement.addEventListener("pointermove", this._onPointerMove);
    domElement.addEventListener("pointerup", this._onPointerUp);
    domElement.addEventListener("pointercancel", this._onPointerUp);
    domElement.addEventListener("wheel", this._onWheel, { passive: false });
    domElement.addEventListener("contextmenu", this._onContextMenu);
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
    this.keys.clear();
    this.dragButton = null;
    this.lastPointer = null;
    if (this.enabled) this.applyPose();
  }

  update(dt) {
    if (!this.enabled) return;
    const yawRad = this.yawDeg * DEG2RAD;
    const forward = [Math.cos(yawRad), Math.sin(yawRad)];
    const right = [Math.sin(yawRad), -Math.cos(yawRad)];
    let forwardInput = 0;
    let rightInput = 0;
    if (this.keys.has("arrowup")) forwardInput += 1;
    if (this.keys.has("arrowdown")) forwardInput -= 1;
    if (this.keys.has("arrowright")) rightInput += 1;
    if (this.keys.has("arrowleft")) rightInput -= 1;
    const verticalInput = Number(this.keys.has("u")) - Number(this.keys.has("d"));
    if (forwardInput === 0 && rightInput === 0 && verticalInput === 0) return;
    const length = Math.hypot(forwardInput, rightInput, verticalInput) || 1;
    const speed = this.moveSpeedMps * (this.keys.has("shift") ? this.fastMultiplier : 1);
    const distance = speed * dt / length;
    this.positionM[0] += (forward[0] * forwardInput + right[0] * rightInput) * distance;
    this.positionM[1] += (forward[1] * forwardInput + right[1] * rightInput) * distance;
    this.positionM[2] += verticalInput * distance;
    this.applyPose();
  }

  applyPose() {
    const yawRad = this.yawDeg * DEG2RAD;
    const pitchRad = this.pitchDeg * DEG2RAD;
    const directionEnu = [
      Math.cos(pitchRad) * Math.cos(yawRad),
      Math.cos(pitchRad) * Math.sin(yawRad),
      Math.sin(pitchRad),
    ];
    const position = enuToThree(this.positionM);
    const target = position.clone().add(enuToThree(directionEnu));
    this.camera.position.copy(position);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(target);
    this.camera.fov = this.fovDeg;
    this.camera.updateProjectionMatrix();
  }

  getState() {
    return {
      enabled: this.enabled,
      positionM: [...this.positionM],
      yawDeg: this.yawDeg,
      pitchDeg: this.pitchDeg,
      fovDeg: this.fovDeg,
    };
  }
}
