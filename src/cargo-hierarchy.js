export function buildCargoHierarchy(input) {
  const {
    pallets = 0,
    packagesPerPallet = 0,
    unitsPerPackage = 0,
    packageType = 'box',
    sku = null,
    partNumber = null,
    lotNumber = null,
    serialNumbers = []
  } = input;

  const nodes = [];
  let palletIndex = 0;
  let packageIndex = 0;

  for (let p = 0; p < Number(pallets || 0); p += 1) {
    palletIndex += 1;
    const palletLocalId = `pallet-${palletIndex}`;
    nodes.push({
      localId: palletLocalId,
      parentLocalId: null,
      packageType: 'pallet',
      quantity: 1,
      pieceNumber: palletIndex,
      pieceTotal: Number(pallets || 0),
      sku,
      partNumber,
      lotNumber
    });

    for (let b = 0; b < Number(packagesPerPallet || 0); b += 1) {
      packageIndex += 1;
      const packageLocalId = `${packageType}-${packageIndex}`;
      nodes.push({
        localId: packageLocalId,
        parentLocalId: palletLocalId,
        packageType,
        quantity: 1,
        unitsPerPackage: Number(unitsPerPackage || 0) || null,
        pieceNumber: b + 1,
        pieceTotal: Number(packagesPerPallet || 0),
        sku,
        partNumber,
        lotNumber
      });
    }
  }

  serialNumbers.filter(Boolean).forEach((serialNumber, index) => {
    nodes.push({
      localId: `unit-${index + 1}`,
      parentLocalId: null,
      packageType: 'unit',
      quantity: 1,
      serialNumber,
      sku,
      partNumber,
      lotNumber,
      pieceNumber: index + 1,
      pieceTotal: serialNumbers.filter(Boolean).length
    });
  });

  return nodes;
}

export function summarizeHierarchy(nodes) {
  return nodes.reduce((summary, node) => {
    summary[node.packageType] = (summary[node.packageType] || 0) + Number(node.quantity || 0);
    if (node.unitsPerPackage) summary.units += Number(node.unitsPerPackage) * Number(node.quantity || 0);
    if (node.packageType === 'unit') summary.units += Number(node.quantity || 0);
    return summary;
  }, { units: 0 });
}
