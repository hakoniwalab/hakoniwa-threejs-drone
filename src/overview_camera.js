// Pure overview-camera framing math. Positions are [x, y, z] in scene metres.
export function overviewCentroid(positions) {
  if (!positions.length) return null;
  const sum = positions.reduce((out, position) => {
    out[0] += position[0];
    out[1] += position[1];
    out[2] += position[2];
    return out;
  }, [0, 0, 0]);
  return sum.map((value) => value / positions.length);
}

export function overviewRadius(positions, centroid = overviewCentroid(positions)) {
  if (!centroid) return 0;
  return positions.reduce((radius, position) => Math.max(radius, Math.hypot(
    position[0] - centroid[0],
    position[1] - centroid[1],
    position[2] - centroid[2],
  )), 0);
}

export function overviewDistance(radius, fovDeg, { minDistanceM = 15, marginM = 5 } = {}) {
  const halfFovRad = (fovDeg * Math.PI / 180) / 2;
  return Math.max(minDistanceM, (radius + marginM) / Math.sin(halfFovRad));
}

export function clampOverviewZoom(zoom, { min = 0.2, max = 5.0 } = {}) {
  return Math.min(max, Math.max(min, zoom));
}

export function updateOverviewZoom(currentZoom, multiplier, options) {
  return clampOverviewZoom(currentZoom * multiplier, options);
}

export function overviewFrame(positions, fovDeg, options) {
  const centroid = overviewCentroid(positions);
  if (!centroid) return null;
  const radius = overviewRadius(positions, centroid);
  return { centroid, radius, distance: overviewDistance(radius, fovDeg, options) };
}

export function overviewInsetPose(positions, fovDeg, travelDirection = null, options = {}) {
  const frame = overviewFrame(positions, fovDeg, options);
  if (!frame) return null;
  // Behind the group, looking down by 50 degrees. With no motion, "behind"
  // defaults to scene south (+Z; scene north is -Z).
  const direction = travelDirection && Math.hypot(...travelDirection) > 1e-9
    ? travelDirection.map((value) => value / Math.hypot(...travelDirection))
    : [0, 0, -1];
  const elevation = 50 * Math.PI / 180;
  const horizontal = Math.cos(elevation) * frame.distance;
  const position = [
    frame.centroid[0] - direction[0] * horizontal,
    frame.centroid[1] + Math.sin(elevation) * frame.distance,
    frame.centroid[2] - direction[2] * horizontal,
  ];
  return { ...frame, position, target: [...frame.centroid], direction };
}
