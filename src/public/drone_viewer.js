import { main, getDrones, focusDroneById, setBeforeDronesUpdateHook, setViewerRuntimeOptions, setCameraFollowEnabled } from "../app.js";
import { Hakoniwa } from "../hakoniwa/hakoniwa-pdu.js";
import { StateSourceFactory } from "../state_source/state_source_factory.js";
import { DroneRenderManager } from "./drone_render_manager.js";

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function validateViewerConfig(config) {
  if (config.version !== "1.0") {
    throw new Error(`[DroneViewer] Unsupported viewer config version: ${config.version}`);
  }
  if (!config.three?.sceneConfigPath) {
    throw new Error("[DroneViewer] three.sceneConfigPath is required.");
  }
  if (!config.pdu?.pduDefPath) {
    throw new Error("[DroneViewer] pdu.pduDefPath is required.");
  }
  if (!config.pdu?.wsUri) {
    throw new Error("[DroneViewer] pdu.wsUri is required.");
  }
  const mode = config.stateInput?.mode;
  if (mode !== "legacy" && mode !== "fleets") {
    throw new Error(`[DroneViewer] Invalid stateInput.mode: ${mode}`);
  }
  if (mode === "legacy") {
    if (!config.stateInput?.legacy?.roleMap?.pos || !config.stateInput?.legacy?.roleMap?.motor) {
      throw new Error("[DroneViewer] stateInput.legacy.roleMap.pos/motor are required.");
    }
  }
  if (mode === "fleets") {
    if (!config.stateInput?.fleets?.roleMap?.visual_state_array) {
      throw new Error("[DroneViewer] stateInput.fleets.roleMap.visual_state_array is required.");
    }
    if (config.pdu?.wireVersion !== "v2") {
      throw new Error("[DroneViewer] fleets mode requires pdu.wireVersion=v2.");
    }
    if (config.stateInput?.fleets?.dynamicSpawn != null && typeof config.stateInput.fleets.dynamicSpawn !== "boolean") {
      throw new Error("[DroneViewer] stateInput.fleets.dynamicSpawn must be boolean.");
    }
    if (config.stateInput?.fleets?.templateDroneIndex != null) {
      const n = config.stateInput.fleets.templateDroneIndex;
      if (!Number.isInteger(n) || n < 0) {
        throw new Error("[DroneViewer] stateInput.fleets.templateDroneIndex must be an integer >= 0.");
      }
    }
    if (config.stateInput?.fleets?.maxDynamicDrones != null) {
      const n = config.stateInput.fleets.maxDynamicDrones;
      if (!Number.isInteger(n) || n <= 0) {
        throw new Error("[DroneViewer] stateInput.fleets.maxDynamicDrones must be an integer > 0.");
      }
    }
  }
  if (config.ui?.statePanelIntervalMsec != null) {
    const v = config.ui.statePanelIntervalMsec;
    if (!Number.isInteger(v) || v <= 0) {
      throw new Error("[DroneViewer] ui.statePanelIntervalMsec must be a positive integer.");
    }
  }
  if (config.ui?.enableAttachedCameras != null && typeof config.ui.enableAttachedCameras !== "boolean") {
    throw new Error("[DroneViewer] ui.enableAttachedCameras must be boolean.");
  }
  if (config.ui?.enableMainCameraMouseControl != null && typeof config.ui.enableMainCameraMouseControl !== "boolean") {
    throw new Error("[DroneViewer] ui.enableMainCameraMouseControl must be boolean.");
  }
}

export class DroneViewer {
  constructor(config = {}) {
    this.initialized = false;
    this.viewerConfig = null;
    this.stateSource = null;
    this.renderManager = null;
    this.syncHookInstalled = false;
    if (config && Object.keys(config).length > 0) {
      this.configure(config);
    }
  }

  configure(partialConfig = {}) {
    validateViewerConfig(partialConfig);
    this.viewerConfig = deepClone(partialConfig);
  }

  getViewerConfig() {
    return deepClone(this.viewerConfig);
  }

