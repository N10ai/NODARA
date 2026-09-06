const main=document.getElementById('main');
let editor=null,opening=false;
async function modernWR(){
 if(opening)return;
 opening=true;
 try{
  window.nodaraSetActive?.('wr');
  if(!editor){const mod=await import(`./wr-object-editor-v2.js?v=20260906-1245`);editor=mod.createWRObjectEditorV2({main});}
  await editor.start();
  window.dispatchEvent(new CustomEvent('nodara:new-wr-draft'));
 }catch(e){console.error('Could not open modern WR editor',e);alert(e?.message||'Could not open Warehouse Receipt editor.');}
 finally{opening=false}
}
window.nodaraReceive=modernWR;
window.nodaraNewReceipt=modernWR;
window.nodaraOpenNewWR=modernWR;

document.addEventListener('click',e=>{
 const create=e.target.closest?.('[data-create-option="0"],#wr-create-new,#wr-new-from-detail,[data-new-wr],[data-action="new-wr"]');
 if(!create)return;
 e.preventDefault();e.stopImmediatePropagation();modernWR();
},true);

const legacyTitles=new Set(['What arrived?','New warehouse receipt.','How is it packaged?','What is inside?','Review receipt.']);
let queued=false;
new MutationObserver(()=>{if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;const t=main.querySelector('h1.title')?.textContent?.trim();if(t&&legacyTitles.has(t))modernWR()})}).observe(main,{childList:true,subtree:true});
