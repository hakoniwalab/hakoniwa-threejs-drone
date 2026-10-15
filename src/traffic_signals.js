// Traffic signal lamps from the simulation (hakoniwa-scenario M3-2). esmini runs the signals;
// the scenario asset writes each signal's lamps to its own PDU, std_msgs/UInt32 with bit i =
// lamp i from the top lit. This lights the lamps of the world part named
// "signal-<road>-<id>" (Environment Studio's traffic signal, placed from OpenDRIVE): its
// lamps are the parts coloured red, yellow and green, ordered from the top. Nothing decides
// a signal here.
//
// viewerConfig.scenarioPanel.signalPdus: {"<signal id>": "<pdu name>"} on robotName.
import * as THREE from "three";
import { Hakoniwa } from "./hakoniwa/hakoniwa-pdu.js";
import { pduToJs_UInt32 } from "../thirdparty/hakoniwa-pdu-javascript/src/pdu_msgs/std_msgs/pdu_conv_UInt32.js";

const LIT_INTENSITY = 2.0;
const DIM = 0.18;

/** A lamp is a mesh coloured clearly red, yellow or green (the traffic signal's lamp parts). */
function isLamp(mesh) {
  const color = mesh.material?.color;
  if (!mesh.isMesh || !color) return false;
  // In sRGB, as the parts were coloured (#e53935, #fbc02d, #43a047): hues near 0, 0.12, 0.35.
  const { h, s, l } = color.getHSL({}, THREE.SRGBColorSpace);
  return s > 0.5 && l > 0.15 && (h < 0.05 || h > 0.95 || (h > 0.08 && h < 0.2) || (h > 0.25 && h < 0.45));
}

export class TrafficSignals {
  constructor({ robotName, signalPdus }, findSceneObjects) {
    this.robotName = robotName;
    this.signalPdus = signalPdus ?? {};
    this.findSceneObjects = findSceneObjects;
    this.lamps = new Map();   // signal id -> [{mesh, color}] from the top
    this.bits = new Map();    // signal id -> the last lamp bits shown
  }

  async attach() {
    await Hakoniwa.withPdu(async (pdu) => {
      for (const name of Object.values(this.signalPdus)) await pdu.declare_pdu_for_read(this.robotName, name);
    });
  }

  lampsOf(id) {
    if (this.lamps.has(id)) return this.lamps.get(id);
    const suffix = `-${id}`;
    const meshes = [];
    for (const part of this.findSceneObjects((name) => name.startsWith("signal-") && name.endsWith(suffix))) {
      part.traverse((object) => { if (isLamp(object)) meshes.push(object); });
    }
    if (!meshes.length) return [];  // the world is not loaded yet: look again next time
    // The lamps' height: the centre of each part's world bounding box (the parts share one
    // origin; their vertices carry the positions).
    const centre = new THREE.Vector3();
    const lamps = meshes.map((mesh) => {
      mesh.material = mesh.material.clone();  // only this signal's lamp changes
      const y = new THREE.Box3().setFromObject(mesh).getCenter(centre).y;
      return { mesh, color: mesh.material.color.clone(), y };
    }).sort((a, b) => b.y - a.y);
    this.lamps.set(id, lamps);
    return lamps;
  }

  show(id, bits) {
    const lamps = this.lampsOf(id);
    if (!lamps.length) return false;
    lamps.forEach(({ mesh, color }, index) => {
      const lit = (bits >> index) & 1;
      mesh.material.color.copy(color).multiplyScalar(lit ? 1.0 : DIM);
      if (mesh.material.emissive) {
        mesh.material.emissive.copy(lit ? color : new THREE.Color(0, 0, 0));
        mesh.material.emissiveIntensity = lit ? LIT_INTENSITY : 0;
      }
    });
    return true;
  }

  poll() {
    Hakoniwa.withPdu((pdu) => {
      for (const [id, name] of Object.entries(this.signalPdus)) {
        const raw = pdu.read_pdu_raw_data(this.robotName, name);
        if (!raw) continue;
        let bits;
        try {
          bits = pduToJs_UInt32(raw).data >>> 0;
        } catch {
          continue;
        }
        if (this.bits.get(id) === bits) continue;
        if (this.show(id, bits)) this.bits.set(id, bits);
      }
    });
  }
}
