const main=document.getElementById('main');
const style=document.createElement('style');
style.textContent=`
#cargo-list.hu-table-list{border:1px solid var(--border);border-radius:14px;overflow:hidden;margin-top:12px}.hu-table-head,.hu-table-list .inventory-card.hu-table-row{display:grid;grid-template-columns:minmax(210px,2.2fr) minmax(100px,.8fr) minmax(170px,1.4fr) minmax(100px,.8fr);gap:12px;align-items:center}.hu-table-head{padding:9px 12px;border-bottom:1px solid var(--border);font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);background:color-mix(in srgb,var(--panel,#10141c) 92%,transparent)}.hu-table-list .inventory-card.hu-table-row{width:100%;margin:0!important;padding:11px 12px;border:0;border-radius:0;border-bottom:1px solid color-mix(in srgb,var(--border) 75%,transparent);text-align:left;background:transparent}.hu-table-list .inventory-card.hu-table-row:last-child{border-bottom:0}.hu-cell{min-width:0;display:flex;flex-direction:column;gap:2px}.hu-cell b{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hu-cell small{font-size:10px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hu-cell.status b{font-size:10px}.hu-table-empty{padding:22px;text-align:center;color:var(--muted)}@media(max-width:760px){.hu-table-head{display:none}.hu-table-list .inventory-card.hu-table-row{grid-template-columns:1fr auto;gap:8px 14px}.hu-cell.source{grid-column:1/-1}.hu-cell.status{text-align:right}}
`;
document.head.appendChild(style);
function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function enhance(){
  const list=document.getElementById('cargo-list');if(!list)return;
  const cards=[...list.querySelectorAll(':scope > .inventory-card[data-cargo-id]')];if(!cards.length)return;
  let physical=0;
  for(const card of cards){
    if(card.dataset.huTable==='1'){if(card.style.display!=='none')physical++;continue}
    const first=card.children[0],numbers=card.children[1],pkg=first?.querySelector('.eyebrow')?.textContent?.trim()||'Cargo',label=first?.querySelector('b')?.textContent?.trim()||'Handling Unit',sub=[...first?.querySelectorAll('span')||[]].filter(x=>!x.classList.contains('eyebrow')).map(x=>x.textContent.trim()).filter(Boolean).join(' · '),qty=numbers?.querySelector('strong')?.textContent?.trim()||'—',status=numbers?.querySelector('span')?.textContent?.trim()||'—';
    const isPhysical=/WR cargo|WAREHOUSE_RECEIPT/i.test(sub);card.dataset.huTable='1';
    if(!isPhysical){card.style.display='none';continue}
    physical++;
    card.classList.add('hu-table-row');
    card.innerHTML=`<span class="hu-cell"><b>${esc(label)}</b><small>${esc(card.dataset.cargoId)}</small></span><span class="hu-cell"><b>${esc(qty)}</b><small>${esc(pkg)}</small></span><span class="hu-cell source"><b>${esc(sub||'Warehouse Receipt')}</b><small>Physical warehouse cargo</small></span><span class="hu-cell status"><b>${esc(status)}</b><small>Condition / state</small></span>`;
  }
  list.classList.add('hu-table-list');
  let head=list.querySelector(':scope > .hu-table-head');if(!head){head=document.createElement('div');head.className='hu-table-head';head.innerHTML='<span>Handling unit</span><span>Package / qty</span><span>Source / details</span><span>Status</span>';list.prepend(head)}
  list.querySelector(':scope > .hu-table-empty')?.remove();
  if(!physical){const empty=document.createElement('div');empty.className='hu-table-empty';empty.innerHTML='<b>No physical handling units yet.</b><br>Handling Units are created from Warehouse Receipts.';list.appendChild(empty)}
}
let scheduled=false;function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;enhance()})}
new MutationObserver(m=>{if(m.some(x=>x.target.closest?.('.hu-table-head')))return;schedule()}).observe(main,{childList:true,subtree:true});
setTimeout(schedule,400);
