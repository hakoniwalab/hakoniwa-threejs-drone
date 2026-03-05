export function validateCompactPdudef(pdudef, sourceLabel = "StateSource") {
  const robots = Array.isArray(pdudef?.robots) ? pdudef.robots : [];
  const paths = Array.isArray(pdudef?.paths) ? pdudef.paths : [];
  if (robots.length === 0) {
    throw new Error(`[${sourceLabel}] compact pdudef validation failed: robots[] is required.`);
  }
  if (paths.length === 0) {
    throw new Error(`[${sourceLabel}] compact pdudef validation failed: paths[] is required.`);
  }
  const pathIdSet = new Set(paths.map((p) => p?.id).filter(Boolean));
  for (const robot of robots) {
    if (!robot?.name) {
      throw new Error(`[${sourceLabel}] compact pdudef validation failed: robots[].name is required.`);
    }
    if (!robot?.pdutypes_id) {
      throw new Error(`[${sourceLabel}] compact pdudef validation failed: robot='${robot.name}' requires pdutypes_id.`);
    }
    if (!pathIdSet.has(robot.pdutypes_id)) {
      throw new Error(
        `[${sourceLabel}] compact pdudef validation failed: unknown pdutypes_id='${robot.pdutypes_id}' for robot='${robot.name}'.`
      );
    }
  }
  return { robots, paths };
}

export async function loadPdutypeTable(compactPdudef, pdudefUrl, sourceLabel = "StateSource") {
  const table = new Map();
  for (const pathDef of compactPdudef.paths) {
    const pathId = pathDef?.id;
    const relPath = pathDef?.path;
    if (!pathId || !relPath) {
      throw new Error(`[${sourceLabel}] compact pdudef paths[] requires id/path.`);
    }
    const resolvedUrl = new URL(relPath, pdudefUrl).toString();
    const res = await fetch(resolvedUrl);
    if (!res.ok) {
      throw new Error(`[${sourceLabel}] failed to load pdutypes: ${resolvedUrl}`);
    }
    const pdutypes = await res.json();
    if (!Array.isArray(pdutypes)) {
      throw new Error(`[${sourceLabel}] invalid pdutypes format: ${resolvedUrl}`);
    }
    table.set(pathId, pdutypes);
  }
  return table;
}

export function collectChannelsByPdutype(robots, pdutype, pdutypeTable) {
  const channels = [];
  for (const robot of robots) {
    const robotName = robot.name;
    const pdutypes = pdutypeTable.get(robot.pdutypes_id) ?? [];
    for (const pdu of pdutypes) {
      if (pdu?.type !== pdutype) continue;
      const pduName = pdu?.name ?? pdu?.org_name;
      if (!pduName) continue;
      channels.push({
        robotName,
        pduName,
      });
    }
  }
  return channels;
}

