// src/loader.js
import { GLTFLoader } from "https://unpkg.com/three@0.169.0/examples/jsm/loaders/GLTFLoader.js";

export function createGltfLoader(THREE_NS) {
  // 将来、DRACOとかKTX2対応するときはこの辺で拡張
  const loader = new GLTFLoader();
  return loader;
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function deepMerge(base, override) {
  if (!isPlainObject(base)) return deepClone(override);
  const out = deepClone(base);
  if (!isPlainObject(override)) return out;

  for (const [key, value] of Object.entries(override)) {
    if (isPlainObject(value) && isPlainObject(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = deepClone(value);
    }
  }
  return out;
}

function isCompactSceneConfig(cfg) {
  return !!cfg && typeof cfg === "object" && !!cfg.droneTypesPath && Array.isArray(cfg.drones);
}

function resolveUrlFromBase(pathValue, baseUrl) {
  if (typeof pathValue !== "string" || pathValue.length === 0) {
    return pathValue;
  }
  return new URL(pathValue, baseUrl).toString();
}

function normalizeEnvironmentModelPaths(cfg, sceneConfigUrl) {
  if (!Array.isArray(cfg.environments)) {
    return;
  }
  for (const env of cfg.environments) {
    if (env && typeof env.model === "string") {
      env.model = resolveUrlFromBase(env.model, sceneConfigUrl);
    }
  }
}

function normalizeDroneModelPaths(droneCfg, droneTypesUrl) {
  if (!droneCfg || typeof droneCfg !== "object") {
    return;
  }
  if (droneCfg.model?.model_path) {
    droneCfg.model.model_path = resolveUrlFromBase(droneCfg.model.model_path, droneTypesUrl);
  }
  if (Array.isArray(droneCfg.rotors)) {
    for (const rotor of droneCfg.rotors) {
      if (rotor?.model?.model_path) {
        rotor.model.model_path = resolveUrlFromBase(rotor.model.model_path, droneTypesUrl);
      }
    }
  }
  if (Array.isArray(droneCfg.cameras)) {
    for (const camera of droneCfg.cameras) {
      if (camera?.model?.model_path) {
        camera.model.model_path = resolveUrlFromBase(camera.model.model_path, droneTypesUrl);
      }
    }
  }
}

async function loadDroneTypesFromPath(droneTypesPath, baseUrl) {
  const resolved = new URL(droneTypesPath, baseUrl).toString();
  const res = await fetch(resolved);
  if (!res.ok) {
    throw new Error(`Failed to load droneTypes: ${resolved}`);
  }
  return {
    droneTypes: await res.json(),
    droneTypesUrl: resolved,
  };
}

async function normalizeCompactSceneConfig(cfg, baseUrl) {
  const normalized = deepClone(cfg);
  normalizeEnvironmentModelPaths(normalized, baseUrl);
  const { droneTypes, droneTypesUrl } = await loadDroneTypesFromPath(normalized.droneTypesPath, baseUrl);

  normalized.drones = (normalized.drones || []).map((instance) => {
    const typeId = instance.type ?? instance.droneType;
    if (!typeId || !droneTypes[typeId]) {
      throw new Error(`Invalid compact scene config: unknown drone type '${typeId}'.`);
    }
    const typeDef = deepClone(droneTypes[typeId]);
    const expanded = deepMerge(typeDef, instance);
    delete expanded.type;
    delete expanded.droneType;
    expanded.resolvedType = typeId;
    normalizeDroneModelPaths(expanded, droneTypesUrl);
    return expanded;
  });

  return normalized;
}

async function normalizeSceneConfig(cfg, baseUrl) {
  if (!isCompactSceneConfig(cfg)) {
    throw new Error("Scene config must be compact format (droneTypesPath + drones).");
  }
  return await normalizeCompactSceneConfig(cfg, baseUrl);
}
// src/config_loader.js
export async function loadConfig(url = "/config/drone_config-compact-1.json") {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load config: ${url}`);
  }
  const json = await res.json();
  const normalized = await normalizeSceneConfig(json, new URL(url, window.location.href));
  console.log("[Hakoniwa] config loaded:", normalized);
  return normalized;
}
