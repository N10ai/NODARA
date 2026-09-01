export function resolveReceivingRules(serviceProfile = {}, customerOverrides = {}, expectedReceipt = {}) {
  const base = {
    trackingDepth: serviceProfile.default_tracking_depth || 'handling_unit',
    requireDimensions: Boolean(serviceProfile.require_dimensions),
    requireWeight: Boolean(serviceProfile.require_weight),
    requiredPhotoCount: Number(serviceProfile.required_photo_count || 0),
    requirePutaway: serviceProfile.require_putaway !== false,
    requireLocationScan: serviceProfile.require_location_scan !== false,
    requirePieceLabels: serviceProfile.require_piece_labels !== false,
    requireItemLabels: Boolean(serviceProfile.require_item_labels),
    flags: [...(serviceProfile.default_flags || [])]
  };

  const merged = { ...base, ...(customerOverrides || {}) };
  merged.flags = [...new Set([...(base.flags || []), ...(customerOverrides.flags || []), ...(expectedReceipt.flags || [])])];
  return merged;
}

export function ruleSummary(rules) {
  const items = [];
  items.push(`Receive by ${String(rules.trackingDepth || 'handling unit').replaceAll('_',' ')}`);
  if (rules.requiredPhotoCount) items.push(`${rules.requiredPhotoCount} photos required`);
  if (rules.requireDimensions) items.push('Dimensions required');
  if (rules.requireWeight) items.push('Weight required');
  if (rules.requirePieceLabels) items.push('Piece labels');
  if (rules.requirePutaway) items.push('Putaway required');
  return items;
}
