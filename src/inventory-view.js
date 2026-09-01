export function aggregateInventory(units = []) {
  const groups = new Map();
  for (const unit of units) {
    const key = unit.part_number || unit.partNumber || unit.sku || unit.description || 'UNSPECIFIED';
    if (!groups.has(key)) groups.set(key, { key, description: unit.description || '', units: 0, cartons: 0, pallets: 0, locations: new Set(), partialCartons: 0, rows: [] });
    const g = groups.get(key);
    const type = String(unit.package_type || unit.packageType || '').toLowerCase();
    const qty = Number(unit.quantity || 0);
    const contained = Number(unit.units_per_parent || unit.unitsPerPackage || 0);
    if (type === 'unit' || type === 'piece') g.units += qty;
    else if (type === 'carton' || type === 'box') { g.cartons += qty; g.units += contained ? qty * contained : 0; if (contained && qty < 1) g.partialCartons += 1; }
    else if (type === 'pallet') g.pallets += qty;
    const loc = unit.location_code || unit.locationCode;
    if (loc) g.locations.add(loc);
    g.rows.push(unit);
  }
  return [...groups.values()].map(g => ({ ...g, locations: [...g.locations] }));
}

export function physicalSummary(group) {
  const parts = [];
  if (group.pallets) parts.push(`${group.pallets} PLT`);
  if (group.cartons) parts.push(`${group.cartons} CTN`);
  if (group.partialCartons) parts.push(`${group.partialCartons} partial`);
  return parts.join(' · ') || 'Loose inventory';
}
