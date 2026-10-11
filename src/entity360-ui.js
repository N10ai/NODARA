import {supabase} from './supabase-client.js';
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=(v,c)=>new Intl.NumberFormat(undefined,{style:'currency',currency:c||'USD'}).format(Number(v)||0);
export function showEntityError(error){
 const shell=document.querySelector('.entity360-shell')||document.getElementById('main');
 let notice=shell.querySelector('[data-entity-error]');if(!notice){notice=document.createElement('div');notice.dataset.entityError='';notice.className='notice warning';notice.setAttribute('role','alert');shell.prepend(notice)}
 notice.textContent=error.message||String(error);
}
export function hasUnsavedEntityChanges(){return document.querySelector('.entity360-shell')?.dataset.dirty==='true'}
export function allowEntityNavigation(){return !hasUnsavedEntityChanges()||confirm('You have unsaved profile changes. Leave without saving?')}
export function mountEntity360(e){
 const main=document.getElementById('main'),shell=document.createElement('div');shell.className='entity360-shell';
 while(main.firstChild)shell.append(main.firstChild);main.append(shell);
 const header=shell.querySelector('.record-header');header.classList.add('entity360-header');
 const avatar=document.createElement('span');avatar.className='entity360-avatar';avatar.textContent=(e.name||'New').split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase();header.prepend(avatar);
 const meta=document.createElement('div');meta.className='entity360-meta';meta.textContent=[e.code,...(e.roles||[]).map(r=>r.replaceAll('_',' '))].filter(Boolean).join(' · ')||'Create a reusable company profile';header.querySelector('h1').after(meta);
 const body=document.createElement('div');body.className='entity360-body';const content=document.createElement('div');content.className='entity360-content';
 const tabs=shell.querySelector('.entity-tabs');tabs.setAttribute('aria-label','Profile sections');tabs.setAttribute('role','tablist');
 body.append(tabs,content);shell.querySelector('.record-header').after(body);
 shell.querySelectorAll('.record-section').forEach(s=>content.append(s));
 const footer=shell.querySelector(':scope > .record-footer-actions');footer.classList.add('entity360-savebar');const status=document.createElement('span');status.dataset.saveState='';status.textContent='Profile changes are saved together';status.setAttribute('role','status');footer.prepend(status);
 shell.querySelector('#entity-save').textContent='Save profile';if(e.id){shell.querySelector('#entity-save').disabled=true;status.textContent='Loading saved contacts and addresses…';}
 shell.addEventListener('input',event=>{if(event.target.closest('#identity,#contacts,#addresses'))markDirty()});
 shell.addEventListener('change',event=>{if(event.target.closest('#identity,#contacts,#addresses'))markDirty()});
 shell.addEventListener('click',event=>{if(event.target.closest('[data-role],[data-service],[data-cc-add],[data-ca-add],[data-cc-remove],[data-ca-remove]'))markDirty()});
 function markDirty(){footer.hidden=false;shell.dataset.dirty='true';status.textContent='Unsaved profile changes';}
 // Avoid a duplicate Overview tab on profiles with no customer/vendor summary.
 if(!e.roles?.includes('customer')&&!e.roles?.some(r=>['vendor','carrier','trucker','customs_broker'].includes(r)))tabs.querySelector('button')?.setAttribute('hidden','');
 footer.hidden=!(shell.querySelector('.entity-tabs .active')?.dataset.jump==='identity');
 const identity=shell.querySelector('#identity');const grids=identity.querySelectorAll(':scope > .detail-grid');if(grids[1]){const heading=document.createElement('h4');heading.textContent='Legal & billing details';grids[1].before(heading)}
 shell.querySelectorAll('[data-role]').forEach(b=>b.setAttribute('aria-pressed',b.classList.contains('selected')));
 const overview=shell.querySelector('#overview');overview?.querySelectorAll('.customer-summary-grid > div').forEach(card=>{if(card.querySelector('small')?.textContent==='Charges')card.remove()});
}
export async function openEntityDocuments(e,onBack){
 if(!allowEntityNavigation())return;
 const module=await import('./document-manager.js?v=20261011-onboarding1');
 await module.open({type:'ENTITY',id:e.id,reference:e.code||e.name,label:e.name+' · Documents',backLabel:e.name,onBack});
}
export async function openEntityOperation(record,onBack,label){
 if(!allowEntityNavigation())return;
 const main=document.getElementById('main');
 if(record.type==='WR'){const open=window.nodaraOpenCanonicalWR||window.nodaraWROpen;if(!open)throw Error('Warehouse receipt workspace is unavailable. Reload and try again.');await open(record.id)}
 else if(record.type==='CR'){if(!window.nodaraCROpen)throw Error('Cargo release workspace is unavailable. Reload and try again.');await window.nodaraCROpen(record.id)}
 else if(record.type==='SHIPMENT'){const module=await import('./shipment-canonical-v52.js?v=20260928-movement3');await module.openShipmentCanonical(record.id)}
 else if(record.type==='TRANSPORT'){const module=await import('./transport-order-detail.js');await module.openTransportOrderDetail(record.id,{back:onBack})}
 else if(record.type==='INVOICE'){const module=await import('./invoices-workspace.js?v=20261011-pipeline2');await module.openInvoice(record.id)}
 else throw Error('This record type cannot be opened.');
 const back=document.createElement('button');back.className='secondary compact-btn entity360-return';back.textContent='‹ '+label;back.onclick=onBack;main.prepend(back);
}
export async function openStatementOfAccount(e,organizationId,onBack){
 const overlay=document.createElement('div');overlay.className='ob-flow-modal entity360-statement';overlay.innerHTML='<div role="dialog" aria-modal="true" aria-label="Statement of account"><header class="section-heading"><h2>Statement of account</h2><button data-close aria-label="Close statement">×</button></header><div data-statement><p>Loading invoices…</p></div></div>';document.body.append(overlay);overlay.querySelector('[data-close]').onclick=()=>overlay.remove();
 const {data,error}=await supabase.from('customer_invoices').select('id,invoice_number,invoice_date,due_date,currency,total,balance,status').eq('organization_id',organizationId).eq('customer_id',e.id).in('status',['ISSUED','PARTIALLY_PAID','PAID']).order('invoice_date',{ascending:false});
 if(!overlay.isConnected)return;if(error){overlay.querySelector('[data-statement]').textContent=error.message;return;}
 const rows=data||[],balances=new Map();for(const row of rows)balances.set(row.currency,(balances.get(row.currency)||0)+Number(row.balance||0));
 overlay.querySelector('[data-statement]').innerHTML=`<p>${escape(e.name)} · Issued invoices and recorded balances</p><div class="entity360-balances">${[...balances].map(([currency,balance])=>`<div><small>Outstanding · ${escape(currency)}</small><b>${money(balance,currency)}</b></div>`).join('')}</div><div class="entity360-table-scroll"><table><thead><tr><th>Invoice</th><th>Due</th><th>Status</th><th>Total</th><th>Balance</th></tr></thead><tbody>${rows.map(r=>`<tr><td><button data-invoice="${escape(r.id)}">${escape(r.invoice_number)}</button></td><td>${escape(r.due_date||'—')}</td><td>${escape(r.status.replaceAll('_',' '))}</td><td>${money(r.total,r.currency)}</td><td>${money(r.balance,r.currency)}</td></tr>`).join('')}</tbody></table></div>${rows.length?'':'<p>No issued invoices for this customer.</p>'}`;
 overlay.querySelectorAll('[data-invoice]').forEach(b=>b.onclick=async()=>{try{if(!allowEntityNavigation())return;await openEntityOperation({type:'INVOICE',id:b.dataset.invoice},onBack,e.name);overlay.remove()}catch(error){showEntityError(error)}});
}

export function organizeEntityTabs(){
 const tabs=document.querySelector('.entity-tabs');if(!tabs)return;const order=['overview','vendor-overview','identity','contacts','addresses','pricing','agreements','onboarding','customer-operations','customer-inventory','customer-related','customer-billing','customer-documents','vendor-profile','vendor-compliance'];
 [...tabs.children].sort((a,b)=>{const key=x=>x.dataset.canonicalTab||x.dataset.jump;return (order.indexOf(key(a))<0?99:order.indexOf(key(a)))-(order.indexOf(key(b))<0?99:order.indexOf(key(b)))}).forEach(b=>tabs.append(b));
}
