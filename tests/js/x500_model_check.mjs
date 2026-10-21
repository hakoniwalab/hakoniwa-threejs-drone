import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const configPath = resolve(root, "config/drone_types-x500.json");
const mjcfPath = resolve(root, "../hakoniwa-drone-pro/config/drone/x500-px4-sitl/drone.xml");
const config = JSON.parse(readFileSync(configPath, "utf8")).x500;
const mjcf = readFileSync(mjcfPath, "utf8");

assert.equal(config.rotors.length, 4, "X500 must have four rotors");

const sourcePropSpanMetres = 0.296;
const expectedPropSpanMetres = 0.254;
for (const rotor of config.rotors) {
  assert.equal(rotor.model.model_path, "../assets/models/base-drone-prop.glb");
  assert.deepEqual(rotor.model.pos, [0, 0, 0]);
  assert.deepEqual(rotor.model.hpr, [0, 0, 0]);
  assert.ok(
    Math.abs(sourcePropSpanMetres * rotor.model.scale - expectedPropSpanMetres) <= 0.001,
    "scaled propeller span must be 0.254 m within 1 mm",
  );
}

const toleranceMetres = 0.001;
for (let index = 0; index < config.rotors.length; index += 1) {
  const bodyName = `prop${index + 1}`;
  const match = mjcf.match(new RegExp(`<body\\s+name=["']${bodyName}["']\\s+pos=["']([^"']+)["']`));
  assert.ok(match, `MJCF body ${bodyName} must exist`);
  const expected = match[1].trim().split(/\s+/).map(Number);
  const actual = config.rotors[index].pos;
  assert.equal(actual.length, 3, `${bodyName} position must have three coordinates`);
  actual.forEach((value, axis) => {
    assert.ok(
      Math.abs(value - expected[axis]) <= toleranceMetres,
      `${bodyName} axis ${axis}: ${value} differs from MJCF ${expected[axis]}`,
    );
  });
}

const directionAt = new Map(config.rotors.map((rotor) => [
  `${Math.sign(rotor.pos[0])},${Math.sign(rotor.pos[1])}`,
  rotor.spinDirection,
]));
for (const [quadrant, direction] of directionAt) {
  const [x, y] = quadrant.split(",").map(Number);
  assert.notEqual(direction, directionAt.get(`${-x},${y}`), "front/rear neighbors must counter-rotate");
  assert.notEqual(direction, directionAt.get(`${x},${-y}`), "left/right neighbors must counter-rotate");
  assert.equal(direction, directionAt.get(`${-x},${-y}`), "diagonal rotors must share direction");
}

for (const modelPath of [config.model.model_path, ...config.rotors.map((rotor) => rotor.model.model_path)]) {
  assert.ok(existsSync(resolve(root, "config", modelPath)), `GLB must exist: ${modelPath}`);
}

console.log(JSON.stringify({
  type: "x500",
  rotorCount: config.rotors.length,
  positions: config.rotors.map((rotor) => rotor.pos),
  spinDirections: config.rotors.map((rotor) => rotor.spinDirection),
}));
