// Actual tracks of the Drones and vehicles, drawn over the scene on request.
//
// The viewer records where each Drone and vehicle has been (a point whenever
// it has moved MIN_STEP_M since the last one) whether or not the tracks show,
// so switching them on shows the whole run so far. Drones are red, vehicles
// orange: next to the planned paths (blue, flight_path.js) the difference is
// what the physics did (wind, inertia, a collision). The lines are a few
// pixels wide (fat_line.js) and redrawn at most every REDRAW_SEC.
//
// pin() keeps the current tracks as "pinned" ones (green, for drones and
// vehicles alike) and starts the live ones afresh, so a second run (a what-if
// scenario) can be compared with the first in one view. Pinned tracks show
// whenever the tracks show, and are kept in localStorage per scene (see
// pinnedTrailsStorageKey) so a page reload or a simulation restart keeps them.

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
const PINNED_COLOR = 0x43a047;
const PINNED_WIDTH_PX = 3;
const MAX_PINNED_TRACKS = 200;  // the oldest pinned tracks are dropped after that
const STORAGE_PREFIX = "hakoniwa.pinnedTrails:";
const STORAGE_VERSION = 1;

/**
 * The localStorage key for the pinned tracks of a scene: the viewer config's
 * identity from the query (viewerConfigPath, else viewerConfigName), falling
 * back to the page path.
 */
export function pinnedTrailsStorageKey(search = "", pathname = "/") {
  let identity = null;
  try {
    const params = new URLSearchParams(search ?? "");
    identity = params.get("viewerConfigPath") || params.get("viewerConfigName");
  } catch {
    identity = null;
  }
  return `${STORAGE_PREFIX}${identity && identity.trim() ? identity.trim() : (pathname || "/")}`;
}

function getStorage() {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;  // blocked site data
  }
}

class Track {
  constructor(kind) {
    this.kind = kind;
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

// A kept track: drawn once, never updated.
class PinnedTrack {
  constructor(key, kind, points) {
    this.key = key;
    this.kind = kind;
    this.points = points.slice(-MAX_POINTS);
    this.line = makeFatLine(this.points, PINNED_COLOR, PINNED_WIDTH_PX);
    this.line.renderOrder = 5;  // under the live tracks
  }
}

export class TrailRecorder {
  // options.storageKey: where the pinned tracks are kept (null: not kept).
  constructor(options = {}) {
    this.group = new THREE.Group();
    this.group.name = "trails";
    this.group.visible = false;
    this.tracks = new Map();
    this.pinned = [];
    this.storageKey = options.storageKey ?? null;
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

  /** Keep every current track (green) and start the live ones afresh; returns how many were kept. */
  pin() {
    let count = 0;
    for (const [key, track] of this.tracks) {
      if (track.points.length < 2) continue;
      this.addPinned(key, track.kind, track.points);
      count += 1;
    }
    this.clear();
    if (count > 0) this.savePinned();
    return count;
  }

  /** Remove the kept tracks (and their stored copy). */
  clearPinned() {
    for (const pinned of this.pinned) {
      this.group.remove(pinned.line);
      disposeFatLine(pinned.line);
    }
    this.pinned = [];
    const storage = getStorage();
    if (!storage || !this.storageKey) return;
    try {
      storage.removeItem(this.storageKey);
    } catch {
      // the viewer works without storage
    }
  }

  /** Draw the tracks kept by an earlier page (localStorage); returns how many. */
  restorePinned() {
    const storage = getStorage();
    if (!storage || !this.storageKey) return 0;
    let data;
    try {
      data = JSON.parse(storage.getItem(this.storageKey) ?? "null");
    } catch {
      return 0;
    }
    if (data?.version !== STORAGE_VERSION || !Array.isArray(data.tracks)) return 0;
    let count = 0;
    for (const item of data.tracks) {
      const flat = Array.isArray(item?.p) ? item.p : [];
      const points = [];
      for (let i = 0; i + 2 < flat.length; i += 3) {
        const [x, y, z] = [flat[i], flat[i + 1], flat[i + 2]];
        if (![x, y, z].every(Number.isFinite)) continue;
        points.push(new THREE.Vector3(x / 100, y / 100, z / 100));
      }
      if (points.length < 2) continue;
      this.addPinned(String(item.key ?? ""), item.kind === "drone" ? "drone" : "vehicle", points);
      count += 1;
    }
    return count;
  }

  addPinned(key, kind, points) {
    const pinned = new PinnedTrack(key, kind, points);
    this.pinned.push(pinned);
    this.group.add(pinned.line);
    while (this.pinned.length > MAX_PINNED_TRACKS) {
      const oldest = this.pinned.shift();
      this.group.remove(oldest.line);
      disposeFatLine(oldest.line);
    }
  }

  // Points in centimetres (rounded) to keep the stored copy small.
  savePinned() {
    const storage = getStorage();
    if (!storage || !this.storageKey) return false;
    const encode = (points) => {
      let kept = points;
      while (kept.length > MAX_POINTS) kept = kept.slice(kept.length - MAX_POINTS / 2);
      const flat = new Array(kept.length * 3);
      kept.forEach((point, index) => {
        flat[index * 3] = Math.round(point.x * 100);
        flat[index * 3 + 1] = Math.round(point.y * 100);
        flat[index * 3 + 2] = Math.round(point.z * 100);
      });
      return flat;
    };
    const data = {
      version: STORAGE_VERSION,
      tracks: this.pinned.map((pinned) => ({ key: pinned.key, kind: pinned.kind, p: encode(pinned.points) })),
    };
    try {
      storage.setItem(this.storageKey, JSON.stringify(data));
      return true;
    } catch (e) {
      console.warn("[TrailRecorder] could not keep the pinned trails:", e);
      return false;
    }
  }
}
