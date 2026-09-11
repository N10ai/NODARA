import { supabase } from './supabase-client.js';
import { getCurrentOrganizationId } from './live-data.js';

const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let state={org:null,defs:[],active:null,steps:[]};

const style=document.createElement('style');
style.textContent=`
.wfs{max-width:1120px;margin:0 auto 120px;padding:0 12px;color:#f3f7fb}.wfs-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.wfs-kicker{font-size:10px;letter-spacing:.15em;color:#7eb4e9;font-weight:700}.wfs-head h1{font-size:38px;letter-spacing:-.04em;margin:5px 0}.wfs-head p{margin:0;color:#8fa0b4;max-width:700px}.wfs-layout{display:grid;grid-template-columns:230px 1fr;gap:14px}.wfs-side,.wfs-canvas{border:1px solid #22364c;background:linear-gradient(180deg,#0c1622,#071019);border-radius:24px;padding:16px}.wfs-side button{width:100%;text-align:left;border:1px solid transparent;background:transparent;color:#8fa0b4;border-radius:13px;padding:11px;margin-bottom:6px}.wfs-side button.active{background:#142b47;color:#fff;border-color:#35689f}.wfs-toolbar{display:flex;gap:8px;align-items:center;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px}.wfs-toolbar h2{margin:0;font-size:22px}.wfs-version{font-size:10px;color:#88a0b8;border:1px solid #29425c;border-radius:999px;padding:6px 9px}.wfs-flow{display:grid;gap:12px;position:relative}.wfs-node{position:relative;border:1px solid #294058;background:#09131e;border-radius:19px;padding:14px;box-shadow:0 10px 28px #0003}.wfs-node:not(:last-child):after{content:'';position:absolute;width:2px;height:13px;background:#2e6fae;left:28px;bottom:-13px}.wfs-node-top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.wfs-node-num{width:30px;height:30px;border-radius:10px;background:#17365a;display:grid;place-items:center;color:#9dcbff;font-weight:800;flex:none}.wfs-node-main{flex:1}.wfs-node-title{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.wfs-node-title input{font-size:15px;font-weight:700;min-width:220px;background:transparent;border:0;border-bottom:1px solid transparent;color:#fff;padding:3px 0}.wfs-node-title input:focus{outline:none;border-bottom-color:#4c8fdb}.wfs-badge{font-size:8px;text-transform:uppercase;letter-spacing:.08em;border:1px solid #334a62;border-radius:999px;padding:4px 7px;color:#9fb2c6}.wfs-node-meta{color:#74899f;font-size:10px;margin-top:5px}.wfs-node-actions{display:flex;gap:5px;flex-wrap:wrap}.wfs-node-actions button{border:1px solid #2b4058;background:#0d1825;color:#b8c7d7;border-radius:9px;padding:6px 8px}.wfs-node-actions .danger{color:#ff9e9e}.wfs-config{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:11px}.wfs-config label{font-size:9px;color:#8297ad}.wfs-config select,.wfs-config input{margin-top:4px;width:100%;box-sizing:border-box;min-height:38px;border-radius:11px;border:1px solid #29405a;background:#050c14;color:#f3f7fb;padding:0 9px}.wfs-toggle{display:flex!important;align-items:center;gap:7px;margin-top:23px!important}.wfs-footer{position:sticky;bottom:84px;display:flex;justify-content:space-between;gap:10px;align-items:center;margin-top:14px;padding:10px;border:1px solid #22364c;border-radius:16px;background:#09121bea;backdrop-filter:blur(16px)}.wfs-primary{border:1px solid #5b9df0;background:linear-gradient(180deg,#438af2,#2d72dc);color:#fff;border-radius:12px;min-height:42px;padding:0 16px;font-weight:700}.wfs-secondary{border:1px solid #2b4058;background:#0d1825;color:#c7d5e3;border-radius:12px;min-height:42px;padding:0 14px}.wfs-empty{padding:28px;border:1px dashed #2d425a;border-radius:18px;color:#8497aa;text-align:center}@media(max-width:760px){.wfs-layout{grid-template-columns:1fr}.wfs-side{display:flex;overflow:auto;gap:6px}.wfs-side button{min-width:170px}.wfs-config{grid-template-columns:1fr}.wfs-head h1{font-size:30px}.wfs-footer{bottom:96px}}
`;
document.head.appendChild(style);

