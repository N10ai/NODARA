import './operations-wr-link.js?v=20260904-0315';
import './wr-fast-guidance.js?v=20260906-0128';
import './bulk-record-delete.js?v=20260906-0301';
import './service-contract-clarity.js?v=20260906-2336';
import './wr-completion-actions.js?v=20260906-2355';
import './wr-smart-billing-v2.js?v=20260906-0050';
import './wr-saved-guidance-v2.js?v=20260906-0050';
import './wr-canonical-action-events.js?v=20260906-0050';
import { openWRUnified } from './wr-unified-editor.js?v=20260906-1300';

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
