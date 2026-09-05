import { supabase } from './supabase-client.js';

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const field=(id,label,value='',placeholder='',type='text')=>`<div class="field"><label>${label}</label><input id="${id}" type="${type}" value="${esc(value??'')}" placeholder="${esc(placeholder)}"></div>`;

const defs={
 AIR:{label:'Air Operations',kicker:'AIR',fields:[
  ['airline','Airline','e.g. LATAM Cargo'],['flight_number','Flight number','e.g. LA 2465'],['service_level','Service','General / Priority / Express'],['chargeable_weight','Chargeable weight','0','number'],['cutoff_at','Cargo cutoff','','datetime-local'],['flight_date','Flight date','','datetime-local'],['security_status','Security / TSA status',''],['handling_info','Handling information','DG, temp control, special handling']
 ]},
 OCEAN:{label:'Ocean Operations',kicker:'OCEAN',fields:[
  ['steamship_line','Steamship line','e.g. MSC'],['vessel','Vessel',''],['voyage','Voyage',''],['container_number','Container #',''],['container_type','Container type','40HC / 20GP / 45HC'],['seal_number','Seal #',''],['vgm','VGM','0','number'],['cy_cutoff','CY cutoff','','datetime-local']
 ]},
 GROUND:{label:'Ground Operations',kicker:'GROUND',fields:[
  ['pro_number','PRO / BOL',''],['service_type','Service type','FTL / LTL / Local / Drayage'],['equipment','Equipment','Dry Van / Reefer / Flatbed / Box Truck'],['driver_name','Driver',''],['tractor_number','Tractor / Truck #',''],['trailer_number','Trailer #',''],['pickup_appointment','Pickup appointment','','datetime-local'],['delivery_appointment','Delivery appointment','','datetime-local']
 ]}
};

function mode(){return document.getElementById('sh-mode')?.value||null}
function editorTitle(){return main.querySelector('h1.title')?.textContent?.trim()||''}
async function currentShipment(){
 const title=editorTitle();
 const number=title.startsWith('Edit ')?title.slice(5).trim():main.querySelector('.record-header h1.title')?.textContent?.trim();
 if(!number)return null;
 const {data}=await supabase.from('shipments').select('*').eq('shipment_number',number).maybeSingle();return data||null;
}
function normalizeLocal(v){if(!v)return'';try{const d=new Date(v);return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16)}catch{return''}}
function renderEditorDetails(data={}){
 const m=mode();if(!defs[m])return;
 document.getElementById('shipment-mode-section')?.remove();
 const meta=data.metadata?.mode_details||{};
 const section=document.createElement('section');section.id='shipment-mode-section';section.className=`record-section shipment-mode-section mode-${m.toLowerCase()}`;
 section.innerHTML=`<div class="section-heading"><div><span class="section-kicker">${defs[m].kicker}</span><h3>${defs[m].label}</h3><span class="muted">Only the fields relevant to this mode are shown.</span></div></div><div class="detail-grid shipment-mode-grid">${defs[m].fields.map(([key,label,placeholder,type='text'])=>field(`mode-${key}`,label,type==='datetime-local'?normalizeLocal(meta[key]):meta[key]||'',placeholder,type)).join('')}</div>`;
 const base=[...main.querySelectorAll('section.record-section')].at(-1);base?.after(section);
}
function collectModeDetails(m){const out={};for(const [key,, ,type='text'] of defs[m]?.fields||[]){const el=document.getElementById(`mode-${key}`);if(!el)continue;let v=el.value?.trim?.()||'';if(type==='number')v=v===''?null:Number(v);out[key]=v||null}return out}
async function installEditor(){
 if(!document.getElementById('sh-save')||document.getElementById('shipment-mode-section'))return;
 const existing=await currentShipment();renderEditorDetails(existing||{});
 document.getElementById('sh-mode')?.addEventListener('change',()=>renderEditorDetails(existing||{}));
}
async function persistOnSave(){
 const m=mode();if(!defs[m])return;
 const numberInput=document.getElementById('sh-number');if(!numberInput)return;
 if(!numberInput.value.trim())numberInput.value=`${m==='OCEAN'?'OCN':m==='GROUND'?'GRD':'AIR'}-${new Date().toISOString().slice(2,10).replaceAll('-','')}-${String(Date.now()).slice(-4)}`;
 const number=numberInput.value.trim(),details=collectModeDetails(m);
 for(let i=0;i<30;i++){
  await sleep(150);
  const {data}=await supabase.from('shipments').select('id,metadata').eq('shipment_number',number).maybeSingle();
  if(!data)continue;
  const metadata={...(data.metadata||{}),mode_details:details};
  await supabase.from('shipments').update({metadata}).eq('id',data.id);return;
 }
}
function renderRecordDetails(r){
 const m=r.mode;if(!defs[m])return;
 document.getElementById('shipment-mode-record')?.remove();
 const meta=r.metadata?.mode_details||{}, populated=defs[m].fields.filter(([k])=>meta[k]!=null&&meta[k]!=='');
 const section=document.createElement('section');section.id='shipment-mode-record';section.className=`record-section shipment-mode-section mode-${m.toLowerCase()}`;
 section.innerHTML=`<div class="section-heading"><div><span class="section-kicker">${defs[m].kicker}</span><h3>${defs[m].label}</h3><span class="muted">Mode-specific operating details.</span></div></div><div class="detail-grid shipment-mode-readonly">${populated.length?populated.map(([k,l])=>`<div><span>${esc(l)}</span><b>${esc(meta[k])}</b></div>`).join(''):'<div class="empty compact">No mode-specific details entered yet.</div>'}</div>`;
 const core=main.querySelector('.ops-record-grid .record-section')||main.querySelector('section.record-section');core?.after(section);
}
async function installRecord(){
 const head=main.querySelector('.record-header .eyebrow');if(!head||!/^Operations · (AIR|OCEAN|GROUND)$/i.test(head.textContent.trim())||document.getElementById('shipment-mode-record'))return;
 const number=main.querySelector('.record-header h1.title')?.textContent?.trim();if(!number)return;
 const {data}=await supabase.from('shipments').select('*').eq('shipment_number',number).maybeSingle();if(data)renderRecordDetails(data);
}

document.addEventListener('click',e=>{if(e.target.closest('#sh-save'))persistOnSave()},true);
const observer=new MutationObserver(()=>{installEditor();installRecord()});observer.observe(main,{childList:true,subtree:true});
setTimeout(()=>{installEditor();installRecord()},300);
