// Planned paths drawn over the scene: Drone flight paths (viewerConfig.flightPaths)
// and the routes vehicles drive (viewerConfig.routePaths).
//
// Each path is the line a Drone's schedule flies, from its takeoff to its
// landing: [{east_m, north_m, up_m, kind, label, stand?, again?}] in Urban ENU
// metres, kind "takeoff" | "waypoint" | "land". The scene frame is X = East,
// Y = Up, Z = -North (ROS (x, y, z) -> (-y, z, -x), as the Drones are drawn).
// The line is blue; each point is a ball (takeoff green, landing orange), and
// T, L and the waypoint numbers are labels that face the camera. A path's
// optional zones (wind, rotor fault) are see-through boxes along it.

import * as THREE from "three";
import { makeFatLine } from "./fat_line.js";

const KIND_COLORS = { takeoff: "#2e9d4f", waypoint: "#2e7dd7", land: "#d0572a" };
const ROUTE_COLOR = 0x4fc3f7;  // vehicle routes: lighter than the Drones' blue
// A route whose points carry road_friction is coloured by it, grippy to
// slippery (the guideline bands of hakoniwa-urban-mobility
// docs/asset-contract.md 4.4; the Studio's web/friction.js uses the same).
const FRICTION_BANDS = [
  { min: 0.7, color: 0x43a047 },   // dry
  { min: 0.35, color: 0xfdd835 },  // wet
  { min: 0.15, color: 0xfb8c00 },  // snow
  { min: 0, color: 0x8e24aa },     // ice
];

function frictionColor(value) {
  if (!Number.isFinite(value)) return ROUTE_COLOR;
  return FRICTION_BANDS.find((band) => value >= band.min).color;
}
const WIDTH_PX = 3;  // the planned lines (the actual tracks are 4 px, trail.js)

const toScene = (point) => new THREE.Vector3(point.east_m, point.up_m, -point.north_m);

// A round badge with text that always faces the camera.
function labelSprite(text, color) {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  context.fillStyle = color;
  context.beginPath();
  context.arc(32, 32, 28, 0, Math.PI * 2);
  context.fill();
  context.lineWidth = 4;
  context.strokeStyle = "#ffffff";
  context.stroke();
  context.fillStyle = "#ffffff";
  context.font = "bold 30px sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(text), 32, 34);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(1.4, 1.4, 1);
  sprite.renderOrder = 10;
  return sprite;
}

export function validateFlightPaths(paths) {
  if (!Array.isArray(paths)) {
    throw new Error("[DroneViewer] flightPaths must be an array.");
  }
  for (const path of paths) {
    if (!Array.isArray(path?.points) || path.points.some((point) =>
      !["east_m", "north_m", "up_m"].every((key) => Number.isFinite(point?.[key])))) {
      throw new Error("[DroneViewer] flightPaths[].points must be [{east_m, north_m, up_m, ...}].");
    }
    if (path.zones !== undefined) validateZones(path.zones);
  }
}

// flightPaths[].zones: [{label?, corners: 8 x [east_m, north_m, up_m], wind?: {towards_deg,
// speed_m_s}, fault?: {rotors, scale}}], wind or fault (or both) on each.
function validateZones(zones) {
  if (!Array.isArray(zones)) {
    throw new Error("[DroneViewer] flightPaths[].zones must be an array.");
  }
  for (const zone of zones) {
    if (!Array.isArray(zone?.corners) || zone.corners.length !== 8 || zone.corners.some((corner) =>
      !Array.isArray(corner) || corner.length !== 3 || !corner.every(Number.isFinite))) {
      throw new Error("[DroneViewer] flightPaths[].zones[].corners must be 8 [east_m, north_m, up_m] points.");
    }
    if (zone.wind === undefined && zone.fault === undefined) {
      throw new Error("[DroneViewer] flightPaths[].zones[] needs wind or fault.");
    }
    if (zone.wind !== undefined && !(Number.isFinite(zone.wind?.towards_deg) && Number.isFinite(zone.wind?.speed_m_s))) {
      throw new Error("[DroneViewer] flightPaths[].zones[].wind must be {towards_deg, speed_m_s}.");
    }
    if (zone.fault !== undefined && !(Array.isArray(zone.fault?.rotors)
      && zone.fault.rotors.every((rotor) => Number.isInteger(rotor) && rotor >= 0)
      && Number.isFinite(zone.fault.scale))) {
      throw new Error("[DroneViewer] flightPaths[].zones[].fault must be {rotors: [index, ...], scale}.");
    }
  }
}

