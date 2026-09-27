// A self-contained rotor fault / wind panel for pages that embed the viewer.
// It builds one slider per rotor from viewer.getFaultInjectionConfig() and
// sends the disturbance PDU whenever a slider is released.

const MAX_WIND_SPEED_MPS = 20.0;

function clamp(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function element(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (key === "style") node.style.cssText = value;
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    node.append(child);
  }
  return node;
}

function sliderRow(label, { min, max, step, value, digits }) {
  const slider = element("input", { type: "range", min, max, step, value, style: "width:100%" });
  const output = element("span", { style: "text-align:right;font-variant-numeric:tabular-nums" });
  const show = () => { output.textContent = Number(slider.value).toFixed(digits); };
  slider.addEventListener("input", show);
  show();
  const row = element("div", {
    style: "display:grid;grid-template-columns:5.5em 1fr 3em;gap:6px;align-items:center",
  }, [element("label", {}, label), slider, output]);
  return { row, slider, show };
}

const COMPASS_POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

// The wind heading is the direction the wind blows towards. The Drone PDU
// takes it counter-clockwise from ROS +X (north, +Y west); the compass shows
// the map bearing, clockwise from north.
function bearingFromHeading(headingDeg) {
  return (360 - headingDeg) % 360;
}

function compassPointName(bearingDeg) {
  return COMPASS_POINTS[Math.round(bearingDeg / 45) % 8];
}

/** A drag-to-set compass whose red arrow points where the wind blows. */
function windCompass(onRelease) {
  const size = 96;
  const pointer = element("div", {
    style: "position:absolute;left:50%;top:50%;width:0;height:0;transform-origin:0 0;pointer-events:none",
  }, element("div", {
    style: "position:absolute;left:0;top:-5px;width:38px;height:10px;background:#cc2b2b;"
      + "clip-path:polygon(0 50%,72% 0,100% 50%,72% 100%)",
  }));
  const label = (text, position) => element("span", {
    style: `position:absolute;${position};font-size:10px;font-weight:700;color:#555;pointer-events:none`,
  }, text);
  const dial = element("div", {
    "aria-label": "Wind direction (towards)",
    style: `position:relative;width:${size}px;height:${size}px;border:2px solid #999;border-radius:50%;`
      + "background:radial-gradient(circle at center,#fff 0 34%,#f2f2f2 35% 100%);"
      + "cursor:crosshair;user-select:none;touch-action:none;flex:none",
  }, [
    label("N", "top:4px;left:50%;transform:translateX(-50%)"),
    label("E", "top:50%;right:6px;transform:translateY(-50%)"),
    label("S", "bottom:4px;left:50%;transform:translateX(-50%)"),
    label("W", "top:50%;left:6px;transform:translateY(-50%)"),
    pointer,
    element("div", {
      style: "position:absolute;left:50%;top:50%;width:10px;height:10px;background:#333;"
        + "border-radius:50%;transform:translate(-50%,-50%);pointer-events:none",
    }),
  ]);
  const readout = element("span", { style: "font-variant-numeric:tabular-nums" });
  let headingDeg = 0;

  function set(value) {
    headingDeg = ((Math.round(Number(value) / 5) * 5) % 360 + 360) % 360;
    pointer.style.transform = `rotate(${-90 - headingDeg}deg)`;
    const bearing = bearingFromHeading(headingDeg);
    readout.textContent = `towards ${compassPointName(bearing)} ${bearing.toFixed(0)}°`;
  }

  function headingFromPointer(event) {
    const rect = dial.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = (rect.top + rect.height / 2) - event.clientY;
    return Math.atan2(-dx, dy) * 180 / Math.PI;
  }

  let dragging = false;
  dial.addEventListener("pointerdown", (event) => {
    dragging = true;
    dial.setPointerCapture(event.pointerId);
    set(headingFromPointer(event));
  });
  dial.addEventListener("pointermove", (event) => {
    if (dragging) set(headingFromPointer(event));
  });
  const release = () => {
    if (!dragging) return;
    dragging = false;
    onRelease();
  };
  dial.addEventListener("pointerup", release);
  dial.addEventListener("pointercancel", release);
  set(0);

  const row = element("div", { style: "display:flex;gap:10px;align-items:center" }, [
    dial,
    element("div", { style: "display:grid;gap:2px" }, [element("label", {}, "Wind direction"), readout]),
  ]);
  return { row, get: () => headingDeg, set };
}

/**
 * Mount the panel into container. Returns null when the viewer config has no
 * faultInjection section.
 */
export function mountFaultPanel(container, viewer) {
  const fault = viewer.getFaultInjectionConfig?.();
  if (!container || !fault) return null;

  const rotors = Array.from({ length: fault.rotorCount }, (_, index) =>
    sliderRow(`Rotor ${index}`, { min: 0, max: 1, step: 0.1, value: 1, digits: 1 }));
  const speed = sliderRow("Wind m/s", { min: 0, max: MAX_WIND_SPEED_MPS, step: 0.5, value: 0, digits: 1 });
  const status = element("div", { style: "min-height:1.2em;font-size:12px" });
  const reset = element("button", { type: "button" }, "reset");
  const heading = windCompass(() => send());

  const panel = element("div", { class: "prop-box hakoniwa-fault-panel" }, [
    element("h4", {}, `Fault Injection (${fault.robotName})`),
    element("div", { style: "display:grid;gap:4px" }, rotors.map((item) => item.row)),
    element("div", { style: "display:grid;gap:4px;margin-top:6px" }, [heading.row, speed.row]),
    element("div", { style: "margin-top:6px" }, reset),
    status,
  ]);

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.style.color = isError ? "#b00020" : "";
  }

  async function send() {
    const scales = rotors.map((item) => clamp(item.slider.value, 0, 1, 1));
    viewer.setWind({
      headingDeg: heading.get(),
      speedMps: clamp(speed.slider.value, 0, MAX_WIND_SPEED_MPS, 0),
    });
    try {
      const ok = await viewer.sendRotorFaultScales(scales);
      const wind = viewer.getWind();
      setStatus(
        ok
          ? `sent rotors [${scales.map((v) => v.toFixed(1)).join(", ")}] wind towards ${bearingFromHeading(wind.headingDeg).toFixed(0)}° ${wind.speedMps.toFixed(1)} m/s`
          : "send failed",
        !ok,
      );
      return ok;
    } catch (error) {
      console.error("[FaultPanel] send failed:", error);
      setStatus("send error", true);
      return false;
    }
  }

  for (const item of [...rotors, speed]) {
    item.slider.addEventListener("change", send);
  }
  reset.addEventListener("click", () => {
    rotors.forEach((item) => { item.slider.value = "1"; item.show(); });
    heading.set(0);
    speed.slider.value = "0"; speed.show();
    send();
  });

  container.append(panel);
  return { element: panel, send };
}