  async initialize({ droneConfigPath } = {}) {
    if (this.initialized) {
      return true;
    }
    const resolvedSceneConfigPath = droneConfigPath ?? this.viewerConfig?.three?.sceneConfigPath;
    if (!resolvedSceneConfigPath) {
      throw new Error("[DroneViewer] sceneConfigPath is required (argument or viewerConfig.three.sceneConfigPath).");
    }
    setViewerRuntimeOptions({
      enableAttachedCameras: this.viewerConfig?.ui?.enableAttachedCameras,
      enableMainCameraMouseControl: this.viewerConfig?.ui?.enableMainCameraMouseControl,
    });
    const fleetOptions = this.viewerConfig?.stateInput?.fleets ?? {};
    await main(resolvedSceneConfigPath, {
      dynamicSpawn: this.viewerConfig?.stateInput?.mode === "fleets" && !!fleetOptions.dynamicSpawn,
      templateDroneIndex: fleetOptions.templateDroneIndex ?? 0,
      maxDynamicDrones: fleetOptions.maxDynamicDrones ?? 1,
    });
    this.renderManager = new DroneRenderManager({ getDrones });
    if (!this.syncHookInstalled) {
      setBeforeDronesUpdateHook(() => {
        this.syncDroneStates().catch((e) => {
          console.error("[DroneViewer] syncDroneStates failed:", e);
        });
      });
      this.syncHookInstalled = true;
    }
    this.initialized = true;
    return true;
  }

  async connectPdu({
    pduDefPath,
    wsUri,
    wireVersion,
  } = {}) {
    const resolvedPduDefPath = pduDefPath ?? this.viewerConfig?.pdu?.pduDefPath;
    const resolvedWsUri = wsUri ?? this.viewerConfig?.pdu?.wsUri;
    const resolvedWireVersion = wireVersion ?? this.viewerConfig?.pdu?.wireVersion ?? "v2";
    const mode = this.viewerConfig?.stateInput?.mode;
    if (!resolvedPduDefPath) {
      throw new Error("[DroneViewer] pduDefPath is required (argument or viewerConfig.pdu.pduDefPath).");
    }
    if (!resolvedWsUri) {
      throw new Error("[DroneViewer] wsUri is required (argument or viewerConfig.pdu.wsUri).");
    }
    if (mode === "fleets" && resolvedWireVersion !== "v2") {
      throw new Error("[DroneViewer] fleets mode requires pdu.wireVersion=v2.");
    }
    Hakoniwa.configure({
      pdu_def_path: resolvedPduDefPath,
      ws_uri: resolvedWsUri,
      wire_version: resolvedWireVersion,
    });
    const connected = await Hakoniwa.connect();
    if (!connected) {
      return false;
    }
    this.stateSource = StateSourceFactory.create(this.viewerConfig);
    await this.stateSource.initialize({ pduDefPath: resolvedPduDefPath });
    return true;
  }

  async disconnectPdu() {
    if (this.stateSource) {
      await this.stateSource.dispose();
    }
    this.stateSource = null;
    await Hakoniwa.disconnect();
  }

  async initDronePdu() {
    const drones = getDrones();
    if (!this.stateSource) {
      throw new Error("[DroneViewer] stateSource is not initialized. Call connectPdu() first.");
    }
    for (const drone of drones) {
      await this.stateSource.bindDrone(drone.droneId);
    }
  }

  async syncDroneStates() {
    if (!this.stateSource) return;
    await this.stateSource.update();
    if (!this.renderManager) return;
    const statesByDroneId = new Map();
    for (const drone of getDrones()) {
      const state = this.stateSource.getState(drone.droneId);
      if (state) {
        statesByDroneId.set(String(drone.droneId), state);
      }
    }
    this.renderManager.applyStates(statesByDroneId);
  }

  getDrones() {
    return getDrones();
  }

  getDroneStates() {
    return getDrones()
      .filter((d) => d && d.latestPose && d.latestPose.rosPos && d.latestPose.rosRpyDeg)
      .map((d, index) => ({
        id: d.droneId ?? index,
        name: d.cfg?.name ?? String(d.droneId ?? index),
        positionRos: [...d.latestPose.rosPos],
        rpyDeg: [...d.latestPose.rosRpyDeg],
        rotorSpeedRadPerSec: d.rotorSpeed ?? 0,
      }));
  }

  focusDroneById(droneId, options = {}) {
    return focusDroneById(droneId, options);
  }

  setFollowSelectedEnabled(enabled) {
    return setCameraFollowEnabled(!!enabled);
  }
}

export function createDroneViewer(config = {}) {
  return new DroneViewer(config);
}
