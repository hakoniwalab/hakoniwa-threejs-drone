// render_entity.js
import * as THREE from "three";
import { HakoniwaFrame } from "./frame.js";

export class RenderEntity {
  constructor(name = "") {
    this.object3d = new THREE.Object3D();
    this.object3d.name = name;

    // 見た目 (Mesh/Group/Light/Camera etc.) はすべて委譲でぶら下げる
    this._attached = null;

    this.model = null;

    // 任意に使えるメタ情報（用途: "rotor" とか "camera" とか）
    this.tag = null;
    // ROS 座標系での絶対位置・姿勢を保持
    this.rosPos = [0, 0, 0];
    this.rosRpyDeg = [0, 0, 0];  // [roll, pitch, yaw]    
  }
  _applyRosPose() {
    HakoniwaFrame.applyRosPoseToObject3D(
      this.object3d,
      this.rosPos,
      this.rosRpyDeg
    );
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
  setModel(model) {
    this.model = model;
    this.addChild(model);
  }

  /**
   * three.js ネイティブ座標での操作
   */
  setPositionThree(x, y, z) {
  }

setRotationThreeEuler(rx, ry, rz, order = 'XYZ') {
  this.object3d.rotation.order = order;
  this.object3d.rotation.set(rx, ry, rz);
}

  /**
   * Hakoniwa/ROS 座標系で設定するためのヘルパー
   * config が ROS ベースの場合に使う。
   */
  setPositionRos(posArray) {
    this.rosPos = [...posArray];
    this._applyRosPose();
  }

  setRpyRosDeg(rpyArrayDeg) {
    this.rosRpyDeg = [...rpyArrayDeg];
    this._applyRosPose();
  }

  /**
   * ワールド座標の取得など
   */
  getWorldPosition(target = new THREE.Vector3()) {
    return this.object3d.getWorldPosition(target);
  }


  // ★ 増分（ROS 絶対座標系）で移動
  translateRos(dPos) {
    this.rosPos = this.rosPos.map((v, i) => v + dPos[i]);
    this._applyRosPose();
  }

  // ★ 増分（ROS RPY[deg]）で回転
  rotateRosDeg(dRpy) {
    this.rosRpyDeg = this.rosRpyDeg.map((v, i) => v + dRpy[i]);
    this._applyRosPose();
  }

  // ★ “モデルに依存した局所回転” 用（ローター回転など）
  rotateLocalEuler(dEuler) {
    this.object3d.rotation.x += dEuler[0];
    this.object3d.rotation.y += dEuler[1];
    this.object3d.rotation.z += dEuler[2];
  }

  /**
   * アニメーション用。
   * 必要になったら App 側から呼び出す。
   */
  update(dt) {
    // 派生や関数差し込みで必要なら実装
  }
}
