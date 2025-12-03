// src/drone.js
import * as THREE from "three"; 
import { RenderEntity } from "./render_entity.js";
import { Hakoniwa } from "./hakoniwa/hakoniwa-pdu.js";
import { pduToJs_Twist } from "../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/geometry_msgs/pdu_conv_Twist.js";
import { pduToJs_HakoHilActuatorControls } from "../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/hako_mavlink_msgs/pdu_conv_HakoHilActuatorControls.js";
import { pduToJs_GameControllerOperation } from "../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/hako_msgs/pdu_conv_GameControllerOperation.js";

const rad2deg = (r) => r * 180.0 / Math.PI;

export class Drone {
    constructor(scene, loader, cfg, {
        motorChannels = [0, 1, 2, 3],
        rotorScale = 200.0,
        pduPollIntervalMs = 100,
    } = {}) {
        this.scene = scene;
        this.loader = loader;
        this.cfg = cfg;

        // PDU 関連
        this.droneId = cfg.name;;
        this.motorChannels = motorChannels;
        this.rotorScale = rotorScale;
        this.pduPollIntervalMs = pduPollIntervalMs;

        this.pduConnected = false;
        this._pduTimerId = null;

        // 描画用
        this.root = null;
        this.rotors = [];
        this.cameras = [];

        // 状態
        this.latestPose = null;      // { rosPos, rosRpyDeg }
        this.rotorSpeed = 0;         // [rad/s]
        this._rotorHist = [];        // { t, speed }[]
        this._rotorWindowSec = 1.0;  // [sec]

        // ★ 小窓用カメラ群（Drone に紐づく）
        // [{ entity: RenderEntity, camera: THREE.PerspectiveCamera,
        //    viewport: {x,y,width,height}, backgroundColor: THREE.Color }]
        this.viewCameras = [];

        this._camPitchInput = 0;
    }

    // ---------- factory ----------

    static async create(scene, loader, cfg, options) {
        const d = new Drone(scene, loader, cfg, options);
        await d._initGraphics();
        await d._initPdu();          // ここで PDU 接続＋ポーリング開始
        return d;
    }

    // ---------- init graphics ----------

    async _initGraphics() {
        const cfg = this.cfg;
        const root = new RenderEntity(cfg.name);

        // 本体モデル
        const modelObj = await new Promise((resolve, reject) => {
            this.loader.load(
            cfg.model.model_path,
            (gltf) => resolve(gltf.scene),
            undefined,
            reject
            );
        });

        const modelEnt = new RenderEntity(cfg.name + "_model");
        modelEnt.setAttachment(modelObj);
        modelEnt.setPositionRos(cfg.model.pos);
        modelEnt.setRpyRosDeg(cfg.model.hpr);
        root.setModel(modelEnt);

        if (cfg.pos) root.setPositionRos(cfg.pos);
        if (cfg.hpr) root.setRpyRosDeg(cfg.hpr);

        // rotors
        if (cfg.rotors) {
            for (const r of cfg.rotors) {
            const rotorEnt = new RenderEntity(r.name);
            const rotorModelEnt = new RenderEntity(r.name + "_model");

            this.loader.load(r.model.model_path, (gltf) => {
                rotorModelEnt.setAttachment(gltf.scene);
            });

            rotorModelEnt.setRpyRosDeg(r.model.hpr);
            rotorModelEnt.setPositionRos(r.model.pos);
            rotorEnt.setModel(rotorModelEnt);

            rotorEnt.setPositionRos(r.pos);
            rotorEnt.setRpyRosDeg(r.hpr);
            root.addChild(rotorEnt);

            this.rotors.push(rotorEnt);
            }
        }

        // cameras
        if (cfg.cameras) {
            for (const c of cfg.cameras) {
                const camEnt = new RenderEntity(c.name);
                const camModelEnt = new RenderEntity(c.name + "_model");

                // 見た目のカメラモデル
                camModelEnt.setPositionRos(c.model.pos);
                camModelEnt.setRpyRosDeg(c.model.hpr);

                this.loader.load(c.model.model_path, (gltf) => {
                    camModelEnt.setAttachment(gltf.scene);
                });

                camEnt.addChild(camModelEnt);
                camEnt.setPositionRos(c.pos);
                camEnt.setRpyRosDeg(c.hpr);

                root.addChild(camEnt);
                this.cameras.push(camEnt);

                // ★ ここが AttachCamera 相当（config の fov/near/far/window をそのまま使う）
                if (c.window) {
                    this.addAttachedViewCamera({
                        parentEntity: camEnt,
                        name: (c.name || "AttachCamera") + "_view",

                        // config 側のカメラパラメータをそのまま利用
                        fov:  c.fov  ?? 70,
                        near: c.near ?? 0.1,
                        far:  c.far  ?? 1000,

                        // 今回は追加オフセットなし（必要になったら c に足す）
                        offsetRos: [0, 0, 0],
                        hprRos:    [0, 0, 0],

                        viewport: {
                            x:      c.window.x,
                            y:      c.window.y,
                            width:  c.window.width,
                            height: c.window.height,
                        },
                        backgroundColor: 0x000000,
                    });
                }
            }
        }        

        this.scene.add(root.object3d);
        this.root = root;
    }