// routePaths: [{route, vehicles, closed, points: [{east_m, north_m, up_m, road_friction?, road_width_m?}]}],
// the points dense enough to follow the ground (bridges, slopes) between
// waypoints; road_friction is the road's friction from that point on, in a
// band road_width_m wide (drawn see-through in the friction's colour).
export function validateRoutePaths(routes) {
  if (!Array.isArray(routes)) {
    throw new Error("[DroneViewer] routePaths must be an array.");
  }
  for (const route of routes) {
    if (!Array.isArray(route?.points) || route.points.some((point) =>
      !["east_m", "north_m", "up_m"].every((key) => Number.isFinite(point?.[key])))) {
      throw new Error("[DroneViewer] routePaths[].points must be [{east_m, north_m, up_m}].");
    }
  }
}

// Where a route's road friction holds: a see-through band road_width_m wide
// along the samples that carry road_friction, in its colour (one mesh per
// colour), a little under the line.
function addFrictionBands(group, samples) {
  const quads = new Map();  // colour -> positions
  for (let index = 0; index + 1 < samples.length; index += 1) {
    const point = samples[index];
    if (!Number.isFinite(point.road_friction) || !Number.isFinite(point.road_width_m)) continue;
    const a = toScene(point);
    const b = toScene(samples[index + 1]);
    const along = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
    if (along.lengthSq() < 1e-9) continue;
    const side = new THREE.Vector3(-along.z, 0, along.x).normalize().multiplyScalar(point.road_width_m / 2);
    const color = frictionColor(point.road_friction);
    const positions = quads.get(color) ?? [];
    const ya = a.y - 0.2;
    const yb = b.y - 0.2;
    const corners = [
      [a.x + side.x, ya, a.z + side.z], [a.x - side.x, ya, a.z - side.z],
      [b.x + side.x, yb, b.z + side.z], [b.x - side.x, yb, b.z - side.z],
    ];
    for (const corner of [0, 1, 2, 1, 3, 2]) positions.push(...corners[corner]);
    quads.set(color, positions);
  }
  for (const [color, positions] of quads) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false,
    }));
    mesh.renderOrder = 4;
    group.add(mesh);
  }
}

