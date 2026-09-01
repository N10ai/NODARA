export function scoreExpectedReceipt(receipt, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return 0;
  let score = 0;
  const values = [receipt.customer_name, receipt.shipper_name, receipt.consignee_name, receipt.description, receipt.commodity]
    .filter(Boolean).map(v => String(v).toLowerCase());
  if (values.some(v => v === q)) score += 50;
  if (values.some(v => v.includes(q))) score += 20;
  for (const ref of receipt.references || []) {
    const value = String(ref.reference_value || ref.value || '').toLowerCase();
    if (value === q) score += 100;
    else if (value.includes(q)) score += 40;
  }
  return score;
}

export function rankExpectedReceipts(receipts, query) {
  return (receipts || [])
    .map(receipt => ({ receipt, score: scoreExpectedReceipt(receipt, query) }))
    .filter(item => item.score > 0)
    .sort((a,b) => b.score - a.score);
}

export function expectedReceiptCard(receipt, rules = {}) {
  return {
    customer: receipt.customer_name || 'Customer',
    route: [receipt.shipper_name, receipt.consignee_name].filter(Boolean).join(' → '),
    description: receipt.description || receipt.commodity || 'Expected cargo',
    expected: `${receipt.expected_pieces || '—'} ${receipt.expected_package_type || ''}`.trim(),
    service: receipt.service_name || null,
    rules
  };
}
