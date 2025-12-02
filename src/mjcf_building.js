// mjcf_building.js
import * as THREE from "three";
import { RenderEntity } from "./render_entity.js";

/**
 * Python側の BuildingData 相当のクラス
 * - size: [sx, sy, sz]  (three.js 空間でのサイズ)
 * - pos:  [x, y, z]
 * - hprDeg: [h, p, r] （degree）
 * - color: [r, g, b, a]
 */
export class BuildingData {
  constructor(name, size, pos, hprDeg, color) {
    this.name = name;
    this.size = size;
    this.pos = pos;
    this.hprDeg = hprDeg;
    this.color = color;
  }
}

// "1 2 3" → [1, 2, 3]
function parseVector(str) {
  return str
    .trim()
    .split(/\s+/)
    .map((v) => Number(v));
}

/**
 * MJCF(XML文字列)を解析し、BuildingData の配列を返す。
 * Python版 load_buildings_from_mjcf とほぼ同じロジック。
 *
 * @param {string} xmlText - MJCFファイルの中身（文字列）
 * @returns {BuildingData[]}
 */
export function loadBuildingsFromMjcfXml(xmlText) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "application/xml");

  const geoms = xmlDoc.querySelectorAll("geom");
  const buildings = [];

  geoms.forEach((geom) => {
    const name = geom.getAttribute("name");
    if (!name || !name.startsWith("geom_bldg_")) {
      return;
    }

    const sizeStr = geom.getAttribute("size");
    const posStr = geom.getAttribute("pos");
    const eulerStr = geom.getAttribute("euler");
    const rgbaStr = geom.getAttribute("rgba");

    if (!sizeStr || !posStr || !eulerStr || !rgbaStr) {
      return;
    }

    const sizeMj = parseVector(sizeStr);
    const posMj = parseVector(posStr);
    const eulerMj = parseVector(eulerStr);
    // const rgbaMj = parseVector(rgbaStr); // 使いたければこちら

    // --- サイズ変換 ---
    // Python版:
    // size_pd = (size_mj[1] * 2, size_mj[0] * 2, size_mj[2] * 2)
    const size = [
      sizeMj[1] * 2,
      sizeMj[0] * 2,
      sizeMj[2] * 2,
    ];

    // --- 位置変換 ---
    // MuJoCo: x=前, y=左, z=上
    // Panda3D: x=右, y=前, z=上
    // → three.js でも「x=右, y=前, z=上」という前提で同じ変換を適用
    // pos_pd = Vec3(pos_mj[1], -pos_mj[0], pos_mj[2])
    const pos = [posMj[1], -posMj[0], posMj[2]];

    // --- 回転変換 ---
    // hpr_pd = Vec3(euler_mj[2], euler_mj[1], euler_mj[0])
    // （MuJoCo euler は[roll, pitch, yaw] or [x,y,z]回転だが、
    //  Python版と同じ並び替えを踏襲）
    const hprDeg = [eulerMj[2], eulerMj[1], eulerMj[0]];

    // Python側は最終的に強制的に緑にしているので、それに合わせる
    const color = [0.0, 1.0, 0.0, 1.0];

    buildings.push(new BuildingData(name, size, pos, hprDeg, color));
  });

  return buildings;
}

/**
 * BuildingData の配列から RenderEntity を生成し、
 * three.js の scene に追加して返す。
 *
 * @param {THREE.Scene} scene
 * @param {BuildingData[]} buildingDataList
 * @param {object} [options]
 *   - materialFactory?: (data: BuildingData, baseColor: THREE.Color) => THREE.Material
 * @returns {RenderEntity[]}
 */
export function createBuildingEntities(scene, buildingDataList, options = {}) {
  const { materialFactory } = options;
  const entities = [];

  for (const data of buildingDataList) {
    const [sx, sy, sz] = data.size;
    const [x, y, z] = data.pos;
    const [hDeg, pDeg, rDeg] = data.hprDeg;
    const [r, g, b] = data.color;

    const geometry = new THREE.BoxGeometry(sx, sy, sz);
    const baseColor = new THREE.Color(r, g, b);

    const material =
      typeof materialFactory === "function"
        ? materialFactory(data, baseColor)
        : new THREE.MeshStandardMaterial({ color: baseColor });

    const mesh = new THREE.Mesh(geometry, material);

    const entity = new RenderEntity(data.name);
    entity.setAttachment(mesh);

    // 位置・姿勢設定
    entity.setPositionThree(x, y, z);
    const hr = THREE.MathUtils.degToRad(hDeg);
    const pr = THREE.MathUtils.degToRad(pDeg);
    const rr = THREE.MathUtils.degToRad(rDeg);
    entity.setRotationThreeEuler(hr, pr, rr, "ZXY"); // 必要に応じて回転順は調整

    // シーンに追加
    entity.attachToScene(scene);
    entities.push(entity);
  }

  return entities;
}

/**
 * 便利関数:
 *   - MJCF文字列をパースして
 *   - そのまま建物 RenderEntity を作って scene に貼る
 */
export function createBuildingEntitiesFromMjcfXml(scene, xmlText, options = {}) {
  const buildingDataList = loadBuildingsFromMjcfXml(xmlText);
  return createBuildingEntities(scene, buildingDataList, options);
}
