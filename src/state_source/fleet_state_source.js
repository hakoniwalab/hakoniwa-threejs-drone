import { IStateSource } from "./i_state_source.js";
import { Hakoniwa } from "../hakoniwa/hakoniwa-pdu.js";
import { pduToJs_DroneVisualStateArray } from "../../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/hako_msgs/pdu_conv_DroneVisualStateArray.js";
import { validateCompactPdudef, loadPdutypeTable, collectChannelsByPdutype } from "./compact_pdudef_loader.js";

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
    const compactPdudef = validateCompactPdudef(pdudef, "FleetStateSource");
    const pdutypeTable = await loadPdutypeTable(compactPdudef, pduDefPath, "FleetStateSource");
    const channels = collectChannelsByPdutype(compactPdudef.robots, visualStatePdutype, pdutypeTable);
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

  isFiniteVisualState(vs) {
    if (!vs) return false;
    const values = [vs.x, vs.y, vs.z, vs.roll, vs.pitch, vs.yaw];
    return values.every((value) => Number.isFinite(value));
  }

  applyPacket(packet) {
    const sequenceId = packet?.sequence_id ?? 0;
    if (!Number.isFinite(sequenceId) || sequenceId === 0) {
      return;
    }
    const drones = Array.isArray(packet?.drones) ? packet.drones : [];
    const rawValidCount = packet?.valid_count ?? drones.length;
    const validCount = Number.isFinite(rawValidCount)
      ? Math.max(0, Math.min(rawValidCount, drones.length))
      : 0;
    const rawStartIndex = packet?.start_index ?? 0;
    if (!Number.isFinite(rawStartIndex) || rawStartIndex < 0) {
      return;
    }
    const startIndex = Math.trunc(rawStartIndex);

    for (let i = 0; i < validCount; i++) {
      const droneIndex = startIndex + i;
      if (droneIndex < 0 || droneIndex >= this.boundDroneIds.length) continue;
      const droneId = this.boundDroneIds[droneIndex];
      if (!droneId) continue;
      if (!this.isFiniteVisualState(drones[i])) continue;
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
