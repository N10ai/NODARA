import './wr-mobile-operations-v3.js?v=20260908-ops4';
import './wr-checkin-hotfix.js?v=20260908-ops4';
import './settings-system.js?v=20260908-settings1';
import { openWRCreateEditor } from './wr-create-editor.js?v=20260908-native3';

async function openCreatedReceipt(result){
 const id=result?.warehouse_receipt_id||result?.id;
 const mod=await import('./wr-records-unified.js?v=20260908-native3');
 if(id)return mod.warehouseReceiptOpen(id);
 return mod.warehouseReceiptList();
}
async function openEditor(){
 window.nodaraSetActive?.('wr');
 window.__nodaraCargoDraftDetails=null;
 await openWRCreateEditor({onDone:openCreatedReceipt,onCancel:async()=>{const mod=await import('./wr-records-unified.js?v=20260908-native3');return mod.warehouseReceiptList();}});
}
window.nodaraReceive=openEditor;
window.nodaraNewReceipt=openEditor;
window.nodaraOpenNewWR=openEditor;
document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-go="receive"],[data-new-wr],[data-action="new-wr"]');if(!btn)return;e.preventDefault();e.stopImmediatePropagation();openEditor()},true);