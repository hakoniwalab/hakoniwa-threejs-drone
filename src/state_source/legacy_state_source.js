import { IStateSource } from "./i_state_source.js";
import { Hakoniwa } from "../hakoniwa/hakoniwa-pdu.js";
import { pduToJs_Twist } from "../../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/geometry_msgs/pdu_conv_Twist.js";
import { pduToJs_HakoHilActuatorControls } from "../../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/hako_mavlink_msgs/pdu_conv_HakoHilActuatorControls.js";
import { validateCompactPdudef, loadPdutypeTable } from "./compact_pdudef_loader.js";

const rad2deg = (r) => r * 180.0 / Math.PI;

export class LegacyStateSource extends IStateSource {
  constructor(roleMap = {}, options = {}) {
    super();
    this.roleMap = roleMap;
    this.bindingsByDrone = new Map();
    this.boundDroneIds = new Set();
    this.stateByDrone = new Map();
    this.motorChannels = options.motorChannels ?? [0, 1, 2, 3];
    this.rotorScale = options.rotorScale ?? 200.0;
  }

  collectRoleCandidatesFromRobot(robotDef, rolePdutype, pdutypeTable) {
    const robotPdutypes = pdutypeTable.get(robotDef?.pdutypes_id) ?? [];
    const candidates = [];
    const seen = new Set();
    for (const pdu of robotPdutypes) {
      if (pdu?.type !== rolePdutype) continue;
      const pduName = pdu?.name ?? pdu?.org_name;
      if (!pduName) continue;
      if (seen.has(pduName)) continue;
      seen.add(pduName);
      candidates.push(pduName);
    }
    return candidates;
  }

  resolveRoleName(robotDef, roleLabel, rolePdutype, pdutypeTable) {
    const candidates = this.collectRoleCandidatesFromRobot(robotDef, rolePdutype, pdutypeTable);
    if (candidates.length === 0) {
      throw new Error(`[LegacyStateSource] role '${roleLabel}' not found in pdudef for robot='${robotDef?.name}' type='${rolePdutype}'.`);
    }
    if (candidates.length > 1) {
      const preferred = candidates.find((name) => name === roleLabel);
      if (preferred) {
        return preferred;
      }
      throw new Error(`[LegacyStateSource] role '${roleLabel}' is ambiguous in pdudef for robot='${robotDef?.name}' type='${rolePdutype}': ${candidates.join(", ")}`);
    }
    return candidates[0];
  }

  async initialize({ pduDefPath } = {}) {
    if (!this.roleMap?.pos || !this.roleMap?.motor) {
      throw new Error("[LegacyStateSource] roleMap.pos/motor are required.");
    }
    if (!pduDefPath) {
      throw new Error("[LegacyStateSource] pduDefPath is required.");
    }
    const res = await fetch(pduDefPath);
    if (!res.ok) {
      throw new Error(`[LegacyStateSource] failed to load pdudef: ${pduDefPath}`);
    }
    const pdudef = await res.json();
    const compactPdudef = validateCompactPdudef(pdudef, "LegacyStateSource");
    const pdutypeTable = await loadPdutypeTable(compactPdudef, pduDefPath, "LegacyStateSource");
    this.bindingsByDrone.clear();
    for (const robot of compactPdudef.robots) {
      const posPduName = this.resolveRoleName(robot, "pos", this.roleMap.pos, pdutypeTable);
      const motorPduName = this.resolveRoleName(robot, "motor", this.roleMap.motor, pdutypeTable);
      this.bindingsByDrone.set(robot.name, {
        posPduName,
        motorPduName,
      });
    }
    console.log("[LegacyStateSource] role bindings resolved:", this.bindingsByDrone);
  }

  async bindDrone(droneId) {
    this.boundDroneIds.add(droneId);
  }

  readRotorSpeedRadPerSec(pdu, droneName, binding) {
    const bufMotor = pdu.read_pdu_raw_data(droneName, binding.motorPduName);
    if (!bufMotor) return null;
    return this.readRotorSpeedRadPerSecFromBuffer(bufMotor);
  }

  readRotorSpeedRadPerSecFromBuffer(bufMotor) {
    const msg = pduToJs_HakoHilActuatorControls(bufMotor);
    const controls = msg.controls;
    if (!controls || controls.length === 0) return null;
    let sumDuty = 0;
    let count = 0;
    for (const idx of this.motorChannels) {
      if (idx < controls.length) {
        sumDuty += controls[idx];
        count++;
      }
    }
    if (count === 0) return null;
    const avgDuty = sumDuty / count;
    return avgDuty * this.rotorScale;
  }

  buildLegacyState(pdu, droneName, binding) {
    const bufPos = pdu.read_pdu_raw_data(droneName, binding.posPduName);
    const bufMotor = pdu.read_pdu_raw_data(droneName, binding.motorPduName);
    return this.buildLegacyStateFromBuffers(bufPos, bufMotor);
  }

  buildLegacyStateFromBuffers(bufPos, bufMotor = null, rotorSpeedOverride = null) {
    if (!bufPos) {
      return null;
    }
    const twist = pduToJs_Twist(bufPos);
    const rotorSpeed = rotorSpeedOverride ?? (bufMotor ? this.readRotorSpeedRadPerSecFromBuffer(bufMotor) : null);
    return {
      rosPos: [twist.linear.x, twist.linear.y, twist.linear.z],
      rosRpyDeg: [
        rad2deg(twist.angular.x),
        rad2deg(twist.angular.y),
        rad2deg(twist.angular.z),
      ],
      rotorSpeedRadPerSec: rotorSpeed ?? 0,
    };
  }

  async update() {
    await Hakoniwa.withPdu(async (pdu) => {
      for (const droneId of this.boundDroneIds) {
        const binding = this.bindingsByDrone.get(droneId);
        if (!binding) continue;
        const state = this.buildLegacyState(pdu, droneId, binding);
        if (!state) continue;
        this.stateByDrone.set(droneId, state);
      }
    });
  }

  getState(droneId) {
    const s = this.stateByDrone.get(droneId);
    if (!s) return null;
    return {
      rosPos: [...s.rosPos],
      rosRpyDeg: [...s.rosRpyDeg],
      rotorSpeedRadPerSec: s.rotorSpeedRadPerSec,
    };
  }

  async dispose() {
    this.boundDroneIds.clear();
    this.stateByDrone.clear();
  }
}
