from __future__ import annotations

import json
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class FleetsDisturbanceConfigTest(unittest.TestCase):
    def test_fleets_definition_includes_visual_state_and_disturbance(self) -> None:
        definition = json.loads(
            (ROOT / "config" / "pdudef-fleets.json").read_text(encoding="utf-8")
        )
        robots = {item["name"]: item["pdutypes_id"] for item in definition["robots"]}
        self.assertEqual(robots["DroneVisualStatePublisher"], "visual_state_type")
        self.assertEqual(robots["Drone"], "control_type")

        paths = {item["id"]: item["path"] for item in definition["paths"]}
        self.assertEqual(paths["control_type"], "pdudef-control-pdutypes.json")

    def test_control_definition_matches_drone_disturbance_contract(self) -> None:
        pdutypes = json.loads(
            (ROOT / "config" / "pdudef-control-pdutypes.json").read_text(
                encoding="utf-8"
            )
        )
        self.assertEqual(
            pdutypes,
            [
                {
                    "channel_id": 3,
                    "pdu_size": 256,
                    "name": "disturb",
                    "type": "hako_msgs/Disturbance",
                }
            ],
        )


if __name__ == "__main__":
    unittest.main()
