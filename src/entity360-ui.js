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
 window.__nodaraCurrentWRJourney=null;
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
 installProfilePresentation(e);
 installOverviewActions(shell);
 installKeyboardTabs(shell.querySelector('.entity-tabs'));
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

function installProfilePresentation(e){
 const shell=document.querySelector('.entity360-shell'),identity=shell.querySelector('#identity');
 shell.dataset.profileEditing=e.id?'false':'true';
 identity.dataset.companyView='company';const views=document.createElement('div');views.className='entity360-segments';views.setAttribute('role','tablist');views.setAttribute('aria-label','Company details');views.innerHTML=['company','legal','billing'].map(key=>`<button type="button" role="tab" data-company-view="${key}" aria-selected="${key==='company'}">${key[0].toUpperCase()+key.slice(1)}</button>`).join('');identity.querySelector('.section-heading').after(views);installKeyboardTabs(views);views.querySelectorAll('button').forEach(button=>button.onclick=()=>{identity.dataset.companyView=button.dataset.companyView;views.querySelectorAll('button').forEach(b=>b.setAttribute('aria-selected',String(b===button)));refreshEntityPresentation()});
 identity.querySelectorAll('.field').forEach(field=>{const key=field.querySelector('[data-legal-field]')?.dataset.legalField;field.dataset.companyGroup=!key||['customer_type','website'].includes(key)?'company':['payment_terms','credit_status','credit_limit','billing_email'].includes(key)?'billing':'legal'});
 const edit=document.createElement('button');edit.type='button';edit.className='secondary compact-btn';edit.dataset.editCompany='';edit.textContent=e.id?'Edit company':'Company details';identity.querySelector('.section-heading').append(edit);
 edit.onclick=()=>{const editing=shell.dataset.profileEditing!=='true';shell.dataset.profileEditing=String(editing);edit.textContent=editing?'Done editing':'Edit company';refreshEntityPresentation();const footer=shell.querySelector('.entity360-savebar');footer.hidden=!editing&&shell.dataset.dirty!=='true';if(editing)identity.querySelector('.field:not([hidden]) input,.field:not([hidden]) select')?.focus()};
 const overview=shell.querySelector('#overview');if(overview){const title=overview.querySelector('h3');if(title)title.textContent='Account overview';const lead=overview.querySelector('.section-heading .muted');if(lead)lead.textContent='Activity, commercial setup and account health.';}
 refreshEntityPresentation();if(e.id)shell.querySelector('.entity360-savebar').hidden=true;
 shell.addEventListener('click',event=>{const button=event.target.closest('[data-edit-card],[data-done-card]');if(button){const row=button.closest('.master-row');row.dataset.editing=button.hasAttribute('data-edit-card')?'true':'false';refreshEntityPresentation();if(row.dataset.editing==='true')row.querySelector('input')?.focus();} });
}
export function refreshEntityPresentation(){
 const shell=document.querySelector('.entity360-shell');if(!shell)return;
 const identity=shell.querySelector('#identity');let summary=identity.querySelector('.entity360-company-summary');if(!summary){summary=document.createElement('div');summary.className='entity360-company-summary';identity.querySelector('.entity360-segments').after(summary)}
 const view=identity.dataset.companyView||'company';identity.querySelectorAll('.field').forEach(field=>field.hidden=field.dataset.companyGroup!==view);identity.querySelectorAll('.detail-grid').forEach(grid=>grid.hidden=![...grid.querySelectorAll('.field')].some(f=>!f.hidden));identity.querySelectorAll('.flag-block').forEach(block=>block.hidden=view!=='company');
 const fields=[...identity.querySelectorAll(`.field[data-company-group="${view}"]`)].map(field=>({label:field.querySelector('label')?.textContent,value:field.querySelector('input,select')?.value}));
 summary.innerHTML=`<dl>${fields.filter(f=>f.value).map(f=>`<div class="${f.value.includes('@')?'wide':''}"><dt>${escape(f.label)}</dt><dd>${escape(f.value.replaceAll('_',' '))}</dd></div>`).join('')}</dl><div class="entity360-role-summary" ${view!=='company'?'hidden':''}>${[...identity.querySelectorAll('.flag-chip.selected')].map(b=>`<span>${escape(b.textContent.replaceAll('_',' '))}</span>`).join('')}</div>${fields.some(f=>f.value)?'':'<p class="muted">No details added for this section yet.</p>'}`;
 shell.querySelectorAll('[data-cc-row],[data-ca-row]').forEach(row=>{
  const contact=row.hasAttribute('data-cc-row'),prefix=contact?'cc':'ca',val=key=>row.querySelector(`[data-${prefix}-${key}]`)?.value||'';
  if(!row.dataset.editing)row.dataset.editing=row.dataset.id?'false':'true';
  let card=row.querySelector('.entity360-read-card');if(!card){card=document.createElement('div');card.className='entity360-read-card';row.prepend(card)}
  const name=val('name')||(contact?'New contact':val('type')+' address');const email=val('email'),phone=val('phone');
  const details=contact?[val('title'),val('roles')]:[val('line1'),[val('city'),val('state'),val('postal')].filter(Boolean).join(', '),val('country')];
  card.innerHTML=`<div class="entity360-card-head"><span class="entity360-card-avatar">${escape(name.slice(0,1).toUpperCase())}</span><div><b>${escape(name)}</b><small>${row.querySelector(`[data-${prefix}-primary]`)?.checked?'Primary '+(contact?'contact':'address'):contact?'Contact':escape(val('type'))}</small></div><button type="button" class="secondary compact-btn" data-edit-card>Edit</button></div><div class="entity360-card-details">${details.filter(Boolean).map(v=>`<span>${escape(v)}</span>`).join('')}${email?`<a href="mailto:${escape(email)}">${escape(email)}</a>`:''}${phone?`<a href="tel:${escape(phone.replace(/[^+0-9]/g,''))}">${escape(phone)}</a>`:''}</div>`;
  if(!row.querySelector('[data-done-card]')){const done=document.createElement('button');done.type='button';done.className='secondary compact-btn';done.dataset.doneCard='';done.textContent='Done editing';row.append(done)}
 });
}

