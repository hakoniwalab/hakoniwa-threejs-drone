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

/**
 * Mount the panel into container. Returns null when the viewer config has no
 * faultInjection section.
 */
export function mountFaultPanel(container, viewer) {
  const fault = viewer.getFaultInjectionConfig?.();
  if (!container || !fault) return null;

  const rotors = Array.from({ length: fault.rotorCount }, (_, index) =>
    sliderRow(`Rotor ${index}`, { min: 0, max: 1, step: 0.1, value: 1, digits: 1 }));
  const heading = sliderRow("Wind dir°", { min: 0, max: 355, step: 5, value: 0, digits: 0 });
  const speed = sliderRow("Wind m/s", { min: 0, max: MAX_WIND_SPEED_MPS, step: 0.5, value: 0, digits: 1 });
  const status = element("div", { style: "min-height:1.2em;font-size:12px" });
  const reset = element("button", { type: "button" }, "reset");

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
      headingDeg: clamp(heading.slider.value, 0, 360, 0),
      speedMps: clamp(speed.slider.value, 0, MAX_WIND_SPEED_MPS, 0),
    });
    try {
      const ok = await viewer.sendRotorFaultScales(scales);
      const wind = viewer.getWind();
      setStatus(
        ok
          ? `sent rotors [${scales.map((v) => v.toFixed(1)).join(", ")}] wind ${wind.headingDeg.toFixed(0)}° ${wind.speedMps.toFixed(1)} m/s`
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

  for (const item of [...rotors, heading, speed]) {
    item.slider.addEventListener("change", send);
  }
  reset.addEventListener("click", () => {
    rotors.forEach((item) => { item.slider.value = "1"; item.show(); });
    heading.slider.value = "0"; heading.show();
    speed.slider.value = "0"; speed.show();
    send();
  });

  container.append(panel);
  return { element: panel, send };
}
