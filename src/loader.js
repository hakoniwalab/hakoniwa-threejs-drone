// src/loader.js
import { GLTFLoader } from "https://unpkg.com/three@0.169.0/examples/jsm/loaders/GLTFLoader.js";

export function createGltfLoader(THREE_NS) {
  // 将来、DRACOとかKTX2対応するときはこの辺で拡張
  const loader = new GLTFLoader();
  return loader;
}
// src/config_loader.js
export async function loadConfig(url = "./config/drone_config-1.json") {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load config: ${url}`);
  }
  const json = await res.json();
  console.log("[Hakoniwa] config loaded:", json);
  return json;
}
