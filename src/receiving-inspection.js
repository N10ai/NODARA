export const CONDITION_STATES = Object.freeze(['good','damaged','wet','crushed','open','other']);

export function addMeasurement(draft, measurement) {
  return {
    ...draft,
    measurements: [...(draft.measurements || []), {
      localUnitId: measurement.localUnitId || null,
      source: measurement.source || 'manual',
      lengthIn: measurement.lengthIn ?? null,
      widthIn: measurement.widthIn ?? null,
      heightIn: measurement.heightIn ?? null,
      weightLb: measurement.weightLb ?? null,
      confidence: measurement.confidence ?? null,
      verified: Boolean(measurement.verified)
    }]
  };
}

export function setUnitCondition(unit, condition, notes = '') {
  return {
    ...unit,
    condition: CONDITION_STATES.includes(condition) ? condition : 'other',
    conditionNotes: notes
  };
}

export function detectMeasurementExceptions(expected, actual, tolerance = { inches: 2, weightPct: 5 }) {
  const exceptions = [];
  const dimensionKeys = [['lengthIn','Length'],['widthIn','Width'],['heightIn','Height']];
  dimensionKeys.forEach(([key,label]) => {
    if (expected?.[key] != null && actual?.[key] != null) {
      const delta = Number(actual[key]) - Number(expected[key]);
      if (Math.abs(delta) > tolerance.inches) {
        exceptions.push({ type: 'dimension', severity: 'warning', field: key, description: `${label} differs by ${delta.toFixed(1)} in` });
      }
    }
  });
  if (expected?.weightLb != null && actual?.weightLb != null && Number(expected.weightLb) > 0) {
    const pct = ((Number(actual.weightLb) - Number(expected.weightLb)) / Number(expected.weightLb)) * 100;
    if (Math.abs(pct) > tolerance.weightPct) {
      exceptions.push({ type: 'weight', severity: 'warning', field: 'weightLb', description: `Weight differs by ${pct.toFixed(1)}%` });
    }
  }
  return exceptions;
}
