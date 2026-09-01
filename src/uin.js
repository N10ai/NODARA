const PREFIXES = Object.freeze({
  pallet: 'PLT',
  carton: 'CTN',
  box: 'CTN',
  crate: 'CRT',
  unit: 'UNT',
  piece: 'PCE'
});

export function uinPrefix(packageType) {
  return PREFIXES[String(packageType || '').toLowerCase()] || 'UIN';
}

export function generateUin(packageType, sequence, date = new Date()) {
  const prefix = uinPrefix(packageType);
  const yy = String(date.getUTCFullYear()).slice(-2);
  const number = String(sequence).padStart(6, '0');
  return `${prefix}-${yy}-${number}`;
}

export function pieceLabel(pieceNumber, pieceTotal) {
  if (!pieceNumber || !pieceTotal) return null;
  return `${pieceNumber} of ${pieceTotal}`;
}
