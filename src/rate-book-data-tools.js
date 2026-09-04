import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';

const slug=s=>String(s||'').trim().toUpperCase().normalize('NFKD').replace(/[^A-Z0-9]+/g,'_').replace(/^_+|_+$/g,'').slice(0,48)||'SERVICE';
const norm=s=>String(s??'').trim();
const upper=s=>norm(s).toUpperCase();

async function loadXLSX(){
  if(window.XLSX)return window.XLSX;
  await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';s.onload=resolve;s.onerror=reject;document.head.appendChild(s)});
  return window.XLSX;
}

function csvCell(v){const s=String(v??'');return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s}
function download(name,blob){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)}

async function fetchStandardRows(){
  const org=await getCurrentOrganizationId();
  const [s,r]=await Promise.all([
    supabase.from('service_catalog').select('*').eq('organization_id',org).eq('active',true).order('domain').order('name'),
    supabase.from('standard_rates').select('*').eq('organization_id',org).eq('active',true).order('effective_from',{ascending:false})
  ]);
  if(s.error)throw s.error;if(r.error)throw r.error;
  const latest=new Map();for(const x of r.data||[])if(!latest.has(x.service_id))latest.set(x.service_id,x);
  return (s.data||[]).map(x=>{const z=latest.get(x.id);return{Domain:x.domain,Service:x.name,Code:x.code,Unit:z?.unit||x.default_unit||'EA','Sell Rate':z?.sell_rate??'',Minimum:z?.minimum_charge??'',Currency:z?.currency||'USD','Effective From':z?.effective_from||'',Description:x.description||''}});
}

async function exportCSV(){try{const rows=await fetchStandardRows();if(!rows.length)return alert('No standard rates to export.');const headers=Object.keys(rows[0]);const text=[headers.join(','),...rows.map(r=>headers.map(h=>csvCell(r[h])).join(','))].join('\n');download(`NODARA-Standard-Rates-${new Date().toISOString().slice(0,10)}.csv`,new Blob([text],{type:'text/csv;charset=utf-8'}))}catch(e){alert(e.message)}}
async function exportXLSX(){try{const XLSX=await loadXLSX(),rows=await fetchStandardRows();if(!rows.length)return alert('No standard rates to export.');const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(rows);XLSX.utils.book_append_sheet(wb,ws,'Standard Rates');XLSX.writeFile(wb,`NODARA-Standard-Rates-${new Date().toISOString().slice(0,10)}.xlsx`)}catch(e){alert(e.message||'Could not export Excel file.')}}

function val(row,...keys){for(const k of keys){const hit=Object.keys(row).find(x=>x.trim().toLowerCase()===k.toLowerCase());if(hit!=null&&row[hit]!=null&&String(row[hit]).trim()!=='')return row[hit]}return ''}
async function parseFile(file){
  const ext=file.name.split('.').pop().toLowerCase();
  if(ext==='csv'){
    const text=await file.text();
    const lines=text.split(/\r?\n/).filter(Boolean);if(!lines.length)return[];
    const parse=l=>{const out=[];let s='',q=false;for(let i=0;i<l.length;i++){const c=l[i];if(c==='"'){if(q&&l[i+1]==='"'){s+='"';i++}else q=!q}else if(c===','&&!q){out.push(s);s=''}else s+=c}out.push(s);return out};
    const h=parse(lines[0]);return lines.slice(1).map(l=>{const a=parse(l),o={};h.forEach((x,i)=>o[x]=a[i]??'');return o});
  }
  const XLSX=await loadXLSX(),buf=await file.arrayBuffer(),wb=XLSX.read(buf,{type:'array'}),ws=wb.Sheets[wb.SheetNames[0]];return XLSX.utils.sheet_to_json(ws,{defval:''});
}

