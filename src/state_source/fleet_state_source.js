import { IStateSource } from "./i_state_source.js";
import { Hakoniwa } from "../hakoniwa/hakoniwa-pdu.js";
import { pduToJs_DroneVisualStateArray } from "../../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/hako_msgs/pdu_conv_DroneVisualStateArray.js";

const RAD2DEG = 180.0 / Math.PI;

export class FleetStateSource extends IStateSource {
  constructor(roleMap = {}, options = {}) {
    super();
    this.roleMap = roleMap;
    this.motorChannels = options.motorChannels ?? [0, 1, 2, 3];
    this.rotorScale = options.rotorScale ?? 200.0;
    this.boundDroneIds = [];
    this.stateByDrone = new Map();
    this.visualStateChannels = [];
    this.declared = false;
  }

  validateCompactPdudef(pdudef) {
    const robots = Array.isArray(pdudef?.robots) ? pdudef.robots : [];
    const paths = Array.isArray(pdudef?.paths) ? pdudef.paths : [];
    if (robots.length === 0) {
      throw new Error("[FleetStateSource] compact pdudef validation failed: robots[] is required.");
    }
    if (paths.length === 0) {
      throw new Error("[FleetStateSource] compact pdudef validation failed: paths[] is required.");
    }
    const pathIdSet = new Set(paths.map((p) => p?.id).filter(Boolean));
    for (const robot of robots) {
      if (!robot?.name) {
        throw new Error("[FleetStateSource] compact pdudef validation failed: robots[].name is required.");
      }
      if (!robot?.pdutypes_id) {
        throw new Error(`[FleetStateSource] compact pdudef validation failed: robot='${robot.name}' requires pdutypes_id.`);
      }
      if (!pathIdSet.has(robot.pdutypes_id)) {
        throw new Error(`[FleetStateSource] compact pdudef validation failed: unknown pdutypes_id='${robot.pdutypes_id}' for robot='${robot.name}'.`);
      }
    }
    return { robots, paths };
  }

  async loadPdutypeTable(compactPdudef, pdudefUrl) {
    const table = new Map();
    for (const pathDef of compactPdudef.paths) {
      const pathId = pathDef?.id;
      const relPath = pathDef?.path;
      if (!pathId || !relPath) {
        throw new Error("[FleetStateSource] compact pdudef paths[] requires id/path.");
      }
      const resolvedUrl = new URL(relPath, pdudefUrl).toString();
      const res = await fetch(resolvedUrl);
      if (!res.ok) {
        throw new Error(`[FleetStateSource] failed to load pdutypes: ${resolvedUrl}`);
      }
      const pdutypes = await res.json();
      if (!Array.isArray(pdutypes)) {
        throw new Error(`[FleetStateSource] invalid pdutypes format: ${resolvedUrl}`);
      }
      table.set(pathId, pdutypes);
    }
    return table;
  }

  collectChannelsByPdutype(robots, pdutype, pdutypeTable) {
    const channels = [];
    for (const robot of robots) {
      const robotName = robot.name;
      const pdutypes = pdutypeTable.get(robot.pdutypes_id) ?? [];
      for (const pdu of pdutypes) {
        if (pdu?.type !== pdutype) continue;
        const pduName = pdu?.name ?? pdu?.org_name;
        if (!pduName) continue;
        channels.push({
          robotName,
          pduName,
        });
      }
    }
    return channels;
  }

  async initialize({ pduDefPath } = {}) {
    const visualStatePdutype = this.roleMap?.visual_state_array;
    if (!visualStatePdutype) {
      throw new Error("[FleetStateSource] roleMap.visual_state_array is required.");
    }
    if (!pduDefPath) {
      throw new Error("[FleetStateSource] pduDefPath is required.");
    }
    const res = await fetch(pduDefPath);
    if (!res.ok) {
      throw new Error(`[FleetStateSource] failed to load pdudef: ${pduDefPath}`);
    }
    const pdudef = await res.json();
    const compactPdudef = this.validateCompactPdudef(pdudef);
    const pdutypeTable = await this.loadPdutypeTable(compactPdudef, pduDefPath);
    const channels = this.collectChannelsByPdutype(compactPdudef.robots, visualStatePdutype, pdutypeTable);
    if (channels.length === 0) {
      throw new Error(`[FleetStateSource] no channel found for pdutype='${visualStatePdutype}'.`);
    }
    const uniq = new Map();
    for (const c of channels) {
      uniq.set(`${c.robotName}/${c.pduName}`, c);
    }
    this.visualStateChannels = Array.from(uniq.values());
    console.log("[FleetStateSource] visual_state_array channels:", this.visualStateChannels);
  }

  async bindDrone(droneId) {
    if (!this.boundDroneIds.includes(droneId)) {
      this.boundDroneIds.push(droneId);
    }
    if (this.declared) return;
    await Hakoniwa.withPdu(async (pdu) => {
      for (const ch of this.visualStateChannels) {
        await pdu.declare_pdu_for_read(ch.robotName, ch.pduName);
      }
    });
    this.declared = true;
  }

  toRotorSpeedRadPerSec(pwmDutyArray) {
    if (!Array.isArray(pwmDutyArray) || pwmDutyArray.length === 0) {
      return 0;
    }
    let sum = 0;
    let count = 0;
    for (const idx of this.motorChannels) {
      if (idx < pwmDutyArray.length) {
        sum += pwmDutyArray[idx];
        count++;
      }
    }
    if (count === 0) return 0;
    return (sum / count) * this.rotorScale;
  }

  convertVisualState(vs) {
    return {
      rosPos: [vs.x, vs.y, vs.z],
      rosRpyDeg: [
        vs.roll * RAD2DEG,
        vs.pitch * RAD2DEG,
        vs.yaw * RAD2DEG,
      ],
      rotorSpeedRadPerSec: this.toRotorSpeedRadPerSec(vs.pwm_duty),
    };
  }

  applyPacket(packet) {
    const drones = Array.isArray(packet?.drones) ? packet.drones : [];
    const validCount = Math.min(packet?.valid_count ?? drones.length, drones.length);
    const startIndex = packet?.start_index ?? 0;
    for (let i = 0; i < validCount; i++) {
      const droneIndex = startIndex + i;
      const droneId = this.boundDroneIds[droneIndex];
      if (!droneId) continue;
      const state = this.convertVisualState(drones[i]);
      this.stateByDrone.set(droneId, state);
    }
  }

  async update() {
    Hakoniwa.withPdu((pdu) => {
      for (const ch of this.visualStateChannels) {
        const buf = pdu.read_pdu_raw_data(ch.robotName, ch.pduName);
        if (!buf) continue;
        const packet = pduToJs_DroneVisualStateArray(buf);
        this.applyPacket(packet);
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
    this.boundDroneIds = [];
    this.stateByDrone.clear();
    this.declared = false;
  }
}
