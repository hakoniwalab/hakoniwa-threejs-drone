import assert from "node:assert/strict";
import {
  cameraRendererNames, loadViewerPlugins, removeCameraRenderer, renderCamera, setCameraRenderer, validatePlugins,
} from "../../src/viewer_plugins.js";

// Without a plugin renderer the viewer draws the camera itself, exactly as before.
const drawn = [];
const renderer = { render: (scene, camera) => drawn.push(["viewer", scene, camera]) };
renderCamera(renderer, "scene", "cam", "Car-1/front", { x: 0, y: 0, width: 10, height: 5 });
renderCamera(renderer, "scene", "cam", null, { x: 0, y: 0, width: 10, height: 5 });
assert.deepEqual(drawn, [["viewer", "scene", "cam"], ["viewer", "scene", "cam"]]);

// A plugin renderer draws only the camera it is named for, with the rect it is given.
const calls = [];
let disposed = 0;
const lens = { render: (args) => calls.push(args), dispose: () => { disposed += 1; } };
setCameraRenderer("Car-1/front", lens);
drawn.length = 0;
renderCamera(renderer, "scene", "cam", "Car-1/front", { x: 1, y: 2, width: 3, height: 4 });
renderCamera(renderer, "scene", "cam2", "Car-1/cabin", { x: 0, y: 0, width: 1, height: 1 });
renderCamera(renderer, "scene", "cam3", null, { x: 0, y: 0, width: 1, height: 1 });
assert.equal(calls.length, 1);
assert.deepEqual(calls[0], { renderer, scene: "scene", camera: "cam", rect: { x: 1, y: 2, width: 3, height: 4 } });
assert.deepEqual(drawn.map((d) => d[2]), ["cam2", "cam3"]);
assert.deepEqual(cameraRendererNames(), ["Car-1/front"]);

// Replacing a renderer disposes the old one; removing disposes and falls back to the viewer.
setCameraRenderer("Car-1/front", { render: () => {} });
assert.equal(disposed, 1);
removeCameraRenderer("Car-1/front");
assert.deepEqual(cameraRendererNames(), []);
drawn.length = 0;
renderCamera(renderer, "scene", "cam", "Car-1/front", { x: 0, y: 0, width: 1, height: 1 });
assert.equal(drawn.length, 1);

// Names and renderers are checked.
for (const bad of ["front", "Car-1/", "/front", "Car 1/front", 3]) {
  assert.throws(() => setCameraRenderer(bad, lens), /camera name/);
}
assert.throws(() => setCameraRenderer("Car-1/front", {}), /render/);

// viewerConfig.plugins shape.
validatePlugins(undefined);
validatePlugins([{ module: "/x.js" }, { module: "/y.js", options: { a: 1 } }]);
assert.throws(() => validatePlugins({}), /list/);
assert.throws(() => validatePlugins([{}]), /module/);
assert.throws(() => validatePlugins([{ module: "/x.js", options: [] }]), /options/);

// Plugins load in order and get their options; a module without setup stops the start-up.
const order = [];
const modules = {
  "/a.js": { setup: async (viewer, options) => order.push(["a", viewer.tag, options]) },
  "/b.js": { setup: (viewer, options) => order.push(["b", viewer.tag, options]) },
  "/bad.js": {},
};
const importer = async (url) => modules[url];
const loaded = await loadViewerPlugins([{ module: "/a.js", options: { k: 1 } }, { module: "/b.js" }], { tag: "api" }, importer);
assert.deepEqual(loaded, ["/a.js", "/b.js"]);
assert.deepEqual(order, [["a", "api", { k: 1 }], ["b", "api", {}]]);
assert.deepEqual(await loadViewerPlugins(undefined, {}, importer), []);
await assert.rejects(loadViewerPlugins([{ module: "/bad.js" }], {}, importer), /setup/);

console.log(JSON.stringify({ ok: true }));
