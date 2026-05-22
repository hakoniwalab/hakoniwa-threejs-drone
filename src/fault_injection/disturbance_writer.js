import { Hakoniwa } from "../hakoniwa/hakoniwa-pdu.js";
import { jsToPdu_Disturbance } from "../../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/hako_msgs/pdu_conv_Disturbance.js";
import { Disturbance } from "../../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/hako_msgs/pdu_jstype_Disturbance.js";
import { DisturbanceUserCustom } from "../../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/hako_msgs/pdu_jstype_DisturbanceUserCustom.js";

const DISTURBANCE_USER_CUSTOM_SLOT_GPS = 0;
const DISTURBANCE_USER_CUSTOM_SLOT_ROTOR_FAULT = 1;

function clampScale(value, fallback = 1.0) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    return fallback;
  }
  return Math.max(0.0, Math.min(1.0, num));
}

export class DisturbanceWriter {
  constructor({ robotName = "Drone", pduName = "disturb", defaultScale = 1.0 } = {}) {
    this.robotName = robotName;
    this.pduName = pduName;
    this.defaultScale = defaultScale;
  }

  buildMessage(rotorScales = []) {
    const disturbance = new Disturbance();

    // Slot 0 is reserved by the drone-side contract for existing custom inputs.
    disturbance.d_user_custom[DISTURBANCE_USER_CUSTOM_SLOT_GPS] = new DisturbanceUserCustom();

    const rotorFault = new DisturbanceUserCustom();
    rotorFault.data = rotorScales.map((scale) => clampScale(scale, this.defaultScale));
    disturbance.d_user_custom[DISTURBANCE_USER_CUSTOM_SLOT_ROTOR_FAULT] = rotorFault;
    return disturbance;
  }

  async write(rotorScales = []) {
    const disturbance = this.buildMessage(rotorScales);
    const raw = jsToPdu_Disturbance(disturbance);
    return await Hakoniwa.withPdu(async (pdu) => {
      return await pdu.flush_pdu_raw_data(this.robotName, this.pduName, raw);
    });
  }
}
