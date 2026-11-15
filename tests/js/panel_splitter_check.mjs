import assert from "node:assert/strict";
import { PANEL_MIN_PX, VIEW_MIN_PX, clampPanelWidth } from "../../src/panel_splitter.js";

// Folded stays folded; otherwise between the minimum and what leaves the 3D view its minimum.
assert.equal(clampPanelWidth(0, 1280), 0);
assert.equal(clampPanelWidth(-5, 1280), 0);
assert.equal(clampPanelWidth(Number.NaN, 1280), 0);
assert.equal(clampPanelWidth(40, 1280), PANEL_MIN_PX);
assert.equal(clampPanelWidth(300, 1280), 300);
assert.equal(clampPanelWidth(5000, 1280), 1280 - VIEW_MIN_PX);
// A window too narrow for both: the panel keeps its minimum (the view shrinks, never the panel to nothing).
assert.equal(clampPanelWidth(300, 300), PANEL_MIN_PX);
console.log(JSON.stringify({ ok: true }));
