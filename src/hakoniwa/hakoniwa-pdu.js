import { 
    PduManager, 
    WebSocketCommunicationService
} from '../index.js';

let CONFIG = {
  pdu_def_path: "/config/pdudef.json",
  ws_uri: "ws://127.0.0.1:8765",
  wire_version: "v1"
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
        // PDUマネージャ初期化
        const websocketCommunicationService = new WebSocketCommunicationService(CONFIG.wire_version);
        const pduManager = new PduManager({ wire_version: CONFIG.wire_version });
        await pduManager.initialize(CONFIG.pdu_def_path, websocketCommunicationService);
        console.log("[HakoniwaViewer] PduManager initialized");
        return pduManager;
    }

    async function connect() {
        if (isConnected) return true;

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
            fn(pduManager);
        } else {
            console.warn("[Hakoniwa] pduManager is not connected.");
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
