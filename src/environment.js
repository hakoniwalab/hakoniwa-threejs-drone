// src/environment.js
import * as THREE from "three";
import { RenderEntity } from "./render_entity.js";
import { createBuildingEntitiesFromMjcfXml } from "./mjcf_building.js"; // ← MJCF版ビル群生成

/**
 * 単一 Environment を構築する
 * - Python の EnvironmentEntity 相当
 * @param {THREE.Scene} scene
 * @param {THREE.Loader} loader GLTFLoader を想定（非 XML のときに使用）
 * @param {Object} envCfg  config.environments[i]
 *   - name: string
 *   - model: string (GLB/GLTF/MJCF の URL)
 *   - pos: [x, y, z] （ROS 座標系）
 *   - hpr: [r, p, y] （deg, ROS）
 *   - scale: number
 * @returns {Promise<RenderEntity>}
 */
export async function buildEnvironment(scene, loader, envCfg) {
  const ent = new RenderEntity(envCfg.name);
  const modelPath = envCfg.model;
  const lower = modelPath.toLowerCase();

  let isXml = lower.endsWith(".xml");

  // ---------- モデルロード部分 ----------
  if (isXml) {
    console.log(`Loading MJCF environment model: ${modelPath}`);
    // MJCF から建物群をロード
    const res = await fetch(modelPath);
    if (!res.ok) {
      throw new Error(`Failed to load MJCF xml: ${modelPath}`);
    }
    const xmlText = await res.text();

    // 親 = ent.object3d としてビル群をぶら下げる
    const buildingEntities = createBuildingEntitiesFromMjcfXml(
      ent.object3d,
      xmlText
    );
    // Python の self.building_renders 相当を一応残しておく
    ent.buildingEntities = buildingEntities;
  } else {
    // 通常の 3D モデル（GLB/GLTF 等）
    const gltfRoot = await new Promise((resolve, reject) => {
      loader.load(
        modelPath,
        (gltf) => resolve(gltf.scene),
        undefined,
        reject
      );
    });

    // 表裏両面（屋内モデル対策）
    gltfRoot.traverse((obj) => {
      if (obj.isMesh && obj.material) {
        // 複数マテリアル対応
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => {
            if (m && "side" in m) m.side = THREE.DoubleSide;
          });
        } else {
          obj.material.side = THREE.DoubleSide;
        }
      }
    });

    // RenderEntity にぶら下げる
    ent.setAttachment(gltfRoot);
  }

  // ---------- 姿勢・スケール ----------
  // Python: if scale is not None: self.np.setScale(scale)
  if (envCfg.scale != null) {
    ent.object3d.scale.set(envCfg.scale, envCfg.scale, envCfg.scale);
  }

  // Python: if pos is not None: self.set_pos(*pos)
  if (envCfg.pos) {
    ent.setPositionRos(envCfg.pos);
  }

  // Python: if hpr is not None:
  //   target_np = self.np if xml else self._geom_np
  // three.js 版では簡略化して「環境の root(ent.object3d)」に適用している。
  if (envCfg.hpr) {
    ent.setRpyRosDeg(envCfg.hpr);
  }

  // ---------- 大きすぎ / 小さすぎ補正 ----------
  // Python:
  // mn, mx = self.np.getTightBounds()
  // diag = (mx - mn).length()
  // if diag > 1e4: self.np.setScale(100.0 / diag)
  // elif diag < 1e-2: self.np.setScale(100.0 / max(diag, 1e-6))
  const bbox = new THREE.Box3().setFromObject(ent.object3d);
  if (!bbox.isEmpty()) {
    const size = new THREE.Vector3();
    bbox.getSize(size);
    const diag = size.length();
    if (diag > 1e4) {
      const s = 100.0 / diag;
      ent.object3d.scale.multiplyScalar(s);
    } else if (diag < 1e-2) {
      const s = 100.0 / Math.max(diag, 1e-6);
      ent.object3d.scale.multiplyScalar(s);
    }
  }

  // シーンに追加
  scene.add(ent.object3d);
  return ent;
}

/**
 * 複数 Environment をまとめて構築するユーティリティ
 * @param {THREE.Scene} scene
 * @param {THREE.Loader} loader
 * @param {Array<Object>} envCfgs
 * @returns {Promise<RenderEntity[]>}
 */
export async function buildEnvironments(scene, loader, envCfgs = []) {
  const results = [];
  for (const cfg of envCfgs) {
    const ent = await buildEnvironment(scene, loader, cfg);
    results.push(ent);
  }
  return results;
}
