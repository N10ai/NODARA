import {supabase} from './supabase-client.js';
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = (value,currency) => new Intl.NumberFormat(undefined,{style:'currency',currency:currency||'USD'}).format(Number(value)||0);

export async function renderQuoteOperations(host, quote, refresh) {
  const results = await Promise.all([
    supabase.from('quote_transaction_links').select('transaction_id,transactions(document_number,transaction_type,status_projection)').eq('organization_id',quote.organization_id).eq('quote_id',quote.id),
    supabase.from('operational_charges').select('id,transaction_id,description,sell_amount,currency,billing_status,billable_at,invoice_id,customer_invoices(invoice_number,status)').eq('organization_id',quote.organization_id).eq('quote_id',quote.id)
  ]);
  if (!host.isConnected) return;
  const failed = results.find(result=>result.error);
  if(failed){host.innerHTML=`<p class="notice warning">Commercial links could not load: ${esc(failed.error.message)}</p>`;return;}
  const links=results[0].data||[],charges=results[1].data||[];
  host.innerHTML=`<div class="cq-section-head"><div><small>QUOTE → OPERATION → INVOICE</small><h2>Linked operations</h2><p>Create the operation from this accepted RFQ quote. Agreed charges follow automatically and bill according to the customer policy.</p></div>${quote.status==='ACCEPTED'?'<div><button class="primary" data-create-operation>Create operation</button><button data-link-operation>Link existing operation</button></div>':''}</div><div class="bp-list">${links.map(link=>{
    const operation=link.transactions||{},rows=charges.filter(row=>row.transaction_id===link.transaction_id);
    const invoices=[...new Map(rows.filter(row=>row.invoice_id).map(row=>[row.invoice_id,row.customer_invoices])).entries()];
    const ready=rows.filter(row=>!row.invoice_id&&row.billable_at&&new Date(row.billable_at)<=new Date()).length;
    return `<article><div><b>${esc(operation.document_number||'Operation')}</b><span>${esc(operation.transaction_type?.replaceAll('_',' '))} · ${esc(operation.status_projection||'Active')}</span><span>${rows.length} charges · ${ready} ready · ${rows.filter(row=>row.invoice_id).length} invoiced</span></div><div>${invoices.map(([id,invoice])=>`<button data-linked-invoice="${esc(id)}">${esc(invoice?.invoice_number||'Invoice')} · ${esc(invoice?.status||'')}</button>`).join('')||'<span>Awaiting billing</span>'}</div></article>`;
  }).join('')||'<p class="muted">No operations linked yet.</p>'}</div>`;
  host.querySelector('[data-create-operation]')?.addEventListener('click',()=>createOperation(quote,refresh));
  host.querySelector('[data-link-operation]')?.addEventListener('click',()=>operationPicker(quote,refresh));
  host.querySelectorAll('[data-linked-invoice]').forEach(button=>button.onclick=async()=>{
    const module=await import('./invoices-workspace.js?v=20261011-pipeline2');
    await module.openInvoice(button.dataset.linkedInvoice);
  });
}

async function operationPicker(quote, refresh) {
  const overlay=document.createElement('div');overlay.className='bp-modal';
  overlay.innerHTML='<div role="dialog" aria-modal="true" aria-labelledby="operation-title"><h2 id="operation-title">Apply accepted quote</h2><p class="muted">Choose an existing operation for this customer.</p><label>Find operation<input data-search placeholder="Shipment, receipt, release, transport order…"></label><div data-list>Loading operations…</div><p data-error role="alert"></p><div class="actions"><button data-close>Close</button></div></div>';
  document.body.append(overlay);let busy=false;
  overlay.querySelector('[data-close]').onclick=()=>{if(!busy)overlay.remove();};
  const {data,error}=await supabase.rpc('nodara_quote_operation_candidates',{p_quote_id:quote.id});
  if(!overlay.isConnected)return;
  if(error){overlay.querySelector('[data-list]').textContent=error.message;return;}
  const render=()=>{
    const query=overlay.querySelector('[data-search]').value.toLowerCase();
    const rows=(data||[]).filter(row=>`${row.document_number} ${row.transaction_type}`.toLowerCase().includes(query));
    overlay.querySelector('[data-list]').innerHTML=rows.map(row=>`<button class="ni-group" data-operation="${esc(row.transaction_id)}" ${row.already_linked?'disabled':''}><span><b>${esc(row.document_number||'Operation')}</b><small>${esc(row.transaction_type.replaceAll('_',' '))} · ${esc(row.status||'Active')}</small></span><span>${row.already_linked?'Already linked':'Apply quote'}</span></button>`).join('')||'<p class="muted">No matching active operations. Set the operation’s customer before applying this quote.</p>';
    overlay.querySelectorAll('[data-operation]').forEach(button=>button.onclick=async()=>{
      if(busy)return;busy=true;overlay.querySelectorAll('button').forEach(b=>b.disabled=true);
      const {error}=await supabase.rpc('nodara_apply_quote_to_transaction',{p_quote_id:quote.id,p_transaction_id:button.dataset.operation});
      if(error){busy=false;overlay.querySelector('[data-error]').textContent=error.message;overlay.querySelector('[data-close]').disabled=false;render();return;}
      overlay.remove();await refresh();
    });
  };
  render();overlay.querySelector('[data-search]').oninput=()=>{if(!busy)render();};overlay.querySelector('[data-search]').focus();
}

async function createOperation(quote,refresh){
 const overlay=document.createElement('div');overlay.className='bp-modal';
 const kinds=['SHIPMENT','TRANSPORT_ORDER','WAREHOUSE_RECEIPT'];
 overlay.innerHTML=`<div role="dialog" aria-modal="true" aria-labelledby="create-operation-title"><h2 id="create-operation-title">Create operation from quote</h2><p>The customer, route and agreed charges carry over automatically.</p><form><label>Operation<select name="kind">${kinds.map(kind=>`<option value="${kind}" ${kind===(['WAREHOUSE','FTZ'].includes(quote.mode)?'WAREHOUSE_RECEIPT':'SHIPMENT')?'selected':''}>${kind.replaceAll('_',' ')}</option>`).join('')}</select></label><p data-error role="alert"></p><div class="actions"><button type="button" data-close>Cancel</button><button class="primary" type="submit">Create operation</button></div></form></div>`;
 document.body.append(overlay);let busy=false;overlay.querySelector('[data-close]').onclick=()=>{if(!busy)overlay.remove();};
 overlay.querySelector('form').onsubmit=async event=>{event.preventDefault();if(busy)return;busy=true;const button=event.currentTarget.querySelector('[type=submit]');button.disabled=true;const{data,error}=await supabase.rpc('nodara_create_operation_from_quote',{p_quote_id:quote.id,p_kind:event.currentTarget.elements.kind.value});if(error){overlay.querySelector('[data-error]').textContent=error.message;busy=false;button.disabled=false;return;}overlay.remove();await refresh();};
}
