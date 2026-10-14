// The scenario panel (viewerConfig.scenarioPanel): a start button that writes
// a command to the simulation and a list of the events it reports. With
// variants ([{id, label}]) a selector picks one and the start command
// carries it ("start:<id>:<nonce>"). With hudVehicle, a HUD over the main
// view shows that vehicle's speed and the ACC's state (its "acc" events).
//
// Both PDUs are std_msgs/String (128 bytes). The command is a word ("start");
// the events come one line at a time, "seq|hako_s|scenario_s|kind|name|state",
// and the panel keeps the lines it has seen (a new seq is a new line).
import { Hakoniwa } from "./hakoniwa/hakoniwa-pdu.js";
import { jsToPdu_String, pduToJs_String } from "../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/std_msgs/pdu_conv_String.js";
import { String as PduString } from "../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/std_msgs/pdu_jstype_String.js";

export function validateScenarioPanel(panel) {
  if (panel == null) return;
  for (const key of ["robotName", "commandPdu", "eventsPdu"]) {
    if (typeof panel[key] !== "string" || panel[key].length === 0) {
      throw new Error(`[DroneViewer] scenarioPanel.${key} must be a non-empty string.`);
    }
  }
  if (panel.variants != null && (!Array.isArray(panel.variants)
      || panel.variants.some((v) => typeof v?.id !== "string" || !/^[A-Za-z0-9_-]+$/.test(v.id)))) {
    throw new Error("[DroneViewer] scenarioPanel.variants must be [{id, label}] with ids of letters, digits, - and _.");
  }
}

export function parseEventLine(text) {
  const fields = String(text ?? "").split("|");
  if (fields.length < 6) return null;
  const [seq, hako, scenario, kind, name, state] = fields;
  const sequence = Number(seq);
  if (!Number.isInteger(sequence)) return null;
  return { sequence, hakoSec: Number(hako), scenarioSec: Number(scenario), kind, name, state };
}

export class ScenarioPanel {
  constructor({ robotName, commandPdu, eventsPdu }) {
    this.robotName = robotName;
    this.commandPdu = commandPdu;
    this.eventsPdu = eventsPdu;
    this.events = [];
    this.lastSequence = 0;
  }

  async attach() {
    await Hakoniwa.withPdu(async (pdu) => {
      await pdu.declare_pdu_for_read(this.robotName, this.eventsPdu);
      await pdu.declare_pdu_for_write(this.robotName, this.commandPdu);
    });
  }

  async sendCommand(word) {
    const message = new PduString();
    message.data = word;
    return await Hakoniwa.withPdu(async (pdu) =>
      pdu.flush_pdu_raw_data(this.robotName, this.commandPdu, jsToPdu_String(message)));
  }

  /** Reads the latest event line; returns true when a new one arrived. */
  poll() {
    let added = false;
    Hakoniwa.withPdu((pdu) => {
      const raw = pdu.read_pdu_raw_data(this.robotName, this.eventsPdu);
      if (!raw) return;
      let event = null;
      try {
        event = parseEventLine(pduToJs_String(raw).data);
      } catch {
        return;
      }
      if (!event || event.sequence === this.lastSequence) return;
      if (event.sequence < this.lastSequence) this.events = [];  // the simulation restarted
      this.lastSequence = event.sequence;
      this.events.push(event);
      added = true;
    });
    return added;
  }

  /** The state of the run from the last status line: waiting, running or completed (as the Drone Show control). */
  status() {
    const last = [...this.events].reverse().find((event) => event.kind === "status");
    if (!last) return this.events.length ? "running" : "waiting";
    if (last.state === "waiting" && this.events.at(-1) !== last) return "running";
    return last.state;
  }
}
