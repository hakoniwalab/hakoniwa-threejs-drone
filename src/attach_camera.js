// src/attach_camera.js
import * as THREE from "three";
import { RenderEntity } from "./render_entity.js";

/**
 * Drone のカメラマウントなどに追従する「小窓カメラ」。
 * - parentEntity: RenderEntity（drone.cameras[0] とか）
 * - viewport: { x, y, width, height } は 0〜1 の正規化座標（左下原点）
 */
export class AttachCamera {
  constructor(scene, {
    parentEntity,
    name = "AttachCamera",
    fov = 70,
    near = 0.1,
    far = 1000,
    offsetRos = [0, 0, 0],
    hprRos = [0, 0, 0],
    viewport = { x: 0.7, y: 0.7, width: 0.28, height: 0.28 },
    backgroundColor = 0x000000,
  } = {}) {
    this.scene = scene;
    this.parentEntity = parentEntity;
    this.viewport = viewport;
    this.backgroundColor = new THREE.Color(backgroundColor);

    // 親の下に、さらに RenderEntity を一段かませてオフセット指定
    this.entity = new RenderEntity(name);
    this.entity.setPositionRos(offsetRos);
    this.entity.setRpyRosDeg(hprRos);

    if (this.parentEntity && this.parentEntity.addChild) {
      this.parentEntity.addChild(this.entity);
    } else {
      console.warn("[AttachCamera] parentEntity が RenderEntity じゃないかも？");
      this.scene.add(this.entity.object3d);
    }

    // この entity のローカルに Three カメラをぶら下げる
    this.camera = new THREE.PerspectiveCamera(fov, 1.0, near, far);
    this.entity.object3d.add(this.camera);
  }

  /**
   * 小窓レンダリング
   * @param {THREE.WebGLRenderer} renderer
   * @param {THREE.Scene} scene
   * @param {number} fullWidth   メインキャンバスの幅
   * @param {number} fullHeight  メインキャンバスの高さ
   */
  renderInset(renderer, scene, fullWidth, fullHeight) {
    const { x, y, width, height } = this.viewport;

    // 正規化座標(0〜1) → ピクセルへ
    const vpW = Math.floor(fullWidth  * width);
    const vpH = Math.floor(fullHeight * height);
    const vpX = Math.floor(fullWidth  * x);
    const vpY = Math.floor(fullHeight * y);  // 左下原点

    // アスペクトを小窓サイズに合わせる
    this.camera.aspect = vpW / vpH;
    this.camera.updateProjectionMatrix();

    // この領域だけ描画
    renderer.setScissorTest(true);
    renderer.setViewport(vpX, vpY, vpW, vpH);
    renderer.setScissor(vpX, vpY, vpW, vpH);

    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();

    renderer.setClearColor(this.backgroundColor, 1.0);
    renderer.clearDepth();  // メインの深度とは別にしたいので毎回クリア
    renderer.render(scene, this.camera);

    // 元に戻す
    renderer.setClearColor(prevClear, prevAlpha);
    renderer.setScissorTest(false);
  }
}
