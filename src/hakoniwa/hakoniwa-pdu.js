import { 
    PduManager, 
    WebSocketCommunicationService
} from '../index.js';

let CONFIG = {
  pdu_def_path: null,
  ws_uri: null,
  wire_version: null
};

export const Hakoniwa = (() => {
    let pduManager = null;
    let isConnected = false;

    // 外から設定を上書きするための関数
    function configure(partialConfig) {
        CONFIG = {
        ...CONFIG,
        ...partialConfig,
        };
        console.log("[Hakoniwa] CONFIG updated:", CONFIG);
    }

    // PDUマネージャ初期化関数
    async function initializePduManager() {
        if (!CONFIG.pdu_def_path) {
            throw new Error("[Hakoniwa] CONFIG.pdu_def_path is not set.");
        }
        // PDUマネージャ初期化
        const websocketCommunicationService = new WebSocketCommunicationService(CONFIG.wire_version);
        const pduManager = new PduManager({ wire_version: CONFIG.wire_version });
        await pduManager.initialize(CONFIG.pdu_def_path, websocketCommunicationService);
        console.log("[HakoniwaViewer] PduManager initialized");
        return pduManager;
    }

    async function connect() {
        if (isConnected) return true;
        if (!CONFIG.ws_uri) {
            console.error("[Hakoniwa] CONFIG.ws_uri is not set.");
            return false;
        }
        if (!CONFIG.wire_version) {
            console.error("[Hakoniwa] CONFIG.wire_version is not set.");
            return false;
        }

        pduManager = await initializePduManager();
        if (!pduManager) return false;

        const ret = await pduManager.start_service(CONFIG.ws_uri);
        if (!ret) {
        pduManager = null;
        return false;
        }
        isConnected = true;
        console.log("[Hakoniwa] Connected.");
        return true;
    }

    async function disconnect() {
        if (!isConnected || !pduManager) return;
        await pduManager.stop_service();
        pduManager = null;
        isConnected = false;
        console.log("[Hakoniwa] Disconnected.");
    }

    function withPdu(fn) {
        if (pduManager) {
            return fn(pduManager);
        } else {
            console.warn("[Hakoniwa] pduManager is not connected.");
            return null;
        }
    }

    function getConnectionState() {
        return { isConnected, hasManager: !!pduManager };
    }

    return {
        configure,
        connect,
        disconnect,
        withPdu,
        getConnectionState,
    };
})();
