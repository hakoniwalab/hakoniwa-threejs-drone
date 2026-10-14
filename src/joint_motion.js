export function jointBindingSpec(part) {
  const sourceJoint = part.source_joint ?? part.joint;
  const multiplier = part.multiplier ?? 1.0;
  if (typeof sourceJoint !== "string" || sourceJoint.length === 0) {
    throw new Error("[Vehicle] joint source must be a non-empty string.");
  }
  if (!Number.isFinite(multiplier) || multiplier === 0) {
    throw new Error("[Vehicle] joint multiplier must be finite and non-zero.");
  }
  return { sourceJoint, multiplier };
}
