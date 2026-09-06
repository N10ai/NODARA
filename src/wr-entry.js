import { openWRUnified } from './wr-unified-editor.js?v=20260906-1320';

async function openEditor(){
 window.nodaraSetActive?.('wr');
 window.__nodaraCargoDraftDetails=null;
 await openWRUnified({
  wr:null,
  onDone:result=>window.nodaraWROpen?.(result?.warehouse_receipt_id),
  onCancel:()=>window.nodaraWRList?.()
 });
}
window.nodaraReceive=openEditor;
window.nodaraNewReceipt=openEditor;
window.nodaraOpenNewWR=openEditor;
document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-go="receive"],[data-new-wr],[data-action="new-wr"]');if(!btn)return;e.preventDefault();e.stopImmediatePropagation();openEditor()},true);
