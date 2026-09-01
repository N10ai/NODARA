import { RECEIVING_DEPTHS, validateReceivingDraft } from './receiving-model.js';

export const RECEIVING_STEPS = Object.freeze([
  'identify',
  'tracking_depth',
  'cargo',
  'measure',
  'condition',
  'review',
  'complete'
]);

export const TRACKING_OPTIONS = Object.freeze([
  { id: RECEIVING_DEPTHS.HANDLING_UNIT, title: 'Handling unit only', description: 'Track pallet, crate or loose piece as received.' },
  { id: RECEIVING_DEPTHS.PACKAGES, title: 'Packages', description: 'Track pallet and contained cartons or packages.' },
  { id: RECEIVING_DEPTHS.UNITS, title: 'Units / SKU', description: 'Track packages and contained item quantities.' },
  { id: RECEIVING_DEPTHS.SERIALIZED, title: 'Serialized', description: 'Track each controlled unit by serial number.' }
]);

export function nextReceivingStep(currentStep, draft) {
  if (currentStep === 'review') {
    const errors = validateReceivingDraft(draft);
    return errors.length ? { step: 'review', errors } : { step: 'complete', errors: [] };
  }
  const index = RECEIVING_STEPS.indexOf(currentStep);
  return { step: RECEIVING_STEPS[Math.min(index + 1, RECEIVING_STEPS.length - 1)], errors: [] };
}

export function previousReceivingStep(currentStep) {
  const index = RECEIVING_STEPS.indexOf(currentStep);
  return RECEIVING_STEPS[Math.max(index - 1, 0)];
}
