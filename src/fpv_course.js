import * as THREE from "three";
import { HakoniwaFrame } from "./frame.js";

function colorFromRgba(rgba, fallback = [1, 1, 1, 1]) {
  const values = Array.isArray(rgba) ? rgba : fallback;
  return {
    color: new THREE.Color(values[0], values[1], values[2]),
    opacity: values[3] ?? 1,
  };
}

function materialFromRgba(rgba) {
  const { color, opacity } = colorFromRgba(rgba);
  return new THREE.MeshStandardMaterial({
    color,
    opacity,
    transparent: opacity < 1,
    roughness: 0.72,
    metalness: 0.05,
  });
}

function setRosPose(object, position, yawDeg = 0) {
  const p = HakoniwaFrame.rosPosToThree(position);
  object.position.set(p.x, p.y, p.z);
  object.quaternion.copy(HakoniwaFrame.rosRpyToThreeQuaternion([0, 0, yawDeg]));
}

// ROS/MuJoCo FLU dimensions [forward, left, up] become Three [x, y, z]
// dimensions [left, up, forward].
function boxGeometry(dimensions) {
  return new THREE.BoxGeometry(dimensions[1], dimensions[2], dimensions[0]);
}

function addBox(parent, name, center, dimensions, material) {
  const mesh = new THREE.Mesh(boxGeometry(dimensions), material);
  mesh.name = name;
  setRosPose(mesh, center);
  parent.add(mesh);
  return mesh;
}

function addObstacle(parent, obstacle) {
  const group = new THREE.Group();
  group.name = `fpv-course-${obstacle.name}`;
  setRosPose(group, obstacle.center_m, obstacle.yaw_deg ?? 0);
  const material = materialFromRgba(obstacle.rgba);

  if (obstacle.type === "box") {
    addBox(group, `${obstacle.name}-box`, [0, 0, 0], obstacle.dimensions_m, material);
  } else if (obstacle.type === "pylon") {
    const geometry = new THREE.CylinderGeometry(
      obstacle.radius_m,
      obstacle.radius_m,
      obstacle.height_m,
      24,
    );
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = `${obstacle.name}-pylon`;
    group.add(mesh);
  } else if (obstacle.type === "gate") {
    const halfWidth = obstacle.inner_width_m / 2;
    const halfHeight = obstacle.inner_height_m / 2;
    const bar = obstacle.bar_thickness_m;
    const sideX = halfWidth + bar / 2;
    const topZ = halfHeight + bar / 2;
    const sideHeight = obstacle.inner_height_m + 2 * bar;
    const horizontalWidth = obstacle.inner_width_m;
    // Local coordinates remain ROS/FLU; the group applies course yaw.
    // Match the MuJoCo renderer exactly: the opening spans local X/Z and the
    // gate depth is local Y. This is intentionally not reinterpreted here.
    addBox(group, `${obstacle.name}-left`, [-sideX, 0, 0], [bar, obstacle.depth_m, sideHeight], material);
    addBox(group, `${obstacle.name}-right`, [sideX, 0, 0], [bar, obstacle.depth_m, sideHeight], material);
    addBox(group, `${obstacle.name}-top`, [0, 0, topZ], [horizontalWidth, obstacle.depth_m, bar], material);
    addBox(group, `${obstacle.name}-bottom`, [0, 0, -topZ], [horizontalWidth, obstacle.depth_m, bar], material);
  } else {
    throw new Error(`[FpvCourse] unsupported obstacle type: ${obstacle.type}`);
  }
  parent.add(group);
}

function addLights(scene, course) {
  const ambient = course.visual?.headlight_ambient ?? [0.45, 0.45, 0.45];
  const ambientColor = new THREE.Color(ambient[0], ambient[1], ambient[2]);
  scene.add(new THREE.AmbientLight(ambientColor, 1));

  for (const light of course.lights ?? []) {
    const color = new THREE.Color(...(light.diffuse ?? [0.8, 0.8, 0.8]));
    const directional = new THREE.DirectionalLight(color, 1);
    directional.name = `fpv-course-light-${light.name}`;
    const position = HakoniwaFrame.rosPosToThree(light.pos_m);
    directional.position.set(position.x, position.y, position.z);
    const direction = light.direction ?? [0, 0, -1];
    const targetRos = light.pos_m.map((value, index) => value + direction[index]);
    const target = HakoniwaFrame.rosPosToThree(targetRos);
    directional.target.position.set(target.x, target.y, target.z);
    scene.add(directional);
    scene.add(directional.target);
  }
}

export async function buildFpvCourse(scene, modelPath) {
  const response = await fetch(modelPath);
  if (!response.ok) {
    throw new Error(`[FpvCourse] failed to load: ${modelPath}`);
  }
  const course = await response.json();
  if (course.schema_version !== 1 || course.kind !== "hakoniwa-fpv-course") {
    throw new Error(`[FpvCourse] unsupported course document: ${modelPath}`);
  }

  const root = new THREE.Group();
  root.name = "fpv-course";
  const ground = course.ground;
  // MuJoCo plane size is a half extent, so preserve the same visible area.
  addBox(
    root,
    "fpv-course-ground",
    [0, 0, -0.025],
    [ground.size_m[0] * 2, ground.size_m[1] * 2, 0.05],
    materialFromRgba(ground.rgba),
  );
  for (const obstacle of course.obstacles ?? []) {
    addObstacle(root, obstacle);
  }
  scene.add(root);
  addLights(scene, course);

  const sky = course.visual?.sky_rgba;
  if (Array.isArray(sky)) {
    scene.background = new THREE.Color(sky[0], sky[1], sky[2]);
  }
  return root;
}
