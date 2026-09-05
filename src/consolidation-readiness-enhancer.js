import {supabase} from './supabase-client.js';
import {renderReadiness,bindReadiness} from './consolidation-readiness.js';
const main=document.getElementById('main');
let token=0;
async function enhance(){
 const host=main?.querySelector('.con-readiness');
 const title=main?.querySelector('.record-header h1.title')?.textContent?.trim();
 if(!host||!title||host.dataset.readinessMounted===title)return;
 const my=++token;host.dataset.readinessMounted=title;host.innerHTML='<div class="muted">Loading house readiness…</div>';
 const {data:con,error}=await supabase.from('consolidations').select('id,mode,consolidation_number').eq('consolidation_number',title).maybeSingle();
 if(my!==token)return;if(error||!con){host.innerHTML=`<div class="notice warning">${error?.message||'Could not resolve consolidation.'}</div>`;return}
 const {data:houses,error:he}=await supabase.from('consolidation_houses').select('id,shipment_id,readiness,shipments(id,shipment_number,house_reference,reference,status)').eq('consolidation_id',con.id).order('sequence_no');
 if(my!==token)return;if(he){host.innerHTML=`<div class="notice warning">${he.message}</div>`;return}
 const rows=houses||[];
 const draw=()=>{host.innerHTML=renderReadiness(rows,con.mode);bindReadiness(host,rows,con.mode,draw)};
 draw();
}
const mo=new MutationObserver(()=>queueMicrotask(enhance));if(main)mo.observe(main,{childList:true,subtree:true});setTimeout(enhance,500);
window.nodaraRefreshConsolidationReadiness=enhance;