const main=document.getElementById('main');
const KG_PER_LB=0.45359237,CM_PER_IN=2.54;
const num=v=>v===''||v==null?null:Number(v);
const round=(v,p=3)=>Number(v).toFixed(p).replace(/\.?0+$/,'');
function ensureUnitControls(){
  const weight=main.querySelector('#pi-weight'),l=main.querySelector('#pi-l'),w=main.querySelector('#pi-w'),h=main.querySelector('#pi-h');
  if(!weight||!l||!w||!h||main.querySelector('#pi-weight-unit'))return;
  const wf=weight.closest('.field'),pf=l.closest('.field')?.parentElement;
  const wu=document.createElement('select');wu.id='pi-weight-unit';wu.className='part-unit-select';wu.innerHTML='<option value="KG" selected>KG</option><option value="LB">LB</option>';
  const du=document.createElement('select');du.id='pi-dim-unit';du.className='part-unit-select';du.innerHTML='<option value="IN" selected>IN</option><option value="CM">CM</option>';
  const wlabel=wf?.querySelector('label');if(wlabel){wlabel.textContent='Weight';wlabel.appendChild(wu)}
  const llabel=l.closest('.field')?.querySelector('label');if(llabel){llabel.textContent='Length';llabel.appendChild(du)}
  w.closest('.field')?.querySelector('label')?.replaceChildren(document.createTextNode('Width'));
  h.closest('.field')?.querySelector('label')?.replaceChildren(document.createTextNode('Height'));
  const originalLb=num(weight.value);if(originalLb!=null)weight.value=round(originalLb*KG_PER_LB);
  weight.dataset.canonical='lb';l.dataset.canonical=w.dataset.canonical=h.dataset.canonical='in';
  const refresh=()=>{const dim=du.value;for(const el of[l,w,h]){const label=el.closest('.field')?.querySelector('label');if(!label)continue;const base=el===l?'Length':el===w?'Width':'Height';label.firstChild?label.firstChild.textContent=base:label.prepend(document.createTextNode(base));if(el===l&&!label.querySelector('#pi-dim-unit'))label.appendChild(du)}const wl=wf?.querySelector('label');if(wl?.firstChild)wl.firstChild.textContent='Weight';};
  wu.addEventListener('change',()=>{const v=num(weight.value);if(v==null)return;weight.value=wu.value==='LB'?round(v/KG_PER_LB):round(v*KG_PER_LB)});
  du.addEventListener('change',e=>{const to=e.target.value;for(const el of[l,w,h]){const v=num(el.value);if(v==null)continue;el.value=to==='CM'?round(v*CM_PER_IN,2):round(v/CM_PER_IN,2)}refresh()});
  refresh();
}
function apply(){
  if(!main.querySelector('#part-identity'))return;
  const rename=(sel,text,help)=>{const el=main.querySelector(sel);if(!el)return;const field=el.closest('.field');const label=field?.querySelector('label');if(label)label.childNodes[0]?label.childNodes[0].textContent=text:label.prepend(document.createTextNode(text));if(help&&!field?.querySelector('.field-help')){const s=document.createElement('small');s.className='field-help';s.textContent=help;field?.appendChild(s)}};
  rename('#pi-part','Part Number','Primary item/reference number.');
  rename('#pi-sku','SKU','Operational stock-keeping identifier. Can match the Part Number.');
  rename('#pi-barcode','Barcode','Machine-readable value used on warehouse labels and scanners.');
  ensureUnitControls();
}
main.addEventListener('click',e=>{
  if(!e.target.closest('#part-save,#part-save-top'))return;
  const weight=main.querySelector('#pi-weight'),wu=main.querySelector('#pi-weight-unit'),du=main.querySelector('#pi-dim-unit');
  if(weight&&wu?.value==='KG'&&weight.value!=='')weight.value=round(Number(weight.value)/KG_PER_LB);
  if(du?.value==='CM')for(const id of['pi-l','pi-w','pi-h']){const el=main.querySelector('#'+id);if(el?.value!=='')el.value=round(Number(el.value)/CM_PER_IN,4)}
},true);
new MutationObserver(()=>requestAnimationFrame(apply)).observe(main,{childList:true,subtree:true});setTimeout(apply,250);
