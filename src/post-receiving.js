import { buildLabelModel, renderLabelHtml } from './label-engine.js';

export function renderPostReceiving(container, receipt, cargoUnits, callbacks = {}) {
  const printable = (cargoUnits || []).filter(unit => unit.uin || unit.handling_unit_code);
  container.innerHTML = `
    <div class="eyebrow">Warehouse · Received</div>
    <h1 class="flow-title">${escapeHtml(receipt.receipt_number)} is complete.</h1>
    <p class="muted">Labels are ready. Then move the cargo to its storage location.</p>
    <div class="card" style="max-width:720px;margin-top:24px">
      <div class="cargo-summary">
        <div><span>Labels ready</span><strong>${printable.length}</strong></div>
        <div><span>Exceptions</span><strong>${receipt.exception_count || 0}</strong></div>
        <div><span>Next</span><strong>Putaway</strong></div>
      </div>
      <button id="print-labels" class="primary" style="width:100%;margin-top:20px;padding:17px">Print labels</button>
      <button id="start-putaway" class="choice"><span>Scan putaway location</span></button>
      <div id="label-preview" style="display:none;margin-top:18px"></div>
    </div>`;

  container.querySelector('#print-labels')?.addEventListener('click', () => {
    const preview = container.querySelector('#label-preview');
    preview.style.display = 'block';
    preview.innerHTML = printable.map(unit => renderLabelHtml(buildLabelModel(unit, {
      receiptNumber: receipt.receipt_number,
      customerName: receipt.customer_name,
      reference: receipt.reference
    }))).join('');
    callbacks.onPrint?.(printable);
  });

  container.querySelector('#start-putaway')?.addEventListener('click', () => callbacks.onPutaway?.(printable));
}

export function renderPutaway(container, units, onAssign) {
  let index = 0;
  const draw = () => {
    const unit = units[index];
    if (!unit) {
      container.innerHTML = `<div class="eyebrow">Warehouse · Putaway</div><h1 class="flow-title">Putaway complete.</h1><p class="muted">All received cargo has a storage location.</p>`;
      return;
    }
    container.innerHTML = `
      <div class="eyebrow">Warehouse · Putaway</div>
      <h1 class="flow-title">Scan a location.</h1>
      <p class="muted">${escapeHtml(unit.uin || unit.handling_unit_code)} · ${index + 1} of ${units.length}</p>
      <div class="card" style="max-width:620px;margin-top:24px">
        <input id="location-code" class="putaway-input" placeholder="Scan or enter location" autofocus>
        <button id="assign-location" class="primary" style="width:100%;margin-top:12px;padding:17px">Confirm location</button>
      </div>`;
    container.querySelector('#assign-location')?.addEventListener('click', async () => {
      const code = container.querySelector('#location-code').value.trim();
      if (!code) return;
      await onAssign(unit, code);
      index += 1;
      draw();
    });
  };
  draw();
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}
