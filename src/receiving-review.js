import { totalContainedUnits, validateReceivingDraft } from './receiving-model.js';

export function summarizeReceiving(draft) {
  const pallets = draft.handlingUnits.filter(u => u.packageType === 'pallet').length;
  const cartons = draft.handlingUnits.filter(u => ['box','carton'].includes(u.packageType)).length;
  const units = totalContainedUnits(draft);
  const weight = (draft.measurements || []).reduce((sum, m) => sum + Number(m.weightLb || 0), 0);

  return {
    customerId: draft.customerId,
    reference: draft.reference,
    depth: draft.depth,
    pallets,
    cartons,
    units,
    totalWeightLb: weight || null,
    exceptions: draft.exceptions || [],
    photos: (draft.photos || []).length,
    errors: validateReceivingDraft(draft)
  };
}

export function canCompleteReceiving(draft) {
  return summarizeReceiving(draft).errors.length === 0;
}

export function exceptionCountBySeverity(draft) {
  return (draft.exceptions || []).reduce((acc, item) => {
    acc[item.severity || 'warning'] = (acc[item.severity || 'warning'] || 0) + 1;
    return acc;
  }, {});
}