    // ---------- init PDU & polling ----------
    async _initPdu() {
        // ① すでに接続済みかチェック
        const state = Hakoniwa.getConnectionState
            ? Hakoniwa.getConnectionState()
            : { isConnected: false };

        if (!state.isConnected) {
            const ok = await Hakoniwa.connect();
            if (!ok) {
                console.error("[Drone] PDU connect failed.");
                return;
            }
            console.log("[Drone] PDU connected (new).");
        } else {
            console.log("[Drone] PDU already connected, reuse.");
        }

        // この Drone 的には「PDU 経由で制御できる状態」になったので true
        this.pduConnected = true;

        // ② この Drone 用の PDU declare は毎機ごとにやって OK
        await Hakoniwa.withPdu(async (pdu) => {
            await pdu.declare_pdu_for_read(this.droneId, "pos");
            await pdu.declare_pdu_for_read(this.droneId, "motor");
            await pdu.declare_pdu_for_read(this.droneId, "hako_cmd_game");
        });

        // ③ この Drone 専用のポーリング開始
        this._startPduPolling();
    }


    _startPduPolling() {
        if (this._pduTimerId) return;

        this._pduTimerId = setInterval(() => {
            Hakoniwa.withPdu((pdu) => {
            // --- pos ---
            const bufPos = pdu.read_pdu_raw_data(this.droneId, "pos");
            if (bufPos) {
                const twist = pduToJs_Twist(bufPos);
                this._setPoseFromPdu(twist);
            }
            // --- game controller ---
            const bufGame = pdu.read_pdu_raw_data(this.droneId, "hako_cmd_game");
            if (bufGame) {
                const gameCtrl = pduToJs_GameControllerOperation(bufGame);
                const buttons = gameCtrl.button || gameCtrl.buttons || [];

                let camPitch = 0;

                // 11: カメラのピッチアップ
                if (buttons[11]) {
                    camPitch -= 1;
                }
                // 12: カメラのピッチダウン
                if (buttons[12]) {
                    camPitch += 1;
                }

                // -1 / 0 / +1 のどれかが入る想定
                this._camPitchInput = camPitch;
            }
            // --- motor ---
            const bufMotor = pdu.read_pdu_raw_data(this.droneId, "motor");
            if (!bufMotor) return;

            const msg = pduToJs_HakoHilActuatorControls(bufMotor);
            const controls = msg.controls;
            if (!controls || controls.length === 0) return;

            let sumDuty = 0;
            let count = 0;
            for (const idx of this.motorChannels) {
                if (idx < controls.length) {
                sumDuty += controls[idx];
                count++;
                }
            }
            if (count === 0) return;

            const avgDutyNow = sumDuty / count;
            const nowSec = performance.now() / 1000.0;
            this._addMotorDutySample(avgDutyNow, nowSec);
            });
        }, this.pduPollIntervalMs);
    }

