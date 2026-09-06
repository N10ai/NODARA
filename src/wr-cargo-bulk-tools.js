const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const wait=(ms=0)=>new Promise(r=>setTimeout(r,ms));
let importing=false,hydratedToken='';

const style=document.createElement('style');style.textContent=`.wr-bulk-cargo-tools{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 0 14px}.wr-bulk-cargo-tools .bulk-note{font-size:11px;color:var(--muted);margin-right:auto}.cargo-line-copy-actions{display:flex;gap:6px;flex-wrap:wrap;margin-left:8px}.wr-csv-input{display:none}`;document.head.appendChild(style);

function parseCSV(text){
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i],next=text[i+1];
    if(ch==='"'){
      if(quoted&&next==='"'){cell+='"';i++;continue}
      quoted=!quoted;continue;
    }
    if(ch===','&&!quoted){row.push(cell);cell='';continue}
    if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);cell='';if(row.some(x=>String(x).trim()))rows.push(row);row=[];continue}
    cell+=ch;
  }
  row.push(cell);if(row.some(x=>String(x).trim()))rows.push(row);
  if(rows.length<2)return [];
  const heads=rows.shift().map(h=>String(h).trim().toLowerCase().replace(/[\s-]+/g,'_'));
  return rows.map(r=>Object.fromEntries(heads.map((h,i)=>[h,String(r[i]??'').trim()]))).filter(x=>Object.values(x).some(Boolean));
}
function val(row,...keys){for(const k of keys){if(row[k]!==undefined&&row[k]!=='')return row[k]}return ''}
function n(v){const x=Number(String(v??'').replace(/,/g,''));return Number.isFinite(x)?x:0}
function convertWeight(value,from,to){let x=n(value);from=String(from||to).toUpperCase();to=String(to).toUpperCase();if(!x||from===to)return x;if(from==='KG'&&to==='LB')return x*2.2046226218;if(from==='LB'&&to==='KG')return x/2.2046226218;return x}
function convertDim(value,from,to){let x=n(value);from=String(from||to).toUpperCase();to=String(to).toUpperCase();if(!x||from===to)return x;if(from==='CM'&&to==='IN')return x/2.54;if(from==='IN'&&to==='CM')return x*2.54;return x}
function rootBranches(){return [...document.querySelectorAll('.cargo-hierarchy-v3 .cargo-root-branch')]}
function rootCard(branch){return branch?.querySelector(':scope > .cargo-tree-node, .cargo-tree-node')||null}
function field(card,suffix){return card?.querySelector(`[id$="-${suffix}"]`)||null}
function fire(el){if(!el)return;el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}))}
function readRoot(branch){const card=rootCard(branch);return{package_type:field(card,'type')?.value||'PALLET',quantity:field(card,'qty')?.value||1,description:field(card,'desc')?.value||'',part_number:field(card,'part')?.value||'',sku:field(card,'sku')?.value||'',barcode:field(card,'barcode')?.value||'',gross_weight:field(card,'weight')?.value||'',length:field(card,'l')?.value||'',width:field(card,'w')?.value||'',height:field(card,'h')?.value||'',location:field(card,'location')?.value||'',condition:field(card,'condition')?.value||''}}
function isBlankRoot(branch){const x=readRoot(branch);return !x.description&&!x.part_number&&!x.sku&&!x.barcode&&!n(x.gross_weight)&&!n(x.length)&&!n(x.width)&&!n(x.height)&&!x.location&&n(x.quantity)===1}
async function ensureRoot(useBlank=true){let roots=rootBranches();if(useBlank&&roots.length===1&&isBlankRoot(roots[0]))return roots[0];document.getElementById('cv3-add-root')?.click();await wait(20);roots=rootBranches();return roots.at(-1)}
function applyRow(branch,row){
  const card=rootCard(branch);if(!card)return;
  const weightUI=document.getElementById('cv3-weight-unit')?.value||'KG',dimUI=document.getElementById('cv3-dim-unit')?.value||'IN';
  const values={type:String(val(row,'package_type','type','package','packaging')||'PALLET').toUpperCase(),qty:Math.max(1,Math.round(n(val(row,'quantity','qty','pieces'))||1)),desc:val(row,'description','commodity','cargo_description'),part:val(row,'part_number','part','pn'),sku:val(row,'sku'),barcode:val(row,'barcode','upc'),weight:convertWeight(val(row,'gross_weight','weight','weight_per_piece'),val(row,'weight_unit','weight_uom')||weightUI,weightUI),l:convertDim(val(row,'length','l'),val(row,'dimension_unit','dim_unit','dimension_uom')||dimUI,dimUI),w:convertDim(val(row,'width','w'),val(row,'dimension_unit','dim_unit','dimension_uom')||dimUI,dimUI),h:convertDim(val(row,'height','h'),val(row,'dimension_unit','dim_unit','dimension_uom')||dimUI,dimUI)};
  for(const [k,v] of Object.entries(values)){const el=field(card,k);if(!el)continue;if(k==='type'&&![...el.options].some(o=>o.value===v))continue;el.value=v??'';fire(el)}
}
async function addRows(rows,{replaceBlank=true}={}){if(!rows.length)return;importing=true;try{for(let i=0;i<rows.length;i++){const branch=await ensureRoot(replaceBlank&&i===0);applyRow(branch,rows[i]);await wait(12)}}finally{importing=false;install()}}
function downloadTemplate(){const csv='package_type,quantity,description,part_number,sku,barcode,gross_weight,weight_unit,length,width,height,dimension_unit\nPALLET,1,Sample cargo,PN-100,SKU-100,,500,LB,48,40,55,IN\n';const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='nodara-wr-cargo-template.csv';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},0)}
async function importFile(file){if(!file)return;const rows=parseCSV(await file.text());if(!rows.length)return alert('No cargo rows were found. Use the NODARA CSV template or include a header row.');await addRows(rows);}
async function duplicateRoot(branch,count=1){const row=readRoot(branch);for(let i=0;i<count;i++){const next=await ensureRoot(false);applyRow(next,row)}install()}
function addRootActions(){for(const branch of rootBranches()){const card=rootCard(branch),head=card?.querySelector('.cargo-node-head-actions');if(!head||head.querySelector('[data-duplicate-root]'))continue;const wrap=document.createElement('span');wrap.className='cargo-line-copy-actions';wrap.innerHTML='<button type="button" class="subtle compact-btn" data-duplicate-root>Duplicate</button><button type="button" class="subtle compact-btn" data-duplicate-many>Duplicate × N</button>';head.prepend(wrap);wrap.querySelector('[data-duplicate-root]').onclick=()=>duplicateRoot(branch,1);wrap.querySelector('[data-duplicate-many]').onclick=()=>{const qty=Math.min(250,Math.max(1,Math.round(Number(prompt('How many copies of this cargo line?','5'))||0)));if(qty)duplicateRoot(branch,qty)}}}
function addBulkToolbar(){const h=document.querySelector('.cargo-hierarchy-v3');if(!h||h.querySelector('.wr-bulk-cargo-tools'))return;const toolbar=h.querySelector('.cargo-hierarchy-toolbar');if(!toolbar)return;const box=document.createElement('div');box.className='wr-bulk-cargo-tools';box.innerHTML=`<span class="bulk-note">Fast entry for large receipts</span><button type="button" class="secondary compact-btn" data-import-csv>Import CSV</button><button type="button" class="subtle compact-btn" data-csv-template>CSV template</button><input class="wr-csv-input" type="file" accept=".csv,text/csv">`;toolbar.insertAdjacentElement('afterend',box);const input=box.querySelector('input');box.querySelector('[data-import-csv]').onclick=()=>input.click();box.querySelector('[data-csv-template]').onclick=downloadTemplate;input.onchange=()=>{const f=input.files?.[0];input.value='';importFile(f)}}
async function hydrateConvertedSource(){const rows=window.__nodaraPendingWRExpectedCargo;if(importing||!Array.isArray(rows)||!rows.length)return;const token=JSON.stringify(rows);if(hydratedToken===token)return;hydratedToken=token;await addRows(rows);delete window.__nodaraPendingWRExpectedCargo}
function install(){if(importing)return;const h=document.querySelector('.cargo-hierarchy-v3');if(!h)return;addBulkToolbar();addRootActions();hydrateConvertedSource()}
new MutationObserver(()=>requestAnimationFrame(install)).observe(main,{childList:true,subtree:true});
setTimeout(install,350);
