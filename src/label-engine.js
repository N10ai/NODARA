import { pieceLabel } from './uin.js';

export function chooseLabelSize(unit) {
  const type = String(unit.package_type || unit.packageType || '').toLowerCase();
  return ['unit','piece'].includes(type) ? '2x1' : '4x6';
}

export function buildLabelModel(unit, context = {}) {
  const size = context.labelSize || chooseLabelSize(unit);
  const contained = unit.units_per_parent || unit.unitsPerPackage || null;
  return {
    size,
    uin: unit.uin || unit.handling_unit_code,
    wr: context.receiptNumber || null,
    customer: context.customerName || null,
    reference: context.reference || null,
    packageType: unit.package_type || unit.packageType || null,
    piece: pieceLabel(unit.piece_number || unit.pieceNumber, unit.piece_total || unit.pieceTotal),
    partNumber: unit.part_number || unit.partNumber || null,
    sku: unit.sku || null,
    serialNumber: unit.serial_number || unit.serialNumber || null,
    lotNumber: unit.lot_number || unit.lotNumber || null,
    containedUnits: contained,
    weightLb: unit.weight_lb ?? unit.weightLb ?? null,
    dimensions: formatDimensions(unit),
    location: context.locationCode || null
  };
}

export function renderLabelHtml(model) {
  const compact = model.size === '2x1';
  const fields = compact
    ? [model.partNumber || model.sku, model.serialNumber && `SN ${model.serialNumber}`, model.wr && `WR ${model.wr}`]
    : [model.customer, model.reference, model.piece, model.dimensions, model.weightLb && `${model.weightLb} LB`, model.containedUnits && `${model.containedUnits} EA`, model.location && `LOC ${model.location}`];

  return `<div class="nodara-label label-${model.size}">
    <div class="label-brand">NODARA</div>
    ${fields.filter(Boolean).map(value => `<div>${escapeHtml(value)}</div>`).join('')}
    <div class="label-code" data-code="${escapeHtml(model.uin || '')}">${escapeHtml(model.uin || '')}</div>
  </div>`;
}

function formatDimensions(unit) {
  const l = unit.length_in ?? unit.lengthIn;
  const w = unit.width_in ?? unit.widthIn;
  const h = unit.height_in ?? unit.heightIn;
  return [l,w,h].every(value => value != null) ? `${l} × ${w} × ${h} IN` : null;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}