    // ---------- internal PDU setters ----------

    _setPoseFromPdu(twistMsg) {
    const x_ros = twistMsg.linear.x;
    const y_ros = twistMsg.linear.y;
    const z_ros = twistMsg.linear.z;
    const roll  = twistMsg.angular.x;
    const pitch = twistMsg.angular.y;
    const yaw   = twistMsg.angular.z;

    this.latestPose = {
        rosPos: [x_ros, y_ros, z_ros],
        rosRpyDeg: [
        rad2deg(roll),
        rad2deg(pitch),
        rad2deg(yaw),
        ],
    };
    }

    _addMotorDutySample(avgDutyNow, nowSec) {
    const speedNow = avgDutyNow * this.rotorScale;

    this._rotorHist.push({ t: nowSec, speed: speedNow });

    while (
        this._rotorHist.length > 0 &&
        nowSec - this._rotorHist[0].t > this._rotorWindowSec
    ) {
        this._rotorHist.shift();
    }

    const sum = this._rotorHist.reduce((a, v) => a + v.speed, 0);
    this.rotorSpeed =
        this._rotorHist.length > 0 ? sum / this._rotorHist.length : 0;
    }

    // ---------- per-frame update ----------

    /**
     * 毎フレーム呼び出す。
     * - PDU接続中：PDUの姿勢＋ローターを適用
     * - 非接続中：WASD + jkl でデバッグ操作
     */
    update(dt, keyState) {
        if (this.pduConnected) {
            this._updateFromPdu(dt);
        } else {
            this._updateDebug(dt, keyState);
        }
        this._updateViewCameras(dt);
    }
    _updateViewCameras(dt) {
        if (!this.viewCameras.length) return;
        if (!this._camPitchInput) return;

        // 1秒間押しっぱなしで何度回すか（適当に調整）
        const pitchSpeedDegPerSec = 45.0; // 例: 45度/秒
        const dpitch = this._camPitchInput * pitchSpeedDegPerSec * dt;

        // 全ての attachCamera を一緒に回す場合
        for (const v of this.viewCameras) {
            // ROS: [roll, pitch, yaw]
            v.entity.rotateRosDeg([0, dpitch, 0]);
        }
    }

    _updateFromPdu(dt) {
        if (!this.latestPose) return;

        const { rosPos, rosRpyDeg } = this.latestPose;
        this.root.setPositionRos(rosPos);
        this.root.setRpyRosDeg(rosRpyDeg);

        if (dt <= 0 || this.rotorSpeed === 0) return;

        const d = this.rotorSpeed * dt;
        let index = 0;
        for (const rotorEnt of this.rotors) {
            if (index % 2 === 0) {
                rotorEnt.rotateLocalEuler([0, -d, 0]);
            } else {
                rotorEnt.rotateLocalEuler([0, d, 0]);
            }
            index++;
        }
        this._updateViewCameras(dt);
    }