async function importRates(file){
  try{
    const rows=await parseFile(file);if(!rows.length)return alert('No rows found in that file.');
    const org=await getCurrentOrganizationId();let created=0,updated=0,skipped=0;
    for(const row of rows){
      const name=norm(val(row,'Service','Service Name','Name'));if(!name){skipped++;continue}
      const domain=upper(val(row,'Domain'))||'WAREHOUSE',unit=upper(val(row,'Unit','Billing Unit'))||'EA',code=upper(val(row,'Code'))||slug(name),desc=norm(val(row,'Description'))||null;
      const sellRaw=val(row,'Sell Rate','Rate','Standard Rate'),minRaw=val(row,'Minimum','Minimum Charge'),currency=upper(val(row,'Currency'))||'USD',effective=norm(val(row,'Effective From','Effective Date'))||new Date().toISOString().slice(0,10);
      let service;
      const existing=await supabase.from('service_catalog').select('*').eq('organization_id',org).eq('code',code).maybeSingle();if(existing.error)throw existing.error;
      if(existing.data){service=existing.data;const u=await supabase.from('service_catalog').update({name,domain,default_unit:unit,description:desc,active:true,updated_at:new Date().toISOString()}).eq('id',service.id).select().single();if(u.error)throw u.error;service=u.data;updated++}
      else{const ins=await supabase.from('service_catalog').insert({organization_id:org,code,name,domain,default_unit:unit,description:desc,active:true}).select().single();if(ins.error)throw ins.error;service=ins.data;created++}
      if(String(sellRaw).trim()!==''||String(minRaw).trim()!==''){
        const current=await supabase.from('standard_rates').select('*').eq('organization_id',org).eq('service_id',service.id).eq('active',true).order('effective_from',{ascending:false}).limit(1).maybeSingle();if(current.error)throw current.error;
        const payload={organization_id:org,service_id:service.id,sell_rate:String(sellRaw).trim()===''?0:Number(sellRaw),buy_rate:current.data?.buy_rate??null,currency,unit,minimum_charge:String(minRaw).trim()===''?null:Number(minRaw),effective_from:effective,active:true,updated_at:new Date().toISOString()};
        const q=current.data?supabase.from('standard_rates').update(payload).eq('id',current.data.id):supabase.from('standard_rates').insert(payload);const {error}=await q;if(error)throw error;
      }
    }
    alert(`Import complete: ${created} created · ${updated} updated · ${skipped} skipped`);window.nodaraRateBook?.open?.();
  }catch(e){alert(e.message||'Could not import rates.')}
}

function filterRows(){
  const list=document.querySelector('.rate-list');if(!list)return;
  const q=upper(document.getElementById('rate-filter-search')?.value),unit=upper(document.getElementById('rate-filter-unit')?.value),status=document.getElementById('rate-filter-status')?.value||'ALL',sort=document.getElementById('rate-filter-sort')?.value||'NAME';
  const rows=[...list.querySelectorAll('.rate-row')];
  for(const r of rows){const txt=upper(r.innerText),hasRate=!txt.includes('NO RATE'),u=upper(r.querySelector('.rate-value small')?.textContent);r.hidden=!!(q&&!txt.includes(q)||unit&&unit!=='ALL'&&u!==unit||status==='CONFIGURED'&&!hasRate||status==='MISSING'&&hasRate)}
  const visible=rows.filter(r=>!r.hidden);visible.sort((a,b)=>{if(sort==='RATE_DESC'){const n=x=>Number((x.querySelector('.rate-value b')?.textContent||'').replace(/[^0-9.-]/g,''))||0;return n(b)-n(a)}if(sort==='RATE_ASC'){const n=x=>Number((x.querySelector('.rate-value b')?.textContent||'').replace(/[^0-9.-]/g,''))||0;return n(a)-n(b)}return (a.innerText||'').localeCompare(b.innerText||'')});for(const r of visible)list.appendChild(r);
}

