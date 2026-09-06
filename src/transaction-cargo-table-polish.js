const main=document.getElementById('main');
function apply(){
  for(const ws of main.querySelectorAll('.cargo-ws')){
    const load=ws.querySelector('[data-load-cargo]');
    if(load){load.textContent='＋ Add item';load.title='Choose existing warehouse cargo';}
    ws.querySelectorAll('[data-new-cargo]').forEach(b=>b.style.display='none');
    const head=ws.querySelector('.cargo-ws-head');
    if(head&&!head.querySelector('.cargo-list-mode-note')){const n=document.createElement('small');n.className='muted cargo-list-mode-note';n.textContent='List first · click an item to open details.';head.querySelector('div')?.appendChild(n)}
  }
}
new MutationObserver(()=>requestAnimationFrame(apply)).observe(main,{childList:true,subtree:true});
setTimeout(apply,400);