function installOverviewActions(shell){
 const overview=shell.querySelector('#overview');if(!overview)return;
 const grid=overview.querySelector('.customer-summary-grid');
 if(overview.querySelector('.notice.warning')){grid.hidden=true;overview.querySelector('.customer-health-strip').hidden=true;return;}
 const destinations={'Transactions':['Activity','customer-operations'],'Unbilled':['Unbilled charges','customer-billing'],'Active rates':['Active rates','pricing'],'Documents':['Documents','customer-documents']};
 [...grid.children].forEach(card=>{const item=destinations[card.querySelector('small')?.textContent];if(!item){card.remove();return;}const button=document.createElement('button');button.type='button';button.className='entity360-metric';button.dataset.jump=item[1];button.innerHTML=`<small>${escape(item[0])}</small><b>${escape(card.querySelector('b').textContent)}</b><span aria-hidden="true">›</span>`;button.setAttribute('aria-label',`${item[0]}: ${card.querySelector('b').textContent}. Open ${item[0].toLowerCase()}`);card.replaceWith(button)});
}
function installKeyboardTabs(bar){if(!bar)return;
 bar.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;const tabs=[...bar.querySelectorAll('button')].filter(b=>!b.hidden&&!b.disabled),index=tabs.indexOf(event.target);if(index<0)return;event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+tabs.length)%tabs.length;tabs[next]?.focus();tabs[next]?.click();});
}
export function validateEntityName(){
 const input=document.getElementById('ent-name');if(input.value.trim())return true;
 const shell=document.querySelector('.entity360-shell'),identity=document.getElementById('identity');shell.querySelector('.entity-tabs [data-jump="identity"]').click();identity.querySelector('[data-company-view="company"]').click();if(shell.dataset.profileEditing!=='true')identity.querySelector('[data-edit-company]').click();input.setAttribute('aria-invalid','true');input.setAttribute('aria-describedby','entity-name-error');let note=document.getElementById('entity-name-error');if(!note){note=document.createElement('small');note.id='entity-name-error';note.className='entity360-field-error';note.setAttribute('role','alert');input.after(note)}note.textContent='Enter a company name to save this profile.';input.focus();input.addEventListener('input',()=>{input.removeAttribute('aria-invalid');input.removeAttribute('aria-describedby');note.remove()},{once:true});return false;
}
