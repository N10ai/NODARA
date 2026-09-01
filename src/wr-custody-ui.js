import { requiredTransferChecks } from './custody-compliance.js';

export function renderInboundCustody(container, state = {}, onContinue) {
  const flags = state.flags || [];
  const checks = requiredTransferChecks(flags, 'inbound');
  container.innerHTML = `
    <div class="eyebrow">Warehouse · Receive · Delivery</div>
    <h1 class="flow-title">Who delivered it?</h1>
    <p class="muted">Capture the physical handoff. Transportation planning stays outside the warehouse workflow.</p>
    <div class="card" style="max-width:720px;margin-top:24px">
      <div class="row">
        ${field('carrier','Carrier / trucking company',state.carrier)}
        ${field('driver','Driver name',state.driver)}
        ${field('pro','PRO #',state.pro)}
        ${field('tracking','Tracking #',state.tracking)}
        ${field('bol','BOL / delivery receipt #',state.bol)}
        ${field('trailer','Trailer #',state.trailer)}
        ${field('door','Dock / door',state.door)}
        ${field('timeIn','Time in',state.timeIn || '')}
      </div>
      <div style="margin-top:18px"><strong>Custody checks</strong>${checks.map(c => `<label class="custody-check"><input type="checkbox" data-check="${c.id}"> <span>${c.label}${c.blocking?' · Required':''}</span></label>`).join('')}</div>
      <button id="continue-custody" class="primary" style="width:100%;margin-top:20px;padding:17px">Continue receiving</button>
    </div>`;
  container.querySelector('#continue-custody')?.addEventListener('click', () => {
    const values = Object.fromEntries([...container.querySelectorAll('[data-field]')].map(el => [el.dataset.field, el.value.trim()]));
    const verified = [...container.querySelectorAll('[data-check]')].filter(el => el.checked).map(el => el.dataset.check);
    onContinue?.({ ...state, ...values, custodyChecks: verified });
  });
}

function field(id,label,value='') { return `<div class="field"><label>${label}</label><input data-field="${id}" value="${escapeHtml(value || '')}"></div>`; }
function escapeHtml(v){return String(v).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
