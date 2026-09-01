export const CUSTODY_FLAGS = Object.freeze(['DAMAGED','DG','HIGH_VALUE','DO_NOT_STACK','TEMP_CONTROL','CUSTOMS_HOLD','TSA_CONTROLLED','STA_REQUIRED','BONDED','FTZ']);

export const REFERENCE_TYPES = Object.freeze(['PO','SO','BOL','PRO','TRACKING','ENTRY','CONTAINER','SEAL','CUSTOMER_REF','SHIPPER_REF','ASN']);

export function requiredTransferChecks(flags = [], direction = 'outbound') {
  const set = new Set(flags);
  const checks = [
    { id: 'cargo_verified', label: 'Cargo count / identity verified', blocking: true },
    { id: 'transfer_document', label: direction === 'outbound' ? 'Release authorization verified' : 'Delivery document verified', blocking: true },
    { id: 'signed_bol', label: 'BOL / custody document signed', blocking: true },
    { id: 'identity', label: 'Driver / recipient identity verified', blocking: direction === 'outbound' }
  ];
  if (set.has('STA_REQUIRED') || set.has('TSA_CONTROLLED')) checks.push({ id: 'sta', label: 'STA / TSA requirement verified', blocking: true });
  if (set.has('BONDED')) checks.push({ id: 'bonded_carrier', label: 'Bonded carrier verified', blocking: true });
  if (set.has('CUSTOMS_HOLD')) checks.push({ id: 'customs_release', label: 'Customs hold released', blocking: true });
  if (set.has('DAMAGED')) checks.push({ id: 'damage_evidence', label: 'Damage photos / exception recorded', blocking: false });
  return checks;
}

export function canTransferCustody(requirements = []) {
  return requirements.filter(x => x.blocking).every(x => x.status === 'verified' || x.status === 'waived');
}
