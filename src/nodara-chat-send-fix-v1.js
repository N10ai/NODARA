import { parseIntent } from './ai-intent-engine.js?v=20260910-ai2';
import { executeIntent, canExecuteIntent } from './ai-intent-executor.js?v=20260910-ai2';

const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function add(log,kind,html,cls=''){
  const el=document.createElement('div');
  el.className=`nodara-chat-msg ${kind} ${cls}`;
  el.innerHTML=html;
  log.appendChild(el);
  log.scrollTop=log.scrollHeight;
  return el;
}

function facts(result){
  const f=result?.intent?.facts||{},c=f.cargo?.[0],out=[];
  if(f.customer_name)out.push(`Customer: ${f.customer_name}`);
  if(c?.quantity)out.push(`${c.quantity} ${c.package_type||'units'}`);
  if(c?.weight!=null)out.push(`${c.weight} ${c.weight_unit||''}`);
  if(c?.length!=null)out.push(`${c.length}×${c.width}×${c.height} ${c.dimension_unit||''}`);
  return out;
}

async function send(pop){
  if(!pop||pop.dataset.sending==='1')return;
  const ta=pop.querySelector('.nodara-chat-compose textarea');
  const log=pop.querySelector('.nodara-chat-log');
  const text=ta?.value.trim();
  if(!ta||!log||!text)return;
  pop.dataset.sending='1';
  add(log,'user',esc(text));
  ta.value='';
  ta.dispatchEvent(new Event('input',{bubbles:true}));
  const thinking=add(log,'ai','Thinking…');
  try{
    const result=await parseIntent(text,{source:'TEXT',context:{surface:'NODARA_CHAT'}});
    thinking.remove();
    const gate=canExecuteIntent(result),intent=result.intent||{},fs=facts(result);
    const card=add(log,'ai',`<h4 style="margin:0 0 5px">${esc(intent.summary||`${intent.action||''} ${intent.transaction_type||''}`)}</h4><small>${esc(String(intent.transaction_type||'').replaceAll('_',' '))}${intent.confidence!=null?` · ${Math.round(Number(intent.confidence)*100)}% confidence`:''}</small>${fs.length?`<div class="nodara-chat-intent-facts">${fs.map(x=>`<span>${esc(x)}</span>`).join('')}</div>`:''}${result.resolution?.has_unresolved?'<small style="display:block;margin-top:7px;color:#ffcb7c">I need a clearer record match before executing this.</small>':''}<div class="nodara-chat-intent-actions">${gate.ok?`<button data-chat-do>${intent.action==='OPEN'?'Open':'Prepare'}</button>`:''}<button class="secondary" data-chat-dismiss>Dismiss</button></div>${gate.ok?'':`<small style="display:block;margin-top:7px">${esc(gate.reason||'This request needs more information.')}</small>`}`,'nodara-chat-intent');
    card.querySelector('[data-chat-dismiss]')?.addEventListener('click',()=>card.remove());
    card.querySelector('[data-chat-do]')?.addEventListener('click',async e=>{
      const b=e.currentTarget;b.disabled=true;b.textContent='Working…';
      try{await executeIntent(result);b.textContent='Done ✓'}catch(err){b.disabled=false;b.textContent='Try again';add(log,'ai',esc(err?.message||'Action failed.'),'nodara-chat-intent-error')}
    });
  }catch(err){
    thinking.remove();
    add(log,'ai',`<b>I couldn't process that yet.</b><br><small>${esc(err?.message||'Unknown error')}</small>`,'nodara-chat-intent-error');
  }finally{
    pop.dataset.sending='0';
  }
}

function isSendButton(btn){
  if(!btn?.closest('.nodara-chat-compose'))return false;
  if(btn.classList.contains('nodara-chat-mic'))return false;
  return true;
}

document.addEventListener('click',e=>{
  const btn=e.target.closest?.('.nodara-chat-compose button');
  if(!isSendButton(btn))return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  send(btn.closest('.nodara-chat-pop'));
},true);

document.addEventListener('keydown',e=>{
  const ta=e.target.closest?.('.nodara-chat-compose textarea');
  if(!ta||e.key!=='Enter'||e.shiftKey)return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
  send(ta.closest('.nodara-chat-pop'));
},true);
