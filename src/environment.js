// src/environment.js
import { RenderEntity } from "./render_entity.js";

/**
 * 単一 Environment を構築する
 * @param {THREE.Scene} scene
 * @param {THREE.Loader} loader GLTFLoader を想定
 * @param {Object} envCfg  config.environments[i]
 * @returns {Promise<RenderEntity>}
 */
export async function buildEnvironment(scene, loader, envCfg) {
  const ent = new RenderEntity(envCfg.name);

  const model = await new Promise((resolve, reject) => {
    loader.load(
      envCfg.model,          // ここは今まで通り path 文字列
      (gltf) => resolve(gltf.scene),
      undefined,
      reject
    );
  });

  // scale
  if (envCfg.scale) {
    model.scale.set(envCfg.scale, envCfg.scale, envCfg.scale);
  }

  ent.setAttachment(model);
  ent.setPositionRos(envCfg.pos);
  ent.setRpyRosDeg(envCfg.hpr);

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
