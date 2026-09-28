// Ground texture for untextured environment surfaces.
//
// City World GLBs texture their buildings, but the terrain and road meshes
// have neither a texture nor UVs, so they render as one flat colour. Without
// a pattern on the ground the eye has no cue for height: an FPV camera at 3 m
// and at 12 m sees the same grey. Such meshes get a top-down projected,
// metre-scaled noise texture here (roads darker, like asphalt).

import * as THREE from "three";

// Metres covered by one texture tile.
const TILE_M = { ground: 8.0, road: 4.0 };
const TEXTURE_PX = 256;

// Grey shades (coarse blotches, fine grain) that modulate the surface's own
// colour: the texture multiplies the model's vertex colours, so the ground
// keeps its tint and only gains a pattern.
// (The model's default glTF material is fully metallic and renders dark; the
// ground material here is not metallic, so the shades stay below white.)
const LOOKS = {
  ground: { base: 165, blotch: 60, grain: 45 },
  road: { base: 150, blotch: 25, grain: 60 },
};

// A small deterministic generator, so every viewer draws the same pattern.
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

// Value noise on a wrapping grid, so the tile repeats without seams.
function valueNoise(size, cells, next) {
  const grid = Array.from({ length: cells * cells }, () => next());
  const at = (x, y) => grid[((y % cells + cells) % cells) * cells + ((x % cells + cells) % cells)];
  const smooth = (t) => t * t * (3 - 2 * t);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = smooth(fx - ix);
      const ty = smooth(fy - iy);
      const top = at(ix, iy) * (1 - tx) + at(ix + 1, iy) * tx;
      const bottom = at(ix, iy + 1) * (1 - tx) + at(ix + 1, iy + 1) * tx;
      out[y * size + x] = top * (1 - ty) + bottom * ty;
    }
  }
  return out;
}

const textureCache = new Map();

export function groundTexture(kind) {
  if (textureCache.has(kind)) return textureCache.get(kind);
  const look = LOOKS[kind];
  const next = random(kind === "road" ? 7 : 3);
  const blotches = valueNoise(TEXTURE_PX, 8, next);
  const grain = valueNoise(TEXTURE_PX, 128, next);
  const canvas = document.createElement("canvas");
  canvas.width = TEXTURE_PX;
  canvas.height = TEXTURE_PX;
  const context = canvas.getContext("2d");
  const image = context.createImageData(TEXTURE_PX, TEXTURE_PX);
  for (let i = 0; i < TEXTURE_PX * TEXTURE_PX; i += 1) {
    const shade = Math.max(0, Math.min(255, look.base + (blotches[i] - 0.5) * look.blotch + (grain[i] - 0.5) * look.grain));
    for (let channel = 0; channel < 3; channel += 1) image.data[i * 4 + channel] = shade;
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  textureCache.set(kind, texture);
  return texture;
}

function hasTexture(material) {
  const materials = Array.isArray(material) ? material : [material];
  return materials.some((item) => item?.map);
}

function surfaceKind(mesh) {
  for (let node = mesh; node; node = node.parent) {
    if (/road/i.test(node.name || "")) return "road";
  }
  return "ground";
}

/**
 * Give the untextured, UV-less meshes under root a top-down projected ground
 * texture. UVs come from the horizontal (x, z) position in root's frame, in
 * metres, so the pattern keeps its real-world size. Returns the meshes changed.
 */
export function texturizeUntexturedSurfaces(root) {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const changed = [];
  const point = new THREE.Vector3();
  root.traverse((mesh) => {
    if (!mesh.isMesh || hasTexture(mesh.material) || mesh.geometry?.attributes?.uv) return;
    const position = mesh.geometry.attributes.position;
    if (!position) return;
    const kind = surfaceKind(mesh);
    const tile = TILE_M[kind];
    const local = new THREE.Matrix4().multiplyMatrices(toRoot, mesh.matrixWorld);
    const uv = new Float32Array(position.count * 2);
    for (let i = 0; i < position.count; i += 1) {
      point.fromBufferAttribute(position, i).applyMatrix4(local);
      uv[i * 2] = point.x / tile;
      uv[i * 2 + 1] = point.z / tile;
    }
    mesh.geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    const previous = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const attributes = mesh.geometry.attributes;
    mesh.material = new THREE.MeshStandardMaterial({
      map: groundTexture(kind),
      // Keep the model's colours (City World paints terrain and roads with
      // vertex colours) and, like GLTFLoader, flat shading when it has no
      // normals: without normals a lit material renders black.
      color: previous?.color ? previous.color.clone() : new THREE.Color(0xffffff),
      vertexColors: previous?.vertexColors ?? Boolean(attributes.color),
      flatShading: !attributes.normal,
      roughness: 1.0,
      metalness: 0.0,
      side: THREE.DoubleSide,
    });
    changed.push(mesh);
  });
  return changed;
}
