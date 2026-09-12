import { supabase } from './supabase-client.js';

const main=document.getElementById('main');
let cache={key:null,at:0,data:null};
let scheduled=false;

const LB_PER_KG=2.2046226218;
const FT3_PER_M3=35.3146667215;
const IN3_TO_M3=0.000016387064;
const AIR_DIVISOR_IN3_PER_LB=166;

const n=v=>{const x=Number(v);return Number.isFinite(x)?x:null};
const fmt=(v,d=1)=>Number(v||0).toLocaleString(undefined,{maximumFractionDigits:d,minimumFractionDigits:0});
const kg=lb=>lb/LB_PER_KG;
const m3FromIn3=in3=>in3*IN3_TO_M3;
const ft3FromM3=m3=>m3*FT3_PER_M3;

function dualWeight(lb,system='LB'){
  if(lb==null)return '—';
  return String(system).toUpperCase()==='KG'
    ? `${fmt(kg(lb),1)} kg · ${fmt(lb,1)} lb`
    : `${fmt(lb,1)} lb · ${fmt(kg(lb),1)} kg`;
}
function dualVolume(m3,dimSystem='IN'){
  if(m3==null)return '—';
  return String(dimSystem).toUpperCase()==='CM'
    ? `${fmt(m3,3)} m³ · ${fmt(ft3FromM3(m3),2)} ft³`
    : `${fmt(ft3FromM3(m3),2)} ft³ · ${fmt(m3,3)} m³`;
}
function unitPrefs(data){return{weight:String(data?.units?.weight_unit||'LB').toUpperCase(),dim:String(data?.units?.dimension_unit||'IN').toUpperCase()}}
function rowMetrics(x){
  const qty=Math.max(0,n(x.quantity)??0),basis=String(x.metadata?.weight_basis||'EACH').toUpperCase();
  const enteredLb=n(x.weight_lb),grossLb=enteredLb==null?null:(basis==='TOTAL'?enteredLb:enteredLb*qty);
  const L=n(x.length_in),W=n(x.width_in),H=n(x.height_in),perIn3=L&&W&&H?L*W*H:null,totalIn3=perIn3==null?null:perIn3*Math.max(qty,1);
  const volumeM3=totalIn3==null?null:m3FromIn3(totalIn3),volumetricLb=totalIn3==null?null:totalIn3/AIR_DIVISOR_IN3_PER_LB;
  const chargeableLb=grossLb==null?volumetricLb:volumetricLb==null?grossLb:Math.max(grossLb,volumetricLb);
  return{qty,grossLb,volumeM3,volumetricLb,chargeableLb};
}
function receiptNumber(){return main.querySelector('.wr22-num,.wr19-num')?.textContent?.trim()||null}
async function loadData(force=false){
  const key=receiptNumber();if(!key)return null;
  if(!force&&cache.key===key&&Date.now()-cache.at<1200)return cache.data;
  const{data:wr}=await supabase.from('warehouse_receipts').select('id,job_id,organization_id').eq('receipt_number',key).maybeSingle();if(!wr)return null;
  const[cargo,units]=await Promise.all([
    supabase.from('cargo_units').select('id,parent_id,quantity,uom,weight_lb,length_in,width_in,height_in,metadata').eq('job_id',wr.job_id).order('created_at'),
    supabase.from('organization_unit_profiles').select('weight_unit,dimension_unit').eq('organization_id',wr.organization_id).eq('is_default',true).maybeSingle()
  ]);
  const data={wr,cargo:cargo.data||[],units:units.data||{weight_unit:'LB',dimension_unit:'IN'}};
  cache={key,at:Date.now(),data};return data;
}
function aggregate(data){
  const rows=data.cargo.filter(x=>!x.metadata?.editor_draft),roots=rows.filter(x=>!x.parent_id),byParent=new Map();
  rows.forEach(x=>{if(x.parent_id){const a=byParent.get(x.parent_id)||[];a.push(x);byParent.set(x.parent_id,a)}});
  const measured=x=>n(x.weight_lb)!=null||(n(x.length_in)&&n(x.width_in)&&n(x.height_in));
  const calcNode=x=>{
    if(measured(x))return rowMetrics(x);
    const cs=byParent.get(x.id)||[];
    if(!cs.length)return rowMetrics(x);
    const parts=cs.map(calcNode);return{qty:n(x.quantity)||0,grossLb:sumNullable(parts,'grossLb'),volumeM3:sumNullable(parts,'volumeM3'),volumetricLb:sumNullable(parts,'volumetricLb'),chargeableLb:null};
  };
  const parts=roots.map(calcNode),grossLb=sumNullable(parts,'grossLb'),volumeM3=sumNullable(parts,'volumeM3'),volumetricLb=sumNullable(parts,'volumetricLb');
  const chargeableLb=grossLb==null?volumetricLb:volumetricLb==null?grossLb:Math.max(grossLb,volumetricLb);
  const pieces=roots.reduce((a,x)=>a+(n(x.quantity)||0),0),uoms=[...new Set(roots.map(x=>x.uom).filter(Boolean))];
  return{pieces,pieceUom:uoms.length===1?uoms[0]:(uoms.length?'units':''),grossLb,volumeM3,chargeableLb};
}
function sumNullable(parts,key){const vals=parts.map(x=>x[key]).filter(v=>v!=null);return vals.length?vals.reduce((a,b)=>a+b,0):null}

