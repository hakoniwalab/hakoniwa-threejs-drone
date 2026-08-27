export const DEFAULT_VIEWER_CONFIG_PATH = "/config/viewer-config-legacy.json";

function resolvePathFromConfig(pathValue, configUrl) {
  return new URL(pathValue, configUrl).toString();
}

function getViewerConfigPathFromSearch(search, defaultPath = DEFAULT_VIEWER_CONFIG_PATH) {
  const params = new URLSearchParams(search ?? "");
  return params.get("viewerConfigPath") || defaultPath;
}

function applyQueryOverrides(cfg, search, pageUrl) {
  const params = new URLSearchParams(search ?? "");
  const overridden = JSON.parse(JSON.stringify(cfg));

  const wsUri = params.get("wsUri");
  if (wsUri) {
    overridden.pdu = overridden.pdu ?? {};
    overridden.pdu.wsUri = wsUri;
  }

  const wireVersion = params.get("wireVersion");
  if (wireVersion) {
    overridden.pdu = overridden.pdu ?? {};
    overridden.pdu.wireVersion = wireVersion;
  }

  const pduDefPath = params.get("pduDefPath");
  if (pduDefPath) {
    overridden.pdu = overridden.pdu ?? {};
    overridden.pdu.pduDefPath = new URL(pduDefPath, pageUrl).toString();
  }

  const dynamicSpawn = params.get("dynamicSpawn");
  if (dynamicSpawn != null) {
    const v = dynamicSpawn.toLowerCase();
    if (v === "true" || v === "1") {
      overridden.stateInput = overridden.stateInput ?? {};
      overridden.stateInput.fleets = overridden.stateInput.fleets ?? {};
      overridden.stateInput.fleets.dynamicSpawn = true;
    } else if (v === "false" || v === "0") {
      overridden.stateInput = overridden.stateInput ?? {};
      overridden.stateInput.fleets = overridden.stateInput.fleets ?? {};
      overridden.stateInput.fleets.dynamicSpawn = false;
    } else {
      throw new Error(`[ViewerConfigLoader] invalid dynamicSpawn query value: ${dynamicSpawn}`);
    }
  }

  const templateDroneIndex = params.get("templateDroneIndex");
  if (templateDroneIndex != null) {
    const n = Number(templateDroneIndex);
    if (!Number.isInteger(n) || n < 0) {
      throw new Error(`[ViewerConfigLoader] invalid templateDroneIndex query value: ${templateDroneIndex}`);
    }
    overridden.stateInput = overridden.stateInput ?? {};
    overridden.stateInput.fleets = overridden.stateInput.fleets ?? {};
    overridden.stateInput.fleets.templateDroneIndex = n;
  }

  const maxDynamicDrones = params.get("maxDynamicDrones");
  if (maxDynamicDrones != null) {
    const n = Number(maxDynamicDrones);
    if (!Number.isInteger(n) || n <= 0) {
      throw new Error(`[ViewerConfigLoader] invalid maxDynamicDrones query value: ${maxDynamicDrones}`);
    }
    overridden.stateInput = overridden.stateInput ?? {};
    overridden.stateInput.fleets = overridden.stateInput.fleets ?? {};
    overridden.stateInput.fleets.maxDynamicDrones = n;
  }

  return overridden;
}

function validateViewerConfigShape(cfg, configUrl) {
  if (!cfg || typeof cfg !== "object") {
    throw new Error(`[ViewerConfigLoader] invalid JSON object: ${configUrl}`);
  }
  if (!cfg.version) {
    throw new Error(`[ViewerConfigLoader] version is required: ${configUrl}`);
  }
  if (!cfg.three?.sceneConfigPath) {
    throw new Error(`[ViewerConfigLoader] three.sceneConfigPath is required: ${configUrl}`);
  }
  const bodyColor = cfg.three?.droneAppearance?.bodyColor;
  if (
    bodyColor != null
    && (typeof bodyColor !== "string" || !/^#[0-9a-fA-F]{6}$/.test(bodyColor))
  ) {
    throw new Error(`[ViewerConfigLoader] three.droneAppearance.bodyColor must be a #RRGGBB color: ${configUrl}`);
  }
  const cameraMode = cfg.three?.initialCameraMode ?? "free";
  if (cameraMode !== "free" && cameraMode !== "audience") {
    throw new Error(`[ViewerConfigLoader] three.initialCameraMode must be free or audience: ${configUrl}`);
  }
  const audience = cfg.three?.audienceCamera;
  if (cameraMode === "audience" && !audience) {
    throw new Error(`[ViewerConfigLoader] three.audienceCamera is required for audience initialCameraMode: ${configUrl}`);
  }
  if (audience != null) {
    if (!Array.isArray(audience.positionM) || audience.positionM.length !== 3 || audience.positionM.some((value) => !Number.isFinite(value))) {
      throw new Error(`[ViewerConfigLoader] three.audienceCamera.positionM must contain three finite numbers: ${configUrl}`);
    }
    for (const key of ["yawDeg", "pitchDeg", "fovDeg"]) {
      if (!Number.isFinite(audience[key])) {
        throw new Error(`[ViewerConfigLoader] three.audienceCamera.${key} must be a finite number: ${configUrl}`);
      }
    }
    if (audience.pitchDeg < -85 || audience.pitchDeg > 85 || audience.fovDeg < 25 || audience.fovDeg > 90) {
      throw new Error(`[ViewerConfigLoader] three.audienceCamera pitch/FOV is outside the supported range: ${configUrl}`);
    }
    if (audience.moveSpeedMps != null
      && (!Number.isFinite(audience.moveSpeedMps)
        || audience.moveSpeedMps <= 0 || audience.moveSpeedMps > 100)) {
      throw new Error(`[ViewerConfigLoader] three.audienceCamera.moveSpeedMps must be within (0, 100]: ${configUrl}`);
    }
  }
  if (!cfg.pdu?.pduDefPath) {
    throw new Error(`[ViewerConfigLoader] pdu.pduDefPath is required: ${configUrl}`);
  }
}

function normalizeViewerConfigPaths(cfg, configUrl) {
  const normalized = JSON.parse(JSON.stringify(cfg));
  normalized.three.sceneConfigPath = resolvePathFromConfig(normalized.three.sceneConfigPath, configUrl);
  normalized.pdu.pduDefPath = resolvePathFromConfig(normalized.pdu.pduDefPath, configUrl);
  return normalized;
}

export async function loadViewerConfig({
  search = window.location.search,
  pageUrl = window.location.href,
  defaultPath = DEFAULT_VIEWER_CONFIG_PATH,
} = {}) {
  const rawPath = getViewerConfigPathFromSearch(search, defaultPath);
  const configUrl = new URL(rawPath, pageUrl).toString();
  const res = await fetch(configUrl);
  if (!res.ok) {
    throw new Error(`[ViewerConfigLoader] failed to load: ${configUrl}`);
  }
  const cfg = await res.json();
  validateViewerConfigShape(cfg, configUrl);
  const normalized = normalizeViewerConfigPaths(cfg, configUrl);
  const overridden = applyQueryOverrides(normalized, search, pageUrl);
  return {
    configUrl,
    config: overridden,
  };
}