function addToolbar(){
  if(!document.querySelector('.rate-book-section .rate-list')||document.getElementById('rate-data-toolbar'))return;
  const section=document.querySelector('.rate-book-section'),units=[...new Set([...section.querySelectorAll('.rate-row .rate-value small')].map(x=>upper(x.textContent)).filter(Boolean))].sort();
  const bar=document.createElement('div');bar.id='rate-data-toolbar';bar.className='rate-data-toolbar';bar.innerHTML=`<div class="rate-filter-search"><span>⌕</span><input id="rate-filter-search" placeholder="Search service, code, unit…"></div><select id="rate-filter-unit"><option value="ALL">All units</option>${units.map(x=>`<option>${x}</option>`).join('')}</select><select id="rate-filter-status"><option value="ALL">All rates</option><option value="CONFIGURED">Configured</option><option value="MISSING">Missing rate</option></select><select id="rate-filter-sort"><option value="NAME">Sort: Service</option><option value="RATE_ASC">Rate: Low → High</option><option value="RATE_DESC">Rate: High → Low</option></select><div class="rate-data-actions"><button class="secondary compact-btn" id="rate-import">Import</button><button class="secondary compact-btn" id="rate-export-csv">CSV</button><button class="secondary compact-btn" id="rate-export-xlsx">Excel</button><input id="rate-import-file" type="file" accept=".xlsx,.xls,.csv" hidden></div>`;
  section.insertBefore(bar,section.querySelector('.rate-list'));
  ['rate-filter-search','rate-filter-unit','rate-filter-status','rate-filter-sort'].forEach(id=>document.getElementById(id)?.addEventListener('input',filterRows));
  document.getElementById('rate-import').onclick=()=>document.getElementById('rate-import-file').click();document.getElementById('rate-import-file').onchange=e=>e.target.files?.[0]&&importRates(e.target.files[0]);document.getElementById('rate-export-csv').onclick=exportCSV;document.getElementById('rate-export-xlsx').onclick=exportXLSX;
}

function simplifyButtons(){
  const modeBtns=[...document.querySelectorAll('[data-rate-mode]')],standard=modeBtns.find(x=>x.dataset.rateMode==='standard')?.classList.contains('active'),customer=modeBtns.find(x=>x.dataset.rateMode==='customer')?.classList.contains('active'),templates=modeBtns.find(x=>x.dataset.rateMode==='templates')?.classList.contains('active');
  const service=document.getElementById('rate-new-service'),rate=document.getElementById('rate-new-rate'),template=document.getElementById('rate-new-template');
  if(standard&&service){service.textContent='＋ Standard Rate';service.classList.remove('secondary');service.classList.add('primary');if(rate)rate.style.display='none'}
  if(customer){if(service)service.style.display='none';if(rate)rate.textContent='＋ Customer Rate'}
  if(templates&&service)service.style.display='none';if(template)template.textContent='＋ Template';
}

async function addDelete(){
  const save=document.getElementById('rr-save');if(!save||document.getElementById('rr-delete'))return;
  const title=document.querySelector('.title')?.textContent?.trim();if(!title)return;
  const del=document.createElement('button');del.id='rr-delete';del.className='secondary compact-btn danger-btn';del.textContent='Delete / Archive';save.parentElement?.insertBefore(del,save);
  del.onclick=async()=>{
    if(!confirm(`Remove "${title}" from the active Rate Book? Historical charges will be preserved.`))return;
    try{const org=await getCurrentOrganizationId(),s=await supabase.from('service_catalog').select('id').eq('organization_id',org).eq('name',title).limit(1).maybeSingle();if(s.error)throw s.error;if(!s.data)return alert('Service record not found.');
      const sid=s.data.id;const [agr,tmp,chg]=await Promise.all([supabase.from('customer_rate_agreements').select('id',{count:'exact',head:true}).eq('service_id',sid),supabase.from('rate_template_lines').select('id',{count:'exact',head:true}).eq('service_id',sid),supabase.from('operational_charges').select('id',{count:'exact',head:true}).eq('service_id',sid)]);
      const referenced=(agr.count||0)+(tmp.count||0)+(chg.count||0)>0;
      if(referenced){const [a,b]=await Promise.all([supabase.from('service_catalog').update({active:false,updated_at:new Date().toISOString()}).eq('id',sid),supabase.from('standard_rates').update({active:false,updated_at:new Date().toISOString()}).eq('service_id',sid)]);if(a.error)throw a.error;if(b.error)throw b.error}
      else{const r=await supabase.from('standard_rates').delete().eq('service_id',sid);if(r.error)throw r.error;const sdel=await supabase.from('service_catalog').delete().eq('id',sid);if(sdel.error)throw sdel.error}
      window.nodaraRateBook?.open?.();
    }catch(e){alert(e.message)}
  };
}

function enhance(){simplifyButtons();addToolbar();addDelete()}
const obs=new MutationObserver(()=>setTimeout(enhance,0));obs.observe(document.body,{childList:true,subtree:true});setTimeout(enhance,500);
