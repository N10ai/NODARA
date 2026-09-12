import { supabase } from './supabase-client.js';

const main=document.getElementById('main');
const busy=new Set();
let cache={wrId:null,docs:[]};

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const css=document.createElement('style');
css.textContent=`
.nodara-ai-chip{border:1px solid #31577d!important;background:#0e1c2b!important;color:#8fc4ff!important;border-radius:8px!important;padding:5px 7px!important;font-size:8px!important}.nodara-ai-chip.done{border-color:#2f6b55!important;color:#8ce0b4!important;background:#0a1b15!important}.nodara-ai-chip.busy{opacity:.75}.docai-toast{position:fixed;z-index:39000;left:50%;top:82px;transform:translate(-50%,-8px);opacity:0;pointer-events:none;border:1px solid #31577d;background:#081522;color:#dcecff;border-radius:999px;padding:9px 13px;font-size:10px;transition:.15s;box-shadow:0 12px 34px #0008}.docai-toast.show{opacity:1;transform:translate(-50%,0)}.docai-back{position:fixed;inset:0;z-index:38998;background:#000b;backdrop-filter:blur(8px)}.docai-modal{position:fixed;z-index:38999;left:50%;top:50%;transform:translate(-50%,-50%);width:min(720px,94vw);max-height:88vh;overflow:auto;border:1px solid #2d445d;border-radius:24px;background:#09121c;color:#f3f7fb;padding:20px;box-shadow:0 30px 100px #000e}.docai-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.docai-head h2{margin:3px 0}.docai-k{font-size:9px;letter-spacing:.14em;color:#79afe7}.docai-x{width:38px;height:38px;border:1px solid #2d445d;background:#0d1926;color:#fff;border-radius:11px}.docai-confidence{display:inline-flex;border:1px solid #2d5b4a;background:#091914;color:#85d8af;border-radius:999px;padding:5px 8px;font-size:9px}.docai-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}.docai-card{border:1px solid #23394f;border-radius:16px;background:#07111a;padding:13px}.docai-card h4{margin:0 0 8px;font-size:13px}.docai-card p,.docai-card li{font-size:10px;color:#aabacb;line-height:1.45}.docai-card ul{padding-left:18px;margin:6px 0}.docai-raw{white-space:pre-wrap;max-height:220px;overflow:auto;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:9px;color:#93a8bd}.docai-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}.docai-primary,.docai-secondary{min-height:42px;border-radius:12px;padding:0 14px;font-weight:700}.docai-primary{border:1px solid #66a4ee;background:#3079e6;color:#fff}.docai-secondary{border:1px solid #2d445d;background:#0d1926;color:#c9d7e5}@media(max-width:680px){.docai-grid{grid-template-columns:1fr}.docai-modal{padding:16px}}
`;
document.head.appendChild(css);

function toast(text){let e=document.querySelector('.docai-toast');if(!e){e=document.createElement('div');e.className='docai-toast';document.body.appendChild(e)}e.textContent=text;e.classList.add('show');clearTimeout(e._t);e._t=setTimeout(()=>e.classList.remove('show'),2200)}

async function currentWR(){const n=main?.querySelector('.wr19-num,.wr18-num,.txw-title')?.textContent?.trim();if(!n||!/^WR-/i.test(n))return null;const {data}=await supabase.from('warehouse_receipts').select('id,receipt_number,job_id').eq('receipt_number',n).maybeSingle();return data||null}

async function docsForWR(wrId){const {data,error}=await supabase.from('documents').select('id,warehouse_receipt_id,cargo_unit_id,file_name,display_name,mime_type,category,document_type,document_number,extraction,metadata,created_at').eq('warehouse_receipt_id',wrId).eq('is_current',true).order('created_at',{ascending:false});if(error)throw error;cache={wrId,docs:data||[]};return cache.docs}

function eligible(d){return d?.mime_type==='application/pdf'||String(d?.mime_type||'').startsWith('image/')}
function hasExtraction(d){return !!(d?.extraction&&typeof d.extraction==='object'&&Object.keys(d.extraction).length)}

export async function extractDocument(documentId,{quiet=false}={}){
 if(!documentId||busy.has(documentId))return null;
 busy.add(documentId);decorateRows();if(!quiet)toast('Reading document with NODARA AI…');
 try{
  const {data,error}=await supabase.functions.invoke('nodara-document-extract',{body:{document_id:documentId}});
  if(error)throw error;if(data?.error)throw new Error(data.message||data.error);
  document.dispatchEvent(new CustomEvent('nodara:document-extracted',{detail:data}));
  const wr=await currentWR();if(wr)await docsForWR(wr.id);
  decorateRows();if(!quiet)toast(`Document read ✓ ${Math.round(Number(data?.extraction?.confidence||0)*100)}% confidence`);
  return data;
 }catch(e){console.error('Document extraction failed',e);if(!quiet)toast(`Could not read document: ${e.message||'unknown error'}`);throw e}
 finally{busy.delete(documentId);decorateRows()}
}

