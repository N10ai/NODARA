import { completeReceiving } from './receiving-rpc.js';
import { validateReceivingDraft } from './receiving-model.js';

export function renderReceivingConfirmation(container, draft, context, supabase, callbacks = {}) {
  const errors = validateReceivingDraft(draft);
  const units = draft.handlingUnits || [];
  const topLevel = units.filter(unit => !unit.parentLocalId);
  const packages = units.filter(unit => unit.parentLocalId && unit.packageType !== 'unit');
  const each = units.filter(unit => unit.packageType === 'unit');

  container.innerHTML = `
    <div class="eyebrow">Warehouse · Receive · Review</div>
    <h1 class="flow-title">Ready to receive.</h1>
    <p class="muted">One confirmation creates the warehouse receipt and inventory hierarchy.</p>
    <div class="card" style="max-width:680px;margin-top:24px">
      <div class="cargo-summary">
        <div><span>Handling units</span><strong>${topLevel.length}</strong></div>
        <div><span>Packages</span><strong>${packages.length}</strong></div>
        <div><span>Units</span><strong>${each.length || '—'}</strong></div>
      </div>
      <div style="margin-top:20px">
        <div class="muted">Reference</div><strong>${escapeHtml(draft.reference || 'No reference')}</strong>
      </div>
      <div style="margin-top:14px">
        <div class="muted">Tracking depth</div><strong>${escapeHtml(draft.depth)}</strong>
      </div>
      <div style="margin-top:14px">
        <div class="muted">Exceptions</div><strong>${draft.exceptions?.length || 0}</strong>
      </div>
      ${errors.length ? `<div class="receive-errors">${errors.map(error => `<div>${escapeHtml(error)}</div>`).join('')}</div>` : ''}
      <button id="confirm-receipt" class="primary" style="width:100%;margin-top:22px;padding:17px" ${errors.length ? 'disabled' : ''}>Confirm receipt</button>
      <div id="receive-status" class="muted" style="margin-top:12px;text-align:center"></div>
    </div>`;

  const button = container.querySelector('#confirm-receipt');
  if (!button || errors.length) return;

  button.addEventListener('click', async () => {
    const status = container.querySelector('#receive-status');
    button.disabled = true;
    button.textContent = 'Receiving…';
    status.textContent = 'Creating WR, inventory and cargo hierarchy';
    try {
      const result = await completeReceiving(supabase, draft, context);
      button.textContent = 'Received';
      status.textContent = `${result.receipt_number} completed`;
      callbacks.onComplete?.(result);
    } catch (error) {
      button.disabled = false;
      button.textContent = 'Confirm receipt';
      status.textContent = error.message || 'Receiving failed';
      callbacks.onError?.(error);
    }
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]));
}
