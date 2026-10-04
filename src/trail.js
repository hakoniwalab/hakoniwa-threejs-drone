// Actual tracks of the Drones and vehicles, drawn over the scene on request.
//
// The viewer records where each Drone and vehicle has been (a point whenever
// it has moved MIN_STEP_M since the last one) whether or not the tracks show,
// so switching them on shows the whole run so far. Drones are red, vehicles
// orange: next to the planned paths (blue, flight_path.js) the difference is
// what the physics did (wind, inertia, a collision). The lines are a few
// pixels wide (fat_line.js) and redrawn at most every REDRAW_SEC.

import * as THREE from "three";
import { disposeFatLine, makeFatLine, setFatLinePoints } from "./fat_line.js";

const MIN_STEP_M = 0.2;
// A step this long between two samples is not a move but a jump: the viewer
// placing a Drone or vehicle where it starts (it is drawn somewhere else
// before its first state arrives) or a reset. The track starts again there.
const JUMP_M = 5.0;
const MAX_POINTS = 20000;  // per entity; the older half is dropped after that
const REDRAW_SEC = 0.3;
const WIDTH_PX = 4;
const COLORS = { drone: 0xe53935, vehicle: 0xff8f00 };

class Track {
  constructor(kind) {
    this.points = [];
    this.line = makeFatLine([], COLORS[kind] ?? COLORS.vehicle, WIDTH_PX);
    this.line.renderOrder = 6;
    this.dirty = false;
  }

  add(point) {
    const last = this.points[this.points.length - 1];
    if (last && last.distanceTo(point) < MIN_STEP_M) return;
    if (last && last.distanceTo(point) > JUMP_M) this.points = [];
    if (this.points.length >= MAX_POINTS) this.points = this.points.slice(MAX_POINTS / 2);
    this.points.push(point.clone());
    this.dirty = true;
  }

  redraw() {
    if (!this.dirty) return;
    setFatLinePoints(this.line, this.points);
    this.dirty = false;
  }
}

export class TrailRecorder {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = "trails";
    this.group.visible = false;
    this.tracks = new Map();
    this.scratch = new THREE.Vector3();
    this.lastRedraw = 0;
  }

  // entities: [{key, kind: "drone" | "vehicle", entity}] with getWorldPosition(target).
  update(entities) {
    for (const { key, kind, entity } of entities) {
      if (typeof entity?.getWorldPosition !== "function") continue;
      let point;
      try {
        point = entity.getWorldPosition(this.scratch);
      } catch {
        continue;  // not loaded yet
      }
      if (!point || !Number.isFinite(point.x)) continue;
      let track = this.tracks.get(key);
      if (!track) {
        track = new Track(kind);
        this.tracks.set(key, track);
        this.group.add(track.line);
      }
      track.add(point);
    }
    const now = performance.now() / 1000;
    if (this.group.visible && now - this.lastRedraw >= REDRAW_SEC) {
      this.lastRedraw = now;
      for (const track of this.tracks.values()) track.redraw();
    }
  }

  setVisible(enabled) {
    this.group.visible = !!enabled;
    if (this.group.visible) {
      for (const track of this.tracks.values()) track.redraw();
    }
    return this.group.visible;
  }

  clear() {
    for (const track of this.tracks.values()) {
      this.group.remove(track.line);
      disposeFatLine(track.line);
    }
    this.tracks.clear();
  }
}