export async function extractPendingCurrentWR(){const wr=await currentWR();if(!wr)return[];const docs=await docsForWR(wr.id);const pending=docs.filter(d=>eligible(d)&&!hasExtraction(d)&&!busy.has(d.id));for(const d of pending){try{await extractDocument(d.id,{quiet:true})}catch{}}if(pending.length)toast(`${pending.length} document${pending.length===1?'':'s'} analyzed`);return pending}

function flattenPairs(obj,prefix=''){const out=[];for(const [k,v] of Object.entries(obj||{})){if(v==null||v===''||v===false)continue;const label=prefix?`${prefix} ${k}`:k;if(typeof v==='object'&&!Array.isArray(v))out.push(...flattenPairs(v,label));else if(!Array.isArray(v))out.push([label.replaceAll('_',' '),String(v)])}return out}
function refsText(x){return (x?.references||[]).map(r=>`${r.type}: ${r.value}`).join(' · ')||'No references extracted'}
function partiesText(x){return Object.entries(x?.parties||{}).filter(([,v])=>v).map(([k,v])=>`${k.replaceAll('_',' ')}: ${v}`).join(' · ')||'No parties extracted'}
function complianceText(x){const a=[];if(x?.dangerous_goods?.applicable)a.push(`DG ${x.dangerous_goods.un_number||''} ${x.dangerous_goods.hazard_class||''}`.trim());if(x?.in_bond?.applicable)a.push(`In-bond ${x.in_bond.number||''}`.trim());if(x?.ftz?.applicable)a.push(`FTZ ${x.ftz.zone||x.ftz.admission_number||''}`.trim());return a.join(' · ')||'No explicit DG / in-bond / FTZ control detected'}

function closeModal(){document.querySelector('.docai-back')?.remove();document.querySelector('.docai-modal')?.remove()}

async function applySafeFacts(doc){const x=doc.extraction||{};const wrId=doc.warehouse_receipt_id;if(!wrId)return;
 const refs=[...(x.references||[])];for(const [type,value] of [['BOL',x.transport?.bol_number],['PRO',x.transport?.pro_number],['TRACKING',x.transport?.tracking_number],['AWB',x.transport?.awb_number]])if(value&&!refs.some(r=>String(r.value)===String(value)))refs.push({type,value});
 for(const r of refs){if(!r?.value)continue;const {data:exists}=await supabase.from('shipment_references').select('id').eq('warehouse_receipt_id',wrId).eq('reference_value',String(r.value)).limit(1);if(!exists?.length)await supabase.from('shipment_references').insert({warehouse_receipt_id:wrId,reference_type:String(r.type||'REFERENCE').toUpperCase(),reference_value:String(r.value),is_primary:false,source:'document_ai'})}
 const {data:visits}=await supabase.from('warehouse_visits').select('id,bol_number,pro_number,tracking_number,seal_number,trailer_number,carrier_name_snapshot').eq('warehouse_receipt_id',wrId).eq('direction','inbound').order('created_at',{ascending:false}).limit(1);
 const v=visits?.[0];if(v){const patch={};if(!v.bol_number&&x.transport?.bol_number)patch.bol_number=x.transport.bol_number;if(!v.pro_number&&x.transport?.pro_number)patch.pro_number=x.transport.pro_number;if(!v.tracking_number&&x.transport?.tracking_number)patch.tracking_number=x.transport.tracking_number;if(!v.seal_number&&x.transport?.seal_number)patch.seal_number=x.transport.seal_number;if(!v.trailer_number&&x.transport?.trailer_number)patch.trailer_number=x.transport.trailer_number;if(!v.carrier_name_snapshot&&x.parties?.carrier)patch.carrier_name_snapshot=x.parties.carrier;if(Object.keys(patch).length)await supabase.from('warehouse_visits').update(patch).eq('id',v.id)}
 toast('References and arrival facts applied ✓');document.dispatchEvent(new CustomEvent('nodara:wr-evidence-updated'));closeModal();
}

