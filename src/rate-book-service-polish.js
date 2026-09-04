import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';

const UNITS=[
 ['EA','Each / unit'],['PIECE','Piece'],['BOX','Box'],['CARTON','Carton'],['PALLET','Pallet'],['SKID','Skid'],['CRATE','Crate'],['BIN','Bin'],['LOCATION','Storage location'],
 ['ORDER','Order'],['ORDER_LINE','Order line'],['PICK','Pick'],['PACK','Pack'],['LABEL','Label'],['DOCUMENT','Document'],['WR','Warehouse receipt'],['CR','Cargo release'],['SHIPMENT','Shipment'],['BOOKING','Booking'],['CONTAINER','Container'],['TEU','TEU'],
 ['KG','Gross weight · kg'],['LB','Gross weight · lb'],['CHARGEABLE_KG','Chargeable weight · kg'],['CHARGEABLE_LB','Chargeable weight · lb'],['VOLUMETRIC_KG','Volumetric weight · kg'],['CBM','Cubic meter · CBM'],['CUFT','Cubic foot'],['SQFT','Square foot'],
 ['HOUR','Hour'],['DAY','Day'],['WEEK','Week'],['MONTH','Month'],['MILE','Mile'],['KM','Kilometer'],['PICKUP','Pickup'],['DELIVERY','Delivery'],['FLAT','Flat fee'],['PERCENT','Percentage']
];
const slug=s=>String(s||'').trim().toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48)||'SERVICE';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function enhance(){
 const name=document.getElementById('rs-name'),code=document.getElementById('rs-code'),unit=document.getElementById('rs-unit'),save=document.getElementById('rs-save');
 if(!name||!code||!unit||!save||name.dataset.polished)return;
 name.dataset.polished='1';
 const isNew=!code.value.trim();
 code.readOnly=true;code.placeholder='Generated automatically';
 const codeField=code.closest('.field');codeField?.classList.add('rate-auto-code');
 const note=document.createElement('small');note.className='muted';note.textContent='Generated from service name';code.parentElement?.appendChild(note);
 const sync=()=>{if(isNew||!code.value.trim())code.value=slug(name.value)};name.addEventListener('input',sync);sync();
 const sel=document.createElement('select');sel.id='rs-unit';sel.innerHTML=UNITS.map(([v,l])=>`<option value="${v}" ${String(unit.value||'EA').toUpperCase()===v?'selected':''}>${esc(l)}</option>`).join('');unit.replaceWith(sel);
 if(!isNew)return;
 const grid=document.querySelector('.detail-grid');
 if(grid&&!document.getElementById('rs-sell')){
   const wrap=document.createElement('div');wrap.className='rate-service-commercial';wrap.innerHTML=`<div class="field"><label>Standard sell rate</label><input id="rs-sell" type="number" step="any" min="0" placeholder="0.00"><small class="muted">Your normal customer rate for this service</small></div><div class="field"><label>Minimum charge</label><input id="rs-min" type="number" step="any" min="0" placeholder="Optional"><small class="muted">Minimum billed when this service applies</small></div><div class="field"><label>Currency</label><select id="rs-currency"><option>USD</option><option>EUR</option><option>CAD</option><option>GBP</option></select></div>`;grid.appendChild(wrap);
 }
 const old=save.onclick;
 save.onclick=async e=>{
   e?.preventDefault?.();
   const org=await getCurrentOrganizationId();
   const payload={organization_id:org,domain:document.getElementById('rs-domain').value,code:slug(name.value),name:name.value.trim(),default_unit:document.getElementById('rs-unit').value,description:document.getElementById('rs-desc').value.trim()||null,updated_at:new Date().toISOString()};
   if(!payload.name)return alert('Service name is required.');
   save.disabled=true;save.textContent='Saving…';
   const {data:service,error}=await supabase.from('service_catalog').insert(payload).select().single();
   if(error){save.disabled=false;save.textContent='Save Service';return alert(error.message)}
   const sell=document.getElementById('rs-sell')?.value,min=document.getElementById('rs-min')?.value,currency=document.getElementById('rs-currency')?.value||'USD';
   if(sell!==''||min!==''){
     const {error:re}=await supabase.from('standard_rates').insert({organization_id:org,service_id:service.id,sell_rate:sell===''?0:Number(sell),buy_rate:null,currency,unit:payload.default_unit,minimum_charge:min===''?null:Number(min),effective_from:new Date().toISOString().slice(0,10),active:true});
     if(re)return alert(`Service saved, but rate could not be saved: ${re.message}`);
   }
   window.nodaraRateBook?.open?.();
 };
}

const obs=new MutationObserver(enhance);obs.observe(document.body,{childList:true,subtree:true});
setTimeout(enhance,500);
