import { getOptionSet } from './configurable-options.js?v=20260912-v27';

function wire(){
  const overlay=document.querySelector('.wrm-overlay');
  const bar=overlay?.querySelector('.wrm-tagbar');
  if(!overlay||!bar)return;
  const configured=getOptionSet('photo_tags');
  const existing=new Map([...bar.querySelectorAll('[data-tag]')].map(b=>[b.dataset.tag,b]));
  const other=existing.get('Other');
  for(const tag of configured){
    if(!tag||tag==='Other')continue;
    let b=existing.get(tag);
    if(!b){
      b=document.createElement('button');
      b.className='wrm-tag';
      b.dataset.tag=tag;
      b.textContent=tag;
      bar.insertBefore(b,other||null);
      existing.set(tag,b);
    }
    if(b.dataset.configTagWired)continue;
    b.dataset.configTagWired='1';
    if(['Front','Back','Left','Right','Weight','Damage'].includes(tag))continue;
    b.addEventListener('click',e=>{
      e.preventDefault();e.stopImmediatePropagation();
      const otherBtn=bar.querySelector('[data-tag="Other"]');
      const input=overlay.querySelector('#wrm-custom-tag');
      const use=overlay.querySelector('#wrm-custom-use');
      if(!otherBtn||!input||!use)return;
      otherBtn.click();
      input.value=tag;
      use.click();
      bar.querySelectorAll('.wrm-tag').forEach(x=>x.classList.toggle('active',x===b));
    },true);
  }
}

new MutationObserver(()=>requestAnimationFrame(wire)).observe(document.body,{childList:true,subtree:true});
window.addEventListener('nodara-options-changed',e=>{if(e.detail?.name==='photo_tags')wire()});
wire();