async function load(){
 state.org=await getCurrentOrganizationId();
 const {data,error}=await supabase.from('workflow_definitions').select('*').eq('organization_id',state.org).order('transaction_type');
 if(error)throw error;
 state.defs=data||[];
 state.active=state.active&&state.defs.find(x=>x.id===state.active.id)||state.defs[0]||null;
 state.steps=[...(state.active?.steps||[])].sort((a,b)=>(a.order||0)-(b.order||0)).map(x=>({...x}));
}

function renumber(){state.steps.forEach((s,i)=>s.order=(i+1)*10)}
function render(){
 window.nodaraSetActive?.('settings_options');
 main.innerHTML=`<section class="wfs"><div class="wfs-head"><div><div class="wfs-kicker">SETTINGS · WORKFLOWS</div><h1>Workflow Studio</h1><p>Configure the guided operating sequence per company. Record mode remains available independently for experienced operators.</p></div><button class="wfs-secondary" id="wfs-back">System settings</button></div><div class="wfs-layout"><aside class="wfs-side">${state.defs.map(d=>`<button class="${state.active?.id===d.id?'active':''}" data-def="${d.id}"><b>${esc(d.name)}</b><br><small>${esc(d.transaction_type)}</small></button>`).join('')||'<div class="wfs-empty">No workflows yet</div>'}</aside><div><section class="wfs-canvas"><div class="wfs-toolbar"><div><h2>${esc(state.active?.name||'Workflow')}</h2><div style="color:#8297ad;font-size:11px;margin-top:4px">${esc(state.active?.description||'Guided operational sequence')}</div></div><span class="wfs-version">Version ${state.active?.version||1}</span></div><div class="wfs-flow">${state.steps.map((s,i)=>node(s,i)).join('')||'<div class="wfs-empty">Add the first step to this workflow.</div>'}</div><div style="margin-top:14px"><button class="wfs-secondary" id="wfs-add">＋ Add step</button></div></section><div class="wfs-footer"><span id="wfs-state" style="color:#8297ad;font-size:10px">Changes publish only when saved.</span><button class="wfs-primary" id="wfs-save">Publish workflow</button></div></div></div></section>`;
 bind();
}
function node(s,i){return `<article class="wfs-node" data-i="${i}"><div class="wfs-node-top"><div class="wfs-node-num">${i+1}</div><div class="wfs-node-main"><div class="wfs-node-title"><input data-k="label" value="${esc(s.label||s.key||'Step')}"><span class="wfs-badge">${esc(s.type||'task')}</span>${s.required?'<span class="wfs-badge">required</span>':'<span class="wfs-badge">optional</span>'}</div><div class="wfs-node-meta">${esc(s.key||'custom')} · ${esc(s.action||'custom')}</div></div><div class="wfs-node-actions"><button data-up="${i}" ${i===0?'disabled':''}>↑</button><button data-down="${i}" ${i===state.steps.length-1?'disabled':''}>↓</button><button class="danger" data-remove="${i}">×</button></div></div><div class="wfs-config"><label>Step type<select data-k="type">${['capture','task','verification','event','form','review','notification','custom'].map(x=>`<option ${x===(s.type||'task')?'selected':''}>${x}</option>`).join('')}</select></label><label>Action<input data-k="action" value="${esc(s.action||s.key||'custom')}"></label><label class="wfs-toggle"><input data-k="enabled" type="checkbox" ${s.enabled!==false?'checked':''}> Enabled</label><label class="wfs-toggle"><input data-k="required" type="checkbox" ${s.required?'checked':''}> Required</label><label style="grid-column:span 2">Description<input data-k="description" value="${esc(s.description||'')}"></label></div></article>`}
function sync(){main.querySelectorAll('.wfs-node').forEach(n=>{const i=+n.dataset.i,s=state.steps[i];n.querySelectorAll('[data-k]').forEach(el=>{s[el.dataset.k]=el.type==='checkbox'?el.checked:el.value})});renumber()}
function bind(){
 main.querySelector('#wfs-back')?.addEventListener('click',()=>window.nodaraSystemSettings?.('general'));
 main.querySelectorAll('[data-def]').forEach(b=>b.onclick=()=>{sync();state.active=state.defs.find(x=>x.id===b.dataset.def);state.steps=[...(state.active?.steps||[])].sort((a,b)=>(a.order||0)-(b.order||0)).map(x=>({...x}));render()});
 main.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{sync();const i=+b.dataset.up;[state.steps[i-1],state.steps[i]]=[state.steps[i],state.steps[i-1]];renumber();render()});
 main.querySelectorAll('[data-down]').forEach(b=>b.onclick=()=>{sync();const i=+b.dataset.down;[state.steps[i+1],state.steps[i]]=[state.steps[i],state.steps[i+1]];renumber();render()});
 main.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{sync();state.steps.splice(+b.dataset.remove,1);renumber();render()});
 main.querySelector('#wfs-add')?.addEventListener('click',()=>{sync();const n=state.steps.length+1;state.steps.push({key:`custom_${Date.now()}`,label:`New step ${n}`,type:'task',action:'custom',order:n*10,enabled:true,required:false});render()});
 main.querySelector('#wfs-save')?.addEventListener('click',save);
}
async function save(){
 if(!state.active)return;
 sync();
 const b=main.querySelector('#wfs-save'),label=main.querySelector('#wfs-state');b.disabled=true;b.textContent='Publishing…';
 try{
   const {data,error}=await supabase.rpc('save_workflow_definition_v1',{p_definition_id:state.active.id,p_name:state.active.name,p_description:state.active.description||'',p_steps:state.steps});
   if(error)throw error;
   state.active=data; const ix=state.defs.findIndex(x=>x.id===data.id);if(ix>=0)state.defs[ix]=data;
   label.textContent=`Published version ${data.version} ✓`;b.textContent='Published ✓';setTimeout(()=>{b.textContent='Publish workflow';b.disabled=false},1000);
 }catch(e){label.textContent=e.message;b.textContent='Publish workflow';b.disabled=false}
}
export async function openWorkflowStudio(transactionType='WAREHOUSE_RECEIPT'){
 try{await load();const d=state.defs.find(x=>x.transaction_type===transactionType);if(d){state.active=d;state.steps=[...(d.steps||[])].sort((a,b)=>(a.order||0)-(b.order||0)).map(x=>({...x}))}render()}catch(e){main.innerHTML=`<div class="eyebrow">WORKFLOWS</div><h1 class="title">Workflow Studio</h1><div class="notice warning">${esc(e.message)}</div>`}
}
window.nodaraWorkflowStudio=openWorkflowStudio;

function inject(){document.querySelectorAll('.rail-flyout[data-module="settings"] .rail-flyout-list,.mobile-module-sheet .mobile-sheet-list').forEach(list=>{if(list.querySelector('[data-workflow-studio]'))return;const btn=document.createElement('button');btn.dataset.workflowStudio='1';btn.innerHTML='<span>Workflows</span><i>›</i>';btn.onclick=()=>{document.querySelector('.rail-flyout,.mobile-module-sheet')?.remove();openWorkflowStudio()};list.prepend(btn)})}
new MutationObserver(inject).observe(document.body,{childList:true,subtree:true});setTimeout(inject,700);
