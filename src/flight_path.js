// Planned paths drawn over the scene: Drone flight paths (viewerConfig.flightPaths)
// and the routes vehicles drive (viewerConfig.routePaths).
//
// Each path is the line a Drone's schedule flies, from its takeoff to its
// landing: [{east_m, north_m, up_m, kind, label, stand?, again?}] in Urban ENU
// metres, kind "takeoff" | "waypoint" | "land". The scene frame is X = East,
// Y = Up, Z = -North (ROS (x, y, z) -> (-y, z, -x), as the Drones are drawn).
// The line is blue; each point is a ball (takeoff green, landing orange), and
// T, L and the waypoint numbers are labels that face the camera.

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
  }
}

// routePaths: [{route, vehicles, closed, points: [{east_m, north_m, up_m, road_friction?}]}],
// the points dense enough to follow the ground (bridges, slopes) between
// waypoints; road_friction is the road's friction from that point on.
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

function addRoutePaths(group, routes) {
  for (const route of routes) {
    const samples = [...route.points];
    if (route.closed && samples.length > 2) samples.push(samples[0]);
    if (samples.length < 2) continue;
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
