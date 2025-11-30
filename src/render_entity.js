// render_entity.js
import * as THREE from "three";
import { HakoniwaFrame } from "./frame.js";

export class RenderEntity {
  constructor(name = "") {
    this.object3d = new THREE.Object3D();
    this.object3d.name = name;

    // 見た目 (Mesh/Group/Light/Camera etc.) はすべて委譲でぶら下げる
    this._attached = null;

    // 任意に使えるメタ情報（用途: "rotor" とか "camera" とか）
    this.tag = null;
  }

  /**
   * Scene に追加
   */
  attachToScene(scene) {
    scene.add(this.object3d);
  }

  /**
   * Mesh / GLB の root / Light / Camera など何でもぶら下げる。
   */
  setAttachment(obj) {
    if (this._attached) {
      this.object3d.remove(this._attached);
    }
    this._attached = obj;
    if (obj) {
      this.object3d.add(obj);
    }
  }

  clearAttachment() {
    if (this._attached) {
      this.object3d.remove(this._attached);
      this._attached = null;
    }
  }

  /**
   * 子 RenderEntity を親子付け
   */
  addChild(entity) {
    this.object3d.add(entity.object3d);
  }

  /**
   * three.js ネイティブ座標での操作
   */
  setPositionThree(x, y, z) {
    this.object3d.position.set(x, y, z);
  }

  setRotationThreeEuler(rx, ry, rz) {
    this.object3d.rotation.set(rx, ry, rz);
  }

  /**
   * Hakoniwa/ROS 座標系で設定するためのヘルパー
   * config が ROS ベースの場合に使う。
   */
  setPositionRos(posArray) {
    const p = HakoniwaFrame.rosPosToThree(posArray);
    this.setPositionThree(p.x, p.y, p.z);
  }

  setRpyRosDeg(rpyArrayDeg) {
    const e = HakoniwaFrame.rosRpyDegToThreeEuler(rpyArrayDeg);
    this.setRotationThreeEuler(e.x, e.y, e.z);
  }

  /**
   * ワールド座標の取得など
   */
  getWorldPosition(target = new THREE.Vector3()) {
    return this.object3d.getWorldPosition(target);
  }

  /**
   * アニメーション用。
   * 必要になったら App 側から呼び出す。
   */
  update(dt) {
    // 派生や関数差し込みで必要なら実装
  }
}
