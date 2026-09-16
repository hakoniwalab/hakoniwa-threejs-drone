import { Hakoniwa } from "../hakoniwa/hakoniwa-pdu.js";
import { pduToJs_JointState } from "../../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/sensor_msgs/pdu_conv_JointState.js";
import { pduToJs_MultiDOFJointState } from "../../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/sensor_msgs/pdu_conv_MultiDOFJointState.js";
import { validateCompactPdudef, loadPdutypeTable, collectChannelsByPdutype } from "./compact_pdudef_loader.js";

export class VehicleStateSource {
  constructor(config = {}) {
    this.config = config;
    this.poseChannels = [];
    this.jointChannels = [];
    this.states = new Map();
    this.declared = false;
    this.lastInvalidPacketWarningMsec = 0;
  }

  async initialize({ pduDefPath } = {}) {
    const roleMap = this.config.roleMap ?? {};
    if (!roleMap.vehicle_states || !roleMap.joint_states) {
      throw new Error("[VehicleStateSource] vehicle_states and joint_states roles are required.");
    }
    const response = await fetch(pduDefPath);
    if (!response.ok) throw new Error(`[VehicleStateSource] failed to load pdudef: ${pduDefPath}`);
    const pdudef = validateCompactPdudef(await response.json(), "VehicleStateSource");
    const table = await loadPdutypeTable(pdudef, pduDefPath, "VehicleStateSource");
    this.poseChannels = collectChannelsByPdutype(pdudef.robots, roleMap.vehicle_states, table);
    this.jointChannels = collectChannelsByPdutype(pdudef.robots, roleMap.joint_states, table);
    if (this.poseChannels.length === 0 || this.jointChannels.length === 0) {
      throw new Error("[VehicleStateSource] required UrbanFleet state channels were not found.");
    }
    await Hakoniwa.withPdu(async (pdu) => {
      for (const channel of [...this.poseChannels, ...this.jointChannels]) {
        await pdu.declare_pdu_for_read(channel.robotName, channel.pduName);
      }
    });
    this.declared = true;
  }

  updatePosePacket(packet) {
    const names = packet?.joint_names ?? [];
    const transforms = packet?.transforms ?? [];
    for (let index = 0; index < Math.min(names.length, transforms.length); index += 1) {
      const name = names[index];
      if (!name) continue;
      const state = this.states.get(name) ?? { joints: {} };
      state.transform = transforms[index];
      this.states.set(name, state);
    }
  }

  updateJointPacket(packet) {
    const names = packet?.name ?? [];
    const positions = packet?.position ?? [];
    for (let index = 0; index < Math.min(names.length, positions.length); index += 1) {
      const qualified = names[index];
      const slash = qualified.indexOf("/");
      if (slash <= 0) continue;
      const vehicleName = qualified.slice(0, slash);
      const jointName = qualified.slice(slash + 1);
      const state = this.states.get(vehicleName) ?? { joints: {} };
      state.joints[jointName] = positions[index];
      this.states.set(vehicleName, state);
    }
  }

  async update() {
    Hakoniwa.withPdu((pdu) => {
      for (const channel of this.poseChannels) {
        const raw = pdu.read_pdu_raw_data(channel.robotName, channel.pduName);
        if (raw) this.decodePacket(
          channel,
          () => this.updatePosePacket(pduToJs_MultiDOFJointState(raw)),
        );
      }
      for (const channel of this.jointChannels) {
        const raw = pdu.read_pdu_raw_data(channel.robotName, channel.pduName);
        if (raw) this.decodePacket(
          channel,
          () => this.updateJointPacket(pduToJs_JointState(raw)),
        );
      }
    });
  }

  decodePacket(channel, decode) {
    try {
      decode();
    } catch (error) {
      const message = String(error?.message ?? error);
      if (!message.includes("MetaData not found or corrupted")) throw error;
      const now = Date.now();
      if (now - this.lastInvalidPacketWarningMsec >= 5000) {
        console.warn(
          `[VehicleStateSource] skipped an incomplete state packet on ${channel.robotName}/${channel.pduName}`,
        );
        this.lastInvalidPacketWarningMsec = now;
      }
    }
  }

  getState(vehicleId) {
    return this.states.get(vehicleId) ?? null;
  }

  async dispose() {
    this.states.clear();
    this.declared = false;
  }
}
