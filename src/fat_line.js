// Lines a few pixels wide (WebGL lines are always 1 px): three.js Line2 with
// LineMaterial, whose width is in screen pixels. The materials follow the
// window size so the width stays the same when the view is resized.

import * as THREE from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";

const materials = new Set();

function resolution() {
  return new THREE.Vector2(window.innerWidth || 1, window.innerHeight || 1);
}

if (typeof window !== "undefined") {
  window.addEventListener("resize", () => {
    const size = resolution();
    for (const material of materials) material.resolution.copy(size);
  });
}

function flatten(points) {
  const values = new Array(points.length * 3);
  points.forEach((point, index) => {
    values[index * 3] = point.x;
    values[index * 3 + 1] = point.y;
    values[index * 3 + 2] = point.z;
  });
  return values;
}

export function makeFatLine(points, color, widthPx) {
  const material = new LineMaterial({ color, linewidth: widthPx, resolution: resolution() });
  materials.add(material);
  const geometry = new LineGeometry();
  if (points.length >= 2) geometry.setPositions(flatten(points));
  const line = new Line2(geometry, material);
  line.frustumCulled = false;
  line.visible = points.length >= 2;
  return line;
}

// Replace a fat line's points (a new geometry: Line2 buffers are sized once).
export function setFatLinePoints(line, points) {
  if (points.length < 2) {
    line.visible = false;
    return;
  }
  const geometry = new LineGeometry();
  geometry.setPositions(flatten(points));
  line.geometry.dispose();
  line.geometry = geometry;
  line.visible = true;
}

export function disposeFatLine(line) {
  line.geometry.dispose();
  materials.delete(line.material);
  line.material.dispose();
}
