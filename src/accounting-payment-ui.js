import { supabase } from './supabase-client.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (value, currency) => new Intl.NumberFormat(undefined, {style:'currency', currency:currency || 'USD'}).format(Number(value) || 0);

export function currencyTotals(rows, amount, vendor = false) {
  const sums = new Map();
  for (const row of rows) {
    const currency = (vendor && row.vendor_currency) || row.currency || 'USD';
    sums.set(currency, (sums.get(currency) || 0) + Number(amount(row) || 0));
  }
  return [...sums].map(([currency, value]) => money(value, currency)).join(' · ') || money(0, 'USD');
}

export function groupCharges(rows, partyKey, vendor = false) {
  const groups = new Map();
  for (const row of rows) {
    if (!row[partyKey]) continue;
    const key = JSON.stringify([row[partyKey], (vendor && row.vendor_currency) || row.currency || 'USD',vendor?null:row.billing_group_key||null]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups.values()];
}

export async function paymentHistory(host, record, org, vendor = false) {
  const table = vendor ? 'vendor_payment_allocations' : 'customer_payment_allocations';
  const payments = vendor ? 'vendor_payments' : 'customer_payments';
  const key = vendor ? 'bill_id' : 'invoice_id';
  const {data, error} = await supabase.from(table).select(`amount,${payments}(payment_number,payment_date,method,reference,status)`).eq('organization_id', org).eq(key, record.id).order('created_at');
  if (!host.isConnected) return;
  host.innerHTML = error ? `<p class="notice warning">Payment history could not load: ${esc(error.message)}</p>` : `<h2>Payment history</h2><div class="bp-list">${(data || []).map(row => {
    const payment = row[payments] || {};
    return `<article><div><b>${esc(payment.payment_number)}</b><span>${esc(payment.payment_date)} · ${esc(payment.method || 'Other')} · ${esc(payment.status || '')}</span><span>${esc(payment.reference || '')}</span></div><b>${money(row.amount, record.currency)}</b></article>`;
  }).join('') || '<p class="muted">No payments recorded for this record.</p>'}</div>`;
}

export function recordPayment(record, org, vendor, onSaved) {
  const priorFocus = document.activeElement;
  const overlay = document.createElement('div');
  overlay.className = 'bp-modal';
  overlay.innerHTML = `<div role="dialog" aria-modal="true" aria-labelledby="payment-title"><h2 id="payment-title">${vendor ? 'Record vendor payment' : 'Receive payment'}</h2><p>${esc(record.bill_number || record.invoice_number)} · Balance ${money(record.balance, record.currency)}</p><form><label>Amount (${esc(record.currency)})<input name="amount" type="number" min="0.01" max="${Number(record.balance)}" step="0.01" required value="${Number(record.balance).toFixed(2)}"></label><label>Method<select name="method">${['ACH','WIRE','CHECK','CARD','CASH','OTHER'].map(method => `<option>${method}</option>`).join('')}</select></label><label>Reference<input name="reference" maxlength="200" placeholder="Bank reference, check number…"></label><p class="muted">Records a payment already made. No money is transferred. Posting date is today.</p><p data-error role="alert"></p><div class="actions"><button type="button" data-cancel>Cancel</button><button type="submit" class="primary">Post payment</button></div></form></div>`;
  document.body.append(overlay);
  const form = overlay.querySelector('form'), submit = form.querySelector('[type=submit]');
  let busy = false;
  const close = () => { if (!busy) { overlay.remove(); priorFocus?.focus(); } };
  overlay.querySelector('[data-cancel]').onclick = close;
  overlay.addEventListener('keydown', event => {
    if (event.key === 'Escape') close();
    if (event.key === 'Tab') {
      const controls = [...overlay.querySelectorAll('input,select,button')].filter(x => !x.disabled);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  form.elements.amount.focus();
  form.onsubmit = async event => {
    event.preventDefault();
    if (busy) return;
    const amount = Number(form.elements.amount.value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > Number(record.balance)) return;
    busy = true; submit.disabled = true; submit.textContent = 'Posting…';
    const message = overlay.querySelector('[data-error]');
    message.textContent = '';
    try {
      const {error} = await supabase.rpc(vendor ? 'nodara_post_vendor_payment' : 'nodara_post_customer_payment', {
        p_organization_id:org, [vendor ? 'p_vendor_id' : 'p_customer_id']:record[vendor ? 'vendor_id' : 'customer_id'],
        p_amount:amount, p_currency:record.currency, p_method:form.elements.method.value,
        p_reference:form.elements.reference.value.trim() || null,
        p_allocations:[{[vendor ? 'bill_id' : 'invoice_id']:record.id, amount}]
      });
      if (error) throw error;
    } catch (error) {
      message.textContent = error.message;
      busy = false; submit.disabled = false; submit.textContent = 'Post payment';
      return;
    }
    overlay.remove();
    await onSaved();
  };
}
