import { supabase } from './supabase-client.js';

const main=document.getElementById('main');
let timer=null,lastAuto=0;

const css=document.createElement('style');
css.textContent=`
.txw-title.nodara-context-bridge{position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;white-space:nowrap!important;opacity:0!important;pointer-events:none!important}.nr-ai-doc{display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid #31577d;background:#0c1a29;color:#b9d9fa;border-radius:16px;min-height:54px;padding:0 15px;font-weight:700}.nr-ai-doc small{display:block;color:#7890a8;font-weight:500}.nr-ai-doc svg{width:21px;height:21px}.nr-ai-doc:disabled{opacity:.6}
`;
document.head.appendChild(css);

const icon=`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v5h5M9 13h6M9 17h6"/><path d="M3 8V5a2 2 0 0 1 2-2h3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M21 16v3a2 2 0 0 1-2 2h-3"/></svg>`;

function ensureLegacyContext(){const root=main.querySelector('.wr19');if(!root)return;const num=root.querySelector('.wr19-num')?.textContent?.trim();if(!num)return;let n=root.querySelector('.txw-title.nodara-context-bridge');if(!n){n=document.createElement('span');n.className='txw-title nodara-context-bridge';root.appendChild(n)}n.textContent=num}

async function createShellForDocument(){const type=main.querySelector('#nr-type')?.value||'BOL',ref=main.querySelector('#nr-ref')?.value?.trim()||null;const {data,error}=await supabase.rpc('create_warehouse_receipt_shell_v1',{p_reference_type:type,p_reference_value:ref,p_expected_source_type:null,p_expected_source_id:null,p_expected_snapshot:{source:'DOCUMENT_AI_ARRIVAL'}});if(error)throw error;return data}

function ensureArrivalAI(){const scan=main.querySelector('#nr-scan');if(!scan||main.querySelector('#nr-ai-doc'))return;const b=document.createElement('button');b.id='nr-ai-doc';b.className='nr-ai-doc';b.innerHTML=`${icon}<span>Scan document with AI<small>BOL · AWB · packing list · shipping document</small></span>`;scan.insertAdjacentElement('afterend',b);b.onclick=async()=>{b.disabled=true;const old=b.innerHTML;b.innerHTML='<span>Creating receiving record…</span>';try{const shell=await createShellForDocument();if(typeof window.nodaraOpenCanonicalWR==='function')await window.nodaraOpenCanonicalWR(shell.warehouse_receipt_id,'guided');else throw new Error('Receiving workspace is not ready.');let tries=0;while(!window.NodaraWRScanner&&tries++<20)await new Promise(r=>setTimeout(r,100));if(!window.NodaraWRScanner?.open)throw new Error('Document scanner is not ready.');window.NodaraWRScanner.open({category:'BOL'});}catch(e){alert(e.message||'Could not start document scan.');b.disabled=false;b.innerHTML=old}}
}

async function maybeAutoExtract(){if(!main.querySelector('.wr19'))return;if(Date.now()-lastAuto<2500)return;lastAuto=Date.now();try{await window.NodaraDocumentAI?.extractPendingCurrentWR?.()}catch(e){console.warn('Automatic document extraction skipped',e)}}

function wire(){ensureLegacyContext();ensureArrivalAI();clearTimeout(timer);timer=setTimeout(maybeAutoExtract,900)}
new MutationObserver(wire).observe(main,{childList:true,subtree:true});
document.addEventListener('nodara:wr-evidence-updated',()=>setTimeout(maybeAutoExtract,250));
document.addEventListener('nodara:document-extracted',()=>setTimeout(()=>window.NodaraDocumentAI?.refresh?.(),100));
setTimeout(wire,700);
