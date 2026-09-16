const main=document.getElementById('main');
function apply(){
  for(const ws of main.querySelectorAll('.cargo-ws')){
    // Shipment has its own canonical cargo workflow. Never collapse its two
    // distinct actions: Load existing warehouse cargo vs create shipment cargo.
    if(ws.closest('.shipment-native-shell')){
      const load=ws.querySelector('[data-load-cargo]'),fresh=ws.querySelector('[data-new-cargo]');
      if(load){load.textContent='＋ Load existing';load.title='Load cargo already received in a WR or another reusable cargo record';load.style.display='';}
      if(fresh){fresh.textContent='＋ New cargo';fresh.title='Create cargo directly on this shipment';fresh.style.display='';}
      ws.querySelector('.cargo-list-mode-note')?.remove();
      continue;
    }
    const load=ws.querySelector('[data-load-cargo]');
    if(load){load.textContent='＋ Add item';load.title='Choose existing warehouse cargo';}
    ws.querySelectorAll('[data-new-cargo]').forEach(b=>b.style.display='none');
    const head=ws.querySelector('.cargo-ws-head');
    if(head&&!head.querySelector('.cargo-list-mode-note')){const n=document.createElement('small');n.className='muted cargo-list-mode-note';n.textContent='List first · click an item to open details.';head.querySelector('div')?.appendChild(n)}
  }
}
new MutationObserver(()=>requestAnimationFrame(apply)).observe(main,{childList:true,subtree:true});
setTimeout(apply,400);