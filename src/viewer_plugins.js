// Viewer plugins (viewerConfig.plugins): JavaScript modules the viewer loads at start-up. Each is
// {"module": "<URL of an ES module>", "options": {...}}; the module exports
// `setup(viewer, options)` (it may be async), and `viewer` is the small API below. The viewer
// knows nothing of what a plugin does; a plugin that is not listed is never loaded.
//
// Camera renderers: a plugin may draw a named camera itself, for example through a lens. The
// names are "<vehicle>/<camera>": "<vehicle>/front" for the vehicle's front camera (the main
// view when it is the subjective camera) and "<vehicle>/<extra camera name>" for its other
// windows. The viewer places and orients the camera every frame as before; a renderer gets
// {renderer, scene, camera, rect} with the camera's aspect already set and the viewport and
// scissor already on rect ({x, y, width, height} in pixels, lower-left origin). It draws the
// scene into rect and leaves the renderer drawing to the screen (render target null) with the
// viewport and scissor on rect again if it changed them. Without a renderer the viewer draws
// the camera itself, as it always did.

const cameraRenderers = new Map();

function checkName(name) {
  if (typeof name !== "string" || !/^[^/\s]+\/[^/\s]+$/.test(name)) {
    throw new Error(`[ViewerPlugins] camera name must be "<vehicle>/<camera>": ${name}`);
  }
}

export function setCameraRenderer(name, cameraRenderer) {
  checkName(name);
  if (!cameraRenderer || typeof cameraRenderer.render !== "function") {
    throw new Error(`[ViewerPlugins] the renderer of ${name} must have render({renderer, scene, camera, rect}).`);
  }
  const previous = cameraRenderers.get(name);
  if (previous && previous !== cameraRenderer) previous.dispose?.();
  cameraRenderers.set(name, cameraRenderer);
}

export function removeCameraRenderer(name) {
  const previous = cameraRenderers.get(name);
  cameraRenderers.delete(name);
  previous?.dispose?.();
}

export function cameraRendererNames() {
  return [...cameraRenderers.keys()];
}

// Draw one camera into the current viewport: through its plugin renderer when it has one.
export function renderCamera(renderer, scene, camera, name, rect) {
  const custom = name ? cameraRenderers.get(name) : undefined;
  if (custom) {
    custom.render({ renderer, scene, camera, rect });
    return;
  }
  renderer.render(scene, camera);
}

// viewerConfig.plugins: [{module, options}] (module: a non-empty string, options: an object).
export function validatePlugins(plugins, where = "viewerConfig") {
  if (plugins == null) return;
  if (!Array.isArray(plugins)) {
    throw new Error(`[ViewerConfigLoader] plugins must be a list of {module, options}: ${where}`);
  }
  plugins.forEach((plugin, index) => {
    if (!plugin || typeof plugin !== "object" || typeof plugin.module !== "string" || plugin.module.length === 0) {
      throw new Error(`[ViewerConfigLoader] plugins[${index}].module must be a non-empty string: ${where}`);
    }
    if (plugin.options != null && (typeof plugin.options !== "object" || Array.isArray(plugin.options))) {
      throw new Error(`[ViewerConfigLoader] plugins[${index}].options must be an object: ${where}`);
    }
  });
}

// Load the plugins in order and call their setup; a plugin that fails stops the start-up (a demo
// without the view it was configured for is not the demo).
export async function loadViewerPlugins(plugins, viewer, importModule = (url) => import(url)) {
  validatePlugins(plugins);
  const loaded = [];
  for (const [index, plugin] of (plugins ?? []).entries()) {
    const module = await importModule(plugin.module);
    if (typeof module?.setup !== "function") {
      throw new Error(`[ViewerPlugins] plugins[${index}] (${plugin.module}) does not export setup(viewer, options).`);
    }
    await module.setup(viewer, plugin.options ?? {});
    loaded.push(plugin.module);
  }
  return loaded;
}
