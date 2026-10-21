const EPSILON_SPEED_MPS = 0.03;

function normalize(vector, fallback = [0, 0, -1]) {
  const length = Math.hypot(...vector);
  return length > 1e-9 ? vector.map((value) => value / length) : [...fallback];
}

export function meanDirection(directions, fallback = [0, 0, -1]) {
  if (!directions.length) return normalize(fallback);
  return normalize(directions.reduce((sum, direction) => [
    sum[0] + direction[0], sum[1] + direction[1], sum[2] + direction[2],
  ], [0, 0, 0]), fallback);
}

export function frontmostIndex(positions, travelDirection) {
  if (!positions.length) return -1;
  let best = 0;
  let bestProjection = -Infinity;
  for (let index = 0; index < positions.length; index++) {
    const projection = positions[index].reduce(
      (sum, value, axis) => sum + value * travelDirection[axis], 0,
    );
    if (projection > bestProjection) {
      best = index;
      bestProjection = projection;
    }
  }
  return best;
}

export function frontCameraFrame(positions, travelDirection, {
  aheadM = 6, upM = 1, lookBackM = 12, dropM = 1.5, zoom = 1,
} = {}) {
  const direction = normalize(travelDirection);
  const anchorIndex = frontmostIndex(positions, direction);
  if (anchorIndex < 0) return null;
  const anchor = positions[anchorIndex];
  return {
    anchorIndex,
    anchor: [...anchor],
    position: [
      anchor[0] + direction[0] * aheadM * zoom,
      anchor[1] + direction[1] * aheadM * zoom + upM * zoom,
      anchor[2] + direction[2] * aheadM * zoom,
    ],
    target: [
      anchor[0] - direction[0] * lookBackM,
      anchor[1] - direction[1] * lookBackM - dropM,
      anchor[2] - direction[2] * lookBackM,
    ],
    direction,
  };
}

export function clampFrontZoom(zoom, { min = 0.25, max = 4 } = {}) {
  return Math.min(max, Math.max(min, zoom));
}

export function updateFrontZoom(currentZoom, multiplier, options) {
  return clampFrontZoom(currentZoom * multiplier, options);
}

// Stateful direction estimator. Mean lead velocity is exponentially smoothed;
// while still, its last moving direction is retained.
export class FrontDirectionTracker {
  constructor({ smoothing = 6, stillSpeedMps = EPSILON_SPEED_MPS } = {}) {
    this.smoothing = smoothing;
    this.stillSpeedMps = stillSpeedMps;
    this.previous = null;
    this.direction = null;
  }

  update(positions, dt, fallbackDirections = [], viewDirection = [0, 0, -1]) {
    const fallback = meanDirection(fallbackDirections, viewDirection);
    if (this.previous?.length === positions.length && dt > 0) {
      const velocity = positions.reduce((sum, position, index) => [
        sum[0] + (position[0] - this.previous[index][0]) / dt,
        sum[1] + (position[1] - this.previous[index][1]) / dt,
        sum[2] + (position[2] - this.previous[index][2]) / dt,
      ], [0, 0, 0]).map((value) => value / Math.max(1, positions.length));
      if (Math.hypot(...velocity) >= this.stillSpeedMps) {
        const measured = normalize(velocity, fallback);
        if (this.direction) {
          const alpha = 1 - Math.exp(-this.smoothing * dt);
          this.direction = normalize(this.direction.map(
            (value, axis) => value + (measured[axis] - value) * alpha,
          ), measured);
        } else {
          this.direction = measured;
        }
      }
    }
    this.previous = positions.map((position) => [...position]);
    if (!this.direction) this.direction = fallback;
    return [...this.direction];
  }
}
