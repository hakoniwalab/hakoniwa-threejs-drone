// Smooth display of poses that arrive at an uneven cadence (for example a
// 20-40 ms WebBridge step under Windows sleep granularity). Each new pose gets
// an even display time on a smoothed clock, and the viewer draws a short
// delay behind it, interpolating between the two poses around that time:
// position linearly, rotation by slerp. No extrapolation: past the newest pose
// the newest pose is held.

const MAX_SAMPLES = 8;

function sameTransform(a, b) {
  if (!a || !b) return false;
  const ta = a.translation ?? {};
  const tb = b.translation ?? {};
  const ra = a.rotation ?? {};
  const rb = b.rotation ?? {};
  return ta.x === tb.x && ta.y === tb.y && ta.z === tb.z
    && ra.x === rb.x && ra.y === rb.y && ra.z === rb.z && ra.w === rb.w;
}

function lerp(a, b, s) {
  return a + (b - a) * s;
}

export function slerpQuaternion(a, b, s) {
  let { x: bx, y: by, z: bz, w: bw } = b;
  let dot = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (dot < 0) {
    dot = -dot; bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  let wa;
  let wb;
  if (dot > 0.9995) {
    wa = 1 - s;
    wb = s;
  } else {
    const theta = Math.acos(Math.min(1, dot));
    const sin = Math.sin(theta);
    wa = Math.sin((1 - s) * theta) / sin;
    wb = Math.sin(s * theta) / sin;
  }
  const q = {
    x: wa * a.x + wb * bx, y: wa * a.y + wb * by, z: wa * a.z + wb * bz, w: wa * a.w + wb * bw,
  };
  const norm = Math.hypot(q.x, q.y, q.z, q.w) || 1;
  return { x: q.x / norm, y: q.y / norm, z: q.z / norm, w: q.w / norm };
}

export function interpolateTransform(a, b, s) {
  return {
    translation: {
      x: lerp(a.translation.x, b.translation.x, s),
      y: lerp(a.translation.y, b.translation.y, s),
      z: lerp(a.translation.z, b.translation.z, s),
    },
    rotation: slerpQuaternion(a.rotation, b.rotation, s),
  };
}

export class PoseInterpolator {
  // delayMsec: how far behind the newest pose to draw. When omitted, 1.5 x the
  // measured arrival period (about one pose of margin for jitter).
  // periodMsec: the publisher's step when known (fixed at configure); it seeds
  // the period estimate, which still follows the measured arrivals.
  // snapDistanceM: a jump longer than this (reset, respawn) is placed at once
  // instead of being slid over.
  constructor({ delayMsec = null, periodMsec = null, snapDistanceM = 2.0, gapResetMsec = 250 } = {}) {
    this.delayMsec = Number.isFinite(delayMsec) ? delayMsec : null;
    this.initialPeriodMsec = Number.isFinite(periodMsec) && periodMsec > 0 ? periodMsec : null;
    this.snapDistanceM = Number.isFinite(snapDistanceM) ? snapDistanceM : Infinity;
    this.gapResetMsec = gapResetMsec;
    this.samples = [];
    this.periodMsec = this.initialPeriodMsec;
    this.lastArrivalMsec = null;
  }

  push(transform, nowMsec) {
    const last = this.samples[this.samples.length - 1];
    if (last && sameTransform(last.transform, transform)) return false;
    const gap = this.lastArrivalMsec === null ? Infinity : nowMsec - this.lastArrivalMsec;
    let displayMsec = nowMsec;
    const jump = last ? Math.hypot(
      transform.translation.x - last.transform.translation.x,
      transform.translation.y - last.transform.translation.y,
      transform.translation.z - last.transform.translation.z,
    ) : 0;
    if (last && gap < this.gapResetMsec && jump <= this.snapDistanceM) {
      const measured = Math.min(Math.max(gap, 1), this.gapResetMsec);
      this.periodMsec = this.periodMsec === null ? measured : 0.9 * this.periodMsec + 0.1 * measured;
      // Even spacing on the smoothed clock, pulled slowly toward arrival time.
      const predicted = last.displayMsec + this.periodMsec;
      displayMsec = predicted + 0.1 * (nowMsec - predicted);
      displayMsec = Math.max(displayMsec, last.displayMsec + 0.5 * this.periodMsec);
    } else {
      // First pose, a paused stream or a teleport: restart (no tween).
      this.samples = [];
    }
    this.lastArrivalMsec = nowMsec;
    this.samples.push({ displayMsec, transform });
    if (this.samples.length > MAX_SAMPLES) this.samples.shift();
    return true;
  }

  sample(nowMsec) {
    const samples = this.samples;
    if (samples.length === 0) return null;
    const delay = this.delayMsec ?? 1.5 * (this.periodMsec ?? 0);
    const t = nowMsec - delay;
    if (samples.length === 1 || t <= samples[0].displayMsec) return samples[0].transform;
    for (let index = samples.length - 1; index > 0; index -= 1) {
      const a = samples[index - 1];
      const b = samples[index];
      if (t >= a.displayMsec) {
        if (t >= b.displayMsec) return b.transform;
        const s = (t - a.displayMsec) / Math.max(b.displayMsec - a.displayMsec, 1e-6);
        return interpolateTransform(a.transform, b.transform, s);
      }
    }
    return samples[0].transform;
  }
}