export async function showExtraction(documentId){let doc=cache.docs.find(d=>d.id===documentId);if(!doc){const {data}=await supabase.from('documents').select('*').eq('id',documentId).maybeSingle();doc=data}if(!doc)return;if(!hasExtraction(doc)){await extractDocument(documentId);const {data}=await supabase.from('documents').select('*').eq('id',documentId).maybeSingle();doc=data||doc}const x=doc.extraction||{};closeModal();const back=document.createElement('div'),modal=document.createElement('div');back.className='docai-back';modal.className='docai-modal';const pairs=flattenPairs(x.transport||{}).slice(0,12);modal.innerHTML=`<div class="docai-head"><div><div class="docai-k">NODARA DOCUMENT INTELLIGENCE</div><h2>${esc(x.document_type||doc.document_type||'Document')}</h2><div class="docai-confidence">${Math.round(Number(x.confidence||0)*100)}% confidence</div></div><button class="docai-x">×</button></div><div class="docai-card" style="margin-top:14px"><h4>${esc(doc.display_name||doc.file_name||'Document')}</h4><p>${esc(x.summary||'No summary')}</p></div><div class="docai-grid"><div class="docai-card"><h4>References</h4><p>${esc(refsText(x))}</p></div><div class="docai-card"><h4>Parties</h4><p>${esc(partiesText(x))}</p></div><div class="docai-card"><h4>Transport</h4><ul>${pairs.map(([a,b])=>`<li><b>${esc(a)}:</b> ${esc(b)}</li>`).join('')||'<li>No transport facts extracted</li>'}</ul></div><div class="docai-card"><h4>Cargo</h4><p>${x.cargo?.length?`${x.cargo.length} cargo line${x.cargo.length===1?'':'s'} detected`:'No cargo lines extracted'}</p>${x.cargo?.slice(0,5).map(c=>`<p>${esc([c.quantity,c.uom||c.package_type,c.description||c.part_number||c.sku].filter(Boolean).join(' · '))}</p>`).join('')||''}</div><div class="docai-card"><h4>Compliance signals</h4><p>${esc(complianceText(x))}</p></div><div class="docai-card"><h4>Warnings</h4><ul>${(x.warnings||[]).map(w=>`<li>${esc(w)}</li>`).join('')||'<li>None</li>'}</ul></div></div><div class="docai-card" style="margin-top:10px"><h4>Extracted text</h4><div class="docai-raw">${esc(x.raw_text||'')}</div></div><div class="docai-actions"><button class="docai-primary" data-apply>Use references & arrival data</button><button class="docai-secondary" data-reread>Read again</button><button class="docai-secondary" data-close>Close</button></div>`;document.body.append(back,modal);const close=()=>closeModal();back.onclick=close;modal.querySelector('.docai-x').onclick=close;modal.querySelector('[data-close]').onclick=close;modal.querySelector('[data-reread]').onclick=async()=>{close();await extractDocument(documentId);await showExtraction(documentId)};modal.querySelector('[data-apply]').onclick=()=>applySafeFacts(doc)}

function matchRowDoc(row){const name=row.querySelector('b')?.textContent?.trim();if(!name)return null;return cache.docs.find(d=>[d.display_name,d.file_name,d.document_number].filter(Boolean).some(v=>String(v).trim()===name))||cache.docs.find(d=>String(row.textContent||'').includes(d.display_name||d.file_name||'__none__'))}
function decorateRows(){for(const row of document.querySelectorAll('.wr19-docrow')){const actions=row.querySelector('.wr19-docactions');if(!actions)continue;let d=matchRowDoc(row);let b=actions.querySelector('.nodara-ai-chip');if(!b){b=document.createElement('button');b.className='nodara-ai-chip';actions.prepend(b)}if(!d){b.style.display='none';continue}b.style.display='';b.dataset.docAi=d.id;if(busy.has(d.id)){b.textContent='Reading…';b.classList.add('busy');b.classList.remove('done')}else if(hasExtraction(d)){b.textContent=`AI ✓ ${Math.round(Number(d.extraction.confidence||0)*100)}%`;b.classList.add('done');b.classList.remove('busy')}else{b.textContent='Read AI';b.classList.remove('done','busy')}b.onclick=e=>{e.preventDefault();e.stopPropagation();showExtraction(d.id)}}}

async function refreshUI(){const wr=await currentWR();if(!wr)return;if(cache.wrId!==wr.id)await docsForWR(wr.id);else{const {data}=await supabase.from('documents').select('id,warehouse_receipt_id,cargo_unit_id,file_name,display_name,mime_type,category,document_type,document_number,extraction,metadata,created_at').eq('warehouse_receipt_id',wr.id).eq('is_current',true).order('created_at',{ascending:false});cache.docs=data||[]}decorateRows()}

let mt;new MutationObserver(()=>{clearTimeout(mt);mt=setTimeout(refreshUI,180)}).observe(main,{childList:true,subtree:true});
document.addEventListener('nodara:wr-evidence-updated',()=>setTimeout(async()=>{await refreshUI();await extractPendingCurrentWR();await refreshUI()},350));
document.addEventListener('click',e=>{if(e.target.closest?.('[data-doc-scan],[data-doc-upload]'))setTimeout(()=>extractPendingCurrentWR().catch(()=>{}),2500)},{capture:true});
setTimeout(refreshUI,900);

window.NodaraDocumentAI={extract:extractDocument,extractPendingCurrentWR,show:showExtraction,refresh:refreshUI};
