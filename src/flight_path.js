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

// routePaths: [{route, vehicles, closed, points: [{east_m, north_m, up_m}]}], the
// points dense enough to follow the ground (bridges, slopes) between waypoints.
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
    const points = route.points.map(toScene);
    if (route.closed && points.length > 2) points.push(points[0].clone());
    if (points.length < 2) continue;
    const line = makeFatLine(points, ROUTE_COLOR, WIDTH_PX);
    line.renderOrder = 5;
    group.add(line);
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
