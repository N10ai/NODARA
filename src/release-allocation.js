export function allocateRelease(request, inventory, strategy = 'full_package_fifo') {
  const qty = Number(request.quantity || 0);
  if (!qty && !request.cargoUnitId && !request.serialNumber) return { allocations: [], remaining: 0 };

  let candidates = inventory.filter(item => item.available !== false);
  if (request.partNumber) candidates = candidates.filter(i => i.partNumber === request.partNumber);
  if (request.sku) candidates = candidates.filter(i => i.sku === request.sku);
  if (request.lotNumber) candidates = candidates.filter(i => i.lotNumber === request.lotNumber);
  if (request.serialNumber) candidates = candidates.filter(i => i.serialNumber === request.serialNumber);
  if (request.cargoUnitId) candidates = candidates.filter(i => i.id === request.cargoUnitId || i.parentId === request.cargoUnitId);

  if (strategy === 'full_package_fifo') {
    candidates = [...candidates].sort((a, b) => {
      const aFull = a.isFullPackage ? 0 : 1;
      const bFull = b.isFullPackage ? 0 : 1;
      if (aFull !== bFull) return aFull - bFull;
      return new Date(a.receivedAt || 0) - new Date(b.receivedAt || 0);
    });
  }

  if (request.serialNumber || request.cargoUnitId) {
    return { allocations: candidates.map(c => ({ cargoUnitId: c.id, quantity: c.availableQuantity || 1, uom: c.uom || 'EA' })), remaining: 0 };
  }

  let remaining = qty;
  const allocations = [];
  for (const item of candidates) {
    if (remaining <= 0) break;
    const available = Number(item.availableQuantity || 0);
    if (!available) continue;
    const take = Math.min(available, remaining);
    allocations.push({ cargoUnitId: item.id, quantity: take, uom: item.uom || request.uom || 'EA', locationId: item.locationId || null });
    remaining -= take;
  }
  return { allocations, remaining };
}

export function describeAllocation(result, inventoryById = {}) {
  return result.allocations.map(a => {
    const item = inventoryById[a.cargoUnitId] || {};
    return { ...a, label: item.uin || item.serialNumber || item.partNumber || a.cargoUnitId, location: item.locationCode || null };
  });
}
