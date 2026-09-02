const main=document.getElementById('main');
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clean=s=>String(s||'').replace(/^＋\s*Create new…$/i,'').trim();

function installOne(select){
  if(select.dataset.typeaheadInstalled)return;
  select.dataset.typeaheadInstalled='1';
  const role=select.dataset.party;
  const field=select.closest('.object-field')||select.parentElement;
  if(!field)return;
  select.classList.add('party-native-select');
  select.setAttribute('aria-hidden','true');
  select.tabIndex=-1;

  const selected=select.options[select.selectedIndex];
  const current=select.value&&select.value!=='__new__'?clean(selected?.textContent):'';
  const wrap=document.createElement('div');
  wrap.className='party-typeahead';
  wrap.innerHTML=`<div class="party-search-box"><span class="party-search-icon">⌕</span><input class="party-search-input" autocomplete="off" placeholder="Type name, code or contact…" value="${esc(current)}"><button type="button" class="party-clear" aria-label="Clear">×</button></div><div class="party-suggestions" hidden></div>`;
  select.insertAdjacentElement('afterend',wrap);
  const input=wrap.querySelector('.party-search-input'),out=wrap.querySelector('.party-suggestions'),clear=wrap.querySelector('.party-clear');

  function options(){return [...select.options].filter(o=>o.value&&o.value!=='__new__').map(o=>({id:o.value,label:clean(o.textContent)}))}
  function close(){out.hidden=true;out.innerHTML=''}
  function choose(id,label){select.value=id;input.value=label;close();select.dispatchEvent(new Event('change',{bubbles:true}))}
  function render(q=''){
    q=q.trim();const needle=q.toLowerCase();
    const matches=options().filter(x=>!needle||x.label.toLowerCase().includes(needle)).slice(0,8);
    const exact=options().some(x=>x.label.toLowerCase()===needle);
    const rows=matches.map(x=>`<button type="button" class="party-suggestion" data-party-id="${esc(x.id)}"><span>${esc(x.label)}</span><small>Saved record</small></button>`);
    if(q&&!exact)rows.push(`<button type="button" class="party-suggestion party-create-suggestion" data-create-party="1"><span>＋ Create “${esc(q)}”</span><small>Save as ${esc(role.replaceAll('_',' '))}</small></button>`);
    if(!rows.length)rows.push('<div class="party-no-results">No matching saved records</div>');
    out.innerHTML=rows.join('');out.hidden=false;
    out.querySelectorAll('[data-party-id]').forEach(b=>b.onclick=()=>choose(b.dataset.partyId,b.querySelector('span').textContent));
    out.querySelector('[data-create-party]')?.addEventListener('click',()=>createInline(q));
  }
  function createInline(name){
    name=name.trim();if(!name)return;
    const oldPrompt=window.prompt;
    window.prompt=()=>name;
    select.value='__new__';
    select.dispatchEvent(new Event('change',{bubbles:true}));
    setTimeout(()=>{window.prompt=oldPrompt},0);
    close();
  }
  input.addEventListener('focus',()=>render(input.value));
  input.addEventListener('input',()=>render(input.value));
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){close();input.blur()}
    if(e.key==='Enter'){
      e.preventDefault();
      const first=out.querySelector('[data-party-id]');
      if(first)first.click(); else if(input.value.trim())createInline(input.value);
    }
  });
  clear.onclick=()=>{input.value='';select.value='';close();select.dispatchEvent(new Event('change',{bubbles:true}))};
  document.addEventListener('pointerdown',e=>{if(!wrap.contains(e.target))close()});
}

function install(){main?.querySelectorAll('select[data-party]').forEach(installOne)}
let queued=false;new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;install()})}).observe(main,{childList:true,subtree:true});
setTimeout(install,250);
