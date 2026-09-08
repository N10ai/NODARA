import { openWRCreateEditor } from './wr-create-editor.js?v=20260908-native1';

async function openCreatedReceipt(result){
 const id=result?.warehouse_receipt_id||result?.id;
 const mod=await import('./wr-records-unified.js?v=20260908-native1');
 if(id)return mod.warehouseReceiptOpen(id);
 return mod.warehouseReceiptList();
}
async function openEditor(){
 window.nodaraSetActive?.('wr');
 window.__nodaraCargoDraftDetails=null;
 await openWRCreateEditor({onDone:openCreatedReceipt,onCancel:async()=>{const mod=await import('./wr-records-unified.js?v=20260908-native1');return mod.warehouseReceiptList();}});
}
window.nodaraReceive=openEditor;
window.nodaraNewReceipt=openEditor;
window.nodaraOpenNewWR=openEditor;
document.addEventListener('click',e=>{const btn=e.target.closest?.('[data-go="receive"],[data-new-wr],[data-action="new-wr"]');if(!btn)return;e.preventDefault();e.stopImmediatePropagation();openEditor()},true);