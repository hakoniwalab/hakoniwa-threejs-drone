from __future__ import annotations

import json
import shutil
import subprocess
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

    def test_traffic_signal_lamps_are_wired(self) -> None:
        # hakoniwa-scenario-pro M3-2: one std_msgs/UInt32 PDU per signal lights the lamps of the
        # world part "signal-<road>-<id>".
        source = (ROOT / "src/traffic_signals.js").read_text(encoding="utf-8")
        for marker in ("export class TrafficSignals", "pduToJs_UInt32", 'name.startsWith("signal-")'):
            self.assertIn(marker, source)
        self.assertIn("findSceneObjects(predicate)", (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8"))
        index = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('from "./src/traffic_signals.js"', index)
        self.assertIn("config.signalPdus", index)

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

    @unittest.skipUnless(shutil.which("node"), "node is not installed")
    def test_visual_joint_can_reuse_and_scale_a_source_joint(self) -> None:
        output = subprocess.run(
            ["node", str(ROOT / "tests/js/joint_motion_check.mjs")],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        result = json.loads(output)
        self.assertEqual(result["direct"], {
            "sourceJoint": "front_left_steer_joint",
            "multiplier": 1,
        })
        self.assertEqual(result["derived"], {
            "sourceJoint": "front_left_steer_joint",
            "multiplier": 15,
        })
        self.assertTrue(result["rejectedZero"])
        vehicle = (ROOT / "src/vehicle.js").read_text(encoding="utf-8")
        self.assertIn("this.joints.get(sourceJoint) ?? []", vehicle)
        self.assertIn("value * binding.multiplier", vehicle)

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

    def test_environment_wireframe_render_override_is_supported(self) -> None:
        schema = json.loads(
            (ROOT / "config/schema/scene-config.schema.json").read_text(
                encoding="utf-8"
            )
        )
        environment = schema["properties"]["environments"]["items"]["properties"]
        render = environment["render"]
        self.assertEqual(render["properties"]["mode"]["const"], "wireframe")
        self.assertEqual(
            render["properties"]["color"]["pattern"], "^#[0-9A-Fa-f]{6}$"
        )
        source = (ROOT / "src/environment.js").read_text(encoding="utf-8")
        self.assertIn('renderCfg.mode !== "wireframe"', source)
        self.assertIn("wireframe: true", source)
        self.assertIn("applyRenderOverride(gltfRoot, envCfg.render)", source)

    def test_attached_camera_can_be_opt_in_main_view(self) -> None:
        app = (ROOT / "src/app.js").read_text(encoding="utf-8")
        drone = (ROOT / "src/drone.js").read_text(encoding="utf-8")
        viewer = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        self.assertIn('attachedCameraPresentation: "overlay"', app)
        self.assertIn('runtimeOptions.attachedCameraPresentation === "main"', app)
        self.assertIn('e.key === "Tab"', app)
        self.assertIn("setObjectiveViewMain(!attachedCameraSwapped)", app)
        self.assertIn("main_camera.initialMode must be follow, fixed, overview, or front", app)
        self.assertIn('e.code === "KeyF"', app)
        self.assertIn("getPrimaryAttachedCamera()", drone)
        self.assertIn("ui.attachedCameraPresentation must be overlay or main", viewer)
        self.assertIn("ui.initialMainView must be attached or objective", viewer)
        index = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn('id="camera-driver-btn"', index)
        self.assertIn("viewer.setObjectiveViewMain(false)", index)
        self.assertIn('id="camera-zoom-in-btn"', index)
        self.assertIn('id="camera-zoom-out-btn"', index)
        self.assertIn('id="camera-front-btn"', index)
        self.assertIn('id="overview-inset-btn"', index)
        self.assertIn("viewer.zoomObjectiveCamera(0.8)", index)
        self.assertIn("viewer.setFrontCameraEnabled(true)", index)
        self.assertIn("viewer.setOverviewInsetEnabled(enabled)", index)

    def test_vehicle_front_camera_uses_the_shared_attached_camera_presentation(self) -> None:
        app = (ROOT / "src/app.js").read_text(encoding="utf-8")
        vehicle = (ROOT / "src/vehicle.js").read_text(encoding="utf-8")
        schema = json.loads(
            (ROOT / "config/schema/scene-config.schema.json").read_text(
                encoding="utf-8"
            )
        )
        vehicle_properties = schema["properties"]["vehicles"]["items"]["properties"]
        self.assertIn("frontCamera", vehicle_properties)
        self.assertIn("extraCameras", vehicle_properties)
        extra_camera = vehicle_properties["extraCameras"]["items"]
        self.assertIn("name", extra_camera["required"])
        self.assertIn("attachedCameraConfigs(this.config)", vehicle)
        self.assertIn("renderAttachedCameras", vehicle)
        self.assertIn("renderExtraAttachedCameras?.", app)
        self.assertIn("includePrimary: false", vehicle)
        self.assertIn("[...drones, ...vehicles]", app)

    @unittest.skipUnless(shutil.which("node"), "node is not installed")
    def test_vehicle_extra_cameras_follow_the_front_camera_order(self) -> None:
        output = subprocess.run(
            ["node", str(ROOT / "tests/js/vehicle_camera_check.mjs")],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        result = json.loads(output)
        self.assertEqual([item["name"] for item in result["cameras"]], ["front", "cabin"])
        self.assertTrue(result["cameras"][0]["primary"])
        self.assertFalse(result["cameras"][1]["primary"])
        self.assertTrue(result["rejectedUnnamed"])

    def test_javascript_pdu_submodule_is_initialized(self) -> None:
        for relative in (
            "thirdparty/hakoniwa-pdu-javascript/src/PduManager.js",
            "thirdparty/hakoniwa-pdu-javascript/src/impl/WebSocketCommunicationService.js",
        ):
            with self.subTest(path=relative):
                self.assertTrue((ROOT / relative).is_file())

    @unittest.skipUnless(shutil.which("node"), "node is not installed")
    def test_remote_page_reaches_the_bridge_on_its_own_host(self) -> None:
        """A loopback wsUri follows the page host when the viewer is opened from another machine."""
        script = (
            "import { wsUriForPage } from " + json.dumps((ROOT / "src/viewer_config_loader.js").as_uri()) + ";"
            "console.log(JSON.stringify(["
            "wsUriForPage('ws://127.0.0.1:28866', 'http://192.168.1.20:28100/v/index.html'),"
            "wsUriForPage('ws://127.0.0.1:28866', 'http://127.0.0.1:28100/v/index.html'),"
            "wsUriForPage('ws://localhost:28866', 'http://localhost:28100/v'),"
            "wsUriForPage('ws://10.0.0.5:28866', 'http://192.168.1.20:28100/v')]));"
        )
        output = subprocess.run(
            ["node", "--input-type=module", "-e", script], check=True, capture_output=True, text=True,
        ).stdout
        self.assertEqual(json.loads(output), [
            "ws://192.168.1.20:28866", "ws://127.0.0.1:28866", "ws://localhost:28866", "ws://10.0.0.5:28866",
        ])

    def test_vehicle_pose_interpolation_is_opt_in(self) -> None:
        source = (ROOT / "src/state_source/vehicle_state_source.js").read_text(encoding="utf-8")
        viewer = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        self.assertIn("interpolation.enabled === true ? interpolation : null", source)
        self.assertIn("if (this.vehicleStateSource?.interpolation) this.applyVehicleStates();", viewer)

    @unittest.skipUnless(shutil.which("node"), "node is not installed")
    def test_fleet_pose_interpolation_is_optional_and_snaps_large_jumps(self) -> None:
        output = subprocess.run(
            ["node", str(ROOT / "tests/js/fleet_interpolation_check.mjs")],
            check=True, capture_output=True, text=True,
        ).stdout
        result = json.loads(output)
        self.assertEqual(result["disabledX"], 2)
        self.assertAlmostEqual(result["midpointX"], 1, places=6)
        self.assertAlmostEqual(result["midpointYawDeg"], 45, places=6)
        self.assertEqual(result["midpointPwm"], 0.8)
        self.assertEqual(result["snappedX"], 5)
        viewer = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        self.assertIn("if (this.stateSource?.interpolation) this.applyDroneStates();", viewer)

    @unittest.skipUnless(shutil.which("node"), "node is not installed")
    def test_pose_interpolation_moves_an_uneven_stream_evenly(self) -> None:
        """8 m/s at 40 ms +-10 ms: about 13 cm per 60 Hz frame, never 0 or a 32 cm jump."""
        output = subprocess.run(
            ["node", str(ROOT / "tests/js/pose_interpolator_check.mjs")],
            check=True, capture_output=True, text=True,
        ).stdout
        result = json.loads(output)
        self.assertGreater(result["minStep"], 0.08)
        self.assertLess(result["maxStep"], 0.20)
        self.assertTrue(result["repeatedPushIgnored"])
        self.assertEqual(result["teleported"], 5)
        self.assertAlmostEqual(result["halfTurnZ"], 0.7071, places=3)
        self.assertAlmostEqual(result["halfTurnW"], 0.7071, places=3)
        # 26.7 m/s at 60 Hz is 0.445 m a frame; even within 25 % (not 0.22 / 0.89).
        self.assertGreater(result["stampedMinStep"], 0.33)
        self.assertLess(result["stampedMaxStep"], 0.56)

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

    @unittest.skipUnless(shutil.which("node"), "node is not installed")
    def test_eams_hexa_disturb_config_and_rotor_controls(self) -> None:
        base = json.loads(
            (ROOT / "config/viewer-config-fleets-hexa-eams.json").read_text(
                encoding="utf-8"
            )
        )
        disturb = json.loads(
            (ROOT / "config/viewer-config-fleets-hexa-eams-disturb.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(disturb["three"], base["three"])
        self.assertEqual(disturb["ui"], base["ui"])
        self.assertEqual(disturb["stateInput"], base["stateInput"])
        self.assertEqual(disturb["pdu"]["pduDefPath"], "./pdudef-disturb.json")
        self.assertEqual(
            disturb["faultInjection"],
            {"robotName": "Drone", "rotorCount": 6},
        )

        pdu_def = json.loads(
            (ROOT / "config/pdudef-disturb.json").read_text(encoding="utf-8")
        )
        drone = next(robot for robot in pdu_def["robots"] if robot["name"] == "Drone")
        pdu_types_path = next(
            item["path"] for item in pdu_def["paths"]
            if item["id"] == drone["pdutypes_id"]
        )
        pdu_types = json.loads(
            (ROOT / "config" / pdu_types_path).read_text(encoding="utf-8")
        )
        self.assertTrue(any(
            pdu["name"] == "disturb" and pdu["type"] == "hako_msgs/Disturbance"
            for pdu in pdu_types
        ))

        index = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("configureRotorControls(config.faultInjection?.rotorCount ?? 4)", index)
        self.assertIn("buildRotorScaleControls(count)", index)
        self.assertIn("buildPwmRows(count)", index)

        output = subprocess.run(
            ["node", str(ROOT / "tests/js/rotor_controls_check.mjs")],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        self.assertEqual(
            json.loads(output),
            {"defaultRotorCount": 4, "eamsRotorCount": 6},
        )

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

    def test_fault_injection_target_is_an_optional_viewer_setting(self) -> None:
        schema = json.loads(
            (ROOT / "config/schema/viewer-config.schema.json").read_text(
                encoding="utf-8"
            )
        )
        fault = schema["properties"]["faultInjection"]
        self.assertEqual(fault["required"], ["rotorCount"])
        self.assertEqual(
            fault["anyOf"],
            [{"required": ["robotName"]}, {"required": ["robotNames"]}],
        )
        self.assertTrue(fault["properties"]["robotNames"]["uniqueItems"])
        # The Drone service decodes at most 16 rotor scales.
        self.assertEqual(fault["properties"]["rotorCount"]["maximum"], 16)
        self.assertEqual(fault["properties"]["pduName"]["default"], "disturb")
        viewer = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        self.assertIn("getFaultInjectionConfig()", viewer)
        self.assertIn("new FaultInjectionTargetStates(fault)", viewer)
        self.assertIn("setFaultInjectionTarget(robotName)", viewer)
        self.assertIn("robotName: fault.robotName ?? fault.robotNames[0]", viewer)
        panel = (ROOT / "src/fault_injection/fault_panel.js").read_text(encoding="utf-8")
        self.assertIn("export function mountFaultPanel(container, viewer)", panel)
        self.assertIn("length: fault.rotorCount", panel)
        self.assertIn("viewer.sendRotorFaultScales(scales)", panel)
        # The wind is set on a compass pointing where it blows, as a map bearing.
        self.assertIn("function windCompass(onRelease)", panel)
        self.assertIn("return (360 - headingDeg) % 360;", panel)
        self.assertIn("rotate(${-90 - headingDeg}deg)", panel)
        index = (ROOT / "src/index.js").read_text(encoding="utf-8")
        self.assertIn("mountFaultPanel", index)

    @unittest.skipUnless(shutil.which("node"), "node is not installed")
    def test_fault_injection_targets_keep_independent_values(self) -> None:
        output = subprocess.run(
            ["node", str(ROOT / "tests/js/fault_injection_targets_check.mjs")],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        self.assertEqual(json.loads(output), {"targets": 2, "rotorCount": 3})
        page = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertIn("updateFaultInjectionTarget()", page)
        self.assertIn("viewer.setFaultInjectionTarget(isDrone ? selectedName : null)", page)
        self.assertIn("setRotorScalesToInputs(viewer.getRotorFaultScales())", page)
        self.assertIn("setWindToInputs(viewer.getWind())", page)

    @unittest.skipUnless(shutil.which("node"), "node is not installed")
    def test_viewer_config_validator_accepts_single_and_multi_drone_fault_targets(self) -> None:
        output = subprocess.run(
            ["node", str(ROOT / "tests/js/viewer_config_validation_check.mjs")],
            check=True,
            capture_output=True,
            text=True,
        ).stdout
        self.assertEqual(
            json.loads(output),
            {"multiDrone": True, "singleDrone": True, "invalidCases": 6},
        )

    def test_planned_flight_paths_are_an_optional_overlay(self) -> None:
        schema = json.loads(
            (ROOT / "config/schema/viewer-config.schema.json").read_text(
                encoding="utf-8"
            )
        )
        point = schema["properties"]["flightPaths"]["items"]["properties"]["points"]["items"]
        self.assertEqual(point["required"], ["east_m", "north_m", "up_m"])
        viewer = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        self.assertIn("hasFlightPaths()", viewer)
        self.assertIn("setFlightPathsVisible(enabled)", viewer)
        self.assertIn("validateFlightPaths(config.flightPaths)", viewer)
        overlay = (ROOT / "src/flight_path.js").read_text(encoding="utf-8")
        # ENU to the scene as the Drones are drawn: ROS (x, y, z) -> (-y, z, -x).
        self.assertIn("new THREE.Vector3(point.east_m, point.up_m, -point.north_m)", overlay)
        # Vehicle routes are planned paths too.
        route = schema["properties"]["routePaths"]["items"]["properties"]["points"]["items"]
        self.assertEqual(route["required"], ["east_m", "north_m", "up_m"])
        self.assertIn("hasPlannedPaths()", viewer)
        self.assertIn("setPlannedPathsVisible(enabled)", viewer)
        self.assertIn("validateRoutePaths(config.routePaths)", viewer)
        # A route's road friction colours its line (dry, wet, snow, ice).
        self.assertIn("road_friction", route["properties"])
        self.assertIn("frictionColor(samples[start].road_friction)", overlay)
        # ... and fills the band (road_width_m wide) where it holds.
        self.assertIn("road_width_m", route["properties"])
        self.assertIn("addFrictionBands(group, samples)", overlay)
        # A flight path's wind / rotor-fault zones: see-through boxes of 8 ENU corners.
        zone = schema["properties"]["flightPaths"]["items"]["properties"]["zones"]["items"]
        self.assertEqual(zone["required"], ["corners"])
        self.assertEqual(zone["properties"]["corners"]["minItems"], 8)
        self.assertEqual(zone["properties"]["wind"]["required"], ["towards_deg", "speed_m_s"])
        self.assertEqual(zone["properties"]["fault"]["required"], ["rotors", "scale"])
        self.assertIn("if (path.zones !== undefined) validateZones(path.zones);", overlay)
        self.assertIn("if (path.zones) addZones(group, path.zones);", overlay)
        self.assertIn("new THREE.Vector3(east, up, -north)", overlay)
        self.assertIn("const color = zone.fault ? FAULT_COLOR : WIND_COLOR;", overlay)
        self.assertIn("new THREE.Vector3(Math.cos(towards), 0, -Math.sin(towards))", overlay)

    def test_actual_tracks_are_recorded_and_shown_on_request(self) -> None:
        viewer = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        # Recorded every frame whether or not they show.
        self.assertIn("this.recordTrails();", viewer)
        self.assertIn("setTrailsVisible(enabled)", viewer)
        self.assertIn("clearTrails()", viewer)
        trail = (ROOT / "src/trail.js").read_text(encoding="utf-8")
        self.assertIn("export class TrailRecorder", trail)
        self.assertIn("entity.getWorldPosition(this.scratch)", trail)
        # A jump (placed at its start, a reset) starts the track again: no line across the scene.
        self.assertIn("if (last && last.distanceTo(point) > JUMP_M) this.points = [];", trail)

    def test_the_main_camera_pose_can_be_set_in_urban_enu(self) -> None:
        app = (ROOT / "src/app.js").read_text(encoding="utf-8")
        viewer = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        self.assertIn("export function setCameraPose({ position, target, fov } = {})", app)
        self.assertIn("export function getCameraPose()", app)
        # ENU (east, north, up) to the scene (x = east, y = up, z = -north); a pose stops following.
        self.assertIn("orbitCam.camera.position.set(position[0], position[2], -position[1]);", app)
        self.assertIn('orbitCam.setMode("fixed");', app)
        for method in ("setCameraPose(pose)", "getCameraPose()", "setAttachedCamerasEnabled(enabled)"):
            self.assertIn(method, viewer)

    def test_each_pin_has_its_own_colour(self) -> None:
        trail = (ROOT / "src/trail.js").read_text(encoding="utf-8")
        # Green the first time (the normal run), purple the second (a what-if), ...
        self.assertIn("const PINNED_COLORS = [0x43a047, 0x8e24aa,", trail)
        self.assertIn("this.addPinned(key, track.kind, track.points, this.nextRound);", trail)
        # The pin a track came from is stored, so a reload keeps the colours.
        self.assertIn("r: pinned.round", trail)

    def test_trails_can_be_pinned_and_kept_across_reloads(self) -> None:
        viewer = (ROOT / "src/public/drone_viewer.js").read_text(encoding="utf-8")
        self.assertIn("pinTrails()", viewer)
        self.assertIn("return this.ensureTrails().pin();", viewer)
        self.assertIn("clearPinnedTrails()", viewer)
        self.assertIn("this.ensureTrails().clearPinned();", viewer)
        # Restored when the recorder is created, keyed by the scene.
        self.assertIn("this.trails.restorePinned();", viewer)
        self.assertIn("pinnedTrailsStorageKey(loc?.search", viewer)
        trail = (ROOT / "src/trail.js").read_text(encoding="utf-8")
        self.assertIn("const PINNED_COLORS = [0x43a047,", trail)
        self.assertIn("export function pinnedTrailsStorageKey(", trail)
        self.assertIn('params.get("viewerConfigPath") || params.get("viewerConfigName")', trail)
        self.assertIn("pin() {", trail)
        self.assertIn("clearPinned() {", trail)
        # Pinning starts the live tracks afresh.
        self.assertIn("this.clear();\n    if (count > 0) {\n      this.nextRound += 1;\n      this.savePinned();", trail)
        # Stored in centimetres; the viewer works without storage.
        self.assertIn("Math.round(point.x * 100)", trail)
        self.assertIn("storage.setItem(this.storageKey, JSON.stringify(data));", trail)
        self.assertGreaterEqual(trail.count("try {"), 4)

    def test_untextured_ground_gets_a_metre_scaled_pattern(self) -> None:
        schema = json.loads(
            (ROOT / "config/schema/scene-config.schema.json").read_text(encoding="utf-8")
        )
        environment = schema["properties"]["environments"]["items"]["properties"]
        self.assertEqual(environment["groundTexture"]["default"], True)
        source = (ROOT / "src/ground_texture.js").read_text(encoding="utf-8")
        # Only meshes with neither a texture nor UVs, projected top-down in metres.
        self.assertIn("hasTexture(mesh.material) || mesh.geometry?.attributes?.uv", source)
        self.assertIn("uv[i * 2] = point.x / tile;", source)
        self.assertIn("uv[i * 2 + 1] = point.z / tile;", source)
        self.assertIn('/road/i.test(node.name || "")', source)
        environment_js = (ROOT / "src/environment.js").read_text(encoding="utf-8")
        self.assertIn("envCfg.groundTexture !== false", environment_js)
        self.assertIn("texturizeUntexturedSurfaces(gltfRoot)", environment_js)

    def test_readme_uses_current_operational_contract(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        for command in (
            "python tools/hako.py doctor",
            "python tools/hako.py test",
            "python tools/hako.py smoke",
            "python tools/hako.py serve",
        ):
            with self.subTest(command=command):
                self.assertIn(command, readme)

        self.assertIn("drone-single-mujoco-threejs-gamepad", readme)
        self.assertNotIn("mac-main_hako_drone_service", readme)
        self.assertNotIn("run-web-bridge.bash", readme)


if __name__ == "__main__":
    unittest.main()