// Event zones along a flight path (flightPaths[].zones): a see-through box
// with its 12 edges, cyan where the wind blows, red where rotors fail (red
// wins when both). corners 0-3 are the bottom face in order (a-left, a-right,
// b-right, b-left), 4-7 the top face above them. Wind gets a horizontal arrow
// through the box centre, pointing where it blows towards.
const WIND_COLOR = 0x26c6da;
const FAULT_COLOR = 0xe53935;
const ZONE_FACES = [[0, 1, 2, 3], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
const ZONE_EDGES = [0, 1, 2, 3].flatMap((i) => [[i, (i + 1) % 4], [4 + i, 4 + (i + 1) % 4], [i, i + 4]]);

// A short text on a rounded tag that faces the camera (the zone's wind / fault).
function zoneLabel(text, color) {
  const font = "bold 30px sans-serif";
  const canvas = document.createElement("canvas");
  const measure = canvas.getContext("2d");
  measure.font = font;
  canvas.width = Math.ceil(measure.measureText(text).width) + 40;
  canvas.height = 64;
  const context = canvas.getContext("2d");  // resizing reset the context
  context.fillStyle = color;
  context.beginPath();
  context.roundRect(4, 8, canvas.width - 8, 48, 24);
  context.fill();
  context.fillStyle = "#ffffff";
  context.font = font;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, 33);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
  sprite.scale.set(0.8 * canvas.width / 64, 0.8, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function addZones(group, zones) {
  for (const zone of zones) {
    const corners = zone.corners.map(([east, north, up]) => new THREE.Vector3(east, up, -north));
    const color = zone.fault ? FAULT_COLOR : WIND_COLOR;
    const box = new THREE.BufferGeometry().setFromPoints(
      ZONE_FACES.flatMap(([a, b, c, d]) => [a, b, c, a, c, d].map((index) => corners[index])));
    const fill = new THREE.Mesh(box, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false,
    }));
    fill.renderOrder = 3;
    group.add(fill);
    const edges = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(ZONE_EDGES.flat().map((index) => corners[index])),
      new THREE.LineBasicMaterial({ color }));
    edges.renderOrder = 4;
    group.add(edges);

    const centre = corners.reduce((sum, corner) => sum.add(corner), new THREE.Vector3()).divideScalar(8);
    const top = Math.max(...corners.map((corner) => corner.y));
    const texts = [];
    if (zone.wind) {
      // Urban convention: east 0, counter-clockwise (north 90) -> scene (cos, 0, -sin).
      const towards = THREE.MathUtils.degToRad(zone.wind.towards_deg);
      const direction = new THREE.Vector3(Math.cos(towards), 0, -Math.sin(towards));
      // The box's horizontal length: from the middle of its a end to the middle of its b end.
      const along = corners[2].clone().add(corners[3]).sub(corners[0]).sub(corners[1]).multiplyScalar(0.5).setY(0);
      const length = Math.max(1, Math.min(4, along.length()));
      const arrow = new THREE.ArrowHelper(direction, centre.clone().addScaledVector(direction, -length / 2),
        length, WIND_COLOR, Math.min(1, length * 0.3), Math.min(0.6, length * 0.2));
      arrow.traverse((part) => { part.renderOrder = 6; });
      group.add(arrow);
      texts.push(`風 ${Number(zone.wind.speed_m_s.toFixed(1))}m/s`);
    }
    if (zone.fault) texts.push(`故障 ${zone.fault.rotors.map((rotor) => `R${rotor}`).join(",")}`);
    const label = zoneLabel(texts.join(" "), zone.fault ? "#e53935" : "#26c6da");
    label.position.set(centre.x, top + 0.8, centre.z);
    group.add(label);
  }
}

function addRoutePaths(group, routes) {
  for (const route of routes) {
    const samples = [...route.points];
    if (route.closed && samples.length > 2) samples.push(samples[0]);
    if (samples.length < 2) continue;
    addFrictionBands(group, samples);
    // One line per run of the same colour; a run ends on the next run's
    // first point so the line has no gaps.
    let start = 0;
    for (let index = 1; index <= samples.length; index += 1) {
      const color = frictionColor(samples[start].road_friction);
      if (index < samples.length && frictionColor(samples[index].road_friction) === color) continue;
      const run = samples.slice(start, Math.min(index + 1, samples.length)).map(toScene);
      if (run.length >= 2) {
        const line = makeFatLine(run, color, WIDTH_PX);
        line.renderOrder = 5;
        group.add(line);
      }
      start = index;
    }
  }
}

export function buildFlightPathGroup(paths, routes = []) {
  const group = new THREE.Group();
  group.name = "planned-paths";
  addRoutePaths(group, routes);
  for (const path of paths) {
    const points = path.points;
    if (path.zones) addZones(group, path.zones);
    if (points.length > 1) {
      const line = makeFatLine(points.map(toScene), 0x2e7dd7, WIDTH_PX);
      line.renderOrder = 5;
      group.add(line);
    }
    points.forEach((point, index) => {
      const color = KIND_COLORS[point.kind] ?? KIND_COLORS.waypoint;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshBasicMaterial({ color }));
      ball.position.copy(toScene(point));
      group.add(ball);
      // One label per place: T at the top of the climb, L over the landing point, each waypoint once.
      const labelled = point.kind === "waypoint" ? !point.again
        : !point.stand && !(point.kind === "takeoff" && points.slice(0, index).some((item) => item.kind === "takeoff" && !item.stand));
      if (labelled) {
        const label = labelSprite(point.label ?? "", color);
        label.position.copy(toScene(point)).add(new THREE.Vector3(0, 1.2, 0));
        group.add(label);
      }
    });
  }
  return group;
}
