// src/loader.js
import { GLTFLoader } from "https://unpkg.com/three@0.169.0/examples/jsm/loaders/GLTFLoader.js";

export function createGltfLoader(THREE_NS) {
  // 将来、DRACOとかKTX2対応するときはこの辺で拡張
  const loader = new GLTFLoader();
  return loader;
}