function editorMetrics(modal,data){
  const metrics=modal.querySelector('.wr22-metrics');if(!metrics)return;
  if(!metrics.dataset.v29){
    metrics.dataset.v29='1';
    metrics.innerHTML=`<div class="wr22-metric"><small>Pieces</small><b id="c-pieces">—</b></div><div class="wr22-metric"><small>Gross weight</small><b id="c-gross">—</b></div><div class="wr22-metric"><small>Volume</small><b id="c-vol">—</b></div><div class="wr22-metric"><small>Chargeable</small><b id="c-chg">—</b></div>`;
  }
  const prefs=unitPrefs(data),q=s=>modal.querySelector(s),val=s=>{const e=q(s);return e&&e.value!==''?n(e.value):null};
  const update=()=>{
    const qty=Math.max(0,val('#c-qty')??0),wu=q('#c-wu')?.value||prefs.weight,du=q('#c-du')?.value||prefs.dim,basis=q('#v23-weight-total')?.checked?'TOTAL':'EACH';
    let entered=val('#c-weight');if(entered!=null&&wu==='KG')entered*=LB_PER_KG;
    const grossLb=entered==null?null:(basis==='TOTAL'?entered:entered*qty);
    let L=val('#c-l'),W=val('#c-w'),H=val('#c-h');if(du==='CM'){L=L==null?null:L/2.54;W=W==null?null:W/2.54;H=H==null?null:H/2.54}
    const totalIn3=L&&W&&H?L*W*H*Math.max(qty,1):null,volumeM3=totalIn3==null?null:m3FromIn3(totalIn3),volLb=totalIn3==null?null:totalIn3/AIR_DIVISOR_IN3_PER_LB;
    const chargeableLb=grossLb==null?volLb:volLb==null?grossLb:Math.max(grossLb,volLb),uom=q('#c-uom')?.textContent?.trim()||'';
    const p=q('#c-pieces'),g=q('#c-gross'),v=q('#c-vol'),c=q('#c-chg');
    if(p)p.textContent=`${fmt(qty,2)} ${uom}`.trim();if(g)g.textContent=dualWeight(grossLb,prefs.weight);if(v)v.textContent=dualVolume(volumeM3,prefs.dim);if(c)c.textContent=dualWeight(chargeableLb,prefs.weight);
  };
  if(!modal.dataset.v29MetricBind){
    modal.dataset.v29MetricBind='1';
    modal.addEventListener('input',()=>{update();setTimeout(update,380)},true);
    modal.addEventListener('change',()=>{update();setTimeout(update,380)},true);
  }
  update();
}
function summaryMetrics(data){
  const bar=main.querySelector('.wr22-summary');if(!bar)return;
  bar.querySelectorAll('[data-v29-summary]').forEach(x=>x.remove());
  const prefs=unitPrefs(data),a=aggregate(data),items=[['Pieces',`${fmt(a.pieces,2)} ${a.pieceUom}`.trim()],['Gross weight',dualWeight(a.grossLb,prefs.weight)],['Volume',dualVolume(a.volumeM3,prefs.dim)],['Chargeable',dualWeight(a.chargeableLb,prefs.weight)]];
  const frag=document.createDocumentFragment();items.forEach(([label,value])=>{const d=document.createElement('div');d.className='wr22-stat v29-metric-stat';d.dataset.v29Summary='1';d.innerHTML=`<small>${label}</small><b>${value}</b>`;frag.appendChild(d)});bar.prepend(frag);
}
function tableMetrics(data){
  const table=main.querySelector('.wr22-table');if(!table)return;const prefs=unitPrefs(data),map=new Map(data.cargo.map(x=>[x.id,x]));
  const heads=[...table.querySelectorAll('thead th')],qtyHead=heads.find(h=>h.textContent.trim()==='Qty'),wtHead=heads.find(h=>h.textContent.trim()==='Weight');if(qtyHead)qtyHead.textContent='Pieces';if(wtHead)wtHead.textContent='Gross weight';
  let volHead=table.querySelector('th[data-v29-vol]'),chgHead=table.querySelector('th[data-v29-chg]');
  if(!volHead&&wtHead){volHead=document.createElement('th');volHead.dataset.v29Vol='1';volHead.textContent='Volume';wtHead.after(volHead)}
  if(!chgHead&&volHead){chgHead=document.createElement('th');chgHead.dataset.v29Chg='1';chgHead.textContent='Chargeable';volHead.after(chgHead)}
  table.querySelectorAll('tbody tr').forEach(tr=>{
    const id=tr.querySelector('[data-edit-cargo]')?.dataset.editCargo||tr.querySelector('[data-cargo-select]')?.dataset.cargoSelect,x=map.get(id);if(!x)return;const m=rowMetrics(x),cells=[...tr.children];
    const weightIndex=[...table.querySelectorAll('thead th')].findIndex(h=>h.textContent.trim()==='Gross weight');
    if(weightIndex>=0&&cells[weightIndex])cells[weightIndex].textContent=dualWeight(m.grossLb,prefs.weight);
    let v=tr.querySelector('td[data-v29-vol]');if(!v){v=document.createElement('td');v.dataset.v29Vol='1';cells[weightIndex]?.after(v)}v.textContent=dualVolume(m.volumeM3,prefs.dim);
    let c=tr.querySelector('td[data-v29-chg]');if(!c){c=document.createElement('td');c.dataset.v29Chg='1';v.after(c)}c.textContent=dualWeight(m.chargeableLb,prefs.weight);
  });
}
function addStyles(){if(document.getElementById('v29-metric-styles'))return;const s=document.createElement('style');s.id='v29-metric-styles';s.textContent=`.wr22-metrics{grid-template-columns:repeat(4,minmax(0,1fr))!important}.wr22-metric b,.v29-metric-stat b{font-size:12px!important;line-height:1.35}.v29-metric-stat{min-width:135px}.wr22-table td[data-v29-vol],.wr22-table td[data-v29-chg]{white-space:nowrap;font-size:11px}@media(max-width:760px){.wr22-metrics{grid-template-columns:repeat(2,minmax(0,1fr))!important}.v29-metric-stat{min-width:145px}}`;document.head.appendChild(s)}
async function run(force=false){
  addStyles();const data=await loadData(force);if(!data)return;summaryMetrics(data);tableMetrics(data);const modal=document.querySelector('.wr22-modal');if(modal?.querySelector('#c-weight'))editorMetrics(modal,data);
}
function schedule(force=false){if(scheduled)return;scheduled=true;setTimeout(()=>{scheduled=false;run(force).catch(console.warn)},100)}
new MutationObserver(()=>schedule(false)).observe(document.body,{childList:true,subtree:true});
document.addEventListener('click',e=>{if(e.target.closest?.('#c-done,[data-edit-cargo],[data-add-cargo],[data-delete-cargo]'))setTimeout(()=>{cache.at=0;schedule(true)},500)},true);
document.addEventListener('change',e=>{if(e.target.closest?.('.wr22-modal'))setTimeout(()=>schedule(false),420)},true);
schedule(true);
