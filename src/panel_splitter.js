// The left panel's width, changed by dragging the line between the panel and the 3D view (double-click:
// fold the panel away or bring it back). The width is remembered in this browser only (localStorage).

export const PANEL_MIN_PX = 160;
export const VIEW_MIN_PX = 200;     // the 3D view always keeps at least this much
export const PANEL_DEFAULT_PX = 260;
const STORAGE_KEY = "hakoniwa-viewer.panel-width";

// The panel width for a wanted width in a window this wide: 0 stays folded, otherwise between the
// minimum and what leaves the 3D view its minimum.
export function clampPanelWidth(wanted, windowWidth) {
  if (!Number.isFinite(wanted) || wanted <= 0) return 0;
  const most = Math.max(PANEL_MIN_PX, windowWidth - VIEW_MIN_PX);
  return Math.round(Math.min(Math.max(wanted, PANEL_MIN_PX), most));
}

function readStored(storage) {
  try {
    const value = Number(storage?.getItem(STORAGE_KEY));
    return Number.isFinite(value) && storage.getItem(STORAGE_KEY) !== null ? value : null;
  } catch {
    return null;
  }
}

function store(storage, width) {
  try {
    storage?.setItem(STORAGE_KEY, String(width));
  } catch {
    // private windows and blocked storage: the width is just not remembered
  }
}

export function attachPanelSplitter(panel, splitter, { storage = globalThis.localStorage, win = window } = {}) {
  let width = readStored(storage) ?? PANEL_DEFAULT_PX;
  let lastOpen = width > 0 ? width : PANEL_DEFAULT_PX;
  const apply = () => {
    width = clampPanelWidth(width, win.innerWidth);
    panel.style.width = `${width}px`;
    panel.style.display = width === 0 ? "none" : "";
    splitter.title = width === 0 ? "ダブルクリックでパネルを開く" : "ドラッグで幅を変更、ダブルクリックで閉じる";
  };
  apply();

  splitter.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    splitter.setPointerCapture(event.pointerId);
    const left = panel.getBoundingClientRect().left;
    const move = (e) => {
      width = e.clientX - left;
      if (width > 0) lastOpen = width;
      apply();
    };
    const up = () => {
      splitter.removeEventListener("pointermove", move);
      splitter.removeEventListener("pointerup", up);
      splitter.removeEventListener("pointercancel", up);
      store(storage, width);
    };
    splitter.addEventListener("pointermove", move);
    splitter.addEventListener("pointerup", up);
    splitter.addEventListener("pointercancel", up);
  });
  splitter.addEventListener("dblclick", () => {
    width = width === 0 ? lastOpen : 0;
    apply();
    store(storage, width);
  });
  win.addEventListener("resize", apply);
}
