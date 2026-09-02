const main=document.getElementById('main');
let currentEditor=null;
function ensureSummary(){
  const editor=main.querySelector('.wr-object-head');
  const summary=main.querySelector('.wr-draft-summary');
  if(!editor||!summary)return;
  if(currentEditor!==editor){currentEditor=editor;summary.classList.remove('summary-expanded')}
  if(!summary.querySelector('.wr-summary-toggle')){
    const b=document.createElement('button');
    b.type='button';b.className='wr-summary-toggle';b.textContent='Summary ▾';
    b.onclick=()=>{const open=summary.classList.toggle('summary-expanded');b.textContent=open?'Summary ▴':'Summary ▾'};
    summary.appendChild(b);
  }
}
function ensureDefaults(){
  const editor=main.querySelector('.wr-object-head');
  if(!editor)return;
  const w=document.getElementById('cv3-weight-unit');
  const d=document.getElementById('cv3-dim-unit');
  if(w&&!editor.dataset.nodaraUnitDefaults){
    editor.dataset.nodaraUnitDefaults='1';
    if(w.value!=='KG'){w.value='KG';w.dispatchEvent(new Event('change',{bubbles:true}))}
    setTimeout(()=>{const dim=document.getElementById('cv3-dim-unit');if(dim&&dim.value!=='IN'){dim.value='IN';dim.dispatchEvent(new Event('change',{bubbles:true}))}},0);
  }else if(d&&!editor.dataset.nodaraDimDefault){
    editor.dataset.nodaraDimDefault='1';
    if(d.value!=='IN'){d.value='IN';d.dispatchEvent(new Event('change',{bubbles:true}))}
  }
}
function install(){ensureSummary();ensureDefaults()}
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;install()})}).observe(main,{childList:true,subtree:true});
setTimeout(install,300);
