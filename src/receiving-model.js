export const RECEIVING_DEPTHS = Object.freeze({
  HANDLING_UNIT: 'handling_unit',
  PACKAGES: 'packages',
  UNITS: 'units',
  SERIALIZED: 'serialized'
});

export function createReceivingDraft() {
  return {
    customerId: null,
    reference: '',
    depth: RECEIVING_DEPTHS.HANDLING_UNIT,
    handlingUnits: [],
    measurements: [],
    exceptions: [],
    photos: [],
    notes: ''
  };
}

export function addHandlingUnit(draft, unit) {
  return {
    ...draft,
    handlingUnits: [...draft.handlingUnits, {
      parentLocalId: null,
      packageType: 'pallet',
      quantity: 1,
      sku: null,
      partNumber: null,
      serialNumber: null,
      lotNumber: null,
      unitsPerPackage: null,
      ...unit
    }]
  };
}

export function totalContainedUnits(draft) {
  return draft.handlingUnits.reduce((total, unit) => {
    const packages = Number(unit.quantity || 0);
    const each = Number(unit.unitsPerPackage || 0);
    return total + (each ? packages * each : packages);
  }, 0);
}

export function validateReceivingDraft(draft) {
  const errors = [];
  if (!draft.customerId) errors.push('Customer is required');
  if (!draft.handlingUnits.length) errors.push('At least one handling unit is required');
  if (draft.depth === RECEIVING_DEPTHS.SERIALIZED && draft.handlingUnits.some(unit => !unit.serialNumber)) {
    errors.push('Every serialized unit requires a serial number');
  }
  return errors;
}
