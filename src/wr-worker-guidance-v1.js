const style=document.createElement('style');
style.textContent=`
.wr11-worker{border:1px solid #315377;border-radius:24px;background:radial-gradient(circle at 90% -10%,#1d5ea755,transparent 42%),linear-gradient(160deg,#101c2b,#0a111a);padding:17px;margin:0 0 14px;box-shadow:0 16px 42px #0004}.wr11-worker-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.wr11-worker-kicker{font-size:8px;letter-spacing:.14em;color:#72aef1;text-transform:uppercase}.wr11-worker h2{font-size:23px;letter-spacing:-.025em;margin:4px 0 5px}.wr11-worker p{margin:0;color:#95a9bf;font-size:11px;line-height:1.45}.wr11-worker-state{border:1px solid #345d8b;border-radius:999px;padding:6px 9px;color:#9ec9fa;background:#10223a;font-size:8px;text-transform:uppercase;white-space:nowrap}.wr11-worker-numbers{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-top:13px}.wr11-worker-num{border:1px solid #293e56;border-radius:15px;padding:10px;background:#09121c}.wr11-worker-num span{display:block;color:#7890a9;font-size:8px;text-transform:uppercase;letter-spacing:.08em}.wr11-worker-num b{display:block;margin-top:3px;font-size:18px}.wr11-worker-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:13px}.wr11-worker-actions button{min-height:43px;border-radius:13px;padding:9px 13px}.wr11-worker-actions .primary{background:#2878ee;color:#fff;border-color:#4b8be4}.wr11-worker-actions .count{min-width:56px;font-size:15px}.wr11-worker-note{margin-top:10px;padding-top:9px;border-top:1px solid #203349;color:#7f95ac;font-size:9px}.wr11.guided-worker .wr11-grid{display:block}.wr11.guided-worker .wr11-grid>div{display:contents}.wr11.guided-worker .wr11-card{display:none}.wr11.guided-worker .wr11-card.worker-show{display:block}.wr11.guided-worker .wr11-card.worker-show .wr11-head p{max-width:620px}.wr11.guided-worker .wr11-card.worker-dock-compact .wr11-fields .wr11-field{display:none}.wr11.guided-worker .wr11-card.worker-dock-compact .wr11-fields .wr11-field.worker-essential{display:block}.wr11.guided-worker .wr11-card.worker-dock-compact .wr11-tally{display:none}.wr11-worker-more{margin-left:auto}@media(max-width:600px){.wr11-worker{padding:14px;border-radius:20px}.wr11-worker h2{font-size:20px}.wr11-worker-numbers{grid-template-columns:repeat(3,1fr)}.wr11-worker-num b{font-size:15px}.wr11.guided-worker .wr11-card.worker-show{padding:14px}.wr11.guided-worker .wr11-card.worker-dock-compact .wr11-fields{grid-template-columns:1fr 1fr}.wr11.guided-worker .wr11-card.worker-dock-compact .wr11-field input{font-size:16px!important}}
`;
document.head.appendChild(style);

