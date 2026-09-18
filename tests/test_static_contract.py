from __future__ import annotations

import json
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class StaticViewerContractTest(unittest.TestCase):
    def test_viewer_configs_are_resolvable(self) -> None:
        configs = sorted((ROOT / "config").glob("viewer-config-*.json"))
        self.assertTrue(configs, "viewer configuration files are required")

        for path in configs:
            with self.subTest(path=path.name):
                data = json.loads(path.read_text(encoding="utf-8"))
                self.assertEqual("1.0", data.get("version"))
                self.assertIn(data.get("stateInput", {}).get("mode"), {"legacy", "fleets"})

                for section, key in (("three", "sceneConfigPath"), ("pdu", "pduDefPath")):
                    value = data.get(section, {}).get(key)
                    self.assertIsInstance(value, str)
                    self.assertTrue(value)
                    if value.startswith(("/", "http://", "https://")):
                        continue
                    target = (path.parent / value).resolve()
                    self.assertTrue(target.is_file(), f"{path.name}: missing {section}.{key} target {value}")

    def test_public_viewer_api_used_by_integrators_is_present(self) -> None:
        source = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        for marker in (
            "export class DroneViewer",
            "export function createDroneViewer",
            "configure(partialConfig",
            "async initialize(",
            "async connectPdu(",
            "withPdu(callback)",
            "async initDronePdu(",
            "getDrones()",
            "getVehicles()",
            "addSceneDecoration(object3d)",
            "removeSceneDecoration(object3d)",
            "focusDroneById(",
            "setFollowSelectedEnabled(",
            "setAudienceCameraEnabled(",
            "getAudienceCameraState()",
            "setAudienceCameraMovementInput(input",
            "setAudienceCameraPose(pose",
            "setNightMode(",
            "getNightMode()",
            "setNightLighting(options",
            "getNightLighting()",
            "setDroneLedStates(states",
            "setDroneLedAppearance(options",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, source)

    def test_vehicle_viewer_uses_standard_view_model_and_state_pdus(self) -> None:
        scene_schema = json.loads(
            (ROOT / "config/schema/scene-config.schema.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertIn("vehicleTypesPath", scene_schema["properties"])
        self.assertIn("vehicles", scene_schema["properties"])
        viewer_schema = json.loads(
            (ROOT / "config/schema/viewer-config.schema.json").read_text(
                encoding="utf-8"
            )
        )
        state_input = viewer_schema["properties"]["stateInput"]
        self.assertIn("none", state_input["properties"]["mode"]["enum"])
        roles = state_input["properties"]["vehicles"]["properties"]["roleMap"]
        self.assertEqual(
            roles["properties"]["vehicle_states"]["const"],
            "sensor_msgs/MultiDOFJointState",
        )
        self.assertEqual(
            roles["properties"]["joint_states"]["const"],
            "sensor_msgs/JointState",
        )
        vehicle = (ROOT / "src/vehicle.js").read_text(encoding="utf-8")
        source = (ROOT / "src/state_source/vehicle_state_source.js").read_text(
            encoding="utf-8"
        )
        self.assertIn('model.format !== "hako_viewer_model"', vehicle)
        self.assertIn("pduToJs_MultiDOFJointState", source)
        self.assertIn("pduToJs_JointState", source)

    def test_fpv_course_is_an_opt_in_environment(self) -> None:
        environment = (ROOT / "src/environment.js").read_text(encoding="utf-8")
        course = (ROOT / "src/fpv_course.js").read_text(encoding="utf-8")
        self.assertIn('envCfg.type === "fpv-course"', environment)
        self.assertIn("buildFpvCourse(scene, envCfg.model)", environment)
        self.assertIn('course.kind !== "hakoniwa-fpv-course"', course)
        self.assertIn("obstacle.type === \"gate\"", course)
        self.assertIn("obstacle.type === \"pylon\"", course)
        drone = (ROOT / "src/drone.js").read_text(encoding="utf-8")
        self.assertIn("root.object3d.scale.setScalar(cfg.scale)", drone)

    def test_attached_camera_can_be_opt_in_main_view(self) -> None:
        app = (ROOT / "src/app.js").read_text(encoding="utf-8")
        drone = (ROOT / "src/drone.js").read_text(encoding="utf-8")
        viewer = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        self.assertIn('attachedCameraPresentation: "overlay"', app)
        self.assertIn('runtimeOptions.attachedCameraPresentation === "main"', app)
        self.assertIn('e.key === "Tab"', app)
        self.assertIn('e.code === "KeyF"', app)
        self.assertIn("getPrimaryAttachedCamera()", drone)
        self.assertIn("ui.attachedCameraPresentation must be overlay or main", viewer)

    def test_javascript_pdu_submodule_is_initialized(self) -> None:
        for relative in (
            "thirdparty/hakoniwa-pdu-javascript/src/PduManager.js",
            "thirdparty/hakoniwa-pdu-javascript/src/impl/WebSocketCommunicationService.js",
        ):
            with self.subTest(path=relative):
                self.assertTrue((ROOT / relative).is_file())

    def test_fleet_pdu_polling_is_single_flight_and_throttled(self) -> None:
        viewer = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        source = (ROOT / "src/state_source/fleet_state_source.js").read_text(encoding="utf-8")
        for marker in (
            "this.syncInFlight = null",
            "this.syncElapsedMsec",
            "statePanelIntervalMsec ?? 100",
            "if (this.syncInFlight)",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, viewer)
        self.assertIn("skipped an incomplete visual-state packet", source)
        self.assertIn("lastInvalidPacketWarningMsec", source)

    def test_eams_hexa_uses_six_scaled_propellers_and_six_motor_channels(self) -> None:
        drone_types = json.loads(
            (ROOT / "config/drone_types-hexa-eams.json").read_text(encoding="utf-8")
        )
        hexa = drone_types["hexa_eams"]
        self.assertTrue((ROOT / "assets/models/eams-hexa-frame.glb").is_file())
        self.assertEqual(hexa["model"]["hpr"], [0, 0, 0])
        self.assertEqual(len(hexa["rotors"]), 6)
        self.assertEqual(
            [rotor["spinDirection"] for rotor in hexa["rotors"]],
            ["cw", "ccw", "cw", "ccw", "cw", "ccw"],
        )
        self.assertTrue(
            all(rotor["model"]["scale"] > 1 for rotor in hexa["rotors"])
        )
        monitor = hexa["cameras"][0]
        self.assertEqual(monitor["name"], "road_monitor_camera")
        self.assertEqual(monitor["hpr"], [0, 50, 0])
        self.assertGreaterEqual(monitor["window"]["x"], 0.7)
        self.assertGreaterEqual(monitor["window"]["y"], 0.7)
        viewer = json.loads(
            (ROOT / "config/viewer-config-fleets-hexa-eams.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(
            viewer["stateInput"]["fleets"]["motorChannels"],
            [0, 1, 2, 3, 4, 5],
        )
        self.assertTrue(viewer["ui"]["enableAttachedCameras"])
        factory = (ROOT / "src/state_source/state_source_factory.js").read_text(
            encoding="utf-8"
        )
        self.assertIn("motorChannels: input.motorChannels", factory)
        self.assertIn("applyModelScale(rotorModelEnt", (ROOT / "src/drone.js").read_text(encoding="utf-8"))

    def test_night_show_preserves_word_readability(self) -> None:
        source = (ROOT / "src/app.js").read_text(encoding="utf-8")
        for marker in (
            "const NIGHT_LIGHTING",
            "renderer.setClearColor(lighting.background, 1.0)",
            "starField.visible = mode",
            "createLedGlowTexture",
            "led.position.set(0, -0.16, 0)",
            "Math.PI * 2 * 0.22",
            "shared breathing cycle",
            "ledAppearanceScale",
            "ledAppearanceIntensity",
            "ledSpatialDepthCue",
            "createLedBulb",
            "cameraDistanceM",
        ):
            with self.subTest(marker=marker):
                self.assertIn(marker, source)

    def test_drone_body_color_is_an_optional_viewer_setting(self) -> None:
        schema = json.loads(
            (ROOT / "config/schema/viewer-config.schema.json").read_text(
                encoding="utf-8"
            )
        )
        appearance = schema["properties"]["three"]["properties"][
            "droneAppearance"
        ]
        self.assertEqual(
            appearance["properties"]["bodyColor"]["pattern"],
            "^#[0-9A-Fa-f]{6}$",
        )
        drone = (ROOT / "src/drone.js").read_text(encoding="utf-8")
        app = (ROOT / "src/app.js").read_text(encoding="utf-8")
        viewer = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        self.assertIn("m.color.set(this.bodyColor)", drone)
        self.assertIn("bodyColor: droneAppearance.bodyColor ?? null", app)
        self.assertIn("three.droneAppearance.bodyColor must be a #RRGGBB color", viewer)

    def test_audience_camera_is_optional_and_keeps_free_camera_available(self) -> None:
        schema = json.loads(
            (ROOT / "config/schema/viewer-config.schema.json").read_text(
                encoding="utf-8"
            )
        )
        three = schema["properties"]["three"]["properties"]
        self.assertEqual(three["initialCameraMode"]["enum"], ["free", "audience"])
        self.assertEqual(
            three["audienceCamera"]["required"],
            ["positionM", "yawDeg", "pitchDeg", "fovDeg"],
        )
        app = (ROOT / "src/app.js").read_text(encoding="utf-8")
        camera = (ROOT / "src/audience_camera.js").read_text(encoding="utf-8")
        viewer = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        self.assertIn("orbitCameraSnapshot", app)
        self.assertIn("else orbitCam.update(dt)", app)
        self.assertIn('this.keys.has("arrowup")', camera)
        self.assertIn('event.pointerType === "touch"', camera)
        self.assertIn('this.touchPointers.size === 1', camera)
        self.assertIn('this._touchDistance()', camera)
        self.assertIn('domElement.style.touchAction = "none"', camera)
        self.assertIn('this.keys.has("u")', camera)
        self.assertIn("this.movementInput.forward", camera)
        self.assertIn("setMovementInput(input", camera)
        self.assertIn("setPose(pose", camera)
        self.assertIn("this.fovDeg = clamp", camera)
        self.assertEqual(three["transparentBackground"]["default"], False)
        self.assertIn("moveSpeedMps", three["audienceCamera"]["properties"])
        self.assertIn("transparentBackground: this.viewerConfig", viewer)
        self.assertIn("renderer.setClearColor(0x000000, 0.0)", app)

    def test_readme_uses_current_operational_contract(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        for command in (
            "python tools/hako.py doctor",
            "python tools/hako.py test",
            "python tools/hako.py smoke",
        ):
            with self.subTest(command=command):
                self.assertIn(command, readme)

        self.assertIn("drone-single-mujoco-threejs-gamepad", readme)
        self.assertNotIn("mac-main_hako_drone_service", readme)
        self.assertNotIn("run-web-bridge.bash", readme)


if __name__ == "__main__":
    unittest.main()