    _updateDebug(dt, keyState) {
        const moveSpeed = 2.0;
        const rotSpeedDeg = 60.0;

        const dPos = [0, 0, 0];
        const dRpy = [0, 0, 0];
        if (keyState["w"]) dPos[0] += moveSpeed * dt;
        if (keyState["s"]) dPos[0] -= moveSpeed * dt;
        if (keyState["a"]) dPos[1] += moveSpeed * dt;
        if (keyState["d"]) dPos[1] -= moveSpeed * dt;
        if (keyState["r"]) dPos[2] += moveSpeed * dt;
        if (keyState["f"]) dPos[2] -= moveSpeed * dt;

        if (keyState["q"]) dRpy[2] += rotSpeedDeg * dt;
        if (keyState["e"]) dRpy[2] -= rotSpeedDeg * dt;

        if (dPos[0] || dPos[1] || dPos[2]) {
            this.root.translateRos(dPos);
        }
        if (dRpy[0] || dRpy[1] || dRpy[2]) {
            this.root.rotateRosDeg(dRpy);
        }

        const accel = 20.0;
        if (keyState["j"]) this.rotorSpeed -= accel * dt;
        if (keyState["k"]) this.rotorSpeed += accel * dt;
        if (keyState["l"]) this.rotorSpeed = 0;

        if (this.rotorSpeed !== 0) {
            const d = this.rotorSpeed * dt;
            for (const rotorEnt of this.rotors) {
                rotorEnt.rotateLocalEuler([0, d, 0]);
            }
        }
    }


    /**
     * ドローンに紐づく「小窓カメラ」を追加する
     *
     * options:
     * - parentEntity: RenderEntity (省略時は parentName → cameras → root の順で探す)
     * - parentName:   cfg.cameras[].name など
     * - name:         このカメラ用の名前
     * - fov, near, far: Three の PerspectiveCamera パラメータ
     * - offsetRos, hprRos: 親 RenderEntity からのオフセット（ROS 座標系／deg）
     * - viewport: { x, y, width, height } 0〜1 の正規化座標（左下原点）
     * - backgroundColor: 0x000000 など
     */
    addAttachedViewCamera({
        parentEntity = null,
        parentName   = null,
        name         = "AttachCamera",
        fov          = 70,
        near         = 0.1,
        far          = 1000,
        offsetRos    = [0, 0, 0],
        hprRos       = [0, 0, 0],
        viewport     = { x: 0.7, y: 0.7, width: 0.25, height: 0.25 },
        backgroundColor = 0x000000,
    } = {}) {
        // 親 RenderEntity を決定
        let parent = parentEntity;
        if (!parent) {
        if (parentName && this.cameras && this.cameras.length > 0) {
            parent = this.cameras.find(c => c.name === parentName) || null;
        }
        }
        if (!parent) {
            parent = this.root;
        }

        const cam = new THREE.PerspectiveCamera(fov, 1.0, near, far);
        parent.object3d.add(cam);

        this.viewCameras.push({
            entity: parent, 
            camera: cam,
            viewport,
            backgroundColor: new THREE.Color(backgroundColor),
        });

        return parent;
    }

    /**
     * 小窓カメラをレンダリング
     */
    renderAttachedCameras(renderer, scene, fullWidth, fullHeight) {
        for (const v of this.viewCameras) {
        const { viewport, camera, backgroundColor } = v;
        const { x, y, width, height } = viewport;

        const vpW = Math.floor(fullWidth  * width);
        const vpH = Math.floor(fullHeight * height);
        const vpX = Math.floor(fullWidth  * x);
        const vpY = Math.floor(fullHeight * y); // three.js は左下原点

        // アスペクトを小窓サイズに合わせる
        camera.aspect = vpW / vpH;
        camera.updateProjectionMatrix();

        // 小窓領域のみ描画
        renderer.setScissorTest(true);
        renderer.setViewport(vpX, vpY, vpW, vpH);
        renderer.setScissor(vpX, vpY, vpW, vpH);

        const prevClear = renderer.getClearColor(new THREE.Color());
        const prevAlpha = renderer.getClearAlpha();

        renderer.setClearColor(backgroundColor, 1.0);
        renderer.clearDepth(); // メインとは別に深度クリア
        renderer.render(scene, camera);

        // 元に戻す
        renderer.setClearColor(prevClear, prevAlpha);
        renderer.setScissorTest(false);
        }
    }


    // ---------- utility ----------

    getWorldPosition(targetVec3) {
        return this.root.getWorldPosition(targetVec3);
    }
}