const text=(el)=>el?.textContent?.trim()||'';
const num=v=>Number(String(v??'').replace(/[^0-9.-]/g,''))||0;
function cardByKicker(root,k){return [...root.querySelectorAll('.wr11-card')].find(c=>text(c.querySelector('.wr11-kicker')).toUpperCase()===k)}
function metric(root,label){const m=[...root.querySelectorAll('.wr11-metric')].find(x=>text(x.querySelector('span')).toLowerCase()===label.toLowerCase());return text(m?.querySelector('b'))||'—'}
function click(sel){document.querySelector(sel)?.click()}
function markEssential(dock){['wr11-carrier','wr11-driver','wr11-bol','wr11-pro','wr11-door'].forEach(id=>document.getElementById(id)?.closest('.wr11-field')?.classList.add('worker-essential'))}
function addTask(root){
 const guided=root.querySelector('[data-mode="guided"]')?.classList.contains('active');
 root.classList.toggle('guided-worker',!!guided);
 root.querySelector('.wr11-worker')?.remove();
 if(!guided)return;
 const grid=root.querySelector('.wr11-grid');if(!grid)return;
 const dock=cardByKicker(root,'DOCK VISIT'),cargo=cardByKicker(root,'WAREHOUSE PROCESSING'),identity=cardByKicker(root,'IDENTITY'),control=cardByKicker(root,'CONTROL'),close=cardByKicker(root,'CLOSEOUT');
 [dock,cargo,identity,control,close].forEach(c=>c?.classList.remove('worker-show','worker-dock-compact'));
 const checkedIn=!!document.getElementById('wr11-start-unload')||!!document.getElementById('wr11-end-unload')||!!document.getElementById('wr11-release')||text(dock).includes('Driver released');
 const unloading=!!document.getElementById('wr11-end-unload');
 const readyRelease=!!document.getElementById('wr11-release');
 const released=text(dock).includes('Driver released');
 const checkinBtn=document.getElementById('wr11-save-visit');
 let title='',desc='',state='',body='',actions='';
 if(!checkedIn){
   title='Check in this arrival';state='Dock visit';desc='Capture only what matters to start custody. You can identify the customer later.';
   dock?.classList.add('worker-show','worker-dock-compact');markEssential(dock);
   actions=`<button class="primary" data-wg="checkin">Check in</button><button data-wg="scan-doc">Scan BOL / document</button><button data-wg="scan-id">Verify ID</button>`;
 }else if(document.getElementById('wr11-start-unload')){
   title='Ready to unload';state='Dock visit';desc='Start the physical unload. Detailed cargo processing does not have to happen before the truck leaves.';
   dock?.classList.add('worker-show');
   body=`<div class="wr11-worker-numbers"><div class="wr11-worker-num"><span>Expected</span><b>${metric(root,'Expected')}</b></div><div class="wr11-worker-num"><span>Unloaded</span><b>${metric(root,'Unloaded')}</b></div><div class="wr11-worker-num"><span>Exceptions</span><b>${metric(root,'Exceptions')}</b></div></div>`;
   actions=`<button class="primary" data-wg="start">Start unloading</button><button data-wg="scan-doc">Scan document</button>`;
 }else if(unloading){
   title='Unload in progress';state='Live tally';desc='Keep the tally moving. Record exceptions only when something differs from expected.';
   dock?.classList.add('worker-show');
   const actual=document.getElementById('wr11-actqty'),uom=document.getElementById('wr11-unload-uom')?.value||'';
   body=`<div class="wr11-worker-numbers"><div class="wr11-worker-num"><span>Expected</span><b>${metric(root,'Expected')}</b></div><div class="wr11-worker-num"><span>Unloaded</span><b data-wg-count>${actual?.value||0} ${uom}</b></div><div class="wr11-worker-num"><span>Exceptions</span><b>${metric(root,'Exceptions')}</b></div></div>`;
   actions=`<button class="count" data-wg="plus1">+1</button><button class="count" data-wg="plus5">+5</button><button data-wg="scan">Scan</button><button class="primary" data-wg="finish">Finish unloading</button>`;
 }else if(readyRelease){
   title='Driver ready to release';state='Custody transfer';desc='The unload is complete. Release the driver now; warehouse processing can continue afterward.';
   dock?.classList.add('worker-show');
   const bol=document.getElementById('wr11-bol')?.value?.trim();
   body=`<div class="wr11-worker-numbers"><div class="wr11-worker-num"><span>Expected</span><b>${metric(root,'Expected')}</b></div><div class="wr11-worker-num"><span>Unloaded</span><b>${metric(root,'Unloaded')}</b></div><div class="wr11-worker-num"><span>BOL</span><b>${bol?'✓':'—'}</b></div></div>`;
   actions=`<button data-wg="sign">Driver signature</button><button data-wg="exception">Exception</button><button class="primary" data-wg="release">Release driver</button>`;
 }else if(released){
   const processed=metric(root,'Processed'),putaway=metric(root,'Put away');
   title='Process the received cargo';state='Warehouse';desc='The truck is gone. Now identify, detail, label and put away only what the warehouse needs.';
   cargo?.classList.add('worker-show');
   if(text(identity).includes('Identify when known'))identity?.classList.add('worker-show');
   if(metric(root,'Exceptions')!=='0')control?.classList.add('worker-show');
   body=`<div class="wr11-worker-numbers"><div class="wr11-worker-num"><span>Processed</span><b>${processed}</b></div><div class="wr11-worker-num"><span>Put away</span><b>${putaway}</b></div><div class="wr11-worker-num"><span>Attention</span><b>${metric(root,'Needs attention')}</b></div></div>`;
   actions=`<button class="primary" data-wg="addcargo">＋ Received cargo</button><button data-wg="scan">Scan next</button><button data-wg="record">Record details</button>`;
   if(processed!=='0/0'&&processed.split('/')[0]===processed.split('/')[1]&&putaway.split('/')[0]===putaway.split('/')[1])close?.classList.add('worker-show');
 }
 const task=document.createElement('section');task.className='wr11-worker';task.innerHTML=`<div class="wr11-worker-top"><div><div class="wr11-worker-kicker">RIGHT NOW</div><h2>${title}</h2><p>${desc}</p></div><span class="wr11-worker-state">${state}</span></div>${body}<div class="wr11-worker-actions">${actions}<button class="wr11-worker-more" data-wg="record">Record</button></div><div class="wr11-worker-note">NODARA keeps the full audit trail in the background. Guided mode shows the next operational action; Record mode shows everything.</div>`;
 grid.parentNode.insertBefore(task,grid);
 task.querySelectorAll('[data-wg]').forEach(b=>b.onclick=async()=>{
   const a=b.dataset.wg;
   if(a==='checkin')return checkinBtn?.click();if(a==='start')return click('#wr11-start-unload');if(a==='release')return click('#wr11-release');if(a==='sign')return click('#wr11-signout');if(a==='scan-doc')return click('#wr11-scan-bol');if(a==='scan-id')return click('#wr11-scan-id');if(a==='addcargo')return click('#wr11-add-cargo');if(a==='record')return root.querySelector('[data-mode="record"]')?.click();if(a==='exception'){const f=document.querySelector('[data-fab="exception"]');return f?.click()}if(a==='scan'){if(window.nodaraScanTask)return window.nodaraScanTask({title:'Scan next',hint:'Cargo label · SKU · part · location · reference'});return window.nodaraScan?.()}
   if(a==='plus1'||a==='plus5'){const input=document.getElementById('wr11-actqty');if(!input)return;input.value=String(num(input.value)+(a==='plus5'?5:1));input.dispatchEvent(new Event('input',{bubbles:true}));const cnt=task.querySelector('[data-wg-count]');if(cnt)cnt.textContent=`${input.value} ${document.getElementById('wr11-unload-uom')?.value||''}`;checkinBtn?.click();return}
   if(a==='finish'){checkinBtn?.click();setTimeout(()=>click('#wr11-end-unload'),420)}
 });
}
let t;function enhance(){clearTimeout(t);t=setTimeout(()=>document.querySelectorAll('.wr11').forEach(addTask),30)}
new MutationObserver(enhance).observe(document.body,{childList:true,subtree:true});setTimeout(enhance,300);
