import { generateUin } from './uin.js';

export function buildReceivingPayload(draft, context) {
  const now = context.now || new Date();
  const jobNumber = context.jobNumber;
  const receiptNumber = context.receiptNumber;
  let sequence = context.startingUinSequence || 1;

  const cargo = draft.handlingUnits.map(unit => ({
    localId: unit.localId,
    parentLocalId: unit.parentLocalId || null,
    organization_id: context.organizationId,
    job_id: context.jobId || null,
    handling_unit_code: unit.uin || generateUin(unit.packageType, sequence++, now),
    uin: unit.uin || null,
    package_type: unit.packageType,
    quantity: Number(unit.quantity || 1),
    sku: unit.sku || null,
    part_number: unit.partNumber || null,
    serial_number: unit.serialNumber || null,
    lot_number: unit.lotNumber || null,
    units_per_parent: unit.unitsPerPackage ?? null,
    weight_lb: unit.weightLb ?? null,
    length_in: unit.lengthIn ?? null,
    width_in: unit.widthIn ?? null,
    height_in: unit.heightIn ?? null,
    status: 'received',
    piece_number: unit.pieceNumber ?? null,
    piece_total: unit.pieceTotal ?? null
  }));

  return {
    job: {
      organization_id: context.organizationId,
      job_number: jobNumber,
      customer_id: draft.customerId,
      status: 'in_progress',
      reference: draft.reference || null,
      description: draft.notes || null
    },
    warehouseReceipt: {
      organization_id: context.organizationId,
      job_id: context.jobId || null,
      receipt_number: receiptNumber,
      status: draft.exceptions?.length ? 'exception' : 'completed',
      started_at: context.startedAt || now.toISOString(),
      completed_at: now.toISOString(),
      notes: draft.notes || null
    },
    cargo,
    measurements: (draft.measurements || []).map(item => ({
      organization_id: context.organizationId,
      localUnitId: item.localUnitId || null,
      source: item.source,
      length_in: item.lengthIn,
      width_in: item.widthIn,
      height_in: item.heightIn,
      weight_lb: item.weightLb,
      confidence: item.confidence,
      verified: Boolean(item.verified)
    })),
    exceptions: (draft.exceptions || []).map(item => ({
      organization_id: context.organizationId,
      exception_type: item.type,
      severity: item.severity || 'warning',
      description: item.description,
      status: 'open'
    })),
    workflowEvent: {
      organization_id: context.organizationId,
      event_type: 'warehouse_receipt_completed',
      event_data: {
        depth: draft.depth,
        reference: draft.reference || null,
        handling_unit_count: cargo.length,
        exception_count: draft.exceptions?.length || 0
      }
    }
  };
}
